// Type: Salary Man's two signature faces, put to work.
//
//   Konto Kanban   the title face: heavy, wide, slanted capitals. Title cards, MISSION PASSED, MISSION FAILED, big flashes.
//   Konto Text     the reading face: subtitles, menus, the HUD, the phone. Kana and kanji fall through to Konto Sans.
//
// The faces are declared in art/fonts/konto-type.css (built by Tools/fonts/build_signature_fonts.py). This file swaps the
// interface over to them, makes the subtitles low-key (smaller, lighter, no heavy box) and adds the MISSION FAILED banner
// (storyFailed(title, why)) next to storyPassed. Off switch: ?type=0.
(function () {
  "use strict";
  if (/[?&]type=0\b/.test(location.search)) return;

  const TEXT = '"Konto Text", "Konto Sans", "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", system-ui, sans-serif';
  const TITLE = '"Konto Kanban", "Konto Text", "Konto Sans", "Zen Kaku Gothic New", sans-serif';
  window.KONTO_TYPE = Object.freeze({ text: TEXT, title: TITLE, version: "1.0.0" });

  const css = `
  :root:root { --ui: ${TEXT}; --title: ${TITLE}; }
  html body { font-family: var(--ui); }

  /* subtitles: low-key, like a film's. Smaller, regular weight, the speaker's name inline in a muted gold, no heavy box */
  html body #cutsub { bottom: calc(11vh + 2.2vh); max-width: min(860px, 72vw);
    font: 400 clamp(14px, 1.12vw, 19px)/1.45 var(--ui); letter-spacing: .012em; color: rgba(255,255,255,.93);
    text-shadow: 0 1px 2px rgba(0,0,0,.9), 0 0 8px rgba(0,0,0,.35); }
  html body #cutsub b { display: inline; font-size: 1em; font-weight: 700; letter-spacing: 0; text-transform: none;
    color: rgba(232,200,110,.95); margin: 0 .4em 0 0; }
  html body #cutsub b::after { content: ":"; }
  html body #notice { bottom: 9%; max-width: min(620px, 74vw); padding: 5px 12px; border: 0; border-radius: 3px;
    background: rgba(0,0,0,.34); box-shadow: none; backdrop-filter: none; color: rgba(255,255,255,.94);
    font: 400 clamp(13px, 1.02vw, 16px)/1.45 var(--ui); text-shadow: 0 1px 2px rgba(0,0,0,.85); }

  /* the title face */
  html body #cutover .t1 { font: 900 clamp(52px, 9.5vw, 160px)/1 var(--title); letter-spacing: .02em;
    text-shadow: 0 .04em 0 rgba(0,0,0,.55), 0 6px 30px rgba(0,0,0,.5); }
  html body #cutover .t3 { font: 700 clamp(13px, 1.15vw, 18px) var(--ui); letter-spacing: .28em; }
  html body #mpassed .mp1 { font: 900 clamp(40px, 5.6vw, 86px)/1 var(--title); letter-spacing: .015em; color: #f2c230;
    text-shadow: 0 .05em 0 #000, 0 0 22px rgba(0,0,0,.55); }
  html body #mpassed.fail .mp1 { color: #d93a2f; }
  html body #mpassed .mp2 { font: 700 clamp(17px, 1.7vw, 25px) var(--ui); margin-top: 10px; }
  html body #mpassed .mp3 { font: 400 clamp(13px, 1.15vw, 17px) var(--ui); }
  html body #skihud .sk-flash, html body #skimenu h2 { font-family: var(--title); font-weight: 900; letter-spacing: .02em; }
  `;
  const st = document.createElement("style");
  st.id = "konto-type";
  st.textContent = css;
  document.head.appendChild(st);

  // canvases (map, phone, HUD) that drew before the faces arrived are drawn again once they are in
  if (document.fonts && document.fonts.load) {
    Promise.all(["400 16px 'Konto Text'", "700 16px 'Konto Text'", "900 16px 'Konto Kanban'"].map(f => document.fonts.load(f, "Konto"))).then(() => {
      try { if (typeof phone === "object" && phone) phone.dirty = true; } catch (e) { /* drawn next time round */ }
    }).catch(() => {});
  }

  // MISSION FAILED: the same banner as MISSION PASSED, in red, with why underneath
  window.storyFailed = function (title, why) {
    const el = (typeof cutEl === "function" ? cutEl("mpassed") : document.getElementById("mpassed"));
    if (!el) { if (typeof say === "function") say("Mission failed · " + (title || ""), 5); return; }
    const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    el.innerHTML = "<div class='mp1'>MISSION FAILED</div>" + (title ? "<div class='mp2'>" + esc(title) + "</div>" : "") + (why ? "<div class='mp3'>" + esc(why) + "</div>" : "");
    el.classList.add("fail");
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
    clearTimeout(window.storyFailed._t);
    window.storyFailed._t = setTimeout(() => { el.classList.remove("on", "fail"); }, 5200);
  };
  // a pass straight after a fail must not come up red
  if (typeof window.storyPassed === "function") {
    const passed = window.storyPassed;
    window.storyPassed = function () {
      const el = document.getElementById("mpassed"); if (el) el.classList.remove("fail");
      clearTimeout(window.storyFailed._t);
      return passed.apply(this, arguments);
    };
  }
})();
