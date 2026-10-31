// Turns the slides draw_slides.py wrote into the JPEGs the loading screen shows: each SVG is put in a page with the game's typeface and
// photographed at 1920x1080.   node Tools/loading/render_slides.mjs <svg dir> <out dir>
import fs from "fs"; import path from "path";
const [src, out] = process.argv.slice(2);
const pw = await import(process.env.PW || "playwright"); const chromium = pw.chromium || pw.default.chromium;
const css = "file://" + path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../Web/art/fonts/konto-sans.css");
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
for (const f of fs.readdirSync(src).filter(f => f.endsWith(".svg")).sort()) {
  const svg = fs.readFileSync(path.join(src, f), "utf8").replace(/<style>@font-face[^<]*<\/style>/, "<style>text{font-family:'Konto Sans',sans-serif}</style>");
  const html = `<html><head><link rel="stylesheet" href="${css}"><style>body{margin:0}</style></head><body>${svg}</body></html>`;
  const tmp = path.join(out, ".page.html"); fs.writeFileSync(tmp, html);
  await p.goto("file://" + tmp); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(out, f.replace(/\.svg$/, ".png")) });
  console.log(f);
}
fs.rmSync(path.join(out, ".page.html"), { force: true }); await b.close();
