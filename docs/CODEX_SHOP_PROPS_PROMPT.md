# Prompt for ChatGPT / Codex: finish the AAA shop props in Salary Man

Copy everything below the line into Codex.

---

You are working in the repo `physicstheory/salaryman`, branch `claude/friendly-cannon-alnk4v`. Read `AGENTS.md` first and follow it. Every push must pass `python3 Tools/qa/aaa_gate.py`.

## What already exists (do not undo it)

- `Web/art/shop-aaa.js` (global `ShopAAA`) finishes every shop room built by `interiorRoom()` in `Web/konto.html`: scanned PBR materials on every surface, an indoor light probe, a warm ceiling light rig, and no sun or night exposure indoors. Do not reintroduce `MeshBasicMaterial` colour boxes in shops, and do not call `SalaryArt.coat()` on shop rooms.
- Shop decor is placed by `interiorProps()` from the `IN_PROP` kinds in `IN_PROP_SETS`. Before building a kind, it calls `ShopAAA.propFor(kind)`. Kinds listed in `SWAP` in `shop-aaa.js` become scanned GLB props from `Web/props/`. Kinds in `DROP` are currently left out because nothing realistic exists for them yet.
- The AAA gate's "Shop interiors" check fails the push if any `IN_PROP` kind is neither in `SWAP`, nor in `DROP`, nor in `rules.json` `shops.kept_kinds`.

## Your job: make real 3D models for the dropped shop props and the remaining box-built fixtures

Make each one a game-ready GLB, built in Meshy or Tripo (or Blender), and add it to `Web/props/` with an entry in `Web/props/index.json` (file, size in metres [x,y,z], tris). Each model needs:

- real-world scale in metres, standing on y = 0, centred on x/z, facing +z
- full PBR: base colour, normal, and roughness/metalness (ORM) maps, at least 1024 px, no baked lighting, no `KHR_materials_unlit`
- 2k to 15k triangles (a hero prop such as the drinks fridge can go to 25k)
- an original design with no real brand logos. Use the game's fictional brands: KONTO, 11 ELEVEN, SOTI, PEAR, PLAYBOX, KOMOREBI PRESS

Models to make (id → what it is):

1. `shop_basket_stack`: a stack of 6 red plastic Japanese convenience-store shopping baskets, 0.45 × 0.6 × 0.32 m
2. `spinner_rack`: a rotating wire spinner rack of postcards and paperbacks, 0.6 m wide, 1.7 m tall
3. `clothes_rounder`: a round chrome clothes rail with about 20 hanging shirts and jackets in muted real fabric colours, 1.1 m across, 1.5 m tall
4. `umbrella_stand`: a steel umbrella stand holding 7 clear vinyl and black umbrellas, 0.3 m across
5. `maneki_neko`: a ceramic beckoning cat on a small wooden stand, 0.5 m tall, glossy glaze
6. `dog_bed`: a fabric pet bed with a cushion, 0.9 × 0.25 × 0.7 m
7. `step_ladder`: an aluminium shop step ladder, 2.0 m
8. `cable_reel`: a wooden cable drum with black cable, 0.8 m across
9. `paint_tins`: a group of 5 metal paint tins with printed labels
10. `toolbox`: a red steel cantilever toolbox
11. `pet_food_bags`: a stack of 8 printed kibble bags
12. `mannequin_suit`: a matte white retail mannequin wearing a navy suit, 1.85 m (make two more: `mannequin_casual` and `mannequin_coat`)
13. `drinks_fridge`: a 3-door glass convenience-store drinks fridge, full of cans and PET bottles, with interior LED light, 2.0 × 2.0 × 0.8 m
14. `atm_kiosk`: a Japanese bank ATM, 0.6 × 1.6 × 0.6 m
15. `magazine_rack`: a wooden magazine rack holding 32 magazines with printed covers, 1.3 × 1.6 × 0.5 m
16. Product packs to replace the box-built stock in `inItemMesh()`: `can_drink`, `pet_bottle`, `onigiri`, `bento`, `snack_bag`, `pill_box`, `phone_boxed`, `console_boxed`, `game_case`, `headphones`, `folded_shirt`. Make them small and low-poly (under 2k triangles each), real size, with printed labels.

## Wiring

- For items 1–11 and 15, add each kind to `SWAP` in `Web/art/shop-aaa.js`, for example `basket: [{ id: 'shop_basket_stack', h: 0.6 }]`, and remove it from `DROP`. `placeSwap()` puts the model in the spot the old box prop had and keeps its collider.
- For 12–14, replace the `inMannequin`, eleven fridge and ATM `inAdd` boxes in `interiorDecor()` (the `brand === "clothes"` and `brand === "eleven"` branches) with `propPut(root, id, x, 0, z, ry, { h })` at the same places. Keep their `room.colliders` entries.
- For 16, in `inItemMesh()` load the pack with `propLoad(id, tpl => g.add(tpl.clone(true)))` and keep the existing invisible-until-focused `glow` shell and the `top` height, so the shopping and focus code keeps working.

## Before pushing

1. Merge `claude/friendly-cannon-alnk4v` into your branch first.
2. Run `python3 Tools/qa/aaa_gate.py`. It must say **PASS**. Never add to `Tools/qa/baseline.json`, never loosen `Tools/qa/rules.json`, and never use `--no-verify`.
3. Check in the game that each shop at 23:00 has no flat colour blocks: in the console, `ShopAAA.audit(interior.room.group)` must return `[]`.
