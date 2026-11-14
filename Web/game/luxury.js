// Watches, fragrances and the small expensive things: owning them, wearing them, and what people make of it.
//
//   T (hold)           raise the wrist: the watch, running, at the game's time. Arrows change watch. Gamepad: hold R3.
//   I                  his effects: put on a watch, spray a fragrance (Enter again adds a spray), wear the rest. Gamepad: L3.
//   Suit Select        every branch has a Timepieces counter and a Parfumerie, either side of the way in. Chemists sell body sprays.
//
// A worn fragrance hangs round him as an aura in its own colour and trails behind him as he walks (its sillage), fading over
// its hours. People inside it react, as they do to the watch: kindly when it suits the place and the hour, badly when he has
// drowned himself in it. Where they know his rank (the office, the family's table) anything far above it reads as trying too
// hard: "Who do you think you are?" Rising in rank brings gifts (luxury-data.js GIFTS) and room to wear better things.
//
// API (window.luxury), for missions and the rank systems:
//   luxury.rank("yakuza", n)           tell it his rank in the family (1 upward); gifts follow. SOTI rank is read from standing.
//   luxury.gift(id, from, text)        hand him something from the catalogue
//   luxury.impression(ctx)             { score -1..1, tryHard, tags, watch, scent } for "office" | "street" | "commute" | "night" | "formal" | "date" | "yakuza"
//   luxury.judge(ctx, { who })         the same, said aloud by `who` and counted towards respect; returns { score, tryHard, line, respect }
//   luxury.setContext(ctx | null)      a mission says where he is (a boardroom is "formal", the Oyabun's table "yakuza")
//   luxury.wearing()                   { watch, scent: { f, sprays, eff }, items }
//   events on window: "salaryman:luxury:gift", "salaryman:luxury:worn", "salaryman:luxury:judged"; it listens for "salaryman:rank" { track, index }
// Console: luxury.grant("all"), luxury.status(). Cheat LUXURY (dial 5558824): ¥50,000,000 to shop with. Off switch: ?luxury=0.
(function () {
  "use strict";
  if (!window.LUX_DATA || !window.LuxWatch) { console.warn("[Konto] luxury: the catalogue is not in this build"); return; }
  if (/[?&]luxury=0\b/.test(location.search)) { console.log("[Konto] luxury turned off"); return; }
  const D = LUX_DATA, byId = {};
  D.watches.concat(D.fragrances, D.items).forEach(x => { byId[x.id] = x; });
  const L = window.luxury = { version: "1.0.0", data: D, byId: byId, ctx: null };
  const fresh = () => ({ v: 1, owned: {}, watch: null, items: {}, scent: null, gifts: {}, yakuza: 0, seen: {}, day: { n: -1, earn: 0 }, work: null });
  let st = fresh();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const pick = a => a[(Math.random() * a.length) | 0];
  const now = () => (typeof clock === "number" ? clock : performance.now() / 1000);
  const mins = () => { try { return gameMinutes(); } catch (e) { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); } };
  const yen = n => { try { return yenText(n); } catch (e) { return "¥" + n.toLocaleString(); } };
  const tell = (t, s) => { try { say(t, s || 3); } catch (e) { /* no notice line */ } };
  const fire = (name, detail) => { try { window.dispatchEvent(new CustomEvent("salaryman:luxury:" + name, { detail: detail })); } catch (e) { /* old browsers */ } };
  const std = () => window.standing || null;
  const rankIndex = () => { try { return std() ? std().respect.rankIndex() : 0; } catch (e) { return 0; } };
  const RANK_PAY = ["a job seeker's", "an agent's", "a floor manager's", "a section chief's", "a department head's", "a director's", "a managing director's", "the president's"];
  const RANK_A = ["a job seeker", "an agent on 3F", "a floor manager", "a section chief", "a department head", "a director", "a managing director", "the president"];

  // ---- what he has on -----------------------------------------------------------------------------------------------------------------------
  L.owns = id => !!st.owned[id];
  L.watch = () => (st.watch && byId[st.watch]) || null;
  L.items = () => Object.keys(st.items).filter(s => st.items[s] && byId[st.items[s]]).map(s => byId[st.items[s]]);
  L.scent = () => {
    const s = st.scent, f = s && byId[s.id]; if (!f) return null;
    const left = 1 - s.age / (f.hours * 60); if (left <= 0) return null;
    return { f: f, sprays: s.sprays, eff: Math.sqrt(left), left: left * f.hours };
  };
  const isCloud = sc => sc.eff > 0.5 && sc.sprays >= (sc.f.loud >= 0.8 ? 5 : 6);
  const sillage = sc => (1.0 + 4.5 * sc.f.proj) * (0.6 + 0.4 * sc.eff) * Math.min(1.8, 0.55 + 0.15 * sc.sprays);
  L.wearing = () => ({ watch: L.watch(), scent: L.scent(), items: L.items() });

  L.wearWatch = function (id, quiet) {
    if (id && !st.owned[id]) return false;
    st.watch = id || null;
    try { if (id && bag.watchOn) { bag.watchOn = false; } if (typeof seikoWear === "function") seikoWear(); } catch (e) { /* no wrist yet */ }
    if (!quiet) tell(id ? byId[id].house + " " + byId[id].name + " on." : "Watch off.", 2.5);
    fire("worn", { kind: "watch", id: id || null });
    return true;
  };
  L.wearItem = function (id, on, quiet) {
    const it = byId[id]; if (!it || it.kind !== "item" || !st.owned[id]) return false;
    if (on === undefined) on = st.items[it.slot] !== id;
    st.items[it.slot] = on ? id : null;
    if (!quiet) tell(it.name + (on ? ": on you." : ": put away."), 2.5);
    fire("worn", { kind: "item", id: id, on: !!on });
    return true;
  };
  L.spray = function (id, n, quiet) {
    const f = byId[id]; if (!f || f.kind !== "frag" || !st.owned[id]) return false;
    n = n || 1;
    if (st.scent && st.scent.id === id && st.scent.age < 45) st.scent.sprays = Math.min(12, st.scent.sprays + n);
    else st.scent = { id: id, sprays: n, age: 0 };
    const k = st.scent.sprays;
    puff(f);
    if (!quiet) tell(f.name + ": " + k + (k === 1 ? " spray." : " sprays.") + (k >= 8 ? " You can taste it." : k >= 6 ? " That is a lot." : k === 4 ? " Plenty." : ""), 2.6);
    fire("worn", { kind: "frag", id: id, sprays: k });
    return true;
  };
  L.wash = function (quiet) { if (st.scent && !quiet) tell("Washed off.", 2); st.scent = null; };
  L.give = function (id) { if (!byId[id]) return false; st.owned[id] = 1; return true; };

  // ---- how it lands ---------------------------------------------------------------------------------------------------------------------------
  // What his rank lets him wear without comment, as a tier. The family lifts it too.
  function allow() {
    let a = [1, 3, 4, 5, 7, 8, 9, 10][Math.min(7, rankIndex())];
    if (st.yakuza) a = Math.max(a, [0, 5, 7, 9, 10][Math.min(4, st.yakuza)]);
    return a;
  }
  L.allowance = allow;
  function context() {
    if (L.ctx) return L.ctx;
    try {
      if (interior.active && interior.shop && interior.shop.brand === "sotifloor") return "office";
      if (story.step === "c:floor" || story.step === "c:desk") return "office";
    } catch (e) { /* no story */ }
    const m = mins();
    if (m >= 19 * 60 || m < 5 * 60) return "night";
    if (m >= 6.5 * 60 && m < 9.5 * 60) return "commute";
    return "street";
  }
  L.context = context;
  L.setContext = c => { L.ctx = c || null; };
  function impression(ctx) {
    ctx = ctx || context();
    const a = allow(), w = L.watch(), sc = L.scent(), known = ctx === "office" || ctx === "yakuza" || ctx === "formal";
    const r = { ctx: ctx, score: 0, tags: [], allow: a, watch: w, scent: sc ? sc.f : null, sprays: sc ? sc.sprays : 0 };
    if (w) {
      const over = w.tier - a;
      if (known && over >= 2) { r.tags.push("watch-over"); r.score -= 0.2 + 0.1 * over; }
      else if (known && a >= 7 && w.tier <= 2) { r.tags.push("watch-humble"); r.score += 0.15; }
      else if (ctx === "yakuza" && w.tier <= 2 && !w.heart) { r.tags.push("weak"); r.score -= 0.2; }
      else r.score += 0.1 + w.tier * 0.035 * (ctx === "yakuza" ? 0.5 + w.flash : 1);
    } else if (ctx === "yakuza") { r.tags.push("weak"); r.score -= 0.15; }
    if (sc) {
      const f = sc.f, fit = f.fit[ctx] != null ? f.fit[ctx] : f.fit.street, over = f.tier - a - (f.loud >= 0.6 ? 0 : 3);
      r.fit = fit;
      if (isCloud(sc)) { r.tags.push("cloud"); r.score -= 0.5; }
      else if (known && over >= 2) { r.tags.push("scent-over"); r.score -= 0.25 + 0.06 * over; }
      else {
        r.score += fit * 0.45 * (0.4 + 0.6 * sc.eff);
        if (fit <= -0.3) r.tags.push("scent-wrong"); else if (fit >= 0.5) r.tags.push("scent-right");
        if (ctx === "yakuza" && f.type === "drugstore") r.tags.push("weak");
      }
    }
    for (const it of L.items()) {
      if (known && it.tier - a >= 3 && it.flash >= 0.6) { r.tags.push("flash-over"); r.score -= 0.15; }
      else r.score += it.tier * 0.005;
    }
    r.tryHard = r.tags.some(t => t === "watch-over" || t === "scent-over" || t === "flash-over");
    r.score = Math.round(clamp(r.score, -1, 1) * 100) / 100;
    return r;
  }
  L.impression = impression;
  function fill(line, r) {
    const i = Math.min(7, rankIndex());
    return line.replace("{w}", r.watch ? r.watch.house : "watch").replace("{f}", r.scent ? r.scent.name.replace(/ (Eau de .*|Body Spray|Parfum Cologne|Le Parfum|Original Cologne)$/, "") : "that").replace("{fh}", r.scent ? r.scent.house : "")
      .replace("{name}", "Seiko").replace("{floor}", i <= 1 ? "third floor" : "floor").replace("{rank}", RANK_PAY[i]);
  }
  function lineFor(r) {
    const X = D.lines, has = t => r.tags.indexOf(t) >= 0;
    if (r.ctx === "yakuza") return fill(pick(r.tryHard ? X.yakuzaTry : has("weak") || r.score < 0 ? X.yakuzaWeak : X.yakuzaGood), r);
    if (r.ctx === "night" || r.ctx === "date") return fill(pick(has("cloud") ? X.scentCloud : r.score >= 0.15 ? X.nightGood : X.nightBad), r);
    if (has("cloud")) return fill(pick(r.ctx === "office" || r.ctx === "formal" ? X.workCloud : X.scentCloud), r);
    if (has("watch-over") && (!has("scent-over") || Math.random() < 0.5)) return fill(pick(X.workWatchTry), r);
    if (r.tryHard) return fill(pick(X.workTry), r);
    if (has("watch-humble")) return fill(pick(X.workHumble), r);
    if (r.score >= 0.2) return fill(pick(X.workGood), r);
    if (has("scent-wrong")) return fill(pick(X.scentBad), r);
    return "";
  }
  // Said aloud, and counted. opts: { who, quiet (no line), apply: false (do not touch respect), scale }
  L.judge = function (ctx, opts) {
    opts = opts || {};
    const r = impression(ctx), line = lineFor(r);
    r.line = line; r.respect = 0;
    if (line && !opts.quiet) tell((opts.who ? opts.who + ": " : "") + "“" + line + "”", 4.5);
    if (opts.apply !== false && std() && Math.abs(r.score) >= 0.12) {
      r.respect = Math.round(r.score * 3 * (opts.scale || 1) * 10) / 10;
      try { std().earn(r.respect, r.tryHard ? "Tried too hard" : r.tags.indexOf("cloud") >= 0 ? "Wearing far too much" : r.score > 0 ? "Looked the part" : "Made a poor impression"); } catch (e) { /* no standing */ }
    }
    fire("judged", { ctx: r.ctx, score: r.score, tryHard: r.tryHard, tags: r.tags, respect: r.respect });
    return r;
  };

  // ---- free to act? ------------------------------------------------------------------------------------------------------------------------------
  function playing() { try { return player.placed && title.started && !paused && !cut.active; } catch (e) { return false; } }
  function onFoot() {
    try {
      return playing() && player.mode === "walk" && !drive.car && !drive.train && !flight.active && !chute.active && !interior.active && !phone.open && !heist.stage && !service.active && !shops.inside;
    } catch (e) { return false; }
  }
  function handsFree() {
    try {
      if (!playing() || phone.open || nav.mapOpen || shops.inside || drive.car || flight.active || chute.active || heist.stage) return false;
      if (interior.active && (interior.modal || interior.pod || interior.card || interior.lift)) return false;
      if (window.career && ((career.menuState && career.menuState.on) || (career.desk && career.desk.on))) return false;
      return player.mode === "walk";
    } catch (e) { return false; }
  }

  // ---- the day's ledger: strangers can only move his name so far in one day ------------------------------------------------------------------------
  function earn(delta, label) {
    const day = (() => { try { return (story.career && story.career.day) || Math.floor(now() * TIME.rate / 1440); } catch (e) { return 0; } })();
    if (st.day.n !== day) st.day = { n: day, earn: 0 };
    if (Math.abs(st.day.earn + delta) > 4) return;
    st.day.earn += delta;
    try { if (std()) std().earn(delta, label); } catch (e) { /* no standing */ }
  }

  // ---- people passing through his air ---------------------------------------------------------------------------------------------------------------
  const A = { next: 0 };
  function speaker(p) { try { const l = window.realism && realism.label && realism.label(p); if (l) return String(l).split(/[·,(]/)[0].trim(); } catch (e) { /* none */ } return p.commuter ? "Commuter" : "Passer-by"; }
  function react(p, pose) {
    if (!std() || p.state === "greet" || p.state === "ask" || p.state === "follow") return;
    try { p._prev = p.state; p.state = "greet"; p.t = 0; p._greetFor = 1.7; p._greetEnd = null; p._faceSeiko = true; if (p.icon) p.icon.visible = false; pedPlay(p, pose, 0.3); } catch (e) { /* they walk on */ }
  }
  function ambient() {
    if (!onFoot()) return;
    const t = now(); if (t < A.next) return;
    const sc = L.scent(), w = L.watch(); if (!sc && !w) return;
    const rad = sc ? sillage(sc) : 0, ctx = context(), X = D.lines;
    let honour = 0; try { honour = std() ? std().honor.value : 0; } catch (e) { /* none */ }
    for (const p of peds.list) {
      if (p._luxSeen || !(p.state === "walk" || p.state === "commute" || p.state === "wander" || p.state === "idle")) continue;
      const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); if (d > Math.max(rad, 3.2)) continue;
      p._luxSeen = true;
      if (Math.random() > 0.5) continue;
      const r = { watch: w, scent: sc && sc.f }, opts = [];
      if (sc && d <= rad) {
        const f = sc.f, fit = f.fit[ctx] != null ? f.fit[ctx] : f.fit.street;
        if (isCloud(sc)) opts.push([X.scentCloud, -0.5, "Wearing far too much", "folded", 3]);
        else if (f.type === "drugstore" && f.loud >= 0.6) opts.push([X.scentCheap, -0.3, "Smelled like a schoolboy", "folded", 2]);
        else if (f.common && Math.random() < 0.5) opts.push([X.scentCommon, 0, "", "nod", 1]);
        else if (f.gentle && fit > 0.4) opts.push([X.scentGentle, 0.5, "Left a calm behind him", "bow", 2]);
        else if (fit >= 0.45) opts.push([X.scentGood, 0.4, "Turned a head", "nod", 2]);
        else if (fit <= -0.25) opts.push([X.scentBad, -0.3, "Wrong scent for the hour", "folded", 2]);
      }
      if (w && d <= 3.2) {
        if (w.heart) { if (Math.random() < 0.4) opts.push([X.watchHeart, 0.3, "An honest watch", "nod", 1]); }
        else if (w.tier >= 7 && w.flash >= 0.7 && honour < 0) opts.push([X.watchFlash, -0.2, "Flashed it about", "folded", 1]);
        else if (w.tier >= 4) opts.push([X.watchGood, 0.3, "Noticed the watch", "nod", 1]);
      }
      if (!opts.length && L.items().reduce((s, i) => s + i.tier, 0) >= 14) opts.push([X.polish, 0.2, "Looked the part", "nod", 1]);
      if (!opts.length) continue;
      const tot = opts.reduce((s, o) => s + o[4], 0); let k = Math.random() * tot, o = opts[0];
      for (const x of opts) { if ((k -= x[4]) <= 0) { o = x; break; } }
      tell(speaker(p) + ": “" + fill(pick(o[0]), r) + "”", 3.2);
      react(p, o[3]);
      if (o[1]) earn(o[1], o[2]);
      A.next = t + 14 + Math.random() * 16;
      return;
    }
  }
  const pedsTickWas = window.pedsTick;
  if (typeof pedsTickWas === "function") window.pedsTick = function (dt) {
    pedsTickWas(dt);
    try { if (peds.list) ambient(); } catch (e) { if (!A.warned) { A.warned = true; console.warn("[Konto] luxury people:", e); } }
  };

  // strangers bow more readily to a man who looks the part, and answer a greeting more warmly
  function hookStanding() {
    const S = std(); if (!S || S._lux) return; S._lux = true;
    const R = S.respect, bc = R.bowChance.bind(R), gr = R.greet.bind(R);
    R.bowChance = function (person) { let b = bc(person); try { b += clamp(impression("street").score, -0.3, 0.45) * 0.25; } catch (e) { /* as it was */ } return clamp(b, 0, 0.95); };
    R.greet = function (kind, person) { try { if (person && kind === "bow") person = Object.assign({}, person, { warmth: (person.warmth || 0) + clamp(impression().score, -0.4, 0.5) * 0.18 }); } catch (e) { /* as it was */ } return gr(kind, person); };
    try {
      S.honor.define("lux_gentle", { delta: 1, label: "Left a good impression", icon: "service", cooldown: 120 });
      S.honor.define("lux_flaunt", { delta: -1, label: "Looked down on someone", icon: "harass", cooldown: 90 });
      S.honor.on(ev => {
        if (!ev || !(ev.delta > 0) || !/^help_/.test(ev.id || "")) return;
        const sc = L.scent(), w = L.watch();
        if ((sc && !isCloud(sc) && (sc.f.gentle || (sc.f.loud <= 0.35 && sc.f.fit.street >= 0.4))) || (w && w.heart)) setTimeout(() => { try { S.deed("lux_gentle"); } catch (e) { /* none */ } }, 1800);
      });
      R.on(ev => { if (ev && ev.id === "antagonize") { const w = L.watch(); if (w && w.tier >= 7 && w.flash >= 0.6) setTimeout(() => { try { S.deed("lux_flaunt"); } catch (e) { /* none */ } }, 1500); } });
    } catch (e) { console.warn("[Konto] luxury honour:", e); }
  }

  // ---- the office: they know what he earns -------------------------------------------------------------------------------------------------------------
  function hookCareer() {
    const C = window.career; if (!C || !C.on || C._lux) return; C._lux = true;
    C.on("shift:start", d => {
      setTimeout(() => {
        if (!L.watch() && !L.scent() && !L.items().length) return;
        const r = L.judge("office", { who: null, quiet: true, scale: 0.8 }), line = lineFor(r);
        st.work = { day: d.day, score: r.score, tryHard: r.tryHard };
        if (line) tell((r.tryHard || r.tags.indexOf("cloud") >= 0 ? "Gondō" : "A colleague") + ": “" + line + "”", 5);
      }, 4200);
    });
    C.on("floor:resolved", d => {
      const wk = st.work; if (!wk || wk.day !== d.day) return;
      if (wk.tryHard) { earn(-0.4, "Nobody took him seriously"); setTimeout(() => tell("Someone, as you walk away: “" + fill(pick(D.lines.workTry), impression("office")) + "”", 4), 2500); }
      else if (d.good && wk.score > 0.25) earn(0.6, "Carried himself well");
    });
    C.on("ah:hangout", () => { setTimeout(() => { if (L.watch() || L.scent()) L.judge("night", { who: null, scale: 0.7 }); }, 1500); });
    C.on("promotion", () => { G.check = 0; });
  }

  // ---- gifts: what rising brings ------------------------------------------------------------------------------------------------------------------------
  const G = { queue: [], check: 0, busy: 0, el: null };
  L.gift = function (id, from, text) { const it = byId[id]; if (!it) return false; G.queue.push({ from: from || "A gift", items: [id], text: text || "" }); return true; };
  L.rank = function (track, n) {
    if (track === "yakuza") { st.yakuza = Math.max(0, n | 0); G.check = 0; }
    return allow();
  };
  window.addEventListener("salaryman:rank", e => { const d = e.detail || {}; if (d.track === "yakuza") L.rank("yakuza", d.index != null ? d.index : d.rank); else G.check = 0; });
  function giftTick() {
    const t = performance.now();
    if (t - G.check > 2000) {
      G.check = t;
      try { const y = story.flags && story.flags.yakuzaRank; if (typeof y === "number" && y > st.yakuza) st.yakuza = y; } catch (e) { /* no story */ }
      const due = (track, upto) => { for (let i = 1; i <= upto; i++) { const g = D.gifts[track][i], key = track + i; if (g && !st.gifts[key]) { st.gifts[key] = 1; G.queue.push(g); } } };
      let started = false; try { started = title.started && player.placed; } catch (e) { /* not yet */ }
      if (started) { due("soti", Math.min(7, rankIndex())); due("yakuza", Math.min(4, st.yakuza)); }
    }
    if (!G.queue.length || t < G.busy || !handsFree() || U.on) return;
    const g = G.queue.shift(), got = g.items.map(id => byId[id]).filter(Boolean);
    if (!got.length) return;
    got.forEach(it => {
      st.owned[it.id] = 1;
      if (it.kind === "watch" && !st.watch) L.wearWatch(it.id, true);
      if (it.kind === "item" && !st.items[it.slot]) st.items[it.slot] = it.id;
    });
    G.busy = t + 11000;
    giftCard(g, got);
    try { notify("Messages", g.from, g.text, 9); } catch (e) { /* no phone */ }
    fire("gift", { from: g.from, items: g.items });
    try { saveGame(null, true); } catch (e) { /* no save yet */ }
  }
  function giftCard(g, got) {
    css();
    if (!G.el) { G.el = document.createElement("div"); G.el.id = "luxgift"; document.body.appendChild(G.el); }
    G.el.innerHTML = "<canvas width='300' height='300'></canvas><div><i>A gift from " + esc(g.from) + "</i><b>" + got.map(x => esc(x.house + " " + x.name)).join("<br>") + "</b><span>" + esc(g.text) + "</span><em>" + (padOn() ? "L3" : "I") + " · your effects</em></div>";
    const cv = G.el.querySelector("canvas"); G.show = { it: got[0], cv: cv, until: performance.now() + 10500 };
    G.el.classList.add("on");
    setTimeout(() => { if (G.el) G.el.classList.remove("on"); }, 10500);
  }

  // ---- the aura and the sillage ------------------------------------------------------------------------------------------------------------------------
  const NA = 44, NT = 84, N = NA + NT;
  const FX = { pts: null, pos: null, col: null, size: null, seed: [], trail: [], head: 0, lastX: 0, lastZ: 0, t: 0, puff: 0 };
  function fxBuild() {
    if (FX.pts || typeof THREE === "undefined" || typeof scene === "undefined" || !scene) return;
    const geo = new THREE.BufferGeometry();
    FX.pos = new Float32Array(N * 3); FX.col = new Float32Array(N * 4); FX.size = new Float32Array(N);
    geo.setAttribute("position", new THREE.BufferAttribute(FX.pos, 3));
    geo.setAttribute("aCol", new THREE.BufferAttribute(FX.col, 4));
    geo.setAttribute("aSize", new THREE.BufferAttribute(FX.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending,
      vertexShader: "attribute vec4 aCol; attribute float aSize; varying vec4 vCol; uniform float uScale;\nvoid main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uScale / max(0.2, -mv.z), 0.0, 420.0); }",
      fragmentShader: "varying vec4 vCol;\nvoid main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; float a = smoothstep(1.0, 0.0, d); a = a * a * vCol.a; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb, a); }"
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 18; pts.visible = false; pts.userData.shDry = true;
    const v2 = new THREE.Vector2();
    pts.onBeforeRender = function (r, s, cam) {
      const rt = r.getRenderTarget(), h = rt ? rt.height : r.getDrawingBufferSize(v2).y;
      mat.uniforms.uScale.value = cam.isPerspectiveCamera ? h / (2 * Math.tan(cam.fov * Math.PI / 360)) : h * 0.05;
    };
    for (let i = 0; i < NA; i++) FX.seed.push({ a: Math.random() * 6.283, r: 0.22 + Math.random() * 0.4, y: 0.35 + Math.random() * 1.45, w: (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.5), ph: Math.random() * 6.283, k: Math.random() });
    for (let i = 0; i < NT; i++) FX.trail.push({ life: 0, age: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, k: 0, s: 1 });
    scene.add(pts); FX.pts = pts;
  }
  const lin = c => { const n = parseInt(c.slice(1), 16), f = v => Math.pow(v / 255, 2.2); return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)]; };
  function puff(f) { FX.puff = 1; FX.puffF = f; }
  function fxTick(dt) {
    fxBuild(); if (!FX.pts) return;
    const sc = L.scent();
    let show = false; try { show = !!sc && player.placed && title.started && !cut.active && player.mode === "walk" && !flight.active && !(window.career && career.desk && career.desk.on) && player.obj && player.obj.visible !== false; } catch (e) { show = false; }
    const anyTrail = FX.trail.some(p => p.age < p.life);
    if (!show && !anyTrail) { FX.pts.visible = false; return; }
    FX.pts.visible = true; FX.t += dt;
    const f = sc ? sc.f : FX.lastF, c1 = lin(f.col[0]), c2 = lin(f.col[1]); FX.lastF = f;
    const eff = sc ? sc.eff : 0, cloud = sc && isCloud(sc), amt = sc ? Math.min(1.7, 0.5 + 0.16 * sc.sprays) * (0.35 + 0.65 * f.proj) : 0;
    const px = player.pos.x, py = player.pos.y, pz = player.pos.z, P = FX.pos, C = FX.col, S = FX.size;
    FX.puff = Math.max(0, FX.puff - dt * 0.8);
    for (let i = 0; i < NA; i++) {
      const s = FX.seed[i], a = s.a + FX.t * s.w, wob = Math.sin(FX.t * 0.9 + s.ph), rr = s.r * (1 + 0.25 * wob) * (cloud ? 1.5 : 1) * (1 + FX.puff * 0.8);
      P[i * 3] = px + Math.cos(a) * rr; P[i * 3 + 1] = py + s.y + 0.08 * Math.sin(FX.t * 0.6 + s.ph * 2) + ((FX.t * 0.05 + s.k) % 1) * 0.25; P[i * 3 + 2] = pz + Math.sin(a) * rr;
      const k = s.k, al = show ? (0.05 + 0.075 * (0.5 + 0.5 * wob)) * eff * amt * (1 + FX.puff * 1.6) : 0;
      C[i * 4] = c1[0] + (c2[0] - c1[0]) * k; C[i * 4 + 1] = c1[1] + (c2[1] - c1[1]) * k; C[i * 4 + 2] = c1[2] + (c2[2] - c1[2]) * k; C[i * 4 + 3] = Math.min(0.5, al);
      S[i] = (0.55 + 0.5 * k) * (cloud ? 1.5 : 1);
    }
    // the trail: a breath of it left behind every half metre, drifting and thinning
    const moved = Math.hypot(px - FX.lastX, pz - FX.lastZ);
    if (show && moved > 40) { FX.lastX = px; FX.lastZ = pz; }
    else if (show && moved > 0.45) {
      FX.lastX = px; FX.lastZ = pz;
      const p = FX.trail[FX.head]; FX.head = (FX.head + 1) % NT;
      p.x = px + (Math.random() - 0.5) * 0.3; p.y = py + 0.7 + Math.random() * 0.8; p.z = pz + (Math.random() - 0.5) * 0.3;
      p.vx = (Math.random() - 0.5) * 0.12; p.vy = 0.03 + Math.random() * 0.06; p.vz = (Math.random() - 0.5) * 0.12;
      p.age = 0; p.life = (2.5 + 7 * f.proj) * (0.5 + 0.5 * eff) * Math.min(1.8, 0.6 + 0.14 * sc.sprays); p.k = Math.random(); p.s = amt * eff;
    }
    for (let j = 0; j < NT; j++) {
      const p = FX.trail[j], i = NA + j;
      if (p.age >= p.life) { C[i * 4 + 3] = 0; S[i] = 0; continue; }
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const u = p.age / p.life, k = p.k;
      P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
      C[i * 4] = c1[0] + (c2[0] - c1[0]) * k; C[i * 4 + 1] = c1[1] + (c2[1] - c1[1]) * k; C[i * 4 + 2] = c1[2] + (c2[2] - c1[2]) * k;
      C[i * 4 + 3] = Math.min(0.4, 0.13 * p.s * Math.pow(1 - u, 1.4) * Math.min(1, u * 8));
      S[i] = 0.7 + 1.5 * u;
    }
    const g = FX.pts.geometry; g.attributes.position.needsUpdate = true; g.attributes.aCol.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
  }

  // ---- time: the fragrance wears off with the game's clock ---------------------------------------------------------------------------------------------
  let lastMin = null;
  function wearTick() {
    const m = mins(); if (lastMin == null) { lastMin = m; return; }
    let d = m - lastMin; if (d < 0) d += 1440; lastMin = m;
    if (!st.scent || d <= 0) return;
    st.scent.age += d;
    const f = byId[st.scent.id];
    if (!f || st.scent.age >= f.hours * 60) { if (f && playing()) tell("Your " + f.name + " has faded.", 3); st.scent = null; }
  }

  // ---- the watch on his wrist, in the world --------------------------------------------------------------------------------------------------------------
  // (konto.html hangs a smartwatch on the left wrist with wornWatch/buildWatchWear; a luxury watch goes on the same way)
  function hookWrist() {
    if (typeof window.wornWatch !== "function" || typeof window.buildWatchWear !== "function" || hookWrist.done) return; hookWrist.done = true;
    const worn = window.wornWatch, build = window.buildWatchWear;
    window.wornWatch = function () { const o = worn.apply(this, arguments); if (o) { if (st.watch && !(typeof wear === "object" && wear.tryWatch)) st.watch = null; return o; } return st.watch ? "lux:" + st.watch : null; };
    window.buildWatchWear = function (id) {
      if (typeof id !== "string" || id.indexOf("lux:") !== 0) return build.apply(this, arguments);
      const w = byId[id.slice(4)]; if (!w) return null;
      const hand = findBone(/^hand.?l$/i), fore = findBone(/^forearm.?l$/i); if (!hand || !fore) return null;
      const f = wearFrame(), k = f.h / 1.74, hp = new THREE.Vector3(), fp = new THREE.Vector3(); hand.getWorldPosition(hp); fore.getWorldPosition(fp);
      const dir = hp.clone().sub(fp).normalize(), wr = hp.clone().lerp(fp, 0.2), objPos = new THREE.Vector3(); f.obj.getWorldPosition(objPos);
      const out = hp.clone().sub(objPos); out.y = 0; out.applyQuaternion(f.q.clone().invert()); out.set(Math.sign(out.x) || 1, 0, 0).applyQuaternion(f.q);
      const z = out.clone().sub(dir.clone().multiplyScalar(out.dot(dir))).normalize(), x = new THREE.Vector3().crossVectors(dir, z).normalize();
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, dir, z));
      const grp = new THREE.Group(), look = w.look, S = look.strap || {}, metalStrap = /oyster|jubilee|president|integrated/.test(S.type || "");
      const MC = { steel: 0xcfd4da, gold: 0xe6c260, rose: 0xe2a88c, titanium: 0x9da1a5, resin: 0x1c1d20, carbon: 0x2a2b2e, black: 0x2a2c30 };
      const caseC = MC[look.metal] || MC.steel, strapC = metalStrap ? (MC[S.metal || (look.metal === "gold" || look.metal === "rose" ? look.metal : "steel")]) : parseInt((S.c || "#222222").slice(1), 16);
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.0288 * k, 0.0288 * k, (metalStrap ? 0.02 : 0.018) * k, 22, 1, true), pbrMat(metalStrap ? "metal" : "paint", strapC, { roughness: metalStrap ? 0.3 : 0.75, metalness: metalStrap ? 0.9 : 0.05, side: THREE.DoubleSide }));
      grp.add(strap);
      // the face: this very watch, painted once
      const cv = document.createElement("canvas"); cv.width = cv.height = 256;
      LuxWatch.draw(cv.getContext("2d"), w, 128, 128, 104, { h: 10, m: 9, s: 36, date: 14, dow: 6 }, { strap: 1.05 });
      const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
      const boxy = look.shape === "tank" || look.shape === "digital" || look.shape === "tonneau", rad = (boxy ? 0.02 : 0.0205) * k, th = (look.shape === "tank" ? 0.007 : 0.011) * k;
      const body = boxy ? new THREE.Mesh(new THREE.BoxGeometry(rad * (look.shape === "tank" ? 1.5 : 1.8), rad * 2.1, th), pbrMat("metal", caseC, { roughness: 0.28, metalness: look.metal === "resin" ? 0.1 : 0.95 }))
        : new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, th, 28), pbrMat("metal", caseC, { roughness: 0.25, metalness: look.metal === "resin" ? 0.1 : 0.95 }));
      if (!boxy) body.rotation.x = Math.PI / 2;
      body.position.z = 0.0288 * k + th * 0.35; grp.add(body);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(rad * 2.5, rad * 2.5), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.18, metalness: 0.35 }));
      face.position.z = 0.0288 * k + th * 0.86 + 0.0004; grp.add(face);
      attachAt(hand, wr, q, grp);
      return grp;
    };
  }

  // ---- the wrist, raised -----------------------------------------------------------------------------------------------------------------------------------
  const WR = { k: 0, held: false, pad: false, cv: null, cap: null, clipOn: false };
  function gameTime() {
    const m = mins(), d = (() => { try { return (story.career && story.career.day) || 1; } catch (e) { return 1; } })();
    return { h: Math.floor(m / 60), m: m % 60, s: (performance.now() / 1000) % 60, date: (13 + d) % 30 + 1, dow: (5 + d) % 7 };
  }
  L.time = gameTime;
  function sleeve() {
    let id = ""; try { id = player.outfit || ""; } catch (e) { /* none */ }
    const items = st.items, cuff = items.cufflinks ? (items.cufflinks === "cuff_gold" ? "gold" : "silver") : null, ring = !!items.ring;
    if (/suit/.test(id)) return { sleeve: "suit", sleeveC: /black/.test(id) ? "#15171c" : /check/.test(id) ? "#3a4150" : "#2a2e37", cufflinks: cuff, ring: ring };
    if (/polo|tshirt/.test(id)) return { sleeve: "bare", ring: ring };
    const c = /blue/.test(id) ? "#5b7fb5" : /track/.test(id) ? "#22354f" : /village/.test(id) ? "#6f7361" : "#e9ecf0";
    return { sleeve: "shirt", sleeveC: c, ring: ring };
  }
  function wristDraw(dt) {
    const want = (WR.held || WR.pad) && handsFree() && !U.on;
    WR.k = clamp(WR.k + (want ? dt * 3.6 : -dt * 4.5), 0, 1);
    try {
      if (want && player.clips && player.clips.wristcheck && !interior.active && player.speed < 0.6) { player.forceClip = "wristcheck"; WR.clipOn = true; }
      else if (WR.clipOn) { if (player.forceClip === "wristcheck") player.forceClip = null; WR.clipOn = false; }
    } catch (e) { /* no body */ }
    if (WR.k <= 0) { if (WR.cv && WR.cv.style.display !== "none") { WR.cv.style.display = "none"; WR.cap.style.display = "none"; } return; }
    css();
    if (!WR.cv) {
      WR.cv = document.createElement("canvas"); WR.cv.id = "luxwrist"; document.body.appendChild(WR.cv);
      WR.cap = document.createElement("div"); WR.cap.id = "luxwristcap"; document.body.appendChild(WR.cap);
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    if (WR.cv.width !== W || WR.cv.height !== H) { WR.cv.width = W; WR.cv.height = H; }
    WR.cv.style.display = "block"; WR.cap.style.display = "block";
    const g = WR.cv.getContext("2d"), w = L.watch(), t = gameTime();
    g.clearRect(0, 0, W, H);
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.9); v.addColorStop(0, "rgba(6,7,10," + 0.2 * WR.k + ")"); v.addColorStop(1, "rgba(6,7,10," + 0.72 * WR.k + ")");
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    LuxWatch.wrist(g, W, H, WR.k, w, t, sleeve());
    const hh = String(t.h).padStart(2, "0") + ":" + String(Math.floor(t.m)).padStart(2, "0"), n = D.watches.filter(x => st.owned[x.id]).length, sc = L.scent();
    const html = (w ? "<i>" + esc(w.house) + "</i><b>" + esc(w.name) + "</b><span>" + hh + "</span>" : "<b>No watch</b><span>" + hh + " · by his phone</span>") +
      (sc ? "<em><u style='background:linear-gradient(90deg," + sc.f.col[0] + "," + sc.f.col[1] + ")'></u>" + esc(sc.f.name) + " · " + (sc.left < 1 ? "fading" : Math.round(sc.left) + " h left") + "</em>" : "") +
      (n > 1 ? "<small>◀ ▶ change watch</small>" : "");
    if (WR.cap._h !== html) { WR.cap.innerHTML = html; WR.cap._h = html; }
    WR.cap.style.opacity = String(WR.k);
  }
  function cycleWatch(dir) {
    const own = D.watches.filter(x => st.owned[x.id]); if (own.length < 2) return;
    const i = own.findIndex(x => x.id === st.watch);
    L.wearWatch(own[(i + dir + own.length) % own.length].id, true);
  }
  // his own move for it: the left forearm up across the chest, eyes down
  const clipsWas = window.storySeikoClips;
  if (typeof clipsWas === "function") window.storySeikoClips = function (make) {
    clipsWas(make);
    const up = { UpperArmL: [0, 0, -0.55], ForearmL: [0, 0, -2.3], Neck: [-0.34, 0, -0.12], Spine: [-0.05, 0, 0] };
    make("wristcheck", 1.0, [{ t: 0, pose: up }, { t: 1, pose: up }], true);
  };

  // ---- the counters, and his effects: one panel ------------------------------------------------------------------------------------------------------------
  const U = { on: false, mode: "own", tabs: [], tab: 0, sel: 0, armed: null, el: null, cv: null, title: "", sub: "" };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const padOn = () => { try { return pad.index >= 0; } catch (e) { return false; } };
  function css() {
    if (document.getElementById("luxcss")) return;
    const s = document.createElement("style"); s.id = "luxcss";
    s.textContent = `
#luxwrist{position:fixed;inset:0;width:100vw;height:100vh;z-index:34;pointer-events:none;display:none}
#luxwristcap{position:fixed;left:50%;bottom:7vh;transform:translateX(-50%);z-index:35;pointer-events:none;display:none;text-align:center;color:#f3f1ec;font-family:'Konto Sans','Segoe UI',system-ui,sans-serif;text-shadow:0 2px 10px #000}
#luxwristcap i{display:block;font-style:normal;font-size:12px;letter-spacing:.32em;text-transform:uppercase;color:#d9c48a}
#luxwristcap b{display:block;font:500 26px Georgia,'Times New Roman',serif;margin:2px 0 4px}
#luxwristcap span{display:block;font-size:34px;font-weight:800;letter-spacing:.04em;font-variant-numeric:tabular-nums}
#luxwristcap em{display:inline-flex;align-items:center;gap:8px;margin-top:8px;font-style:normal;font-size:13px;color:#d8dbe0}
#luxwristcap em u{width:34px;height:8px;border-radius:4px;display:inline-block}
#luxwristcap small{display:block;margin-top:8px;font-size:12px;color:#a7acb4}
#luxpanel{position:fixed;inset:0;z-index:62;display:none;grid-template-columns:minmax(360px,34vw) 1fr;grid-template-rows:auto 1fr auto;background:radial-gradient(120% 90% at 70% 40%,rgba(34,30,24,.93),rgba(8,9,12,.97));color:#f1eee7;font-family:'Konto Sans','Segoe UI',system-ui,sans-serif}
#luxpanel.on{display:grid}
#luxpanel header{grid-column:1/3;display:flex;align-items:flex-end;gap:28px;padding:26px 40px 14px;border-bottom:1px solid rgba(217,196,138,.28)}
#luxpanel header h1{margin:0;font:500 30px Georgia,'Times New Roman',serif;letter-spacing:.02em}
#luxpanel header h1 small{display:block;font:600 11px 'Konto Sans','Segoe UI',sans-serif;letter-spacing:.34em;text-transform:uppercase;color:#d9c48a;margin-bottom:4px}
#luxpanel nav{display:flex;gap:6px;margin-left:auto}
#luxpanel nav b{padding:8px 16px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a9a394;border-bottom:2px solid transparent;cursor:pointer}
#luxpanel nav b.on{color:#fff;border-bottom-color:#d9c48a}
#luxpanel .purse{font-size:15px;font-weight:800;color:#d9c48a;padding-bottom:8px;white-space:nowrap}
#luxpanel .list{overflow:auto;padding:10px 0 10px 28px;scrollbar-width:thin}
#luxpanel .row{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:9px 16px 9px 14px;border-left:3px solid transparent;cursor:pointer}
#luxpanel .row i{grid-column:1/3;font-style:normal;font-size:10.5px;letter-spacing:.24em;text-transform:uppercase;color:#a9a394}
#luxpanel .row b{font:500 17px Georgia,'Times New Roman',serif}
#luxpanel .row span{font-size:13.5px;font-weight:700;color:#d8d2c2;font-variant-numeric:tabular-nums;white-space:nowrap}
#luxpanel .row span.own{color:#8fcf9a}#luxpanel .row span.worn{color:#d9c48a}#luxpanel .row span.poor{color:#c0705f}
#luxpanel .row.on{background:linear-gradient(90deg,rgba(217,196,138,.2),rgba(217,196,138,0));border-left-color:#d9c48a}
#luxpanel .row u{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;vertical-align:1px}
#luxpanel .show{display:grid;grid-template-columns:minmax(300px,46%) 1fr;gap:10px 34px;align-items:center;padding:14px 44px 14px 20px;overflow:auto}
#luxpanel .show canvas{width:100%;max-width:520px;aspect-ratio:1;justify-self:center}
#luxpanel .info i{font-style:normal;font-size:12px;letter-spacing:.32em;text-transform:uppercase;color:#d9c48a}
#luxpanel .info h2{margin:4px 0 6px;font:500 32px/1.1 Georgia,'Times New Roman',serif}
#luxpanel .info .pr{font-size:19px;font-weight:800;margin-bottom:12px}
#luxpanel .info p{margin:0 0 12px;font-size:15px;line-height:1.5;color:#d9d4c8;max-width:52ch}
#luxpanel .info p.nt{color:#a9a394;font-size:13.5px}
#luxpanel .bars{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center;max-width:380px;margin:4px 0 12px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a9a394}
#luxpanel .bars s{display:block;height:6px;background:rgba(255,255,255,.12);text-decoration:none}
#luxpanel .bars s q{display:block;height:100%;background:#d9c48a;quotes:none}
#luxpanel .fits{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
#luxpanel .fits b{font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:2px;background:rgba(255,255,255,.08);color:#b9b4a6}
#luxpanel .fits b.g{background:rgba(110,190,125,.2);color:#a8e0b2}#luxpanel .fits b.r{background:rgba(200,90,70,.2);color:#eaa395}
#luxpanel .verdict{font-size:14px;font-weight:600;padding:9px 12px;border-left:3px solid #8fcf9a;background:rgba(255,255,255,.05);max-width:52ch}
#luxpanel .verdict.w{border-left-color:#e0b25a}#luxpanel .verdict.b{border-left-color:#d0624e}
#luxpanel .now{margin-top:10px;font-size:13.5px;font-weight:700;color:#d9c48a}
#luxpanel footer{grid-column:1/3;display:flex;gap:22px;padding:12px 40px 18px;font-size:13px;color:#b9b4a6;border-top:1px solid rgba(255,255,255,.08)}
#luxpanel footer b{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 5px;margin-right:6px;border:1.5px solid rgba(255,255,255,.6);border-radius:4px;font-size:11.5px;color:#fff}
#luxpanel footer .act{color:#fff;font-weight:700}
#luxpanel .empty{padding:40px;color:#a9a394;font-size:15px;line-height:1.6}
#luxgift{position:fixed;right:26px;top:92px;z-index:58;width:min(470px,90vw);display:flex;gap:14px;align-items:center;padding:14px 18px 14px 10px;background:rgba(12,12,14,.93);border-top:3px solid #d9c48a;color:#f1eee7;font-family:'Konto Sans','Segoe UI',system-ui,sans-serif;box-shadow:0 18px 60px rgba(0,0,0,.5);opacity:0;transform:translateX(30px);transition:opacity .4s,transform .4s;pointer-events:none}
#luxgift.on{opacity:1;transform:none}
#luxgift canvas{width:132px;height:132px;flex:none}
#luxgift i{display:block;font-style:normal;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#d9c48a}
#luxgift b{display:block;font:500 19px/1.25 Georgia,'Times New Roman',serif;margin:4px 0 6px}
#luxgift span{display:block;font-size:13px;line-height:1.45;color:#cfcabd}
#luxgift em{display:block;margin-top:6px;font-style:normal;font-size:11.5px;color:#8f8a7d}
body.titleup #luxgift,body.cutscene #luxgift,body.titleup #luxwrist,body.titleup #luxwristcap{visibility:hidden}
@media (max-width:900px){#luxpanel{grid-template-columns:1fr}#luxpanel .show{grid-template-columns:1fr}#luxpanel .show canvas{max-width:260px}}`;
    document.head.appendChild(s);
  }
  const byPrice = (a, b) => a.price - b.price;
  function tabsFor(mode) {
    if (mode === "watches") return [{ name: "Watches", list: D.watches.filter(x => !x.gift).sort(byPrice) }, { name: "Accessories", list: D.items.filter(x => !x.gift).sort(byPrice) }];
    if (mode === "parfumerie") return [{ name: "Designer", list: D.fragrances.filter(x => x.type === "designer").sort(byPrice) }, { name: "Boutique houses", list: D.fragrances.filter(x => x.type === "niche").sort(byPrice) }];
    if (mode === "drugstore") return [{ name: "Body sprays and colognes", list: D.fragrances.filter(x => x.type === "drugstore").sort(byPrice) }];
    const own = x => st.owned[x.id];
    return [{ name: "Watches", list: D.watches.filter(own) }, { name: "Fragrances", list: D.fragrances.filter(own) }, { name: "Accessories", list: D.items.filter(own) }];
  }
  L.open = function (mode, title, sub) {
    css();
    if (!U.el) {
      U.el = document.createElement("div"); U.el.id = "luxpanel";
      U.el.innerHTML = "<header><h1></h1><nav></nav><div class='purse'></div></header><div class='list'></div><div class='show'><canvas width='720' height='720'></canvas><div class='info'></div></div><footer></footer>";
      document.body.appendChild(U.el); U.cv = U.el.querySelector("canvas");
    }
    U.mode = mode || "own"; U.tabs = tabsFor(U.mode); U.tab = 0; U.sel = 0; U.armed = null;
    U.title = title || (U.mode === "own" ? "Your effects" : "Suit Select"); U.sub = sub || (U.mode === "own" ? "Seiko Tanaka" : "");
    if (U.mode === "own") { const t = U.tabs.findIndex(x => x.list.length); U.tab = Math.max(0, t); }
    U.on = true; U.el.classList.add("on");
    try { player.speed = 0; setPromptText(null); if (interior.prompt) interior.prompt.classList.remove("on"); if (phone.open) setPhone(false); } catch (e) { /* none */ }
    draw();
  };
  L.close = function () { U.on = false; if (U.el) U.el.classList.remove("on"); U.armed = null; try { saveGame(null, true); } catch (e) { /* none */ } };
  const cur = () => (U.tabs[U.tab] ? U.tabs[U.tab].list[U.sel] : null) || null;
  function status(it) {
    if (!st.owned[it.id]) { let poor = false; try { poor = purse.yen < it.price; } catch (e) { /* none */ } return ["<span class='" + (poor ? "poor" : "") + "'>" + yen(it.price) + "</span>", false]; }
    const worn = it.kind === "watch" ? st.watch === it.id : it.kind === "frag" ? !!(L.scent() && st.scent.id === it.id) : st.items[it.slot] === it.id;
    return ["<span class='" + (worn ? "worn" : "own") + "'>" + (worn ? (it.kind === "frag" ? "Wearing" : "Worn") : "Owned") + "</span>", worn];
  }
  function verdict(it) {
    const a = allow(), i = Math.min(7, rankIndex()), over = it.kind === "frag" ? it.tier - a - (it.loud >= 0.6 ? 0 : 3) : it.tier - a;
    if (it.heart) return ["", "Whatever your rank. People who notice it think better of you."];
    if (over >= 2) return ["b", "Far above " + RANK_A[i] + ". At work, and anywhere they know your rank, it reads as trying too hard: expect “Who do you think you are?”"];
    if (over === 1) return ["w", "A little above " + RANK_A[i] + ". Eyebrows, not remarks."];
    if (a >= 7 && it.tier <= 2 && it.kind === "watch") return ["", "Humble for " + RANK_A[i] + ". Some will like you the more for it."];
    return ["", "Right for " + RANK_A[i] + "."];
  }
  const FITS = [["office", "Office"], ["commute", "Morning train"], ["street", "Street"], ["night", "Night out"], ["formal", "Boardroom"], ["date", "Dinner"], ["yakuza", "The family"]];
  function draw() {
    if (!U.el) return;
    const tab = U.tabs[U.tab] || { list: [] };
    U.sel = clamp(U.sel, 0, Math.max(0, tab.list.length - 1));
    U.el.querySelector("h1").innerHTML = (U.sub ? "<small>" + esc(U.sub) + "</small>" : "") + esc(U.title);
    U.el.querySelector("nav").innerHTML = U.tabs.map((t, i) => "<b data-t='" + i + "' class='" + (i === U.tab ? "on" : "") + "'>" + esc(t.name) + "</b>").join("");
    let money = 0; try { money = purse.yen; } catch (e) { /* none */ }
    U.el.querySelector(".purse").textContent = yen(money);
    const list = U.el.querySelector(".list");
    if (!tab.list.length) list.innerHTML = "<div class='empty'>Nothing here yet.<br>Suit Select has a watch counter and a parfumerie in every branch; chemists sell body sprays. As you rise at SOTI, people give you things.</div>";
    else list.innerHTML = tab.list.map((it, i) => "<div class='row" + (i === U.sel ? " on" : "") + "' data-i='" + i + "'><i>" + esc(it.house) + "</i><b>" + (it.kind === "frag" ? "<u style='background:linear-gradient(135deg," + it.col[0] + "," + it.col[1] + ")'></u>" : "") + esc(it.name) + "</b>" + status(it)[0] + "</div>").join("");
    const on = list.querySelector(".row.on"); if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
    const it = cur(), info = U.el.querySelector(".info");
    if (!it) { info.innerHTML = ""; }
    else {
      const bar = (n, v) => "<span>" + n + "</span><s><q style='width:" + Math.round(clamp(v, 0, 1) * 100) + "%'></q></s>", vd = verdict(it), owned = !!st.owned[it.id];
      let h = "<i>" + esc(it.house) + "</i><h2>" + esc(it.name) + "</h2><div class='pr'>" + (it.gift ? "A gift" : yen(it.price)) + "</div><p>" + esc(it.blurb) + "</p>";
      if (it.kind === "frag") {
        h += "<p class='nt'>" + esc(it.family) + " · " + esc(it.notes) + "</p><div class='bars'>" + bar("Projection", it.proj) + bar("Lasts " + it.hours + " h", it.hours / 14) + bar("Loudness", it.loud) + bar("Prestige", it.tier / 10) + "</div><div class='fits'>" +
          FITS.filter(f => f[0] !== "yakuza" || st.yakuza > 0).map(f => "<b class='" + (it.fit[f[0]] >= 0.5 ? "g" : it.fit[f[0]] <= -0.25 ? "r" : "") + "'>" + f[1] + "</b>").join("") + "</div>";
      } else h += "<div class='bars'>" + bar("Prestige", it.tier / 10) + bar("Flash", it.flash) + "</div>";
      h += "<div class='verdict " + vd[0] + "'>" + vd[1] + "</div>";
      if (it.kind === "frag" && owned) { const sc = L.scent(); if (sc && sc.f.id === it.id) h += "<div class='now'>On you: " + sc.sprays + (sc.sprays === 1 ? " spray" : " sprays") + " · " + (sc.left < 1 ? "fading" : Math.round(sc.left) + " h left") + (isCloud(sc) ? " · far too much" : "") + "</div>"; }
      info.innerHTML = h;
    }
    const k = padOn(), K = (a, b) => "<b>" + (k ? b : a) + "</b>";
    let act = "";
    if (it) {
      const owned = !!st.owned[it.id], worn = status(it)[1];
      act = !owned ? (U.armed === it.id ? "Press again to pay " + yen(it.price) : "Buy") : it.kind === "frag" ? (worn ? "One more spray" : "Spray it on") : worn ? "Take off" : "Wear";
    }
    U.el.querySelector("footer").innerHTML = (it ? "<span class='act'>" + K("Enter", "A") + act + "</span>" : "") + (it && it.kind === "frag" && st.scent ? "<span>" + K("X", "X") + "Wash it off</span>" : "") +
      (U.tabs.length > 1 ? "<span>" + K("◀ ▶", "◀ ▶") + "Section</span>" : "") + "<span>" + K("▲ ▼", "▲ ▼") + "Choose</span><span>" + K("Esc", "B") + (U.mode === "own" ? "Close" : "Leave the counter") + "</span>";
    list.querySelectorAll(".row").forEach(r => r.addEventListener("click", () => { const i = +r.dataset.i; if (i === U.sel) act1(); else { U.sel = i; U.armed = null; draw(); } }));
    U.el.querySelectorAll("nav b").forEach(b => b.addEventListener("click", () => { U.tab = +b.dataset.t; U.sel = 0; U.armed = null; draw(); }));
  }
  function act1() {
    const it = cur(); if (!it) return;
    if (!st.owned[it.id]) {
      let money = 0; try { money = purse.yen; } catch (e) { /* none */ }
      if (money < it.price) { tell("You cannot afford that. " + yen(it.price - money) + " short.", 3); return; }
      if (U.armed !== it.id) { U.armed = it.id; draw(); return; }
      U.armed = null;
      try { purse.yen -= it.price; if (typeof noteBuy === "function") noteBuy("clothes", it.price); } catch (e) { /* none */ }
      st.owned[it.id] = 1;
      if (it.kind === "watch") L.wearWatch(it.id, true); else if (it.kind === "item") L.wearItem(it.id, true, true);
      tell(it.kind === "frag" ? "Boxed and bagged: " + it.name + ". Spray it on from your effects (" + (padOn() ? "L3" : "I") + "), or here." : it.house + " " + it.name + ": yours" + (it.kind === "watch" ? ", and on your wrist." : "."), 4);
      draw(); return;
    }
    if (it.kind === "watch") L.wearWatch(st.watch === it.id ? null : it.id, true);
    else if (it.kind === "item") L.wearItem(it.id, undefined, true);
    else L.spray(it.id, 1, false);
    draw();
  }
  function move(d) { const n = (U.tabs[U.tab] || { list: [] }).list.length; if (!n) return; U.sel = (U.sel + d + n) % n; U.armed = null; draw(); }
  function tabMove(d) { const n = U.tabs.length; if (n < 2) return; U.tab = (U.tab + d + n) % n; U.sel = 0; U.armed = null; draw(); }

  // small drawings of the accessories
  function itemArt(g, it, cx, cy, s) {
    const gold = ["#fff4c8", "#eccb6a", "#b98a2c"], steel = ["#f6f8fa", "#cfd4da", "#8d949d"], m = /gold|Gold|chain|pinky|signet|Dupond/i.test(it.name + it.house) ? gold : steel;
    const mg = (x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, m[0]); gr.addColorStop(0.5, m[1]); gr.addColorStop(1, m[2]); return gr; };
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    g.save(); g.translate(cx, cy); g.shadowColor = "rgba(0,0,0,0.5)"; g.shadowBlur = s * 0.06; g.shadowOffsetY = s * 0.03;
    const slot = it.slot;
    if (slot === "tie") {
      const c = /navy|Grenadine/i.test(it.name) ? "#1c2c54" : "#8a2a2a"; g.fillStyle = c;
      g.beginPath(); g.moveTo(-s * 0.09, -s * 0.42); g.lineTo(s * 0.09, -s * 0.42); g.lineTo(s * 0.06, -s * 0.3); g.lineTo(s * 0.16, s * 0.3); g.lineTo(0, s * 0.44); g.lineTo(-s * 0.16, s * 0.3); g.lineTo(-s * 0.06, -s * 0.3); g.closePath(); g.fill();
      g.shadowColor = "transparent"; g.save(); g.clip(); g.strokeStyle = "rgba(255,255,255,0.14)"; g.lineWidth = s * 0.012; for (let y = -s * 0.5; y < s * 0.6; y += s * 0.05) { g.beginPath(); g.moveTo(-s * 0.2, y); g.lineTo(s * 0.2, y + s * 0.12); g.stroke(); } g.restore();
    } else if (slot === "pen") {
      g.rotate(-0.6); g.fillStyle = "#101114"; rr(-s * 0.42, -s * 0.045, s * 0.74, s * 0.09, s * 0.04); g.fill(); g.shadowColor = "transparent";
      g.fillStyle = mg(0, -s * 0.05, 0, s * 0.05); g.fillRect(-s * 0.08, -s * 0.048, s * 0.03, s * 0.096); g.fillRect(-s * 0.02, -s * 0.048, s * 0.012, s * 0.096); g.fillRect(-s * 0.3, -s * 0.07, s * 0.2, s * 0.02);
      g.beginPath(); g.moveTo(s * 0.32, -s * 0.03); g.lineTo(s * 0.46, 0); g.lineTo(s * 0.32, s * 0.03); g.closePath(); g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.arc(-s * 0.41, 0, s * 0.02, 0, 7); g.fill();
    } else if (slot === "cufflinks") {
      for (const x of [-0.17, 0.17]) { g.fillStyle = mg(-s * 0.3, -s * 0.2, s * 0.3, s * 0.2); g.beginPath(); g.arc(x * s, 0, s * 0.13, 0, 7); g.fill(); g.fillStyle = m === gold ? "#0c0d10" : m[2]; g.beginPath(); g.arc(x * s, 0, s * 0.075, 0, 7); g.fill(); }
    } else if (slot === "case") {
      const c = /Hermèz/.test(it.house) ? "#6b3a1c" : "#17181b"; g.fillStyle = c; rr(-s * 0.4, -s * 0.2, s * 0.8, s * 0.52, s * 0.04); g.fill(); g.shadowColor = "transparent";
      g.strokeStyle = c; g.lineWidth = s * 0.04; g.beginPath(); g.arc(0, -s * 0.2, s * 0.13, Math.PI, 0); g.stroke();
      g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-s * 0.4, -s * 0.2, s * 0.8, s * 0.16); g.fillStyle = mg(-s * 0.05, 0, s * 0.05, s * 0.1); rr(-s * 0.05, -s * 0.07, s * 0.1, s * 0.09, s * 0.01); g.fill();
    } else if (slot === "wallet") {
      g.fillStyle = "#2a2018"; rr(-s * 0.34, -s * 0.22, s * 0.68, s * 0.44, s * 0.03); g.fill(); g.shadowColor = "transparent"; g.strokeStyle = "rgba(255,255,255,0.1)"; g.lineWidth = s * 0.012;
      g.save(); g.clip(); for (let k = -1; k < 1.4; k += 0.09) { g.beginPath(); g.moveTo(k * s, -s * 0.3); g.lineTo(k * s + s * 0.6, s * 0.3); g.stroke(); g.beginPath(); g.moveTo(k * s + s * 0.6, -s * 0.3); g.lineTo(k * s, s * 0.3); g.stroke(); } g.restore();
    } else if (slot === "belt") {
      g.fillStyle = "#17181b"; rr(-s * 0.46, -s * 0.07, s * 0.92, s * 0.14, s * 0.02); g.fill(); g.shadowColor = "transparent"; g.fillStyle = mg(-s * 0.1, -s * 0.12, s * 0.1, s * 0.12);
      g.fillRect(-s * 0.11, -s * 0.12, s * 0.05, s * 0.24); g.fillRect(s * 0.06, -s * 0.12, s * 0.05, s * 0.24); g.fillRect(-s * 0.11, -s * 0.025, s * 0.22, s * 0.05);
    } else if (slot === "shoes") {
      g.fillStyle = "#0e0f12"; g.beginPath(); g.moveTo(-s * 0.4, s * 0.1); g.bezierCurveTo(-s * 0.42, -s * 0.16, -s * 0.16, -s * 0.2, -s * 0.06, -s * 0.06); g.bezierCurveTo(s * 0.12, 0, s * 0.4, 0, s * 0.44, s * 0.1); g.lineTo(s * 0.44, s * 0.15); g.lineTo(-s * 0.4, s * 0.15); g.closePath(); g.fill();
      g.shadowColor = "transparent"; g.fillStyle = "rgba(255,255,255,0.22)"; g.beginPath(); g.ellipse(s * 0.26, s * 0.06, s * 0.1, s * 0.025, -0.1, 0, 7); g.fill(); g.fillStyle = "#3a2a1c"; g.fillRect(-s * 0.4, s * 0.15, s * 0.84, s * 0.03);
    } else if (slot === "shades") {
      g.fillStyle = "#0c0d10"; for (const x of [-1, 1]) { rr(x * s * 0.2 - s * 0.17, -s * 0.1, s * 0.34, s * 0.22, s * 0.07); g.fill(); } g.fillRect(-s * 0.05, -s * 0.07, s * 0.1, s * 0.035);
      g.shadowColor = "transparent"; g.fillStyle = "rgba(140,170,200,0.25)"; for (const x of [-1, 1]) { rr(x * s * 0.2 - s * 0.14, -s * 0.075, s * 0.28, s * 0.17, s * 0.05); g.fill(); }
    } else if (slot === "lighter") {
      g.fillStyle = mg(-s * 0.14, 0, s * 0.14, 0); rr(-s * 0.14, -s * 0.3, s * 0.28, s * 0.6, s * 0.02); g.fill(); g.shadowColor = "transparent";
      g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = s * 0.006; for (let x = -s * 0.12; x < s * 0.13; x += s * 0.022) { g.beginPath(); g.moveTo(x, -s * 0.1); g.lineTo(x, s * 0.29); g.stroke(); } g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(-s * 0.14, -s * 0.12, s * 0.28, s * 0.012);
    } else if (slot === "ring") {
      g.strokeStyle = mg(-s * 0.2, -s * 0.2, s * 0.2, s * 0.2); g.lineWidth = s * 0.07; g.beginPath(); g.ellipse(0, s * 0.06, s * 0.2, s * 0.22, 0, 0, 7); g.stroke(); g.shadowColor = "transparent";
      g.fillStyle = mg(-s * 0.1, -s * 0.3, s * 0.1, -s * 0.1); g.beginPath(); g.ellipse(0, -s * 0.17, s * 0.13, s * 0.09, 0, 0, 7); g.fill();
      if (/Diamond/i.test(it.name)) { g.fillStyle = "#eaf4ff"; g.beginPath(); g.arc(0, -s * 0.17, s * 0.06, 0, 7); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 1; g.beginPath(); g.moveTo(-s * 0.06, -s * 0.17); g.lineTo(s * 0.06, -s * 0.17); g.moveTo(0, -s * 0.23); g.lineTo(0, -s * 0.11); g.stroke(); }
    } else {
      g.strokeStyle = mg(-s * 0.3, 0, s * 0.3, 0); g.lineWidth = s * 0.035; g.setLineDash([s * 0.05, s * 0.022]); g.beginPath(); g.moveTo(-s * 0.3, -s * 0.3); g.bezierCurveTo(-s * 0.3, s * 0.4, s * 0.3, s * 0.4, s * 0.3, -s * 0.3); g.stroke(); g.setLineDash([]);
    }
    g.restore();
  }
  function showArt(g, it, W, H, t) {
    g.clearRect(0, 0, W, H);
    if (!it) return;
    const sp = g.createRadialGradient(W / 2, H * 0.46, 10, W / 2, H * 0.5, W * 0.56); sp.addColorStop(0, "rgba(255,246,224,0.14)"); sp.addColorStop(1, "rgba(255,246,224,0)"); g.fillStyle = sp; g.fillRect(0, 0, W, H);
    if (it.kind === "watch") LuxWatch.draw(g, it, W / 2, H / 2, W * 0.235, gameTime(), { strap: 2.05 });
    else if (it.kind === "frag") {
      // its aura, as it will hang round him
      for (let i = 0; i < 26; i++) {
        const a = i * 2.4 + t * (0.12 + (i % 5) * 0.03), r = W * (0.16 + 0.2 * ((i * 37) % 100) / 100), x = W / 2 + Math.cos(a) * r, y = H * 0.5 + Math.sin(a * 0.8) * r * 0.75, s = W * (0.1 + 0.07 * ((i * 53) % 100) / 100);
        const gr = g.createRadialGradient(x, y, 0, x, y, s), c = it.col[i % 2]; gr.addColorStop(0, c + "3a"); gr.addColorStop(1, c + "00"); g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2);
      }
      LuxWatch.bottle(g, it, W / 2, H * 0.52, H * 0.62);
    } else itemArt(g, it, W / 2, H / 2, W * 0.7);
  }

  // ---- keys and the pad --------------------------------------------------------------------------------------------------------------------------------------
  const typing = () => { const a = document.activeElement; return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable); };
  window.addEventListener("keydown", e => {
    if (typing()) return;
    const k = e.code;
    if (U.on) {
      if (k === "ArrowUp" || k === "KeyW") move(-1);
      else if (k === "ArrowDown" || k === "KeyS") move(1);
      else if (k === "ArrowLeft" || k === "KeyA" || k === "KeyQ") tabMove(-1);
      else if (k === "ArrowRight" || k === "KeyD" || k === "Tab") tabMove(1);
      else if (k === "Enter" || k === "Space" || k === "KeyE" || k === "KeyF") { if (!e.repeat) act1(); }
      else if (k === "KeyX" || k === "Delete") { L.wash(); draw(); }
      else if ((k === "Escape" || k === "Backspace" || k === "KeyI") && !e.repeat) L.close();
      if (!/^F\d/.test(k)) { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === "KeyT" && handsFree()) { WR.held = true; return; }
    if (WR.held && (k === "ArrowLeft" || k === "ArrowRight") && !e.repeat) { cycleWatch(k === "ArrowLeft" ? -1 : 1); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (k === "KeyI" && !e.repeat && handsFree()) { L.open("own"); e.preventDefault(); }
  }, true);
  window.addEventListener("keyup", e => { if (e.code === "KeyT") WR.held = false; if (U.on) { e.stopImmediatePropagation(); } }, true);
  window.addEventListener("blur", () => { WR.held = false; });
  const padWas = {};
  function padTick() {
    let g = null; try { const gp = navigator.getGamepads ? navigator.getGamepads() : []; g = gp && (gp[pad.index] || null); } catch (e) { g = null; }
    if (!g) { WR.pad = false; return; }
    const b = i => !!(g.buttons[i] && g.buttons[i].pressed), ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    const nowB = { a: b(0), b: b(1), x: b(2), up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6, l3: b(10), r3: b(11) };
    const edge = {}; for (const k in nowB) { edge[k] = nowB[k] && !padWas[k]; padWas[k] = nowB[k]; }
    if (U.on) {
      if (edge.up) move(-1); if (edge.down) move(1); if (edge.left) tabMove(-1); if (edge.right) tabMove(1);
      if (edge.a) act1(); if (edge.x) { L.wash(); draw(); } if (edge.b || edge.l3) L.close();
      return;
    }
    WR.pad = nowB.r3 && handsFree();
    if (WR.pad && (edge.left || edge.right)) cycleWatch(edge.left ? -1 : 1);
    if (edge.l3 && handsFree()) L.open("own");
  }

  // ---- the counters in the shops ----------------------------------------------------------------------------------------------------------------------------
  function counter(room, root, x, z, title, sub, act, label, dress) {
    const wood = "#5b4631", dark = "#2a2d33";
    inAdd(root, 3.3, 0.9, 0.78, x, 0.45, z, wood);                         // the cabinet
    inAdd(root, 3.36, 0.05, 0.84, x, 0.925, z, dark);                      // its top
    inAdd(root, 3.2, 0.012, 0.7, x, 0.957, z, "#e9e4d8");                  // the felt under the glass
    for (const sx of [-1, 1]) inAdd(root, 0.05, 0.62, 0.05, x + sx * 1.3, 1.26, z - 0.3, dark);
    inAdd(root, 2.72, 0.05, 0.05, x, 1.58, z - 0.3, dark);
    const sign = inLabel(title, 2.6, 0.4, "#17181b", "#e9d9a8"); sign.position.set(x, 1.83, z - 0.3); root.add(sign);
    const plate = inLabel(sub, 2.9, 0.3, wood, "#e9d9a8"); plate.position.set(x, 0.5, z + 0.4); root.add(plate);
    dress(x, z);
    room.colliders.push({ x0: x - 1.72, x1: x + 1.72, z0: z - 0.48, z1: z + 0.48 });
    room.spots = (room.spots || []).concat([{ x: x, z: z + 0.2, label: label, act: act }]);
  }
  function dressRoom(room, root, brand) {
    const D2 = (room.D || 18) / 2, z = D2 - 5.0;
    if (brand === "clothes") {
      counter(room, root, 4.7, z, "TIMEPIECES", "Rolecks · Omegon · Patek Filippe · Cartière", "lux:watches", "look at the watches", (x, zz) => {
        ["#17181b", "#3a2416", "#17181b", "#1a2c5a", "#17181b", "#3a2416"].forEach((c, i) => { const px = x - 1.25 + i * 0.5; inAdd(root, 0.2, 0.07, 0.2, px, 0.995, zz + 0.04, c); inAdd(root, 0.075, 0.03, 0.075, px, 1.045, zz + 0.04, i % 3 === 1 ? "#d9b44a" : "#aeb6c0"); });
      });
      counter(room, root, -4.7, z, "PARFUMERIE", "Designer and boutique houses", "lux:parfumerie", "try the fragrances", (x, zz) => {
        D.fragrances.filter(f => f.type !== "drugstore").slice(0, 16).forEach((f, i) => { const px = x - 1.4 + (i % 8) * 0.4, pz = zz - 0.14 + Math.floor(i / 8) * 0.3, h = 0.17 + (i % 3) * 0.03; inAdd(root, 0.1, h, 0.07, px, 0.963 + h / 2, pz, f.col[0]); inAdd(root, 0.045, 0.05, 0.045, px, 0.963 + h + 0.025, pz, i % 2 ? "#d9b44a" : "#17181b"); });
      });
    } else if (brand === "pharmacy") {
      counter(room, root, 4.4, z, "MEN'S GROOMING", "Body sprays · colognes", "lux:drugstore", "look at the body sprays", (x, zz) => {
        D.fragrances.filter(f => f.type === "drugstore").forEach((f, k) => { for (let i = 0; i < 4; i++) { const px = x - 1.2 + k * 0.95 + i * 0.13; inAdd(root, 0.08, 0.2, 0.08, px, 1.063, zz, f.col[0]); } });
      });
    }
  }
  function hookShops() {
    if (typeof window.interiorRoom !== "function" || typeof window.interiorSpotAct !== "function" || hookShops.done) return; hookShops.done = true;
    const roomWas = window.interiorRoom, spotWas = window.interiorSpotAct, enterWas = window.interiorEnter;
    window.interiorRoom = function (s, opts) {
      if (s && (s.brand === "clothes" || s.brand === "pharmacy") && !s.station) {
        const o = Object.assign({}, opts || {}), extra = o.extra;
        o.extra = function (room, root, th) { if (extra) extra(room, root, th); try { dressRoom(room, root, s.brand); } catch (e) { console.warn("[Konto] luxury counters:", e); } };
        return roomWas.call(this, s, o);
      }
      return roomWas.apply(this, arguments);
    };
    window.interiorSpotAct = function (sp) {
      if (sp && typeof sp.act === "string" && sp.act.indexOf("lux:") === 0) {
        const a = sp.act.slice(4);
        if (a === "watches") L.open("watches", "Timepieces", "Suit Select");
        else if (a === "parfumerie") L.open("parfumerie", "Parfumerie", "Suit Select");
        else L.open("drugstore", "Men's grooming", "The chemist");
        return;
      }
      return spotWas.apply(this, arguments);
    };
    if (typeof enterWas === "function") window.interiorEnter = function (s) {
      const r = enterWas.apply(this, arguments);
      try { if (r !== false && s && s.brand === "clothes" && !st.seen.counters) { st.seen.counters = 1; setTimeout(() => tell("Suit Select: watches on the right as you come in, the parfumerie on the left.", 5), 2600); } } catch (e) { /* none */ }
      return r;
    };
  }

  // ---- the frame ----------------------------------------------------------------------------------------------------------------------------------------------
  const tickWas = window.tick;
  if (typeof tickWas === "function") window.tick = function (dt) {
    if (U.on) {
      // the counter holds the game still, as a menu does
      try { padTick(); if (typeof actors === "object" && actors.list.length) actorsTick(dt); if (interior.active && interior.room && interior.room.tick) interior.room.tick(dt); fxTick(dt); present(); } catch (e) { if (!U.warned) { U.warned = true; console.warn("[Konto] luxury panel frame:", e); } }
      return;
    }
    tickWas(dt);
    try { padTick(); wearTick(); fxTick(dt); giftTick(); } catch (e) { if (!L.warned) { L.warned = true; console.warn("[Konto] luxury frame:", e); } }
  };
  // the wrist and the previews draw on their own clock, so they run smoothly whatever the game is doing
  let rafT = performance.now();
  (function loop() {
    const t = performance.now(), dt = Math.min(0.1, (t - rafT) / 1000); rafT = t;
    try {
      wristDraw(dt);
      if (U.on && U.cv) showArt(U.cv.getContext("2d"), cur(), U.cv.width, U.cv.height, t / 1000);
      if (G.show) { if (t > G.show.until) G.show = null; else showArt(G.show.cv.getContext("2d"), G.show.it, 300, 300, t / 1000); }
    } catch (e) { if (!WR.warned) { WR.warned = true; console.warn("[Konto] luxury draw:", e); } }
    requestAnimationFrame(loop);
  })();

  // ---- saved with the game ---------------------------------------------------------------------------------------------------------------------------------------
  const snap = window.snapshotSave, apply = window.applySave, sig = window.saveSig, newGame = window.newGameBackup;
  if (typeof snap === "function") window.snapshotSave = function () { const s = snap.apply(this, arguments); try { s.luxury = JSON.parse(JSON.stringify(st)); } catch (e) { /* none */ } return s; };
  if (typeof apply === "function") window.applySave = function (s) {
    const r = apply.apply(this, arguments);
    try { st = Object.assign(fresh(), s && s.luxury ? JSON.parse(JSON.stringify(s.luxury)) : {}); lastMin = null; if (typeof seikoWear === "function") seikoWear(); } catch (e) { st = fresh(); }
    return r;
  };
  if (typeof sig === "function") window.saveSig = function () { return sig.apply(this, arguments) + "|L" + Object.keys(st.owned).length + (st.watch || "") + (st.scent ? st.scent.id + st.scent.sprays : ""); };
  if (typeof newGame === "function") window.newGameBackup = function () { const r = newGame.apply(this, arguments); st = fresh(); return r; };

  // ---- console and the cheat ---------------------------------------------------------------------------------------------------------------------------------------
  L.grant = function (what) { (what === "all" ? Object.keys(byId) : [what]).forEach(id => { if (byId[id]) st.owned[id] = 1; }); return Object.keys(st.owned).length; };
  L.status = () => ({ watch: st.watch, scent: st.scent, items: st.items, owned: Object.keys(st.owned), allow: allow(), context: context(), impression: impression(), yakuza: st.yakuza });
  L._state = () => st;
  try { CHEAT_ACTIONS.LUXURY = { dial: "5558824", note: "¥50,000,000 for the watch counter", fn: () => { purse.yen += 50000000; } }; } catch (e) { /* no cheat table */ }

  hookStanding(); hookCareer(); hookShops(); hookWrist();
  // (scripts that load after this one: look again once the page is up)
  window.addEventListener("load", () => { hookStanding(); hookCareer(); hookShops(); hookWrist(); });
  console.log("[Konto] luxury " + L.version + ": " + D.watches.length + " watches, " + D.fragrances.length + " fragrances, " + D.items.length + " accessories");
})();
