// Holiday islands and the station map: every engine running on Seoul, the Kohana Islands and Ryūjima (built behind the loading screen,
// colliders, water, people, weather), and every station drawn on the map.
//   node Game/tools/holidaytest.mjs <out-dir>
// (Harness from airtravel.mjs.) Air travel end to end: the expressway, the gate, the terminal (hall, ticket office, security, gate, cabin, in-flight screen), Seoul and the islands, and stealing an aircraft with the police and helicopters after you.
// (Header copied from tour.mjs.) Walks the original game from the loading screen to a saved game and takes a screenshot of every screen on the way: loading, title, the start in
// Mizuho, the flat, every shop and activity, the capsule hotel, the pause menu tabs, the map, the phone apps, both wheels, and the autosave
// coming back through Continue after a reload.
//
//   node tools/tour.mjs <out-dir>
//
// Needs Playwright and a Chromium (CHROME=/path/to/chrome). It serves Web/ itself and answers the CDN requests from Game/vendor, so it runs
// offline. Under a software GPU it takes a long while; on a real one it is quick.

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "../../Web"), VENDOR = path.resolve(here, "../vendor");
const OUT = path.resolve(process.argv[2] || "tour");
fs.mkdirSync(OUT, { recursive: true });

let chromium;
try { ({ chromium } = await import("playwright")); }
catch (e) { const m = await import(process.env.PLAYWRIGHT || "playwright"); chromium = m.chromium || (m.default && m.default.chromium); }

const mime = { ".html": "text/html", ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".png": "image/png", ".js": "text/javascript", ".json": "application/json" };
const srv = http.createServer((q, r) => {
  let f = path.join(WEB, decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith(path.sep) || f === WEB) f = path.join(WEB, "konto.html");
  fs.readFile(f, (e, d) => {
    if (e) { r.statusCode = 404; r.end(); return; }
    r.setHeader("Content-Type", mime[path.extname(f)] || "application/octet-stream");
    r.end(d);
  });
}).listen(0);
const port = srv.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on("console", m => { const t = m.text(); if (/street laid|\[Konto\]/.test(t)) console.log("LOG", t.slice(0, 200)); });
page.on("pageerror", e => console.log("[pageerror]", String(e).slice(0, 200)));
await page.route("**/three.min.js", r => r.fulfill({ path: path.join(VENDOR, "three.min.js"), contentType: "text/javascript" }));
await page.route("**/GLTFLoader.js", r => r.fulfill({ path: path.join(VENDOR, "GLTFLoader.js"), contentType: "text/javascript" }));
await page.route("**/RGBELoader.js", r => r.fulfill({ path: path.join(VENDOR, "RGBELoader.js"), contentType: "text/javascript" }));
await page.route(/fonts\.(googleapis|gstatic)/, r => r.abort());

let n = 0;
const wait = ms => page.waitForTimeout(ms);
const ev = (f, a) => page.evaluate(f, a);
async function snap(name) {
  const file = path.join(OUT, String(++n).padStart(2, "0") + "_" + name + ".png");
  try { await page.screenshot({ path: file, timeout: 240000 }); console.log("saved", file); }
  catch (e) { console.log("shot failed", name, String(e).slice(0, 80)); }
}
async function step(name, fn) { try { await fn(); } catch (e) { console.log("step failed", name, String(e).slice(0, 160)); } }


await page.goto(`http://localhost:${port}/konto.html`);
for (let i = 0; i < 160; i++) { if (/titleup/.test(await ev(() => document.body.className)) && await ev(() => !!(PERSIST.engine && PERSIST.engine.done))) break; await wait(5000); }
await wait(3000);
await page.keyboard.press("Enter");
for (let i = 0; i < 60; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await wait(3000); }
await wait(4000);
await ev(() => { const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); });
await wait(4000);






const ok = (name, v, extra) => console.log(v ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
const rep = await ev(() => { const P = PERSIST.engine; const r = P && P.report ? P.report : null; return { summary: P && P.summary ? P.summary() : null, sites: DEST.sites.map(s => ({ id: s.id, built: s.built, solids: s.solids.length, walks: (s.pedRoads || []).length })) }; });
console.log("PERSIST", JSON.stringify(rep).slice(0, 3000));
ok("every holiday island built behind the loading screen", rep.sites.length === 3 && rep.sites.every(s => s.built && s.walks > 0), rep.sites);
const cov = await ev(() => shigoto.bridge ? shigoto.bridge.coverage() : null);
ok("every solid (islands included) has a collider", cov && cov.covered === cov.solids, cov);
// stations on the map, at the opening zoom
const st = await ev(() => { let n = 0; world.cities.forEach(c => n += c.stations.length); nav.mapZoom = 1; const across = mapAcross(); const pois = mapPois(across).filter(p => p.kind === "Station").length; return { n, pois, across: Math.round(across) }; });
ok("every station is a map point at the opening zoom", st.pois === st.n && st.n > 0, st);
await ev(() => { const c = document.createElement("canvas"); c.width = 1600; c.height = 1000; c.id = "probe"; document.body.appendChild(c); });
for (const [nm, ac] of [["island", 13000], ["city", 3500], ["close", 1200]]) {
  const data = await ev(([ac]) => { const c = document.getElementById("probe"), g = c.getContext("2d"), s = world.cities[0].stations[0]; drawMapView(g, 1600, 1000, ac > 9000 ? WORLD_X / 2 : s.centre[0], ac > 9000 ? WORLD_Z / 2 : s.centre[1], ac, 0, {}); return c.toDataURL("image/png"); }, [ac]);
  fs.writeFileSync(path.join(OUT, "map_" + nm + ".png"), Buffer.from(data.split(",")[1], "base64"));
}
await ev(() => { const c = document.getElementById("probe"); if (c) c.remove(); if (typeof cutFinish === "function") cutFinish(true); });
await wait(8000);
console.log("STATE", JSON.stringify(await ev(() => ({ placed: player.placed, title: title.on, cut: typeof cut !== "undefined" && cut.active, story: story.step, interior: interior.active }))));
for (const id of ["kohana", "ryujima", "seoul"]) {
  await ev(id => { destArrive(id); }, id);
  await wait(25000);
  const r = await ev(id => {
    const s = DEST.by[id], e = shigoto.engine, near = peds.list.filter(p => Math.abs(p.x - s.cx) < s.hx && Math.abs(p.z - s.cz) < s.hz).length;
    const b = s.solids.find(q => q.h > 5) || s.solids[0];
    const hit = e && e.physics.raycast([b.c[0], b.y + b.h + 30, b.c[1]], [0, -1, 0], 200);
    const g = e && e.physics.raycast([s.spawn[0], s.h(s.spawn[0] - s.cx, s.spawn[1] - s.cz) + 40, s.spawn[1]], [0, -1, 0], 200);
    return { root: worldRoot.visible, placed: player.placed, at: [Math.round(player.pos.x - s.cx), Math.round(player.pos.y), Math.round(player.pos.z - s.cz)], active: DEST.active && DEST.active.id, peds: near, seaParent: water.sea && water.sea.parent === scene, seaVisible: !!(water.sea && water.sea.visible), oldSea: !!(DEST.sea && DEST.sea.visible),
      roof: hit ? +(hit.point[1] - (b.y + b.h)).toFixed(1) : null, ground: g ? +(g.point[1] - s.h(s.spawn[0] - s.cx, s.spawn[1] - s.cz)).toFixed(1) : null, weather: e && e.weather.state, indoors: e && e.weather.indoors, std: (() => { let n = 0, l = 0; s.group.traverse(o => { if (o.isMesh && o.material && !Array.isArray(o.material)) { if (o.material.isMeshStandardMaterial) n++; else if (o.material.isMeshLambertMaterial) l++; } }); return { n, l }; })(),
      honor: typeof standing !== "undefined" ? Object.keys(standing).slice(0, 6) : null };
  }, id);
  console.log("ISLAND", id, JSON.stringify(r));
  ok(id + ": active, sea engine kept, colliders on buildings and ground", r.active === id && r.seaParent && r.seaVisible && !r.oldSea && r.roof !== null && Math.abs(r.roof) < 1.5 && r.ground !== null && Math.abs(r.ground) < 2, r);
  ok(id + ": people walking", r.peds > 0, r.peds);
  await ev(() => shigoto.weather("storm", true));
  await wait(8000);
  await snap(id + "_storm");
  await ev(() => shigoto.weather("clear", true));
}
await ev(() => { const c = world.cities[0]; DEST.active = null; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); });
await wait(8000);
ok("back home: mainland shown, sea back in the world", await ev(() => worldRoot.visible && water.sea.parent === worldRoot));
await browser.close(); srv.close(); process.exit(0);
