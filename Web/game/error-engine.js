// Salary Man error engine.
//
// Loaded first in the page (before three.js and the Shigoto engine), so it sees everything that goes wrong after it: script errors, promises
// nobody caught, the graphics driver resetting, models and pictures that never arrive, shader programs that do not compile, the persistence
// load's failed stages and checks, a loading screen that never lifts and a frame loop that stops. In the desktop build the main process adds
// what the page cannot see for itself (the page crashing, the GPU process going, the window hanging) - see Game/main.js, "error engine".
//
// Each problem gets a short code that stays the same for the same fault from one run to the next: SM-<AREA>-<NNN>-<XXXX>. The first part
// names the kind of fault (the table below, also docs/ERROR_CODES.md); the four characters after it are a fingerprint of the message and
// where it was thrown, so two different bugs of one kind can be told apart and the same bug is recognised again. The player sees the code
// and two buttons: "Copy report" (version, GPU and driver, memory, where the game was, the message and stack, the recent log) to paste to
// Claude, and "Open GitHub issue", a prefilled new-issue page the player submits himself. Nothing is sent anywhere automatically and the
// game carries no token. Reports are also kept in localStorage (so one raised just before a restart is shown after it) and, in the desktop
// build, appended to "<userData>/error-log.txt".
//
// Keys: Ctrl+Shift+E opens the list of everything this session has reported. Console: errors(), errors.copy(), errors.test("SM-GPU-001").
(function () {
  "use strict";
  if (window.KONTO_ERRORS) return;
  const T0 = Date.now();
  const REPO = "physicstheory/salaryman";
  const desk = window.KONTO_DESKTOP && window.KONTO_DESKTOP.errors ? window.KONTO_DESKTOP.errors : null;

  // ---- the code table (docs/ERROR_CODES.md is generated from it: node Tools/qa/error-codes.mjs) -------------------------------------------
  // sev: "error" shows the card, "warn" only counts on the small pill (the game carries on, but something is missing)
  const CODES = {
    "SM-JS-001": { sev: "error", title: "Script error in the game", hint: "A piece of the game's code failed.",
      look: "Web/konto.html: the stack names the function. Usually a missing null check or a global used before it is set." },
    "SM-JS-002": { sev: "error", title: "Script error in a game add-on", hint: "One of the game's add-on scripts failed.",
      look: "Web/game/*.js or Web/art/*.js: the file is in the stack and in the title." },
    "SM-JS-003": { sev: "error", title: "Unhandled promise rejection", hint: "Something the game was waiting for failed and nothing caught it.",
      look: "An async function or fetch().then without a catch. The stack (if any) points at it; a non-Error reason is printed as Message." },
    "SM-JS-004": { sev: "warn", title: "Script error with no details", hint: "A script from another site failed; the browser hides the details.",
      look: "Cross-origin script (CDN, YouTube, Spotify). Usually harmless; check the recent log for what ran just before." },
    "SM-JS-005": { sev: "error", title: "Error inside three.js", hint: "The 3D library choked on something the game gave it.",
      look: "three.min.js internals: look one frame up the stack for the game call. Typical: NaN geometry, disposed texture, missing material." },
    "SM-ENG-001": { sev: "error", title: "Shigoto engine error", hint: "The game engine (physics, streaming, weather) failed.",
      look: "Engine/src (bundled into Web/engine/shigoto.js). Rebuild with node Engine/build.mjs after fixing." },
    "SM-GPU-001": { sev: "error", title: "Graphics driver reset (WebGL context lost)", hint: "The graphics card dropped the game's picture. The game saves and restarts on safer graphics.",
      look: "konto.html initThree webglcontextlost + GFX_SAFE ladder; persist-hook gpuWarm. Report carries GPU, driver, safe level, tier and what was on screen." },
    "SM-GPU-002": { sev: "error", title: "Graphics process crashed", hint: "The program that talks to the graphics card stopped (desktop build).",
      look: "Game/main.js child-process-gone (type GPU). Reason/exit code in Message; also <userData>/gpu-log.txt. Often a driver TDR or out of video memory." },
    "SM-GPU-003": { sev: "error", title: "Graphics driver keeps resetting", hint: "The driver reset even on the safest graphics. Updating the graphics driver usually fixes this.",
      look: "GFX_SAFE reached level 3. Driver/GPU problem or a draw that is too heavy even at low: check the GPU line and the log before the loss." },
    "SM-GPU-004": { sev: "error", title: "WebGL could not start", hint: "The game could not get 3D graphics from this computer. In a browser: quit it completely and open it again (after a graphics crash Chrome blocks 3D for the site until it restarts), and check that Settings > System > Use graphics acceleration is on.",
      look: "WebGLRenderer creation failed on every step of makeRenderer (konto.html): WebGL2 high-performance/default/low-power, WebGL1, experimental-webgl. The message lists each step's webglcontextcreationerror. Causes: GPU blocklisted, hardware acceleration off, Chrome blocking WebGL for the origin after a GPU crash, remote desktop, GPU process down. See GPU line and featureStatus." },
    "SM-GPU-005": { sev: "warn", title: "Shader failed to compile", hint: "Some surfaces may draw black or not at all.",
      look: "THREE.WebGLProgram shader error: the log lines carry the GLSL error. Custom ShaderMaterials / onBeforeCompile patches in konto.html." },
    "SM-GPU-006": { sev: "error", title: "Graphics did not come back", hint: "The graphics card did not return the game's picture after a reset.",
      look: "webglcontextlost with no restore and no reload. Driver hung; the game needs a restart." },
    "SM-AST-001": { sev: "warn", title: "3D model failed to load", hint: "A model (person, car, prop) did not arrive; something may be missing.",
      look: "GLTFLoader error: the URL is in Message. Missing file in Web/, not staged by Game/tools/stage.js, or a broken .glb." },
    "SM-AST-002": { sev: "warn", title: "Picture or texture failed to load", hint: "A picture did not arrive; a surface may look plain.",
      look: "TextureLoader / <img> error: URL in Message. Check the file exists under Web/ and the path's case (Windows ignores it, the build does not)." },
    "SM-AST-003": { sev: "error", title: "Game script failed to load", hint: "Part of the game is missing, so some features will not work.",
      look: "<script>/<link> load error: URL in Message. stage.js not copying the folder, or a CDN library offline in the browser build." },
    "SM-AST-004": { sev: "warn", title: "Game data failed to load", hint: "A data file (JSON, level) did not arrive.",
      look: "fetch() returned an error status or failed: URL and status in Message." },
    "SM-AST-005": { sev: "warn", title: "Sound or video failed to load", hint: "Something will be silent.",
      look: "<audio>/<video>/AudioLoader error: URL in Message. Radio files under Web/art/radio or music/index.json." },
    "SM-PER-001": { sev: "warn", title: "World check failed at load", hint: "A check run behind the loading screen found a problem.",
      look: "Persistence checks (Web/game/persist-hook.js P.check): each failed framework/name/detail is listed in Message." },
    "SM-PER-002": { sev: "warn", title: "World build stage failed at load", hint: "Part of the world could not be prepared behind the loading screen.",
      look: "Persistence stage threw (persist-hook.js P.stage / PERSIST_EXTRA): the stage name and error are in Message." },
    "SM-PER-003": { sev: "error", title: "World preload failed", hint: "Preparing the world behind the loading screen failed.",
      look: "window.persistLoad rejected: stack in report. The game falls back to streaming; check Engine/src/persist/Persistence.js run()." },
    "SM-BOOT-001": { sev: "error", title: "Loading screen never finished", hint: "The game has been loading for a very long time.",
      look: "#boot still visible after 12 minutes. The log shows the last stage reached; look at generate() / persistLoad progress." },
    "SM-BOOT-002": { sev: "error", title: "The game stopped drawing", hint: "The picture froze although the game is still running.",
      look: "No requestAnimationFrame callback for 8 s while the window is visible: the frame loop threw before rescheduling. See the first error before it." },
    "SM-MEM-001": { sev: "warn", title: "Running low on memory", hint: "The game is close to its memory limit and may crash.",
      look: "JS heap above 90% of its limit. Persistence budget (memoryBudget) or a leak; heap numbers in the report." },
    "SM-MEM-002": { sev: "error", title: "Out of memory", hint: "The game ran out of memory.",
      look: "Allocation failure (RangeError / 'out of memory'). Heap numbers in report; lower tier or ?persist=0 as a workaround." },
    "SM-PRF-001": { sev: "warn", title: "The game is stuttering", hint: "Some frames are taking much longer than the rest. The game is adjusting; the report says what caused them.",
      look: "Shigoto performance engine (Web/game/perf-hook.js, Engine/src/perf/Performance.js): 6+ frames over 50 ms in a minute. Message names the main cause (shader compile, texture upload, garbage collection, game code + the part, graphics card / driver); Detail has shigoto.perf() with every recent hitch." },
    "SM-PRF-002": { sev: "warn", title: "Frame rate well under target", hint: "This computer cannot hold the frame rate even with the automatic adjustments. A lower graphics setting will help.",
      look: "perf-hook.js governor: 90th-percentile frame over 1.5x the target for 20 s with resolution and levers used. Bottleneck (gpu/cpu), scale and hardware class in Message/Detail." },
    "SM-SAV-001": { sev: "error", title: "Could not save the game", hint: "The save storage is full, so progress may not be kept.",
      look: "QuotaExceededError writing localStorage (saveGame). Saves or caches too big; check what keys are large." },
    "SM-ELC-001": { sev: "error", title: "The game page crashed", hint: "The game's page stopped and was restarted (desktop build).",
      look: "Game/main.js render-process-gone: reason and exit code in Message. Look at the page's log before the crash." },
    "SM-ELC-002": { sev: "error", title: "The game page ran out of memory", hint: "The game's page used too much memory and was restarted.",
      look: "render-process-gone reason 'oom'. Memory budget / leaks; js-flags max-old-space-size is 4096 in main.js." },
    "SM-ELC-003": { sev: "warn", title: "The game window stopped responding", hint: "The game froze for a while.",
      look: "BrowserWindow 'unresponsive': a long blocking task on the main thread (world build, shader compile). Duration is in Message." },
    "SM-ELC-004": { sev: "error", title: "The game page failed to load", hint: "The game's files could not be opened.",
      look: "did-fail-load on konto://app/index.html: missing/corrupt install or a broken update in <userData>/Update." },
    "SM-ELC-005": { sev: "error", title: "The desktop bridge failed", hint: "The part that connects the game to the desktop failed.",
      look: "preload-error in Game/preload.js." },
    "SM-ELC-006": { sev: "warn", title: "A helper process stopped", hint: "A background process (sound, network) stopped unexpectedly.",
      look: "child-process-gone for a non-GPU process: type and reason in Message." },
    "SM-ELC-007": { sev: "error", title: "Desktop app error", hint: "The desktop app itself hit an error.",
      look: "Uncaught exception in Game/main.js: stack in report." }
  };

  // ---- small helpers -------------------------------------------------------------------------------------------------------------------
  const safe = f => { try { return f(); } catch (e) { return undefined; } };
  const clip = (s, n) => { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n) + "…" : s; };
  function hash4(s) {                // FNV-1a, folded to 4 hex characters
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ((h >>> 16) ^ (h & 0xffff)).toString(16).toUpperCase().padStart(4, "0");
  }
  // what makes one bug the same bug: the message without numbers, ids and addresses, and the file:function of the top two frames (no
  // line numbers, so a fingerprint survives an unrelated edit of konto.html)
  function normMsg(m) { return String(m || "").replace(/(https?|konto|file):\/\/\S+/g, "<url>").replace(/0x[0-9a-f]+/gi, "#").replace(/\d+(\.\d+)?/g, "#").slice(0, 200); }
  function frames(stack) {
    if (!stack) return [];
    return String(stack).split("\n").map(l => l.trim()).filter(l => /^at |@/.test(l)).slice(0, 12).map(l => {
      const m = /^at (?:async )?([^\s(]+)? ?\(?(.*?)(?::\d+){0,2}\)?$/.exec(l) || /^([^@]*)@(.*?)(?::\d+){0,2}$/.exec(l);
      const fn = m && m[1] ? m[1] : "?"; const file = m && m[2] ? m[2].replace(/[?#].*$/, "").split("/").slice(-2).join("/") : "?";
      return { fn, file };
    });
  }
  function fingerprint(code, msg, stack, extra) {
    const f = frames(stack).slice(0, 2).map(x => x.file + ":" + x.fn).join("|");
    return hash4(code + "|" + normMsg(msg) + "|" + f + "|" + (extra || ""));
  }

  // ---- the recent log --------------------------------------------------------------------------------------------------------------------
  const LOG = [], LOG_MAX = 300, ORIG = {};
  const SESSION = T0.toString(36) + Math.random().toString(36).slice(2, 6);
  function logLine(level, args) {
    try {
      const text = Array.prototype.map.call(args, a => {
        if (a instanceof Error) return a.name + ": " + a.message;
        if (typeof a === "object" && a) { try { return JSON.stringify(a).slice(0, 300); } catch (e) { return String(a); } }
        return String(a);
      }).join(" ");
      LOG.push({ t: Date.now() - T0, level, text: clip(text, 500) });
      if (LOG.length > LOG_MAX) LOG.splice(0, LOG.length - LOG_MAX);
      return text;
    } catch (e) { return ""; }
  }
  ["log", "info", "warn", "error"].forEach(level => {
    const orig = console[level];
    if (typeof orig !== "function") return;
    ORIG[level] = orig;
    console[level] = function () {
      const text = logLine(level, arguments);
      try { if (level !== "log" && level !== "info") watchConsole(level, text, arguments); } catch (e) { /* never break logging */ }
      return orig.apply(console, arguments);
    };
  });

  // ---- what we know about this machine and this run -------------------------------------------------------------------------------------
  let deskInfo = null;
  function info() {
    if (!deskInfo && desk) deskInfo = safe(() => desk.info()) || {};
    const d = deskInfo || {};
    const g = (typeof GFX_SAFE !== "undefined" && GFX_SAFE) || window.GFX_SAFE || null;
    let glRenderer = g && g.gpu || "", glVersion = "";
    safe(() => {
      const gl = typeof renderer !== "undefined" && renderer && renderer.getContext && renderer.getContext();
      if (!gl) return;
      glVersion = String(gl.getParameter(gl.VERSION));
      if (!glRenderer) { const ext = gl.getExtension("WEBGL_debug_renderer_info"); if (ext) glRenderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)); }
    });
    const mem = safe(() => performance.memory) || null;
    return {
      version: d.version || "web", build: d.build || "", update: d.update || "", electron: d.electron || "", chrome: d.chrome || (/Chrome\/([\d.]+)/.exec(navigator.userAgent) || [])[1] || "",
      os: d.os || navigator.platform, gpu: d.gpu || "", driver: d.driver || "", glRenderer, glVersion,
      safeLevel: g ? g.level : "", tier: safe(() => gfx.tier) || "", scale: safe(() => gfx.scale) || "",
      screen: safe(() => innerWidth + "x" + innerHeight + " @" + (devicePixelRatio || 1)) || "",
      heap: mem ? Math.round(mem.usedJSHeapSize / 1048576) + "/" + Math.round(mem.jsHeapSizeLimit / 1048576) + " MB" : "",
      device: (navigator.deviceMemory ? navigator.deviceMemory + " GB, " : "") + (navigator.hardwareConcurrency || "?") + " threads",
      log: d.logPath || "",
      guard: safe(() => window.GPU_GUARD && GPU_GUARD.line()) || ""
    };
  }
  function where() {
    const out = [];
    safe(() => { const b = document.getElementById("boot"); if (b && !b.hidden && getComputedStyle(b).display !== "none") out.push("loading screen" + (safe(() => " " + document.querySelector("#bootbar i").style.width) || "")); });
    safe(() => { if (title && title.on) out.push("title screen"); });
    safe(() => { if (typeof cut !== "undefined" && cut && cut.on) out.push("cutscene"); });
    safe(() => { out.push("mode " + player.mode + (drive && drive.car ? " (driving)" : "")); });
    safe(() => { const p = player.pos || (seiko && seiko.position); if (p) out.push("at " + Math.round(p.x) + ", " + Math.round(p.z)); });
    safe(() => { if (typeof interior !== "undefined" && interior && interior.on) out.push("indoors"); });
    safe(() => { if (typeof mission !== "undefined" && mission && mission.id) out.push("mission " + mission.id); });
    return out.join(" · ") || "unknown";
  }

  // ---- reports -------------------------------------------------------------------------------------------------------------------------
  const records = [];          // this session's, newest last
  const byKey = new Map();
  const STORE = "konto.errors";
  // Which build a report came from. Reports are kept between runs (a driver reset restarts the page), and the store outlives an update, so
  // a report from an older build must never come back looking like a new one: only this build's reports are shown as "last time", and the
  // list and every card name the build.
  const thisBuild = () => { const i = safe(() => info()) || {}; return String(i.build || i.version || ""); };
  const buildOf = r => String((r && r.info && (r.info.build || r.info.version)) || "");
  const shortBuild = b => /^[0-9a-f]{7,}$/i.test(b) ? b.slice(0, 7) : b || "unknown build";
  const sameBuild = r => { const b = thisBuild(); return !b || buildOf(r) === b; };
  const whenText = at => safe(() => new Date(at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) || at;
  let saveQuotaHit = false;
  function persistStore() {
    if (saveQuotaHit) return;
    safe(() => {
      const keep = records.slice(-15).map(r => Object.assign({}, r, { log: r.log.slice(-60) }));
      const old = safe(() => JSON.parse(localStorage.getItem(STORE) || "[]")) || [];
      const merged = old.filter(o => o.session !== SESSION).concat(keep).slice(-20);
      localStorage.setItem(STORE, JSON.stringify(merged));
    });
  }
  function report(code, o) {
    try {
      o = o || {};
      const def = CODES[code] || CODES["SM-JS-001"];
      const fp = o.fp || fingerprint(code, o.message, o.stack, o.key);
      const key = code + "-" + fp;
      let r = byKey.get(key);
      if (r) { r.count++; r.last = Date.now(); if (r.count === 5 || r.count === 50) persistStore(); updateUI(); return r; }
      r = {
        code, fp, full: key, session: SESSION, sev: o.sev || def.sev, title: o.title || def.title, hint: def.hint,
        message: clip(o.message || "", 1500), stack: clip(o.stack || "", 3000), detail: o.detail || null,
        at: new Date().toISOString(), uptime: Math.round((Date.now() - T0) / 1000), count: 1, last: Date.now(),
        where: where(), info: info(), log: LOG.slice(-80).map(l => ({ t: l.t, level: l.level, text: l.text })), from: o.from || "page", seen: false
      };
      byKey.set(key, r); records.push(r);
      if (records.length > 60) { const gone = records.shift(); byKey.delete(gone.full); }
      persistStore();
      if (desk) safe(() => desk.write({ code: r.full, sev: r.sev, title: r.title, text: reportText(r) }));
      origWarn("[Konto] error engine: " + r.full + " " + r.title + (r.message ? " - " + clip(r.message, 200) : ""));
      updateUI(r);
      return r;
    } catch (e) { return null; }
  }
  // straight to the real console (not into the recent log: the report already says it)
  function origWarn(text) { try { (ORIG.warn || function () {}).call(console, text); } catch (e) { /* none */ } }

  function reportText(r, opts) {
    opts = opts || {};
    const i = r.info || {};
    const L = [];
    L.push("Salary Man error report");
    L.push("Code: " + r.full + "  (" + r.title + ")");
    L.push("When: " + r.at + ", " + r.uptime + " s after start" + (r.count > 1 ? ", seen " + r.count + " times" : "") + (r.from !== "page" ? ", reported by " + r.from : ""));
    L.push("Version: " + i.version + (i.build ? " (build " + i.build + ")" : "") + (i.update ? " + update " + i.update : "") + (i.electron ? " · Electron " + i.electron : "") + (i.chrome ? " · Chrome " + i.chrome : "") + " · " + i.os);
    L.push("GPU: " + (i.glRenderer || i.gpu || "unknown") + (i.driver ? " · driver " + i.driver : "") + (i.glVersion ? " · " + i.glVersion : ""));
    L.push("Graphics: tier " + (i.tier || "?") + " · safe level " + (i.safeLevel === "" ? "?" : i.safeLevel) + (i.scale ? " · scale " + i.scale : "") + " · " + i.screen);
    if (i.guard) L.push("Video memory: " + i.guard);
    L.push("Memory: JS heap " + (i.heap || "?") + " · " + i.device);
    L.push("Game: " + r.where);
    if (r.message) L.push("Message: " + r.message);
    if (r.detail) L.push("Detail: " + clip(typeof r.detail === "string" ? r.detail : safe(() => JSON.stringify(r.detail)) || "", 2000));
    if (r.stack) { L.push("Stack:"); L.push(r.stack.split("\n").slice(0, opts.short ? 8 : 25).join("\n")); }
    const others = records.filter(x => x !== r).slice(-8);
    if (others.length) L.push("Other problems this session: " + others.map(x => x.full + (x.count > 1 ? " ×" + x.count : "")).join(", "));
    const lines = r.log.slice(opts.short ? -15 : -60);
    if (lines.length) {
      L.push("Recent log (" + lines.length + " lines):");
      for (const l of lines) L.push("[" + (l.t / 1000).toFixed(1) + "s " + l.level + "] " + l.text);
    }
    if (i.log) L.push("Full log on this PC: " + i.log);
    return L.join("\n");
  }
  function pasteText(r) { return "```\n" + reportText(r) + "\n```"; }

  function copy(text) {
    if (desk) { if (safe(() => desk.copy(text)) !== undefined) return Promise.resolve(true); }
    return safe(() => navigator.clipboard.writeText(text).then(() => true)) || Promise.resolve(false).then(() => {
      const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px"; document.body.appendChild(ta); ta.select();
      const ok = safe(() => document.execCommand("copy")); ta.remove(); return !!ok;
    });
  }
  function issueUrl(r) {
    const title = "[" + r.full + "] " + r.title;
    let body = "Error code **" + r.full + "** from the game (Open GitHub issue button). The full report was also copied to the clipboard; paste it below if this one is cut short.\n\n```\n" + reportText(r, { short: true }) + "\n```\n";
    const base = "https://github.com/" + REPO + "/issues/new?title=" + encodeURIComponent(title) + "&body=";
    while (base.length + encodeURIComponent(body).length > 7600 && body.length > 400) body = body.slice(0, Math.floor(body.length * 0.85)) + "\n…\n```\n";
    return base + encodeURIComponent(body);
  }
  function openIssue(r) {
    copy(pasteText(r));
    const u = issueUrl(r);
    if (desk && desk.openIssue) { safe(() => desk.openIssue(u)); return; }
    safe(() => window.open(u, "_blank", "noopener"));
  }

  // ---- classifying a thrown error ------------------------------------------------------------------------------------------------------
  function classify(msg, stack, file, isRejection) {
    const s = String(msg || "") + "\n" + String(stack || "");
    if (/QuotaExceeded|exceeded the quota/i.test(s)) return "SM-SAV-001";
    if (/Error creating WebGL context|WebGL.*(not supported|unavailable)|could not create a WebGL/i.test(s)) return "SM-GPU-004";
    if (/out of memory|Array buffer allocation failed|Invalid (typed )?array length|allocation failed/i.test(s)) return "SM-MEM-002";
    if (!stack && /^(Uncaught )?Script error\.?$/i.test(String(msg || "").trim())) return "SM-JS-004";
    const top = frames(stack)[0];
    const src = (top && top.file !== "?" ? top.file : "") || String(file || "").split("/").slice(-2).join("/");
    if (/shigoto\.js/.test(src)) return "SM-ENG-001";
    if (/three(\.min)?\.js|GLTFLoader|RGBELoader/.test(src)) return "SM-JS-005";
    if (/(^|\/)(game|art)\/[^/]+\.js|^(game|art)\//.test(src) || /\/(game|art)\/[\w.-]+\.js/.test(String(file || ""))) return "SM-JS-002";
    return isRejection ? "SM-JS-003" : "SM-JS-001";
  }
  function addonTitle(code, stack, file) {
    if (code !== "SM-JS-002") return undefined;
    const top = frames(stack)[0]; const f = top && top.file !== "?" ? top.file : String(file || "").split("/").slice(-2).join("/");
    return CODES[code].title + " (" + f.replace(/^.*\/(game|art)\//, "$1/") + ")";
  }

  window.addEventListener("error", e => {
    try {
      const t = e.target;
      if (t && t !== window && t.tagName) { resourceFailed(t); return; }      // a <script>, <img>, <link>... that failed to load
      const err = e.error;
      const msg = err && err.message ? (err.name ? err.name + ": " : "") + err.message : e.message;
      const stack = err && err.stack || "";
      const code = classify(msg, stack, e.filename, false);
      report(code, { message: msg + (e.filename ? " (" + String(e.filename).split("/").slice(-2).join("/") + ":" + e.lineno + ":" + e.colno + ")" : ""),
        stack, title: addonTitle(code, stack, e.filename), key: code === "SM-JS-004" ? "" : undefined, fp: undefined });
    } catch (x) { /* the engine never throws */ }
  }, true);

  window.addEventListener("unhandledrejection", e => {
    try {
      const r = e.reason;
      const msg = r instanceof Error || (r && r.message) ? (r.name ? r.name + ": " : "") + r.message : safe(() => typeof r === "object" ? JSON.stringify(r) : String(r)) || String(r);
      const stack = r && r.stack || "";
      const code = classify(msg, stack, "", true);
      report(code, { message: msg, stack, title: addonTitle(code, stack) });
    } catch (x) { /* none */ }
  });

  // ---- assets --------------------------------------------------------------------------------------------------------------------------
  const assetSeen = new Set();
  function assetCode(u, tag) {
    const p = String(u || "").split(/[?#]/)[0].toLowerCase();
    if (tag === "SCRIPT" || tag === "LINK" || /\.(js|css)$/.test(p)) return "SM-AST-003";
    if (tag === "AUDIO" || tag === "VIDEO" || tag === "SOURCE" || /\.(mp3|ogg|wav|m4a|aac|opus|mp4|webm)$/.test(p)) return "SM-AST-005";
    if (/\.(glb|gltf|fbx|obj|vrm)$/.test(p)) return "SM-AST-001";
    if (tag === "IMG" || /\.(png|jpe?g|webp|gif|svg|hdr|ktx2?|basis|avif|exr)$/.test(p)) return "SM-AST-002";
    return "SM-AST-004";
  }
  function shortUrl(u) { return String(u || "").replace(location.origin + "/", "").replace(/^konto:\/\/app\//, "").slice(0, 300); }
  function assetFailed(u, tag, why, code) {
    const s = shortUrl(u);
    if (!s || assetSeen.has(s)) return;
    assetSeen.add(s);
    code = code || assetCode(s, tag);
    report(code, { message: s + (why ? " - " + why : ""), key: s.replace(/\d+/g, "#") });
  }
  function resourceFailed(el) {
    const u = el.currentSrc || el.src || el.href || "";
    if (/^(data|blob):/.test(u) || !u) return;
    assetFailed(u, el.tagName, "the " + el.tagName.toLowerCase() + " did not load");
  }
  // fetch(): the game's own files only (other sites fail offline and that is expected)
  const ownUrl = u => { const s = String(u && u.url || u || ""); if (/^(data|blob):/.test(s)) return false; if (!/^[a-z]+:/i.test(s)) return true; return s.startsWith(location.origin) || s.startsWith("konto://"); };
  if (window.fetch) {
    const of = window.fetch;
    window.fetch = function (input) {
      const p = of.apply(this, arguments);
      if (!ownUrl(input)) return p;
      const u = String(input && input.url || input);
      return p.then(res => { if (res && res.status >= 400 && !(/music\/index\.json/.test(u))) assetFailed(u, "", "HTTP " + res.status); return res; },
        err => { assetFailed(u, "", "network: " + (err && err.message || err)); throw err; });
    };
  }
  // three.js loaders, once three.js is there (it loads after this file)
  function hookLoader(cls, code) {
    const L = window.THREE && THREE[cls];
    if (!L || !L.prototype || !L.prototype.load || L.prototype.load.__kontoErr) return;
    const orig = L.prototype.load;
    L.prototype.load = function (url, onLoad, onProgress, onError) {
      const wrapped = function (err) {
        try { assetFailed(url, "", (err && (err.message || (err.target && err.target.status && "HTTP " + err.target.status) || err.type)) || "failed", code); } catch (x) { /* none */ }
        if (onError) return onError.apply(this, arguments);
      };
      return orig.call(this, url, onLoad, onProgress, wrapped);
    };
    L.prototype.load.__kontoErr = true;
  }
  function hookThree() {
    if (!window.THREE) return false;
    hookLoader("GLTFLoader", "SM-AST-001"); hookLoader("TextureLoader", "SM-AST-002"); hookLoader("CubeTextureLoader", "SM-AST-002");
    hookLoader("RGBELoader", "SM-AST-002"); hookLoader("AudioLoader", "SM-AST-005");
    return true;
  }

  // ---- console lines that mean something broke ------------------------------------------------------------------------------------------
  function watchConsole(level, text, args) {
    if (level === "error" && /THREE\.WebGLProgram: (shader error|Shader Error)|THREE\.WebGLShader: gl\.getShaderInfoLog/i.test(text)) {
      const m = /(ERROR: [^\n]{0,200})/.exec(text);
      report("SM-GPU-005", { message: clip(m ? m[1] : text.split("\n")[0], 400), detail: clip(text, 2500), key: m ? normMsg(m[1]) : "" });
    }
  }

  // ---- graphics ------------------------------------------------------------------------------------------------------------------------
  const gl = { lostAt: 0, timer: 0 };
  window.addEventListener("webglcontextlost", e => {
    try {
      const c = e.target;
      if (!c || !c.isConnected) return;                       // probes (GFX_SAFE's tester canvas) lose theirs on purpose
      const g = window.GFX_SAFE;
      const atBottom = g && g.level >= 3;
      gl.lostAt = Date.now();
      report(atBottom ? "SM-GPU-003" : "SM-GPU-001", { message: "WebGL context lost" + (e.statusMessage ? ": " + e.statusMessage : "") + " (safe level " + (g ? g.level : "?") + " before this loss)",
        key: where().replace(/at [-\d, ]+/, "").replace(/#|\d+%?/g, "") });
      clearTimeout(gl.timer);
      gl.timer = setTimeout(() => { if (gl.lostAt) report("SM-GPU-006", { message: "no webglcontextrestored and no restart 20 s after the loss" }); }, 20000);
    } catch (x) { /* none */ }
  }, true);
  window.addEventListener("webglcontextrestored", () => { gl.lostAt = 0; clearTimeout(gl.timer); logLine("info", ["[errors] WebGL context restored"]); }, true);
  window.addEventListener("beforeunload", () => { clearTimeout(gl.timer); persistStore(); });

  // ---- the persistence load (world built and checked behind the loading screen) -------------------------------------------------------
  function hookPersist() {
    const f = window.persistLoad;
    if (typeof f !== "function" || f.__kontoErr) return;
    const w = async function () {
      let rep;
      try { rep = await f.apply(this, arguments); }
      catch (e) { report("SM-PER-003", { message: (e && e.message) || String(e), stack: e && e.stack }); throw e; }
      try {
        if (rep && rep.stages) for (const s of rep.stages) if (!s.ok) report("SM-PER-002", { message: "stage '" + s.name + "': " + (s.error || "failed"), key: s.name });
        const bad = rep && rep.checks ? rep.checks.filter(c => !c.ok) : [];
        if (bad.length) report("SM-PER-001", { message: bad.length + " check" + (bad.length > 1 ? "s" : "") + " failed: " + bad.map(c => c.framework + " / " + c.name + (c.detail ? " (" + clip(c.detail, 140) + ")" : "")).join("; "),
          key: bad.map(c => c.framework + "/" + c.name).sort().join(","), detail: { failed: bad, residentMb: rep.residentMb, budgetMb: rep.budgetMb, ms: rep.ms } });
      } catch (x) { /* none */ }
      return rep;
    };
    w.__kontoErr = true;
    window.persistLoad = w;
  }

  // ---- watchdogs: the loading screen, the frame loop, memory -----------------------------------------------------------------------------
  let lastFrame = 0, frameAlarm = false, bootAlarm = false, memAlarm = false;
  if (window.requestAnimationFrame) {
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = function (cb) { return raf.call(window, typeof cb === "function" ? function (t) { lastFrame = performance.now(); return cb(t); } : cb); };
  }
  setInterval(() => {
    try {
      const now = performance.now();
      const boot = document.getElementById("boot");
      const booting = boot && !boot.hidden && getComputedStyle(boot).display !== "none";
      if (!bootAlarm && booting && Date.now() - T0 > 12 * 60e3) { bootAlarm = true; report("SM-BOOT-001", { message: "still on the loading screen after " + Math.round((Date.now() - T0) / 60e3) + " minutes" }); }
      if (!frameAlarm && lastFrame && !booting && document.visibilityState === "visible" && now - lastFrame > 8000 && !gl.lostAt) {
        frameAlarm = true;
        const first = records.find(r => r.sev === "error" && r.code !== "SM-BOOT-002");
        report("SM-BOOT-002", { message: "no frame drawn for " + Math.round((now - lastFrame) / 1000) + " s" + (first ? "; first error before it: " + first.full : "") });
      }
      if (frameAlarm && now - lastFrame < 1000) frameAlarm = false;
      const m = performance.memory;
      if (!memAlarm && m && m.jsHeapSizeLimit && m.usedJSHeapSize > 0.9 * m.jsHeapSizeLimit) { memAlarm = true; report("SM-MEM-001", { message: "JS heap " + Math.round(m.usedJSHeapSize / 1048576) + " of " + Math.round(m.jsHeapSizeLimit / 1048576) + " MB" }); }
    } catch (x) { /* none */ }
  }, 2000);

  // ---- the card, the pill and the list ---------------------------------------------------------------------------------------------------
  let ui = null, shown = null, panelOpen = false;
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function buildUI() {
    if (ui || !document.body) return ui;
    const st = el("style");
    st.textContent = [
      "#smerr{position:fixed;right:18px;bottom:18px;z-index:2147483600;font:13px/1.4 var(--ui,system-ui,sans-serif);color:#f1eee7;pointer-events:none;display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-width:min(440px,calc(100vw - 36px))}",
      "#smerr>*{pointer-events:auto}",
      "#smerr .card{background:rgba(18,20,26,.94);border:1px solid rgba(255,255,255,.14);border-left:3px solid #d0533f;border-radius:6px;padding:12px 14px;box-shadow:0 10px 30px rgba(0,0,0,.45);width:100%;box-sizing:border-box}",
      "#smerr .card.warn{border-left-color:#d9a33c}",
      "#smerr .k{font:600 11px/1 var(--data,ui-monospace,monospace);letter-spacing:.06em;opacity:.7;text-transform:uppercase}",
      "#smerr .code{font:700 17px/1.2 var(--data,ui-monospace,monospace);margin:4px 0 2px;user-select:all;letter-spacing:.02em}",
      "#smerr .t{font-weight:600;margin-bottom:2px}#smerr .h{opacity:.8;font-size:12px}",
      "#smerr .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}",
      "#smerr button{font:600 12px/1 var(--ui,system-ui,sans-serif);background:rgba(255,255,255,.1);color:#f1eee7;border:1px solid rgba(255,255,255,.2);border-radius:4px;padding:7px 10px;cursor:pointer}",
      "#smerr button:hover{background:rgba(255,255,255,.2)}#smerr button.p{background:#f1eee7;color:#15171d;border-color:#f1eee7}",
      "#smerr .x{float:right;background:none;border:0;padding:0 0 0 8px;font-size:16px;opacity:.6}",
      "#smerr .pill{background:rgba(18,20,26,.9);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:5px 11px;font:600 11px/1 var(--data,ui-monospace,monospace);cursor:pointer;display:none}",
      "#smerr .list{max-height:45vh;overflow:auto;margin-top:8px;border-top:1px solid rgba(255,255,255,.12)}",
      "#smerr .li{padding:7px 0;border-bottom:1px solid rgba(255,255,255,.08);display:flex;gap:8px;align-items:center}",
      "#smerr .li .c{font:600 12px var(--data,ui-monospace,monospace);flex:0 0 auto}#smerr .li .d{flex:1;opacity:.8;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      "#smerr .ok{font-size:12px;opacity:.85;margin-left:4px;align-self:center}"
    ].join("\n");
    document.head.appendChild(st);
    const root = el("div"); root.id = "smerr"; root.setAttribute("role", "status"); root.setAttribute("aria-live", "polite");
    const pill = el("div", "pill"); pill.title = "Problems this session (Ctrl+Shift+E)"; pill.onclick = () => togglePanel(true);
    root.appendChild(pill);
    document.body.appendChild(root);
    ui = { root, pill, card: null };
    return ui;
  }
  function closeCard() { if (ui && ui.card) { ui.card.remove(); ui.card = null; } shown = null; panelOpen = false; updatePill(); }
  function cardFor(r, label) {
    buildUI(); if (!ui) return;
    if (ui.card) ui.card.remove();
    const c = el("div", "card" + (r.sev === "warn" ? " warn" : ""));
    const x = el("button", "x", "×"); x.title = "Close"; x.onclick = () => { r.seen = true; persistStore(); closeCard(); };
    c.appendChild(x);
    c.appendChild(el("div", "k", label || (r.sev === "warn" ? "Problem found" : "Something went wrong")));
    c.appendChild(el("div", "code", r.full));
    c.appendChild(el("div", "t", r.title + (r.count > 1 ? "  ×" + r.count : "")));
    const rb = buildOf(r) || thisBuild();
    c.appendChild(el("div", "h", "Build " + shortBuild(rb) + " · " + whenText(r.at) + (rb && thisBuild() && rb !== thisBuild() ? " · from an older build, not the one running now (" + shortBuild(thisBuild()) + ")" : "")));
    c.appendChild(el("div", "h", r.hint + " Copy the report and paste it to Claude, or open a GitHub issue."));
    const row = el("div", "row");
    const ok = el("span", "ok");
    const b1 = el("button", "p", "Copy report"); b1.onclick = () => copy(pasteText(r)).then(done => { ok.textContent = done ? "Copied" : "Copy failed: see the log file"; r.seen = true; persistStore(); });
    const b2 = el("button", "", "Open GitHub issue"); b2.onclick = () => { openIssue(r); ok.textContent = "Report copied too"; r.seen = true; persistStore(); };
    row.appendChild(b1); row.appendChild(b2);
    if (desk && desk.openLog) { const b3 = el("button", "", "Log file"); b3.onclick = () => safe(() => desk.openLog()); row.appendChild(b3); }
    if (records.length > 1) { const b4 = el("button", "", "All (" + records.length + ")"); b4.onclick = () => togglePanel(true); row.appendChild(b4); }
    row.appendChild(ok);
    c.appendChild(row);
    ui.root.appendChild(c); ui.card = c; shown = r;
    updatePill();
  }
  function togglePanel(open) {
    buildUI(); if (!ui) return;
    if (panelOpen && open !== true) { closeCard(); return; }
    if (ui.card) ui.card.remove();
    panelOpen = true;
    const all = records.slice().reverse();
    const prev = (safe(() => JSON.parse(localStorage.getItem(STORE) || "[]")) || []).filter(o => o.session !== SESSION).reverse().slice(0, 8)
      .sort((a, b) => (sameBuild(a) ? 0 : 1) - (sameBuild(b) ? 0 : 1));
    const c = el("div", "card");
    const x = el("button", "x", "×"); x.onclick = closeCard; c.appendChild(x);
    c.appendChild(el("div", "k", "Error engine · build " + shortBuild(thisBuild())));
    c.appendChild(el("div", "t", all.length ? all.length + " problem" + (all.length > 1 ? "s" : "") + " this session" : "No problems this session"));
    const list = el("div", "list");
    const line = (r, old) => {
      const li = el("div", "li");
      li.appendChild(el("span", "c", r.full));
      li.appendChild(el("span", "d", (old ? (sameBuild(r) ? "last time · " : "older build " + shortBuild(buildOf(r)) + " · ") : "") + r.title + (r.count > 1 ? " ×" + r.count : "") + (r.message ? " · " + r.message : "")));
      const b = el("button", "", "Copy"); b.onclick = () => copy(pasteText(r)).then(d => { b.textContent = d ? "Copied" : "Failed"; });
      li.appendChild(b);
      li.onclick = ev => { if (ev.target === li || ev.target.className === "d") cardFor(r, old ? "From last time" : undefined); };
      list.appendChild(li);
    };
    all.forEach(r => line(r, false)); prev.forEach(r => line(r, true));
    c.appendChild(list);
    const row = el("div", "row");
    if (all.length) { const b = el("button", "p", "Copy all"); b.onclick = () => copy(all.map(pasteText).join("\n\n")).then(d => { b.textContent = d ? "Copied" : "Failed"; }); row.appendChild(b); }
    if (desk && desk.openLog) { const b3 = el("button", "", "Log file"); b3.onclick = () => safe(() => desk.openLog()); row.appendChild(b3); }
    c.appendChild(row);
    ui.root.appendChild(c); ui.card = c;
    updatePill();
  }
  function updatePill() {
    if (!ui) return;
    const n = records.length;
    ui.pill.style.display = n && !ui.card ? "block" : "none";
    ui.pill.textContent = n + " problem" + (n > 1 ? "s" : "") + " · Ctrl+Shift+E";
  }
  // a card for a new error, once per code this session; warnings only count on the pill; nothing covers a card the player has open
  const carded = new Set();
  function updateUI(r) {
    if (!document.body) { document.addEventListener("DOMContentLoaded", () => updateUI(r), { once: true }); return; }
    buildUI();
    if (r && r.sev === "error" && !carded.has(r.code) && !panelOpen) { carded.add(r.code); if (!shown || shown.sev !== "error" || shown.seen) cardFor(r); }
    else if (shown && ui.card && !panelOpen) { const t = ui.card.querySelector(".t"); if (t) t.textContent = shown.title + (shown.count > 1 ? "  ×" + shown.count : ""); }
    updatePill();
  }
  // the build that is running, in the corner of the title screen, so it is easy to tell an old install from a new one
  safe(() => {
    const put = () => {
      if (document.getElementById("smbuild")) return;
      const i = safe(() => info()) || {}, b = i.build || "";
      const t = el("div"); t.id = "smbuild";
      t.textContent = (i.version && i.version !== "web" ? "v" + i.version + " · " : "") + (b ? "build " + b : "browser build") + (i.update ? " + update " + i.update : "");
      const st = document.createElement("style");
      st.textContent = "#smbuild{position:fixed;right:10px;bottom:6px;z-index:40;font:500 11px var(--data,ui-monospace,monospace);color:rgba(255,255,255,.55);pointer-events:none;display:none}body.titleup #smbuild{display:block}";
      document.head.appendChild(st); document.body.appendChild(t);
    };
    if (document.body) put(); else document.addEventListener("DOMContentLoaded", put, { once: true });
  });
  document.addEventListener("keydown", e => { if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e")) { e.preventDefault(); e.stopPropagation(); togglePanel(); } }, true);

  // ---- what happened last time (a report raised just before a restart, a crash the desktop app saw) ---------------------------------------
  function lastTime() {
    const pending = [];
    if (desk) safe(() => (desk.pending() || []).forEach(p => pending.push(p)));
    // the page's own: errors from the previous session not yet looked at (a driver reset restarts the page within two seconds)
    const old = (safe(() => JSON.parse(localStorage.getItem(STORE) || "[]")) || []).filter(o => o.session !== SESSION && !o.seen && o.sev === "error" && Date.now() - Date.parse(o.at) < 6 * 3600e3 && sameBuild(o));
    const lastSess = old.length ? old[old.length - 1].session : null;
    const mine = old.filter(o => o.session === lastSess);
    for (const p of pending) {                               // the desktop app's own records become full ones here
      const def = CODES[p.code] || CODES["SM-ELC-001"];
      const r = { code: p.code, fp: p.fp, full: p.code + "-" + p.fp, session: "main", sev: def.sev, title: def.title, hint: def.hint, message: p.message || "", stack: p.stack || "",
        detail: p.detail || null, at: p.at, uptime: p.uptime || 0, count: p.count || 1, where: "(the page had stopped)", info: info(), log: (p.log || []).map(t => ({ t: 0, level: "main", text: String(t) })), from: "desktop app", seen: false };
      mine.push(r);
    }
    if (!mine.length) return;
    // shown as if raised now (so Copy report works as normal), but labelled as from last time
    mine.forEach(o => { if (!byKey.has(o.full)) { o.session = SESSION; o.prev = true; byKey.set(o.full, o); records.push(o); } });
    persistStore();
    const worst = mine.find(o => /^SM-(ELC|GPU)/.test(o.code)) || mine[mine.length - 1];
    setTimeout(() => { buildUI(); cardFor(worst, "Last time the game had a problem"); carded.add(worst.code); }, 1500);
  }

  // the desktop app reports what it sees while the page is alive (GPU process gone, window hung)
  if (desk && desk.onMain) safe(() => desk.onMain(p => {
    report(p.code, { message: p.message, stack: p.stack, fp: p.fp, detail: p.detail, from: "desktop app" });
  }));

  document.addEventListener("DOMContentLoaded", () => {
    hookThree();
    hookPersist();
    lastTime();
  });
  // three.js and persist-hook are both ordinary scripts, so they are in place by DOMContentLoaded; this covers a page that defines them later
  setTimeout(() => { hookThree(); hookPersist(); }, 0);
  window.addEventListener("load", () => { hookThree(); hookPersist(); });

  // ---- console / tests -----------------------------------------------------------------------------------------------------------------
  function errors() { return records.map(r => r.full + "  " + r.title + (r.count > 1 ? " ×" + r.count : "") + (r.message ? "  " + r.message : "")).join("\n") || "no problems this session"; }
  errors.list = () => records.slice();
  errors.copy = i => { const r = typeof i === "number" ? records[i] : records[records.length - 1]; return r ? copy(pasteText(r)) : Promise.resolve(false); };
  errors.text = i => { const r = typeof i === "number" ? records[i] : records[records.length - 1]; return r ? reportText(r) : ""; };
  errors.test = (code, msg) => report(CODES[code] ? code : "SM-JS-001", { message: msg || "test report from errors.test()", key: "test" + Math.random() });
  errors.open = () => togglePanel(true);
  errors.codes = CODES;
  window.errors = errors;
  window.KONTO_ERRORS = { report, codes: CODES, records, reportText, issueUrl, fingerprint, classify, open: () => togglePanel(true), log: LOG };
})();
