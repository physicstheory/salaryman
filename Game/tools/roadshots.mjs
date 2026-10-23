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
const spots = await ev(() => { const c = world.cities[0]; return c.wards.map((w, i) => ({ i, name: w.name, kind: w.kind, core: w.coreness, at: w.centre, yaw: w.yaw, street: w.street, alley: w.alley, alleys: w.alleys, sx: w.sx })).sort((a, b) => b.core - a.core).slice(0, 4); });
console.log(JSON.stringify(spots));
const fly = async (x, z, h, yawA, pitchA, name) => {
  await ev(([x, z, h, ya, pa]) => { setMode("fly"); camPos.set(x, world.surfaceY(x, z) + h, z); yaw = ya; pitch = pa; }, [x, z, h, yawA, pitchA]);
  await wait(5000); await snap(name);
};
let n_ = 0;
for (const sp of spots.slice(0, 3)) {
  n_++;
  const a = sp.yaw * Math.PI / 180;
  // from the air, looking along one set of streets
  await fly(sp.at[0] - Math.sin(a) * 130 * -1, sp.at[1] + Math.cos(a) * 0, 70, -a, -0.62, "air_" + n_ + "_" + sp.name);
  // low and oblique over the junction
  await fly(sp.at[0] + Math.cos(a) * 40, sp.at[1] - Math.sin(a) * 40, 14, -a + Math.PI / 2 * 0 + 0.0, -0.2, "low_" + n_ + "_" + sp.name);
  // on foot at the junction, looking down a street
  await ev(([x, z, a]) => { setMode("walk"); placeSeiko(new THREE.Vector3(x, world.surfaceY(x, z), z)); player.yaw = player.targetYaw = a; yaw = a + Math.PI; pitch = -0.12; }, [sp.at[0] + 6, sp.at[1] + 6, a]);
  await wait(4500); await snap("foot_" + n_ + "_" + sp.name);
}
await browser.close(); srv.close();
