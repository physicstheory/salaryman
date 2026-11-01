#!/usr/bin/env python3
"""Build the game's anime people from VRoid characters.

    python3 Tools/anime/build_anime_people.py <folder with the .vrm files> [Web/people]

Every person on the street, Seiko and his outfits included, is a VRoid character (VRM 0.x, which is glTF with a
humanoid skeleton). The sources are pixiv's CC0 VRoid sample characters (see Web/people/LICENSE-anime.md). This
turns each into a small .glb the game's people loader takes as it is:

  - the skeleton is renamed to the Biped names the loader and the retargeting already use (J_Bip_C_Hips is
    Bip01_Pelvis, and so on), so every one of Seiko's moves plays on them;
  - the VRM extension, the face shapes and the rim, outline and specular maps go (the game draws its own cel shading),
    while the four PBR maps stay (colour, normal, roughness, occlusion), all cut to a size a crowd can afford;
  - a variant is the same character with its clothes and hair recoloured, or with another character's head (that
    is how Seiko gets his suits: his face and hair on the body in the shirt, tie and waistcoat).

Writes the .glb files and people/index.json (the people, Seiko, and his outfits).
"""
import colorsys
import io
import json
import os
import struct
import sys

import numpy as np
from PIL import Image

# roughness by material kind, for a material that has no roughness map (eyes wet and glossy, cloth matte)
ROUGH = {"eye": 0.06, "face": 0.58, "body": 0.58, "hair": 0.42, "tops": 0.86, "bottoms": 0.86, "onepiece": 0.86, "shoes": 0.35, "accessory": 0.5}

BONES = {
    "J_Bip_C_Hips": "Bip01_Pelvis", "J_Bip_C_Spine": "Bip01_Spine", "J_Bip_C_Chest": "Bip01_Spine1",
    "J_Bip_C_UpperChest": "Bip01_Spine2", "J_Bip_C_Neck": "Bip01_Neck", "J_Bip_C_Head": "Bip01_Head",
    "J_Adj_L_FaceEye": "Bip01_LEye", "J_Adj_R_FaceEye": "Bip01_REye",
}
for s, S in (("L", "L"), ("R", "R")):
    BONES.update({
        "J_Bip_%s_Shoulder" % s: "Bip01_%s_Clavicle" % S, "J_Bip_%s_UpperArm" % s: "Bip01_%s_UpperArm" % S,
        "J_Bip_%s_LowerArm" % s: "Bip01_%s_Forearm" % S, "J_Bip_%s_Hand" % s: "Bip01_%s_Hand" % S,
        "J_Bip_%s_UpperLeg" % s: "Bip01_%s_Thigh" % S, "J_Bip_%s_LowerLeg" % s: "Bip01_%s_Calf" % S,
        "J_Bip_%s_Foot" % s: "Bip01_%s_Foot" % S, "J_Bip_%s_ToeBase" % s: "Bip01_%s_Toe0" % S,
    })

# how big each kind of texture is kept, by what its image is called
def tex_size(name):
    n = name.lower()
    if "face" in n and "eye" not in n: return 1024
    if "body" in n or "tops" in n: return 1024
    if "bottoms" in n or "onepiece" in n: return 1024
    if "eye" in n: return 256
    return 512


class Glb:
    def __init__(self, path):
        b = open(path, "rb").read()
        n = struct.unpack("<I", b[12:16])[0]
        self.j = json.loads(b[20:20 + n])
        o = 20 + n
        bn = struct.unpack("<I", b[o:o + 4])[0]
        self.bin = b[o + 8:o + 8 + bn]

    def view(self, i):
        v = self.j["bufferViews"][i]
        s = v.get("byteOffset", 0)
        return self.bin[s:s + v["byteLength"]]

    def image(self, i):
        return Image.open(io.BytesIO(self.view(self.j["images"][i]["bufferView"]))).convert("RGBA")

    def node(self, name):
        for i, n in enumerate(self.j["nodes"]):
            if n.get("name") == name: return i
        return -1


def mat_kind(name):
    n = name.lower()
    for k in ("tops", "bottoms", "shoes", "onepiece", "accessory", "hair", "body", "face", "eye"):
        if k in n: return k
    return "other"


def recolour(im, rule):
    """Recolour a clothes texture, keeping its shading: each band of lightness (dark, mid, light) can be given a
    colour of its own; the hue of a band is replaced and its lightness kept, scaled toward the target's."""
    a = np.asarray(im).astype(np.float32) / 255.0
    rgb, al = a[..., :3], a[..., 3:]
    L = rgb.max(axis=2) * 0.5 + rgb.min(axis=2) * 0.5
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    out = rgb.copy()
    for band, col in rule.items():
        lo, hi = {"dark": (0.0, 0.42), "mid": (0.30, 0.72), "light": (0.62, 1.01), "all": (0.0, 1.01),
                  "vivid": (0.0, 1.01)}[band]
        m = ((L >= lo) & (L < hi)).astype(np.float32)
        if band == "vivid": m = (sat > 0.28).astype(np.float32)
        elif band != "all": m *= (sat < 0.55).astype(np.float32) if band == "light" else 1.0
        # soften the band edges so nothing shows a seam
        if band in ("dark", "mid", "light"):
            edge = 0.06
            m = np.clip(np.minimum((L - lo) / edge + 1, (hi - L) / edge + 1), 0, 1) * m
        c = np.array(col[:3], np.float32) / 255.0
        cl = c.max() * 0.5 + c.min() * 0.5
        ref = {"dark": 0.22, "mid": 0.5, "light": 0.86, "all": 0.5, "vivid": 0.5}[band]
        shade = np.clip(L / max(ref, 0.05), 0, 1.6)[..., None]
        tgt = np.clip(c[None, None, :] * shade if cl < 0.9 else 1 - (1 - c[None, None, :]) * (2 - shade), 0, 1)
        out = out * (1 - m[..., None]) + tgt * m[..., None]
    return Image.fromarray(np.concatenate([out, al], axis=2).clip(0, 1).__mul__(255).astype(np.uint8), "RGBA")


class Out:
    """A new glb assembled from pieces of the sources."""
    def __init__(self):
        self.j = {"asset": {"version": "2.0", "generator": "Salary Man anime people"}, "scene": 0, "scenes": [{"nodes": []}],
                  "nodes": [], "meshes": [], "skins": [], "accessors": [], "bufferViews": [], "materials": [],
                  "textures": [], "images": [], "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
                  "buffers": [{"byteLength": 0}]}
        self.bin = bytearray()
        self.acc_map = {}

    def blob(self, data, target=None):
        while len(self.bin) % 4: self.bin.append(0)
        v = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target: v["target"] = target
        self.bin += data
        self.j["bufferViews"].append(v)
        return len(self.j["bufferViews"]) - 1

    def accessor(self, src, i):
        key = (id(src), i)
        if key in self.acc_map: return self.acc_map[key]
        a = dict(src.j["accessors"][i])
        v = src.j["bufferViews"][a["bufferView"]]
        comp = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}[a["componentType"]]
        num = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
        stride = v.get("byteStride", comp * num)
        raw = src.view(a["bufferView"])
        off = a.get("byteOffset", 0)
        dt = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[a["componentType"]]
        arr = np.ndarray((a["count"], num), dtype=dt, buffer=raw, offset=off, strides=(stride, comp)).copy()
        if a.get("componentType") == 5125 and arr.max() < 65535: arr = arr.astype(np.uint16); a["componentType"] = 5123
        a["bufferView"] = self.blob(arr.tobytes(), v.get("target"))
        a.pop("byteOffset", None)
        if a["type"] == "VEC3" and a["componentType"] == 5126 and "min" in a:
            a["min"] = arr.min(axis=0).tolist(); a["max"] = arr.max(axis=0).tolist()
        a.pop("sparse", None)
        self.j["accessors"].append(a)
        idx = len(self.j["accessors"]) - 1
        self.acc_map[key] = idx
        return idx

    def image(self, im, name):
        opaque = im.getchannel("A").getextrema()[0] > 250
        b = io.BytesIO()
        if opaque: im.convert("RGB").save(b, "JPEG", quality=88, optimize=True); mime = "image/jpeg"
        else: im.save(b, "PNG", optimize=True); mime = "image/png"
        self.j["images"].append({"bufferView": self.blob(b.getvalue()), "mimeType": mime, "name": name})
        self.j["textures"].append({"source": len(self.j["images"]) - 1, "sampler": 0})
        return len(self.j["textures"]) - 1

    def save(self, path):
        while len(self.bin) % 4: self.bin.append(0)
        self.j["buffers"][0]["byteLength"] = len(self.bin)
        js = json.dumps(self.j, separators=(",", ":")).encode()
        while len(js) % 4: js += b" "
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, total))
            f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
            f.write(struct.pack("<II", len(self.bin), 0x004E4942)); f.write(self.bin)
        return total


def build(body_src, head_src, spec):
    """One person: the skeleton and body meshes of body_src, and (if head_src is another character) the face and
    hair of head_src on it. spec holds the recolours: {"tops": {...}, "bottoms": {...}, "hair": [r,g,b], ...}."""
    out = Out()
    J = body_src.j
    # the nodes, all of them (the skeleton has spring-bone chains for hair and skirt; they are harmless at rest)
    for n in J["nodes"]:
        m = {k: (list(v) if isinstance(v, list) else v) for k, v in n.items() if k in ("name", "children", "translation", "rotation", "scale", "matrix")}
        if m.get("name") in BONES: m["name"] = BONES[m["name"]]
        out.j["nodes"].append(m)
    out.j["scenes"][0]["nodes"] = list(J["scenes"][J.get("scene", 0)]["nodes"])
    name_to_node = {n.get("name"): i for i, n in enumerate(out.j["nodes"])}

    mat_cache = {}

    def material(src, mi):
        key = (id(src), mi)
        if key in mat_cache: return mat_cache[key]
        m = src.j["materials"][mi]
        kind = mat_kind(m.get("name", ""))
        pbr = m.get("pbrMetallicRoughness", {})
        col = list(pbr.get("baseColorFactor", [1, 1, 1, 1]))
        nm = {"name": m.get("name", ""), "doubleSided": m.get("doubleSided", False),
              "pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": 0.9}}
        if kind == "hair" and spec.get("hair"):
            col = [spec["hair"][0] / 255, spec["hair"][1] / 255, spec["hair"][2] / 255, col[3]]
        if kind == "eye" and "Iris" in m.get("name", "") and spec.get("eyes"):
            col = [spec["eyes"][0] / 255, spec["eyes"][1] / 255, spec["eyes"][2] / 255, col[3]]
        nm["pbrMetallicRoughness"]["baseColorFactor"] = col
        t = pbr.get("baseColorTexture")
        if t:
            img_i = src.j["textures"][t["index"]]["source"]
            iname = src.j["images"][img_i].get("name", "")
            im = src.image(img_i)
            s = tex_size(iname)
            if max(im.size) > s: im = im.resize((min(s, im.size[0]) if im.size[0] >= im.size[1] else max(1, im.size[0] * s // im.size[1]),
                                                 min(s, im.size[1]) if im.size[1] >= im.size[0] else max(1, im.size[1] * s // im.size[0])), Image.LANCZOS)
            rule = spec.get(kind)
            if isinstance(rule, dict): im = recolour(im, rule)
            nm["pbrMetallicRoughness"]["baseColorTexture"] = {"index": out.image(im, iname)}
        # The other three PBR maps travel with the colour now (the game's character shader samples all four: albedo, normal,
        # roughness, occlusion), cut to the same size. A material without a roughness map gets its kind's roughness.
        nm["pbrMetallicRoughness"]["roughnessFactor"] = ROUGH.get(kind, 0.7)
        def carry(ref, label):
            img_i = src.j["textures"][ref["index"]]["source"]
            im2 = src.image(img_i)
            s2 = tex_size(src.j["images"][img_i].get("name", label))
            if max(im2.size) > s2: im2 = im2.resize((max(1, im2.size[0] * s2 // max(im2.size)), max(1, im2.size[1] * s2 // max(im2.size))), Image.LANCZOS)
            return out.image(im2, label + "_" + str(img_i))
        if m.get("normalTexture"):
            nm["normalTexture"] = {"index": carry(m["normalTexture"], "normal"), "scale": m["normalTexture"].get("scale", 1)}
        if m.get("occlusionTexture"):
            nm["occlusionTexture"] = {"index": carry(m["occlusionTexture"], "occlusion"), "strength": m["occlusionTexture"].get("strength", 1)}
        if pbr.get("metallicRoughnessTexture"):
            nm["pbrMetallicRoughness"]["metallicRoughnessTexture"] = {"index": carry(pbr["metallicRoughnessTexture"], "roughness")}
            nm["pbrMetallicRoughness"]["roughnessFactor"] = pbr.get("roughnessFactor", 1)
        am = m.get("alphaMode", "OPAQUE")
        if am != "OPAQUE":
            nm["alphaMode"] = "MASK"; nm["alphaCutoff"] = 0.5 if kind != "face" else 0.35
        out.j["materials"].append(nm)
        mat_cache[key] = len(out.j["materials"]) - 1
        return mat_cache[key]

    def is_head(mesh_name):
        n = mesh_name.lower()
        return n.startswith("face") or n.startswith("hair")

    parents = {}
    for i, n in enumerate(J["nodes"]):
        for c in n.get("children", []): parents[(id(body_src), c)] = i
    if head_src is not body_src:
        for i, n in enumerate(head_src.j["nodes"]):
            for c in n.get("children", []): parents[(id(head_src), c)] = i

    def adopt_joint(src, ji):
        """The node in the new skeleton for a joint of src: the one of the same name, or, for a bone only the other
        character has (the spring bones in its hair), a copy hung from the nearest bone the two share."""
        nm = src.j["nodes"][ji].get("name")
        nm = BONES.get(nm, nm)
        if nm in name_to_node: return name_to_node[nm]
        pi = parents.get((id(src), ji))
        parent = adopt_joint(src, pi) if pi is not None else name_to_node.get("Bip01_Head")
        n = src.j["nodes"][ji]
        m = {k: (list(v) if isinstance(v, list) else v) for k, v in n.items() if k in ("translation", "rotation", "scale", "matrix")}
        m["name"] = nm
        out.j["nodes"].append(m)
        k = len(out.j["nodes"]) - 1
        out.j["nodes"][parent].setdefault("children", []).append(k)
        name_to_node[nm] = k
        return k

    def add_mesh(src, node_i, skin_i):
        n = src.j["nodes"][node_i]
        me = src.j["meshes"][n["mesh"]]
        prims = []
        for p in me["primitives"]:
            q = {"attributes": {}, "mode": p.get("mode", 4)}
            for k, a in p["attributes"].items():
                if k in ("POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"):
                    q["attributes"][k] = out.accessor(src, a)
            if "indices" in p: q["indices"] = out.accessor(src, p["indices"])
            if "material" in p: q["material"] = material(src, p["material"])
            prims.append(q)
        out.j["meshes"].append({"name": me.get("name", ""), "primitives": prims})
        sk = src.j["skins"][skin_i]
        joints = []
        for ji in sk["joints"]:
            joints.append(adopt_joint(src, ji))
        skin = {"joints": joints, "inverseBindMatrices": out.accessor(src, sk["inverseBindMatrices"])}
        out.j["skins"].append(skin)
        out.j["nodes"].append({"name": me.get("name", ""), "mesh": len(out.j["meshes"]) - 1, "skin": len(out.j["skins"]) - 1})
        out.j["scenes"][0]["nodes"].append(len(out.j["nodes"]) - 1)

    # Another character's face and hair are bound to this skeleton's head and neck by their own inverse bind matrices,
    # so they sit on this head where they sat on theirs: VRoid heads are built alike, and nothing has to be moved.
    for i, n in enumerate(J["nodes"]):
        if "mesh" not in n: continue
        mname = J["meshes"][n["mesh"]].get("name", "")
        if head_src is not body_src and is_head(mname): continue
        add_mesh(body_src, i, n["skin"])
    if head_src is not body_src:
        for i, n in enumerate(head_src.j["nodes"]):
            if "mesh" not in n: continue
            if is_head(head_src.j["meshes"][n["mesh"]].get("name", "")):
                add_mesh(head_src, i, n["skin"])
    return out


# ---- the cast --------------------------------------------------------------------------------------------------------------------------------
NAVY, CHARCOAL, BLACK, GREY, BEIGE, OLIVE, BROWN, WHITE = (32, 38, 58), (52, 54, 60), (22, 22, 26), (120, 124, 130), (196, 178, 150), (88, 92, 58), (96, 70, 48), (238, 238, 236)
HAIR = {"black": (24, 22, 26), "dark": (52, 36, 30), "brown": (96, 62, 40), "chestnut": (122, 74, 44), "grey": (150, 150, 152), "auburn": (110, 44, 34)}

PEOPLE = [
    # the men in the shirt, tie and waistcoat: the salarymen
    ("salaryman_01", "Sakurada_Fumiriya", None, False, True, {"hair": HAIR["black"], "tops": {"dark": CHARCOAL}, "bottoms": {"all": CHARCOAL}}),
    ("salaryman_02", "Sakurada_Fumiriya", None, False, True, {"hair": HAIR["dark"], "tops": {"dark": NAVY, "vivid": (130, 30, 40)}, "bottoms": {"all": NAVY}}),
    ("salaryman_03", "Sakurada_Fumiriya", None, False, True, {"hair": HAIR["grey"], "tops": {"dark": GREY, "vivid": (40, 60, 120)}, "bottoms": {"all": (70, 72, 78)}}),
    ("salaryman_04", "Sakurada_Fumiriya", None, False, True, {"hair": HAIR["black"], "tops": {"dark": CHARCOAL, "vivid": (40, 40, 46)}, "bottoms": {"all": CHARCOAL}}),   # Akio Sotiyama's look
    ("salaryman_05", "Sakurada_Fumiriya", None, False, True, {"hair": HAIR["black"], "tops": {"dark": (60, 50, 44), "vivid": (40, 110, 70)}, "bottoms": {"all": (60, 50, 44)}}),
    ("salaryman_06", "Sakurada_Fumiriya", None, False, True, {"hair": HAIR["chestnut"], "tops": {"dark": (40, 48, 70)}, "bottoms": {"all": GREY}}),
    # off duty: smart-casual jackets on the salarymen's body, so nobody on the street wears Seiko's hoodie body (or his face and hair)
    ("man_01", "Sakurada_Fumiriya", None, False, False, {"hair": HAIR["dark"], "tops": {"dark": (150, 140, 120)}, "bottoms": {"all": (40, 50, 80)}}),
    ("man_02", "Sakurada_Fumiriya", None, False, False, {"hair": HAIR["brown"], "tops": {"dark": OLIVE}, "bottoms": {"all": BEIGE}}),
    ("man_03", "Sakurada_Fumiriya", None, False, False, {"hair": HAIR["chestnut"], "tops": {"dark": (110, 60, 50), "vivid": (220, 210, 190)}, "bottoms": {"all": (36, 40, 58)}}),
    ("man_04", "Sakurada_Fumiriya", None, False, False, {"hair": HAIR["auburn"], "tops": {"dark": (150, 40, 44)}, "bottoms": {"all": BLACK}}),
    # the women: the waistcoat and skirt is the office uniform, recoloured
    ("officelady_01", "Sendagaya_Shibu", None, True, True, {"hair": HAIR["dark"], "tops": {"dark": NAVY}, "bottoms": {"all": NAVY}}),
    ("officelady_02", "Sendagaya_Shino", None, True, True, {"hair": HAIR["black"], "tops": {"dark": CHARCOAL, "vivid": (150, 30, 40)}, "bottoms": {"all": CHARCOAL}}),
    ("officelady_03", "Sendagaya_Shibu", None, True, True, {"hair": HAIR["brown"], "tops": {"dark": (90, 92, 98)}, "bottoms": {"all": (90, 92, 98)}}),
    ("officelady_04", "Sendagaya_Shino", None, True, True, {"hair": HAIR["chestnut"], "tops": {"dark": BLACK}, "bottoms": {"all": BLACK}}),
    ("officelady_05", "Darkness_Shibu", "Sendagaya_Shibu", True, True, {"hair": HAIR["black"], "tops": {"all": (40, 44, 70)}, "bottoms": {"all": (40, 44, 70)}, "onepiece": {"all": (40, 44, 70)}}),
    ("woman_02", "HairSample_Female", "Sendagaya_Shibu", True, False, {"hair": HAIR["brown"]}),
    ("woman_03", "Vivi", None, True, False, {"hair": HAIR["chestnut"]}),
    ("woman_04", "HairSample_Female", "Sendagaya_Shino", True, False, {"hair": HAIR["dark"], "tops": {"light": (200, 214, 230)}, "onepiece": {"light": (200, 214, 230)}}),
    ("woman_05", "Vivi", "Sendagaya_Shibu", True, False, {"hair": HAIR["black"], "tops": {"all": (120, 60, 70)}, "onepiece": {"all": (120, 60, 70)}}),
]

SEIKO = "HairSample_Male"
OUTFITS = [
    # (id, name, body, recolours) - the head is always Seiko's
    ("village", "Village work clothes", "HairSample_Male", {"tops": {"all": (86, 74, 54)}, "bottoms": {"all": (70, 58, 44)}}),
    ("village_denim", "Village shirt and jeans", "HairSample_Male", {"tops": {"all": (150, 170, 196)}, "bottoms": {"all": (44, 60, 100)}}),
    ("office", "Office shirt", "Sakurada_Fumiriya", {"tops": {"dark": (210, 212, 216)}, "bottoms": {"all": CHARCOAL}}),
    ("suit_black", "Black suit, red tie", "Sakurada_Fumiriya", {"tops": {"dark": BLACK, "vivid": (170, 24, 32)}, "bottoms": {"all": BLACK}}),
    ("suit_charcoal", "Charcoal suit", "Sakurada_Fumiriya", {"tops": {"dark": CHARCOAL, "vivid": (230, 120, 30)}, "bottoms": {"all": CHARCOAL}}),
    ("waistcoat", "Waistcoat", "Sakurada_Fumiriya", {"tops": {"dark": NAVY, "vivid": (230, 120, 30)}, "bottoms": {"all": NAVY}}),
    ("suit_check", "Check suit", "Sakurada_Fumiriya", {"tops": {"dark": (84, 76, 66), "vivid": (230, 120, 30)}, "bottoms": {"all": (84, 76, 66)}}),
    ("polo", "Polo and shorts", "HairSample_Male", {"tops": {"all": (40, 110, 70)}, "bottoms": {"all": BEIGE}}),
    ("blue_shirt", "Blue shirt and jeans", "HairSample_Male", {"tops": {"all": (90, 130, 200)}, "bottoms": {"all": (44, 60, 100)}}),
    ("tshirt", "T-shirt and jeans", "HairSample_Male", {"bottoms": {"all": (44, 60, 100)}}),
    ("track", "Track jacket", "HairSample_Male", {"tops": {"all": (30, 40, 90)}, "bottoms": {"all": BLACK}}),
]


def main():
    src_dir = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "..", "Web", "people")
    os.makedirs(out_dir, exist_ok=True)
    cache = {}

    def load(n):
        if n not in cache: cache[n] = Glb(os.path.join(src_dir, n + ".vrm"))
        return cache[n]

    index = {"people": [], "player": "seiko_office.glb", "outfits": [], "anime": True}
    total = 0
    for name, body, head, female, business, spec in PEOPLE:
        if not os.path.exists(os.path.join(src_dir, body + ".vrm")): continue
        b = load(body); h = load(head) if head else b
        sz = build(b, h, spec).save(os.path.join(out_dir, name + ".glb")); total += sz
        index["people"].append({"file": name + ".glb", "name": name, "female": female, "business": business, "japanese": True, "anime": True,
                                "body": body, "head": head or body, "bytes": sz})
        print("%-16s %-20s %-20s %6.1f MB" % (name, body, head or "", sz / 1e6))
    for oid, oname, body, spec in OUTFITS:
        b = load(body); h = load(SEIKO)
        sz = build(b, h, spec).save(os.path.join(out_dir, "seiko_" + oid + ".glb")); total += sz
        index["outfits"].append({"id": oid, "name": oname, "file": "seiko_" + oid + ".glb"})
        print("%-16s %-20s %-20s %6.1f MB" % ("seiko_" + oid, body, SEIKO, sz / 1e6))
    json.dump(index, open(os.path.join(out_dir, "index.json"), "w"), indent=1)
    print("total %.1f MB" % (total / 1e6))


if __name__ == "__main__":
    main()
