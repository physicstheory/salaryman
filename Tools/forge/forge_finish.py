"""Turn a raw forge result into a game prop that passes the AAA gate.

    python3 Tools/forge/forge_finish.py raw.glb --id vending_drinks_02 --height 1.83 [--yaw 180] [--tex 2048]
                                         [--meta job.json] [--out Web/props]

What it does to the model:
  * every material gets base colour + normal + ORM (R occlusion, G roughness, B metallic) textures, 1024-2048 px, JPEG.
    The generators paint albedo/metal/rough; the tangent-space normal map is synthesised from the albedo's fine detail
    (wood grain, panel seams, scuffs) so the surface catches light like the scanned props do. A flat roughness gets
    variation from the same detail.
  * unlit/webp/DDS extensions are removed (three.js r128 and the gate want plain PBR with PNG/JPEG).
  * it is scaled to real-world size (metres), stood on y = 0 and centred, under one root node; --yaw turns it to face +Z.
  * it is written to Web/props/<id>.glb and listed in Web/props/index.json with its size, triangle count and how it was made,
    so propPut(parent, "<id>", ...) and ShopAAA's SWAP table can use it straight away.
"""
import argparse
import datetime
import io
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from glbkit import Glb  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DROP_EXT = {"KHR_materials_unlit", "EXT_texture_webp", "MSFT_texture_dds", "KHR_texture_basisu", "KHR_materials_pbrSpecularGlossiness"}


def decode(g, ti):
    ii = g.texture_image(ti)
    data, _ = g.image_bytes(ii)
    im = Image.open(io.BytesIO(data))
    im.load()
    return im


def jpeg(im, q=90):
    b = io.BytesIO()
    im.convert("RGB").save(b, "JPEG", quality=q, subsampling=0, optimize=True)
    return b.getvalue()


def fit(im, lo, hi):
    """Clamp the long side to lo..hi and snap both sides to powers of two (mipmaps, and three.js resizes NPOT anyway)."""
    w, h = im.size
    s = max(w, h)
    k = hi / s if s > hi else lo / s if s < lo else 1.0
    pot = lambda x: 1 << max(4, round(math.log2(max(1.0, x * k))))
    size = (min(hi, pot(w)), min(hi, pot(h)))
    return im if size == im.size else im.resize(size, Image.LANCZOS)


def detail_height(albedo):
    """Fine surface relief guessed from the albedo: darker = lower, low frequencies removed so lighting baked into the paint
    doesn't turn into big fake bumps."""
    g = np.asarray(albedo.convert("L"), np.float32) / 255.0
    lo = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(2, albedo.size[0] // 256))), np.float32) / 255.0
    hp = g - lo
    hp = np.clip(hp / (np.std(hp) * 3 + 1e-4), -1, 1)
    return hp


def normal_from_albedo(albedo, strength=2.2):
    h = detail_height(albedo)
    hs = np.asarray(Image.fromarray(((h * 0.5 + 0.5) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255.0
    dx = (np.roll(hs, -1, 1) - np.roll(hs, 1, 1)) * strength
    dy = (np.roll(hs, -1, 0) - np.roll(hs, 1, 0)) * strength
    n = np.stack([-dx, dy, np.ones_like(dx)], -1)  # OpenGL / glTF convention: +Y up in tangent space
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8))


def orm(albedo, mr_img, metal_factor, rough_factor):
    """R = 255 (no baked occlusion), G = roughness, B = metallic. Generator maps are kept; a flat roughness gets detail."""
    size = albedo.size
    h = detail_height(albedo)
    if mr_img is not None:
        a = np.asarray(mr_img.convert("RGB").resize(size, Image.BILINEAR), np.float32)
        rough = a[..., 1] * rough_factor
        metal = a[..., 2] * metal_factor
    else:
        lum = np.asarray(albedo.convert("L"), np.float32)
        rough = np.full(lum.shape, 255.0 * min(1.0, max(0.35, rough_factor if rough_factor < 1 else 0.62)))
        metal = np.full(lum.shape, 255.0 * metal_factor if metal_factor < 1 else 0.0)
    if rough.std() < 6:
        rough = rough - h * 22.0  # raised detail a touch glossier, crevices rougher
    o = np.full(rough.shape, 255.0)
    return Image.fromarray(np.stack([o, rough.clip(8, 255), metal.clip(0, 255)], -1).astype(np.uint8))


def finish(src, pid, height=None, width=None, length=None, yaw=0.0, tex=2048, meta=None, out_dir=None):
    g = Glb.load(src)
    j = g.j
    for k in ("extensionsUsed", "extensionsRequired"):
        if k in j:
            j[k] = [e for e in j[k] if e not in DROP_EXT]
            if not j[k]:
                del j[k]
    for t in j.get("textures", []):
        ext = t.get("extensions") or {}
        for e in list(ext):
            if e in DROP_EXT:
                if t.get("source") is None:
                    t["source"] = ext[e]["source"]
                del ext[e]
        if not ext:
            t.pop("extensions", None)
    if not j.get("materials"):
        raise SystemExit("the model has no material: run the generator with texture on")

    for mi, m in enumerate(j["materials"]):
        m.setdefault("extensions", {})
        for e in list(m["extensions"]):
            if e in DROP_EXT:
                del m["extensions"][e]
        if not m["extensions"]:
            del m["extensions"]
        pb = m.setdefault("pbrMetallicRoughness", {})
        if "baseColorTexture" not in pb:
            raise SystemExit("material %d has no base colour texture: the generator's paint step did not run" % mi)
        base = fit(decode(g, pb["baseColorTexture"]["index"]), 1024, tex)
        mr = decode(g, pb["metallicRoughnessTexture"]["index"]) if "metallicRoughnessTexture" in pb else None
        o = orm(base, mr, pb.get("metallicFactor", 1.0), pb.get("roughnessFactor", 1.0))
        if "normalTexture" in m:
            nrm = fit(decode(g, m["normalTexture"]["index"]), 1024, tex).convert("RGB")
        else:
            nrm = normal_from_albedo(base)
        has_alpha = m.get("alphaMode") in ("BLEND", "MASK")
        bi = g.add_image(jpeg(base) if not has_alpha else _png(base), "image/jpeg" if not has_alpha else "image/png", "%s_%d_base" % (pid, mi))
        oi = g.add_image(jpeg(o), "image/jpeg", "%s_%d_orm" % (pid, mi))
        ni = g.add_image(jpeg(nrm, 95), "image/jpeg", "%s_%d_normal" % (pid, mi))
        pb["baseColorTexture"] = {"index": g.add_texture(bi)}
        pb["metallicRoughnessTexture"] = {"index": g.add_texture(oi)}
        pb["metallicFactor"] = 1.0
        pb["roughnessFactor"] = 1.0
        m["occlusionTexture"] = {"index": pb["metallicRoughnessTexture"]["index"]}
        m["normalTexture"] = {"index": g.add_texture(ni), "scale": 1.0}
        m["name"] = "%s_%d" % (pid, mi)
    _drop_unused_images(g)

    # size, ground and face it
    pts = g.world_points()
    if not len(pts):
        raise SystemExit("the model has no geometry")
    c, s_ = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    R = np.array([[c, 0, s_, 0], [0, 1, 0, 0], [-s_, 0, c, 0], [0, 0, 0, 1]], np.float64)
    p = pts @ R[:3, :3].T
    lo, hi = p.min(0), p.max(0)
    ext = hi - lo
    if height:
        k = height / max(ext[1], 1e-6)
    elif width:
        k = width / max(ext[0], 1e-6)
    elif length:
        k = length / max(ext[2], 1e-6)
    else:
        k = 1.0
    S = np.diag([k, k, k, 1.0])
    T = np.eye(4)
    T[:3, 3] = [-(lo[0] + hi[0]) / 2 * k, -lo[1] * k, -(lo[2] + hi[2]) / 2 * k]
    g.wrap_root(T @ S @ R, name=pid)
    size = [float(x) for x in ext * k]
    tris = g.triangles()
    j["asset"] = {"version": "2.0", "generator": "Salary Man Model Forge", "copyright": (meta or {}).get("licence", "")}

    out_dir = out_dir or os.path.join(REPO, "Web", "props")
    os.makedirs(out_dir, exist_ok=True)
    dst = os.path.join(out_dir, pid + ".glb")
    g.save(dst)
    ix_path = os.path.join(out_dir, "index.json")
    ix = json.load(open(ix_path)) if os.path.exists(ix_path) else {}
    entry = {"file": pid + ".glb", "size": size, "tris": tris, "from": tris}
    if meta:
        entry["forge"] = meta
    ix[pid] = entry
    with open(ix_path, "w") as f:
        json.dump(ix, f, indent=1)
        f.write("\n")
    return dst, entry


def _png(im):
    b = io.BytesIO()
    im.save(b, "PNG", optimize=True)
    return b.getvalue()


def _drop_unused_images(g):
    """Keep only images/textures the materials still point at, renumbering everything."""
    j = g.j
    used_t = []
    for m in j.get("materials", []):
        pb = m.get("pbrMetallicRoughness", {})
        for ref in (pb.get("baseColorTexture"), pb.get("metallicRoughnessTexture"), m.get("normalTexture"), m.get("occlusionTexture"), m.get("emissiveTexture")):
            if ref and ref["index"] not in used_t:
                used_t.append(ref["index"])
    tmap = {old: new for new, old in enumerate(used_t)}
    texs = [j["textures"][i] for i in used_t]
    used_i = []
    for t in texs:
        if t["source"] not in used_i:
            used_i.append(t["source"])
    imap = {old: new for new, old in enumerate(used_i)}
    imgs = [j["images"][i] for i in used_i]
    for t in texs:
        t["source"] = imap[t["source"]]
    for m in j.get("materials", []):
        pb = m.get("pbrMetallicRoughness", {})
        for ref in (pb.get("baseColorTexture"), pb.get("metallicRoughnessTexture"), m.get("normalTexture"), m.get("occlusionTexture"), m.get("emissiveTexture")):
            if ref:
                ref["index"] = tmap[ref["index"]]
    j["textures"], j["images"] = texs, imgs
    # drop buffer views nothing references any more (the replaced images)
    refs = set()
    for a in j.get("accessors", []):
        if "bufferView" in a:
            refs.add(a["bufferView"])
        sp = a.get("sparse")
        if sp:
            refs.add(sp["indices"]["bufferView"]); refs.add(sp["values"]["bufferView"])
    for im in imgs:
        refs.add(im["bufferView"])
    for mesh in j.get("meshes", []):
        for p in mesh.get("primitives", []):
            d = (p.get("extensions") or {}).get("KHR_draco_mesh_compression")
            if d:
                refs.add(d["bufferView"])
    keep = sorted(refs)
    vmap = {old: new for new, old in enumerate(keep)}
    blobs = [g.view_bytes(i) for i in keep]
    views = [dict(j["bufferViews"][i]) for i in keep]
    g.bin = bytearray()
    j["bufferViews"] = []
    for v, b in zip(views, blobs):
        nv = g.add_view(b, v.get("target"))
        if "byteStride" in v:
            j["bufferViews"][nv]["byteStride"] = v["byteStride"]
    for a in j.get("accessors", []):
        if "bufferView" in a:
            a["bufferView"] = vmap[a["bufferView"]]
        sp = a.get("sparse")
        if sp:
            sp["indices"]["bufferView"] = vmap[sp["indices"]["bufferView"]]
            sp["values"]["bufferView"] = vmap[sp["values"]["bufferView"]]
    for im in imgs:
        im["bufferView"] = vmap[im["bufferView"]]
    for mesh in j.get("meshes", []):
        for p in mesh.get("primitives", []):
            d = (p.get("extensions") or {}).get("KHR_draco_mesh_compression")
            if d:
                d["bufferView"] = vmap[d["bufferView"]]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("glb")
    ap.add_argument("--id", required=True, help="prop id: lower_snake_case, becomes Web/props/<id>.glb")
    ap.add_argument("--height", type=float)
    ap.add_argument("--width", type=float)
    ap.add_argument("--length", type=float)
    ap.add_argument("--yaw", type=float, default=0.0, help="degrees to turn it so its front faces +Z")
    ap.add_argument("--tex", type=int, default=2048)
    ap.add_argument("--meta", help="job.json from the forge, recorded in index.json")
    ap.add_argument("--out", help="output folder (default Web/props)")
    a = ap.parse_args()
    meta = None
    if a.meta:
        jj = json.load(open(a.meta))
        meta = {k: jj.get(k) for k in ("pipeline", "prompt", "seed", "faces", "octree") if jj.get(k) not in (None, "")}
        meta["job"] = jj.get("id")
        meta["made"] = datetime.date.today().isoformat()
    dst, e = finish(a.glb, a.id, a.height, a.width, a.length, a.yaw, a.tex, meta, a.out)
    print("wrote %s  (%.2f x %.2f x %.2f m, %d triangles)" % (os.path.relpath(dst), e["size"][0], e["size"][1], e["size"][2], e["tris"]))


if __name__ == "__main__":
    main()
