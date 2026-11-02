using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Rectangle maths shared by the planner and the grading pass. Plots, blocks and station
    /// boxes are all rotated rectangles, and the two passes have to agree exactly on where a
    /// rectangle's corners are or the flattened ground will not line up with the plot.
    /// </summary>
    public static class CityGeom
    {
        /// <summary>
        /// The world space axes of a rectangle with the given Unity yaw. Local +X maps to
        /// <paramref name="ax"/>, local +Z maps to <paramref name="az"/>.
        /// </summary>
        public static void Axes(float yawDegrees, out Vector2 ax, out Vector2 az)
        {
            float r = yawDegrees * Mathf.Deg2Rad;
            float c = Mathf.Cos(r), s = Mathf.Sin(r);
            ax = new Vector2(c, -s);
            az = new Vector2(s, c);
        }

        /// <summary>The yaw whose local +Z points along <paramref name="forward"/>.</summary>
        public static float YawFrom(Vector2 forward)
        {
            return Mathf.Atan2(forward.x, forward.y) * Mathf.Rad2Deg;
        }

        /// <summary>Point in a rectangle's local space, in metres from its centre.</summary>
        public static Vector2 ToRectLocal(Vector2 point, Vector2 center, float yawDegrees)
        {
            Vector2 ax, az;
            Axes(yawDegrees, out ax, out az);
            Vector2 d = point - center;
            return new Vector2(Vector2.Dot(d, ax), Vector2.Dot(d, az));
        }

        public static Vector2 FromRectLocal(Vector2 local, Vector2 center, float yawDegrees)
        {
            Vector2 ax, az;
            Axes(yawDegrees, out ax, out az);
            return center + ax * local.x + az * local.y;
        }

        public static bool RectContains(Vector2 point, Vector2 center, Vector2 size, float yawDegrees)
        {
            Vector2 l = ToRectLocal(point, center, yawDegrees);
            return Mathf.Abs(l.x) <= size.x * 0.5f && Mathf.Abs(l.y) <= size.y * 0.5f;
        }

        /// <summary>Axis aligned world bounds of a rotated rectangle, grown by a margin.</summary>
        public static Rect Bounds(Vector2 center, Vector2 size, float yawDegrees, float margin = 0f)
        {
            Vector2 ax, az;
            Axes(yawDegrees, out ax, out az);
            Vector2 ex = ax * (size.x * 0.5f);
            Vector2 ez = az * (size.y * 0.5f);
            float hx = Mathf.Abs(ex.x) + Mathf.Abs(ez.x) + margin;
            float hy = Mathf.Abs(ex.y) + Mathf.Abs(ez.y) + margin;
            return new Rect(center.x - hx, center.y - hy, hx * 2f, hy * 2f);
        }

        public static Rect Encapsulate(Rect a, Rect b)
        {
            float x0 = Mathf.Min(a.xMin, b.xMin);
            float y0 = Mathf.Min(a.yMin, b.yMin);
            float x1 = Mathf.Max(a.xMax, b.xMax);
            float y1 = Mathf.Max(a.yMax, b.yMax);
            return new Rect(x0, y0, x1 - x0, y1 - y0);
        }

        public static Rect Grow(Rect r, float margin)
        {
            return new Rect(r.xMin - margin, r.yMin - margin, r.width + margin * 2f, r.height + margin * 2f);
        }

        /// <summary>Distance from a point to a segment, in metres.</summary>
        public static float DistanceToSegment(Vector2 p, Vector2 a, Vector2 b)
        {
            Vector2 ab = b - a;
            float lenSqr = ab.sqrMagnitude;
            if (lenSqr < 1e-6f) return Vector2.Distance(p, a);
            float t = Mathf.Clamp01(Vector2.Dot(p - a, ab) / lenSqr);
            return Vector2.Distance(p, a + ab * t);
        }
    }
}
