"""Facades: the city's wall textures, modelled in 3D in Blender and baked flat.

Each style is a real facade section built from geometry (mullions, transoms, spandrel panels, recessed windows with
reveals and sills, balconies with railings, condensers and laundry poles on the flats, rusticated stone on the civic
block), with real rooms behind the glass: blinds half down, curtains, a desk lamp, ceiling light strips. It is baked
onto one plane with Cycles (selected-to-active):
    _color   what you see in daylight: the rooms through the glass dimmed by it, AO in every reveal
    _normal  the relief (OpenGL tangent space)
    _rough   glass smooth, frames satin, stone rough
    _lights  the lit rooms at night (a share of windows, warm and cool), used as the emissive map
The section is a whole number of bays and floors, so the texture tiles seamlessly; FACADE_PHOTOS in konto.html says
how many metres it covers. Output: Web/art/facades/<style>_{color,normal,rough,lights}.jpg (2048 px).
"""
import math
import os
import random
import bpy
import numpy as np
from mathutils import Vector

from core import box, cyl, apply_all, join
import mats
import export

M = mats.get
OUT = os.path.join(export.REPO, "Web", "art", "facades")
TARGETS = ["facade_office", "facade_glass", "facade_flats", "facade_civic",
           "facadewin_office", "facadewin_glass", "facadewin_flats", "facadewin_civic"]
WINS = []          # every window opening (x0, z0, w, h) in metres, for the interior-mapping mask
# metres covered by one texture (whole bays x whole floors) - FACADE_PHOTOS sizes in konto.html
SIZES = {"office": (12.8, 16.0), "glass": (12.8, 16.8), "flats": (12.4, 12.4), "civic": (14.0, 13.8)}
PX = 2048


def flat_mat(name, col, rough, metal=0.0, emit=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 1.0
    return m


class Room:
    """What is behind one pane: picked per window, so no two rows of the tower look the same."""
    def __init__(self, rng, kind):
        self.blind = rng.random()            # how far the blind is down (0 none .. 1 closed)
        self.lit = rng.random() < (0.55 if kind != "flats" else 0.45)
        warm = rng.random() < (0.35 if kind in ("office", "glass", "civic") else 0.75)
        self.light = (1.0, 0.78, 0.52) if warm else (0.86, 0.92, 1.0)
        self.curtain = kind == "flats" and rng.random() < 0.6
        self.tint = rng.choice([(0.78, 0.76, 0.70), (0.86, 0.84, 0.78), (0.62, 0.64, 0.66), (0.70, 0.62, 0.52)])


def window(x0, z0, w, h, depth, parts, glass, rooms, rng, kind, frame_mat, mull=0):
    """A recessed window opening at (x0..x0+w, z0..z0+h) on the wall plane y=0, rooms behind it at +y."""
    r = Room(rng, kind)
    WINS.append((x0, z0, w, h))
    if os.environ.get("FACADE_ROOMS", "1") == "0":
        # interior mapping draws the rooms in the game: bake only the glass, its frame and the sill
        g = box("glass", (w, 0.02, h), (x0 + w / 2, depth, z0 + h / 2), M_glass())
        glass.append((g, r))
        _frame(x0, z0, w, h, depth, parts, frame_mat, mull)
        return r
    # room box behind (back wall, ceiling with a light strip, floor), seen through the glass
    back = 3.5
    parts.append(box("roomback", (w + 0.6, 0.05, h + 0.6), (x0 + w / 2, back, z0 + h / 2), flat_mat("room_%d" % (rng.random() * 4 // 1), (0.30, 0.29, 0.27), 0.9)))
    parts.append(box("ceiling", (w + 0.6, back, 0.05), (x0 + w / 2, back / 2, z0 + h + 0.15), flat_mat("ceiling", (0.55, 0.55, 0.53), 0.9)))
    lm = flat_mat("lamp_%s" % ("on" if r.lit else "off"), (0.9, 0.9, 0.88), 0.4, emit=r.light if r.lit else None)
    if r.lit:
        lm = flat_mat("lamp_on_%d_%d_%d" % tuple(int(c * 10) for c in r.light), (0.9, 0.9, 0.88), 0.4, emit=r.light)
    parts.append(box("ceilinglight", (w * 0.7, 0.4, 0.03), (x0 + w / 2, back * 0.45, z0 + h + 0.12), lm))
    if r.lit:
        # the lit room glows: a soft back wall in the light colour (what the night map reads)
        parts.append(box("glow", (w + 0.5, 0.04, h + 0.5), (x0 + w / 2, back - 0.05, z0 + h / 2),
                         flat_mat("glow_%d_%d_%d" % tuple(int(c * 10) for c in r.light), tuple(c * 0.5 for c in r.light), 0.9, emit=tuple(c * 0.75 for c in r.light))))
    if kind in ("office", "glass", "civic"):
        parts.append(box("desk", (w * 0.8, 0.8, 0.05), (x0 + w / 2, 1.2, z0 + 0.75), flat_mat("desk", (0.42, 0.40, 0.36), 0.6)))
        parts.append(box("monitor", (0.5, 0.05, 0.32), (x0 + w * 0.4, 1.4, z0 + 1.0), flat_mat("screen", (0.05, 0.06, 0.08), 0.2, emit=(0.25, 0.35, 0.5) if r.lit else None)))
        parts.append(box("partition", (w, 0.05, 1.2), (x0 + w / 2, 1.9, z0 + 0.6), flat_mat("partition", (0.5, 0.52, 0.55), 0.9)))
    if r.blind > 0.25:
        bh = h * min(1.0, r.blind)
        for k in range(int(bh / 0.06)):
            parts.append(box("slat", (w - 0.04, 0.03, 0.045), (x0 + w / 2, 0.12, z0 + h - 0.03 - k * 0.06), flat_mat("blind", (0.80, 0.78, 0.72), 0.7), rot=(0.4, 0, 0)))
    if r.curtain:
        cw = w * (0.25 + 0.3 * rng.random())
        for sx in ((x0 + cw / 2, cw), (x0 + w - cw / 2, cw)):
            parts.append(box("curtain", (sx[1], 0.06, h), (sx[0], 0.25, z0 + h / 2), flat_mat("curtain_%d" % int(r.tint[0] * 10), r.tint, 0.95)))
    # the pane itself (hidden for the colour bake, present for roughness/normal), and the mask/light emitters
    g = box("glass", (w, 0.02, h), (x0 + w / 2, depth, z0 + h / 2), M_glass())
    glass.append((g, r))
    _frame(x0, z0, w, h, depth, parts, frame_mat, mull)
    return r


def _frame(x0, z0, w, h, depth, parts, frame_mat, mull):
    # frame and sill
    fm = frame_mat
    t = 0.05
    parts.append(box("frameL", (t, depth + 0.04, h), (x0 + t / 2, depth / 2, z0 + h / 2), fm))
    parts.append(box("frameR", (t, depth + 0.04, h), (x0 + w - t / 2, depth / 2, z0 + h / 2), fm))
    parts.append(box("frameT", (w, depth + 0.04, t), (x0 + w / 2, depth / 2, z0 + h - t / 2), fm))
    parts.append(box("frameB", (w, depth + 0.04, t), (x0 + w / 2, depth / 2, z0 + t / 2), fm))
    for k in range(1, mull + 1):
        parts.append(box("mull", (0.04, 0.06, h), (x0 + w * k / (mull + 1), depth - 0.02, z0 + h / 2), fm))


def M_glass():
    return flat_mat("pane", (0.03, 0.035, 0.04), 0.04, 0.0)


def build_office(rng, W, H, parts, glass):
    # white precast bands, ribbon windows in 1.6 m bays, aluminium mullions: the 1980s Tokyo office block
    floor = 4.0
    band = M("plaster")
    frame = M("aluminium")
    for f in range(int(H / floor)):
        z = f * floor
        parts.append(box("spandrel", (W, 0.25, 1.45), (W / 2, -0.12, z + 0.72), band, 0.02))
        parts.append(box("drip", (W, 0.32, 0.06), (W / 2, -0.16, z + 1.45), M("concrete")))
        parts.append(box("head", (W, 0.18, 0.35), (W / 2, -0.08, z + floor - 0.17), band, 0.02))
        nb = int(W / 1.6)
        for b in range(nb):
            window(b * 1.6 + 0.05, z + 1.5, 1.5, floor - 1.85, 0.14, parts, glass, None, rng, "office", frame)
        for b in range(nb + 1):
            parts.append(box("mullion", (0.09, 0.2, floor - 1.85), (b * 1.6, -0.02, z + 1.5 + (floor - 1.85) / 2), frame))


def build_glass(rng, W, H, parts, glass):
    # unitised curtain wall: 1.6 m modules, storey-high vision glass over a dark spandrel, pressure caps standing proud
    floor = 4.2
    frame = M("aluminium")
    span = flat_mat("spandrelglass", (0.05, 0.07, 0.09), 0.08, 0.3)
    for f in range(int(H / floor)):
        z = f * floor
        parts.append(box("spandrel", (W, 0.06, 1.1), (W / 2, 0.02, z + 0.55), span))
        nb = int(W / 1.6)
        for b in range(nb):
            window(b * 1.6 + 0.03, z + 1.1, 1.54, floor - 1.12, 0.03, parts, glass, None, rng, "glass", frame)
        parts.append(box("transom", (W, 0.16, 0.07), (W / 2, -0.06, z + 1.1), frame))
        parts.append(box("transom", (W, 0.16, 0.07), (W / 2, -0.06, z), frame))
        for b in range(nb + 1):
            parts.append(box("cap", (0.07, 0.2, floor), (b * 1.6, -0.08, z + floor / 2), frame))


def build_flats(rng, W, H, parts, glass):
    # Japanese mansion: deep balconies with frosted panels and a rail, sliding doors behind, an outdoor unit, laundry
    floor = 3.1
    unit = 6.2
    wall = M("tiles_wall")
    frame = M("aluminium")
    frosted = flat_mat("frosted", (0.62, 0.66, 0.68), 0.35)
    for f in range(int(H / floor)):
        z = f * floor
        parts.append(box("slab", (W, 1.5, 0.22), (W / 2, -0.75, z + 0.11), M("concrete"), 0.02))
        for u in range(int(W / unit)):
            x = u * unit
            parts.append(box("partition", (0.18, 1.5, floor - 0.22), (x + 0.09, -0.75, z + floor / 2 + 0.11), wall))
            # sliding doors (two big panes) and a small window
            window(x + 0.6, z + 0.25, 3.4, 2.1, 0.0, parts, glass, None, rng, "flats", frame, mull=1)
            window(x + 4.4, z + 1.0, 1.2, 1.2, 0.08, parts, glass, None, rng, "flats", frame)
            parts.append(box("wall", (unit, 0.1, floor), (x + unit / 2, 0.05, z + floor / 2), wall))
            # balcony front: frosted panels in a frame and a top rail
            parts.append(box("balcfront", (unit - 0.3, 0.06, 0.95), (x + unit / 2, -1.45, z + 0.22 + 0.5), frosted))
            parts.append(box("rail", (unit - 0.2, 0.08, 0.06), (x + unit / 2, -1.48, z + 1.22), frame))
            for k in range(5):
                parts.append(box("post", (0.05, 0.05, 1.0), (x + 0.2 + k * (unit - 0.4) / 4, -1.47, z + 0.72), frame))
            if rng.random() < 0.8:
                ax = x + 4.9
                parts.append(box("acunit", (0.8, 0.3, 0.6), (ax, -0.4, z + 0.52), M("plastic_white"), 0.02))
                parts.append(cyl("acfan", 0.2, 0.02, (ax - 0.1, -0.56, z + 0.52), M("plastic_grey"), 16, "Y"))
            if rng.random() < 0.55:
                # laundry pole and a few things hung out
                parts.append(cyl("pole", 0.015, unit - 1.0, (x + unit / 2, -1.0, z + 2.3), M("aluminium"), 8, "X"))
                for k in range(int(rng.random() * 5) + 1):
                    c = rng.choice([(0.9, 0.9, 0.88), (0.2, 0.3, 0.5), (0.7, 0.3, 0.3), (0.8, 0.75, 0.6), (0.3, 0.5, 0.35)])
                    parts.append(box("laundry", (0.45 + rng.random() * 0.3, 0.02, 0.5 + rng.random() * 0.3), (x + 1.0 + k * 0.85, -1.0, z + 1.95),
                                     flat_mat("cloth_%d" % int(c[0] * 10 + c[2]), c, 0.95)))
            if rng.random() < 0.3:
                parts.append(box("futon", (1.6, 0.06, 0.5), (x + 2.2, -1.5, z + 1.25), flat_mat("futon", (0.85, 0.8, 0.75), 0.95), rot=(0.2, 0, 0)))


def build_civic(rng, W, H, parts, glass):
    # stone-clad civic block: rusticated panels, deep punched windows with stone surrounds
    floor = 4.6
    stone = M("concrete")
    frame = M("paint_black")
    for f in range(int(H / floor)):
        z = f * floor
        for k in range(int(floor / 0.92)):
            parts.append(box("course", (W, 0.12, 0.88), (W / 2, -0.06, z + 0.46 + k * 0.92), stone, 0.015))
        nb = int(W / 3.5)
        for b in range(nb):
            x = b * 3.5 + 0.9
            parts.append(box("cut", (1.7, 0.2, 2.6), (x + 0.85, -0.2, z + 1.0 + 1.3), stone))
            window(x, z + 1.0, 1.7, 2.6, 0.35, parts, glass, None, rng, "civic", frame, mull=1)
            parts.append(box("sill", (2.0, 0.3, 0.1), (x + 0.85, -0.2, z + 0.95), M("concrete_dark"), 0.02))
            parts.append(box("lintel", (2.0, 0.2, 0.25), (x + 0.85, -0.15, z + 3.72), M("concrete_dark"), 0.02))


BUILDERS = {"office": build_office, "glass": build_glass, "flats": build_flats, "civic": build_civic}


def bake(target, objs, kind, px, margin=4, samples=1):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = samples
    img = bpy.data.images.new("bake_" + kind, px, px, alpha=False, float_buffer=kind in ("NORMAL",))
    if kind != "NORMAL":
        img.colorspace_settings.name = "Non-Color" if kind in ("ROUGHNESS", "AO") else "sRGB"
    else:
        img.colorspace_settings.name = "Non-Color"
    nt = target.data.materials[0].node_tree
    for n in nt.nodes:
        n.select = False
    tn = nt.nodes.get("bake_tex") or nt.nodes.new("ShaderNodeTexImage")
    tn.name = "bake_tex"; tn.image = img; tn.select = True; nt.nodes.active = tn
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bk = sc.render.bake
    bk.use_selected_to_active = True
    bk.cage_extrusion = 4.5
    bk.max_ray_distance = 9.0
    bk.margin = margin
    kw = {}
    if kind == "DIFFUSE":
        bk.use_pass_direct = False; bk.use_pass_indirect = False; bk.use_pass_color = True
    if kind == "NORMAL":
        bk.normal_space = "TANGENT"
    bpy.ops.object.bake(type=kind)
    a = np.array(img.pixels[:], np.float32).reshape(px, px, 4)[::-1, :, :3]
    return a


def save(a, path, srgb_already=True):
    from PIL import Image
    a = np.clip(a, 0, 1)
    Image.fromarray((a * 255 + 0.5).astype(np.uint8)).save(path, quality=90)


def write_winmask(style, W, H, px=1024):
    """_win.png, what the game's interior mapping reads: in each window opening R,G = where in the opening (u across,
    v up, 0..1 at the texel centre), B,A = the opening's width and height (/ 6.4 m). A = 0 off the glass."""
    from PIL import Image
    a = np.zeros((px, px, 4), np.float32)
    xs = (np.arange(px) + 0.5) / px * W
    zs = H - (np.arange(px) + 0.5) / px * H
    X, Z = np.meshgrid(xs, zs)
    for x0, z0, w, h in WINS:
        m = (X >= x0) & (X < x0 + w) & (Z >= z0) & (Z < z0 + h)
        a[m, 0] = (X[m] - x0) / w
        a[m, 1] = (Z[m] - z0) / h
        a[m, 2] = w / 6.4
        a[m, 3] = h / 6.4
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(OUT, style + "_win.png"), optimize=True)
    print("  -> Web/art/facades/%s_win.png (%d openings)" % (style, len(WINS)))


def build(which):
    style = which.split("_", 1)[1]
    W, H = SIZES[style]
    rng = random.Random(sum(map(ord, style)))
    parts, glass = [], []
    WINS.clear()
    BUILDERS[style](rng, W, H, parts, glass)
    os.makedirs(OUT, exist_ok=True)
    write_winmask(style, W, H)
    if which.startswith("facadewin_"):
        return
    for p in parts + [g for g, _ in glass]:
        if p.modifiers:
            apply_all(p)
    export.world_uv_all(parts)
    # the low plane the maps are baked onto: x 0..W, z 0..H at y = -1.6 (in front of everything), facing -y
    import bmesh
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in [(0, -1.6, 0), (W, -1.6, 0), (W, -1.6, H), (0, -1.6, H)]]
    f = bm.faces.new(vs)
    uv = bm.loops.layers.uv.new("UVMap")
    for l, c in zip(f.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        l[uv].uv = c
    bm.normal_update()
    me = bpy.data.meshes.new("target"); bm.to_mesh(me); bm.free()
    target = bpy.data.objects.new("target", me); bpy.context.scene.collection.objects.link(target)
    tm = bpy.data.materials.new("target"); tm.use_nodes = True; me.materials.append(tm)
    if target.data.polygons[0].normal.y > 0:
        target.data.flip_normals()
    sc = bpy.context.scene
    world = bpy.data.worlds.new("w"); sc.world = world
    os.makedirs(OUT, exist_ok=True)
    panes = [g for g, _ in glass]
    # colour: glass out of the way, so the rays see the rooms; then dim the rooms as glass would and add AO
    for g in panes:
        g.hide_render = True
    # the colour pass reads a metal as black (it has no diffuse): bake every material as a dielectric for it
    saved = []
    for mt in bpy.data.materials:
        b = mt.node_tree and mt.node_tree.nodes.get("Principled BSDF")
        if not b:
            continue
        inp = b.inputs["Metallic"]
        links = [(l.from_socket, l.to_socket) for l in inp.links]
        saved.append((mt, inp.default_value, links))
        for l in list(inp.links):
            mt.node_tree.links.remove(l)
        inp.default_value = 0.0
    col = bake(target, parts, "DIFFUSE", PX)
    for mt, v, links in saved:
        b = mt.node_tree.nodes.get("Principled BSDF")
        b.inputs["Metallic"].default_value = v
        for fs, ts in links:
            mt.node_tree.links.new(fs, ts)
    ao = bake(target, parts, "AO", PX, samples=24)
    for g in panes:
        g.hide_render = False
    # masks: every pane white (where the windows are) and the lit panes in their light colour
    for g, r in glass:
        g.data.materials.clear(); g.data.materials.append(flat_mat("mask_on", (0, 0, 0), 1.0, emit=(1, 1, 1)))
    hide = [p for p in parts]
    mask = bake(target, panes, "EMIT", PX)[..., 0]
    for g, r in glass:
        g.data.materials.clear()
        g.data.materials.append(flat_mat("lit_%d_%d_%d" % tuple(int(c * 10) for c in r.light), (0, 0, 0), 1.0, emit=r.light) if r.lit else flat_mat("mask_off", (0, 0, 0), 1.0))
    lights = bake(target, panes, "EMIT", PX)
    for g in panes:
        g.data.materials.clear(); g.data.materials.append(M_glass())
    rough = bake(target, parts + panes, "ROUGHNESS", PX)[..., 0]
    nor = bake(target, parts + panes, "NORMAL", PX)
    # compose: daylight colour = rooms behind glass dimmed and cooled, everything else with its cavity AO
    m = mask[..., None]
    sky = np.array([0.23, 0.27, 0.31])
    glassy = col * 0.42 + sky * 0.18
    out = (col * (0.55 + 0.45 * ao)) * (1 - m) + glassy * m
    # the lit map: room light seen through the glass, with the warm/cool colour and a falloff from the ceiling
    lit = lights * (0.75 + 0.25 * col.mean(-1, keepdims=True))
    save(out, os.path.join(OUT, style + "_color.jpg"))
    save(nor, os.path.join(OUT, style + "_normal.jpg"))
    save(np.repeat(rough[..., None], 3, -1), os.path.join(OUT, style + "_rough.jpg"))
    save(lit, os.path.join(OUT, style + "_lights.jpg"))
    print("  -> Web/art/facades/%s_{color,normal,rough,lights}.jpg  (%.1f x %.1f m, %d windows, %d lit)" % (style, W, H, len(glass), sum(1 for _, r in glass if r.lit)))
