// Missions out in the world: the small engine the SOTI storyline (saga.js) and the Kurogane-kai (yakuza.js) are both written on.
//
// A mission is a list of steps run in order:
//   { go: place, text, hint, who, by, radius }   go somewhere (a yellow marker and the GPS line). who: someone from def.people waiting there.
//                                                by: a time of day in minutes; arriving after it costs the mission a point and sets ctx.late.
//   { talk: nodes | "key", who }                 a conversation with choices (def.talks[key]); each choice can move honor, respect, yen...
//   { office: lines, cast }                      a scene in the boss's office on 58F (lines are [0, "Speaker", "text"])
//   { say: text }                                a line on the screen
//   { fn: (ctx, next) => {} }                    anything else; call next() to go on
//   { fight: {...} }                             handled by whoever registered Q.handlers.fight (yakuza.js)
// A place is { soti }, { flat }, { station: "Kanchogai" }, { ward: "Mitamamori" }, { site: "Konto Central Bank" }, { castle }, { city: "Nagisa" },
// { shop: "sushiya", near: place, n: 0 }, { venue: "izakaya" } or { at: [x, z] }; quest.place(spec) gives the spot to stand on, on a pavement.
//
// What a choice can carry: honor (number), respect (number), yen, score (how well the job is going: -2..2), favor (the boss's goodwill),
// reiko (Reiko Sotiyama's trust), crew (the family's regard), flag (remembered in ctx.flags and the saved story), stress, reply, next | end.
(function () {
  "use strict";
  if (typeof story === "undefined" || typeof cutPlay !== "function" || !window.career) { console.warn("[Quest] the story is not in this build"); return; }
  const C = window.career, Q = window.quest = {};
  Q.version = "1.0.0";
  Q.handlers = {};
  Q.cur = null;

  // ---- places ----------------------------------------------------------------------------------------------------------------------------
  const tokonto = () => world.cities[0];
  const norm = s => String(s || "").toLowerCase().replace(/\s*station$/, "").replace(/[ōŌ]/g, "o").replace(/[ūŪ]/g, "u").replace(/[^a-z0-9]/g, "");
  // the nearest pavement to a point, so nobody is asked to stand inside a building or in the road
  function snap(x, z, R) {
    try {
      if (typeof pedNet === "object" && pedNet.ready) {
        const c = pedNetNear(x, z, R || 140, id => pedNet.adj[id].length > 0);
        if (c && c.length) { let b = c[0]; for (const q of c) if (q[0] < b[0]) b = q; return [pedNet.x[b[1]], pedNet.z[b[1]]]; }
      }
    } catch (e) { /* no pavements here */ }
    if (typeof insideBuilding === "function") {
      for (let r = 0; r <= 60; r += 6) for (let a = 0; a < 8; a++) {
        const px = x + Math.sin(a * Math.PI / 4) * r, pz = z + Math.cos(a * Math.PI / 4) * r;
        if (!insideBuilding(px, pz, 1.2) && world.sampleHeight(px, pz) > 0.35) return [px, pz];
      }
    }
    return [x, z];
  }
  const outOf = (door, yaw, d) => [door[0] + Math.sin(yaw || 0) * (d || 3), door[1] + Math.cos(yaw || 0) * (d || 3)];
  function stationOf(name, city) {
    const want = norm(name);
    for (const c of (city ? [city] : world.cities)) { const st = (c.stations || []).find(s => norm(s.name) === want); if (st) return st; }
    return null;
  }
  Q.place = function (spec) {
    if (!spec) return null;
    if (typeof spec === "string") spec = spec === "soti" ? { soti: true } : spec === "flat" ? { flat: true } : { station: spec };
    let p = null, label = spec.label || "";
    const so = story.soti;
    if (spec.at) p = spec.raw ? spec.at.slice() : snap(spec.at[0], spec.at[1]);
    else if (spec.soti && so) { p = outOf(so.door, so.yaw, 5); label = label || "SOTI Tower"; }
    else if (spec.flat) { const f = story.career && story.career.flat; if (f) { p = outOf(f.door, f.yaw, 2.5); label = label || f.name; } }
    else if (spec.station) {
      const st = stationOf(spec.station, spec.city ? world.cities.find(c => norm(c.name) === norm(spec.city)) : null);
      if (st) { p = st.conc && st.conc.door ? outOf(st.conc.door, st.conc.yaw, 6) : snap(st.centre[0], st.centre[1]); label = label || (/station|central|^soti$/i.test(st.name) ? st.name : st.name + " Station"); }
    }
    else if (spec.ward) { const w = tokonto().wards.find(w => norm(w.name) === norm(spec.ward)); if (w) { p = snap(w.centre[0] + (spec.dx || 0), w.centre[1] + (spec.dz || 0)); label = label || w.name; } }
    else if (spec.site) { const s = (tokonto().sites || []).find(s => norm(s.name) === norm(spec.site)); if (s) { p = snap(s.at[0], s.at[2] !== undefined ? s.at[2] : s.at[1], 220); label = label || s.name; } }
    else if (spec.castle) { const k = tokonto().castle; if (k && k.gate) { const g = k.gate.at || k.gate; p = snap(g[0], g[2] !== undefined && g.length > 2 ? g[2] : g[1], 200); label = label || "The castle gate"; } }
    else if (spec.city) { const c = world.cities.find(c => norm(c.name) === norm(spec.city)); if (c) { const st = (c.stations || [])[0]; p = st && st.conc && st.conc.door ? outOf(st.conc.door, st.conc.yaw, 6) : snap(c.centre[0], c.centre[1], 400); label = label || c.name; } }
    else if (spec.shop) {
      const ref = spec.near ? Q.place(spec.near) : (so ? { x: so.door[0], z: so.door[1] } : { x: player.pos.x, z: player.pos.z });
      const list = shops.list.filter(s => s.brand === spec.shop && s.door).map(s => [Math.hypot(s.door[0] - ref.x, s.door[1] - ref.z), s]).sort((a, b) => a[0] - b[0]);
      const pick = list.length ? list[Math.min(list.length - 1, spec.n || 0)][1] : null;
      if (pick) { p = outOf(pick.door, pick.yaw, 3.2); label = label || pick.name; }
    }
    else if (spec.venue && window.afterhours && afterhours.venues.length) {
      const v = afterhours.nearest(spec.venue, so ? so.door[0] : player.pos.x, so ? so.door[1] : player.pos.z) || afterhours.venues[0];
      p = outOf(v.door, v.yaw, 3); label = label || v.name + ", under " + v.station + " Station";
    }
    if (!p && so) { p = outOf(so.door, so.yaw, 5); label = label || "SOTI Tower"; }           // a place this map doesn't have: the tower will do
    if (!p) p = [player.pos.x, player.pos.z];
    return { x: p[0], z: p[1], label: label };
  };

  // ---- what choices do -------------------------------------------------------------------------------------------------------------------
  const saga = () => { const s = C.state(); return s.saga || (s.saga = { favor: 0, reiko: 0, flags: {} }); };
  Q.honor = function (d, label) { try { if (window.standing && d) standing.honor.apply(d, { id: d > 0 ? "story_good" : "story_bad", label: label || (d > 0 ? "Did the right thing" : "Took the low road"), icon: d > 0 ? "service" : "broken" }); } catch (e) { /* no honor layer */ } };
  Q.respect = function (d, label) { try { if (window.standing && d) standing.earn(d, label || (d > 0 ? "Respect earned" : "Respect lost")); } catch (e) { /* none */ } };
  Q.effect = function (o, ctx) {
    if (!o) return;
    if (o.honor) Q.honor(o.honor, o.why);
    if (o.respect) Q.respect(o.respect, o.why);
    if (o.yen) { purse.yen = Math.max(0, purse.yen + o.yen); notify("Wallet", o.yen > 0 ? "Received" : "Paid", (o.yen > 0 ? "+" : "−") + yenText(Math.abs(o.yen)), 5); }
    if (o.stress) vitals.stress = Math.max(0, Math.min(1, (vitals.stress || 0) + o.stress));
    if (o.favor) saga().favor = (saga().favor || 0) + o.favor;
    if (o.reiko) saga().reiko = (saga().reiko || 0) + o.reiko;
    if (o.crew && Q.handlers.crew) Q.handlers.crew(o.crew);
    if (ctx) {
      if (o.score !== undefined) { ctx.score += o.score; ctx.n++; }
      if (o.flag) { ctx.flags[o.flag] = true; saga().flags[o.flag] = true; }
    }
  };

  // ---- a conversation --------------------------------------------------------------------------------------------------------------------
  // nodes: { start: { who, say | lines: [[name, text]], tag, opts: [{ t, note, ...effects, reply, next | end, need: yen }] } }
  Q.talk = function (nodes, ctx, then, head) {
    let id = "start";
    const step = () => {
      const n = nodes[id];
      if (!n) { then && then(ctx); return; }
      const lines = n.lines || [[n.who || head || "", n.say || ""]];
      const body = lines.map(l => (l[0] ? "<b>" + l[0] + ":</b> " : "") + (l[0] ? "“" + l[1] + "”" : "<i>" + l[1] + "</i>")).join("<br>");
      const opts = (n.opts || [{ t: "…", end: true }]).filter(o => !o.if || ctx.flags[o.if] || saga().flags[o.if]).filter(o => !o.unless || !(ctx.flags[o.unless] || saga().flags[o.unless]));
      C.menu({ head: head || n.who || "", tag: n.tag || "", body: body, opts: opts.map(o => ({ label: o.t, note: o.note || (o.need ? yenText(o.need) : ""), dim: !!(o.need && purse.yen < o.need), fn: () => {
        if (o.need) purse.yen -= o.need;
        Q.effect(o, ctx);
        if (o.fn) try { o.fn(ctx); } catch (e) { console.warn("[Quest] choice:", e); }
        if (o.reply) say(o.reply, Math.min(8, 2.5 + o.reply.length * 0.045));
        if (o.end || !o.next) { setTimeout(() => then && then(ctx), o.reply ? 900 : 120); return; }
        id = o.next; setTimeout(step, o.reply ? 900 : 100);
      } })) });
    };
    step();
  };

  // ---- a scene in the boss's office (58F) ---------------------------------------------------------------------------------------------------
  // lines: [[0, "Akio", "text"], ...] (the 0 is where a time would go: lines are timed by their length, and stretched to the voice when there
  // is one). o.cast: { Name: { look, female, bow } } for anyone else in the room. o.noAkio, o.behindDesk (Seiko has the chair), o.card (a title).
  const LOOKS = { "Gondō": "salaryman_07", "Mori": "officelady_01", "Nakano": "officelady_03", "Takeda": "officelady_04", "Ishikawa": "salaryman_02", "Fujita": "salaryman_05",
    "Reiko": "woman_04", "Secretary": "officelady_05", "Receptionist": "officelady_02", "Kuroda": "salaryman_10", "Auditor": "salaryman_01", "Board": "salaryman_06" };
  Q.looks = LOOKS;
  const lineSecs = t => Math.max(1.9, 1.0 + String(t).length * 0.058);
  Q.office = function (lines, o, then) {
    o = o || {};
    const so = story.soti;
    if (!so || typeof storyOfficeRoom !== "function") { then && then(); return; }
    if (interior.active) try { interiorLeave(true); } catch (e) { /* stay */ }
    if (C.menuState.on) C.menuClose();
    if (Q.inOffice) { actorsClear("qoffice"); Q.camHold = null; }
    const off = storyOfficeRoom(), fy = interior.floorY, O = (x, y, z) => [off.ox + x, fy + y, off.oz + z];
    const names = []; lines.forEach(l => { if (l[1] && l[1] !== "Seiko" && l[1] !== "Akio" && names.indexOf(l[1]) < 0) names.push(l[1]); });
    Object.keys(o.cast || {}).forEach(k => { if (names.indexOf(k) < 0) names.push(k); });
    const SPOTS = [[-2.0, -0.4], [2.0, -0.4], [-2.9, 0.9], [2.9, 0.9], [-1.2, 2.6], [1.2, 2.6], [-3.4, 2.4], [3.4, 2.4]];
    const who = {};
    const akioAt = o.behindDesk ? [-2.4, 2.0] : [0, -3.3];
    if (!o.noAkio) who.Akio = actorAdd({ x: off.ox + akioAt[0], y: fy, z: off.oz + akioAt[1], yaw: o.behindDesk ? Math.PI * 0.75 : 0, female: false, business: true, pick: 5, tag: "qoffice", pose: "idle", h: 1.05, look: ["boss_akio"] });
    names.forEach((n, i) => {
      if (n === "Everyone" || n === "PA") return;
      const c = (o.cast || {})[n] || {}, sp = SPOTS[i % SPOTS.length];
      const a = actorAdd({ x: off.ox + sp[0], y: fy, z: off.oz + sp[1], female: c.female !== undefined ? c.female : /officelady|woman/.test(c.look || LOOKS[n] || ""), business: true, pick: 2 + i * 3, tag: "qoffice", pose: "idle", look: [c.look || LOOKS[n] || "salaryman_0" + (1 + i % 9)] });
      actorLook(a, off.ox, off.oz + (o.behindDesk ? -3.3 : 0.4)); who[n] = a; a.at = sp;
      if (c.bow || o.allBow) a.bowing = true;
    });
    const me = o.behindDesk ? [0, -3.3, 0] : [0, 1.3, Math.PI];
    const place = () => { player.pos.set(off.ox + me[0], fy, off.oz + me[1]); player.yaw = player.targetYaw = me[2]; player.obj.position.copy(player.pos); player.obj.rotation.y = me[2]; player.obj.visible = true; };
    const cam = spk => {
      if (spk === "Akio" && who.Akio) { const a = akioAt; return o.behindDesk ? { from: O(a[0] + 1.2, 1.6, a[1] - 1.2), to: O(a[0] + 1.1, 1.58, a[1] - 1.0), look: O(a[0], 1.55, a[1]) } : { from: O(0.5, 1.66, -1.35), to: O(0.42, 1.64, -1.55), look: O(0, 1.6, -3.3) }; }
      if (spk === "Seiko") return o.behindDesk ? { from: O(0.5, 1.6, -1.3), to: O(0.4, 1.58, -1.5), look: O(0, 1.52, -3.3) } : { from: O(-0.75, 1.6, -0.55), to: O(-0.65, 1.58, -0.4), look: O(0, 1.5, 1.3) };
      const a = who[spk];
      if (a && a.at) { const x = a.at[0], z = a.at[1], k = x < 0 ? 1 : -1; return { from: O(x + k * 1.25, 1.6, z - 1.2), to: O(x + k * 1.15, 1.58, z - 1.05), look: O(x, 1.52, z) }; }
      return o.behindDesk ? { from: O(0.4, 1.9, 4.6), to: O(0.2, 1.8, 3.9), look: O(0, 1.3, -2.6) } : { from: O(2.4, 1.8, 4.4), to: O(1.9, 1.7, 3.7), look: O(0, 1.4, -2.6) };
    };
    const shots = [];
    if (o.card) shots.push({ dur: 3.4, from: () => ({ pos: [so.door[0] + Math.sin(so.yaw) * 16, so.groundY + 1.6, so.door[1] + Math.cos(so.yaw) * 16], look: [so.at[0], so.groundY + 60, so.at[1]] }),
      to: () => ({ pos: [so.door[0] + Math.sin(so.yaw) * 12, so.groundY + 1.5, so.door[1] + Math.cos(so.yaw) * 12], look: [so.at[0], so.groundY + 150, so.at[1]] }), timeScale: 0,
      enter: () => { if (player.obj) player.obj.visible = false; }, lines: [[0.5, "", o.card]] });
    let first = true;
    for (let i = 0; i < lines.length;) {
      const spk = lines[i][1], group = [];
      while (i < lines.length && lines[i][1] === spk && group.length < 2) group.push(lines[i++]);
      let t = 0.25; const ls = group.map(l => { const r = [t, l[1], l[2]]; t += lineSecs(l[2]); return r; });
      const c = cam(spk), isFirst = first; first = false;
      shots.push({ dur: t + 0.35, from: { pos: c.from, look: c.look }, to: { pos: c.to, look: c.look }, near: 0.05, timeScale: 0, lines: ls,
        enter: () => {
          if (isFirst) { off.group.visible = true; place(); Object.keys(who).forEach(k => { if (who[k].bowing) who[k].pose = "bow"; }); }
          if (spk === "Seiko" && o.seikoBow) { player.forceClip = "bow"; setTimeout(() => { player.forceClip = null; }, 1500); }
          const a = who[spk]; if (a && !a.bowing) a.pose = "idle";
        } });
    }
    shots.push({ dur: 0.7, from: { pos: cam("").from, look: cam("").look }, overlay: "black", timeScale: 0 });
    Q.inOffice = true;
    cutPlay(shots, () => {
      player.forceClip = null; if (player.obj) player.obj.visible = true;
      // stay: the talking goes on in the room (a menu of choices), with the camera held on the two of them
      if (o.stay) { const w = cam(""); Q.camHold = { pos: w.to, look: w.look }; holdCam(); }
      else Q.officeLeave();
      then && then();
    });
  };
  Q.officeLeave = function () {
    if (!Q.inOffice) return;
    Q.inOffice = false; Q.camHold = null;
    const so = story.soti, off = interior.rooms["soti:office"];
    actorsClear("qoffice"); if (off) off.group.visible = false;
    if (so) { stepOutFrom(so.door, so.yaw); if (typeof yaw === "number") yaw = so.yaw + Math.PI; }
  };
  const _v = new THREE.Vector3();
  function holdCam() { const h = Q.camHold; if (!h) return; camera.position.fromArray(h.pos); if (typeof camPos === "object") camPos.copy(camera.position); camera.lookAt(_v.fromArray(h.look)); }
  if (typeof window.present === "function") { const presentWas = window.present; window.present = function () { if (Q.camHold && C.menuState.on) holdCam(); return presentWas.apply(this, arguments); }; }

  // ---- people waiting at a place ----------------------------------------------------------------------------------------------------------
  function personAt(def, key, p) {
    const d = (def.people || {})[key] || { name: key };
    const a = actorAdd({ x: p.x + 0.9, z: p.z + 0.4, female: !!d.female, business: d.business !== false, pick: d.pick || 3, tag: "quest", pose: d.pose || "idle", look: d.look ? [d.look] : (LOOKS[d.name] ? [LOOKS[d.name]] : null), h: d.h || 1 });
    a.questKey = key; a.name = d.name || key;
    return a;
  }

  // ---- the runner ------------------------------------------------------------------------------------------------------------------------
  Q.run = function (def, done) {
    Q.abort(true);
    const ctx = { score: 0, n: 0, flags: {}, late: false, def: def };
    Q.cur = { def: def, i: -1, ctx: ctx, done: done, target: null, actor: null, step: null, wait: 0 };
    Q.next();
    return ctx;
  };
  Q.next = function () {
    const q = Q.cur; if (!q) return;
    q.target = null; q.step = null;
    q.i++;
    const st = q.def.steps[q.i];
    if (!st) { Q.finish(); return; }
    q.step = st;
    try {
      if (st.if && !(q.ctx.flags[st.if] || saga().flags[st.if])) { Q.next(); return; }
      if (st.unless && (q.ctx.flags[st.unless] || saga().flags[st.unless])) { Q.next(); return; }
      if (st.go) {
        const p = Q.place(st.go);
        q.target = { x: p.x, z: p.z, r: st.radius || 6.5, by: st.by, label: st.label || p.label, st: st };
        storyClearBlips(); storyBlip(p.x, p.z, st.label || p.label, st.letter ? { letter: st.letter } : undefined);
        storyObjective(st.text || ("Go to " + (st.label || p.label)), st.hint || "Follow the yellow line. A Ryde (P) or the train will get you across town.");
        if (q.actor && q.actor.questKey !== st.who) { q.actor.gone = true; q.actor = null; }
        q.who = st.who || null; q.whoAt = p;
      } else if (st.talk) {
        const nodes = typeof st.talk === "string" ? q.def.talks[st.talk] : st.talk;
        const d = (q.def.people || {})[st.who || (q.actor && q.actor.questKey)] || {};
        if (q.actor) actorLook(q.actor, player.pos.x, player.pos.z);
        storyClearBlips();
        Q.talk(nodes, q.ctx, () => Q.next(), st.head || d.name || "");
      } else if (st.office) {
        storyClearBlips(); storyClearObjective();
        Q.office(typeof st.office === "function" ? st.office(q.ctx) : st.office, st, () => Q.next());
      } else if (st.leave) { Q.officeLeave(); Q.next(); }
      else if (st.say) { say(st.say, st.secs || 5); setTimeout(() => Q.cur === q && Q.next(), 600); }
      else if (st.fn) st.fn(q.ctx, () => Q.cur === q && Q.next());
      else {
        const k = Object.keys(st).find(k => Q.handlers[k]);
        if (k) Q.handlers[k](st[k], q.ctx, () => Q.cur === q && Q.next(), q); else Q.next();
      }
    } catch (e) { console.warn("[Quest] step " + q.i + " of " + (q.def.id || q.def.title) + ":", e); setTimeout(() => Q.cur === q && Q.next(), 50); }
  };
  Q.finish = function () {
    const q = Q.cur; if (!q) return;
    Q.cur = null;
    if (q.actor) { q.actor.gone = true; }
    Q.officeLeave();
    actors.list.forEach(a => { if (a.tag === "quest") a.gone = true; });
    storyClearBlips();
    const c = q.ctx;
    c.rating = Math.max(1, Math.min(5, Math.round(3 + (c.n ? c.score / c.n * 2 : 0) - (c.late ? 1 : 0))));
    if (q.done) try { q.done(c); } catch (e) { console.warn("[Quest] done:", e); }
  };
  Q.abort = function (quiet) {
    const q = Q.cur; Q.cur = null;
    if (!q) return;
    actorsClear("quest"); Q.officeLeave();
    if (!quiet) { storyClearBlips(); storyClearObjective(); }
    if (Q.handlers.abort) try { Q.handlers.abort(q); } catch (e) { /* nothing running */ }
  };
  Q.active = () => !!Q.cur;

  Q.tick = function (dt) {
    const q = Q.cur; if (!q || cut.active || C.menuState.on) return;
    const t = q.target; if (!t) return;
    const inCar = !!(drive.car || drive.train), at = drive.car ? drive.car.pos : player.pos;
    const d = Math.hypot(at.x - t.x, at.z - t.z);
    // whoever is waiting there appears as you get near
    if (q.who && !q.actor && d < 140 && !interior.active) q.actor = personAt(q.def, q.who, q.whoAt);
    if (q.actor && d < 30) actorLook(q.actor, player.pos.x, player.pos.z);
    const el = document.getElementById("objective"), ot = el && el.querySelector(".ot");
    if (t.by !== undefined && ot) {
      const m = gameMinutes(), left = t.by - m, late = left < 0;
      ot.textContent = (late ? "LATE  " : "") + hhmm(m) + (late ? "" : "  ·  " + Math.floor(left) + " min left"); ot.classList.toggle("late", late);
      if (late && !q.ctx.late) { q.ctx.late = true; say(t.st.lateSay || "You're late. That will be remembered.", 4); }
    }
    if (interior.active) return;
    if (inCar) { if (d < 22 && !(q.hintT > clock)) { q.hintT = clock + 8; say("Park up and walk to the marker.", 3); } return; }
    if (d < t.r && player.placed) { q.target = null; if (ot) { ot.textContent = ""; ot.classList.remove("late"); } storyTick_done(() => Q.cur === q && Q.next()); }
  };
  const tickWas = window.storyTick;
  window.storyTick = function (dt) { tickWas.apply(this, arguments); try { Q.tick(dt); } catch (e) { console.warn("[Quest] tick:", e); } };

  console.log("[Quest] " + Q.version + " · missions in the world");
})();
