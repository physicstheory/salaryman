"""People: Seiko rebuilt younger, with real combed hair (hair cards), on every outfit.

No Blender needed for this one: it is glTF surgery on the Rocketbox cast (they all share one 81-bone Bip01 skeleton and
one bind pose, so a head is moved between bodies by remapping joint indices by name).

  1. Face: the young Male_Adult_10 head (m024, the lean early-twenties face) replaces the older m008 graft.
  2. Skin: the face texture is made younger by frequency separation: the mid-frequency band (creases, blotches, shadowed
     pores) is lowered, the low-frequency tone evened, the stubble shadow lifted; fine pore detail is kept.
  3. Hair: the painted helmet tufts are dropped. A neat combed style (side part on his left, top combed across and back
     with a little lift at the front, short tapered sides and nape) is grown as ~2,000 guide strands over the scalp and
     built as layered alpha-cut hair cards, skinned to the head bone. Material name 'seiko_hair' gets the character
     engine's Kajiya-Kay hair shading.
  4. Written over Web/people/real/seiko_*.glb (every outfit), so the wardrobe keeps working unchanged.
"""
import io
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "Tools", "forge"))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
from glbkit import Glb  # noqa: E402
import texgen  # noqa: E402

REAL = os.path.join(ROOT, "Web", "people", "real")
DONOR = os.path.join(REAL, "man_02.glb")          # native m024 head (Male_Adult_10)

TARGETS = ["seiko"]


def jpeg(im, q=92):
    b = io.BytesIO(); im.convert("RGB").save(b, "JPEG", quality=q, subsampling=0, optimize=True); return b.getvalue()


def png(im):
    b = io.BytesIO(); im.save(b, "PNG", optimize=True); return b.getvalue()


def tex_image(g, ti):
    d, _ = g.image_bytes(g.texture_image(ti))
    im = Image.open(io.BytesIO(d)); im.load(); return im


def joint_names(g):
    j = g.j
    return [j["nodes"][k]["name"] for k in j["skins"][0]["joints"]]


def bind_positions(g):
    names = joint_names(g)
    ibm = g.accessor(g.j["skins"][0]["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
    return {n: np.linalg.inv(ibm[i])[:3, 3] for i, n in enumerate(names)}


# ------------------------------------------------------------------------------------------------------------
# skin: younger

def blur_rgb(arr, r):
    return np.stack([texgen.blur(arr[..., c].astype(np.float64), r) for c in range(arr.shape[2])], -1).astype(np.float32)


def younger_albedo(im):
    a = np.asarray(im.convert("RGB"), np.float32) / 255.0
    H, W = a.shape[:2]
    lum = a @ np.array([0.3, 0.59, 0.11])
    # skin mask: warm, not too dark (hair, brows, eye sockets excluded), only in the face/neck island (top 70% of the atlas)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    skin = ((r > g * 1.02) & (lum > 0.22) & (r - b > 0.05)).astype(np.float32)
    skin[int(H * 0.7):] = 0
    skin = np.asarray(Image.fromarray((skin * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)), np.float32) / 255
    low = blur_rgb(a, 14)
    mid = blur_rgb(a, 1.6) - low
    hi = a - blur_rgb(a, 1.6)
    low_even = low * 0.7 + blur_rgb(low, 40) * 0.3
    young = low_even + mid * 0.55 + hi * 0.85
    # lift the stubble / under-eye shadows a touch and add a healthy warmth
    young = young * 1.03 + np.array([0.012, 0.004, -0.004])
    out = a * (1 - skin[..., None]) + young * skin[..., None]
    # hair painted on the scalp: make it an even, dense near-black base under the cards
    hairm = ((lum < 0.16) & (np.arange(H)[:, None] < H * 0.55)).astype(np.float32)
    hairm = np.asarray(Image.fromarray((hairm * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)), np.float32) / 255
    fine = texgen.fnoise(H, 7, 200, 800) * 0.012
    base = np.stack([0.030 + fine, 0.024 + fine, 0.021 + fine], -1)
    out = out * (1 - hairm[..., None] * 0.85) + base * hairm[..., None] * 0.85
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)), hairm


def younger_normal(im):
    a = np.asarray(im.convert("RGB"), np.float32) / 255.0 * 2 - 1
    flat = np.array([0, 0, 1.0])
    low = blur_rgb(a, 6)
    hi = a - low
    # soften the creases (mid band) toward the smoothed normal, keep the pores
    out = low * 0.8 + flat * 0.2 + hi * 0.9
    out /= np.linalg.norm(out, axis=-1, keepdims=True) + 1e-6
    return Image.fromarray(((out * 0.5 + 0.5) * 255 + 0.5).clip(0, 255).astype(np.uint8))


# ------------------------------------------------------------------------------------------------------------
# hair

def hair_textures(n=1024):
    """4 strand clumps side by side (u quarters), roots at v=0, alpha in the tips. RGBA albedo, normal, ORM."""
    rgba = np.zeros((n, n, 4), np.float32)
    height = np.zeros((n, n), np.float32)
    q = n // 4
    for k in range(4):
        c, shade, alpha = texgen.r_hair_strands(n, 31 + k * 7, col=["#120e0b", "#150f0c", "#100c0a", "#18110c"][k])
        sl = slice(k * q, (k + 1) * q)
        rgba[:, sl, :3] = c[:, sl]
        rgba[:, sl, 3] = alpha[:, sl]
        height[:, sl] = shade[:, sl]
    alb = Image.fromarray((np.concatenate([texgen.srgb(np.clip(rgba[..., :3], 0, 1)), rgba[..., 3:]], -1) * 255 + 0.5).clip(0, 255).astype(np.uint8), "RGBA")
    nor = texgen.normal_from_height(height * 3, 2.5)
    rough = np.clip(0.62 + 0.15 * (1 - height), 0, 1)
    orm = Image.merge("RGB", (texgen.gray_img(0.75 + 0.25 * height), texgen.gray_img(rough), Image.new("L", (n, n), 0)))
    return alb, nor, orm


class Surface:
    """The head mesh as a dense point cloud with normals: strands are kept a few millimetres off the real surface."""
    def __init__(self, pos, idx, n=60000, seed=3):
        tri = pos[idx.reshape(-1, 3)]
        e1, e2 = tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]
        cr = np.cross(e1, e2); area = np.linalg.norm(cr, axis=1) * 0.5
        self.tn = cr / (np.linalg.norm(cr, axis=1, keepdims=True) + 1e-12)
        rng = np.random.default_rng(seed)
        pick = rng.choice(len(tri), n, p=area / area.sum())
        u, v = rng.random(n), rng.random(n)
        flip = u + v > 1; u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
        self.p = tri[pick, 0] + e1[pick] * u[:, None] + e2[pick] * v[:, None]
        self.n = self.tn[pick]
        c = self.p.mean(0)
        # outward: flip normals that point to the head centre
        self.n *= np.sign(((self.p - c) * self.n).sum(1))[:, None]
        self.n[np.abs(self.n).sum(1) < 1e-6] = (0, 0, 1)
        # coarse grid for nearest lookups
        self.g = 0.01
        keys = np.floor(self.p / self.g).astype(int)
        self.cells = {}
        for i, k in enumerate(map(tuple, keys)):
            self.cells.setdefault(k, []).append(i)

    def nearest(self, q):
        k = np.floor(q / self.g).astype(int)
        best, bd = 0, 1e9
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for i in self.cells.get((k[0] + dx, k[1] + dy, k[2] + dz), ()):
                        d = ((self.p[i] - q) ** 2).sum()
                        if d < bd:
                            bd, best = d, i
        if bd == 1e9:
            best = int(np.argmin(((self.p - q) ** 2).sum(1)))
        return self.p[best], self.n[best]

    def snap(self, q, lift):
        p, n = self.nearest(q)
        # average the normal over a small neighbourhood for smooth strands
        return p + n * lift, n


def hairline_z(az, eyes_z):
    """Height of the hairline around the head (az 0 = front, +-pi = nape)."""
    a = abs(az)
    pts = [(0.0, 0.074), (0.45, 0.068), (0.75, 0.052), (1.05, 0.030), (1.3, -0.005), (1.55, 0.012), (1.9, 0.005), (2.4, -0.040), (np.pi, -0.072)]
    for (a0, z0), (a1, z1) in zip(pts, pts[1:]):
        if a <= a1:
            t = (a - a0) / (a1 - a0); return eyes_z + z0 + (z1 - z0) * t
    return eyes_z + pts[-1][1]


def grow_hair(head_pos, head_idx, bind):
    """-> positions, normals, uvs, indices of the hair cards (mesh space: Z up, face toward -Y, +X = his left)."""
    rng = np.random.default_rng(11)
    S = Surface(head_pos, head_idx)
    eyes = (bind["Bip01 REye"] + bind["Bip01 LEye"]) / 2
    c = np.array([0.0, eyes[1] + 0.095, eyes[2]])
    az = lambda p: math.atan2(p[0] - c[0], -(p[1] - c[1]))     # 0 = front, +pi/2 = his left
    above = np.array([p[2] > hairline_z(az(p), eyes[2]) for p in S.p])
    cand = np.where(above)[0]
    part_x = 0.030
    crown_y = c[1] + 0.035
    top_z = eyes[2] + 0.085
    P, N, U, I = [], [], [], []
    X, Y, Z = np.eye(3)
    def card(pts, width, ri, nrms):
        segs = len(pts) - 1
        u0 = (ri % 4) * 0.25
        base = len(P)
        for k, q in enumerate(pts):
            t = k / segs
            nrm = nrms[k]
            tang = pts[min(k + 1, segs)] - pts[max(k - 1, 0)]
            tang /= np.linalg.norm(tang) + 1e-9
            side = np.cross(tang, nrm); side /= np.linalg.norm(side) + 1e-9
            w = width * (1 - 0.3 * t)
            P.extend([q - side * w / 2, q + side * w / 2]); N.extend([nrm, nrm])
            U.extend([(u0 + 0.01, t * 0.97), (u0 + 0.24, t * 0.97)])
        for k in range(segs):
            a0 = base + k * 2
            I.extend([a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3])
    def flow(p, n):
        """comb direction at p: the style."""
        top = p[2] > top_z or (n[2] > 0.55)
        frontal = abs(az(p)) < 0.95 and p[2] > eyes[2] + 0.03
        if frontal and not top:
            # the front: combed up off the forehead and across, never down over it
            d = Z * 0.75 + Y * 0.35 + (-X * 0.55 if p[0] < part_x else X * 0.5)
        elif top and p[1] < crown_y:
            if p[0] < part_x:
                # the big side: combed across to his right and back; the front sweeps more sideways
                front = np.clip(-(p[1] - c[1]) / 0.09, 0, 1)
                d = -X * (0.55 + 0.35 * front) + Y * (0.85 - 0.45 * front)
            else:
                d = X * 0.9 + Y * 0.45                     # the small side, down toward his left ear
        elif top:
            r = p - np.array([part_x * 0.3, crown_y, p[2]]); r[2] = 0
            d = r / (np.linalg.norm(r) + 1e-9) + Y * 0.6 - Z * 0.4   # from the crown: back and down
        else:
            d = -Z * 0.9 + Y * 0.35 + (X if p[0] > 0 else -X) * 0.05   # sides and nape: down and back, short
        return d / np.linalg.norm(d)
    # two layers: a dense short under-layer everywhere above the hairline, longer top cards for the combed shape
    layers = [("under", 1700, 2, (0.012, 0.022), 0.0012, 0.009), ("top", 1300, 4, (0.045, 0.07), 0.0028, 0.013)]
    ri = 0
    for name, count, segs, (l0, l1), lift, width in layers:
        pool = cand if name == "under" else cand[S.p[cand, 2] > eyes[2] + 0.045]
        for i in rng.choice(pool, count, replace=False):
            p0, n0 = S.p[i], S.n[i]
            topzone = p0[2] > top_z or n0[2] > 0.55
            L = l0 + (l1 - l0) * rng.random()
            if name == "top" and not topzone and abs(az(p0)) > 0.95:
                L *= 0.45
            if name == "under" and p0[2] < hairline_z(az(p0), eyes[2]) + 0.012:
                L *= 0.6                                  # tapered at the hairline
            pts, nrs = [p0 + n0 * lift], [n0]
            p = p0.copy()
            for k in range(segs):
                d = flow(p, nrs[-1])
                d = d - nrs[-1] * np.dot(d, nrs[-1]); d /= np.linalg.norm(d) + 1e-9
                p = p + d * (L / segs)
                t = (k + 1) / segs
                lf = lift + (0.004 * math.sin(math.pi * min(1, t * 1.2)) if name == "top" else 0.0008 * t)
                q, nn = S.snap(p, lf)
                p = q - nn * lf
                pts.append(q); nrs.append(nn)
            card(np.array(pts), width * (0.8 + 0.4 * rng.random()), ri, nrs)
            ri += 1
    return np.array(P, np.float32), np.array(N, np.float32), np.array(U, np.float32), np.array(I, np.uint32)


# ------------------------------------------------------------------------------------------------------------
# glTF surgery

def add_material(g, name, base_png_or_jpg, nor, orm, mime_base="image/jpeg", alpha=None, extras=None):
    bi = g.add_texture(g.add_image(base_png_or_jpg, mime_base, name + "_albedo"))
    ni = g.add_texture(g.add_image(nor, "image/jpeg", name + "_normal"))
    oi = g.add_texture(g.add_image(orm, "image/jpeg", name + "_orm"))
    m = {"name": name, "pbrMetallicRoughness": {"baseColorTexture": {"index": bi}, "metallicRoughnessTexture": {"index": oi},
                                                "metallicFactor": 0.0, "roughnessFactor": 1.0},
         "normalTexture": {"index": ni}, "occlusionTexture": {"index": oi}}
    if alpha:
        m["alphaMode"] = "MASK"; m["alphaCutoff"] = alpha; m["doubleSided"] = True
    if extras:
        m["extras"] = extras
    g.j["materials"].append(m)
    return len(g.j["materials"]) - 1


def prune(g):
    j = g.j
    used = sorted({p["material"] for m in j["meshes"] for p in m["primitives"] if "material" in p})
    remap = {o: i for i, o in enumerate(used)}
    j["materials"] = [j["materials"][o] for o in used]
    for m in j["meshes"]:
        for p in m["primitives"]:
            if "material" in p:
                p["material"] = remap[p["material"]]
    # textures/images still referenced
    def tex_refs(o, acc):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == "index" and isinstance(v, int) and "texCoord" not in o or (k == "index" and isinstance(v, int)):
                    acc.add(v)
                else:
                    tex_refs(v, acc)
        elif isinstance(o, list):
            for v in o:
                tex_refs(v, acc)
    tu = set(); tex_refs(j["materials"], tu)
    tu = sorted(tu)
    tmap = {o: i for i, o in enumerate(tu)}
    def retex(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == "index" and isinstance(v, int):
                    o[k] = tmap[v]
                else:
                    retex(v)
        elif isinstance(o, list):
            for v in o:
                retex(v)
    retex(j["materials"])
    j["textures"] = [j["textures"][o] for o in tu]
    iu = sorted({t["source"] for t in j["textures"]})
    imap = {o: i for i, o in enumerate(iu)}
    for t in j["textures"]:
        t["source"] = imap[t["source"]]
    j["images"] = [j["images"][o] for o in iu]
    # buffer views / accessors still referenced
    acc = set()
    for m in j["meshes"]:
        for p in m["primitives"]:
            acc.update(p["attributes"].values())
            if "indices" in p:
                acc.add(p["indices"])
            for t in p.get("targets", []):
                acc.update(t.values())
    for s in j.get("skins", []):
        if "inverseBindMatrices" in s:
            acc.add(s["inverseBindMatrices"])
    for a in j.get("animations", []):
        for smp in a["samplers"]:
            acc.update([smp["input"], smp["output"]])
    au = sorted(acc)
    amap = {o: i for i, o in enumerate(au)}
    j["accessors"] = [j["accessors"][o] for o in au]
    for m in j["meshes"]:
        for p in m["primitives"]:
            p["attributes"] = {k: amap[v] for k, v in p["attributes"].items()}
            if "indices" in p:
                p["indices"] = amap[p["indices"]]
            if "targets" in p:
                p["targets"] = [{k: amap[v] for k, v in t.items()} for t in p["targets"]]
    for s in j.get("skins", []):
        if "inverseBindMatrices" in s:
            s["inverseBindMatrices"] = amap[s["inverseBindMatrices"]]
    for a in j.get("animations", []):
        for smp in a["samplers"]:
            smp["input"] = amap[smp["input"]]; smp["output"] = amap[smp["output"]]
    vu = sorted({a["bufferView"] for a in j["accessors"] if "bufferView" in a} | {i["bufferView"] for i in j["images"] if "bufferView" in i})
    vmap = {o: i for i, o in enumerate(vu)}
    old_views = j["bufferViews"]
    blobs = [g.view_bytes(o) for o in vu]
    j["bufferViews"] = [dict(old_views[o]) for o in vu]
    for a in j["accessors"]:
        if "bufferView" in a:
            a["bufferView"] = vmap[a["bufferView"]]
    for i in j["images"]:
        if "bufferView" in i:
            i["bufferView"] = vmap[i["bufferView"]]
    nb = bytearray()
    for v, d in zip(j["bufferViews"], blobs):
        nb += b"\0" * ((4 - len(nb) % 4) % 4)
        v["byteOffset"] = len(nb); v["byteLength"] = len(d); nb += d
    g.bin = nb
    g._sync_buffer()


class Parts:
    """Built once, grafted into every outfit."""
    def __init__(self):
        d = Glb.load(DONOR)
        self.donor = d
        self.names = joint_names(d)
        self.bind = bind_positions(d)
        j = d.j
        prim = [p for p in j["meshes"][0]["primitives"] if j["materials"][p["material"]]["name"].endswith("_head")][0]
        self.head = {k: d.accessor(v) for k, v in prim["attributes"].items()}
        self.head_idx = d.accessor(prim["indices"]).reshape(-1)
        m = j["materials"][prim["material"]]
        self.head_mat = m
        alb = tex_image(d, m["pbrMetallicRoughness"]["baseColorTexture"]["index"])
        nor = tex_image(d, m["normalTexture"]["index"])
        orm = tex_image(d, m["pbrMetallicRoughness"]["metallicRoughnessTexture"]["index"])
        print("  skin: frequency-separated younger face")
        self.alb, hairm = younger_albedo(alb)
        self.nor = younger_normal(nor)
        self.orm = orm
        print("  hair: growing strands")
        P, N, U, I = grow_hair(self.head["POSITION"], self.head_idx, self.bind)
        self.hair = (P, N, U, I)
        print("  hair cards: %d triangles" % (len(I) // 3))
        # the painted hair under the cards is matte, not shiny skin
        o = np.asarray(orm.convert("RGB"), np.float32)
        hm = np.asarray(Image.fromarray((hairm * 255).astype(np.uint8)).resize(orm.size), np.float32) / 255
        o[..., 1] = o[..., 1] * (1 - hm) + 165 * hm
        o[..., 2] = o[..., 2] * (1 - hm)
        self.orm = Image.fromarray(o.clip(0, 255).astype(np.uint8))
        self.hair_tex = hair_textures(1024)


def graft(parts, src, dst):
    g = Glb.load(src)
    j = g.j
    tnames = joint_names(g)
    tix = {n: i for i, n in enumerate(tnames)}
    head_j = tix["Bip01 Head"]
    mesh = j["meshes"][0]
    keep = []
    for p in mesh["primitives"]:
        nm = j["materials"][p["material"]]["name"]
        if "head" in nm or "opacity" in nm or "hair" in nm:
            continue
        keep.append(p)
    # the young head
    jmap = np.array([tix.get(n, head_j) for n in parts.names], np.uint16)
    h = parts.head
    joints = jmap[h["JOINTS_0"].astype(int)]
    extras = dict(parts.head_mat.get("extras", {}))
    hm = add_material(g, "seiko_head", jpeg(parts.alb, 93), jpeg(parts.nor), jpeg(parts.orm), extras=extras)
    attrs = {"POSITION": g.add_accessor(h["POSITION"].astype(np.float32), "VEC3", 34962, minmax=True),
             "NORMAL": g.add_accessor(h["NORMAL"].astype(np.float32), "VEC3", 34962),
             "TEXCOORD_0": g.add_accessor(h["TEXCOORD_0"].astype(np.float32), "VEC2", 34962),
             "JOINTS_0": g.add_accessor(joints.astype(np.uint16), "VEC4", 34962),
             "WEIGHTS_0": g.add_accessor(h["WEIGHTS_0"].astype(np.float32), "VEC4", 34962)}
    keep.append({"attributes": attrs, "indices": g.add_accessor(parts.head_idx.astype(np.uint32), "SCALAR", 34963), "material": hm})
    # the hair
    P, N, U, I = parts.hair
    alb, nor, orm = parts.hair_tex
    hmat = add_material(g, "seiko_hair", png(alb), jpeg(nor), jpeg(orm), mime_base="image/png", alpha=0.4,
                        extras={"shigoto": {"kind": "hair", "style": "neat side part, combed"}})
    J = np.zeros((len(P), 4), np.uint16); J[:, 0] = head_j
    W = np.zeros((len(P), 4), np.float32); W[:, 0] = 1
    keep.append({"attributes": {"POSITION": g.add_accessor(P, "VEC3", 34962, minmax=True), "NORMAL": g.add_accessor(N, "VEC3", 34962),
                                "TEXCOORD_0": g.add_accessor(U, "VEC2", 34962), "JOINTS_0": g.add_accessor(J, "VEC4", 34962),
                                "WEIGHTS_0": g.add_accessor(W, "VEC4", 34962)},
                 "indices": g.add_accessor(I, "SCALAR", 34963), "material": hmat})
    mesh["primitives"] = keep
    prune(g)
    g.save(dst)
    return os.path.getsize(dst)


def build(which):
    """Graft in place: graft() drops any head, helmet-hair or hair primitive before adding the new ones, so it can be
    re-run on its own output (the original outfits are in git history)."""
    outfits = sorted(f for f in os.listdir(REAL) if f.startswith("seiko_") and f.endswith(".glb"))
    parts = Parts()
    for f in outfits:
        n = graft(parts, os.path.join(REAL, f), os.path.join(REAL, f))
        print("  -> Web/people/real/%s  %.1f MB" % (f, n / 1e6))
