// Road and tree audit: dead-end roads, buildings standing on roads, and trees on roads, counted across the whole island.
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








const A = await ev(() => {
  // every road on the island as centreline segments with a half width
  const segs = [];
  world.cities.forEach((c, ci) => {
    c.roads.forEach((r, ri) => { if (!r.pts || r.pts.length < 2) return; const P = r.loop ? r.pts.concat([r.pts[0]]) : r.pts; for (let i = 1; i < P.length; i++) segs.push({ a: [P[i-1][0], P[i-1][2]], b: [P[i][0], P[i][2]], hw: r.halfWidth, id: "c" + ci + "r" + ri, el: !!r.elevated, kind: "art" }); });
    (c.streetPlan || []).forEach(L => L.runs.forEach(r => { const a = L.pt(r[0]), b = L.pt(r[1]); segs.push({ a: [a[0], a[1]], b: [b[0], b[1]], hw: L.hw, id: "c" + ci + "s", kind: "street" }); }));
  });
  if (world.highway) { const P = world.highway.pts; for (let i = 1; i < P.length; i++) segs.push({ a: [P[i-1][0], P[i-1][2]], b: [P[i][0], P[i][2]], hw: world.highway.hw, id: "hwy", kind: "hwy" }); }
  // a hash grid of them
  const G = 40, grid = new Map();
  segs.forEach((s, k) => { const r = s.hw + 10; for (let gx = Math.floor((Math.min(s.a[0], s.b[0]) - r) / G); gx <= Math.floor((Math.max(s.a[0], s.b[0]) + r) / G); gx++) for (let gz = Math.floor((Math.min(s.a[1], s.b[1]) - r) / G); gz <= Math.floor((Math.max(s.a[1], s.b[1]) + r) / G); gz++) { const key = gx + "," + gz; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(k); } });
  const dseg = (x, z, s) => { const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / L)); return Math.hypot(s.a[0] + dx * t - x, s.a[1] + dz * t - z); };
  const onRoad = (x, z, pad, skip) => { const l = grid.get(Math.floor(x / G) + "," + Math.floor(z / G)); if (!l) return null; for (const k of l) { const s = segs[k]; if (skip && skip(s)) continue; if (s.el) continue; if (dseg(x, z, s) < s.hw + pad) return s; } return null; };
  // 1. dead ends: the open ends of every arterial, the expressway, and every run of local street
  const ends = [];
  world.cities.forEach((c, ci) => c.roads.forEach((r, ri) => { if (r.loop || !r.pts || r.pts.length < 2) return; const id = "c" + ci + "r" + ri; [r.pts[0], r.pts[r.pts.length - 1]].forEach(p => { if (!onRoad(p[0], p[2], 6, s => s.id === id)) ends.push({ kind: "art", city: c.name, name: r.name || "", x: Math.round(p[0]), z: Math.round(p[2]) }); }); }));
  // street ends: a point used by exactly one street segment
  const deg = new Map(), kq = (x, z) => Math.round(x * 2) + "," + Math.round(z * 2);
  world.cities.forEach(c => { const S = c.streetSegs || []; for (let i = 0; i < S.length; i += 4) { [[S[i], S[i+1]], [S[i+2], S[i+3]]].forEach(p => { const k = kq(p[0], p[1]); deg.set(k, (deg.get(k) || { n: 0, p: p, c: c.name })); deg.get(k).n++; }); } });
  let streetEnds = 0, streetDead = 0; const deadSample = [];
  deg.forEach(v => { if (v.n !== 1) return; streetEnds++; const x = v.p[0], z = v.p[1]; // joined to something else: another street not on this line, an arterial or the expressway
    const l = grid.get(Math.floor(x / G) + "," + Math.floor(z / G)) || []; let joined = false;
    for (const k of l) { const s = segs[k]; if (s.el) continue; if (s.kind !== "street") { if (dseg(x, z, s) < s.hw + 2) { joined = true; break; } continue; }
      // a street segment that does not end at this point and is not collinear-adjacent
      const ea = Math.hypot(s.a[0] - x, s.a[1] - z), eb = Math.hypot(s.b[0] - x, s.b[1] - z); if (ea < 0.6 || eb < 0.6) continue; if (dseg(x, z, s) < 6) { joined = true; break; } }
    if (!joined) { streetDead++; if (deadSample.length < 12) deadSample.push([Math.round(x), Math.round(z), v.c]); } });
  // 2. buildings on roads
  let bOn = 0; const bSample = []; const seenB = new Set();
  solids.forEach((b, bi) => { if (b.deck) return; const half = [b.size[0] / 2, b.size[1] / 2]; const pts = []; for (let u = -1; u <= 1; u += 0.5) for (let v = -1; v <= 1; v += 0.5) pts.push(fromRectLocal(u * half[0] * 0.9, v * half[1] * 0.9, b.c[0], b.c[1], b.yaw));
    for (const p of pts) { const s = onRoad(p[0], p[1], -0.5); if (s) { bOn++; if (bSample.length < 12) bSample.push([Math.round(p[0]), Math.round(p[1]), s.kind, s.id, Math.round(b.h)]); break; } } });
  // 3. trees: the towns' trees, and every countryside tile a road runs through
  const tiles = new Set(); segs.forEach(s => { for (let t = 0; t <= 1; t += 0.25) { const x = s.a[0] + (s.b[0] - s.a[0]) * t, z = s.a[1] + (s.b[1] - s.a[1]) * t; tiles.add(Math.floor(x / VEG_TILE) + "," + Math.floor(z / VEG_TILE)); } });
  const made = []; tiles.forEach(k => { if (veg.trees.has(k)) return; const [tx, tz] = k.split(",").map(Number); if (tx < 0 || tz < 0) return; const g = vegTreeTile(tx, tz); made.push(g); });
  let tOn = 0, tAll = 0; const tSample = { art: 0, street: 0, hwy: 0 }; const tPts = [];
  trunks.map.forEach(l => l.forEach(t => { tAll++; const s = onRoad(t[0], t[1], 0.8); if (s) { tOn++; tSample[s.kind]++; if (tPts.length < 12) tPts.push([Math.round(t[0]), Math.round(t[1]), s.kind, t[3] === "city" ? "town" : "forest"]); } }));
  made.forEach(g => { trunkDrop(g); g.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); }); });
  return { segs: segs.length, artDeadEnds: ends.length, artSample: ends.slice(0, 20), streetEnds, streetDead, deadSample, buildingsOnRoads: bOn, bSample, trees: tAll, treesOnRoads: tOn, tSample, tPts };
});
console.log("AUDIT " + JSON.stringify(A));
await browser.close(); srv.close();
