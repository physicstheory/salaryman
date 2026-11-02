// Air travel end to end: the expressway, the gate, the terminal (hall, ticket office, security, gate, cabin, in-flight screen), Seoul and the islands, and stealing an aircraft with the police and helicopters after you.
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
page.on("console", m => { const t = m.text(); if (/street laid|\[Konto\]/.test(t)) console.log("LOG", t.slice(0, 200)); });
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
for (let i = 0; i < 90; i++) { if (/titleup/.test(await ev(() => document.body.className))) break; await wait(5000); }
await wait(3000);
await page.keyboard.press("Enter");
for (let i = 0; i < 60; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await wait(3000); }
await wait(4000);
await ev(() => { const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); });
await wait(4000);






await ev(() => { document.body.classList.add("camfull"); cheat("MIDDAY"); });
const ok = (name, v, extra) => console.log(v ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
const lanes = await ev(() => {
  const out = { n: traffic.lanes.length, bad: [], elevated: 0 };
  traffic.lanes.forEach((l, i) => {
    if (l.elevated) { out.elevated++; return; }
    let worst = 0, at = null;
    for (let k = 0; k < l.pts.length; k += 2) { const q = sampleLane(l, l.arc[k]), p = [q.x, q.y, q.z], dy = p[1] - world.surfaceY(p[0], p[2]); if (Math.abs(dy) > Math.abs(worst)) { worst = dy; at = [Math.round(p[0]), Math.round(p[2])]; } }
    if (Math.abs(worst) > 2.8) out.bad.push({ i: i, road: l.name || l.road || "", dy: Math.round(worst * 10) / 10, at: at, len: Math.round(l.length) });
  });
  out.badN = out.bad.length; out.bad = out.bad.slice(0, 25); return out;
});
console.log("LANES " + JSON.stringify(lanes));
ok("no ground lane is far from the ground", lanes.badN === 0, { bad: lanes.badN, of: lanes.n });

const tr = await ev(() => {
  let n = 0, bad = 0; const ex = [];
  trunks.map.forEach(l => l.forEach(t => {
    n++;
    for (const c of world.cities) {
      if (c.scramble && Math.hypot(t[0] - c.scramble.at[0], t[1] - c.scramble.at[1]) < c.scramble.radius) { bad++; if (ex.length < 10) ex.push(["scramble", Math.round(t[0]), Math.round(t[1])]); return; }
      for (const r of c.roads) { if (r.elevated || !r.pts) continue; const P = r.pts; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], dx = b[0] - a[0], dz = b[2] - a[2], L = dx * dx + dz * dz || 1, u = clamp(((t[0] - a[0]) * dx + (t[1] - a[2]) * dz) / L, 0, 1); if (Math.hypot(a[0] + dx * u - t[0], a[2] + dz * u - t[1]) < (r.halfWidth || 6) - 0.5) { bad++; if (ex.length < 10) ex.push(["road", Math.round(t[0]), Math.round(t[1]), t[3] === "city" ? "city" : "veg", c.name, r.name || "", r.halfWidth, Math.round(a[1]), Math.round(world.sampleHeight(t[0], t[1])), r.bridge ? "bridge" : "", +t[2].toFixed(2)]); return; } } }
    }
  }));
  return { n: n, bad: bad, ex: ex };
});
console.log("TRUNKS " + JSON.stringify(tr) + " home " + JSON.stringify(await ev(() => home.at)));
ok("no tree trunk stands in a carriageway or the scramble", tr.bad === 0, tr);
await browser.close(); srv.close();
