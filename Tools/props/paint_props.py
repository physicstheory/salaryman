"""Paint every street-prop texture slot as a full PBR set, replacing the flat procedural stand-ins.

    /home/claude/bvenv/bin/python Tools/props/paint_props.py [slot ...]      (bpy + numpy + pillow)

Three kinds of slot (Web/art/props/slots.json):
  surfaces   tiling materials (wood, galvanised steel, paint, rubber, concrete, leather, bark) from the Foundry's
             numpy recipes (Tools/foundry/lib/texgen.py), then weathered: dust settling in, grime collecting low,
             scratches through the coat, sun fade, all tileable.
  rendered   leaves, shrubs and the vending machine's drinks window are rendered in Cycles from real geometry
             (leaf cards scattered in depth, bottles and cans on lit shelves) straight down an orthographic camera.
  pictures   signs, bands, labels and grilles keep the layout the engine's UVs expect (the stand-in's drawing) and
             get a real material under them: film grain, reflective bead texture, scuffs, dirt in the low edge.
Writes <slot>.jpg, <slot>_nor.jpg, <slot>_rough.jpg (no stand-in mark), at 1024 px or the slot's size if larger.
"""
import os, sys, math, json
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "Tools", "foundry", "lib"))
sys.path.insert(0, os.path.join(ROOT, "Tools", "props"))
import texgen as T
import make_prop_maps as MP

DIR = os.path.join(ROOT, "Web", "art", "props")
S = MP.slots()


def lin2srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def srgb2lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def tile_grad(n):
    """0 at the top of the image, 1 at the bottom (for grime that collects low on wrap/face slots)."""
    return np.repeat(np.linspace(0, 1, n)[:, None], n, 1)


def weather(c, h, r, n, seed, dust=0.25, grime_low=0.0, scratch=0.0, fade=0.0, tile=True):
    """Common wear on linear albedo c (n,n,3), height h, roughness r."""
    d = np.clip(T.fbm(n, seed + 50, 3, 6) * 0.5 + 0.5, 0, 1)
    spots = np.clip(0.05 - T.cells(n, seed + 51, 90), 0, 1) / 0.05
    dustcol = T.hexlin("#8a8174")[None, None, :]
    k = (dust * (d ** 2.2) + 0.25 * dust * spots)[..., None]
    if grime_low:
        g = tile_grad(n) ** 3 * (0.6 + 0.4 * d)
        k = k + (grime_low * g)[..., None]
        dustcol = dustcol * 0.7
    c = c * (1 - k) + dustcol * k
    r = r + 0.25 * k[..., 0]
    if scratch:
        sc = T.scratches(n, seed + 52, int(120 * scratch), 0.12)
        c = c * (1 - 0.35 * sc[..., None] * scratch) + 0.25 * sc[..., None] * scratch * T.hexlin("#9a9a96")[None, None, :]
        h = h - sc * 0.6 * scratch
        r = r + 0.15 * sc
    if fade:
        f = np.clip(T.fbm(n, seed + 53, 1, 3) * 0.5 + 0.5, 0, 1)[..., None] * fade
        grey = c.mean(-1, keepdims=True)
        c = c * (1 - f) + (grey * 1.15 + 0.03) * f
    return c, h, r


def write(sid, c_lin, h, r, metal_like=False):
    s = S[sid]
    alb = lin2srgb(c_lin)
    MP.save(os.path.join(DIR, sid + ".jpg"), alb, False)
    h = h - h.min()
    h = h / max(1e-6, h.max())
    MP.maps_for(sid, s, alb, h, np.clip(r, 0.04, 1.0), False)
    print("  painted", sid, alb.shape)


def size_of(sid):
    return max(1024, int(S[sid].get("size", 512)))


# ---- surfaces ------------------------------------------------------------------------------------------------
def planks(n, seed, col, count, rough, gap=0.006, worn=0.4):
    c, h, r, _ = T.r_wood(n, seed, col=col, rough=rough, rings=10)
    yy = np.mgrid[0:n, 0:n][0] / n
    edge = np.abs(((yy * count) % 1) - 0.5) * 2         # 1 at a seam
    seam = np.clip((edge - (1 - gap * count * 2)) / (gap * count * 2), 0, 1)
    # each board its own shade and grain offset
    board = np.floor(yy * count).astype(int)
    rng = np.random.default_rng(seed)
    shade = rng.uniform(0.82, 1.12, count + 1)[board]
    c = c * shade[..., None] * (1 - 0.75 * seam[..., None])
    h = h - seam * 2.0
    knots = np.clip(0.025 - T.cells(n, seed + 9, 6), 0, 1) / 0.025
    c = c * (1 - 0.45 * knots[..., None])
    return weather(c, h, r + 0.2 * seam, n, seed, dust=worn, scratch=0.4)


def galv(n, seed, col):
    c, h, r, _ = T.r_brushed(n, seed, col=col, rough=0.45)
    sp = T.cells(n, seed + 5, 140)                      # hot-dip spangle: crystals of slightly different sheen
    cell_id = np.floor(T.fbm(n, seed + 6, 12, 2) * 6)
    c = c * (0.94 + 0.06 * np.cos(cell_id * 2.1))[..., None]
    r = r + 0.08 * np.sin(cell_id * 1.7)
    wh = np.clip(T.fbm(n, seed + 7, 3, 5), 0, 1)        # white rust bloom
    c = c * (1 - 0.3 * wh[..., None]) + 0.3 * wh[..., None] * T.hexlin("#c9c6bd")[None, None, :]
    return weather(c, h + 0.1 * sp, r + 0.2 * wh, n, seed, dust=0.3, scratch=0.3)


def bark(n, seed, col):
    v = T.fnoise(n, seed, 2, 30, aniso=(1, 8))
    ridges = np.abs(T.fnoise(n, seed + 1, 4, 18, aniso=(1, 5)))
    cracks = np.clip(0.18 - ridges, 0, 1) / 0.18
    h = v * 0.5 - cracks * 1.5 + T.fnoise(n, seed + 2, 60, 200) * 0.15
    base = T.hexlin(col)[None, None, :]
    lichen = np.clip(T.fbm(n, seed + 3, 3, 5) - 0.25, 0, 1)
    c = base * (0.8 + 0.25 * v[..., None]) * (1 - 0.6 * cracks[..., None])
    c = c * (1 - lichen[..., None]) + lichen[..., None] * T.hexlin("#7d8466")[None, None, :]
    return c, h, 0.85 + 0.1 * cracks


SURF = {
    "cone_base": lambda n: weather(*T.r_rubber(n, 11, "#26262a", 0.9)[:3], n, 11, dust=0.6),
    "bin_lid": lambda n: weather(*T.r_plastic(n, 12, "#2a2a2e", 0.5)[:3], n, 12, dust=0.4, scratch=0.5, fade=0.15),
    "crate_wood": lambda n: planks(n, 13, "#9a7650", 5, 0.8, worn=0.5),
    "pallet_wood": lambda n: planks(n, 14, "#a88660", 6, 0.85, gap=0.012, worn=0.6),
    "barrier_frame": lambda n: galv(n, 15, "#9ea2a6"),
    "barrier_foot": lambda n: weather(*T.r_rubber(n, 16, "#202022", 0.92)[:3], n, 16, dust=0.7),
    "bicycle_frame": lambda n: weather(*T.r_paint(n, 17, "#c8c8c8", 0.4, peel=0.4, wear=0.5)[:3], n, 17, dust=0.15, scratch=0.5),
    "bicycle_steel": lambda n: weather(*T.r_brushed(n, 18, "#b8bcc0", 0.3)[:3], n, 18, dust=0.2, scratch=0.3),
    "bicycle_saddle": lambda n: weather(*T.r_leather(n, 19, "#2b2522", 0.55)[:3], n, 19, dust=0.15, scratch=0.3, fade=0.2),
    "vending_body": lambda n: weather(*T.r_paint(n, 20, "#c8c8c8", 0.45, peel=0.3, wear=0.3)[:3], n, 20, dust=0.2, grime_low=0.5, scratch=0.3),
    "vending_trim": lambda n: weather(*T.r_brushed(n, 21, "#8e9296", 0.36)[:3], n, 21, dust=0.3, scratch=0.4),
    "bench_wood": lambda n: planks(n, 22, "#8a6440", 4, 0.75, worn=0.4),
    "bench_iron": lambda n: weather(*T.r_paint(n, 23, "#2f3236", 0.55, peel=0.8, wear=0.6)[:3], n, 23, dust=0.3, scratch=0.5),
    "bollard_cap": lambda n: weather(*T.r_paint(n, 24, "#d0a01a", 0.4, peel=0.5, wear=0.6)[:3], n, 24, dust=0.3, scratch=0.6),
    "lamp_pole": lambda n: weather(*T.r_paint(n, 25, "#6a6e72", 0.5, peel=0.6, wear=0.3)[:3], n, 25, dust=0.3, grime_low=0.3, scratch=0.3),
    "lamp_head": lambda n: weather(*T.r_paint(n, 26, "#4a4c50", 0.5, peel=0.5, wear=0.3)[:3], n, 26, dust=0.35, scratch=0.2),
    "pole_concrete": lambda n: weather(*T.r_concrete(n, 27, "#a29e96", 0.9)[:3], n, 27, dust=0.4, grime_low=0.4),
    "pole_metal": lambda n: galv(n, 28, "#8a8e92"),
    "tree_bark": lambda n: bark(n, 29, "#5a4636"),
    "planter_box": lambda n: weather(*T.r_concrete(n, 30, "#8d8a84", 0.9)[:3], n, 30, dust=0.45, grime_low=0.5),
    "signpost_pole": lambda n: galv(n, 31, "#a0a4a8"),
    "sign_back": lambda n: galv(n, 32, "#9a9ea2"),
    "ac_body": lambda n: weather(*T.r_paint(n, 33, "#dedcd6", 0.5, peel=0.3, wear=0.2)[:3], n, 33, dust=0.35, grime_low=0.6, scratch=0.2),
    "ac_fins": lambda n: weather(*T.r_ribbed(n, 34, "#9a9c9e", 0.35, ribs=48)[:3], n, 34, dust=0.45),
}


# ---- pictures: the stand-in's drawing (the UV layout) under a real material ---------------------------------------
PICT = {  # sid: (material recipe for the micro surface, dust, grime_low, scratch, fade, retroreflective)
    "cone_body": ("plastic", 0.25, 0.8, 0.5, 0.15, True),
    "bin_body": ("plastic", 0.25, 0.7, 0.5, 0.2, False),
    "bin_label": ("plastic", 0.2, 0.2, 0.4, 0.25, False),
    "barrier_panel": ("plastic", 0.3, 0.5, 0.5, 0.2, True),
    "bicycle_tyre": ("rubber", 0.5, 0.0, 0.0, 0.0, False),
    "bicycle_basket": ("brushed", 0.3, 0.2, 0.3, 0.0, False),
    "vending_panel": ("plastic", 0.15, 0.3, 0.4, 0.1, False),
    "bollard_body": ("brushed", 0.3, 0.6, 0.5, 0.0, False),
    "lamp_lens": ("plastic", 0.25, 0.0, 0.1, 0.0, False),
    "pole_guard": ("plastic", 0.3, 0.7, 0.5, 0.2, True),
    "pole_plate": ("paint", 0.3, 0.4, 0.3, 0.3, False),
    "tree_grate": ("brushed", 0.5, 0.0, 0.3, 0.0, False),
    "sign_face": ("paint", 0.2, 0.1, 0.3, 0.2, True),
    "ac_grille": ("paint", 0.35, 0.2, 0.2, 0.0, False),
    "ball_skin": ("leather", 0.3, 0.3, 0.5, 0.0, False),
}


def picture(sid, n):
    s = S[sid]
    rng = np.random.default_rng(abs(hash(sid)) % (2 ** 32))
    alb, h0, r0 = MP.placeholder(sid, dict(s, size=n))
    alb = np.asarray(Image.fromarray((np.clip(alb, 0, 1) * 255).astype(np.uint8)).resize((n, n), Image.LANCZOS), dtype=float) / 255
    h0 = np.asarray(Image.fromarray((np.clip(h0, 0, 1) * 255).astype(np.uint8)).resize((n, n), Image.LANCZOS), dtype=float) / 255
    r0 = np.asarray(Image.fromarray((np.clip(r0, 0, 1) * 255).astype(np.uint8)).resize((n, n), Image.LANCZOS), dtype=float) / 255
    # soften the vector edges the way print and moulding do
    alb = np.asarray(Image.fromarray((alb * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(n / 1400)), dtype=float) / 255
    rec, dust, low, scr, fade, beads = PICT[sid]
    _, mh, mr, _ = T.RECIPES[rec](n, 40 + len(sid))
    c = srgb2lin(alb)
    h = h0 * 1.0 + mh * 0.25
    r = r0 * 0.6 + mr * 0.4
    if beads:  # retroreflective sheeting: a fine honeycomb sparkle in the white/bright areas
        b = T.cells(n, 77, 9000)
        bright = (alb.mean(-1) > 0.6).astype(float)
        c = c * (1 - 0.08 * bright[..., None] * (b[..., None] / max(1e-6, b.max())))
        r = r - 0.1 * bright
    c, h, r = weather(c, h, r, n, 60 + len(sid), dust=dust, grime_low=low, scratch=scr, fade=fade)
    return c, h, r


# ---- rendered in Cycles ---------------------------------------------------------------------------------------
def cycles_scene(px):
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = px
    sc.view_settings.view_transform = "Standard"
    sc.render.film_transparent = False
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = 1.0; cam.location = (0.5, 0.5, 5); cam.rotation_euler = (0, 0, 0)
    return bpy, sc


def principled(bpy, name, col, rough=0.5, metal=0.0, emit=None, trans=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if trans: b.inputs["Transmission Weight"].default_value = trans
    if emit:
        b.inputs["Emission Color"].default_value = (*emit[0], 1); b.inputs["Emission Strength"].default_value = emit[1]
    return m


def _render_arrays(bpy, sc, px):
    """Beauty under flat white light is the albedo; a second render with a top-down ramp material is the height."""
    import tempfile
    tmp = tempfile.mkdtemp()
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_depth = "16"
    sc.view_settings.view_transform = "Standard"
    sc.render.filepath = os.path.join(tmp, "a.png"); bpy.ops.render.render(write_still=True)
    a = np.asarray(Image.open(sc.render.filepath).convert("RGB"), dtype=float) / 255
    # height: every material swapped for an emission of world Z
    hm = bpy.data.materials.new("H"); hm.use_nodes = True
    nt = hm.node_tree; nt.nodes.clear()
    geo = nt.nodes.new("ShaderNodeNewGeometry"); sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange"); em = nt.nodes.new("ShaderNodeEmission"); out = nt.nodes.new("ShaderNodeOutputMaterial")
    mr.inputs["From Min"].default_value = -0.05; mr.inputs["From Max"].default_value = 0.12
    nt.links.new(geo.outputs["Position"], sep.inputs[0]); nt.links.new(sep.outputs["Z"], mr.inputs[0])
    nt.links.new(mr.outputs[0], em.inputs[0]); nt.links.new(em.outputs[0], out.inputs[0])
    for o in sc.objects:
        if o.type == "MESH":
            o.data.materials.clear(); o.data.materials.append(hm)
            for ms in o.material_slots: ms.material = hm
    sc.world.node_tree.nodes["Background"].inputs[1].default_value = 0.0
    sc.cycles.samples = 8; sc.cycles.use_denoising = False
    sc.render.filepath = os.path.join(tmp, "h.png"); bpy.ops.render.render(write_still=True)
    h = np.asarray(Image.open(sc.render.filepath).convert("L"), dtype=float) / 255
    return srgb2lin(a), h


def leaves(sid, n, col, density):
    bpy, sc = cycles_scene(n)
    import bmesh
    rng = np.random.default_rng(len(sid) * 7)
    base = T.hexlin(col)
    ground = principled(bpy, "under", tuple(base * 0.18), 0.9)
    bpy.ops.mesh.primitive_plane_add(size=3, location=(0.5, 0.5, -0.06)); bpy.context.object.data.materials.append(ground)
    mats = [principled(bpy, "leaf%d" % i, tuple(np.clip(base * rng.uniform(0.6, 1.35) * np.array([rng.uniform(0.9, 1.1), 1, rng.uniform(0.8, 1.1)]), 0, 1)), 0.55) for i in range(8)]
    # one leaf mesh: a pointed ellipse, slightly folded along the midrib
    me = bpy.data.meshes.new("leaf"); bm = bmesh.new()
    pts = [(0, 0, 0)] + [(math.sin(t) * 0.5 * (1 - abs(math.cos(t)) ** 3) ** 0.5, 0.5 - 0.5 * math.cos(t), 0) for t in np.linspace(0.15, math.pi - 0.15, 7)] + [(0, 1, 0)] \
        + [(-math.sin(t) * 0.5 * (1 - abs(math.cos(t)) ** 3) ** 0.5, 0.5 - 0.5 * math.cos(t), 0) for t in np.linspace(math.pi - 0.15, 0.15, 7)]
    vs = [bm.verts.new(p) for p in pts]; c0 = bm.verts.new((0, 0.5, 0.06))
    for i in range(len(vs)): bm.faces.new((c0, vs[i], vs[(i + 1) % len(vs)]))
    bm.to_mesh(me); bm.free()
    count = int(density)
    for i in range(count):
        o = bpy.data.objects.new("l", me); sc.collection.objects.link(o)
        s = rng.uniform(0.035, 0.06)
        x, y = rng.random(), rng.random()
        o.location = (x, y, rng.uniform(-0.04, 0.1)); o.scale = (s * 0.55, s, s)
        o.rotation_euler = (rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), rng.uniform(0, 6.283))
        o.active_material = mats[i % len(mats)]; o.material_slots[0].link = "OBJECT"; o.material_slots[0].material = mats[i % len(mats)]
        # tile: the canopy wraps, so copies of leaves near an edge go on the other side too
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if (dx or dy) and (x + dx * 1.0 > -0.08 and x + dx < 1.08) and (y + dy > -0.08 and y + dy < 1.08):
                    o2 = o.copy(); o2.location = (x + dx, y + dy, o.location.z); sc.collection.objects.link(o2)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.0; sun.rotation_euler = (0.35, 0.2, 0); sc.collection.objects.link(sun)
    a, h = _render_arrays(bpy, sc, n)
    r = 0.6 + 0.3 * (1 - h)
    return a, h, r


def vending(sid, n):
    bpy, sc = cycles_scene(n)
    rng = np.random.default_rng(5)
    back = principled(bpy, "back", (0.9, 0.92, 0.94), 0.4, emit=((0.95, 0.97, 1.0), 0.6))
    bpy.ops.mesh.primitive_plane_add(size=2, location=(0.5, 0.5, -0.1)); bpy.context.object.data.materials.append(back)
    shelf = principled(bpy, "shelf", (0.75, 0.76, 0.78), 0.3, 0.8)
    btn = principled(bpy, "btn", (0.15, 0.4, 0.95), 0.3, emit=((0.2, 0.5, 1.0), 2.0))
    btn_r = principled(bpy, "btnr", (0.9, 0.12, 0.1), 0.3, emit=((1.0, 0.15, 0.1), 2.0))
    price = principled(bpy, "price", (0.05, 0.05, 0.05), 0.4, emit=((1.0, 0.3, 0.1), 1.2))
    livery = [(0.85, 0.1, 0.1), (0.1, 0.35, 0.8), (0.95, 0.75, 0.1), (0.1, 0.55, 0.25), (0.95, 0.95, 0.95), (0.55, 0.32, 0.15), (0.95, 0.45, 0.1), (0.1, 0.1, 0.1), (0.6, 0.85, 0.95)]
    labs = [principled(bpy, "lab%d" % i, c, 0.25) for i, c in enumerate(livery)]
    cap = principled(bpy, "cap", (0.85, 0.85, 0.85), 0.3, 0.9)
    pet = principled(bpy, "pet", (0.78, 0.84, 0.88), 0.12)
    rows, cols = 3, 10
    for r in range(rows):
        y0 = 1 - (r + 1) / rows + 0.06
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0.5, y0 - 0.025, 0.0)); o = bpy.context.object; o.scale = (1.0, 0.018, 0.12); o.data.materials.append(shelf)
        for k in range(cols):
            x = (k + 0.5) / cols
            lab = labs[int(rng.integers(len(labs)))]
            tall = rng.random() < 0.55
            hgt = 0.2 if tall else 0.13
            bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.034, depth=hgt, location=(x, y0 + hgt / 2, 0.0), rotation=(math.pi / 2, 0, 0))
            o = bpy.context.object; o.data.materials.append(pet if tall else cap); o.data.materials.append(lab)
            for p in o.data.polygons:   # the label band round the middle (and the whole side of a can)
                if abs(p.normal.z) < 0.5 and (abs(p.center.z) < hgt * 0.3 or not tall): p.material_index = 1
            if tall:
                bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.016, depth=0.03, location=(x, y0 + hgt + 0.015, 0.0), rotation=(math.pi / 2, 0, 0))
                bpy.context.object.data.materials.append(labs[int(rng.integers(len(labs)))])
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x - 0.012, y0 - 0.045, 0.06)); o = bpy.context.object; o.scale = (0.05, 0.02, 0.01); o.data.materials.append(price)
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.011, depth=0.01, location=(x + 0.03, y0 - 0.045, 0.06)); bpy.context.object.data.materials.append(btn_r if rng.random() < 0.3 else btn)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 1.3; sun.rotation_euler = (0.25, 0.0, 0); sc.world.node_tree.nodes["Background"].inputs[1].default_value = 0.35; sc.collection.objects.link(sun)
    a, h = _render_arrays(bpy, sc, n)
    return a, h, 0.25 + 0.2 * (1 - h)


RENDER = {
    "tree_leaves": lambda n: leaves("tree_leaves", n, "#4a6e34", 2600),
    "planter_shrub": lambda n: leaves("planter_shrub", n, "#3e6a30", 3400),
    "vending_front": lambda n: vending("vending_front", n),
}


def main(argv):
    want = [a for a in argv if not a.startswith("--")] or list(S.keys())
    for sid in want:
        n = size_of(sid)
        if sid in SURF:
            c, h, r = SURF[sid](n)
        elif sid in PICT:
            c, h, r = picture(sid, n)
        elif sid in RENDER:
            c, h, r = RENDER[sid](n)
        else:
            print("  (no recipe for %s)" % sid); continue
        write(sid, np.asarray(c, dtype=float), np.asarray(h, dtype=float), np.asarray(r, dtype=float))


if __name__ == "__main__":
    main(sys.argv[1:])
