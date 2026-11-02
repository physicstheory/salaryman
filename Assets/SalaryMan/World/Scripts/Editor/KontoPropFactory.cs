using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Builds the street furniture for a city into one mesh: kerbs, lamp columns, utility poles
    /// and their wiring, signals and vending machines. It shares the building materials, so the
    /// whole lot is another fifteen draw calls and no new assets beyond the mesh.
    /// </summary>
    public static class KontoPropFactory
    {
        public const string GroupName = "Street furniture";

        /// <summary>Vertices per combined mesh before the run of roads is split.</summary>
        const int VertexBudget = 220000;

        public static void Build(CityLayout layout, Transform parent, Material[] surfaces)
        {
            if (surfaces == null) return;

            var group = new GameObject(GroupName);
            group.transform.SetParent(parent, true);

            int total = 0, part = 0;
            var mesh = new BuildingMesh();
            for (int i = 0; i < layout.roads.Count; i++)
            {
                StreetProps.Build(layout, mesh, i, i + 1, false);
                if (mesh.VertexCount < VertexBudget) continue;
                total += mesh.TriangleCount;
                Emit(group.transform, mesh, surfaces, layout, part++);
                mesh = new BuildingMesh();
            }

            // The last chunk also carries the things that are not attached to a road.
            StreetProps.Build(layout, mesh, layout.roads.Count, layout.roads.Count, true);
            total += mesh.TriangleCount;
            Emit(group.transform, mesh, surfaces, layout, part);

            Debug.Log(string.Format("[Konto] {0}: street furniture is {1} triangles in {2} meshes.",
                layout.name, total, part + 1));
        }

        static void Emit(Transform parent, BuildingMesh builder, Material[] surfaces, CityLayout layout, int part)
        {
            if (builder.VertexCount == 0) return;

            string assetName = string.Format("Props_{0}_{1}", layout.code, part);
            var built = builder.Build(assetName);
            string path = string.Format("{0}/Konto_{1}.asset", KontoAssetPaths.Meshes, assetName);
            var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (existing != null) AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(built, path);

            var go = new GameObject("Furniture " + (part + 1));
            go.transform.SetParent(parent, true);
            go.AddComponent<MeshFilter>().sharedMesh = built;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterials = surfaces;
            renderer.receiveShadows = true;

            // No collider: you should be able to walk past a lamp column, not into it, and a
            // mesh collider on ten thousand thin posts is not worth what it costs.
            GameObjectUtility.SetStaticEditorFlags(go,
                StaticEditorFlags.ContributeGI | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.BatchingStatic);
        }
    }
}
