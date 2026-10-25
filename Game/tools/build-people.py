#!/usr/bin/env python3
"""Builds the street people in Web/people from Microsoft's Rocketbox avatar library (MIT licence).

Konto is in Japan, and Rocketbox has only a handful of East Asian faces, so most people here are built from two avatars: the clothes and
body of one (a suit, an office skirt, jeans) and the head, face and hair of one of the East Asian avatars. The head is moved so its neck
meets the body's neck, its skin weights are re-pointed at the body's bones by name, and the body's visible skin (hands, arms, neck) is
tinted to the face's skin tone. A recipe with no head keeps its own.

Each person's FBX is converted with FBX2glTF, its textures are cut down to a size a browser can carry (2048 face, 2048 body, 1024
normal maps, 512 hair and eyelash cut-outs) and packed into the same .glb, and the materials are set up for three.js. The game
retargets Seiko's walk, run and idle onto their skeleton when it loads them.

    python build-people.py <Microsoft-Rocketbox checkout> <FBX2glTF binary> [out dir]

Needs Pillow and numpy. Get the library with a sparse clone (it is large):
    git clone --filter=blob:none --no-checkout https://github.com/microsoft/Microsoft-Rocketbox
and check out the Export/*.fbx and Textures/*_color.tga, *_normal.tga of the avatars named below.
"""
import io, json, os, struct, subprocess, sys, tempfile
import numpy as np
from PIL import Image

BM, BF, MA, FA, SP = "Professions/Business_Male_", "Professions/Business_Female_", "Adults/Male_Adult_", "Adults/Female_Adult_", "Professions/Sports_"
# (file name, body avatar, head avatar or None, business?, female?)
# Seiko himself: the white shirt and dark trousers of one office worker, with the face and short black hair he has always had
PLAYER = ("seiko_player", BM + "06", BM + "02", True, False)
# his wardrobe at home: the same head on other clothes (id, name, body)
OUTFITS = [("village", "Village work clothes", "Professions/Gardener_Male_01"), ("village_denim", "Village shirt and jeans", "Professions/Wood_Male_01"), ("office", "Office shirt", BM + "06"), ("suit_black", "Black suit, red tie", BM + "01"), ("suit_charcoal", "Charcoal suit", BM + "03"),
           ("waistcoat", "Waistcoat", BM + "04"), ("suit_check", "Check suit", BM + "05"), ("polo", "Polo and shorts", MA + "01"),
           ("blue_shirt", "Blue shirt and jeans", MA + "08"), ("tshirt", "T-shirt and jeans", MA + "09"), ("track", "Track jacket", MA + "10")]
RECIPES = [
    ("salaryman_01", BM + "02", None, True, False),
    ("salaryman_02", BM + "01", MA + "09", True, False),
    ("salaryman_03", BM + "03", MA + "10", True, False),
    ("salaryman_04", BM + "04", BM + "02", True, False),
    ("salaryman_05", BM + "05", MA + "09", True, False),
    ("salaryman_06", BM + "06", MA + "10", True, False),
    ("salaryman_07", BM + "07", MA + "09", True, False),
    ("salaryman_08", BM + "03", BM + "02", True, False),
    ("salaryman_09", BM + "05", MA + "10", True, False),
    ("salaryman_10", BM + "06", MA + "09", True, False),
    ("man_01", MA + "09", None, False, False),
    ("man_02", MA + "10", None, False, False),
    ("man_03", MA + "05", MA + "09", False, False),
    ("man_04", MA + "08", MA + "10", False, False),
    ("man_05", MA + "01", BM + "02", False, False),
    ("officelady_01", BF + "03", None, True, True),
    ("officelady_02", BF + "01", FA + "11", True, True),
    ("officelady_03", BF + "02", FA + "03", True, True),
    ("officelady_04", BF + "04", SP + "Female_02", True, True),
    ("officelady_05", BF + "01", FA + "03", True, True),
    ("woman_01", FA + "03", None, False, True),
    ("woman_02", FA + "11", None, False, True),
    ("woman_03", SP + "Female_02", None, False, True),
    ("woman_04", FA + "01", BF + "03", False, True),
    ("woman_05", FA + "05", FA + "11", False, True),
    ("woman_06", FA + "08", SP + "Female_02", False, True),
]

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path):
    b = open(path, "rb").read()
    jl = struct.unpack_from("<I", b, 12)[0]
    j = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack_from("<I", b, off)[0]
    return j, bytearray(b[off + 8:off + 8 + bl])


def write_glb(path, j, binb):
    while len(binb) % 4: binb.append(0)
    j["buffers"] = [{"byteLength": len(binb)}]
    js = json.dumps(j, separators=(",", ":")).encode()
    while len(js) % 4: js += b" "
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binb)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack("<II", len(binb), 0x004E4942)); f.write(binb)


def acc_read(j, binb, i):
    a = j["accessors"][i]; bv = j["bufferViews"][a["bufferView"]]
    dt = np.dtype(CT[a["componentType"]]); n = NC[a["type"]]
    start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride", 0)
    if stride and stride != dt.itemsize * n:
        raw = np.frombuffer(bytes(binb), dtype=np.uint8, count=stride * a["count"], offset=start).reshape(a["count"], stride)
        return raw[:, :dt.itemsize * n].copy().view(dt).reshape(a["count"], n)
    return np.frombuffer(bytes(binb), dtype=dt, count=a["count"] * n, offset=start).reshape(a["count"], n).copy()


def acc_add(j, binb, arr, ctype, atype, target=None):
    while len(binb) % 4: binb.append(0)
    data = np.ascontiguousarray(arr.astype(CT[ctype])).tobytes()
    bv = {"buffer": 0, "byteOffset": len(binb), "byteLength": len(data)}
    if target: bv["target"] = target
    j["bufferViews"].append(bv); binb.extend(data)
    a = {"bufferView": len(j["bufferViews"]) - 1, "componentType": ctype, "count": int(arr.shape[0]), "type": atype}
    if atype == "VEC3" and ctype == 5126:
        a["min"] = [float(v) for v in arr.min(0)]; a["max"] = [float(v) for v in arr.max(0)]
    j["accessors"].append(a)
    return len(j["accessors"]) - 1


def joint_pos(j, binb, name):
    sk = j["skins"][0]; names = [j["nodes"][i]["name"] for i in sk["joints"]]
    ibm = acc_read(j, binb, sk["inverseBindMatrices"])[names.index(name)].reshape(4, 4).T   # column-major
    return np.linalg.inv(ibm)[:3, 3]


def convert(conv, root, rel):
    name = os.path.basename(rel)
    with tempfile.TemporaryDirectory() as td:
        subprocess.run([conv, "--binary", "--input", os.path.join(root, "Assets/Avatars", rel, "Export", name + ".fbx"), "--output", os.path.join(td, "a")], check=True, capture_output=True)
        return read_glb(os.path.join(td, "a.glb"))


def part_of(mat_name):
    n = mat_name.lower()
    return "opacity" if "opacity" in n else "head" if "head" in n else "body"


def graft(A, B):
    """A's body with B's head and hair."""
    ja, ba = A; jb, bb = B
    na = [ja["nodes"][i]["name"] for i in ja["skins"][0]["joints"]]
    nb = [jb["nodes"][i]["name"] for i in jb["skins"][0]["joints"]]
    remap = np.array([na.index(n) if n in na else na.index("Bip01 Head") for n in nb], dtype=np.int64)
    shift = joint_pos(ja, ba, "Bip01 Neck") - joint_pos(jb, bb, "Bip01 Neck")
    mesh = ja["meshes"][0]
    mesh["primitives"] = [p for p in mesh["primitives"] if part_of(ja["materials"][p["material"]]["name"]) == "body"]
    for p in jb["meshes"][0]["primitives"]:
        mname = jb["materials"][p["material"]]["name"]
        if part_of(mname) == "body": continue
        at = {}
        for k, i in p["attributes"].items():
            arr = acc_read(jb, bb, i)
            if k == "POSITION": at[k] = acc_add(ja, ba, arr + shift, 5126, "VEC3", 34962)
            elif k == "JOINTS_0": at[k] = acc_add(ja, ba, remap[arr.astype(np.int64)], 5123, "VEC4", 34962)
            else: at[k] = acc_add(ja, ba, arr.astype(np.float32), 5126, jb["accessors"][i]["type"], 34962)
        idx = acc_read(jb, bb, p["indices"]).reshape(-1)
        ii = acc_add(ja, ba, idx, 5125 if idx.max() > 65535 else 5123, "SCALAR", 34963)
        ja["materials"].append({"name": "graft_" + mname})
        mesh["primitives"].append({"attributes": at, "indices": ii, "material": len(ja["materials"]) - 1, "mode": 4})
    return ja, ba


def skin_median(img):
    a = np.asarray(img.convert("RGB").resize((256, 256))).reshape(-1, 3).astype(np.float32)
    r, g, b = a[:, 0], a[:, 1], a[:, 2]
    m = (r > 60) & (r > g * 1.05) & (g > b * 1.0) & (r - b > 18) & (r < 250)
    return np.median(a[m], axis=0) if m.sum() > 50 else None


def tint_skin(body, src_face, dst_face):
    """Bring the skin showing on the body (hands, arms, neck) to the new face's tone."""
    s, d = skin_median(src_face), skin_median(dst_face)
    if s is None or d is None: return body
    a = np.asarray(body.convert("RGB")).astype(np.float32)
    dist = np.linalg.norm(a - s, axis=2)
    w = np.clip(1.0 - (dist - 22) / 28.0, 0, 1)[..., None]
    out = a * (1 - w) + np.clip(a * (d / np.maximum(s, 1)), 0, 255) * w
    return Image.fromarray(out.astype(np.uint8))


def tex(path):
    return Image.open(path)


def enc(im, size, fmt, q=84):
    im = im.convert("RGBA" if fmt == "PNG" else "RGB")
    if im.size[0] != size: im = im.resize((size, size), Image.LANCZOS)
    out = io.BytesIO()
    if fmt == "PNG": im.save(out, "PNG", optimize=True)
    else: im.save(out, "JPEG", quality=q, optimize=True)
    return out.getvalue()


def find(texdir, kind):
    for f in sorted(os.listdir(texdir)):
        if f.endswith(kind + ".tga"): return os.path.join(texdir, f)
    return None


def build(root, conv, outdir, recipe):
    fname, body_rel, head_rel, business, female = recipe
    A = convert(conv, root, body_rel)
    j, binb = graft(A, convert(conv, root, head_rel)) if head_rel else A
    tdir = lambda rel: os.path.join(root, "Assets/Avatars", rel, "Textures")
    bdir, hdir = tdir(body_rel), tdir(head_rel or body_rel)
    j["images"], j["textures"], j["samplers"] = [], [], [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
    def add(data, mime):
        while len(binb) % 4: binb.append(0)
        j["bufferViews"].append({"buffer": 0, "byteOffset": len(binb), "byteLength": len(data)})
        binb.extend(data)
        j["images"].append({"bufferView": len(j["bufferViews"]) - 1, "mimeType": mime})
        j["textures"].append({"sampler": 0, "source": len(j["images"]) - 1})
        return len(j["textures"]) - 1
    used = {p["material"] for p in j["meshes"][0]["primitives"]}
    for mi, m in enumerate(j["materials"]):
        if mi not in used: continue
        part = part_of(m["name"]); d = hdir if part != "body" else bdir
        for k in ("extras", "normalTexture", "pbrMetallicRoughness", "alphaMode", "alphaCutoff", "doubleSided"): m.pop(k, None)
        pbr = {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0.0, "roughnessFactor": 0.78}
        if part == "opacity":
            p = find(d, "_opacity_color")
            if p: pbr["baseColorTexture"] = {"index": add(enc(tex(p), 512, "PNG"), "image/png")}
            m["alphaMode"] = "MASK"; m["alphaCutoff"] = 0.42; m["doubleSided"] = True
        else:
            p = find(d, "_" + part + "_color")
            if p:
                im = tex(p)
                if part == "body" and head_rel:
                    hb, ha = find(hdir, "_head_color"), find(bdir, "_head_color")
                    if hb and ha: im = tint_skin(im, tex(ha), tex(hb))
                pbr["baseColorTexture"] = {"index": add(enc(im, 2048, "JPEG", 82 if part == "body" else 86), "image/jpeg")}
            q = find(d, "_" + part + "_normal")
            if q: m["normalTexture"] = {"index": add(enc(tex(q), 1024, "JPEG", 86), "image/jpeg")}
            if part == "head": pbr["roughnessFactor"] = 0.6
        m["pbrMetallicRoughness"] = pbr
    j.pop("animations", None)
    out = os.path.join(outdir, fname + ".glb")
    write_glb(out, j, binb)
    tris = sum(j["accessors"][p["indices"]]["count"] // 3 for p in j["meshes"][0]["primitives"])
    return {"file": fname + ".glb", "name": fname, "female": female, "business": business, "japanese": True, "body": os.path.basename(body_rel), "head": os.path.basename(head_rel or body_rel), "tris": tris, "bytes": os.path.getsize(out)}


def main():
    root, conv = sys.argv[1], sys.argv[2]
    outdir = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../Web/people")
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):
        if f.endswith(".glb"): os.remove(os.path.join(outdir, f))
    index = []
    for r in RECIPES:
        try:
            e = build(root, conv, outdir, r); index.append(e); print("built", e["name"], e["body"], "+", e["head"], e["tris"], "tris", e["bytes"] // 1024, "KB")
        except Exception as ex:
            print("skipped", r[0], repr(ex))
    player = build(root, conv, outdir, PLAYER); print("built player", player["bytes"] // 1024, "KB")
    outfits = []
    for oid, oname, body in OUTFITS:
        if oid == "office": outfits.append({"id": oid, "name": oname, "file": player["file"]}); continue
        e = build(root, conv, outdir, ("seiko_" + oid, body, PLAYER[2], True, False)); outfits.append({"id": oid, "name": oname, "file": e["file"]}); print("built outfit", oid, e["bytes"] // 1024, "KB")
    json.dump({"people": index, "player": player["file"], "outfits": outfits}, open(os.path.join(outdir, "index.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
