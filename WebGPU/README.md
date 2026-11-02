# Salary Man — WebGPU / Electron

An open-world city game on a fictional Honshu ("Konto", capital Tōkonto, protagonist Seiko Shigu), as a desktop game:
**Three.js `WebGPURenderer` inside Electron**, with **Rapier** for physics. It falls back to WebGL2 by itself on a machine without WebGPU.

This is the port of the Godot build (`../Godot`) and of the original single-file web game (`../Web/konto.html`).

## Run it

```
npm install
npm start            # fullscreen, borderless
npm run start:dev    # same, with F12 for the developer tools
npm run serve        # or: serve the folder at http://127.0.0.1:8123 and open it in Chrome/Edge (WebGPU needs a recent one)
npm run build        # installers into dist/  (build:win, build:mac, build:linux)
npm test             # the headless vehicle-physics test
```

`F11` toggles fullscreen, `Ctrl+Q` quits. Add `?webgl` to the address (browser) to force the WebGL2 backend.

## Controls

| Keyboard / mouse | Gamepad | |
|---|---|---|
| W A S D, mouse | left stick, right stick | walk, look; throttle, steer in a car |
| Shift, Space | L3, A | run, jump; handbrake in a car |
| E | X | get in or out of a car, enter a shop, use a vending machine, sit, fish |
| L, T | B, R3 | headlights, flip the car upright |
| P | Y | the phone |
| M | View | the map (click or Enter sets a waypoint) |
| Esc | Start | pause: Bag, Stats, Settings, Controls, System |
| Q (hold) | LB (hold) | equipment wheel: point, up/down choose, let go to use |
| R (tap, hold) | D-pad left (tap, hold) | radio next station, radio wheel (in a car) |

## What is in it

* **Vehicle physics** (`src/vehicle`): a raycast vehicle on a Rapier rigid body. Springs, dampers and anti-roll bars per wheel; a Pacejka-style
  combined-slip tyre model with load sensitivity; wheel speed as its own state; engine torque curve, automatic gearbox, ABS, traction control,
  stability control, drag and downforce; electric drivetrain with regeneration. Seven cars (sedan, sports, kei, kei van, Audi RS Q8, Audi A7, BYD Song).
  `npm test` drives them through acceleration, braking, a skidpad and a handbrake turn.
* **Traffic**: AI drivers on the grid, left-hand lanes, turning at junctions, stopping for cars ahead and for level-crossing barriers.
* **The city** (`src/world`): 8 × 8 blocks, 50 Japanese street buildings dressed with a procedural facade shader (TSL), shop signs, blade signs,
  rooftop billboards and tower banners, PBR tarmac and pavement with lane paint, zebra crossings, tyre wear and wet puddles at night, a park,
  a pier, a railway with a station, level crossings and two trains, street lamps, and a sky with a real day/night cycle (sun, moon, stars,
  clouds-free physical sky, warm light at dusk, lit windows, lamp lights).
* **Shops** (all the chains, the mall with four floors, the capsule hotel, the back-street armourer), vending machines, items and the bag.
* **Activities**: bath house, pachinko, karaoke, arcade (snake, breakout), fishing, benches.
* **The phone**: SOTI, Pear and the two store handsets, each with its own body, cut-out, status bar, wallpaper and home screen; thirteen apps and
  forty-two websites (order online, delivery into the bag).
* **UI**: HUD with speedometer, minimap, toasts; full map; pause menu; title screen; equipment wheel and radio wheel; controller support throughout.

## Assets

Drop real assets in and they are used by name:

* `assets/cars/<name>.glb` for `sedan`, `kei`, `keivan`, `rsq8`, `a7`, `byd_song` (a missing file falls back to the sedan). Models face +Z; name nothing
  in particular, but keep each GLB small. `tools/prepare_car.py` (Blender, headless) turns a downloaded car into one.
* `assets/textures/road/`: a generated 1K asphalt set is included. To use a Poly Haven scan (e.g. `asphalt_02`), put its diffuse, GL normal and ARM
  maps (PNG or JPG, 2K is plenty) in that folder and add `index.json`:
  `{ "diff": "asphalt_02_diff_2k.jpg", "nor": "asphalt_02_nor_gl_2k.png", "arm": "asphalt_02_arm_2k.jpg" }`. EXR normals must be converted to PNG first.
* `assets/data/game_data.json` is built from the web game by `tools/extract_game_data.js`.

Kenney's City Kit (Commercial) and Train Kit are CC0 (licences in the Godot folder). The tree kit, building meshes, Seiko and the cars are the project's own.
