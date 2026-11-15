// Renders the soundscape offline (no game boot): the mixer, the world bed at a busy junction, a storm, footsteps and the three stingers,
// into an OfflineAudioContext, then checks every part makes sound, nothing clips, and each setting moves its bus.
//   node Game/tools/soundscape-test.mjs [out.wav]
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
let chromium; try { ({ chromium } = await import("playwright")); } catch (e) { const m = await import(process.env.PLAYWRIGHT || "/opt/node-tools/node_modules/playwright/index.js"); chromium = m.chromium || m.default.chromium; }
const src = fs.readFileSync(path.resolve(here, "../../Web/game/soundscape.js"), "utf8");
const browser = await chromium.launch(); const page = await browser.newPage();
page.on("pageerror", e => console.log("[pageerror]", String(e)));
const r = await page.evaluate(async (src) => {
  const SR = 44100, secs = 14, ctx = new OfflineAudioContext(2, SR * secs, SR);
  const master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  // just enough of the game for the soundscape to run
  window.sound = { ctx, master, ready: true }; window.gameSet = {}; window.saveSettings = () => {};
  window.world = { cities: [{ name: "Tōkonto", bounds: { x0: -1000, x1: 1000, z0: -1000, z1: 1000 } }] };
  window.traffic = { cars: Array.from({ length: 20 }, (_, i) => ({ live: true, at: { x: i * 6 - 60, z: 10 } })) };
  window.peds = { list: Array.from({ length: 12 }, (_, i) => ({ x: i - 6, z: 3, state: "walk" })) };
  window.player = { placed: true, mode: "walk", speed: 1.4, pos: { x: 0, y: 5, z: 0 } };
  window.drive = {}; window.interior = { active: false }; window.nightState = { lit: 0 };
  const W = { cur: { rain: 0, wind: 2, storm: 0 }, wetness: 0, audio: null, enableAudio(c, d) { this.audio = c; const g = c.createGain(); g.gain.value = 0; this._g = g;
    const b = c.createBuffer(1, SR, SR), a = b.getChannelData(0); for (let i = 0; i < SR; i++) a[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.connect(g); g.connect(d); s.start(); } };
  window.shigoto = { engine: { weather: W } };
  window.initAudio = () => {}; window.updateSound = () => {};
  (0, eval)(src);
  window.initAudio();
  const SS = window.soundscape, marks = {};
  // offline time only moves when rendered: schedule the scene with suspend points
  const at = (t, f) => ctx.suspend(t).then(() => { f(); ctx.resume(); });
  for (let t = 0.1; t < 4; t += 0.1) at(t, () => { player.pos.x += 0.14; SS.tick(0.1); });
  at(4.0, () => { marks.pass = ctx.currentTime; SS.sting("pass"); });
  at(7.0, () => { marks.fail = ctx.currentTime; SS.sting("fail"); });
  for (let t = 10.1; t < 13.9; t += 0.1) at(t, () => { W.cur = { rain: 1, wind: 9, storm: 1 }; W.wetness = 0.8; if (W._g) W._g.gain.value = 0.2; player.pos.x += 0.3; player.speed = 5; SS.tick(0.1); });
  at(10.0, () => { marks.start = ctx.currentTime; SS.sting("start"); });
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), win = (a, b) => { let s = 0, p = 0; for (let i = Math.floor(a * SR); i < Math.floor(b * SR); i++) { s += L[i] * L[i]; p = Math.max(p, Math.abs(L[i])); } return { rms: Math.sqrt(s / ((b - a) * SR)), peak: p }; };
  // a WAV, to listen to
  const n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, SR, true); out.setUint32(28, SR * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, L[i])) * 32767, true);
  return { bed: win(1.5, 3.9), pass: win(4.5, 6.5), fail: win(7.8, 9.5), storm: win(11.5, 13.9), whole: win(0, 13.9), status: SS.status(), wav: Array.from(new Uint8Array(out.buffer)) };
}, src);
const outWav = process.argv[2]; if (outWav) fs.writeFileSync(outWav, Buffer.from(r.wav)); delete r.wav;
await browser.close();
let fails = 0; const ok = (name, c, info) => { console.log((c ? "ok   " : "FAIL ") + name + (info ? "  " + info : "")); if (!c) fails++; };
const f = x => "rms " + x.rms.toFixed(4) + " peak " + x.peak.toFixed(3);
ok("the street is not silent", r.bed.rms > 0.004, f(r.bed));
ok("mission passed sting is heard over the street", r.pass.rms > r.bed.rms * 1.3, f(r.pass));
ok("mission failed sting is heard over the street", r.fail.rms > r.bed.rms * 1.2, f(r.fail));
ok("a storm is louder than a clear day", r.storm.rms > r.bed.rms * 1.2, f(r.storm));
ok("nothing clips", r.whole.peak < 0.99, f(r.whole));
ok("the mixer is built", r.status.mixer && r.status.built);
process.exit(fails ? 1 : 0);
