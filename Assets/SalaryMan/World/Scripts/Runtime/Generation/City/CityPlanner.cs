using System;
using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Lays out a city on the finished landscape: its wards, its road and rail networks, its
    /// blocks and every reserved building plot. Nothing is built here and no art is needed -
    /// the output is a plan, in world space, that says what goes where.
    ///
    /// The shape of the plan follows how a Japanese city actually grew: a castle or palace at
    /// the centre with the business district beside it, a commuter loop ringing the core with a
    /// terminus on it, radial lines out to the suburbs, and every ward laid out on its own grid
    /// at its own angle, so the map is a patchwork of grids rather than one.
    /// </summary>
    public static class CityPlanner
    {
        public static CityLayout Plan(KontoWorldSettings settings, CityTerrain terrain, UrbanSiteSpec site, Action<string, float> progress = null)
        {
            if (settings == null) throw new ArgumentNullException("settings");
            if (site == null) throw new ArgumentNullException("site");
            var planner = new Planner(settings, terrain, site);
            return planner.Run(progress);
        }

        // ------------------------------------------------------------------------------------

        sealed class WardSeed
        {
            public Vector2 Local;
            public Vector2 World;
            public DistrictKind Kind;
            public int Ring;
            public float Radius;
            public float Coreness;
            public float GridAngle;
            public string Name;
        }

        sealed class Planner
        {
            readonly KontoWorldSettings _s;
            readonly CityTerrain _t;
            readonly UrbanSiteSpec _site;
            readonly CityFrame _frame;
            readonly CityLayout _layout = new CityLayout();
            readonly CitySegmentIndex _claimed = new CitySegmentIndex(110f);
            readonly List<Vector3> _exclusions = new List<Vector3>();   // x, y, radius
            readonly List<WardSeed> _seeds = new List<WardSeed>();
            readonly int _seed;
            readonly float _meanRadius;

            Vector2 _coreLocal;
            Vector2 _coreWorld;
            Rect _areaBounds;
            int _terminusStationId = -1;

            public Planner(KontoWorldSettings settings, CityTerrain terrain, UrbanSiteSpec site)
            {
                _s = settings;
                _t = terrain;
                _site = site;
                _frame = CityFrame.Build(terrain.Land.Arc, site);
                _seed = settings.seed + 611 + Mathf.Abs(site.name != null ? site.name.GetHashCode() % 9973 : 0);
                _meanRadius = Mathf.Sqrt(Mathf.Max(60f, site.alongRadius) * Mathf.Max(60f, site.inlandRadius));
                _coreLocal = site.coreOffset;
                _coreWorld = _frame.ToWorld(_coreLocal);
            }

            // ---------------------------------------------------------------- driver

            public CityLayout Run(Action<string, float> progress)
            {
                _layout.name = _site.name;
                _layout.code = string.IsNullOrEmpty(_site.code) ? "CTY" : _site.code.ToUpperInvariant();
                _layout.seed = _seed;
                _layout.center = _frame.Origin;
                _layout.coreCenter = _coreWorld;
                _layout.alongAxis = _frame.Along;
                _layout.inlandAxis = _frame.Inland;
                _layout.alongRadius = _site.alongRadius;
                _layout.inlandRadius = _site.inlandRadius;

                Report(progress, "Choosing where the city can stand", 0.02f);
                RelocateCore();
                _layout.coreCenter = _coreWorld;
                ClaimRivers();

                _areaBounds = FootprintBounds();

                Report(progress, "Laying out wards", 0.10f);
                PlaceWards();

                Report(progress, "Reserving the palace grounds", 0.20f);
                ReservePalace();

                Report(progress, "Drawing the road network", 0.28f);
                BuildRoads();

                Report(progress, "Drawing the railways", 0.45f);
                BuildRails();

                Report(progress, "Parcelling out the blocks", 0.58f);
                BuildBlocks(progress);

                Report(progress, "Reserving the landmark sites", 0.94f);
                ReserveLandmarks();

                ComputeBounds();
                Report(progress, "City planned", 1f);
                return _layout;
            }

            /// <summary>
            /// Makes sure the city actually has ground under it. An anchor placed by hand can
            /// easily land in the sea, in a river, or on a slope nothing can be built on, and
            /// erosion moves the coastline every time the seed changes. Rather than generating a
            /// city underwater, the centre is walked out to the nearest ground that will hold it.
            /// </summary>
            void RelocateCore()
            {
                if (CoreGroundScore(_coreWorld) > 0f) return;

                float maxSearch = Mathf.Max(1400f, _meanRadius * 2.2f);
                float bestScore = 0f;
                Vector2 bestLocal = _coreLocal;

                for (float radius = 120f; radius <= maxSearch; radius += 120f)
                {
                    int samples = Mathf.Max(8, Mathf.RoundToInt(radius / 40f));
                    for (int i = 0; i < samples; i++)
                    {
                        float a = (i + Hash01((int)radius, i)) / samples * Mathf.PI * 2f;
                        Vector2 local = _coreLocal + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * radius;
                        float score = CoreGroundScore(_frame.ToWorld(local));
                        // Nearer is better, so the search stops as soon as a ring works.
                        if (score <= bestScore) continue;
                        bestScore = score;
                        bestLocal = local;
                    }
                    if (bestScore > 0f) break;
                }

                if (bestScore <= 0f)
                {
                    Debug.LogWarning("[Konto] " + _site.name + " has no buildable ground within "
                        + maxSearch.ToString("0") + " m of its anchor, so it will come out almost empty. "
                        + "Move its alongT / lateral, or its coreOffset, onto land.");
                    return;
                }

                float moved = Vector2.Distance(bestLocal, _coreLocal);
                _coreLocal = bestLocal;
                _coreWorld = _frame.ToWorld(_coreLocal);
                if (moved > 60f)
                {
                    Debug.Log("[Konto] " + _site.name + " was moved " + moved.ToString("0")
                        + " m from its anchor onto ground it can stand on.");
                }
            }

            /// <summary>How good a point is as the centre of a city: 0 means unusable.</summary>
            float CoreGroundScore(Vector2 world)
            {
                if (!_t.InsideWorld(world, 240f)) return 0f;
                if (_t.IsWater(world)) return 0f;
                if (_t.LandMask(world) < 0.9f) return 0f;
                float slope = _t.Slope(world);
                float slopeLimit = Mathf.Min(0.16f, _site.maxBuildSlope * 0.55f);
                if (slope > slopeLimit) return 0f;
                if (_t.Height(world) > _site.maxBuildAltitude * 0.8f) return 0f;
                return 1f + (slopeLimit - slope);
            }

            static void Report(Action<string, float> progress, string message, float t)
            {
                if (progress != null) progress(message, t);
            }

            // ---------------------------------------------------------------- site tests

            float Hash01(int a, int b)
            {
                return KontoNoise.White(_seed + 7717, a, b);
            }

            /// <summary>0 outside the city, 1 where it is solidly built up.</summary>
            float Footprint(Vector2 world)
            {
                return CityFootprint.Value(_site, _frame, _t, _layout, _seed, world);
            }

            /// <summary>1 inside a reclamation, 0 outside. Reclaimed ground is filled to above sea level.</summary>
            float FillMask(Vector2 world)
            {
                return CityFootprint.Fill(_layout, world);
            }

            bool Buildable(Vector2 world, float slopeLimit)
            {
                if (!_t.InsideWorld(world, 80f)) return false;
                if (FillMask(world) > 0.5f) return true;
                if (!_t.IsBuildableGround(world)) return false;
                return _t.Slope(world) <= slopeLimit;
            }

            bool InExclusion(Vector2 world, float extra)
            {
                for (int i = 0; i < _exclusions.Count; i++)
                {
                    var e = _exclusions[i];
                    float r = e.z + extra;
                    float dx = world.x - e.x, dy = world.y - e.y;
                    if (dx * dx + dy * dy < r * r) return true;
                }
                return false;
            }

            void Exclude(Vector2 world, float radius)
            {
                _exclusions.Add(new Vector3(world.x, world.y, radius));
            }

            /// <summary>Rivers and lakes claim their channel plus an embankment, and nothing is parcelled over them.</summary>
            void ClaimRivers()
            {
                var rivers = _t.Water.Rivers;
                if (rivers == null) return;
                for (int i = 0; i < rivers.Count; i++)
                {
                    var r = rivers[i];
                    if (r.Points == null || r.Points.Count < 2) continue;
                    for (int k = 1; k < r.Points.Count; k++)
                    {
                        Vector2 a = new Vector2(r.Points[k - 1].x, r.Points[k - 1].z);
                        Vector2 b = new Vector2(r.Points[k].x, r.Points[k].z);
                        float half = k < r.HalfWidths.Count ? r.HalfWidths[k] : 12f;
                        // Channel, plus the flood embankment and the service road on top of it.
                        _claimed.Add(a, b, Mathf.Max(14f, half + 13f));
                    }
                }
            }

            // ---------------------------------------------------------------- wards

            void PlaceWards()
            {
                var used = new HashSet<string>();
                var codes = new HashSet<string>();

                // A village has no business district: its centre is the shopping street by the
                // station, and everything around it is houses, paddy and a shrine.
                AddSeed(_coreLocal, IsVillage ? DistrictKind.Retail : DistrictKind.CoreBusiness, 0);

                if (_site.palaceGardens)
                {
                    // The palace sits beside the business district, the way the Imperial Palace
                    // sits against Marunouchi, with the ministries on its far side. Both are
                    // placed through the same ground test as everything else: a palace park
                    // dropped blindly lands on a hillside and takes half a square kilometre of
                    // the city's best ground out of use.
                    Vector2 wanted = _coreLocal + new Vector2(-_site.coreRadius * 0.95f, _site.coreRadius * 0.35f);
                    Vector2 palaceLocal;
                    // And it is never allowed to end up on top of the business district: a moated
                    // park takes half a square kilometre, and that is the half the towers want.
                    float keepClear = _site.palaceRadius + _site.coreRadius * 0.45f;
                    if (TryPlaceSeed(wanted, DistrictKind.Palace, 0, _site.coreRadius * 1.3f, out palaceLocal)
                        && Vector2.Distance(palaceLocal, _coreLocal) >= keepClear * 0.7f)
                    {
                        Vector2 ministries;
                        TryPlaceSeed(palaceLocal + new Vector2(-_site.palaceRadius * 1.5f, 0f),
                            DistrictKind.Civic, 1, _site.palaceRadius, out ministries);
                    }
                    else if (_seeds.Count > 1 && _seeds[_seeds.Count - 1].Kind == DistrictKind.Palace)
                    {
                        // Placed, but on top of the core: drop it and keep the business district.
                        _seeds.RemoveAt(_seeds.Count - 1);
                    }
                }

                int remaining = Mathf.Max(0, _site.wardCount - _seeds.Count);
                float[] ringFrac = { 0.42f, 0.70f, 0.94f };
                float[] ringWeight = { 1.0f, 1.7f, 2.2f };
                float weightSum = ringWeight[0] + ringWeight[1] + ringWeight[2];

                int placedInRings = 0;
                for (int ring = 0; ring < 3; ring++)
                {
                    int count = Mathf.Max(1, Mathf.RoundToInt(remaining * ringWeight[ring] / weightSum));
                    // Keep the total honest: rounding three ring shares up overshoots wardCount.
                    count = Mathf.Min(count, Mathf.Max(0, remaining - placedInRings));
                    if (ring == 2) count = Mathf.Max(0, remaining - placedInRings);
                    placedInRings += count;
                    float phase = Hash01(ring * 31 + 3, 17) * Mathf.PI * 2f;

                    for (int k = 0; k < count; k++)
                    {
                        float jitter = (Hash01(ring * 101 + k, 53) - 0.5f) * 0.55f;
                        float angle = phase + (k + jitter) / count * Mathf.PI * 2f;
                        float rf = ringFrac[ring] * (0.88f + Hash01(ring * 211 + k, 97) * 0.24f);

                        Vector2 local = Vector2.zero;
                        bool placed = false;
                        for (int attempt = 0; attempt < 5 && !placed; attempt++)
                        {
                            float shrink = 1f - attempt * 0.14f;
                            local = _coreLocal + new Vector2(
                                Mathf.Cos(angle) * _site.alongRadius * rf * shrink,
                                Mathf.Sin(angle) * _site.inlandRadius * rf * shrink);
                            Vector2 world = _frame.ToWorld(local);
                            if (!_t.InsideWorld(world, 140f)) continue;
                            // A seed may sit on water: that is where the docks and the made
                            // ground go, so it is allowed, but only in the bay near the city.
                            if (Footprint(world) > 0.25f || (_t.IsWater(world) && InBay(local))) placed = true;
                        }
                        if (!placed) continue;

                        DistrictKind kind = ChooseKind(local, ring, k);
                        Vector2 seedWorld = _frame.ToWorld(local);
                        if (kind == DistrictKind.Park && (_t.IsWater(seedWorld) || _t.LandMask(seedWorld) < 0.55f)) continue;
                        AddSeed(local, kind, ring + 1);
                    }
                }

                // Reclamation is decided before the footprint is queried in anger, so the fill
                // shapes exist by the time blocks are parcelled out.
                BuildFills();

                // Ward radius comes from how far apart the seeds ended up.
                for (int i = 0; i < _seeds.Count; i++)
                {
                    float nearest = float.MaxValue;
                    for (int k = 0; k < _seeds.Count; k++)
                    {
                        if (k == i) continue;
                        float d = Vector2.Distance(_seeds[i].Local, _seeds[k].Local);
                        if (d < nearest) nearest = d;
                    }
                    if (nearest > 1e5f) nearest = _meanRadius * 0.5f;

                    var seed = _seeds[i];
                    seed.Radius = Mathf.Clamp(nearest * 1.15f, 170f, 900f);
                    float coreDist = Vector2.Distance(seed.Local, _coreLocal);
                    seed.Coreness = Mathf.Clamp01(1f - coreDist / (_meanRadius * 1.05f));

                    // Each ward's grid points its own way. In the core it lines up with the bay.
                    float baseYaw = CityGeom.YawFrom(_frame.Along);
                    float spread = seed.Kind == DistrictKind.CoreBusiness || seed.Kind == DistrictKind.Reclaimed ? 8f : 44f;
                    seed.GridAngle = baseYaw + KontoNoise.Fbm(seed.World.x / 900f, seed.World.y / 900f, _seed + 52003, 2) * spread;

                    seed.Name = CityNames.NextWardName(seed.Kind, _seed + i * 17, used);
                    _seeds[i] = seed;

                    var ward = new CityWard
                    {
                        name = seed.Name,
                        code = CityNames.WardCode(seed.Name, codes),
                        kind = seed.Kind,
                        center = seed.World,
                        radius = seed.Radius,
                        gridAngle = seed.GridAngle,
                        coreness = seed.Coreness,
                        groundY = _t.Height(seed.World),
                        firstBlock = 0,
                        blockCount = 0,
                    };
                    _layout.wards.Add(ward);
                }
            }

            /// <summary>
            /// Places a ward as near a wanted spot as the ground allows, spiralling outward until
            /// it finds somewhere a district could actually be built.
            /// </summary>
            bool TryPlaceSeed(Vector2 wanted, DistrictKind kind, int ring, float searchRadius, out Vector2 placed)
            {
                placed = wanted;
                if (Footprint(_frame.ToWorld(wanted)) > 0.45f)
                {
                    AddSeed(wanted, kind, ring);
                    return true;
                }

                for (float radius = 90f; radius <= searchRadius; radius += 90f)
                {
                    int samples = Mathf.Max(8, Mathf.RoundToInt(radius / 45f));
                    for (int i = 0; i < samples; i++)
                    {
                        float a = (i + Hash01((int)radius, i * 7)) / samples * Mathf.PI * 2f;
                        Vector2 local = wanted + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * radius;
                        if (Footprint(_frame.ToWorld(local)) <= 0.45f) continue;
                        placed = local;
                        AddSeed(local, kind, ring);
                        return true;
                    }
                }
                return false;
            }

            void AddSeed(Vector2 local, DistrictKind kind, int ring)
            {
                _seeds.Add(new WardSeed
                {
                    Local = local,
                    World = _frame.ToWorld(local),
                    Kind = kind,
                    Ring = ring,
                });
            }

            bool InBay(Vector2 local)
            {
                if (_site.bay == null || !_site.bay.carve) return false;
                return CityBay.Shape(_site.bay, local, _frame.ToWorld(local), _seed) > 0.05f;
            }

            static readonly DistrictKind[] Ring1 =
            {
                DistrictKind.StationFront, DistrictKind.Office, DistrictKind.Retail, DistrictKind.Nightlife,
                DistrictKind.Office, DistrictKind.Apartments, DistrictKind.Retail, DistrictKind.Civic,
            };
            static readonly DistrictKind[] Ring2 =
            {
                DistrictKind.Apartments, DistrictKind.Residential, DistrictKind.University, DistrictKind.Park,
                DistrictKind.Apartments, DistrictKind.Residential, DistrictKind.Shrine, DistrictKind.Retail,
            };
            /// <summary>True for a small rural settlement rather than a city.</summary>
            bool IsVillage
            {
                get { return !_site.capital && Mathf.Max(_site.alongRadius, _site.inlandRadius) < 900f; }
            }

            static readonly DistrictKind[] VillageRing1 =
            {
                DistrictKind.Residential, DistrictKind.Shrine, DistrictKind.Retail, DistrictKind.Residential,
            };
            static readonly DistrictKind[] VillageRing2 =
            {
                DistrictKind.Residential, DistrictKind.Park, DistrictKind.Suburb, DistrictKind.Shrine,
            };

            static readonly DistrictKind[] Ring3 =
            {
                DistrictKind.Suburb, DistrictKind.Residential, DistrictKind.Suburb, DistrictKind.Park,
                DistrictKind.RailYard, DistrictKind.Industrial, DistrictKind.Suburb, DistrictKind.Residential,
            };

            int _reclaimedWards;
            int _portWards;
            int _waterfrontWards;

            DistrictKind ChooseKind(Vector2 local, int ring, int index)
            {
                Vector2 world = _frame.ToWorld(local);

                // Geography decides first: water, then shoreline, then river bank.
                bool water = _t.IsWater(world) || _t.LandMask(world) < 0.55f;
                if (water)
                {
                    // Docks and made ground belong to a port city on a bay. A mountain village
                    // whose seed landed in a lake just loses that seed.
                    bool hasBay = _site.bay != null && _site.bay.carve;
                    if (!hasBay) return DistrictKind.Park;

                    // Made ground is expensive and a city only ever has a few patches of it, so
                    // the number of water wards is capped however much water the seeds hit.
                    bool canReclaim = _site.reclaimBay && _reclaimedWards < 2;
                    bool canPort = _portWards < 2;
                    if (canPort && (!canReclaim || Hash01(index * 13 + ring, 71) < 0.5f))
                    {
                        _portWards++;
                        return DistrictKind.Port;
                    }
                    if (canReclaim)
                    {
                        _reclaimedWards++;
                        return DistrictKind.Reclaimed;
                    }
                    // Out of made ground: this seed is not worth a ward.
                    return DistrictKind.Park;
                }

                float coast = _t.CoastDistance(world);
                if (coast < 210f)
                {
                    if (ring >= 2 && _portWards < 2 && Hash01(index * 29, 31) < 0.45f)
                    {
                        _portWards++;
                        return DistrictKind.Port;
                    }
                    // A city has a waterfront, not five of them: past that, a ward near the water
                    // is just an ordinary ward that happens to have a view.
                    if (_waterfrontWards < 2)
                    {
                        _waterfrontWards++;
                        return DistrictKind.Waterfront;
                    }
                }
                if (_t.Flow(world) > 0.55f && ring >= 2 && Hash01(index * 37, 41) < 0.5f) return DistrictKind.Industrial;

                DistrictKind[] pool;
                if (IsVillage) pool = ring <= 1 ? VillageRing1 : VillageRing2;
                else pool = ring <= 1 ? Ring1 : (ring == 2 ? Ring2 : Ring3);
                int offset = Mathf.Abs(_seed / 7 + index * 3);
                return pool[offset % pool.Length];
            }

            /// <summary>
            /// Made ground. Every Japanese port city stands partly on it: the flat rectangles
            /// out in the bay that hold the container terminal, the exhibition halls and the
            /// newest towers.
            /// </summary>
            void BuildFills()
            {
                if (_site.bay == null || !_site.bay.carve || !_site.reclaimBay) return;

                int made = 0;
                for (int i = 0; i < _seeds.Count && made < 4; i++)
                {
                    var seed = _seeds[i];
                    if (seed.Kind != DistrictKind.Reclaimed && seed.Kind != DistrictKind.Port) continue;
                    if (!_t.IsWater(seed.World) && _t.LandMask(seed.World) > 0.6f) continue;

                    float along = 520f + Hash01(i * 71, 13) * 620f;
                    float across = 420f + Hash01(i * 73, 17) * 480f;
                    var fill = new CityFill
                    {
                        name = seed.Kind == DistrictKind.Port ? "Wharf fill" : "Reclaimed island",
                        center = seed.World,
                        size = new Vector2(along, across),
                        rotation = CityGeom.YawFrom(_frame.Along) + (Hash01(i * 79, 19) - 0.5f) * 14f,
                        height = _site.reclaimHeight,
                    };
                    _layout.fills.Add(fill);
                    made++;
                }
            }

            public int NearestWard(Vector2 world)
            {
                int best = -1;
                float bestDist = float.MaxValue;
                for (int i = 0; i < _seeds.Count; i++)
                {
                    float d = (_seeds[i].World - world).sqrMagnitude;
                    if (d >= bestDist) continue;
                    bestDist = d;
                    best = i;
                }
                return best;
            }

            // ---------------------------------------------------------------- palace

            void ReservePalace()
            {
                if (!_site.palaceGardens) return;
                int wardIndex = -1;
                for (int i = 0; i < _layout.wards.Count; i++)
                {
                    if (_layout.wards[i].kind != DistrictKind.Palace) continue;
                    wardIndex = i;
                    break;
                }
                if (wardIndex < 0) return;

                Vector2 center = _layout.wards[wardIndex].center;
                float radius = _site.palaceRadius;

                // Nothing else is parcelled inside the moat, or on it.
                Exclude(center, radius + _site.moatWidth + 22f);

                _layout.reservations.Add(new CityReservation
                {
                    name = "Gosho Gardens",
                    note = "Moated palace park at the centre of the city. Walls, gates, gardens and a keep go inside the moat; nothing is parcelled here.",
                    plotId = -1,
                    center = center,
                    radius = radius,
                });
            }

            // ---------------------------------------------------------------- roads

            void BuildRoads()
            {
                // Ring roads, as ellipses around the core.
                for (int ring = 0; ring < _site.ringCount; ring++)
                {
                    float frac = Mathf.Lerp(0.34f, 0.95f, _site.ringCount <= 1 ? 0.6f : ring / (float)(_site.ringCount - 1));
                    var road = new CityRoad
                    {
                        name = CityNames.RingRoadName(ring),
                        klass = ring == 0 ? RoadClass.Arterial : RoadClass.Arterial,
                        halfWidth = ring == 0 ? 13f : 11f,
                        loop = true,
                    };
                    int steps = 128;
                    for (int i = 0; i < steps; i++)
                    {
                        float a = i / (float)steps * Mathf.PI * 2f;
                        Vector2 dir = new Vector2(Mathf.Cos(a), Mathf.Sin(a));
                        Vector2 local = _coreLocal + new Vector2(
                            dir.x * _site.alongRadius * frac,
                            dir.y * _site.inlandRadius * frac);
                        Vector2 world = _frame.ToWorld(local);
                        float wobble = KontoNoise.Fbm(world.x / 520f, world.y / 520f, _seed + 53003 + ring * 17, 2);
                        local += dir * wobble * 90f;
                        road.points.Add(ToPoint(_frame.ToWorld(local)));
                    }
                    AddRoad(road);
                }

                // Radial arterials out of the core, picking the easiest ground as they go.
                float phase = Hash01(5, 9) * Mathf.PI * 2f;
                for (int i = 0; i < _site.radialCount; i++)
                {
                    float bearing = phase + i / (float)_site.radialCount * Mathf.PI * 2f;
                    string wardName = _layout.wards.Count > 0 ? _layout.wards[i % _layout.wards.Count].name : "Kanmei";
                    var road = new CityRoad
                    {
                        name = CityNames.RoadName(RoadClass.Arterial, i, wardName),
                        klass = RoadClass.Arterial,
                        halfWidth = 12f,
                    };
                    TraceRadial(road, bearing, i);
                    if (road.points.Count > 3) AddRoad(road);
                }

                if (_site.expressway) BuildExpressway();
                BuildWaterfront();
            }

            Vector3 ToPoint(Vector2 world)
            {
                return new Vector3(world.x, _t.Height(world), world.y);
            }

            void AddRoad(CityRoad road)
            {
                _layout.roads.Add(road);
                if (!road.elevated)
                {
                    // Roads on the ground claim their carriageway and their footways, and little
                    // more: every extra metre here is ground no building can stand on.
                    _claimed.AddPath(road.points, road.halfWidth + 4f, road.loop);
                }
            }

            /// <summary>
            /// Walks an arterial out from the core. At every step it looks at three bearings and
            /// takes the one with the least climb, which is how real roads end up following
            /// valleys and skirting hills instead of running dead straight over them.
            /// </summary>
            void TraceRadial(CityRoad road, float bearing, int index)
            {
                const float step = 55f;
                // Radials start on the edge of the business district rather than at its centre:
                // nine arterials meeting at one point leaves no ground to build on for hundreds
                // of metres around it.
                Vector2 dir0 = new Vector2(Mathf.Cos(bearing), Mathf.Sin(bearing));
                Vector2 local = _coreLocal + dir0 * (_site.coreRadius * 0.45f);
                road.points.Add(ToPoint(_frame.ToWorld(_coreLocal + dir0 * (_site.coreRadius * 0.2f))));
                road.points.Add(ToPoint(_frame.ToWorld(local)));

                float maxLength = _meanRadius * 2.4f + 900f;
                float travelled = 0f;
                int guard = 0;

                while (travelled < maxLength && guard++ < 400)
                {
                    float bestCost = float.MaxValue;
                    float bestBearing = bearing;
                    Vector2 bestLocal = local;

                    for (int k = -1; k <= 1; k++)
                    {
                        float candidate = bearing + k * 9f * Mathf.Deg2Rad;
                        Vector2 next = local + new Vector2(Mathf.Cos(candidate), Mathf.Sin(candidate)) * step;
                        Vector2 world = _frame.ToWorld(next);
                        if (!_t.InsideWorld(world, 90f)) continue;

                        float cost = Mathf.Abs(k) * 0.35f;
                        cost += _t.Slope(world) * 9f;
                        if (_t.IsWater(world)) cost += 6f;               // crossings are allowed, but cost a bridge
                        cost += Mathf.Max(0f, _t.Height(world) - 220f) * 0.01f;
                        if (cost >= bestCost) continue;
                        bestCost = cost;
                        bestBearing = candidate;
                        bestLocal = next;
                    }

                    if (bestCost > 1e5f) break;
                    bearing = bestBearing;
                    local = bestLocal;
                    travelled += step;
                    road.points.Add(ToPoint(_frame.ToWorld(local)));

                    // Stop once the road is well clear of the city and running through open country.
                    Vector2 w = _frame.ToWorld(local);
                    if (travelled > _meanRadius * 1.2f && Footprint(w) <= 0.01f) break;
                    if (!_t.InsideWorld(w, 140f)) break;
                }
            }

            /// <summary>The elevated urban expressway: a loop inside the first ring, plus two spurs.</summary>
            void BuildExpressway()
            {
                var loop = new CityRoad
                {
                    name = CityNames.RoadName(RoadClass.Expressway, 0, _layout.name),
                    klass = RoadClass.Expressway,
                    halfWidth = 10.5f,
                    elevated = true,
                    deckClearance = 13f,
                    loop = true,
                };
                int steps = 96;
                for (int i = 0; i < steps; i++)
                {
                    float a = i / (float)steps * Mathf.PI * 2f;
                    Vector2 dir = new Vector2(Mathf.Cos(a), Mathf.Sin(a));
                    Vector2 local = _coreLocal + new Vector2(
                        dir.x * _site.alongRadius * 0.30f,
                        dir.y * _site.inlandRadius * 0.34f);
                    loop.points.Add(ToPoint(_frame.ToWorld(local)));
                }
                AddRoad(loop);

                for (int spur = 0; spur < 2; spur++)
                {
                    float bearing = (spur == 0 ? 0.35f : 3.6f) + Hash01(spur * 61, 5) * 0.4f;
                    var road = new CityRoad
                    {
                        name = CityNames.RoadName(RoadClass.Expressway, spur + 1, _layout.name),
                        klass = RoadClass.Expressway,
                        halfWidth = 9.5f,
                        elevated = true,
                        deckClearance = 13f,
                    };
                    Vector2 dir = new Vector2(Mathf.Cos(bearing), Mathf.Sin(bearing));
                    for (int i = 0; i <= 42; i++)
                    {
                        Vector2 local = _coreLocal + dir * (_meanRadius * 0.32f + i * 70f);
                        Vector2 world = _frame.ToWorld(local);
                        if (!_t.InsideWorld(world, 120f)) break;
                        road.points.Add(ToPoint(world));
                    }
                    if (road.points.Count > 3) AddRoad(road);
                }
            }

            /// <summary>A promenade along the bay shore, and a boulevard behind it.</summary>
            void BuildWaterfront()
            {
                if (_site.bay == null || !_site.bay.carve) return;

                var promenade = new CityRoad
                {
                    name = CityNames.RoadName(RoadClass.Promenade, 0, _layout.name),
                    klass = RoadClass.Promenade,
                    halfWidth = 5.5f,
                };
                var boulevard = new CityRoad
                {
                    name = CityNames.RoadName(RoadClass.Avenue, 0, "Nagisa"),
                    klass = RoadClass.Avenue,
                    halfWidth = 9f,
                };

                // Walk the bay outline and offset it inland: the quay, then the road behind it.
                int steps = 72;
                for (int i = 0; i <= steps; i++)
                {
                    float t = i / (float)steps;
                    Vector2 shore = CityBay.OutlinePoint(_site.bay, t);
                    Vector2 inward = (shore - new Vector2(_site.bay.alongOffset, _site.bay.inlandReach - _site.bay.depth * 0.5f)).normalized;
                    Vector2 quayLocal = shore - inward * 14f;
                    Vector2 roadLocal = shore - inward * 46f;

                    Vector2 quayWorld = _frame.ToWorld(quayLocal);
                    Vector2 roadWorld = _frame.ToWorld(roadLocal);
                    if (!_t.InsideWorld(quayWorld, 80f)) continue;
                    promenade.points.Add(ToPoint(quayWorld));
                    if (_t.InsideWorld(roadWorld, 80f)) boulevard.points.Add(ToPoint(roadWorld));
                }

                if (promenade.points.Count > 4) AddRoad(promenade);
                if (boulevard.points.Count > 4) AddRoad(boulevard);
            }

            // ---------------------------------------------------------------- rail

            void BuildRails()
            {
                // The central terminus: on the core's edge, facing the business district. This is
                // where the player's commute starts and ends, so it is placed before the lines.
                Vector2 terminusLocal = _coreLocal + new Vector2(_site.coreRadius * 0.72f, -_site.coreRadius * 0.10f);
                // The terminus is the single most important building in the game, so it is not
                // allowed to end up in the bay or in a river.
                if (Footprint(_frame.ToWorld(terminusLocal)) < 0.5f)
                {
                    for (float radius = 80f; radius <= _site.coreRadius * 1.6f; radius += 80f)
                    {
                        bool found = false;
                        for (int i = 0; i < 12 && !found; i++)
                        {
                            float a = (i + Hash01((int)radius, i * 3)) / 12f * Mathf.PI * 2f;
                            Vector2 candidate = terminusLocal + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * radius;
                            if (Footprint(_frame.ToWorld(candidate)) < 0.5f) continue;
                            terminusLocal = candidate;
                            found = true;
                        }
                        if (found) break;
                    }
                }
                Vector2 terminusWorld = _frame.ToWorld(terminusLocal);
                float terminusYaw = CityGeom.YawFrom(_frame.Along);

                // A village gets a halt with one platform, not a fourteen platform terminus.
                bool hasNetwork = _site.railLoop || _site.railRadialCount > 0 || _site.shinkansen;
                if (hasNetwork)
                {
                    _terminusStationId = AddStation(_layout.name + " Central", terminusWorld,
                        new Vector2(330f, 105f), terminusYaw, true, false, 14);
                }
                else
                {
                    _terminusStationId = AddStation(_layout.name + " Station", terminusWorld,
                        new Vector2(78f, 26f), terminusYaw, false, false, 1);
                }

                if (_site.railLoop)
                {
                    var loop = new CityRail
                    {
                        name = CityNames.RailLineName(RailClass.Loop, 0, _layout.name),
                        klass = RailClass.Loop,
                        halfWidth = 9f,
                        elevated = true,
                        deckClearance = 9.5f,
                        loop = true,
                    };
                    int steps = 84;
                    float radius = Mathf.Max(420f, _site.coreRadius * 1.55f);
                    for (int i = 0; i < steps; i++)
                    {
                        float a = i / (float)steps * Mathf.PI * 2f;
                        float r = radius * (1f + KontoNoise.Fbm(Mathf.Cos(a) * 2.1f, Mathf.Sin(a) * 2.1f, _seed + 54011, 2) * 0.09f);
                        Vector2 local = _coreLocal + new Vector2(Mathf.Cos(a) * r * 1.15f, Mathf.Sin(a) * r);
                        loop.points.Add(ToPoint(_frame.ToWorld(local)));
                    }
                    AddRail(loop);
                    PlaceStationsAlong(loop, 620f, false);
                }

                // Commuter lines out to the suburbs and the villages past them. The line the
                // player arrives on is one of these.
                float phase = Hash01(11, 23) * Mathf.PI * 2f;
                for (int i = 0; i < _site.railRadialCount; i++)
                {
                    float bearing = phase + i / (float)Mathf.Max(1, _site.railRadialCount) * Mathf.PI * 2f;
                    var line = new CityRail
                    {
                        name = CityNames.RailLineName(RailClass.Radial, i, DestinationName(i)),
                        klass = RailClass.Radial,
                        halfWidth = 7.5f,
                    };

                    Vector2 dir = new Vector2(Mathf.Cos(bearing), Mathf.Sin(bearing));
                    Vector2 local = terminusLocal;
                    line.points.Add(ToPoint(_frame.ToWorld(local)));
                    for (int step = 0; step < 90; step++)
                    {
                        // Railways bend far less than roads do.
                        float drift = KontoNoise.Fbm(step * 0.11f, i * 3.7f, _seed + 55021, 2) * 0.05f;
                        dir = new Vector2(
                            dir.x * Mathf.Cos(drift) - dir.y * Mathf.Sin(drift),
                            dir.x * Mathf.Sin(drift) + dir.y * Mathf.Cos(drift)).normalized;
                        local += dir * 85f;
                        Vector2 world = _frame.ToWorld(local);
                        if (!_t.InsideWorld(world, 110f)) break;
                        line.points.Add(ToPoint(world));
                        if (Vector2.Distance(local, _coreLocal) > _meanRadius * 1.9f) break;
                    }
                    if (line.points.Count < 4) continue;
                    AddRail(line);
                    PlaceStationsAlong(line, 780f, true);
                }

                if (_site.shinkansen)
                {
                    var line = new CityRail
                    {
                        name = CityNames.RailLineName(RailClass.Shinkansen, 0, _layout.name),
                        klass = RailClass.Shinkansen,
                        halfWidth = 11f,
                        elevated = true,
                        deckClearance = 12f,
                    };
                    // Straight, through the terminus, running the length of the coast.
                    for (int i = -30; i <= 30; i++)
                    {
                        Vector2 local = terminusLocal + new Vector2(i * 180f, i * 12f);
                        Vector2 world = _frame.ToWorld(local);
                        if (!_t.InsideWorld(world, 110f)) continue;
                        line.points.Add(ToPoint(world));
                    }
                    if (line.points.Count > 3) AddRail(line);
                }

                // Freight to the docks, and two subway lines recorded for later.
                BuildFreightLine();
                for (int i = 0; i < 2; i++)
                {
                    var subway = new CityRail
                    {
                        name = CityNames.RailLineName(RailClass.Subway, i, _layout.name),
                        klass = RailClass.Subway,
                        halfWidth = 6f,
                        underground = true,
                    };
                    float bearing = 0.6f + i * 1.9f;
                    Vector2 dir = new Vector2(Mathf.Cos(bearing), Mathf.Sin(bearing));
                    for (int k = -18; k <= 18; k++)
                    {
                        Vector2 world = _frame.ToWorld(_coreLocal + dir * (k * 120f));
                        if (!_t.InsideWorld(world, 100f)) continue;
                        subway.points.Add(ToPoint(world));
                    }
                    if (subway.points.Count > 3) _layout.rails.Add(subway);
                }
            }

            string DestinationName(int index)
            {
                // Radial lines are named after where they end up, which is out of the city.
                string[] places = { "Hazukidai", "Kuzunohara", "Oyamada", "Tamagawara", "Suzuriyama", "Shimogawa", "Momijidai", "Kamiyanagi" };
                return places[Mathf.Abs(_seed / 3 + index) % places.Length];
            }

            void BuildFreightLine()
            {
                int portWard = -1;
                for (int i = 0; i < _layout.wards.Count; i++)
                {
                    if (_layout.wards[i].kind != DistrictKind.Port) continue;
                    portWard = i;
                    break;
                }
                int yardWard = -1;
                for (int i = 0; i < _layout.wards.Count; i++)
                {
                    if (_layout.wards[i].kind != DistrictKind.RailYard && _layout.wards[i].kind != DistrictKind.Industrial) continue;
                    yardWard = i;
                    break;
                }
                if (portWard < 0 || yardWard < 0) return;

                var line = new CityRail
                {
                    name = CityNames.RailLineName(RailClass.Freight, 0, _layout.name),
                    klass = RailClass.Freight,
                    halfWidth = 8f,
                };
                Vector2 a = _layout.wards[yardWard].center;
                Vector2 b = _layout.wards[portWard].center;
                int steps = Mathf.Max(6, Mathf.RoundToInt(Vector2.Distance(a, b) / 90f));
                for (int i = 0; i <= steps; i++)
                {
                    Vector2 world = Vector2.Lerp(a, b, i / (float)steps);
                    if (!_t.InsideWorld(world, 90f)) continue;
                    line.points.Add(ToPoint(world));
                }
                if (line.points.Count > 3) AddRail(line);
            }

            void AddRail(CityRail line)
            {
                _layout.rails.Add(line);
                if (!line.underground && !line.elevated)
                {
                    _claimed.AddPath(line.points, line.halfWidth + 9f, line.loop);
                }
                else if (line.elevated)
                {
                    // Viaducts still stop a block being laid out underneath them.
                    _claimed.AddPath(line.points, line.halfWidth + 1.5f, line.loop);
                }
            }

            int AddStation(string name, Vector2 world, Vector2 size, float yaw, bool terminus, bool elevated, int platforms)
            {
                int id = _layout.stations.Count;
                var station = new CityStation
                {
                    id = id,
                    name = name,
                    ward = NearestWard(world),
                    center = world,
                    size = size,
                    rotation = yaw,
                    groundY = _t.Height(world),
                    terminus = terminus,
                    elevated = elevated,
                    platformCount = platforms,
                    plotId = -1,
                };
                _layout.stations.Add(station);

                // A station claims its box and the plaza in front of it, as a strip along the
                // platforms. Claiming a disc the size of its longest side instead would swallow
                // a quarter of a square kilometre per station and leave the city with no blocks.
                Vector2 ax, az;
                CityGeom.Axes(yaw, out ax, out az);
                Vector2 end = ax * (size.x * 0.5f);
                _claimed.Add(world - end, world + end, size.y * 0.75f + 16f);
                return id;
            }

            /// <summary>Drops stations along a line at roughly the given spacing, named after the ward they serve.</summary>
            void PlaceStationsAlong(CityRail line, float spacing, bool elevatedOutsideCore)
            {
                float since = spacing * 0.55f;
                var usedNames = new HashSet<string>();
                for (int i = 1; i < line.points.Count; i++)
                {
                    Vector2 a = new Vector2(line.points[i - 1].x, line.points[i - 1].z);
                    Vector2 b = new Vector2(line.points[i].x, line.points[i].z);
                    since += Vector2.Distance(a, b);
                    if (since < spacing) continue;
                    since = 0f;

                    if (_t.IsWater(b) || !_t.InsideWorld(b, 120f)) continue;
                    if (InExclusion(b, 40f)) continue;
                    // No stations out on a mountainside: the line passes, it does not stop. The
                    // box is big, so the ground under all of it has to be usable, not just the
                    // point the line happens to cross.
                    if (Footprint(b) < 0.40f) continue;
                    if (!Buildable(b, _site.maxPlatformSlope * 1.6f)) continue;

                    int ward = NearestWard(b);
                    string wardName = ward >= 0 && ward < _layout.wards.Count ? _layout.wards[ward].name : "Kanmei";
                    bool secondary = !usedNames.Add(wardName);
                    string name = CityNames.StationName(wardName, false, secondary);

                    Vector2 dir = (b - a).normalized;
                    float yaw = CityGeom.YawFrom(dir);
                    bool elevated = line.elevated || (elevatedOutsideCore && Vector2.Distance(_frame.ToLocal(b), _coreLocal) < _site.coreRadius * 1.3f);
                    int id = AddStation(name + " Station", b, new Vector2(170f, 62f), yaw, false, elevated, 2);
                    line.stationIds.Add(id);
                }
            }

            // ---------------------------------------------------------------- blocks and plots

            void BuildBlocks(Action<string, float> progress)
            {
                int plotCap = Mathf.Max(500, _s.maxCityPlots);
                BuildStationPlots();
                var wardBounds = MeasureWardBounds();

                for (int w = 0; w < _layout.wards.Count; w++)
                {
                    if (progress != null)
                        progress("Parcelling " + _layout.wards[w].name, 0.58f + 0.36f * w / Mathf.Max(1, _layout.wards.Count));

                    var ward = _layout.wards[w];
                    ward.firstBlock = _layout.blocks.Count;

                    if (ward.kind == DistrictKind.Palace) BuildPalaceGrounds(w, ward);
                    else BuildWardGrid(w, ward, wardBounds[w], plotCap);

                    ward.blockCount = _layout.blocks.Count - ward.firstBlock;

                    if (_layout.plots.Count >= plotCap)
                    {
                        Debug.LogWarning("[Konto] City plot cap of " + plotCap + " reached while parcelling " + ward.name
                            + ". Raise Max City Plots in the world settings, or make the districts coarser.");
                        break;
                    }
                }

                for (int i = 0; i < _layout.plots.Count; i++)
                {
                    int w = _layout.plots[i].ward;
                    if (w < 0 || w >= _layout.wards.Count) continue;
                    _layout.wards[w].plotCount++;
                }

                // Worth printing: if a city comes out thin, this says which test threw the blocks
                // away, and therefore which setting to change.
                Debug.Log(string.Format(
                    "[Konto] {0} blocks: {1} laid out, rejected {2} outside the ward, {3} outside the city, "
                    + "{4} on reserved ground, {5} on ground too steep or wet, {6} under a road or railway.",
                    _layout.name, _rejects[5], _rejects[0], _rejects[1], _rejects[2], _rejects[3], _rejects[4]));
            }

            /// <summary>
            /// Every station gets a plot of its own, so a station building can be dropped on it
            /// exactly like any other building, and the plaza in front of it is already paved.
            /// </summary>
            void BuildStationPlots()
            {
                for (int i = 0; i < _layout.stations.Count; i++)
                {
                    var station = _layout.stations[i];
                    int wardIndex = station.ward >= 0 ? station.ward : 0;
                    if (wardIndex >= _layout.wards.Count) continue;

                    int blockId = _layout.blocks.Count;
                    var block = new CityBlock
                    {
                        id = blockId,
                        ward = wardIndex,
                        wardBlockNumber = 900 + i,
                        center = station.center,
                        size = station.size,
                        rotation = station.rotation,
                        firstPlot = _layout.plots.Count,
                        plotCount = 0,
                    };

                    int plotId = _layout.plots.Count;
                    AddPlot(wardIndex, blockId, 0, station.center, station.size, station.rotation,
                        PlotKind.Station, station.terminus ? 5 : 2, false);

                    block.plotCount = _layout.plots.Count - block.firstPlot;
                    _layout.blocks.Add(block);

                    station.plotId = plotId;
                    _layout.stations[i] = station;
                }
            }

            void BuildPalaceGrounds(int wardIndex, CityWard ward)
            {
                float r = _site.palaceRadius;
                int blockId = _layout.blocks.Count;
                var block = new CityBlock
                {
                    id = blockId,
                    ward = wardIndex,
                    wardBlockNumber = 1,
                    center = ward.center,
                    size = new Vector2(r * 1.6f, r * 1.6f),
                    rotation = ward.gridAngle,
                    firstPlot = _layout.plots.Count,
                    plotCount = 0,
                };

                // The grounds, and a keep platform in the middle of them.
                AddPlot(wardIndex, blockId, 0, ward.center, new Vector2(r * 1.55f, r * 1.55f), ward.gridAngle,
                    PlotKind.ParkSpace, 1, false);
                AddPlot(wardIndex, blockId, 1, ward.center, new Vector2(r * 0.42f, r * 0.34f), ward.gridAngle,
                    PlotKind.Civic, 3, false);

                block.plotCount = _layout.plots.Count - block.firstPlot;
                _layout.blocks.Add(block);
            }

            int[] _rejects = new int[6];

            void BuildWardGrid(int wardIndex, CityWard ward, Rect wardBounds, int plotCap)
            {
                var profile = DistrictProfiles.Get(ward.kind);
                var grid = CityWardGrid.For(ward, wardIndex, _seed);

                // Walk the grid over the ward's own ground, in the ward's own grid coordinates.
                int iMin = int.MaxValue, iMax = int.MinValue, jMin = int.MaxValue, jMax = int.MinValue;
                for (int corner = 0; corner < 4; corner++)
                {
                    Vector2 p = new Vector2(
                        (corner & 1) == 0 ? wardBounds.xMin : wardBounds.xMax,
                        (corner & 2) == 0 ? wardBounds.yMin : wardBounds.yMax);
                    Vector2 g = CityGeom.ToRectLocal(p, grid.Origin, grid.Yaw);
                    int gi = Mathf.FloorToInt(g.x / grid.Sx);
                    int gj = Mathf.FloorToInt(g.y / grid.Sy);
                    if (gi < iMin) iMin = gi;
                    if (gi > iMax) iMax = gi;
                    if (gj < jMin) jMin = gj;
                    if (gj > jMax) jMax = gj;
                }
                iMin--; jMin--; iMax++; jMax++;
                int blockNumber = 0;

                for (int j = jMin; j <= jMax; j++)
                for (int i = iMin; i <= iMax; i++)
                {
                    if (_layout.plots.Count >= plotCap) return;

                    Vector2 center, size;
                    grid.Block(i, j, out center, out size);
                    if (size.x < 13f || size.y < 13f) continue;
                    if (NearestWard(center) != wardIndex) { _rejects[0]++; continue; }
                    if (Footprint(center) < 0.32f) { _rejects[1]++; continue; }
                    if (InExclusion(center, Mathf.Max(size.x, size.y) * 0.35f)) { _rejects[2]++; continue; }
                    if (!BlockGroundIsUsable(center, size, grid.Yaw)) { _rejects[3]++; continue; }

                    // An arterial clipping the corner of a block does not mean there is no block
                    // there: it means a smaller one, set back from the road. Cities are full of
                    // these offcuts, and throwing them away empties the whole centre.
                    if (_claimed.BlocksRect(center, size, grid.Yaw, 0f))
                    {
                        bool recovered = false;
                        for (int attempt = 0; attempt < 2 && !recovered; attempt++)
                        {
                            Vector2 smaller = size * (attempt == 0 ? 0.68f : 0.45f);
                            if (smaller.x < 13f || smaller.y < 13f) break;
                            if (_claimed.BlocksRect(center, smaller, grid.Yaw, 0f)) continue;
                            size = smaller;
                            recovered = true;
                        }
                        if (!recovered) { _rejects[4]++; continue; }
                    }
                    _rejects[5]++;

                    int blockId = _layout.blocks.Count;
                    var block = new CityBlock
                    {
                        id = blockId,
                        ward = wardIndex,
                        wardBlockNumber = ++blockNumber,
                        center = center,
                        size = size,
                        rotation = grid.Yaw,
                        firstPlot = _layout.plots.Count,
                        plotCount = 0,
                    };

                    Subdivide(wardIndex, ward, profile, blockId, center, size, grid.Yaw, i, j);

                    block.plotCount = _layout.plots.Count - block.firstPlot;
                    if (block.plotCount == 0) continue;
                    _layout.blocks.Add(block);
                }
            }

            /// <summary>
            /// Rejects a block whose ground cannot be graded flat without a retaining wall the
            /// height of a house: too steep, partly under water, or straddling a slope break.
            /// </summary>
            bool BlockGroundIsUsable(Vector2 center, Vector2 size, float yaw)
            {
                Vector2 ax, az;
                CityGeom.Axes(yaw, out ax, out az);
                Vector2 ex = ax * (size.x * 0.5f);
                Vector2 ez = az * (size.y * 0.5f);

                float lowest = float.MaxValue, highest = float.MinValue;
                for (int sx = -1; sx <= 1; sx += 2)
                for (int sy = -1; sy <= 1; sy += 2)
                {
                    Vector2 corner = center + ex * sx + ez * sy;
                    if (!Buildable(corner, _site.maxBuildSlope * 1.15f)) return false;
                    float h = _t.Height(corner);
                    if (h < lowest) lowest = h;
                    if (h > highest) highest = h;
                }
                if (!Buildable(center, _site.maxBuildSlope)) return false;

                float diagonal = new Vector2(size.x, size.y).magnitude;
                float allowed = Mathf.Max(3.5f, diagonal * _site.maxPlatformSlope * 1.35f);
                return highest - lowest <= allowed;
            }

            /// <summary>
            /// Cuts a block up into plots. Every plot fronts a street: parcels run around the
            /// perimeter of the block and anything left in the middle becomes a car park or a
            /// courtyard, which is exactly how a Japanese block is arranged.
            /// </summary>
            void Subdivide(int wardIndex, CityWard ward, DistrictProfile profile, int blockId,
                Vector2 center, Vector2 size, float yaw, int gi, int gj)
            {
                float coreness = Mathf.Clamp01(ward.coreness * 0.75f + Footprint(center) * 0.25f);
                float r = Hash01(gi * 7919 + gj, blockId * 31 + 7);

                if (profile.parcels == ParcelMode.Block)
                {
                    PlotKind kind = KindFor(ward.kind, profile, coreness, size.x * size.y, false, r);
                    AddPlot(wardIndex, blockId, 0, center, size, yaw, kind, FloorsFor(profile, kind, coreness, size.x * size.y, r), false);
                    return;
                }

                float target = Mathf.Lerp(profile.plotSizeMin, profile.plotSizeMax, r);
                float shortest = Mathf.Min(size.x, size.y);

                // A block barely bigger than one parcel is one parcel.
                if (shortest < target * 1.75f)
                {
                    PlotKind kind = KindFor(ward.kind, profile, coreness, size.x * size.y, true, r);
                    AddPlot(wardIndex, blockId, 0, center, size, yaw, kind, FloorsFor(profile, kind, coreness, size.x * size.y, r), true);
                    return;
                }

                float depth = Mathf.Clamp(target * 1.15f, 11f, shortest * 0.44f);
                Vector2 ax, az;
                CityGeom.Axes(yaw, out ax, out az);
                int index = 0;

                // Four corner parcels, which are the ones worth having: two street frontages.
                for (int sx = -1; sx <= 1; sx += 2)
                for (int sy = -1; sy <= 1; sy += 2)
                {
                    Vector2 c = center
                              + ax * (sx * (size.x * 0.5f - depth * 0.5f))
                              + az * (sy * (size.y * 0.5f - depth * 0.5f));
                    float rr = Hash01(blockId * 101 + index, 13);
                    PlotKind kind = KindFor(ward.kind, profile, coreness, depth * depth, true, rr);
                    AddPlot(wardIndex, blockId, index++, c, new Vector2(depth, depth),
                        yaw + (sx > 0 ? 0f : 180f), kind, FloorsFor(profile, kind, coreness, depth * depth, rr), true);
                }

                // Parcels along the four sides, between the corners.
                index = AddSide(wardIndex, ward, profile, blockId, index, center, size, yaw, ax, az, depth, target, coreness, true, +1);
                index = AddSide(wardIndex, ward, profile, blockId, index, center, size, yaw, ax, az, depth, target, coreness, true, -1);
                index = AddSide(wardIndex, ward, profile, blockId, index, center, size, yaw, ax, az, depth, target, coreness, false, +1);
                index = AddSide(wardIndex, ward, profile, blockId, index, center, size, yaw, ax, az, depth, target, coreness, false, -1);

                // Whatever is left in the middle of the block.
                Vector2 inner = new Vector2(size.x - depth * 2f, size.y - depth * 2f);
                if (inner.x >= 22f && inner.y >= 22f)
                {
                    float rr = Hash01(blockId * 211, 29);
                    PlotKind kind = rr < 0.45f ? PlotKind.Parking : KindFor(ward.kind, profile, coreness * 0.8f, inner.x * inner.y, false, rr);
                    AddPlot(wardIndex, blockId, index++, center, inner, yaw, kind,
                        FloorsFor(profile, kind, coreness * 0.8f, inner.x * inner.y, rr), false);
                }
            }

            /// <summary>
            /// Lays parcels along one side of a block. <paramref name="alongX"/> picks which pair
            /// of sides, <paramref name="sign"/> picks which of the two.
            /// </summary>
            int AddSide(int wardIndex, CityWard ward, DistrictProfile profile, int blockId, int index,
                Vector2 center, Vector2 size, float yaw, Vector2 ax, Vector2 az,
                float depth, float target, float coreness, bool alongX, int sign)
            {
                float frontageSpan = (alongX ? size.x : size.y) - depth * 2f;
                if (frontageSpan < target * 0.8f) return index;

                int count = Mathf.Max(1, Mathf.RoundToInt(frontageSpan / target));
                float width = frontageSpan / count;
                float offset = (alongX ? size.y : size.x) * 0.5f - depth * 0.5f;

                for (int k = 0; k < count; k++)
                {
                    float along = -frontageSpan * 0.5f + width * (k + 0.5f);
                    Vector2 c = alongX
                        ? center + ax * along + az * (sign * offset)
                        : center + az * along + ax * (sign * offset);

                    // Local +Z points into the plot from its street frontage.
                    float plotYaw = alongX
                        ? yaw + (sign > 0 ? 180f : 0f)
                        : yaw + (sign > 0 ? 270f : 90f);

                    float rr = Hash01(blockId * 307 + index, k * 13 + 3);
                    Vector2 plotSize = new Vector2(width, depth);
                    PlotKind kind = KindFor(ward.kind, profile, coreness, width * depth, false, rr);
                    AddPlot(wardIndex, blockId, index++, c, plotSize, plotYaw, kind,
                        FloorsFor(profile, kind, coreness, width * depth, rr), false);
                }
                return index;
            }

            void AddPlot(int wardIndex, int blockId, int indexInBlock, Vector2 center, Vector2 size,
                float yaw, PlotKind kind, int floors, bool corner)
            {
                int id = _layout.plots.Count;
                _layout.plots.Add(new CityPlot
                {
                    id = id,
                    ward = wardIndex,
                    block = blockId,
                    indexInBlock = indexInBlock,
                    center = center,
                    size = size,
                    rotation = Mathf.Repeat(yaw, 360f),
                    groundY = _t.Height(center),
                    kind = kind,
                    maxFloors = floors,
                    maxHeight = floors * FloorHeight(kind),
                    corner = corner,
                });
            }

            static float FloorHeight(PlotKind kind)
            {
                switch (kind)
                {
                    case PlotKind.Landmark:
                    case PlotKind.Tower:
                    case PlotKind.Office: return 4.0f;
                    case PlotKind.Civic: return 4.6f;
                    case PlotKind.MidRise: return 3.7f;
                    case PlotKind.Shophouse: return 3.4f;
                    case PlotKind.Apartment: return 3.1f;
                    case PlotKind.HouseCluster: return 3.0f;
                    case PlotKind.Factory:
                    case PlotKind.Warehouse: return 6.5f;
                    case PlotKind.Campus: return 4.2f;
                    case PlotKind.Station: return 6.0f;
                    default: return 3.4f;
                }
            }

            int FloorsFor(DistrictProfile profile, PlotKind kind, float coreness, float area, float r)
            {
                switch (kind)
                {
                    case PlotKind.ParkSpace:
                    case PlotKind.ShrineGround:
                    case PlotKind.Parking:
                    case PlotKind.Vacant:
                    case PlotKind.Wharf:
                        return 1;
                }

                float t = Mathf.Clamp01(0.30f + coreness * 0.55f + (r - 0.5f) * 0.42f);
                // A big parcel in a dense ward is where a tower goes; a small one cannot hold one.
                float areaBonus = Mathf.Clamp01((area - 900f) / 4200f) * 0.25f;
                t = Mathf.Clamp01(t + areaBonus);
                int floors = Mathf.RoundToInt(Mathf.Lerp(profile.minFloors, profile.maxFloors, t));
                if (area < 260f) floors = Mathf.Min(floors, 6);
                if (kind == PlotKind.HouseCluster) floors = Mathf.Min(floors, 3);
                return Mathf.Max(1, floors);
            }

            PlotKind KindFor(DistrictKind district, DistrictProfile profile, float coreness, float area, bool corner, float r)
            {
                // Some of every ward is left open: a pocket park, a car park, a shrine.
                if (r < profile.openSpaceShare)
                {
                    if (district == DistrictKind.Palace || district == DistrictKind.Park) return PlotKind.ParkSpace;
                    return r < profile.openSpaceShare * 0.55f ? PlotKind.ParkSpace : PlotKind.Parking;
                }

                switch (district)
                {
                    case DistrictKind.CoreBusiness:
                        return area > 2600f ? PlotKind.Tower : PlotKind.Office;
                    case DistrictKind.StationFront:
                        if (area > 2200f) return PlotKind.Office;
                        return r < 0.55f ? PlotKind.Shophouse : PlotKind.MidRise;
                    case DistrictKind.Retail:
                        if (area > 2600f) return PlotKind.MidRise;
                        return r < 0.7f ? PlotKind.Shophouse : PlotKind.MidRise;
                    case DistrictKind.Nightlife:
                        return PlotKind.Shophouse;
                    case DistrictKind.Office:
                        return area > 1800f ? PlotKind.Office : PlotKind.MidRise;
                    case DistrictKind.Civic:
                        return r < 0.7f ? PlotKind.Civic : PlotKind.Office;
                    case DistrictKind.Palace:
                        return PlotKind.ParkSpace;
                    case DistrictKind.Apartments:
                        return r < 0.8f ? PlotKind.Apartment : PlotKind.MidRise;
                    case DistrictKind.Residential:
                    case DistrictKind.Suburb:
                        return PlotKind.HouseCluster;
                    case DistrictKind.Industrial:
                        return r < 0.55f ? PlotKind.Factory : PlotKind.Warehouse;
                    case DistrictKind.Port:
                        return r < 0.6f ? PlotKind.Wharf : PlotKind.Warehouse;
                    case DistrictKind.Reclaimed:
                        if (area > 4000f && coreness > 0.25f) return PlotKind.Tower;
                        return r < 0.5f ? PlotKind.Office : PlotKind.Civic;
                    case DistrictKind.University:
                        return PlotKind.Campus;
                    case DistrictKind.Park:
                        return PlotKind.ParkSpace;
                    case DistrictKind.Shrine:
                        return r < 0.7f ? PlotKind.ShrineGround : PlotKind.HouseCluster;
                    case DistrictKind.RailYard:
                        return r < 0.5f ? PlotKind.Warehouse : PlotKind.Parking;
                    case DistrictKind.Waterfront:
                        if (r < 0.25f) return PlotKind.ParkSpace;
                        return area > 2000f ? PlotKind.MidRise : PlotKind.Shophouse;
                    default:
                        return PlotKind.MidRise;
                }
            }

            // ---------------------------------------------------------------- reservations

            /// <summary>
            /// Promotes the best plots in the core to landmarks and writes down what the story
            /// needs them for. Soti's head office is the tallest thing in Konto by design: it
            /// is the building the whole game is about walking into.
            /// </summary>
            void ReserveLandmarks()
            {
                int coreWard = -1;
                for (int i = 0; i < _layout.wards.Count; i++)
                {
                    if (_layout.wards[i].kind != DistrictKind.CoreBusiness) continue;
                    coreWard = i;
                    break;
                }

                if (coreWard >= 0)
                {
                    var best = new List<int>();
                    for (int i = 0; i < _layout.plots.Count; i++)
                    {
                        if (_layout.plots[i].ward != coreWard) continue;
                        if (_layout.plots[i].kind != PlotKind.Tower && _layout.plots[i].kind != PlotKind.Office) continue;
                        best.Add(i);
                    }
                    best.Sort((a, b) => _layout.plots[b].Area.CompareTo(_layout.plots[a].Area));

                    string[] names = { "Soti Tower", "Konto Central Bank", "Konto Broadcasting Centre" };
                    string[] notes =
                    {
                        "Head office of Soti. The tallest building in Konto: lobby, atrium, forty floors of open plan, executive floors at the top, and the roof the story ends on.",
                        "Flagship bank tower, facing the palace across the moat.",
                        "Broadcast tower and studios. A mast on the roof reads well on the skyline.",
                    };

                    for (int k = 0; k < names.Length && k < best.Count; k++)
                    {
                        int id = best[k];
                        var plot = _layout.plots[id];
                        plot.kind = k == 0 ? PlotKind.Landmark : PlotKind.Tower;
                        plot.maxFloors = k == 0 ? 58 : Mathf.Max(plot.maxFloors, 38);
                        plot.maxHeight = plot.maxFloors * FloorHeight(plot.kind);
                        _layout.plots[id] = plot;

                        _layout.reservations.Add(new CityReservation
                        {
                            name = names[k],
                            note = notes[k],
                            plotId = id,
                            center = plot.center,
                            radius = Mathf.Max(plot.size.x, plot.size.y) * 0.5f,
                        });
                    }
                }

                if (IsVillage)
                {
                    // What the story needs from a village: somewhere to come from.
                    int shrine = -1, home = -1;
                    float shrineArea = 0f, homeArea = 0f;
                    for (int i = 0; i < _layout.plots.Count; i++)
                    {
                        var plot = _layout.plots[i];
                        if ((plot.kind == PlotKind.ShrineGround || plot.kind == PlotKind.ParkSpace) && plot.Area > shrineArea)
                        {
                            shrineArea = plot.Area;
                            shrine = i;
                        }
                        if ((plot.kind == PlotKind.HouseCluster || plot.kind == PlotKind.Shophouse) && plot.Area > homeArea)
                        {
                            homeArea = plot.Area;
                            home = i;
                        }
                    }
                    if (shrine >= 0)
                    {
                        _layout.reservations.Add(new CityReservation
                        {
                            name = _layout.name + " shrine",
                            note = "Torii, a gravel approach, a hall and one very old tree. The festival in the opening happens here.",
                            plotId = shrine,
                            center = _layout.plots[shrine].center,
                            radius = Mathf.Max(_layout.plots[shrine].size.x, _layout.plots[shrine].size.y) * 0.5f,
                        });
                    }
                    if (home >= 0)
                    {
                        _layout.reservations.Add(new CityReservation
                        {
                            name = "Family home",
                            note = "The house the player leaves in the first scene and comes back to later: farmhouse, outbuilding, a yard, paddy behind it.",
                            plotId = home,
                            center = _layout.plots[home].center,
                            radius = Mathf.Max(_layout.plots[home].size.x, _layout.plots[home].size.y) * 0.5f,
                        });
                    }
                }

                // The terminus, and the city hall.
                if (_terminusStationId >= 0 && _terminusStationId < _layout.stations.Count)
                {
                    var station = _layout.stations[_terminusStationId];
                    _layout.reservations.Add(new CityReservation
                    {
                        name = station.name,
                        note = station.terminus
                            ? "Main terminus: concourse, fourteen platforms, department store over the top of it, bus terminal and taxi rank on the plaza."
                            : "Local station: one platform, a level crossing, a bicycle rack and a vending machine.",
                        plotId = station.plotId,
                        center = station.center,
                        radius = Mathf.Max(station.size.x, station.size.y) * 0.5f,
                    });
                }

                int civicBest = -1;
                float civicArea = 0f;
                for (int i = 0; i < _layout.plots.Count; i++)
                {
                    if (_layout.plots[i].kind != PlotKind.Civic) continue;
                    if (_layout.plots[i].Area <= civicArea) continue;
                    civicArea = _layout.plots[i].Area;
                    civicBest = i;
                }
                if (civicBest >= 0)
                {
                    _layout.reservations.Add(new CityReservation
                    {
                        name = "Konto Metropolitan Government",
                        note = "City hall. Twin towers and a sunken plaza suit the site.",
                        plotId = civicBest,
                        center = _layout.plots[civicBest].center,
                        radius = Mathf.Max(_layout.plots[civicBest].size.x, _layout.plots[civicBest].size.y) * 0.5f,
                    });
                }
            }

            /// <summary>World bounds of the area the city could possibly occupy.</summary>
            Rect FootprintBounds()
            {
                var bounds = new Rect(_coreWorld.x, _coreWorld.y, 0f, 0f);
                for (int i = 0; i < 96; i++)
                {
                    float a = i / 96f * Mathf.PI * 2f;
                    Vector2 local = _coreLocal + new Vector2(
                        Mathf.Cos(a) * (_site.alongRadius + _site.outlineNoise),
                        Mathf.Sin(a) * (_site.inlandRadius + _site.outlineNoise));
                    Vector2 w = _frame.ToWorld(local);
                    bounds = CityGeom.Encapsulate(bounds, new Rect(w.x, w.y, 0f, 0f));
                }
                return bounds;
            }

            /// <summary>
            /// The world bounds of each ward's own ground. Ward boundaries are decided by which
            /// centre is nearest, and those cells can reach a long way from the centre itself, so
            /// they are measured rather than guessed: guessing leaves most of the city unbuilt.
            /// </summary>
            Rect[] MeasureWardBounds()
            {
                var bounds = new Rect[_layout.wards.Count];
                var started = new bool[_layout.wards.Count];
                const float step = 36f;

                int nx = Mathf.Max(2, Mathf.CeilToInt(_areaBounds.width / step));
                int ny = Mathf.Max(2, Mathf.CeilToInt(_areaBounds.height / step));

                for (int y = 0; y <= ny; y++)
                for (int x = 0; x <= nx; x++)
                {
                    Vector2 p = new Vector2(_areaBounds.xMin + x * step, _areaBounds.yMin + y * step);
                    if (Footprint(p) < 0.32f) continue;
                    int ward = NearestWard(p);
                    if (ward < 0) continue;
                    var cell = new Rect(p.x - step, p.y - step, step * 2f, step * 2f);
                    bounds[ward] = started[ward] ? CityGeom.Encapsulate(bounds[ward], cell) : cell;
                    started[ward] = true;
                }

                for (int i = 0; i < bounds.Length; i++)
                {
                    if (started[i]) continue;
                    // A ward with no ground of its own: keep a small box so nothing divides by zero.
                    var c = _layout.wards[i].center;
                    bounds[i] = new Rect(c.x - 60f, c.y - 60f, 120f, 120f);
                }
                return bounds;
            }

            void ComputeBounds()
            {
                Rect bounds = _areaBounds;
                for (int i = 0; i < _layout.fills.Count; i++)
                {
                    var f = _layout.fills[i];
                    bounds = CityGeom.Encapsulate(bounds, CityGeom.Bounds(f.center, f.size, f.rotation, 30f));
                }
                for (int i = 0; i < _layout.blocks.Count; i++)
                {
                    var b = _layout.blocks[i];
                    bounds = CityGeom.Encapsulate(bounds, CityGeom.Bounds(b.center, b.size, b.rotation, 20f));
                }
                for (int i = 0; i < _layout.stations.Count; i++)
                {
                    var st = _layout.stations[i];
                    // A station's plot has to be inside the graded area or its platforms end up
                    // hanging off a hillside.
                    bounds = CityGeom.Encapsulate(bounds, CityGeom.Bounds(st.center, st.size * 2.2f, st.rotation, 30f));
                }
                _layout.bounds = bounds;
            }
        }

    }
}
