# Build a humanoid rig for the Meshy salaryman mesh, skin it, author
# Idle / Walk / Run cycles, and export an animated GLB.
#
# The source mesh stands with both hands in his trouser pockets and faces
# -Y.  The first thing we do is spin him so he faces +Y, which lets every
# pose below read in ordinary terms: +X is his right, +Y is forward, +Z up.
import bpy, math, os
from mathutils import Vector, Quaternion, Matrix

D = math.radians
# Where the GLB lands. Override with SEIKO_GLB=... to write somewhere else.
OUT = os.environ.get('SEIKO_GLB') or os.path.join(
    os.path.dirname(os.path.abspath(bpy.data.filepath)) if bpy.data.filepath else os.getcwd(),
    'seiko.glb')
# Unity reads FBX natively and glTF only with a package, so the engine build gets an FBX
# of the same rig. Set SEIKO_FBX='' to skip it.
FBX = os.environ.get('SEIKO_FBX', os.path.splitext(OUT)[0] + '.fbx')
# Meshy exported him at 1.90 m. A salaryman is 1.74.
HEIGHT = float(os.environ.get('SEIKO_HEIGHT', '1.74'))

for im in bpy.data.images:
    if max(im.size) > 1024:
        im.scale(1024, 1024)

def save_maps(folder):
    """Write the mesh's own maps beside the model.

    Unity will not reliably pull an embedded texture out of an FBX into an HDRP material,
    and a grey salaryman is not the one we want, so the maps go out as files and
    KontoSeikoSetup builds the material from them."""
    if not folder:
        return
    m = bpy.data.objects['Mesh_0'].material_slots[0].material
    if m is None or not m.use_nodes:
        return
    # Which map is which is decided by what consumes it, not by the socket name: both the
    # normal map and the metallic/roughness split arrive on a socket called "Color".
    for node in m.node_tree.nodes:
        if node.type != 'TEX_IMAGE' or node.image is None:
            continue
        label = None
        for out in node.outputs:
            for link in out.links:
                to = link.to_node.type
                if to == 'NORMAL_MAP':
                    label = 'Normal'
                elif to == 'SEPARATE_COLOR':
                    label = 'Mask'
                elif link.to_socket.name == 'Base Color':
                    label = 'BaseColor'
        if label is None:
            continue
        img = node.image
        img.filepath_raw = os.path.join(folder, 'Seiko_%s.png' % label)
        img.file_format = 'PNG'
        # Colour maps keep their transfer curve; the data maps must not gain one.
        if label != 'BaseColor':
            img.colorspace_settings.name = 'Non-Color'
        img.save()
        print("[rig] wrote", img.filepath_raw)

scn = bpy.context.scene
scn.render.fps = 30
for ob in bpy.data.objects:
    ob.select_set(False)

mesh = bpy.data.objects['Mesh_0']
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
def head_cy():
    co = [v.co for v in mesh.data.vertices]
    zl = min(v.z for v in co); hh = max(v.z for v in co) - zl
    b = [v for v in co if zl + hh * 0.88 < v.z < zl + hh * 0.93]
    return sum(v.y for v in b) / len(b)

print("[rig] head cy before spin %+.4f" % head_cy())
mesh.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))
mesh.data.update()
print("[rig] head cy after  spin %+.4f" % head_cy())

co0 = [v.co for v in mesh.data.vertices]
raw = max(v.z for v in co0) - min(v.z for v in co0)
mesh.data.transform(Matrix.Scale(HEIGHT / raw, 4))
mesh.data.update()
print("[rig] scaled %.3f m -> %.3f m" % (raw, HEIGHT))

# Feet on the floor. Meshy centres the mesh on its own bounding box, so his origin sits
# at his waist; anything that drops the transform on the ground buries him to the hips.
soles = min(v.co.z for v in mesh.data.vertices)
mesh.data.transform(Matrix.Translation((0.0, 0.0, -soles)))
mesh.data.update()
print("[rig] feet moved to the origin (was %+.3f)" % soles)

dec = mesh.modifiers.new('dec', 'DECIMATE')
dec.ratio = 0.40
bpy.ops.object.modifier_apply(modifier='dec')
bpy.ops.object.shade_smooth()
if hasattr(mesh.data, 'use_auto_smooth'):
    mesh.data.use_auto_smooth = True
    mesh.data.auto_smooth_angle = D(45)
print("[rig] tris after decimate:", len(mesh.data.polygons))

co = [v.co for v in mesh.data.vertices]
zmin = min(v.z for v in co)
H = max(v.z for v in co) - zmin
def z(f): return zmin + H * f
print("[rig] height %.4f  zmin %.4f" % (H, zmin))

# ------------------------------------------------------- skeleton geometry
# Landmarks come from slicing the mesh (probe.py / probe2.py): the legs part
# at x ~ 0.09, the elbows stand off at x ~ 0.26 and sit slightly behind the
# hips, and the hands are buried in the pockets at the front of the thighs.
HIPW, KNEEW = 0.088, 0.095
SHX, ELX, WRX = 0.155, 0.260, 0.165

BONES = [
    ("Hips",  (0.0, 0.0, z(0.525)), (0.0, 0.0, z(0.600)), None,    False),
    ("Spine", (0.0, 0.0, z(0.600)), (0.0, 0.0, z(0.690)), "Hips",  True),
    ("Chest", (0.0, 0.0, z(0.690)), (0.0, 0.0, z(0.800)), "Spine", True),
    ("Neck",  (0.0, 0.0, z(0.800)), (0.0, 0.0, z(0.860)), "Chest", True),
    ("Head",  (0.0, 0.0, z(0.860)), (0.0, 0.01, z(0.995)), "Neck", True),
]
for s, sx in (("L", -1.0), ("R", 1.0)):
    BONES += [
        ("Shoulder."+s, (sx*0.030, 0.0,   z(0.795)), (sx*SHX, -0.02,  z(0.790)), "Chest",       False),
        ("UpperArm."+s, (sx*SHX,  -0.02,  z(0.790)), (sx*ELX, -0.080, z(0.645)), "Shoulder."+s, True),
        ("Forearm."+s,  (sx*ELX,  -0.080, z(0.645)), (sx*WRX,  0.075, z(0.550)), "UpperArm."+s, True),
        ("Hand."+s,     (sx*WRX,   0.075, z(0.550)), (sx*0.150, 0.118, z(0.522)), "Forearm."+s, True),
        ("Thigh."+s,    (sx*HIPW,  0.0,   z(0.520)), (sx*KNEEW, 0.015, z(0.290)), "Hips",       False),
        ("Shin."+s,     (sx*KNEEW, 0.015, z(0.290)), (sx*KNEEW, 0.005, z(0.045)), "Thigh."+s,   True),
        ("Foot."+s,     (sx*KNEEW, 0.005, z(0.045)), (sx*KNEEW, 0.090, z(0.012)), "Shin."+s,    True),
        ("Toe."+s,      (sx*KNEEW, 0.090, z(0.012)), (sx*KNEEW, 0.145, z(0.010)), "Foot."+s,    True),
    ]

arm_data = bpy.data.armatures.new("SeikoArmature")
rig = bpy.data.objects.new("Seiko", arm_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
for name, head, tail, parent, connect in BONES:
    b = eb.new(name)
    b.head, b.tail = Vector(head), Vector(tail)
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    b.envelope_distance = 0.09
bpy.ops.object.mode_set(mode='OBJECT')

# ------------------------------------------------------------------ skinning
for ob in bpy.data.objects:
    ob.select_set(False)
mesh.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
try:
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    print("[rig] skinned with automatic (bone heat) weights")
except Exception as e:
    print("[rig] auto weights failed (%s); falling back to envelopes" % e)
    bpy.ops.object.parent_set(type='ARMATURE_ENVELOPE')

# -------------------------------------------------------------- pose helper
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'
REST = {pb.name: pb.bone.matrix_local.to_3x3() for pb in rig.pose.bones}
AXES = {'x': Vector((1, 0, 0)), 'y': Vector((0, 1, 0)), 'z': Vector((0, 0, 1))}


def local_quat(bone, axis, deg):
    local = (REST[bone].inverted() @ AXES[axis]).normalized()
    return Quaternion(local, D(deg))


def set_pose(pose):
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion((1, 0, 0, 0))
        pb.location = (0, 0, 0)
    for bone, spec in pose.items():
        pb = rig.pose.bones[bone]
        q = Quaternion((1, 0, 0, 0))
        for axis, amount in spec:
            if axis == 'loc':
                pb.location = REST[bone].inverted() @ Vector(amount)
            else:
                q = q @ local_quat(bone, axis, amount)
        pb.rotation_quaternion = q


# ---------------------------------------------- hands out of the pockets
# The source mesh is modelled standing with both hands in his trouser pockets, and the
# forearms run forward and inward into them. Every animation on top of that rest pose is
# fighting it. So: pose the arms down and clear of the body, bake that shape into the
# mesh, make it the rest pose, and work out the weights again on the result. After this
# the arms are ordinary arms and the walk can swing them.
OUT_OF_POCKETS = {
    'UpperArm.L': [('y', 13), ('x', -6)],
    'UpperArm.R': [('y', -13), ('x', -6)],
    'Forearm.L':  [('x', -52), ('y', 8)],
    'Forearm.R':  [('x', -52), ('y', -8)],
    'Hand.L':     [('x', -10)],
    'Hand.R':     [('x', -10)],
}

bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')
set_pose(OUT_OF_POCKETS)
bpy.ops.object.mode_set(mode='OBJECT')

# Bake the deformed shape, keeping the vertex groups, then make the pose the rest pose.
bpy.context.view_layer.objects.active = mesh
mod = next((m for m in mesh.modifiers if m.type == 'ARMATURE'), None)
if mod is not None:
    bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.armature_apply()
bpy.ops.object.mode_set(mode='OBJECT')

# Re-skin: the weights that suited a hand inside a pocket do not suit a hand beside a hip.
bpy.context.view_layer.objects.active = mesh
mesh.vertex_groups.clear()
for ob in bpy.data.objects:
    ob.select_set(False)
mesh.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
try:
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    print("[rig] arms out of the pockets, re-skinned on the new rest pose")
except Exception as e:
    print("[rig] re-skin failed (%s); falling back to envelopes" % e)
    bpy.ops.object.parent_set(type='ARMATURE_ENVELOPE')

# The rest pose moved, so the bone rest matrices did too.
REST = {pb.name: pb.bone.matrix_local.to_3x3() for pb in rig.pose.bones}

def apply(pose):
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion((1, 0, 0, 0))
        pb.location = (0, 0, 0)
    for bone, spec in pose.items():
        pb = rig.pose.bones[bone]
        q = Quaternion((1, 0, 0, 0))
        for axis, amount in spec:
            if axis == 'loc':
                pb.location = REST[bone].inverted() @ Vector(amount)
            else:
                local = (REST[bone].inverted() @ AXES[axis]).normalized()
                q = q @ Quaternion(local, D(amount))
        pb.rotation_quaternion = q

def bake(name, frames):
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    for f, pose in frames:
        apply(pose)
        for pb in rig.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=f)
        rig.pose.bones['Hips'].keyframe_insert('location', frame=f)
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.easing = 'AUTO'
    act.use_fake_user = True
    print("[rig] action %-4s %3d fcurves  frames %s" % (name, len(act.fcurves), tuple(act.frame_range)))

def merge(*ds):
    out = {}
    for d in ds:
        out.update(d)
    return out

# Positive 'x' swings a limb forward, negative back.  Positive 'y' abducts the
# left arm / right leg and adducts the mirrored one, so limb poses carry a sign.
def swing_arms(sign, reach=26, fold=20, out=3, roll=0.0):
    """Arms at his sides, swinging opposite the legs.

    sign is which leg leads: the arm on the same side goes back. reach is the swing in
    degrees, fold how bent the elbow stays, out how far the arms are held off the body.
    """
    return {
        'Shoulder.L': [('x',  roll)],
        'Shoulder.R': [('x', -roll)],
        'UpperArm.L': [('y',  out), ('x', -reach * sign)],
        'UpperArm.R': [('y', -out), ('x',  reach * sign)],
        'Forearm.L':  [('x', fold + 10 * -sign)],
        'Forearm.R':  [('x', fold + 10 *  sign)],
        'Hand.L':     [('x', 4)],
        'Hand.R':     [('x', 4)],
    }

# ---- Idle: quiet breathing, weight settled onto the right leg
def idle_pose(t):
    s = math.sin(t * 2 * math.pi)
    c = math.cos(t * 2 * math.pi)
    return merge({
        'Hips':  [('loc', (0.006, 0.0, -0.004 + 0.005 * s)), ('z', -2), ('y', 1.6)],
        'Spine': [('x', 1.5 + 1.2 * s), ('z', 1)],
        'Chest': [('x', -1 + 1.6 * s), ('z', 1)],
        'Neck':  [('x', 2.5 - 0.8 * s)],
        'Head':  [('x', -1.5), ('z', 1.6 * c), ('y', 1.0 * s)],
        'Thigh.L': [('x', -4), ('y', -2)],
        'Shin.L':  [('x', -6)],
        'Foot.L':  [('x', 4), ('z', -7)],
        'Thigh.R': [('x', 1), ('y', 2)],
        'Shin.R':  [('x', -2)],
        'Foot.R':  [('x', 1), ('z', 6)],
    }, swing_arms(0, reach=0, fold=12 + 2 * s, out=4, roll=1.5 * s))

# ---- Walk: heel strike, roll through the foot, 1.07 s cycle
def walk_contact(sign):
    L, R = ('L', 'R') if sign > 0 else ('R', 'L')
    return merge({
        'Hips':  [('loc', (0.0, 0.0, -0.021)), ('z', -5 * sign), ('y', -2 * sign)],
        'Spine': [('x', 3), ('z', 3 * sign)],
        'Chest': [('x', 1), ('z', 6 * sign)],
        'Neck':  [('x', 2)],
        'Head':  [('z', -2 * sign)],
        'Thigh.' + L: [('x', 25), ('y', -2)],
        'Shin.'  + L: [('x', -7)],
        'Foot.'  + L: [('x', 11)],
        'Toe.'   + L: [('x', 0)],
        'Thigh.' + R: [('x', -19), ('y', 2)],
        'Shin.'  + R: [('x', -17)],
        'Foot.'  + R: [('x', -27)],
        'Toe.'   + R: [('x', 24)],
    }, swing_arms(sign, reach=26, fold=18, out=3, roll=5 * sign))

def walk_pass(sign):
    L, R = ('L', 'R') if sign > 0 else ('R', 'L')
    return merge({
        'Hips':  [('loc', (0.0, 0.0, 0.013)), ('y', 1.5 * sign)],
        'Spine': [('x', 3)],
        'Chest': [('x', 1)],
        'Thigh.' + L: [('x', 2)],
        'Shin.'  + L: [('x', -4)],
        'Foot.'  + L: [('x', -7)],
        'Thigh.' + R: [('x', 7)],
        'Shin.'  + R: [('x', -48)],
        'Foot.'  + R: [('x', 9)],
        'Toe.'   + R: [('x', 0)],
    }, swing_arms(sign, reach=5, fold=14, out=3, roll=1 * sign))

# ---- Run: forward lean, airborne phase, arms out of the pockets
def run_contact(sign):
    L, R = ('L', 'R') if sign > 0 else ('R', 'L')
    return merge({
        'Hips':  [('loc', (0.0, 0.0, -0.030)), ('z', -9 * sign), ('y', -3 * sign), ('x', -6)],
        'Spine': [('x', 9), ('z', 5 * sign)],
        'Chest': [('x', 5), ('z', 12 * sign)],
        'Neck':  [('x', -5)],
        'Head':  [('x', -4)],
        'Thigh.' + L: [('x', 31), ('y', -3)],
        'Shin.'  + L: [('x', -27)],
        'Foot.'  + L: [('x', -3)],
        'Thigh.' + R: [('x', -34), ('y', 3)],
        'Shin.'  + R: [('x', -32)],
        'Foot.'  + R: [('x', -36)],
        'Toe.'   + R: [('x', 27)],
    }, swing_arms(sign, reach=44, fold=62, out=9, roll=6 * sign))

def run_flight(sign):
    L, R = ('L', 'R') if sign > 0 else ('R', 'L')
    return merge({
        'Hips':  [('loc', (0.0, 0.0, 0.034)), ('x', -6)],
        'Spine': [('x', 10)],
        'Chest': [('x', 5)],
        'Neck':  [('x', -5)],
        'Thigh.' + L: [('x', -16)],
        'Shin.'  + L: [('x', -54)],
        'Foot.'  + L: [('x', -22)],
        'Thigh.' + R: [('x', 23)],
        'Shin.'  + R: [('x', -104)],
        'Foot.'  + R: [('x', 14)],
    }, swing_arms(sign, reach=18, fold=70, out=9, roll=2 * sign))

bake('Idle', [(1 + i * 24, idle_pose(i / 4.0)) for i in range(5)])
bake('Walk', [(1, walk_contact(+1)), (9, walk_pass(+1)), (17, walk_contact(-1)),
              (25, walk_pass(-1)), (33, walk_contact(+1))])
bake('Run',  [(1, run_contact(+1)), (7, run_flight(+1)), (13, run_contact(-1)),
              (19, run_flight(-1)), (25, run_contact(+1))])
rig.animation_data.action = bpy.data.actions['Idle']

bpy.context.view_layer.objects.active = rig
for ob in bpy.data.objects:
    ob.select_set(ob in (rig, mesh))
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB',
    export_image_format='JPEG', export_jpeg_quality=85,
    export_yup=True, export_apply=False, export_skins=True,
    export_animations=True, export_animation_mode='ACTIONS',
    export_force_sampling=True, export_bake_animation=True,
    export_optimize_animation_size=False, use_selection=True)
print("[rig] wrote", OUT)

if FBX:
    # add_leaf_bones off and all actions baked: that is what makes Unity import three
    # separate clips called Idle, Walk and Run instead of one nameless take.
    bpy.ops.export_scene.fbx(
        filepath=FBX, use_selection=True, apply_unit_scale=True,
        apply_scale_options='FBX_SCALE_ALL', object_types={'ARMATURE', 'MESH'},
        use_mesh_modifiers=True, mesh_smooth_type='FACE', add_leaf_bones=False,
        primary_bone_axis='Y', secondary_bone_axis='X',
        bake_anim=True, bake_anim_use_all_bones=True, bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=True, bake_anim_force_startend_keying=True,
        bake_anim_step=1.0, bake_anim_simplify_factor=0.0,
        path_mode='STRIP', embed_textures=False, axis_forward='-Z', axis_up='Y')
    print("[rig] wrote", FBX)

# Last, because writing the maps out re-points the images at files on disk and both
# exporters would then embed those PNGs rather than re-encoding to JPEG.
save_maps(os.path.dirname(os.path.abspath(FBX)) if FBX else None)

print("[rig] done")
