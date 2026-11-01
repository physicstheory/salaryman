# Salary Man visual redesign and development handoff

The active game is `Web/konto.html`, staged into the Electron shell by `Game/tools/stage.js`. Use the existing isolated checkout. `Godot` and `WebGPU` are reference experiments.

## Art direction and delivered changes

The identity combines charcoal teal, warm ivory, vermilion and muted jade with Japanese commuter wayfinding. The game keeps a consistent stylized anime cast. The UI remains at native CSS/canvas resolution while the 3D scene scales independently.

- **Brand:** a new transparent Salary Man wordmark in `Web/art/logo.png`, used by the title, loading and pause screens; a matching briefcase/rising-sun favicon and 512px desktop icon. `Web/art/interface.js` contains the shared canvas identity and product illustrations; `interface.css` contains the interface theme.
- **Characters:** all 30 GLBs have new authored palette/proportion profiles in `Tools/anime/cast-design.json`. Seiko has consistent black hair and a coordinated wardrobe; Akio, the receptionist and the Shigu family have distinct treatments. Suit variants have new skinned sleeve/lapel geometry, and Akio/father have head-bound eyewear placed from the actual skinned eye positions. These are substantial adaptations of the licensed CC0 VRoid bases, not a claim that the underlying bodies were sculpted from scratch. Bone names, original weights and inverse bind matrices are retained for the existing retargeter.
- **Asset cost:** 3,082 original primitives become 494 after the redesign, including the new garments/accessories: 84.0% fewer potential base-pass submissions across the asset set. GLB bytes drop from 77,578,824 to 70,917,756 (8.6%). These are asset metrics, not measured FPS gains. The rebuild compacts superseded buffers rather than shipping edit history.
- **Accurate imagery:** loading cards and named-character avatars use renders of the actual new rigs. MyGram keeps authored in-world illustrations instead of replacing posts with search results showing real-world cities and products. Player photographs and user-selected wallpapers are preserved.
- **Apps:** shared phone navigation, headers, card surfaces, selection states, typography and icons have been restyled. The default wallpaper illustrates the bay, mountains and SOTI skyline. MyGram, Wallet, Camera, Music, Photos, Mail, Contacts, Health and the remaining screens retain their individual functions. Noodle receives warmer browser chrome; Expedio receives a matching travel/boarding-pass treatment. Long contact lists now keep selection visible; empty Photos text fits the screen.
- **NHRail:** the old invented departure countdowns/fallback stations are replaced by the actual nearest world stations and real distances. Select a station to mark directions on the map.
- **Settings/HUD:** new density and reduced-interface-motion preferences persist through the existing settings store. Every visible graphics/interface/controller setting is reachable by controller, including options previously omitted from navigation. The selected row scrolls into view. The HUD, notices, prompts, minimap, menu pages, map controls and legends share the new visual language. The old parent grayscale filter is removed.
- **Advertisements and signs:** shared bus/train/street ads have actual product illustrations and fitted campaign typography; the convenience-store ad uses the game's 11 Eleven brand. Rooftop business signs, interior labels and station signs have a new hierarchy and fitted text. The atlas now registers every station instead of reusing the first row after 16 names. The default world has 25 unique station names, fitting a 1024×2048 atlas. Multi-column layouts keep larger registries within a 4096px texture dimension.
- **Performance behavior:** the opaque loading screen suspends hidden world simulation/rendering while loaders/timers continue. Opaque pause pages retain the last 3D frame, with explicit camera captures still permitted. Automatic 3D pixel budgets include HiDPI/supersampling: low 720p, medium 1080p, high 1440p, ultra 2160p equivalent. Explicit manual resolution overrides remain available. Iris Xe/Vega start at medium; saved user choices win.
- **Calendar:** phone dates follow the game clock, including day/month rollover, instead of displaying a fixed Monday. The fictional calendar starts on Monday 6 April 2026.

## Reproduce the character and brand assets

Python 3.12 with NumPy 2.3.5/Pillow 12.3.0 is pinned in `Tools/anime/requirements.txt`. The cloud environment has an isolated installation at `/workspace/salaryman-setup/cast-venv`.

```sh
# From /workspace/salaryman. Source GLBs come from the exact commit in cast-design.json.
/workspace/salaryman-setup/cast-venv/bin/python Tools/anime/redesign_cast.py

# Exercise the actual Three.js r128 GLTF loader and the game's retargeter;
# render the seven named-character portraits from the resulting rigs.
PLAYWRIGHT=/opt/codex/cua_node/lib/node_modules/playwright CHROME=/usr/bin/chromium \
  node Game/tools/cast-test.cjs /tmp/salaryman-cast

# Update the desktop icon, in-game portraits and accurate loading cards.
PLAYWRIGHT=/opt/codex/cua_node/lib/node_modules/playwright CHROME=/usr/bin/chromium \
  node Game/tools/build-presentation.cjs /tmp/salaryman-cast
npm run stage --prefix Game
```

The source commit must remain available in Git history; do not reset or replace it. Rebuilding always reads that immutable source, so edits do not accumulate. To rebuild selected characters, append their file stems to `redesign_cast.py`. Keep `Web/people/index.json`, portraits and loading cards in sync with profile changes. Original CC0 attribution remains in `Web/people/LICENSE-anime.md`. No proprietary AAA-library assets were acquired.

## Validation

```sh
/workspace/salaryman-setup/cast-venv/bin/python -m unittest discover -s Tools/anime -p 'test_*.py' -v
node Game/tools/presentation-test.cjs
npm run stage --prefix Game
PLAYWRIGHT=/opt/codex/cua_node/lib/node_modules/playwright CHROME=/usr/bin/chromium \
  node Game/tools/readiness-test.cjs /tmp/salaryman-readiness
```

Five Python tests and eleven Node tests cover primitive batching, transparent order, skinning/bind preservation, geometry/index validity, deterministic character regeneration, pixel budgets, manual overrides, calendar rollover, offline social imagery, loading/pause rendering, settings navigation/preferences, actual station data and station-atlas uniqueness beyond 16 rows and legend/render color consistency.

The cast test passes for all 30 GLBs and retargets Idle/Walk/Run onto every one. The complete functional runner passed with zero uncaught JavaScript errors, all 14 phone apps, station directions, Expedio, interface settings and map interactions. The default world registered all 25 station names in a 1024×2048 atlas. The functional runner checks title/world generation, the rigged player/story assets, cinematic skip and playable walking state; renders all 14 phone app canvases; exercises station directions, Expedio, both interface preferences, settings scrolling and the map. It writes screenshots plus a timestamped `result.json`. A running/failed report must not be treated as a pass. Inspect both exit status and current-run results. Screenshots use the repository's longer software-renderer timeout.

The renderer still emits existing warnings about non-indexed conversion, textures awaiting images and unsupported second UV sets for normal maps. These are retained in the report. Core startup does not require external credentials; Spotify/YouTube and other online integrations were not authenticated or validated. Desktop GUI launch and installer builds were not exercised in this display-less cloud machine.

## Remaining release checks

- Benchmark actual integrated/dedicated GPUs: median/p95/p99 frame times, stalls and memory in Mizuho, the capital, rush hour, airports, interiors, driving and flight. Cloud software rendering cannot establish low-end laptop FPS or universal visual/performance quality.
- Review the new garments in the full animation set: sitting, phone use, vehicle entry, weapons and parachuting, beyond the validated Idle/Walk/Run clips. New faces are profile-based CC0 adaptations; more bespoke topology/sculpting and distance LODs remain possible art-production work.
- Check every app's populated, loading, empty and error states, localization, touch/controller input and narrow viewports; rendering the default states is not exhaustive interaction testing. Purchases, external services and every mission were not regression-tested in this pass.
- Run relevant existing `Game/tools/*test.mjs` gameplay scenarios. Several log failures without a failing process exit code, so inspect assertions rather than trusting the exit code alone.

## Retail review build (November 2026)

The review integrates Claude's renderer/engine work through `80fdc374` and the redesign. `Web/art/retail.js` adds six original fictional retail identities, ray/box interior-mapped sealed windows, an analytic display island with parallax, shared 2048×1536 surface art, and 128m spatial batches culled at 130m on low / 220m otherwise. Window placement excludes registered enterable shops; the tested default world contains 24 mapped windows. These are original stylized procedural interior surfaces, not stock photographs or Meshy/Tripo outputs.

Dokoto's five floors have distinct accent finishes and campaign identities. Books, clothing, plaza and convenience interiors receive ceiling/wall dressing; floor materials and device campaigns use game product data. New fixtures stay above head height or flush to walls. Existing stock, room dimensions, collision/navigation and lift actions remain in use.

Run `PLAYWRIGHT=/opt/codex/cua_node/lib/node_modules/playwright CHROME=/usr/bin/chromium node Game/tools/retail-test.cjs /tmp/salaryman-retail` to build all five departments plus books/clothes/plaza, inspect finite colliders/navigation, verify world window placement, compile the shader, and capture two camera angles. It uses actual room builders in isolated inspection scenes. The integrated full gameplay/app test passed with zero uncaught JavaScript errors; unit checks pass (5 Python / 11 Node). Shader/texture warnings noted above remain.

Meshy and Tripo browser authorization succeeded in this cloud instance. Tripo reports 0 API credits. The user approved a 20-credit two-prop Meshy batch, but the first submission was rejected HTTP 402: free-plan API task creation unsupported, despite a 195-credit displayed balance. No task ID was accepted and the second submission was not attempted. No Meshy or Tripo texture was installed or falsely attributed. Credentials are managed by each CLI and must never be committed or copied into this repository. Auth and live processes are not guaranteed to survive environment snapshots.

Review builds are unsigned. Runtime checks used cloud software rendering, not physical laptop benchmarking. This is a review release, not an assertion of universal AAA quality or certified frame rates. The game and rig changes still need playtesting on actual Windows/Linux PCs.

## Generated campaign and material artwork

`Web/art/product-campaigns.png` and `material-surfaces.png` are original OpenAI-generated image atlases (1536×1024 each). The campaign panels depict the actual fictional SOTI So26, Pear P17, Playbox 5 and 11 Eleven brands. Campaign panels are 768×512 source pixels, fitted to the game's long ad bands and portrait posters without stretching an entire image across an 8:1 billboard. Product labels and store prices remain live canvas text based on game data. The six material source tiles are 512×512: oak, brushed metal, fabric, plaster, terrazzo and walnut. These dimensions are recorded rather than claiming 4K source art.

`Web/art/product-art.js` loads both checked-in images locally, keeps fallback colours if an image fails, refreshes textures when loading completes, and shares cached maps/materials. Selected basic furniture and architectural boxes receive matching wood, metal or plaster finishes; floor surfaces use oak/walnut/terrazzo. Existing detailed GLB maps, character materials and clerk skin are preserved. These are base-colour finishes, not a replacement mesh or a claim of newly generated PBR normal/roughness data.

The final gameplay check additionally asserts that Claude's Shigoto physics engine runs, weather switches successfully, realistic-world mode is enabled and both image atlases load, then captures a high-quality city view. The retail check asserts that fixtures actually received the generated surfaces. Inspect the current-run report and screenshots before pushing the art update or publishing the review release.

Final visual fixes cover Seiko’s village/denim sleeves with skinned garment geometry while preserving the bind and animation data. The cast is now 494 primitives and 70,917,756 bytes across 30 GLBs. Grain is reduced to 0.004 and chromatic aberration to 0.08 for a cleaner finish; Claude’s HDR/SSAO/bloom/SMAA chain remains active on high/ultra. The weather check restores its previous wetness so the clear-weather capture does not inherit artificial test rain. The high-quality capture uses the same walk-surface height query as player movement.

Named review builds are uploaded as GitHub draft releases. Publish only after the relevant functional/visual checks pass and the downloadable Windows archive is checked for the exact new rig/art/engine files. The rolling `latest-build` workflow behavior is retained.

The visual review also found that low-preset water skipped the coastline and palace-island masks. Its inexpensive Lambert material now samples the same connected-sea mask and clips the moat island, preventing a transparent sea sheet across reclaimed streets when using the low material or changing tiers. This retains the low-preset lighting path.

Store-stock primitives now receive cached item-specific fronts/screens/packaging and textile or food details, with 128px/256px/512px maps on low/medium/high-plus. The stock hook leaves item IDs, purchasing and collision data unchanged. A visible street-water/teal overlay remains under investigation; the coastline-mask change alone did not resolve that view. This remains a review release with that known visual defect. The user requested stopping screenshot work and pushing the build with these limitations.
