using System;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>Tree species slots. The order matters: it is the terrain tree prototype order.</summary>
    public enum KontoTreeSpecies
    {
        Sugi = 0,       // Japanese cedar. Narrow, dark, planted in dense rows on the lower slopes.
        Hinoki = 1,     // Cypress. Mixed into the plantations, slightly lighter and broader.
        Konara = 2,     // Oak. The natural broadleaf of the satoyama hills.
        Momiji = 3,     // Maple. Valley sides and stream banks; the autumn colour.
        Matsu = 4,      // Pine. Coastal dunes, dry ridges, windswept headlands.
        Shirakaba = 5,  // Birch. Subalpine, just below the tree line.
        Take = 6,       // Moso bamboo. Groves on damp valley floors near where people live.
    }

    [Serializable]
    public class TreeSpeciesEntry
    {
        public string name = "Species";
        public GameObject prefab;
        public float minScale = 0.85f;
        public float maxScale = 1.35f;
        [Range(0f, 1f)] public float bendFactor = 0.15f;
        [Tooltip("Extra vertical stretch. Sugi are tall and thin, konara are broad and low.")]
        public float heightStretch = 1f;
    }

    [Serializable]
    public class DetailEntry
    {
        public string name = "Detail";
        public Texture2D billboardTexture;
        public GameObject meshPrefab;
        public Color healthyColor = new Color(0.42f, 0.55f, 0.24f);
        public Color dryColor = new Color(0.62f, 0.58f, 0.32f);
        public float minWidth = 0.7f;
        public float maxWidth = 1.5f;
        public float minHeight = 0.6f;
        public float maxHeight = 1.4f;
        [Range(0f, 1f)] public float noiseSpread = 0.35f;
        [Tooltip("Peak instance count per detail cell.")]
        public int maxDensity = 7;
    }

    /// <summary>
    /// The art side of the world build. Everything here is a slot you fill with your own
    /// assets; the editor tools can generate stand-in prefabs and textures so the world is
    /// walkable before any art exists.
    /// </summary>
    [CreateAssetMenu(fileName = "KontoFoliageLibrary", menuName = "SalaryMan/Konto Foliage Library", order = 1)]
    public class KontoFoliageLibrary : ScriptableObject
    {
        [Header("Trees, in KontoTreeSpecies order")]
        public TreeSpeciesEntry[] trees = new TreeSpeciesEntry[]
        {
            new TreeSpeciesEntry { name = "Sugi (cedar)",     minScale = 0.85f, maxScale = 1.25f, heightStretch = 1.25f },
            new TreeSpeciesEntry { name = "Hinoki (cypress)", minScale = 0.8f,  maxScale = 1.2f,  heightStretch = 1.12f },
            new TreeSpeciesEntry { name = "Konara (oak)",     minScale = 0.9f,  maxScale = 1.45f, heightStretch = 0.92f },
            new TreeSpeciesEntry { name = "Momiji (maple)",   minScale = 0.7f,  maxScale = 1.15f, heightStretch = 0.85f },
            new TreeSpeciesEntry { name = "Matsu (pine)",     minScale = 0.75f, maxScale = 1.3f,  heightStretch = 0.95f },
            new TreeSpeciesEntry { name = "Shirakaba (birch)",minScale = 0.65f, maxScale = 1.05f, heightStretch = 1.0f  },
            new TreeSpeciesEntry { name = "Take (bamboo)",    minScale = 0.9f,  maxScale = 1.2f,  heightStretch = 1.3f  },
        };

        [Header("Ground detail layers")]
        public DetailEntry[] details = new DetailEntry[]
        {
            new DetailEntry { name = "Short grass", healthyColor = new Color(0.40f, 0.54f, 0.24f), dryColor = new Color(0.58f, 0.56f, 0.30f), minWidth = 0.55f, maxWidth = 1.1f, minHeight = 0.35f, maxHeight = 0.8f,  maxDensity = 9 },
            new DetailEntry { name = "Susuki (tall grass)", healthyColor = new Color(0.52f, 0.55f, 0.30f), dryColor = new Color(0.72f, 0.65f, 0.38f), minWidth = 0.8f, maxWidth = 1.6f, minHeight = 0.9f, maxHeight = 1.7f, maxDensity = 5 },
            new DetailEntry { name = "Reeds", healthyColor = new Color(0.36f, 0.50f, 0.26f), dryColor = new Color(0.60f, 0.58f, 0.34f), minWidth = 0.6f, maxWidth = 1.2f, minHeight = 0.8f, maxHeight = 1.5f, maxDensity = 6 },
            new DetailEntry { name = "Shida (fern)", healthyColor = new Color(0.28f, 0.44f, 0.22f), dryColor = new Color(0.40f, 0.46f, 0.24f), minWidth = 0.7f, maxWidth = 1.3f, minHeight = 0.5f, maxHeight = 1.0f, maxDensity = 5 },
        };

        public const int DetailShortGrass = 0;
        public const int DetailTallGrass = 1;
        public const int DetailReeds = 2;
        public const int DetailFern = 3;

        public bool HasAnyTreePrefab()
        {
            if (trees == null) return false;
            foreach (var t in trees) if (t != null && t.prefab != null) return true;
            return false;
        }

        public bool HasAnyDetail()
        {
            if (details == null) return false;
            foreach (var d in details) if (d != null && (d.billboardTexture != null || d.meshPrefab != null)) return true;
            return false;
        }
    }
}
