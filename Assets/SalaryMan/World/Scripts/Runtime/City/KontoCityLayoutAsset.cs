using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// A built city's plan, saved as an asset. This is the handover: every ward, block, plot,
    /// road, railway, station and reserved site, in world space, addressable by name or code.
    ///
    /// Placing a building is one line, because the ground under every plot has already been
    /// graded flat at a known height:
    /// <code>
    /// layout.PlaceOnPlot(sotiTowerPrefab, "TKT-MRN-B012-P04");
    /// </code>
    /// </summary>
    [CreateAssetMenu(fileName = "KontoCityLayout", menuName = "SalaryMan/Konto City Layout", order = 2)]
    public class KontoCityLayoutAsset : ScriptableObject
    {
        public CityLayout layout = new CityLayout();

        [Tooltip("Written when the city was generated, for reference.")]
        public string builtFromSeed;

        public int PlotCount { get { return layout != null ? layout.plots.Count : 0; } }

        // ---------------------------------------------------------------- lookup

        public bool TryGetPlot(string plotCode, out CityPlot plot)
        {
            plot = default(CityPlot);
            return layout != null && layout.TryFindPlot(plotCode, out plot);
        }

        /// <summary>The plot a named reservation points at, e.g. "Soti Tower".</summary>
        public bool TryGetReservedPlot(string reservationName, out CityPlot plot)
        {
            plot = default(CityPlot);
            if (layout == null) return false;
            CityReservation reservation;
            if (!layout.TryFindReservation(reservationName, out reservation)) return false;
            return layout.TryGetPlot(reservation.plotId, out plot);
        }

        public List<CityPlot> PlotsOfKind(PlotKind kind)
        {
            return layout != null ? layout.PlotsOfKind(kind) : new List<CityPlot>();
        }

        public List<CityPlot> PlotsInWard(string wardName)
        {
            if (layout == null) return new List<CityPlot>();
            int index = layout.WardIndex(wardName);
            return index < 0 ? new List<CityPlot>() : layout.PlotsInWard(index);
        }

        /// <summary>The biggest plots first. Handy for "put the tallest thing we have somewhere good".</summary>
        public List<CityPlot> LargestPlots(PlotKind kind, int count)
        {
            var list = PlotsOfKind(kind);
            list.Sort((a, b) => b.Area.CompareTo(a.Area));
            if (list.Count > count) list.RemoveRange(count, list.Count - count);
            return list;
        }

        // ---------------------------------------------------------------- placement

        /// <summary>
        /// Drops a prefab onto a plot, centred, facing its street, standing on the graded ground.
        /// Returns null if the plot cannot be found.
        /// </summary>
        public GameObject PlaceOnPlot(GameObject prefab, string plotCode, Transform parent = null)
        {
            CityPlot plot;
            if (!TryGetPlot(plotCode, out plot)) return null;
            return PlaceOnPlot(prefab, plot, parent);
        }

        public GameObject PlaceOnPlot(GameObject prefab, in CityPlot plot, Transform parent = null)
        {
            if (prefab == null) return null;
            var instance = Instantiate(prefab, plot.WorldPosition, plot.WorldRotation, parent);
            instance.name = prefab.name + " (" + (layout != null ? layout.PlotCode(plot) : "plot") + ")";
            return instance;
        }

        /// <summary>Where a plot is and how it is turned, without needing the plot struct itself.</summary>
        public bool TryGetPlotTransform(string plotCode, out Vector3 position, out Quaternion rotation, out Vector2 size)
        {
            position = Vector3.zero;
            rotation = Quaternion.identity;
            size = Vector2.zero;
            CityPlot plot;
            if (!TryGetPlot(plotCode, out plot)) return false;
            position = plot.WorldPosition;
            rotation = plot.WorldRotation;
            size = plot.size;
            return true;
        }

        public string Summary()
        {
            return layout != null ? layout.Summary() : "No layout.";
        }
    }
}
