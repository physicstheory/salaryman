using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Creates the sea and the inland water.
    ///
    /// If the HDRP Water System is available it is used, because nothing else gives you real
    /// waves, foam, refraction and underwater scattering for free. If it is not enabled in your
    /// HDRP asset the tool falls back to a simple transparent plane so the world still reads
    /// correctly, and tells you what to switch on.
    /// </summary>
    public static class KontoWaterFactory
    {
        public const string RootName = "Konto Water";

        public static GameObject Build(KontoWorldData data, int maxLakes = 24)
        {
            var settings = data.Settings;
            var root = GameObject.Find(RootName);
            if (root != null) UnityEngine.Object.DestroyImmediate(root);
            root = new GameObject(RootName);

            Type waterType = HdrpReflection.FindType("WaterSurface");
            bool useHdrpWater = waterType != null;

            if (useHdrpWater) CreateHdrpOcean(root.transform, settings, waterType);
            else CreateFallbackOcean(root.transform, settings);

            int created = 0;
            foreach (var lake in data.Water.Lakes)
            {
                if (created >= maxLakes) break;
                // Skip puddles: they read as artefacts rather than as lakes.
                if (lake.RadiusWorld < 35f || lake.MaxDepth < settings.minLakeDepth) continue;

                if (useHdrpWater) CreateHdrpLake(root.transform, lake, waterType, created);
                else CreateFallbackLake(root.transform, lake, created);
                created++;
            }

            int riverCount = KontoRiverBuilder.Build(data, root.transform);

            Debug.Log(string.Format("[Konto] Water built: {0} ocean surface, {1} lakes, " + riverCount + " rivers.{2}",
                useHdrpWater ? "HDRP" : "fallback plane", created,
                useHdrpWater ? "" : " Enable Water in your HDRP Asset (Rendering > Water) and rebuild for the real thing."));
            return root;
        }

        // ---------------------------------------------------------------- HDRP water

        static void CreateHdrpOcean(Transform parent, KontoWorldSettings settings, Type waterType)
        {
            var go = new GameObject("Ocean");
            go.transform.SetParent(parent, false);
            // Sea level is y = 0 by definition everywhere in this world.
            go.transform.position = new Vector3(settings.WorldSize.x * 0.5f, 0f, settings.WorldSize.y * 0.5f);

            var water = go.AddComponent(waterType);
            HdrpReflection.SetMember(water, "surfaceType", "OceanSeaLake");
            HdrpReflection.SetMember(water, "geometryType", "Infinite");

            // A moderate open ocean swell running onto the coast, not a storm.
            HdrpReflection.SetMember(water, "repetitionSize", 500f);
            HdrpReflection.SetMember(water, "largeWindSpeed", 26f);
            HdrpReflection.SetMember(water, "largeOrientationValue", 315f);
            HdrpReflection.SetMember(water, "largeChaos", 0.82f);
            HdrpReflection.SetMember(water, "largeCurrentSpeedValue", 0.4f);
            HdrpReflection.SetMember(water, "ripplesWindSpeed", 12f);
            HdrpReflection.SetMember(water, "timeMultiplier", 1f);

            // Coastal Japanese water: green grey, not tropical blue.
            HdrpReflection.SetMember(water, "scatteringColor", new Color(0.02f, 0.10f, 0.11f));
            HdrpReflection.SetMember(water, "refractionColor", new Color(0.05f, 0.14f, 0.15f));
            HdrpReflection.SetMember(water, "absorptionDistance", 4.2f);
            HdrpReflection.SetMember(water, "maxRefractionDistance", 1.2f);
            HdrpReflection.SetMember(water, "foam", true);
            HdrpReflection.SetMember(water, "simulationFoamAmount", 0.55f);
            HdrpReflection.SetMember(water, "simulationFoamDrag", 0.35f);
            HdrpReflection.SetMember(water, "underWater", true);
            HdrpReflection.SetMember(water, "volumeHeight", 120f);
            HdrpReflection.SetMember(water, "volumeDepth", settings.seaDepth + 20f);
        }

        static void CreateHdrpLake(Transform parent, LakeInfo lake, Type waterType, int index)
        {
            var go = new GameObject(string.Format("Lake_{0:00}", index));
            go.transform.SetParent(parent, false);
            go.transform.position = new Vector3(lake.CenterWorld.x, lake.SurfaceHeight, lake.CenterWorld.y);

            var water = go.AddComponent(waterType);
            HdrpReflection.SetMember(water, "surfaceType", "OceanSeaLake");
            HdrpReflection.SetMember(water, "geometryType", "Quad");

            float sizeX = Mathf.Max(lake.BoundsWorld.width, 40f) * 1.15f;
            float sizeZ = Mathf.Max(lake.BoundsWorld.height, 40f) * 1.15f;
            HdrpReflection.SetMember(water, "quadSize", new Vector2(sizeX, sizeZ));

            // Inland water is glassier and darker than the sea.
            HdrpReflection.SetMember(water, "repetitionSize", 75f);
            HdrpReflection.SetMember(water, "largeWindSpeed", 5f);
            HdrpReflection.SetMember(water, "largeChaos", 0.45f);
            HdrpReflection.SetMember(water, "ripplesWindSpeed", 4f);
            HdrpReflection.SetMember(water, "scatteringColor", new Color(0.015f, 0.055f, 0.06f));
            HdrpReflection.SetMember(water, "refractionColor", new Color(0.03f, 0.09f, 0.10f));
            HdrpReflection.SetMember(water, "absorptionDistance", 2.4f);
            HdrpReflection.SetMember(water, "foam", false);
            HdrpReflection.SetMember(water, "underWater", true);
        }

        /// <summary>
        /// A single rectangle of water at a fixed height: a palace moat, a canal, a dock basin.
        /// Uses the HDRP water system where it is available and a transparent plane where it is
        /// not, so the city reads correctly either way.
        /// </summary>
        public static GameObject CreateWaterQuad(Transform parent, string name, Vector3 position,
            Vector2 size, float yawDegrees, bool calm)
        {
            Type waterType = HdrpReflection.FindType("WaterSurface");
            if (waterType == null)
            {
                var plane = GameObject.CreatePrimitive(PrimitiveType.Plane);
                plane.name = name + " (fallback plane)";
                plane.transform.SetParent(parent, false);
                plane.transform.position = position;
                plane.transform.rotation = Quaternion.Euler(0f, yawDegrees, 0f);
                // Unity's plane primitive is ten units across.
                plane.transform.localScale = new Vector3(Mathf.Max(1f, size.x) * 0.1f, 1f, Mathf.Max(1f, size.y) * 0.1f);
                plane.GetComponent<MeshRenderer>().sharedMaterial = FallbackMaterial();
                UnityEngine.Object.DestroyImmediate(plane.GetComponent<Collider>());
                return plane;
            }

            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.position = position;
            go.transform.rotation = Quaternion.Euler(0f, yawDegrees, 0f);

            var water = go.AddComponent(waterType);
            HdrpReflection.SetMember(water, "surfaceType", "OceanSeaLake");
            HdrpReflection.SetMember(water, "geometryType", "Quad");
            HdrpReflection.SetMember(water, "quadSize", new Vector2(Mathf.Max(2f, size.x), Mathf.Max(2f, size.y)));
            HdrpReflection.SetMember(water, "repetitionSize", calm ? 25f : 75f);
            HdrpReflection.SetMember(water, "largeWindSpeed", calm ? 2f : 5f);
            HdrpReflection.SetMember(water, "largeChaos", 0.3f);
            HdrpReflection.SetMember(water, "ripplesWindSpeed", calm ? 2.5f : 4f);
            // Still, dark, slightly green: a moat that has not been dredged since 1868.
            HdrpReflection.SetMember(water, "scatteringColor", new Color(0.012f, 0.045f, 0.040f));
            HdrpReflection.SetMember(water, "refractionColor", new Color(0.025f, 0.075f, 0.070f));
            HdrpReflection.SetMember(water, "absorptionDistance", 1.6f);
            HdrpReflection.SetMember(water, "foam", false);
            HdrpReflection.SetMember(water, "underWater", false);
            return go;
        }

        // ---------------------------------------------------------------- fallback

        static Material FallbackMaterial()
        {
            KontoAssetPaths.EnsureFolder(KontoAssetPaths.Materials);
            string path = KontoAssetPaths.Materials + "/Konto_WaterFallback.mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat != null) return mat;

            Shader shader = Shader.Find("HDRP/Lit") ?? Shader.Find("Standard");
            mat = new Material(shader) { name = "Konto_WaterFallback" };
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", new Color(0.05f, 0.14f, 0.16f, 0.82f));
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", new Color(0.05f, 0.14f, 0.16f, 0.82f));
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 0.96f);
            if (mat.HasProperty("_SurfaceType")) mat.SetFloat("_SurfaceType", 1f);   // transparent
            if (mat.HasProperty("_BlendMode")) mat.SetFloat("_BlendMode", 0f);
            if (mat.HasProperty("_ZWrite")) mat.SetFloat("_ZWrite", 0f);
            KontoMaterialUtil.ValidateHdrpMaterial(mat);
            mat.renderQueue = 3000;
            AssetDatabase.CreateAsset(mat, path);
            return mat;
        }

        static void CreateFallbackOcean(Transform parent, KontoWorldSettings settings)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Plane);
            go.name = "Ocean (fallback plane)";
            go.transform.SetParent(parent, false);
            go.transform.position = new Vector3(settings.WorldSize.x * 0.5f, 0f, settings.WorldSize.y * 0.5f);
            // Unity's plane primitive is 10 x 10 units, and the sea has to run past the island.
            float extent = Mathf.Max(settings.WorldSize.x, settings.WorldSize.y) * 0.3f;
            go.transform.localScale = new Vector3(extent, 1f, extent);
            go.GetComponent<MeshRenderer>().sharedMaterial = FallbackMaterial();
            UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());
        }

        static void CreateFallbackLake(Transform parent, LakeInfo lake, int index)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Plane);
            go.name = string.Format("Lake_{0:00} (fallback plane)", index);
            go.transform.SetParent(parent, false);
            go.transform.position = new Vector3(lake.CenterWorld.x, lake.SurfaceHeight, lake.CenterWorld.y);
            go.transform.localScale = new Vector3(
                Mathf.Max(lake.BoundsWorld.width, 40f) * 0.115f, 1f,
                Mathf.Max(lake.BoundsWorld.height, 40f) * 0.115f);
            go.GetComponent<MeshRenderer>().sharedMaterial = FallbackMaterial();
            UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());
        }
    }
}
