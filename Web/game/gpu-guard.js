// ---- GPU guard: integrated graphics (Intel Iris Xe / UHD, AMD APUs) without driver resets ------------------------------------------------
// An integrated GPU has no video memory of its own. Its textures live in the machine's RAM, in a slice Windows lends it, and the driver
// drops the whole device (Chromium's GPU process exits with code 34, the page sees "WebGL context lost") when that slice runs out or one
// frame keeps the chip busy past Windows' two-second limit. The game used to treat an Iris Xe like a mid-range card: it got medium quality
// at the screen's HiDPI scale, and every model's textures went up at full size (the Foundry and Forge models alone carry ~7 GB of
// texture if every one is uploaded at full size, mostly 1024-2048 px PBR sets).
//
// This file runs before the game script. It:
//   1  names the graphics chip and decides whether it is integrated (GPU_GUARD.kind: discrete / integrated / weak / software);
//   2  on integrated graphics caps the quality tiers (pixel ratio 1, render scale <= 0.9 on medium, shadow maps <= 2048, normal maps <=
//      512) and starts weak chips (Intel UHD / HD Graphics) on low;
//   3  keeps a ledger of the video memory the game's textures use (it watches the WebGL calls, so it counts everything, the game's own
//      textures, glTF models and render targets) and shrinks any texture bigger than the cap before it goes up: 1024 px while there is
//      room, 512 px past 75% of the budget, 256 px past it. Shrinking is by halves, so a power-of-two texture stays one;
//   4  learns: when the context is lost anyway, the budget for the next start is cut by a third (remembered, localStorage
//      konto.igpuBudget), on top of the safe-graphics ladder in konto.html (GFX_SAFE).
// It never touches a discrete card. ?igpu=0 turns it off, ?igpu=1 forces it on (to test on any machine). Console: GPU_GUARD.report().
(function () {
  "use strict";
  const VERSION = "2026-11-20";
  const Q = location.search;
  const forcedOff = /[?&]igpu=0\b/.test(Q), forcedOn = /[?&]igpu=1\b/.test(Q);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* private window */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* none */ } }
  };

  // ---- 1  what the chip is -------------------------------------------------------------------------------------------------------------
  let gpu = "";
  try {
    const c = document.createElement("canvas"), gl = c.getContext("webgl2") || c.getContext("webgl");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    const lose = gl && gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
  } catch (e) { /* no WebGL: the game reports SM-GPU-004 */ }
  // ANGLE on Windows names an Iris Xe "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)".
  function classify(name) {
    if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(name)) return "software";
    if (/intel/i.test(name) && /\barc\b/i.test(name)) return "discrete";
    if (/iris|intel.*xe\b/i.test(name)) return "integrated";                   // Iris Xe, Iris Plus, Iris Pro
    if (/intel|uhd graphics|hd graphics/i.test(name)) return "weak";            // UHD 600/700 series, HD 500/600
    if (/radeon\(tm\) (vega|graphics)|radeon graphics|radeon \d{3}m\b|vega \d|radeon\(tm\) \d{3}m/i.test(name)) return "integrated";   // Ryzen APUs
    if (/mali|adreno|powervr|apple gpu/i.test(name)) return "integrated";
    return "discrete";
  }
  const kind = classify(gpu);
  const irisXe = /iris.{0,4}xe/i.test(gpu);
  const on = !forcedOff && (forcedOn || kind === "integrated" || kind === "weak");

  // The machine's RAM, from the desktop build (navigator.deviceMemory stops at 8). The driver lends an integrated GPU up to half of it.
  let ramGB = 0;
  try { const i = window.KONTO_DESKTOP && KONTO_DESKTOP.errors && KONTO_DESKTOP.errors.info(); const m = /(\d+)\s*GB RAM/.exec(i && i.os || ""); if (m) ramGB = +m[1]; } catch (e) { /* web */ }
  if (!ramGB) ramGB = navigator.deviceMemory || 8;

  // ---- the budget for textures and render targets ----------------------------------------------------------------------------------------
  // 1.2 GB on a 16 GB machine, 0.8 GB on 8 GB, 0.5 GB below that: far under what the driver lends, because the page's own heap (up to
  // 4 GB), the browser and Windows share the same RAM. A start after a loss on this version gets two thirds of the last budget.
  const BASE = ramGB >= 16 ? 1200 : ramGB >= 8 ? 800 : 500;
  let budgetMb = BASE;
  const learned = parseInt(store.get("konto.igpuBudget") || "", 10);
  if (store.get("konto.gpuGuard") !== VERSION) {
    // First start on this version: what the old builds learned (the safe-graphics ladder stuck at "half resolution, no persistence")
    // came from the uncapped textures this file now prevents, so integrated graphics start again from the top of the ladder.
    store.del("konto.igpuBudget");
    if (on) store.del("konto.gfxSafe");
    store.set("konto.gpuGuard", VERSION);
  } else if (learned > 0) budgetMb = Math.max(300, Math.min(BASE, learned));

  // ---- 2  the quality tiers ------------------------------------------------------------------------------------------------------------
  function capTiers(TIERS) {
    if (!on || !TIERS || capTiers.done) return;
    capTiers.done = true;
    for (const k in TIERS) {
      const t = TIERS[k];
      t.maxPixelRatio = Math.min(t.maxPixelRatio || 1, 1);        // a 150%-scaled laptop screen drew 2.25x the pixels
      t.renderScale = Math.min(t.renderScale || 1, 1);
      t.shadowMap = Math.min(t.shadowMap || 1024, 2048);
      t.normalMax = Math.min(t.normalMax || 512, 512);
      t.tex = Math.min(t.tex || 1, 2);
      t.far = Math.min(t.far || 1100, 2200);
    }
    if (TIERS.medium) Object.assign(TIERS.medium, { renderScale: 0.9, cars: Math.min(TIERS.medium.cars, 70), far: Math.min(TIERS.medium.far, 1600) });
    if (kind === "weak" && TIERS.medium) TIERS.medium.shadowMap = 1024;
  }
  // the tier a first start on this chip gets (a tier the player picked always wins)
  function startTier(guess) { if (!on) return guess; return kind === "weak" || ramGB < 8 ? "low" : guess === "low" ? "low" : "medium"; }

  // ---- 3  the ledger, and the texture cap ----------------------------------------------------------------------------------------------
  const L = { bytes: 0, peak: 0, textures: 0, shrunk: 0, savedBytes: 0, losses: 0, attached: false };
  const capPx = () => {
    const safe = window.GFX_SAFE ? GFX_SAFE.level : 0;
    const mb = L.bytes / 1048576;
    let cap = mb > budgetMb ? 256 : mb > budgetMb * 0.75 ? 512 : 1024;
    if (safe >= 2) cap = Math.min(cap, 512);
    return cap;
  };
  const resident = new Map();   // WebGLTexture -> { target: bytes }
  function account(tex, target, bytes) {
    if (!tex) return;
    let r = resident.get(tex);
    if (!r) { r = {}; resident.set(tex, r); L.textures++; }
    L.bytes += bytes - (r[target] || 0);
    r[target] = bytes;
    if (L.bytes > L.peak) L.peak = L.bytes;
  }
  const shrunkCache = new WeakMap();   // decoded image -> { cap, canvas } (images do not change; canvases can, so they are never cached)
  function sourceSize(s) {
    if (typeof HTMLVideoElement !== "undefined" && s instanceof HTMLVideoElement) return null;   // video frames stream; leave them
    if (typeof ImageData !== "undefined" && s instanceof ImageData) return null;
    const w = s.naturalWidth || s.videoWidth || s.width, h = s.naturalHeight || s.videoHeight || s.height;
    return w > 0 && h > 0 ? [w, h] : null;
  }
  function shrink(src, w, h, cap) {
    const isCanvas = (typeof HTMLCanvasElement !== "undefined" && src instanceof HTMLCanvasElement) || (typeof OffscreenCanvas !== "undefined" && src instanceof OffscreenCanvas);
    if (!isCanvas) { const c = shrunkCache.get(src); if (c && c.cap === cap) return c.canvas; }
    let W = w, H = h; while (Math.max(W, H) > cap) { W = Math.max(1, W >> 1); H = Math.max(1, H >> 1); }
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const x = cv.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.drawImage(src, 0, 0, W, H);
    if (!isCanvas) shrunkCache.set(src, { cap, canvas: cv });
    L.shrunk++; L.savedBytes += (w * h - W * H) * 4 * 1.33;
    return cv;
  }
  function bytesPer(gl, format, type) {
    if (type === 0x8363 || type === 0x8033 || type === 0x8034 || type === gl.UNSIGNED_SHORT) return 2;   // packed 16-bit, depth 16
    if (type === 0x84FA || type === gl.UNSIGNED_INT) return 4;                                           // depth 24/8, depth 32
    const ch = format === gl.RGBA ? 4 : format === gl.RGB ? 3 : format === gl.LUMINANCE_ALPHA || format === 0x8227 /* RG */ ? 2 : 1;
    const sz = type === gl.FLOAT ? 4 : type === 0x8D61 /* HALF_FLOAT_OES */ || type === 0x140B /* HALF_FLOAT */ ? 2 : 1;
    return ch * sz;
  }
  function storageBytes(gl, internal) {
    switch (internal) {
      case 0x881A: return 8;  case 0x8814: return 16; case 0x822F: return 4; case 0x822E: return 4; case 0x822D: return 2;  // RGBA16F, RGBA32F, RG16F, R32F, R16F
      case 0x81A6: case 0x88F0: case 0x8CAC: return 4; case 0x81A5: return 2;                                              // depth 24, 24/8, 32F, 16
      case 0x8051: return 3; case 0x8229: return 1; case 0x822B: return 2; default: return 4;                              // RGB8, R8, RG8
    }
  }

  function attach(renderer) {
    if (!on || !renderer || L.attached) return;
    const gl = renderer.getContext && renderer.getContext();
    if (!gl || gl.__gpuGuard) return;
    gl.__gpuGuard = true; L.attached = true;
    const T2D = gl.TEXTURE_2D, CUBE = gl.TEXTURE_CUBE_MAP, CUBE0 = gl.TEXTURE_CUBE_MAP_POSITIVE_X;
    let unit = 0; const bound = [];   // per texture unit: { 2d, cube }
    const slot = () => bound[unit] || (bound[unit] = { t2: null, cube: null });
    const bindFor = target => target === T2D ? slot().t2 : (target >= CUBE0 && target < CUBE0 + 6) ? slot().cube : null;
    const o = {
      activeTexture: gl.activeTexture, bindTexture: gl.bindTexture, deleteTexture: gl.deleteTexture,
      texImage2D: gl.texImage2D, texStorage2D: gl.texStorage2D, compressedTexImage2D: gl.compressedTexImage2D
    };
    gl.activeTexture = function (u) { unit = u - gl.TEXTURE0; return o.activeTexture.call(gl, u); };
    gl.bindTexture = function (target, tex) {
      if (target === T2D) slot().t2 = tex; else if (target === CUBE) slot().cube = tex;
      return o.bindTexture.call(gl, target, tex);
    };
    gl.deleteTexture = function (tex) {
      const r = tex && resident.get(tex);
      if (r) { for (const k in r) L.bytes -= r[k]; resident.delete(tex); L.textures--; }
      return o.deleteTexture.call(gl, tex);
    };
    gl.texImage2D = function () {
      const a = arguments, target = a[0], level = a[1];
      if (a.length === 6 && a[5] && typeof a[5] === "object") {
        // texImage2D(target, level, internalformat, format, type, source): an image, a decoded bitmap or a canvas
        let src = a[5]; const wh = level === 0 ? sourceSize(src) : null;
        if (wh) {
          const cap = capPx();
          if (Math.max(wh[0], wh[1]) > cap) {
            try { src = shrink(src, wh[0], wh[1], cap); } catch (e) { /* tainted or detached: upload as it is */ }
          }
          const s2 = sourceSize(src) || wh;
          account(bindFor(target), target, s2[0] * s2[1] * bytesPer(gl, a[3], a[4]) * 1.33);
          return o.texImage2D.call(gl, a[0], a[1], a[2], a[3], a[4], src);
        }
      } else if (a.length >= 9 && level === 0) {
        // texImage2D(target, level, internalformat, width, height, border, format, type, pixels): data textures and render targets
        account(bindFor(target), target, a[3] * a[4] * bytesPer(gl, a[6], a[7]) * (a[8] ? 1.33 : 1));
      }
      return o.texImage2D.apply(gl, a);
    };
    if (o.texStorage2D) gl.texStorage2D = function (target, levels, internal, w, h) {
      const tex = target === T2D ? slot().t2 : target === CUBE ? slot().cube : null;
      account(tex, target, w * h * storageBytes(gl, internal) * (levels > 1 ? 1.33 : 1) * (target === CUBE ? 6 : 1));
      return o.texStorage2D.apply(gl, arguments);
    };
    gl.compressedTexImage2D = function (target, level) {
      const data = arguments[arguments.length - 1];
      if (level === 0 && data && data.byteLength) account(bindFor(target), target, data.byteLength * 1.33);
      return o.compressedTexImage2D.apply(gl, arguments);
    };

    // ---- 4  a lost context: everything on the card is gone; remember how full it was and ask for less next time ------------------------
    const canvas = renderer.domElement;
    canvas.addEventListener("webglcontextlost", () => {
      L.losses++;
      const mb = Math.round(L.bytes / 1048576);
      L.lastLoss = { mb, peakMb: Math.round(L.peak / 1048576), cap: capPx(), at: Date.now() };
      // the budget for the next start: two thirds of what was on the card when it went (never under 300 MB)
      const next = Math.max(300, Math.round(Math.min(budgetMb, Math.max(mb, 300)) * 0.66));
      store.set("konto.igpuBudget", next);
      try { sessionStorage.setItem("konto.igpuLoss", JSON.stringify(L.lastLoss)); } catch (e) { /* none */ }
      console.warn("[GPU guard] context lost with ~" + mb + " MB of textures on the card (peak " + L.lastLoss.peakMb + " MB); next start's budget " + next + " MB");
      resident.clear(); L.bytes = 0; L.textures = 0; bound.length = 0; unit = 0;
    }, false);
    canvas.addEventListener("webglcontextrestored", () => { bound.length = 0; unit = 0; }, false);
    // a quiet hour of play on this budget: the next start may have a little more back
    setTimeout(() => { if (!L.losses && learned > 0 && learned < BASE) store.set("konto.igpuBudget", Math.min(BASE, Math.round(learned * 1.25))); }, 3600e3);
  }

  // what the background upload and the persistence engine may still ask for, in bytes
  function room() { return on ? Math.max(1, budgetMb * 1048576 * 0.85 - L.bytes) : Infinity; }

  function report() {
    return {
      gpu, kind, irisXe, on, ramGB, budgetMb, version: VERSION,
      textureMb: Math.round(L.bytes / 1048576), peakMb: Math.round(L.peak / 1048576), textures: L.textures,
      capPx: on ? capPx() : null, shrunk: L.shrunk, savedMb: Math.round(L.savedBytes / 1048576), losses: L.losses,
      lastLoss: L.lastLoss || (() => { try { return JSON.parse(sessionStorage.getItem("konto.igpuLoss") || "null"); } catch (e) { return null; } })()
    };
  }
  // one line for the error engine's reports
  function line() {
    if (!on) return "GPU guard off (" + kind + ")";
    const r = report();
    return "GPU guard " + kind + (irisXe ? " (Iris Xe)" : "") + " · textures " + r.textureMb + "/" + r.budgetMb + " MB (peak " + r.peakMb + ") · cap " + r.capPx + " px · " + r.shrunk + " shrunk" +
      (r.lastLoss ? " · last loss at " + r.lastLoss.mb + " MB" : "");
  }

  window.GPU_GUARD = { get on() { return on; }, kind, gpu, irisXe, ramGB, get budgetMb() { return budgetMb; }, classify, capTiers, startTier, attach, room, report, line, VERSION };
  if (on) console.log("[GPU guard] " + kind + " graphics (" + (gpu || "unknown") + "), " + ramGB + " GB RAM: integrated preset on, texture budget " + budgetMb + " MB");
})();
