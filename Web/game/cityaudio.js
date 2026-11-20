// ==== THE CITY, HEARD =================================================================================================================
// soundscape.js laid the beds (traffic roar, crowd, wind, birds, rain, footsteps) and the mixer. This puts the city's sound where it
// happens, in 3D, and fills in everything that was missing:
//
//   the listener   follows the camera; every source here is a PannerNode (HRTF up close), with distance roll-off, air absorption
//                  (far sounds lose their top), and a send to a reverb that is the place you are in: a street between towers, open
//                  country, a shop, an office floor, a station hall, a tunnel (impulse responses made here, no files)
//   traffic        the nearest cars each have an engine, pitch from their speed, Doppler from how fast they close on you, tyre roar;
//                  horns from real cars (a jam, a crash, you in the way); the player's horn (H in any car that is not a patrol car)
//   police         sirens on the patrol cars that are after you, a megaphone, officers shouting on foot; a chase score under it
//   your car       tyre squeal when it slides, doors and the starter when you get in and out, wind at speed, rain on the roof
//   trains         rumble and the clack of the joints from every train near you, the station's departure melody and door chime
//   people         a crowd made of real voices (walla), the footsteps of the people around you, what they say (barks.js): greetings,
//                  phone calls, chat, a bump, a near miss, the police; pedestrian crossing signals at the big junctions
//   inside         door chimes, "Irasshaimase", the till, shop music, office keyboards and phones, a station's announcements
//   weapons        each shot rings off the street (echo and tail by place), shell cases, the bullet's impact by what it hits
//   the interface  menus, phone, notifications, objectives, money in and out, the wanted level
//   the mix        dialogue ducks the beds and the music; everything indoors is muffled from the street
//
// Console: cityAudio.status(); ?city-audio=0 turns this file off.
(function () {
  "use strict";
  if (/[?&]city-audio=0\b/.test(location.search)) return;
  if (typeof sound !== "object") return;
  const CA = window.cityAudio = { version: "1.0.0", stats: { engines: 0, sirens: 0, trains: 0, steps: 0, barks: 0, impacts: 0 } };
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const ctx = () => sound.ctx && sound.ctx.state !== "closed" ? sound.ctx : null;
  const sfxOut = () => sound.master;                     // effects bus (soundscape routes it through the master volume)
  const ambOut = () => sound.amb || sound.master;
  const musOut = () => sound.music || sound.master;
  const playing = () => typeof player === "object" && player.placed && !document.body.classList.contains("titleup") && !(typeof paused !== "undefined" && paused);
  const inCar = () => !!(typeof drive === "object" && drive.car);
  const indoors = () => !!(typeof interior === "object" && interior.active) || !!(typeof shops === "object" && shops.inside) || !!(typeof home === "object" && home.inside);
  const me = () => (inCar() ? drive.car.pos : player.pos);

  // ---- noise, shared ---------------------------------------------------------------------------------------------------------------
  let NB = null;
  function noise() {
    const c = ctx(); if (NB && NB.sr === c.sampleRate) return NB;
    const n = c.sampleRate * 2, w = c.createBuffer(1, n, c.sampleRate), b = c.createBuffer(1, n, c.sampleRate);
    const W = w.getChannelData(0), Bd = b.getChannelData(0); let last = 0;
    for (let i = 0; i < n; i++) { const r = Math.random() * 2 - 1; W[i] = r; last = (last + 0.02 * r) / 1.02; Bd[i] = last * 3.5; }
    NB = { sr: c.sampleRate, white: w, brown: b }; return NB;
  }
  function src(buf, loop, rate) { const s = ctx().createBufferSource(); s.buffer = buf; s.loop = !!loop; if (rate) s.playbackRate.value = rate; return s; }
  function filt(type, f, q) { const x = ctx().createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q === undefined ? 0.7 : q; return x; }
  function gain(v) { const g = ctx().createGain(); g.gain.value = v || 0; return g; }
  function env(g, t, peak, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

  // ---- the space: reverb by place ---------------------------------------------------------------------------------------------------
  // An impulse response is decaying noise with a few early reflections, coloured by the room: a street canyon rings bright and long,
  // a shop is short and dry, a station hall is long and dark. Two convolvers crossfade when the place changes.
  const SPACES = {
    street:  { len: 1.6, decay: 2.6, early: [0.019, 0.031, 0.047, 0.071], lp: 6500, wet: 0.16 },
    country: { len: 0.5, decay: 5.0, early: [0.06], lp: 4000, wet: 0.05 },
    shop:    { len: 0.5, decay: 6.0, early: [0.007, 0.013], lp: 7000, wet: 0.1 },
    office:  { len: 0.8, decay: 5.0, early: [0.011, 0.019, 0.029], lp: 6000, wet: 0.12 },
    home:    { len: 0.45, decay: 7.0, early: [0.006, 0.01], lp: 5000, wet: 0.08 },
    hall:    { len: 2.8, decay: 2.0, early: [0.035, 0.052, 0.08, 0.11], lp: 4200, wet: 0.24 },
    tunnel:  { len: 3.2, decay: 1.7, early: [0.012, 0.024, 0.036, 0.048, 0.06], lp: 3000, wet: 0.3 },
    car:     { len: 0.2, decay: 12, early: [0.003], lp: 3500, wet: 0.04 }
  };
  const R = { in: null, a: null, b: null, ga: null, gb: null, cur: null, irs: {}, which: 0 };
  function ir(name) {
    if (R.irs[name]) return R.irs[name];
    const c = ctx(), S = SPACES[name], n = Math.floor(c.sampleRate * S.len), buf = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0; const k = Math.exp(-2 * Math.PI * S.lp / c.sampleRate);
      for (let i = 0; i < n; i++) { const t = i / c.sampleRate, r = Math.random() * 2 - 1; lp = lp * k + r * (1 - k); d[i] = lp * Math.exp(-S.decay * t) * (t < 0.004 ? t / 0.004 : 1); }
      S.early.forEach((e, j) => { const i = Math.floor((e + (ch ? 0.0023 : 0)) * c.sampleRate); if (i < n) d[i] += (0.7 - j * 0.1) * (ch ? 0.9 : 1); });
    }
    return (R.irs[name] = buf);
  }
  function space() {
    const c = ctx(); if (!c) return null;
    if (R.in) return R.in;
    R.in = gain(1); R.a = c.createConvolver(); R.b = c.createConvolver(); R.ga = gain(0); R.gb = gain(0);
    R.in.connect(R.a); R.in.connect(R.b); R.a.connect(R.ga); R.b.connect(R.gb);
    const out = sound.out || c.destination; R.ga.connect(out); R.gb.connect(out);
    // the effects bus feeds it too, so a gunshot rings in the street and is dry in a shop
    R.fx = gain(0.6); try { sound.master.connect(R.fx); R.fx.connect(R.in); } catch (e) { /* later */ }
    setSpace("street");
    return R.in;
  }
  function setSpace(name) {
    if (R.cur === name || !R.in) return;
    const c = ctx(), t = c.currentTime, S = SPACES[name];
    R.which ^= 1;
    const conv = R.which ? R.b : R.a, g = R.which ? R.gb : R.ga, other = R.which ? R.ga : R.gb;
    try { conv.buffer = ir(name); } catch (e) { return; }
    g.gain.setTargetAtTime(S.wet, t, 0.3); other.gain.setTargetAtTime(0, t, 0.3);
    R.cur = name;
  }
  function placeNow() {
    if (inCar()) return "car";
    if (typeof interior === "object" && interior.active) {
      const S = interior.shop || {}, r = interior.room || {};
      if (S.brand === "station" || r.gates || r.platform) return "hall";
      if (S.brand === "soti" || interior.bld) return "office";
      return "shop";
    }
    if (typeof home === "object" && home.inside) return "home";
    if (typeof shops === "object" && shops.inside) return "shop";
    const p = player.pos;
    try { if (typeof world === "object" && world.cities) for (const c of world.cities) { const b = c.bounds; if (b && p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1) return "street"; } } catch (e) { /* no cities */ }
    return "country";
  }
  CA.place = () => R.cur;

  // ---- the listener and positional sources --------------------------------------------------------------------------------------------
  const _f = typeof THREE === "object" ? new THREE.Vector3() : null, _u = typeof THREE === "object" ? new THREE.Vector3() : null;
  function listener() {
    const c = ctx(); if (!c || typeof camera !== "object") return;
    const L = c.listener, p = camera.position;
    camera.getWorldDirection(_f); _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if (L.positionX) {
      const t = c.currentTime, k = 0.02;
      L.positionX.setTargetAtTime(p.x, t, k); L.positionY.setTargetAtTime(p.y, t, k); L.positionZ.setTargetAtTime(p.z, t, k);
      L.forwardX.setTargetAtTime(_f.x, t, k); L.forwardY.setTargetAtTime(_f.y, t, k); L.forwardZ.setTargetAtTime(_f.z, t, k);
      L.upX.setTargetAtTime(_u.x, t, k); L.upY.setTargetAtTime(_u.y, t, k); L.upZ.setTargetAtTime(_u.z, t, k);
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }
  }
  const live = [];          // sources that follow something
  // node -> panner (+ air absorption and the reverb send) -> out. o: { ref, max, voice, follow, out, wet }
  CA.spatial = function (node, at, o) {
    o = o || {};
    const c = ctx(); if (!c) return null;
    const p = c.createPanner();
    p.panningModel = o.cheap ? "equalpower" : "HRTF"; p.distanceModel = "inverse"; p.refDistance = o.ref || 3; p.maxDistance = o.max || 400; p.rolloffFactor = o.roll || 1.1;
    const air = filt("lowpass", 18000, 0.5);
    node.connect(air); air.connect(p);
    const out = o.out || (o.voice && window.VO ? null : sfxOut());
    if (o.voice) { const vb = voiceBus(); p.connect(vb || sound.out || c.destination); } else p.connect(out);
    const send = gain(o.wet === undefined ? 0.35 : o.wet); p.connect(send); const sp = space(); if (sp) send.connect(sp);
    const h = { p: p, air: air, at: { x: at.x, y: at.y, z: at.z }, follow: o.follow || null, born: c.currentTime, life: o.life || 30, voice: !!o.voice };
    setPos(h, at); live.push(h);
    return h;
  };
  function voiceBus() {
    // the dialogue bus voice-all.js made (Voices volume); positional voices land there too
    try { const b = window.VO && VO._bus ? VO._bus() : null; return b; } catch (e) { return null; }
  }
  function setPos(h, at) {
    const c = ctx(), t = c.currentTime, p = h.p;
    if (p.positionX) { p.positionX.setTargetAtTime(at.x, t, 0.03); p.positionY.setTargetAtTime(at.y, t, 0.03); p.positionZ.setTargetAtTime(at.z, t, 0.03); } else p.setPosition(at.x, at.y, at.z);
    // the air takes the top off far sounds; walls and the shop door take more
    const d = typeof camera === "object" ? Math.hypot(at.x - camera.position.x, at.y - camera.position.y, at.z - camera.position.z) : 10;
    const inside = indoors() && !h.inside;
    h.air.frequency.setTargetAtTime(Math.max(500, (inside ? 1400 : 17000) / (1 + d / (inside ? 30 : 120))), t, 0.1);
    h.at.x = at.x; h.at.y = at.y; h.at.z = at.z;
  }
  function follow() {
    const c = ctx(); if (!c) return;
    for (let i = live.length - 1; i >= 0; i--) {
      const h = live[i];
      if (c.currentTime - h.born > h.life) { live.splice(i, 1); continue; }
      const f = h.follow; if (!f) continue;
      const x = f.x !== undefined ? f.x : f.holder ? f.holder.position.x : null; if (x === null) continue;
      const z = f.z !== undefined ? f.z : f.holder.position.z, y = (f.y !== undefined ? f.y : f.holder ? f.holder.position.y : 0) + (h.voice ? 1.55 : 0.5);
      setPos(h, { x: x, y: y, z: z });
    }
  }

  // a one-shot at a place: f(dest node, t) builds the sound into dest
  function shotAt(at, f, o) {
    const c = ctx(); if (!c || !at) return;
    const g = gain(1); f(g, c.currentTime + (o && o.delay || 0));
    CA.spatial(g, at, Object.assign({ cheap: true, life: (o && o.life) || 4 }, o || {}));
  }

  // ---- synth parts ----------------------------------------------------------------------------------------------------------------------
  function hornInto(dest, t, dur, kind) {
    // a car horn: two detuned square tones through a resonant body, a little growl
    const f = kind === "truck" ? [233, 277] : kind === "kei" ? [470, 560] : [392, 494];
    const body = filt("bandpass", f[1] * 2.1, 1.6), lp = filt("lowpass", 3200, 0.7), g = gain(0);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.015); g.gain.setValueAtTime(0.5, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    f.forEach(fr => { const o = ctx().createOscillator(); o.type = "square"; o.frequency.value = fr * rnd(0.98, 1.02); o.connect(body); o.connect(lp); o.start(t); o.stop(t + dur + 0.1); });
    body.connect(g); lp.connect(g); g.connect(dest);
  }
  function clunk(dest, t, v, f) { const o = ctx().createOscillator(), g = gain(0); o.frequency.setValueAtTime(f || 140, t); o.frequency.exponentialRampToValueAtTime((f || 140) * 0.4, t + 0.12); env(g, t, v, 0.003, 0.14); o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.2);
    const n = src(noise().white), bp = filt("bandpass", 1800, 1.2), ng = gain(0); env(ng, t, v * 0.6, 0.002, 0.06); n.connect(bp); bp.connect(ng); ng.connect(dest); n.start(t, Math.random()); n.stop(t + 0.1); }
  function tick(dest, t, v, f, d) { const n = src(noise().white), bp = filt("bandpass", f || 3000, 2.5), g = gain(0); env(g, t, v, 0.001, d || 0.03); n.connect(bp); bp.connect(g); g.connect(dest); n.start(t, Math.random()); n.stop(t + (d || 0.03) + 0.03); }
  function tone(dest, t, f, d, v, type) { const o = ctx().createOscillator(), g = gain(0); o.type = type || "sine"; o.frequency.value = f; env(g, t, v, 0.005, d); o.connect(g); g.connect(dest); o.start(t); o.stop(t + d + 0.05); }
  function bellInto(dest, t, f, v, d) { const g = gain(0); env(g, t, v, 0.004, d || 1.6); [1, 2.76, 5.4, 8.9].forEach((r, i) => { const o = ctx().createOscillator(); o.frequency.value = f * r; const og = gain(1 / (1 + i * 2.2)); o.connect(og); og.connect(g); o.start(t); o.stop(t + (d || 1.6) + 0.1); }); g.connect(dest); }

  // ---- traffic: an engine on each of the nearest cars ---------------------------------------------------------------------------------------
  const ENG = { pool: [], max: 6 };
  function engineVoice() {
    const c = ctx(), out = gain(0), lp = filt("lowpass", 700, 1.0);
    const o1 = c.createOscillator(), o2 = c.createOscillator(), g1 = gain(0.5), g2 = gain(0.25);
    o1.type = "sawtooth"; o2.type = "sawtooth"; o1.connect(g1); o2.connect(g2); g1.connect(lp); g2.connect(lp); o1.start(); o2.start();
    const ns = src(noise().brown, true), nb = filt("bandpass", 500, 0.6), ng = gain(0); ns.connect(nb); nb.connect(ng); ns.start(0, Math.random());
    lp.connect(out); ng.connect(out);
    const h = CA.spatial(out, { x: 0, y: -999, z: 0 }, { cheap: true, ref: 6, roll: 1.25, life: 1e9, wet: 0.25 });
    return { out: out, lp: lp, o1: o1, o2: o2, ng: ng, nb: nb, h: h, car: null, last: null, vr: 0 };
  }
  function trafficTick(dt) {
    const c = ctx(); if (!c || typeof traffic !== "object" || !traffic.cars) return;
    if (!ENG.pool.length) for (let i = 0; i < ENG.max; i++) ENG.pool.push(engineVoice());
    const at = camera.position, list = [];
    const mute = !playing() || indoors();
    if (!mute) {
      for (const car of traffic.cars) { if (!car.live || !car.at || car.dispatch) continue; const d = Math.hypot(car.at.x - at.x, car.at.z - at.z); if (d < 85) list.push([d, car]); }
      try { for (const u of police.units) if (u.live && u.pos) { const d = Math.hypot(u.pos.x - at.x, u.pos.z - at.z); if (d < 120) list.push([d * 0.7, u]); } } catch (e) { /* no police */ }
      list.sort((a, b) => a[0] - b[0]);
    }
    const want = list.slice(0, ENG.max).map(x => x[1]);
    const free = ENG.pool.filter(v => !v.car || want.indexOf(v.car) < 0);
    ENG.pool.forEach(v => { if (v.car && want.indexOf(v.car) < 0) { v.car = null; v.out.gain.setTargetAtTime(0, c.currentTime, 0.15); } });
    want.forEach(car => { if (ENG.pool.some(v => v.car === car)) return; const v = free.shift(); if (v) { v.car = car; v.last = null; } });
    let n = 0;
    const t = c.currentTime;
    for (const v of ENG.pool) {
      const car = v.car; if (!car) continue;
      const p = car.at && car.at.x !== undefined ? car.at : car.pos; if (!p) continue;
      const kind = typeof CAR_KINDS !== "undefined" ? CAR_KINDS[car.kind] || {} : {};
      const speed = Math.abs(car.v || car.speed || 0), top = kind.top || 30;
      // Doppler from how fast it closes on the listener
      const d = Math.hypot(p.x - at.x, p.z - at.z);
      if (v.last !== null && dt > 0) { const vr = (v.last - d) / dt; v.vr += (Math.max(-60, Math.min(60, vr)) - v.vr) * Math.min(1, dt * 6); }
      v.last = d;
      const dop = 343 / (343 - v.vr);
      const body = kind.body || "";
      const base = body === "bike" ? 46 : body === "bus" || body === "truck" ? 21 : body === "kei" || /kei/.test(kind.name || "") ? 38 : 30;
      const rpm = 0.3 + 0.7 * clamp01(speed / top * 1.6 % 1 + speed / top * 0.4);
      const f = base * (0.7 + rpm * 2.2) * dop;
      v.o1.frequency.setTargetAtTime(f, t, 0.08); v.o2.frequency.setTargetAtTime(f * 2.01, t, 0.08);
      v.lp.frequency.setTargetAtTime(300 + rpm * 900, t, 0.1);
      const load = body === "mtb" ? 0 : 0.05 + 0.07 * clamp01(speed / 12);
      v.out.gain.setTargetAtTime(load * (car.dispatch !== undefined || car.busting !== undefined ? 1.2 : 1), t, 0.12);
      v.ng.gain.setTargetAtTime(0.12 * clamp01(speed / 20), t, 0.1); v.nb.frequency.setTargetAtTime(380 + speed * 18, t, 0.1);
      setPos(v.h, { x: p.x, y: (p.y || 0) + 0.6, z: p.z });
      n++;
    }
    CA.stats.engines = n;
    // horns in a jam: a car that has been stopped behind another, now and then
    TR.hornT -= dt;
    if (!mute && TR.hornT <= 0) {
      TR.hornT = rnd(3, 12);
      const stuck = list.filter(x => x[0] < 70 && Math.abs(x[1].v || 0) < 0.5 && x[1].live);
      if (stuck.length > 2 && Math.random() < 0.6) { const car = pick(stuck)[1]; CA.horn(car.at, Math.random() < 0.3 ? 0.9 : 0.25); }
    }
  }
  const TR = { hornT: 6 };
  CA.horn = function (at, dur, kind) { if (!at) return; shotAt({ x: at.x, y: (at.y || 0) + 0.8, z: at.z }, (g, t) => hornInto(g, t, dur || 0.3, kind), { ref: 8 }); };

  // ---- police: sirens on the cars after you, the megaphone, the officers ---------------------------------------------------------------------
  const SIR = { v: [], t: 0, megaT: 8, shoutT: 3 };
  function sirenVoice() {
    const c = ctx(), o = c.createOscillator(), o2 = c.createOscillator(), bp = filt("bandpass", 1300, 1.2), out = gain(0);
    o.type = "sawtooth"; o2.type = "square"; o2.detune.value = 8; o.connect(bp); o2.connect(bp); bp.connect(out); o.start(); o2.start();
    const h = CA.spatial(out, { x: 0, y: -999, z: 0 }, { cheap: true, ref: 14, roll: 0.9, life: 1e9, wet: 0.45 });
    return { o: o, o2: o2, out: out, h: h, u: null, ph: Math.random() };
  }
  function policeTick(dt) {
    const c = ctx(); if (!c || typeof police !== "object") return;
    if (!SIR.v.length) { SIR.v.push(sirenVoice()); SIR.v.push(sirenVoice()); }
    const stars = typeof wanted === "object" ? wanted.stars : 0;
    const at = camera.position, t = c.currentTime;
    const units = stars > 0 && playing() ? police.units.filter(u => u.live && u.pos && !u.leaving).map(u => [Math.hypot(u.pos.x - at.x, u.pos.z - at.z), u]).sort((a, b) => a[0] - b[0]).slice(0, 2).map(x => x[1]) : [];
    SIR.v.forEach((v, i) => {
      v.u = units[i] || null;
      if (!v.u) { v.out.gain.setTargetAtTime(0, t, 0.3); return; }
      // a Japanese patrol car's wail: a long rise and fall, about 1.6 s
      v.ph = (v.ph + dt / 1.6) % 1; const s = 0.5 - 0.5 * Math.cos(v.ph * Math.PI * 2);
      const f = 620 + 680 * s;
      v.o.frequency.setTargetAtTime(f, t, 0.02); v.o2.frequency.setTargetAtTime(f * 1.003, t, 0.02);
      v.out.gain.setTargetAtTime(0.16 * (indoors() ? 0.4 : 1), t, 0.2);
      setPos(v.h, { x: v.u.pos.x, y: v.u.pos.y + 1.6, z: v.u.pos.z });
    });
    CA.stats.sirens = units.length;
    if (!units.length || !playing()) return;
    // the megaphone, from the car behind you
    SIR.megaT -= dt;
    const near = units[0], d = Math.hypot(near.pos.x - at.x, near.pos.z - at.z);
    if (SIR.megaT <= 0 && d < 60 && window.barks) { SIR.megaT = rnd(6, 11); barks.say("cop_chase", { x: near.pos.x, y: near.pos.y + 0.6, z: near.pos.z, female: false, _bv: "~m1" }, { subtitle: d < 30 }); }
    // officers on foot
    SIR.shoutT -= dt;
    if (SIR.shoutT <= 0 && window.barks) {
      SIR.shoutT = rnd(3.5, 7);
      const of = (police.officers || []).filter(o => o && o.x !== undefined && Math.hypot(o.x - at.x, o.z - at.z) < 30)[0];
      if (of) barks.say("cop_stop", { x: of.x, y: of.y || world.surfaceY(of.x, of.z), z: of.z, female: false, _bv: "~m2" });
    }
  }

  // ---- the chase score: under a wanted level, a pulse that grows with the stars -----------------------------------------------------------------
  const MUS = { g: null, nextT: 0, step: 0, stars: 0 };
  function chaseTick() {
    const c = ctx(); if (!c) return;
    const stars = playing() && typeof wanted === "object" ? wanted.stars : 0;
    if (!MUS.g) { MUS.g = gain(0); MUS.g.connect(musOut()); }
    const radioOn = typeof radio === "object" && inCar() && radio.on !== false && radio.st !== undefined && radio.st >= 0 && radio.playing;
    MUS.g.gain.setTargetAtTime(stars > 0 ? (radioOn ? 0.35 : 0.8) : 0, c.currentTime, stars > 0 ? 0.8 : 2.5);
    if (stars !== MUS.stars) { if (stars > MUS.stars && stars > 0) stinger(true); else if (stars === 0 && MUS.stars > 0) stinger(false); MUS.stars = stars; }
    if (stars <= 0 && MUS.g.gain.value < 0.01) return;
    // schedule a 16th-note grid a little ahead: bass on A, a tom, a ticking hat; more parts at more stars
    const bpm = 128 + stars * 6, s16 = 60 / bpm / 4;
    if (MUS.nextT < c.currentTime) MUS.nextT = c.currentTime + 0.05;
    while (MUS.nextT < c.currentTime + 0.25) {
      const t = MUS.nextT, k = MUS.step % 16;
      const bassNotes = [45, 45, 48, 43];
      const bar = Math.floor(MUS.step / 16) % 4;
      if (k % 4 === 0 || (stars >= 2 && k % 4 === 3)) { const o = c.createOscillator(), g = gain(0), lp = filt("lowpass", 380 + stars * 120, 4); o.type = "sawtooth"; o.frequency.value = 440 * Math.pow(2, (bassNotes[bar] - 69) / 12); env(g, t, 0.16, 0.005, s16 * 2.2); o.connect(lp); lp.connect(g); g.connect(MUS.g); o.start(t); o.stop(t + s16 * 2.5); }
      if (k % 2 === 1) tick(MUS.g, t, 0.05 + 0.02 * stars, 8000, 0.025);
      if (k === 4 || k === 12) { const o = c.createOscillator(), g = gain(0); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.2); env(g, t, 0.3, 0.003, 0.22); o.connect(g); g.connect(MUS.g); o.start(t); o.stop(t + 0.3); }
      if (stars >= 3 && (k === 0 || k === 10) && bar % 2 === 0) { const o = c.createOscillator(), g = gain(0); o.type = "square"; o.frequency.value = 440 * Math.pow(2, (69 + (bar ? 3 : 0) - 69) / 12); env(g, t, 0.035, 0.01, s16 * 3); const lp = filt("lowpass", 1800); o.connect(lp); lp.connect(g); g.connect(MUS.g); o.start(t); o.stop(t + s16 * 3.2); }
      MUS.nextT += s16; MUS.step++;
    }
  }
  function stinger(up) {
    const c = ctx(), t = c.currentTime + 0.02, g = gain(0.9); g.connect(musOut());
    if (up) { [57, 60, 64].forEach((m, i) => { const o = c.createOscillator(), og = gain(0); o.type = "sawtooth"; o.frequency.value = 440 * Math.pow(2, (m - 69) / 12); const lp = filt("lowpass", 900); lp.frequency.linearRampToValueAtTime(3000, t + 0.4); env(og, t + i * 0.02, 0.05, 0.02, 0.7); o.connect(lp); lp.connect(og); og.connect(g); o.start(t); o.stop(t + 0.9); }); clunk(g, t, 0.5, 90); }
    else { [64, 69, 72, 76].forEach((m, i) => bellInto(g, t + i * 0.12, 440 * Math.pow(2, (m - 69) / 12), 0.04, 1.4)); }
  }

  // ---- your car: horn, tyres, doors, wind, rain on the roof ----------------------------------------------------------------------------------
  const CAR = { horn: null, squeal: null, wind: null, rain: null, last: null, lastYaw: null, was: null };
  function carBeds() {
    if (CAR.squeal) return;
    const c = ctx();
    CAR.squeal = gain(0); { const n = src(noise().white, true), bp = filt("bandpass", 1600, 9), bp2 = filt("bandpass", 2400, 7); n.connect(bp); n.connect(bp2); bp.connect(CAR.squeal); bp2.connect(CAR.squeal); n.start(0, Math.random()); CAR.squealBP = bp; }
    CAR.squeal.connect(sfxOut());
    CAR.wind = gain(0); { const n = src(noise().brown, true, 1.4), bp = filt("bandpass", 600, 0.5); n.connect(bp); bp.connect(CAR.wind); n.start(0, Math.random()); CAR.windBP = bp; }
    CAR.wind.connect(ambOut());
    CAR.rain = gain(0); { const n = src(noise().white, true), hp = filt("highpass", 1800), am = gain(0.5), lfo = c.createOscillator(), lg = gain(0.5); lfo.type = "square"; lfo.frequency.value = 31; lfo.connect(lg); lg.connect(am.gain); lfo.start(); n.connect(hp); hp.connect(am); am.connect(CAR.rain); n.start(0, Math.random()); }
    CAR.rain.connect(ambOut());
  }
  CA.hornHold = function (on) {
    const c = ctx(); if (!c) return;
    if (on && !CAR.horn && inCar()) {
      const kind = (CAR_KINDS[drive.car.kind] || {}); const g = gain(0); g.connect(sfxOut());
      const f = kind.body === "truck" || kind.body === "bus" ? [233, 277] : kind.body === "bike" ? [520, 610] : /kei/.test(kind.name || "") ? [470, 560] : [392, 494];
      const body = filt("bandpass", f[1] * 2.1, 1.6); const os = f.map(fr => { const o = c.createOscillator(); o.type = "square"; o.frequency.value = fr; o.connect(body); o.start(); return o; });
      body.connect(g); g.gain.setTargetAtTime(0.32, c.currentTime, 0.01);
      CAR.horn = { g: g, os: os };
      // people near the road react
      setTimeout(() => { try { const p = nearestPed(18); if (p && Math.random() < 0.5) barks.say(Math.random() < 0.5 ? "shove" : "near_miss", p); } catch (e) { /* none */ } }, 400);
    } else if (!on && CAR.horn) {
      const h = CAR.horn; CAR.horn = null; h.g.gain.setTargetAtTime(0, c.currentTime, 0.02); setTimeout(() => h.os.forEach(o => { try { o.stop(); } catch (e) { /* stopped */ } }), 200);
    }
  };
  function carTick(dt) {
    const c = ctx(); if (!c) return;
    carBeds();
    const t = c.currentTime, car = inCar() ? drive.car : null;
    // getting in and out: a door, the starter
    if (car !== CAR.was) {
      const p = (car || CAR.wasCar || {}).pos || player.pos;
      if (car && !CAR.was) { const g = gain(0.8); g.connect(sfxOut()); clunk(g, t, 0.45, 120); clunk(g, t + 0.9, 0.5, 110);
        const k = CAR_KINDS[car.kind] || {}; if (k.body !== "mtb" && k.body !== "bike") { const n = src(noise().brown), bp = filt("bandpass", 260, 2), ng = gain(0); for (let i = 0; i < 6; i++) { ng.gain.setValueAtTime(0.0001, t + 1.1 + i * 0.09); ng.gain.exponentialRampToValueAtTime(0.25, t + 1.13 + i * 0.09); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.18 + i * 0.09); } n.connect(bp); bp.connect(ng); ng.connect(g); n.start(t + 1.1); n.stop(t + 1.8); } }
      else if (!car && CAR.was && p) shotAt({ x: p.x, y: (p.y || 0) + 1, z: p.z }, (g, tt) => { clunk(g, tt, 0.5, 120); }, { ref: 4 });
      CAR.wasCar = CAR.was; CAR.was = car; CAR.last = null; CAR.lastYaw = null;
    }
    if (!car || !playing()) { CAR.squeal.gain.setTargetAtTime(0, t, 0.05); CAR.wind.gain.setTargetAtTime(0, t, 0.3); CAR.rain.gain.setTargetAtTime(0, t, 0.3); if (CAR.horn) CA.hornHold(false); return; }
    const kind = CAR_KINDS[car.kind] || {}, two = kind.body === "bike" || kind.body === "mtb";
    // the slide: the car's travel against where it points
    let slip = 0;
    if (CAR.last && dt > 0) {
      const vx = (car.pos.x - CAR.last.x) / dt, vz = (car.pos.z - CAR.last.z) / dt, sp = Math.hypot(vx, vz);
      if (sp > 4) { const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw); const side = Math.abs(vx * fz - vz * fx) / sp; slip = clamp01((side - 0.12) * 3) * clamp01((sp - 4) / 10); }
      const yr = CAR.lastYaw !== null ? Math.abs(Math.atan2(Math.sin(car.yaw - CAR.lastYaw), Math.cos(car.yaw - CAR.lastYaw))) / dt : 0;
      slip = Math.max(slip, clamp01((yr - 0.9) * 0.6) * clamp01((sp - 8) / 12));
      // hard braking
      const a = CAR.lastSp !== undefined ? (CAR.lastSp - sp) / dt : 0; CAR.lastSp = sp;
      if (a > 9 && sp > 6) slip = Math.max(slip, clamp01((a - 9) / 10));
    }
    CAR.last = { x: car.pos.x, z: car.pos.z }; CAR.lastYaw = car.yaw;
    CAR.squeal.gain.setTargetAtTime(two || kind.body === "boat" ? 0 : slip * 0.14, t, 0.05);
    CAR.squealBP.frequency.setTargetAtTime(1300 + slip * 900 + Math.random() * 200, t, 0.05);
    const sp = Math.abs(car.speed || 0);
    CAR.wind.gain.setTargetAtTime(clamp01((sp - 6) / 40) * (two ? 0.35 : 0.12), t, 0.3); CAR.windBP.frequency.setTargetAtTime(400 + sp * 20, t, 0.3);
    const W = window.shigoto && shigoto.engine && shigoto.engine.weather, rain = W && W.cur ? (W.cur.rain || 0) : 0;
    CAR.rain.gain.setTargetAtTime(two ? 0 : rain * 0.07, t, 0.5);
  }

  // ---- trains ---------------------------------------------------------------------------------------------------------------------------------
  const TRN = { v: [], melodyFor: new WeakSet() };
  function trainVoice() {
    const out = gain(0), n = src(noise().brown, true, 0.7), lp = filt("lowpass", 240, 0.7), hum = ctx().createOscillator(), hg = gain(0.12);
    hum.type = "sawtooth"; hum.frequency.value = 52; hum.connect(hg); hg.connect(lp); n.connect(lp); lp.connect(out); n.start(0, Math.random()); hum.start();
    const h = CA.spatial(out, { x: 0, y: -999, z: 0 }, { cheap: true, ref: 14, roll: 0.8, life: 1e9, wet: 0.4 });
    return { out: out, h: h, hum: hum, set: null, clackT: 0, at: null };
  }
  function trainTick(dt) {
    const c = ctx(); if (!c || typeof rail !== "object" || !rail.ready) return;
    if (!TRN.v.length) for (let i = 0; i < 2; i++) TRN.v.push(trainVoice());
    const at = camera.position, t = c.currentTime, riding = typeof drive === "object" && drive.train;
    const cands = [];
    if (playing()) for (const set of rail.sets) {
      if (!set.live || set.line < 0) continue;
      const line = rail.lines[set.line]; if (!line) continue;
      const kind = typeof RAIL_KINDS !== "undefined" ? RAIL_KINDS[set.kind] : null;
      const len = kind ? kind.cars * (kind.L + kind.gap) : 120;
      // the nearest point along the train
      let best = null;
      for (let k = 0; k <= 4; k++) { const s = set.s - len * k / 4; if (!line.loop && s < 0) continue; const p = sampleLane(line, s); const d = Math.hypot(p.x - at.x, p.z - at.z); if (!best || d < best.d) best = { d: d, p: p }; }
      if (best && best.d < 260) cands.push([best.d, set, best.p, kind]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    TRN.v.forEach((v, i) => {
      const cnd = cands[i];
      if (!cnd) { v.out.gain.setTargetAtTime(0, t, 0.4); v.set = null; return; }
      const set = cnd[1], p = cnd[2], sp = Math.abs(set.v || 0), mine = riding && drive.train.set === rail.sets.indexOf(set);
      v.set = set;
      v.out.gain.setTargetAtTime((mine ? 0.18 : 0.42) * clamp01(sp / 14 + 0.08) * (indoors() && !mine ? 0.5 : 1), t, 0.3);
      v.hum.frequency.setTargetAtTime(40 + sp * 3.2, t, 0.3);
      setPos(v.h, { x: p.x, y: p.y + 1, z: p.z });
      // the joints: a double clack per bogie pair, faster with speed
      v.clackT -= dt * sp;
      if (sp > 1.5 && v.clackT <= 0) {
        v.clackT = 25 / 2 * rnd(0.9, 1.1);
        const vol = (mine ? 0.12 : 0.35) * clamp01(sp / 20 + 0.2);
        shotAt({ x: p.x, y: p.y + 0.4, z: p.z }, (g, tt) => { clunk(g, tt, vol, 95); clunk(g, tt + 0.11, vol * 0.85, 90); clunk(g, tt + 0.62 * 18 / Math.max(6, sp), vol * 0.9, 100); clunk(g, tt + 0.62 * 18 / Math.max(6, sp) + 0.11, vol * 0.8, 92); }, { ref: 12, wet: 0.3 });
      }
      // at a platform near you: the departure melody, then the door chime
      if (set.dwell > 0 && cnd[0] < 70 && !TRN.melodyFor.has(set) && set.dwell < 6.5) { TRN.melodyFor.add(set); departure(p); setTimeout(() => TRN.melodyFor.delete(set), 20000); }
    });
    CA.stats.trains = cands.length;
  }
  // an original six-note platform jingle on a soft bell, then "pin-pon" as the doors go
  const MELODIES = [[76, 79, 84, 83, 79, 81], [72, 76, 79, 77, 74, 72], [79, 76, 72, 74, 76, 79], [81, 77, 74, 76, 72, 77]];
  function departure(p) {
    const mel = pick(MELODIES), at = { x: p.x, y: p.y + 4, z: p.z };
    shotAt(at, (g, t) => {
      for (let r = 0; r < 2; r++) mel.forEach((m, i) => bellInto(g, t + r * 1.9 + i * 0.3, 440 * Math.pow(2, (m - 69) / 12), 0.06, 0.9));
      tone(g, t + 4.2, 1318, 0.5, 0.08); tone(g, t + 4.75, 1046, 0.7, 0.08);
    }, { ref: 18, wet: 0.5, life: 8 });
    if (window.VO && Math.random() < 0.8) setTimeout(() => { try { VO.say("", "♪ ドアが閉まります。 Doors closing.", { at: at }); } catch (e) { /* none */ } }, 3800);
  }

  // ---- the crowd: walla made of real voices, and the people around you -------------------------------------------------------------------------------
  const CRW = { walla: null, buf: null, g: null, loading: false, stepT: {}, chatT: 4, bumpT: 0, missT: 0, greetT: 0, signalT: 0 };
  function wallaBed() {
    const c = ctx(); if (CRW.g || CRW.loading) return;
    CRW.loading = true;
    fetch("audio/amb/walla.ogg").then(r => r.ok ? r.arrayBuffer() : null).then(ab => ab ? new Promise(res => c.decodeAudioData(ab, res, () => res(null))) : null).then(buf => {
      if (!buf) return;
      CRW.g = gain(0); const s = src(buf, true); const lp = filt("lowpass", 3800, 0.5); s.connect(lp); lp.connect(CRW.g); CRW.g.connect(ambOut()); s.start(0, Math.random() * buf.duration); CRW.lp = lp;
      // with real voices in, the synth murmur steps back
      if (window.soundscape) soundscape.crowdSynth = 0.35;
    }).catch(() => {});
  }
  function nearestPed(r, filter) {
    if (typeof peds !== "object") return null;
    const at = player.pos; let best = null, bd = r;
    for (const p of peds.list) { if (p.state === "dead" || p.state === "down" || p.state === "scene" && !filter) continue; if (filter && !filter(p)) continue; const d = Math.hypot(p.x - at.x, p.z - at.z); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  CA.nearestPed = nearestPed;
  function stepAt(p, run) {
    const vol = run ? 0.07 : 0.045, at = { x: p.x, y: (p.y || 0) + 0.05, z: p.z };
    shotAt(at, (g, t) => { tick(g, t, vol, rnd(1500, 2600), 0.05); const o = ctx().createOscillator(), og = gain(0); o.frequency.setValueAtTime(100, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.05); env(og, t, vol * 0.5, 0.003, 0.06); o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.09); }, { ref: 2, roll: 1.4, life: 1, wet: 0.2 });
    CA.stats.steps++;
  }
  function crowdTick(dt) {
    const c = ctx(); if (!c) return;
    wallaBed();
    const t = c.currentTime;
    const ok = playing() && typeof peds === "object";
    let people = 0;
    const at = player.pos;
    if (ok) for (const p of peds.list) { if (p.state === "dead") continue; const d = Math.hypot(p.x - at.x, p.z - at.z); if (d < 40) people += d < 12 ? 1.5 : 1; }
    const night = typeof nightState === "object" && nightState.lit > 0.5;
    if (CRW.g) {
      const room = indoors() ? 0.12 : 1, car = inCar() ? 0.25 : 1;
      CRW.g.gain.setTargetAtTime(ok ? clamp01(people / 14) * 0.5 * room * car * (night ? 0.75 : 1) : 0, t, 0.8);
      CRW.lp.frequency.setTargetAtTime(indoors() || inCar() ? 700 : 3800, t, 0.4);
    }
    if (!ok || indoors()) return;
    // footsteps of the nearest walkers
    let n = 0;
    for (const p of peds.list) {
      if (n >= 5) break;
      const d = Math.hypot(p.x - at.x, p.z - at.z); if (d > 11 || p.state === "dead" || p.state === "down") continue;
      const moving = p.moving || p.state === "walk" || p.state === "flee"; if (!moving) continue;
      n++;
      const run = p.state === "flee";
      const k = p._stepT = (p._stepT === undefined ? Math.random() * 0.5 : p._stepT) - dt;
      if (k <= 0) { p._stepT = (run ? 0.3 : 0.52) * rnd(0.92, 1.08); if (!inCar()) stepAt(p, run); }
    }
    if (!window.barks) return;
    // what people say as they go by
    CRW.chatT -= dt;
    if (CRW.chatT <= 0 && !inCar() && !(window.VO && VO.cur)) {
      CRW.chatT = rnd(5, 12) / Math.max(0.5, Math.min(2, people / 8));
      const p = nearestPed(16, q => (q.moving || q.state === "walk" || q.state === "idle" || q.state === "scene") && Math.hypot(q.x - at.x, q.z - at.z) > 2.5);
      if (p) {
        const hr = typeof gameMinutes === "function" ? (gameMinutes() / 60) % 24 : 12;
        const W = window.shigoto && shigoto.engine && shigoto.engine.weather, rain = W && W.cur ? W.cur.rain || 0 : 0;
        const ctxs = ["chat", "phone", "chat", "phone"];
        if (rain > 0.3) ctxs.push("rain", "rain");
        if (hr >= 22 || hr < 3) ctxs.push("drunk", "drunk", "tired");
        if (hr >= 19 && hr < 22) ctxs.push("tired");
        if (hr >= 11 && hr < 21 && Math.random() < 0.25) ctxs.push("vendor", "tourist", "kid");
        const d = Math.hypot(p.x - at.x, p.z - at.z);
        barks.say(pick(ctxs), p, { subtitle: d < 7, gap: 0 });
      }
    }
    // a bump, on foot
    CRW.bumpT -= dt;
    if (CRW.bumpT <= 0 && !inCar() && Math.abs(player.speed || 0) > 2.4) {
      const p = nearestPed(0.85); if (p && p !== CRW.lastBump) { CRW.lastBump = p; CRW.bumpT = 2.5; barks.say(Math.abs(player.speed) > 4.5 ? "shove" : "bump", p, { gap: 0 }); shotAt({ x: p.x, y: (p.y || 0) + 1, z: p.z }, (g, tt) => clunk(g, tt, 0.18, 180), { ref: 2 }); }
    }
    // a near miss in a car
    CRW.missT -= dt;
    if (CRW.missT <= 0 && inCar() && Math.abs(drive.car.speed || 0) > 8) {
      const cp = drive.car.pos; let hit = null;
      for (const p of peds.list) { if (p.state === "dead" || p.state === "down") continue; const d = Math.hypot(p.x - cp.x, p.z - cp.z); if (d < 3.2 && d > 0.6) { hit = p; break; } }
      if (hit) { CRW.missT = 3; barks.say("near_miss", hit, { gap: 0 }); }
    }
    // a greeting when you pass close and slow, now and then
    CRW.greetT -= dt;
    if (CRW.greetT <= 0 && !inCar() && Math.abs(player.speed || 0) < 2.2) {
      const p = nearestPed(2.4, q => q.state === "walk" || q.moving);
      if (p && Math.random() < 0.25) { CRW.greetT = rnd(10, 22); const hr = typeof gameMinutes === "function" ? (gameMinutes() / 60) % 24 : 12; barks.say(hr < 11 ? "greet_morning" : hr < 18 ? "greet_day" : "greet_evening", p); }
      else CRW.greetT = 2;
    }
  }

  // ---- crossings: the signals that sing for the blind at the big junctions ------------------------------------------------------------------
  function signalTick(dt) {
    if (!playing() || indoors() || inCar()) return;
    CRW.signalT -= dt; if (CRW.signalT > 0) return;
    CRW.signalT = 0.5;
    try {
      for (const c of world.cities) {
        const sc = c.scramble; if (!sc) continue;
        const d = Math.hypot(player.pos.x - sc.at[0], player.pos.z - sc.at[1]); if (d > 70) continue;
        // walk phase: the junction's own signal state when it has one, else a 60 s cycle with 20 s of walk
        const walk = typeof sc.walk === "boolean" ? sc.walk : ((typeof clock === "number" ? clock : performance.now() / 1000) % 60) < 20;
        if (!walk) return;
        const at = { x: sc.at[0], y: (sc.groundY || 0) + 3, z: sc.at[1] };
        // "piyo piyo" one way, "kakkō" the other: two little calls, alternating
        const t0 = ctx().currentTime, alt = Math.floor(t0 / 1.5) % 2;
        shotAt(at, (g, t) => {
          if (alt) { [0, 0.18].forEach(o => { const os = ctx().createOscillator(), og = gain(0); os.frequency.setValueAtTime(2900, t + o); os.frequency.exponentialRampToValueAtTime(2100, t + o + 0.12); env(og, t + o, 0.05, 0.005, 0.12); os.connect(og); og.connect(g); os.start(t + o); os.stop(t + o + 0.16); }); }
          else { tone(g, t, 1100, 0.18, 0.05); tone(g, t + 0.26, 880, 0.3, 0.05); }
        }, { ref: 6, wet: 0.4, life: 2 });
        return;
      }
    } catch (e) { /* no junctions */ }
  }

  // ---- inside: doors, the till, shop music, offices, stations ------------------------------------------------------------------------------------
  const IN = { was: null, bed: null, music: null, deskT: 0, phoneT: 6, paT: 20, yen: null, clerkT: 0 };
  function insideBeds() {
    if (IN.bed) return;
    const c = ctx();
    IN.bed = gain(0); IN.bed.connect(ambOut());
    // fridges and lights: a 50 Hz hum and its harmonics, and air
    [50, 100, 150].forEach((f, i) => { const o = c.createOscillator(); o.frequency.value = f; const g = gain(0.02 / (i + 1)); o.connect(g); g.connect(IN.bed); o.start(); });
    const n = src(noise().brown, true, 0.8), lp = filt("lowpass", 900); const ng = gain(0.25); n.connect(lp); lp.connect(ng); ng.connect(IN.bed); n.start(0, Math.random());
    // shop music: a soft original loop (an electric piano on I-vi-IV-V in D), only in shops
    IN.music = gain(0); IN.music.connect(musOut()); IN.musT = 0; IN.musStep = 0;
  }
  function shopMusic() {
    const c = ctx(); if (IN.music.gain.value < 0.005 && IN.musGoal === 0) return;
    if (IN.musT < c.currentTime) IN.musT = c.currentTime + 0.05;
    const prog = [[62, 66, 69], [59, 62, 66], [55, 59, 62], [57, 61, 64]], beat = 60 / 96;
    while (IN.musT < c.currentTime + 0.3) {
      const k = IN.musStep % 16, ch = prog[Math.floor(IN.musStep / 16) % 4], t = IN.musT;
      if (k % 4 === 0) ch.forEach(m => { const o = c.createOscillator(), g = gain(0); o.type = "triangle"; o.frequency.value = 440 * Math.pow(2, (m - 69) / 12); env(g, t, 0.035, 0.01, beat * 3.6); o.connect(g); g.connect(IN.music); o.start(t); o.stop(t + beat * 4); });
      if (k % 2 === 0) { const m = ch[(k / 2) % 3] + 12; const o = c.createOscillator(), g = gain(0); o.frequency.value = 440 * Math.pow(2, (m - 69) / 12); env(g, t, 0.025, 0.005, beat * 0.9); o.connect(g); g.connect(IN.music); o.start(t); o.stop(t + beat); }
      if (k === 0 || k === 8) { const o = c.createOscillator(), g = gain(0); o.frequency.value = 440 * Math.pow(2, (ch[0] - 24 - 69) / 12); env(g, t, 0.06, 0.01, beat * 1.8); o.connect(g); g.connect(IN.music); o.start(t); o.stop(t + beat * 2); }
      IN.musT += beat / 4; IN.musStep++;
    }
  }
  function doorChime() { const g = gain(0.9); g.connect(sfxOut()); const t = ctx().currentTime + 0.05; bellInto(g, t, 1318, 0.05, 0.9); bellInto(g, t + 0.32, 1046, 0.05, 1.2); }
  function till() { const g = gain(0.9); g.connect(sfxOut()); const t = ctx().currentTime; tone(g, t, 2600, 0.07, 0.05, "square"); tone(g, t + 0.1, 2600, 0.07, 0.04, "square"); clunk(g, t + 0.3, 0.12, 300); [0.34, 0.39, 0.45].forEach(o => tick(g, t + o, 0.05, 6000, 0.04)); }
  function insideTick(dt) {
    const c = ctx(); if (!c) return;
    insideBeds();
    const t = c.currentTime;
    const ins = playing() && indoors();
    const kind = ins ? placeNow() : null;
    const S = (typeof interior === "object" && interior.shop) || {};
    const key = ins ? (S.brand || S.name || "in") + "|" + (interior.room ? interior.room.id || "" : "") : null;
    if (key !== IN.was) {
      if (key && interior.active && kind === "shop") {
        doorChime();
        IN.clerkT = 0.7;
      }
      IN.was = key; IN.yen = typeof purse === "object" ? purse.yen : null;
    }
    if (IN.clerkT > 0) { IN.clerkT -= dt; if (IN.clerkT <= 0 && window.barks) { const r = interior.room || {}; barks.say(r.restaurant ? "ramen" : "clerk_hello", { x: player.pos.x - Math.sin(yawOf()) * 5, y: player.pos.y, z: player.pos.z - Math.cos(yawOf()) * 5, female: Math.random() < 0.6 }, { gap: 0 }); } }
    IN.bed.gain.setTargetAtTime(ins ? (kind === "hall" ? 0.5 : 0.8) : 0, t, 0.4);
    IN.musGoal = ins && kind === "shop" && !(S.brand === "arms") ? 0.6 : 0;
    IN.music.gain.setTargetAtTime(IN.musGoal * (window.VO && VO.cur ? 0.5 : 1), t, 0.6);
    shopMusic();
    if (!ins) return;
    // money changing hands in a shop: the till and a thank-you
    if (typeof purse === "object" && IN.yen !== null && purse.yen < IN.yen - 0.5 && kind === "shop") { till(); if (window.barks) setTimeout(() => barks.say("clerk_thanks", { x: player.pos.x - Math.sin(yawOf()) * 3, y: player.pos.y, z: player.pos.z - Math.cos(yawOf()) * 3, female: true }, { gap: 0 }), 700); }
    if (typeof purse === "object") IN.yen = purse.yen;
    // an office floor: keyboards and phones, at the desks
    if (kind === "office") {
      IN.deskT -= dt;
      if (IN.deskT <= 0) { IN.deskT = rnd(0.08, 0.4); const p = player.pos, a = rnd(0, 6.28), r = rnd(3, 12); shotAt({ x: p.x + Math.cos(a) * r, y: p.y + 0.8, z: p.z + Math.sin(a) * r }, (g, tt) => { for (let i = 0; i < 1 + (Math.random() * 4 | 0); i++) tick(g, tt + i * rnd(0.07, 0.13), 0.04, rnd(2500, 4200), 0.02); }, { ref: 2, life: 1.2, wet: 0.3 }); }
      IN.phoneT -= dt;
      if (IN.phoneT <= 0) { IN.phoneT = rnd(9, 25); const p = player.pos, a = rnd(0, 6.28), r = rnd(6, 16); shotAt({ x: p.x + Math.cos(a) * r, y: p.y + 0.9, z: p.z + Math.sin(a) * r }, (g, tt) => { for (let k = 0; k < 2; k++) for (let i = 0; i < 10; i++) { tone(g, tt + k * 1.4 + i * 0.05, i % 2 ? 1400 : 1100, 0.04, 0.025, "square"); } }, { ref: 3, life: 4, wet: 0.35 }); }
    }
    // a station hall: announcements now and then
    if (kind === "hall") {
      IN.paT -= dt;
      if (IN.paT <= 0 && window.barks && window.VO) { IN.paT = rnd(25, 45); const p = player.pos; barks.say("station", { x: p.x + rnd(-8, 8), y: p.y + 4, z: p.z + rnd(-8, 8), female: true }, { gap: 0, subtitle: false }); }
    }
  }
  const yawOf = () => typeof yaw === "number" ? yaw : 0;

  // ---- weapons: the street answers a shot; cases; impacts ----------------------------------------------------------------------------------------
  function hookGuns() {
    if (typeof window.gunSound === "function" && !window.gunSound._ca) {
      const orig = window.gunSound;
      const w = function (G) {
        const r = orig.apply(this, arguments);
        try {
          const c = ctx(); if (!c) return r;
          const t = c.currentTime, pl = R.cur || "street";
          // a slap off the buildings, a rolling tail, the case on the ground
          const g = gain(1); g.connect(sfxOut());
          if (pl === "street" || pl === "hall" || pl === "tunnel") {
            [0.09, 0.17, 0.29].forEach((d, i) => { const n = src(noise().white), bp = filt("bandpass", (G.tone || 900) * 0.8, 0.7), lp = filt("lowpass", 2400 - i * 500), ng = gain(0); env(ng, t + d, (G.vol || 0.5) * (0.28 - i * 0.07), 0.003, 0.18 + i * 0.08); n.connect(bp); bp.connect(lp); lp.connect(ng); ng.connect(g); n.start(t + d, Math.random()); n.stop(t + d + 0.5); });
          }
          const thump = c.createOscillator(), tg = gain(0); thump.frequency.setValueAtTime(70, t); thump.frequency.exponentialRampToValueAtTime(32, t + 0.4); env(tg, t, (G.vol || 0.5) * 0.5, 0.004, 0.45); thump.connect(tg); tg.connect(g); thump.start(t); thump.stop(t + 0.5);
          if ((G.pellets || 1) < 4 || Math.random() < 0.5) { const ct = t + rnd(0.35, 0.6); [0, 0.07, 0.16].forEach((o, i) => tone(g, ct + o, rnd(3800, 5200), 0.06, 0.03 / (i + 1), "triangle")); }
        } catch (e) { /* quiet */ }
        return r;
      };
      w._ca = true; window.gunSound = w; try { gunSound = w; } catch (e) { /* window */ }
    }
    if (typeof window.gunTrace === "function" && !window.gunTrace._ca) {
      const orig = window.gunTrace;
      const w = function () {
        const hit = orig.apply(this, arguments);
        try { if (hit && hit.p && hit.kind !== "air") impact(hit); } catch (e) { /* quiet */ }
        return hit;
      };
      w._ca = true; window.gunTrace = w; try { gunTrace = w; } catch (e) { /* window */ }
    }
  }
  let impactN = 0, impactAt = 0;
  function impact(hit) {
    const c = ctx(); if (!c) return;
    if (c.currentTime - impactAt > 0.05) { impactN = 0; impactAt = c.currentTime; }
    if (++impactN > 3) return;          // a shotgun's pellets: a few impacts, not nine
    CA.stats.impacts++;
    const at = { x: hit.p.x, y: hit.p.y, z: hit.p.z }, d = (hit.t || 10) / 340;
    shotAt(at, (g, t) => {
      if (hit.kind === "wall" || hit.kind === "ground") {
        tick(g, t, 0.3, hit.kind === "wall" ? 3200 : 1200, 0.05); clunk(g, t, 0.15, hit.kind === "wall" ? 300 : 160);
        if (hit.kind === "wall" && Math.random() < 0.35) { const o = c.createOscillator(), og = gain(0); o.frequency.setValueAtTime(rnd(2400, 3400), t + 0.02); o.frequency.exponentialRampToValueAtTime(rnd(700, 1100), t + 0.4); env(og, t + 0.02, 0.06, 0.004, 0.38); o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.5); }
      } else if (hit.kind === "car") { bellInto(g, t, rnd(600, 900), 0.12, 0.35); tick(g, t, 0.2, 4500, 0.04); if (Math.random() < 0.3) for (let i = 0; i < 6; i++) tone(g, t + 0.03 + Math.random() * 0.3, rnd(3000, 7000), 0.05, 0.04, "triangle"); }
      else { clunk(g, t, 0.35, 90); }
    }, { delay: d, ref: 4, life: 2, wet: 0.4 });
  }
  // a crash: the other driver leans on the horn and has something to say
  function hookCrash() {
    if (typeof window.playCrash !== "function" || window.playCrash._ca) return;
    const orig = window.playCrash;
    const w = function (impactV) {
      const r = orig.apply(this, arguments);
      try {
        if (!inCar() || impactV < 3) return r;
        const p = drive.car.pos; let other = null, bd = 9;
        for (const car of traffic.cars) { if (!car.live || !car.at) continue; const d = Math.hypot(car.at.x - p.x, car.at.z - p.z); if (d < bd) { bd = d; other = car; } }
        if (other) { setTimeout(() => CA.horn(other.at, rnd(0.7, 1.4)), rnd(300, 900)); if (window.barks) setTimeout(() => barks.say("driver_angry", { x: other.at.x, y: other.at.y, z: other.at.z, female: Math.random() < 0.3 }, { gap: 0 }), 1400); }
        const witness = nearestPed(25); if (witness && window.barks && impactV > 6) setTimeout(() => barks.say("witness", witness, { gap: 0 }), 1900);
      } catch (e) { /* quiet */ }
      return r;
    };
    w._ca = true; window.playCrash = w; try { playCrash = w; } catch (e) { /* window */ }
  }

  // ---- the interface ---------------------------------------------------------------------------------------------------------------------------
  const UI = { yen: null, menuSel: -1, obj: "" };
  function ui(kind) {
    const c = ctx(); if (!c) return;
    const g = gain(0.7); g.connect(sfxOut()); const t = c.currentTime;
    if (kind === "move") tick(g, t, 0.06, 5200, 0.015);
    else if (kind === "open") { tone(g, t, 660, 0.08, 0.04); tone(g, t + 0.06, 990, 0.12, 0.04); }
    else if (kind === "pick") { tone(g, t, 880, 0.06, 0.05); tone(g, t + 0.05, 1320, 0.1, 0.045); }
    else if (kind === "back") { tone(g, t, 760, 0.06, 0.04); tone(g, t + 0.05, 520, 0.1, 0.04); }
    else if (kind === "phoneUp") { const n = src(noise().white), bp = filt("bandpass", 2000, 0.8), ng = gain(0); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.05, t + 0.08); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); n.connect(bp); bp.connect(ng); ng.connect(g); n.start(t, Math.random()); n.stop(t + 0.2); tone(g, t + 0.12, 1568, 0.08, 0.03); }
    else if (kind === "phoneDown") { const n = src(noise().white), bp = filt("bandpass", 1200, 0.8), ng = gain(0); env(ng, t, 0.04, 0.05, 0.12); n.connect(bp); bp.connect(ng); ng.connect(g); n.start(t, Math.random()); n.stop(t + 0.2); }
    else if (kind === "notify") { tone(g, t, 1760, 0.09, 0.045); tone(g, t + 0.11, 2349, 0.18, 0.04); }
    else if (kind === "objective") { bellInto(g, t, 784, 0.035, 0.9); bellInto(g, t + 0.14, 1175, 0.03, 1.1); }
    else if (kind === "cash") { [0, 0.05, 0.11, 0.18].forEach((o, i) => tone(g, t + o, 3000 + i * 400, 0.06, 0.025, "triangle")); bellInto(g, t + 0.2, 2093, 0.03, 0.6); }
    else if (kind === "spend") { [0, 0.06].forEach(o => tone(g, t + o, 2400, 0.05, 0.02, "triangle")); }
  }
  CA.ui = ui;
  function hookUI() {
    const C = window.career;
    if (C && C.menu && !C.menu._caui) {
      const orig = C.menu; const w = function (o) { try { ui("open"); } catch (e) { /* quiet */ } return orig.apply(this, arguments); }; Object.assign(w, orig); w._caui = true; w._vo = orig._vo; C.menu = w;
    }
    if (typeof window.setPhone === "function" && !window.setPhone._ca) {
      const orig = window.setPhone; const w = function (on) { const was = typeof phone === "object" && phone.open; const r = orig.apply(this, arguments); try { if (!!on !== !!was) ui(on ? "phoneUp" : "phoneDown"); } catch (e) { /* quiet */ } return r; };
      w._ca = true; window.setPhone = w; try { setPhone = w; } catch (e) { /* window */ }
    }
    if (typeof window.notify === "function" && !window.notify._ca) {
      const orig = window.notify; const w = function () { const r = orig.apply(this, arguments); try { ui("notify"); } catch (e) { /* quiet */ } return r; };
      w._ca = true; window.notify = w; try { notify = w; } catch (e) { /* window */ }
    }
    if (typeof window.storyObjective === "function" && !window.storyObjective._ca) {
      const orig = window.storyObjective; const w = function (text) { const r = orig.apply(this, arguments); try { if (text && text !== UI.obj) { UI.obj = text; ui("objective"); } } catch (e) { /* quiet */ } return r; };
      w._ca = true; window.storyObjective = w; try { storyObjective = w; } catch (e) { /* window */ }
    }
  }
  function uiTick() {
    // the career menu's selection moving
    try { const M = window.career && career.menuState; if (M && M.on) { if (UI.menuSel !== M.sel && UI.menuSel >= 0) ui("move"); UI.menuSel = M.sel; } else UI.menuSel = -1; } catch (e) { /* none */ }
    // money: in, a cash flourish; out in the street (a fine, a fare), a small tick
    if (typeof purse === "object") {
      if (UI.yen !== null && playing()) { const d = purse.yen - UI.yen; if (d >= 500) ui("cash"); else if (d <= -100 && !indoors()) ui("spend"); }
      UI.yen = purse.yen;
    }
  }
  // H in a car that is not a patrol car is the horn, held for as long as the key is
  window.addEventListener("keydown", e => { if (e.code === "KeyH" && !e.repeat && inCar() && (CAR_KINDS[drive.car.kind] || {}).livery !== "police") { try { if (sound.ctx) CA.hornHold(true); } catch (er) { /* quiet */ } } }, true);
  window.addEventListener("keyup", e => { if (e.code === "KeyH") try { CA.hornHold(false); } catch (er) { /* quiet */ } }, true);

  // ---- boats: the water against the hull, gulls on the coast ------------------------------------------------------------------------------------
  const SEA = { g: null, gullT: 5 };
  function seaTick(dt) {
    const c = ctx(); if (!c) return;
    if (!SEA.g) { SEA.g = gain(0); const n = src(noise().brown, true, 1.2), lp = filt("lowpass", 600, 0.8), am = gain(0.6), lfo = c.createOscillator(), lg = gain(0.4); lfo.frequency.value = 0.18; lfo.connect(lg); lg.connect(am.gain); lfo.start(); n.connect(lp); lp.connect(am); am.connect(SEA.g); n.start(0, Math.random()); SEA.g.connect(ambOut()); }
    // near the water: on a boat, or on the shore (the ground at sea level)
    const p = me(); let wet = 0;
    try {
      const B = window.boating;
      if (B && B.telemetry && B.telemetry()) wet = 1;
      else if (B && B.piers && !indoors()) { SEA.piersT = (SEA.piersT || 0) - dt; if (SEA.piersT <= 0) { SEA.piersT = 2; SEA.near = 1e9; B.piers().forEach(q => { SEA.near = Math.min(SEA.near, Math.hypot(q.at[0] - p.x, q.at[1] - p.z)); }); } wet = clamp01((140 - SEA.near) / 100) * 0.8; }
    } catch (e) { /* no sea */ }
    SEA.g.gain.setTargetAtTime(playing() ? wet * 0.22 : 0, c.currentTime, 1.2);
    SEA.gullT -= dt;
    if (wet > 0.3 && SEA.gullT <= 0 && playing()) {
      SEA.gullT = rnd(6, 16);
      const a = rnd(0, 6.28), r = rnd(15, 50);
      shotAt({ x: p.x + Math.cos(a) * r, y: (p.y || 0) + 18, z: p.z + Math.sin(a) * r }, (g, t) => { for (let i = 0; i < 2 + (Math.random() * 3 | 0); i++) { const o = c.createOscillator(), og = gain(0), s = t + i * 0.28; o.type = "sawtooth"; o.frequency.setValueAtTime(1500, s); o.frequency.exponentialRampToValueAtTime(900, s + 0.22); const bp = filt("bandpass", 1800, 3); env(og, s, 0.05, 0.02, 0.22); o.connect(bp); bp.connect(og); og.connect(g); o.start(s); o.stop(s + 0.3); } }, { ref: 10, life: 3, wet: 0.2 });
    }
  }

  // ---- the mix: dialogue ducks the beds and the music ----------------------------------------------------------------------------------------------
  const DUCK = { v: 1 };
  function duckTick() {
    const c = ctx(); if (!c) return;
    const talking = (window.VO && VO.cur && !VO.cur.o.radio) || (window.cutVoice && cutVoice.playing && cutVoice.playing());
    DUCK.v += ((talking ? 0.55 : 1) - DUCK.v) * 0.08;
    if (window.soundscape) soundscape.duck = DUCK.v;
  }

  // ---- the tick ------------------------------------------------------------------------------------------------------------------------------------
  CA.tick = function (dt) {
    const c = ctx(); if (!c || !sound.ready) return;
    if (!space()) return;
    hookGuns(); hookCrash(); hookUI();
    setSpace(placeNow());
    listener(); follow();
    const step = (name, f) => { try { f(dt); } catch (e) { if (!CA["_w" + name]) { CA["_w" + name] = true; console.warn("[CityAudio] " + name + ":", e); } } };
    step("traffic", trafficTick); step("police", policeTick); step("chase", chaseTick); step("car", carTick); step("train", trainTick);
    step("crowd", crowdTick); step("signal", signalTick); step("inside", insideTick); step("sea", seaTick); step("ui", uiTick); step("duck", duckTick);
  };
  if (typeof window.updateSound === "function") {
    const was = window.updateSound;
    window.updateSound = function (dt) { const r = was.apply(this, arguments); try { CA.tick(dt || 0.016); } catch (e) { console.warn("[CityAudio] tick:", e); } return r; };
  }
  CA.status = () => ({ place: R.cur, sources: live.length, stats: CA.stats, walla: !!CRW.g, duck: +DUCK.v.toFixed(2), chase: MUS.stars, engines: ENG.pool.filter(v => v.car).length });
  console.log("[CityAudio] " + CA.version + " · 3D traffic, sirens, trains, crowds, interiors, weapons, UI, reverb by place");
})();
