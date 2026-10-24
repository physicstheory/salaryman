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





await ev(() => { document.body.classList.add("camfull"); cheat("MIDDAY"); });
const ok = (name, v, extra) => console.log(v ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
const big = await ev(() => { const a = world.airports.find(x => x.big); return a ? { name: a.name, planes: (a.planes || []).length, gate: !!a.gate, shop: !!a.shop, hwy: a.highway ? { km: Math.round(a.highway.len / 100) / 10, n: a.highway.n } : null, door: a.tzDoor } : null; });
console.log("BIG", JSON.stringify(big));
ok("big airport has planes, gate, terminal door", big && big.planes >= 6 && big.gate && big.shop, big);
ok("expressway built", big && big.hwy && big.hwy.km > 1, big && big.hwy);
const dests = await ev(() => DEST.sites.map(s => ({ id: s.id, cx: Math.round(s.cx), cz: Math.round(s.cz) })));
console.log("DEST", JSON.stringify(dests));
ok("three destinations planned", dests.length === 3, dests);

// the expressway from above
await step("highway", async () => {
  await ev(() => { const a = world.airports.find(x => x.big), h = a.highway, m = h.pts[Math.floor(h.n * 0.3)], n = h.pts[Math.floor(h.n * 0.3) + 3]; setMode("fly"); camPos.set(m[0] - 60, h.deck[Math.floor(h.n * 0.3)] + 40, m[1] - 60); yaw = Math.atan2(-(n[0] - m[0]), -(n[1] - m[1])); pitch = -0.25; });
  await wait(7000); await snap("highway_mid");
  await ev(() => { const a = world.airports.find(x => x.big), h = a.highway, m = h.pts[1], n = h.pts[6]; setMode("fly"); camPos.set(m[0], h.deck[1] + 55, m[1]); yaw = Math.atan2(-(n[0] - m[0]), -(n[1] - m[1])); pitch = -0.3; });
  await wait(7000); await snap("highway_airport_end");
});

// the gate, with a car through it
await step("gate", async () => {
  await ev(() => { const a = world.airports.find(x => x.big), g = a.gate; setMode("walk"); const p = fromRectLocal(0, a.sz - 100 + 45, a.cx, a.cz, a.yaw); placeSeiko(new THREE.Vector3(p[0], 0, p[1])); player.yaw = player.targetYaw = (a.yaw * Math.PI / 180) + Math.PI; yaw = player.yaw + Math.PI; pitch = -0.1; });
  await wait(5000); await snap("gate_approach");
  await ev(() => cheat("ROADSTER")); await wait(3500);
  const r = await ev(() => { const a = world.airports.find(x => x.big), g = a.gate; const q0 = fromRectLocal(0, a.sz - 100 + 28, a.cx, a.cz, a.yaw); const hd = Math.atan2(g.x - q0[0], g.z - q0[1]); drive.car.pos.set(q0[0], world.surfaceY(q0[0], q0[1]) + 0.5, q0[1]); drive.car.yaw = hd; drive.car.speed = 16; return { hd, car: !!drive.car }; });
  console.log("car", JSON.stringify(r));
  for (let i = 0; i < 16; i++) { await wait(1200); if (await ev(() => world.airports.find(x => x.big).gate.broken)) break; await ev(() => { const a = world.airports.find(x => x.big), g = a.gate; if (drive.car && !g.broken) drive.car.speed = 16; }); }
  const st = await ev(() => ({ broken: world.airports.find(x => x.big).gate.broken, stars: wanted.stars, crime: wanted.lastCrime }));
  ok("gate rammed, two stars", st.broken && st.stars >= 2, st); await snap("gate_smashed");
  await ev(() => { if (drive.car) leaveCar(); wanted.stars = 0; policeClear(); });
});

// steal a plane
await step("steal", async () => {
  await ev(() => { const a = world.airports.find(x => x.big), pl = a.planes[0]; setMode("walk"); placeSeiko(new THREE.Vector3(pl.wx + 8, 0, pl.wz + 8)); player.yaw = player.targetYaw = 0; yaw = Math.PI; pitch = -0.1; });
  await wait(5000); await snap("plane_parked");
  const near = await ev(() => { const n = airNear(); return n ? n.kind : null; });
  ok("plane can be taken", near === "plane", near);
  await ev(() => airUse());
  await wait(6000);
  const st = await ev(() => ({ flying: flight.active, stars: wanted.stars, crime: wanted.lastCrime, h: heli.list.length }));
  ok("stolen: flying, four stars", st.flying && st.stars >= 4, st); await snap("plane_stolen");
  await ev(() => { flight.thr = 1; flight.v = 56; keys.ArrowDown = true; });
  for (let i = 0; i < 30; i++) { await wait(1500); if (await ev(() => flight.air)) break; }
  await ev(() => { keys.ArrowDown = false; });
  const up = await ev(() => ({ air: flight.air, v: Math.round(flight.v), alt: Math.round(flight.pos.y - world.surfaceY(flight.pos.x, flight.pos.z)) }));
  ok("took off", up.air, up);
  await ev(() => { flight.pos.y += 120; flight.thr = 0.8; flight.v = 70; keys.ArrowDown = true; });
  await wait(1500); await ev(() => { keys.ArrowDown = false; });
  await wait(9000);
  const h = await ev(() => ({ h: heli.list.length, stars: wanted.stars, air: flight.air, alt: Math.round(flight.pos.y - world.surfaceY(flight.pos.x, flight.pos.z)), v: Math.round(flight.v) }));
  ok("helicopters in the air with you", h.h >= 2, h); await snap("flight_helis");
  await ev(() => { keys.ArrowRight = true; }); await wait(6000); await snap("flight_bank"); await ev(() => { keys.ArrowRight = false; });
  // put it down on the runway
  await ev(() => { const a = world.airports.find(x => x.big); const p = fromRectLocal(-a.len / 2 - 900, 0, a.cx, a.cz, a.yaw); flight.pos.set(p[0], a.y + 30, p[1]); flight.h = Math.atan2(...(() => { const q = fromRectLocal(-a.len / 2 - 800, 0, a.cx, a.cz, a.yaw); return [q[0] - p[0], q[1] - p[1]]; })()); flight.v = 52; flight.thr = 0.3; flight.pitch = 0; flight.roll = 0; });
  for (let i = 0; i < 30; i++) { await wait(1500); if (!(await ev(() => flight.air)) || !(await ev(() => flight.active))) break; }
  const ld = await ev(() => ({ active: flight.active, air: flight.air, v: Math.round(flight.v), crash: flight.lastCrash || null }));
  console.log("landing", JSON.stringify(ld)); await snap("landed_or_crashed");
  await ev(() => { if (flight.active) flightAbort(); wanted.stars = 0; policeClear(); heli.list.forEach(h => scene.remove(h.m)); heli.list.length = 0; });
});

// the terminal
await step("terminal", async () => {
  await ev(() => { const a = world.airports.find(x => x.big); setMode("walk"); const p = fromRectLocal(0, a.tzDoor + 14, a.cx, a.cz, a.yaw); placeSeiko(new THREE.Vector3(p[0], 0, p[1])); player.yaw = player.targetYaw = (a.yaw * Math.PI / 180) + Math.PI; yaw = player.yaw + Math.PI; pitch = -0.12; });
  await wait(6000); await snap("terminal_front");
  const e = await ev(() => { const a = world.airports.find(x => x.big); const ok = interiorEnter(a.shop); return { ok: ok, room: interior.room && interior.room.kind }; });
  ok("terminal entered", e.ok && e.room === "land", e); await wait(2500); await snap("hall_arrive");
  const view = async (x, z, face, name) => { await ev(([x, z, face]) => { const R = interior.room; player.pos.set(R.ox + x, interior.floorY, R.oz + z); player.yaw = player.targetYaw = face; yaw = face + Math.PI; pitch = -0.1; camPos.set(player.pos.x - Math.sin(face) * 3.2, interior.floorY + 2.3, player.pos.z - Math.cos(face) * 3.2); interiorClampCam(camPos); camera.position.copy(camPos); }, [x, z, face]); await wait(2200); await snap(name); };
  await view(-14, 2, Math.PI, "hall_checkin");
  await view(8, 5, Math.PI, "hall_shops");
  await view(14, -3, 0, "ticket_office");
  await view(14, 4, -Math.PI / 2, "security_lanes");
  // a popup shop
  await ev(() => { const sp = interior.room.spots.find(s => s.act === "store"); interiorSpotAct(sp); }); await wait(3000); await snap("popup_shop_inside");
  await ev(() => interiorLeave()); await wait(2500); await snap("back_in_hall");
  // ticket: office screen
  await ev(() => interiorSpotAct(interior.room.spots.find(s => s.act === "ticketoffice"))); await wait(2500); await snap("expedio_office");
  await ev(() => { ex.sel = 0; expedioKey({ code: "Enter", preventDefault() { }, stopImmediatePropagation() { } }); }); await wait(1500); await snap("expedio_after_pick");
  const bought = await ev(() => { if (!air.ticket) airBuy("konto", "seoul", 0, "office"); expedioClose(); return !!air.ticket && air.ticket.to; });
  ok("ticket in hand", !!bought, bought);
  // security
  await ev(() => interiorSpotAct(interior.room.spots.find(s => s.act === "security"))); await wait(2000); await snap("security_modal");
  await ev(() => { interior.modal.sel = 0; interiorModalAct(); }); await wait(2500);
  const air1 = await ev(() => interior.room.kind); ok("airside", air1 === "air", air1); await snap("airside");
  await ev(() => { const R = interior.room; const g = R.spots.find(s => s.act === "gate" && s.gate === air.ticket.gate); player.pos.set(R.ox + g.x, interior.floorY, R.oz + g.z + 2.5); player.yaw = player.targetYaw = Math.PI; yaw = 0; camPos.set(player.pos.x, interior.floorY + 2.3, player.pos.z + 3.2); interiorClampCam(camPos); camera.position.copy(camPos); }); await wait(2200); await snap("gate_desk");
  await view(-6, 3, 0, "airside_shops");
  await ev(() => { const R = interior.room; interiorSpotAct(R.spots.find(s => s.act === "gate" && s.gate === air.ticket.gate)); }); await wait(2000); await snap("boarding_modal");
  await ev(() => { interior.modal.sel = 0; interiorModalAct(); }); await wait(2500);
  const cab = await ev(() => interior.room.kind); ok("cabin", cab === "cabin", cab); await snap("cabin");
  await ev(() => { const R = interior.room; const sp = R.spots.find(s => s.act === "plane_seat"); player.pos.set(R.ox + sp.x, interior.floorY, R.oz + sp.z - 3); player.yaw = player.targetYaw = Math.PI; yaw = 0; camPos.set(player.pos.x, interior.floorY + 2.0, player.pos.z + 3); interiorClampCam(camPos); camera.position.copy(camPos); }); await wait(2200); await snap("cabin_aisle");
  await ev(() => interiorSpotAct(interior.room.spots.find(s => s.act === "plane_seat"))); await wait(3000);
  ok("IFE open", await ev(() => ife.open)); await snap("ife_home");
  await ev(() => { ife.tab = "map"; ifeDraw(); }); await wait(2000); await snap("ife_map");
  await ev(() => { ife.tab = "movies"; ife.sel = 0; ifePlay(); }); await wait(4000); await snap("ife_film");
  await ev(() => { ife.t0 = performance.now() - ife.dur * 1000 - 100; }); await wait(2500); await snap("ife_landed"); await ev(() => ifeLand()); await wait(6000);
  const arr = await ev(() => ({ at: air.at, active: !!DEST.active && DEST.active.id, ife: ife.open, interior: interior.active }));
  console.log("ARRIVED", JSON.stringify(arr)); ok("landed in Seoul", arr.at === "seoul", arr);
});
await step("seoul", async () => {
  await wait(6000); await snap("seoul_arrival");
  await ev(() => { const s = DEST.active || DEST.by.seoul; player.yaw = player.targetYaw = s.spawn[2] + Math.PI / 2; yaw = player.yaw + Math.PI; });
  await wait(3000); await snap("seoul_street");
  await ev(() => { const s = DEST.by.seoul; setMode("fly"); camPos.set(s.cx - 400, s.h(-400, 0) + 220, s.cz - 500); yaw = Math.PI * 0.95; pitch = -0.3; });
  await wait(9000); await snap("seoul_air");
  await ev(() => { const s = DEST.by.seoul; camPos.set(s.cx + 60, s.h(60, 40) + 55, s.cz + 40); yaw = Math.PI * 0.2; pitch = -0.15; });
  await wait(8000); await snap("seoul_neon");
});
for (const id of ["kohana", "ryujima"]) await step(id, async () => {
  await ev(i => { setMode("walk"); cheatDest(i); }, id); await wait(9000); await snap(id + "_arrival");
  await ev(i => { const s = DEST.by[i]; setMode("fly"); camPos.set(s.cx - 300, s.h(-300, 0) + 160, s.cz - 360); yaw = Math.PI * 0.95; pitch = -0.28; }, id);
  await wait(9000); await snap(id + "_air");
});
await step("home", async () => {
  await ev(() => { setMode("walk"); cheatDest("seoul"); }); await wait(5000);
  const near = await ev(() => { const s = DEST.by.seoul; placeSeiko(new THREE.Vector3(s.kiosk.sx, 0, s.kiosk.sz + 2)); return 1; });
  await wait(2500); const pr = await ev(() => { const n = airNear(); return n && n.kind; }); ok("departures kiosk near", pr === "kiosk", pr);
  await ev(() => airUse()); await wait(2000); await snap("expedio_dest");
  await ev(() => { airBuy("seoul", "konto", 0, "app"); expedioClose(); airDepartDest(); }); await wait(7000); await snap("ife_home_bound");
  await ev(() => { ife.t0 = performance.now() - ife.dur * 1000 - 100; }); await wait(2500); await ev(() => ifeLand()); await wait(9000);
  const back = await ev(() => ({ at: air.at, hall: !!world.airports.find(x => x.big) }));
  ok("home again", back.at === "konto", back); await snap("back_in_konto");
});
await browser.close(); srv.close();
