"""Turn a generated mesh into a car the game can drive.

    blender -b --python Tools/cars/prepare_car.py -- <source> <out.glb> <kind> [options]

What arrives from a text-to-3D service is one sealed shell with no textures, no
UVs and no materials, at a hundred to four hundred thousand faces - a nice
object and not yet a game asset. Four things have to happen to it:

  orient     the long axis becomes the direction of travel. Blender exports
             +Y as glTF -Z, so a car that drives +Z in the game points -Y here.
  shrink     a hundred and thirty cars at 150k faces is twenty million
             triangles. The budget is six to nine thousand each.
  paint      with no texture there is nothing to tint, so the body is cut into
             four materials by where each face sits and which way it looks:
             paint, glass, dark trim, tyre. The game then recolours `paint`
             per car and leaves the rest alone.
  stand      on the floor, centred, so the engine's own fit does nothing.

The cuts are geometric rather than clever, which is the point: they work on any
generated car without anyone labelling anything.
"""

import bpy
import bmesh
import sys
import os
import math
from mathutils import Vector


def arg(name, default=None):
    argv = sys.argv[sys.argv.index("--") + 1:]
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) else True
    return default


def positional():
    argv = sys.argv[sys.argv.index("--") + 1:]
    return [a for a in argv if not a.startswith("--") and not _is_value(argv, a)]


def _is_value(argv, a):
    i = argv.index(a)
    return i > 0 and argv[i - 1].startswith("--")


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.lower().endswith(".glb") or path.lower().endswith(".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        bpy.ops.wm.obj_import(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit("no mesh in " + path)
    for o in bpy.context.scene.objects:
        o.select_set(o.type == "MESH")
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    car = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return car


def bounds(obj):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for c in obj.bound_box:
        w = obj.matrix_world @ Vector(c)
        lo = Vector((min(lo[i], w[i]) for i in range(3)))
        hi = Vector((max(hi[i], w[i]) for i in range(3)))
    return lo, hi


def axes(car):
    """Which way is long, which way is wide, which way is up.

    A car is mirror-symmetric left to right and not symmetric front to back or
    floor to roof, so the width is the axis whose geometry is most even about
    its own centre. The length is simply the longest. Whatever is left is up.
    Measuring it beats assuming it: these files arrive from different exporters
    and one of the five came in standing on its nose.
    """
    me = car.data
    n = len(me.vertices)
    step = max(1, n // 20000)
    acc = [[0.0, 0.0, 0.0] for _ in range(3)]   # count, mean, m3
    pts = [me.vertices[i].co for i in range(0, n, step)]
    size = [0.0, 0.0, 0.0]
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for p in pts:
        for a in range(3):
            lo[a] = min(lo[a], p[a])
            hi[a] = max(hi[a], p[a])
    for a in range(3):
        size[a] = hi[a] - lo[a]
    skew = [0.0, 0.0, 0.0]
    for a in range(3):
        if size[a] < 1e-6:
            skew[a] = 9
            continue
        mid = (lo[a] + hi[a]) * 0.5
        s2 = 0.0
        s3 = 0.0
        for p in pts:
            d = (p[a] - mid) / size[a]
            s2 += d * d
            s3 += d * d * d
        skew[a] = abs(s3) / max(1e-9, (s2 / len(pts)) ** 1.5) / len(pts)
    long_axis = size.index(max(size))
    rest = [a for a in range(3) if a != long_axis]
    width_axis = rest[0] if skew[rest[0]] <= skew[rest[1]] else rest[1]
    up_axis = [a for a in rest if a != width_axis][0]
    return long_axis, width_axis, up_axis


def orient(car, flip):
    """Length along Y with the nose at -Y, width along X, up along Z.

    Blender exports +Y as glTF -Z, so a car pointing -Y here drives +Z in the
    game, which is the direction everything else in the engine assumes.
    """
    import mathutils
    long_axis, width_axis, up_axis = axes(car)
    basis = mathutils.Matrix.Identity(3)
    col = [None, None, None]
    col[width_axis] = mathutils.Vector((1, 0, 0))
    col[long_axis] = mathutils.Vector((0, 1, 0))
    col[up_axis] = mathutils.Vector((0, 0, 1))
    basis = mathutils.Matrix((
        (col[0].x, col[1].x, col[2].x),
        (col[0].y, col[1].y, col[2].y),
        (col[0].z, col[1].z, col[2].z),
    )).transposed()
    if basis.determinant() < 0:
        basis = mathutils.Matrix.Scale(-1, 3, (1, 0, 0)) @ basis
    car.matrix_world = basis.to_4x4() @ car.matrix_world
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    if flip:
        car.rotation_euler = (0, 0, math.radians(180))
        bpy.ops.object.transform_apply(rotation=True)
    lo, hi = bounds(car)
    centre = (lo + hi) * 0.5
    car.location = (-centre.x, -centre.y, -lo.z)
    bpy.ops.object.transform_apply(location=True)


def scale_to(car, length, width, height):
    """To the real car's dimensions on all three axes.

    Generated meshes come out of proportion - the kei car arrived 1.9 m wide
    for a class that is capped by law at 1.48 - and a car that does not fit its
    lane is wrong in a way the eye catches immediately. Stretching each axis
    separately is a small distortion in exchange for the right size.
    """
    lo, hi = bounds(car)
    size = hi - lo
    sx = (width / size.x) if width and size.x > 0.01 else (length / max(0.01, size.y))
    sy = length / max(0.01, size.y)
    sz = (height / size.z) if height and size.z > 0.01 else sy
    car.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    lo, hi = bounds(car)
    centre = (lo + hi) * 0.5
    car.location = (-centre.x, 0, -lo.z)
    bpy.ops.object.transform_apply(location=True)


def decimate(car, target_tris):
    me = car.data
    tris = sum(max(0, len(p.vertices) - 2) for p in me.polygons)
    if tris <= target_tris:
        return tris
    mod = car.modifiers.new("shrink", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = max(0.01, float(target_tris) / tris)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return sum(max(0, len(p.vertices) - 2) for p in car.data.polygons)


def material(name, rgba, metallic, roughness):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rgba
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    return m


def paint(car, belt, sill, glass_tilt, wheel_span):
    """Cut the shell into paint, glass, dark trim and tyre, by geometry alone."""
    me = car.data
    me.materials.clear()
    # The order here is the order the game reads them in.
    me.materials.append(material("paint", (0.85, 0.85, 0.85, 1), 0.25, 0.32))
    me.materials.append(material("glass", (0.06, 0.08, 0.10, 1), 0.0, 0.06))
    me.materials.append(material("trim", (0.07, 0.07, 0.08, 1), 0.3, 0.45))
    me.materials.append(material("tyre", (0.035, 0.035, 0.04, 1), 0.0, 0.95))
    PAINT, GLASS, TRIM, TYRE = 0, 1, 2, 3

    lo, hi = bounds(car)
    size = hi - lo
    H = size.z
    L = size.y
    W = size.x
    z_floor = lo.z + H * 0.10
    z_sill = lo.z + H * sill
    z_belt = lo.z + H * belt
    # Where the wheels are, as a fraction of the length and the width. Every
    # generated car puts them in much the same place, which is what makes a
    # purely geometric cut work at all. The radius is a wheel's rather than a
    # guess: too generous and the whole underside comes out as tyre.
    hub_z = lo.z + H * 0.16
    hubs = [Vector((sx * W * 0.38, sy * L * wheel_span, hub_z))
            for sx in (-1, 1) for sy in (-1, 1)]
    hub_r = L * 0.115

    # The greenhouse's own extent along the car, so the windscreen and the
    # backlight can be told from the roof: all three are above the beltline and
    # only the roof is level, but a raked screen is not level enough to pass a
    # strict test or steep enough to pass a loose one applied to the roof too.
    cab_lo, cab_hi = 1e9, -1e9
    for p in me.polygons:
        c = Vector((0, 0, 0))
        for vi in p.vertices:
            c += me.vertices[vi].co
        c /= len(p.vertices)
        if c.z > z_belt:
            cab_lo = min(cab_lo, c.y)
            cab_hi = max(cab_hi, c.y)
    cab_mid = (cab_lo + cab_hi) * 0.5
    cab_half = max(0.1, (cab_hi - cab_lo) * 0.5)

    for p in me.polygons:
        c = Vector((0, 0, 0))
        for vi in p.vertices:
            c += me.vertices[vi].co
        c /= len(p.vertices)
        n = p.normal
        outboard = abs(c.x) > W * 0.22
        raked = abs(n.z) < 0.78 and abs(c.y - cab_mid) > cab_half * 0.42
        if c.z < z_sill and outboard and min((c - h).length for h in hubs) < hub_r:
            p.material_index = TYRE
        elif c.z < z_floor:
            p.material_index = TRIM          # the sealed underside, never seen
        elif c.z < z_sill:
            p.material_index = TRIM          # bumpers, skirts, arch liners
        elif c.z > z_belt and (abs(n.z) < glass_tilt or raked):
            p.material_index = GLASS
        else:
            p.material_index = PAINT

    share = {}
    for p in me.polygons:
        share[me.materials[p.material_index].name] = share.get(me.materials[p.material_index].name, 0) + 1
    total = max(1, len(me.polygons))
    return dict(width=round(W, 3), length=round(L, 3), height=round(H, 3),
                split={k: str(round(v * 100.0 / total)) + "%" for k, v in sorted(share.items())})


def main():
    pos = positional()
    src, out, kind = pos[0], pos[1], pos[2]
    length = float(arg("--length", 4.0))
    width = float(arg("--width", 0)) or 0
    height = float(arg("--height", 0)) or 0
    tris = int(arg("--tris", 8000))
    flip = bool(arg("--flip", False))
    belt = float(arg("--belt", 0.58))
    sill = float(arg("--sill", 0.26))
    tilt = float(arg("--tilt", 0.42))
    span = float(arg("--span", 0.30))
    smooth_angle = float(arg("--smooth", 38))

    car = load(src)
    orient(car, flip)
    scale_to(car, length, width, height)
    final = decimate(car, tris)
    dims = paint(car, belt, sill, tilt, span)
    car.name = kind

    # Smooth where it curves and crisp where it creases. Shading the whole
    # shell smooth melts the panel gaps, the arches and the window frames into
    # one soft lump; shading it flat facets a roof that should be a curve.
    # Auto-smooth draws the line at an angle, which is what a car body is: wide
    # curved surfaces meeting at sharp edges.
    me = car.data
    try:
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(float(smooth_angle))
    except AttributeError:
        pass                      # newer Blender does this with a modifier
    bpy.ops.object.shade_smooth()
    # And make sure every face points outwards: a generated shell often has a
    # few inverted, and an inverted face under smooth shading is a black hole.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in bpy.context.scene.objects:
        o.select_set(o is car)
    bpy.context.view_layer.objects.active = car
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB",
                              use_selection=True, export_apply=True,
                              export_yup=True, export_materials="EXPORT")
    print("CAR %s -> %s  %d tris  %s" % (kind, out, final, dims))


main()
