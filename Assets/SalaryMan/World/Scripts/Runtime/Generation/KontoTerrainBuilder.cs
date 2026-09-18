using System;
using System.Collections.Generic;
using System.Reflection;
using System.Threading.Tasks;
using UnityEngine;

namespace SalaryMan.World
{
    public sealed class TerrainBuildOptions
    {
        public Transform parent;
        public Material terrainMaterial;
        public TerrainLayer[] layers;
        public KontoFoliageLibrary foliage;
        public bool paintDetails = true;
        public bool plantTrees = true;
        public int terrainLayerMask = 0;             // GameObject layer for terrains
        public string namePrefix = "Konto_Terrain";

        /// <summary>Raised once per finished tile so the editor wrapper can save the TerrainData as an asset.</summary>
        public Action<int, int, TerrainData> onTileCreated;
    }

    /// <summary>
    /// Builds the Unity terrain tiles from the generated world: heights, splatmaps, ground
    /// detail and trees, then stitches the tiles together so there is no seam or LOD popping
    /// at the joins.
    /// </summary>
    public static class KontoTerrainBuilder
    {
        public static Terrain[] Build(KontoWorldData data, TerrainBuildOptions options, Action<string, float> progress = null)
        {
            if (data == null) throw new ArgumentNullException("data");
            options = options ?? new TerrainBuildOptions();
            var s = data.Settings;

            int tiles = s.tilesX * s.tilesZ;
            var terrains = new Terrain[tiles];
            int done = 0;

            for (int tz = 0; tz < s.tilesZ; tz++)
            for (int tx = 0; tx < s.tilesX; tx++)
            {
                string label = string.Format("Tile {0},{1}", tx, tz);
                if (progress != null) progress("Building " + label, done / (float)tiles);

                var td = new TerrainData();
                td.name = string.Format("{0}_{1}_{2}", options.namePrefix, tx, tz);
                td.heightmapResolution = s.heightmapResolution;
                td.size = new Vector3(s.tileSize, s.TerrainHeightSpan, s.tileSize);
                td.baseMapResolution = s.baseMapResolution;
                td.SetDetailResolution(s.detailResolution, s.detailResolutionPerPatch);

                Vector2 origin = new Vector2(tx * s.tileSize, tz * s.tileSize);

                ApplyHeights(data, td, origin);

                var layers = SanitiseLayers(options.layers);
                if (layers != null)
                {
                    td.terrainLayers = layers;
                    PaintSplatmaps(data, td, origin, layers.Length);
                }

                if (options.paintDetails && options.foliage != null && options.foliage.HasAnyDetail())
                    PaintDetails(data, td, origin, options.foliage);

                if (options.plantTrees && options.foliage != null && options.foliage.HasAnyTreePrefab())
                    PlantTrees(data, td, origin, options.foliage);

                if (options.onTileCreated != null) options.onTileCreated(tx, tz, td);

                GameObject go = Terrain.CreateTerrainGameObject(td);
                go.name = td.name;
                go.transform.position = new Vector3(origin.x, -s.seaDepth, origin.y);
                if (options.parent != null) go.transform.SetParent(options.parent, true);
                if (options.terrainLayerMask != 0) go.layer = options.terrainLayerMask;

                var terrain = go.GetComponent<Terrain>();
                ConfigureTerrain(terrain, s, options.terrainMaterial);
                terrains[tz * s.tilesX + tx] = terrain;

                done++;
            }

            StitchNeighbours(terrains, s.tilesX, s.tilesZ);
            if (progress != null) progress("Terrain complete", 1f);
            return terrains;
        }

        /// <summary>
        /// Terrain layers must all be present: a null entry in the array throws inside
        /// TerrainData, and a half-built set would paint the wrong surfaces onto the world.
        /// </summary>
        static TerrainLayer[] SanitiseLayers(TerrainLayer[] layers)
        {
            if (layers == null || layers.Length == 0) return null;
            for (int i = 0; i < layers.Length; i++)
            {
                if (layers[i] != null) continue;
                Debug.LogWarning("[Konto] Terrain layer " + i + " is missing, so the terrain is being built untextured. "
                    + "Re-run the build with 'Generate ground textures' ticked.");
                return null;
            }
            return layers;
        }

        static void ConfigureTerrain(Terrain terrain, KontoWorldSettings s, Material material)
        {
            if (material != null) terrain.materialTemplate = material;

            // Tuned for a large open world seen from ground level and from mountain tops.
            terrain.heightmapPixelError = 3f;
            terrain.basemapDistance = 900f;
            terrain.detailObjectDistance = 180f;
            terrain.detailObjectDensity = 1f;
            terrain.treeDistance = 1400f;
            // Unity only builds billboards for Tree Creator and SpeedTree assets. Matching the
            // billboard distance to the draw distance keeps stand-in prefabs from disappearing.
            terrain.treeBillboardDistance = 1400f;
            terrain.treeCrossFadeLength = 40f;
            terrain.treeMaximumFullLODCount = 80;
            terrain.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            terrain.allowAutoConnect = true;
            terrain.groupingID = 0;

            // drawInstanced moved around between Unity versions and is deprecated in some of
            // them, so it is set reflectively: a missing property is not worth a compile error.
            var prop = typeof(Terrain).GetProperty("drawInstanced");
            if (prop != null && prop.CanWrite) prop.SetValue(terrain, true, null);
        }

        static void StitchNeighbours(Terrain[] terrains, int tilesX, int tilesZ)
        {
            for (int z = 0; z < tilesZ; z++)
            for (int x = 0; x < tilesX; x++)
            {
                Terrain left   = x > 0            ? terrains[z * tilesX + (x - 1)] : null;
                Terrain right  = x < tilesX - 1   ? terrains[z * tilesX + (x + 1)] : null;
                Terrain bottom = z > 0            ? terrains[(z - 1) * tilesX + x] : null;
                Terrain top    = z < tilesZ - 1   ? terrains[(z + 1) * tilesX + x] : null;
                terrains[z * tilesX + x].SetNeighbors(left, top, right, bottom);
            }
            Terrain.SetConnectivityDirty();
        }

        // ---------------------------------------------------------------- heights

        static void ApplyHeights(KontoWorldData data, TerrainData td, Vector2 origin)
        {
            var s = data.Settings;
            int res = td.heightmapResolution;
            float step = s.tileSize / (res - 1);
            var heights = new float[res, res];

            Parallel.For(0, res, z =>
            {
                float worldZ = origin.y + z * step;
                for (int x = 0; x < res; x++)
                {
                    float worldX = origin.x + x * step;
                    heights[z, x] = data.ToNormalisedHeight(data.SampleHeight(worldX, worldZ));
                }
            });

            td.SetHeights(0, 0, heights);
        }

        // ---------------------------------------------------------------- splatmaps

        static void PaintSplatmaps(KontoWorldData data, TerrainData td, Vector2 origin, int layerCount)
        {
            var s = data.Settings;
            int res = s.alphamapResolution;
            td.alphamapResolution = res;
            var maps = new float[res, res, layerCount];
            float step = s.tileSize / res;

            Parallel.For(0, res, z =>
            {
                var weights = new float[KontoLayer.Count];
                float worldZ = origin.y + (z + 0.5f) * step;
                for (int x = 0; x < res; x++)
                {
                    float worldX = origin.x + (x + 0.5f) * step;
                    var sample = SurfaceClassifier.Sample(data, worldX, worldZ);
                    SurfaceClassifier.Classify(s, sample, weights);
                    int n = Mathf.Min(layerCount, KontoLayer.Count);
                    for (int i = 0; i < n; i++) maps[z, x, i] = weights[i];
                }
            });

            td.SetAlphamaps(0, 0, maps);
        }

        // ---------------------------------------------------------------- ground detail

        static void PaintDetails(KontoWorldData data, TerrainData td, Vector2 origin, KontoFoliageLibrary foliage)
        {
            var s = data.Settings;
            var entries = new List<DetailEntry>();
            var protos = new List<DetailPrototype>();
            if (foliage.details == null) return;

            for (int i = 0; i < foliage.details.Length; i++)
            {
                var d = foliage.details[i];
                if (d == null || (d.billboardTexture == null && d.meshPrefab == null)) continue;

                var proto = new DetailPrototype
                {
                    minWidth = d.minWidth,
                    maxWidth = d.maxWidth,
                    minHeight = d.minHeight,
                    maxHeight = d.maxHeight,
                    noiseSpread = Mathf.Max(0.01f, d.noiseSpread * 20f),
                    healthyColor = d.healthyColor,
                    dryColor = d.dryColor,
                };

                if (d.meshPrefab != null)
                {
                    proto.prototype = d.meshPrefab;
                    proto.usePrototypeMesh = true;
                    proto.renderMode = DetailRenderMode.VertexLit;
                    proto.useInstancing = true;
                }
                else
                {
                    proto.prototypeTexture = d.billboardTexture;
                    proto.usePrototypeMesh = false;
                    proto.renderMode = DetailRenderMode.GrassBillboard;
                }

                entries.Add(d);
                protos.Add(proto);
            }

            if (protos.Count == 0) return;
            td.detailPrototypes = protos.ToArray();

            int res = td.detailResolution;
            float step = s.tileSize / res;
            int layerCount = protos.Count;

            var layers = new int[layerCount][,];
            for (int i = 0; i < layerCount; i++) layers[i] = new int[res, res];

            Parallel.For(0, res, z =>
            {
                var cover = new float[foliage.details.Length];
                float worldZ = origin.y + (z + 0.5f) * step;
                for (int x = 0; x < res; x++)
                {
                    float worldX = origin.x + (x + 0.5f) * step;
                    var sample = SurfaceClassifier.Sample(data, worldX, worldZ);
                    VegetationRules.GroundCover(s, sample, cover);

                    int written = 0;
                    for (int i = 0; i < foliage.details.Length && written < layerCount; i++)
                    {
                        var d = foliage.details[i];
                        if (d == null || (d.billboardTexture == null && d.meshPrefab == null)) continue;
                        float amount = cover[i] * s.grassDensity * d.maxDensity;
                        layers[written][z, x] = Mathf.Clamp(Mathf.RoundToInt(amount), 0, d.maxDensity);
                        written++;
                    }
                }
            });

            for (int i = 0; i < layerCount; i++) td.SetDetailLayer(0, 0, i, layers[i]);
        }

        // ---------------------------------------------------------------- trees

        static void PlantTrees(KontoWorldData data, TerrainData td, Vector2 origin, KontoFoliageLibrary foliage)
        {
            var s = data.Settings;

            // Build the prototype list, remembering which species each index came from.
            var protos = new List<TreePrototype>();
            var speciesOfPrototype = new List<int>();
            var prototypeOfSpecies = new int[foliage.trees.Length];
            for (int i = 0; i < prototypeOfSpecies.Length; i++) prototypeOfSpecies[i] = -1;

            if (foliage.trees == null) return;
            for (int i = 0; i < foliage.trees.Length; i++)
            {
                var t = foliage.trees[i];
                if (t == null || t.prefab == null) continue;
                prototypeOfSpecies[i] = protos.Count;
                speciesOfPrototype.Add(i);
                protos.Add(new TreePrototype { prefab = t.prefab, bendFactor = t.bendFactor });
            }
            if (protos.Count == 0) return;
            td.treePrototypes = protos.ToArray();

            float spacing = Mathf.Max(1.5f, s.treeSpacing);
            int cells = Mathf.Max(1, Mathf.RoundToInt(s.tileSize / spacing));
            float cellSize = s.tileSize / cells;

            var perRow = new List<TreeInstance>[cells];

            Parallel.For(0, cells, cz =>
            {
                var list = new List<TreeInstance>(cells / 2);
                for (int cx = 0; cx < cells; cx++)
                {
                    int hash = KontoNoise.Hash(s.seed + 41011, (int)(origin.x / cellSize) + cx, (int)(origin.y / cellSize) + cz);
                    float r0 = ((hash >> 4) & 0xFFFF) / 65535f;
                    float r1 = ((hash >> 12) & 0xFFFF) / 65535f;
                    float r2 = ((hash >> 20) & 0xFFF) / 4095f;

                    float worldX = origin.x + (cx + 0.15f + r0 * 0.7f) * cellSize;
                    float worldZ = origin.y + (cz + 0.15f + r1 * 0.7f) * cellSize;

                    var sample = SurfaceClassifier.Sample(data, worldX, worldZ);
                    float density = VegetationRules.CanopyDensity(s, sample) * s.treeDensity;
                    if (density <= 0.001f) continue;

                    float rowAngle;
                    bool plantation = VegetationRules.IsPlantation(s, sample, out rowAngle);

                    if (plantation)
                    {
                        // Planted forest: a rotated lattice, which is why Japanese hillsides read
                        // as corduroy from a distance instead of as random scatter.
                        AddPlantationCell(data, foliage, prototypeOfSpecies, list, origin,
                            cx * cellSize, cz * cellSize, cellSize, rowAngle, density, sample);
                    }
                    else
                    {
                        if (r2 > density) continue;
                        AddTree(data, foliage, prototypeOfSpecies, list, worldX, worldZ, origin, sample, false, r0, r1);
                    }
                }
                perRow[cz] = list;
            });

            var all = new List<TreeInstance>(1024);
            for (int i = 0; i < cells; i++) if (perRow[i] != null) all.AddRange(perRow[i]);

            if (s.maxTreesPerTile > 0 && all.Count > s.maxTreesPerTile)
            {
                // Thin evenly rather than cropping, so no part of the tile loses its forest.
                float keep = s.maxTreesPerTile / (float)all.Count;
                var thinned = new List<TreeInstance>(s.maxTreesPerTile + 16);
                float acc = 0f;
                for (int i = 0; i < all.Count; i++)
                {
                    acc += keep;
                    if (acc >= 1f) { acc -= 1f; thinned.Add(all[i]); }
                }
                all = thinned;
            }

            td.SetTreeInstances(all.ToArray(), true);
        }

        static void AddPlantationCell(KontoWorldData data, KontoFoliageLibrary foliage, int[] prototypeOfSpecies,
            List<TreeInstance> list, Vector2 origin, float localX, float localZ, float cellSize,
            float rowAngle, float density, SurfaceSample cellSample)
        {
            var s = data.Settings;
            float rowSpacing = Mathf.Max(1.2f, s.plantationRowSpacing);
            float cos = Mathf.Cos(rowAngle), sin = Mathf.Sin(rowAngle);

            // Walk the lattice in its own rotated space and keep the points that land in this cell.
            float cx = localX + cellSize * 0.5f;
            float cz = localZ + cellSize * 0.5f;
            float half = cellSize * 0.75f;
            int steps = Mathf.CeilToInt(half / rowSpacing) + 1;

            float lx = cx * cos + cz * sin;
            float lz = -cx * sin + cz * cos;
            float baseI = Mathf.Round(lx / rowSpacing);
            float baseJ = Mathf.Round(lz / rowSpacing);

            for (int j = -steps; j <= steps; j++)
            for (int i = -steps; i <= steps; i++)
            {
                float u = (baseI + i) * rowSpacing;
                float v = (baseJ + j) * rowSpacing;
                float px = u * cos - v * sin;
                float pz = u * sin + v * cos;
                if (px < localX || px >= localX + cellSize || pz < localZ || pz >= localZ + cellSize) continue;

                int hash = KontoNoise.Hash(s.seed + 42013, Mathf.RoundToInt(px * 4f), Mathf.RoundToInt(pz * 4f));
                float r0 = ((hash >> 3) & 0xFFFF) / 65535f;
                float r1 = ((hash >> 13) & 0xFFFF) / 65535f;
                // A planted stand is regular but not perfect: some trees fail, some lean.
                if (r0 > 0.86f * Mathf.Clamp01(density + 0.35f)) continue;

                float jitter = rowSpacing * 0.13f;
                float worldX = origin.x + px + (r0 - 0.5f) * jitter;
                float worldZ = origin.y + pz + (r1 - 0.5f) * jitter;

                var sample = SurfaceClassifier.Sample(data, worldX, worldZ);
                if (VegetationRules.CanopyDensity(s, sample) <= 0.001f) continue;

                AddTree(data, foliage, prototypeOfSpecies, list, worldX, worldZ, origin, sample, true, r0, r1);
            }
        }

        static void AddTree(KontoWorldData data, KontoFoliageLibrary foliage, int[] prototypeOfSpecies,
            List<TreeInstance> list, float worldX, float worldZ, Vector2 origin, in SurfaceSample sample,
            bool plantation, float r0, float r1)
        {
            var s = data.Settings;
            var species = VegetationRules.PickSpecies(s, sample, plantation, r0);
            int idx = (int)species;
            if (idx < 0 || idx >= prototypeOfSpecies.Length) return;
            int proto = prototypeOfSpecies[idx];
            if (proto < 0)
            {
                // Fall back to whatever species actually has a prefab assigned.
                for (int i = 0; i < prototypeOfSpecies.Length && proto < 0; i++) proto = prototypeOfSpecies[i];
                if (proto < 0) return;
                idx = Mathf.Clamp(idx, 0, foliage.trees.Length - 1);
            }

            var entry = foliage.trees[Mathf.Clamp(idx, 0, foliage.trees.Length - 1)];
            if (entry == null) return;
            float scale = Mathf.Lerp(entry.minScale, entry.maxScale, r1);
            // Trees are shorter and scrubbier near the tree line and on the wind hammered coast.
            float stress = Mathf.Clamp01((sample.Height - (s.treeLine - 260f)) / 260f);
            float coastStress = 1f - Mathf.Clamp01(sample.CoastDistance / 140f);
            scale *= Mathf.Lerp(1f, 0.58f, Mathf.Max(stress, coastStress * 0.8f));

            list.Add(new TreeInstance
            {
                position = new Vector3(
                    (worldX - origin.x) / s.tileSize,
                    data.ToNormalisedHeight(sample.Height),
                    (worldZ - origin.y) / s.tileSize),
                prototypeIndex = proto,
                widthScale = scale,
                heightScale = scale * entry.heightStretch,
                color = Color.white,
                lightmapColor = Color.white,
                rotation = r0 * Mathf.PI * 2f,
            });
        }
    }
}
