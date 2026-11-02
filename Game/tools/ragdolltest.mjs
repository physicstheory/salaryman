// Ragdoll in the game: Seiko thrown on foot, off a dirt bike (loop-out), through the windscreen, and a pedestrian hit by a car.
//   PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.js node Game/tools/ragdolltest.mjs <out>
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
page.on("console", m => { const t = m.text(); if (/street laid|\[Konto\]|\[Shigoto\]|\[ragdoll\]/.test(t)) console.log("LOG", t.slice(0, 200)); });
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








await ev(() => { document.body.classList.add("camfull"); cheat("MIDDAY"); interiorLeave && interior.active && interiorLeave(true); });
const ok = (name, v, extra) => console.log(v ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
ok("ragdoll hook loaded", await ev(() => !!window.ragdoll));
const watch = async (label, secs) => { const seen = []; for (let i = 0; i < secs; i++) { const r = await ev(() => ({ s: ragdoll.report(), down: player.down, mode: player.mode, car: !!drive.car, h: vitals.health, pos: [player.pos.x, player.pos.y, player.pos.z].map(v => +v.toFixed(1)) })); seen.push(r.s.seiko || "-"); if (i === 1 || i === 3) await snap(label + "_" + i); if (!r.s.seiko && i > 2) { console.log(label, seen.join(">"), JSON.stringify(r)); return r; } await wait(1000); } console.log(label, "STILL DOWN", seen.join(">")); return null; };
// 1. on foot, thrown
ok("thrown on foot", await ev(() => ragdoll.test(10)));
const a = await watch("onfoot", 90); ok("Seiko got up after being thrown", a && a.down === 0 && a.mode === "walk", a);
// 2. on a dirt bike: loop it out
await ev(() => { cheat("DIRTBIKE"); });
await wait(4000);
const onBike = await ev(() => !!drive.car && TWO_WHEELERS[CAR_KINDS[drive.car.kind].body] === 1);
if (!onBike) await ev(() => { const i = drive.parked.findIndex(p => CAR_KINDS[p.kind].body === "dirtbike"); if (i >= 0) enterParked(i); });
await ev(() => { drive.car.speed = 9; });
await wait(500);
ok("loop-out throws him off", await ev(() => { drive.car.theta = 1.5; bikeCrash(drive.car, "Looped out."); return ragdoll.seikoActive(); }));
const b = await watch("loopout", 90); ok("off the bike and back up", b && !b.car, b);
ok("the bike was left lying", await ev(() => drive.parked.some(p => Math.abs(p.slide || 0) > 0.5)));
// 3. pedestrian hit
await ev(() => { for (let i = 0; i < 6; i++) pedSpawn(); });
await wait(3000);
const r = await ev(() => ragdoll.testNpc(12));
ok("pedestrian knocked down", r === "down" || r === "dead", r);
await wait(1500); await snap("npc_hit");
await wait(8000);
console.log("NPC", JSON.stringify(await ev(() => ragdoll.report())));
await browser.close(); srv.close();
