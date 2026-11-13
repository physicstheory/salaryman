"""Rooftop kit: what a Tokyo roof actually carries, seen from a skyscraper or a helicopter.

Each piece is built at real size, sits on z = 0 and faces three.js +Z. foundry-hook.js scatters them over every flat
city roof (instanced, chunked, streamed): chillers and condenser banks on offices, elevated water tanks and lift motor
rooms on flats, cooling towers and antenna masts on towers, a helipad on the tallest, solar on the low ones, and a
parapet rail round each edge.
"""
import math
import bpy

from core import box, cyl, join, apply_all, from_pydata, sphere
import mats
import export

M = mats.get
TARGETS = ["roof_chiller", "roof_condensers", "roof_watertank", "roof_liftroom", "roof_coolingtower", "roof_mast",
           "roof_solar", "roof_helipad", "roof_vents", "roof_billboard"]


def chiller(p):
    # packaged air-cooled chiller: louvred casing, six fans on top, pipework to the roof
    p.append(box("case", (2.2, 4.6, 1.9), (0, 0, 1.15), M("powder_grey"), 0.03))
    for s in (-1, 1):
        for k in range(14):
            p.append(box("louvre", (0.03, 4.3, 0.05), (s * 1.115, 0, 0.4 + k * 0.105), M("galvanised")))
    for i in range(3):
        for j in (-1, 1):
            y = -1.45 + i * 1.45
            p.append(cyl("fanring", 0.6, 0.18, (j * 0.55, y, 2.18), M("galvanised"), 28))
            p.append(cyl("fan", 0.55, 0.04, (j * 0.55, y, 2.2), M("plastic_black"), 28))
            p.append(cyl("hubcap", 0.12, 0.08, (j * 0.55, y, 2.24), M("galvanised"), 12))
            for b in range(5):
                p.append(box("guard", (1.1, 0.02, 0.02), (j * 0.55, y, 2.29), M("cast_iron"), rot=(0, 0, b * math.pi / 5)))
    p.append(box("plinth", (2.6, 5.0, 0.2), (0, 0, 0.1), M("concrete")))
    p.append(cyl("pipe", 0.1, 1.2, (0.7, -2.7, 0.6), M("paint_grey"), 14, "Y"))
    p.append(cyl("pipe", 0.1, 1.2, (-0.7, -2.7, 0.6), M("paint_grey"), 14, "Y"))
    p.append(box("panel", (0.5, 0.25, 0.8), (0.8, 2.45, 0.9), M("powder_grey"), 0.02))


def condensers(p):
    # a steel rack of split-system condensers: the white boxes every Japanese building wears
    p.append(box("rackfoot", (3.4, 0.08, 0.1), (0, -0.5, 0.05), M("galvanised")))
    p.append(box("rackfoot", (3.4, 0.08, 0.1), (0, 0.5, 0.05), M("galvanised")))
    for k in range(4):
        x = -1.25 + k * 0.84
        p.append(box("unit", (0.78, 0.32, 0.62), (x, 0, 0.45), M("plastic_white"), 0.02))
        p.append(cyl("grille", 0.22, 0.02, (x - 0.1, -0.165, 0.45), M("cast_iron"), 20, "Y"))
        for g in range(5):
            p.append(box("bar", (0.46, 0.012, 0.012), (x - 0.1, -0.17, 0.3 + g * 0.07), M("cast_iron")))
        p.append(box("fins", (0.2, 0.02, 0.5), (x + 0.25, 0.16, 0.45), M("aluminium")))
        p.append(cyl("line", 0.015, 0.6, (x + 0.3, -0.05, 0.75), M("rubber"), 8))
    p.append(box("duct", (3.0, 0.12, 0.08), (0, 0.2, 0.9), M("plastic_white"), 0.02))


def watertank(p):
    # the elevated FRP panel tank on a steel stand
    p.append(box("tank", (2.4, 2.4, 1.8), (0, 0, 2.3), M("plastic_white"), 0.04))
    for k in range(1, 4):
        p.append(box("panelseam", (2.42, 0.03, 1.8), (0, -1.2 + k * 0.6, 2.3), M("plastic_grey")))
        p.append(box("panelseam", (0.03, 2.42, 1.8), (-1.2 + k * 0.6, 0, 2.3), M("plastic_grey")))
    p.append(box("hatch", (0.6, 0.6, 0.1), (0.6, 0.6, 3.25), M("plastic_grey"), 0.02))
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(box("leg", (0.12, 0.12, 1.4), (sx * 1.1, sy * 1.1, 0.7), M("paint_grey")))
    for s in (-1, 1):
        p.append(box("brace", (2.3, 0.06, 0.06), (0, s * 1.1, 0.7), M("paint_grey"), rot=(0, 0.5, 0)))
        p.append(box("brace", (0.06, 2.3, 0.06), (s * 1.1, 0, 0.7), M("paint_grey"), rot=(0.5, 0, 0)))
    p.append(box("deck", (2.6, 2.6, 0.08), (0, 0, 1.38), M("galvanised")))
    for k in range(6):
        p.append(box("ladder", (0.45, 0.03, 0.03), (0, -1.32, 0.2 + k * 0.4), M("galvanised")))
    for s in (-1, 1):
        p.append(box("ladderrail", (0.04, 0.04, 2.6), (s * 0.22, -1.32, 1.3), M("galvanised")))
    p.append(cyl("pipe", 0.06, 1.5, (0.9, 0, 0.7), M("paint_grey"), 10))


def liftroom(p):
    # the lift machine room / stair head: a concrete box with a steel door, louvres and a lamp
    p.append(box("room", (4.2, 3.6, 3.0), (0, 0, 1.5), M("concrete"), 0.02))
    p.append(box("cap", (4.4, 3.8, 0.15), (0, 0, 3.07), M("concrete_dark"), 0.02))
    p.append(box("door", (0.9, 0.06, 2.0), (-0.9, -1.82, 1.0), M("paint_grey"), 0.01))
    p.append(box("handle", (0.12, 0.05, 0.03), (-0.6, -1.86, 1.0), M("chrome")))
    p.append(box("louvre", (1.2, 0.06, 0.8), (0.9, -1.82, 2.2), M("galvanised"), 0.01))
    for k in range(6):
        p.append(box("blade", (1.1, 0.08, 0.02), (0.9, -1.86, 1.9 + k * 0.12), M("galvanised"), rot=(0.6, 0, 0)))
    p.append(box("lamp", (0.2, 0.12, 0.12), (-0.9, -1.88, 2.2), M("light_panel")))
    p.append(box("step", (1.2, 0.5, 0.18), (-0.9, -2.05, 0.09), M("concrete")))
    p.append(box("vent", (0.6, 0.6, 0.5), (1.0, 0.8, 3.4), M("galvanised"), 0.02))
    p.append(cyl("rooflight", 0.18, 0.1, (-1.0, 0.8, 3.2), M("plastic_white"), 14))
    for s in (-1, 1):
        p.append(cyl("conduit", 0.03, 2.8, (s * 2.12, 1.0, 1.5), M("galvanised"), 8))


def coolingtower(p):
    # round FRP cooling tower: the shape that dots Tokyo office roofs
    p.append(cyl("body", 1.6, 2.4, (0, 0, 1.6), M("plastic_white"), 40, r2=1.4))
    p.append(cyl("top", 1.45, 0.4, (0, 0, 3.0), M("plastic_white"), 40, r2=1.25))
    p.append(cyl("fanguard", 1.2, 0.1, (0, 0, 3.22), M("galvanised"), 40))
    p.append(cyl("fan", 1.1, 0.04, (0, 0, 3.16), M("plastic_black"), 32))
    for b in range(8):
        p.append(box("guard", (2.4, 0.03, 0.03), (0, 0, 3.27), M("galvanised"), rot=(0, 0, b * math.pi / 8)))
    p.append(cyl("basin", 1.7, 0.5, (0, 0, 0.55), M("plastic_grey"), 40))
    for k in range(16):
        a = k / 16 * 2 * math.pi
        p.append(box("louvre", (0.5, 0.04, 0.35), (math.cos(a) * 1.62, math.sin(a) * 1.62, 1.0), M("plastic_grey"), rot=(0.3, 0, a + math.pi / 2)))
    for k in range(4):
        a = k / 4 * 2 * math.pi + 0.4
        p.append(box("leg", (0.15, 0.15, 0.4), (math.cos(a) * 1.4, math.sin(a) * 1.4, 0.2), M("paint_grey")))
    p.append(cyl("pipe", 0.12, 2.0, (0, -2.4, 0.5), M("paint_grey"), 14, "Y"))


def mast(p):
    # lattice mast with dishes and whips: telecoms on every tall building
    H = 9.0
    for k in range(3):
        a = k / 3 * 2 * math.pi
        p.append(cyl("leg", 0.05, H, (math.cos(a) * 0.4, math.sin(a) * 0.4, H / 2), M("galvanised"), 8))
    for z in range(1, 12):
        for k in range(3):
            a0, a1 = k / 3 * 2 * math.pi, (k + 1) / 3 * 2 * math.pi
            x0, y0, x1, y1 = math.cos(a0) * 0.4, math.sin(a0) * 0.4, math.cos(a1) * 0.4, math.sin(a1) * 0.4
            L = math.hypot(x1 - x0, y1 - y0)
            p.append(box("rung", (L, 0.025, 0.025), ((x0 + x1) / 2, (y0 + y1) / 2, z * 0.78), M("galvanised"), rot=(0, 0, math.atan2(y1 - y0, x1 - x0))))
    for z, a in ((4.5, 0.3), (6.0, 2.4), (7.2, 4.4)):
        d = sphere("dish", 0.45, (math.cos(a) * 0.75, math.sin(a) * 0.75, z), M("plastic_white"), 20, 8, (0.35, 1, 1))
        d.rotation_euler = (0, 0, a)
        p.append(d)
    for k in range(3):
        a = k / 3 * 2 * math.pi + 0.5
        p.append(box("panelant", (0.3, 0.12, 1.4), (math.cos(a) * 0.62, math.sin(a) * 0.62, 8.2), M("plastic_white"), 0.02, rot=(0, 0, a)))
    p.append(cyl("whip", 0.02, 2.5, (0, 0, H + 1.2), M("galvanised"), 6))
    p.append(sphere("beacon", 0.12, (0, 0, H + 0.1), M("light_tail"), 12, 6))
    p.append(box("base", (1.4, 1.4, 0.3), (0, 0, 0.15), M("concrete"), 0.02))
    p.append(box("cabinet", (0.8, 0.6, 1.4), (1.3, 0, 0.7), M("powder_grey"), 0.02))


def solar(p):
    for i in range(3):
        for j in range(2):
            x, y = -2.1 + i * 2.1, -0.6 + j * 1.15
            p.append(box("panel", (2.0, 1.05, 0.04), (x, y, 0.65 + j * 0.25), M("glass_dark"), rot=(0.42, 0, 0)))
            p.append(box("frame", (2.04, 1.09, 0.03), (x, y, 0.63 + j * 0.25), M("aluminium"), rot=(0.42, 0, 0)))
            for c in range(5):
                p.append(box("cellline", (0.01, 1.02, 0.045), (x - 0.8 + c * 0.4, y, 0.655 + j * 0.25), M("aluminium"), rot=(0.42, 0, 0)))
    for i in range(4):
        p.append(box("rail", (0.05, 2.4, 0.06), (-3.1 + i * 2.07, 0, 0.35), M("galvanised")))
        p.append(box("post", (0.06, 0.06, 0.7), (-3.1 + i * 2.07, 0.6, 0.35), M("galvanised")))
        p.append(box("block", (0.3, 0.3, 0.15), (-3.1 + i * 2.07, -0.9, 0.08), M("concrete")))


def helipad(p):
    # emergency helipad: the painted R/H circle Japanese high-rises carry (a flat disc, a hair above the roof)
    p.append(cyl("pad", 9.0, 0.08, (0, 0, 0.04), M("concrete_dark"), 64, smooth=False))
    p.append(cyl("ring", 8.0, 0.09, (0, 0, 0.045), M("paint_yellow"), 64, smooth=False))
    p.append(cyl("ringin", 7.6, 0.1, (0, 0, 0.05), M("concrete_dark"), 64, smooth=False))
    # the H (Japan's rescue pads carry an R in a circle; an H reads from any angle)
    p.append(box("H1", (0.9, 6.0, 0.02), (-1.6, 0, 0.11), M("paint_white")))
    p.append(box("H2", (0.9, 6.0, 0.02), (1.6, 0, 0.11), M("paint_white")))
    p.append(box("H3", (2.4, 0.9, 0.02), (0, 0, 0.11), M("paint_white")))
    for k in range(12):
        a = k / 12 * 2 * math.pi
        p.append(box("padlamp", (0.2, 0.2, 0.12), (math.cos(a) * 8.6, math.sin(a) * 8.6, 0.1), M("light_head")))


def vents(p):
    for k, (x, y, r, h) in enumerate([(-1.2, 0, 0.3, 0.9), (0, 0.4, 0.2, 0.6), (1.1, -0.3, 0.35, 1.1), (0.4, -0.9, 0.15, 0.5)]):
        p.append(cyl("vent", r, h, (x, y, h / 2), M("galvanised"), 18))
        p.append(cyl("cowl", r * 1.5, 0.12, (x, y, h + 0.12), M("galvanised"), 18, r2=r * 0.3))
    p.append(box("duct", (3.0, 0.5, 0.5), (0, 1.3, 0.25), M("galvanised"), 0.02))
    for k in range(5):
        p.append(box("ductband", (0.04, 0.52, 0.52), (-1.2 + k * 0.6, 1.3, 0.25), M("galvanised")))


def billboard(p):
    # rooftop sign frame (the steel lattice behind every Tokyo rooftop advert); the panel takes a lamp-lit face
    W, H = 10.0, 3.6
    p.append(box("face", (W, 0.12, H), (0, 0, 2.2 + H / 2), M("plastic_white"), 0.02))
    p.append(box("faceframe", (W + 0.2, 0.2, 0.15), (0, 0, 2.2 + H + 0.05), M("paint_grey")))
    p.append(box("faceframe", (W + 0.2, 0.2, 0.15), (0, 0, 2.15), M("paint_grey")))
    for k in range(6):
        x = -W / 2 + k * W / 5
        p.append(box("col", (0.14, 0.14, 2.2 + H), (x, 0.3, (2.2 + H) / 2), M("paint_grey")))
        p.append(box("strut", (0.1, 1.9, 0.1), (x, 1.0, 1.2), M("paint_grey"), rot=(0.9, 0, 0)))
        p.append(box("foot", (0.4, 2.2, 0.15), (x, 0.9, 0.08), M("concrete")))
        p.append(box("lamparm", (0.06, 0.8, 0.06), (x * 0.9, -0.5, 2.2 + H + 0.25), M("paint_grey")))
        p.append(box("lamp", (0.3, 0.2, 0.12), (x * 0.9, -0.9, 2.2 + H + 0.2), M("light_head")))
    for z in (1.0, 2.0, 3.2, 4.4):
        p.append(box("rail", (W, 0.08, 0.08), (0, 0.3, z), M("paint_grey")))
    p.append(box("walk", (W, 0.6, 0.05), (0, 0.6, 2.1), M("galvanised")))


BUILD = {"roof_chiller": chiller, "roof_condensers": condensers, "roof_watertank": watertank, "roof_liftroom": liftroom,
         "roof_coolingtower": coolingtower, "roof_mast": mast, "roof_solar": solar, "roof_helipad": helipad,
         "roof_vents": vents, "roof_billboard": billboard}


def finish_and_ship(which, parts, category, ratios=(1.0, 0.35, 0.1), dists=(0, 50, 160), ao=True, meta=None):
    from collections import defaultdict
    parts = [q for q in parts if q is not None]
    for q in parts:
        if q.modifiers:
            apply_all(q)
    groups = defaultdict(list)
    for q in parts:
        groups[q.data.materials[0].name if q.data.materials else "none"].append(q)
    merged = [join(objs, "%s_%s" % (which, mn)) if len(objs) > 1 else objs[0] for mn, objs in groups.items()]
    export.world_uv_all(merged)
    if ao:
        export.bake_ao(merged, samples=24, distance=0.5, densify=0.5)
    root = bpy.data.objects.new(which, None); bpy.context.scene.collection.objects.link(root)
    lods = export.lod_chain(merged, ratios=ratios, dists=dists)
    for e, _ in lods:
        e.parent = root
    return export.ship(which, category, root, lods, meta or {"credit": "Foundry (Blender), original"})


def build(which):
    mats.PX_CAP[0] = 512          # seen from the street below or from the air: 512 px tiles are plenty
    p = []
    BUILD[which](p)
    return finish_and_ship(which, p, "roofs")
