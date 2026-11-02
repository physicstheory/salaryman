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
const info = await ev(() => world.airports.map(a => ({ name: a.name, code: a.code, len: a.len, y: a.y, spread: Math.round(a.spread), at: [Math.round(a.cx), Math.round(a.cz)], yaw: Math.round(a.yaw) })));
console.log("AIRPORTS", JSON.stringify(info));
const ok = (name, v, extra) => console.log(v ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
ok("five airports sited", info.length === 5, info.length);
const fly = async (ap, lx, ly, lz, look, name, pitchA) => {
  await ev(([i, lx, ly, lz, look, pitchA]) => { const a = world.airports[i]; setMode("fly"); const p = fromRectLocal(lx, lz, a.cx, a.cz, a.yaw); camPos.set(p[0], a.y + ly, p[1]); const q = fromRectLocal(look[0], look[2], a.cx, a.cz, a.yaw); const dx = q[0] - p[0], dz = q[1] - p[1]; yaw = Math.atan2(-dx, -dz); pitch = pitchA; }, [ap, lx, ly, lz, look, pitchA]);
  await wait(5500); await snap(name);
};
// the big one: from the air, along the runway, at the terminal, on the apron
await fly(0, -1700, 260, -900, [0, 0, 150], "tko_aerial", -0.28);
await fly(0, -1650, 40, 20, [800, 0, 0], "tko_runway_end", -0.02);
await fly(0, 40, 30, 80, [0, 14, 290], "tko_terminal_from_apron", 0.0);
await fly(0, 160, 8, 250, [-40, 8, 290], "tko_gates_closeup", 0.05);
await fly(0, -300, 60, 480, [-300, 20, 200], "tko_tower_hangars", -0.1);
// a flight
await ev(() => { const f = world.airports[0].flight; f.state = "landing"; f.s = 0; f.x = undefined; f.mesh.visible = true; });
for (let k = 0; k < 80; k++) await ev(() => updateAirports(1));
await ev(() => { const a = world.airports[0], f = a.flight; const p = fromRectLocal(f.x + 700, 30, a.cx, a.cz, a.yaw); setMode("fly"); camPos.set(p[0], a.y + 14, p[1]); const q = fromRectLocal(f.x, 0, a.cx, a.cz, a.yaw); yaw = Math.atan2(-(q[0] - p[0]), -(q[1] - p[1])); pitch = 0.02; });
await ev(() => updateAirports(0.01)); await wait(4500); await snap("tko_landing_airliner");
console.log("FLIGHT", JSON.stringify(await ev(() => { const f = world.airports[0].flight; return { state: f.state, x: Math.round(f.x), vis: f.mesh.visible }; })));
// the small ones
for (let k = 1; k < info.length; k++) await fly(k, -info[k].len * 0.6, 120, -420, [0, 0, 120], "small_" + info[k].code + "_aerial", -0.22);
// on foot at the big terminal
await ev(() => { setMode("walk"); cheat("GOAIRPORT"); });
await wait(4500); await snap("walk_airport_terminal");
ok("walked to an airport", await ev(() => { const a = world.airports.find(x => Math.hypot(x.cx - player.pos.x, x.cz - player.pos.z) < 700); return !!a; }));
// collision with the terminal
const pre = await ev(() => [player.pos.x, player.pos.z]);
await ev(() => { const a = world.airports[0]; const p = fromRectLocal(0, 290, a.cx, a.cz, a.yaw); placeSeiko(new THREE.Vector3(p[0], 0, p[1])); });
console.log("INSIDE", await ev(() => insideBuilding(player.pos.x, player.pos.z, 0.2)));
await browser.close(); srv.close();
