using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// The pixels behind every surface in the city.
    ///
    /// Each <see cref="CitySurface"/> gets a tiling PBR set: albedo, normal, and an HDRP mask map
    /// (R metallic, G ambient occlusion, B height, A smoothness). The height channel matters more
    /// than usual here, because the facades are single quads: HDRP's pixel displacement reads it
    /// and gives the window openings real parallax, so a flat wall reads as punched masonry from
    /// the street. That is the trade that lets a three thousand building city exist at all.
    ///
    /// Facade textures are laid out on the bay grid — one repeat is
    /// <see cref="BuildingLibrary.UvBays"/> bays across and <see cref="BuildingLibrary.UvFloors"/>
    /// floors up — so the window grid in the texture lands exactly on the window grid the
    /// building was snapped to. Everything else tiles in metres.
    ///
    /// This lives in runtime code with no editor types in it on purpose: the same function that
    /// fills a Texture2D in Unity also fills a PNG in the offline build check, so what gets
    /// looked at before a commit is the same image the engine will load.
    /// </summary>
    public static class FacadeTextures
    {
        public sealed class Spec
        {
            public CitySurface surface;
            public string name;
            public int size = 1024;
            /// <summary>Metres one repeat covers. Facades override this from the bay grid.</summary>
            public float tileMetresX = 4f;
            public float tileMetresY = 4f;
            public bool isFacade;
            /// <summary>An atlas addressed by UV cell rather than a tiling sheet.</summary>
            public bool isAtlas;
            /// <summary>Deliberately one flat colour — glass, paint — so a flatness check is
            /// not evidence the painter did nothing.</summary>
            public bool uniform;
            public float heightScale = 1f;      // normal map strength
            public float displacement;          // centimetres of pixel displacement, 0 to disable
        }

        /// <summary>The scratch buffers a surface is painted into.</summary>
        public sealed class Canvas
        {
            public readonly int Size;
            public readonly Color[] Albedo;
            public readonly float[] Height;
            public readonly float[] Rough;
            public readonly float[] Metal;
            public readonly float[] Ao;
            public readonly int Seed;

            public Canvas(int size, int seed)
            {
                Size = size;
                Albedo = new Color[size * size];
                Height = new float[size * size];
                Rough = new float[size * size];
                Metal = new float[size * size];
                Ao = new float[size * size];
                Seed = seed;
                for (int i = 0; i < Albedo.Length; i++) { Albedo[i] = Color.grey; Rough[i] = 0.7f; Ao[i] = 1f; }
            }

            public int Index(int x, int y) { return Wrap(y, Size) * Size + Wrap(x, Size); }

            public void Set(int x, int y, Color c, float h, float rough, float metal, float ao = 1f)
            {
                int i = Index(x, y);
                Albedo[i] = c; Height[i] = h; Rough[i] = rough; Metal[i] = metal; Ao[i] = ao;
            }

            public void Rect(float x0, float y0, float x1, float y1, Color c, float h, float rough, float metal, float ao = 1f)
            {
                int ix0 = Mathf.FloorToInt(x0 * Size), ix1 = Mathf.CeilToInt(x1 * Size);
                int iy0 = Mathf.FloorToInt(y0 * Size), iy1 = Mathf.CeilToInt(y1 * Size);
                for (int y = iy0; y < iy1; y++)
                for (int x = ix0; x < ix1; x++)
                    Set(x, y, c, h, rough, metal, ao);
            }

            /// <summary>A rectangular outline, for frames and mullions.</summary>
            public void Frame(float x0, float y0, float x1, float y1, float t, Color c, float h, float rough, float metal)
            {
                Rect(x0, y0, x1, y0 + t, c, h, rough, metal);
                Rect(x0, y1 - t, x1, y1, c, h, rough, metal);
                Rect(x0, y0, x0 + t, y1, c, h, rough, metal);
                Rect(x1 - t, y0, x1, y1, c, h, rough, metal);
            }

            /// <summary>A filled ellipse. <paramml/></summary>
            public void Disc(float cx, float cy, float rx, float ry, Color c, float h, float rough, float metal, float ao = 1f)
            {
                int ix0 = Mathf.FloorToInt((cx - rx) * Size), ix1 = Mathf.CeilToInt((cx + rx) * Size);
                int iy0 = Mathf.FloorToInt((cy - ry) * Size), iy1 = Mathf.CeilToInt((cy + ry) * Size);
                for (int y = iy0; y < iy1; y++)
                for (int x = ix0; x < ix1; x++)
                {
                    float dx = ((x + 0.5f) / Size - cx) / Mathf.Max(1e-5f, rx);
                    float dy = ((y + 0.5f) / Size - cy) / Mathf.Max(1e-5f, ry);
                    if (dx * dx + dy * dy > 1f) continue;
                    Set(x, y, c, h, rough, metal, ao);
                }
            }

            /// <summary>An elliptical outline of a given thickness.</summary>
            public void Ring(float cx, float cy, float rx, float ry, float t, Color c, float h, float rough, float metal)
            {
                int ix0 = Mathf.FloorToInt((cx - rx) * Size), ix1 = Mathf.CeilToInt((cx + rx) * Size);
                int iy0 = Mathf.FloorToInt((cy - ry) * Size), iy1 = Mathf.CeilToInt((cy + ry) * Size);
                float inner = 1f - t;
                for (int y = iy0; y < iy1; y++)
                for (int x = ix0; x < ix1; x++)
                {
                    float dx = ((x + 0.5f) / Size - cx) / Mathf.Max(1e-5f, rx);
                    float dy = ((y + 0.5f) / Size - cy) / Mathf.Max(1e-5f, ry);
                    float d = dx * dx + dy * dy;
                    if (d > 1f || d < inner * inner) continue;
                    Set(x, y, c, h, rough, metal);
                }
            }

            /// <summary>A thick line segment, with round-ish ends.</summary>
            public void Line(float x0, float y0, float x1, float y1, float width, Color c, float h, float rough, float metal)
            {
                float lo = Mathf.Min(x0, x1) - width, hi = Mathf.Max(x0, x1) + width;
                float vlo = Mathf.Min(y0, y1) - width, vhi = Mathf.Max(y0, y1) + width;
                int ix0 = Mathf.FloorToInt(lo * Size), ix1 = Mathf.CeilToInt(hi * Size);
                int iy0 = Mathf.FloorToInt(vlo * Size), iy1 = Mathf.CeilToInt(vhi * Size);
                float ax = x1 - x0, ay = y1 - y0;
                float len2 = Mathf.Max(1e-8f, ax * ax + ay * ay);
                for (int y = iy0; y < iy1; y++)
                for (int x = ix0; x < ix1; x++)
                {
                    float px = (x + 0.5f) / Size - x0, py = (y + 0.5f) / Size - y0;
                    float t = Mathf.Clamp01((px * ax + py * ay) / len2);
                    float dx = px - ax * t, dy = py - ay * t;
                    if (dx * dx + dy * dy > width * width) continue;
                    Set(x, y, c, h, rough, metal);
                }
            }

            /// <summary>A filled triangle, by barycentric test.</summary>
            public void Tri(Vector2 a, Vector2 b, Vector2 cc, Color col, float h, float rough, float metal)
            {
                float lox = Mathf.Min(a.x, Mathf.Min(b.x, cc.x)), hix = Mathf.Max(a.x, Mathf.Max(b.x, cc.x));
                float loy = Mathf.Min(a.y, Mathf.Min(b.y, cc.y)), hiy = Mathf.Max(a.y, Mathf.Max(b.y, cc.y));
                int ix0 = Mathf.FloorToInt(lox * Size), ix1 = Mathf.CeilToInt(hix * Size);
                int iy0 = Mathf.FloorToInt(loy * Size), iy1 = Mathf.CeilToInt(hiy * Size);
                float d = (b.y - cc.y) * (a.x - cc.x) + (cc.x - b.x) * (a.y - cc.y);
                if (Mathf.Abs(d) < 1e-8f) return;
                for (int y = iy0; y < iy1; y++)
                for (int x = ix0; x < ix1; x++)
                {
                    float px = (x + 0.5f) / Size, py = (y + 0.5f) / Size;
                    float w0 = ((b.y - cc.y) * (px - cc.x) + (cc.x - b.x) * (py - cc.y)) / d;
                    float w1 = ((cc.y - a.y) * (px - cc.x) + (a.x - cc.x) * (py - cc.y)) / d;
                    float w2 = 1f - w0 - w1;
                    if (w0 < 0f || w1 < 0f || w2 < 0f) continue;
                    Set(x, y, col, h, rough, metal);
                }
            }

            /// <summary>Dirt washing down from a ledge. Every real building has this and no
            /// procedural one ever does, which is most of why they look procedural.</summary>
            public void Streak(float x0, float x1, float yTop, float length, float strength, int seed)
            {
                int ix0 = Mathf.FloorToInt(x0 * Size), ix1 = Mathf.CeilToInt(x1 * Size);
                int iyTop = Mathf.FloorToInt(yTop * Size);
                int len = Mathf.CeilToInt(length * Size);
                for (int x = ix0; x < ix1; x++)
                {
                    float w = KontoNoise.White(seed, x, 3);
                    if (w > 0.55f) continue;
                    float run = len * (0.3f + w * 1.4f);
                    for (int k = 0; k < run; k++)
                    {
                        float t = k / Mathf.Max(1f, run);
                        float a = strength * (1f - t) * (1f - t) * (0.5f + KontoNoise.White(seed + 1, x, k) * 0.5f);
                        int i = Index(x, iyTop - k);
                        Albedo[i] = Color.Lerp(Albedo[i], new Color(0.16f, 0.15f, 0.13f), a);
                        Rough[i] = Mathf.Clamp01(Rough[i] + a * 0.35f);
                        Ao[i] = Mathf.Clamp01(Ao[i] - a * 0.25f);
                    }
                }
            }

            public void Grain(float amount, float scale, int seed)
            {
                for (int y = 0; y < Size; y++)
                for (int x = 0; x < Size; x++)
                {
                    float u = x / (float)Size * scale, v = y / (float)Size * scale;
                    float n = KontoNoise.FbmTiled(u, v, seed, 4, Mathf.Max(1, Mathf.RoundToInt(scale)));
                    int i = y * Size + x;
                    float g = 1f + n * amount;
                    Albedo[i] = new Color(Mathf.Clamp01(Albedo[i].r * g), Mathf.Clamp01(Albedo[i].g * g),
                                          Mathf.Clamp01(Albedo[i].b * g), 1f);
                    Rough[i] = Mathf.Clamp01(Rough[i] - n * amount * 0.4f);
                }
            }

            static int Wrap(int v, int size) { int m = v % size; return m < 0 ? m + size : m; }
        }

        // ------------------------------------------------------------------ the catalogue

        public static Spec[] All(float bayWidth = 3.2f, float floorHeight = 3.6f)
        {
            float fx = bayWidth * BuildingLibrary.UvBays;
            float fy = floorHeight * BuildingLibrary.UvFloors;
            return new[]
            {
                new Spec { surface = CitySurface.GlassCurtain, name = "GlassCurtain", tileMetresX = fx, tileMetresY = fy, isFacade = true, heightScale = 0.7f, displacement = 1.5f },
                new Spec { surface = CitySurface.Precast,     name = "Precast",      tileMetresX = fx, tileMetresY = fy, isFacade = true, heightScale = 1.6f, displacement = 5f },
                new Spec { surface = CitySurface.PrecastSand, name = "PrecastSand",  tileMetresX = fx, tileMetresY = fy, isFacade = true, heightScale = 1.6f, displacement = 5f },
                new Spec { surface = CitySurface.Tile,        name = "Tile",         tileMetresX = fx, tileMetresY = fy, isFacade = true, heightScale = 1.5f, displacement = 4f },
                new Spec { surface = CitySurface.TileWhite,   name = "TileWhite",    tileMetresX = fx, tileMetresY = fy, isFacade = true, heightScale = 1.5f, displacement = 4f },
                new Spec { surface = CitySurface.Render,      name = "Render",       tileMetresX = fx, tileMetresY = fy, isFacade = true, heightScale = 1.4f, displacement = 4f },
                new Spec { surface = CitySurface.RenderGrey,  name = "RenderGrey",   tileMetresX = fx, tileMetresY = fy, isFacade = true, heightScale = 1.4f, displacement = 4f },
                new Spec { surface = CitySurface.Siding,       name = "Siding",       tileMetresX = fx, tileMetresY = fy, isFacade = true, heightScale = 1.2f, displacement = 3f },
                new Spec { surface = CitySurface.Corrugated,   name = "Corrugated",   tileMetresX = fx, tileMetresY = fy, isFacade = true, heightScale = 1.3f, displacement = 2f },
                new Spec { surface = CitySurface.Stone,        name = "Stone",        tileMetresX = fx, tileMetresY = fy, isFacade = true, heightScale = 1.5f, displacement = 4f },
                new Spec { surface = CitySurface.Shopfront,    name = "Shopfront",    tileMetresX = fx, tileMetresY = fy * 0.5f, isFacade = true, heightScale = 1.1f, displacement = 2f },
                new Spec { surface = CitySurface.RoofMembrane, name = "RoofMembrane", tileMetresX = 6f, tileMetresY = 6f, heightScale = 0.8f },
                new Spec { surface = CitySurface.RoofTile,     name = "RoofTile",     tileMetresX = 2.4f, tileMetresY = 2.4f, heightScale = 2.0f, displacement = 2f },
                new Spec { surface = CitySurface.RoofMetal,    name = "RoofMetal",    tileMetresX = 3f, tileMetresY = 3f, heightScale = 1.1f },
                new Spec { surface = CitySurface.TrimMetal,    name = "TrimMetal",    tileMetresX = 2f, tileMetresY = 2f, heightScale = 0.5f },
                new Spec { surface = CitySurface.DarkMetal,    name = "DarkMetal",    tileMetresX = 2f, tileMetresY = 2f, heightScale = 0.7f },
                new Spec { surface = CitySurface.Signage,      name = "Signage",      tileMetresX = 2.4f, tileMetresY = 2.4f, heightScale = 0.6f },
                new Spec { surface = CitySurface.Concrete,     name = "Concrete",     tileMetresX = 5f, tileMetresY = 5f, heightScale = 1.0f },

                // Traffic. Car paint is white here and tinted per vehicle at runtime, so one
                // material carries every colour on the road.
                new Spec { surface = CitySurface.CarPaint, name = "CarPaint", tileMetresX = 2f, tileMetresY = 2f, heightScale = 0.3f, uniform = true },
                new Spec { surface = CitySurface.CarGlass, name = "CarGlass", tileMetresX = 2f, tileMetresY = 2f, heightScale = 0.3f, uniform = true },
                new Spec { surface = CitySurface.CarTrim,  name = "CarTrim",  tileMetresX = 1f, tileMetresY = 1f, heightScale = 0.5f, uniform = true },
                new Spec { surface = CitySurface.CarLight, name = "CarLight", tileMetresX = 1f, tileMetresY = 1f, heightScale = 0.6f },
                new Spec { surface = CitySurface.Tyre,     name = "Tyre",     tileMetresX = 0.5f, tileMetresY = 0.5f, heightScale = 1.4f },
                // The livery sheet is an atlas, not a tile: badges, plates and signs, addressed
                // by UV cell. See VehicleLibrary.
                new Spec { surface = CitySurface.Livery,   name = "Livery",   tileMetresX = 1f, tileMetresY = 1f, isAtlas = true, heightScale = 0.4f },
            };
        }

        // ------------------------------------------------------------------ generation

        public static void Generate(Spec spec, int seed,
            out Color[] albedo, out Color[] normal, out Color[] mask)
        {
            var c = new Canvas(spec.size, seed);
            switch (spec.surface)
            {
                case CitySurface.GlassCurtain: PaintCurtainWall(c); break;
                case CitySurface.Precast: PaintPunched(c, new Color(0.60f, 0.59f, 0.56f), new Color(0.52f, 0.51f, 0.49f), 0.62f, true, false); break;
                case CitySurface.PrecastSand: PaintPunched(c, new Color(0.66f, 0.62f, 0.54f), new Color(0.56f, 0.53f, 0.46f), 0.64f, true, false); break;
                case CitySurface.Tile: PaintTiled(c, new Color(0.66f, 0.62f, 0.56f), new Color(0.55f, 0.52f, 0.47f)); break;
                case CitySurface.TileWhite: PaintTiled(c, new Color(0.80f, 0.79f, 0.75f), new Color(0.69f, 0.68f, 0.65f)); break;
                case CitySurface.Render: PaintPunched(c, new Color(0.72f, 0.69f, 0.63f), new Color(0.63f, 0.60f, 0.55f), 0.74f, false, true); break;
                case CitySurface.RenderGrey: PaintPunched(c, new Color(0.58f, 0.58f, 0.57f), new Color(0.49f, 0.49f, 0.49f), 0.76f, false, true); break;
                case CitySurface.Siding: PaintSiding(c); break;
                case CitySurface.Corrugated: PaintCorrugated(c); break;
                case CitySurface.Stone: PaintStone(c); break;
                case CitySurface.Shopfront: PaintShopfront(c); break;
                case CitySurface.RoofMembrane: PaintMembrane(c); break;
                case CitySurface.RoofTile: PaintKawara(c); break;
                case CitySurface.RoofMetal: PaintSeamedMetal(c); break;
                case CitySurface.TrimMetal: PaintAnodised(c); break;
                case CitySurface.DarkMetal: PaintPaintedSteel(c); break;
                case CitySurface.Signage: PaintSignage(c); break;
                case CitySurface.CarPaint: PaintCarPaint(c); break;
                case CitySurface.CarGlass: PaintCarGlass(c); break;
                case CitySurface.CarTrim: PaintCarTrim(c); break;
                case CitySurface.CarLight: PaintCarLight(c); break;
                case CitySurface.Tyre: PaintTyre(c); break;
                case CitySurface.Livery: PaintLivery(c); break;
                default: PaintConcrete(c); break;
            }
            Resolve(c, spec, out albedo, out normal, out mask);
        }

        static void Resolve(Canvas c, Spec spec, out Color[] albedo, out Color[] normal, out Color[] mask)
        {
            int n = c.Size;
            albedo = c.Albedo;
            normal = new Color[n * n];
            mask = new Color[n * n];

            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float hl = c.Height[c.Index(x - 1, y)], hr = c.Height[c.Index(x + 1, y)];
                float hd = c.Height[c.Index(x, y - 1)], hu = c.Height[c.Index(x, y + 1)];
                Vector3 nrm = new Vector3((hl - hr) * spec.heightScale * 4f,
                                          (hd - hu) * spec.heightScale * 4f, 1f).normalized;
                int i = y * n + x;
                normal[i] = new Color(nrm.x * 0.5f + 0.5f, nrm.y * 0.5f + 0.5f, nrm.z * 0.5f + 0.5f, 1f);

                // A cheap cavity term on top of whatever the painter asked for: anything sunk
                // below its neighbours picks up contact darkening, which is what sells a reveal.
                float around = (hl + hr + hd + hu) * 0.25f;
                float cavity = Mathf.Clamp01(1f + (c.Height[i] - around) * 2.2f);
                float ao = Mathf.Clamp01(c.Ao[i] * Mathf.Lerp(0.55f, 1f, cavity));

                mask[i] = new Color(Mathf.Clamp01(c.Metal[i]), ao,
                                    Mathf.Clamp01(c.Height[i] * 0.5f + 0.5f),
                                    Mathf.Clamp01(1f - c.Rough[i]));
            }
        }

        // ------------------------------------------------------------------ painters
        // Everything below works in 0..1 texture space. One repeat is UvBays bays wide and
        // UvFloors floors tall, so a bay is 1/UvBays across and a floor 1/UvFloors up.

        const int Bays = BuildingLibrary.UvBays;
        const int Floors = BuildingLibrary.UvFloors;

        static float Rnd(Canvas c, int a, int b) { return KontoNoise.White(c.Seed + 977, a, b); }

        static Color Tint(Color c, float f)
        {
            return new Color(Mathf.Clamp01(c.r * f), Mathf.Clamp01(c.g * f), Mathf.Clamp01(c.b * f), 1f);
        }

        /// <summary>Sealed curtain wall: mullions, transoms, spandrel bands, vision glass.</summary>
        static void PaintCurtainWall(Canvas c)
        {
            var spandrel = new Color(0.17f, 0.19f, 0.21f);
            var mullion = new Color(0.44f, 0.46f, 0.47f);
            c.Rect(0f, 0f, 1f, 1f, spandrel, 0.42f, 0.55f, 0.2f);

            float bw = 1f / Bays, fh = 1f / Floors;
            for (int f = 0; f < Floors; f++)
            for (int b = 0; b < Bays; b++)
            {
                float x0 = b * bw, y0 = f * fh;
                // Spandrel across the bottom quarter of every floor, glass above it.
                float glassY0 = y0 + fh * 0.26f, glassY1 = y0 + fh * 0.97f;
                float r = Rnd(c, b, f);
                // Japanese towers are glazed in a green-blue; the variation between panes is
                // mostly what stops a curtain wall reading as a single flat sheet.
                Color glass = Color.Lerp(new Color(0.10f, 0.16f, 0.18f), new Color(0.17f, 0.26f, 0.29f), r);
                if (r > 0.88f) glass = new Color(0.34f, 0.36f, 0.35f);          // blind down
                c.Rect(x0 + bw * 0.03f, glassY0, x0 + bw * 0.97f, glassY1, glass, 0.30f, 0.06f, 0.0f);

                // A split light: one transom across the middle of the pane.
                float mid = Mathf.Lerp(glassY0, glassY1, 0.62f);
                c.Rect(x0 + bw * 0.03f, mid, x0 + bw * 0.97f, mid + fh * 0.018f, mullion, 0.52f, 0.30f, 0.85f);
            }

            // Mullions: vertical at every bay line, transom at every floor line.
            for (int b = 0; b <= Bays; b++)
                c.Rect(b * bw - 0.006f, 0f, b * bw + 0.006f, 1f, mullion, 0.62f, 0.28f, 0.85f);
            for (int f = 0; f <= Floors; f++)
                c.Rect(0f, f * fh - 0.005f, 1f, f * fh + 0.005f, mullion, 0.58f, 0.28f, 0.85f);

            c.Grain(0.05f, 8f, c.Seed + 3);
        }

        /// <summary>
        /// A concrete or rendered frame with a punched window in every bay: the ordinary Japanese
        /// office and apartment block. The window is cut deep into the height map, which is what
        /// the pixel displacement turns into a real reveal.
        /// </summary>
        static void PaintPunched(Canvas c, Color wall, Color wallDark, float rough, bool bands, bool airCon)
        {
            c.Rect(0f, 0f, 1f, 1f, wall, 0.62f, rough, 0f);

            float bw = 1f / Bays, fh = 1f / Floors;
            for (int f = 0; f < Floors; f++)
            for (int b = 0; b < Bays; b++)
            {
                float x0 = b * bw, y0 = f * fh;
                float wx0 = x0 + bw * 0.20f, wx1 = x0 + bw * 0.80f;
                float wy0 = y0 + fh * 0.22f, wy1 = y0 + fh * 0.84f;
                float r = Rnd(c, b * 7 + 1, f * 13 + 5);

                // Reveal: the wall steps back before the frame does.
                c.Rect(wx0 - bw * 0.02f, wy0 - fh * 0.02f, wx1 + bw * 0.02f, wy1 + fh * 0.02f,
                    Tint(wallDark, 0.9f), 0.30f, rough, 0f, 0.7f);

                Color glass = Color.Lerp(new Color(0.09f, 0.12f, 0.14f), new Color(0.16f, 0.21f, 0.24f), r);
                if (r > 0.84f) glass = new Color(0.52f, 0.50f, 0.46f);           // curtain or blind
                else if (r > 0.76f) glass = new Color(0.30f, 0.31f, 0.30f);
                c.Rect(wx0, wy0, wx1, wy1, glass, 0.06f, 0.07f, 0f, 0.8f);

                // Frame and a centre mullion: two lights, which is what an office window is.
                var frame = new Color(0.40f, 0.41f, 0.42f);
                c.Frame(wx0, wy0, wx1, wy1, bw * 0.035f, frame, 0.20f, 0.32f, 0.8f);
                float mx = (wx0 + wx1) * 0.5f;
                c.Rect(mx - bw * 0.014f, wy0, mx + bw * 0.014f, wy1, frame, 0.20f, 0.32f, 0.8f);

                // Sill, and the stain that runs off it.
                c.Rect(wx0 - bw * 0.05f, wy0 - fh * 0.035f, wx1 + bw * 0.05f, wy0, Tint(wall, 1.05f), 0.78f, rough * 0.9f, 0f);
                c.Streak(wx0, wx1, wy0 - fh * 0.035f, fh * 0.55f, 0.26f, c.Seed + b * 31 + f * 17);

                if (airCon && r < 0.30f)
                {
                    // A condenser bolted under the window, on a bracket. Ubiquitous.
                    float ax0 = x0 + bw * 0.58f, ax1 = x0 + bw * 0.86f;
                    float ay0 = y0 + fh * 0.06f, ay1 = y0 + fh * 0.19f;
                    c.Rect(ax0, ay0, ax1, ay1, new Color(0.62f, 0.62f, 0.60f), 0.90f, 0.42f, 0.35f);
                    c.Rect(ax0 + 0.004f, ay0 + 0.004f, ax1 - 0.004f, ay1 - 0.004f, new Color(0.34f, 0.34f, 0.33f), 0.86f, 0.55f, 0.3f, 0.75f);
                }
            }

            if (bands)
            {
                // Floor band and a panel joint under it.
                for (int f = 0; f <= Floors; f++)
                {
                    float y = f / (float)Floors;
                    c.Rect(0f, y - 0.004f, 1f, y + 0.012f, Tint(wall, 1.06f), 0.80f, rough * 0.92f, 0f);
                    c.Rect(0f, y - 0.007f, 1f, y - 0.004f, Tint(wallDark, 0.7f), 0.36f, rough, 0f, 0.6f);
                    c.Streak(0f, 1f, y - 0.007f, 0.055f, 0.16f, c.Seed + f * 101);
                }
                // Vertical panel joints on the bay lines.
                for (int b = 0; b <= Bays; b++)
                {
                    float x = b / (float)Bays;
                    c.Rect(x - 0.0025f, 0f, x + 0.0025f, 1f, Tint(wallDark, 0.75f), 0.42f, rough, 0f, 0.7f);
                }
            }

            c.Grain(0.10f, 10f, c.Seed + 7);
        }

        /// <summary>Small ceramic tile over the upper floors: the shophouse and the 1980s block.</summary>
        static void PaintTiled(Canvas c, Color baseCol, Color darkCol)
        {
            PaintPunched(c, baseCol, darkCol, 0.58f, false, true);

            // 45 mm tiles with a grout line, over the top of everything that is still wall.
            int n = c.Size;
            float tilesAcross = 22f * Bays;     // about 45 mm at a 3.2 m bay
            float tilesUp = 26f * Floors;
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                int i = y * n + x;
                if (c.Height[i] < 0.5f) continue;                 // leave windows and reveals alone
                float u = x / (float)n * tilesAcross, v = y / (float)n * tilesUp;
                float gx = Mathf.Abs(u - Mathf.Floor(u) - 0.5f) * 2f;
                float gy = Mathf.Abs(v - Mathf.Floor(v) - 0.5f) * 2f;
                float joint = Mathf.Max(gx, gy);
                int tx = Mathf.FloorToInt(u), ty = Mathf.FloorToInt(v);
                float shade = 0.88f + KontoNoise.White(c.Seed + 51, tx, ty) * 0.24f;
                Color col = Tint(c.Albedo[i], shade);
                if (joint > 0.86f)
                {
                    c.Albedo[i] = Tint(col, 0.66f);
                    c.Height[i] -= 0.07f;
                    c.Rough[i] = Mathf.Clamp01(c.Rough[i] + 0.2f);
                    c.Ao[i] *= 0.82f;
                }
                else
                {
                    c.Albedo[i] = col;
                    c.Rough[i] = Mathf.Clamp01(c.Rough[i] - 0.18f);   // glazed tile is shiny
                }
            }
        }

        static void PaintSiding(Canvas c)
        {
            PaintPunched(c, new Color(0.74f, 0.71f, 0.66f), new Color(0.63f, 0.60f, 0.56f), 0.70f, false, false);
            int n = c.Size;
            float boards = 7f * Floors;
            for (int y = 0; y < n; y++)
            {
                float v = y / (float)n * boards;
                float f = v - Mathf.Floor(v);
                float h = (f < 0.10f) ? -0.10f : (0.02f + f * 0.05f);
                for (int x = 0; x < n; x++)
                {
                    int i = y * n + x;
                    if (c.Height[i] < 0.5f) continue;
                    c.Height[i] = 0.62f + h;
                    c.Albedo[i] = Tint(c.Albedo[i], f < 0.10f ? 0.80f : 0.94f + f * 0.16f);
                    if (f < 0.10f) c.Ao[i] *= 0.74f;
                }
            }
        }

        static void PaintCorrugated(Canvas c)
        {
            var steel = new Color(0.55f, 0.56f, 0.56f);
            c.Rect(0f, 0f, 1f, 1f, steel, 0.6f, 0.42f, 0.55f);
            int n = c.Size;
            float ribs = 22f * Bays;
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float u = x / (float)n * ribs;
                float w = Mathf.Sin(u * Mathf.PI * 2f);
                int i = y * n + x;
                c.Height[i] = 0.6f + w * 0.28f;
                c.Albedo[i] = Tint(steel, 0.88f + w * 0.14f);
            }
            // A strip window band across one floor, and rust at the bottom.
            float fh = 1f / Floors;
            c.Rect(0f, fh * 2.2f, 1f, fh * 2.75f, new Color(0.13f, 0.16f, 0.18f), 0.32f, 0.12f, 0f, 0.8f);
            for (int b = 0; b <= Bays * 4; b++)
                c.Rect(b / (float)(Bays * 4) - 0.003f, fh * 2.2f, b / (float)(Bays * 4) + 0.003f, fh * 2.75f,
                    new Color(0.45f, 0.46f, 0.46f), 0.40f, 0.35f, 0.7f);
            for (int x = 0; x < n; x++)
            {
                float rust = KontoNoise.FbmTiled(x / (float)n * 6f, 0.5f, c.Seed + 13, 3, 6);
                if (rust < 0.12f) continue;
                int run = Mathf.RoundToInt(n * 0.10f * rust);
                for (int k = 0; k < run; k++)
                {
                    int i = c.Index(x, k);
                    float a = (1f - k / (float)Mathf.Max(1, run)) * 0.5f;
                    c.Albedo[i] = Color.Lerp(c.Albedo[i], new Color(0.31f, 0.18f, 0.11f), a);
                    c.Rough[i] = Mathf.Clamp01(c.Rough[i] + a * 0.4f);
                    c.Metal[i] *= 1f - a;
                }
            }
            c.Grain(0.06f, 12f, c.Seed + 19);
        }

        static void PaintStone(Canvas c)
        {
            var stone = new Color(0.68f, 0.66f, 0.62f);
            c.Rect(0f, 0f, 1f, 1f, stone, 0.64f, 0.62f, 0f);
            float bw = 1f / Bays, fh = 1f / Floors;

            // Tall bays with a deep reveal: civic buildings are mostly wall.
            for (int f = 0; f < Floors; f++)
            for (int b = 0; b < Bays; b++)
            {
                float x0 = b * bw, y0 = f * fh;
                float wx0 = x0 + bw * 0.30f, wx1 = x0 + bw * 0.70f;
                float wy0 = y0 + fh * 0.16f, wy1 = y0 + fh * 0.88f;
                c.Rect(wx0 - bw * 0.04f, wy0 - fh * 0.03f, wx1 + bw * 0.04f, wy1 + fh * 0.03f,
                    Tint(stone, 0.86f), 0.26f, 0.66f, 0f, 0.65f);
                c.Rect(wx0, wy0, wx1, wy1, new Color(0.10f, 0.13f, 0.15f), 0.04f, 0.08f, 0f, 0.75f);
                c.Frame(wx0, wy0, wx1, wy1, bw * 0.03f, new Color(0.35f, 0.36f, 0.36f), 0.18f, 0.3f, 0.8f);
            }

            // Ashlar coursing.
            int n = c.Size;
            float courses = 3f * Floors, blocks = 3f * Bays;
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                int i = y * n + x;
                if (c.Height[i] < 0.5f) continue;
                float v = y / (float)n * courses;
                int row = Mathf.FloorToInt(v);
                float u = x / (float)n * blocks + (row % 2 == 0 ? 0f : 0.5f);
                float jy = Mathf.Abs(v - Mathf.Floor(v) - 0.5f) * 2f;
                float jx = Mathf.Abs(u - Mathf.Floor(u) - 0.5f) * 2f;
                if (Mathf.Max(jx, jy) > 0.965f)
                {
                    c.Albedo[i] = Tint(c.Albedo[i], 0.72f);
                    c.Height[i] -= 0.09f;
                    c.Ao[i] *= 0.8f;
                }
                else
                {
                    float sh = 0.93f + KontoNoise.White(c.Seed + 71, Mathf.FloorToInt(u), row) * 0.14f;
                    c.Albedo[i] = Tint(c.Albedo[i], sh);
                }
            }
            c.Grain(0.07f, 9f, c.Seed + 23);
        }

        /// <summary>Ground floor: a dark frame, big glazing, and a sign band over the top.</summary>
        static void PaintShopfront(Canvas c)
        {
            var frame = new Color(0.14f, 0.14f, 0.15f);
            c.Rect(0f, 0f, 1f, 1f, frame, 0.62f, 0.45f, 0.3f);

            int units = Bays;                       // one shop per bay, glazed in two lights
            for (int u = 0; u < units; u++)
            {
                float ux0 = u / (float)units, ux1 = (u + 1) / (float)units;
                float ur = Rnd(c, u, 7);
                bool shut = ur > 0.80f;
                // What is behind the glass: a lit shop, or a shutter down for the night.
                Color inside = shut
                    ? new Color(0.27f, 0.27f, 0.28f)
                    : Color.Lerp(new Color(0.20f, 0.19f, 0.17f), new Color(0.40f, 0.36f, 0.29f), Rnd(c, u, 11));
                c.Rect(ux0 + 0.004f, 0.06f, ux1 - 0.004f, 0.74f, inside, 0.24f, shut ? 0.62f : 0.09f, 0f, 0.8f);

                if (shut)
                {
                    // Roller shutter: horizontal ribs, and they catch the light.
                    int ribs = 26;
                    for (int k = 0; k < ribs; k++)
                    {
                        float y = 0.06f + (0.68f * k) / ribs;
                        c.Rect(ux0 + 0.004f, y, ux1 - 0.004f, y + 0.34f / ribs,
                            Tint(inside, 1.18f), 0.27f, 0.5f, 0.25f);
                    }
                }
                else
                {
                    // A back wall and a counter, so the depth reads even at a glance.
                    c.Rect(ux0 + 0.02f, 0.06f, ux1 - 0.02f, 0.20f, Tint(inside, 0.55f), 0.22f, 0.5f, 0f, 0.6f);
                    c.Rect(ux0 + 0.02f, 0.55f, ux1 - 0.02f, 0.70f, Tint(inside, 1.7f), 0.23f, 0.3f, 0f);
                    // The doorway into the unit, on one side.
                    float dx = ur < 0.5f ? ux0 + 0.05f : ux1 - 0.28f;
                    c.Rect(dx, 0.06f, dx + 0.22f, 0.62f, Tint(inside, 0.75f), 0.25f, 0.2f, 0f, 0.7f);
                }
                // Mullions between the lights.
                float mid = (ux0 + ux1) * 0.5f;
                c.Rect(mid - 0.004f, 0.06f, mid + 0.004f, 0.74f, new Color(0.19f, 0.19f, 0.20f), 0.58f, 0.4f, 0.4f);
                c.Rect(ux0 - 0.006f, 0.06f, ux0 + 0.006f, 0.74f, new Color(0.17f, 0.17f, 0.18f), 0.60f, 0.4f, 0.4f);
            }
            // Stall riser, sign band, and the shutter box above it.
            c.Rect(0f, 0f, 1f, 0.06f, new Color(0.20f, 0.20f, 0.21f), 0.66f, 0.5f, 0.2f);
            c.Rect(0f, 0.74f, 1f, 0.80f, new Color(0.18f, 0.18f, 0.19f), 0.70f, 0.5f, 0.2f);
            c.Rect(0f, 0.80f, 1f, 1f, new Color(0.56f, 0.54f, 0.50f), 0.74f, 0.55f, 0.05f);
            for (int i = 0; i < Bays; i++)
            {
                float x0 = i / (float)Bays + 0.02f, x1 = (i + 1) / (float)Bays - 0.02f;
                float r = Rnd(c, i, 29);
                Color sign = r < 0.3f ? new Color(0.62f, 0.13f, 0.12f)
                           : r < 0.55f ? new Color(0.10f, 0.22f, 0.45f)
                           : r < 0.8f ? new Color(0.92f, 0.90f, 0.86f)
                           : new Color(0.14f, 0.36f, 0.24f);
                c.Rect(x0, 0.83f, x1, 0.97f, sign, 0.78f, 0.35f, 0f);
            }
            c.Grain(0.05f, 10f, c.Seed + 31);
        }

        static void PaintMembrane(Canvas c)
        {
            var felt = new Color(0.27f, 0.27f, 0.28f);
            c.Rect(0f, 0f, 1f, 1f, felt, 0.6f, 0.78f, 0f);
            // Sheet laps every metre or so, running one way.
            for (int i = 0; i <= 6; i++)
                c.Rect(0f, i / 6f - 0.004f, 1f, i / 6f + 0.004f, Tint(felt, 0.86f), 0.66f, 0.7f, 0f);
            int n = c.Size;
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                int i = y * n + x;
                float p = KontoNoise.FbmTiled(x / (float)n * 5f, y / (float)n * 5f, c.Seed + 37, 4, 5);
                if (p > 0.22f)
                {
                    // Standing water and the grime that collects in it.
                    float a = Mathf.Clamp01((p - 0.22f) * 3f);
                    c.Albedo[i] = Color.Lerp(c.Albedo[i], new Color(0.18f, 0.19f, 0.19f), a * 0.7f);
                    c.Rough[i] = Mathf.Lerp(c.Rough[i], 0.14f, a);
                    c.Height[i] -= a * 0.06f;
                }
                else if (p < -0.24f)
                {
                    c.Albedo[i] = Color.Lerp(c.Albedo[i], new Color(0.46f, 0.45f, 0.42f), 0.5f);
                    c.Rough[i] = 0.9f;
                }
            }
            c.Grain(0.08f, 14f, c.Seed + 41);
        }

        /// <summary>Kawara: rows of pantiles, the thing that makes a Japanese roof a Japanese roof.</summary>
        static void PaintKawara(Canvas c)
        {
            var tile = new Color(0.22f, 0.24f, 0.26f);
            c.Rect(0f, 0f, 1f, 1f, tile, 0.5f, 0.42f, 0.05f);
            int n = c.Size;
            const float cols = 8f, rows = 6f;
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float v = y / (float)n * rows;
                int row = Mathf.FloorToInt(v);
                float fv = v - row;
                float u = x / (float)n * cols + (row % 2 == 0 ? 0f : 0.5f);
                int col = Mathf.FloorToInt(u);
                float fu = u - col;

                // Each tile is a shallow barrel with a raised roll on one edge.
                float roll = Mathf.Exp(-Mathf.Pow((fu - 0.08f) / 0.11f, 2f));
                float pan = Mathf.Sin(fu * Mathf.PI) * 0.35f;
                float lap = fv < 0.14f ? -0.22f : 0f;
                int i = y * n + x;
                c.Height[i] = 0.5f + roll * 0.42f + pan * 0.18f + lap;
                float shade = 0.82f + KontoNoise.White(c.Seed + 83, col, row) * 0.3f + roll * 0.2f;
                c.Albedo[i] = Tint(tile, shade);
                c.Rough[i] = 0.34f + (1f - roll) * 0.2f;
                c.Ao[i] = fv < 0.14f ? 0.62f : 1f;
            }
            c.Grain(0.05f, 10f, c.Seed + 47);
        }

        static void PaintSeamedMetal(Canvas c)
        {
            var steel = new Color(0.44f, 0.46f, 0.47f);
            c.Rect(0f, 0f, 1f, 1f, steel, 0.6f, 0.34f, 0.65f);
            for (int i = 0; i <= 8; i++)
            {
                float x = i / 8f;
                c.Rect(x - 0.007f, 0f, x + 0.007f, 1f, Tint(steel, 1.12f), 0.84f, 0.28f, 0.7f);
            }
            c.Grain(0.05f, 12f, c.Seed + 53);
        }

        static void PaintAnodised(Canvas c)
        {
            var al = new Color(0.63f, 0.65f, 0.66f);
            c.Rect(0f, 0f, 1f, 1f, al, 0.6f, 0.30f, 0.92f);
            int n = c.Size;
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                int i = y * n + x;
                float b = KontoNoise.PerlinTiled(x / (float)n * 64f, y / (float)n * 2f, c.Seed + 59, 64) * 0.5f;
                c.Albedo[i] = Tint(al, 1f + b * 0.12f);
                c.Rough[i] = Mathf.Clamp01(0.3f + b * 0.12f);
            }
        }

        static void PaintPaintedSteel(Canvas c)
        {
            var paint = new Color(0.26f, 0.27f, 0.28f);
            c.Rect(0f, 0f, 1f, 1f, paint, 0.6f, 0.45f, 0.25f);
            c.Grain(0.10f, 16f, c.Seed + 61);
            int n = c.Size;
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                int i = y * n + x;
                float w = KontoNoise.WorleyTiled(x / (float)n * 14f, y / (float)n * 14f, c.Seed + 67, 14);
                if (w < 0.74f) continue;                      // rust only at the isolated spots
                float a = Mathf.Clamp01((w - 0.74f) * 3.4f);
                c.Albedo[i] = Color.Lerp(c.Albedo[i], new Color(0.34f, 0.21f, 0.14f), a * 0.55f);
                c.Rough[i] = Mathf.Clamp01(c.Rough[i] + a * 0.35f);
            }
        }

        static void PaintSignage(Canvas c)
        {
            // A board of stacked sign panels. Faces the street, so it wants colour.
            c.Rect(0f, 0f, 1f, 1f, new Color(0.12f, 0.12f, 0.13f), 0.6f, 0.5f, 0.1f);
            for (int i = 0; i < 5; i++)
            {
                float y0 = i / 5f + 0.02f, y1 = (i + 1) / 5f - 0.02f;
                float r = Rnd(c, i, 3);
                Color panel = r < 0.22f ? new Color(0.72f, 0.14f, 0.12f)
                            : r < 0.42f ? new Color(0.93f, 0.91f, 0.86f)
                            : r < 0.60f ? new Color(0.10f, 0.26f, 0.52f)
                            : r < 0.80f ? new Color(0.94f, 0.72f, 0.16f)
                            : new Color(0.12f, 0.38f, 0.26f);
                c.Rect(0.03f, y0, 0.97f, y1, panel, 0.72f, 0.36f, 0f);
                // A band of lettering, as blocks. Readable as text at any distance you see it from.
                for (int k = 0; k < 4; k++)
                {
                    float x0 = 0.10f + k * 0.20f, x1 = x0 + 0.13f;
                    if (Rnd(c, i * 11 + k, 5) < 0.25f) continue;
                    Color ink = panel.r + panel.g + panel.b > 1.6f
                        ? new Color(0.10f, 0.10f, 0.11f) : new Color(0.95f, 0.94f, 0.90f);
                    c.Rect(x0, y0 + 0.035f, x1, y1 - 0.035f, ink, 0.74f, 0.4f, 0f);
                }
            }
            c.Grain(0.04f, 8f, c.Seed + 73);
        }

        // ------------------------------------------------------------------ traffic

        /// <summary>
        /// Car paint, white. Every car on the road shares this material and is tinted through a
        /// property block, so the colour of a given car costs nothing. What is baked in is the
        /// clear coat: very smooth, a faint orange peel in the normal, and the dirt that
        /// collects along the bottom of a body panel.
        /// </summary>
        static void PaintCarPaint(Canvas c)
        {
            c.Rect(0f, 0f, 1f, 1f, Color.white, 0.6f, 0.08f, 0f);
            int n = c.Size;
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                int i = y * n + x;
                // Orange peel: the shallow ripple every sprayed panel has.
                float peel = KontoNoise.FbmTiled(x / (float)n * 18f, y / (float)n * 18f, c.Seed + 3, 3, 18);
                c.Height[i] = 0.6f + peel * 0.03f;
                c.Rough[i] = Mathf.Clamp01(0.07f + Mathf.Abs(peel) * 0.05f);
                // Road film along the bottom edge.
                float grime = Mathf.Clamp01(1f - y / (n * 0.16f));
                if (grime <= 0f) continue;
                float g = grime * (0.35f + KontoNoise.FbmTiled(x / (float)n * 9f, y / (float)n * 9f, c.Seed + 5, 3, 9) * 0.5f);
                c.Albedo[i] = Color.Lerp(c.Albedo[i], new Color(0.34f, 0.32f, 0.29f), Mathf.Clamp01(g * 0.7f));
                c.Rough[i] = Mathf.Clamp01(c.Rough[i] + g * 0.5f);
            }
        }

        static void PaintCarGlass(Canvas c)
        {
            // Plain tinted glass. The demister grid that used to live here read as dirt on every
            // pane including the windscreen, which is worse than not having one.
            c.Rect(0f, 0f, 1f, 1f, new Color(0.055f, 0.065f, 0.075f), 0.6f, 0.035f, 0f);
            c.Grain(0.02f, 10f, c.Seed + 7);
        }

        static void PaintCarTrim(Canvas c)
        {
            // Textured black plastic: bumpers, mirror shells, sill mouldings.
            c.Rect(0f, 0f, 1f, 1f, new Color(0.055f, 0.057f, 0.060f), 0.6f, 0.62f, 0f);
            int n = c.Size;
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                int i = y * n + x;
                float w = KontoNoise.WorleyTiled(x / (float)n * 26f, y / (float)n * 26f, c.Seed + 11, 26);
                c.Height[i] = 0.6f + w * 0.05f;
                c.Rough[i] = Mathf.Clamp01(0.58f + w * 0.12f);
            }
        }

        static void PaintCarLight(Canvas c)
        {
            // Half the sheet is a clear headlamp, half is a red rear lens, so one material does
            // both ends of the car: the geometry picks a side with its UVs.
            c.Rect(0f, 0f, 1f, 0.5f, new Color(0.52f, 0.06f, 0.05f), 0.6f, 0.06f, 0f);
            c.Rect(0f, 0.5f, 1f, 1f, new Color(0.80f, 0.82f, 0.84f), 0.6f, 0.04f, 0f);
            int n = c.Size;
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                // Fresnel flutes, which is what makes a lamp lens look like a lamp lens.
                int i = y * n + x;
                float f = Mathf.Sin(x / (float)n * Mathf.PI * 2f * 22f);
                c.Height[i] = 0.6f + f * 0.10f;
                c.Rough[i] = Mathf.Clamp01(c.Rough[i] + Mathf.Abs(f) * 0.04f);
            }
            // The reflector cup behind the clear half.
            c.Disc(0.5f, 0.74f, 0.20f, 0.17f, new Color(0.92f, 0.93f, 0.94f), 0.44f, 0.03f, 0.95f);
        }

        static void PaintTyre(Canvas c)
        {
            c.Rect(0f, 0f, 1f, 1f, new Color(0.042f, 0.044f, 0.047f), 0.6f, 0.78f, 0f);
            int n = c.Size;
            // Tread blocks across the sheet, sidewall lettering round the edge.
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                int i = y * n + x;
                float u = x / (float)n * 14f, v = y / (float)n * 5f;
                float bx = Mathf.Abs(u - Mathf.Floor(u) - 0.5f) * 2f;
                float by = Mathf.Abs(v - Mathf.Floor(v) - 0.5f) * 2f;
                bool groove = Mathf.Max(bx, by) > 0.72f;
                c.Height[i] = groove ? 0.44f : 0.66f;
                if (!groove) continue;
                c.Ao[i] = 0.62f;
                c.Albedo[i] = Tint(c.Albedo[i], 0.8f);
            }
            c.Grain(0.10f, 20f, c.Seed + 13);
        }

        /// <summary>
        /// The livery sheet: an atlas of marque badges, number plates and signs, in a four by
        /// four grid addressed by <see cref="VehicleLibrary.AtlasCell"/>.
        ///
        /// The marques are invented for Konto and so are their badges — geometric shapes in the
        /// idiom of a car badge (an oval, a chevron, a pinwheel) rather than anything traced off
        /// a real one. The joke is the names.
        /// </summary>
        static void PaintLivery(Canvas c)
        {
            c.Rect(0f, 0f, 1f, 1f, new Color(0.10f, 0.10f, 0.11f), 0.6f, 0.5f, 0f);
            const int G = 4;
            float cell = 1f / G;

            for (int k = 0; k < 8; k++)
            {
                float x0 = (k % G) * cell, y0 = 1f - ((k / G) + 1) * cell;
                Badge(c, k, x0, y0, cell);
            }

            // Cell 8: a Konto number plate. White ground, green characters, a red border for
            // the private plates and a green one for the commercial ones.
            Plate(c, (8 % G) * cell, 1f - ((8 / G) + 1) * cell, cell, false);
            Plate(c, (9 % G) * cell, 1f - ((9 / G) + 1) * cell, cell, true);

            // Cell 10: the taxi roof lamp — a lit box with a kanji-ish glyph block.
            {
                float x0 = (10 % G) * cell, y0 = 1f - ((10 / G) + 1) * cell;
                c.Rect(x0 + cell * 0.04f, y0 + cell * 0.22f, x0 + cell * 0.96f, y0 + cell * 0.78f,
                    new Color(0.95f, 0.88f, 0.62f), 0.7f, 0.25f, 0f);
                for (int i = 0; i < 3; i++)
                    c.Rect(x0 + cell * (0.18f + i * 0.24f), y0 + cell * 0.34f,
                           x0 + cell * (0.34f + i * 0.24f), y0 + cell * 0.66f,
                           new Color(0.12f, 0.12f, 0.13f), 0.72f, 0.3f, 0f);
            }

            // Cell 11: the vacant / hired card in a taxi windscreen. Red means 空車, free.
            {
                float x0 = (11 % G) * cell, y0 = 1f - ((11 / G) + 1) * cell;
                c.Rect(x0 + cell * 0.10f, y0 + cell * 0.30f, x0 + cell * 0.90f, y0 + cell * 0.70f,
                    new Color(0.78f, 0.12f, 0.10f), 0.68f, 0.35f, 0f);
                c.Rect(x0 + cell * 0.22f, y0 + cell * 0.38f, x0 + cell * 0.44f, y0 + cell * 0.62f,
                    new Color(0.96f, 0.95f, 0.92f), 0.70f, 0.35f, 0f);
                c.Rect(x0 + cell * 0.54f, y0 + cell * 0.38f, x0 + cell * 0.76f, y0 + cell * 0.62f,
                    new Color(0.96f, 0.95f, 0.92f), 0.70f, 0.35f, 0f);
            }

            // Cells 12-15: delivery van side panels, bus blinds, a livery stripe.
            for (int k = 12; k < 16; k++)
            {
                float x0 = (k % G) * cell, y0 = 1f - ((k / G) + 1) * cell;
                float r = Rnd(c, k, 41);
                Color ground = k == 15 ? new Color(0.16f, 0.17f, 0.19f)
                             : (r < 0.34f ? new Color(0.93f, 0.92f, 0.89f)
                             : (r < 0.67f ? new Color(0.20f, 0.42f, 0.66f) : new Color(0.24f, 0.52f, 0.34f)));
                c.Rect(x0 + 0.002f, y0 + 0.002f, x0 + cell - 0.002f, y0 + cell - 0.002f, ground, 0.62f, 0.32f, 0f);
                bool dark = ground.r + ground.g + ground.b < 1.5f;
                Color ink = dark ? new Color(0.95f, 0.94f, 0.90f) : new Color(0.12f, 0.13f, 0.15f);
                if (k == 15)
                {
                    // A destination blind: a long light bar with block characters.
                    for (int i = 0; i < 5; i++)
                        c.Rect(x0 + cell * (0.10f + i * 0.16f), y0 + cell * 0.40f,
                               x0 + cell * (0.20f + i * 0.16f), y0 + cell * 0.60f,
                               new Color(0.95f, 0.78f, 0.28f), 0.64f, 0.35f, 0f);
                    continue;
                }
                // A company mark and a line of text, as blocks.
                c.Disc(x0 + cell * 0.22f, y0 + cell * 0.62f, cell * 0.11f, cell * 0.11f, ink, 0.64f, 0.3f, 0f);
                for (int i = 0; i < 4; i++)
                    c.Rect(x0 + cell * (0.40f + i * 0.13f), y0 + cell * 0.54f,
                           x0 + cell * (0.50f + i * 0.13f), y0 + cell * 0.70f, ink, 0.64f, 0.3f, 0f);
                for (int i = 0; i < 6; i++)
                    c.Rect(x0 + cell * (0.12f + i * 0.13f), y0 + cell * 0.30f,
                           x0 + cell * (0.20f + i * 0.13f), y0 + cell * 0.40f, ink, 0.64f, 0.3f, 0f);
            }
        }

        /// <summary>
        /// One marque badge, drawn into an atlas cell. Chrome on a dark ground, in the geometry
        /// of a Konto marque: see the notes on VehicleLibrary.Marques.
        /// </summary>
        static void Badge(Canvas c, int badge, float x0, float y0, float cell)
        {
            var dark = new Color(0.07f, 0.075f, 0.085f);
            var chrome = new Color(0.86f, 0.88f, 0.90f);
            c.Rect(x0 + 0.002f, y0 + 0.002f, x0 + cell - 0.002f, y0 + cell - 0.002f, dark, 0.58f, 0.22f, 0.3f);

            float cx = x0 + cell * 0.5f, cy = y0 + cell * 0.5f;
            float R = cell * 0.36f;
            switch (badge)
            {
                case 0:     // Kosei: two crossed ovals
                    c.Ring(cx, cy, R, R * 0.62f, 0.26f, chrome, 0.74f, 0.12f, 0.95f);
                    c.Ring(cx, cy, R * 0.62f, R, 0.30f, chrome, 0.74f, 0.12f, 0.95f);
                    break;
                case 1:     // Ryusei: a circle with a shooting star through it
                    c.Ring(cx, cy, R, R, 0.16f, chrome, 0.74f, 0.12f, 0.95f);
                    c.Line(cx - R * 0.8f, cy - R * 0.5f, cx + R * 0.8f, cy + R * 0.5f, cell * 0.035f,
                        chrome, 0.76f, 0.12f, 0.95f);
                    c.Disc(cx + R * 0.5f, cy + R * 0.32f, cell * 0.06f, cell * 0.06f, chrome, 0.78f, 0.1f, 0.95f);
                    break;
                case 2:     // Kaneda: an angular K in a rounded square
                    c.Rect(cx - R, cy - R, cx + R, cy + R, chrome, 0.70f, 0.14f, 0.9f);
                    c.Rect(cx - R * 0.82f, cy - R * 0.82f, cx + R * 0.82f, cy + R * 0.82f, dark, 0.60f, 0.3f, 0.2f);
                    c.Line(cx - R * 0.35f, cy - R * 0.6f, cx - R * 0.35f, cy + R * 0.6f, cell * 0.045f, chrome, 0.74f, 0.12f, 0.95f);
                    c.Line(cx - R * 0.35f, cy, cx + R * 0.45f, cy + R * 0.6f, cell * 0.045f, chrome, 0.74f, 0.12f, 0.95f);
                    c.Line(cx - R * 0.35f, cy, cx + R * 0.45f, cy - R * 0.6f, cell * 0.045f, chrome, 0.74f, 0.12f, 0.95f);
                    break;
                case 3:     // Mitsuwa: three triangles in a pinwheel
                    for (int i = 0; i < 3; i++)
                    {
                        float a = i * Mathf.PI * 2f / 3f;
                        Vector2 p0 = new Vector2(cx + Mathf.Cos(a) * R, cy + Mathf.Sin(a) * R);
                        Vector2 p1 = new Vector2(cx + Mathf.Cos(a + 0.9f) * R * 0.34f, cy + Mathf.Sin(a + 0.9f) * R * 0.34f);
                        Vector2 p2 = new Vector2(cx + Mathf.Cos(a - 0.9f) * R * 0.34f, cy + Mathf.Sin(a - 0.9f) * R * 0.34f);
                        c.Tri(p0, p1, p2, chrome, 0.74f, 0.12f, 0.95f);
                    }
                    break;
                case 4:     // Suzume: a swept chevron
                    c.Tri(new Vector2(cx - R, cy - R * 0.2f), new Vector2(cx, cy + R * 0.55f),
                          new Vector2(cx + R, cy - R * 0.2f), chrome, 0.74f, 0.12f, 0.95f);
                    c.Tri(new Vector2(cx - R * 0.5f, cy - R * 0.35f), new Vector2(cx, cy + R * 0.12f),
                          new Vector2(cx + R * 0.5f, cy - R * 0.35f), dark, 0.62f, 0.3f, 0.2f);
                    break;
                case 5:     // Nanatsu: seven stars in an oval
                    c.Ring(cx, cy, R, R * 0.66f, 0.14f, chrome, 0.72f, 0.12f, 0.95f);
                    for (int i = 0; i < 7; i++)
                    {
                        float a = i * Mathf.PI * 2f / 7f + 0.4f;
                        c.Disc(cx + Mathf.Cos(a) * R * 0.42f, cy + Mathf.Sin(a) * R * 0.28f,
                            cell * 0.028f, cell * 0.028f, chrome, 0.76f, 0.1f, 0.95f);
                    }
                    break;
                case 6:     // Daichi: a mountain glyph
                    c.Tri(new Vector2(cx - R, cy - R * 0.55f), new Vector2(cx - R * 0.15f, cy + R * 0.6f),
                          new Vector2(cx + R * 0.35f, cy - R * 0.55f), chrome, 0.74f, 0.12f, 0.95f);
                    c.Tri(new Vector2(cx - R * 0.1f, cy - R * 0.55f), new Vector2(cx + R * 0.45f, cy + R * 0.3f),
                          new Vector2(cx + R, cy - R * 0.55f), chrome, 0.74f, 0.12f, 0.95f);
                    break;
                default:    // Ganseki: a hexagon with a bar
                    for (int i = 0; i < 6; i++)
                    {
                        float a0 = i * Mathf.PI / 3f, a1 = (i + 1) * Mathf.PI / 3f;
                        c.Tri(new Vector2(cx, cy),
                              new Vector2(cx + Mathf.Cos(a0) * R, cy + Mathf.Sin(a0) * R),
                              new Vector2(cx + Mathf.Cos(a1) * R, cy + Mathf.Sin(a1) * R),
                              chrome, 0.72f, 0.14f, 0.92f);
                    }
                    c.Rect(cx - R * 0.72f, cy - R * 0.14f, cx + R * 0.72f, cy + R * 0.14f, dark, 0.60f, 0.3f, 0.2f);
                    break;
            }
        }

        /// <summary>A Konto number plate: white ground, dark characters, a coloured border.</summary>
        static void Plate(Canvas c, float x0, float y0, float cell, bool commercial)
        {
            Color ground = commercial ? new Color(0.20f, 0.46f, 0.26f) : new Color(0.93f, 0.93f, 0.90f);
            Color ink = commercial ? new Color(0.93f, 0.93f, 0.90f) : new Color(0.10f, 0.11f, 0.13f);
            c.Rect(x0 + 0.004f, y0 + cell * 0.22f, x0 + cell - 0.004f, y0 + cell * 0.78f, ground, 0.64f, 0.34f, 0f);
            c.Frame(x0 + 0.004f, y0 + cell * 0.22f, x0 + cell - 0.004f, y0 + cell * 0.78f, cell * 0.016f,
                ink, 0.66f, 0.34f, 0f);
            // A small region line, then four big digits with a gap in the middle.
            for (int i = 0; i < 3; i++)
                c.Rect(x0 + cell * (0.18f + i * 0.10f), y0 + cell * 0.60f,
                       x0 + cell * (0.25f + i * 0.10f), y0 + cell * 0.70f, ink, 0.66f, 0.34f, 0f);
            for (int i = 0; i < 4; i++)
            {
                float gx = x0 + cell * (0.14f + i * 0.19f + (i >= 2 ? 0.04f : 0f));
                c.Rect(gx, y0 + cell * 0.30f, gx + cell * 0.13f, y0 + cell * 0.55f, ink, 0.66f, 0.34f, 0f);
            }
        }

        static void PaintConcrete(Canvas c)
        {
            var conc = new Color(0.56f, 0.55f, 0.53f);
            c.Rect(0f, 0f, 1f, 1f, conc, 0.6f, 0.74f, 0f);
            // Board marks and shutter tie holes: in situ concrete, not a grey swatch.
            int n = c.Size;
            for (int y = 0; y < n; y++)
            {
                float v = y / (float)n * 9f;
                bool joint = (v - Mathf.Floor(v)) < 0.035f;
                for (int x = 0; x < n; x++)
                {
                    int i = y * n + x;
                    float g = KontoNoise.FbmTiled(x / (float)n * 6f, y / (float)n * 6f, c.Seed + 79, 4, 6);
                    c.Albedo[i] = Tint(conc, 0.94f + g * 0.16f);
                    c.Height[i] = 0.6f + g * 0.05f - (joint ? 0.10f : 0f);
                    c.Rough[i] = Mathf.Clamp01(0.74f - g * 0.12f);
                    if (joint) c.Ao[i] = 0.8f;
                }
            }
            for (int ty = 0; ty < 3; ty++)
            for (int tx = 0; tx < 3; tx++)
            {
                float cx = (tx + 0.5f) / 3f, cy = (ty + 0.34f) / 3f;
                c.Rect(cx - 0.006f, cy - 0.006f, cx + 0.006f, cy + 0.006f,
                    new Color(0.42f, 0.41f, 0.39f), 0.44f, 0.8f, 0f, 0.7f);
            }
        }
    }
}
