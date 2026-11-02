"""Turn a heavy showroom car mesh into a game-ready GLB.

Run headless:
    blender -b -P prepare_car.py -- INPUT.obj OUTPUT.glb [--tris 60000] [--length 4.6] [--flip]

What it does
  * imports the OBJ (or GLB/FBX) with its materials and textures
  * works out which way is forward (the longest horizontal axis) and which way is up,
    so the car ends up with +Z as its nose, the ground at y = 0 and the middle at x = z = 0
  * scales it to a real-world length in metres
  * decimates every part towards a triangle budget, keeping the big shapes (panels, glass) and
    spending less on the small ones, with sharp edges preserved
  * merges parts that share a material, then rebuilds the materials as plain PBR:
    clear-coated paint, glass, chrome, rubber and lamps, so the game can recolour the paint
  * exports a GLB the Godot project loads directly

The paint material is named CarPaint; the game swaps its colour per car.
"""
import bpy, sys, math, re, os, bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(argv) < 2:
    print("usage: blender -b -P prepare_car.py -- in.obj out.glb [--tris N] [--length M] [--flip]")
    sys.exit(1)
src, dst = argv[0], argv[1]
budget = int(argv[argv.index("--tris") + 1]) if "--tris" in argv else 60000
length = float(argv[argv.index("--length") + 1]) if "--length" in argv else 4.6
flip = "--flip" in argv

bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(src)[1].lower()
if ext == ".obj":
    bpy.ops.wm.obj_import(filepath=src)
elif ext in (".glb", ".gltf"):
    bpy.ops.import_scene.gltf(filepath=src)
elif ext == ".fbx":
    bpy.ops.import_scene.fbx(filepath=src)
else:
    raise SystemExit("unsupported input " + ext)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit("no meshes in " + src)
for o in meshes:
    o.hide_set(False)
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]

def tri_count(objs):
    return sum(len(o.data.polygons) for o in objs)   # quads count as ~2; close enough for a budget

before = 0
for o in meshes:
    me = o.data
    me.calc_loop_triangles()
    before += len(me.loop_triangles)
print("imported %d objects, %d triangles" % (len(meshes), before))

# ---- orientation: bake transforms, then find the long axis and the up axis
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
    return lo, hi

lo, hi = bounds(meshes)
size = hi - lo
# a car is longer than it is wide and wider than it is tall; the smallest axis is up
axes = sorted(range(3), key=lambda i: size[i])
up_i, wide_i, long_i = axes[0], axes[1], axes[2]
print("size", tuple(round(v, 2) for v in size), "up axis", "XYZ"[up_i], "long axis", "XYZ"[long_i])
# rotate so the up axis is Blender Z and the long axis is Y (we export with +Y forward, glTF turns it into +Z)
import mathutils
m = mathutils.Matrix.Identity(3)
cols = [None, None, None]
cols[wide_i] = Vector((1, 0, 0))
cols[long_i] = Vector((0, 1, 0))
cols[up_i] = Vector((0, 0, 1))
# build the matrix taking source axes to target axes
M = mathutils.Matrix(((cols[0][0], cols[1][0], cols[2][0]), (cols[0][1], cols[1][1], cols[2][1]), (cols[0][2], cols[1][2], cols[2][2])))
if M.determinant() < 0:
    M = M @ mathutils.Matrix.Diagonal((1, 1, -1))   # a reflection would mirror the car, so flip the up sense instead
for o in meshes:
    o.data.transform(M.to_4x4())
    o.data.update()
bpy.context.view_layer.update()
lo, hi = bounds(meshes)
# the cabin sits behind the middle, so the roof's centre of mass tells us where the tail is
roof = []
zmax = hi.z
for o in meshes:
    for v in o.data.vertices:
        if v.co.z > lo.z + (hi.z - lo.z) * 0.8:
            roof.append(v.co.y)
cy = (lo.y + hi.y) / 2
roof_c = sum(roof) / max(1, len(roof))
nose_positive = roof_c < cy      # roof behind centre means the nose is on the + side
if flip:
    nose_positive = not nose_positive
if not nose_positive:
    for o in meshes:
        o.data.transform(mathutils.Matrix.Rotation(math.pi, 4, "Z"))
        o.data.update()
bpy.context.view_layer.update()
lo, hi = bounds(meshes)
scale = length / (hi.y - lo.y)
offset = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
for o in meshes:
    me = o.data
    for v in me.vertices:
        v.co = (v.co - offset) * scale
    me.update()
bpy.context.view_layer.update()
lo, hi = bounds(meshes)
print("car is now %.2f long, %.2f wide, %.2f tall" % (hi.y - lo.y, hi.x - lo.x, hi.z - lo.z))

# ---- decimate towards the budget, spending more on the big parts
for o in meshes:
    me = o.data
    me.calc_loop_triangles()
sizes = {o: max(1, len(o.data.loop_triangles)) for o in meshes}
total = sum(sizes.values())
ratio_all = min(1.0, budget / total)
for o in meshes:
    n = sizes[o]
    # tiny parts keep their detail up to a point, big ones take the cut
    keep = min(1.0, ratio_all * (1.0 + 0.8 * math.exp(-n / 4000.0)))
    if n < 200:
        keep = 1.0
    if keep >= 0.999:
        continue
    bpy.context.view_layer.objects.active = o
    # merge doubled vertices first, they stop the collapse
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.00005)
    bpy.ops.object.mode_set(mode="OBJECT")
    mod = o.modifiers.new("dec", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = keep
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier="dec")

# ---- materials: classify by name, then rebuild as clean PBR
def classify(name):
    n = name.lower()
    if re.search(r"glass|window|windshield|windscreen|lens|screen", n): return "glass"
    if re.search(r"tyre|tire|rubber|tread", n): return "rubber"
    if re.search(r"chrome|metal|steel|alu|rim|wheel|exhaust|brake|disc|caliper", n): return "chrome"
    if re.search(r"light|lamp|led|head|tail|indicator|blinker", n): return "lamp"
    if re.search(r"paint|body|carpaint|car_?body|exterior|shell", n): return "paint"
    if re.search(r"interior|seat|leather|dash|carpet|cloth|plastic|trim|black", n): return "trim"
    return "other"

def make(kind, name, base):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    def s(k, v):
        if k in bsdf.inputs: bsdf.inputs[k].default_value = v
    if kind == "paint":
        s("Base Color", (0.62, 0.64, 0.68, 1)); s("Metallic", 0.55); s("Roughness", 0.28)
        s("Coat Weight", 1.0); s("Coat Roughness", 0.03)
    elif kind == "glass":
        s("Base Color", (0.02, 0.03, 0.04, 1)); s("Metallic", 0.0); s("Roughness", 0.04)
        s("Alpha", 0.5); m.blend_method = "BLEND" if hasattr(m, "blend_method") else None
    elif kind == "rubber":
        s("Base Color", (0.015, 0.015, 0.016, 1)); s("Roughness", 0.85); s("Metallic", 0.0)
    elif kind == "chrome":
        s("Base Color", (0.78, 0.8, 0.82, 1)); s("Metallic", 1.0); s("Roughness", 0.18)
    elif kind == "lamp":
        s("Base Color", (0.9, 0.9, 0.85, 1)); s("Roughness", 0.1)
        s("Emission Color", (1.0, 0.95, 0.8, 1)); s("Emission Strength", 0.4)
    elif kind == "trim":
        s("Base Color", (0.05, 0.05, 0.055, 1)); s("Roughness", 0.7); s("Metallic", 0.0)
    else:
        if base is not None:
            s("Base Color", base)
    return m

# what colour was each original material, so unclassified ones keep their look
cache = {}
for o in meshes:
    for slot in o.material_slots:
        mat = slot.material
        if mat is None:
            continue
        kind = classify(mat.name)
        base = None
        if mat.use_nodes:
            b = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if b is not None:
                base = tuple(b.inputs["Base Color"].default_value)
        elif hasattr(mat, "diffuse_color"):
            base = tuple(mat.diffuse_color)
        # a painted panel is often just "Material.001": the biggest unclassified coloured surface becomes the paint
        key = mat.name
        if key not in cache:
            cache[key] = (kind, base, mat)
print("materials:", {k: v[0] for k, v in cache.items()})

# the most-used unclassified material by area is the bodywork if none was named
area = {}
for o in meshes:
    for p in o.data.polygons:
        slot = o.material_slots[p.material_index] if p.material_index < len(o.material_slots) else None
        if slot and slot.material:
            area[slot.material.name] = area.get(slot.material.name, 0.0) + p.area
if not any(v[0] == "paint" for v in cache.values()):
    cand = [k for k, v in cache.items() if v[0] in ("other",)]
    if cand:
        top = max(cand, key=lambda k: area.get(k, 0))
        cache[top] = ("paint", cache[top][1], cache[top][2])
        print("treating", top, "as the paint")

made = {}
for o in meshes:
    for slot in o.material_slots:
        mat = slot.material
        if mat is None:
            continue
        kind, base, orig = cache[mat.name]
        has_tex = False
        if orig.use_nodes:
            has_tex = any(n.type == "TEX_IMAGE" for n in orig.node_tree.nodes)
        if kind == "other" and has_tex:
            continue                      # keep real textures where the source had them
        mname = {"paint": "CarPaint", "glass": "Glass", "rubber": "Rubber", "chrome": "Chrome", "lamp": "Lamp", "trim": "Trim"}.get(kind, mat.name)
        if mname not in made:
            made[mname] = make(kind, mname, base)
        slot.material = made[mname]

# ---- tidy: join everything into one mesh so the game draws it in a few calls, smooth shading
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
car = bpy.context.view_layer.objects.active
car.name = os.path.splitext(os.path.basename(dst))[0]
bpy.ops.object.shade_smooth()
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.object.mode_set(mode="OBJECT")
car.data.calc_loop_triangles()
print("result: %d triangles, %d materials" % (len(car.data.loop_triangles), len(car.data.materials)))
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_apply=True, export_yup=True,
                          export_image_format="JPEG", export_jpeg_quality=85, export_texcoords=True, export_normals=True)
print("wrote", dst, os.path.getsize(dst) // 1024, "KB")
