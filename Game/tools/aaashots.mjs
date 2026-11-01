// Photographs the AAA chain (EffectComposer: HDR scene, SSAO, bloom, tone map, anime grade, SMAA) and the new shaders (the Gerstner swell,
// wind in the grass, skin scattering), each view twice: with the chain, and with the older post chain it replaced, for comparison.
//
//   node tools/aaashots.mjs <out-dir> [tier]
//
// Serves Web/ itself and answers the CDN requests from Game/vendor, so it runs offline. Slow under a software GPU.
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "../../Web"), VENDOR = path.resolve(here, "../vendor");
const OUT = path.resolve(process.argv[2] || "aaashots"), TIER = process.argv[3] || "high";
fs.mkdirSync(OUT, { recursive: true });
let chromium;
try { ({ chromium } = await import("playwright")); } catch (e) { const pw = await import(process.env.PLAYWRIGHT || "playwright"); chromium = pw.chromium || pw.default.chromium; }
const mime = { ".html": "text/html", ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".png": "image/png", ".js": "text/javascript", ".json": "application/json" };
const srv = http.createServer((q, r) => {
  let f = path.join(WEB, decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith(path.sep) || f === WEB) f = path.join(WEB, "konto.html");
  fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader("Content-Type", mime[path.extname(f)] || "application/octet-stream"); r.end(d); });
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(t => { try { localStorage.setItem("konto.tier", t); localStorage.setItem("konto.tierPicked", "1"); } catch (e) {} }, TIER);
const page = await ctx.newPage();
page.on("console", m => { const t = m.text(); if (/\[Konto\]|shader|WebGL|THREE|error/i.test(t)) console.log("LOG", t.slice(0, 400)); });
page.on("pageerror", e => console.log("[pageerror]", String(e).slice(0, 300)));
for (const f of ["three.min.js", "GLTFLoader.js", "RGBELoader.js"]) await page.route("**/" + f, r => r.fulfill({ path: path.join(VENDOR, f), contentType: "text/javascript" }));
await page.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
const wait = ms => page.waitForTimeout(ms);
const ev = (f, a) => page.evaluate(f, a);
async function snap(name) {
  const file = path.join(OUT, name + ".png");
  try { await page.screenshot({ path: file, timeout: 240000 }); console.log("saved", file); } catch (e) { console.log("shot failed", name, String(e).slice(0, 80)); }
}
// each view with the new chain, then the old one
async function pair(name, settle) {
  await ev(() => { fx.broken = false; }); await wait(settle || 5000); await snap(name + "_aaa");
  if (process.env.COMPARE) { await ev(() => { fx.broken = true; }); await wait(3000); await snap(name + "_old"); await ev(() => { fx.broken = false; }); }
}

await page.goto(`http://localhost:${port}/konto.html`);
for (let i = 0; i < 120; i++) { if (/titleup/.test(await ev(() => document.body.className))) break; await wait(5000); }
await wait(3000);
// the opening cutscene is skipped: straight to Tōkonto Central, outdoors
await ev(() => { window.storyOpening = function () { storyWake(true); }; });
await page.keyboard.press("Enter");
for (let i = 0; i < 90; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await wait(3000); }
await wait(4000);
console.log("STATE", JSON.stringify(await ev(() => ({ tier: gfx.tier, want: post.want, usable: fxUsable(), env: !!gfx.env, patch: !!water.patch }))));
for (let i = 0; i < 120; i++) { if (await ev(() => { const b = document.getElementById("boot"); return story.step !== "intro" || (b && getComputedStyle(b).display === "none"); })) break; await wait(2000); }
await ev(() => { try { if (interior.active) interiorLeave(true); } catch (e) {} loadShow(false); const f = document.getElementById("fade"); if (f) f.style.opacity = "0"; });
await wait(3000);
await ev(() => { document.body.classList.add("camfull"); cheat("MIDDAY"); });
await wait(3000);
console.log("FX", JSON.stringify(await ev(() => ({ on: fx.on, broken: fx.broken, w: fx.w, h: fx.h, passes: fx.composer ? fx.composer.passes.length : 0 }))));

// 1. the city street: occlusion in the corners, bloom on the glass, the clear coat on the cars
await ev(() => { const c = world.cities[0]; setMode("walk"); placeSeiko(new THREE.Vector3(c.scramble.at[0] - 14, 0, c.scramble.at[1] - 10)); yaw = Math.PI * 0.8; pitch = 0.12; });
await pair("01_street", 8000);
await ev(() => { pitch = 0.3; yaw += 2.4; }); await pair("02_towers", 6000);
// 2. Seiko close: the skin
await ev(() => { player.yaw = player.targetYaw = 0; yaw = Math.PI; pitch = 0.05; phone.open = true; phone.app = "Camera"; phone.zoom = 2; player.yaw = player.targetYaw = Math.PI; });
await wait(3000); await pair("03_skin", 4000);
await ev(() => { phone.open = false; phone.app = null; });
// 3. the sea, from a beach
const beach = await ev(() => beaches.list.length ? { x: beaches.list[0].x, z: beaches.list[0].z, nx: beaches.list[0].nx, nz: beaches.list[0].nz } : null);
console.log("BEACH", JSON.stringify(beach));
if (beach) {
  await ev(b => { setMode("walk"); placeSeiko(new THREE.Vector3(b.x + b.nx * 3, 0, b.z + b.nz * 3)); player.yaw = player.targetYaw = Math.atan2(-b.nx, -b.nz); yaw = player.yaw + Math.PI; pitch = 0.02; }, beach);
  await wait(4000); await ev(b => { player.yaw = player.targetYaw = Math.atan2(-b.nx, -b.nz); yaw = player.yaw + Math.PI; pitch = 0.02; }, beach);
  await pair("04_sea", 8000);
  await ev(() => { cheatHour(17.6); }); await pair("05_sea_dusk", 6000);
  await ev(() => { cheatHour(12); });
}
// 4. a field of grass, in the wind
const field = await ev(() => { for (let k = 0; k < 4000; k++) { const x = 400 + Math.random() * (WORLD_X - 800), z = 400 + Math.random() * (WORLD_Z - 800); if (vegClass(x, z) === 2) return [x, z]; } return null; });
console.log("FIELD", JSON.stringify(field));
if (field) {
  await ev(f => { setMode("walk"); placeSeiko(new THREE.Vector3(f[0], 0, f[1])); pitch = 0.0; vegFill(f[0], f[1]); }, field);
  await pair("06_grass", 8000);
  await wait(700); await snap("06_grass_aaa_b");
}
// 5. the city at night: bloom on the signs
await ev(() => { const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 10, 0, c.scramble.at[1] + 8)); cheatHour(21.5); yaw = Math.PI * 0.3; pitch = 0.15; });
await pair("07_night", 8000);
await ev(() => { scene.traverse(o => { if (o.isMesh && o.material && o.material.uniforms === undefined && o.material.customProgramCacheKey && String(o.material.customProgramCacheKey()) === "konto-water" && o.position.y > 1) o.visible = false; }); }); await wait(3000); await snap("08_night_moat_hidden");
console.log("FX", JSON.stringify(await ev(() => ({ on: fx.on, broken: fx.broken }))));
await browser.close(); srv.close();
