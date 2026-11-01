// lookshots: the same views in the all-anime look and the hyper-real world (anime people) look.
// node tools/lookshots.mjs <out-dir> real|anime
// (adapted from aaashots.mjs) Photographs the AAA chain (EffectComposer: HDR scene, SSAO, bloom, tone map, anime grade, SMAA) and the new shaders (the Gerstner swell,
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
const OUT = path.resolve(process.argv[2] || "lookshots"), LOOK = process.argv[3] || "real", TIER = "high";
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
await ev(() => { window.storyOpening = function () { storyWake(true); }; });
await page.keyboard.press("Enter");
for (let i = 0; i < 90; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await wait(3000); }
for (let i = 0; i < 120; i++) { if (await ev(() => { const b = document.getElementById("boot"); return story.step !== "intro" || (b && getComputedStyle(b).display === "none"); })) break; await wait(2000); }
await ev(() => { try { if (interior.active) interiorLeave(true); } catch (e) {} loadShow(false); const f = document.getElementById("fade"); if (f) f.style.opacity = "0"; });
await wait(3000);
await ev(() => { document.body.classList.add("camfull"); cheat("MIDDAY"); });
console.log("STATE", JSON.stringify(await ev(() => ({ look: LOOK, tier: gfx.tier, fx: fxUsable(), engine: !!(window.shigoto && shigoto.engine) }))));
const at = (dx, dz, py, pyaw, cyaw, pitch) => ev(([dx, dz, py, pyaw, cyaw, pitch]) => { const c = world.cities[0]; setMode("walk"); placeSeiko(new THREE.Vector3(c.scramble.at[0] + dx, 0, c.scramble.at[1] + dz)); player.yaw = player.targetYaw = pyaw; yaw = cyaw; window.pitch = pitch; pitch = pitch; }, [dx, dz, py, pyaw, cyaw, pitch]);
await at(-14, -10, 0, 0, Math.PI * 0.8, 0.12); await wait(9000); await snap("1_street_noon");
await ev(() => { yaw += 2.4; pitch = 0.3; }); await wait(6000); await snap("2_towers_noon");
await ev(() => { player.yaw = player.targetYaw = Math.PI; yaw = 0; pitch = 0.05; phone.open = true; phone.app = "Camera"; phone.zoom = 2; }); await wait(6000); await snap("3_seiko_close");
await ev(() => { phone.open = false; phone.app = null; });
await ev(() => { if (window.shigoto && shigoto.weather) { shigoto.weather("rain", true); if (shigoto.engine) { shigoto.engine.weather.wetness = 1; shigoto.engine.weather.puddles = 0.8; } } yaw += 1.2; pitch = 0.1; }); await wait(10000); await snap("4_rain");
await ev(() => { if (window.shigoto && shigoto.weather) shigoto.weather("clear", true); cheatHour(17.7); }); await wait(8000); await snap("5_dusk");
await ev(() => { cheatHour(21.5); yaw += 2.0; }); await wait(8000); await snap("6_night");
await browser.close(); srv.close();
