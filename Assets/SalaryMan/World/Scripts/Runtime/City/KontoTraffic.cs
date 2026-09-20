using System;
using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// The traffic.
    ///
    /// Cars are not simulated across the city — there is no point, because a car three wards away
    /// is not on screen and nobody can tell whether it exists. What matters is that the cars
    /// around the player behave: they keep left, they keep their lane, they keep a gap, they slow
    /// for the car in front and they stop at red lights. So the system keeps a pool of vehicles,
    /// spawns them onto lanes near the player, drives them properly, and recycles them when they
    /// fall behind.
    ///
    /// A vehicle is a distance along a lane, which makes the driving model very small: a leader
    /// gap, a stop line, and an acceleration limit. Everything else is sampling the lane.
    ///
    /// Colour is a property block on the paint submesh, so ninety cars in ninety colours cost the
    /// same materials as one.
    /// </summary>
    [AddComponentMenu("SalaryMan/Konto Traffic")]
    public class KontoTraffic : MonoBehaviour
    {
        [Header("The city")]
        public KontoCityLayoutAsset city;
        [Tooltip("Whoever the traffic should exist around. Left empty, the main camera is used.")]
        public Transform viewer;

        [Header("The fleet")]
        [Tooltip("One entry per baked body. The factory fills this in; each one knows which vehicle it is.")]
        public CityMeshPiece[] variants = new CityMeshPiece[0];
        public VehicleLibrary.VehicleKind[] variantKinds = new VehicleLibrary.VehicleKind[0];

        [Header("How much")]
        [Range(0, 400)] public int maxVehicles = 90;
        [Tooltip("Cars are spawned onto lanes inside this radius, in metres.")]
        public float spawnRadius = 210f;
        [Tooltip("And recycled once they are further away than this.")]
        public float despawnRadius = 300f;
        [Tooltip("Cars nearer than this are never spawned in front of you, which is what makes it look like they were always there.")]
        public float spawnClearance = 55f;

        [Header("Driving")]
        public float acceleration = 2.6f;
        public float braking = 6.5f;
        [Tooltip("Gap kept to the car in front at a standstill, in metres.")]
        public float standingGap = 1.8f;
        [Tooltip("And the seconds of headway kept on top of that when moving.")]
        public float headway = 1.1f;

        // ------------------------------------------------------------------ state

        class Car
        {
            public GameObject go;
            public Transform tr;
            public MeshFilter filter;
            public MeshRenderer renderer;
            public int variant = -1;
            public int lane = -1;
            public float s;         // distance along the lane
            public float v;         // metres per second
            public float half;      // half the body length
            public float top;       // this body's own limit
            public bool active;
        }

        CityLanes _lanes;
        Car[] _pool;
        List<int>[] _byLane;        // car indices on each lane, ascending by distance
        readonly List<int> _nearLanes = new List<int>();
        Bounds[] _laneBounds;
        MaterialPropertyBlock _block;
        float _nextLaneScan;
        float _started;
        bool _reported;
        int _spawnSeed = 1;

        static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
        static readonly int ColorId = Shader.PropertyToID("_Color");

        public int ActiveCount
        {
            get
            {
                int n = 0;
                if (_pool != null) for (int i = 0; i < _pool.Length; i++) if (_pool[i].active) n++;
                return n;
            }
        }

        // ------------------------------------------------------------------ life

        void OnEnable()
        {
            // Every one of these has meant "there is no traffic and nothing said why", so
            // each one says why now.
            if (city == null || city.layout == null)
            {
                Debug.LogWarning("[Konto] " + name + " has no city layout asset, so there will be no "
                    + "traffic. Run Tools > SalaryMan > Add The Traffic And The Crowd.", this);
                enabled = false;
                return;
            }
            if (variants == null || variants.Length == 0)
            {
                Debug.LogWarning("[Konto] " + name + " has no vehicle bodies baked, so there will be no "
                    + "traffic. Run Tools > SalaryMan > Add The Traffic And The Crowd.", this);
                enabled = false;
                return;
            }

            _lanes = CityLanes.Build(city.layout);
            if (_lanes.driving.Count == 0)
            {
                Debug.LogWarning("[Konto] " + city.layout.name + " has " + city.layout.roads.Count
                    + " roads but none of them carry lanes, so there is nowhere to drive.", this);
                enabled = false;
                return;
            }

            _laneBounds = new Bounds[_lanes.driving.Count];
            _byLane = new List<int>[_lanes.driving.Count];
            for (int i = 0; i < _lanes.driving.Count; i++)
            {
                var pts = _lanes.driving[i].points;
                var b = new Bounds(pts[0], Vector3.zero);
                for (int k = 1; k < pts.Length; k++) b.Encapsulate(pts[k]);
                _laneBounds[i] = b;
                _byLane[i] = new List<int>();
            }

            _block = new MaterialPropertyBlock();
            _pool = new Car[maxVehicles];
            for (int i = 0; i < _pool.Length; i++) _pool[i] = MakeCar(i);

            _started = Time.time;
            Debug.Log(string.Format("[Konto] Traffic ready: {0} lanes, {1} junctions, {2} bodies, "
                + "a pool of {3}, spawning within {4:0} m.",
                _lanes.driving.Count, _lanes.junctions.Count, variants.Length, maxVehicles, spawnRadius), this);
        }

        /// <summary>
        /// How far the nearest driveable lane is from a point, and which lane it is. Used to
        /// answer the only question anyone asks when the roads are empty.
        /// </summary>
        public float NearestLane(Vector3 from, out int lane)
        {
            lane = -1;
            if (_lanes == null) return float.MaxValue;
            float best = float.MaxValue;
            for (int i = 0; i < _lanes.driving.Count; i++)
            {
                var pts = _lanes.driving[i].points;
                for (int k = 1; k < pts.Length; k++)
                {
                    float d = CityGeom.DistanceToSegment(new Vector2(from.x, from.z),
                        new Vector2(pts[k - 1].x, pts[k - 1].z), new Vector2(pts[k].x, pts[k].z));
                    if (d >= best) continue;
                    best = d;
                    lane = i;
                }
            }
            return best;
        }

        void OnDisable()
        {
            if (_pool == null) return;
            for (int i = 0; i < _pool.Length; i++)
                if (_pool[i] != null && _pool[i].go != null) DestroyImmediate(_pool[i].go);
            _pool = null;
        }

        Car MakeCar(int index)
        {
            var go = new GameObject("Vehicle " + index);
            go.transform.SetParent(transform, false);
            go.SetActive(false);
            var car = new Car
            {
                go = go,
                tr = go.transform,
                filter = go.AddComponent<MeshFilter>(),
                renderer = go.AddComponent<MeshRenderer>(),
            };
            car.renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            return car;
        }

        // ------------------------------------------------------------------ the frame

        void Update()
        {
            Transform eye = Eye();
            if (eye == null) return;
            float dt = Mathf.Min(Time.deltaTime, 0.1f);
            Vector3 at = eye.position;
            float now = Time.time;

            Recycle(at);
            Drive(dt, now);

            if (now >= _nextLaneScan)
            {
                _nextLaneScan = now + 0.5f;
                ScanLanes(at);
            }
            Spawn(at);

            // If the roads are still empty a few seconds in, say so once, with the reason.
            if (!_reported && now - _started > 4f)
            {
                _reported = true;
                if (ActiveCount == 0)
                {
                    int lane;
                    float d = NearestLane(at, out lane);
                    Debug.LogWarning(string.Format(
                        "[Konto] No traffic has appeared. The nearest road is {0:0} m from {1}, and cars "
                        + "spawn between {2:0} m and {3:0} m away. {4}",
                        d, viewer != null ? viewer.name : "the camera", spawnClearance, spawnRadius,
                        d > spawnRadius ? "Stand nearer a road, or raise Spawn Radius on this component."
                                        : "Check that the vehicle bodies have meshes and materials."), this);
                }
            }
        }

        Transform Eye()
        {
            if (viewer != null) return viewer;
            var cam = Camera.main;
            if (cam != null) viewer = cam.transform;
            else if (!_noEye)
            {
                _noEye = true;
                Debug.LogWarning("[Konto] Traffic has nothing to exist around: there is no camera "
                    + "tagged MainCamera, and no Viewer set on this component.", this);
            }
            return viewer;
        }

        bool _noEye;

        void Recycle(Vector3 at)
        {
            for (int i = 0; i < _pool.Length; i++)
            {
                var car = _pool[i];
                if (!car.active) continue;
                var lane = _lanes.driving[car.lane];
                bool ranOut = car.s >= lane.length - car.half;
                float d = Horizontal(car.tr.position, at);
                if (ranOut || d > despawnRadius) Retire(i);
            }
        }

        void Retire(int index)
        {
            var car = _pool[index];
            if (!car.active) return;
            _byLane[car.lane].Remove(index);
            car.active = false;
            car.lane = -1;
            car.go.SetActive(false);
        }

        /// <summary>
        /// One pass per lane, from the car nearest the end backwards, so every car already knows
        /// where its leader is by the time it is asked to choose a speed.
        /// </summary>
        void Drive(float dt, float now)
        {
            for (int l = 0; l < _byLane.Length; l++)
            {
                var here = _byLane[l];
                if (here.Count == 0) continue;
                var lane = _lanes.driving[l];
                var stops = _lanes.stops[l];

                for (int k = here.Count - 1; k >= 0; k--)
                {
                    var car = _pool[here[k]];
                    float limit = Mathf.Min(lane.speed, car.top);

                    // The car in front.
                    if (k + 1 < here.Count)
                    {
                        var lead = _pool[here[k + 1]];
                        float gap = (lead.s - lead.half) - (car.s + car.half) - standingGap;
                        limit = Mathf.Min(limit, Approach(gap, lead.v, dt));
                    }

                    limit = Mathf.Min(limit, LightLimit(l, car.s, car.half, car.v, now, dt));

                    float want = Mathf.Max(0f, limit);
                    car.v = want > car.v
                        ? Mathf.Min(want, car.v + acceleration * dt)
                        : Mathf.Max(want, car.v - braking * dt);
                    car.s += car.v * dt;

                    Vector3 pos, dir;
                    lane.Sample(car.s, out pos, out dir);
                    car.tr.SetPositionAndRotation(pos, Quaternion.LookRotation(dir, Vector3.up));
                }
            }
        }

        /// <summary>True if a car of this length placed here would be on, or just short of, a
        /// stop line — which is no place to appear from nothing.</summary>
        bool OnAJunction(int lane, float s, float half)
        {
            var stops = _lanes.stops[lane];
            for (int j = 0; j < stops.Count; j++)
                if (Mathf.Abs(stops[j].at - s) < half + 12f) return true;
            return false;
        }

        /// <summary>
        /// What the next set of lights allows. Red is a stop. Amber is a stop if there is room to
        /// stop in and time to clear the line before it turns, and otherwise it is a reason to
        /// keep going, which is what amber is for.
        /// </summary>
        float LightLimit(int lane, float s, float half, float v, float now, float dt)
        {
            var stops = _lanes.stops[lane];
            int axis = _lanes.driving[lane].axis;
            for (int j = 0; j < stops.Count; j++)
            {
                float ahead = stops[j].at - s - half;
                if (ahead < -1f) continue;
                if (ahead > 110f) break;
                var light = _lanes.SignalFor(stops[j].junction, axis, now);
                if (light == CityLanes.Signal.Green) break;
                if (light == CityLanes.Signal.Amber
                    && ahead < Stopping(v)
                    && ahead <= v * _lanes.TimeToRed(stops[j].junction, axis, now) * 0.75f) break;
                return Approach(ahead, 0f, dt);
            }
            return float.MaxValue;
        }

        /// <summary>
        /// The fastest this car may be going if it has <paramref name="gap"/> metres before it
        /// reaches something moving at <paramref name="leadSpeed"/>.
        ///
        /// The rule is that the car must still be able to stop if the thing in front brakes as
        /// hard as it can, which is the only rule that actually keeps cars out of each other.
        /// A frame of it is given away to the fact that this is checked thirty times a second
        /// and not continuously; without that, cars arrive touching.
        /// </summary>
        float Approach(float gap, float leadSpeed, float dt)
        {
            gap -= leadSpeed * dt + 0.6f;
            if (gap <= 0f) return 0f;
            // Only part of the braking is spent on keeping the gap: the rest is the margin that
            // makes the difference between traffic that flows and traffic that touches.
            float v = Mathf.Sqrt(Mathf.Max(0f, leadSpeed * leadSpeed + 1.7f * braking * gap));
            return Mathf.Min(v, gap / Mathf.Max(0.2f, headway) + leadSpeed);
        }

        /// <summary>How much road this car needs to stop from its current speed.</summary>
        float Stopping(float v)
        {
            return v * v / (2f * braking) + v * 0.2f;
        }

        void ScanLanes(Vector3 at)
        {
            _nearLanes.Clear();
            float r = spawnRadius + 30f;
            for (int i = 0; i < _laneBounds.Length; i++)
            {
                var b = _laneBounds[i];
                float dx = Mathf.Max(0f, Mathf.Abs(at.x - b.center.x) - b.extents.x);
                float dz = Mathf.Max(0f, Mathf.Abs(at.z - b.center.z) - b.extents.z);
                if (dx * dx + dz * dz <= r * r) _nearLanes.Add(i);
            }
        }

        void Spawn(Vector3 at)
        {
            if (_nearLanes.Count == 0) return;
            int budget = 4;     // a few a frame: the crowd fills in rather than popping in
            for (int i = 0; i < _pool.Length && budget > 0; i++)
            {
                if (_pool[i].active) continue;
                if (TrySpawn(i, at)) budget--;
            }
        }

        bool TrySpawn(int index, Vector3 at)
        {
            for (int attempt = 0; attempt < 6; attempt++)
            {
                int seed = _spawnSeed++;
                int l = _nearLanes[Mathf.Abs(KontoNoise.Hash(seed, 3, 7)) % _nearLanes.Count];
                var lane = _lanes.driving[l];
                if (lane.length < 30f) continue;

                float s = KontoNoise.White(seed, 11, 13) * (lane.length - 12f) + 6f;
                Vector3 pos, dir;
                lane.Sample(s, out pos, out dir);

                float d = Horizontal(pos, at);
                if (d > spawnRadius || d < spawnClearance) continue;

                int variant = Mathf.Abs(KontoNoise.Hash(seed, 17, 19)) % variants.Length;
                var piece = variants[variant];
                if (!piece.Valid) continue;
                var spec = VehicleLibrary.SpecFor(KindOf(variant));
                float half = spec.length * 0.5f;

                float wanted = Mathf.Min(lane.speed, spec.topSpeed)
                             * Mathf.Lerp(0.6f, 1f, KontoNoise.White(seed, 23, 29));
                float allowed;
                if (!Fits(l, s, half, wanted, out allowed)) continue;
                // Never straddling a stop line, or standing in the middle of a junction.
                if (OnAJunction(l, s, half)) continue;
                // And it arrives at whatever the lights are doing, rather than sailing through
                // a red one because it happened to appear just short of the line. A car that
                // comes in at a red light comes in stopped, at the back of the queue.
                allowed = Mathf.Min(allowed, LightLimit(l, s, half, allowed, Time.time, 1f / 30f));

                var car = _pool[index];
                car.variant = variant;
                car.lane = l;
                car.s = s;
                car.half = half;
                car.top = spec.topSpeed;
                car.v = allowed;
                car.active = true;

                car.filter.sharedMesh = piece.mesh;
                car.renderer.sharedMaterials = piece.materials;
                Paint(car, piece, seed);

                car.tr.SetPositionAndRotation(pos, Quaternion.LookRotation(dir, Vector3.up));
                car.go.SetActive(true);

                var here = _byLane[l];
                int slot = here.Count;
                while (slot > 0 && _pool[here[slot - 1]].s > s) slot--;
                here.Insert(slot, index);
                return true;
            }
            return false;
        }

        VehicleLibrary.VehicleKind KindOf(int variant)
        {
            return variant < variantKinds.Length ? variantKinds[variant] : VehicleLibrary.VehicleKind.Compact;
        }

        /// <summary>
        /// Whether a car this long can appear here at this speed without the next few seconds
        /// being a collision. A gap that merely looks big enough is not enough: the new car has
        /// to be able to stop before whatever is in front of it, and whatever is behind it has to
        /// be able to stop before the new car. <paramref name="allowed"/> comes back as the
        /// fastest it may start at.
        /// </summary>
        bool Fits(int lane, float s, float half, float wanted, out float allowed)
        {
            allowed = wanted;
            var here = _byLane[lane];
            for (int i = 0; i < here.Count; i++)
            {
                var other = _pool[here[i]];
                float gap = Mathf.Abs(other.s - s) - half - other.half;
                if (gap < standingGap + 4f) return false;

                if (other.s > s)
                {
                    // In front: start no faster than the gap to it allows.
                    allowed = Mathf.Min(allowed, Approach(gap - standingGap, other.v, 1f / 30f));
                }
                else if (gap < Stopping(other.v) + standingGap + 2f)
                {
                    // Behind, and closing faster than it could stop. Not here.
                    return false;
                }
            }
            return true;
        }

        /// <summary>
        /// Japanese traffic is overwhelmingly white, silver and black — pearl white most of all —
        /// so the palette is weighted that way and the colours are rare enough to be worth
        /// noticing. Taxis are the exception: they are the livery, and it is not subtle.
        /// </summary>
        void Paint(Car car, CityMeshPiece piece, int seed)
        {
            int slot = piece.IndexOf(CitySurface.CarPaint);
            if (slot < 0) return;

            Color c;
            if (KindOf(car.variant) == VehicleLibrary.VehicleKind.Taxi)
            {
                float t = KontoNoise.White(seed, 31, 37);
                c = t < 0.45f ? new Color(0.06f, 0.07f, 0.09f)
                  : t < 0.75f ? new Color(0.78f, 0.62f, 0.10f)
                  : new Color(0.10f, 0.22f, 0.40f);
            }
            else
            {
                float t = KontoNoise.White(seed, 41, 43);
                if (t < 0.32f) c = new Color(0.90f, 0.90f, 0.89f);          // white
                else if (t < 0.56f) c = new Color(0.62f, 0.64f, 0.66f);     // silver
                else if (t < 0.72f) c = new Color(0.09f, 0.09f, 0.10f);     // black
                else if (t < 0.80f) c = new Color(0.33f, 0.35f, 0.38f);     // gunmetal
                else if (t < 0.87f) c = new Color(0.10f, 0.19f, 0.36f);     // blue
                else if (t < 0.92f) c = new Color(0.45f, 0.08f, 0.09f);     // red
                else if (t < 0.96f) c = new Color(0.16f, 0.30f, 0.24f);     // dark green
                else c = new Color(0.72f, 0.66f, 0.55f);                    // beige, for somebody's parent
            }

            _block.Clear();
            _block.SetColor(BaseColorId, c);
            _block.SetColor(ColorId, c);
            car.renderer.SetPropertyBlock(_block, slot);
        }

#if UNITY_EDITOR
        // Drawn in the scene view so the lane network can be looked at without pressing Play.
        // "Is there traffic in this scene" should not require running the game to answer.
        CityLanes _editorLanes;

        void OnDrawGizmosSelected()
        {
            if (city == null || city.layout == null) return;
            if (_editorLanes == null) _editorLanes = _lanes ?? CityLanes.Build(city.layout);

            var cam = UnityEditor.SceneView.lastActiveSceneView != null
                    ? UnityEditor.SceneView.lastActiveSceneView.camera : null;
            Vector3 at = cam != null ? cam.transform.position
                       : (viewer != null ? viewer.position : transform.position);
            const float range = 320f;

            Gizmos.color = new Color(0.35f, 0.85f, 1f, 0.85f);
            for (int i = 0; i < _editorLanes.driving.Count; i++)
            {
                var pts = _editorLanes.driving[i].points;
                for (int k = 1; k < pts.Length; k++)
                {
                    if (Horizontal(pts[k], at) > range) continue;
                    Gizmos.DrawLine(pts[k - 1] + Vector3.up * 0.3f, pts[k] + Vector3.up * 0.3f);
                }
            }

            Gizmos.color = new Color(1f, 0.75f, 0.2f, 0.9f);
            for (int i = 0; i < _editorLanes.junctions.Count; i++)
            {
                var j = _editorLanes.junctions[i];
                if (Horizontal(j.position, at) > range) continue;
                Gizmos.DrawWireSphere(j.position + Vector3.up * 0.3f, j.radius);
            }
        }
#endif

        static float Horizontal(Vector3 a, Vector3 b)
        {
            float dx = a.x - b.x, dz = a.z - b.z;
            return Mathf.Sqrt(dx * dx + dz * dz);
        }
    }
}
