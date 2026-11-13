"""Tileable PBR texture synthesis (numpy only).

Every map made here wraps perfectly (the noise is built in the frequency domain, so it is periodic by construction),
which is what lets the Foundry lay a 1 m tile of brushed steel along a 20 m train without a seam.

A surface is described by a recipe (see RECIPES): base colour, how the colour varies, the relief (height) field and
how roughness follows it. `make(name, size)` returns three PIL images: albedo (sRGB), normal (OpenGL, +Y up, which is
what glTF wants), and roughness (linear). When the cloud build has fetched a photoscanned set for the same name
(Poly Haven / ambientCG, CC0) the scan is used instead; this is the fallback and the source of the man-made finishes
scans do not cover well (car paint, brushed stainless, powder coat, injection-moulded plastic).
"""
import math
import numpy as np
from PIL import Image

_rng_cache = {}


def _rng(seed):
    return np.random.default_rng(seed)


def fnoise(n, seed, lo, hi, aniso=(1.0, 1.0), power=1.0):
    """Periodic band-limited noise in [-1, 1]: white noise filtered to the frequency band lo..hi (cycles per tile).
    aniso stretches the spectrum (aniso=(1, 20) gives streaks along x, like brushing)."""
    r = _rng(seed)
    w = r.standard_normal((n, n))
    F = np.fft.fft2(w)
    fy = np.fft.fftfreq(n)[:, None] * n * aniso[1]
    fx = np.fft.fftfreq(n)[None, :] * n * aniso[0]
    f = np.sqrt(fx * fx + fy * fy) + 1e-6
    band = np.exp(-((np.log(f) - math.log(math.sqrt(lo * hi))) ** 2) / (2 * (math.log(hi / lo) / 2.2 + 0.25) ** 2))
    band *= f ** (-power * 0.5)
    band[0, 0] = 0
    out = np.real(np.fft.ifft2(F * band))
    out /= (np.abs(out).max() + 1e-9)
    return out


def fbm(n, seed, base=4, octaves=6, gain=0.55, aniso=(1.0, 1.0)):
    acc = np.zeros((n, n))
    amp, tot = 1.0, 0.0
    f = base
    for o in range(octaves):
        if f > n / 2:
            break
        acc += amp * fnoise(n, seed + o * 17, f, f * 2, aniso)
        tot += amp
        amp *= gain
        f *= 2
    return acc / tot


def cells(n, seed, count):
    """Periodic Worley distance (F1) for pebbles, pores, spots."""
    r = _rng(seed)
    pts = r.random((count, 2)) * n
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    d = np.full((n, n), 1e9, np.float32)
    for p in pts:
        dx = np.abs(xx - p[0]); dx = np.minimum(dx, n - dx)
        dy = np.abs(yy - p[1]); dy = np.minimum(dy, n - dy)
        d = np.minimum(d, dx * dx + dy * dy)
    d = np.sqrt(d)
    return d / d.max()


def scratches(n, seed, count, length=0.25, width=1.0):
    """Thin periodic line scratches, 0..1."""
    r = _rng(seed)
    img = np.zeros((n, n), np.float32)
    for _ in range(count):
        x0, y0 = r.random(2) * n
        ang = r.random() * math.pi
        L = (0.2 + r.random()) * length * n
        steps = int(L)
        xs = (x0 + np.cos(ang) * np.arange(steps)) % n
        ys = (y0 + np.sin(ang) * np.arange(steps)) % n
        a = 0.3 + 0.7 * r.random()
        img[ys.astype(int), xs.astype(int)] = np.maximum(img[ys.astype(int), xs.astype(int)], a)
    if width > 1:
        img = blur(img, width * 0.5)
    return img


def blur(a, s):
    if s <= 0:
        return a
    n = a.shape[0]
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.fftfreq(a.shape[1])[None, :]
    g = np.exp(-2 * (math.pi * s) ** 2 * (fx * fx + fy * fy))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx, ny = -dx * strength, dy * strength          # OpenGL convention: +Y up (image row 0 is the top)
    nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5
    return Image.fromarray((rgb * 255 + 0.5).clip(0, 255).astype(np.uint8))


def srgb(c):
    c = np.asarray(c, np.float64)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)


def to_img(lin_rgb):
    return Image.fromarray((srgb(np.clip(lin_rgb, 0, 1)) * 255 + 0.5).clip(0, 255).astype(np.uint8))


def gray_img(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))


def hexlin(h):
    h = h.lstrip("#")
    c = np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


# ------------------------------------------------------------------------------------------------
# recipes. Each returns (albedo linear HxWx3, height HxW, roughness HxW, metallic HxW)

def r_brushed(n, s, col="#b8bcc0", rough=0.32):
    streak = fnoise(n, s, 8, 200, aniso=(1, 28))
    fine = fnoise(n, s + 1, 120, 400, aniso=(1, 60))
    smudge = fbm(n, s + 2, 2, 4)
    sc = scratches(n, s + 3, 60, 0.15)
    h = streak * 0.35 + fine * 0.25 - sc * 0.5
    c = hexlin(col)[None, None, :] * (1 + 0.04 * streak[..., None] + 0.05 * smudge[..., None] - 0.06 * sc[..., None])
    r = rough + 0.06 * streak + 0.08 * smudge + 0.12 * sc
    return c, h, r, np.ones((n, n))


def r_paint(n, s, col="#2b6e3a", rough=0.28, metal=0.0, peel=0.6, wear=0.0):
    orange = fnoise(n, s, 30, 90)
    dust = fbm(n, s + 1, 2, 5)
    sc = scratches(n, s + 2, int(30 * (wear + 0.2)), 0.08)
    h = orange * 0.18 * peel - sc * 0.4
    c = hexlin(col)[None, None, :] * (1 + 0.03 * dust[..., None] - 0.12 * sc[..., None] * wear)
    r = rough + 0.04 * dust + 0.2 * sc * (wear + 0.3)
    return c, h, r, np.full((n, n), metal)


def r_plastic(n, s, col="#e8e6e0", rough=0.45):
    grain = fnoise(n, s, 60, 260)
    dirt = np.clip(fbm(n, s + 1, 2, 5), 0, 1)
    h = grain * 0.4
    c = hexlin(col)[None, None, :] * (1 - 0.10 * dirt[..., None] + 0.02 * grain[..., None])
    r = rough + 0.05 * grain + 0.1 * dirt
    return c, h, r, np.zeros((n, n))


def r_rubber(n, s, col="#1c1c1e", rough=0.85):
    grain = fnoise(n, s, 80, 300)
    dust = np.clip(fbm(n, s + 1, 2, 5), 0, 1)
    h = grain * 0.5
    c = hexlin(col)[None, None, :] * (1 + 0.5 * dust[..., None]) + 0.01 * dust[..., None]
    r = rough + 0.05 * grain
    return c, h, r, np.zeros((n, n))


def r_concrete(n, s, col="#9a978f", rough=0.88):
    big = fbm(n, s, 2, 6)
    pores = cells(n, s + 1, 260)
    pits = np.clip(0.06 - pores, 0, 1) / 0.06
    agg = fnoise(n, s + 2, 40, 200)
    h = big * 0.3 + agg * 0.3 - pits * 0.9
    c = hexlin(col)[None, None, :] * (1 + 0.10 * big[..., None] + 0.06 * agg[..., None] - 0.25 * pits[..., None])
    r = rough + 0.05 * agg - 0.05 * big
    return c, h, r, np.zeros((n, n))


def r_fabric(n, s, col="#3a3f4a", rough=0.9, weave=96):
    yy, xx = np.mgrid[0:n, 0:n] / n * 2 * math.pi * weave
    w = np.sin(xx) * np.sin(yy)
    warp = (np.sin(xx) > 0) ^ (np.sin(yy) > 0)
    fuzz = fnoise(n, s, 100, 400)
    h = np.abs(w) * 0.6 + fuzz * 0.2
    c = hexlin(col)[None, None, :] * (0.85 + 0.15 * warp[..., None] + 0.08 * fuzz[..., None])
    r = rough + 0.05 * fuzz
    return c, h, r, np.zeros((n, n))


def r_wood(n, s, col="#7a5634", rough=0.6, rings=14):
    yy, xx = np.mgrid[0:n, 0:n] / n
    warp = fbm(n, s, 2, 4) * 0.08
    g = np.sin((yy + warp) * 2 * math.pi * rings + fnoise(n, s + 1, 3, 12, aniso=(6, 1)) * 2)
    fibre = fnoise(n, s + 2, 40, 300, aniso=(30, 1))
    h = g * 0.3 + fibre * 0.4
    c = hexlin(col)[None, None, :] * (0.85 + 0.12 * g[..., None] + 0.06 * fibre[..., None])
    r = rough + 0.06 * fibre
    return c, h, r, np.zeros((n, n))


def r_grime(n, s, col="#2a2826", rough=0.75):
    big = fbm(n, s, 2, 6)
    rust = np.clip(fbm(n, s + 1, 3, 5) - 0.2, 0, 1)
    h = big * 0.4 + fnoise(n, s + 2, 60, 300) * 0.3
    c = hexlin(col)[None, None, :] * (1 + 0.25 * big[..., None]) + rust[..., None] * hexlin("#3a2414")[None, None, :] * 0.6
    r = rough + 0.1 * big
    return c, h, r, np.full((n, n), 0.3)


def r_glass(n, s, col="#1a2228", rough=0.05):
    smudge = np.clip(fbm(n, s, 2, 5), 0, 1)
    c = hexlin(col)[None, None, :] * np.ones((n, n, 1))
    return c, smudge * 0.05, rough + 0.12 * smudge, np.zeros((n, n))


def r_skin_pores(n, s, col="#c89a80", rough=0.5):
    pores = cells(n, s, 1800)
    p = np.clip(0.025 - pores, 0, 1) / 0.025
    fine = fnoise(n, s + 1, 150, 500)
    h = -p * 0.8 + fine * 0.2
    c = hexlin(col)[None, None, :] * (1 - 0.05 * p[..., None])
    return c, h, rough + 0.08 * p, np.zeros((n, n))


def r_ribbed(n, s, col="#b8bcc0", rough=0.3, ribs=20):
    """Corrugated stainless (older train bodies): ribs run along the tile's u."""
    yy = np.mgrid[0:n, 0:n][0] / n
    rib = np.clip(np.sin(yy * 2 * math.pi * ribs) * 1.6, -1, 1)
    c, h, r, m = r_brushed(n, s, col, rough)
    return c, h * 0.4 + rib * 1.2, r, m


def r_terrazzo(n, s, col="#b9b5ad", rough=0.35):
    chips = cells(n, s, 900)
    ch = (chips < 0.03).astype(float)
    tint = fnoise(n, s + 1, 30, 120)
    c = hexlin(col)[None, None, :] * (1 + 0.06 * tint[..., None]) * (1 - 0.35 * ch[..., None])
    return c, -ch * 0.2 + tint * 0.05, rough + 0.05 * tint, np.zeros((n, n))


def r_tiles(n, s, col="#d8d6d0", grout="#7a7670", rough=0.25, count=4):
    yy, xx = np.mgrid[0:n, 0:n] / n * count
    gx = np.abs(xx - np.round(xx)); gy = np.abs(yy - np.round(yy))
    g = np.clip(1 - np.minimum(gx, gy) / 0.02, 0, 1)
    var = fnoise(n, s, 2, 8)
    c = hexlin(col)[None, None, :] * (1 + 0.04 * var[..., None]) * (1 - g[..., None]) + hexlin(grout)[None, None, :] * g[..., None]
    h = -g * 1.0 + fnoise(n, s + 1, 60, 200) * 0.05
    return c, h, rough + 0.6 * g, np.zeros((n, n))


def r_tactile(n, s, col="#e8c21a", rough=0.5):
    """Japanese tenji block: yellow with domes (warning) - 5x5 per 30 cm tile."""
    yy, xx = np.mgrid[0:n, 0:n] / n * 5
    d = np.hypot(xx - np.floor(xx) - 0.5, yy - np.floor(yy) - 0.5)
    dome = np.clip(1 - d / 0.3, 0, 1) ** 0.5
    edge = np.clip(1 - np.minimum(np.abs(xx * 0.2 % 1 - 0), np.abs(yy * 0.2 % 1)) / 0.01, 0, 1)
    c, h, r, m = r_plastic(n, s, col, rough)
    return c * (1 - 0.3 * edge[..., None]), h * 0.2 + dome * 2.0, r, m


def r_leather(n, s, col="#2a1a12", rough=0.45):
    cr = cells(n, s, 3000)
    crease = np.clip(cr * 18, 0, 1)
    c = hexlin(col)[None, None, :] * (0.9 + 0.1 * crease[..., None])
    return c, crease * 0.6, rough + 0.2 * (1 - crease), np.zeros((n, n))


def r_hair_strands(n, s, col="#14100e"):
    """Hair card texture: strands running down the v axis, with alpha at the tips. Returns RGBA albedo."""
    r = _rng(s)
    alpha = np.zeros((n, n), np.float32)
    shade = np.zeros((n, n), np.float32)
    yy = np.arange(n)
    for _ in range(n * 2):
        x0 = r.random() * n
        L = (0.55 + 0.45 * r.random()) * n
        wob = np.sin(yy / n * math.pi * (1 + r.random() * 2) + r.random() * 6) * r.random() * 3
        xs = (x0 + wob).astype(int) % n
        a = np.clip((L - yy) / (0.15 * n), 0, 1) * (0.5 + 0.5 * r.random())
        alpha[yy, xs] = np.maximum(alpha[yy, xs], a)
        shade[yy, xs] = np.maximum(shade[yy, xs], (0.6 + 0.4 * r.random()) * a)
    alpha = np.clip(blur(alpha, 0.7) * 2.2, 0, 1)
    shade = blur(shade, 0.6)
    root = np.linspace(0.75, 1.15, n)[:, None]
    c = hexlin(col)[None, None, :] * (0.7 + 0.6 * shade[..., None]) * root[..., None]
    return c, shade, alpha


RECIPES = {
    "brushed": r_brushed, "paint": r_paint, "plastic": r_plastic, "rubber": r_rubber, "concrete": r_concrete,
    "fabric": r_fabric, "wood": r_wood, "grime": r_grime, "glass": r_glass, "ribbed": r_ribbed, "terrazzo": r_terrazzo,
    "tiles": r_tiles, "tactile": r_tactile, "leather": r_leather, "skin": r_skin_pores,
}


def make(recipe, size=1024, seed=1, normal_strength=None, **kw):
    """-> dict(albedo=PIL RGB, normal=PIL RGB, rough=PIL L, metal=PIL L)"""
    c, h, r, m = RECIPES[recipe](size, seed, **kw)
    h = h - h.mean()
    ns = normal_strength if normal_strength is not None else 2.0 * size / 1024
    return {
        "albedo": to_img(c),
        "normal": normal_from_height(h, ns),
        "rough": gray_img(np.clip(r, 0.02, 1)),
        "metal": gray_img(np.clip(m, 0, 1)),
    }
