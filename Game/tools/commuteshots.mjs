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
const count = () => ev(() => ({ commuters: peds.list.filter(p => p.commuter).length, toStation: peds.list.filter(p => p.commuter && p.toStation).length, all: peds.list.length, time: Math.floor(gameMinutes() / 60) + ":" + String(Math.floor(gameMinutes() % 60)).padStart(2, "0"), rush: rushNow() }));
const atStation = async (capital, back, label, secs) => {
  const info = await ev(([capital, back]) => {
    pedsClear(); peds.spawnT = 0; player.obj.visible = true; commute.waveT = 0;
    const S = commuteStations(), st = S.find(s => s.capital === capital) || S[0];
    const a = Math.random() * 6.28; let x = st.x, z = st.z;
    for (let k = 0; k < 24; k++) { const b = a + k * 0.26, tx = st.x + Math.sin(b) * back, tz = st.z + Math.cos(b) * back; if (!insideBuilding(tx, tz, 1) && world.sampleHeight(tx, tz) > 0.5) { x = tx; z = tz; break; } }
    placeSeiko(new THREE.Vector3(x, 0, z)); const f = Math.atan2(st.x - x, st.z - z); player.yaw = player.targetYaw = f; yaw = f + Math.PI; pitch = -0.32;
    return st.name;
  }, [capital, back]);
  for (let i = 0; i < secs; i += 5) { await wait(5000); }
  // look at the crowd: from the side of it, a little above
  await ev(() => { const L = peds.list.filter(p => p.commuter); if (!L.length) return; let cx = 0, cz = 0; L.forEach(p => { cx += p.x; cz += p.z; }); cx /= L.length; cz /= L.length;
    const q = L.reduce((b, p) => Math.hypot(p.x - cx, p.z - cz) < Math.hypot(b.x - cx, b.z - cz) ? p : b, L[0]); cx = q.x; cz = q.z;
    for (let k = 0; k < 16; k++) { const a = k * 0.4, x = cx + Math.sin(a) * 11, z = cz + Math.cos(a) * 11; if (!insideBuilding(x, z, 1)) { placeSeiko(new THREE.Vector3(x, 0, z)); const f = Math.atan2(cx - x, cz - z); player.yaw = player.targetYaw = f; yaw = f + Math.PI; pitch = -0.28; player.obj.visible = false; return; } } });
  await wait(3500);
  const c = await count(); console.log("CROWD " + label + " " + info + " " + JSON.stringify(c));
  await snap(label); return c;
};
await ev(() => { cheatHour(7.75); gfx.tier = "high"; });
const c1 = await atStation(true, 30, "tokonto_morning_rush", 60);
ok("a morning crowd at the capital's station", c1.commuters >= 8, c1);
await wait(15000); await snap("tokonto_morning_rush_2"); console.log("CROWD later " + JSON.stringify(await count()));
await ev(() => { pitch = -0.04; }); await wait(4000); await snap("tokonto_rush_street_level");
const c2 = await atStation(false, 40, "town_morning_to_station", 50);
ok("commuters walking to a town station", c2.toStation >= 3, c2);
await ev(() => cheatHour(13));
const c3 = await atStation(true, 30, "tokonto_midday", 40);
ok("quieter at midday", c3.commuters < c1.commuters, [c1.commuters, c3.commuters]);
await browser.close(); srv.close();
