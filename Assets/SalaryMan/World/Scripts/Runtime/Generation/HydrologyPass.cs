using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>A standing body of water found by the depression filling pass.</summary>
    public sealed class LakeInfo
    {
        public Vector2 CenterWorld;
        public float SurfaceHeight;
        public float RadiusWorld;
        public float MaxDepth;
        public int CellCount;
        public Rect BoundsWorld;
    }

    /// <summary>A traced river, from the point it becomes a real watercourse down to the sea.</summary>
    public sealed class RiverPath
    {
        public string Name;
        /// <summary>World space points. Y is the water surface height, not the bed.</summary>
        public List<Vector3> Points = new List<Vector3>();
        /// <summary>Half width of the water at each point, in metres.</summary>
        public List<float> HalfWidths = new List<float>();
        public float Discharge;
    }

    public sealed class HydrologyResult
    {
        public Field2D Flow;          // log scaled flow accumulation, 0..1
        public Field2D FlowRaw;       // upstream cell count
        public Field2D LakeSurface;   // water surface height, or NoLake
        public Field2D RiverMask;     // 0..1, 1 in the middle of a carved channel
        public int[] FlowDir;         // D8 direction index per cell, -1 where there is no outlet
        public List<LakeInfo> Lakes = new List<LakeInfo>();
        public List<RiverPath> Rivers = new List<RiverPath>();
        public const float NoLake = -9999f;
    }

    /// <summary>
    /// Turns raw relief into a drainage system: fills depressions, works out where water goes,
    /// carves the channels, flattens the flood plains and records the lakes. Japanese rivers
    /// are short and steep with wide braided gravel beds, and they build flat valley floors
    /// between very steep walls; that contrast is most of the look of rural Japan.
    /// </summary>
    public static class HydrologyPass
    {
        public static HydrologyResult Run(Field2D h, LandmassContext ctx, KontoWorldSettings s, Action<string, float> progress = null)
        {
            int w = h.Width, hh = h.Height;
            int n = w * hh;
            var result = new HydrologyResult();

            Report(progress, "Filling depressions", 0f);
            var filled = PriorityFloodFill(h, ctx);

            Report(progress, "Tracing drainage", 0.25f);
            var flowDir = new int[n];
            var accum = new Field2D(w, hh, 1f);
            ComputeFlow(filled, ctx, flowDir, accum);

            Report(progress, "Carving rivers", 0.5f);
            var riverMask = new Field2D(w, hh);
            CarveRivers(h, filled, ctx, s, accum, riverMask);

            Report(progress, "Building flood plains", 0.7f);
            FlattenValleyFloors(h, ctx, s, accum);

            Report(progress, "Filling lakes", 0.85f);
            var lakeSurface = new Field2D(w, hh, HydrologyResult.NoLake);
            ExtractLakes(h, filled, ctx, s, lakeSurface, result.Lakes);

            // Normalised, log scaled discharge. Used for splatmaps, vegetation and terracing.
            var flow = new Field2D(w, hh);
            float maxLog = Mathf.Log(Mathf.Max(2f, n * 0.02f));
            Parallel.For(0, n, i => { flow.Data[i] = Mathf.Clamp01(Mathf.Log(1f + accum.Data[i]) / maxLog); });

            result.Flow = flow;
            result.FlowRaw = accum;
            result.RiverMask = riverMask;
            result.LakeSurface = lakeSurface;
            result.FlowDir = flowDir;

            Report(progress, "Tracing rivers", 0.95f);
            TraceRivers(h, ctx, s, accum, flowDir, lakeSurface, result.Rivers);
            Report(progress, "Hydrology complete", 1f);
            return result;
        }

        static void Report(Action<string, float> progress, string msg, float t)
        {
            if (progress != null) progress(msg, t);
        }

        // ---------------------------------------------------------------- depression filling

        /// <summary>Flat array binary min heap. A generic PriorityQueue is not available on
        /// every Unity scripting runtime, and this one has no allocation per push.</summary>
        sealed class MinHeap
        {
            float[] _keys;
            int[] _values;
            int _count;

            public MinHeap(int capacity)
            {
                capacity = Mathf.Max(1024, capacity);
                _keys = new float[capacity];
                _values = new int[capacity];
            }

            public int Count { get { return _count; } }

            public void Push(float key, int value)
            {
                if (_count == _keys.Length)
                {
                    Array.Resize(ref _keys, _keys.Length * 2);
                    Array.Resize(ref _values, _values.Length * 2);
                }
                int i = _count++;
                _keys[i] = key;
                _values[i] = value;
                while (i > 0)
                {
                    int parent = (i - 1) >> 1;
                    if (_keys[parent] <= _keys[i]) break;
                    Swap(parent, i);
                    i = parent;
                }
            }

            public void Pop(out float key, out int value)
            {
                key = _keys[0];
                value = _values[0];
                _count--;
                _keys[0] = _keys[_count];
                _values[0] = _values[_count];
                int i = 0;
                while (true)
                {
                    int l = i * 2 + 1, r = l + 1, small = i;
                    if (l < _count && _keys[l] < _keys[small]) small = l;
                    if (r < _count && _keys[r] < _keys[small]) small = r;
                    if (small == i) break;
                    Swap(small, i);
                    i = small;
                }
            }

            void Swap(int a, int b)
            {
                float k = _keys[a]; _keys[a] = _keys[b]; _keys[b] = k;
                int v = _values[a]; _values[a] = _values[b]; _values[b] = v;
            }
        }

        /// <summary>
        /// Priority flood (Barnes et al). Water enters from the sea and from the map edges and
        /// rises until every inland pit has an outlet, so afterwards nothing drains into a hole.
        /// The difference between the filled surface and the real one is where the lakes are.
        /// </summary>
        static Field2D PriorityFloodFill(Field2D h, LandmassContext ctx)
        {
            int w = h.Width, hh = h.Height, n = w * hh;
            var filled = new Field2D(w, hh);
            var closed = new bool[n];
            var heap = new MinHeap(n / 4);

            // Seed: the sea, plus the border of the map.
            for (int y = 0; y < hh; y++)
            for (int x = 0; x < w; x++)
            {
                int idx = y * w + x;
                bool border = x == 0 || y == 0 || x == w - 1 || y == hh - 1;
                bool sea = h.Data[idx] <= 0f;
                if (border || sea)
                {
                    filled.Data[idx] = h.Data[idx];
                    closed[idx] = true;
                    heap.Push(h.Data[idx], idx);
                }
            }

            const float Epsilon = 0.0012f;   // metres of forced downhill gradient across flats
            int[] dx = { -1, 1, 0, 0, -1, 1, -1, 1 };
            int[] dy = { 0, 0, -1, 1, -1, -1, 1, 1 };

            while (heap.Count > 0)
            {
                float curKey;
                int curIndex;
                heap.Pop(out curKey, out curIndex);
                int cx = curIndex % w;
                int cy = curIndex / w;

                for (int k = 0; k < 8; k++)
                {
                    int nx = cx + dx[k];
                    int ny = cy + dy[k];
                    if (nx < 0 || ny < 0 || nx >= w || ny >= hh) continue;
                    int nidx = ny * w + nx;
                    if (closed[nidx]) continue;

                    float value = Mathf.Max(h.Data[nidx], curKey + Epsilon);
                    filled.Data[nidx] = value;
                    closed[nidx] = true;
                    heap.Push(value, nidx);
                }
            }

            return filled;
        }

        // ---------------------------------------------------------------- flow

        static readonly int[] DX = { -1, 1, 0, 0, -1, 1, -1, 1 };
        static readonly int[] DY = { 0, 0, -1, 1, -1, -1, 1, 1 };
        static readonly float[] DDist = { 1f, 1f, 1f, 1f, 1.41421f, 1.41421f, 1.41421f, 1.41421f };

        static void ComputeFlow(Field2D filled, LandmassContext ctx, int[] flowDir, Field2D accum)
        {
            int w = filled.Width, hh = filled.Height, n = w * hh;

            Parallel.For(0, hh, y =>
            {
                for (int x = 0; x < w; x++)
                {
                    int idx = y * w + x;
                    float best = 0f;
                    int bestDir = -1;
                    float c = filled.Data[idx];
                    for (int k = 0; k < 8; k++)
                    {
                        int nx = x + DX[k], ny = y + DY[k];
                        if (nx < 0 || ny < 0 || nx >= w || ny >= hh) continue;
                        float drop = (c - filled.Data[ny * w + nx]) / DDist[k];
                        if (drop > best) { best = drop; bestDir = k; }
                    }
                    flowDir[idx] = bestDir;
                }
            });

            // Route water from the highest cell down. Sorting by elevation guarantees every
            // upstream contribution has already been added when a cell is processed.
            var keys = new float[n];
            var order = new int[n];
            for (int i = 0; i < n; i++) { keys[i] = filled.Data[i]; order[i] = i; }
            Array.Sort(keys, order);

            for (int i = n - 1; i >= 0; i--)
            {
                int idx = order[i];
                int dir = flowDir[idx];
                if (dir < 0) continue;
                int x = idx % w + DX[dir];
                int y = idx / w + DY[dir];
                if (x < 0 || y < 0 || x >= w || y >= hh) continue;
                accum.Data[y * w + x] += accum.Data[idx];
            }
        }

        // ---------------------------------------------------------------- channels

        static void CarveRivers(Field2D h, Field2D filled, LandmassContext ctx, KontoWorldSettings s, Field2D accum, Field2D riverMask)
        {
            int w = h.Width, hh = h.Height;
            float cell = ctx.CellSize;
            var carve = new Field2D(w, hh);

            for (int y = 1; y < hh - 1; y++)
            for (int x = 1; x < w - 1; x++)
            {
                int idx = y * w + x;
                if (ctx.LandMask.Data[idx] < 0.25f) continue;
                float a = accum.Data[idx];
                if (a < s.riverThreshold) continue;

                // Discharge grows roughly with the square root of catchment area, and channel
                // width and depth grow with discharge. Log keeps the big rivers in scale.
                float strength = Mathf.Log(a / s.riverThreshold + 1f) / Mathf.Log(120f);
                strength = Mathf.Clamp01(strength);

                float depth = s.riverMaxCarve * Mathf.Pow(strength, 0.85f);
                float halfWidth = Mathf.Max(cell, s.riverMaxWidth * Mathf.Pow(strength, 0.7f));
                int r = Mathf.Clamp(Mathf.CeilToInt(halfWidth / cell), 1, 24);

                for (int oy = -r; oy <= r; oy++)
                for (int ox = -r; ox <= r; ox++)
                {
                    int nx = x + ox, ny = y + oy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= hh) continue;
                    float d = Mathf.Sqrt(ox * ox + oy * oy) * cell / halfWidth;
                    if (d > 1f) continue;
                    // Flat bottomed, steep sided: Japanese rivers run in wide gravel beds.
                    float profile = 1f - Mathf.Pow(Mathf.Clamp01(d), 2.6f);
                    int nidx = ny * w + nx;
                    if (profile * depth > carve.Data[nidx]) carve.Data[nidx] = profile * depth;
                    float mask = 1f - Mathf.Clamp01(d);
                    if (mask > riverMask.Data[nidx]) riverMask.Data[nidx] = mask;
                }
            }

            carve.Blur(1, 1);
            Parallel.For(0, h.Data.Length, i =>
            {
                if (carve.Data[i] <= 0f) return;
                float floorLimit = ctx.LandMask.Data[i] > 0.5f ? -1.5f : -9999f;
                h.Data[i] = Mathf.Max(h.Data[i] - carve.Data[i], floorLimit);
            });
        }

        /// <summary>
        /// Flattens the ground along the bigger rivers into flood plains. The flat strips of
        /// paddy along a valley floor, hemmed in by slopes that jump straight up, are the
        /// single most recognisable feature of the Japanese countryside.
        /// </summary>
        static void FlattenValleyFloors(Field2D h, LandmassContext ctx, KontoWorldSettings s, Field2D accum)
        {
            if (s.alluvialFanStrength <= 0f) return;
            int w = h.Width, hh = h.Height;
            float cell = ctx.CellSize;

            var smooth = h.Clone();
            smooth.Blur(Mathf.Max(1, Mathf.RoundToInt(70f / cell)), 2);

            Parallel.For(0, hh, y =>
            {
                for (int x = 0; x < w; x++)
                {
                    int idx = y * w + x;
                    if (ctx.LandMask.Data[idx] < 0.25f) continue;
                    float a = accum.Data[idx];
                    if (a < s.riverThreshold * 0.35f) continue;

                    float slope = h.SlopeAt(x, y, cell);
                    // Only flat-ish ground next to a decent river becomes flood plain.
                    float wgt = Mathf.Clamp01(Mathf.Log(a / (s.riverThreshold * 0.35f) + 1f) / Mathf.Log(40f))
                              * (1f - KontoNoise.SmoothStep(0.07f, 0.22f, slope))
                              * s.alluvialFanStrength;
                    if (wgt <= 0.001f) continue;
                    h.Data[idx] = Mathf.Lerp(h.Data[idx], smooth.Data[idx], Mathf.Clamp01(wgt));
                }
            });
        }

        // ---------------------------------------------------------------- lakes

        static void ExtractLakes(Field2D h, Field2D filled, LandmassContext ctx, KontoWorldSettings s, Field2D lakeSurface, List<LakeInfo> lakes)
        {
            int w = h.Width, hh = h.Height;
            var visited = new bool[w * hh];
            var queue = new Queue<int>();
            float cell = ctx.CellSize;

            for (int y = 1; y < hh - 1; y++)
            for (int x = 1; x < w - 1; x++)
            {
                int start = y * w + x;
                if (visited[start]) continue;
                if (ctx.LandMask.Data[start] < 0.5f) continue;
                float depth = filled.Data[start] - h.Data[start];
                if (depth < s.minLakeDepth) continue;

                // Flood fill this basin.
                queue.Clear();
                queue.Enqueue(start);
                visited[start] = true;
                var cells = new List<int>();
                double sumSurface = 0.0;
                float maxDepth = 0f;
                float minX = float.MaxValue, maxX = float.MinValue, minY = float.MaxValue, maxY = float.MinValue;

                while (queue.Count > 0)
                {
                    int idx = queue.Dequeue();
                    cells.Add(idx);
                    sumSurface += filled.Data[idx];
                    maxDepth = Mathf.Max(maxDepth, filled.Data[idx] - h.Data[idx]);

                    int cx = idx % w, cy = idx / w;
                    Vector2 wp = ctx.CellToWorld(cx, cy);
                    minX = Mathf.Min(minX, wp.x); maxX = Mathf.Max(maxX, wp.x);
                    minY = Mathf.Min(minY, wp.y); maxY = Mathf.Max(maxY, wp.y);

                    for (int k = 0; k < 4; k++)
                    {
                        int nx = cx + DX[k], ny = cy + DY[k];
                        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= hh - 1) continue;
                        int nidx = ny * w + nx;
                        if (visited[nidx]) continue;
                        if (filled.Data[nidx] - h.Data[nidx] < 0.35f) continue;
                        visited[nidx] = true;
                        queue.Enqueue(nidx);
                    }
                }

                if (cells.Count < 24) continue;

                float surface = (float)(sumSurface / cells.Count);
                foreach (int idx in cells) lakeSurface.Data[idx] = surface;

                float areaSqr = cells.Count * cell * cell;
                lakes.Add(new LakeInfo
                {
                    CenterWorld = new Vector2((minX + maxX) * 0.5f, (minY + maxY) * 0.5f),
                    SurfaceHeight = surface,
                    RadiusWorld = Mathf.Sqrt(areaSqr / Mathf.PI),
                    MaxDepth = maxDepth,
                    CellCount = cells.Count,
                    BoundsWorld = new Rect(minX, minY, maxX - minX, maxY - minY),
                });
            }

            lakes.Sort((a, b) => b.CellCount.CompareTo(a.CellCount));
        }

        // ---------------------------------------------------------------- river paths

        /// <summary>
        /// Walks the drainage network downstream from the point each river becomes substantial,
        /// producing polylines that water surfaces can be built along. Surface heights are
        /// forced to run downhill: a river that climbs even slightly reads as broken immediately.
        /// </summary>
        static void TraceRivers(Field2D h, LandmassContext ctx, KontoWorldSettings s, Field2D accum, int[] flowDir,
            Field2D lakeSurface, List<RiverPath> rivers)
        {
            int w = h.Width, hh = h.Height;
            float cell = ctx.CellSize;
            float startFlow = s.riverThreshold * 5f;
            int sampleEvery = Mathf.Max(1, Mathf.RoundToInt(22f / cell));

            var onPath = new bool[w * hh];
            var heads = new List<int>();

            for (int y = 2; y < hh - 2; y++)
            for (int x = 2; x < w - 2; x++)
            {
                int idx = y * w + x;
                if (ctx.LandMask.Data[idx] < 0.5f) continue;
                if (accum.Data[idx] < startFlow) continue;

                // A head is the first cell on a watercourse: nothing upstream is big enough yet.
                bool isHead = true;
                for (int k = 0; k < 8 && isHead; k++)
                {
                    int nx = x - DX[k], ny = y - DY[k];
                    if (nx < 0 || ny < 0 || nx >= w || ny >= hh) continue;
                    int nidx = ny * w + nx;
                    if (flowDir[nidx] != k) continue;       // that neighbour does not flow into us
                    if (accum.Data[nidx] >= startFlow) isHead = false;
                }
                if (isHead) heads.Add(idx);
            }

            // Biggest rivers first, so the cap keeps the ones that matter.
            heads.Sort((a, b) => accum.Data[b].CompareTo(accum.Data[a]));

            const int MaxRivers = 48;
            const int MaxSteps = 20000;

            foreach (int head in heads)
            {
                if (rivers.Count >= MaxRivers) break;
                if (onPath[head]) continue;

                var path = new RiverPath { Discharge = accum.Data[head] };
                int idx = head;
                int steps = 0;
                int sinceSample = sampleEvery;

                while (steps++ < MaxSteps)
                {
                    int x = idx % w, y = idx / w;
                    if (x < 1 || y < 1 || x >= w - 1 || y >= hh - 1) break;

                    if (sinceSample >= sampleEvery)
                    {
                        sinceSample = 0;
                        Vector2 wp = ctx.CellToWorld(x, y);
                        float bed = h.Data[idx];
                        float strength = Mathf.Clamp01(Mathf.Log(accum.Data[idx] / s.riverThreshold + 1f) / Mathf.Log(120f));
                        float halfWidth = Mathf.Max(cell * 0.9f, s.riverMaxWidth * Mathf.Pow(strength, 0.7f) * 0.62f);
                        // Sit the surface a little above the bed; the carve profile is flat bottomed.
                        float surface = bed + Mathf.Lerp(0.35f, 1.6f, strength);

                        float lake = lakeSurface.Data[idx];
                        if (lake > HydrologyResult.NoLake + 1f) surface = lake;

                        path.Points.Add(new Vector3(wp.x, surface, wp.y));
                        path.HalfWidths.Add(halfWidth);
                    }
                    else sinceSample++;

                    onPath[idx] = true;

                    if (h.Data[idx] <= 0.15f) break;                 // reached the sea

                    int dir = flowDir[idx];
                    if (dir < 0) break;
                    int nx2 = x + DX[dir], ny2 = y + DY[dir];
                    if (nx2 < 0 || ny2 < 0 || nx2 >= w || ny2 >= hh) break;
                    int next = ny2 * w + nx2;

                    // Stop where this river joins one that has already been traced.
                    if (onPath[next])
                    {
                        Vector2 wpj = ctx.CellToWorld(nx2, ny2);
                        path.Points.Add(new Vector3(wpj.x, h.Data[next] + 0.6f, wpj.y));
                        path.HalfWidths.Add(path.HalfWidths.Count > 0 ? path.HalfWidths[path.HalfWidths.Count - 1] : cell);
                        break;
                    }
                    idx = next;
                }

                if (path.Points.Count < 4) continue;

                // Force the surface downhill and smooth it, so the water never climbs a step.
                float running = path.Points[0].y;
                for (int i = 0; i < path.Points.Count; i++)
                {
                    var p = path.Points[i];
                    running = Mathf.Min(running, p.y);
                    p.y = running;
                    path.Points[i] = p;
                }
                SmoothPath(path);

                path.Name = "River_" + rivers.Count.ToString("00");
                rivers.Add(path);
            }
        }

        static void SmoothPath(RiverPath path)
        {
            int n = path.Points.Count;
            if (n < 3) return;
            var smoothed = new List<Vector3>(n);
            for (int i = 0; i < n; i++)
            {
                Vector3 a = path.Points[Mathf.Max(0, i - 1)];
                Vector3 b = path.Points[i];
                Vector3 c = path.Points[Mathf.Min(n - 1, i + 1)];
                smoothed.Add(new Vector3((a.x + 2f * b.x + c.x) * 0.25f, Mathf.Min(b.y, (a.y + 2f * b.y + c.y) * 0.25f), (a.z + 2f * b.z + c.z) * 0.25f));
            }
            path.Points = smoothed;

            var widths = new List<float>(n);
            for (int i = 0; i < n; i++)
            {
                float a = path.HalfWidths[Mathf.Max(0, i - 1)];
                float b = path.HalfWidths[i];
                float c = path.HalfWidths[Mathf.Min(n - 1, i + 1)];
                widths.Add((a + 2f * b + c) * 0.25f);
            }
            path.HalfWidths = widths;
        }
    }
}
