#!/usr/bin/env python3
"""Packs the first-person arm renders (Tools/hud/render_fparm.mjs) for the game.

    python3 Tools/hud/pack_fparm.py <render dir>

Each <view>_<outfit>.png is cropped to what is drawn, saved as Web/art/hud/fparm/<view>_<outfit>.webp, and its numbers (where the
phone or the watch lands, shifted by the crop) go into Web/art/hud/fparm/index.json, keyed by the outfit's model file.
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "Web", "art", "hud", "fparm")


def main(src):
    os.makedirs(OUT, exist_ok=True)
    index = {}
    for f in sorted(os.listdir(src)):
        if not f.endswith(".json"):
            continue
        info = json.load(open(os.path.join(src, f)))
        view, outfit = f[:-5].split("_", 1)
        im = Image.open(os.path.join(src, f[:-5] + ".png")).convert("RGBA")
        x0, y0, x1, y1 = im.getchannel("A").point(lambda a: 255 if a > 3 else 0).getbbox() or (0, 0, im.width, im.height)
        pad = 4
        x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)
        crop = im.crop((x0, y0, x1, y1))
        name = "%s_%s.webp" % (view, outfit)
        crop.save(os.path.join(OUT, name), "WEBP", quality=88, method=6)
        e = {"img": "art/hud/fparm/" + name, "size": [crop.width, crop.height], "frame": info["size"], "at": [x0, y0]}
        if view == "phone":
            p = info["phone"]
            e["phone"] = [round(p[0] - x0, 1), round(p[1] - y0, 1), round(p[2] - x0, 1), round(p[3] - y0, 1)]
        else:
            w = info["watch"]
            e["watch"] = {"x": round(w["x"] - x0, 1), "y": round(w["y"] - y0, 1), "ang": round(w["ang"], 4), "pxPerM": round(w["pxPerM"], 1), "across": round(w["across"], 1), "cuff": w.get("cuff")}
        index.setdefault(info["model"] + ".glb", {})[view] = e
        print(name, crop.size, os.path.getsize(os.path.join(OUT, name)) // 1024, "KB")
    json.dump(index, open(os.path.join(OUT, "index.json"), "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/fparm")
