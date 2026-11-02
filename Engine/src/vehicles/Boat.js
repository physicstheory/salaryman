// Boat dynamics: a rigid hull on a moving sea.
//
// The hull is a real shape (a lofted V-bottom: keel, chines, topsides, a transom and a bow that rises and narrows), cut into a few hundred
// triangles. Every step each triangle is clipped against the actual wave surface (Ocean.js, the same swell the water shader draws) and
// the water acts on the wet part of it:
//   - hydrostatic pressure, rho g depth, normal to the face. Summed, that is buoyancy and the righting moments: the boat floats at the
//     draft its weight asks for, heels back upright, pitches over a crest and drops into a trough.
//   - pressure drag (the Kerner / Habrador face model): a face pushed into the water feels 0.5 rho Cp v^2 cos(theta) of pressure, a face
//     pulled away from it a smaller suction. On a bottom trimmed a few degrees bow-up at speed this is planing lift, so the boat climbs
//     out of the hole, stands on its aft third and runs flat and fast; on the sides it is the grip that turns it; on the transom at low
//     speed it is the drag of a stern dragging its own hole.
//   - skin friction on the wetted area (ITTC-57 line), and wave-making resistance with its hump near hull speed, which shrinks as the hull
//     lifts out of the water.
// The water's own orbital velocity is subtracted first, so waves carry and shove the hull.
//
// Propulsion is a propeller or jet below the transom: a power curve (thrust is power over speed, capped by bollard pull), vectored by the
// steering (outboard leg, sterndrive, jet nozzle) or, on an inboard, a rudder in the prop wash. A prop that comes out of the water (off a
// wave, or trimmed out too far) ventilates: the thrust goes and the engine races. A jet with the throttle shut cannot steer. Trim raises
// or lowers the thrust line (and the bow with it); the rider's weight shifts on a jet ski.
//
// Grounding: hull points below the sea bed or a beach are held up by a stiff, lossy contact with friction, so the boat runs aground and
// stops. Walls (quays, pier piles, buildings) stop it with a bump the host is told about.
//
//   const b = new Boat("runabout");  b.reset({ x, z, yaw });
//   each frame: b.step(dt, { throttle: -1..1, steer: -1..1, trim: -1..1 }, world)
//   world: { sea: Ocean, ground(x, z) -> sea-bed / land height, solid(x, z, y) -> bool }
//   read: b.pos, b.quat, b.vel, b.speed (m/s along the hull), b.telemetry(), events returned from step

const RHO = 1025, G = 9.81, RHO_AIR = 1.2;

export const BOAT_SPECS = {
  // L length, B beam, H hull depth (keel to gunwale), dead deadrise (deg), rise: bow rocker (m), mass (kg, crew and fuel in), power (kW),
  // drive: outboard | sterndrive | jet | inboard, steerMax (rad), cg: fraction of L forward of the transom, cgY above the keel
  jetski:   { name: "Jet ski",           L: 3.3, B: 1.20, H: 0.85, dead: 22, rise: 0.30, mass: 420,  power: 165, drive: "jet",        steerMax: 0.42, cg: 0.36, cgY: 0.38, cp: 0.7, top: 30 },
  rib:      { name: "Rigid inflatable",  L: 6.4, B: 2.45, H: 1.05, dead: 24, rise: 0.45, mass: 1500, power: 150, drive: "outboard",   steerMax: 0.52, cg: 0.33, cgY: 0.45, cp: 0.7, top: 22 },
  runabout: { name: "Sport runabout",    L: 7.4, B: 2.50, H: 1.25, dead: 21, rise: 0.50, mass: 2300, power: 270, drive: "sterndrive", steerMax: 0.46, cg: 0.33, cgY: 0.50, cp: 0.7, top: 25 },
  skiff:    { name: "Fishing skiff",     L: 5.2, B: 1.95, H: 0.95, dead: 14, rise: 0.35, mass: 750,  power: 45,  drive: "outboard",   steerMax: 0.55, cg: 0.35, cgY: 0.40, cp: 0.7, top: 12 },
  gyosen:   { name: "Fishing boat",      L: 11.5, B: 3.10, H: 1.70, dead: 12, rise: 0.70, mass: 8500, power: 330, drive: "inboard",    steerMax: 0.60, cg: 0.42, cgY: 0.70, cp: 1.0, top: 11 }
};

// ---- small vector helpers (plain arrays; the engine keeps three.js out of its physics) -------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function qmul(a, b) {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
          a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
          a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
          a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
function qnorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l; return q; }
function qFromYaw(y) { return [0, Math.sin(y / 2), 0, Math.cos(y / 2)]; }
// rotation matrix (row-major 3x3) from a quaternion
function qmat(q, m) {
  const [x, y, z, w] = q;
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - z * w);     m[2] = 2 * (x * z + y * w);
  m[3] = 2 * (x * y + z * w);     m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - x * w);
  m[6] = 2 * (x * z - y * w);     m[7] = 2 * (y * z + x * w);     m[8] = 1 - 2 * (x * x + y * y);
  return m;
}
const mv = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const mtv = (m, v) => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];

// ---- the hull --------------------------------------------------------------------------------------------------------------------------
// Body frame: x to port (left), y up, z forward; the origin is the centre of gravity. Returns the hull's vertices and triangles (outward
// normals), the outline at the gunwale (for walls) and the half-beam / keel functions the game uses to draw the same shape.
export function buildHull(spec, stations = 18, across = 3) {
  const L = spec.L, B = spec.B, H = spec.H, tb = Math.tan(spec.dead * Math.PI / 180);
  const zT = -spec.cg * L, yK = -spec.cgY;            // transom and keel, relative to the cg
  const half = t => {                                 // half-beam at the chine, t from 0 (transom) to 1 (stem)
    if (t < 0.55) return B * 0.5 * (0.94 + 0.06 * Math.sin(t / 0.55 * Math.PI / 2));
    const u = (t - 0.55) / 0.45;
    return B * 0.5 * Math.max(0.03, Math.sqrt(Math.max(0, 1 - u * u * u)) * (1 - 0.15 * u));
  };
  const keel = t => yK + (t > 0.5 ? spec.rise * Math.pow((t - 0.5) / 0.5, 2.2) : 0);
  const chineUp = t => 1 + (t > 0.6 ? 1.6 * Math.pow((t - 0.6) / 0.4, 1.5) : 0);   // the deadrise steepens towards the bow
  const verts = [], tris = [];
  const V = (x, y, z) => { verts.push([x, y, z]); return verts.length - 1; };
  const rows = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations, z = zT + t * L, hb = half(t), yk = keel(t), yc = Math.min(yK + H * 0.82, yk + hb * tb * chineUp(t));
    const yg = yK + H + (t > 0.6 ? 0.25 * H * Math.pow((t - 0.6) / 0.4, 2) : 0);         // the sheer rises to the bow
    const flare = 1 + 0.08 * Math.min(1, t * 1.4);
    const row = [];
    // starboard gunwale -> chine -> keel -> port chine -> port gunwale (x negative is starboard)
    row.push(V(-hb * flare, yg, z));
    row.push(V(-hb, yc, z));
    for (let k = across - 1; k >= 1; k--) { const f = k / across; row.push(V(-hb * f, yk + (yc - yk) * f, z)); }
    row.push(V(0, yk, z));
    for (let k = 1; k < across; k++) { const f = k / across; row.push(V(hb * f, yk + (yc - yk) * f, z)); }
    row.push(V(hb, yc, z));
    row.push(V(hb * flare, yg, z));
    rows.push(row);
  }
  // skin: quads between stations, wound so the normals point out
  for (let i = 0; i < stations; i++) {
    const a = rows[i], b = rows[i + 1];
    const midK = (a.length - 1) / 2;
    for (let k = 0; k < a.length - 1; k++) {
      // mirror the diagonal on the port side, so the two halves are the same shape and the boat does not pull to one side
      if (k < midK) { tris.push([a[k], a[k + 1], b[k + 1]]); tris.push([a[k], b[k + 1], b[k]]); }
      else { tris.push([a[k], a[k + 1], b[k]]); tris.push([a[k + 1], b[k + 1], b[k]]); }
    }
  }
  // the transom: a fan from its middle
  const r0 = rows[0], mid = V(0, (verts[r0[0]][1] + verts[r0[(r0.length - 1) / 2]][1]) / 2, zT);
  for (let k = 0; k < r0.length - 1; k++) tris.push([mid, r0[k + 1], r0[k]]);
  // the deck: closes the top so a swamped hull still has a top (it only matters when the sea is over the gunwale)
  for (let i = 0; i < stations; i++) {
    const a = rows[i], b = rows[i + 1], al = a.length - 1, bl = b.length - 1;
    tris.push([a[0], b[0], b[bl]]); tris.push([a[0], b[bl], a[al]]);
  }
  // normals and areas; make sure each points away from the hull's centre line
  const faces = tris.map(t => {
    const p0 = verts[t[0]], p1 = verts[t[1]], p2 = verts[t[2]];
    let n = cross(sub(p1, p0), sub(p2, p0));
    const A = Math.hypot(n[0], n[1], n[2]) / 2;
    if (A < 1e-6) return null;
    n = [n[0] / (2 * A), n[1] / (2 * A), n[2] / (2 * A)];
    const c = [(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3, (p0[2] + p1[2] + p2[2]) / 3];
    const out = [c[0], c[1] - (yK + H * 0.5), c[2] - (zT + L * 0.5)];
    if (dot(n, out) < 0) { n = [-n[0], -n[1], -n[2]]; t = [t[0], t[2], t[1]]; }
    return { v: t, n: n, A: A };
  }).filter(Boolean);
  const outline = [];
  for (let i = 0; i <= stations; i += 2) { outline.push(verts[rows[i][0]]); outline.push(verts[rows[i][rows[i].length - 1]]); }
  return { verts, faces, outline, half, keel, rows, zT, yK, L, B, H };
}

export class Boat {
  constructor(kind, opts = {}) {
    const s = BOAT_SPECS[kind] || BOAT_SPECS.runabout;
    this.kind = kind; this.spec = Object.assign({}, s, opts);
    const sp = this.spec;
    this.hull = buildHull(sp);
    this.m = sp.mass;
    // inertia about the cg (a box of the hull's size, plus the water that moves with it)
    const L = sp.L, B = sp.B, H = sp.H, add = 1.25;
    this.Ib = [this.m * (L * L + H * H) / 12 * add, this.m * (L * L + B * B) / 12 * add, this.m * (B * B + H * H) / 12 * add];
    this.pos = [0, 0, 0]; this.vel = [0, 0, 0]; this.quat = [0, 0, 0, 1]; this.w = [0, 0, 0];
    this.R = new Array(9).fill(0); qmat(this.quat, this.R);
    // the propeller (below and behind the transom on a leg, under the hull on an inboard) or the jet's intake grate under the bottom
    this.prop = sp.drive === "jet" ? [0, this.hull.yK - 0.02, this.hull.zT + 0.55]
              : sp.drive === "inboard" ? [0, this.hull.yK - 0.25, this.hull.zT + 0.6] : [0, this.hull.yK - 0.2, this.hull.zT - 0.35];
    this.bowPt = [0, this.hull.yK + sp.rise + 0.1, this.hull.zT + L * 0.97];
    this.rpm = 0; this.thrust = 0; this.vent = 0; this.steerNow = 0; this.trimNow = 0; this.throttleNow = 0;
    this.wet = 0; this.lift = 0; this.draft = 0; this.subVol = 0; this.planing = false; this.air = 0;
    this.capsized = 0; this.grounded = 0; this.acc = 0; this.t = 0;
    this._wv = this.hull.verts.map(() => [0, 0, 0]); this._dv = new Float32Array(this.hull.verts.length); this._wvel = this.hull.verts.map(() => [0, 0, 0]);
    this._s = {};
  }

  reset(o) {
    const sp = this.spec;
    this.quat = qFromYaw(o.yaw || 0); qmat(this.quat, this.R);
    // start at roughly the resting draft: the cg sits a little above the water
    const y = o.y !== undefined ? o.y : (o.sea ? o.sea.height(o.x, o.z) : 0) + sp.cgY * 0.45;
    this.pos = [o.x, y, o.z];
    const f = this.forward();
    const v = o.speed || 0;
    this.vel = [f[0] * v, 0, f[2] * v];
    this.w = [0, 0, 0];
    this.capsized = 0; this.grounded = 0; this.acc = 0;
    return this;
  }

  // body to world
  toWorld(b) { const r = mv(this.R, b); return [r[0] + this.pos[0], r[1] + this.pos[1], r[2] + this.pos[2]]; }
  forward() { return [this.R[2], this.R[5], this.R[8]]; }
  up() { return [this.R[1], this.R[4], this.R[7]]; }
  left() { return [this.R[0], this.R[3], this.R[6]]; }
  get yaw() { const f = this.forward(); return Math.atan2(f[0], f[2]); }
  get speed() { return dot(this.vel, this.forward()); }
  get heel() { const l = this.left(); return Math.asin(clamp(l[1], -1, 1)); }          // positive: port side up (heeled to starboard)
  get trim() { const f = this.forward(); return Math.asin(clamp(f[1], -1, 1)); }       // positive: bow up

  // Advance by dt (seconds), in fixed sub-steps of 1/120 s. Returns what happened worth telling the host (bumps, slams, grounding).
  step(dt, inp, world) {
    const ev = [];
    this.acc += Math.min(dt, 0.1);
    const h = 1 / 120;
    while (this.acc >= h) { this.acc -= h; this._step(h, inp || {}, world, ev); }
    return ev;
  }

  _step(h, inp, world, ev) {
    const sp = this.spec, hull = this.hull, R = this.R, sea = world.sea;
    this.t += h;
    if (sea && sea.time !== undefined && world.ownTime) sea.time += h;
    qmat(this.quat, R);
    const F = [0, -this.m * G, 0], T = [0, 0, 0];
    const addF = (f, at) => {                         // a force at a world point
      F[0] += f[0]; F[1] += f[1]; F[2] += f[2];
      const r = [at[0] - this.pos[0], at[1] - this.pos[1], at[2] - this.pos[2]];
      const t = cross(r, f); T[0] += t[0]; T[1] += t[1]; T[2] += t[2];
    };
    const velAt = p => { const r = [p[0] - this.pos[0], p[1] - this.pos[1], p[2] - this.pos[2]]; const c = cross(this.w, r); return [this.vel[0] + c[0], this.vel[1] + c[1], this.vel[2] + c[2]]; };

    // the sea under every vertex: how deep it is, and how the water there is moving
    const S = this._s, wv = this._wv, dv = this._dv, wvel = this._wvel;
    let wetV = 0;
    for (let i = 0; i < hull.verts.length; i++) {
      const p = mv(R, hull.verts[i]); p[0] += this.pos[0]; p[1] += this.pos[1]; p[2] += this.pos[2];
      wv[i] = p;
      if (sea) { sea.sample(p[0], p[2], S); dv[i] = S.y - p[1]; wvel[i][0] = S.vx; wvel[i][1] = S.vy; wvel[i][2] = S.vz; }
      else { dv[i] = -p[1]; wvel[i][0] = wvel[i][1] = wvel[i][2] = 0; }
      if (dv[i] > 0) wetV++;
    }

    // ---- the water on the wet part of every face -------------------------------------------------------------------------------------
    const spd = Math.hypot(this.vel[0], this.vel[1], this.vel[2]);
    const Rn = Math.max(1e5, spd * sp.L / 1.19e-6);
    const Cf = 0.075 / Math.pow(Math.log10(Rn) - 2, 2) + 0.0004;        // ITTC-57 plus a roughness allowance
    let wetA = 0, vol = 0, lift = 0, bottomWet = 0;
    const poly = this._poly || (this._poly = []);
    const up = this.up();
    for (let fi = 0; fi < hull.faces.length; fi++) {
      const f = hull.faces[fi], a = f.v[0], b = f.v[1], c = f.v[2];
      const da = dv[a], db = dv[b], dc = dv[c];
      if (da <= 0 && db <= 0 && dc <= 0) continue;
      const n = mv(R, f.n);
      // clip the triangle to the wet side (depth > 0)
      poly.length = 0;
      const P = [a, b, c], D = [da, db, dc];
      for (let k = 0; k < 3; k++) {
        const i0 = P[k], i1 = P[(k + 1) % 3], d0 = D[k], d1 = D[(k + 1) % 3];
        if (d0 > 0) poly.push([wv[i0], d0, wvel[i0]]);
        if ((d0 > 0) !== (d1 > 0)) {
          const t = d0 / (d0 - d1), p0 = wv[i0], p1 = wv[i1];
          const w0 = wvel[i0], w1 = wvel[i1];
          poly.push([[p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t], 0,
                     [w0[0] + (w1[0] - w0[0]) * t, w0[1] + (w1[1] - w0[1]) * t, w0[2] + (w1[2] - w0[2]) * t]]);
        }
      }
      for (let k = 1; k + 1 < poly.length; k++) {
        const q0 = poly[0], q1 = poly[k], q2 = poly[k + 1];
        const e = cross(sub(q1[0], q0[0]), sub(q2[0], q0[0]));
        const A = Math.hypot(e[0], e[1], e[2]) / 2;
        if (A < 1e-7) continue;
        const cp = [(q0[0][0] + q1[0][0] + q2[0][0]) / 3, (q0[0][1] + q1[0][1] + q2[0][1]) / 3, (q0[0][2] + q1[0][2] + q2[0][2]) / 3];
        const depth = (q0[1] + q1[1] + q2[1]) / 3;
        const wvc = [(q0[2][0] + q1[2][0] + q2[2][0]) / 3, (q0[2][1] + q1[2][1] + q2[2][1]) / 3, (q0[2][2] + q1[2][2] + q2[2][2]) / 3];
        wetA += A;
        // hydrostatic pressure
        const ph = RHO * G * depth * A;
        addF([-n[0] * ph, -n[1] * ph, -n[2] * ph], cp);
        vol += depth * A * Math.max(0, -n[1]);
        // the face's velocity through the water
        const v = velAt(cp); v[0] -= wvc[0]; v[1] -= wvc[1]; v[2] -= wvc[2];
        const vm = Math.hypot(v[0], v[1], v[2]);
        if (vm > 1e-4) {
          const vn = dot(v, n), cos = vn / vm;
          // pressure drag (into the water) and suction (pulling away); the linear term damps heave and roll at low speed
          let p;
          if (cos > 0) p = -(0.5 * RHO * sp.cp * vm * vm * cos + 400 * vm * cos) * A;
          else p = (0.5 * RHO * 0.35 / (1 + vm * vm * 0.25) * vm * vm * -cos + 400 * vm * -cos) * A;   // suction: flow leaves a face cleanly at speed (a dry transom)
          // slamming: a face hitting the water fast loses some of its speed at once
          const fp = [n[0] * p, n[1] * p, n[2] * p];
          addF(fp, cp);
          if (n[1] < -0.3) { lift += Math.max(0, fp[1]); bottomWet += A; }
          // skin friction along the face
          const vt = [v[0] - n[0] * vn, v[1] - n[1] * vn, v[2] - n[2] * vn], vtm = Math.hypot(vt[0], vt[1], vt[2]);
          const fv = -0.5 * RHO * Cf * A * vtm;
          addF([vt[0] * fv, vt[1] * fv, vt[2] * fv], cp);
        }
      }
    }
    this.wet = wetA; this.subVol = vol; this.lift = lift;
    this.air = wetV === 0 ? this.air + h : 0;

    // wave-making resistance: a hump near hull speed, scaled by how much of the hull is still in the water
    const fwd = this.forward(), vf = dot(this.vel, fwd);
    const vh = [this.vel[0], 0, this.vel[2]], vhm = Math.hypot(vh[0], vh[2]);
    if (vhm > 0.05 && vol > 0) {
      const Fn = vhm / Math.sqrt(G * sp.L);
      const hump = 0.17 * Math.exp(-Math.pow((Fn - 0.55) / 0.3, 2)) + 0.02 * Math.min(1, Fn * 2);
      const Rw = RHO * G * vol * hump * Math.min(1, Fn * 3);
      addF([-vh[0] / vhm * Rw, 0, -vh[2] / vhm * Rw], this.pos);
    }
    // air
    if (spd > 0.1) {
      const Fa = -0.5 * RHO_AIR * 0.6 * sp.B * sp.H * 1.2 * spd;
      addF([this.vel[0] * Fa, this.vel[1] * Fa, this.vel[2] * Fa], this.pos);
    }

    // ---- propulsion ------------------------------------------------------------------------------------------------------------------
    const thrIn = clamp(inp.throttle || 0, -1, 1);
    this.throttleNow += (thrIn - this.throttleNow) * Math.min(1, h * (thrIn > this.throttleNow ? 3.5 : 6));
    const steerRate = sp.drive === "jet" ? 5 : 3;
    this.steerNow += (clamp(inp.steer || 0, -1, 1) - this.steerNow) * Math.min(1, h * steerRate);
    this.trimNow += (clamp(inp.trim || 0, -1, 1) - this.trimNow) * Math.min(1, h * 0.8);
    const propW = this.toWorld(this.prop);
    const propD = sea ? sea.height(propW[0], propW[2]) - propW[1] : -propW[1];
    const subm = clamp(propD / (sp.drive === "jet" ? 0.12 : 0.22), 0, 1);
    this.vent += ((1 - subm) - this.vent) * Math.min(1, h * 10);
    const P = sp.power * 1000 * Math.abs(this.throttleNow);
    const bollard = sp.power * 1000 / 17;
    let Tm = this.throttleNow >= 0 ? Math.min(bollard * this.throttleNow, 0.62 * P / Math.max(1, vf)) : -0.45 * bollard * -this.throttleNow;
    Tm *= (1 - this.vent);
    // top speed: a governor on the engine (it runs out of revs), so the boat settles at its rated speed on flat water
    if (vf > sp.top) Tm *= Math.max(0, 1 - (vf - sp.top) / 2);
    this.thrust = Tm;
    const steerA0 = this.steerNow * sp.steerMax * (sp.drive === "inboard" ? 0 : 1);
    const steerA = steerA0;
    const jetDead = sp.drive === "jet" ? Math.min(1, Math.abs(this.throttleNow) * 3 + 0.08) : 1;
    const trimA = this.trimNow * 0.11 + (sp.drive === "jet" ? 0 : 0.02);
    // thrust line in the body frame: forward, turned by the leg (steer to the right turns the boat right: the stern goes left)
    const tb = [Math.sin(steerA) * jetDead, Math.sin(trimA), Math.cos(steerA)];
    const tw = mv(R, tb);
    addF([tw[0] * Tm, tw[1] * Tm, tw[2] * Tm], propW);
    // a jet steers with its whole stream, not its net thrust: the nozzle turns the water it has taken in and thrown out faster, so at
    // speed the turning force is several times the push
    if (sp.drive === "jet" && Tm > 0) {
      const mdot = 400 * sp.power / 165 * Math.abs(this.throttleNow);
      const lw = this.left();
      // once the stern is sliding the intake draws aerated water and the nozzle's push fades: the jet ski skids rather than spins
      const vp = velAt(propW), slip = Math.abs(Math.atan2(dot(vp, lw), Math.max(1, Math.abs(dot(vp, fwd)))));
      const side = (Tm + mdot * Math.max(0, vf)) * Math.sin(steerA) * (1 - this.vent) * clamp(1 - slip / 0.4, 0.15, 1);
      addF([lw[0] * side, lw[1] * side, lw[2] * side], propW);
    }
    // the foils under the stern: an outboard's or sterndrive's lower unit (turned with the steering), a jet ski's fixed fins, a keel's
    // skeg. Each makes lift from the angle between itself and the water flowing past it, which both steers the boat at speed and stops its
    // stern skidding sideways (the boat carves instead of spinning out). The lift stops growing past about 17 degrees.
    {
      const foils = this._foils || (this._foils = [
        { at: [0, this.hull.yK - 0.15, this.hull.zT - 0.3], A: sp.drive === "outboard" ? 0.07 * sp.power / 100 + 0.04 : sp.drive === "sterndrive" ? 0.16 : 0, steer: true },
        { at: [0, this.hull.yK - 0.04, this.hull.zT + sp.L * (sp.drive === "jet" ? sp.cg - 0.05 : sp.drive === "inboard" ? 0.3 : 0.12)], A: sp.drive === "jet" ? 0.12 : sp.drive === "inboard" ? 0.1 * sp.L : 0.025 * sp.L, steer: false }   // a jet ski's grip is its V and chines, just aft of the rider
      ]);
      const lw = this.left();
      for (const fo of foils) {
        if (!fo.A) continue;
        const pw = this.toWorld(fo.at);
        const fd = sea ? sea.height(pw[0], pw[2]) - pw[1] : -pw[1];
        if (fd <= 0) continue;
        const v = velAt(pw), vfo = dot(v, fwd), vla = dot(v, lw);
        if (vfo < 0.5) continue;
        const ang = (fo.steer ? steerA0 : 0);
        // flow angle at the foil (sideslip) against the foil's own angle: positive alpha pushes the stern to port
        let alpha = Math.atan2(-vla, vfo) + ang;
        const stall = 0.3, a2 = clamp(alpha, -stall, stall);          // past the stall the chines and the hull's own side keep holding
        const Lf = 0.5 * RHO * vfo * vfo * fo.A * 2 * Math.PI * a2 * Math.min(1, fd / 0.15);
        addF([lw[0] * Lf, lw[1] * Lf, lw[2] * Lf], pw);
        const Dr = 0.5 * RHO * vfo * vfo * fo.A * (0.01 + 0.5 * a2 * a2);
        addF([-fwd[0] * Dr, -fwd[1] * Dr, -fwd[2] * Dr], pw);
      }
    }
    // an inboard's rudder: lift in the prop wash and the flow past it
    if (sp.drive === "inboard" && subm > 0) {
      const wash = Math.sqrt(Math.max(0, vf * vf + 2 * Math.max(0, Tm) / (RHO * 0.6)));
      const da = this.steerNow * sp.steerMax, lat = 0.5 * RHO * 0.4 * wash * wash * Math.sign(da) * Math.min(1.0, 2 * Math.PI * Math.abs(da) * 0.6);   // a 0.4 m² rudder, stalling near CL 1
      const lw = this.left();
      const rp = this.toWorld([0, this.hull.yK + 0.2, this.hull.zT - 0.3]);
      addF([lw[0] * lat, lw[1] * lat, lw[2] * lat], rp);
    }
    // a planing V-hull banks into its turn: the inside chine digs in and the outside one lifts as the hull slides, so on the plane it
    // heels in by about two thirds of the angle a bike would lean for the same turn (the hydrodynamic lift of a skidding V does this; the
    // face model above is too coarse to show it on its own)
    if (sp.drive !== "jet") {
      const yawRate = dot(this.w, up);
      const onPlane = clamp((vf - 3) / 6, 0, 1) * (wetV ? 1 : 0);
      const want = Math.atan(clamp(-yawRate * Math.max(0, vf) / G, -1.5, 1.5)) * 0.62;
      const k = this.m * G * sp.B * 0.6 * (want - this.heel) * onPlane;
      T[0] += fwd[0] * k; T[1] += fwd[1] * k; T[2] += fwd[2] * k;
    }
    // the rider on a jet ski balances it like a bike: he leans into the turn (and wherever the stick tells him), and a narrow hull at
    // speed, standing on a hand's width of water, would fall over without him
    if (sp.drive === "jet") {
      const yawRate = dot(this.w, up);
      const want = clamp(Math.atan(clamp(-yawRate * Math.max(0, vf) / G, -2, 2)) * 0.8 + (inp.lean || 0) * 0.25, -0.75, 0.75);
      const rollRate = dot(this.w, fwd);
      this._lean = (this._lean || 0) + (want - (this._lean || 0)) * Math.min(1, h * 2.5);      // a rider leans in over a moment, not instantly
      const k = this.m * G * 2.2 * (this._lean - this.heel) - this.Ib[2] * 18 * rollRate;
      T[0] += fwd[0] * k; T[1] += fwd[1] * k; T[2] += fwd[2] * k;
    }

    // ---- ground and walls ------------------------------------------------------------------------------------------------------------
    let grounded = 0;
    if (world.ground) {
      const nV = hull.verts.length / 2;
      for (let i = 0; i < hull.verts.length; i += 2) {
        const p = wv[i], g = world.ground(p[0], p[2]);
        if (g === null || g === undefined || p[1] >= g) continue;
        const pen = Math.min(0.6, g - p[1]); grounded++;
        // the ground's normal (a beach is a slope, not a floor), the push along it, and friction across it: hull on sand or rock
        const gx = world.ground(p[0] + 0.5, p[2]) - world.ground(p[0] - 0.5, p[2]), gz = world.ground(p[0], p[2] + 0.5) - world.ground(p[0], p[2] - 0.5);
        let n = [-gx, 1, -gz]; const nl = Math.hypot(n[0], n[1], n[2]); n = [n[0] / nl, n[1] / nl, n[2] / nl];
        const v = velAt(p), vn = dot(v, n);
        const N = Math.max(0, this.m * 1600 / nV * pen - this.m * 40 / nV * vn);
        const vt = [v[0] - n[0] * vn, v[1] - n[1] * vn, v[2] - n[2] * vn], vtm = Math.hypot(vt[0], vt[1], vt[2]);
        const fr = vtm > 0.01 ? Math.min(N * 0.65, vtm * this.m * 30 / nV) / vtm : 0;
        addF([n[0] * N - vt[0] * fr, n[1] * N - vt[1] * fr, n[2] * N - vt[2] * fr], p);
      }
    }
    if (grounded && !this.grounded && Math.abs(vf) > 3) ev.push({ type: "ground", speed: Math.abs(vf) });
    this.grounded = grounded;

    // ---- integrate -------------------------------------------------------------------------------------------------------------------
    const ia = 1 / this.m;
    this.vel[0] += F[0] * ia * h; this.vel[1] += F[1] * ia * h; this.vel[2] += F[2] * ia * h;
    // angular: torque into the body frame, through the inertia, back out
    const Tb = mtv(R, T), wb = mtv(R, this.w);
    const Iw = [this.Ib[0] * wb[0], this.Ib[1] * wb[1], this.Ib[2] * wb[2]];
    const gyro = cross(wb, Iw);
    for (let k = 0; k < 3; k++) wb[k] += (Tb[k] - gyro[k]) / this.Ib[k] * h;
    // a little extra damping on roll and pitch (the water that sloshes round a real hull), more when it is in the water
    const dampW = wetV ? 1 : 0.15;
    wb[0] *= 1 - 0.6 * h * dampW; wb[2] *= 1 - 0.9 * h * dampW; wb[1] *= 1 - 0.5 * h * dampW;
    this.w = mv(R, wb);
    for (let k = 0; k < 3; k++) this.pos[k] += this.vel[k] * h;
    const dq = qmul([this.w[0] * h * 0.5, this.w[1] * h * 0.5, this.w[2] * h * 0.5, 0], this.quat);
    this.quat = qnorm([this.quat[0] + dq[0], this.quat[1] + dq[1], this.quat[2] + dq[2], this.quat[3] + dq[3]]);
    qmat(this.quat, R);

    // walls: the gunwale's outline against the host's solids
    if (world.solid) {
      for (let i = 0; i < hull.outline.length; i++) {
        const p = this.toWorld(hull.outline[i]);
        if (!world.solid(p[0], p[2], p[1])) continue;
        // which way is out: probe round the point
        let nx = 0, nz = 0;
        for (let a = 0; a < 8; a++) { const ax = Math.cos(a * Math.PI / 4), az = Math.sin(a * Math.PI / 4); if (!world.solid(p[0] + ax * 0.8, p[2] + az * 0.8, p[1])) { nx += ax; nz += az; } }
        let nl = Math.hypot(nx, nz);
        if (nl < 1e-3) { nx = this.pos[0] - p[0]; nz = this.pos[2] - p[2]; nl = Math.hypot(nx, nz) || 1; }
        nx /= nl; nz /= nl;
        const v = velAt(p), vn = v[0] * nx + v[2] * nz;
        if (vn < 0) {
          const j = -1.25 * vn;
          this.vel[0] += nx * j; this.vel[2] += nz * j;
          // the knock turns it a little about the point that hit
          const r = [p[0] - this.pos[0], 0, p[2] - this.pos[2]];
          const tq = cross(r, [nx * j * this.m, 0, nz * j * this.m]);
          this.w[1] += tq[1] / (this.Ib[1] * 2);
          if (-vn > 1.2) ev.push({ type: "hit", speed: -vn, x: p[0], y: p[1], z: p[2] });
        }
        this.pos[0] += nx * 0.04; this.pos[2] += nz * 0.04;
        break;
      }
    }

    // ---- what the host shows -------------------------------------------------------------------------------------------------------
    const wetF = bottomWet / (sp.L * sp.B * 0.8);
    const wasPlaning = this.planing;
    this.planing = vf > Math.sqrt(G * sp.L) * 0.9 && lift > this.m * G * 0.25 && wetF < 0.75;
    if (this.planing && !wasPlaning) ev.push({ type: "plane" });
    const upY = this.up()[1];
    this.capsized = upY < 0.15 ? this.capsized + h : 0;
    const vertDrop = -this.vel[1];
    if (this.air === 0 && this._wasAir > 0.25 && vertDrop > 2.5) ev.push({ type: "slam", speed: vertDrop });
    this._wasAir = this.air || this._wasAir * 0;
    if (this.air > 0) this._wasAir = this.air;
    const load = clamp(Math.abs(this.throttleNow), 0, 1);
    const rpmTarget = 750 + (sp.drive === "inboard" ? 2600 : 5400) * (load * (0.45 + 0.55 * clamp(vf / sp.top, 0, 1)) + this.vent * load * 0.5);
    this.rpm += (Math.min(rpmTarget, sp.drive === "inboard" ? 3600 : 6600) - this.rpm) * Math.min(1, h * 4);
    this.draft = vol > 0 ? vol / Math.max(0.1, sp.L * sp.B * 0.7) : 0;
  }

  // the bits a HUD or a test wants
  telemetry() {
    return {
      kind: this.kind, speed: this.speed, knots: this.speed * 1.9438, trim: this.trim * 180 / Math.PI, heel: this.heel * 180 / Math.PI,
      planing: this.planing, rpm: Math.round(this.rpm), thrust: Math.round(this.thrust), vent: this.vent, wet: this.wet, lift: this.lift,
      displacement: this.subVol * RHO, air: this.air, grounded: this.grounded, capsized: this.capsized, y: this.pos[1]
    };
  }
}
