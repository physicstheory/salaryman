using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Switches on the HDRP asset features Konto needs. Several of these (water, volumetric
    /// clouds, screen space GI) are off by default in the HDRP template, and a volume override
    /// asking for a feature the pipeline asset has disabled simply does nothing, which is a
    /// confusing way to lose an afternoon.
    /// </summary>
    public static class KontoHdrpAssetConfigurator
    {
        public static bool Configure(bool enableExpensiveFeatures = true)
        {
            var asset = GraphicsSettings.defaultRenderPipeline ?? QualitySettings.renderPipeline;
            if (asset == null)
            {
                Debug.LogWarning("[Konto] No render pipeline asset assigned. Set an HDRP Asset in Project Settings > Graphics before running this.");
                return false;
            }
            if (asset.GetType().Name != "HDRenderPipelineAsset")
            {
                Debug.LogWarning("[Konto] The active render pipeline is '" + asset.GetType().Name + "', not HDRP. Skipping pipeline configuration.");
                return false;
            }

            var so = new SerializedObject(asset);
            var applied = new List<string>();
            var missing = new List<string>();

            Set(so, "m_RenderPipelineSettings.supportWater", true, applied, missing);
            Set(so, "m_RenderPipelineSettings.supportWaterExclusion", true, applied, missing);
            Set(so, "m_RenderPipelineSettings.supportVolumetricClouds", true, applied, missing);
            Set(so, "m_RenderPipelineSettings.supportVolumetrics", true, applied, missing);
            Set(so, "m_RenderPipelineSettings.supportVolumetricFog", true, applied, missing);
            Set(so, "m_RenderPipelineSettings.supportTerrainHole", true, applied, missing);
            Set(so, "m_RenderPipelineSettings.supportMotionVectors", true, applied, missing);
            Set(so, "m_RenderPipelineSettings.supportDistortion", true, applied, missing);
            Set(so, "m_RenderPipelineSettings.supportTransparentBackface", true, applied, missing);

            if (enableExpensiveFeatures)
            {
                Set(so, "m_RenderPipelineSettings.supportSSR", true, applied, missing);
                Set(so, "m_RenderPipelineSettings.supportSSRTransparent", true, applied, missing);
                Set(so, "m_RenderPipelineSettings.supportSSGI", true, applied, missing);
                Set(so, "m_RenderPipelineSettings.supportSSAO", true, applied, missing);
                Set(so, "m_RenderPipelineSettings.supportScreenSpaceLensFlare", true, applied, missing);
            }

            // A world of terrain, trees and volumetrics asks for more shadow slots than the
            // template allocates, and running out shows up as shadows flickering off.
            SetInt(so, "m_RenderPipelineSettings.hdShadowInitParams.maxShadowRequests", 256, applied, missing);

            so.ApplyModifiedProperties();
            EditorUtility.SetDirty(asset);
            AssetDatabase.SaveAssets();

            Debug.Log("[Konto] HDRP asset configured. Enabled: " + string.Join(", ", applied.ToArray())
                + (missing.Count > 0 ? "\nNot present on this HDRP version (safe to ignore): " + string.Join(", ", missing.ToArray()) : ""));

            // LOD bias matters a lot for a terrain world: the default 1.0 swaps tree LODs
            // aggressively close to the camera and makes forests visibly churn as you walk.
            QualitySettings.lodBias = Mathf.Max(QualitySettings.lodBias, 1.6f);
            QualitySettings.maximumLODLevel = 0;
            QualitySettings.skinWeights = SkinWeights.FourBones;
            QualitySettings.softParticles = true;

            return true;
        }

        static void Set(SerializedObject so, string path, bool value, List<string> applied, List<string> missing)
        {
            var prop = so.FindProperty(path);
            string leaf = path.Substring(path.LastIndexOf('.') + 1);
            if (prop == null) { missing.Add(leaf); return; }
            prop.boolValue = value;
            applied.Add(leaf);
        }

        static void SetInt(SerializedObject so, string path, int value, List<string> applied, List<string> missing)
        {
            var prop = so.FindProperty(path);
            string leaf = path.Substring(path.LastIndexOf('.') + 1);
            if (prop == null) { missing.Add(leaf); return; }
            prop.intValue = Mathf.Max(prop.intValue, value);
            applied.Add(leaf);
        }
    }
}
