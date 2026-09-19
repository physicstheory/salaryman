# Salary Man — Konto world base

The base environment for **Salary Man**: an open world set on **Konto**, a fictionalised island
modelled on Honshu. This repository is the landscape layer only — no cities, no buildings, no
roads. Those sit on top of what this generates.

Built for **Unity 6 (6000.x) HDRP**. Setup and tuning: **[Docs/UNITY_HDRP_SETUP.md](Docs/UNITY_HDRP_SETUP.md)**.

---

## What it generates

An island arc laid out the way Honshu actually is, then taken apart by simulated weather:

- **A tectonic arc** with a long north east limb, a bend at the central rift and a south west
  limb. Every landform is anchored to this arc, so the geography holds together at any world size.
- **Mountain ranges** along the arc: a long moderate backbone (Ōu), a high sharp alpine range
  through the centre (the Japanese Alps), a worn rounded range in the south west (Chūgoku), and
  low dissected coastal hills — the satoyama belt that covers most of rural Japan.
- **A volcanic front**: isolated stratovolcano cones with concave flanks, summit craters and
  radial erosion gullies, plus a collapsed caldera that fills to a lake.
- **Intermontane basins** — flat floors ringed by steep walls, like Kōfu and Nagano.
- **Coastal alluvial plains** at about 1:300 gradient, where the cities will go.
- **Two completely different coasts**: a drowned ria coast of deep V-shaped inlets on the ocean
  side, long smooth sandy arcs and dune ridges on the sheltered side.
- **Hydraulic and thermal erosion** — 900,000 rain droplets carving the dense, finely branched
  valley networks that heavy rain on steep young rock produces, then gravity settling the slopes
  to their angle of repose.
- **A full drainage system**: depressions filled, flow routed, channels carved with width set by
  discharge, flood plains flattened along the valley floors, lakes found and filled, and rivers
  traced from the mountains to the sea as water-carrying ribbons.
- **Rice terraces** cut into gentle low ground near valley floors, in hamlet-sized patches.
- **Surfacing by rule**: eight ground layers assigned from height, slope, discharge, aspect and
  distance from the coast — including more snow on the Sea of Konto side, because the north west
  coast of Honshu is one of the snowiest inhabited places on earth.
- **Vegetation zoned like the real thing**: pine holding the dune coast, bamboo and maple on damp
  valley floors, ruler-straight sugi plantations blanketing the lower slopes, oak above them,
  birch thinning toward the tree line, then scree and snow.
- **HDRP environment**: physically based sky, height and volumetric fog, volumetric clouds, a sun
  driven from real solar geometry at 36.2° N, six weather states that crossfade, and a restrained
  grade.

Everything is deterministic from one seed.

---

## Quick start

1. Create a Unity 6 project from the **3D (HDRP)** template.
2. Copy `Assets/SalaryMan` into the project.
3. **Tools → SalaryMan → Configure HDRP Asset**.
4. **Tools → SalaryMan → Konto World Builder** → **Build Konto**.
5. Save the scene. Press play; right mouse to look, WASD to fly.

Full instructions, including what every look-related setting is for: **[Docs/UNITY_HDRP_SETUP.md](Docs/UNITY_HDRP_SETUP.md)**.

---

## Layout

```
Assets/SalaryMan/World/Scripts/
  Runtime/Generation/
    KontoNoise.cs             gradient, ridged, billow, cellular and tileable noise
    Field2D.cs                float raster with bicubic sampling, blur and resampling
    KontoWorldSettings.cs     every parameter, plus the Honshu-derived default layout
    IslandArc.cs              the tectonic arc everything is anchored to
    LandmassBuilder.cs        coastline, ranges, volcanoes, basins, plains
    ErosionPasses.cs          thermal (repose angle) and hydraulic (droplet) erosion
    HydrologyPass.cs          depression filling, flow routing, channels, lakes, river paths
    KontoWorldGenerator.cs    runs the whole pipeline in order
    KontoWorldData.cs         the finished world, sampled continuously in world space
    SurfaceClassifier.cs      which ground layer goes where
    VegetationRules.cs        which species grows where
    KontoFoliageLibrary.cs    art slots for trees and ground detail
    KontoTerrainBuilder.cs    terrain tiles, splatmaps, grass, trees, stitching
  Runtime/Environment/
    HdrpReflection.cs         version-tolerant access to HDRP
    KontoTimeOfDay.cs         real solar position, sun and moon
    KontoWeather.cs           six weather states, crossfaded
  Runtime/Player/
    KontoInput.cs             keyboard, mouse and Xbox pad, either input backend
    KontoCharacter.cs         third person character movement, drives the animator
    KontoThirdPersonCamera.cs orbit camera with collision and a first person toggle
    KontoFreeCamera.cs        fly camera for surveying
    KontoWalker.cs            first person tester, no model needed
  Editor/
    KontoWorldBuilderWindow.cs  the build window and menu items
    KontoWorldBuilder.cs        build orchestration and asset saving
    KontoTextureFactory.cs      procedural tiling ground textures and terrain layers
    KontoFoliageFactory.cs      stand-in trees, grass billboards, materials
    KontoMeshBuilder.cs         procedural mesh primitives
    KontoEnvironmentFactory.cs  sky, fog, clouds, lighting, grade, weather profiles
    KontoWaterFactory.cs        ocean and lakes
    KontoRiverBuilder.cs        river ribbon meshes
    KontoHdrpAssetConfigurator.cs  switches on the HDRP features this world needs
    KontoCharacterWindow.cs     drops a model in as a playable character
    KontoCharacterFactory.cs    builds the rig: capsule, movement, camera, layers
    KontoProjectSettingsUtil.cs creates layers, installs gamepad axes
    KontoSceneUtil.cs           makes sure the scene has a usable camera
```

Character setup, Blender export settings and the full control map:
**[Docs/CHARACTER_AND_CONTROLLER.md](Docs/CHARACTER_AND_CONTROLLER.md)**.

---

## Notes

- **Scale.** Konto is a compressed Honshu: about 8 × 6 km by default against Honshu's 1300 km, with
  peaks near 1450 m. Slopes are therefore steeper than the real thing. That is deliberate — at true
  scale a 1:80 Fuji would be 47 m high and read as a hill.
- **HDRP versions.** Every HDRP-specific call goes through reflection, so a parameter renamed
  between HDRP versions logs a warning instead of failing to compile.
- **The stand-in art is stand-in art.** The procedural textures and low-poly trees exist so the
  landscape can be judged before any art is made. Swapping them out changes nothing else.
