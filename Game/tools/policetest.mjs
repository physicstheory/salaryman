// Photographs the streets: from the air and on foot at a junction, and logs how much street was laid.
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
const info = await ev(() => shops.list.filter(s => s.police).map(s => ({ name: s.name, city: s.city, built: !!s.built, w: Math.round(s.size[0]), d: Math.round(s.size[1]), h: Math.round(s.height || 0), at: s.at, yaw: s.yaw })));
console.log("STATIONS", JSON.stringify(info));
const ok = (name, v, extra) => console.log(v ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
ok("stations placed", info.length >= 3 && info.every(x => x.built), info.length);
// 1. the building, from outside (the first station whose front is on dry land)
await ev(() => { const s = shops.list.find(x => x.police && world.sampleHeight(x.door[0] + Math.sin(x.yaw) * 30, x.door[1] + Math.cos(x.yaw) * 30) > 1.5) || shops.list.find(x => x.police); const a = s.yaw; setMode("fly"); const px = s.at[0] + Math.sin(a) * (s.size[1] / 2 + 30), pz = s.at[1] + Math.cos(a) * (s.size[1] / 2 + 30); camPos.set(px, world.surfaceY(px, pz) + 6, pz); yaw = a; pitch = -0.05; });
await wait(5000); await snap("station_outside");
// 2. inside, walking: the desk and the cell
await ev(() => { setMode("walk"); const s = shops.list.find(x => x.police); placeSeiko(new THREE.Vector3(s.door[0], world.surfaceY(s.door[0], s.door[1]), s.door[1])); enterShop(s); });
await wait(3500); await snap("station_inside_entry");
ok("inside the interior", await ev(() => interior.active && interior.shop.police));
await ev(() => { const R = interior.room; player.pos.set(R.ox + 3.2, interior.floorY, R.oz - 0.2); player.yaw = player.targetYaw = Math.PI; yaw = 0; pitch = -0.1; });
await wait(2500); await snap("station_desk");
await ev(() => { const R = interior.room; player.pos.set(R.ox - 1.5, interior.floorY, R.oz - 3.5); player.yaw = player.targetYaw = -Math.PI / 2; yaw = player.yaw + Math.PI; pitch = -0.05; });
await wait(2500); await snap("station_cell_from_inside_gate");
await ev(() => { interiorLeave(true); });
await wait(1500);
// 3. a chase in the street: stars, units
await ev(() => { const c = world.cities[0]; const wd = c.wards.slice().sort((a, b) => b.coreness - a.coreness)[0]; setMode("walk"); placeSeiko(new THREE.Vector3(wd.centre[0] + 2, 0, wd.centre[1] + 2)); });
await wait(3000);
await ev(() => { cheat("WANTED"); });
await ev(() => { for (let k = 0; k < 110; k++) { clock += 0.05; wanted.busting = 0; updateWanted(0.05); updateChase(0.05); } });
await wait(1500); await snap("chase_cars_approaching");
await ev(() => { for (let k = 0; k < 400; k++) { clock += 0.05; wanted.busting = 0; updateWanted(0.05); updateChase(0.05); } });
const ch = await ev(() => ({ units: police.units.length, officers: police.officers.length, stars: wanted.stars, near: police.units.map(u => Math.round(Math.hypot(u.pos.x - player.pos.x, u.pos.z - player.pos.z))), busting: wanted.busting }));
console.log("CHASE", JSON.stringify(ch));
ok("patrol cars are chasing", ch.units >= 1 && ch.near.some(d => d < 60), ch);
await wait(1200); await snap("chase_units_near");
// 4. run: stars stay while they can see you; arrest by standing still
await ev(() => { player.speed = 0; });
const arrested = await ev(() => { for (let k = 0; k < 900 && record.arrests === 0; k++) { clock += 0.05; player.speed = 0; updateWanted(0.05); updateChase(0.05); } return record.arrests > 0; });
ok("standing still gets you arrested", arrested, await ev(() => ({ arrests: record.arrests, owed: record.owed })));
await wait(5000);
ok("woke up in the station", await ev(() => interior.active && interior.shop.police && !!interior.modal && interior.modal.kind === "booked"), await ev(() => interior.modal && interior.modal.kind));
await snap("booked_in_cell");
await ev(() => interiorModalAct()); await wait(1500); await snap("walk_out_of_cell");
// 5. community service
await ev(() => { const R = interior.room; const sp = R.spots.find(x => x.act === "police"); player.pos.set(R.ox + sp.x, interior.floorY, R.oz + sp.z + 0.4); player.yaw = player.targetYaw = Math.PI; });
await wait(1500);
await ev(() => { const R = interior.room; interiorSpotAct(R.spots.find(x => x.act === "police")); }); await wait(900);
ok("desk menu opens", await ev(() => interior.modal && interior.modal.kind === "desk"));
await snap("desk_menu_owed");
const owed0 = await ev(() => record.owed);
await ev(() => { interior.modal.sel = 0; interiorModalAct(); }); await wait(1500);
ok("minigame starts", await ev(() => service.active));
await snap("service_start");
for (let k = 0; k < 14; k++) { await ev(k => { const s = service.st; s.items.push({ x: s.x + 10, y: s.y + 6, type: k % 4, rot: 1 }); serviceAct(); if (s.carry >= 3) { s.x = 850; serviceAct(); s.x = 300; } }, k); }
await ev(() => { service.st.x = 850; serviceAct(); });
await wait(600); await snap("service_going");
await wait(2500);
ok("an hour of service served", await ev(() => !service.active), await ev(() => ({ owed: record.owed, served: record.served })));
ok("owed went down", (await ev(() => record.owed)) === owed0 - 1, [owed0, await ev(() => record.owed)]);
// clear it all
await ev(() => { record.owed = 1; serviceStart(); });
await wait(500);
await ev(() => { const s = service.st; s.done = s.goal; });
await wait(2500);
ok("record cleared when nothing is owed", await ev(() => record.owed === 0 && record.arrests === 0), await ev(() => recordText()));
await ev(() => { cheat("ARRESTME"); }); await wait(5000);
ok("ARRESTME cheat works too", await ev(() => record.arrests === 1));
await browser.close(); srv.close();
