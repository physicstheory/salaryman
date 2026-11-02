# The AAA gate

Every push to the Salary Man repo has to pass the AAA gate first. That goes for Claude, ChatGPT/Codex and anyone else, on every branch. It's the final quality check before a push: PBR textures, realistic characters, buildings, cars, street detail and whether the world feels lived in. It finishes in about 1 second when the texture cache is warm and under 10 seconds from cold. The hard limit is 60 seconds.

## Run it

```sh
sh Tools/qa/install-hook.sh            # once per clone: turns on the pre-push hook, installs Pillow + numpy
python3 Tools/qa/aaa_gate.py           # run it by hand at any time
python3 Tools/qa/aaa_gate.py --all     # also list every known-debt item and every piece of advice
python3 Tools/qa/aaa_gate.py --only characters,cars
```

Running `npm install` in `Game/` also turns the hook on.

The gate runs in three places:

1. **The pre-push hook** (`.githooks/pre-push`) runs it on your working tree before git sends anything.
2. **CI** (`.github/workflows/aaa-gate.yml`) runs it on every push and pull request, on every branch.
3. **The build** (`.github/workflows/game.yml`) won't build or release the game unless the gate passes.

## When it fails

The gate prints a numbered list. Each item says where the problem is, what's wrong and how to fix it. **Do every item, run the gate again, and push once it says PASS.**

Never get around it. All of these are forbidden:

- `git push --no-verify`, or deleting or disabling the hook or the workflow.
- Lowering a number in `Tools/qa/rules.json`, or removing a rule or a list entry. CI and the hook compare the file with the version you're pushing over and block the push.
- Adding entries to `Tools/qa/baseline.json`. That file is the debt that existed when the gate was installed. It can only shrink, and CI blocks any new entry.
- Adding `// aaa-ok:` waivers to dodge texturing. A waiver is only for something that really is a flat colour, such as an indicator LED, a UI marker or a debug gizmo, and it needs a real reason after the colon.
- Hiding geometry behind a variable so the scanner can't see it. Reviews look for this.

Only Duncan can loosen the gate. If he does, the commit message carries `[aaa-loosen-approved]`.

## What it checks

| Category | Checks | Typical fix |
|---|---|---|
| **PBR textures** | Every material in `Web/props`, `Web/people/real` and `Web/cars` has base colour, normal and roughness/ORM maps of at least 512 px (1024 px for characters). Normal maps are real tangent-space maps, not flat ones. No unlit or MToon/toon shaders. Each texture library (`Web/art/terrain`, `interior`, `road`, `surfaces`) has `_nor` and `_rough`/`_arm` maps for every albedo. **Code scan:** any `new THREE.Mesh{Lambert,Phong,Standard,Physical}Material({...})` in `Web/konto.html`, `Web/game`, `Web/art` or `Engine/src` with a colour but no `map`, which means bare primitives. | Generate a tileable PBR set (ChatGPT image, Poly Haven, ambientCG), save it next to the others as `name.jpg`, `name_nor.jpg` and `name_rough.jpg`, and give the material `map`, `normalMap` and `roughnessMap` with `repeat` set to world scale. Or swap the primitive for a textured `.glb`. |
| **Realistic characters** | The game loads `people/real` by default. There are at least 20 distinct people. Each model is rigged with 50+ bones and has 5k+ triangles (advice below 15k for the crowd and 25k for Seiko). It has **no anime/VRoid traces** (`J_Bip_`, MToon, `_SKIN`, FaceMouth...). It has **realistic proportions** (hips at most 63% of head-bone height, while anime models sit around 66-70%). The face texture is **photographic** (at least 300 colours and at most 60% flat fill, where cel-shaded faces score around 260 colours and 66-95% flat). | Use photoreal humans: a Rocketbox base, or Meshy/Tripo generated from a *photo-real* portrait reference, rigged with Mixamo. Then run `Tools/characters/build_real_people.py` to add the ORM and skin-mask maps, and list the model in `Web/people/real/index.json`. |
| **Cars** | At least 12 models. Each has 8k+ triangles (advice below 20k), a transparent glass material, a body material named `paint` (traffic recolours it) and separate light materials. Traffic still loads the `.glb` models. | Use a detailed CC0/CC-BY car, rename its body material to `paint` and split out the lights. |
| **Buildings** | In every Shigoto level: at least 5 facade styles, varied heights (standard deviation of 2+ floors), and at least 40% of shops with a sign. Facade sets in `Web/art/facades` have colour, normal and roughness maps. The interior-mapped window shader is still there. No low-poly toy kits (`Web/kenney/city`). | Edit `Web/levels/<lvl>/src/*.json`, then run `node Engine/tools/bake-level.mjs <lvl>`. Add `_rough.jpg` maps for the facades. |
| **Street detail** | Every street cell of a level has 25+ props. Each level has 12+ prop types, and at least 4 of each of: vending machine, bicycle, lamp, pole, bin, aircon unit (`ac`), planter, signpost, bench and bollard. The engine's procedural props have textured materials. | Dress the pavements in the level source and re-bake. Texture the engine prop materials, or register `.glb` props. |
| **Lived-in world** | At least 20 pedestrians on high settings, density-based traffic, rain and wet streets, lit windows, signs and neon, power lines, vending machines, bicycles, rubbish bags, laundry and futons, aircon units, umbrellas, steam and birds. | Add whatever is missing as level props, as procedural dressing in `konto.html`, or as engine props. |
| **Shop interiors** | `konto.html` loads `art/shop-aaa.js` and keeps its hooks (`ShopAAA.finish`, `enter`, `leave`, `inside`, `propFor`), so every shop room gets PBR materials and the indoor light. Every shop decor kind in `IN_PROP_SETS` either has a scanned stand-in (`SWAP` in `shop-aaa.js`), is left out (`DROP`), or is one of `rules.json` `shops.kept_kinds` (things that are boxes in life: cartons, pallets, printed boards). | Make the prop as a PBR `.glb` in `Web/props/` and map it in `SWAP`. Brief: `docs/CODEX_SHOP_PROPS_PROMPT.md`. In the game, `ShopAAA.audit(interior.room.group)` must return `[]`. |

**Known debt.** On install (2026-11-02) the gate recorded what was already below the bar in `Tools/qa/baseline.json`: 234 items. Those items don't block pushes. Anything new does. Run `--all` to see the debt list. That list is the AAA to-do list, and fixing items from it is always good work. Once you've fixed some, run `python3 Tools/qa/aaa_gate.py --ratchet` and commit `baseline.json` so they can't come back.

**Advice** lines never block. They point at what would take an asset from good to AAA, for example a denser crowd mesh or a 2048 px face texture.

## Limits

The checks read files: models, textures, level data and code. They don't render the game, because a headless render takes minutes, not seconds. "Looks photographic" is measured from the textures and proportions, which cleanly separates the Rocketbox cast from the anime VRoid cast. For a visual check, use the character viewer (`Web/engine/characters.html`) or the screenshot tools in `Game/tools`.

## Changing the gate

The checks live in `Tools/qa/checks.py` and the thresholds in `Tools/qa/rules.json`. Raising a threshold or adding a check is always welcome. If a probe stops matching after a refactor (it says "could not find..."), update the probe in `checks.py`. Don't delete it.
