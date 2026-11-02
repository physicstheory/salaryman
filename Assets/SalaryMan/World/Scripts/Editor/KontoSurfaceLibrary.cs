using System.IO;
using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Builds the fifteen materials the city is made of, one per <see cref="CitySurface"/>.
    ///
    /// The pixels come from <see cref="FacadeTextures"/>, which is runtime code so the same
    /// generator can be run outside Unity and looked at before anything is committed. This class
    /// is only the plumbing: write the PNGs, set the import settings so the colour maps are sRGB
    /// and the data maps are not, and wire an HDRP Lit material up to them.
    ///
    /// The one setting that matters more than the rest is pixel displacement. Facades are single
    /// quads with the window grid in the texture, so without parallax they are wallpaper. With
    /// `_DisplacementMode` set to pixel displacement and the generated height map driving it, the
    /// reveals move against the wall as you walk past and the openings read as holes.
    /// </summary>
    public static class KontoSurfaceLibrary
    {
        public const int DefaultSize = 1024;

        static string TexPath(string name, string suffix)
        {
            return KontoAssetPaths.Textures + "/Konto_Surf_" + name + "_" + suffix + ".png";
        }

        static string MatPath(string name)
        {
            return KontoAssetPaths.Materials + "/Konto_Surf_" + name + ".mat";
        }

        /// <summary>
        /// Returns the material array in <see cref="CitySurface"/> order, ready to drop straight
        /// onto a renderer whose mesh has one submesh per surface.
        /// </summary>
        public static Material[] CreateOrUpdate(int seed, bool force = false, int size = DefaultSize)
        {
            KontoAssetPaths.EnsureAll();
            var specs = FacadeTextures.All();
            var materials = new Material[(int)CitySurface.Count];

            try
            {
                for (int i = 0; i < specs.Length; i++)
                {
                    var spec = specs[i];
                    spec.size = size;
                    EditorUtility.DisplayProgressBar("Konto city surfaces", spec.name, i / (float)specs.Length);
                    materials[(int)spec.surface] = BuildOne(spec, seed + (int)spec.surface * 131, force);
                }
            }
            finally
            {
                EditorUtility.ClearProgressBar();
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
            }

            for (int i = 0; i < materials.Length; i++)
            {
                if (materials[i] != null) continue;
                Debug.LogError("[Konto] City surface material " + (CitySurface)i + " could not be created. "
                    + "Check that " + KontoAssetPaths.Materials + " is writable.");
                return null;
            }
            return materials;
        }

        static Material BuildOne(FacadeTextures.Spec spec, int seed, bool force)
        {
            string albedoPath = TexPath(spec.name, "Albedo");
            string normalPath = TexPath(spec.name, "Normal");
            string maskPath = TexPath(spec.name, "Mask");
            string heightPath = TexPath(spec.name, "Height");

            if (force || !File.Exists(albedoPath))
            {
                Color[] albedo, normal, mask;
                FacadeTextures.Generate(spec, seed, out albedo, out normal, out mask);

                // HDRP Lit wants displacement from its own height map, not from the mask's blue
                // channel, so the height comes back out as a texture of its own.
                var height = new Color[mask.Length];
                for (int i = 0; i < mask.Length; i++) height[i] = new Color(mask[i].b, mask[i].b, mask[i].b, 1f);

                WritePng(albedoPath, albedo, spec.size, false, false);
                WritePng(normalPath, normal, spec.size, true, false);
                WritePng(maskPath, mask, spec.size, false, true);
                WritePng(heightPath, height, spec.size, false, true);
            }

            var mat = AssetDatabase.LoadAssetAtPath<Material>(MatPath(spec.name));
            if (mat == null)
            {
                Shader shader = Shader.Find("HDRP/Lit");
                if (shader == null) shader = Shader.Find("Standard");
                if (shader == null) return null;
                mat = new Material(shader) { name = "Konto_Surf_" + spec.name };
                AssetDatabase.CreateAsset(mat, MatPath(spec.name));
            }

            var albedoTex = AssetDatabase.LoadAssetAtPath<Texture2D>(albedoPath);
            var normalTex = AssetDatabase.LoadAssetAtPath<Texture2D>(normalPath);
            var maskTex = AssetDatabase.LoadAssetAtPath<Texture2D>(maskPath);
            var heightTex = AssetDatabase.LoadAssetAtPath<Texture2D>(heightPath);

            // Facade UVs are already in bay-and-floor units, so the mesh does the tiling and the
            // material must not. Everything else is UV'd in metres and tiles from here.
            Vector2 tiling = spec.isFacade
                ? Vector2.one
                : new Vector2(1f / Mathf.Max(0.01f, spec.tileMetresX), 1f / Mathf.Max(0.01f, spec.tileMetresY));

            SetTexture(mat, "_BaseColorMap", albedoTex, tiling);
            SetTexture(mat, "_MainTex", albedoTex, tiling);
            SetTexture(mat, "_NormalMap", normalTex, tiling);
            SetTexture(mat, "_BumpMap", normalTex, tiling);
            SetTexture(mat, "_MaskMap", maskTex, tiling);
            SetTexture(mat, "_HeightMap", heightTex, tiling);

            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", Color.white);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", Color.white);
            if (mat.HasProperty("_NormalScale")) mat.SetFloat("_NormalScale", 1f);
            // With a mask map present HDRP multiplies these in, so they have to be wide open or
            // the generated metal and smoothness get thrown away.
            if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", 1f);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 1f);
            if (mat.HasProperty("_SmoothnessRemapMin")) mat.SetFloat("_SmoothnessRemapMin", 0f);
            if (mat.HasProperty("_SmoothnessRemapMax")) mat.SetFloat("_SmoothnessRemapMax", 1f);
            if (mat.HasProperty("_AORemapMin")) mat.SetFloat("_AORemapMin", 0f);
            if (mat.HasProperty("_AORemapMax")) mat.SetFloat("_AORemapMax", 1f);
            if (mat.HasProperty("_Glossiness")) mat.SetFloat("_Glossiness", 0.5f);

            bool pom = spec.displacement > 0.01f && heightTex != null && mat.HasProperty("_DisplacementMode");
            if (mat.HasProperty("_DisplacementMode")) mat.SetFloat("_DisplacementMode", pom ? 2f : 0f);
            if (pom)
            {
                if (mat.HasProperty("_HeightPoMAmplitude")) mat.SetFloat("_HeightPoMAmplitude", spec.displacement);
                if (mat.HasProperty("_HeightAmplitude")) mat.SetFloat("_HeightAmplitude", spec.displacement * 0.01f);
                if (mat.HasProperty("_HeightCenter")) mat.SetFloat("_HeightCenter", 0.5f);
                if (mat.HasProperty("_HeightMin")) mat.SetFloat("_HeightMin", -1f);
                if (mat.HasProperty("_HeightMax")) mat.SetFloat("_HeightMax", 1f);
                if (mat.HasProperty("_PPDMinSamples")) mat.SetFloat("_PPDMinSamples", 5f);
                if (mat.HasProperty("_PPDMaxSamples")) mat.SetFloat("_PPDMaxSamples", 15f);
                // Stop paying for parallax on buildings across the bay.
                if (mat.HasProperty("_PPDLodThreshold")) mat.SetFloat("_PPDLodThreshold", 5f);
                if (mat.HasProperty("_PPDPrimitiveLength")) mat.SetFloat("_PPDPrimitiveLength", spec.tileMetresX);
                if (mat.HasProperty("_PPDPrimitiveWidth")) mat.SetFloat("_PPDPrimitiveWidth", spec.tileMetresY);
            }

            // Specular anti aliasing: a city is thousands of small bright edges and without this
            // the whole skyline crawls when the camera moves.
            if (mat.HasProperty("_EnableGeometricSpecularAA")) mat.SetFloat("_EnableGeometricSpecularAA", 1f);
            if (mat.HasProperty("_SpecularAAScreenSpaceVariance")) mat.SetFloat("_SpecularAAScreenSpaceVariance", 0.1f);
            if (mat.HasProperty("_SpecularAAThreshold")) mat.SetFloat("_SpecularAAThreshold", 0.2f);

            KontoMaterialUtil.ValidateHdrpMaterial(mat);
            EditorUtility.SetDirty(mat);
            return mat;
        }

        static void SetTexture(Material mat, string property, Texture2D tex, Vector2 tiling)
        {
            if (tex == null || !mat.HasProperty(property)) return;
            mat.SetTexture(property, tex);
            mat.SetTextureScale(property, tiling);
            mat.SetTextureOffset(property, Vector2.zero);
        }

        static void WritePng(string path, Color[] pixels, int size, bool isNormalMap, bool isLinearData)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false, true);
            tex.SetPixels(pixels);
            tex.Apply();
            File.WriteAllBytes(path, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);

            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
            var importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null) return;

            importer.textureType = isNormalMap ? TextureImporterType.NormalMap : TextureImporterType.Default;
            importer.sRGBTexture = !isNormalMap && !isLinearData;
            importer.wrapMode = TextureWrapMode.Repeat;
            importer.filterMode = FilterMode.Trilinear;
            importer.anisoLevel = 8;
            importer.mipmapEnabled = true;
            importer.streamingMipmaps = true;
            importer.maxTextureSize = Mathf.Max(512, size);
            importer.textureCompression = TextureImporterCompression.CompressedHQ;
            importer.SaveAndReimport();
        }
    }
}
