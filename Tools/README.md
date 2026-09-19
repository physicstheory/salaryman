# Tools

## `rig_seiko.py`

Turns the Meshy salaryman `.blend` into the rigged, animated `Web/seiko.glb`.

```
blender -b <meshy>.blend -P Tools/rig_seiko.py
```

It spins the mesh to face +Y, scales him to 1.74 m, decimates to about 27k triangles, drops the
textures to 1024, builds a 21 bone humanoid armature from measurements taken off the mesh itself,
skins it with bone heat weights, keyframes the Idle / Walk / Run cycles as rotations about world
axes, and exports **both** a GLB (for the browser build) and an **FBX** (for Unity, which reads
glTF only with a package). Override the paths with `SEIKO_GLB=` and `SEIKO_FBX=`.

The FBX is exported with leaf bones off and all actions baked, which is what makes Unity import
three separate clips rather than one nameless take. `KontoSeikoSetup` then sets the import up and
builds the blend tree.

The bone positions at the top of the file were measured by slicing the mesh at height fractions
and clustering the slices in x — that is how the legs, the elbows and the head were found. If the
source mesh is replaced, re-measure before trusting them.

Mixamo does this job interactively through Adobe's site and could not be reached from the machine
this was built on. This script is the stand-in: the same humanoid hierarchy, authored locally.
