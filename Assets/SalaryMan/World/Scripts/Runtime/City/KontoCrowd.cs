using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// The crowd.
    ///
    /// Same bargain as the traffic: people exist near the player and nowhere else. A pedestrian
    /// is three rigid pieces and a distance along a footway, and the walk is two leg rotations
    /// and a bob — no skinning, no animator, no state machine. At the distance you see one that
    /// is the whole difference between a city and a model of a city.
    ///
    /// Each person's two cloth surfaces are tinted through a property block, so a street full of
    /// people is four materials and one mesh per body type.
    /// </summary>
    [AddComponentMenu("SalaryMan/Konto Crowd")]
    public class KontoCrowd : MonoBehaviour
    {
        [Header("The city")]
        public KontoCityLayoutAsset city;
        public Transform viewer;

        [Header("The cast")]
        [Tooltip("One entry per baked body. The factory fills this in.")]
        public Body[] bodies = new Body[0];

        [System.Serializable]
        public class Body
        {
            public PedestrianLibrary.PersonKind kind;
            public CityMeshPiece body;
            public CityMeshPiece legLeft;
            public CityMeshPiece legRight;
            public float height = 1.7f;
            public float hipHeight = 0.85f;
            public float pace = 1.4f;
        }

        [Header("How many")]
        [Range(0, 400)] public int maxPeople = 120;
        public float spawnRadius = 120f;
        public float despawnRadius = 180f;
        [Tooltip("Nobody is ever spawned closer than this, so nobody appears out of nothing in front of you.")]
        public float spawnClearance = 22f;

        [Header("The walk")]
        [Tooltip("How far the legs swing, in degrees, at a normal pace.")]
        public float stride = 24f;

        class Person
        {
            public GameObject go;
            public Transform tr, legL, legR;
            public MeshRenderer bodyRenderer, legLRenderer, legRRenderer;
            public int body = -1;
            public int lane = -1;
            public float s, speed, phase, hip;
            public bool active;
        }

        CityLanes _lanes;
        Person[] _pool;
        Bounds[] _laneBounds;
        readonly List<int> _nearLanes = new List<int>();
        MaterialPropertyBlock _block;
        float _nextLaneScan;
        float _started;
        bool _reported;
        int _spawnSeed = 101;

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

        void OnEnable()
        {
            if (city == null || city.layout == null)
            {
                Debug.LogWarning("[Konto] " + name + " has no city layout asset, so there will be no "
                    + "crowd. Run Tools > SalaryMan > Add The Traffic And The Crowd.", this);
                enabled = false;
                return;
            }
            if (bodies == null || bodies.Length == 0)
            {
                Debug.LogWarning("[Konto] " + name + " has no pedestrian bodies baked, so there will be "
                    + "no crowd. Run Tools > SalaryMan > Add The Traffic And The Crowd.", this);
                enabled = false;
                return;
            }

            _lanes = CityLanes.Build(city.layout);
            if (_lanes.footways.Count == 0)
            {
                Debug.LogWarning("[Konto] " + city.layout.name + " has no footways, so there is nowhere "
                    + "to walk.", this);
                enabled = false;
                return;
            }

            _laneBounds = new Bounds[_lanes.footways.Count];
            for (int i = 0; i < _lanes.footways.Count; i++)
            {
                var pts = _lanes.footways[i].points;
                var b = new Bounds(pts[0], Vector3.zero);
                for (int k = 1; k < pts.Length; k++) b.Encapsulate(pts[k]);
                _laneBounds[i] = b;
            }

            _block = new MaterialPropertyBlock();
            _pool = new Person[maxPeople];
            for (int i = 0; i < _pool.Length; i++) _pool[i] = Make(i);

            _started = Time.time;
            Debug.Log(string.Format("[Konto] Crowd ready: {0} footways, {1} bodies, a pool of {2}, "
                + "spawning within {3:0} m.", _lanes.footways.Count, bodies.Length, maxPeople, spawnRadius), this);
        }

        /// <summary>How far the nearest footway is from a point.</summary>
        public float NearestFootway(Vector3 from)
        {
            if (_lanes == null) return float.MaxValue;
            float best = float.MaxValue;
            for (int i = 0; i < _lanes.footways.Count; i++)
            {
                var pts = _lanes.footways[i].points;
                for (int k = 1; k < pts.Length; k++)
                    best = Mathf.Min(best, CityGeom.DistanceToSegment(new Vector2(from.x, from.z),
                        new Vector2(pts[k - 1].x, pts[k - 1].z), new Vector2(pts[k].x, pts[k].z)));
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

        Person Make(int index)
        {
            var go = new GameObject("Pedestrian " + index);
            go.transform.SetParent(transform, false);
            go.SetActive(false);
            var p = new Person { go = go, tr = go.transform };

            go.AddComponent<MeshFilter>();
            p.bodyRenderer = go.AddComponent<MeshRenderer>();

            p.legL = NewLeg(go.transform, "Leg L", out p.legLRenderer);
            p.legR = NewLeg(go.transform, "Leg R", out p.legRRenderer);
            return p;
        }

        static Transform NewLeg(Transform parent, string name, out MeshRenderer renderer)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>();
            renderer = go.AddComponent<MeshRenderer>();
            return go.transform;
        }

        void Update()
        {
            Transform eye = Eye();
            if (eye == null) return;
            float dt = Mathf.Min(Time.deltaTime, 0.1f);
            Vector3 at = eye.position;

            Walk(dt, at);

            if (Time.time >= _nextLaneScan)
            {
                _nextLaneScan = Time.time + 0.5f;
                ScanLanes(at);
            }
            Spawn(at);

            if (!_reported && Time.time - _started > 4f)
            {
                _reported = true;
                if (ActiveCount == 0)
                {
                    float d = NearestFootway(at);
                    Debug.LogWarning(string.Format(
                        "[Konto] Nobody has appeared. The nearest footway is {0:0} m away, and people "
                        + "spawn between {1:0} m and {2:0} m. {3}", d, spawnClearance, spawnRadius,
                        d > spawnRadius ? "Stand nearer a street, or raise Spawn Radius on this component."
                                        : "Check that the pedestrian bodies have meshes and materials."), this);
                }
            }
        }

        Transform Eye()
        {
            if (viewer != null) return viewer;
            var cam = Camera.main;
            if (cam != null) viewer = cam.transform;
            return viewer;
        }

        void Walk(float dt, Vector3 at)
        {
            for (int i = 0; i < _pool.Length; i++)
            {
                var p = _pool[i];
                if (!p.active) continue;
                var lane = _lanes.footways[p.lane];

                p.s += p.speed * dt;
                if (p.s >= lane.length - 1f || Horizontal(p.tr.position, at) > despawnRadius)
                {
                    p.active = false;
                    p.go.SetActive(false);
                    continue;
                }

                Vector3 pos, dir;
                lane.Sample(p.s, out pos, out dir);

                // One full stride per two steps: the phase is in radians and the legs are
                // opposite, which is all a walk is at this distance.
                p.phase += p.speed / Mathf.Max(0.4f, p.hip) * dt;
                float swing = Mathf.Sin(p.phase) * stride * Mathf.Clamp(p.speed / 1.4f, 0.55f, 1.3f);
                float bob = Mathf.Abs(Mathf.Cos(p.phase)) * p.hip * 0.022f;

                p.tr.SetPositionAndRotation(
                    new Vector3(pos.x, pos.y + p.hip + bob, pos.z),
                    Quaternion.LookRotation(dir, Vector3.up));
                p.legL.localRotation = Quaternion.Euler(swing, 0f, 0f);
                p.legR.localRotation = Quaternion.Euler(-swing, 0f, 0f);
            }
        }

        void ScanLanes(Vector3 at)
        {
            _nearLanes.Clear();
            float r = spawnRadius + 20f;
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
            int budget = 6;
            for (int i = 0; i < _pool.Length && budget > 0; i++)
            {
                if (_pool[i].active) continue;
                if (TrySpawn(i, at)) budget--;
            }
        }

        bool TrySpawn(int index, Vector3 at)
        {
            for (int attempt = 0; attempt < 5; attempt++)
            {
                int seed = _spawnSeed++;
                int l = _nearLanes[Mathf.Abs(KontoNoise.Hash(seed, 5, 9)) % _nearLanes.Count];
                var lane = _lanes.footways[l];
                if (lane.length < 14f) continue;

                float s = KontoNoise.White(seed, 13, 17) * (lane.length - 6f) + 3f;
                Vector3 pos, dir;
                lane.Sample(s, out pos, out dir);
                float d = Horizontal(pos, at);
                if (d > spawnRadius || d < spawnClearance) continue;

                int b = Mathf.Abs(KontoNoise.Hash(seed, 19, 23)) % bodies.Length;
                var body = bodies[b];
                if (body == null || body.body == null || !body.body.Valid) continue;

                var p = _pool[index];
                p.body = b;
                p.lane = l;
                p.s = s;
                p.hip = body.hipHeight;
                p.speed = body.pace * Mathf.Lerp(0.85f, 1.15f, KontoNoise.White(seed, 29, 31));
                p.phase = KontoNoise.White(seed, 37, 41) * 6.2831853f;
                p.active = true;

                p.go.GetComponent<MeshFilter>().sharedMesh = body.body.mesh;
                p.bodyRenderer.sharedMaterials = body.body.materials;
                if (body.legLeft != null && body.legLeft.Valid)
                {
                    p.legL.GetComponent<MeshFilter>().sharedMesh = body.legLeft.mesh;
                    p.legLRenderer.sharedMaterials = body.legLeft.materials;
                }
                if (body.legRight != null && body.legRight.Valid)
                {
                    p.legR.GetComponent<MeshFilter>().sharedMesh = body.legRight.mesh;
                    p.legRRenderer.sharedMaterials = body.legRight.materials;
                }

                Dress(p, body, seed);
                p.tr.SetPositionAndRotation(new Vector3(pos.x, pos.y + p.hip, pos.z),
                    Quaternion.LookRotation(dir, Vector3.up));
                p.go.SetActive(true);
                return true;
            }
            return false;
        }

        /// <summary>The two cloth surfaces, tinted per person.</summary>
        void Dress(Person p, Body body, int seed)
        {
            Color top, bottom;
            PedestrianLibrary.Colours(body.kind, seed, out top, out bottom);

            Tint(p.bodyRenderer, body.body, CitySurface.ClothTop, top);
            Tint(p.bodyRenderer, body.body, CitySurface.ClothBottom, bottom);
            // The legs are their own meshes, and would otherwise be wearing different trousers.
            if (body.legLeft != null && body.legLeft.Valid)
                Tint(p.legLRenderer, body.legLeft, CitySurface.ClothBottom, bottom);
            if (body.legRight != null && body.legRight.Valid)
                Tint(p.legRRenderer, body.legRight, CitySurface.ClothBottom, bottom);
        }

        void Tint(MeshRenderer renderer, CityMeshPiece piece, CitySurface surface, Color c)
        {
            int slot = piece.IndexOf(surface);
            if (slot < 0) return;
            _block.Clear();
            _block.SetColor(BaseColorId, c);
            _block.SetColor(ColorId, c);
            renderer.SetPropertyBlock(_block, slot);
        }

#if UNITY_EDITOR
        CityLanes _editorLanes;

        void OnDrawGizmosSelected()
        {
            if (city == null || city.layout == null) return;
            if (_editorLanes == null) _editorLanes = _lanes ?? CityLanes.Build(city.layout);

            var cam = UnityEditor.SceneView.lastActiveSceneView != null
                    ? UnityEditor.SceneView.lastActiveSceneView.camera : null;
            Vector3 at = cam != null ? cam.transform.position
                       : (viewer != null ? viewer.position : transform.position);

            Gizmos.color = new Color(0.55f, 1f, 0.6f, 0.8f);
            for (int i = 0; i < _editorLanes.footways.Count; i++)
            {
                var pts = _editorLanes.footways[i].points;
                for (int k = 1; k < pts.Length; k++)
                {
                    if (Horizontal(pts[k], at) > 260f) continue;
                    Gizmos.DrawLine(pts[k - 1] + Vector3.up * 0.2f, pts[k] + Vector3.up * 0.2f);
                }
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
