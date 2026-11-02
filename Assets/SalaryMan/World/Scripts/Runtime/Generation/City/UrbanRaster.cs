using System;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// A float raster covering one city, in world space. The city needs a much finer grid than
    /// the island does - a street is eight metres wide - so it gets its own raster over its own
    /// bounds instead of being forced into the world working resolution.
    /// </summary>
    public sealed class UrbanRaster
    {
        public readonly int Width, Height;
        public readonly float CellSize;
        public readonly Vector2 Origin;      // world position of cell (0,0)
        public readonly float[] Data;

        public UrbanRaster(Vector2 origin, float cellSize, int width, int height, float fill = 0f)
        {
            Origin = origin;
            CellSize = Mathf.Max(0.25f, cellSize);
            Width = Mathf.Max(2, width);
            Height = Mathf.Max(2, height);
            Data = new float[Width * Height];
            if (fill != 0f)
            {
                for (int i = 0; i < Data.Length; i++) Data[i] = fill;
            }
        }

        public float this[int x, int y]
        {
            get { return Data[y * Width + x]; }
            set { Data[y * Width + x] = value; }
        }

        public float GetClamped(int x, int y)
        {
            if (x < 0) x = 0; else if (x >= Width) x = Width - 1;
            if (y < 0) y = 0; else if (y >= Height) y = Height - 1;
            return Data[y * Width + x];
        }

        public Vector2 CellToWorld(int x, int y)
        {
            return new Vector2(Origin.x + x * CellSize, Origin.y + y * CellSize);
        }

        public void WorldToCell(Vector2 p, out float cx, out float cy)
        {
            cx = (p.x - Origin.x) / CellSize;
            cy = (p.y - Origin.y) / CellSize;
        }

        public bool Contains(Vector2 p)
        {
            float cx, cy;
            WorldToCell(p, out cx, out cy);
            return cx >= 0f && cy >= 0f && cx <= Width - 1 && cy <= Height - 1;
        }

        /// <summary>Bilinear sample in world space. Returns <paramref name="outside"/> beyond the raster.</summary>
        public float Sample(Vector2 p, float outside = 0f)
        {
            float cx, cy;
            WorldToCell(p, out cx, out cy);
            if (cx < 0f || cy < 0f || cx > Width - 1 || cy > Height - 1) return outside;

            int x0 = (int)cx;
            int y0 = (int)cy;
            int x1 = Mathf.Min(x0 + 1, Width - 1);
            int y1 = Mathf.Min(y0 + 1, Height - 1);
            float tx = cx - x0;
            float ty = cy - y0;
            float a = Mathf.Lerp(Data[y0 * Width + x0], Data[y0 * Width + x1], tx);
            float b = Mathf.Lerp(Data[y1 * Width + x0], Data[y1 * Width + x1], tx);
            return Mathf.Lerp(a, b, ty);
        }

        public UrbanRaster Clone()
        {
            var c = new UrbanRaster(Origin, CellSize, Width, Height);
            Array.Copy(Data, c.Data, Data.Length);
            return c;
        }

        /// <summary>
        /// Separable box blur weighted by a mask, with a sliding window so the cost does not
        /// depend on the radius. The mask matters: an unweighted blur at the city edge drags the
        /// mountains in and leaves the whole platform floating.
        /// </summary>
        public void MaskedBlur(UrbanRaster mask, int radius, int passes = 1)
        {
            if (radius < 1) return;
            int n = Data.Length;
            var num = new float[n];
            var den = new float[n];

            for (int p = 0; p < passes; p++)
            {
                // Horizontal.
                for (int y = 0; y < Height; y++)
                {
                    int row = y * Width;
                    float sum = 0f, wsum = 0f;
                    for (int k = -radius; k <= radius; k++)
                    {
                        int sx = Clamp(k, Width);
                        float w = mask.Data[row + sx];
                        sum += Data[row + sx] * w;
                        wsum += w;
                    }
                    num[row] = sum;
                    den[row] = wsum;

                    for (int x = 1; x < Width; x++)
                    {
                        int add = Clamp(x + radius, Width);
                        int drop = Clamp(x - radius - 1, Width);
                        float wa = mask.Data[row + add];
                        float wd = mask.Data[row + drop];
                        sum += Data[row + add] * wa - Data[row + drop] * wd;
                        wsum += wa - wd;
                        num[row + x] = sum;
                        den[row + x] = wsum;
                    }
                }

                // Vertical, over the partial sums from the horizontal pass.
                for (int x = 0; x < Width; x++)
                {
                    float sum = 0f, wsum = 0f;
                    for (int k = -radius; k <= radius; k++)
                    {
                        int sy = Clamp(k, Height);
                        sum += num[sy * Width + x];
                        wsum += den[sy * Width + x];
                    }
                    if (wsum > 1e-4f) Data[x] = sum / wsum;

                    for (int y = 1; y < Height; y++)
                    {
                        int add = Clamp(y + radius, Height);
                        int drop = Clamp(y - radius - 1, Height);
                        sum += num[add * Width + x] - num[drop * Width + x];
                        wsum += den[add * Width + x] - den[drop * Width + x];
                        if (wsum > 1e-4f) Data[y * Width + x] = sum / wsum;
                    }
                }
            }
        }

        /// <summary>Plain box blur, used to feather masks.</summary>
        public void Blur(int radius, int passes = 1)
        {
            if (radius < 1) return;
            var tmp = new float[Data.Length];
            int window = radius * 2 + 1;

            for (int p = 0; p < passes; p++)
            {
                for (int y = 0; y < Height; y++)
                {
                    int row = y * Width;
                    float sum = 0f;
                    for (int k = -radius; k <= radius; k++) sum += Data[row + Clamp(k, Width)];
                    tmp[row] = sum / window;
                    for (int x = 1; x < Width; x++)
                    {
                        sum += Data[row + Clamp(x + radius, Width)] - Data[row + Clamp(x - radius - 1, Width)];
                        tmp[row + x] = sum / window;
                    }
                }
                for (int x = 0; x < Width; x++)
                {
                    float sum = 0f;
                    for (int k = -radius; k <= radius; k++) sum += tmp[Clamp(k, Height) * Width + x];
                    Data[x] = sum / window;
                    for (int y = 1; y < Height; y++)
                    {
                        sum += tmp[Clamp(y + radius, Height) * Width + x] - tmp[Clamp(y - radius - 1, Height) * Width + x];
                        Data[y * Width + x] = sum / window;
                    }
                }
            }
        }

        static int Clamp(int v, int size)
        {
            if (v < 0) return 0;
            if (v >= size) return size - 1;
            return v;
        }
    }

    /// <summary>The per cell surface type raster: what the ground is made of inside the city.</summary>
    public sealed class UrbanSurfaceRaster
    {
        public readonly int Width, Height;
        public readonly float CellSize;
        public readonly Vector2 Origin;
        public readonly byte[] Data;

        public UrbanSurfaceRaster(Vector2 origin, float cellSize, int width, int height)
        {
            Origin = origin;
            CellSize = Mathf.Max(0.25f, cellSize);
            Width = Mathf.Max(2, width);
            Height = Mathf.Max(2, height);
            Data = new byte[Width * Height];
        }

        public UrbanSurface this[int x, int y]
        {
            get { return (UrbanSurface)Data[y * Width + x]; }
            set { Data[y * Width + x] = (byte)value; }
        }

        public Vector2 CellToWorld(int x, int y)
        {
            return new Vector2(Origin.x + x * CellSize, Origin.y + y * CellSize);
        }

        /// <summary>Nearest cell lookup. Surfaces are categories, so they are never interpolated.</summary>
        public UrbanSurface Sample(Vector2 p)
        {
            int x = Mathf.RoundToInt((p.x - Origin.x) / CellSize);
            int y = Mathf.RoundToInt((p.y - Origin.y) / CellSize);
            if (x < 0 || y < 0 || x >= Width || y >= Height) return UrbanSurface.None;
            return (UrbanSurface)Data[y * Width + x];
        }
    }

    /// <summary>
    /// One built city: its plan, and the rasters that put it on the ground. The terrain reads
    /// <see cref="Pad"/> for its heights and <see cref="Surface"/> for its splatmaps.
    /// </summary>
    public sealed class UrbanData
    {
        public UrbanSiteSpec Site;
        public CityLayout Layout;
        /// <summary>Engineered ground elevation in metres.</summary>
        public UrbanRaster Pad;
        /// <summary>0 outside the city, 1 on fully engineered ground, feathered in between.</summary>
        public UrbanRaster Weight;
        public UrbanSurfaceRaster Surface;
        public Rect Bounds;

        public float SampleWeight(Vector2 p)
        {
            return Weight == null ? 0f : Weight.Sample(p);
        }

        public float SamplePad(Vector2 p)
        {
            return Pad == null ? 0f : Pad.Sample(p);
        }

        public UrbanSurface SampleSurface(Vector2 p)
        {
            return Surface == null ? UrbanSurface.None : Surface.Sample(p);
        }
    }

    /// <summary>
    /// Every city in the world, and the one place the rest of the build asks "is this the
    /// city, and if so what is the ground doing here?".
    /// </summary>
    public sealed class UrbanLayer
    {
        public readonly System.Collections.Generic.List<UrbanData> Cities = new System.Collections.Generic.List<UrbanData>();

        public bool Any { get { return Cities.Count > 0; } }

        /// <summary>The strongest city influence at a point, 0..1.</summary>
        public float Weight(float worldX, float worldZ)
        {
            if (Cities.Count == 0) return 0f;
            var p = new Vector2(worldX, worldZ);
            float best = 0f;
            for (int i = 0; i < Cities.Count; i++)
            {
                float w = Cities[i].SampleWeight(p);
                if (w > best) best = w;
            }
            return best;
        }

        /// <summary>Engineered ground height at a point. Returns false where no city covers it.</summary>
        public bool Pad(float worldX, float worldZ, out float height, out float weight)
        {
            height = 0f;
            weight = 0f;
            var p = new Vector2(worldX, worldZ);
            for (int i = 0; i < Cities.Count; i++)
            {
                float w = Cities[i].SampleWeight(p);
                if (w <= weight) continue;
                weight = w;
                height = Cities[i].SamplePad(p);
            }
            return weight > 0.001f;
        }

        public UrbanSurface Surface(float worldX, float worldZ)
        {
            var p = new Vector2(worldX, worldZ);
            var best = UrbanSurface.None;
            float bestWeight = 0f;
            for (int i = 0; i < Cities.Count; i++)
            {
                float w = Cities[i].SampleWeight(p);
                if (w <= 0.05f || w < bestWeight) continue;
                var s = Cities[i].SampleSurface(p);
                if (s == UrbanSurface.None) continue;
                best = s;
                bestWeight = w;
            }
            return best;
        }

        public CityLayout FindCity(string cityName)
        {
            for (int i = 0; i < Cities.Count; i++)
            {
                var layout = Cities[i].Layout;
                if (layout == null) continue;
                if (string.Equals(layout.name, cityName, System.StringComparison.OrdinalIgnoreCase)) return layout;
                if (string.Equals(layout.code, cityName, System.StringComparison.OrdinalIgnoreCase)) return layout;
            }
            return null;
        }
    }
}
