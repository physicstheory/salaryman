using System;
using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// A range of mountains laid out along the island's tectonic arc, the way the Ou Mountains,
    /// the Japanese Alps and the Chugoku range sit along Honshu.
    /// </summary>
    [Serializable]
    public class MountainRangeSpec
    {
        public string name = "Range";
        [Tooltip("Where the range starts and ends along the island arc (0 = north east tip, 1 = south west tip).")]
        public float alongStart = 0f;
        public float alongEnd = 0.4f;
        [Tooltip("Sideways offset from the arc axis, as a fraction of the local island half width. Negative is the Sea of Konto (north west) side, positive the ocean (south east) side.")]
        public float lateralOffset = 0f;
        [Tooltip("Half width of the range in metres.")]
        public float halfWidth = 700f;
        [Tooltip("Peak elevation contributed by this range, in metres.")]
        public float peakHeight = 900f;
        [Range(0.2f, 3f)] public float ridgeSharpness = 1.1f;
        [Range(1, 9)] public int octaves = 6;
        [Tooltip("Base noise wavelength in metres. Smaller means more, tighter spurs.")]
        public float featureSize = 1600f;
        [Tooltip("0 = rounded, worn hills. 1 = knife edge alpine crests.")]
        [Range(0f, 1f)] public float ruggedness = 0.75f;
        [Tooltip("How strongly the crest line wanders off the straight arc axis, in metres.")]
        public float crestWander = 420f;
    }

    /// <summary>A stratovolcano, Fuji style, or a collapsed caldera like Towada.</summary>
    [Serializable]
    public class VolcanoSpec
    {
        public string name = "Volcano";
        public float alongT = 0.5f;
        public float lateral = 0.3f;
        [Tooltip("Radius of the volcanic edifice at its base, in metres.")]
        public float baseRadius = 1500f;
        [Tooltip("Height above the surrounding land, in metres.")]
        public float height = 1600f;
        [Tooltip("Flank profile exponent. Around 1.8 - 2.2 gives the concave sweep of a young stratovolcano.")]
        [Range(1f, 3.5f)] public float concavity = 2.0f;
        public float craterRadius = 110f;
        public float craterDepth = 90f;
        [Tooltip("Depth of the radial erosion gullies that fan down the flanks, in metres.")]
        public float rillDepth = 14f;
        [Tooltip("Number of radial gullies.")]
        public int rillCount = 34;
        [Tooltip("True for a collapsed caldera: wide, shallow rim with a flat floor that will fill with water.")]
        public bool caldera = false;
    }

    /// <summary>An intermontane basin, like Kofu, Nagano or Aizu: a flat floor ringed by steep mountains.</summary>
    [Serializable]
    public class BasinSpec
    {
        public string name = "Basin";
        public float alongT = 0.4f;
        public float lateral = 0f;
        public float radius = 550f;
        [Tooltip("Elevation of the flat basin floor, in metres.")]
        public float floorHeight = 400f;
        [Tooltip("Width of the transition from basin floor up into the surrounding slopes, in metres.")]
        public float rimBlend = 380f;
    }

    /// <summary>A coastal alluvial plain, like the Kanto, Nobi or Echigo plains.</summary>
    [Serializable]
    public class CoastalPlainSpec
    {
        public string name = "Plain";
        public float alongT = 0.6f;
        public float lateral = 0.8f;
        public float radius = 1400f;
        [Tooltip("Rise per metre inland. Real alluvial plains run about 1:300 to 1:1000.")]
        public float gradient = 0.004f;
        [Tooltip("Elevation the plain is allowed to reach before it merges back into the hills.")]
        public float maxHeight = 70f;
        [Tooltip("Width of the diluvial terrace step at the back of the plain, in metres.")]
        public float terraceBlend = 500f;
    }

    [CreateAssetMenu(fileName = "KontoWorldSettings", menuName = "SalaryMan/Konto World Settings", order = 0)]
    public class KontoWorldSettings : ScriptableObject
    {
        [Header("Seed")]
        public int seed = 19640101;

        [Header("World layout")]
        [Tooltip("Terrain tiles across X.")]
        public int tilesX = 4;
        [Tooltip("Terrain tiles across Z.")]
        public int tilesZ = 3;
        [Tooltip("Size of one terrain tile in metres.")]
        public float tileSize = 2048f;
        [Tooltip("Heightmap resolution per tile. Must be 2^n + 1. 1025 over a 2048 m tile is 2 m per sample.")]
        public int heightmapResolution = 1025;
        public int alphamapResolution = 1024;
        public int detailResolution = 1024;
        public int detailResolutionPerPatch = 32;
        public int baseMapResolution = 1024;

        [Header("Vertical range")]
        [Tooltip("Highest point on the island in metres. Konto is a compressed Honshu, so peaks are lower than Fuji but slopes are steeper.")]
        public float maxHeight = 1450f;
        [Tooltip("How far the sea bed drops below sea level, in metres. Terrain objects are placed at -seaDepth.")]
        public float seaDepth = 120f;

        [Header("Generation resolution")]
        [Tooltip("Longest side of the working raster used for erosion and hydrology. Higher is slower but carves finer valleys. 2048 is a good balance.")]
        public int workingResolution = 2048;

        [Header("Island shape")]
        [Tooltip("Control points of the island arc in normalised world space (0..1). Konto follows Honshu: a long north east limb, a bend at the central rift, then a south west limb.")]
        public List<Vector2> arcPoints = new List<Vector2>
        {
            new Vector2(0.055f, 0.145f),
            new Vector2(0.195f, 0.285f),
            new Vector2(0.360f, 0.400f),
            new Vector2(0.530f, 0.475f),
            new Vector2(0.700f, 0.585f),
            new Vector2(0.885f, 0.790f),
        };
        [Tooltip("Island half width at each arc point, in metres.")]
        public List<float> arcHalfWidths = new List<float> { 620f, 1180f, 1420f, 1260f, 1050f, 720f };

        [Tooltip("Amplitude of the large scale wobble applied to the coastline, in metres.")]
        public float coastNoiseAmplitude = 260f;
        public float coastNoiseSize = 2600f;
        [Tooltip("Where the drowned ria coast starts and ends along the arc, on the ocean side. This is the Sanriku analogue: deep V shaped inlets cut into a steep coast.")]
        public Vector2 riaCoastRange = new Vector2(0.02f, 0.30f);
        public float riaDepth = 520f;
        public float riaSpacing = 620f;
        [Tooltip("The sheltered side has long smooth sandy arcs and dune ridges instead of inlets.")]
        public float duneCoastSmoothing = 0.65f;
        [Tooltip("Width of the shallow continental shelf before the sea bed drops away, in metres.")]
        public float shelfWidth = 900f;
        [Tooltip("Chance of small offshore islets forming near the coast.")]
        [Range(0f, 1f)] public float isletDensity = 0.35f;

        [Header("Relief")]
        public List<MountainRangeSpec> ranges = new List<MountainRangeSpec>();
        public List<VolcanoSpec> volcanoes = new List<VolcanoSpec>();
        public List<BasinSpec> basins = new List<BasinSpec>();
        public List<CoastalPlainSpec> plains = new List<CoastalPlainSpec>();

        [Tooltip("Amplitude of the dissected low hill country that covers the ground between the ranges. This is the satoyama layer, in metres.")]
        public float hillCountryHeight = 170f;
        public float hillCountryFeatureSize = 640f;

        [Header("Thermal erosion")]
        [Tooltip("Repose angle in degrees. Material steeper than this slides downhill. Japanese slopes sit high, around 33 - 38 degrees.")]
        [Range(20f, 55f)] public float talusAngle = 35f;
        [Range(0, 200)] public int thermalIterations = 45;

        [Header("Hydraulic erosion")]
        [Tooltip("Number of rain droplets simulated. This is what produces the dense, finely branched valley networks Japan is known for.")]
        public int erosionDroplets = 900000;
        [Range(4, 128)] public int dropletLifetime = 56;
        [Range(0f, 1f)] public float inertia = 0.045f;
        public float sedimentCapacity = 3.4f;
        [Range(0f, 1f)] public float erodeSpeed = 0.32f;
        [Range(0f, 1f)] public float depositSpeed = 0.28f;
        [Range(0f, 0.2f)] public float evaporateSpeed = 0.018f;
        public float gravity = 9.81f;
        [Range(1, 8)] public int erosionBrushRadius = 3;
        [Tooltip("Minimum slope used in the capacity term. Small values let rivers keep cutting on flat ground and produce meanders.")]
        public float minSedimentCapacitySlope = 0.008f;

        [Header("Hydrology")]
        [Tooltip("Flow accumulation (in cells) above which a channel is carved.")]
        public float riverThreshold = 900f;
        [Tooltip("Maximum depth a main channel is cut below the surrounding land, in metres.")]
        public float riverMaxCarve = 22f;
        [Tooltip("Maximum half width of a main channel, in metres.")]
        public float riverMaxWidth = 55f;
        [Tooltip("Lakes shallower than this are filled in rather than kept, in metres.")]
        public float minLakeDepth = 3.5f;
        [Tooltip("Strength of the gravel fan deposited where a steep river leaves the mountains.")]
        [Range(0f, 1f)] public float alluvialFanStrength = 0.7f;

        [Header("Rice terraces")]
        public bool buildRiceTerraces = true;
        [Tooltip("Terraces are only cut below this elevation, in metres.")]
        public float terraceMaxAltitude = 520f;
        [Tooltip("Maximum slope, in degrees, that gets terraced. Steeper hillsides stay forest.")]
        public float terraceMaxSlope = 19f;
        [Tooltip("Height of a single terrace step, in metres.")]
        public float terraceStepHeight = 1.9f;
        [Range(0f, 1f)] public float terraceStrength = 0.72f;
        [Tooltip("Terraces cluster near valley floors. This is the flow accumulation above which terracing is allowed.")]
        public float terraceMinFlow = 45f;

        [Header("Surface detail")]
        [Tooltip("Fine relief added when the working raster is upsampled to terrain resolution, in metres.")]
        public float detailNoiseAmplitude = 2.1f;
        public float detailNoiseSize = 42f;
        public float microNoiseAmplitude = 0.42f;
        public float microNoiseSize = 9f;

        [Header("Biome thresholds")]
        [Tooltip("Height below which the shore turns to sand and shingle, in metres.")]
        public float beachHeight = 3.2f;
        [Tooltip("Tree line in metres. Central Honshu sits near 2500 m; Konto is compressed, so this is lower.")]
        public float treeLine = 1080f;
        [Tooltip("Height at which permanent snow starts, in metres.")]
        public float snowLine = 1180f;
        [Tooltip("Extra snow, in metres of elevation equivalent, on the Sea of Konto side. The north west coast of Honshu is one of the snowiest inhabited places on earth.")]
        public float snowySideBonus = 190f;
        [Tooltip("Slope in degrees above which bare rock shows through the soil.")]
        public float rockSlopeAngle = 38f;

        [Header("Vegetation")]
        [Tooltip("Spacing in metres of the candidate grid used for tree placement. Smaller means more trees and a slower build.")]
        public float treeSpacing = 9.5f;
        [Range(0f, 3f)] public float treeDensity = 1.0f;
        [Tooltip("Sugi and hinoki plantations are planted in rows on a regular grid. This is the fraction of the forested lowland that is plantation rather than natural forest.")]
        [Range(0f, 1f)] public float plantationShare = 0.42f;
        [Tooltip("Row spacing inside a plantation block, in metres. Real sugi stands are planted at 2 - 4 m; larger values here cost far fewer instances.")]
        public float plantationRowSpacing = 5.5f;
        [Tooltip("Hard cap on tree instances per terrain tile. Excess candidates are thinned evenly.")]
        public int maxTreesPerTile = 55000;
        [Range(0f, 1f)] public float grassDensity = 1f;

        /// <summary>Total world size in metres.</summary>
        public Vector2 WorldSize { get { return new Vector2(tilesX * tileSize, tilesZ * tileSize); } }

        /// <summary>Full vertical span of a terrain object, sea bed to summit.</summary>
        public float TerrainHeightSpan { get { return seaDepth + maxHeight; } }

        public int WorkingWidth
        {
            get
            {
                Vector2 s = WorldSize;
                return s.x >= s.y ? workingResolution : Mathf.Max(64, Mathf.RoundToInt(workingResolution * s.x / s.y));
            }
        }

        public int WorkingHeight
        {
            get
            {
                Vector2 s = WorldSize;
                return s.y > s.x ? workingResolution : Mathf.Max(64, Mathf.RoundToInt(workingResolution * s.y / s.x));
            }
        }

        void Reset()
        {
            ApplyKontoDefaults();
        }

        /// <summary>
        /// The default layout of Konto. Everything is anchored to the island arc rather than to
        /// absolute coordinates, so the geography stays coherent if you resize the world.
        /// </summary>
        public void ApplyKontoDefaults()
        {
            ranges = new List<MountainRangeSpec>
            {
                new MountainRangeSpec
                {
                    // Ou Mountains analogue: the long, moderate backbone of the north east limb.
                    name = "Okami Backbone", alongStart = 0.00f, alongEnd = 0.44f, lateralOffset = -0.02f,
                    halfWidth = 760f, peakHeight = 830f, ridgeSharpness = 1.05f, octaves = 6,
                    featureSize = 1750f, ruggedness = 0.68f, crestWander = 480f
                },
                new MountainRangeSpec
                {
                    // Hida / Kiso / Akaishi analogue: the high, glacially sharpened Konto Alps.
                    name = "Konto Alps", alongStart = 0.33f, alongEnd = 0.60f, lateralOffset = -0.08f,
                    halfWidth = 830f, peakHeight = 1450f, ridgeSharpness = 1.55f, octaves = 7,
                    featureSize = 1350f, ruggedness = 0.95f, crestWander = 360f
                },
                new MountainRangeSpec
                {
                    // Chugoku analogue: an old, worn, rounded range on the south west limb.
                    name = "Nishiyama Uplands", alongStart = 0.60f, alongEnd = 1.00f, lateralOffset = 0.04f,
                    halfWidth = 700f, peakHeight = 610f, ridgeSharpness = 0.8f, octaves = 6,
                    featureSize = 1900f, ruggedness = 0.42f, crestWander = 540f
                },
                new MountainRangeSpec
                {
                    // Kanto / Tanzawa style coastal hill ranges between the spine and the ocean.
                    name = "Ocean Side Hills", alongStart = 0.08f, alongEnd = 0.94f, lateralOffset = 0.52f,
                    halfWidth = 520f, peakHeight = 285f, ridgeSharpness = 0.85f, octaves = 6,
                    featureSize = 980f, ruggedness = 0.5f, crestWander = 620f
                },
            };

            volcanoes = new List<VolcanoSpec>
            {
                new VolcanoSpec
                {
                    // Fuji analogue: a young, isolated, near symmetrical cone standing clear of the range.
                    name = "Kogane-san", alongT = 0.485f, lateral = 0.42f, baseRadius = 1650f, height = 1330f,
                    concavity = 2.05f, craterRadius = 120f, craterDepth = 95f, rillDepth = 15f, rillCount = 38
                },
                new VolcanoSpec
                {
                    // Bandai / Chokai analogue sitting on the backbone.
                    name = "Shirotake", alongT = 0.285f, lateral = -0.30f, baseRadius = 980f, height = 760f,
                    concavity = 1.85f, craterRadius = 95f, craterDepth = 70f, rillDepth = 18f, rillCount = 26
                },
                new VolcanoSpec
                {
                    // Towada analogue: a collapsed caldera that will fill to become a deep lake.
                    name = "Aokami Caldera", alongT = 0.115f, lateral = 0.06f, baseRadius = 1020f, height = 520f,
                    concavity = 1.6f, craterRadius = 430f, craterDepth = 330f, rillDepth = 10f, rillCount = 22,
                    caldera = true
                },
                new VolcanoSpec
                {
                    name = "Asagiri-dake", alongT = 0.675f, lateral = -0.44f, baseRadius = 720f, height = 540f,
                    concavity = 1.95f, craterRadius = 70f, craterDepth = 55f, rillDepth = 12f, rillCount = 24
                },
            };

            basins = new List<BasinSpec>
            {
                new BasinSpec { name = "Suwa Basin",  alongT = 0.415f, lateral = -0.16f, radius = 560f, floorHeight = 430f, rimBlend = 400f },
                new BasinSpec { name = "Aizuno Basin",alongT = 0.230f, lateral =  0.18f, radius = 610f, floorHeight = 245f, rimBlend = 430f },
                new BasinSpec { name = "Kofu Basin",  alongT = 0.552f, lateral =  0.22f, radius = 520f, floorHeight = 300f, rimBlend = 380f },
                new BasinSpec { name = "Zenko Basin", alongT = 0.345f, lateral = -0.34f, radius = 450f, floorHeight = 360f, rimBlend = 340f },
            };

            plains = new List<CoastalPlainSpec>
            {
                // Kanto analogue: the big one, where the capital will go.
                new CoastalPlainSpec { name = "Kanmei Plain", alongT = 0.615f, lateral = 0.86f, radius = 1550f, gradient = 0.0035f, maxHeight = 75f, terraceBlend = 560f },
                // Echigo analogue on the snowy side.
                new CoastalPlainSpec { name = "Etsuno Plain", alongT = 0.300f, lateral = -0.88f, radius = 980f, gradient = 0.0042f, maxHeight = 55f, terraceBlend = 420f },
                // Nobi analogue.
                new CoastalPlainSpec { name = "Obi Plain",    alongT = 0.745f, lateral = 0.78f, radius = 880f, gradient = 0.0045f, maxHeight = 58f, terraceBlend = 400f },
                // Sendai analogue on the ria coast.
                new CoastalPlainSpec { name = "Sendo Plain",  alongT = 0.155f, lateral = 0.74f, radius = 620f, gradient = 0.0050f, maxHeight = 48f, terraceBlend = 340f },
            };
        }

        void OnValidate()
        {
            tilesX = Mathf.Clamp(tilesX, 1, 16);
            tilesZ = Mathf.Clamp(tilesZ, 1, 16);
            tileSize = Mathf.Clamp(tileSize, 128f, 8192f);
            heightmapResolution = Mathf.ClosestPowerOfTwo(Mathf.Clamp(heightmapResolution - 1, 32, 4096)) + 1;
            alphamapResolution = Mathf.ClosestPowerOfTwo(Mathf.Clamp(alphamapResolution, 32, 4096));
            detailResolution = Mathf.ClosestPowerOfTwo(Mathf.Clamp(detailResolution, 32, 4096));
            workingResolution = Mathf.Clamp(workingResolution, 256, 8192);
            while (arcHalfWidths.Count < arcPoints.Count) arcHalfWidths.Add(900f);
            while (arcHalfWidths.Count > arcPoints.Count && arcHalfWidths.Count > 0) arcHalfWidths.RemoveAt(arcHalfWidths.Count - 1);
        }
    }
}
