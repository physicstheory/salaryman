// Karaoke and the dance floor: a timing-and-pitch minigame for the after-hours life (afterhours.js) and the company karaoke nights.
//
// HOW IT PLAYS ("Mic Check")
//   The song's vocal phrases scroll in from the right as gold ribbons, each at the height of its pitch. Seiko's mic is the ring on the
//   hit line. Hold SING (Space / A / left mouse) while a ribbon passes, and keep the ring on it with W/S (or the mouse, or the left stick).
//   Between the phrases come hype beats: diamonds with an arrow. Hit the arrow (arrow keys / D-pad) as it crosses the line.
//   On target and on the beat, the room cheers (the crowd meter on the right); miss and the colleagues wince.
//   The dance floor (mode "dance") is hype beats only, on every beat, on a club track.
//
// THE SONG
//   "Salary Man" (dvheight, Suno, https://suno.com/s/zTbfyxll05N98gxu) is the company song. The game looks for it, in order:
//     1. game/audio/salary-man.mp3 (or .m4a .ogg .wav) in the game folder: Web/game/audio/ in the repo
//     2. any song in My Music whose name has "salary man" in it ("Add Your Files\music\Salary Man.mp3")
//     3. Suno's CDN, streamed, if the machine is online
//     4. a built-in guide arrangement of the theme (so the minigame always works)
//   The ribbons are worked out from the audio itself (vocal-band energy and pitch, the beat), so any song works.
//   Lyrics: put a timed .lrc file next to the song (game/audio/salary-man.lrc: "[00:12.40] a line") and they scroll under the ribbons.
//
// API
//   karaoke.play({ track: "salaryman" | "dance" | { url, title }, mode: "sing" | "dance", title, crowd: [actors], done(result) })
//   result: { score, pct, grade: "S"|"A"|"B"|"C"|"D", quit, hits, misses, best }
//   karaoke.on, karaoke.tracks(), karaoke.analyse(audioBuffer)  (console: karaoke.play({}))
(function () {
  "use strict";
  const K = window.karaoke = window.karaoke || {};
  K.version = "1.0.0";
  K.on = false;
  const SUNO_ID = "6b7d322c-60de-49af-a861-9c093884f8c2";
  K.TRACKS = {
    salaryman: { id: "salaryman", title: "Salary Man", artist: "dvheight", local: "game/audio/salary-man", match: /salary\s*-?\s*man/i,
                 stream: ["https://cdn1.suno.ai/" + SUNO_ID + ".mp3", "https://cdn2.suno.ai/" + SUNO_ID + ".mp3"], guide: "theme" },
    dance: { id: "dance", title: "Konto Underground (club mix)", artist: "B1 resident", guide: "club" }
  };
  K.tracks = () => Object.values(K.TRACKS);

  // ---- audio --------------------------------------------------------------------------------------------------------------------------------
  function ctx() {
    if (typeof sound === "object" && sound.ctx) return sound.ctx;
    if (!K._ctx) { const AC = window.AudioContext || window.webkitAudioContext; K._ctx = AC ? new AC() : null; }
    return K._ctx;
  }
  async function fetchBuf(url) {
    const r = await fetch(url, { cache: "force-cache" }); if (!r.ok) throw new Error(url + ": " + r.status);
    const ab = await r.arrayBuffer(); if (ab.byteLength < 2000) throw new Error(url + ": too small");
    const c = ctx(); return await new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
  }
  async function fetchText(url) { try { const r = await fetch(url, { cache: "no-cache" }); return r.ok ? await r.text() : null; } catch (e) { return null; } }
  // finds the audio for a track: { buf, el, source, lrc }
  K.load = async function (t) {
    const out = { source: "guide" };
    if (t.local) {
      for (const ext of [".mp3", ".m4a", ".ogg", ".wav"]) {
        try { out.buf = await fetchBuf(t.local + ext); out.source = "file"; break; } catch (e) { /* next */ }
      }
      if (out.buf) out.lrc = await fetchText(t.local + ".lrc");
    }
    if (!out.buf && t.match) {
      try {
        const idx = await (await fetch("music/index.json", { cache: "no-cache" })).json();
        const all = []; Object.values(idx.stations || idx || {}).forEach(l => Array.isArray(l) && l.forEach(x => all.push(x)));
        const hit = all.find(x => t.match.test((x.t || "") + " " + (x.f || "")));
        if (hit) { out.buf = await fetchBuf(hit.f); out.source = "my music"; out.lrc = await fetchText(hit.f.replace(/\.[^.]+$/, ".lrc")); }
      } catch (e) { /* no music folder */ }
    }
    if (!out.buf && t.stream && navigator.onLine !== false) {
      for (const u of t.stream) {
        try { out.buf = await fetchBuf(u); out.source = "stream"; break; } catch (e) { /* CORS or offline: try a media element */ }
      }
      if (!out.buf) {
        const el = await new Promise(res => {
          const a = new Audio(); a.preload = "auto"; a.crossOrigin = "anonymous";
          const to = setTimeout(() => res(null), 7000);
          a.oncanplaythrough = () => { clearTimeout(to); res(a); }; a.onerror = () => { clearTimeout(to); res(null); };
          a.src = t.stream[0]; a.load();
        });
        if (el && isFinite(el.duration) && el.duration > 20) { out.el = el; out.source = "stream"; }
      }
    }
    if (!out.buf && !out.el) { const g = await guide(t.guide || "theme"); out.buf = g.buf; out.chart = g.chart; out.source = "guide"; }
    return out;
  };

  // ---- reading a song: where the singing is, how high, and where the beat falls ---------------------------------------------------------
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  const pct = (arr, p) => { const s = Array.from(arr).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))] : 0; };
  K.analyse = async function (buf, mode) {
    const sr = buf.sampleRate, N = 2048, HOP = 1024, ch0 = buf.getChannelData(0), ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    const frames = Math.max(1, Math.floor((buf.length - N) / HOP)), dt = HOP / sr;
    const mid = new Float32Array(frames), low = new Float32Array(frames), pitch = new Float32Array(frames);
    const re = new Float32Array(N), im = new Float32Array(N), win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    const bin = f => Math.round(f * N / sr);
    const b80 = bin(40), b150 = bin(150), b300 = bin(260), b1k = bin(1050), b3k = bin(3200);
    for (let f = 0; f < frames; f++) {
      const o = f * HOP;
      // centre channel (L+R) keeps a centred lead vocal and drops wide stereo instruments a little
      for (let i = 0; i < N; i++) { re[i] = (ch1 ? (ch0[o + i] + ch1[o + i]) * 0.5 : ch0[o + i]) * win[i]; im[i] = 0; }
      fft(re, im);
      let lo = 0, md = 0, best = 0, bi = 0;
      for (let k = b80; k < b150; k++) lo += re[k] * re[k] + im[k] * im[k];
      for (let k = b300; k < b3k; k++) { const m = re[k] * re[k] + im[k] * im[k]; md += m; if (k < b1k && m > best) { best = m; bi = k; } }
      low[f] = Math.sqrt(lo); mid[f] = Math.sqrt(md);
      pitch[f] = bi ? 69 + 12 * Math.log2(bi * sr / N / 440) : 0;
      if ((f & 511) === 511) await new Promise(r => setTimeout(r, 0));
    }
    // smoothing
    const sm = (a, w) => { const o = new Float32Array(a.length); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= w) s -= a[i - w]; o[i] = s / Math.min(i + 1, w); } return o; };
    const env = sm(mid, Math.max(1, Math.round(0.14 / dt)));
    // the beat: autocorrelation of the low band's onsets
    const on = new Float32Array(frames); for (let i = 1; i < frames; i++) on[i] = Math.max(0, low[i] - low[i - 1]);
    let bestLag = Math.round(0.5 / dt), bestV = -1;
    for (let lag = Math.round(60 / 180 / dt); lag <= Math.round(60 / 72 / dt); lag++) { let v = 0; for (let i = lag; i < frames; i++) v += on[i] * on[i - lag]; v *= 1 + 0.15 * Math.exp(-Math.pow((60 / (lag * dt) - 118) / 30, 2)); if (v > bestV) { bestV = v; bestLag = lag; } }
    let phase = 0, pv = -1; for (let p = 0; p < bestLag; p++) { let v = 0; for (let i = p; i < frames; i += bestLag) v += on[i]; if (v > pv) { pv = v; phase = p; } }
    const beat = bestLag * dt, beat0 = phase * dt, bpm = 60 / beat;
    const chart = { notes: [], hype: [], bpm: Math.round(bpm), beat: beat, beat0: beat0, dur: buf.duration };
    const dirs = ["left", "up", "right", "down"];
    if (mode === "dance") {
      for (let t = beat0 + beat * 8, i = 0; t < buf.duration - 2; t += beat, i++) { if (i % 8 === 7 && Math.random() < 0.5) continue; chart.hype.push({ t: t, dir: dirs[(i * 7 + (i >> 2)) % 4] }); }
      return chart;
    }
    // the singing: the mid band over its median, made into phrases, cut into syllable-length ribbons
    const th = pct(env, 0.52), quiet = pct(env, 0.12);
    const act = []; for (let i = 0; i < frames; i++) act.push(env[i] > th && env[i] > quiet * 1.8);
    const segs = []; let s0 = -1;
    for (let i = 0; i <= frames; i++) { const a = i < frames && act[i]; if (a && s0 < 0) s0 = i; else if (!a && s0 >= 0) { segs.push([s0 * dt, i * dt]); s0 = -1; } }
    const merged = [];
    segs.forEach(q => { const l = merged[merged.length - 1]; if (l && q[0] - l[1] < 0.28) l[1] = q[1]; else merged.push(q.slice()); });
    const pieces = [];
    merged.filter(q => q[1] - q[0] > 0.35 && q[0] > 1.5).forEach(q => {
      const len = q[1] - q[0], n = Math.max(1, Math.round(len / Math.max(beat * 2, 0.9)));
      for (let k = 0; k < n; k++) { const a = q[0] + len * k / n, b = q[0] + len * (k + 1) / n - (k < n - 1 ? 0.06 : 0); pieces.push([a, b]); }
    });
    const pitches = pieces.map(q => { const a = []; for (let i = Math.floor(q[0] / dt); i < Math.min(frames, Math.ceil(q[1] / dt)); i++) if (pitch[i]) a.push(pitch[i]); return a.length ? pct(a, 0.5) : 60; });
    const lo = pct(pitches, 0.08), hi = Math.max(lo + 5, pct(pitches, 0.92));
    let prev = 0.5;
    pieces.forEach((q, i) => {
      let p = 0.12 + 0.76 * Math.min(1, Math.max(0, (pitches[i] - lo) / (hi - lo)));
      p = prev + Math.max(-0.35, Math.min(0.35, p - prev)); prev = p;       // keep jumps singable
      chart.notes.push({ t0: q[0], t1: q[1], p: Math.round(p * 100) / 100 });
    });
    // the hype beats: in the gaps between phrases, on the beat
    let k = 0;
    for (let t = beat0; t < buf.duration - 1; t += beat, k++) {
      if (t < 4) continue;
      const busy = chart.notes.some(n => t > n.t0 - 0.45 && t < n.t1 + 0.35);
      if (!busy && k % 2 === 0) chart.hype.push({ t: t, dir: dirs[(k >> 1) % 4] });
    }
    return chart;
  };
  function lrcParse(txt) {
    if (!txt) return [];
    const out = [];
    txt.split(/\r?\n/).forEach(l => { const m = /^\s*\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/.exec(l); if (m) out.push({ t: +m[1] * 60 + +m[2], text: m[3] }); });
    return out.sort((a, b) => a.t - b.t);
  }

  // ---- the built-in guide arrangement (no audio file needed) ---------------------------------------------------------------------------------
  // "theme": a bright pop-rock take on a salaryman's march (D major, 116 bpm), with a soft guide melody that is the chart itself.
  // "club": a four-on-the-floor loop at 124 bpm for the dance floor.
  async function guide(kind) {
    const club = kind === "club", bpm = club ? 124 : 116, beat = 60 / bpm, bars = club ? 28 : 34, dur = bars * 4 * beat + 2, sr = 44100;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oc = new OAC(2, Math.ceil(dur * sr), sr);
    const out = oc.createGain(); out.gain.value = 0.55; out.connect(oc.destination);
    const noise = oc.createBuffer(1, sr, sr); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const kick = t => { const o = oc.createOscillator(), g = oc.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32); };
    const hiss = (t, d, v, f, type) => { const s = oc.createBufferSource(), fl = oc.createBiquadFilter(), g = oc.createGain(); s.buffer = noise; fl.type = type; fl.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.02); };
    const tone = (t, d, f, v, type, det) => { const o = oc.createOscillator(), g = oc.createGain(); o.type = type; o.frequency.value = f; if (det) o.detune.value = det; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.setValueAtTime(v * 0.8, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0008, t + d); o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); };
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    // D A Bm G | D A G A   (I V vi IV)
    const prog = club ? [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]] : [[50, 54, 57], [45, 49, 52], [47, 50, 54], [43, 47, 50], [50, 54, 57], [45, 49, 52], [43, 47, 50], [45, 49, 52]];
    const chart = { notes: [], hype: [], bpm: bpm, beat: beat, beat0: 1, dur: dur };
    const scale = club ? [57, 60, 62, 64, 67, 69] : [62, 64, 66, 67, 69, 71, 73, 74];
    const dirs = ["left", "up", "right", "down"];
    let seed = 19640101; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const lo = scale[0], hi = scale[scale.length - 1];
    for (let b = 0; b < bars; b++) {
      const t0 = 1 + b * 4 * beat, ch = prog[b % prog.length], part = club ? "club" : (b < 2 ? "intro" : b < 10 ? "verse" : b < 14 ? "pre" : b < 22 ? "chorus" : b < 24 ? "whistle" : b < 30 ? "chorus" : "outro");
      for (let q = 0; q < 4; q++) {
        const t = t0 + q * beat;
        if (club || q % 2 === 0 || part === "chorus") kick(t);
        if (!club && q % 2 === 1) hiss(t, 0.18, 0.5, 1800, "bandpass");
        if (club && q % 2 === 1) hiss(t, 0.12, 0.35, 2600, "bandpass");
        hiss(t + beat / 2, 0.05, club ? 0.3 : 0.18, 7000, "highpass"); hiss(t, 0.04, 0.12, 8000, "highpass");
        tone(t, beat * 0.45, hz(ch[0] - 12), 0.28, club ? "sawtooth" : "triangle"); tone(t + beat / 2, beat * 0.4, hz(ch[0] - 12), 0.2, "triangle");
      }
      if (part !== "intro") ch.forEach((m, i) => { tone(t0, 4 * beat * 0.95, hz(m), 0.06, "sawtooth", -7 + i * 5); tone(t0, 4 * beat * 0.95, hz(m), 0.05, "triangle", 6); });
      if (club) {
        for (let q = 0; q < 4; q++) { const t = t0 + q * beat; if ((b * 4 + q) % 8 !== 7 && b >= 2) chart.hype.push({ t: t, dir: dirs[(b * 4 + q) % 4] }); }
        continue;
      }
      // the melody: two-beat phrases in verse, longer notes in the chorus, a whistle break on the hype beats
      if (part === "verse" || part === "pre" || part === "chorus" || part === "outro") {
        const long = part === "chorus";
        let q = 0;
        while (q < 4) {
          const len = long ? (rnd() < 0.5 ? 2 : 1) : (rnd() < 0.7 ? 1 : 0.5);
          if (q + len > 4) break;
          const restHere = !long && q === 3;
          if (!restHere) {
            const target = ch[(q + b) % 3] + 12;
            let m = scale.reduce((a, s) => Math.abs(s - target) < Math.abs(a - target) ? s : a, scale[0]);
            if (part === "chorus" && q === 0) m = scale[Math.min(scale.length - 1, 5 + (b % 3))];
            const t = t0 + q * beat, d = len * beat * 0.92;
            tone(t, d, hz(m), 0.11, "sine"); tone(t, d, hz(m + 12), 0.025, "sine");
            chart.notes.push({ t0: t, t1: t + d, p: Math.round((0.12 + 0.76 * (m - lo) / (hi - lo)) * 100) / 100 });
          } else chart.hype.push({ t: t0 + q * beat, dir: dirs[b % 4] });
          q += len;
        }
      } else if (part === "whistle" || part === "intro") {
        for (let q = 0; q < 4; q++) { const t = t0 + q * beat; chart.hype.push({ t: t, dir: dirs[(b + q) % 4] }); if (part === "whistle") tone(t, beat * 0.4, hz(scale[(b + q * 2) % scale.length] + 12), 0.06, "sine"); }
      }
    }
    const buf = await oc.startRendering();
    return { buf: buf, chart: chart };
  }
  K.guide = guide;

  // ---- the screen ---------------------------------------------------------------------------------------------------------------------------
  function css() {
    if (document.getElementById("karacss")) return;
    const st = document.createElement("style"); st.id = "karacss";
    st.textContent = `
#kara{position:fixed;inset:0;z-index:70;pointer-events:none;opacity:0;transition:opacity .35s}
#kara.on{opacity:1;pointer-events:auto}
#kara canvas{width:100%;height:100%;display:block}
body.karaoke #hud,body.karaoke #minimap,body.karaoke #objective,body.karaoke #notifs,body.karaoke #iprompt,body.karaoke #prompt{opacity:0!important}
`;
    document.head.appendChild(st);
  }
  let cv = null, g = null;
  function screen() {
    css();
    let el = document.getElementById("kara");
    if (!el) { el = document.createElement("div"); el.id = "kara"; cv = document.createElement("canvas"); el.appendChild(cv); document.body.appendChild(el); g = cv.getContext("2d"); }
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return el;
  }
  const FONT = "'Konto Sans','Segoe UI',system-ui,sans-serif";
  const ARROW = { left: "◀", up: "▲", right: "▶", down: "▼" };
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ---- a turn at the mic --------------------------------------------------------------------------------------------------------------------
  const S = K.state = { on: false };
  K.play = async function (o) {
    o = o || {};
    if (S.on) return;
    const mode = o.mode || (o.track === "dance" ? "dance" : "sing");
    const t = typeof o.track === "object" ? o.track : K.TRACKS[o.track || (mode === "dance" ? "dance" : "salaryman")] || K.TRACKS.salaryman;
    Object.assign(S, { on: true, loading: true, mode: mode, track: t, o: o, title: o.title || t.title, t: -3, score: 0, max: 1, combo: 0, best: 0, crowd: 0.5,
      cursor: 0.5, singing: false, lastT: undefined, hits: 0, misses: 0, flash: [], judged: new Set(), noteAcc: {}, lyrics: [], quit: false, done: false, keys: {}, mouseY: null, padWas: {} });
    K.on = true;
    document.body.classList.add("karaoke");
    const el = screen(); requestAnimationFrame(() => el.classList.add("on"));
    if (typeof setPhone === "function" && typeof phone === "object" && phone.open) setPhone(false);
    if (typeof player === "object") player.speed = 0;
    try {
      const a = await K.load(t);
      S.source = a.source;
      S.chart = a.chart || (a.buf ? await K.analyse(a.buf, mode) : await fallbackChart(a.el, mode));
      S.lyrics = lrcParse(a.lrc);
      S.buf = a.buf; S.el = a.el;
    } catch (e) {
      console.warn("[Karaoke] could not load the song:", e);
      const gd = await guide(mode === "dance" ? "club" : "theme"); S.buf = gd.buf; S.chart = gd.chart; S.source = "guide";
    }
    if (!S.on) return;
    // the score it could reach: every ribbon sung on pitch and every beat perfect
    S.max = S.chart.notes.reduce((a, n) => a + (n.t1 - n.t0) * 1000, 0) + S.chart.hype.length * 300 || 1;
    S.loading = false;
    S.t = -3.2;
    S.duck = duck(true);
    console.log("[Karaoke] " + S.title + " · " + S.source + " · " + S.chart.notes.length + " phrases, " + S.chart.hype.length + " beats, " + S.chart.bpm + " bpm");
  };
  async function fallbackChart(el, mode) {
    // a stream we may not read: lay ribbons on the tempo of the guide theme for the length of the song
    const gd = await guide(mode === "dance" ? "club" : "theme"), c = gd.chart, d = el.duration, out = { notes: [], hype: [], bpm: c.bpm, beat: c.beat, beat0: 0.5, dur: d };
    const span = c.dur - 3;
    for (let k = 0; k * span < d; k++) {
      c.notes.forEach(n => { const a = n.t0 + k * span + 6; if (a < d - 2) out.notes.push({ t0: a, t1: n.t1 + k * span + 6, p: n.p }); });
      c.hype.forEach(n => { const a = n.t + k * span + 6; if (a < d - 2) out.hype.push({ t: a, dir: n.dir }); });
    }
    return out;
  }
  function duck(on) {
    try {
      if (typeof sound === "object" && sound.master) { const was = sound.master.gain.value; if (on) { sound.master.gain.value = Math.min(was, 0.12); return was; } }
    } catch (e) { /* no game audio */ }
    return null;
  }
  function startAudio() {
    const c = ctx(); if (c && c.state === "suspended") c.resume();
    if (S.buf && c) {
      const src = c.createBufferSource(), gn = c.createGain(); src.buffer = S.buf; gn.gain.value = 0.9; src.connect(gn); gn.connect(c.destination);
      S.src = src; S.t0 = c.currentTime + 0.05; src.start(S.t0); src.onended = () => { if (S.on && !S.done) finish(false); };
    } else if (S.el) { S.el.currentTime = 0; S.el.volume = 0.9; S.el.play().catch(() => {}); S.el.onended = () => { if (S.on && !S.done) finish(false); }; }
  }
  function songTime() {
    if (S.src) return ctx().currentTime - S.t0;
    if (S.el) return S.el.currentTime;
    return S.t;
  }
  function stopAudio() {
    try { if (S.src) { S.src.onended = null; S.src.stop(); } } catch (e) { /* stopped */ }
    try { if (S.el) { S.el.onended = null; S.el.pause(); } } catch (e) { /* stopped */ }
    S.src = null;
    try { if (S.duck !== null && S.duck !== undefined && typeof sound === "object" && sound.master) sound.master.gain.value = S.duck; } catch (e) { /* none */ }
  }

  // ---- input -------------------------------------------------------------------------------------------------------------------------------
  const KEYDIR = { ArrowLeft: "left", ArrowUp: "up", ArrowRight: "right", ArrowDown: "down" };
  window.addEventListener("keydown", e => {
    if (!S.on) return;
    const k = e.code;
    if (S.done) { if (!e.repeat && (k === "Enter" || k === "Space" || k === "Escape" || k === "KeyE" || k === "KeyF")) close(); }
    else if (k === "Escape") { if (S.loading) close(); else finish(true); }
    else if (KEYDIR[k] && !e.repeat) hype(KEYDIR[k]);
    else S.keys[k] = true;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  window.addEventListener("keyup", e => { if (!S.on) return; S.keys[e.code] = false; e.preventDefault(); e.stopImmediatePropagation(); }, true);
  window.addEventListener("mousemove", e => { if (S.on) S.mouseY = e.clientY / innerHeight; }, true);
  window.addEventListener("mousedown", e => { if (S.on) { S.mouseDown = true; if (S.done) close(); e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  window.addEventListener("mouseup", e => { if (S.on) { S.mouseDown = false; } }, true);
  function readPad() {
    const gp = navigator.getGamepads ? navigator.getGamepads() : [];
    const gpad = gp && Array.from(gp).find(x => x); if (!gpad) return null;
    const b = i => !!(gpad.buttons[i] && gpad.buttons[i].pressed);
    const now = { a: b(0), b: b(1), up: b(12), down: b(13), left: b(14), right: b(15), start: b(9) };
    const pr = {}; for (const k in now) { pr[k] = now[k] && !S.padWas[k]; S.padWas[k] = now[k]; }
    return { held: now, pressed: pr, y: gpad.axes[1] || 0 };
  }

  // ---- judging -------------------------------------------------------------------------------------------------------------------------------
  function pop(text, col, y) { S.flash.push({ text: text, col: col, t: 0, y: y === undefined ? 0.5 : y }); if (S.flash.length > 6) S.flash.shift(); }
  function hype(dir) {
    if (S.loading || S.done || S.t < -0.2) return;
    const t = songTime();
    let best = null, bd = 1e9;
    S.chart.hype.forEach((h, i) => { if (S.judged.has("h" + i)) return; const d = Math.abs(h.t - t); if (d < bd) { bd = d; best = i; } });
    if (best === null || bd > 0.32) { S.combo = 0; S.crowd = Math.max(0, S.crowd - 0.03); pop("Off beat", "#ff7a6e", 0.86); return; }
    const h = S.chart.hype[best];
    S.judged.add("h" + best);
    if (h.dir !== dir) { miss("Wrong way"); return; }
    if (bd < 0.12) { S.score += 300; S.combo++; S.hits++; S.crowd = Math.min(1, S.crowd + 0.05); pop("PERFECT", "#7ff5ff", 0.86); }
    else { S.score += 120; S.combo++; S.hits++; S.crowd = Math.min(1, S.crowd + 0.02); pop("GOOD", "#ffd75e", 0.86); }
    S.best = Math.max(S.best, S.combo);
    if (S.o.onBeat) try { S.o.onBeat(true); } catch (e) { /* the room */ }
  }
  function miss(text) { S.combo = 0; S.misses++; S.crowd = Math.max(0, S.crowd - 0.06); pop(text || "MISS", "#ff7a6e", 0.86); if (S.o.onBeat) try { S.o.onBeat(false); } catch (e) { /* the room */ } }

  K.frame = function (dt) {
    if (!S.on) return;
    dt = Math.min(0.1, dt);
    const p = readPad();
    if (p) { if (S.done && (p.pressed.a || p.pressed.b)) { close(); return; } if (p.pressed.b && !S.done) { finish(true); } ["left", "up", "right", "down"].forEach(d => { if (p.pressed[d]) hype(d); }); }
    if (!S.loading && !S.done) {
      if (S.t < 0) { S.t += dt; if (S.t >= -0.05 && !S.started) { S.started = true; startAudio(); } }
      if (S.started) S.t = songTime();
      // the mic
      let v = 0;
      if (S.keys.KeyW) v += 1; if (S.keys.KeyS) v -= 1;
      if (p && Math.abs(p.y) > 0.18) S.cursor = Math.max(0, Math.min(1, 0.5 - p.y * 0.55));
      else if (v) S.cursor = Math.max(0, Math.min(1, S.cursor + v * dt * 1.35));
      else if (S.mouseY !== null && S.mouseMoved) S.cursor = Math.max(0, Math.min(1, (0.78 - S.mouseY) / 0.28));
      S.singing = !!(S.keys.Space || S.keys.Enter || S.mouseDown || (p && p.held.a));
      const t = S.t;
      // each ribbon scores the part of it this frame covered (so a slow frame still counts the singing it spanned)
      const tp = S.lastT === undefined ? t : Math.min(S.lastT, t); S.lastT = t;
      if (S.mode === "sing") S.chart.notes.forEach((n, i) => {
        if (t < n.t0 || S.judged.has("n" + i)) return;
        const acc = S.noteAcc[i] || (S.noteAcc[i] = { on: 0, len: 0 });
        const span = Math.min(t, n.t1) - Math.max(tp, n.t0);
        if (span > 0) {
          const d = Math.abs(S.cursor - n.p), a = S.singing ? Math.max(0, 1 - d / 0.16) : 0;
          acc.on += a * span; acc.len += span; S.score += a * span * 1000;
          S.crowd = Math.max(0, Math.min(1, S.crowd + (a > 0.5 ? 0.04 : -0.025) * span * 4));
        }
        if (t > n.t1) {
          S.judged.add("n" + i);
          const r = acc.len ? acc.on / acc.len : 0;
          if (r > 0.72) { S.combo++; S.hits++; pop(r > 0.9 ? "PERFECT" : "GREAT", r > 0.9 ? "#7ff5ff" : "#9dff8a"); }
          else if (r > 0.4) { S.combo++; S.hits++; pop("OK", "#ffd75e"); }
          else miss("MISS");
          S.best = Math.max(S.best, S.combo);
        }
      });
      S.chart.hype.forEach((h, i) => { if (!S.judged.has("h" + i) && t > h.t + 0.32) { S.judged.add("h" + i); miss("MISS"); } });
      if (S.mode === "dance") S.crowd = Math.max(0, S.crowd - dt * 0.01);
      if (S.o.onFrame) try { S.o.onFrame(dt, S); } catch (e) { /* the room */ }
      const end = (S.chart.dur || 0) + 0.5;
      if (S.started && !S.src && !S.el && t > end) finish(false);
    }
    S.flash.forEach(f => { f.t += dt; }); S.flash = S.flash.filter(f => f.t < 0.9);
    draw();
  };
  window.addEventListener("mousemove", () => { if (S.on) S.mouseMoved = true; }, true);

  function grade(pc) { return pc >= 0.9 ? "S" : pc >= 0.78 ? "A" : pc >= 0.62 ? "B" : pc >= 0.45 ? "C" : "D"; }
  function finish(quit) {
    if (S.done) return;
    S.done = true; S.quit = !!quit;
    stopAudio();
    S.pct = Math.max(0, Math.min(1, S.score / S.max));
    if (quit) S.pct *= Math.min(1, Math.max(0, S.t) / Math.max(1, S.chart.dur || 60));
    S.grade = quit ? "D" : grade(S.pct);
    S.result = { score: Math.round(S.score), pct: Math.round(S.pct * 100) / 100, grade: S.grade, quit: S.quit, hits: S.hits, misses: S.misses, best: S.best, source: S.source };
  }
  function close() {
    if (!S.on) return;
    if (!S.done) finish(true);
    stopAudio();
    S.on = false; K.on = false;
    document.body.classList.remove("karaoke");
    const el = document.getElementById("kara"); if (el) el.classList.remove("on");
    const r = S.result || { score: 0, pct: 0, grade: "D", quit: true };
    if (S.o.done) setTimeout(() => { try { S.o.done(r); } catch (e) { console.warn("[Karaoke] after:", e); } }, 200);
  }
  K.stop = close;

  // ---- drawing ------------------------------------------------------------------------------------------------------------------------------
  function draw() {
    if (!g) return;
    const W = cv.width, H = cv.height, u = H / 1000;
    g.clearRect(0, 0, W, H);
    // the room stays visible up top; the lane sits on a dark band
    const gr = g.createLinearGradient(0, H * 0.38, 0, H); gr.addColorStop(0, "rgba(6,4,14,0)"); gr.addColorStop(0.18, "rgba(6,4,14,.78)"); gr.addColorStop(1, "rgba(6,4,14,.94)");
    g.fillStyle = gr; g.fillRect(0, H * 0.38, W, H * 0.62);
    g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(0, 0, W, 92 * u);
    g.textBaseline = "middle";
    g.font = "800 " + Math.round(34 * u) + "px " + FONT; g.fillStyle = "#fff"; g.textAlign = "left";
    g.fillText((S.mode === "dance" ? "💃 " : "🎤 ") + S.title, 40 * u, 46 * u);
    g.font = "600 " + Math.round(18 * u) + "px " + FONT; g.fillStyle = "#b9a8ff";
    g.fillText(S.loading ? "Loading the song…" : (S.track.artist ? S.track.artist + " · " : "") + (S.source === "guide" ? "guide arrangement" : S.source) + " · " + (S.chart ? S.chart.bpm + " bpm" : ""), 40 * u, 76 * u);
    g.textAlign = "right"; g.font = "900 " + Math.round(40 * u) + "px " + FONT; g.fillStyle = "#fff";
    g.fillText(Math.round(S.score).toLocaleString("en-US"), W - 40 * u, 44 * u);
    g.font = "700 " + Math.round(18 * u) + "px " + FONT; g.fillStyle = S.combo > 4 ? "#7ff5ff" : "#9aa";
    g.fillText(S.combo > 1 ? S.combo + " COMBO" : "", W - 40 * u, 76 * u);
    if (S.loading || !S.chart) { g.textAlign = "center"; g.font = "700 " + Math.round(28 * u) + "px " + FONT; g.fillStyle = "#fff"; g.fillText("Warming up the mic…", W / 2, H * 0.68); return; }

    // the lane
    const L = { x0: 80 * u, x1: W - 140 * u, y0: H * 0.5, y1: H * 0.78 }, hitX = L.x0 + (L.x1 - L.x0) * 0.2, ahead = S.mode === "dance" ? 2.6 : 4.0, pxs = (L.x1 - hitX) / ahead;
    const X = t => hitX + (t - S.t) * pxs, Y = p => L.y1 - p * (L.y1 - L.y0);
    rr(L.x0, L.y0 - 16 * u, L.x1 - L.x0, L.y1 - L.y0 + 32 * u, 18 * u); g.fillStyle = "rgba(255,255,255,.05)"; g.fill();
    g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 1;
    for (let i = 0; i <= 6; i++) { const y = L.y0 + (L.y1 - L.y0) * i / 6; g.beginPath(); g.moveTo(L.x0 + 10 * u, y); g.lineTo(L.x1 - 10 * u, y); g.stroke(); }
    // beat ticks
    const c = S.chart;
    if (c.beat) { g.strokeStyle = "rgba(255,255,255,.09)"; for (let t = c.beat0 + Math.ceil((S.t - 1 - c.beat0) / c.beat) * c.beat; t < S.t + ahead; t += c.beat) { const x = X(t); if (x < L.x0) continue; g.beginPath(); g.moveTo(x, L.y0 - 10 * u); g.lineTo(x, L.y1 + 10 * u); g.stroke(); } }
    g.save(); g.beginPath(); g.rect(L.x0, L.y0 - 30 * u, L.x1 - L.x0, L.y1 - L.y0 + 60 * u); g.clip();
    if (S.mode === "sing") c.notes.forEach((n, i) => {
      if (n.t1 < S.t - 1.2 || n.t0 > S.t + ahead) return;
      const x0 = X(n.t0), x1 = X(n.t1), y = Y(n.p), hh = 22 * u;
      const lit = S.noteAcc[i] && S.noteAcc[i].len ? S.noteAcc[i].on / S.noteAcc[i].len : -1;
      rr(x0, y - hh / 2, Math.max(hh, x1 - x0), hh, hh / 2);
      const ng = g.createLinearGradient(0, y - hh / 2, 0, y + hh / 2);
      if (lit > 0.6) { ng.addColorStop(0, "#b8fbff"); ng.addColorStop(1, "#27c6e8"); } else if (lit >= 0 && n.t1 < S.t) { ng.addColorStop(0, "#6b5a7a"); ng.addColorStop(1, "#43384f"); } else { ng.addColorStop(0, "#ffe9a3"); ng.addColorStop(1, "#e2a227"); }
      g.fillStyle = ng; g.shadowColor = lit > 0.6 ? "#3ff" : "#fb3"; g.shadowBlur = 14 * u; g.fill(); g.shadowBlur = 0;
    });
    c.hype.forEach((h, i) => {
      if (h.t < S.t - 0.5 || h.t > S.t + ahead || S.judged.has("h" + i)) return;
      const x = X(h.t), y = S.mode === "dance" ? (L.y0 + L.y1) / 2 : L.y1 + 2 * u, r = (S.mode === "dance" ? 34 : 22) * u;
      g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = "#ff3d8b"; g.shadowColor = "#f39"; g.shadowBlur = 16 * u; g.fillRect(-r / 1.5, -r / 1.5, r * 1.33, r * 1.33); g.restore();
      g.fillStyle = "#fff"; g.font = "900 " + Math.round(r * 0.95) + "px " + FONT; g.textAlign = "center"; g.fillText(ARROW[h.dir], x, y + 1);
    });
    g.restore();
    // the hit line and the mic
    g.strokeStyle = "rgba(255,255,255,.75)"; g.lineWidth = 3 * u; g.beginPath(); g.moveTo(hitX, L.y0 - 24 * u); g.lineTo(hitX, L.y1 + 24 * u); g.stroke();
    if (S.mode === "sing") {
      const my = Y(S.cursor), on = S.singing;
      g.beginPath(); g.arc(hitX, my, (on ? 20 : 15) * u, 0, 7); g.lineWidth = 5 * u; g.strokeStyle = on ? "#7ff5ff" : "rgba(255,255,255,.7)"; g.shadowColor = "#3ff"; g.shadowBlur = on ? 22 * u : 0; g.stroke(); g.shadowBlur = 0;
      if (on) { g.fillStyle = "rgba(127,245,255,.35)"; g.fill(); }
    }
    // the crowd meter
    const mx = W - 92 * u, my0 = L.y0 - 10 * u, mh = L.y1 - L.y0 + 20 * u;
    rr(mx, my0, 26 * u, mh, 13 * u); g.fillStyle = "rgba(255,255,255,.1)"; g.fill();
    const fh = mh * S.crowd; rr(mx, my0 + mh - fh, 26 * u, fh, 13 * u);
    const cg = g.createLinearGradient(0, my0 + mh, 0, my0); cg.addColorStop(0, "#ff4d6d"); cg.addColorStop(0.5, "#ffd75e"); cg.addColorStop(1, "#7dff9a"); g.fillStyle = cg; g.fill();
    g.font = "700 " + Math.round(14 * u) + "px " + FONT; g.fillStyle = "#ccc"; g.textAlign = "center"; g.fillText("CROWD", mx + 13 * u, my0 + mh + 24 * u);
    // lyrics, or the part of the song
    g.textAlign = "center";
    const ly = S.lyrics, li = ly.length ? ly.reduce((a, l, i) => l.t <= S.t + 0.25 ? i : a, -1) : -1;
    if (ly.length) {
      g.font = "800 " + Math.round(34 * u) + "px " + FONT; g.fillStyle = "#fff"; if (li >= 0) g.fillText(ly[li].text, W / 2, H * 0.86);
      g.font = "600 " + Math.round(22 * u) + "px " + FONT; g.fillStyle = "rgba(255,255,255,.45)"; if (ly[li + 1]) g.fillText(ly[li + 1].text, W / 2, H * 0.91);
    } else if (S.mode === "sing") {
      const next = c.notes.find(n => n.t1 > S.t), gap = next ? next.t0 - S.t : 99;
      g.font = "700 " + Math.round(24 * u) + "px " + FONT; g.fillStyle = "rgba(255,255,255,.6)";
      g.fillText(gap > 2.5 ? "♪  instrumental · hit the hype beats  ♪" : "♪ ♪ ♪", W / 2, H * 0.87);
    }
    // judgements
    S.flash.forEach(f => { g.globalAlpha = Math.max(0, 1 - f.t / 0.9); g.font = "900 " + Math.round(30 * u) + "px " + FONT; g.fillStyle = f.col; g.textAlign = "center"; g.fillText(f.text, hitX, L.y0 - 44 * u - f.t * 40 * u + (f.y > 0.8 ? (L.y1 - L.y0) + 110 * u : 0)); g.globalAlpha = 1; });
    // the keys
    g.font = "600 " + Math.round(15 * u) + "px " + FONT; g.fillStyle = "rgba(255,255,255,.55)"; g.textAlign = "left";
    const pad = navigator.getGamepads && Array.from(navigator.getGamepads() || []).some(x => x);
    g.fillText(S.mode === "dance" ? (pad ? "D-pad on the beat · B stop" : "Arrow keys on the beat · Esc stop") : (pad ? "Hold A to sing · left stick pitch · D-pad hype beats · B stop" : "Hold Space to sing · W/S or mouse for pitch · arrow keys on the hype beats · Esc stop"), 40 * u, H - 30 * u);
    // count-in
    if (S.t < 0) { g.textAlign = "center"; g.font = "900 " + Math.round(120 * u) + "px " + FONT; g.fillStyle = "#fff"; g.shadowColor = "#f39"; g.shadowBlur = 30 * u; g.fillText(String(Math.ceil(-S.t)), W / 2, H * 0.3); g.shadowBlur = 0; }
    // the song's progress
    const dur = c.dur || 1; g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(0, 92 * u, W, 4 * u); g.fillStyle = "#ff3d8b"; g.fillRect(0, 92 * u, W * Math.max(0, Math.min(1, S.t / dur)), 4 * u);
    if (S.done) {
      g.fillStyle = "rgba(6,4,14,.8)"; g.fillRect(0, 0, W, H);
      g.textAlign = "center"; g.fillStyle = "#fff";
      g.font = "900 " + Math.round(180 * u) + "px " + FONT; g.shadowColor = S.grade === "S" ? "#3ff" : "#f39"; g.shadowBlur = 40 * u; g.fillText(S.grade, W / 2, H * 0.36); g.shadowBlur = 0;
      g.font = "800 " + Math.round(36 * u) + "px " + FONT; g.fillText(S.quit ? "Walked off the stage" : ["Legendary. The whole floor will talk about this.", "Great set!", "Solid. Nobody winced.", "Rough, but brave.", "…the room went very quiet."]["SABCD".indexOf(S.grade)], W / 2, H * 0.5);
      g.font = "600 " + Math.round(22 * u) + "px " + FONT; g.fillStyle = "#cfc6ff";
      g.fillText(Math.round(S.score).toLocaleString("en-US") + " pts · " + Math.round(S.pct * 100) + "% · best combo " + S.best + " · " + S.hits + " hits, " + S.misses + " misses", W / 2, H * 0.57);
      g.fillStyle = "rgba(255,255,255,.6)"; g.fillText(pad ? "A to continue" : "Enter to continue", W / 2, H * 0.68);
    }
  }
  console.log("[Karaoke] " + K.version + " · Mic Check");
})();
