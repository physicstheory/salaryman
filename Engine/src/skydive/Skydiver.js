// A skydiver and the canopy on his back, as one flight model from the moment he leaves the roof or the aircraft door
// to the moment his feet (or the rest of him) meet the ground.
//
// FREEFALL. The body is a lifting surface. Its attitude (how far nose-down it is pitched, theta) against the direction it
// is moving through the air (flight path angle gamma) gives the angle of attack alpha = -theta - gamma. Drag area runs
// from about 0.2 m^2 edge-on (head down) to 0.48 m^2 belly-flat in a box arch and 0.68 m^2 spread out; lift area is
// 0.36 sin(2 alpha) m^2, so a body pitched nose-down 30 to 45 degrees "tracks" forward at about one metre across for
// every metre down. Terminal speeds come out of that, not out of a table: about 195 km/h in the box, 165 spread,
// 290 head down. Air density falls with height (ISA). Off a building, he leaves upright and the airflow turns him belly
// to earth as it builds over the first two or three seconds; until it has, his arms have little to push on.
//
// DEPLOYMENT. The pilot chute is thrown, inflates in the airflow and drags the bag off his back; the lines pay out to
// line stretch; then the canopy fills from the centre outward over a fill distance (about 30 m of travel with a slider,
// 11 m for a slider-off BASE rig), so it opens fast when you are fast and slowly when you are slow. Its drag area grows
// as it fills, and the opening shock (3 to 5 g at terminal) is just that drag. Deploying unstable (spinning, head down,
// rolled) gives line twists and an off-heading opening; off a building that can point you back at the wall.
//
// CANOPY. A ram-air wing flown as a point mass with lift, drag and bank. Toggles pull the trailing edge down: together
// they raise lift and drag (slower, flatter, and when pulled quickly, a flare that trades speed for a second or two of
// almost no sink); one side banks the wing into a turn that costs height, more the harder you pull; front risers lower
// the angle of attack (faster, steeper). Held fully down for long at low speed it stalls. The jumper swings under it as
// a pendulum on about seven metres of line.
//
// The world is passed in: ground(x, z, yRef) gives the surface under a point (roofs included), wall(x, y, z, r) says
// whether a point is inside a building ({ nx, nz } outward normal, or null), wind is a WindField. Pure maths, no three.js.

import { WindField } from "./Wind.js";

const G = 9.81;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const airDensity = h => 1.225 * Math.exp(-Math.max(0, h) / 8500);

export const CANOPY_SPECS = {
  // a 230 sq ft nine-cell sport canopy with a slider: about 44 km/h forward and 4.3 m/s down at trim, glide 2.8
  sport: { name: "Sport 230", area: 21.4, span: 7.6, chord: 2.8, cells: 9, lines: 6.6, cl: 0.42, cd: 0.152, slider: true, fill: 150, maxBank: 0.8, pc: 0.62 },
  // a 280 sq ft seven-cell BASE canopy, slider off: bigger, slower (38 km/h, 3.8 m/s down), opens in a few metres
  base:  { name: "BASE 280", area: 26.0, span: 8.0, chord: 3.3, cells: 7, lines: 7.0, cl: 0.45, cd: 0.17, slider: false, fill: 20, maxBank: 0.74, pc: 1.05 }
};

const BODY = { cdaEdge: 0.2, cdaBox: 0.48, cdaSpread: 0.68, cdaDive: 0.205, cla: 0.36, cdaUpright: 0.3, side: 0.55 };

export class Skydiver {
  constructor(o = {}) {
    this.mass = o.mass || 88;                 // man, suit and rig
    this.spec = CANOPY_SPECS[o.canopy || "base"] || CANOPY_SPECS.base;
    this.wind = o.wind || new WindField();
    this.ground = o.ground || (() => 0);
    this.wall = o.wall || null;
    this.rand = o.random || Math.random;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.phase = "idle";
    this.t = 0;
  }
  setCanopy(name) { this.spec = CANOPY_SPECS[name] || this.spec; }

  // Off a roof (from: "building") or out of an aircraft (from: "aircraft"). vel is his velocity as he leaves.
  exit(o) {
    Object.assign(this.pos, o.pos); Object.assign(this.vel, o.vel || { x: 0, y: 0, z: 0 });
    this.yaw = o.yaw || 0; this.yawRate = 0;
    this.theta = 0; this.alpha = 1.5; this.alphaV = 0;                          // attitude: angle of attack, and pitch for drawing
    this.upright = o.from === "aircraft" ? 0.35 : 1;                        // 1 = standing up; the airflow lays him flat
    this.roll = 0; this.tumble = 0;
    this.phase = "freefall"; this.t = 0; this.ffTime = 0; this.exitFrom = o.from;
    this.deployT = 0; this.pcOut = 0; this.linesOut = 0; this.fill = 0; this.slider = this.spec.slider ? 1 : 0;
    this.bank = 0; this.bankV = 0; this.swingP = 0; this.swingPV = 0; this.twists = 0; this.twistDir = 1;
    this.bL = 0; this.bR = 0; this.riser = 0; this.clDyn = this.spec.cl; this.stallT = 0; this.stalled = false; this.deepT = 0;
    this.gload = 1; this.maxG = 1; this.offHeading = 0; this.collapsed = false;
    this.landed = null; this.events = [];
    this.lastAir = { x: 0, y: 0, z: 0 };
    return this;
  }

  get airspeed() { return Math.hypot(this.vel.x - this.lastAir.x, this.vel.y - this.lastAir.y, this.vel.z - this.lastAir.z); }
  get altitude() { return this.pos.y - this.ground(this.pos.x, this.pos.z, this.pos.y); }

  // in: { pitch -1..1 (forward = track / dive), turn -1..1 (right +), dive (head-down button), deploy (true on the frame it is pressed),
  //       brakeL, brakeR 0..1, risers 0..1 }
  step(dt, inp = {}) {
    const ev = this.events = [];
    if (this.phase === "idle" || this.phase === "landed") return ev;
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n && this.phase !== "landed"; i++) this.sub(h, inp, ev, i === 0);
    return ev;
  }

  sub(dt, inp, ev, first) {
    this.t += dt;
    const p = this.pos, v = this.vel;
    const gy = this.ground(p.x, p.z, p.y + 0.5);
    const w = this.wind.sample(p.x, p.y, p.z, this.t + (this.wind.t0 || 0), gy);
    this.lastAir.x = w.x; this.lastAir.y = w.y; this.lastAir.z = w.z;
    const ax0 = v.x - w.x, ay0 = v.y - w.y, az0 = v.z - w.z;   // velocity through the air
    const V = Math.hypot(ax0, ay0, az0) || 1e-6, rho = airDensity(p.y), q = 0.5 * rho * V * V;
    let fx = 0, fy = -this.mass * G, fz = 0;

    if (this.phase === "freefall") {
      this.ffTime += dt;
      if (inp.deploy && first) this.startDeploy(ev);
      const F = this.bodyForces(dt, inp, ax0, ay0, az0, V, q);
      fx += F.x; fy += F.y; fz += F.z;
    } else if (this.phase === "deploy") {
      // the body keeps flying (badly: his hand is behind him) while the system pays out
      const F = this.bodyForces(dt, { pitch: 0, turn: 0 }, ax0, ay0, az0, V, q);
      fx += F.x; fy += F.y; fz += F.z;
      this.deployT += dt;
      if (this.deployT > 0.32) this.pcOut = Math.min(1, this.pcOut + dt * Math.max(0.6, V / 9));         // the pilot chute catches air
      const pcDrag = 0.5 * rho * V * V * this.spec.pc * this.pcOut;
      if (pcDrag > 45) this.linesOut += dt * clamp(V * 0.7, 4, 24) / (this.spec.lines + 1.2);         // bag off, lines unstowing
      if (this.linesOut >= 1 && this.fill === 0) {
        this.fill = 0.001;
        // line stretch: how cleanly it comes off depends on how stable he was
        const unstable = Math.max(this.pullInstab || 0, Math.abs(this.yawRate) * 0.5 + Math.max(0, this.theta - 0.75) * 0.9 + Math.abs(this.roll) * 0.6 + (V > 68 ? 0.4 : 0) + this.upright * 0.25);
        this.offHeading = (this.rand() + this.rand() + this.rand() - 1.5) * (0.22 + unstable * 0.9);
        if (this.exitFrom === "building" && unstable < 0.6) this.offHeading = clamp(this.offHeading, -0.35, 0.35);   // a clean BASE pull opens near heading
        if (unstable > 0.75 && this.rand() < unstable * 0.7) { this.twists = 1 + Math.floor(this.rand() * (1 + unstable * 2)); this.twistDir = this.rand() < 0.5 ? -1 : 1; }
        this.canopyYaw = this.yaw + this.offHeading;
        ev.push({ type: "linestretch", offHeading: this.offHeading, twists: this.twists });
      }
      if (this.fill > 0) {
        // it fills as air rams into the cells: a fixed distance of travel, so the time depends on speed
        this.fill = Math.min(1, this.fill + dt * Math.max(V, 4) / this.spec.fill);
        const e = smooth(this.fill);
        // with a slider, the canopy snivels: held half-open while the slider fights its way down the lines, which is what
        // spreads the opening over a few seconds and keeps it to about 4 g; slider off, it bangs open
        const frac = this.spec.slider ? (this.fill < 0.55 ? 0.085 * smooth(this.fill / 0.55) : 0.085 + 0.915 * Math.pow(smooth((this.fill - 0.55) / 0.45), 1.6)) : Math.pow(e, 1.6);
        this.slider = this.spec.slider ? 1 - smooth((this.fill - 0.35) / 0.65) : 0;
        const cda = this.spec.area * 1.25 * frac;
        const k = q * cda / V;
        fx -= k * ax0; fy -= k * ay0; fz -= k * az0;
        if (this.fill >= 1) {
          this.phase = "canopy"; this.slider = 0; this.clDyn = this.spec.cl * 0.8;
          ev.push({ type: "open", g: this.maxG, twists: this.twists, offHeading: this.offHeading });
        }
      }
    } else if (this.phase === "canopy") {
      const F = this.canopyForces(dt, inp, ax0, ay0, az0, V, q, ev);
      fx += F.x; fy += F.y; fz += F.z;
    } else if (this.phase === "collapsed") {
      const k = q * 3.2 / V; fx -= k * ax0; fy -= k * ay0; fz -= k * az0;
    }

    const axx = fx / this.mass, ayy = fy / this.mass, azz = fz / this.mass;
    this.gload = Math.hypot(axx, ayy + G, azz) / G;
    if (this.phase === "deploy" || (this.phase === "canopy" && this.t < 4)) this.maxG = Math.max(this.maxG, this.gload);
    v.x += axx * dt; v.y += ayy * dt; v.z += azz * dt;
    const nx = p.x + v.x * dt, ny = p.y + v.y * dt, nz = p.z + v.z * dt;

    // buildings: the body, and (under canopy) the wing above him
    if (this.wall) {
      const hit = this.wall(nx, ny, nz, 0.45) || (this.phase === "canopy" ? this.wall(nx, ny + this.spec.lines * 0.85, nz, this.spec.span * 0.35) : null);
      if (hit) {
        const into = -(v.x * hit.nx + v.z * hit.nz);
        if (into > 0) {
          const where = this.wall(nx, ny, nz, 0.45) ? "body" : "canopy";
          ev.push({ type: "wall", speed: Math.hypot(v.x, v.y, v.z), into: into, normal: { x: hit.nx, z: hit.nz }, phase: this.phase, part: where });
          // stop the motion into the wall; the caller decides whether that is a ragdoll or a canopy wrap
          v.x += hit.nx * into * 1.1; v.z += hit.nz * into * 1.1;
          if (this.phase === "canopy" && where === "canopy" && into > 2.2) { this.phase = "collapsed"; ev.push({ type: "collapse" }); }
          return;
        }
      }
    }
    p.x = nx; p.y = ny; p.z = nz;

    // the ground (or a roof)
    const g2 = this.ground(p.x, p.z, p.y + 1.2);
    if (p.y <= g2) {
      p.y = g2;
      const sink = -v.y, hz = Math.hypot(v.x, v.z), spd = Math.hypot(v.x, v.y, v.z);
      let quality;
      if (this.phase !== "canopy") quality = spd > 30 ? "fatal" : spd > 11 ? "impact" : spd > 6 ? "hard" : "good";
      else if (sink <= 2.6 && hz <= 5.5) quality = "perfect";
      else if (sink <= 4.2 && hz <= 8) quality = "good";
      else if (sink <= 6.5 && hz <= 10.5) quality = "hard";
      else quality = sink > 14 ? "fatal" : "crash";
      this.landed = { quality, sink, across: hz, speed: spd, phase: this.phase, vel: { x: v.x, y: v.y, z: v.z } };
      this.phase = "landed";
      ev.push(Object.assign({ type: "land" }, this.landed));
    }
  }

  startDeploy(ev) {
    if (this.phase !== "freefall") return false;
    // how stable he was when he pulled: what the lines come off in
    const V0 = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    this.pullInstab = Math.abs(this.yawRate) * 0.5 + Math.max(0, this.theta - 0.75) * 0.9 + Math.abs(this.roll) * 0.6 + (V0 > 68 ? 0.4 : 0) + this.upright * 0.25;
    this.phase = "deploy"; this.deployT = 0; this.pcOut = 0; this.linesOut = 0; this.fill = 0; this.maxG = 1;
    ev.push({ type: "deploy", speed: Math.hypot(this.vel.x, this.vel.y, this.vel.z), alt: this.altitude });
    return true;
  }
  deploy() { return this.startDeploy(this.events); }

  // the body as a lifting surface (freefall, and while the canopy is coming out)
  bodyForces(dt, inp, ax, ay, az, V, q) {
    // the airflow lays him belly to earth, faster the harder it blows
    this.upright = Math.max(0, this.upright - dt * this.upright * (0.25 + q / 520) - dt * 0.02);
    const auth = (1 - this.upright) * clamp(q / 900, 0.12, 1.15);                 // how much his arms and legs can do
    const pitch = clamp(inp.pitch || 0, -1, 1), turn = clamp(inp.turn || 0, -1, 1);
    const spread = Math.max(-pitch, 0), fwd = Math.max(pitch, 0);
    // A skydiver flies relative to the airflow, not to the horizon: the arch keeps the belly square to the relative wind
    // (angle of attack ~88 deg) however he is moving; tracking presents the body at about 35 deg; head down, almost edge-on.
    // The body weathercocks to that attitude with a stiffness that grows with dynamic pressure.
    const aT = inp.dive ? 0.12 : lerp(1.54, 0.6, fwd) + 0.05 * spread;
    const wn = 1.1 + 3.6 * clamp(q / 1800, 0, 1) * (1 - this.upright * 0.8);
    if (this.alpha === undefined) this.alpha = 1.5;
    this.alphaV = (this.alphaV || 0) + (wn * wn * (aT - this.alpha) - 2 * 0.7 * wn * (this.alphaV || 0)) * dt;
    this.alpha = clamp(this.alpha + this.alphaV * dt, 0.02, 1.75);
    // turning: arms and shoulders, more bite at speed; a carving turn in a track rolls the body
    const yrT = -turn * (1.55 + fwd * 0.4) * clamp(auth, 0, 1.1);
    this.yawRate += (yrT - this.yawRate) * (1 - Math.exp(-dt * (1.8 + 3 * auth)));
    this.yaw = wrap(this.yaw + this.yawRate * dt);
    this.roll += ((turn * (0.3 + fwd * 0.5)) - this.roll) * (1 - Math.exp(-dt * 4));

    // aerodynamics in the plane of his heading
    const hx = Math.sin(this.yaw), hz = Math.cos(this.yaw);
    const along = ax * hx + az * hz, sx = ax - along * hx, sz = az - along * hz;      // sideslip is what is left over
    const gam = Math.atan2(ay, along);                                                 // flight path angle (negative falling)
    const alpha = this.alpha;
    this.theta = -alpha - gam;                                                         // his pitch against the horizon, for drawing
    const s2 = Math.sin(alpha) ** 2;
    const flat = lerp(BODY.cdaBox, BODY.cdaSpread, spread);
    const edge = lerp(BODY.cdaEdge, BODY.cdaDive, inp.dive ? 1 : 0);
    let cda = edge + (flat - edge) * s2, cla = BODY.cla * Math.sin(2 * alpha) * (1 - spread * 0.5);
    cda = lerp(cda, BODY.cdaUpright, this.upright); cla *= 1 - this.upright;
    // the tumble at very low speed off a roof: arms windmilling, a little random lift either way
    const Vp = Math.hypot(along, ay) || 1e-6;
    const dk = q * cda / V, lk = q * cla / Vp;
    // lift is perpendicular to the in-plane airflow, toward his back-to-belly normal
    const lh = -Math.sin(gam), lv = Math.cos(gam);
    return {
      x: -dk * ax + lk * Vp * lh * hx - q * BODY.side * (sx / V) * 0.5,
      y: -dk * ay + lk * Vp * lv,
      z: -dk * az + lk * Vp * lh * hz - q * BODY.side * (sz / V) * 0.5
    };
  }

  // the canopy as a wing
  canopyForces(dt, inp, ax, ay, az, V, q, ev) {
    const S = this.spec;
    // hands move the toggles at about four lengths a second
    const rate = 4.2 * dt, toward = (a, b) => a + clamp(b - a, -rate, rate);
    let bl = clamp(inp.brakeL || 0, 0, 1), br = clamp(inp.brakeR || 0, 0, 1), rs = clamp(inp.risers || 0, 0, 1);
    if (this.twists > 0) {
      // twisted lines: the toggles are out of reach until he kicks out of it; the wing turns as the lines unwind
      bl = br = 0; rs = 0;
      this.twists = Math.max(0, this.twists - dt * 0.85);
      if (this.twists === 0) ev.push({ type: "untwisted" });
    }
    this.bL = toward(this.bL, bl); this.bR = toward(this.bR, br); this.riser = toward(this.riser, rs);
    const sym = (this.bL + this.bR) / 2, asym = this.bR - this.bL;
    // lift and drag at this trim: the trailing edge coming down adds both; front risers take some off
    let clT = S.cl + 0.6 * sym * sym + 0.12 * sym - 0.11 * this.riser;
    let cd = S.cd + 0.34 * sym * sym + 0.06 * Math.abs(asym) + 0.02 * this.riser;
    // a stall: deep brakes, held, slow
    if (sym > 0.9 && V < 9.5) this.deepT += dt; else this.deepT = Math.max(0, this.deepT - dt * 2);
    if (!this.stalled && this.deepT > 2.0) { this.stalled = true; this.stallT = 0; ev.push({ type: "stall" }); }
    if (this.stalled) { this.stallT += dt; clT = 0.22; cd = 0.95; if (sym < 0.55 && this.stallT > 0.6) { this.stalled = false; this.deepT = 0; ev.push({ type: "recovered" }); } }
    // the wing changes its angle of attack in about a tenth of a second, so a quick pull is a burst of lift (the flare)
    this.clDyn += (clT - this.clDyn) * (1 - Math.exp(-dt / (clT > this.clDyn ? 0.12 : 0.35)));
    const cl = this.clDyn;
    // bank: one toggle swings him out under the wing like a pendulum, more at speed and with risers
    const bankT = this.twists > 0 ? this.twistDir * 0.35 : clamp(asym * S.maxBank * clamp(V / 10.5, 0.45, 1.1) * (1 + 0.4 * this.riser), -1.2, 1.2);
    const wn = 1.5, zeta = 0.5;
    this.bankV += (wn * wn * (bankT - this.bank) - 2 * zeta * wn * this.bankV) * dt;
    this.bank += this.bankV * dt;
    // directions: along the airflow, the wing's right, and lift (perpendicular to the airflow, tilted by the bank)
    const vx = ax / V, vy = ay / V, vz = az / V;
    // the wing turns the way its bank points it (a coordinated turn: rate = lift's sideways part / momentum); twisted lines spin it
    const Vh = Math.hypot(ax, az), Lmag = q * S.area * cl;
    if (this.twists > 0) this.canopyYaw = wrap(this.canopyYaw + this.twistDir * 1.6 * dt);
    else this.canopyYaw = wrap(this.canopyYaw - (Lmag * Math.sin(this.bank) / (this.mass * Math.max(Vh, 4))) * dt);
    this.yaw = this.canopyYaw;
    // the wing points where it points; the air it flies through comes from in front of it. Any sideways airflow
    // (just after an off-heading opening, in a twist) is turned into its heading as a weathercock would.
    const rx = -Math.cos(this.canopyYaw), rz = Math.sin(this.canopyYaw);
    const rdv = rx * vx + rz * vz;
    let px = rx - rdv * vx, py = -rdv * vy, pz = rz - rdv * vz; const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
    // lift0 = right x v (up for level flight), then tilted toward the right by the bank
    let l0x = py * vz - pz * vy, l0y = pz * vx - px * vz, l0z = px * vy - py * vx;
    if (l0y < 0) { l0x = -l0x; l0y = -l0y; l0z = -l0z; }
    const cb = Math.cos(this.bank), sb = Math.sin(this.bank);
    const lx = cb * l0x + sb * px, ly = cb * l0y + sb * py, lz = cb * l0z + sb * pz;
    const L = Lmag, D = q * S.area * cd + q * 0.45;                         // the jumper's own drag, and the lines'
    // sideways air through the canopy: a strong weathercock force bringing the flight path round to the heading
    const hx = Math.sin(this.canopyYaw), hzz = Math.cos(this.canopyYaw);
    const side = (ax * hzz - az * hx), sideF = -q * 2.2 * side / V;
    // the jumper swings fore and aft under it: back when it surges, forward when it brakes
    const along = ax * hx + az * hzz;
    const accel = (along - (this.prevAlong === undefined ? along : this.prevAlong)) / Math.max(dt, 1e-4); this.prevAlong = along;
    const Lp = S.lines;
    this.swingPV += ((-G / Lp) * this.swingP - 1.4 * this.swingPV - clamp(accel, -25, 25) / Lp) * dt;
    this.swingP = clamp(this.swingP + this.swingPV * dt, -1.1, 1.1);
    return {
      x: L * lx - D * vx + sideF * hzz,
      y: L * ly - D * vy,
      z: L * lz - D * vz - sideF * hx
    };
  }

  // a snapshot for the HUD and for drawing
  state() {
    const v = this.vel;
    return {
      phase: this.phase, t: this.t, alt: this.altitude, pos: this.pos, vel: v,
      speed: Math.hypot(v.x, v.y, v.z), sink: -v.y, ground: Math.hypot(v.x, v.z), airspeed: this.airspeed,
      yaw: this.yaw, theta: this.theta, roll: this.roll, upright: this.upright,
      fill: this.fill, pcOut: this.pcOut, linesOut: this.linesOut, bank: this.bank, swing: this.swingP,
      brakeL: this.bL, brakeR: this.bR, risers: this.riser, twists: this.twists, stalled: this.stalled,
      g: this.gload, maxG: this.maxG, wind: this.lastAir
    };
  }
}
