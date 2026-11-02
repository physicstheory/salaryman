# Konto in a browser

`konto.html` is the whole world generator in one file: the island, the erosion, the rivers, the
capital's wards, streets, railways and plots — and Seiko Shigu, who you can walk around it.

## Running it

**Straight off disk.** Save `konto.html` anywhere and open it. Everything works except the
character mesh: a browser will not fetch `seiko.glb` over `file://`, so a built-in figure in the
same clothes stands in for him.

**With the real mesh.** Keep `konto.html` and `seiko.glb` in the same folder and serve it:

```
python3 -m http.server 8000      # then open http://localhost:8000/konto.html
```

**Anywhere, as one file.** Base64 the mesh into the page and it carries him with it:

```
python3 - <<'EOF'
import base64
html = open('konto.html').read()
b64 = base64.b64encode(open('seiko.glb','rb').read()).decode()
tag = '<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>'
open('konto-standalone.html','w').write(
    html.replace(tag, '<script>window.SEIKO_GLB_B64="%s";</script>\n%s' % (b64, tag)))
EOF
```

## Controls

It is built for an Xbox pad, laid out the way GTA V is, and the keyboard mirrors it.

| On foot | Pad | Keyboard |
|---|---|---|
| walk | left stick | W A S D |
| look | right stick | drag |
| sprint | X (hold) | shift |
| jump | A | space |
| get in / out | Y | F |
| phone | D-pad up | P |
| Seiko ↔ free camera | D-pad down | G |
| map | Menu ☰ | M, Esc or Tab |

| Driving | Pad | Keyboard |
|---|---|---|
| accelerate | RT | W |
| brake, then reverse | LT | S |
| steer | left stick | A / D |
| handbrake | A | space |
| get out | Y | F |

On the map: the left stick pans, the triggers zoom, **A** drops a waypoint, the
D-pad moves down the menu and **X** chooses. With a mouse: drag, scroll, click.

Click any reserved site in the right hand panel to fly to it.

## What you see while you are playing

A **minimap** in the bottom left corner, rotated to where you are looking and
scaled up when you are driving, with the waypoint and the line to it on it. Over
it, where you are: the arterial if you are on one, and otherwise the ward and
the chōme, because most streets in Japan have no name and the block is what an
address is built from.

The **map** is the whole island: pan it, zoom from the coastline down to a
street corner, and drop a waypoint anywhere. Zoomed in it draws the street grid,
the plots, the parks, the station names and the arterials by name. It is the
pause screen too, so the graphics and shadow switches are down its left side.

The **phone** is a SOTI So24. D-pad up brings it out of the bottom right corner
and the D-pad moves around it. The apps do nothing yet.

## What is on the streets

**Sixteen kinds of vehicle**, at the manufacturers' real dimensions and in the proportions a
Japanese street actually carries them: kei cars and kei vans, hatchbacks, a fastback hybrid, a
saloon, a crossover, a one-box minivan, a taxi with its 行灯 roof lamp and 空車 card, a Ryde
ride-hailing car, a patrol car, a coupe, a supercar, a motorcycle with a rider, a Hayabin delivery
scooter, an Isuzu-sized box truck and a 10.49 m municipal bus. A quarter of them are kei, because
a quarter of them are kei. Commercial vehicles carry green plates and kei vehicles yellow ones.

**Nothing wears a real badge.** The marques are invented — Kosei, Ryusei, Kaneda, Mitsuwa, Suzume,
Nanatsu, Daichi, Ganseki — and drawn as geometry in the idiom of car badges. Which marque a given
car wears is a per-instance texture offset, so one hatchback geometry carries four of them for the
cost of one.

**NHRail** — Nihon Rail — runs the loop line, the radials and the shinkansen: six-car stainless
commuter sets and eight-car bullet trains with a 6.2 m nose, on two tracks, pitched to the
gradient. Every station gets side platforms, a canopy, a tactile edge strip, benches, a vending
machine, ballast and four running rails, a concourse with the company's mark over the door, and
name boards that are generated per station into one shared atlas so all of them cost one draw call.

**Tokonto Bus** stops stand every 300 m along the arterials, alternating carriageways: a flag, a
timetable, and one stop in three a shelter with a bench and an advert.

**The advertising** is eight panels at 8:1 — the shape of the side of a bus, the side of a train
and the sign over a Tokyo street — and they go on all three, plus roadside hoardings, rooftop
bands, station concourses and the screens wrapped round the scramble crossing. They are jokes
about Japan rather than copies of Japanese ones. See
**[Docs/REFERENCES.md](../Docs/REFERENCES.md)** for all of them.

**The scramble crossing** is found rather than placed: wherever the inner ring road crosses a
radial nearest a nightlife ward. Four crossings and two diagonals laid as geometry on the road,
horizontal signal heads on all four corners, every building within sight wrapped in advertising
bands, a police box on one corner and a bronze dog on the other.

**Shrines** get a torii, a gravel approach, a hall on a stone base under a kawara roof, a water
basin, a guardian pair and stone lanterns.

All of the street furniture in the city is four meshes — one of coloured boxes and one per texture
atlas — so the whole of it costs four draw calls.

## Soti Tower

The one building in the city that is modelled rather than massed. **248 m**, which is Midtown
Tower in Akasaka, because that is what the tallest building in a Tokyo district actually measures.
A 48 m square floorplate with cut corners, 54 floors at 4.1 m, two setbacks at 42% and 74% of the
shaft, louvred mechanical floors under each of them, four corner pilasters standing 0.4 m off the
glass, and five storeys of stone podium 62 m across meeting the pavement under a canopy. A mast
takes it to 262 m.

It used to be the Ping An Finance Centre from Shenzhen — 592 m, eight mega-columns closing over
the roof into a claw — and next to 150 m neighbours it read as science fiction rather than as a
city. Tokyo towers cluster; the tallest in a district stands about one and a half times its
neighbours, which is what Soti does now.

`SOTI` at the top of the tower section holds the proportions; `buildSotiTower()` lofts the curtain
wall through one ring per floor, doubling the ring at each setback so the step is a crisp soffit
rather than a taper.

## seiko.glb

Exported from the Meshy `.blend`: decimated from 68,716 to 27,486 triangles, textures resized from
2048 to 1024 and re-encoded as JPEG, 1.4 MB in total.

**Rigged, with three clips.** Mixamo is an interactive Adobe service and could not be reached from
the machine this was built on, so the rig was authored in Blender instead and does the same job: a
21 bone humanoid skeleton (hips, spine, chest, neck, head, shoulders, arms and hands, legs, feet
and toes) placed from measurements of the mesh, skinned with bone heat weights, carrying:

| clip | length | what it is |
|---|---|---|
| `Idle` | 3.2 s | breathing, weight settled on the right leg, hands in his pockets |
| `Walk` | 1.07 s | heel strike and roll through the foot, pelvis bob, shoulders counter-rotating |
| `Run` | 0.8 s | forward lean, airborne phase, hands out of the pockets and driving |

The source mesh is modelled standing with both hands in his trouser pockets, so `Idle` and `Walk`
keep them there — it is what a salaryman on a platform actually looks like — and only `Run` pulls
the arms out.

`updateSeikoClip()` picks the clip from his speed and crossfades over about a fifth of a second,
scaling the clip's playback rate by speed over `WALK_SPEED` / `RUN_SPEED` so his feet do not skate.

## Playing it on a phone

The page works on a touch screen: drag anywhere to look, and a thumbstick appears in the
bottom left to move. Run is a toggle, Up and Down are holds and only appear while flying, and
the panel moves to the top right so the stick is not sitting on top of it. Phones also render
three device pixels to the CSS pixel, so the renderer is capped at 1.5 on touch.

## One file, for hosts that serve one file

`konto.html` fetches the character from `seiko.glb` beside it, which works on a web server and
nowhere else: a page opened from a phone's Files app cannot fetch its neighbours, and some
hosts serve no `.glb` at all. For those:

```
python3 Tools/web/make-standalone.py              # -> Web/konto-standalone.html
```

It carries the model into the page as base64, through the `SEIKO_GLB_B64` hook the page
already has. `--keep-wrapper` leaves the `<!doctype html>` in place, which is what you want
for a file you open or serve yourself; without it the output is a fragment, for a host that
supplies its own document skeleton.
