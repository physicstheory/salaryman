using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Puts the planned city into the scene. The city's ground is already part of the terrain by
    /// the time this runs, so what gets created here is the handover kit:
    ///
    /// - the plan, saved as an asset, so any plot can be addressed by code later
    /// - an empty per ward, so the hierarchy reads like a map
    /// - a marker on every named site: Soti's tower, the terminus, the city hall, the palace
    /// - water surfaces for the moat and any cut canal
    /// - an optional grey massing blockout, so the city can be judged, driven through and lit
    ///   before a single building exists
    ///
    /// The blockout is meant to be deleted. Everything else is the scaffolding you build on.
    /// </summary>
    public static class KontoCityFactory
    {
        public const string RootName = "Konto Cities";
        public const string BlockoutName = "Blockout (delete when the real buildings arrive)";

        /// <summary>Build the modelled, textured buildings rather than the grey massing.</summary>
        public static bool BuildBuildings = true;
        /// <summary>Repaint the facade and roof textures even if they are already on disk.</summary>
        public static bool RegenerateSurfaces = false;

        public static List<KontoCityLayoutAsset> Build(KontoWorldData data, bool buildBlockout = false)
        {
            var assets = new List<KontoCityLayoutAsset>();
            if (data == null || data.Urban == null || data.Urban.Cities.Count == 0) return assets;

            KontoAssetPaths.EnsureAll();
            Clear();

            int seed = data.Settings != null ? data.Settings.seed : 0;
            Material[] surfaces = BuildBuildings
                ? KontoSurfaceLibrary.CreateOrUpdate(seed, RegenerateSurfaces)
                : null;

            var root = new GameObject(RootName);

            for (int i = 0; i < data.Urban.Cities.Count; i++)
            {
                var city = data.Urban.Cities[i];
                if (city == null || city.Layout == null) continue;

                var asset = SaveLayout(city.Layout, data.Settings.seed);
                assets.Add(asset);

                var cityGo = new GameObject(city.Layout.name);
                cityGo.transform.SetParent(root.transform, true);
                var cityRoot = cityGo.AddComponent<KontoCityRoot>();
                cityRoot.city = asset;

                CreateWardAnchors(city.Layout, cityGo.transform);
                CreateNamedSiteMarkers(city.Layout, cityGo.transform);
                CreateCityWater(city.Layout, cityGo.transform);
                if (BuildBuildings && surfaces != null)
                {
                    KontoBuildingFactory.Build(city.Layout, cityGo.transform, surfaces);
                    KontoPropFactory.Build(city.Layout, cityGo.transform, surfaces);
                    CreateSotiTower(city.Layout, cityGo.transform);
                }
                if (buildBlockout) CreateBlockout(city.Layout, cityGo.transform);

                Debug.Log("[Konto] " + city.Layout.Summary() + " Plan saved to " + AssetDatabase.GetAssetPath(asset));
            }

            AssetDatabase.SaveAssets();
            return assets;
        }

        public static void Clear()
        {
            var existing = GameObject.Find(RootName);
            if (existing != null) Object.DestroyImmediate(existing);
        }

        // ---------------------------------------------------------------- the plan as an asset

        static KontoCityLayoutAsset SaveLayout(CityLayout layout, int worldSeed)
        {
            string path = string.Format("{0}/KontoCityLayout_{1}.asset", KontoAssetPaths.Settings, layout.code);
            var asset = AssetDatabase.LoadAssetAtPath<KontoCityLayoutAsset>(path);
            if (asset == null)
            {
                asset = ScriptableObject.CreateInstance<KontoCityLayoutAsset>();
                AssetDatabase.CreateAsset(asset, path);
            }
            asset.layout = layout;
            asset.builtFromSeed = worldSeed.ToString();
            EditorUtility.SetDirty(asset);
            return asset;
        }

        // ---------------------------------------------------------------- hierarchy

        static void CreateWardAnchors(CityLayout layout, Transform parent)
        {
            var wards = new GameObject("Wards");
            wards.transform.SetParent(parent, true);

            for (int i = 0; i < layout.wards.Count; i++)
            {
                var ward = layout.wards[i];
                var go = new GameObject(string.Format("{0} [{1}] - {2} ({3} plots)", ward.name, ward.code, ward.kind, ward.plotCount));
                go.transform.SetParent(wards.transform, true);
                go.transform.position = new Vector3(ward.center.x, ward.groundY, ward.center.y);
                go.transform.rotation = Quaternion.Euler(0f, ward.gridAngle, 0f);
            }
        }

        /// <summary>
        /// A marker for every site the story or the network needs by name, and for every station.
        /// The rest of the plots stay as data: twenty thousand GameObjects would make the scene
        /// unusable, and the layout asset can spawn markers for a ward on demand.
        /// </summary>
        static void CreateNamedSiteMarkers(CityLayout layout, Transform parent)
        {
            var group = new GameObject("Reserved sites");
            group.transform.SetParent(parent, true);

            var done = new HashSet<int>();

            for (int i = 0; i < layout.reservations.Count; i++)
            {
                var reservation = layout.reservations[i];
                CityPlot plot;
                if (layout.TryGetPlot(reservation.plotId, out plot))
                {
                    done.Add(plot.id);
                    CreateMarker(layout, plot, group.transform, reservation.name, reservation.note);
                }
                else
                {
                    // A reservation with no plot behind it: the palace grounds, for instance.
                    var go = new GameObject(reservation.name);
                    go.transform.SetParent(group.transform, true);
                    go.transform.position = new Vector3(reservation.center.x, 0f, reservation.center.y);
                    var marker = go.AddComponent<CityPlotMarker>();
                    marker.plotCode = "";
                    marker.kind = PlotKind.ParkSpace;
                    marker.size = new Vector2(reservation.radius * 2f, reservation.radius * 2f);
                    marker.reservedFor = reservation.name + " - " + reservation.note;
                }
            }

            for (int i = 0; i < layout.stations.Count; i++)
            {
                var station = layout.stations[i];
                CityPlot plot;
                if (!layout.TryGetPlot(station.plotId, out plot)) continue;
                if (!done.Add(plot.id)) continue;
                CreateMarker(layout, plot, group.transform, station.name,
                    station.terminus ? "Terminus." : (station.elevated ? "Elevated station." : "Ground level station."));
            }

            // The tallest handful of plots, wherever they ended up: these are the sites worth
            // knowing about when the art arrives.
            var tall = layout.PlotsOfKind(PlotKind.Tower);
            tall.Sort((a, b) => b.maxHeight.CompareTo(a.maxHeight));
            for (int i = 0; i < tall.Count && i < 8; i++)
            {
                if (!done.Add(tall[i].id)) continue;
                CreateMarker(layout, tall[i], group.transform, "Tower site " + (i + 1), "");
            }
        }

        public static GameObject CreateMarker(CityLayout layout, in CityPlot plot, Transform parent, string name, string note)
        {
            string code = layout.PlotCode(plot);
            var go = new GameObject(string.IsNullOrEmpty(name) ? code : name + " (" + code + ")");
            go.transform.SetParent(parent, true);
            go.transform.position = plot.WorldPosition;
            go.transform.rotation = plot.WorldRotation;

            var marker = go.AddComponent<CityPlotMarker>();
            marker.plotCode = code;
            marker.wardName = plot.ward >= 0 && plot.ward < layout.wards.Count ? layout.wards[plot.ward].name : "";
            marker.kind = plot.kind;
            marker.size = plot.size;
            marker.maxFloors = plot.maxFloors;
            marker.maxHeight = plot.maxHeight;
            marker.corner = plot.corner;
            marker.reservedFor = note;
            return go;
        }

        /// <summary>Creates markers for every plot in one ward, for when that ward is being filled in.</summary>
        public static int CreateWardMarkers(KontoCityLayoutAsset asset, int wardIndex, Transform parent)
        {
            if (asset == null || asset.layout == null) return 0;
            var layout = asset.layout;
            if (wardIndex < 0 || wardIndex >= layout.wards.Count) return 0;

            var ward = layout.wards[wardIndex];
            var group = new GameObject(ward.name + " plots");
            if (parent != null) group.transform.SetParent(parent, true);
            group.transform.position = new Vector3(ward.center.x, ward.groundY, ward.center.y);

            int made = 0;
            for (int i = 0; i < layout.plots.Count; i++)
            {
                if (layout.plots[i].ward != wardIndex) continue;
                CreateMarker(layout, layout.plots[i], group.transform, "", "");
                made++;
            }
            return made;
        }

        // ---------------------------------------------------------------- city water

        static void CreateCityWater(CityLayout layout, Transform parent)
        {
            if (layout.waters.Count == 0) return;
            var group = new GameObject("Water");
            group.transform.SetParent(parent, true);

            for (int i = 0; i < layout.waters.Count; i++)
            {
                var body = layout.waters[i];
                KontoWaterFactory.CreateWaterQuad(group.transform,
                    string.IsNullOrEmpty(body.name) ? "City water " + i : body.name + " " + (i + 1),
                    new Vector3(body.center.x, body.surfaceY, body.center.y),
                    body.size, body.rotation, true);
            }
        }

        // ---------------------------------------------------------------- massing blockout

        static void CreateBlockout(CityLayout layout, Transform parent)
        {
            var group = new GameObject(BlockoutName);
            group.transform.SetParent(parent, true);

            Material massing = BlockoutMaterial("Konto_Blockout_Massing", new Color(0.62f, 0.62f, 0.60f), 0.18f);
            Material deck = BlockoutMaterial("Konto_Blockout_Deck", new Color(0.44f, 0.44f, 0.46f), 0.22f);

            // One mesh per ward, so the scene stays light and a ward can be hidden or deleted.
            for (int w = 0; w < layout.wards.Count; w++)
            {
                var builder = new BoxMesh();

                for (int i = 0; i < layout.plots.Count; i++)
                {
                    var plot = layout.plots[i];
                    if (plot.ward != w) continue;
                    // The landmark is modelled, not massed: see CreateSotiTower below.
                    if (plot.kind == PlotKind.Landmark) continue;
                    AddPlotMassing(plot, builder);
                }

                var ward = layout.wards[w];
                AddMeshObject(group.transform, builder, massing, layout, ward.name + " massing", "Massing_" + layout.code + "_" + w);
            }

            if (!BuildBuildings) CreateSotiTower(layout, group.transform);

            // Viaducts and bridges: these carry nothing on the ground, so without a deck they
            // are invisible, and the expressway loop is half the character of the city.
            var structures = new BoxMesh();
            for (int i = 0; i < layout.roads.Count; i++)
            {
                var road = layout.roads[i];
                if (!road.elevated) continue;
                AddDeck(structures, road.points, road.loop, road.halfWidth, 1.3f, 34f);
            }
            for (int i = 0; i < layout.rails.Count; i++)
            {
                var line = layout.rails[i];
                if (!line.elevated) continue;
                AddDeck(structures, line.points, line.loop, line.halfWidth, 1.6f, 30f);
            }
            for (int i = 0; i < layout.bridges.Count; i++)
            {
                var bridge = layout.bridges[i];
                var points = new List<Vector3>
                {
                    new Vector3(bridge.from.x, bridge.deckY, bridge.from.y),
                    new Vector3(bridge.to.x, bridge.deckY, bridge.to.y),
                };
                AddDeck(structures, points, false, bridge.halfWidth, 1.4f, 40f);
            }
            AddMeshObject(group.transform, structures, deck, layout, "Viaducts and bridges", "Structures_" + layout.code);
        }

        /// <summary>Metres of street frontage one building takes, or 0 to keep the plot whole.</summary>
        static float FrontageUnit(PlotKind kind)
        {
            switch (kind)
            {
                case PlotKind.Shophouse: return 9.5f;
                case PlotKind.MidRise: return 13f;
                case PlotKind.Apartment: return 15f;
                case PlotKind.Office: return 21f;
                default: return 0f;
            }
        }

        static void AddPlotMassing(in CityPlot plot, BoxMesh mesh)
        {
            switch (plot.kind)
            {
                case PlotKind.ParkSpace:
                case PlotKind.ShrineGround:
                case PlotKind.Parking:
                case PlotKind.Vacant:
                case PlotKind.Wharf:
                    return;
            }

            // A deterministic wobble on the height, so the blockout has a skyline rather than a
            // flat top at the zoning limit.
            float r = KontoNoise.White(9173, Mathf.RoundToInt(plot.center.x), Mathf.RoundToInt(plot.center.y));
            float r2 = KontoNoise.White(9179, Mathf.RoundToInt(plot.center.y), Mathf.RoundToInt(plot.center.x));

            if (plot.kind == PlotKind.HouseCluster)
            {
                // A block of low rise houses, not one slab.
                float spacing = 9.5f;
                int nx = Mathf.Clamp(Mathf.FloorToInt(plot.size.x / spacing), 1, 6);
                int nz = Mathf.Clamp(Mathf.FloorToInt(plot.size.y / spacing), 1, 6);
                float cellX = plot.size.x / nx;
                float cellZ = plot.size.y / nz;

                for (int ix = 0; ix < nx; ix++)
                for (int iz = 0; iz < nz; iz++)
                {
                    float hx = -plot.size.x * 0.5f + cellX * (ix + 0.5f);
                    float hz = -plot.size.y * 0.5f + cellZ * (iz + 0.5f);
                    float hr = KontoNoise.White(9187, Mathf.RoundToInt(plot.center.x) + ix, Mathf.RoundToInt(plot.center.y) + iz);
                    if (hr > 0.91f) continue;   // a gap, a garden, a car port
                    float height = Mathf.Lerp(5.5f, plot.maxHeight, hr * 0.7f);
                    Vector2 footprint = new Vector2(cellX * 0.78f, cellZ * 0.78f);
                    mesh.AddBox(LocalToWorld(plot, new Vector2(hx, hz)), footprint, plot.rotation, plot.groundY, height);
                }
                return;
            }

            float setback = plot.kind == PlotKind.Shophouse ? 0.6f : Mathf.Clamp(Mathf.Min(plot.size.x, plot.size.y) * 0.08f, 0.6f, 4.5f);
            Vector2 size = new Vector2(Mathf.Max(3f, plot.size.x - setback * 2f), Mathf.Max(3f, plot.size.y - setback * 2f));
            float top = plot.maxHeight * Mathf.Lerp(0.55f, 1f, r);
            if (plot.kind == PlotKind.Landmark) top = plot.maxHeight;

            // A shopping street is a run of narrow buildings sharing party walls, not one
            // slab. Splitting the frontage is what gives the blockout a rhythm in close.
            float unit = FrontageUnit(plot.kind);
            if (unit > 0f)
            {
                bool alongX = size.x >= size.y;
                float frontage = alongX ? size.x : size.y;
                int parts = Mathf.Clamp(Mathf.RoundToInt(frontage / unit), 1, 5);
                if (parts > 1)
                {
                    float width = frontage / parts;
                    for (int k = 0; k < parts; k++)
                    {
                        float along = -frontage * 0.5f + width * (k + 0.5f);
                        Vector2 local = alongX ? new Vector2(along, 0f) : new Vector2(0f, along);
                        float kr = KontoNoise.White(9311,
                            Mathf.RoundToInt(plot.center.x) + k, Mathf.RoundToInt(plot.center.y) - k);
                        Vector2 unitSize = alongX
                            ? new Vector2(width * 0.97f, size.y)
                            : new Vector2(size.x, width * 0.97f);
                        mesh.AddBox(LocalToWorld(plot, local), unitSize, plot.rotation, plot.groundY,
                            Mathf.Max(3.2f, top * Mathf.Lerp(0.62f, 1.12f, kr)));
                    }
                    return;
                }
            }

            mesh.AddBox(new Vector2(plot.center.x, plot.center.y), size, plot.rotation, plot.groundY, top);

            // Towers get a setback shoulder, which is what makes a skyline read as a skyline.
            if ((plot.kind == PlotKind.Tower || plot.kind == PlotKind.Landmark) && top > 45f && r2 > 0.35f)
            {
                Vector2 upper = size * Mathf.Lerp(0.55f, 0.78f, r2);
                mesh.AddBox(new Vector2(plot.center.x, plot.center.y), upper, plot.rotation,
                    plot.groundY + top, top * Mathf.Lerp(0.18f, 0.42f, r));
            }
        }

        static Vector2 LocalToWorld(in CityPlot plot, Vector2 local)
        {
            return CityGeom.FromRectLocal(local, plot.center, plot.rotation);
        }

        static void AddDeck(BoxMesh mesh, List<Vector3> points, bool loop, float halfWidth, float thickness, float pierSpacing)
        {
            if (points == null || points.Count < 2) return;
            int segments = loop ? points.Count : points.Count - 1;
            float sincePier = 0f;

            for (int i = 0; i < segments; i++)
            {
                Vector3 a = points[i];
                Vector3 b = points[(i + 1) % points.Count];
                Vector2 a2 = new Vector2(a.x, a.z);
                Vector2 b2 = new Vector2(b.x, b.z);
                float length = Vector2.Distance(a2, b2);
                if (length < 0.5f) continue;

                Vector2 mid = (a2 + b2) * 0.5f;
                Vector2 dir = (b2 - a2) / length;
                float yaw = CityGeom.YawFrom(dir);
                float y = (a.y + b.y) * 0.5f;

                // The deck: a slab along the segment, sized in the segment's own frame.
                mesh.AddBox(mid, new Vector2(halfWidth * 2f, length * 1.02f), yaw, y - thickness, thickness);

                sincePier += length;
                if (sincePier < pierSpacing) continue;
                sincePier = 0f;
                float pierHeight = Mathf.Max(3f, y - thickness);
                mesh.AddBox(mid, new Vector2(halfWidth * 0.55f, halfWidth * 0.55f), yaw, y - thickness - pierHeight, pierHeight);
            }
        }

        /// <summary>
        /// Drops the modelled Soti Tower onto the landmark plot. Everything else in the
        /// blockout is a box; this one building is the skyline, so it is worth the mesh.
        /// </summary>
        static void CreateSotiTower(CityLayout layout, Transform parent)
        {
            int id = -1;
            for (int i = 0; i < layout.plots.Count; i++)
            {
                if (layout.plots[i].kind != PlotKind.Landmark) continue;
                id = i;
                break;
            }
            if (id < 0) return;

            var plot = layout.plots[id];
            var mesh = SotiTower.Build("SotiTower_" + layout.code);
            string path = string.Format("{0}/Konto_SotiTower_{1}.asset", KontoAssetPaths.Meshes, layout.code);
            var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (existing != null) AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(mesh, path);

            var go = new GameObject("Soti Tower");
            go.transform.SetParent(parent, true);
            go.transform.position = plot.WorldPosition;
            go.transform.rotation = plot.WorldRotation;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterials = new[]
            {
                BlockoutMaterial("Konto_SotiTower_Glass", new Color(0.20f, 0.27f, 0.31f), 0.86f),
                BlockoutMaterial("Konto_SotiTower_Steel", new Color(0.70f, 0.74f, 0.78f), 0.72f),
            };
            go.AddComponent<MeshCollider>().sharedMesh = mesh;
            GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.ContributeGI | StaticEditorFlags.OccluderStatic);
        }

        static void AddMeshObject(Transform parent, BoxMesh builder, Material material, CityLayout layout, string name, string assetName)
        {
            if (builder.VertexCount == 0) return;

            var mesh = builder.Build(assetName);
            string path = string.Format("{0}/Konto_{1}.asset", KontoAssetPaths.Meshes, assetName);
            var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (existing != null) AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(mesh, path);

            var go = new GameObject(name);
            go.transform.SetParent(parent, true);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            go.AddComponent<MeshCollider>().sharedMesh = mesh;
            GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.ContributeGI | StaticEditorFlags.OccluderStatic | StaticEditorFlags.BatchingStatic);
        }

        static Material BlockoutMaterial(string name, Color colour, float smoothness)
        {
            KontoAssetPaths.EnsureFolder(KontoAssetPaths.Materials);
            string path = KontoAssetPaths.Materials + "/" + name + ".mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat != null) return mat;

            Shader shader = Shader.Find("HDRP/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            mat = new Material(shader);
            mat.name = name;
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", colour);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", colour);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", smoothness);
            if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", 0f);
            KontoMaterialUtil.ValidateHdrpMaterial(mat);
            AssetDatabase.CreateAsset(mat, path);
            return mat;
        }

        // ---------------------------------------------------------------- box mesh

        /// <summary>
        /// A box soup builder. The massing blockout is thousands of boxes, so they are welded
        /// into one mesh per ward rather than becoming thousands of GameObjects.
        /// </summary>
        sealed class BoxMesh
        {
            readonly List<Vector3> _vertices = new List<Vector3>();
            readonly List<Vector3> _normals = new List<Vector3>();
            readonly List<Vector2> _uvs = new List<Vector2>();
            readonly List<int> _triangles = new List<int>();

            public int VertexCount { get { return _vertices.Count; } }

            /// <summary>A box standing on the ground, sized in its own rotated frame.</summary>
            public void AddBox(Vector2 centre, Vector2 size, float yawDegrees, float baseY, float height)
            {
                if (height <= 0.05f || size.x <= 0.1f || size.y <= 0.1f) return;

                Vector2 ax, az;
                CityGeom.Axes(yawDegrees, out ax, out az);
                Vector3 x = new Vector3(ax.x, 0f, ax.y) * (size.x * 0.5f);
                Vector3 z = new Vector3(az.x, 0f, az.y) * (size.y * 0.5f);
                Vector3 y = new Vector3(0f, height, 0f);
                Vector3 origin = new Vector3(centre.x, baseY, centre.y);

                // Eight corners, then six quads with their own normals.
                Vector3 b00 = origin - x - z, b10 = origin + x - z, b11 = origin + x + z, b01 = origin - x + z;
                Vector3 t00 = b00 + y, t10 = b10 + y, t11 = b11 + y, t01 = b01 + y;

                AddQuad(t00, t10, t11, t01, Vector3.up);
                AddQuad(b00, b01, b11, b10, Vector3.down);
                AddQuad(b00, b10, t10, t00, new Vector3(-az.x, 0f, -az.y));
                AddQuad(b11, b01, t01, t11, new Vector3(az.x, 0f, az.y));
                AddQuad(b10, b11, t11, t10, new Vector3(ax.x, 0f, ax.y));
                AddQuad(b01, b00, t00, t01, new Vector3(-ax.x, 0f, -ax.y));
            }

            void AddQuad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 normal)
            {
                int start = _vertices.Count;
                _vertices.Add(a); _vertices.Add(b); _vertices.Add(c); _vertices.Add(d);
                for (int i = 0; i < 4; i++) _normals.Add(normal);
                _uvs.Add(new Vector2(0f, 0f));
                _uvs.Add(new Vector2(1f, 0f));
                _uvs.Add(new Vector2(1f, 1f));
                _uvs.Add(new Vector2(0f, 1f));
                _triangles.Add(start); _triangles.Add(start + 2); _triangles.Add(start + 1);
                _triangles.Add(start); _triangles.Add(start + 3); _triangles.Add(start + 2);
            }

            public Mesh Build(string name)
            {
                var mesh = new Mesh();
                mesh.name = name;
                // A ward's worth of massing goes well past the 16 bit index limit.
                mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
                mesh.vertices = _vertices.ToArray();
                mesh.normals = _normals.ToArray();
                mesh.uv = _uvs.ToArray();
                mesh.triangles = _triangles.ToArray();
                mesh.RecalculateBounds();
                return mesh;
            }
        }
    }
}
