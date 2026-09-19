using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Soti's head office, the one building in Konto that is modelled rather than massed.
    ///
    /// The form is taken from the Ping An International Finance Centre in Shenzhen: a
    /// square plan with deeply chamfered corners, a shaft that tapers the whole way up,
    /// and eight stainless steel mega-columns standing proud of the glass. The columns
    /// run the full height and close over the roof into the claw, with a short mast
    /// above that. The proportions below are the Shenzhen tower's, to the metre where
    /// they are published and to the eye where they are not.
    ///
    /// The mesh comes out in local space with its origin on the podium slab, so it drops
    /// straight onto a graded plot: position at <see cref="CityPlot.WorldPosition"/> and
    /// rotate by <see cref="CityPlot.WorldRotation"/>.
    /// </summary>
    public static class SotiTower
    {
        public const float Height = 592f;          // to the tip of the mast
        public const float ShaftTop = 520f;        // top of the office shaft
        public const float CrownTop = 578f;        // where the eight columns close
        public const float BaseHalfWidth = 32.5f;  // half the plan at the podium roof
        public const float TaperTop = 0.70f;       // plan at the shaft top, as a fraction
        public const float PodiumHeight = 26f;
        public const float PodiumSpread = 2.36f;   // podium width as a multiple of the shaft
        public const int Floors = 116;

        public const float BayWidth = 3.6f;        // metres of facade per window bay
        public const float FloorHeight = 4.05f;

        /// <summary>Half width, corner chamfer, and column stand-off at a given height.</summary>
        public struct Ring
        {
            public float y;
            public float half;
            public float chamfer;
            public float fin;      // how far the steel stands off the glass
            public float thick;    // half thickness of a column blade
        }

        public static Ring Profile(float y)
        {
            Ring r = new Ring();
            r.y = y;
            if (y <= ShaftTop)
            {
                float t = Mathf.Clamp01(y / ShaftTop);
                r.half = BaseHalfWidth * Mathf.Lerp(1f, TaperTop, Mathf.Pow(t, 0.94f));
                r.chamfer = r.half * Mathf.Lerp(0.30f, 0.45f, t);
                r.fin = Mathf.Lerp(3.2f, 2.2f, t);
                r.thick = Mathf.Lerp(2.1f, 1.5f, t);
                return r;
            }
            float u = Mathf.Clamp01((y - ShaftTop) / (CrownTop - ShaftTop));
            float top = BaseHalfWidth * TaperTop;
            r.half = top * Mathf.Lerp(1f, 0.10f, Mathf.Pow(u, 2.2f));
            r.chamfer = r.half * 0.46f;
            r.fin = Mathf.Lerp(2.2f, 0.6f, Mathf.Pow(u, 1.8f));
            r.thick = Mathf.Lerp(1.5f, 0.5f, Mathf.Pow(u, 1.8f));
            return r;
        }

        /// <summary>A square with the corners cut off, walked in a single direction.</summary>
        public static void Section(in Ring r, Vector2[] into)
        {
            float a = r.half, c = r.chamfer;
            into[0] = new Vector2(a - c, a);
            into[1] = new Vector2(a, a - c);
            into[2] = new Vector2(a, -(a - c));
            into[3] = new Vector2(a - c, -a);
            into[4] = new Vector2(-(a - c), -a);
            into[5] = new Vector2(-a, -(a - c));
            into[6] = new Vector2(-a, a - c);
            into[7] = new Vector2(-(a - c), a);
        }

        /// <summary>
        /// Builds the tower. Submesh 0 is the curtain wall, submesh 1 is the steel, so
        /// one renderer can carry a glass material and a brushed metal one.
        /// </summary>
        public static Mesh Build(string name, int levels = 76)
        {
            var verts = new List<Vector3>();
            var norms = new List<Vector3>();
            var uvs = new List<Vector2>();
            var glass = new List<int>();
            var steel = new List<int>();

            var rings = new Ring[levels + 1];
            var plans = new Vector2[levels + 1][];
            for (int i = 0; i <= levels; i++)
            {
                rings[i] = Profile(CrownTop * i / levels);
                plans[i] = new Vector2[8];
                Section(rings[i], plans[i]);
            }

            // ---- curtain wall: a lofted shell, one texture tile per window bay
            for (int i = 0; i < levels; i++)
            {
                Ring lo = rings[i], hi = rings[i + 1];
                float run = 0f;
                for (int e = 0; e < 8; e++)
                {
                    Vector2 a0 = plans[i][e], a1 = plans[i][(e + 1) % 8];
                    Vector2 b0 = plans[i + 1][e], b1 = plans[i + 1][(e + 1) % 8];
                    float len = (a1 - a0).magnitude;
                    float u0 = run / BayWidth, u1 = (run + len) / BayWidth;
                    run += len;
                    float v0 = lo.y / FloorHeight, v1 = hi.y / FloorHeight;
                    Vector3 pA = new Vector3(a0.x, lo.y, a0.y);
                    Vector3 pB = new Vector3(a1.x, lo.y, a1.y);
                    Vector3 pC = new Vector3(b1.x, hi.y, b1.y);
                    Vector3 pD = new Vector3(b0.x, hi.y, b0.y);
                    Vector2 mid = (a0 + a1) * 0.5f;
                    Vector3 outward = new Vector3(mid.x, 0f, mid.y).normalized;
                    AddQuad(verts, norms, uvs, glass, pA, pB, pC, pD,
                        new Vector2(u0, v0), new Vector2(u1, v0), new Vector2(u1, v1), new Vector2(u0, v1), outward);
                }
            }

            // ---- cap over the claw
            {
                Vector2[] top = plans[levels];
                float y = rings[levels].y;
                for (int e = 1; e < 7; e++)
                {
                    AddTri(verts, norms, uvs, glass,
                        new Vector3(top[0].x, y, top[0].y),
                        new Vector3(top[e].x, y, top[e].y),
                        new Vector3(top[e + 1].x, y, top[e + 1].y),
                        Vector3.up);
                }
            }

            // ---- the eight mega-columns
            for (int e = 0; e < 8; e++)
            {
                for (int i = 0; i < levels; i++)
                {
                    Vector3 loL, loR, loT, hiL, hiR, hiT;
                    Blade(plans[i][e], rings[i], out loL, out loR, out loT);
                    Blade(plans[i + 1][e], rings[i + 1], out hiL, out hiR, out hiT);
                    Vector2 p = plans[i][e];
                    Vector3 outward = new Vector3(p.x, 0f, p.y).normalized;
                    Vector3 side = new Vector3(-outward.z, 0f, outward.x);
                    AddQuad(verts, norms, uvs, steel, loL, loT, hiT, hiL,
                        Vector2.zero, Vector2.right, Vector2.one, Vector2.up, (outward + side).normalized);
                    AddQuad(verts, norms, uvs, steel, loT, loR, hiR, hiT,
                        Vector2.zero, Vector2.right, Vector2.one, Vector2.up, (outward - side).normalized);
                    AddQuad(verts, norms, uvs, steel, loR, loL, hiL, hiR,
                        Vector2.zero, Vector2.right, Vector2.one, Vector2.up, -outward);
                }
            }

            // ---- the mast
            AddTaperedMast(verts, norms, uvs, steel, CrownTop, Height, 1.5f, 0.22f);

            // ---- the podium the plaza runs into
            float pw = BaseHalfWidth * PodiumSpread * 0.5f;
            AddBox(verts, norms, uvs, glass, new Vector3(-pw, 0f, -pw), new Vector3(pw, PodiumHeight, pw),
                BayWidth, FloorHeight);

            var mesh = new Mesh();
            mesh.name = string.IsNullOrEmpty(name) ? "Konto_SotiTower" : name;
            mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            mesh.SetVertices(verts);
            mesh.SetNormals(norms);
            mesh.SetUVs(0, uvs);
            mesh.subMeshCount = 2;
            mesh.SetTriangles(glass, 0);
            mesh.SetTriangles(steel, 1);
            mesh.RecalculateBounds();
            mesh.RecalculateTangents();
            return mesh;
        }

        static void Blade(Vector2 p, in Ring r, out Vector3 left, out Vector3 right, out Vector3 tip)
        {
            Vector2 n = p.sqrMagnitude > 1e-6f ? p.normalized : Vector2.up;
            Vector2 t = new Vector2(-n.y, n.x) * r.thick;
            left = new Vector3(p.x + t.x, r.y, p.y + t.y);
            right = new Vector3(p.x - t.x, r.y, p.y - t.y);
            tip = new Vector3(p.x + n.x * r.fin, r.y, p.y + n.y * r.fin);
        }

        static void AddTaperedMast(List<Vector3> v, List<Vector3> n, List<Vector2> uv, List<int> tris,
            float y0, float y1, float r0, float r1)
        {
            const int sides = 8;
            for (int i = 0; i < sides; i++)
            {
                float a = i / (float)sides * Mathf.PI * 2f;
                float b = (i + 1) / (float)sides * Mathf.PI * 2f;
                Vector3 pA = new Vector3(Mathf.Cos(a) * r0, y0, Mathf.Sin(a) * r0);
                Vector3 pB = new Vector3(Mathf.Cos(b) * r0, y0, Mathf.Sin(b) * r0);
                Vector3 pC = new Vector3(Mathf.Cos(b) * r1, y1, Mathf.Sin(b) * r1);
                Vector3 pD = new Vector3(Mathf.Cos(a) * r1, y1, Mathf.Sin(a) * r1);
                float mid = (a + b) * 0.5f;
                AddQuad(v, n, uv, tris, pA, pB, pC, pD, Vector2.zero, Vector2.right, Vector2.one, Vector2.up,
                    new Vector3(Mathf.Cos(mid), 0f, Mathf.Sin(mid)));
            }
        }

        static void AddBox(List<Vector3> v, List<Vector3> n, List<Vector2> uv, List<int> tris,
            Vector3 lo, Vector3 hi, float bay, float floor)
        {
            float tw = Mathf.Max(1f, Mathf.Round((hi.x - lo.x) / bay));
            float th = Mathf.Max(1f, Mathf.Round((hi.y - lo.y) / floor));
            Vector3[] c =
            {
                new Vector3(lo.x, lo.y, lo.z), new Vector3(hi.x, lo.y, lo.z),
                new Vector3(hi.x, lo.y, hi.z), new Vector3(lo.x, lo.y, hi.z),
                new Vector3(lo.x, hi.y, lo.z), new Vector3(hi.x, hi.y, lo.z),
                new Vector3(hi.x, hi.y, hi.z), new Vector3(lo.x, hi.y, hi.z),
            };
            Vector2 t0 = Vector2.zero, t1 = new Vector2(tw, 0f), t2 = new Vector2(tw, th), t3 = new Vector2(0f, th);
            AddQuad(v, n, uv, tris, c[0], c[1], c[5], c[4], t0, t1, t2, t3, Vector3.back);
            AddQuad(v, n, uv, tris, c[1], c[2], c[6], c[5], t0, t1, t2, t3, Vector3.right);
            AddQuad(v, n, uv, tris, c[2], c[3], c[7], c[6], t0, t1, t2, t3, Vector3.forward);
            AddQuad(v, n, uv, tris, c[3], c[0], c[4], c[7], t0, t1, t2, t3, Vector3.left);
            AddQuad(v, n, uv, tris, c[4], c[5], c[6], c[7], t0, t1, t2, t3, Vector3.up);
        }

        /// <summary>
        /// Emits a quad wound so its front face looks along <paramref name="outward"/>,
        /// whichever way round the caller happened to list the corners.
        /// </summary>
        static void AddQuad(List<Vector3> v, List<Vector3> n, List<Vector2> uv, List<int> tris,
            Vector3 a, Vector3 b, Vector3 c, Vector3 d,
            Vector2 ua, Vector2 ub, Vector2 uc, Vector2 ud, Vector3 outward)
        {
            int i = v.Count;
            Vector3 face = Vector3.Cross(b - a, d - a);
            bool flip = Vector3.Dot(face, outward) < 0f;
            Vector3 normal = outward.sqrMagnitude > 1e-6f ? outward.normalized
                           : (flip ? -face.normalized : face.normalized);

            v.Add(a); v.Add(b); v.Add(c); v.Add(d);
            uv.Add(ua); uv.Add(ub); uv.Add(uc); uv.Add(ud);
            for (int k = 0; k < 4; k++) n.Add(normal);

            if (flip)
            {
                tris.Add(i); tris.Add(i + 3); tris.Add(i + 2);
                tris.Add(i); tris.Add(i + 2); tris.Add(i + 1);
            }
            else
            {
                tris.Add(i); tris.Add(i + 1); tris.Add(i + 2);
                tris.Add(i); tris.Add(i + 2); tris.Add(i + 3);
            }
        }

        static void AddTri(List<Vector3> v, List<Vector3> n, List<Vector2> uv, List<int> tris,
            Vector3 a, Vector3 b, Vector3 c, Vector3 outward)
        {
            int i = v.Count;
            Vector3 face = Vector3.Cross(b - a, c - a);
            bool flip = Vector3.Dot(face, outward) < 0f;
            v.Add(a); v.Add(b); v.Add(c);
            uv.Add(new Vector2(a.x * 0.2f, a.z * 0.2f));
            uv.Add(new Vector2(b.x * 0.2f, b.z * 0.2f));
            uv.Add(new Vector2(c.x * 0.2f, c.z * 0.2f));
            for (int k = 0; k < 3; k++) n.Add(outward.normalized);
            if (flip) { tris.Add(i); tris.Add(i + 2); tris.Add(i + 1); }
            else { tris.Add(i); tris.Add(i + 1); tris.Add(i + 2); }
        }
    }
}
