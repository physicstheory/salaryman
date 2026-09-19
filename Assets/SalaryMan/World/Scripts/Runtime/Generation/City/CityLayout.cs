using System;
using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>One ward of the city: a named area with a single character and its own street grid.</summary>
    [Serializable]
    public class CityWard
    {
        public string name = "Ward";
        [Tooltip("Three letter code used in plot addresses.")]
        public string code = "WRD";
        public DistrictKind kind = DistrictKind.Residential;
        [Tooltip("World space centre of the ward, on the XZ plane.")]
        public Vector2 center;
        [Tooltip("Nominal radius in metres. Ward boundaries are decided by nearest centre, so this is only a hint for gizmos.")]
        public float radius = 300f;
        [Tooltip("Rotation of this ward's street grid, in degrees. Every ward of a Japanese city points a slightly different way, which is most of why the map reads as a real place.")]
        public float gridAngle;
        [Tooltip("0 at the city edge, 1 at the centre. Drives how tall the ward is allowed to build.")]
        public float coreness;
        public int firstBlock;
        public int blockCount;
        public int plotCount;
        [Tooltip("Ground elevation at the ward centre, in metres.")]
        public float groundY;
    }

    /// <summary>A city block: the ground enclosed by streets, holding one or more plots.</summary>
    [Serializable]
    public struct CityBlock
    {
        public int id;
        public int ward;
        [Tooltip("Number of this block inside its own ward, which is what the plot address uses.")]
        public int wardBlockNumber;
        public Vector2 center;      // world XZ
        public Vector2 size;        // metres, before rotation
        public float rotation;      // degrees, clockwise from world +X
        public int firstPlot;
        public int plotCount;
    }

    /// <summary>
    /// A reserved building plot: flat ground, fronting a street, with a height allowance. This
    /// is the unit the city is handed over in. Dropping a building here needs nothing but the
    /// plot's centre, rotation and ground height.
    /// </summary>
    [Serializable]
    public struct CityPlot
    {
        public int id;
        public int ward;
        public int block;
        public int indexInBlock;
        [Tooltip("World space centre on the XZ plane.")]
        public Vector2 center;
        [Tooltip("Frontage (x) and depth (z) in metres, before rotation.")]
        public Vector2 size;
        [Tooltip("Rotation in degrees. The plot's local +Z points into the plot from its street frontage.")]
        public float rotation;
        [Tooltip("Graded ground elevation in metres. The terrain is flat across the whole plot at this height.")]
        public float groundY;
        public PlotKind kind;
        [Tooltip("Floors allowed here. A hint, taken from the district and the distance to the centre.")]
        public int maxFloors;
        [Tooltip("Height allowance in metres, matching maxFloors.")]
        public float maxHeight;
        [Tooltip("True where two streets meet: the plot that wants the shop front, or the bank.")]
        public bool corner;

        public float Area { get { return size.x * size.y; } }
        public Vector3 WorldPosition { get { return new Vector3(center.x, groundY, center.y); } }
        /// <summary>Rotation as a Unity yaw, for dropping a prefab straight in.</summary>
        public Quaternion WorldRotation { get { return Quaternion.Euler(0f, rotation, 0f); } }
    }

    /// <summary>A road, as a centre line with a width. Y values are filled in by the grading pass.</summary>
    [Serializable]
    public class CityRoad
    {
        public string name = "Road";
        public RoadClass klass = RoadClass.Street;
        public float halfWidth = 5f;
        [Tooltip("True for the elevated expressway: no ground is graded for it, it wants piers and a deck.")]
        public bool elevated;
        [Tooltip("Height of the deck above the ground it crosses, in metres, for elevated roads.")]
        public float deckClearance = 11f;
        public List<Vector3> points = new List<Vector3>();
        public bool loop;

        public float Length
        {
            get
            {
                float d = 0f;
                for (int i = 1; i < points.Count; i++)
                {
                    Vector2 a = new Vector2(points[i - 1].x, points[i - 1].z);
                    Vector2 b = new Vector2(points[i].x, points[i].z);
                    d += Vector2.Distance(a, b);
                }
                return d;
            }
        }
    }

    /// <summary>A railway. Commuting is the whole premise of this game, so the network is laid out first class.</summary>
    [Serializable]
    public class CityRail
    {
        public string name = "Line";
        public RailClass klass = RailClass.Radial;
        public float halfWidth = 6.5f;
        public bool elevated;
        public bool underground;
        public float deckClearance = 9f;
        public List<Vector3> points = new List<Vector3>();
        public bool loop;
        public List<int> stationIds = new List<int>();
    }

    /// <summary>A station: reserved ground for the box, the platforms and the plaza in front of it.</summary>
    [Serializable]
    public struct CityStation
    {
        public int id;
        public string name;
        public int ward;
        public Vector2 center;
        public Vector2 size;
        public float rotation;
        public float groundY;
        public bool terminus;
        public bool elevated;
        public int platformCount;
        public int plotId;          // the reserved Station plot, or -1
        public Vector3 WorldPosition { get { return new Vector3(center.x, groundY, center.y); } }
    }

    /// <summary>Where a road or a railway crosses water. Reserved for a bridge; no ground is graded across the span.</summary>
    [Serializable]
    public struct CityBridge
    {
        public string name;
        public bool rail;
        public int pathIndex;       // index into roads or rails
        public Vector2 from;
        public Vector2 to;
        public float deckY;
        public float halfWidth;
        public float Length { get { return Vector2.Distance(from, to); } }
    }

    /// <summary>
    /// Made ground: a rectangle of the bay filled to above sea level. Container terminals,
    /// exhibition halls and the newest towers all stand on this in a real Japanese port city.
    /// </summary>
    [Serializable]
    public struct CityFill
    {
        public string name;
        public Vector2 center;
        public Vector2 size;
        public float rotation;
        [Tooltip("Finished level of the made ground, in metres above sea level.")]
        public float height;
    }

    /// <summary>
    /// A piece of city water that the island's own hydrology knows nothing about: a palace
    /// moat, a cut canal, a dock basin. The builder puts a water surface on each one.
    /// </summary>
    [Serializable]
    public struct CityWaterBody
    {
        public string name;
        public Vector2 center;
        public Vector2 size;
        public float rotation;
        [Tooltip("Water surface height in metres above sea level.")]
        public float surfaceY;
    }

    /// <summary>A named piece of ground the story needs: the head office site, the terminus, the palace.</summary>
    [Serializable]
    public struct CityReservation
    {
        public string name;
        public string note;
        public int plotId;
        public Vector2 center;
        public float radius;
    }

    /// <summary>
    /// Everything the city pass produced, in world space. Saved as an asset so the rest of the
    /// project can address any piece of the city by name or by code without regenerating it.
    /// </summary>
    [Serializable]
    public class CityLayout
    {
        public string name = "Tokonto";
        public string code = "TKT";
        public int seed;
        [Tooltip("World space centre of the city on the XZ plane.")]
        public Vector2 center;
        [Tooltip("World space centre of the central business district.")]
        public Vector2 coreCenter;
        public Vector2 alongAxis = Vector2.right;   // unit vector, along the coast
        public Vector2 inlandAxis = Vector2.up;     // unit vector, pointing inland
        public float alongRadius;
        public float inlandRadius;
        public Rect bounds;

        public List<CityWard> wards = new List<CityWard>();
        public List<CityBlock> blocks = new List<CityBlock>();
        public List<CityPlot> plots = new List<CityPlot>();
        public List<CityRoad> roads = new List<CityRoad>();
        public List<CityRail> rails = new List<CityRail>();
        public List<CityStation> stations = new List<CityStation>();
        public List<CityBridge> bridges = new List<CityBridge>();
        public List<CityReservation> reservations = new List<CityReservation>();
        public List<CityFill> fills = new List<CityFill>();
        public List<CityWaterBody> waters = new List<CityWaterBody>();

        // ---------------------------------------------------------------- addressing

        /// <summary>The address of a plot, e.g. TKT-MRN-B012-P04.</summary>
        public string PlotCode(in CityPlot plot)
        {
            string wardCode = plot.ward >= 0 && plot.ward < wards.Count ? wards[plot.ward].code : "XXX";
            int blockNumber = plot.block >= 0 && plot.block < blocks.Count ? blocks[plot.block].wardBlockNumber : 0;
            return string.Format("{0}-{1}-B{2:000}-P{3:00}", code, wardCode, blockNumber, plot.indexInBlock);
        }

        /// <summary>Finds a plot by its address. Case and spacing are ignored.</summary>
        public bool TryFindPlot(string plotCode, out CityPlot plot)
        {
            plot = default(CityPlot);
            if (string.IsNullOrEmpty(plotCode)) return false;
            string wanted = plotCode.Replace(" ", "").ToUpperInvariant();
            for (int i = 0; i < plots.Count; i++)
            {
                if (PlotCode(plots[i]).ToUpperInvariant() != wanted) continue;
                plot = plots[i];
                return true;
            }
            return false;
        }

        public bool TryGetPlot(int id, out CityPlot plot)
        {
            plot = default(CityPlot);
            if (id < 0 || id >= plots.Count) return false;
            plot = plots[id];
            return plot.id == id;
        }

        public CityWard FindWard(string wardName)
        {
            if (string.IsNullOrEmpty(wardName)) return null;
            for (int i = 0; i < wards.Count; i++)
            {
                if (string.Equals(wards[i].name, wardName, StringComparison.OrdinalIgnoreCase)) return wards[i];
                if (string.Equals(wards[i].code, wardName, StringComparison.OrdinalIgnoreCase)) return wards[i];
            }
            return null;
        }

        public int WardIndex(string wardName)
        {
            for (int i = 0; i < wards.Count; i++)
            {
                if (string.Equals(wards[i].name, wardName, StringComparison.OrdinalIgnoreCase)) return i;
                if (string.Equals(wards[i].code, wardName, StringComparison.OrdinalIgnoreCase)) return i;
            }
            return -1;
        }

        // ---------------------------------------------------------------- queries

        public List<CityPlot> PlotsInWard(int wardIndex)
        {
            var result = new List<CityPlot>();
            for (int i = 0; i < plots.Count; i++) if (plots[i].ward == wardIndex) result.Add(plots[i]);
            return result;
        }

        public List<CityPlot> PlotsOfKind(PlotKind kind)
        {
            var result = new List<CityPlot>();
            for (int i = 0; i < plots.Count; i++) if (plots[i].kind == kind) result.Add(plots[i]);
            return result;
        }

        /// <summary>The plot nearest a world position, optionally restricted to one kind.</summary>
        public bool TryFindNearestPlot(Vector2 worldXZ, out CityPlot plot, PlotKind? kind = null)
        {
            plot = default(CityPlot);
            float best = float.MaxValue;
            bool found = false;
            for (int i = 0; i < plots.Count; i++)
            {
                if (kind.HasValue && plots[i].kind != kind.Value) continue;
                float d = (plots[i].center - worldXZ).sqrMagnitude;
                if (d >= best) continue;
                best = d;
                plot = plots[i];
                found = true;
            }
            return found;
        }

        public bool TryFindStation(string stationName, out CityStation station)
        {
            station = default(CityStation);
            if (string.IsNullOrEmpty(stationName)) return false;
            for (int i = 0; i < stations.Count; i++)
            {
                if (stations[i].name == null) continue;
                if (stations[i].name.IndexOf(stationName, StringComparison.OrdinalIgnoreCase) < 0) continue;
                station = stations[i];
                return true;
            }
            return false;
        }

        public bool TryFindReservation(string reservationName, out CityReservation reservation)
        {
            reservation = default(CityReservation);
            if (string.IsNullOrEmpty(reservationName)) return false;
            for (int i = 0; i < reservations.Count; i++)
            {
                if (reservations[i].name == null) continue;
                if (reservations[i].name.IndexOf(reservationName, StringComparison.OrdinalIgnoreCase) < 0) continue;
                reservation = reservations[i];
                return true;
            }
            return false;
        }

        /// <summary>Total reserved plot area in square kilometres.</summary>
        public float PlotAreaKm2
        {
            get
            {
                float a = 0f;
                for (int i = 0; i < plots.Count; i++) a += plots[i].Area;
                return a / 1000000f;
            }
        }

        public float RoadLengthKm
        {
            get
            {
                float d = 0f;
                for (int i = 0; i < roads.Count; i++) d += roads[i].Length;
                return d / 1000f;
            }
        }

        public float RailLengthKm
        {
            get
            {
                float d = 0f;
                for (int i = 0; i < rails.Count; i++)
                {
                    var r = rails[i];
                    for (int k = 1; k < r.points.Count; k++)
                    {
                        Vector2 a = new Vector2(r.points[k - 1].x, r.points[k - 1].z);
                        Vector2 b = new Vector2(r.points[k].x, r.points[k].z);
                        d += Vector2.Distance(a, b);
                    }
                }
                return d / 1000f;
            }
        }

        public string Summary()
        {
            return string.Format(
                "{0}: {1} wards, {2} blocks, {3} plots ({4:0.00} km² of building ground), {5:0.0} km of road, {6:0.0} km of rail, {7} stations, {8} bridges.",
                name, wards.Count, blocks.Count, plots.Count, PlotAreaKm2, RoadLengthKm, RailLengthKm, stations.Count, bridges.Count);
        }
    }
}
