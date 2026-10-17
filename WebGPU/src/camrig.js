// One camera that does both jobs: an orbit camera on foot, a chase camera in a car. Mouse look is always live; in a car the camera
// swings back behind the direction of travel once the mouse has been still for a moment.
import * as THREE from 'three/webgpu';
import { clamp, lerp, lerpAngle } from './util.js';

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _w = new THREE.Vector3();

export class CamRig {
  constructor(camera, phys) {
    this.camera = camera; this.phys = phys;
    this.target = null;          // an object with .position (Vector3) and, for cars, .body
    this.chase = false;
    this.yaw = 0; this.pitch = -0.18; this.dist = 5.2;
    this.sens = 1;
    this.idle = 0; this.shake = 0;
    this.pos = new THREE.Vector3(0, 3, 6);
    this.enabled = true;
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0028 * this.sens;
    this.pitch = clamp(this.pitch - dy * 0.0028 * this.sens, -1.2, 0.45);
    this.idle = 0;
  }

  bump(strength) { this.shake = clamp(strength * 0.02, 0, 0.5); }

  snap() { if (this.target) { this.pos.copy(this.target.position).add(_v.set(0, 3, 6)); } }

  update(dt) {
    if (!this.target || !this.enabled) return;
    this.idle += dt;
    const tp = this.target.position;
    const focus = _f.set(tp.x, tp.y + (this.chase ? 1.3 : 1.5), tp.z);
    let d = this.dist, spd = 0;
    if (this.chase && this.target.body) {
      const lv = this.target.body.linvel();
      spd = Math.hypot(lv.x, lv.y, lv.z);
      d = 6.6 + Math.min(spd * 0.05, 2);
      let heading;
      const fwd = this.target.fwdBody;
      if (spd > 3 && fwd && (lv.x * fwd.x + lv.y * fwd.y + lv.z * fwd.z) > 0) heading = Math.atan2(-lv.x, -lv.z);
      else heading = fwd ? Math.atan2(-fwd.x, -fwd.z) : this.yaw;
      if (this.idle > 1.4) {
        this.yaw = lerpAngle(this.yaw, heading, clamp(dt * 2.4, 0, 1));
        this.pitch = lerp(this.pitch, -0.2, clamp(dt * 2, 0, 1));
      }
      focus.y += 0.4;
    }
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    const want = _w.set(0, 0, d).applyEuler(_e).add(focus);
    // keep the camera out of walls
    _v.copy(want).sub(focus);
    const len = _v.length();
    _v.divideScalar(len || 1);
    const hit = this.phys.rayWorld(focus.x, focus.y, focus.z, _v.x, _v.y, _v.z, len);
    if (hit) want.copy(focus).addScaledVector(_v, Math.max(0.3, hit.timeOfImpact - 0.35));
    this.pos.lerp(want, clamp(dt * (this.chase ? 18 : 14), 0, 1));
    const cam = this.camera;
    cam.position.copy(this.pos);
    cam.lookAt(focus);
    if (this.shake > 0) {
      cam.position.x += (Math.random() * 2 - 1) * this.shake;
      cam.position.y += (Math.random() * 2 - 1) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    const fov = lerp(cam.fov, 68 + Math.min(spd * 0.55, 20), clamp(dt * 3, 0, 1));
    if (Math.abs(fov - cam.fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
}
