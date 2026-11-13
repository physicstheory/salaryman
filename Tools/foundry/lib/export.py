"""Finishing and export: baked AO in vertex colours, LOD chain, glTF binary, manifest entry."""
import json
import math
import os
import time
import bpy
import bmesh
from mathutils import Vector

from core import apply_all, bounds, tris, world_uv, join
import mats

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
OUT = os.path.join(REPO, "Web", "foundry")


def prep_ao(objs):
    for o in objs:
        me = o.data
        if "AO" not in me.color_attributes:
            me.color_attributes.new("AO", "BYTE_COLOR", "CORNER")
        me.color_attributes.active_color = me.color_attributes["AO"]


def bake_ao(objs, samples=48, distance=0.6, densify=0.0):
    """Ambient occlusion baked into the 'AO' colour attribute with Cycles: the cheap contact shadow that makes a
    model sit in the world (under the roof units, inside door pockets, between bogie and body)."""
    objs = [o for o in objs if o.type == "MESH"]
    if densify > 0:
        for o in objs:
            bm = bmesh.new(); bm.from_mesh(o.data)
            long = [e for e in bm.edges if e.calc_length() > densify]
            if long:
                bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
            bm.to_mesh(o.data); bm.free()
    prep_ao(objs)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.world = sc.world or bpy.data.worlds.new("w")
    sc.world.light_settings.distance = distance
    bk = sc.render.bake
    bk.target = "VERTEX_COLORS"
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    t = time.time()
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    # lift: full-black AO looks like soot in a PBR game; keep 0.35..1
    for o in objs:
        ca = o.data.color_attributes["AO"]
        for d in ca.data:
            c = d.color
            v = 0.35 + 0.65 * c[0]
            d.color = (v, v, v, 1)
    print("  AO baked on %d objects in %.1fs" % (len(objs), time.time() - t))


def finish(objs, name=None):
    """Apply modifiers, world-scale UVs per material, join per object name."""
    for o in objs:
        if o.modifiers:
            apply_all(o)
    world_uv_all(objs)


def world_uv_all(objs):
    t = mats.tiles_for(objs)
    for o in objs:
        if o.type == "MESH":
            world_uv(o, t)


def decimated(src, ratio, name):
    n = src.copy(); n.data = src.data.copy(); n.name = name
    bpy.context.scene.collection.objects.link(n)
    if ratio < 1:
        m = n.modifiers.new("dec", "DECIMATE")
        m.ratio = ratio
        m.use_collapse_triangulate = True
        apply_all(n)
        n.data.validate(clean_customdata=False)
    return n


def lod_chain(parts, ratios=(1.0, 0.35, 0.1), dists=(0, 40, 140)):
    """parts: list of finished mesh objects for LOD0. Returns list of (empty, objs) per LOD, parented empties."""
    out = []
    for li, r in enumerate(ratios):
        e = bpy.data.objects.new("LOD%d" % li, None)
        bpy.context.scene.collection.objects.link(e)
        e["lod"] = li
        e["dist"] = dists[li]
        objs = []
        for p in parts:
            o = p if li == 0 else decimated(p, r, "%s_lod%d" % (p.name, li))
            o.parent = e
            objs.append(o)
        out.append((e, objs))
    return out


def export_glb(path, root_objs, extras=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    sel = set()
    def walk(o):
        sel.add(o)
        for c in o.children:
            walk(c)
    for r in root_objs:
        walk(r)
    for o in sel:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                              export_apply=True, export_image_format="JPEG", export_jpeg_quality=88,
                              export_vertex_color="MATERIAL", export_extras=True, export_cameras=False,
                              export_lights=False, export_animations=False, export_tangents=False)
    return os.path.getsize(path)


def pack(path):
    """weld + quantize + meshopt (Tools/foundry/pack.mjs). Skipped (with a note) when node or the npm packages are missing."""
    import subprocess
    here = os.path.join(REPO, "Tools", "foundry")
    if not os.path.isdir(os.path.join(here, "node_modules", "@gltf-transform")):
        print("  (not packed: run npm install in Tools/foundry)"); return None
    r = subprocess.run(["node", os.path.join(here, "pack.mjs"), path], capture_output=True, text=True)
    if r.returncode:
        print("  pack failed: " + r.stderr[-400:]); return None
    print(r.stdout.strip())
    return os.path.getsize(path)


def manifest_add(entry):
    p = os.path.join(OUT, "index.json")
    data = {"about": "Models built by the Foundry (Tools/foundry, headless Blender). Do not edit by hand: rebuild with "
                     "python3 Tools/foundry/foundry.py build <id>.", "models": {}}
    if os.path.exists(p):
        data = json.load(open(p))
    data["models"][entry["id"]] = entry
    data["models"] = dict(sorted(data["models"].items()))
    os.makedirs(OUT, exist_ok=True)
    json.dump(data, open(p, "w"), indent=1)


def ship(asset_id, category, root, lods, meta=None):
    """Export the LOD tree under `root` (an empty) to Web/foundry/<category>/<id>.glb and record it."""
    rel = "%s/%s.glb" % (category, asset_id)
    path = os.path.join(OUT, rel)
    size = export_glb(path, [root])
    size = pack(path) or size
    entry = {"id": asset_id, "category": category, "file": rel, "bytes": size,
             "lods": [{"tris": sum(tris(o) for o in objs), "dist": e["dist"]} for e, objs in lods],
             "built": time.strftime("%Y-%m-%d"), "blender": bpy.app.version_string}
    mn, mx = bounds([o for _, objs in lods[:1] for o in objs])
    entry["size"] = [round(mx.x - mn.x, 3), round(mx.z - mn.z, 3), round(mx.y - mn.y, 3)]  # x, height, length (three.js x,y,z)
    entry.update(meta or {})
    manifest_add(entry)
    print("  -> Web/foundry/%s  %.1f MB  LOD tris %s" % (rel, size / 1e6, [l["tris"] for l in entry["lods"]]))
    return entry
