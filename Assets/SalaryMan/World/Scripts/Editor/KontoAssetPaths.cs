using System.IO;
using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>Where the build tools write everything they generate.</summary>
    public static class KontoAssetPaths
    {
        public const string Root = "Assets/SalaryMan/World/Generated";
        public const string Terrains = Root + "/Terrains";
        public const string Textures = Root + "/Textures";
        public const string Layers = Root + "/TerrainLayers";
        public const string Materials = Root + "/Materials";
        public const string Meshes = Root + "/Meshes";
        public const string Prefabs = Root + "/Prefabs";
        public const string Profiles = Root + "/VolumeProfiles";
        public const string Settings = "Assets/SalaryMan/World/Settings";

        public static void EnsureAll()
        {
            EnsureFolder(Root);
            EnsureFolder(Terrains);
            EnsureFolder(Textures);
            EnsureFolder(Layers);
            EnsureFolder(Materials);
            EnsureFolder(Meshes);
            EnsureFolder(Prefabs);
            EnsureFolder(Profiles);
            EnsureFolder(Settings);
        }

        public static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            string leaf = Path.GetFileName(path);
            if (!string.IsNullOrEmpty(parent) && !AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, leaf);
        }

        /// <summary>Creates or replaces an asset at a path, keeping the existing instance's GUID where possible.</summary>
        public static T SaveAsset<T>(T asset, string path) where T : Object
        {
            EnsureFolder(Path.GetDirectoryName(path).Replace('\\', '/'));
            var existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing != null && existing != asset)
            {
                EditorUtility.CopySerialized(asset, existing);
                EditorUtility.SetDirty(existing);
                return existing;
            }
            if (existing == null) AssetDatabase.CreateAsset(asset, path);
            return asset;
        }
    }
}
