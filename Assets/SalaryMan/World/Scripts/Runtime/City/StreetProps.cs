using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// The things between the buildings.
    ///
    /// A street of correct buildings on correct ground still reads as an architectural model
    /// until the clutter goes in, because clutter is what carries scale: a lamp column tells you
    /// how tall the kerb is, a vending machine tells you how wide the pavement is, and the
    /// overhead wiring tells you which country you are in. Japanese streets are strung with it —
    /// the distribution network is almost all overhead — so the poles and the catenaries between
    /// them do more here than anywhere else.
    ///
    /// Everything is emitted into the same <see cref="BuildingMesh"/> surfaces the buildings use,
    /// so props cost no extra materials and no extra draw calls.
    /// </summary>
    public static class StreetProps
    {
        public static void Build(CityLayout layout, BuildingMesh mesh)
        {
            Build(layout, mesh, 0, int.MaxValue, true);
        }

        /// <summary>
        /// Furniture for a slice of the road list, so the factory can chunk a city into meshes
        /// small enough to cull. <paramref name="extras"/> adds the things that are not attached
        /// to one road: signals at junctions, and vending machines against shopfronts.
        /// </summary>
        public static void Build(CityLayout layout, BuildingMesh mesh, int roadFrom, int roadTo, bool extras)
        {
            for (int i = roadFrom; i < layout.roads.Count && i < roadTo; i++)
            {
                var road = layout.roads[i];
                if (road.elevated || road.points.Count < 2) continue;
                switch (road.klass)
                {
                    case RoadClass.Arterial:
                    case RoadClass.Avenue:
                        Kerbs(road, mesh);
                        Along(road, mesh, 26f, Lamp, 8191 + i);
                        Along(road, mesh, 34f, Pole, 8209 + i);
                        break;
                    case RoadClass.Street:
                        Kerbs(road, mesh);
                        Along(road, mesh, 38f, Pole, 8219 + i);
                        break;
                    case RoadClass.Promenade:
                        Along(road, mesh, 22f, Lamp, 8231 + i);
                        break;
                }
            }

            if (!extras) return;

            var junctions = new List<Vector3>();
            FindJunctions(layout, junctions);
            for (int i = 0; i < junctions.Count; i++)
                Signal(junctions[i], mesh, 8237 + i);

            VendingMachines(layout, mesh);
        }

        // ------------------------------------------------------------------ placement

        /// <summary>
        /// Walks a road and drops a prop every <paramref name="spacing"/> metres, alternating
        /// sides, set back onto the footway rather than into the carriageway.
        /// </summary>
        static void Along(CityRoad road, BuildingMesh mesh, float spacing,
            System.Action<Vector3, Vector2, float, BuildingMesh, int> place, int seed)
        {
            float carried = spacing * 0.5f;
            int n = 0;
            for (int i = 1; i < road.points.Count; i++)
            {
                Vector3 a = road.points[i - 1], b = road.points[i];
                Vector2 flat = new Vector2(b.x - a.x, b.z - a.z);
                float len = flat.magnitude;
                if (len < 0.01f) continue;
                Vector2 dir = flat / len;
                Vector2 side = new Vector2(-dir.y, dir.x);

                for (float t = carried; t < len; t += spacing)
                {
                    float f = t / len;
                    Vector3 p = Vector3.Lerp(a, b, f);
                    float sign = (n & 1) == 0 ? 1f : -1f;
                    Vector2 off = side * (sign * (road.halfWidth + 1.5f));
                    place(new Vector3(p.x + off.x, p.y, p.z + off.y), dir, sign, mesh, seed + n * 17);
                    n++;
                }
                carried = (carried - len) % spacing;
                if (carried < 0f) carried += spacing;
            }
        }

        /// <summary>
        /// Where two roads of consequence cross. Found by hashing sample points into a coarse
        /// grid and looking for cells that two different roads both land in, which is cheap and
        /// close enough: a signal twenty metres out of place is a signal nobody questions.
        /// </summary>
        static void FindJunctions(CityLayout layout, List<Vector3> into)
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
                        into.Add(p);
                    }
                }
            }
        }

        // ------------------------------------------------------------------ the props

        /// <summary>Kerb and footway edge. Thin, but it is the line the whole street reads from.</summary>
        static void Kerbs(CityRoad road, BuildingMesh mesh)
        {
            for (int i = 1; i < road.points.Count; i++)
            {
                Vector3 a = road.points[i - 1], b = road.points[i];
                Vector2 flat = new Vector2(b.x - a.x, b.z - a.z);
                float len = flat.magnitude;
                if (len < 0.6f) continue;
                Vector2 dir = flat / len;
                Vector2 side = new Vector2(-dir.y, dir.x);
                Vector2 mid = new Vector2((a.x + b.x) * 0.5f, (a.z + b.z) * 0.5f);
                float y = (a.y + b.y) * 0.5f;
                float yaw = CityGeom.YawFrom(dir);

                for (int s = -1; s <= 1; s += 2)
                {
                    Vector2 c = mid + side * (s * (road.halfWidth + 0.15f));
                    mesh.AddBox(c, new Vector2(0.30f, len * 1.02f), yaw, y - 0.05f, 0.20f,
                        CitySurface.Concrete, 1f);
                }
            }
        }

        /// <summary>A street lamp: column, cranked arm, and a shallow luminaire.</summary>
        static void Lamp(Vector3 p, Vector2 dir, float sign, BuildingMesh mesh, int seed)
        {
            const float h = 8.2f;
            mesh.AddPost(p, 0.11f, h, 8, CitySurface.DarkMetal);
            mesh.AddPost(p + Vector3.up * 0.02f, 0.18f, 0.5f, 8, CitySurface.Concrete);

            Vector2 into = new Vector2(-dir.y, dir.x) * (-sign);
            Vector3 arm = new Vector3(into.x, 0f, into.y) * 1.9f;
            Vector3 top = p + Vector3.up * h;
            mesh.AddBar(top, top + arm + Vector3.up * 0.35f, 0.13f, CitySurface.DarkMetal);
            Vector3 head = top + arm + Vector3.up * 0.35f;
            mesh.AddBox(new Vector2(head.x, head.z), new Vector2(0.95f, 0.42f),
                CityGeom.YawFrom(dir), head.y - 0.22f, 0.22f, CitySurface.TrimMetal, 0.5f);
        }

        /// <summary>
        /// A utility pole: concrete column, two crossarms, a transformer can on the bigger ones,
        /// and the wires running on to wherever the next one is. There is no single object that
        /// says "Japanese street" faster.
        /// </summary>
        static void Pole(Vector3 p, Vector2 dir, float sign, BuildingMesh mesh, int seed)
        {
            float h = 9.5f + KontoNoise.White(seed, 1, 2) * 1.6f;
            mesh.AddPost(p, 0.17f, h, 7, CitySurface.Concrete);

            Vector2 across = new Vector2(-dir.y, dir.x);
            Vector3 A = new Vector3(across.x, 0f, across.y);
            Vector3 D = new Vector3(dir.x, 0f, dir.y);

            for (int k = 0; k < 2; k++)
            {
                float y = p.y + h - 0.5f - k * 1.15f;
                Vector3 c = new Vector3(p.x, y, p.z);
                mesh.AddBar(c - A * 0.85f, c + A * 0.85f, 0.11f, CitySurface.DarkMetal);
                for (int i = -1; i <= 1; i++)
                {
                    Vector3 ins = c + A * (i * 0.72f) + Vector3.up * 0.12f;
                    mesh.AddPost(ins, 0.055f, 0.2f, 5, CitySurface.TrimMetal);
                }
            }

            if (KontoNoise.White(seed + 3, 5, 7) < 0.45f)
            {
                Vector3 can = p + Vector3.up * (h - 3.1f) + A * 0.42f;
                mesh.AddPost(can, 0.34f, 1.15f, 8, CitySurface.TrimMetal);
            }

            // The wires. A shallow sag over a nominal span, both ways, so a run of poles is
            // strung together without the placer having to know about its neighbours.
            const float span = 34f, sag = 0.85f;
            for (int s = -1; s <= 1; s += 2)
            {
                for (int w = -1; w <= 1; w++)
                {
                    Vector3 from = p + Vector3.up * (h - 0.5f) + A * (w * 0.72f);
                    Vector3 to = from + D * (span * 0.5f * s);
                    Vector3 mid = (from + to) * 0.5f - Vector3.up * sag;
                    mesh.AddBar(from, mid, 0.035f, CitySurface.DarkMetal);
                    mesh.AddBar(mid, to, 0.035f, CitySurface.DarkMetal);
                }
            }
        }

        /// <summary>A traffic signal on a mast arm, plus the pedestrian head on the post.</summary>
        static void Signal(Vector3 p, BuildingMesh mesh, int seed)
        {
            float yaw = KontoNoise.White(seed, 2, 3) * 360f;
            Vector2 ax, az;
            CityGeom.Axes(yaw, out ax, out az);
            const float h = 6.4f;
            mesh.AddPost(p, 0.13f, h, 8, CitySurface.DarkMetal);

            Vector3 A = new Vector3(ax.x, 0f, ax.y);
            Vector3 top = p + Vector3.up * h;
            mesh.AddBar(top, top + A * 4.2f, 0.13f, CitySurface.DarkMetal);

            Vector3 head = top + A * 3.6f;
            mesh.AddBox(new Vector2(head.x, head.z), new Vector2(1.15f, 0.34f), yaw, head.y - 0.55f, 0.40f,
                CitySurface.DarkMetal, 0.5f);
            // Pedestrian head, lower down, facing the other way.
            Vector3 ped = p + Vector3.up * 2.9f;
            mesh.AddBox(new Vector2(ped.x, ped.z), new Vector2(0.34f, 0.28f), yaw, ped.y, 0.62f,
                CitySurface.DarkMetal, 0.5f);
        }

        /// <summary>
        /// Vending machines, in ones and twos against a shopfront. Five and a half million of
        /// them in Japan, and every street has some.
        /// </summary>
        static void VendingMachines(CityLayout layout, BuildingMesh mesh)
        {
            for (int i = 0; i < layout.plots.Count; i++)
            {
                var plot = layout.plots[i];
                if (plot.kind != PlotKind.Shophouse && plot.kind != PlotKind.MidRise) continue;
                int sx = Mathf.RoundToInt(plot.center.x), sy = Mathf.RoundToInt(plot.center.y);
                if (KontoNoise.White(6151, sx, sy) > 0.38f) continue;

                Vector2 ax, az;
                CityGeom.Axes(plot.rotation, out ax, out az);
                bool longX = plot.size.x >= plot.size.y;
                Vector2 along = longX ? ax : az, outN = longX ? az : ax;
                float span = longX ? plot.size.x : plot.size.y;
                float half = (longX ? plot.size.y : plot.size.x) * 0.5f;

                int count = 1 + Mathf.RoundToInt(KontoNoise.White(6157, sx, sy) * 2f);
                float t0 = (KontoNoise.White(6163, sx, sy) - 0.5f) * span * 0.6f;
                for (int k = 0; k < count; k++)
                {
                    Vector2 c = plot.center + along * (t0 + k * 0.85f) + outN * (half + 0.45f);
                    mesh.AddBox(c, longX ? new Vector2(0.78f, 0.72f) : new Vector2(0.72f, 0.78f),
                        plot.rotation, plot.groundY, 1.85f, CitySurface.DarkMetal, 1f);
                    // The lit front panel, which is the whole point of them at night.
                    Vector3 N = new Vector3(outN.x, 0f, outN.y);
                    Vector3 A = new Vector3(along.x, 0f, along.y);
                    Vector3 f0 = new Vector3(c.x, plot.groundY + 0.35f, c.y) + N * 0.37f - A * 0.34f;
                    Vector3 f1 = f0 + A * 0.68f;
                    mesh.AddQuad(f0, f1, f1 + Vector3.up * 1.3f, f0 + Vector3.up * 1.3f, N, CitySurface.Signage,
                        new Vector2(0f, 0.4f), new Vector2(0.9f, 0.4f), new Vector2(0.9f, 0.78f), new Vector2(0f, 0.78f));
                }
            }
        }
    }
}
