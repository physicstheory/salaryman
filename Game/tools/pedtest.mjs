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
const states = () => ev(() => { const o = {}; peds.list.forEach(p => { o[p.state] = (o[p.state] || 0) + 1; }); return o; });
// the street
await ev(() => { const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); wheel.pistolOwned = true; gunGive("pistol", 2); gunAmmoOf("pistol").mag = 15; });
for (let i = 0; i < 40; i++) { await wait(1500); if (await ev(() => peds.list.length >= 5)) break; }
const n0 = await ev(() => ({ tpl: !!peds.tpl, n: peds.list.length, want: pedWanted() }));
ok("people on the street", n0.tpl && n0.n >= 3, n0);
// walk Seiko up to the nearest one and look at them
const near = await ev(() => { let b = null, bd = 1e9; peds.list.forEach(p => { const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); if (d < bd) { bd = d; b = p; } }); if (!b) return null;
  const a = Math.atan2(b.x - player.pos.x, b.z - player.pos.z); placeSeiko(new THREE.Vector3(b.x - Math.sin(a) * 9, 0, b.z - Math.cos(a) * 9)); b.state = "idle"; b.idleFor = 60; b.t = 0;
  player.yaw = player.targetYaw = a; yaw = a + Math.PI; pitch = -0.05; window.__p = b; return { d: Math.round(bd) }; });
await wait(4000); await snap("street_people");
await ev(() => { wheel.equipped = "pistol"; gun.aimIn = true; }); await wait(4000);
const lk = await ev(() => ({ lock: gun.lock === window.__p, anyLock: !!gun.lock, state: window.__p.state, fov: Math.round(camera.fov) }));
ok("aiming locks on and the hands go up", lk.anyLock && (lk.state === "hands" || lk.state === "cower"), lk);
ok("aiming zooms in", lk.fov < 55, lk.fov);
await snap("aim_lock_hands_up");
// fire at them
await ev(() => { const o = peds.list.find(p => p !== window.__p && p.state !== "dead"); if (o) { o.x = player.pos.x + 18; o.z = player.pos.z + 6; o.state = "idle"; o.idleFor = 60; o.t = 0; } });
await ev(() => { gun.fireIn = true; }); await wait(2500); await ev(() => { gun.fireIn = false; }); await wait(1500);
const sh = await ev(() => ({ hit: window.__p.state, hp: window.__p.hp, all: peds.list.map(p => p.state) }));
ok("the target is hit", sh.hp < 100, sh);
await snap("shot_reaction");
await ev(() => { gun.aimIn = false; }); await wait(2500); await snap("people_flee");
console.log("STATES " + JSON.stringify(await states()));
for (let i = 0; i < 90; i++) { await wait(1500); if (await ev(() => wanted.stars > 0)) break; }
const st = await ev(() => ({ stars: wanted.stars, crime: wanted.lastCrime }));
ok("someone rang it in (or the police saw it)", st.stars > 0, st);
// the robbery, done properly
await ev(() => { cheat("CLEANSLATE"); policeClear && policeClear(); });
await wait(1500);
const shopA = await ev(() => { const s = shops.list.find(x => x.brand === "eleven" && !x.city) || shops.list.find(x => x.brand === "eleven"); window.__sA = s; return !!s && interiorEnter(s); });
ok("in a konbini", shopA);
await wait(3000);
const cf = await ev(() => !!interior.room.clerkFig); ok("a real clerk behind the counter", cf);
await ev(() => { const R = interior.room, h = new THREE.Vector3(); R.clerk.getWorldPosition(h); player.pos.set(h.x - 3.2, interior.floorY, h.z); player.yaw = player.targetYaw = Math.PI / 2; yaw = player.yaw + Math.PI; pitch = 0; wheel.equipped = "pistol"; gun.aimIn = true; });
for (let i = 0; i < 20; i++) { await wait(1000); if (await ev(() => rob.stage === "till")) break; }
ok("the till opens under the gun", await ev(() => rob.stage === "till"), await ev(() => ({ stage: rob.stage, threat: rob.threat, alarm: rob.alarm })));
await snap("robbery_till");
await ev(() => { gun.aimIn = false; window.__bot = setInterval(() => { if (rob.stage !== "till") return; const s = Math.min(4, Math.floor(rob.cur)); if (rob.slots[s] > 0 && Math.abs(rob.cur - (s + 0.5)) < 0.25) robGrab(); }, 5); });
await wait(3000); await snap("robbery_grabbing");
for (let i = 0; i < 40; i++) { await wait(1000); if (await ev(() => rob.stage !== "till")) break; }
await ev(() => clearInterval(window.__bot));
const r1 = await ev(() => ({ stage: rob.stage, cash: rob.cash, fumbles: rob.fumbles, alarm: Math.round(rob.alarm), pending: rob.pending }));
ok("clean robbery: cash, no fumbles, nothing pending", r1.cash > 0 && r1.fumbles === 0 && !r1.pending && r1.alarm < 100, r1);
await ev(() => interiorLeave(true)); await wait(4000);
ok("clean job: no police", await ev(() => wanted.stars === 0), await ev(() => wanted.stars));
// and done badly: the alarm goes
const shopB = await ev(() => { const s = shops.list.find(x => x.brand === "petmart") || shops.list.find(x => x.brand === "dokoto"); return !!s && interiorEnter(s); });
await wait(3000);
await ev(() => { const R = interior.room, h = new THREE.Vector3(); R.clerk.getWorldPosition(h); player.pos.set(h.x - 3.2, interior.floorY, h.z); player.yaw = player.targetYaw = Math.PI / 2; yaw = player.yaw + Math.PI; pitch = 0; gun.aimIn = true; });
for (let i = 0; i < 20; i++) { await wait(1000); if (await ev(() => rob.stage === "till")) break; }
await ev(() => { gun.aimIn = false; robGrab(); robGrab(); rob.alarm = 97; }); await wait(4000);
const r2 = await ev(() => ({ stage: rob.stage, pending: rob.pending, alarm: rob.alarm }));
ok("botched robbery sets off the alarm", r2.pending === "robbery", r2);
await snap("robbery_alarm");
await ev(() => interiorLeave(true)); await wait(3000);
for (let i = 0; i < 10 && !(await ev(() => wanted.stars >= 3)); i++) await wait(1000);
ok("police waiting outside", await ev(() => wanted.stars >= 3), await ev(() => ({ s: wanted.stars, c: wanted.lastCrime })));
// run somebody over
await ev(() => { cheat("CLEANSLATE"); policeClear(); const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); });
await wait(6000);
console.log("END STATES " + JSON.stringify(await states()));
await browser.close(); srv.close();
