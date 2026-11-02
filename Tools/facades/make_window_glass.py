#!/usr/bin/env python3
"""Builds the window-glass set (Web/art/facades/winglass_*.jpg) for the panes on the close-up building detail.

Those panes were one flat colour with a metal finish: a mirror in every window. Real window glass is
nearly black face on (a dim room behind it), takes the sky only at a glancing angle, and is never
perfectly flat: float glass ripples, and there is dust and dried rain on it. This paints that as a
tileable set covering 4 m x 4 m of wall (the game projects it in world space, so it needs no UVs):

  winglass_color   a dim room: dark blue-grey with soft warmer and darker patches (curtains, furniture)
  winglass_normal  the long, gentle ripple of float glass
  winglass_rough   smooth glass with smudges and streaks of dried rain

    python3 Tools/facades/make_window_glass.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "Web", "art", "facades")
N = 1024

def noise(cells, seed, wrap=True):
    """tileable smooth noise: a small random grid, tiled 3x3, upscaled with bicubic, centre cut out"""
    g = np.random.default_rng(seed).random((cells, cells)).astype(np.float32)
    big = np.tile(g, (3, 3))
    im = Image.fromarray((big * 255).astype(np.uint8)).resize((N * 3, N * 3), Image.BICUBIC)
    return np.asarray(im).astype(np.float32)[N:2 * N, N:2 * N] / 255 - 0.5

# colour: a dim interior
room = noise(4, 11) * 0.5 + noise(10, 12) * 0.3 + noise(40, 13) * 0.1
base = np.stack([0.085, 0.105, 0.125])
warm = np.stack([0.16, 0.12, 0.09])
w = np.clip(room * 1.6 + 0.35, 0, 1)[..., None]
col = base * (1 - w) + warm * w
col *= (1 + noise(120, 14)[..., None] * 0.15)
Image.fromarray((np.clip(col, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).save(os.path.join(OUT, "winglass_color.jpg"), quality=90)

# normal: the float-glass ripple runs one way (the draw direction), long and shallow
ripple = noise(6, 21) * 0.6 + noise(16, 22) * 0.3
rip = np.asarray(Image.fromarray(((ripple + 0.5) * 255).astype(np.uint8)).resize((N // 8, N), Image.BICUBIC).resize((N, N), Image.BICUBIC)).astype(np.float32) / 255
gy, gx = np.gradient(rip)
k = 14.0
nx, ny, nz = -gx * k, gy * k, np.ones_like(gx)
ln = np.sqrt(nx * nx + ny * ny + nz * nz)
nor = np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5
Image.fromarray((nor * 255).astype(np.uint8)).save(os.path.join(OUT, "winglass_normal.jpg"), quality=92)

# roughness: clean glass with smudges, and dried rain streaking downward
smudge = np.clip(noise(8, 31) * 2.2 + noise(30, 32) * 0.8, 0, 1)
streak_src = (np.random.default_rng(33).random((N, N // 6)) > 0.93).astype(np.float32)
streak = np.asarray(Image.fromarray((streak_src * 255).astype(np.uint8)).resize((N, N), Image.NEAREST).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
streak = np.asarray(Image.fromarray((streak * 255).astype(np.uint8)).resize((N, N // 3)).resize((N, N), Image.BICUBIC)).astype(np.float32) / 255
rough = 0.06 + smudge * 0.22 + streak * 0.18 + np.abs(noise(200, 34)) * 0.06
Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).convert("RGB").save(os.path.join(OUT, "winglass_rough.jpg"), quality=90)
print("wrote winglass_color / winglass_normal / winglass_rough (4 m tile)")
