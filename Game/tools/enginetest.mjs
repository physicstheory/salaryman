// Shigoto engine under the game: the engine starts, weather runs over the game's sky, and physics props land on the game's ground.
// (Header from lowtest2.mjs.) Air travel end to end: the expressway, the gate, the terminal (hall, ticket office, security, gate, cabin, in-flight screen), Seoul and the islands, and stealing an aircraft with the police and helicopters after you.
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
const ROOT = path.resolve(here, "../..");
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
page.on("console", m => { const t = m.text(); if (/street laid|\[Konto\]|\[Shigoto\]/.test(t)) console.log("LOG", t.slice(0, 200)); });
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
for (let i = 0; i < 80; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await ev(() => { if (typeof cut !== "undefined" && cut.active) cutFinish(true); }); await wait(3000); }
await wait(4000);
await ev(() => { let n = 0; while (typeof cut !== "undefined" && cut.active && n++ < 20) cutFinish(true); });
await wait(3000);
await ev(() => { let n = 0; while (typeof cut !== "undefined" && cut.active && n++ < 20) cutFinish(true); cheat("GOTOKONTO"); });
await wait(12000);
console.log("STATE", JSON.stringify(await ev(() => ({ cls: document.body.className, cut: cut.active, mode: player.mode, placed: player.placed }))));
if (0) await ev(() => { const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); });
await wait(4000);







await ev(() => { document.body.classList.add("camfull"); cheat("MIDDAY"); });
const ok = (name, v, extra) => console.log(v ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
await ev(() => { applyTier("low", { quiet: true }); syncQualityLabels(); });
await wait(6000);
const st = await ev(() => ({ on: !!(window.shigoto && shigoto.engine), failed: window.shigoto && shigoto.failed, stats: shigoto.engine && shigoto.engine.stats, adopted: shigoto.engine && shigoto.engine.surfaces.count }));
ok("engine running under the game", st.on, st);
await snap("engine_clear_midday");
await ev(() => { shigoto.weather("rain", true); }); await wait(9000);
await snap("engine_rain_midday");
await ev(() => { shigoto.engine.weather.wetness = 1; shigoto.engine.weather.puddles = 0.8; }); await wait(4000); await snap("engine_rain_soaked");
// props: a scatter of cones in front of Seiko should fall and come to rest on the game's ground
await ev(() => { shigoto.cones("cone", 8); shigoto.cones("bin", 4); shigoto.cones("crate", 5); }); await wait(12000);
const rest = await ev(() => { const e = shigoto.engine; return e.physics.dynamics.slice(-17).map(d => { const p = d.body.translation(); return [d.tag, +(p.y - world.surfaceY(p.x, p.z, 999)).toFixed(2), d.body.isSleeping()]; }); });
const bad = rest.filter(r => r[1] < -0.2 || r[1] > 1.5);
ok("props came to rest on the ground", rest.length && !bad.length, rest);
await snap("engine_props");
await ev(() => { cheat("MIDNIGHT"); shigoto.weather("storm", true); }); await wait(9000);
await ev(() => { shigoto.engine.weather.strike(400); }); await wait(300);
await snap("engine_storm_night");
await ev(() => { cheat("MIDDAY"); shigoto.weather("clear", true); });
console.log("STATS", JSON.stringify(await ev(() => shigoto.engine.stats)));
await browser.close(); srv.close();
