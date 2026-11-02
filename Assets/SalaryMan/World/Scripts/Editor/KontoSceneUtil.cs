using UnityEngine;
using UnityEditor;

namespace SalaryMan.World.EditorTools
{
    /// <summary>Scene level odds and ends the build tools need.</summary>
    public static class KontoSceneUtil
    {
        /// <summary>
        /// Returns the scene's main camera, creating a usable one if there is not a camera to be
        /// found. A scene with no camera renders nothing in play mode, which is a confusing way
        /// to be told the build worked.
        /// </summary>
        public static Camera EnsureMainCamera()
        {
            Camera cam = Camera.main;

            // An untagged camera is still a camera; adopt it rather than making a second one.
            if (cam == null)
            {
                var cameras = Object.FindObjectsByType<Camera>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
                foreach (var candidate in cameras)
                {
                    if (candidate == null || candidate.targetTexture != null) continue;
                    cam = candidate;
                    break;
                }
                if (cam != null && cam.gameObject.tag != "MainCamera")
                {
                    cam.gameObject.tag = "MainCamera";
                    Debug.Log("[Konto] Tagged '" + cam.gameObject.name + "' as MainCamera so play mode has something to render through.");
                }
            }

            if (cam == null)
            {
                var go = new GameObject("Main Camera");
                go.tag = "MainCamera";
                cam = go.AddComponent<Camera>();
                go.AddComponent<AudioListener>();

                // HDRP needs its own camera data component; it is normally added for you when a
                // camera is created through the menu, but not when one is created from script.
                var hdCameraType = HdrpReflection.FindType("HDAdditionalCameraData");
                if (hdCameraType != null && go.GetComponent(hdCameraType) == null) go.AddComponent(hdCameraType);

                Debug.Log("[Konto] The scene had no camera, so one was created.");
            }

            return cam;
        }
    }
}
