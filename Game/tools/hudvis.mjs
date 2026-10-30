// HUD: the GTA V-style radar walking, driving and wanted, and the monotone pause menu's pages, at a high-density viewport.
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("console", m => { const t = m.text(); if (/street laid|\[Konto\]/.test(t)) console.log("LOG", t.slice(0, 200)); });
page.on("console", m => { const t = m.text(); if (m.type() === "error" && !/toNonIndexed|Failed to load|CORS/.test(t)) console.log("CERR", t.slice(0, 600)); });
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









await ev(() => { cheat("MIDDAY"); const c = world.cities[0]; cheatGo([c.scramble.at[0] + 12, c.scramble.at[1] + 12], 0.6); });
await wait(12000); await snap("radar_walk");
await ev(() => { const c = world.cities[0], L = c.streetPlan[Math.floor(c.streetPlan.length * 0.4)], r = L.runs[0], p = L.pt((r[0] + r[1]) / 2); cheatGo([p[0], p[1]], 0.3); });
await wait(9000); await page.screenshot({ path: path.join(OUT, "radar_suburb_crop.png"), clip: { x: 0, y: 440, width: 420, height: 280 } });
await page.screenshot({ path: path.join(OUT, "radar_walk_crop.png"), clip: { x: 0, y: 440, width: 420, height: 280 } });
await ev(() => { cheat("RYDECAR"); }); await wait(4000); await ev(() => { keys.KeyW = true; }); await wait(6000);
await page.screenshot({ path: path.join(OUT, "radar_drive_crop.png"), clip: { x: 0, y: 440, width: 420, height: 280 } });
await ev(() => { keys.KeyW = false; cheat("WANTED"); }); await wait(5000);
await page.screenshot({ path: path.join(OUT, "radar_wanted_crop.png"), clip: { x: 0, y: 440, width: 420, height: 280 } });
await ev(() => { cheat("CLEANSLATE"); leaveCar && leaveCar(); }); await wait(2000);
for (const tab of ["map", "game", "stats", "radio", "settings"]) { await ev(t => setPaused(true, t), tab); await wait(3500); await snap("pause_" + tab); }
await ev(() => setPaused(false)); await wait(1000);
await browser.close(); srv.close();
