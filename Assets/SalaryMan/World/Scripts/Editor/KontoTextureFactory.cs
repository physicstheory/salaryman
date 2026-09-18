using System.IO;
using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Generates tiling ground textures and the TerrainLayers that use them.
    ///
    /// These are stand-ins, not final art: they are procedural, seamless, correctly linear or
    /// sRGB, and they carry proper normal and mask maps so HDRP lights them the way it will
    /// light the real textures later. Swapping in scanned material sets afterwards is a matter
    /// of dropping new textures into the same TerrainLayer assets.
    /// </summary>
    public static class KontoTextureFactory
    {
        const int TextureSize = 512;
        const int NoisePeriod = 8;      // lattice period, in texture repeats, for seamless tiling

        class LayerSpec
        {
            public string name;
            public Color baseColor;
            public Color variantColor;
            public float tileSize;          // metres per texture repeat
            public float grain;             // high frequency colour break-up
            public float featureScale;      // low frequency patchiness
            public float bumpHeight;        // strength of the generated normal map
            public float smoothMin, smoothMax;
            public float aoStrength;
            public float speckle;           // pebbles and stones, via cellular noise
            public float strata;            // horizontal banding, for rock
        }

        static LayerSpec[] BuildSpecs()
        {
            return new[]
            {
                new LayerSpec { name = "Sand",        baseColor = new Color(0.68f, 0.62f, 0.51f), variantColor = new Color(0.58f, 0.52f, 0.43f), tileSize = 3.5f,  grain = 0.55f, featureScale = 3.0f, bumpHeight = 0.35f, smoothMin = 0.08f, smoothMax = 0.32f, aoStrength = 0.15f, speckle = 0.10f, strata = 0f },
                new LayerSpec { name = "RiverGravel", baseColor = new Color(0.47f, 0.45f, 0.42f), variantColor = new Color(0.34f, 0.33f, 0.31f), tileSize = 2.8f,  grain = 0.40f, featureScale = 4.0f, bumpHeight = 1.00f, smoothMin = 0.10f, smoothMax = 0.38f, aoStrength = 0.55f, speckle = 0.85f, strata = 0f },
                new LayerSpec { name = "PaddySoil",   baseColor = new Color(0.24f, 0.20f, 0.16f), variantColor = new Color(0.32f, 0.27f, 0.20f), tileSize = 5.0f,  grain = 0.25f, featureScale = 2.2f, bumpHeight = 0.30f, smoothMin = 0.12f, smoothMax = 0.40f, aoStrength = 0.35f, speckle = 0.08f, strata = 0f },
                new LayerSpec { name = "Meadow",      baseColor = new Color(0.27f, 0.36f, 0.16f), variantColor = new Color(0.38f, 0.42f, 0.20f), tileSize = 2.6f,  grain = 0.50f, featureScale = 3.2f, bumpHeight = 0.28f, smoothMin = 0.06f, smoothMax = 0.22f, aoStrength = 0.40f, speckle = 0.05f, strata = 0f },
                new LayerSpec { name = "ForestFloor", baseColor = new Color(0.16f, 0.17f, 0.11f), variantColor = new Color(0.25f, 0.22f, 0.13f), tileSize = 3.2f,  grain = 0.55f, featureScale = 2.6f, bumpHeight = 0.45f, smoothMin = 0.05f, smoothMax = 0.20f, aoStrength = 0.60f, speckle = 0.22f, strata = 0f },
                new LayerSpec { name = "Rock",        baseColor = new Color(0.34f, 0.33f, 0.32f), variantColor = new Color(0.23f, 0.22f, 0.22f), tileSize = 7.0f,  grain = 0.35f, featureScale = 1.6f, bumpHeight = 1.60f, smoothMin = 0.14f, smoothMax = 0.42f, aoStrength = 0.75f, speckle = 0.25f, strata = 0.55f },
                new LayerSpec { name = "Scree",       baseColor = new Color(0.45f, 0.43f, 0.42f), variantColor = new Color(0.31f, 0.30f, 0.30f), tileSize = 4.0f,  grain = 0.45f, featureScale = 2.4f, bumpHeight = 1.20f, smoothMin = 0.10f, smoothMax = 0.34f, aoStrength = 0.65f, speckle = 0.95f, strata = 0f },
                new LayerSpec { name = "Snow",        baseColor = new Color(0.86f, 0.89f, 0.94f), variantColor = new Color(0.74f, 0.80f, 0.90f), tileSize = 6.0f,  grain = 0.18f, featureScale = 1.8f, bumpHeight = 0.40f, smoothMin = 0.18f, smoothMax = 0.55f, aoStrength = 0.20f, speckle = 0.06f, strata = 0f },
            };
        }

        public static TerrainLayer[] CreateOrUpdateLayers(int seed, bool force = false)
        {
            KontoAssetPaths.EnsureAll();
            var specs = BuildSpecs();
            var layers = new TerrainLayer[specs.Length];

            // Deliberately NOT wrapped in StartAssetEditing/StopAssetEditing. Inside that block
            // the importer is paused, so AssetImporter.GetAtPath returns null and the texture
            // import settings never get applied, and newly created assets can come back null
            // from LoadAssetAtPath afterwards. Null terrain layers then blow up inside
            // TerrainData. The batching is not worth it for eight layers.
            try
            {
                for (int i = 0; i < specs.Length; i++)
                {
                    var spec = specs[i];
                    EditorUtility.DisplayProgressBar("Konto ground textures", spec.name, i / (float)specs.Length);
                    layers[i] = BuildLayer(spec, seed + i * 7717, force);
                }
            }
            finally
            {
                EditorUtility.ClearProgressBar();
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
            }

            // Reload through the database so we hand back the imported assets, and make sure
            // every slot is actually filled before anything downstream trusts the array.
            for (int i = 0; i < specs.Length; i++)
            {
                if (layers[i] == null) layers[i] = AssetDatabase.LoadAssetAtPath<TerrainLayer>(LayerPath(specs[i].name));
                if (layers[i] != null) continue;

                Debug.LogError("[Konto] Terrain layer '" + specs[i].name + "' could not be created at "
                    + LayerPath(specs[i].name) + ". Terrain will be built without ground textures. "
                    + "Check that Assets/SalaryMan/World/Generated is writable.");
                return null;
            }

            return layers;
        }

        static string LayerPath(string name) { return KontoAssetPaths.Layers + "/Konto_" + name + ".terrainlayer"; }
        static string TexturePath(string name, string suffix) { return KontoAssetPaths.Textures + "/Konto_" + name + "_" + suffix + ".png"; }

        static TerrainLayer BuildLayer(LayerSpec spec, int seed, bool force)
        {
            string albedoPath = TexturePath(spec.name, "Albedo");
            string normalPath = TexturePath(spec.name, "Normal");
            string maskPath = TexturePath(spec.name, "Mask");

            if (force || !File.Exists(albedoPath))
            {
                Color[] albedo, normal, mask;
                Generate(spec, seed, out albedo, out normal, out mask);
                WritePng(albedoPath, albedo, false, false);
                WritePng(normalPath, normal, true, false);
                WritePng(maskPath, mask, false, true);
            }

            var layer = AssetDatabase.LoadAssetAtPath<TerrainLayer>(LayerPath(spec.name));
            if (layer == null)
            {
                layer = new TerrainLayer();
                AssetDatabase.CreateAsset(layer, LayerPath(spec.name));
            }

            layer.diffuseTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(albedoPath);
            layer.normalMapTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(normalPath);
            layer.maskMapTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(maskPath);
            layer.tileSize = new Vector2(spec.tileSize, spec.tileSize);
            layer.tileOffset = Vector2.zero;
            layer.normalScale = 1f;
            layer.metallic = 0f;
            layer.smoothness = 1f;   // the actual value comes from the mask map remap below
            layer.specular = new Color(0.04f, 0.04f, 0.04f);
            // HDRP reads mask maps as R metallic, G ambient occlusion, B height, A smoothness.
            layer.maskMapRemapMin = new Vector4(0f, 0f, 0f, spec.smoothMin);
            layer.maskMapRemapMax = new Vector4(0f, 1f, 1f, spec.smoothMax);
            EditorUtility.SetDirty(layer);
            return layer;
        }

        // ---------------------------------------------------------------- pixels

        static void Generate(LayerSpec spec, int seed, out Color[] albedo, out Color[] normalPixels, out Color[] mask)
        {
            int size = TextureSize;
            albedo = new Color[size * size];
            normalPixels = new Color[size * size];
            mask = new Color[size * size];
            var height = new float[size * size];
            var ao = new float[size * size];

            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                // Noise coordinates run 0..NoisePeriod across the texture, and every frequency
                // multiplier is a whole number, which is what keeps the result seamless.
                float u = x / (float)size * NoisePeriod;
                float v = y / (float)size * NoisePeriod;
                int k = Mathf.Max(1, Mathf.RoundToInt(spec.featureScale));

                float patches = KontoNoise.FbmTiled(u * k, v * k, seed + 11, 4, NoisePeriod * k);
                float grain = KontoNoise.FbmTiled(u * 4f, v * 4f, seed + 29, 4, NoisePeriod * 4);
                float fine = KontoNoise.PerlinTiled(u * 16f, v * 16f, seed + 43, NoisePeriod * 16);

                float h = patches * 0.55f + grain * 0.3f + fine * 0.15f;

                if (spec.strata > 0f)
                {
                    // Bedding planes. Andesite and sandstone both band, and banding is what makes
                    // a rock texture read as rock rather than as generic noise.
                    float band = Mathf.Sin((v / NoisePeriod * 6f + patches * 0.35f) * Mathf.PI * 2f);
                    h += band * spec.strata * 0.35f;
                }

                if (spec.speckle > 0.02f)
                {
                    float f1 = KontoNoise.WorleyTiled(u * 8f, v * 8f, seed + 61, NoisePeriod * 8);
                    float stone = Mathf.Clamp01(1f - f1 * 1.9f);
                    h += stone * spec.speckle * 0.75f;
                }

                height[y * size + x] = h;
                ao[y * size + x] = Mathf.Clamp01(1f - Mathf.Max(0f, -h) * spec.aoStrength);

                float tint = Mathf.Clamp01(0.5f + (patches * 0.8f + grain * 0.5f) * 0.5f);
                Color c = Color.Lerp(spec.variantColor, spec.baseColor, tint);
                float g = 1f + fine * spec.grain * 0.35f;
                albedo[y * size + x] = new Color(Mathf.Clamp01(c.r * g), Mathf.Clamp01(c.g * g), Mathf.Clamp01(c.b * g), 1f);
            }

            // Sobel the height field into a normal map.
            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                float hl = height[y * size + Wrap(x - 1, size)];
                float hr = height[y * size + Wrap(x + 1, size)];
                float hd = height[Wrap(y - 1, size) * size + x];
                float hu = height[Wrap(y + 1, size) * size + x];

                Vector3 n = new Vector3((hl - hr) * spec.bumpHeight, (hd - hu) * spec.bumpHeight, 1f).normalized;
                normalPixels[y * size + x] = new Color(n.x * 0.5f + 0.5f, n.y * 0.5f + 0.5f, n.z * 0.5f + 0.5f, 1f);

                float hNorm = Mathf.Clamp01(height[y * size + x] * 0.5f + 0.5f);
                float smooth = Mathf.Clamp01(0.5f + height[y * size + x] * 0.4f);
                // R metallic, G AO, B height, A smoothness.
                mask[y * size + x] = new Color(0f, ao[y * size + x], hNorm, smooth);
            }
        }

        static int Wrap(int v, int size) { int m = v % size; return m < 0 ? m + size : m; }

        static void WritePng(string path, Color[] pixels, bool isNormalMap, bool isLinearData)
        {
            var tex = new Texture2D(TextureSize, TextureSize, TextureFormat.RGBA32, false, true);
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
            importer.maxTextureSize = 1024;
            importer.textureCompression = TextureImporterCompression.CompressedHQ;
            importer.SaveAndReimport();
        }

        // ---------------------------------------------------------------- grass billboards

        /// <summary>Generates a grass billboard texture: a clump of tapered blades on transparent black.</summary>
        public static Texture2D CreateGrassTexture(string assetName, Color baseColor, Color tipColor, int bladeCount, float bend, int seed, bool force = false)
        {
            KontoAssetPaths.EnsureAll();
            string path = KontoAssetPaths.Textures + "/Konto_" + assetName + ".png";
            if (!force && File.Exists(path))
            {
                var loaded = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
                if (loaded != null) return loaded;
            }

            const int size = 256;
            var pixels = new Color[size * size];
            var rng = new System.Random(seed);

            for (int b = 0; b < bladeCount; b++)
            {
                float baseX = 0.12f + (float)rng.NextDouble() * 0.76f;
                float height = 0.55f + (float)rng.NextDouble() * 0.44f;
                float lean = ((float)rng.NextDouble() - 0.5f) * bend;
                float width = 0.012f + (float)rng.NextDouble() * 0.016f;
                float shade = 0.72f + (float)rng.NextDouble() * 0.38f;

                int steps = size * 2;
                for (int i = 0; i < steps; i++)
                {
                    float t = i / (float)(steps - 1);
                    float y = t * height;
                    // Blades curve over as they rise, and taper to nothing at the tip.
                    float x = baseX + lean * t * t;
                    float w = width * (1f - t * 0.92f);

                    int px0 = Mathf.FloorToInt((x - w) * size);
                    int px1 = Mathf.CeilToInt((x + w) * size);
                    int py = Mathf.FloorToInt(y * size);
                    if (py < 0 || py >= size) continue;

                    for (int px = px0; px <= px1; px++)
                    {
                        if (px < 0 || px >= size) continue;
                        float d = Mathf.Abs((px + 0.5f) / size - x) / Mathf.Max(1e-5f, w);
                        float a = Mathf.Clamp01(1f - d * d);
                        if (a <= 0.01f) continue;

                        Color c = Color.Lerp(baseColor, tipColor, t) * shade;
                        int idx = (size - 1 - py) * size + px;
                        Color prev = pixels[idx];
                        float alpha = Mathf.Max(prev.a, a);
                        Color blended = prev.a > 0f ? Color.Lerp(prev, c, a) : c;
                        pixels[idx] = new Color(blended.r, blended.g, blended.b, alpha);
                    }
                }
            }

            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false, true);
            tex.SetPixels(pixels);
            tex.Apply();
            File.WriteAllBytes(path, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);

            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
            var importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer != null)
            {
                importer.textureType = TextureImporterType.Default;
                importer.alphaIsTransparency = true;
                importer.sRGBTexture = true;
                importer.wrapMode = TextureWrapMode.Clamp;
                importer.filterMode = FilterMode.Bilinear;
                importer.mipmapEnabled = true;
                importer.maxTextureSize = 256;
                importer.SaveAndReimport();
            }
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }
    }
}
