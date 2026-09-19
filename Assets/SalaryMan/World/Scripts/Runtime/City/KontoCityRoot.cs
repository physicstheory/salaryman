using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// The scene's handle on a city. Holds the plan and draws it in the editor: ward centres,
    /// the road and rail networks, the reserved sites and, close up, every plot boundary.
    /// Nothing here is needed at runtime beyond the layout reference itself.
    /// </summary>
    [AddComponentMenu("SalaryMan/Konto City")]
    public class KontoCityRoot : MonoBehaviour
    {
        public KontoCityLayoutAsset city;

        [Header("Gizmos")]
        public bool drawWards = true;
        public bool drawRoads = true;
        public bool drawRail = true;
        public bool drawReservations = true;
        public bool drawPlots = false;
        [Tooltip("Plots are only drawn within this distance of the scene camera, in metres. Drawing twenty thousand of them at once is not free.")]
        public float plotDrawRange = 420f;

        public CityLayout Layout { get { return city != null ? city.layout : null; } }

        void OnDrawGizmosSelected()
        {
            var layout = Layout;
            if (layout == null) return;

            if (drawWards)
            {
                for (int i = 0; i < layout.wards.Count; i++)
                {
                    var ward = layout.wards[i];
                    Gizmos.color = WardColour(ward.kind);
                    Gizmos.DrawWireSphere(new Vector3(ward.center.x, ward.groundY + 2f, ward.center.y), 14f);
                }
            }

            if (drawRoads)
            {
                for (int i = 0; i < layout.roads.Count; i++)
                {
                    var road = layout.roads[i];
                    Gizmos.color = road.klass == RoadClass.Expressway
                        ? new Color(1f, 0.55f, 0.2f)
                        : (road.klass == RoadClass.Arterial ? new Color(1f, 0.92f, 0.4f) : new Color(0.8f, 0.8f, 0.8f, 0.6f));
                    DrawPath(road.points, road.loop);
                }
            }

            if (drawRail)
            {
                for (int i = 0; i < layout.rails.Count; i++)
                {
                    var line = layout.rails[i];
                    Gizmos.color = line.klass == RailClass.Shinkansen
                        ? new Color(0.3f, 0.9f, 1f)
                        : (line.underground ? new Color(0.5f, 0.4f, 0.9f, 0.5f) : new Color(0.4f, 0.75f, 1f));
                    DrawPath(line.points, line.loop);
                }

                Gizmos.color = new Color(0.35f, 0.8f, 1f);
                for (int i = 0; i < layout.stations.Count; i++)
                {
                    var station = layout.stations[i];
                    Gizmos.matrix = Matrix4x4.TRS(station.WorldPosition, Quaternion.Euler(0f, station.rotation, 0f), Vector3.one);
                    Gizmos.DrawWireCube(new Vector3(0f, 4f, 0f), new Vector3(station.size.x, 8f, station.size.y));
                    Gizmos.matrix = Matrix4x4.identity;
                }
            }

            if (drawReservations)
            {
                Gizmos.color = new Color(1f, 0.45f, 0.2f);
                for (int i = 0; i < layout.reservations.Count; i++)
                {
                    var r = layout.reservations[i];
                    Gizmos.DrawWireSphere(new Vector3(r.center.x, 8f, r.center.y), Mathf.Max(12f, r.radius));
                }
            }

            if (drawPlots) DrawPlots(layout);
        }

        void DrawPlots(CityLayout layout)
        {
            Camera cam = Camera.current;
            Vector3 eye = cam != null ? cam.transform.position : transform.position;
            float rangeSqr = plotDrawRange * plotDrawRange;

            for (int i = 0; i < layout.plots.Count; i++)
            {
                var plot = layout.plots[i];
                Vector3 p = plot.WorldPosition;
                float dx = p.x - eye.x, dz = p.z - eye.z;
                if (dx * dx + dz * dz > rangeSqr) continue;

                Gizmos.color = PlotColour(plot.kind);
                Gizmos.matrix = Matrix4x4.TRS(p, Quaternion.Euler(0f, plot.rotation, 0f), Vector3.one);
                Gizmos.DrawWireCube(new Vector3(0f, 0.3f, 0f), new Vector3(plot.size.x, 0.6f, plot.size.y));
                Gizmos.matrix = Matrix4x4.identity;
            }
        }

        void DrawPath(System.Collections.Generic.List<Vector3> points, bool loop)
        {
            if (points == null || points.Count < 2) return;
            for (int i = 1; i < points.Count; i++) Gizmos.DrawLine(points[i - 1], points[i]);
            if (loop) Gizmos.DrawLine(points[points.Count - 1], points[0]);
        }

        public static Color WardColour(DistrictKind kind)
        {
            switch (kind)
            {
                case DistrictKind.CoreBusiness: return new Color(1f, 0.75f, 0.25f);
                case DistrictKind.StationFront: return new Color(1f, 0.6f, 0.5f);
                case DistrictKind.Retail: return new Color(1f, 0.55f, 0.75f);
                case DistrictKind.Nightlife: return new Color(0.95f, 0.3f, 0.6f);
                case DistrictKind.Office: return new Color(0.8f, 0.85f, 0.95f);
                case DistrictKind.Civic: return new Color(0.7f, 0.6f, 1f);
                case DistrictKind.Palace: return new Color(0.45f, 0.85f, 0.55f);
                case DistrictKind.Apartments: return new Color(0.7f, 0.8f, 0.6f);
                case DistrictKind.Residential: return new Color(0.85f, 0.85f, 0.7f);
                case DistrictKind.Suburb: return new Color(0.75f, 0.8f, 0.65f);
                case DistrictKind.Industrial: return new Color(0.6f, 0.55f, 0.5f);
                case DistrictKind.Port: return new Color(0.4f, 0.6f, 0.75f);
                case DistrictKind.Reclaimed: return new Color(0.5f, 0.75f, 0.85f);
                case DistrictKind.University: return new Color(0.65f, 0.75f, 1f);
                case DistrictKind.Park: return new Color(0.35f, 0.9f, 0.45f);
                case DistrictKind.Shrine: return new Color(0.9f, 0.45f, 0.35f);
                case DistrictKind.RailYard: return new Color(0.55f, 0.55f, 0.6f);
                case DistrictKind.Waterfront: return new Color(0.45f, 0.85f, 0.9f);
                default: return Color.white;
            }
        }

        public static Color PlotColour(PlotKind kind)
        {
            switch (kind)
            {
                case PlotKind.Landmark: return new Color(1f, 0.45f, 0.2f);
                case PlotKind.Tower: return new Color(1f, 0.82f, 0.35f);
                case PlotKind.Office: return new Color(0.85f, 0.9f, 1f, 0.8f);
                case PlotKind.Station: return new Color(0.35f, 0.8f, 1f);
                case PlotKind.Civic: return new Color(0.72f, 0.62f, 1f);
                case PlotKind.ParkSpace:
                case PlotKind.ShrineGround: return new Color(0.4f, 0.9f, 0.5f, 0.8f);
                case PlotKind.HouseCluster: return new Color(0.9f, 0.88f, 0.7f, 0.7f);
                case PlotKind.Factory:
                case PlotKind.Warehouse: return new Color(0.7f, 0.65f, 0.55f, 0.8f);
                case PlotKind.Wharf: return new Color(0.5f, 0.7f, 0.8f, 0.8f);
                case PlotKind.Parking: return new Color(0.6f, 0.6f, 0.6f, 0.6f);
                default: return new Color(0.9f, 0.9f, 0.9f, 0.7f);
            }
        }
    }
}
