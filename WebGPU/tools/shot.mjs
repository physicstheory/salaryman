// Opens the game in headless Chromium (WebGPU through the software Vulkan driver, or ?webgl for WebGL2) and saves screenshots.
// xvfb-run -a node tools/shot.mjs <outdir> [--webgl] [--hours=8,18,22] [--eval="js"] ...
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
let chromium;
try { ({ chromium } = await import('playwright')); }
catch (e) { ({ chromium } = await import(process.env.PLAYWRIGHT || '/tmp/claude-0/-home-user-salaryman/09791d66-b449-59a1-a1c4-559d344f3fca/scratchpad/node_modules/playwright/index.mjs')); }

const args = process.argv.slice(2);
const out = args[0] || '/tmp/shots';
const flag = (n) => args.find((a) => a.startsWith('--' + n + '='))?.split('=').slice(1).join('=');
const webgl = args.includes('--webgl');
const script = flag('script');           // a module that exports async (page, snap) => {}
fs.mkdirSync(out, { recursive: true });

const root = path.join(here, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.obj': 'text/plain', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const p = path.normalize(path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  // headed (under xvfb-run) with the software Vulkan adapter: the only combination here where a WebGPU canvas can be screenshotted
  headless: false,
  args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1280,760'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { const t = m.text(); if (process.env.ALLLOGS || m.type() === 'error' || m.type() === 'warning' || /backend|WebGPU|Warning/i.test(t)) logs.push(m.type() + ': ' + t.slice(0, 400)); });
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.goto(`http://127.0.0.1:${port}/index.html${webgl ? '?webgl' : ''}`);
const t0 = Date.now();
await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('gone') || /Could not/.test(document.getElementById('boot-line')?.textContent || ''), null, { timeout: 600000 }).catch(() => {});
console.log('boot', ((Date.now() - t0) / 1000).toFixed(1) + 's', await page.evaluate(() => document.getElementById('boot-line')?.textContent));
let n = 0;
const snap = async (name) => { n++; const f = path.join(out, String(n).padStart(2, '0') + '_' + name + '.png'); await page.screenshot({ path: f, timeout: 120000 }); console.log('saved', f); };
if (script) {
  const mod = await import(path.resolve(script));
  await mod.default(page, snap, { out });
} else {
  await page.waitForTimeout(2500);
  await snap('start');
}
console.log(logs.slice(0, 80).join('\n'));
await browser.close();
server.close();
