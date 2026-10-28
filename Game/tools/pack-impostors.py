#!/usr/bin/env python3
"""Pack the impostor atlases from bake-trees.mjs for the game: bleed each tree's edge colours out into the transparent pixels (so the
mipmaps of a cut-out do not grow dark halos at a distance) and save WebP with alpha into Web/art/trees.

    python3 Game/tools/pack-impostors.py <bake-dir>
"""
import os, shutil, sys
import numpy as np
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/dl/imp"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../Web/art/trees")

def bleed(im, steps=24):
    a = np.asarray(im).astype(np.float32)
    rgb, have = a[..., :3].copy(), a[..., 3] > 127
    for _ in range(steps):
        acc = np.zeros_like(rgb); n = np.zeros(have.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            h = np.roll(have, (dy, dx), (0, 1)); c = np.roll(rgb, (dy, dx), (0, 1))
            acc += c * h[..., None]; n += h
        grow = (~have) & (n > 0)
        rgb[grow] = acc[grow] / n[grow][..., None]; have = have | grow
    return Image.fromarray(np.concatenate([rgb, a[..., 3:4]], -1).astype(np.uint8), "RGBA")

for sp in ("sugi", "matsu", "keyaki", "sakura", "momiji"):
    for p, q in (("col", 88), ("nrm", 92)):
        bleed(Image.open(os.path.join(SRC, f"imp_{sp}_{p}.png")).convert("RGBA")).save(os.path.join(OUT, f"imp_{sp}_{p}.webp"), "WEBP", quality=q, method=6)
    print(sp, os.path.getsize(os.path.join(OUT, f"imp_{sp}_col.webp")) // 1024, "KB +", os.path.getsize(os.path.join(OUT, f"imp_{sp}_nrm.webp")) // 1024, "KB")
shutil.copy(os.path.join(SRC, "impostors.json"), os.path.join(OUT, "impostors.json"))
