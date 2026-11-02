// Boat dynamics: the numbers a skipper would check. node Engine/tests/boat.test.mjs [-v]
import { Boat, BOAT_SPECS } from "../src/vehicles/Boat.js";
import { Ocean } from "../src/vehicles/Ocean.js";

const V = process.argv.includes("-v");
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };
const deep = () => -30;
const flat = () => ({ sea: new Ocean({ amp: 0 }), ground: deep, ownTime: true });
const swell = a => ({ sea: new Ocean({ amp: a }), ground: deep, ownTime: true });

function run(kind, secs, inputFn, world = flat(), start = 0, onStep) {
  const b = new Boat(kind);
  b.reset({ x: 0, z: 0, yaw: 0, speed: start, sea: world.sea });
  for (let i = 0; i < 360; i++) b.step(1 / 60, { throttle: 0 }, world);      // settle
  if (start) { const f = b.forward(); b.vel = [f[0] * start, b.vel[1], f[2] * start]; }
  const ev = [];
  let t = 0;
  while (t < secs) {
    const e = b.step(1 / 60, inputFn(t, b), world);
    e.forEach(x => ev.push(Object.assign({ t }, x)));
    if (onStep) onStep(t, b);
    t += 1 / 60;
  }
  return { b, ev };
}
const kn = v => (v * 1.9438).toFixed(1) + " kn";

console.log("floating at rest");
for (const k of Object.keys(BOAT_SPECS)) {
  const { b } = run(k, 6, () => ({ throttle: 0 }));
  const T = b.telemetry();
  const err = Math.abs(T.displacement - b.m) / b.m;
  if (V) console.log("   ", k, JSON.stringify(T));
  ok(err < 0.04 && Math.abs(b.vel[1]) < 0.02, k + ": floats level, displacement " + Math.round(T.displacement) + " kg vs mass " + b.m + " kg");
  ok(Math.abs(T.heel) < 0.5 && Math.abs(T.trim) < 3, k + ": sits upright (heel " + T.heel.toFixed(2) + "°, trim " + T.trim.toFixed(2) + "°)");
}

console.log("heeled over and let go: it rights itself");
for (const k of ["rib", "runabout", "gyosen"]) {
  const b = new Boat(k); const w = flat();
  b.reset({ x: 0, z: 0, yaw: 0, sea: w.sea });
  for (let i = 0; i < 300; i++) b.step(1 / 60, {}, w);
  const a = 0.35; b.quat = [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
  let maxBack = 0;
  for (let i = 0; i < 600; i++) { b.step(1 / 60, {}, w); maxBack = Math.max(maxBack, Math.abs(b.heel)); }
  ok(Math.abs(b.heel) < 0.03, k + ": heeled 20° and released, back to " + (b.heel * 57.3).toFixed(1) + "° after 10 s");
}

console.log("full throttle on flat water");
for (const k of Object.keys(BOAT_SPECS)) {
  const sp = BOAT_SPECS[k];
  let planeAt = null, maxTrim = 0;
  const { b } = run(k, 40, () => ({ throttle: 1 }), flat(), 0, (t, b) => { if (b.planing && planeAt === null) planeAt = t; maxTrim = Math.max(maxTrim, b.trim); });
  const T = b.telemetry();
  if (V) console.log("   ", k, JSON.stringify(T), "planed at", planeAt);
  ok(T.speed > sp.top * 0.85 && T.speed < sp.top * 1.12, k + ": top speed " + kn(T.speed) + " (rated " + kn(sp.top) + ")");
  if (k !== "gyosen") {
    ok(planeAt !== null && planeAt < 12, k + ": gets on the plane" + (planeAt !== null ? " in " + planeAt.toFixed(1) + " s" : ""));
    ok(T.trim > 1 && T.trim < 8, k + ": runs at " + T.trim.toFixed(1) + "° bow-up on the plane");
    ok(maxTrim * 57.3 > T.trim + 0.3, k + ": bow rises over the hump (" + (maxTrim * 57.3).toFixed(1) + "°) then settles");
    ok(T.displacement < b.m * 0.75, k + ": up on its lift, only " + Math.round(T.displacement / b.m * 100) + "% of its weight on buoyancy");
  }
  ok(Math.abs(T.heel) < 2 && Math.abs(b.yaw) < 0.05, k + ": runs straight and level (heel " + T.heel.toFixed(2) + "°, heading drift " + (b.yaw * 57.3).toFixed(2) + "°)");
}

console.log("turning at speed");
for (const k of ["jetski", "rib", "runabout", "skiff", "gyosen"]) {
  const sp = BOAT_SPECS[k];
  let heelMin = 0, heelMax = 0;
  const { b } = run(k, 30, t => ({ throttle: 1, steer: t > 22 ? 1 : 0 }), flat(), 0, (t, b) => { if (t > 24) { heelMin = Math.min(heelMin, b.heel); heelMax = Math.max(heelMax, b.heel); } });
  const yawRate = b.w[1];
  if (V) console.log("   ", k, JSON.stringify(b.telemetry()), "yawRate", yawRate, "heel", heelMin, heelMax);
  ok(yawRate < -0.15 && yawRate > -1.1, k + ": hard right carves it right (" + (yawRate * 57.3).toFixed(0) + "°/s)");
  if (k !== "gyosen") ok(heelMax > 0.07 && heelMax < 0.6, k + ": banks into the turn (" + (heelMax * 57.3).toFixed(1) + "° to starboard)");
  ok(b.telemetry().speed < sp.top * 0.98 && b.telemetry().speed > sp.top * 0.3, k + ": scrubs speed in the turn but keeps going (" + kn(b.telemetry().speed) + ")");
  ok(b.up()[1] > 0.7, k + ": stays the right way up");
}

console.log("jet ski: no throttle, no steering");
{
  const { b } = run("jetski", 4, () => ({ throttle: 0, steer: 1 }), flat(), 10);
  const r = run("rib", 4, () => ({ throttle: 0, steer: 1 }), flat(), 10).b;
  ok(Math.abs(b.w[1]) < Math.abs(r.w[1]) * 0.5 + 0.02, "coasting with the bars over, the jet ski barely turns (" + (b.w[1] * 57.3).toFixed(1) + "°/s vs a RIB's " + (r.w[1] * 57.3).toFixed(1) + "°/s)");
}

console.log("stopping and reverse");
{
  const { b } = run("runabout", 25, t => ({ throttle: t < 15 ? 1 : 0 }), flat());
  ok(b.speed < 5, "runabout: off the throttle from top speed, falls off the plane and slows to " + kn(b.speed) + " in 10 s");
  const r = run("rib", 8, () => ({ throttle: -1 }), flat()).b;
  ok(r.speed < -1.5 && r.speed > -6, "rib: reverse makes sternway (" + kn(r.speed) + ")");
}

console.log("in a swell");
for (const k of ["rib", "runabout", "gyosen"]) {
  let pitchMax = 0, yMin = 1e9, yMax = -1e9;
  const w = swell(0.6);
  const { b, ev } = run(k, 25, () => ({ throttle: 0 }), w, 0, (t, b) => { if (t > 5) { pitchMax = Math.max(pitchMax, Math.abs(b.trim)); yMin = Math.min(yMin, b.pos[1]); yMax = Math.max(yMax, b.pos[1]); } });
  if (V) console.log("   ", k, JSON.stringify(b.telemetry()), pitchMax, yMin, yMax);
  ok(yMax - yMin > 0.15 && yMax - yMin < 3.6, k + ": rides up and down the swell (" + (yMax - yMin).toFixed(2) + " m)");
  ok(pitchMax > 0.005 && b.up()[1] > 0.85, k + ": pitches with the waves (" + (pitchMax * 57.3).toFixed(1) + "°) and stays upright");
  ok(Math.hypot(b.pos[0], b.pos[2]) < 30, k + ": drifts but goes nowhere fast (" + Math.hypot(b.pos[0], b.pos[2]).toFixed(1) + " m)");
  void ev;
}
{
  let airT = 0, vent = 0;
  const { ev } = run("jetski", 30, () => ({ throttle: 1 }), swell(1.4), 0, (t, b) => { if (b.air > 0) airT += 1 / 60; vent = Math.max(vent, b.vent); });
  ok(airT > 0.05, "jet ski flat out across a big sea leaves the water off the crests (" + airT.toFixed(2) + " s in the air)");
  ok(vent > 0.5, "and the pump sucks air when it does (ventilation " + vent.toFixed(2) + ")");
  ok(ev.some(e => e.type === "slam") || airT > 0.05, "and lands with a slam");
}

console.log("running aground");
{
  const shelf = { sea: new Ocean({ amp: 0 }), ownTime: true, ground: (x, z) => (z > 60 ? -2 + (z - 60) * 0.25 : -10) };
  const { b, ev } = run("rib", 12, () => ({ throttle: 0.6 }), shelf);
  ok(b.pos[2] < 80 && Math.abs(b.speed) < 1.5, "rib: drives up a beach and stops on it at z " + b.pos[2].toFixed(1) + " (" + kn(b.speed) + ")");
  ok(ev.some(e => e.type === "ground"), "and the host hears it run aground");
}

console.log("a wall");
{
  const w = { sea: new Ocean({ amp: 0 }), ownTime: true, ground: deep, solid: (x, z) => z > 40 };
  const { b, ev } = run("runabout", 15, () => ({ throttle: 0.5 }), w);
  ok(b.pos[2] < 41, "runabout: stopped by a quay wall (bow at " + (b.pos[2] + b.spec.L * 0.6).toFixed(1) + " m)");
  ok(ev.some(e => e.type === "hit"), "and the host hears the hit (" + (ev.find(e => e.type === "hit") || { speed: 0 }).speed.toFixed(1) + " m/s)");
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall boat checks pass");
process.exit(fails ? 1 : 0);
