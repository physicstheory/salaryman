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

| | |
|---|---|
| drag | look |
| W A S D | move |
| Q / E | down / up (flying) |
| shift | run, or fly faster |
| F | swap between flying and walking as Seiko |
| scroll | fly speed |

Flying, **F** drops him on the ground below where you are looking. Walking, **F** puts the camera
back. Click any reserved site in the right hand panel to fly to it.

## Soti Tower

The one building in the city that is modelled rather than massed. It is taken from the Ping An
International Finance Centre in Shenzhen: a square plan with deeply chamfered corners, a shaft
that tapers the whole way up, and eight stainless steel mega-columns standing proud of the glass
that run the full height and close over the roof into the claw, with a short mast above.
592 m to the tip, 116 floors, and it takes a whole block so it stands in its own plaza.

`SOTI` at the top of the tower section holds the proportions; `buildSotiTower()` lofts the
curtain wall through 76 rings and extrudes a blade on each of the eight plan corners.

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
