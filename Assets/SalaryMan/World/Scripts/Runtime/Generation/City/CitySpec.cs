using System;
using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// A bay bitten out of the coast where a city stands. Tokyo is unthinkable without its
    /// bay: it sets the shape of the city, it is where the reclaimed ground and the docks go,
    /// and it is the one direction the skyline opens out to.
    /// </summary>
    [Serializable]
    public class BaySpec
    {
        public bool carve = true;
        [Tooltip("Along coast offset of the bay mouth from the city anchor, in metres.")]
        public float alongOffset = 250f;
        [Tooltip("How far the head of the bay reaches inland from the city anchor, in metres. Negative values keep it out at sea.")]
        public float inlandReach = 520f;
        [Tooltip("Half width of the bay measured along the coast, in metres.")]
        public float halfWidth = 1750f;
        [Tooltip("Depth of the bay measured inland, in metres.")]
        public float depth = 1450f;
        [Tooltip("0 opens the bay wide to the sea, 1 closes it down to a narrow mouth like Tokyo Bay.")]
        [Range(0f, 1f)] public float enclosure = 0.62f;
        [Tooltip("Wobble on the bay shoreline, in metres. This is what turns a smooth ellipse into a coastline.")]
        public float shoreNoise = 190f;
        [Tooltip("How far offshore the bay floor behaves as being, in metres. Larger means deeper water: 560 gives a shallow, silty bay you could drop a pier into anywhere.")]
        public float waterDistance = 560f;
    }

    /// <summary>
    /// A city. The generator reserves the ground for it: the bay, the graded platform, the
    /// wards, the road and rail network and every building plot. No buildings are placed; that
    /// is a separate pass, driven by whatever art gets made for it.
    /// </summary>
    [Serializable]
    public class UrbanSiteSpec
    {
        public string name = "Tokonto";
        [Tooltip("Short code used in plot addresses, e.g. TKT-MRN-B012-P04.")]
        public string code = "TKT";
        [Tooltip("True for the capital: it gets the palace, the central terminus, the expressway ring and the tallest height allowance.")]
        public bool capital = true;

        [Header("Where")]
        [Tooltip("Position along the island arc (0 = north east tip, 1 = south west tip).")]
        [Range(0f, 1f)] public float alongT = 0.655f;
        [Tooltip("Sideways position as a fraction of the local island half width. Positive is the ocean side.")]
        public float lateral = 0.70f;

        [Header("How big")]
        [Tooltip("Half extent of the city measured along the coast, in metres. The city is this wide either side of its anchor.")]
        public float alongRadius = 3050f;
        [Tooltip("Half extent measured inland, in metres.")]
        public float inlandRadius = 1250f;
        [Tooltip("Radius of the central business district, in metres. The towers stand inside this.")]
        public float coreRadius = 760f;
        [Tooltip("Offset of the city centre from the anchor: x along the coast, y inland. Downtown usually sits at the head of the bay rather than in the middle of the footprint.")]
        public Vector2 coreOffset = new Vector2(-260f, 420f);
        [Tooltip("Wobble on the city outline, in metres. Cities stop raggedly, against hills and rivers, not on a smooth curve.")]
        public float outlineNoise = 420f;
        [Tooltip("Number of wards. Each one gets its own name, character, street grid and orientation.")]
        [Range(4, 40)] public int wardCount = 22;

        [Header("Ground works")]
        [Tooltip("Steepest gradient the graded city platform is allowed to reach, as a rise over run. Tokyo's hilly wards sit around 1:12.")]
        [Range(0.01f, 0.25f)] public float maxPlatformSlope = 0.085f;
        [Tooltip("Natural ground steeper than this is left alone: green hillside inside the city outline. A rise over run, so 0.30 is about 17 degrees.")]
        [Range(0.05f, 0.7f)] public float maxBuildSlope = 0.30f;
        [Tooltip("The city thins out toward this altitude and stops at it, in metres. A capital on a coastal plain wants 330; a mountain village needs it well above its own valley floor.")]
        public float maxBuildAltitude = 330f;
        [Tooltip("Radius, in metres, over which the natural ground is smoothed before the city is laid on it.")]
        public float gradingSmoothRadius = 55f;
        [Tooltip("Width of the band over which the graded platform blends back into open country, in metres.")]
        public float gradingFeather = 190f;
        [Tooltip("Height of reclaimed ground above sea level, in metres.")]
        public float reclaimHeight = 4.2f;
        [Tooltip("Build reclaimed islands and quays out in the bay.")]
        public bool reclaimBay = true;
        [Tooltip("Height of the flood embankments along the rivers where they run through the city, in metres above the channel.")]
        public float leveeHeight = 4.5f;

        [Header("Signature ground")]
        [Tooltip("Reserve a moated palace park at the centre, the way the Imperial Palace sits in the middle of Tokyo.")]
        public bool palaceGardens = true;
        public float palaceRadius = 470f;
        public float moatWidth = 58f;
        [Tooltip("Reserve an airport on the reclaimed ground. Off by default: it eats a lot of the bay.")]
        public bool airport = false;

        [Header("Networks")]
        [Tooltip("Number of arterial roads radiating out of the core.")]
        [Range(3, 16)] public int radialCount = 9;
        [Tooltip("Number of ring roads around the core.")]
        [Range(0, 5)] public int ringCount = 3;
        [Tooltip("Build the elevated urban expressway loop and its spurs.")]
        public bool expressway = true;
        [Tooltip("Number of commuter lines radiating out of the central terminus.")]
        [Range(0, 10)] public int railRadialCount = 6;
        [Tooltip("Build the commuter loop line around the core, the way the Yamanote line rings central Tokyo.")]
        public bool railLoop = true;
        public bool shinkansen = true;

        public BaySpec bay = new BaySpec();

        /// <summary>Total footprint area in square kilometres, before the bay and the hills are taken out of it.</summary>
        public float FootprintAreaKm2
        {
            get { return Mathf.PI * alongRadius * inlandRadius / 1000000f; }
        }
    }

    /// <summary>
    /// The rules for one kind of district. Everything that makes a Tokyo ward look like itself
    /// rather than like a generic city block is in here: how far apart the streets are, how big
    /// the parcels are, how much of a parcel gets built on and how tall it is allowed to go.
    /// </summary>
    public sealed class DistrictProfile
    {
        public DistrictKind kind;
        public ParcelMode parcels = ParcelMode.Individual;
        /// <summary>Spacing of the local street grid, in metres.</summary>
        public float blockSpacingMin = 70f;
        public float blockSpacingMax = 110f;
        /// <summary>Target parcel frontage and depth, in metres.</summary>
        public float plotSizeMin = 24f;
        public float plotSizeMax = 40f;
        /// <summary>0 = every street runs where the ground says it should, 1 = a rigid drawing board grid.</summary>
        public float gridRegularity = 0.75f;
        /// <summary>Floors allowed, before the distance-to-core bonus.</summary>
        public int minFloors = 2;
        public int maxFloors = 6;
        /// <summary>Fraction of blocks left as a park, a car park or a shrine instead of being built on.</summary>
        public float openSpaceShare = 0.06f;
        /// <summary>Street width in metres, for the local streets inside the district.</summary>
        public float streetWidth = 9f;
        /// <summary>How much of the city's ground this kind of district wants, used to allocate wards.</summary>
        public float wardShare = 1f;

        public float MidFloors { get { return (minFloors + maxFloors) * 0.5f; } }
    }

    /// <summary>The district rule table. One entry per <see cref="DistrictKind"/>.</summary>
    public static class DistrictProfiles
    {
        static DistrictProfile[] _table;

        public static DistrictProfile Get(DistrictKind kind)
        {
            if (_table == null) _table = Build();
            int i = (int)kind;
            if (i < 0 || i >= _table.Length) return _table[(int)DistrictKind.Residential];
            return _table[i];
        }

        static DistrictProfile[] Build()
        {
            var list = new List<DistrictProfile>();

            Add(list, new DistrictProfile
            {
                kind = DistrictKind.CoreBusiness, parcels = ParcelMode.Individual,
                blockSpacingMin = 115f, blockSpacingMax = 165f, plotSizeMin = 48f, plotSizeMax = 92f,
                gridRegularity = 0.92f, minFloors = 14, maxFloors = 54, openSpaceShare = 0.10f,
                streetWidth = 16f, wardShare = 0.7f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.StationFront, parcels = ParcelMode.Individual,
                blockSpacingMin = 68f, blockSpacingMax = 105f, plotSizeMin = 18f, plotSizeMax = 44f,
                gridRegularity = 0.62f, minFloors = 5, maxFloors = 22, openSpaceShare = 0.07f,
                streetWidth = 11f, wardShare = 0.8f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.Retail, parcels = ParcelMode.Individual,
                blockSpacingMin = 72f, blockSpacingMax = 112f, plotSizeMin = 16f, plotSizeMax = 38f,
                gridRegularity = 0.7f, minFloors = 3, maxFloors = 12, openSpaceShare = 0.05f,
                streetWidth = 10f, wardShare = 1.1f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.Nightlife, parcels = ParcelMode.Individual,
                blockSpacingMin = 48f, blockSpacingMax = 76f, plotSizeMin = 9f, plotSizeMax = 20f,
                gridRegularity = 0.45f, minFloors = 3, maxFloors = 9, openSpaceShare = 0.02f,
                streetWidth = 6.5f, wardShare = 0.5f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.Office, parcels = ParcelMode.Individual,
                blockSpacingMin = 88f, blockSpacingMax = 130f, plotSizeMin = 30f, plotSizeMax = 58f,
                gridRegularity = 0.82f, minFloors = 6, maxFloors = 18, openSpaceShare = 0.08f,
                streetWidth = 13f, wardShare = 1.2f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.Civic, parcels = ParcelMode.Individual,
                blockSpacingMin = 130f, blockSpacingMax = 190f, plotSizeMin = 60f, plotSizeMax = 120f,
                gridRegularity = 0.88f, minFloors = 3, maxFloors = 11, openSpaceShare = 0.26f,
                streetWidth = 15f, wardShare = 0.5f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.Palace, parcels = ParcelMode.Block,
                blockSpacingMin = 220f, blockSpacingMax = 300f, plotSizeMin = 120f, plotSizeMax = 220f,
                gridRegularity = 0.3f, minFloors = 1, maxFloors = 2, openSpaceShare = 0.92f,
                streetWidth = 8f, wardShare = 0.35f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.Apartments, parcels = ParcelMode.Individual,
                blockSpacingMin = 82f, blockSpacingMax = 125f, plotSizeMin = 26f, plotSizeMax = 52f,
                gridRegularity = 0.7f, minFloors = 4, maxFloors = 14, openSpaceShare = 0.12f,
                streetWidth = 9.5f, wardShare = 1.5f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.Residential, parcels = ParcelMode.Block,
                blockSpacingMin = 56f, blockSpacingMax = 92f, plotSizeMin = 40f, plotSizeMax = 80f,
                gridRegularity = 0.5f, minFloors = 2, maxFloors = 4, openSpaceShare = 0.09f,
                streetWidth = 6f, wardShare = 2.4f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.Suburb, parcels = ParcelMode.Block,
                blockSpacingMin = 76f, blockSpacingMax = 130f, plotSizeMin = 55f, plotSizeMax = 110f,
                gridRegularity = 0.42f, minFloors = 1, maxFloors = 3, openSpaceShare = 0.14f,
                streetWidth = 6.5f, wardShare = 2.0f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.Industrial, parcels = ParcelMode.Individual,
                blockSpacingMin = 130f, blockSpacingMax = 200f, plotSizeMin = 55f, plotSizeMax = 130f,
                gridRegularity = 0.8f, minFloors = 1, maxFloors = 4, openSpaceShare = 0.08f,
                streetWidth = 12f, wardShare = 1.0f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.Port, parcels = ParcelMode.Individual,
                blockSpacingMin = 170f, blockSpacingMax = 260f, plotSizeMin = 70f, plotSizeMax = 180f,
                gridRegularity = 0.9f, minFloors = 1, maxFloors = 3, openSpaceShare = 0.1f,
                streetWidth = 14f, wardShare = 0.7f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.Reclaimed, parcels = ParcelMode.Individual,
                blockSpacingMin = 150f, blockSpacingMax = 230f, plotSizeMin = 60f, plotSizeMax = 150f,
                gridRegularity = 0.96f, minFloors = 3, maxFloors = 30, openSpaceShare = 0.22f,
                streetWidth = 16f, wardShare = 0.8f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.University, parcels = ParcelMode.Individual,
                blockSpacingMin = 150f, blockSpacingMax = 210f, plotSizeMin = 55f, plotSizeMax = 120f,
                gridRegularity = 0.75f, minFloors = 3, maxFloors = 9, openSpaceShare = 0.34f,
                streetWidth = 9f, wardShare = 0.45f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.Park, parcels = ParcelMode.Block,
                blockSpacingMin = 180f, blockSpacingMax = 260f, plotSizeMin = 110f, plotSizeMax = 200f,
                gridRegularity = 0.25f, minFloors = 1, maxFloors = 2, openSpaceShare = 0.88f,
                streetWidth = 7f, wardShare = 0.6f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.Shrine, parcels = ParcelMode.Block,
                blockSpacingMin = 150f, blockSpacingMax = 210f, plotSizeMin = 80f, plotSizeMax = 150f,
                gridRegularity = 0.3f, minFloors = 1, maxFloors = 2, openSpaceShare = 0.78f,
                streetWidth = 7f, wardShare = 0.3f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.RailYard, parcels = ParcelMode.Block,
                blockSpacingMin = 200f, blockSpacingMax = 280f, plotSizeMin = 90f, plotSizeMax = 200f,
                gridRegularity = 0.95f, minFloors = 1, maxFloors = 2, openSpaceShare = 0.5f,
                streetWidth = 10f, wardShare = 0.35f,
            });
            Add(list, new DistrictProfile
            {
                kind = DistrictKind.Waterfront, parcels = ParcelMode.Individual,
                blockSpacingMin = 92f, blockSpacingMax = 140f, plotSizeMin = 30f, plotSizeMax = 70f,
                gridRegularity = 0.78f, minFloors = 2, maxFloors = 12, openSpaceShare = 0.2f,
                streetWidth = 12f, wardShare = 0.6f,
            });

            // Index by enum value so Get() is a straight array lookup.
            int count = 0;
            foreach (var p in list) count = Mathf.Max(count, (int)p.kind + 1);
            var table = new DistrictProfile[count];
            foreach (var p in list) table[(int)p.kind] = p;
            for (int i = 0; i < table.Length; i++)
            {
                if (table[i] != null) continue;
                table[i] = new DistrictProfile { kind = (DistrictKind)i };
            }
            return table;
        }

        static void Add(List<DistrictProfile> list, DistrictProfile p) { list.Add(p); }
    }
}
