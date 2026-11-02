// Drives a Vehicle round the city grid, in the left-hand lane, like the traffic in the web build. Pure pursuit on a point a little
// ahead in the lane, a ray for the car in front, and the level-crossing barriers read from the world.
import * as THREE from 'three/webgpu';
import { clamp } from '../util.js';
import { P, N } from '../world/city.js';

const _q = new THREE.Quaternion();

export class AIDriver {
  constructor(car, world, heading, speed, phys, rng) {
    this.car = car; this.world = world; this.phys = phys; this.rng = rng;
    this.heading = heading.clone();
    this.next = heading.clone();
    this.cruise = speed;
    this.stuck = 0;
    this.decidedLine = -999;
  }

  update(dt) {
    const car = this.car, world = this.world;
    if (car.wrecked) return;
    const t = car.body.translation();
    const pos = new THREE.Vector3(t.x, t.y, t.z);
    const h = this.heading;
    const lane = 3;
    const L = clamp(car.forwardSpeed * 0.8, 6, 14);
    const axisX = Math.abs(h.x) > 0.5;
    const c = axisX ? pos.x : pos.z;
    const sgn = h.x + h.z;
    // the next intersection line ahead, and how far off it is
    let line = Math.floor(c / P) + (sgn > 0 ? 1 : 0);
    if (this.decidedLine > -900) line = this.decidedLine;     // stay on the line we have chosen for until we are across it
    const dist = (line * P - c) * sgn;
    if (this.decidedLine !== line && dist < 18) { this.chooseTurn(pos, line); this.decidedLine = line; }
    const other = axisX ? pos.z : pos.x;
    const o = clamp(Math.round(other / P), 0, N);
    const cx = axisX ? line * P : o * P;
    const cz = axisX ? o * P : line * P;
    const turning = this.next.x !== h.x || this.next.z !== h.z;
    const left = new THREE.Vector3(h.z, 0, -h.x);
    let target;
    if (turning && dist < 11) {
      // aim for the middle of the exit lane, a little way down the new road
      const el = new THREE.Vector3(this.next.z, 0, -this.next.x);
      target = new THREE.Vector3(cx, 0, cz).addScaledVector(this.next, 13).addScaledVector(el, lane);
    } else if (axisX) target = new THREE.Vector3(pos.x + h.x * L, 0, o * P + lane * left.z);
    else target = new THREE.Vector3(o * P + lane * left.x, 0, pos.z + h.z * L);
    // commit to the new heading once the car is across the line
    if (dist <= 0 && this.decidedLine === line) { this.heading.copy(this.next); this.decidedLine = -999; }
    const q = car.body.rotation();
    _q.set(q.x, q.y, q.z, q.w).invert();
    const local = new THREE.Vector3(target.x - pos.x, target.y - pos.y, target.z - pos.z).applyQuaternion(_q);
    const ang = Math.atan2(local.x, -local.z);
    car.steerIn = clamp(ang * 1.7, -1, 1);
    let spd = this.cruise * (1 - 0.5 * Math.min(Math.abs(car.steerIn), 1));
    if (turning && dist < 24) spd = Math.min(spd, 6.5);
    // a ray for the car in front
    const fwd = car.fwdBody || new THREE.Vector3(0, 0, -1);
    const o2 = pos.clone().addScaledVector(fwd, 2.4); o2.y += 0.6;
    const hit = this.phys.rayAny(o2.x, o2.y, o2.z, fwd.x, fwd.y, fwd.z, 18, car.body);
    if (hit) spd = Math.min(spd, Math.max(0, (hit.timeOfImpact + 2.4 - 4.5) * 1.5));
    const bd = world.barrierDistance(pos, this.heading);
    if (bd < Infinity) spd = Math.min(spd, Math.max(0, (bd - 0.5) * 1.8));
    const err = spd - car.forwardSpeed;
    car.throttle = clamp(err * 0.35, 0, 0.8);
    car.brake = clamp(-err * 0.25, 0, 1);
    car.handbrake = false;
    if (Math.abs(car.forwardSpeed) < 0.4 && spd > 1) this.stuck += dt; else this.stuck = 0;
    if (this.stuck > 6) { this.stuck = 0; this.recover(); }
  }

  /** Put a stranded car back on its lane, facing the way it was going. */
  recover() {
    const car = this.car, h = this.heading;
    const t = car.body.translation();
    const left = { x: h.z, z: -h.x };
    let x = t.x, z = t.z;
    if (Math.abs(h.x) > 0.5) z = clamp(Math.round(t.z / P), 0, N) * P + 3 * left.z;
    else x = clamp(Math.round(t.x / P), 0, N) * P + 3 * left.x;
    x = clamp(x, 3, P * N - 3); z = clamp(z, 3, P * N - 3);
    car.teleport(x, 0.9, z, Math.atan2(-h.x, -h.z));
    this.next.copy(h);
    this.decidedLine = -999;
  }

  chooseTurn(pos, line) {
    const h = this.heading;
    const axisX = Math.abs(h.x) > 0.5;
    const other = axisX ? pos.z : pos.x;
    const o = clamp(Math.round(other / P), 0, N);
    const opts = [h.clone()];
    const sides = axisX ? [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)] : [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0)];
    for (const s of sides) { const idx = o + (s.x + s.z); if (idx >= 0 && idx <= N) opts.push(s); }
    const ahead = line + (h.x + h.z);
    if (ahead < 0 || ahead > N) opts.shift();
    if (!opts.length) { this.next.copy(h); return; }
    this.next.copy(this.rng.chance(0.55) ? opts[0] : opts[Math.floor(this.rng.next() * opts.length)]);
  }
}
