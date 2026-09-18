using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Small procedural mesh builder used to make stand-in vegetation. Two submeshes: 0 is bark
    /// or stem, 1 is foliage, so each gets its own material.
    /// </summary>
    public class KontoMeshBuilder
    {
        readonly List<Vector3> _vertices = new List<Vector3>();
        readonly List<Vector3> _normals = new List<Vector3>();
        readonly List<Vector2> _uvs = new List<Vector2>();
        readonly List<int>[] _submeshes = { new List<int>(), new List<int>() };

        public const int SubmeshBark = 0;
        public const int SubmeshFoliage = 1;

        public void AddCylinder(Vector3 baseCenter, float bottomRadius, float topRadius, float height, int sides, int submesh, float lean = 0f, float leanAngle = 0f)
        {
            int start = _vertices.Count;
            Vector3 leanOffset = new Vector3(Mathf.Cos(leanAngle), 0f, Mathf.Sin(leanAngle)) * lean;

            for (int i = 0; i <= sides; i++)
            {
                float a = i / (float)sides * Mathf.PI * 2f;
                Vector3 dir = new Vector3(Mathf.Cos(a), 0f, Mathf.Sin(a));
                _vertices.Add(baseCenter + dir * bottomRadius);
                _normals.Add(dir);
                _uvs.Add(new Vector2(i / (float)sides, 0f));

                _vertices.Add(baseCenter + Vector3.up * height + leanOffset + dir * topRadius);
                _normals.Add(dir);
                _uvs.Add(new Vector2(i / (float)sides, 1f));
            }

            var tris = _submeshes[submesh];
            for (int i = 0; i < sides; i++)
            {
                int a = start + i * 2;
                int b = a + 1;
                int c = a + 2;
                int d = a + 3;
                tris.Add(a); tris.Add(c); tris.Add(b);
                tris.Add(b); tris.Add(c); tris.Add(d);
            }
        }

        public void AddCone(Vector3 baseCenter, float radius, float height, int sides, int submesh, bool capped = true)
        {
            int start = _vertices.Count;
            Vector3 apex = baseCenter + Vector3.up * height;

            for (int i = 0; i < sides; i++)
            {
                float a0 = i / (float)sides * Mathf.PI * 2f;
                float a1 = (i + 1) / (float)sides * Mathf.PI * 2f;
                Vector3 p0 = baseCenter + new Vector3(Mathf.Cos(a0), 0f, Mathf.Sin(a0)) * radius;
                Vector3 p1 = baseCenter + new Vector3(Mathf.Cos(a1), 0f, Mathf.Sin(a1)) * radius;
                Vector3 n = Vector3.Cross(p1 - p0, apex - p0).normalized;

                _vertices.Add(p0); _normals.Add(n); _uvs.Add(new Vector2(0f, 0f));
                _vertices.Add(p1); _normals.Add(n); _uvs.Add(new Vector2(1f, 0f));
                _vertices.Add(apex); _normals.Add(n); _uvs.Add(new Vector2(0.5f, 1f));

                var tris = _submeshes[submesh];
                tris.Add(start + i * 3);
                tris.Add(start + i * 3 + 2);
                tris.Add(start + i * 3 + 1);
            }

            if (!capped) return;
            int capStart = _vertices.Count;
            _vertices.Add(baseCenter); _normals.Add(Vector3.down); _uvs.Add(new Vector2(0.5f, 0.5f));
            for (int i = 0; i <= sides; i++)
            {
                float a = i / (float)sides * Mathf.PI * 2f;
                _vertices.Add(baseCenter + new Vector3(Mathf.Cos(a), 0f, Mathf.Sin(a)) * radius);
                _normals.Add(Vector3.down);
                _uvs.Add(new Vector2(0.5f + Mathf.Cos(a) * 0.5f, 0.5f + Mathf.Sin(a) * 0.5f));
            }
            var capTris = _submeshes[submesh];
            for (int i = 0; i < sides; i++)
            {
                capTris.Add(capStart);
                capTris.Add(capStart + 1 + i);
                capTris.Add(capStart + 2 + i);
            }
        }

        /// <summary>A squashed sphere. Good enough for a broadleaf crown at any distance you would see one from.</summary>
        public void AddBlob(Vector3 center, float radius, float squash, int rings, int segments, int submesh, float noise = 0.18f, int seed = 0)
        {
            int start = _vertices.Count;
            for (int r = 0; r <= rings; r++)
            {
                float v = r / (float)rings;
                float phi = v * Mathf.PI;
                for (int s = 0; s <= segments; s++)
                {
                    float u = s / (float)segments;
                    float theta = u * Mathf.PI * 2f;
                    Vector3 dir = new Vector3(Mathf.Sin(phi) * Mathf.Cos(theta), Mathf.Cos(phi), Mathf.Sin(phi) * Mathf.Sin(theta));
                    float wobble = 1f + KontoNoise.Perlin(dir.x * 2.3f + seed, dir.z * 2.3f - seed, seed) * noise;
                    Vector3 p = new Vector3(dir.x * radius, dir.y * radius * squash, dir.z * radius) * wobble;
                    _vertices.Add(center + p);
                    _normals.Add(dir);
                    _uvs.Add(new Vector2(u, v));
                }
            }

            var tris = _submeshes[submesh];
            int stride = segments + 1;
            for (int r = 0; r < rings; r++)
            for (int s = 0; s < segments; s++)
            {
                int a = start + r * stride + s;
                int b = a + 1;
                int c = a + stride;
                int d = c + 1;
                tris.Add(a); tris.Add(c); tris.Add(b);
                tris.Add(b); tris.Add(c); tris.Add(d);
            }
        }

        public Mesh ToMesh(string meshName)
        {
            var mesh = new Mesh { name = meshName };
            if (_vertices.Count > 65000) mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            mesh.SetVertices(_vertices);
            mesh.SetNormals(_normals);
            mesh.SetUVs(0, _uvs);
            mesh.subMeshCount = 2;
            mesh.SetTriangles(_submeshes[0], 0);
            mesh.SetTriangles(_submeshes[1], 1);
            mesh.RecalculateBounds();
            mesh.RecalculateTangents();
            return mesh;
        }
    }
}
