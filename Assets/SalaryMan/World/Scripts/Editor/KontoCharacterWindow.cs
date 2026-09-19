using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>Drops a model into the world as a playable character, wired for keyboard and Xbox pad.</summary>
    public class KontoCharacterWindow : EditorWindow
    {
        GameObject _model;
        bool _takeOverMainCamera = true;
        bool _placeOnTerrain = true;
        bool _replaceExisting = true;
        float _heightOverride = 0f;
        Vector2 _scroll;

        [MenuItem("Tools/SalaryMan/Character Setup", false, 10)]
        public static void Open()
        {
            var window = GetWindow<KontoCharacterWindow>(false, "Konto Character", true);
            window.minSize = new Vector2(360f, 440f);
            window.Show();
        }

        void OnGUI()
        {
            _scroll = EditorGUILayout.BeginScrollView(_scroll);

            EditorGUILayout.LabelField("Character", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "Drop in your imported model and press Create. You get a capsule sized to the "
                + "model, camera-relative movement, a third person camera with collision, and "
                + "Xbox pad support.\n\nImport the .blend or FBX into the project first, then "
                + "drag the resulting prefab into the field below.", MessageType.None);

            EditorGUILayout.Space();
            _model = (GameObject)EditorGUILayout.ObjectField("Model", _model, typeof(GameObject), true);

            if (_model == null && Selection.activeGameObject != null)
            {
                if (GUILayout.Button("Use selection: " + Selection.activeGameObject.name))
                    _model = Selection.activeGameObject;
            }

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Options", EditorStyles.boldLabel);
            _takeOverMainCamera = EditorGUILayout.ToggleLeft("Attach the main camera to this character", _takeOverMainCamera);
            _placeOnTerrain = EditorGUILayout.ToggleLeft("Drop onto the terrain under the scene view", _placeOnTerrain);
            _replaceExisting = EditorGUILayout.ToggleLeft("Replace any character already in the scene", _replaceExisting);
            _heightOverride = EditorGUILayout.FloatField(
                new GUIContent("Height override (m)", "Leave at 0 to measure the model. Set it if the import scale is wrong and you want the capsule correct anyway."),
                _heightOverride);

            EditorGUILayout.Space();
            using (new EditorGUI.DisabledScope(_model == null || EditorApplication.isPlaying))
            {
                GUI.backgroundColor = new Color(0.62f, 0.82f, 0.62f);
                if (GUILayout.Button("Create character", GUILayout.Height(36f)))
                {
                    KontoCharacterFactory.Build(new KontoCharacterFactory.Options
                    {
                        model = _model,
                        takeOverMainCamera = _takeOverMainCamera,
                        placeOnTerrain = _placeOnTerrain,
                        replaceExisting = _replaceExisting,
                        heightOverride = _heightOverride,
                    });
                }
                GUI.backgroundColor = Color.white;
            }

            if (_model == null)
                EditorGUILayout.HelpBox("Assign a model to continue.", MessageType.Warning);

            EditorGUILayout.Space();
            DrawInputSection();

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Controls", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "Left stick / WASD      move\n" +
                "Right stick / mouse    look\n" +
                "A / space              jump\n" +
                "L3 or LB / shift       sprint\n" +
                "B / left ctrl          crouch\n" +
                "Y / V                  first or third person\n" +
                "Start / escape         release the cursor", MessageType.None);

            EditorGUILayout.EndScrollView();
        }

        void DrawInputSection()
        {
            EditorGUILayout.LabelField("Gamepad", EditorStyles.boldLabel);

#if ENABLE_INPUT_SYSTEM
            EditorGUILayout.HelpBox(
                "This project uses the Input System package. The Xbox pad is read directly and "
                + "there is nothing to set up.", MessageType.Info);
#elif ENABLE_LEGACY_INPUT_MANAGER
            EditorGUILayout.HelpBox(
                "This project uses the legacy Input Manager. The left stick already works, but "
                + "the right stick, triggers and D-pad need axes adding. Press the button below "
                + "once; it is safe to run again.", MessageType.Warning);
            if (GUILayout.Button("Install gamepad axes", GUILayout.Height(26f)))
                KontoInputAxisInstaller.Install();
#endif
        }
    }
}
