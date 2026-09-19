using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Puts Seiko Shigu in the scene, rigged and animated, without anyone having to configure an
    /// import or wire an animator.
    ///
    /// The FBX in Assets/SalaryMan/Characters is the same rig as the browser build's glTF, built
    /// by Tools/rig_seiko.py in Blender: a 21 bone humanoid skeleton, bone heat weights, and the
    /// three clips Idle, Walk and Run. This sets the import up the way a character needs it,
    /// builds a one dimensional blend tree on the Speed parameter that KontoCharacter already
    /// drives, and hands the model to the existing character factory.
    /// </summary>
    public static class KontoSeikoSetup
    {
        public const string ModelPath = "Assets/SalaryMan/Characters/Seiko.fbx";
        const string ControllerPath = "Assets/SalaryMan/Characters/Seiko.controller";

        /// <summary>Walk and run speeds the clips were timed to, in metres per second.</summary>
        const float WalkSpeed = 1.65f;
        const float RunSpeed = 4.7f;

        public static bool ModelExists { get { return AssetDatabase.LoadAssetAtPath<GameObject>(ModelPath) != null; } }

        public static GameObject Build(bool placeOnTerrain = true)
        {
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(ModelPath);
            if (model == null)
            {
                Debug.LogWarning("[Konto] " + ModelPath + " is not in the project, so no character was placed. "
                    + "Run Tools/rig_seiko.py in Blender to make it, or drop your own model in and use "
                    + "Tools > SalaryMan > Konto Character.");
                return null;
            }

            ConfigureImport();
            var controller = BuildController();

            var rig = KontoCharacterFactory.Build(new KontoCharacterFactory.Options
            {
                model = model,
                replaceExisting = true,
                takeOverMainCamera = true,
                placeOnTerrain = placeOnTerrain,
            });
            if (rig == null) return null;

            var animator = rig.GetComponentInChildren<Animator>();
            if (animator == null)
            {
                var child = rig.transform.childCount > 0 ? rig.transform.GetChild(0).gameObject : rig;
                animator = child.AddComponent<Animator>();
            }
            if (controller != null) animator.runtimeAnimatorController = controller;
            animator.applyRootMotion = false;
            animator.cullingMode = AnimatorCullingMode.CullUpdateTransforms;

            var character = rig.GetComponent<KontoCharacter>();
            if (character != null)
            {
                character.animator = animator;
                character.walkSpeed = WalkSpeed;
                character.sprintSpeed = RunSpeed;
            }

            Debug.Log("[Konto] Seiko Shigu is in the scene, with Idle, Walk and Run on a Speed blend tree.");
            return rig;
        }

        /// <summary>
        /// Import settings a character needs and a model does not get by default: animation on,
        /// every clip looping, and the rig left generic — the skeleton is a real humanoid but
        /// mapping it to Unity's avatar adds a retarget nobody asked for.
        /// </summary>
        static void ConfigureImport()
        {
            var importer = AssetImporter.GetAtPath(ModelPath) as ModelImporter;
            if (importer == null) return;

            bool dirty = false;
            if (importer.animationType != ModelImporterAnimationType.Generic)
            {
                importer.animationType = ModelImporterAnimationType.Generic;
                dirty = true;
            }
            if (!importer.importAnimation) { importer.importAnimation = true; dirty = true; }
            if (!importer.importNormals.Equals(ModelImporterNormals.Import))
            {
                importer.importNormals = ModelImporterNormals.Import;
                dirty = true;
            }
            importer.importTangents = ModelImporterTangents.CalculateMikk;
            importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
            importer.materialLocation = ModelImporterMaterialLocation.InPrefab;

            var clips = importer.defaultClipAnimations;
            if (clips != null && clips.Length > 0)
            {
                var existing = importer.clipAnimations;
                bool needsLoop = existing == null || existing.Length != clips.Length;
                if (!needsLoop)
                {
                    for (int i = 0; i < existing.Length && !needsLoop; i++)
                        needsLoop = !existing[i].loopTime;
                }
                if (needsLoop)
                {
                    for (int i = 0; i < clips.Length; i++)
                    {
                        clips[i].loopTime = true;
                        clips[i].loopPose = true;
                    }
                    importer.clipAnimations = clips;
                    dirty = true;
                }
            }

            if (dirty) importer.SaveAndReimport();
        }

        static AnimatorController BuildController()
        {
            AnimationClip idle = null, walk = null, run = null;
            foreach (var obj in AssetDatabase.LoadAllAssetsAtPath(ModelPath))
            {
                var clip = obj as AnimationClip;
                if (clip == null || clip.name.StartsWith("__preview__")) continue;
                string n = clip.name.ToLowerInvariant();
                if (n.Contains("idle")) idle = clip;
                else if (n.Contains("walk")) walk = clip;
                else if (n.Contains("run")) run = clip;
            }

            if (idle == null && walk == null && run == null)
            {
                Debug.LogWarning("[Konto] No Idle/Walk/Run clips were found inside " + ModelPath
                    + ", so the character will stand still. Check that the FBX was exported with "
                    + "all actions baked.");
                return null;
            }

            var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(ControllerPath);
            if (controller != null) AssetDatabase.DeleteAsset(ControllerPath);
            controller = AnimatorController.CreateAnimatorControllerAtPath(ControllerPath);
            controller.AddParameter("Speed", AnimatorControllerParameterType.Float);

            BlendTree tree;
            var state = controller.CreateBlendTreeInController("Locomotion", out tree, 0);
            tree.blendType = BlendTreeType.Simple1D;
            tree.blendParameter = "Speed";
            tree.useAutomaticThresholds = false;
            if (idle != null) tree.AddChild(idle, 0f);
            if (walk != null) tree.AddChild(walk, WalkSpeed);
            if (run != null) tree.AddChild(run, RunSpeed);

            var machine = controller.layers[0].stateMachine;
            machine.defaultState = state;

            EditorUtility.SetDirty(controller);
            AssetDatabase.SaveAssets();
            return controller;
        }
    }
}
