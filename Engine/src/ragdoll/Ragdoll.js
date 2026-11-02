// Ragdoll: a limp human body that falls, tumbles and slides under real physics, then gets back up.
//
// The body is fifteen point masses at the joints (pelvis, chest, head, hips, knees, ankles, shoulders, elbows,
// wrists), weighted by how heavy that part of a person is, and integrated with position Verlet at a fixed 240 Hz.
// Bones are rigid rods between them; the torso is a braced box that can bend and twist a little; joints have
// limits (knees only bend forwards, hips do not fold through the chest, the neck does not snap back, elbows and
// knees cannot fold flat). Every particle has a radius and lands on the host's ground with restitution and Coulomb
// friction (so a body thrown at 60 km/h slides and rolls the distance a real one does), and is kept out of walls.
//
// The skeleton is driven from the particles: each simulated bone gets a frame from its segment and a reference
// direction, and its rotation is how far that frame has turned since the hit, applied on top of the pose the
// character was in at that moment. So any rigged human works (Biped, Mixamo, VRM, Meshy, Tripo), and the mesh
// stays the character's own skinned mesh: nothing is swapped.
//
// When the body has come to rest it either stays (dead) or gets up: from face down it pushes up to all fours,
// from face up it sits up, then both come through a crouch to standing, all as targets for the same particles
// (so limbs keep their lengths and nothing pops), and finally the bones blend back into the host's animation.
//
// Nothing in here knows about Seiko, cars or Tōkonto. The host gives it a ground height function, optionally
// a wall test and a friction function, and calls update(dt) once a frame after its animation mixers have run.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ---- the joints ----------------------------------------------------------------------------------------------------
export const RAGDOLL_JOINTS = ["pelvis", "chest", "head", "lHip", "lKnee", "lFoot", "rHip", "rKnee", "rFoot",
  "lSh", "lElb", "lHand", "rSh", "rElb", "rHand"];
const J = {}; RAGDOLL_JOINTS.forEach((n, i) => { J[n] = i; });
const N = RAGDOLL_JOINTS.length;
// collision radii (m) and mass shares (Dempster's segment masses, lumped at the joints)
const RADIUS = [0.13, 0.14, 0.11, 0.08, 0.06, 0.055, 0.08, 0.06, 0.055, 0.07, 0.05, 0.045, 0.07, 0.05, 0.045];
const MASS = [0.142, 0.216, 0.081, 0.100, 0.0465, 0.0145, 0.100, 0.0465, 0.0145, 0.028, 0.016, 0.006, 0.028, 0.016, 0.006];
// how much a hard landing on each part hurts (the host decides what hurt means)
const HURT = [0.8, 1.0, 1.6, 0.3, 0.25, 0.1, 0.3, 0.25, 0.1, 0.3, 0.2, 0.1, 0.3, 0.2, 0.1];

// ---- finding the bones ---------------------------------------------------------------------------------------------
// Names are compared lower-case with everything but letters and digits removed, by suffix, in order of preference.
const BONE_NAMES = {
  pelvis: ["bip01pelvis", "hips", "pelvis", "jbiphips"],
  neck: ["bip01neck", "neck", "jbipcneck"],
  head: ["bip01head", "head", "jbipchead"],
  lThigh: ["bip01lthigh", "leftupleg", "thighl", "lthigh", "upperlegl", "jbiplupperleg"],
  lCalf: ["bip01lcalf", "leftleg", "shinl", "calfl", "lcalf", "lowerlegl", "jbipllowerleg"],
  lFoot: ["bip01lfoot", "leftfoot", "footl", "lfoot", "jbiplfoot"],
  rThigh: ["bip01rthigh", "rightupleg", "thighr", "rthigh", "upperlegr", "jbiprupperleg"],
  rCalf: ["bip01rcalf", "rightleg", "shinr", "calfr", "rcalf", "lowerlegr", "jbiprlowerleg"],
  rFoot: ["bip01rfoot", "rightfoot", "footr", "rfoot", "jbiprfoot"],
  lUpper: ["bip01lupperarm", "leftarm", "upperarml", "lupperarm", "jbiplupperarm"],
  lFore: ["bip01lforearm", "leftforearm", "forearml", "lforearm", "lowerarml", "jbipllowerarm"],
  lHand: ["bip01lhand", "lefthand", "handl", "lhand", "jbiplhand"],
  rUpper: ["bip01rupperarm", "rightarm", "upperarmr", "rupperarm", "jbiprupperarm"],
  rFore: ["bip01rforearm", "rightforearm", "forearmr", "rforearm", "lowerarmr", "jbiprlowerarm"],
  rHand: ["bip01rhand", "righthand", "handr", "rhand", "jbiprhand"]
};
export function findRagdollBones(root) {
  const all = [];
  root.traverse(o => { if (o.isBone) all.push({ b: o, n: o.name.toLowerCase().replace(/[^a-z0-9]/g, "") }); });
  if (!all.length) return null;
  const out = {};
  for (const key in BONE_NAMES) {
    let hit = null;
    for (const want of BONE_NAMES[key]) { hit = all.find(e => e.n === want) || all.find(e => e.n.endsWith(want)); if (hit) break; }
    if (!hit) return null;
    out[key] = hit.b;
  }
  // the spine: every bone between the pelvis and the neck, bottom first
  const spine = [];
  for (let b = out.neck.parent; b && b !== out.pelvis; b = b.parent) { if (!b.isBone) return null; spine.unshift(b); }
  if (!spine.length) return null;
  out.spine = spine;
  return out;
}

// ---- the body ------------------------------------------------------------------------------------------------------
export class RagdollSystem {
  // opts: { THREE, ground(x, z, refY) -> y, blocked?(x, z, r, y) -> bool, friction?(x, z) -> mu, maxActive? }
  constructor(opts) {
    this.T = opts.THREE;
    this.ground = opts.ground || (() => 0);
    this.blocked = opts.blocked || null;
    this.friction = opts.friction || null;
    this.maxActive = opts.maxActive || 10;
    this.g = opts.gravity || 9.81;
    this.h = 1 / 240;
    this.iterations = 6;
    this.list = [];
    const T = this.T;
    this._v = [new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3()];
    this._q = [new T.Quaternion(), new T.Quaternion(), new T.Quaternion()];
    this._m = new T.Matrix4();
  }

  // Make a figure limp. root: the character's top object (its bones are found inside); it should be posed as it
  // was the instant before (the host's mixer has run). opts:
  //   velocity {x,y,z}  m/s of the whole body          spin {x,y,z}  rad/s about the centre of mass
  //   strike {x,y,z}    a vehicle's velocity: the legs take it all, the head about half (the body wraps over the bonnet)
  //   push {x,y,z, at:"chest"}  an extra velocity on one part (a bullet, a punch)
  //   getUp (default true), dead, facing {x,z} (which way the figure faces, default the root's +z)
  //   onSettle(rd), onUp(rd, {x, y, z, yaw}), onHit(rd, speed, part) (a hard landing)
  spawn(root, opts) {
    opts = opts || {};
    const T = this.T;
    const old = this.list.find(r => r.root === root);
    if (old) this.release(old);
    root.updateMatrixWorld(true);
    const B = findRagdollBones(root);
    if (!B) return null;
    const wp = b => b.getWorldPosition(new T.Vector3());
    const pos = [];
    pos[J.pelvis] = wp(B.pelvis); pos[J.chest] = wp(B.neck);
    const hd = wp(B.head); pos[J.head] = hd.clone().addScaledVector(hd.clone().sub(pos[J.chest]).normalize(), 0.09);
    pos[J.lHip] = wp(B.lThigh); pos[J.lKnee] = wp(B.lCalf); pos[J.lFoot] = wp(B.lFoot);
    pos[J.rHip] = wp(B.rThigh); pos[J.rKnee] = wp(B.rCalf); pos[J.rFoot] = wp(B.rFoot);
    pos[J.lSh] = wp(B.lUpper); pos[J.lElb] = wp(B.lFore); pos[J.lHand] = wp(B.lHand);
    pos[J.rSh] = wp(B.rUpper); pos[J.rElb] = wp(B.rFore); pos[J.rHand] = wp(B.rHand);
    // a figure scaled to nothing, or bones all in one place, is not a body
    if (pos[J.pelvis].distanceTo(pos[J.head]) < 0.2) return null;

    const rd = {
      root: root, bones: B, opts: opts, state: "fall", t: 0, still: 0, hurt: 0,
      P: new Float32Array(N * 3), O: new Float32Array(N * 3), G: new Float32Array(N), VY: new Float32Array(N), contact: new Uint8Array(N), was: new Uint8Array(N),
      cons: [], ranges: [], dims: null, frames: null, sign: 1, acc: 0, seq: null, blend: null, culled: []
    };
    for (let i = 0; i < N; i++) { rd.P[i * 3] = pos[i].x; rd.P[i * 3 + 1] = pos[i].y; rd.P[i * 3 + 2] = pos[i].z; }

    // which way the body faces, to tell left from right and front from back
    const fwd = opts.facing ? new T.Vector3(opts.facing.x, 0, opts.facing.z) : new T.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(new T.Quaternion()));
    const side = pos[J.lHip].clone().sub(pos[J.rHip]), up = pos[J.chest].clone().sub(pos[J.pelvis]);
    rd.sign = side.clone().cross(up).dot(fwd) >= 0 ? 1 : -1;

    this._buildConstraints(rd, pos);
    this._captureFrames(rd);

    // starting velocities, written as the previous positions
    const com = new T.Vector3(); let mt = 0;
    for (let i = 0; i < N; i++) { com.addScaledVector(pos[i], MASS[i]); mt += MASS[i]; }
    com.multiplyScalar(1 / mt);
    let lowY = Infinity; for (let i = 0; i < N; i++) lowY = Math.min(lowY, pos[i].y);
    const v = new T.Vector3(), r = new T.Vector3(), w = opts.spin ? new T.Vector3(opts.spin.x || 0, opts.spin.y || 0, opts.spin.z || 0) : null;
    const lin = opts.velocity ? new T.Vector3(opts.velocity.x || 0, opts.velocity.y || 0, opts.velocity.z || 0) : new T.Vector3();
    const st = opts.strike ? new T.Vector3(opts.strike.x || 0, opts.strike.y || 0, opts.strike.z || 0) : null;
    for (let i = 0; i < N; i++) {
      v.copy(lin);
      if (w) { r.copy(pos[i]).sub(com); v.add(w.clone().cross(r)); }
      if (st) {
        // a bumper hits at the knees: everything below it moves with the car, the upper body is left behind
        // and the body rotates onto the bonnet; faster than about 30 km/h it is also thrown up
        const hgt = pos[i].y - lowY, k = 1.05 - 0.6 * clamp(hgt / 1.7, 0, 1), sp = st.length();
        v.addScaledVector(st, k);
        v.y += (hgt < 0.7 ? 0.10 : 0.22) * Math.max(0, sp - 8) + (sp > 3 ? 0.6 : 0);
      }
      if (opts.push && RAGDOLL_JOINTS[i] === (opts.push.at || "chest")) { v.x += opts.push.x || 0; v.y += opts.push.y || 0; v.z += opts.push.z || 0; }
      rd.O[i * 3] = rd.P[i * 3] - v.x * this.h; rd.O[i * 3 + 1] = rd.P[i * 3 + 1] - v.y * this.h; rd.O[i * 3 + 2] = rd.P[i * 3 + 2] - v.z * this.h;
    }
    // the skinned mesh's bounds are where it was bound, not where the body has gone
    root.traverse(o => { if (o.isMesh && o.frustumCulled) { o.frustumCulled = false; rd.culled.push(o); } });

    this.list.push(rd);
    // too many bodies moving at once: the oldest moving one is made to lie still
    const moving = this.list.filter(x => x.state === "fall");
    if (moving.length > this.maxActive) this._settle(moving[0]);
    return rd;
  }

  _buildConstraints(rd, pos) {
    const d = (a, b) => pos[a].distanceTo(pos[b]);
    const C = (a, b, k) => rd.cons.push([a, b, d(a, b), k === undefined ? 1 : k]);
    const R = (a, b, lo, hi, k) => rd.ranges.push([a, b, lo, hi, k === undefined ? 1 : k]);
    // bones
    C(J.lHip, J.lKnee); C(J.lKnee, J.lFoot); C(J.rHip, J.rKnee); C(J.rKnee, J.rFoot);
    C(J.lSh, J.lElb); C(J.lElb, J.lHand); C(J.rSh, J.rElb); C(J.rElb, J.rHand);
    // the pelvis and the shoulder girdle are rigid; the spine between them bends and twists a little
    C(J.pelvis, J.lHip); C(J.pelvis, J.rHip); C(J.lHip, J.rHip);
    C(J.chest, J.lSh); C(J.chest, J.rSh); C(J.lSh, J.rSh);
    C(J.pelvis, J.chest);
    C(J.lHip, J.lSh, 0.4); C(J.rHip, J.rSh, 0.4); C(J.lHip, J.rSh, 0.3); C(J.rHip, J.lSh, 0.3); C(J.pelvis, J.lSh, 0.3); C(J.pelvis, J.rSh, 0.3);
    C(J.chest, J.head);
    // the neck: the head can nod and turn, not fold onto a shoulder or snap back
    const hs = d(J.head, J.lSh), hp = d(J.head, J.pelvis);
    R(J.head, J.lSh, hs * 0.82, hs * 1.12); R(J.head, J.rSh, hs * 0.82, hs * 1.12); R(J.head, J.pelvis, hp * 0.84, hp * 1.02);
    // knees and elbows cannot fold completely
    const leg = d(J.lHip, J.lKnee) + d(J.lKnee, J.lFoot), arm = d(J.lSh, J.lElb) + d(J.lElb, J.lHand);
    R(J.lHip, J.lFoot, leg * 0.36, leg); R(J.rHip, J.rFoot, leg * 0.36, leg);
    R(J.lSh, J.lHand, arm * 0.3, arm); R(J.rSh, J.rHand, arm * 0.3, arm);
    // the hips do not fold the thighs through the chest (about 125 degrees of flexion at most)
    const sp = d(J.pelvis, J.chest), th = d(J.lHip, J.lKnee), kc = Math.sqrt(sp * sp + th * th - 2 * sp * th * Math.cos(0.96));
    R(J.lKnee, J.chest, kc, 9, 0.5); R(J.rKnee, J.chest, kc, 9, 0.5);
    // limbs do not pass through each other
    R(J.lKnee, J.rKnee, 0.1, 9); R(J.lFoot, J.rFoot, 0.1, 9); R(J.lHand, J.rHand, 0.07, 9);
    R(J.lHand, J.chest, 0.12, 9); R(J.rHand, J.chest, 0.12, 9); R(J.lHand, J.pelvis, 0.12, 9); R(J.rHand, J.pelvis, 0.12, 9);
    // sizes for the get-up poses
    const hw = d(J.lHip, J.rHip) / 2, sw = d(J.lSh, J.rSh) / 2, ph = d(J.pelvis, J.lHip), cs = d(J.chest, J.lSh);
    rd.dims = { hw: hw, sw: sw, Lt: th, Ls: d(J.lKnee, J.lFoot), ua: d(J.lSh, J.lElb), fa: d(J.lElb, J.lHand), Lsp: sp, Ln: d(J.chest, J.head),
      dy: Math.sqrt(Math.max(0, ph * ph - hw * hw)), shDrop: Math.sqrt(Math.max(0, cs * cs - sw * sw)) };
  }

  // ---- frames: what turns each bone ------------------------------------------------------------------------------
  // [bone key, from joint, to joint, reference kind]
  _segments(rd) {
    const B = rd.bones, S = [];
    S.push({ bone: B.pelvis, a: J.pelvis, b: J.chest, ref: "hips", pos: true });
    S.push({ spine: true, a: J.pelvis, b: J.chest, ref: "shoulders" });
    S.push({ bone: B.head, a: J.chest, b: J.head, ref: "shoulders" });
    S.push({ bone: B.lThigh, a: J.lHip, b: J.lKnee, ref: "hips" }); S.push({ bone: B.lCalf, a: J.lKnee, b: J.lFoot, ref: "hips" });
    S.push({ bone: B.rThigh, a: J.rHip, b: J.rKnee, ref: "hips" }); S.push({ bone: B.rCalf, a: J.rKnee, b: J.rFoot, ref: "hips" });
    S.push({ bone: B.lUpper, a: J.lSh, b: J.lElb, ref: "arm", c: J.lHand }); S.push({ bone: B.lFore, a: J.lElb, b: J.lHand, ref: "arm", c: J.lHand, up: J.lSh });
    S.push({ bone: B.rUpper, a: J.rSh, b: J.rElb, ref: "arm", c: J.rHand }); S.push({ bone: B.rFore, a: J.rElb, b: J.rHand, ref: "arm", c: J.rHand, up: J.rSh });
    return S;
  }
  _vec(rd, i, out) { return out.set(rd.P[i * 3], rd.P[i * 3 + 1], rd.P[i * 3 + 2]); }
  _torsoFwd(rd, out) {
    const T = this.T, a = this._vec(rd, J.lHip, new T.Vector3()).sub(this._vec(rd, J.rHip, new T.Vector3()));
    const u = this._vec(rd, J.chest, new T.Vector3()).sub(this._vec(rd, J.pelvis, new T.Vector3()));
    return out.copy(a).cross(u).normalize().multiplyScalar(rd.sign);
  }
  // an orthonormal frame from a segment and a reference; the previous z stands in when the reference lines up with the segment
  _basis(rd, seg, prevZ, outQ) {
    const T = this.T, x = this._vec(rd, seg.b, new T.Vector3()).sub(this._vec(rd, seg.a, new T.Vector3())).normalize();
    let r;
    if (seg.ref === "hips") r = this._vec(rd, J.lHip, new T.Vector3()).sub(this._vec(rd, J.rHip, new T.Vector3()));
    else if (seg.ref === "shoulders") r = this._vec(rd, J.lSh, new T.Vector3()).sub(this._vec(rd, J.rSh, new T.Vector3()));
    else {
      // an arm: the plane the elbow bends in, when it is bent, carried along from the last frame when it is straight
      const s = seg.up !== undefined ? seg.up : seg.a, e = seg.up !== undefined ? seg.a : seg.b;
      const u1 = this._vec(rd, e, new T.Vector3()).sub(this._vec(rd, s, new T.Vector3())).normalize();
      const u2 = this._vec(rd, seg.c, new T.Vector3()).sub(this._vec(rd, e, new T.Vector3())).normalize();
      const bend = u1.clone().cross(u2); const bl = bend.length();
      if (prevZ) r = prevZ.clone().lerp(bl > 0.25 ? bend.normalize() : prevZ, bl > 0.25 ? 0.12 : 0);
      else r = bl > 0.25 ? bend.normalize() : this._torsoFwd(rd, new T.Vector3());
    }
    let z = r.clone().addScaledVector(x, -r.dot(x));
    if (z.lengthSq() < 0.04 * Math.max(1e-6, r.lengthSq()) && prevZ) z = prevZ.clone().addScaledVector(x, -prevZ.dot(x));
    if (z.lengthSq() < 1e-8) z = Math.abs(x.y) < 0.9 ? new T.Vector3(0, 1, 0).addScaledVector(x, -x.y) : new T.Vector3(1, 0, 0).addScaledVector(x, -x.x);
    z.normalize();
    const y = z.clone().cross(x);
    this._m.makeBasis(x, y, z);
    outQ.setFromRotationMatrix(this._m);
    return z;
  }
  _captureFrames(rd) {
    const T = this.T, segs = this._segments(rd);
    rd.frames = segs.map(seg => {
      const f = { seg: seg, q0: new T.Quaternion(), z: null, bq: [], bp: null };
      f.z = this._basis(rd, seg, null, f.q0);
      const bones = seg.spine ? rd.bones.spine : [seg.bone];
      bones.forEach(b => f.bq.push(b.getWorldQuaternion(new T.Quaternion())));
      if (seg.pos) f.bp = seg.bone.getWorldPosition(new T.Vector3()).sub(this._vec(rd, seg.a, new T.Vector3()));
      return f;
    });
    // the pelvis frame's rotation is needed for the spine blend
    rd.frames.pelvis = rd.frames[0]; rd.frames.chest = rd.frames[1];
  }

  // ---- stepping ----------------------------------------------------------------------------------------------------
  update(dt) {
    dt = clamp(dt || 0, 0, 0.1);
    for (let k = this.list.length - 1; k >= 0; k--) {
      const rd = this.list[k];
      if (!rd.root.parent && rd.state !== "blend") { this.release(rd); continue; }
      rd.t += dt;
      if (rd.state === "fall") this._simulate(rd, dt);
      else if (rd.state === "getup") this._getUp(rd, dt);
      else if (rd.state === "still") {
        rd.wait -= dt;
        if (rd.wait <= 0) { if (rd.opts.dead || rd.opts.getUp === false) { rd.state = "frozen"; } else this._startGetUp(rd); }
      }
      if (rd.state === "blend") { this._blendOut(rd, dt); continue; }
      if (rd.state !== "frozen" || !rd.frozenWritten) { this._write(rd); if (rd.state === "frozen") rd.frozenWritten = true; }
    }
  }

  _simulate(rd, dt) {
    const h = this.h, P = rd.P, O = rd.O, g = this.g, damp = 0.9996;
    rd.acc += dt;
    let steps = 0;
    // the ground under each joint, once a frame. Where it has stepped up by more than about half the joint's size (a kerb,
    // a step) since last frame and the joint is below the top, it ran into the side of it: back to where it was, like a wall.
    for (let i = 0; i < N; i++) {
      const o = i * 3, g = this.ground(P[o], P[o + 2], P[o + 1] + 0.6);
      if (rd.F && g - rd.G[i] > RADIUS[i] * 0.6 && P[o + 1] - RADIUS[i] < g - 0.01) {
        const vx = P[o] - O[o], vz = P[o + 2] - O[o + 2];
        P[o] = rd.F[o]; P[o + 2] = rd.F[o + 2]; O[o] = P[o] + vx * 0.2; O[o + 2] = P[o + 2] + vz * 0.2;
      } else rd.G[i] = g;
    }
    const mu = this.friction ? this.friction(P[0], P[2]) : 0.65;
    while (rd.acc >= h && steps < 24) {
      rd.acc -= h; steps++;
      for (let i = 0; i < N; i++) {
        const o = i * 3;
        for (let c = 0; c < 3; c++) {
          const p = P[o + c], v = (p - O[o + c]) * damp;
          O[o + c] = p; P[o + c] = p + v + (c === 1 ? -g * h * h : 0);
        }
      }
      for (let i = 0; i < N; i++) { rd.VY[i] = (P[i * 3 + 1] - O[i * 3 + 1]) / h; rd.contact[i] = 0; }
      for (let it = 0; it < this.iterations; it++) { this._solve(rd); this._collide(rd, false, mu); }
      this._collide(rd, true, mu);
    }
    if (rd.acc > h) rd.acc = 0;
    rd.F = Float32Array.from(P);
    // at rest: nothing moving faster than a slow crawl for half a second (or it has gone on long enough)
    let vmax = 0, grounded = 0;
    for (let i = 0; i < N; i++) {
      const o = i * 3, vx = P[o] - O[o], vy = P[o + 1] - O[o + 1], vz = P[o + 2] - O[o + 2];
      vmax = Math.max(vmax, Math.sqrt(vx * vx + vy * vy + vz * vz) / h);
      if (P[o + 1] - RADIUS[i] - rd.G[i] < 0.06) grounded++;
    }
    if (vmax < 0.35 && grounded >= 4) rd.still += dt; else rd.still = 0;
    if (rd.still > 0.5 || rd.t > 9) this._settle(rd);
  }

  _settle(rd) {
    if (rd.state !== "fall") return;
    rd.state = "still"; rd.wait = rd.opts.dead ? 0 : (rd.opts.lieFor !== undefined ? rd.opts.lieFor : 0.9 + Math.random() * 0.7);
    for (let i = 0; i < N * 3; i++) rd.O[i] = rd.P[i];
    if (rd.opts.onSettle) try { rd.opts.onSettle(rd); } catch (e) { console.warn("[ragdoll] onSettle", e); }
  }

  _solve(rd) {
    const P = rd.P;
    const pull = (a, b, len, k, only) => {
      const ao = a * 3, bo = b * 3, dx = P[bo] - P[ao], dy = P[bo + 1] - P[ao + 1], dz = P[bo + 2] - P[ao + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      if (only === 1 && d >= len) return; if (only === 2 && d <= len) return;
      const wa = 1 / MASS[a], wb = 1 / MASS[b], s = k * (d - len) / d / (wa + wb);
      P[ao] += dx * s * wa; P[ao + 1] += dy * s * wa; P[ao + 2] += dz * s * wa;
      P[bo] -= dx * s * wb; P[bo + 1] -= dy * s * wb; P[bo + 2] -= dz * s * wb;
    };
    for (const c of rd.cons) pull(c[0], c[1], c[2], c[3], 0);
    for (const r of rd.ranges) { pull(r[0], r[1], r[2], r[4], 1); pull(r[0], r[1], r[3], r[4], 2); }
    // knees bend forwards only: the knee stays on the front side of the hip-ankle line (hinge axis along the hips)
    const sx = P[J.lHip * 3] - P[J.rHip * 3], sy = P[J.lHip * 3 + 1] - P[J.rHip * 3 + 1], sz = P[J.lHip * 3 + 2] - P[J.rHip * 3 + 2];
    for (const [hp, kn, ft] of [[J.lHip, J.lKnee, J.lFoot], [J.rHip, J.rKnee, J.rFoot]]) {
      const ax = P[ft * 3] - P[hp * 3], ay = P[ft * 3 + 1] - P[hp * 3 + 1], az = P[ft * 3 + 2] - P[hp * 3 + 2];
      // forward for this knee = (foot - hip) x side, times the body's handedness
      let kx = (ay * sz - az * sy) * rd.sign, ky = (az * sx - ax * sz) * rd.sign, kz = (ax * sy - ay * sx) * rd.sign;
      // near a leg pointing along the hip line (splayed out sideways) the hinge's forward is undefined and flips: leave it alone there
      const kl = Math.sqrt(kx * kx + ky * ky + kz * kz), al = Math.sqrt(ax * ax + ay * ay + az * az), sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (kl < 0.5 * al * sl) continue;
      kx /= kl; ky /= kl; kz /= kl;
      const mx = (P[hp * 3] + P[ft * 3]) / 2, my = (P[hp * 3 + 1] + P[ft * 3 + 1]) / 2, mz = (P[hp * 3 + 2] + P[ft * 3 + 2]) / 2;
      const along = (P[kn * 3] - mx) * kx + (P[kn * 3 + 1] - my) * ky + (P[kn * 3 + 2] - mz) * kz;
      // the hip: the thigh can swing forwards a long way but backwards only about 20 degrees past the line of the trunk
      const ux = P[J.chest * 3] - P[J.pelvis * 3], uy = P[J.chest * 3 + 1] - P[J.pelvis * 3 + 1], uz = P[J.chest * 3 + 2] - P[J.pelvis * 3 + 2];
      let fx = (sy * uz - sz * uy) * rd.sign, fy = (sz * ux - sx * uz) * rd.sign, fz = (sx * uy - sy * ux) * rd.sign;
      const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (fl > 1e-6) {
        fx /= fl; fy /= fl; fz /= fl;
        const tx = P[kn * 3] - P[hp * 3], ty = P[kn * 3 + 1] - P[hp * 3 + 1], tz = P[kn * 3 + 2] - P[hp * 3 + 2];
        const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1, back = (tx * fx + ty * fy + tz * fz) / tl;
        if (back < -0.34) {
          const c = Math.min(0.004, (-0.34 - back) * tl * 0.4);
          P[kn * 3] += fx * c; P[kn * 3 + 1] += fy * c; P[kn * 3 + 2] += fz * c;
        }
      }
      // a straight leg is allowed (and a hair past straight), so a leg lying flat is not pushed into the ground
      // Only the knee is moved: pushing the hip and ankle the other way pumps energy into a leg lying on the ground
      // (the ground takes the knee's share back and the rest lifts the body).
      if (along < -0.03) {
        const c = Math.min(0.004, (-0.03 - along) * 0.5);
        P[kn * 3] += kx * c; P[kn * 3 + 1] += ky * c; P[kn * 3 + 2] += kz * c;
      }
    }
  }

  // The ground and the walls. During the solver passes a joint that is under the ground is simply put back on it; in the
  // final pass the velocity is made honest: the solver's corrections must not launch a body (any upward speed it
  // gained from being pushed out of the ground is taken away), a hard landing bounces a little, and sliding obeys friction.
  _collide(rd, final, mu) {
    const P = rd.P, O = rd.O, h = this.h, g = this.g;
    for (let i = 0; i < N; i++) {
      const o = i * 3, floor = rd.G[i] + RADIUS[i];
      if (P[o + 1] < floor) { P[o + 1] = floor; rd.contact[i] = 1; }
      if (!final) continue;
      if (rd.contact[i] || P[o + 1] < floor + 0.004) {
        const vin = rd.VY[i];
        // a hard landing: the host is told how fast that part hit
        if (vin < -5 && !rd.was[i] && rd.opts.onHit) {
          rd.hurt += (-vin - 5) * HURT[i];
          try { rd.opts.onHit(rd, -vin, RAGDOLL_JOINTS[i]); } catch (e) { /* host */ }
        }
        const vy = vin < -2.5 ? -vin * 0.1 : Math.min(0.2, Math.max(0, (P[o + 1] - O[o + 1]) / h) * 0);
        O[o + 1] = P[o + 1] - vy * h;
        // Coulomb friction: the sliding speed drops by mu g per second of contact; cloth and flesh soak up a little more
        const vx = (P[o] - O[o]) / h * 0.99, vz = (P[o + 2] - O[o + 2]) / h * 0.99, sp = Math.sqrt(vx * vx + vz * vz);
        if (sp > 1e-5) { const ns = Math.max(0, sp - mu * g * h) / sp; O[o] = P[o] - vx * ns * h; O[o + 2] = P[o + 2] - vz * ns * h; }
        rd.was[i] = 1;
      } else if (P[o + 1] > floor + 0.08) rd.was[i] = 0;
      // walls: back out the way it came, losing most of the speed into it
      if (this.blocked && this.blocked(P[o], P[o + 2], RADIUS[i], P[o + 1])) {
        if (!this.blocked(O[o], P[o + 2], RADIUS[i], P[o + 1])) { const vx = P[o] - O[o]; P[o] = O[o]; O[o] = P[o] + vx * 0.25; }
        else if (!this.blocked(P[o], O[o + 2], RADIUS[i], P[o + 1])) { const vz = P[o + 2] - O[o + 2]; P[o + 2] = O[o + 2]; O[o + 2] = P[o + 2] + vz * 0.25; }
        else { P[o] = O[o]; P[o + 2] = O[o + 2]; }
      }
    }
  }

  // ---- getting up --------------------------------------------------------------------------------------------------
  _startGetUp(rd) {
    const T = this.T, P = rd.P, D = rd.dims;
    const pel = this._vec(rd, J.pelvis, new T.Vector3()), head = this._vec(rd, J.head, new T.Vector3());
    const fwd = this._torsoFwd(rd, new T.Vector3());
    const prone = fwd.y < 0;
    let dx = head.x - pel.x, dz = head.z - pel.z; if (!prone) { dx = -dx; dz = -dz; }
    if (Math.hypot(dx, dz) < 1e-3) { dx = fwd.x; dz = fwd.z; }
    const yaw = Math.atan2(dx, dz), F = { x: Math.sin(yaw), z: Math.cos(yaw) }, Lx = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const O1 = { x: pel.x, z: pel.z }, O2 = prone ? { x: pel.x + F.x * 0.1, z: pel.z + F.z * 0.1 } : { x: pel.x + F.x * 0.42, z: pel.z + F.z * 0.42 };
    // keep the destination out of walls
    if (this.blocked && this.blocked(O2.x, O2.z, 0.3, pel.y)) { O2.x = O1.x; O2.z = O1.z; }
    const st = 0.08;                                             // ankle height
    const stand = () => {
      const hipY = st + D.Ls + D.Lt, pY = hipY + D.dy, cY = pY + D.Lsp, sY = cY - D.shDrop;
      return [[0, pY, 0], [0, cY, -0.01], [0, cY + D.Ln, 0.02], [D.hw, hipY, 0], [D.hw, st + D.Ls, 0.02], [D.hw, st, 0],
        [-D.hw, hipY, 0], [-D.hw, st + D.Ls, 0.02], [-D.hw, st, 0],
        [D.sw, sY, 0], [D.sw + 0.03, sY - D.ua, -0.01], [D.sw + 0.04, sY - D.ua - D.fa, 0.04],
        [-D.sw, sY, 0], [-D.sw - 0.03, sY - D.ua, -0.01], [-D.sw - 0.04, sY - D.ua - D.fa, 0.04]];
    };
    const crouch = () => {
      const kY = st + D.Ls * 0.82, kZ = D.Ls * 0.57, hY = kY + 0.26 * D.Lt, hZ = kZ - 0.97 * D.Lt, pY = hY + D.dy * 0.7;
      const cY = pY + D.Lsp * 0.72, cZ = hZ + D.Lsp * 0.69, sY = cY - D.shDrop;
      const hand = [D.hw + 0.06, kY + 0.07, kZ + 0.07];
      return [[0, pY, hZ], [0, cY, cZ], [0, cY + D.Ln * 0.85, cZ + D.Ln * 0.5], [D.hw, hY, hZ], [D.hw + 0.04, kY, kZ], [D.hw, st, 0],
        [-D.hw, hY, hZ], [-D.hw - 0.04, kY, kZ], [-D.hw, st, 0],
        [D.sw, sY, cZ], [(D.sw + hand[0]) / 2 + 0.08, (sY + hand[1]) / 2, (cZ + hand[2]) / 2 - 0.04], hand,
        [-D.sw, sY, cZ], [-(D.sw + hand[0]) / 2 - 0.08, (sY + hand[1]) / 2, (cZ + hand[2]) / 2 - 0.04], [-hand[0], hand[1], hand[2]]];
    };
    const fours = () => {
      const kY = 0.07, hY = kY + D.Lt * 0.96, pY = hY + D.dy * 0.5, cY = pY + 0.05, cZ = 0.05 + D.Lsp * 0.97, sY = cY - D.shDrop * 0.3;
      return [[0, pY, 0.05], [0, cY, cZ], [0, cY + D.Ln * 0.4, cZ + D.Ln * 0.9], [D.hw, hY, 0.05], [D.hw, kY, 0], [D.hw, 0.07, -D.Ls],
        [-D.hw, hY, 0.05], [-D.hw, kY, 0], [-D.hw, 0.07, -D.Ls],
        [D.sw, sY, cZ - 0.02], [D.sw + 0.02, (sY + 0.05) / 2, cZ + 0.02], [D.sw, 0.05, cZ + 0.05],
        [-D.sw, sY, cZ - 0.02], [-D.sw - 0.02, (sY + 0.05) / 2, cZ + 0.02], [-D.sw, 0.05, cZ + 0.05]];
    };
    const sitUp = () => {
      const hY = 0.11, kY = hY + D.Lt * 0.64, kZ = 0.02 + D.Lt * 0.77, fZ = kZ + Math.sqrt(Math.max(0.01, D.Ls * D.Ls - (kY - st) * (kY - st)));
      const cY = 0.13 + D.Lsp * 0.94, cZ = D.Lsp * 0.34, sY = cY - D.shDrop;
      return [[0, 0.13, 0], [0, cY, cZ], [0, cY + D.Ln * 0.9, cZ + D.Ln * 0.42], [D.hw, hY, 0.02], [D.hw, kY, kZ], [D.hw, st, fZ],
        [-D.hw, hY, 0.02], [-D.hw, kY, kZ], [-D.hw, st, fZ],
        [D.sw, sY, cZ], [D.sw + 0.08, (sY + 0.05) / 2, (cZ - 0.22) / 2 - 0.05], [D.sw + 0.08, 0.05, -0.22],
        [-D.sw, sY, cZ], [-D.sw - 0.08, (sY + 0.05) / 2, (cZ - 0.22) / 2 - 0.05], [-D.sw - 0.08, 0.05, -0.22]];
    };
    const world = (pose, O) => pose.map(p => {
      const x = O.x + Lx.x * p[0] + F.x * p[2], z = O.z + Lx.z * p[0] + F.z * p[2];
      return [x, this.ground(x, z, pel.y + 0.6) + p[1], z];
    });
    // left in the poses is +x: mirror them if this skeleton is the other way round
    if (rd.sign < 0) { Lx.x = -Lx.x; Lx.z = -Lx.z; }
    rd.seq = prone
      ? [{ pose: world(fours(), O1), T: 0.6 }, { pose: world(crouch(), O2), T: 0.5 }, { pose: world(stand(), O2), T: 0.55 }]
      : [{ pose: world(sitUp(), O1), T: 0.55 }, { pose: world(crouch(), O2), T: 0.6 }, { pose: world(stand(), O2), T: 0.55 }];
    rd.seqI = 0; rd.seqT = 0; rd.from = Float32Array.from(P);
    rd.up = { x: O2.x, y: this.ground(O2.x, O2.z, pel.y + 0.6), z: O2.z, yaw: yaw, prone: prone };
    rd.state = "getup";
  }

  _getUp(rd, dt) {
    const step = rd.seq[rd.seqI], P = rd.P;
    rd.seqT += dt;
    const k = smooth(rd.seqT / step.T);
    for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) {
      const o = i * 3 + c, target = rd.from[o] + (step.pose[i][c] - rd.from[o]) * k;
      P[o] += (target - P[o]) * 0.7;
    }
    for (let i = 0; i < N; i++) rd.G[i] = this.ground(P[i * 3], P[i * 3 + 2], P[i * 3 + 1] + 0.6);
    for (let it = 0; it < 4; it++) { this._solve(rd); for (let i = 0; i < N; i++) { const f = rd.G[i] + RADIUS[i] * 0.6; if (P[i * 3 + 1] < f) P[i * 3 + 1] = f; } }
    for (let i = 0; i < N * 3; i++) rd.O[i] = P[i];
    if (rd.seqT >= step.T) {
      rd.seqI++; rd.seqT = 0; rd.from = Float32Array.from(P);
      if (rd.seqI >= rd.seq.length) {
        // standing: hand the body back to the host's animation, blending out of the ragdoll pose
        this._write(rd);
        rd.state = "blend";
        rd.blend = this._snapshot(rd);
        if (rd.opts.onUp) try { rd.opts.onUp(rd, rd.up); } catch (e) { console.warn("[ragdoll] onUp", e); }
      }
    }
  }

  _snapshot(rd) {
    const T = this.T, out = { t: 0, T: rd.opts.blendTime || 0.4, bones: [] };
    rd.frames.forEach(f => (f.seg.spine ? rd.bones.spine : [f.seg.bone]).forEach(b => {
      out.bones.push({ b: b, q: b.quaternion.clone(), wq: b === rd.bones.pelvis ? b.getWorldQuaternion(new T.Quaternion()) : null,
                       wp: b === rd.bones.pelvis ? b.getWorldPosition(new T.Vector3()) : null });
    }));
    return out;
  }

  // After the host's mixer has posed the figure, pull it from the stored ragdoll pose towards that, a little less each frame.
  _blendOut(rd, dt) {
    const B = rd.blend, T = this.T; B.t += dt;
    const w = smooth(B.t / B.T);
    const pq = this._q[0], lq = this._q[1];
    for (const e of B.bones) {
      if (e.wq) {
        // the pelvis was stored in the world: put it in its parent's space as it is now (the host has moved the root)
        e.b.parent.updateWorldMatrix(true, false);
        e.b.parent.getWorldQuaternion(pq);
        lq.copy(pq).invert().multiply(e.wq);
        const lp = e.b.parent.worldToLocal(e.wp.clone());
        e.b.position.lerpVectors(lp, e.b.position, w);
        e.b.quaternion.copy(lq.slerp(e.b.quaternion, w));
      } else e.b.quaternion.copy(e.q.clone().slerp(e.b.quaternion, w));
    }
    if (B.t >= B.T) this.release(rd);
  }

  // ---- posing the skeleton -----------------------------------------------------------------------------------------
  _write(rd) {
    const T = this.T, cur = this._q[0], rot = this._q[1], pq = this._q[2];
    const rotOf = f => { f.z = this._basis(rd, f.seg, f.z, cur); return new T.Quaternion().copy(cur).multiply(rot.copy(f.q0).invert()); };
    const Rp = rotOf(rd.frames.pelvis), Rc = rotOf(rd.frames.chest);
    const setWorld = (bone, wq) => {
      bone.parent.updateWorldMatrix(true, false);
      bone.parent.getWorldQuaternion(pq);
      bone.quaternion.copy(pq.invert().multiply(wq));
      bone.updateMatrix();
    };
    for (const f of rd.frames) {
      const seg = f.seg;
      if (seg.spine) {
        const n = rd.bones.spine.length;
        rd.bones.spine.forEach((b, i) => { const R = new T.Quaternion().copy(Rp).slerp(Rc, (i + 1) / n); setWorld(b, R.multiply(f.bq[i])); });
        continue;
      }
      const R = f === rd.frames.pelvis ? Rp : rotOf(f);
      if (seg.pos) {
        const p = this._vec(rd, seg.a, new T.Vector3()).add(f.bp.clone().applyQuaternion(R));
        seg.bone.parent.updateWorldMatrix(true, false);
        seg.bone.position.copy(seg.bone.parent.worldToLocal(p));
      }
      setWorld(seg.bone, new T.Quaternion().copy(R).multiply(f.bq[0]));
    }
  }

  // ---- handles -----------------------------------------------------------------------------------------------------
  release(rd) {
    const i = this.list.indexOf(rd); if (i >= 0) this.list.splice(i, 1);
    rd.culled.forEach(o => { o.frustumCulled = true; }); rd.culled.length = 0;
    rd.state = "done";
  }
  // the body's pelvis in the world (where the camera should look, where the character now is)
  pelvis(rd, out) { return this._vec(rd, J.pelvis, out || new this.T.Vector3()); }
  joint(rd, name, out) { return this._vec(rd, J[name], out || new this.T.Vector3()); }
  speed(rd) { let s = 0; for (let i = 0; i < 3; i++) s += ((rd.P[i] - rd.O[i]) / this.h) ** 2; return Math.sqrt(s); }
  find(root) { return this.list.find(r => r.root === root) || null; }
  // a body that was going to get up stays down (it died while falling)
  kill(rd) { rd.opts.dead = true; rd.opts.getUp = false; if (rd.state === "getup") { rd.state = "fall"; rd.still = 0; } }
  report() { return { active: this.list.length, moving: this.list.filter(r => r.state === "fall").length, states: this.list.map(r => r.state) }; }
}
