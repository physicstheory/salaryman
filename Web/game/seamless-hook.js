// Seamless buildings: no fades, no cuts, real views out.
//
// Every room in the game is built away from the city (y = 400), so walking through a door used to snap Seiko and the camera to
// a fixed spot inside a box with a painted light card where the street should be. This hook makes it one continuous walk:
//
// * The street outside each door is photographed into a small cube map while you walk up to it (one face per frame, never more
//   than ~200 px a side on an integrated GPU). Inside, that photograph is the world behind every doorway, window and glass roof,
//   so the street you just left is still there through the glass and the station's windows look out on its own platforms.
// * Crossing the threshold keeps everything you had: where you stand across the door, which way you face, the camera behind you
//   and your pace. Walking back out puts you back on the pavement exactly where you crossed. Lifts open on the other floor.
// * Inside, the camera's far plane drops to 260 m and the sun's shadow map stops redrawing, so a room costs a fraction of the
//   street (the city 400 m below is culled, not drawn behind the walls).
// * Stations: the ticket gates are a real barrier (IC card or a ticket from the machine), and the passage behind them takes you
//   up onto the real platform, where your train pulls in; arriving, you walk off the platform into the concourse and out through
//   the gates. The street stairs are gone, so the station is the only way on.
//
// Off switch: ?seamless=0 (or localStorage konto.seamless=0).
(function () {
  "use strict";
  let off = /[?&]seamless=0\b/.test(location.search);
  try { off = off || localStorage.getItem("konto.seamless") === "0"; } catch (e) { /* private window */ }
  if (off || typeof THREE === "undefined") return;

  const S = window.seamless = { version: "1.0.0", cubes: new Map(), backdrop: null, inside: false, ticket: null, called: null, stats: { captures: 0, faces: 0, walkIns: 0, walkOuts: 0, platform: 0 } };
  const MAX_CUBES = 4;
  const lowTier = () => typeof gfx !== "undefined" && gfx.tier === "low";
  const igpu = () => { try { const r = renderer && renderer.getContext && renderer.getContext(); const i = r && r.getExtension("WEBGL_debug_renderer_info"); const n = i ? String(r.getParameter(i.UNMASKED_RENDERER_WEBGL)) : ""; return /intel|iris|uhd|swiftshader|llvmpipe|radeon\(tm\) graphics|vega \d+ graphics/i.test(n); } catch (e) { return false; } };
  let IGPU = null;
  const cubeSize = () => { if (IGPU === null) IGPU = igpu(); return lowTier() ? 128 : IGPU ? 192 : 256; };
  const ok = () => typeof renderer !== "undefined" && renderer && typeof scene !== "undefined" && scene && typeof interior === "object";

  // ---- where a shop's street is seen from ---------------------------------------------------------------------------------------
  function capPoint(s) {
    const ox = Math.sin(s.yaw || 0), oz = Math.cos(s.yaw || 0);
    // from just inside the shell, so the whole street round the building is in view; a station's door is out in front of the
    // concourse, so its point is inside the concourse (the platforms are then behind it, where the room's back wall is)
    const depth = s.station ? 9 : s.brand === "airport" ? 7 : 2.6;
    const x = s.door[0] - ox * depth, z = s.door[1] - oz * depth;
    let gy = s.groundY; if (!(gy > -1e4)) try { gy = world.surfaceY(x, z); } catch (e) { gy = 0; }
    return { x: x, y: gy + 1.65, z: z, yaw: s.yaw || 0 };
  }
  function cubeFor(s, make) {
    let c = S.cubes.get(s);
    if (!c && make) {
      const n = cubeSize();
      // sRGB, like the screen: the programs the city already compiled are reused as they are (no shader rebuild on the first photo)
      const rt = new THREE.WebGLCubeRenderTarget(n, { format: THREE.RGBAFormat, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, encoding: renderer.outputEncoding });
      const cam = new THREE.CubeCamera(0.4, 30000, rt);
      c = { rt: rt, cam: cam, face: 0, done: false, at: 0, used: performance.now(), p: capPoint(s) };
      S.cubes.set(s, c);
      if (S.cubes.size > MAX_CUBES) {
        let old = null; S.cubes.forEach((v, k) => { if (k !== s && (!S.cur || k !== S.cur.shop) && (!old || v.used < old[1].used)) old = [k, v]; });
        if (old) { old[1].rt.dispose(); S.cubes.delete(old[0]); }
      }
    }
    if (c) c.used = performance.now();
    return c;
  }
  // render one face of the cube (0..5); the player and every room are hidden for it
  function face(c, i) {
    const r = renderer, prev = r.getRenderTarget(), xr = r.xr && r.xr.enabled, auto = r.shadowMap.autoUpdate;
    const hidden = [];
    const hide = o => { if (o && o.visible) { o.visible = false; hidden.push(o); } };
    if (player && player.obj) hide(player.obj);
    if (S.backdrop) hide(S.backdrop);
    Object.keys(interior.rooms || {}).forEach(k => { const R = interior.rooms[k]; if (R && R.group) hide(R.group); });
    if (typeof skyDome !== "undefined" && skyDome) skyDome.position.set(c.p.x, c.p.y, c.p.z);
    c.cam.position.set(c.p.x, c.p.y, c.p.z); c.cam.updateMatrixWorld(true);
    if (r.xr) r.xr.enabled = false;
    r.shadowMap.autoUpdate = false;              // the shadow map from the last frame is the right one, and redrawing it six times is not free
    try { r.setRenderTarget(c.rt, i); r.render(scene, c.cam.children[i]); }
    finally {
      r.setRenderTarget(prev); if (r.xr) r.xr.enabled = xr; r.shadowMap.autoUpdate = auto;
      hidden.forEach(o => { o.visible = true; });
      if (typeof skyDome !== "undefined" && skyDome && camera) skyDome.position.copy(camera.position);
    }
    S.stats.faces++;
  }
  function finish(c) { while (!c.done) step(c); }
  function step(c) {
    face(c, c.face);
    c.face++;
    if (c.face >= 6) { c.face = 0; c.done = true; c.at = performance.now(); c.mins = gameMin(); S.stats.captures++; }
  }
  const gameMin = () => { try { return typeof gameMinutes === "function" ? gameMinutes() : 0; } catch (e) { return 0; } };

  // ---- the backdrop: the street, all round the room ------------------------------------------------------------------------------
  const VIEW_VS = "varying vec3 vDir; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; }";
  const VIEW_FS = "uniform samplerCube uCube; uniform float uYaw; uniform float uDim; uniform vec3 uTint; varying vec3 vDir;\n" +
    "void main(){ vec3 d = normalize(vDir); float c = cos(uYaw), s = sin(uYaw); vec3 w = vec3(d.x * c + d.z * s, d.y, -d.x * s + d.z * c);\n" +
    "  gl_FragColor = vec4(textureCube(uCube, w).rgb * uDim * uTint, 1.0); }";
  const uniforms = { uCube: { value: null }, uYaw: { value: 0 }, uDim: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } };
  // one material for the backdrop and one for glass (the glass is a touch darker and greener, as float glass is)
  const viewMat = new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: VIEW_VS, fragmentShader: VIEW_FS, side: THREE.BackSide, fog: false, toneMapped: false });
  const glassUniforms = { uCube: uniforms.uCube, uYaw: uniforms.uYaw, uDim: { value: 0.9 }, uTint: { value: new THREE.Color(0.92, 0.97, 0.96) } };
  const glassMat = new THREE.ShaderMaterial({ uniforms: glassUniforms, vertexShader: VIEW_VS, fragmentShader: VIEW_FS, side: THREE.FrontSide, fog: false, toneMapped: false });
  glassMat.userData.seamlessView = viewMat.userData.seamlessView = true;
  function backdrop() {
    if (!S.backdrop) {
      S.backdrop = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), viewMat);
      S.backdrop.name = "seamless-backdrop"; S.backdrop.frustumCulled = false; S.backdrop.renderOrder = -10; S.backdrop.visible = false;
      S.backdrop.userData.shDry = true; S.backdrop.userData.pbrDone = true;
      scene.add(S.backdrop);
    }
    return S.backdrop;
  }

  // ---- windows: glass in the walls that looks out ---------------------------------------------------------------------------------
  // A pane is a plane just in front of the wall, drawn with the street photograph seen along the eye ray (so it moves with you as a
  // real window does), in a frame with mullions. Bands are kept above head height where shops and boards stand on the walls.
  const paneGeo = new THREE.PlaneGeometry(1, 1);
  function pane(root, w, h, x, y, z, ry) {
    const m = new THREE.Mesh(paneGeo, glassMat); m.scale.set(w, h, 1); m.position.set(x, y, z); m.rotation.y = ry; m.userData.seamlessView = true; m.userData.pbrDone = true; root.add(m); return m;
  }
  function frameBox(root, w, h, d, x, y, z) { return typeof inAdd === "function" ? inAdd(root, w, h, d, x, y, z, "#4b5058") : null; }
  // a band of glass along a wall: wall = "back" (-z), "front" (+z), "left" (-x), "right" (+x); from/to along the wall; y0..y1
  function band(R, wall, from, to, y0, y1, skip) {
    const root = R.group, W = R.W || 24, D = R.D || 17, inset = 0.13, bay = 2.4;
    const len = to - from; if (len < 1 || y1 - y0 < 0.5) return;
    const n = Math.max(1, Math.round(len / bay)), bw = len / n;
    for (let i = 0; i < n; i++) {
      const c = from + (i + 0.5) * bw;
      if (skip && skip(c, bw)) continue;
      const y = (y0 + y1) / 2, h = y1 - y0;
      if (wall === "back") { pane(root, bw - 0.08, h, c, y, -D / 2 + inset, 0); frameBox(root, 0.08, h + 0.1, 0.1, c - bw / 2, y, -D / 2 + inset + 0.03); }
      else if (wall === "front") { pane(root, bw - 0.08, h, c, y, D / 2 - inset, Math.PI); frameBox(root, 0.08, h + 0.1, 0.1, c - bw / 2, y, D / 2 - inset - 0.03); }
      else if (wall === "left") { pane(root, bw - 0.08, h, -W / 2 + inset, y, c, Math.PI / 2); frameBox(root, 0.1, h + 0.1, 0.08, -W / 2 + inset + 0.03, y, c - bw / 2); }
      else { pane(root, bw - 0.08, h, W / 2 - inset, y, c, -Math.PI / 2); frameBox(root, 0.1, h + 0.1, 0.08, W / 2 - inset - 0.03, y, c - bw / 2); }
    }
    // sill and head
    const mid = (from + to) / 2;
    if (wall === "back" || wall === "front") { const z = wall === "back" ? -D / 2 + inset + 0.04 : D / 2 - inset - 0.04; frameBox(root, len, 0.1, 0.16, mid, y0 - 0.05, z); frameBox(root, len, 0.1, 0.14, mid, y1 + 0.05, z); }
    else { const x = wall === "left" ? -W / 2 + inset + 0.04 : W / 2 - inset - 0.04; frameBox(root, 0.16, 0.1, len, x, y0 - 0.05, mid); frameBox(root, 0.14, 0.1, len, x, y1 + 0.05, mid); }
  }
  function views(R) {
    if (!R || !R.group || R._views) return;
    R._views = true;
    const W = R.W || 24, D = R.D || 17, wallH = (R.profile && R.profile.wallHeight) || R.H || 4.2;
    const kind = R.station ? "station" : R.brand === "airport" ? (R.kind === "cabin" ? "cabin" : "airport") : (R.brand === "plaza" || R.brand === "mall") ? "plaza" : "shop";
    if (kind === "station") {
      const hi = Math.max(3.5, Math.min(wallH - 0.4, 3.6)), top = wallH - 0.35;
      const doorClear = (c, bw) => Math.abs(c) < 2.4 + bw / 2;
      // the street front either side of the doors, full height (a concourse's front is glass)
      band(R, "front", -W / 2 + 0.6, -2.0, 0.35, top, null);
      band(R, "front", 2.0, W / 2 - 0.6, 0.35, Math.min(top, 3.2), null);
      // clerestories over the shops and the gates: the platforms, the trains and the sky
      if (top - hi > 0.7) { band(R, "back", -W / 2 + 0.6, W / 2 - 0.6, hi, top, null); band(R, "left", -D / 2 + 0.6, D / 2 - 0.6, hi, top, null); band(R, "right", -D / 2 + 0.6, D / 2 - 0.6, hi, top, null); }
      // the passage to the platforms: an open way through the back wall, the platform beyond it
      const G = R.platformGate;
      if (G) {
        const root = R.group, z = -D / 2 + 0.12;
        pane(root, G.w, 2.7, G.x, 1.35, z, 0);
        frameBox(root, 0.22, 2.9, 0.3, G.x - G.w / 2 - 0.11, 1.45, z + 0.05); frameBox(root, 0.22, 2.9, 0.3, G.x + G.w / 2 + 0.11, 1.45, z + 0.05);
        frameBox(root, G.w + 0.44, 0.24, 0.3, G.x, 2.82, z + 0.05);
        // the yellow tactile line leads you to it, as it does in every Japanese station
        if (typeof inAdd === "function") { const t = inAdd(root, 0.3, 0.02, 3.0, G.x, 0.012, z + 1.6, "#e8c21c"); t.userData.shopSurface = "tactile"; }
      }
    } else if (kind === "airport") {
      // a terminal is a glass box: high glass on every wall, and the airside wall glazed to the floor where nothing stands
      const top = (R.H || 7) - 0.75, lo = Math.min(3.9, top - 1.2);
      band(R, "back", -W / 2 + 0.6, W / 2 - 0.6, lo, top, null);
      band(R, "left", -D / 2 + 0.6, D / 2 - 0.6, lo, top, null);
      band(R, "right", -D / 2 + 0.6, D / 2 - 0.6, lo, top, null);
      band(R, "front", -W / 2 + 0.6, W / 2 - 0.6, lo, top, (c, bw) => !R.noExit && Math.abs(c) < 1.6 + bw / 2);
    } else if (kind === "cabin") {
      // the cabin's windows: a row of small ones down each side
      const root = R.group, Dc = R.D || 44, Wc = R.W || 11;
      for (let z = -Dc / 2 + 3; z < Dc / 2 - 3; z += 1.6) { pane(root, 0.34, 0.46, -Wc / 2 + 0.16, 1.35, z, Math.PI / 2); pane(root, 0.34, 0.46, Wc / 2 - 0.16, 1.35, z, -Math.PI / 2); }
    } else if (kind === "plaza") {
      const top = wallH - 0.35;
      if (top - 3.6 > 0.7) { band(R, "left", -D / 2 + 0.6, D / 2 - 0.6, 3.6, top, null); band(R, "right", -D / 2 + 0.6, D / 2 - 0.6, 3.6, top, null); }
      if (!R.noExit) { band(R, "front", -W / 2 + 0.6, -2.0, 0.35, Math.min(top, 3.0), null); band(R, "front", 2.0, W / 2 - 0.6, 0.35, Math.min(top, 3.0), null); }
    }
    // a shop's own street window either side of the door (shops already have a glass door; the band makes it a shopfront)
    if (kind === "shop" && !R.noExit && R.brand !== "home" && R.brand !== "capsule") {
      band(R, "front", -W / 2 + 0.8, -1.6, 0.9, 2.6, null);
      band(R, "front", 1.6, Math.min(W / 2 - 0.8, 6.5), 0.9, 2.6, null);
    }
  }

  // ---- inside / outside ----------------------------------------------------------------------------------------------------------
  let farWas = null, autoWas = true;
  function show(R, shop) {
    if (!R || !R.group) return;
    const c = shop && cubeFor(shop, false);
    const bd = backdrop();
    if (c && c.done) {
      uniforms.uCube.value = c.rt.texture; uniforms.uYaw.value = c.p.yaw;
      const W = R.W || 24, D = R.D || 17, H = R.H || 4.2;
      bd.position.set(R.ox, interior.floorY + H / 2, R.oz); bd.scale.set(W + 90, Math.max(H + 70, 80), D + 90);
      bd.visible = true;
      views(R);
    } else bd.visible = false;
    R.group.traverse(o => { if (o.userData && o.userData.streetCard) o.visible = !bd.visible; if (o.userData && o.userData.seamlessView) o.visible = bd.visible; });
    // night inside: the photo was taken in the light it was taken in; dim the glass a little after dark for the reflections a lit room puts on it
    const n = typeof nightState === "object" ? nightState.lit || 0 : 0;
    uniforms.uDim.value = 1 - 0.25 * n; glassUniforms.uDim.value = 0.9 - 0.3 * n;
    if (camera && farWas === null) { farWas = camera.far; camera.far = Math.min(camera.far, 260); camera.updateProjectionMatrix(); }
    if (renderer && renderer.shadowMap && !S.inside) { autoWas = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false; }
    S.inside = true; S.cur = { room: R, shop: shop };
  }
  function hideAll() {
    if (S.backdrop) S.backdrop.visible = false;
    if (camera && farWas !== null) { camera.far = farWas; camera.updateProjectionMatrix(); farWas = null; }
    if (renderer && renderer.shadowMap && S.inside) { renderer.shadowMap.autoUpdate = autoWas !== false; renderer.shadowMap.needsUpdate = true; }
    S.inside = false; S.cur = null;
  }

  // world <-> room through a door: the door's outward direction (s.yaw) is the room's +z, and the door point is the middle of the
  // room's front wall
  function toRoom(s, R, v) {
    const c = Math.cos(s.yaw || 0), sn = Math.sin(s.yaw || 0), dx = v.x - s.door[0], dz = v.z - s.door[1];
    const gy = s.groundY > -1e4 ? s.groundY : v.y;
    return new THREE.Vector3(R.ox + dx * c - dz * sn, interior.floorY + (v.y - gy), R.oz + (R.D || 17) / 2 + dx * sn + dz * c);
  }
  function toWorld(s, R, v) {
    const c = Math.cos(s.yaw || 0), sn = Math.sin(s.yaw || 0), lx = v.x - R.ox, lz = v.z - R.oz - (R.D || 17) / 2;
    const gy = s.groundY > -1e4 ? s.groundY : 0;
    return new THREE.Vector3(s.door[0] + lx * c + lz * sn, gy + (v.y - interior.floorY), s.door[1] - lx * sn + lz * c);
  }

  const DOORSTEP = 1.6;      // how far past the door line you can stand before you are back in the street
  function wrap(name, f) { const o = window[name]; if (typeof o !== "function") return false; window[name] = f(o); return true; }

  wrap("interiorEnter", orig => function (s) {
    if (!ok() || !s || interior.active) return orig.apply(this, arguments);
    const walking = !!(s.door && player && player.mode === "walk" && !drive.car && !drive.train && Math.hypot(s.door[0] - player.pos.x, s.door[1] - player.pos.z) < 4);
    const fromPlatform = S.fromPlatform === s;
    // the street has to be in the photo before the walls go up: finish it now if the walk up to the door did not
    if (s.door) { try { const c = cubeFor(s, true); if (!c.done || c.stale) { c.stale = false; c.done = false; c.face = 0; finish(c); } } catch (e) { console.warn("[seamless] street photo failed", e); } }
    const pre = walking && !fromPlatform ? { pos: player.pos.clone(), cam: camPos.clone(), yaw: yaw, pitch: pitch, pyaw: player.yaw, speed: player.speed } : null;
    const r = orig.apply(this, arguments);
    if (!r || !interior.active) return r;
    const R = interior.room;
    show(R, s);
    if (pre && R && !R.noExit) {
      // where he was, across the door
      const half = (R.doorW ? R.doorW / 2 : 1.2) - 0.45, at = toRoom(s, R, pre.pos);
      at.x = Math.max(R.ox - half, Math.min(R.ox + half, at.x));
      // a stride inside the door: the room's own walls have to be round the camera, or it would be looking at the back of them
      at.z = Math.min(at.z, R.oz + (R.D || 17) / 2 - 1.6);
      at.y = interior.floorY;
      player.pos.copy(at); player.obj.position.copy(at);
      player.yaw = player.targetYaw = pre.pyaw - (s.yaw || 0); yaw = pre.yaw - (s.yaw || 0); pitch = pre.pitch;
      player.speed = pre.speed;
      camPos.copy(toRoom(s, R, pre.cam)); interiorClampCam(camPos);
      if (camPos.z < at.z + 0.9) camPos.set(at.x, interior.floorY + 2.3, Math.min(R.oz + (R.D || 17) / 2 - 0.3, at.z + 1.3));
      camera.position.copy(camPos);
      S.stats.walkIns++;
    }
    interior.doorstep = R && !R.noExit ? DOORSTEP : 0;
    if (fromPlatform) { S.fromPlatform = null; platformArrive(s, R); }
    return r;
  });
  wrap("interiorLeave", orig => function (quiet) {
    if (!ok() || !interior.active) return orig.apply(this, arguments);
    const s = interior.shop, R = interior.room, stacked = !!interior.stack;
    const lz = R ? player.pos.z - R.oz - (R.D || 17) / 2 : -99;
    const walking = !!(!quiet && !stacked && s && s.door && R && !R.noExit && lz > -1.2 && player.mode === "walk");
    const pre = walking ? { pos: player.pos.clone(), cam: camPos.clone(), yaw: yaw, pitch: pitch, pyaw: player.yaw, speed: player.speed } : null;
    const r = orig.apply(this, arguments);
    if (stacked && interior.active) { show(interior.room, interior.shop); return r; }
    if (interior.active) return r;
    hideAll();
    interior.doorstep = 0;
    if (pre) {
      // back out onto the pavement where he crossed, still walking
      const p = toWorld(s, R, pre.pos);
      const out = [Math.sin(s.yaw || 0), Math.cos(s.yaw || 0)];
      try { placeSeiko(new THREE.Vector3(p.x + out[0] * 0.2, 0, p.z + out[1] * 0.2)); } catch (e) { /* stepOutFrom placed him */ }
      player.yaw = player.targetYaw = pre.pyaw + (s.yaw || 0); yaw = pre.yaw + (s.yaw || 0); pitch = pre.pitch; player.speed = pre.speed;
      const cw = toWorld(s, R, pre.cam); cw.y = Math.max(cw.y, player.pos.y + 1.2);
      camPos.copy(cw); camera.position.copy(camPos);
      doorway.cool = 0; doorway.clear = s.door.slice();
      S.stats.walkOuts++;
    } else if (s && s.door) doorway.clear = s.door.slice();
    return r;
  });
  // a lift, a plaza shop or the concourse again: the street round the new room is the same street
  wrap("interiorShowRoom", orig => function (room) {
    const r = orig.apply(this, arguments);
    if (interior.active) { show(room, interior.shop); interior.doorstep = room && !room.noExit ? DOORSTEP : 0; }
    return r;
  });

  // ---- stations: the gates, the passage and the platform ----------------------------------------------------------------------------
  const BASE_FARE = 160;
  wrap("interiorTryStep", orig => function (dx, dz, radius) {
    const R = interior.room, G = R && R.gates;
    if (G) {
      const z0 = player.pos.z - R.oz, z1 = z0 + dz, x1 = player.pos.x + dx - R.ox;
      if (x1 > G.x0 && x1 < G.x1 && ((z0 >= G.z && z1 < G.z) || (z0 <= G.z && z1 > G.z))) {
        const inbound = z1 < G.z;
        if (inbound && !G.paid && !gateIn(G)) return false;
        if (!inbound && G.paid) gateOut(G);
      }
    }
    return orig.apply(this, arguments);
  });
  let saidAt = 0;
  function sayOnce(t, d) { const now = performance.now(); if (now - saidAt > 2500) { saidAt = now; if (typeof say === "function") say(t, d || 3); } }
  function gateIn(G) {
    if (S.ticket && S.ticket.from === stationName()) { G.paid = true; sayOnce("ピッ  Ticket for " + S.ticket.d.name + ". Platforms ahead.", 3); beep(); return true; }
    if (typeof wallet === "object" && wallet.ic && wallet.ic.bal >= BASE_FARE) { G.paid = true; G.ic = true; sayOnce("ピッ  IC  ·  " + yenText(wallet.ic.bal) + " on the card.", 2.5); beep(); return true; }
    sayOnce(typeof wallet === "object" && wallet.ic ? "The gate shuts: not enough on your IC card. Buy a ticket at the machine." : "The gate shuts. Buy a ticket at the machine, or get an IC card.", 3.5);
    try { if (typeof rumble === "function") rumble(0.4, 0.2, 120); } catch (e) { /* no pad */ }
    return false;
  }
  function gateOut(G) {
    G.paid = false;
    if (G.ic && typeof wallet === "object" && wallet.ic) { const fare = S.rideFare || BASE_FARE; wallet.ic.bal = Math.max(0, wallet.ic.bal - fare); sayOnce("ピッ  " + yenText(fare) + "  ·  " + yenText(wallet.ic.bal) + " left.", 2.5); }
    else sayOnce("ピッ  Arigatou gozaimashita.", 2);
    G.ic = false; S.rideFare = 0; beep();
  }
  let actx = null;
  function beep() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(); o.type = "sine"; o.frequency.value = 2600; g.gain.value = 0.05;
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.09);
    } catch (e) { /* no audio */ }
  }
  const stationName = () => { const s = interior.shop || {}; return (s.stationRef && s.stationRef.name) || s.name || ""; };

  // the machine sells a ticket (and charges for it); the gates and the platform do the rest
  wrap("railTripStart", orig => function (d) {
    if (!(interior.active && interior.room && interior.room.gates && d && !S.legacy)) return orig.apply(this, arguments);
    const fare = d.fare || BASE_FARE;
    if (purse.yen < fare && !(wallet.ic && wallet.ic.bal >= fare)) { say("Not enough for the fare: " + yenText(fare) + ".", 4); return; }
    if (wallet.ic && wallet.ic.bal >= fare) wallet.ic.bal -= fare; else purse.yen -= fare;
    S.ticket = { d: d, from: stationName(), at: gameMin() };
    say("Ticket for " + d.name + " · " + yenText(fare) + ". Through the gates and up to the platform.", 5);
    try { if (story.step === "out" || story.step === "late") storyClearBlips(); } catch (e) { /* no story */ }
  });

  function frameOf(st) {
    const t = st && st.frame, C = st && st.conc; if (!t || !C || C.z === undefined) return null;
    const wc = Math.cos(t.yaw), ws = Math.sin(t.yaw);
    return { t: t, C: C, wc: wc, ws: ws,
      toW: (lx, lz) => [t.x + lx * wc + lz * ws, t.z - lx * ws + lz * wc],
      toL: (x, z) => { const dx = x - t.x, dz = z - t.z; return [dx * wc - dz * ws, dx * ws + dz * wc]; } };
  }
  // which platform a trip leaves from: the side of the track its train's left side is on
  function sideFor(F, d) {
    try {
      const line = rail.lines[d.li], p = sampleLane(line, d.from.s);
      const L = F.toL(p.x - Math.cos(p.yaw) * 6.7, p.z + Math.sin(p.yaw) * 6.7);
      return L[0] < 0 ? -1 : 1;
    } catch (e) { return 1; }
  }
  S.toPlatform = function (sp) {
    const s = interior.shop, R = interior.room, st = s && s.stationRef, F = frameOf(st);
    if (!F || !R || !R.gates) return false;
    if (!R.gates.paid) { say("Through the ticket gates first.", 2.5); return true; }
    let d = S.ticket && S.ticket.from === stationName() ? S.ticket.d : null;
    if (!d) { try { const list = railDestinations(st); d = list[0] || null; } catch (e) { d = null; } }
    const side = d ? sideFor(F, d) : (player.pos.x - R.ox < (R.platformGate ? R.platformGate.x : 0) ? -1 : 1);
    const fz = F.C.fz, lz = F.C.face + fz * 3.6, P = F.toW(side * 6.7, lz), deckY = F.C.deckY || (F.t.y + 1.15);
    R.gates.paid = false;
    if (d && S.ticket && S.ticket.d === d) S.ticket = null; else if (R.gates.ic && d) S.rideFare = d.fare || BASE_FARE;
    const pre = { yaw: yaw, pitch: pitch, speed: player.speed };
    interiorLeave(true);
    hideAll(); interior.doorstep = 0;
    placeSeiko(new THREE.Vector3(P[0], deckY, P[1]));
    player.pos.y = deckY; player.obj.position.copy(player.pos); player.placed = true; player.onWalk = true;
    // walking on, away from the concourse, along the platform
    const along = Math.atan2(F.ws * fz, F.wc * fz);
    player.yaw = player.targetYaw = along; yaw = along + Math.PI; pitch = pre.pitch; player.speed = Math.min(pre.speed || 0, 1.6);
    camPos.set(P[0] - Math.sin(along) * 3.2, deckY + 1.9, P[1] - Math.cos(along) * 3.2); camera.position.copy(camPos);
    doorway.cool = 0.6; S.onPlatform = { st: st, shop: s, at: performance.now() };
    S.stats.platform++;
    if (d) callTrain(d);
    say((side < 0 ? "1番線" : "2番線") + "  ·  " + (d ? "for " + d.name + ". The train is on its way." : "Mind the gap."), 4);
    return true;
  };
  // the train for a trip comes in to the platform you are standing on; getting on is the usual F at the doors
  function callTrain(d) {
    try {
      const line = rail.lines[d.li], ki = TRAIN_KINDS.findIndex(k => k.name === line.kindName);
      let si = rail.sets.findIndex(q => q.kind === ki && !q.live);
      if (si < 0) si = rail.sets.findIndex(q => q.kind === ki && !(drive.train && drive.train.set === rail.sets.indexOf(q)));
      if (si < 0) return;
      const set = rail.sets[si], kind = TRAIN_KINDS[ki], pitchC = kind.L + kind.gap;
      rail.sets.forEach(o => { if (o !== set && o.live && o.line === d.li && Math.abs(((o.s - d.from.s) % line.length + line.length * 1.5) % line.length - line.length / 2) < 900) o.live = false; });
      const stopS = d.from.s + kind.cars * pitchC * 0.5;
      set.line = d.li; set.live = true; set.stop = { s: stopS, name: d.from.name, at: d.from.at };
      S.called = { set: si, d: d, at: performance.now() };
      if (!line.loop && stopS - 260 < 0) {
        // a terminus: the train is already in, doors open, waiting to leave
        set.s = stopS; set.v = 0; set.dwell = 45;
        say("The train for " + d.name + " is waiting at the platform, doors open. Walk up to it and press F.", 5);
      } else {
        set.s = stopS - 260; set.v = 16; set.dwell = 0;
        setTimeout(() => { if (S.called && S.called.d === d) say("♪ まもなく、電車が参ります。 The train for " + d.name + " is arriving. Please stand behind the yellow line.", 5); }, 2500);
      }
    } catch (e) { console.warn("[seamless] no train", e); }
  }
  // the trip goes with the train you get on, and the ride, the arrival and the story carry on as before
  wrap("boardTrain", orig => function (t) {
    const r = orig.apply(this, arguments);
    const C = S.called;
    if (C && t && t.set === C.set && drive.train) {
      drive.train.trip = C.d; railTrip.on = true; railTrip.dest = C.d; railTrip.t = 0; railTrip.jumped = false; railTrip.set = C.set;
      try { if (story.step === "out" || story.step === "late") storyToSoti(); } catch (e) { /* no story */ }
      S.called = null;
    }
    return r;
  });

  // off the platform and into the concourse: at the concourse end of either platform the glass doors slide and you walk in
  function platformTick() {
    if (interior.active || !player || player.mode !== "walk" || drive.car || drive.train || !player.onWalk) return;
    if (typeof cut === "object" && cut.active) return;
    const now = performance.now();
    if (S.onPlatform && now - S.onPlatform.at < 600) return;
    const list = (typeof shops === "object" && shops.list) || [];
    for (const s of list) {
      if (!s.station || !s.stationRef) continue;
      const F = frameOf(s.stationRef); if (!F) continue;
      if (Math.abs(F.t.x - player.pos.x) > 200 || Math.abs(F.t.z - player.pos.z) > 200) continue;
      const L = F.toL(player.pos.x, player.pos.z), ax = Math.abs(L[0]);
      if (ax < 2.6 || ax > 10.8) continue;
      const along = (L[1] - F.C.face) * F.C.fz;
      if (S.onPlatform && S.onPlatform.shop === s && !S.onPlatform.armed) { if (along > 3.0 || ax < 2.6 || ax > 10.8) S.onPlatform.armed = true; continue; }
      if (along > 2.4 || along < -1.5) continue;
      if (Math.abs(player.pos.y - (F.C.deckY || F.t.y + 1.15)) > 1.5) continue;
      S.fromPlatform = s;
      if (interiorEnter(s)) { S.onPlatform = null; return; }
      S.fromPlatform = null;
    }
  }
  function platformArrive(s, R) {
    // in through the passage, on the paid side of the gates, walking into the concourse
    const G = R.platformGate, gates = R.gates;
    if (!G || !gates) return;
    player.pos.set(R.ox + G.x, interior.floorY, R.oz - (R.D || 17) / 2 + 1.3); player.obj.position.copy(player.pos);
    player.yaw = player.targetYaw = 0; yaw = Math.PI; pitch = -0.2;
    camPos.set(player.pos.x, interior.floorY + 2.2, player.pos.z - 2.6); interiorClampCam(camPos); camera.position.copy(camPos);
    gates.paid = true; gates.ic = !!(wallet.ic);
    say("出口  Exit  ·  through the gates to the street.", 3.5);
  }

  // ---- photographing the street while you walk up --------------------------------------------------------------------------------
  let next = 0, target = null, frame = 0;
  function pick() {
    const list = (typeof shops === "object" && shops.list) || [];
    let best = null, bd = 1e9;
    for (const s of list) {
      if (!s.door || (typeof interiorSupports === "function" && !interiorSupports(s))) continue;
      const p = s.station ? capPoint(s) : null;
      const d = Math.hypot(s.door[0] - player.pos.x, s.door[1] - player.pos.z), d2 = p ? Math.hypot(p.x - player.pos.x, p.z - player.pos.z) - 30 : 1e9;
      const dd = Math.min(d, d2);
      if (dd < bd) { bd = dd; best = s; }
    }
    return bd < 24 ? best : null;
  }
  function tick() {
    requestAnimationFrame(tick);
    if (!ok() || !player || !player.placed) return;
    try {
      if (!interior.active) {
        if (S.inside && !(S.title && S.title.on)) hideAll();
        platformTick();
        // the called train holds its doors open for you (a minute and a half at most)
        const C = S.called;
        if (C) { const set = rail.sets[C.set]; if (!set || !set.live || performance.now() - C.at > 90000) S.called = null; else if (set.v < 0.4 && set.dwell > 0 && set.dwell < 4) set.dwell = 4; }
        const now = performance.now();
        if (now > next) { next = now + 400; target = pick(); }
        if (target && !(typeof cut === "object" && cut.active) && !(typeof title === "object" && title.on)) {
          const c = cubeFor(target, true);
          // retake it when the light has changed (half an hour of game time) or after two minutes
          if (c.done && (now - c.at > 120000 || Math.abs(gameMin() - (c.mins || 0)) > 30)) { c.done = false; c.face = 0; }
          if (!c.done && (frame++ & 1) === 0) step(c);
        }
      } else if (!S.inside) show(interior.room, interior.shop);
    } catch (e) { if (!S.err) { S.err = e; console.warn("[seamless]", e); } }
  }
  requestAnimationFrame(tick);

  // ---- the title: inside Tōkonto Central ----------------------------------------------------------------------------------------
  // The menu stays the departure board; behind it is the concourse of the central station, its commuters crossing to the gates, the
  // street through the glass and the light of the time of day through the roof. The camera drifts along the concourse as a tired
  // commuter's eyes would. (?titlestation=0 goes back to the view over the bay.)
  const T = S.title = { room: null, shop: null, on: false, t: 0 };
  const titleOff = /[?&]titlestation=0\b/.test(location.search);
  function titleRoom() {
    if (titleOff) return null;
    if (T.room) return T.room;
    try {
      const st = typeof stationShop === "function" ? stationShop() : null; if (!st) return null;
      const room = interiorStationLevel(st, (st.central || /central|中央/i.test(st.name || "")) ? 1 : 1);
      interiorPrepare(room); T.room = room; T.shop = st;
    } catch (e) { console.warn("[seamless] no station for the title", e); T.room = null; }
    return T.room;
  }
  function titleOn(R) {
    T.on = true; T.t = 0;
    R.group.visible = true;
    try { const c = cubeFor(T.shop, true); if (!c.done) finish(c); } catch (e) { /* the painted card stays */ }
    show(R, T.shop); S.inside = true;
    try { if (window.ShopAAA) { if (ShopAAA.rig) ShopAAA.rig(R.group); ShopAAA.enter(R); } } catch (e) { /* plain light */ }
    if (player && player.obj) { T.pvis = player.obj.visible; player.obj.visible = false; }
  }
  function titleOff_() {
    T.on = false;
    if (!(interior.active && interior.room === T.room) && T.room) T.room.group.visible = false;
    if (!interior.active) { try { if (window.ShopAAA) ShopAAA.leave(); } catch (e) { /* */ } hideAll(); }
    if (player && player.obj && T.pvis !== undefined) { player.obj.visible = T.pvis; T.pvis = undefined; }
  }
  wrap("updateTitle", orig => function (dt) {
    const R = !interior.active ? titleRoom() : null;
    if (!R) return orig.apply(this, arguments);
    if (!T.on) titleOn(R);
    title.t += dt; T.t += dt;
    const W = R.W || 24, D = R.D || 17, fy = interior.floorY, k = T.t * 0.035;
    // from the street end of the concourse, looking over the crowd at the gates and the passage to the platforms
    const x = R.ox + W * (0.18 + 0.1 * Math.sin(k)), z = R.oz + D * (0.32 - 0.05 * Math.cos(k * 0.8)), y = fy + 2.3 + 0.25 * Math.sin(k * 1.3);
    camPos.set(x, y, z); camera.position.copy(camPos);
    const G = R.gates || { x0: -W / 2 + 2, x1: -W / 2 + 7, z: -D / 2 + 4 };
    camera.lookAt(R.ox + (G.x0 + G.x1) / 2 + 3 * Math.sin(k * 0.6), fy + 2.6, R.oz + G.z - 1.5);
    yaw = Math.atan2(-(R.ox - x), -(R.oz - z)); pitch = -0.05;
    try { titleSky(title.t); } catch (e) { /* */ }
    try { if (window.ShopAAA) ShopAAA.inside(); } catch (e) { /* */ }
    if (R.glassRoof && typeof sunLight !== "undefined" && sunLight && typeof nightState === "object") sunLight.intensity = 0;
    try { inCrowdTick(R, dt); } catch (e) { /* an empty concourse */ }
    try { if (R.tick) R.tick(dt); } catch (e) { /* */ }
    present();
  });
  wrap("setTitle", orig => function (on) {
    const r = orig.apply(this, arguments);
    if (!on && T.on) titleOff_();
    return r;
  });

  S.capture = s => { const c = cubeFor(s, true); c.done = false; c.face = 0; finish(c); return c; };
  S.report = () => ({ version: S.version, cubes: S.cubes.size, inside: S.inside, size: cubeSize(), stats: Object.assign({}, S.stats), ticket: S.ticket && S.ticket.d.name });
  console.log("[seamless] " + S.version + " ready: walk-in doors, street views, station gates");
})();
