#!/usr/bin/env python3
"""Builds the tree textures in Web/art/trees: one 1024 x 1024 sheet per species, from photographed leaves (Poly Haven, CC0) and bark
(ambientCG, CC0).

Each sheet has three parts, which the tree geometry in konto.html maps onto:
  left half (u 0-0.5)           a clump of leaves with a transparent background, for the cards round the crown
  right, top (u 0.5-1, v 0.5-1) leaves packed edge to edge on a shadowed green, for the solid core of the crown
  right, bottom (v 0-0.5)       bark, for the trunk

    python build-trees.py <dir with the Poly Haven leaf jpgs> <dir with the ambientCG Bark folders> [out dir]

The Poly Haven files are island_tree_01_leaves_diff_2k.jpg / _alpha_2k.jpg and fir_tree_01_twig_diff_2k.jpg / _alpha_2k.jpg.
"""
import math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance


def sprites(diff, alpha, min_px=40):
    """Cut the separate leaves (or twigs) out of a sheet: connected blobs in the alpha map."""
    d = Image.open(diff).convert("RGB"); a = Image.open(alpha).convert("L")
    S = 256; small = np.asarray(a.resize((S, S))) > 100
    seen = np.zeros_like(small); out = []
    for y in range(S):
        for x in range(S):
            if not small[y, x] or seen[y, x]: continue
            st = [(y, x)]; seen[y, x] = 1; xs = []; ys = []
            while st:
                cy, cx = st.pop(); xs.append(cx); ys.append(cy)
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < S and 0 <= nx < S and small[ny, nx] and not seen[ny, nx]: seen[ny, nx] = 1; st.append((ny, nx))
            if len(xs) < min_px: continue
            k = d.size[0] / S
            box = (int(min(xs) * k) - 2, int(min(ys) * k) - 2, int((max(xs) + 1) * k) + 2, int((max(ys) + 1) * k) + 2)
            sp = d.crop(box).convert("RGBA"); sp.putalpha(a.crop(box))
            out.append(sp)
    return out


def tint(im, rgb, amount):
    a = np.asarray(im).astype(np.float32); t = np.array(rgb, np.float32)
    lum = a[..., :3].mean(axis=2, keepdims=True) / 255.0
    a[..., :3] = a[..., :3] * (1 - amount) + (t * (0.35 + 0.9 * lum)) * amount
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def blossom(r, col):
    """A cherry blossom: five pale petals and a dark centre."""
    s = int(r * 2.4); im = Image.new("RGBA", (s, s), (0, 0, 0, 0)); g = ImageDraw.Draw(im); c = s / 2
    for k in range(5):
        an = k / 5 * math.tau - math.pi / 2; px, py = c + math.cos(an) * r * 0.55, c + math.sin(an) * r * 0.55
        g.ellipse((px - r * 0.48, py - r * 0.48, px + r * 0.48, py + r * 0.48), fill=col)
    g.ellipse((c - r * 0.18, c - r * 0.18, c + r * 0.18, c + r * 0.18), fill=(196, 64, 104, 255))
    return im


def clump(w, h, spr, n, scale, seed, extra=None, dark=0.55):
    """Leaves scattered in an oval, the ones at the back darker, as a clump of foliage looks from outside."""
    rnd = random.Random(seed); im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    items = []
    for i in range(n):
        a = rnd.random() * math.tau; r = math.sqrt(rnd.random())
        x = w / 2 + math.cos(a) * r * w * 0.40; y = h / 2 + math.sin(a) * r * h * 0.42
        items.append((rnd.random(), x, y))
    items.sort()
    for depth, x, y in items:
        s = (extra if extra and rnd.random() < 0.55 else spr[rnd.randrange(len(spr))])
        k = scale * (0.6 + rnd.random() * 0.6) * (w / max(s.size))
        sp = s.resize((max(2, int(s.size[0] * k)), max(2, int(s.size[1] * k))), Image.LANCZOS).rotate(rnd.random() * 360, expand=True, resample=Image.BICUBIC)
        sp = ImageEnhance.Brightness(sp).enhance(dark + (1 - dark) * depth)
        im.alpha_composite(sp, (int(x - sp.size[0] / 2), int(y - sp.size[1] / 2)))
    return im


def fill(w, h, spr, n, scale, seed, ground, extra=None):
    base = Image.new("RGBA", (w, h), ground + (255,))
    # tile the clump four ways so the edges wrap
    c = clump(w, h, spr, n, scale, seed, extra, dark=0.45)
    for dx in (-w // 2, w // 2):
        for dy in (-h // 2, h // 2): base.alpha_composite(c, (dx, dy))
    base.alpha_composite(c, (0, 0))
    return base


def sheet(spr, bark, ground, seed, scale_card, scale_fill, n_card, n_fill, extra=None):
    out = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    card = clump(512, 1024, spr, n_card, scale_card, seed, extra)
    card = card.filter(ImageFilter.UnsharpMask(1.2, 60, 2))
    out.alpha_composite(card, (0, 0))
    out.alpha_composite(fill(512, 512, spr, n_fill, scale_fill, seed + 1, ground, extra), (512, 0))
    out.paste(Image.open(bark).convert("RGBA").resize((512, 512), Image.LANCZOS), (512, 512))
    # leaves drawn at the edge of the transparent part bleed their colour outwards, so the mip levels do not go dark at the rim
    return out


def main():
    leaves, barks = sys.argv[1], sys.argv[2]
    outdir = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../Web/art/trees")
    os.makedirs(outdir, exist_ok=True)
    broad = sprites(os.path.join(leaves, "island_tree_01_leaves_diff_2k.jpg"), os.path.join(leaves, "island_tree_01_leaves_alpha_2k.jpg"))
    twig = sprites(os.path.join(leaves, "fir_tree_01_twig_diff_2k.jpg"), os.path.join(leaves, "fir_tree_01_twig_alpha_2k.jpg"), 120)
    twig = [t for t in twig if t.size[0] < 900 and t.size[1] < 900]
    print(len(broad), "leaves,", len(twig), "twigs")
    B = lambda n: os.path.join(barks, n, n + "_1K-JPG_Color.jpg")
    # keyaki: zelkova, a mid green; finer leaves than the source, so they are drawn small and many
    keyaki = [tint(s, (88, 128, 52), 0.25) for s in broad]
    sheet(keyaki, B("Bark012"), (34, 52, 24), 11, 0.12, 0.11, 460, 360).save(os.path.join(outdir, "keyaki.png"), optimize=True)
    # momiji: Japanese maple for the gardens, in its autumn red
    momiji = [tint(s, (196, 52, 34), 0.62) for s in broad]
    sheet(momiji, B("Bark004"), (90, 24, 18), 51, 0.10, 0.09, 520, 400).save(os.path.join(outdir, "momiji.png"), optimize=True)
    # sakura: blossom over a few young leaves
    pinks = [blossom(r, c) for r in (18, 22, 26) for c in ((252, 214, 226, 255), (247, 196, 214, 255), (255, 236, 242, 255))]
    young = [tint(s, (120, 140, 70), 0.35) for s in broad]
    sheet(young, B("Bark004"), (170, 118, 136), 21, 0.07, 0.06, 520, 620, extra=None).save("/tmp/_s.png")
    out = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    card = clump(512, 1024, pinks, 900, 0.07, 22, dark=0.7); card.alpha_composite(clump(512, 1024, young, 60, 0.08, 23, dark=0.6))
    out.alpha_composite(card, (0, 0)); out.alpha_composite(fill(512, 512, pinks, 900, 0.07, 24, (214, 150, 170)), (512, 0))
    out.paste(Image.open(B("Bark004")).convert("RGBA").resize((512, 512), Image.LANCZOS), (512, 512)); out.save(os.path.join(outdir, "sakura.png"), optimize=True)
    # matsu (pine) and sugi (cedar): needled sprays, darker and bluer
    matsu = [tint(s, (52, 84, 46), 0.3) for s in twig]
    sheet(matsu, B("Bark014"), (22, 36, 20), 31, 0.34, 0.30, 70, 90).save(os.path.join(outdir, "matsu.png"), optimize=True)
    sugi = [tint(s, (40, 70, 40), 0.35) for s in twig]
    sheet(sugi, B("Bark006"), (18, 32, 18), 41, 0.30, 0.26, 90, 110).save(os.path.join(outdir, "sugi.png"), optimize=True)
    open(os.path.join(outdir, "LICENSE.txt"), "w").write("Tree textures built by Game/tools/build-trees.py from Poly Haven leaves (island_tree_01, fir_tree_01) and\n"
        "ambientCG bark (Bark004, Bark006, Bark012, Bark014). All CC0 1.0 (public domain).\n")
    for f in sorted(os.listdir(outdir)): print(f, os.path.getsize(os.path.join(outdir, f)) // 1024, "KB")


if __name__ == "__main__":
    main()
