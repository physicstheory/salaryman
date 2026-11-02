// Skydiving: the numbers a jumper would check. node Engine/tests/skydive.test.mjs [-v]
import { Skydiver, CANOPY_SPECS, airDensity } from "../src/skydive/Skydiver.js";
import { WindField } from "../src/skydive/Wind.js";

const V = process.argv.includes("-v");
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };
const calm = () => { const w = new WindField({ weather: "clear" }); w.u10 = 0; w.gust = 0; return w; };
function fly(o, secs, inpF, onStep) {
  const s = new Skydiver({ canopy: o.canopy || "sport", wind: o.wind || calm(), ground: o.ground || (() => 0), wall: o.wall, random: o.random });
  s.exit({ pos: { x: 0, y: o.y === undefined ? 1500 : o.y, z: 0 }, vel: o.vel || { x: 0, y: 0, z: 0 }, yaw: 0, from: o.from || "aircraft" });
  let t = 0; const ev = [];
  while (t < secs && s.phase !== "landed") { s.step(1 / 60, inpF ? inpF(t, s) : {}).forEach(e => ev.push(Object.assign({ t }, e))); if (onStep) onStep(t, s); t += 1 / 60; }
  return { s, ev, t };
}
const kmh = v => v * 3.6;
// terminal speeds at about 1,000 m (density ~1.11)
const term = (inp) => { let v = 0; fly({ y: 2500 }, 40, () => inp, (t, s) => { if (Math.abs(t - 35) < 0.01) v = s.airspeed; }); return kmh(v); };
console.log("freefall");
const box = term({}), spread = term({ pitch: -1 }), dive = term({ pitch: 1, dive: true });
ok(box > 185 && box < 215, "box terminal ~195 km/h (" + box.toFixed(0) + ")");
ok(spread < box - 15, "spread is slower (" + spread.toFixed(0) + ")");
ok(dive > 270, "head down is fast (" + dive.toFixed(0) + ")");
{ let g = 0; fly({ y: 2500 }, 40, () => ({ pitch: 1 }), (t, s) => { if (Math.abs(t - 35) < 0.01) g = Math.hypot(s.vel.x, s.vel.z) / -s.vel.y; }); ok(g > 0.8 && g < 1.6, "tracking glides about 1:1 (" + g.toFixed(2) + ")"); }
{ let d = 0; fly({ y: 2500 }, 40, () => ({}), (t, s) => { if (Math.abs(t - 35) < 0.01) d = Math.hypot(s.vel.x, s.vel.z); }); ok(d < 6, "a box falls nearly straight down (" + d.toFixed(1) + " m/s drift)"); }
{ const r = fly({ y: 2500 }, 10, () => ({ turn: 1 })); ok(r.s.yawRate < -1.2, "turns at speed (" + r.s.yawRate.toFixed(2) + " rad/s)"); }
{ const r = fly({ from: "building", y: 300, vel: { x: 0, y: 0, z: 2 } }, 3, () => ({ turn: 1 })); ok(r.s.upright > 0.05 && Math.abs(r.s.yawRate) < 1.2, "off a roof, little control for the first seconds"); }
ok(airDensity(3000) < 0.8 * airDensity(0), "thinner air up high");
console.log("deployment");
for (const c of ["sport", "base"]) {
  let open = null, a0 = 0;
  const r = fly({ canopy: c, y: 2500 }, 60, (t) => ({ deploy: t > 20 && t < 20.02 }), (t, s) => { if (!a0 && t >= 20) a0 = s.pos.y; if (!open && s.phase === "canopy") open = { t: t - 20, lost: a0 - s.pos.y, g: s.maxG }; });
  if (V) console.log(c, JSON.stringify(open));
  if (c === "sport") { ok(open && open.g > 2.5 && open.g < 5.5, "sport opening shock 2.5-5.5 g (" + (open && open.g.toFixed(1)) + ")"); ok(open && open.t > 2.5 && open.t < 8, "takes a few seconds (" + (open && open.t.toFixed(1)) + " s)"); }
  else ok(open && open.t < 2.5, "a slider-off BASE canopy bangs open at terminal (" + (open && open.t.toFixed(1)) + " s, " + (open && open.g.toFixed(1)) + " g)");
  void r;
}
{ let open = null; fly({ canopy: "base", from: "building", y: 150, vel: { x: 0, y: 0, z: 3 } }, 30, (t) => ({ deploy: t > 1 && t < 1.02 }), (t, s) => { if (!open && s.phase === "canopy") open = { y: s.pos.y, g: s.maxG }; });
  ok(open && open.y > 80, "BASE off 150 m with a one-second delay is open by " + (open && open.y.toFixed(0)) + " m"); ok(open && open.g < 6, "and gently (" + (open && open.g.toFixed(1)) + " g)"); }
{ const r = fly({ canopy: "base", y: 2500, random: () => 0.99 }, 60, (t) => ({ deploy: t > 20 && t < 20.02, pitch: 1, dive: true, turn: 1 })); ok(r.ev.some(e => e.type === "linestretch" && e.twists > 0), "deploying head down and spinning gives line twists"); }
console.log("canopy");
const canopy = (c, inpF, secs = 25) => { const r = fly({ canopy: c, y: 400 }, 5 + secs, (t, s) => Object.assign({ deploy: t < 0.02 }, s.phase === "canopy" ? inpF(t, s) : {})); return r; };
for (const c of ["sport", "base"]) {
  let trim; const r = fly({ canopy: c, y: 700, vel: { x: 0, y: -50, z: 0 } }, 40, (t) => ({ deploy: t < 0.02 }), (t, s) => { if (Math.abs(t - 30) < 0.01) trim = { v: s.airspeed, sink: -s.vel.y }; });
  ok(trim && trim.v > 9 && trim.v < 14.5 && trim.sink > 3.2 && trim.sink < 5.8, c + " trim " + (trim && kmh(trim.v).toFixed(0)) + " km/h, " + (trim && trim.sink.toFixed(1)) + " m/s down");
  void r;
  let fl = []; fly({ canopy: c, y: 700, vel: { x: 0, y: -50, z: 0 } }, 40, (t) => ({ deploy: t < 0.02, brakeL: t > 30 ? 1 : 0, brakeR: t > 30 ? 1 : 0 }), (t, s) => { if (t > 30 && t < 32) fl.push(-s.vel.y); });
  ok(Math.min(...fl) < 1.2, c + " flare takes the sink away (" + Math.min(...fl).toFixed(1) + " m/s)");
  let tr = { y0: 0, y1: 0, yaw: 0 }; fly({ canopy: c, y: 700, vel: { x: 0, y: -50, z: 0 } }, 40, (t) => ({ deploy: t < 0.02, brakeR: t > 30 ? 1 : 0 }), (t, s) => { if (Math.abs(t - 30) < 0.01) { tr.y0 = s.pos.y; tr.yaw = s.yaw; } if (Math.abs(t - 36) < 0.01) { tr.y1 = s.pos.y; tr.dy = s.yaw; } });
  ok(tr.y0 - tr.y1 > 25, c + " a hard turn costs height (" + (tr.y0 - tr.y1).toFixed(0) + " m in 6 s)");
  let st = []; fly({ canopy: c, y: 700, vel: { x: 0, y: -50, z: 0 } }, 50, (t) => ({ deploy: t < 0.02, brakeL: t > 30 ? 1 : 0, brakeR: t > 30 ? 1 : 0 }), (t, s) => { if (s.stalled) st.push(t); });
  ok(st.length > 0, c + " held in full brakes, it stalls");
}
{ // landings: unflared vs flared
  const land = (flare) => fly({ canopy: "base", y: 300, vel: { x: 0, y: -40, z: 0 } }, 120, (t, s) => ({ deploy: t < 0.02, brakeL: flare && s.phase === "canopy" && s.altitude < 4.5 ? 1 : 0, brakeR: flare && s.phase === "canopy" && s.altitude < 4.5 ? 1 : 0 })).s.landed;
  const a = land(false), b = land(true);
  ok(a && (a.quality === "hard" || a.quality === "good"), "unflared landing is " + (a && a.quality));
  ok(b && (b.quality === "perfect" || b.quality === "good") && b.sink < a.sink, "flared at 4.5 m it is " + (b && b.quality) + " (" + (b && b.sink.toFixed(1)) + " m/s down)");
}
{ const r = fly({ from: "building", y: 120, vel: { x: 0, y: 0, z: 2 } }, 30); ok(r.s.landed && r.s.landed.quality === "fatal", "120 m with no parachute is fatal (" + kmh(r.s.landed.speed).toFixed(0) + " km/h)"); }
{ // a wall: freefall into a building face
  const wall = (x, y, z, r) => (z > 30 - r ? { nx: 0, nz: -1 } : null);
  const r = fly({ y: 300, vel: { x: 0, y: 0, z: 0 } }, 20, () => ({ pitch: 1 }), null);
  void r;
  const r2 = fly({ y: 300, vel: { x: 0, y: 0, z: 0 }, wall: wall }, 20, () => ({ pitch: 1 }));
  ok(r2.ev.some(e => e.type === "wall"), "tracking into a wall hits it");
}
console.log("wind");
{ const w = new WindField({ weather: "rain", dir: 0 }); let lo = 0, hi = 0; for (let t = 0; t < 120; t += 0.5) { lo += Math.hypot(w.sample(0, 5, 0, t, 0).x, w.sample(0, 5, 0, t, 0).z); hi += Math.hypot(w.sample(0, 300, 0, t, 0).x, w.sample(0, 300, 0, t, 0).z); } ok(hi > lo * 1.6, "wind is stronger high up (" + (lo / 240).toFixed(1) + " -> " + (hi / 240).toFixed(1) + " m/s)"); }
{ const b = [{ cx: 0, cz: 0, hw: 20, hl: 20, yaw: 0, base: 0, top: 200 }];
  const w = new WindField({ weather: "rain", dir: 0, obstacles: () => b }); w.gust = 0;
  const free = new WindField({ weather: "rain", dir: 0 }); free.gust = 0;
  const lee = w.sample(0, 100, 60, 10, 0), open = free.sample(0, 100, 60, 10, 0);
  ok(Math.hypot(lee.x, lee.z) < 0.6 * Math.hypot(open.x, open.z), "slow in a tower's wake (" + Math.hypot(lee.x, lee.z).toFixed(1) + " vs " + Math.hypot(open.x, open.z).toFixed(1) + ")");
  const face = w.sample(0, 185, -24, 10, 0); ok(face.y > 1, "up the windward face near the top (" + face.y.toFixed(1) + " m/s)");
  const low = w.sample(0, 40, -24, 10, 0); ok(low.y < -0.5, "down the windward face lower down (" + low.y.toFixed(1) + " m/s)");
  const roof = w.sample(0, 205, -10, 10, 0); ok(roof.y > 0.8, "lifting over the windward edge of the roof (" + roof.y.toFixed(1) + " m/s)"); }
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);
