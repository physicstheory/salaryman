using System;
using System.Diagnostics;
using System.Threading.Tasks;
using UnityEngine;
using Debug = UnityEngine.Debug;

namespace SalaryMan.World
{
    /// <summary>
    /// Runs the whole build of Konto, in the order the real processes happen: the island is
    /// uplifted along its arc, volcanoes are stacked on top, then rain and gravity take it
    /// apart again, rivers find their way to the sea, and finally people cut terraces into
    /// the lower slopes.
    /// </summary>
    public static class KontoWorldGenerator
    {
        public static KontoWorldData Generate(KontoWorldSettings settings, Action<string, float> progress = null)
        {
            if (settings == null) throw new ArgumentNullException("settings");
            var sw = Stopwatch.StartNew();

            int w = settings.WorkingWidth;
            int h = settings.WorkingHeight;

            Step(progress, "Laying out the island arc", 0.02f);
            var ctx = LandmassBuilder.BuildContext(settings, w, h);

            Step(progress, "Uplifting ranges and volcanoes", 0.10f);
            var height = LandmassBuilder.BuildBaseRelief(ctx);

            Step(progress, "Settling slopes", 0.22f);
            ThermalErosion.Run(height, ctx.CellSize, settings.talusAngle + 6f, Mathf.Max(4, settings.thermalIterations / 3), ctx.LandMask);

            Step(progress, "Raining on Konto", 0.30f);
            HydraulicErosion.Run(height, ctx, settings, t => Step(progress, "Raining on Konto", 0.30f + t * 0.32f));

            Step(progress, "Settling slopes", 0.63f);
            ThermalErosion.Run(height, ctx.CellSize, settings.talusAngle, settings.thermalIterations, ctx.LandMask);

            // Elevation is normalised before the water runs, not after: lake and river surface
            // heights are recorded in metres, and rescaling the land afterwards would leave
            // every one of them floating above or sunk below its own valley.
            Step(progress, "Normalising elevation", 0.66f);
            float highest = ClampToRange(height, settings);

            Step(progress, "Trimming the coast", 0.68f);
            PolishCoast(height, ctx);

            Step(progress, "Routing water", 0.70f);
            var water = HydrologyPass.Run(height, ctx, settings, (msg, t) => Step(progress, msg, 0.70f + t * 0.18f));

            Step(progress, "Measuring slopes", 0.90f);
            var slope = BuildSlopeField(height, ctx.CellSize);

            Step(progress, "Cutting rice terraces", 0.94f);
            var terraceMask = BuildTerraceMask(height, slope, ctx, water, settings);

            var data = new KontoWorldData
            {
                Settings = settings,
                Land = ctx,
                Water = water,
                Height = height,
                Slope = slope,
                TerraceMask = terraceMask,
                HighestPoint = highest,
            };

            Step(progress, "World generated", 1f);
            Debug.Log(string.Format("[Konto] Generated {0} x {1} m island at {2} x {3} working resolution in {4:0.0} s. Highest point {5:0} m, {6} lakes.",
                settings.WorldSize.x, settings.WorldSize.y, w, h, sw.Elapsed.TotalSeconds, highest, water.Lakes.Count));
            return data;
        }

        static void Step(Action<string, float> progress, string message, float t)
        {
            if (progress != null) progress(message, t);
        }

        /// <summary>
        /// Softens the sea bed and makes sure the shoreline itself is a gentle wedge rather than
        /// a cliff wherever the coast is not meant to be cliffed.
        /// </summary>
        static void PolishCoast(Field2D h, LandmassContext ctx)
        {
            var smooth = h.Clone();
            smooth.Blur(2, 1);
            Parallel.For(0, h.Data.Length, i =>
            {
                float inland = ctx.CoastDistance.Data[i];
                // Blend toward the smoothed version in a band either side of the waterline.
                float band = 1f - Mathf.Clamp01(Mathf.Abs(inland) / 120f);
                if (band <= 0f) return;
                h.Data[i] = Mathf.Lerp(h.Data[i], smooth.Data[i], band * 0.6f);
            });
        }

        static Field2D BuildSlopeField(Field2D h, float cellSize)
        {
            var slope = new Field2D(h.Width, h.Height);
            Parallel.For(0, h.Height, y =>
            {
                for (int x = 0; x < h.Width; x++) slope[x, y] = h.SlopeAt(x, y, cellSize);
            });
            return slope;
        }

        /// <summary>
        /// Works out where rice terraces belong: low, gentle ground near a valley floor, cut in
        /// patches rather than spread evenly, and never on the flat coastal plains where paddies
        /// are laid out flat instead of stepped.
        /// </summary>
        static Field2D BuildTerraceMask(Field2D h, Field2D slope, LandmassContext ctx, HydrologyResult water, KontoWorldSettings s)
        {
            var mask = new Field2D(h.Width, h.Height);
            if (!s.buildRiceTerraces) return mask;

            float maxSlope = Mathf.Tan(s.terraceMaxSlope * Mathf.Deg2Rad);
            float minSlope = Mathf.Tan(3.0f * Mathf.Deg2Rad);

            Parallel.For(0, h.Height, y =>
            {
                for (int x = 0; x < h.Width; x++)
                {
                    int idx = y * h.Width + x;
                    if (ctx.LandMask.Data[idx] < 0.9f) continue;

                    float elev = h.Data[idx];
                    if (elev < 4f || elev > s.terraceMaxAltitude) continue;

                    float sl = slope.Data[idx];
                    if (sl < minSlope || sl > maxSlope) continue;

                    if (water.FlowRaw.Data[idx] < s.terraceMinFlow) continue;
                    if (water.RiverMask.Data[idx] > 0.4f) continue;

                    Vector2 wp = ctx.CellToWorld(x, y);

                    // Terraces come in hamlet sized patches following the valley.
                    float patch = KontoNoise.Fbm(wp.x / 340f, wp.y / 340f, s.seed + 17011, 3);
                    float gate = KontoNoise.SmoothStep(-0.12f, 0.32f, patch);
                    if (gate <= 0.01f) continue;

                    float slopeFit = KontoNoise.SmoothStep(minSlope, minSlope * 2.2f, sl)
                                   * (1f - KontoNoise.SmoothStep(maxSlope * 0.72f, maxSlope, sl));
                    float altFit = 1f - KontoNoise.SmoothStep(s.terraceMaxAltitude * 0.78f, s.terraceMaxAltitude, elev);

                    mask.Data[idx] = Mathf.Clamp01(gate * slopeFit * altFit);
                }
            });

            mask.Blur(1, 1);
            return mask;
        }

        /// <summary>
        /// Keeps the island inside the vertical range the terrain objects were sized for. Land
        /// above sea level is scaled, the sea bed is only clamped, so the coastline never moves.
        /// </summary>
        static float ClampToRange(Field2D h, KontoWorldSettings s)
        {
            float highest = 0f;
            for (int i = 0; i < h.Data.Length; i++) if (h.Data[i] > highest) highest = h.Data[i];

            float headroom = s.maxHeight - s.detailNoiseAmplitude - s.microNoiseAmplitude - 2f;
            if (highest > headroom && highest > 1f)
            {
                float scale = headroom / highest;
                Parallel.For(0, h.Data.Length, i =>
                {
                    if (h.Data[i] > 0f) h.Data[i] *= scale;
                });
                highest = headroom;
            }

            float floor = -s.seaDepth + 2f;
            Parallel.For(0, h.Data.Length, i =>
            {
                if (h.Data[i] < floor) h.Data[i] = floor;
            });

            return highest;
        }
    }
}
