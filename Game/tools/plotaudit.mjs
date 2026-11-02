// Plot audit (was roadaudit.mjs): buildings standing in arterials or local streets per town, and how far each shop door is from a road.
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






const res = await ev(() => {
  const out = {};
  world.cities.slice(0, 3).forEach(city => {
    const b = city.bounds, wards = city.wards || [];
    const wardAt = (x, z) => { let best = null, bd = 1e18; for (const w of wards) { const d = (w.centre[0] - x) ** 2 + (w.centre[1] - z) ** 2; if (d < bd) { bd = d; best = w; } } return best; };
    const wOf = (wd, k) => (wd.alleys && (k & 1) !== 0) ? wd.alley : wd.street;
    const localPen = (x, z) => { const wd = wardAt(x, z); if (!wd || city.footprint(x, z) <= 0.22) return -99; const l = toRectLocal(x, z, wd.centre[0], wd.centre[1], wd.yaw); const k0 = Math.round(l[0] / wd.sx), k1 = Math.round(l[1] / wd.sz); return Math.max(wOf(wd, k0) / 2 - Math.abs(l[0] - k0 * wd.sx), wOf(wd, k1) / 2 - Math.abs(l[1] - k1 * wd.sz)); };
    const arts = city.roads.filter(r => !r.elevated && r.halfWidth >= 4 && r.pts && r.pts.length > 2);
    const segDist = (x, z, a, c) => { const dx = c[0] - a[0], dz = c[2] - a[2], L = dx * dx + dz * dz || 1; let t = ((x - a[0]) * dx + (z - a[2]) * dz) / L; t = Math.max(0, Math.min(1, t)); return Math.hypot(a[0] + dx * t - x, a[2] + dz * t - z); };
    const artPen = (x, z) => { let m = -99; for (const r of arts) { for (let i = 1; i < r.pts.length; i++) { const p = r.pts[i - 1]; if (Math.abs(p[0] - x) > 90 || Math.abs(p[2] - z) > 90) continue; const d = r.halfWidth - segDist(x, z, p, r.pts[i]); if (d > m) m = d; } } return m; };
    let n = 0, vArt = 0, vLoc = 0, ex = [], styles = {};
    for (const s of solids) {
      if (!s.c || s.h < 3 || s.deck || s.style === "deck" || !s.style) continue;
      if (!b || s.c[0] < b.x0 || s.c[0] > b.x1 || s.c[1] < b.z0 || s.c[1] > b.z1) continue;
      n++;
      let wa = -99, wl = -99; const cs = Math.cos(s.yaw * Math.PI / 180), sn = Math.sin(s.yaw * Math.PI / 180);
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const lx = i / 2 * s.size[0] / 2 * 0.9, lz = j / 2 * s.size[1] / 2 * 0.9; const p = fromRectLocal(lx, lz, s.c[0], s.c[1], s.yaw); wa = Math.max(wa, artPen(p[0], p[1])); wl = Math.max(wl, localPen(p[0], p[1])); }
      if (wa > 1.2) { vArt++; if (ex.length < 6) ex.push(["art", Math.round(s.c[0]), Math.round(s.c[1]), Math.round(wa * 10) / 10, s.size.map(Math.round)]); }
      if (wl > 1.2 && ex.length < 6) { let bp = null, bv = -99; for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const q = fromRectLocal(i / 3 * s.size[0] * 0.5, j / 3 * s.size[1] * 0.5, s.c[0], s.c[1], s.yaw), w = wardAt(q[0], q[1]); const v = w ? streetPen(w, q[0], q[1], true) : -99; if (v > bv) { bv = v; bp = [Math.round(q[0]), Math.round(q[1]), w && w.name, w && w.sx, w && w.street]; } } ex.push(["DBG", Math.round(s.c[0]), Math.round(s.c[1]), s.size.map(x => Math.round(x * 10) / 10), s.yaw, "clearWorst", Math.round(bv * 10) / 10, bp, "auditPen", Math.round(wl * 10) / 10]); }
      if (wl > 1.2) { vLoc++; styles[s.style || s.kind || "none"] = (styles[s.style || s.kind || "none"] || 0) + 1; if (ex.length < 12) ex.push(["loc", Math.round(s.c[0]), Math.round(s.c[1]), Math.round(wl * 10) / 10, s.size.map(Math.round), s.style, Object.keys(s).join(",")]); }
    }
    // shops: nearest road and which way the door faces
    const shopRows = [];
    shops.list.filter(s => (s.city === city.name || (!s.city && city === world.cities[0])) && s.door && !s.mall && !s.plaza && !s.safe && !s.airport).slice(0, 400).forEach(s => {
      let best = 1e9, bp = null; const [x, z] = s.door;
      for (const r of arts) for (let i = 1; i < r.pts.length; i++) { const p = r.pts[i - 1]; if (Math.abs(p[0] - x) > 120 || Math.abs(p[2] - z) > 120) continue; const d = segDist(x, z, p, r.pts[i]) - r.halfWidth; if (d < best) best = d; }
      const wd = wardAt(x, z); let loc = 1e9; if (wd) { const l = toRectLocal(x, z, wd.centre[0], wd.centre[1], wd.yaw); const k0 = Math.round(l[0] / wd.sx), k1 = Math.round(l[1] / wd.sz); loc = Math.min(Math.abs(l[0] - k0 * wd.sx) - wOf(wd, k0) / 2, Math.abs(l[1] - k1 * wd.sz) - wOf(wd, k1) / 2); }
      shopRows.push({ art: Math.round(best * 10) / 10, loc: Math.round(loc * 10) / 10 });
    });
    const farShops = shopRows.filter(r => Math.min(r.art, r.loc) > 12).length;
    out[city.name] = { styles: styles, buildings: n, onArterial: vArt, onLocalStreet: vLoc, ex: ex, shops: shopRows.length, shopsFarFromRoad: farShops, shopNearest: shopRows.slice(0, 8) };
  });
  return out;
});
console.log("AUDIT " + JSON.stringify(res, null, 1));

await browser.close(); srv.close();
