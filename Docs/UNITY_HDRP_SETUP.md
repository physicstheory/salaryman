# Konto — setup guide for Unity 6 HDRP

This is the world of **Salary Man**: the island of Konto, a compressed replica of Honshu, and its
capital on it. Everything here is generated — the landform, the ground surfacing, the vegetation,
the water, the lighting, the city's wards, streets, railways and plots, the three thousand
buildings standing on those plots, the street furniture between them, and the character who walks
around it. Nothing has to be modelled, bought or downloaded.

Follow it top to bottom the first time. It is about ten minutes of clicking plus build time.

If you only read one thing: **make an HDRP project, copy `Assets/SalaryMan` into it, and press
Tools → SalaryMan → Build Konto (all steps)**. The rest of this is detail and troubleshooting.

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

   Under the **city** step there are four sub-options:

   - *Buildings, street furniture and their materials* — on. This is what puts the city up.
   - *Repaint the facade and roof textures* — off. The textures are painted once and cached to
     disk; tick this only after you change a painter in `FacadeTextures`.
   - *Traffic and a crowd on the pavements* — on. Bakes the vehicle and pedestrian bodies and
     drops the two spawners into the scene. It adds seconds, not minutes.
   - *Grey massing blockout instead of buildings* — off. Grey boxes, for judging the plan without
     waiting for the buildings.

   The **character** step imports `Assets/SalaryMan/Characters/Seiko.fbx`, sets its import up,
   builds a Speed blend tree from its Idle / Walk / Run clips, and puts him in the scene.

Expected time on a modern desktop, at default settings (12288 × 10240 m, 30 tiles, 1.1M droplets):

| Step | Time |
|---|---|
| Ground textures | ~25 s (first build only) |
| Stand-in vegetation | ~10 s (first build only) |
| Landform, erosion, hydrology | 3 – 8 min |
| Cities: planning and grading | 30 s – 2 min |
| City surfaces: painting 28 PBR sets at 1024² | ~60 s (first build only) |
| Buildings and street furniture | 30 s – 2 min |
| Traffic and crowd bodies | ~5 s |
| Terrain tiles, splatmaps, grass, trees | 5 – 15 min |
| Water, sky, lighting | ~10 s |

It is a big island. If that is too long while you are iterating on the look, drop
`workingResolution` to 1280 and `erosionDroplets` to 300k: the geography stays the same, the
valleys are just coarser.

Unity will look frozen during erosion. It is not; the progress bar updates between batches.

When it finishes you will have:

```
Konto World          30 terrain tiles, stitched
Konto Water          ocean, lakes, river ribbons
Konto Cities         Tokonto and Mizuho, each with:
                       Wards            ward anchors
                       Reserved sites   markers on the named plots
                       Water            moat
                       Buildings        one mesh per ward, ~3000 buildings
                       Street furniture kerbs, lamps, signals, poles and wires
                       Soti Tower       the one modelled building
                       Traffic and crowd
                                        the two spawners: cars on the lanes, people
                                        on the footways, both pooled around you
Konto Environment    sun, moon, sky/fog volume, weather, wind
Salaryman Player     Seiko Shigu, rigged, on a Speed blend tree
Main Camera          over his shoulder
```

and, on disk, `Assets/SalaryMan/World/Generated/` holding the terrain data, textures, terrain
layers, meshes, prefabs, materials and volume profiles, plus
`Assets/SalaryMan/World/Settings/KontoCityLayout_TKT.asset` — the city plan, which is what you
address plots through later.

**Save the scene now.** Generated TerrainData lives as assets, but the scene objects that
reference them do not exist until you save.

---

## 6. Look at it

- **Scene view:** press `F` with `Konto World` selected to frame the island.
- **Play mode:** the main camera has a `KontoFreeCamera`. Hold **right mouse** to look, **WASD**
  to fly, **Q/E** down and up, **shift** to sprint, **scroll** to change speed.
- **On foot as Seiko:** the build already put him in. Press play and walk. If you want him
  somewhere else, move `Salaryman Player` and press play again, or re-run
  **Tools → SalaryMan → Put Seiko In The Scene** with the scene view where you want him.
- **On foot with no model:** **Tools → SalaryMan → Add Walker To Scene** drops a bare character
  controller and parents the main camera to its eyes. Scale, slope and surface detail can only be
  judged from 1.7 m off the ground, and this is the fastest way to get there.

Things worth flying to, in the default seed:

- **Kogane-san**, the Fuji analogue, standing clear of the range on the ocean side at about 45%
  along the island. Look for the radial gullies down the flanks.
- **The Konto Alps**, the high range through the middle third, with the sharpest crests.
- **Aokami Caldera** near the north east tip, filled to a lake.
- **The ria coast** along the first quarter of the ocean side: drowned V-shaped inlets.
- **Tokonto**, on the Kanmei Plain at about 65% along the ocean side: the graded platform, the bay,
  the reclaimed islands, the moated palace park and the expressway viaduct. Fly it at 300 m first,
  then walk a street.
- **Mizuho**, in a mountain basin on the snowy side at about 48% along — the village the story
  starts in, four kilometres from the capital over the range.
- **Any valley floor at about 200–400 m** — that is where the rice terraces are cut.

And in the city, on foot:

- **A retail ward** — the shopping streets are a run of narrow buildings sharing party walls, with
  shopfronts, sign bands and box signs, and poles with the wiring strung over the road.
- **Soti Tower's plaza** — look up. 592 m, Ping An's form.
- **Any roof you can get above** — the plant on the roofs is most of what a Japanese skyline is,
  and it is the thing that most repays flying at 80 m rather than 800.

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
| Slow world build | `erosionDroplets` 1.1M → 350k, `workingResolution` 2560 → 1280 |
| Slow city build | `urbanCellSize` 2 → 3 (a street is 8 m wide, so do not go past 3) |
| Out of memory during build | Lower `workingResolution`, or build fewer tiles |
| GPU-bound looking at the city | The facades run pixel displacement. Drop `_PPDMaxSamples` on the `Konto_Surf_*` materials from 15 to 8, or set `_DisplacementMode` to 0 to turn it off entirely |
| VRAM tight | `KontoSurfaceLibrary.DefaultSize` 1024 → 512, then repaint the surfaces |
| City costs too much geometry | It is ~1.5M triangles and has no LODs yet. The cheapest win is turning off roof clutter in `BuildingLibrary.StyleFor` |

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
- **More rice terraces:** raise `terraceMaxAltitude` and `terraceStrength`, lower `terraceMinCatchmentKm2`.
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

**The buildings are grey boxes.** The *Grey massing blockout* option is ticked, or *Buildings,
street furniture and their materials* is not. Both live under the city step in the build window,
along with *Traffic and a crowd on the pavements*.

**The buildings are magenta.** The surface materials did not resolve to `HDRP/Lit`, which means
HDRP is not the active pipeline. Fix Graphics settings, then
**Tools → SalaryMan → Repaint the city surfaces**.

**The windows look painted on.** Pixel displacement is what gives them depth, and it needs
`_DisplacementMode` on HDRP Lit. If your HDRP version does not have it the setup skips it
silently and the facades fall back to normal mapping — still fine at a distance, flat up close.
Check a `Konto_Surf_Precast` material has a Height Map assigned and Displacement Mode set to
*Pixel displacement*.

**I changed a facade painter and nothing happened.** Textures are cached on disk. Tick *Repaint
the facade and roof textures*, or run **Tools → SalaryMan → Repaint the city surfaces**.

**"Seiko.fbx is not in the project".** The character was not committed with your copy, or you
copied only part of `Assets/SalaryMan`. Re-export it with
`blender -b <meshy>.blend -P Tools/rig_seiko.py`, or drop your own model in and use
**Tools → SalaryMan → Konto Character**.

**I updated the scripts and nothing in my scene changed.** Nothing in a built scene is generated
at play time: the city is meshes and GameObjects that the last build made, and replacing the
scripts does not reach back into them. To pick up a change, rebuild the part that owns it —
**Rebuild the city only** for buildings and street furniture, **Add The Traffic And The Crowd**
for the cars and the pedestrians (seconds, and it does not touch the buildings), **Put Seiko In
The Scene** for the character, and a full **Build Konto** for anything to do with the terrain,
which includes the trees.

**There is no traffic.** Run **Tools → SalaryMan → Check The Traffic**. It says which of the
several possible reasons it is — most often that the scene was built before the traffic existed,
which **Add The Traffic And The Crowd** fixes in seconds. Both systems spawn around the camera
during play, so the editor view is always empty; and standing in the middle of a plaza more than
210 m from any street will also show you nothing, which the check reports as a distance.

**Seiko slides along the ground without moving his legs.** Run **Tools → SalaryMan → Check
Seiko's Rig**: it prints the clips inside the FBX, the avatar, where the Animator ended up, what
the blend tree is blending and whether the character is wired to it. Whichever line says NONE is
the fault. Then re-run **Put Seiko In The Scene**, which sets all of them. The usual causes are a
missing Avatar (a generic rig plays nothing without one), an Animator on the capsule rather than
on the model, or clips that did not import as separate takes — in which case the Animation tab on
`Seiko.fbx` will not list Idle, Walk and Run, and the FBX needs re-exporting with
`bake_anim_use_all_actions`.

---

## 12. What comes next

What is missing, in the order it would be worth doing:

- **LODs.** The city is ~1.5M triangles with none. A two step LOD that drops roof clutter and
  street furniture past 150 m is the single biggest performance win available.
- **A road ribbon.** Carriageways are painted onto the terrain and the kerbs are geometry, but
  markings, crossings, manholes and drains want a real mesh strip along each road.
- **Trains.** The road traffic and the crowd are in (see
  [TRAFFIC_AND_CROWD.md](TRAFFIC_AND_CROWD.md)); the rail network is polylines with widths and
  classes in exactly the same way, and nothing runs on it yet.
- **Turns at junctions.** Cars drive a road end to end and are recycled. They stop at the lights
  correctly, but none of them turns left or right, so traffic never redistributes itself.
- **Interiors.** Buildings are shells. The first one that needs an inside is Soti Tower's lobby,
  because that is where the story starts.
- **Night.** `KontoTimeOfDay` already moves the sun. Lit windows, lit signage and the lamp columns
  actually emitting are what make a Japanese city at night, and the materials already carry the
  masks to drive them.

The data the generator keeps on `KontoWorldData` — `Height`, `Slope`, `Water.Flow`,
`Land.CoastDistance`, `Land.ArcT`, `TerraceMask` — is what any of that would be built on.
