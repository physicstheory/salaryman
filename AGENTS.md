# Instructions for AI agents (ChatGPT/Codex, Claude, any other)

## Mandatory: the AAA gate before every push

1. Once per clone, run `sh Tools/qa/install-hook.sh`. It turns on the pre-push hook and installs Pillow and numpy.
2. Before you push, run `python3 Tools/qa/aaa_gate.py`.
3. If it prints **FAIL**, do every numbered instruction it gives (texture bare primitives, fix characters, add street detail...), run it again, and push only once it prints **PASS**.
4. Never bypass it. That means no `--no-verify`, no lowering numbers in `Tools/qa/rules.json`, no new entries in `Tools/qa/baseline.json`, and no fake `// aaa-ok:` waivers. CI runs the same gate and blocks the build.

Full rules: `docs/AAA_GATE.md`.

## Art direction (Duncan, 2026-11-01)

Hyper-realistic world and hyper-realistic characters. No anime or toon assets. Every surface uses full PBR: base colour, normal and roughness/ORM maps.

## Error codes (SM-...)

The game's error engine (`Web/game/error-engine.js`, plus the "error engine" section of `Game/main.js`) shows codes like `SM-GPU-001-3FA2` with a Copy report button. When Duncan pastes one, look it up in `docs/ERROR_CODES.md` (where to look for each kind) and use the pasted report. Adding a code: add it to the `CODES` table in error-engine.js, then run `node Tools/qa/error-codes.mjs` to regenerate the doc (`--check` verifies it). Test: `node Game/tools/error-engine-test.cjs`.

## Where things are

- Game: `Web/konto.html` (Three.js r128), run in Electron from `Game/`.
- Engine: `Engine/src` (Shigoto). After changing it, run `node Engine/build.mjs` and commit `Web/engine/shigoto.js`.
- Realistic cast: `Web/people/real` with its `index.json`.
- Levels: edit `Web/levels/<name>/src`, then run `node Engine/tools/bake-level.mjs <name>`.
