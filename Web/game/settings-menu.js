// Settings, laid out the way the big open-world games lay them out: a category at the top (Display, Graphics, Audio, Camera, Controls,
// Keyboard, Subtitles, HUD, Gameplay), one setting per row as "name   ◀ value ▶", left and right change the value, and a line under
// the list says what the selected setting does. Everything is kept in gameSet (konto.settings.v1) with the rest of the settings.
//
//   Display     brightness, HUD safe zone, interface layout, interface motion
//   Graphics    the existing quality, resolution, finish, shadows, PC mode, adaptive graphics rows
//   Audio       the soundscape volumes (master, effects, ambience, music and radio, voices)
//   Camera      field of view on foot and in a vehicle, camera shake in cutscenes
//   Controls    look speed, invert look, controller vibration
//   Keyboard    every gameplay key can be rebound (a key already in use swaps with it); reset to defaults
//   Subtitles   on/off, size, a dark box behind the text
//   HUD         the HUD, the minimap, notifications, the objective line
//   Gameplay    how cutscenes are skipped (press twice / hold), autosave, offering to skip a section after three failures
//
// Rebinding works under the game: a rebound key is translated into the key the game listens for before anything else sees it, so no
// handler in konto.html had to change. Menus keep their fixed keys. Console: settingsMenu.binds(), settingsMenu.cat("audio").
(function () {
  "use strict";
  if (typeof gameSet !== "object" || typeof PAUSE_ROWS !== "object") { console.warn("[Settings] no pause menu in this build"); return; }
  const SM = window.settingsMenu = { version: "1.0.0" };
  const save = () => { try { saveSettings(); } catch (e) { /* not kept */ } };
  const DEF = { bright: 1, safe: 0, fovFoot: 58, fovCar: 62, camShake: true, subs: true, subSize: "m", subBg: false, hud: true, minimap: true, notifs: true, objective: true, cutSkip: "press", autosave: true, skipOffer: true };
  for (const k in DEF) if (gameSet[k] === undefined) gameSet[k] = DEF[k];
  if (!gameSet.keys || typeof gameSet.keys !== "object") gameSet.keys = {};

  // ---- the look -----------------------------------------------------------------------------------------------------------------------------------
  const css = document.createElement("style");
  css.textContent = `
  #psettings .menu-btn { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  #psettings .menu-btn .sl { flex: 1 1 auto; min-width: 0; }
  #psettings .menu-btn .sv { flex: 0 0 auto; max-width: 58%; text-align: right; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #psettings .menu-btn.sel .sv::before { content: "◀ "; opacity: .55; font-size: .8em; }
  #psettings .menu-btn.sel .sv::after { content: " ▶"; opacity: .55; font-size: .8em; }
  #psettings .menu-btn.act .sv::before, #psettings .menu-btn.act .sv::after { content: none; }
  #psettings #mcat { font-weight: 700; letter-spacing: .06em; text-transform: uppercase; border-bottom: 2px solid #f2c230; margin-bottom: 6px; }
  #psettings #mcat .sv { color: #f2c230; }
  #psettings .menu-btn.cap .sv { color: #f2c230; animation: smblink 1s steps(2) infinite; }
  @keyframes smblink { 50% { opacity: .35; } }
  #psetdesc { min-height: 3.2em; color: rgba(255,255,255,.86); line-height: 1.45; }
  body[data-subs="off"] #cutsub { display: none !important; }
  body[data-subsize="s"] #cutsub { font-size: clamp(15px, 1.6vw, 22px); }
  body[data-subsize="l"] #cutsub { font-size: clamp(22px, 2.7vw, 38px); }
  body[data-subsize="xl"] #cutsub { font-size: clamp(26px, 3.3vw, 46px); }
  body[data-subbg="on"] #cutsub span { background: rgba(0,0,0,.72); padding: 2px 10px 4px; box-decoration-break: clone; -webkit-box-decoration-break: clone; text-shadow: none; }
  body[data-hud="off"] #minimapwrap, body[data-hud="off"] #notifs, body[data-hud="off"] #objective, body[data-hud="off"] #navhud, body[data-hud="off"] #qact { display: none !important; }
  body[data-minimap="off"] #minimapwrap { display: none !important; }
  body[data-notifs="off"] #notifs { display: none !important; }
  body[data-objective="off"] #objective { display: none !important; }
  `;
  document.head.appendChild(css);

  // ---- keys ---------------------------------------------------------------------------------------------------------------------------------------
  const ACTIONS = [
    ["fwd", "Move forward / accelerate", "KeyW"], ["back", "Move back / brake", "KeyS"], ["left", "Move left / steer left", "KeyA"], ["right", "Move right / steer right", "KeyD"],
    ["sprint", "Sprint", "ShiftLeft"], ["jump", "Jump / handbrake", "Space"], ["enter", "Get in / out", "KeyF"], ["use", "Interact / help someone", "KeyE"],
    ["wheel", "Equipment wheel", "KeyQ"], ["phone", "Phone", "KeyP"], ["map", "Map", "KeyM"], ["radio", "Radio", "KeyR"], ["horn", "Horn / hail a taxi", "KeyH"],
    ["lights", "Headlights", "KeyL"], ["walk", "Walk / fly", "KeyG"], ["view", "Camera view", "KeyV"], ["regard", "Regard someone", "KeyZ"], ["bow", "Bow", "KeyB"],
    ["antag", "Antagonise", "KeyN"], ["watch", "Look at your watch", "KeyT"]];
  const bound = a => gameSet.keys[a[0]] || a[2];
  const keyName = c => !c ? "—" : c.startsWith("Key") ? c.slice(3) : c.startsWith("Digit") ? c.slice(5) : c.startsWith("Numpad") ? "Num " + c.slice(6) :
    ({ ShiftLeft: "Left Shift", ShiftRight: "Right Shift", ControlLeft: "Left Ctrl", ControlRight: "Right Ctrl", AltLeft: "Left Alt", AltRight: "Right Alt", Space: "Space", Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\", CapsLock: "Caps Lock", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right" })[c] || c;
  const keyChar = c => c.startsWith("Key") ? c.slice(3).toLowerCase() : c.startsWith("Digit") ? c.slice(5) : c === "Space" ? " " : /^Shift/.test(c) ? "Shift" : /^Control/.test(c) ? "Control" : /^Alt/.test(c) ? "Alt" : c;
  let map = new Map();          // physical code -> the code the game listens for (null: swallowed)
  function remap() {
    map = new Map();
    const using = new Set(ACTIONS.map(bound));
    ACTIONS.forEach(a => { const b = bound(a); if (b !== a[2]) map.set(b, a[2]); });
    ACTIONS.forEach(a => { if (bound(a) !== a[2] && !using.has(a[2])) map.set(a[2], null); });
  }
  remap();
  SM.binds = () => ACTIONS.map(a => a[1] + ": " + keyName(bound(a))).join("\n");
  const inMenu = () => paused || (typeof title === "object" && title.on) || (window.career && career.menuState && career.menuState.on) || (typeof cut === "object" && cut.active);
  const held = new Map();       // physical -> what its keydown became, so the keyup matches even if a menu opened in between
  let capture = null;
  function synth(type, e, code) {
    const ev = new KeyboardEvent(type, { code: code, key: keyChar(code), repeat: e.repeat, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, bubbles: true, cancelable: true });
    ev.__smRemapped = true;
    (document.activeElement && document.activeElement !== document.body ? document.body : document.body).dispatchEvent(ev);
  }
  window.addEventListener("keydown", e => {
    if (e.__smRemapped) return;
    if (capture) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) finishCapture(e.code); return; }
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (!map.size || inMenu() || !map.has(e.code)) return;
    const to = map.get(e.code);
    e.preventDefault(); e.stopImmediatePropagation();
    held.set(e.code, to);
    if (to) synth("keydown", e, to);
  }, true);
  window.addEventListener("keyup", e => {
    if (e.__smRemapped || !held.has(e.code)) return;
    const to = held.get(e.code); held.delete(e.code);
    e.preventDefault(); e.stopImmediatePropagation();
    if (to) synth("keyup", e, to);
  }, true);
  function startCapture(a, btn) { capture = { a: a, btn: btn }; btn.classList.add("cap"); btn.innerHTML = "<span class='sl'>" + a[1] + "</span><span class='sv'>Press a key… (Esc cancels)</span>"; }
  function finishCapture(code) {
    const c = capture; capture = null; if (!c) return;
    c.btn.classList.remove("cap");
    const bad = ["Escape", "F3", "F5", "Tab", "Enter", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "MetaLeft", "MetaRight"];
    if (code !== "Escape" && bad.indexOf(code) < 0) {
      const was = bound(c.a), other = ACTIONS.find(x => x !== c.a && bound(x) === code);
      if (other) { gameSet.keys[other[0]] = was; if (gameSet.keys[other[0]] === other[2]) delete gameSet.keys[other[0]]; try { say(other[1] + " moved to " + keyName(was) + ".", 3); } catch (e) { /* quiet */ } }
      gameSet.keys[c.a[0]] = code; if (code === c.a[2]) delete gameSet.keys[c.a[0]];
      save(); remap();
    } else if (code !== "Escape") { try { say(keyName(code) + " is kept for the menus.", 3); } catch (e) { /* quiet */ } }
    labels();
  }

  // ---- the rows -----------------------------------------------------------------------------------------------------------------------------------
  const CATS = [["display", "Display"], ["graphics", "Graphics"], ["audio", "Audio"], ["camera", "Camera"], ["controls", "Controls"], ["keyboard", "Keyboard"], ["subtitles", "Subtitles"], ["hud", "HUD"], ["gameplay", "Gameplay"]];
  const pct = v => Math.round(v * 100) + "%";
  const onOff = v => v ? "On" : "Off";
  const step = (v, d, lo, hi, s) => Math.round(Math.min(hi, Math.max(lo, v + d * s)) / s) * s;
  const cycle = (list, v, d) => list[(list.indexOf(v) + d + list.length) % list.length];
  // [id, category, label, value(), adjust(d), description]
  const MINE = [
    ["sbright", "display", "Brightness", () => pct(gameSet.bright), d => { gameSet.bright = Math.round(step(gameSet.bright, d, 0.5, 1.5, 0.05) * 100) / 100; }, "How bright the picture is. Turn it up until the darkest alleys at night show a little detail, and no further."],
    ["ssafe", "display", "HUD safe zone", () => gameSet.safe ? "-" + Math.round(gameSet.safe * 100) + "%" : "Full screen", d => { gameSet.safe = Math.round(step(gameSet.safe, d, 0, 0.05, 0.01) * 100) / 100; }, "Pulls the minimap and messages in from the edges, for a TV that crops the picture."],
    ["sfovfoot", "camera", "Field of view on foot", () => Math.round(gameSet.fovFoot) + "°", d => { gameSet.fovFoot = step(gameSet.fovFoot, d, 45, 90, 1); }, "How wide the camera sees when walking. Wider shows more of the street; narrower feels closer."],
    ["sfovcar", "camera", "Field of view in a vehicle", () => Math.round(gameSet.fovCar) + "°", d => { gameSet.fovCar = step(gameSet.fovCar, d, 45, 95, 1); }, "How wide the camera sees when driving, riding or flying."],
    ["sshake", "camera", "Camera shake in cutscenes", () => onOff(gameSet.camShake), () => { gameSet.camShake = !gameSet.camShake; }, "The hand-held drift of the cutscene camera. Off locks every shot."],
    ["skeyreset", "keyboard", "Restore default keys", () => Object.keys(gameSet.keys).length ? Object.keys(gameSet.keys).length + " changed" : "All default", () => { gameSet.keys = {}; remap(); }, "Puts every key back where it started.", true],
    ["ssubs", "subtitles", "Subtitles", () => onOff(gameSet.subs), () => { gameSet.subs = !gameSet.subs; }, "The words spoken in cutscenes and conversations, on screen."],
    ["ssubsize", "subtitles", "Subtitle size", () => ({ s: "Small", m: "Medium", l: "Large", xl: "Extra large" })[gameSet.subSize], d => { gameSet.subSize = cycle(["s", "m", "l", "xl"], gameSet.subSize, d); }, "How large the subtitles are."],
    ["ssubbg", "subtitles", "Subtitle background", () => onOff(gameSet.subBg), () => { gameSet.subBg = !gameSet.subBg; }, "A dark box behind the subtitles, so they read against snow, neon and sky."],
    ["shud", "hud", "Display HUD", () => onOff(gameSet.hud), () => { gameSet.hud = !gameSet.hud; }, "Hides the minimap, messages and objective for a clean picture. The phone and menus still work."],
    ["sradar", "hud", "Minimap", () => onOff(gameSet.minimap), () => { gameSet.minimap = !gameSet.minimap; }, "The map in the corner, with health and stress under it."],
    ["snotifs", "hud", "Notifications", () => onOff(gameSet.notifs), () => { gameSet.notifs = !gameSet.notifs; }, "Texts, emails and news that pop in at the side while you play."],
    ["sobj", "hud", "Objective text", () => onOff(gameSet.objective), () => { gameSet.objective = !gameSet.objective; }, "The mission's current task, top left. The map and the yellow line still show the way."],
    ["scutskip", "gameplay", "Skipping cutscenes", () => gameSet.cutSkip === "hold" ? "Hold the button" : "Press twice", d => { gameSet.cutSkip = gameSet.cutSkip === "hold" ? "press" : "hold"; }, "Press twice: the first press shows the prompt, the second skips. Hold: keep the button down for most of a second. Escape or Start pauses the scene either way."],
    ["sautosave", "gameplay", "Autosave", () => onOff(gameSet.autosave), () => { gameSet.autosave = !gameSet.autosave; }, "Saves as you play: after a purchase, a mission, or every minute and a half. F5 always saves."],
    ["sskipoffer", "gameplay", "Offer to skip after 3 failures", () => onOff(gameSet.skipOffer), () => { gameSet.skipOffer = !gameSet.skipOffer; }, "After a section has gone wrong three times, the failure screen offers to skip past it."],
    ["sdefaults", "*", "Restore defaults for this page", () => "", () => restoreCat(), "Puts this page's settings back as they came.", true]
  ];
  const THEIRS = { mquality: "graphics", mres: "graphics", mfinish: "graphics", mshadows: "graphics", mpcmode: "graphics", madapt: "graphics", mundo: "graphics",
    muidensity: "display", muimotion: "display", mrumble: "controls", mlook: "controls", minvert: "controls",
    mvolmaster: "audio", mvolsfx: "audio", mvolamb: "audio", mvolmusic: "audio", mvolvoice: "audio" };
  const DESC = {
    mquality: "The overall level of detail: how far the city is drawn, the trees, the people, the reflections.",
    mres: "How many pixels the game draws before it fills the screen. Lower is faster and softer.",
    mfinish: "The final grade on the picture: tone, bloom, a little lens character.",
    mshadows: "Shadows from the sun, the moon and street lights.",
    mpcmode: "A preset for the machine you play on, aiming for a steady frame rate.",
    madapt: "Lets the game ease the resolution a little when a scene is heavy. It never touches the quality setting.",
    mundo: "Puts back anything adaptive graphics changed.",
    muidensity: "How much room the menus and phone give each line.",
    muimotion: "Reduced: menus and cards appear without sliding or fading.",
    mrumble: "Controller vibration for crashes, gunfire and the engine.",
    mlook: "How fast the camera turns with the mouse or right stick.",
    minvert: "Push up to look down, like a flight stick.",
    mvolmaster: "Everything together.", mvolsfx: "Footsteps, engines, doors, guns.", mvolamb: "The city around you: traffic, crowds, wind, birds, insects.",
    mvolmusic: "The radio in cars and the music in menus and cutscenes.", mvolvoice: "Voices in cutscenes and conversations.",
    mcat: "◀ ▶ changes the page of settings. ▲ ▼ chooses a setting, ◀ ▶ changes it."
  };
  const VOL = { mvolmaster: ["Master volume", "volMaster"], mvolsfx: ["Effects volume", "volSfx"], mvolamb: ["Ambience volume", "volAmb"], mvolmusic: ["Music & radio volume", "volMusic"], mvolvoice: ["Voice volume", "volVoice"] };
  let cat = 0;
  try { cat = Math.max(0, CATS.findIndex(c => c[0] === localStorage.getItem("konto.settings.cat"))); } catch (e) { /* first page */ }

  function apply() {
    const b = document.body.dataset;
    b.subs = gameSet.subs ? "on" : "off"; b.subsize = gameSet.subSize; b.subbg = gameSet.subBg ? "on" : "off";
    b.hud = gameSet.hud ? "on" : "off"; b.minimap = gameSet.minimap ? "on" : "off"; b.notifs = gameSet.notifs ? "on" : "off"; b.objective = gameSet.objective ? "on" : "off";
    const hud = document.getElementById("hud"), obj = document.getElementById("objective");
    const k = gameSet.safe ? "scale(" + (1 - gameSet.safe * 2).toFixed(3) + ")" : "";
    if (hud) hud.style.transform = k;
    if (obj) obj.style.margin = gameSet.safe ? Math.round(gameSet.safe * 100) + "vh " + Math.round(gameSet.safe * 100) + "vw" : "";
  }
  SM.apply = apply;

  function row(id, text, extra) { const b = document.createElement("button"); b.className = "menu-btn" + (extra || ""); b.id = id; b.type = "button"; b.innerHTML = text; return b; }
  const val = (l, v) => "<span class='sl'>" + l + "</span><span class='sv'>" + v + "</span>";
  function decorate(b) {
    if (!b || b.id === "mcat" || b.classList.contains("cap")) return;
    if (b.firstElementChild && b.firstElementChild.className === "sl") return;
    const t = b.textContent, i = t.indexOf(": ");
    if (i > 0) { b.innerHTML = val(t.slice(0, i), t.slice(i + 2).replace(/^./, c => c.toUpperCase())); b.classList.remove("act"); }
    else { b.innerHTML = val(t, ""); b.classList.add("act"); }
  }
  function labels() {
    const g = id => document.getElementById(id);
    if (g("mcat")) g("mcat").innerHTML = val("Settings", CATS[cat][1]);
    MINE.forEach(m => { const b = g(m[0]); if (b) { b.innerHTML = val(m[2], m[3]()); b.classList.toggle("act", !!m[6]); } });
    ACTIONS.forEach(a => { const b = g("skey_" + a[0]); if (b && !b.classList.contains("cap")) b.innerHTML = val(a[1], keyName(bound(a))); });
    Object.keys(VOL).forEach(id => { const b = g(id); if (b) { const v = Math.round((gameSet[VOL[id][1]] === undefined ? 1 : gameSet[VOL[id][1]]) * 100); b.innerHTML = val(VOL[id][0], v ? v + "%" : "Off"); } });
    document.querySelectorAll("#psettings .menu-btn").forEach(decorate);
  }
  SM.labels = labels;

  function build() {
    const col = document.getElementById("psettings"); if (!col || document.getElementById("mcat")) return;
    // the category row, then each category's rows together, in order
    const head = row("mcat", val("Settings", CATS[cat][1]));
    head.dataset.cat = "*"; col.insertBefore(head, col.firstChild);
    head.addEventListener("click", () => SM.cat(cat + 1));
    Object.keys(THEIRS).forEach(id => { const b = document.getElementById(id); if (b) b.dataset.cat = THEIRS[id]; });
    MINE.forEach(m => {
      const b = row(m[0], ""); b.dataset.cat = m[1];
      b.addEventListener("click", () => { m[4](1); save(); apply(); labels(); });
      col.appendChild(b);
    });
    ACTIONS.forEach(a => {
      const b = row("skey_" + a[0], ""); b.dataset.cat = "keyboard";
      b.addEventListener("click", () => { if (!capture) startCapture(a, b); });
      col.appendChild(b);
      DESC["skey_" + a[0]] = "Select, then press the key you want for " + a[1].toLowerCase() + ". A key that is already used swaps over.";
    });
    MINE.forEach(m => { DESC[m[0]] = m[5]; });
    const order = ["mcat"];
    CATS.forEach(c => col.querySelectorAll(".menu-btn").forEach(b => { if (b.dataset.cat === c[0]) order.push(b.id); }));
    // anything without a page (a row added by another module) goes on Gameplay
    col.querySelectorAll(".menu-btn").forEach(b => { if (!b.dataset.cat) { b.dataset.cat = "gameplay"; order.push(b.id); } });
    order.push("sdefaults");
    order.forEach(id => { const b = document.getElementById(id); if (b) col.appendChild(b); });
    PAUSE_ROWS.settings.length = 0; order.forEach(id => PAUSE_ROWS.settings.push(id));
    // what the selected setting does
    const side = col.parentElement && col.parentElement.querySelector(".pside");
    if (side && !document.getElementById("psetdesc")) side.insertAdjacentHTML("afterbegin", "<p class='pkicker'>About this setting</p><p id='psetdesc'></p>");
    new MutationObserver(() => document.querySelectorAll("#psettings .menu-btn").forEach(decorate)).observe(col, { childList: true, subtree: true, characterData: true });
    show();
    labels();
  }
  function show() {
    const c = CATS[cat][0];
    document.querySelectorAll("#psettings .menu-btn").forEach(b => {
      if (!b.dataset.cat) return;
      const on = b.dataset.cat === "*" || b.dataset.cat === c;
      if (b.id === "mundo") { if (!on) b.dataset.smhide = "1"; else delete b.dataset.smhide; b.hidden = !on || b.style.display === "none"; return; }
      b.hidden = !on;
    });
  }
  SM.cat = function (i) {
    if (typeof i === "string") i = CATS.findIndex(c => c[0] === i);
    cat = ((i % CATS.length) + CATS.length) % CATS.length;
    try { localStorage.setItem("konto.settings.cat", CATS[cat][0]); } catch (e) { /* not kept */ }
    show(); labels();
    try { if (typeof syncPauseRows === "function") syncPauseRows(); } catch (e) { /* not open */ }
    return CATS[cat][0];
  };
  function restoreCat() {
    const c = CATS[cat][0];
    MINE.forEach(m => {
      if (m[1] !== c) return;
      ({ sbright: ["bright"], ssafe: ["safe"], sfovfoot: ["fovFoot"], sfovcar: ["fovCar"], sshake: ["camShake"], ssubs: ["subs"], ssubsize: ["subSize"], ssubbg: ["subBg"], shud: ["hud"], sradar: ["minimap"], snotifs: ["notifs"], sobj: ["objective"], scutskip: ["cutSkip"], sautosave: ["autosave"], sskipoffer: ["skipOffer"] }[m[0]] || []).forEach(k => { gameSet[k] = DEF[k]; });
    });
    if (c === "keyboard") { gameSet.keys = {}; remap(); }
    if (c === "audio") { Object.keys(VOL).forEach(id => { delete gameSet[VOL[id][1]]; }); try { if (window.soundscape) soundscape.apply(); } catch (e) { /* quiet */ } }
    if (c === "controls") { gameSet.lookSens = 1; gameSet.invertY = false; gameSet.rumble = true; }
    if (c === "display") { gameSet.uiDensity = "comfortable"; gameSet.reduceMotion = false; try { applyInterfaceSettings(); } catch (e) { /* quiet */ } }
    save(); apply();
    try { say(CATS[cat][1] + " settings restored.", 3); } catch (e) { /* quiet */ }
    // the rows konto.html labels itself (look speed, vibration...) relabel on their own click; re-open the page to refresh them
    try { if (typeof setPauseTab === "function" && paused) { const r = pause.row; setPauseTab(pause.tab, true); pause.row = r; syncPauseRows(); } } catch (e) { /* quiet */ }
    labels();
  }

  // left / right on the settings page: the category row turns the page, a value row changes its value
  const ADJ = {
    mlook: d => { gameSet.lookSens = Math.round(step(gameSet.lookSens, d, 0.5, 1.6, 0.1) * 10) / 10; const b = document.getElementById("mlook"); if (b) b.textContent = "Look speed: " + Math.round(gameSet.lookSens * 100) + "%"; }
  };
  Object.keys(VOL).forEach(id => { ADJ[id] = d => { const k = VOL[id][1]; gameSet[k] = Math.round(step(gameSet[k] === undefined ? 1 : gameSet[k], d, 0, 1, 0.1) * 10) / 10; try { if (window.soundscape) soundscape.apply(); } catch (e) { /* quiet */ } if (id === "mvolsfx" || id === "mvolmaster") try { playBlip(880, 0.06, 0.2); } catch (e) { /* quiet */ } }; });
  SM.side = function (dx) {
    if (typeof PAUSE_TABS === "undefined" || PAUSE_TABS[pause.tab] !== "settings") return false;
    const rows = pauseRows(); const id = rows && rows[pause.row]; if (!id) return false;
    if (id === "mcat") { SM.cat(cat + dx); pause.row = 0; syncPauseRows(); return true; }
    const m = MINE.find(x => x[0] === id);
    if (m) { if (m[6]) return true; m[4](dx); save(); apply(); labels(); return true; }
    if (ADJ[id]) { ADJ[id](dx); save(); labels(); return true; }
    if (/^skey_/.test(id)) return true;
    const b = document.getElementById(id);
    if (b && !b.classList.contains("act")) { b.click(); return true; }
    return true;
  };
  // the line under the list follows the selection
  if (typeof window.syncPauseRows === "function") {
    const was = window.syncPauseRows;
    window.syncPauseRows = function () {
      const r = was.apply(this, arguments);
      try {
        if (PAUSE_TABS[pause.tab] === "settings") {
          const rows = pauseRows(), id = rows && rows[pause.row], d = document.getElementById("psetdesc");
          if (d) d.textContent = DESC[id] || "";
        }
      } catch (e) { /* quiet */ }
      return r;
    };
  }
  // the page shows the category it was left on
  if (typeof window.setPauseTab === "function") {
    const was = window.setPauseTab;
    window.setPauseTab = function () { try { show(); labels(); } catch (e) { /* quiet */ } return was.apply(this, arguments); };
  }

  // ---- what the settings do while playing -----------------------------------------------------------------------------------------------------------------
  // brightness: the exposure, for the frame only, so the sky's own exposure curve is untouched
  if (typeof window.present === "function") {
    const was = window.present;
    window.present = function () {
      const b = gameSet.bright;
      if (b === 1 || typeof renderer === "undefined" || !renderer) return was.apply(this, arguments);
      const e = renderer.toneMappingExposure;
      renderer.toneMappingExposure = e * b;
      try { return was.apply(this, arguments); } finally { renderer.toneMappingExposure = e; }
    };
  }
  // field of view: only while nobody else has the camera (a cutscene, the camera app, the desk, a skydive all set their own and put it back)
  let fovMine = 58;
  function fovTick(dt) {
    if (typeof camera === "undefined" || !camera) return;
    if ((typeof cut === "object" && cut.active) || (typeof camMode === "object" && camMode.on) || document.body.classList.contains("careerdesk")) return;
    const f = camera.fov;
    if (Math.abs(f - fovMine) > 0.05 && Math.abs(f - 58) > 0.05) return;
    const inCar = typeof drive === "object" && (drive.car || drive.train || drive.boat);
    const want = inCar ? gameSet.fovCar : gameSet.fovFoot;
    if (Math.abs(f - want) < 0.02) { fovMine = f; return; }
    const n = f + (want - f) * Math.min(1, dt * 4);
    camera.fov = Math.abs(n - want) < 0.05 ? want : n; camera.updateProjectionMatrix(); fovMine = camera.fov;
  }
  let last = performance.now();
  (function loop() { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; try { fovTick(dt); } catch (e) { /* quiet */ } requestAnimationFrame(loop); })();
  SM.fov = () => ({ camera: typeof camera !== "undefined" && camera ? camera.fov : null, mine: fovMine, foot: gameSet.fovFoot, car: gameSet.fovCar });
  // autosave off: only the saves the player asks for (F5, the menu, the end of a mission's own save)
  if (typeof window.saveGame === "function") {
    const was = window.saveGame;
    window.saveGame = function (msg) {
      if (!gameSet.autosave && !msg) return false;
      if (window.missionflow && missionflow.replaying && missionflow.replaying()) return false;
      return was.apply(this, arguments);
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { build(); apply(); }); else { build(); apply(); }
  console.log("[Settings] " + SM.version + " · " + CATS.length + " pages, " + ACTIONS.length + " rebindable keys");
})();
