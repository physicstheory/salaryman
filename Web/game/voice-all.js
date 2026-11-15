// ==== EVERY LINE SPOKEN ============================================================================================================
// Cutscenes already had voices (cutvoice.js). This gives a voice to everything else anyone says: conversations and their answers
// (Seiko says the answer you pick), floor incidents, the Care Desk callers (down a phone line), phone calls, after-hours talk, the boss's
// office, quoted speech in notices ("Gondō: “…”"), the radio hosts, and the street: passers-by, shop and station staff, drivers, police
// (barks.js), each from where they stand.
//
// Recordings are Kokoro TTS clips from Tools/voice/build_voices.py (Web/audio/voice/index.json, shared with cutvoice.js). A line is found
// by speaker and text; a line glued together at run time ("…at " + bar + " under " + station) is stitched from its recorded pieces and
// the names bank; a line with no recording at all falls back to the system's speech voice of the right sex, so nothing is ever silent.
//
//   VO.say(speaker, text, { phone, radio, at, who, lips })  queue a line of dialogue (one at a time, in order)
//   VO.bark(who, text, { ctx })                             a line from someone in the world, positional, several at once
//   VO.stop() · VO.status() · VO.misses (what had no recording, for the build) · VO.fallbackTTS (default on)
//   ?vo=0 switches all of this off (cutscenes keep their voices)
(function () {
  "use strict";
  if (/[?&]vo=0\b/.test(location.search)) { console.log("[VO] off (?vo=0)"); return; }
  const VO = window.VO = { version: "1.0.0", man: null, sex: {}, queue: [], cur: null, barks: [], misses: [], fallbackTTS: true, stats: { said: 0, stitched: 0, tts: 0, barks: 0 } };
  const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\*[^*]{1,24}\*/g, "").replace(/\([^)]{0,90}\)/g, "").replace(/[^a-z0-9]+/g, "");
  const byNorm = new Map(), pieces = new Map(), names = new Map();
  // the speaker's name as the index knows it: "📞 Nakano Yui" -> "Nakano", "Gondō Tetsuo" -> "Gondō"
  const ALIAS = {};
  function speakerKey(s) {
    if (!s) return "?";
    s = String(s).replace(/^[^\wŌŪ"]+/u, "").replace(/<[^>]+>/g, "").trim();
    if (ALIAS[s]) return ALIAS[s];
    if (VO.sex[s] !== undefined) return s;
    const first = s.split(/[ ,]/)[0];
    if (VO.sex[first] !== undefined) return first;
    const last = s.split(" ").pop();
    if (VO.sex[last] !== undefined) return last;
    return s;
  }
  VO.ready = fetch("audio/voice/index.json").then(r => r.ok ? r.json() : null).catch(() => null)
    .then(m => {
      if (!m || !m.lines) { console.warn("[VO] no voice index"); return null; }
      VO.man = m.lines; VO.sex = m.sex || {};
      for (const k in m.lines) {
        const bar = k.indexOf("|"), spk = k.slice(0, bar), rest = k.slice(bar + 1);
        if (rest.startsWith("piece|")) { const t = rest.slice(6); (pieces.get(spk) || pieces.set(spk, []).get(spk)).push({ t: t, n: norm(t), e: m.lines[k] }); continue; }
        if (rest.startsWith("name|")) { names.set(spk + "|" + norm(rest.slice(5)), m.lines[k]); continue; }
        const n = norm(rest); if (!n) continue;
        const list = byNorm.get(n) || byNorm.set(n, []).get(n); list.push({ spk: spk, e: m.lines[k] });
      }
      pieces.forEach(a => a.sort((x, y) => y.n.length - x.n.length));
      // after-hours people by their full names
      try { const P = window.afterhours && afterhours.people; if (P) for (const k in P) ALIAS[P[k].name] = P[k].short; } catch (e) { /* none */ }
      try { (career.office.staff || []).forEach(s => { ALIAS[s.name] = s.name.split(" ")[0]; }); ALIAS["Gondō Tetsuo"] = "Gondō"; } catch (e) { /* none */ }
      ALIAS["Akio Sotiyama"] = "Akio"; ALIAS["Sotiyama Akio"] = "Akio"; ALIAS["Reiko Sotiyama"] = "Reiko"; ALIAS["Sotiyama Reiko"] = "Reiko";
      console.log("[VO] " + byNorm.size + " lines, " + [...pieces.values()].reduce((n, a) => n + a.length, 0) + " pieces, " + names.size + " names");
      return VO.man;
    });

  // ---- finding a recording ------------------------------------------------------------------------------------------------------------
  function sexOf(spk, hint) {
    if (hint === "f" || hint === "m") return hint;
    const s = VO.sex[spk]; return s || null;
  }
  // -> { list: [entry, ...] } (one clip, or the pieces of a stitched line) or null
  VO.find = function (spk, text, sexHint) {
    if (!VO.man) return null;
    const k = speakerKey(spk), n = norm(text); if (!n) return null;
    const exact = VO.man[k + "|" + text];
    if (exact) return { list: [exact], spk: k };
    const hits = byNorm.get(n);
    if (hits && hits.length) {
      const sx = sexOf(k, sexHint);
      const mine = hits.find(h => h.spk === k) || (sx && hits.find(h => h.spk === "?" + sx)) || hits.find(h => h.spk === "?m" || h.spk === "?f") ||
        (sx && hits.find(h => h.spk.startsWith("~" + sx))) || hits.find(h => sexOf(h.spk) === sx) || hits[0];
      return { list: [mine.e], spk: mine.spk };
    }
    // stitched: the speaker's pieces (or anyone's of the right sex), with names between them
    const sx = sexOf(k, sexHint);
    const pool = pieces.get(k) || (sx && pieces.get("?" + sx)) || null;
    if (!pool) return null;
    const out = []; let i = 0, got = 0;
    while (i < n.length) {
      const p = pool.find(q => q.n.length >= 3 && n.startsWith(q.n, i));
      if (p) { out.push(p.e); i += p.n.length; got += p.n.length; continue; }
      // a gap: the longest name the speaker has recorded that fits here, else skip to the next piece
      let j = i + 1, nm = null, nmEnd = i;
      for (; j <= n.length; j++) { const e = names.get(k + "|" + n.slice(i, j)) || names.get("?" + (sx || "m") + "|" + n.slice(i, j)); if (e) { nm = e; nmEnd = j; } }
      if (nm) { out.push(nm); i = nmEnd; continue; }
      let next = -1; for (const q of pool) { const at = n.indexOf(q.n, i + 1); if (at > 0 && (next < 0 || at < next)) next = at; }
      out.push({ gap: n.slice(i, next < 0 ? n.length : next) });
      i = next < 0 ? n.length : next;
    }
    if (got < n.length * 0.5) return null;
    return { list: out, spk: k, stitched: true };
  };

  // a recording of exactly this speaker saying this (no stand-ins)
  VO.has = (spk, text) => { if (!VO.man) return false; const k = speakerKey(spk); if (VO.man[k + "|" + text]) return true; const h = byNorm.get(norm(text)); return !!(h && h.some(x => x.spk === k)); };

  // ---- the voice bus -------------------------------------------------------------------------------------------------------------------
  const A = { bus: null, phone: null, radio: null, bufs: new Map(), loading: new Map() };
  function ctx() { return typeof sound === "object" && sound.ctx && sound.ctx.state !== "closed" ? sound.ctx : null; }
  function gainV() { return window.soundscape && soundscape.voiceGain ? soundscape.voiceGain() / Math.max(0.05, (gameSet && gameSet.volMaster) || 1) : 1; }
  function bus() {
    const c = ctx(); if (!c) return null;
    if (A.bus) return A.bus;
    A.bus = c.createGain(); A.bus.gain.value = gainV();
    (sound.out || c.destination) && A.bus.connect(sound.out || c.destination);
    // a phone line: 300 Hz to 3.4 kHz, a little crunch; the radio: a warmer band and a touch of compression
    const mk = (lo, hi, drive) => { const h = c.createBiquadFilter(); h.type = "highpass"; h.frequency.value = lo; const l = c.createBiquadFilter(); l.type = "lowpass"; l.frequency.value = hi;
      const sh = c.createWaveShaper(); const cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cv[i] = Math.tanh(x * drive) / Math.tanh(drive); } sh.curve = cv;
      h.connect(l); l.connect(sh); sh.connect(A.bus); return h; };
    A.phone = mk(320, 3300, 2.2); A.radio = mk(120, 6500, 1.3);
    return A.bus;
  }
  VO._bus = bus;
  function load(src) {
    if (A.bufs.has(src)) return Promise.resolve(A.bufs.get(src));
    if (A.loading.has(src)) return A.loading.get(src);
    const c = ctx(); if (!c) return Promise.resolve(null);
    const p = fetch(src).then(r => r.ok ? r.arrayBuffer() : null).then(ab => ab ? new Promise((res) => c.decodeAudioData(ab, res, () => res(null))) : null)
      .then(b => { A.loading.delete(src); if (b) { A.bufs.set(src, b); if (A.bufs.size > 160) A.bufs.delete(A.bufs.keys().next().value); } return b; }).catch(() => { A.loading.delete(src); return null; });
    A.loading.set(src, p); return p;
  }
  VO.preload = (spk, text) => { const f = VO.find(spk, text); if (f) f.list.forEach(e => e.src && load(e.src)); };

  // ---- system speech for anything with no recording -------------------------------------------------------------------------------------
  const tts = { voices: null };
  function ttsVoice(sx) {
    const ss = window.speechSynthesis; if (!ss) return null;
    if (!tts.voices || !tts.voices.length) tts.voices = (ss.getVoices() || []).filter(v => /^en/i.test(v.lang));
    const F = /zira|hazel|susan|aria|jenny|sonia|libby|samantha|karen|female|emma|amy|natasha|clara|mia|olivia|ava/i;
    const pool = tts.voices.filter(v => sx === "f" ? F.test(v.name) : !F.test(v.name));
    return (pool.length ? pool : tts.voices)[0] || null;
  }
  function speakTTS(text, sx, onEnd) {
    const ss = window.speechSynthesis;
    if (!VO.fallbackTTS || !ss || typeof SpeechSynthesisUtterance === "undefined") { onEnd && setTimeout(onEnd, Math.min(6000, 600 + text.length * 55)); return false; }
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/[“”*]/g, "").replace(/\([^)]*\)/g, ""));
      const v = ttsVoice(sx); if (v) { u.voice = v; u.lang = v.lang; }
      u.pitch = sx === "f" ? 1.08 : 0.92; u.rate = 1.0; u.volume = Math.min(1, 0.9 * gainV());
      let done = false; const fin = () => { if (!done) { done = true; onEnd && onEnd(); } };
      u.onend = fin; u.onerror = fin; setTimeout(fin, 1500 + text.length * 90);
      ss.speak(u); VO.stats.tts++; return true;
    } catch (e) { onEnd && onEnd(); return false; }
  }

  // ---- dialogue: one line at a time --------------------------------------------------------------------------------------------------------
  function missed(spk, text, why) {
    if (VO.misses.length < 400 && !VO.misses.some(m => m.text === text)) VO.misses.push({ spk: spk, text: text, why: why });
  }
  VO.say = function (spk, text, o) {
    o = o || {};
    text = String(text || "").trim(); if (!text || !/[a-z]{2}/i.test(text)) return false;
    if (window.cutVoice && cutVoice.playing && cutVoice.playing() && !o.force) return false;
    const f = VO.find(spk, text, o.sex);
    if (!f) missed(spk, text, "no recording");
    // a run of fast clicks should not pile up minutes of talk: keep the newest few
    VO.queue.push({ spk: spk, text: text, f: f, o: o, t: performance.now() });
    while (VO.queue.length > 4) VO.queue.shift();
    if (f) f.list.forEach(e => e.src && load(e.src));
    pump();
    return true;
  };
  function pump() {
    if (VO.cur || !VO.queue.length) return;
    const q = VO.queue.shift();
    if (performance.now() - q.t > 15000) { pump(); return; }       // stale
    VO.cur = q; VO.stats.said++;
    const done = () => { if (VO.cur === q) { lipsRest(q); VO.cur = null; setTimeout(pump, q.o.gap !== undefined ? q.o.gap : 160); } };
    if (!q.f) { const sx = sexOf(speakerKey(q.spk), q.o.sex) || "m"; speakTTS(q.text, sx, done); return; }
    playList(q, done);
  }
  function playList(q, done) {
    const c = ctx(), b = bus();
    if (!c || !b) { done(); return; }
    if (q.f.stitched) VO.stats.stitched++;
    const list = q.f.list.slice();
    const sx = sexOf(q.f.spk, q.o.sex) || "m";
    const next = () => {
      if (VO.cur !== q) return;
      const e = list.shift(); if (!e) { done(); return; }
      if (e.gap) { if (/[a-z]{3}/.test(e.gap)) speakTTS(e.gap.replace(/([a-z])([0-9])/g, "$1 $2"), sx, next); else next(); return; }
      load(e.src).then(buf => {
        if (VO.cur !== q) return;
        if (!buf) { next(); return; }
        const s = c.createBufferSource(); s.buffer = buf;
        const g = c.createGain(); g.gain.value = q.o.vol || 1;
        s.connect(g);
        if (q.o.phone) g.connect(A.phone); else if (q.o.radio) g.connect(A.radio);
        else if (q.o.at && window.cityAudio && cityAudio.spatial) cityAudio.spatial(g, q.o.at, { ref: 2.5, voice: true }); else g.connect(b);
        q.src = s; q.e = e; q.t0 = c.currentTime + 0.02;
        s.onended = () => { if (q.src === s) next(); };
        s.start(q.t0);
        if (q.o.lips !== false && e.m && !q.o.phone && !q.o.radio) lipsStart(q, e);
      });
    };
    next();
  }
  VO.stop = function () {
    VO.queue.length = 0;
    const q = VO.cur; VO.cur = null;
    if (q && q.src) try { q.src.onended = null; q.src.stop(); } catch (e) { /* ended */ }
    if (q) lipsRest(q);
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* none */ }
  };
  VO.speaking = () => !!VO.cur || VO.barks.some(b => b.live);

  // ---- lips: the speaker's face, from the clip's own mouth track ----------------------------------------------------------------------------
  function figureOf(spk, o) {
    if (o.who) return o.who.holder ? { root: o.who.body || o.who.holder, frame: o.who.holder } : o.who.root ? o.who : null;
    const k = speakerKey(spk);
    if (k === "Seiko") return typeof player === "object" && player.obj && player.obj.visible ? { root: player.obj, frame: player.obj } : null;
    const list = typeof actors === "object" && actors.list ? actors.list : [];
    const look = window.cutVoice && cutVoice.cast ? cutVoice.cast[k] : null;
    let a = look && list.find(x => x.real === look);
    if (!a) a = list.find(x => x.staff && (x.staff.name || "").split(" ")[0] === k);
    if (!a) a = list.find(x => x.role === k || x.tag === k);
    return a ? { root: a.body || a.holder, frame: a.holder } : null;
  }
  function lipsStart(q, e) {
    if (!window.cutVoice || !cutVoice.rig) return;
    const fig = figureOf(q.spk, q.o); if (!fig || !fig.root) return;
    if (!cutVoice.rig(fig.root, fig.frame)) return;
    q.fig = fig;
  }
  function lipsRest(q) { if (q && q.fig && window.cutVoice) try { cutVoice.rest(q.fig.root); } catch (e) { /* gone */ } }
  const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";
  function lipsTick() {
    const q = VO.cur, c = ctx(); if (!q || !q.fig || !q.e || !q.e.m || !c) return;
    if (window.cutVoice && cutVoice.cur) return;   // a cutscene owns the faces
    const t = c.currentTime - q.t0, s = q.e.m, n = s.length / 5, f = t * (q.e.fps || 30), i = Math.floor(f), k = f - i, m = [0, 0, 0, 0, 0];
    if (t < 0 || i >= n) return;
    for (let j = 0; j < 5; j++) { const a = B36.indexOf(s[i * 5 + j]) / 35, b = i + 1 < n ? B36.indexOf(s[(i + 1) * 5 + j]) / 35 : 0; m[j] = a + (b - a) * k; }
    cutVoice.pose(q.fig.root, m, 0);
  }

  // ---- barks: from someone in the world --------------------------------------------------------------------------------------------------
  function posOf(who) {
    if (!who) return null;
    if (who.x !== undefined && who.z !== undefined) return { x: who.x, y: (who.y !== undefined ? who.y : (typeof world === "object" && world.surfaceY ? world.surfaceY(who.x, who.z) : 0)) + 1.55, z: who.z };
    if (who.holder) return { x: who.holder.position.x, y: who.holder.position.y + 1.55, z: who.holder.position.z };
    return null;
  }
  function sexOfWho(who) {
    if (!who) return Math.random() < 0.5 ? "f" : "m";
    if (who.female !== undefined) return who.female ? "f" : "m";
    if (/woman|lady|girl|officelady/i.test(who.real || "")) return "f";
    return (who._vsex = who._vsex || (Math.random() < 0.45 ? "f" : "m"));
  }
  // the same person keeps the same voice
  function barkVoice(who, sx) {
    if (who && who._bv && who._bv[0] === "~" + sx) return who._bv;
    const v = "~" + sx + ((Math.random() * 3) | 0);
    if (who && typeof who === "object") try { who._bv = v; } catch (e) { /* frozen */ }
    return v;
  }
  VO.bark = function (who, text, o) {
    o = o || {};
    const sx = sexOfWho(who), v = barkVoice(who, sx), at = posOf(who);
    if (o.subtitle !== false && typeof sayRaw === "function") sayRaw("“" + text + "”", o.secs || Math.min(4, 1.4 + text.length * 0.05));
    const c = ctx(), b = bus();
    VO.stats.barks++;
    let e = VO.man && VO.man[v + "|" + text];
    if (!e) { const f = VO.find("?", text, sx); e = f && f.list.length === 1 && f.list[0].src ? f.list[0] : null; }
    if (!c || !b) return false;
    if (!e) { missed("~", text, "bark"); if (VO.barks.length < 1) speakTTS(text, sx); return false; }
    // at most three at once; the farthest gives way
    if (at && typeof player === "object") { const d = Math.hypot(at.x - player.pos.x, at.z - player.pos.z); if (d > 45) return false; }
    if (VO.barks.length >= 3) { const old = VO.barks.shift(); try { old.src.stop(); } catch (er) { /* ended */ } }
    const rec = { live: true, text: text, src: null };
    VO.barks.push(rec);
    load(e.src).then(buf => {
      if (!buf || !rec.live) return;
      const s = c.createBufferSource(); s.buffer = buf; s.playbackRate.value = 0.97 + Math.random() * 0.06;
      const g = c.createGain(); g.gain.value = o.vol || 1; s.connect(g);
      if (at && window.cityAudio && cityAudio.spatial) cityAudio.spatial(g, at, { ref: 2, voice: true, follow: who }); else g.connect(b);
      rec.src = s; s.onended = () => { rec.live = false; const i = VO.barks.indexOf(rec); if (i >= 0) VO.barks.splice(i, 1); };
      s.start();
      if (e.m && who && (who.holder || who.body) && window.cutVoice) {
        rec.fig = { root: who.body || who.holder, frame: who.holder }; rec.e = e; rec.t0 = c.currentTime;
        if (!cutVoice.rig(rec.fig.root, rec.fig.frame)) rec.fig = null;
      }
    });
    return true;
  };
  function barkLips() {
    const c = ctx(); if (!c || !window.cutVoice) return;
    for (const r of VO.barks) {
      if (!r.fig || !r.e) continue;
      const t = c.currentTime - r.t0, s = r.e.m, n = s.length / 5, f = t * 30, i = Math.floor(f), m = [0, 0, 0, 0, 0];
      if (i >= n || t < 0) { cutVoice.rest(r.fig.root); r.fig = null; continue; }
      for (let j = 0; j < 5; j++) m[j] = B36.indexOf(s[i * 5 + j]) / 35;
      cutVoice.pose(r.fig.root, m, 0);
    }
  }

  // ---- hooks into the game's own talking ------------------------------------------------------------------------------------------------
  // "Name: “text”", "Name, typing: “text”", "“text”" -> [{ spk, text }]
  const QUOTE = /(?:(?:^|[.!?…)]\s+|^\s*|<b>)([A-ZŌŪ][\wōūéā'’.-]*(?: [A-ZŌŪ][\wōūéā'’.-]*){0,2})(?:,[^:“”]{0,40})?:(?:<\/b>)?\s*)?“([^”]+)”/g;
  function quotes(s) { const out = []; let m; QUOTE.lastIndex = 0; while ((m = QUOTE.exec(s))) out.push({ spk: m[1] || null, text: m[2] }); return out; }
  VO.quotes = quotes;
  let source = null;            // set while the street is talking (pedSay, standing-hook): the say() that follows is theirs
  function hookSay() {
    if (typeof window.say !== "function" || window.say._vo) return false;
    const orig = window.say;
    window.sayRaw = orig;
    const wrapped = function (text, secs) {
      const r = orig.apply(this, arguments);
      try {
        if (typeof text === "string" && text.indexOf("“") >= 0) {
          const qs = quotes(text);
          if (source && qs.length) qs.forEach(q => VO.bark(source, q.text, { subtitle: false }));
          else qs.forEach(q => VO.say(q.spk || hintSpk || "?", q.text, { sex: hintSex }));
        }
      } catch (e) { console.warn("[VO] say:", e); }
      return r;
    };
    wrapped._vo = true;
    window.say = wrapped;
    try { say = wrapped; } catch (e) { /* the global binding is the window property */ }
    return true;
  }
  let hintSpk = null, hintSex = null;
  function hookStreet() {
    if (typeof window.pedSay === "function" && !window.pedSay._vo) {
      const orig = window.pedSay;
      const w = function (p, kind, secs) { source = p; try { return orig.apply(this, arguments); } finally { source = null; } };
      w._vo = true; window.pedSay = w; try { pedSay = w; } catch (e) { /* window */ }
    }
  }
  // C.menu: conversations, phone calls, after hours, the boss's office
  function hookMenu() {
    const C = window.career; if (!C || !C.menu || C.menu._vo) return !!(C && C.menu && C.menu._vo);
    const orig = C.menu;
    C.menu = function (o) {
      try {
        if (o && o.body && typeof o.body === "string") {
          const head = String(o.head || "").replace(/<[^>]+>/g, "");
          const phone = /📞/.test(head) || /call|calling|voicemail|phone/i.test(o.tag || "");
          const who = head.replace(/^[^\wŌŪ]+/u, "").trim();
          const qs = quotes(o.body.replace(/<br\s*\/?>/g, " "));
          // a list of lines from several people, or one speaker (the menu's head) when nobody is named
          qs.forEach(q => VO.say(q.spk || who || "?", q.text, { phone: phone }));
        }
        // the answers: Seiko says the one you pick, before whatever happens next
        if (o && Array.isArray(o.opts)) o.opts = o.opts.map(x => {
          if (!x || typeof x.fn !== "function" || x._vo) return x;
          const label = String(x.label || "").replace(/<[^>]+>/g, "");
          const fn = x.fn;
          return Object.assign({}, x, { _vo: true, fn: function () {
            try {
              const qs = quotes(label), said = qs.length ? qs.map(q => q.text) : [label];
              said.forEach(t => { if (VO.has("Seiko", t)) VO.say("Seiko", t); });
            } catch (e) { /* quiet */ }
            return fn.apply(this, arguments);
          } });
        });
      } catch (e) { console.warn("[VO] menu:", e); }
      return orig.apply(this, arguments);
    };
    Object.keys(orig).forEach(k => { if (k[0] === "_") C.menu[k] = orig[k]; });
    C.menu._vo = true;
    return true;
  }
  // the Care Desk: the caller down the line, and Seiko's side of it
  function hookDesk() {
    const d = window.career && career.desk; if (!d || !d.say || d.say._vo) return !!(d && d.say && d.say._vo);
    const orig = d.say;
    d.say = function (who, text) {
      const r = orig.apply(this, arguments);
      try {
        if (text) {
          const c = d.call, full = c && c.who ? String(c.who).replace(/^"|"/g, "") : who;
          const caller = who && who !== "Seiko";
          VO.say(caller ? who : "Seiko", text, { phone: caller, sex: caller && /\b(Michiko|Fumiko|Sora|Rina|Kaede|Reiko|Kirara)\b/.test(full) ? "f" : undefined });
        }
      } catch (e) { console.warn("[VO] desk:", e); }
      return r;
    };
    d.say._vo = true;
    return true;
  }
  // the radio hosts: our recordings in place of the system voice
  function hookRadio() {
    if (typeof window.talkSpeak !== "function" || window.talkSpeak._vo) return;
    const orig = window.talkSpeak;
    const w = function (who, text) {
      const f = VO.find(who, text);
      if (f && f.list.length === 1 && f.list[0].src) { VO.say(who, text, { radio: true, force: true, lips: false }); return; }
      return orig.apply(this, arguments);
    };
    w._vo = true; window.talkSpeak = w; try { talkSpeak = w; } catch (e) { /* window */ }
  }
  // the radio's own "is a host still talking" check reads talkVoice.busy: keep it true while ours plays
  function radioBusy() {
    try { if (typeof talkVoice === "object" && VO.cur && VO.cur.o.radio) { talkVoice.busy = true; VO._radioHeld = true; } else if (VO._radioHeld) { talkVoice.busy = false; VO._radioHeld = false; } } catch (e) { /* no radio */ }
  }

  // ---- the tick -------------------------------------------------------------------------------------------------------------------------------
  VO.tick = function (dt) {
    hookSay(); hookMenu(); hookDesk(); hookStreet(); hookRadio();          // each is a no-op once it is in
    if (A.bus) A.bus.gain.setTargetAtTime(gainV(), A.bus.context.currentTime, 0.1);
    // a cutscene takes over: what was being said stops
    if (typeof cut === "object" && cut.active && VO.cur && !VO.cur.o.force) VO.stop();
    // in the car, the radio is quieter under talk
    radioBusy();
    lipsTick(); barkLips();
    if (!VO.cur && VO.queue.length) pump();
  };
  hookSay(); hookMenu(); hookDesk(); hookStreet(); hookRadio();
  if (typeof window.updateSound === "function") {
    const was = window.updateSound;
    window.updateSound = function (dt) { const r = was.apply(this, arguments); try { VO.tick(dt || 0.016); } catch (e) { console.warn("[VO] tick:", e); } return r; };
  }
  VO.status = () => ({ ready: !!VO.man, lines: byNorm.size, pieces: [...pieces.values()].reduce((n, a) => n + a.length, 0), names: names.size,
    speaking: VO.cur ? { spk: VO.cur.spk, text: VO.cur.text.slice(0, 60) } : null, queued: VO.queue.length, barks: VO.barks.length, stats: VO.stats, misses: VO.misses.length });
  console.log("[VO] " + VO.version + " · dialogue, calls, radio and street voices");
})();
