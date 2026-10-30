// Walks the original game from the loading screen to a saved game and takes a screenshot of every screen on the way: loading, title, the start in
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

// 1. loading
await page.goto(`http://localhost:${port}/konto.html`);
await wait(2500); await snap("loading_start");
await wait(25000); await snap("loading_later");
// 2. title
for (let i = 0; i < 90; i++) { if (/titleup/.test(await ev(() => document.body.className))) break; await wait(5000); }
await wait(4000); await snap("title");
// 3. the start
await page.keyboard.press("Enter");
for (let i = 0; i < 60; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await wait(3000); }
await wait(6000); await snap("start_mizuho");

// 4. the flat
await step("home", async () => {
  await ev(() => { enterHome(); }); await wait(2500); await snap("home_flat");
  await ev(() => homeMove(1)); await wait(900); await snap("home_flat_eat");
  await ev(() => homeMove(1)); await wait(900); await snap("home_flat_tv");
  await ev(() => { homeMove(-2); });
  await ev(() => { purse.yen -= 1200; bagAdd("onigiri", 1); }); await wait(2600); await snap("autosave_after_purchase");
  await ev(() => homeAct()); await wait(2500); await snap("home_slept_saved_at_bed");
});
console.log("save written:", await ev(() => { const s = localStorage.getItem("konto.save.v1"); return s ? s.length + " bytes" : "none"; }));

// 5. every shop and activity
const brands = await ev(() => { const seen = {}; return shops.list.filter(s => !seen[s.brand] && (seen[s.brand] = 1)).map(s => s.brand); });
console.log("brands:", brands.join(","));
for (const b of brands) {
  await step("shop " + b, async () => {
    await ev(br => enterShop(shops.list.find(s => s.brand === br)), b); await wait(1800); await snap("shop_" + b);
    await ev(() => { if (typeof shopMove === "function") shopMove(1); }); await wait(700);
    await ev(() => { let k = 0; while (shops.inside && k++ < 6) leaveShop(); });
    await wait(500);
  });
}

// 6. the pause menu, every tab
await ev(() => { player.placed && setPaused(false); });
const tabs = await ev(() => PAUSE_TABS);
for (const t of tabs) {
  await step("pause " + t, async () => {
    await ev(tb => { setPaused(true, tb); }, t); await wait(1800); await snap("pause_" + t);
  });
}
await step("map zoom", async () => {
  await ev(() => { setPaused(true, "map"); nav.mapZoom = 2.5; }); await wait(1800); await snap("map_zoomed_out");
  await ev(() => { nav.mapZoom = 12; }); await wait(1800); await snap("map_zoomed_in");
});
await ev(() => setPaused(false)); await wait(800);

// 7. the phone, every app
await step("phone", async () => {
  await ev(() => setPhone(true)); await wait(1800); await snap("phone_home");
  const apps = await ev(() => homeApps().map(a => a[0]));
  for (const a of apps) {
    await step("app " + a, async () => {
      await ev(name => { phone.app = name; phone.sub = 0; phone.dirty = true; }, a); await wait(1500); await snap("app_" + a.toLowerCase());
      await ev(() => { phone.app = null; phone.dirty = true; });
    });
  }
  await ev(() => setPhone(false));
});

// 8. the wheels
await step("wheels", async () => {
  await ev(() => { for (const id of ["onigiri", "canned_coffee"]) bagAdd(id, 2); setWheel(true); }); await wait(1500); await snap("wheel_equipment");
  await ev(() => setWheel(false)); await wait(500);
  await ev(() => setRadioWheel(true)); await wait(1500); await snap("wheel_radio");
  await ev(() => setRadioWheel(false));
});

// 9. the world, then a reload: Continue and the autosave
await wait(2000); await snap("world_after");
await ev(() => saveGame("Game saved.")); await wait(1200); await snap("manual_save_message");
await page.reload();
for (let i = 0; i < 90; i++) { if (/titleup/.test(await ev(() => document.body.className))) break; await wait(5000); }
await wait(4000); await snap("title_with_continue_after_reload");
await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
await wait(8000); await snap("continued_game");
console.log("money after continue:", await ev(() => purse.yen), " bag:", JSON.stringify(await ev(() => bag.counts)));

await browser.close(); srv.close();
