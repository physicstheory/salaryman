// Sits down in the three kinds of restaurant and photographs them: the conveyor sushi with its plate pile, the sushi-ya menu and chef, and the ramen order sheet and the bowl.
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


await page.goto(`http://localhost:${port}/konto.html`);
for (let i = 0; i < 90; i++) { if (/titleup/.test(await ev(() => document.body.className))) break; await wait(5000); }
await wait(3000);
await page.keyboard.press("Enter");
for (let i = 0; i < 60; i++) { if (/walking/.test(await ev(() => document.body.className))) break; await wait(3000); }
await wait(4000);
await ev(() => { const c = world.cities[0]; placeSeiko(new THREE.Vector3(c.scramble.at[0] + 12, c.scramble.groundY, c.scramble.at[1] + 12)); });
await wait(4000);


const yen = () => ev(() => purse.yen);
const keyS = (code) => ev(c => { if (interior.sit) interiorSitKey({ code: c, preventDefault() {} }); }, code);

async function enter(brand) {
  await ev(() => { if (interior.active) interiorLeave(true); });
  await ev(br => {
    let s = shops.list.find(x => x.brand === br);
    if (!s) { const o = shops.list.find(x => x.brand === "sushi"); s = Object.assign({}, o, { brand: br, name: SHOP_BRANDS[br].name }); shops.list.push(s); }
    enterShop(s);
  }, brand);
  await wait(2500);
}
async function leave() { await ev(() => { if (interior.active) interiorLeave(true); }); await wait(1200); }

// 1. the conveyor
await step("kaiten", async () => {
  await ev(() => { purse.yen = 20000; });
  await enter("sushi"); await snap("sushi_belt_from_door");
  // walk to the stool in the middle of the south side and look at the belt
  await ev(() => { const R = interior.room; const sp = R.spots.find(x => x.seat === 6); player.pos.set(R.ox + sp.x, interior.floorY, R.oz + sp.z + 1.4); player.yaw = player.targetYaw = Math.PI; yaw = 0; pitch = -0.3; });
  await wait(1800); await snap("sushi_belt_room");
  await ev(() => { const R = interior.room; const sp = R.spots.find(x => x.seat === 6); player.pos.set(R.ox + sp.x, interior.floorY, R.oz + sp.z); player.yaw = player.targetYaw = Math.PI; });
  await wait(900); await snap("sushi_stool_prompt");
  await ev(() => { const R = interior.room; interiorSit(R.spots.find(x => x.seat === 6)); });
  await wait(2500); await snap("sushi_seated_plates_pass");
  let got = 0;
  for (let k = 0; k < 12 && got < 7; k++) {
    // the software renderer runs at a couple of frames a second, so wind the belt on instead of waiting for it
    for (let t = 0; t < 80; t++) { if (await ev(() => !!interior.sit.near)) break; await ev(() => { interior.room.kt += 0.12; }); await wait(250); }
    if (await ev(() => !!interior.sit.near)) { if (got === 1) await snap("sushi_plate_in_reach"); await keyS("KeyE"); got++; await wait(300); }
    if (got === 3) { await snap("sushi_pile_3"); got++; }
  }
  await wait(600); await snap("sushi_pile_full");
  console.log("plates:", await ev(() => JSON.stringify(interior.sit.plates)), "total:", await ev(() => interior.sit.total));
  const before = await yen();
  await keyS("Escape"); await wait(800);
  console.log("paid:", before - await yen());
  await snap("sushi_stood_up_paid");
  await leave();
});

// 2. the sushi-ya
await step("sushiya", async () => {
  await ev(() => { purse.yen = 40000; });
  await enter("sushiya"); await snap("sushiya_from_door");
  await ev(() => { const R = interior.room; const sp = R.spots.find(x => x.seat === 3); player.pos.set(R.ox + sp.x, interior.floorY, R.oz + sp.z + 1.8); player.yaw = player.targetYaw = Math.PI; yaw = 0; pitch = -0.2; });
  await wait(1800); await snap("sushiya_counter");
  await ev(() => { const R = interior.room; interiorSit(R.spots.find(x => x.seat === 3)); });
  await wait(2500); await snap("sushiya_menu");
  await ev(() => { interior.sit.sel = 1; sushiyaMenuDraw(); }); await wait(500);
  const before = await yen();
  await keyS("Enter"); await wait(600);
  for (const [t, nm] of [[0.7, "slicing"], [2.0, "rice"], [3.4, "plating"], [4.5, "sliding"]]) {
    await ev(tt => { interior.sit.t = tt; }, t); await wait(900); await snap("sushiya_chef_" + nm);
  }
  await ev(() => { interior.sit.t = 5.0; }); await wait(900); await snap("sushiya_served");
  await keyS("KeyE"); await wait(700);
  console.log("sushiya paid:", before - await yen());
  await snap("sushiya_after_eating");
  await keyS("Escape"); await wait(500);
  await leave();
});

// 3. the ramen booths
await step("ramen", async () => {
  await ev(() => { purse.yen = 9000; });
  await enter("ramen"); await snap("ramen_from_door");
  await ev(() => { const R = interior.room; const sp = R.spots.find(x => x.seat === 3); player.pos.set(R.ox + sp.x, interior.floorY, R.oz + sp.z + 2.2); player.yaw = player.targetYaw = Math.PI; yaw = 0; pitch = -0.2; });
  await wait(1800); await snap("ramen_booths");
  await ev(() => { const R = interior.room; interiorSit(R.spots.find(x => x.seat === 3)); });
  await wait(2500); await snap("ramen_order_sheet");
  // rich broth, a lot of garlic, hot, firm; chashu and egg
  await keyS("ArrowRight");                                   // richness: rich
  await keyS("ArrowDown"); await keyS("ArrowRight");          // garlic: standard
  await keyS("ArrowRight");                                   // garlic: a lot
  await keyS("ArrowDown"); await keyS("ArrowDown"); await keyS("ArrowRight");    // red sauce: hot
  await keyS("ArrowDown"); await keyS("ArrowLeft");           // noodles: extra firm
  await keyS("ArrowDown"); await keyS("Space");               // chashu
  await keyS("ArrowRight"); await keyS("Space");              // egg
  await wait(900); await snap("ramen_sheet_ticked");
  const before = await yen();
  await keyS("Enter"); await wait(700);
  await snap("ramen_blind_down_waiting");
  for (const [t, nm] of [[2.0, "blind_rising"], [3.0, "bowl_arrives"]]) {
    await ev(tt => { interior.sit.t = tt; }, t); await wait(900); await snap("ramen_" + nm);
  }
  await ev(() => { interior.sit.t = 4.5; }); await wait(900); await snap("ramen_served");
  await keyS("KeyE"); await wait(1500);
  console.log("ramen paid:", before - await yen(), "phase:", await ev(() => interior.sit && interior.sit.phase));
  await snap("ramen_after");
  await keyS("Escape"); await wait(500);
  await leave();
});


// 4. the other shops, to see the new walls and adverts
for (const b of ["eleven", "petmart", "pharmacy", "books", "clothes", "arms"]) {
  await step("shop " + b, async () => {
    await ev(() => { if (interior.active) interiorLeave(true); }); await wait(600);
    await ev(br => { const s = shops.list.find(x => x.brand === br && !x.safe && !x.mall); enterShop(s); }, b); await wait(2200);
    await snap(b + "_entry");
    await ev(() => { const R = interior.room; player.pos.set(R.ox - 1.5, interior.floorY, R.oz + 0.5); player.yaw = player.targetYaw = Math.PI / 2; yaw = player.yaw + Math.PI; pitch = -0.1; }); await wait(1800); await snap(b + "_towards_counter");
    await ev(() => { const R = interior.room; player.pos.set(R.ox + 1.5, interior.floorY, R.oz + 0.5); player.yaw = player.targetYaw = -Math.PI / 2; yaw = player.yaw + Math.PI; pitch = -0.1; }); await wait(1800); await snap(b + "_towards_window_wall");
  });
}
await ev(() => { if (interior.active) interiorLeave(true); });
console.log("sit state after:", await ev(() => interior.sit), "active:", await ev(() => interior.active));
await browser.close(); srv.close();
