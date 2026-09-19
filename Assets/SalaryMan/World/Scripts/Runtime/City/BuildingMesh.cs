using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// The mesh accumulator the city is built into. One instance collects a whole ward: every
    /// building, every parapet, every air conditioner, sorted into one index list per
    /// <see cref="CitySurface"/>, and welded into a single mesh at the end.
    ///
    /// UVs are in metres unless a caller says otherwise, so a tiling material lands at a real
    /// world scale without anyone laying out a UV island. Facades pass their own UVs in bay and
    /// floor units instead, which is what makes windows line up around a corner.
    ///
    /// Winding is worked out from an outward direction rather than trusted from the caller:
    /// a quad emitted the wrong way round is invisible from the street and very easy to miss.
    /// </summary>
    public sealed class BuildingMesh
    {
        readonly List<Vector3> _v = new List<Vector3>();
        readonly List<Vector3> _n = new List<Vector3>();
        readonly List<Vector2> _uv = new List<Vector2>();
        readonly List<int>[] _tris;

        public BuildingMesh()
        {
            _tris = new List<int>[(int)CitySurface.Count];
            for (int i = 0; i < _tris.Length; i++) _tris[i] = new List<int>();
        }

        public int VertexCount { get { return _v.Count; } }

        public int TriangleCount
        {
            get
            {
                int n = 0;
                for (int i = 0; i < _tris.Length; i++) n += _tris[i].Count / 3;
                return n;
            }
        }

        public void Clear()
        {
            _v.Clear(); _n.Clear(); _uv.Clear();
            for (int i = 0; i < _tris.Length; i++) _tris[i].Clear();
        }

        // ------------------------------------------------------------------ primitives

        /// <summary>A quad with UVs given explicitly. Corners must go round the outline.</summary>
        public void AddQuad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 outward, CitySurface surface,
            Vector2 ua, Vector2 ub, Vector2 uc, Vector2 ud)
        {
            Vector3 face = Vector3.Cross(b - a, d - a);
            if (face.sqrMagnitude < 1e-12f) return;
            bool flip = Vector3.Dot(face, outward) < 0f;
            Vector3 normal = outward.sqrMagnitude > 1e-9f ? outward.normalized
                           : (flip ? -face.normalized : face.normalized);

            int i = _v.Count;
            _v.Add(a); _v.Add(b); _v.Add(c); _v.Add(d);
            _uv.Add(ua); _uv.Add(ub); _uv.Add(uc); _uv.Add(ud);
            for (int k = 0; k < 4; k++) _n.Add(normal);

            var t = _tris[(int)surface];
            if (flip)
            {
                t.Add(i); t.Add(i + 3); t.Add(i + 2);
                t.Add(i); t.Add(i + 2); t.Add(i + 1);
            }
            else
            {
                t.Add(i); t.Add(i + 1); t.Add(i + 2);
                t.Add(i); t.Add(i + 2); t.Add(i + 3);
            }
        }

        /// <summary>A quad UV'd from its own edge lengths, so the material tiles at world scale.</summary>
        public void AddQuadWorld(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 outward, CitySurface surface,
            float scale = 1f, float uOffset = 0f, float vOffset = 0f)
        {
            float w = (b - a).magnitude, h = (d - a).magnitude;
            float u0 = uOffset / scale, v0 = vOffset / scale;
            float u1 = u0 + w / scale, v1 = v0 + h / scale;
            AddQuad(a, b, c, d, outward, surface,
                new Vector2(u0, v0), new Vector2(u1, v0), new Vector2(u1, v1), new Vector2(u0, v1));
        }

        public void AddTriangle(Vector3 a, Vector3 b, Vector3 c, Vector3 outward, CitySurface surface,
            Vector2 ua, Vector2 ub, Vector2 uc)
        {
            Vector3 face = Vector3.Cross(b - a, c - a);
            if (face.sqrMagnitude < 1e-12f) return;
            bool flip = Vector3.Dot(face, outward) < 0f;
            Vector3 normal = outward.sqrMagnitude > 1e-9f ? outward.normalized
                           : (flip ? -face.normalized : face.normalized);

            int i = _v.Count;
            _v.Add(a); _v.Add(b); _v.Add(c);
            _uv.Add(ua); _uv.Add(ub); _uv.Add(uc);
            for (int k = 0; k < 3; k++) _n.Add(normal);

            var t = _tris[(int)surface];
            if (flip) { t.Add(i); t.Add(i + 2); t.Add(i + 1); }
            else { t.Add(i); t.Add(i + 1); t.Add(i + 2); }
        }

        /// <summary>
        /// A box standing on <paramref name="baseY"/>, rotated about Y. The bottom face is left
        /// off unless asked for: nothing ever sees the underside of a building or a plant box,
        /// and the city is made of thousands of these.
        /// </summary>
        public void AddBox(Vector2 centre, Vector2 size, float yawDegrees, float baseY, float height,
            CitySurface surface, float uvScale = 1f, bool includeBottom = false, bool includeTop = true)
        {
            if (height <= 0.005f || size.x <= 0.005f || size.y <= 0.005f) return;

            Vector2 ax, az;
            CityGeom.Axes(yawDegrees, out ax, out az);
            Vector3 x = new Vector3(ax.x, 0f, ax.y) * (size.x * 0.5f);
            Vector3 z = new Vector3(az.x, 0f, az.y) * (size.y * 0.5f);
            Vector3 up = new Vector3(0f, height, 0f);
            Vector3 o = new Vector3(centre.x, baseY, centre.y);

            Vector3 b00 = o - x - z, b10 = o + x - z, b11 = o + x + z, b01 = o - x + z;
            Vector3 t00 = b00 + up, t10 = b10 + up, t11 = b11 + up, t01 = b01 + up;

            Vector3 nx = new Vector3(ax.x, 0f, ax.y), nz = new Vector3(az.x, 0f, az.y);
            AddQuadWorld(b00, b10, t10, t00, -nz, surface, uvScale);
            AddQuadWorld(b11, b01, t01, t11, nz, surface, uvScale);
            AddQuadWorld(b10, b11, t11, t10, nx, surface, uvScale);
            AddQuadWorld(b01, b00, t00, t01, -nx, surface, uvScale);
            if (includeTop) AddQuadWorld(t00, t10, t11, t01, Vector3.up, surface, uvScale);
            if (includeBottom) AddQuadWorld(b00, b01, b11, b10, Vector3.down, surface, uvScale);
        }

        /// <summary>A box given by two world corners, axis aligned. For plant and clutter.</summary>
        public void AddBoxAligned(Vector3 lo, Vector3 hi, CitySurface surface, float uvScale = 1f, bool includeBottom = false)
        {
            AddBox(new Vector2((lo.x + hi.x) * 0.5f, (lo.z + hi.z) * 0.5f),
                new Vector2(hi.x - lo.x, hi.z - lo.z), 0f, lo.y, hi.y - lo.y, surface, uvScale, includeBottom);
        }

        /// <summary>
        /// A hollow ring of wall: four boxes round the edge of a rectangle. This is the parapet
        /// on every flat roof in the city, and the thing that stops a roof reading as a lid.
        /// </summary>
        public void AddWallRing(Vector2 centre, Vector2 size, float yawDegrees, float baseY,
            float height, float thickness, CitySurface surface, float uvScale = 1f)
        {
            if (height <= 0.01f || thickness <= 0.005f) return;
            Vector2 ax, az;
            CityGeom.Axes(yawDegrees, out ax, out az);
            float hx = size.x * 0.5f - thickness * 0.5f;
            float hz = size.y * 0.5f - thickness * 0.5f;

            AddBox(centre + az * hz, new Vector2(size.x, thickness), yawDegrees, baseY, height, surface, uvScale);
            AddBox(centre - az * hz, new Vector2(size.x, thickness), yawDegrees, baseY, height, surface, uvScale);
            AddBox(centre + ax * hx, new Vector2(thickness, size.y - thickness * 2f), yawDegrees, baseY, height, surface, uvScale);
            AddBox(centre - ax * hx, new Vector2(thickness, size.y - thickness * 2f), yawDegrees, baseY, height, surface, uvScale);
        }

        /// <summary>A vertical post. Railings, poles, tank legs, sign supports.</summary>
        public void AddPost(Vector3 foot, float radius, float height, int sides, CitySurface surface)
        {
            if (height <= 0.01f || radius <= 0.001f) return;
            int start = _v.Count;
            for (int i = 0; i <= sides; i++)
            {
                float a = i / (float)sides * Mathf.PI * 2f;
                Vector3 dir = new Vector3(Mathf.Cos(a), 0f, Mathf.Sin(a));
                _v.Add(foot + dir * radius); _n.Add(dir); _uv.Add(new Vector2(i * radius * 6f, 0f));
                _v.Add(foot + dir * radius + Vector3.up * height); _n.Add(dir); _uv.Add(new Vector2(i * radius * 6f, height));
            }
            var t = _tris[(int)surface];
            for (int i = 0; i < sides; i++)
            {
                int a = start + i * 2, b = a + 1, c = a + 2, d = a + 3;
                t.Add(a); t.Add(c); t.Add(b);
                t.Add(b); t.Add(c); t.Add(d);
            }
        }

        /// <summary>A horizontal bar between two points, as a thin square section.</summary>
        public void AddBar(Vector3 from, Vector3 to, float thickness, CitySurface surface)
        {
            Vector3 along = to - from;
            float len = along.magnitude;
            if (len < 0.01f) return;
            along /= len;
            Vector3 side = Vector3.Cross(along, Vector3.up);
            if (side.sqrMagnitude < 1e-6f) side = Vector3.right;
            side = side.normalized * (thickness * 0.5f);
            Vector3 up = Vector3.Cross(side.normalized, along).normalized * (thickness * 0.5f);

            Vector3 a0 = from - side - up, a1 = from + side - up, a2 = from + side + up, a3 = from - side + up;
            Vector3 b0 = a0 + along * len, b1 = a1 + along * len, b2 = a2 + along * len, b3 = a3 + along * len;
            AddQuadWorld(a0, a1, b1, b0, -up, surface, 0.5f);
            AddQuadWorld(a2, a3, b3, b2, up, surface, 0.5f);
            AddQuadWorld(a1, a2, b2, b1, side, surface, 0.5f);
            AddQuadWorld(a3, a0, b0, b3, -side, surface, 0.5f);
        }

        /// <summary>
        /// A pitched roof over a rectangle: a ridge running along the longer side, eaves
        /// overhanging by <paramref name="overhang"/>. Gables are closed off, so it works as a
        /// roof on its own rather than needing a box under it.
        /// </summary>
        public void AddGableRoof(Vector2 centre, Vector2 size, float yawDegrees, float eaveY,
            float rise, float overhang, CitySurface roof, CitySurface gable)
        {
            Vector2 ax, az;
            CityGeom.Axes(yawDegrees, out ax, out az);
            bool ridgeAlongX = size.x >= size.y;
            Vector2 along = ridgeAlongX ? ax : az;
            Vector2 across = ridgeAlongX ? az : ax;
            float halfAlong = (ridgeAlongX ? size.x : size.y) * 0.5f + overhang;
            float halfAcross = (ridgeAlongX ? size.y : size.x) * 0.5f + overhang;

            Vector3 A = new Vector3(along.x, 0f, along.y), C = new Vector3(across.x, 0f, across.y);
            Vector3 o = new Vector3(centre.x, eaveY, centre.y);
            Vector3 ridge0 = o + A * halfAlong + Vector3.up * rise;
            Vector3 ridge1 = o - A * halfAlong + Vector3.up * rise;

            Vector3 e00 = o + A * halfAlong + C * halfAcross;
            Vector3 e01 = o - A * halfAlong + C * halfAcross;
            Vector3 e10 = o + A * halfAlong - C * halfAcross;
            Vector3 e11 = o - A * halfAlong - C * halfAcross;

            float slope = Mathf.Sqrt(halfAcross * halfAcross + rise * rise);
            float run = halfAlong * 2f;
            AddQuad(e00, e01, ridge1, ridge0, (C + Vector3.up * (halfAcross / Mathf.Max(0.01f, rise))).normalized, roof,
                new Vector2(0f, 0f), new Vector2(run, 0f), new Vector2(run, slope), new Vector2(0f, slope));
            AddQuad(e11, e10, ridge0, ridge1, (-C + Vector3.up * (halfAcross / Mathf.Max(0.01f, rise))).normalized, roof,
                new Vector2(0f, 0f), new Vector2(run, 0f), new Vector2(run, slope), new Vector2(0f, slope));

            // Gable ends, so you cannot see in under the ridge.
            Vector3 g0 = o + A * halfAlong + C * halfAcross;
            Vector3 g1 = o + A * halfAlong - C * halfAcross;
            AddTriangle(g0, g1, ridge0, A, gable,
                new Vector2(0f, 0f), new Vector2(halfAcross * 2f, 0f), new Vector2(halfAcross, rise));
            Vector3 h0 = o - A * halfAlong + C * halfAcross;
            Vector3 h1 = o - A * halfAlong - C * halfAcross;
            AddTriangle(h1, h0, ridge1, -A, gable,
                new Vector2(0f, 0f), new Vector2(halfAcross * 2f, 0f), new Vector2(halfAcross, rise));
        }

        // ------------------------------------------------------------------ output

        public Mesh Build(string name)
        {
            var mesh = new Mesh();
            mesh.name = name;
            mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            mesh.SetVertices(_v);
            mesh.SetNormals(_n);
            mesh.SetUVs(0, _uv);
            mesh.subMeshCount = (int)CitySurface.Count;
            for (int i = 0; i < _tris.Length; i++) mesh.SetTriangles(_tris[i], i);
            mesh.RecalculateBounds();
            mesh.RecalculateTangents();
            return mesh;
        }

        /// <summary>Read-only access, for the offline mesh dumps the build is checked with.</summary>
        public IList<Vector3> Vertices { get { return _v; } }
        public IList<Vector3> Normals { get { return _n; } }
        public IList<Vector2> Uvs { get { return _uv; } }
        public IList<int> Triangles(CitySurface s) { return _tris[(int)s]; }
    }
}
