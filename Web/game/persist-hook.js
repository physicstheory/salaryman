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

  window.persistLoad = async function (seed, onProgress) {
    release();
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

    P.stage("physics", 3, async ctx => {
      const b = window.shigoto && shigoto.bridge;
      if (!b) return { skipped: "no engine" };
      return b.prebuildAll(ctx, A.slice(0, 3), 360);
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

    P.stage("gpu", 3, async ctx => {
      await ctx.breathe();
      const r = SHIGOTO.warmGPU(renderer, scene, camera, { THREE });
      facts.gpu = r;
      return r;
    }, { label: "Warming up the graphics card" });

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
    P.check("gpu", "world uploaded to the graphics card", () => facts.gpu && facts.gpu.error ? "warm-up render failed: " + facts.gpu.error : { ok: true, detail: facts.gpu ? facts.gpu.programs + " programs, " + facts.gpu.ms + " ms" : "skipped" });
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

    const report = await P.run(onProgress);
    last = report;
    // the first frames of play: build the street round Seiko at once (it is mostly showing what is already built)
    DETAIL.rush = 40;
    return report;
  };

  // console: shigoto.persist()
  const S = window.shigoto || (window.shigoto = {});
  S.persist = () => { const P = PERSIST.engine; if (!P) return "persistence not run"; const t = P.summary(); console.log(t); return last; };
})();
