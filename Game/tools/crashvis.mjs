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
for (let i = 0; i < 60; i++) { if (await ev(() => !!player.hq && pplLib.ready.length > 20)) break; await wait(2000); }
await ev(() => cheatHour(11));
// a car on an open road
await ev(() => { const c = world.cities[0]; const r = c.roads.find(x => x.halfWidth >= 9 && !x.elevated); const p = r.pts[Math.floor(r.pts.length / 2)], q = r.pts[Math.floor(r.pts.length / 2) + 1]; cheatGo([p[0], p[2]], Math.atan2(q[0] - p[0], q[2] - p[2])); cheat("RYDECAR"); });
await wait(4000);
// full throttle, then a hard turn: the car should understeer or slide, not turn on rails
await ev(() => { keys.KeyW = true; }); const c0 = await ev(() => clock); for (let i = 0; i < 40; i++) { await wait(1000); if (await ev(() => drive.car.speed > 15)) break; }
console.log("ACCEL game seconds " + await ev(c0 => +(clock - c0).toFixed(1), c0) + " speed " + await ev(() => +drive.car.speed.toFixed(1)));
const sp1 = await ev(() => +drive.car.speed.toFixed(1));
await ev(() => { keys.KeyD = true; keys.Space = true; }); let maxLat = 0, maxSq = 0;
for (let i = 0; i < 8; i++) { await wait(400); const st = await ev(() => ({ l: Math.abs(drive.car.vlat || 0), q: drive.car.squeal || 0 })); maxLat = Math.max(maxLat, st.l); maxSq = Math.max(maxSq, st.q); }
await snap("handbrake_slide");
await ev(() => { keys.KeyD = false; keys.Space = false; keys.KeyW = false; }); await wait(3000);
ok("handbrake turn slides the car (sideways speed, squeal)", maxLat > 1.5 && maxSq > 0.3, { sp1: sp1, maxLat: +maxLat.toFixed(2), maxSq: +maxSq.toFixed(2) });
await snap("skid_marks");
// crash it into a building, three times
const crashOnce = async () => ev(() => {
  const c = drive.car, k = CAR_KINDS[c.kind];
  for (let a = 0; a < 64; a++) { const yawA = a / 64 * Math.PI * 2; for (let d = 8; d < 220; d += 2) { const x = c.pos.x + Math.sin(yawA) * d, z = c.pos.z + Math.cos(yawA) * d; if (insideBuilding(x, z, 0.5)) { const sx = c.pos.x + Math.sin(yawA) * (d - 9), sz = c.pos.z + Math.cos(yawA) * (d - 9); c.pos.set(sx, world.surfaceY(sx, sz), sz); c.yaw = yawA; c.vel = new THREE.Vector2(Math.sin(yawA) * 22, Math.cos(yawA) * 22); c.speed = 22; return d; } } }
  return 0; });
for (let i = 0; i < 3; i++) { console.log("WALL " + await crashOnce()); await ev(() => { keys.KeyW = true; }); await wait(2500); await ev(() => { keys.KeyW = false; }); await wait(1000); }
const dm = await ev(() => drive.car.dmg && { f: +drive.car.dmg.front.toFixed(2), t: +drive.car.dmg.total.toFixed(2), r: +drive.car.dmg.rear.toFixed(2), l: +drive.car.dmg.left.toFixed(2), rr: +drive.car.dmg.right.toFixed(2) });
ok("crashing damages the car", dm && dm.t > 0.2, dm);
// look at it from the front and the side
await ev(() => { const c = drive.car; yaw = c.yaw; pitch = -0.15; look.x = 0.0001; }); await wait(2500); await snap("damaged_front");
await ev(() => { const c = drive.car; yaw = c.yaw + Math.PI / 2; }); await wait(2500); await snap("damaged_side");
await ev(() => { look.x = 0; leaveCar(); }); await wait(2000); await ev(() => { const c = drive.parked[drive.parked.length - 1]; const x = c.pos.x + Math.sin(c.yaw) * 5, z = c.pos.z + Math.cos(c.yaw) * 5; placeSeiko(new THREE.Vector3(x, 0, z)); player.yaw = player.targetYaw = c.yaw + Math.PI; yaw = c.yaw; pitch = -0.2; }); await wait(3500); await snap("wreck_parked_front");
ok("the damage stays with the parked car", await ev(() => drive.parked.some(q => q.dmg && q.dmg.total > 0.2)), "");   // (scenery cars spawn into the list as you walk past the bays, so not just the last one)
// a plane crash
await ev(() => { cheat("AIRPLANE"); }); await wait(3000);
await ev(() => { flight.air = true; flight.v = 50; flight.pos.y = world.surfaceY(flight.pos.x, flight.pos.z) + flight.off + 40; flight.gamma = -0.6; flight.pitch = -0.6; });
for (let i = 0; i < 20; i++) { await wait(500); if (await ev(() => !flight.active)) break; }
await wait(1500); await snap("plane_crash_fireball");
await wait(6000); await ev(() => { pitch = -0.1; }); await snap("plane_wreck_burning");
ok("a plane crash leaves a burning wreck", await ev(() => (flight.wrecks || []).length > 0 && flight.wrecks[0].m.parent === scene), "");
// people sitting in the airport
await ev(() => { const a = world.airports.find(x => x.big), s = shops.list.find(x => x.brand === "airport" && x.ap === a); interiorEnter(s); }); await wait(9000);
await ev(() => { const R = interior.room; player.pos.set(R.ox - 14, interior.floorY, R.oz + 3); player.yaw = player.targetYaw = Math.PI * 0.85; yaw = player.yaw + Math.PI; pitch = -0.15; }); await wait(5000); await snap("airport_seated");
console.log("SITTING " + await ev(() => (interior.room.crowd || []).filter(w => w.sitT > 0).length));
await ev(() => { const R = interior.room; interiorShowRoom(airAirside(R), { x: -20, z: 4 }, Math.PI / 2); }); await wait(9000);
await ev(() => { const R = interior.room; player.pos.set(R.ox - 18, interior.floorY, R.oz - 1); player.yaw = player.targetYaw = -Math.PI * 0.85; yaw = player.yaw + Math.PI; pitch = -0.2; }); await wait(5000); await snap("gate_seated");
console.log("SITTING2 " + await ev(() => (interior.room.crowd || []).filter(w => w.sitT > 0).length));
await ev(() => interiorLeave(true)); await wait(2000);
await ev(() => interiorEnter(homeShop())); await wait(8000);
await ev(() => { const R = interior.room; player.pos.set(R.ox + 2.8, interior.floorY, R.oz + 4.0); player.yaw = player.targetYaw = Math.PI * 0.75 ; yaw = player.yaw + Math.PI; pitch = -0.12; }); await wait(4000); await snap("dad_sitting");
await browser.close(); srv.close();
