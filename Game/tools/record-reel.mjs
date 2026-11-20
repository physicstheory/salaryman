// Records the title flyovers (Web/game/title-reel.js) as in-game footage, in Ultra Max, and encodes them into the reel the title screen
// and the loading screen play (Web/art/titles/reel.webm + reel.json + stills).
//
//   node tools/record-reel.mjs                       record every shot, then encode
//   node tools/record-reel.mjs --shots sunrise,airport   only these (frames of the others are kept from the last run)
//   node tools/record-reel.mjs --encode              only encode the frames already on disk
//   node tools/record-reel.mjs --repl <dir>          boot once and evaluate <dir>/cmd.js on request (for framing shots)
// Options: --fps 12 (rendered; the encode interpolates to 24), --w 1920 --h 1080, --frames <dir> (default Game/.reel-frames)
//
// It needs a WebGL browser. Under the cloud's software GL a 1080p Ultra Max frame takes several seconds, so a whole reel takes an hour or two;
// on a machine with a graphics card it is minutes. The game itself is never changed by recording: the director only moves the camera and
// steps the world's own traffic, trains, aircraft and people.
import http from "http";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "../../Web"), VENDOR = path.resolve(here, "../vendor");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true); };
const FPS = +arg("fps", 12), W = +arg("w", 1920), H = +arg("h", 1080), OUTFPS = 24;
const FRAMES = path.resolve(arg("frames", path.resolve(here, "../.reel-frames")));
const OUT = path.join(WEB, "art/titles");
const REPL = arg("repl", null);
const log = (...a) => console.log("[reel]", ...a);

async function boot() {
  let chromium;
  try { ({ chromium } = await import("playwright")); } catch (e) { const m = await import(process.env.PLAYWRIGHT || "playwright"); chromium = m.chromium || (m.default && m.default.chromium); }
  const mime = { ".ogg": "audio/ogg", ".html": "text/html", ".css": "text/css", ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".png": "image/png", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".webm": "video/webm" };
  const srv = http.createServer((q, r) => {
    let f = path.join(WEB, decodeURIComponent(q.url.split("?")[0]));
    if (f.endsWith(path.sep) || f === WEB) f = path.join(WEB, "konto.html");
    fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader("Content-Type", mime[path.extname(f)] || "application/octet-stream"); r.end(d); });
  }).listen(0);
  const gpu = process.env.REEL_GPU === "1";
  const browser = await chromium.launch({ args: gpu ? ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"] : ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  page.on("pageerror", e => console.log("[pageerror]", String(e).slice(0, 200)));
  // the recording is Ultra, always: the tier is picked before the world is built, so its textures are built at Ultra too
  await page.addInitScript(() => { try { localStorage.setItem("konto.tier", "ultra"); localStorage.setItem("konto.tierPicked", "1"); localStorage.removeItem("konto.gfxSafe"); } catch (e) {} });
  await page.route("**/three.min.js", r => r.fulfill({ path: path.join(VENDOR, "three.min.js"), contentType: "text/javascript" }));
  await page.route("**/GLTFLoader.js", r => r.fulfill({ path: path.join(VENDOR, "GLTFLoader.js"), contentType: "text/javascript" }));
  await page.route("**/RGBELoader.js", r => r.fulfill({ path: path.join(VENDOR, "RGBELoader.js"), contentType: "text/javascript" }));
  await page.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await page.goto(`http://localhost:${srv.address().port}/konto.html?persist=0&ultramax=1&igpu=0&titlereel=0`, { waitUntil: "commit" });
  for (let i = 0; i < 240; i++) { try { if (await page.evaluate(() => !!(window.title && title.on && window.titleReel))) break; } catch (e) {} await page.waitForTimeout(5000); }
  // the commuters in the rush shot are the people library's business suits; give it a few minutes to arrive
  for (let i = 0; i < 36; i++) { try { if (await page.evaluate(() => typeof pplLib === "object" && pplLib.ready.length > 4)) break; } catch (e) {} await page.waitForTimeout(5000); }
  log("at the title");
  return { page, close: async () => { await browser.close(); srv.close(); } };
}

async function repl(page, dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state"), "ready");
  const cmd = path.join(dir, "cmd.js"), out = path.join(dir, "out.json");
  for (;;) {
    if (fs.existsSync(cmd)) {
      const src = fs.readFileSync(cmd, "utf8"); fs.unlinkSync(cmd);
      if (src.trim() === "quit") break;
      let res;
      try { res = await page.evaluate(new Function("return (async () => { const r = await (async () => {" + src + "})(); return JSON.parse(JSON.stringify(r === undefined ? null : r, (k, v) => v && v.isObject3D ? '[Object3D]' : v)); })()")); } catch (e) { res = { error: String(e).slice(0, 2000) }; }
      if (res && res.__jpg) { fs.writeFileSync(path.join(dir, res.__name || "shot.jpg"), Buffer.from(res.__jpg.split(",")[1], "base64")); delete res.__jpg; }
      fs.writeFileSync(out + ".tmp", JSON.stringify(res, null, 1)); fs.renameSync(out + ".tmp", out);
    }
    await page.waitForTimeout(400);
  }
}

async function record(page, only) {
  const plan = await page.evaluate(() => titleReel.plan().map(s => ({ id: s.id, dur: s.dur })));
  log("shots:", plan.map(s => s.id + " " + s.dur + "s").join(", "));
  for (const s of plan) {
    if (only && !only.includes(s.id)) continue;
    const dir = path.join(FRAMES, s.id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const n = Math.round(s.dur * FPS);
    const t0 = Date.now();
    await page.evaluate(([id, w, h, fps]) => titleReel.rec.begin(id, w, h, fps), [s.id, W, H, FPS]);
    for (let i = 0; i < n; i++) {
      const url = await page.evaluate(i => titleReel.rec.frame(i), i);
      fs.writeFileSync(path.join(dir, String(i).padStart(5, "0") + ".jpg"), Buffer.from(url.split(",")[1], "base64"));
      if (i % 10 === 0) log(s.id, i + "/" + n, Math.round((Date.now() - t0) / (i + 1)) + " ms a frame");
    }
    await page.evaluate(() => titleReel.rec.end());
  }
}

// Each shot is interpolated from the rendered rate up to 24 frames a second (motion-compensated: the camera moves are slow and smooth),
// then the shots are joined with a short dissolve into one file, which is what lets the loading screen loop it with no script running.
function encode() {
  const ff = (...a) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a], { stdio: "inherit" });
  const info = JSON.parse(fs.readFileSync(path.join(FRAMES, "plan.json"), "utf8"));
  const shots = info.shots.filter(s => fs.existsSync(path.join(FRAMES, s.id, "00000.jpg")));
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = path.join(FRAMES, "_enc"); fs.mkdirSync(tmp, { recursive: true });
  const XF = 0.8, parts = [];
  shots.forEach(s => {
    const o = path.join(tmp, s.id + ".mp4");
    ff("-framerate", String(info.fps || FPS), "-i", path.join(FRAMES, s.id, "%05d.jpg"),
       "-vf", `scale=${W}:${H}:flags=lanczos,minterpolate=fps=${OUTFPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,format=yuv420p`, "-c:v", "libx264", "-crf", "12", "-preset", "medium", o);
    const n = fs.readdirSync(path.join(FRAMES, s.id)).filter(f => f.endsWith(".jpg")).length;
    // the interpolated clip is a frame or three shorter than frames / rate: the dissolves are placed on its real length
    const real = +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", o]).toString().trim();
    parts.push({ s, o, dur: real > 0 ? real : n / (info.fps || FPS) });
    // a still of each shot, for the thread and for the poster
    ff("-ss", String(parts[parts.length - 1].dur * 0.6), "-i", o, "-frames:v", "1", "-q:v", "3", path.join(OUT, s.id + ".jpg"));
  });
  // join with dissolves
  const inputs = parts.flatMap(p => ["-i", p.o]);
  let f = "", last = "[0:v]", off = 0;
  const chapters = [];
  parts.forEach((p, i) => {
    chapters.push({ t: Math.max(0, +(off).toFixed(2)), id: p.s.id, kicker: p.s.kicker, title: p.s.title, sub: p.s.sub });
    if (i === 0) { off = p.dur - XF; return; }
    const lab = `[x${i}]`;
    f += `${last}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${off.toFixed(3)}${lab};`;
    last = lab; off += p.dur - XF;
  });
  const total = off + XF;
  const map = parts.length > 1 ? ["-filter_complex", f.replace(/;$/, ""), "-map", last] : [];
  ff(...inputs, ...map, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "31", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-pix_fmt", "yuv420p", "-an", path.join(OUT, "reel.webm"));
  fs.copyFileSync(path.join(OUT, parts[0].s.id + ".jpg"), path.join(OUT, "reel.jpg"));
  const manifest = { note: "In-game footage recorded in the Shigoto engine in Ultra Max cinematic mode by Game/tools/record-reel.mjs. Not live gameplay.",
    video: "art/titles/reel.webm", poster: "art/titles/reel.jpg", duration: +total.toFixed(2), recorded: new Date().toISOString().slice(0, 10), mode: "Ultra Max", chapters };
  fs.writeFileSync(path.join(OUT, "reel.json"), JSON.stringify(manifest, null, 2) + "\n");
  log("reel:", path.join(OUT, "reel.webm"), (fs.statSync(path.join(OUT, "reel.webm")).size / 1e6).toFixed(1) + " MB", total.toFixed(1) + " s,", chapters.length, "shots");
}

if (arg("encode", false) === true) { encode(); process.exit(0); }
const { page, close } = await boot();
if (REPL) { await repl(page, path.resolve(REPL)); await close(); process.exit(0); }
fs.mkdirSync(FRAMES, { recursive: true });
const only = typeof arg("shots", null) === "string" ? arg("shots").split(",") : null;
const plan = await page.evaluate(() => titleReel.plan().map(s => ({ id: s.id, dur: s.dur, kicker: s.kicker, title: s.title, sub: s.sub })));
fs.writeFileSync(path.join(FRAMES, "plan.json"), JSON.stringify({ fps: FPS, w: W, h: H, shots: plan }, null, 2));
await record(page, only);
await close();
encode();
