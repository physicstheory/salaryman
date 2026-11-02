using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Where a city is allowed to be. Both the planner and the grading pass ask this, so the
    /// blocks and the graded ground always agree on where the city stops.
    ///
    /// A city stops for real reasons: the ground gets too steep, it runs out of land, it climbs
    /// too high, or it simply peters out. That is why the outline is ragged and why the hills
    /// stay green.
    /// </summary>
    public static class CityFootprint
    {
        /// <summary>1 inside made ground, 0 outside it.</summary>
        public static float Fill(CityLayout layout, Vector2 world)
        {
            if (layout == null) return 0f;
            float best = 0f;
            for (int i = 0; i < layout.fills.Count; i++)
            {
                var f = layout.fills[i];
                Vector2 l = CityGeom.ToRectLocal(world, f.center, f.rotation);
                float dx = Mathf.Abs(l.x) / Mathf.Max(10f, f.size.x * 0.5f);
                float dy = Mathf.Abs(l.y) / Mathf.Max(10f, f.size.y * 0.5f);
                // Square, with a quay edge rather than a beach.
                float v = 1f - KontoNoise.SmoothStep(0.93f, 1.03f, Mathf.Max(dx, dy));
                if (v > best) best = v;
            }
            return best;
        }

        /// <summary>The finished level of the made ground covering a point, if any.</summary>
        public static bool FillHeight(CityLayout layout, Vector2 world, out float height)
        {
            height = 0f;
            if (layout == null) return false;
            float best = 0f;
            for (int i = 0; i < layout.fills.Count; i++)
            {
                var f = layout.fills[i];
                Vector2 l = CityGeom.ToRectLocal(world, f.center, f.rotation);
                float dx = Mathf.Abs(l.x) / Mathf.Max(10f, f.size.x * 0.5f);
                float dy = Mathf.Abs(l.y) / Mathf.Max(10f, f.size.y * 0.5f);
                float v = 1f - KontoNoise.SmoothStep(0.93f, 1.03f, Mathf.Max(dx, dy));
                if (v <= best) continue;
                best = v;
                height = f.height;
            }
            return best > 0.5f;
        }

        /// <summary>0 outside the city, 1 where it is solidly built up.</summary>
        public static float Value(UrbanSiteSpec site, CityFrame frame, CityTerrain terrain, CityLayout layout, int seed, Vector2 world)
        {
            // The core may have been moved off an unbuildable anchor, and the layout records
            // where it actually ended up.
            Vector2 core = layout != null ? frame.ToLocal(layout.coreCenter) : site.coreOffset;
            Vector2 l = frame.ToLocal(world);
            float du = (l.x - core.x) / Mathf.Max(60f, site.alongRadius);
            float dv = (l.y - core.y) / Mathf.Max(60f, site.inlandRadius);
            float d = Mathf.Sqrt(du * du + dv * dv);

            float meanRadius = Mathf.Sqrt(Mathf.Max(60f, site.alongRadius) * Mathf.Max(60f, site.inlandRadius));
            float wobble = KontoNoise.Fbm(world.x / 620f, world.y / 620f, seed + 51001, 3);
            d -= wobble * site.outlineNoise / Mathf.Max(120f, meanRadius);

            float edge = 1f - KontoNoise.SmoothStep(0.86f, 1.02f, d);
            if (edge <= 0f) return 0f;

            float slope = terrain.Slope(world);
            float height = terrain.Height(world);
            float maxSlope = Mathf.Max(0.05f, site.maxBuildSlope);
            float maxAltitude = Mathf.Max(30f, site.maxBuildAltitude);
            float ground = (1f - KontoNoise.SmoothStep(maxSlope * 0.53f, maxSlope, slope))
                         * (1f - KontoNoise.SmoothStep(maxAltitude * 0.58f, maxAltitude, height));
            float land = KontoNoise.SmoothStep(0.30f, 0.80f, terrain.LandMask(world));

            float onLand = Mathf.Min(land, ground);
            float fill = Fill(layout, world);
            return edge * Mathf.Clamp01(Mathf.Max(onLand, fill));
        }
    }
}
