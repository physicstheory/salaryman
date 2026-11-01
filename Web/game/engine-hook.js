// The game's side of the bridge to the Shigoto engine (engine/shigoto.js).
//
// konto.html builds Tōkonto procedurally and draws it itself; this file starts the engine on the same renderer,
// scene and camera, and hands it what it needs:
//   - weather: rain, wet streets and puddles, lightning and thunder over the game's own sky (F4 cycles it,
//     and it changes on its own every few minutes)
//   - physics: the game's building solids and ground around Seiko become Rapier colliders, Seiko and the car he
//     drives become kinematic bodies, and loose props (cones, bins, crates) can be knocked about
//   - streaming: any authored level placed in the world (levels/...) streams in around him
// It loads after konto.html's own script and wraps tick() so the engine steps once per game frame. If the
// engine fails to start, the game carries on exactly as before.

(function () {
  if (!window.SHIGOTO) { console.warn("[Shigoto] engine not loaded; the game runs without it"); return; }
  const S = window.shigoto = { engine: null, bridge: null, scene: null, starting: false, failed: false };
  const STATES = ["clear", "cloudy", "drizzle", "rain", "storm", "fog"];
  const _focus = new THREE.Vector3();

  async function start() {
    S.starting = true;
    try {
      if (S.engine) { S.engine.dispose(); S.engine = null; }
      const engine = await SHIGOTO.createEngine({ THREE, renderer, scene, camera, options: { ownsSky: false, water: false } });
      const bridge = new SHIGOTO.HostBridge(engine, { tile: 60, radius: 120, maxProps: 60 });
      engine.systems.push(bridge);
      bridge.solids(solids);
      if (world && world.surfaceY) bridge.ground((x, z) => world.surfaceY(x, z, 999));
      // Seiko on foot, and whatever he is driving
      bridge.proxy("seiko", "capsule", [0.32, 1.75], () => (player.placed && player.mode === "walk" && !drive.car) ? { x: player.pos.x, y: player.pos.y + 0.9, z: player.pos.z, yaw: player.yaw } : null);
      bridge.proxy("car", "box", [1.8, 1.4, 4.4], () => {
        const c = drive.car; if (!c) return null;
        return { x: c.pos.x, y: c.pos.y + 0.75, z: c.pos.z, yaw: c.yaw };
      });
      engine.weather.groundAt = (x, z) => (player.placed ? player.pos.y : world.surfaceY(x, z, 999)) + 0.02;
      // the game's post chain (fx) draws the scene into a linear HDR target and tone maps at the end
      engine.weather.linearOut = () => typeof FX_LIN !== "undefined" && FX_LIN.on.value === 1;
      engine.weather.auto = true;
      engine.weather.set(savedWeather() || "clear", true);
      engine.surfaces.autoAdopt(scene, 2);
      engine.events.on("weather", w => { try { localStorage.setItem("shigoto.weather", w); } catch (e) { /* private mode */ } });
      engine.events.on("lightning", () => { try { say && engine.weather.state === "storm" && Math.random() < 0.15 && say("Thunder rolls over Tōkonto.", 3); } catch (e) { /* none */ } });
      S.engine = engine; S.bridge = bridge; S.scene = scene;
      console.log("[Shigoto] engine " + SHIGOTO.VERSION + " running under the game");
    } catch (e) {
      S.failed = true;
      console.warn("[Shigoto] the engine did not start; the game runs without it", e);
    }
    S.starting = false;
  }
  function savedWeather() { try { return localStorage.getItem("shigoto.weather"); } catch (e) { return null; } }

  // The game's sun and sky lights, dimmed by cloud. The game sets them itself (often every frame), so remember what it
  // last wrote and scale that, rather than scaling our own previous result.
  const lightBase = new WeakMap();
  function dimLights(cloud, flash) {
    const k = 1 - cloud * 0.62;
    scene.traverse(o => {
      if (!(o.isDirectionalLight || o.isHemisphereLight)) return;
      let b = lightBase.get(o);
      if (!b || Math.abs(o.intensity - b.wrote) > 1e-6) { b = { base: o.intensity, wrote: 0 }; lightBase.set(o, b); }
      b.wrote = o.intensity = b.base * (o.isDirectionalLight ? k : 1 - cloud * 0.3) + flash * (o.isHemisphereLight ? 1.5 : 0);
    });
    if (scene.fog && scene.fog.isFog) {
      let b = lightBase.get(scene.fog);
      if (!b || Math.abs(scene.fog.far - b.wrote) > 1e-3) { b = { base: scene.fog.far, wrote: 0 }; lightBase.set(scene.fog, b); }
      b.wrote = scene.fog.far = b.base / (1 + S.engine.weather.cur.fog * 400);
    } else if (scene.fog && scene.fog.isFogExp2) {
      let b = lightBase.get(scene.fog);
      if (!b || Math.abs(scene.fog.density - b.wrote) > 1e-7) { b = { base: scene.fog.density, wrote: 0 }; lightBase.set(scene.fog, b); }
      b.wrote = scene.fog.density = b.base + S.engine.weather.cur.fog;
    }
  }

  const gameTick = window.tick;
  window.tick = function (dt) {
    gameTick(dt);
    if (typeof scene === "undefined" || !scene || !world || S.failed) return;
    if (scene !== S.scene && !S.starting) { start(); return; }
    const e = S.engine;
    if (!e || title.on) return;
    if (drive.car) _focus.copy(drive.car.pos); else if (player.placed) _focus.copy(player.pos); else _focus.copy(camera.position);
    // indoors (the shop rooms sit far outside the island): no rain in the room
    const inside = typeof interior !== "undefined" && interior.active;
    e.weather.rain.visible = e.weather.rain.visible && !inside;
    e.update(paused ? 0 : dt, _focus);
    if (inside) { e.weather.rain.visible = false; e.weather.splash.visible = false; }
    dimLights(e.weather.cur.cloud, e.env.flash);
  };

  addEventListener("keydown", ev => {
    if (ev.code !== "F4" || !S.engine) return;
    const w = S.engine.weather, next = STATES[(STATES.indexOf(w.state) + 1) % STATES.length];
    w.set(next);
    try { say("Weather: " + next, 2.5); } catch (e) { /* none */ }
    ev.preventDefault();
  });

  // for the console and cheats: shigoto.weather("storm"), shigoto.cones(), shigoto.shove()
  S.weather = (w, now) => S.engine && S.engine.weather.set(w, now);
  S.cones = (type, n) => { if (!S.bridge) return; const a = drive.car ? drive.car.pos : player.pos, yaw = drive.car ? drive.car.yaw : player.yaw;
    return S.bridge.scatter(type || "cone", a.x + Math.sin(yaw) * 9, a.z + Math.cos(yaw) * 9, n || 10, 5); };
  S.shove = () => { if (!S.engine) return; const a = drive.car ? drive.car.pos : player.pos; S.engine.physics.blast([a.x, a.y, a.z], 12, 8); };
})();
