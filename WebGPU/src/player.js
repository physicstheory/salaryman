// Seiko on foot. Third person, relative to the camera, with the Idle / Walk / Run clips from seiko.glb.
import * as THREE from 'three/webgpu';
import { Assets } from './assets.js';
import { GROUPS } from './physics.js';
import { Input } from './input.js';
import { Emitter, lerpAngle, moveToward, clamp } from './util.js';

const WALK = 3.4, RUN = 6.4, JUMP = 4.6;

export class Player extends Emitter {
  constructor(phys, x, y, z) {
    super();
    this.phys = phys;
    this.active = true; this.speedMult = 1; this.dead = false; this.camYaw = 0;
    this.position = new THREE.Vector3(x, y, z);       // feet
    this.vel = new THREE.Vector3();
    this.onFloor = false;
    this.group = new THREE.Group();
    this.face = 0;
    this.clip = '';
    const { R, world } = phys;
    const r = 0.34, h = 1.74, half = (h - 2 * r) / 2;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + h / 2, z));
    this.collider = world.createCollider(R.ColliderDesc.capsule(half, r).setCollisionGroups(GROUPS.person), this.body);
    this.ctl = world.createCharacterController(0.02);
    this.ctl.setUp({ x: 0, y: 1, z: 0 });
    this.ctl.enableAutostep(0.3, 0.1, true);
    this.ctl.enableSnapToGround(0.3);
    this.ctl.setMaxSlopeClimbAngle(Math.PI / 3.2);
    this.ctl.setApplyImpulsesToDynamicBodies(false);
    this.halfH = h / 2;
    this._load();
  }

  async _load() {
    const g = await Assets.gltf('./assets/seiko.glb');
    if (!g) {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.06, 6, 12), new THREE.MeshStandardMaterial({ color: 0x3b4252 }));
      m.position.y = 0.87;
      this.group.add(m);
      return;
    }
    this.model = g.scene;
    this.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    this.group.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const c of g.animations) { const a = this.mixer.clipAction(c); a.setLoop(THREE.LoopRepeat, Infinity); this.actions[c.name] = a; }
    this._play('Idle');
  }

  _play(n) {
    if (!this.actions || n === this.clip || !this.actions[n]) return;
    const next = this.actions[n], prev = this.actions[this.clip];
    next.reset().fadeIn(0.18).play();
    if (prev) prev.fadeOut(0.18);
    this.clip = n;
  }

  /** Called every physics tick. */
  update(dt) {
    if (!this.active || this.dead) return;
    const inp = Input.moveVector();
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    // the camera's yaw turns the input: forward is -Z at yaw 0
    const dx = inp.x * cos + inp.y * sin;
    const dz = -inp.x * sin + inp.y * cos;
    const len = Math.hypot(dx, dz);
    const run = Input.held('sprint');
    const target = (run ? RUN : WALK) * Math.min(Math.hypot(inp.x, inp.y), 1) * this.speedMult;
    const want = len > 0.01 ? { x: dx / len * target, z: dz / len * target } : { x: 0, z: 0 };
    const rate = (want.x !== 0 || want.z !== 0 ? 28 : 36) * dt;
    let hx = this.vel.x, hz = this.vel.z;
    const ddx = want.x - hx, ddz = want.z - hz, dl = Math.hypot(ddx, ddz);
    if (dl <= rate) { hx = want.x; hz = want.z; } else { hx += ddx / dl * rate; hz += ddz / dl * rate; }
    this.vel.x = hx; this.vel.z = hz;
    if (this.onFloor) {
      this.vel.y = -0.5;
      if (Input.just('jump')) this.vel.y = JUMP;
    } else this.vel.y -= 9.81 * dt * 1.4;
    this.ctl.computeColliderMovement(this.collider, { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt }, undefined, GROUPS.person);
    const m = this.ctl.computedMovement();
    this.onFloor = this.ctl.computedGrounded();
    const t = this.body.translation();
    const nx = t.x + m.x, ny = t.y + m.y, nz = t.z + m.z;
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.position.set(nx, ny - this.halfH, nz);
    const spd = Math.hypot(hx, hz);
    if (spd > 0.3) {
      this.face = lerpAngle(this.face, Math.atan2(hx, hz), clamp(dt * 12, 0, 1));
      this._play(spd > 4.5 ? 'Run' : 'Walk');
    } else this._play('Idle');
  }

  /** Per rendered frame. */
  sync(dt) {
    this.group.position.copy(this.position);
    if (this.model) this.model.rotation.y = this.face;
    if (this.mixer) this.mixer.update(dt);
  }

  teleport(x, y, z) {
    this.position.set(x, y, z);
    this.body.setTranslation({ x, y: y + this.halfH, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + this.halfH, z });
    this.vel.set(0, 0, 0);
  }

  setVisible(v) { this.group.visible = v; }
  die(reason = 'WASTED') { if (this.dead) return; this.dead = true; this.group.visible = false; this.emit('died', reason); }
  revive(x, y, z) { this.dead = false; this.group.visible = true; this.teleport(x, y, z); }
  /** Park the collider far below while a car carries the player, so it is not in the way. */
  hideBody(hidden) { this.collider.setEnabled(!hidden); }
}
