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
// the arms shop
const e = await ev(() => { const s = shops.list.find(s => s.brand === "arms"); try { const k = interiorEnter(s); return { ok: k, items: interior.room.items.map(i => i.it.id) }; } catch (e) { return { err: String(e) }; } });
console.log("ARMS " + JSON.stringify(e)); await wait(3500); await snap("arms_shop");
await ev(() => { const R = interior.room, it = R.items.find(i => i.it.id === "pistol"); if (it) interiorCardOpen(it); }); await wait(3000); await snap("arms_card_pistol");
await ev(() => { interiorCardClose(true); interiorLeave(true); wheel.pistolOwned = wheel.smgOwned = wheel.shotgunOwned = true; gunGive("pistol", 2); gunGive("smg", 1); gunGive("shotgun", 1); gunAmmoOf("pistol").mag = 15; });
// carrying it
await ev(() => { { const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); } wheel.equipped = "pistol"; });
await wait(6000); await snap("pistol_carried");
await ev(() => { wheel.equipped = null; }); await wait(4000); await snap("nogun"); console.log("PL " + await ev(() => JSON.stringify({ vis: player.obj.visible, cam: camera.position.distanceTo(player.pos), lod: player.lod, kids: player.obj.children.length, tier: gameSet && gameSet.tier })));
await ev(() => { wheel.equipped = "pistol"; }); await wait(2000);
await ev(() => { gun.aimIn = true; }); await wait(3500); await snap("pistol_aim"); console.log("BONES " + await ev(() => JSON.stringify(Object.keys(gunBones() || {}).map(k => [k, !!gunBones()[k]]))));
const before = await ev(() => ({ mag: gunAmmoOf("pistol").mag, stars: wanted.stars }));
await ev(() => { gun.fireIn = true; }); await wait(2500); await ev(() => { gun.fireIn = false; }); await wait(800);
const after = await ev(() => ({ mag: gunAmmoOf("pistol").mag, stars: wanted.stars, crime: wanted.lastCrime, witnesses: peds.list.filter(p => p.state === "flee" || p.state === "call" || p.state === "cower").length, people: peds.list.length }));
console.log("FIRE " + JSON.stringify([before, after])); ok("a shot is fired, a round is used, people react or the police come", after.mag < before.mag && (after.stars >= 1 || after.witnesses > 0 || after.people === 0), [before, after]); await snap("pistol_fired");
await ev(() => { gun.aimIn = false; gunReload(); }); await wait(4000);
ok("reloading refills the magazine", await ev(() => gunAmmoOf("pistol").mag > 5), await ev(() => gunAmmoOf("pistol")));
for (const id of ["smg", "shotgun"]) { await ev(i => { wheel.equipped = i; gun.aimIn = true; }, id); await wait(4500); await snap(id + "_aim"); }
await ev(() => { gun.aimIn = false; wheel.equipped = "pistol"; cheat("ROADSTER"); }); await wait(3500);
ok("the gun is put away in a car", await ev(() => !gun.model.visible));
await browser.close(); srv.close();
