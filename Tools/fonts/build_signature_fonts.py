#!/usr/bin/env python3
"""Salary Man's two signature typefaces, drawn from scratch (no outlines copied from any existing font).

  Konto Kanban  - the title face. Heavy, extended, slanted capitals with squared bowls and soft corners, in the
                  same spirit as the lettering on art/logo.png. Used for the title cards, MISSION PASSED / MISSION
                  FAILED and big headings. Capitals only: lower case maps onto the capitals.
  Konto Text    - the reading face, for subtitles, menus and the HUD. A monoline geometric sans with flat
                  terminals, open counters and a tall x-height so it reads at 16 px over a moving picture.
                  Regular (400) and Bold (700).

Every glyph is built here from rectangles, arcs and centre-line strokes (shapely), then written out with fontTools.
Rerun after changing a glyph:

    pip install fonttools shapely brotli
    python3 Tools/fonts/build_signature_fonts.py            # writes Web/art/fonts/konto-*.woff2
    python3 Tools/fonts/build_signature_fonts.py --preview out.png   # also renders a specimen (needs Pillow)

Kanji and kana are not drawn: the CSS stacks fall back to Konto Sans (M PLUS 1) for those.
"""
import math, os, sys, argparse
from shapely.geometry import box, Polygon, LineString, Point, MultiPolygon, GeometryCollection
from shapely.ops import unary_union
from shapely.geometry.polygon import orient
from shapely import affinity
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "Web", "art", "fonts")
UPM = 1000
VERSION = "1.000"
COPY = "Copyright 2026 Salary Man contributors. Original design, drawn procedurally."
LICENSE = "Licensed under the SIL Open Font License, Version 1.1 (see LICENSE-konto-signature.txt)."

# ------------------------------------------------------------------------------------------------ geometry helpers
def arc(cx, cy, rx, ry, a0, a1, step=4.0):
    n = max(2, int(abs(a1 - a0) / step) + 1)
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / (n - 1))),
             cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / (n - 1)))) for i in range(n)]

def catmull(pts, seg=14):
    """Centripetal-ish Catmull-Rom through the points (ends repeated)."""
    p = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for k in range(seg):
            t = k / seg; t2 = t * t; t3 = t2 * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in range(2)))
    out.append(pts[-1])
    return out

def chain(*parts):
    out = []
    for part in parts:
        for q in part:
            if not out or math.hypot(q[0] - out[-1][0], q[1] - out[-1][1]) > 0.5:
                out.append(q)
    return out

def U(*g):
    return unary_union([x for x in g if x is not None and not x.is_empty])

def rr(x0, y0, x1, y1, r, corners="tl tr bl br"):
    """Rectangle with chosen corners rounded (tl tr bl br)."""
    r = max(0.0, min(r, (x1 - x0) / 2 - 0.01, (y1 - y0) / 2 - 0.01))
    g = box(x0, y0, x1, y1)
    if r <= 0:
        return g
    cs = corners.split()
    for name, (cx, cy, sx, sy) in {"tl": (x0 + r, y1 - r, -1, 1), "tr": (x1 - r, y1 - r, 1, 1),
                                   "bl": (x0 + r, y0 + r, -1, -1), "br": (x1 - r, y0 + r, 1, -1)}.items():
        if name in cs:
            corner = box(min(cx, cx + sx * r), min(cy, cy + sy * r), max(cx, cx + sx * r), max(cy, cy + sy * r))
            g = g.difference(corner).union(Point(cx, cy).buffer(r, quad_segs=24).intersection(corner))
    return g

def para(x0, y0, x1, y1, w):
    """Slanted stroke whose left edge runs (x0,y0)->(x1,y1), horizontally w wide (flat top and bottom)."""
    return Polygon([(x0, y0), (x0 + w, y0), (x1 + w, y1), (x1, y1)])

def stroke(pts, w, cap="flat", join="round", mitre=6.0):
    return LineString(pts).buffer(w / 2.0, cap_style=cap, join_style=join, mitre_limit=mitre, quad_segs=20)

def dot(x, y, r):
    return Point(x, y).buffer(r, quad_segs=24)

def band(y0, y1):
    return box(-2000, y0, 4000, y1)

# ------------------------------------------------------------------------------------------------ glyph -> TrueType
def polys(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, (MultiPolygon, GeometryCollection)):
        return [p for x in g.geoms for p in polys(x)]
    return []

def to_glyph(g):
    pen = TTGlyphPen(None)
    for p in polys(g):
        p = orient(p.simplify(0.35, preserve_topology=True), sign=-1.0)   # TrueType: outer clockwise, holes counter-clockwise
        for ring in [p.exterior] + list(p.interiors):
            pts = []
            for x, y in list(ring.coords)[:-1]:
                q = (int(round(x)), int(round(y)))
                if not pts or q != pts[-1]:
                    pts.append(q)
            if len(pts) > 1 and pts[0] == pts[-1]:
                pts.pop()
            if len(pts) < 3:
                continue
            pen.moveTo(pts[0])
            for q in pts[1:]:
                pen.lineTo(q)
            pen.closePath()
    return pen.glyph()

def build_font(path, family, style, weight, glyphs, metrics, italic_angle=0.0):
    """glyphs: {name: (geometry or None, advance, [codepoints])}"""
    order = [".notdef"] + [n for n in glyphs if n != ".notdef"]
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    cmap = {}
    for n, (_, _, cps) in glyphs.items():
        for c in cps:
            cmap[c] = n
    fb.setupCharacterMap(cmap)
    nd = U(box(60, 0, 440, metrics["cap"]).difference(box(120, 60, 380, metrics["cap"] - 60)))
    gl = {".notdef": to_glyph(nd)}
    hm = {".notdef": (500, 60)}
    for n, (g, adv, _) in glyphs.items():
        gl[n] = to_glyph(g) if g is not None else TTGlyphPen(None).glyph()
        lsb = int(math.floor(g.bounds[0])) if g is not None and not g.is_empty else 0
        hm[n] = (int(round(adv)), lsb)
    fb.setupGlyf(gl)
    fb.setupHorizontalMetrics(hm)
    asc, desc = metrics["asc"], metrics["desc"]
    fb.setupHorizontalHeader(ascent=asc, descent=desc, lineGap=0)
    full = family + ("" if style == "Regular" else " " + style)
    ps = (family + "-" + style).replace(" ", "")
    fb.setupNameTable({"familyName": family, "styleName": style, "uniqueFontIdentifier": ps + ";" + VERSION,
                       "fullName": full, "psName": ps, "version": "Version " + VERSION, "copyright": COPY,
                       "licenseDescription": LICENSE, "licenseInfoURL": "https://openfontlicense.org",
                       "designer": "Salary Man", "manufacturer": "Salary Man"})
    fb.setupOS2(sTypoAscender=asc, sTypoDescender=desc, sTypoLineGap=0, usWinAscent=asc + 40, usWinDescent=-desc + 40,
                sxHeight=metrics.get("x", 500), sCapHeight=metrics["cap"], usWeightClass=weight,
                fsSelection=(0x20 if weight >= 700 else 0x40) | (0x01 if italic_angle else 0), achVendID="KNTO",
                fsType=0)
    fb.setupPost(italicAngle=italic_angle)
    from fontTools.misc.timeTools import timestampFromString
    stamp = timestampFromString("Sun Nov 15 00:00:00 2026")
    fb.setupHead(unitsPerEm=UPM, created=stamp, modified=stamp, fontRevision=float(VERSION))
    fb.font["head"].macStyle = (1 if weight >= 700 else 0) | (2 if italic_angle else 0)
    if path.endswith(".woff2"):
        fb.font.flavor = "woff2"
    fb.save(path)
    return fb.font

# ================================================================================================ Konto Kanban (title)
def kanban():
    H = 700            # cap height
    s = 158            # vertical stem
    b = 128            # horizontal bar
    R = 165            # outer bowl radius
    r = 46             # counter radius
    sd = 196           # diagonal stroke, measured horizontally
    mid = H * 0.5
    SB = 50            # side bearing
    TRIM = {"F": -80, "L": -70, "T": -36, "P": -24, "7": -50, "Y": -20, "V": -10, "A": -10, "1": -20}
    G = {}

    def bowlbox(W, corners="tl tr bl br"):
        return rr(0, 0, W, H, R, corners).difference(rr(s, b, W - s, H - b, r, corners))

    def add(ch, g, W, extra=()):
        G[ch] = (g, W, extra)

    # --- letters
    W = 760; t = para(0, 0, W / 2 - sd / 2 - 40, H, sd).union(para(W - sd, 0, W / 2 - sd / 2 + 40, H, sd))
    hull = t.convex_hull
    add("A", U(t, box(0, H * 0.20, W, H * 0.20 + b).intersection(hull)).intersection(band(0, H)), W)
    W = 700; ym = H * 0.53
    g = U(rr(0, 0, W, ym + b / 2, R, "br"), rr(0, ym - b / 2, W - 34, H, R, "tr"), box(0, 0, s, H))
    g = g.difference(rr(s, b, W - s, ym - b / 2, r, "br")).difference(rr(s, ym + b / 2, W - 34 - s, H - b, r, "tr"))
    g = g.difference(Polygon([(W + 1, ym - 46), (W - 46, ym), (W + 1, ym + 46)]))
    add("B", g, W)
    W = 700; add("C", bowlbox(W).difference(box(W - s - 2, H * 0.36, W + 2, H * 0.64)), W)
    W = 720; add("D", rr(0, 0, W, H, R, "tr br").difference(rr(s, b, W - s, H - b, r, "tr br")), W)
    W = 640
    g = rr(0, 0, W, H, R * 0.55, "tl bl").difference(box(s, b, W + 2, mid - b / 2)).difference(box(s, mid + b / 2, W + 2, H - b))
    add("E", g.difference(box(W - 70, mid - b / 2 - 1, W + 2, mid + b / 2 + 1)), W)
    g = rr(0, 0, W, H, R * 0.55, "tl").difference(box(s, -2, W + 2, mid - b / 2)).difference(box(s, mid + b / 2, W + 2, H - b))
    add("F", g.difference(box(W - 80, mid - b / 2 - 1, W + 2, mid + b / 2 + 1)), W)
    W = 720
    g = bowlbox(W).difference(box(W - s - 2, mid + b / 2, W + 2, H * 0.68))
    add("G", U(g, box(W * 0.46, mid - b / 2, W, mid + b / 2)), W)
    W = 720; add("H", U(box(0, 0, s, H), box(W - s, 0, W, H), box(0, mid - b / 2, W, mid + b / 2)), W)
    add("I", box(0, 0, s, H), s)
    W = 600; g = rr(0, 0, W, H, R, "bl br").difference(rr(s, b, W - s, H + 2, r, "bl br"))
    add("J", g.difference(box(-2, H * 0.40, s + 2, H + 2)), W)
    W = 720
    g = U(box(0, 0, s, H), para(s - 60, mid - 40, W - sd, H, sd), para(s + 60, mid + 20, W - sd, 0, sd))
    add("K", g.intersection(band(0, H)).intersection(box(0, -1, W, H + 1)), W)
    W = 600; add("L", rr(0, 0, W, H, R * 0.55, "bl").difference(box(s, b, W + 2, H + 2)), W)
    W = 900
    g = U(box(0, 0, s, H), box(W - s, 0, W, H), para(0, H, W / 2 - sd / 2, H * 0.22, sd), para(W - sd, H, W / 2 - sd / 2, H * 0.22, sd))
    add("M", g.intersection(band(0, H)).intersection(box(0, -1, W, H + 1)), W)
    W = 740
    g = U(box(0, 0, s, H), box(W - s, 0, W, H), para(0, H, W - sd, 0, sd))
    add("N", g.intersection(band(0, H)).intersection(box(0, -1, W, H + 1)), W)
    W = 740; add("O", bowlbox(W), W)
    W = 690; y0 = H * 0.30
    g = U(box(0, 0, s, H), rr(0, y0, W, H, R, "tr br")).difference(rr(s, y0 + b, W - s, H - b, r, "tr br"))
    add("P", g, W)
    W = 760
    add("Q", U(bowlbox(W), para(W * 0.52, H * 0.30, W * 0.70, -70, sd * 0.85)).intersection(band(-70, H)), W)
    W = 720; y0 = H * 0.36
    g = U(box(0, 0, s, H), rr(0, y0, W, H, R, "tr br")).difference(rr(s, y0 + b, W - s, H - b, r, "tr br"))
    g = U(g, para(W - sd - 130, y0 + b / 2, W - sd, 0, sd).intersection(band(0, y0 + b)))
    add("R", g, W)
    W = 700
    g = rr(0, 0, W, H, R).difference(rr(s, mid + b / 2, W + R, H - b, r, "tl bl")).difference(rr(-R, b, W - s, mid - b / 2, r, "tr br"))
    add("S", g, W)
    W = 680; add("T", U(box(0, H - b, W, H), box(W / 2 - s / 2, 0, W / 2 + s / 2, H)), W)
    W = 720; add("U", rr(0, 0, W, H, R, "bl br").difference(rr(s, b, W - s, H + 2, r, "bl br")), W)
    W = 740
    g = U(para(0, H, W / 2 - sd / 2 - 30, 0, sd), para(W - sd, H, W / 2 - sd / 2 + 30, 0, sd))
    add("V", g.intersection(band(0, H)), W)
    W = 1060; q = W / 4
    g = U(para(0, H, q - sd / 2 - 18, 0, sd), para(2 * q - sd / 2, H * 0.80, q - sd / 2 + 18, 0, sd),
          para(2 * q - sd / 2, H * 0.80, 3 * q - sd / 2 - 18, 0, sd), para(W - sd, H, 3 * q - sd / 2 + 18, 0, sd))
    add("W", g.intersection(band(0, H)), W)
    W = 740
    g = U(para(0, H, W - sd, 0, sd), para(W - sd, H, 0, 0, sd))
    add("X", g.intersection(band(0, H)), W)
    W = 720; yj = H * 0.40
    g = U(para(0, H, W / 2 - sd / 2, yj, sd), para(W - sd, H, W / 2 - sd / 2, yj, sd), box(W / 2 - s / 2, 0, W / 2 + s / 2, yj + 20))
    add("Y", g.intersection(band(0, H)), W)
    W = 680
    g = U(box(0, H - b, W, H), box(0, 0, W, b), para(0, b - 2, W - sd, H - b + 2, sd))
    add("Z", g, W)

    # --- figures (a touch narrower than the capitals)
    W = 620; g = bowlbox(W)
    add("0", U(g, para(s - 10, b + 30, W - s - 80, H - b - 30, 90).intersection(rr(s, b, W - s, H - b, r))), W)
    W = 420; add("1", U(box(W - s, 0, W, H), Polygon([(0, H - 150), (W - s, H), (W - s, H - b - 120), (0, H - b - 150 - 10)])).intersection(band(0, H)), W)
    W = 620
    add("2", rr(0, 0, W, H, R, "tl tr").difference(rr(-R, mid + b / 2, W - s, H - b, r, "tr br")).difference(rr(s, b, W + R, mid - b / 2, r, "tl bl")), W)
    g = rr(0, 0, W, H, R, "tr br").difference(rr(-R, mid + b / 2, W - s, H - b, r, "tr br")).difference(rr(-R, b, W - s, mid - b / 2, r, "tr br"))
    add("3", g.difference(box(-2, mid - b / 2 - 1, W * 0.22, mid + b / 2 + 1)), W)
    W = 660; yb = H * 0.22
    add("4", U(rr(0, yb, s, H, R * 0.5, "bl"), box(0, yb, W, yb + b), box(W - s - 40, 0, W - 40, H)), W)
    W = 620
    add("5", rr(0, 0, W, H, R, "bl br").difference(rr(s, mid + b / 2, W + R, H - b, r, "tl bl")).difference(rr(-R, b, W - s, mid - b / 2, r, "tr br")), W)
    add("6", rr(0, 0, W, H, R).difference(rr(s, mid + b / 2, W + R, H - b, r, "tl bl")).difference(rr(s, b, W - s, mid - b / 2, r)), W)
    W = 600; add("7", U(box(0, H - b, W, H), para(W * 0.22, 0, W - sd, H - b + 2, sd)).intersection(band(0, H)), W)
    W = 640
    g = rr(0, 0, W, H, R).difference(rr(s + 14, mid + b / 2 - 6, W - s - 14, H - b, r)).difference(rr(s, b, W - s, mid - b / 2 - 6, r))
    g = g.difference(Polygon([(-1, mid - 40), (36, mid - 3), (-1, mid + 34)])).difference(Polygon([(W + 1, mid - 40), (W - 36, mid - 3), (W + 1, mid + 34)]))
    add("8", g, W)
    W = 620
    add("9", affinity.rotate(G["6"][0], 180, origin=(W / 2, H / 2)), W)

    # --- punctuation
    pd = rr(0, 0, s, s * 0.92, r)
    add(".", pd, s)
    add(",", U(pd, para(s * 0.20, -150, s * 0.55, 10, s * 0.45)).intersection(band(-150, H)), s)
    add(":", U(pd, affinity.translate(pd, 0, H * 0.46)), s)
    add(";", U(G[","][0], affinity.translate(pd, 0, H * 0.46)), s)
    add("!", U(Polygon([(0, H), (s, H), (s - 22, s * 0.92 + 70), (22, s * 0.92 + 70)]), pd), s)
    W = 580
    q = rr(0, H * 0.38, W, H, R, "tl tr br").difference(rr(-R, H * 0.38 + b, W - s, H - b, r, "tr br"))
    q = q.difference(box(-2, H * 0.38 - 2, W * 0.36, H * 0.38 + b + 2)).union(box(W * 0.36, H * 0.25, W * 0.36 + s, H * 0.38 + b))
    add("?", U(q, affinity.translate(pd, W * 0.36, 0)), W)
    add("'", Polygon([(0, H), (s * 0.8, H), (s * 0.62, H * 0.60), (s * 0.18, H * 0.60)]), s * 0.8, [0x2019, 0x2018])
    add('"', U(G["'"][0], affinity.translate(G["'"][0], s * 0.8 + 40, 0)), s * 1.6 + 40, [0x201C, 0x201D])
    add("-", box(0, H * 0.33, 360, H * 0.33 + b), 360, [0x2010, 0x2212])
    add("–", box(0, H * 0.33, 560, H * 0.33 + b), 560)
    add("—", box(0, H * 0.33, 900, H * 0.33 + b), 900)
    add("·", affinity.translate(pd, 0, H * 0.34), s, [0x30FB, 0x2022])
    add("…", U(pd, affinity.translate(pd, s + 70, 0), affinity.translate(pd, 2 * s + 140, 0)), 3 * s + 140)
    W = 320; add("(", rr(0, -90, W, H + 60, R, "tl bl").difference(rr(s, -90 + b * 0.8, W + R, H + 60 - b * 0.8, r, "tl bl")).difference(box(s, -91, W + 2, H + 61)).union(
        box(s, -90, W, -90 + b * 0.8)).union(box(s, H + 60 - b * 0.8, W, H + 60)), W)
    add(")", affinity.scale(G["("][0], -1, 1, origin=(W / 2, 0)), W)
    add("/", para(0, -60, 520 - sd, H + 40, sd), 520)
    W = 560; add("+", U(box(0, H * 0.33, W, H * 0.33 + b), box(W / 2 - s / 2 + 10, H * 0.33 + b / 2 - W / 2 + 10, W / 2 + s / 2 - 10, H * 0.33 + b / 2 + W / 2 - 10)), W)
    W = 720; yy = H * 0.42
    g = U(para(0, H, W / 2 - sd / 2, yy, sd), para(W - sd, H, W / 2 - sd / 2, yy, sd), box(W / 2 - s / 2, 0, W / 2 + s / 2, yy + 20)).intersection(band(0, H))
    add("¥", U(g, box(W * 0.16, H * 0.30, W * 0.84, H * 0.30 + 80), box(W * 0.16, H * 0.12, W * 0.84, H * 0.12 + 80)), W, [0xFFE5])
    W = 700
    add("&", U(rr(0, 0, W - 120, H * 0.62, R, "tl bl br").difference(rr(s, b, W - 120 - s, H * 0.62 - b, r)),
               rr(30, H * 0.50, W - 230, H, R).difference(rr(30 + s, H * 0.50 + b * 0.5 + 40, W - 230 - s, H - b, r)),
               box(W - 260, H * 0.30, W, H * 0.30 + b)).difference(box(W - 120 - s - 1, H * 0.30 + b, W - 119, H * 0.62 + 1)), W)

    # --- macrons for the romanised names (Tōkonto, Kurogane-kai...)
    acc = {"Ā": "A", "Ē": "E", "Ī": "I", "Ō": "O", "Ū": "U"}
    for ch, base in acc.items():
        g, W, _ = G[base]
        bar = box(W / 2 - 170, H + 70, W / 2 + 170, H + 70 + 92) if W > 300 else box(-60, H + 70, s + 60, H + 162)
        add(ch, U(g, bar), W, [ord(ch) + 1])
    G["É"] = (U(G["E"][0], para(G["E"][1] / 2 - 40, H + 60, G["E"][1] / 2 + 60, H + 200, 150)), G["E"][1], [0xE9])

    # --- slant everything 11 degrees around the middle of the capital, then set side bearings
    sl = math.tan(math.radians(11))
    glyphs = {}
    for ch, (g, W, extra) in G.items():
        g = affinity.skew(g, xs=11, origin=(0, H * 0.45))
        g = rr_soft(g)
        adv = W + 2 * SB + TRIM.get(ch, 0)
        g = affinity.translate(g, SB, 0)
        cps = [ord(ch)] + list(extra)
        if ch.isalpha() and ch.upper() == ch and ord(ch) < 0x80:
            cps.append(ord(ch.lower()))
        glyphs[name_for(ch)] = (g, adv, cps)
    glyphs["space"] = (None, 250, [0x20, 0xA0, 0x3000])
    return glyphs, {"cap": H, "asc": 900, "desc": -240, "x": H}, -11.0

def rr_soft(g, k=10):
    """Takes the very edge off every corner, like ink on a printed sign."""
    return g.buffer(-k, join_style="round", quad_segs=6).buffer(k, join_style="round", quad_segs=6)

def name_for(ch):
    if ch.isalnum() and ord(ch) < 0x80:
        return ch if ch.isupper() or ch.isdigit() else ch + ".lc"
    return "uni%04X" % ord(ch)

# ================================================================================================ Konto Text (reading)
def text_font(w):
    h = w / 2.0
    X = 520      # x-height
    C = 700      # caps
    A = 750      # ascenders
    D = -205     # descenders
    ov = 9       # round overshoot
    G = {}
    def add(ch, g, sb=(62, 62), extra=()):
        G[ch] = (g, sb, extra)

    def bowl(cx, cy, rx, ry):
        return stroke(arc(cx, cy, rx, ry, 0, 360, 3), w, join="round")

    # lower case -------------------------------------------------------------------------------
    Wo = 548; cx = Wo / 2; rx = Wo / 2 - h; ry = X / 2 - h + ov; cy = X / 2
    o = bowl(cx, cy, rx, ry)
    add("o", o, (52, 52))
    add("a", U(o, stroke([(cx + rx, -1), (cx + rx, X + 1)], w).intersection(band(0, X))), (52, 66))
    add("b", U(o, stroke([(cx - rx, 0), (cx - rx, A)], w)), (66, 52))
    add("d", U(o, stroke([(cx + rx, 0), (cx + rx, A)], w)), (52, 66))
    add("p", U(o, stroke([(cx - rx, D), (cx - rx, X)], w)), (66, 52))
    add("q", U(o, stroke([(cx + rx, D), (cx + rx, X)], w)), (52, 66))
    add("c", stroke(arc(cx, cy, rx, ry, 48, 312, 3), w), (52, 34))
    e = U(stroke(arc(cx, cy, rx, ry, 0, 322, 3), w), stroke([(cx - rx, cy - 6), (cx + rx, cy - 6)], w * 0.92))
    add("e", e, (52, 40))
    gy = D + h + 150
    add("g", U(o, stroke(chain([(cx + rx, X)], [(cx + rx, gy)], arc(cx, gy, rx, 150 - 0, 0, -160, 3)), w)), (52, 66))
    Wn = 478; ra = (Wn - w) / 2; ya = X - h + ov - ra * 0.92
    arch = stroke(chain([(Wn - h, 0)], [(Wn - h, ya)], arc(Wn / 2, ya, ra, ra * 0.92, 0, 180, 3)), w)
    n = U(stroke([(h, 0), (h, X)], w), arch)
    add("n", n, (66, 62))
    add("h", U(stroke([(h, 0), (h, A)], w), arch), (66, 62))
    add("u", affinity.rotate(n, 180, origin=(Wn / 2, X / 2)), (62, 66))
    Wm = 790; ma = (Wm / 2 - h) / 2; ym = X - h + ov - ma * 0.98
    a1 = stroke(chain([(Wm / 2, 0)], [(Wm / 2, ym)], arc(h + ma, ym, ma, ma * 0.98, 0, 180, 3)), w)
    a2 = stroke(chain([(Wm - h, 0)], [(Wm - h, ym)], arc(Wm / 2 + ma, ym, ma, ma * 0.98, 0, 180, 3)), w)
    add("m", U(stroke([(h, 0), (h, X)], w), a1, a2), (66, 62))
    rr_ = 168
    add("r", U(stroke([(h, 0), (h, X)], w), stroke(arc(h + rr_, X - h + ov - rr_, rr_, rr_, 180, 72, 3), w)), (66, 20))
    add("i", U(stroke([(h, 0), (h, X)], w), dot(h, X + 165, w * 0.64)), (66, 66))
    add("ı", stroke([(h, 0), (h, X)], w), (66, 66))
    add("l", stroke([(h, 0), (h, A)], w), (66, 66))
    add("j", U(stroke(chain([(150, X)], [(150, D + 120)], arc(30, D + 120, 120, 120 - h, 0, -150, 4)), w), dot(150, X + 165, w * 0.64)), (-30, 66))
    Wt = 300
    add("t", U(stroke([(110, 0), (110, X + 170)], w), stroke([(0, X - h), (Wt, X - h)], w)), (24, 24))
    Wf = 320; fr = 120
    add("f", U(stroke(chain([(110, 0)], [(110, A - h - fr)], arc(110 + fr, A - h - fr, fr, fr, 180, 60, 4)), w), stroke([(0, X - h), (Wf - 40, X - h)], w)), (24, 10))
    Wk = 470
    k = U(stroke([(h, 0), (h, A)], w), stroke([(Wk - 10, X + 40), (h, X * 0.25)], w), stroke([(h + 110, X * 0.43), (Wk + 30, -60)], w))
    add("k", k.intersection(band(0, A)).intersection(box(0, -1, Wk + 4, A + 1)), (66, 30))
    Wv = 500
    add("v", stroke([(-14, X + 60), (Wv / 2, h * 0.3), (Wv + 14, X + 60)], w, join="mitre").intersection(band(0, X)), (24, 24))
    Ww = 780
    add("w", stroke([(-10, X + 60), (Ww * 0.25, h * 0.3), (Ww / 2, X - 20), (Ww * 0.75, h * 0.3), (Ww + 10, X + 60)], w, join="mitre").intersection(band(0, X)), (20, 20))
    add("x", U(stroke([(0, X + 30), (480, -30)], w), stroke([(480, X + 30), (0, -30)], w)).intersection(band(0, X)), (22, 22))
    Wy = 510; sl = (Wy / 2) / X
    add("y", U(stroke([(-14, X + 30), (Wy / 2, 0)], w), stroke([(Wy + 14, X + 30), (Wy / 2 + 14 - sl * (-D + 20) * 0.98, D - 20)], w)).intersection(band(D, X)), (24, 24))
    Wz = 440
    add("z", stroke([(14, X - h), (Wz - 6, X - h), (14, h), (Wz, h)], w, join="mitre", mitre=3), (36, 36))
    def ess(Wd, Ht, wide=0.0):
        # two stacked ellipse arcs that meet at the spine with level tangents
        ym = Ht * 0.53
        ru = (Ht - h + ov - ym) / 2; rl = (ym - (h - ov)) / 2
        rxu = Wd / 2 - h - 14; rxl = Wd / 2 - h + wide
        top = arc(Wd / 2 - 4, ym + ru, rxu, ru, 28, 270, 3)
        bot = arc(Wd / 2, ym - rl, rxl, rl, 90, -152, 3)
        return stroke(chain(top, bot), w)
    add("s", ess(430, X), (44, 44))

    # capitals ---------------------------------------------------------------------------------
    WA = 700
    A_ = stroke([(-30, -110), (WA / 2, C + 80), (WA + 30, -110)], w, join="mitre", mitre=8)
    add("A", U(A_, stroke([(0, C * 0.29), (WA, C * 0.29)], w).intersection(A_.convex_hull)).intersection(band(0, C)), (20, 20))
    ym = C * 0.535
    WB = 560; x1 = 300; r1 = (C - h - ym) / 2; r2 = (ym - h) / 2
    B_ = U(stroke([(h, 0), (h, C)], w), stroke(chain([(h, C - h)], [(x1 + 20 - 60, C - h)], arc(x1 + 20 - 60, ym + r1, WB - 40 - h - (x1 - 40), r1, 90, -90, 3), [(h, ym)]), w),
           stroke(chain([(h, ym)], [(x1, ym)], arc(x1, h + r2, WB - h - x1, r2, 90, -90, 3), [(h, h)]), w))
    add("B", B_, (78, 54))
    WC = 700; ccx = WC / 2; crx = WC / 2 - h; cry = C / 2 - h + ov
    add("C", stroke(arc(ccx, C / 2, crx, cry, 46, 314, 3), w), (52, 40))
    WD = 650; dx = 270
    add("D", U(stroke([(h, 0), (h, C)], w), stroke(chain([(h, C - h)], arc(dx, C / 2, WD - h - dx, C / 2 - h, 90, -90, 3), [(h, h)]), w)), (78, 52))
    add("E", U(stroke([(h, 0), (h, C)], w), stroke([(h, C - h), (470, C - h)], w), stroke([(h, ym - 10), (430, ym - 10)], w), stroke([(h, h), (480, h)], w)), (78, 50))
    add("F", U(stroke([(h, 0), (h, C)], w), stroke([(h, C - h), (460, C - h)], w), stroke([(h, ym - 30), (420, ym - 30)], w)), (78, 40))
    add("G", U(stroke(arc(ccx, C / 2, crx, cry, 44, 360, 3), w), stroke([(ccx + 20, C / 2), (WC - h, C / 2)], w), stroke([(WC - h, C / 2 + h), (WC - h, C * 0.12)], w)).intersection(band(-ov - 2, C + ov + 2)), (52, 70))
    WH = 620
    add("H", U(stroke([(h, 0), (h, C)], w), stroke([(WH - h, 0), (WH - h, C)], w), stroke([(h, C * 0.5), (WH - h, C * 0.5)], w)), (78, 78))
    add("I", stroke([(h, 0), (h, C)], w), (78, 78))
    WJ = 400; jr = (WJ - w) / 2
    add("J", stroke(chain([(WJ - h, C)], [(WJ - h, jr + h - ov)], arc(WJ / 2, jr + h - ov, jr, jr, 0, -180, 3), [(h, jr * 1.1)]), w), (30, 78))
    WK = 600
    K_ = U(stroke([(h, 0), (h, C)], w), stroke([(WK, C + 40), (h, C * 0.26)], w), stroke([(h + 140, C * 0.45), (WK + 40, -60)], w))
    add("K", K_.intersection(band(0, C)).intersection(box(0, -1, WK + 4, C + 1)), (78, 26))
    add("L", U(stroke([(h, 0), (h, C)], w), stroke([(h, h), (440, h)], w)), (78, 30))
    WM = 800
    add("M", stroke([(h, -40), (h, C + 120), (WM / 2, C * 0.12), (WM - h, C + 120), (WM - h, -40)], w, join="mitre", mitre=12).intersection(band(0, C)), (78, 78))
    WN = 650
    add("N", stroke([(h, -40), (h, C + 120), (WN - h, -120), (WN - h, C + 40)], w, join="mitre", mitre=12).intersection(band(0, C)), (78, 78))
    WO = 760
    O_ = stroke(arc(WO / 2, C / 2, WO / 2 - h, C / 2 - h + ov, 0, 360, 3), w)
    add("O", O_, (52, 52))
    WP = 560; yp = C * 0.43; rp = (C - h - yp) / 2
    P_ = U(stroke([(h, 0), (h, C)], w), stroke(chain([(h, C - h)], [(280, C - h)], arc(280, yp + rp, WP - h - 280, rp, 90, -90, 3), [(h, yp)]), w))
    add("P", P_, (78, 50))
    add("Q", U(O_, stroke([(WO * 0.58, C * 0.26), (WO * 0.98, -70)], w)).intersection(band(-80, C + 20)), (52, 30))
    yr = C * 0.45; rq = (C - h - yr) / 2
    R_ = U(stroke([(h, 0), (h, C)], w), stroke(chain([(h, C - h)], [(280, C - h)], arc(280, yr + rq, 580 - 40 - h - 280, rq, 90, -90, 3), [(h, yr)]), w),
           stroke([(300, yr + 10), (600, -60)], w))
    add("R", R_.intersection(band(0, C)), (78, 34))
    WS = 560
    add("S", ess(WS, C, 4), (44, 44))
    WT = 600
    add("T", U(stroke([(0, C - h), (WT, C - h)], w), stroke([(WT / 2, 0), (WT / 2, C)], w)), (20, 20))
    WU = 640; ur = (WU - w) / 2; uy = ur * 0.95 + h - ov
    add("U", stroke(chain([(h, C)], [(h, uy)], arc(WU / 2, uy, ur, ur * 0.95, 180, 360, 3), [(WU - h, C)]), w), (74, 74))
    WV = 680
    add("V", stroke([(-20, C + 80), (WV / 2, h * 0.3), (WV + 20, C + 80)], w, join="mitre", mitre=8).intersection(band(0, C)), (16, 16))
    WW = 1000
    add("W", stroke([(-14, C + 80), (WW * 0.24, h * 0.3), (WW / 2, C + 40), (WW * 0.76, h * 0.3), (WW + 14, C + 80)], w, join="mitre", mitre=8).intersection(band(0, C)), (16, 16))
    WX = 640
    add("X", U(stroke([(0, C + 40), (WX, -40)], w), stroke([(WX, C + 40), (0, -40)], w)).intersection(band(0, C)), (22, 22))
    WY = 660; yy = C * 0.44
    add("Y", U(stroke([(-10, C + 40), (WY / 2, yy)], w), stroke([(WY + 10, C + 40), (WY / 2, yy)], w), stroke([(WY / 2, 0), (WY / 2, yy)], w, join="round")).intersection(band(0, C)), (16, 16))
    WZ = 580
    add("Z", stroke([(30, C - h), (WZ - 10, C - h), (20, h), (WZ, h)], w, join="mitre", mitre=3), (36, 36))

    # figures ----------------------------------------------------------------------------------
    F = 690; WF = 540
    add("0", stroke(arc(WF / 2, F / 2, WF / 2 - h, F / 2 - h + ov, 0, 360, 3), w), (52, 52))
    add("1", stroke([(70, F - 170), (330, F - h * 0.3), (330, 0)], w, join="mitre", mitre=5).intersection(band(0, F)), (40, 120))
    tr = WF / 2 - h - 10
    two = chain(arc(WF / 2, F - h - tr * 0.86, tr, tr * 0.86, 168, -12, 3), [(h + 20, h + 6)], [(WF - 10, h)])
    add("2", stroke(two, w, join="mitre", mitre=4), (42, 42))
    tr3 = WF / 2 - h - 34; br3 = WF / 2 - h
    m3 = F * 0.555
    three = U(stroke(arc(WF / 2 - 20, m3 + (F - h - m3) / 2, tr3, (F - h - m3) / 2 + ov / 2, 160, -90, 3), w),
              stroke(arc(WF / 2, (m3 + h) / 2 - 2, br3, (m3 - h) / 2 + ov / 2 + 2, 90, -158, 3), w))
    add("3", three, (40, 48))
    add("4", stroke([(WF - 130, -40), (WF - 130, F - h * 0.5), (h * 0.6, F * 0.29), (WF + 10, F * 0.29)], w, join="mitre", mitre=4).intersection(band(0, F)), (30, 26))
    bcx, bcy, brx, bry = WF / 2, F * 0.34, WF / 2 - h, F * 0.34 - h + ov
    st = arc(bcx, bcy, brx, bry, 148, -154, 3)
    five = U(stroke([(WF - 30, F - h), (h + 46, F - h), (st[0][0] - 6, st[0][1] + 10)], w, join="mitre", mitre=3), stroke(st, w))
    add("5", five, (42, 48))
    six = U(stroke(arc(bcx, bcy, brx, bry, 0, 360, 3), w), stroke(catmull([(bcx - brx, bcy), (bcx - brx + 22, F * 0.70), (bcx + 10, F - h + ov - 2), (WF - h - 30, F - 110)], 14), w))
    add("6", six, (52, 46))
    add("7", stroke([(h * 0.6, F - h), (WF - h, F - h), (WF * 0.30, -60)], w, join="mitre", mitre=4).intersection(band(0, F)), (40, 40))
    m8 = F * 0.545
    eight = U(stroke(arc(WF / 2, (m8 + F - h) / 2, WF / 2 - h - 28, (F - h - m8) / 2 + ov / 2, 0, 360, 3), w),
              stroke(arc(WF / 2, (m8 + h) / 2, WF / 2 - h, (m8 - h) / 2 + ov / 2, 0, 360, 3), w))
    add("8", eight, (48, 48))
    add("9", affinity.rotate(six, 180, origin=(WF / 2, F / 2)), (46, 52))

    # punctuation ------------------------------------------------------------------------------
    pr = w * 0.64
    pdot = dot(pr, pr, pr)
    add(".", pdot, (60, 60))
    comma = U(pdot, stroke([(pr * 1.5, pr), (pr * 0.4, -150)], w * 0.8)).intersection(band(-160, 2 * pr))
    add(",", comma, (54, 54))
    add(":", U(pdot, dot(pr, X - pr, pr)), (70, 70))
    add(";", U(comma, dot(pr, X - pr, pr)), (64, 64))
    add("!", U(pdot, stroke([(pr, 2 * pr + 120), (pr, C)], w)), (70, 70))
    WQ = 460
    qq = stroke(catmull([(h + 10, C * 0.73), (WQ / 2, C - h + ov), (WQ - h, C * 0.75), (WQ / 2 + 12, C * 0.47), (WQ / 2, 2 * pr + 120)], 14), w)
    add("?", U(qq, dot(WQ / 2, pr, pr)), (36, 36))
    ap = stroke([(h, C), (h, C - 210)], w)
    add("'", ap, (60, 60))
    add('"', U(ap, affinity.translate(ap, w + 80, 0)), (60, 60))
    q1 = U(dot(pr, C - pr - 70, pr), stroke([(pr * 1.5, C - pr - 70), (pr * 0.5, C - 10 - 280)], w * 0.8))
    q1 = affinity.translate(affinity.rotate(comma, 0, origin=(0, 0)), 0, C - 2 * pr)
    add("’", q1, (54, 54))
    add("‘", affinity.rotate(q1, 180, origin=(pr, C - pr * 1.2)), (54, 54))
    add("”", U(q1, affinity.translate(q1, 2 * pr + 60, 0)), (54, 54))
    add("“", U(G["‘"][0], affinity.translate(G["‘"][0], 2 * pr + 60, 0)), (54, 54))
    add("-", stroke([(0, X * 0.50), (240, X * 0.50)], w), (44, 44), [0x2010])
    add("–", stroke([(0, X * 0.50), (500, X * 0.50)], w * 0.9), (0, 0))
    add("—", stroke([(0, X * 0.50), (1000, X * 0.50)], w * 0.9), (0, 0))
    add("·", dot(pr, X * 0.52, pr), (70, 70), [0x2022, 0x30FB])
    add("…", U(pdot, dot(pr + 2 * pr + 110, pr, pr), dot(pr + 4 * pr + 220, pr, pr)), (70, 70))
    add("(", stroke(arc(330, C * 0.42, 290, C * 0.70, 118, 242, 3), w), (40, 30))
    add(")", affinity.scale(G["("][0], -1, 1, origin=(200, 0)), (30, 40))
    add("[", stroke([(220, C + 80), (h, C + 80), (h, -150), (220, -150)], w, join="mitre"), (70, 30))
    add("]", affinity.scale(G["["][0], -1, 1, origin=(150, 0)), (30, 70))
    add("/", stroke([(0, -110), (380, C + 40)], w), (20, 20))
    add("\\", stroke([(380, -110), (0, C + 40)], w), (20, 20))
    add("|", stroke([(h, -160), (h, A + 40)], w), (70, 70))
    pm = X * 0.52
    add("+", U(stroke([(0, pm), (480, pm)], w), stroke([(240, pm - 240), (240, pm + 240)], w)), (50, 50))
    add("−", stroke([(0, pm), (480, pm)], w), (50, 50))
    add("=", U(stroke([(0, pm + 95), (480, pm + 95)], w), stroke([(0, pm - 95), (480, pm - 95)], w)), (50, 50))
    add("×", U(stroke([(0, pm - 200), (400, pm + 200)], w), stroke([(0, pm + 200), (400, pm - 200)], w)), (60, 60))
    add("%", U(stroke(arc(140, C - 150, 140 - h, 150 - h, 0, 360, 4), w), stroke(arc(560, 150, 140 - h, 150 - h, 0, 360, 4), w),
               stroke([(70, -20), (630, C + 20)], w).intersection(band(0, C))), (40, 40))
    add("$", U(G["S"][0], stroke([(WS / 2, -100), (WS / 2, C + 100)], w * 0.86)), (44, 44))
    add("¥", U(G["Y"][0], stroke([(WY * 0.18, C * 0.30), (WY * 0.82, C * 0.30)], w), stroke([(WY * 0.18, C * 0.12), (WY * 0.82, C * 0.12)], w)), (16, 16), [0xFFE5])
    add("#", U(stroke([(170, -10), (250, C - 30)], w), stroke([(400, -10), (480, C - 30)], w), stroke([(40, C * 0.64), (600, C * 0.64)], w),
               stroke([(20, C * 0.30), (580, C * 0.30)], w)).intersection(band(0, C)), (34, 34))
    star = []
    for i in range(3):
        a = math.radians(90 + 60 * i)
        star.append(stroke([(200 - 170 * math.cos(a), C - 190 - 170 * math.sin(a)), (200 + 170 * math.cos(a), C - 190 + 170 * math.sin(a))], w * 0.85))
    add("*", U(*star), (40, 40))
    add("&", U(stroke(catmull([(620, -20), (240, C * 0.48), (150, C * 0.66), (260, C - h + ov), (380, C * 0.70), (110, C * 0.36),
                                 (180, h), (330, h - ov), (570, C * 0.36)], 12), w)).intersection(band(-ov - 2, C + ov + 2)), (36, 30))
    add("@", U(stroke(arc(440, C * 0.38, 440 - h, 470 - h, 0, 330, 3), w), stroke(arc(440, C * 0.38, 170, 190, 0, 360, 3), w),
               stroke([(610, C * 0.38 + 190), (610, C * 0.38 - 120), (680, C * 0.38 - 200)], w)), (40, 40))
    add("~", stroke(catmull([(0, pm - 30), (110, pm + 60), (240, pm - 10), (370, pm - 70), (480, pm + 30)], 10), w), (50, 50))
    add("<", stroke([(420, pm + 230), (0, pm), (420, pm - 230)], w, join="mitre"), (60, 50))
    add(">", affinity.scale(G["<"][0], -1, 1, origin=(210, 0)), (50, 60))
    add("_", stroke([(0, -110), (520, -110)], w), (0, 0))
    add("→", U(stroke([(0, pm), (560, pm)], w), stroke([(380, pm + 190), (560, pm), (380, pm - 190)], w, join="mitre")), (50, 50))
    add("←", affinity.scale(G["→"][0], -1, 1, origin=(280, 0)), (50, 50))
    add("°", stroke(arc(130, C - 130, 130 - h * 0.8, 130 - h * 0.8, 0, 360, 4), w * 0.8), (50, 50))
    add("©", U(stroke(arc(390, C / 2, 390 - h * 0.8, 390 - h * 0.8, 0, 360, 3), w * 0.8), stroke(arc(400, C / 2, 160, 180, 50, 310, 3), w * 0.8)), (40, 40))
    add("★", Polygon([(300 + 300 * math.cos(math.radians(90 + 36 * i)) * (1 if i % 2 == 0 else 0.42),
                            C * 0.42 + 300 * math.sin(math.radians(90 + 36 * i)) * (1 if i % 2 == 0 else 0.42)) for i in range(10)]), (30, 30))
    add("☆", affinity.scale(G["★"][0], 1, 1).difference(G["★"][0].buffer(-w * 0.7, join_style="mitre")), (30, 30))

    # accents ----------------------------------------------------------------------------------
    def with_mark(base, mark_fn, cp):
        g, sb, _ = G[base]
        x0, _, x1, _ = g.bounds
        mx = (x0 + x1) / 2
        top = C if base.isupper() else X
        G[chr(cp)] = (U(g, mark_fn(mx, top)), sb, [])
    macron = lambda mx, top: stroke([(mx - 150, top + 140), (mx + 150, top + 140)], w * 0.9)
    acute = lambda mx, top: stroke([(mx - 50, top + 90), (mx + 90, top + 230)], w * 0.9)
    grave = lambda mx, top: stroke([(mx + 50, top + 90), (mx - 90, top + 230)], w * 0.9)
    diaer = lambda mx, top: U(dot(mx - 120, top + 150, pr), dot(mx + 120, top + 150, pr))
    for base, cp in (("a", 0x101), ("e", 0x113), ("o", 0x14D), ("u", 0x16B), ("A", 0x100), ("E", 0x112), ("I", 0x12A), ("O", 0x14C), ("U", 0x16A)):
        with_mark(base, macron, cp)
    G["ī"] = (U(G["ı"][0], stroke([(h - 140, X + 140), (h + 140, X + 140)], w * 0.9)), (30, 30), [])
    for base, cp in (("e", 0xE9), ("E", 0xC9), ("a", 0xE1), ("o", 0xF3)):
        with_mark(base, acute, cp)
    for base, cp in (("e", 0xE8), ("a", 0xE0)):
        with_mark(base, grave, cp)
    for base, cp in (("u", 0xFC), ("o", 0xF6), ("a", 0xE4), ("U", 0xDC), ("O", 0xD6)):
        with_mark(base, diaer, cp)

    glyphs = {}
    for ch, (g, sb, extra) in G.items():
        x0, _, x1, _ = g.bounds
        g = affinity.translate(g, sb[0] - x0, 0)
        glyphs[name_for(ch)] = (g, sb[0] + (x1 - x0) + sb[1], [ord(ch)] + list(extra))
    glyphs["space"] = (None, 250, [0x20, 0xA0])
    glyphs["uni2009"] = (None, 140, [0x2009, 0x202F])
    return glyphs, {"cap": C, "asc": 940, "desc": -260, "x": X}

# ------------------------------------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", help="write a specimen PNG here")
    ap.add_argument("--ttf", help="also write .ttf copies into this folder")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    jobs = []
    gk, mk, ang = kanban()
    jobs.append(("konto-kanban", "Konto Kanban", "Regular", 900, gk, mk, ang))
    for wname, wt, sw in (("Regular", 400, 84), ("Bold", 700, 122)):
        gt, mt = text_font(sw)
        jobs.append(("konto-text-" + wname.lower(), "Konto Text", wname, wt, gt, mt, 0.0))
    ttfs = {}
    for fn, fam, sty, wt, g, m, ang in jobs:
        p = os.path.join(OUT, fn + ".woff2")
        build_font(p, fam, sty, wt, g, m, ang)
        print("wrote", os.path.relpath(p, ROOT), os.path.getsize(p), "bytes,", len(g), "glyphs")
        if a.ttf or a.preview:
            d = a.ttf or os.path.dirname(os.path.abspath(a.preview))
            t = os.path.join(d, fn + ".ttf")
            build_font(t, fam, sty, wt, g, m, ang)
            ttfs[fn] = t
    if a.preview:
        from PIL import Image, ImageDraw, ImageFont
        img = Image.new("RGB", (2000, 1500), (24, 26, 30))
        d = ImageDraw.Draw(img)
        y = 30
        for fn, size, txt, col in (
                ("konto-kanban", 150, "SALARY MAN", (242, 194, 48)),
                ("konto-kanban", 96, "MISSION PASSED", (242, 194, 48)),
                ("konto-kanban", 96, "MISSION FAILED", (220, 60, 50)),
                ("konto-kanban", 64, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", (240, 240, 240)),
                ("konto-kanban", 64, "0123456789 .,:;!?'\"-()/+&¥ TŌKONTO", (240, 240, 240)),
                ("konto-text-regular", 44, "Akio: You're late, Seiko. The 7:41 rapid doesn't wait for anyone.", (255, 255, 255)),
                ("konto-text-regular", 44, "abcdefghijklmnopqrstuvwxyz  ABCDEFGHIJKLMNOPQRSTUVWXYZ", (255, 255, 255)),
                ("konto-text-regular", 44, "0123456789 ¥30,000 · Tōkonto (Kanda) — \"quiet\" 50% & @ # * ? !", (255, 255, 255)),
                ("konto-text-bold", 44, "New game  Continue  Settings  Quit  · Mission 12 of 50", (255, 255, 255)),
                ("konto-text-regular", 26, "Small subtitle size: Get to SOTI Tower before 9:00. Don't run on the platform.", (230, 230, 230)),
        ):
            f = ImageFont.truetype(ttfs[fn], size)
            d.text((40, y), txt, font=f, fill=col)
            y += int(size * 1.35) + 10
        img.save(a.preview)
        print("preview", a.preview)

if __name__ == "__main__":
    main()
