using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    [Flags]
    public enum KontoBuildSteps
    {
        None = 0,
        ConfigureHdrp = 1 << 0,
        GroundTextures = 1 << 1,
        Foliage = 1 << 2,
        Terrain = 1 << 3,
        Water = 1 << 4,
        Environment = 1 << 5,
        SpawnPoint = 1 << 6,
        City = 1 << 7,
        All = ConfigureHdrp | GroundTextures | Foliage | Terrain | Water | Environment | SpawnPoint | City,
    }

    /// <summary>Runs the whole world build from the editor and saves everything it generates as assets.</summary>
    public static class KontoWorldBuilder
    {
        public const string WorldRootName = "Konto World";

        public static KontoWorldData LastBuild { get; private set; }

        /// <summary>Whether the city build also drops in the grey massing blockout.</summary>
        public static bool BuildCityBlockout = true;

        public static KontoWorldSettings LoadOrCreateSettings()
        {
            KontoAssetPaths.EnsureAll();
            string path = KontoAssetPaths.Settings + "/KontoWorldSettings.asset";
            var settings = AssetDatabase.LoadAssetAtPath<KontoWorldSettings>(path);
            if (settings != null) return settings;

            settings = ScriptableObject.CreateInstance<KontoWorldSettings>();
            settings.ApplyKontoDefaults();
            AssetDatabase.CreateAsset(settings, path);
            AssetDatabase.SaveAssets();
            Debug.Log("[Konto] Created default world settings at " + path);
            return settings;
        }

        public static void BuildAll(KontoWorldSettings settings, KontoBuildSteps steps, bool rebuildProfiles = true, bool regenerateArt = false)
        {
            if (settings == null) { Debug.LogError("[Konto] No world settings asset."); return; }

            // Tracked so a failure says which step died rather than just throwing from nowhere.
            string step = "starting up";

            try
            {
                if ((steps & KontoBuildSteps.ConfigureHdrp) != 0)
                {
                    step = "configuring the HDRP asset";
                    EditorUtility.DisplayProgressBar("Building Konto", "Configuring the HDRP asset", 0.02f);
                    KontoHdrpAssetConfigurator.Configure();
                }

                TerrainLayer[] layers = null;
                if ((steps & KontoBuildSteps.GroundTextures) != 0)
                {
                    step = "generating ground textures";
                    EditorUtility.DisplayProgressBar("Building Konto", "Generating ground textures", 0.06f);
                    layers = KontoTextureFactory.CreateOrUpdateLayers(settings.seed, regenerateArt);
                }

                KontoFoliageLibrary foliage = null;
                if ((steps & KontoBuildSteps.Foliage) != 0)
                {
                    step = "generating stand-in vegetation";
                    EditorUtility.DisplayProgressBar("Building Konto", "Generating stand-in vegetation", 0.12f);
                    foliage = KontoFoliageFactory.CreateOrUpdateLibrary(settings.seed, regenerateArt);
                }

                KontoWorldData data = null;
                if ((steps & (KontoBuildSteps.Terrain | KontoBuildSteps.Water | KontoBuildSteps.SpawnPoint | KontoBuildSteps.City)) != 0)
                {
                    step = "generating the island";
                    data = KontoWorldGenerator.Generate(settings, (msg, t) =>
                        EditorUtility.DisplayProgressBar("Building Konto", msg, 0.15f + t * 0.45f));
                    LastBuild = data;
                }

                if ((steps & KontoBuildSteps.Terrain) != 0 && data != null)
                {
                    step = "building terrain tiles";
                    if (layers == null) layers = LoadExistingLayers();
                    if (foliage == null) foliage = AssetDatabase.LoadAssetAtPath<KontoFoliageLibrary>(KontoAssetPaths.Settings + "/KontoFoliageLibrary.asset");
                    BuildTerrain(data, layers, foliage);
                }

                if ((steps & KontoBuildSteps.City) != 0 && data != null)
                {
                    step = "putting the cities into the scene";
                    EditorUtility.DisplayProgressBar("Building Konto", "Handing over the city plans", 0.86f);
                    KontoCityFactory.Build(data, BuildCityBlockout);
                }

                if ((steps & KontoBuildSteps.Water) != 0 && data != null)
                {
                    step = "building water";
                    EditorUtility.DisplayProgressBar("Building Konto", "Filling the sea and the lakes", 0.88f);
                    KontoWaterFactory.Build(data);
                }

                if ((steps & KontoBuildSteps.Environment) != 0)
                {
                    step = "building sky, fog and lighting";
                    EditorUtility.DisplayProgressBar("Building Konto", "Building sky, fog and lighting", 0.93f);
                    KontoEnvironmentFactory.Build(settings, rebuildProfiles);
                }

                if ((steps & KontoBuildSteps.SpawnPoint) != 0 && data != null)
                {
                    step = "placing the viewpoint";
                    EditorUtility.DisplayProgressBar("Building Konto", "Placing the viewpoint", 0.97f);
                    PlaceViewpoint(data);
                }

                step = "saving";
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
                EditorSceneManager.MarkSceneDirty(EditorSceneManager.GetActiveScene());
                Debug.Log("[Konto] Build complete.");
            }
            catch (System.Exception e)
            {
                Debug.LogError("[Konto] Build failed while " + step + ".\n" + e.GetType().Name + ": " + e.Message + "\n" + e.StackTrace);
                throw;
            }
            finally
            {
                EditorUtility.ClearProgressBar();
            }
        }

        static TerrainLayer[] LoadExistingLayers()
        {
            var guids = AssetDatabase.FindAssets("t:TerrainLayer", new[] { KontoAssetPaths.Layers });
            if (guids == null || guids.Length == 0) return null;

            // Keep the canonical order; the splatmap weights are indexed by it.
            // This order is the splatmap layer order, and KontoLayer indexes into it.
            string[] order = { "Sand", "RiverGravel", "PaddySoil", "Meadow", "ForestFloor", "Rock", "Scree", "Snow", "Asphalt", "Concrete", "Paving" };
            var result = new List<TerrainLayer>();
            foreach (string name in order)
            {
                var layer = AssetDatabase.LoadAssetAtPath<TerrainLayer>(KontoAssetPaths.Layers + "/Konto_" + name + ".terrainlayer");
                if (layer != null) result.Add(layer);
            }
            return result.Count > 0 ? result.ToArray() : null;
        }

        public static Terrain[] BuildTerrain(KontoWorldData data, TerrainLayer[] layers, KontoFoliageLibrary foliage)
        {
            KontoAssetPaths.EnsureAll();
            ClearWorldRoot();

            var root = new GameObject(WorldRootName);
            root.isStatic = true;

            Material terrainMaterial = null;
            var pipeline = UnityEngine.Rendering.GraphicsSettings.defaultRenderPipeline;
            if (pipeline != null) terrainMaterial = pipeline.defaultTerrainMaterial;

            var options = new TerrainBuildOptions
            {
                parent = root.transform,
                layers = layers,
                foliage = foliage,
                terrainMaterial = terrainMaterial,
                paintDetails = true,
                plantTrees = true,
                onTileCreated = (tx, tz, td) =>
                {
                    string path = string.Format("{0}/Konto_Terrain_{1}_{2}.asset", KontoAssetPaths.Terrains, tx, tz);
                    var existing = AssetDatabase.LoadAssetAtPath<TerrainData>(path);
                    if (existing != null) AssetDatabase.DeleteAsset(path);
                    AssetDatabase.CreateAsset(td, path);
                },
            };

            Terrain[] terrains;
            try
            {
                terrains = KontoTerrainBuilder.Build(data, options, (msg, t) =>
                    EditorUtility.DisplayProgressBar("Building Konto", msg, 0.6f + t * 0.25f));
            }
            finally
            {
                AssetDatabase.SaveAssets();
            }

            foreach (var terrain in terrains) GameObjectUtility.SetStaticEditorFlags(terrain.gameObject, StaticEditorFlags.ContributeGI | StaticEditorFlags.OccluderStatic | StaticEditorFlags.BatchingStatic);
            return terrains;
        }

        /// <summary>
        /// Drops a fly camera somewhere worth looking from. If there is a city, that is out over
        /// its bay looking back at the skyline with the mountains behind it, because that is the
        /// shot the whole world is built for. Failing that, the main volcano.
        /// </summary>
        static void PlaceViewpoint(KontoWorldData data)
        {
            var settings = data.Settings;
            Vector2 lookAt;
            Vector2 camXZ;
            float camHeight;

            var city = data.PrimaryCity;
            if (city != null && city.plots.Count > 0)
            {
                lookAt = city.coreCenter;
                // Stand off seaward, which is the opposite way from the island's axis.
                Vector2 seaward = -city.inlandAxis;
                camXZ = lookAt + seaward * (city.inlandRadius + 1500f) + city.alongAxis * 400f;
                camHeight = 340f;
            }
            else if (settings.volcanoes != null && settings.volcanoes.Count > 0)
            {
                var v = settings.volcanoes[0];
                lookAt = data.Land.Arc.AnchorToWorld(v.alongT, v.lateral);
                camXZ = lookAt + new Vector2(1600f, -1500f);
                camHeight = 420f;
            }
            else
            {
                lookAt = new Vector2(settings.WorldSize.x * 0.5f, settings.WorldSize.y * 0.5f);
                camXZ = lookAt + new Vector2(1600f, -1500f);
                camHeight = 420f;
            }

            camXZ.x = Mathf.Clamp(camXZ.x, 100f, settings.WorldSize.x - 100f);
            camXZ.y = Mathf.Clamp(camXZ.y, 100f, settings.WorldSize.y - 100f);
            float ground = data.SampleHeight(camXZ.x, camXZ.y);
            Vector3 camPos = new Vector3(camXZ.x, Mathf.Max(ground + 60f, camHeight), camXZ.y);
            Vector3 target = new Vector3(lookAt.x, data.SampleHeight(lookAt.x, lookAt.y) + 120f, lookAt.y);

            var stale = GameObject.Find("Konto Viewpoint");
            if (stale != null) UnityEngine.Object.DestroyImmediate(stale);

            Camera cam = KontoSceneUtil.EnsureMainCamera();
            Quaternion look = Quaternion.LookRotation((target - camPos).normalized, Vector3.up);

            cam.transform.position = camPos;
            cam.transform.rotation = look;
            // Far enough to see the far side of the island from a summit.
            cam.nearClipPlane = 0.25f;
            cam.farClipPlane = Mathf.Max(cam.farClipPlane, settings.WorldSize.magnitude * 1.1f);
            if (cam.GetComponent<KontoFreeCamera>() == null) cam.gameObject.AddComponent<KontoFreeCamera>();
            EditorUtility.SetDirty(cam.gameObject);

            // Frame it in the scene view too, so the result is visible immediately.
            if (SceneView.lastActiveSceneView != null)
            {
                SceneView.lastActiveSceneView.LookAt(target, Quaternion.LookRotation((target - camPos).normalized, Vector3.up), 2600f);
            }
        }

        public static void ClearWorldRoot()
        {
            var existing = GameObject.Find(WorldRootName);
            if (existing != null) UnityEngine.Object.DestroyImmediate(existing);
        }

        public static void ClearEverything(bool deleteAssets)
        {
            ClearWorldRoot();
            KontoCityFactory.Clear();
            var water = GameObject.Find(KontoWaterFactory.RootName);
            if (water != null) UnityEngine.Object.DestroyImmediate(water);
            var env = GameObject.Find(KontoEnvironmentFactory.RootName);
            if (env != null) UnityEngine.Object.DestroyImmediate(env);

            if (deleteAssets && AssetDatabase.IsValidFolder(KontoAssetPaths.Terrains))
            {
                AssetDatabase.DeleteAsset(KontoAssetPaths.Terrains);
                KontoAssetPaths.EnsureFolder(KontoAssetPaths.Terrains);
            }
            AssetDatabase.Refresh();
        }
    }
}
