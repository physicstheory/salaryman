using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Builds stand-in vegetation so the world can be looked at and walked through before any
    /// art exists. The shapes are deliberately species specific rather than generic: a sugi
    /// plantation and an oak hillside have to read differently from a kilometre away, and that
    /// silhouette difference is most of what you are judging when you fly over the island.
    ///
    /// Replace the prefabs in the foliage library with real assets when you have them; nothing
    /// else in the pipeline has to change.
    /// </summary>
    public static class KontoFoliageFactory
    {
        public static KontoFoliageLibrary CreateOrUpdateLibrary(int seed, bool force = false)
        {
            KontoAssetPaths.EnsureAll();
            string libPath = KontoAssetPaths.Settings + "/KontoFoliageLibrary.asset";

            var lib = AssetDatabase.LoadAssetAtPath<KontoFoliageLibrary>(libPath);
            if (lib == null)
            {
                lib = ScriptableObject.CreateInstance<KontoFoliageLibrary>();
                AssetDatabase.CreateAsset(lib, libPath);
            }

            var bark      = Material("Bark",      new Color(0.21f, 0.17f, 0.13f), 0.18f);
            var barkPale  = Material("BarkPale",  new Color(0.72f, 0.71f, 0.66f), 0.22f);
            var barkBamboo= Material("BarkBamboo",new Color(0.52f, 0.57f, 0.30f), 0.35f);
            var sugiLeaf  = Material("SugiLeaf",  new Color(0.10f, 0.19f, 0.11f), 0.14f);
            var hinokiLeaf= Material("HinokiLeaf",new Color(0.14f, 0.23f, 0.14f), 0.16f);
            var oakLeaf   = Material("OakLeaf",   new Color(0.20f, 0.30f, 0.13f), 0.13f);
            var mapleLeaf = Material("MapleLeaf", new Color(0.30f, 0.30f, 0.12f), 0.15f);
            var pineLeaf  = Material("PineLeaf",  new Color(0.13f, 0.22f, 0.15f), 0.15f);
            var birchLeaf = Material("BirchLeaf", new Color(0.26f, 0.35f, 0.16f), 0.14f);
            var bambooLeaf= Material("BambooLeaf",new Color(0.24f, 0.36f, 0.16f), 0.20f);

            EnsureTree(lib, KontoTreeSpecies.Sugi,      BuildSugi(seed),      bark,       sugiLeaf,   force);
            EnsureTree(lib, KontoTreeSpecies.Hinoki,    BuildHinoki(seed),    bark,       hinokiLeaf, force);
            EnsureTree(lib, KontoTreeSpecies.Konara,    BuildBroadleaf(seed, 1.0f, 0.95f), bark,  oakLeaf,    force);
            EnsureTree(lib, KontoTreeSpecies.Momiji,    BuildBroadleaf(seed + 7, 0.62f, 1.25f), bark, mapleLeaf, force);
            EnsureTree(lib, KontoTreeSpecies.Matsu,     BuildPine(seed),      bark,       pineLeaf,   force);
            EnsureTree(lib, KontoTreeSpecies.Shirakaba, BuildBirch(seed),     barkPale,   birchLeaf,  force);
            EnsureTree(lib, KontoTreeSpecies.Take,      BuildBamboo(seed),    barkBamboo, bambooLeaf, force);

            // Ground detail billboards.
            EnsureDetail(lib, KontoFoliageLibrary.DetailShortGrass, "GrassShort",
                new Color(0.26f, 0.36f, 0.15f), new Color(0.46f, 0.52f, 0.22f), 26, 0.22f, seed + 101, force);
            EnsureDetail(lib, KontoFoliageLibrary.DetailTallGrass, "GrassSusuki",
                new Color(0.42f, 0.45f, 0.22f), new Color(0.78f, 0.72f, 0.45f), 18, 0.38f, seed + 103, force);
            EnsureDetail(lib, KontoFoliageLibrary.DetailReeds, "Reeds",
                new Color(0.24f, 0.38f, 0.19f), new Color(0.50f, 0.56f, 0.28f), 14, 0.14f, seed + 107, force);
            EnsureDetail(lib, KontoFoliageLibrary.DetailFern, "Fern",
                new Color(0.16f, 0.30f, 0.14f), new Color(0.30f, 0.42f, 0.18f), 22, 0.52f, seed + 109, force);

            EditorUtility.SetDirty(lib);
            AssetDatabase.SaveAssets();
            return lib;
        }

        // ---------------------------------------------------------------- species

        /// <summary>Sugi: very tall, very narrow, dead straight. Planted in rows on every lower slope in Japan.</summary>
        static Mesh BuildSugi(int seed)
        {
            var mb = new KontoMeshBuilder();
            const float height = 19f;
            mb.AddCylinder(Vector3.zero, 0.36f, 0.14f, height, 7, KontoMeshBuilder.SubmeshBark);

            int layers = 8;
            for (int i = 0; i < layers; i++)
            {
                float t = i / (float)(layers - 1);
                float y = 3.2f + t * (height - 5.0f);
                float radius = Mathf.Lerp(2.15f, 0.55f, Mathf.Pow(t, 0.75f));
                float coneHeight = Mathf.Lerp(4.6f, 2.4f, t);
                mb.AddCone(new Vector3(0f, y, 0f), radius, coneHeight, 8, KontoMeshBuilder.SubmeshFoliage, false);
            }
            return mb.ToMesh("Konto_Sugi");
        }

        /// <summary>Hinoki: a little shorter and fuller than sugi, slightly softer outline.</summary>
        static Mesh BuildHinoki(int seed)
        {
            var mb = new KontoMeshBuilder();
            const float height = 16f;
            mb.AddCylinder(Vector3.zero, 0.38f, 0.16f, height, 7, KontoMeshBuilder.SubmeshBark);

            int layers = 7;
            for (int i = 0; i < layers; i++)
            {
                float t = i / (float)(layers - 1);
                float y = 2.4f + t * (height - 4.2f);
                float radius = Mathf.Lerp(2.6f, 0.7f, Mathf.Pow(t, 0.8f));
                mb.AddCone(new Vector3(0f, y, 0f), radius, Mathf.Lerp(4.2f, 2.2f, t), 8, KontoMeshBuilder.SubmeshFoliage, false);
            }
            return mb.ToMesh("Konto_Hinoki");
        }

        /// <summary>Broadleaf: a short trunk, a couple of limbs, and a broad lumpy crown.</summary>
        static Mesh BuildBroadleaf(int seed, float scale, float spread)
        {
            var mb = new KontoMeshBuilder();
            float trunkHeight = 4.6f * scale;
            mb.AddCylinder(Vector3.zero, 0.42f * scale, 0.26f * scale, trunkHeight, 7, KontoMeshBuilder.SubmeshBark);

            // Two limbs leaning out of the trunk give the crown something to sit on.
            mb.AddCylinder(new Vector3(0f, trunkHeight * 0.65f, 0f), 0.22f * scale, 0.1f * scale, 2.6f * scale, 5, KontoMeshBuilder.SubmeshBark, 1.6f * scale * spread, 0.6f);
            mb.AddCylinder(new Vector3(0f, trunkHeight * 0.75f, 0f), 0.2f * scale, 0.09f * scale, 2.4f * scale, 5, KontoMeshBuilder.SubmeshBark, 1.4f * scale * spread, 3.6f);

            float crownY = trunkHeight + 2.2f * scale;
            float crownR = 3.5f * scale * spread;
            mb.AddBlob(new Vector3(0f, crownY, 0f), crownR, 0.78f, 6, 9, KontoMeshBuilder.SubmeshFoliage, 0.22f, seed);
            mb.AddBlob(new Vector3(crownR * 0.5f, crownY - 0.8f * scale, crownR * 0.25f), crownR * 0.6f, 0.8f, 5, 8, KontoMeshBuilder.SubmeshFoliage, 0.24f, seed + 3);
            mb.AddBlob(new Vector3(-crownR * 0.45f, crownY - 0.6f * scale, -crownR * 0.35f), crownR * 0.62f, 0.8f, 5, 8, KontoMeshBuilder.SubmeshFoliage, 0.24f, seed + 5);
            return mb.ToMesh("Konto_Broadleaf_" + seed);
        }

        /// <summary>Pine: a leaning, twisted trunk with flat plates of needles. The coastal windbreak tree.</summary>
        static Mesh BuildPine(int seed)
        {
            var mb = new KontoMeshBuilder();
            float h = 11f;
            mb.AddCylinder(Vector3.zero, 0.4f, 0.3f, h * 0.45f, 7, KontoMeshBuilder.SubmeshBark, 0.7f, 0.9f);
            mb.AddCylinder(new Vector3(0.7f * 0.95f, h * 0.45f, 0.55f), 0.3f, 0.18f, h * 0.4f, 6, KontoMeshBuilder.SubmeshBark, 0.9f, 2.4f);

            Vector3 top = new Vector3(0.1f, h * 0.85f, 1.1f);
            mb.AddBlob(top, 3.1f, 0.42f, 4, 9, KontoMeshBuilder.SubmeshFoliage, 0.3f, seed);
            mb.AddBlob(top + new Vector3(-2.2f, -1.9f, -0.6f), 2.0f, 0.38f, 4, 8, KontoMeshBuilder.SubmeshFoliage, 0.3f, seed + 11);
            mb.AddBlob(top + new Vector3(1.9f, -2.6f, 0.9f), 1.8f, 0.36f, 4, 8, KontoMeshBuilder.SubmeshFoliage, 0.3f, seed + 13);
            return mb.ToMesh("Konto_Matsu");
        }

        /// <summary>Birch: slim, pale trunk with a light, open crown. Sits just under the tree line.</summary>
        static Mesh BuildBirch(int seed)
        {
            var mb = new KontoMeshBuilder();
            float h = 12f;
            mb.AddCylinder(Vector3.zero, 0.22f, 0.11f, h, 6, KontoMeshBuilder.SubmeshBark, 0.35f, 1.2f);
            mb.AddBlob(new Vector3(0.2f, h * 0.78f, 0.1f), 2.3f, 1.05f, 5, 8, KontoMeshBuilder.SubmeshFoliage, 0.26f, seed);
            mb.AddBlob(new Vector3(-0.9f, h * 0.62f, 0.5f), 1.5f, 1.0f, 4, 7, KontoMeshBuilder.SubmeshFoliage, 0.26f, seed + 17);
            return mb.ToMesh("Konto_Shirakaba");
        }

        /// <summary>Bamboo: a clump of thin culms with a light crown of leaves near the top.</summary>
        static Mesh BuildBamboo(int seed)
        {
            var mb = new KontoMeshBuilder();
            var rng = new System.Random(seed);
            int culms = 7;
            for (int i = 0; i < culms; i++)
            {
                float a = (float)rng.NextDouble() * Mathf.PI * 2f;
                float r = (float)rng.NextDouble() * 1.1f;
                Vector3 baseP = new Vector3(Mathf.Cos(a) * r, 0f, Mathf.Sin(a) * r);
                float h = 9f + (float)rng.NextDouble() * 4f;
                mb.AddCylinder(baseP, 0.09f, 0.05f, h, 5, KontoMeshBuilder.SubmeshBark, 0.6f, a);
                Vector3 topP = baseP + new Vector3(Mathf.Cos(a) * 0.6f, h, Mathf.Sin(a) * 0.6f);
                mb.AddBlob(topP, 1.05f, 0.7f, 3, 6, KontoMeshBuilder.SubmeshFoliage, 0.35f, seed + i);
            }
            return mb.ToMesh("Konto_Take");
        }

        // ---------------------------------------------------------------- assets

        static void EnsureTree(KontoFoliageLibrary lib, KontoTreeSpecies species, Mesh mesh, Material bark, Material leaf, bool force)
        {
            int index = (int)species;
            if (lib.trees == null || index >= lib.trees.Length) return;

            string meshPath = KontoAssetPaths.Meshes + "/" + mesh.name + ".asset";
            string prefabPath = KontoAssetPaths.Prefabs + "/" + mesh.name + ".prefab";

            var existingPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            if (existingPrefab != null && !force)
            {
                if (lib.trees[index].prefab == null) lib.trees[index].prefab = existingPrefab;
                Object.DestroyImmediate(mesh);
                return;
            }

            var savedMesh = AssetDatabase.LoadAssetAtPath<Mesh>(meshPath);
            if (savedMesh == null)
            {
                AssetDatabase.CreateAsset(mesh, meshPath);
                savedMesh = mesh;
            }
            else
            {
                EditorUtility.CopySerialized(mesh, savedMesh);
                Object.DestroyImmediate(mesh);
            }

            var go = new GameObject(savedMesh.name);
            var mf = go.AddComponent<MeshFilter>();
            mf.sharedMesh = savedMesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterials = new[] { bark, leaf };
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;

            var collider = go.AddComponent<CapsuleCollider>();
            var bounds = savedMesh.bounds;
            collider.height = bounds.size.y;
            collider.center = new Vector3(0f, bounds.size.y * 0.5f, 0f);
            collider.radius = 0.45f;

            var prefab = PrefabUtility.SaveAsPrefabAsset(go, prefabPath);
            Object.DestroyImmediate(go);

            lib.trees[index].prefab = prefab;
        }

        static void EnsureDetail(KontoFoliageLibrary lib, int index, string assetName, Color baseColor, Color tipColor, int blades, float bend, int seed, bool force)
        {
            if (lib.details == null || index >= lib.details.Length) return;
            var tex = KontoTextureFactory.CreateGrassTexture(assetName, baseColor, tipColor, blades, bend, seed, force);
            lib.details[index].billboardTexture = tex;
        }

        static Material Material(string name, Color color, float smoothness)
        {
            KontoAssetPaths.EnsureFolder(KontoAssetPaths.Materials);
            string path = KontoAssetPaths.Materials + "/Konto_" + name + ".mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
            {
                Shader shader = Shader.Find("HDRP/Lit");
                if (shader == null) shader = Shader.Find("HDRP/Unlit");
                if (shader == null) shader = Shader.Find("Standard");
                mat = new Material(shader) { name = "Konto_" + name };
                AssetDatabase.CreateAsset(mat, path);
            }

            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", smoothness);
            if (mat.HasProperty("_Glossiness")) mat.SetFloat("_Glossiness", smoothness);
            if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", 0f);
            EditorUtility.SetDirty(mat);
            return mat;
        }
    }
}
