// The game's side of the Shigoto performance engine (SHIGOTO.PerformanceEngine; Engine/src/perf/Performance.js): a steady 60 fps and no
// stutter, on any laptop or PC.
//
// What it does in the game:
//   FRAME PACING   frameLoop() asks it whether this screen refresh gets a game frame, and for the time step. 60/75/90 Hz: every refresh.
//                  120 Hz: every second one (60 fps). 144/165 Hz: every second one (72/82 fps), a steady rate instead of a judder between
//                  one and two refreshes a frame, and less heat on a laptop (a hot laptop slows itself down, which is stutter too).
//                  The time step is snapped to whole refreshes, and a one-off long frame is spread over the next few.
//   BUDGETS        building close-up detail (detailTick), engine cell streaming and the background graphics upload take their time from
//                  the frame's headroom: less when the frame is full, almost none straight after a hitch. The background upload (persist-
//                  hook) now runs one small batch right after a frame with room to spare, instead of 30-120 ms batches in the middle of play.
//   GOVERNOR       holds the target by the slowest 10% of frames, not the average. Graphics card the bottleneck: resolution down a few
//                  per cent at a time to 85%, then shadows redrawn every other frame, then no ambient occlusion, then resolution to 67%.
//                  Processor the bottleneck: smaller work budgets, then lighter traffic. Everything comes back, in reverse, with room.
//                  The quality tier itself is never changed (that stays the player's). Off with Settings > adaptive graphics as before.
//   HITCHES        each long frame is blamed: shader compile, texture upload, garbage collection, a named part of the game, or the
//                  graphics card / driver. Repeated big hitches raise SM-PRF-001 in the error engine (with the breakdown in the report),
//                  a frame rate that stays far under target raises SM-PRF-002.
//
// F3 shows it (pace, 90th-percentile frame, what is the bottleneck, levers, last hitch). Console: shigoto.perf() for the full report,
// shigoto.perfCap(n) to cap at n fps (0 = no cap, "auto" = default). Off switch: ?perf=0 or localStorage konto.perf=0.
// Frame cap: ?fps=N or localStorage konto.fpsCap (auto | 0 | 30 | 60 | ...).

(function () {
  if (!window.SHIGOTO || !SHIGOTO.PerformanceEngine) { console.warn("[Konto] performance engine not in this build"); return; }
  const store = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  if (/[?&]perf=0\b/.test(location.search) || store("konto.perf") === "0") { console.log("[Konto] performance engine turned off"); return; }
  const qCap = /[?&]fps=(\w+)/.exec(location.search);
  const capSetting = () => { const v = qCap ? qCap[1] : store("konto.fpsCap"); return v == null || v === "" || v === "auto" ? "auto" : (+v >= 0 ? +v : "auto"); };

  const P = new SHIGOTO.PerformanceEngine({ targetFps: 60, cap: capSetting(), softFloor: 0.85, floor: 0.67, maxScale: 1 });
  const G = P.governor;
  // (the game's top-level consts, perf, gameSet, traffic, fx, gfx, are not on window, but other classic scripts see them by name)
  const hasTraffic = () => typeof traffic !== "undefined" && !!traffic;
  const R = () => (typeof renderer !== "undefined" ? renderer : null);
  let frameNo = 0, setup = false, wrapsDone = false, lastShow = 0;

  // ---- the levers the governor can pull (never the tier) -------------------------------------------------------------------------------
  const K = window.KONTO_PERF = {
    on: true, engine: P, noAO: false, shadowHalf: false,
    frame(now) { return P.frame(now); },
    end(playing) {
      frameNo++;
      const r = R();
      if (r && !setup) init(r);
      if (frameNo % 30 === 0) cullTier();
      if (!wrapsDone && playing) installWraps();
      // shadows every other frame (the sun barely moves in a frame, and on a struggling card the shadow pass is a large share of it)
      if (r && r.shadowMap) {
        if (K.shadowHalf && r.shadowMap.enabled) { r.shadowMap.autoUpdate = false; if (frameNo % 2 === 0) r.shadowMap.needsUpdate = true; }
      }
      // the Shigoto engine asks for its streaming budget
      const S = window.shigoto;
      if (S && S.engine && !S.engine.perf) S.engine.perf = P;
      G.enabled = useGovernor();
      if (G.enabled && typeof perf === "object" && Math.abs(perf.mult - G.scale) > 0.004 && !G._mine) G.scale = perf.mult;   // the player or a reset changed it
      P.playing = !!playing;
      P.end(r);
      if (typeof perf === "object" && P.lastStats && P.lastStats.p50 > 0 && G.enabled) perf.fps = 1000 / P.lastStats.p50;
      if (typeof perf === "object" && perf.shown && performance.now() - lastShow > 500) { lastShow = performance.now(); try { perfShow(); } catch (e) { /* overlay */ } }
      watch();
    },
    budget(name, ms) { return P.budget(name, ms); },
    idle(o) { return P.idle(o); }
  };
  function useGovernor() { return typeof gameSet === "object" && gameSet.adapt && !gameSet.pcMode && !gameSet.adaptTier; }

  function init(r) {
    setup = true;
    const hw = P.probe(r);
    // the screen's refresh rate from the desktop app (asked again when the window changes size or every 20 s, in case it moved screens)
    const askHz = () => { try { const hz = window.KONTO_DESKTOP && KONTO_DESKTOP.displayHz ? KONTO_DESKTOP.displayHz() : 0; if (hz > 0 && Math.abs(hz - P.pacer.hintHz) > 1) P.pacer.hint(hz); } catch (e) { /* browser build */ } };
    askHz(); addEventListener("resize", askHz); setInterval(askHz, 20000);
    console.log("[Konto] performance engine: " + (hw.gpu || "unknown GPU") + " (" + hw.cls + ", " + hw.cores + " cores" + (hw.memGB ? ", " + hw.memGB + " GB" : "") + ")" +
      ", pacing for " + (P.pacer.cap === "auto" ? "60 fps" : P.pacer.cap ? P.pacer.cap + " fps" : "no cap"));
    G.setScale = m => { if (typeof perf !== "object") return; G._mine = true; perf.mult = m; try { sizeRenderer(); } finally { G._mine = false; } };
    if (typeof perf === "object") G.scale = perf.mult || 1;
    G.lever({ name: "shadows half-rate", kind: "gpu", available: () => !!(R() && R().shadowMap.enabled),
      apply: on => { K.shadowHalf = on; const rr = R(); if (!on && rr) rr.shadowMap.autoUpdate = true; } });
    G.lever({ name: "no ambient occlusion", kind: "gpu", available: () => typeof fx === "object" && fx && fx.on && typeof gfx === "object" && (gfx.tier === "high" || gfx.tier === "ultra"),
      apply: on => { K.noAO = on; } });
    G.lever({ name: "lighter traffic", kind: "cpu", available: () => hasTraffic() && traffic.max > 30,
      apply: on => { if (!hasTraffic()) return; if (on) { K.trafficWas = traffic.max; traffic.max = Math.round(traffic.max * 0.7); } else if (K.trafficWas) { traffic.max = K.trafficWas; K.trafficWas = 0; } } });
    // the old controls keep working: Settings' "Undo automatic graphics changes" and the holds the game asks for (doors, teleports, loads)
    if (typeof window.perfRestore === "function") { const was = window.perfRestore; window.perfRestore = function () { G.restore(); return was.apply(this, arguments); }; }
    if (typeof window.perfHold === "function") { const was = window.perfHold; window.perfHold = function (s) { if (s > 2) G.hold(Math.min(s, 3)); return was.apply(this, arguments); }; }
    // the average-based resolution governor stands down while this one runs (it still runs when tier stepping is switched on)
    if (typeof window.perfFrame === "function") { const was = window.perfFrame; window.perfFrame = function (raw) { if (useGovernor()) return; return was.apply(this, arguments); }; }
    if (typeof window.perfShow === "function") {
      const was = window.perfShow;
      window.perfShow = function () {
        const out = was.apply(this, arguments);
        try { if (typeof perf === "object" && perf.el) perf.el.textContent += "\n" + overlayText(); } catch (e) { /* overlay */ }
        return out;
      };
    }
    installDrawCull(r);
    try { installIndoorCull(r); } catch (e) { console.warn("[Konto] indoor cull", e); }
    G.lever({ name: "fewer far details", kind: "cpu", available: () => !!(K.cull && K.cull.on),
      apply: on => { K.cull.boost = on ? 1.8 : 1; } });
    if (r.domElement) r.domElement.addEventListener("webglcontextrestored", () => { P.pacer.reset(); G.hold(3); });
    document.addEventListener("visibilitychange", () => { P.pacer.reset(); G.hold(2); });
  }

  // ---- draw-call culling (2026-11-14) ---------------------------------------------------------------------------------------------------
  // On integrated graphics (Iris Xe through ANGLE/Direct3D 11) every draw call costs the processor a fixed slice of the frame, and a
  // Tōkonto street was asking for 4,000+ of them. Two kinds were pure waste, and are skipped at the last moment before they reach the driver:
  //   EMPTY   an InstancedMesh with nothing in it (count 0) still went to the driver as a draw of zero instances, with all its state set up;
  //           pools of cars, people, signs and lit windows that are empty most of the time were over a hundred calls a frame.
  //   SPECKS  a mesh that covers less than about two pixels from where the camera is (a vending machine 1.5 km off, a bollard across the
  //           bay): the threshold is the sphere's radius over its distance, by tier, scaled with the lens so a zoomed camera keeps them.
  //           Only for the eye's (perspective) camera: shadow maps, post passes and anything with userData.noSizeCull are left alone, and so are
  //           skinned meshes and instanced meshes (their bounds are one instance's, not the set's) unless a chunk's bounds were pinned.
  // Both only in the game's own scene, so the graphics warm-up (which draws through a proxy of it) still compiles and uploads everything.
  // Off: ?cull=0. Console: shigoto.cull() for the counts.
  function installDrawCull(r) {
    if (/[?&]cull=0\b/.test(location.search) || store("konto.cull") === "0" || typeof THREE !== "object") return;
    const orig = r.renderBufferDirect;
    const sph = new THREE.Sphere(), C = K.cull = { on: true, boost: 1, empty: 0, small: 0, k: 0.002 };
    const T29 = Math.tan(29 * Math.PI / 180);
    const mainScene = () => (typeof scene !== "undefined" ? scene : null);
    r.renderBufferDirect = function (cam, sc, geo, mat, obj, grp) {
      // only the game's own scene: the graphics warm-up renders through a proxy of it and must still reach every program and texture
      const own = sc === mainScene();
      if (C.on && obj && (own || sc === null)) {        // (shadow maps pass no scene)
        if (obj.isInstancedMesh && obj.count === 0) { C.empty++; return; }
        if (own && cam && cam.isPerspectiveCamera && obj.isMesh && geo && !obj.isSkinnedMesh && !(obj.userData && obj.userData.noSizeCull) && (!obj.isInstancedMesh || geo.userData.pinnedSphere)) {
          let bs = geo.boundingSphere;
          if (!bs) { geo.computeBoundingSphere(); bs = geo.boundingSphere; }
          if (bs && bs.radius > 0) {
            sph.copy(bs).applyMatrix4(obj.matrixWorld);
            const e = cam.matrixWorld.elements, dx = sph.center.x - e[12], dy = sph.center.y - e[13], dz = sph.center.z - e[14];
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - sph.radius;
            if (d > 40 && sph.radius < d * C.k * C.boost * Math.tan((cam.fov || 58) * Math.PI / 360) / T29) { C.small++; return; }
          }
        }
      }
      return orig.call(this, cam, sc, geo, mat, obj, grp);
    };
    (window.shigoto || (window.shigoto = {})).cull = () => ({ on: C.on, k: C.k, boost: C.boost, emptySkipped: C.empty, specksSkipped: C.small });
  }
  // ---- indoors, the city is not drawn (2026-11-15) ---------------------------------------------------------------------------------------
  // Rooms live at interior.floorY (400 m up) and the street outside is a photograph (seamless-hook's cube maps), but the whole city stayed in
  // the scene underneath: everything three.js can't frustum-cull (whole-map instanced trees, roads, kits: frustumCulled = false) went to the
  // driver anyway. The title and the opening (both inside Tōkonto Central) were drawing ~3,400 calls and ~20M triangles of a city nobody can
  // see. Now, while the eye's camera is up at room height: the world root is not even walked (it holds only street things), and any other
  // draw whose bounds lie wholly below the rooms is skipped at the last moment. Cube-map photographs of the street are taken from street
  // level, so they still see everything. Off: ?indoorcull=0. Console: shigoto.indoor().
  function installIndoorCull(r) {
    if (/[?&]indoorcull=0\b/.test(location.search) || store("konto.indoorcull") === "0" || typeof THREE !== "object") return;
    const I = K.indoor = { on: true, skipped: 0, rootHidden: 0, rootLow: null };
    const floorY = () => (typeof interior === "object" && interior && interior.floorY) || 400;
    const mainScene = () => (typeof scene !== "undefined" ? scene : null);
    // inside a room (or the title's concourse) and the camera up at room height: a mountain road at 380 m is not a room
    const indoors = () => (typeof interior === "object" && interior && interior.active) || !!(window.seamless && seamless.inside);
    const up = cam => { if (!cam || !cam.isPerspectiveCamera || !indoors()) return false; const y = cam.matrixWorld.elements[13]; return y > floorY() - 40 && y < floorY() + 60; };
    const setTop = new WeakMap();
    // the top of an instanced set (its own bounds are one instance's): cached by the instance buffer's version
    function setTopY(obj, geo) {
      const im = obj.instanceMatrix, c = setTop.get(obj);
      if (c && c.v === im.version && c.n === obj.count) return c.y;
      const a = im.array, rad = geo.boundingSphere ? geo.boundingSphere.radius + Math.abs(geo.boundingSphere.center.y) : 1;
      let top = -1e9;
      for (let i = 0, n = Math.min(obj.count, a.length / 16); i < n; i++) {
        const o = i * 16, s = Math.max(Math.hypot(a[o], a[o + 1], a[o + 2]), Math.hypot(a[o + 4], a[o + 5], a[o + 6]), Math.hypot(a[o + 8], a[o + 9], a[o + 10]));
        const y = a[o + 13] + rad * s; if (y > top) top = y;
      }
      const e = obj.matrixWorld.elements, y = top + e[13] + 2;
      setTop.set(obj, { v: im.version, n: obj.count, y });
      return y;
    }
    const box = new THREE.Box3();
    // the highest point of a mesh's box (spheres round a terrain tile are ~900 m: far too loose for "is it below the rooms")
    function topY(obj, geo) {
      if (obj.isInstancedMesh) { if (!geo.boundingSphere) geo.computeBoundingSphere(); return geo.boundingSphere ? setTopY(obj, geo) : 1e9; }
      if (obj.isSkinnedMesh) return obj.matrixWorld.elements[13] + 3;     // a person: bones move the skin a metre or two at most
      if (!geo.boundingBox) geo.computeBoundingBox();
      if (!geo.boundingBox || geo.boundingBox.isEmpty()) return 1e9;
      return box.copy(geo.boundingBox).applyMatrix4(obj.matrixWorld).max.y;
    }
    const low = (obj, geo, cut) => topY(obj, geo) < cut;
    const prev = r.renderBufferDirect;
    r.renderBufferDirect = function (cam, sc, geo, mat, obj, grp) {
      if (I.on && obj && geo && sc === mainScene() && up(cam) && (obj.isMesh || obj.isPoints || obj.isLine) && low(obj, geo, floorY() - 30)) { I.skipped++; return; }
      return prev.call(this, cam, sc, geo, mat, obj, grp);
    };
    // the world root holds only street things (the rooms are added to the scene itself): skip walking it at all while indoors, unless
    // the room on show turns out to be inside it
    function rootIsLow() {
      const W = typeof worldRoot !== "undefined" ? worldRoot : null; if (!W) return false;
      const R = (typeof interior === "object" && interior && interior.active && interior.room) || (window.seamless && seamless.title && seamless.title.on && seamless.title.room) || null;
      let o = R && R.group; while (o) { if (o === W) return (I.rootLow = false); o = o.parent; }
      return (I.rootLow = true);
    }
    const render = r.render;
    r.render = function (sc, cam) {
      const W = typeof worldRoot !== "undefined" ? worldRoot : null;
      if (I.on && W && W.visible && sc === mainScene() && cam && (cam.updateMatrixWorld(), up(cam)) && rootIsLow()) {
        W.visible = false; I.rootHidden++;
        try { return render.apply(this, arguments); } finally { W.visible = true; }
      }
      return render.apply(this, arguments);
    };
    (window.shigoto || (window.shigoto = {})).indoor = () => ({ on: I.on, skipped: I.skipped, rootHidden: I.rootHidden, rootLow: I.rootLow });
  }
  function cullTier() {
    if (!K.cull) return;
    const t = typeof gfx === "object" && gfx ? gfx.tier : "medium";
    K.cull.k = ({ low: 0.0032, medium: 0.0022, high: 0.0014, ultra: 0.0009 })[t] || 0.0022;
    if (typeof gfx === "object" && gfx && gfx.cinematic) K.cull.k *= 0.5;
  }

  // ---- the parts of a frame that get timed (by name, so a hitch can say which) ---------------------------------------------------------
  const TIMED = ["updateTraffic", "pedsTick", "updateRail", "updateHud", "storyTick", "streamFrame", "detailTick", "updateWalk", "updateDrive",
    "updateTreeLod", "updateWorldSky", "followSun", "carFxTick", "interiorTick", "updateDispatch", "updateWanted", "updateChase", "updateParking",
    "updateBoats", "updateWater", "updateFlight", "updateChute", "updateRide", "updatePlaza", "updateMall", "updateDoorways", "updateTV",
    "updateCollapse", "updateAirports", "destFrame", "updateHelis", "gunFrame", "vegUpdate", "fxRender", "renderPost", "present", "cutTick",
    "updateTitle", "pollPad", "updatePhone", "updateVitals", "updateKnockdown", "updatePedestrianSafety", "detailMake", "impostorLightTick"];
  function installWraps() {
    wrapsDone = true;
    let n = 0;
    for (const name of TIMED) if (P.profiler.wrap(window, name)) n++;
    if (SHIGOTO.Engine && SHIGOTO.Engine.prototype) P.profiler.wrap(SHIGOTO.Engine.prototype, "update", "shigoto engine");
    if (typeof THREE === "object" && THREE.WebGLRenderer) {
      // render() covers shadow maps, shader compiles and uploads; wrapped per instance so the warm-up's off-screen draws count too
      const r = R(); if (r) P.profiler.wrap(r, "render", "gpu submit");
    }
    console.log("[Konto] performance engine timing " + n + " parts of the frame");
  }

  // ---- hitches into the error engine --------------------------------------------------------------------------------------------------
  const big = [];              // severe hitches (50 ms+) in play, newest last
  let lastLog = 0, prf1At = 0, prf2Done = false;
  P.onHitch = h => {
    if (h.ms < 50) return;
    big.push(h); if (big.length > 60) big.shift();
    const t = performance.now();
    if (t - lastLog > 1000) { lastLog = t; console.log("[perf] hitch " + h.ms + " ms: " + h.cause + (h.top ? " (" + h.top + " " + h.topMs + " ms" + (h.top2 ? ", " + h.top2 + " " + h.top2Ms + " ms" : "") + ")" : "") + (h.programs ? ", " + h.programs + " new shader(s)" : "") + (h.gcMb ? ", heap -" + h.gcMb + " MB" : "")); }
  };
  function watch() {
    const t = performance.now();
    if (t - (watch.at || 0) < 2000 || !window.KONTO_ERRORS) return;
    watch.at = t;
    const recent = big.filter(h => t - h.at < 60000);
    if (recent.length >= 6 && t - prf1At > 120000) {
      prf1At = t;
      const by = {}; for (const h of recent) by[h.cause] = (by[h.cause] || 0) + 1;
      const main = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
      const worst = recent.reduce((a, b) => (b.ms > a.ms ? b : a));
      KONTO_ERRORS.report("SM-PRF-001", { key: main, message: recent.length + " frames over 50 ms in the last minute; mostly " + main + " (" + Object.keys(by).map(k => k + " " + by[k]).join(", ") + "); worst " + worst.ms + " ms" + (worst.top ? " in " + worst.top : ""),
        detail: JSON.stringify(P.report(), null, 1).slice(0, 6000) });
    }
    const st = P.lastStats;
    if (!prf2Done && G.enabled && P.playing && G.lowFor > 20 && st) {
      prf2Done = true;
      KONTO_ERRORS.report("SM-PRF-002", { key: P.hw ? P.hw.cls : "?", message: "90% of frames under " + (1000 / st.p90).toFixed(1000 / st.p90 < 10 ? 1 : 0) + " fps for 20 s (target " + Math.round(1000 / P.pacer.period()) + "), bottleneck " + G.bound + ", resolution x" + G.scale.toFixed(2) + ", levers: " + (G.engaged.join(", ") || "none"),
        detail: JSON.stringify(P.report(), null, 1).slice(0, 6000) });
    }
  }

  function overlayText() {
    const p = P.pacer, st = P.lastStats || { p90: 0, cpu90: 0 }, last = P.profiler.hitches[P.profiler.hitches.length - 1];
    let s = "pace " + Math.round(p.refresh) + " Hz" + (p.swap > 1 ? " /" + p.swap : "") + " -> " + Math.round(1000 / p.period()) + " fps   p90 " + st.p90.toFixed(1) + " ms  cpu " + st.cpu90.toFixed(1) + " ms" + (G.bound !== "-" ? "  " + G.bound + "-bound" : "");
    s += "\nbudget x" + P.budgets.factor.toFixed(2) + (G.engaged.length ? "  levers: " + G.engaged.join(", ") : "") + (G.enabled ? "" : "  (governor off)");
    if (last) s += "\nlast hitch " + last.ms + " ms " + last.cause + (last.top ? " (" + last.top + " " + last.topMs + ")" : "") + "  total " + P.profiler.hitches.length;
    return s;
  }

  // ---- console ----------------------------------------------------------------------------------------------------------------------
  const S = window.shigoto || (window.shigoto = {});
  S.perf = () => { const r = P.report(); console.log(r); return r; };
  S.perfCap = v => { P.pacer.cap = v === undefined ? "auto" : v; P.pacer.vsN = Math.min(P.pacer.vsN, 19); try { localStorage.setItem("konto.fpsCap", String(P.pacer.cap)); } catch (e) { /* none */ } return P.pacer.cap; };
})();
