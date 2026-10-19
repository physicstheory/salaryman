// Collects the data for the interactive map page: a render of the city map, every place with its coordinates, and a street-view shot of each.
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


const fsx = fs;
await page.goto(`http://localhost:${port}/konto.html`);
for (let i = 0; i < 90; i++) { if (/titleup/.test(await ev(() => document.body.className))) break; await wait(5000); }
await wait(3000); await page.keyboard.press("Enter");
for (let i = 0; i < 60; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await wait(3000); }
await wait(4000);
await ev(() => { const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); cheat("MIDDAY"); });
await wait(3000);

// the places
const data = await ev(() => {
  const c = world.cities[0], b = c.bounds, pad = 120;
  const inCity = (x, z) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;
  const street = (x, z) => { try { return placeAt(x, z).street || ""; } catch (e) { return ""; } };
  const places = [];
  shops.list.forEach((s, i) => {
    if (s.vend) return;
    const at = s.door || s.at; if (!inCity(at[0], at[1])) return;
    places.push({ id: "shop" + i, kind: s.mall ? "mall" : s.plaza ? "plaza" : s.safe ? "hotel" : "shop", brand: s.brand, name: s.name || (SHOP_BRANDS[s.brand] && SHOP_BRANDS[s.brand].name) || s.brand, x: s.at[0], z: s.at[1], door: s.door, yaw: s.yaw, street: street(at[0], at[1]) });
  });
  hospitals.list.forEach((h, i) => { if (inCity(h.door[0], h.door[1])) places.push({ id: "hosp" + i, kind: "hospital", brand: "hospital", name: h.name, x: h.at[0], z: h.at[1], door: h.door, yaw: h.yaw, street: street(h.door[0], h.door[1]) }); });
  c.stations.forEach((st, i) => places.push({ id: "stn" + i, kind: "station", brand: "station", name: (st.name || "Station") + (st.terminus ? " (terminus)" : ""), x: st.centre[0], z: st.centre[1], door: null, yaw: st.yaw || 0, street: street(st.centre[0], st.centre[1]) }));
  return { city: c.name, bounds: b, places };
});
console.log("places:", data.places.length, data.places.map(p => p.kind).join(","));

// the map, drawn by the game's own map code
const base = await ev(({ b }) => {
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, across = Math.max(b.x1 - b.x0, b.z1 - b.z0) * 1.12;
  const cv = document.createElement("canvas"); cv.width = cv.height = 2400;
  const g = cv.getContext("2d");
  drawMapView(g, 2400, 2400, cx, cz, across, 0, { labels: true, markers: false, route: false, alwaysPlayer: false });
  return { cx, cz, across, png: cv.toDataURL("image/png") };
}, { b: data.bounds });
fsx.writeFileSync(path.join(OUT, "map.png"), Buffer.from(base.png.split(",")[1], "base64"));
data.map = { cx: base.cx, cz: base.cz, across: base.across };
fsx.writeFileSync(path.join(OUT, "places.json"), JSON.stringify(data, null, 1));
console.log("map saved", JSON.stringify(data.map));

// a street view of each
await ev(() => document.body.classList.add("camfull"));
for (const pl of data.places) {
  await step(pl.id, async () => {
    await ev((p) => {
      const out = p.door ? p.yaw : 0, dx = p.door ? p.door[0] : p.x, dz = p.door ? p.door[1] : p.z;
      const dist = p.door ? 6.5 : 26, px = dx + Math.sin(out) * dist, pz = dz + Math.cos(out) * dist;
      placeSeiko(new THREE.Vector3(px, world.surfaceY(px, pz), pz));
      player.yaw = player.targetYaw = out + Math.PI; yaw = out; pitch = -0.07;
    }, pl);
    await wait(3500);
    const f = path.join(OUT, pl.id + ".jpg");
    await page.screenshot({ path: f, type: "jpeg", quality: 82, timeout: 240000 });
    console.log("shot", pl.id, pl.name);
  });
}
await browser.close(); srv.close();
