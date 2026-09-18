# Konto — setup guide for Unity 6 HDRP

This is the base environment for **Salary Man**: the island of Konto, a compressed replica of
Honshu, with no cities or buildings. Everything here is generated: the landform, the ground
surfacing, the vegetation, the water and the lighting.

Follow it top to bottom the first time. It takes about fifteen minutes plus build time.

---

## 1. What you need

| Requirement | Notes |
|---|---|
| Unity 6.x (6000.x), any patch including 6.6 | Also works on 2022.3 LTS with HDRP 14, with a couple of parameters skipped |
| High Definition RP package | Installed automatically by the HDRP template |
| A project created from the **3D (HDRP)** template | Or an existing project with HDRP already set up |
| ~8 GB free disk | Generated terrain data and textures |
| 16 GB RAM recommended | The generator holds the whole island as a float raster |

Do **not** start from the built-in or URP template. HDRP has to be the active pipeline before
anything below will work.

---

## 2. Install the code

1. Create the HDRP project (or open yours).
2. Copy the `Assets/SalaryMan` folder from this repository into your project's `Assets` folder.
   Keep the folder structure exactly as it is — `Scripts/Editor` must stay named `Editor`, which
   is what keeps the editor-only code out of your player build.
3. Let Unity compile. The console should be clean. If you see errors about `UnityEngine.Rendering`,
   your project is not on an SRP — go back to step 1.

There are no package dependencies to add. Every HDRP-specific call goes through reflection
(`HdrpReflection.cs`), so a renamed parameter in your HDRP version is skipped with a warning
instead of breaking compilation.

---

## 3. Project settings

**Edit → Project Settings:**

- **Player → Other Settings → Color Space:** Linear. HDRP requires it; the template already sets it.
- **Player → Other Settings → Active Input Handling:** either option works. The test controllers
  compile against whichever you pick.
- **Quality:** pick one quality level and stay on it while you are judging the look. Switching
  levels swaps the HDRP asset underneath you and changes the image.
- **Graphics → Default Render Pipeline:** must point at an HDRP Asset.

**Time → Fixed Timestep:** leave alone.

---

## 4. Configure the HDRP asset

Several features this world uses are **off by default** in the HDRP template, and a volume
override asking for a feature the pipeline has disabled simply does nothing.

Run **Tools → SalaryMan → Configure HDRP Asset**. It enables, on whichever HDRP asset is active:

- Water (for the sea and the lakes)
- Volumetric Clouds
- Volumetric Fog
- Screen Space Reflection (opaque and transparent)
- Screen Space Global Illumination
- Screen Space Ambient Occlusion
- Terrain Hole (needed later, when tunnels and cellars are cut)
- Motion Vectors, Distortion, Transparent Backface
- Shadow request budget raised to 256

Check the console: it lists what it enabled, and what did not exist on your HDRP version. Anything
in the "not present" list is safe to ignore.

If you would rather do it by hand: select your HDRP Asset, and in **Rendering** tick *Water*,
*Volumetric Clouds*, *Screen Space Reflection*, *Screen Space Global Illumination*, *Terrain Hole*.

---

## 5. Build the world

1. Open **Tools → SalaryMan → Konto World Builder**.
2. Press **Create default settings asset** if the settings field is empty. This writes
   `Assets/SalaryMan/World/Settings/KontoWorldSettings.asset` with the Honshu-derived layout.
3. Leave every step ticked and press **Build Konto**.

Expected time on a modern desktop, at default settings (8192 × 6144 m, 12 tiles, 900k droplets):

| Step | Time |
|---|---|
| Ground textures | ~20 s (first build only) |
| Stand-in vegetation | ~10 s (first build only) |
| Landform, erosion, hydrology | 2 – 5 min |
| Terrain tiles, splatmaps, grass, trees | 2 – 6 min |
| Water, sky, lighting | ~10 s |

Unity will look frozen during erosion. It is not; the progress bar updates between batches.

When it finishes you will have:

```
Konto World          12 terrain tiles, stitched
Konto Water          ocean, lakes, river ribbons
Konto Environment    sun, moon, sky/fog volume, weather, wind
Konto Viewpoint      or your Main Camera, placed to look at the island
```

and, on disk, `Assets/SalaryMan/World/Generated/` holding the terrain data, textures, terrain
layers, meshes, prefabs, materials and volume profiles.

**Save the scene now.** Generated TerrainData lives as assets, but the scene objects that
reference them do not exist until you save.

---

## 6. Look at it

- **Scene view:** press `F` with `Konto World` selected to frame the island.
- **Play mode:** the main camera has a `KontoFreeCamera`. Hold **right mouse** to look, **WASD**
  to fly, **Q/E** down and up, **shift** to sprint, **scroll** to change speed.
- **On foot:** **Tools → SalaryMan → Add Walker To Scene** drops a character controller under the
  scene view camera and parents the main camera to its eyes. This is the important one — scale,
  slope and surface detail can only be judged from 1.7 m off the ground.

Things worth flying to, in the default seed:

- **Kogane-san**, the Fuji analogue, standing clear of the range on the ocean side at about 45%
  along the island. Look for the radial gullies down the flanks.
- **The Konto Alps**, the high range through the middle third, with the sharpest crests.
- **Aokami Caldera** near the north east tip, filled to a lake.
- **The ria coast** along the first quarter of the ocean side: drowned V-shaped inlets.
- **The Kanmei Plain**, the big flat alluvial plain on the ocean side at about 60% along. This is
  where the capital will go.
- **Any valley floor at about 200–400 m** — that is where the rice terraces are cut.

---

## 7. Making it look good

The build already sets all of this. This section is what each setting is for, so you can tune it.

### Exposure and grade
The environment volume uses **Automatic** exposure, metered centre-weighted, limited to −1..16 EV,
with +0.35 EV compensation. Physical light units mean the sun is 100,000 lux at midday; if you
switch exposure to Fixed you must pick a matching value or the screen goes white or black.

Grade is deliberately restrained: Neutral tonemapping, +8 contrast, +4 saturation, a slight warm
filter, a touch of blue lifted into the shadows. Heavy ACES-style grading makes Japanese
landscapes read as American ones.

### Sky and fog
Physically Based Sky with a **dark ground tint** (0.12, 0.13, 0.10). A bright ground tint is the
single most common reason an HDRP sky looks like a product render — the sky bounces ground colour
back down onto everything.

Fog mean free path is 5200 m with a 850 m height falloff and volumetric fog on. That humid haze
stacking up between ridges is what gives a view across a mountain range its depth; without it the
far ranges look like cardboard cutouts.

### Sun
Driven by `KontoTimeOfDay` from a real solar position model at latitude 36.2° N, day 266 (late
September — clear air and long shadows). Angular diameter is 0.53°, the real value, which is what
makes shadow edges soften correctly with distance from the caster.

To sweep the light: select `Konto Environment` and drag **Time Of Day**. Golden hour on Konto is
around 05:45 and 17:30 on the default date.

### Shadows
Max shadow distance 1400 m with 4 cascades weighted toward the near field. Raising the distance
past ~2000 m costs a lot and buys little; if distant mountains look flat, that is fog and GI doing
the work, not shadows.

### Anti-aliasing
The main camera is set to **TAA, High**. On terrain with dense foliage, FXAA or no AA will crawl
badly. If you see ghosting behind the walker, lower TAA sharpening rather than turning TAA off.

### Terrain
Per tile, the builder sets: pixel error 3, basemap distance 900 m, detail distance 180 m, tree
distance 1400 m, crossfade 40 m. Lower pixel error if you see terrain silhouettes shifting as you
walk (costs CPU); raise detail distance if the grass boundary is visible (costs a lot).

### LOD bias
Set to 1.6. The default of 1.0 swaps tree LODs close enough to the camera that a forest visibly
churns as you walk through it.

---

## 8. Performance

Default settings target a mid-range desktop at 1080p. If it runs badly:

| Symptom | Fix |
|---|---|
| GPU-bound, heavy foliage | `treeSpacing` 9.5 → 14, `grassDensity` 1 → 0.6 |
| GPU-bound, everything | Turn off Screen Space GI in the HDRP asset first; it is the single most expensive thing enabled |
| CPU-bound in editor only | Terrain tiles are heavy to inspect. Collapse `Konto World` in the hierarchy |
| Slow world build | `erosionDroplets` 900k → 350k, `workingResolution` 2048 → 1024 |
| Out of memory during build | Lower `workingResolution`, or build fewer tiles |

Volumetric clouds and volumetric fog are the next two most expensive features. Both are worth
their cost here; screen space GI is the one to drop first.

---

## 9. Changing the geography

Everything lives on the `KontoWorldSettings` asset, and every landform is anchored to the island's
tectonic arc by `alongT` (0 at the north east tip, 1 at the south west tip) and `lateral`
(−1 on the sheltered Sea of Konto coast, +1 on the ocean coast). That means you can resize the
world and the geography stays coherent.

- **A different island, same character:** change `seed` and rebuild terrain only.
- **Move a range:** edit its `alongStart` / `alongEnd` / `lateralOffset`.
- **Move the volcano:** edit `Kogane-san`'s `alongT` and `lateral`.
- **Bigger world:** raise `tilesX` / `tilesZ`. Cost grows with area; 6 × 4 tiles is 12 × 8 km.
- **Finer terrain:** `heightmapResolution` 1025 → 2049 halves the metres per sample to 1 m.
  Quadruples terrain memory.
- **More dramatic mountains:** raise the Konto Alps `peakHeight` and `ridgeSharpness`, and
  `maxHeight` to match.
- **More rice terraces:** raise `terraceMaxAltitude` and `terraceStrength`, lower `terraceMinFlow`.
- **Flatter, more buildable plains:** raise each plain's `radius`, lower its `gradient`.

After editing, use **Regenerate terrain only** — it keeps your textures, lighting and any hand
tweaks to the volume profiles.

---

## 10. Swapping in real art

Nothing in the pipeline depends on the stand-in assets.

- **Ground:** open the eight `.terrainlayer` assets in `Generated/TerrainLayers` and replace the
  diffuse, normal and mask textures. Keep the layer order — splatmap weights are indexed by it:
  sand, gravel, paddy soil, meadow, forest floor, rock, scree, snow.
- **Trees:** drop your prefabs (SpeedTree works well) into the seven slots on
  `KontoFoliageLibrary`, then rebuild terrain. Species order is sugi, hinoki, konara, momiji,
  matsu, shirakaba, take. With SpeedTree assets you can also lower `treeBillboardDistance` in
  `KontoTerrainBuilder.ConfigureTerrain` to get real billboards back.
- **Grass:** replace the four `billboardTexture` entries, or assign `meshPrefab` instead to switch
  that layer to instanced mesh detail.
- **Rivers:** the river ribbons are plain meshes with an HDRP Lit transparent material. To upgrade
  them, add an HDRP `WaterSurface` with surface type *River* and geometry type *Custom*, pointing
  at the ribbon's MeshRenderer.

---

## 11. Troubleshooting

**Game view says "Display 1 No cameras rendering".**
The scene has no enabled camera tagged MainCamera. The build now finds one, adopts an untagged
camera if there is one, or creates a camera outright. To do it by hand: GameObject > Camera, set
its Tag to MainCamera, aim the scene view where you want and use GameObject > Align With View,
then add a Konto Free Camera component and raise the camera's far clip plane to 10000.

**Everything is magenta.** The terrain material did not resolve. Check Graphics settings point at
an HDRP asset, then re-run the build. Stand-in tree materials fall back to `Standard` if `HDRP/Lit`
is not found, which also means HDRP is not active.

**The sea is a flat grey plane.** HDRP Water is not enabled. Run **Configure HDRP Asset**, then
rebuild water. The console says which path it took.

**"Cascade Shadow Atlasing has failed, only one directional light can cast shadows at a time."**
Two or more directional lights in the scene have shadows on. HDRP supports exactly one. The build
now switches off any directional light that is not Konto's sun or moon — including the one the
HDRP template scene ships with — and says so in the console. If you added one yourself, set its
**Shadows** to **No Shadows**, or delete it. The moon does not cast shadows by default, and the
sun and moon are never enabled at the same time; if you turn on `moonCastsShadows` on
`KontoTimeOfDay`, the handover at dusk still keeps exactly one of them active.

Note that a leftover template sun also means *double daylight*, so it is worth clearing even
beyond the warning.

**The screen is white or black.** Auto exposure has not converged, or you changed exposure to
Fixed. Select the `Sky and Fog Volume`, find Exposure, and confirm the mode is Automatic.

**Seams between terrain tiles.** Should not happen — tiles sample the same continuous world
function and are stitched with `SetNeighbors`. If you see one, check every tile has the same
`heightmapResolution` and that you did not move a tile in the hierarchy.

**No trees.** The foliage library has no prefabs assigned. Re-run the build with *Generate
stand-in trees* ticked, or assign your own.

**NullReferenceException inside `VolumeProfile.Add`.**
A volume component name resolved to a class HDRP keeps around but cannot instantiate, usually a
renamed or legacy one. The reflection layer now checks that a type is a concrete `VolumeComponent`
before handing it over, takes the first usable name from a list of alternatives, and logs and
skips anything it cannot add. If you see "No usable volume component found for: X", that feature
is simply off on your HDRP version and the rest of the lighting is unaffected.

**Warnings like "Fog has no parameter 'enableVolumetric'".** Expected. That is the reflection layer
probing for parameter names across HDRP versions. It set the one that exists on yours.

**The build takes forever.** See the performance table above. Erosion is the slow step and it
scales with `workingResolution` squared.

---

## 12. What comes next

The generator keeps the data the city pass will need, on `KontoWorldData`:

- `Height`, `Slope` — where building is feasible
- `Water.Flow`, `Water.Rivers`, `Water.Lakes` — where bridges and ports go
- `Land.CoastDistance`, `Land.ArcT`, `Land.ArcLateral` — coastal versus inland, and which coast
- `TerraceMask` — worked farmland that towns should grow out of, not onto

The obvious next steps are a road network following the valley floors and the coast, then
settlements seeded on the alluvial plains, which is exactly where every Japanese city actually is.
