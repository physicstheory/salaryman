using System;
using System.Threading.Tasks;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// A plain float raster. Every generation stage reads and writes these: heights in metres,
    /// flow accumulation, lake surfaces, arc parameters and so on.
    /// </summary>
    public sealed class Field2D
    {
        public readonly int Width;
        public readonly int Height;
        public readonly float[] Data;

        public Field2D(int width, int height)
        {
            if (width < 2 || height < 2) throw new ArgumentException("Field2D needs at least 2x2");
            Width = width;
            Height = height;
            Data = new float[width * height];
        }

        public Field2D(int width, int height, float fill) : this(width, height)
        {
            if (fill != 0f)
            {
                for (int i = 0; i < Data.Length; i++) Data[i] = fill;
            }
        }

        public int Count { get { return Data.Length; } }

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

        public void Fill(float value)
        {
            for (int i = 0; i < Data.Length; i++) Data[i] = value;
        }

        public Field2D Clone()
        {
            var c = new Field2D(Width, Height);
            Array.Copy(Data, c.Data, Data.Length);
            return c;
        }

        /// <summary>Bilinear sample with u,v in 0..1 across the field.</summary>
        public float SampleBilinear(float u, float v)
        {
            float fx = Mathf.Clamp01(u) * (Width - 1);
            float fy = Mathf.Clamp01(v) * (Height - 1);
            int x0 = (int)fx;
            int y0 = (int)fy;
            int x1 = Mathf.Min(x0 + 1, Width - 1);
            int y1 = Mathf.Min(y0 + 1, Height - 1);
            float tx = fx - x0;
            float ty = fy - y0;

            float a = Mathf.Lerp(Data[y0 * Width + x0], Data[y0 * Width + x1], tx);
            float b = Mathf.Lerp(Data[y1 * Width + x0], Data[y1 * Width + x1], tx);
            return Mathf.Lerp(a, b, ty);
        }

        static float CubicHermite(float a, float b, float c, float d, float t)
        {
            float a0 = -0.5f * a + 1.5f * b - 1.5f * c + 0.5f * d;
            float a1 = a - 2.5f * b + 2f * c - 0.5f * d;
            float a2 = -0.5f * a + 0.5f * c;
            return ((a0 * t + a1) * t + a2) * t + b;
        }

        /// <summary>
        /// Bicubic sample with u,v in 0..1. Used when blowing the low resolution erosion
        /// result up to terrain resolution; bilinear leaves visible facets on smooth slopes.
        /// </summary>
        public float SampleBicubic(float u, float v)
        {
            float fx = Mathf.Clamp01(u) * (Width - 1);
            float fy = Mathf.Clamp01(v) * (Height - 1);
            int x1 = Mathf.FloorToInt(fx);
            int y1 = Mathf.FloorToInt(fy);
            float tx = fx - x1;
            float ty = fy - y1;

            float c0 = CubicHermite(GetClamped(x1 - 1, y1 - 1), GetClamped(x1, y1 - 1), GetClamped(x1 + 1, y1 - 1), GetClamped(x1 + 2, y1 - 1), tx);
            float c1 = CubicHermite(GetClamped(x1 - 1, y1    ), GetClamped(x1, y1    ), GetClamped(x1 + 1, y1    ), GetClamped(x1 + 2, y1    ), tx);
            float c2 = CubicHermite(GetClamped(x1 - 1, y1 + 1), GetClamped(x1, y1 + 1), GetClamped(x1 + 1, y1 + 1), GetClamped(x1 + 2, y1 + 1), tx);
            float c3 = CubicHermite(GetClamped(x1 - 1, y1 + 2), GetClamped(x1, y1 + 2), GetClamped(x1 + 1, y1 + 2), GetClamped(x1 + 2, y1 + 2), tx);
            return CubicHermite(c0, c1, c2, c3, ty);
        }

        public Field2D Resample(int newWidth, int newHeight)
        {
            var dst = new Field2D(newWidth, newHeight);
            Parallel.For(0, newHeight, y =>
            {
                float v = newHeight > 1 ? y / (float)(newHeight - 1) : 0f;
                for (int x = 0; x < newWidth; x++)
                {
                    float u = newWidth > 1 ? x / (float)(newWidth - 1) : 0f;
                    dst.Data[y * newWidth + x] = SampleBicubic(u, v);
                }
            });
            return dst;
        }

        /// <summary>Separable box blur, repeated for an approximate gaussian.</summary>
        public void Blur(int radius, int passes = 1)
        {
            if (radius < 1) return;
            var tmp = new float[Data.Length];
            for (int p = 0; p < passes; p++)
            {
                Parallel.For(0, Height, y =>
                {
                    int row = y * Width;
                    for (int x = 0; x < Width; x++)
                    {
                        float sum = 0f;
                        int n = 0;
                        for (int k = -radius; k <= radius; k++)
                        {
                            int sx = x + k;
                            if (sx < 0) sx = 0; else if (sx >= Width) sx = Width - 1;
                            sum += Data[row + sx];
                            n++;
                        }
                        tmp[row + x] = sum / n;
                    }
                });
                Parallel.For(0, Width, x =>
                {
                    for (int y = 0; y < Height; y++)
                    {
                        float sum = 0f;
                        int n = 0;
                        for (int k = -radius; k <= radius; k++)
                        {
                            int sy = y + k;
                            if (sy < 0) sy = 0; else if (sy >= Height) sy = Height - 1;
                            sum += tmp[sy * Width + x];
                            n++;
                        }
                        Data[y * Width + x] = sum / n;
                    }
                });
            }
        }

        public void MinMax(out float min, out float max)
        {
            min = float.MaxValue;
            max = float.MinValue;
            for (int i = 0; i < Data.Length; i++)
            {
                float v = Data[i];
                if (v < min) min = v;
                if (v > max) max = v;
            }
        }

        public void Remap(float newMin, float newMax)
        {
            float min, max;
            MinMax(out min, out max);
            float range = max - min;
            if (range < 1e-6f) { Fill(newMin); return; }
            float scale = (newMax - newMin) / range;
            for (int i = 0; i < Data.Length; i++) Data[i] = newMin + (Data[i] - min) * scale;
        }

        /// <summary>Gradient magnitude in metres per metre (i.e. tan of the slope angle).</summary>
        public float SlopeAt(int x, int y, float cellSize)
        {
            float l = GetClamped(x - 1, y);
            float r = GetClamped(x + 1, y);
            float d = GetClamped(x, y - 1);
            float u = GetClamped(x, y + 1);
            float dx = (r - l) / (2f * cellSize);
            float dy = (u - d) / (2f * cellSize);
            return Mathf.Sqrt(dx * dx + dy * dy);
        }

        /// <summary>Laplacian. Negative on ridges and spurs, positive inside hollows and valleys.</summary>
        public float CurvatureAt(int x, int y, float cellSize)
        {
            float c = GetClamped(x, y);
            float sum = GetClamped(x - 1, y) + GetClamped(x + 1, y) + GetClamped(x, y - 1) + GetClamped(x, y + 1);
            return (sum - 4f * c) / (cellSize * cellSize);
        }
    }
}
