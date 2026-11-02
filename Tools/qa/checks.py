"""The AAA gate's checks. Each check adds findings to the context:

    ctx.fail(category, key, where, problem, fix)   blocks the push (unless the key is known debt)
    ctx.warn(category, key, where, problem, fix)   advice only

`key` is a stable fingerprint so the baseline can tell old debt from a new regression.
Keep fixes as direct instructions: they are read by ChatGPT/Codex and Claude, not by a person.
"""
import glob
import hashlib
import io
import json
import os
import re
import statistics

from glb import GLB, image_size

try:
    from PIL import Image
    import numpy as np
except ImportError:  # the gate refuses to run without them, see aaa_gate.py
    Image = None
    np = None


# ---------------------------------------------------------------------------------------------
# texture analysis (cached by image hash, so re-runs are near-instant)

class TexCache:
    def __init__(self, path):
        self.path, self.dirty = path, False
        try:
            with open(path) as f:
                self.d = json.load(f)
        except Exception:
            self.d = {}

    def save(self):
        if self.dirty:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(self.path, "w") as f:
                json.dump(self.d, f)

    def stats(self, data):
        if not data:
            return None
        h = hashlib.sha1(data).hexdigest()
        if h in self.d:
            return self.d[h]
        try:
            im = Image.open(io.BytesIO(data))
            w, h0 = im.size
            im = im.convert("RGB")
            im.thumbnail((384, 384))
            a = np.asarray(im).astype(np.float32)
        except Exception as e:
            r = {"error": str(e)}
            self.d[h] = r; self.dirty = True
            return r
        g = a.mean(2)
        gm = np.abs(np.diff(g, axis=1))[:-1] + np.abs(np.diff(g, axis=0))[:, :-1]
        mask = g[:-1, :-1] > 8
        if mask.sum() < 50:
            mask = np.ones_like(mask, bool)
        q = (a[:-1, :-1][mask] // 8).astype(np.int32)
        r = {
            "w": w, "h": h0,
            "mean": [float(a[..., i].mean()) for i in range(3)],
            "std": [float(a[..., i].std()) for i in range(3)],
            "flat": float((gm[mask] < 0.75).mean()),
            "detail": float(gm[mask].mean()),
            "uniq": int(len(np.unique(q[:, 0] * 1024 + q[:, 1] * 32 + q[:, 2]))),
        }
        self.d[h] = r; self.dirty = True
        return r


def short(path, root):
    return os.path.relpath(path, root).replace(os.sep, "/")


def glbs(root, d):
    return sorted(glob.glob(os.path.join(root, d, "**", "*.glb"), recursive=True))


# ---------------------------------------------------------------------------------------------
# 1. PBR textures

def check_pbr(ctx):
    R = ctx.rules["pbr"]
    banned = set(R["banned_extensions"])
    for d in R["asset_dirs"]:
        is_char = "people" in d
        is_car = "cars" in d
        for p in glbs(ctx.root, d):
            rel = short(p, ctx.root)
            try:
                g = ctx.glb(p)
            except Exception as e:
                ctx.fail("pbr", "glb-broken:" + rel, rel, "the file is not a readable .glb (%s)" % e,
                         "Re-export it as binary glTF 2.0 (.glb) with embedded textures.")
                continue
            bad = banned & g.ext_used
            if bad:
                ctx.fail("pbr", "unlit:" + rel, rel, "uses %s, which ignores lighting (flat / toon look)" % ", ".join(sorted(bad)),
                         "Re-export with ordinary metallic-roughness PBR materials: base colour + normal + roughness/metalness (ORM) textures, no unlit or MToon shaders.")
            min_px = R["min_character_texture_px"] if is_char else R["min_texture_px"]
            for mi, m in enumerate(g.materials):
                name = m.get("name") or "#%d" % mi
                mp = g.material_maps(m)
                pb = m.get("pbrMetallicRoughness", {}) or {}
                alpha = (pb.get("baseColorFactor") or [1, 1, 1, 1])[3]
                transparent = m.get("alphaMode") == "BLEND" or alpha < 0.95 or "KHR_materials_transmission" in (m.get("extensions") or {})
                emissive_only = mp["emissive"] is not None or (m.get("emissiveFactor") and max(m["emissiveFactor"]) > 0.2)
                where = "%s  material '%s'" % (rel, name)
                if transparent or re.search(r"opacity|glass|lash|alpha|light|lamp|signal|stop|bohlam|luz|eye", name, re.I):
                    continue  # glass, lashes, lamps: a colour can be right here
                if is_car:
                    # car paint, chrome and rubber are legitimately factor-driven, but must be real PBR values
                    if "roughnessFactor" not in pb and mp["mr"] is None and re.search(r"paint|body|chrome|rim|velg|tyre|tire|rubber", name, re.I):
                        ctx.warn("pbr", "car-default-rough:%s:%s" % (rel, name), where, "no roughness set (defaults to fully rough, looks like clay)",
                                 "Set a roughness for this material (paint 0.15-0.35 with clearcoat, chrome 0.05-0.2, rubber 0.8-0.95).")
                    continue
                if mp["base"] is None:
                    if emissive_only:
                        continue
                    ctx.fail("pbr", "bare-material:%s:%s" % (rel, name), where, "has no textures at all, only a flat colour",
                             "Give it a full PBR texture set (base colour, normal, roughness/ORM) at %dpx or more. Generate tileable maps (ChatGPT image, ambientCG or Poly Haven) and assign them in the model before exporting." % min_px)
                    continue
                missing = [k for k, v in (("normal", mp["normal"]), ("roughness/ORM", mp["mr"])) if v is None]
                if missing:
                    ctx.fail("pbr", "maps-missing:%s:%s" % (rel, name), where, "has a base colour texture but no %s map" % " or ".join(missing),
                             "Add the missing %s map (same UVs and resolution as the base colour) and wire it into the material. For characters: Tools/characters/build_real_people.py makes the ORM map." % " and ".join(missing))
                for kind in ("base", "normal", "mr"):
                    if mp[kind] is None:
                        continue
                    data, _ = g.image_bytes(mp[kind])
                    sz = image_size(data)
                    if sz and max(sz) < min_px:
                        ctx.fail("pbr", "lowres:%s:%s:%s" % (rel, name, kind), where, "%s texture is only %dx%d" % (kind, sz[0], sz[1]),
                                 "Replace it with a %dpx-or-larger version (upscale with a proper upscaler or regenerate; do not just resample)." % (min_px * 2 if is_char else min_px))
                    st = ctx.tex.stats(data)
                    if st and "error" in st:
                        ctx.fail("pbr", "tex-broken:%s:%s:%s" % (rel, name, kind), where, "%s texture does not decode (%s)" % (kind, st["error"]),
                                 "Re-export the texture as PNG or JPEG.")
                        continue
                    if kind == "normal" and st:
                        if max(st["std"][0], st["std"][1]) < R["normal_map_min_std"]:
                            ctx.warn("pbr", "flat-normal:%s:%s" % (rel, name), where, "normal map is flat (no surface detail)",
                                     "Bake or generate a real tangent-space normal map with surface detail (pores, weave, grain).")
                        elif st["mean"][2] < R["normal_map_min_blue"]:
                            ctx.warn("pbr", "odd-normal:%s:%s" % (rel, name), where, "normal map is not blue-ish, so it may be object-space or a colour map in the wrong slot",
                                     "Make sure the normal slot holds a tangent-space normal map (mostly lilac/blue).")
                    if kind == "mr" and st and st["std"][1] < R["roughness_map_min_std"]:
                        ctx.warn("pbr", "flat-rough:%s:%s" % (rel, name), where, "roughness map is a single value",
                                 "Paint roughness variation (wear, oil, grime) into the G channel of the ORM map.")

    # loose texture libraries used by the code (terrain, interiors, facades, roads)
    for d in R["texture_dirs"]:
        files = sorted(f for f in glob.glob(os.path.join(ctx.root, d, "*")) if re.search(r"\.(jpe?g|png|webp)$", f, re.I))
        names = {os.path.splitext(os.path.basename(f))[0].lower(): f for f in files}
        for stem, f in names.items():
            if re.search(r"(_nor|_normal|_nrm|_rough|_arm|_orm|_ao|_lights|_disp|_height)$", stem):
                continue
            base = re.sub(r"(_color|_col|_diff|_albedo|_basecolor)$", "", stem)
            have_n = any(base + s in names for s in ("_nor", "_normal", "_nrm"))
            have_r = any(base + s in names for s in ("_rough", "_arm", "_orm"))
            rel = short(f, ctx.root)
            if not have_n or not have_r:
                need = [x for x, ok in (("normal (%s_nor.jpg)" % base, have_n), ("roughness (%s_rough.jpg or _arm.jpg)" % base, have_r)) if not ok]
                ctx.fail("pbr", "texset:%s/%s" % (d, base), rel, "surface texture has no %s map" % " or ".join(need),
                         "Add %s next to it at the same resolution (ChatGPT image or Poly Haven/ambientCG source), then load it as normalMap/roughnessMap wherever this texture is used." % " and ".join(need))
            sz = image_size(open(f, "rb").read(65536))
            if sz and max(sz) < R["min_texture_px"]:
                ctx.fail("pbr", "texlow:%s" % rel, rel, "only %dx%d" % sz, "Replace with a 1024px+ tileable texture.")

    check_code_primitives(ctx)


# ---------------------------------------------------------------------------------------------
# 1b. bare primitives in code: a box/plane/cylinder with a colour-only material

MAT_RE = re.compile(r"new THREE\.Mesh(Lambert|Phong|Standard|Physical)Material\(")


def _balanced(s, i):
    depth, j = 0, i
    while j < len(s):
        c = s[j]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return s[i + 1:j]
        j += 1
    return s[i + 1:i + 400]


def check_code_primitives(ctx):
    R = ctx.rules["pbr"]
    files = []
    for d in R["code_dirs"]:
        p = os.path.join(ctx.root, d)
        if os.path.isfile(p):
            files.append(p)
        else:
            files += sorted(glob.glob(os.path.join(p, "**", "*.js"), recursive=True)) + sorted(glob.glob(os.path.join(p, "**", "*.html"), recursive=True))
    waivers = 0
    for f in files:
        rel = short(f, ctx.root)
        if "/vendor/" in rel or rel.endswith(".min.js") or rel == "Web/engine/shigoto.js":
            continue
        try:
            src = open(f, encoding="utf-8", errors="replace").read()
        except Exception:
            continue
        lines = src.split("\n")
        seen = {}
        line_starts = [0]
        for ln in lines:
            line_starts.append(line_starts[-1] + len(ln) + 1)
        import bisect
        for m in MAT_RE.finditer(src):
            arg = _balanced(src, m.end() - 1)
            a = arg.strip()
            if not a.startswith("{"):
                continue  # a variable or helper we cannot see into
            if re.search(r"\b(map|vertexColors|emissiveMap|normalMap)\b", a):
                continue
            if re.search(r"\bemissive\s*:", a) or re.search(r"transparent\s*:\s*true", a) and re.search(r"opacity\s*:\s*0?\.[0-6]", a):
                continue  # lamps, screens, glass: colour is the point
            lno = bisect.bisect_right(line_starts, m.start())
            line = lines[lno - 1]
            if R["waiver_tag"] in line:
                waivers += 1
                continue
            norm = re.sub(r"\s+", " ", m.group(1) + a)  # fingerprint the material itself, so edits elsewhere on the line don't count
            h = hashlib.sha1(norm.encode()).hexdigest()[:10]
            seen[h] = seen.get(h, 0) + 1
            key = "code-bare:%s:%s:%d" % (rel, h, seen[h])
            snippet = ("new THREE.Mesh%sMaterial(%s)" % (m.group(1), a))[:110]
            ctx.fail("pbr", key, "%s:%d" % (rel, lno), "colour-only material on generated geometry: %s" % snippet,
                     "Texture it: give the material a map + normalMap + roughnessMap from a tileable PBR set (Web/art/... or a new ChatGPT/Poly Haven texture), set texture.repeat to world scale, or replace the primitive with a textured .glb model. If it truly must stay a flat colour (an indicator light, a UI marker), add a comment on that line: // %s <reason>" % R["waiver_tag"])
    ctx.info["code_waivers"] = waivers


# ---------------------------------------------------------------------------------------------
# 2. characters

def check_characters(ctx):
    R = ctx.rules["characters"]
    ix_path = os.path.join(ctx.root, R["index"])
    konto = ctx.read("Web/konto.html")
    if not re.search(r"people/real/", konto) or not re.search(r"function peopleReal\(\)\s*\{\s*return\s*!", konto):
        ctx.fail("characters", "cast-default", "Web/konto.html", "the game does not load the hyper-realistic cast (people/real) by default",
                 "Keep peopleReal() returning true unless ?cast=anime is in the URL, and load people/real/index.json first. Art direction (Duncan, 2026-11-01): hyper-realistic characters only.")
    if not os.path.exists(ix_path):
        ctx.fail("characters", "cast-missing", R["index"], "the realistic cast index is missing",
                 "Restore Web/people/real/ (built by Tools/characters/build_real_people.py) or add realistic models there with an index.json.")
        return
    ix = json.load(open(ix_path))
    people = ix.get("people", [])
    if len(people) < R["min_cast"]:
        ctx.fail("characters", "cast-small", R["index"], "only %d distinct people (need %d+ so crowds don't repeat)" % (len(people), R["min_cast"]),
                 "Add more realistic rigged people (Rocketbox, Meshy/Tripo with Mixamo rig) to Web/people/real and index.json.")
    for e in people:
        f = os.path.join(os.path.dirname(ix_path), e.get("file", ""))
        rel = short(f, ctx.root)
        hero = os.path.basename(f).startswith(R["hero_prefix"])
        if not os.path.exists(f):
            ctx.fail("characters", "char-missing:" + rel, R["index"], "index lists %s but the file is missing" % e.get("file"),
                     "Add the file or remove the entry.")
            continue
        g = ctx.glb(f)
        txt = json.dumps(g.json.get("materials", [])) + json.dumps([n.get("name", "") for n in g.nodes])
        marks = [mk for mk in R["anime_markers"] if mk in txt] + sorted(set(ctx.rules["pbr"]["banned_extensions"]) & g.ext_used)
        if marks:
            ctx.fail("characters", "anime:" + rel, rel, "looks like an anime/VRoid model (%s)" % ", ".join(marks[:4]),
                     "Replace it with a photoreal human: Rocketbox base, or a Meshy/Tripo realistic generation from a photo-real reference, rigged with Mixamo, then run Tools/characters/build_real_people.py so it gets ORM + skin mask maps.")
        if not g.skins:
            ctx.fail("characters", "unrigged:" + rel, rel, "has no skeleton", "Rig it (Mixamo auto-rig), then SHIGOTO.bipedNames() maps the bones.")
            continue
        bones = g.bone_names()
        if len(bones) < R["min_bones"]:
            ctx.fail("characters", "bones:" + rel, rel, "only %d bones (needs fingers, neck, head: %d+)" % (len(bones), R["min_bones"]),
                     "Re-rig with a full humanoid skeleton including fingers.")
        tris = g.triangles()
        if tris < R["min_tris"]:
            ctx.fail("characters", "tris:" + rel, rel, "only %d triangles: silhouette will look blocky" % tris,
                     "Use a model of at least %d triangles (AAA crowd 15k+, hero 25k+)." % R["aaa_tris"])
        elif tris < (R["hero_aaa_tris"] if hero else R["aaa_tris"]):
            ctx.warn("characters", "tris-aaa:" + rel, rel, "%d triangles is below AAA (%s target %d); the engine subdivides at high/ultra" % (tris, "hero" if hero else "crowd", R["hero_aaa_tris"] if hero else R["aaa_tris"]),
                     "When replacing, pick a denser model (Meshy/Tripo high-poly, or a scanned head).")
        # proportions: anime characters have long legs and big heads
        W = g.world_positions()
        def find(sfx):
            for k, v in W.items():
                if k in bones and re.search(r"(^|[ _])%s$" % sfx, k, re.I):
                    return v[1]
        pel, head = find("pelvis"), find("head")
        if pel and head and head > 0:
            ratio = pel / head
            if ratio > R["max_pelvis_ratio"]:
                ctx.fail("characters", "proportions:" + rel, rel, "stylised proportions: hips at %.0f%% of head height (real adults ~55-60%%)" % (ratio * 100),
                         "Use a realistically proportioned body (7-8 heads tall), not an anime/hero-stylised one.")
        # skin texture must look photographic: lots of colours, little flat fill
        best = None
        for m in g.materials:
            if not re.search(r"head|face|skin", m.get("name", ""), re.I):
                continue
            mp = g.material_maps(m)
            if mp["base"] is None:
                continue
            d, _ = g.image_bytes(mp["base"])
            st = ctx.tex.stats(d)
            if st and "error" not in st and (best is None or st["w"] * st["h"] > best[1]["w"] * best[1]["h"]):
                best = (m.get("name"), st)
        if best is None:
            ctx.fail("characters", "skin-tex:" + rel, rel, "no textured head/face/skin material found",
                     "The face must use a photographic skin texture with normal + ORM maps; name the material *_head or *_skin.")
        else:
            n, st = best
            if st["uniq"] < R["photo_min_unique_colours"] or st["flat"] > R["photo_max_flat_fraction"]:
                ctx.fail("characters", "skin-flat:" + rel, "%s  material '%s'" % (rel, n),
                         "face texture looks painted/cel-shaded, not photographic (%d colours, %.0f%% flat fill)" % (st["uniq"], st["flat"] * 100),
                         "Use a scanned or photo-sourced skin texture (pores, freckles, subtle redness). Meshy/Tripo: generate from a photo-real portrait reference, 2048px texture.")
            elif max(st["w"], st["h"]) < 2048:
                ctx.warn("characters", "skin-res:" + rel, "%s  material '%s'" % (rel, n), "face texture is %dpx; AAA faces use 2048-4096px" % max(st["w"], st["h"]),
                         "Swap in a 2048px+ face texture when the model is next replaced.")


# ---------------------------------------------------------------------------------------------
# 3. cars

def check_cars(ctx):
    R = ctx.rules["cars"]
    files = glbs(ctx.root, R["dir"])
    if len(files) < R["min_models"]:
        ctx.fail("cars", "car-variety", R["dir"], "only %d car models (need %d+ for believable traffic)" % (len(files), R["min_models"]),
                 "Add more realistic car .glb models (CC0/CC-BY from Sketchfab, Poly Haven) with a material named 'paint'.")
    for f in files:
        rel = short(f, ctx.root)
        g = ctx.glb(f)
        tris = g.triangles()
        names = [m.get("name", "") for m in g.materials]
        if tris < R["min_tris"]:
            ctx.fail("cars", "car-tris:" + rel, rel, "only %d triangles: reads as a toy" % tris,
                     "Replace with a detailed model (%d+ triangles, modelled wheels, glass, lights, interior)." % R["aaa_tris"])
        elif tris < R["aaa_tris"]:
            ctx.warn("cars", "car-tris-aaa:" + rel, rel, "%d triangles, AAA cars are %d+" % (tris, R["aaa_tris"]), "Prefer a denser model when replacing.")
        glass = any(re.search(r"glass|window|crystal|vidrio", n, re.I) for n in names) or any(
            (m.get("pbrMetallicRoughness", {}).get("baseColorFactor") or [1, 1, 1, 1])[3] < 0.95 or m.get("alphaMode") == "BLEND" for m in g.materials)
        if not glass:
            ctx.fail("cars", "car-glass:" + rel, rel, "no glass material: windows are opaque",
                     "Give the windows a transparent, low-roughness glass material (alphaMode BLEND or KHR_materials_transmission).")
        if not any(n.lower() == R["need_paint_named"] or n.lower().startswith("paint") for n in names):
            ctx.warn("cars", "car-paint:" + rel, rel, "no material named 'paint', so traffic can't recolour it",
                     "Rename the body material to 'paint' (the game finds it by that name).")
        if not any(re.search(r"light|lamp|luz|bohlam|signal|stop|head|tail", n, re.I) for n in names) and "bike" not in rel:
            ctx.warn("cars", "car-lights:" + rel, rel, "no separate light material: headlights/brake lights can't glow",
                     "Split head/tail lights into their own material so the game can make them emissive.")
    konto = ctx.read("Web/konto.html")
    if "function loadCarModels" not in konto:
        ctx.fail("cars", "traffic-models", "Web/konto.html", "traffic no longer loads the .glb car models",
                 "Traffic must draw the real car models (loadCarModels), not boxes.")


# ---------------------------------------------------------------------------------------------
# 4. buildings

def levels(ctx):
    d = os.path.join(ctx.root, ctx.rules["buildings"]["levels_dir"])
    for lv in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        cells = sorted(glob.glob(os.path.join(d, lv, "cells", "*.json")))
        if cells:
            yield lv, [(os.path.basename(c)[:-5], json.load(open(c))) for c in cells]


def check_buildings(ctx):
    R = ctx.rules["buildings"]
    for lv, cells in levels(ctx):
        b = [x for _, c in cells for x in c.get("buildings", [])]
        where = "Web/levels/%s/src" % lv
        if not b:
            continue
        styles = {x.get("style") for x in b}
        if len(styles) < R["min_styles"]:
            ctx.fail("buildings", "styles:" + lv, where, "only %d building styles (%s)" % (len(styles), ", ".join(sorted(map(str, styles)))),
                     "Mix at least %d facade styles in the level (shops, office, apartment, brick, concrete, tiled, glass...), then run node Engine/tools/bake-level.mjs %s." % (R["min_styles"], lv))
        fl = [x.get("floors", 1) for x in b]
        if len(fl) > 2 and statistics.pstdev(fl) < R["min_floor_stddev"]:
            ctx.fail("buildings", "skyline:" + lv, where, "building heights are too uniform (std %.1f floors)" % statistics.pstdev(fl),
                     "Vary floors (2-4 storey shophouses next to 8-14 storey mansions and towers) for a real skyline.")
        shops = [x for x in b if x.get("style") == "shops"]
        if shops:
            signed = sum(1 for x in shops if x.get("signFront")) / len(shops)
            if signed < R["min_signed_shop_fraction"]:
                ctx.fail("buildings", "signs:" + lv, where, "only %.0f%% of shops have a sign" % (signed * 100),
                         "Give shop buildings signFront (and vertical signs) so the street reads as a real Tokyo shopping street.")
    for kit in R["lowpoly_kits"]:
        files = glbs(ctx.root, kit)
        if files:
            tris = [ctx.glb(f).triangles() for f in files]
            if statistics.median(tris) < 5000:
                ctx.fail("buildings", "lowpoly-kit:" + kit, kit, "%d low-poly toy-kit buildings (median %d triangles, one colour-atlas texture) are still loaded by the game" % (len(files), statistics.median(tris)),
                         "Replace these with the engine's PBR facade buildings (Shigoto CellBuilder) or realistic building models with normal + roughness maps, then delete the kit.")
    # facade texture sets
    fdir = os.path.join(ctx.root, "Web/art/facades")
    sets = {}
    for f in glob.glob(os.path.join(fdir, "*.jpg")) + glob.glob(os.path.join(fdir, "*.png")):
        m = re.match(r"(.+?)_(color|normal|lights|rough|arm|orm)\.", os.path.basename(f))
        if m:
            sets.setdefault(m.group(1), set()).add({"arm": "rough", "orm": "rough"}.get(m.group(2), m.group(2)))
    for s, have in sorted(sets.items()):
        miss = [k for k in R["facade_sets_need"] if k not in have]
        if miss:
            ctx.fail("buildings", "facade:%s" % s, "Web/art/facades/%s_*" % s, "facade set is missing %s" % ", ".join(miss),
                     "Add Web/art/facades/%s_%s.jpg at the same resolution as %s_color.jpg and use it as roughnessMap in facadeMaterials() / the engine facade shader." % (s, miss[0], s))
    if not re.search(r"interior", ctx.read("Engine/src/world/CellBuilder.js") + ctx.read("Engine/src/render/Materials.js"), re.I):
        ctx.fail("buildings", "interior-mapping", "Engine/src/world", "facade shader lost interior-mapped windows",
                 "Keep the interior-mapped window shader: flat windows look painted on.")
    check_sign_fonts(ctx)


# ---------------------------------------------------------------------------------------------
# 5. street detail

def check_street(ctx):
    R = ctx.rules["street"]
    for lv, cells in levels(ctx):
        types = {}
        for name, c in cells:
            props = c.get("props", [])
            for p in props:
                types[p.get("type")] = types.get(p.get("type"), 0) + 1
            if c.get("roads") and c.get("buildings") and len(props) < R["min_props_per_street_cell"]:
                ctx.fail("street", "density:%s:%s" % (lv, name), "Web/levels/%s cell %s" % (lv, name),
                         "street cell has only %d props (need %d+): it reads empty" % (len(props), R["min_props_per_street_cell"]),
                         "Dress the pavements in Web/levels/%s/src: bicycles, vending machines, bins, rubbish bags, planters, cones, A-boards, aircon units, poles with wires, then node Engine/tools/bake-level.mjs %s." % (lv, lv))
        if len(types) < R["min_prop_types_per_level"]:
            ctx.fail("street", "variety:" + lv, "Web/levels/" + lv, "only %d kinds of street prop" % len(types),
                     "Add more kinds of street furniture (see Engine/src/world/Props.js), at least %d." % R["min_prop_types_per_level"])
        for t in R["required_prop_types"]:
            if types.get(t, 0) < R["min_count_each_required"]:
                ctx.fail("street", "need:%s:%s" % (lv, t), "Web/levels/" + lv, "only %d '%s' props in the whole level" % (types.get(t, 0), t),
                         "Place at least %d '%s' props along the streets of %s and re-bake." % (R["min_count_each_required"], t, lv))
    check_engine_props(ctx)


def check_engine_props(ctx):
    """Engine street props are detailed primitives; every part is drawn with a named texture slot (PropSlots.js) and
    every slot must be a full PBR set (base colour + normal + roughness) in Web/art/props/."""
    props, mats = ctx.read("Engine/src/world/Props.js"), ctx.read("Engine/src/render/Materials.js")
    if not props or not mats:
        return
    R = ctx.rules["street"]
    # old style: add("paint", ...) with a shared flat material. Any that come back must be textured materials.
    untextured = []
    for name in sorted(set(re.findall(r'add\("(\w+)"', props))):
        m = re.search(r"_%s\(\)\s*\{([^}]*)\}" % name, mats)
        if m and not re.search(r"\b(map|normalMap|roughnessMap)\b", m.group(1)):
            untextured.append(name)
    if untextured:
        ctx.fail("street", "engine-props-untextured", "Engine/src/world/Props.js + Engine/src/render/Materials.js",
                 "street-prop parts use flat-colour materials %s" % ", ".join(untextured),
                 "Draw every prop part with a texture slot from Engine/src/world/PropSlots.js (P.box(\"vending_body\", ...)), not a shared flat material; see docs/PROP_TEXTURES.md.")
    # the slot loader must give every slot all three maps
    body = re.search(r"_slot\(name\)\s*\{(.*?)\n  \}", mats, re.S)
    if not body or not all(re.search(r"\b%s\b" % k, body.group(1)) for k in ("map", "normalMap", "roughnessMap")):
        ctx.fail("street", "engine-props-loader", "Engine/src/render/Materials.js",
                 "the prop texture-slot loader (_slot) is missing or does not load map + normalMap + roughnessMap",
                 "Keep Materials._slot loading <slot>.jpg, <slot>_nor.jpg and <slot>_rough.jpg from Web/art/props/ for every prop part.")
    used = sorted(set(re.findall(r'\bP\.\w+\("(\w+)"', props)))
    slots_path = os.path.join(ctx.root, "Web/art/props/slots.json")
    try:
        slots = json.load(open(slots_path))["slots"]
    except Exception:
        slots = {}
    if len(used) < R.get("min_prop_slots", 0):
        ctx.fail("street", "prop-slots-few", "Engine/src/world/Props.js", "the props use only %d texture slots" % len(used),
                 "Keep the props detailed: at least %d named texture slots across them (see PropSlots.js)." % R["min_prop_slots"])
    missing = [u for u in used if u not in slots]
    if missing:
        ctx.fail("street", "prop-slots-unlisted", "Web/art/props/slots.json", "prop parts use slots not in slots.json: %s" % ", ".join(missing),
                 "Add them to Engine/src/world/PropSlots.js, run node Engine/tools/prop-slots.mjs and python3 Tools/props/make_prop_maps.py --placeholders.")
    stand_ins = []
    for sid in used:
        if sid not in slots:
            continue
        for suf in ("", "_nor", "_rough"):
            f = os.path.join(ctx.root, "Web/art/props", sid + suf + ".jpg")
            if not os.path.exists(f):
                ctx.fail("street", "prop-tex:%s%s" % (sid, suf), "Web/art/props/%s%s.jpg" % (sid, suf), "prop texture slot '%s' has no %s map" % (sid, {"": "base colour", "_nor": "normal", "_rough": "roughness"}[suf]),
                         "Paint it (docs/PROP_TEXTURES.md) and run python3 Tools/props/make_prop_maps.py %s, or run --placeholders for a stand-in." % sid)
                continue
            head = open(f, "rb").read(65536)
            sz = image_size(head)
            if sz and max(sz) < ctx.rules["pbr"]["min_texture_px"]:
                ctx.fail("street", "prop-texlow:%s%s" % (sid, suf), "Web/art/props/%s%s.jpg" % (sid, suf), "only %dx%d" % sz, "Paint it at %d px or more." % slots[sid].get("size", 512))
            if suf == "" and b"shigoto-placeholder" in head[:4096]:
                stand_ins.append(sid)
    if stand_ins:
        ctx.warn("street", "prop-stand-ins", "Web/art/props", "%d of %d prop texture slots are still procedural stand-ins: %s" % (len(stand_ins), len(used), ", ".join(stand_ins)),
                 "Paint them with ChatGPT one at a time following docs/PROP_TEXTURES.md, save as Web/art/props/<slot>.jpg and run python3 Tools/props/make_prop_maps.py <slot>.")


def check_sign_fonts(ctx):
    """Signs and adverts must not all share one typeface: the SignFonts library and its use by every sign painter."""
    R = ctx.rules.get("signs")
    if not R:
        return
    try:
        faces = json.load(open(os.path.join(ctx.root, "Web/art/signfonts/signfonts.json")))["fonts"]
    except Exception:
        faces = []
    have = [f for f in faces if os.path.exists(os.path.join(ctx.root, "Web/art/signfonts", f["file"]))]
    jp = [f for f in have if f.get("script") == "jp"]
    if len(have) < R["min_faces"] or len(jp) < R["min_jp_faces"]:
        ctx.fail("buildings", "sign-fonts", "Web/art/signfonts", "only %d sign typefaces (%d with Japanese)" % (len(have), len(jp)),
                 "Keep at least %d faces (%d Japanese) in the sign-font library: python3 Tools/fonts/build_sign_fonts.py (OFL/Apache faces only)." % (R["min_faces"], R["min_jp_faces"]))
    bad = [f["file"] for f in faces if f.get("license") not in ("OFL-1.1", "Apache-2.0")]
    if bad:
        ctx.fail("buildings", "sign-font-licence", "Web/art/signfonts", "fonts without an open licence: %s" % ", ".join(bad), "Use only SIL OFL 1.1 or Apache 2.0 fonts.")
    html = ctx.read("Web/konto.html")
    if "art/signfonts.js" not in html:
        ctx.fail("buildings", "sign-fonts-loaded", "Web/konto.html", "the game does not load art/signfonts.js", "Load art/signfonts/fonts.js and art/signfonts.js before the world is built.")
    src = {"Web/konto.html": html, "Engine/src/world/CellBuilder.js": ctx.read("Engine/src/world/CellBuilder.js")}
    for where, fn in R["painters"]:
        body = src.get(where, "")
        i = body.find(fn)
        seg = body[i:i + 4000] if i >= 0 else ""
        if i < 0:
            ctx.warn("buildings", "sign-painter-probe:" + fn, where, "could not find the sign painter %s" % fn, "Update the 'painters' list in Tools/qa/rules.json if it was renamed.")
        elif "SignFonts" not in seg:
            ctx.fail("buildings", "sign-painter:" + fn, where, "%s paints signs in one fixed font" % fn,
                     "Draw its lettering with SignFonts.style/text/vertical (Web/art/signfonts.js) so each sign gets its own typeface.")


# ---------------------------------------------------------------------------------------------
# 6. lived-in world

def check_lived_in(ctx):
    R = ctx.rules["lived_in"]
    konto = ctx.read("Web/konto.html")
    corpus = konto + "\n".join(ctx.read(short(f, ctx.root)) for f in glob.glob(os.path.join(ctx.root, "Engine/src/**/*.js"), recursive=True))
    for _, cells in levels(ctx):
        corpus += json.dumps([c for _, c in cells])
    m = re.search(r"function pedWanted\(\)\s*\{[^}]*?:\s*(\d+)\s*;\s*\}", konto)
    if not m:
        ctx.warn("lived_in", "peds-probe", "Web/konto.html", "could not find pedWanted() to read the crowd size",
                 "If pedestrian spawning moved, update the probe in Tools/qa/checks.py check_lived_in().")
    elif int(m.group(1)) < R["min_peds_high_tier"]:
        ctx.fail("lived_in", "peds", "Web/konto.html pedWanted()", "only %s pedestrians around the player on high settings" % m.group(1),
                 "Raise the crowd to %d+ on high (instance or impostor far crowds if it costs too much)." % R["min_peds_high_tier"])
    for label, rx in R["elements"].items():
        if not re.search(rx, corpus, re.I):
            ctx.fail("lived_in", "element:" + label, "world code + levels", "missing: %s" % label,
                     "Add %s to the streets (as level props, procedural dressing in konto.html, or engine props) so the city feels inhabited." % label)


ALL = [("pbr", check_pbr), ("characters", check_characters), ("cars", check_cars), ("buildings", check_buildings),
       ("street", check_street), ("lived_in", check_lived_in)]
