// Photographs the shopping centres from the street (the mall and plaza blocks) and every floor inside them.
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



const info = await ev(() => shops.list.filter(s => s.mall || s.plaza).map((s, i) => ({ i: i, name: s.name, city: s.city, built: !!s.built, w: Math.round(s.size[0]), d: Math.round(s.size[1]), h: Math.round(s.height || 0), at: s.at, yaw: s.yaw, door: s.door })));
console.log(JSON.stringify(info));
await ev(() => { document.body.classList.add("camfull"); cheat("MIDDAY"); });
const ONLY = process.env.ONLY || "";
const ext = async (idx, tag, hs = 1) => {
  const s = info[idx]; if (!s) return;
  const out = s.yaw, W = Math.max(s.w, s.d);
  // a free camera, so a neighbouring building cannot stand in the way: [name, angle round the building, distance, height, aim height]
  const shots = [["front", out, s.d / 2 + W * 0.5 + 34, 7, 0.42], ["corner", out + 0.8, W * 0.7 + 60, 28, 0.4], ["aerial", out + 2.4, W * 1.1 + 90, 85, 0.3], ["entrance", out, s.d / 2 + 15, 3.5, 0.2]];
  for (const [nm, a, d, h0, k] of shots) { const h = h0 * hs;
    await ev(([s, a, d, h, k]) => {
      setMode("fly");
      const px = s.at[0] + Math.sin(a) * d, pz = s.at[1] + Math.cos(a) * d, gy = world.surfaceY(s.at[0], s.at[1]);
      camPos.set(px, gy + h, pz);
      const ty = gy + s.h * k, dx = s.at[0] - px, dz = s.at[1] - pz, dy = ty - camPos.y, L = Math.hypot(dx, dy, dz);
      yaw = Math.atan2(-dx, -dz); pitch = Math.asin(dy / L);
    }, [s, a, d, h, k]);
    await wait(5000); await snap(tag + "_" + nm);
  }
  await ev(() => setMode("walk"));
};
if (!ONLY) for (const [idx, tag] of [[0, "mallA"], [1, "mallB"], [2, "mallC"]]) await step("ext " + tag, () => ext(idx, tag));
const big = (re, notCity) => { let best = -1, ba = 0; info.forEach((s, i) => { if (re.test(s.name) && (!notCity || s.city !== notCity) && s.w * s.d > ba) { ba = s.w * s.d; best = i; } }); return best; };
await step("ext plaza", () => ext(big(/Plaza/), "plaza", 4));
const farIdx = big(/Dokoto/, "Tōkonto"); if (!ONLY && farIdx >= 0) await step("ext far mall", () => ext(farIdx, "mallTown"));
const plazaTown = big(/Plaza/, "Tōkonto"); if (plazaTown >= 0) await step("ext town plaza", () => ext(plazaTown, "plazaTown", 3));
await ev(() => { document.body.classList.remove("camfull"); });
await ev(() => { const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); });
await wait(3000);
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


if (ONLY) { await browser.close(); srv.close(); process.exit(0); }
await step("mall floors", async () => {
  await ev(() => { enterShop(shops.list.find(x => x.mall)); });
  await wait(2500); await snap("mall_1F_phones");
  await goLift(0, "mall"); await snap("mall_4F_tvs");
  await goLift(1, "mall3"); await snap("mall_3F_games");
  await goLift(2, "mall2"); await snap("mall_2F_watches_consoles_audio");
  await goLift(4, "mallB1"); await snap("mall_B1_cases");
  await goLift(3, "mall1");
  await ev(() => { const R = interior.room; player.pos.set(R.ox, interior.floorY, R.oz + 5.1); }); await wait(2000);
});
await step("plaza floors", async () => {
  await ev(() => { enterShop(shops.list.find(x => x.plaza)); });
  await wait(2500); await snap("plaza_1F_concourse");
  await goLift(0, "plaza"); await snap("plaza_3F_books");
  await goLift(1, "plaza3"); await snap("plaza_2F_fashion");
  await goLift(3, "plaza2"); await snap("plaza_B1_food_hall");
  await goLift(2, "plazaB1");
  await ev(() => { const R = interior.room; player.pos.set(R.ox, interior.floorY, R.oz + 5.1); }); await wait(2000);
});
await browser.close(); srv.close();
