// Checks the story data without the game: every mission 8-50 is there, every conversation a step names exists, every answer leads somewhere.
//   node Game/tools/saga-check.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import vm from "vm";
const here = path.dirname(fileURLToPath(import.meta.url)), WEB = path.resolve(here, "../../Web/game");
const missions = {}, incidents = {}, titles = {}, yk = { jobs: {}, raw: null };
const career = { office: { incidents, calls: {} }, on() {}, saga: { add(n, d) { d.n = n; missions[n] = d; titles[n] = d.title; }, ladder: [] }, yakuza: { add(id, d) { yk.jobs[id] = d; }, content(d) { yk.raw = d; } } };
const ctx = { window: { career, quest: { honor() {}, looks: {} } }, console, story: { m: 0 }, quest: { honor() {} }, advanceGameMinutes() {}, setGameTime() {}, gameMinutes: () => 0 };
ctx.window.window = ctx.window; vm.createContext(ctx);
for (const f of ["saga-content.js", "saga-content2.js", "yakuza-content.js"]) { const p = path.join(WEB, f); if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f }); }
let bad = 0; const fail = m => { bad++; console.log("FAIL " + m); };
const isLine = l => Array.isArray(l) && l.length === 3 && typeof l[1] === "string" && typeof l[2] === "string" && l[2].length > 0;
function checkTalk(where, nodes) {
  if (!nodes || !nodes.start) return fail(where + ": no start node");
  for (const [k, n] of Object.entries(nodes)) {
    if (!n.say && !n.lines) fail(where + "." + k + ": nothing said");
    if (!Array.isArray(n.opts) || !n.opts.length) { fail(where + "." + k + ": no answers"); continue; }
    n.opts.forEach((o, i) => { if (!o.t) fail(where + "." + k + "[" + i + "]: no text"); if (!o.end && !o.next) fail(where + "." + k + "[" + i + "]: leads nowhere"); if (o.next && !nodes[o.next]) fail(where + "." + k + "[" + i + "]: next '" + o.next + "' missing"); });
  }
}
function checkMission(id, d) {
  const fake = { flags: {}, rating: 3, late: false };
  if (d.kind === "floor") { (d.incidents || []).forEach(k => { if (!incidents[k]) fail(id + ": incident " + k + " missing"); }); if (!(d.incidents || []).length && !d.random) fail(id + ": an empty floor day"); return; }
  if (d.kind === "finale") return;
  if (d.brief) { if (d.kind === "yk" ? typeof d.brief !== "string" : !d.brief.every(isLine)) fail(id + ": bad brief line"); }
  else if (d.kind === "field" || d.kind === "meeting") fail(id + ": no brief");
  if (d.kind === "meeting" && !(d.talks && d.talks.meeting)) fail(id + ": meeting without talks.meeting");
  if (d.kind === "field" && !(d.steps && d.steps.length)) fail(id + ": field without steps");
  (d.steps || []).forEach((s, i) => {
    if (typeof s.talk === "string" && !(d.talks && d.talks[s.talk])) fail(id + " step " + i + ": talk '" + s.talk + "' missing");
    if (s.who && !(d.people && d.people[s.who])) fail(id + " step " + i + ": person '" + s.who + "' missing");
    if (s.office && typeof s.office !== "function" && !s.office.every(isLine)) fail(id + " step " + i + ": bad office line");
    if (!["go", "talk", "office", "say", "fn", "leave", "fight", "tail", "give"].some(k => s[k] !== undefined)) fail(id + " step " + i + ": unknown step " + Object.keys(s));
  });
  Object.entries(d.talks || {}).forEach(([k, n]) => checkTalk(id + ".talks." + k, n));
  for (const f of [{}, { x: 1 }]) if (d.debrief) { const ls = d.debrief(Object.assign({}, fake, { flags: new Proxy({}, { get: () => !!f.x }) })); if (!Array.isArray(ls) || !ls.every(isLine)) fail(id + ": bad debrief"); }
  if (d.promote && !(d.promo && d.promo.every(isLine))) fail(id + ": promotion without a scene");
}
for (let n = 8; n <= 50; n++) { if (!missions[n]) { fail("mission " + n + " missing"); continue; } checkMission("m" + n, missions[n]); }
Object.entries(incidents).forEach(([k, inc]) => { if (!inc.who || !inc.title || !inc.brief) fail("incident " + k + ": incomplete"); const ns = {}; Object.entries(inc.nodes).forEach(([a, n]) => { ns[a] = { lines: n.lines, opts: n.opts.map(o => ({ t: o.t, end: o.end || o.vip, next: o.next })) }; }); checkTalk("incident." + k, ns); });
Object.entries(yk.jobs).forEach(([k, d]) => checkMission("yakuza." + k, Object.assign({ kind: "yk" }, d)));
const promos = [10, 20, 30, 40].map(n => missions[n] && missions[n].promote);
if (promos.join() !== "section_chief,dept_head,director,md") fail("promotions at 10/20/30/40 are " + promos);
const kinds = {}; Object.values(missions).forEach(d => { kinds[d.kind] = (kinds[d.kind] || 0) + 1; });
if (!yk.jobs.sakazuki || !yk.jobs.tower) fail("the Kurogane-kai needs sakazuki and tower jobs");
console.log(Object.keys(missions).length + " story missions", JSON.stringify(kinds), "·", Object.keys(incidents).length, "new floor problems ·", Object.keys(yk.jobs).length, "Kurogane-kai jobs");
console.log(bad ? "FAILED: " + bad : "PASS");
process.exit(bad ? 1 : 0);
