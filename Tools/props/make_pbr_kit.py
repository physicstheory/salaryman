"""Tileable PBR detail sets for generated geometry (Web/art/pbr/<kind>_{col,nor,rough}.jpg).

    python3 Tools/props/make_pbr_kit.py

konto.html's pbrMat(kind, colour) projects these triplanar in world space, so a box, a cylinder or any
built mesh gets real surface detail (albedo variation, a tangent-space normal map, a roughness map)
without UVs. The colour map is near neutral: the material's own colour is multiplied in, with the map
normalised about its mean so the colour stays what the code asked for.
"""
import os, sys
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "Tools", "foundry", "lib"))
sys.path.insert(0, os.path.join(ROOT, "Tools", "props"))
import texgen as T
from paint_props import weather, planks, galv, bark

OUT = os.path.join(ROOT, "Web", "art", "pbr")
N = 1024
KINDS = {
    "concrete": lambda: weather(*T.r_concrete(N, 101, "#9a9a9a", 0.88)[:3], N, 101, dust=0.35),
    "stone": lambda: weather(*T.r_terrazzo(N, 102, "#a0a0a0", 0.7)[:3], N, 102, dust=0.4),
    "metal": lambda: weather(*T.r_brushed(N, 103, "#b0b0b0", 0.32)[:3], N, 103, dust=0.15, scratch=0.4),
    "galv": lambda: galv(N, 104, "#a0a0a0"),
    "paint": lambda: weather(*T.r_paint(N, 105, "#b8b8b8", 0.45, peel=0.5, wear=0.4)[:3], N, 105, dust=0.2, scratch=0.4),
    "plastic": lambda: weather(*T.r_plastic(N, 106, "#b8b8b8", 0.45)[:3], N, 106, dust=0.25, scratch=0.3),
    "wood": lambda: planks(N, 107, "#a08060", 4, 0.7, worn=0.3),
    "rubber": lambda: weather(*T.r_rubber(N, 108, "#3a3a3a", 0.9)[:3], N, 108, dust=0.5),
    "fabric": lambda: weather(*T.r_fabric(N, 109, "#a0a0a0", 0.9)[:3], N, 109, dust=0.1),
    "leather": lambda: weather(*T.r_leather(N, 110, "#909090", 0.5)[:3], N, 110, dust=0.1, scratch=0.3),
    "bark": lambda: bark(N, 111, "#8a7a6a"),
    "skin": lambda: T.r_skin_pores(N, 112, "#b0a090", 0.5)[:3],
    "tile": lambda: weather(*T.r_tiles(N, 113, "#c0c0c0", "#808080", 0.3, 4)[:3], N, 113, dust=0.2),
    "asphalt": lambda: weather(*T.r_concrete(N, 114, "#606060", 0.92)[:3], N, 114, dust=0.3),
}


def main():
    from PIL import Image
    import make_prop_maps as MP
    os.makedirs(OUT, exist_ok=True)
    for k, f in KINDS.items():
        c, h, r = f()
        c = np.asarray(c, float); h = np.asarray(h, float); r = np.asarray(r, float)
        alb = np.clip(c, 0, 1) ** (1 / 2.2)
        Image.fromarray((alb * 255).astype(np.uint8)).save(os.path.join(OUT, k + "_col.jpg"), quality=90)
        h = (h - h.min()) / max(1e-6, np.ptp(h))
        nor = MP.normal_from_height(h, N / 64.0, True)
        Image.fromarray((nor * 255).astype(np.uint8)).save(os.path.join(OUT, k + "_nor.jpg"), quality=92)
        Image.fromarray((np.clip(r, 0.04, 1) * 255).astype(np.uint8)).convert("RGB").save(os.path.join(OUT, k + "_rough.jpg"), quality=90)
        print("pbr", k)


if __name__ == "__main__":
    main()
