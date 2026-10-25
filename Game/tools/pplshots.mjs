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






await ev(() => { document.body.classList.add("camfull"); cheat("MIDDAY"); });
const ok = (name, v, extra) => console.log(v ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
const ready = async n => { for (let i = 0; i < 80; i++) { const r = await ev(() => pplLib.ready.length); if (r >= n) return r; await wait(2000); } return await ev(() => pplLib.ready.length); };
const nReady = await ready(26);
ok("real people loaded and retargeted", nReady >= 20, nReady);
console.log("PEOPLE " + JSON.stringify(await ev(() => pplLib.ready.map(e => [e.name, Object.keys(e.clips).join("/"), +e.fit.toFixed(4)]))));
// a line-up at the scramble, facing Seiko (who stands back and out of shot)
const lineup = async (names, state, label, dist) => {
  await ev(([names, state, dist]) => {
    pedsClear(); peds.spawnT = 999;
    const c = world.cities[0], ox = c.scramble.at[0] - 14, oz = c.scramble.at[1] - 10;
    for (const car of traffic.cars) if (car.live && car.at && Math.hypot(car.at.x - ox, car.at.z - oz) < 25) car.live = false;
    names.forEach((nm, k) => {
      const e = pplLib.ready.find(x => x.name === nm) || pplLib.ready[k % pplLib.ready.length], f = pplFigure(e, 1.0);
      const p = Object.assign({ r: null }, f, { x: ox + (k - (names.length - 1) / 2) * 1.0, z: oz, y: world.surfaceY(ox, oz), yaw: 0, sp: 1.3, state: "idle", t: 0, idleFor: 1e9, idleIn: 1e9, hp: 100, h: 1 });
      scene.add(p.holder); peds.list.push(p); pedSet(p, state === "walk" ? "idle" : state); if (state === "walk") pedPlay(p, "walk", 0, 1);
    });
    placeSeiko(new THREE.Vector3(ox, 0, oz + dist)); player.yaw = player.targetYaw = Math.PI; yaw = 0; pitch = -0.02; player.obj.visible = false;
  }, [names, state, dist]);
  await wait(5000); await snap(label);
};
const ALL = await ev(() => pplLib.ready.map(e => e.name).sort());
const by = re => ALL.filter(n => re.test(n));
await lineup(by(/salaryman_0[1-8]/), "idle", "salarymen", 2.2);
await lineup(by(/officelady|woman_0[1-3]/), "idle", "women", 2.2);
await lineup(by(/man_0|woman_0[4-6]|salaryman_09|salaryman_10/).filter(n => !/officelady/.test(n)), "idle", "casual", 2.2);
await lineup(["salaryman_02", "officelady_02"], "idle", "closeup_1", -0.9);
await lineup(["salaryman_04", "woman_01"], "idle", "closeup_2", -0.9);
await lineup(["salaryman_06", "officelady_04"], "idle", "closeup_3", -0.9);
await lineup(by(/salaryman/).slice(0, 5), "walk", "walking", 1.0);
// and the street as it is, with them walking it
await ev(() => { pedsClear(); peds.spawnT = 0; player.obj.visible = true; const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); });
for (let i = 0; i < 30; i++) { await wait(1500); if (await ev(() => peds.list.filter(p => p.real).length >= 6)) break; }
const near = await ev(() => { let b = null, bd = 1e9; peds.list.forEach(p => { const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); if (d < bd) { bd = d; b = p; } }); if (!b) return null; const a = Math.atan2(b.x - player.pos.x, b.z - player.pos.z); placeSeiko(new THREE.Vector3(b.x - Math.sin(a) * 7, 0, b.z - Math.cos(a) * 7)); player.yaw = player.targetYaw = a; yaw = a + Math.PI; pitch = -0.05; return b.real; });
await wait(3000); await snap("street_people");
await ev(() => { wheel.pistolOwned = true; gunGive("pistol", 2); gunAmmoOf("pistol").mag = 15; wheel.equipped = "pistol"; gun.aimIn = true; }); await wait(4000); await snap("aim_at_person");
// a shop clerk
await ev(() => { gun.aimIn = false; wheel.equipped = "none"; const s = shops.list.find(x => x.brand === "eleven"); interiorEnter(s); });
await wait(3000);
await ev(() => { const R = interior.room, h = new THREE.Vector3(); R.clerk.getWorldPosition(h); player.pos.set(h.x - 2.6, interior.floorY, h.z); player.yaw = player.targetYaw = Math.PI / 2; yaw = player.yaw + Math.PI; pitch = -0.05; });
await wait(3000); await snap("clerk");
console.log("CLERK " + await ev(() => interior.room.clerkFig && interior.room.clerkFig.real));
await browser.close(); srv.close();
