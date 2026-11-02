// A game REPL for probes: boots the game once, walks into Tōkonto, then evaluates JS from a command file and writes the result.
//   node tools/repl.mjs <dir>   then write JS (a function body, may use await) to <dir>/cmd.js; the answer lands in <dir>/out.json.
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "../../Web"), VENDOR = path.resolve(here, "../vendor");
const DIR = path.resolve(process.argv[2] || "repl"); fs.mkdirSync(DIR, { recursive: true });
let chromium;
try { ({ chromium } = await import("playwright")); } catch (e) { const m = await import(process.env.PLAYWRIGHT || "playwright"); chromium = m.chromium || (m.default && m.default.chromium); }
const mime = { ".html": "text/html", ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".png": "image/png", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" };
const srv = http.createServer((q, r) => {
  let f = path.join(WEB, decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith(path.sep) || f === WEB) f = path.join(WEB, "konto.html");
  fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader("Content-Type", mime[path.extname(f)] || "application/octet-stream"); r.end(d); });
}).listen(0);
process.on("uncaughtException", e => console.log("[repl]", String(e).slice(0, 300)));
const port = srv.address().port;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
page.on("pageerror", e => console.log("[pageerror]", String(e).slice(0, 200)));
await page.route("**/three.min.js", r => r.fulfill({ path: path.join(VENDOR, "three.min.js"), contentType: "text/javascript" }));
await page.route("**/GLTFLoader.js", r => r.fulfill({ path: path.join(VENDOR, "GLTFLoader.js"), contentType: "text/javascript" }));
await page.route("**/RGBELoader.js", r => r.fulfill({ path: path.join(VENDOR, "RGBELoader.js"), contentType: "text/javascript" }));
await page.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
const wait = ms => page.waitForTimeout(ms), ev = (f, a) => page.evaluate(f, a);
await page.goto(`http://localhost:${port}/konto.html?persist=0`, { waitUntil: "commit" });
for (let i = 0; i < 120; i++) { try { if (/titleup/.test(await ev(() => document.body.className))) break; } catch (e) {} await wait(5000); }
console.log("title"); fs.writeFileSync(path.join(DIR, "state"), "title");
const cmd = path.join(DIR, "cmd.js"), out = path.join(DIR, "out.json");
for (;;) {
  if (fs.existsSync(cmd)) {
    const src = fs.readFileSync(cmd, "utf8"); fs.unlinkSync(cmd);
    if (src.trim() === "quit") break;
    let res;
    try { res = JSON.parse(await page.evaluate(new Function("return (async () => { const seen = new WeakSet(); const r = await (async () => {" + src + "})(); return JSON.stringify(r === undefined ? null : r, (k, v) => { if (v && typeof v === 'object') { if (seen.has(v)) return '[circular]'; seen.add(v); if (v.isObject3D) return '[Object3D]'; } return v; }); })()"))); } catch (e) { res = { error: String(e).slice(0, 2000) }; }
    if (res && res.__shot) { try { await page.screenshot({ path: path.join(DIR, res.__shot) }); } catch (e) {} }
    fs.writeFileSync(out + ".tmp", JSON.stringify(res, null, 1)); fs.renameSync(out + ".tmp", out);
  }
  await wait(500);
}
await browser.close(); srv.close();
