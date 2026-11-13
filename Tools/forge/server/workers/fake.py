"""CPU stand-in for the GPU workers (FORGE_FAKE=1), so the server, client, GitHub workflow and finisher can be tested anywhere.

It speaks the same protocol and returns a real GLB: a bevelled box the shape of the input image's bounding box, textured with
the input image's colours, with an ORM map. It is not a 3D model of anything; it only exercises the plumbing.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, ".."), os.path.join(HERE, "..", "..")]
from common import load_rgba, log, serve, write_pbr_glb  # noqa: E402

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402


def t2i(job):
    rng = np.random.default_rng(int(job.get("seed", 0)))
    im = Image.new("RGB", (1024, 1024), (255, 255, 255))
    d = ImageDraw.Draw(im)
    col = tuple(int(x) for x in rng.integers(40, 200, 3))
    d.rounded_rectangle((300, 180, 724, 900), 40, fill=col, outline=(30, 30, 30), width=8)
    for y in range(240, 860, 60):
        d.rectangle((340, y, 684, y + 30), fill=tuple(min(255, c + 40) for c in col))
    p = os.path.join(job["out"], "reference.png")
    im.save(p)
    return {"images": [p]}


def box(w, h, dpt):
    x, y, z = w / 2, h, dpt / 2
    P = [[-x, 0, z], [x, 0, z], [x, y, z], [-x, y, z], [x, 0, -z], [-x, 0, -z], [-x, y, -z], [x, y, -z]]
    sides = [(0, 1, 2, 3), (4, 5, 6, 7), (1, 4, 7, 2), (5, 0, 3, 6), (3, 2, 7, 6), (5, 4, 1, 0)]
    V, U, N, F = [], [], [], []
    for si, s in enumerate(sides):
        a, b, c = np.array(P[s[0]]), np.array(P[s[1]]), np.array(P[s[2]])
        n = np.cross(b - a, c - a); n = n / np.linalg.norm(n)
        u0 = (si % 3) / 3.0; v0 = (si // 3) / 2.0
        for k, (du, dv) in zip(s, ((0, 1), (1, 1), (1, 0), (0, 0))):
            V.append(P[k]); N.append(n); U.append([u0 + du / 3.0, v0 + dv / 2.0])
        o = si * 4
        F += [[o, o + 1, o + 2], [o, o + 2, o + 3]]
    return np.array(V, np.float32), np.array(F, np.uint32), np.array(U, np.float32), np.array(N, np.float32)


def generate(job):
    out = job["out"]
    views = job.get("images") or {}
    if isinstance(views, list):
        views = {"front": views[0]}
    im = load_rgba(views["front"]).convert("RGB")
    im.save(os.path.join(out, "input_front.png"))
    a = np.asarray(im.convert("L"))
    ys, xs = np.where(a < 245)
    w, h = (np.ptp(xs) + 1, np.ptp(ys) + 1) if len(xs) else (1, 1)
    V, F, U, N = box(w / max(w, h), h / max(w, h), 0.5 * w / max(w, h))
    tile = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)) if len(xs) else im
    atlas = Image.new("RGB", (1536, 1024))
    for i in range(6):
        atlas.paste(tile.resize((512, 512)), ((i % 3) * 512, (i // 3) * 512))
    alb = np.asarray(atlas)
    rough = np.asarray(atlas.convert("L").filter(ImageFilter.GaussianBlur(3)))
    rough = (90 + (255 - rough) * 0.5).astype(np.uint8)
    met = np.zeros_like(rough)
    log("fake worker: box", V.shape, F.shape)
    p = os.path.join(out, "model.glb")
    write_pbr_glb(p, V, F, U, N, alb, met, rough, name=job.get("name", "forge"))
    return {"model": p}


if __name__ == "__main__":
    serve({"generate": generate, "t2i": t2i})
