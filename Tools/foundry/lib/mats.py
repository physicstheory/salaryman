"""The Foundry material library.

Every material the generators use is named here once, with:
  recipe  - the texgen recipe + params used when no photoscan is available (also the source for man-made finishes)
  scan    - optional Poly Haven asset id (CC0). Tools/foundry/fetch_textures.py downloads these in the cloud build;
            when Tools/foundry/cache/scan/<id>/ exists the scan replaces the recipe.
  tile    - metres covered by one texture tile (world_uv uses it so every surface is at real scale)
  px      - texture size in the exported model
Special kinds: glass (alpha blend), emit (lamps / screens, emissive), and 'vc' (multiply by the baked AO vertex colour).

All materials are exported as plain glTF metallic-roughness with base colour, normal and ORM maps (R occlusion,
G roughness, B metal), which three.js r128 and the AAA gate both expect.
"""
import os
import sys
import bpy
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import texgen  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, ".."))
CACHE = os.path.join(ROOT, "cache")
TEXDIR = os.path.join(CACHE, "tex")
SCANDIR = os.path.join(CACHE, "scan")

LIB = {
    # metals
    "stainless":      dict(recipe=("brushed", dict(col="#c4c8cc", rough=0.30)), tile=1.2, px=1024),
    "stainless_dull": dict(recipe=("brushed", dict(col="#a8acb0", rough=0.45)), tile=1.2, px=1024),
    "aluminium":      dict(recipe=("brushed", dict(col="#d0d2d4", rough=0.38)), tile=0.8, px=1024),
    "chrome":         dict(recipe=("brushed", dict(col="#e6e8ea", rough=0.08)), tile=0.5, px=512),
    "steel_dark":     dict(recipe=("grime", dict(col="#2c2c2e", rough=0.6)), tile=1.0, px=1024, scan="rusty_metal_02"),
    "bogie":          dict(recipe=("grime", dict(col="#232326", rough=0.7)), tile=1.0, px=1024, scan="metal_plate"),
    "galvanised":     dict(recipe=("brushed", dict(col="#9da2a5", rough=0.55)), tile=1.0, px=1024, scan="metal_plate_02"),
    "cast_iron":      dict(recipe=("grime", dict(col="#1e1e20", rough=0.65)), tile=0.6, px=1024),
    # paints
    "paint_green":    dict(recipe=("paint", dict(col="#1f8a44", rough=0.25)), tile=1.0, px=512),
    "paint_white":    dict(recipe=("paint", dict(col="#eeeeea", rough=0.22)), tile=1.0, px=1024),
    "paint_blue":     dict(recipe=("paint", dict(col="#1a3b8a", rough=0.22)), tile=1.0, px=512),
    "paint_grey":     dict(recipe=("paint", dict(col="#6c7076", rough=0.4, wear=0.3)), tile=1.0, px=1024),
    "paint_black":    dict(recipe=("paint", dict(col="#141416", rough=0.35, wear=0.2)), tile=1.0, px=512),
    "paint_red":      dict(recipe=("paint", dict(col="#b01e22", rough=0.3, wear=0.2)), tile=1.0, px=512),
    "paint_yellow":   dict(recipe=("paint", dict(col="#e8b81a", rough=0.35, wear=0.3)), tile=1.0, px=512),
    "paint_cream":    dict(recipe=("paint", dict(col="#e4dcc8", rough=0.4, wear=0.2)), tile=1.0, px=512),
    "powder_grey":    dict(recipe=("paint", dict(col="#8a8e92", rough=0.55, peel=1.4, wear=0.4)), tile=0.8, px=1024),
    # plastics / rubber
    "plastic_white":  dict(recipe=("plastic", dict(col="#e9e8e2", rough=0.4)), tile=0.6, px=512),
    "plastic_grey":   dict(recipe=("plastic", dict(col="#8c8e90", rough=0.5)), tile=0.6, px=512),
    "plastic_black":  dict(recipe=("plastic", dict(col="#18181a", rough=0.5)), tile=0.6, px=512),
    "rubber":         dict(recipe=("rubber", dict(col="#161618", rough=0.88)), tile=0.5, px=512),
    "gangway":        dict(recipe=("rubber", dict(col="#202022", rough=0.9)), tile=0.4, px=512),
    # building / ground
    "concrete":       dict(recipe=("concrete", dict(col="#a29f97")), tile=2.5, px=1024, scan="concrete_wall_008"),
    "concrete_dark":  dict(recipe=("concrete", dict(col="#6e6c68")), tile=2.5, px=1024, scan="concrete_floor_02"),
    "platform":       dict(recipe=("terrazzo", dict(col="#a9a59c", rough=0.55)), tile=1.2, px=1024, scan="concrete_floor_worn_001"),
    "tactile":        dict(recipe=("tactile", dict()), tile=0.3, px=512),
    "tiles_white":    dict(recipe=("tiles", dict(col="#e6e4de", count=4)), tile=0.6, px=1024),
    "tiles_wall":     dict(recipe=("tiles", dict(col="#d2cfc6", count=8)), tile=0.9, px=1024),
    "ballast":        dict(recipe=("concrete", dict(col="#6a6660", rough=0.95)), tile=1.5, px=1024, scan="gravel_stones"),
    "sleeper":        dict(recipe=("concrete", dict(col="#8a8780")), tile=1.0, px=512, scan="concrete_floor_worn_001"),
    "plaster":        dict(recipe=("concrete", dict(col="#d9d4c8", rough=0.9)), tile=2.0, px=1024, scan="painted_plaster_wall"),
    "brick":          dict(recipe=("tiles", dict(col="#7a3a28", grout="#8a8478", count=8, rough=0.85)), tile=1.0, px=1024, scan="red_brick_03"),
    "asphalt":        dict(recipe=("concrete", dict(col="#3a3a3a", rough=0.92)), tile=3.0, px=1024, scan="asphalt_02"),
    # wood / fabric
    "wood_oak":       dict(recipe=("wood", dict(col="#8a6440")), tile=1.0, px=1024, scan="oak_veneer_01"),
    "wood_dark":      dict(recipe=("wood", dict(col="#3e2a1c")), tile=1.0, px=1024, scan="dark_wood"),
    "seat_moquette":  dict(recipe=("fabric", dict(col="#3b4f8a", weave=120)), tile=0.4, px=512, scan="fabric_pattern_07"),
    "seat_moquette_green": dict(recipe=("fabric", dict(col="#3d6b45", weave=120)), tile=0.4, px=512),
    "fabric_grey":    dict(recipe=("fabric", dict(col="#55585e", weave=120)), tile=0.4, px=512),
    "leather_black":  dict(recipe=("leather", dict(col="#141210")), tile=0.4, px=512),
    "floor_vinyl":    dict(recipe=("terrazzo", dict(col="#6e6a62", rough=0.5)), tile=1.0, px=1024),
    # special
    # interiors (the rooms seen through every city window, Tools/foundry/gen/rooms.py)
    "carpet_tile":    dict(recipe=("fabric", dict(col="#4a4e56", weave=60)), tile=0.5, px=512),
    "carpet_blue":    dict(recipe=("fabric", dict(col="#2e3a52", weave=60)), tile=0.5, px=512),
    "carpet_warm":    dict(recipe=("fabric", dict(col="#7a6248", weave=80)), tile=0.5, px=512),
    "tatami":         dict(recipe=("fabric", dict(col="#b5a86a", weave=40)), tile=0.9, px=512),
    "wallpaper":      dict(recipe=("concrete", dict(col="#e6e1d6", rough=0.92)), tile=1.5, px=512),
    "ceiling_board":  dict(recipe=("tiles", dict(col="#e8e6e0", grout="#c8c6c0", count=2, rough=0.9)), tile=1.2, px=512),
    "floor_lino":     dict(recipe=("terrazzo", dict(col="#c9c6bc", rough=0.4)), tile=1.0, px=512),
    "glass":          dict(kind="glass", col=(0.04, 0.05, 0.055), alpha=0.42, rough=0.04),
    "glass_dark":     dict(kind="glass", col=(0.01, 0.012, 0.014), alpha=0.82, rough=0.04),
    "glass_clear":    dict(kind="glass", col=(0.6, 0.66, 0.68), alpha=0.18, rough=0.03),
    "light_head":     dict(kind="emit", col=(1.0, 0.97, 0.9), strength=1.0),
    "light_tail":     dict(kind="emit", col=(0.9, 0.05, 0.03), strength=1.0),
    "light_panel":    dict(kind="emit", col=(0.95, 0.96, 1.0), strength=1.0),
    "screen_dest":    dict(kind="emit", col=(1.0, 0.55, 0.1), strength=1.0),
}

_made = {}
PX_CAP = [4096]          # a generator can lower this (small or far-seen models: 512); the gate's floor is 512


def _scan_maps(sid, px):
    d = os.path.join(SCANDIR, sid)
    if not os.path.isdir(d):
        return None
    def f(*names):
        for n in names:
            for ext in (".jpg", ".png"):
                p = os.path.join(d, n + ext)
                if os.path.exists(p):
                    return p
        return None
    col, nor = f("diff", "col", "albedo"), f("nor_gl", "nor", "normal")
    if not col or not nor:
        return None
    rough, ao, arm = f("rough"), f("ao"), f("arm")
    open_ = lambda p, m: Image.open(p).convert(m).resize((px, px), Image.LANCZOS)
    out = {"albedo": open_(col, "RGB"), "normal": open_(nor, "RGB")}
    if arm:
        a = open_(arm, "RGB")
        out["orm"] = a
    else:
        r = open_(rough, "L") if rough else Image.new("L", (px, px), 200)
        o = open_(ao, "L") if ao else Image.new("L", (px, px), 255)
        out["orm"] = Image.merge("RGB", (o, r, Image.new("L", (px, px), 0)))
    return out


def texture_set(key):
    """-> paths {albedo, normal, orm} on disk (cached)."""
    spec = LIB[key]
    px = max(512, min(spec.get("px", 1024), PX_CAP[0]))
    os.makedirs(TEXDIR, exist_ok=True)
    paths = {k: os.path.join(TEXDIR, "%s_%d_%s.jpg" % (key, px, k)) for k in ("albedo", "normal", "orm")}
    src = "scan:" + spec["scan"] if spec.get("scan") and os.path.isdir(os.path.join(SCANDIR, spec["scan"])) else "gen"
    stamp = os.path.join(TEXDIR, key + ".src")
    if all(os.path.exists(p) for p in paths.values()) and os.path.exists(stamp) and open(stamp).read() == src + str(px):
        return paths
    maps = _scan_maps(spec["scan"], px) if src.startswith("scan") else None
    if maps is None:
        recipe, kw = spec["recipe"]
        t = texgen.make(recipe, px, seed=abs(hash(key)) % 9973, **kw)
        orm = Image.merge("RGB", (Image.new("L", (px, px), 255), t["rough"], t["metal"]))
        maps = {"albedo": t["albedo"], "normal": t["normal"], "orm": orm}
    for k, p in paths.items():
        maps[k].save(p, quality=90)
    open(stamp, "w").write(src + str(px))
    return paths


def _img(path, colour):
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    return im


def _settings_group():
    g = bpy.data.node_groups.get("glTF Material Output")
    if g:
        return g
    g = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g.nodes.new("NodeGroupInput")
    return g


def tile_of(name):
    return LIB.get(name, {}).get("tile", 1.0)


def get(key, vc_ao=True, name=None):
    """A bpy material for library key `key` (cached). vc_ao: multiply base colour by the 'AO' colour attribute."""
    nm = name or key
    if nm in _made:
        return _made[nm]
    spec = LIB[key]
    m = bpy.data.materials.new(nm)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    out = nt.nodes.get("Material Output")
    kind = spec.get("kind", "pbr")
    m.use_backface_culling = kind != "glass"
    if kind == "glass":
        bsdf.inputs["Base Color"].default_value = (*spec["col"], 1)
        bsdf.inputs["Roughness"].default_value = spec["rough"]
        bsdf.inputs["Alpha"].default_value = spec["alpha"]
        try:
            m.surface_render_method = "BLENDED"
        except Exception:
            pass
        m.blend_method = "BLEND" if hasattr(m, "blend_method") else None
    elif kind == "emit":
        bsdf.inputs["Base Color"].default_value = (*spec["col"], 1)
        bsdf.inputs["Emission Color"].default_value = (*spec["col"], 1)
        bsdf.inputs["Emission Strength"].default_value = spec.get("strength", 1.0)
        bsdf.inputs["Roughness"].default_value = 0.2
    else:
        p = texture_set(key)
        tc = nt.nodes.new("ShaderNodeTexImage"); tc.image = _img(p["albedo"], True)
        tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = _img(p["normal"], False)
        to = nt.nodes.new("ShaderNodeTexImage"); to.image = _img(p["orm"], False)
        nm_ = nt.nodes.new("ShaderNodeNormalMap")
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(tn.outputs["Color"], nm_.inputs["Color"])
        nt.links.new(nm_.outputs["Normal"], bsdf.inputs["Normal"])
        nt.links.new(to.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        if vc_ao:
            ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "AO"
            mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            nt.links.new(tc.outputs["Color"], mix.inputs[6])
            nt.links.new(ca.outputs["Color"], mix.inputs[7])
            nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
        else:
            nt.links.new(tc.outputs["Color"], bsdf.inputs["Base Color"])
        gs = nt.nodes.new("ShaderNodeGroup"); gs.node_tree = _settings_group()
        nt.links.new(sep.outputs["Red"], gs.inputs["Occlusion"])
    _made[nm] = m
    return m


def tiles_for(objs):
    """{material name: tile metres} for world_uv."""
    t = {}
    for o in objs:
        if o.type != "MESH":
            continue
        for m in o.data.materials:
            if m:
                base = m.name.split(".")[0]
                t[m.name] = LIB.get(base, {}).get("tile", 1.0)
    return t
