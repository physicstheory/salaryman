// Real rigid-body physics: Rapier (Rust, compiled to WebAssembly), stepped at a fixed 60 Hz with interpolated meshes.
//
// Everything that collides is owned by a key (a streamed cell, the game's solids around the player, a prop), so a
// cell going out of range takes its colliders with it in one call. Static geometry is boxes, heightfields and
// triangle meshes; dynamic props are boxes, spheres, cylinders and capsules with real mass, friction, restitution
// and buoyancy. Kinematic proxies let the game's own movers (Seiko, the car he is driving) shove props aside, and
// the character controller gives anything that walks proper steps, slopes and ground snapping.

import RAPIER from "@dimforge/rapier3d-compat";

const STEP = 1 / 60;

export class Physics {
  constructor(engine) {
    this.engine = engine;
    this.THREE = engine.THREE;
    this.R = RAPIER;
    this.ready = false;
    this.acc = 0;
    this.alpha = 0;
    this.owners = new Map(); // key -> { colliders: [], bodies: [] }
    this.dynamics = [];      // { body, mesh, prev, cur, buoyancy, volume }
    this.kinematics = [];    // { body, target, quat }
    this.characters = [];
    this.impactMin = 2.5;
  }

  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    this.events = new RAPIER.EventQueue(true);
    this.ready = true;
    const T = this.THREE;
    this._v = new T.Vector3(); this._q = new T.Quaternion(); this._q2 = new T.Quaternion(); this._e = new T.Euler();
  }

  // ---- ownership ---------------------------------------------------------------------------------------------
  _own(key) {
    let o = this.owners.get(key);
    if (!o) this.owners.set(key, (o = { colliders: [], bodies: [] }));
    return o;
  }
  removeOwner(key) {
    const o = this.owners.get(key);
    if (!o) return;
    for (const c of o.colliders) if (this.world.getCollider(c.handle)) this.world.removeCollider(c, false);
    for (const b of o.bodies) {
      const i = this.dynamics.findIndex(d => d.body === b);
      if (i >= 0) {
        const d = this.dynamics[i];
        if (d.mesh && d.mesh.parent && d.removeMesh) d.mesh.parent.remove(d.mesh);
        this.dynamics.splice(i, 1);
      }
      if (this.world.getRigidBody(b.handle)) this.world.removeRigidBody(b);
    }
    this.owners.delete(key);
  }
  hasOwner(key) { return this.owners.has(key); }

  // ---- static geometry -------------------------------------------------------------------------------------
  // A box: centre [x,y,z], size [w,h,d] (full extents), yaw in radians about +Y.
  addStaticBox(key, c, size, yaw, opts) {
    const R = this.R;
    const d = R.ColliderDesc.cuboid(Math.max(0.01, size[0] / 2), Math.max(0.01, size[1] / 2), Math.max(0.01, size[2] / 2))
      .setTranslation(c[0], c[1], c[2])
      .setFriction(opts && opts.friction != null ? opts.friction : 0.8);
    if (yaw) d.setRotation(yawQuat(yaw));
    const col = this.world.createCollider(d);
    col.userData = opts && opts.tag;
    this._own(key).colliders.push(col);
    return col;
  }
  // A heightfield: n x n quads covering `size` metres centred on (cx, cz). heights(i, j) gives y at x index i, z index j.
  addHeightfield(key, cx, cz, size, n, heightAt) {
    const R = this.R;
    const h = new Float32Array((n + 1) * (n + 1));
    // Rapier's heightfield is column-major: rows run along Z, columns along X (checked with a ray test).
    for (let ix = 0; ix <= n; ix++) for (let iz = 0; iz <= n; iz++) {
      const x = cx - size / 2 + (ix / n) * size, z = cz - size / 2 + (iz / n) * size;
      h[iz + ix * (n + 1)] = heightAt(x, z);
    }
    const d = R.ColliderDesc.heightfield(n, n, h, { x: size, y: 1, z: size }).setTranslation(cx, 0, cz).setFriction(0.9);
    const col = this.world.createCollider(d);
    this._own(key).colliders.push(col);
    return col;
  }
  addTrimesh(key, vertices, indices, opts) {
    const d = this.R.ColliderDesc.trimesh(vertices, indices).setFriction(opts && opts.friction != null ? opts.friction : 0.8);
    const col = this.world.createCollider(d);
    this._own(key).colliders.push(col);
    return col;
  }

  // ---- dynamic props ---------------------------------------------------------------------------------------
  // spec: { shape: "box"|"sphere"|"cylinder"|"capsule", size: [..], pos: [x,y,z], yaw, mass, friction, restitution,
  //         mesh (THREE.Object3D to drive), buoyancy (0..2, 1 = floats level), sleeping, damping }
  addDynamic(key, spec) {
    const R = this.R;
    const s = spec.size || [0.5, 0.5, 0.5];
    let cd;
    switch (spec.shape) {
      case "sphere": cd = R.ColliderDesc.ball(s[0]); break;
      case "cylinder": cd = R.ColliderDesc.cylinder(s[1] / 2, s[0]); break;
      case "capsule": cd = R.ColliderDesc.capsule(Math.max(0.01, s[1] / 2 - s[0]), s[0]); break;
      case "cone": cd = R.ColliderDesc.cone(s[1] / 2, s[0]); break;
      default: cd = R.ColliderDesc.cuboid(s[0] / 2, s[1] / 2, s[2] / 2);
    }
    const vol = shapeVolume(spec.shape, s);
    cd.setDensity((spec.mass || 10) / vol)
      .setFriction(spec.friction != null ? spec.friction : 0.6)
      .setRestitution(spec.restitution != null ? spec.restitution : 0.15)
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold((spec.mass || 10) * 30);
    const p = spec.pos || [0, 0, 0];
    const bd = R.RigidBodyDesc.dynamic().setTranslation(p[0], p[1], p[2])
      .setLinearDamping(spec.damping != null ? spec.damping : 0.05).setAngularDamping(0.2).setCcdEnabled(!!spec.ccd);
    if (spec.quat) bd.setRotation(spec.quat); else if (spec.yaw) bd.setRotation(yawQuat(spec.yaw));
    if (spec.sleeping) bd.setSleeping(true);
    const body = this.world.createRigidBody(bd);
    const col = this.world.createCollider(cd, body);
    col.userData = spec.tag;
    const rec = { body, col, mesh: spec.mesh || null, removeMesh: spec.removeMesh !== false, volume: vol, buoyancy: spec.buoyancy != null ? spec.buoyancy : 0, halfH: halfHeight(spec.shape, s),
      prevP: new this.THREE.Vector3(p[0], p[1], p[2]), curP: new this.THREE.Vector3(p[0], p[1], p[2]),
      prevQ: new this.THREE.Quaternion(), curQ: new this.THREE.Quaternion(), tag: spec.tag, offsetY: spec.meshOffsetY || 0 };
    const r = body.rotation(); rec.curQ.set(r.x, r.y, r.z, r.w); rec.prevQ.copy(rec.curQ);
    this.dynamics.push(rec);
    this._own(key).bodies.push(body);
    this._own(key).colliders.push(col);
    return rec;
  }

  // A body the game moves by hand (Seiko's capsule, the car he is in). It pushes dynamic props; nothing pushes it.
  addKinematic(key, shape, size) {
    const R = this.R;
    const body = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    let cd = shape === "capsule" ? R.ColliderDesc.capsule(Math.max(0.01, size[1] / 2 - size[0]), size[0]) : R.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2);
    const col = this.world.createCollider(cd, body);
    const k = { body, col, key, set: (x, y, z, yaw) => { body.setNextKinematicTranslation({ x, y, z }); if (yaw != null) body.setNextKinematicRotation(yawQuat(yaw)); } };
    this.kinematics.push(k);
    this._own(key).bodies.push(body);
    this._own(key).colliders.push(col);
    return k;
  }

  // A walking character: capsule, steps up kerbs, slides along walls, snaps to the ground, pushes props.
  createCharacter(key, opts) {
    const R = this.R;
    const radius = (opts && opts.radius) || 0.35, height = (opts && opts.height) || 1.75;
    const body = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...(opts && opts.pos || [0, 2, 0])));
    const col = this.world.createCollider(R.ColliderDesc.capsule(height / 2 - radius, radius), body);
    const ctl = this.world.createCharacterController(0.02);
    ctl.setUp({ x: 0, y: 1, z: 0 });
    ctl.setMaxSlopeClimbAngle(48 * Math.PI / 180);
    ctl.setMinSlopeSlideAngle(55 * Math.PI / 180);
    ctl.enableAutostep(0.35, 0.2, false);
    ctl.enableSnapToGround(0.4);
    ctl.setApplyImpulsesToDynamicBodies(true);
    ctl.setCharacterMass(75);
    const ch = {
      body, col, ctl, vy: 0, grounded: false, half: height / 2,
      // desired: horizontal velocity {x, z} in m/s; jump: true to jump this frame. Returns the new centre position.
      move: (dt, vx, vz, jump) => {
        if (ch.grounded) { ch.vy = jump ? 5.2 : -1; } else ch.vy -= 9.81 * dt * 1.6;
        ctl.computeColliderMovement(col, { x: vx * dt, y: ch.vy * dt, z: vz * dt });
        const m = ctl.computedMovement();
        ch.grounded = ctl.computedGrounded();
        const t = body.translation();
        const n = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z };
        body.setNextKinematicTranslation(n);
        return n;
      },
      teleport: (x, y, z) => { body.setTranslation({ x, y, z }, true); ch.vy = 0; }
    };
    this.characters.push(ch);
    this._own(key).bodies.push(body);
    this._own(key).colliders.push(col);
    return ch;
  }

  // Cast a ray; returns { point:[x,y,z], normal:[x,y,z], toi, collider } or null.
  raycast(o, d, max, solidOnly) {
    const ray = new this.R.Ray({ x: o[0], y: o[1], z: o[2] }, { x: d[0], y: d[1], z: d[2] });
    const hit = this.world.castRayAndGetNormal(ray, max || 200, solidOnly !== false);
    if (!hit) return null;
    const t = hit.timeOfImpact != null ? hit.timeOfImpact : hit.toi;
    return { point: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], normal: [hit.normal.x, hit.normal.y, hit.normal.z], toi: t, collider: hit.collider };
  }

  // A shove: an explosion, a car horn's worth of panic. Impulses every dynamic body within r metres of p.
  blast(p, r, strength) {
    for (const d of this.dynamics) {
      const t = d.body.translation();
      const dx = t.x - p[0], dy = t.y - p[1], dz = t.z - p[2];
      const dist = Math.hypot(dx, dy, dz);
      if (dist > r || dist < 1e-3) continue;
      const k = strength * (1 - dist / r) * d.body.mass();
      d.body.applyImpulse({ x: dx / dist * k, y: (dy / dist + 0.6) * k, z: dz / dist * k }, true);
    }
  }

  update(dt) {
    if (!this.ready) return;
    const t0 = performance.now();
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 4) {
      for (const d of this.dynamics) { d.prevP.copy(d.curP); d.prevQ.copy(d.curQ); }
      this._buoyancy();
      this.world.step(this.events);
      this.acc -= STEP;
      steps++;
      for (const d of this.dynamics) {
        const p = d.body.translation(), r = d.body.rotation();
        d.curP.set(p.x, p.y, p.z); d.curQ.set(r.x, r.y, r.z, r.w);
      }
      this.events.drainContactForceEvents(ev => {
        const m = ev.totalForceMagnitude();
        this.engine.events.emit("impact", { force: m, a: ev.collider1(), b: ev.collider2() });
      });
    }
    if (steps === 4) this.acc = 0; // fell behind: drop time rather than spiral
    this.alpha = this.acc / STEP;
    // Interpolate meshes between the last two physics states so motion is smooth at any frame rate.
    for (const d of this.dynamics) {
      if (!d.mesh) continue;
      d.mesh.position.lerpVectors(d.prevP, d.curP, this.alpha);
      d.mesh.position.y += d.offsetY;
      d.mesh.quaternion.slerpQuaternions(d.prevQ, d.curQ, this.alpha);
    }
    const s = this.engine.stats;
    s.physicsMs = performance.now() - t0;
    s.bodies = this.dynamics.length;
    s.colliders = this.world.colliders.len();
  }

  // Bodies in water get lifted by the weight of the water they push aside, and dragged.
  _buoyancy() {
    const water = this.engine.water;
    if (!water || !water.bodies.length) return;
    for (const d of this.dynamics) {
      if (!d.buoyancy || d.body.isSleeping()) continue;
      const p = d.body.translation();
      const level = water.levelAt(p.x, p.z);
      if (level == null) continue;
      const depth = level - (p.y - d.halfH);
      if (depth <= 0) continue;
      const sub = Math.min(1, depth / (2 * d.halfH));
      const lift = sub * d.volume * 1000 * 9.81 * STEP * d.buoyancy * 0.5;
      d.body.applyImpulse({ x: 0, y: lift, z: 0 }, true);
      const v = d.body.linvel();
      const drag = 1 - Math.min(0.9, 2.5 * sub * STEP);
      d.body.setLinvel({ x: v.x * drag + water.current[0] * sub * STEP, y: v.y * drag, z: v.z * drag + water.current[1] * sub * STEP }, true);
      const w = d.body.angvel();
      d.body.setAngvel({ x: w.x * drag, y: w.y * drag, z: w.z * drag }, true);
    }
  }

  dispose() { if (this.world) this.world.free(); }
}

function yawQuat(yaw) { return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }; }
function shapeVolume(shape, s) {
  switch (shape) {
    case "sphere": return 4 / 3 * Math.PI * s[0] ** 3;
    case "cylinder": return Math.PI * s[0] * s[0] * s[1];
    case "cone": return Math.PI * s[0] * s[0] * s[1] / 3;
    case "capsule": return Math.PI * s[0] * s[0] * (s[1] - 2 * s[0]) + 4 / 3 * Math.PI * s[0] ** 3;
    default: return s[0] * s[1] * s[2];
  }
}
function halfHeight(shape, s) { return shape === "sphere" ? s[0] : s[1] / 2; }
