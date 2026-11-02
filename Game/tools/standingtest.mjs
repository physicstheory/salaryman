// Honor and respect in the running game: crimes cost honor (red mark), helping a stranger earns it, regard + bow/antagonise move respect,
// strangers bow first at high respect, and it all saves.   node Game/tools/standingtest.mjs <out-dir>   (PLAYWRIGHT=/path/to/playwright/index.js)

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
page.on("console", m => { const t = m.text(); if (/standing|\[Konto\] standing|pageerror/.test(t)) console.log("LOG", t.slice(0, 200)); });
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


await page.goto(`http://localhost:${port}/konto.html`, { waitUntil: "commit", timeout: 0 });
for (let i = 0; i < 90; i++) { if (/titleup/.test(await ev(() => document.body.className))) break; await wait(5000); }
await wait(3000);
await page.keyboard.press("Enter");
for (let i = 0; i < 80; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await ev(() => { if (typeof cut !== "undefined" && cut.active) cutFinish(true); }); await wait(3000); }
await wait(4000);
await ev(() => { let n = 0; while (typeof cut !== "undefined" && cut.active && n++ < 20) cutFinish(true); });
await wait(3000);
await ev(() => { let n = 0; while (typeof cut !== "undefined" && cut.active && n++ < 20) cutFinish(true); cheat("GOTOKONTO"); });
await wait(12000);
console.log("STATE", JSON.stringify(await ev(() => ({ cls: document.body.className, cut: cut.active, mode: player.mode, placed: player.placed }))));

const R = {};
await step("leave interior", () => ev(() => { try { if (interior.active) interiorLeave(true); } catch (e) {} }));
await wait(5000);
R.mounted = await ev(() => !!(window.standing && document.getElementById("stndg") && document.getElementById("stndgm")));
// 1. a crime costs honor with a red mark
R.crime = await ev(() => { const h0 = standing.honor.value; witnessCrime("shooting", player.pos, 1); const h1 = standing.honor.value; commitCrime("shooting", player.pos); const h2 = standing.honor.value;
  const mk = document.querySelector("#stndg .mk.hl"); return { h0, h1, h2, mark: mk ? mk.textContent : null, icon: !!(mk && mk.querySelector("svg")) }; });
await wait(600); await snap("honor_loss");
await ev(() => { wanted.stars = 0; wanted.heat = 0; try { policeClear(); } catch (e) {} peds.list.forEach(p => { if (p.state === "flee" || p.state === "cower" || p.state === "call") pedSet(p, "wander"); }); });
await wait(6000);
// 2. a stranger asks for help, Seiko helps
for (let i = 0; i < 20 && !(await ev(() => !!standing.req)); i++) { await ev(() => { standing.nextAsk = 0; peds.list.forEach(p => { if (p.state === "flee") pedSet(p, "wander"); }); }); await wait(3000); }
R.ask = await ev(() => { const q = standing.req; if (!q) return { none: true, peds: peds.list.length, states: peds.list.map(p => p.state).join(",") };
  q.a = { kind: "directions", text: "Which way?", act: "Point the way" }; const p = q.p;
  placeSeiko(new THREE.Vector3(p.x + 1.6, world.surfaceY(p.x + 1.6, p.z), p.z)); return { kind: q.a.kind, state: p.state }; });
await wait(2500);
R.prompt = await ev(() => { const h = document.getElementById("helpprompt"); return h && h.style.display !== "none" ? h.textContent : null; });
await snap("help_prompt");
const hb = await ev(() => standing.honor.value);
await page.keyboard.press("KeyE"); await wait(800);
R.helped = await ev(b => ({ before: b, after: standing.honor.value, req: !!standing.req, mark: (document.querySelector("#stndg .mk.hg") || {}).textContent || null }), hb);
await snap("honor_gain");
// 3. regard + bow
R.regard = await ev(() => {
  const p = peds.list.find(q => q.state !== "dead" && q.state !== "flee" && q.state !== "down"); if (!p) return { none: true };
  window.__t = p; p._prev = p.state; p.state = "greet"; p._greetFor = 999; pedPlay(p, "idle", 0);
  const a = p.yaw, x = p.x - Math.sin(a) * -3.5, z = p.z - Math.cos(a) * -3.5;   // in front of them
  placeSeiko(new THREE.Vector3(x, world.surfaceY(x, z), z));
  yaw = Math.atan2(-(p.x - x), -(p.z - z)); player.yaw = player.targetYaw = Math.atan2(p.x - x, p.z - z);
  return { ok: true };
});
await page.keyboard.down("KeyZ"); await wait(1500);
R.regardOn = await ev(() => ({ target: !!standing.regard, same: standing.regard === window.__t, mark: getComputedStyle(document.getElementById("rgdmark")).display, keys: document.getElementById("rgdkeys").textContent }));
await snap("regard");
const r0 = await ev(() => { standing.respect.rand = () => 0.02; standing.hud.hold = 600; return standing.respect.value; });
await page.keyboard.press("KeyB"); await wait(1200);
R.bow = await ev(r => ({ before: r, after: standing.respect.value, clip: player.clipName, tstate: window.__t.state, pose: window.__t.clip }), r0);
await snap("bow");
await wait(2500);
await ev(() => { standing.bowUntil = 0; standing.respect.rand = () => 0.9; }); await page.keyboard.press("KeyN"); await wait(1200);
R.antag = await ev(() => ({ respect: standing.respect.value, clip: player.clipName, tclip: window.__t.clip }));
await page.keyboard.up("KeyZ");
// 4. high respect: strangers bow first
R.bowers = await ev(() => {
  standing.promote("president"); standing.respect.courtesy = 20;
  let got = 0;
  for (let k = 0; k < 40 && !got; k++) {
    for (const p of peds.list) { if (p.state === "greet" || p.state === "dead") continue; p._bowChk = false; p.state = p.state === "flee" ? "wander" : p.state;
      const x = player.pos.x + Math.sin(p.yaw) * 2.5, z = player.pos.z + Math.cos(p.yaw) * 2.5; p.x = x; p.z = z; p.yaw += Math.PI; }
    pedsTick(0.016); if (standing.bowedBy) got = 1;
  }
  return { bowedBy: !!standing.bowedBy, chance: standing.respect.bowChance({ temper: "polite", standing: 0.3 }), rank: standing.respect.rank().name };
});
await wait(800); await snap("bowed_to");
// 5. card and save
await page.keyboard.down("KeyZ"); await ev(() => { standing.regard = null; }); await wait(300);
R.card = await ev(() => { standing.card(true); const c = document.getElementById("stndgc"); return c.classList.contains("on") ? c.textContent.slice(0, 160) : null; });
await snap("card"); await page.keyboard.up("KeyZ"); await ev(() => standing.card(false));
R.save = await ev(() => { const s = snapshotSave(); return s.standing ? { honor: s.standing.honor.value, rank: s.standing.respect.rank } : null; });
console.log("RESULT", JSON.stringify(R, null, 1));
await browser.close(); srv.close();
