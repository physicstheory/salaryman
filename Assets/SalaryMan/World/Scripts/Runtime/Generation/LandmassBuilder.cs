using System;
using System.Threading.Tasks;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Per cell arc data plus the island mask. Computed once and reused by every later stage,
    /// including splatmap painting and vegetation, so the geology and the surfacing agree.
    /// </summary>
    public sealed class LandmassContext
    {
        public KontoWorldSettings Settings;
        public IslandArc Arc;
        public int Width, Height;
        public float CellSize;          // metres per working raster cell
        public Vector2 WorldSize;

        public Field2D ArcT;            // 0..1 along the island
        public Field2D ArcLateral;      // signed metres from the arc axis
        public Field2D CoastDistance;   // metres inland from the coastline, negative offshore
        public Field2D LandMask;        // 0 sea, 1 solid land, smooth across the shore

        public Vector2 CellToWorld(int x, int y)
        {
            return new Vector2(x * WorldSize.x / (Width - 1), y * WorldSize.y / (Height - 1));
        }
    }

    /// <summary>
    /// Builds the raw tectonic relief of Konto before any erosion runs: the coastline, the
    /// mountain ranges along the arc, the volcanic front, the intermontane basins and the
    /// coastal alluvial plains.
    /// </summary>
    public static class LandmassBuilder
    {
        const float ShoreBlend = 90f;   // metres over which the shoreline mask fades

        struct BayEntry
        {
            public CityFrame Frame;
            public BaySpec Bay;
        }

        /// <summary>Every city bay that needs cutting out of the coastline.</summary>
        static BayEntry[] CollectBays(KontoWorldSettings s, IslandArc arc)
        {
            if (!s.buildCities || s.cities == null) return new BayEntry[0];
            var list = new System.Collections.Generic.List<BayEntry>();
            for (int i = 0; i < s.cities.Count; i++)
            {
                var site = s.cities[i];
                if (site == null || site.bay == null || !site.bay.carve) continue;
                list.Add(new BayEntry { Frame = CityFrame.Build(arc, site), Bay = site.bay });
            }
            return list.ToArray();
        }

        public static LandmassContext BuildContext(KontoWorldSettings s, int width, int height)
        {
            var ctx = new LandmassContext
            {
                Settings = s,
                Arc = IslandArc.Build(s, 640),
                Width = width,
                Height = height,
                WorldSize = s.WorldSize,
                ArcT = new Field2D(width, height),
                ArcLateral = new Field2D(width, height),
                CoastDistance = new Field2D(width, height),
                LandMask = new Field2D(width, height),
            };
            ctx.CellSize = ctx.WorldSize.x / (width - 1);

            var arc = ctx.Arc;
            int seed = s.seed;
            var bays = CollectBays(s, arc);
            float arcLength = arc.TotalLength;

            Parallel.For(0, height, y =>
            {
                for (int x = 0; x < width; x++)
                {
                    Vector2 w = ctx.CellToWorld(x, y);
                    float lateral;
                    float t = arc.Project(w, out lateral);
                    ctx.ArcT[x, y] = t;
                    ctx.ArcLateral[x, y] = lateral;

                    float effectiveHalfWidth = EffectiveHalfWidth(s, arc, t, lateral, w, seed);
                    float inland = effectiveHalfWidth - Mathf.Abs(lateral);

                    // City bays are cut here, before anything else happens, so the shelf, the
                    // beaches, the erosion and the rivers all treat a bay as ordinary coast.
                    for (int b = 0; b < bays.Length; b++)
                    {
                        Vector2 local = bays[b].Frame.ArcLocal(t, lateral, arcLength);
                        inland = CityBay.ApplyToCoastDistance(bays[b].Bay, inland, local, w, seed);
                    }

                    // Offshore islets: shards of the drowned ridge that never quite sank.
                    if (inland < 0f && inland > -420f && s.isletDensity > 0f)
                    {
                        float n = KontoNoise.Ridged(w.x / 260f, w.y / 260f, seed + 4801, 3, 2.1f, 0.5f, 1.4f);
                        float gate = 1f - s.isletDensity * 0.55f;
                        if (n > gate)
                        {
                            float strength = (n - gate) / Mathf.Max(1e-4f, 1f - gate);
                            inland += strength * 430f * Mathf.Clamp01(1f + inland / 420f);
                        }
                    }

                    ctx.CoastDistance[x, y] = inland;
                    ctx.LandMask[x, y] = KontoNoise.SmoothStep(-ShoreBlend * 0.5f, ShoreBlend, inland);
                }
            });

            return ctx;
        }

        /// <summary>
        /// The island half width at a point, after the coastline has been roughed up. The two
        /// coasts of Honshu could not be more different, so they are shaped separately: the
        /// ocean side is a drowned ria coast of deep V shaped inlets, the sheltered side is
        /// long smooth sandy arcs backed by dunes.
        /// </summary>
        static float EffectiveHalfWidth(KontoWorldSettings s, IslandArc arc, float t, float lateral, Vector2 world, int seed)
        {
            float hw = arc.HalfWidthAt(t);
            bool oceanSide = lateral >= 0f;

            // Large lobes and bays. This is what produces peninsulas and gulfs.
            float lobe = KontoNoise.Fbm(t * 3.4f + (oceanSide ? 0f : 57.3f), oceanSide ? 11.7f : -22.4f, seed + 331, 3);
            hw += lobe * 520f;

            // Medium coastline wobble.
            float wob = KontoNoise.Fbm(world.x / s.coastNoiseSize, world.y / s.coastNoiseSize, seed + 907, 4);
            float wobAmp = s.coastNoiseAmplitude * (oceanSide ? 1f : 1f - s.duneCoastSmoothing);
            hw += wob * wobAmp;

            if (oceanSide)
            {
                // Sanriku style ria coast: repeated deep inlets cut along a short stretch of coast.
                float lo = Mathf.Min(s.riaCoastRange.x, s.riaCoastRange.y);
                float hi = Mathf.Max(s.riaCoastRange.x, s.riaCoastRange.y);
                float band = KontoNoise.SmoothStep(lo, lo + 0.05f, t) * (1f - KontoNoise.SmoothStep(hi - 0.06f, hi, t));
                if (band > 0f)
                {
                    float along = t * arc.TotalLength / Mathf.Max(60f, s.riaSpacing);
                    float jitter = KontoNoise.Fbm(along * 0.7f, 3.1f, seed + 1553, 3) * 1.6f;
                    float inlet = 0.5f + 0.5f * Mathf.Cos((along + jitter) * Mathf.PI * 2f);
                    inlet = Mathf.Pow(inlet, 2.2f);   // narrow inlets, broad headlands
                    hw -= inlet * s.riaDepth * band;
                }
            }
            else
            {
                // Sand bars and lagoons on the sheltered coast.
                float bar = KontoNoise.Fbm(world.x / 900f, world.y / 900f, seed + 2711, 2);
                hw += bar * 110f;
            }

            return Mathf.Max(hw, 60f);
        }

        /// <summary>Sea bed, shelf and the raw uplifted relief of the island.</summary>
        public static Field2D BuildBaseRelief(LandmassContext ctx)
        {
            var s = ctx.Settings;
            var h = new Field2D(ctx.Width, ctx.Height);
            int seed = s.seed;
            int w = ctx.Width, hgt = ctx.Height;

            Parallel.For(0, hgt, y =>
            {
                for (int x = 0; x < w; x++)
                {
                    Vector2 wp = ctx.CellToWorld(x, y);
                    float inland = ctx.CoastDistance[x, y];
                    float mask = ctx.LandMask[x, y];
                    float value;

                    if (mask < 0.999f)
                    {
                        // Continental shelf, then the drop into deep water.
                        float off = Mathf.Max(0f, -inland);
                        float shelf = -Mathf.Clamp01(off / Mathf.Max(60f, s.shelfWidth)) * 22f;
                        float deep = -KontoNoise.SmoothStep(s.shelfWidth, s.shelfWidth * 4.5f, off) * Mathf.Max(0f, s.seaDepth - 22f);
                        float bedNoise = KontoNoise.Fbm(wp.x / 700f, wp.y / 700f, seed + 6101, 4) * 9f;
                        value = shelf + deep + bedNoise * Mathf.Clamp01(off / 300f);
                    }
                    else
                    {
                        value = 0f;
                    }

                    if (mask > 0.001f)
                    {
                        float land = BuildLandRelief(ctx, x, y, wp, mask, seed);
                        value = Mathf.Lerp(value, land, mask);
                    }

                    h[x, y] = value;
                }
            });

            ApplyBasins(ctx, h);
            ApplyCoastalPlains(ctx, h);
            ApplyVolcanoes(ctx, h);
            ApplySettlementTerraces(ctx, h);
            return h;
        }

        static float BuildLandRelief(LandmassContext ctx, int x, int y, Vector2 wp, float mask, int seed)
        {
            var s = ctx.Settings;
            float t = ctx.ArcT[x, y];
            float lateral = ctx.ArcLateral[x, y];
            float hw = ctx.Arc.HalfWidthAt(t);
            float inland = ctx.CoastDistance[x, y];

            // Every coast has a strip of low ground before the land starts climbing.
            float height = Mathf.Min(inland, 260f) * 0.055f;

            // Dissected low hill country. In Japan this is the satoyama belt that covers most
            // of the ground between the big ranges: rounded ridges, very high drainage density.
            Vector2 hw2 = KontoNoise.Warp(wp.x / s.hillCountryFeatureSize, wp.y / s.hillCountryFeatureSize, seed + 8117, 0.55f, 0.85f);
            float hills = KontoNoise.Billow(hw2.x, hw2.y, seed + 311, 5) * 0.65f
                        + KontoNoise.Ridged(hw2.x * 2.3f, hw2.y * 2.3f, seed + 313, 4, 2.05f, 0.5f, 1.1f) * 0.35f;
            height += hills * s.hillCountryHeight * KontoNoise.SmoothStep(0f, 420f, inland);

            // The ranges themselves.
            for (int i = 0; i < s.ranges.Count; i++)
            {
                var r = s.ranges[i];
                if (r == null || r.peakHeight <= 0f) continue;

                float span = r.alongEnd - r.alongStart;
                if (Mathf.Abs(span) < 1e-4f) continue;
                float along = (t - r.alongStart) / span;
                if (along < 0f || along > 1f) continue;

                // Taper the range off at both ends so it dies out into hill country.
                float profile = KontoNoise.SmoothStep(0f, 0.22f, along) * (1f - KontoNoise.SmoothStep(0.78f, 1f, along));
                if (profile <= 0f) continue;

                // The crest does not run dead straight; it wanders either side of the axis.
                float wander = KontoNoise.Fbm(t * 5.7f + i * 13.3f, 0.5f, seed + 4111 + i * 97, 3) * r.crestWander;
                float axis = r.lateralOffset * hw + wander;
                float d = Mathf.Abs(lateral - axis);
                float falloff = 1f - Mathf.Clamp01(d / Mathf.Max(60f, r.halfWidth));
                if (falloff <= 0f) continue;
                falloff = Mathf.Pow(falloff, 1.45f);

                float fs = Mathf.Max(60f, r.featureSize);
                Vector2 warped = KontoNoise.Warp(wp.x / fs, wp.y / fs, seed + 5171 + i * 131, 0.45f, 0.75f);
                float ridged = KontoNoise.Ridged(warped.x, warped.y, seed + 6199 + i * 151, r.octaves, 2.07f, 0.5f, r.ridgeSharpness);
                float rounded = KontoNoise.Billow(warped.x * 0.85f, warped.y * 0.85f, seed + 7207 + i * 173, r.octaves);
                float n = Mathf.Lerp(rounded, ridged, r.ruggedness);

                // Keep a little solid mass under the noise so ranges read as ranges, not as spikes.
                n = 0.22f + 0.78f * n;

                height += r.peakHeight * profile * falloff * n;
            }

            // Fine relief so nothing is ever perfectly smooth before erosion runs.
            height += KontoNoise.Fbm(wp.x / 220f, wp.y / 220f, seed + 9203, 4) * 12f * KontoNoise.SmoothStep(0f, 180f, inland);

            return Mathf.Max(height, 0.2f);
        }

        /// <summary>Flattens the intermontane basins. Kofu and Nagano are floors of old lake beds ringed by 2000 m walls.</summary>
        static void ApplyBasins(LandmassContext ctx, Field2D h)
        {
            var s = ctx.Settings;
            if (s.basins == null) return;

            foreach (var b in s.basins)
            {
                if (b == null || b.radius <= 1f) continue;
                Vector2 center = ctx.Arc.AnchorToWorld(b.alongT, b.lateral);
                float outer = b.radius + b.rimBlend;
                RectInt rect = WorldRect(ctx, center, outer);

                Parallel.For(rect.yMin, rect.yMax, y =>
                {
                    for (int x = rect.xMin; x < rect.xMax; x++)
                    {
                        Vector2 wp = ctx.CellToWorld(x, y);
                        float d = Vector2.Distance(wp, center);
                        // Basins are not circular; wobble the rim.
                        d *= 1f + KontoNoise.Fbm(wp.x / 420f, wp.y / 420f, s.seed + 1301, 3) * 0.22f;
                        float wgt = 1f - KontoNoise.SmoothStep(b.radius, outer, d);
                        if (wgt <= 0.001f) continue;

                        float floor = b.floorHeight + KontoNoise.Fbm(wp.x / 300f, wp.y / 300f, s.seed + 1451, 3) * 4.5f;
                        float flattened = KontoNoise.SmoothMin(h[x, y], floor, 55f);
                        // Where the ground already sits at the floor height the smooth minimum
                        // digs a sump tens of metres deep, and the drainage pass then fills the
                        // whole basin with a lake. Hold it to the floor it was asked for.
                        flattened = Mathf.Max(flattened, Mathf.Min(h[x, y], floor - 1.5f));
                        h[x, y] = Mathf.Lerp(h[x, y], flattened, wgt);
                    }
                });
            }
        }

        /// <summary>
        /// Coastal alluvial plains. These are the flattest ground on the island by far, barely
        /// a few metres per kilometre, and they are where the cities will go later.
        /// </summary>
        static void ApplyCoastalPlains(LandmassContext ctx, Field2D h)
        {
            var s = ctx.Settings;
            if (s.plains == null) return;
            float arcLength = ctx.Arc.TotalLength;

            foreach (var p in s.plains)
            {
                if (p == null) continue;
                float alongExtent = Mathf.Max(60f, p.AlongExtent);
                float lateralExtent = Mathf.Max(60f, p.LateralExtent);

                Vector2 center = ctx.Arc.AnchorToWorld(p.alongT, p.lateral);
                float anchorLateral = p.lateral * ctx.Arc.HalfWidthAt(p.alongT);
                float blendFrac = p.terraceBlend / Mathf.Sqrt(alongExtent * lateralExtent);
                float outer = Mathf.Max(alongExtent, lateralExtent) + p.terraceBlend;
                RectInt rect = WorldRect(ctx, center, outer);

                Parallel.For(rect.yMin, rect.yMax, y =>
                {
                    for (int x = rect.xMin; x < rect.xMax; x++)
                    {
                        if (ctx.LandMask[x, y] <= 0.001f) continue;
                        Vector2 wp = ctx.CellToWorld(x, y);

                        // Measured in the island's own frame, so the plain runs along the coast
                        // instead of biting a circle out of the mountains behind it.
                        float du = (ctx.ArcT[x, y] - p.alongT) * arcLength / alongExtent;
                        float dv = (ctx.ArcLateral[x, y] - anchorLateral) / lateralExtent;
                        float d = Mathf.Sqrt(du * du + dv * dv);
                        d *= 1f + KontoNoise.Fbm(wp.x / 520f, wp.y / 520f, s.seed + 2203, 3) * 0.18f;

                        float wgt = 1f - KontoNoise.SmoothStep(0.74f, 1f + blendFrac, d);
                        if (wgt <= 0.001f) continue;

                        float inland = Mathf.Max(0f, ctx.CoastDistance[x, y]);
                        // Starting the plain at 1.6 m rather than 0.8 m keeps the first couple of
                        // hundred metres inland above the tide instead of half under it, which is
                        // what the city's waterfront wards have to stand on.
                        float target = Mathf.Min(p.maxHeight, 1.6f + inland * p.gradient);
                        target += KontoNoise.Fbm(wp.x / 260f, wp.y / 260f, s.seed + 2311, 3) * 1.6f;

                        float flattened = KontoNoise.SmoothMin(h[x, y], target, 28f);
                        // Same trap as the basins, and on a plain this flat it is the difference
                        // between a coastal plain and a drowned one: the smooth minimum can push
                        // the whole shoreline several metres under water.
                        float lowest = Mathf.Lerp(-1.5f, 0.7f, ctx.LandMask[x, y]);
                        flattened = Mathf.Max(flattened, Mathf.Min(h[x, y], lowest));
                        h[x, y] = Mathf.Lerp(h[x, y], flattened, wgt);
                    }
                });
            }
        }

        /// <summary>
        /// Cuts a buildable terrace under every settlement, before any erosion runs.
        ///
        /// This is the one place where the city is allowed to change the landscape rather than
        /// the other way round, and it has to be: a town needs somewhere flat and dry to stand,
        /// and leaving that to chance means the capital comes out as forty blocks scattered over
        /// a hillside. Every real settlement in Japan stands on ground like this - an alluvial
        /// terrace, a fan, a reclaimed delta - and the terrace is tilted downhill so the water
        /// still runs off it instead of ponding into a lake.
        /// </summary>
        static void ApplySettlementTerraces(LandmassContext ctx, Field2D h)
        {
            var s = ctx.Settings;
            if (!s.buildCities || s.cities == null) return;

            foreach (var site in s.cities)
            {
                if (site == null) continue;
                var frame = CityFrame.Build(ctx.Arc, site);
                float alongR = Mathf.Max(80f, site.alongRadius);
                float inlandR = Mathf.Max(80f, site.inlandRadius);
                Vector2 centre = frame.ToWorld(site.coreOffset);

                // The floor is taken from the lower third of the ground inside the outline: a
                // terrace sits at the valley floor, not at the average of the valley walls.
                var samples = new System.Collections.Generic.List<float>();
                for (int i = 0; i < 26; i++)
                for (int k = 0; k < 26; k++)
                {
                    float u = (i / 25f - 0.5f) * 2f;
                    float v = (k / 25f - 0.5f) * 2f;
                    if (u * u + v * v > 1f) continue;
                    Vector2 p = frame.ToWorld(site.coreOffset + new Vector2(u * alongR, v * inlandR));
                    if (p.x < 0f || p.y < 0f || p.x > ctx.WorldSize.x || p.y > ctx.WorldSize.y) continue;
                    float e = SampleWorld(ctx, h, p);
                    if (e < 0.3f) continue;              // the sea is not part of the terrace
                    samples.Add(e);
                }
                if (samples.Count < 16) continue;
                samples.Sort();
                float floor = Mathf.Max(2.2f, samples[Mathf.Clamp(Mathf.RoundToInt(samples.Count * 0.30f), 0, samples.Count - 1)]);

                // Which way the water runs off, measured at the scale of the whole settlement.
                float step = Mathf.Max(alongR, inlandR) * 0.8f;
                float gx = SampleWorld(ctx, h, centre + new Vector2(step, 0f)) - SampleWorld(ctx, h, centre - new Vector2(step, 0f));
                float gy = SampleWorld(ctx, h, centre + new Vector2(0f, step)) - SampleWorld(ctx, h, centre - new Vector2(0f, step));
                Vector2 drain = new Vector2(-gx, -gy);
                drain = drain.sqrMagnitude < 1e-4f ? -frame.Inland : drain.normalized;
                const float grade = 0.008f;            // about 1:125, a real alluvial gradient

                float outer = Mathf.Max(alongR, inlandR) + 500f;
                RectInt rect = WorldRect(ctx, centre, outer);

                Parallel.For(rect.yMin, rect.yMax, y =>
                {
                    for (int x = rect.xMin; x < rect.xMax; x++)
                    {
                        if (ctx.LandMask[x, y] <= 0.05f) continue;     // never fill in the sea
                        Vector2 wp = ctx.CellToWorld(x, y);
                        Vector2 local = frame.ToLocal(wp) - site.coreOffset;

                        float du = local.x / alongR;
                        float dv = local.y / inlandR;
                        float d = Mathf.Sqrt(du * du + dv * dv);
                        d *= 1f + KontoNoise.Fbm(wp.x / 460f, wp.y / 460f, s.seed + 2707, 3) * 0.12f;

                        float wgt = 1f - KontoNoise.SmoothStep(0.80f, 1.12f, d);
                        if (wgt <= 0.001f) continue;

                        float target = floor + Vector2.Dot(wp - centre, drain) * grade;
                        target = Mathf.Max(target, 1.4f);
                        target += KontoNoise.Fbm(wp.x / 210f, wp.y / 210f, s.seed + 2711, 3) * 1.1f;

                        float current = h[x, y];
                        float flattened = KontoNoise.SmoothMin(current, target, 34f);
                        flattened = Mathf.Max(flattened, Mathf.Min(current, target - 2.5f));
                        // Hollows shallower than a house get filled in, the way a terrace is made.
                        if (flattened < target - 0.5f && flattened > target - 9f)
                            flattened = Mathf.Lerp(flattened, target, 0.75f);

                        h[x, y] = Mathf.Lerp(current, flattened, wgt);
                    }
                });
            }
        }

        /// <summary>The volcanic front: isolated stratovolcano cones and one collapsed caldera.</summary>
        static void ApplyVolcanoes(LandmassContext ctx, Field2D h)
        {
            var s = ctx.Settings;
            if (s.volcanoes == null) return;

            foreach (var v in s.volcanoes)
            {
                if (v == null || v.baseRadius <= 1f) continue;
                Vector2 center = ctx.Arc.AnchorToWorld(v.alongT, v.lateral);
                float outer = v.baseRadius * 1.15f;
                RectInt rect = WorldRect(ctx, center, outer);

                // Sample the ground the cone is going to stand on, before we touch it.
                float baseElev = SampleWorld(ctx, h, center);

                Parallel.For(rect.yMin, rect.yMax, y =>
                {
                    for (int x = rect.xMin; x < rect.xMax; x++)
                    {
                        Vector2 wp = ctx.CellToWorld(x, y);
                        Vector2 delta = wp - center;
                        float r = delta.magnitude;
                        if (r > outer) continue;

                        float angle = Mathf.Atan2(delta.y, delta.x);
                        float rn = Mathf.Clamp01(r / v.baseRadius);

                        // Slightly elliptical and noisy so the cone is not a perfect solid of revolution.
                        float shapeNoise = KontoNoise.Fbm(Mathf.Cos(angle) * 2.3f, Mathf.Sin(angle) * 2.3f, s.seed + 3301, 3) * 0.07f;
                        rn = Mathf.Clamp01(rn * (1f + shapeNoise));

                        float cone = v.height * Mathf.Pow(1f - rn, v.concavity);

                        // Radial rills. Young volcanic flanks are combed with parallel gullies.
                        float rillPhase = angle * v.rillCount + KontoNoise.Fbm(wp.x / 180f, wp.y / 180f, s.seed + 3407, 3) * 3.4f;
                        float rill = (0.5f + 0.5f * Mathf.Cos(rillPhase)) * v.rillDepth
                                     * KontoNoise.SmoothStep(0.06f, 0.55f, rn) * (1f - KontoNoise.SmoothStep(0.85f, 1.05f, rn));
                        cone -= rill;

                        // The cone has to grow out of the ground at THIS point, not out of the
                        // ground at its summit. Taking the summit's elevation across the whole
                        // edifice turns everything inside the base radius into a plateau, which
                        // on a coastal plain means a two kilometre wide table where a city was
                        // supposed to go.
                        float pedestal = Mathf.Lerp(h[x, y], baseElev, 1f - rn);
                        float target = pedestal + cone;

                        if (v.craterRadius > 1f && r < v.craterRadius * 1.6f)
                        {
                            if (v.caldera)
                            {
                                // Collapse: steep inner walls dropping to a flat floor that will hold a lake.
                                float inner = 1f - KontoNoise.SmoothStep(v.craterRadius * 0.62f, v.craterRadius, r);
                                target -= v.craterDepth * inner;
                            }
                            else
                            {
                                float inner = 1f - KontoNoise.SmoothStep(v.craterRadius * 0.35f, v.craterRadius, r);
                                target -= v.craterDepth * inner;
                            }
                        }

                        // Smoothing is needed where the cone is thick and would otherwise crease
                        // into the hills, but at the rim it has to be off: a smooth maximum of two
                        // equal values sits above both of them, and that would ring the volcano
                        // with a raised lip tens of metres high.
                        float blend = 70f * (1f - rn) * (1f - rn);
                        h[x, y] = KontoNoise.SmoothMax(h[x, y], target, blend);
                    }
                });
            }
        }

        static float SampleWorld(LandmassContext ctx, Field2D f, Vector2 world)
        {
            return f.SampleBilinear(world.x / ctx.WorldSize.x, world.y / ctx.WorldSize.y);
        }

        static RectInt WorldRect(LandmassContext ctx, Vector2 center, float radius)
        {
            float sx = ctx.WorldSize.x / (ctx.Width - 1);
            float sy = ctx.WorldSize.y / (ctx.Height - 1);
            int x0 = Mathf.Clamp(Mathf.FloorToInt((center.x - radius) / sx), 0, ctx.Width - 1);
            int x1 = Mathf.Clamp(Mathf.CeilToInt((center.x + radius) / sx) + 1, 0, ctx.Width);
            int y0 = Mathf.Clamp(Mathf.FloorToInt((center.y - radius) / sy), 0, ctx.Height - 1);
            int y1 = Mathf.Clamp(Mathf.CeilToInt((center.y + radius) / sy) + 1, 0, ctx.Height);
            return new RectInt(x0, y0, Mathf.Max(0, x1 - x0), Mathf.Max(0, y1 - y0));
        }
    }
}
