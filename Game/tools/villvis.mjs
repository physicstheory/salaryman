// Villages and PC modes: Mizuho and Isobe beyond the mountains (paddies, stream, gardens), Seiko's village clothes, both PC modes' fps.
// Air travel end to end: the expressway, the gate, the terminal (hall, ticket office, security, gate, cabin, in-flight screen), Seoul and the islands, and stealing an aircraft with the police and helicopters after you.
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
catch (e) { ({ chromium } = await import(process.env.PLAYWRIGHT || "playwright")); }

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
for (let i = 0; i < 90; i++) { if (/titleup/.test(await ev(() => document.body.className))) break; await wait(5000); }
await wait(3000);
await page.keyboard.press("Enter");
for (let i = 0; i < 60; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await wait(3000); }
await wait(4000);
await ev(() => { const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); });
await wait(4000);







const ok = (name, v, extra) => console.log(v ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
await ev(() => { document.body.classList.add("camfull"); cheat("MIDDAY"); });
for (let i = 0; i < 60; i++) { if (await ev(() => !!player.hq && pplLib.ready.length > 5)) break; await wait(2000); }
const info = await ev(() => world.cities.filter(c => c.site.village).map(c => { const T = world.cities[0]; const V = c.village || {paddies:[],stream:[],gardens:[]}; return { name: c.name, x: Math.round(c.centre[0]), z: Math.round(c.centre[1]), toCapital: Math.round(Math.hypot(c.centre[0]-T.centre[0], c.centre[1]-T.centre[1])), paddies: V.paddies.length, stream: V.stream.length, gardens: V.gardens.length, plots: c.plots.length }; }));
console.log("VILLAGES " + JSON.stringify(info));
ok("two villages with paddies", info.length === 2 && info.every(v => v.paddies > 20), info.map(v => v.paddies));
ok("villages far from Tokonto", info.every(v => v.toCapital > 3000), info.map(v => v.toCapital));
// new game outfit
await ev(() => { player.outfitWant = "village"; seikoOutfit("village", true); });
for (let i = 0; i < 20; i++) { await wait(1500); if (await ev(() => player.outfit === "village")) break; }
ok("village clothes", await ev(() => player.outfit === "village"));
for (const nm of ["Mizuho", "Isobe"]) {
  await ev(nm => { const c = world.cities.find(x => x.name === nm); const p = c.village.paddies[Math.floor(c.village.paddies.length / 2)]; cheatGo([p.x, p.z], 0.6); pitch = 0.08; }, nm);
  await wait(9000); await snap(nm + "_paddies_ground");
  await ev(nm => { const c = world.cities.find(x => x.name === nm); const gd = c.village.gardens[0]; if (gd) { cheatGo([gd.x + 9, gd.z + 9], Math.PI * 1.25); pitch = 0.1; } }, nm);
  await wait(7000); await snap(nm + "_garden");
  await ev(nm => { const c = world.cities.find(x => x.name === nm); const q = c.village.stream[Math.floor(c.village.stream.length / 2)]; if (q) { cheatGo([q[0] + 8, q[1] + 8], Math.PI * 1.25); pitch = 0.12; } }, nm);
  await wait(7000); await snap(nm + "_stream");
  for (const [d, hgt, pt] of [[420, 190, -0.42], [160, 45, -0.22]]) {
    await ev(([nm, d, hgt, pt]) => { const c = world.cities.find(x => x.name === nm); const x = c.centre[0] + d, z = c.centre[1] + d; cheatGo([x, z], 0); setMode("fly"); camPos.set(x, world.sampleHeight(x, z) + hgt, z); yaw = Math.atan2(x - c.centre[0], z - c.centre[1]); pitch = pt; }, [nm, d, hgt, pt]);
    await wait(20000); await snap(nm + "_air_" + hgt);
  }
  await ev(() => { setMode("walk"); });
  await ev(nm => { const c = world.cities.find(x => x.name === nm); const r = c.roads[0]; const p = r.pts[Math.floor(r.pts.length / 2)]; cheatGo([p[0], p.length > 2 ? p[2] : p[1]], 0.3); pitch = 0.05; }, nm);
  await wait(12000); await snap(nm + "_street");
}
await ev(() => { const c = world.cities.find(x => x.name === "Mizuho"); const p = c.village.paddies[3]; cheatGo([p.x, p.z], 2.2); pitch = 0.05; });
await wait(6000); await snap("seiko_village_clothes");
for (const m of ["low", "high", null]) {
  await ev(m => pcModeApply(m, true), m); await wait(12000);
  const r = await ev(() => ({ mode: gameSet.pcMode, tier: gfx.tier, scale: +(gfx.scale || 0).toFixed(2), mult: +(perf.mult || 0).toFixed(2), w: renderer.domElement.width, h: renderer.domElement.height, people: pedWanted() }));
  console.log("PCMODE " + JSON.stringify(r)); await snap("pcmode_" + (m || "off"));
}
console.log("BUTTON " + await ev(() => { document.getElementById("mpcmode").click(); return document.getElementById("mpcmode").textContent + " / " + gameSet.pcMode; }));
await browser.close(); srv.close();
