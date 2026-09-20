using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Where each species grows. The zonation is taken from the real thing: black pine holding
    /// the dune coast, bamboo and maple on damp valley floors, ruler straight sugi plantations
    /// blanketing the lower slopes, natural oak above them, birch thinning out toward the tree
    /// line, then nothing but rock.
    /// </summary>
    public static class VegetationRules
    {
        /// <summary>True if this point falls inside a managed conifer plantation.</summary>
        public static bool IsPlantation(KontoWorldSettings cfg, in SurfaceSample s, out float rowAngle)
        {
            rowAngle = 0f;
            if (cfg.plantationShare <= 0f) return false;
            if (s.Urban > 0.25f) return false;
            if (s.Height > 720f || s.SlopeDegrees > 33f) return false;
            if (s.Terrace > 0.2f || s.River > 0.2f) return false;

            float patch = KontoNoise.Fbm(s.WorldX / 430f, s.WorldZ / 430f, cfg.seed + 33013, 3);
            float gate = Mathf.Lerp(0.55f, -0.45f, Mathf.Clamp01(cfg.plantationShare));
            if (patch < gate) return false;

            // Each block was planted in one go, so the rows all run the same way within it.
            float a = KontoNoise.Fbm(s.WorldX / 900f, s.WorldZ / 900f, cfg.seed + 33029, 2);
            rowAngle = a * Mathf.PI;
            return true;
        }

        /// <summary>
        /// Probability that a tree stands at this point, before the plantation lattice is
        /// applied. Returns 0 on paddy, rock, water, beaches and above the tree line.
        /// </summary>
        public static float CanopyDensity(KontoWorldSettings cfg, in SurfaceSample s)
        {
            // The city first: nothing grows through tarmac, and a park is planted, not wild.
            if (s.Urban > 0.1f)
            {
                switch (s.UrbanGround)
                {
                    case UrbanSurface.Asphalt:
                    case UrbanSurface.Sidewalk:
                    case UrbanSurface.Plaza:
                    case UrbanSurface.Lot:
                    case UrbanSurface.RailBed:
                    case UrbanSurface.Water:
                        return 0f;
                    case UrbanSurface.Park:
                        // Park trees: planted in loose stands, thinner than a forest.
                        return 0.45f * s.Urban * (1f - KontoNoise.SmoothStep(20f, 34f, s.SlopeDegrees));
                    case UrbanSurface.Fill:
                        return 0f;
                }
                if (s.Urban > 0.75f) return 0.05f;
            }

            if (s.Land < 0.985f) return 0f;
            if (s.Height < 2.2f) return 0f;
            if (s.River > 0.3f) return 0f;
            if (s.Terrace > 0.3f) return 0f;
            // Japanese mountains are forested to the point where the rock is too steep to hold
            // soil, and that point is a lot steeper than a gentle reading of "steep" suggests:
            // a 45 degree slope under sugi is ordinary hill country there.
            if (s.SlopeDegrees > 54f) return 0f;

            float snowySide = Mathf.Clamp01(-s.Lateral / 1200f);
            float treeLine = cfg.treeLine - cfg.snowySideBonus * 0.5f * snowySide;
            if (s.Height > treeLine) return 0f;

            // Thins out toward the tree line and on the steepest ground.
            float alt = 1f - KontoNoise.SmoothStep(treeLine - 170f, treeLine, s.Height);
            float steep = 1f - KontoNoise.SmoothStep(40f, 54f, s.SlopeDegrees);

            // Cleared ground: paddy margins, meadow, firebreaks, riverbanks.
            // Clearings are the exception in a country that is two thirds forest, not the rule,
            // so the gate is set where only the deeper troughs of the noise open the canopy.
            float clearing = KontoNoise.Fbm(s.WorldX / 160f, s.WorldZ / 160f, cfg.seed + 34019, 3);
            float open = KontoNoise.SmoothStep(-0.80f, -0.10f, clearing);

            // The flat coastal plains are farmland, not forest.
            float flatFarm = (1f - KontoNoise.SmoothStep(4f, 11f, s.SlopeDegrees))
                           * (1f - KontoNoise.SmoothStep(90f, 220f, s.Height));
            float farmland = 1f - flatFarm * 0.88f;

            // A windbreak strip of pine right on the shore, then open sand.
            float shore = KontoNoise.SmoothStep(18f, 90f, s.CoastDistance);
            // Thins out through the city fringe: allotments, gardens, scrub behind the estates.
            float urban = 1f - Mathf.Clamp01(s.Urban * 1.15f);

            return Mathf.Clamp01(alt * steep * open * farmland * shore * urban);
        }

        /// <summary>Picks a species for a point, given two independent 0..1 random values.</summary>
        public static KontoTreeSpecies PickSpecies(KontoWorldSettings cfg, in SurfaceSample s, bool plantation, float r0)
        {
            if (plantation)
            {
                // Sugi dominates, hinoki takes the drier, steeper blocks.
                float mix = KontoNoise.Fbm(s.WorldX / 380f, s.WorldZ / 380f, cfg.seed + 35023, 2);
                return (mix + (r0 - 0.5f) * 0.3f > 0.12f) ? KontoTreeSpecies.Hinoki : KontoTreeSpecies.Sugi;
            }

            float snowySide = Mathf.Clamp01(-s.Lateral / 1200f);
            float treeLine = cfg.treeLine - cfg.snowySideBonus * 0.5f * snowySide;

            // Subalpine belt.
            if (s.Height > treeLine - 240f)
                return r0 < 0.62f ? KontoTreeSpecies.Shirakaba : KontoTreeSpecies.Sugi;

            // Coastal and dry ridge pine.
            if (s.CoastDistance < 260f || (s.SlopeDegrees > 26f && s.Height < 260f && r0 < 0.35f))
                return KontoTreeSpecies.Matsu;

            // Damp valley floors: bamboo groves and maple along the water.
            if (s.Flow > 0.42f && s.Height < 420f)
            {
                if (r0 < 0.30f) return KontoTreeSpecies.Take;
                if (r0 < 0.58f) return KontoTreeSpecies.Momiji;
                return KontoTreeSpecies.Konara;
            }

            // Everything else is satoyama broadleaf with maple mixed through it.
            if (r0 < 0.60f) return KontoTreeSpecies.Konara;
            if (r0 < 0.78f) return KontoTreeSpecies.Momiji;
            if (r0 < 0.92f) return KontoTreeSpecies.Sugi;
            return KontoTreeSpecies.Matsu;
        }

        /// <summary>Instance counts for each ground detail layer at a point, 0..1 before density scaling.</summary>
        public static void GroundCover(KontoWorldSettings cfg, in SurfaceSample s, float[] cover)
        {
            for (int i = 0; i < cover.Length; i++) cover[i] = 0f;
            if (s.Land < 0.98f || s.Height < 1.6f) return;

            // Hard city surfaces carry nothing; parks and waste ground carry grass.
            if (s.Urban > 0.1f)
            {
                switch (s.UrbanGround)
                {
                    case UrbanSurface.Asphalt:
                    case UrbanSurface.Sidewalk:
                    case UrbanSurface.Plaza:
                    case UrbanSurface.Lot:
                    case UrbanSurface.Fill:
                    case UrbanSurface.RailBed:
                    case UrbanSurface.Water:
                        return;
                }
            }
            if (s.SlopeDegrees > 46f) return;
            // Dwarf bamboo carries on above the tree line, so the ground cover does too.
            if (s.Height > cfg.treeLine + 320f) return;

            float open = 1f - KontoNoise.SmoothStep(26f, 44f, s.SlopeDegrees);
            float notPaddy = 1f - Mathf.Clamp01(s.Terrace * 1.4f);
            float patch = KontoNoise.Fbm(s.WorldX / 65f, s.WorldZ / 65f, cfg.seed + 36011, 3) * 0.5f + 0.5f;

            if (cover.Length > KontoFoliageLibrary.DetailShortGrass)
                cover[KontoFoliageLibrary.DetailShortGrass] = open * notPaddy * patch;

            if (cover.Length > KontoFoliageLibrary.DetailTallGrass)
            {
                float susuki = KontoNoise.SmoothStep(0.35f, 0.75f, patch) * open * notPaddy
                             * (1f - KontoNoise.SmoothStep(cfg.treeLine - 300f, cfg.treeLine, s.Height));
                cover[KontoFoliageLibrary.DetailTallGrass] = susuki * 0.8f;
            }

            if (cover.Length > KontoFoliageLibrary.DetailReeds)
            {
                float wet = Mathf.Clamp01(s.Flow * 1.8f) * (1f - KontoNoise.SmoothStep(8f, 18f, s.SlopeDegrees));
                wet *= 1f - KontoNoise.SmoothStep(0.25f, 0.7f, s.River);   // not in open water
                cover[KontoFoliageLibrary.DetailReeds] = wet * notPaddy;
            }

            if (cover.Length > KontoFoliageLibrary.DetailFern)
            {
                float shade = CanopyDensity(cfg, s);
                cover[KontoFoliageLibrary.DetailFern] = shade * 0.75f * patch;
            }
        }
    }
}
