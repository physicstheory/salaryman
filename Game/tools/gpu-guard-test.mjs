// GPU guard (Web/game/gpu-guard.js): integrated-graphics detection, the tier caps, the texture cap and video-memory ledger, and what a
// lost context leaves behind for the next start. Runs in under a minute with three.js r128 on a blank page (no game boot), ?igpu=1 to force
// the guard on under the cloud's software GL.
//   node Game/tools/gpu-guard-test.mjs            (or PLAYWRIGHT=/path/to/playwright/index.js node ...)
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "../../Web"), VENDOR = path.resolve(here, "../vendor");
let chromium;
try { ({ chromium } = await import("playwright")); }
catch (e) { const m = await import(process.env.PLAYWRIGHT || "playwright"); chromium = m.chromium || (m.default && m.default.chromium); }

const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="stage" style="width:640px;height:360px"></div>
<script src="/vendor/three.min.js"></script><script src="/game/gpu-guard.js"></script>`;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split("?")[0]);
  if (u === "/" || u === "/test.html") { r.setHeader("Content-Type", "text/html"); r.end(PAGE); return; }
  const f = u.startsWith("/vendor/") ? path.join(VENDOR, u.slice(8)) : path.join(WEB, u);
  fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader("Content-Type", f.endsWith(".js") ? "text/javascript" : "application/octet-stream"); r.end(d); });
}).listen(0);
const port = srv.address().port;

let fails = 0;
const check = (ok, what, detail) => { console.log((ok ? "ok   " : "FAIL ") + what + (detail !== undefined ? "  " + JSON.stringify(detail) : "")); if (!ok) fails++; };

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage();
  page.on("pageerror", e => { console.log("page error:", e.message); fails++; });

  // ---- 1  classification of real renderer strings ----
  await page.goto(`http://127.0.0.1:${port}/test.html?igpu=1`);
  const kinds = await page.evaluate(() => {
    const c = GPU_GUARD.classify;
    return {
      irisXe: c("ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"),
      uhd: c("ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)"),
      arc: c("ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"),
      apu: c("ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"),
      rtx: c("ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)"),
      rx: c("ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)"),
      sw: c("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)")
    };
  });
  check(kinds.irisXe === "integrated" && kinds.uhd === "weak" && kinds.arc === "discrete" && kinds.apu === "integrated" && kinds.rtx === "discrete" && kinds.rx === "discrete" && kinds.sw === "software", "renderer strings classified", kinds);

  // ---- 2  tier caps and start tier ----
  const tiers = await page.evaluate(() => {
    const T = { low: { renderScale: 0.8, maxPixelRatio: 1, shadowMap: 1024, tex: 1, far: 1100, cars: 45 }, medium: { renderScale: 1, maxPixelRatio: 1.5, shadowMap: 2048, tex: 2, normalMax: 512, far: 1800, cars: 90 },
      high: { renderScale: 1, maxPixelRatio: 2, shadowMap: 4096, tex: 4, normalMax: 1024, far: 2600, cars: 130 }, ultra: { renderScale: 1.35, maxPixelRatio: 2, shadowMap: 4096, tex: 6, normalMax: 2048, far: 3400, cars: 160 } };
    GPU_GUARD.capTiers(T);
    return { T, start: GPU_GUARD.startTier("high"), on: GPU_GUARD.on };
  });
  check(tiers.on, "guard on with ?igpu=1");
  check(Object.values(tiers.T).every(t => t.maxPixelRatio <= 1 && t.shadowMap <= 2048 && t.tex <= 2 && t.renderScale <= 1 && (t.normalMax || 0) <= 512), "every tier capped", tiers.T.ultra);
  check(tiers.T.medium.renderScale === 0.9 && tiers.T.medium.cars <= 70, "medium trimmed for integrated", tiers.T.medium);
  check(tiers.start === "medium" || tiers.start === "low", "integrated start tier is medium or low", tiers.start);

  // ---- 3  textures: the cap, the ledger, and that a shrunk texture still draws ----
  const tex = await page.evaluate(async () => {
    const r = new THREE.WebGLRenderer({ antialias: false });
    GPU_GUARD.attach(r);
    r.setSize(64, 64, false); document.getElementById("stage").appendChild(r.domElement);
    const gl = r.getContext();
    const mk = (n, col) => { const c = document.createElement("canvas"); c.width = c.height = n; const x = c.getContext("2d"); x.fillStyle = col; x.fillRect(0, 0, n, n); return c; };
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10); cam.position.z = 1;
    const big = new THREE.CanvasTexture(mk(4096, "#ff0000"));
    const mat = new THREE.MeshBasicMaterial({ map: big });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); scene.add(quad);
    r.render(scene, cam);
    const px = new Uint8Array(4); gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const a = GPU_GUARD.report();
    // a decoded bitmap (what GLTFLoader hands three.js) at 2048
    const bmp = await createImageBitmap(mk(2048, "#00ff00"));
    const t2 = new THREE.Texture(bmp); t2.needsUpdate = true; t2.flipY = false; mat.map = t2; mat.needsUpdate = true; r.render(scene, cam);
    const px2 = new Uint8Array(4); gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px2);
    const b = GPU_GUARD.report();
    // a small one is left alone
    const small = new THREE.CanvasTexture(mk(256, "#0000ff")); mat.map = small; mat.needsUpdate = true; r.render(scene, cam);
    const c = GPU_GUARD.report();
    big.dispose(); t2.dispose(); small.dispose(); r.render(scene, cam);
    const d = GPU_GUARD.report();
    // fill past the budget: the cap steps down to 512, then 256
    const many = []; const caps = [];
    for (let i = 0; i < 400 && GPU_GUARD.report().capPx > 256; i++) { const t = new THREE.CanvasTexture(mk(1024, "#808080")); many.push(t); mat.map = t; mat.needsUpdate = true; r.render(scene, cam); caps.push(GPU_GUARD.report().capPx); }
    const e = GPU_GUARD.report();
    window.__r = r;
    return { px: Array.from(px), px2: Array.from(px2), a, b, c, d, e, caps: [...new Set(caps)], room: GPU_GUARD.room(), line: GPU_GUARD.line() };
  });
  check(tex.px[0] > 200 && tex.px[1] < 40, "shrunk 4096 canvas still draws red", tex.px);
  check(tex.px2[1] > 200 && tex.px2[0] < 40, "shrunk 2048 bitmap still draws green", tex.px2);
  check(tex.a.shrunk === 1 && tex.a.textureMb >= 4 && tex.a.textureMb <= 7, "4096 texture went up at 1024 (~5 MB, not ~85 MB)", { shrunk: tex.a.shrunk, mb: tex.a.textureMb });
  check(tex.b.shrunk === 2, "2048 bitmap shrunk", tex.b.shrunk);
  check(tex.c.shrunk === 2, "256 texture left alone", tex.c.shrunk);
  check(tex.d.textureMb <= 1 && tex.d.textures <= 2, "disposed textures leave the ledger (three.js keeps its 1x1 placeholders)", { mb: tex.d.textureMb, n: tex.d.textures });
  check(tex.caps.includes(512) && tex.caps.includes(256), "cap steps down to 512 then 256 as the budget fills", tex.caps);
  check(tex.room >= 1 && tex.room < 1e9, "room() is finite and never 0", tex.room);
  check(/GPU guard .*textures \d+\/\d+ MB/.test(tex.line), "report line", tex.line);

  // ---- 4  a lost context: ledger cleared, next start's budget lowered and remembered ----
  const lost = await page.evaluate(async () => {
    const r = window.__r, ext = r.getContext().getExtension("WEBGL_lose_context");
    const before = GPU_GUARD.report();
    ext.loseContext(); await new Promise(res => setTimeout(res, 300));
    const after = GPU_GUARD.report();
    return { before: before.textureMb, after, saved: localStorage.getItem("konto.igpuBudget") };
  });
  check(lost.after.losses === 1 && lost.after.textureMb === 0, "loss clears the ledger", lost.after);
  check(+lost.saved >= 300 && +lost.saved < lost.after.budgetMb, "next start's budget is lowered", { saved: lost.saved, was: lost.after.budgetMb });
  await page.reload();
  const next = await page.evaluate(() => GPU_GUARD.report());
  check(next.budgetMb === +lost.saved, "the lowered budget is used on the next start", next.budgetMb);

  // ---- 5  off on a discrete card / with ?igpu=0, and the first start of a version clears a stale safe-graphics level ----
  await page.goto(`http://127.0.0.1:${port}/test.html?igpu=0`);
  const off = await page.evaluate(() => { const T = { medium: { maxPixelRatio: 1.5, shadowMap: 2048, renderScale: 1 } }; GPU_GUARD.capTiers(T); return { on: GPU_GUARD.on, T, room: GPU_GUARD.room() }; });
  check(!off.on && off.T.medium.maxPixelRatio === 1.5 && (off.room === null || off.room === Infinity), "?igpu=0 leaves everything alone", off);
  await page.evaluate(() => { localStorage.setItem("konto.gfxSafe", "3"); localStorage.setItem("konto.gpuGuard", "old"); localStorage.setItem("konto.igpuBudget", "320"); });
  await page.goto(`http://127.0.0.1:${port}/test.html?igpu=1`);
  const fresh = await page.evaluate(() => ({ safe: localStorage.getItem("konto.gfxSafe"), budget: GPU_GUARD.budgetMb, ver: localStorage.getItem("konto.gpuGuard") }));
  check(fresh.safe === null && fresh.budget >= 500 && fresh.ver === (await page.evaluate(() => GPU_GUARD.VERSION)), "a new version starts integrated graphics from the top", fresh);

  // ---- 6  older computers (a 2015 MacBook Pro in Chrome): detection, the older-computer tiers, the 512 px cap ----
  const leg = await page.evaluate(() => {
    const L = GPU_GUARD.isLegacy;
    const yes = ["ANGLE (Intel Inc., Intel(R) Iris(TM) Graphics 6100, OpenGL 4.1)", "ANGLE (Intel Inc., ANGLE Metal Renderer: Intel(R) Iris(TM) Graphics 6100, Unspecified Version)",
      "ANGLE (Intel Inc., Intel Iris Pro OpenGL Engine, OpenGL 4.1)", "ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11 vs_5_0 ps_5_0, D3D11)", "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "ANGLE (ATI Technologies Inc., AMD Radeon R9 M370X OpenGL Engine, OpenGL 4.1)", "ANGLE (NVIDIA Corporation, NVIDIA GeForce GT 750M OpenGL Engine, OpenGL 4.1)", "Intel(R) Iris(TM) Plus Graphics 640", "ANGLE (Intel, Intel(R) Iris(R) Pro Graphics 6200 Direct3D11 vs_5_0 ps_5_0, D3D11)"];
    const no = ["ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)", "ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)", "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
      "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)", "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)", "ANGLE (ATI Technologies Inc., AMD Radeon Pro 5700 XT OpenGL Engine, OpenGL 4.1)"];
    return { missed: yes.filter(n => !L(n)), wrong: no.filter(n => L(n)) };
  });
  check(!leg.missed.length && !leg.wrong.length, "older graphics recognised (2015 MacBook Pro Iris 6100 / R9 M370X), modern ones left alone", leg);
  await page.goto(`http://127.0.0.1:${port}/test.html?legacy=1`);
  const lt = await page.evaluate(() => {
    const T = { low: { renderScale: 0.8, maxPixelRatio: 1, shadows: false, shadowMap: 1024, tex: 1, far: 1100, cars: 45, antialias: false, post: false, normals: false },
      medium: { renderScale: 1, maxPixelRatio: 1.5, shadows: true, shadowMap: 2048, tex: 2, normalMax: 512, far: 1800, cars: 90, antialias: true, post: false, normals: true },
      ultra: { renderScale: 1.35, maxPixelRatio: 2, shadows: true, shadowMap: 4096, tex: 6, normalMax: 2048, far: 3400, cars: 160, antialias: true, post: true, normals: true } };
    GPU_GUARD.capTiers(T);
    const r = GPU_GUARD.report();
    return { T, start: GPU_GUARD.startTier("ultra"), legacy: GPU_GUARD.legacy, on: GPU_GUARD.on, cap: r.capPx, budget: r.budgetMb };
  });
  check(lt.legacy && lt.on && lt.start === "low", "?legacy=1: older-computer preset on, starts on low", { legacy: lt.legacy, start: lt.start });
  check(Object.values(lt.T).every(t => t.maxPixelRatio === 1 && t.renderScale <= 0.75 && t.shadowMap <= 1024 && t.tex === 1 && !t.antialias && !t.post && t.far <= 1000 && t.cars <= 30), "every tier cut for older computers", lt.T.ultra);
  check(lt.T.low.renderScale === 0.7 && lt.T.low.far <= 800 && !lt.T.low.shadows, "low is lighter still", lt.T.low);
  check(lt.cap === 512 && lt.budget <= 600, "textures capped at 512 px, budget at most 600 MB", { cap: lt.cap, budget: lt.budget });
  await page.goto(`http://127.0.0.1:${port}/test.html?igpu=1&legacy=0`);
  check(await page.evaluate(() => !GPU_GUARD.legacy && GPU_GUARD.kind !== "legacy"), "?legacy=0 turns the older-computer preset off");
} finally {
  await browser.close(); srv.close();
}
console.log(fails ? "\nGPU guard test: " + fails + " FAILED" : "\nGPU guard test: PASS");
process.exit(fails ? 1 : 0);
