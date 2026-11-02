// Motorcycle dynamics: the numbers a rider would check. node Engine/tests/motorcycle.test.mjs [-v]
import { Motorcycle, BIKE_SPECS } from "../src/vehicles/Motorcycle.js";

const V = process.argv.includes("-v");
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };
const flat = { ground: () => 0, grip: () => ({ mu: 1, dirt: false }) };
const dirt = { ground: () => 0, grip: () => ({ mu: 1, dirt: true }) };
const TOP = { sport: 78, scooter: 17, cruiser: 62, tourer: 64, dirt: 36, mtb: 16 };
const T100 = { sport: 3.1, scooter: 11, cruiser: 4.6, tourer: 5.2, dirt: 4.0, mtb: 11 };

function run(name, secs, inputFn, world = flat, start = 0, onStep) {
  const b = new Motorcycle(name, { top: TOP[name], to100: T100[name] });
  b.reset({ x: 0, y: world.ground(0, 0, 9), z: 0, yaw: 0, speed: start });
  // settle on the springs
  for (let i = 0; i < 60; i++) b.step(1 / 60, { throttle: 0, front: start ? 0 : 0.3, rear: 0, steer: 0, weight: 0 }, world);
  const ev = [];
  let t = 0;
  while (t < secs && !b.crashed) {
    const inp = inputFn(t, b);
    const e = b.step(1 / 60, inp, world);
    e.forEach(x => ev.push(Object.assign({ t: t }, x)));
    if (onStep) onStep(t, b);
    t += 1 / 60;
  }
  return { b, ev, t };
}

console.log("rest");
for (const n of Object.keys(BIKE_SPECS)) {
  const { b } = run(n, 2, () => ({ throttle: 0, front: 0.3, rear: 0, steer: 0, weight: 0 }));
  const S = BIKE_SPECS[n];
  ok(!b.crashed && Math.abs(b.pitch) < 0.03 && Math.abs(b.u) < 0.05, `${n}: stands on its springs (pitch ${b.pitch.toFixed(3)}, sag R ${(b.s[0] / b.sus[0].travel * 100).toFixed(0)}% F ${(b.s[1] / b.sus[1].travel * 100).toFixed(0)}%)`);
}

console.log("straight line, full throttle, weight forward (no wheelie)");
for (const n of Object.keys(BIKE_SPECS)) {
  let t100 = null, maxPitch = 0;
  const { b } = run(n, 60, (t) => ({ throttle: 1, front: 0, rear: 0, steer: 0, weight: 1 }), flat, 0, (t, bk) => { if (t100 === null && bk.u >= 27.78) t100 = t; maxPitch = Math.max(maxPitch, bk.pitch); });
  console.log(`         ${n}: top ${(b.u * 3.6).toFixed(0)} km/h (fitted to ${(TOP[n] * 3.6).toFixed(0)}), 0-100 ${t100 ? t100.toFixed(1) + " s" : "never"}, gear ${b.gear + 1}, ${b.rpm.toFixed(0)} rpm, max pitch ${maxPitch.toFixed(2)}${b.crashed ? " CRASH " + b.crashed : ""}`);
  ok(!b.crashed && Math.abs(b.u - TOP[n]) < TOP[n] * 0.08, `${n}: reaches its top speed`);
}

console.log("wheelies");
{
  // a supersport: whack it open in first with weight back and it comes up
  let up = 0;
  const { b } = run("sport", 1.6, (t) => ({ throttle: 1, front: 0, rear: 0, steer: 0, weight: -1 }), flat, 3, (t, bk) => { if (bk.wheelie) up++; });
  ok(up > 10, `sport: power wheelie in first (front up for ${(up / 60).toFixed(2)} s, pitch ${b.pitch.toFixed(2)}, balance ${b.balancePoint.toFixed(2)}${b.crashed ? ", " + b.crashed : ""})`);
}
{
  // the cruiser is long and low: it does not
  let up = 0;
  run("cruiser", 3, () => ({ throttle: 1, front: 0, rear: 0, steer: 0, weight: -1 }), flat, 3, (t, bk) => { if (bk.wheelie) up++; });
  ok(up < 6, `cruiser: stays down on full throttle (${up} frames up)`);
}
{
  // hold full throttle and it loops out
  const { b } = run("dirt", 6, () => ({ throttle: 1, front: 0, rear: 0, steer: 0, weight: -1 }), dirt, 4);
  ok(b.crashed === "loopout", `dirt: holding it open past the balance point loops out (${b.crashed})`);
}
{
  // ride the balance point: throttle to lift and hold, rear brake to stop it going over
  let held = 0, maxP = 0;
  const { b } = run("dirt", 8, (t, bk) => {
    const tgt = bk.balancePoint * 0.8, e = bk.pitch - tgt;
    const thr = bk.pitch < 0.12 && bk.q < 0.5 ? 1 : clamp01(0.7 - e * 3 - bk.q * 0.7);
    const rear = clamp01(e * 3 + bk.q * 0.9);
    return { throttle: thr, front: 0, rear: rear, steer: 0, weight: -0.6 };
  }, dirt, 6, (t, bk) => { if (bk.wheelie) held++; maxP = Math.max(maxP, bk.pitch); });
  ok(!b.crashed && held / 60 > 2.0, `dirt: rear brake holds a balance-point wheelie (${(held / 60).toFixed(1)} s up, max pitch ${maxP.toFixed(2)}, ${b.crashed || "still riding"}, ${(b.u * 3.6).toFixed(0)} km/h)`);
}
{
  // rear brake brings the nose down: lift it, then cover the rear brake with the throttle still half open
  let peak = 0, after = 1, phase = 0;
  const { b } = run("sport", 3, (t, bk) => { if (phase === 0 && bk.pitch > 0.25) phase = 1; return phase === 0 ? { throttle: 1, front: 0, rear: 0, steer: 0, weight: -1 } : { throttle: 0.3, front: 0, rear: 1, steer: 0, weight: -1 }; },
    flat, 3, (t, bk) => { if (phase === 0) peak = Math.max(peak, bk.pitch); else after = Math.min(after, bk.pitch); });
  ok(peak > 0.25 && after < 0.05 && !b.crashed, `sport: rear brake drops the front (peak ${peak.toFixed(2)}, after ${after.toFixed(2)}${b.crashed ? ", " + b.crashed : ""})`);
}
{
  // a mountain bike manual: weight back, no pedalling
  let up = 0;
  run("mtb", 2, (t) => ({ throttle: t < 0.15 ? 1 : 0, front: 0, rear: 0, steer: 0, weight: -1 }), dirt, 5, (t, bk) => { if (bk.wheelie) up++; });
  ok(up > 5, `mtb: weight back pops a manual (${(up / 60).toFixed(2)} s up)`);
}

console.log("braking");
{
  let maxDec = 0;
  const { b, t } = run("sport", 8, () => ({ throttle: 0, front: 1, rear: 0.3, steer: 0, weight: 0 }), flat, 27.8, (t, bk) => { maxDec = Math.max(maxDec, -bk.acc); });
  ok(!b.crashed && b.u < 0.5, `sport: ABS stop from 100 km/h in ${t.toFixed(1)} s, peak ${(maxDec / 9.81).toFixed(2)} g${b.crashed ? ", " + b.crashed : ""}`);
}
{
  let minP = 0;
  const { b } = run("dirt", 4, () => ({ throttle: 0, front: 1, rear: 0, steer: 0, weight: 1 }), flat, 18, (t, bk) => { minP = Math.min(minP, bk.pitch); });
  ok(minP < -0.05, `dirt (no ABS): grabbing the front with weight forward lifts the rear (pitch ${minP.toFixed(2)}${b.crashed ? ", " + b.crashed : ""})`);
}

console.log("cornering");
for (const n of ["sport", "cruiser", "dirt", "mtb", "scooter", "tourer"]) {
  const v0 = n === "mtb" || n === "scooter" ? 9 : 20;
  let maxLean = 0;
  const { b } = run(n, 6, (t, bk) => ({ throttle: clamp01((v0 - bk.u) * 0.3 + 0.15), front: 0, rear: 0, steer: t > 0.5 ? 1 : 0, weight: 0 }), flat, v0, (t, bk) => { maxLean = Math.max(maxLean, bk.lean); });
  const R = b.u / Math.max(1e-3, Math.abs(b.r));
  ok(!b.crashed && maxLean > 0.3, `${n}: full lean at ${(v0 * 3.6).toFixed(0)} km/h holds (lean ${(maxLean * 57.3).toFixed(0)} deg, radius ${R.toFixed(0)} m, tan check ${(Math.tan(b.lean) * 9.81).toFixed(1)} vs ${(b.u * b.r).toFixed(1)} m/s2${b.crashed ? ", " + b.crashed : ""})`);
}
{
  // leaned over on a dry road, then a wet painted line: the front goes
  const slick = { ground: () => 0, grip: (x, z) => ({ mu: Math.hypot(x, z) > 60 ? 0.35 : 1, dirt: false }) };
  const { b } = run("sport", 10, (t, bk) => ({ throttle: 0.3, front: 0, rear: 0, steer: t > 0.3 ? 1 : 0, weight: 0 }), slick, 22);
  ok(b.crashed === "lowside", `sport: leaned over onto a slick patch lowsides (${b.crashed || "rode it"})`);
}
{
  // steering into a turn and back out: counter-steer, the bike goes where it leans
  let minR = 0;
  const { b } = run("sport", 4, (t) => ({ throttle: 0.3, front: 0, rear: 0, steer: t < 1.5 ? -1 : 0, weight: 0 }), flat, 15, (t, bk) => { minR = Math.min(minR, bk.lean); });
  ok(!b.crashed && minR < -0.3 && Math.abs(b.lean) < 0.15, `sport: leans left and stands back up (min lean ${(minR * 57.3).toFixed(0)} deg, end ${(b.lean * 57.3).toFixed(0)} deg)`);
}

console.log("jumps");
// a kicker 8 m long rising 2.2 m (curved up to about 29 degrees at the lip), a 12 m gap, then a landing as high as the lip, 30 degrees down
function jumpWorld(rise, gapLen) {
  const k0 = 40, kL = 8, k1 = k0 + kL, l0 = k1 + gapLen, lTop = rise, lLen = 2 * lTop / Math.tan(0.52), l1 = l0 + lLen;
  return {
    grip: () => ({ mu: 1, dirt: true }),
    ground: (x, z, refY) => {
      let y = 0;
      if (z > k0 && z < k1) { const t = (z - k0) / kL; y = rise * t * t; }
      if (z >= l0 && z < l1) { const t = (z - l0) / lLen; y = lTop * (1 - t) * (1 - t); }
      return y;
    }, k1, l0, l1
  };
}
const holdAt = v => (t, bk) => ({ throttle: bk.air ? 0.3 : (bk.u < v ? 1 : 0.2), front: 0, rear: 0, steer: 0, weight: bk.air ? clampN((bk.pitch + 0.45) * 1.5 + bk.q * 0.6) : 0 });
{
  const W = jumpWorld(2.2, 15);
  let air = 0, maxY = 0;
  const { b, ev } = run("dirt", 8, holdAt(12), W, 12, (t, bk) => { if (bk.air) air += 1 / 60; maxY = Math.max(maxY, bk.y); });
  const land = ev.find(e => e.type === "land");
  ok(air > 0.8 && land && !b.crashed && b.z > W.l1, `dirt: clears a 15 m gap at 43 km/h (air ${air.toFixed(2)} s, peak ${(maxY - 0.86).toFixed(1)} m, landing ${land ? land.impact.toFixed(1) : "-"} m/s into the slope${b.crashed ? ", " + b.crashed : ""})`);
}
{
  const W = jumpWorld(2.2, 15);
  const { b } = run("dirt", 8, holdAt(8), W, 8);
  ok(!!b.crashed, `dirt: too slow, it cases the landing (${b.crashed || "no crash"})`);
}
{
  // too fast: it flies over the landing to the flat
  const W = jumpWorld(2.2, 15);
  const { b } = run("dirt", 8, holdAt(16), W, 16);
  ok(!!b.crashed, `dirt: too fast, it overshoots to the flat (${b.crashed || "no crash"})`);
}
{
  // throttle in the air lifts the nose, the rear brake drops it
  const W = jumpWorld(2.4, 18);
  let pThr = null, pBrk = null;
  run("dirt", 3, (t, bk) => ({ throttle: bk.air ? 1 : (bk.u < 15 ? 1 : 0.3), front: 0, rear: 0, steer: 0, weight: 0 }), W, 15, (t, bk) => { if (bk.air && bk.airT > 0.4 && pThr === null) pThr = bk.q; });
  run("dirt", 3, (t, bk) => ({ throttle: bk.air ? 0 : (bk.u < 15 ? 1 : 0.3), front: 0, rear: bk.air ? 1 : 0, steer: 0, weight: 0 }), W, 15, (t, bk) => { if (bk.air && bk.airT > 0.4 && pBrk === null) pBrk = bk.q; });
  ok(pThr !== null && pBrk !== null && pThr > pBrk + 0.3, `dirt: in the air, throttle pitches the nose up and the rear brake drops it (pitch rate ${pThr && pThr.toFixed(2)} vs ${pBrk && pBrk.toFixed(2)} rad/s)`);
}
{
  // a flat drop from 4 m onto flat ground on a road bike bottoms out and crashes
  const W = { grip: () => ({ mu: 1, dirt: false }), ground: (x, z) => (z < 30 ? 4 : 0) };
  const { b } = run("sport", 5, () => ({ throttle: 0.2, front: 0, rear: 0, steer: 0, weight: 0 }), W, 12);
  ok(!!b.crashed, `sport: off a 4 m ledge onto flat tarmac it does not survive (${b.crashed || "no crash"})`);
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function clampN(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
