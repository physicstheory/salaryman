#!/usr/bin/env python3
"""The house atlas: every surface a house is built from, in one set of PBR maps (Web/art/houses/).

  python3 Tools/houses/make_house_atlas.py

Writes atlas.jpg (base colour, sRGB), atlas_nor.jpg (OpenGL tangent-space normals) and atlas_rough.jpg (roughness),
2048 px, a 4 x 4 grid of 512 px cells. Every cell tiles on its own: the shader in Web/game/houses.js wraps inside the
cell, so a whole house - walls, roof, gutters, glass, laundry, plants - is one material and one draw call.

Photographic cells are the Poly Haven CC0 sets already in the repo (Web/art/realism, interior, props, facades,
surfaces). The rest are built here from height fields (Japanese ceramic siding, kawara and slate roofing, standing-seam
metal, woven cloth, moulded plastic, shoji paper), and their normal and roughness maps are derived from that same
height, so the relief lines up with the colour.

Cell order is the contract with houses.js (HOUSE_TILES there). Needs Pillow and numpy.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(ROOT, "Web", "art")
OUT = os.path.join(ART, "houses")
C = 512
RNG = np.random.default_rng(20261111)


def load(rel, mode="RGB"):
    return Image.open(os.path.join(ART, rel)).convert(mode).resize((C, C), Image.LANCZOS)


def arr(im):
    return np.asarray(im).astype(np.float32) / 255.0


def noise(cells, octaves=4, seed=0):
    """Tileable fractal value noise in [0, 1], C x C."""
    rng = np.random.default_rng(seed)
    out = np.zeros((C, C), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = cells * (2 ** o)
        g = rng.random((n, n)).astype(np.float32)
        x = np.linspace(0, n, C, endpoint=False)
        i0 = np.floor(x).astype(int) % n
        i1 = (i0 + 1) % n
        f = x - np.floor(x)
        f = f * f * (3 - 2 * f)
        a = g[i0][:, i0] * (1 - f)[None, :] + g[i0][:, i1] * f[None, :]
        b = g[i1][:, i0] * (1 - f)[None, :] + g[i1][:, i1] * f[None, :]
        out += amp * (a * (1 - f)[:, None] + b * f[:, None])
        tot += amp
        amp *= 0.5
    return out / tot


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    # image rows run down, texture v runs up: OpenGL green is +v, so the row derivative flips
    n = np.stack([-dx, dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def grid():
    y, x = np.mgrid[0:C, 0:C].astype(np.float32)
    return x / C, y / C


# ---- procedural cells ----------------------------------------------------------------------------------------------
def siding():
    """Ceramic siding (窯業系サイディング): 455 mm boards laid horizontally, each moulded with a shallow stone-dressed face
    and a fine groove every 151 mm. One tile is 1.82 m, four boards."""
    u, v = grid()
    boards = (v * 4) % 1.0
    joint = np.clip(1 - np.minimum(boards, 1 - boards) / 0.012, 0, 1)
    sub = (v * 12) % 1.0
    groove = np.clip(1 - np.minimum(sub, 1 - sub) / 0.02, 0, 1) * 0.45
    stone = noise(10, 4, 1) * 0.5 + noise(40, 3, 2) * 0.5
    h = 1 - joint * 0.9 - groove - (1 - stone) * 0.18
    base = np.array([0.80, 0.78, 0.74], np.float32)
    col = base[None, None, :] * (0.88 + 0.12 * stone[..., None]) * (1 - 0.35 * joint[..., None] - 0.12 * groove[..., None])
    rough = 0.72 + 0.12 * stone + 0.1 * joint
    return col, normal_from_height(h, 5.0), rough


def kawara():
    """Japanese pantiles (桟瓦): rolls running down the slope (u across, v down), the overlap of each course a dark
    step. Glazed silver-grey ibushi; tinted per house. 1.2 m a tile: four rolls across, four courses down."""
    u, v = grid()
    roll = (u * 4) % 1.0
    prof = np.sin(roll * np.pi * 2) * 0.5 + 0.5
    course = (v * 4) % 1.0
    lap = np.clip(course / 0.08, 0, 1)
    h = prof * 0.8 * lap + course * 0.25
    var = noise(4, 2, 3)
    tilevar = np.floor(u * 4) * 0.37 + np.floor(v * 4) * 0.61
    tv = (np.sin(tilevar * 12.9898) * 43758.5453) % 1.0
    shade = 0.62 + 0.25 * prof + 0.08 * tv
    col = np.stack([shade * 0.72, shade * 0.74, shade * 0.78], -1) * (0.9 + 0.1 * var[..., None])
    col *= (0.55 + 0.45 * lap)[..., None]
    rough = 0.38 + 0.25 * (1 - prof) + 0.2 * noise(16, 3, 4)
    return col, normal_from_height(h, 9.0), rough


def slate():
    """Fibre-cement slate (化粧スレート, "colorbest"): thin flat shingles in staggered courses, the butt of each course a
    sharp line. 0.9 m a tile: three courses, shingles 0.9/2.2 wide."""
    u, v = grid()
    course = (v * 3) % 1.0
    row = np.floor(v * 3)
    off = (row % 2) * 0.5 / 2.2
    sh = ((u + off) * 2.2 * 1.0) % 1.0
    butt = np.clip(course / 0.05, 0, 1)
    gap = np.clip(np.minimum(sh, 1 - sh) / 0.01, 0, 1)
    grain = noise(30, 3, 5)
    h = course * 0.5 * butt + gap * 0.3
    tone = 0.30 + 0.06 * grain + 0.04 * ((np.sin((np.floor((u + off) * 2.2) + row * 7) * 91.7) * 1e4) % 1.0)
    col = np.stack([tone, tone * 1.02, tone * 1.06], -1) * (0.5 + 0.5 * butt[..., None]) * (0.6 + 0.4 * gap[..., None])
    rough = 0.6 + 0.2 * grain
    return col, normal_from_height(h, 7.0), rough


def seam():
    """Standing-seam galvalume (ガルバリウム): flat pans with a raised seam every 0.45 m, faint oil-canning.
    1.0 m a tile (u across the seams)."""
    u, v = grid()
    p = (u * 2.2222) % 1.0
    rib = np.clip(1 - np.minimum(p, 1 - p) / 0.025, 0, 1)
    can = noise(3, 2, 6) * 0.15
    h = rib * 1.0 + can
    grain = noise(60, 2, 7)
    tone = 0.62 + 0.08 * grain
    col = np.stack([tone * 0.95, tone * 0.98, tone], -1) * (1 - 0.15 * rib[..., None])
    rough = 0.32 + 0.18 * noise(12, 3, 8)
    return col, normal_from_height(h, 6.0), rough


def painted_metal():
    """Painted sheet steel and aluminium (gutters, meters, outdoor units, rails, shutters): a faint brushed grain and
    orange-peel in the paint. Light grey so it tints. 0.6 m a tile."""
    u, v = grid()
    brush = noise(2, 1, 15) * 0.0
    streak = np.repeat(np.random.default_rng(16).random((1, C)).astype(np.float32), C, 0)
    streak = (streak + np.roll(streak, 1, 1) + np.roll(streak, -1, 1)) / 3
    peel = noise(90, 2, 17)
    h = peel * 0.25 + streak * 0.15 + brush
    tone = 0.80 + 0.05 * peel + 0.03 * streak
    col = np.stack([tone] * 3, -1)
    rough = 0.36 + 0.12 * peel + 0.08 * noise(6, 2, 18)
    return col, normal_from_height(h, 2.5), rough


def cloth():
    """Woven cotton: plain weave, light, so per-garment tints carry. 0.25 m a tile."""
    u, v = grid()
    wu = np.sin(u * np.pi * 2 * 64) * 0.5 + 0.5
    wv = np.sin(v * np.pi * 2 * 64) * 0.5 + 0.5
    chk = ((np.floor(u * 64) + np.floor(v * 64)) % 2)
    h = np.where(chk > 0, wu, wv) * 0.6 + noise(8, 3, 9) * 0.4
    tone = 0.82 + 0.1 * h
    col = np.stack([tone, tone, tone * 0.98], -1)
    rough = 0.86 + 0.08 * noise(20, 2, 10)
    return col, normal_from_height(h, 3.0), rough


def plastic():
    """Moulded plastic and rubber (bins, crates, toys, PVC pipe, tyres): a fine stipple. 0.5 m a tile."""
    st = noise(80, 2, 11)
    h = st * 0.3
    tone = 0.80 + 0.06 * st
    col = np.stack([tone] * 3, -1)
    rough = 0.45 + 0.15 * noise(10, 2, 12)
    return col, normal_from_height(h, 2.0), rough


def shoji():
    """Washi paper on a shoji: fibres and a slight cockle. 0.5 m a tile."""
    u, v = grid()
    fib = noise(60, 4, 13)
    streak = noise(6, 3, 14)
    h = fib * 0.4 + streak * 0.2
    tone = 0.90 + 0.05 * fib
    col = np.stack([tone, tone * 0.97, tone * 0.88], -1)
    rough = 0.9 + 0.05 * fib
    return col, normal_from_height(h, 2.0), rough


# ---- photographic cells ---------------------------------------------------------------------------------------------
def photo(color, nor, rough=None, gain=1.0):
    col = arr(load(color)) * gain
    n = arr(load(nor)) if nor else None
    if rough:
        r = arr(load(rough, "L"))
    else:
        lum = col.mean(-1)
        r = 0.55 + 0.35 * (1 - (lum - lum.min()) / max(1e-3, lum.max() - lum.min()))
    if n is None:
        n = normal_from_height(col.mean(-1), 4.0)
    return col, n, r


def pick(*names):
    for n in names:
        if os.path.exists(os.path.join(ART, n)):
            return n
    return None


def main():
    cells = [
        photo("realism/plaster-color.jpg", "realism/plaster-normal.jpg", "realism/plaster-roughness.jpg", 1.05),   # 0 plaster
        siding(),                                                                                                   # 1 siding
        photo("realism/brick-color.jpg", "realism/brick-normal.jpg", "realism/brick-roughness.jpg"),               # 2 brick
        photo("realism/concrete-color.jpg", "realism/concrete-normal.jpg", "realism/concrete-roughness.jpg"),      # 3 concrete
        photo("interior/wood_floor.jpg", "interior/wood_floor_nor.jpg", None, 1.1),                                # 4 timber
        kawara(),                                                                                                   # 5 kawara
        slate(),                                                                                                    # 6 slate
        seam(),                                                                                                     # 7 standing seam
        painted_metal(),                                                                                            # 8 painted metal
        photo("facades/winglass_color.jpg", "facades/winglass_normal.jpg", "facades/winglass_rough.jpg"),          # 9 glass
        cloth(),                                                                                                    # 10 cloth
        photo("props/planter_shrub.jpg", "props/planter_shrub_nor.jpg", "props/planter_shrub_rough.jpg", 1.1),     # 11 foliage
        photo("props/tree_bark.jpg", "props/tree_bark_nor.jpg", "props/tree_bark_rough.jpg"),                      # 12 bark
        plastic(),                                                                                                  # 13 plastic
        shoji(),                                                                                                    # 14 shoji paper
        photo("surfaces/gravel.jpg", pick("surfaces/gravel_nor.jpg"), pick("surfaces/gravel_rough.jpg")),          # 15 gravel
    ]
    S = C * 4
    col = np.zeros((S, S, 3), np.float32)
    nor = np.zeros((S, S, 3), np.float32)
    rou = np.zeros((S, S), np.float32)
    for i, (c, n, r) in enumerate(cells):
        cx, row = i % 4, i // 4
        y0 = (3 - row) * C          # texture v runs up the image: cell row 0 is the bottom row
        x0 = cx * C
        col[y0:y0 + C, x0:x0 + C] = np.clip(c, 0, 1)
        nor[y0:y0 + C, x0:x0 + C] = np.clip(n, 0, 1)
        rou[y0:y0 + C, x0:x0 + C] = np.clip(r, 0, 1)
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray((col * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, "atlas.jpg"), quality=90)
    Image.fromarray((nor * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, "atlas_nor.jpg"), quality=92)
    Image.fromarray((rou * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, "atlas_rough.jpg"), quality=92)
    with open(os.path.join(OUT, "LICENSE.txt"), "w") as fh:
        fh.write("House atlas (Tools/houses/make_house_atlas.py). Photographic cells: Poly Haven CC0 1.0 sets already in\n"
                 "Web/art (realism, interior, props, facades, surfaces). Procedural cells (siding, kawara, slate, standing seam,\n"
                 "cloth, plastic, shoji): generated, CC0.\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
