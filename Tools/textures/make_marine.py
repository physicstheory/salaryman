"""Marine PBR sets for the piers and the boats you can steal (Web/art/marine/*.jpg).

Every set is three maps that line up (colour, tangent-space normal in the OpenGL convention, roughness), 1024 px and seamless, built from
one height field per material so the light falls into the same grooves the colour shows. Nothing here is a flat colour: the decking is
sun-silvered timber with open seams, grain, nail pairs and salt; the piles are tarred timber; the hulls are gelcoat with orange peel and
fender scuffs (tinted per boat in code, so the map stays white); the bottoms are antifouling; decks are moulded non-skid or teak with
black caulking; seats are stitched marine vinyl; RIB tubes are Hypalon with glued seams; rails are brushed stainless; lines are three-strand.
    python3 Tools/textures/make_marine.py
"""
import os
import numpy as np
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.normpath(os.path.join(here, "..", ".."))
out = os.path.join(root, "Web", "art", "marine")
os.makedirs(out, exist_ok=True)
N = 1024
rng = np.random.default_rng(19640101)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / N


def noise(scale, aniso=(1.0, 1.0), seed=None):
    """Periodic band-limited noise in [0,1]: white noise filtered in frequency space around `scale` cycles per tile."""
    r = rng if seed is None else np.random.default_rng(seed)
    w = r.standard_normal((N, N)).astype(np.float32)
    fy = np.fft.fftfreq(N)[:, None] * N / aniso[1]
    fx = np.fft.fftfreq(N)[None, :] * N / aniso[0]
    f = np.sqrt(fx * fx + fy * fy)
    filt = np.exp(-(f / max(scale, 0.5)) ** 2)
    n = np.real(np.fft.ifft2(np.fft.fft2(w) * filt))
    n = (n - n.min()) / (n.max() - n.min() + 1e-9)
    return n.astype(np.float32)


def fbm(base, octaves=5, aniso=(1.0, 1.0), seed=0):
    acc = np.zeros((N, N), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        acc += amp * noise(base * 2 ** o, aniso, seed + o * 31)
        tot += amp
        amp *= 0.5
    return acc / tot


def save(name, col, h, rough, k=4.0):
    col = np.clip(col, 0, 1)
    Image.fromarray(np.uint8(col * 255)).save(os.path.join(out, name + ".jpg"), quality=90)
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * k
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * k
    n = np.stack([-dx, dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    Image.fromarray(np.uint8((n * 0.5 + 0.5) * 255)).save(os.path.join(out, name + "_nor.jpg"), quality=92)
    Image.fromarray(np.uint8(np.clip(rough, 0, 1) * 255)).save(os.path.join(out, name + "_rough.jpg"), quality=90)
    print("wrote", name)


def mix(a, b, t):
    t = t[..., None] if t.ndim == 2 else t
    return a * (1 - t) + b * t


# ---- pier decking: eight boards across the tile, running along x ----------------------------------------------------------------------
def deck():
    boards = 8
    v = yy * boards
    bi = np.floor(v).astype(np.int32)
    fv = v - bi
    gap = np.clip((np.minimum(fv, 1 - fv) - 0.025) / 0.02, 0, 1)            # 0 in the seam
    # each board its own tone and grain offset; butt joints at a random point along it
    tone = rng.uniform(0.82, 1.12, boards).astype(np.float32)[bi]
    shift = rng.uniform(0, 1, boards).astype(np.float32)[bi]
    grain = fbm(6, 4, aniso=(0.6, 10.0), seed=11)
    grain = np.roll(grain, 0, 1)
    gx = (xx + shift) % 1.0
    rings = 0.5 + 0.5 * np.sin((fv * 3 + fbm(2, 3, aniso=(0.3, 3), seed=5) * 5 + gx * 0.7) * 6.2831)
    joint = np.ones_like(xx)
    jpos = rng.uniform(0.15, 0.85, boards).astype(np.float32)[bi]
    dj = np.abs(((xx - jpos) + 0.5) % 1.0 - 0.5)
    joint = np.clip((dj - 0.002) / 0.003, 0, 1)
    # nail pairs either side of each joint and every ~third of a board
    nails = np.zeros_like(xx)
    for b in range(boards):
        for p in [jpos[b * N // boards + 1, 0] - 0.012, jpos[b * N // boards + 1, 0] + 0.012, (jpos[b * N // boards + 1, 0] + 0.5) % 1]:
            for q in (0.28, 0.72):
                cx, cy = p % 1.0, (b + q) / boards
                d = np.sqrt(((xx - cx + 0.5) % 1 - 0.5) ** 2 + ((yy - cy + 0.5) % 1 - 0.5) ** 2)
                nails = np.maximum(nails, np.clip(1 - d / 0.0042, 0, 1))
    weather = fbm(2, 5, seed=21)
    salt = np.clip((fbm(8, 4, seed=23) - 0.62) * 4, 0, 1)
    h = 0.55 + 0.18 * grain + 0.06 * rings - 0.4 * (1 - gap) - 0.25 * (1 - joint) - 0.05 * nails
    silver = np.array([0.50, 0.48, 0.44], np.float32)
    brown = np.array([0.42, 0.32, 0.22], np.float32)
    col = mix(brown, silver, np.clip(weather * 1.3 - 0.1, 0, 1)) * (tone * (0.82 + 0.3 * grain) * (0.94 + 0.08 * rings))[..., None]
    col = mix(col, np.array([0.05, 0.045, 0.04], np.float32), (1 - gap) * 0.95)
    col = mix(col, col * 0.4, (1 - joint))
    col = mix(col, np.array([0.18, 0.16, 0.15], np.float32), nails)
    col = mix(col, np.array([0.70, 0.69, 0.66], np.float32), salt * 0.35)
    rough = 0.82 + 0.1 * grain - 0.15 * nails + 0.05 * salt
    save("pier_deck", col, h, rough, 6)


# ---- tarred piles: vertical fibres, splits, a sheen of creosote ----------------------------------------------------------------------
def pile():
    fib = fbm(10, 5, aniso=(6.0, 0.15), seed=31)
    split = np.clip((fbm(3, 2, aniso=(4, 0.05), seed=33) - 0.8) * 8, 0, 1)
    blot = fbm(3, 4, seed=35)
    h = 0.5 + 0.35 * fib - 0.5 * split
    tar = np.array([0.10, 0.075, 0.055], np.float32)
    wood = np.array([0.27, 0.20, 0.13], np.float32)
    col = mix(tar, wood, np.clip(blot * 1.4 - 0.35, 0, 1)) * (0.8 + 0.4 * fib)[..., None]
    col = mix(col, np.array([0.02, 0.02, 0.02], np.float32), split)
    rough = 0.55 + 0.3 * blot + 0.1 * fib
    save("pier_pile", col, h, rough, 5)


# ---- the wet band of a pile: weed and barnacles ---------------------------------------------------------------------------------------
def weed():
    base = fbm(6, 5, seed=41)
    barn = np.zeros_like(xx)
    pts = rng.uniform(0, 1, (900, 2)).astype(np.float32)
    rad = rng.uniform(0.004, 0.011, 900).astype(np.float32)
    for (px, py), r in zip(pts, rad):
        x0, x1 = int((px - r * 1.5) * N), int((px + r * 1.5) * N) + 1
        y0, y1 = int((py - r * 1.5) * N), int((py + r * 1.5) * N) + 1
        ix = np.arange(x0, x1) % N
        iy = np.arange(y0, y1) % N
        sx = (np.arange(x0, x1) / N - px)[None, :]
        sy = (np.arange(y0, y1) / N - py)[:, None]
        d = np.sqrt(sx * sx + sy * sy) / r
        cone = np.clip(1 - d, 0, 1) ** 0.6 * (d > 0.35) + (d <= 0.35) * 0.35
        sub = barn[np.ix_(iy, ix)]
        barn[np.ix_(iy, ix)] = np.maximum(sub, cone)
    h = 0.4 * base + 0.6 * barn
    green = np.array([0.10, 0.16, 0.07], np.float32)
    dark = np.array([0.05, 0.06, 0.04], np.float32)
    shell = np.array([0.62, 0.60, 0.55], np.float32)
    col = mix(dark, green, base)
    col = mix(col, shell * (0.7 + 0.3 * base)[..., None], np.clip(barn * 1.6, 0, 1))
    rough = 0.35 + 0.5 * barn
    save("pile_weed", col, h, rough, 7)


# ---- gelcoat: white, tinted per boat in code. Orange peel, faint mould seams, fender scuffs, waterline grime -------------------------
def gelcoat():
    peel = noise(180, seed=51)
    scuff = np.clip((fbm(4, 5, aniso=(0.5, 4), seed=53) - 0.7) * 5, 0, 1)
    grime = fbm(2, 4, seed=55)
    h = 0.5 + 0.04 * peel - 0.06 * scuff
    col = np.ones((N, N, 3), np.float32) * np.array([0.93, 0.93, 0.91], np.float32)
    col *= (0.97 + 0.03 * grime)[..., None]
    col = mix(col, np.array([0.70, 0.68, 0.64], np.float32), scuff * 0.5)
    rough = 0.16 + 0.05 * peel + 0.3 * scuff + 0.05 * grime
    save("gelcoat", col, h, rough, 2.5)


# ---- antifouling: matte, rollered, chalky ---------------------------------------------------------------------------------------------
def antifoul():
    roll = fbm(5, 4, aniso=(0.6, 3), seed=61)
    chalk = fbm(20, 3, seed=63)
    h = 0.5 + 0.15 * roll + 0.1 * chalk
    col = np.array([0.38, 0.09, 0.07], np.float32) * (0.85 + 0.25 * roll + 0.1 * chalk)[..., None]
    rough = 0.82 + 0.12 * chalk
    save("antifoul", col, h, rough, 3)


# ---- moulded non-skid deck: a raised diamond pattern in the gel ----------------------------------------------------------------------
def nonskid():
    p = 64
    u, v = (xx * p) % 1, (yy * p) % 1
    dia = np.clip(1 - (np.abs(u - 0.5) + np.abs(v - 0.5)) * 2.2, 0, 1)
    dirt = fbm(3, 4, seed=71)
    h = 0.4 + 0.5 * dia + 0.05 * noise(200, seed=73)
    col = np.array([0.84, 0.84, 0.82], np.float32) * (0.88 + 0.12 * dia - 0.12 * dirt * (1 - dia))[..., None]
    rough = 0.55 + 0.25 * dia
    save("nonskid", col, h, rough, 6)


# ---- teak: narrow planks, black caulking -----------------------------------------------------------------------------------------------
def teak():
    planks = 12
    v = yy * planks
    bi = np.floor(v).astype(np.int32)
    fv = v - bi
    seam = np.clip((np.minimum(fv, 1 - fv) - 0.04) / 0.02, 0, 1)
    grain = fbm(8, 4, aniso=(0.5, 12), seed=81)
    tone = rng.uniform(0.85, 1.12, planks).astype(np.float32)[bi]
    h = 0.6 + 0.15 * grain - 0.35 * (1 - seam)
    col = np.array([0.55, 0.40, 0.25], np.float32) * (tone * (0.8 + 0.35 * grain))[..., None]
    col = mix(col, np.array([0.03, 0.03, 0.03], np.float32), 1 - seam)
    rough = 0.7 + 0.15 * grain - 0.2 * (1 - seam)
    save("teak", col, h, rough, 5)


# ---- marine vinyl: pleated, stitched, a fine leather grain ----------------------------------------------------------------------------
def vinyl():
    pleat = 6
    v = (yy * pleat) % 1
    puff = np.sin(v * np.pi) ** 0.6
    stitch = ((np.abs(v - 0.06) < 0.006) | (np.abs(v - 0.94) < 0.006)) & (((xx * 160) % 1) < 0.55)
    grain = noise(140, seed=91)
    h = 0.3 + 0.55 * puff + 0.04 * grain - 0.1 * stitch
    col = np.array([0.90, 0.88, 0.83], np.float32) * (0.85 + 0.15 * puff)[..., None]
    col = mix(col, np.array([0.55, 0.52, 0.48], np.float32), stitch.astype(np.float32))
    rough = 0.45 + 0.1 * grain
    save("vinyl", col, h, rough, 4)


# ---- RIB tube: Hypalon with glued seams and a rub strake ------------------------------------------------------------------------------
def hypalon():
    seams = np.clip((np.abs(((xx * 4) % 1) - 0.5) - 0.48) * 60, 0, 1)
    tex = noise(160, seed=101)
    wear = fbm(3, 4, seed=103)
    h = 0.5 + 0.05 * tex + 0.25 * seams
    col = np.array([0.20, 0.21, 0.22], np.float32) * (0.9 + 0.15 * wear + 0.05 * tex)[..., None]
    col = mix(col, np.array([0.12, 0.12, 0.12], np.float32), seams)
    rough = 0.6 + 0.15 * wear
    save("hypalon", col, h, rough, 3)


# ---- brushed stainless ------------------------------------------------------------------------------------------------------------------
def stainless():
    br = fbm(30, 4, aniso=(0.3, 30), seed=111)
    h = 0.5 + 0.1 * br
    col = np.array([0.72, 0.73, 0.74], np.float32) * (0.9 + 0.12 * br)[..., None]
    rough = 0.22 + 0.15 * br
    save("stainless", col, h, rough, 2)


# ---- three-strand rope, running along x ------------------------------------------------------------------------------------------------
def rope():
    s = (xx * 24 + yy * 3) % 1
    strand = np.sin(s * np.pi) ** 0.5
    fib = noise(220, aniso=(1, 3), seed=121)
    h = 0.3 + 0.6 * strand + 0.08 * fib
    col = np.array([0.80, 0.74, 0.60], np.float32) * (0.6 + 0.4 * strand + 0.1 * fib)[..., None]
    rough = 0.85 + 0.1 * fib
    save("rope", col, h, rough, 5)


# ---- canvas (bimini tops, covers, the life ring's cover) -------------------------------------------------------------------------------
def canvas():
    wx = 0.5 + 0.5 * np.sin(xx * N * np.pi / 2)
    wy = 0.5 + 0.5 * np.sin(yy * N * np.pi / 2)
    weave = np.where(((np.floor(xx * N / 2) + np.floor(yy * N / 2)) % 2) == 0, wx, wy)
    dirt = fbm(3, 4, seed=131)
    h = 0.5 + 0.2 * weave
    col = np.array([0.85, 0.84, 0.80], np.float32) * (0.9 + 0.08 * weave - 0.12 * dirt)[..., None]
    rough = 0.85 + 0.1 * weave
    save("canvas", col, h, rough, 2)


# ---- quay concrete: board-marked, salt-streaked, with a weathered kerb ----------------------------------------------------------------
def quay():
    src = os.path.join(root, "Web", "art", "surfaces", "concrete.jpg")
    a = np.asarray(Image.open(src).convert("RGB").resize((N, N), Image.LANCZOS)).astype(np.float32) / 255.0
    lum = a.mean(axis=2)
    boards = np.clip((np.abs(((yy * 5) % 1) - 0.5) - 0.495) * 300, 0, 1)
    streak = fbm(4, 4, aniso=(4, 0.2), seed=141)
    h = 0.5 + 0.3 * (lum - lum.mean()) - 0.2 * boards + 0.05 * streak
    col = a * (0.92 + 0.1 * streak)[..., None]
    col = mix(col, col * 0.75, boards)
    col = mix(col, np.array([0.78, 0.78, 0.75], np.float32), np.clip((streak - 0.65) * 2, 0, 1) * 0.3)
    rough = 0.88 - 0.1 * streak
    save("quay", col, h, rough, 4)


# ---- wake foam: white lace with holes, alpha in the colour's luminance (the material uses it as alphaMap) -----------------------------
def foam():
    lace = fbm(6, 6, seed=151)
    cells = noise(40, seed=153)
    f = np.clip((lace * 0.7 + cells * 0.5 - 0.55) * 3, 0, 1)
    col = np.stack([f, f, f], -1)
    h = f
    rough = 0.3 + 0.4 * (1 - f)
    save("foam", col, h, rough, 2)


for fn in (deck, pile, weed, gelcoat, antifoul, nonskid, teak, vinyl, hypalon, stainless, rope, canvas, quay, foam):
    fn()
