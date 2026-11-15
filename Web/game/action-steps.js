// Action steps for the mission engine (quest.js): the kinds of play a mission can ask for besides "go there" and "talk".
//
//   { chase: { who, text, hint, secs, speed, lead, caught } }   someone bolts; catch him on foot (or cut him off in a car) before he gets
//                                                               away or the time runs out. who is a key in def.people; if that person is
//                                                               already standing there (the step before brought him), he is the one who runs.
//   { tail: { who, to: place, text, hint, near, far } }         follow someone through the streets without being seen: too close while
//                                                               they look back and they spot you, too far for too long and you lose them.
//   { drive: { to: place, secs, text, hint, vehicle, cargo, smooth, label } }
//                                                               a timed drive. vehicle: a kind to hand over (the ice truck); cargo: hard
//                                                               knocks spoil the load; smooth: a passenger who hates harsh driving.
//
// Any of them can fail the mission: the reason goes on screen and missionflow.js offers the retry from the checkpoint.
// The HUD is one small panel at the top of the screen (#qact): what to do, a number, a bar.
// Console: questAction.status(); questAction.test("chase" | "tail" | "drive").
(function () {
  "use strict";
  const Q = window.quest;
  if (!Q) { console.warn("[QuestAction] no mission engine"); return; }
  const QA = window.questAction = { version: "1.0.0", cur: null };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

  // ---- the HUD ------------------------------------------------------------------------------------------------------------------------------
  const css = document.createElement("style");
  css.textContent = `
  #qact { position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 26; min-width: 260px; max-width: 70vw; padding: 9px 18px 10px; pointer-events: none;
    background: linear-gradient(180deg, rgba(12,14,18,.78), rgba(12,14,18,.6)); border-bottom: 2px solid #f2c230; font-family: var(--ui); color: #fff; text-align: center; opacity: 0; transition: opacity .25s ease; }
  #qact.on { opacity: 1; }
  #qact .a { font: 700 13px var(--ui); letter-spacing: .14em; text-transform: uppercase; color: #f2c230; }
  #qact .b { font: 800 22px var(--ui); margin-top: 2px; font-variant-numeric: tabular-nums; }
  #qact .b.warn { color: #ff7a6b; }
  #qact .c { height: 5px; margin-top: 7px; background: rgba(255,255,255,.16); border-radius: 3px; overflow: hidden; }
  #qact .c i { display: block; height: 100%; background: #f2c230; transition: width .15s linear; }
  #qact .c i.bad { background: #e0453a; }
  #qact .d { font: 500 12px var(--ui); color: rgba(255,255,255,.75); margin-top: 5px; }
  `;
  document.head.appendChild(css);
  function hud(a, b, bar, opts) {
    let e = document.getElementById("qact"); if (!e) { e = document.createElement("div"); e.id = "qact"; document.body.appendChild(e); }
    opts = opts || {};
    e.innerHTML = "<div class='a'>" + esc(a) + "</div><div class='b" + (opts.warn ? " warn" : "") + "'>" + esc(b) + "</div>" +
      (bar !== null && bar !== undefined ? "<div class='c'><i class='" + (opts.bad ? "bad" : "") + "' style='width:" + Math.round(Math.max(0, Math.min(1, bar)) * 100) + "%'></i></div>" : "") +
      (opts.note ? "<div class='d'>" + esc(opts.note) + "</div>" : "");
    e.classList.add("on");
  }
  function hudOff() { const e = document.getElementById("qact"); if (e) e.classList.remove("on"); }

  // ---- shared ---------------------------------------------------------------------------------------------------------------------------------
  function person(def, key) { return (def.people || {})[key] || { name: key || "him" }; }
  function figure(d, x, z) {
    if (typeof pplLib !== "object" || !pplLib.ready || !pplLib.ready.length || typeof pplFigure !== "function") return null;
    const want = d.look || (Q.looks && Q.looks[d.name]);
    const pool = pplLib.ready.filter(p => !p.story);
    const e = (want && pplLib.ready.find(p => p.name === want)) || pool.filter(p => !!p.female === !!d.female)[(Math.random() * 6) | 0] || pool[0];
    if (!e) return null;
    const h = d.h || 1, f = pplFigure(e, h);
    const p = Object.assign({ moving: true }, f, { x: x, z: z, y: world.surfaceY(x, z), yaw: 0, sp: 1.5, state: "quest", t: 0, hp: 100, h: h, said: 0, idleIn: 999, qa: true });
    p.holder.position.set(p.x, p.y, p.z); scene.add(p.holder); pedPlay(p, "idle", 0);
    peds.list.push(p);
    return p;
  }
  function blipOn(x, z, label, col) { storyClearBlips(); const b = storyBlip(x, z, label, { col: col || "#e0453a", noRoute: true }); return b; }
  function blipMove(b, x, z) { if (!b) return; b.x = x; b.z = z; if (b.beam) b.beam.position.set(x, world.surfaceY(x, z), z); }
  function stop() {
    const c = QA.cur; QA.cur = null; hudOff();
    if (c && c.p && peds.list.indexOf(c.p) >= 0 && c.p.state !== "dead") { c.p.state = "walk"; c.p.qa = false; try { pedSet(c.p, "wander"); c.p.wh = c.p.yaw; } catch (e) { /* gone */ } }
  }
  function fail(why) {
    const q = Q.cur, c = QA.cur; stop();
    if (q) { Q.cur = null; try { actorsClear("quest"); } catch (e) { /* none */ } storyClearBlips(); storyClearObjective(); }
    say(why, 5);
    if (q && q.done) { const ctx = Object.assign(q.ctx || {}, { failed: true, rating: 1, why: why }); try { q.done(ctx); } catch (e) { console.warn("[QuestAction] fail:", e); } }
    return c;
  }
  function pass(text) { const c = QA.cur, next = c && c.next; stop(); if (text) say(text, 4); storyTick_done(() => next && next()); }
  const at = () => (drive.car ? drive.car.pos : player.pos);
  const prevAbort = Q.handlers.abort;
  Q.handlers.abort = function (q) { stop(); if (prevAbort) try { prevAbort(q); } catch (e) { /* quiet */ } };

  // ---- chase ------------------------------------------------------------------------------------------------------------------------------------
  Q.handlers.chase = function (o, ctx, next, q) {
    const d = person(q.def, o.who), name = (d.name || "him").split(",")[0];
    let x, z;
    if (q.actor && (!o.who || q.actor.questKey === o.who) && isFinite(q.actor.x)) { x = q.actor.x; z = q.actor.z; q.actor.gone = true; q.actor = null; }
    else { const a = Math.random() * Math.PI * 2, r = o.lead || 10; x = player.pos.x + Math.sin(a) * r; z = player.pos.z + Math.cos(a) * r; }
    if (typeof insideBuilding === "function" && insideBuilding(x, z, 0.4)) { x = player.pos.x + 6; z = player.pos.z; }
    const p = figure(d, x, z);
    if (!p) { next(); return; }
    p.yaw = Math.atan2(x - player.pos.x, z - player.pos.z);
    pedPlay(p, "run", 0.15, 1);
    QA.cur = { kind: "chase", o: o, p: p, next: next, name: name, t: 0, secs: o.secs || 75, speed: o.speed || 4.3, b: blipOn(x, z, name), wob: 0 };
    storyObjective(o.text || ("Catch " + name), o.hint || "Run him down (hold Shift / LB to sprint). Don't lose him.");
    try { adrenalineRush(20); } catch (e) { /* older build */ }
    if (o.shout !== false) say(o.shout || (name + " sees you coming, and runs."), 3);
  };
  function chaseTick(c, dt) {
    const p = c.p, me = at();
    if (peds.list.indexOf(p) < 0 || p.state === "dead") { fail(c.name + " is gone."); return; }
    c.t += dt;
    const dx = p.x - me.x, dz = p.z - me.z, dist = Math.hypot(dx, dz) || 0.01;
    if (dist < (drive.car ? 3.6 : 2.1)) {
      p.state = "hands"; pedPlay(p, "hands", 0.2); p.yaw = Math.atan2(-dx, -dz);
      c.p = null; const n = c.name; pass(c.o.caught || ("You've got " + n + "."));
      p.state = "quest"; return;
    }
    if (dist > (c.o.escape || 95)) { fail("You lost " + c.name + "."); return; }
    if (c.t > c.secs) { fail(c.name + " got away."); return; }
    // he tires: flat out for twenty seconds, then he flags
    const tired = c.t > 20 ? Math.max(0.8, 1 - (c.t - 20) * 0.01) : 1;
    c.wob += dt * (0.8 + Math.random() * 0.4);
    const ax = dx / dist + Math.sin(c.wob) * 0.35, az = dz / dist + Math.cos(c.wob * 0.7) * 0.35;
    pedFree(p, dt, c.speed * tired, ax, az);
    p.y = world.surfaceY(p.x, p.z); p.holder.position.set(p.x, p.y, p.z); p.holder.rotation.y = p.yaw;
    if (p.clip !== "run") pedPlay(p, "run", 0.2, 1);
    blipMove(c.b, p.x, p.z);
    hud("Catch " + c.name, Math.round(dist) + " m", 1 - Math.min(1, dist / (c.o.escape || 95)), { warn: c.secs - c.t < 15, note: mmss(c.secs - c.t) + " before he's gone" });
  }

  // ---- tail ---------------------------------------------------------------------------------------------------------------------------------------
  Q.handlers.tail = function (o, ctx, next, q) {
    const d = person(q.def, o.who), name = (d.name || "them").split(",")[0];
    let x, z;
    if (q.actor && (!o.who || q.actor.questKey === o.who) && isFinite(q.actor.x)) { x = q.actor.x; z = q.actor.z; q.actor.gone = true; q.actor = null; }
    else { const a = (player.yaw || 0) + Math.PI; x = player.pos.x + Math.sin(a) * 18; z = player.pos.z + Math.cos(a) * 18; }
    // { away: metres }: somewhere quiet that far off along the footways, in whichever direction has one
    const route = (tx, tz) => { try { const ids = pedNetRoute(x, z, tx, tz); if (ids && ids.length > 1) return ids.map(i => [pedNet.x[i], pedNet.z[i]]); } catch (e) { /* no footways */ } return null; };
    const lenOf = pth => pth.reduce((a, p, i) => i ? a + Math.hypot(p[0] - pth[i - 1][0], p[1] - pth[i - 1][1]) : 0, 0);
    let to = null, path = null;
    if (o.to && o.to.away) {
      // eight directions; keep the walk whose length is nearest a stroll of that distance (the footways can wind a long way round)
      const want = o.to.away * 1.25; let best = null;
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + Math.random() * 0.3, c = Q.place({ at: [x + Math.sin(a) * o.to.away, z + Math.cos(a) * o.to.away] });
        if (Math.hypot(c.x - x, c.z - z) < o.to.away * 0.5) continue;
        const pth = route(c.x, c.z); if (!pth) continue;
        const L = lenOf(pth), score = Math.abs(L - want);
        if (!best || score < best.score) best = { score: score, to: c, path: pth };
      }
      if (best) { to = best.to; path = best.path; }
      else to = { x: x + o.to.away, z: z, label: "" };
    } else { to = Q.place(o.to); path = route(to.x, to.z); }
    if (!path) path = [[x, z], [to.x, to.z]];
    // never a walk of more than a few minutes
    const cap = (o.to && o.to.away ? o.to.away * 2 : 600);
    for (let i = 1, L = 0; i < path.length; i++) { L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); if (L > cap) { path.length = i + 1; to = { x: path[i][0], z: path[i][1] }; break; } }
    path.push([to.x, to.z]);
    const p = figure(d, path[0][0], path[0][1]);
    if (!p) { next(); return; }
    pedPlay(p, "walk", 0.2, 1);
    QA.cur = { kind: "tail", o: o, p: p, next: next, name: name, path: path, i: 1, sus: 0, lost: 0, look: 0, lookIn: 7 + Math.random() * 5, b: blipOn(p.x, p.z, name, "#4aa3ff"), female: !!d.female };
    storyObjective(o.text || ("Follow " + name), o.hint || "Stay back. When they stop and look round, don't be standing in the open behind them.");
  }
  function seesMe(p, me) {
    const dx = me.x - p.x, dz = me.z - p.z, dist = Math.hypot(dx, dz);
    if (dist > 22) return 0;
    let dy = Math.atan2(dx, dz) - p.yaw; dy = Math.abs(Math.atan2(Math.sin(dy), Math.cos(dy)));
    if (dy > 1.1) return 0;
    if (typeof pedLineClear === "function" && !pedLineClear(p, me)) return 0;
    return 1 - dist / 22;
  }
  function tailTick(c, dt) {
    const p = c.p, me = at();
    if (peds.list.indexOf(p) < 0 || p.state === "dead") { fail("You lost " + c.name + "."); return; }
    const dist = Math.hypot(p.x - me.x, p.z - me.z), they = c.female ? "she" : "he";
    // walking the route, stopping now and then to look back
    if (c.look > 0) {
      c.look -= dt;
      let dy = Math.atan2(me.x - p.x, me.z - p.z) + 0.6 * Math.sin(c.look * 2) - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * Math.min(1, dt * 3);
      c.sus += seesMe(p, me) * dt * 0.75;
      if (p.clip !== "idle") pedPlay(p, "idle", 0.25);
      if (c.look <= 0) { c.lookIn = 6 + Math.random() * 8; pedPlay(p, "walk", 0.3, 1); }
    } else {
      c.lookIn -= dt;
      if (c.lookIn <= 0) c.look = 1.6 + Math.random();
      const w = c.path[c.i];
      if (!w) { pass(c.o.arrived || (c.name + " stops. This is the place.")); return; }
      const dx = w[0] - p.x, dz = w[1] - p.z, dd = Math.hypot(dx, dz);
      if (dd < 0.8) c.i++;
      else { const sp = Math.min(dd, 1.45 * dt); let dy = Math.atan2(dx, dz) - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * Math.min(1, dt * 6); p.x += dx / dd * sp; p.z += dz / dd * sp; }
      if (p.clip !== "walk") pedPlay(p, "walk", 0.25, 1);
    }
    if (dist < (c.o.near || 6)) c.sus += dt * 0.3;
    else c.sus = Math.max(0, c.sus - dt * 0.03);
    if (drive.car && dist < 30) c.sus += dt * 0.15;                               // a car crawling behind someone is noticed
    if (dist > (c.o.far || 55)) c.lost += dt; else c.lost = Math.max(0, c.lost - dt * 2);
    p.y = world.surfaceY(p.x, p.z); p.holder.position.set(p.x, p.y, p.z); p.holder.rotation.y = p.yaw;
    blipMove(c.b, p.x, p.z);
    if (c.sus >= 1) { fail(c.name + " spotted you."); return; }
    if (c.lost > 8) { fail("You lost " + c.name + "."); return; }
    const state = c.look > 0 ? (they[0].toUpperCase() + they.slice(1) + "'s looking back") : c.lost > 0 ? "Losing " + (c.female ? "her" : "him") + " · " + Math.ceil(8 - c.lost) + " s" : Math.round(dist) + " m";
    hud("Follow " + c.name, state, c.sus, { bad: true, warn: c.look > 0 || c.lost > 0, note: "Suspicion" });
  }

  // ---- drive --------------------------------------------------------------------------------------------------------------------------------------
  Q.handlers.drive = function (o, ctx, next, q) {
    const to = Q.place(o.to);
    QA.cur = { kind: "drive", o: o, next: next, to: to, t: 0, secs: o.secs || 150, started: false, out: 0, cargo: 1, comfort: 1, lastV: null, b: null, label: o.label || to.label, ctx: ctx };
    if (o.vehicle && !drive.car) { try { if (typeof cheatSpawn === "function") cheatSpawn(o.vehicle); } catch (e) { console.warn("[QuestAction] vehicle:", e); } }
    storyClearBlips(); QA.cur.b = storyBlip(to.x, to.z, QA.cur.label);
    storyObjective(o.text || ("Drive to " + QA.cur.label), o.hint || "The clock starts when you're behind the wheel.");
  };
  function driveTick(c, dt) {
    const car = drive.car, o = c.o;
    if (!car) {
      if (!c.started) { hud(o.label ? "Get a car" : "Get in a car", "The clock starts at the wheel", null); return; }
      c.out += dt;
      if (c.out > 20) { fail("You left the car."); return; }
      hud("Back in the car", Math.ceil(20 - c.out) + " s", 1 - c.out / 20, { bad: true, warn: true });
      return;
    }
    c.started = true; c.out = 0; c.t += dt;
    const v = car.speed || 0, me = car.pos, dist = Math.hypot(me.x - c.to.x, me.z - c.to.z);
    if (c.lastV !== null) {
      const acc = (v - c.lastV) / Math.max(dt, 1e-3);
      if (o.cargo && c.lastV - v > 5.5 * Math.max(1, dt * 4)) { c.cargo -= 0.18 * Math.min(3, (c.lastV - v) / 5.5); say(o.cargoHit || "Something in the back shifts. Hard.", 2); }
      if (o.smooth) { const harsh = Math.max(0, Math.abs(acc) - 4.5) * 0.02 + Math.max(0, Math.abs(v) - 19) * 0.006; c.comfort -= harsh * dt * 4; if (c.lastV - v > 5.5) c.comfort -= 0.15; }
    }
    c.lastV = v;
    if (o.cargo && c.cargo <= 0) { fail(o.cargoFail || "The load is ruined."); return; }
    if (o.smooth && c.comfort <= 0) { fail(o.smoothFail || "Your passenger has had enough of your driving."); return; }
    if (c.t > c.secs) { fail(o.lateFail || "Too late."); return; }
    if (dist < (o.radius || 14) && Math.abs(v) < 3) { pass(o.done || "Made it."); return; }
    const left = c.secs - c.t;
    const bar = o.cargo ? c.cargo : o.smooth ? c.comfort : left / c.secs;
    hud(o.label || c.label || "Drive", mmss(left) + "  ·  " + (dist > 1000 ? (dist / 1000).toFixed(1) + " km" : Math.round(dist) + " m"), bar,
      { warn: left < 20, bad: (o.cargo && c.cargo < 0.4) || (o.smooth && c.comfort < 0.4), note: o.cargo ? "Load" : o.smooth ? "Passenger comfort" : (dist < 40 ? "Stop at the marker" : "") });
  }

  // ---- the tick -----------------------------------------------------------------------------------------------------------------------------------
  QA.tick = function (dt) {
    const c = QA.cur;
    if (!c) return;
    if (!Q.cur || (typeof cut === "object" && cut.active) || (window.career && career.menuState && career.menuState.on)) { if (!Q.cur) stop(); return; }
    if (c.kind === "chase") chaseTick(c, dt);
    else if (c.kind === "tail") tailTick(c, dt);
    else if (c.kind === "drive") driveTick(c, dt);
  };
  const tickWas = window.storyTick;
  window.storyTick = function (dt) { tickWas.apply(this, arguments); try { QA.tick(dt); } catch (e) { console.warn("[QuestAction] tick:", e); } };
  QA.status = () => { const c = QA.cur; return c ? { kind: c.kind, t: c.t, sus: c.sus, lost: c.lost, cargo: c.cargo, comfort: c.comfort, at: c.p ? [c.p.x, c.p.z] : null, i: c.i, n: c.path ? c.path.length : 0 } : null; };
  QA.test = function (kind) {
    const steps = kind === "tail" ? [{ tail: { who: "x", to: { at: [player.pos.x + 60, player.pos.z + 40] } } }] : kind === "drive" ? [{ drive: { to: { at: [player.pos.x + 200, player.pos.z] }, secs: 60, cargo: true } }] : [{ chase: { who: "x" } }];
    return Q.run({ id: "test:" + kind, title: "Test " + kind, people: { x: { name: "Test runner" } }, steps: steps }, c => console.log("[QuestAction] test done", c && c.failed ? "failed: " + c.why : "passed"));
  };
  console.log("[QuestAction] " + QA.version + " · chase, tail, timed drives");
})();
