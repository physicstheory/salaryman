using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Sits in the scene on a reserved plot. The transform is already at the plot's centre,
    /// facing its street frontage, standing on the graded ground, so a building prefab parented
    /// to it at zero needs no further placing.
    /// </summary>
    [AddComponentMenu("SalaryMan/Konto City Plot Marker")]
    public class CityPlotMarker : MonoBehaviour
    {
        public string plotCode = "";
        public string wardName = "";
        public PlotKind kind = PlotKind.Vacant;
        [Tooltip("Frontage and depth of the plot, in metres.")]
        public Vector2 size = new Vector2(20f, 20f);
        [Tooltip("Floors the plan allows here.")]
        public int maxFloors = 4;
        [Tooltip("Height allowance in metres.")]
        public float maxHeight = 14f;
        public bool corner;
        [Tooltip("What this plot is reserved for, if it is a named site.")]
        public string reservedFor = "";

        public Color GizmoColour
        {
            get
            {
                switch (kind)
                {
                    case PlotKind.Landmark: return new Color(1f, 0.45f, 0.2f);
                    case PlotKind.Tower: return new Color(1f, 0.8f, 0.3f);
                    case PlotKind.Station: return new Color(0.35f, 0.8f, 1f);
                    case PlotKind.Civic: return new Color(0.7f, 0.6f, 1f);
                    case PlotKind.ParkSpace:
                    case PlotKind.ShrineGround: return new Color(0.4f, 0.9f, 0.5f);
                    default: return new Color(0.85f, 0.85f, 0.85f);
                }
            }
        }

        void OnDrawGizmos()
        {
            Gizmos.color = GizmoColour;
            Gizmos.matrix = Matrix4x4.TRS(transform.position, transform.rotation, Vector3.one);
            Gizmos.DrawWireCube(new Vector3(0f, 0.2f, 0f), new Vector3(size.x, 0.4f, size.y));
            Gizmos.matrix = Matrix4x4.identity;
        }

        void OnDrawGizmosSelected()
        {
            Gizmos.color = GizmoColour;
            Gizmos.matrix = Matrix4x4.TRS(transform.position, transform.rotation, Vector3.one);
            // The volume the plan allows: footprint by height allowance.
            Gizmos.DrawWireCube(new Vector3(0f, maxHeight * 0.5f, 0f), new Vector3(size.x, maxHeight, size.y));
            Gizmos.matrix = Matrix4x4.identity;
        }
    }
}
