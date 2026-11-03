# Salary Man error codes

Generated from the table in `Web/game/error-engine.js` by `node Tools/qa/error-codes.mjs`. Do not edit by hand.

When something goes wrong the game shows a code like **SM-GPU-001-3FA2** with *Copy report* and *Open GitHub issue* buttons.
`SM-GPU-001` is the kind of fault (below). The last four characters are a fingerprint of the message and the top of the stack: the same bug
gives the same fingerprint from run to run, so two pastes with the same full code are the same problem.

**For Claude, when Duncan pastes a code or report:** find the code here, read *Where to look*, then use the report's Message, Stack, GPU line
and recent log. Reports are also in `<userData>/error-log.txt` on his PC (`%APPDATA%/Salary Man/error-log.txt` on Windows), and GPU process
events in `gpu-log.txt` beside it. In game, Ctrl+Shift+E lists everything this session has reported; in the console, `errors()`.

Severity *error* shows a card; *warn* only counts on the small pill in the corner (the game carries on).

## Scripts

| Code | Severity | What the player sees | Where to look |
|---|---|---|---|
| `SM-JS-001` | error | **Script error in the game**. A piece of the game's code failed. | Web/konto.html: the stack names the function. Usually a missing null check or a global used before it is set. |
| `SM-JS-002` | error | **Script error in a game add-on**. One of the game's add-on scripts failed. | Web/game/*.js or Web/art/*.js: the file is in the stack and in the title. |
| `SM-JS-003` | error | **Unhandled promise rejection**. Something the game was waiting for failed and nothing caught it. | An async function or fetch().then without a catch. The stack (if any) points at it; a non-Error reason is printed as Message. |
| `SM-JS-004` | warn | **Script error with no details**. A script from another site failed; the browser hides the details. | Cross-origin script (CDN, YouTube, Spotify). Usually harmless; check the recent log for what ran just before. |
| `SM-JS-005` | error | **Error inside three.js**. The 3D library choked on something the game gave it. | three.min.js internals: look one frame up the stack for the game call. Typical: NaN geometry, disposed texture, missing material. |

## Shigoto engine

| Code | Severity | What the player sees | Where to look |
|---|---|---|---|
| `SM-ENG-001` | error | **Shigoto engine error**. The game engine (physics, streaming, weather) failed. | Engine/src (bundled into Web/engine/shigoto.js). Rebuild with node Engine/build.mjs after fixing. |

## Graphics

| Code | Severity | What the player sees | Where to look |
|---|---|---|---|
| `SM-GPU-001` | error | **Graphics driver reset (WebGL context lost)**. The graphics card dropped the game's picture. The game saves and restarts on safer graphics. | konto.html initThree webglcontextlost + GFX_SAFE ladder; persist-hook gpuWarm. Report carries GPU, driver, safe level, tier and what was on screen. |
| `SM-GPU-002` | error | **Graphics process crashed**. The program that talks to the graphics card stopped (desktop build). | Game/main.js child-process-gone (type GPU). Reason/exit code in Message; also <userData>/gpu-log.txt. Often a driver TDR or out of video memory. |
| `SM-GPU-003` | error | **Graphics driver keeps resetting**. The driver reset even on the safest graphics. Updating the graphics driver usually fixes this. | GFX_SAFE reached level 3. Driver/GPU problem or a draw that is too heavy even at low: check the GPU line and the log before the loss. |
| `SM-GPU-004` | error | **WebGL could not start**. The game could not get 3D graphics from this computer. | WebGLRenderer creation failed: GPU blocklisted, driver missing, remote desktop, or GPU process down. See GPU line and featureStatus. |
| `SM-GPU-005` | warn | **Shader failed to compile**. Some surfaces may draw black or not at all. | THREE.WebGLProgram shader error: the log lines carry the GLSL error. Custom ShaderMaterials / onBeforeCompile patches in konto.html. |
| `SM-GPU-006` | error | **Graphics did not come back**. The graphics card did not return the game's picture after a reset. | webglcontextlost with no restore and no reload. Driver hung; the game needs a restart. |

## Assets

| Code | Severity | What the player sees | Where to look |
|---|---|---|---|
| `SM-AST-001` | warn | **3D model failed to load**. A model (person, car, prop) did not arrive; something may be missing. | GLTFLoader error: the URL is in Message. Missing file in Web/, not staged by Game/tools/stage.js, or a broken .glb. |
| `SM-AST-002` | warn | **Picture or texture failed to load**. A picture did not arrive; a surface may look plain. | TextureLoader / <img> error: URL in Message. Check the file exists under Web/ and the path's case (Windows ignores it, the build does not). |
| `SM-AST-003` | error | **Game script failed to load**. Part of the game is missing, so some features will not work. | <script>/<link> load error: URL in Message. stage.js not copying the folder, or a CDN library offline in the browser build. |
| `SM-AST-004` | warn | **Game data failed to load**. A data file (JSON, level) did not arrive. | fetch() returned an error status or failed: URL and status in Message. |
| `SM-AST-005` | warn | **Sound or video failed to load**. Something will be silent. | <audio>/<video>/AudioLoader error: URL in Message. Radio files under Web/art/radio or music/index.json. |

## World preload (persistence)

| Code | Severity | What the player sees | Where to look |
|---|---|---|---|
| `SM-PER-001` | warn | **World check failed at load**. A check run behind the loading screen found a problem. | Persistence checks (Web/game/persist-hook.js P.check): each failed framework/name/detail is listed in Message. |
| `SM-PER-002` | warn | **World build stage failed at load**. Part of the world could not be prepared behind the loading screen. | Persistence stage threw (persist-hook.js P.stage / PERSIST_EXTRA): the stage name and error are in Message. |
| `SM-PER-003` | error | **World preload failed**. Preparing the world behind the loading screen failed. | window.persistLoad rejected: stack in report. The game falls back to streaming; check Engine/src/persist/Persistence.js run(). |

## Loading and frame loop

| Code | Severity | What the player sees | Where to look |
|---|---|---|---|
| `SM-BOOT-001` | error | **Loading screen never finished**. The game has been loading for a very long time. | #boot still visible after 12 minutes. The log shows the last stage reached; look at generate() / persistLoad progress. |
| `SM-BOOT-002` | error | **The game stopped drawing**. The picture froze although the game is still running. | No requestAnimationFrame callback for 8 s while the window is visible: the frame loop threw before rescheduling. See the first error before it. |

## Memory

| Code | Severity | What the player sees | Where to look |
|---|---|---|---|
| `SM-MEM-001` | warn | **Running low on memory**. The game is close to its memory limit and may crash. | JS heap above 90% of its limit. Persistence budget (memoryBudget) or a leak; heap numbers in the report. |
| `SM-MEM-002` | error | **Out of memory**. The game ran out of memory. | Allocation failure (RangeError / 'out of memory'). Heap numbers in report; lower tier or ?persist=0 as a workaround. |

## Saving

| Code | Severity | What the player sees | Where to look |
|---|---|---|---|
| `SM-SAV-001` | error | **Could not save the game**. The save storage is full, so progress may not be kept. | QuotaExceededError writing localStorage (saveGame). Saves or caches too big; check what keys are large. |

## Desktop app (Electron)

| Code | Severity | What the player sees | Where to look |
|---|---|---|---|
| `SM-ELC-001` | error | **The game page crashed**. The game's page stopped and was restarted (desktop build). | Game/main.js render-process-gone: reason and exit code in Message. Look at the page's log before the crash. |
| `SM-ELC-002` | error | **The game page ran out of memory**. The game's page used too much memory and was restarted. | render-process-gone reason 'oom'. Memory budget / leaks; js-flags max-old-space-size is 4096 in main.js. |
| `SM-ELC-003` | warn | **The game window stopped responding**. The game froze for a while. | BrowserWindow 'unresponsive': a long blocking task on the main thread (world build, shader compile). Duration is in Message. |
| `SM-ELC-004` | error | **The game page failed to load**. The game's files could not be opened. | did-fail-load on konto://app/index.html: missing/corrupt install or a broken update in <userData>/Update. |
| `SM-ELC-005` | error | **The desktop bridge failed**. The part that connects the game to the desktop failed. | preload-error in Game/preload.js. |
| `SM-ELC-006` | warn | **A helper process stopped**. A background process (sound, network) stopped unexpectedly. | child-process-gone for a non-GPU process: type and reason in Message. |
| `SM-ELC-007` | error | **Desktop app error**. The desktop app itself hit an error. | Uncaught exception in Game/main.js: stack in report. |
