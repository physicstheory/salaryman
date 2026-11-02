#!/usr/bin/env python3
"""Derives a roughness map for each photographed facade (Web/art/facades/<set>_color.jpg -> <set>_rough.jpg).

Glass in the photo (dark or blue-grey panes) is smooth and takes the sky; brick, stone, render and painted
frames are rough and take little of it. Without the map one roughness covered the whole wall, so either the
walls shone like the glass or the glass was as dull as the walls.

    python3 Tools/facades/make_facade_rough.py office flats civic
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "Web", "art", "facades")
for name in sys.argv[1:] or ["office", "flats", "civic"]:
    im = Image.open(os.path.join(DIR, name + "_color.jpg")).convert("RGB")
    a = np.asarray(im).astype(np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    l = r * 0.299 + g * 0.587 + b * 0.114
    glass = (l < 0.5) & (b >= r - 0.01)
    # a curtained or lit pane is bright, but it is still glass: it is the hole inside a dark window frame
    from scipy import ndimage
    glass = ndimage.binary_fill_holes(glass)
    glass = np.asarray(Image.fromarray((glass * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))).astype(np.float32) / 255
    detail = np.abs(l - np.asarray(im.convert("L").filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255)
    wall = np.clip(0.78 + detail * 0.8 - (l - 0.5) * 0.15, 0.55, 0.95)
    rough = glass * (0.08 + detail * 0.3) + (1 - glass) * wall
    Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).convert("RGB").save(os.path.join(DIR, name + "_rough.jpg"), quality=88)
    print("wrote %s_rough.jpg (%.0f%% glass)" % (name, glass.mean() * 100))
