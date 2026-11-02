#!/usr/bin/env python3
"""Prop texture maps for the engine's street props (Web/art/props/, slots listed in slots.json).

  python3 Tools/props/make_prop_maps.py <slot> [<slot> ...]   build <slot>_nor.jpg and <slot>_rough.jpg from a painted <slot>.jpg
                                                              (uses <slot>_height.jpg for relief when it exists)
  python3 Tools/props/make_prop_maps.py --painted             the same for every slot whose base colour is painted (not a stand-in)
  python3 Tools/props/make_prop_maps.py --placeholders        write procedural stand-ins for every slot that has no base colour yet
  python3 Tools/props/make_prop_maps.py --placeholders --force   rewrite every stand-in (never touches painted slots)
  --keep   keep an existing _nor/_rough instead of rebuilding it

Stand-ins carry the JPEG comment "shigoto-placeholder"; a painted file (from ChatGPT or anyone) does not, which is how
the AAA gate tells which slots still need painting. Needs Pillow and numpy.
"""
import json, math, os, sys, zlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIR = os.path.join(ROOT, "Web", "art", "props")
MARK = b"shigoto-placeholder"
FONT = os.path.join(ROOT, "Web", "art", "signfonts", "dela.woff2")


def slots():
    with open(os.path.join(DIR, "slots.json")) as fh:
        return json.load(fh)["slots"]


def is_placeholder(path):
    try:
        with open(path, "rb") as fh:
            return MARK in fh.read(4096)
    except OSError:
        return False


# ---- noise -------------------------------------------------------------------------------------------------------
def value_noise(n, cells, rng, tile=True):
    """Tileable value noise: n x n, `cells` lattice cells across."""
    g = rng.random((cells + 1, cells + 1))
    if tile:
        g[-1, :] = g[0, :]
        g[:, -1] = g[:, 0]
    x = np.linspace(0, cells, n, endpoint=False)
    i = x.astype(int)
    f = x - i
    f = f * f * (3 - 2 * f)
    a = g[i][:, i]
    b = g[i][:, i + 1]
    c = g[i + 1][:, i]
    d = g[i + 1][:, i + 1]
    fx = f[None, :]
    fy = f[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(n, rng, base=4, octaves=5):
    out = np.zeros((n, n))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        out += value_noise(n, base * 2 ** o, rng) * amp
        tot += amp
        amp *= 0.5
    return out / tot


def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float) / 255.0


# ---- procedural stand-ins: (albedo float RGB 0..1, height 0..1, roughness 0..1) -----------------------------------
def surface(s, n, rng):
    """A tileable material surface in the slot's base colour."""
    col = hexrgb(s.get("base", "#888888"))
    mat = s["material"]
    big, fine = fbm(n, rng, 3, 4), fbm(n, rng, 24, 3)
    h = big * 0.4 + fine * 0.6
    tone = 0.88 + (big - 0.5) * 0.18 + (fine - 0.5) * 0.12
    rough = np.full((n, n), s.get("roughness", 0.6))
    if mat == "wood":
        y = np.linspace(0, 1, n, endpoint=False)[:, None]
        warp = fbm(n, rng, 6, 3)
        grain = 0.5 + 0.5 * np.sin((y * 90 + warp * 2.2) * math.pi * 2)
        grain = grain * 0.6 + fbm(n, rng, 40, 2) * 0.4
        planks = ((y * 6) % 1.0)
        seam = (planks < 0.025).astype(float)
        tone = 0.78 + grain * 0.22 + (big - 0.5) * 0.2 - seam * 0.45
        h = grain * 0.5 + big * 0.3 - seam * 0.8
        rough = rough + (1 - grain) * 0.08
    elif mat in ("metal",):
        streak = value_noise(n, 2, rng)[:, :1] * 0 + np.repeat(fbm(n, rng, 64, 2)[:, :1], n, axis=1)
        tone = 0.86 + (streak - 0.5) * 0.25 + (big - 0.5) * 0.15
        h = streak * 0.3 + fine * 0.2
        rough = rough + (big - 0.5) * 0.25
    elif mat == "galv":
        cells = value_noise(n, 64, rng)
        spangle = np.floor(cells * 6) / 6
        tone = 0.82 + spangle * 0.22 + (big - 0.5) * 0.12
        rust = np.clip((fbm(n, rng, 8, 4) - 0.68) * 5, 0, 1)
        tone = tone * (1 - rust * 0.15)
        h = spangle * 0.2 + fine * 0.2
        rough = rough + (spangle - 0.5) * 0.3 + rust * 0.3
    elif mat == "concrete":
        pores = (fbm(n, rng, 80, 2) < 0.32).astype(float)
        tone = 0.82 + (big - 0.5) * 0.3 + (fine - 0.5) * 0.15 - pores * 0.2
        h = fine * 0.6 + big * 0.2 - pores * 0.5
    elif mat == "rubber":
        speck = (rng.random((n, n)) > 0.985).astype(float)
        tone = 0.9 + (fine - 0.5) * 0.15 + speck * 0.6
        h = fine * 0.5 + speck * 0.3
    elif mat == "leaves":
        return leaves(s, n, rng)
    elif mat == "leather":
        crack = np.abs(fbm(n, rng, 20, 3) - 0.5) < 0.012
        tone = 0.9 + (fine - 0.5) * 0.2 - crack * 0.3
        h = fine * 0.6 - crack * 0.5
    elif mat == "paint":
        chips = np.clip((fbm(n, rng, 10, 4) - 0.7) * 8, 0, 1)
        tone = tone * (1 - chips * 0.35)
        h = h * 0.4 - chips * 0.3
        rough = rough + chips * 0.25
    else:  # plastic, ceramic, glow
        tone = 0.92 + (big - 0.5) * 0.1 + (fine - 0.5) * 0.06
    grime = np.clip(fbm(n, rng, 2, 4) - 0.55, 0, 1) * 0.5
    alb = col[None, None, :] * tone[:, :, None] * (1 - grime[:, :, None] * 0.6)
    rough = np.clip(rough + (fine - 0.5) * 0.12 + grime * 0.25, 0.04, 1)
    return np.clip(alb, 0, 1), np.clip(h, 0, 1), rough


def leaves(s, n, rng):
    col = hexrgb(s.get("base", "#4a6e34"))
    img = Image.new("RGB", (n, n), tuple(int(c * 255 * 0.35) for c in col))
    hgt = Image.new("L", (n, n), 30)
    d, dh = ImageDraw.Draw(img), ImageDraw.Draw(hgt)
    for _ in range(int(n * n / 260)):
        x, y = rng.random() * n, rng.random() * n
        L = n * (0.018 + rng.random() * 0.02)
        a = rng.random() * math.pi * 2
        k = 0.6 + rng.random() * 0.7
        c = tuple(int(min(255, v * 255 * k + rng.random() * 20)) for v in col)
        pts = [(x + math.cos(a + t) * L * (1 if i % 2 == 0 else 0.38), y + math.sin(a + t) * L * (1 if i % 2 == 0 else 0.38)) for i, t in enumerate((0, math.pi / 2, math.pi, 3 * math.pi / 2))]
        for ox in (-n, 0, n):
            for oy in (-n, 0, n):
                p = [(px + ox, py + oy) for px, py in pts]
                d.polygon(p, fill=c)
                dh.polygon(p, fill=int(120 + k * 90))
    alb = np.asarray(img, dtype=float) / 255.0
    h = np.asarray(hgt.filter(ImageFilter.GaussianBlur(1.2)), dtype=float) / 255.0
    return alb, h, np.full((n, n), 0.75) - h * 0.15


def font(px):
    # the full face from the sign-font build cache has every kanji; the bundled subset is the fallback
    for f in (os.path.expanduser("~/.cache/salaryman-signfonts/DelaGothicOne-Regular.ttf"), FONT):
        try:
            return ImageFont.truetype(f, px)
        except Exception:
            pass
    return ImageFont.load_default()


def face(sid, s, n, rng):
    """Stand-ins for face and wrap slots that have a picture on them (signs, windows, grilles, bands)."""
    alb, h, rough = surface(dict(s, material="plastic" if s["material"] == "glow" else s["material"]), n, rng)
    # draw at the face's real shape, then squeeze into the square texture: on the face it stretches back out
    asp = float(s.get("aspect", 1.0)) if s["uv"] == "face" else 1.0
    W, H = (n, max(16, int(n / asp))) if asp >= 1 else (max(16, int(n * asp)), n)
    img = Image.fromarray((alb * 255).astype(np.uint8)).resize((W, H))
    hi = Image.fromarray((h * 255).astype(np.uint8)).resize((W, H))
    d, dh = ImageDraw.Draw(img), ImageDraw.Draw(hi)
    if sid == "cone_body":
        for a, b in ((0.30, 0.36), (0.55, 0.70)):
            d.rectangle([0, H * (1 - b), W, H * (1 - a)], fill=(236, 236, 230)); dh.rectangle([0, H * (1 - b), W, H * (1 - a)], fill=170)
    elif sid == "bin_body":
        for x in range(0, W, max(4, W // 24)):
            d.line([x, 0, x, H], fill=(150, 150, 150), width=max(1, W // 200)); dh.line([x, 0, x, H], fill=200, width=max(2, W // 120))
        d.rectangle([0, 0, W, H * 0.04], fill=(110, 110, 110))
    elif sid == "bin_label":
        d.rectangle([0, 0, W, H], fill=(240, 240, 234)); d.rectangle([0, 0, W, H * 0.22], fill=(200, 40, 40))
        d.text((W / 2, H * 0.5), "もえる", font=font(W // 6), fill=(30, 30, 30), anchor="mm"); d.text((W / 2, H * 0.72), "ゴミ", font=font(W // 6), fill=(30, 30, 30), anchor="mm")
    elif sid == "barrier_panel":
        st = H // 2
        for x in range(-H, W + H, st * 2):
            d.polygon([(x, H), (x + st, H), (x + st + H, 0), (x + H, 0)], fill=(20, 20, 20))
        d.rectangle([W * 0.3, H * 0.18, W * 0.7, H * 0.82], fill=(245, 245, 240))
        d.text((W / 2, H / 2), "工事中", font=font(int(H * 0.42)), fill=(200, 30, 30), anchor="mm")
    elif sid == "pole_guard":
        st = W // 2
        for y in range(-W, H + W, st * 2):
            d.polygon([(0, y), (0, y + st), (W, y + st + W), (W, y + W)], fill=(20, 20, 20))
    elif sid == "pole_plate":
        d.rectangle([0, 0, W, H], fill=(246, 244, 236)); d.rectangle([0, 0, W, H * 0.06], fill=(30, 90, 160))
        for i, ch in enumerate("こんと内科"):
            d.text((W / 2, H * (0.16 + i * 0.13)), ch, font=font(int(W * 0.34)), fill=(30, 60, 120), anchor="mm")
        d.text((W / 2, H * 0.88), "→200m", font=font(int(W * 0.12)), fill=(200, 40, 40), anchor="mm")
    elif sid == "sign_face":
        d.rectangle([0, 0, W, H], fill=(190, 190, 190)); d.ellipse([W * 0.02, H * 0.02, W * 0.98, H * 0.98], fill=(240, 240, 240)); d.ellipse([W * 0.07, H * 0.07, W * 0.93, H * 0.93], fill=(196, 22, 40))
        d.rectangle([W * 0.2, H * 0.43, W * 0.8, H * 0.57], fill=(245, 245, 245)); dh.rectangle([W * 0.2, H * 0.43, W * 0.8, H * 0.57], fill=170)
    elif sid == "vending_front":
        d.rectangle([0, 0, W, H], fill=(225, 232, 238))
        cols = [(40, 120, 60), (120, 70, 40), (200, 30, 30), (230, 240, 250), (40, 110, 200), (230, 200, 40), (250, 140, 30), (90, 50, 30)]
        for r in range(3):
            y0 = H * (0.06 + r * 0.31)
            d.rectangle([W * 0.03, y0 + H * 0.22, W * 0.97, y0 + H * 0.24], fill=(160, 165, 170))
            for k in range(10):
                x = W * (0.07 + k * 0.095); c = cols[int(rng.random() * len(cols))]
                d.rounded_rectangle([x - W * 0.035, y0 + H * 0.03, x + W * 0.035, y0 + H * 0.21], radius=W // 80, fill=c)
                d.rectangle([x - W * 0.03, y0 + H * 0.245, x + W * 0.03, y0 + H * 0.27], fill=(40, 90, 200) if r < 2 else (210, 40, 40))
                d.ellipse([x - W * 0.012, y0 + H * 0.275, x + W * 0.012, y0 + H * 0.295], fill=(250, 250, 240))
    elif sid == "vending_panel":
        d.rectangle([0, 0, W, H], fill=(44, 46, 50))
        d.rectangle([W * 0.18, H * 0.58, W * 0.82, H * 0.9], fill=(18, 18, 20)); d.text((W / 2, H * 0.74), "とりだしぐち", font=font(W // 22), fill=(200, 200, 200), anchor="mm")
        d.rectangle([W * 0.72, H * 0.1, W * 0.78, H * 0.3], fill=(15, 15, 15)); d.rectangle([W * 0.55, H * 0.1, W * 0.68, H * 0.18], fill=(15, 15, 15))
        d.rounded_rectangle([W * 0.2, H * 0.08, W * 0.4, H * 0.4], radius=W // 60, fill=(70, 120, 180))
    elif sid == "lamp_lens":
        d.rectangle([0, 0, W, H], fill=(235, 225, 200))
        for y in range(8):
            for x in range(5):
                cx, cy = W * (0.15 + x * 0.175), H * (0.08 + y * 0.12)
                d.ellipse([cx - W * 0.05, cy - W * 0.05, cx + W * 0.05, cy + W * 0.05], fill=(255, 250, 235))
    elif sid == "tree_grate":
        d.rectangle([0, 0, W, H], fill=(52, 50, 48))
        for k in range(36):
            a = k / 36 * math.pi * 2
            for r0 in (0.2, 0.3, 0.4):
                d.line([W / 2 + math.cos(a) * W * r0, H / 2 + math.sin(a) * H * r0, W / 2 + math.cos(a) * W * (r0 + 0.07), H / 2 + math.sin(a) * H * (r0 + 0.07)], fill=(12, 12, 12), width=W // 90)
                dh.line([W / 2 + math.cos(a) * W * r0, H / 2 + math.sin(a) * H * r0, W / 2 + math.cos(a) * W * (r0 + 0.07), H / 2 + math.sin(a) * H * (r0 + 0.07)], fill=0, width=W // 90)
        d.ellipse([W * 0.36, H * 0.36, W * 0.64, H * 0.64], fill=(40, 30, 22))
    elif sid == "ac_grille":
        d.rectangle([0, 0, W, H], fill=(30, 30, 32))
        d.polygon([(W / 2, H / 2), (W * 0.9, H * 0.35), (W * 0.85, H * 0.6)], fill=(60, 62, 66)); d.polygon([(W / 2, H / 2), (W * 0.2, H * 0.15), (W * 0.35, H * 0.08)], fill=(60, 62, 66)); d.polygon([(W / 2, H / 2), (W * 0.25, H * 0.88), (W * 0.1, H * 0.72)], fill=(60, 62, 66))
        for r in range(1, 12):
            rr = r / 12 * 0.49
            d.ellipse([W * (0.5 - rr), H * (0.5 - rr), W * (0.5 + rr), H * (0.5 + rr)], outline=(170, 172, 175), width=max(2, W // 160)); dh.ellipse([W * (0.5 - rr), H * (0.5 - rr), W * (0.5 + rr), H * (0.5 + rr)], outline=230, width=max(2, W // 160))
    elif sid == "bicycle_basket":
        d.rectangle([0, 0, W, H], fill=(60, 62, 64))
        for x in range(0, W, W // 12):
            d.line([x, 0, x, H], fill=(190, 194, 198), width=max(2, W // 120)); dh.line([x, 0, x, H], fill=230, width=max(2, W // 120))
        for y in range(0, H, H // 8):
            d.line([0, y, W, y], fill=(190, 194, 198), width=max(2, W // 120)); dh.line([0, y, W, y], fill=230, width=max(2, W // 120))
    elif sid == "bicycle_tyre":
        for x in range(0, W, W // 32):
            d.rectangle([x, H * 0.35, x + W // 64, H * 0.65], fill=(12, 12, 12)); dh.rectangle([x, H * 0.35, x + W // 64, H * 0.65], fill=10)
    elif sid == "bollard_body":
        d.rectangle([0, H * 0.12, W, H * 0.2], fill=(230, 180, 20)); dh.rectangle([0, H * 0.12, W, H * 0.2], fill=160)
    elif sid == "ball_skin":
        d.rectangle([0, 0, W, H], fill=(236, 236, 232))
        for k in range(6):
            for r in range(3):
                cx, cy = W * (k + 0.5 * (r % 2)) / 6, H * (0.2 + r * 0.3)
                d.regular_polygon((cx, cy, W * 0.04), 5, fill=(25, 25, 25))
    img, hi = img.resize((n, n), Image.LANCZOS), hi.resize((n, n), Image.LANCZOS)
    alb = np.asarray(img, dtype=float) / 255.0
    h = np.asarray(hi.filter(ImageFilter.GaussianBlur(max(1, n / 512))), dtype=float) / 255.0
    return alb, h, rough


def placeholder(sid, s):
    n = int(s.get("size", 512))
    rng = np.random.default_rng(zlib.crc32(sid.encode()))
    if s["uv"] in ("face", "wrap"):
        return face(sid, s, n, rng)
    return surface(s, n, rng)


# ---- normal and roughness from a height field --------------------------------------------------------------------
def normal_from_height(h, strength, wrap):
    if wrap:
        dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
        dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    else:
        dy, dx = np.gradient(h)
    nx, ny, nz = -dx * strength, dy * strength, np.ones_like(h)   # OpenGL convention: green points up the image
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5


def save(path, arr, placeholder_mark):
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    kw = {"quality": 90, "optimize": True}
    if placeholder_mark:
        kw["comment"] = MARK
    im.save(path, **kw)


def maps_for(sid, s, alb, h, rough, mark, keep=False):
    n = alb.shape[0]
    strength = n / 64.0 * (0.6 if s["material"] in ("metal", "plastic", "glow", "ceramic") else 1.4)
    nor = normal_from_height(h, strength, s["uv"] != "face")
    pn, pr = os.path.join(DIR, sid + "_nor.jpg"), os.path.join(DIR, sid + "_rough.jpg")
    if not (keep and os.path.exists(pn)):
        save(pn, nor, mark)
    if not (keep and os.path.exists(pr)):
        save(pr, np.repeat(rough[:, :, None], 3, -1), mark)


def from_painted(sid, s, keep):
    p = os.path.join(DIR, sid + ".jpg")
    im = Image.open(p).convert("RGB")
    if im.width != im.height:
        side = max(im.width, im.height)
        print("  note: %s is %dx%d; maps are built at that size" % (sid, im.width, im.height))
    alb = np.asarray(im, dtype=float) / 255.0
    hp = os.path.join(DIR, sid + "_height.jpg")
    if os.path.exists(hp):
        h = np.asarray(Image.open(hp).convert("L").resize(im.size), dtype=float) / 255.0
    else:
        lum = alb @ np.array([0.3, 0.59, 0.11])
        h = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(1, im.width / 700))), dtype=float) / 255.0
    lum = alb @ np.array([0.3, 0.59, 0.11])
    base = s.get("roughness", 0.6)
    # darker, dirtier areas read rougher; bright clean paint and metal read glossier
    rough = np.clip(base + (0.5 - lum) * 0.35 + (h - h.mean()) * -0.1, 0.04, 1.0)
    maps_for(sid, s, alb, h, rough, False, keep)
    print("  %s: built _nor.jpg and _rough.jpg from the painting" % sid)


def main(argv):
    keep = "--keep" in argv
    force = "--force" in argv
    S = slots()
    os.makedirs(DIR, exist_ok=True)
    if "--placeholders" in argv:
        made = 0
        for sid, s in S.items():
            p = os.path.join(DIR, sid + ".jpg")
            if os.path.exists(p) and not is_placeholder(p):
                continue          # painted: never overwrite
            if os.path.exists(p) and not force:
                continue
            alb, h, rough = placeholder(sid, s)
            save(p, alb, True)
            maps_for(sid, s, alb, h, rough, True)
            made += 1
        print("stand-ins written: %d (of %d slots)" % (made, len(S)))
        return 0
    targets = [a for a in argv if not a.startswith("--")]
    if "--painted" in argv:
        targets = [sid for sid in S if os.path.exists(os.path.join(DIR, sid + ".jpg")) and not is_placeholder(os.path.join(DIR, sid + ".jpg"))]
    if not targets:
        print(__doc__)
        return 1
    for sid in targets:
        sid = os.path.splitext(os.path.basename(sid))[0]
        if sid not in S:
            print("unknown slot: %s (see Web/art/props/slots.json)" % sid)
            return 1
        from_painted(sid, S[sid], keep)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
