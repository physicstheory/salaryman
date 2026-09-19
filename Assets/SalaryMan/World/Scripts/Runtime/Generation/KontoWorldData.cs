using System.Threading.Tasks;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// The finished world. Holds the generated rasters and exposes continuous world space
    /// lookups. Terrain heights, splatmaps, grass and trees all go through this object, so
    /// they can never disagree with each other or show a seam between tiles.
    /// </summary>
    public sealed class KontoWorldData
    {
        public KontoWorldSettings Settings;
        public LandmassContext Land;
        public HydrologyResult Water;

        public Field2D Height;        // metres, working resolution
        public Field2D Slope;         // gradient magnitude, working resolution
        public Field2D TerraceMask;   // 0..1, where rice terraces are cut
        public UrbanLayer Urban;      // the cities, and the ground they stand on

        public Vector2 WorldSize { get { return Settings.WorldSize; } }

        public float HighestPoint { get; internal set; }

        // ---------------------------------------------------------------- sampling

        void ToUv(float worldX, float worldZ, out float u, out float v)
        {
            u = Mathf.Clamp01(worldX / WorldSize.x);
            v = Mathf.Clamp01(worldZ / WorldSize.y);
        }

        /// <summary>Elevation in metres above sea level, with the fine surface detail applied.</summary>
        public float SampleHeight(float worldX, float worldZ)
        {
            float u, v;
            ToUv(worldX, worldZ, out u, out v);
            float h = Height.SampleBicubic(u, v);
            float slope = Slope.SampleBilinear(u, v);
            var s = Settings;

            // Inside a city the ground is whatever the engineers left: plots graded flat, streets
            // on a smooth running profile, quays, embankments and made ground.
            float urbanWeight = 0f;
            float urbanPad = 0f;
            if (Urban != null && Urban.Any) Urban.Pad(worldX, worldZ, out urbanPad, out urbanWeight);

            // Rough ground stays rough, flat ground stays flat. Adding the same amount of noise
            // everywhere is what makes procedural terrain read as fake.
            float rough = 0.22f + 0.78f * Mathf.Clamp01(slope / 0.55f);
            float aboveWater = KontoNoise.SmoothStep(-1.5f, 2.5f, h);

            float detail = KontoNoise.Fbm(worldX / s.detailNoiseSize, worldZ / s.detailNoiseSize, s.seed + 15013, 4) * s.detailNoiseAmplitude;
            float micro  = KontoNoise.Fbm(worldX / s.microNoiseSize,  worldZ / s.microNoiseSize,  s.seed + 15053, 3) * s.microNoiseAmplitude;
            // Engineered ground is smooth: tarmac and concrete do not have hummocks in them.
            h += (detail + micro) * rough * Mathf.Lerp(0.35f, 1f, aboveWater) * (1f - urbanWeight * 0.92f);

            if (s.buildRiceTerraces && s.terraceStrength > 0f && urbanWeight < 0.5f)
            {
                float mask = TerraceMask.SampleBilinear(u, v) * (1f - urbanWeight);
                if (mask > 0.01f && h < s.terraceMaxAltitude + 40f)
                {
                    float step = Mathf.Max(0.3f, s.terraceStepHeight);
                    float f = h / step;
                    float fi = Mathf.Floor(f);
                    float fr = f - fi;
                    // Flat paddy pad for most of the step, then a short steep bank.
                    float shaped = (fi + KontoNoise.SmoothStep(0.70f, 1f, fr)) * step;
                    h = Mathf.Lerp(h, shaped, Mathf.Clamp01(mask * s.terraceStrength));
                }
            }

            if (urbanWeight > 0.001f) h = Mathf.Lerp(h, urbanPad, urbanWeight);
            return h;
        }

        /// <summary>What the ground is made of at a point inside a city, or None out in the country.</summary>
        public UrbanSurface SampleUrbanSurface(float worldX, float worldZ)
        {
            if (Urban == null || !Urban.Any) return UrbanSurface.None;
            return Urban.Surface(worldX, worldZ);
        }

        /// <summary>0 out in the country, 1 on fully engineered city ground.</summary>
        public float SampleUrban(float worldX, float worldZ)
        {
            if (Urban == null || !Urban.Any) return 0f;
            return Urban.Weight(worldX, worldZ);
        }

        /// <summary>The plan of the first city built, or null if there is none.</summary>
        public CityLayout PrimaryCity
        {
            get
            {
                if (Urban == null || Urban.Cities.Count == 0) return null;
                return Urban.Cities[0].Layout;
            }
        }

        public float SampleSlope(float worldX, float worldZ)
        {
            float u, v;
            ToUv(worldX, worldZ, out u, out v);
            return Slope.SampleBilinear(u, v);
        }

        public float SampleFlow(float worldX, float worldZ)
        {
            float u, v;
            ToUv(worldX, worldZ, out u, out v);
            return Water.Flow.SampleBilinear(u, v);
        }

        public float SampleRiver(float worldX, float worldZ)
        {
            float u, v;
            ToUv(worldX, worldZ, out u, out v);
            return Water.RiverMask.SampleBilinear(u, v);
        }

        public float SampleLandMask(float worldX, float worldZ)
        {
            float u, v;
            ToUv(worldX, worldZ, out u, out v);
            return Land.LandMask.SampleBilinear(u, v);
        }

        public float SampleCoastDistance(float worldX, float worldZ)
        {
            float u, v;
            ToUv(worldX, worldZ, out u, out v);
            return Land.CoastDistance.SampleBilinear(u, v);
        }

        /// <summary>Signed distance from the island's tectonic axis. Negative on the snowy Sea of Konto side.</summary>
        public float SampleArcLateral(float worldX, float worldZ)
        {
            float u, v;
            ToUv(worldX, worldZ, out u, out v);
            return Land.ArcLateral.SampleBilinear(u, v);
        }

        public float SampleTerrace(float worldX, float worldZ)
        {
            float u, v;
            ToUv(worldX, worldZ, out u, out v);
            return TerraceMask.SampleBilinear(u, v);
        }

        /// <summary>Water surface height at a point, if there is any water there.</summary>
        public bool TryGetWaterSurface(float worldX, float worldZ, out float surfaceY)
        {
            float u, v;
            ToUv(worldX, worldZ, out u, out v);
            int x = Mathf.RoundToInt(u * (Water.LakeSurface.Width - 1));
            int y = Mathf.RoundToInt(v * (Water.LakeSurface.Height - 1));
            float lake = Water.LakeSurface.GetClamped(x, y);
            if (lake > HydrologyResult.NoLake + 1f)
            {
                surfaceY = lake;
                return true;
            }
            if (SampleHeight(worldX, worldZ) < 0f)
            {
                surfaceY = 0f;
                return true;
            }
            surfaceY = 0f;
            return false;
        }

        /// <summary>
        /// Converts a world elevation into the 0..1 value a Unity TerrainData expects, given
        /// that terrain objects sit at y = -seaDepth and span seaDepth + maxHeight metres.
        /// </summary>
        public float ToNormalisedHeight(float metres)
        {
            return Mathf.Clamp01((metres + Settings.seaDepth) / Mathf.Max(1f, Settings.TerrainHeightSpan));
        }
    }
}
