"""Trains: the NHRail stainless commuter EMU and the white-and-blue shinkansen, an end car and a middle car of each.

Matches TRAIN_KINDS in konto.html: origin on the rail head between the bogies, the car runs along three.js Z with
the cab / nose at +Z (Blender -Y). Each car is a real shell (solidified, door and window openings cut with booleans)
with glass, door leaves, rubber seals, the livery stripe, roof equipment, underfloor boxes, two bogies with wheelsets,
couplers and gangways, and a furnished saloon behind the glass (floor, bench seats, poles, ceiling light strips), so
the train looks right from a platform a metre away and when its lit windows slide past at night.
"""
import math
import bpy
from mathutils import Vector

from core import box, cyl, loft, join, boolean, bool_many, from_pydata, add_bevel, apply_all, sphere, dup, auto_smooth
import mats
import export

M = mats.get


def spline(pts, per=4):
    """Catmull-Rom through pts (x, z) -> denser list."""
    out = []
    P = [pts[0]] + list(pts) + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 +
                                    (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in range(2)))
    out.append(pts[-1])
    return out


def section(half):
    """Half profile from the bottom centre-right up to the roof centre -> closed loop, counter-clockwise."""
    right = spline(half)
    left = [(-x, z) for x, z in reversed(right[1:-1])]
    loop = [(0.0, right[0][1])] + right + left
    return loop


COMMUTER_HALF = [(1.36, 1.00), (1.45, 1.22), (1.475, 1.75), (1.465, 2.60), (1.44, 3.20), (1.36, 3.50), (1.15, 3.70), (0.70, 3.80), (0.0, 3.84)]
SHINK_HALF = [(1.40, 0.95), (1.62, 1.25), (1.68, 1.90), (1.66, 2.70), (1.55, 3.30), (1.30, 3.62), (0.80, 3.78), (0.0, 3.82)]


def scaled(half, sx, sz, z0=None, drop=0.0):
    zb = half[0][1]
    return [(x * sx, zb + (z - zb) * sz - drop) for x, z in half]


# ----------------------------------------------------------------------------------------------------------------
# shared parts

def bogie(y, kind, parts):
    base = 0.0
    g = 1.067 if kind == "commuter" else 1.435  # narrow gauge for NHRail, standard for the shinkansen
    wb = 2.1 if kind == "commuter" else 2.5
    for ax in (-wb / 2, wb / 2):
        # axle and two wheels (tread, flange, web), with the axle box outside
        parts.append(cyl("axle", 0.08, g + 0.25, (0, y + ax, 0.43), M("steel_dark"), 12, "X"))
        for s in (-1, 1):
            parts.append(cyl("wheel", 0.43, 0.13, (s * g / 2, y + ax, 0.43), M("bogie"), 32, "X", bevel=0.01))
            parts.append(cyl("flange", 0.47, 0.03, (s * (g / 2 - 0.07), y + ax, 0.43), M("bogie"), 32, "X"))
            parts.append(cyl("hub", 0.16, 0.16, (s * (g / 2 + 0.06), y + ax, 0.43), M("steel_dark"), 16, "X"))
            parts.append(box("axlebox", (0.22, 0.34, 0.3), (s * (g / 2 + 0.2), y + ax, 0.45), M("cast_iron"), 0.02))
            parts.append(cyl("spring", 0.09, 0.22, (s * (g / 2 + 0.2), y + ax, 0.70), M("paint_black"), 10))
            parts.append(box("brake", (0.12, 0.30, 0.34), (s * (g / 2 - 0.02), y + ax + (0.48 if ax < 0 else -0.48), 0.45), M("cast_iron"), 0.015))
    for s in (-1, 1):
        # side frame: the deep H-frame you see between the wheels
        parts.append(box("sideframe", (0.16, wb + 0.9, 0.26), (s * (g / 2 + 0.2), y, 0.82), M("bogie"), 0.03))
        parts.append(box("sideframe_lo", (0.12, wb * 0.55, 0.22), (s * (g / 2 + 0.2), y, 0.62), M("bogie"), 0.03))
        parts.append(cyl("airspring", 0.22, 0.22, (s * 0.95, y, 1.02), M("rubber"), 20))
        parts.append(box("damper", (0.07, 0.07, 0.42), (s * (g / 2 + 0.33), y + 0.5, 0.82), M("paint_yellow" if kind == "commuter" else "paint_black"), 0.01, rot=(0.6, 0, 0)))
    parts.append(box("transom", (g + 0.3, 0.42, 0.22), (0, y, 0.80), M("bogie"), 0.03))
    if kind == "commuter":
        parts.append(box("motor", (0.7, 0.6, 0.45), (0.2, y + 0.45, 0.62), M("steel_dark"), 0.03))
        parts.append(box("gearbox", (0.25, 0.5, 0.35), (-0.45, y - 0.5, 0.5), M("cast_iron"), 0.03))


def underfloor(L, kind, parts, cab_end=False):
    mat = M("steel_dark")
    y0, y1 = -L / 2 + 4.2, L / 2 - 4.2
    boxes = [(-4.5, 1.6, 0.85, 0.55), (-2.3, 1.2, 0.95, 0.5), (-0.6, 1.4, 0.75, 0.6), (1.5, 1.8, 0.95, 0.55), (3.6, 1.1, 0.7, 0.45), (5.0, 1.0, 0.85, 0.5)]
    for i, (yc, ln, w, h) in enumerate(boxes):
        yc *= (y1 - y0) / 10.5
        for s in ((-1, 1) if i % 2 == 0 else (1,)):
            x = s * (0.55 + w / 2 * 0.6)
            parts.append(box("ufbox", (w, ln, h), (x, yc, 1.05 - h / 2), mat if i % 3 else M("powder_grey"), 0.025))
            # louvres on the equipment boxes
            for k in range(5):
                parts.append(box("louvre", (0.02, ln * 0.8, 0.025), (x + s * (w / 2 + 0.005), yc, 1.05 - h * 0.25 - k * h * 0.11), M("cast_iron")))
    # main reservoir and pipework
    parts.append(cyl("reservoir", 0.2, 3.2, (-0.85, 0, 0.82), M("powder_grey"), 18, "Y", bevel=0.03))
    parts.append(cyl("pipe", 0.025, L - 2.0, (0.35, 0, 0.95), M("cast_iron"), 8, "Y"))
    parts.append(cyl("pipe", 0.02, L - 2.0, (-0.25, 0, 0.98), M("cast_iron"), 8, "Y"))


def coupler(y, dirn, parts):
    parts.append(box("draftgear", (0.3, 0.6, 0.25), (0, y - dirn * 0.25, 0.9), M("cast_iron"), 0.03))
    parts.append(box("coupler", (0.2, 0.55, 0.2), (0, y + dirn * 0.15, 0.88), M("steel_dark"), 0.03))
    parts.append(box("couplerhead", (0.36, 0.2, 0.3), (0, y + dirn * 0.45, 0.88), M("steel_dark"), 0.03))


def gangway(y, w, h, z0, dirn, parts):
    # bellows: a stack of rubber ribs
    for k in range(5):
        parts.append(box("bellows", (w + (0.04 if k % 2 else 0), 0.07, h + (0.04 if k % 2 else 0)), (0, y + dirn * (0.05 + k * 0.065), z0 + h / 2), M("gangway"), 0.02))


# ----------------------------------------------------------------------------------------------------------------
# saloon

def saloon(L, kind, half_w, y_min, y_max, door_ys, door_w, parts, seat_mat):
    fl = 1.15 if kind == "commuter" else 1.25
    parts.append(box("floor", (half_w * 2 - 0.12, y_max - y_min, 0.05), (0, (y_min + y_max) / 2, fl - 0.025), M("floor_vinyl")))
    parts.append(box("ceiling", (half_w * 1.5, y_max - y_min, 0.04), (0, (y_min + y_max) / 2, 3.42 if kind == "commuter" else 3.35), M("plastic_white")))
    for s in (-1, 1):
        parts.append(box("lightstrip", (0.14, y_max - y_min - 0.4, 0.02), (s * 0.55, (y_min + y_max) / 2, 3.395 if kind == "commuter" else 3.325), M("light_panel")))
        parts.append(box("adpanel", (0.02, y_max - y_min - 0.2, 0.32), (s * (half_w - 0.22), (y_min + y_max) / 2, 3.22), M("plastic_white")))
    if kind == "commuter":
        # longitudinal benches between the doors, a stanchion in front of each door pair, grab rail along the ceiling
        edges = [y_min + 0.2] + sum([[d - door_w / 2 - 0.15, d + door_w / 2 + 0.15] for d in door_ys], []) + [y_max - 0.2]
        for i in range(0, len(edges) - 1, 2):
            a, b = edges[i], edges[i + 1]
            if b - a < 0.8:
                continue
            for s in (-1, 1):
                x = s * (half_w - 0.36)
                parts.append(box("seatbase", (0.5, b - a, 0.38), (x, (a + b) / 2, fl + 0.2), M("stainless_dull"), 0.02))
                parts.append(box("cushion", (0.5, b - a - 0.04, 0.1), (x + s * 0.02, (a + b) / 2, fl + 0.44), seat_mat, 0.04))
                parts.append(box("backrest", (0.1, b - a - 0.04, 0.48), (s * (half_w - 0.12), (a + b) / 2, fl + 0.76), seat_mat, 0.04, rot=(0, s * 0.12, 0)))
                parts.append(box("partition", (0.55, 0.04, 0.9), (x, a + 0.02, fl + 0.65), M("plastic_white"), 0.02))
                parts.append(box("partition", (0.55, 0.04, 0.9), (x, b - 0.02, fl + 0.65), M("plastic_white"), 0.02))
                parts.append(cyl("pole", 0.018, 1.9, (s * (half_w - 0.64), (a + b) / 2, fl + 0.95), M("chrome"), 10))
        for s in (-1, 1):
            parts.append(cyl("grabrail", 0.016, y_max - y_min - 0.4, (s * 0.85, (y_min + y_max) / 2, 3.0), M("chrome"), 8, "Y"))
            for k in range(int((y_max - y_min) / 0.45)):
                parts.append(box("strap", (0.012, 0.03, 0.22), (s * 0.85, y_min + 0.4 + k * 0.45, 2.86), M("plastic_white")))
                parts.append(cyl("ring", 0.06, 0.02, (s * 0.85, y_min + 0.4 + k * 0.45, 2.72), M("plastic_white"), 12, "X"))
    else:
        # 3+2 transverse seating
        pitch = 1.04
        n = int((y_max - y_min - 0.6) / pitch)
        for k in range(n):
            y = y_min + 0.5 + k * pitch
            for xs, cnt in ((-1, 3), (1, 2)):
                w = 0.46
                x0 = xs * (0.38 + cnt * w / 2)
                parts.append(box("seat", (cnt * w, 0.48, 0.12), (x0, y, fl + 0.45), seat_mat, 0.04))
                parts.append(box("seatback", (cnt * w, 0.12, 0.72), (x0, y + 0.26, fl + 0.88), seat_mat, 0.05, rot=(-0.12, 0, 0)))
                parts.append(box("headrest", (cnt * w - 0.04, 0.1, 0.06), (x0, y + 0.3, fl + 1.27), M("plastic_white"), 0.02))
                parts.append(box("seatleg", (cnt * w * 0.7, 0.3, 0.38), (x0, y, fl + 0.2), M("plastic_grey"), 0.02))
        for s in (-1, 1):
            parts.append(box("rack", (0.45, y_max - y_min - 0.4, 0.03), (s * (half_w - 0.35), (y_min + y_max) / 2, 2.85), M("aluminium"), 0.01))


# ----------------------------------------------------------------------------------------------------------------
# the cars

def commuter(end):
    L, half_w = 19.5, 1.475
    sec = section(COMMUTER_HALF)
    ys = [i * 0.75 - L / 2 for i in range(int(L / 0.75) + 1)]
    ys[-1] = L / 2
    secs = []
    for y in ys:
        pts = sec
        if end and y < -L / 2 + 0.6:
            # the cab face leans back a little at the top, like every modern EMU
            t = (y + L / 2) / 0.6
            pts = [(x, z) for x, z in sec]
            secs.append((y, pts))
        else:
            secs.append((y, pts))
    if end:
        # raked front: the upper front moves back by 0.25 m
        secs = [(y, p) for y, p in secs if y > -L / 2 + 0.3]
        front = [(x, z) for x, z in sec]
        rk = []
        for x, z in front:
            lean = max(0.0, (z - 2.0)) / 1.84 * 0.28
            rk.append((x * (1 - 0.02 * lean), z))
        secs.insert(0, (-L / 2 + 0.3 - 0.0001, rk))
    body = loft("body", secs, M("stainless"), smooth=True)
    if end:
        # lean the cab face: move the first ring's upper vertices back
        me = body.data
        n = len(sec)
        for i in range(n):
            v = me.vertices[i]
            lean = max(0.0, (v.co.z - 2.0)) / 1.84 * 0.32
            v.co.y = -L / 2 + lean
    sol = body.modifiers.new("shell", "SOLIDIFY"); sol.thickness = 0.06; sol.offset = -1
    apply_all(body)

    door_ys = [-7.2, -2.4, 2.4, 7.2]
    door_w, door_z0, door_z1 = 1.30, 1.15, 3.05
    win = [(-4.8, 2.05), (0.0, 2.05), (4.8, 2.05), (8.95, 0.75)] + ([] if end else [(-8.95, 0.75)])
    wz0, wz1 = 1.98, 3.02
    cut = []
    for s in (-1, 1):
        for d in door_ys:
            cut.append(box("c", (0.5, door_w, door_z1 - door_z0), (s * 1.4, d, (door_z0 + door_z1) / 2)))
        for y, w in win:
            cut.append(box("c", (0.5, w, wz1 - wz0), (s * 1.4, y, (wz0 + wz1) / 2), bevel=0.06, segs=3))
    if end:
        cut.append(box("c", (2.3, 0.8, 1.05), (0, -L / 2 + 0.1, 2.75), bevel=0.08, segs=3))   # cab windscreen
        cut.append(box("c", (0.5, 0.55, 0.9), (1.4, -L / 2 + 1.05, 2.6), bevel=0.05))         # cab side windows
        cut.append(box("c", (0.5, 0.55, 0.9), (-1.4, -L / 2 + 1.05, 2.6), bevel=0.05))
    else:
        cut.append(box("c", (1.0, 0.6, 1.95), (0, -L / 2, 2.12)))  # gangway openings
    cut.append(box("c", (1.0, 0.6, 1.95), (0, L / 2, 2.12)))
    for c in cut:
        apply_all(c)
    body = bool_many(body, cut)
    auto_smooth(body, 40)
    parts = [body]

    # glass, seals and frames
    for s in (-1, 1):
        for y, w in win:
            parts.append(box("glass", (0.02, w - 0.04, wz1 - wz0 - 0.04), (s * 1.43, y, (wz0 + wz1) / 2), M("glass")))
            parts.append(box("seal", (0.05, w + 0.02, 0.04), (s * 1.45, y, wz0 - 0.01), M("rubber"), 0.01))
            parts.append(box("seal", (0.05, w + 0.02, 0.04), (s * 1.45, y, wz1 + 0.01), M("rubber"), 0.01))
            if w > 1.2:
                parts.append(box("mullion", (0.05, 0.05, wz1 - wz0), (s * 1.44, y, (wz0 + wz1) / 2), M("rubber"), 0.01))
                parts.append(box("blind", (0.02, w - 0.08, 0.16), (s * 1.38, y, wz1 - 0.1), M("fabric_grey")))
        for d in door_ys:
            # two sliding leaves with a window each, a rubber nose seam, and the door pocket recess
            for k in (-1, 1):
                yc = d + k * door_w / 4
                leaf = box("doorleaf", (0.045, door_w / 2 - 0.01, door_z1 - door_z0 - 0.02), (s * 1.425, yc, (door_z0 + door_z1) / 2), M("stainless"), 0.008)
                wcut = box("c", (0.2, door_w / 2 - 0.22, 0.95), (s * 1.425, yc, 2.45), bevel=0.04, segs=3)
                apply_all(leaf); apply_all(wcut)
                leaf = boolean(leaf, wcut)
                parts.append(leaf)
                parts.append(box("doorglass", (0.015, door_w / 2 - 0.24, 0.93), (s * 1.425, yc, 2.45), M("glass")))
                parts.append(box("doorstripe", (0.05, door_w / 2 - 0.02, 0.10), (s * 1.45, yc, 1.88), M("paint_green")))
            parts.append(box("doorseam", (0.06, 0.03, door_z1 - door_z0), (s * 1.44, d, (door_z0 + door_z1) / 2), M("rubber")))
            parts.append(box("threshold", (0.24, door_w, 0.03), (s * 1.36, d, door_z0 + 0.0), M("aluminium")))
            parts.append(box("doorlamp", (0.04, 0.12, 0.05), (s * 1.47, d, door_z1 + 0.12), M("light_tail")))
            parts.append(box("doorframe", (0.04, 0.05, door_z1 - door_z0), (s * 1.45, d - door_w / 2 - 0.02, (door_z0 + door_z1) / 2), M("rubber")))
            parts.append(box("doorframe", (0.04, 0.05, door_z1 - door_z0), (s * 1.45, d + door_w / 2 + 0.02, (door_z0 + door_z1) / 2), M("rubber")))
        # livery: the green belt under the windows and a thin line above, broken by the doors
        spans = [(-L / 2 + (0.55 if end else 0.1), door_ys[0] - door_w / 2)] + \
                [(door_ys[i] + door_w / 2, door_ys[i + 1] - door_w / 2) for i in range(3)] + [(door_ys[3] + door_w / 2, L / 2 - 0.1)]
        for a, b in spans:
            parts.append(box("belt", (0.03, b - a - 0.04, 0.12), (s * 1.488, (a + b) / 2, 1.86), M("paint_green")))
            parts.append(box("belt2", (0.03, b - a - 0.04, 0.035), (s * 1.468, (a + b) / 2, 3.12), M("paint_green")))
            parts.append(box("sill", (0.03, b - a - 0.04, 0.02), (s * 1.48, (a + b) / 2, 1.30), M("stainless_dull")))
        # car number and the small lamp/plate boxes
        parts.append(box("carno", (0.02, 0.5, 0.12), (s * 1.48, 5.9, 3.3), M("paint_black")))
    # roof: two packaged air conditioners, walkway, vents, rain gutters
    for y in (-4.6, 4.6):
        ac = box("ac", (2.0, 2.6, 0.32), (0, y, 3.96), M("galvanised"), 0.06, 3)
        parts.append(ac)
        for k in range(6):
            parts.append(box("acgrille", (1.7, 0.03, 0.02), (0, y - 1.0 + k * 0.4, 4.125), M("cast_iron")))
        parts.append(cyl("acfan", 0.34, 0.04, (0, y + 0.6, 4.12), M("cast_iron"), 24))
        parts.append(cyl("acfan", 0.34, 0.04, (0, y - 0.6, 4.12), M("cast_iron"), 24))
    g0 = -L / 2 + (0.6 if end else 0.2)
    for s in (-1, 1):
        parts.append(box("gutter", (0.05, L / 2 - 0.2 - g0, 0.05), (s * 1.30, (g0 + L / 2 - 0.2) / 2, 3.58), M("stainless_dull")))
    for k in range(9):
        parts.append(box("vent", (0.5, 0.35, 0.08), (0, -7.8 + k * 1.95, 3.86), M("galvanised"), 0.02))
    if not end:
        pantograph(5.8 - 2.8, parts)
        parts.append(box("roofdeck", (1.3, 3.2, 0.03), (0, 3.0, 3.85), M("galvanised")))
        for k in range(4):
            parts.append(cyl("insulator", 0.06, 0.2, (0.5 if k % 2 else -0.5, 2.0 + k * 0.6, 3.95), M("plastic_grey"), 12))
    # underfloor and running gear
    underfloor(L, "commuter", parts)
    for y in (-L / 2 + 2.6, L / 2 - 2.6):
        bogie(y, "commuter", parts)
    for s in (-1, 1):
        parts.append(box("skirt", (0.04, L - 0.6, 0.18), (s * 1.38, 0, 1.03), M("steel_dark")))
    coupler(L / 2, 1, parts)
    gangway(L / 2 - 0.05, 1.15, 2.1, 1.1, 1, parts)
    if not end:
        coupler(-L / 2, -1, parts)
        gangway(-L / 2 + 0.05, 1.15, 2.1, 1.1, -1, parts)
    else:
        cab_front(L, parts)
    # end walls inside, with the through-door
    for y in ([L / 2 - 0.35] + ([] if end else [-L / 2 + 0.35])):
        parts.append(box("endwall", (2.6, 0.04, 2.25), (0, y, 2.27), M("plastic_white")))
        parts.append(box("enddoor", (0.8, 0.05, 1.9), (0, y, 2.1), M("stainless")))
        parts.append(box("enddoorglass", (0.5, 0.06, 0.9), (0, y, 2.45), M("glass")))
    if end:
        parts.append(box("cabwall", (2.7, 0.06, 2.25), (0, -L / 2 + 1.6, 2.27), M("plastic_white")))
        parts.append(box("cabdoorglass", (0.5, 0.07, 0.8), (0.6, -L / 2 + 1.6, 2.45), M("glass")))
    saloon(L, "commuter", half_w - 0.06, -L / 2 + (1.7 if end else 0.4), L / 2 - 0.4, door_ys, door_w, parts, M("seat_moquette"))
    return parts


def lean(z):
    return max(0.0, (z - 2.0)) / 1.84 * 0.32


def cab_front(L, parts):
    y = -L / 2
    parts.append(box("windscreen", (2.25, 0.04, 1.0), (0, y + lean(2.75) + 0.03, 2.75), M("glass_dark"), rot=(-0.17, 0, 0)))
    parts.append(box("cabmask", (2.85, 0.06, 0.95), (0, y + 0.02, 1.72), M("paint_black"), 0.04))  # black front panel
    parts.append(box("frontbelt", (2.88, 0.07, 0.16), (0, y + 0.0, 2.15), M("paint_green"), 0.02))
    for s in (-1, 1):
        parts.append(box("headlamp", (0.36, 0.06, 0.16), (s * 1.0, y - 0.02, 1.80), M("light_head"), 0.02))
        parts.append(box("taillamp", (0.30, 0.06, 0.10), (s * 1.0, y - 0.02, 1.58), M("light_tail"), 0.02))
        parts.append(box("lampbezel", (0.44, 0.04, 0.42), (s * 1.0, y - 0.0, 1.70), M("chrome"), 0.02))
        parts.append(box("cabhandrail", (0.03, 0.03, 0.9), (s * 1.30, y + 0.4, 2.0), M("chrome")))
        parts.append(box("wiper", (0.02, 0.02, 0.6), (s * 0.5, y + lean(2.4) - 0.02, 2.4), M("plastic_black"), rot=(0.2, 0.8 * s, 0)))
        parts.append(box("cabstep", (0.4, 0.25, 0.04), (s * 1.0, y + 0.1, 0.95), M("steel_dark")))
    parts.append(box("destination", (1.2, 0.05, 0.22), (0, y + lean(3.38) - 0.03, 3.38), M("screen_dest")))
    parts.append(box("destframe", (1.3, 0.04, 0.3), (0, y + lean(3.38) - 0.01, 3.38), M("paint_black")))
    parts.append(box("runno", (0.32, 0.05, 0.16), (0.95, y + lean(3.38) - 0.03, 3.38), M("screen_dest")))
    parts.append(box("skirtplow", (2.6, 0.2, 0.55), (0, y + 0.25, 0.75), M("powder_grey"), 0.04))
    for k in range(5):
        parts.append(box("plowrib", (0.06, 0.06, 0.45), (-1.0 + k * 0.5, y + 0.14, 0.75), M("steel_dark")))
    coupler(y, -1, parts)
    for s in (-1, 1):
        parts.append(cyl("hose", 0.03, 0.4, (s * 0.35, y - 0.05, 0.85), M("rubber"), 8))
    # cab interior seen through the windscreen
    parts.append(box("console", (2.3, 0.7, 0.9), (0, y + 0.75, 1.6), M("plastic_grey"), 0.05))
    parts.append(box("cabseat", (0.5, 0.5, 0.9), (-0.6, y + 1.25, 1.65), M("leather_black"), 0.05))
    parts.append(box("cabscreen", (0.6, 0.04, 0.3), (-0.4, y + 0.55, 2.15), M("light_panel"), rot=(-0.6, 0, 0)))


def pantograph(y, parts):
    z = 3.92
    parts.append(box("pantbase", (1.2, 1.4, 0.12), (0, y, z), M("steel_dark"), 0.02))
    for s in (-1, 1):
        # single-arm pantograph: lower arm, upper arm and the collector head
        parts.append(cyl("pantarm", 0.035, 1.5, (0, y - 0.35, z + 0.45), M("steel_dark"), 8, "Y"))
    arm1 = cyl("pantarm1", 0.04, 1.4, (0, y - 0.25, z + 0.5), M("steel_dark"), 10)
    arm1.rotation_euler = (math.radians(55), 0, 0)
    arm2 = cyl("pantarm2", 0.03, 1.5, (0, y - 0.2, z + 1.05), M("steel_dark"), 10)
    arm2.rotation_euler = (math.radians(-60), 0, 0)
    parts += [arm1, arm2]
    parts.append(box("panthead", (1.6, 0.08, 0.05), (0, y + 0.45, z + 1.42), M("stainless_dull"), 0.01))
    parts.append(box("panthorn", (0.25, 0.08, 0.04), (0.9, y + 0.45, z + 1.38), M("stainless_dull"), 0.01, rot=(0, 0.5, 0)))
    parts.append(box("panthorn", (0.25, 0.08, 0.04), (-0.9, y + 0.45, z + 1.38), M("stainless_dull"), 0.01, rot=(0, -0.5, 0)))


def shinkansen(end):
    L, half_w = 24.5, 1.68
    sec = section(SHINK_HALF)
    noseL = 6.2
    secs = []
    if end:
        n = 18
        for i in range(n + 1):
            t = i / n                              # 0 at the tip, 1 where the full section starts
            y = -L / 2 + t * noseL
            e = t ** 0.55                           # a long, duck-billed nose: flat and wide low down, the cab canopy up top
            sx = 0.10 + 0.90 * (1 - (1 - t) ** 2.2)
            sz = 0.18 + 0.82 * (t ** 1.25)
            drop = 0.0
            pts = [(x * sx, 0.95 + (z - 0.95) * sz * (0.6 + 0.4 * e) + (0.3 * (1 - t) if z < 1.2 else 0.0) * 0) for x, z in sec]
            # keep the floor line straight: the bottom ring points stay at the skirt height
            pts = [(x, max(0.95 + 0.25 * (1 - t), z)) for x, z in pts]
            secs.append((y, pts))
        ys = [-L / 2 + noseL + 0.9 * k for k in range(1, int((L - noseL) / 0.9) + 1)]
    else:
        ys = [-L / 2 + 0.9 * k for k in range(int(L / 0.9) + 1)]
    if ys[-1] < L / 2:
        ys.append(L / 2)
    for y in ys:
        secs.append((y, sec))
    body = loft("body", secs, M("paint_white"), smooth=True, cap_start=True)
    sol = body.modifiers.new("shell", "SOLIDIFY"); sol.thickness = 0.06; sol.offset = -1
    apply_all(body)
    wz0, wz1 = 2.15, 2.62
    pitch = 1.04
    y0 = -L / 2 + (noseL + 1.8 if end else 2.4)
    y1 = L / 2 - 2.4
    door_ys = ([] if end else [-L / 2 + 1.3]) + [L / 2 - 1.3]
    cut = []
    wins = []
    y = y0
    while y < y1:
        wins.append(y)
        y += pitch
    for s in (-1, 1):
        for y in wins:
            cut.append(box("c", (0.6, 0.62, wz1 - wz0), (s * 1.6, y, (wz0 + wz1) / 2), bevel=0.08, segs=3))
        for d in door_ys:
            cut.append(box("c", (0.6, 0.95, 1.95), (s * 1.6, d, 2.27)))
    if end:
        cut.append(box("c", (2.0, 1.8, 0.62), (0, -L / 2 + noseL - 1.2, 3.25), bevel=0.25, segs=4, rot=(0.35, 0, 0)))  # cab canopy
    cut.append(box("c", (1.0, 0.6, 1.95), (0, L / 2, 2.22)))
    if not end:
        cut.append(box("c", (1.0, 0.6, 1.95), (0, -L / 2, 2.22)))
    for c in cut:
        apply_all(c)
    body = bool_many(body, cut)
    auto_smooth(body, 40)
    parts = [body]
    for s in (-1, 1):
        for y in wins:
            parts.append(box("glass", (0.02, 0.6, wz1 - wz0 - 0.02), (s * 1.62, y, (wz0 + wz1) / 2), M("glass")))
            parts.append(box("blind", (0.02, 0.56, 0.12), (s * 1.55, y, wz1 - 0.08), M("plastic_white")))
        for d in door_ys:
            parts.append(box("door", (0.04, 0.9, 1.9), (s * 1.645, d, 2.27), M("paint_white"), 0.01))
            parts.append(box("doorglass", (0.02, 0.3, 0.55), (s * 1.665, d, 2.6), M("glass")))
            parts.append(box("doorseal", (0.04, 0.96, 0.03), (s * 1.66, d, 1.31), M("rubber")))
        # livery: the broad blue band at the skirt line and the thin stripe below the windows
        a, b = (-L / 2 + noseL - 0.5 if end else -L / 2 + 0.2), L / 2 - 0.2
        for d in [None] + door_ys:
            pass
        segs = [(a, b)]
        for d in door_ys:
            nsegs = []
            for x0, x1 in segs:
                if x0 < d - 0.5 < x1 or x0 < d + 0.5 < x1:
                    nsegs += [(x0, d - 0.5), (d + 0.5, x1)]
                else:
                    nsegs.append((x0, x1))
            segs = [(x0, x1) for x0, x1 in nsegs if x1 - x0 > 0.2]
        for x0, x1 in segs:
            parts.append(box("band", (0.03, x1 - x0, 0.36), (s * 1.695, (x0 + x1) / 2, 1.62), M("paint_blue")))
            parts.append(box("stripe", (0.03, x1 - x0, 0.05), (s * 1.682, (x0 + x1) / 2, 1.95), M("paint_blue")))
        # skirts over the bogies: the shinkansen hides its running gear
        parts.append(box("skirt", (0.05, L - (noseL if end else 0.6) - 0.2, 0.5), (s * 1.52, (noseL / 2 if end else 0), 0.98), M("paint_grey")))
    # roof: smooth, with a pantograph shroud on the middle car
    if not end:
        parts.append(box("pantshroud", (1.4, 3.2, 0.32), (0, 2.0, 3.88), M("paint_white"), 0.12, 4))
        pantograph(2.0, parts)
    for k in range(4):
        parts.append(box("roofhatch", (0.8, 0.6, 0.03), (0, -6 + k * 4, 3.82), M("paint_grey"), 0.01))
    underfloor(L, "shinkansen", parts)
    for y in ((-L / 2 + noseL + 1.0) if end else (-L / 2 + 3.0), L / 2 - 3.0):
        bogie(y, "shinkansen", parts)
    gangway(L / 2 - 0.05, 1.1, 2.0, 1.25, 1, parts)
    coupler(L / 2, 1, parts)
    if not end:
        gangway(-L / 2 + 0.05, 1.1, 2.0, 1.25, -1, parts)
        coupler(-L / 2, -1, parts)
    else:
        tip = -L / 2
        parts.append(box("canopy", (1.95, 1.75, 0.04), (0, tip + noseL - 1.2, 3.05), M("glass_dark"), rot=(0.33, 0, 0)))
        for s in (-1, 1):
            parts.append(sphere("headlamp", 0.16, (s * 0.62, tip + 1.65, 1.45), M("light_head"), 16, 8, (1.4, 1.6, 0.55)))
            parts.append(sphere("taillamp", 0.10, (s * 0.62, tip + 1.92, 1.36), M("light_tail"), 12, 6, (1.6, 1.4, 0.4)))
        parts.append(box("noseband", (0.03, 0.03, 0.03), (0, tip + 0.2, 1.1), M("paint_blue")))
    for y in ([L / 2 - 0.35] + ([] if end else [-L / 2 + 0.35])):
        parts.append(box("endwall", (3.0, 0.04, 2.15), (0, y, 2.32), M("plastic_white")))
        parts.append(box("enddoorglass", (0.6, 0.06, 1.2), (0, y, 2.35), M("glass")))
    saloon(L, "shinkansen", half_w - 0.08, (-L / 2 + noseL + 1.4) if end else (-L / 2 + 2.0), L / 2 - 2.0, [], 0, parts, M("seat_moquette"))
    if end:
        parts.append(box("cabfloor", (1.8, 2.0, 0.05), (0, tip + noseL - 1.0, 2.2), M("floor_vinyl")))
        parts.append(box("console", (1.6, 0.6, 0.5), (0, tip + noseL - 1.6, 2.5), M("plastic_grey"), 0.05))
    return parts


def build(which):
    kind, part = which.split("_")
    end = part == "end"
    parts = commuter(end) if kind == "commuter" else shinkansen(end)
    parts = [p for p in parts if p is not None]
    for p in parts:
        if p.modifiers:
            apply_all(p)
    # merge by material: one object per material keeps the draw calls (and the game's instanced meshes) few
    from collections import defaultdict
    groups = defaultdict(list)
    for p in parts:
        groups[p.data.materials[0].name if p.data.materials else "none"].append(p)
    merged = []
    for mn, objs in groups.items():
        merged.append(join(objs, "%s_%s" % (which, mn)) if len(objs) > 1 else objs[0])
    export.world_uv_all(merged)
    export.bake_ao(merged, samples=32, distance=0.8, densify=0.6)
    root = bpy.data.objects.new(which, None); bpy.context.scene.collection.objects.link(root)
    lods = export.lod_chain(merged, ratios=(1.0, 0.3, 0.08), dists=(0, 60, 220))
    for e, _ in lods:
        e.parent = root
    # the game rotates nothing: Blender -Y (cab) becomes three.js +Z.
    return export.ship(which, "trains", root, lods, {"kind": kind, "end": end, "credit": "Foundry (Blender), original design"})


TARGETS = ["commuter_end", "commuter_mid", "shinkansen_end", "shinkansen_mid"]
