// Whole-map persistence test: boots the game with the persistence engine on and watches the load the way a weak machine would feel it.
//   PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.js node Game/tools/wholemap-test.mjs [outdir] [query]
// Logs every [Konto]/[Shigoto]/[Foundry] line and the JS heap (CDP Runtime.getHeapUsage, which counts what performance.memory hides) every
// 15 s, then prints the persistence report (stages, checks), the front (what is on the graphics card) and the heap at the title.
// Exit code 1 if the page crashed, a stage failed, or a check failed.
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "../../Web"), VENDOR = path.resolve(here, "../vendor");
const OUT = path.resolve(process.argv[2] || "wholemap-out"); fs.mkdirSync(OUT, { recursive: true });
const QS = process.argv[3] ?? "";
let chromium;
try { ({ chromium } = await import("playwright")); } catch (e) { const m = await import(process.env.PLAYWRIGHT || "playwright"); chromium = m.chromium || (m.default && m.default.chromium); }
const mime = { ".ogg": "audio/ogg", ".html": "text/html", ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".png": "image/png", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml" };
const srv = http.createServer((q, r) => {
  let f = path.join(WEB, decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith(path.sep) || f === WEB) f = path.join(WEB, "konto.html");
  fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader("Content-Type", mime[path.extname(f)] || "application/octet-stream"); r.end(d); });
}).listen(0);
const port = srv.address().port;
const t0 = Date.now(), T = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4) + "s";
const log = fs.createWriteStream(path.join(OUT, "log.txt"));
const say = s => { console.log(s); log.write(s + "\n"); };
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-precise-memory-info", "--js-flags=--max-old-space-size=4096"] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const cdp = await page.context().newCDPSession(page);
let crashed = false;
page.on("crash", () => { crashed = true; say(T() + " PAGE CRASHED"); });
page.on("pageerror", e => say(T() + " [pageerror] " + String(e).slice(0, 300)));
page.on("console", m => { const t = m.text(); if (/^\[(Konto|Shigoto|Foundry|Career)\]|shader error|context lost/i.test(t) && !/loaded$/.test(t)) say(T() + " " + t.slice(0, 300)); });
await page.route("**/three.min.js", r => r.fulfill({ path: path.join(VENDOR, "three.min.js"), contentType: "text/javascript" }));
await page.route("**/GLTFLoader.js", r => r.fulfill({ path: path.join(VENDOR, "GLTFLoader.js"), contentType: "text/javascript" }));
await page.route("**/RGBELoader.js", r => r.fulfill({ path: path.join(VENDOR, "RGBELoader.js"), contentType: "text/javascript" }));
await page.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
const heap = async () => { try { const h = await cdp.send("Runtime.getHeapUsage"); return Math.round(h.usedSize / 1e6) + " MB used of " + Math.round(h.totalSize / 1e6) + (h.embedderHeapUsedSize ? " (+" + Math.round(h.embedderHeapUsedSize / 1e6) + " embedder)" : "") + ", backing stores " + Math.round((h.backingStorageSize || 0) / 1e6) + " MB"; } catch (e) { return "?"; } };
await page.goto(`http://localhost:${port}/konto.html${QS}`, { waitUntil: "commit" });
let up = false;
for (let i = 0; i < 400 && !crashed; i++) {
  try { if (/titleup/.test(await page.evaluate(() => document.body.className))) { up = true; break; } } catch (e) { if (crashed) break; }
  if (i % 3 === 0) { let bar = ""; try { bar = await page.evaluate(() => { const b = document.querySelector("#bootbar i"); return (b ? b.style.width : "") + " " + (document.getElementById("bootstage") || {}).textContent; }); } catch (e) {} say(T() + " heap " + (await heap()) + " | " + bar); }
  await page.waitForTimeout(5000);
}
let fail = crashed || !up;
if (up) {
  say(T() + " title. heap " + (await heap()));
  const rep = await page.evaluate(() => {
    const P = PERSIST.engine, r = P && P.report;
    return { report: r ? { ms: r.ms, residentMb: r.residentMb, budgetMb: r.budgetMb, stages: r.stages.map(s => ({ name: s.name, ok: s.ok, ms: s.ms, error: s.error, result: JSON.stringify(s.result || "").slice(0, 300) })), checks: r.checks.map(c => ({ c: c.framework + " / " + c.name, ok: c.ok, detail: String(c.detail || "").slice(0, 300) })) } : null,
      front: window.shigoto && shigoto.front ? shigoto.front() : null, gpu: renderer.info.memory, programs: (renderer.info.programs || []).length };
  });
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(rep, null, 1));
  if (!rep.report) { say("no persistence report: the load did not run"); fail = true; }
  else {
    for (const s of rep.report.stages) say((s.ok ? "  ok   " : "  FAIL ") + s.name.padEnd(12) + String(s.ms).padStart(7) + " ms  " + (s.error || s.result));
    for (const c of rep.report.checks) say((c.ok ? "  ok   " : "  FAIL ") + c.c + ": " + c.detail);
    say("front " + JSON.stringify(rep.front) + " gpu " + JSON.stringify(rep.gpu) + " programs " + rep.programs);
    if (rep.report.stages.some(s => !s.ok) || rep.report.checks.some(c => !c.ok)) fail = true;
  }
  try { await page.screenshot({ path: path.join(OUT, "title.png") }); } catch (e) {}
  // close-ups of kept building detail (an office block and a designed house), drawn off-screen from a camera of our own
  for (const kind of ["office", "house"]) {
    try {
      const url = await page.evaluate(kind => {
        const T = THREE, list = [...PERSIST.detail.map.entries()].filter(([b]) => kind === "house" ? !!b.house : !b.house && b.h > 12);
        const [b, e] = list[Math.floor(list.length / 3)]; const g = e.obj, was = g.visible; g.visible = true;
        const W = 960, H = 540, rt = new T.WebGLRenderTarget(W, H), cam = new T.PerspectiveCamera(50, W / H, 0.5, 4000);
        const yaw = b.yaw * Math.PI / 180, dist = Math.max(b.size[0], b.size[1], b.h) * 1.4 + 8;
        cam.position.set(b.c[0] + Math.sin(yaw + 0.6) * dist, b.y + Math.max(4, b.h * 0.45), b.c[1] + Math.cos(yaw + 0.6) * dist); cam.lookAt(b.c[0], b.y + b.h * 0.45, b.c[1]); cam.updateMatrixWorld();
        const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(scene, cam); const px = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, px); renderer.setRenderTarget(prev); rt.dispose(); g.visible = was;
        const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"), im = x.createImageData(W, H);
        for (let y = 0; y < H; y++) im.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
        x.putImageData(im, 0, 0); return c.toDataURL("image/png");
      }, kind);
      fs.writeFileSync(path.join(OUT, "detail_" + kind + ".png"), Buffer.from(url.split(",")[1], "base64")); say("saved detail_" + kind + ".png");
    } catch (e) { say("close-up " + kind + " failed: " + String(e).slice(0, 200)); }
  }
}
say(fail ? "FAIL" : "PASS");
await browser.close(); srv.close(); log.end();
process.exit(fail ? 1 : 0);
