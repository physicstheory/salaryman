using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Assembles a playable character from a model: collider sized to the model, movement,
    /// a third person camera rig, sensible layers, and a drop onto the terrain.
    ///
    /// The model can be an imported FBX or .blend prefab, or anything already in the scene.
    /// Nothing about the model is modified; it becomes a child of the rig.
    /// </summary>
    public static class KontoCharacterFactory
    {
        public const string PlayerLayerName = "Player";
        public const string RootName = "Salaryman Player";

        public class Options
        {
            public GameObject model;
            public bool replaceExisting = true;
            public bool takeOverMainCamera = true;
            /// <summary>Drop the rig onto the terrain under the scene view camera.</summary>
            public bool placeOnTerrain = true;
            /// <summary>Overrides the height measured from the model. Zero means measure it.</summary>
            public float heightOverride = 0f;
        }

        public static GameObject Build(Options options)
        {
            if (options == null || options.model == null)
            {
                Debug.LogError("[Konto] No model given, so no character was built.");
                return null;
            }

            if (options.replaceExisting)
            {
                var existing = GameObject.Find(RootName);
                if (existing != null) Undo.DestroyObjectImmediate(existing);
            }

            var root = new GameObject(RootName);
            Undo.RegisterCreatedObjectUndo(root, "Create Konto character");

            // --- the model ------------------------------------------------------------------
            GameObject model = InstantiateModel(options.model);
            model.transform.SetParent(root.transform, false);
            model.transform.localPosition = Vector3.zero;
            model.transform.localRotation = Quaternion.identity;

            float height, radius;
            MeasureModel(model, out height, out radius);
            if (options.heightOverride > 0.1f) height = options.heightOverride;

            WarnAboutScale(model, height);

            // --- collider and movement ------------------------------------------------------
            var controller = root.AddComponent<CharacterController>();
            controller.height = height;
            controller.radius = Mathf.Clamp(radius, 0.18f, Mathf.Max(0.2f, height * 0.22f));
            controller.center = new Vector3(0f, height * 0.5f, 0f);
            controller.slopeLimit = 52f;      // Konto is steep; the default 45 gets you stuck
            controller.stepOffset = Mathf.Min(0.45f, height * 0.26f);
            controller.skinWidth = Mathf.Max(0.015f, controller.radius * 0.08f);
            controller.minMoveDistance = 0f;

            var character = root.AddComponent<KontoCharacter>();
            character.model = model.transform;
            character.animator = model.GetComponentInChildren<Animator>();

            // --- layers ---------------------------------------------------------------------
            int playerLayer = KontoProjectSettingsUtil.EnsureLayer(PlayerLayerName);
            LayerMask worldMask = ~0;
            if (playerLayer >= 0)
            {
                KontoProjectSettingsUtil.SetLayerRecursively(root, playerLayer);
                // The camera and the ground check must both ignore the player's own collider,
                // or the camera jams against the character and the ground check never clears.
                worldMask = ~(1 << playerLayer);
            }
            character.groundLayers = worldMask;

            // --- camera pivot ---------------------------------------------------------------
            var pivot = new GameObject("Camera Pivot");
            pivot.transform.SetParent(root.transform, false);
            pivot.transform.localPosition = Vector3.zero;

            // --- camera ---------------------------------------------------------------------
            Camera cam = options.takeOverMainCamera ? KontoSceneUtil.EnsureMainCamera() : null;
            if (cam != null)
            {
                // The fly camera and the orbit camera cannot both drive the same transform.
                var flyCam = cam.GetComponent<KontoFreeCamera>();
                if (flyCam != null) Object.DestroyImmediate(flyCam);
                cam.transform.SetParent(null);

                var orbit = cam.GetComponent<KontoThirdPersonCamera>();
                if (orbit == null) orbit = cam.gameObject.AddComponent<KontoThirdPersonCamera>();

                orbit.target = pivot.transform;
                orbit.pivotOffset = new Vector3(height * 0.2f, height * 0.9f, 0f);
                orbit.firstPersonOffset = new Vector3(0f, height * 0.94f, height * 0.08f);
                orbit.distance = Mathf.Max(2.6f, height * 2.4f);
                orbit.minDistance = Mathf.Max(0.8f, height * 0.7f);
                orbit.maxDistance = Mathf.Max(5f, height * 4.5f);
                orbit.collisionLayers = worldMask;
                orbit.baseFov = cam.fieldOfView;

                cam.nearClipPlane = 0.12f;
                cam.farClipPlane = Mathf.Max(cam.farClipPlane, 10000f);

                character.cameraTransform = cam.transform;
                EditorUtility.SetDirty(cam.gameObject);
            }

            // --- put it somewhere sensible --------------------------------------------------
            if (options.placeOnTerrain) PlaceOnGround(root, height);

            Selection.activeGameObject = root;
            EditorUtility.SetDirty(root);

            Debug.Log(string.Format(
                "[Konto] Character built from '{0}'. Height {1:0.00} m, capsule radius {2:0.00} m, animator {3}.",
                options.model.name, height, controller.radius,
                character.animator != null ? "found" : "NOT found (movement works, animation will not)"));

            return root;
        }

        static GameObject InstantiateModel(GameObject source)
        {
            bool isAsset = PrefabUtility.IsPartOfPrefabAsset(source) || AssetDatabase.Contains(source);
            GameObject model = isAsset
                ? (GameObject)PrefabUtility.InstantiatePrefab(source)
                : Object.Instantiate(source);
            model.name = source.name;
            return model;
        }

        /// <summary>Measures the model from its renderers, which is more reliable than trusting any rig.</summary>
        static void MeasureModel(GameObject model, out float height, out float radius)
        {
            var renderers = model.GetComponentsInChildren<Renderer>();
            if (renderers.Length == 0)
            {
                height = 1.75f;
                radius = 0.3f;
                return;
            }

            Bounds bounds = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);

            height = Mathf.Max(0.2f, bounds.size.y);
            // Take the slimmer horizontal axis: arms in a T-pose make the other one useless.
            radius = Mathf.Max(0.15f, Mathf.Min(bounds.size.x, bounds.size.z) * 0.5f);
        }

        /// <summary>
        /// Blender exports are the usual source of scale trouble: a metre in Blender is not
        /// always a metre in Unity, and a character at 100x or 0.01x will fall through the
        /// world or stand on it like a giant.
        /// </summary>
        static void WarnAboutScale(GameObject model, float height)
        {
            if (height >= 0.9f && height <= 2.6f) return;

            string advice = height > 2.6f
                ? "The model is far too big. In Blender, apply scale (Ctrl+A > Scale) before exporting, and set the FBX export scale to 1.0 with 'Apply Unit' ticked."
                : "The model is far too small. Blender's FBX exporter often writes centimetre units; try Scale 1.0 with 'Apply Scalings: FBX All', or set Scale Factor to 100 on the model's import settings in Unity.";

            Debug.LogWarning(string.Format(
                "[Konto] '{0}' measures {1:0.00} m tall, which is not a person-sized character. {2}\n"
                + "The capsule has been sized to match the model regardless, so movement will still work, but it will not feel right against the terrain.",
                model.name, height, advice));
        }

        static void PlaceOnGround(GameObject root, float height)
        {
            Vector3 origin = Vector3.zero;
            bool haveOrigin = false;

            if (SceneView.lastActiveSceneView != null && SceneView.lastActiveSceneView.camera != null)
            {
                origin = SceneView.lastActiveSceneView.camera.transform.position;
                haveOrigin = true;
            }

            if (!haveOrigin)
            {
                var anyTerrain = Terrain.activeTerrain;
                if (anyTerrain != null)
                {
                    Vector3 size = anyTerrain.terrainData.size;
                    origin = anyTerrain.transform.position + new Vector3(size.x * 0.5f, 0f, size.z * 0.5f);
                }
            }

            RaycastHit hit;
            if (Physics.Raycast(new Vector3(origin.x, 6000f, origin.z), Vector3.down, out hit, 12000f, ~0, QueryTriggerInteraction.Ignore))
            {
                root.transform.position = hit.point + Vector3.up * 0.15f;
                return;
            }

            // No collider under the scene view, so fall back to sampling the terrain directly.
            var terrain = Terrain.activeTerrain;
            if (terrain != null)
            {
                float y = terrain.SampleHeight(origin) + terrain.transform.position.y;
                root.transform.position = new Vector3(origin.x, y + 0.15f, origin.z);
                return;
            }

            root.transform.position = origin;
            Debug.LogWarning("[Konto] Found no ground under the scene view camera, so the character was placed at the camera position. Move it onto the terrain yourself.");
        }
    }
}
