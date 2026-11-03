// The game's side of the Shigoto persistence engine (SHIGOTO.Persistence, Engine/src/persist).
//
// generate() in konto.html lays the world out and builds its meshes, then calls persistLoad() before the loading
// screen lifts. This file registers what the load does and what it checks:
//
//   build    the engine and its physics for every building in the world, the authored levels, every tree tile in the
//            country, the grass and the close-up detail of the buildings round every place the story goes (as much
//            as the machine's memory budget allows), one room of each kind of shop, and the whole cast of people
//   check    scene integrity (broken geometry, textures that never arrived), shader programs, physics coverage and
//            the ground under Seiko, the story's places, the cast and their PBR maps, the art, the weather, memory
//   warm     every shader compiled and every mesh and texture uploaded to the graphics card before the first frame
//   keep     from then on nothing built is thrown away when you walk off: far things are hidden and shown again
//
// ?persist=0 in the address (or localStorage konto.persist = "0") turns it off and the game streams as it used to.
// Console: shigoto.persist() prints the last report.

(function () {
  if (!window.SHIGOTO || !SHIGOTO.Persistence) { console.warn("[Konto] persistence engine not in this build; streaming as before"); return; }
  const off = /[?&]persist=0\b/.test(location.search) || (() => { try { return localStorage.getItem("konto.persist") === "0"; } catch (e) { return false; } })();
  if (off) { console.log("[Konto] persistence turned off; streaming as before"); return; }
  // on the second step of the safe-graphics ladder (after graphics driver resets) nothing is kept resident: the world streams as it used to
  if (window.GFX_SAFE && GFX_SAFE.level >= 2) { console.log("[Konto] safe graphics " + GFX_SAFE.level + ": persistence off, streaming as before"); return; }

  const wait = ms => new Promise(r => setTimeout(r, ms));
  let last = null;

  // The places the story sends Seiko, nearest-first targets for the buildings' close-up detail and the grass.
  function anchors() {
    const a = [];
    try { const s = seikoSpawn(world); a.push([s.x, s.z]); } catch (e) { /* no home */ }
    try { const s = stationShop(); if (s && s.door) a.push([s.door[0], s.door[1]]); } catch (e) { /* no station */ }
    try { if (title && title.resume) a.push([title.resume.x, title.resume.z]); } catch (e) { /* no save */ }
    try { for (const c of world.cities) if (c.centre) a.push([c.centre[0], c.centre[1]]); } catch (e) { /* none */ }
    return a.length ? a : [[WORLD_X / 2, WORLD_Z / 2]];
  }
  const nearest = (A, x, z) => { let d = Infinity; for (const p of A) d = Math.min(d, Math.hypot(p[0] - x, p[1] - z)); return d; };

  // Put back what an earlier load kept (a new world from the seed box replaces the whole scene).
  function release() {
    if (PERSIST.detail) for (const [b, e] of PERSIST.detail.map) { if (DETAIL.active.get(b) === e.obj) DETAIL.active.delete(b); if (e.obj.parent) e.obj.parent.remove(e.obj); e.obj.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    PERSIST.keep = false; PERSIST.detail = PERSIST.trees = PERSIST.grass = null;
  }

  // ---- the graphics card, warmed in small fenced batches (SHIGOTO.warmGPUChunked) -------------------------------------------
  // Drawn exactly the way play draws the scene (the AAA chain's linear half-float pass, the older post chain, or straight to the screen),
  // so the programs compiled here are the ones play uses. A driver that resets in the middle is waited for and the warm carries on with
  // smaller batches; a machine that came back from a reset (gfx.lean) starts small.
  function warmRender(proxy, cam) {
    const T = THREE;
    const fxOn = typeof fxUsable === "function" && fxUsable();
    const rt = warmRender.rt || (warmRender.rt = new T.WebGLRenderTarget(16, 16, fxOn ? { type: T.HalfFloatType } : {}));
    rt.texture.encoding = fxOn || (typeof postUsable === "function" && postUsable()) ? T.LinearEncoding : renderer.outputEncoding;
    const was = renderer.getRenderTarget(), tm = renderer.toneMapping;
    try {
      if (fxOn) { renderer.toneMapping = T.NoToneMapping; if (typeof FX_LIN !== "undefined") FX_LIN.on.value = 1; }
      renderer.setRenderTarget(rt); renderer.render(proxy, cam);
    } finally {
      renderer.toneMapping = tm; if (fxOn && typeof FX_LIN !== "undefined") FX_LIN.on.value = 0;
      renderer.setRenderTarget(was);
    }
  }
  const waitRestore = ms => new Promise(res => {
    const c = renderer.domElement; let t = 0;
    const done = ok => { clearTimeout(t); c.removeEventListener("webglcontextrestored", on); res(ok); };
    const on = () => done(true);
    c.addEventListener("webglcontextrestored", on); t = setTimeout(() => done(!renderer.getContext().isContextLost()), ms);
  });
  let warming = null, bgStop = false, bgRunning = false, bgResume = null;
  window.gpuWarm = async function (opts) {
    opts = opts || {};
    if (!window.SHIGOTO || !SHIGOTO.warmGPUChunked || typeof renderer === "undefined" || !renderer) return { skipped: true };
    if (!opts.background && bgRunning) bgStop = true;   // a warm someone is waiting for goes ahead of the background upload
    while (warming) await warming;
    if (opts.background) { bgStop = false; bgRunning = true; }
    let fin;
    warming = new Promise(r => { fin = r; });
    try {
      const lean = typeof gfx !== "undefined" && (gfx.lean || gfx.tier === "low");
      let limits = Object.assign(lean ? { programs: 3, texBytes: 24e6, tris: 150e3, items: 250 } : {}, window.GFX_SAFE && GFX_SAFE.level ? { programs: 2, texBytes: 12e6, tris: 80e3, items: 120, targetMs: 60, maxMs: 200 } : {}, opts.limits || {});
      let r = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        // the scene, and the people's templates the street and the cutscenes clone from (they live outside it)
        const roots = opts.roots || [scene].concat(typeof pplLib !== "undefined" ? pplLib.ready.map(e => e.root).filter(o => o && !o.parent) : []);
        // video memory for textures, by tier (halved after a driver reset); the nearest things to where the story starts go first
        const VRAM = { low: 450e6, medium: 800e6, high: 1300e6, ultra: 2000e6 };
        const safe = window.GFX_SAFE ? GFX_SAFE.level : 0;
        const texBudget = opts.texBudget || (safe ? 160e6 : (VRAM[gfx.tier] || VRAM.medium) * (gfx.lean ? 0.5 : 1));
        const A = [[camera.position.x, camera.position.z]].concat(anchors()), _w = new THREE.Vector3();   // what the camera sees first (the title's view of the capital)
        const priority = o => { if (!o.parent || o.parent === scene && !o.geometry) return 0; o.getWorldPosition(_w); if (_w.y > 300) return 1; /* the shop rooms, the concourse, the office: small, and the story needs them early */ return Math.min(5000, nearest(A, _w.x, _w.z)) / 200 | 0; };
        r = await SHIGOTO.warmGPUChunked(renderer, scene, camera, { THREE, render: warmRender, roots, progress: opts.progress, limits, texBudget, priority, between: opts.between || null,
          shouldStop: opts.background ? () => bgStop || (typeof gfx !== "undefined" && gfx.lost) : null });
        if (!r.lost) break;
        console.warn("[Konto] the graphics driver reset while warming up; waiting for it to come back");
        const back = await waitRestore(5500);
        if (!back) break;
        // a restored context has nothing on it: everything is warmed again, in batches half the size
        SHIGOTO.forgetWarm();
        limits = { programs: Math.max(1, (limits.programs || 6) >> 1), texBytes: (limits.texBytes || 64e6) / 2, tris: (limits.tris || 400e3) / 2, items: Math.max(20, (limits.items || 600) >> 1) };
      }
      return r;
    } finally { if (warmRender.rt) { warmRender.rt.dispose(); warmRender.rt = null; } warming = null; if (opts.background) bgRunning = false; fin();
      // the background upload picks up again after whatever interrupted it
      if (!opts.background && bgResume && !(typeof gfx !== "undefined" && gfx.lost)) setTimeout(bgResume, 1000); }
  };
  // After a driver reset in play, the game's own handler brings the picture back; everything is then warmed again behind it, in
  // small batches, instead of being uploaded all at once by the first frame (which is what reset the driver a second time).
  function hookRestore() {
    if (typeof renderer === "undefined" || !renderer || hookRestore.done) return; hookRestore.done = true;
    renderer.domElement.addEventListener("webglcontextrestored", () => {
      if (!PERSIST.engine || !PERSIST.engine.done) return;   // during the load, the warm stage handles it
      setTimeout(() => { try { SHIGOTO.forgetWarm(); window.gpuWarm({ limits: { programs: 2, texBytes: 16e6, tris: 100e3, items: 150 } }).then(r => console.log("[Konto] re-warmed after the driver reset", r)); } catch (e) { /* plain */ } }, 50);
    });
  }

  window.persistLoad = async function (seed, onProgress) {
    release();
    hookRestore();
    const P = new SHIGOTO.Persistence({ tier: gfx.tier });
    PERSIST.engine = P;
    // the budget is shared out: most of it to buildings' detail, then grass, then trees (which are cheap)
    const detail = PERSIST.detail = P.residentSet("buildings", 0.62);
    const trees = PERSIST.trees = P.residentSet("trees", 0.10);
    const grass = PERSIST.grass = P.residentSet("grass", 0.14);
    detail.onEvict = (b, g) => { if (g.parent) g.parent.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); };
    const vegEvict = map => (key, obj) => { if (!obj) return; trunkDrop(obj); if (obj.parent) obj.parent.remove(obj); obj.traverse(o => { if (o.dispose) o.dispose(); }); map.delete(key); };
    trees.onEvict = vegEvict(veg.trees);
    grass.onEvict = vegEvict(veg.grass);
    PERSIST.keep = true;
    const A = anchors();
    const facts = {};

    // ---- build ------------------------------------------------------------------------------------------------
    P.stage("engine", 1, async () => {
      const e = window.shigoto && shigoto.start ? await shigoto.start() : null;
      return { running: !!e };
    }, { label: "Starting the engine" });

    P.stage("holidays", 1.5, async ctx => {
      // the holiday islands (Seoul, the Kohana Islands, Ryūjima) used to be built the moment you first landed, with no physics, no people
      // and nothing on the map until then. Now they are built here with everything else, so the physics, weather, rain, water, map,
      // people and the honor and respect systems all have them from the first frame, and they are kept like the rest of the world
      if (typeof DEST === "undefined" || !DEST.sites.length || typeof destEnsure !== "function") return { skipped: "no holiday islands" };
      const out = {};
      for (let i = 0; i < DEST.sites.length; i++) {
        const s = DEST.sites[i];
        const t0 = performance.now();
        try { destEnsure(s.id); } catch (e) { out[s.id] = "failed: " + e.message; }
        if (!out[s.id]) out[s.id] = { solids: s.solids.length, walks: (s.pedRoads || []).length, ms: Math.round(performance.now() - t0) };
        if (s.group) s.group.visible = !!DEST.active && DEST.active === s;
        ctx.progress((i + 1) / DEST.sites.length);
        await ctx.breathe();
      }
      facts.holidays = out;
      return out;
    }, { label: "Building the holiday islands" });

    P.stage("physics", 3, async ctx => {
      const b = window.shigoto && shigoto.bridge;
      if (!b) return { skipped: "no engine" };
      const r = await b.prebuildAll(ctx, A.slice(0, 3), 360);
      // the holiday islands' ground as well: they are small, and you arrive on them by a cut, not by walking up to them
      if (typeof DEST !== "undefined") { r.holidayGround = 0; for (const s of DEST.sites) if (s.built) r.holidayGround += b.prebuildArea(s.cx - s.hx, s.cz - s.hz, s.cx + s.hx, s.cz + s.hz); }
      return r;
    }, { label: "Building the physics" });

    P.stage("levels", 1, async ctx => {
      const e = window.shigoto && shigoto.engine;
      if (!e || !e.streamer) return { skipped: "no streamer" };
      return e.streamer.preloadAll(ctx);
    }, { label: "Loading districts" });

    P.stage("trees", 3, async ctx => {
      if (!veg.group || !veg.mats) return { skipped: "no countryside" };
      const nx = Math.ceil(WORLD_X / VEG_TILE), nz = Math.ceil(WORLD_Z / VEG_TILE);
      let n = 0, built = 0;
      veg.trees.forEach((obj, key) => { if (obj && !trees.has(key)) { const [gx, gz] = key.split(",").map(Number); trees.add(key, obj, (gx + 0.5) * VEG_TILE, (gz + 0.5) * VEG_TILE); } });
      for (let gz = 0; gz <= nz; gz++) for (let gx = 0; gx <= nx; gx++) {
        const key = gx + "," + gz;
        if (!veg.trees.has(key)) {
          const obj = vegTreeTile(gx, gz);
          veg.trees.set(key, obj || null);
          if (obj) { obj.visible = false; veg.group.add(obj); trees.add(key, obj, (gx + 0.5) * VEG_TILE, (gz + 0.5) * VEG_TILE); built++; }
        }
        n++;
        ctx.progress(n / ((nx + 1) * (nz + 1)));
        await ctx.slice();
        if (trees.bytes > trees.budget * 0.9) return { tiles: built, stopped: "memory budget" };
      }
      return { tiles: built };
    }, { label: "Planting the countryside" });

    P.stage("grass", 1, async ctx => {
      if (!veg.group || !veg.mats || !(vegRadius().grass > 0)) return { skipped: "no grass on this setting" };
      const R = vegRadius().grass * 1.6, want = [];
      for (const p of A.slice(0, 3)) {
        for (let gz = Math.floor((p[1] - R) / GRASS_TILE); gz <= Math.floor((p[1] + R) / GRASS_TILE); gz++)
          for (let gx = Math.floor((p[0] - R) / GRASS_TILE); gx <= Math.floor((p[0] + R) / GRASS_TILE); gx++) {
            if (gx < 0 || gz < 0 || gx * GRASS_TILE > WORLD_X || gz * GRASS_TILE > WORLD_Z) continue;
            if (Math.hypot((gx + 0.5) * GRASS_TILE - p[0], (gz + 0.5) * GRASS_TILE - p[1]) <= R) want.push(gx + "," + gz);
          }
      }
      veg.grass.forEach((obj, key) => { if (obj && !grass.has(key)) { const [gx, gz] = key.split(",").map(Number); grass.add(key, obj, (gx + 0.5) * GRASS_TILE, (gz + 0.5) * GRASS_TILE); } });
      const keys = [...new Set(want)];
      let built = 0;
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (!veg.grass.has(key)) {
          const [gx, gz] = key.split(",").map(Number), obj = vegGrassTile(gx, gz);
          veg.grass.set(key, obj || null);
          if (obj) { obj.visible = false; veg.group.add(obj); grass.add(key, obj, (gx + 0.5) * GRASS_TILE, (gz + 0.5) * GRASS_TILE); built++; }
        }
        ctx.progress((i + 1) / keys.length);
        await ctx.slice();
        if (grass.bytes > grass.budget * 0.8) return { tiles: built, stopped: "memory budget" };
      }
      return { tiles: built };
    }, { label: "Growing the grass" });

    P.stage("buildings", 6, async ctx => {
      // every building with close-up detail, nearest to the story's places first, until three quarters of their budget is used:
      // the rest of the budget keeps whatever you build by travelling (and nothing you have seen is thrown away)
      const all = [];
      DETAIL.cells.forEach(c => { for (const b of c) all.push(b); });
      const ranked = all.map(b => [nearest(A, b.c[0], b.c[1]), b]).sort((p, q) => p[0] - q[0]);
      facts.buildings = all.length;
      DETAIL.active.forEach((g, b) => { if (!detail.has(b)) detail.add(b, g, b.c[0], b.c[1]); });   // what was built before the load is kept too
      let built = 0;
      for (let i = 0; i < ranked.length; i++) {
        const b = ranked[i][1];
        if (!detail.has(b)) {
          const g = detailMake(b);
          if (!DETAIL.active.has(b)) g.visible = false;
          built++;
        }
        if ((i & 15) === 0) ctx.progress(Math.min(1, detail.bytes / (detail.budget * 0.75)));
        await ctx.slice();
        if (detail.bytes > detail.budget * 0.75) break;
      }
      facts.detailBuilt = detail.size;
      return { built, of: all.length, mb: +(detail.bytes / 1e6).toFixed(0) };
    }, { label: "Raising the buildings" });

    P.stage("interiors", 2, async ctx => {
      // one room of each kind of shop, built now rather than at its door (interiorPrewarm did this slowly during play)
      if (typeof interiorRoom !== "function") return { skipped: "no interiors" };
      interiorPrewarm.started = true;
      const seen = {}, list = [];
      shops.list.forEach(s => { const key=s.station?"station":s.mall?"mall":s.plaza?"plaza":s.brand;if (interiorSupports(s) && s.brand !== "airport" && !seen[key]) { seen[key] = 1; list.push(s); } });
      let built = 0, failed = [];
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        try { const levels=interiorLevels(s);if(levels){for(let f=0;f<levels.floors.length;f++){const room=levels.make(f);if(room?.group){room.group.visible=false;built++;}await ctx.breathe();}}else { const room = interiorRoom(s); if (room && room.group) { room.group.visible = false; built++; } } }
        catch (e) { failed.push(s.brand); }
        ctx.progress((i + 1) / list.length);
        await ctx.breathe();
      }
      facts.interiors = { built, failed, kinds: list.length };
      return facts.interiors;
    }, { label: "Fitting out the shops" });

    P.stage("cast", 3, async ctx => {
      // the whole cast decoded before play, not one by one as you walk about (capped, so a missing model cannot hold the game)
      let total = 0;
      try { const r = await fetch(pplLib.dir + "index.json"); const ix = r.ok ? await r.json() : null; total = ix && ix.people ? ix.people.length : 0; } catch (e) { /* offline */ }
      if (!pplLib.loading && typeof pplLoad === "function") try { pplLoad(); } catch (e) { /* none */ }
      const t0 = performance.now();
      let lastN = -1, lastChange = t0;
      for (;;) {
        const n = pplLib.ready.length, have = total ? n >= total : n > 0;
        if (n !== lastN) { lastN = n; lastChange = performance.now(); }
        ctx.progress(total ? n / total : 0.5);
        if (have && player.hq && !wardrobe.loading) break;
        if (performance.now() - t0 > 150000 || performance.now() - lastChange > 45000) break;   // stalled: carry on, they keep loading
        await wait(120);
      }
      facts.cast = { ready: pplLib.ready.length, total, seiko: !!player.hq };
      return facts.cast;
    }, { label: "Bringing in the people" });

    P.stage("surfaces", 0.5, async () => {
      // every material gets its wet-weather patch now, so rain never recompiles a shader in play
      const e = window.shigoto && shigoto.engine;
      if (!e) return { skipped: "no engine" };
      return { adopted: e.surfaces.adoptTree(scene, 0) };
    }, { label: "Preparing the weather" });

    P.stage("rain", 0.4, async () => {
      // the rain engine: first occlusion map around Seiko (what is overhead, so rain stops under cover) and every rain
      // shader compiled, so the first shower in play does not stutter
      const e = window.shigoto && shigoto.engine;
      if (!e || !e.weather || !e.weather.rainEngine) return { skipped: "no engine" };
      const RE = e.weather.rainEngine;
      try { if (typeof gfx !== "undefined" && gfx.tier) RE.setQuality(gfx.tier); } catch (err) { /* default */ }
      facts.rain = RE.prepare(camera.position);
      return facts.rain;
    }, { label: "Preparing the rain" });

    // ---- check ------------------------------------------------------------------------------------------------
    P.check("scene", "geometry and textures intact", () => {
      const r = SHIGOTO.scanScene(scene);
      facts.scan = { meshes: r.meshes, tris: Math.round(r.tris) };
      const bad = [];
      if (r.nan.length) bad.push(r.nan.length + " meshes with broken geometry hidden (" + r.nan.slice(0, 3).join(", ") + ")");
      if (r.badTex.length) bad.push(r.badTex.length + " textures that never loaded removed (" + r.badTex.slice(0, 3).join(", ") + ")");
      return bad.length ? { ok: true, repaired: true, detail: bad.join("; ") } : { ok: true, detail: r.meshes + " meshes" };
    });
    P.check("shaders", "every program compiled and linked", () => {
      const bad = SHIGOTO.shaderFailures(renderer);
      return bad.length ? "failed to link: " + bad.slice(0, 4).join(", ") : { ok: true, detail: (renderer.info.programs || []).length + " programs" };
    });
    P.check("gpu", "world uploaded to the graphics card", () => {
      const g = facts.gpu;
      if (!g) return { ok: true, detail: "skipped" };
      if (g.error) return "warm-up failed: " + g.error;
      if (g.lost) return "the graphics driver reset during the warm-up (" + g.objects + " of " + g.items + " meshes warmed); the rest warm in play";
      return { ok: true, detail: g.objects + " meshes in " + g.batches + " batches (" + (g.skipped || 0) + " left to upload when first seen, over the video memory budget), " + g.programs + " programs, " + g.texMb + " MB of textures, slowest batch " + g.slowest + " ms, " + g.ms + " ms" };
    });
    P.check("physics", "every building has a collider", () => {
      const b = window.shigoto && shigoto.bridge;
      if (!b) return window.shigoto && shigoto.failed ? "the engine did not start" : { ok: true, detail: "no engine in this build" };
      const c = b.coverage();
      return c.covered === c.solids ? { ok: true, detail: c.solids + " solids" } : (c.solids - c.covered) + " of " + c.solids + " solids have no collider";
    });
    P.check("physics", "ground under Seiko's start", () => {
      const e = window.shigoto && shigoto.engine;
      if (!e || !e.physics || !e.physics.ready) return { ok: true, detail: "no physics" };
      const s = seikoSpawn(world), hit = e.physics.raycast([s.x, s.y + 60, s.z], [0, -1, 0], 200);
      if (!hit) return "no collider under the spawn point";
      return Math.abs(hit.point[1] - s.y) < 4 ? { ok: true } : "ground collider " + (hit.point[1] - s.y).toFixed(1) + " m off the visible ground";
    });
    P.check("world", "Seiko starts on open ground", () => {
      const s = seikoSpawn(world);
      if (!isFinite(s.x + s.y + s.z)) return "spawn is not a number";
      if (typeof insideBuilding === "function" && insideBuilding(s.x, s.z, 0.2)) return "spawn is inside a building";
      return world.sampleHeight(s.x, s.z) > 0.2 ? true : "spawn is in the sea";
    });
    P.check("world", "story places exist", () => {
      const miss = [];
      try { if (!stationShop()) miss.push("Tōkonto Central"); } catch (e) { miss.push("Tōkonto Central (" + e.message + ")"); }
      if (!world.cities || !world.cities.length) miss.push("cities");
      return miss.length ? "missing: " + miss.join(", ") : { ok: true, detail: world.cities.length + " towns" };
    });
    P.check("world", "every streamed chunk has sane bounds", () => {
      let bad = 0;
      for (const e of STREAM.reg) if (!isFinite(e.s.radius) || !isFinite(e.s.center.x + e.s.center.z)) { bad++; e.far = Infinity; }
      return bad ? { ok: true, repaired: true, detail: bad + " chunks had broken bounds and are now always drawn" } : { ok: true, detail: STREAM.reg.length + " chunks" };
    });
    P.check("world", "buildings kept resident", () => {
      const d = PERSIST.detail;
      return { ok: d.size > 0, detail: d.size + " of " + (facts.buildings || 0) + " buildings built in detail (" + Math.round(d.bytes / 1e6) + " MB); the rest are built as you reach them and then kept" };
    });
    P.check("world", "holiday islands built and walkable", () => {
      const h = facts.holidays;
      if (!h) return { ok: true, detail: "skipped" };
      const bad = [], e = window.shigoto && shigoto.engine, ok = [];
      for (const s of DEST.sites) {
        if (typeof h[s.id] === "string") { bad.push(s.id + " " + h[s.id]); continue; }
        if (!s.built || !s.spawn) { bad.push(s.id + " has no arrival point"); continue; }
        if (e && e.physics && e.physics.ready) {
          const y = s.h(s.spawn[0] - s.cx, s.spawn[1] - s.cz), hit = e.physics.raycast([s.spawn[0], y + 60, s.spawn[1]], [0, -1, 0], 200);
          if (!hit) { bad.push(s.id + " has no ground collider at the arrival point"); continue; }
        }
        ok.push(AIR_DESTS[s.id].name + " (" + s.solids.length + " solids, " + (s.pedRoads || []).length + " walks)");
      }
      return bad.length ? bad.join("; ") : { ok: true, detail: ok.join(", ") };
    });
    P.check("world", "shop rooms ready", () => {
      const r = facts.interiors;
      if (!r) return { ok: true, detail: "skipped" };
      return r.failed.length ? "rooms that would not build: " + r.failed.join(", ") : { ok: true, detail: r.built + " rooms" };
    });
    P.check("characters", "cast loaded", () => {
      const c = facts.cast || { ready: pplLib.ready.length, total: 0, seiko: !!player.hq };
      if (!c.seiko) return "Seiko's rigged body did not load (" + c.ready + " people ready)";
      return c.total && c.ready < c.total ? { ok: true, detail: c.ready + " of " + c.total + " people; the rest are still loading" } : { ok: true, detail: c.ready + " people" };
    });
    P.check("characters", "realistic cast with full PBR", () => {
      if (!pplLib.real) return "the realistic cast is not selected (" + pplLib.dir + ")";
      const root = player.glb || player.obj;
      if (!root) return "no Seiko";
      let n = 0, miss = 0;
      root.traverse(o => { if (!o.isMesh) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (!m) continue; n++; if (m.userData.charKind !== "hair" && m.userData.shigotoChar && !(m.map && m.normalMap && m.roughnessMap)) miss++; } });
      return miss ? miss + " of Seiko's " + n + " materials are missing PBR maps" : { ok: true, detail: n + " materials" };
    });
    P.check("art", "generated art arrived", async () => {
      if (!window.SalaryArt || !SalaryArt.ready) return { ok: true, detail: "none in this build" };
      await Promise.race([SalaryArt.ready, wait(20000)]);
      const f = SalaryArt.state && SalaryArt.state.failed || [];
      return f.length ? f.length + " pictures failed: " + f.slice(0, 4).join(", ") : true;
    });
    P.check("weather", "weather running", () => {
      const e = window.shigoto && shigoto.engine;
      if (!e) return { ok: true, detail: "no engine" };
      return SHIGOTO.WEATHER[e.weather.state] ? { ok: true, detail: e.weather.state } : "unknown weather state " + e.weather.state;
    });
    P.check("rain", "rain engine ready", () => {
      const e = window.shigoto && shigoto.engine;
      if (!e || !e.weather || !e.weather.rainEngine) return { ok: true, detail: "no engine" };
      const f = facts.rain;
      if (!f) return { ok: true, detail: "not prepared" };
      if (f.error) return "rain: " + f.error;
      return { ok: true, detail: f.quality + ", " + f.drops + " drops, occlusion " + (f.occlusionSupported ? "on" : "off (rain falls everywhere)") };
    });
    P.check("memory", "within the memory budget", () => {
      const used = P.residentBytes(), m = renderer.info.memory;
      const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) + " MB heap, " : "";
      const detailText = Math.round(used / 1e6) + " MB kept of " + Math.round(P.budget / 1e6) + " MB; " + heap + m.geometries + " geometries, " + m.textures + " textures on the GPU";
      return used <= P.budget ? { ok: true, detail: detailText } : "over budget: " + detailText;
    });

    // stages and checks other parts of the game add (career-commute.js: the SOTI floor and Seiko's flat)
    (window.PERSIST_EXTRA || []).forEach(f => { try { f(P, facts); } catch (e) { console.warn("[Konto] extra persistence stage:", e); } });

    // ---- the last builds, then the graphics card -----------------------------------------------------------------
    // These run after every other part of the game has added its stages (the office, the flat, boats, after-hours venues,
    // parachutes), so the warm-up below covers everything that was built, not just the city.
    P.stage("vehicles", 1, async ctx => {
      // every car, van, bike and police car model in memory before play (they used to pop in a few seconds after the title)
      const jobs = typeof traffic !== "undefined" && traffic.modelJobs ? Object.values(traffic.modelJobs) : [];
      if (!jobs.length) return { skipped: "no model jobs" };
      let done = 0;
      jobs.forEach(j => Promise.resolve(j).then(() => { done++; ctx.progress(done / jobs.length); }, () => { done++; }));
      await Promise.race([Promise.allSettled(jobs), wait(60000)]);
      facts.vehicles = { loaded: done, of: jobs.length };
      return facts.vehicles;
    }, { label: "Fuelling the cars" });

    P.stage("wardrobe", 1, async ctx => {
      // every outfit Seiko can wear, decoded into the wardrobe's cache: trying on a suit (or the village clothes the opening waits for)
      // is then a clone, not a download
      if (typeof wardrobe === "undefined" || !wardrobe.list || !THREE.GLTFLoader) return { skipped: "no wardrobe" };
      const L = wardrobe.list.slice(), dir = pplLib.dir || "people/";
      let done = 0, failed = [];
      const one = o => new Promise(res => {
        const url = dir + o.file, key = url + ":" + gfx.tier;
        if (wardrobe.cache[key]) { res(); return; }
        try {
          new THREE.GLTFLoader(pplLib.anime && typeof animeRawManager === "function" ? animeRawManager() : undefined).load(url,
            g => { try { if (!wardrobe.cache[key]) wardrobe.cache[key] = { scene: cloneSkinned(g.scene), animations: g.animations }; } catch (e) { failed.push(o.id); } res(); },
            undefined, () => { failed.push(o.id); res(); });
        } catch (e) { failed.push(o.id); res(); }
      });
      const t0 = performance.now();
      for (let i = 0; i < L.length; i += 3) {
        await Promise.all(L.slice(i, i + 3).map(one));
        done = Math.min(L.length, i + 3); ctx.progress(done / L.length);
        if (performance.now() - t0 > 90000) break;   // a slow disk: the rest load when tried on, as before
      }
      facts.wardrobe = { cached: Object.keys(wardrobe.cache).length, of: L.length, failed };
      return facts.wardrobe;
    }, { label: "Pressing the suits" });

    P.stage("opening", 0.5, async ctx => {
      // the opening's own set: the three-car local out of Mizuho and its track bed, built now and kept hidden, so pressing New Game
      // does not build and upload a train in the same frame the first shot is drawn
      const out = {};
      try { if (typeof storyTrain === "function") { const t = storyTrain(); const bed = t.userData && t.userData.bed;
        for (const o of [t, bed]) if (o) { o.visible = false; if (!o.parent) scene.add(o); }
        out.train = true; } } catch (e) { out.train = "failed: " + e.message; }
      await ctx.breathe();
      facts.opening = out;
      return out;
    }, { label: "Setting the scene" });

    P.stage("gpu", 4, async ctx => {
      await ctx.breathe();
      const r = await window.gpuWarm({ progress: t => ctx.progress(t * 0.95) });
      // then one whole frame exactly as play draws it (the post chain's own shaders, the full shadow map), still behind the artwork,
      // and wait for the card to finish it: the first frame after the loading screen is then an ordinary one
      if (!r.lost && !(typeof gfx !== "undefined" && gfx.lost)) {
        try { if (typeof present === "function") present(); } catch (e) { r.firstFrame = "failed: " + e.message; }
        await SHIGOTO.gpuSettle(renderer.getContext(), 5000);
        if (!r.firstFrame) r.firstFrame = "drawn";
      }
      ctx.progress(1);
      facts.gpu = r;
      return r;
    }, { label: "Warming up the graphics card" });

    const report = await P.run(onProgress);
    last = report;
    // What the video memory budget left out is uploaded afterwards a little at a time, in the background, instead of all at once by the
    // first frame that happens to look at it (a frame like that, on the title's view over the whole capital, reset the driver).
    bgResume = () => { if (bgRunning || (typeof gfx !== "undefined" && gfx.lost)) return;
      const safe = window.GFX_SAFE ? GFX_SAFE.level : 0;
      // In play every batch waits for the performance engine (perf-hook.js): it runs straight after a frame that had room to spare and no
      // hitch for the last 45 frames, and is small (one new shader at most, 4 MB of texture), so the upload never becomes the stutter.
      const KP = window.KONTO_PERF && KONTO_PERF.on ? KONTO_PERF : null;
      window.gpuWarm({ background: true, texBudget: safe ? 900e6 : Infinity,
        limits: KP ? { programs: 1, texBytes: safe ? 3e6 : 4e6, tris: 30e3, items: 24, targetMs: 6, maxMs: 24 } : { programs: 1, texBytes: safe ? 6e6 : 12e6, tris: 60e3, items: 80, targetMs: 30, maxMs: 120 },
        between: KP ? () => KP.idle({ headroom: 0.35, quiet: 45 }) : null })
        .then(r => { if (r && !r.stopped) { bgResume = null; console.log("[Konto] background upload done:", r.objects, "meshes,", r.texMb, "MB"); } }, () => {});
    };
    setTimeout(() => bgResume && bgResume(), 500);
    // the first frames of play: build the street round Seiko at once (it is mostly showing what is already built)
    DETAIL.rush = 40;
    return report;
  };

  // console: shigoto.persist()
  const S = window.shigoto || (window.shigoto = {});
  S.persist = () => { const P = PERSIST.engine; if (!P) return "persistence not run"; const t = P.summary(); console.log(t); return last; };
})();
