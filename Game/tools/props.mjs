// Photographs every shop interior from several angles, to check how full the floors look (props) and that nothing blocks the way.
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



async function enter(brand) {
  await ev(() => { if (interior.active) interiorLeave(true); }); await wait(500);
  await ev(br => { let s = shops.list.find(x => x.brand === br && !x.safe && !x.mall); if (!s) { const o = shops.list.find(x => x.brand === "sushi"); s = Object.assign({}, o, { brand: br, name: SHOP_BRANDS[br].name }); shops.list.push(s); } enterShop(s); }, brand);
  await wait(2200);
}
const views = [["entry", null], ["east", [-2.5, 0.5, Math.PI / 2]], ["west", [2.5, 0.5, -Math.PI / 2]], ["north", [0, 3.2, Math.PI]], ["south", [0, -3.0, 0]]];
for (const b of ["eleven", "petmart", "pharmacy", "books", "clothes", "arms", "ramen", "sushi", "sushiya"]) {
  await step("shop " + b, async () => {
    await enter(b);
    const info = await ev(() => { const R = interior.room; return { colliders: R.colliders.length }; });
    console.log(b, JSON.stringify(info));
    for (const [nm, v] of views) {
      if (v) await ev(a => { const R = interior.room; player.pos.set(R.ox + a[0], interior.floorY, R.oz + a[1]); player.yaw = player.targetYaw = a[2]; yaw = player.yaw + Math.PI; pitch = -0.12; }, v);
      await wait(1500); await snap(b + "_" + nm);
    }
    // can the player still get from the door to every corner? flood fill over the collider boxes on a 0.25 m grid
    const reach = await ev(() => {
      const R = interior.room, W = IN_W, D = IN_D, rad = 0.32, st = 0.25;
      const free = (x, z) => { if (x < -W / 2 + rad + 0.1 || x > W / 2 - rad - 0.1 || z < -D / 2 + rad + 0.1 || z > D / 2 - rad - 0.1) return false; for (const c of R.colliders) if (x > c.x0 - rad && x < c.x1 + rad && z > c.z0 - rad && z < c.z1 + rad) return false; return true; };
      const nx = Math.round(W / st), nz = Math.round(D / st), seen = new Set(), q = [[0, R.restaurant ? 3.6 : 2.1]];
      let total = 0; for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) if (free(-W / 2 + i * st, -D / 2 + j * st)) total++;
      const key = (x, z) => Math.round(x / st) + "," + Math.round(z / st); seen.add(key(...q[0]));
      while (q.length) { const [x, z] = q.pop(); for (const [dx, dz] of [[st, 0], [-st, 0], [0, st], [0, -st]]) { const a = x + dx, b2 = z + dz, k = key(a, b2); if (!seen.has(k) && free(a, b2)) { seen.add(k); q.push([a, b2]); } } }
      return { reachable: seen.size, free: total };
    });
    console.log(b, "reachable cells", reach.reachable, "of", reach.free);
  });
}
await ev(() => { if (interior.active) interiorLeave(true); });
await browser.close(); srv.close();
