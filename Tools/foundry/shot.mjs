// Screenshot the Foundry viewer (Web/engine/foundry.html) the way the game loads the models.
//   python3 -m http.server 8765   (repo root, in another shell)
//   node Tools/foundry/shot.mjs "model=commuter_mid&az=0.7&el=0.15&dist=14" out.png
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const [q, out, wait] = process.argv.slice(2);
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1000, height: 620 } });
p.on("console", m => { if (/error|warn|Foundry/i.test(m.text())) console.log("console:", m.text().slice(0, 300)); });
p.on("pageerror", e => console.log("pageerror:", e.message));
await p.goto("http://localhost:8765/Web/engine/" + (process.env.PAGE || "foundry.html") + "?shot&" + q);
await p.waitForFunction(() => window.__ready, null, { timeout: 180000 }).catch(() => console.log("not ready"));
await p.waitForTimeout(+(wait || 6000));
await p.screenshot({ path: out });
await b.close();
