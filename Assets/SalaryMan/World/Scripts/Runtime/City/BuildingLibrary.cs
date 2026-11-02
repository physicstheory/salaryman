using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Turns a reserved plot into an actual building.
    ///
    /// The shape of the problem: a city of three thousand buildings cannot carry modelled
    /// windows. A punched opening with a reveal is nine quads, and at three hundred openings a
    /// building that is ten million triangles before anything else is drawn. So the split is the
    /// one every open world uses — the mesh carries the things that change the silhouette and
    /// catch the sun, and the material carries the things that repeat.
    ///
    /// In the mesh: massing and setbacks, podiums, floor bands, corner pilasters, parapets and
    /// copings, balconies, canopies, shopfronts, pitched roofs with eaves, and the clutter on the
    /// roof, which is most of what a Japanese skyline actually is. About three hundred triangles
    /// a building.
    ///
    /// In the material: the window grid, mullions, spandrels, tiling, staining and the glass
    /// itself, as a tiling PBR set with a height map. HDRP's pixel displacement then gives the
    /// openings real parallax, so they read as holes from the street without being holes.
    ///
    /// The join between the two is the bay grid. Every footprint is snapped to a whole number of
    /// window bays and every storey height to a whole number of floors, and facade UVs are in bay
    /// and floor units, so the window grid lines up across a corner and from one building to its
    /// neighbour. Each building also shifts its UV origin by a whole number of bays and floors,
    /// which is what stops a street of the same material looking like one stamped wall.
    /// </summary>
    public static class BuildingLibrary
    {
        /// <summary>One texture repeat covers this many bays across and floors up.</summary>
        public const int UvBays = 4;
        public const int UvFloors = 4;

        public struct Style
        {
            public CitySurface wall;
            public CitySurface roof;
            public float bayWidth;
            public float floorHeight;
            public float groundHeight;
            public int minFloors, maxFloors;
            public float bandEvery;        // floors between projecting bands; 0 for none
            public float bandDepth;
            public bool pilasters;
            public bool balconies;
            public bool shopfront;
            public bool entrance;
            public bool pitched;
            public bool roofClutter;
            public float setback;
        }

        public static Style StyleFor(PlotKind kind, float r)
        {
            switch (kind)
            {
                case PlotKind.Tower:
                case PlotKind.Landmark:
                    return new Style
                    {
                        wall = CitySurface.GlassCurtain, roof = CitySurface.RoofMembrane,
                        bayWidth = 3.2f, floorHeight = 4.0f, groundHeight = 6.4f,
                        minFloors = 12, maxFloors = 60, bandEvery = 4f, bandDepth = 0.22f,
                        pilasters = false, entrance = true, roofClutter = true, setback = 3.0f,
                    };
                case PlotKind.Office:
                    return new Style
                    {
                        wall = r < 0.40f ? CitySurface.GlassCurtain
                             : (r < 0.72f ? CitySurface.Precast : CitySurface.PrecastSand),
                        roof = CitySurface.RoofMembrane,
                        bayWidth = 3.2f, floorHeight = 3.8f, groundHeight = 5.2f,
                        minFloors = 5, maxFloors = 24, bandEvery = 1f, bandDepth = 0.16f,
                        pilasters = true, entrance = true, roofClutter = true, setback = 1.6f,
                    };
                case PlotKind.MidRise:
                    return new Style
                    {
                        wall = r < 0.28f ? CitySurface.Precast
                             : (r < 0.50f ? CitySurface.PrecastSand
                             : (r < 0.76f ? CitySurface.Tile : CitySurface.TileWhite)),
                        roof = CitySurface.RoofMembrane,
                        bayWidth = 3.0f, floorHeight = 3.6f, groundHeight = 4.4f,
                        minFloors = 3, maxFloors = 10, bandEvery = 1f, bandDepth = 0.14f,
                        pilasters = true, shopfront = true, roofClutter = true, setback = 0.9f,
                    };
                case PlotKind.Shophouse:
                    return new Style
                    {
                        wall = r < 0.55f ? CitySurface.Tile : CitySurface.TileWhite,
                        roof = CitySurface.RoofMembrane,
                        bayWidth = 2.8f, floorHeight = 3.3f, groundHeight = 3.9f,
                        minFloors = 2, maxFloors = 7, bandEvery = 1f, bandDepth = 0.12f,
                        shopfront = true, roofClutter = true, setback = 0.35f,
                    };
                case PlotKind.Apartment:
                    return new Style
                    {
                        wall = r < 0.58f ? CitySurface.Render : CitySurface.RenderGrey,
                        roof = CitySurface.RoofMembrane,
                        bayWidth = 3.0f, floorHeight = 3.0f, groundHeight = 3.4f,
                        minFloors = 4, maxFloors = 14, bandEvery = 1f, bandDepth = 0.12f,
                        balconies = true, roofClutter = true, setback = 1.4f,
                    };
                case PlotKind.HouseCluster:
                    return new Style
                    {
                        wall = CitySurface.Siding, roof = CitySurface.RoofTile,
                        bayWidth = 2.6f, floorHeight = 2.9f, groundHeight = 2.9f,
                        minFloors = 1, maxFloors = 3, pitched = true, setback = 0.6f,
                    };
                case PlotKind.Civic:
                    return new Style
                    {
                        wall = CitySurface.Stone, roof = CitySurface.RoofMembrane,
                        bayWidth = 4.0f, floorHeight = 4.6f, groundHeight = 6.0f,
                        minFloors = 2, maxFloors = 11, bandEvery = 1f, bandDepth = 0.28f,
                        pilasters = true, entrance = true, roofClutter = true, setback = 4.0f,
                    };
                case PlotKind.Campus:
                    return new Style
                    {
                        wall = r < 0.5f ? CitySurface.Stone : CitySurface.PrecastSand,
                        roof = CitySurface.RoofMembrane,
                        bayWidth = 3.4f, floorHeight = 4.2f, groundHeight = 5.0f,
                        minFloors = 2, maxFloors = 9, bandEvery = 1f, bandDepth = 0.18f,
                        pilasters = true, entrance = true, roofClutter = true, setback = 5.0f,
                    };
                case PlotKind.Warehouse:
                case PlotKind.Factory:
                case PlotKind.Wharf:
                    return new Style
                    {
                        wall = CitySurface.Corrugated, roof = CitySurface.RoofMetal,
                        bayWidth = 4.5f, floorHeight = 6.5f, groundHeight = 6.5f,
                        minFloors = 1, maxFloors = 4, pitched = true, roofClutter = true, setback = 2.5f,
                    };
                default:
                    return new Style
                    {
                        wall = CitySurface.Precast, roof = CitySurface.RoofMembrane,
                        bayWidth = 3.0f, floorHeight = 3.6f, groundHeight = 4.2f,
                        minFloors = 2, maxFloors = 8, bandEvery = 1f, bandDepth = 0.14f,
                        roofClutter = true, setback = 1.0f,
                    };
            }
        }

        public static bool Buildable(PlotKind kind)
        {
            switch (kind)
            {
                case PlotKind.ParkSpace:
                case PlotKind.ShrineGround:
                case PlotKind.Parking:
                case PlotKind.Vacant:
                case PlotKind.Landmark:     // Soti Tower is modelled on its own
                    return false;
                default:
                    return true;
            }
        }

        // ------------------------------------------------------------------ entry point

        /// <summary>
        /// Builds everything that stands on one plot. Shophouses, mid-rises, apartment blocks and
        /// offices have their frontage split into a run of narrower buildings first, because a
        /// shopping street is a row of party walls and not a slab, and that rhythm is most of what
        /// the eye reads walking down it.
        /// </summary>
        public static void Build(in CityPlot plot, BuildingMesh mesh)
        {
            if (!Buildable(plot.kind)) return;

            int sx = Mathf.RoundToInt(plot.center.x), sy = Mathf.RoundToInt(plot.center.y);
            float r = KontoNoise.White(9173, sx, sy);

            if (plot.kind == PlotKind.HouseCluster) { Houses(plot, mesh, r); return; }

            var style = StyleFor(plot.kind, r);
            float setback = Mathf.Min(style.setback, Mathf.Min(plot.size.x, plot.size.y) * 0.22f);
            Vector2 lot = new Vector2(Mathf.Max(4f, plot.size.x - setback * 2f),
                                      Mathf.Max(4f, plot.size.y - setback * 2f));

            float unit = FrontageUnit(plot.kind);
            bool alongX = lot.x >= lot.y;
            float frontage = alongX ? lot.x : lot.y;
            int parts = unit > 0f ? Mathf.Clamp(Mathf.RoundToInt(frontage / unit), 1, 5) : 1;

            float top = plot.maxHeight * Mathf.Lerp(0.6f, 1f, r);
            if (parts <= 1)
            {
                One(mesh, plot.center, lot, plot.rotation, plot.groundY, top, style, sx, sy);
                return;
            }

            float width = frontage / parts;
            for (int k = 0; k < parts; k++)
            {
                float along = -frontage * 0.5f + width * (k + 0.5f);
                Vector2 local = alongX ? new Vector2(along, 0f) : new Vector2(0f, along);
                Vector2 c = CityGeom.FromRectLocal(local, plot.center, plot.rotation);
                Vector2 size = alongX ? new Vector2(width * 0.98f, lot.y) : new Vector2(lot.x, width * 0.98f);
                float kr = KontoNoise.White(9311, sx + k, sy - k);
                float h = Mathf.Max(style.groundHeight + style.floorHeight,
                                    top * Mathf.Lerp(0.62f, 1.14f, kr));
                One(mesh, c, size, plot.rotation, plot.groundY, h, style, sx + k * 37, sy - k * 53);
            }
        }

        static float FrontageUnit(PlotKind kind)
        {
            switch (kind)
            {
                case PlotKind.Shophouse: return 9.5f;
                case PlotKind.MidRise: return 13f;
                case PlotKind.Apartment: return 16f;
                case PlotKind.Office: return 22f;
                default: return 0f;
            }
        }

        // ------------------------------------------------------------------ one building

        static void One(BuildingMesh mesh, Vector2 centre, Vector2 lot, float yaw, float groundY,
            float wantHeight, Style style, int sx, int sy)
        {
            float bay = style.bayWidth;
            // Snap the footprint to whole bays so the window grid meets itself at the corners.
            Vector2 size = new Vector2(SnapUp(lot.x, bay, 2), SnapUp(lot.y, bay, 2));
            if (size.x > lot.x) size.x = Mathf.Max(bay * 2f, SnapDown(lot.x, bay, 2));
            if (size.y > lot.y) size.y = Mathf.Max(bay * 2f, SnapDown(lot.y, bay, 2));

            float r1 = KontoNoise.White(4441, sx, sy);
            float r2 = KontoNoise.White(4447, sy, sx);
            float r3 = KontoNoise.White(4457, sx + 11, sy - 7);

            int floors = Mathf.Clamp(Mathf.RoundToInt((wantHeight - style.groundHeight) / style.floorHeight),
                                     style.minFloors, style.maxFloors);
            float groundH = style.groundHeight;
            float shaftBase = groundY + groundH;

            if (style.pitched)
            {
                Shed(mesh, centre, size, yaw, groundY, style, floors, r1);
                return;
            }

            // ---- podium and setback. Anything tall in a Japanese core sits on a podium that
            // holds the street line, with the shaft stepped back off it.
            bool podium = floors >= 12 && Mathf.Min(size.x, size.y) > bay * 4f;
            Vector2 shaftSize = size;
            float shaftFloors = floors;
            float podiumTop = shaftBase;

            if (podium)
            {
                int podFloors = 2 + Mathf.RoundToInt(r1 * 2f);
                float podH = podFloors * style.floorHeight;
                Facade(mesh, centre, size, yaw, shaftBase, podH, style.wall, style, sx, sy);
                Coping(mesh, centre, size, yaw, shaftBase + podH, 0.9f, 0.45f);
                podiumTop = shaftBase + podH + 0.9f;

                float step = Mathf.Min(bay, Mathf.Min(size.x, size.y) * 0.16f);
                shaftSize = new Vector2(Mathf.Max(bay * 2f, SnapDown(size.x - step * 2f, bay, 2)),
                                        Mathf.Max(bay * 2f, SnapDown(size.y - step * 2f, bay, 2)));
                shaftFloors = Mathf.Max(4, floors - podFloors);
                // The podium roof is a real deck, with plant on it.
                RoofDeck(mesh, centre, size, yaw, shaftBase + podH, style.roof);
                if (style.roofClutter) Clutter(mesh, centre, size, yaw, shaftBase + podH, shaftSize, sx + 3, sy + 5, 0.6f);
            }
            else
            {
                Facade(mesh, centre, size, yaw, groundY, groundH, GroundSurface(style), style, sx, sy, groundBand: true);
                podiumTop = shaftBase;
            }

            float shaftH = shaftFloors * style.floorHeight;
            Facade(mesh, centre, shaftSize, yaw, podiumTop, shaftH, style.wall, style, sx + 7, sy + 13);

            // ---- crown: a shallower setback on the top few floors reads as a real building
            float top = podiumTop + shaftH;
            Vector2 crownSize = shaftSize;
            if (!podium && floors >= 8 && r2 > 0.45f)
            {
                float step = Mathf.Min(bay, Mathf.Min(shaftSize.x, shaftSize.y) * 0.14f);
                crownSize = new Vector2(Mathf.Max(bay * 2f, SnapDown(shaftSize.x - step * 2f, bay, 2)),
                                        Mathf.Max(bay * 2f, SnapDown(shaftSize.y - step * 2f, bay, 2)));
                int crownFloors = 2 + Mathf.RoundToInt(r3 * 2f);
                float crownH = crownFloors * style.floorHeight;
                RoofDeck(mesh, shaftSize == crownSize ? centre : centre, shaftSize, yaw, top, style.roof);
                Coping(mesh, centre, shaftSize, yaw, top, 1.0f, 0.4f);
                Facade(mesh, centre, crownSize, yaw, top + 1.0f, crownH, style.wall, style, sx + 21, sy + 31);
                top += 1.0f + crownH;
            }

            // ---- bands, pilasters, balconies
            if (style.bandEvery > 0.5f)
                Bands(mesh, centre, shaftSize, yaw, podiumTop, shaftFloors, style);
            if (style.pilasters)
                Pilasters(mesh, centre, shaftSize, yaw, podiumTop, shaftH, style);
            if (style.balconies)
                Balconies(mesh, centre, shaftSize, yaw, podiumTop, (int)shaftFloors, style);

            // ---- roof
            RoofDeck(mesh, centre, crownSize, yaw, top, style.roof);
            Parapet(mesh, centre, crownSize, yaw, top, 1.05f);
            if (style.roofClutter) Clutter(mesh, centre, crownSize, yaw, top, Vector2.zero, sx, sy, 1f);

            // ---- street level
            if (style.shopfront) Shopfront(mesh, centre, size, yaw, groundY, groundH, sx, sy);
            else if (style.entrance) Entrance(mesh, centre, size, yaw, groundY, groundH, sx, sy);
        }

        static CitySurface GroundSurface(Style style)
        {
            if (style.shopfront) return CitySurface.Shopfront;
            if (style.wall == CitySurface.GlassCurtain) return CitySurface.GlassCurtain;
            return CitySurface.Concrete;
        }

        // ------------------------------------------------------------------ facade

        /// <summary>
        /// Four walls, one quad each, UV'd in bay and floor units. The UV origin is shifted by a
        /// whole number of bays and floors per building, which picks a different patch of the
        /// tiling texture without ever breaking the grid.
        /// </summary>
        static void Facade(BuildingMesh mesh, Vector2 centre, Vector2 size, float yaw, float baseY,
            float height, CitySurface surface, Style style, int sx, int sy, bool groundBand = false)
        {
            if (height <= 0.05f) return;
            Vector2 ax, az;
            CityGeom.Axes(yaw, out ax, out az);
            Vector3 X = new Vector3(ax.x, 0f, ax.y), Z = new Vector3(az.x, 0f, az.y);
            Vector3 o = new Vector3(centre.x, baseY, centre.y);
            Vector3 hx = X * (size.x * 0.5f), hz = Z * (size.y * 0.5f), up = Vector3.up * height;

            float uTile = style.bayWidth * UvBays;
            float vTile = groundBand ? style.groundHeight : style.floorHeight * UvFloors;
            float uOff = (KontoNoise.Hash(7717, sx, sy) & 3) * style.bayWidth;
            float vOff = groundBand ? 0f : (KontoNoise.Hash(7727, sy, sx) & 3) * style.floorHeight;

            Wall(mesh, o - hx - hz, o + hx - hz, up, -Z, surface, size.x, height, uTile, vTile, uOff, vOff);
            Wall(mesh, o + hx + hz, o - hx + hz, up, Z, surface, size.x, height, uTile, vTile, uOff, vOff);
            Wall(mesh, o + hx - hz, o + hx + hz, up, X, surface, size.y, height, uTile, vTile, uOff, vOff);
            Wall(mesh, o - hx + hz, o - hx - hz, up, -X, surface, size.y, height, uTile, vTile, uOff, vOff);
        }

        static void Wall(BuildingMesh mesh, Vector3 a, Vector3 b, Vector3 up, Vector3 outward,
            CitySurface surface, float width, float height, float uTile, float vTile, float uOff, float vOff)
        {
            float u0 = uOff / uTile, u1 = u0 + width / uTile;
            float v0 = vOff / vTile, v1 = v0 + height / vTile;
            mesh.AddQuad(a, b, b + up, a + up, outward, surface,
                new Vector2(u0, v0), new Vector2(u1, v0), new Vector2(u1, v1), new Vector2(u0, v1));
        }

        // ------------------------------------------------------------------ articulation

        /// <summary>Projecting floor slabs. This is the single cheapest thing that stops a tower
        /// looking like an extruded rectangle, because it gives the sun something to catch.</summary>
        static void Bands(BuildingMesh mesh, Vector2 centre, Vector2 size, float yaw, float baseY,
            float floors, Style style)
        {
            int every = Mathf.Max(1, Mathf.RoundToInt(style.bandEvery));
            float d = style.bandDepth;
            for (int f = every; f <= floors; f += every)
            {
                float y = baseY + f * style.floorHeight - 0.10f;
                mesh.AddWallRing(centre, new Vector2(size.x + d * 2f, size.y + d * 2f), yaw, y,
                    0.22f, d + 0.18f, CitySurface.TrimMetal, 1f);
            }
        }

        static void Pilasters(BuildingMesh mesh, Vector2 centre, Vector2 size, float yaw, float baseY,
            float height, Style style)
        {
            Vector2 ax, az;
            CityGeom.Axes(yaw, out ax, out az);
            float w = 0.55f, d = 0.18f;
            for (int i = 0; i < 4; i++)
            {
                float sxn = (i & 1) == 0 ? 1f : -1f;
                float szn = (i & 2) == 0 ? 1f : -1f;
                Vector2 c = centre + ax * (sxn * (size.x * 0.5f + d * 0.5f)) + az * (szn * (size.y * 0.5f - w * 0.5f));
                mesh.AddBox(c, new Vector2(d * 2f, w), yaw, baseY, height, style.wall, 1f);
                Vector2 c2 = centre + ax * (sxn * (size.x * 0.5f - w * 0.5f)) + az * (szn * (size.y * 0.5f + d * 0.5f));
                mesh.AddBox(c2, new Vector2(w, d * 2f), yaw, baseY, height, style.wall, 1f);
            }
        }

        static void Balconies(BuildingMesh mesh, Vector2 centre, Vector2 size, float yaw, float baseY,
            int floors, Style style)
        {
            Vector2 ax, az;
            CityGeom.Axes(yaw, out ax, out az);
            bool longX = size.x >= size.y;
            Vector2 along = longX ? ax : az, outN = longX ? az : ax;
            float span = longX ? size.x : size.y;
            float half = (longX ? size.y : size.x) * 0.5f;
            int bays = Mathf.Max(1, Mathf.RoundToInt(span / style.bayWidth));
            float bw = span / bays;
            float depth = 1.25f;

            for (int f = 1; f < floors; f++)
            {
                float y = baseY + f * style.floorHeight;
                for (int b = 0; b < bays; b++)
                {
                    float t = -span * 0.5f + bw * (b + 0.5f);
                    Vector2 c = centre + along * t + outN * (half + depth * 0.5f);
                    Vector2 s = longX ? new Vector2(bw * 0.94f, depth) : new Vector2(depth, bw * 0.94f);
                    mesh.AddBox(c, s, yaw, y, 0.18f, CitySurface.Concrete, 1f);
                    // The railing is what makes a danchi read as a danchi.
                    Vector2 rc = centre + along * t + outN * (half + depth);
                    Vector2 rs = longX ? new Vector2(bw * 0.94f, 0.10f) : new Vector2(0.10f, bw * 0.94f);
                    mesh.AddBox(rc, rs, yaw, y + 0.18f, 1.05f, CitySurface.TrimMetal, 0.5f);
                }
            }
        }

        // ------------------------------------------------------------------ tops

        static void RoofDeck(BuildingMesh mesh, Vector2 centre, Vector2 size, float yaw, float y, CitySurface roof)
        {
            mesh.AddBox(centre, size, yaw, y - 0.12f, 0.12f, roof, 2f);
        }

        static void Parapet(BuildingMesh mesh, Vector2 centre, Vector2 size, float yaw, float y, float height)
        {
            mesh.AddWallRing(centre, size, yaw, y, height, 0.30f, CitySurface.Concrete, 1f);
            mesh.AddWallRing(centre, new Vector2(size.x + 0.14f, size.y + 0.14f), yaw, y + height, 0.09f, 0.44f,
                CitySurface.TrimMetal, 0.5f);
        }

        static void Coping(BuildingMesh mesh, Vector2 centre, Vector2 size, float yaw, float y, float height, float depth)
        {
            mesh.AddWallRing(centre, new Vector2(size.x + depth, size.y + depth), yaw, y, height, depth + 0.3f,
                CitySurface.Concrete, 1f);
        }

        /// <summary>
        /// Roof plant. A Japanese skyline from above is stair bulkheads, water tanks on legs and
        /// rows of condensers, and putting them on is worth more than any amount of facade detail
        /// the moment the camera gets above the second floor.
        /// </summary>
        static void Clutter(BuildingMesh mesh, Vector2 centre, Vector2 size, float yaw, float y,
            Vector2 keepClear, int sx, int sy, float density)
        {
            Vector2 ax, az;
            CityGeom.Axes(yaw, out ax, out az);
            float hx = size.x * 0.5f - 1.4f, hz = size.y * 0.5f - 1.4f;
            if (hx < 1f || hz < 1f) return;

            // Stair and lift bulkhead.
            float r = KontoNoise.White(3301, sx, sy);
            float bw = Mathf.Min(4.2f, size.x * 0.3f), bd = Mathf.Min(3.6f, size.y * 0.3f);
            Vector2 bc = centre + ax * ((r - 0.5f) * hx * 0.7f) + az * ((KontoNoise.White(3307, sy, sx) - 0.5f) * hz * 0.7f);
            if (!Inside(bc, centre, keepClear, yaw))
            {
                mesh.AddBox(bc, new Vector2(bw, bd), yaw, y, 2.7f + r * 0.9f, CitySurface.Concrete, 1f);
                mesh.AddBox(bc, new Vector2(bw + 0.2f, bd + 0.2f), yaw, y + 2.7f + r * 0.9f, 0.14f, CitySurface.RoofMetal, 1f);
            }

            // Water tank on legs.
            if (KontoNoise.White(3313, sx, sy) < 0.55f * density)
            {
                Vector2 tc = centre - ax * (hx * 0.55f) + az * (hz * 0.5f);
                if (!Inside(tc, centre, keepClear, yaw))
                {
                    float legs = 1.5f;
                    for (int i = 0; i < 4; i++)
                    {
                        Vector2 off = ax * ((i & 1) == 0 ? 0.9f : -0.9f) + az * ((i & 2) == 0 ? 0.7f : -0.7f);
                        mesh.AddPost(new Vector3(tc.x + off.x, y, tc.y + off.y), 0.07f, legs, 6, CitySurface.DarkMetal);
                    }
                    mesh.AddBox(tc, new Vector2(2.3f, 1.8f), yaw, y + legs, 1.6f, CitySurface.TrimMetal, 1f);
                }
            }

            // Condenser units, in a row, which is how they are actually installed.
            int units = 2 + Mathf.RoundToInt(KontoNoise.White(3319, sx, sy) * 4f * density);
            for (int i = 0; i < units; i++)
            {
                float t = (i + 0.5f) / units - 0.5f;
                Vector2 uc = centre + ax * (t * hx * 1.6f) - az * (hz * 0.7f);
                if (Inside(uc, centre, keepClear, yaw)) continue;
                float h = 0.85f + KontoNoise.White(3323, sx + i, sy) * 0.5f;
                mesh.AddBox(uc, new Vector2(1.1f, 0.65f), yaw, y, h, CitySurface.DarkMetal, 1f);
            }

            // Ducting and a handrail on the plant deck.
            if (KontoNoise.White(3329, sx, sy) < 0.4f * density)
            {
                Vector2 a = centre - ax * (hx * 0.8f) - az * (hz * 0.2f);
                Vector2 b = centre + ax * (hx * 0.8f) - az * (hz * 0.2f);
                mesh.AddBar(new Vector3(a.x, y + 0.7f, a.y), new Vector3(b.x, y + 0.7f, b.y), 0.45f, CitySurface.TrimMetal);
            }

            // A mast, on anything tall enough for one to be worth it.
            if (size.x * size.y > 260f && KontoNoise.White(3331, sx, sy) < 0.5f)
            {
                Vector2 mc = centre + ax * (hx * 0.35f) + az * (hz * 0.35f);
                if (!Inside(mc, centre, keepClear, yaw))
                {
                    mesh.AddPost(new Vector3(mc.x, y, mc.y), 0.16f, 9f + KontoNoise.White(3337, sx, sy) * 7f, 6, CitySurface.DarkMetal);
                }
            }
        }

        static bool Inside(Vector2 p, Vector2 centre, Vector2 size, float yaw)
        {
            if (size.x <= 0.01f || size.y <= 0.01f) return false;
            return CityGeom.RectContains(p, centre, size, yaw);
        }

        // ------------------------------------------------------------------ street level

        static void Shopfront(BuildingMesh mesh, Vector2 centre, Vector2 size, float yaw, float groundY,
            float groundH, int sx, int sy)
        {
            Vector2 ax, az;
            CityGeom.Axes(yaw, out ax, out az);
            bool longX = size.x >= size.y;
            Vector2 along = longX ? ax : az, outN = longX ? az : ax;
            float span = longX ? size.x : size.y;
            float half = (longX ? size.y : size.x) * 0.5f;

            // Glazing set back behind the frame, so the ground floor has depth. It is a face
            // rather than a box so it can carry bay-and-storey UVs like the rest of the facade.
            float gw = span * 0.92f, gh = groundH - 0.55f;
            Vector3 N = new Vector3(outN.x, 0f, outN.y), A = new Vector3(along.x, 0f, along.y);
            Vector3 g0 = new Vector3(centre.x, groundY + 0.1f, centre.y) + N * (half - 0.22f) - A * (gw * 0.5f);
            Vector3 g1 = g0 + A * gw;
            float gu = gw / (2.8f * UvBays);
            mesh.AddQuad(g0, g1, g1 + Vector3.up * gh, g0 + Vector3.up * gh, N, CitySurface.Shopfront,
                new Vector2(0f, 0f), new Vector2(gu, 0f), new Vector2(gu, 1f), new Vector2(0f, 1f));
            // The reveal round it, so the glass sits in a hole and not on the wall.
            mesh.AddBox(centre + outN * (half - 0.11f), longX ? new Vector2(span, 0.22f) : new Vector2(0.22f, span),
                yaw, groundY, 0.1f, CitySurface.Concrete, 1f);

            // Canopy over the pavement.
            float cy = groundY + groundH - 1.15f;
            Vector2 cc = centre + outN * (half + 0.55f);
            Vector2 cs = longX ? new Vector2(span * 0.96f, 1.25f) : new Vector2(1.25f, span * 0.96f);
            mesh.AddBox(cc, cs, yaw, cy, 0.16f, CitySurface.RoofMetal, 1f);

            // Sign band above the canopy, and a vertical box sign on one end.
            Vector2 sc = centre + outN * (half + 0.1f);
            Vector2 ss = longX ? new Vector2(span * 0.96f, 0.16f) : new Vector2(0.16f, span * 0.96f);
            mesh.AddBox(sc, ss, yaw, cy + 0.2f, 0.95f, CitySurface.Signage, 1f);

            if (KontoNoise.White(5501, sx, sy) < 0.55f)
            {
                float end = span * 0.5f - 0.5f;
                Vector2 vc = centre + along * end + outN * (half + 0.40f);
                float vh = Mathf.Min(groundH * 1.9f, 6.5f);
                float vw = 0.85f;
                Vector3 N2 = new Vector3(outN.x, 0f, outN.y), A2 = new Vector3(along.x, 0f, along.y);
                Vector3 s0 = new Vector3(vc.x, groundY + groundH - 0.6f, vc.y) - A2 * (vw * 0.5f);
                Vector3 s1 = s0 + A2 * vw;
                // One panel of the sign sheet, stretched up the box: a 縦看板, not a ladder.
                mesh.AddQuad(s0, s1, s1 + Vector3.up * vh, s0 + Vector3.up * vh, N2, CitySurface.Signage,
                    new Vector2(0f, 0f), new Vector2(0.92f, 0f), new Vector2(0.92f, 0.2f), new Vector2(0f, 0.2f));
                mesh.AddQuad(s1 + N2 * -0.22f, s0 + N2 * -0.22f, s0 + N2 * -0.22f + Vector3.up * vh,
                    s1 + N2 * -0.22f + Vector3.up * vh, -N2, CitySurface.Signage,
                    new Vector2(0f, 0.2f), new Vector2(0.92f, 0.2f), new Vector2(0.92f, 0.4f), new Vector2(0f, 0.4f));
                mesh.AddBox(vc, longX ? new Vector2(vw, 0.24f) : new Vector2(0.24f, vw), yaw,
                    groundY + groundH - 0.6f, vh, CitySurface.DarkMetal, 1f, false, true);
            }
        }

        static void Entrance(BuildingMesh mesh, Vector2 centre, Vector2 size, float yaw, float groundY,
            float groundH, int sx, int sy)
        {
            Vector2 ax, az;
            CityGeom.Axes(yaw, out ax, out az);
            bool longX = size.x >= size.y;
            Vector2 outN = longX ? az : ax;
            float half = (longX ? size.y : size.x) * 0.5f;
            float span = longX ? size.x : size.y;
            float w = Mathf.Min(span * 0.42f, 9f);

            Vector2 gc = centre + outN * (half - 0.35f);
            Vector2 gs = longX ? new Vector2(w, 0.12f) : new Vector2(0.12f, w);
            mesh.AddBox(gc, gs, yaw, groundY + 0.1f, groundH - 0.9f, CitySurface.Shopfront, 1f);

            float cy = groundY + groundH - 0.75f;
            Vector2 cc = centre + outN * (half + 1.3f);
            Vector2 cs = longX ? new Vector2(w + 2.4f, 2.8f) : new Vector2(2.8f, w + 2.4f);
            mesh.AddBox(cc, cs, yaw, cy, 0.3f, CitySurface.Concrete, 1f);

            // Two columns holding the canopy up.
            for (int i = -1; i <= 1; i += 2)
            {
                Vector2 along = longX ? ax : az;
                Vector2 pc = centre + along * (i * (w * 0.5f + 0.9f)) + outN * (half + 2.3f);
                mesh.AddPost(new Vector3(pc.x, groundY, pc.y), 0.22f, cy - groundY, 8, CitySurface.Concrete);
            }
        }

        // ------------------------------------------------------------------ low rise

        /// <summary>A block of houses: separate little buildings with pitched roofs, gaps between
        /// them, and a boundary wall along the street.</summary>
        static void Houses(in CityPlot plot, BuildingMesh mesh, float r)
        {
            const float spacing = 9.5f;
            int nx = Mathf.Clamp(Mathf.FloorToInt(plot.size.x / spacing), 1, 6);
            int nz = Mathf.Clamp(Mathf.FloorToInt(plot.size.y / spacing), 1, 6);
            float cellX = plot.size.x / nx, cellZ = plot.size.y / nz;
            int sx = Mathf.RoundToInt(plot.center.x), sy = Mathf.RoundToInt(plot.center.y);

            for (int ix = 0; ix < nx; ix++)
            for (int iz = 0; iz < nz; iz++)
            {
                float hr = KontoNoise.White(9187, sx + ix, sy + iz);
                if (hr > 0.90f) continue;                       // a gap, a garden, a car port

                Vector2 local = new Vector2(-plot.size.x * 0.5f + cellX * (ix + 0.5f),
                                            -plot.size.y * 0.5f + cellZ * (iz + 0.5f));
                Vector2 c = CityGeom.FromRectLocal(local, plot.center, plot.rotation);
                Vector2 s = new Vector2(cellX * 0.74f, cellZ * 0.74f);
                int floors = hr < 0.55f ? 2 : (hr < 0.86f ? 1 : 3);
                float wallH = floors * 2.9f;
                float yaw = plot.rotation + ((KontoNoise.Hash(9193, sx + ix, sy + iz) & 1) == 0 ? 0f : 90f);

                mesh.AddBox(c, s, yaw, plot.groundY, wallH, CitySurface.Siding, 1f);
                mesh.AddGableRoof(c, s, yaw, plot.groundY + wallH, Mathf.Min(s.x, s.y) * 0.32f, 0.55f,
                    CitySurface.RoofTile, CitySurface.Siding);

                // A porch, and the low wall every Japanese house has along the lane.
                Vector2 ax, az;
                CityGeom.Axes(yaw, out ax, out az);
                Vector2 pc = c + az * (s.y * 0.5f + 0.7f);
                mesh.AddBox(pc, new Vector2(s.x * 0.34f, 1.4f), yaw, plot.groundY + 2.25f, 0.14f,
                    CitySurface.RoofMetal, 1f);
                if (hr < 0.5f)
                    mesh.AddBox(c + az * (cellZ * 0.46f), new Vector2(cellX * 0.9f, 0.18f), yaw,
                        plot.groundY, 0.95f, CitySurface.Concrete, 1f);
            }
        }

        /// <summary>A shed: a long-span portal frame with a shallow pitch. Factories and wharves.</summary>
        static void Shed(BuildingMesh mesh, Vector2 centre, Vector2 size, float yaw, float groundY,
            Style style, int floors, float r)
        {
            float wallH = Mathf.Max(style.floorHeight, floors * style.floorHeight * 0.8f);
            mesh.AddBox(centre, size, yaw, groundY, wallH, style.wall, 1f);
            mesh.AddGableRoof(centre, size, yaw, groundY + wallH, Mathf.Min(size.x, size.y) * 0.14f, 0.7f,
                style.roof, style.wall);

            // Roller shutter doors along the long side.
            Vector2 ax, az;
            CityGeom.Axes(yaw, out ax, out az);
            bool longX = size.x >= size.y;
            Vector2 along = longX ? ax : az, outN = longX ? az : ax;
            float span = longX ? size.x : size.y;
            float half = (longX ? size.y : size.x) * 0.5f;
            int doors = Mathf.Clamp(Mathf.FloorToInt(span / 12f), 1, 5);
            for (int i = 0; i < doors; i++)
            {
                float t = -span * 0.5f + span * (i + 0.5f) / doors;
                Vector2 dc = centre + along * t + outN * (half + 0.06f);
                Vector2 ds = longX ? new Vector2(4.2f, 0.12f) : new Vector2(0.12f, 4.2f);
                mesh.AddBox(dc, ds, yaw, groundY, 4.4f, CitySurface.TrimMetal, 1f);
            }

            // Ridge vents and a flue, so the roof is not a blank plane from the expressway.
            float ridgeY = groundY + wallH + Mathf.Min(size.x, size.y) * 0.14f;
            int vents = Mathf.Clamp(Mathf.FloorToInt(span / 14f), 1, 4);
            for (int i = 0; i < vents; i++)
            {
                float t = -span * 0.5f + span * (i + 0.5f) / vents;
                Vector2 vc = centre + along * t;
                mesh.AddBox(vc, longX ? new Vector2(2.6f, 1.1f) : new Vector2(1.1f, 2.6f), yaw,
                    ridgeY - 0.25f, 0.55f, CitySurface.TrimMetal, 1f);
            }
            if (r > 0.45f)
            {
                Vector2 fc = centre + along * (span * 0.32f) + outN * (half * 0.5f);
                mesh.AddPost(new Vector3(fc.x, groundY, fc.y), 0.55f, wallH + 7f, 8, CitySurface.DarkMetal);
            }
        }

        // ------------------------------------------------------------------ helpers

        static float SnapUp(float v, float unit, int min)
        {
            return Mathf.Max(min, Mathf.Ceil(v / unit - 0.001f)) * unit;
        }

        static float SnapDown(float v, float unit, int min)
        {
            return Mathf.Max(min, Mathf.Floor(v / unit + 0.001f)) * unit;
        }
    }
}
