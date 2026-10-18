"""Generates a tileable asphalt set (albedo, normal, ARM) into assets/textures/road/. Needs numpy and Pillow.
The road shader uses asphalt_diff / asphalt_nor / asphalt_arm if you drop real scans in with those names
(Poly Haven's asphalt_02 works as is: asphalt_02_diff_*.jpg -> asphalt_diff.jpg, _nor_gl -> asphalt_nor.png, _arm -> asphalt_arm.jpg)."""
import numpy as np
from PIL import Image
import os
S = 1024
rng = np.random.default_rng(7)
out = os.path.join(os.path.dirname(__file__), "..", "assets", "textures", "road")

def band(sigma, seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    n = r.standard_normal((S, S))
    f = np.fft.fft2(n)
    fx = np.fft.fftfreq(S)[:, None]; fy = np.fft.fftfreq(S)[None, :]
    g = np.exp(-(fx * fx + fy * fy) * (2 * np.pi * sigma) ** 2 / 2)
    v = np.real(np.fft.ifft2(f * g))
    return (v - v.mean()) / (v.std() + 1e-9)

# the surface: grit, stones and slow undulation
grit = band(0.8)
stones = band(2.6)
stone_mask = np.clip((stones - 0.7) * 2.2, 0, 1)            # round aggregate tops
macro = band(60.0)
height = 0.35 * grit + 0.9 * stone_mask + 0.12 * band(9.0)
height = (height - height.min()) / (height.max() - height.min())

# colour: dark bitumen with grey, tan and white chippings
tone = 0.20 + 0.035 * grit + 0.03 * macro
chip = band(2.6, 99)
cg = 0.235 + 0.05 * band(3.0, 11)
chip_col = np.stack([cg * 1.03, cg, cg * 0.97], -1)
warm = np.clip(band(30.0, 5) * 0.5, -0.5, 0.5)[..., None] * np.array([0.05, 0.02, -0.03])
base = np.stack([tone * 1.0, tone * 1.01, tone * 1.04], -1)
alb = base * (1 - stone_mask[..., None]) + chip_col * stone_mask[..., None] + warm
alb *= (0.92 + 0.16 * np.clip(0.5 + 0.5 * macro, 0, 1))[..., None]
alb = np.clip(alb, 0, 1)

# normal from the height field
k = 5.0
dx = np.roll(height, -1, 1) - np.roll(height, 1, 1)
dy = np.roll(height, -1, 0) - np.roll(height, 1, 0)
n = np.stack([-dx * k, dy * k, np.ones_like(height)], -1)    # +Y up, OpenGL convention
n /= np.linalg.norm(n, axis=-1, keepdims=True)
nor = (n * 0.5 + 0.5)

# ARM: occlusion in the gaps, roughness (stone tops a touch smoother), no metal
ao = np.clip(0.55 + 0.6 * height, 0, 1)
rough = np.clip(0.88 - 0.12 * stone_mask - 0.05 * macro + 0.04 * grit, 0.5, 0.97)
arm = np.stack([ao, rough, np.zeros_like(ao)], -1)

def save(a, name, q=None):
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    p = os.path.join(out, name)
    if name.endswith(".jpg"):
        im.save(p, quality=q or 92)
    else:
        im.save(p, optimize=True)
    print(name, os.path.getsize(p) // 1024, "KB")

save(alb, "asphalt_diff.jpg")
save(nor, "asphalt_nor.png")
save(arm, "asphalt_arm.jpg")
