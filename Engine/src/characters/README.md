# Shigoto Characters

The engine's character layer: it makes any rigged person look hyper-realistic under the game's lights. It needs only `THREE`, so the
game uses it as soon as `engine/shigoto.js` has loaded, before the rest of the engine starts.

```js
const chars = SHIGOTO.characters(THREE, { quality: "high" });   // one shared instance
SHIGOTO.bipedNames(gltf.scene);       // Mixamo / Meshy / Tripo / VRM bone names -> Bip01_* (what the game retargets onto)
chars.upgrade(gltf.scene, { hero: true, model: "seiko" });
chars.setWet(0.7);                    // the game hook feeds this from the weather
chars.report();                       // materials by kind, maps synthesised, anything still missing a map
```

## What it does

| Part | File | What |
|---|---|---|
| PBR material | `Characters.js` | Every material becomes a `MeshStandardMaterial` with four maps: albedo, normal, roughness, ambient occlusion (glTF ORM layout; blue = skin mask). Lights, shadows, reflections, fog and the post chain work unchanged. |
| Skin | `CharacterShader.js` | Replaces three's per-light `RE_Direct`, so every light (shadowed) goes through it: per-channel wrapped diffuse (red scatters furthest; wider where the surface curves), transmission through ears, nose and fingers, two-lobe specular, tiling pore normals that fade with distance. |
| Cloth | `CharacterShader.js` | Charlie sheen lobe on rough non-skin texels: fibres catch grazing light. |
| Hair | `CharacterShader.js` | Kajiya-Kay two-lobe anisotropic highlight along the cards' strands; cut-out cards (alpha-to-coverage when MSAA is on). |
| Wetness | `CharacterShader.js` | Rain darkens cloth, glosses hair and skin. |
| Subdivision | `Subdivide.js` | One level of PN-triangle (curved) subdivision for skinned meshes; seams stay closed, weights merged. Hero characters on high, everyone on ultra. |
| Map synthesis | `MapSynth.js` | A model with only a colour map (typical Tripo/Meshy/low-poly) gets normal, roughness, occlusion and a skin mask worked out from it. |

Quality tiers (`CHAR_QUALITY`): low = PBR + skin/cloth/hair shading only; medium adds pores and map synthesis; high adds subdivision
for hero characters (Seiko); ultra subdivides everyone.

## The cast

`Web/people/real` is built by `Tools/characters/build_real_people.py` from Microsoft's Rocketbox avatar library (MIT; see
`Web/people/real/LICENSE-Rocketbox.md`). Rocketbox ships colour, normal and specular maps for every avatar; the script turns the
specular map into roughness, integrates an occlusion map from the normal map, and paints a skin mask matched to each person's own
face colour, all packed into one ORM texture per material.

Try any of them in the viewer: serve the repo root and open `Web/engine/characters.html?model=salaryman_04&light=sun&close`.

## Adding a model from Meshy, Tripo, Mixamo or a CC0 pack

1. Export a rigged, T- or A-posed **glTF/GLB** (humanoid / Mixamo skeleton). Licence must allow use in a shipped game (CC0, MIT,
   CC-BY with credit, or the tool's paid-plan commercial licence); record it next to the file.
2. Drop it in `Web/people/real/` and add an entry to `index.json` (`file`, `name`, `female`, `business`).
3. Bone names are converted on load; missing roughness/normal/AO maps are synthesised; the console's `shigoto.characters()` lists
   anything that was missing so it can be authored properly later.
