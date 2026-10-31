# The loading-screen slides: flat, cel-shaded illustrations of the story's people in their places, drawn as SVG here and turned into JPEGs
# by render_slides.mjs. Nothing in them comes from the game's renderer; they are drawn to match it (anime, bold ink, two-tone shading).
#
#   python3 Tools/loading/draw_slides.py <out dir>        writes one .svg per slide
import math, os, random, sys

W, H = 1920, 1080
INK = "#1b1622"


def rnd(seed):
    r = random.Random(seed)
    return r


class S:
    def __init__(self):
        self.defs, self.body = [], []
        self.n = 0

    def id(self, p):
        self.n += 1
        return "%s%d" % (p, self.n)

    def add(self, s):
        self.body.append(s)

    def grad(self, stops, x1=0, y1=0, x2=0, y2=1, radial=False, cx=0.5, cy=0.5, r=0.5):
        i = self.id("g")
        st = "".join('<stop offset="%s" stop-color="%s"%s/>' % (o, c, (' stop-opacity="%s"' % a) if a is not None else "") for o, c, a in
                     [(s[0], s[1], s[2] if len(s) > 2 else None) for s in stops])
        if radial:
            self.defs.append('<radialGradient id="%s" cx="%s" cy="%s" r="%s">%s</radialGradient>' % (i, cx, cy, r, st))
        else:
            self.defs.append('<linearGradient id="%s" x1="%s" y1="%s" x2="%s" y2="%s">%s</linearGradient>' % (i, x1, y1, x2, y2, st))
        return "url(#%s)" % i

    def svg(self):
        fonts = '<style>@font-face{font-family:"Konto Sans";src:url("FONT_CSS_DIR/R70ZjygA28ymD4HgBVu92j6eR1mYP_TX-Bb-rTg93gHfHe9F4Q.119.woff2")}' \
                ' text{font-family:"Konto Sans","Noto Sans CJK JP","DejaVu Sans",sans-serif}</style>'
        return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d"><defs>%s%s'
                '<filter id="soft"><feGaussianBlur stdDeviation="6"/></filter><filter id="blur2"><feGaussianBlur stdDeviation="2.2"/></filter>'
                '<filter id="glow"><feGaussianBlur stdDeviation="18"/></filter></defs>%s</svg>') % (W, H, W, H, fonts, "".join(self.defs), "".join(self.body))


def P(pts):
    return " ".join("%.1f,%.1f" % p for p in pts)


def poly(s, pts, fill, stroke=INK, sw=3, extra=""):
    s.add('<polygon points="%s" fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round" %s/>' % (P(pts), fill, stroke if stroke else "none", sw, extra))


def path(s, d, fill, stroke=INK, sw=3, extra=""):
    s.add('<path d="%s" fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round" stroke-linecap="round" %s/>' % (d, fill, stroke if stroke else "none", sw, extra))


def rect(s, x, y, w, h, fill, stroke=None, sw=0, rx=0, extra=""):
    s.add('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%s" fill="%s" stroke="%s" stroke-width="%s" %s/>' % (x, y, w, h, rx, fill, stroke or "none", sw, extra))


def circ(s, x, y, r, fill, stroke=None, sw=0, extra=""):
    s.add('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" stroke="%s" stroke-width="%s" %s/>' % (x, y, r, fill, stroke or "none", sw, extra))


def ell(s, x, y, rx, ry, fill, stroke=None, sw=0, extra=""):
    s.add('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s" stroke="%s" stroke-width="%s" %s/>' % (x, y, rx, ry, fill, stroke or "none", sw, extra))


def text(s, x, y, t, size, fill, weight=800, anchor="middle", extra=""):
    s.add('<text x="%.1f" y="%.1f" font-size="%s" font-weight="%s" fill="%s" text-anchor="%s" %s>%s</text>' % (x, y, size, weight, fill, anchor, extra, t))


# ---- the pieces of a picture ---------------------------------------------------------------------------------------------------------------
def sky(s, top, mid, low, horizon=0.62):
    g = s.grad([(0, top), (horizon * 0.7, mid), (1, low)])
    rect(s, 0, 0, W, H, g)


def sun(s, x, y, r, col="#fff6d8", halo="#ffcf7a"):
    g = s.grad([(0, halo, 0.85), (0.35, halo, 0.35), (1, halo, 0)], radial=True)
    circ(s, x, y, r * 7, g)
    circ(s, x, y, r, col)


def rays(s, x, y, n, col, seed, alpha=0.10):
    r = rnd(seed)
    for i in range(n):
        a = r.uniform(0.15, 2.95)
        w = r.uniform(0.02, 0.07)
        L = 2600
        pts = [(x, y), (x + math.cos(a - w) * L, y + math.sin(a - w) * L), (x + math.cos(a + w) * L, y + math.sin(a + w) * L)]
        poly(s, pts, col, None, 0, 'opacity="%.2f"' % (alpha * r.uniform(0.5, 1.3)))


def cloud(s, x, y, sc, lit="#fff4ea", shade="#e8b9b0", seed=1):
    r = rnd(seed)
    blobs = [(x + r.uniform(-1, 1) * 120 * sc, y + r.uniform(-0.4, 0.3) * 40 * sc, r.uniform(50, 95) * sc) for _ in range(7)]
    for bx, by, br in blobs:
        circ(s, bx, by + br * 0.25, br, shade)
    for bx, by, br in blobs:
        circ(s, bx - br * 0.12, by - br * 0.05, br * 0.86, lit)


def ridge(s, base, amp, col, seed, rough=6, edge=None):
    r = rnd(seed)
    pts = [(0, H)]
    n = 48
    ph = [r.uniform(0, 6.28) for _ in range(4)]
    for i in range(n + 1):
        x = W * i / n
        y = base - amp * (0.55 * math.sin(x / 260 + ph[0]) + 0.3 * math.sin(x / 113 + ph[1]) + 0.15 * math.sin(x / 47 + ph[2])) - r.uniform(0, rough)
        pts.append((x, y))
    pts.append((W, H))
    poly(s, pts, col, edge, 2 if edge else 0)


def petals(s, n, seed, col="#ffc4d6", area=(0, 0, W, H), scale=1.0):
    r = rnd(seed)
    for _ in range(n):
        x, y = r.uniform(area[0], area[2]), r.uniform(area[1], area[3])
        a = r.uniform(0, 180)
        ell(s, x, y, 9 * scale, 4.5 * scale, col, None, 0, 'transform="rotate(%.0f %.1f %.1f)" opacity="%.2f"' % (a, x, y, r.uniform(0.6, 1)))


def speedlines(s, n, seed, col="#ffffff", alpha=0.5, y0=0, y1=H):
    r = rnd(seed)
    for _ in range(n):
        y = r.uniform(y0, y1)
        x = r.uniform(-200, W)
        L = r.uniform(200, 700)
        rect(s, x, y, L, r.uniform(2, 5), col, extra='opacity="%.2f"' % (alpha * r.uniform(0.3, 1)))


def windows_grid(s, x, y, w, h, cols, rows, lit, dark, seed, litp=0.35, pad=0.22):
    r = rnd(seed)
    cw, rh = w / cols, h / rows
    for i in range(cols):
        for j in range(rows):
            c = lit if r.random() < litp else dark
            rect(s, x + i * cw + cw * pad / 2, y + j * rh + rh * pad / 2, cw * (1 - pad), rh * (1 - pad), c)


def tower(s, x, base, w, h, body, edge, lit, dark, seed, crown=None, litp=0.3):
    rect(s, x, base - h, w, h, body, INK, 2.5)
    rect(s, x + w * 0.72, base - h, w * 0.28, h, edge)
    windows_grid(s, x + 8, base - h + 14, w - 16, h - 20, max(3, int(w / 26)), max(4, int(h / 30)), lit, dark, seed, litp)
    if crown:
        poly(s, [(x + w * 0.2, base - h), (x + w * 0.5, base - h - crown), (x + w * 0.8, base - h)], body, INK, 2.5)


# ---- people -------------------------------------------------------------------------------------------------------------------------------
SKIN, SKIN_SH = "#ffe3cf", "#f2b9a0"


def shade(c, k):
    c = c.lstrip("#")
    rgb = [int(c[i:i + 2], 16) for i in (0, 2, 4)]
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(v * k))) for v in rgb)


def person(s, x, y, h, o):
    """A standing anime figure, feet at (x, y), h pixels tall. o: dict of colours and pose.
    view: 'front' | 'back' | 'side'; hair: colour; style: 'spiky' | 'bob' | 'bun' | 'swept' | 'short' | 'long'; top, bottom, tie, skirt (bool),
    wave: 'r' | 'l' | None; bag: colour; run: bool; flip: bool."""
    k = h / 100.0
    view = o.get("view", "front")
    flip = -1 if o.get("flip") else 1
    sw = max(1.6, 2.8 * k / 4.5)
    top, bot = o.get("top", "#2a2f3a"), o.get("bottom", "#262a33")
    hair = o.get("hair", "#1e1a2a")
    g = '<g transform="translate(%.1f %.1f) scale(%.4f %.4f)">' % (x, y, k * flip, k)
    s.add(g)
    run = o.get("run")
    # legs and shoes (the coordinates are in a 100-tall figure, feet at 0)
    if o.get("skirt"):
        poly(s, [(-9, -46), (9, -46), (15, -24), (-15, -24)], bot, INK, sw / k)
        for lx in (-5, 5):
            rect(s, lx - 2.6, -25, 5.2, 22, SKIN, INK, sw / k, 2)
            ell(s, lx, -2, 3.8, 2.4, "#3a2a24", INK, sw / k)
    else:
        if run:
            poly(s, [(-8, -48), (0, -48), (-14, -22), (-22, -4), (-15, -2), (-6, -22)], bot, INK, sw / k)
            poly(s, [(0, -48), (8, -48), (12, -26), (20, -12), (14, -9), (5, -25)], shade(bot, 0.8), INK, sw / k)
            ell(s, -19, -2, 6, 2.6, "#1c1c22", INK, sw / k)
            ell(s, 18, -10, 6, 2.6, "#1c1c22", INK, sw / k)
        else:
            path(s, "M -9.6 -48 L -0.4 -48 L -1 -24 L -1.6 -3 L -7 -3 L -8.2 -24 Z", bot, INK, sw / k)
            path(s, "M 0.4 -48 L 9.6 -48 L 8.2 -24 L 7 -3 L 1.6 -3 L 1 -24 Z", shade(bot, 0.82), INK, sw / k)
            path(s, "M -8 -3.6 L -1.2 -3.6 Q -0.6 0 -3 0 L -9.6 0 Q -10.6 -2 -8 -3.6 Z", "#1c1c22", INK, sw / k)
            path(s, "M 1.2 -3.6 L 8 -3.6 Q 10.6 -2 9.6 0 L 3 0 Q 0.6 0 1.2 -3.6 Z", "#1c1c22", INK, sw / k)
    # torso
    path(s, "M -6 -80 Q -12 -80 -12.5 -75 L -10 -58 Q -10.5 -51 -9.8 -46 L 9.8 -46 Q 10.5 -51 10 -58 L 12.5 -75 Q 12 -80 6 -80 Z", top, INK, sw / k)
    path(s, "M 4 -80 Q 12 -80 12.5 -75 L 10 -58 Q 10.5 -51 9.8 -46 L 4.5 -46 Q 6 -62 4 -80 Z", shade(top, 0.78), None, 0)
    path(s, "M -9.8 -47 L 9.8 -47", "none", shade(top, 0.6), sw / k * 0.6)
    if view != "back":
        if o.get("shirt"):
            poly(s, [(-4, -78), (4, -78), (0, -64)], o["shirt"], INK, sw / k * 0.7)
        if o.get("tie"):
            poly(s, [(-1.3, -76), (1.3, -76), (2, -62), (0, -59), (-2, -62)], o["tie"], INK, sw / k * 0.6)
    # arms
    def arm(side, up):
        sx = side * 11
        if up:
            poly(s, [(sx - side * 1, -78), (sx + side * 4, -77), (sx + side * 9, -100), (sx + side * 4, -102)], top, INK, sw / k)
            circ(s, sx + side * 7.2, -104, 3.4, SKIN, INK, sw / k)
        elif run:
            poly(s, [(sx, -77), (sx + side * 4, -75), (sx + side * 10, -60), (sx + side * 6, -57)], top, INK, sw / k)
            circ(s, sx + side * 9, -57, 3, SKIN, INK, sw / k)
        else:
            c = top if side < 0 else shade(top, 0.78)
            path(s, "M %.1f -79 Q %.1f -79 %.1f -74 L %.1f -51 L %.1f -51 L %.1f -72 Z" % (sx - side * 1.5, sx + side * 4.4, sx + side * 4.6, sx + side * 4.2, sx + side * 0.6, sx - side * 0.4), c, INK, sw / k)
            path(s, "M %.1f -51.5 Q %.1f -44 %.1f -45.5 Q %.1f -49 %.1f -51.5 Z" % (sx + side * 0.6, sx + side * 2.2, sx + side * 3.4, sx + side * 4.6, sx + side * 4.2), SKIN, INK, sw / k * 0.8)
    arm(-1, o.get("wave") == "l")
    arm(1, o.get("wave") == "r")
    if o.get("bag"):
        rect(s, -16, -60, 9, 11, o["bag"], INK, sw / k, 1.5)
        path(s, "M -12 -60 L 6 -78", "none", INK, sw / k * 0.8)
    # neck and head
    rect(s, -2.6, -83, 5.2, 6, SKIN_SH, INK, sw / k * 0.6)
    ell(s, 0, -92, 9.4, 10.6, SKIN, INK, sw / k)
    style = o.get("style", "short")
    if view != "back":
        # eyes: large, dark, with a light
        ec = o.get("eyes", "#3a3060")
        for ex in (-3.7, 3.7):                                    # big anime eyes: white, a coloured iris dark at the top, two lights, a lash line
            ell(s, ex, -90.2, 2.5, 3.3, "#ffffff", INK, sw / k * 0.3)
            ell(s, ex, -89.9, 1.9, 2.9, ec)
            ell(s, ex, -91.2, 1.9, 1.5, shade(ec, 0.55))
            ell(s, ex, -89.6, 0.9, 1.4, "#120e1a")
            circ(s, ex - 0.7, -91.3, 0.75, "#ffffff")
            circ(s, ex + 0.7, -88.6, 0.38, "#ffffff")
            path(s, "M %.1f -92.9 Q %.1f -94.4 %.1f -92.6" % (ex - 2.8, ex, ex + 2.8), "none", INK, sw / k * 0.9)
            path(s, "M %.1f -95.6 L %.1f -96.1" % (ex - 1.8, ex + 1.8), "none", shade(o.get("hair", "#1e1a2a"), 0.9), sw / k * 0.55)
        path(s, "M -1.4 -84.6 Q 0 -84 1.4 -84.6", "none", "#a0524a", sw / k * 0.45)
        ell(s, -5.2, -87.8, 1.6, 0.8, "#ffb3b3", None, 0, 'opacity="0.6"')
        ell(s, 5.2, -87.8, 1.6, 0.8, "#ffb3b3", None, 0, 'opacity="0.6"')
    hs = shade(hair, 0.7)
    if style == "spiky":
        d = "M -11 -88 L -12 -97 L -15 -101 L -9 -101 L -10 -107 L -4 -103 L -2 -110 L 2 -104 L 7 -109 L 7 -102 L 13 -103 L 10 -97 L 12 -91 L 8 -95 L 5 -91 L 2 -96 L -2 -91 L -5 -96 L -8 -90 Z"
        path(s, d, hair, INK, sw / k)
        path(s, "M -1 -110 L 1 -116 L 3 -110", hair, INK, sw / k * 0.8)            # the strand that sticks up
        path(s, "M 3 -104 L 7 -102 L 9 -98 L 6 -100 Z", hs, None, 0)
    elif style == "bob":
        path(s, "M -11 -84 Q -13 -104 0 -104 Q 13 -104 11 -84 L 8 -84 L 8 -95 Q 0 -99 -8 -95 L -8 -84 Z", hair, INK, sw / k)
        path(s, "M -7 -96 L -2 -91 L 1 -96 L 4 -91 L 8 -96 Q 0 -101 -7 -96 Z", hair, None, 0)
        if o.get("clip"):
            rect(s, 5, -99, 4, 1.6, o["clip"], INK, sw / k * 0.4)
    elif style == "bun":
        circ(s, 0, -106, 5.2, hair, INK, sw / k)
        path(s, "M -10.5 -88 Q -12 -103 0 -103 Q 12 -103 10.5 -88 Q 7 -98 0 -97 Q -7 -98 -10.5 -88 Z", hair, INK, sw / k)
    elif style == "swept":
        path(s, "M -10 -89 Q -12 -104 1 -104 Q 13 -103 10.5 -90 Q 8 -100 -2 -98 Q -7 -97 -10 -89 Z", hair, INK, sw / k)
        path(s, "M -6 -101 Q 2 -103 9 -99", "none", hs, sw / k * 0.6)
    elif style == "long":
        path(s, "M -11 -70 Q -14 -104 0 -104 Q 14 -104 11 -70 L 7 -72 L 8 -95 Q 0 -99 -8 -95 L -7 -72 Z", hair, INK, sw / k)
    else:  # short
        path(s, "M -10.5 -88 Q -12 -104 0 -103.5 Q 12 -104 10.5 -88 L 8 -94 L 3 -92 L 0 -96 L -4 -92 L -8 -94 Z", hair, INK, sw / k)
    if view == "back":
        path(s, "M -10 -86 Q -11 -104 0 -104 Q 11 -104 10 -86 Q 0 -82 -10 -86 Z", hair, INK, sw / k)
    s.add("</g>")


def crowd(s, n, y0, y1, h0, h1, seed, cols, dark=False, xr=(0, W)):
    r = rnd(seed)
    items = []
    for _ in range(n):
        y = r.uniform(y0, y1)
        t = (y - y0) / max(1, (y1 - y0))
        items.append((y, r.uniform(*xr), h0 + (h1 - h0) * t))
    for y, x, h in sorted(items):
        c = r.choice(cols)
        person(s, x, y, h, {"view": r.choice(["front", "back", "front"]), "top": c, "bottom": shade(c, 0.85), "hair": r.choice(["#1e1a2a", "#3a2a24", "#2a2430"]),
                            "style": r.choice(["short", "swept", "short", "bob"]), "shirt": "#f2f2f2", "tie": r.choice(["#2a3a6a", "#6a2a2a", "#2a2a2a"]),
                            "flip": r.random() < 0.5})



# ---- a close-up: head and shoulders, drawn larger and in more detail than a figure (the way the anime posters put their people) -------------
def bust(s, cx, cy, size, o, look=0.0):
    """Head and shoulders, chin at about (cx, cy), the head `size` pixels tall. look: -1..1, eyes turned left/right."""
    k = size / 120.0
    hair, hs, hl = o.get("hair", "#1e1a2a"), shade(o.get("hair", "#1e1a2a"), 0.62), shade(o.get("hair", "#1e1a2a"), 2.6)
    top, ec = o.get("top", "#1d2236"), o.get("eyes", "#3a3060")
    s.add('<g transform="translate(%.1f %.1f) scale(%.4f)">' % (cx, cy, k))
    sw = 2.6
    # shoulders, jacket, collar and tie
    path(s, "M -150 200 Q -140 95 -40 78 L 40 78 Q 140 95 150 200 Z", top, INK, sw)
    path(s, "M 40 78 Q 140 95 150 200 L 70 200 Q 60 120 40 78 Z", shade(top, 0.78), None, 0)
    if o.get("shirt"):
        path(s, "M -34 76 L 0 140 L 34 76 L 20 72 L 0 100 L -20 72 Z", o["shirt"], INK, sw)
        path(s, "M -34 76 L -48 120 L 0 150 L 48 120 L 34 76 L 0 140 Z", "none", INK, sw * 0.8)
    if o.get("tie"):
        path(s, "M -9 98 L 9 98 L 13 168 L 0 186 L -13 168 Z", o["tie"], INK, sw)
        path(s, "M -9 98 L 9 98 L 6 110 L -6 110 Z", shade(o["tie"], 0.8), INK, sw * 0.6)
    if o.get("hood"):
        path(s, "M -70 84 Q 0 120 70 84 Q 60 66 0 70 Q -60 66 -70 84 Z", shade(top, 0.85), INK, sw)
    # neck
    path(s, "M -18 30 L -18 84 Q 0 94 18 84 L 18 30 Z", SKIN_SH, INK, sw)
    # back hair, behind the face
    st = o.get("style", "spiky")
    if st == "bob":
        path(s, "M -66 -30 Q -74 50 -52 70 L 52 70 Q 74 50 66 -30 Z", hair, INK, sw)
    elif st == "long":
        path(s, "M -64 -30 Q -80 90 -60 150 L 60 150 Q 80 90 64 -30 Z", hair, INK, sw)
    elif st == "bun":
        circ(s, 0, -96, 30, hair, INK, sw)
    # the face: wide at the cheekbones, a small pointed chin
    path(s, "M -56 -24 Q -58 22 -30 46 Q -10 62 0 64 Q 10 62 30 46 Q 58 22 56 -24 Q 50 -82 0 -84 Q -50 -82 -56 -24 Z", SKIN, INK, sw)
    path(s, "M -56 -24 Q -55 -6 -50 4 Q -30 -16 0 -14 Q 30 -16 50 4 Q 55 -6 56 -24 Z", SKIN_SH, None, 0, 'opacity="0.55"')
    # eyes
    for side in (-1, 1):
        ex, ey = side * 25 + look * 3, 0
        path(s, "M %.1f %.1f Q %.1f %.1f %.1f %.1f Q %.1f %.1f %.1f %.1f Z" % (ex - 15, ey - 2, ex, ey - 22, ex + 15, ey - 3, ex + 2, ey + 22, ex - 15, ey - 2), "#ffffff", INK, 1.6)
        ell(s, ex + look * 3, ey + 1, 10.5, 15, ec)
        ell(s, ex + look * 3, ey - 6, 10.5, 8, shade(ec, 0.5))
        ell(s, ex + look * 3, ey + 9, 6.5, 4, shade(ec, 1.6), None, 0, 'opacity="0.8"')
        ell(s, ex + look * 3, ey + 1, 4.5, 7, "#100c18")
        circ(s, ex + look * 3 - 4.5, ey - 6, 3.6, "#ffffff")
        circ(s, ex + look * 3 + 4, ey + 6, 1.8, "#ffffff")
        # the lash line, thick, with a flick at the outer corner
        o_x = ex + side * 16
        path(s, "M %.1f %.1f Q %.1f %.1f %.1f %.1f L %.1f %.1f" % (ex - side * 16, ey - 1, ex, ey - 24, o_x, ey - 4, o_x + side * 4, ey - 8), "none", INK, 5.5)
        path(s, "M %.1f %.1f Q %.1f %.1f %.1f %.1f" % (ex - 10, ey + 19, ex, ey + 21, ex + 10, ey + 18), "none", shade(INK, 2.5), 1.6)
        # the brow
        path(s, "M %.1f -26 Q %.1f %.1f %.1f %.1f" % (ex - side * 15, ex, -33 - o.get("brow", 0), ex + side * 16, -28 + o.get("brow", 0) * side * 0), "none", shade(hair, 0.8), 4.5)
        ell(s, side * 34, 28, 9, 4, "#ff9fa6", None, 0, 'opacity="0.45"')
    path(s, "M 2 20 L -1 30 L 3 31", "none", shade(SKIN_SH, 0.8), 2)
    mouth = o.get("mouth", "smile")
    if mouth == "open":
        path(s, "M -10 42 Q 0 54 10 42 Q 0 46 -10 42 Z", "#9a3a3a", INK, 2)
    elif mouth == "flat":
        path(s, "M -8 44 L 8 44", "none", "#7a3a3a", 2.4)
    else:
        path(s, "M -9 42 Q 0 48 9 42", "none", "#7a3a3a", 2.4)
    # front hair
    if st == "spiky":
        s.add('<g transform="translate(0 -4) scale(0.94 0.78)">')
        path(s, "M -62 -10 L -66 -46 L -84 -60 L -60 -66 L -70 -96 L -40 -84 L -34 -118 L -10 -94 L 4 -126 L 16 -96 L 40 -118 L 42 -86 L 72 -94 L 60 -62 L 82 -56 L 64 -40 L 66 -6 "
                "L 50 -30 L 44 -6 L 30 -36 L 20 -10 L 8 -40 L -6 -12 L -16 -40 L -28 -10 L -36 -38 L -48 -6 Z", hair, INK, sw)
        path(s, "M -4 -126 L 2 -150 L 10 -124", hair, INK, sw)          # the strand that will not lie down
        path(s, "M -46 -70 L -30 -78 L -14 -70 L 4 -80 L 22 -70 L 40 -78 L 50 -66 L 36 -70 L 22 -62 L 4 -72 L -14 -62 L -30 -70 Z", hl, None, 0, 'opacity="0.55"')
        path(s, "M 40 -86 L 72 -94 L 60 -62 L 82 -56 L 64 -40 L 66 -6 L 50 -30 Z", hs, None, 0, 'opacity="0.7"')
        s.add("</g>")
    elif st == "swept":
        path(s, "M -60 -14 Q -66 -76 -20 -92 Q 30 -106 62 -66 Q 70 -40 60 -12 Q 54 -46 30 -58 Q 0 -70 -30 -56 Q -52 -44 -60 -14 Z", hair, INK, sw)
        path(s, "M -30 -56 Q -10 -40 -4 -14 Q -12 -36 -30 -48 Z", hair, INK, 2)
        path(s, "M -40 -76 Q 0 -94 40 -80", "none", hl, 5, 'opacity="0.6"')
        path(s, "M -34 -66 Q 4 -84 46 -64", "none", hl, 3, 'opacity="0.4"')
    elif st == "bob":
        path(s, "M -66 -20 Q -70 -90 0 -92 Q 70 -90 66 -20 L 54 -16 L 46 -40 L 30 -18 L 22 -44 L 4 -16 L -10 -44 L -24 -16 L -36 -42 L -54 -16 Z", hair, INK, sw)
        path(s, "M -44 -70 Q 0 -86 44 -70", "none", hl, 5, 'opacity="0.55"')
        if o.get("clip"):
            rect(s, 30, -64, 24, 9, o["clip"], INK, 2, 3)
    elif st == "long":
        path(s, "M -64 -10 Q -70 -90 0 -92 Q 70 -90 64 -10 L 50 -40 Q 30 -30 10 -50 Q -10 -30 -50 -38 Z", hair, INK, sw)
        path(s, "M -44 -70 Q 0 -86 44 -70", "none", hl, 5, 'opacity="0.55"')
    elif st == "bun":
        path(s, "M -60 -10 Q -66 -88 0 -90 Q 66 -88 60 -10 Q 50 -56 10 -56 Q 20 -40 0 -36 Q -30 -60 -60 -10 Z", hair, INK, sw)
        path(s, "M -40 -72 Q 0 -86 40 -72", "none", hl, 5, 'opacity="0.55"')
    else:
        path(s, "M -60 -14 Q -66 -92 0 -92 Q 66 -92 60 -14 L 48 -40 L 30 -24 L 16 -48 L 0 -26 L -16 -48 L -30 -24 L -48 -40 Z", hair, INK, sw)
        path(s, "M -40 -74 Q 0 -88 40 -74", "none", hl, 5, 'opacity="0.55"')
    s.add("</g>")

# ---- the cast -----------------------------------------------------------------------------------------------------------------------------
SEIKO_VILLAGE = {"hair": "#211a33", "style": "spiky", "top": "#7a5a3c", "bottom": "#4a3c2e", "eyes": "#2a3a80", "bag": "#b08a5a"}
SEIKO_SUIT = {"hair": "#211a33", "style": "spiky", "top": "#1d2236", "bottom": "#1d2236", "shirt": "#ffffff", "tie": "#ee7a1e", "eyes": "#2a3a80"}
MOTHER = {"hair": "#7a4a2c", "style": "bun", "top": "#8a2a3a", "bottom": "#8a2a3a", "skirt": True, "eyes": "#5a3a2a"}
FATHER = {"hair": "#8a8a90", "style": "short", "top": "#6a6e76", "bottom": "#33363c", "shirt": "#f4f4f4", "eyes": "#3a3a3a"}
SISTER = {"hair": "#6a4028", "style": "bob", "top": "#efe6d2", "bottom": "#3f7a4a", "skirt": True, "eyes": "#2a8a8a", "clip": "#d83a3a"}
AKIO = {"hair": "#141218", "style": "swept", "top": "#3a3d44", "bottom": "#3a3d44", "shirt": "#ffffff", "tie": "#1a1a1e", "eyes": "#30303a"}
OL = {"hair": "#1e1a2a", "style": "long", "top": "#2c3550", "bottom": "#2c3550", "skirt": True, "shirt": "#ffffff", "eyes": "#3a2a3a"}


# ---- the slides ---------------------------------------------------------------------------------------------------------------------------
def slide_home():
    s = S()
    sky(s, "#3b3a7a", "#e8789a", "#ffd39a")
    sun(s, 1460, 560, 60)
    rays(s, 1460, 560, 14, "#fff2c8", 3, 0.09)
    for i, (cx, cy, sc) in enumerate([(380, 200, 1.3), (900, 140, 1.0), (1700, 260, 1.1)]):
        cloud(s, cx, cy, sc, "#ffe8e0", "#d79aa8", i + 4)
    ridge(s, 600, 110, "#6a6aa8", 11)
    ridge(s, 680, 90, "#4f5a8e", 12)
    ridge(s, 760, 60, "#3d5a6a", 13, edge=None)
    # terraced paddies, flooded, holding the sky
    for i in range(7):
        y = 770 + i * 48
        g = s.grad([(0, "#f7b8a8"), (1, "#ffe0b0")], 0, 0, 1, 0)
        path(s, "M -20 %d Q 600 %d 1200 %d T 1960 %d L 1960 %d Q 1200 %d 600 %d T -20 %d Z" % (y, y - 18, y + 6, y - 10, y + 40, y + 46, y + 22, y + 40),
             g if i % 2 == 0 else "#6a9a4a", "#3b4a2a", 2)
    # the farmhouse
    poly(s, [(180, 790), (520, 790), (560, 700), (140, 700)], "#2e3142", INK, 3)
    rect(s, 200, 790, 300, 150, "#cdb594", INK, 3)
    rect(s, 330, 830, 60, 110, "#5a3e2a", INK, 3)
    windows_grid(s, 215, 805, 100, 70, 3, 2, "#ffd88a", "#7a5a3a", 5, 0.8)
    windows_grid(s, 400, 805, 90, 70, 3, 2, "#ffd88a", "#7a5a3a", 6, 0.8)
    # the single-track line and its halt, far off
    rect(s, 0, 742, W, 6, "#5a4a3a")
    rect(s, 1180, 724, 160, 18, "#9a948a", INK, 2)
    person(s, 900, 1010, 330, dict(SEIKO_VILLAGE, view="front"))
    petals(s, 40, 9)
    return s


def slide_halt():
    s = S()
    sky(s, "#5a4a8a", "#f08a7a", "#ffd9a0")
    sun(s, 960, 620, 70)
    rays(s, 960, 620, 18, "#fff0c0", 7, 0.10)
    cloud(s, 300, 220, 1.2, "#ffe6dc", "#d98f9e", 21)
    cloud(s, 1600, 170, 1.4, "#ffe6dc", "#d98f9e", 22)
    ridge(s, 640, 120, "#7068a8", 31)
    ridge(s, 720, 70, "#4a5888", 32)
    # the platform and its bench and board
    poly(s, [(0, 820), (W, 760), (W, 1080), (0, 1080)], "#c9c2b4", INK, 3)
    poly(s, [(0, 830), (W, 772), (W, 790), (0, 848)], "#e8c03a", None, 0)
    rect(s, 1450, 610, 220, 70, "#ffffff", INK, 3, 6)
    rect(s, 1450, 610, 220, 12, "#18a058")
    text(s, 1560, 660, "みずほ", 34, "#1b2a3a")
    rect(s, 1470, 680, 8, 100, "#5a5e66", INK, 2)
    rect(s, 1642, 680, 8, 100, "#5a5e66", INK, 2)
    # the little train coming in from the left
    poly(s, [(-40, 610), (420, 590), (430, 790), (-40, 806)], "#d9dde2", INK, 3)
    poly(s, [(-40, 700), (425, 686), (426, 700), (-40, 714)], "#18a058", None, 0)
    windows_grid(s, 10, 615, 380, 60, 5, 1, "#bfe0ff", "#9ab8d0", 8, 0.6, 0.3)
    speedlines(s, 26, 3, "#ffffff", 0.55, 580, 820)
    person(s, 760, 990, 360, dict(MOTHER, wave="r"))
    person(s, 1010, 1000, 380, dict(FATHER))
    person(s, 1220, 1000, 230, dict(SISTER, wave="r"))
    person(s, 420, 1110, 470, dict(SEIKO_VILLAGE, view="back"))
    petals(s, 70, 13)
    return s


def slide_train():
    s = S()
    # inside: cream walls, blue bench, straps; out of the window the paddies run by in the morning
    rect(s, 0, 0, W, H, "#efe7d6")
    win = s.grad([(0, "#9ad0f0"), (0.55, "#ffe0b8"), (1, "#f4b08a")])
    for i, x in enumerate([120, 760, 1400]):
        rect(s, x, 170, 520, 380, win, INK, 4, 10)
        s.add('<g clip-path="none">')
        ridge_y = 420
        poly(s, [(x, 470), (x + 520, 450), (x + 520, 550), (x, 550)], "#5f8a4a")
        poly(s, [(x, 430), (x + 200, 380), (x + 380, 410), (x + 520, 370), (x + 520, 470), (x, 480)], "#6a7aa8")
        speedlines(s, 10, 40 + i, "#ffffff", 0.7, 300, 540)
        s.add("</g>")
        rect(s, x, 170, 520, 380, "none", INK, 4, 10)
    for x in range(140, 1900, 120):
        path(s, "M %d 60 L %d 120" % (x, x), "none", "#c9c9c9", 3)
        circ(s, x, 132, 14, "none", "#d8d8d8", 5)
    rect(s, 0, 52, W, 10, "#b9bfc6", INK, 2)
    rect(s, 820, 50, 340, 70, "#0e6a3a", INK, 3, 4)
    text(s, 990, 98, "Mizuho Line ▸ Tōkonto", 30, "#ffffff")
    rect(s, 0, 640, W, 90, "#2a55a6", INK, 4, 14)
    rect(s, 0, 730, W, 70, "#1d3e7a", INK, 3)
    rect(s, 0, 800, W, 280, "#8a8f98")
    bust(s, 1300, 760, 420, dict(SEIKO_VILLAGE, hood=True), look=-0.6)
    return s


def slide_city():
    s = S()
    sky(s, "#2a3a7a", "#f08a6a", "#ffe0a0", 0.7)
    sun(s, 1500, 700, 64)
    rays(s, 1500, 700, 20, "#fff2c8", 17, 0.08)
    cloud(s, 400, 180, 1.4, "#ffe8dc", "#d9909a", 41)
    cloud(s, 1200, 120, 1.0, "#ffe8dc", "#d9909a", 42)
    r = rnd(5)
    x = -40
    while x < W:
        w = r.uniform(70, 150)
        h = r.uniform(180, 420)
        tower(s, x, 820, w, h, "#4a5a8a", "#3a4670", "#ffd98a", "#2c3456", int(x), litp=0.35)
        x += w + r.uniform(-10, 6)
    tower(s, 860, 820, 200, 720, "#5a6cae", "#46548a", "#ffe9b0", "#33406e", 77, crown=90, litp=0.45)   # SOTI Tower
    circ(s, 960, 0, 0, "none")
    ell(s, 960, 18, 60, 30, "#fff3c0", None, 0, 'filter="url(#glow)" opacity="0.9"')
    text(s, 960, 175, "SOTI", 54, "#ffffff", 900)
    r2 = rnd(9)
    x = -60
    while x < W:
        w = r2.uniform(90, 200)
        h = r2.uniform(100, 260)
        tower(s, x, 900, w, h, "#33406a", "#2a3456", "#ffcf7a", "#1f2744", int(x) + 300, litp=0.25)
        x += w + r2.uniform(-12, 4)
    # the viaduct and a train crossing it
    rect(s, 0, 880, W, 26, "#c8ccd4", INK, 3)
    for px in range(40, W, 180):
        rect(s, px, 906, 30, 180, "#a8adb6", INK, 2)
    poly(s, [(300, 830), (1300, 830), (1330, 880), (300, 880)], "#e8ecf0", INK, 3)
    rect(s, 300, 856, 1030, 8, "#18a058")
    windows_grid(s, 320, 838, 960, 18, 16, 1, "#fff2c0", "#a0b8cc", 18, 0.7, 0.3)
    speedlines(s, 20, 19, "#ffffff", 0.5, 820, 880)
    rect(s, 0, 990, W, 90, "#1c2440")
    return s


def slide_scramble():
    s = S()
    sky(s, "#6aa8e8", "#bfe0ff", "#ffeccc", 0.5)
    # buildings with signs on both sides, the crossing between them
    poly(s, [(0, 0), (520, 0), (560, 760), (0, 900)], "#5a5e78", INK, 3)
    poly(s, [(W, 0), (1400, 0), (1360, 760), (W, 900)], "#4e5470", INK, 3)
    windows_grid(s, 40, 60, 420, 520, 6, 9, "#bfe0ff", "#3a3e56", 51, 0.4)
    windows_grid(s, 1460, 60, 420, 520, 6, 9, "#bfe0ff", "#33384e", 52, 0.4)
    for i, (x, y, w, h, c, t) in enumerate([(60, 600, 300, 90, "#d4152c", "ラーメン"), (1520, 560, 320, 100, "#7a2ad4", "KARAOKE"), (380, 120, 110, 360, "#ffb000", "居酒屋"),
                                            (1420, 120, 110, 380, "#18a058", "SOTI")]):
        rect(s, x, y, w, h, c, INK, 3, 6)
        if h > w:
            for k, ch in enumerate(t if t != "SOTI" else "SOTI"):
                text(s, x + w / 2, y + 70 + k * 80, ch, 64, "#ffffff", 900)
        else:
            text(s, x + w / 2, y + h * 0.68, t, 52, "#ffffff", 900)
    # the road and its zebra stripes, in perspective
    poly(s, [(0, 900), (560, 760), (1360, 760), (W, 900), (W, H), (0, H)], "#3e4250", INK, 3)
    for i in range(-8, 9):
        x0, x1 = 960 + i * 60, 960 + i * 150
        poly(s, [(x0 - 18, 790), (x0 + 18, 790), (x1 + 40, H), (x1 - 40, H)], "#e8e8e8", None, 0)
    crowd(s, 40, 780, 980, 110, 260, 61, ["#262a33", "#2c3550", "#3a3d44", "#4a4e58", "#1d2236"])
    person(s, 960, 1060, 520, dict(SEIKO_SUIT, run=True))
    speedlines(s, 24, 71, "#ffffff", 0.45, 600, 1050)
    path(s, "M 1150 520 Q 1170 545 1150 560 Q 1130 545 1150 520 Z", "#bfe8ff", INK, 3)   # the sweat drop
    return s


def slide_platform():
    s = S()
    rect(s, 0, 0, W, H, "#cfd6de")
    rect(s, 0, 0, W, 140, "#f4f4f2", INK, 3)
    for x in range(100, W, 300):
        rect(s, x, 60, 180, 14, "#ffffff", "#b8b8b8", 2)
    # the departure board
    rect(s, 700, 170, 520, 150, "#121418", INK, 4, 6)
    text(s, 960, 225, "15:42  快速  Rapid  · Marukane", 30, "#ffb000", 700)
    text(s, 960, 280, "15:48  各停  Local  · Tōkonto", 30, "#7ad0ff", 700)
    # the train arriving, a blur of stainless and green
    poly(s, [(-60, 360), (1500, 380), (1560, 760), (-60, 780)], "#dfe3e8", INK, 4)
    poly(s, [(-60, 560), (1535, 556), (1540, 590), (-60, 596)], "#18a058", None, 0)
    windows_grid(s, 0, 400, 1460, 130, 9, 1, "#bfe0ff", "#90aac0", 81, 0.7, 0.25)
    speedlines(s, 40, 83, "#ffffff", 0.75, 360, 780)
    poly(s, [(0, 800), (W, 780), (W, H), (0, H)], "#b8b2a6", INK, 3)
    poly(s, [(0, 806), (W, 786), (W, 806), (0, 826)], "#e8c03a", None, 0)
    crowd(s, 10, 880, 1000, 240, 320, 91, ["#262a33", "#2c3550", "#3a3d44"], xr=(100, 700))
    person(s, 1760, 1040, 470, dict(OL, flip=True))
    bust(s, 1380, 800, 400, dict(SEIKO_SUIT, mouth="open"), look=-0.8)
    return s


def slide_office():
    s = S()
    win = s.grad([(0, "#7ab4e8"), (0.6, "#d8ecff"), (1, "#ffe6c8")])
    rect(s, 0, 0, W, H, win)
    r = rnd(101)
    x = -20
    while x < W:
        w = r.uniform(60, 140)
        h = r.uniform(200, 520)
        tower(s, x, 760, w, h, "#9ab2d6", "#86a0c6", "#ffffff", "#7a94bc", int(x) + 900, litp=0.2)
        x += w + r.uniform(2, 20)
    for px in range(0, W + 1, 320):
        rect(s, px - 10, 0, 20, 760, "#16181d")
    rect(s, 0, 0, W, 40, "#16181d")
    rect(s, 0, 760, W, 320, "#2a2d33")
    # the red clock, one second past nine
    rect(s, 1540, 120, 280, 100, "#0b0d10", INK, 3, 6)
    text(s, 1680, 190, "09:00:01", 60, "#ff3b30", 700)
    bust(s, 960, 520, 330, dict(AKIO, mouth="flat"))
    # his desk across the front, long and black, and his name on it
    poly(s, [(420, 760), (1500, 760), (1560, 830), (360, 830)], "#111316", INK, 4)
    rect(s, 380, 830, 1160, 220, "#16181c", INK, 4)
    rect(s, 820, 790, 280, 30, "#111316", "#c9a24a", 2, 2)
    text(s, 960, 813, "代表取締役 A. SOTIYAMA", 18, "#c9a24a", 700)
    person(s, 300, 1160, 620, dict(SEIKO_SUIT, view="back"))
    return s


def slide_night():
    s = S()
    sky(s, "#0c1030", "#2a2060", "#4a2a6a", 0.6)
    r = rnd(111)
    for _ in range(80):
        circ(s, r.uniform(0, W), r.uniform(0, 400), r.uniform(1, 2.4), "#ffffff", extra='opacity="%.2f"' % r.uniform(0.3, 0.9))
    poly(s, [(0, 0), (620, 0), (680, 900), (0, 1000)], "#1a1c34", INK, 3)
    poly(s, [(W, 0), (1300, 0), (1240, 900), (W, 1000)], "#1c1e38", INK, 3)
    for i, (x, y, w, h, c, t) in enumerate([(60, 200, 120, 520, "#ff3a7a", "カプセル"), (220, 140, 110, 420, "#3ad0ff", "ホテル"), (1600, 160, 130, 520, "#ffb000", "居酒屋"),
                                            (1420, 300, 120, 360, "#7a5aff", "BAR")]):
        rect(s, x - 8, y - 8, w + 16, h + 16, c, None, 0, 10, 'filter="url(#glow)" opacity="0.7"')
        rect(s, x, y, w, h, "#120f1e", c, 6, 8)
        for k, ch in enumerate(t if len(t) < 4 or t == "BAR" else t):
            text(s, x + w / 2, y + 80 + k * 100, ch, 70 if t != "BAR" else 58, c, 900)
    poly(s, [(0, 1000), (680, 900), (1240, 900), (W, 1000), (W, H), (0, H)], "#22243a", INK, 3)
    for i in range(6):
        ell(s, 400 + i * 230, 1010 + (i % 2) * 20, 120, 16, ["#ff3a7a", "#3ad0ff", "#ffb000"][i % 3], None, 0, 'opacity="0.25"')
    person(s, 960, 1040, 500, dict(SEIKO_SUIT, view="back"))
    return s


SLIDES = [("01_mizuho", slide_home), ("02_farewell", slide_halt), ("03_train", slide_train), ("04_tokonto", slide_city), ("05_scramble", slide_scramble),
          ("06_platform", slide_platform), ("07_office", slide_office), ("08_night", slide_night)]

if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    fontdir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Web", "art", "fonts"))
    for name, fn in SLIDES:
        svg = fn().svg().replace("FONT_CSS_DIR", "file://" + fontdir)
        open(os.path.join(out, name + ".svg"), "w").write(svg)
        print(name)
