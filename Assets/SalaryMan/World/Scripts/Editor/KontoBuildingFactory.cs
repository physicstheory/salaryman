using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Turns a planned city into built buildings.
    ///
    /// Everything on a ward's plots goes into one mesh with one submesh per
    /// <see cref="CitySurface"/>, so a ward of two hundred buildings is fifteen draw calls. The
    /// meshes are saved as assets, which is what makes the result a scene you can keep rather
    /// than something that only exists while the generator is in memory.
    /// </summary>
    public static class KontoBuildingFactory
    {
        public const string GroupName = "Buildings";

        /// <summary>Vertices per combined mesh before a ward is split in two.</summary>
        const int VertexBudget = 500000;

        public static int Build(CityLayout layout, Transform parent, Material[] surfaces)
        {
            if (surfaces == null)
            {
                Debug.LogError("[Konto] No city surface materials: buildings were skipped.");
                return 0;
            }

            var group = new GameObject(GroupName);
            group.transform.SetParent(parent, true);

            int built = 0, meshes = 0;
            for (int w = 0; w < layout.wards.Count; w++)
            {
                var ward = layout.wards[w];
                var mesh = new BuildingMesh();
                int part = 0, inThisMesh = 0;

                for (int i = 0; i < layout.plots.Count; i++)
                {
                    var plot = layout.plots[i];
                    if (plot.ward != w) continue;
                    if (!BuildingLibrary.Buildable(plot.kind)) continue;

                    BuildingLibrary.Build(plot, mesh);
                    built++;
                    inThisMesh++;

                    if (mesh.VertexCount < VertexBudget) continue;
                    Emit(group.transform, mesh, surfaces, layout, ward.name, w, part++);
                    meshes++;
                    mesh = new BuildingMesh();
                    inThisMesh = 0;
                }

                if (inThisMesh > 0)
                {
                    Emit(group.transform, mesh, surfaces, layout, ward.name, w, part);
                    meshes++;
                }

                EditorUtility.DisplayProgressBar("Konto buildings", ward.name, (w + 1) / (float)layout.wards.Count);
            }
            EditorUtility.ClearProgressBar();

            Debug.Log(string.Format("[Konto] {0}: built {1} plots into {2} meshes.", layout.name, built, meshes));
            return built;
        }

        static void Emit(Transform parent, BuildingMesh builder, Material[] surfaces, CityLayout layout,
            string wardName, int wardIndex, int part)
        {
            if (builder.VertexCount == 0) return;

            string assetName = string.Format("Buildings_{0}_{1}_{2}", layout.code, wardIndex, part);
            var mesh = builder.Build(assetName);
            string path = string.Format("{0}/Konto_{1}.asset", KontoAssetPaths.Meshes, assetName);
            var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (existing != null) AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(mesh, path);

            var go = new GameObject(part == 0 ? wardName : wardName + " (" + (part + 1) + ")");
            go.transform.SetParent(parent, true);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;

            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterials = surfaces;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            renderer.receiveShadows = true;

            // The collider is the same mesh: you can walk into a building because it is there,
            // not because something invisible was put in front of it.
            go.AddComponent<MeshCollider>().sharedMesh = mesh;

            GameObjectUtility.SetStaticEditorFlags(go,
                StaticEditorFlags.ContributeGI | StaticEditorFlags.OccluderStatic
                | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.BatchingStatic);
        }
    }
}
