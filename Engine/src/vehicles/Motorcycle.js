// Shigoto: motorcycle and bicycle dynamics.
//
// One rigid body in the bike's own vertical plane (forward, up, pitch) standing on two sprung wheels, and a single-track model in the ground
// plane (lateral velocity, yaw, lean) on top of it. Nothing below is scripted: a wheelie, a stoppie, a loop-out, a jump and a bad landing all
// come out of the same forces.
//
//   - Suspension: each wheel hangs from the chassis on a spring and damper with preload, a fixed travel and a bump stop. The wheel's contact
//     force acts along the ground normal at that wheel, so a kicker takes speed away as it lifts the bike and throws it when the ground falls
//     away under it. Normal loads, and so grip, come from the springs, not from a formula.
//   - Tyres: Pacejka "magic formula" curves for slip ratio and slip angle, camber thrust from lean, both inside a friction ellipse. Grip is the
//     surface (tarmac, dirt, grass, wet) times the tyre (road rubber or knobblies).
//   - Engine: a torque curve, a flywheel, a clutch that can slip, and a gearbox that shifts itself with a short torque cut. A bicycle's engine is
//     its rider: power-limited, force-limited at a standstill.
//   - Wheelie: drive force at the rear contact patch below the centre of mass pitches the bike up. It is held at the balance point, where the
//     centre of mass sits over the rear contact patch (atan(b / h) from level), and past it gravity helps it over. The rear brake brings the nose
//     down, which is how it is done on a real bike, and so does shifting your weight forward or closing the throttle. Loop it past saving and
//     the rider comes off the back.
//   - Stoppie: the same in reverse about the front contact patch; ABS on the road bikes keeps the front from locking, the dirt bike has none.
//   - Lean: the rider counter-steers to reach the lean he wants, the lean decides the turn (tan(lean) = v * yawRate / g), and the tyres decide
//     whether the turn is possible. Ask the front for more than it has and it tucks (lowside); slide the rear and let it grip again leaned over
//     and it throws you over the top (highside).
//   - Air: no contact, so the bike keeps its pitch rate, but the wheels are gyroscopes: throttle spins the rear wheel up and lifts the nose,
//     the rear brake stops it and drops the nose. The rider can also move his body to pitch it a little.
//
// The host supplies the ground (height at any point, given the height it is asking from, for decks over roads), the grip there, and its own
// crash handling. Units are SI; yaw follows the game's convention (forward is (sin yaw, cos yaw), steering right makes yaw smaller).

const G = 9.81, RHO = 1.2;

// Real numbers, roughly a 600 supersport, a 125 scooter, a 1700 cruiser, a sport tourer, a 450 motocrosser and a trail mountain bike.
// mass: bike, kg (wet); rider: kg; wb: wheelbase; b: centre of mass ahead of the rear axle, with rider; h: its height; rr/rf: wheel radii;
// kP: pitch radius of gyration; susF/susR: [rate N/m at the wheel, travel m, sag fraction, damping ratio]; mu: tyre peak on tarmac;
// muDirt: tyre peak on dirt; lean: the lean at which hard parts touch down; red: redline rpm; gears: count; spread: first/top ratio;
// cda: drag area (upright, tucked); abs: anti-lock front; bottom: bump-stop speed the rider survives, m/s; leanRate: rider's lean bandwidth;
// shift: rider's fore/aft weight shift range (m of CoM travel); airTorque: body english in the air, N m.
export const BIKE_SPECS = {
  sport:   { mass: 190, rider: 78, wb: 1.40, b: 0.66, h: 0.72, rr: 0.315, rf: 0.300, kP: 0.45, susF: [20000, 0.120, 0.33, 0.38], susR: [24000, 0.130, 0.30, 0.40],
             mu: 1.15, muDirt: 0.55, lean: 0.96, red: 14000, gears: 6, spread: 2.75, cda: [0.42, 0.30], abs: true, bottom: 3.4, leanRate: 6.0, shift: 0.05, airTorque: 60 },
  scooter: { mass: 125, rider: 75, wb: 1.30, b: 0.56, h: 0.68, rr: 0.240, rf: 0.250, kP: 0.42, susF: [14000, 0.090, 0.35, 0.40], susR: [17000, 0.080, 0.33, 0.40],
             mu: 1.00, muDirt: 0.50, lean: 0.70, red: 8500, gears: 0, spread: 1, cda: [0.50, 0.50], abs: true, bottom: 2.6, leanRate: 6.5, shift: 0.04, airTorque: 40 },
  cruiser: { mass: 310, rider: 80, wb: 1.66, b: 0.80, h: 0.62, rr: 0.330, rf: 0.330, kP: 0.50, susF: [22000, 0.120, 0.32, 0.38], susR: [34000, 0.090, 0.30, 0.40],
             mu: 1.05, muDirt: 0.55, lean: 0.56, red: 6000, gears: 6, spread: 2.2, cda: [0.62, 0.62], abs: true, bottom: 3.0, leanRate: 3.6, shift: 0.03, airTorque: 60 },
  tourer:  { mass: 300, rider: 80, wb: 1.55, b: 0.74, h: 0.74, rr: 0.330, rf: 0.310, kP: 0.50, susF: [24000, 0.130, 0.32, 0.38], susR: [30000, 0.130, 0.30, 0.40],
             mu: 1.10, muDirt: 0.55, lean: 0.70, red: 9500, gears: 6, spread: 2.6, cda: [0.55, 0.48], abs: true, bottom: 3.2, leanRate: 4.2, shift: 0.03, airTorque: 60 },
  dirt:    { mass: 112, rider: 78, wb: 1.48, b: 0.70, h: 0.86, rr: 0.355, rf: 0.370, kP: 0.44, susF: [9500, 0.310, 0.30, 0.42], susR: [11500, 0.315, 0.33, 0.45],
             mu: 0.92, muDirt: 0.86, lean: 0.88, red: 11500, gears: 5, spread: 3.0, cda: [0.56, 0.52], abs: false, bottom: 8.0, leanRate: 6.8, shift: 0.07, airTorque: 55 },
  mtb:     { mass: 15, rider: 82, wb: 1.22, b: 0.52, h: 1.02, rr: 0.370, rf: 0.370, kP: 0.40, susF: [6500, 0.160, 0.25, 0.45], susR: [7500, 0.150, 0.30, 0.48],
             mu: 1.00, muDirt: 0.88, lean: 0.92, red: 0, gears: 0, spread: 1, cda: [0.48, 0.42], abs: false, bottom: 4.6, leanRate: 7.5, shift: 0.38, airTorque: 45, pedal: { power: 1100, force: 700 } }
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sgn = v => (v < 0 ? -1 : 1);

// magic formula: x is slip (ratio or angle), returns the fraction of peak force
function pacejka(x, B, C, E) {
  const bx = B * x;
  return Math.sin(C * Math.atan(bx - E * (bx - Math.atan(bx))));
}
// tyre families: [B, C, E] for slip ratio and for slip angle
const TYRE = {
  road: { lon: [11, 1.9, 0.95], lat: [12, 1.35, -0.6], camber: 0.86 },
  knobbly: { lon: [7, 1.6, 0.6], lat: [8, 1.25, -0.4], camber: 0.72 }
};

export class Motorcycle {
  // spec: a BIKE_SPECS entry (or a name); opts.top: top speed in m/s the gearing and power are fitted to
  constructor(spec, opts = {}) {
    this.spec = typeof spec === "string" ? BIKE_SPECS[spec] : spec;
    if (!this.spec) throw new Error("Motorcycle: unknown spec " + spec);
    const S = this.spec;
    this.knobbly = !!opts.knobbly || S === BIKE_SPECS.dirt || S === BIKE_SPECS.mtb;
    this.tyre = this.knobbly ? TYRE.knobbly : TYRE.road;
    this.m = S.mass + S.rider;
    this.Ip = this.m * S.kP * S.kP;
    this.Iz = this.m * 0.36 * 0.36;
    this.Iw = [0.55 * (S.mass / 190) + 0.25, 0.45 * (S.mass / 190) + 0.2];       // rear, front, kg m^2
    if (S.pedal) this.Iw = [0.12, 0.11];
    this.fit(opts.top || 40, opts.to100);
    // suspension preload so the static sag is what the spec says
    const Nf = this.m * G * S.b / S.wb, Nr = this.m * G - Nf;
    this.Nf0 = Nf;
    this.sus = [S.susR, S.susF].map((p, i) => {
      const [k, travel, sag, zeta] = p, N = i === 0 ? Nr : Nf, mc = N / G;
      return { k: k, travel: travel, pre: Math.max(0, N / k - sag * travel), c: 2 * zeta * Math.sqrt(k * mc) };
    });
    this.events = [];
    this.reset({ x: 0, y: 0, z: 0, yaw: 0, speed: 0 });
  }

  // gearing and power for a given top speed: drag + rolling resistance at the top equals peak power at the peak-power rpm in top gear
  fit(top, to100) {
    const S = this.spec;
    this.top = top;
    const cda = S.cda[1], crr = 0.016;
    // the power it takes to hold the top speed against drag, or to make its 0-100 time if that takes more (a dirt bike is geared short and
    // tops out on the limiter long before the wind stops it)
    const Pdrag = (0.5 * RHO * cda * top * top * top + crr * this.m * G * top) / 0.92;
    const Pacc = to100 ? 0.5 * this.m * 27.78 * 27.78 / to100 * 1.55 : 0;
    const Preq = Math.max(Pdrag, Pacc);
    this.Ppeak = Preq;
    if (S.pedal) return;
    const red = S.red * Math.PI / 30, wPk = red * 0.88;
    this.red = red; this.idle = red * 0.12;
    this.Tpk = Preq / (wPk * this.torqueShape(0.88));
    // overall ratio in top gear: just past peak power at top speed if the wind sets it, on the limiter if the gearing does
    const wheelTop = top / S.rr, Gtop = (Pacc > Pdrag ? red * 0.985 : wPk * 1.02) / wheelTop;
    this.ratios = [];
    if (S.gears > 0) {
      const n = S.gears, q = Math.pow(S.spread, 1 / (n - 1));
      for (let i = 0; i < n; i++) this.ratios.push(Gtop * Math.pow(q, n - 1 - i));
    } else this.ratios.push(Gtop);                       // CVT: the ratio moves; this is its top
    this.Ie = { 6000: 0.08, 9500: 0.04, 14000: 0.025, 11500: 0.018, 8500: 0.012 }[S.red] || 0.03;    // crank, clutch basket and flywheel, kg m^2
  }
  // torque at a fraction of the redline, as a fraction of peak torque
  torqueShape(n) {
    const S = this.spec;
    if (S === BIKE_SPECS.cruiser) return clamp(0.78 + 0.6 * n - 0.55 * n * n, 0.5, 1);       // a big twin: flat and early
    if (S === BIKE_SPECS.dirt) return clamp(0.62 + 0.95 * n - 0.75 * n * n, 0.45, 1);
    return clamp(0.48 + 1.15 * n - 0.72 * n * n, 0.35, 1);                                   // a revvy four
  }

  // put the bike somewhere, upright, rolling at `speed`
  reset(p) {
    const S = this.spec;
    this.x = p.x; this.z = p.z; this.yaw = p.yaw || 0;
    this.u = p.speed || 0; this.vl = 0; this.r = 0;
    this.w = 0; this.q = 0; this.pitch = p.pitch || 0;
    this.lean = 0; this.leanRate = 0; this.steer = 0;
    this.shift = 0;
    // centre-of-mass height: ground + h with the static sag already in it
    this.y = (p.y || 0) + S.h;
    this.wheel = [this.u / S.rr, this.u / S.rf];
    this.s = [0, 0]; this.sv = [0, 0];
    this.N = [this.m * G * (1 - S.b / S.wb), this.m * G * S.b / S.wb];
    this.gear = 0; this.shiftT = 0; this.clutch = 1; this.popT = 0;
    this.we = this.spec.pedal ? 0 : Math.max(this.idle, this.wheel[0] * this.ratios[0]);
    this.air = false; this.airT = 0; this.contactT = 0;
    this.slip = [0, 0]; this.alpha = [0, 0]; this.slideT = 0; this.tuckT = 0; this.rearSlideMax = 0; this.highT = 0;
    this.bottomed = 0; this.crashed = null; this.groundPitch = 0; this.groundRoll = 0;
    this.thr = 0; this.fb = 0; this.rb = 0; this._thrPrev = 0; this.acc = 0;
    this._t = 0;
  }

  get speed() { return this.u; }
  get rpm() { return this.spec.pedal ? 0 : this.we * 30 / Math.PI; }
  // the angle from level at which the centre of mass is over the rear contact patch
  get balancePoint() { const S = this.spec; return Math.atan2(S.b + this.shift, S.h); }
  get stoppiePoint() { const S = this.spec; return Math.atan2(S.wb - S.b - this.shift, S.h); }
  get wheelie() { return !this.air && this.N[1] < 1 && this.pitch > 0.06; }
  get stoppie() { return !this.air && this.N[0] < 1 && this.pitch < -0.04; }

  // the body point (forward, up from the centre of mass) in world space, in the pitch plane: [forward offset, height]
  _bodyPt(xi, eta) {
    const c = Math.cos(this.pitch), s = Math.sin(this.pitch);
    return [xi * c - eta * s, this.y + xi * s + eta * c];
  }

  // where each axle sits at full extension, in body coordinates (centre of mass is the origin; rider shift moves the origin)
  _mount(i) {
    const S = this.spec, sus = this.sus[i];
    const xi = (i === 0 ? -S.b : S.wb - S.b) - this.shift;
    const r = i === 0 ? S.rr : S.rf;
    const eta = -(S.h - r) - (sus.travel * this._sagFrac(i));
    return [xi, eta];
  }
  _sagFrac(i) { const p = i === 0 ? this.spec.susR : this.spec.susF; return p[2]; }

  // input: { throttle 0..1, front 0..1, rear 0..1, steer -1..1 (right +), weight -1..1 (back -, forward +), clutchPop: bool }
  // world: { ground(x, z, refY) -> y, grip(x, z) -> { mu, dirt } }
  // returns events since the last call: { type: "crash", cause }, { type: "land", impact, air }, { type: "bottom", v }
  step(dt, input, world) {
    this.events.length = 0;
    if (this.crashed) return this.events;
    const h = 1 / 240;
    this._t += Math.min(dt, 0.1);
    while (this._t >= h && !this.crashed) { this._substep(h, input, world); this._t -= h; }
    return this.events;
  }

  _crash(cause, extra) {
    if (this.crashed) return;
    this.crashed = cause;
    this.events.push(Object.assign({ type: "crash", cause: cause, speed: this.u, pitch: this.pitch, lean: this.lean, pitchRate: this.q, leanRate: this.leanRate, vy: this.w }, extra || {}));
  }

  _substep(h, inp, world) {
    const S = this.spec, m = this.m;
    // ---- the rider's hands and body, which do not move instantly
    let thrT = clamp(inp.throttle || 0, 0, 1);
    // wheelie control (the road bikes' IMU, or a rider's instinct on the others): unless you are asking for the front to come up by pulling
    // back, the throttle is eased the moment it starts to lift
    // wheelie control (the road bikes' IMU, or a rider's instinct on the others): unless you are asking for the front to come up by pulling
    // back, the drive torque is held under what would lift the front (a * h < g * b), and eased off if it is already up
    this._assist = inp.assist !== false && (inp.weight || 0) > -0.25 && !this.air;
    this.thr += clamp(thrT - this.thr, -h * 9, h * 7);
    this.fb += clamp(clamp(inp.front || 0, 0, 1) - this.fb, -h * 10, h * 6);
    this.rb += clamp(clamp(inp.rear || 0, 0, 1) - this.rb, -h * 10, h * 8);
    const shiftT = -clamp(inp.weight || 0, -1, 1) * S.shift;        // back is a negative input and moves the CoM back (smaller b)
    const shift0 = this.shift;
    this.shift += clamp(-shiftT - this.shift, -h * S.shift * 5, h * S.shift * 5);
    this._shiftVel = (this.shift - shift0) / h;
    // a clutch pop: the clutch comes in for a moment so the engine spins up, then is dropped
    if (inp.clutchPop && this.popT <= 0 && !S.pedal && this.u < 16 && !this.air) this.popT = 0.22;
    if (this.popT > 0) this.popT -= h;

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -fz, rz = fx;     // forward, right
    const cp = Math.cos(this.pitch);

    // ---- ground and suspension at each wheel
    let contacts = 0;
    const F = [[0, 0], [0, 0]];                                     // contact forces on the chassis, [forward, up]
    const P = [[0, 0], [0, 0]];                                     // contact points relative to the CoM, [forward, up]
    let Ntot = 0;
    for (let i = 0; i < 2; i++) {
      const mt = this._mount(i), r = i === 0 ? S.rr : S.rf, sus = this.sus[i];
      const A = this._bodyPt(mt[0], mt[1]);                         // axle at full extension: [forward offset, height]
      const wx = this.x + fx * A[0], wz = this.z + fz * A[0];
      const g0 = world.ground(wx, wz, A[1] - r + 0.5);
      const g1 = world.ground(wx + fx * 0.25, wz + fz * 0.25, A[1] - r + 0.6);
      const gb = world.ground(wx - fx * 0.25, wz - fz * 0.25, A[1] - r + 0.6);
      // the slope under the wheel; at an edge (a step, the lip of a deck) the side that is not a cliff is the one the tyre is on
      const sF = Math.atan2(g1 - g0, 0.25), sB = Math.atan2(g0 - gb, 0.25);
      const slope = Math.abs(sF - sB) < 0.35 ? Math.atan2(g1 - gb, 0.5) : (Math.abs(sF) < Math.abs(sB) ? sF : sB);
      // how far the wheel is pushed up the fork: the axle moves along the chassis' up axis
      const sNew = (g0 + r - A[1]) / Math.max(0.3, cp);
      const sPrev = this.s[i];
      let s = sNew, N = 0;
      if (s > 0) {
        const sv = (s - sPrev) / h;
        this.sv[i] = this.sv[i] * 0.5 + sv * 0.5;
        const sc = Math.min(s, sus.travel);
        N = sus.k * (sc + sus.pre) + sus.c * this.sv[i];
        // progressive in the last third of the stroke (the air gap in the fork, the shock's bottoming cone)
        if (sc > sus.travel * 0.65) { const e = sc - sus.travel * 0.65; N += sus.k * 3.5 * e + sus.c * 1.5 * Math.max(0, this.sv[i]) * e / (sus.travel * 0.35); }
        if (s > sus.travel) {
          // the bump stop: very stiff and well damped; how fast it was hit is how hard the landing was
          if (sPrev <= sus.travel) { this.events.push({ type: "bottom", v: this.sv[i], wheel: i }); this.bottomed = Math.max(this.bottomed, this.sv[i]); }
          N += 450000 * (s - sus.travel) + 9000 * Math.max(0, this.sv[i]);
        }
        N = Math.max(0, N);
        contacts++;
      } else { s = 0; this.sv[i] = 0; }
      this.s[i] = s; this.N[i] = N; Ntot += N;
      // contact point: under the axle
      P[i][0] = A[0]; P[i][1] = g0 - this.y;
      // normal along the ground's normal in the pitch plane
      F[i][0] += -Math.sin(slope) * N; F[i][1] += Math.cos(slope) * N;
      this["_slope" + i] = slope;
    }
    // ---- grip here
    const gp = world.grip ? world.grip(this.x, this.z) : { mu: 1, dirt: false };
    const muS = (gp.dirt ? S.muDirt : S.mu) * (gp.mu !== undefined ? gp.mu : 1);
    this.surfaceMu = muS;
    const wasAir = this.air;
    if (contacts === 0) { this.contactT = 0; this.airT += h; if (this.airT > 0.06) this.air = true; }
    else {
      this.contactT += h;
      if (this.air) {
        // landing: how hard (into the ground, along its normal), and how well lined up
        const sl = (this._slope0 + this._slope1) / 2;
        const vn = -(this.w * Math.cos(sl) - this.u * Math.sin(sl));
        const err = this.pitch - sl, sideways = Math.abs(Math.atan2(this.vl, Math.max(1, Math.abs(this.u))));
        this.events.push({ type: "land", impact: vn, air: this.airT, pitchErr: err, lean: this.lean });
        this._landing = { vn: vn, err: err, t: 0.35 };
        if (Math.abs(err) > 0.78) this._crash(err > 0 ? "looped" : "nosed", { impact: vn });
        else if (Math.abs(this.lean) > 0.62 || sideways > 0.55) this._crash("landing", { impact: vn });
      }
      this.air = false; this.airT = 0;
    }
    if (this._landing) { this._landing.t -= h; if (this.bottomed > S.bottom && this._landing.t > 0) this._crash("cased", { impact: this.bottomed }); if (this._landing.t <= 0) this._landing = null; }
    this.bottomed = Math.max(0, this.bottomed - h * 20);
    this.groundPitch = (this._slope0 + this._slope1) / 2;
    // lateral ground slope under the CoM, which is what a berm is
    {
      const gl = world.ground(this.x - rx * 0.6, this.z - rz * 0.6, this.y), gr = world.ground(this.x + rx * 0.6, this.z + rz * 0.6, this.y);
      this.groundRoll = contacts ? clamp(Math.atan2(gr - gl, 1.2), -0.9, 0.9) : 0;
    }

    // ---- drivetrain
    const Rr = S.rr, Rf = S.rf;
    let Tdrive = 0;                 // torque arriving at the rear wheel
    let wheelInertia = this.Iw[0];
    if (S.pedal) {
      // a rider is a power source with a force limit, and he cannot pedal faster than his legs go
      const v = Math.max(0.5, Math.abs(this.u));
      const Fp = Math.min(S.pedal.force, S.pedal.power / v) * this.thr * (this.u < 18 ? 1 : 0);
      Tdrive = Fp * Rr;
    } else {
      const shifting = this.shiftT > 0;
      if (shifting) this.shiftT -= h;
      // gearbox: up near the redline, down when it bogs, with a torque cut while it shifts
      const cvt = S.gears === 0;
      let ratio;
      if (cvt) {
        // the variator holds the engine near peak power when you open it, and lets it fall to idle when you don't
        const wantW = this.idle + (this.red * 0.86 - this.idle) * clamp(this.thr * 1.15, 0, 1);
        ratio = clamp(wantW / Math.max(1, Math.abs(this.wheel[0])), this.ratios[0], this.ratios[0] * 3.1);
      } else {
        ratio = this.ratios[this.gear];
        const wWheelEng = Math.abs(this.wheel[0]) * ratio;
        if (!shifting && this.gear < this.ratios.length - 1 && wWheelEng > this.red * (this.N[1] < 1 && this.pitch > 0.12 ? 1.0 : 0.965) && this.clutch > 0.95) { this.gear++; this.shiftT = 0.07; }
        else if (!shifting && this.gear > 0 && wWheelEng < this.red * (this.thr > 0.6 ? 0.55 : 0.36)) { this.gear--; this.shiftT = 0.09; }
        ratio = this.ratios[this.gear];
      }
      this.ratio = ratio;
      // engine torque at this speed and throttle, less pumping and friction (engine braking when shut)
      const n = this.we / this.red;
      let Te = this.Tpk * this.torqueShape(n) * this.thr;
      Te -= (0.07 + 0.10 * n) * this.Tpk * (1 - this.thr);
      if (shifting) Te = Math.min(Te, 0);
      if (this.we >= this.red) Te = Math.min(Te, -0.2 * this.Tpk);          // rev limiter
      if (this.we <= this.idle && Te < 0) Te = 0.05 * this.Tpk;              // the idle circuit
      // clutch: the auto-clutch slips from a standstill and is fully in once the wheel can carry the engine; a pop holds it out for a moment
      const wWheel = this.wheel[0] * ratio;
      const launch = cvt ? this.idle + (this.red * 0.86 - this.idle) * clamp(this.thr * 1.15, 0, 1) * 0.97 : this.idle * 1.5 + this.thr * this.red * 0.42;
      let cap;
      if (this.popT > 0) cap = 0;
      else if (wWheel < launch) cap = this.Tpk * (0.15 + 1.05 * this.thr) * clamp((this.we - launch * 0.75) / (launch * 0.25 + 1), 0.04, 1);      // it bites as the revs reach the launch rpm
      else cap = this.Tpk * 3.5;
      this.clutch = cap >= this.Tpk * 3 ? 1 : 0.5;
      // once the wheel can carry the engine the clutch is simply in: one shaft from the crank to the wheel, so the engine's inertia (times
      // the ratio squared) is on the wheel; it slips only to pull away, for a clutch pop, and when the bike slows below the idle
      const Ieq = this.Ie * ratio * ratio;
      const lockNow = this.popT <= 0 && (wWheel >= Math.max(this.idle * 1.8, launch * 0.5) || (this._locked && wWheel >= this.idle * 1.15));
      if (lockNow) {
        wheelInertia = this.Iw[0] + Ieq;
        Tdrive = Te * ratio * 0.92;
        this._locked = true;
        this.we = wWheel;
      } else {
        const dW = this.we - wWheel;
        const Tc = cap * clamp(dW / 25, -1, 1);
        this._locked = false;
        Tdrive = Tc * ratio * 0.92;
        this.we += (Te - Tc) / this.Ie * h;
      }
      if (!this._locked) this.we = Math.max(this.idle * 0.8, Math.min(this.we, this.red * 1.02));
    }

    // traction control on the road bikes: wheelspin past about ten percent slip takes torque away
    if (S.abs && Tdrive > 0 && this.slip[0] > 0.1) Tdrive *= clamp(1 - (this.slip[0] - 0.1) * 7, 0.15, 1);
    if (this._assist && Tdrive > 0) {
      const bEff = S.b + this.shift, Fmax = this.m * G * bEff / S.h * 0.9 + 0.5 * RHO * S.cda[0] * this.u * this.u;
      let lim = Fmax * Rr * (this.N[1] > 1 ? 1 : clamp(1 - (this.pitch - 0.04) * 5 - Math.max(0, this.q) * 0.8, 0.3, 1));
      Tdrive = Math.min(Tdrive, lim);
    }

    // ---- brakes, as torques on the wheels; ABS lets the front off at the edge of locking
    const Tbf_max = 1.35 * m * G * Rf, Tbr_max = 0.9 * m * G * Rr;
    let Tbf = this.fb * Tbf_max, Tbr = this.rb * Tbr_max;
    if (S.abs && this.slip[1] < -0.11 && this.u > 2) Tbf *= 0.3;
    if (S.abs && this.slip[0] < -0.16 && this.u > 2) Tbr *= 0.4;
    // rear-lift mitigation: the ABS eases the front when the back wheel goes light
    if (S.abs && (this.N[0] < this.m * G * 0.06 || this.pitch < -0.02)) Tbf *= 0.55;

    // ---- tyres
    const u = this.u;
    const lonF = [0, 0];
    const BL = this.tyre.lon;
    const a = S.wb - S.b - this.shift, b = S.b + this.shift;
    // what the turn asks of each tyre (from the lean of the last step): the lean decides the cornering acceleration (tan(lean) = ay / g);
    // a banked surface carries part of it, and the rest is split between the axles by where the weight is
    const ayLean = this._ay || 0;
    const tyreAy = ayLean * Math.cos(this.groundRoll) - G * Math.sin(this.groundRoll);
    const latDem = [m * tyreAy * a / S.wb, m * tyreAy * b / S.wb];      // rear, front
    // electronics: road bikes have cornering ABS and traction control that keep the longitudinal force inside what the turn leaves
    const assist = S.abs;
    // the wheel and its tyre form a stiff pair (a tread that grips hard against a wheel that is light), so they are stepped eight times finer
    const NS = 8, hs = h / NS;
    const w0r = this.wheel[0];
    for (let i = 0; i < 2; i++) {
      const R = i === 0 ? Rr : Rf, N = this.N[i];
      const vc = u * Math.cos(i === 0 ? this._slope0 : this._slope1);
      const muN = muS * N;
      const room = assist && muN > 1 ? muN * Math.sqrt(Math.max(0.02, 1 - Math.min(1, Math.abs(latDem[i]) / muN) ** 2)) : Infinity;
      const I = i === 0 ? wheelInertia : this.Iw[1];
      const Tb = i === 0 ? Tbr : Tbf, Td = i === 0 ? Tdrive : 0;
      let fsum = 0;
      for (let k = 0; k < NS; k++) {
        // slip with a relaxation length (the tread deforms before it slides), integrated implicitly so it is stable at a standstill too
        const sigma = 0.22, ve = Math.max(2, Math.abs(vc));
        const kappa = clamp((this.slip[i] + hs * (this.wheel[i] * R - vc) / sigma) / (1 + hs * ve / sigma), -1, 1);
        this.slip[i] = kappa;
        let fl = N > 0 ? clamp(muN * pacejka(kappa, BL[0], BL[1], BL[2]), -room, room) : 0;
        fsum += fl;
        let w1 = this.wheel[i] + (Td - fl * R) / I * hs;
        // a brake can stop a wheel but not turn it backwards
        if (Tb > 0) { const dw = Tb / I * hs; if (Math.abs(w1) <= dw) w1 = 0; else w1 -= dw * sgn(w1); }
        w1 -= w1 * 0.02 * hs;                                       // bearings and chain
        this.wheel[i] = w1;
      }
      lonF[i] = fsum / NS;
    }
    // gyroscopic reaction: spinning the rear wheel up pitches the chassis the other way (it matters in the air)
    this._wheelReact = this.air ? (this.wheel[0] - w0r) / h * this.Iw[0] : 0;
    if (!S.pedal && this._locked) this.we = Math.max(this.idle * 0.8, Math.abs(this.wheel[0]) * this.ratio);
    if (S.pedal && this.thr < 0.05 && this.wheel[0] * Rr > this.u) this.wheel[0] = this.u / Rr;          // freewheel

    // ---- longitudinal forces at the contact patches, along the ground
    for (let i = 0; i < 2; i++) {
      const sl = i === 0 ? this._slope0 : this._slope1;
      F[i][0] += Math.cos(sl) * lonF[i]; F[i][1] += Math.sin(sl) * lonF[i];
    }
    // ---- aero and rolling resistance
    const cda = u > this.top * 0.55 ? S.cda[1] : S.cda[0];        // tucked in at speed
    const drag = 0.5 * RHO * cda * u * Math.abs(u) + (contacts ? (gp.dirt ? 0.035 : 0.014) * Ntot * sgn(u) * Math.min(1, Math.abs(u) * 2) : 0);

    // ---- pitch-plane rigid body
    let Fx = F[0][0] + F[1][0] - drag, Fy = F[0][1] + F[1][1] - m * G;
    let tau = 0;
    for (let i = 0; i < 2; i++) {
      const mt = this._mount(i), A = this._bodyPt(mt[0], mt[1]);
      const px = A[0], py = (this.N[i] > 0 ? P[i][1] : A[1] - this.y);
      tau += px * F[i][1] - py * F[i][0];
    }
    // the rider: body english, which mostly matters in the air, and the wheel's reaction
    if (this.air) tau += -clamp(inp.weight || 0, -1, 1) * S.airTorque + (this._wheelReact || 0);
    // throwing the hips back pulls the bars and lifts the front (how a manual or a bunny hop starts); forward does the opposite
    tau += -(this._shiftVel || 0) * S.rider * 1.6;
    tau -= this.q * (contacts ? 6 : 1.5);                           // rider and tyre carcass damping
    this.acc = Fx / m;
    this.u += Fx / m * h;
    this.w += Fy / m * h;
    this.q += tau / this.Ip * h;
    this.pitch += this.q * h;
    this.y += this.w * h;
    if (Math.abs(this.u) < 0.05 && this.thr < 0.02 && contacts === 2) { this.u = 0; this.wheel[0] = 0; this.wheel[1] = 0; }

    // ---- lean, yaw and lateral motion
    // The rider chooses a lean and counter-steers to reach it, as fast as the bike's roll inertia and his strength allow; the bike then turns
    // at the rate its lean balances (yaw rate = g tan(lean) / v, a little more lean for the wheels' gyroscopes). The tyres are asked for that
    // force, axle by axle, and what they cannot give becomes a slide: a front that cannot hold the line tucks, a rear that cannot steps out.
    const lowSpeed = Math.abs(u) < 3.0;
    const steerIn = clamp(inp.steer || 0, -1, 1);
    const vabs = Math.max(0.5, Math.abs(u));
    const gyroK = 1 + (this.Iw[0] + this.Iw[1]) * vabs / (S.rr * m * S.h * 9) ;
    if (this.air) {
      // the yaw rate carries on; the rider can whip it a little
      this.leanRate += ((steerIn * 0.3 - this.lean) * 8 - this.leanRate * 3) * h;
      this.lean += this.leanRate * h;
      this.r *= Math.pow(0.5, h);
      this._ay = 0;
    } else {
      // how much grip there is sideways, now, at each end: what the springs press down times the surface, less what braking or drive uses
      const avail = [0, 0];
      for (let i = 0; i < 2; i++) { const muN = muS * this.N[i]; avail[i] = muN > 1 ? muN * Math.sqrt(Math.max(0, 1 - (lonF[i] / muN) ** 2)) : 0; }
      if (lowSpeed) {
        // walking pace: the bars steer it, the rider balances it with his feet
        this.steer += clamp(steerIn * 0.6 - this.steer, -h * 3, h * 3);
        const leanT = steerIn * 0.22 * clamp(Math.abs(u) / 3, 0, 1);
        this.leanRate += ((leanT - this.lean) * 40 - this.leanRate * 12) * h;
        this.lean += this.leanRate * h;
        this.r = u * Math.tan(this.steer) / S.wb;
        this.vl *= Math.pow(0.01, h);
        this._ay = u * this.r;
        this.tuckT = 0;
      } else {
        // the lean he asks for: no more than the hard parts allow, and no more than he can feel the tyres will take
        const leanCap = Math.min(S.lean, Math.atan(muS * 0.88 / gyroK));
        const leanT = steerIn * leanCap;
        const wn = S.leanRate * clamp(vabs / 8, 0.5, 1) * clamp(32 / vabs, 0.55, 1);
        const leanAcc = wn * wn * (leanT - this.lean) - 2 * 0.85 * wn * this.leanRate;
        this.leanRate += leanAcc * h;
        this.lean += this.leanRate * h;
        // the turn that lean balances
        const ay = G * Math.tan(this.lean) / gyroK;
        const rKin = ay / vabs * sgn(u);
        // can the tyres do it? (rear index 0, front 1)
        const tyreAyNow = ay * Math.cos(this.groundRoll) - G * Math.sin(this.groundRoll);
        const demR = m * tyreAyNow * a / S.wb, demF = m * tyreAyNow * b / S.wb;
        const useF = avail[1] > 1 ? Math.abs(demF) / avail[1] : 9, useR = avail[0] > 1 ? Math.abs(demR) / avail[0] : 9;
        this.use = [useR, useF];
        // the front: if it cannot carry its share the bike runs wide, and if that lasts with the bike leaned, it tucks
        const fFrac = useF > 1 ? 1 / useF : 1;
        // the rear: what it cannot carry is a slide, the tail stepping out, which grows the lateral velocity outwards
        const rOver = useR > 1 ? (Math.abs(demR) - avail[0]) * sgn(demR) : 0;
        const latActual = (demF * fFrac + (demR - rOver)) / m + G * Math.sin(this.groundRoll) * Math.cos(this.groundRoll) * 0;
        this.r = rKin * fFrac + (rOver / (m * vabs)) * (S.wb / Math.max(0.3, a)) * 0.6;
        // lateral velocity of the centre of mass in the bike's frame: the tyres' force against the turn's need
        this.vl += (latActual - u * rKin * fFrac) * h;
        // whatever grip the rear has left over straightens a slide; on tarmac that is sudden
        if (useR < 1 && Math.abs(this.vl) > 0) {
          const spare = (avail[0] - Math.abs(demR)) / m * (gp.dirt ? 0.35 : 1.6);
          const dv = Math.min(Math.abs(this.vl), spare * h);
          this.vl -= dv * sgn(this.vl);
        }
        this._ay = ay;
        this.steer = Math.atan(S.wb * rKin / vabs) + clamp((leanT - this.lean) * -0.08, -0.1, 0.1);
        // the slip angle at the rear, which is the slide
        const beta = Math.atan2(this.vl, vabs);
        this.alpha[0] = beta; this.alpha[1] = useF > 1 ? (useF - 1) * 0.2 : 0;
        // ---- tyres let go
        // front: asked for more than it has, for long enough, with the bike leaned (on dirt it pushes a while before it goes)
        this.tuckT = (useF > 1.08 && Math.abs(this.lean) > 0.18) || (this.slip[1] < -0.5 && Math.abs(this.lean) > 0.15) ? this.tuckT + h : Math.max(0, this.tuckT - h * 3);
        if (this.tuckT > (gp.dirt ? 0.45 : 0.18)) this._crash("lowside");
        // rear: a big slide on tarmac that grips again with the bike still leaned throws the rider over the top
        const slideR = Math.abs(beta);
        if (slideR > this.rearSlideMax) this.rearSlideMax = slideR;
        if (slideR > 0.08) this.highT = 0.4; else this.highT -= h;
        if (!gp.dirt && this.rearSlideMax > 0.26 && slideR < 0.08 && Math.abs(this.lean) > 0.3 && this.highT > 0 && vabs > 8) this._crash("highside");
        if (this.highT <= 0) this.rearSlideMax = 0;
        // a slide that just keeps going is a lowside too
        if (slideR > (gp.dirt ? 0.95 : 0.6)) this._crash("lowside");
        if (Math.abs(this.lean) > S.lean + 0.14) this._crash("lowside");
      }
    }
    if (Math.abs(this.lean) > 1.2) this._crash("fell");
    // ---- loop-out and over the bars
    if (!this.air) {
      if (this.pitch > this.balancePoint + 0.5 || this.pitch > 1.4) this._crash("loopout");
      if (this.pitch < -(this.stoppiePoint + 0.4)) this._crash("overbars");
    } else if (Math.abs(this.pitch) > 2.3) this._crash(this.pitch > 0 ? "looped" : "nosed");

    // ---- move
    const dyaw = -this.r * h;
    this.yaw += dyaw;
    this.x += (fx * this.u + rx * this.vl) * h;
    this.z += (fz * this.u + rz * this.vl) * h;
    if (wasAir !== this.air && this.air) this.events.push({ type: "takeoff", speed: this.u, vy: this.w });
  }

  // the rear contact patch and the pose, for drawing: x, z of the rear axle, y of the ground under it (or where it would be in the air)
  pose() {
    const S = this.spec, mt = this._mount(0), A = this._bodyPt(mt[0], mt[1]);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const sR = Math.min(this.s[0], this.sus[0].travel);
    return {
      rearX: this.x + fx * A[0], rearZ: this.z + fz * A[0],
      rearY: A[1] + sR * Math.cos(this.pitch) - S.rr,
      pitch: this.pitch, lean: this.lean, yaw: this.yaw, steer: this.steer,
      compression: [this.s[0] / this.sus[0].travel, this.s[1] / this.sus[1].travel]
    };
  }

  // a summary for a HUD or a debug overlay
  telemetry() {
    return { speed: this.u, rpm: this.rpm, gear: this.spec.gears ? this.gear + 1 : 0, pitch: this.pitch, balance: this.balancePoint, lean: this.lean,
      wheelie: this.wheelie, stoppie: this.stoppie, air: this.air, airTime: this.airT, loads: this.N.slice(), slip: this.slip.slice(),
      slipAngle: this.alpha.slice(), steer: this.steer, mu: this.surfaceMu };
  }
}
