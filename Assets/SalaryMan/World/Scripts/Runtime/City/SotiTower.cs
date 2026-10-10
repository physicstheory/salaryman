using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Soti's head office, the one building in Konto that is modelled rather than massed.
    ///
    /// It used to be the Ping An tower from Shenzhen — 592 m, eight steel mega-columns closing
    /// over the roof into a claw, a mast on top. Next to neighbours of 150 m that is nearly four
    /// times the height of anything around it, and it read as science fiction rather than as a
    /// city. Tokyo does not look like that. Its towers cluster: the tallest office building in a
    /// district stands maybe one and a half times its neighbours, and the silhouette is a
    /// stepped prism, not a spire.
    ///
    /// So the form is Tokyo's now, and the numbers come from real buildings:
    ///
    ///   248 m           Midtown Tower, Akasaka (2007), architectural height
    ///   ~150-190 m      the towers around it, which is what Konto's CBD already builds
    ///   setbacks        the sky-exposure rules (斜線制限) step Tokyo towers back as they rise
    ///   mechanical bands louvred plant floors every fifteen storeys or so, visible from outside
    ///   stone podium    five storeys of granite meeting the pavement under a deep canopy
    ///
    /// The mesh comes out in local space with its origin on the podium slab, so it drops
    /// straight onto a graded plot: position at <see cref="CityPlot.WorldPosition"/> and
    /// rotate by <see cref="CityPlot.WorldRotation"/>.
    /// </summary>
    public static class SotiTower
    {
        public const float Height = 248f;          // to the top of the parapet, Midtown Tower
        public const float MastTop = 262f;         // the aerial, which is not architectural height
        public const float FloorHeight = 4.1f;
        public const int Floors = 54;              // 54 x 4.1 = 221 m of office, then plant

        public const float BaseHalfWidth = 24f;    // a 48 m floorplate, which is a big one
        public const float PodiumHeight = 23f;     // five storeys of stone

        /// <summary>
        /// The podium's half width as a multiple of the shaft's. Read it through
        /// <see cref="PodiumHalfWidth"/> or <see cref="PodiumWidth"/> rather than multiplying it
        /// out by hand: the planner once took this for a full width while the builder took it
        /// for a half width, and the tower stood on a podium wider than its own plot.
        /// </summary>
        public const float PodiumSpread = 1.30f;

        /// <summary>Half the podium's plan, in metres.</summary>
        public static float PodiumHalfWidth { get { return BaseHalfWidth * PodiumSpread; } }

        /// <summary>The podium's full plan, which is the smallest plot the tower can stand on.</summary>
        public static float PodiumWidth { get { return PodiumHalfWidth * 2f; } }

        public const float ShaftTop = 221.4f;      // top office floor
        public const float PlantTop = 240f;        // louvred mechanical floors above it
        public const float BayWidth = 3.2f;        // metres of facade per window bay

        /// <summary>
        /// Where the tower steps back, as a fraction of the shaft, and how much of the plan it
        /// keeps above each step. Tokyo towers step for the daylight rules, and the steps are
        /// most of what makes the silhouette read as Tokyo rather than as anywhere.
        /// </summary>
        static readonly float[] StepAt = { 0.42f, 0.74f };
        static readonly float[] StepKeep = { 0.88f, 0.80f };

        /// <summary>Half width and corner chamfer at a height up the shaft.</summary>
        public struct Ring
        {
            public float y;
            public float half;
            public float chamfer;
            public bool plant;      // a mechanical floor, which is louvre rather than glass
        }

        public static Ring Profile(float y)
        {
            Ring r = new Ring();
            r.y = y;

            float keep = 1f;
            float t = Mathf.Clamp01(y / ShaftTop);
            for (int i = 0; i < StepAt.Length; i++)
                if (t >= StepAt[i]) keep = StepKeep[i];

            // A very slight batter on top of the steps: 2% over the full height. Real curtain
            // walls are plumb, but a hair of taper keeps the silhouette from reading as a slab.
            r.half = BaseHalfWidth * keep * Mathf.Lerp(1f, 0.98f, t);

            // Tokyo office towers chamfer their corners rather than cut them deeply; the corner
            // is a narrow facet that catches the light differently from the faces.
            r.chamfer = r.half * 0.10f;
            r.plant = IsPlantFloor(y);
            return r;
        }

        /// <summary>
        /// True inside a mechanical floor. They sit immediately under each setback, which is
        /// where the plant goes in a stepped building, and again at the top of the shaft.
        /// </summary>
        public static bool IsPlantFloor(float y)
        {
            for (int i = 0; i < StepAt.Length; i++)
            {
                float band = ShaftTop * StepAt[i];
                if (y > band - FloorHeight * 1.5f && y < band) return true;
            }
            return y > ShaftTop - FloorHeight;
        }

        /// <summary>A rectangle with the corners chamfered, walked anticlockwise.</summary>
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
        /// Builds the tower. Submesh 0 is the curtain wall, submesh 1 is everything solid —
        /// the stone podium, the plant louvres, the parapet and the mast — so one renderer
        /// carries a glass material and a pale stone one.
        /// </summary>
        public static Mesh Build(string name, int levels = 0)
        {
            if (levels <= 0) levels = Mathf.RoundToInt(ShaftTop / FloorHeight);

            var verts = new List<Vector3>();
            var norms = new List<Vector3>();
            var uvs = new List<Vector2>();
            var glass = new List<int>();
            var solid = new List<int>();

            var rings = new Ring[levels + 1];
            var plans = new Vector2[levels + 1][];
            for (int i = 0; i <= levels; i++)
            {
                rings[i] = Profile(ShaftTop * i / levels);
                plans[i] = new Vector2[8];
                Section(rings[i], plans[i]);
            }

            // ---- the shaft, one storey at a time
            for (int i = 0; i < levels; i++)
            {
                Ring lo = rings[i], hi = rings[i + 1];
                var into = (lo.plant || hi.plant) ? solid : glass;
                float run = 0f;
                for (int e = 0; e < 8; e++)
                {
                    Vector2 a0 = plans[i][e], a1 = plans[i][(e + 1) % 8];
                    Vector2 b0 = plans[i + 1][e], b1 = plans[i + 1][(e + 1) % 8];
                    float len = (a1 - a0).magnitude;
                    float u0 = run / BayWidth, u1 = (run + len) / BayWidth;
                    run += len;
                    float v0 = lo.y / FloorHeight, v1 = hi.y / FloorHeight;
                    Vector2 mid = (a0 + a1) * 0.5f;
                    Vector3 outward = new Vector3(mid.x, 0f, mid.y).normalized;
                    AddQuad(verts, norms, uvs, into,
                        new Vector3(a0.x, lo.y, a0.y), new Vector3(a1.x, lo.y, a1.y),
                        new Vector3(b1.x, hi.y, b1.y), new Vector3(b0.x, hi.y, b0.y),
                        new Vector2(u0, v0), new Vector2(u1, v0), new Vector2(u1, v1), new Vector2(u0, v1),
                        outward);
                }

                // Where the plan steps in, the floor left behind is a roof. Tokyo towers put
                // plant and a maintenance walkway on these, and from the street the stepped
                // edge is the thing that says which building you are looking at.
                if (hi.half < lo.half - 0.01f)
                    AddRingSlab(verts, norms, uvs, solid, plans[i], plans[i + 1], hi.y);
            }

            // ---- mechanical floors above the office shaft, then the parapet
            AddPrism(verts, norms, uvs, solid, rings[levels].half * 0.97f, ShaftTop, PlantTop, 0.12f, BayWidth);
            AddPrism(verts, norms, uvs, solid, rings[levels].half * 0.90f, PlantTop, Height, 0.12f, BayWidth);
            AddCap(verts, norms, uvs, solid, rings[levels].half * 0.90f, Height, 0.12f);

            // ---- the aerial. Every tall building in Tokyo carries one; none of them carry a
            // seventy metre spire, which is what made the old shape read as science fiction.
            AddMast(verts, norms, uvs, solid, Height, MastTop, 1.1f, 0.35f);

            // ---- podium: five storeys of stone, wider than the shaft, with a deep canopy
            float pw = PodiumHalfWidth;
            AddPrism(verts, norms, uvs, solid, pw, 0f, PodiumHeight, 0.06f, BayWidth);
            AddCap(verts, norms, uvs, solid, pw, PodiumHeight, 0.06f);
            // The canopy: a slab standing proud at the second floor, which is how a Tokyo
            // office tower meets the pavement and what keeps the rain off the entrance.
            AddPrism(verts, norms, uvs, solid, pw + 1.4f, 7.4f, 8.3f, 0.02f, BayWidth);
            AddCap(verts, norms, uvs, solid, pw + 1.4f, 8.3f, 0.02f);

            var mesh = new Mesh();
            mesh.name = name;
            mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            mesh.SetVertices(verts);
            mesh.SetNormals(norms);
            mesh.SetUVs(0, uvs);
            mesh.subMeshCount = 2;
            mesh.SetTriangles(glass, 0);
            mesh.SetTriangles(solid, 1);
            mesh.RecalculateBounds();
            mesh.RecalculateTangents();
            return mesh;
        }

        // ------------------------------------------------------------------ primitives

        /// <summary>A chamfered prism between two heights.</summary>
        static void AddPrism(List<Vector3> v, List<Vector3> n, List<Vector2> uv, List<int> tris,
            float half, float y0, float y1, float chamferFraction, float bay)
        {
            var ring = new Ring { half = half, chamfer = half * chamferFraction };
            var plan = new Vector2[8];
            Section(ring, plan);
            float run = 0f;
            for (int e = 0; e < 8; e++)
            {
                Vector2 a = plan[e], b = plan[(e + 1) % 8];
                float len = (b - a).magnitude;
                float u0 = run / bay, u1 = (run + len) / bay;
                run += len;
                Vector2 mid = (a + b) * 0.5f;
                Vector3 outward = new Vector3(mid.x, 0f, mid.y).normalized;
                AddQuad(v, n, uv, tris,
                    new Vector3(a.x, y0, a.y), new Vector3(b.x, y0, b.y),
                    new Vector3(b.x, y1, b.y), new Vector3(a.x, y1, a.y),
                    new Vector2(u0, y0 / FloorHeight), new Vector2(u1, y0 / FloorHeight),
                    new Vector2(u1, y1 / FloorHeight), new Vector2(u0, y1 / FloorHeight),
                    outward);
            }
        }

        static void AddCap(List<Vector3> v, List<Vector3> n, List<Vector2> uv, List<int> tris,
            float half, float y, float chamferFraction)
        {
            var ring = new Ring { half = half, chamfer = half * chamferFraction };
            var plan = new Vector2[8];
            Section(ring, plan);
            for (int e = 1; e < 7; e++)
                AddTri(v, n, uv, tris,
                    new Vector3(plan[0].x, y, plan[0].y),
                    new Vector3(plan[e].x, y, plan[e].y),
                    new Vector3(plan[e + 1].x, y, plan[e + 1].y),
                    Vector3.up);
        }

        /// <summary>The flat roof left behind where the plan steps in.</summary>
        static void AddRingSlab(List<Vector3> v, List<Vector3> n, List<Vector2> uv, List<int> tris,
            Vector2[] outer, Vector2[] inner, float y)
        {
            for (int e = 0; e < 8; e++)
            {
                Vector2 a0 = outer[e], a1 = outer[(e + 1) % 8];
                Vector2 b0 = inner[e], b1 = inner[(e + 1) % 8];
                AddQuad(v, n, uv, tris,
                    new Vector3(a0.x, y, a0.y), new Vector3(a1.x, y, a1.y),
                    new Vector3(b1.x, y, b1.y), new Vector3(b0.x, y, b0.y),
                    new Vector2(a0.x, a0.y), new Vector2(a1.x, a1.y),
                    new Vector2(b1.x, b1.y), new Vector2(b0.x, b0.y),
                    Vector3.up);
            }
        }

        /// <summary>A tapered square aerial.</summary>
        static void AddMast(List<Vector3> v, List<Vector3> n, List<Vector2> uv, List<int> tris,
            float y0, float y1, float halfLow, float halfHigh)
        {
            for (int e = 0; e < 4; e++)
            {
                float a0 = e * Mathf.PI * 0.5f, a1 = (e + 1) * Mathf.PI * 0.5f;
                Vector2 lo0 = new Vector2(Mathf.Cos(a0), Mathf.Sin(a0)) * halfLow;
                Vector2 lo1 = new Vector2(Mathf.Cos(a1), Mathf.Sin(a1)) * halfLow;
                Vector2 hi0 = new Vector2(Mathf.Cos(a0), Mathf.Sin(a0)) * halfHigh;
                Vector2 hi1 = new Vector2(Mathf.Cos(a1), Mathf.Sin(a1)) * halfHigh;
                Vector2 mid = (lo0 + lo1) * 0.5f;
                AddQuad(v, n, uv, tris,
                    new Vector3(lo0.x, y0, lo0.y), new Vector3(lo1.x, y0, lo1.y),
                    new Vector3(hi1.x, y1, hi1.y), new Vector3(hi0.x, y1, hi0.y),
                    Vector2.zero, new Vector2(1f, 0f), new Vector2(1f, 1f), new Vector2(0f, 1f),
                    new Vector3(mid.x, 0f, mid.y).normalized);
            }
        }

        static void AddQuad(List<Vector3> v, List<Vector3> n, List<Vector2> uv, List<int> tris,
            Vector3 a, Vector3 b, Vector3 c, Vector3 d,
            Vector2 ua, Vector2 ub, Vector2 uc, Vector2 ud, Vector3 outward)
        {
            int i = v.Count;
            Vector3 normal = Vector3.Cross(b - a, d - a);
            if (normal.sqrMagnitude < 1e-9f) return;
            normal.Normalize();
            if (Vector3.Dot(normal, outward) < 0f) normal = -normal;

            v.Add(a); v.Add(b); v.Add(c); v.Add(d);
            for (int k = 0; k < 4; k++) n.Add(normal);
            uv.Add(ua); uv.Add(ub); uv.Add(uc); uv.Add(ud);

            bool flip = Vector3.Dot(Vector3.Cross(b - a, d - a), outward) < 0f;
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
            Vector3 normal = Vector3.Cross(b - a, c - a);
            if (normal.sqrMagnitude < 1e-9f) return;
            normal.Normalize();
            if (Vector3.Dot(normal, outward) < 0f) normal = -normal;

            v.Add(a); v.Add(b); v.Add(c);
            for (int k = 0; k < 3; k++) n.Add(normal);
            uv.Add(new Vector2(a.x, a.z)); uv.Add(new Vector2(b.x, b.z)); uv.Add(new Vector2(c.x, c.z));

            if (Vector3.Dot(Vector3.Cross(b - a, c - a), outward) < 0f)
            { tris.Add(i); tris.Add(i + 2); tris.Add(i + 1); }
            else
            { tris.Add(i); tris.Add(i + 1); tris.Add(i + 2); }
        }
    }
}
