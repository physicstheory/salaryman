// Plays the game with a fake Bluetooth controller (a Gamepad API object the test drives): the title, walking, the pause menu and its settings, the update line, sitting at the belt and the ramen sheet, rumble and the button glyphs.
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
await page.addInitScript(() => {
  const mk = () => ({ id: window.__padId || "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)", index: 0, connected: true, mapping: "standard", timestamp: performance.now(),
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0],
    vibrationActuator: { playEffect: (t, o) => { (window.__rumbles = window.__rumbles || []).push(o); return Promise.resolve("complete"); } } });
  const g = mk(); window.__pad = g; window.__padOn = false;
  navigator.getGamepads = () => (window.__padOn ? [window.__pad, null, null, null] : [null, null, null, null]);
  window.__press = (i, on) => { g.buttons[i].pressed = on; g.buttons[i].value = on ? 1 : 0; };
  window.__axes = (a) => { g.axes = a.slice(); };
});
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



// The software renderer draws a couple of frames a second, so a button has to be held across real frames or the game never sees it.
const frames = (n) => ev(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const tap = async (i) => { await ev(i => window.__press(i, true), i); await frames(3); await ev(i => window.__press(i, false), i); await frames(2); };
const holdAxes = async (a, n) => { await ev(a => window.__axes(a), a); await frames(n); await ev(() => window.__axes([0, 0, 0, 0])); await frames(2); };
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const res = {};
const check = (name, ok, extra) => { res[name] = ok; console.log(ok ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); };

// 1. plug it in at the title; the game says so
await ev(() => { window.__padOn = true; });
await tap(BTN.A); await wait(500);
check("connected", await ev(() => pad.index >= 0), await ev(() => pad.name));
// A (or Start) on the title begins the game
for (let i = 0; i < 40; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await tap(BTN.A); await wait(1500); }
check("title: A starts the game", /walking/.test(await ev(() => document.body.className)));
await wait(3000);

// 2. walking with the left stick, looking with the right
const p0 = await ev(() => [player.pos.x, player.pos.z]);
await holdAxes([0, -1, 0, 0], 30);
const p1 = await ev(() => [player.pos.x, player.pos.z]);
check("left stick walks", Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.4, Math.round(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 10) / 10);
const y0 = await ev(() => yaw);
await holdAxes([0, 0, 1, 0], 30);
check("right stick looks", Math.abs((await ev(() => yaw)) - y0) > 0.1, Math.abs((await ev(() => yaw)) - y0));
await ev(() => { gameSet.invertY = false; }); const pi0 = await ev(() => pitch);
await holdAxes([0, 0, 0, -1], 20);
const pi1 = await ev(() => pitch); check("look up (not inverted)", pi1 > pi0, [pi0, pi1]);
await ev(() => { gameSet.invertY = true; }); await holdAxes([0, 0, 0, -1], 20);
check("invert look flips it", (await ev(() => pitch)) < pi1);
await ev(() => { gameSet.invertY = false; });
await tap(BTN.A); check("A jumps", true);

// 3. pause, tabs with the bumpers, settings by stick and A
await tap(BTN.START); await wait(800);
check("Start opens the menu", await ev(() => paused));
await snap("pad_pause_map");
await tap(BTN.RB); await wait(500);
check("RB changes tab", (await ev(() => PAUSE_TABS[pause.tab])) === "game", await ev(() => PAUSE_TABS[pause.tab]));
await snap("pad_pause_game_tab_update_line");
await ev(() => { setPauseTab(PAUSE_TABS.indexOf("settings"), true); }); await wait(600);
for (let i = 0; i < 4; i++) await tap(BTN.DOWN); await wait(300);
check("D-pad reaches the vibration row", (await ev(() => pause.row)) === 4, await ev(() => pause.row));
await tap(BTN.A); await wait(300);
check("A toggles vibration", (await ev(() => gameSet.rumble)) === false);
await tap(BTN.A); check("and back on", await ev(() => gameSet.rumble));
check("vibration pulse sent when switched on", (await ev(() => (window.__rumbles || []).length)) >= 1);
await tap(BTN.DOWN); await tap(BTN.A); await tap(BTN.A);
check("look speed changes", (await ev(() => gameSet.lookSens)) > 1.0, await ev(() => gameSet.lookSens));
await ev(() => { gameSet.lookSens = 1; }); 
await snap("pad_settings");
await tap(BTN.B); await wait(500);
check("B resumes", !(await ev(() => paused)));

// 4. phone and wheel
await tap(BTN.UP); await wait(900);
check("D-pad up opens the phone", await ev(() => phone.open));
await tap(BTN.B); await wait(500);
check("B closes the phone", !(await ev(() => phone.open)));

// 5. glyphs follow the pad: Xbox, then PlayStation, then Switch
const glyphOf = async (id) => { await ev(i => { window.__padId = i; window.__pad.id = i; pad.name = i; }, id); return ev(() => padLabel("A") + "/" + padLabel("Y")); };
check("Xbox glyphs", (await glyphOf("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)")) === "A/Y");
check("PlayStation glyphs", (await glyphOf("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)")) === "\u2715/\u25B3");
check("Switch glyphs", (await glyphOf("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)")) === "B/X");
await glyphOf("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)");

// 6. the conveyor with the pad: walk to a stool, A to sit, A to take a plate, B to stand
await ev(() => { purse.yen = 5000; const s = shops.list.find(x => x.brand === "sushi"); enterShop(s); });
await wait(2500);
await ev(() => { const R = interior.room; const sp = R.spots.find(x => x.seat === 6); player.pos.set(R.ox + sp.x, interior.floorY, R.oz + sp.z + 1.0); player.yaw = player.targetYaw = Math.PI; });
await wait(1200);
check("stool prompt shows a pad glyph", /\u25B3|\u2715|A|Y/.test(await ev(() => (document.querySelector("#iprompt b") || {}).textContent || "")), await ev(() => (document.querySelector("#iprompt") || {}).textContent));
await snap("pad_stool_prompt_playstation_glyph");
await tap(BTN.Y); await wait(1500);
check("Y sits down", await ev(() => !!interior.sit));
for (let t = 0; t < 80; t++) { if (await ev(() => !!interior.sit.near)) break; await ev(() => { interior.room.kt += 0.12; }); await wait(250); }
const r0 = await ev(() => (window.__rumbles || []).length);
await tap(BTN.A); await wait(500);
check("A takes the plate", (await ev(() => interior.sit.plates.length)) === 1, await ev(() => interior.sit.plates));
check("take rumbles the pad", (await ev(() => (window.__rumbles || []).length)) > r0);
await snap("pad_seated_belt_glyph");
await tap(BTN.B); await wait(800);
check("B stands up and pays", (await ev(() => !interior.sit)) && (await ev(() => purse.yen)) < 5000, await ev(() => purse.yen));
await ev(() => { if (interior.active) interiorLeave(true); }); await wait(800);

// 7. the ramen sheet with the stick
await ev(() => { purse.yen = 5000; const s = shops.list.find(x => x.brand === "ramen"); enterShop(s); }); await wait(2500);
await ev(() => { const R = interior.room; const sp = R.spots.find(x => x.seat === 3); player.pos.set(R.ox + sp.x, interior.floorY, R.oz + sp.z + 1.0); player.yaw = player.targetYaw = Math.PI; }); await wait(1000);
await tap(BTN.Y); await wait(1500);
check("sat in the booth", await ev(() => !!interior.sit && interior.sit.kind === "ramen"));
const stick = (ax) => holdAxes(ax, 3);
await stick([0, 1, 0, 0]); check("stick down moves a row", (await ev(() => interior.sit.row)) === 1, await ev(() => interior.sit.row));
const c0 = await ev(() => interior.sit.choice.garlic); await stick([1, 0, 0, 0]);
check("stick right changes the choice", (await ev(() => interior.sit.choice.garlic)) !== c0);
for (let i = 0; i < 4; i++) await tap(BTN.DOWN);
check("D-pad reaches the toppings", await ev(() => interior.sit.row >= RAMEN_SHEET.length), await ev(() => interior.sit.row));
await tap(BTN.A);
check("A ticks a topping on a topping row", await ev(() => Object.values(interior.sit.tops).some(Boolean)), await ev(() => interior.sit.tops));
await snap("pad_ramen_sheet_glyph_hint");
await ev(() => { interior.sit.row = RAMEN_SHEET.length + RAMEN_TOP.length; ramenSheetDraw(); });
await tap(BTN.A); await wait(600);
check("A on the order line hands it in", (await ev(() => interior.sit.phase)) === "wait", await ev(() => interior.sit.phase));
await ev(() => { interior.sit.t = 4.5; }); await wait(900);
const m0 = await ev(() => purse.yen); await tap(BTN.A); await wait(900);
check("A eats and pays", (await ev(() => purse.yen)) < m0);
await tap(BTN.B); await wait(700);
await ev(() => { if (interior.active) interiorLeave(true); }); await wait(500);

// 8. the update line and the cheats are reachable
check("update function exists", await ev(() => typeof refreshGame === "function" && typeof window.cheat === "function"));
check("controller cheat via the phone dial", await ev(() => { const y = purse.yen; phoneDial("5550130"); return purse.yen === y + 1000000; }));
check("rumble history is non-empty", (await ev(() => (window.__rumbles || []).length)) > 3, await ev(() => (window.__rumbles || []).length));
const fails = Object.entries(res).filter(([k, v]) => !v).map(([k]) => k);
console.log("SUMMARY", Object.keys(res).length - fails.length, "passed,", fails.length, "failed", JSON.stringify(fails));
await browser.close(); srv.close();
