// Mission flow: the frame around every mission, the part a player notices before the content.
//
//   * A title card when a mission begins (SOTI's days and the Kurogane-kai's jobs): the name, what Seiko is now, and a music sting.
//   * MISSION PASSED with a results panel: time taken, a medal from the day's stars (gold, silver, bronze), what it paid, what it did to
//     his name. The same pass shown twice within a few seconds is shown once.
//   * MISSION FAILED, with the reason and a choice: retry from the last checkpoint (the last place he was sent or the last fight he
//     started; health topped up, the police off his back) or walk away. Before this a failed job printed one line and the whole job
//     had to be fetched again from its contact. After-hours failures get the banner.
//   * When Seiko collapses outside a mission (health gone), a short HOSPITALISED card instead of a line of text.
//
// It sits on quest.js (window.quest), career.js and storyPassed; nothing in the missions themselves changes.
// Console: missionflow.card("Title", "kicker"), missionflow.passed(...), missionflow.failed("why"), missionflow.status().
(function () {
  "use strict";
  const Q = window.quest, C = window.career;
  if (!Q || !C || typeof storyPassed !== "function") { console.warn("[MissionFlow] the story is not in this build"); return; }
  const MF = window.missionflow = { version: "1.0.0" };
  const sting = k => { try { if (window.soundscape) soundscape.sting(k); } catch (e) { /* quiet */ } };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const honorNow = () => { try { return window.standing && standing.honor ? standing.honor.value : 0; } catch (e) { return 0; } };

  // ---- the look -----------------------------------------------------------------------------------------------------------------------------
  const css = document.createElement("style");
  css.textContent = `
  #mfcard { position: fixed; left: 0; right: 0; top: 27vh; z-index: 34; text-align: center; pointer-events: none; opacity: 0; font-family: var(--ui); }
  #mfcard.on { animation: mfcard 4.6s cubic-bezier(.2,.7,.2,1) both; }
  @keyframes mfcard { 0% { opacity: 0; letter-spacing: 0.32em; } 12% { opacity: 1; letter-spacing: 0.06em; } 80% { opacity: 1; } 100% { opacity: 0; } }
  #mfcard .k { font: 700 clamp(11px, 1vw, 14px) var(--ui); letter-spacing: 0.34em; text-transform: uppercase; color: #f2c230; text-shadow: 0 2px 8px rgba(0,0,0,.8); }
  #mfcard .t { font: 900 clamp(34px, 4.6vw, 68px) var(--ui); color: #fff; letter-spacing: inherit; margin: 6px 0 8px; text-shadow: 0 3px 0 rgba(0,0,0,.55), 0 0 26px rgba(0,0,0,.55); }
  #mfcard .r { width: min(340px, 50vw); height: 2px; margin: 0 auto; background: linear-gradient(90deg, transparent, #f2c230, transparent); }
  #mpassed .mfstats { display: inline-grid; grid-template-columns: auto auto; gap: 6px 34px; margin-top: 18px; padding: 14px 26px 12px; text-align: left;
    background: linear-gradient(180deg, rgba(10,12,16,.72), rgba(10,12,16,.5)); border-top: 2px solid #f2c230; font: 600 clamp(13px, 1.15vw, 17px) var(--ui); color: #fff; text-shadow: 0 1px 3px #000; }
  #mpassed .mfstats span { color: rgba(255,255,255,.7); font-weight: 500; }
  #mpassed .mfstats b { text-align: right; font-weight: 700; }
  #mpassed .mfmedal { display: block; margin: 12px auto 0; font: 900 clamp(13px, 1.2vw, 17px) var(--ui); letter-spacing: .3em; }
  #mpassed .mfmedal.gold { color: #f2c230; } #mpassed .mfmedal.silver { color: #d6dbe2; } #mpassed .mfmedal.bronze { color: #cf8d5a; }
  #mpassed.mflong.on { animation: mpasslong 7.2s ease both; }
  @keyframes mpasslong { 0% { opacity: 0; transform: scale(1.08); } 6% { opacity: 1; transform: none; } 88% { opacity: 1; } 100% { opacity: 0; } }
  #mffail { position: fixed; inset: 0; z-index: 33; pointer-events: none; opacity: 0; transition: opacity .5s ease; text-align: center; font-family: var(--ui);
    background: radial-gradient(ellipse at center, rgba(0,0,0,.15) 0%, rgba(0,0,0,.62) 78%); backdrop-filter: grayscale(.85) contrast(1.05); -webkit-backdrop-filter: grayscale(.85) contrast(1.05); }
  #mffail.on { opacity: 1; }
  #mffail .f1 { margin-top: 24vh; font: 900 clamp(34px, 5vw, 74px) var(--ui); color: #d8443c; letter-spacing: .04em; text-shadow: 0 3px 0 #000, 0 0 18px rgba(0,0,0,.6); }
  #mffail .f2 { font: 700 clamp(17px, 1.8vw, 26px) var(--ui); color: #fff; margin-top: 6px; text-shadow: 0 2px 6px #000; }
  #mffail .f3 { font: 500 clamp(14px, 1.3vw, 18px) var(--ui); color: rgba(255,255,255,.85); margin-top: 10px; text-shadow: 0 2px 6px #000; }
  `;
  document.head.appendChild(css);
  const el = id => { let e = document.getElementById(id); if (!e) { e = document.createElement("div"); e.id = id; document.body.appendChild(e); } return e; };

  // ---- the title card ---------------------------------------------------------------------------------------------------------------------------
  MF.card = function (title, kicker) {
    const e = el("mfcard");
    e.innerHTML = "<div class='k'>" + esc(kicker || "") + "</div><div class='t'>" + esc(title) + "</div><div class='r'></div>";
    e.classList.remove("on"); void e.offsetWidth; e.classList.add("on");
    sting("start");
  };

  // ---- what a mission has done so far -------------------------------------------------------------------------------------------------------------
  let run = null;          // { title, t0, honor0, yen0, rating }
  const begin = (title, extra) => { run = Object.assign({ title: title, t0: performance.now(), honor0: honorNow(), yen0: (typeof purse === "object" ? purse.yen : 0), rating: 0 }, extra || {}); };
  MF.status = () => ({ run: run, checkpoint: rec ? { id: rec.def.id, at: rec.cp, base: rec.base } : null });

  C.on("shift:start", d => {
    if (story.m > C.FINAL) return;
    const title = (typeof STORY_TITLES === "object" && STORY_TITLES[story.m]) || "SOTI";
    begin(title);
    let kick = "SOTI · Mission " + story.m;
    try { if (C.saga && C.saga.rank) kick += " · " + C.saga.rank().name; } catch (e) { /* no ladder */ }
    setTimeout(() => MF.card(title, kick), d && d.first ? 2600 : 900);
  });

  // ---- MISSION PASSED, with the results -------------------------------------------------------------------------------------------------------------
  let lastPass = { key: "", t: 0 };
  const passWas = window.storyPassed;
  window.storyPassed = function (title, sub) {
    const key = title + "|" + sub, now = performance.now();
    if (key === lastPass.key && now - lastPass.t < 9000) return;           // the same pass twice: once is the moment, twice is a bug
    lastPass = { key: key, t: now };
    const r = passWas.apply(this, arguments);
    try { decorate(title, sub); } catch (e) { console.warn("[MissionFlow] passed:", e); }
    return r;
  };
  function medalOf(stars) { return stars >= 5 ? ["gold", "GOLD"] : stars >= 4 ? ["silver", "SILVER"] : stars >= 3 ? ["bronze", "BRONZE"] : null; }
  function decorate(title, sub) {
    const e = document.getElementById("mpassed"); if (!e) return;
    sting("pass");
    if (!run || run.title !== title) { if (!run || performance.now() - run.t0 > 3 * 3600e3) return; }
    const secs = Math.max(1, Math.round((performance.now() - run.t0) / 1000));
    const stars = (String(sub || "").match(/★/g) || []).length || run.rating || 0;
    const dh = Math.round(honorNow() - run.honor0);
    const yen = (typeof purse === "object" ? purse.yen : 0) - run.yen0;
    const rows = [["Time", Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0")]];
    if (stars) rows.push(["Rating", "★★★★★".slice(0, stars) + "☆☆☆☆☆".slice(0, 5 - stars)]);
    if (yen > 0) rows.push(["Earned", typeof yenText === "function" ? yenText(yen) : "¥" + yen]);
    if (dh) rows.push(["Honor", (dh > 0 ? "+" : "−") + Math.abs(dh)]);
    const m = medalOf(stars);
    e.insertAdjacentHTML("beforeend", "<div class='mfstats'>" + rows.map(x => "<span>" + x[0] + "</span><b>" + esc(x[1]) + "</b>").join("") + "</div>" + (m ? "<span class='mfmedal " + m[0] + "'>" + m[1] + "</span>" : ""));
    e.classList.add("mflong");
    clearTimeout(decorate.t); decorate.t = setTimeout(() => { e.classList.remove("on", "mflong"); }, 7200);
    try { const s = C.state && C.state(); if (s) { s.medals = s.medals || {}; const k = run.title; const best = s.medals[k] || 0; if (stars > best) s.medals[k] = stars; } } catch (e2) { /* no save */ }
    run = null;
  }
  // the pay lands after the pass is shown on a SOTI day: count it from the shift's own record
  C.on("shift:end", d => { if (run && d && d.rating) run.rating = Math.round(d.rating); });

  // ---- checkpoints and MISSION FAILED -----------------------------------------------------------------------------------------------------------------
  let rec = null;          // the mission running: { def, done, cp, base, job }
  const runWas = Q.run;
  Q.run = function (def, done, opts) {
    const retry = !!(opts && opts.retry);
    const r = { def: retry ? opts.full : def, done: done, cp: retry ? opts.base : 0, base: retry ? opts.base : 0, job: C.yakuza ? C.yakuza.job : null, says: [] };
    rec = r;
    const runDef = retry ? Object.assign({}, def) : def;
    if (!retry && def && /^yk:/.test(def.id || "")) {
      begin(def.title);
      setTimeout(() => MF.card(def.title, "Kurogane-kai" + (C.yakuza && C.yakuza.rankName ? " · " + C.yakuza.rankName() : "")), 400);
    }
    // a failure waits for the player's choice: Retry runs the mission again from the checkpoint (and its own ending is what reports back),
    // Quit hands the failure to whoever started the mission, as before
    const wrapped = ctx => {
      if (ctx && ctx.failed && rec === r) {
        try { failed(r, ctx, () => done && done(ctx)); return; } catch (e) { console.warn("[MissionFlow] failed:", e); }
      }
      return done && done(ctx);
    };
    return runWas.call(this, runDef, wrapped);
  };
  // the checkpoint moves on each time he is sent somewhere new or a fight starts
  const nextWas = Q.next;
  Q.next = function () {
    const r = nextWas.apply(this, arguments);
    try {
      const q = Q.cur;
      if (q && rec && q.step && (q.step.go || q.step.fight)) rec.cp = rec.base + q.i;
    } catch (e) { /* quiet */ }
    return r;
  };
  const sayWas = window.say;
  window.say = function (text) {
    try {
      if (rec) { rec.says.push(String(text)); if (rec.says.length > 4) rec.says.shift(); }
      const m = /^Mission failed\s*·\s*(.+)$/.exec(String(text));
      if (m) { banner(m[1].split(" · ")[0], m[1].split(" · ").slice(1).join(" · ") || ""); sting("fail"); return; }
    } catch (e) { /* quiet */ }
    return sayWas.apply(this, arguments);
  };
  function banner(title, why) {
    const e = el("mffail");
    e.innerHTML = "<div class='f1'>MISSION FAILED</div><div class='f2'>" + esc(title) + "</div>" + (why ? "<div class='f3'>" + esc(why) + "</div>" : "");
    e.classList.add("on");
    clearTimeout(banner.t); banner.t = setTimeout(() => e.classList.remove("on"), 5200);
    return e;
  }
  function failed(r, ctx, quit) {
    const why = ctx.why || (r.says.length ? r.says[r.says.length - 1] : "");
    run = null;
    sting("fail");
    const title = r.def.title || "The job";
    const e = banner(title, why);
    clearTimeout(banner.t);
    const steps = r.def.steps || [], cp = Math.max(0, Math.min(steps.length - 1, r.cp | 0));
    setTimeout(() => {
      if (C.menuState && C.menuState.on) C.menuClose();
      C.menu({ head: "Mission failed", tag: title, body: (why ? esc(why) + "<br>" : "") + "<i>Retry puts you back at the last checkpoint.</i>", opts: [
        { label: "Retry from the checkpoint", note: cp ? "step " + (cp + 1) + " of " + steps.length : "from the start", fn: () => { e.classList.remove("on"); retry(r, cp); } },
        { label: "Quit the mission", fn: () => { e.classList.remove("on"); try { quit(); } catch (e2) { console.warn("[MissionFlow] quit:", e2); } } }] });
    }, 1700);
  }
  function retry(r, cp) {
    try { if (typeof vitals === "object") vitals.health = Math.max(vitals.health, 1); } catch (e) { /* none */ }
    try { if (typeof wanted === "object") wanted.stars = 0; if (typeof policeClear === "function") policeClear(); } catch (e) { /* none */ }
    if (C.yakuza && r.job) C.yakuza.job = r.job;
    const def = Object.assign({}, r.def, { steps: (r.def.steps || []).slice(cp) });
    begin(r.def.title);
    say("Checkpoint.", 2);
    Q.run(def, r.done, { retry: true, full: r.def, base: cp });
  }
  MF.failed = why => banner("Test", why);

  // ---- collapsing outside a mission ---------------------------------------------------------------------------------------------------------------------
  if (typeof window.collapse === "function") {
    const was = window.collapse;
    window.collapse = function () {
      const r = was.apply(this, arguments);
      try {
        if (!Q.active()) {
          const e = el("mffail");
          e.innerHTML = "<div class='f1' style='color:#e9e4da'>HOSPITALISED</div><div class='f3'>Tōkonto's doctors are good. They are not cheap.</div>";
          e.classList.add("on"); sting("fail");
          clearTimeout(banner.t); banner.t = setTimeout(() => e.classList.remove("on"), 4200);
        }
      } catch (e) { /* quiet */ }
      return r;
    };
  }

  console.log("[MissionFlow] " + MF.version + " · title cards, results, checkpoints and retry");
})();
