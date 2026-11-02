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
for (let i = 0; i < 90; i++) { if (/titleup/.test(await ev(() => document.body.className))) break; await wait(5000); }
await wait(3000);
await page.keyboard.press("Enter");
for (let i = 0; i < 60; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await wait(3000); }
await wait(4000);
await ev(() => { const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); });
await wait(4000);






await ev(() => { document.body.classList.add("camfull"); cheat("MIDDAY"); });
const ok = (name, v, extra) => console.log(v ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
for (let i = 0; i < 60; i++) { if (await ev(() => !!player.hq)) break; await wait(2000); }
ok("Seiko in high detail", await ev(() => !!player.hq), await ev(() => Object.keys(player.clips || {}).join(",")));
// Seiko, from the front and from behind, in the city
await ev(() => { const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] - 14, 0, c.scramble.at[1] - 10)); player.yaw = player.targetYaw = 0; yaw = Math.PI; pitch = 0.05; pedsClear(); peds.spawnT = 999; });
await wait(4000); await snap("seiko_back");
await ev(() => { phone.open = true; phone.app = "Camera"; phone.zoom = 2; player.yaw = player.targetYaw = Math.PI; }); await wait(3000);
await ev(() => { const p = player.pos; placeSeiko(new THREE.Vector3(p.x, 0, p.z)); }); await wait(2000); await snap("seiko_front_camera");
await ev(() => { phone.open = false; phone.app = null; });
// the walk
await ev(() => { keys.KeyW = true; }); await wait(3000); await snap("seiko_walking"); await ev(() => { keys.KeyW = false; });
// buildings: look up at the office blocks
await ev(() => { pitch = 0.32; yaw += 3.1; }); await wait(4000); await snap("photo_facades_1");
await ev(() => { yaw += 1.6; pitch = 0.25; }); await wait(4000); await snap("photo_facades_2");
await ev(() => { cheatHour(21); }); await wait(4000); await snap("photo_facades_night");
await ev(() => { cheatHour(12); });
// skydiving: drop him from 1200 m over the city
await ev(() => { cheat("SKYDIVE"); }); await wait(4000);
const fl = await ev(() => flight.active);
if (fl) {
  await wait(1500); await ev(() => bailOut()); await wait(4000); await snap("freefall_arch");
  await ev(() => { keys.KeyW = true; }); await wait(3000); await snap("freefall_dive"); await ev(() => { keys.KeyW = false; });
  await ev(() => chuteOpen()); await wait(1500); await snap("canopy_opening");
  for (let i = 0; i < 20; i++) { if (await ev(() => chute.flying)) break; await wait(1500); }
  await wait(2000); await snap("canopy_flying");
  await ev(() => { keys.KeyD = true; }); await wait(4000); await snap("canopy_turn"); await ev(() => { keys.KeyD = false; });
  console.log("CHUTE " + JSON.stringify(await ev(() => ({ st: chute.state, fly: chute.flying, vy: +chute.vy.toFixed(1), hs: +chute.hs.toFixed(1), swing: +(chute.swing || 0).toFixed(2), clip: player.clipName }))));
  await ev(() => { chute.pos.y = chuteTop(chute.pos.x, chute.pos.z) + 12; keys.KeyS = true; }); for (let i = 0; i < 20; i++) { if (!(await ev(() => chute.active))) break; await wait(1000); } await ev(() => { keys.KeyS = false; });
  console.log("LANDED " + JSON.stringify(await ev(() => ({ active: chute.active, health: vitals.health }))));
}
// the airport from the air
await ev(() => { const a = world.airports.find(x => x.big); cheatGoAirport(); });
await wait(6000); await snap("airport_arrive");
await browser.close(); srv.close();
