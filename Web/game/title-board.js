// ---- the title as a station departure board ---------------------------------------------------------------
// Salary Man's front screen is the thing every salaryman reads twice a day: the departures board. Each menu item is a
// train (New game is the rapid, Continue the local, Settings the limited express, the car radio a special service),
// with its own departure time off the real clock, a type badge in the line colours, the destination in Japanese and
// English, and a platform number. Moving the selection flips the row like a split-flap board and plays the first notes
// of a station departure melody; choosing plays the door chime. A commuter pass shows the saved game when there is one,
// and an LED ticker runs the station announcements along the bottom.
//
// Only presentation changes: the buttons keep their ids, title.sel and titleChoose() drive everything as before.
// Off switch: ?board=0.
(function () {
  if (/[?&]board=0\b/.test(location.search)) return;

  const ROWS = {
    tnew:      { kind: "快速", kindEn: "RAPID",    col: "#ff8a1c", jp: "新しい人生",   en: "New game",            plat: 1, gap: 3 },
    tcontinue: { kind: "各停", kindEn: "LOCAL",    col: "#2fbf6a", jp: "つづきから",   en: "Continue",            plat: 2, gap: 6 },
    tsettings: { kind: "特急", kindEn: "LTD. EXP", col: "#e5413b", jp: "設定",         en: "Settings",            plat: 3, gap: 11 },
    tspotify:  { kind: "臨時", kindEn: "SPECIAL",  col: "#3b8ee2", jp: "カーラジオ",   en: "Car radio · Spotify", plat: 4, gap: 17 },
    tquit:     { kind: "回送", kindEn: "NOT IN SERVICE", col: "#7d848c", jp: "終電",   en: "Quit",                plat: 5, gap: 24 }
  };
  const TICKER = [
    "本日も東都線をご利用いただき、ありがとうございます",
    "Thank you for commuting with the Tōkonto Line today",
    "駆け込み乗車はおやめください · Please do not rush onto the train",
    "The next rapid service stops at SOTI Tower-mae, Kanda, and Mizuho",
    "黄色い線の内側までお下がりください · Please stand behind the yellow line",
    "Overtime is not a timetable",
    "優先席付近では携帯電話の電源をお切りください",
    "Last train from Shigoto-mae departs at 00:41"
  ];

  const css = `
  #titlepanel { width: min(560px, 50vw) !important; }
  #titlelogo { margin-bottom: 18px !important; filter: drop-shadow(0 8px 24px rgba(0,0,0,.55)); }
  #tb-board { position: relative; background: linear-gradient(180deg, #0b0d10 0%, #07080a 100%); border: 1px solid #23282f;
    border-radius: 6px; box-shadow: 0 18px 50px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05); overflow: hidden; }
  #tb-board::after { content: ""; position: absolute; inset: 0; pointer-events: none;
    background: repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 1px, transparent 1px 3px); mix-blend-mode: multiply; }
  #tb-head { display: flex; align-items: baseline; gap: 12px; padding: 10px 16px 8px; border-bottom: 1px solid #1d2229;
    font: 700 13px/1 var(--ui); letter-spacing: .14em; color: #c9ced4; background: #101317; }
  #tb-head .jp { font-size: 15px; letter-spacing: .3em; color: #fff; }
  #tb-head .clock { margin-left: auto; font: 500 22px/1 var(--data); letter-spacing: .06em; color: #ffb21c; text-shadow: 0 0 10px rgba(255,170,30,.55); }
  #tb-head .clock i { font-style: normal; animation: tbblink 1s steps(1) infinite; }
  @keyframes tbblink { 50% { opacity: .15; } }
  #tb-cols { display: grid; grid-template-columns: 74px 92px 1fr 46px; gap: 0 12px; padding: 6px 16px 4px;
    font: 600 10px/1 var(--data); letter-spacing: .16em; color: #59616b; text-transform: uppercase; }
  #titlemenu { gap: 0 !important; }
  #titlemenu .title-btn { display: grid !important; grid-template-columns: 74px 92px 1fr 46px; gap: 0 12px; align-items: center;
    padding: 9px 16px !important; border: 0 !important; border-top: 1px solid #161a1f !important; border-radius: 0;
    background: transparent; color: #d6dbe0; text-transform: none; letter-spacing: 0; transition: background .18s ease; position: relative; }
  #titlemenu .title-btn[hidden] { display: none !important; }
  #titlemenu .title-btn:hover { background: rgba(255,255,255,.035); }
  #titlemenu .title-btn.sel { background: linear-gradient(90deg, rgba(255,178,28,.16), rgba(255,178,28,.02) 70%) !important; padding-left: 16px !important; }
  #titlemenu .title-btn.sel::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: #ffb21c; box-shadow: 0 0 12px #ffb21c; }
  .tb-time { font: 500 21px/1 var(--data); color: #ffb21c; letter-spacing: .04em; text-shadow: 0 0 8px rgba(255,170,30,.45); }
  .tb-kind { justify-self: start; padding: 4px 7px 3px; border-radius: 2px; font: 800 13px/1 var(--ui); color: #fff; letter-spacing: .08em; white-space: nowrap; }
  .tb-kind small { display: block; margin-top: 3px; font: 700 8px/1 var(--data); letter-spacing: .12em; opacity: .9; }
  .tb-dest { overflow: hidden; white-space: nowrap; }
  .tb-dest b { display: block; font: 700 19px/1.05 var(--ui); color: #fff; letter-spacing: .06em; }
  .tb-dest span { display: block; margin-top: 3px; font: 600 11px/1 var(--data); letter-spacing: .14em; color: #8d959e; text-transform: uppercase; }
  .tb-plat { justify-self: end; width: 34px; height: 34px; border-radius: 50%; border: 2px solid #3a4048; display: grid; place-items: center;
    font: 700 16px/1 var(--data); color: #e8ebee; }
  .title-btn.sel .tb-plat { border-color: #ffb21c; color: #ffb21c; box-shadow: 0 0 12px rgba(255,178,28,.35); }
  .title-btn.sel .tb-dest span::after { content: "  ▶ NOW BOARDING"; color: #ffb21c; animation: tbblink 1.1s steps(1) infinite; }
  .tb-flip { animation: tbflip .32s cubic-bezier(.3,.7,.3,1) both; transform-origin: 50% 0; }
  .tb-flip:nth-child(2) { animation-delay: .04s; } .tb-flip:nth-child(3) { animation-delay: .08s; } .tb-flip:nth-child(4) { animation-delay: .12s; }
  @keyframes tbflip { 0% { transform: perspective(300px) rotateX(-88deg); opacity: .2; filter: brightness(1.8); } 60% { transform: perspective(300px) rotateX(12deg); opacity: 1; } 100% { transform: none; filter: none; } }
  #title.up #titlemenu .title-btn { animation: tbrow .55s cubic-bezier(.2,.7,.2,1) both; }
  #title.up #titlemenu .title-btn:nth-child(1) { animation-delay: .35s; } #title.up #titlemenu .title-btn:nth-child(2) { animation-delay: .45s; }
  #title.up #titlemenu .title-btn:nth-child(3) { animation-delay: .55s; } #title.up #titlemenu .title-btn:nth-child(4) { animation-delay: .65s; }
  #title.up #titlemenu .title-btn:nth-child(5) { animation-delay: .75s; }
  @keyframes tbrow { from { opacity: 0; transform: perspective(400px) rotateX(-70deg); } to { opacity: 1; transform: none; } }
  #titlehint { margin-top: 14px !important; display: flex; gap: 14px; align-items: center; }
  #titlehint kbd { display: inline-block; min-width: 18px; padding: 3px 6px; margin-right: 6px; border: 1px solid #3a4048; border-bottom-width: 2px; border-radius: 3px;
    font: 600 11px/1 var(--data); color: #d6dbe0; text-align: center; }
  #tb-pass { position: absolute; right: clamp(24px, 5vw, 90px); top: clamp(24px, 7vh, 80px); width: 300px; height: 186px; border-radius: 12px; overflow: hidden;
    background: linear-gradient(135deg, #f4f6f2 0%, #dfe7e2 55%, #c9d8cf 100%); color: #18201c; box-shadow: 0 22px 50px rgba(0,0,0,.5);
    transform: rotate(-4deg); opacity: 0; transition: opacity .8s ease .9s, transform .8s cubic-bezier(.2,.7,.2,1) .9s; font-family: var(--ui); }
  #title.up #tb-pass.on { opacity: 1; transform: rotate(-2.5deg); }
  #tb-pass .band { height: 34px; background: linear-gradient(90deg, #1f8a4c, #2fbf6a); color: #fff; display: flex; align-items: center; padding: 0 14px;
    font: 800 13px/1 var(--ui); letter-spacing: .18em; }
  #tb-pass .band i { margin-left: auto; font: 700 10px/1 var(--data); letter-spacing: .1em; font-style: normal; opacity: .9; }
  #tb-pass .route { padding: 12px 14px 0; font: 800 22px/1 var(--ui); letter-spacing: .06em; }
  #tb-pass .route small { display: block; margin-top: 4px; font: 600 10px/1 var(--data); letter-spacing: .14em; color: #4c5a52; }
  #tb-pass .row { display: flex; justify-content: space-between; padding: 10px 14px 0; font: 600 11px/1.3 var(--data); color: #33403a; letter-spacing: .06em; }
  #tb-pass .row b { display: block; font: 700 17px/1.1 var(--data); color: #111; }
  #tb-pass .chip { position: absolute; right: 16px; bottom: 16px; width: 40px; height: 30px; border-radius: 5px;
    background: linear-gradient(135deg, #e9d48a, #b99a3e); box-shadow: inset 0 0 0 1px rgba(0,0,0,.2); }
  #tb-pass .chip::before { content: ""; position: absolute; inset: 7px 12px; border: 1px solid rgba(0,0,0,.25); border-radius: 2px; }
  #titlefoot { left: 0 !important; right: 0 !important; bottom: 0 !important; padding: 0 !important; transform: none !important; }
  #tb-ticker { position: relative; height: 34px; overflow: hidden; background: #050607; border-top: 1px solid #1d2229; }
  #tb-ticker .run { position: absolute; top: 0; white-space: nowrap; font: 500 17px/34px var(--data); color: #ff9a1c; letter-spacing: .08em;
    text-shadow: 0 0 6px rgba(255,140,20,.7); animation: tbrun 80s linear infinite; }
  #tb-ticker::after { content: ""; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(circle, transparent 0 1px, rgba(5,6,7,.55) 1.4px) 0 0 / 4px 4px; }
  @keyframes tbrun { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }
  #titlestage { display: none; }
  #title #titleveil { background:
      linear-gradient(100deg, rgba(6,7,9,.92) 0%, rgba(6,7,9,.70) 30%, rgba(6,7,9,.18) 55%, rgba(6,7,9,0) 70%),
      linear-gradient(0deg, rgba(6,7,9,.7) 0%, rgba(6,7,9,0) 26%),
      radial-gradient(120% 90% at 70% 40%, transparent 55%, rgba(0,0,0,.45) 100%) !important; }
  #title::before, #title::after { content: ""; position: absolute; left: 0; right: 0; height: 9vh; background: #000; z-index: 3; pointer-events: none;
    transition: transform 1.3s cubic-bezier(.7,0,.2,1) .15s; }
  #title::before { top: 0; } #title::after { bottom: 0; }
  #title.up::before { transform: translateY(-100%); } #title.up::after { transform: translateY(100%); }
  @media (max-width: 760px) { #tb-pass { display: none; } #titlepanel { width: 92vw !important; } }
  `;

  // a departure melody: the first bar of a made-up station jingle, and the two-tone door chime
  let ac = null;
  function tone(f, t0, d, v, type) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0, ac.currentTime + t0); g.gain.linearRampToValueAtTime(v, ac.currentTime + t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + d);
    o.connect(g); g.connect(ac.destination); o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + d + 0.05);
  }
  function sound(kind) {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === "suspended") ac.resume();
      const vol = 0.06 * (typeof settings !== "undefined" && settings && settings.sfx !== undefined ? settings.sfx : 1);
      if (kind === "move") { tone(1318.5, 0, 0.16, vol, "triangle"); tone(1975.5, 0, 0.12, vol * 0.25); }
      else if (kind === "go") { [659.3, 830.6, 987.8, 1318.5].forEach((f, i) => tone(f, i * 0.11, 0.5, vol * 1.2, "triangle")); tone(2637, 0.44, 0.7, vol * 0.3); }
      else if (kind === "door") { tone(1046.5, 0, 0.6, vol * 1.4, "sine"); tone(830.6, 0.3, 0.9, vol * 1.4, "sine"); }
    } catch (e) { /* no audio yet */ }
  }

  function hhmm(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }

  function build() {
    const menu = document.getElementById("titlemenu"), panel = document.getElementById("titlepanel"), title = document.getElementById("title");
    if (!menu || !panel || !title || document.getElementById("tb-board")) return;
    const st = document.createElement("style"); st.id = "tb-css"; st.textContent = css; document.head.appendChild(st);
    // the board around the menu
    const board = document.createElement("div"); board.id = "tb-board";
    board.innerHTML = '<div id="tb-head"><span class="jp">発車案内</span><span>DEPARTURES</span><span class="clock" id="tb-clock">--<i>:</i>--</span></div>' +
      '<div id="tb-cols"><span>Time</span><span>Service</span><span>Destination</span><span>Plat.</span></div>';
    menu.parentNode.insertBefore(board, menu); board.appendChild(menu);
    menu.querySelectorAll(".title-btn").forEach(b => {
      const r = ROWS[b.id]; if (!r) return;
      b.setAttribute("aria-label", r.en);
      b.innerHTML = '<span class="tb-time" data-gap="' + r.gap + '">--:--</span>' +
        '<span class="tb-kind" style="background:' + r.col + '">' + r.kind + '<small>' + r.kindEn + '</small></span>' +
        '<span class="tb-dest"><b>' + r.jp + '</b><span>' + r.en + '</span></span><span class="tb-plat">' + r.plat + '</span>';
    });
    const hint = document.getElementById("titlehint");
    if (hint) {
      const add = document.getElementById("addhint"), keep = add ? add.innerHTML : "";
      hint.innerHTML = '<span><kbd>↑</kbd><kbd>↓</kbd>choose</span><span><kbd>Enter</kbd>board</span><span><kbd>A</kbd>on the controller</span>';
      if (keep) { const a = document.createElement("div"); a.id = "addhint"; a.style.cssText = "margin-top:10px;font-size:10px;line-height:1.7;color:#6f767e"; a.innerHTML = keep.replace(/^<br>/, ""); hint.parentNode.insertBefore(a, hint.nextSibling); }
    }
    // the commuter pass, for a saved game
    const pass = document.createElement("div"); pass.id = "tb-pass";
    pass.innerHTML = '<div class="band">KONTO PASS<i>定期券 · IC</i></div><div class="route">東都 ⇄ 仕事前<small>TŌKONTO ⇄ SHIGOTO-MAE</small></div>' +
      '<div class="row"><div>HOLDER<b>SHIGU SEIKO</b></div><div>BALANCE<b id="tb-bal">¥—</b></div></div><div class="row"><div>VALID UNTIL<b id="tb-valid">—</b></div></div><div class="chip"></div>';
    title.appendChild(pass);
    // the ticker
    const foot = document.getElementById("titlefoot");
    if (foot) { const tk = document.createElement("div"); tk.id = "tb-ticker"; tk.innerHTML = '<div class="run">' + TICKER.join("　　◆　　") + '</div>'; foot.appendChild(tk); }
    tick(); setInterval(tick, 1000);
  }

  function tick() {
    const now = new Date();
    const c = document.getElementById("tb-clock");
    if (c) c.innerHTML = String(now.getHours()).padStart(2, "0") + "<i>:</i>" + String(now.getMinutes()).padStart(2, "0");
    document.querySelectorAll(".tb-time").forEach(t => { const g = +t.dataset.gap || 0; t.textContent = hhmm(new Date(now.getTime() + g * 60000)); });
    const pass = document.getElementById("tb-pass"), cont = document.getElementById("tcontinue");
    if (pass) {
      const on = !!(cont && !cont.hidden);
      pass.classList.toggle("on", on);
      if (on) {
        const m = document.getElementById("money"), b = document.getElementById("tb-bal"), v = document.getElementById("tb-valid");
        if (b && m) b.textContent = m.textContent.trim();
        if (v) { const d = new Date(now.getTime() + 30 * 86400000); v.textContent = d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0"); }
      }
    }
  }

  // flip the newly selected row, with the melody's first note; the door chime when a train is chosen
  let lastSel = null;
  function hookSync() {
    if (typeof window.titleSync !== "function" || window.titleSync.__board) return false;
    const orig = window.titleSync;
    window.titleSync = function () {
      const r = orig.apply(this, arguments);
      const sel = document.querySelector("#titlemenu .title-btn.sel");
      if (sel && sel !== lastSel) {
        if (lastSel) sound("move");
        lastSel = sel;
        sel.querySelectorAll(".tb-time, .tb-kind, .tb-dest, .tb-plat").forEach(e => { e.classList.remove("tb-flip"); void e.offsetWidth; e.classList.add("tb-flip"); });
      }
      return r;
    };
    window.titleSync.__board = true;
    if (typeof window.titleChoose === "function" && !window.titleChoose.__board) {
      const oc = window.titleChoose;
      window.titleChoose = function () {
        try { const sel = document.querySelector("#titlemenu .title-btn.sel"); sound(sel && (sel.id === "tnew" || sel.id === "tcontinue") ? "door" : "go"); } catch (e) { /* silent */ }
        return oc.apply(this, arguments);
      };
      window.titleChoose.__board = true;
    }
    return true;
  }

  function init() { try { build(); hookSync(); } catch (e) { console.warn("[title board]", e); } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.titleBoard = { version: "1.0.0", sound };
})();
