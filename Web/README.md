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

## seiko.glb

Exported from the Meshy `.blend`: decimated from 68,716 to 24,050 triangles, textures resized from
2048 to 1024 and re-encoded as JPEG, 858 KB in total.

The mesh has **no armature**, so his limbs cannot move — walking gives him a stride bob and a lean
and nothing else. Rig him (Mixamo will do it from the exported FBX in about a minute) and the
glTF's animations will come through the same loader; `updateWalk` is where the clip would be
driven from.
