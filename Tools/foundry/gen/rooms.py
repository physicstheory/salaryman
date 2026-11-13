"""Rooms: the interiors seen through every city window (interior mapping).

Each room is modelled in Blender (walls, floor, ceiling, furniture, lamps) and rendered with Cycles from a camera
standing 4 m outside the window plane, looking straight in, with the open front of the room exactly filling the
frame. That is the projection the game's facade shader undoes: a ray from the eye is traced into a box behind the
glass, and the point it hits (x, y across the opening, z into the room, all 0..1) is looked up in this picture at

    0.5 + (xy - 0.5) / (1 + z)

because the back wall, as deep as the camera is far, comes out at half size. So every window shows a room with real
depth and parallax at the cost of one texture read. Sixteen rooms are rendered per set into a 4 x 4 atlas:

    work   open-plan office, meeting room, executive office, server room, call centre, lift lobby, stock room,
           vacant floor, pantry, reception, design studio, dental clinic, gym, cram school, izakaya, karaoke
    home   living room, kitchen-dining, bedroom, kids' room, washitsu, study, student room, grandparents' room,
           LDK, empty flat, laundry, home office, piano room, futon room, junk room, reading room

The shader then varies every window on top: which room, mirrored or not, wall tint, light colour, lit or dark at
night, blinds and curtains, and one tenant per floor per building, so no two buildings look alike.
Output: Web/art/rooms/rooms_<set>.jpg (2048 px, 512 px a room) and rooms_<set>-low.jpg (1024 px).
"""
import math
import os
import random

import bpy
import numpy as np
from PIL import Image

from core import box, cyl, sphere
import mats
import export

OUT = os.path.join(export.REPO, "Web", "art", "rooms")
TARGETS = ["rooms_work", "rooms_home"]
W, D, H = 4.0, 4.0, 2.8            # the room: width, depth (= camera distance), height
RES = (640, 448)                   # W:H, resized to a square 512 tile in the atlas
TILE = 512
SAMPLES = int(os.environ.get("ROOM_SAMPLES", "24"))

_fm = {}


def fm(col, rough=0.6, metal=0.0, emit=None, strength=4.0):
    """A flat Principled material, cached by its settings."""
    key = (tuple(round(c, 3) for c in col), round(rough, 2), metal, emit and tuple(emit), strength)
    if key in _fm:
        return _fm[key]
    m = bpy.data.materials.new("r%d" % len(_fm))
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    _fm[key] = m
    return m


def tex(key):
    return mats.get(key, vc_ao=False)


def hexc(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple((int(h[i:i + 2], 16) / 255.0) ** 2.2 for i in (0, 2, 4))


# ---- furniture ------------------------------------------------------------------------------------------------------------------------------
P = []          # every object in the room


def add(o):
    P.append(o)
    return o


def B(size, at, m, bevel=0.0, rot=None):
    return add(box("p", size, at, m, bevel, rot=rot))


def desk(x, y, w=1.4, d=0.7, top=None, legs=None, rot=0):
    top = top or fm(hexc("#d8d4cc"), 0.5)
    legs = legs or fm(hexc("#3a3a3c"), 0.4, 0.6)
    B((w, d, 0.03), (x, y, 0.72), top, 0.004)
    for sx in (-1, 1):
        B((0.04, d * 0.9, 0.7), (x + sx * (w / 2 - 0.05), y, 0.36), legs)


def chair(x, y, col="#222226", facing=1):
    m = fm(hexc(col), 0.7)
    B((0.48, 0.46, 0.08), (x, y, 0.46), m, 0.02)
    B((0.46, 0.06, 0.55), (x, y + facing * 0.24, 0.8), m, 0.02)
    add(cyl("c", 0.025, 0.42, (x, y, 0.22), fm(hexc("#555"), 0.3, 1.0), 8))
    B((0.55, 0.06, 0.03), (x, y, 0.03), fm(hexc("#222"), 0.5))
    B((0.06, 0.55, 0.03), (x, y, 0.03), fm(hexc("#222"), 0.5))


def monitor(x, y, glow=(0.55, 0.7, 1.0), w=0.55, s=3.0):
    B((w, 0.03, w * 0.6), (x, y, 1.08), fm(hexc("#111"), 0.3, emit=glow, strength=s))
    B((w + 0.02, 0.04, w * 0.6 + 0.02), (x, y + 0.02, 1.08), fm(hexc("#151517"), 0.4))
    B((0.05, 0.05, 0.22), (x, y + 0.04, 0.84), fm(hexc("#222"), 0.4))


def shelf(x, y, w, h, rng, d=0.35, frame="#6a5a48", against="back", items=True):
    m = fm(hexc(frame), 0.6)
    if against == "back":
        B((w, d, 0.03), (x, y, h), m)
        for k in range(int(h / 0.38) + 1):
            z = 0.05 + k * 0.38
            B((w, d, 0.025), (x, y, z), m)
            if items and z < h - 0.1:
                cx = x - w / 2 + 0.05
                while cx < x + w / 2 - 0.1:
                    bw = rng.uniform(0.03, 0.09) if rng.random() < 0.7 else rng.uniform(0.15, 0.3)
                    bh = rng.uniform(0.18, 0.32)
                    c = rng.choice(["#8a2c2c", "#2c4a8a", "#d8d0c0", "#3a6a3a", "#c8a050", "#222", "#e8e8e0", "#6a4a8a"])
                    B((bw, d * 0.8, bh), (cx + bw / 2, y, z + 0.0125 + bh / 2), fm(hexc(c), 0.7))
                    cx += bw + rng.uniform(0.0, 0.03)
        for sx in (-1, 1):
            B((0.03, d, h), (x + sx * w / 2, y, h / 2), m)
    else:  # side wall: x is the wall, y the centre
        B((d, w, 0.03), (x, y, h), m)
        for k in range(int(h / 0.38) + 1):
            z = 0.05 + k * 0.38
            B((d, w, 0.025), (x, y, z), m)
            if items and z < h - 0.1:
                cy = y - w / 2 + 0.05
                while cy < y + w / 2 - 0.1:
                    bw = rng.uniform(0.03, 0.09) if rng.random() < 0.7 else rng.uniform(0.15, 0.3)
                    bh = rng.uniform(0.18, 0.32)
                    c = rng.choice(["#8a2c2c", "#2c4a8a", "#d8d0c0", "#3a6a3a", "#c8a050", "#222", "#e8e8e0"])
                    B((d * 0.8, bw, bh), (x, cy + bw / 2, z + 0.0125 + bh / 2), fm(hexc(c), 0.7))
                    cy += bw + rng.uniform(0.0, 0.03)


def plant(x, y, h=1.2, pot="#d8d4cc"):
    add(cyl("pot", 0.2, 0.4, (x, y, 0.2), fm(hexc(pot), 0.5), 16, r2=0.16))
    for k in range(5):
        a = k * 1.3
        add(sphere("leaf", 0.22 + 0.06 * (k % 2), (x + 0.12 * math.cos(a), y + 0.12 * math.sin(a), 0.5 + h * (0.3 + 0.12 * k)),
                   fm(hexc(["#2f5a2a", "#3d6b30", "#264d22"][k % 3]), 0.7), 10, 6, (1, 1, 1.3)))


def sofa(x, y, w=2.0, col="#5a5a60", facing=-1, rot=False):
    m = fm(hexc(col), 0.85)
    if not rot:
        B((w, 0.85, 0.42), (x, y, 0.21), m, 0.04)
        B((w, 0.22, 0.45), (x, y - facing * 0.32, 0.62), m, 0.05)
        for sx in (-1, 1):
            B((0.2, 0.85, 0.62), (x + sx * (w / 2 - 0.1), y, 0.31), m, 0.04)
        for k in range(3):
            B((w / 3 - 0.06, 0.6, 0.12), (x - w / 3 + k * w / 3, y + facing * 0.05, 0.48), fm(hexc(col), 0.9), 0.04)
    else:  # against a side wall, facing +x or -x
        B((0.85, w, 0.42), (x, y, 0.21), m, 0.04)
        B((0.22, w, 0.45), (x - facing * 0.32, y, 0.62), m, 0.05)
        for sy in (-1, 1):
            B((0.85, 0.2, 0.62), (x, y + sy * (w / 2 - 0.1), 0.31), m, 0.04)


def table(x, y, w, d, h=0.72, top="#6a4a30", legs=None):
    tm = fm(hexc(top), 0.45)
    B((w, d, 0.04), (x, y, h), tm, 0.005)
    lm = legs or tm
    for sx in (-1, 1):
        for sy in (-1, 1):
            B((0.05, 0.05, h), (x + sx * (w / 2 - 0.06), y + sy * (d / 2 - 0.06), h / 2), lm)


def bed(x, y, w=1.4, l=2.0, sheet="#e8e4dc", cover="#7a8aa8", along="y"):
    if along == "y":
        B((w, l, 0.3), (x, y, 0.2), fm(hexc("#5a4632"), 0.6))
        B((w - 0.04, l - 0.04, 0.18), (x, y, 0.42), fm(hexc(sheet), 0.9), 0.04)
        B((w - 0.02, l * 0.65, 0.06), (x, y - l * 0.17, 0.53), fm(hexc(cover), 0.95), 0.03)
        B((w * 0.8, 0.35, 0.12), (x, y + l / 2 - 0.25, 0.56), fm(hexc("#f0ede6"), 0.95), 0.05)
        B((w, 0.06, 0.9), (x, y + l / 2, 0.45), fm(hexc("#5a4632"), 0.6))
    else:
        B((l, w, 0.3), (x, y, 0.2), fm(hexc("#5a4632"), 0.6))
        B((l - 0.04, w - 0.04, 0.18), (x, y, 0.42), fm(hexc(sheet), 0.9), 0.04)
        B((l * 0.65, w - 0.02, 0.06), (x - l * 0.17, y, 0.53), fm(hexc(cover), 0.95), 0.03)
        B((0.35, w * 0.8, 0.12), (x + l / 2 - 0.25, y, 0.56), fm(hexc("#f0ede6"), 0.95), 0.05)


def tv(x, y, w=1.2, on=True, side=None):
    glow = (0.5, 0.65, 0.9) if on else None
    if side is None:
        B((w, 0.05, w * 0.58), (x, y, 1.05), fm(hexc("#0a0a0c"), 0.2, emit=glow, strength=2.5))
        B((w * 1.1, 0.4, 0.45), (x, y + 0.1, 0.225), fm(hexc("#2a2420"), 0.5))
    else:
        B((0.05, w, w * 0.58), (x, y, 1.05), fm(hexc("#0a0a0c"), 0.2, emit=glow, strength=2.5))
        B((0.4, w * 1.1, 0.45), (x + side * 0.1, y, 0.225), fm(hexc("#2a2420"), 0.5))


def pendant(x, y, col=(1.0, 0.75, 0.45), drop=0.9, r=0.18, s=12.0):
    add(cyl("cord", 0.006, drop, (x, y, H - drop / 2), fm(hexc("#111"), 0.5), 6))
    add(cyl("shade", r, 0.22, (x, y, H - drop - 0.05), fm(hexc("#222"), 0.5), 20, r2=r * 0.35))
    add(sphere("bulb", 0.06, (x, y, H - drop - 0.14), fm((1, 1, 1), 0.3, emit=col, strength=s), 10, 6))


def ceiling_panels(nx, ny, col=(0.95, 0.97, 1.0), s=6.0, w=0.6, l=1.2):
    for i in range(nx):
        for j in range(ny):
            B((w, l, 0.02), ((i + 0.5) * W / nx, (j + 0.5) * D / ny, H - 0.012), fm((1, 1, 1), 0.3, emit=col, strength=s))


def boxes(x, y, n, rng, area=(1.0, 1.0)):
    for k in range(n):
        s = rng.uniform(0.3, 0.55)
        bx, by = x + rng.uniform(-area[0] / 2, area[0] / 2), y + rng.uniform(-area[1] / 2, area[1] / 2)
        z = 0
        for _ in range(rng.randint(1, 4)):
            B((s, s * 0.8, s * 0.7), (bx, by, z + s * 0.35), fm(hexc(rng.choice(["#b08a5a", "#a07a4a", "#c49a68"])), 0.9), rot=(0, 0, rng.uniform(-0.2, 0.2)))
            z += s * 0.7


def frame_art(x, z, w, h, rng, y=D - 0.03):
    B((w + 0.06, 0.03, h + 0.06), (x, y, z), fm(hexc("#1a1a1a"), 0.5))
    c1, c2 = hexc(rng.choice(["#c86a3a", "#3a6ac8", "#d8c070", "#5a8a5a", "#b03a5a"])), hexc(rng.choice(["#e8e0d0", "#2a2a2a", "#7a9ab8"]))
    B((w, 0.02, h / 2), (x, y - 0.02, z + h / 4), fm(c1, 0.8))
    B((w, 0.02, h / 2), (x, y - 0.02, z - h / 4), fm(c2, 0.8))


def window_back(x, w, z0, h, sky=(0.55, 0.65, 0.8)):
    """A window in the back wall: the far side of the building, the sky beyond."""
    B((w, 0.02, h), (x, D - 0.01, z0 + h / 2), fm((0.2, 0.2, 0.2), 0.2, emit=sky, strength=1.6))
    for k in range(3):
        B((0.05, 0.05, h), (x - w / 2 + k * w / 2, D - 0.03, z0 + h / 2), fm(hexc("#ccc"), 0.4, 0.8))


def door(x, col="#8a7a68", wall="back", y=None):
    if wall == "back":
        B((0.9, 0.04, 2.05), (x, D - 0.03, 1.025), fm(hexc(col), 0.5))
        add(cyl("knob", 0.025, 0.08, (x + 0.35, D - 0.07, 1.0), fm(hexc("#ccc"), 0.3, 1.0), 8, "Y"))
    else:
        B((0.04, 0.9, 2.05), (x, y, 1.025), fm(hexc(col), 0.5))


# ---- the shell ------------------------------------------------------------------------------------------------------------------------------
def shell(floor, wall, ceiling="ceiling_board", wall_col=None, side=None, skirting="#efece6"):
    fl = tex(floor) if floor in mats.LIB else fm(hexc(floor), 0.6)
    wl = (fm(hexc(wall_col), 0.9) if wall_col else tex(wall))
    sl = fm(hexc(side), 0.9) if side else wl
    cl = tex(ceiling) if ceiling in mats.LIB else fm(hexc(ceiling), 0.9)
    B((W + 0.4, D + 0.4, 0.1), (W / 2, D / 2, -0.05), fl)
    B((W + 0.4, D + 0.4, 0.1), (W / 2, D / 2, H + 0.05), cl)
    B((W + 0.4, 0.1, H + 0.2), (W / 2, D + 0.05, H / 2), wl)
    B((0.1, D + 0.4, H + 0.2), (-0.05, D / 2, H / 2), sl)
    B((0.1, D + 0.4, H + 0.2), (W + 0.05, D / 2, H / 2), sl)
    sk = fm(hexc(skirting), 0.5)
    B((W, 0.015, 0.08), (W / 2, D - 0.008, 0.04), sk)
    B((0.015, D, 0.08), (0.008, D / 2, 0.04), sk)
    B((0.015, D, 0.08), (W - 0.008, D / 2, 0.04), sk)


def area_light(x, y, power, col=(1, 1, 1), size=1.5):
    ld = bpy.data.lights.new("L", "AREA")
    ld.energy = power; ld.color = col; ld.size = size
    o = bpy.data.objects.new("L", ld)
    o.location = (x, y, H - 0.05)
    bpy.context.scene.collection.objects.link(o)


WARM, NEUTRAL, COOL = (1.0, 0.8, 0.6), (1.0, 0.93, 0.85), (0.9, 0.95, 1.0)


# ---- work ------------------------------------------------------------------------------------------------------------------------------
def r_open_office(rng):
    shell("carpet_tile", "wallpaper")
    ceiling_panels(3, 3, COOL)
    area_light(2, 2, 260, COOL, 3.0)
    for row, y in enumerate((1.0, 2.3, 3.4)):
        for k, x in enumerate((0.8, 2.0, 3.2)):
            desk(x, y, 1.15, 0.7)
            monitor(x - 0.2, y + 0.18, s=2.0)
            if rng.random() < 0.6:
                monitor(x + 0.3, y + 0.18, s=2.0)
            chair(x, y - 0.55, rng.choice(["#202024", "#2a3550", "#3a3a3a"]))
            if rng.random() < 0.5:
                B((0.3, 0.22, 0.04), (x + 0.3, y - 0.1, 0.755), fm(hexc("#f2f0ea"), 0.9))
        B((3.6, 0.04, 0.45), (2.0, y + 0.37, 0.95), fm(hexc("#8a8e94"), 0.85))
    shelf(0.6, D - 0.2, 1.0, 1.9, rng, frame="#9a9ea4")
    plant(3.6, 3.75, 1.0)


def r_meeting(rng):
    shell("carpet_blue", "wallpaper", wall_col="#d8d6d0")
    ceiling_panels(2, 2, COOL, 5)
    area_light(2, 2, 200, COOL, 2.0)
    table(2.0, 2.2, 1.2, 2.6, top="#e8e6e0", legs=fm(hexc("#555"), 0.3, 1.0))
    for y in (1.3, 1.9, 2.5, 3.1):
        chair(1.2, y, "#1a1a1e", 0)
        chair(2.8, y, "#1a1a1e", 0)
    B((1.8, 0.04, 1.0), (2.0, D - 0.03, 1.5), fm(hexc("#0b0d10"), 0.2, emit=(0.3, 0.5, 0.8), strength=1.5))
    B((1.4, 0.03, 0.4), (2.0, D - 0.06, 1.55), fm(hexc("#f0f0f0"), 0.4, emit=(0.9, 0.9, 0.9), strength=1.5))
    plant(0.4, 3.6, 0.9)


def r_executive(rng):
    shell("carpet_warm", "wallpaper", wall_col="#c8bca8")
    area_light(2, 2.2, 160, WARM, 2.0)
    desk(2.0, 2.4, 1.8, 0.85, fm(hexc("#3e2a1c"), 0.35), fm(hexc("#3e2a1c"), 0.35))
    B((1.8, 0.05, 0.68), (2.0, 2.4 - 0.4, 0.38), fm(hexc("#3e2a1c"), 0.35))
    chair(2.0, 3.0, "#121010", -1)
    monitor(2.3, 2.6, s=1.5)
    shelf(1.0, D - 0.2, 1.6, 2.1, rng, frame="#3e2a1c")
    shelf(3.0, D - 0.2, 1.6, 2.1, rng, frame="#3e2a1c")
    sofa(0.5, 1.6, 1.8, "#2a2220", 1, rot=True)
    plant(3.6, 1.0, 1.4, "#2a2a2a")
    pendant(2.0, 2.4, WARM, 0.6, 0.25)


def r_server(rng):
    shell("floor_lino", "wallpaper", wall_col="#cfd2d4", ceiling="#d8dadc")
    ceiling_panels(2, 3, COOL, 7, 0.3, 1.2)
    area_light(2, 2, 180, COOL, 2.0)
    for x in (0.5, 1.2, 2.8, 3.5):
        for y in (1.6, 2.4, 3.2):
            B((0.6, 0.75, 2.0), (x, y, 1.0), fm(hexc("#121316"), 0.5, 0.3))
            for k in range(14):
                c = rng.choice([(0.1, 1.0, 0.3), (0.2, 0.6, 1.0), (1.0, 0.6, 0.1), (0.1, 1.0, 0.3)])
                B((0.02, 0.01, 0.02), (x + rng.uniform(-0.25, 0.25), y - 0.38, 0.2 + k * 0.12), fm((0, 0, 0), 0.3, emit=c, strength=12))
    B((W, 0.02, 0.02), (W / 2, 0.5, 2.5), fm(hexc("#e8c020"), 0.5))


def r_callcentre(rng):
    shell("carpet_blue", "wallpaper", wall_col="#e0ddd6")
    ceiling_panels(3, 4, COOL, 6, 0.6, 0.6)
    area_light(2, 2, 240, COOL, 3.0)
    for y in (0.9, 1.8, 2.7, 3.5):
        for x in (0.55, 1.5, 2.5, 3.45):
            desk(x, y, 0.9, 0.6, fm(hexc("#c8c4bc"), 0.5))
            monitor(x, y + 0.12, s=2.2, w=0.42)
            chair(x, y - 0.45, rng.choice(["#3a2a50", "#202024", "#1e3a3a"]))
            B((0.9, 0.04, 0.6), (x, y + 0.3, 1.02), fm(hexc("#5a6a7a"), 0.9))
        B((0.04, 0.6, 0.6), (1.03, y, 1.02), fm(hexc("#5a6a7a"), 0.9))
        B((0.04, 0.6, 0.6), (2.97, y, 1.02), fm(hexc("#5a6a7a"), 0.9))


def r_lobby(rng):
    shell("platform", "wallpaper", wall_col="#b8b2a8", ceiling="#e8e6e2")
    area_light(2, 2, 200, NEUTRAL, 2.5)
    for x in (1.2, 2.8):
        B((1.0, 0.06, 2.2), (x, D - 0.04, 1.1), fm(hexc("#b8bcc0"), 0.25, 1.0))
        B((0.01, 0.07, 2.2), (x, D - 0.08, 1.1), fm(hexc("#333"), 0.4))
        B((0.12, 0.02, 0.2), (x + 0.65, D - 0.05, 1.1), fm(hexc("#222"), 0.4, emit=(1, 0.6, 0.2), strength=3))
        B((0.4, 0.02, 0.08), (x, D - 0.05, 2.35), fm(hexc("#111"), 0.4, emit=(1, 0.3, 0.1), strength=4))
    plant(0.4, 3.6, 1.3)
    plant(3.6, 3.6, 1.3)
    for k in range(4):
        B((0.5, 0.5, 0.02), (2.0, 0.6 + k * 0.9, H - 0.01), fm((1, 1, 1), 0.3, emit=NEUTRAL, strength=6))


def r_stock(rng):
    shell("concrete", "concrete", ceiling="concrete")
    area_light(2, 2, 120, COOL, 1.0)
    B((0.1, 1.2, 0.02), (2.0, 2.0, H - 0.02), fm((1, 1, 1), 0.3, emit=COOL, strength=8))
    for x in (0.4, 3.6):
        for y in (1.2, 2.4, 3.5):
            gm = fm(hexc("#5a7aa8"), 0.5, 0.6)
            for z in (0.1, 0.8, 1.5, 2.2):
                B((0.6, 1.0, 0.04), (x, y, z), fm(hexc("#9a9ea2"), 0.5, 0.8))
                boxes(x, y, 2, rng, (0.3, 0.6)) if z < 0.2 else [B((0.5, 0.4, 0.3), (x, y + rng.uniform(-0.25, 0.25), z + 0.17), fm(hexc(rng.choice(["#b08a5a", "#c8c4bc", "#5a6a8a"])), 0.9))]
            for sy in (-1, 1):
                B((0.04, 0.04, 2.4), (x - 0.28, y + sy * 0.48, 1.2), gm)
                B((0.04, 0.04, 2.4), (x + 0.28, y + sy * 0.48, 1.2), gm)
    boxes(2.0, 2.6, 6, rng, (1.2, 1.4))


def r_vacant(rng):
    shell("concrete_dark", "concrete", ceiling="concrete")
    area_light(2, 2.5, 60, COOL, 1.0)
    for x in (0.8, 2.0, 3.2):
        B((0.12, 2.8, 0.02), (x, 2.0, H - 0.02), fm((1, 1, 1), 0.3, emit=COOL, strength=5 if rng.random() < 0.7 else 0.0))
    B((0.5, 0.5, H), (2.0, 2.6, H / 2), tex("concrete"))
    B((0.6, 0.6, 1.0), (3.3, 3.3, 0.5), fm(hexc("#b08a5a"), 0.9))
    B((1.2, 0.02, 0.8), (1.0, 0.8, 0.95), fm(hexc("#e8e4dc"), 0.7))
    window_back(2.0, 3.0, 0.9, 1.6)


def r_pantry(rng):
    shell("floor_lino", "tiles_white", wall_col=None)
    area_light(2, 2, 200, NEUTRAL, 2.0)
    B((3.0, 0.6, 0.9), (2.0, D - 0.3, 0.45), fm(hexc("#e8e6e0"), 0.4))
    B((3.0, 0.62, 0.04), (2.0, D - 0.3, 0.92), fm(hexc("#3a3a3a"), 0.3))
    B((3.0, 0.35, 0.7), (2.0, D - 0.18, 1.9), fm(hexc("#e8e6e0"), 0.4))
    B((0.7, 0.65, 1.8), (0.4, D - 0.4, 0.9), fm(hexc("#d8d8d8"), 0.3, 0.6))
    B((0.35, 0.35, 1.2), (3.65, 2.5, 0.6), fm(hexc("#f0f0f0"), 0.3))
    add(cyl("water", 0.14, 0.4, (3.65, 2.5, 1.4), fm(hexc("#5a8ab8"), 0.1), 16))
    table(1.8, 1.6, 1.0, 1.0, top="#e0dcd4", legs=fm(hexc("#333"), 0.3, 1.0))
    for (x, y) in ((1.2, 1.6), (2.4, 1.6)):
        chair(x, y, "#c84a2a", 0)
    B((0.8, 0.3, 0.02), (2.0, 2.0, H - 0.01), fm((1, 1, 1), 0.3, emit=NEUTRAL, strength=6))


def r_reception(rng):
    shell("wood_oak", "wallpaper", wall_col="#2a2a2e")
    area_light(2, 2, 200, WARM, 2.0)
    B((2.4, 0.6, 1.05), (2.0, 2.6, 0.525), fm(hexc("#e8e4dc"), 0.3), 0.02)
    B((2.4, 0.04, 0.06), (2.0, 2.3, 0.2), fm((0, 0, 0), 0.3, emit=WARM, strength=6))
    B((1.6, 0.03, 0.4), (2.0, D - 0.04, 1.8), fm(hexc("#c8a050"), 0.3, 0.9, emit=(1, 0.85, 0.5), strength=1.5))
    plant(0.4, 3.5, 1.4)
    sofa(3.4, 1.2, 1.6, "#4a4038", 1, rot=True)
    for x in (1.2, 2.0, 2.8):
        pendant(x, 2.6, WARM, 0.8, 0.12)


def r_studio(rng):
    shell("wood_oak", "concrete", ceiling="concrete")
    area_light(2, 2, 180, NEUTRAL, 2.5)
    table(1.4, 2.0, 1.6, 0.9, top="#e8e4dc", legs=fm(hexc("#222"), 0.4, 1.0))
    table(3.0, 2.8, 1.2, 0.9, top="#8a6440")
    monitor(1.2, 2.25, s=2.5, w=0.7)
    for x in (1.0, 1.8):
        chair(x, 1.4, "#c8c4bc")
    shelf(3.2, D - 0.2, 1.4, 2.2, rng, frame="#e8e8e8")
    plant(0.4, 3.6, 1.5)
    plant(0.4, 0.8, 0.8)
    for x in (1.4, 3.0):
        pendant(x, 2.4, WARM, 1.0, 0.2)
    for k in range(4):
        B((0.5, 0.02, 0.7), (0.6 + k * 0.6, D - 0.03, 1.6), fm(hexc(rng.choice(["#e8d0a0", "#a0c8e8", "#e8a0a0", "#f0f0f0"])), 0.8))


def r_dental(rng):
    shell("floor_lino", "wallpaper", wall_col="#f0f2f2", ceiling="#f4f4f4")
    ceiling_panels(2, 2, COOL, 8)
    area_light(2, 2, 260, COOL, 2.0)
    B((0.7, 1.8, 0.5), (2.0, 2.2, 0.55), fm(hexc("#5ab0b0"), 0.35), 0.06)
    B((0.6, 0.5, 0.4), (2.0, 3.1, 0.85), fm(hexc("#5ab0b0"), 0.35), 0.06)
    add(cyl("base", 0.15, 0.4, (2.0, 2.2, 0.2), fm(hexc("#eee"), 0.3), 16))
    add(cyl("arm", 0.03, 1.4, (2.7, 2.8, 1.2), fm(hexc("#eee"), 0.3), 8))
    add(sphere("lamp", 0.18, (2.3, 2.4, 1.9), fm(hexc("#eee"), 0.3, emit=(1, 1, 1), strength=6), 12, 6, (1, 0.6, 0.6)))
    B((3.6, 0.5, 0.9), (2.0, D - 0.25, 0.45), fm(hexc("#f0f0f0"), 0.3))
    B((3.6, 0.3, 0.6), (2.0, D - 0.15, 1.8), fm(hexc("#f0f0f0"), 0.3))
    monitor(0.8, 2.6, s=2.5)
    chair(1.2, 1.8, "#4a4a50")


def r_gym(rng):
    shell("rubber", "wallpaper", wall_col="#2a2c30", ceiling="#1a1a1c")
    area_light(2, 2, 220, COOL, 3.0)
    B((W - 0.2, 0.02, 2.0), (2.0, D - 0.02, 1.2), fm(hexc("#9aa0a8"), 0.02, 1.0))
    for x in (0.8, 2.0, 3.2):
        B((0.75, 1.8, 0.2), (x, 2.0, 0.15), fm(hexc("#1a1a1c"), 0.6))
        B((0.06, 0.06, 1.2), (x - 0.3, 1.2, 0.8), fm(hexc("#888"), 0.3, 1.0))
        B((0.06, 0.06, 1.2), (x + 0.3, 1.2, 0.8), fm(hexc("#888"), 0.3, 1.0))
        B((0.7, 0.2, 0.35), (x, 1.15, 1.45), fm(hexc("#111"), 0.3, emit=(0.3, 0.6, 1.0), strength=1.5))
    for k in range(5):
        B((0.12, 3.6, 0.02), (0.4 + k * 0.8, 2.0, H - 0.01), fm((1, 1, 1), 0.3, emit=COOL, strength=7))
    for k in range(6):
        add(cyl("db", 0.06, 0.35, (0.6 + k * 0.5, D - 0.4, 0.5), fm(hexc("#222"), 0.4, 0.6), 10, "X"))


def r_cram(rng):
    shell("floor_lino", "wallpaper", wall_col="#e8e4d8")
    ceiling_panels(3, 3, COOL, 6, 0.3, 1.2)
    area_light(2, 2, 240, COOL, 3.0)
    B((3.4, 0.03, 1.1), (2.0, D - 0.03, 1.5), fm(hexc("#1e4a32"), 0.85))
    for k in range(9):
        B((rng.uniform(0.1, 0.3), 0.01, 0.02), (0.6 + k * 0.35, D - 0.05, 1.3 + rng.uniform(0, 0.6)), fm(hexc("#f0f0f0"), 0.9))
    for y in (0.9, 1.7, 2.5):
        for x in (0.8, 1.6, 2.4, 3.2):
            desk(x, y, 0.6, 0.45, fm(hexc("#c8a878"), 0.5), fm(hexc("#555"), 0.4, 0.8))
            chair(x, y - 0.35, "#4a4a4a")
            if rng.random() < 0.5:
                B((0.2, 0.28, 0.02), (x, y, 0.745), fm(hexc("#f4f0e8"), 0.9))


def r_izakaya(rng):
    shell("wood_dark", "wood_oak", ceiling="wood_dark")
    area_light(2, 2, 110, WARM, 2.0)
    for (x, y) in ((1.0, 1.4), (3.0, 1.4), (1.0, 3.0), (3.0, 3.0)):
        table(x, y, 1.1, 0.75, 0.7, top="#5a3a22")
        for sx in (-1, 1):
            B((0.35, 0.35, 0.45), (x + sx * 0.75, y, 0.225), fm(hexc("#3a2616"), 0.6))
        pendant(x, y, (1.0, 0.65, 0.35), 1.1, 0.2, 14)
        for k in range(rng.randint(2, 5)):
            add(cyl("glass", 0.035, 0.12, (x + rng.uniform(-0.4, 0.4), y + rng.uniform(-0.25, 0.25), 0.78), fm(hexc("#e8c070"), 0.2), 10))
    for k in range(7):
        B((0.3, 0.02, 0.5), (0.4 + k * 0.53, D - 0.03, 2.0), fm(hexc(rng.choice(["#f0e8d0", "#e8d8b0"])), 0.9))
    for k in range(5):
        add(sphere("lantern", 0.14, (0.5 + k * 0.75, 0.5, 2.4), fm(hexc("#d02020"), 0.7, emit=(1, 0.3, 0.15), strength=5), 12, 8, (1, 1, 1.4)))


def r_karaoke(rng):
    shell("carpet_warm", "wallpaper", wall_col="#2a1838", ceiling="#120a18")
    area_light(2, 2, 40, (0.8, 0.4, 1.0), 2.0)
    B((2.2, 0.04, 1.25), (2.0, D - 0.04, 1.4), fm(hexc("#050505"), 0.2, emit=(0.9, 0.4, 0.8), strength=3))
    sofa(0.5, 2.2, 3.0, "#5a1a2a", 1, rot=True)
    sofa(2.0, 0.8, 2.6, "#5a1a2a", -1)
    table(2.0, 2.0, 1.4, 0.7, 0.45, top="#111")
    for k in range(10):
        c = rng.choice([(1, 0.2, 0.8), (0.2, 0.6, 1.0), (1.0, 0.8, 0.2)])
        add(sphere("led", 0.03, (0.3 + k * 0.38, 0.3 + rng.uniform(0, 3.4), H - 0.03), fm((0, 0, 0), 0.3, emit=c, strength=20), 6, 4))
    B((W, 0.03, 0.03), (W / 2, D - 0.06, 0.05), fm((0, 0, 0), 0.3, emit=(0.3, 0.5, 1.0), strength=8))


WORK = [r_open_office, r_meeting, r_executive, r_server, r_callcentre, r_lobby, r_stock, r_vacant,
        r_pantry, r_reception, r_studio, r_dental, r_gym, r_cram, r_izakaya, r_karaoke]


# ---- home ------------------------------------------------------------------------------------------------------------------------------
def r_living(rng):
    shell("wood_oak", "wallpaper")
    area_light(2, 2, 120, WARM, 1.5)
    sofa(2.0, 1.2, 2.2, rng.choice(["#6a6a70", "#8a7a6a", "#3a4a5a"]), 1)
    tv(2.0, D - 0.25, 1.3)
    table(2.0, 2.3, 1.0, 0.5, 0.4, top="#6a4a30")
    B((2.4, 1.6, 0.01), (2.0, 2.1, 0.005), fm(hexc(rng.choice(["#a89880", "#7a8aa0", "#b0a090"])), 0.95))
    plant(3.6, 3.6, 1.1)
    shelf(0.4, 2.4, 1.6, 1.8, rng, against="side", frame="#e8e4dc")
    B((0.45, 0.45, 0.04), (2.0, 2.0, H - 0.02), fm((1, 1, 1), 0.3, emit=WARM, strength=8))
    frame_art(3.3, 1.9, 0.6, 0.45, rng)


def r_kitchen(rng):
    shell("floor_lino", "wallpaper")
    area_light(2, 2, 150, NEUTRAL, 1.5)
    B((3.4, 0.62, 0.88), (2.0, D - 0.31, 0.44), fm(hexc(rng.choice(["#e8e6e0", "#8a6a4a", "#3a3a3e"])), 0.35))
    B((3.4, 0.64, 0.04), (2.0, D - 0.31, 0.9), fm(hexc("#d8d8d8"), 0.25, 0.8))
    B((3.4, 0.34, 0.65), (2.0, D - 0.17, 1.95), fm(hexc("#e8e6e0"), 0.35))
    B((3.4, 0.02, 0.6), (2.0, D - 0.01, 1.25), tex("tiles_white"))
    add(cyl("pot", 0.12, 0.14, (1.2, D - 0.3, 0.99), fm(hexc("#c8c8c8"), 0.25, 1.0), 16))
    B((0.7, 0.65, 1.8), (0.4, 2.6, 0.9), fm(hexc("#e0e0e0"), 0.3, 0.3))
    table(2.2, 1.6, 1.2, 0.8, top="#8a6440")
    for (x, y, f) in ((1.8, 1.0, 1), (2.6, 1.0, 1), (1.8, 2.2, -1), (2.6, 2.2, -1)):
        chair(x, y, "#6a4a30", -f)
    pendant(2.2, 1.6, WARM, 1.0, 0.22)


def r_bedroom(rng):
    shell("wood_oak", "wallpaper", wall_col=rng.choice(["#e6dccc", "#d8dce0", "#e8e0d8"]))
    area_light(2, 2, 70, WARM, 1.2)
    bed(2.0, 2.8, 1.5, 2.0, cover=rng.choice(["#7a8aa8", "#a87a7a", "#e8e4dc", "#5a6a5a"]))
    B((0.45, 0.4, 0.5), (0.9, 3.5, 0.25), fm(hexc("#8a6440"), 0.5))
    add(cyl("lamp", 0.12, 0.25, (0.9, 3.5, 0.75), fm(hexc("#f0e8d8"), 0.8, emit=(1, 0.75, 0.45), strength=6), 14, r2=0.09))
    B((0.6, 1.4, 2.1), (3.65, 1.0, 1.05), fm(hexc("#e8e4dc"), 0.4))
    B((1.4, 0.8, 0.01), (2.0, 1.4, 0.005), fm(hexc("#b0a090"), 0.95))
    frame_art(2.0, 1.7, 0.8, 0.5, rng)


def r_kids(rng):
    shell("wood_oak", "wallpaper", wall_col=rng.choice(["#cfe0f0", "#f0dccf", "#e0f0d0"]))
    area_light(2, 2, 110, NEUTRAL, 1.5)
    bed(0.65, 2.6, 1.0, 2.0, cover="#e05a3a")
    B((1.0, 2.0, 0.05), (0.65, 2.6, 1.5), fm(hexc("#e8e4dc"), 0.5))
    B((0.95, 1.9, 0.12), (0.65, 2.6, 1.6), fm(hexc("#3a7ae0"), 0.95))
    desk(3.0, D - 0.4, 1.1, 0.55, fm(hexc("#e8e4dc"), 0.4))
    B((0.4, 0.3, 0.35), (3.0, D - 0.3, 1.0), fm(hexc("#e8c020"), 0.6))
    chair(3.0, D - 0.9, "#3ac0a0")
    for k in range(10):
        c = rng.choice(["#e03a3a", "#3a7ae0", "#e8c020", "#3ac06a", "#e07a20"])
        B((0.15, 0.15, 0.15), (1.6 + rng.uniform(0, 1.2), 1.2 + rng.uniform(0, 1.2), 0.075), fm(hexc(c), 0.5), rot=(0, 0, rng.uniform(0, 1)))
    B((1.6, 1.2, 0.01), (2.2, 1.6, 0.005), fm(hexc("#8ac0e8"), 0.95))
    B((0.5, 0.5, 0.04), (2.0, 2.0, H - 0.02), fm((1, 1, 1), 0.3, emit=NEUTRAL, strength=8))


def r_washitsu(rng):
    shell("tatami", "plaster", wall_col="#d8ccb0", ceiling="wood_oak")
    area_light(2, 2, 90, WARM, 1.5)
    for k in range(4):
        B((0.02, D, 0.012), (k * 1.0, D / 2, 0.006), fm(hexc("#3a3020"), 0.8))
    B((1.4, 0.4, 0.15), (1.0, D - 0.2, 0.075), fm(hexc("#3e2a1c"), 0.4))
    B((1.2, 0.02, 0.9), (1.0, D - 0.02, 1.6), fm(hexc("#e8e0c8"), 0.9))
    add(cyl("vase", 0.08, 0.3, (1.3, D - 0.2, 0.3), fm(hexc("#2a3a4a"), 0.3), 12))
    for k in range(6):
        B((0.03, 0.03, 2.0), (2.2 + k * 0.32, D - 0.03, 1.0), fm(hexc("#c8a878"), 0.6))
        B((0.3, 0.01, 2.0), (2.36 + k * 0.32, D - 0.02, 1.0), fm(hexc("#f0ece0"), 0.9, emit=(1, 0.9, 0.75), strength=0.6))
    table(2.0, 1.8, 1.2, 0.8, 0.35, top="#4a2e1a")
    for (x, y) in ((1.2, 1.8), (2.8, 1.8)):
        B((0.5, 0.5, 0.08), (x, y, 0.04), fm(hexc("#8a3a2a"), 0.9), 0.02)
    B((0.5, 0.5, 0.3), (2.0, 2.0, H - 0.4), fm(hexc("#f0e8d0"), 0.9, emit=(1, 0.8, 0.55), strength=4))


def r_study(rng):
    shell("wood_dark", "wallpaper", wall_col="#c8d0c8")
    area_light(2, 2, 70, WARM, 1.0)
    desk(2.0, D - 0.5, 1.6, 0.7, fm(hexc("#6a4a30"), 0.4), fm(hexc("#6a4a30"), 0.4))
    monitor(1.8, D - 0.35, s=2.5, w=0.65)
    chair(2.0, D - 1.1, "#1a1a1e")
    shelf(0.25, 2.0, 2.4, 2.2, rng, against="side")
    shelf(3.75, 2.0, 2.4, 2.2, rng, against="side")
    add(cyl("desklamp", 0.08, 0.1, (2.6, D - 0.4, 1.05), fm(hexc("#222"), 0.5, emit=(1, 0.8, 0.5), strength=10), 12))


def r_student(rng):
    shell("floor_lino", "wallpaper", wall_col="#e0dcd4")
    area_light(2, 2, 50, NEUTRAL, 1.0)
    bed(3.3, 2.8, 1.0, 2.0, cover=rng.choice(["#2a2a3a", "#6a3a3a"]), sheet="#c8c4bc")
    desk(1.0, D - 0.4, 1.2, 0.6)
    monitor(1.0, D - 0.3, (0.6, 0.3, 1.0), s=4.0, w=0.7)
    chair(1.0, D - 0.95, "#c02020")
    boxes(0.6, 1.0, 3, rng, (0.6, 0.6))
    for k in range(8):
        c = rng.choice(["#2a2a3a", "#e8e4dc", "#3a5a8a", "#8a3a3a"])
        B((rng.uniform(0.3, 0.5), rng.uniform(0.2, 0.4), 0.04), (1.6 + rng.uniform(0, 1.2), 1.0 + rng.uniform(0, 1.6), 0.02 + k * 0.005), fm(hexc(c), 0.95), rot=(0, 0, rng.uniform(0, 3)))
    table(2.0, 1.6, 0.7, 0.5, 0.35, top="#e8e4dc")
    for k in range(3):
        add(cyl("can", 0.033, 0.12, (1.8 + k * 0.15, 1.6, 0.43), fm(hexc(rng.choice(["#c02020", "#2050c0", "#e0e0e0"])), 0.3, 0.8), 10))
    add(sphere("led", 0.02, (2.0, D - 0.05, 2.6), fm((0, 0, 0), 0.3, emit=(1.0, 0.2, 0.6), strength=4), 6, 4, (100, 1, 1)))


def r_elderly(rng):
    shell("tatami", "plaster", wall_col="#cfc4a8", ceiling="wood_oak")
    area_light(2, 2, 70, NEUTRAL, 1.2)
    table(2.0, 2.0, 0.9, 0.9, 0.4, top="#5a3a22")
    B((1.6, 1.6, 0.15), (2.0, 2.0, 0.3), fm(hexc(rng.choice(["#8a3a3a", "#3a5a7a", "#7a6a3a"])), 0.95), 0.05)
    B((0.9, 0.5, 1.6), (0.8, D - 0.25, 0.8), fm(hexc("#2a1a10"), 0.3))
    B((0.5, 0.05, 0.6), (0.8, D - 0.5, 1.1), fm(hexc("#c8a040"), 0.3, 1.0))
    B((1.4, 0.45, 0.9), (3.0, D - 0.23, 0.45), fm(hexc("#6a4a30"), 0.5))
    tv(3.0, D - 0.3, 0.8, side=None)
    B((0.06, 0.04, 0.4), (0.6, 0.4, 2.2), fm(hexc("#e8e0d0"), 0.9))
    add(cyl("light", 0.3, 0.1, (2.0, 2.0, H - 0.08), fm(hexc("#f0f0f0"), 0.9, emit=COOL, strength=6), 20))


def r_ldk(rng):
    shell("wood_oak", "wallpaper", wall_col="#f0ece4")
    area_light(2, 2, 150, WARM, 2.0)
    sofa(1.0, 1.0, 1.8, rng.choice(["#c8b8a0", "#5a6a7a"]), 1)
    tv(0.25, 2.4, 1.1, side=-1)
    B((2.0, 0.6, 0.9), (2.8, D - 0.3, 0.45), fm(hexc("#e8e6e0"), 0.35))
    B((0.6, 1.4, 0.9), (3.4, 2.6, 0.45), fm(hexc("#e8e6e0"), 0.35))
    B((0.62, 1.42, 0.04), (3.4, 2.6, 0.92), fm(hexc("#2a2a2a"), 0.25))
    for k in range(3):
        pendant(3.4, 2.1 + k * 0.5, WARM, 0.8, 0.1, 10)
    plant(0.4, D - 0.4, 1.4)
    for k in range(2):
        B((0.4, 0.4, 0.75), (2.6 + k * 0.5, 2.5, 0.375), fm(hexc("#2a2a2a"), 0.5))


def r_empty(rng):
    shell("wood_oak", "wallpaper", wall_col="#f0ede6")
    area_light(2, 2, 90, COOL, 1.0)
    boxes(1.0, 2.8, 5, rng, (1.0, 1.0))
    boxes(3.0, 1.4, 3, rng, (0.6, 0.6))
    B((0.3, 0.3, 0.1), (2.0, 2.0, H - 0.1), fm((1, 1, 1), 0.3, emit=COOL, strength=10))
    door(3.0, "#d8d4cc")


def r_laundry(rng):
    shell("floor_lino", "wallpaper", wall_col="#e8e8e4")
    area_light(2, 2, 90, NEUTRAL, 1.0)
    B((0.65, 0.6, 0.95), (0.5, D - 0.35, 0.475), fm(hexc("#f0f0f0"), 0.3))
    add(cyl("drum", 0.2, 0.02, (0.5, D - 0.66, 0.55), fm(hexc("#2a3a4a"), 0.1), 20, "Y"))
    add(cyl("rail", 0.015, 3.2, (2.2, 1.6, 2.2), fm(hexc("#ccc"), 0.3, 1.0), 8, "X"))
    for k in range(9):
        c = rng.choice(["#f0f0f0", "#3a5a8a", "#c04040", "#e8d8a0", "#2a2a2a", "#7ab0e0"])
        B((rng.uniform(0.3, 0.5), 0.02, rng.uniform(0.5, 0.8)), (0.9 + k * 0.33, 1.6, 1.8), fm(hexc(c), 0.95))
    door(2.6)
    B((0.4, 0.4, 0.04), (2.0, 2.4, H - 0.02), fm((1, 1, 1), 0.3, emit=NEUTRAL, strength=8))


def r_homeoffice(rng):
    shell("carpet_tile", "wallpaper", wall_col="#dcd8d0")
    area_light(2, 2, 90, NEUTRAL, 1.5)
    desk(1.3, D - 0.45, 1.6, 0.7)
    monitor(1.0, D - 0.3, s=2.6)
    monitor(1.6, D - 0.3, s=2.6)
    chair(1.3, D - 1.1, "#222")
    shelf(3.2, D - 0.2, 1.2, 2.0, rng, frame="#e8e4dc")
    plant(3.6, 1.0, 1.0)
    B((1.2, 0.9, 0.01), (1.3, 2.6, 0.005), fm(hexc("#5a5a6a"), 0.95))


def r_piano(rng):
    shell("wood_dark", "wallpaper", wall_col="#e8dcc8")
    area_light(2, 2, 100, WARM, 1.5)
    B((1.5, 0.6, 1.25), (1.5, D - 0.3, 0.625), fm(hexc("#050505"), 0.08))
    B((1.4, 0.3, 0.04), (1.5, D - 0.65, 0.74), fm(hexc("#f8f8f0"), 0.3))
    B((0.8, 0.35, 0.5), (1.5, D - 1.1, 0.25), fm(hexc("#050505"), 0.1))
    sofa(3.5, 2.0, 1.8, "#7a5a4a", 1, rot=True)
    frame_art(1.5, 2.0, 0.9, 0.5, rng)
    plant(0.4, 1.0, 1.2)
    add(cyl("floorlamp", 0.2, 0.3, (3.6, 3.5, 1.6), fm(hexc("#f0e8d8"), 0.8, emit=(1, 0.75, 0.45), strength=6), 16, r2=0.15))
    add(cyl("stem", 0.015, 1.45, (3.6, 3.5, 0.72), fm(hexc("#222"), 0.4, 1.0), 8))


def r_futon(rng):
    shell("tatami", "plaster", wall_col="#d8ccb0", ceiling="wood_oak")
    area_light(2, 2, 45, WARM, 1.0)
    for x in (1.2, 2.8):
        B((1.0, 2.0, 0.1), (x, 2.4, 0.05), fm(hexc("#f0ece4"), 0.95), 0.03)
        B((1.0, 1.4, 0.1), (x, 2.1, 0.13), fm(hexc(rng.choice(["#7a8ab0", "#b07a8a", "#8ab07a"])), 0.95), 0.04)
        B((0.5, 0.3, 0.1), (x, 3.2, 0.14), fm(hexc("#e8e4dc"), 0.95), 0.04)
    B((W, 0.6, 1.8), (2.0, D - 0.3, 1.8), fm(hexc("#e8e0c8"), 0.9))
    add(cyl("andon", 0.15, 0.4, (0.4, 3.6, 0.2), fm(hexc("#f0e8d0"), 0.9, emit=(1, 0.7, 0.4), strength=6), 4))


def r_junk(rng):
    shell("floor_lino", "wallpaper", wall_col="#d0ccc4")
    area_light(2, 2, 50, NEUTRAL, 1.0)
    boxes(1.0, 3.0, 8, rng, (1.4, 1.2))
    boxes(3.0, 3.0, 6, rng, (1.2, 1.2))
    shelf(0.25, 1.6, 2.0, 2.0, rng, against="side")
    B((0.6, 0.06, 1.2), (3.0, 1.4, 0.6), fm(hexc("#3a5a8a"), 0.4), rot=(0, 0.3, 0))
    add(cyl("fan", 0.25, 0.08, (2.4, 1.0, 1.0), fm(hexc("#e8e8e8"), 0.4), 16, "Y"))
    add(cyl("fanstem", 0.02, 0.8, (2.4, 1.0, 0.4), fm(hexc("#e8e8e8"), 0.4), 8))
    B((0.05, 1.2, 0.02), (2.0, 2.0, H - 0.02), fm((1, 1, 1), 0.3, emit=COOL, strength=6))


def r_reading(rng):
    shell("wood_oak", "wallpaper", wall_col="#3a4a42")
    area_light(2, 2, 60, WARM, 1.0)
    shelf(2.0, D - 0.2, 3.6, 2.5, rng, frame="#2a1a10")
    B((0.9, 0.9, 0.45), (1.2, 1.6, 0.225), fm(hexc("#8a4a2a"), 0.6), 0.05)
    B((0.9, 0.2, 0.55), (1.2, 2.0, 0.65), fm(hexc("#8a4a2a"), 0.6), 0.05)
    add(cyl("floorlamp", 0.18, 0.28, (0.5, 2.1, 1.55), fm(hexc("#e8d8b0"), 0.8, emit=(1, 0.7, 0.4), strength=8), 16, r2=0.12))
    add(cyl("stem", 0.015, 1.4, (0.5, 2.1, 0.7), fm(hexc("#222"), 0.4, 1.0), 8))
    plant(3.5, 1.2, 1.6)
    B((1.6, 1.2, 0.01), (1.6, 1.6, 0.005), fm(hexc("#8a2a2a"), 0.95))


HOME = [r_living, r_kitchen, r_bedroom, r_kids, r_washitsu, r_study, r_student, r_elderly,
        r_ldk, r_empty, r_laundry, r_homeoffice, r_piano, r_futon, r_junk, r_reading]
SETS = {"work": WORK, "home": HOME}


# ---- render ------------------------------------------------------------------------------------------------------------------------------
def scene_setup():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.max_bounces = 6
    try:
        sc.cycles.use_denoising = True
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        try:
            sc.view_settings.view_transform = "Filmic"
        except Exception:
            pass
    sc.view_settings.exposure = -0.45
    w = bpy.data.worlds.new("w"); sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.55, 0.62, 0.72, 1)
    bg.inputs["Strength"].default_value = 0.35
    cd = bpy.data.cameras.new("cam")
    cd.lens_unit = "FOV"
    cd.sensor_fit = "HORIZONTAL"
    cd.angle = 2 * math.atan((W / 2) / D)
    cam = bpy.data.objects.new("cam", cd)
    cam.location = (W / 2, -D, H / 2)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    sc.collection.objects.link(cam)
    sc.camera = cam


def render_room(fn, seed, path):
    import core
    core.reset(); mats._made.clear(); _fm.clear(); P.clear()
    mats.PX_CAP[0] = 512
    scene_setup()
    rng = random.Random(seed)
    fn(rng)
    export.world_uv_all([o for o in P if o.type == "MESH"])
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def build(which):
    name = which.split("_", 1)[1]
    rooms = SETS[name]
    os.makedirs(OUT, exist_ok=True)
    tmp = os.path.join(export.REPO, "Tools", "foundry", "cache", "rooms")
    os.makedirs(tmp, exist_ok=True)
    atlas = Image.new("RGB", (TILE * 4, TILE * 4))
    only = os.environ.get("ROOM_ONLY")
    for i, fn in enumerate(rooms):
        p = os.path.join(tmp, "%s_%02d_%s.png" % (name, i, fn.__name__[2:]))
        if not os.path.exists(p) or (only and fn.__name__[2:] in only.split(",")) or os.environ.get("ROOM_FORCE"):
            print("  room %s/%s" % (name, fn.__name__[2:]))
            render_room(fn, 1000 + i, p)
        im = Image.open(p).convert("RGB").resize((TILE, TILE), Image.LANCZOS)
        # atlas rows from the top: tile i at column i % 4, row i // 4 (the shader flips v)
        atlas.paste(im, ((i % 4) * TILE, (i // 4) * TILE))
    atlas.save(os.path.join(OUT, "rooms_%s.jpg" % name), quality=88)
    atlas.resize((TILE * 2, TILE * 2), Image.LANCZOS).save(os.path.join(OUT, "rooms_%s-low.jpg" % name), quality=86)
    print("  -> Web/art/rooms/rooms_%s.jpg (%d rooms)" % (name, len(rooms)))
