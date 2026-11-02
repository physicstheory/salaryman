# Build a humanoid rig for a Meshy salaryman mesh, skin it, author Idle / Walk / Run
# cycles, and export a GLB for the browser build and an FBX for Unity.
#
# Nothing here is told what the source mesh looks like. Which way it faces is measured
# from its feet, where its shoulders, elbows, wrists, hips, knees and ankles are is
# measured by slicing it, and which way it ends up facing in the exported FBX is measured
# by reading the file back. The model has been swapped twice already - once standing with
# its hands in its pockets, once in a T pose - and every assumption typed in about the
# first one was wrong for the second.
#
# Everything below the facing check reads in ordinary terms: +X is his right, +Y is
# forward, +Z is up.
import bpy, math, os, sys
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


def facing():
    """+1 if the mesh faces +Y, -1 if it faces -Y.

    Decided by the feet, because feet are unambiguous: the toes reach much further in
    front of the ankle than the heel reaches behind it. The head is a second opinion -
    a face pushes the mean of the skull forward - and the two are printed together, so
    a model that disagrees with itself says so instead of being silently turned round.
    """
    co = [v.co for v in mesh.data.vertices]
    zl = min(v.z for v in co); hh = max(v.z for v in co) - zl
    feet = [v for v in co if v.z < zl + hh * 0.06]
    shin = sorted(v.y for v in co if zl + hh * 0.10 < v.z < zl + hh * 0.17)
    ankle = shin[len(shin) // 2] if shin else 0.0
    toes = (max(v.y for v in feet) - ankle) - (ankle - min(v.y for v in feet))
    skull = head_cy()
    print("[rig] facing: feet %+.4f, head %+.4f -> %s" %
          (toes, skull, '+Y' if toes > 0 else '-Y'))
    if (toes > 0) != (skull > 0):
        print("[rig] WARNING: feet and head disagree about which way he faces; trusting the feet")
    return 1.0 if toes > 0 else -1.0


# Everything below is written as if he faces +Y, so if he does not, he does now.
if facing() < 0:
    mesh.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))
    mesh.data.update()
    print("[rig] turned him round to face +Y")
    if facing() < 0:
        raise SystemExit("[rig] could not work out which way the model faces")

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
# The skeleton is measured off the mesh rather than typed in. The first model was
# standing with his hands in his pockets, the second is in a T pose, and a set of
# landmarks that fits one fits the other nowhere near well enough to skin. So the
# arms are found by slicing outwards until the slice stops being a body and starts
# being a limb, and the legs by finding the two lobes a horizontal slice splits into.
CO = [v.co for v in mesh.data.vertices]
XS = max(abs(v.x) for v in CO)


def slab(axis, at, tol):
    if axis == 'x':
        return [v for v in CO if abs(abs(v.x) - at) < tol]
    return [v for v in CO if abs(v.z - at) < tol]


def arm_at(x):
    """Centre of the arm where it crosses this distance from the middle: (z, y)."""
    band = slab('x', x, XS * 0.025)
    if not band:
        return None
    return (sum(v.z for v in band) / len(band), sum(v.y for v in band) / len(band))


def shoulder_x():
    """Where the body stops and the arm starts: the first slice thin enough to be a limb."""
    for i in range(12, 60):
        x = XS * i / 60.0
        band = slab('x', x, XS * 0.025)
        if not band:
            continue
        thick = max(v.z for v in band) - min(v.z for v in band)
        if thick < H * 0.16:
            return x
    return XS * 0.30


def leg_x(at_z):
    """Half the distance between the legs at a height: the centre of one lobe."""
    band = slab('z', at_z, H * 0.012)
    right = [v.x for v in band if v.x > XS * 0.01]
    if not right:
        return H * 0.055
    return (min(right) + max(right)) * 0.5


SHX = shoulder_x()
TIPX = XS
# Upper arm, forearm and hand divide the reach from shoulder to fingertip roughly
# a third, a third and a fifth. The bones only have to land inside the limb.
ELX = SHX + (TIPX - SHX) * 0.44
WRX = SHX + (TIPX - SHX) * 0.80
SH_Z, SH_Y = arm_at(SHX * 1.04) or (z(0.80), 0.0)
EL_Z, EL_Y = arm_at(ELX) or (z(0.72), 0.0)
WR_Z, WR_Y = arm_at(WRX) or (z(0.66), 0.0)
HD_Z, HD_Y = arm_at((WRX + TIPX) * 0.5) or (WR_Z, WR_Y)

HIPW = leg_x(z(0.45))
KNEEW = leg_x(z(0.28))
ANKW = leg_x(z(0.07))

# The foot: the toe reaches forward of the ankle, which is how the mesh was told
# which way it faces in the first place.
feet = [v for v in CO if v.z < zmin + H * 0.06]
TOE_Y = max(v.y for v in feet) * 0.72 if feet else H * 0.09
ANK_Y = sorted(v.y for v in slab('z', z(0.13), H * 0.03))[len(slab('z', z(0.13), H * 0.03)) // 2] if slab('z', z(0.13), H * 0.03) else 0.0

print("[rig] measured: shoulder x %.3f  elbow %.3f  wrist %.3f  fingertip %.3f" % (SHX, ELX, WRX, TIPX))
print("[rig]           arm line z %.3f -> %.3f -> %.3f   y %+.3f -> %+.3f -> %+.3f"
      % (SH_Z, EL_Z, WR_Z, SH_Y, EL_Y, WR_Y))
print("[rig]           leg x hip %.3f knee %.3f ankle %.3f   toe y %+.3f ankle y %+.3f"
      % (HIPW, KNEEW, ANKW, TOE_Y, ANK_Y))

BONES = [
    ("Hips",  (0.0, 0.0, z(0.525)), (0.0, 0.0, z(0.600)), None,    False),
    ("Spine", (0.0, 0.0, z(0.600)), (0.0, 0.0, z(0.690)), "Hips",  True),
    ("Chest", (0.0, 0.0, z(0.690)), (0.0, 0.0, z(0.800)), "Spine", True),
    ("Neck",  (0.0, 0.0, z(0.800)), (0.0, 0.0, z(0.860)), "Chest", True),
    ("Head",  (0.0, 0.0, z(0.860)), (0.0, 0.01, z(0.995)), "Neck", True),
]
for s, sx in (("L", -1.0), ("R", 1.0)):
    BONES += [
        ("Shoulder."+s, (sx*SHX*0.22, 0.0,   z(0.800)), (sx*SHX,   SH_Y, SH_Z), "Chest",       False),
        ("UpperArm."+s, (sx*SHX,      SH_Y,  SH_Z),     (sx*ELX,   EL_Y, EL_Z), "Shoulder."+s, True),
        ("Forearm."+s,  (sx*ELX,      EL_Y,  EL_Z),     (sx*WRX,   WR_Y, WR_Z), "UpperArm."+s, True),
        ("Hand."+s,     (sx*WRX,      WR_Y,  WR_Z),     (sx*(WRX + (TIPX-WRX)*0.75), HD_Y, HD_Z), "Forearm."+s, True),
        ("Thigh."+s,    (sx*HIPW,  ANK_Y*0.3, z(0.520)), (sx*KNEEW, ANK_Y*0.6, z(0.290)), "Hips",     False),
        ("Shin."+s,     (sx*KNEEW, ANK_Y*0.6, z(0.290)), (sx*ANKW,  ANK_Y,     z(0.045)), "Thigh."+s, True),
        ("Foot."+s,     (sx*ANKW,  ANK_Y,     z(0.045)), (sx*ANKW,  TOE_Y,     z(0.012)), "Shin."+s,  True),
        ("Toe."+s,      (sx*ANKW,  TOE_Y,     z(0.012)), (sx*ANKW,  TOE_Y + H*0.035, z(0.010)), "Foot."+s, True),
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
#
# The angles are not guessed. Guessing produced a man standing with his elbows out and his
# hands on his hips, which is a pose, just not this one. Instead each bone is aimed: the
# rotation that takes the direction it currently points to the direction it should point.
# That is robust to whatever the source rig's bone rolls happen to be.
def aim_bone(name, direction):
    """Turn a pose bone so it points along a direction in armature space."""
    pb = rig.pose.bones[name]
    bpy.context.view_layer.update()
    current = pb.tail - pb.head
    if current.length < 1e-6:
        return
    turn = current.normalized().rotation_difference(Vector(direction).normalized())
    head = pb.head.copy()
    pb.matrix = (Matrix.Translation(head) @ turn.to_matrix().to_4x4()
                 @ Matrix.Translation(-head) @ pb.matrix)
    bpy.context.view_layer.update()


# He faces +Y by now, so -Y is behind him. An arm at rest hangs down, a little out from
# the body so the hand clears the hip, and a little behind the shoulder.
AIM_ARMS = [
    ('UpperArm.L', (-0.20, -0.06, -0.98)),
    ('UpperArm.R', ( 0.20, -0.06, -0.98)),
    ('Forearm.L',  (-0.10, -0.02, -0.99)),
    ('Forearm.R',  ( 0.10, -0.02, -0.99)),
    ('Hand.L',     (-0.06,  0.04, -1.00)),
    ('Hand.R',     ( 0.06,  0.04, -1.00)),
]

bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')
for pb in rig.pose.bones:
    pb.rotation_quaternion = Quaternion((1, 0, 0, 0))
    pb.location = (0, 0, 0)
for bone, direction in AIM_ARMS:
    aim_bone(bone, direction)
for bone, _ in AIM_ARMS:
    pb = rig.pose.bones[bone]
    print("[rig] %-12s now points to (%.2f, %.2f, %.2f), hand at %.2f m" % (
        (bone,) + tuple((pb.tail - pb.head).normalized()) + (pb.tail.z,)))
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
    def export_fbx(forward):
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
            path_mode='STRIP', embed_textures=False, axis_forward=forward, axis_up='Y')

    # Which way he faces in the exported file is measured, not assumed. Unity's character
    # controller turns the model to face the way it is going and takes "facing" to mean +Z,
    # so the file has to come out with his front along +Z. The mesh going in faces +Y.
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import fbx_axes

    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(depsgraph)
    sent = [tuple(v.co) for v in evaluated.data.vertices]

    unity_facing = None
    for forward in ('-Z', 'Z', 'X', '-X'):
        export_fbx(forward)
        unity_facing, _ = fbx_axes.facing_in_unity(FBX, sent)
        print("[rig] axis_forward=%-2s -> in Unity he faces (%+.2f, %+.2f, %+.2f)"
              % (forward, unity_facing[0], unity_facing[1], unity_facing[2]))
        if unity_facing[2] > 0.95:
            break
        print("[rig] not +Z, so that is a character who walks backwards. Trying the next one.")

    if unity_facing is None or unity_facing[2] < 0.95:
        raise SystemExit("[rig] no export orientation puts his front on +Z; refusing to ship a "
                         "model that walks backwards")
    print("[rig] wrote", FBX, "- facing +Z, which is forward in Unity")

# Last, because writing the maps out re-points the images at files on disk and both
# exporters would then embed those PNGs rather than re-encoding to JPEG.
save_maps(os.path.dirname(os.path.abspath(FBX)) if FBX else None)

print("[rig] done")
