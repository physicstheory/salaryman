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
// 1. out of a car, walk, into another car
await ev(() => { cheat("ROADSTER"); }); await wait(4000);
await ev(() => { drive.car.speed = 0; useRide(); }); await wait(2500);
const a = await ev(() => ({ car: !!drive.car, mode: player.mode, x: player.pos.x, z: player.pos.z, vis: player.obj.visible, down: player.down, paused: paused }));
console.log("OUT", JSON.stringify(a));
await ev(() => { keys.KeyW = true; }); await wait(6000); await ev(() => { keys.KeyW = false; });
const b = await ev(() => ({ x: player.pos.x, z: player.pos.z, speed: player.speed, blocked: !!insideBuilding(player.pos.x, player.pos.z, 0.45), interior: interior.active, heist: heist.stage, onsen: onsens.active, ex: ex.open, ife: ife.open, chute: chute.active, flight: flight.active, svc: service.active, modal: !!interior.modal }));
console.log("MOVED", JSON.stringify(b));
ok("Seiko walks after leaving a car", Math.hypot(b.x - a.x, b.z - a.z) > 2, b);
await snap("after_car");
// 2. into another car
await ev(() => { cheat("TAXICAB"); }); await wait(3500);
ok("enters a second car", await ev(() => !!drive.car));
await ev(() => { drive.car.speed = 0; useRide(); }); await wait(2000);
await ev(() => { keys.KeyW = true; }); await wait(4000); await ev(() => { keys.KeyW = false; });
// 3. shops in low graphics
await ev(() => { applyTier("low", { quiet: true }); syncQualityLabels(); });
await ev(() => { const s = shops.list.find(s => s.brand === "eleven" && !s.city); cheatGo([s.door[0] + Math.sin(s.yaw) * 9, s.door[1] + Math.cos(s.yaw) * 9], s.yaw + Math.PI); }); await wait(9000); await snap("low_shop_outside");
  await ev(() => { keys.KeyW = true; }); await wait(5000); await ev(() => { keys.KeyW = false; }); await wait(1500); const dr = await ev(() => ({ inside: interior.active, near: !!shopNear(player.pos.x, player.pos.z, 4) })); console.log("DOOR", JSON.stringify(dr)); await snap("low_shop_door");
const e = await ev(() => { const s = shops.list.find(s => s.brand === "eleven" && !s.city); try { const ok = interiorEnter(s); return { ok: ok, room: interior.room && interior.room.brand }; } catch (e) { return { err: String(e) }; } });
console.log("ENTER", JSON.stringify(e)); await wait(3000); await snap("low_shop_inside");
await ev(() => { const R = interior.room; const sp = R.items[0]; if (sp) { sp.mesh.getWorldPosition(camPos); } });
const m = await ev(() => { let n = 0, bad = 0; interior.room.group.traverse(o => { if (o.isMesh) { n++; const mt = o.material; if (!mt || (mt.map && !mt.map.image)) bad++; } }); return { meshes: n, noTexture: bad, items: interior.room.items.length, tier: gfx.tier }; });
console.log("ROOM", JSON.stringify(m));
await ev(() => interiorLeave()); await wait(3000);
for (const brand of ["ramen", "sushi", "pharmacy", "books"]) {
  const r = await ev(b => { const s = shops.list.find(s => s.brand === b && !s.city) || shops.list.find(s => s.brand === b); if (!s) return null; try { const ok = interiorEnter(s); const n = interior.room.items.length; interiorLeave(true); return { ok: ok, n: n }; } catch (e) { return { err: String(e) }; } }, brand);
  ok("low graphics: " + brand + " interior", r && r.ok, r);
}
await browser.close(); srv.close();
