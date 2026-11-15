// The soundscape: what Tōkonto sounds like when you are not in a car, and the mixer that sits over all of the game's sound.
//
// Before this file the whole game went through one gain (sound.master) that updateSound held at zero whenever Seiko was on foot, so a
// walk through the busiest city in the game was silent: no traffic, no crowd, no footsteps, no rain, and gunshots and level-crossing
// bells (which also go through sound.master) could not be heard unless he was driving. This file:
//
//   1. The mixer. sound.master (the effects: engines, guns, bells, beeps) and three new buses (ambience, music, the radio) all go to
//      sound.out, which is the master volume. Five settings in Pause > Settings: Master, Effects, Ambience, Music & radio, Voices,
//      kept in gameSet (konto.settings.v1). Cutscene voice (cutvoice.js) and the radio's own element follow them.
//   2. The world bed, every layer synthesised (no downloads, no licences): the city's traffic roar (from how many cars are near),
//      a crowd murmur (from how many people are near), wind (from the weather, and stronger out of town), birds by day away from the
//      towers, insects on warm nights, a horn or a distant siren now and then, an interior's room tone, and the weather's own rain and
//      thunder (Shigoto's Weather.enableAudio, which nothing had switched on).
//   3. Footsteps, on stride: pavement, tile indoors, grass and soil out of town, a splash when the ground is wet.
//   4. Music stingers (original, synthesised): a mission starting, passed, failed; the mission layer (missionflow.js) calls them.
//
// Console: soundscape.status(), soundscape.sting("pass" | "fail" | "start" | "rank").
(function () {
  "use strict";
  if (typeof sound !== "object" || typeof gameSet !== "object") { console.warn("[Soundscape] no sound in this build"); return; }
  const SS = window.soundscape = { version: "1.0.0" };
  const DEF = { volMaster: 0.9, volSfx: 1, volAmb: 0.85, volMusic: 0.8, volVoice: 1 };
  Object.keys(DEF).forEach(k => { if (typeof gameSet[k] !== "number" || !isFinite(gameSet[k])) gameSet[k] = DEF[k]; });
  const vol = k => Math.max(0, Math.min(1, gameSet[k]));
  SS.voiceGain = () => vol("volVoice") * vol("volMaster");
  SS.sfx = () => vol("volSfx");
  const clamp01 = v => Math.max(0, Math.min(1, v));

  // ---- the mixer ---------------------------------------------------------------------------------------------------------------------------
  const bus = { out: null, amb: null, music: null, radio: null };
  function mixer() {
    const ctx = sound.ctx;
    if (!ctx || bus.out) return !!bus.out;
    try {
      bus.out = ctx.createGain(); bus.out.gain.value = vol("volMaster");
      // a gentle limiter on the very end, so a gunshot under a thunderclap does not clip
      const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 6; lim.ratio.value = 8; lim.attack.value = 0.003; lim.release.value = 0.15;
      bus.out.connect(lim); lim.connect(ctx.destination);
      try { sound.master.disconnect(); } catch (e) { /* not connected yet */ }
      sound.master.connect(bus.out);
      bus.amb = ctx.createGain(); bus.amb.gain.value = vol("volAmb"); bus.amb.connect(bus.out);
      bus.music = ctx.createGain(); bus.music.gain.value = vol("volMusic"); bus.music.connect(bus.out);
      bus.radio = ctx.createGain(); bus.radio.gain.value = vol("volMusic"); bus.radio.connect(bus.out);
      sound.out = bus.out; sound.amb = bus.amb; sound.music = bus.music; sound.radioOut = bus.radio;
      try { const W = window.shigoto && shigoto.engine && shigoto.engine.weather; if (W && W.enableAudio && !W.audio) W.enableAudio(ctx, bus.amb); } catch (e) { console.warn("[Soundscape] rain:", e); }
      return true;
    } catch (e) { console.warn("[Soundscape] mixer:", e); bus.out = null; return false; }
  }
  SS.apply = function () {
    const ctx = sound.ctx; if (!ctx || !bus.out) return;
    const t = ctx.currentTime;
    bus.out.gain.setTargetAtTime(vol("volMaster"), t, 0.05);
    bus.amb.gain.setTargetAtTime(vol("volAmb"), t, 0.05);
    bus.music.gain.setTargetAtTime(vol("volMusic"), t, 0.05);
    bus.radio.gain.setTargetAtTime(vol("volMusic"), t, 0.05);
    try { if (typeof radio === "object" && radio.audio && !radio.bus) radio.audio.volume = vol("volMusic") * vol("volMaster"); } catch (e) { /* no radio element */ }
  };

  // ---- noise ---------------------------------------------------------------------------------------------------------------------------------
  let NB = null;
  function noise() {
    if (NB) return NB;
    const ctx = sound.ctx, n = ctx.sampleRate * 3;
    const white = ctx.createBuffer(1, n, ctx.sampleRate), brown = ctx.createBuffer(1, n, ctx.sampleRate), pink = ctx.createBuffer(1, n, ctx.sampleRate);
    const w = white.getChannelData(0), b = brown.getChannelData(0), p = pink.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const r = Math.random() * 2 - 1; w[i] = r;
      last = (last + 0.02 * r) / 1.02; b[i] = last * 3.5;
      b0 = 0.99765 * b0 + r * 0.099046; b1 = 0.963 * b1 + r * 0.2965164; b2 = 0.57 * b2 + r * 1.0526913; p[i] = (b0 + b1 + b2 + r * 0.1848) * 0.11;
    }
    // loop seams: fade the last 50 ms into the first
    [w, b, p].forEach(a => { const f = Math.floor(ctx.sampleRate * 0.05); for (let i = 0; i < f; i++) { const k = i / f; a[n - f + i] = a[n - f + i] * (1 - k) + a[i] * k; } });
    NB = { white, brown, pink };
    return NB;
  }
  function loop(buf, rate) { const s = sound.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random() * 1.5; s.playbackRate.value = rate || 1; s.start(0, Math.random() * 2); return s; }
  function filt(type, f, q) { const x = sound.ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q || 0.7; return x; }
  function gain(v) { const g = sound.ctx.createGain(); g.gain.value = v || 0; return g; }

  // ---- the world bed ---------------------------------------------------------------------------------------------------------------------------
  const L = {};
  function buildBed() {
    const N = noise(), A = bus.amb;
    // the city: a deep roar of tyres and engines, with a band of mid hiss for the road surface
    L.city = gain(); { const s = loop(N.brown), lp = filt("lowpass", 320, 0.5), s2 = loop(N.pink, 0.8), bp = filt("bandpass", 900, 0.4), g2 = gain(0.22);
      s.connect(lp); lp.connect(L.city); s2.connect(bp); bp.connect(g2); g2.connect(L.city); L.cityLP = lp; }
    L.city.connect(A);
    // the crowd: voices are a band from 250 Hz to 2 kHz that comes and goes
    L.crowd = gain(); { const s = loop(N.pink, 1.1), bp = filt("bandpass", 650, 0.9), bp2 = filt("peaking", 1500, 1.2); bp2.gain.value = 5;
      const am = gain(0.6), lfo = sound.ctx.createOscillator(), lg = gain(0.35); lfo.frequency.value = 0.37; lfo.connect(lg); lg.connect(am.gain); lfo.start();
      s.connect(bp); bp.connect(bp2); bp2.connect(am); am.connect(L.crowd); }
    L.crowd.connect(A);
    // wind
    L.wind = gain(); { const s = loop(N.brown, 1.6), bp = filt("bandpass", 420, 0.8); s.connect(bp); bp.connect(L.wind); L.windBP = bp; }
    L.wind.connect(A);
    // insects: a high shimmer, pulsed
    L.bugs = gain(); { const s = loop(N.white), bp = filt("bandpass", 4600, 6), am = gain(0.5), lfo = sound.ctx.createOscillator(), lg = gain(0.5);
      lfo.type = "square"; lfo.frequency.value = 22; lfo.connect(lg); lg.connect(am.gain); lfo.start(); s.connect(bp); bp.connect(am); am.connect(L.bugs); }
    L.bugs.connect(A);
    // a room: the hum of the building and its air
    L.room = gain(); { const o = sound.ctx.createOscillator(), og = gain(0.05); o.frequency.value = 100; o.connect(og); og.connect(L.room); o.start();
      const s = loop(N.pink, 0.6), lp = filt("lowpass", 520, 0.5), sg = gain(0.6); s.connect(lp); lp.connect(sg); sg.connect(L.room); }
    L.room.connect(A);
  }

  // one-shots: a bird, a horn, a siren far off, a footstep
  function chirp(at, pan) {
    const ctx = sound.ctx, t = at || ctx.currentTime, n = 2 + ((Math.random() * 4) | 0), f0 = 2600 + Math.random() * 2400;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null, out = gain(0.05 + Math.random() * 0.05);
    if (p) { p.pan.value = pan; out.connect(p); p.connect(bus.amb); } else out.connect(bus.amb);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = gain(0), s = t + i * (0.09 + Math.random() * 0.07), d = 0.05 + Math.random() * 0.06;
      o.type = "sine"; o.frequency.setValueAtTime(f0 * (0.9 + Math.random() * 0.25), s); o.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 1.35 : 0.72), s + d);
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(1, s + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, s + d);
      o.connect(g); g.connect(out); o.start(s); o.stop(s + d + 0.02);
    }
  }
  function horn(far) {
    const ctx = sound.ctx, t = ctx.currentTime, d = 0.18 + Math.random() * 0.35, out = gain(0), lp = filt("lowpass", far ? 900 : 2200, 0.7);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime((far ? 0.025 : 0.05), t + 0.02); out.gain.setValueAtTime(far ? 0.025 : 0.05, t + d); out.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.06);
    lp.connect(out); out.connect(bus.amb);
    [392, 494].forEach(f => { const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f * (0.96 + Math.random() * 0.08); o.connect(lp); o.start(t); o.stop(t + d + 0.1); });
    if (Math.random() < 0.3) setTimeout(() => { try { horn(far); } catch (e) { /* quiet */ } }, 260);
  }
  function siren() {
    const ctx = sound.ctx, t = ctx.currentTime, dur = 4 + Math.random() * 3, o = ctx.createOscillator(), lp = filt("lowpass", 1100, 0.5), out = gain(0);
    o.type = "triangle";
    for (let k = 0; k < dur / 0.9; k++) { o.frequency.setValueAtTime(770, t + k * 0.9); o.frequency.setValueAtTime(960, t + k * 0.9 + 0.45); }   // Japanese two-tone, pi-po
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.018, t + dur * 0.4); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(out); out.connect(bus.amb); o.start(t); o.stop(t + dur + 0.1);
  }
  const SURF = {
    pave: { f: 1900, q: 1.1, lp: 5200, thud: 0.6, v: 0.16, d: 0.07 },
    tile: { f: 2600, q: 1.6, lp: 7000, thud: 0.4, v: 0.15, d: 0.06 },
    grass: { f: 900, q: 0.6, lp: 2400, thud: 0.3, v: 0.12, d: 0.12 },
    wood: { f: 1200, q: 1.2, lp: 4000, thud: 0.9, v: 0.16, d: 0.08 }
  };
  function step(kind, run, wet) {
    const ctx = sound.ctx, t = ctx.currentTime, S = SURF[kind] || SURF.pave, N = noise();
    const s = ctx.createBufferSource(); s.buffer = N.white; s.playbackRate.value = 0.85 + Math.random() * 0.3;
    const bp = filt("bandpass", S.f * (0.85 + Math.random() * 0.3), S.q), lp = filt("lowpass", S.lp), g = gain(0), v = S.v * (run ? 1.35 : 1) * (0.8 + Math.random() * 0.4);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + S.d * (run ? 0.8 : 1));
    s.connect(bp); bp.connect(lp); lp.connect(g); g.connect(sound.master); s.start(t, Math.random() * 2); s.stop(t + S.d + 0.05);
    // the heel: a soft low knock
    const o = ctx.createOscillator(), og = gain(0); o.type = "sine"; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.05);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(v * S.thud, t + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(og); og.connect(sound.master); o.start(t); o.stop(t + 0.09);
    if (wet > 0.25 && kind !== "tile") {
      const w = ctx.createBufferSource(); w.buffer = N.white; const hp = filt("highpass", 3000), wg = gain(0);
      wg.gain.setValueAtTime(0.0001, t + 0.01); wg.gain.exponentialRampToValueAtTime(0.08 * wet, t + 0.02); wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      w.connect(hp); hp.connect(wg); wg.connect(sound.master); w.start(t, Math.random() * 2); w.stop(t + 0.2);
    }
  }

  // ---- music stingers --------------------------------------------------------------------------------------------------------------------------
  // Short, original, built from a few voices: a brass-like swell (detuned saws through a filter that opens), a bell, a low drum.
  const midi = m => 440 * Math.pow(2, (m - 69) / 12);
  function voice(m, at, dur, v, o) {
    const ctx = sound.ctx; o = o || {};
    const lp = filt("lowpass", o.cut0 || 600, 0.9), g = gain(0);
    lp.frequency.setValueAtTime(o.cut0 || 600, at); lp.frequency.linearRampToValueAtTime(o.cut1 || 2600, at + Math.min(dur, o.open || 0.35));
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(v, at + (o.a || 0.06)); g.gain.setValueAtTime(v, at + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    [-7, 0, 6].forEach(c => { const x = ctx.createOscillator(); x.type = o.wave || "sawtooth"; x.frequency.value = midi(m); x.detune.value = c; x.connect(lp); x.start(at); x.stop(at + dur + 0.05); });
    lp.connect(g); g.connect(bus.music);
  }
  function bell(m, at, v) {
    const ctx = sound.ctx, g = gain(0);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(v, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + 2.2);
    [1, 2.76, 5.4].forEach((r, i) => { const x = ctx.createOscillator(); x.type = "sine"; x.frequency.value = midi(m) * r; const xg = gain(1 / (1 + i * 2)); x.connect(xg); xg.connect(g); x.start(at); x.stop(at + 2.3); });
    g.connect(bus.music);
  }
  function drum(at, v, f) {
    const ctx = sound.ctx, o = ctx.createOscillator(), g = gain(0);
    o.frequency.setValueAtTime(f || 120, at); o.frequency.exponentialRampToValueAtTime((f || 120) * 0.4, at + 0.5);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(v, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
    o.connect(g); g.connect(bus.music); o.start(at); o.stop(at + 1);
  }
  SS.sting = function (kind) {
    if (!sound.ctx || !mixer()) return false;
    const t = sound.ctx.currentTime + 0.05;
    try {
      if (kind === "pass") {          // up a fourth and home: D, G, then a D major add 9 that opens up
        drum(t, 0.5, 90);
        voice(62, t, 0.42, 0.06); voice(66, t, 0.42, 0.05);
        voice(67, t + 0.36, 0.42, 0.06); voice(71, t + 0.36, 0.42, 0.05);
        [50, 62, 66, 69, 76].forEach((m, i) => voice(m, t + 0.74, 2.6, i ? 0.05 : 0.07, { open: 1.2, cut1: 3400 }));
        bell(81, t + 0.76, 0.05); drum(t + 0.74, 0.6, 70);
      } else if (kind === "fail") {   // a falling minor line over a low drone
        drum(t, 0.6, 60);
        [[64, 0], [63, 0.42], [60, 0.84]].forEach(p => voice(p[0], t + p[1], 0.5, 0.05, { cut0: 400, cut1: 1400 }));
        [36, 48, 51].forEach(m => voice(m, t + 0.84, 2.4, 0.05, { cut0: 300, cut1: 900, open: 1.5 }));
      } else if (kind === "start") {  // a low hit and a fifth that rises out of it
        drum(t, 0.55, 75);
        [45, 52, 57].forEach(m => voice(m, t + 0.05, 1.9, 0.045, { cut0: 300, cut1: 2200, open: 1.4, a: 0.5 }));
        bell(76, t + 0.9, 0.035);
      } else if (kind === "rank") {
        [62, 66, 69, 74].forEach((m, i) => bell(m + 12, t + i * 0.14, 0.05)); [50, 57, 62, 66].forEach(m => voice(m, t + 0.5, 2.2, 0.045, { open: 1 }));
      }
      return true;
    } catch (e) { console.warn("[Soundscape] sting:", e); return false; }
  };

  // ---- the tick --------------------------------------------------------------------------------------------------------------------------------
  const st = { lastX: null, lastZ: null, stride: 0, birdT: 3, hornT: 8, sirenT: 40, sampleT: 0, cars: 0, people: 0, built: false };
  function inTown(x, z) {
    for (const c of (world.cities || [])) { const b = c.bounds; if (b && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return c; }
    return null;
  }
  function census(x, z) {
    let cars = 0, people = 0;
    try { for (const c of traffic.cars) { if (!c.live || !c.at) continue; const d = Math.hypot(c.at.x - x, c.at.z - z); if (d < 160) cars += d < 40 ? 1.6 : d < 90 ? 1 : 0.45; } } catch (e) { /* no traffic */ }
    try { for (const p of peds.list) { if (p.state === "dead") continue; const d = Math.hypot(p.x - x, p.z - z); if (d < 40) people += d < 12 ? 1.5 : 1; } } catch (e) { /* no people */ }
    return { cars, people };
  }
  SS.tick = function (dt) {
    if (!sound.ready || !sound.ctx || sound.ctx.state === "closed") return;
    if (!mixer()) return;
    if (!st.built) { try { buildBed(); st.built = true; } catch (e) { console.warn("[Soundscape] bed:", e); st.built = true; return; } }
    const ctx = sound.ctx, now = ctx.currentTime;
    const playing = typeof player === "object" && player.placed && !document.body.classList.contains("titleup");
    const inCar = !!(typeof drive === "object" && (drive.car || drive.train));
    const inside = !!(typeof interior === "object" && interior.active) || !!(typeof shops === "object" && shops.inside) || !!(typeof home === "object" && home.inside);
    const cutting = typeof cut === "object" && cut.active;
    const at = inCar && drive.car ? drive.car.pos : player.pos;
    st.sampleT -= dt;
    if (st.sampleT <= 0) { st.sampleT = 0.5; const c = census(at.x, at.z); st.cars = c.cars; st.people = c.people; st.town = inTown(at.x, at.z); }
    const W = window.shigoto && shigoto.engine && shigoto.engine.weather, wc = W && W.cur ? W.cur : { rain: 0, wind: 2, storm: 0 };
    const lit = typeof nightState === "object" ? clamp01(nightState.lit || 0) : 0;
    const night = lit > 0.5;
    const town = !!st.town, dense = clamp01(st.cars / 14), crowd = clamp01(st.people / 10);
    const mute = !playing || (typeof paused !== "undefined" && paused);
    const k = mute ? 0 : 1, carDamp = inCar ? 0.28 : 1, roomDamp = inside ? 0.18 : 1;
    const set = (g, v, tc) => g.gain.setTargetAtTime(v, now, tc || 0.6);
    set(L.city, k * carDamp * roomDamp * (town ? 0.05 + 0.2 * dense : 0.02 + 0.14 * dense) * (cutting ? 0.6 : 1));
    L.cityLP.frequency.setTargetAtTime(inside ? 180 : 320 + dense * 180, now, 0.5);
    set(L.crowd, k * carDamp * roomDamp * (0.02 + 0.15 * crowd) * (town ? 1 : 0.4) * (night ? 0.7 : 1));
    const windy = clamp01((wc.wind || 2) / 10 + (town ? 0 : 0.25) + (at.y > 40 ? 0.3 : 0) + (wc.storm || 0) * 0.4);
    set(L.wind, k * roomDamp * (inCar ? 0 : 0.03 + 0.14 * windy), 1.2);
    L.windBP.frequency.setTargetAtTime(300 + 500 * windy + Math.sin(now * 0.3) * 120, now, 1.5);
    const warm = !(wc.cold > 0.5);
    set(L.bugs, k * roomDamp * carDamp * (night && warm && (wc.rain || 0) < 0.2 ? (town ? 0.006 : 0.03) * (1 - dense) : 0), 2);
    set(L.room, k * (inside ? 0.05 : 0), 0.4);

    if (!mute && !inside && !inCar) {
      // birds by day, away from the busiest roads
      st.birdT -= dt;
      if (st.birdT <= 0) { st.birdT = 1.5 + Math.random() * (town ? 9 : 4); if (!night && (wc.rain || 0) < 0.3 && Math.random() > dense * 0.8) chirp(0, Math.random() * 1.6 - 0.8); }
    }
    if (!mute && town && !inside) {
      st.hornT -= dt; if (st.hornT <= 0) { st.hornT = 6 + Math.random() * 22 / Math.max(0.2, dense); if (dense > 0.15) horn(Math.random() < 0.6); }
      st.sirenT -= dt; if (st.sirenT <= 0) { st.sirenT = 70 + Math.random() * 140; if (Math.random() < (night ? 0.6 : 0.35)) siren(); }
    }
    // footsteps
    const walking = !mute && !inCar && !cutting && player.mode === "walk" && !(typeof flight === "object" && flight.active) && !(typeof chute === "object" && chute.active);
    if (walking && st.lastX !== null) {
      const d = Math.hypot(player.pos.x - st.lastX, player.pos.z - st.lastZ);
      if (d < 3) {
        const run = Math.abs(player.speed || 0) > 3.6;
        st.stride += d;
        if (st.stride > (run ? 1.05 : 0.74)) {
          st.stride = 0;
          const kind = inside ? (typeof home === "object" && home.inside ? "wood" : "tile") : town ? "pave" : (player.pos.y > 1 ? "grass" : "pave");
          try { step(kind, run, W ? (W.wetness || 0) : 0); } catch (e) { /* quiet */ }
        }
      }
    }
    st.lastX = player.pos.x; st.lastZ = player.pos.z;
  };
  SS.status = () => ({ mixer: !!bus.out, built: st.built, cars: st.cars, people: st.people, town: st.town ? st.town.name : null,
    levels: L.city ? { city: +L.city.gain.value.toFixed(3), crowd: +L.crowd.gain.value.toFixed(3), wind: +L.wind.gain.value.toFixed(3), bugs: +L.bugs.gain.value.toFixed(3), room: +L.room.gain.value.toFixed(3) } : null,
    vol: { master: vol("volMaster"), sfx: vol("volSfx"), amb: vol("volAmb"), music: vol("volMusic"), voice: vol("volVoice") } });

  // ---- wiring -----------------------------------------------------------------------------------------------------------------------------------
  if (typeof window.initAudio === "function") { const was = window.initAudio; window.initAudio = function () { const r = was.apply(this, arguments); try { mixer(); SS.apply(); } catch (e) { /* later */ } return r; }; }
  if (typeof window.updateSound === "function") { const was = window.updateSound; window.updateSound = function (dt) { const r = was.apply(this, arguments); try { SS.tick(dt || 0.016); } catch (e) { console.warn("[Soundscape] tick:", e); } return r; }; }
  // cutscene voices follow the Voices and Master settings
  try { if (window.cutVoice && typeof cutVoice === "object") { const V = cutVoice; const was = V.vol; Object.defineProperty(V, "vol", { get: () => (V._vol === undefined ? was : V._vol) * SS.voiceGain(), set: v => { V._vol = v; }, configurable: true }); } } catch (e) { /* older cutvoice */ }

  // ---- Pause > Settings: the volumes -----------------------------------------------------------------------------------------------------------
  const ROWS = [["mvolmaster", "Master volume", "volMaster"], ["mvolsfx", "Effects volume", "volSfx"], ["mvolamb", "Ambience volume", "volAmb"], ["mvolmusic", "Music & radio volume", "volMusic"], ["mvolvoice", "Voice volume", "volVoice"]];
  function label(r) { const v = Math.round(vol(r[2]) * 100); return r[1] + ": " + (v ? v + "%" : "off"); }
  function addRows() {
    const col = document.getElementById("psettings"); if (!col || document.getElementById("mvolmaster")) return;
    const after = document.getElementById("minvert");
    let ref = after ? after.nextSibling : null;
    ROWS.forEach(r => {
      const b = document.createElement("button"); b.className = "menu-btn"; b.id = r[0]; b.type = "button"; b.textContent = label(r);
      b.addEventListener("click", () => { let v = Math.round(vol(r[2]) * 10) + 1; if (v > 10) v = 0; gameSet[r[2]] = v / 10; try { saveSettings(); } catch (e) { /* not kept */ } b.textContent = label(r); SS.apply(); if (r[2] === "volSfx" || r[2] === "volMaster") try { playBlip(880, 0.06, 0.2); } catch (e) { /* quiet */ } });
      col.insertBefore(b, ref);
    });
    try { const rows = PAUSE_ROWS.settings, i = rows.indexOf("minvert"); rows.splice(i < 0 ? rows.length : i + 1, 0, ...ROWS.map(r => r[0])); } catch (e) { /* no pause table */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addRows); else addRows();

  console.log("[Soundscape] " + SS.version + " · city, crowd, weather, footsteps, stingers, mixer");
})();
