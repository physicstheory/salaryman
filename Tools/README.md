# Tools

## `rig_seiko.py`

Turns the Meshy salaryman `.blend` into the rigged, animated `Web/seiko.glb`.

```
blender -b <meshy>.blend -P Tools/rig_seiko.py
```

It works out which way the mesh faces from its feet and turns it to face +Y, scales him to 1.74 m,
decimates to about 30k triangles, drops the textures to 1024, builds a 21 bone humanoid armature
from measurements taken off the mesh itself, skins it with bone heat weights, brings the arms down
to hang at the sides and bakes that as the rest pose, keyframes the Idle / Walk / Run cycles as
rotations about world axes, and exports **both** a GLB (for the browser build) and an **FBX** (for
Unity, which reads glTF only with a package). Override the paths with `SEIKO_GLB=` and
`SEIKO_FBX=`.

The FBX is exported with leaf bones off and all actions baked, which is what makes Unity import
three separate clips rather than one nameless take. `KontoSeikoSetup` then sets the import up and
builds the blend tree.

Nothing in it is told what the source mesh looks like, because the source mesh has changed twice
and every assumption about the first one was wrong for the second. The shoulders are found by
slicing outwards until the slice stops being a body and starts being a limb, the elbows and wrists
by dividing the reach from shoulder to fingertip, the hips, knees and ankles from the two lobes a
horizontal slice through the legs splits into. Drop a different humanoid in and it measures that
one instead.

## `fbx_axes.py`

Which way does the model in an FBX actually face?

```
python3 Tools/fbx_axes.py Assets/SalaryMan/Characters/Seiko.fbx
```

A small binary FBX reader, a least squares fit of the vertices that went into the export against
the vertices that came out, and the node rotations the exporter baked in. Together those give the
direction the model faces once Unity has imported the file, and `rig_seiko.py` uses it to choose an
export orientation rather than trusting one: Unity's character controller takes "facing" to mean
+Z, and the obvious export setting puts it on -Z, which is a character who walks backwards. The
script exports, measures, flips if it has to, and refuses to write a file it cannot get onto +Z.

It needs nothing but the standard library, so it runs inside Blender's Python as well as outside.

Mixamo does this job interactively through Adobe's site and could not be reached from the machine
this was built on. This script is the stand-in: the same humanoid hierarchy, authored locally.
