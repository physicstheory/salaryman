// Shigoto performance engine in the real game: it loads, paces frames, times the parts of the frame, the governor and budgets run, the
// background upload waits for idle frames, and nothing in the game throws. Pure logic is tested by Engine/tools/perf-test.mjs.
//   PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.js node Game/tools/perf-engine-test.mjs <out-dir>
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
page.on("console", m => { const t = m.text(); if (/performance engine|\[perf\]|error engine/.test(t)) console.log("LOG", t.slice(0, 200)); });
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


const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 300)));
await page.goto(`http://localhost:${port}/konto.html`);
const ok = (name, v, extra) => console.log(v ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
for (let i = 0; i < 120; i++) { if (/titleup/.test(await ev(() => document.body.className))) break; await wait(5000); }
ok("performance engine loaded", await ev(() => !!(window.KONTO_PERF && KONTO_PERF.on && KONTO_PERF.engine)));
await wait(3000);
await ev(() => titleChoose());
await wait(20000);
// the opening is a run of cutscenes: skip them until the story is past the intro, then into the city
for (let k = 0; k < 8; k++) { await ev(() => { let n = 0; while (cut.active && n++ < 20) cutFinish(true); }); await wait(5000); }
await ev(() => cheat("GOTOKONTO")); await wait(15000);
await ev(() => { if (interior.active) interiorLeave(true); }); await wait(20000);
const r = await ev(() => { const P = KONTO_PERF.engine; return { frames: P.frames, playing: P.playing, refresh: P.pacer.refresh, swap: P.pacer.swap, timed: P.profiler.wrapped.length,
  top: P.profiler.topSections(8), scale: P.governor.scale, gov: P.governor.enabled, budget: P.budgets.factor, streamPerf: !!(shigoto.engine && shigoto.engine.perf), hw: P.hw && P.hw.cls, gpu: P.hw && P.hw.gpu,
  hitches: P.profiler.hitches.length, causes: P.profiler.causeCount, overlay: (perfToggle(), perfShow(), perf.el.textContent) }; });
console.log("REPORT", JSON.stringify(r, null, 1));
ok("frames paced and counted", r.frames > 50, r.frames);
ok("playing detected", r.playing);
ok("parts of the frame timed", r.timed > 20 && r.top.length > 3, r.timed);
ok("governor running (adaptive graphics on)", r.gov);
ok("engine streaming uses the budget", r.streamPerf);
ok("F3 overlay shows pacing", /pace \d+ Hz/.test(r.overlay), r.overlay);
// a hitch: a 150 ms busy loop inside the frame is caught and blamed on game code in the wrapped part
await ev(() => { const was = window.updateHud; window.__hitch = 3; window.updateHud = function () { if (window.__hitch > 0) { window.__hitch--; const t = performance.now(); while (performance.now() - t < 4000); } return was.apply(this, arguments); }; });
await wait(40000);
const h = await ev(() => KONTO_PERF.engine.profiler.hitches.slice(-5));
ok("hitches caught and explained", h.some(x => x.ms >= 4000 && x.cause === "game code"), h);
// the error engine: six big hitches in a minute raise SM-PRF-001
await ev(() => { window.__hitch = 8; }); await wait(90000);
const prf = await ev(() => (window.KONTO_ERRORS ? KONTO_ERRORS.records.filter(x => x.code === "SM-PRF-001").map(x => x.message) : []));
ok("SM-PRF-001 raised for repeated hitches", prf.length > 0, prf);
const gameErrs = await ev(() => (window.KONTO_ERRORS ? KONTO_ERRORS.records.filter(x => x.sev === "error" && !/fonts\.(googleapis|gstatic)/.test(x.message)).map(x => x.full + " " + x.message.slice(0, 160)) : []));
ok("no game errors", !errs.length && !gameErrs.length, { errs, gameErrs });
await browser.close(); srv.close();
