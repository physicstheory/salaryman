"""Packed-dirt PBR set for the big bike jumps (Web/art/terrain/jumpdirt*.jpg).

Built from Poly Haven's gravel_ground_01 (CC0, already in the repo as Web/art/terrain/scree.jpg): the stones are softened and the colour
pulled to a dry, compacted brown loam, and the normal and roughness maps are derived from the same height so the three line up.
    python3 Tools/textures/make_jumpdirt.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.normpath(os.path.join(here, "..", ".."))
src = os.path.join(root, "Web", "art", "terrain", "scree.jpg")
out = os.path.join(root, "Web", "art", "terrain")
N = 1024

im = Image.open(src).convert("RGB").resize((N, N), Image.LANCZOS)
a = np.asarray(im).astype(np.float32) / 255.0
lum = a @ np.array([0.299, 0.587, 0.114], np.float32)

# height: the source's luminance, a little blurred so the gravel reads as compacted dirt with small stones in it; tiles seamlessly because
# the blur wraps
def wrap_blur(x, r):
    big = np.tile(x, (3, 3))
    img = Image.fromarray(np.uint8(np.clip(big, 0, 1) * 255)).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(img).astype(np.float32)[N:2 * N, N:2 * N] / 255.0

h = 0.65 * wrap_blur(lum, 1.2) + 0.35 * wrap_blur(lum, 6)
h = (h - h.min()) / (h.max() - h.min() + 1e-6)

# colour: a dry brown loam, darker in the hollows, with the source's variation kept at low contrast
base = np.array([0.43, 0.31, 0.21], np.float32)
dark = np.array([0.24, 0.16, 0.10], np.float32)
t = np.clip(h * 1.15 - 0.05, 0, 1)[..., None]
col = dark * (1 - t) + base * t
col *= (0.88 + 0.24 * (a / (a.mean(axis=(0, 1)) + 1e-6)).mean(axis=2, keepdims=True) * 0.5)
col = np.clip(col, 0, 1)
Image.fromarray(np.uint8(col * 255)).save(os.path.join(out, "jumpdirt.jpg"), quality=90)

# normal map from the height (tangent space, OpenGL convention), wrapping at the edges
k = 5.0
dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * k
dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * k
n = np.stack([-dx, dy, np.ones_like(h)], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(np.uint8((n * 0.5 + 0.5) * 255)).save(os.path.join(out, "jumpdirt_nor.jpg"), quality=92)

# roughness: dirt is rough everywhere; the polished tops of stones a little less
r = np.clip(0.93 - 0.18 * (h - 0.5) - 0.06 * (lum - lum.mean()), 0.6, 1.0)
Image.fromarray(np.uint8(r * 255)).save(os.path.join(out, "jumpdirt_rough.jpg"), quality=90)
print("wrote jumpdirt.jpg, jumpdirt_nor.jpg, jumpdirt_rough.jpg")
