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
for (let i = 0; i < 60; i++) { if (await ev(() => !!player.hq && pplLib.ready.length > 20)) break; await wait(2000); }
await ev(() => cheatHour(11));
// trees: a park and a street of them, close
await ev(() => { const c = world.cities[0]; const p = c.plots.find(q => q.kind === "park" && q.size[0] > 40) || c.plots.find(q => q.kind === "park"); const at = p ? p.centre : c.scramble.at; cheatGo([at[0] + 14, at[1] + 14], Math.PI * 1.25); pitch = 0.1; });
await wait(8000); await snap("trees_park");
await ev(() => { pitch = 0.35; }); await wait(3000); await snap("trees_up");
await ev(() => { const c = world.cities.find(x => x.name === "Mizuho") || world.cities[1]; cheatGo([c.bounds.x0 - 60, (c.bounds.z0 + c.bounds.z1) / 2], 0); pitch = 0.05; }); await wait(8000); await snap("trees_forest");
// home
await ev(() => { cheat("GOHOME"); }); await wait(5000);
console.log("HOME " + await ev(() => { const ok = interiorEnter(homeShop()); return ok + " " + (interior.room && interior.room.brand); }));
await wait(6000); await snap("home_genkan");
const view = (x, z, yawP, label) => ev(([x, z, yawP]) => { const R = interior.room; player.pos.set(R.ox + x, interior.floorY, R.oz + z); player.yaw = player.targetYaw = yawP; yaw = yawP + Math.PI; pitch = -0.12; }, [x, z, yawP]).then(() => wait(4000)).then(() => snap(label));
await view(0, 3, Math.PI, "home_living");
await view(2, 1.5, -Math.PI * 0.75, "home_tatami");
await view(1.5, 0, Math.PI / 2 + 0.3, "home_kitchen");
await view(1.5, 2.5, Math.PI / 2 - 0.4, "home_family");
// the wardrobe
await ev(() => { const R = interior.room; player.pos.set(R.ox - 7 + 1.3, interior.floorY, R.oz + 0.6); player.yaw = player.targetYaw = -Math.PI / 2; yaw = player.yaw + Math.PI; });
await wait(2000); await ev(() => wardrobeOpen()); await wait(1500); await snap("wardrobe_menu");
await ev(() => { interior.modal = null; interior.cardEl.classList.remove("on"); seikoOutfit("suit_black"); });
for (let i = 0; i < 20; i++) { await wait(1500); if (await ev(() => player.outfit === "suit_black")) break; }
await ev(() => { const R = interior.room; player.pos.set(R.ox, interior.floorY, R.oz + 1); player.yaw = player.targetYaw = Math.PI; yaw = 0; pitch = -0.05; }); await wait(3000); await snap("outfit_suit");
await ev(() => seikoOutfit("track")); for (let i = 0; i < 20; i++) { await wait(1500); if (await ev(() => player.outfit === "track")) break; }
await wait(2000); await snap("outfit_track");
console.log("OUTFIT " + await ev(() => player.outfit + " " + Object.keys(player.clips).length));
await ev(() => interiorLeave(true)); await wait(3000);
// a konbini
await ev(() => { const s = shops.list.find(x => x.brand === "eleven"); interiorEnter(s); }); await wait(7000);
await ev(() => { const R = interior.room; player.pos.set(R.ox - 2, interior.floorY, R.oz + 3); player.yaw = player.targetYaw = Math.PI * 0.8; yaw = player.yaw + Math.PI; pitch = -0.15; }); await wait(4000); await snap("konbini_props");
await ev(() => interiorLeave(true)); await wait(2000);
// the airport hall
await ev(() => { const a = world.airports.find(x => x.big), s = shops.list.find(x => x.brand === "airport" && x.ap === a); interiorEnter(s); }); await wait(9000);
await ev(() => { const R = interior.room; player.pos.set(R.ox, interior.floorY, R.oz + 9); player.yaw = player.targetYaw = Math.PI; yaw = 0; pitch = -0.1; }); await wait(5000); await snap("airport_hall_people");
await ev(() => { const R = interior.room; player.pos.set(R.ox - 10, interior.floorY, R.oz + 1); player.yaw = player.targetYaw = Math.PI * 0.6; yaw = player.yaw + Math.PI; }); await wait(5000); await snap("airport_checkin");
console.log("CROWD " + await ev(() => (interior.room.crowd || []).length));
await ev(() => { const R = interior.room; interiorShowRoom(airAirside(R), { x: -20, z: 4 }, Math.PI / 2); }); await wait(9000); await snap("airport_airside_people");
await browser.close(); srv.close();
