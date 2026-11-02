using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Deterministic, allocation free noise used by every stage of the Konto world build.
    /// Everything is hash based so a given (seed, x, y) always returns the same value on any
    /// machine, which is what keeps terrain tiles seamless and rebuilds reproducible.
    /// </summary>
    public static class KontoNoise
    {
        const int PrimeX = 501125321;
        const int PrimeY = 1136930381;
        const int PrimeS = 668265261;

        static readonly Vector2[] Gradients =
        {
            new Vector2( 1f, 0f), new Vector2(-1f, 0f), new Vector2( 0f, 1f), new Vector2( 0f,-1f),
            new Vector2( 0.7071f, 0.7071f), new Vector2(-0.7071f, 0.7071f),
            new Vector2( 0.7071f,-0.7071f), new Vector2(-0.7071f,-0.7071f),
            new Vector2( 0.9239f, 0.3827f), new Vector2(-0.9239f, 0.3827f),
            new Vector2( 0.9239f,-0.3827f), new Vector2(-0.9239f,-0.3827f),
            new Vector2( 0.3827f, 0.9239f), new Vector2(-0.3827f, 0.9239f),
            new Vector2( 0.3827f,-0.9239f), new Vector2(-0.3827f,-0.9239f),
        };

        public static int Hash(int seed, int x, int y)
        {
            int h = seed * PrimeS ^ x * PrimeX ^ y * PrimeY;
            h ^= h >> 15;
            h *= unchecked((int)0x2c1b3c6d);
            h ^= h >> 12;
            h *= unchecked((int)0x297a2d39);
            h ^= h >> 15;
            return h;
        }

        /// <summary>Uniform white noise in 0..1 for a lattice cell.</summary>
        public static float White(int seed, int x, int y)
        {
            return (Hash(seed, x, y) & 0x00FFFFFF) / 16777215f;
        }

        /// <summary>Gradient (Perlin style) noise, roughly -1..1.</summary>
        public static float Perlin(float x, float y, int seed)
        {
            int x0 = Mathf.FloorToInt(x);
            int y0 = Mathf.FloorToInt(y);
            float fx = x - x0;
            float fy = y - y0;

            float u = fx * fx * fx * (fx * (fx * 6f - 15f) + 10f);
            float v = fy * fy * fy * (fy * (fy * 6f - 15f) + 10f);

            float n00 = Dot(Gradients[Hash(seed, x0,     y0    ) & 15], fx,        fy);
            float n10 = Dot(Gradients[Hash(seed, x0 + 1, y0    ) & 15], fx - 1f,   fy);
            float n01 = Dot(Gradients[Hash(seed, x0,     y0 + 1) & 15], fx,        fy - 1f);
            float n11 = Dot(Gradients[Hash(seed, x0 + 1, y0 + 1) & 15], fx - 1f,   fy - 1f);

            float a = n00 + u * (n10 - n00);
            float b = n01 + u * (n11 - n01);
            return Mathf.Clamp((a + v * (b - a)) * 1.4142f, -1f, 1f);
        }

        static float Dot(Vector2 g, float x, float y) { return g.x * x + g.y * y; }

        /// <summary>
        /// Perlin noise that tiles seamlessly over a lattice period. Needed for ground textures:
        /// any seam in a terrain albedo shows up as a grid across the whole landscape.
        /// </summary>
        public static float PerlinTiled(float x, float y, int seed, int period)
        {
            if (period < 1) period = 1;
            int x0 = Mathf.FloorToInt(x);
            int y0 = Mathf.FloorToInt(y);
            float fx = x - x0;
            float fy = y - y0;

            float u = fx * fx * fx * (fx * (fx * 6f - 15f) + 10f);
            float v = fy * fy * fy * (fy * (fy * 6f - 15f) + 10f);

            int xa = Wrap(x0, period), xb = Wrap(x0 + 1, period);
            int ya = Wrap(y0, period), yb = Wrap(y0 + 1, period);

            float n00 = Dot(Gradients[Hash(seed, xa, ya) & 15], fx,      fy);
            float n10 = Dot(Gradients[Hash(seed, xb, ya) & 15], fx - 1f, fy);
            float n01 = Dot(Gradients[Hash(seed, xa, yb) & 15], fx,      fy - 1f);
            float n11 = Dot(Gradients[Hash(seed, xb, yb) & 15], fx - 1f, fy - 1f);

            float a = n00 + u * (n10 - n00);
            float b = n01 + u * (n11 - n01);
            return Mathf.Clamp((a + v * (b - a)) * 1.4142f, -1f, 1f);
        }

        static int Wrap(int v, int period)
        {
            int m = v % period;
            return m < 0 ? m + period : m;
        }

        /// <summary>Seamlessly tiling fbm over the given lattice period.</summary>
        public static float FbmTiled(float x, float y, int seed, int octaves, int period, float gain = 0.5f)
        {
            float sum = 0f, amp = 1f, norm = 0f;
            int p = period;
            float fx = x, fy = y;
            for (int i = 0; i < octaves; i++)
            {
                sum += PerlinTiled(fx, fy, seed + i * 7919, p) * amp;
                norm += amp;
                amp *= gain;
                fx *= 2f; fy *= 2f; p *= 2;
            }
            return norm > 0f ? sum / norm : 0f;
        }

        /// <summary>Classic fractal brownian motion. Returns roughly -1..1.</summary>
        public static float Fbm(float x, float y, int seed, int octaves, float lacunarity = 2.02f, float gain = 0.5f)
        {
            float sum = 0f, amp = 1f, norm = 0f, fx = x, fy = y;
            for (int i = 0; i < octaves; i++)
            {
                sum += Perlin(fx, fy, seed + i * 7919) * amp;
                norm += amp;
                amp *= gain;
                fx *= lacunarity;
                fy *= lacunarity;
            }
            return norm > 0f ? sum / norm : 0f;
        }

        /// <summary>
        /// Ridged multifractal. This is the workhorse for Japanese style mountains: sharp,
        /// continuous crest lines with steep flanks rather than rolling dunes. Returns 0..1.
        /// </summary>
        public static float Ridged(float x, float y, int seed, int octaves, float lacunarity = 2.07f, float gain = 0.5f, float sharpness = 1.0f)
        {
            float sum = 0f, amp = 1f, norm = 0f, fx = x, fy = y, prev = 1f;
            for (int i = 0; i < octaves; i++)
            {
                float n = 1f - Mathf.Abs(Perlin(fx, fy, seed + i * 6151));
                n *= n;
                n = Mathf.Pow(n, sharpness);
                sum += n * amp * prev;
                prev = Mathf.Clamp01(n);
                norm += amp;
                amp *= gain;
                fx *= lacunarity;
                fy *= lacunarity;
            }
            return norm > 0f ? Mathf.Clamp01(sum / norm) : 0f;
        }

        /// <summary>Billowy noise, good for rounded worn hill country. Returns 0..1.</summary>
        public static float Billow(float x, float y, int seed, int octaves, float lacunarity = 2.03f, float gain = 0.5f)
        {
            float sum = 0f, amp = 1f, norm = 0f, fx = x, fy = y;
            for (int i = 0; i < octaves; i++)
            {
                sum += Mathf.Abs(Perlin(fx, fy, seed + i * 3571)) * amp;
                norm += amp;
                amp *= gain;
                fx *= lacunarity;
                fy *= lacunarity;
            }
            return norm > 0f ? Mathf.Clamp01(sum / norm) : 0f;
        }

        /// <summary>
        /// Domain warp. Pushing sample coordinates around with a second noise field is what
        /// turns machine-looking ridges into the curved, branching spurs real ranges have.
        /// </summary>
        public static Vector2 Warp(float x, float y, int seed, float frequency, float amplitude, int octaves = 3)
        {
            float wx = Fbm(x * frequency, y * frequency, seed + 11117, octaves);
            float wy = Fbm(x * frequency + 41.7f, y * frequency - 17.3f, seed + 22229, octaves);
            return new Vector2(x + wx * amplitude, y + wy * amplitude);
        }

        /// <summary>Worley / cellular noise. f1 returned, f2 via out param. Both roughly 0..1.5.</summary>
        public static float Worley(float x, float y, int seed, out float f2)
        {
            int xi = Mathf.FloorToInt(x);
            int yi = Mathf.FloorToInt(y);
            float f1 = 9999f;
            f2 = 9999f;
            for (int oy = -1; oy <= 1; oy++)
            for (int ox = -1; ox <= 1; ox++)
            {
                int cx = xi + ox;
                int cy = yi + oy;
                float px = cx + White(seed, cx, cy);
                float py = cy + White(seed + 977, cx, cy);
                float dx = px - x;
                float dy = py - y;
                float d = Mathf.Sqrt(dx * dx + dy * dy);
                if (d < f1) { f2 = f1; f1 = d; }
                else if (d < f2) { f2 = d; }
            }
            return f1;
        }

        /// <summary>Cellular noise that tiles over a lattice period. Used for pebbles and scree in ground textures.</summary>
        public static float WorleyTiled(float x, float y, int seed, int period)
        {
            int xi = Mathf.FloorToInt(x);
            int yi = Mathf.FloorToInt(y);
            float f1 = 9999f;
            for (int oy = -1; oy <= 1; oy++)
            for (int ox = -1; ox <= 1; ox++)
            {
                int cx = xi + ox;
                int cy = yi + oy;
                int wx = Wrap(cx, period);
                int wy = Wrap(cy, period);
                float px = cx + White(seed, wx, wy);
                float py = cy + White(seed + 977, wx, wy);
                float dx = px - x;
                float dy = py - y;
                float d = Mathf.Sqrt(dx * dx + dy * dy);
                if (d < f1) f1 = d;
            }
            return f1;
        }

        public static float SmoothStep(float edge0, float edge1, float v)
        {
            if (Mathf.Approximately(edge0, edge1)) return v < edge0 ? 0f : 1f;
            float t = Mathf.Clamp01((v - edge0) / (edge1 - edge0));
            return t * t * (3f - 2f * t);
        }

        /// <summary>Polynomial smooth maximum. Blends two height fields without a visible crease.</summary>
        public static float SmoothMax(float a, float b, float k)
        {
            if (k <= 0.0001f) return Mathf.Max(a, b);
            float h = Mathf.Clamp01(0.5f + 0.5f * (a - b) / k);
            return Mathf.Lerp(b, a, h) + k * h * (1f - h);
        }

        public static float SmoothMin(float a, float b, float k)
        {
            return -SmoothMax(-a, -b, k);
        }
    }
}
