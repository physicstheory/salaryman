"""Geometry helpers for the Foundry generators (Blender, bpy + bmesh).

Conventions: metres, Blender Z up. The glTF exporter turns Blender (x, y, z) into three.js (x, z, -y), so an object
that should face three.js +Z (the game's "forward" for vehicles and props) is modelled facing Blender -Y.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.objects):
        for x in list(c):
            c.remove(x)


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_obj(name, bm, mat=None, smooth=False, coll=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    link(ob, coll)
    if mat is not None:
        ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = smooth
    return ob


def from_pydata(name, verts, faces, mat=None, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate(clean_customdata=False)
    me.update()
    ob = bpy.data.objects.new(name, me)
    link(ob)
    if mat is not None:
        me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth
    return ob


def box(name, size, at=(0, 0, 0), mat=None, bevel=0.0, segs=2, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    ob = mesh_obj(name, bm, mat)
    ob.location = at
    if rot:
        ob.rotation_euler = rot
    if bevel > 0:
        add_bevel(ob, bevel, segs)
    return ob


def cyl(name, r, h, at=(0, 0, 0), mat=None, segs=24, axis="Z", r2=None, bevel=0.0, cap=True, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    if axis == "X":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
    elif axis == "Y":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
    ob = mesh_obj(name, bm, mat, smooth=smooth)
    ob.location = at
    if bevel > 0:
        add_bevel(ob, bevel, 2)
    if smooth:
        auto_smooth(ob)
    return ob


def sphere(name, r, at=(0, 0, 0), mat=None, segs=24, rings=12, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    ob = mesh_obj(name, bm, mat, smooth=True)
    ob.location = at
    return ob


def add_bevel(ob, width, segs=2, limit="ANGLE", angle=30):
    m = ob.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segs
    m.limit_method = limit
    m.angle_limit = math.radians(angle)
    m.harden_normals = False
    m.use_clamp_overlap = True
    return m


def auto_smooth(ob, angle=35):
    """Smooth shading with hard edges past `angle` (Blender 4.1+ removed mesh auto-smooth: split sharp edges instead)."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    lim = math.radians(angle)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0) > lim:
            e.smooth = False
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()


def apply_all(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    for m in list(ob.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except RuntimeError:
            ob.modifiers.remove(m)


def apply_xform(ob):
    me = ob.data
    me.transform(ob.matrix_basis)
    ob.matrix_basis = Matrix.Identity(4)


def join(objs, name):
    objs = [o for o in objs if o is not None]
    for o in objs:
        if o.modifiers:
            apply_all(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def dup(ob, name=None, at=None, rot=None, mirror_x=False):
    n = ob.copy()
    n.data = ob.data.copy()
    n.name = name or ob.name + "_d"
    link(n)
    if at is not None:
        n.location = at
    if rot is not None:
        n.rotation_euler = rot
    if mirror_x:
        n.scale.x *= -1
    return n


def superellipse(w, h, n=4.0, count=32, y0=0.0, flat_bottom=True):
    """Closed cross-section (x, z) for vehicle bodies: a superellipse of width w, height h, optional flat floor."""
    pts = []
    for i in range(count):
        t = 2 * math.pi * i / count
        c, s = math.cos(t), math.sin(t)
        x = w / 2 * math.copysign(abs(c) ** (2 / n), c)
        z = h / 2 * math.copysign(abs(s) ** (2 / n), s)
        if flat_bottom and z < -h / 2 * 0.85:
            z = -h / 2
        pts.append((x, y0 + z + h / 2))
    return pts


def loft(name, sections, mat=None, cap_start=True, cap_end=True, smooth=True):
    """sections: list of (y, [(x, z), ...]) with the same point count; joins them into a tube along Blender Y."""
    n = len(sections[0][1])
    verts, faces = [], []
    for y, pts in sections:
        for x, z in pts:
            verts.append((x, y, z))
    for k in range(len(sections) - 1):
        a, b = k * n, (k + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
    if cap_start:
        faces.append(tuple(reversed(range(0, n))))
    if cap_end:
        last = (len(sections) - 1) * n
        faces.append(tuple(range(last, last + n)))
    ob = from_pydata(name, verts, faces, mat, smooth)
    # outward normals
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data); bm.free()
    if smooth:
        auto_smooth(ob, 40)
    return ob


def boolean(target, cutter, op="DIFFERENCE", solver="EXACT", keep=False):
    m = target.modifiers.new("bool", "BOOLEAN")
    m.operation = op
    m.object = cutter
    m.solver = solver
    apply_all(target)
    if not keep:
        bpy.data.objects.remove(cutter, do_unlink=True)
    return target


def bool_many(target, cutters, op="DIFFERENCE"):
    """One boolean with a joined cutter is far faster than many."""
    if not cutters:
        return target
    c = join(cutters, target.name + "_cut") if len(cutters) > 1 else cutters[0]
    return boolean(target, c, op)


def tris(ob):
    me = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def scene_tris(objs=None):
    return sum(tris(o) for o in (objs or bpy.context.scene.objects) if o.type == "MESH")


def bounds(objs):
    mn = Vector((1e9, 1e9, 1e9)); mx = -mn
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    return mn, mx


def world_uv(ob, scale_by_mat=None, default=1.0, name="UVMap"):
    """World-scale box projection: 1 UV unit = `tile` metres for the face's material. Keeps tiling textures at their
    real size on everything, so a 1 m brushed-steel tile reads the same on a door handle and on a 20 m carriage."""
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    uv = bm.loops.layers.uv.get(name) or bm.loops.layers.uv.new(name)
    mats = me.materials
    M = ob.matrix_world
    for f in bm.faces:
        tile = default
        if scale_by_mat and f.material_index < len(mats) and mats[f.material_index]:
            tile = scale_by_mat.get(mats[f.material_index].name, default)
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            p = M @ l.vert.co
            if ax == 0:
                u, v = p.y * (1 if n.x > 0 else -1), p.z
            elif ax == 1:
                u, v = p.x * (-1 if n.y > 0 else 1), p.z
            else:
                u, v = p.x, p.y * (1 if n.z > 0 else -1)
            l[uv].uv = (u / tile, v / tile)
    bm.to_mesh(me); bm.free()


def strip_uv(ob, u_len, v_len, name="UVMap"):
    """For hair cards / decals that already have their own UVs: nothing to do; kept for symmetry."""
    return ob


def set_origin_floor(objs):
    """Move the objects so the group sits on z = 0, centred in x/y."""
    mn, mx = bounds(objs)
    off = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for o in objs:
        o.location -= off
