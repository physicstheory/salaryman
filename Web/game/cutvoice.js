// ==== CUTSCENE VOICES AND LIP SYNC ================================================================================================
// Every line a cutscene speaks has a voice: Kokoro neural TTS, one voice per character, built offline by Tools/voice/build_voices.py
// into Web/audio/voice/*.ogg with Web/audio/voice/index.json. The model's own phoneme timings become a mouth track (jaw, wide,
// round, press, tuck at 30 fps), and here that track drives the Rocketbox face bones (Bip01 MJaw, the lips and mouth corners) of
// whoever is speaking, so the mouth makes the shapes of the words as they are heard. Lines without a recording stay subtitles.
//
//   cutVoice.info(speaker, text)    -> { dur } or null       (cutPlay stretches a shot so nothing is cut off mid-word)
//   cutVoice.say(speaker, text, who) starts the line; who = a cutscene actor, Seiko's figure, or null to look it up by cast
//   cutVoice.stop() / pause(on) / tick(dt)
//   cutVoice.rig(root) / pose(root, [jaw, wide, round, press, tuck]) work on any Rocketbox figure (the viewer and tests use them)
(function () {
  "use strict";
  const V = window.cutVoice = { man: null, cast: {}, cur: null, vol: 1, enabled: true, rigs: new WeakMap(), blinkers: [] };
  const fetchJSON = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
  V.ready = fetchJSON("audio/voice/index.json").then(m => { if (m && m.lines) { V.man = m.lines; V.cast = m.cast || {}; } return V.man; });
  try { const s = localStorage.getItem("konto.voice"); if (s === "off") V.enabled = false; else if (s) V.vol = Math.max(0, Math.min(1, +s)); } catch (e) { /* defaults */ }

  V.entry = (spk, text) => V.man && V.enabled ? V.man[(spk || "") + "|" + text] || null : null;
  V.info = (spk, text) => { const e = V.entry(spk, text); return e ? { dur: e.dur } : null; };

  // ---- the face ---------------------------------------------------------------------------------------------------------------------
  // Directions are in the figure's own frame (x its left-right, y up, z the way it faces) and turned into each bone's parent space
  // once, at rest, so the same numbers work whatever the scale or the way the skeleton was exported.
  const T = window.THREE;
  const BONES = { jaw: /MJaw$/, lipB: /MBottomLip$/, lipU: /MUpperLip$/, cL: /LMouthCorner$/, cR: /RMouthCorner$/, lidTL: /LEyeBlinkTop$/, lidTR: /REyeBlinkTop$/ };
  V.rig = function (root, frame) {
    if (!root || !T) return null;
    let r = V.rigs.get(root); if (r) return r.ok ? r : null;
    r = { ok: false, b: {}, frame: frame || root };
    root.traverse(o => { if (!o.isBone) return; for (const k in BONES) if (!r.b[k] && BONES[k].test(o.name)) r.b[k] = o; });
    V.rigs.set(root, r);
    if (!r.b.jaw) return null;
    root.updateMatrixWorld(true);
    const fInv = new T.Matrix4().copy(r.frame.matrixWorld).invert();
    // the figure's metres per bone unit, from its world scale
    const unit = new T.Vector3().setFromMatrixScale(r.frame.matrixWorld).x || 1;
    for (const k in r.b) {
      const bone = r.b[k], rel = new T.Matrix4().multiplyMatrices(fInv, bone.parent.matrixWorld);
      const lin = new T.Matrix3().setFromMatrix4(rel), inv = lin.clone().invert();
      const relB = new T.Matrix4().multiplyMatrices(fInv, bone.matrixWorld), qb = new T.Quaternion();
      relB.decompose(new T.Vector3(), qb, new T.Vector3());
      const qbInv = qb.clone().invert();
      bone.userData.lip = {
        q0: bone.quaternion.clone(), p0: bone.position.clone(),
        // a step of 1 m in the figure's frame, in parent space
        dx: new T.Vector3(1, 0, 0).applyMatrix3(inv).multiplyScalar(unit), dy: new T.Vector3(0, 1, 0).applyMatrix3(inv).multiplyScalar(unit),
        dz: new T.Vector3(0, 0, 1).applyMatrix3(inv).multiplyScalar(unit),
        ax: new T.Vector3(1, 0, 0).applyQuaternion(qbInv).normalize()    // the figure's left-right axis in the bone's own frame
      };
    }
    r.ok = true; r.m = [0, 0, 0, 0, 0]; r.blink = 0; r.nextBlink = 1 + Math.random() * 3;
    return r;
  };
  const _q = T ? new T.Quaternion() : null, _v = T ? new T.Vector3() : null;
  function place(bone, x, y, z, rot) {
    if (!bone) return; const L = bone.userData.lip; if (!L) return;
    _v.copy(L.p0).addScaledVector(L.dx, x).addScaledVector(L.dy, y).addScaledVector(L.dz, z); bone.position.copy(_v);
    if (rot) { _q.setFromAxisAngle(L.ax, rot); bone.quaternion.copy(L.q0).multiply(_q); } else bone.quaternion.copy(L.q0);
  }
  // m = [jaw, wide, round, press, tuck], each 0..1; blink 0..1
  V.pose = function (root, m, blink) {
    const r = V.rig(root); if (!r) return false;
    const jaw = m[0], wide = m[1], round = m[2], press = m[3], tuck = m[4], b = r.b;
    place(b.jaw, 0, 0, 0, V.JAW * jaw);
    const spread = 0.0055 * wide - 0.006 * round;
    place(b.cL, spread, 0.0012 * wide - 0.001 * round, 0.0035 * round - 0.001 * wide);
    place(b.cR, -spread, 0.0012 * wide - 0.001 * round, 0.0035 * round - 0.001 * wide);
    place(b.lipU, 0, -0.0016 * press + 0.0012 * wide * jaw + 0.001 * round, 0.0055 * round + 0.001 * press);
    place(b.lipB, 0, 0.0024 * press + 0.0028 * tuck - 0.0008 * round, 0.005 * round - 0.0045 * tuck);
    if (b.lidTL && blink !== undefined) { place(b.lidTL, 0, -0.0085 * blink, 0); place(b.lidTR, 0, -0.0085 * blink, 0); }
    return true;
  };
  V.JAW = 0.24;          // radians at full open (about 14 degrees: a wide "ah")
  V.rest = root => { const r = V.rigs.get(root); if (r && r.ok) { V.pose(root, [0, 0, 0, 0, 0], 0); r.m = [0, 0, 0, 0, 0]; } };

  // ---- who is talking ----------------------------------------------------------------------------------------------------------------
  function figureFor(spk) {
    if (spk === "Seiko") return typeof player !== "undefined" && player.obj ? { root: player.obj, frame: player.obj } : null;
    const look = V.cast[spk];
    const list = typeof actors !== "undefined" ? actors.list : [];
    // the actor wearing that cast member, else the one the scene asked for them by name (still that part if the model is still loading)
    let a = look && (list.find(x => x.real === look) || list.find(x => x.want && x.want.indexOf(look) >= 0));
    // a part played by someone the cast list does not name: the actor tagged with the speaker's name, else nobody
    if (!a) a = list.find(x => x.role === spk || x.tag === spk);
    return a ? { root: a.body || a.holder, frame: a.holder } : null;
  }
  V.say = function (spk, text, who) {
    V.stop();
    const e = V.entry(spk, text); if (!e) return null;
    const au = new Audio(e.src); au.volume = V.vol; au.preload = "auto";
    const fig = who || (e.m ? figureFor(e.who || spk) : null);
    if (fig && fig.frame) V.rig(fig.root, fig.frame);
    const cur = V.cur = { e: e, au: au, fig: e.m ? fig : null, t0: performance.now(), n: e.m ? e.m.length / 5 : 0, paused: false };
    au.play().catch(() => { cur.failed = true; });
    return { dur: e.dur };
  };
  V.stop = function () {
    const c = V.cur; V.cur = null; if (!c) return;
    try { c.au.pause(); c.au.removeAttribute("src"); c.au.load(); } catch (err) { /* gone */ }
    if (c.fig) V.rest(c.fig.root);
  };
  V.pause = function (on) { const c = V.cur; if (!c) return; c.paused = !!on; try { if (on) c.au.pause(); else c.au.play().catch(() => {}); } catch (e) { /* none */ } };
  V.playing = () => !!(V.cur && !V.cur.au.ended && !V.cur.failed);
  const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";
  const dec = (s, i) => B36.indexOf(s[i]) / 35;
  V.tick = function (dt) {
    const c = V.cur;
    if (c && c.fig) {
      const r = V.rigs.get(c.fig.root);
      if (r && r.ok) {
        // the audio clock, so the mouth never drifts from the sound; a blocked autoplay still moves the mouth on wall time
        const t = c.failed ? (performance.now() - c.t0) / 1000 : c.au.currentTime;
        const f = t * c.e.fps, i = Math.floor(f), k = f - i, s = c.e.m;
        for (let j = 0; j < 5; j++) {
          const a = i < c.n ? dec(s, i * 5 + j) : 0, b = i + 1 < c.n ? dec(s, (i + 1) * 5 + j) : 0;
          r.m[j] = a + (b - a) * k;
        }
        // blinks: every two to five seconds, a fast close and a slower open, a little more often at the end of a sentence
        r.nextBlink -= dt; if (r.nextBlink <= 0) { r.blink = 0.001; r.nextBlink = 2 + Math.random() * 3; }
        let bl = 0; if (r.blink > 0) { r.blink += dt; const u = r.blink / 0.16; bl = u < 0.35 ? u / 0.35 : Math.max(0, 1 - (u - 0.35) / 0.65); if (u >= 1) r.blink = 0; }
        V.pose(c.fig.root, r.m, bl);
      }
      if (c.au.ended || (c.failed && (performance.now() - c.t0) / 1000 > c.e.dur)) { V.rest(c.fig.root); c.fig = null; }
    }
  };
  V.setVolume = function (v) { V.vol = Math.max(0, Math.min(1, v)); V.enabled = V.vol > 0; try { localStorage.setItem("konto.voice", V.enabled ? String(V.vol) : "off"); } catch (e) { /* session only */ } };
})();
