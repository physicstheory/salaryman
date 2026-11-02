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
// bike: Shift + throttle lifts the front wheel
await ev(() => { cheat("SPORTBIKE"); }); await wait(4000);
await ev(() => { keys.KeyW = true; }); await wait(5000);
await ev(() => { keys.ShiftLeft = true; }); 
let th = 0, wh = false, rb = 0;
const origRumble = await ev(() => { window.__rb = 0; const r = rumble; window.rumble = function (a, b, ms) { window.__rb++; return r(a, b, ms); }; return true; });
for (let i = 0; i < 10; i++) { await wait(400); const st = await ev(() => ({ th: drive.car.theta || 0, wh: !!drive.car.wheelie })); th = Math.max(th, st.th); wh = wh || st.wh; }
await snap("bike_wheelie");
await ev(() => { keys.ShiftLeft = false; keys.KeyW = false; });
rb = await ev(() => window.__rb);
ok("Shift lifts the front wheel", th > 0.15 || wh, { th: th, wh: wh });
ok("riding sends rumble", rb > 0, rb);
// run somebody over
for (let i = 0; i < 30; i++) { await wait(1500); if (await ev(() => peds.list.length >= 3)) break; }
const hit = await ev(() => { const p = peds.list.find(q => q.state === "walk") || peds.list[0]; if (!p || !drive.car) return null; p.state = "idle"; p.idleFor = 99; p.t = 0;
  const a = Math.random() * 6.28; drive.car.pos.set(p.x - Math.sin(a) * 9, world.surfaceY(p.x, p.z) + 0.3, p.z - Math.cos(a) * 9); drive.car.yaw = a; drive.car.speed = 15; window.__v = p; return { n: peds.list.length }; });
for (let i = 0; i < 12; i++) { await wait(700); await ev(() => { if (drive.car && window.__v && window.__v.state !== "dead" && window.__v.state !== "down") { const p = window.__v; drive.car.yaw = Math.atan2(p.x - drive.car.pos.x, p.z - drive.car.pos.z); drive.car.speed = 15; } }); if (await ev(() => window.__v && (window.__v.state === "dead" || window.__v.state === "down"))) break; }
await snap("knocked_down");
const hv = await ev(() => ({ state: window.__v && window.__v.state, others: peds.list.map(p => p.state), stars: wanted.stars }));
ok("a car knocks a person down", hv.state === "dead" || hv.state === "down", hv);
await browser.close(); srv.close();
