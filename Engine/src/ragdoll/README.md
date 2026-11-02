# Shigoto ragdoll

`SHIGOTO.RagdollSystem` makes any rigged human (Biped/Rocketbox, Mixamo, VRM, Meshy, Tripo bone names) go limp, fall, tumble
and slide under physics, then get back up. Needs only THREE.

- Body: 15 point masses at the joints (Dempster segment masses), position Verlet at a fixed 240 Hz, 6 solver passes.
  Rigid limbs, a braced torso that bends and twists a little, joint limits (knee hinge, hip extension about 20 degrees,
  hip flexion about 125 degrees, neck, knees/elbows cannot fold flat, limbs keep apart).
- Contact: per-joint radius on the host's ground, Coulomb friction (`friction(x,z)`, default 0.65), a little bounce on hard
  landings only, solver corrections never launch a body, kerbs and steps act as walls, `blocked(x,z,r,y)` for buildings.
- Skinning: each simulated bone's rotation is how far its particle frame turned since the hit, on top of the pose it had.
- Get-up: face down pushes up to all fours, face up sits up, both through a crouch to standing (targets for the same
  particles, so nothing stretches), then 0.4 s blend back into the host's animation.

```js
const sys = new SHIGOTO.RagdollSystem({ THREE, ground: (x, z, refY) => y, blocked, friction, maxActive: 10 });
const rd = sys.spawn(root, { strike: carVel } | { velocity, spin } | { push: { x, y, z, at: "chest" } },
                     dead, getUp, facing, onSettle, onUp(rd, { x, y, z, yaw, prone }), onHit(rd, speed, part) });
sys.update(dt);   // every frame, after the animation mixers, before rendering
```

Sandbox: `Web/engine/ragdoll.html?model=salaryman_04&auto`. Game side: `Web/game/ragdoll-hook.js` (`window.ragdoll`).
Test in the game: `Game/tools/ragdolltest.mjs <out>`.
