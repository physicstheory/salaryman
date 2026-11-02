using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// A uniform grid index over the road and rail centre lines, so the block and plot passes
    /// can ask "is anything already running through here?" tens of millions of times without
    /// walking every segment.
    /// </summary>
    public sealed class CitySegmentIndex
    {
        struct Segment
        {
            public Vector2 A, B;
            public float Clearance;     // metres of ground this segment claims either side
        }

        readonly List<Segment> _segments = new List<Segment>();
        readonly Dictionary<int, List<int>> _buckets = new Dictionary<int, List<int>>();
        readonly float _cell;

        public CitySegmentIndex(float cellSize = 96f)
        {
            _cell = Mathf.Max(16f, cellSize);
        }

        public int Count { get { return _segments.Count; } }

        public void Add(Vector2 a, Vector2 b, float clearance)
        {
            if ((b - a).sqrMagnitude < 1e-4f) return;
            int id = _segments.Count;
            _segments.Add(new Segment { A = a, B = b, Clearance = clearance });

            // Register the segment in every bucket its swept bounds touch.
            float pad = clearance + _cell * 0.5f;
            int x0 = Mathf.FloorToInt((Mathf.Min(a.x, b.x) - pad) / _cell);
            int x1 = Mathf.FloorToInt((Mathf.Max(a.x, b.x) + pad) / _cell);
            int y0 = Mathf.FloorToInt((Mathf.Min(a.y, b.y) - pad) / _cell);
            int y1 = Mathf.FloorToInt((Mathf.Max(a.y, b.y) + pad) / _cell);
            for (int y = y0; y <= y1; y++)
            for (int x = x0; x <= x1; x++)
            {
                int key = Key(x, y);
                List<int> bucket;
                if (!_buckets.TryGetValue(key, out bucket))
                {
                    bucket = new List<int>(4);
                    _buckets[key] = bucket;
                }
                bucket.Add(id);
            }
        }

        public void AddPath(List<Vector3> points, float clearance, bool loop)
        {
            if (points == null || points.Count < 2) return;
            for (int i = 1; i < points.Count; i++)
                Add(new Vector2(points[i - 1].x, points[i - 1].z), new Vector2(points[i].x, points[i].z), clearance);
            if (loop)
                Add(new Vector2(points[points.Count - 1].x, points[points.Count - 1].z), new Vector2(points[0].x, points[0].z), clearance);
        }

        int Key(int x, int y) { return (x * 73856093) ^ (y * 19349663); }

        /// <summary>True if the point sits inside any segment's claimed ground, plus an extra margin.</summary>
        public bool Blocked(Vector2 p, float extraMargin = 0f)
        {
            int cx = Mathf.FloorToInt(p.x / _cell);
            int cy = Mathf.FloorToInt(p.y / _cell);
            List<int> bucket;
            if (!_buckets.TryGetValue(Key(cx, cy), out bucket)) return false;

            for (int i = 0; i < bucket.Count; i++)
            {
                var s = _segments[bucket[i]];
                float limit = s.Clearance + extraMargin;
                if (DistanceSqr(p, s.A, s.B) < limit * limit) return true;
            }
            return false;
        }

        /// <summary>True if any part of a rotated rectangle is inside a segment's claimed ground.</summary>
        public bool BlocksRect(Vector2 center, Vector2 size, float rotationDeg, float extraMargin = 0f)
        {
            float rad = rotationDeg * Mathf.Deg2Rad;
            Vector2 ex = new Vector2(Mathf.Cos(rad), Mathf.Sin(rad)) * (size.x * 0.5f);
            Vector2 ey = new Vector2(-Mathf.Sin(rad), Mathf.Cos(rad)) * (size.y * 0.5f);

            // Corners, edge midpoints and the centre. A road narrow enough to thread between
            // these nine points without touching one of them is an alley, and alleys are fine.
            if (Blocked(center, extraMargin)) return true;
            for (int sx = -1; sx <= 1; sx++)
            for (int sy = -1; sy <= 1; sy++)
            {
                if (sx == 0 && sy == 0) continue;
                if (Blocked(center + ex * sx + ey * sy, extraMargin)) return true;
            }
            return false;
        }

        /// <summary>Distance in metres to the nearest indexed segment, or -1 if none is near.</summary>
        public float NearestDistance(Vector2 p, float searchRadius)
        {
            int r = Mathf.Max(1, Mathf.CeilToInt(searchRadius / _cell));
            int cx = Mathf.FloorToInt(p.x / _cell);
            int cy = Mathf.FloorToInt(p.y / _cell);
            float best = -1f;
            for (int y = cy - r; y <= cy + r; y++)
            for (int x = cx - r; x <= cx + r; x++)
            {
                List<int> bucket;
                if (!_buckets.TryGetValue(Key(x, y), out bucket)) continue;
                for (int i = 0; i < bucket.Count; i++)
                {
                    var s = _segments[bucket[i]];
                    float d = Mathf.Sqrt(DistanceSqr(p, s.A, s.B));
                    if (best < 0f || d < best) best = d;
                }
            }
            return best;
        }

        static float DistanceSqr(Vector2 p, Vector2 a, Vector2 b)
        {
            Vector2 ab = b - a;
            float lenSqr = ab.sqrMagnitude;
            if (lenSqr < 1e-6f) return (p - a).sqrMagnitude;
            float t = Mathf.Clamp01(Vector2.Dot(p - a, ab) / lenSqr);
            return (p - (a + ab * t)).sqrMagnitude;
        }
    }
}
