"""Find a car's head- and tail-lamp materials and name them so the game can light them at night.

    python3 Tools/cars/split_lights.py [--dry] Web/cars/<id>.glb ...

The cars come from many sources, so the lamps are found by where they sit, not by name. A lamp is a
small material that lives almost entirely in the last tenth of the car's length, between the bumper
and the bonnet line. Red ones at one end are the tail lamps; clear, white or glassy materials at the
other end are the headlamps. They are renamed headlight_<old> / taillight_<old>. A material shared
with the windows or the body never qualifies, because most of its area is elsewhere.

Where no whole material qualifies (one material covers the lamps and more), the triangles of a red
or clear material that sit in the end zone and face outwards are split off into a primitive of their
own with a copy of that material, named the same way.

Only the glTF JSON and index data change; vertices, textures and every extension are left as they are.
"""
import json, struct, sys, re, os, copy
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def load(path):
    b = open(path, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + n])
    off = 20 + n
    bn = struct.unpack("<I", b[off:off + 4])[0]
    return j, bytearray(b[off + 8:off + 8 + bn])


def save(path, j, binb):
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    while len(binb) % 4: binb.append(0)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binb))
    out += struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(binb), b"BIN\0") + bytes(binb)
    open(path, "wb").write(out)


def acc(j, binb, i):
    a = j["accessors"][i]; bv = j["bufferViews"][a["bufferView"]]
    dt = np.dtype(CT[a["componentType"]]); nc = NC[a["type"]]
    start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride", 0) or dt.itemsize * nc
    raw = np.frombuffer(binb, dtype=np.uint8, count=stride * (a["count"] - 1) + dt.itemsize * nc, offset=start)
    rows = np.lib.stride_tricks.as_strided(raw, shape=(a["count"], dt.itemsize * nc), strides=(stride, 1))
    return np.ascontiguousarray(rows).view(dt).reshape(a["count"], nc).astype(np.float64 if dt == np.float32 else np.int64)


def node_mat(n):
    if "matrix" in n: return np.array(n["matrix"]).reshape(4, 4).T
    t = n.get("translation", [0, 0, 0]); r = n.get("rotation", [0, 0, 0, 1]); s = n.get("scale", [1, 1, 1])
    x, y, z, w = r
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4); M[:3, :3] = R * np.array(s); M[:3, 3] = t
    return M


def tris(j, binb):
    """Every triangle in world space: (mesh, prim, material, centroid, area, normal)."""
    out = []
    def walk(ni, P):
        n = j["nodes"][ni]; M = P @ node_mat(n)
        if "mesh" in n:
            for pi, pr in enumerate(j["meshes"][n["mesh"]]["primitives"]):
                if pr.get("mode", 4) != 4 or "material" not in pr: continue
                v = acc(j, binb, pr["attributes"]["POSITION"])
                v = (M @ np.c_[v, np.ones(len(v))].T).T[:, :3]
                ix = acc(j, binb, pr["indices"]).ravel() if "indices" in pr else np.arange(len(v))
                t = v[ix.reshape(-1, 3)]
                cr = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
                ar = np.linalg.norm(cr, axis=1) / 2
                nm = cr / np.maximum(ar[:, None] * 2, 1e-12)
                out.append((n["mesh"], pi, pr["material"], t.mean(1), ar, nm))
        for c in n.get("children", []): walk(c, M)
    for r in j["scenes"][j.get("scene", 0)]["nodes"]: walk(r, np.eye(4))
    return out


TEXMEAN = {}


def texmean(j, binb, ti):
    """Mean linear colour of a texture (lamps are often a red texture on a white factor)."""
    if ti in TEXMEAN: return TEXMEAN[ti]
    from PIL import Image
    import io
    t = j["textures"][ti]
    src = t.get("source", (t.get("extensions", {}).get("EXT_texture_webp") or {}).get("source"))
    im = j["images"][src]; bv = j["bufferViews"][im["bufferView"]]
    o = bv.get("byteOffset", 0)
    a = np.asarray(Image.open(io.BytesIO(bytes(binb[o:o + bv["byteLength"]]))).convert("RGB").resize((64, 64)), dtype=np.float64) / 255
    TEXMEAN[ti] = list((a ** 2.2).reshape(-1, 3).mean(0))
    return TEXMEAN[ti]


def colour(m, j=None, binb=None):
    pb = m.get("pbrMetallicRoughness", {})
    c = list(pb.get("baseColorFactor", [1, 1, 1, 1]))
    clear = m.get("alphaMode") == "BLEND" or c[3] < 0.95 or "KHR_materials_transmission" in m.get("extensions", {})
    tex = "baseColorTexture" in pb
    if tex and j is not None:
        try:
            tm = texmean(j, binb, pb["baseColorTexture"]["index"]); c = [c[k] * tm[k] for k in range(3)] + [c[3]]; tex = False
        except Exception as e:
            print("  (texture unread: %s)" % e)
    return c, clear, tex


def run(path, dry):
    TEXMEAN.clear()
    j, binb = load(path)
    T = tris(j, binb)
    allc = np.concatenate([t[3] for t in T]); alla = np.concatenate([t[4] for t in T])
    lo, hi = allc.min(0), allc.max(0); size = hi - lo
    up = 1                                              # glTF is y-up
    ax = 0 if size[0] > size[2] else 2                  # the long horizontal axis
    L, H, total = size[ax], size[up], alla.sum()
    per = {}
    for mesh, pi, mi, c, a, nm in T:
        f = (c[:, ax] - lo[ax]) / L; hz = (c[:, up] - lo[up]) / H
        band = (hz > 0.2) & (hz < 0.8)
        s = per.setdefault(mi, np.zeros(3))
        s += [a.sum(), a[(f > 0.9) & band].sum(), a[(f < 0.1) & band].sum()]
    cand = {}
    for mi, (a, af, ab) in per.items():
        m = j["materials"][mi]; name = m.get("name", "")
        if a <= 0 or a > total * 0.04 or re.match(r"paint|head|tail", name, re.I): continue
        end = 1 if af / a > 0.7 else -1 if ab / a > 0.7 else 0
        if not end: continue
        (r, g, b, _), clear, tex = colour(m, j, binb)
        red = (not tex and r > 0.15 and r > 1.4 * g and r > 1.3 * b) or bool(re.search(r"tail|brake|stop|rear", name, re.I))
        lens = clear or (not tex and min(r, g, b) > 0.55) or bool(re.search(r"head|hl|lens|lamp|light|blinker|glass|chrome|reflector", name, re.I))
        cand[mi] = (end, red, lens, a)
    ends = {}
    for mi, (e, red, lens, a) in cand.items():
        if red: ends[e] = ends.get(e, 0) + a
    tail, head, splits = [], [], []
    # glTF cars here face +Z, so with no red to go by the tail lamps are at the -Z end
    if ends or cand:
        te = max(ends, key=ends.get) if ends else -1
        tail = [mi for mi, (e, red, lens, a) in cand.items() if e == te and red]
        head = [mi for mi, (e, red, lens, a) in cand.items() if e == -te and lens and not red]
    else:
        # face-level: red triangles facing out of an end, then clear ones at the other end
        te = None
        for want in ("red", "lens"):
            for mesh, pi, mi, c, a, nm in T:
                m = j["materials"][mi]; (r, g, b, _), clear, tex = colour(m, j, binb)
                isred = not tex and r > 0.25 and r > 2 * g and r > 2 * b
                islens = clear and not isred
                if (want == "red" and not isred) or (want == "lens" and not islens): continue
                f = (c[:, ax] - lo[ax]) / L; hz = (c[:, up] - lo[up]) / H
                band = (hz > 0.2) & (hz < 0.8)
                for e in ((te,) if te else (1, -1)) if want == "red" else ((-te,) if te else ()):
                    sel = band & ((f > 0.93) if e > 0 else (f < 0.07)) & (nm[:, ax] * e > 0.5)
                    if sel.sum() >= 4 and a[sel].sum() < total * 0.02:
                        splits.append((mesh, pi, mi, sel, "taillight_" if want == "red" else "headlight_"))
                        if want == "red": te = e; break
    nm_ = lambda mi: j["materials"][mi].get("name", "m%d" % mi)
    print("CAR %-12s tail-end %s tail %s head %s split %s" % (os.path.basename(path), locals().get("te"), [nm_(i) for i in tail], [nm_(i) for i in head],
          [(nm_(s[2]), int(s[3].sum()), s[4]) for s in splits]))
    if dry or not (tail or head or splits): return
    for mi in tail: j["materials"][mi]["name"] = "taillight_" + nm_(mi)
    for mi in head: j["materials"][mi]["name"] = "headlight_" + nm_(mi)
    for mesh, pi, mi, sel, pre in splits:
        pr = j["meshes"][mesh]["primitives"][pi]
        ix = acc(j, binb, pr["indices"]).ravel().reshape(-1, 3) if "indices" in pr else np.arange(acc(j, binb, pr["attributes"]["POSITION"]).shape[0]).reshape(-1, 3)
        keep, lamp = ix[~sel].ravel().astype(np.uint32), ix[sel].ravel().astype(np.uint32)
        def put(arr):
            while len(binb) % 4: binb.append(0)
            o = len(binb); binb.extend(arr.tobytes())
            j["bufferViews"].append({"buffer": 0, "byteOffset": o, "byteLength": arr.nbytes, "target": 34963})
            j["accessors"].append({"bufferView": len(j["bufferViews"]) - 1, "componentType": 5125, "count": int(arr.size), "type": "SCALAR"})
            return len(j["accessors"]) - 1
        mat = copy.deepcopy(j["materials"][mi]); mat["name"] = pre + nm_(mi); j["materials"].append(mat)
        newp = copy.deepcopy(pr); newp["indices"] = put(lamp); newp["material"] = len(j["materials"]) - 1
        pr["indices"] = put(keep)
        j["meshes"][mesh]["primitives"].append(newp)
    j["buffers"][0]["byteLength"] = len(binb)
    save(path, j, binb)


if __name__ == "__main__":
    a = sys.argv[1:]
    for f in [x for x in a if x.endswith(".glb")]: run(f, "--dry" in a)
