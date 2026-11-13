"""Dress a hand-laid level's pavements with street furniture, so no street reads empty.

    python3 Tools/levels/dress_streets.py <level> [--per-cell 32] [--seed 7]
    node Engine/tools/bake-level.mjs <level>

Two passes over Web/levels/<level>/src/<level>.json, both on the pavement (block rects, outside
every building footprint):
  kerb   along each block's road edges, 0.8 m in: bollards, bins, planters, signposts, poles, bikes
  wall   against the street faces of buildings: aircon units, vending machines, bins, crates, bikes,
         planters, pallets
Props this script placed carry "dressed": true and are replaced on every run, so it is safe to re-run.
Every street cell (64 m) is filled to --per-cell, the rest of the level gets the natural density.
"""
import json, math, random, sys, os

lv = sys.argv[1]
per_cell = int(sys.argv[sys.argv.index("--per-cell") + 1]) if "--per-cell" in sys.argv else 32
seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 7
src = "Web/levels/%s/src/%s.json" % (lv, lv)
lvl = json.load(open("Web/levels/%s/src/level.json" % lv))
CS = lvl.get("cellSize", 64)
d = json.load(open(src))
rnd = random.Random(seed)
d["props"] = [p for p in d["props"] if not p.get("dressed")]

def foot(b, pad):
    (cx, cz), (sx, sz) = b["c"], b["size"]
    return (cx - sx / 2 - pad, cz - sz / 2 - pad, cx + sx / 2 + pad, cz + sz / 2 + pad)
FEET = [foot(b, 0) for b in d["buildings"]]
def in_building(x, z, pad=0.35):
    return any(a - pad < x < c + pad and b - pad < z < e + pad for a, b, c, e in FEET)
def block_of(x, z):
    for bl in d["blocks"]:
        x0, z0, x1, z1 = bl["rect"]
        if x0 + 0.3 < x < x1 - 0.3 and z0 + 0.3 < z < z1 - 0.3 and bl.get("y", 0) == 0:
            return bl
    return None
taken = [(p["pos"][0], p["pos"][2]) for p in d["props"]]
def free(x, z, r=1.4):
    return all((x - a) ** 2 + (z - b) ** 2 > r * r for a, b in taken)
cellcount = {}
def cell(x, z): return "%d_%d" % (int(x // CS), int(z // CS))
for p in d["props"]: cellcount[cell(p["pos"][0], p["pos"][2])] = cellcount.get(cell(p["pos"][0], p["pos"][2]), 0) + 1
added = []
def put(t, x, z, yaw):
    bl = block_of(x, z)
    if not bl or in_building(x, z) or not free(x, z): return False
    y = bl.get("y", 0) + bl.get("kerb", 0.15)
    p = {"type": t, "pos": [round(x, 2), y, round(z, 2)], "yaw": int(yaw) % 360, "dressed": True}
    added.append(p); taken.append((x, z)); c = cell(x, z); cellcount[c] = cellcount.get(c, 0) + 1
    return True

KERB = ["bollard"] * 3 + ["bin"] * 2 + ["planter"] * 2 + ["signpost"] * 2 + ["pole", "bicycle", "bicycle", "cone"]
WALL = ["ac"] * 4 + ["vending"] * 2 + ["bin"] * 2 + ["crate", "bicycle", "bicycle", "planter", "pallet"]

# candidate spots: kerb lines and building street faces, shuffled, then taken while a cell is short
spots = []
for bl in d["blocks"]:
    if bl.get("y", 0) != 0: continue
    x0, z0, x1, z1 = bl["rect"]
    for (ax, az, bx, bz, yaw) in ((x0, z0 + 0.8, x1, z0 + 0.8, 0), (x0, z1 - 0.8, x1, z1 - 0.8, 180),
                                  (x0 + 0.8, z0, x0 + 0.8, z1, 90), (x1 - 0.8, z0, x1 - 0.8, z1, 270)):
        L = math.hypot(bx - ax, bz - az); n = int(L / 3.2)
        for i in range(1, n):
            t = i / n
            spots.append(("kerb", ax + (bx - ax) * t + rnd.uniform(-0.4, 0.4), az + (bz - az) * t + rnd.uniform(-0.4, 0.4), yaw))
for (a, b, c, e) in FEET:
    for (ax, az, bx, bz, yaw) in ((a, b - 0.55, c, b - 0.55, 180), (a, e + 0.55, c, e + 0.55, 0),
                                  (a - 0.55, b, a - 0.55, e, 270), (c + 0.55, b, c + 0.55, e, 90)):
        L = math.hypot(bx - ax, bz - az); n = max(1, int(L / 2.6))
        for i in range(n):
            t = (i + 0.5) / n
            spots.append(("wall", ax + (bx - ax) * t, az + (bz - az) * t, yaw))
rnd.shuffle(spots)
# first a natural sprinkling everywhere, then top up the short cells
for want, share in ((None, 0.22), (per_cell, 1.0)):
    for kind, x, z, yaw in spots:
        c = cell(x, z)
        if want is not None and cellcount.get(c, 0) >= want: continue
        if want is None and rnd.random() > share: continue
        t = rnd.choice(KERB if kind == "kerb" else WALL)
        # wall props sit with their back to the wall: yaw faces out of it
        put(t, x, z, yaw + (rnd.choice([0, 0, 90, -90]) if t in ("bicycle", "crate", "pallet") else 0))
d["props"] += added
json.dump(d, open(src, "w"), indent=1, ensure_ascii=False)
from collections import Counter
print("added", len(added), dict(Counter(p["type"] for p in added)))
print("cells", dict(sorted(cellcount.items())))
