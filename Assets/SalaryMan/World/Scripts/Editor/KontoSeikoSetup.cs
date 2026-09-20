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
        const string MaterialPath = "Assets/SalaryMan/Characters/Seiko.mat";
        const string BaseColorPath = "Assets/SalaryMan/Characters/Seiko_BaseColor.png";
        const string NormalPath = "Assets/SalaryMan/Characters/Seiko_Normal.png";
        const string MaskPath = "Assets/SalaryMan/Characters/Seiko_Mask.png";

        /// <summary>
        /// Degrees to turn the model under the pivot the character controller drives.
        ///
        /// This should stay zero. The export used to guess at the axis conversion and guessed
        /// wrong — he came out facing -Z and walked backwards — so `Tools/rig_seiko.py` now
        /// measures which way he faces in the finished FBX (it reads the file back and works out
        /// the transform that was actually applied), tries the other orientation if that is not
        /// +Z, and refuses to write the file at all if neither works. The field stays as an
        /// escape hatch for a model that did not come through that script.
        /// </summary>
        public static float ModelYaw = 0f;

        /// <summary>Walk and run speeds the clips were timed to, in metres per second.</summary>
        const float WalkSpeed = 1.65f;
        const float RunSpeed = 4.7f;

        public static bool ModelExists { get { return AssetDatabase.LoadAssetAtPath<GameObject>(ModelPath) != null; } }

        public static GameObject Build(bool placeOnTerrain = true)
        {
            if (AssetDatabase.LoadAssetAtPath<GameObject>(ModelPath) == null)
            {
                Debug.LogWarning("[Konto] " + ModelPath + " is not in the project, so no character was placed. "
                    + "Run Tools/rig_seiko.py in Blender to make it, or drop your own model in and use "
                    + "Tools > SalaryMan > Konto Character.");
                return null;
            }

            // Settings first, then load. The first run always reimports — that is the run where
            // the loop flags get set — and a reimport destroys any reference taken before it, so
            // a model loaded up front would come back destroyed and the character would silently
            // not be built until the second press.
            ConfigureImport();
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(ModelPath);
            if (model == null)
            {
                Debug.LogWarning("[Konto] " + ModelPath + " did not survive its reimport. Reimport it by "
                    + "hand (right click > Reimport) and run Tools > SalaryMan > Put Seiko In The Scene.");
                return null;
            }

            var controller = BuildController();

            BuildMaterial();

            var rig = KontoCharacterFactory.Build(new KontoCharacterFactory.Options
            {
                model = model,
                replaceExisting = true,
                takeOverMainCamera = true,
                placeOnTerrain = placeOnTerrain,
            });
            if (rig == null) return null;

            // The character controller turns whatever it is given to face the way he is going,
            // and it assumes that thing faces +Z. Rather than trust the FBX to have come in that
            // way, put a pivot in between: the controller turns the pivot, and ModelYaw holds
            // whatever correction the import needs. One field, instead of a re-export.
            Transform imported = rig.transform.childCount > 0 ? rig.transform.GetChild(0) : null;
            if (imported != null)
            {
                var pivot = new GameObject("Model").transform;
                pivot.SetParent(rig.transform, false);
                imported.SetParent(pivot, false);
                imported.localRotation = Quaternion.Euler(0f, ModelYaw, 0f);
                imported.localPosition = Vector3.zero;

                var driven = rig.GetComponent<KontoCharacter>();
                if (driven != null) driven.model = pivot;
            }

            var animator = WireAnimator(rig, imported, controller);

            var character = rig.GetComponent<KontoCharacter>();
            if (character != null)
            {
                character.animator = animator;
                character.walkSpeed = WalkSpeed;
                character.sprintSpeed = RunSpeed;
            }

            Report(rig);
            return rig;
        }

        /// <summary>
        /// Puts exactly one Animator on the character, on the imported model's own root, with
        /// the model's Avatar and the locomotion controller.
        ///
        /// All three of those have been the reason he stood still at some point. An Animator on
        /// the capsule instead of the model looks for animation paths that start one level too
        /// high; a second Animator further down takes the hierarchy away from the first; and a
        /// generic rig with no Avatar plays nothing at all and says nothing about it.
        /// </summary>
        static Animator WireAnimator(GameObject rig, Transform imported, AnimatorController controller)
        {
            var host = imported != null ? imported.gameObject : rig;

            // Anything else claiming to be an animator on this character is in the way.
            foreach (var stray in rig.GetComponentsInChildren<Animator>(true))
                if (stray != null && stray.gameObject != host) Object.DestroyImmediate(stray);

            var animator = host.GetComponent<Animator>();
            if (animator == null) animator = host.AddComponent<Animator>();

            if (animator.avatar == null) animator.avatar = LoadAvatar();
            if (controller != null) animator.runtimeAnimatorController = controller;
            animator.applyRootMotion = false;
            // Not CullUpdateTransforms: that stops the bones being written whenever Unity thinks
            // the renderer is off screen, and a generic rig's bounds are not always to be
            // trusted. He is the one character always on screen; animate him always.
            animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
            return animator;
        }

        /// <summary>The Avatar the model importer built, which lives inside the FBX.</summary>
        static Avatar LoadAvatar()
        {
            foreach (var obj in AssetDatabase.LoadAllAssetsAtPath(ModelPath))
            {
                var avatar = obj as Avatar;
                if (avatar != null) return avatar;
            }
            return null;
        }

        /// <summary>
        /// Says out loud what he ended up with. Every part of this has failed silently at least
        /// once, so the console gets the clip names, the avatar, where the animator is and what
        /// the blend tree is blending, rather than a cheerful line claiming it all worked.
        /// </summary>
        public static void Report(GameObject rig)
        {
            if (rig == null) rig = GameObject.Find(KontoCharacterFactory.RootName);
            if (rig == null)
            {
                Debug.LogWarning("[Konto] Seiko is not in the scene. Tools > SalaryMan > Put Seiko In The Scene.");
                return;
            }

            var clips = new List<string>();
            Avatar avatar = null;
            foreach (var obj in AssetDatabase.LoadAllAssetsAtPath(ModelPath))
            {
                var clip = obj as AnimationClip;
                if (clip != null && !clip.name.StartsWith("__preview__")) clips.Add(clip.name);
                var av = obj as Avatar;
                if (av != null) avatar = av;
            }

            var animator = rig.GetComponentInChildren<Animator>(true);
            var character = rig.GetComponent<KontoCharacter>();
            var skin = rig.GetComponentInChildren<SkinnedMeshRenderer>(true);

            var sb = new System.Text.StringBuilder();
            sb.AppendLine("[Konto] Seiko's rig:");
            sb.AppendLine("  clips in the FBX: " + (clips.Count == 0 ? "NONE - he cannot animate" : string.Join(", ", clips.ToArray())));
            sb.AppendLine("  avatar: " + (avatar != null ? avatar.name + (avatar.isValid ? " (valid)" : " (INVALID)") : "NONE - a generic rig without one plays nothing"));

            if (animator == null) sb.AppendLine("  animator: NONE");
            else
            {
                sb.AppendLine("  animator: on '" + animator.name + "'"
                    + ", avatar " + (animator.avatar != null ? animator.avatar.name : "NONE")
                    + ", controller " + (animator.runtimeAnimatorController != null ? animator.runtimeAnimatorController.name : "NONE")
                    + ", culling " + animator.cullingMode);

                var built = animator.runtimeAnimatorController as AnimatorController;
                if (built != null && built.layers.Length > 0)
                {
                    foreach (var state in built.layers[0].stateMachine.states)
                    {
                        var tree = state.state.motion as BlendTree;
                        if (tree == null) continue;
                        var parts = new List<string>();
                        foreach (var child in tree.children)
                            parts.Add((child.motion != null ? child.motion.name : "MISSING") + " at " + child.threshold);
                        sb.AppendLine("  blend tree '" + tree.blendParameter + "': " + string.Join(", ", parts.ToArray()));
                    }
                }
            }

            sb.AppendLine("  character: " + (character == null ? "NO KontoCharacter"
                : "animator " + (character.animator != null ? "wired" : "NOT WIRED")
                  + ", model pivot " + (character.model != null ? character.model.name : "NONE")
                  + ", walk " + character.walkSpeed + " jog " + character.jogSpeed + " sprint " + character.sprintSpeed));
            sb.AppendLine("  skinned mesh: " + (skin == null ? "NONE" : skin.name + ", " + skin.bones.Length + " bones, root "
                + (skin.rootBone != null ? skin.rootBone.name : "NONE")));
            sb.Append("  If he still slides without moving, run this again and check every line above says something.");

            Debug.Log(sb.ToString());
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
            // A generic rig animates through an Avatar, and a model that was ever imported with
            // no animation type has none. Without it the Animator holds a controller, reports no
            // errors, and plays nothing - which looks exactly like a character who slides along
            // the ground in his rest pose.
            if (importer.avatarSetup != ModelImporterAvatarSetup.CreateFromThisModel)
            {
                importer.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
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

        /// <summary>
        /// Builds his material from the maps the rig script exported beside the FBX, and remaps
        /// the model's material slot onto it.
        ///
        /// Going through the FBX's own embedded textures was the obvious route and it is the one
        /// that leaves him grey: what HDRP does with a material imported from an FBX depends on
        /// the Unity version and the pipeline that was active at import time. Maps on disk and a
        /// material we make ourselves is boring and works.
        /// </summary>
        static void BuildMaterial()
        {
            var baseColor = AssetDatabase.LoadAssetAtPath<Texture2D>(BaseColorPath);
            if (baseColor == null)
            {
                Debug.LogWarning("[Konto] " + BaseColorPath + " is missing, so Seiko keeps whatever "
                    + "material the FBX imported with. Re-run Tools/rig_seiko.py to write the maps.");
                return;
            }

            ConfigureMap(BaseColorPath, false, false);
            ConfigureMap(NormalPath, true, false);
            ConfigureMap(MaskPath, false, true);

            var mat = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
            if (mat == null)
            {
                Shader shader = Shader.Find("HDRP/Lit");
                if (shader == null) shader = Shader.Find("Standard");
                if (shader == null) return;
                mat = new Material(shader) { name = "Seiko" };
                AssetDatabase.CreateAsset(mat, MaterialPath);
            }

            var normal = AssetDatabase.LoadAssetAtPath<Texture2D>(NormalPath);
            var mask = AssetDatabase.LoadAssetAtPath<Texture2D>(MaskPath);
            if (mat.HasProperty("_BaseColorMap")) mat.SetTexture("_BaseColorMap", baseColor);
            if (mat.HasProperty("_MainTex")) mat.SetTexture("_MainTex", baseColor);
            if (normal != null)
            {
                if (mat.HasProperty("_NormalMap")) mat.SetTexture("_NormalMap", normal);
                if (mat.HasProperty("_BumpMap")) mat.SetTexture("_BumpMap", normal);
            }
            // Meshy writes an ORM style map: the green channel is roughness. HDRP's mask map
            // wants smoothness in alpha, so rather than lie about the channels the cloth gets a
            // flat, slightly rough response, which is what a suit looks like anyway.
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", Color.white);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", Color.white);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 0.22f);
            if (mat.HasProperty("_Glossiness")) mat.SetFloat("_Glossiness", 0.22f);
            if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", 0f);
            KontoMaterialUtil.ValidateHdrpMaterial(mat);
            EditorUtility.SetDirty(mat);

            // Point the model's material slot at it, whatever the FBX called its own.
            var importer = AssetImporter.GetAtPath(ModelPath) as ModelImporter;
            if (importer == null) return;
            var names = new System.Collections.Generic.List<string>();
            foreach (var obj in AssetDatabase.LoadAllAssetsAtPath(ModelPath))
            {
                var m = obj as Material;
                if (m != null) names.Add(m.name);
            }
            if (names.Count == 0) names.Add("Material_0");
            foreach (var n in names)
                importer.AddRemap(new AssetImporter.SourceAssetIdentifier(typeof(Material), n), mat);
            importer.SaveAndReimport();
        }

        static void ConfigureMap(string path, bool isNormal, bool isLinear)
        {
            var importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null) return;
            var wantType = isNormal ? TextureImporterType.NormalMap : TextureImporterType.Default;
            bool wantSrgb = !isNormal && !isLinear;
            if (importer.textureType == wantType && importer.sRGBTexture == wantSrgb) return;
            importer.textureType = wantType;
            importer.sRGBTexture = wantSrgb;
            importer.SaveAndReimport();
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
