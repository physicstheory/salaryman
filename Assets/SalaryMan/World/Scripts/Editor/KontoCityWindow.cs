using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// The window for working with a built city: find a ward, find a reserved site, look up a
    /// plot by its code, and drop a building onto it. This is the tool that gets used once the
    /// art starts arriving.
    /// </summary>
    public class KontoCityWindow : EditorWindow
    {
        KontoCityLayoutAsset _city;
        Vector2 _scroll;
        string _plotCode = "";
        GameObject _prefab;
        PlotKind _kindFilter = PlotKind.Landmark;
        bool _showWards = true;
        bool _showReservations = true;

        [MenuItem("Tools/SalaryMan/Konto City", false, 1)]
        public static void Open()
        {
            var window = GetWindow<KontoCityWindow>(false, "Konto City", true);
            window.minSize = new Vector2(400f, 560f);
            window.Show();
        }

        void OnEnable()
        {
            if (_city == null) _city = FindFirstLayout();
        }

        static KontoCityLayoutAsset FindFirstLayout()
        {
            var guids = AssetDatabase.FindAssets("t:KontoCityLayoutAsset");
            if (guids == null || guids.Length == 0) return null;
            return AssetDatabase.LoadAssetAtPath<KontoCityLayoutAsset>(AssetDatabase.GUIDToAssetPath(guids[0]));
        }

        void OnGUI()
        {
            _scroll = EditorGUILayout.BeginScrollView(_scroll);

            EditorGUILayout.LabelField("City", EditorStyles.boldLabel);
            _city = (KontoCityLayoutAsset)EditorGUILayout.ObjectField("Layout asset", _city, typeof(KontoCityLayoutAsset), false);

            if (_city == null || _city.layout == null || _city.layout.plots.Count == 0)
            {
                EditorGUILayout.HelpBox("No city layout yet. Build the world with the City step enabled: "
                    + "Tools > SalaryMan > Konto World Builder.", MessageType.Info);
                EditorGUILayout.EndScrollView();
                return;
            }

            var layout = _city.layout;
            EditorGUILayout.HelpBox(layout.Summary(), MessageType.None);

            EditorGUI.indentLevel++;
            EditorGUILayout.LabelField("Centre", string.Format("{0:0}, {1:0}", layout.coreCenter.x, layout.coreCenter.y));
            EditorGUILayout.LabelField("Extent", string.Format("{0:0} x {1:0} m", layout.bounds.width, layout.bounds.height));
            EditorGUI.indentLevel--;

            // ---- plot lookup
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Find a plot", EditorStyles.boldLabel);
            _plotCode = EditorGUILayout.TextField("Plot code", _plotCode);
            using (new EditorGUI.DisabledScope(string.IsNullOrEmpty(_plotCode)))
            {
                EditorGUILayout.BeginHorizontal();
                if (GUILayout.Button("Look at it"))
                {
                    CityPlot plot;
                    if (_city.TryGetPlot(_plotCode, out plot)) Focus(plot.WorldPosition, Mathf.Max(60f, plot.size.magnitude * 2.5f));
                    else Debug.LogWarning("[Konto] No plot with the code " + _plotCode + ".");
                }
                if (GUILayout.Button("Create a marker"))
                {
                    CityPlot plot;
                    if (_city.TryGetPlot(_plotCode, out plot))
                    {
                        var go = KontoCityFactory.CreateMarker(layout, plot, CityRootTransform(layout), "", "");
                        Selection.activeGameObject = go;
                    }
                }
                EditorGUILayout.EndHorizontal();
            }

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Drop a building on a plot", EditorStyles.boldLabel);
            _prefab = (GameObject)EditorGUILayout.ObjectField("Prefab", _prefab, typeof(GameObject), false);
            using (new EditorGUI.DisabledScope(_prefab == null || string.IsNullOrEmpty(_plotCode)))
            {
                if (GUILayout.Button("Place it", GUILayout.Height(26f)))
                {
                    CityPlot plot;
                    if (!_city.TryGetPlot(_plotCode, out plot))
                    {
                        Debug.LogWarning("[Konto] No plot with the code " + _plotCode + ".");
                    }
                    else
                    {
                        var instance = (GameObject)PrefabUtility.InstantiatePrefab(_prefab);
                        instance.transform.position = plot.WorldPosition;
                        instance.transform.rotation = plot.WorldRotation;
                        instance.transform.SetParent(CityRootTransform(layout), true);
                        Undo.RegisterCreatedObjectUndo(instance, "Place building on " + layout.PlotCode(plot));
                        Selection.activeGameObject = instance;
                        Focus(plot.WorldPosition, Mathf.Max(60f, plot.maxHeight * 2f));
                    }
                }
            }
            EditorGUILayout.LabelField("Plots are flat, at a known height, and face their street, so a prefab",
                EditorStyles.miniLabel);
            EditorGUILayout.LabelField("placed at the plot's position and rotation needs no fitting.",
                EditorStyles.miniLabel);

            // ---- biggest plots of a kind
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Biggest plots of a kind", EditorStyles.boldLabel);
            _kindFilter = (PlotKind)EditorGUILayout.EnumPopup("Kind", _kindFilter);
            var largest = _city.LargestPlots(_kindFilter, 8);
            EditorGUI.indentLevel++;
            for (int i = 0; i < largest.Count; i++)
            {
                var plot = largest[i];
                EditorGUILayout.BeginHorizontal();
                EditorGUILayout.LabelField(string.Format("{0}  {1:0} x {2:0} m, {3} floors",
                    layout.PlotCode(plot), plot.size.x, plot.size.y, plot.maxFloors));
                if (GUILayout.Button("Use", GUILayout.Width(44f))) _plotCode = layout.PlotCode(plot);
                if (GUILayout.Button("Look", GUILayout.Width(48f))) Focus(plot.WorldPosition, Mathf.Max(80f, plot.maxHeight * 2f));
                EditorGUILayout.EndHorizontal();
            }
            EditorGUI.indentLevel--;

            // ---- reservations
            EditorGUILayout.Space();
            _showReservations = EditorGUILayout.Foldout(_showReservations, "Reserved sites (" + layout.reservations.Count + ")", true);
            if (_showReservations)
            {
                EditorGUI.indentLevel++;
                for (int i = 0; i < layout.reservations.Count; i++)
                {
                    var r = layout.reservations[i];
                    EditorGUILayout.BeginHorizontal();
                    EditorGUILayout.LabelField(r.name);
                    if (GUILayout.Button("Use", GUILayout.Width(44f)))
                    {
                        CityPlot plot;
                        if (layout.TryGetPlot(r.plotId, out plot)) _plotCode = layout.PlotCode(plot);
                    }
                    if (GUILayout.Button("Look", GUILayout.Width(48f)))
                        Focus(new Vector3(r.center.x, 0f, r.center.y), Mathf.Max(120f, r.radius * 6f));
                    EditorGUILayout.EndHorizontal();
                    if (!string.IsNullOrEmpty(r.note)) EditorGUILayout.LabelField(r.note, EditorStyles.wordWrappedMiniLabel);
                }
                EditorGUI.indentLevel--;
            }

            // ---- wards
            EditorGUILayout.Space();
            _showWards = EditorGUILayout.Foldout(_showWards, "Wards (" + layout.wards.Count + ")", true);
            if (_showWards)
            {
                EditorGUI.indentLevel++;
                for (int i = 0; i < layout.wards.Count; i++)
                {
                    var ward = layout.wards[i];
                    EditorGUILayout.BeginHorizontal();
                    EditorGUILayout.LabelField(string.Format("{0} [{1}]  {2}  {3} plots", ward.name, ward.code, ward.kind, ward.plotCount));
                    if (GUILayout.Button("Look", GUILayout.Width(48f)))
                        Focus(new Vector3(ward.center.x, ward.groundY, ward.center.y), Mathf.Max(220f, ward.radius * 3f));
                    if (GUILayout.Button("Markers", GUILayout.Width(66f)))
                    {
                        int made = KontoCityFactory.CreateWardMarkers(_city, i, CityRootTransform(layout));
                        Debug.Log("[Konto] Created " + made + " plot markers for " + ward.name + ".");
                    }
                    EditorGUILayout.EndHorizontal();
                }
                EditorGUI.indentLevel--;
            }

            // ---- housekeeping
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Housekeeping", EditorStyles.boldLabel);
            if (GUILayout.Button("Delete the grey massing blockout"))
            {
                int removed = DeleteBlockout();
                Debug.Log("[Konto] Removed " + removed + " blockout groups.");
            }
            if (GUILayout.Button("Select the layout asset")) Selection.activeObject = _city;

            EditorGUILayout.EndScrollView();
        }

        static Transform CityRootTransform(CityLayout layout)
        {
            var root = GameObject.Find(KontoCityFactory.RootName);
            if (root == null) root = new GameObject(KontoCityFactory.RootName);
            Transform city = null;
            for (int i = 0; i < root.transform.childCount; i++)
            {
                if (root.transform.GetChild(i).name != layout.name) continue;
                city = root.transform.GetChild(i);
                break;
            }
            if (city == null)
            {
                var go = new GameObject(layout.name);
                go.transform.SetParent(root.transform, true);
                city = go.transform;
            }
            return city;
        }

        static int DeleteBlockout()
        {
            var root = GameObject.Find(KontoCityFactory.RootName);
            if (root == null) return 0;
            var doomed = new List<GameObject>();
            var transforms = root.GetComponentsInChildren<Transform>();
            for (int i = 0; i < transforms.Length; i++)
            {
                if (transforms[i] == null || transforms[i].name != KontoCityFactory.BlockoutName) continue;
                doomed.Add(transforms[i].gameObject);
            }
            for (int i = 0; i < doomed.Count; i++) Object.DestroyImmediate(doomed[i]);
            return doomed.Count;
        }

        static void Focus(Vector3 point, float size)
        {
            if (SceneView.lastActiveSceneView == null) return;
            SceneView.lastActiveSceneView.LookAt(point, Quaternion.Euler(35f, 135f, 0f), size);
        }
    }
}
