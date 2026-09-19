using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// The bay a city stands on. It is cut into the coastline during the landmass pass, before
    /// any erosion runs, so every later stage - the shelf, the beaches, the rivers finding their
    /// mouths, the sea itself - treats it as part of the coast rather than as a hole punched in
    /// the land afterwards.
    /// </summary>
    public static class CityBay
    {
        /// <summary>Centre of the bay in the city's local frame.</summary>
        public static Vector2 Center(BaySpec bay)
        {
            return new Vector2(bay.alongOffset, bay.inlandReach - bay.depth * 0.5f);
        }

        /// <summary>
        /// How much of the bay covers a point: 0 on dry land, 1 in open water. The mouth is
        /// narrowed by the enclosure setting, which is what makes Tokyo Bay a bay rather than
        /// a bight.
        /// </summary>
        public static float Shape(BaySpec bay, Vector2 local, Vector2 world, int seed)
        {
            if (bay == null || !bay.carve) return 0f;

            Vector2 c = Center(bay);
            float halfDepth = Mathf.Max(60f, bay.depth * 0.5f);
            float vn = Mathf.Clamp((local.y - c.y) / halfDepth, -1.6f, 1.6f);

            // Wide in the middle, pinched at the mouth, tapering at the head.
            float mouth = KontoNoise.SmoothStep(-0.15f, -1.0f, vn);
            float head = KontoNoise.SmoothStep(0.35f, 1.0f, vn);
            float widthFactor = (1f - bay.enclosure * mouth) * (1f - 0.42f * head);
            float halfWidth = Mathf.Max(40f, bay.halfWidth * widthFactor);

            float du = (local.x - c.x) / halfWidth;
            float dv = (local.y - c.y) / halfDepth;
            float d = Mathf.Sqrt(du * du + dv * dv);

            // A shoreline, not an ellipse.
            float wobble = KontoNoise.Fbm(world.x / 380f, world.y / 380f, seed + 61001, 3);
            d -= wobble * bay.shoreNoise / Mathf.Max(120f, bay.halfWidth);

            // Seaward of the mouth the bay simply becomes the sea, so it stays open.
            float open = vn < -1f ? 1f : 0f;
            return Mathf.Max(open * (1f - KontoNoise.SmoothStep(1.15f, 1.5f, Mathf.Abs(du))),
                             1f - KontoNoise.SmoothStep(0.80f, 1.02f, d));
        }

        /// <summary>
        /// Rewrites the coast distance at a point so the bay is water. The value returned is the
        /// metres-inland figure the rest of the landmass pass works in, so a bay behaves exactly
        /// like any other piece of coast: shelf, beach, waves and all.
        /// </summary>
        public static float ApplyToCoastDistance(BaySpec bay, float inland, Vector2 local, Vector2 world, int seed)
        {
            float cut = Shape(bay, local, world, seed);
            if (cut <= 0.001f) return inland;
            return Mathf.Lerp(inland, -bay.waterDistance, cut);
        }

        /// <summary>
        /// A point on the bay's shoreline, at parameter t around the outline, in local
        /// coordinates. Used to run the quay and the waterfront road along the water.
        /// </summary>
        public static Vector2 OutlinePoint(BaySpec bay, float t)
        {
            Vector2 c = Center(bay);
            // Only the landward half of the ellipse is shoreline; the seaward half is the mouth.
            float a = Mathf.Lerp(-Mathf.PI * 0.42f, Mathf.PI * 1.42f, Mathf.Clamp01(t));
            float halfDepth = Mathf.Max(60f, bay.depth * 0.5f);
            float vn = Mathf.Sin(a);
            float mouth = KontoNoise.SmoothStep(-0.15f, -1.0f, vn);
            float head = KontoNoise.SmoothStep(0.35f, 1.0f, vn);
            float halfWidth = Mathf.Max(40f, bay.halfWidth * (1f - bay.enclosure * mouth) * (1f - 0.42f * head));
            return c + new Vector2(Mathf.Cos(a) * halfWidth, vn * halfDepth);
        }
    }
}
