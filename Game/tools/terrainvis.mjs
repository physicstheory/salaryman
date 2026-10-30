// Landscape: the mountains near and far, a snowy peak, the shore, a meadow and the woods, and the trees close up, for judging the terrain and trees.
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
page.on("console", m => { const t = m.text(); if (m.type() === "error" && !/toNonIndexed|Failed to load|CORS/.test(t)) console.log("CERR", t.slice(0, 600)); });
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








await ev(() => { document.body.classList.add("camfull"); cheat("MIDDAY"); cheatHour(10); });
const P = await ev(() => {
  const H = world.height, GX = GRID_X, GZ = GRID_Z; let bi = 0; for (let i = 0; i < H.length; i++) if (H[i] > H[bi]) bi = i;
  const peak = [(bi % GX) * CELL, Math.floor(bi / GX) * CELL, H[bi]];
  // a steep slope partway up, and a beach, and a flat meadow away from the towns
  let steep = null, beach = null, meadow = null;
  for (let k = 0; k < 400000 && !(steep && beach && meadow); k++) { const x = 300 + rnd(k, 1, 77) * (WORLD_X - 600), z = 300 + rnd(k, 2, 77) * (WORLD_Z - 600), h = world.sampleHeight(x, z), s = world.slopeAt(x, z);
    if (!steep && h > 350 && h < 800 && s > 0.6) steep = [x, z, h]; if (!beach && h > 0.5 && h < 1.6 && world.sampleLand(x, z) < 0.6 && world.sampleUrban(x, z) < 0.05) beach = [x, z, h]; if (!meadow && h > 30 && h < 200 && s < 0.08 && world.sampleUrban(x, z) < 0.01 && vegClass(x, z) === 2) meadow = [x, z, h]; }
  return { peak, steep, beach, meadow };
});
console.log("SPOTS " + JSON.stringify(P));
const fly = (x, y, z, tx, ty, tz) => ev(([x, y, z, tx, ty, tz]) => { cheatGo([x, z], 0); setMode("fly"); camPos.set(x, y, z); const dx = tx - x, dy = ty - y, dz = tz - z; yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(dy, Math.hypot(dx, dz)); }, [x, y, z, tx, ty, tz]);
const [px, pz, ph] = P.peak;
await fly(px + 2600, ph * 0.55, pz + 2600, px, ph * 0.6, pz); await wait(20000); await snap("mountain_far");
await fly(px + 900, ph + 150, pz + 700, px, ph - 100, pz); await wait(18000); await snap("peak_near");
if (P.steep) { const [x, z, h] = P.steep; await fly(x + 120, h + 40, z + 120, x, h, z); await wait(18000); await snap("slope_air"); await ev(([x, z]) => { setMode("walk"); cheatGo([x + 30, z + 30], Math.PI * 1.25); pitch = 0.25; }, [x, z]); await wait(15000); await snap("slope_ground"); }
if (P.beach) { const [x, z] = P.beach; await ev(([x, z]) => { setMode("walk"); cheatGo([x, z], 0.5); pitch = 0.05; }, [x, z]); await wait(14000); await snap("beach"); }
if (P.meadow) { const [x, z] = P.meadow; await ev(([x, z]) => { setMode("walk"); cheatGo([x, z], 0.9); pitch = 0.05; }, [x, z]); await wait(14000); await snap("meadow"); await ev(() => { pitch = -0.05; yaw += 2.2; }); await wait(6000); await snap("meadow_trees"); }
// a forest close up
await ev(() => { for (let k = 0; k < 200000; k++) { const x = 400 + rnd(k, 5, 91) * (WORLD_X - 800), z = 400 + rnd(k, 6, 91) * (WORLD_Z - 800); if (vegClass(x, z) === 1 && world.sampleHeight(x, z) < 300 && world.slopeAt(x, z) < 0.3) { setMode("walk"); cheatGo([x, z], 0.4); pitch = 0.12; return; } } });
await wait(16000); await snap("forest");
// the woods on the hills from a low aircraft's height, and the town trees in a street
await fly(px - 1800, ph * 0.45, pz - 1500, px, ph * 0.35, pz); await wait(22000); await snap("hills_wooded");
await ev(() => { const c = world.cities[0], r = c.roads.find(x => x.halfWidth >= 9 && !x.elevated && !x.link); const p = r.pts[Math.floor(r.pts.length / 3)], q = r.pts[Math.floor(r.pts.length / 3) + 1]; setMode("walk"); cheatGo([p[0] + (q[2] - p[2]) * 0.0, p[2]], Math.atan2(q[0] - p[0], q[2] - p[2])); pitch = 0.08; });
await wait(16000); await snap("street_trees");
await browser.close(); srv.close();
