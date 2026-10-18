// Walks into the shop interiors and photographs them: the room, an item in focus, the close look, trying a shirt on, a demo phone.
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


const face = (x, z) => ev(([px, pz]) => { }, [x, z]);
async function goLift(floorIdx, label) {
  await ev(() => { const R = interior.room; const sp = R.spots.find(x => x.act === "lift"); player.pos.set(R.ox + sp.x - 0.8, interior.floorY, R.oz + sp.z); player.yaw = player.targetYaw = Math.PI / 2; yaw = player.yaw + Math.PI; });
  await wait(1500);
  await page.keyboard.press("KeyE"); await wait(1500); await snap(label + "_lift_menu");
  await ev(i => { interior.lift.sel = i; interiorLiftDraw(); }, floorIdx);
  await page.keyboard.press("Enter"); await wait(3000);
}
async function lookAt(i) {
  await ev(i => {
    const R = interior.room; const e = R.items[Math.min(i, R.items.length - 1)];
    const wp = new THREE.Vector3(); e.mesh.getWorldPosition(wp);
    const fx = Math.sin(e.face), fz = Math.cos(e.face);
    player.pos.set(wp.x + fx * 1.3, interior.floorY, wp.z + fz * 1.3);
    player.yaw = player.targetYaw = Math.atan2(-fx, -fz); yaw = player.yaw + Math.PI;
  }, i);
  await wait(2000);
}

await step("tvs", async () => {
  await ev(() => { enterShop(shops.list.find(x => x.mall)); });
  await wait(2000);
  await goLift(0, "tv");
  for (const i of [0, 2]) {
    await lookAt(i); await page.keyboard.press("KeyE"); await wait(2500); await snap("tv_close_" + i);
    await page.keyboard.press("Escape"); await wait(1200);
  }
  await ev(() => { interiorLeave(true); });
});
await browser.close(); srv.close();
