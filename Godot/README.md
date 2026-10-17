# Salary Man, in Godot 4.3

A first playable port: Tōkonto Nights, an 8 × 8 block night city you can walk and drive round, with a
proper vehicle model, traffic, a railway with level crossings, and the Kenney city and train kits.

The web build (`Web/konto.html`) is still the full game. This project is the start of its replacement,
and it is honest about how far along that is: see **What is and is not here** below.

## Run it

1. Install Godot **4.3** (standard build, not .NET) from godotengine.org.
2. Open `Godot/project.godot`. The first open imports the models, which takes a minute.
3. Press F5.

The project uses the **Compatibility** renderer on purpose: it runs on integrated laptop graphics, and
everything here (shadows, glow, fog, MSAA) works in it. If you have a discrete GPU you can switch to
Forward+ in Project Settings → Rendering and turn on SSAO and SSR in `city_world.gd`'s environment.

## Controls

| | On foot | In a car |
|---|---|---|
| W / S / A / D or arrows | move | throttle / brake and reverse / steer |
| Shift | run | |
| Space | jump | handbrake |
| E | get in the nearest car | get out (when nearly stopped) |
| R | | flip the car upright |
| L | | headlights |
| Mouse | look | look (the camera swings back behind the car after a moment) |
| H | hide the help | |
| Esc | free the mouse | |

A gamepad works too: right trigger throttle, left trigger brake, left stick steer or move, X to get in and out, A for jump or handbrake.

## The driving model (`scripts/vehicle.gd`, `vehicle_spec.gd`)

A raycast vehicle with real tyre physics, not Godot's `VehicleBody3D`:

* **Suspension.** One ray per wheel. Spring rate comes from a ride frequency (Hz), damping from a damping
  ratio with a stiffer rebound, plus anti-roll bars front and rear and a bump stop. Ride height at rest falls
  out of the spring rate, so a stiffer car sits higher.
* **Tyres.** Each wheel has its own speed. Slip ratio and slip angle go through a combined-slip curve
  (Pacejka-style) limited by the load on that tyre, with a little load sensitivity. Wheels can spin up,
  lock, and hop. The wheel-speed update is semi-implicit so it stays stable at 120 Hz.
* **Engine and gearbox.** A torque curve per car, an automatic gearbox with shift times, a rev limiter, engine
  braking, reverse on the brake pedal from a standstill. RWD, FWD or AWD, and a limited-slip differential.
* **Brakes.** Front/rear bias, ABS, and a handbrake that locks the rear wheels and cuts their grip.
* **Aero and stability.** Drag, downforce, and a stability-control system that nudges yaw when the car slides.
* **Weight transfer, roll and pitch** come from forces acting at the contact patches, nothing is faked.
* **Damage.** A sharp change in velocity costs health; at zero the car is wrecked.

Tuning lives in `vehicle_spec.gd`, one block per car. Measured by the headless test (flat road, dry):

| car | 0–100 km/h | braking | skidpad at 50 km/h |
|---|---|---|---|
| sedan | 8.2 s | 0.94 g | 1.10 g |
| sports | 5.4 s | 1.28 g | 1.42 g |
| kei | 13.3 s | 0.85 g | n/a |
| keivan | 15.3 s | 0.82 g | n/a |

These are plausible, not calibrated against real cars. They are the numbers to adjust if a car feels wrong.

## Traffic, trains, crossings

* `ai_driver.gd`: cars follow the left-hand lane on the road grid, plan each turn before the junction, slow for
  a car ahead (a ray), and stop at a lowered level-crossing barrier. A car stuck for six seconds is put back on its lane.
* `train.gd`, `crossing.gd`: two trains shuttle along a fenced railway; the barriers come down before they arrive.
  Anything on the track when a train reaches it is killed ("HIT BY A TRAIN").

## Tests

```
./run_tests.sh          # needs Godot 4.3 on the PATH, or GODOT=/path/to/godot
```

* `tests/physics_test.gd`: 0–100, braking, skidpad and a handbrake turn for every car; fails on NaN or a car that flies off.
* `tests/smoke.gd`: boots the real game, gets in a car, drives, checks the traffic is moving and nothing is lost.
* `tests/shot*.gd`: render screenshots (needs a display; `xvfb-run` works). Not part of the pass/fail run.

Run headless tests with `--fixed-fps 120`. Do not change `Engine.time_scale` in them: Godot scales the physics
step by it, so the physics would no longer match what the scripts think the step is.

## Assets and licences

`assets/kenney/` is Kenney's **City Kit (Commercial)** and **Train Kit**, both CC0. The cars and Seiko are the
models from the web build. `assets/cars/sports.glb` turned out to be a motorbike mesh, so the sports car uses
the sedan body, lowered and widened, until there is a better model.

## What is and is not here

Here: the city, walking, driving four cars, traffic, trains and crossings, a HUD, tests.

Not here yet, all of it still in the web build: the story and missions, the shops, phone, radio, stress and
health, the Mizuho house and its interior, onsens, bike parks and bikes, ski areas, the arcade and console
games, hot-wiring, the police, the whole 28,000-line Konto map. Pedestrians in the Godot city are not
there either. The web build's map is generated from code, so it has to be ported system by system, not copied.

Next steps that would pay off most: a second car-damage layer (deformation), pedestrians and a police
response in this city, then a data-driven port of the Konto map generator.
