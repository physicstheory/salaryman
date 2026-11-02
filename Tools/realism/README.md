# Realistic game assets

The shipped GLBs and images are local. No generation service, login or internet connection is required at runtime.

- `fetch_world.py --cache /tmp/salaryman-realism`: curl plus Pillow 12.3 (same pinned authoring environment as `Tools/anime/requirements.txt`). Builds four CC0 material sets at 2K / 512px and six photo-room slots from four Poly Haven interior panoramas. Sources, license links, sizes and hashes travel in `Web/art/realism/sources.json`.
- `build_cast.py`: Blender 4.3.2, MPFB 2.0.18 source commit `6ff1eb358f6c1959ced77e79e6dd2406d9a71f49`, and the official CC0 MakeHuman system asset pack. Run Blender headlessly with the arguments in the script docstring. Export to a staging directory, validate there, then install the 30 matching files and refresh manifest hashes. The base shape-key mix must be baked before export; otherwise clothes/eyes/hair fit a different face. `finish_glb.py` preserves depth-writing alpha cards and deterministic wardrobe color factors.
- `build_car_lods.py`: Blender 4.3.2, using the licensed original GLBs already in `Web/cars`. Generates `Web/cars/low` at a 40K triangle target and maximum 1K texture edge. Original attribution is retained in `Web/cars/CREDITS.md`; the low directory contains a copy for authoring review. Staging excludes non-license Markdown, so the license summary in `Web/cars/low/LICENSE.txt` also accompanies the build.

Characters use natural proportions and photographed skin/clothing maps; they are MakeHuman game assets, not a claim of scanned AAA digital humans. The game retains its Biped animation names, correcting the original motion template into the same forward coordinate frame before retargeting. Low/Medium character texture uploads are capped at 512/1024px, while High/Ultra retain up to 2K. Clothing covers the exported adults; helper and hidden body geometry is excluded by the export masks.

Tests use `PLAYWRIGHT=/path/to/playwright CHROME=/usr/bin/chromium` and the focused scripts in `Game/tools`: `realism-cast-test.cjs`, `vehicle-test.cjs`, `retail-test.cjs`, `readiness-test.cjs`. Screenshots are opt-in with `SCREENSHOTS=1`.

The merged game defaults to Claude's MIT Rocketbox cast in `Web/people/real` and uses Shigoto character shading for both sets. `?cast=makehuman` selects this tool's CC0 cast. Eleven generated wardrobe alternatives are exposed alongside the default outfits, with eight additional purchasable shop skins. See `Docs/QUALITY_BASELINE.md` for the final merged checks.
