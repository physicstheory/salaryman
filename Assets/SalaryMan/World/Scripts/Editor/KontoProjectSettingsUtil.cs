using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Reads and writes the bits of ProjectSettings the character setup needs. These have no
    /// scripting API of their own, so they are edited through SerializedObject on the settings
    /// assets, which is the supported way to do it from an editor tool.
    /// </summary>
    public static class KontoProjectSettingsUtil
    {
        /// <summary>
        /// Returns the index of a layer, creating it in the first free user slot if it does not
        /// exist. Returns -1 if all 24 user layers are taken.
        /// </summary>
        public static int EnsureLayer(string layerName)
        {
            if (string.IsNullOrEmpty(layerName)) return -1;

            int existing = LayerMask.NameToLayer(layerName);
            if (existing >= 0) return existing;

            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset");
            if (assets == null || assets.Length == 0)
            {
                Debug.LogWarning("[Konto] Could not open TagManager.asset, so layer '" + layerName + "' was not created.");
                return -1;
            }

            var tagManager = new SerializedObject(assets[0]);
            var layers = tagManager.FindProperty("layers");
            if (layers == null) return -1;

            // 0 to 7 are Unity's built in layers and must be left alone.
            for (int i = 8; i < layers.arraySize; i++)
            {
                var element = layers.GetArrayElementAtIndex(i);
                if (!string.IsNullOrEmpty(element.stringValue)) continue;
                element.stringValue = layerName;
                tagManager.ApplyModifiedProperties();
                AssetDatabase.SaveAssets();
                Debug.Log("[Konto] Created layer '" + layerName + "' in slot " + i + ".");
                return i;
            }

            Debug.LogWarning("[Konto] No free user layer for '" + layerName + "'. The camera will use its default collision mask.");
            return -1;
        }

        public static void SetLayerRecursively(GameObject go, int layer)
        {
            if (go == null || layer < 0) return;
            go.layer = layer;
            foreach (Transform child in go.transform) SetLayerRecursively(child.gameObject, layer);
        }
    }

    /// <summary>
    /// Adds the Xbox pad axes to the legacy Input Manager.
    ///
    /// Only needed if Active Input Handling is set to "Input Manager (Old)". The Input System
    /// package reads the pad directly and needs none of this. Unity's defaults already map the
    /// left stick to Horizontal and Vertical; what is missing is the right stick, the triggers
    /// and the D-pad.
    /// </summary>
    public static class KontoInputAxisInstaller
    {
        class AxisSpec
        {
            public string name;
            public int axis;        // zero based: 0 = X, 1 = Y, 2 = 3rd, 3 = 4th, 4 = 5th, 5 = 6th, 6 = 7th
            public bool invert;
            public float dead = 0.19f;
            public float sensitivity = 1f;
        }

        // Axis numbers are the Windows XInput layout, which is also what Unity reports for an
        // Xbox pad over Bluetooth on Windows. macOS and Linux differ; see the character doc.
        static readonly AxisSpec[] Axes =
        {
            new AxisSpec { name = "Konto Look X",   axis = 3, invert = false },  // right stick X
            new AxisSpec { name = "Konto Look Y",   axis = 4, invert = true  },  // right stick Y, up is negative
            new AxisSpec { name = "Konto Triggers", axis = 2, invert = false, dead = 0.12f },
            new AxisSpec { name = "Konto DPad X",   axis = 5, invert = false, dead = 0.3f },
            new AxisSpec { name = "Konto DPad Y",   axis = 6, invert = false, dead = 0.3f },
        };

        public static void Install()
        {
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/InputManager.asset");
            if (assets == null || assets.Length == 0)
            {
                Debug.LogError("[Konto] Could not open ProjectSettings/InputManager.asset.");
                return;
            }

            var inputManager = new SerializedObject(assets[0]);
            var axisArray = inputManager.FindProperty("m_Axes");
            if (axisArray == null)
            {
                Debug.LogError("[Konto] InputManager.asset has no m_Axes property.");
                return;
            }

            int added = 0, updated = 0;
            foreach (var spec in Axes)
            {
                SerializedProperty entry = FindAxis(axisArray, spec.name);
                if (entry == null)
                {
                    axisArray.arraySize++;
                    entry = axisArray.GetArrayElementAtIndex(axisArray.arraySize - 1);
                    added++;
                }
                else updated++;

                Write(entry, spec);
            }

            inputManager.ApplyModifiedProperties();
            AssetDatabase.SaveAssets();
            Debug.Log("[Konto] Gamepad axes installed in the legacy Input Manager: " + added + " added, " + updated + " updated. "
                + "If you are on the Input System package instead, none of this is used and nothing is harmed.");
        }

        static SerializedProperty FindAxis(SerializedProperty axisArray, string name)
        {
            for (int i = 0; i < axisArray.arraySize; i++)
            {
                var element = axisArray.GetArrayElementAtIndex(i);
                var nameProp = element.FindPropertyRelative("m_Name");
                if (nameProp != null && nameProp.stringValue == name) return element;
            }
            return null;
        }

        static void Write(SerializedProperty entry, AxisSpec spec)
        {
            Set(entry, "m_Name", spec.name);
            Set(entry, "descriptiveName", "");
            Set(entry, "descriptiveNegativeName", "");
            Set(entry, "negativeButton", "");
            Set(entry, "positiveButton", "");
            Set(entry, "altNegativeButton", "");
            Set(entry, "altPositiveButton", "");
            SetFloat(entry, "gravity", 0f);
            SetFloat(entry, "dead", spec.dead);
            SetFloat(entry, "sensitivity", spec.sensitivity);
            SetBool(entry, "snap", false);
            SetBool(entry, "invert", spec.invert);
            SetInt(entry, "type", 2);        // joystick axis
            SetInt(entry, "axis", spec.axis);
            SetInt(entry, "joyNum", 0);      // any connected pad
        }

        static void Set(SerializedProperty entry, string name, string value)
        {
            var p = entry.FindPropertyRelative(name);
            if (p != null) p.stringValue = value;
        }

        static void SetFloat(SerializedProperty entry, string name, float value)
        {
            var p = entry.FindPropertyRelative(name);
            if (p != null) p.floatValue = value;
        }

        static void SetBool(SerializedProperty entry, string name, bool value)
        {
            var p = entry.FindPropertyRelative(name);
            if (p != null) p.boolValue = value;
        }

        static void SetInt(SerializedProperty entry, string name, int value)
        {
            var p = entry.FindPropertyRelative(name);
            if (p != null) p.intValue = value;
        }
    }
}
