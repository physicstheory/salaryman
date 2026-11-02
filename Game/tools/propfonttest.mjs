// Detailed props and sign fonts under the game: the engine swaps the city's vending machines and aircon units for its
// textured props, every sign font loads, and nothing throws. Screens: a vending machine close up, a street of signs.
//   node Game/tools/propfonttest.mjs <out-dir>

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
catch (e) { const m = await import(process.env.PLAYWRIGHT || "playwright"); chromium = m.chromium || (m.default && m.default.chromium); }

const mime = { ".html": "text/html", ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".png": "image/png", ".js": "text/javascript", ".json": "application/json" };
const ROOT = path.resolve(here, "../..");
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
page.on("console", m => { const t = m.text(); if (/\[Shigoto\]|error|Error|missing/.test(t)) console.log("LOG", t.slice(0, 220)); });
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
for (let i = 0; i < 120; i++) { if (/titleup/.test(await ev(() => document.body.className))) break; await wait(5000); }
const ok = (name, v, extra) => console.log(v ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
const r = await ev(() => {
  let swapped = 0, inst = 0; scene.traverse(o => { if (o.userData && o.userData.propSwapped) swapped++; if (o.isInstancedMesh && /^(vending|ac):/.test(o.name)) inst += o.count; });
  return { fonts: window.SignFonts ? SignFonts.loaded.size : -1, total: window.SignFonts ? SignFonts.list.length : -1, swapped, inst, tier: gfx.tier, vending: vending.list.length };
});
ok("sign fonts loaded", r.fonts > 55, r);
// a software GPU runs on the low tier, which keeps the cheap boxes: force the swap so the detailed path is exercised
if (!r.swapped) {
  const r2 = await ev(() => { const t = gfx.tier; gfx.tier = "high"; shigoto.dressProps(); gfx.tier = t;
    let swapped = 0, inst = 0; scene.traverse(o => { if (o.userData && o.userData.propSwapped) swapped++; if (o.isInstancedMesh && /^(vending|ac):/.test(o.name)) inst += o.count; }); return { swapped, inst }; });
  Object.assign(r, r2);
}
ok("city props swapped for detailed ones", r.swapped > 0 && r.inst > 0, r);
await snap("title");
await page.keyboard.press("Enter");
for (let i = 0; i < 80; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await ev(() => { if (typeof cut !== "undefined" && cut.active) cutFinish(true); }); await wait(3000); }
await ev(() => { let n = 0; while (typeof cut !== "undefined" && cut.active && n++ < 20) cutFinish(true); cheat("GOTOKONTO"); });
await wait(12000);
await ev(() => { try { if (typeof interiorLeave === "function") interiorLeave(true); } catch (e) {} document.body.classList.add("camfull"); cheat("MIDDAY"); });
await wait(4000);
// stand in front of a vending machine and look at it
await step("vending", async () => {
  await ev(() => {
    const v = vending.list.reduce((b, v) => (!b || Math.hypot(v.at[0] - player.pos.x, v.at[1] - player.pos.z) < Math.hypot(b.at[0] - player.pos.x, b.at[1] - player.pos.z)) ? v : b, null);
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    placeSeiko(new THREE.Vector3(v.at[0] + fx * 3.2 + fz * 1.2, v.groundY, v.at[1] + fz * 3.2 - fx * 1.2)); player.yaw = v.yaw + Math.PI - 0.35;
  });
  await wait(8000); await snap("vending");
});
await ev(() => { cheat("MIDNIGHT"); }); await wait(8000); await snap("vending_night");
await browser.close(); srv.close();
