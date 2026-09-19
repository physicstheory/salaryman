using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// The civil engineering pass. It takes the city plan and the natural landscape and works
    /// out what the ground actually does once the city has been built on it: the platform the
    /// city stands on, the made ground out in the bay, every street surface, every plot graded
    /// dead flat, the rail beds, the moat, and the bridges where a road meets water.
    ///
    /// Plots are flattened individually and roads are given a smooth running profile, which is
    /// what a real city does: cut, fill and retaining walls everywhere. It also means a building
    /// dropped on a plot needs no fitting - the ground under it is level, at a known height.
    /// </summary>
    public static class CityGrading
    {
        public static UrbanData Build(KontoWorldSettings settings, CityTerrain terrain, UrbanSiteSpec site,
            CityLayout layout, Action<string, float> progress = null)
        {
            if (layout == null) return null;
            var frame = CityFrame.Build(terrain.Land.Arc, site);

            float cell = Mathf.Clamp(settings.urbanCellSize, 1f, 8f);
            Rect bounds = CityGeom.Grow(layout.bounds, site.gradingFeather + 160f);
            int w = Mathf.CeilToInt(bounds.width / cell) + 1;
            int h = Mathf.CeilToInt(bounds.height / cell) + 1;

            // A hard ceiling on the raster, so an absurd city size fails loudly instead of
            // quietly asking for ten gigabytes.
            const int maxCells = 26000000;
            if ((long)w * h > maxCells)
            {
                float scale = Mathf.Sqrt((float)maxCells / ((float)w * h));
                cell = cell / scale;
                w = Mathf.CeilToInt(bounds.width / cell) + 1;
                h = Mathf.CeilToInt(bounds.height / cell) + 1;
                Debug.LogWarning("[Konto] The city raster was coarsened to " + cell.ToString("0.0")
                    + " m per cell to fit in memory. Shrink the city or raise Urban Cell Size deliberately.");
            }

            var origin = new Vector2(bounds.xMin, bounds.yMin);
            var pad = new UrbanRaster(origin, cell, w, h);
            var weight = new UrbanRaster(origin, cell, w, h);
            var surface = new UrbanSurfaceRaster(origin, cell, w, h);

            Report(progress, "Surveying the city site", 0.03f);
            SampleNatural(pad, weight, terrain, site, frame, layout);

            Report(progress, "Grading the platform", 0.22f);
            int blurRadius = Mathf.Max(1, Mathf.RoundToInt(site.gradingSmoothRadius / cell));
            pad.MaskedBlur(weight, blurRadius, 2);
            ClampGradient(pad, weight, cell, site.maxPlatformSlope, 12);

            Report(progress, "Filling the bay and keeping the water open", 0.38f);
            ApplyWaterAndFill(pad, weight, surface, terrain, layout, site);

            // Feather every boundary now, before the streets and the plots are laid: doing it
            // afterwards eats into them, and a plot whose weight has been blurred down is no
            // longer flat, which defeats the whole point of grading it.
            weight.Blur(Mathf.Max(1, Mathf.RoundToInt(site.gradingFeather / (cell * 4f))), 1);

            // Everything from here on sets weight to 1 where it touches the ground, so the
            // footprint is kept as it stands now. It is what says "this cell belongs to this
            // city": without it, a road running out of one town would stamp its own height into
            // the next town's ground wherever the two rasters overlap.
            var footprint = weight.Clone();

            var grids = new CityWardGrid[layout.wards.Count];
            for (int i = 0; i < layout.wards.Count; i++) grids[i] = CityWardGrid.For(layout.wards[i], i, layout.seed);

            Report(progress, "Laying the streets", 0.50f);
            PaintWardStreets(pad, weight, surface, layout, grids, cell);

            Report(progress, "Paving the station plazas", 0.58f);
            PaintStations(pad, weight, surface, footprint, layout, cell);

            // Plots come before the arterials and the railways, and after the local streets.
            // A block can reach across a ward boundary, where the neighbouring ward's grid has
            // already painted its own streets, and the plot has to win there or it ends up with
            // somebody else's road across it.
            Report(progress, "Flattening the building plots", 0.66f);
            FlattenPlots(pad, weight, surface, footprint, terrain, layout, cell);

            Report(progress, "Grading the arterials and the expressway", 0.76f);
            for (int i = 0; i < layout.roads.Count; i++)
                GradeRoad(layout.roads[i], i, pad, weight, surface, footprint, terrain, layout, cell);

            Report(progress, "Grading the railways", 0.86f);
            for (int i = 0; i < layout.rails.Count; i++)
                GradeRail(layout.rails[i], i, pad, weight, surface, footprint, terrain, layout, cell);

            Report(progress, "Digging the moat", 0.93f);
            BuildMoat(pad, weight, surface, layout, site, cell);

            Report(progress, "City built", 1f);
            return new UrbanData
            {
                Site = site,
                Layout = layout,
                Pad = pad,
                Weight = weight,
                Surface = surface,
                Bounds = bounds,
            };
        }

        static void Report(Action<string, float> progress, string message, float t)
        {
            if (progress != null) progress(message, t);
        }

        // ---------------------------------------------------------------- platform

        static void SampleNatural(UrbanRaster pad, UrbanRaster weight, CityTerrain terrain,
            UrbanSiteSpec site, CityFrame frame, CityLayout layout)
        {
            int w = pad.Width;
            Parallel.For(0, pad.Height, y =>
            {
                for (int x = 0; x < w; x++)
                {
                    Vector2 p = pad.CellToWorld(x, y);
                    int idx = y * w + x;
                    pad.Data[idx] = terrain.Height(p);
                    weight.Data[idx] = CityFootprint.Value(site, frame, terrain, layout, layout.seed, p);
                }
            });
        }

        /// <summary>
        /// Pulls the graded surface down to a buildable gradient. Ground steeper than the limit
        /// is cut and the material is pushed into the hollow below it, which is exactly what a
        /// site levelling contractor does.
        /// </summary>
        static void ClampGradient(UrbanRaster pad, UrbanRaster weight, float cell, float maxSlope, int iterations)
        {
            float limit = Mathf.Max(0.01f, maxSlope) * cell;
            int w = pad.Width, h = pad.Height;
            var copy = new float[pad.Data.Length];
            // What the ground was before levelling. No amount of relaxation is allowed to move a
            // cell more than this far from it, so a cliff at the edge of the city can never throw
            // the platform to an absurd height.
            var reference = new float[pad.Data.Length];
            Array.Copy(pad.Data, reference, reference.Length);
            const float maxCutOrFill = 90f;

            for (int pass = 0; pass < iterations; pass++)
            {
                Array.Copy(pad.Data, copy, copy.Length);
                Parallel.For(1, h - 1, y =>
                {
                    for (int x = 1; x < w - 1; x++)
                    {
                        int idx = y * w + x;
                        if (weight.Data[idx] < 0.05f) continue;

                        float c = copy[idx];
                        float move = 0f;
                        move += Excess(c, copy[idx - 1], limit);
                        move += Excess(c, copy[idx + 1], limit);
                        move += Excess(c, copy[idx - w], limit);
                        move += Excess(c, copy[idx + w], limit);
                        if (move == 0f) continue;
                        // Half of the MEAN excess, not a fraction of the sum: moving on the sum
                        // overshoots past the neighbours at a cliff edge and rings, which is how
                        // a levelled platform ends up with kilometre high spikes in it.
                        float relaxed = c + move * 0.125f * weight.Data[idx];
                        pad.Data[idx] = Mathf.Clamp(relaxed, reference[idx] - maxCutOrFill, reference[idx] + maxCutOrFill);
                    }
                });
            }
        }

        static float Excess(float here, float there, float limit)
        {
            float d = there - here;
            if (d > limit) return d - limit;
            if (d < -limit) return d + limit;
            return 0f;
        }

        // ---------------------------------------------------------------- water and made ground

        static void ApplyWaterAndFill(UrbanRaster pad, UrbanRaster weight, UrbanSurfaceRaster surface,
            CityTerrain terrain, CityLayout layout, UrbanSiteSpec site)
        {
            int w = pad.Width;
            Parallel.For(0, pad.Height, y =>
            {
                for (int x = 0; x < w; x++)
                {
                    int idx = y * w + x;
                    Vector2 p = pad.CellToWorld(x, y);

                    float fillHeight;
                    if (CityFootprint.FillHeight(layout, p, out fillHeight))
                    {
                        // Made ground: a flat deck a few metres above the water, with a quay edge.
                        pad.Data[idx] = fillHeight;
                        weight.Data[idx] = 1f;
                        surface.Data[idx] = (byte)UrbanSurface.Fill;
                        continue;
                    }

                    float natural = terrain.Height(p);
                    bool sea = natural < 0.4f;
                    bool river = terrain.River(p) > 0.42f;
                    float lake;
                    bool lakeHere = terrain.LakeSurface(p, out lake);

                    if (sea || river || lakeHere)
                    {
                        // Water stays water. The city is built around it, embanked, and bridged.
                        pad.Data[idx] = natural;
                        weight.Data[idx] = 0f;
                        surface.Data[idx] = (byte)UrbanSurface.Water;
                    }
                }
            });
        }

        // ---------------------------------------------------------------- streets

        /// <summary>
        /// Paints every local street and alley from the ward grids. The grid is the same closed
        /// form the blocks were cut from, so the tarmac lands exactly in the gaps between them.
        /// </summary>
        static void PaintWardStreets(UrbanRaster pad, UrbanRaster weight, UrbanSurfaceRaster surface,
            CityLayout layout, CityWardGrid[] grids, float cell)
        {
            if (grids.Length == 0) return;

            int w = pad.Width, h = pad.Height;
            int step = Mathf.Max(1, Mathf.RoundToInt(8f / cell));
            int cw = (w + step - 1) / step + 1;
            int ch = (h + step - 1) / step + 1;

            // Ward membership changes slowly, so it is resolved on a coarse grid and read back
            // per cell. Testing every cell against every ward centre is 150 million tests.
            var wardMap = new int[cw * ch];
            Parallel.For(0, ch, cy =>
            {
                for (int cx = 0; cx < cw; cx++)
                {
                    Vector2 p = pad.CellToWorld(Mathf.Min(cx * step, w - 1), Mathf.Min(cy * step, h - 1));
                    int best = -1;
                    float bestDist = float.MaxValue;
                    for (int i = 0; i < layout.wards.Count; i++)
                    {
                        float d = (layout.wards[i].center - p).sqrMagnitude;
                        if (d >= bestDist) continue;
                        bestDist = d;
                        best = i;
                    }
                    wardMap[cy * cw + cx] = best;
                }
            });

            Parallel.For(0, h, y =>
            {
                for (int x = 0; x < w; x++)
                {
                    int idx = y * w + x;
                    if (weight.Data[idx] < 0.32f) continue;
                    if (surface.Data[idx] == (byte)UrbanSurface.Water) continue;

                    int ward = wardMap[(y / step) * cw + (x / step)];
                    if (ward < 0 || ward >= grids.Length) continue;

                    Vector2 p = pad.CellToWorld(x, y);
                    float distance, width;
                    bool alley;
                    grids[ward].NearestLine(p, out distance, out width, out alley);

                    float half = width * 0.5f;
                    if (distance <= half)
                    {
                        surface.Data[idx] = (byte)UrbanSurface.Asphalt;
                        weight.Data[idx] = 1f;
                    }
                    else if (!alley)
                    {
                        float footway = Mathf.Clamp(width * 0.30f, 1.6f, 4.2f);
                        if (distance <= half + footway)
                        {
                            surface.Data[idx] = (byte)UrbanSurface.Sidewalk;
                            weight.Data[idx] = 1f;
                        }
                    }
                }
            });
        }

        // ---------------------------------------------------------------- roads and rail

        static float MaxGrade(RoadClass klass)
        {
            switch (klass)
            {
                case RoadClass.Expressway: return 0.045f;
                case RoadClass.Arterial: return 0.065f;
                case RoadClass.Avenue: return 0.080f;
                case RoadClass.Promenade: return 0.090f;
                case RoadClass.Alley: return 0.150f;
                default: return 0.110f;
            }
        }

        static void GradeRoad(CityRoad road, int roadIndex, UrbanRaster pad, UrbanRaster weight,
            UrbanSurfaceRaster surface, UrbanRaster footprint, CityTerrain terrain, CityLayout layout, float cell)
        {
            if (road == null || road.points.Count < 2) return;
            float[] profile = BuildProfile(road.points, road.loop, pad, terrain, MaxGrade(road.klass));

            for (int i = 0; i < road.points.Count; i++)
            {
                var p = road.points[i];
                road.points[i] = new Vector3(p.x, road.elevated ? profile[i] + road.deckClearance : profile[i], p.z);
            }
            // An elevated road wants piers and a deck, not a cutting, so the ground is left alone.
            if (road.elevated) return;

            float footway = road.klass == RoadClass.Promenade ? 0f : Mathf.Clamp(road.halfWidth * 0.34f, 1.8f, 4.5f);
            var core = road.klass == RoadClass.Promenade ? UrbanSurface.Plaza : UrbanSurface.Asphalt;
            RasterisePath(road.points, profile, road.loop, road.halfWidth, footway, core, UrbanSurface.Sidewalk,
                pad, weight, surface, footprint, terrain, cell, layout, road.name, false, roadIndex);
        }

        static void GradeRail(CityRail line, int railIndex, UrbanRaster pad, UrbanRaster weight,
            UrbanSurfaceRaster surface, UrbanRaster footprint, CityTerrain terrain, CityLayout layout, float cell)
        {
            if (line == null || line.points.Count < 2) return;
            // Railways cannot climb: 3.5% is already a steep commuter line.
            float[] profile = BuildProfile(line.points, line.loop, pad, terrain, 0.035f);

            float lift = line.underground ? -12f : (line.elevated ? line.deckClearance : 0f);
            for (int i = 0; i < line.points.Count; i++)
            {
                var p = line.points[i];
                line.points[i] = new Vector3(p.x, profile[i] + lift, p.z);
            }
            if (line.underground || line.elevated) return;

            RasterisePath(line.points, profile, line.loop, line.halfWidth, 2.5f, UrbanSurface.RailBed, UrbanSurface.Fill,
                pad, weight, surface, footprint, terrain, cell, layout, line.name, true, railIndex);
        }

        /// <summary>
        /// Works out the running height of a path: sampled off the graded platform, smoothed so
        /// it does not follow every bump, then held to a maximum gradient. This is the difference
        /// between a road and a stripe painted over the terrain.
        /// </summary>
        static float[] BuildProfile(List<Vector3> points, bool loop, UrbanRaster pad, CityTerrain terrain, float maxGrade)
        {
            int n = points.Count;
            var profile = new float[n];
            var length = new float[n];

            for (int i = 0; i < n; i++)
            {
                var p = new Vector2(points[i].x, points[i].z);
                profile[i] = pad.Sample(p, terrain.Height(p));
                if (i > 0) length[i] = Vector2.Distance(p, new Vector2(points[i - 1].x, points[i - 1].z));
            }

            // Smooth the profile along the path.
            var tmp = new float[n];
            for (int pass = 0; pass < 6; pass++)
            {
                for (int i = 0; i < n; i++)
                {
                    int a = i > 0 ? i - 1 : (loop ? n - 1 : 0);
                    int b = i < n - 1 ? i + 1 : (loop ? 0 : n - 1);
                    tmp[i] = (profile[a] + profile[i] * 2f + profile[b]) * 0.25f;
                }
                Array.Copy(tmp, profile, n);
            }

            // Hold it to the gradient limit, forwards then backwards, a few times over.
            for (int pass = 0; pass < 4; pass++)
            {
                for (int i = 1; i < n; i++)
                {
                    float limit = Mathf.Max(0.05f, length[i]) * maxGrade;
                    float d = profile[i] - profile[i - 1];
                    if (d > limit) profile[i] = profile[i - 1] + limit;
                    else if (d < -limit) profile[i] = profile[i - 1] - limit;
                }
                for (int i = n - 2; i >= 0; i--)
                {
                    float limit = Mathf.Max(0.05f, length[i + 1]) * maxGrade;
                    float d = profile[i] - profile[i + 1];
                    if (d > limit) profile[i] = profile[i + 1] + limit;
                    else if (d < -limit) profile[i] = profile[i + 1] - limit;
                }
            }
            return profile;
        }

        /// <summary>
        /// Lays a path's surface on the ground, and records a bridge wherever it crosses water
        /// instead of filling the water in.
        /// </summary>
        static void RasterisePath(List<Vector3> points, float[] profile, bool loop, float halfWidth, float footway,
            UrbanSurface core, UrbanSurface edge, UrbanRaster pad, UrbanRaster weight, UrbanSurfaceRaster surface,
            UrbanRaster footprint, CityTerrain terrain, float cell, CityLayout layout, string name, bool rail, int pathIndex)
        {
            int n = points.Count;
            int segments = loop ? n : n - 1;
            float stepAlong = Mathf.Max(0.5f, cell * 0.45f);

            bool spanning = false;
            Vector2 spanStart = Vector2.zero;
            Vector2 spanEnd = Vector2.zero;
            float spanDeck = 0f;

            for (int s = 0; s < segments; s++)
            {
                int i0 = s;
                int i1 = (s + 1) % n;
                Vector2 a = new Vector2(points[i0].x, points[i0].z);
                Vector2 b = new Vector2(points[i1].x, points[i1].z);
                float segLength = Vector2.Distance(a, b);
                if (segLength < 1e-3f) continue;
                Vector2 dir = (b - a) / segLength;
                int steps = Mathf.Max(1, Mathf.CeilToInt(segLength / stepAlong));

                for (int k = 0; k <= steps; k++)
                {
                    float t = k / (float)steps;
                    Vector2 centre = Vector2.Lerp(a, b, t);
                    float height = Mathf.Lerp(profile[i0], profile[i1], t);

                    bool overWater = terrain.Height(centre) < 0.6f || terrain.River(centre) > 0.42f;
                    if (overWater)
                    {
                        if (!spanning)
                        {
                            spanning = true;
                            spanStart = centre;
                            spanDeck = height;
                        }
                        spanEnd = centre;
                        spanDeck = Mathf.Max(spanDeck, height);
                        continue;   // no earthworks across water
                    }

                    if (spanning)
                    {
                        spanning = false;
                        float length = Vector2.Distance(spanStart, spanEnd);
                        if (length > 25f)
                        {
                            layout.bridges.Add(new CityBridge
                            {
                                name = name + " bridge",
                                rail = rail,
                                pathIndex = pathIndex,
                                from = spanStart,
                                to = spanEnd,
                                deckY = spanDeck + (rail ? 2.2f : 1.4f),
                                halfWidth = halfWidth,
                            });
                        }
                    }

                    PaintCross(centre, dir, halfWidth, footway, height, core, edge, pad, weight, surface, footprint, cell);
                }
            }
        }

        static void PaintCross(Vector2 centre, Vector2 dir, float halfWidth, float footway, float height,
            UrbanSurface core, UrbanSurface edge, UrbanRaster pad, UrbanRaster weight, UrbanSurfaceRaster surface,
            UrbanRaster footprint, float cell)
        {
            Vector2 perp = new Vector2(-dir.y, dir.x);
            float total = halfWidth + footway;
            int steps = Mathf.Max(1, Mathf.CeilToInt(total * 2f / (cell * 0.45f)));

            for (int i = 0; i <= steps; i++)
            {
                float offset = Mathf.Lerp(-total, total, i / (float)steps);
                Vector2 p = centre + perp * offset;
                int idx;
                if (!Index(pad, p, out idx)) continue;
                if (surface.Data[idx] == (byte)UrbanSurface.Water) continue;
                // Outside this city's own outline the road is left as a line on the map.
                if (footprint.Data[idx] < 0.04f) continue;

                pad.Data[idx] = height;
                if (weight.Data[idx] < 1f) weight.Data[idx] = 1f;
                surface.Data[idx] = (byte)(Mathf.Abs(offset) <= halfWidth ? core : edge);
            }
        }

        // ---------------------------------------------------------------- plots, stations, moat

        static void PaintStations(UrbanRaster pad, UrbanRaster weight, UrbanSurfaceRaster surface,
            UrbanRaster footprint, CityLayout layout, float cell)
        {
            for (int i = 0; i < layout.stations.Count; i++)
            {
                var station = layout.stations[i];
                float y = pad.Sample(station.center, station.groundY);
                y = Mathf.Round(y * 10f) / 10f;
                station.groundY = y;
                layout.stations[i] = station;

                // The plaza: taxi rank, bus stands, the meeting place in front of the station.
                Vector2 plaza = new Vector2(station.size.x * 1.45f, station.size.y * 2.1f);
                FillRect(pad, weight, surface, footprint, station.center, plaza, station.rotation, y, UrbanSurface.Plaza, cell, true);
            }
        }

        static void FlattenPlots(UrbanRaster pad, UrbanRaster weight, UrbanSurfaceRaster surface,
            UrbanRaster footprint, CityTerrain terrain, CityLayout layout, float cell)
        {
            for (int i = 0; i < layout.plots.Count; i++)
            {
                var plot = layout.plots[i];
                float y = pad.Sample(plot.center, terrain.Height(plot.center));
                // Snapped, so a building placed here can be positioned from the plot record and
                // land on the ground exactly. Nothing is reserved below the tide line.
                y = Mathf.Max(0.5f, Mathf.Round(y * 10f) / 10f);
                plot.groundY = y;
                layout.plots[i] = plot;

                UrbanSurface s;
                switch (plot.kind)
                {
                    case PlotKind.ParkSpace:
                    case PlotKind.ShrineGround:
                        s = UrbanSurface.Park;
                        break;
                    case PlotKind.Wharf:
                        s = UrbanSurface.Fill;
                        break;
                    case PlotKind.Parking:
                        s = UrbanSurface.Asphalt;
                        break;
                    default:
                        s = UrbanSurface.Lot;
                        break;
                }

                // Inset a little so the plot never eats its own street.
                Vector2 size = new Vector2(Mathf.Max(4f, plot.size.x - 1.4f), Mathf.Max(4f, plot.size.y - 1.4f));
                FillRect(pad, weight, surface, footprint, plot.center, size, plot.rotation, y, s, cell, false);
            }
        }

        /// <summary>The palace moat. Square, the way a castle moat is, and dug below the water table.</summary>
        static void BuildMoat(UrbanRaster pad, UrbanRaster weight, UrbanSurfaceRaster surface,
            CityLayout layout, UrbanSiteSpec site, float cell)
        {
            if (!site.palaceGardens) return;

            int palaceWard = -1;
            for (int i = 0; i < layout.wards.Count; i++)
            {
                if (layout.wards[i].kind != DistrictKind.Palace) continue;
                palaceWard = i;
                break;
            }
            if (palaceWard < 0) return;

            var ward = layout.wards[palaceWard];
            Vector2 centre = ward.center;
            float yaw = ward.gridAngle;
            float inner = site.palaceRadius;
            float moat = Mathf.Max(8f, site.moatWidth);
            float groundY = Mathf.Round(pad.Sample(centre, ward.groundY) * 10f) / 10f;
            float waterY = groundY - 1.6f;
            float bedY = groundY - 5.2f;

            Rect area = CityGeom.Bounds(centre, new Vector2((inner + moat) * 2f, (inner + moat) * 2f), yaw, cell * 2f);
            ForEachCell(pad, area, (idx, p) =>
            {
                Vector2 l = CityGeom.ToRectLocal(p, centre, yaw);
                float m = Mathf.Max(Mathf.Abs(l.x), Mathf.Abs(l.y));
                if (m > inner + moat) return;

                weight.Data[idx] = 1f;
                if (m >= inner)
                {
                    pad.Data[idx] = bedY;
                    surface.Data[idx] = (byte)UrbanSurface.Water;
                }
                else
                {
                    pad.Data[idx] = groundY;
                    if (surface.Data[idx] == (byte)UrbanSurface.None) surface.Data[idx] = (byte)UrbanSurface.Park;
                }
            });

            // Four water surfaces, one per side of the ring.
            float outer = inner + moat;
            float mid = (inner + outer) * 0.5f;
            AddMoatSide(layout, centre, yaw, new Vector2(0f, mid), new Vector2(outer * 2f, moat), waterY);
            AddMoatSide(layout, centre, yaw, new Vector2(0f, -mid), new Vector2(outer * 2f, moat), waterY);
            AddMoatSide(layout, centre, yaw, new Vector2(mid, 0f), new Vector2(moat, outer * 2f), waterY);
            AddMoatSide(layout, centre, yaw, new Vector2(-mid, 0f), new Vector2(moat, outer * 2f), waterY);

            ward.groundY = groundY;
        }

        static void AddMoatSide(CityLayout layout, Vector2 centre, float yaw, Vector2 localOffset, Vector2 size, float waterY)
        {
            layout.waters.Add(new CityWaterBody
            {
                name = "Palace moat",
                center = CityGeom.FromRectLocal(localOffset, centre, yaw),
                size = size,
                rotation = yaw,
                surfaceY = waterY,
            });
        }

        // ---------------------------------------------------------------- raster helpers

        static bool Index(UrbanRaster raster, Vector2 p, out int idx)
        {
            int x = Mathf.RoundToInt((p.x - raster.Origin.x) / raster.CellSize);
            int y = Mathf.RoundToInt((p.y - raster.Origin.y) / raster.CellSize);
            if (x < 0 || y < 0 || x >= raster.Width || y >= raster.Height)
            {
                idx = 0;
                return false;
            }
            idx = y * raster.Width + x;
            return true;
        }

        static void ForEachCell(UrbanRaster raster, Rect area, Action<int, Vector2> action)
        {
            int x0 = Mathf.Max(0, Mathf.FloorToInt((area.xMin - raster.Origin.x) / raster.CellSize));
            int x1 = Mathf.Min(raster.Width - 1, Mathf.CeilToInt((area.xMax - raster.Origin.x) / raster.CellSize));
            int y0 = Mathf.Max(0, Mathf.FloorToInt((area.yMin - raster.Origin.y) / raster.CellSize));
            int y1 = Mathf.Min(raster.Height - 1, Mathf.CeilToInt((area.yMax - raster.Origin.y) / raster.CellSize));

            for (int y = y0; y <= y1; y++)
            for (int x = x0; x <= x1; x++)
            {
                action(y * raster.Width + x, raster.CellToWorld(x, y));
            }
        }

        /// <summary>Flattens a rotated rectangle to one height and stamps its surface on it.</summary>
        static void FillRect(UrbanRaster pad, UrbanRaster weight, UrbanSurfaceRaster surface, UrbanRaster footprint,
            Vector2 centre, Vector2 size, float yaw, float height, UrbanSurface s, float cell, bool keepRoads)
        {
            Rect area = CityGeom.Bounds(centre, size, yaw, cell * 2f);
            float hx = size.x * 0.5f, hy = size.y * 0.5f;

            ForEachCell(pad, area, (idx, p) =>
            {
                Vector2 l = CityGeom.ToRectLocal(p, centre, yaw);
                if (Mathf.Abs(l.x) > hx || Mathf.Abs(l.y) > hy) return;
                if (footprint != null && footprint.Data[idx] < 0.04f) return;
                byte existing = surface.Data[idx];
                if (existing == (byte)UrbanSurface.Water) return;
                if (keepRoads && (existing == (byte)UrbanSurface.Asphalt || existing == (byte)UrbanSurface.RailBed)) return;

                pad.Data[idx] = height;
                if (weight.Data[idx] < 1f) weight.Data[idx] = 1f;
                surface.Data[idx] = (byte)s;
            });
        }
    }
}
