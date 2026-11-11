// Realism engine tests: a synthetic city of ~9,000 plots (wards of houses, flats, offices, shops, parks, a shrine, schools),
// built, then asked about. Run: node Engine/tests/realism.test.mjs
import assert from "node:assert/strict";
import { RealismEngine } from "../src/realism/Realism.js";
import { Calendar, holidays } from "../src/realism/Calendar.js";

let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log("  ok  " + name); };

// ---- a city ----
function city(seed) {
  const plots = [], stations = [];
  const districts = ["House", "Suburb", "Station", "Retail", "Core", "Office", "Night", "House", "Suburb", "House"];
  let id = 0;
  for (let gx = 0; gx < 30; gx++) for (let gz = 0; gz < 30; gz++) {
    const ward = gx * 30 + gz, district = districts[(gx * 7 + gz * 3) % districts.length];
    const cx = gx * 160, cz = gz * 160;
    for (let k = 0; k < 10; k++) {
      const r = ((ward * 31 + k * 17) % 100) / 100;
      let kind;
      if (district === "House" || district === "Suburb") kind = r < 0.62 ? "houses" : r < 0.75 ? "flats" : r < 0.85 ? "shop" : r < 0.92 ? "park" : r < 0.96 ? "civic" : "shrine";
      else if (district === "Core" || district === "Office") kind = r < 0.55 ? "office" : r < 0.65 ? "tower" : r < 0.85 ? "shop" : r < 0.95 ? "midrise" : "civic";
      else kind = r < 0.55 ? "shop" : r < 0.75 ? "midrise" : r < 0.88 ? "flats" : r < 0.95 ? "office" : "park";
      const floors = kind === "houses" ? 2 : kind === "flats" ? 5 + (k % 6) : kind === "tower" ? 30 : kind === "office" ? 8 + (k % 8) : kind === "midrise" ? 5 : kind === "shop" ? 2 : 1;
      plots.push({ id: id++, kind, x: cx + (k % 5) * 30, z: cz + Math.floor(k / 5) * 60, w: kind === "houses" ? 12 : 24, d: kind === "houses" ? 12 : 22, yaw: 0, floors, ward, district, city: gx < 15 ? 0 : 1 });
    }
    if (gx % 5 === 2 && gz % 5 === 2) stations.push({ x: cx + 60, z: cz + 60, name: "St " + ward });
  }
  return { plots, stations };
}

const { plots, stations } = city(1);
const t0 = performance.now();
const R = new RealismEngine({ seed: 1964 }).build(plots, stations);
const buildMs = performance.now() - t0;
const st = R.stats();
console.log("realism: " + plots.length + " plots -> " + st.people + " people in " + st.households + " households, " + st.employed + " with a job or school, built in " + Math.round(buildMs) + " ms");

test("builds a whole population quickly", () => {
  assert.ok(st.people > 20000, "people " + st.people);
  assert.ok(buildMs < 4000, "build " + buildMs + " ms");
  assert.ok(st.byRole.salaryman > 1000 && st.byRole.retiree > 1000 && st.byRole.schoolchild > 500, JSON.stringify(st.byRole));
});

test("calendar: weekdays, Golden Week, substitute holidays, payday", () => {
  const cal = new Calendar();
  assert.equal(cal.info(0).weekday, "Monday");
  assert.equal(cal.info(5).weekend, true);
  const gw = cal.info(23);   // 29 April
  assert.equal(gw.d, 29); assert.ok(gw.holiday && gw.offWork);
  assert.ok(holidays(2026).get(406), "May 6 2026 is a substitute holiday (May 3 is a Sunday)");
  const pd = cal.info(19); assert.equal(pd.d, 25); assert.ok(!pd.payday, "25 April 2026 is a Saturday");
  assert.ok(cal.info(18).payday, "so payday is Friday the 24th");
});

test("every person's day is continuous and deterministic", () => {
  for (let k = 0; k < 400; k++) {
    const i = (k * 7919) % st.people;
    for (const day of [0, 4, 5, 23]) {
      const a = R.planner.build(i, day);
      let t = 240;
      for (const s of a.segs) { assert.ok(s.t0 >= t - 0.001, "gap/overlap for " + i + " on " + day + ": " + JSON.stringify(a.segs.map(x => [x.a, x.t0, x.t1]))); assert.ok(s.t1 > s.t0); t = s.t1; }
      assert.ok(t >= 1600, "day ends late: " + t);
    }
  }
  const R2 = new RealismEngine({ seed: 1964 }).build(plots, stations);
  for (const i of [3, 999, 12345]) assert.deepEqual(JSON.stringify(R2.planner.build(i, 2).segs), JSON.stringify(R.planner.build(i, 2).segs));
});

test("salarymen are at work at 11:00 on a weekday and home at 03:00, not at work on Sunday", () => {
  let at = 0, home = 0, sun = 0, n = 0;
  for (let i = 0; i < st.people && n < 600; i++) {
    if (R.census.role[i] !== 0 || R.census.work[i] < 0) continue; n++;
    if (R.whereAt(i, 660, 1).a === "work") at++;
    if (R.whereAt(i, 180, 2).a === "sleep") home++;
    if (R.whereAt(i, 660, 6).a === "work") sun++;
  }
  assert.ok(at / n > 0.85, "at work " + at / n); assert.ok(home / n > 0.85, "asleep " + home / n); assert.ok(sun / n < 0.05, "sunday " + sun / n);
});

test("rush hour fills the streets; three in the morning empties them", () => {
  const count = (min, day) => { let o = 0; for (let i = 0; i < st.people; i += 13) { const w = R.whereAt(i, min, day); if (w.a === "travel") o++; } return o; };
  const rush = count(490, 1), night = count(190, 2), noon = count(735, 1);
  console.log("        travelling (1 in 13): 08:10 " + rush + ", 12:15 " + noon + ", 03:10 " + night);
  assert.ok(rush > night * 5, "rush " + rush + " vs night " + night);
});

test("radio exercises in the park at 06:35, smoke breaks at 10:25, queues at noon", () => {
  const acts = (min, day) => { const c = {}; for (let i = 0; i < st.people; i += 3) { const a = R.whereAt(i, min, day).a; c[a] = (c[a] || 0) + 1; } return c; };
  const a = acts(395, 1), b = acts(632, 1), c = acts(725, 1);
  assert.ok(a.taiso > 20, "taiso " + a.taiso); assert.ok(b.smoke > 20, "smoke " + b.smoke); assert.ok((c.queue || 0) + (c.lunch || 0) > 50, "lunch " + JSON.stringify(c));
});

test("the local population: focus, tick in slices, people out with positions, scenes", () => {
  R.focus(2400, 2400);
  let passes = 0, guard = 0; const was = R.local.passes || 0;
  while ((R.local.passes || 0) === was && guard++ < 1000) R.tick(735, 1, 1);
  passes = R.local.passes;
  assert.ok(passes > was);
  const out = R.peopleOut(2400, 2400, 300);
  assert.ok(out.length > 10, "out " + out.length);
  for (const e of out) { assert.ok(Number.isFinite(e.x) && Number.isFinite(e.z)); }
  const sc = R.scenes(2400, 2400, 400);
  console.log("        near the middle at 12:15: " + R.local.ids.length + " local people, " + out.length + " out within 300 m, scenes: " + sc.map(s => s.kind + "×" + s.people.length).slice(0, 8).join(", "));
  const d = R.describe(out[0].i, 735, 1);
  assert.ok(d.name && d.job && d.doing, JSON.stringify(d));
  console.log("        e.g. " + d.line + " · " + d.doing);
});

test("tick stays inside its budget", () => {
  R.focus(800, 800);
  let worst = 0;
  for (let k = 0; k < 50; k++) { const a = performance.now(); R.tick(1000, 3, 2); worst = Math.max(worst, performance.now() - a); }
  assert.ok(worst < 8, "worst tick " + worst + " ms");
});

test("lit windows follow the people: homes fill in the evening and empty at night; offices empty on Sunday", () => {
  const ev = R.windowLife(1230, 1), late = R.windowLife(200, 2), noon = R.windowLife(780, 1), sun = R.windowLife(780, 6), ot = R.windowLife(1290, 1);
  console.log("        homes 20:30 " + ev.home.toFixed(2) + ", 03:20 " + late.home.toFixed(2) + "; offices noon " + noon.office.toFixed(2) + ", 21:30 " + ot.office.toFixed(2) + ", Sunday noon " + sun.office.toFixed(2));
  assert.ok(ev.home > 0.5 && late.home < 0.2, "homes");
  assert.ok(noon.office > 0.6 && sun.office < 0.15 && ot.office < noon.office && ot.office > 0.05, "offices");
});

test("houses: households, dressing and room lights", () => {
  const house = R.places.find(p => p.kind === "houses" && p.units);
  const hh = R.householdsAt(house);
  assert.ok(hh.length >= 1 && hh[0].members.length >= 1 && hh[0].surname);
  const dr = R.dressing(house, 600, 5);
  assert.ok(Array.isArray(dr.nameplates) && dr.nameplates.length === hh.length);
  const L = R.homeLights(hh[0].id, 1200, 1);
  assert.ok(typeof L.living === "boolean");
  const shop = R.places.find(p => p.purpose === "ramen");
  const s = R.placeState(shop, 725, 1);
  assert.ok(s.hours && typeof s.open === "boolean");
});

test("places keep hours: ramen shut at 09:00, konbini always open, banks shut on Sunday", () => {
  const cal = new Calendar();
  const ramen = R.places.filter(p => p.purpose === "ramen"), konbini = R.places.filter(p => p.purpose === "konbini"), bank = R.places.filter(p => p.purpose === "bank");
  assert.ok(ramen.every(p => !p.isOpen(540, cal.info(1))));
  assert.ok(konbini.every(p => p.isOpen(200, cal.info(1))));
  assert.ok(bank.every(p => !p.isOpen(600, cal.info(6))));
});

console.log(pass + " realism tests passed");
