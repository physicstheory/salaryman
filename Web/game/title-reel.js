// ---- the title flyovers: in-game recordings in Ultra Max ---------------------------------------------------------------------
// Two halves.
//
// The director: a list of shots across the island's landmarks (sunrise over a mountain, an airliner taking off, the morning rush
// pouring into Tōkonto Central, SOTI Tower at dusk, the rice fields of Mizuho, the castle at night). Each shot is a camera move on
// a spline through the real world, at its own hour, with the world's own traffic, trains, aircraft and commuters stepped under
// it. Game/tools/record-reel.mjs drives it a frame at a time in Ultra Max (game/ultramax.js) and encodes the frames into
// Web/art/titles/reel.webm. Recording is the point: a frame can take as long as it needs, so the footage is far beyond what the
// game can draw live, and on the player's machine it costs a video decode and nothing else.
//
// The player: the title screen plays that reel behind the departures-board menu, with each shot named as it comes up, and says
// plainly, all the time it is on screen, that it is an in-game recording and not live gameplay. While it plays, the live world
// behind it is drawn about once a second instead of every frame, which is most of the title's cost gone on a laptop.
//
// Switches: ?titlereel=0 (the old live title), ?titlereel=live (the director, live, no video: for framing shots).
// Console: titleReel.report(), titleReel.preview("airport").
(function () {
  "use strict";
  const QS = location.search;
  const OFF = /[?&]titlereel=0\b/.test(QS), LIVE = /[?&]titlereel=live\b/.test(QS);
  const R = window.titleReel = { version: "1.0", shots: null, cur: null, live: LIVE, rec: {}, player: { on: false, manifest: null, chapter: -1 } };

  // ---------------------------------------------------------------------------------------------------------------- the director
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ground = (x, z) => { try { return world.surfaceY ? world.surfaceY(x, z) : world.sampleHeight(x, z); } catch (e) { return 0; } };
  const H = (x, z) => { try { return world.sampleHeight(x, z); } catch (e) { return 0; } };
  const ease = t => t * t * (3 - 2 * t);
  const curve = pts => pts.length > 1 ? new THREE.CatmullRomCurve3(pts, false, "centripetal") : { getPoint: () => pts[0].clone() };

  function landmarks() {
    const L = {};
    const c0 = world.cities[0];
    // the highest summit with a lift on it
    const sk = (ski.list || []).map(s => s.res && s.res.top ? { name: s.name, x: s.res.top[0], z: s.res.top[1] } : null).filter(Boolean);
    sk.forEach(s => { s.y = H(s.x, s.z); });
    sk.sort((a, b) => b.y - a.y);
    L.peak = sk[0] || null;
    L.airport = (world.airports || []).find(a => a.flight) || null;
    // Tōkonto Central: the capital's station nearest the middle of its core
    const sts = (c0.stations || []);
    const core = (c0.wards || []).find(w => w.kind === "Core");
    const cc = core ? core.centre : [(c0.bounds.x0 + c0.bounds.x1) / 2, (c0.bounds.z0 + c0.bounds.z1) / 2];
    let best = null, bd = 1e12;
    sts.forEach(s => { const named = /central/i.test(s.name || ""); const d = Math.hypot(s.centre[0] - cc[0], s.centre[1] - cc[1]) - (named ? 1e6 : 0); if (d < bd) { bd = d; best = s; } });
    L.central = best;
    L.soti = story && story.soti ? story.soti : null;
    L.castle = c0.castle || null;
    L.mizuho = world.cities[1] || null;
    L.core = cc;
    return L;
  }

  // The shots. Positions are worked out from the world's own landmarks, so a new island seed still frames them.
  R.plan = function () {
    if (R.shots) return R.shots;
    const L = landmarks(), S = [];
    if (L.peak) {
      const p = L.peak, top = p.y;
      // sunrise is in the +x direction: come up the western face, over the summit, into the light
      // the sun comes up in the +x, +z quarter: stand off to the west of the summit so it rises behind the ridge, and drift up into it
      const sx = 0.84, sz = 0.54, ox = -sz, oz = sx;
      const at = (d, side, y) => V(p.x - sx * d + ox * side, top + y, p.z - sz * d + oz * side);
      S.push({ id: "sunrise", kicker: "Mountains of Konto", title: p.name, sub: "Sunrise · 06:12", min: 6 * 60 + 8, rate: 1.2, dur: 7,
        pos: [at(1900, -260, -70), at(1650, -120, -20), at(1400, 40, 45)],
        look: [at(-300, 60, -30), at(-400, 20, 0), at(-500, -20, 30)],
        fov: 52, um: { shafts: 1.4, haze: 1.2, warmth: 1.3 } });
    }
    if (L.airport) {
      const ap = L.airport, Ln = ap.len, W2 = (lx, ly, lz) => { const q = fromRectLocal(lx, lz, ap.cx, ap.cz, ap.yaw); return V(q[0], ap.y + ly, q[1]); };
      const rot = -Ln / 2 + Ln * 0.62;
      // stand on the side of the runway that puts the sun behind the camera, so the airliner is lit and the sky is blue behind it
      const sun = [0.78, 0.52], side = (() => { const a = W2(rot, 0, 100), b = W2(rot, 0, 0); return ((b.x - a.x) * sun[0] + (b.z - a.z) * sun[1]) < 0 ? 1 : -1; })();
      S.push({ id: "airport", kicker: "Tōkonto International", title: "Flight 017 departs", sub: "Runway 34L · 07:12", min: 7 * 60 + 12, rate: 0.4, dur: 8,
        pos: [W2(rot - 330, 3.5, 92 * side), W2(rot - 230, 7, 86 * side), W2(rot - 90, 20, 80 * side)],
        lookAt: () => { const f = ap.flight; return f && f.mesh.visible ? f.mesh.position.clone().add(V(0, 4, 0)) : W2(rot, 10, 0); },
        fov: 38, um: { shafts: 0.5, haze: 0.4 },
        setup: () => { const f = ap.flight; f.state = "takeoff"; f.s = 0; f.x = undefined; f.mesh.visible = true; f.tail = 0xc0172b; },
        // started early enough that it is rolling past the camera as the shot opens
        prewarm: 28 });
    }
    if (L.central) {
      const st = L.central;
      // the doors the commuters walk to (the same point the game's own commuters head for)
      let E = null; try { E = commuteStations().filter(c => c.name === st.name).sort((a, b) => Math.hypot(a.x - st.centre[0], a.z - st.centre[1]) - Math.hypot(b.x - st.centre[0], b.z - st.centre[1]))[0]; } catch (e) { /* */ }
      const ex = E ? E.x : st.centre[0], ez = E ? E.z : st.centre[1];
      let ux = ex - st.centre[0], uz = ez - st.centre[1]; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      const lx = -uz, lz = ux, gy = ground(ex, ez);
      const at = (out, side, y) => V(ex + ux * out + lx * side, gy + y, ez + uz * out + lz * side);
      S.push({ id: "rush", kicker: "Tōkonto Central", title: "The 08:14 rush", sub: "Every weekday · every platform", min: 8 * 60 + 4, rate: 0.4, dur: 7,
        pos: [at(58, -30, 46), at(48, -12, 34), at(40, 6, 24)],
        // the camera is pointed at the crowd, wherever the game's commuters have chosen to walk: their middle, found after the warm-up
        lookAt: (k, S) => { const c = S.crowd || at(2, 0, 2); return c.clone().lerp(at(0, 0, 3), 0.25 * k); },
        after: S => { const L2 = (peds.list || []).filter(p => p.commuter && p.toStation && Math.hypot(p.x - ex, p.z - ez) < 90);
          if (L2.length > 4) { let mx = 0, mz = 0; L2.forEach(p => { mx += p.x; mz += p.z; }); mx /= L2.length; mz /= L2.length; S.crowd = V((mx + ex) / 2, gy + 1, (mz + ez) / 2);
            // and the camera comes in from beyond them, so they are walking away from it into the station
            let vx = S.crowd.x - ex, vz = S.crowd.z - ez; const vl = Math.hypot(vx, vz) || 1; vx /= vl; vz /= vl;
            const c = S.crowd; S.pos = [V(c.x + vx * 44 - vz * 18, gy + 44, c.z + vz * 44 + vx * 18), V(c.x + vx * 36 - vz * 6, gy + 34, c.z + vz * 36 + vx * 6), V(c.x + vx * 30 + vz * 6, gy + 25, c.z + vz * 30 - vx * 6)]; S._pc = null; } },
        fov: 44, peds: { x: ex + ux * 20, z: ez + uz * 20 }, um: { aperture: 0.7, focusOn: "look", shafts: 0.4, haze: 0.4 },
        prewarm: 30 });
    }
    if (L.soti) {
      const s = L.soti, x = s.at[0], z = s.at[1], gy = s.groundY || ground(x, z), h = (typeof SOTI === "object" && SOTI.height) || 240;
      // in over the bay to the south, low over the water, with the sun going down on the left and the skyline lit gold by it
      let sea = null;
      for (let d = 900; d < 3200 && !sea; d += 100) { const q = [x - 250, z + d]; if (H(q[0], q[1]) < -2 && H(q[0], q[1] - 500) < 0) sea = q; }
      const sz0 = sea ? sea[1] : z + 2100, sx0 = sea ? sea[0] : x - 250;
      S.push({ id: "bay", kicker: "Tōkonto Bay", title: "Nine million careers", sub: "Sunset · 17:52", min: 17 * 60 + 44, rate: 2.0, dur: 7,
        pos: [V(sx0 - 200, 40, sz0 + 300), V(sx0, 60, sz0), V(sx0 + 180, 85, sz0 - 300)],
        look: [V(x - 60, gy + h * 0.4, z), V(x, gy + h * 0.42, z), V(x + 40, gy + h * 0.45, z)],
        fov: 32, um: { shafts: 0.9, warmth: 1.2 } });
    }
    if (L.mizuho && L.mizuho.bounds) {
      const b = L.mizuho.bounds, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      // high over the farmland outside the town, drifting towards the mountains with the low sun across the fields
      const sx = cx - 1100, sz = cz - 700, fx = cx + 900, fz = cz + 500;
      S.push({ id: "mizuho", kicker: "Mizuho", title: "Where it starts", sub: "Countryside · 16:40", min: 16 * 60 + 34, rate: 0.6, dur: 6,
        pos: [V(sx, H(sx, sz) + 110, sz), V(sx + 160, H(sx + 160, sz + 100) + 95, sz + 100), V(sx + 320, H(sx + 320, sz + 200) + 85, sz + 200)],
        look: [V(cx, H(cx, cz) + 20, cz), V(cx + 300, H(cx + 300, cz + 170) + 60, cz + 170), V(fx, H(fx, fz) + 120, fz)],
        fov: 50, um: { shafts: 1.2, warmth: 1.3, haze: 1.2 } });
    }
    if (L.castle && L.castle.keep) {
      const k = L.castle.keep, gy = L.castle.gy || ground(k[0], k[1]), ty = L.castle.keepTop || gy + 30;
      const orb = (deg, r, y) => V(k[0] + Math.cos(deg * Math.PI / 180) * r, gy + y, k[1] + Math.sin(deg * Math.PI / 180) * r);
      S.push({ id: "castle", kicker: "Tōkonto Castle", title: "The city never clocks off", sub: "Blue hour · 18:48", min: 18 * 60 + 44, rate: 0.5, dur: 7,
        pos: [orb(30, 200, 48), orb(52, 180, 56), orb(74, 165, 66)],
        look: [V(k[0], ty - 6, k[1]), V(k[0], ty - 4, k[1]), V(k[0], ty, k[1])],
        fov: 46, um: { shafts: 0, exposure: 1.08 },
        // the keep is floodlit after dark, as every castle in Japan is: warm uplights from the moat on two sides
        setup: S => { const g = new THREE.Group(); [[1, 0.6], [-0.8, 1]].forEach(([a, b]) => { const l = new THREE.SpotLight(0xffd2a0, 0.3, 220, 0.32, 0.7, 1);
            l.position.set(k[0] + a * 60, gy + 1, k[1] + b * 60); l.target.position.set(k[0], ty - 12, k[1]); g.add(l, l.target); });
          g.userData.reelLights = true; scene.children.filter(o => o.userData && o.userData.reelLights).forEach(o => scene.remove(o)); scene.add(g); S._lights = g; },
        teardown: S => { if (S._lights) { scene.remove(S._lights); S._lights = null; } } });
    }
    const order = ["sunrise", "mizuho", "airport", "rush", "bay", "castle"];
    S.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    R.shots = S;
    return S;
  };

  // one step of the world under the camera: its traffic, its trains, its aircraft, its weather, its people
  function simStep(S, dt, camOnly) {
    const at = camera.position;
    clock += dt * (S.rate || 0.4) / (TIME.rate || 0.4);
    try { updateWorldSky(0, true); } catch (e) { /* */ }
    try { followSun(); } catch (e) { /* */ }
    if (camOnly) return;
    const run = (f, ...a) => { try { if (typeof f === "function") f(...a); } catch (e) { /* that system is not in this build */ } };
    run(window.streamFrame); run(window.updateTreeLod, dt);
    run(window.updateTraffic, dt, at); run(window.updateRail, dt, at);
    run(window.updateAirports, dt); run(window.updateGhostPlanes, dt); run(window.updateHelis, dt);
    run(window.updateBoats, dt); run(window.updateWater, dt); run(window.updateCastleFx, dt);
    if (S.peds) run(window.pedsTick, dt);
  }

  function place(S, t) {
    const k = ease(Math.max(0, Math.min(1, t)));
    if (!S._pc) { S._pc = curve(S.pos); if (S.look) S._lc = curve(S.look); }
    const p = S._pc.getPoint(k);
    const g = H(p.x, p.z) + 2.5;
    if (p.y < g) p.y = g;
    const look = S.lookAt ? S.lookAt(k, S) : S._lc.getPoint(k);
    camPos.copy(p); camera.position.copy(p);
    camera.up.copy(S.up || V(0, 1, 0));
    camera.lookAt(look);
    camera.up.set(0, 1, 0);
    if (camera.fov !== S.fov) { camera.fov = S.fov || 50; camera.updateProjectionMatrix(); }
    if (window.ULTRAMAX) {
      ULTRAMAX.set(Object.assign({ shafts: 1, haze: 1, warmth: 1, exposure: 1, aperture: 0, focus: 0 }, S.um || {}));
      if (S.um && S.um.focusOn === "look") ULTRAMAX.focus = p.distanceTo(look);
    }
    yaw = Math.atan2(-(look.x - p.x), -(look.z - p.z));
    try { followSun(); } catch (e) { /* */ }
    // the glow a city puts on the sky is for seeing it from the countryside; from inside it, it is a sprite in the camera's face
    try { nightState.glows.forEach(g => { if (g.sprite.position.distanceTo(p) < 3000) g.sprite.visible = false; }); } catch (e) { /* */ }
  }

  // set a shot up: its hour, its actors, and the world run on long enough that it looks lived in
  function begin(S) {
    R.cur = S; S.t = 0; S._pc = null;
    try { if (interior.active) { interior.stack = null; interiorLeave(true); } } catch (e) { /* */ }
    try { setGameTime(S.min); } catch (e) { /* */ }
    try { if (window.weather && weather.set) weather.set("clear"); } catch (e) { /* */ }
    if (S.peds) {
      player.pos.set(S.peds.x, ground(S.peds.x, S.peds.z), S.peds.z); player.placed = true;
      if (player.obj) player.obj.visible = false;
    }
    place(S, 0);
    if (S.setup) try { S.setup(S); } catch (e) { console.warn("[reel]", e); }
    const pre = S.prewarm || 6, dt = 1 / 10;
    const min = S.min;
    for (let i = 0; i < pre * 10; i++) { simStep(S, dt); if (S.lookAt) place(S, 0); }
    // a crowd shot waits for its crowd: the morning's commuters are let walk in until the street is full (two minutes at most)
    if (S.peds) for (let i = 0; i < 1200 && (peds.list || []).filter(p => p.commuter).length < 70; i++) simStep(S, dt);
    try { setGameTime(min); } catch (e) { /* the clock ran on in the warm-up: put it back */ }
    if (S.after) try { S.after(S); } catch (e) { console.warn("[reel]", e); }
    place(S, 0);
    if (S.peds && player.obj) player.obj.visible = false;
  }
  function step(S, dt) {
    S.t += dt;
    simStep(S, dt);
    place(S, S.t / S.dur);
    if (S.peds && player.obj) player.obj.visible = false;
    present();
  }

  // live preview (?titlereel=live, or titleReel.preview(id)): the shots in turn, at the real frame rate
  R.preview = function (id) {
    const list = R.plan(); R.live = true;
    R._li = Math.max(0, list.findIndex(s => s.id === id));
    begin(list[R._li]);
  };
  function liveTick(dt) {
    const list = R.plan(); if (!list.length) return false;
    if (!R.cur) { R._li = 0; begin(list[0]); }
    step(R.cur, dt);
    if (R.cur.t >= R.cur.dur) { R._li = (R._li + 1) % list.length; begin(list[R._li]); }
    return true;
  }

  // ---------------------------------------------------------------------------------------------------------------- recording
  R.rec.begin = function (id, w, h, fps) {
    const S = R.plan().find(s => s.id === id); if (!S) throw new Error("no shot " + id);
    R.rec.active = true; R.rec.fps = fps || 12; R.rec.S = S;
    document.body.classList.add("reelrec");
    const t = document.getElementById("title"); if (t) t.style.visibility = "hidden";
    if (window.ULTRAMAX) ULTRAMAX.set({ letterbox: 1 });
    renderer.setPixelRatio(1); renderer.setSize(w || 1920, h || 1080, false);
    camera.aspect = (w || 1920) / (h || 1080); camera.updateProjectionMatrix();
    // out of the station the title stands in (seamless-hook puts the room away and gives the camera its distance back), but still on the title
    // (every shot: between two shots the title may have stepped back into its station)
    try { setTitle(false); } catch (e) { /* */ } title.on = true; R.rec.left = true;
    try { if (interior.active) { interior.stack = null; interiorLeave(true); } } catch (e) { /* */ }
    player.placed = true; if (player.obj) player.obj.visible = false;
    begin(S);
    camera.far = Math.max(camera.far, 6000); camera.updateProjectionMatrix();
    // two frames to let the shaders, the streaming and the shadow map settle before the first one that is kept
    for (let i = 0; i < 2; i++) { place(S, 0); present(); }
    S.t = 0;
    return { id: S.id, dur: S.dur };
  };
  R.rec.frame = function (i) {
    const S = R.rec.S, dt = 1 / R.rec.fps;
    // the game's own per-frame layers (street dressing, the census's people, the engine) run first, as they would in play
    if (!S.peds) { player.pos.set(camera.position.x, ground(camera.position.x, camera.position.z), camera.position.z); }
    R.rec.inStep = true; try { window.tick(i > 0 ? dt : 0); } catch (e) { /* */ } finally { R.rec.inStep = false; }
    if (i > 0) step(S, dt); else { place(S, 0); present(); }
    return renderer.domElement.toDataURL("image/jpeg", 0.95);
  };
  // a look at one moment of the shot without running the world to it (for framing)
  R.rec.peek = function (t) { const S = R.rec.S; place(S, t); present(); return renderer.domElement.toDataURL("image/jpeg", 0.9); };
  R.rec.sim = function (sec) { const S = R.rec.S; for (let i = 0; i < sec * 10; i++) { simStep(S, 0.1); S.t += 0.1; place(S, S.t / S.dur); } return S.t; };
  R.rec.end = function () { const S = R.rec.S; if (S && S.teardown) try { S.teardown(S); } catch (e) { /* */ } R.rec.active = false; R.rec.hold = true; R.cur = null; };

  // the title's frame: the director's when a reel is being recorded or previewed, the menu's own otherwise
  function hookTitle() {
    if (typeof window.updateTitle !== "function" || typeof window.tick !== "function") { setTimeout(hookTitle, 300); return; }
    const inner = window.updateTitle;
    window.updateTitle = function (dt) {
      if (R.rec.active || R.rec.hold) return;          // the recorder steps the world itself, and holds it between shots
      if (R.live) { if (liveTick(dt)) return; }
      if (R.player.on && R.player.playing) {
        // the reel covers the screen: draw the world behind it about once a second, so it stays warm and costs next to nothing
        R.player.acc = (R.player.acc || 0) + dt;
        if (R.player.acc < 1) return;
        dt = R.player.acc; R.player.acc = 0;
      }
      return inner.call(this, dt);
    };
    const tickInner = window.tick;
    window.tick = function (dt) {
      if (R.rec.active && !R.rec.inStep) return;       // the frame loop waits while a recording frame is made
      return tickInner.apply(this, arguments);
    };
  }
  hookTitle();

  // ---------------------------------------------------------------------------------------------------------------- the player
  const CSS = `
  #treel { position: absolute; inset: 0; overflow: hidden; background: #050607; opacity: 0; transition: opacity 1.2s ease; pointer-events: none; }
  #treel.on { opacity: 1; }
  #treel video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  #treel-badge { position: absolute; right: clamp(18px, 3vw, 44px); bottom: clamp(52px, 7vh, 72px); display: flex; align-items: center; gap: 10px;
    padding: 7px 12px 7px 10px; background: rgba(6,7,9,.62); border: 1px solid rgba(255,255,255,.14); border-radius: 3px;
    font: 600 11px/1.25 var(--data, ui-monospace, monospace); letter-spacing: .14em; text-transform: uppercase; color: #d9dde2; backdrop-filter: blur(6px); }
  #treel-badge i { width: 9px; height: 9px; border-radius: 50%; background: #ff3b30; box-shadow: 0 0 10px #ff3b30; animation: treelrec 1.6s steps(1) infinite; flex: none; }
  #treel-badge small { display: block; font-size: 9.5px; letter-spacing: .12em; color: #8d959e; }
  @keyframes treelrec { 50% { opacity: .2; } }
  #treel-cap { position: absolute; right: clamp(18px, 3vw, 44px); bottom: calc(clamp(52px, 7vh, 72px) + 62px); text-align: right; color: #fff;
    text-shadow: 0 2px 18px rgba(0,0,0,.65); opacity: 0; transform: translateY(10px); transition: opacity .7s ease, transform .9s cubic-bezier(.2,.7,.2,1); }
  #treel-cap.on { opacity: 1; transform: none; }
  #treel-cap .k { font: 700 11px/1 var(--data, ui-monospace, monospace); letter-spacing: .3em; text-transform: uppercase; color: #ffb21c; }
  #treel-cap .t { margin-top: 8px; font: 400 clamp(26px, 3.1vw, 46px)/1 "Konto Kanban", var(--ui); letter-spacing: .04em; }
  #treel-cap .s { margin-top: 8px; font: 600 12px/1 var(--data, ui-monospace, monospace); letter-spacing: .2em; text-transform: uppercase; color: #c3c9cf; }
  body.reelrec #hud, body.reelrec #controls, body.reelrec #notice { display: none !important; }`;

  function chapterAt(m, t) { let i = 0; (m.chapters || []).forEach((c, k) => { if (t >= c.t) i = k; }); return i; }

  function playerBuild(m) {
    const host = document.getElementById("title"); if (!host || document.getElementById("treel")) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    const box = document.createElement("div"); box.id = "treel"; box.setAttribute("aria-hidden", "true");
    const v = document.createElement("video");
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto"; v.autoplay = true; v.poster = m.poster || "";
    v.setAttribute("aria-label", "In-game recording of Konto, Ultra Max cinematic mode");
    v.src = m.video;
    const badge = document.createElement("div"); badge.id = "treel-badge";
    badge.innerHTML = "<i></i><div>In-game recording · Ultra Max<small>Captured in the Shigoto engine. Not live gameplay.</small></div>";
    const cap = document.createElement("div"); cap.id = "treel-cap"; cap.innerHTML = '<div class="k"></div><div class="t"></div><div class="s"></div>';
    box.append(v, badge);                                // no place names on the footage (Duncan): only the recording badge
    host.insertBefore(box, host.firstChild);                     // under the veil and the menu
    const P = R.player; P.el = box; P.video = v; P.cap = cap; P.manifest = m;
    const show = i => {
      const c = (m.chapters || [])[i]; if (!c) return;
      P.chapter = i; cap.classList.remove("on");
      setTimeout(() => { cap.querySelector(".k").textContent = c.kicker || ""; cap.querySelector(".t").textContent = c.title || ""; cap.querySelector(".s").textContent = c.sub || ""; cap.classList.add("on"); }, 380);
    };
    void show;
    v.addEventListener("playing", () => { P.playing = true; box.classList.add("on"); });
    v.addEventListener("pause", () => { P.playing = false; });
    // a reel that cannot play leaves the live title exactly as it was
    v.addEventListener("error", () => { P.playing = false; P.failed = true; box.remove(); });
  }

  function playerOn(on) {
    const P = R.player; P.on = on;
    if (!P.video) return;
    if (on) { P.video.play().catch(() => { P.playing = false; }); }
    else { P.video.pause(); P.playing = false; P.el.classList.remove("on"); }
  }

  if (!OFF && !LIVE) {
    fetch("art/titles/reel.json").then(r => r.ok ? r.json() : null).then(m => {
      if (!m || !m.video) return;
      if (!/^art\/titles\/[\w-]+\.(webm|mp4)$/.test(m.video)) return;
      R.player.manifest = m;
      const go = () => { playerBuild(m); playerOn(!!(window.title && title.on)); };
      if (document.getElementById("title")) go(); else document.addEventListener("DOMContentLoaded", go);
    }).catch(() => { /* no reel: the live title */ });
    const hookSet = () => {
      if (typeof window.setTitle !== "function") { setTimeout(hookSet, 300); return; }
      const inner = window.setTitle;
      window.setTitle = function (on) { const r = inner.apply(this, arguments); try { if (R.player.manifest) { if (on && !R.player.video) playerBuild(R.player.manifest); playerOn(!!on); } } catch (e) { /* */ } return r; };
    };
    hookSet();
  }

  R.report = () => ({ version: R.version, shots: (R.shots || []).map(s => s.id), live: R.live, recording: !!R.rec.active,
    player: { on: R.player.on, playing: !!R.player.playing, chapter: R.player.chapter, failed: !!R.player.failed, video: R.player.manifest && R.player.manifest.video } });
})();
