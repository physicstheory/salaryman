// Renders Seiko's HUD hand from his realistic model: node Tools/hud/render_hand.mjs [pose.json] [out.png] [model]
// Serves the repo over http, opens Web/engine/hudhand.html in headless Chromium, poses the hand and saves the PNG with the
// phone rectangle written next to it (out.json), which Web/game/phone-hand.js uses to fit the picture round the game's phone.
import http from "http"; import fs from "fs"; import path from "path"; import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT || "playwright");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const [poseFile, out = "/tmp/hand.png", model = "seiko_suit_charcoal", infoOnly] = process.argv.slice(2);
const types = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg" };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); r.end(d); }); }).listen(0);
const port = srv.address().port;
const browser = await pw.chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
page.on("console", m => { if (m.type() === "error") console.log("console:", m.text()); });
await page.goto(`http://localhost:${port}/Web/engine/hudhand.html?model=${model}`);
await page.waitForFunction(() => window.__ready || window.__err, null, { timeout: 120000 });
const err = await page.evaluate(() => window.__err); if (err) { console.log(err); process.exit(1); }
if (infoOnly) { console.log(JSON.stringify(await page.evaluate(() => window.__info()), null, 1)); }
if (poseFile) {
  const P = JSON.parse(fs.readFileSync(poseFile, "utf8"));
  const r = await page.evaluate(P => window.__pose(P), P);
  fs.writeFileSync(out, Buffer.from(r.url.split(",")[1], "base64"));
  fs.writeFileSync(out.replace(/\.png$/, ".json"), JSON.stringify({ model, rect: r.rect.map(v => Math.round(v * 10) / 10), size: [900, 1200] }, null, 1));
  console.log("wrote", out, r.rect.map(Math.round));
}
await browser.close(); srv.close();
