// The asset gallery: every building style, the landmarks, every vehicle the game has (cars, bikes, the service vehicles, the exotics),
// the aircraft, the trains, the boats and the people, each photographed where it stands in the game world at the ultra setting, at
// midday, with the traffic cleared out of the way. One PNG per subject in <out-dir>/<section>/, and a labelled contact sheet per section
// (<out-dir>/<section>.png) when ImageMagick's montage is on the PATH.
//
//   node tools/gallery.mjs <out-dir> [section ...]       sections: buildings landmarks vehicles aircraft boats people (default: all)
//
// Needs Playwright; serves Web/ and answers the CDN requests from Game/vendor, so it runs offline. Under a software GPU each frame at
// ultra takes a while; the whole gallery is twenty minutes or so.
import http from "http";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "../../Web"), VENDOR = path.resolve(here, "../vendor");
const OUT = path.resolve(process.argv[2] || "gallery");
// a section can be cut down to a slice of its subjects: vehicles@0-19 is the first twenty vehicles
const ARGS = process.argv.slice(3).length ? process.argv.slice(3) : ["buildings", "landmarks", "vehicles", "aircraft", "boats", "people"];
const WANT = ARGS.map(a => a.split("@")[0]);
const SLICE = Object.fromEntries(ARGS.filter(a => a.includes("@")).map(a => { const [k, r] = a.split("@"); const [lo, hi] = r.split("-").map(Number); return [k, [lo, hi]]; }));
const sliced = (sec, list) => SLICE[sec] ? list.slice(SLICE[sec][0], SLICE[sec][1] + 1) : list;
fs.mkdirSync(OUT, { recursive: true });
let chromium;
try { ({ chromium } = await import("playwright")); }
catch (e) { ({ chromium } = await import(process.env.PLAYWRIGHT || "playwright")); }

const mime = { ".html": "text/html", ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".js": "text/javascript", ".json": "application/json" };
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
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const TIER = process.env.GAL_TIER || "ultra";
await ctx.addInitScript(t => { try { localStorage.setItem("konto.tier", t); } catch (e) {} }, TIER);
const page = await ctx.newPage();
page.on("pageerror", e => console.log("[pageerror]", String(e).slice(0, 200)));
await page.route("**/three.min.js", r => r.fulfill({ path: path.join(VENDOR, "three.min.js"), contentType: "text/javascript" }));
await page.route("**/GLTFLoader.js", r => r.fulfill({ path: path.join(VENDOR, "GLTFLoader.js"), contentType: "text/javascript" }));
await page.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
const wait = ms => page.waitForTimeout(ms);
const ev = (f, a) => page.evaluate(f, a);
const shots = {};
async function snap(section, name) {
  fs.mkdirSync(path.join(OUT, section), { recursive: true });
  const file = path.join(OUT, section, String((shots[section] = (shots[section] || 0) + 1) + (SLICE[section] ? SLICE[section][0] : 0)).padStart(2, "0") + "_" + name.replace(/[^\w-]+/g, "_") + ".png");
  try { await page.screenshot({ path: file, timeout: 300000 }); console.log("saved", file); }
  catch (e) { console.log("shot failed", name, String(e).slice(0, 80)); }
}
async function step(name, fn) { try { await fn(); } catch (e) { console.log("step failed", name, String(e).slice(0, 200)); } }
// put the camera at x,y,z looking at tx,ty,tz
const look = (p, t) => ev(([p, t]) => {
  setMode("fly"); camPos.set(p[0], p[1], p[2]);
  const dx = t[0] - p[0], dy = t[1] - p[1], dz = t[2] - p[2];
  yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(dy, Math.hypot(dx, dz));
}, [p, t]);

await page.goto(`http://localhost:${port}/konto.html`);
for (let i = 0; i < 120; i++) { if (/titleup/.test(await ev(() => document.body.className))) break; await wait(5000); }
await wait(3000);
await page.keyboard.press("Enter");
for (let i = 0; i < 80; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await wait(3000); }
await wait(5000);
console.log("tier", await ev(() => gfx.tier));
await ev(() => { document.body.classList.add("camfull"); cheat("MIDDAY"); const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); });
await wait(20000);                                  // the people and the car models arrive
// a quiet city: the traffic off the roads, so a subject is not hidden behind a bus
const quiet = () => ev(() => { traffic.max = 0; traffic.cars.forEach(c => { c.live = false; }); traffic.byLane.forEach(l => { l.length = 0; }); });
await quiet();

// ---- buildings: one of every facade style, the most building-like one of each
if (WANT.includes("buildings")) {
  const picks = await ev(() => {
    const by = {};
    solids.forEach(b => {
      if (!b.style || b.deck || b.shoulder || !b.size || b.h < 4) return;
      const score = Math.min(b.h, 45) * Math.min(b.size[0], b.size[1], 30) * (b.landmark ? 0.1 : 1);
      if (!by[b.style] || score > by[b.style].score) by[b.style] = { score, c: b.c, size: b.size, yaw: b.yaw, y: b.y, h: b.h, style: b.style };
    });
    return Object.values(by);
  });
  for (const b of picks) await step("building " + b.style, async () => {
    const view = await ev(b => {
      const R = Math.max(b.size[0], b.size[1]) * 0.75 + Math.min(b.h, 60) * 0.55 + 12;
      for (let k = 0; k < 16; k++) {
        const a = (b.yaw * Math.PI / 180) + k * Math.PI / 8 + 0.35, x = b.c[0] + Math.sin(a) * R, z = b.c[1] + Math.cos(a) * R;
        let clear = !insideBuilding(x, z, 1.5);
        for (let t = 0.3; t < 0.9 && clear; t += 0.15) if (insideBuilding(b.c[0] + (x - b.c[0]) * (1 - t), b.c[1] + (z - b.c[1]) * (1 - t), 0.2) && t > 0.55) clear = false;
        if (clear) return [x, world.surfaceY(x, z) + Math.min(b.h * 0.35, 16) + 2, z];
      }
      const a = b.yaw * Math.PI / 180 + 0.35; return [b.c[0] + Math.sin(a) * R, b.y + b.h * 0.6 + 10, b.c[1] + Math.cos(a) * R];
    }, b);
    await ev(v => placeSeiko(new THREE.Vector3(v[0], world.surfaceY(v[0], v[2]), v[2])), view);
    await wait(2500);
    await look(view, [b.c[0], b.y + Math.min(b.h, 60) * 0.42, b.c[1]]);
    await wait(5000); await snap("buildings", b.style);
  });
}

// ---- landmarks and the places
if (WANT.includes("landmarks")) {
  const spots = await ev(() => {
    const out = [], c0 = world.cities[0];
    const tall = solids.filter(b => b.landmark).sort((a, b) => b.h - a.h)[0];
    if (tall) out.push({ name: "tower", t: [tall.c[0], tall.y + tall.h * 0.45, tall.c[1]], r: tall.h * 0.9 + 40, h: tall.h * 0.3 });
    if (c0.moat) out.push({ name: "palace_moat", t: [c0.moat.centre[0], c0.moat.waterY + 6, c0.moat.centre[1]], r: c0.moat.inner + c0.moat.width + 40, h: 30 });
    if (c0.stations[0]) out.push({ name: "station", t: [c0.stations[0].centre[0], c0.stations[0].groundY || world.surfaceY(c0.stations[0].centre[0], c0.stations[0].centre[1]), c0.stations[0].centre[1]], r: 55, h: 14 });
    out.push({ name: "scramble_crossing", t: [c0.scramble.at[0], c0.scramble.groundY + 4, c0.scramble.at[1]], r: 45, h: 18 });
    const mall = shops.list.find(s => s.mall); if (mall) out.push({ name: "mall", t: [mall.at[0], world.surfaceY(mall.at[0], mall.at[1]) + 8, mall.at[1]], r: 70, h: 18 });
    const cop = shops.list.find(s => s.police); if (cop) out.push({ name: "police_box", t: [cop.at[0], world.surfaceY(cop.at[0], cop.at[1]) + 3, cop.at[1]], r: 22, h: 5 });
    const shop = shops.list.find(s => !s.mall && !s.plaza && !s.police && !s.safe && !s.airport); if (shop) out.push({ name: "konbini_shopfront", t: [shop.at[0], world.surfaceY(shop.at[0], shop.at[1]) + 3, shop.at[1]], r: 18, h: 3 });
    if (hospitals.list[0]) { const h = hospitals.list[0]; const p = h.at || h.door || h.c; if (p) out.push({ name: "hospital", t: [p[0], world.surfaceY(p[0], p[1]) + 8, p[1]], r: 60, h: 16 }); }
    const shrine = c0.plots.find(p => p.kind === "shrine"); if (shrine) out.push({ name: "shrine", t: [shrine.centre[0], shrine.groundY + 3, shrine.centre[1]], r: Math.max(shrine.size[0], shrine.size[1]) * 0.8 + 10, h: 8 });
    if (carparks.list[0]) { const c = carparks.list[0]; out.push({ name: "car_park", t: [c.c[0], c.gy + 5, c.c[1]], r: c.w * 0.9 + 20, h: 14 }); }
    if (onsens.list[0]) { const o = onsens.list[0]; out.push({ name: "onsen", t: [o.door[0], world.surfaceY(o.door[0], o.door[1]) + 3, o.door[1]], r: 30, h: 8 }); }
    if (garage.built) out.push({ name: "home_garage", t: [garage.centre[0], garage.gy + 1.5, garage.centre[1]], r: 16, h: 4 });
    const vil = world.cities.find(c => c.site && c.site.village); if (vil) { const p = vil.plots.find(q => !q.absorbed && q.kind !== "park"); if (p) out.push({ name: "village_" + vil.name, t: [p.centre[0], p.groundY + 4, p.centre[1]], r: 40, h: 12 }); }
    const coast = world.cities.find(c => c.region === "coast" || /coast/i.test(c.kind || "")); if (coast && coast.plots[0]) { const p = coast.plots[0]; out.push({ name: "coast_town_" + coast.name, t: [p.centre[0], p.groundY + 4, p.centre[1]], r: 40, h: 12 }); }
    if (ski.list[0]) { const R = ski.list[0].res; out.push({ name: "ski_resort", t: [R.base[0], world.surfaceY(R.base[0], R.base[1]) + 6, R.base[1]], r: 70, h: 25 }); }
    if (world.airports && world.airports[0]) { const ap = world.airports[0]; out.push({ name: "airport", t: [ap.cx, (ap.y || world.surfaceY(ap.cx, ap.cz)) + 10, ap.cz], r: 420, h: 120 }); }
    return out;
  });
  for (const s of spots) await step("landmark " + s.name, async () => {
    const view = await ev(s => {
      for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8 + 0.6, x = s.t[0] + Math.sin(a) * s.r, z = s.t[2] + Math.cos(a) * s.r;
        if (!insideBuilding(x, z, 2) && world.sampleHeight(x, z) > 0.4) return [x, world.surfaceY(x, z) + s.h, z];
      }
      return [s.t[0] + s.r, s.t[1] + s.h, s.t[2]];
    }, s);
    await ev(v => placeSeiko(new THREE.Vector3(v[0], world.surfaceY(v[0], v[2]), v[2])), view);
    await wait(4000); await quiet();
    await look(view, s.t);
    await wait(6000); await snap("landmarks", s.name);
  });
}

// ---- every vehicle: each spawned as the game spawns it (cheat), parked on a quiet street and photographed from the front quarter
if (WANT.includes("vehicles")) {
  let kinds = sliced("vehicles", await ev(() => CAR_KINDS.map(k => k.name)));
  if (process.env.GAL_KINDS) kinds = kinds.filter(k => process.env.GAL_KINDS.split(",").includes(k));
  const stage = await ev(() => { const c = world.cities[0], a = c.scramble.at; return [a[0] + 4, c.scramble.groundY, a[1] + 4]; });
  for (const k of kinds) await step("vehicle " + k, async () => {
    await ev(([k, st]) => {
      setMode("walk"); if (drive.car) leaveCar(); drive.parked = drive.parked.filter(p => p.scenery || p.owned);
      placeSeiko(new THREE.Vector3(st[0], st[1], st[2]));
      cheatSpawn(k);
      const c = drive.car; if (!c) return;
      c.pos.set(st[0], world.walkY(st[0], st[2], st[1]) + 0.04, st[2]); c.yaw = 0.6; c.speed = 0; if (c.vel) c.vel.set(0, 0);
      if (c.colour) { const pal = PAINT[CAR_KINDS[c.kind].palette || "common"] || PAINT.common; if (!CAR_KINDS[c.kind].colour) c.colour = pal[(CAR_KINDS.indexOf(CAR_KINDS[c.kind]) * 3) % pal.length].slice(); }
    }, [k, stage]);
    await quiet();
    const L = await ev(k => (CAR_KINDS.find(q => q.name === k) || { L: 4 }).L, k);
    const r = Math.max(5.5, L * 1.25 + 2.5);
    await look([stage[0] + Math.sin(0.6 + 0.75) * r, stage[1] + Math.max(1.5, L * 0.28), stage[2] + Math.cos(0.6 + 0.75) * r], [stage[0], stage[1] + 0.8, stage[2]]);
    await wait(4500); await snap("vehicles", k);
  });
  await ev(() => { if (drive.car) leaveCar(); setMode("walk"); });
}

// ---- aircraft and trains: the airliners at the gates, a helicopter, a train at a platform
if (WANT.includes("aircraft")) {
  await step("aircraft", async () => {
    const planes = await ev(() => { const ap = world.airports && world.airports[0]; if (!ap || !ap.planes) return []; return ap.planes.map(p => ({ x: p.wx, z: p.wz, y: ap.y, len: p.len })); });
    const seen = new Set();
    for (const p of planes) {
      if (seen.has(p.len)) continue; seen.add(p.len);
      await ev(p => placeSeiko(new THREE.Vector3(p.x + p.len, world.surfaceY(p.x + p.len, p.z), p.z + p.len)), p);
      await wait(4000);
      await look([p.x + p.len * 0.9, p.y + p.len * 0.25 + 4, p.z + p.len * 0.9], [p.x, p.y + p.len * 0.08, p.z]);
      await wait(6000); await snap("aircraft", "airliner_" + p.len + "m");
    }
    // the helicopter, hung in the air over the apron
    await ev(() => { const ap = world.airports[0]; const m = heliMesh(); m.position.set(ap.cx + 60, (ap.y || 0) + 14, ap.cz + 60); m.rotation.y = 0.8; scene.add(m); window.__heli = m; });
    await look(await ev(() => { const p = window.__heli.position; return [p.x + 14, p.y + 3, p.z + 14]; }), await ev(() => { const p = window.__heli.position; return [p.x, p.y, p.z]; }));
    await wait(5000); await snap("aircraft", "helicopter");
    // a train, wherever the first one running is
    const tr = await ev(() => {
      const s = rail.sets.find(q => q.live); if (!s) return null;
      const p = sampleLane(rail.lines[s.line], s.s); return [p.x, p.y, p.z, p.yaw];
    });
    if (tr) {
      await ev(t => placeSeiko(new THREE.Vector3(t[0] + 30, world.surfaceY(t[0] + 30, t[2] + 30), t[2] + 30)), tr);
      const t2 = await ev(() => { const s = rail.sets.find(q => q.live); const p = sampleLane(rail.lines[s.line], s.s); return [p.x, p.y, p.z, p.yaw]; });
      const a = t2[3] + 1.0; await look([t2[0] + Math.sin(a) * 26, t2[1] + 6, t2[2] + Math.cos(a) * 26], [t2[0], t2[1] + 2, t2[2]]);
      await wait(1500); await snap("aircraft", "train");
    }
  });
}

// ---- boats: whatever floats in the harbours
if (WANT.includes("boats")) {
  await step("boats", async () => {
    const list = await ev(() => (typeof boats !== "undefined" && boats.list ? boats.list : []).map(b => ({ name: b.name || b.kind || "boat", x: b.x, z: b.z, y: b.y || 0, len: b.len || 12 })));
    console.log("boats", list.length);
    const seen = new Set();
    for (const b of list) {
      if (seen.has(b.name)) continue; seen.add(b.name);
      await ev(b => placeSeiko(new THREE.Vector3(b.x + b.len + 10, world.surfaceY(b.x + b.len + 10, b.z), b.z)), b);
      await wait(4000);
      await look([b.x + b.len * 1.1, b.y + b.len * 0.3 + 3, b.z + b.len * 1.1], [b.x, b.y + 1.5, b.z]);
      await wait(5000); await snap("boats", b.name);
    }
  });
}

// ---- the people: every one of them in a line on the pavement, standing as they stand, and then the street at rush hour
if (WANT.includes("people")) {
  await step("people", async () => {
    const n = await ev(() => {
      const c = world.cities[0], a = c.scramble.at, gy = c.scramble.groundY;
      (window.__line || []).forEach(f => scene.remove(f.holder));
      window.__line = pplLib.ready.map((e, i) => { const f = pplFigure(e, 1); f.holder.position.set(a[0] + (i - (pplLib.ready.length - 1) / 2) * 0.95, gy, a[1] + 6); f.holder.rotation.y = 0; scene.add(f.holder); pedPlay(f, "idle"); return f; });
      clearInterval(window.__mix); window.__mix = setInterval(() => window.__line.forEach(f => f.mixer.update(0.016)), 16);
      return pplLib.ready.length;
    });
    console.log("people", n);
    const c = await ev(() => { const c = world.cities[0]; return [c.scramble.at[0], c.scramble.groundY, c.scramble.at[1]]; });
    const half = Math.max(2, n * 0.5);
    for (let part = 0; part < Math.ceil(n / 6); part++) {
      const x = c[0] + (part * 6 + 2.5 - (n - 1) / 2) * 0.95;
      await look([x, c[1] + 1.55, c[2] + 6 + 5.2], [x, c[1] + 1.0, c[2] + 6]);
      await wait(4000); await snap("people", "lineup_" + (part + 1));
    }
    await look([c[0] - half * 0.95 - 3, c[1] + 2.4, c[2] + 6 + 7], [c[0], c[1] + 1.0, c[2] + 6]);
    await wait(3000); await snap("people", "lineup_all");
    // the player, in the clothes he starts in
    await ev(() => { setMode("walk"); const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 3, c.scramble.groundY, c.scramble.at[1] - 3)); player.yaw = player.targetYaw = 0.5; });
    await wait(3000);
    await look(await ev(() => [player.pos.x + Math.sin(0.5) * 3.2, player.pos.y + 1.6, player.pos.z + Math.cos(0.5) * 3.2]), await ev(() => [player.pos.x, player.pos.y + 1.0, player.pos.z]));
    await wait(3000); await snap("people", "seiko");
    // a busy pavement
    await ev(() => { clearInterval(window.__mix); (window.__line || []).forEach(f => scene.remove(f.holder)); cheatHour(8); });
    await wait(25000);
    await look(await ev(() => { const c = world.cities[0]; return [c.scramble.at[0] + 18, c.scramble.groundY + 3.5, c.scramble.at[1] + 18]; }), await ev(() => { const c = world.cities[0]; return [c.scramble.at[0], c.scramble.groundY + 1, c.scramble.at[1]]; }));
    await wait(4000); await snap("people", "rush_hour");
  });
}

await browser.close(); srv.close();
// contact sheets
for (const sec of WANT) {
  const dir = path.join(OUT, sec); if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".png")).sort();
  if (!files.length) continue;
  try {
    execFileSync("montage", ["-label", "%t", "-pointsize", "18", "-background", "#16181c", "-fill", "#e8e8e8", ...files.map(f => path.join(dir, f)),
      "-tile", "4x", "-geometry", "640x360+3+3", path.join(OUT, sec + ".png")]);
    console.log("sheet", path.join(OUT, sec + ".png"));
  } catch (e) { console.log("no contact sheet for", sec, "(is ImageMagick installed?)"); }
}
