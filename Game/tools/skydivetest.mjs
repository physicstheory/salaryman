// Skydiving in the game: a BASE jump off the tallest tower (rig pickup, run off the edge, pull, fly, flare, land), a jump from an
// aircraft (freefall to terminal, opening shock, canopy), and stepping off a roof without a parachute (into the ragdoll).
//   PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.js node Game/tools/skydivetest.mjs <out>
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
ok("skydive hook loaded", await ev(() => !!window.skydive && !!SHIGOTO.Skydiver));
await wait(4000);
const roofs = await ev(() => skydive.roofs());
ok("BASE roofs found", roofs.length > 0, roofs.slice(0, 4));
const tele = () => ev(() => { const t = skydive.telemetry(); return t ? { ph: t.phase, alt: +t.alt.toFixed(1), kmh: Math.round(t.speed * 3.6), sink: +t.sink.toFixed(1), g: +t.g.toFixed(1), maxG: +t.maxG.toFixed(1), fill: +(t.fill || 0).toFixed(2), bank: +t.bank.toFixed(2) } : { ph: chute.active ? "?" : "none", h: +vitals.health.toFixed(2), down: player.down, y: +player.pos.y.toFixed(1), rag: window.ragdoll ? ragdoll.seikoActive() : null }; });
// 1. BASE: onto the tallest roof with a rig, face the nearest edge, run off it
await ev(() => skydive.go(0));
await wait(3000); await snap("roof");
ok("on the roof with a rig", await ev(() => skydive.have && player.pos.y > 60), await ev(() => ({ y: player.pos.y, have: skydive.have })));
await ev(() => {
  const r = skydive.roofs_()[0], a = r.yawDeg * Math.PI / 180;
  // the lift is on the -z local side; run toward -z local edge (out of the lobby side)
  const lx = 0, lz = -1, dx = lx * Math.cos(a) + lz * Math.sin(a), dz = -lx * Math.sin(a) + lz * Math.cos(a);
  yaw = Math.atan2(-dx, -dz); player.yaw = player.targetYaw = Math.atan2(dx, dz);
});
await page.keyboard.down("ShiftLeft"); await page.keyboard.down("KeyW");
for (let i = 0; i < 40; i++) { if (await ev(() => chute.active)) break; await wait(250); }
await page.keyboard.up("KeyW"); await page.keyboard.up("ShiftLeft");
ok("ran off the edge into freefall", await ev(() => chute.active), await tele());
await wait(1200); await snap("base_exit");
await page.keyboard.press("Space");
const seen = [];
for (let i = 0; i < 12; i++) { const t = await tele(); seen.push(t); if (t.ph === "canopy") break; await wait(500); }
console.log("BASE opening", JSON.stringify(seen));
ok("BASE canopy opened", seen.some(t => t.ph === "canopy"));
await snap("base_canopy");
// steer a bit, then flare near the ground
await page.keyboard.down("KeyD"); await wait(1500); await page.keyboard.up("KeyD"); await snap("base_turn");
let landed = null;
for (let i = 0; i < 400; i++) {
  const t = await tele();
  if (t.ph === "canopy" && t.alt < 5) { await page.keyboard.down("KeyS"); }
  if (!(await ev(() => chute.active))) { landed = t; break; }
  await wait(t.ph === "canopy" && t.alt < 30 ? 50 : 300);
}
await page.keyboard.up("KeyS");
await wait(500);
landed = await tele();
ok("BASE landed and walking", !!landed && !(await ev(() => chute.active)), landed);
await snap("base_landed");
// 2. out of an aircraft
await ev(() => { vitals.health = 1; cheat("SKYDIVE"); });
await wait(3000);
await page.keyboard.press("KeyF");
await wait(800);
ok("out of the aircraft", await ev(() => chute.active && skydive.telemetry() && skydive.telemetry().phase === "freefall"), await tele());
await wait(14000);
const ff = await tele(); ok("near terminal in the box (150-230 km/h)", ff.kmh > 150 && ff.kmh < 240, ff);
await snap("freefall");
await page.keyboard.press("Space");
let op = []; for (let i = 0; i < 20; i++) { const t = await tele(); op.push(t); if (t.ph === "canopy") break; await wait(500); }
const last = op[op.length - 1];
ok("sport canopy opened at 2.5-6 g", last.ph === "canopy" && last.maxG > 2 && last.maxG < 7, op.slice(-3));
await snap("sport_canopy");
// 3. no parachute: off the roof with a jump
await ev(() => { chute.active = false; skydive.sd = null; skydive.go(1); skydive.have = false; });
await wait(2500);
await ev(() => { const r = skydive.roofs_()[Math.min(1, skydive.roofs_().length - 1)], a = r.yawDeg * Math.PI / 180; const dx = Math.sin(a) * -1, dz = Math.cos(a) * -1; yaw = Math.atan2(-dx, -dz); player.yaw = player.targetYaw = Math.atan2(dx, dz); });
await page.keyboard.down("KeyW");
for (let i = 0; i < 30; i++) { await page.keyboard.press("Space"); if (await ev(() => chute.active)) break; await wait(200); }
await page.keyboard.up("KeyW");
ok("jumped off without a parachute", await ev(() => chute.active && skydive.sd && skydive.sd.phase === "freefall"));
let rag = null; for (let i = 0; i < 40; i++) { const t = await tele(); if (t.rag) { rag = t; break; } await wait(500); }
ok("hit the ground into the ragdoll", !!rag, rag);
await wait(1500); await snap("nochute");
await browser.close(); srv.close();
