#!/usr/bin/env python3
"""Builds the glass curtain-wall facade set (Web/art/facades/glass_*.jpg) for the towers.

The ambientCG glass photo it replaces is a mosaic of 0.75 m tiles. Scaled onto a 200 m tower it averages
out to one flat blue, and with the tower's reflections on top it read as a building with no texture, just
a mirror. A real Tokyo curtain wall is storey-high vision glass between 1.5 m mullions, a band of opaque
spandrel glass at every floor slab, and an office you can half see through it: ceilings with light
fittings, blinds at different heights. That is what this paints, at 2048 px for 8 bays by 4 storeys
(12 m x 14.4 m), with a little float-glass waviness and dirt as surface detail.

Writes glass_color (sRGB), glass_normal (tangent space), glass_rough and glass_lights (the night map:
whole lit rooms, never part of a pane).

    python3 Tools/facades/make_glass_curtain_wall.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
OUT = os.path.join(ROOT, "Web", "art", "facades")
N = 2048
BAYS, FLOORS = 8, 4
BAY_W, FLOOR_H = 1.5, 3.6                     # metres
PX_X, PX_Y = N / (BAYS * BAY_W), N / (FLOORS * FLOOR_H)
SPANDREL = 0.95                               # metres of opaque glass over each slab
MULLION, TRANSOM = 0.07, 0.10                 # aluminium widths, metres
rng = np.random.default_rng(20261102)

ys, xs = np.mgrid[0:N, 0:N].astype(np.float32)
mx, my = xs / PX_X, ys / PX_Y                 # metres from the top-left corner
bay_u = (mx % BAY_W) / BAY_W                  # 0..1 across a bay
bay_i = (mx // BAY_W).astype(int)
fl_v = (my % FLOOR_H)                         # metres down from the slab line at the top of the storey
fl_i = (my // FLOOR_H).astype(int)

mull = (np.minimum(mx % BAY_W, BAY_W - mx % BAY_W) < MULLION / 2)
slab = (np.minimum(fl_v, FLOOR_H - fl_v) < TRANSOM / 2)
frame = mull | slab
spandrel = (fl_v >= FLOOR_H - SPANDREL) & ~frame
vision = ~frame & ~spandrel
vv = np.clip(fl_v / (FLOOR_H - SPANDREL), 0, 1)     # 0 at the top of the vision glass, 1 at the sill

# per pane choices
P = rng.random((FLOORS, BAYS, 6))
pane = lambda k: P[fl_i % FLOORS, bay_i % BAYS, k]
blind = np.where(pane(0) < 0.45, 0.0, 0.08 + pane(1) * 0.75)   # how far the blind is down (0 = up)
occupied = pane(2)

# what is behind the glass: a ceiling with recessed light rows at the top, then a dim office
ceiling = vv < 0.13
interior = np.where(ceiling, 0.30, 0.10 + 0.05 * (1 - vv))
lamp = ceiling & (np.abs(((mx + 0.375) % 0.75) - 0.375) < 0.18) & (np.abs(vv - 0.065) < 0.03)
interior = np.where(lamp, 0.55, interior)
# desks, partitions and chairs as soft dark shapes in the lower third
desk = (vv > 0.62) & (vv < 0.74) & (((mx * 1.7 + fl_i * 0.6) % 2.4) < 1.5)
interior = np.where(desk & (occupied > 0.3), interior * 0.55, interior)
# blinds: pale horizontal slats from the head of the window down to blind
slat = ((my * 30.0) % 1.0) < 0.55
in_blind = (vv < blind) & ~ceiling
interior = np.where(in_blind, np.where(slat, 0.62, 0.48), interior)

# the glass: a cool tint, a sky reflection that brightens toward the head of each pane and varies a little
# pane to pane (no two pieces of float glass sit at quite the same angle), and the photo's grain
def noise(scale, seed):
    small = np.random.default_rng(seed).random((max(2, N // scale), max(2, N // scale))).astype(np.float32)
    return np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((N, N), Image.BICUBIC)).astype(np.float32) / 255 - 0.5
# float-glass waviness and dirt: a few octaves of smooth noise (no tile grid, unlike the old photo)
grain = noise(256, 1) * 0.06 + noise(48, 2) * 0.04 + noise(6, 3) * 0.025
tilt = (pane(3) - 0.5) * 0.10
sky = 0.30 + 0.22 * (1 - vv) + tilt
glass_rgb = np.stack([0.42, 0.56, 0.62]).reshape(3, 1, 1)
trans = 0.45
vis = (interior * trans + sky * (1 - trans))
vis_rgb = vis[None] * glass_rgb * 1.55 + grain[None]

span = 0.17 + (pane(4) - 0.5) * 0.03 + grain * 0.6
span_rgb = span[None] * np.stack([0.80, 0.92, 1.0]).reshape(3, 1, 1)

alu = 0.66 + grain * 0.4 + np.where(slab, -0.06, 0.0)
alu_rgb = alu[None] * np.stack([0.95, 0.97, 1.0]).reshape(3, 1, 1)

rgb = np.where(vision[None], vis_rgb, np.where(spandrel[None], span_rgb, alu_rgb))
rgb = np.clip(rgb, 0, 1)
col = Image.fromarray((np.transpose(rgb, (1, 2, 0)) ** (1 / 1.0) * 255).astype(np.uint8))
col = col.filter(ImageFilter.GaussianBlur(0.6))

# relief: mullions and transoms stand 6 cm proud, with a bevel; blinds give the glass nothing
height = np.where(frame, 1.0, 0.0).astype(np.float32)
height = np.asarray(Image.fromarray((height * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2))).astype(np.float32) / 255
height += grain * 0.05
gy, gx = np.gradient(height)
k = 6.0
nx, ny, nz = -gx * k, gy * k, np.ones_like(gx)
ln = np.sqrt(nx * nx + ny * ny + nz * nz)
nor = np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5
nor_img = Image.fromarray((nor * 255).astype(np.uint8))

rough = np.where(vision, 0.07, np.where(spandrel, 0.16, 0.42)) + np.abs(grain) * 0.3
rough_img = Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).convert("RGB")

# the night: a lit room fills its pane from the ceiling to the sill; behind a lowered blind the light comes
# through the slats, softer
lit_room = pane(5) > 0.52
warm = np.where(pane(3) < 0.62, 0, np.where(pane(3) < 0.86, 1, 2))
tints = np.array([[1.00, 0.86, 0.62], [0.86, 0.93, 1.00], [1.00, 0.72, 0.44]], np.float32)
tint = tints[warm]
level = 0.62 + pane(1) * 0.38
light = np.where(vision & lit_room, level, 0.0)
light = np.where(in_blind & lit_room, light * np.where(slat, 0.75, 0.45), light)
light = np.where(lamp & lit_room, 1.0, light)
lights = np.clip(tint * light[..., None], 0, 1)
lights_img = Image.fromarray((lights * 255).astype(np.uint8))

col.save(os.path.join(OUT, "glass_color.jpg"), quality=90)
nor_img.save(os.path.join(OUT, "glass_normal.jpg"), quality=92)
rough_img.save(os.path.join(OUT, "glass_rough.jpg"), quality=90)
lights_img.resize((1024, 1024), Image.BILINEAR).save(os.path.join(OUT, "glass_lights.jpg"), quality=90)
print("wrote glass_color / glass_normal / glass_rough / glass_lights (%d bays x %d storeys, %.1f x %.1f m)" % (BAYS, FLOORS, BAYS * BAY_W, FLOORS * FLOOR_H))
