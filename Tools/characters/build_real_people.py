#!/usr/bin/env python3
"""Builds the realistic cast in Web/people/real for the Shigoto character engine (Engine/src/characters).

Source: Microsoft's Rocketbox avatar library (MIT licence, github.com/microsoft/Microsoft-Rocketbox): professionally modelled, fully rigged
(3ds Max Biped skeleton, the Bip01 names the game already retargets onto) and game-ready people. Game/tools/build-people.py turned them into
glTF once (head grafts so the cast is Japanese, skin tone matched, colour and normal maps packed); those bodies are the base here, taken from
git history (commit f35e662) unless --base points at a folder of them.

What this adds is the rest of a physically based material set. Every Rocketbox material ships a colour map, a normal map and a SPECULAR
map; the first build packed only the first two. Here each body and head material gets an ORM texture in glTF's own layout:
    R  ambient occlusion   cavity occlusion integrated from the normal map (Frankot-Chellappa height, then height-above-blur)
    G  roughness           from Rocketbox's specular map, per region: wet eyes and lips gloss, skin stays soft, cloth goes matte
    B  skin mask           (glTF puts metalness here; every material is set metallicFactor 0, so three ignores it.) Where the texel is
                           skin, so the engine scatters light under skin and not under the shirt that shares its atlas
The material's extras carry {"shigoto": {...}} saying what kind it is (skin atlas, hair cards, glasses) and what the ORM channels hold.

    python3 Tools/characters/build_real_people.py --rocketbox <checkout> [--base dir] [--out Web/people/real]

A sparse checkout is enough: the *_specular.tga files of the avatars listed in each material's name (m008_head -> m008_head_specular.tga).
Needs numpy and Pillow.
"""
import argparse, io, json, os, struct, subprocess, sys, tempfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "../.."))
BASE_COMMIT = "f35e662"
ORM_SIZE = 1024
# story parts the realistic cast plays (konto.html picks them by file name)
ROLES = {"salaryman_03": "Father Shigu", "woman_05": "Mother Shigu", "woman_02": "Seiko's sister", "salaryman_04": "Akio / SOTI colleague",
         "officelady_02": "SOTI receptionist"}


def read_glb(data):
    jl = struct.unpack_from("<I", data, 12)[0]
    j = json.loads(data[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack_from("<I", data, off)[0]
    return j, bytearray(data[off + 8:off + 8 + bl])


def write_glb(path, j, binb):
    while len(binb) % 4: binb.append(0)
    j["buffers"] = [{"byteLength": len(binb)}]
    js = json.dumps(j, separators=(",", ":")).encode()
    while len(js) % 4: js += b" "
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binb)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack("<II", len(binb), 0x004E4942)); f.write(bytes(binb))


def image_of(j, binb, tex_index):
    src = j["textures"][tex_index]["source"]
    bv = j["bufferViews"][j["images"][src]["bufferView"]]
    o = bv.get("byteOffset", 0)
    return Image.open(io.BytesIO(bytes(binb[o:o + bv["byteLength"]])))


def gauss(a, r):
    """Gaussian blur (sigma r texels), wrapping at the edges the way a tiling UV sheet does, done in the frequency domain."""
    a = np.asarray(a, dtype=np.float32)
    fy = np.fft.fftfreq(a.shape[0])[:, None]; fx = np.fft.fftfreq(a.shape[1])[None, :]
    k = np.exp(-2 * (np.pi * r) ** 2 * (fx ** 2 + fy ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * k)).astype(np.float32)


def skin_mask(rgb):
    """Where the colour map is skin: the YCbCr skin cluster, with soft edges, minus very dark (hair, brows) and very pale (eye whites, shirts)."""
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
    soft = lambda v, lo, hi, e: np.clip((v - lo) / e + 1, 0, 1) * np.clip((hi - v) / e + 1, 0, 1)
    m = soft(cb, 80, 124, 6) * soft(cr, 136, 172, 6) * soft(y, 55, 235, 18)
    m *= np.clip((r - g) / 12.0, 0, 1) * np.clip((r - b) / 22.0, 0, 1)     # skin is always redder than green and blue
    # ...and more saturated than brown or beige cloth of the same hue (a tan suit sits inside the YCbCr cluster; its red lead is smaller)
    m *= np.clip(((r - b) / np.maximum(r, 1) - 0.27) / 0.08, 0, 1) * soft(y, 85, 255, 20)
    m = gauss(m, 1.5)
    return np.clip((m - 0.25) / 0.5, 0, 1)


def lab(rgb):
    c = rgb.astype(np.float32) / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.2126, 0.0193], [0.3576, 0.7152, 0.1192], [0.1805, 0.0722, 0.9505]], np.float32)
    xyz /= np.array([0.9505, 1.0, 1.089], np.float32)
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def near_skin(rgb, ref_lab):
    """How close each texel's colour is to this person's own skin (from the face): chroma counts, lightness (shading) much less.
    Rejects pink, peach and tan cloth that the generic skin test lets through."""
    L = lab(rgb)
    d = np.sqrt(((L[..., 1] - ref_lab[1]) ** 2 + (L[..., 2] - ref_lab[2]) ** 2) + (0.25 * (L[..., 0] - ref_lab[0])) ** 2)
    return np.clip(1.0 - (d - 7.0) / 7.0, 0, 1)


def height_from_normal(nrm):
    """Frankot-Chellappa: the height field whose gradients best match the normal map's."""
    n = nrm.astype(np.float32) / 127.5 - 1.0
    nz = np.clip(n[..., 2], 0.2, 1.0)
    p, q = -n[..., 0] / nz, n[..., 1] / nz           # dz/dx, dz/dy (OpenGL normal maps: +Y up, image rows go down)
    h, w = p.shape
    wx = np.fft.fftfreq(w) * 2 * np.pi
    wy = np.fft.fftfreq(h) * 2 * np.pi
    WX, WY = np.meshgrid(wx, wy)
    d = WX ** 2 + WY ** 2; d[0, 0] = 1
    Z = (-1j * WX * np.fft.fft2(p) - 1j * WY * np.fft.fft2(q)) / d
    Z[0, 0] = 0
    return np.real(np.fft.ifft2(Z))


def ao_from_normal(nrm, size):
    small = np.asarray(Image.fromarray(nrm).resize((size, size), Image.LANCZOS))
    hgt = height_from_normal(small)
    hgt /= max(1e-6, np.percentile(np.abs(hgt), 99))
    cav = sum(gauss(hgt, r) - hgt for r in (2, 6, 16)) / 3.0          # how far each texel sits below its neighbourhood, at three scales
    ao = 1.0 - np.clip(cav * 3.0, 0, 0.8)
    nz = small[..., 2].astype(np.float32) / 255.0                       # steep folds in the normal map are crevices too
    ao *= np.clip(0.35 + nz * 0.75, 0, 1)
    return np.clip(gauss(ao, 0.8), 0.2, 1.0)


def roughness(spec, skin, part, alb=None):
    s = spec[..., 0].astype(np.float32)
    s = s / max(8.0, np.percentile(s, 99.5))
    s = np.clip(s, 0, 1) ** 0.6
    if part == "head":
        # skin 0.62..0.42 by its specular; the eyes, lips and nose tip, the brightest specular, go to 0.12-0.3
        base = 0.62 - 0.2 * s
        wet = np.clip((s - 0.72) / 0.2, 0, 1)
        r = base * (1 - wet) + 0.16 * wet
        r = r * skin + (0.78 - 0.4 * s) * (1 - skin)       # hair and brows on the head sheet: soft sheen
        if alb is not None:                                 # eyeballs and teeth: pale, unsaturated, not skin - always wet
            a = alb.astype(np.float32); y = a.mean(-1); ch = a.max(-1) - a.min(-1)
            wetw = np.clip((y - 150) / 30, 0, 1) * np.clip((70 - ch) / 25, 0, 1) * (1 - skin)
            r = r * (1 - wetw) + 0.1 * wetw
    else:
        cloth = 0.92 - 0.45 * s                             # wool and cotton matte; shoes, belts and buttons, high specular, glossy
        r = cloth * (1 - skin) + (0.58 - 0.12 * s) * skin
    return np.clip(r, 0.06, 1.0)


def enc(im, fmt="JPEG", q=88):
    out = io.BytesIO()
    im.save(out, fmt, quality=q, optimize=True) if fmt == "JPEG" else im.save(out, fmt, optimize=True)
    return out.getvalue()


def find_spec(rb, prefix):
    for root, _, files in os.walk(os.path.join(rb, "Assets", "Avatars")):
        if prefix + "_specular.tga" in files: return os.path.join(root, prefix + "_specular.tga")
    return None


def build(rb, data, out_path, spec_cache):
    j, binb = read_glb(data)
    def add_image(blob, mime):
        while len(binb) % 4: binb.append(0)
        j["bufferViews"].append({"buffer": 0, "byteOffset": len(binb), "byteLength": len(blob)})
        binb.extend(blob)
        j["images"].append({"bufferView": len(j["bufferViews"]) - 1, "mimeType": mime})
        j["textures"].append({"sampler": 0, "source": len(j["images"]) - 1})
        return len(j["textures"]) - 1
    report = []
    used = {p.get("material") for mesh in j["meshes"] for p in mesh["primitives"]}
    ref = None
    for mi in sorted(used):
        m = j["materials"][mi]
        if m["name"].endswith("_head") and "baseColorTexture" in m.get("pbrMetallicRoughness", {}):
            h = np.asarray(image_of(j, binb, m["pbrMetallicRoughness"]["baseColorTexture"]["index"]).convert("RGB").resize((256, 256)))
            sm = skin_mask(h) > 0.8
            if sm.sum() > 200: ref = np.median(lab(h[sm]), axis=0)
    for mi, m in enumerate(j["materials"]):
        if mi not in used: continue
        name = m["name"]; prefix = name.replace("graft_", ""); part = prefix.split("_", 1)[1] if "_" in prefix else ""
        pbr = m.setdefault("pbrMetallicRoughness", {})
        pbr["metallicFactor"] = 0.0
        if part == "opacity":
            pbr["roughnessFactor"] = 0.45
            m["extras"] = {"shigoto": {"kind": "hair"}}
            report.append(name + ":hair"); continue
        if part == "glasses":
            pbr["roughnessFactor"] = 0.08
            m["extras"] = {"shigoto": {"kind": "glass"}}
            report.append(name + ":glass"); continue
        if "baseColorTexture" not in pbr or "normalTexture" not in m:
            report.append(name + ":no-maps"); continue
        sp = spec_cache.setdefault(prefix, find_spec(rb, prefix))
        alb = np.asarray(image_of(j, binb, pbr["baseColorTexture"]["index"]).convert("RGB").resize((ORM_SIZE, ORM_SIZE), Image.LANCZOS))
        nrm = np.asarray(image_of(j, binb, m["normalTexture"]["index"]).convert("RGB"))
        skin = skin_mask(alb)
        if part == "body" and ref is not None: skin = gauss(skin * near_skin(alb, ref), 1.0)
        if sp:
            spec = np.asarray(Image.open(sp).convert("RGB").resize((ORM_SIZE, ORM_SIZE), Image.LANCZOS))
        else:                                                    # no specular map: a guess from the colour map's brightness
            spec = np.repeat((np.asarray(Image.fromarray(alb).convert("L")) * 0.12)[..., None], 3, 2).astype(np.uint8)
        rough = roughness(spec, skin, part, alb)
        ao = ao_from_normal(nrm, ORM_SIZE)
        orm = np.stack([ao, rough, skin], -1)
        ti = add_image(enc(Image.fromarray((orm * 255 + 0.5).astype(np.uint8), "RGB")), "image/jpeg")
        pbr["metallicRoughnessTexture"] = {"index": ti}
        pbr["roughnessFactor"] = 1.0
        m["occlusionTexture"] = {"index": ti, "strength": 1.0}
        m["extras"] = {"shigoto": {"kind": "skin-atlas" if part == "body" else "head", "orm": "R=occlusion G=roughness B=skinMask",
                                   "specular": os.path.basename(sp) if sp else None}}
        report.append("%s:%s skin %.0f%% rough %.2f ao %.2f" % (name, "spec" if sp else "guess", skin.mean() * 100, rough.mean(), ao.mean()))
    j.setdefault("asset", {})["generator"] = "Salary Man build_real_people.py (Shigoto characters)"
    write_glb(out_path, j, binb)
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rocketbox", required=True)
    ap.add_argument("--base", help="folder of base .glb files (default: Web/people at git commit %s)" % BASE_COMMIT)
    ap.add_argument("--out", default=os.path.join(REPO, "Web/people/real"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    git = lambda *args: subprocess.run(["git", "-C", REPO] + list(args), check=True, capture_output=True).stdout
    if a.base:
        index = json.load(open(os.path.join(a.base, "index.json")))
        load = lambda f: open(os.path.join(a.base, f), "rb").read()
    else:
        index = json.loads(git("show", BASE_COMMIT + ":Web/people/index.json"))
        load = lambda f: git("show", BASE_COMMIT + ":Web/people/" + f)
    files = [e["file"] for e in index["people"]] + sorted({o["file"] for o in index.get("outfits", [])} | {index.get("player")} - {None})
    cache = {}
    for f in files:
        out = os.path.join(a.out, f)
        rep = build(a.rocketbox, load(f), out, cache)
        print("%-24s %5d KB  %s" % (f, os.path.getsize(out) // 1024, "; ".join(rep)))
    for e in index["people"]:
        e["bytes"] = os.path.getsize(os.path.join(a.out, e["file"]))
        e["identity"] = ROLES.get(e["name"], e["name"].replace("_", " ").title())
        e["pbr"] = ["albedo", "normal", "roughness", "occlusion"]
    index["anime"] = False
    index["real"] = True
    index["shigoto"] = {"characters": 1, "orm": "R=occlusion G=roughness B=skinMask"}
    index["source"] = "Microsoft Rocketbox avatar library (MIT), see LICENSE-Rocketbox.md"
    json.dump(index, open(os.path.join(a.out, "index.json"), "w"), indent=1)
    print("wrote", len(files), "models to", a.out)


if __name__ == "__main__":
    main()
