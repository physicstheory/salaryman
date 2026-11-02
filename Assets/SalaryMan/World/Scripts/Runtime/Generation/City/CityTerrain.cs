using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// World space access to the natural landscape, for the city passes. The city is planned
    /// against the land as erosion and the rivers left it: where it is flat enough to build,
    /// where the water is, how far it is to the sea.
    /// </summary>
    public sealed class CityTerrain
    {
        readonly Field2D _height;
        readonly Field2D _slope;
        readonly LandmassContext _land;
        readonly HydrologyResult _water;
        readonly Vector2 _worldSize;

        public CityTerrain(KontoWorldSettings settings, LandmassContext land, HydrologyResult water, Field2D height, Field2D slope)
        {
            _land = land;
            _water = water;
            _height = height;
            _slope = slope;
            _worldSize = settings.WorldSize;
        }

        public LandmassContext Land { get { return _land; } }
        public HydrologyResult Water { get { return _water; } }
        public Vector2 WorldSize { get { return _worldSize; } }

        void Uv(Vector2 p, out float u, out float v)
        {
            u = Mathf.Clamp01(p.x / _worldSize.x);
            v = Mathf.Clamp01(p.y / _worldSize.y);
        }

        /// <summary>Natural ground elevation in metres, without the fine surface detail.</summary>
        public float Height(Vector2 p)
        {
            float u, v;
            Uv(p, out u, out v);
            return _height.SampleBicubic(u, v);
        }

        /// <summary>Gradient magnitude, i.e. tan of the slope angle.</summary>
        public float Slope(Vector2 p)
        {
            float u, v;
            Uv(p, out u, out v);
            return _slope.SampleBilinear(u, v);
        }

        public float SlopeDegrees(Vector2 p)
        {
            return Mathf.Atan(Slope(p)) * Mathf.Rad2Deg;
        }

        /// <summary>0..1 river channel mask. Above about 0.4 is open water.</summary>
        public float River(Vector2 p)
        {
            float u, v;
            Uv(p, out u, out v);
            return _water.RiverMask.SampleBilinear(u, v);
        }

        /// <summary>0..1 log discharge.</summary>
        public float Flow(Vector2 p)
        {
            float u, v;
            Uv(p, out u, out v);
            return _water.Flow.SampleBilinear(u, v);
        }

        /// <summary>0 sea, 1 solid land.</summary>
        public float LandMask(Vector2 p)
        {
            float u, v;
            Uv(p, out u, out v);
            return _land.LandMask.SampleBilinear(u, v);
        }

        /// <summary>Metres inland from the coastline. Negative offshore.</summary>
        public float CoastDistance(Vector2 p)
        {
            float u, v;
            Uv(p, out u, out v);
            return _land.CoastDistance.SampleBilinear(u, v);
        }

        /// <summary>Surface height of a lake at this point, or false if there is no standing water.</summary>
        public bool LakeSurface(Vector2 p, out float surface)
        {
            float u, v;
            Uv(p, out u, out v);
            int x = Mathf.RoundToInt(u * (_water.LakeSurface.Width - 1));
            int y = Mathf.RoundToInt(v * (_water.LakeSurface.Height - 1));
            surface = _water.LakeSurface.GetClamped(x, y);
            return surface > HydrologyResult.NoLake + 1f;
        }

        /// <summary>True where nothing can be built: open water of any kind.</summary>
        public bool IsWater(Vector2 p)
        {
            if (Height(p) < 0.35f) return true;
            if (River(p) > 0.45f) return true;
            float surface;
            return LakeSurface(p, out surface);
        }

        /// <summary>
        /// Ground a city can be built on: dry land, not in a channel, not under a lake. This is
        /// deliberately more permissive about elevation than <see cref="IsWater"/> - the lowest
        /// wards of a real port city sit a metre above the tide behind a seawall, and half of
        /// Tokyo's east is lower than that.
        /// </summary>
        public bool IsBuildableGround(Vector2 p)
        {
            if (LandMask(p) < 0.55f) return false;
            if (Height(p) < 0.15f) return false;
            if (River(p) > 0.45f) return false;
            float surface;
            return !LakeSurface(p, out surface);
        }

        public bool InsideWorld(Vector2 p, float margin = 0f)
        {
            return p.x > margin && p.y > margin && p.x < _worldSize.x - margin && p.y < _worldSize.y - margin;
        }
    }
}
