using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Thermal (mass wasting) erosion. Anything steeper than the angle of repose slides
    /// downhill. This is what puts scree cones under cliffs and stops the raw noise from
    /// leaving impossible overhanging walls.
    /// </summary>
    public static class ThermalErosion
    {
        public static void Run(Field2D h, float cellSize, float talusAngleDegrees, int iterations, Field2D landMask = null)
        {
            if (iterations <= 0) return;
            float maxDelta = Mathf.Tan(talusAngleDegrees * Mathf.Deg2Rad) * cellSize;
            int w = h.Width, hh = h.Height;
            var delta = new float[h.Data.Length];

            for (int it = 0; it < iterations; it++)
            {
                Array.Clear(delta, 0, delta.Length);

                Parallel.For(1, hh - 1, y =>
                {
                    for (int x = 1; x < w - 1; x++)
                    {
                        int idx = y * w + x;
                        if (landMask != null && landMask.Data[idx] < 0.02f) continue;

                        float c = h.Data[idx];
                        float total = 0f;
                        float largest = 0f;
                        float d0 = 0f, d1 = 0f, d2 = 0f, d3 = 0f;

                        float n0 = c - h.Data[idx - 1];
                        float n1 = c - h.Data[idx + 1];
                        float n2 = c - h.Data[idx - w];
                        float n3 = c - h.Data[idx + w];

                        if (n0 > maxDelta) { d0 = n0 - maxDelta; total += d0; if (d0 > largest) largest = d0; }
                        if (n1 > maxDelta) { d1 = n1 - maxDelta; total += d1; if (d1 > largest) largest = d1; }
                        if (n2 > maxDelta) { d2 = n2 - maxDelta; total += d2; if (d2 > largest) largest = d2; }
                        if (n3 > maxDelta) { d3 = n3 - maxDelta; total += d3; if (d3 > largest) largest = d3; }
                        if (total <= 0f) continue;

                        // Move half of the STEEPEST excess, not half of the sum of all four.
                        // Summing them lets a spike surrounded by low ground shed four times its
                        // own excess in one pass: it ends up below its neighbours, they dump it
                        // back next pass, and the oscillation doubles every iteration until the
                        // heightfield is meaningless. Half the largest excess can never overshoot
                        // past the repose angle, so the pass converges instead of exploding.
                        float move = largest * 0.5f;
                        float scale = move / total;

                        delta[idx] -= move;
                        if (d0 > 0f) delta[idx - 1] += d0 * scale;
                        if (d1 > 0f) delta[idx + 1] += d1 * scale;
                        if (d2 > 0f) delta[idx - w] += d2 * scale;
                        if (d3 > 0f) delta[idx + w] += d3 * scale;
                    }
                });

                for (int i = 0; i < delta.Length; i++) h.Data[i] += delta[i];
            }
        }
    }

    /// <summary>
    /// Droplet based hydraulic erosion. Japan gets 1700 mm of rain a year onto steep young
    /// rock, which is exactly why its mountains are so finely dissected: short, steep,
    /// densely branched V shaped valleys with gravel choked floors. Enough droplets and
    /// that pattern emerges on its own.
    /// </summary>
    public static class HydraulicErosion
    {
        struct Brush
        {
            public int[] OffsetX;
            public int[] OffsetY;
            public float[] Weight;
        }

        static Brush BuildBrush(int radius)
        {
            var ox = new List<int>();
            var oy = new List<int>();
            var wt = new List<float>();
            float sum = 0f;
            for (int y = -radius; y <= radius; y++)
            for (int x = -radius; x <= radius; x++)
            {
                float d2 = x * x + y * y;
                if (d2 > radius * radius) continue;
                float w = 1f - Mathf.Sqrt(d2) / radius;
                ox.Add(x); oy.Add(y); wt.Add(w);
                sum += w;
            }
            var brush = new Brush { OffsetX = ox.ToArray(), OffsetY = oy.ToArray(), Weight = wt.ToArray() };
            if (sum > 0f) for (int i = 0; i < brush.Weight.Length; i++) brush.Weight[i] /= sum;
            return brush;
        }

        /// <summary>
        /// Runs the simulation in place. Droplets are spawned only on land above the shoreline,
        /// and batches run in parallel: droplets do occasionally write to the same cell, but at
        /// these counts the result is indistinguishable and it is several times faster.
        /// </summary>
        public static void Run(Field2D h, LandmassContext ctx, KontoWorldSettings s, Action<float> progress = null)
        {
            int droplets = Mathf.Max(0, s.erosionDroplets);
            if (droplets == 0) return;

            int w = h.Width, hh = h.Height;
            var brush = BuildBrush(Mathf.Max(1, s.erosionBrushRadius));
            float cellSize = ctx.CellSize;

            // Collect spawn candidates once: only cells that are actually land.
            var spawn = new List<int>(w * hh / 3);
            for (int y = 2; y < hh - 2; y++)
            for (int x = 2; x < w - 2; x++)
            {
                int idx = y * w + x;
                if (ctx.LandMask.Data[idx] > 0.35f && h.Data[idx] > 1.0f) spawn.Add(idx);
            }
            if (spawn.Count == 0) return;
            int[] spawnArr = spawn.ToArray();

            int batches = 64;
            int perBatch = Mathf.Max(1, droplets / batches);

            for (int b = 0; b < batches; b++)
            {
                int batchSeed = s.seed * 7919 + b * 104729;
                Parallel.For(0, Environment.ProcessorCount, threadIndex =>
                {
                    int count = perBatch / Environment.ProcessorCount;
                    var rng = new System.Random(batchSeed + threadIndex * 6151);
                    for (int i = 0; i < count; i++)
                    {
                        int start = spawnArr[rng.Next(spawnArr.Length)];
                        float px = start % w + (float)rng.NextDouble() - 0.5f;
                        float py = start / w + (float)rng.NextDouble() - 0.5f;
                        Simulate(h, ctx, s, brush, cellSize, px, py);
                    }
                });
                if (progress != null) progress((b + 1) / (float)batches);
            }
        }

        static void Simulate(Field2D h, LandmassContext ctx, KontoWorldSettings s, Brush brush, float cellSize, float px, float py)
        {
            int w = h.Width, hh = h.Height;
            float dirX = 0f, dirY = 0f;
            float speed = 1f;
            float water = 1f;
            float sediment = 0f;

            for (int life = 0; life < s.dropletLifetime; life++)
            {
                int nodeX = (int)px;
                int nodeY = (int)py;
                if (nodeX < 1 || nodeX >= w - 2 || nodeY < 1 || nodeY >= hh - 2) break;

                float cellOffsetX = px - nodeX;
                float cellOffsetY = py - nodeY;

                float gradX, gradY, height;
                HeightAndGradient(h, w, nodeX, nodeY, cellOffsetX, cellOffsetY, out height, out gradX, out gradY);

                dirX = dirX * s.inertia - gradX * (1f - s.inertia);
                dirY = dirY * s.inertia - gradY * (1f - s.inertia);
                float len = Mathf.Sqrt(dirX * dirX + dirY * dirY);
                if (len < 1e-5f) break;
                dirX /= len;
                dirY /= len;

                px += dirX;
                py += dirY;

                int newX = (int)px;
                int newY = (int)py;
                if (newX < 1 || newX >= w - 2 || newY < 1 || newY >= hh - 2) break;

                float newHeightSample, ng0, ng1;
                HeightAndGradient(h, w, newX, newY, px - newX, py - newY, out newHeightSample, out ng0, out ng1);
                float deltaHeight = newHeightSample - height;

                // Once the droplet reaches the sea it drops everything it carries. That is how
                // deltas and river mouth bars build up.
                if (newHeightSample < 0.4f)
                {
                    Deposit(h, brush, w, hh, newX, newY, sediment * 0.85f);
                    break;
                }

                float slope = Mathf.Max(-deltaHeight / cellSize, s.minSedimentCapacitySlope);
                float capacity = slope * speed * water * s.sedimentCapacity;

                if (sediment > capacity || deltaHeight > 0f)
                {
                    // Uphill step: fill the pit we just walked into, otherwise drop the surplus.
                    float amount = (deltaHeight > 0f)
                        ? Mathf.Min(deltaHeight, sediment)
                        : (sediment - capacity) * s.depositSpeed;
                    sediment -= amount;
                    DepositBilinear(h, w, nodeX, nodeY, cellOffsetX, cellOffsetY, amount);
                }
                else
                {
                    float amount = Mathf.Min((capacity - sediment) * s.erodeSpeed, -deltaHeight);
                    amount = Erode(h, ctx, brush, w, hh, nodeX, nodeY, amount);
                    sediment += amount;
                }

                speed = Mathf.Sqrt(Mathf.Max(0f, speed * speed + -deltaHeight * s.gravity * 0.02f));
                water *= (1f - s.evaporateSpeed);
                if (water < 0.01f) break;
            }
        }

        static void HeightAndGradient(Field2D h, int w, int nodeX, int nodeY, float u, float v, out float height, out float gradX, out float gradY)
        {
            int idx = nodeY * w + nodeX;
            float nw = h.Data[idx];
            float ne = h.Data[idx + 1];
            float sw = h.Data[idx + w];
            float se = h.Data[idx + w + 1];

            gradX = (ne - nw) * (1f - v) + (se - sw) * v;
            gradY = (sw - nw) * (1f - u) + (se - ne) * u;
            height = nw * (1f - u) * (1f - v) + ne * u * (1f - v) + sw * (1f - u) * v + se * u * v;
        }

        static void DepositBilinear(Field2D h, int w, int nodeX, int nodeY, float u, float v, float amount)
        {
            int idx = nodeY * w + nodeX;
            h.Data[idx]         += amount * (1f - u) * (1f - v);
            h.Data[idx + 1]     += amount * u * (1f - v);
            h.Data[idx + w]     += amount * (1f - u) * v;
            h.Data[idx + w + 1] += amount * u * v;
        }

        static void Deposit(Field2D h, Brush brush, int w, int hh, int cx, int cy, float amount)
        {
            if (amount <= 0f) return;
            for (int i = 0; i < brush.Weight.Length; i++)
            {
                int x = cx + brush.OffsetX[i];
                int y = cy + brush.OffsetY[i];
                if (x < 0 || y < 0 || x >= w || y >= hh) continue;
                h.Data[y * w + x] += amount * brush.Weight[i];
            }
        }

        static float Erode(Field2D h, LandmassContext ctx, Brush brush, int w, int hh, int cx, int cy, float amount)
        {
            if (amount <= 0f) return 0f;
            float removed = 0f;
            for (int i = 0; i < brush.Weight.Length; i++)
            {
                int x = cx + brush.OffsetX[i];
                int y = cy + brush.OffsetY[i];
                if (x < 0 || y < 0 || x >= w || y >= hh) continue;
                int idx = y * w + x;

                float take = amount * brush.Weight[i];
                // Never cut the land below the waterline from the inside; that would punch holes
                // through the coastal plains and open them to the sea.
                float floorLimit = ctx.LandMask.Data[idx] > 0.5f ? 0.6f : -9999f;
                float available = Mathf.Max(0f, h.Data[idx] - floorLimit);
                take = Mathf.Min(take, available);
                h.Data[idx] -= take;
                removed += take;
            }
            return removed;
        }
    }
}
