# Instructions for AI agents (ChatGPT/Codex, Claude, any other)

## Mandatory: the AAA gate before every push

1. Once per clone, run `sh Tools/qa/install-hook.sh`. It turns on the pre-push hook and installs Pillow and numpy.
2. Before you push, run `python3 Tools/qa/aaa_gate.py`.
3. If it prints **FAIL**, do every numbered instruction it gives (texture bare primitives, fix characters, add street detail...), run it again, and push only once it prints **PASS**.
4. Never bypass it. That means no `--no-verify`, no lowering numbers in `Tools/qa/rules.json`, no new entries in `Tools/qa/baseline.json`, and no fake `// aaa-ok:` waivers. CI runs the same gate and blocks the build.

Full rules: `docs/AAA_GATE.md`.

## Art direction (Duncan, 2026-11-01)

Hyper-realistic world and hyper-realistic characters. No anime or toon assets. Every surface uses full PBR: base colour, normal and roughness/ORM maps.

## Performance engine (stutter / 60 fps)

`Engine/src/perf/Performance.js` (frame pacer, hitch profiler, per-frame budgets, governor) and `Web/game/perf-hook.js` (the game side). Frames are paced to whole screen refreshes (144 Hz runs at a steady 72), deferrable work asks `KONTO_PERF.budget(name, ms)`, background work waits on `KONTO_PERF.idle()`, and the governor only touches resolution and cheap levers, never the tier. New per-frame work that can be spread out should take a budget instead of a fixed ms. Each long frame is blamed (F3 overlay, console `shigoto.perf()`); repeated hitches raise SM-PRF-001. Tests: `node Engine/tools/perf-test.mjs` and `Game/tools/perf-engine-test.mjs`. Off switch `?perf=0`.

## Error codes (SM-...)

The game's error engine (`Web/game/error-engine.js`, plus the "error engine" section of `Game/main.js`) shows codes like `SM-GPU-001-3FA2` with a Copy report button. When Duncan pastes one, look it up in `docs/ERROR_CODES.md` (where to look for each kind) and use the pasted report. Adding a code: add it to the `CODES` table in error-engine.js, then run `node Tools/qa/error-codes.mjs` to regenerate the doc (`--check` verifies it). Test: `node Game/tools/error-engine-test.cjs`.

## Where things are

- Game: `Web/konto.html` (Three.js r128), run in Electron from `Game/`.
- Engine: `Engine/src` (Shigoto). After changing it, run `node Engine/build.mjs` and commit `Web/engine/shigoto.js`.
- Realistic cast: `Web/people/real` with its `index.json`.
- Levels: edit `Web/levels/<name>/src`, then run `node Engine/tools/bake-level.mjs <name>`.

## Model Forge (making 3D models)

When Duncan asks for a new model (prop, furniture, vehicle part, building piece), make it with our own GPU, not Meshy/Tripo:
`gh workflow run forge.yml --ref claude/friendly-cannon-alnk4v -f action=make -f prompt="<one object, material, age>" -f id=<snake_id> -f size=height=<m>`
(or `action=batch` with a spec in `Tools/forge/requests/`). It commits `Web/props/<id>.glb` + `props/index.json` after the AAA gate.
Locally: `python3 Tools/forge/forge.py make ...`. Docs: `Tools/forge/README.md`. Test without a GPU: `python3 Tools/forge/test_forge.py`.
