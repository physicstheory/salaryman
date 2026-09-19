using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>The front door: one window that builds the island, the water and the lighting.</summary>
    public class KontoWorldBuilderWindow : EditorWindow
    {
        KontoWorldSettings _settings;
        Vector2 _scroll;
        bool _rebuildProfiles = true;
        bool _regenerateArt = false;

        bool _stepHdrp = true;
        bool _stepTextures = true;
        bool _stepFoliage = true;
        bool _stepTerrain = true;
        bool _stepWater = true;
        bool _stepEnvironment = true;
        bool _stepViewpoint = true;
        bool _stepCity = true;
        bool _stepCharacter = true;
        bool _cityBlockout = false;
        bool _cityBuildings = true;
        bool _regenerateSurfaces = false;
        bool _cityTraffic = true;

        [MenuItem("Tools/SalaryMan/Konto World Builder", false, 0)]
        public static void Open()
        {
            var window = GetWindow<KontoWorldBuilderWindow>(false, "Konto World", true);
            window.minSize = new Vector2(380f, 520f);
            window.Show();
        }

        void OnEnable()
        {
            if (_settings == null)
                _settings = AssetDatabase.LoadAssetAtPath<KontoWorldSettings>(KontoAssetPaths.Settings + "/KontoWorldSettings.asset");
        }

        void OnGUI()
        {
            _scroll = EditorGUILayout.BeginScrollView(_scroll);

            EditorGUILayout.LabelField("Konto", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "Generates the base landscape of Konto: an island arc modelled on Honshu, with " +
                "a mountain backbone, a volcanic front, intermontane basins, coastal alluvial " +
                "plains, a ria coast on the ocean side and a dune coast on the sheltered side. " +
                "Then it reserves the ground for Tokonto on the Kanmei Plain: wards, roads, " +
                "railways and every building plot, graded flat and waiting for buildings.", MessageType.None);

            EditorGUILayout.Space();
            _settings = (KontoWorldSettings)EditorGUILayout.ObjectField("World settings", _settings, typeof(KontoWorldSettings), false);

            if (_settings == null)
            {
                EditorGUILayout.HelpBox("No settings asset assigned.", MessageType.Warning);
                if (GUILayout.Button("Create default settings asset", GUILayout.Height(28f)))
                    _settings = KontoWorldBuilder.LoadOrCreateSettings();
                EditorGUILayout.EndScrollView();
                return;
            }

            DrawSummary();

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Steps", EditorStyles.boldLabel);
            _stepHdrp = EditorGUILayout.ToggleLeft("Configure the HDRP asset (water, clouds, SSR, SSGI)", _stepHdrp);
            _stepTextures = EditorGUILayout.ToggleLeft("Generate ground textures and terrain layers", _stepTextures);
            _stepFoliage = EditorGUILayout.ToggleLeft("Generate stand-in trees and grass", _stepFoliage);
            _stepTerrain = EditorGUILayout.ToggleLeft("Generate the island and build terrain tiles", _stepTerrain);
            _stepWater = EditorGUILayout.ToggleLeft("Build the sea and the lakes", _stepWater);
            _stepEnvironment = EditorGUILayout.ToggleLeft("Build sky, fog, clouds and lighting", _stepEnvironment);
            _stepCity = EditorGUILayout.ToggleLeft("Plan the cities and build them", _stepCity);
            using (new EditorGUI.DisabledScope(!_stepCity))
            {
                EditorGUI.indentLevel++;
                _cityBuildings = EditorGUILayout.ToggleLeft("Buildings, street furniture and their materials", _cityBuildings);
                using (new EditorGUI.DisabledScope(!_cityBuildings))
                {
                    _regenerateSurfaces = EditorGUILayout.ToggleLeft("Repaint the facade and roof textures", _regenerateSurfaces);
                    _cityTraffic = EditorGUILayout.ToggleLeft("Traffic and a crowd on the pavements", _cityTraffic);
                }
                _cityBlockout = EditorGUILayout.ToggleLeft("Grey massing blockout instead of buildings", _cityBlockout);
                EditorGUI.indentLevel--;
            }
            _stepCharacter = EditorGUILayout.ToggleLeft("Put Seiko Shigu in the scene, rigged and animated", _stepCharacter);
            _stepViewpoint = EditorGUILayout.ToggleLeft("Place a fly camera looking at the island", _stepViewpoint);

            EditorGUILayout.Space();
            _rebuildProfiles = EditorGUILayout.ToggleLeft("Rebuild volume profiles (discards hand tweaks to them)", _rebuildProfiles);
            _regenerateArt = EditorGUILayout.ToggleLeft("Regenerate textures and meshes even if they already exist", _regenerateArt);

            EditorGUILayout.Space();
            using (new EditorGUI.DisabledScope(EditorApplication.isPlaying))
            {
                GUI.backgroundColor = new Color(0.62f, 0.82f, 0.62f);
                if (GUILayout.Button("Build Konto", GUILayout.Height(40f)))
                {
                    ApplyCityOptions();
                    KontoWorldBuilder.BuildAll(_settings, SelectedSteps(), _rebuildProfiles, _regenerateArt);
                }
                GUI.backgroundColor = Color.white;

                EditorGUILayout.Space();
                if (GUILayout.Button("Regenerate terrain and city only (keeps art and lighting)"))
                {
                    ApplyCityOptions();
                    KontoWorldBuilder.BuildAll(_settings, KontoBuildSteps.Terrain | KontoBuildSteps.Water
                        | KontoBuildSteps.City | KontoBuildSteps.SpawnPoint, false, false);
                }
                if (GUILayout.Button("Rebuild the city only (keeps the terrain)"))
                {
                    ApplyCityOptions();
                    KontoWorldBuilder.BuildAll(_settings, KontoBuildSteps.City, false, false);
                }
                if (GUILayout.Button("Rebuild lighting and sky only"))
                {
                    KontoWorldBuilder.BuildAll(_settings, KontoBuildSteps.Environment, _rebuildProfiles, false);
                }
                if (GUILayout.Button("New random seed, then rebuild terrain"))
                {
                    Undo.RecordObject(_settings, "New Konto seed");
                    _settings.seed = Random.Range(1, int.MaxValue);
                    EditorUtility.SetDirty(_settings);
                    ApplyCityOptions();
                    KontoWorldBuilder.BuildAll(_settings, KontoBuildSteps.Terrain | KontoBuildSteps.Water
                        | KontoBuildSteps.City | KontoBuildSteps.SpawnPoint, false, false);
                }

                EditorGUILayout.Space();
                GUI.backgroundColor = new Color(0.9f, 0.6f, 0.6f);
                if (GUILayout.Button("Clear the world from this scene"))
                {
                    if (EditorUtility.DisplayDialog("Clear Konto",
                        "Remove the terrain, water and environment objects from this scene?\n\nGenerated TerrainData assets are kept on disk.", "Clear", "Cancel"))
                    {
                        KontoWorldBuilder.ClearEverything(false);
                    }
                }
                GUI.backgroundColor = Color.white;
            }

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Quick actions", EditorStyles.boldLabel);
            if (GUILayout.Button("Open the city window")) KontoCityWindow.Open();
            if (GUILayout.Button("Select the settings asset")) Selection.activeObject = _settings;
            if (GUILayout.Button("Reset the settings to the Konto defaults"))
            {
                Undo.RecordObject(_settings, "Reset Konto settings");
                _settings.ApplyKontoDefaults();
                EditorUtility.SetDirty(_settings);
            }

            EditorGUILayout.EndScrollView();
        }

        void DrawSummary()
        {
            Vector2 size = _settings.WorldSize;
            float metresPerSample = _settings.tileSize / (_settings.heightmapResolution - 1);
            int tiles = _settings.tilesX * _settings.tilesZ;

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("This build", EditorStyles.boldLabel);
            EditorGUI.indentLevel++;
            EditorGUILayout.LabelField("Island extent", string.Format("{0:0} x {1:0} m ({2:0.0} km²)", size.x, size.y, size.x * size.y / 1000000f));
            EditorGUILayout.LabelField("Terrain tiles", string.Format("{0} ({1} x {2})", tiles, _settings.tilesX, _settings.tilesZ));
            EditorGUILayout.LabelField("Heightmap detail", string.Format("{0:0.0} m per sample", metresPerSample));
            EditorGUILayout.LabelField("Working raster", string.Format("{0} x {1}", _settings.WorkingWidth, _settings.WorkingHeight));
            EditorGUILayout.LabelField("Highest ground", string.Format("{0:0} m", _settings.maxHeight));
            EditorGUILayout.LabelField("Erosion droplets", string.Format("{0:n0}", _settings.erosionDroplets));

            if (_settings.buildCities && _settings.cities != null)
            {
                for (int i = 0; i < _settings.cities.Count; i++)
                {
                    var city = _settings.cities[i];
                    if (city == null) continue;
                    EditorGUILayout.LabelField(city.name, string.Format("{0:0.0} x {1:0.0} km, {2} wards, {3:0.0} km² of ground",
                        city.alongRadius * 2f / 1000f, city.inlandRadius * 2f / 1000f, city.wardCount, city.FootprintAreaKm2));
                }
            }
            EditorGUI.indentLevel--;

            if (metresPerSample > 4f)
                EditorGUILayout.HelpBox("Over 4 m per heightmap sample. Slopes will look soft up close; raise Heightmap Resolution.", MessageType.Info);
            if (_settings.erosionDroplets > 2500000)
                EditorGUILayout.HelpBox("That many droplets will take several minutes.", MessageType.Info);
        }

        void ApplyCityOptions()
        {
            KontoWorldBuilder.BuildCityBlockout = _cityBlockout;
            KontoCityFactory.BuildBuildings = _cityBuildings;
            KontoCityFactory.RegenerateSurfaces = _regenerateSurfaces || _regenerateArt;
            KontoCityFactory.BuildTraffic = _cityTraffic;
        }

        KontoBuildSteps SelectedSteps()
        {
            var steps = KontoBuildSteps.None;
            if (_stepHdrp) steps |= KontoBuildSteps.ConfigureHdrp;
            if (_stepTextures) steps |= KontoBuildSteps.GroundTextures;
            if (_stepFoliage) steps |= KontoBuildSteps.Foliage;
            if (_stepTerrain) steps |= KontoBuildSteps.Terrain;
            if (_stepWater) steps |= KontoBuildSteps.Water;
            if (_stepEnvironment) steps |= KontoBuildSteps.Environment;
            if (_stepCity) steps |= KontoBuildSteps.City;
            if (_stepCharacter) steps |= KontoBuildSteps.Character;
            if (_stepViewpoint) steps |= KontoBuildSteps.SpawnPoint;
            return steps;
        }
    }

    /// <summary>Menu entries for the things people reach for most often.</summary>
    public static class KontoMenu
    {
        [MenuItem("Tools/SalaryMan/Build Konto (all steps)", false, 20)]
        public static void BuildAll()
        {
            var settings = KontoWorldBuilder.LoadOrCreateSettings();
            KontoWorldBuilder.BuildAll(settings, KontoBuildSteps.All);
        }

        [MenuItem("Tools/SalaryMan/Rebuild the city only", false, 21)]
        public static void RebuildCity()
        {
            var settings = KontoWorldBuilder.LoadOrCreateSettings();
            KontoWorldBuilder.BuildAll(settings, KontoBuildSteps.City, false, false);
        }

        [MenuItem("Tools/SalaryMan/Repaint the city surfaces", false, 22)]
        public static void RepaintSurfaces()
        {
            var settings = KontoWorldBuilder.LoadOrCreateSettings();
            KontoSurfaceLibrary.CreateOrUpdate(settings.seed, true);
            Debug.Log("[Konto] Facade, roof and metal textures repainted.");
        }

        [MenuItem("Tools/SalaryMan/Put Seiko In The Scene", false, 23)]
        public static void PlaceSeiko()
        {
            KontoSeikoSetup.Build();
        }

        [MenuItem("Tools/SalaryMan/Configure HDRP Asset", false, 40)]
        public static void ConfigureHdrp()
        {
            KontoHdrpAssetConfigurator.Configure();
        }

        [MenuItem("Tools/SalaryMan/Install Gamepad Axes (legacy input only)", false, 42)]
        public static void InstallGamepadAxes()
        {
            KontoInputAxisInstaller.Install();
        }

        [MenuItem("Tools/SalaryMan/Add Walker To Scene", false, 41)]
        public static void AddWalker()
        {
            var go = new GameObject("Konto Walker");
            var controller = go.AddComponent<CharacterController>();
            controller.height = 1.72f;
            controller.radius = 0.32f;
            controller.center = new Vector3(0f, 0.86f, 0f);
            controller.slopeLimit = 52f;
            controller.stepOffset = 0.42f;

            var walker = go.AddComponent<KontoWalker>();

            var camGo = new GameObject("Eyes");
            camGo.transform.SetParent(go.transform, false);
            camGo.transform.localPosition = new Vector3(0f, 1.64f, 0f);
            walker.cameraPivot = camGo.transform;

            Camera cam = KontoSceneUtil.EnsureMainCamera();
            if (cam != null)
            {
                // The walker owns the camera from here: parent it to the eyes.
                var freeCam = cam.GetComponent<KontoFreeCamera>();
                if (freeCam != null) Object.DestroyImmediate(freeCam);

                cam.transform.SetParent(camGo.transform, false);
                cam.transform.localPosition = Vector3.zero;
                cam.transform.localRotation = Quaternion.identity;
                cam.nearClipPlane = 0.15f;
            }

            // Drop the walker onto the terrain under the scene view camera.
            if (SceneView.lastActiveSceneView != null)
            {
                Vector3 p = SceneView.lastActiveSceneView.camera.transform.position;
                RaycastHit hit;
                if (Physics.Raycast(new Vector3(p.x, 5000f, p.z), Vector3.down, out hit, 10000f))
                    go.transform.position = hit.point + Vector3.up * 0.2f;
                else
                    go.transform.position = new Vector3(p.x, 200f, p.z);
            }

            Selection.activeGameObject = go;
        }
    }
}
