#!/usr/bin/env python3
"""Fetch the CC0 terrain textures from Poly Haven and pack them for the game (Web/art/terrain).

    python3 Game/tools/build-terrain.py [download-dir]

Needs Pillow and numpy, and curl on the path. Every texture is CC0 (polyhaven.com); see Web/art/terrain/LICENSE.txt.
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageFilter, ImageOps, ImageEnhance

DL = sys.argv[1] if len(sys.argv) > 1 else "/tmp/dl/tex"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../Web/art/terrain")
IDS = ["rocky_terrain_02", "sparse_grass", "aerial_rocks_02", "rock_face_03", "snow_02", "coast_sand_01", "forest_ground_04"]

def fetch():
    os.makedirs(DL, exist_ok=True)
    for id in IDS:
        meta = json.loads(subprocess.run(["curl", "-sS", "https://api.polyhaven.com/files/" + id], capture_output=True, check=True).stdout)
        for key, name in (("Diffuse", "diff"), ("nor_gl", "nor")):
            path = os.path.join(DL, f"{id}_{name}.jpg")
            if key in meta and not os.path.exists(path):
                subprocess.run(["curl", "-sS", "-L", "-o", path, meta[key]["1k"]["jpg"]["url"]], check=True)

def load(n): return Image.open(os.path.join(DL, n)).convert("RGB")
def save(im, name, size=1024, q=86): im.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name), quality=q, optimize=True, progressive=True)

def main():
    fetch(); os.makedirs(OUT, exist_ok=True)
    save(load("rocky_terrain_02_diff.jpg"), "grass.jpg")
    save(load("rocky_terrain_02_nor.jpg"), "grass_nor.jpg", q=90)
    save(load("sparse_grass_diff.jpg"), "grass2.jpg")
    save(load("aerial_rocks_02_diff.jpg"), "rock_moss.jpg")
    save(load("aerial_rocks_02_nor.jpg"), "rock_moss_nor.jpg", q=90)
    # the cliff face, taken a little toward grey: Konto's mountains are volcanic
    r = load("rock_face_03_diff.jpg"); r = Image.blend(r, ImageOps.grayscale(r).convert("RGB"), 0.55); save(ImageEnhance.Contrast(r).enhance(1.1), "rock.jpg")
    save(load("rock_face_03_nor.jpg"), "rock_nor.jpg", q=90)
    # fresh snow: the dark tracks in the photograph filled from a blur of the snow round them
    s = np.asarray(load("snow_02_diff.jpg")).astype(np.float32)
    L = s.mean(axis=2, keepdims=True); dark = np.clip((np.median(L) - L) / 40.0, 0, 1)
    blur = np.asarray(Image.fromarray(s.astype(np.uint8)).filter(ImageFilter.GaussianBlur(14))).astype(np.float32)
    save(Image.fromarray(np.clip((s * (1 - dark) + blur * dark) * 1.04 + 6, 0, 255).astype(np.uint8)), "snow.jpg")
    save(load("coast_sand_01_diff.jpg"), "sand.jpg")
    save(load("forest_ground_04_diff.jpg"), "scree.jpg")

if __name__ == "__main__":
    main()
