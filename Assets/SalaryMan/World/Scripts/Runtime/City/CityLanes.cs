using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// The road network as something a car can actually drive on.
    ///
    /// The city plan stores a road as a centre line and a half width, which is what you want for
    /// building the ground and nothing like what you want for driving. So this turns each road
    /// into lanes: polylines offset from the centre line, one per lane per direction, each with a
    /// speed limit and an arc length so a vehicle is just a distance along a lane.
    ///
    /// Traffic keeps left, because Konto is Japan. The rule is written once: a lane always sits
    /// to the left of its own direction of travel, and the opposing lanes are made by walking the
    /// same road backwards, which puts them on the other side of the centre line for free.
    ///
    /// Footways come out of the same pass, offset past the kerb, and the crowd walks those.
    /// </summary>
    public sealed class CityLanes
    {
        /// <summary>A path something moves along: a traffic lane or a footway.</summary>
        public sealed class Lane
        {
            public Vector3[] points;
            public float[] arc;         // distance along the lane at each point
            public float length;
            public float speed;         // m/s, the limit
            public int road;
            public RoadClass klass;
            public bool footway;
            /// <summary>0 for a roughly north-south lane, 1 for east-west. Drives the signals.</summary>
            public int axis;

            public void Sample(float s, out Vector3 pos, out Vector3 dir)
            {
                if (points.Length < 2) { pos = points.Length > 0 ? points[0] : Vector3.zero; dir = Vector3.forward; return; }
                s = Mathf.Clamp(s, 0f, length);

                int lo = 0, hi = arc.Length - 1;
                while (lo + 1 < hi)
                {
                    int mid = (lo + hi) >> 1;
                    if (arc[mid] <= s) lo = mid; else hi = mid;
                }
                float seg = arc[lo + 1] - arc[lo];
                float t = seg > 0.0001f ? (s - arc[lo]) / seg : 0f;
                Vector3 a = points[lo], b = points[lo + 1];
                pos = Vector3.Lerp(a, b, t);
                Vector3 d = b - a;
                d.y = 0f;
                dir = d.sqrMagnitude > 0.0001f ? d.normalized : Vector3.forward;
            }
        }

        /// <summary>A signalled crossing, and where each lane has to stop for it.</summary>
        public struct StopLine
        {
            public int lane;
            public float at;            // distance along the lane of the stop line
            public int junction;
        }

        public sealed class Junction
        {
            public Vector3 position;
            public float radius;
            public float phase;         // seconds of offset into the signal cycle
        }

        public readonly List<Lane> driving = new List<Lane>();
        public readonly List<Lane> footways = new List<Lane>();
        public readonly List<Junction> junctions = new List<Junction>();
        /// <summary>Stop lines for a driving lane, indexed by lane, sorted by distance.</summary>
        public readonly List<List<StopLine>> stops = new List<List<StopLine>>();

        public const float LaneWidth = 3.25f;
        /// <summary>The whole cycle, in seconds: one axis green, then the other.</summary>
        public const float SignalCycle = 27f;
        const float Amber = 3.2f;

        public enum Signal { Green = 0, Amber, Red }

        /// <summary>
        /// What this lane's light is showing. The two axes take half the cycle each, and the last
        /// couple of seconds of each half are amber: a car close enough that it cannot stop goes
        /// through, which is both what happens and what stops a queue nosing into a junction it
        /// cannot clear.
        /// </summary>
        public Signal SignalFor(int junction, int axis, float time)
        {
            var j = junctions[junction];
            float t = Mathf.Repeat(time + j.phase, SignalCycle);
            float half = SignalCycle * 0.5f;
            bool firstHalf = t < half;
            if ((axis == 0) != firstHalf) return Signal.Red;
            float into = firstHalf ? t : t - half;
            return into < half - Amber ? Signal.Green : Signal.Amber;
        }

        /// <summary>Seconds until this lane's light turns red, or 0 if it already is.</summary>
        public float TimeToRed(int junction, int axis, float time)
        {
            var j = junctions[junction];
            float t = Mathf.Repeat(time + j.phase, SignalCycle);
            float half = SignalCycle * 0.5f;
            bool firstHalf = t < half;
            if ((axis == 0) != firstHalf) return 0f;
            return (firstHalf ? half : SignalCycle) - t;
        }

        /// <summary>True if this lane may enter the junction at this moment.</summary>
        public bool IsGreen(int junction, int axis, float time)
        {
            return SignalFor(junction, axis, time) == Signal.Green;
        }

        // ------------------------------------------------------------------ building

        public static CityLanes Build(CityLayout layout)
        {
            var lanes = new CityLanes();
            if (layout == null) return lanes;

            for (int i = 0; i < layout.roads.Count; i++)
            {
                var road = layout.roads[i];
                if (road == null || road.elevated || road.points.Count < 2) continue;

                int perSide;
                float limit;
                switch (road.klass)
                {
                    case RoadClass.Arterial: perSide = 2; limit = 15.3f; break;  // 55 km/h
                    case RoadClass.Avenue:   perSide = 2; limit = 12.5f; break;  // 45
                    case RoadClass.Street:   perSide = 1; limit = 8.6f;  break;  // 31
                    case RoadClass.Alley:    perSide = 1; limit = 5.0f;  break;  // 18, and barely
                    default: perSide = 0; limit = 0f; break;                     // promenades, expressways
                }

                // Lanes have to fit between the kerbs. A narrow street gets one each way whatever
                // its class says it wants.
                int fits = Mathf.Max(1, Mathf.FloorToInt(road.halfWidth / LaneWidth));
                perSide = Mathf.Min(perSide, fits);

                for (int dir = 0; dir < 2 && perSide > 0; dir++)
                    for (int k = 0; k < perSide; k++)
                        lanes.driving.Add(MakeLane(road, i, dir == 1, LaneWidth * (k + 0.5f), limit, false));

                if (road.klass == RoadClass.Alley) continue;
                float walk = road.halfWidth + (road.klass == RoadClass.Promenade ? 0f : 2.1f);
                for (int dir = 0; dir < 2; dir++)
                    lanes.footways.Add(MakeLane(road, i, dir == 1, walk, 1.4f, true));
            }

            lanes.FindJunctions(layout);
            lanes.CutStopLines();
            return lanes;
        }

        /// <summary>
        /// One lane: the road's points, walked forwards or backwards, pushed <paramref name="offset"/>
        /// metres to the left of travel. Doing it this way means the keep-left rule is stated once.
        /// </summary>
        static Lane MakeLane(CityRoad road, int roadIndex, bool reversed, float offset, float speed, bool footway)
        {
            int n = road.points.Count;
            var pts = new Vector3[n];
            for (int i = 0; i < n; i++)
            {
                Vector3 p = road.points[reversed ? n - 1 - i : i];

                // Direction at this point, from whichever neighbours exist.
                Vector3 a = road.points[reversed ? Mathf.Min(n - 1, n - 1 - i + 1) : Mathf.Max(0, i - 1)];
                Vector3 b = road.points[reversed ? Mathf.Max(0, n - 1 - i - 1) : Mathf.Min(n - 1, i + 1)];
                Vector3 d = b - a;
                d.y = 0f;
                d = d.sqrMagnitude < 0.0001f ? Vector3.forward : d.normalized;
                Vector3 left = new Vector3(-d.z, 0f, d.x);
                pts[i] = p + left * offset;
            }

            var lane = new Lane
            {
                points = pts,
                arc = new float[n],
                road = roadIndex,
                klass = road.klass,
                speed = speed,
                footway = footway,
            };

            float run = 0f;
            for (int i = 1; i < n; i++)
            {
                Vector3 a = pts[i - 1], b = pts[i];
                run += Mathf.Sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
                lane.arc[i] = run;
            }
            lane.length = run;

            Vector3 first = pts[Mathf.Min(1, n - 1)] - pts[0];
            float yaw = Mathf.Abs(Mathf.Repeat(Mathf.Atan2(first.x, first.z) * Mathf.Rad2Deg, 180f));
            lane.axis = (yaw > 45f && yaw < 135f) ? 1 : 0;
            return lane;
        }

        /// <summary>
        /// Where two roads of consequence cross, found the same cheap way the street furniture
        /// finds it — a coarse grid, and any cell two different roads both land in — so the
        /// signals the props put up and the signals the traffic obeys are the same signals.
        /// </summary>
        void FindJunctions(CityLayout layout)
        {
            const float cell = 26f;
            var seen = new Dictionary<long, int>();
            var taken = new HashSet<long>();

            for (int i = 0; i < layout.roads.Count; i++)
            {
                var road = layout.roads[i];
                if (road.elevated) continue;
                if (road.klass != RoadClass.Arterial && road.klass != RoadClass.Avenue) continue;

                for (int k = 1; k < road.points.Count; k++)
                {
                    Vector3 a = road.points[k - 1], b = road.points[k];
                    float len = Vector2.Distance(new Vector2(a.x, a.z), new Vector2(b.x, b.z));
                    int steps = Mathf.Max(1, Mathf.CeilToInt(len / (cell * 0.5f)));
                    for (int s = 0; s <= steps; s++)
                    {
                        Vector3 p = Vector3.Lerp(a, b, s / (float)steps);
                        long key = ((long)Mathf.FloorToInt(p.x / cell) << 32) ^ (uint)Mathf.FloorToInt(p.z / cell);
                        int other;
                        if (!seen.TryGetValue(key, out other)) { seen[key] = i; continue; }
                        if (other == i || taken.Contains(key)) continue;
                        taken.Add(key);
                        junctions.Add(new Junction
                        {
                            position = p,
                            radius = 13f,
                            // Neighbouring junctions on the same street want different phases, or
                            // the whole city goes green at once and it looks like a parade.
                            phase = KontoNoise.White(7717, Mathf.FloorToInt(p.x / cell), Mathf.FloorToInt(p.z / cell)) * SignalCycle,
                        });
                    }
                }
            }
        }

        /// <summary>For each lane, the distance at which it meets each junction it passes through.</summary>
        void CutStopLines()
        {
            for (int i = 0; i < driving.Count; i++) stops.Add(new List<StopLine>());
            if (junctions.Count == 0) return;

            // Junctions bucketed into a grid, so a lane only tests the ones near it.
            const float cell = 64f;
            var grid = new Dictionary<long, List<int>>();
            for (int j = 0; j < junctions.Count; j++)
            {
                long key = Key(junctions[j].position, cell);
                List<int> bucket;
                if (!grid.TryGetValue(key, out bucket)) { bucket = new List<int>(); grid[key] = bucket; }
                bucket.Add(j);
            }

            var near = new List<int>();
            for (int i = 0; i < driving.Count; i++)
            {
                var lane = driving[i];
                var list = stops[i];
                for (int k = 1; k < lane.points.Length; k++)
                {
                    Vector3 a = lane.points[k - 1], b = lane.points[k];
                    near.Clear();
                    Gather(grid, cell, a, near);
                    Gather(grid, cell, b, near);

                    for (int n = 0; n < near.Count; n++)
                    {
                        int j = near[n];
                        var jn = junctions[j];
                        Vector2 p = new Vector2(jn.position.x, jn.position.z);
                        Vector2 a2 = new Vector2(a.x, a.z), b2 = new Vector2(b.x, b.z);
                        if (CityGeom.DistanceToSegment(p, a2, b2) > jn.radius) continue;

                        // The stop line sits a car's length back from the junction's edge.
                        Vector2 ab = b2 - a2;
                        float segLen = ab.magnitude;
                        if (segLen < 0.001f) continue;
                        float along = Vector2.Dot(p - a2, ab / segLen);
                        float at = lane.arc[k - 1] + Mathf.Clamp(along, 0f, segLen) - jn.radius;
                        if (at < 0f || Already(list, j)) continue;
                        list.Add(new StopLine { lane = i, at = at, junction = j });
                    }
                }
                list.Sort((x, y) => x.at.CompareTo(y.at));
            }
        }

        static bool Already(List<StopLine> list, int junction)
        {
            for (int i = 0; i < list.Count; i++) if (list[i].junction == junction) return true;
            return false;
        }

        static long Key(Vector3 p, float cell)
        {
            return ((long)Mathf.FloorToInt(p.x / cell) << 32) ^ (uint)Mathf.FloorToInt(p.z / cell);
        }

        static void Gather(Dictionary<long, List<int>> grid, float cell, Vector3 p, List<int> into)
        {
            int cx = Mathf.FloorToInt(p.x / cell), cz = Mathf.FloorToInt(p.z / cell);
            for (int dx = -1; dx <= 1; dx++)
                for (int dz = -1; dz <= 1; dz++)
                {
                    List<int> bucket;
                    if (!grid.TryGetValue(((long)(cx + dx) << 32) ^ (uint)(cz + dz), out bucket)) continue;
                    for (int i = 0; i < bucket.Count; i++)
                        if (!into.Contains(bucket[i])) into.Add(bucket[i]);
                }
        }
    }
}
