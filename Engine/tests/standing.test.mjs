// Unit tests for the standing engine (Honor, Respect). Run: node Engine/tests/standing.test.mjs
import assert from "assert/strict";
import { Honor, HONOR_TIERS } from "../src/standing/Honor.js";
import { Respect } from "../src/standing/Respect.js";

let t = 0; const now = () => t;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log("ok -", name); };

const DEEDS = {
  shooting: { delta: -12, label: "Shot someone", cooldown: 3, group: "violence", window: 60 },
  killing:  { delta: -25, label: "Killed someone", cooldown: 3, group: "violence", window: 90 },
  gun:      { delta: -3, label: "Fired", cooldown: 25, same: ["shooting", "killing"] },
  help:     { delta: 5, label: "Helped" }
};

ok("crime lowers honor and emits a red event", () => {
  t = 0; const h = new Honor({ deeds: DEEDS, start: 0, now }); const evs = []; h.on(e => evs.push(e));
  const e = h.deed("shooting");
  assert.equal(e.delta, -12); assert.equal(h.value, -12); assert.equal(evs.length, 1); assert.equal(evs[0].kind, "honor");
});
ok("the call about a crime is the same deed (cooldown)", () => {
  t = 0; const h = new Honor({ deeds: DEEDS, start: 0, now });
  h.deed("shooting"); t = 2; assert.equal(h.deed("shooting"), null); assert.equal(h.value, -12);
});
ok("gunfire right after a shooting is not counted twice (same)", () => {
  t = 0; const h = new Honor({ deeds: DEEDS, start: 0, now });
  h.deed("shooting"); t = 1; assert.equal(h.deed("gun"), null);
});
ok("a spree is damped but never free", () => {
  t = 0; const h = new Honor({ deeds: DEEDS, start: 0, now });
  const a = h.deed("shooting").delta; t = 10; const b = h.deed("shooting").delta; t = 20; const c = h.deed("shooting").delta;
  assert.ok(a < b && b < c && c < 0, [a, b, c].join(","));
});
ok("helping raises honor; repeating the same kindness is worth less", () => {
  t = 0; const h = new Honor({ deeds: DEEDS, start: 0, now });
  const a = h.deed("help").delta; t = 30; const b = h.deed("help").delta;
  assert.equal(a, 5); assert.ok(b > 0 && b < a);
  t = 2000; assert.equal(h.deed("help").delta, 5);
});
ok("honor is bounded and tiers follow it", () => {
  t = 0; const h = new Honor({ deeds: DEEDS, start: 0, now });
  for (let i = 0; i < 30; i++) { t += 200; h.deed("killing"); }
  assert.ok(h.value >= -100); assert.equal(h.tier().id, "disgraced");
  h.apply(500); assert.equal(h.value, 100); assert.equal(h.tier().id, HONOR_TIERS[HONOR_TIERS.length - 1].id);
});
ok("honor saves and loads", () => {
  const h = new Honor({ deeds: DEEDS, start: 33, now }); const s = JSON.parse(JSON.stringify(h.save()));
  const g = new Honor({ deeds: DEEDS, now }); g.load(s); assert.equal(g.value, 33);
});

const RANKS = [{ id: "outsider", name: "Job seeker", base: 0 }, { id: "agent", name: "CS", base: 10 }, { id: "floor_manager", name: "Floor manager", base: 24 }, { id: "president", name: "President", base: 90 }];
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

ok("promotion lifts the respect floor", () => {
  t = 0; const r = new Respect({ ranks: RANKS, now });
  assert.equal(r.value, 0); const e = r.setRank("floor_manager");
  assert.equal(r.value, 24); assert.equal(e.id, "promotion"); assert.equal(e.delta, 24);
  assert.equal(r.setRank("floor_manager"), null);
});
ok("a returned bow earns respect", () => {
  t = 0; const r = new Respect({ ranks: RANKS, now, random: seq(0.01) });
  const res = r.greet("bow", { id: 1, temper: "polite", standing: 0.2 });
  assert.ok(res.reply === "deep" || res.reply === "bow"); assert.ok(r.value > 0);
});
ok("bowing to the same person again is odd", () => {
  t = 0; const r = new Respect({ ranks: RANKS, now, random: seq(0.01) });
  r.greet("bow", { id: 1 }); t = 5; assert.equal(r.greet("bow", { id: 1 }).reply, "puzzled");
});
ok("antagonising loses respect; again on the meek is harassment", () => {
  t = 0; const r = new Respect({ ranks: RANKS, rank: "floor_manager", now, random: seq(0.9) });
  const a = r.greet("antagonize", { id: 2, temper: "meek" }); assert.equal(a.reply, "flinch"); assert.ok(r.value < 24);
  t = 5; const b = r.greet("antagonize", { id: 2, temper: "meek" }); assert.equal(b.reply, "flee"); assert.equal(b.harass, true);
});
ok("a proud man backs down from someone far above him", () => {
  t = 0; const r = new Respect({ ranks: RANKS, rank: "president", now, random: seq(0.1) });
  assert.equal(r.greet("antagonize", { id: 3, temper: "proud", standing: 0.3 }).reply, "backsdown");
});
ok("courtesy and rank make strangers bow first", () => {
  t = 0; const r = new Respect({ ranks: RANKS, now, random: seq(0.5) });
  const before = r.bowChance({ temper: "polite", standing: 0.3 });
  r.setRank("floor_manager");
  for (let i = 0; i < 15; i++) { t += 3; r.greet("bow", { id: 100 + i, temper: "polite" }); }
  const after = r.bowChance({ temper: "polite", standing: 0.3 });
  assert.ok(after > before + 0.15, before + " -> " + after);
  t += 3600; assert.ok(r.bowChance({ temper: "polite", standing: 0.3 }) < after, "courtesy decays");
});
ok("respect saves and loads", () => {
  const r = new Respect({ ranks: RANKS, rank: "agent", earned: 7, now }); const g = new Respect({ ranks: RANKS, now });
  g.load(JSON.parse(JSON.stringify(r.save()))); assert.equal(g.value, 17); assert.equal(g.rankId, "agent");
});
console.log(n + " standing tests passed");
