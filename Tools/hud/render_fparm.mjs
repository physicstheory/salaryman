// Renders Seiko's first-person arm from his realistic model: node Tools/hud/render_fparm.mjs <outDir> [model ...] [--view phone|wrist] [--over JSON]
// Serves the repo over http, opens Web/engine/fparm.html in headless Chromium (one page per model), poses the arm for each view and
// saves <outDir>/<view>_<model>.png plus <view>_<model>.json (where the phone or the watch lands in the picture).
import http from "http"; import fs from "fs"; import path from "path"; import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT || "playwright");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const args = process.argv.slice(2), out = args.shift() || "/tmp/fparm";
let views = ["phone", "wrist"], over = {}; const models = [];
for (let i = 0; i < args.length; i++) { if (args[i] === "--view") views = [args[++i]]; else if (args[i] === "--over") over = JSON.parse(args[++i]); else models.push(args[i]); }
if (!models.length) models.push("seiko_suit_charcoal");
fs.mkdirSync(out, { recursive: true });
const SIZE = { phone: [1200, 1500], wrist: [1920, 1080] };
const types = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg" };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); r.end(d); }); }).listen(0);
const port = srv.address().port;
const browser = await pw.chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const model of models) for (const view of views) {
  const [w, h] = SIZE[view];
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("console", m => { if (m.type() === "error") console.log("console:", m.text()); });
  await page.goto(`http://localhost:${port}/Web/engine/fparm.html?model=${model}&w=${w}&h=${h}`);
  await page.waitForFunction(() => window.__ready || window.__err, null, { timeout: 300000 });
  const err = await page.evaluate(() => window.__err); if (err) { console.log(err); process.exit(1); }
  const r = await page.evaluate(([v, o]) => window.__pose(v, o), [view, over[view] || over]);
  const base = path.join(out, view + "_" + model.replace(/^seiko_/, ""));
  fs.writeFileSync(base + ".png", Buffer.from(r.url.split(",")[1], "base64")); delete r.url;
  r.size = [w, h]; r.model = model;
  fs.writeFileSync(base + ".json", JSON.stringify(r, null, 1));
  console.log("wrote", base + ".png", JSON.stringify(r));
  await page.close();
}
await browser.close(); srv.close();
