using System;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// A baked piece of city geometry with the materials it needs and a note of which surface
    /// each submesh came from. The surface list is what lets the traffic and crowd systems tint
    /// one submesh — the paint, the shirt — per instance without a material per instance.
    /// </summary>
    [Serializable]
    public class CityMeshPiece
    {
        public Mesh mesh;
        public Material[] materials;
        public CitySurface[] surfaces;

        public bool Valid { get { return mesh != null && materials != null && materials.Length > 0; } }

        /// <summary>The submesh index a surface came out as, or -1 if this piece has none of it.</summary>
        public int IndexOf(CitySurface surface)
        {
            if (surfaces == null) return -1;
            for (int i = 0; i < surfaces.Length; i++)
                if (surfaces[i] == surface) return i;
            return -1;
        }
    }
}
