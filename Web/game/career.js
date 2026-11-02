// Seiko's working life at SOTI: the missions after The Interview, and the day that repeats under them.
//
//   2  First Day            the desk on 3F Customer Care: first person, the laptop, the calls (career-office.js)
//   3  The Complaint Line   more calls; from now on he lives in the flat SOTI rented him in outer Tōkonto (career-commute.js)
//   4  Overtime             the last day on the phones; Gondō calls him in: Akio likes his work, he is promoted to floor manager
//                           alongside Gondō, and he gets a company car (which drinks fuel he pays for)
//   5  Floor Manager        the floor: walk it, sort out the people on it, and keep Gondō from making things worse
//   6  Two Managers
//   7  The Audit
//   8  Every Day at SOTI    the floor, every day, with whatever the day brings
//
// Every day goes the same way: wake in the flat, get to SOTI Tower by 9:00 (train from the local station, which calms him, or the company
// car, which costs fuel), do the shift, clock out through the door, go home, sleep. Late costs pay; a missed day costs more.
//
// This file is the spine: the missions, the day, the save, the menus and the events. It loads after konto.html and wraps a few of its
// functions (tick, storyTick, storySave/storyLoad, storyMarkerA, storySotiDoor, useRide, updatePrompt, interiorRoom, interiorSpotAct,
// interiorLeave), so the story there is unchanged up to the morning after the interview.
//
// ---- events (for the honor and respect systems, achievements, anything else) --------------------------------------------------------------
//   career.on(name, fn)   fn({ type, day, mission, at, ...detail }); career.on("*", fn) hears everything. Also dispatched on window as
//                         CustomEvent "salaryman:<name>" with the same detail.
//   day:start             { flat, promoted }
//   shift:start           { late, minutesLate, mode: "desk"|"floor" }
//   shift:end             { pay, docked, bonus, rating, late }
//   shift:missed          { }
//   call:start            { call, caller, difficulty }
//   call:choice           { call, tone: "kind"|"firm"|"rude"|"wrong"|"honest"|"dishonest", text }
//   call:end              { call, caller, outcome: "resolved"|"escalated"|"hungup", patience, rude, honest, stars }
//   floor:choice          { incident, who, tone: "tactful"|"blunt"|"yield"|"kind"|"harsh"|"honest"|"dishonest", text }
//   floor:resolved        { incident, morale, gondo, good }
//   gondo:mood            { gondo, delta }
//   promotion             { to: "floor manager" }
//   flat:assigned         { station, x, z }
//   car:given | car:fuel-low { fuel } | car:out-of-fuel | car:refuel { litres, yen, station }
//   commute:arrive        { mode: "train"|"car"|"walk"|"taxi", minutes, calm }
//   phone:calm            { stress }   (looking at the phone on the train)
//   mission:passed        { mission, title }
// career.log keeps the last 200 events.
(function () {
  "use strict";
  if (typeof story === "undefined" || typeof cutPlay !== "function") { console.warn("[Career] the story is not in this build"); return; }
  const C = window.career = window.career || {};
  C.version = "1.0.0";

  // ---- events --------------------------------------------------------------------------------------------------------------------------
  const listeners = {};
  C.log = [];
  C.on = (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); return () => C.off(name, fn); };
  C.off = (name, fn) => { const a = listeners[name]; if (!a) return; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
  C.emit = (name, detail) => {
    const s = story.career || {};
    const d = Object.assign({ type: name, day: s.day || 0, mission: story.m, at: Math.round(gameMinutes()) }, detail || {});
    C.log.push(d); if (C.log.length > 200) C.log.shift();
    [(listeners[name] || []), (listeners["*"] || [])].forEach(list => list.slice().forEach(fn => { try { fn(d); } catch (e) { console.warn("[Career] listener for " + name + ":", e); } }));
    try { window.dispatchEvent(new CustomEvent("salaryman:" + name, { detail: d })); } catch (e) { /* old browsers */ }
    return d;
  };

  // ---- state (saved with the story) ----------------------------------------------------------------------------------------------------
  function fresh() {
    return { v: 1, day: 1, promoted: false, flat: null, car: null, rating: 3.0, calls: { taken: 0, resolved: 0, lost: 0 },
      floor: { morale: 0.6, gondo: 0.5, shifts: 0 }, late: 0, missed: 0, shift: null, earned: 0, seen: {} };
  }
  const S = C.state = () => story.career || (story.career = fresh());

  Object.assign(STORY_TITLES, { 2: "First Day", 3: "The Complaint Line", 4: "Overtime", 5: "Floor Manager", 6: "Two Managers", 7: "The Audit", 8: "Every Day at SOTI" });
  const WAGE_DESK = 9800, WAGE_FLOOR = 16500;
  C.missions = {
    2: { kind: "desk", calls: ["charger", "bill", "obaachan"], wage: WAGE_DESK, first: true },
    3: { kind: "desk", calls: ["cracked", "roaming", "scam", "gamer"], wage: WAGE_DESK },
    4: { kind: "desk", calls: ["buds", "influencer", "landlord", "lonely"], wage: WAGE_DESK, promotion: true },
    5: { kind: "floor", incidents: ["aircon", "newhire", "credit"], wage: WAGE_FLOOR, firstFloor: true },
    6: { kind: "floor", incidents: ["late", "script", "printer"], wage: WAGE_FLOOR },
    7: { kind: "floor", incidents: ["audit", "headset", "blame"], wage: WAGE_FLOOR },
    8: { kind: "floor", random: 3, wage: WAGE_FLOOR }
  };
  C.mission = () => C.missions[Math.min(8, Math.max(2, story.m))];
  C.active = () => story.m >= 2 && typeof story.step === "string" && story.step.indexOf("c:") === 0;
  const letterFor = m => "ABCDEFGH"[Math.max(0, m - 2)] || "A";

  // ---- the day ---------------------------------------------------------------------------------------------------------------------------
  const DAY_START = 9 * 60, DOORS_OPEN = 6 * 60, DOORS_SHUT = 17 * 60 + 30, CLOCK_OUT = 18 * 60 + 5;

  function commuteHint() {
    const s = S(), f = s.flat;
    const bits = [];
    if (f) bits.push("Train: walk into " + f.station + " and press F (calmer, and you can look at your phone on the way)");
    else bits.push("Walk, take the train from Tōkonto Central, or book a Ryde (P)");
    if (s.car) bits.push("or drive the company car (it needs fuel)");
    return bits.join(", ") + ".";
  }
  C.startDay = function () {
    const s = S(), so = story.soti;
    story.step = "c:toWork";
    s.shift = { day: s.day, start: null, late: false, done: false, passed: false, pay: 0, rating: 0, calm: 0 };
    storyClearBlips();
    if (so) storyBlip(so.door[0], so.door[1], "SOTI Tower · " + (STORY_TITLES[story.m] || "Work"), { letter: story.m <= 7 ? letterFor(story.m) : "" });
    storyObjective((story.m <= 7 ? STORY_TITLES[story.m] + ": g" : "G") + "et to SOTI Tower by 9:00", commuteHint());
    C.emit("day:start", { flat: s.flat && s.flat.station, promoted: s.promoted });
    saveGame(null, true);
  };
  // at SOTI's door, any time the shift has not been done
  C.arrive = function () {
    const s = S(), m = gameMinutes();
    if (!s.shift) s.shift = { day: s.day, start: null, late: false, done: false, passed: false, pay: 0, rating: 0, calm: 0 };
    if (story.step === "c:toWork") {
      if (m < DOORS_OPEN || m > DOORS_SHUT) { say("SOTI Tower is locked up. The floor opens at 6:00 — be at your desk by 9.", 4); return false; }
      s.shift.start = m;
      s.shift.late = m > DAY_START + 1;
      s.shift.calm = 1 - (vitals.stress || 0);
      if (s.shift.late) s.late++;
      C.emit("shift:start", { late: s.shift.late, minutesLate: Math.max(0, Math.round(m - DAY_START)), mode: C.mission().kind });
      story.step = "c:floor";
    }
    storyClearBlips();
    if (story.timer) { TIME.rate = story.timer.rateWas || 0.4; story.timer = null; }
    if (C.commute && C.commute.arrived) C.commute.arrived();
    C.office.enter();
    return true;
  };
  // the work is done: out through the door to go home
  C.shiftDone = function (result) {
    const s = S();
    s.shift.done = true;
    s.shift.passed = story.m <= 7;
    s.shift.rating = result && result.rating || 0;
    s.shift.bonus = result && result.bonus || 0;
    s.shift.notes = result && result.notes || "";
    story.step = "c:clockout";
    storyObjective("Clock out: leave the floor through the door", "Your day is done" + (s.shift.notes ? " · " + s.shift.notes : "") + ".");
    saveGame(null, true);
  };
  C.clockOut = function () {
    const s = S(), def = C.mission(), sh = s.shift || {};
    if (gameMinutes() < CLOCK_OUT && gameMinutes() > DOORS_OPEN) setGameTime(CLOCK_OUT + Math.random() * 20);
    const base = def.wage, docked = sh.late ? Math.round(base * 0.15 / 10) * 10 : 0, bonus = Math.max(0, Math.round((sh.bonus || 0) / 10) * 10);
    const pay = base - docked + bonus;
    purse.yen += pay; s.earned += pay; sh.pay = pay;
    setTimeout(() => notify("Wallet", "SOTI Payroll", "Today: " + yenText(pay) + (docked ? " (−" + yenText(docked) + " late)" : "") + (bonus ? " (+" + yenText(bonus) + " bonus)" : ""), 7), 600);
    C.emit("shift:end", { pay: pay, docked: docked, bonus: bonus, rating: sh.rating || 0, late: !!sh.late });
    // a day's work wears on him (storyPassed counts it for mission days; every other day is counted here)
    if (!(story.m <= 7 && sh.passed) && typeof stressWorked === "function") try { stressWorked(1); } catch (e) { /* older build */ }
    const m = story.m, title = STORY_TITLES[m];
    const next = () => {
      if (m <= 7 && sh.passed) {
        story.m = m + 1;
        C.emit("mission:passed", { mission: m, title: title });
      }
      s.day++;
      C.goHome();
    };
    if (m <= 7 && sh.passed) {
      storyPassed(title, sh.rating ? "Rating " + "★★★★★".slice(0, Math.round(sh.rating)) + "☆☆☆☆☆".slice(0, 5 - Math.round(sh.rating)) + " · paid " + yenText(pay) : "Paid " + yenText(pay));
      setTimeout(() => {
        if (m === 2) C.commute.assignFlat(next);
        else if (m === 4) C.commute.giveCar(next);
        else next();
      }, 5600);
    } else next();
  };
  C.goHome = function () {
    const s = S(), f = s.flat;
    story.step = "c:home";
    storyClearBlips();
    if (f) {
      storyBlip(f.door[0], f.door[1], "Home · " + f.name);
      storyObjective("Go home to your flat in " + f.area, s.car ? "The company car is where you left it. Or the train: Tōkonto Central's ticket gates, for " + f.station + "." : "Tōkonto Central is a short walk: the ticket gates, for " + f.station + ". Or book a Ryde (P).");
    } else {
      storyObjective("Find somewhere to sleep", "A capsule hotel will do until SOTI sorts you a flat.");
    }
    saveGame(null, true);
  };
  // asleep (in the flat, or a capsule): the next morning, at a quarter to seven
  C.sleep = function (where) {
    const s = S();
    const missed = story.step === "c:toWork" && s.shift && !s.shift.start;
    const fade = document.getElementById("fade"); if (fade) fade.style.opacity = "1";
    setTimeout(() => {
      if (typeof stressSetRaw === "function") stressSetRaw(0); else vitals.stress = 0;
      vitals.health = 1; vitals.slept = 60 * 8; vitals.awake = 0;
      const m = gameMinutes();
      if (m > 6 * 60 + 45) advanceGameMinutes(24 * 60 - m + 6 * 60 + 45); else setGameTime(6 * 60 + 45);
      if (missed) {
        s.missed++; s.day++;
        C.emit("shift:missed", {});
        setTimeout(() => notify("Messages", "Gondō Tetsuo", "Where WERE you yesterday?! No call, nothing. That's a day's pay gone, Seiko.", 9), 2600);
      }
      if (fade) fade.style.opacity = "0";
      say((where || "Slept") + " until morning. " + hhmm(gameMinutes()) + ".", 4);
      C.startDay();
    }, 900);
  };

  // ---- Mission 2 starts where the old Chapter 2 marker was ---------------------------------------------------------------------------------
  // (story.step "m2wait": the morning after the interview, the A marker at SOTI's door)
  C.beginFirstDay = function () {
    const s = S();
    s.day = 1;
    storyClearObjective(); storyClearBlips();
    if (!story.soti) return;
    const m = gameMinutes();
    s.shift = { day: 1, start: m, late: m > DAY_START + 1 && m < 20 * 60, done: false, passed: false, pay: 0, rating: 0, calm: 1 - (vitals.stress || 0) };
    if (m > DOORS_SHUT || m < DOORS_OPEN) setGameTime(8 * 60 + 50), s.shift.late = false;
    story.step = "c:floor";
    C.emit("shift:start", { late: s.shift.late, minutesLate: 0, mode: "desk", first: true });
    C.office.firstDayLobby(() => C.office.enter());
  };

  // ---- the wraps ---------------------------------------------------------------------------------------------------------------------------
  const was = {};
  const wrap = (name, make) => { if (typeof window[name] !== "function") { console.warn("[Career] missing " + name); return; } was[name] = window[name]; window[name] = make(was[name]); };
  C._was = was;

  wrap("storyNewGame", orig => function () { story.career = null; return orig.apply(this, arguments); });
  wrap("storyMarkerA", orig => function () { if (story.step === "m2wait") { C.beginFirstDay(); return; } return orig.apply(this, arguments); });
  wrap("storySotiDoor", orig => function (s) {
    if (story.step === "m2wait") { C.beginFirstDay(); return; }
    if (C.active() && (story.step === "c:toWork" || story.step === "c:floor")) { C.arrive(); return; }
    return orig.apply(this, arguments);
  });
  wrap("storySave", orig => function () { const d = orig.apply(this, arguments); d.career = story.career || null; return d; });
  wrap("storyLoad", orig => function (d) {
    orig.apply(this, arguments);
    story.career = d && d.career ? Object.assign(fresh(), d.career) : (d && d.m >= 2 ? fresh() : null);
    if (!d || !C.active()) return;
    // pick up the working day where the save left it (after konto.html's own pick-up, which knows nothing of these steps)
    setTimeout(() => C.resume(), 1700);
  });
  C.resume = function () {
    const s = S(), step = story.step;
    if (C.commute && C.commute.restore) C.commute.restore();
    if (step === "c:toWork") C.startDay();
    else if (step === "c:floor" || step === "c:desk") {
      // a day in progress goes back to the door: walk in again
      story.step = "c:floor"; storyClearBlips();
      const so = story.soti; if (so) storyBlip(so.door[0], so.door[1], "SOTI Tower · 3F");
      storyObjective("Back to work: SOTI Tower, 3F", "Your shift is still on.");
    } else if (step === "c:clockout") { story.step = "c:home"; C.goHome(); }
    else if (step === "c:home") C.goHome();
  };

  wrap("storyTick", orig => function (dt) {
    orig.apply(this, arguments);
    if (!C.active() || cut.active) return;
    const so = story.soti, el = document.getElementById("objective");
    if (story.step === "c:toWork") {
      const m = gameMinutes(), left = DAY_START - m;
      if (el) { const t = el.querySelector(".ot"); if (t) { const late = left < 0 && m < 20 * 60; t.textContent = (late ? "LATE  " : "") + hhmm(m) + (m < DAY_START && m > 5 * 60 ? "  ·  " + Math.floor(left) + " min to nine" : ""); t.classList.toggle("late", late); } }
    }
    if ((story.step === "c:toWork" || story.step === "c:floor") && so && !drive.car && !drive.train && !interior.active && player.placed &&
        Math.hypot(player.pos.x - so.door[0], player.pos.z - so.door[1]) < 4.2 && !(C._doorCool > clock)) {
      C._doorCool = clock + 4;
      C.arrive();
    }
    if (C.commute && C.commute.storyTick) C.commute.storyTick(dt);
  });

  wrap("interiorRoom", orig => function (s, opts) {
    if (s && s.brand === "sotifloor") return interior.rooms["soti:floor"] || (interior.rooms["soti:floor"] = C.office.buildFloor());
    if (s && s.brand === "flat") return interior.rooms["career:flat"] || (interior.rooms["career:flat"] = C.commute.buildFlat());
    return orig.apply(this, arguments);
  });
  ["sotifloor", "flat"].forEach(b => { if (INTERIOR_BRANDS.indexOf(b) < 0) INTERIOR_BRANDS.push(b); });
  wrap("interiorSpotAct", orig => function (sp) {
    if (sp && typeof sp.act === "string" && sp.act.indexOf("career:") === 0) {
      player.speed = 0; if (interior.prompt) interior.prompt.classList.remove("on");
      const a = sp.act.slice(7);
      if (C.office && C.office.spot(a, sp)) return;
      if (C.commute && C.commute.spot(a, sp)) return;
      return;
    }
    return orig.apply(this, arguments);
  });
  wrap("interiorLeave", orig => function (quiet) {
    const s = interior.active && interior.shop;
    const floor = s && s.brand === "sotifloor";
    if (floor && C.office.leaving) C.office.leaving();
    const r = orig.apply(this, arguments);
    if (floor && C.active()) {
      if (story.step === "c:clockout") C.clockOut();
      else if (story.step === "c:floor") {
        say("Gondō: “Oi! The shift isn't over!”", 3.5);
        const so = story.soti; storyClearBlips(); if (so) storyBlip(so.door[0], so.door[1], "SOTI Tower · 3F");
        storyObjective("Back to work: SOTI Tower, 3F", "Your shift is still on.");
      }
    }
    return r;
  });
  // a capsule hotel bed during the working story is a night like any other
  wrap("interiorPodAction", orig => function (a) {
    if (a === "sleep" && C.active() && interior.pod && typeof CAPSULE_FEE === "number" && purse.yen >= CAPSULE_FEE) {
      interiorPodClose(); purse.yen -= CAPSULE_FEE; C.sleep("Slept in the capsule"); return;
    }
    return orig.apply(this, arguments);
  });

  // ---- prompts and the F key -------------------------------------------------------------------------------------------------------------
  // (career-commute.js answers for stations and fuel pumps)
  C.prompts = [];
  wrap("updatePrompt", orig => function () {
    orig.apply(this, arguments);
    if (menu.on || cut.active || interior.active) return;
    for (const p of C.prompts) { const t = p.text(); if (t) { setPromptText(t); return; } }
  });
  wrap("useRide", orig => function () {
    if (menu.on) return;
    if (!interior.active && !cut.active) for (const p of C.prompts) { if (p.text() && p.use()) return; }
    return orig.apply(this, arguments);
  });

  // ---- a menu of choices, anywhere (dialogue, the ticket machine, the pump) ---------------------------------------------------------------
  const menu = C.menuState = { on: false, el: null, sel: 0, opts: [], cancel: null };
  function css() {
    if (document.getElementById("careercss")) return;
    const st = document.createElement("style"); st.id = "careercss";
    st.textContent = `
#cmenu{position:fixed;left:50%;bottom:6%;transform:translate(-50%,16px);z-index:60;width:min(680px,92vw);padding:16px 20px 12px;color:#fff;font-family:'Konto Sans','Segoe UI',system-ui,sans-serif;background:rgba(10,12,16,.88);border-top:3px solid #2a9ad6;opacity:0;transition:opacity .18s,transform .18s;pointer-events:none;box-shadow:0 18px 60px rgba(0,0,0,.45)}
#cmenu.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}
#cmenu .ch{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:21px;font-weight:800}
#cmenu .ch i{font-style:normal;font-size:13px;color:#8fd0ff;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
#cmenu .cb{margin:6px 0 12px;font-size:15px;line-height:1.45;color:#d3d9e0}
#cmenu .cb b{color:#fff}
#cmenu .co{display:flex;flex-direction:column;gap:6px}
#cmenu button{display:flex;gap:10px;align-items:baseline;text-align:left;padding:10px 14px;font:600 15px 'Konto Sans','Segoe UI',system-ui,sans-serif;color:#fff;background:rgba(255,255,255,.08);border:0;border-left:3px solid transparent;cursor:pointer}
#cmenu button u{text-decoration:none;font-weight:900;color:#8fd0ff;min-width:18px}
#cmenu button small{margin-left:auto;color:#9aa4ae;font-weight:600;font-size:12px}
#cmenu button.on{background:rgba(42,154,214,.28);border-left-color:#2a9ad6}
#cmenu button.dim{opacity:.45}
#cmenu .ck{margin-top:8px;font-size:12px;color:#8a939c}
#cfuel{position:fixed;right:28px;bottom:150px;z-index:31;width:150px;font:700 12px 'Konto Sans','Segoe UI',system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000;display:none}
#cfuel.on{display:block}
#cfuel .bar{height:7px;margin-top:4px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.35)}
#cfuel .bar i{display:block;height:100%;background:#ffd21c}
#cfuel.low .bar i{background:#ff4d3a}
#cfuel.low{animation:cfuelblink 1s steps(2) infinite}
@keyframes cfuelblink{50%{opacity:.55}}
`;
    document.head.appendChild(st);
  }
  C.css = css;
  // C.menu({ head, tag, body, opts: [{ label, note, fn, dim }], cancel, keep })  - fn runs after the menu closes unless keep is set
  C.menu = function (o) {
    css();
    if (!menu.el) { menu.el = document.createElement("div"); menu.el.id = "cmenu"; document.body.appendChild(menu.el); }
    menu.on = true; menu.o = o; menu.opts = o.opts || []; menu.sel = Math.max(0, menu.opts.findIndex(x => !x.dim)); menu.cancel = o.cancel || null;
    player.speed = 0; setPromptText(null);
    draw();
    menu.el.classList.add("on");
    if (phone.open) setPhone(false);
  };
  function draw() {
    const o = menu.o;
    menu.el.innerHTML = "<div class='ch'><span>" + (o.head || "") + "</span>" + (o.tag ? "<i>" + o.tag + "</i>" : "") + "</div>" + (o.body ? "<div class='cb'>" + o.body + "</div>" : "") +
      "<div class='co'>" + menu.opts.map((x, i) => "<button data-i='" + i + "' class='" + (i === menu.sel ? "on" : "") + (x.dim ? " dim" : "") + "'><u>" + (i + 1) + "</u><span>" + x.label + "</span>" + (x.note ? "<small>" + x.note + "</small>" : "") + "</button>").join("") + "</div>" +
      "<div class='ck'>" + (pad.index >= 0 ? "D-pad choose · A select" + (menu.cancel ? " · B back" : "") : "▲ ▼ or 1–" + menu.opts.length + " choose · Enter select" + (menu.cancel ? " · Esc back" : "")) + "</div>";
    menu.el.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { menu.sel = +b.dataset.i; pick(); }));
  }
  function close() { menu.on = false; if (menu.el) menu.el.classList.remove("on"); }
  C.menuClose = close;
  function pick() {
    const x = menu.opts[menu.sel]; if (!x || x.dim) return;
    if (!menu.o.keep) close();
    if (x.fn) try { x.fn(); } catch (e) { console.warn("[Career] menu:", e); }
  }
  function back() { if (!menu.cancel) return; const f = menu.cancel; close(); try { f(); } catch (e) { console.warn("[Career] menu:", e); } }
  function move(d) { const n = menu.opts.length; if (!n) return; for (let k = 0; k < n; k++) { menu.sel = (menu.sel + d + n) % n; if (!menu.opts[menu.sel].dim) break; } draw(); }
  window.addEventListener("keydown", e => {
    if (!menu.on) return;
    const k = e.code;
    if (k === "ArrowUp" || k === "KeyW") move(-1);
    else if (k === "ArrowDown" || k === "KeyS") move(1);
    else if (k === "Enter" || k === "Space" || k === "KeyE" || k === "KeyF") { if (!e.repeat) pick(); }
    else if (k === "Escape" || k === "Backspace") back();
    else if (/^Digit[1-9]$/.test(k)) { const i = +k.slice(5) - 1; if (menu.opts[i] && !menu.opts[i].dim) { menu.sel = i; draw(); pick(); } }
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  // the controller, read here because the game's own reading is not running while a menu is up
  const padWas = {};
  C.padPressed = function () {
    const gp = navigator.getGamepads ? navigator.getGamepads() : [];
    const g = gp && (gp[pad.index] || Array.from(gp).find(x => x)); if (!g) return {};
    const out = {}, b = i => !!(g.buttons[i] && g.buttons[i].pressed);
    const ax = g.axes[1] || 0;
    const now = { a: b(0), b: b(1), x: b(2), y: b(3), up: b(12) || ax < -0.6, down: b(13) || ax > 0.6, left: b(14) || (g.axes[0] || 0) < -0.6, right: b(15) || (g.axes[0] || 0) > 0.6 };
    for (const k in now) { out[k] = now[k] && !padWas[k]; padWas[k] = now[k]; }
    return out;
  };
  function menuPad() {
    const p = C.padPressed();
    if (p.up) move(-1); if (p.down) move(1); if (p.a) pick(); if (p.b) back();
  }

  // ---- the frame -------------------------------------------------------------------------------------------------------------------------
  // The desk (first person at the laptop) and an open menu own the frame; otherwise the game runs and the career's per-frame jobs follow it.
  const innerTick = window.tick;
  window.tick = function (dt) {
    if (typeof title === "object" && title.on) return innerTick(dt);
    if (C.desk && C.desk.on) { try { C.desk.frame(dt); } catch (e) { console.warn("[Career] desk frame:", e); C.desk.abort(); } return; }
    if (menu.on) {
      menuPad();
      if (actors.list.length) actorsTick(dt);
      if (interior.active && interior.room && interior.room.tick) interior.room.tick(dt);
      present();
      return;
    }
    innerTick(dt);
    try { if (C.commute && C.commute.frame) C.commute.frame(dt); if (C.office && C.office.frame) C.office.frame(dt); } catch (e) { console.warn("[Career] frame:", e); }
  };

  // ---- console ---------------------------------------------------------------------------------------------------------------------------
  // career.jump(m): skip to the start of mission m (2-8) the next morning, with what the missions before it would have given
  C.jump = function (m) {
    m = Math.max(2, Math.min(8, m | 0));
    const s = S();
    story.m = m;
    if (m >= 3 && !s.flat) C.commute.assignFlat(null, true);
    if (m >= 5) { s.promoted = true; if (!s.car) C.commute.giveCar(null, true); }
    if (drive.train && typeof leaveTrain === "function") leaveTrain();
    if (railTrip) railTrip.on = false;
    if (interior.active) interiorLeave(true);
    const f = s.flat;
    if (f) { const d = f.door; stepOutFrom(d, f.yaw); }
    setGameTime(7 * 60);
    C.startDay();
    return "Mission " + m + " · " + STORY_TITLES[m];
  };
  C.status = () => ({ m: story.m, step: story.step, state: S() });
  console.log("[Career] " + C.version + " · missions 2–8, the working day, the flat, the commute");
})();
