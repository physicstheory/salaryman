// A raycast vehicle with a real tyre model.
//
// Each wheel casts a ray, runs a spring and damper along it, and turns its share of the engine torque into a longitudinal and a
// lateral tyre force from a combined-slip curve. Wheel speed is its own state (it can lock, spin, or hop), the engine runs a torque
// curve through an automatic gearbox, and weight transfer, roll, aero and brakes all fall out of forces acting at the contact
// patches rather than being faked on top.
import * as THREE from 'three/webgpu';
import { VehicleSpec } from './spec.js';
import { GROUPS, G_WORLD } from '../physics.js';
import { Assets } from '../assets.js';
import { clamp, lerp, moveToward, rad, TAU } from '../util.js';

const G = 9.81;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

class Wheel {
  constructor() {
    this.pos = new THREE.Vector3();    // hardpoint in body space
    this.front = false; this.left = false; this.driven = false;
    this.omega = 0;                    // rad/s, forward positive
    this.length = 0; this.prevLength = 0;
    this.grounded = false;
    this.contact = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.load = 0;
    this.steer = 0;
    this.slipRatio = 0; this.slipAngle = 0; this.slip = 0;
    this.surface = 1;
    this.spin = 0;                     // visual rotation
    this.mesh = null;
  }
}

export class Vehicle {
  constructor(phys, kind, position, yawDeg = 0, { visual = true } = {}) {
    this.phys = phys;
    this.kind = kind;
    this.spec = VehicleSpec.make(kind);
    this.wheels = [];
    // driver inputs, written by the player or by the AI
    this.throttle = 0; this.brake = 0; this.steerIn = 0; this.handbrake = false; this.lightsOn = false;
    // state
    this.gear = 1; this.rpm = this.spec.idleRpm || 900; this.forwardSpeed = 0; this.health = 100; this.shiftTimer = 0;
    this.autoReverse = true; this.wrecked = false; this.driverPresent = false;
    this.steerAngle = 0;
    this.handlers = { crashed: [] };
    this.prevVel = new THREE.Vector3();
    this.group = new THREE.Group();
    this.group.name = 'car_' + kind;
    this.model = null;
    this.headlights = [];
    this.brakeLights = [];
    this.headMats = [];
    this.userData = {};
    this._setupBody(position, yawDeg);
    this._setupWheels();
    this._lampMeshes();
    if (visual) this._setupVisuals();
  }

  onCrash(fn) { this.handlers.crashed.push(fn); }

  _setupBody(position, yawDeg) {
    const { R, world } = this.phys;
    const s = this.spec;
    const [bx, by, bz] = s.bodySize;
    const m = s.mass;
    // a box's inertia, a little generous in yaw so the car is not twitchy
    const inertia = { x: (m / 12 * (by * by + bz * bz)) * 1.1, y: (m / 12 * (bx * bx + bz * bz) * 1.15) * 1.1, z: (m / 12 * (bx * bx + by * by)) * 1.1 };
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rad(yawDeg));
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0).setAngularDamping(0.15)
      .setCanSleep(false).setCcdEnabled(true)
      .setAdditionalMassProperties(m, { x: 0, y: 0, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 });
    this.body = world.createRigidBody(desc);
    const cd = R.ColliderDesc.cuboid(bx / 2, by / 2, bz / 2)
      .setTranslation(0, s.bodyClear + by * 0.5 - s.comHeight, 0)
      .setDensity(0).setFriction(0.15).setRestitution(0.05)
      .setCollisionGroups(GROUPS.car);
    this.collider = world.createCollider(cd, this.body);
    this.phys.userData.set(this.collider.handle, this);
  }

  _setupWheels() {
    const s = this.spec;
    const zf = s.wheelbase * (1 - s.frontWeight);
    const zr = s.wheelbase * s.frontWeight;
    // at rest the spring is compressed by g / (2 pi f)^2, so the hardpoint sits that far above full droop
    const restF = clamp(s.travel - G / Math.pow(TAU * s.rideFreqF, 2), 0.02, s.travel);
    const restR = clamp(s.travel - G / Math.pow(TAU * s.rideFreqR, 2), 0.02, s.travel);
    const hyF = s.wheelRadius + restF - s.comHeight;
    const hyR = s.wheelRadius + restR - s.comHeight;
    const layout = [
      [-s.trackF * 0.5, hyF, -zf, true, true, restF],
      [s.trackF * 0.5, hyF, -zf, true, false, restF],
      [-s.trackR * 0.5, hyR, zr, false, true, restR],
      [s.trackR * 0.5, hyR, zr, false, false, restR],
    ];
    for (const l of layout) {
      const w = new Wheel();
      w.pos.set(l[0], l[1], l[2]);
      w.front = l[3]; w.left = l[4];
      w.driven = s.drive === 'awd' || (s.drive === 'fwd' && w.front) || (s.drive === 'rwd' && !w.front);
      w.length = w.prevLength = l[5];
      this.wheels.push(w);
    }
  }

  async _setupVisuals() {
    const s = this.spec;
    let scene = await Assets.model(`./assets/cars/${s.model}.glb`);
    let fallback = false;
    if (!scene) { scene = await Assets.model(`./assets/cars/${s.fallbackModel}.glb`); fallback = true; }
    const holder = new THREE.Group();
    if (scene) {
      holder.add(scene);
      holder.rotation.y = rad(fallback ? 180 : s.modelYaw);
      const sc = fallback ? s.fallbackScale : s.modelScale;
      holder.scale.set(sc[0], sc[1], sc[2]);
      scene.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...s.bodySize), new THREE.MeshStandardMaterial({ color: s.paint }));
      holder.add(m);
    }
    holder.position.y = -s.comHeight;
    this.model = holder;
    this.group.add(holder);
  }

  /** Head and tail lamp meshes: emissive blocks on every car, and real spotlights once someone is driving. */
  _lampMeshes() {
    const s = this.spec;
    const [bx, by, bz] = s.bodySize;
    const zf = s.wheelbase * (1 - s.frontWeight);
    const yLamp = s.bodyClear + by * 0.55 - s.comHeight;
    const headMat = new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0xfff2cf, emissiveIntensity: 0 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1010, emissiveIntensity: 0.15 });
    this.headMat = headMat; this.tailMat = tailMat;
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
      h.position.set(sx * bx * 0.32, yLamp, -(bz * 0.5 - 0.02));
      this.group.add(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.05), tailMat);
      t.position.set(sx * bx * 0.34, yLamp + 0.04, bz * 0.5 - 0.02);
      this.group.add(t);
    }
    this._zf = zf;
  }

  /** Real headlight beams, only for the car being driven (spotlights are the expensive part). */
  _ensureSpots() {
    if (this.headlights.length) return;
    const s = this.spec;
    const [bx, by] = s.bodySize;
    const yLamp = s.bodyClear + by * 0.55 - s.comHeight;
    for (const sx of [-1, 1]) {
      const sp = new THREE.SpotLight(0xfff2d2, 0, 55, rad(34), 0.6, 1.6);
      sp.position.set(sx * bx * 0.32, yLamp, -(this._zf + 1));
      sp.target.position.set(sx * bx * 0.25, yLamp - 3.2, -(this._zf + 36));
      sp.castShadow = false;
      this.group.add(sp);
      this.group.add(sp.target);
      this.headlights.push(sp);
    }
  }

  // ---- numbers
  torqueAt(r) {
    const c = this.spec.torqueCurve;
    if (r <= c[0][0]) return c[0][1];
    for (let i = 1; i < c.length; i++) {
      if (r <= c[i][0]) { const t = (r - c[i - 1][0]) / (c[i][0] - c[i - 1][0]); return lerp(c[i - 1][1], c[i][1], t); }
    }
    return c[c.length - 1][1];
  }
  ratio() {
    const s = this.spec;
    if (this.gear === -1) return -s.reverseRatio * s.finalDrive;
    if (this.gear === 0) return 0;
    return s.gears[this.gear - 1] * s.finalDrive;
  }
  /** The Pacejka-style curve, x is slip normalised so the peak sits near 1. */
  static curve(x) {
    const bx = 1.9 * x;
    return Math.sin(1.55 * Math.atan(bx - 0.25 * (bx - Math.atan(bx))));
  }
  omegaCap() {
    const r = Math.abs(this.ratio());
    let cap = 600;
    if (r > 0.1) cap = this.spec.redline * TAU / 60 / r * 1.15;
    return Math.max(cap, 120);
  }
  freeSpin(om, tq, btq, dt) {
    const s = this.spec;
    om += tq * dt / s.wheelInertia;
    const cap = this.omegaCap();
    om = clamp(om, -cap, cap);
    const d = btq / s.wheelInertia * dt;
    if (Math.abs(om) <= d) return 0;
    om -= Math.sign(om) * d;
    return om * (1 - 0.02 * dt);
  }

  // ---- the step: called once per physics tick, before the world steps
  update(dt) {
    const s = this.spec;
    const body = this.body;
    if (this.wrecked) { this.throttle = 0; this.brake = 0.3; }
    body.resetForces(true);
    body.resetTorques(true);
    const t = body.translation(), qq = body.rotation(), lv = body.linvel(), av = body.angvel();
    _q.set(qq.x, qq.y, qq.z, qq.w);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
    const fwdBody = new THREE.Vector3(0, 0, -1).applyQuaternion(_q);
    const rightBody = new THREE.Vector3(1, 0, 0).applyQuaternion(_q);
    const com = new THREE.Vector3(t.x, t.y, t.z);
    const vel = new THREE.Vector3(lv.x, lv.y, lv.z);
    const angVel = new THREE.Vector3(av.x, av.y, av.z);
    this.forwardSpeed = vel.dot(fwdBody);
    const speed = vel.length();
    this.speed = speed;
    this.up = up; this.fwdBody = fwdBody;

    this._updateSteer(dt, speed);
    this._updateGearbox(dt);

    // ---- suspension pass: springs first, tyres need the load
    const kf = s.mass * 0.5 * s.frontWeight * Math.pow(TAU * s.rideFreqF, 2);
    const kr = s.mass * 0.5 * (1 - s.frontWeight) * Math.pow(TAU * s.rideFreqR, 2);
    const mf = s.mass * 0.5 * s.frontWeight;
    const mr = s.mass * 0.5 * (1 - s.frontWeight);
    let cLF = 0, cRF = 0, cLR = 0, cRR = 0;
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(_q);
    const rayLen = s.travel + s.wheelRadius;
    for (const w of this.wheels) {
      const origin = _v.copy(w.pos).applyQuaternion(_q).add(com);
      w.prevLength = w.length;
      const hit = this.phys.rayWorld(origin.x, origin.y, origin.z, down.x, down.y, down.z, rayLen);
      if (hit) {
        const dist = hit.timeOfImpact;
        w.contact.set(origin.x + down.x * dist, origin.y + down.y * dist, origin.z + down.z * dist);
        w.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        w.length = clamp(dist - s.wheelRadius, 0, s.travel);
        w.grounded = dist - s.wheelRadius <= s.travel + 0.001;
        const grip = this.phys.grip.get(hit.collider.handle);
        w.surface = grip !== undefined ? grip : 1;
      } else {
        w.grounded = false;
        w.length = moveToward(w.length, s.travel, dt * 2);
      }
      const c = s.travel - w.length;
      if (w.front) { if (w.left) cLF = c; else cRF = c; } else if (w.left) cLR = c; else cRR = c;
    }
    const arbFForce = s.arbF * (cLF - cRF);
    const arbRForce = s.arbR * (cLR - cRR);

    let brakeCmd = this.brake;
    if (this.gear === -1) brakeCmd = this.brake > 0 ? 0 : this.throttle;
    const driveTorque = this._wheelDriveTorque();
    const drivenCount = this.wheels.filter((x) => x.driven).length;

    for (const w of this.wheels) {
      const k = w.front ? kf : kr;
      const mw = w.front ? mf : mr;
      w.load = 0;
      if (!w.grounded) continue;
      const velLen = clamp((w.length - w.prevLength) / dt, -6, 6);
      const c = s.travel - w.length;
      let spring = k * c;
      let cdamp = 2 * s.dampingRatio * Math.sqrt(k * mw);
      if (velLen > 0) cdamp *= s.reboundRatio;
      spring -= cdamp * velLen;
      const arb = w.front ? arbFForce : arbRForce;
      spring += w.left ? arb : -arb;
      if (w.length < 0.015) spring += 60000 * (0.015 - w.length);      // bump stop
      spring = Math.max(spring, 0);
      w.load = spring;
      body.addForceAtPoint({ x: up.x * spring, y: up.y * spring, z: up.z * spring }, { x: w.contact.x, y: w.contact.y, z: w.contact.z }, true);
    }

    // ---- tyre pass
    const nominal = s.mass * G * 0.25;
    for (const w of this.wheels) {
      let tq = 0;
      if (w.driven && drivenCount) tq = driveTorque / drivenCount;
      const bias = w.front ? s.brakeBias : 1 - s.brakeBias;
      let btq = brakeCmd * s.brakeTorque * bias * 2;
      if (this.handbrake && !w.front) btq = s.brakeTorque * 3;
      if (!w.grounded) {
        w.omega = this.freeSpin(w.omega, tq, btq, dt);
        w.slip = 0; w.slipRatio = 0; w.slipAngle = 0;
        continue;
      }
      const f = fwdBody.clone();
      if (w.front) f.applyAxisAngle(up, -w.steer);
      f.addScaledVector(w.normal, -f.dot(w.normal)).normalize();
      const r = new THREE.Vector3().crossVectors(f, w.normal).normalize();
      const rel = _v2.copy(w.contact).sub(com);
      const vc = new THREE.Vector3().crossVectors(angVel, rel).add(vel);
      const vx = vc.dot(f);
      const vy = vc.dot(r);
      let mu = (w.front ? s.tyreMu : s.tyreMuRear) * w.surface;
      if (this.handbrake && !w.front) mu *= 0.72;
      // load sensitivity: grip per newton falls a little as the tyre is loaded up
      const muEff = mu * (1 - 0.07 * clamp(w.load / nominal - 1, -0.6, 1.5));
      const fmax = Math.max(muEff * w.load, 1);

      // ABS and traction control work on the pedal and the throttle, not on the tyres
      let btqUse = btq;
      if (s.absOn && brakeCmd > 0.05 && Math.abs(vx) > 3 && w.slipRatio < -s.slipPeakRatio * 1.6 && !this.handbrake) btqUse *= 0.35;
      let tqUse = tq;
      if (s.tcOn && w.driven && w.slipRatio > s.slipPeakRatio * 2 && Math.abs(vx) > 1.5) tqUse *= 0.45;

      const denX = Math.max(Math.abs(vx), 2);
      const denY = Math.max(Math.abs(vx), 3);
      const tanPeak = Math.tan(s.slipPeakAngle);
      const evalF = (om) => {
        const kappa = (om * s.wheelRadius - vx) / denX;
        const tana = vy / denY;
        const kn = kappa / s.slipPeakRatio;
        const an = tana / tanPeak;
        const tot = Math.sqrt(kn * kn + an * an);
        if (tot <= 0.0001) return [0, 0];
        const ft = fmax * Vehicle.curve(tot);
        return [ft * kn / tot, -ft * an / tot];
      };
      const f0 = evalF(w.omega);
      const f1 = evalF(w.omega + 1);
      // only the rising side of the curve is treated implicitly; past the peak it would be unstable
      const kslope = Math.max(f1[0] - f0[0], 0);
      const net = tqUse - f0[0] * s.wheelRadius;
      const domega = net * dt / (s.wheelInertia + s.wheelRadius * kslope * dt);
      w.omega += domega;
      const fxUsed = clamp(f0[0] + kslope * domega, -fmax, fmax);
      const cap = this.omegaCap();
      w.omega = clamp(w.omega, -cap, cap);
      // brakes bite last, and cannot reverse the wheel
      const dwb = btqUse / s.wheelInertia * dt;
      if (Math.abs(w.omega) <= dwb) w.omega = 0; else w.omega -= Math.sign(w.omega) * dwb;
      // rolling resistance
      const rr = -s.rollRes * w.load * clamp(vx, -1, 1);
      const fl = fxUsed + rr;
      body.addForceAtPoint({ x: f.x * fl + r.x * f0[1], y: f.y * fl + r.y * f0[1], z: f.z * fl + r.z * f0[1] }, { x: w.contact.x, y: w.contact.y, z: w.contact.z }, true);

      w.slipRatio = (w.omega * s.wheelRadius - vx) / denX;
      w.slipAngle = Math.atan2(vy, denY);
      const kn2 = w.slipRatio / s.slipPeakRatio;
      const an2 = Math.tan(w.slipAngle) / tanPeak;
      w.slip = Math.sqrt(kn2 * kn2 + an2 * an2);
    }

    // ---- aero and the stability system
    if (speed > 0.1) {
      const dr = -0.5 * 1.2 * s.dragCda * speed;
      body.addForce({ x: vel.x * dr, y: vel.y * dr, z: vel.z * dr }, true);
      const lf = -0.5 * 1.2 * s.liftCla * speed * speed;
      body.addForce({ x: up.x * lf, y: up.y * lf, z: up.z * lf }, true);
    }
    if (s.esc > 0 && speed > 6 && !this.handbrake) {
      const lat = vel.dot(rightBody);
      const yawRate = angVel.dot(up);
      // the yaw rate the steering is asking for, from a bicycle model
      const want = this.forwardSpeed * Math.tan(this.steerAngle) / s.wheelbase;
      const err = yawRate - want;
      const slide = Math.abs(lat) / Math.max(Math.abs(this.forwardSpeed), 1);
      if (slide > 0.25 || Math.abs(err) > 0.6) {
        const k = -err * s.esc * s.mass * 0.8 * clamp(slide * 2, 0.3, 1.5);
        body.addTorque({ x: up.x * k, y: up.y * k, z: up.z * k }, true);
      }
    }
    // ---- impacts: a sudden change in velocity between ticks is a hit
    const impact = _v.copy(vel).sub(this.prevVel).length();
    if (impact > 7) {
      this.health = Math.max(0, this.health - (impact - 5) * 1.6);
      for (const f of this.handlers.crashed) f(impact);
      if (this.health <= 0 && !this.wrecked) this.wrecked = true;
    }
    this.prevVel.copy(vel);
  }

  _updateSteer(dt, speed) {
    const s = this.spec;
    const t = clamp(speed / 41, 0, 1);
    const lim = rad(lerp(s.maxSteer, s.maxSteerFast, t * t));
    const target = this.steerIn * lim;
    // the rack is quick towards centre and a touch slower outward
    const rate = s.steerRate * (Math.abs(target) < Math.abs(this.steerAngle) ? 1.4 : 1);
    this.steerAngle = moveToward(this.steerAngle, target, rate * lim * dt * 2);
    for (const w of this.wheels) if (w.front) w.steer = this.steerAngle;
  }

  _updateGearbox(dt) {
    const s = this.spec;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    let avg = 0, n = 0;
    for (const w of this.wheels) if (w.driven) { avg += w.omega; n++; }
    avg /= Math.max(1, n);
    const ratio = this.ratio();
    const wheelRpm = Math.abs(avg) * 60 / TAU;
    this.rpm = Math.max(s.idleRpm, wheelRpm * Math.abs(ratio));
    if (this.gear === -1) {
      if (this.throttle > 0.1 && this.forwardSpeed > -1) this.gear = 1;
    } else if (this.autoReverse && this.brake > 0.1 && this.throttle < 0.1 && this.forwardSpeed < 0.8) {
      this.gear = -1;
    } else if (this.gear === 0) {
      this.gear = 1;
    } else if (this.shiftTimer <= 0) {
      if (this.gear < s.gears.length && this.rpm > s.shiftUp && this.throttle > 0.2) { this.gear++; this.shiftTimer = 0.28; }
      else if (this.gear > 1 && this.rpm < s.shiftDown) { this.gear--; this.shiftTimer = 0.2; }
    }
  }

  _wheelDriveTorque() {
    const s = this.spec;
    if (this.shiftTimer > 0) return 0;
    const ratio = this.ratio();
    if (ratio === 0) return 0;
    let thr = this.throttle;
    if (this.gear === -1) thr = this.brake;
    let t = 0;
    if (this.rpm >= s.redline) t = 0; else t = this.torqueAt(this.rpm) * thr;
    if (thr < 0.05) {
      if (s.electric) {
        // regenerative braking: a steady drag from the motor once the car is moving
        t = -s.engineBrake * clamp(Math.abs(this.forwardSpeed) / 3, 0, 1) * Math.sign(ratio);
      } else {
        t = -s.engineBrake * (this.rpm / s.redline) * ((this.forwardSpeed * ratio > 0 || this.gear === -1) ? 1 : 0);
      }
    }
    return t * ratio * s.drivelineEff;
  }

  // ---- what you see: called once per rendered frame
  sync(dt) {
    const t = this.body.translation(), q = this.body.rotation();
    this.group.position.set(t.x, t.y, t.z);
    this.group.quaternion.set(q.x, q.y, q.z, q.w);
    const night = this.nightLights;
    this.headMat.emissiveIntensity = this.lightsOn ? 4 : 0;
    this.tailMat.emissiveIntensity = this.brake > 0.1 || (this.gear === -1) ? 4 : (this.lightsOn ? 1.2 : 0.15);
    if (this.driverPresent) {
      this._ensureSpots();
      for (const h of this.headlights) h.intensity = this.lightsOn ? 260 : 0;
    } else {
      for (const h of this.headlights) h.intensity = 0;
    }
  }

  get position() { const t = this.body.translation(); return _v.set(t.x, t.y, t.z); }
  speedKmh() { return this.forwardSpeed * 3.6; }

  resetUpright() {
    const t = this.body.translation();
    const q = this.body.rotation();
    _q.set(q.x, q.y, q.z, q.w);
    const e = new THREE.Euler().setFromQuaternion(_q, 'YXZ');
    const nq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.y);
    this.body.setTranslation({ x: t.x, y: t.y + 1, z: t.z }, true);
    this.body.setRotation({ x: nq.x, y: nq.y, z: nq.z, w: nq.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (const w of this.wheels) w.omega = 0;
  }

  teleport(x, y, z, yaw) {
    const nq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation({ x: nq.x, y: nq.y, z: nq.z, w: nq.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (const w of this.wheels) w.omega = 0;
  }
}
