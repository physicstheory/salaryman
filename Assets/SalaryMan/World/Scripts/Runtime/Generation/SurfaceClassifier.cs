using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>Terrain layer slots, in the order the builder creates them.</summary>
    public static class KontoLayer
    {
        public const int Sand = 0;          // beaches and the dune coast
        public const int Gravel = 1;        // river shingle and braided beds
        public const int PaddySoil = 2;     // alluvial mud, flat paddy and terraces
        public const int Meadow = 3;        // short grass, embankments, satoyama clearings
        public const int ForestFloor = 4;   // dark leaf litter and moss under the canopy
        public const int Rock = 5;          // exposed bedrock on steep ground
        public const int Scree = 6;         // alpine talus above the tree line
        public const int Snow = 7;
        public const int Asphalt = 8;       // carriageway
        public const int Concrete = 9;      // graded building plots, made ground, quays
        public const int Paving = 10;       // footways, plazas, station fronts
        public const int Count = 11;
    }

    /// <summary>Everything known about one point on the ground.</summary>
    public struct SurfaceSample
    {
        public float WorldX, WorldZ;
        public float Height;         // metres above sea level
        public float SlopeTan;       // gradient magnitude
        public float SlopeDegrees;
        public float Flow;           // 0..1 log discharge
        public float River;          // 0..1 channel mask
        public float Land;           // 0..1 land mask
        public float CoastDistance;  // metres inland
        public float Lateral;        // signed metres from the island axis, negative on the snowy side
        public float Terrace;        // 0..1 rice terrace mask
        public float Urban;          // 0..1 how engineered the ground is
        public UrbanSurface UrbanGround;   // what the city laid down here
    }

    /// <summary>
    /// Decides what the ground is made of and what grows on it. The zoning follows Japan:
    /// pine on the sand, paddy on every flat scrap of valley floor, dense cedar plantation on
    /// the lower slopes, broadleaf above it, then birch, then scree and snow on the tops.
    /// </summary>
    public static class SurfaceClassifier
    {
        public static SurfaceSample Sample(KontoWorldData data, float worldX, float worldZ)
        {
            var s = new SurfaceSample();
            s.WorldX = worldX;
            s.WorldZ = worldZ;
            s.Height = data.SampleHeight(worldX, worldZ);
            s.SlopeTan = data.SampleSlope(worldX, worldZ);
            s.SlopeDegrees = Mathf.Atan(s.SlopeTan) * Mathf.Rad2Deg;
            s.Flow = data.SampleFlow(worldX, worldZ);
            s.River = data.SampleRiver(worldX, worldZ);
            s.Land = data.SampleLandMask(worldX, worldZ);
            s.CoastDistance = data.SampleCoastDistance(worldX, worldZ);
            s.Lateral = data.SampleArcLateral(worldX, worldZ);
            s.Terrace = data.SampleTerrace(worldX, worldZ);
            s.Urban = data.SampleUrban(worldX, worldZ);
            s.UrbanGround = s.Urban > 0.02f ? data.SampleUrbanSurface(worldX, worldZ) : UrbanSurface.None;
            return s;
        }

        /// <summary>Fills a normalised set of terrain layer weights. The array must hold KontoLayer.Count entries.</summary>
        public static void Classify(KontoWorldSettings cfg, in SurfaceSample s, float[] weights)
        {
            for (int i = 0; i < KontoLayer.Count; i++) weights[i] = 0f;

            int seed = cfg.seed;
            // Break every threshold with noise so no boundary is a clean contour line.
            float n1 = KontoNoise.Fbm(s.WorldX / 90f, s.WorldZ / 90f, seed + 21001, 3);
            float n2 = KontoNoise.Fbm(s.WorldX / 240f, s.WorldZ / 240f, seed + 21013, 3);
            float n3 = KontoNoise.Fbm(s.WorldX / 27f, s.WorldZ / 27f, seed + 21031, 2);

            float h = s.Height + n1 * 2.4f;
            float slopeDeg = s.SlopeDegrees + n3 * 4.5f;

            // The Sea of Konto side is the snowy side. On Honshu the north west coast gets
            // metres of snow while the Pacific side stays dry and sunny all winter.
            float snowySide = Mathf.Clamp01(-s.Lateral / 1200f);
            float snowLine = cfg.snowLine - cfg.snowySideBonus * snowySide + n2 * 55f;
            float treeLine = cfg.treeLine - cfg.snowySideBonus * 0.5f * snowySide + n2 * 45f;

            // --- bare ground -------------------------------------------------------------
            float rock = KontoNoise.SmoothStep(cfg.rockSlopeAngle - 7f, cfg.rockSlopeAngle + 6f, slopeDeg);
            weights[KontoLayer.Rock] = rock;

            float alpine = KontoNoise.SmoothStep(treeLine - 120f, treeLine + 60f, h);
            weights[KontoLayer.Scree] = alpine * (1f - rock * 0.55f) * KontoNoise.SmoothStep(12f, 30f, slopeDeg);

            // Snow does not sit on near vertical rock; it streaks and falls off.
            float snow = KontoNoise.SmoothStep(snowLine, snowLine + 140f, h) * (1f - KontoNoise.SmoothStep(46f, 62f, slopeDeg));
            weights[KontoLayer.Snow] = snow;

            // --- water margins -----------------------------------------------------------
            float beach = (1f - KontoNoise.SmoothStep(cfg.beachHeight, cfg.beachHeight + 3.5f, h))
                        * (1f - KontoNoise.SmoothStep(18f, 34f, slopeDeg));
            // Wide sand on the sheltered dune coast, shingle and rock on the ria coast.
            float sandBias = Mathf.Lerp(0.55f, 1f, Mathf.Clamp01(-s.Lateral / 900f + 0.5f));
            weights[KontoLayer.Sand] = beach * sandBias;

            float shingle = Mathf.Max(
                s.River * (1f - KontoNoise.SmoothStep(14f, 26f, slopeDeg)),
                KontoNoise.SmoothStep(0.55f, 0.85f, s.Flow) * (1f - KontoNoise.SmoothStep(8f, 20f, slopeDeg)));
            shingle = Mathf.Max(shingle, beach * (1f - sandBias));
            weights[KontoLayer.Gravel] = shingle;

            // --- worked ground -----------------------------------------------------------
            // Paddy covers terraces and any flat, low, wet ground: the coastal plains and the
            // flood plain strips along the valley floors.
            float flat = 1f - KontoNoise.SmoothStep(3.5f, 9f, slopeDeg);
            float lowland = 1f - KontoNoise.SmoothStep(cfg.terraceMaxAltitude * 0.8f, cfg.terraceMaxAltitude * 1.4f, h);
            float wet = Mathf.Clamp01(s.Flow * 2.2f + 0.35f);
            float paddy = Mathf.Max(s.Terrace, flat * lowland * wet * KontoNoise.SmoothStep(-0.25f, 0.2f, n2));
            paddy *= KontoNoise.SmoothStep(1.5f, 5f, h);        // not below the tide line
            paddy *= 1f - s.River;                               // not in the channel itself
            weights[KontoLayer.PaddySoil] = paddy;

            // --- vegetation cover --------------------------------------------------------
            float belowTree = 1f - KontoNoise.SmoothStep(treeLine - 80f, treeLine + 40f, h);
            float canopy = belowTree * (1f - KontoNoise.SmoothStep(cfg.rockSlopeAngle - 4f, cfg.rockSlopeAngle + 10f, slopeDeg));
            float meadowBias = KontoNoise.SmoothStep(-0.05f, 0.35f, n2) * (1f - KontoNoise.SmoothStep(18f, 32f, slopeDeg));

            weights[KontoLayer.Meadow] = canopy * Mathf.Lerp(0.18f, 0.8f, meadowBias);
            weights[KontoLayer.ForestFloor] = canopy * Mathf.Lerp(0.85f, 0.25f, meadowBias) + 0.08f;

            // --- resolve -----------------------------------------------------------------
            // Hard surfaces win over soft ones rather than averaging into mud.
            float hard = Mathf.Clamp01(weights[KontoLayer.Rock] + weights[KontoLayer.Scree] + weights[KontoLayer.Snow]);
            weights[KontoLayer.Meadow] *= 1f - hard;
            weights[KontoLayer.ForestFloor] *= 1f - hard;
            weights[KontoLayer.PaddySoil] *= 1f - hard;

            float wetSurface = Mathf.Clamp01(weights[KontoLayer.Sand] + weights[KontoLayer.Gravel]);
            weights[KontoLayer.Meadow] *= 1f - wetSurface;
            weights[KontoLayer.ForestFloor] *= 1f - wetSurface;
            weights[KontoLayer.PaddySoil] *= 1f - wetSurface * 0.8f;

            // Underwater ground is sand and gravel, never grass.
            if (s.Land < 0.999f || s.Height < 0f)
            {
                float submerged = 1f - Mathf.Clamp01(s.Land);
                submerged = Mathf.Max(submerged, 1f - KontoNoise.SmoothStep(-2.5f, 0.5f, s.Height));
                for (int i = 0; i < KontoLayer.Count; i++)
                {
                    if (i == KontoLayer.Sand || i == KontoLayer.Gravel) continue;
                    weights[i] *= 1f - submerged;
                }
                weights[KontoLayer.Sand] = Mathf.Max(weights[KontoLayer.Sand], submerged * 0.65f * sandBias);
                weights[KontoLayer.Gravel] = Mathf.Max(weights[KontoLayer.Gravel], submerged * 0.5f * (1f - sandBias));
            }

            ApplyUrban(in s, weights);

            float total = 0f;
            for (int i = 0; i < KontoLayer.Count; i++) total += weights[i];
            if (total < 1e-4f)
            {
                weights[KontoLayer.ForestFloor] = 1f;
                return;
            }
            float inv = 1f / total;
            for (int i = 0; i < KontoLayer.Count; i++) weights[i] *= inv;
        }

        /// <summary>
        /// Lays the city's own surfaces over the natural ones. Tarmac, concrete and paving win
        /// outright where they exist; a park or a vacant lot keeps the ground it had, minus the
        /// rice paddy, because nobody grows rice between two office blocks.
        /// </summary>
        static void ApplyUrban(in SurfaceSample s, float[] weights)
        {
            if (s.Urban <= 0.02f) return;
            if (weights.Length <= KontoLayer.Paving) return;

            int layer;
            float strength;
            switch (s.UrbanGround)
            {
                case UrbanSurface.Asphalt:
                    layer = KontoLayer.Asphalt; strength = 1f; break;
                case UrbanSurface.Sidewalk:
                case UrbanSurface.Plaza:
                    layer = KontoLayer.Paving; strength = 1f; break;
                case UrbanSurface.Lot:
                    layer = KontoLayer.Concrete; strength = 0.92f; break;
                case UrbanSurface.Fill:
                    layer = KontoLayer.Concrete; strength = 0.8f; break;
                case UrbanSurface.RailBed:
                    layer = KontoLayer.Gravel; strength = 0.95f; break;
                case UrbanSurface.Park:
                    layer = KontoLayer.Meadow; strength = 0.55f; break;
                case UrbanSurface.Water:
                    return;         // river beds, docks and the moat keep their own bed
                default:
                    // Inside the city outline but not built on: yards, vacant lots, verges.
                    layer = KontoLayer.Meadow; strength = 0.3f; break;
            }

            float blend = Mathf.Clamp01(s.Urban * strength);
            for (int i = 0; i < KontoLayer.Count; i++)
            {
                weights[i] *= 1f - blend;
            }
            weights[layer] += blend;

            // Even fresh tarmac is not perfectly uniform: patches, repairs, dust in the gutter.
            if (layer == KontoLayer.Asphalt || layer == KontoLayer.Paving)
            {
                float wear = KontoNoise.Fbm(s.WorldX / 18f, s.WorldZ / 18f, 22013, 2) * 0.5f + 0.5f;
                float dust = blend * 0.10f * wear;
                weights[layer] -= dust;
                weights[KontoLayer.Concrete] += dust;
            }
        }
    }
}
