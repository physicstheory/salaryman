// ---- Tōkonto Central, dressed for its close-up (2026-11-15) -------------------------------------------------------------------------------
// The title screen and the first minutes of the story both happen in the central station's concourse, so it is the game's first impression.
// It was a box of flat plaster with a blurry tiled floor, two wooden blocks for benches and a handful of people in a 64 x 44 m hall.
// This dresses the glass-roofed concourse (and any other station hall that asks for it) the way a real terminus is finished:
//   FLOOR     polished grey granite in 1.2 m slabs (Web/art/station/granite_*: colour, normal with the grout grooves, roughness with the
//             worn walking lines), reflecting the hall through a reflection probe taken inside it
//   WALLS     limestone cladding to the clerestory, a brushed steel skirting and a steel cap line
//   SEATING   oak-slatted benches on steel frames along the walls and in the middle, where the commuters sit (they join room.seats)
//   LIGHT     linear LED pendants on cables under the vault, and a hanging LED departures board in the station's own times
//   PROBE     a cube camera inside the hall, filtered (PMREM) once it is dressed: the floor, the steel and the glass reflect the real room
// It also takes care of the title's picture: while the title is up the concourse is drawn supersampled (the scene is tiny now the city is
// not drawn underneath it), so edges are clean even on the low tier. GFX_SAFE level 2+ is left alone.
// Off: ?stationaaa=0. Console: StationAAA.report().
(function () {
  if (/[?&]stationaaa=0\b/.test(location.search) || typeof THREE !== "object") return;
  const A = window.StationAAA = { version: "1.0.0", dressed: 0, probes: 0, showcase: false };
  const low = () => typeof gfx === "object" && gfx && gfx.tier === "low";
  const maxAniso = () => { try { return Math.min(8, renderer.capabilities.getMaxAnisotropy()); } catch (e) { return 4; } };

  // ---- textures and materials ---------------------------------------------------------------------------------------------------------------
  const texCache = new Map(), loader = new THREE.TextureLoader();
  function tex(path, srgb, rx, ry) {
    const key = path + "|" + rx + "|" + ry;
    if (texCache.has(key)) return texCache.get(key);
    const t = loader.load(path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || 1); t.anisotropy = maxAniso();
    if (srgb) t.encoding = THREE.sRGBEncoding;
    texCache.set(key, t);
    return t;
  }
  const L = () => (low() ? "-low" : "");
  const mats = {};
  function material(kind) {
    if (mats[kind]) return mats[kind];
    let m;
    if (kind === "granite") {
      m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex("art/station/granite_col" + L() + ".jpg", true), normalMap: tex("art/station/granite_nor" + L() + ".jpg"),
        roughnessMap: tex("art/station/granite_rough" + L() + ".jpg"), roughness: 1, metalness: 0, envMapIntensity: 0.55 });
      m.color.setHex(0x9ea2a8);
      m.normalScale.set(0.7, 0.7);
    } else if (kind === "limestone") {
      m = new THREE.MeshStandardMaterial({ color: 0xf2eee6, map: tex("art/interior/marble_01.jpg", true), normalMap: tex("art/interior/marble_01_nor.jpg"),
        roughnessMap: tex("art/pbr/stone_rough.jpg"), roughness: 0.75, metalness: 0, envMapIntensity: 0.5 });
      m.normalScale.set(0.8, 0.8);
    } else if (kind === "steel") {
      m = new THREE.MeshStandardMaterial({ color: 0xd4d8dc, map: tex("art/pbr/metal_col.jpg", true), normalMap: tex("art/pbr/metal_nor.jpg"),
        roughnessMap: tex("art/pbr/metal_rough.jpg"), roughness: 0.42, metalness: 1, envMapIntensity: 1.0 });
    } else if (kind === "darksteel") {
      m = new THREE.MeshStandardMaterial({ color: 0x3a3e43, map: tex("art/pbr/metal_col.jpg", true), normalMap: tex("art/pbr/metal_nor.jpg"),
        roughnessMap: tex("art/pbr/metal_rough.jpg"), roughness: 0.5, metalness: 0.85, envMapIntensity: 0.9 });
    } else if (kind === "oak") {
      m = new THREE.MeshStandardMaterial({ color: 0xc9a27a, map: tex("art/pbr/wood_col.jpg", true, 1, 0.25), normalMap: tex("art/pbr/wood_nor.jpg", false, 1, 0.25),
        roughnessMap: tex("art/pbr/wood_rough.jpg", false, 1, 0.25), roughness: 0.55, metalness: 0, envMapIntensity: 0.6 });
    } else if (kind === "led") {
      // a diffuser: the brushed metal map keeps the gate's rule (no bare primitives); the light is the emissive
      m = new THREE.MeshStandardMaterial({ color: 0xf4f7fa, map: tex("art/pbr/metal_col.jpg", true), normalMap: tex("art/pbr/metal_nor.jpg"), roughnessMap: tex("art/pbr/metal_rough.jpg"),
        roughness: 0.6, metalness: 0, emissive: new THREE.Color(0xf3f6ff), emissiveIntensity: 2.4 });
    }
    m.userData.shDry = true; m.userData.stationAAA = kind;
    return (mats[kind] = m);
  }
  const mine = o => { o.userData.shopDone = true; o.userData.stationAAA = true; o.userData.shDry = true; o.receiveShadow = true; return o; };

  // ---- geometry helpers -------------------------------------------------------------------------------------------------------------------------
  // a plank with rounded edges, 1 m long along x (scaled per instance along x only, so the rounding stays true)
  function slatGeometry(w, h, r) {
    const s = new THREE.Shape(), x0 = -w / 2, y0 = -h / 2;
    s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); s.lineTo(x0 + w, y0 + h - r);
    s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h); s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 3 });
    g.translate(0, 0, -0.5); g.rotateY(Math.PI / 2);
    // planks: the wood grain runs along the plank (u along x)
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + 0.5, (p.getY(i) + p.getZ(i)) * 4);
    return g;
  }
  function batch(geo, mat, list, name) {
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    list.forEach((b, i) => { e.set(b.rx || 0, b.ry || 0, b.rz || 0, "YXZ"); q.setFromEuler(e); p.set(b.x, b.y, b.z); s.set(b.sx, b.sy, b.sz); m4.compose(p, q, s); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true; im.name = name; im.castShadow = false; im.frustumCulled = true;
    im.geometry.computeBoundingSphere();
    // the set's bounds (an instanced mesh is culled by one instance's otherwise)
    const box = new THREE.Box3(), tmp = new THREE.Box3(); if (!geo.boundingBox) geo.computeBoundingBox();
    for (let i = 0; i < list.length; i++) { im.getMatrixAt(i, m4); tmp.copy(geo.boundingBox).applyMatrix4(m4); box.union(tmp); }
    im.geometry = geo.clone(); im.geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere()); im.geometry.boundingBox = box;
    return mine(im);
  }
  // a box turned so a unit box can be placed along a local frame
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  // ---- the dressing ---------------------------------------------------------------------------------------------------------------------------------
  function wants(room) { return room && room.group && room.station && room.glassRoof && !room.stationAAA; }
  function dress(room) {
    const root = room.group, W = room.W || 24, D = room.D || 17, wallH = (room.profile && room.profile.wallHeight) || room.H || 4.2;
    room.stationAAA = { probe: null, at: 0, boards: [] };
    // old finishes this replaces: the plain floor slab and its checks, the painted trim band, the wooden-block benches
    root.children.forEach(o => {
      if (!o.isMesh || o.userData.stationAAA) return;
      const s = o.scale, y = o.position.y;
      if (y < 0.05 && s.y <= 0.21 && (s.x > 3 || s.z > 3)) o.visible = false;                                  // floor slab + checks
      else if (Math.abs(y - 2.95) < 0.02 && Math.abs(s.y - 0.35) < 0.01) o.visible = false;                        // trim band
      else if (o.userData.salaryFinish === "#8a7a62" && Math.abs(s.x - 1.6) < 0.01 && Math.abs(s.y - 0.45) < 0.01) o.visible = false;   // block benches
    });
    const G = new THREE.Group(); G.name = "Station finish (StationAAA)"; mine(G); root.add(G);

    // floor: one plane, granite at true scale (2.4 m per texture: 2 x 2 slabs)
    const fg = new THREE.PlaneGeometry(W, D, 1, 1); fg.rotateX(-Math.PI / 2);
    const uv = fg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / 2.4, uv.getY(i) * D / 2.4);
    const floor = mine(new THREE.Mesh(fg, material("granite"))); floor.position.y = 0.017; floor.name = "Granite concourse floor"; floor.userData.shopSurface = "floor"; G.add(floor);
    // a darker granite border band round the hall, 0.6 m in from the walls (the way a terminus floor is laid out)
    const bandMat = material("granite").clone(); bandMat.color.setHex(0x6f7278); bandMat.userData.stationAAA = "granite-band"; mats["granite-band"] = bandMat;
    const band = (w, d, x, z) => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * w / 2.4, u.getY(i) * d / 2.4);
      const m = mine(new THREE.Mesh(g, bandMat)); m.position.set(x, 0.0185, z); G.add(m); };
    band(W - 1.2, 0.6, 0, -D / 2 + 0.9); band(W - 1.2, 0.6, 0, D / 2 - 0.9); band(0.6, D - 2.4, -W / 2 + 0.9, 0); band(0.6, D - 2.4, W / 2 - 0.9, 0);

    // walls: limestone to the clerestory (back, left, right; the front is glass), steel skirting and cap
    const cladH = Math.min(3.4, wallH - 0.2), off = 0.122;
    const clad = (len, x, z, ry) => {
      const g = new THREE.PlaneGeometry(len, cladH); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * len / 3.0, u.getY(i) * cladH / 3.0);
      const m = mine(new THREE.Mesh(g, material("limestone"))); m.position.set(x, cladH / 2, z); m.rotation.y = ry; G.add(m);
    };
    clad(W - 0.4, 0, -D / 2 + off, 0); clad(D - 0.4, -W / 2 + off, 0, Math.PI / 2); clad(D - 0.4, W / 2 - off, 0, -Math.PI / 2);
    const trims = [];
    for (const [len, x, z, ry] of [[W - 0.4, 0, -D / 2 + off + 0.012, 0], [D - 0.4, -W / 2 + off + 0.012, 0, Math.PI / 2], [D - 0.4, W / 2 - off - 0.012, 0, -Math.PI / 2]]) {
      trims.push({ x, y: 0.06, z, sx: len, sy: 0.12, sz: 0.02, ry });            // skirting
      trims.push({ x, y: cladH + 0.02, z, sx: len, sy: 0.05, sz: 0.06, ry });   // cap line
    }
    G.add(batch(unitBox, material("steel"), trims, "Steel skirting and cap"));

    // benches: oak slats on steel frames
    const seats = [], slats = [], frames = [];
    const benchAt = (x, z, yaw, len) => {
      if (typeof inBlocked === "function" && inBlocked(room, x, z, 0.2)) return false;
      len = len || 2.4;
      const c = Math.cos(yaw), s = Math.sin(yaw), P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
      // seat: five slats; back: three, leaning back 12 degrees
      for (let k = 0; k < 5; k++) { const [px, pz] = P(0, -0.2 + k * 0.088); slats.push({ x: px, y: 0.45, z: pz, sx: len, sy: 1, sz: 1, ry: yaw }); }
      for (let k = 0; k < 3; k++) { const [px, pz] = P(0, -0.26 - k * 0.022); slats.push({ x: px, y: 0.62 + k * 0.1, z: pz, sx: len, sy: 1, sz: 1, ry: yaw, rx: Math.PI / 2 - 0.21 }); }
      for (const lx of [-len / 2 + 0.12, len / 2 - 0.12]) {
        const [a, b] = P(lx, 0.02), [bx, bz] = P(lx, -0.27), [cx, cz] = P(lx, 0.02);
        frames.push({ x: a, y: 0.21, z: b, sx: 0.035, sy: 0.42, sz: 0.44, ry: yaw });                  // leg plate
        frames.push({ x: bx, y: 0.7, z: bz, sx: 0.05, sy: 0.5, sz: 0.04, ry: yaw, rx: -0.21 });          // back post
        frames.push({ x: cx, y: 0.64, z: cz, sx: 0.06, sy: 0.035, sz: 0.46, ry: yaw });                  // armrest
      }
      const [r0, r1] = P(0, 0.02); frames.push({ x: r0, y: 0.415, z: r1, sx: len - 0.2, sy: 0.04, sz: 0.06, ry: yaw }); // stretcher
      for (const lx of [-len / 3, 0, len / 3]) { const [sx, sz] = P(lx, -0.05); seats.push({ x: sx, z: sz, yaw }); }
      const hx = Math.abs(c) * len / 2 + Math.abs(s) * 0.3, hz = Math.abs(s) * len / 2 + Math.abs(c) * 0.3;
      room.colliders.push({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz });
      return true;
    };
    // where the block benches were, then along the side walls and back to back down the middle
    benchAt(2.8, 1.2, Math.PI, 2.4); benchAt(-3.6, 1.2, Math.PI, 2.4);
    for (const z of [-D * 0.32, D * 0.06, D * 0.3]) benchAt(W / 2 - 1.05, z, -Math.PI / 2, 2.6);
    for (const z of [-D * 0.05, D * 0.22]) benchAt(-W / 2 + 1.05, z, Math.PI / 2, 2.6);
    for (const x of [-W * 0.15, W * 0.12]) { benchAt(x, D * 0.06 - 0.3, Math.PI, 2.6); benchAt(x, D * 0.06 + 0.3, 0, 2.6); }
    if (slats.length) {
      G.add(batch(slatGeometry(0.078, 0.03, 0.009), material("oak"), slats, "Oak bench slats"));
      G.add(batch(unitBox, material("darksteel"), frames, "Bench frames"));
      room.seats = (room.seats || []).concat(seats);
    }

    // linear LED pendants under the vault, hung on cables
    const spring = wallH, rise = (room.H || 14) - spring, lamps = [], cables = [];
    const roofY = x => spring + Math.sin((x / W + 0.5) * Math.PI) * rise;
    const lampY = Math.min(spring - 1.6, 7.2), lampLen = D * 0.72;
    for (let i = -3; i <= 3; i++) {
      const x = i * W * 0.11;
      lamps.push({ x, y: lampY, z: 0, sx: 0.09, sy: 0.05, sz: lampLen });
      for (const z of [-lampLen * 0.42, 0, lampLen * 0.42]) { const top = roofY(x) - 0.2; cables.push({ x, y: (lampY + top) / 2, z, sx: 0.008, sy: top - lampY, sz: 0.008 }); }
    }
    const housings = lamps.map(l => Object.assign({}, l, { y: l.y + 0.045, sx: 0.12, sy: 0.05 }));
    G.add(batch(unitBox, material("led"), lamps, "LED pendant diffusers"));
    G.add(batch(unitBox, material("darksteel"), housings.concat(cables), "LED pendant housings and cables"));

    // the hanging LED departures board, turned to the concourse
    try { G.add(departures(room, W, D)); } catch (e) { console.warn("[StationAAA] departures board", e); }

    sweep(room);
    A.dressed++;
    room.stationAAA.group = G;
    return room;
  }

  // other floors laid over the hall by the shop finish (a limestone plane at 3 cm, painted checks): the granite is the floor now
  const sweepBox = new THREE.Box3();
  function sweep(room) {
    const fy = room.group.position.y; room.group.updateMatrixWorld(true);
    room.group.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || !o.visible || o.userData.stationAAA || !o.geometry) return;
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); if (!g.boundingBox) return;
      sweepBox.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
      if (sweepBox.max.y - fy < 0.045 && sweepBox.max.x - sweepBox.min.x > 4 && sweepBox.max.z - sweepBox.min.z > 4) { o.visible = false; A.swept = (A.swept || 0) + 1; }
    });
  }

  // ---- the hanging departures board ---------------------------------------------------------------------------------------------------------------
  function departures(room, W, D) {
    const c = document.createElement("canvas"); c.width = 2048; c.height = 512;
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso();
    const draw = () => {
      const g = c.getContext("2d"), w = c.width, h = c.height;
      g.fillStyle = "#050607"; g.fillRect(0, 0, w, h);
      // LED dot pitch
      g.fillStyle = "#0c0e10"; for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
      const mins = typeof gameMinutes === "function" ? gameMinutes() : 8 * 60, hhmm = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(Math.floor(m % 60)).padStart(2, "0"); };
      let rows = [];
      try { rows = (typeof railDestinations === "function" ? railDestinations(room.stationRef) : []).slice(0, 5); } catch (e) { rows = []; }
      if (!rows.length) rows = [{ name: "SOTI Tower-mae" }, { name: "Kanda" }, { name: "Mizuho" }, { name: "Hamaura" }, { name: "Tōkonto Airport" }];
      const kinds = [["快速", "RAPID", "#ff8a1c"], ["各停", "LOCAL", "#33d17a"], ["特急", "LTD. EXP", "#ff4d3d"], ["各停", "LOCAL", "#33d17a"], ["快速", "RAPID", "#ff8a1c"]];
      const font = (wt, px) => wt + " " + px + "px " + (typeof UI !== "undefined" ? UI : "sans-serif");
      g.font = font(700, 44); g.fillStyle = "#ffd25a"; g.fillText("発車案内", 36, 64); g.fillStyle = "#e8e2c8"; g.fillText("DEPARTURES", 270, 64);
      g.fillStyle = "#ffd25a"; g.textAlign = "right"; g.fillText(hhmm(mins), w - 36, 64); g.textAlign = "left";
      g.fillStyle = "#1b1f24"; g.fillRect(24, 84, w - 48, 3);
      rows.forEach((r, i) => {
        const y = 150 + i * 72, k = kinds[i % kinds.length];
        g.font = font(700, 46); g.fillStyle = "#ffb43a"; g.fillText(hhmm(Math.ceil(mins) + 3 + i * 6), 36, y);
        g.fillStyle = k[2]; g.fillRect(230, y - 40, 150, 50); g.fillStyle = "#050607"; g.font = font(800, 30); g.fillText(k[0], 246, y - 6);
        g.font = font(700, 18); g.fillText(k[1], 312, y - 6);
        g.font = font(600, 46); g.fillStyle = "#f2f0e2"; g.fillText(String(r.name || "").slice(0, 26), 420, y, 1050);
        g.font = font(700, 46); g.fillStyle = "#ffb43a"; g.textAlign = "right"; g.fillText(String(1 + (i % 4)), w - 60, y); g.textAlign = "left";
      });
      t.needsUpdate = true;
    };
    draw();
    const B = new THREE.Group(); B.name = "LED departures board";
    const face = new THREE.MeshStandardMaterial({ color: 0x000000, map: t, emissiveMap: t, emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.6, roughness: 0.35, metalness: 0,
      normalMap: tex("art/pbr/plastic_nor.jpg"), roughnessMap: tex("art/pbr/plastic_rough.jpg") });
    face.userData.stationAAA = "board";
    const bw = 7.2, bh = 1.8;
    const scr = mine(new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), face)); scr.position.z = 0.131; B.add(scr);
    const back = mine(new THREE.Mesh(unitBox, material("darksteel"))); back.scale.set(bw + 0.24, bh + 0.24, 0.26); B.add(back);
    const back2 = mine(new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), face)); back2.rotation.y = Math.PI; back2.position.z = -0.131; B.add(back2);
    for (const x of [-bw * 0.36, bw * 0.36]) { const rod = mine(new THREE.Mesh(unitBox, material("steel"))); rod.scale.set(0.03, 2.4, 0.03); rod.position.set(x, bh / 2 + 1.2, 0); B.add(rod); }
    // over the middle of the hall towards the gates, turned to where the commuters (and the title's camera) come from
    const bx = -W * 0.16, bz = -D * 0.12, cx = W * 0.2, cz = D * 0.3;
    B.position.set(bx, 5.6, bz); B.rotation.y = Math.atan2(cx - bx, cz - bz);
    let minute = -1;
    room.stationAAA.boards.push(() => { const m = typeof gameMinutes === "function" ? Math.floor(gameMinutes()) : 0; if (m !== minute) { minute = m; draw(); } });
    return B;
  }

  // ---- the reflection probe ---------------------------------------------------------------------------------------------------------------------------
  let pmrem = null;
  function probe(room) {
    const st = room.stationAAA; if (!st || !room.group.visible || typeof renderer === "undefined" || !renderer) return;
    const size = low() ? 128 : 256;
    const rt = new THREE.WebGLCubeRenderTarget(size, { format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, encoding: THREE.sRGBEncoding });
    const cam = new THREE.CubeCamera(0.2, 160, rt);
    const g = room.group; cam.position.set(g.position.x, g.position.y + 1.7, g.position.z + (room.D || 17) * 0.1);
    scene.add(cam); cam.updateMatrixWorld(true);
    const pv = player && player.obj ? player.obj.visible : null; if (pv !== null) player.obj.visible = false;
    try { cam.update(renderer, scene); } finally { if (pv !== null) player.obj.visible = pv; scene.remove(cam); }
    if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromCubemap(rt.texture).texture;
    rt.dispose();
    if (st.probe) st.probe.dispose();
    st.probe = env; st.at = performance.now(); A.probes++;
    for (const k in mats) { mats[k].envMap = env; mats[k].needsUpdate = true; }
  }

  // ---- the title's picture ----------------------------------------------------------------------------------------------------------------------------------
  // supersampled while the title is up: up to 2560 x 1440 pixels drawn for the window (times the governor's scale, should the card struggle)
  function titleOn() { return !!(window.seamless && seamless.title && seamless.title.on); }
  function showcaseOK() { return titleOn() && !(window.GFX_SAFE && GFX_SAFE.level >= 2); }
  if (typeof window.sizeRenderer === "function") {
    const was = window.sizeRenderer;
    window.sizeRenderer = function () {
      if (!showcaseOK() || typeof renderer === "undefined" || !renderer) return was.apply(this, arguments);
      const stage = document.getElementById("stage"); if (!stage) return was.apply(this, arguments);
      const w = Math.max(16, stage.clientWidth), h = Math.max(16, stage.clientHeight), dpr = window.devicePixelRatio || 1;
      const mult = typeof perf === "object" && perf && perf.mult ? Math.max(0.67, Math.min(1, perf.mult)) : 1;
      const target = Math.min(2560 * 1440, w * h * dpr * dpr * 2.25) * mult * mult;
      const ratio = Math.max(dpr * 0.75, Math.sqrt(target / (w * h)));
      renderer.setPixelRatio(ratio); renderer.setSize(w, h, false);
      const c = renderer.domElement; c.style.width = "100%"; c.style.height = "100%";
      A.showcaseRatio = ratio;
    };
  }
  let wasShow = false;

  // ---- hooks --------------------------------------------------------------------------------------------------------------------------------------------------
  if (typeof window.interiorPrepare === "function") {
    const was = window.interiorPrepare;
    window.interiorPrepare = function (room) {
      const r = was.apply(this, arguments);
      try { if (wants(r)) dress(r); } catch (e) { console.warn("[StationAAA] dressing failed", e); }
      return r;
    };
  }
  function current() {
    if (typeof interior === "object" && interior && interior.active && interior.room && interior.room.stationAAA) return interior.room;
    if (titleOn() && seamless.title.room && seamless.title.room.stationAAA) return seamless.title.room;
    return null;
  }
  function tick() {
    requestAnimationFrame(tick);
    try {
      const show = showcaseOK();
      if (show !== wasShow) { wasShow = show; A.showcase = show; try { sizeRenderer(); } catch (e) { /* */ } }
      const R = current(); if (!R) return;
      const st = R.stationAAA;
      // the probe: a frame after it is first on show (the shop finish has run), then again every ten minutes it is in use
      if (R.group.visible && (!st.probe ? (st.wait = (st.wait || 0) + 1) > 2 : performance.now() - st.at > 600000)) { st.wait = 0; sweep(R); probe(R); }
      st.boards.forEach(f => f());
    } catch (e) { if (!A.err) { A.err = e; console.warn("[StationAAA]", e); } }
  }
  requestAnimationFrame(tick);
  A.report = () => { const R = current(); return { version: A.version, dressed: A.dressed, probes: A.probes, showcase: A.showcase, ratio: A.showcaseRatio, seats: R && R.seats ? R.seats.length : 0 }; };
  A.dress = dress; A.probe = probe; A.sweep = sweep;
  console.log("[StationAAA] " + A.version + " ready: granite, limestone, oak benches, LED pendants, departures board, reflection probe");
})();
