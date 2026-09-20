# The salaryman: character setup and controls

How to get a Blender model walking around Konto, and how the Xbox pad is wired up.

---

## 1. Getting the model out of Blender

Most character problems in Unity are export problems. Three things matter.

**Apply the scale.** In Blender, select the object, `Ctrl+A` → **Scale**. If the object's scale
is anything other than 1,1,1 when you export, Unity inherits the mess.

**Export as FBX** (`File → Export → FBX`) with:

| Setting | Value |
|---|---|
| Path Mode | Copy, with the embed-textures button on |
| Apply Scalings | **FBX All** |
| Forward | **-Z Forward** |
| Up | **Y Up** |
| Apply Unit | ticked |
| Object Types | Armature + Mesh only |
| Add Leaf Bones | **off** |
| Bake Animation | on, only if the model has actions |

Blender is Z-up and Unity is Y-up, which is what `-Z Forward / Y Up` corrects. Without it your
character lies on its back.

**A human should be about 1.8 m tall in Blender.** Not 1.8 units-that-are-really-centimetres.

You can drop a `.blend` file straight into Unity instead of exporting — Unity converts it by
calling Blender in the background. It works, but it is slower on every reimport and gives you
less control, so FBX is the better habit.

---

## 2. Importing into Unity

Drop the FBX into `Assets/SalaryMan/Characters/` (make the folder). Select it and check the
Inspector tabs:

**Model tab**
- **Scale Factor** — leave at 1 if you exported correctly. If your character imports at 1/100th
  size, set this to 100 rather than scaling the transform.
- **Convert Units** — ticked.

**Rig tab**
- **Animation Type: Humanoid** if it has a human skeleton, then **Apply**. Humanoid lets you
  retarget any humanoid animation onto it, including free Mixamo clips, which is almost always
  what you want for a character.
- Press **Configure** and check the bone mapping is all green.
- Use **Generic** only for non-human rigs.

**Materials tab**
- **Material Creation Mode: Standard**, **Location: Use External Materials**. Blender materials
  do not survive FBX intact — expect to rebuild them as HDRP/Lit materials afterwards.

---

## 3. Building the character

**Tools → SalaryMan → Character Setup**

Drag the imported model prefab into the **Model** field and press **Create character**.

You get a `Salaryman Player` object with:

- A `CharacterController` capsule **measured from the model's renderers**, not guessed. Slope
  limit 52°, because Konto is steep and Unity's default 45° gets you stuck on hillsides.
- `KontoCharacter` — camera-relative movement, walk/jog/sprint/crouch, jump with coyote time.
- A camera pivot at shoulder height, with the main camera given a `KontoThirdPersonCamera`.
- A `Player` layer, created if needed, excluded from the camera's collision mask and the
  character's ground check. Without that the camera jams against your own body.
- Dropped onto the terrain under wherever the scene view is looking.

Watch the Console. It prints the measured height and tells you whether it found an Animator.

---

## 4. Animation

The character drives these Animator parameters, and **every one is optional** — whatever your
controller does not have is simply skipped, so movement works before you have any animation:

| Parameter | Type | Meaning |
|---|---|---|
| `Speed` | float | Planar speed in m/s: 0 idle, ~1.6 walking, ~3.8 jogging, ~6.4 sprinting |
| `Grounded` | bool | On the ground |
| `Jump` | trigger | Fired the moment a jump starts |
| `FreeFall` | bool | Airborne and descending |
| `MotionSpeed` | float | Always 1; there for playback-rate blending |

These names match Unity's **Starter Assets** package, so its free animation set and controller
work with no changes. Import Starter Assets from the Package Manager samples, then assign its
controller to your model's Animator.

For your own controller: a 1D blend tree on `Speed` covering idle → walk → jog → sprint gets you
90% of the way.

If the character slides around in a T-pose or a rest pose, movement is working and animation is
not, and there are four things it can be. In order of how often it is each one:

1. **No Animator Controller assigned.**
2. **No Avatar on the Animator.** A generic rig animates through one, and a model that was ever
   imported with its animation type set to None does not have one. Select the FBX, set **Rig →
   Animation Type** to Generic, and make sure **Avatar Definition** is *Create From This Model*.
3. **The Animator is on the wrong object.** Animation curve paths are relative to the Animator's
   own transform, so an Animator on the capsule is looking for `Model/Hips/...` when the clip
   says `Hips/...`. It belongs on the imported model's root, and there should only be one.
4. **Culling.** `Cull Update Transforms` stops the bones being written whenever Unity decides the
   renderer is off screen, and a generic rig's bounds are not always right. A hero character
   should be on **Always Animate**.

For Seiko specifically, **Tools → SalaryMan → Check Seiko's Rig** prints all four, and
**Put Seiko In The Scene** sets all four.

---

## 4a. How Seiko himself was built

`Tools/rig_seiko.py` takes the Meshy mesh and produces the FBX and the glTF: a 21 bone skeleton,
bone-heat weights, and Idle, Walk and Run authored as poses in the script rather than captured.

Two things in there are worth knowing, because both came from the mesh fighting back.

**He is modelled with his hands in his pockets.** The forearms run forward and inward into them,
and every animation laid on top of that rest pose is fighting it. So the script poses the arms
down and clear of the body, bakes that shape into the mesh, makes it the rest pose, and works the
weights out again on the result. The pose is not a set of hand-picked angles — hand-picked angles
gave a man with his elbows out and his hands on his hips. Each arm bone is *aimed*: the rotation
that takes the direction it currently points to the direction it should point, which does not care
what the source rig's bone rolls happen to be.

**He was centred on his bounding box**, so his origin sat at his waist and he stood buried to the
hips. The script moves the mesh so the soles are at z = 0 before anything else happens.

The maps come out as PNGs beside the model rather than embedded in the FBX, because what HDRP does
with an FBX's embedded textures depends on the Unity version and the pipeline that was active at
import; `KontoSeikoSetup` builds the material from the PNGs and remaps the model's slot onto it.

---

## 5. Controls

| Action | Keyboard & mouse | Xbox pad |
|---|---|---|
| Move | WASD | Left stick |
| Look | Mouse | Right stick |
| Sprint | Left shift | L3 (stick click) or LB |
| Jump | Space | A |
| Crouch | Left ctrl | B |
| First / third person | V | Y |
| Release cursor | Escape | Start |

Fly camera (`KontoFreeCamera`, used for surveying the world):

| Action | Keyboard & mouse | Xbox pad |
|---|---|---|
| Move | WASD | Left stick |
| Look | Hold right mouse | Right stick |
| Up / down | E / Q | RT / LT |
| Sprint | Left shift | L3 or LB |
| Change speed | Scroll wheel | D-pad up/down |

Partial stick deflection walks and full deflection jogs, so the pad has a speed range the
keyboard does not.

---

## 6. Gamepad setup

**If the project uses the Input System package** (the Unity 6 HDRP template default) there is
nothing to do. The pad is read directly.

**If the project uses the legacy Input Manager**, the left stick already works through Unity's
default Horizontal and Vertical axes, but the right stick, triggers and D-pad do not exist yet.
Run **Tools → SalaryMan → Install Gamepad Axes**. It writes five axes into
`ProjectSettings/InputManager.asset` and is safe to run repeatedly.

Check which one you are on: **Edit → Project Settings → Player → Active Input Handling**.

### A caveat about axis numbers

The installed axes use the **Windows** XInput layout: right stick on axes 4 and 5, triggers
sharing axis 3, D-pad on axes 6 and 7.

**macOS and Linux number them differently**, and on macOS the two triggers report as separate
axes instead of sharing one. If the right stick does nothing on a Mac, open **Project Settings →
Input Manager**, find `Konto Look X` / `Konto Look Y`, and try axis 3 and 4 instead.

The Input System package has none of this problem, which is the real argument for using it.

---

## 7. Tuning

On `KontoCharacter`:

| Field | Default | Note |
|---|---|---|
| `walkSpeed` | 1.6 | An unhurried salaryman |
| `jogSpeed` | 3.8 | Full stick, no sprint |
| `sprintSpeed` | 6.4 | Fast for a man in a suit; lower it for realism |
| `acceleration` | 10 | Lower feels heavier and more deliberate |
| `turnSmoothing` | 0.08 | Raise for a weightier turn, drop to 0 for instant |
| `gravity` | −20 | Deliberately stronger than real gravity; 9.81 feels floaty |
| `slopeLimit` (on the CharacterController) | 52 | Below about 45 you get stuck on Konto's hillsides |

On `KontoThirdPersonCamera`:

| Field | Note |
|---|---|
| `distance` | How far back the camera sits |
| `pivotOffset` | X gives an over-the-shoulder framing; Y is shoulder height |
| `rotationSmoothing` | 0 is precise, higher is cinematic; above ~0.1 feels laggy |
| `collisionRadius` | Must be larger than the camera's near clip plane |
| `sprintFovBoost` | 6° is plenty; more induces nausea |
| `invertY` | Per taste |

---

## 8. Troubleshooting

**The character falls through the terrain.** The terrain has no collider, or the ground check
is on the wrong layers. Terrain objects get a `TerrainCollider` automatically — check it is
still there. Also check `groundLayers` on `KontoCharacter` includes the terrain's layer.

**The character is enormous or microscopic.** An export scale problem. The Console prints the
measured height on creation. Fix it at the import settings (Scale Factor), not by scaling the
transform, or the physics will not match what you see.

**The character lies on its back.** Exported with Blender's Z-up. Re-export with
`-Z Forward, Y Up`.

**The model faces the wrong way while walking.** Your model's forward is not +Z. Rotate the mesh
in Blender so it faces −Y (which becomes +Z in Unity), apply the rotation, and re-export.

**The camera clips through hills.** Raise `collisionRadius`, and check `collisionLayers` includes
the terrain. If the camera jams against the character instead, the `Player` layer was not created
— check `Project Settings → Tags and Layers` and re-run the setup.

**The pad does nothing.** On legacy input, run the axis installer. On either backend, check the
pad is recognised by Windows first. `KontoInput.GamepadPresent` tells you what Unity sees.

**The camera spins wildly with a pad connected.** Stick drift. The dead zone is
`KontoInput.StickDeadZone`, default 0.18 — raise it for a worn pad.

**Look speed is fine on mouse but absurd on stick, or vice versa.** They are separate settings
(`mouseSensitivity` and `stickSensitivity`) because they are fundamentally different signals: a
mouse reports how far it moved, a stick reports how far it is pushed. `KontoInput` applies frame
time to the stick only, which is why they cannot share one number.
