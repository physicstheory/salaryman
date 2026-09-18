using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// The tectonic arc the whole island is built around. Honshu is an island arc: its ranges,
    /// its volcanic front, its basins and its plains all line up with the same curve, so we
    /// model that curve once and anchor every landform to it by (alongT, lateral) instead of
    /// absolute coordinates.
    /// </summary>
    public sealed class IslandArc
    {
        public readonly Vector2[] Points;      // world metres
        public readonly float[] HalfWidths;    // metres
        public readonly float[] Distance;      // cumulative arc length
        public readonly float TotalLength;

        IslandArc(Vector2[] points, float[] halfWidths)
        {
            Points = points;
            HalfWidths = halfWidths;
            Distance = new float[points.Length];
            float d = 0f;
            for (int i = 1; i < points.Length; i++)
            {
                d += Vector2.Distance(points[i - 1], points[i]);
                Distance[i] = d;
            }
            TotalLength = Mathf.Max(d, 1f);
        }

        /// <summary>Builds a smooth, densely sampled arc from the control points in the settings.</summary>
        public static IslandArc Build(KontoWorldSettings s, int samples = 512)
        {
            Vector2 world = s.WorldSize;
            int n = s.arcPoints.Count;
            var ctrl = new Vector2[n];
            var cw = new float[n];
            for (int i = 0; i < n; i++)
            {
                ctrl[i] = new Vector2(s.arcPoints[i].x * world.x, s.arcPoints[i].y * world.y);
                cw[i] = i < s.arcHalfWidths.Count ? s.arcHalfWidths[i] : 900f;
            }

            var pts = new List<Vector2>(samples);
            var widths = new List<float>(samples);
            int segs = Mathf.Max(1, n - 1);
            int perSeg = Mathf.Max(2, samples / segs);

            for (int i = 0; i < segs; i++)
            {
                Vector2 p0 = ctrl[Mathf.Max(i - 1, 0)];
                Vector2 p1 = ctrl[i];
                Vector2 p2 = ctrl[Mathf.Min(i + 1, n - 1)];
                Vector2 p3 = ctrl[Mathf.Min(i + 2, n - 1)];
                float w1 = cw[i];
                float w2 = cw[Mathf.Min(i + 1, n - 1)];

                int count = (i == segs - 1) ? perSeg + 1 : perSeg;
                for (int k = 0; k < count; k++)
                {
                    float t = k / (float)perSeg;
                    pts.Add(CatmullRom(p0, p1, p2, p3, t));
                    widths.Add(Mathf.Lerp(w1, w2, t));
                }
            }
            return new IslandArc(pts.ToArray(), widths.ToArray());
        }

        static Vector2 CatmullRom(Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3, float t)
        {
            float t2 = t * t;
            float t3 = t2 * t;
            return 0.5f * ((2f * p1) + (-p0 + p2) * t + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2 + (-p0 + 3f * p1 - 3f * p2 + p3) * t3);
        }

        public Vector2 PointAt(float t)
        {
            t = Mathf.Clamp01(t);
            float target = t * TotalLength;
            int i = FindSegment(target);
            float segLen = Mathf.Max(Distance[i + 1] - Distance[i], 1e-4f);
            float f = (target - Distance[i]) / segLen;
            return Vector2.Lerp(Points[i], Points[i + 1], f);
        }

        public float HalfWidthAt(float t)
        {
            t = Mathf.Clamp01(t);
            float target = t * TotalLength;
            int i = FindSegment(target);
            float segLen = Mathf.Max(Distance[i + 1] - Distance[i], 1e-4f);
            float f = (target - Distance[i]) / segLen;
            return Mathf.Lerp(HalfWidths[i], HalfWidths[i + 1], f);
        }

        /// <summary>Unit tangent pointing from the north east tip toward the south west tip.</summary>
        public Vector2 TangentAt(float t)
        {
            float target = Mathf.Clamp01(t) * TotalLength;
            int i = FindSegment(target);
            return (Points[i + 1] - Points[i]).normalized;
        }

        /// <summary>Unit normal. Positive lateral values are on the ocean (south east) side.</summary>
        public Vector2 NormalAt(float t)
        {
            Vector2 tan = TangentAt(t);
            return new Vector2(-tan.y, tan.x);
        }

        int FindSegment(float arcLength)
        {
            int lo = 0, hi = Points.Length - 1;
            while (lo < hi - 1)
            {
                int mid = (lo + hi) >> 1;
                if (Distance[mid] <= arcLength) lo = mid; else hi = mid;
            }
            return Mathf.Clamp(lo, 0, Points.Length - 2);
        }

        /// <summary>Turns an (alongT, lateral) anchor into a world position, where lateral is a fraction of the local half width.</summary>
        public Vector2 AnchorToWorld(float alongT, float lateral)
        {
            Vector2 p = PointAt(alongT);
            return p + NormalAt(alongT) * (lateral * HalfWidthAt(alongT));
        }

        /// <summary>
        /// Projects a world position onto the arc. Returns the normalised position along the
        /// arc and writes the signed sideways distance in metres (negative on the sheltered
        /// Sea of Konto side, positive on the ocean side).
        /// </summary>
        public float Project(Vector2 world, out float signedLateral)
        {
            float bestSqr = float.MaxValue;
            int bestSeg = 0;
            float bestF = 0f;

            for (int i = 0; i < Points.Length - 1; i++)
            {
                Vector2 a = Points[i];
                Vector2 ab = Points[i + 1] - a;
                float lenSqr = ab.sqrMagnitude;
                if (lenSqr < 1e-6f) continue;
                float f = Mathf.Clamp01(Vector2.Dot(world - a, ab) / lenSqr);
                Vector2 proj = a + ab * f;
                float dSqr = (world - proj).sqrMagnitude;
                if (dSqr < bestSqr)
                {
                    bestSqr = dSqr;
                    bestSeg = i;
                    bestF = f;
                }
            }

            Vector2 pa = Points[bestSeg];
            Vector2 pb = Points[bestSeg + 1];
            Vector2 tangent = (pb - pa).normalized;
            Vector2 normal = new Vector2(-tangent.y, tangent.x);
            Vector2 closest = Vector2.Lerp(pa, pb, bestF);
            signedLateral = Vector2.Dot(world - closest, normal);

            float arcLen = Distance[bestSeg] + Vector2.Distance(pa, closest);
            return Mathf.Clamp01(arcLen / TotalLength);
        }
    }
}
