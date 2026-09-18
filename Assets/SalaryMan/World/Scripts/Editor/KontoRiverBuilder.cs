using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Builds the visible rivers: a ribbon mesh follows each traced watercourse from the
    /// mountains to the sea, sitting just above the carved bed and widening as tributaries
    /// join. Japanese rivers are short, steep and wide-bedded, and the braided gravel channel
    /// with a thin thread of water in it is a large part of what the countryside looks like.
    /// </summary>
    public static class KontoRiverBuilder
    {
        public static int Build(KontoWorldData data, Transform parent, int maxRivers = 40, float minLength = 260f)
        {
            var rivers = data.Water.Rivers;
            if (rivers == null || rivers.Count == 0) return 0;

            KontoAssetPaths.EnsureAll();
            Material material = RiverMaterial();

            var root = new GameObject("Rivers");
            root.transform.SetParent(parent, false);

            int built = 0;
            foreach (var path in rivers)
            {
                if (built >= maxRivers) break;
                if (path.Points.Count < 4) continue;
                if (PathLength(path) < minLength) continue;

                Mesh mesh = BuildRibbon(path, data);
                if (mesh == null) continue;

                string meshPath = KontoAssetPaths.Meshes + "/Konto_" + path.Name + ".asset";
                var existing = AssetDatabase.LoadAssetAtPath<Mesh>(meshPath);
                if (existing != null) AssetDatabase.DeleteAsset(meshPath);
                AssetDatabase.CreateAsset(mesh, meshPath);

                var go = new GameObject(path.Name);
                go.transform.SetParent(root.transform, false);
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                var mr = go.AddComponent<MeshRenderer>();
                mr.sharedMaterial = material;
                mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                mr.receiveShadows = true;

                built++;
            }

            AssetDatabase.SaveAssets();
            return built;
        }

        static float PathLength(RiverPath path)
        {
            float total = 0f;
            for (int i = 1; i < path.Points.Count; i++)
                total += Vector3.Distance(path.Points[i - 1], path.Points[i]);
            return total;
        }

        /// <summary>
        /// Lays a quad strip along the path. The edges are pulled down slightly and inward to
        /// the true bank height so the water meets the gravel instead of ending in mid air.
        /// </summary>
        static Mesh BuildRibbon(RiverPath path, KontoWorldData data)
        {
            int n = path.Points.Count;
            var vertices = new List<Vector3>(n * 2);
            var normals = new List<Vector3>(n * 2);
            var uvs = new List<Vector2>(n * 2);
            var triangles = new List<int>((n - 1) * 6);

            float distance = 0f;
            for (int i = 0; i < n; i++)
            {
                Vector3 p = path.Points[i];
                Vector3 prev = path.Points[Mathf.Max(0, i - 1)];
                Vector3 next = path.Points[Mathf.Min(n - 1, i + 1)];
                Vector3 dir = next - prev;
                dir.y = 0f;
                if (dir.sqrMagnitude < 1e-6f) dir = Vector3.forward;
                dir.Normalize();
                Vector3 side = new Vector3(-dir.z, 0f, dir.x);

                if (i > 0) distance += Vector3.Distance(path.Points[i - 1], p);
                float halfWidth = path.HalfWidths[i];

                // Do not let the ribbon spill out over ground that is above the water line.
                Vector3 left = ClampToBank(p, side, halfWidth, data);
                Vector3 right = ClampToBank(p, -side, halfWidth, data);

                vertices.Add(left);
                vertices.Add(right);
                normals.Add(Vector3.up);
                normals.Add(Vector3.up);
                uvs.Add(new Vector2(0f, distance / 25f));
                uvs.Add(new Vector2(1f, distance / 25f));
            }

            for (int i = 0; i < n - 1; i++)
            {
                int a = i * 2;
                triangles.Add(a); triangles.Add(a + 2); triangles.Add(a + 1);
                triangles.Add(a + 1); triangles.Add(a + 2); triangles.Add(a + 3);
            }

            if (triangles.Count == 0) return null;

            var mesh = new Mesh { name = "Konto_" + path.Name };
            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            mesh.RecalculateTangents();
            return mesh;
        }

        /// <summary>Pulls an edge vertex in until the terrain there is at or below the water surface.</summary>
        static Vector3 ClampToBank(Vector3 center, Vector3 side, float halfWidth, KontoWorldData data)
        {
            float width = halfWidth;
            for (int i = 0; i <= 6; i++)
            {
                Vector3 p = center + side * width;
                float ground = data.SampleHeight(p.x, p.z);
                if (ground <= center.y + 0.05f) return new Vector3(p.x, center.y, p.z);
                width *= 0.78f;
                if (width < 0.6f) break;
            }
            return new Vector3(center.x + side.x * width, center.y, center.z + side.z * width);
        }

        static Material RiverMaterial()
        {
            KontoAssetPaths.EnsureFolder(KontoAssetPaths.Materials);
            string path = KontoAssetPaths.Materials + "/Konto_River.mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat != null) return mat;

            Shader shader = Shader.Find("HDRP/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            mat = new Material(shader) { name = "Konto_River" };

            var color = new Color(0.07f, 0.16f, 0.17f, 0.78f);
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 0.97f);
            if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", 0f);
            if (mat.HasProperty("_SurfaceType")) mat.SetFloat("_SurfaceType", 1f);      // transparent
            if (mat.HasProperty("_BlendMode")) mat.SetFloat("_BlendMode", 0f);          // alpha
            if (mat.HasProperty("_ZWrite")) mat.SetFloat("_ZWrite", 0f);
            if (mat.HasProperty("_RefractionModel")) mat.SetFloat("_RefractionModel", 1f);
            if (mat.HasProperty("_Ior")) mat.SetFloat("_Ior", 1.333f);

            KontoMaterialUtil.ValidateHdrpMaterial(mat);
            AssetDatabase.CreateAsset(mat, path);
            return mat;
        }
    }

    /// <summary>HDRP materials need revalidating after their properties are set from script.</summary>
    public static class KontoMaterialUtil
    {
        public static void ValidateHdrpMaterial(Material material)
        {
            if (material == null) return;
            var type = HdrpReflection.FindType("HDMaterial");
            if (type == null) return;
            var method = type.GetMethod("ValidateMaterial", new[] { typeof(Material) });
            if (method != null) method.Invoke(null, new object[] { material });
        }
    }
}
