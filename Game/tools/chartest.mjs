// Shigoto characters in the game: the realistic cast loads from people/real, Seiko and the people on the street are drawn by the engine's
// character layer with all four PBR maps, they get wet in the rain, and no shader fails to compile.
//   PLAYWRIGHT=... node Game/tools/chartest.mjs <outdir>     (TIER=ultra to test subdivision on everyone)

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
const errors = [];
page.on("console", m => { const t = m.text(); if (/street laid|\[Konto\]|\[Shigoto\]/.test(t)) console.log("LOG", t.slice(0, 200)); if (m.type() === "error" && /WebGLProgram|Shader|GLSL|ERROR: /.test(t)) errors.push(t.slice(0, 600)); });
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


await page.goto(`http://localhost:${port}/konto.html`, { waitUntil: "commit", timeout: 0 });
for (let i = 0; i < 90; i++) { if (/titleup/.test(await ev(() => document.body.className))) break; await wait(5000); }
await wait(3000);
await page.keyboard.press("Enter");
for (let i = 0; i < 80; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await ev(() => { if (typeof cut !== "undefined" && cut.active) cutFinish(true); }); await wait(3000); }
await wait(4000);
await ev(() => { let n = 0; while (typeof cut !== "undefined" && cut.active && n++ < 20) cutFinish(true); });
await wait(3000);
await ev(() => { let n = 0; while (typeof cut !== "undefined" && cut.active && n++ < 20) cutFinish(true); cheat("GOTOKONTO"); });
await wait(12000);
console.log("STATE", JSON.stringify(await ev(() => ({ cls: document.body.className, cut: cut.active, mode: player.mode, placed: player.placed }))));
if (0) await ev(() => { const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); });

await wait(4000);
const ok = (name, v, extra) => console.log(v ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
await ev(t => { document.body.classList.add("camfull"); cheat("MIDDAY"); applyTier(t, { quiet: true }); syncQualityLabels(); }, process.env.TIER || "high");
for (let i = 0; i < 60; i++) { if (await ev(() => pplLib.ready.length >= 12 && player.hq)) break; await wait(5000); }
const st = await ev(() => {
  const mats = []; if (player.glb || player.obj) (player.glb || player.obj).traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => mats.push([m.name, !!m.userData.shigotoChar, m.userData.charKind, !!m.roughnessMap, !!m.aoMap, !!m.normalMap])); });
  let tris = 0; if (player.glb || player.obj) (player.glb || player.obj).traverse(o => { if (o.isMesh && o.geometry.index) tris += o.geometry.index.count / 3; });
  return { real: pplLib.real, dir: pplLib.dir, ready: pplLib.ready.length, hq: player.hq, outfit: player.outfit, seiko: mats, seikoTris: tris, report: SHIGOTO.characters(THREE).report() };
});
ok("realistic cast loaded from people/real", st.real && st.dir === "people/real/" && st.ready >= 12, { dir: st.dir, ready: st.ready });
ok("Seiko in his realistic body", st.hq && st.seiko.length && st.seiko.every(m => m[1]), st.seiko);
ok("Seiko's skin and clothes carry all four PBR maps", st.seiko.filter(m => m[2] !== "hair").every(m => m[3] && m[4] && m[5]));
ok("no material missing a map", st.report.missing.length === 0, st.report);
console.log("SEIKO TRIS", st.seikoTris, "OUTFIT", st.outfit);
await ev(() => { shigoto.weather && shigoto.weather("rain", true); }); await wait(8000);
const wet = await ev(() => ({ v: SHIGOTO.characters(THREE).uniforms.chWet.value, inside: typeof interior !== "undefined" && interior.active }));
if (wet.inside) ok("people stay dry indoors while it rains", wet.v === 0, wet); else ok("people get wet in the rain", wet.v > 0.05, wet);
await ev(() => { shigoto.weather && shigoto.weather("clear", true); });
await snap("characters_street");
ok("no shader errors", errors.length === 0, errors.slice(0, 3));
await browser.close(); srv.close();
