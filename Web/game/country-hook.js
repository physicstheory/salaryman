// The country: what stands at the places planCountry (konto.html) chose, and what there is to do at them.
//
// An audit of the map against the big open-world games found the towns dense and the countryside empty: grass, an expressway, and airfields,
// ski lifts and hot springs with no road to them. planCountry now lays an inland trunk road and a country road to each of those, and picks
// sites for 20-odd landmarks. This file builds them and gives the map something to find:
//
//   lighthouses on the capes (the lamp turns at night)        a wind farm on the open upland (the rotors turn)
//   summit shrines (make an offering)                         the broadcasting relay mast above the capital
//   lookouts (take in the view: it calms the nerves)          farms with paddies, tunnels and a barn (buy produce)
//   campgrounds (sit by the fire)                             Michi-no-Eki roadside stations (a hot bento)
//
// Each is a question mark on the map until Seiko has been there. A red daruma is hidden at every one of them, at every hot spring, ski
// summit, airfield and town, and round the capital: 60-odd in all, counted in the corner when you pick one up, paid for as you go and
// paid for handsomely when you have them all.
//
// Everything is drawn with the PBR kit (pbrMat: colour, normal and roughness, triplanar in world space), merged to one mesh per material
// per place. Dial 5550999 (or type LANDMARK) to be taken to the next one. Console: country.list(), country.go(i), country.found().
// Off switch: ?country=0.

(function () {
  if (/[?&]country=0\b/.test(location.search)) { console.log("[Konto] country landmarks turned off"); return; }
  if (typeof THREE === "undefined" || typeof pbrMat !== "function") { console.warn("[Konto] country: no PBR kit in this build"); return; }

  const C = window.country = { marks: [], daruma: [], found: {}, got: {}, list: () => C.marks.map((m, i) => i + " " + m.kind + " " + m.name + " @" + Math.round(m.x) + "," + Math.round(m.z) + (C.found[m.id] ? " (found)" : "")),
    go: i => goMark(i), status: () => ({ landmarks: C.marks.length, discovered: Object.keys(C.found).length, daruma: C.daruma.length, collected: Object.keys(C.got).length }) };
  const spin = [], lamps = [], fires = [], blink = [];
  let root = null, mats = null, goI = 0, lastAct = {}, hudEl = null, hudT = 0;
  const GLYPH = { lighthouse: "灯", windfarm: "風", shrine: "社", mast: "塔", lookout: "展", farm: "農", camp: "営", rest: "駅" };
  const KIND = { lighthouse: "Lighthouse", windfarm: "Wind farm", shrine: "Summit shrine", mast: "Relay mast", lookout: "Lookout", farm: "Farm", camp: "Campground", rest: "Roadside station" };
  const FIND_R = { lighthouse: 70, windfarm: 160, shrine: 45, mast: 70, lookout: 40, farm: 110, camp: 50, rest: 60 };

  // ---- materials: one set, shared by every place -----------------------------------------------------------------------------------
  function materials() {
    if (mats) return mats;
    const lamp = (hex, k) => { const m = new THREE.MeshStandardMaterial({ color: hex, emissive: new THREE.Color(hex), emissiveIntensity: k, roughness: 0.5 }); return m; };
    mats = {
      white: pbrMat("paint", 0xf1efe8), red: pbrMat("paint", 0xb02a1e), vermilion: pbrMat("paint", 0xc0381f), navy: pbrMat("paint", 0x1e3a5a), green: pbrMat("paint", 0x2f6a45),
      concrete: pbrMat("concrete", 0xbdb9b0), stone: pbrMat("stone", 0x9a968c), darkstone: pbrMat("stone", 0x6a6862), soil: pbrMat("stone", 0x6b5338),
      wood: pbrMat("wood", 0x8a6238), darkwood: pbrMat("wood", 0x4a3320), barn: pbrMat("wood", 0x7a3b2c), plaster: pbrMat("concrete", 0xe6e0d2),
      tile: pbrMat("tile", 0x2c2f36), metal: pbrMat("metal", 0x8d939c), galv: pbrMat("galv", 0xb9c0c6), asphalt: pbrMat("asphalt", 0x55565a), rubber: pbrMat("rubber", 0x1c1c1e),
      leaf: pbrMat("leaf", 0x6f9c3a), crop: pbrMat("leaf", 0x9fb04a), tentA: pbrMat("fabric", 0xd98a2b), tentB: pbrMat("fabric", 0x3f7f8f), tentC: pbrMat("fabric", 0x8fa04a), rope: pbrMat("fabric", 0xd8c9a0),
      plastic: pbrMat("plastic", 0xf4f6f8, { transparent: true, opacity: 0.72 }), vendR: pbrMat("plastic", 0xc9252c), vendB: pbrMat("plastic", 0x1f5fae), vendW: pbrMat("plastic", 0xf0f0ee),
      paddy: new THREE.MeshStandardMaterial({ color: 0x4f6f66, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.6 }),
      glass: lamp(0xffe2a8, 0.25), lantern: lamp(0xfff0c4, 0.9), ember: lamp(0xff6a1c, 1.2), beacon: lamp(0xff2a1a, 1.0), screen: lamp(0xcfe8ff, 0.5)
    };
    try { nightMats.push({ m: mats.glass, gain: 1.8, floor: 0.12 }, { m: mats.lantern, gain: 1.6, floor: 0.3 }, { m: mats.screen, gain: 1.2, floor: 0.35 }); } catch (e) { /* no night list */ }
    return mats;
  }

  // ---- a builder: primitives in a place's own frame, merged to one mesh per material ------------------------------------------------
  const GEO = {};
  const geo = (k, f) => GEO[k] || (GEO[k] = f().toNonIndexed());
  function gable(w, h, d) {
    const A = [-w / 2, 0, -d / 2], B = [w / 2, 0, -d / 2], Cc = [w / 2, 0, d / 2], D = [-w / 2, 0, d / 2], E = [-w / 2, h, 0], F = [w / 2, h, 0];
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute([].concat(A, E, F, A, F, B, D, Cc, F, D, F, E, A, D, E, B, F, Cc, A, B, Cc, A, Cc, D), 3)); g.computeVertexNormals(); return g;
  }
  function builder() {
    const by = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), v = new THREE.Vector3(), nm = new THREE.Matrix3();
    const add = (mat, g, x, y, z, sx, sy, sz, ry, rx, rz) => {
      let b = by.get(mat); if (!b) { b = { pos: [], nrm: [] }; by.set(mat, b); }
      e.set(rx || 0, ry || 0, rz || 0, "YXZ"); q.setFromEuler(e); m4.compose(p.set(x, y, z), q, s.set(sx, sy, sz)); nm.getNormalMatrix(m4);
      const P = g.attributes.position.array, N = g.attributes.normal.array;
      for (let i = 0; i < P.length; i += 3) { v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(m4); b.pos.push(v.x, v.y, v.z); v.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(nm).normalize(); b.nrm.push(v.x, v.y, v.z); }
    };
    const B = {
      box: (mat, w, h, d, x, y, z, ry, rx, rz) => add(mat, geo("box", () => new THREE.BoxGeometry(1, 1, 1)), x, y, z, w, h, d, ry, rx, rz),
      cyl: (mat, rt, rb, h, x, y, z, n, ry, rx, rz) => add(mat, geo("cyl" + (n || 16) + ":" + (rt / (rb || 1)).toFixed(3), () => new THREE.CylinderGeometry(rt / (rb || 1), 1, 1, n || 16)), x, y, z, rb || rt, h, rb || rt, ry, rx, rz),
      cone: (mat, r, h, x, y, z, n, ry) => add(mat, geo("cone" + (n || 16), () => new THREE.ConeGeometry(1, 1, n || 16)), x, y, z, r, h, r, ry),
      hip: (mat, w, h, d, x, y, z, ry) => add(mat, geo("hip", () => { const g = new THREE.ConeGeometry(0.7071, 1, 4); g.rotateY(Math.PI / 4); return g; }), x, y + h / 2, z, w, h, d, ry),
      gable: (mat, w, h, d, x, y, z, ry) => add(mat, geo("gable", () => gable(1, 1, 1)), x, y, z, w, h, d, ry),
      ball: (mat, r, x, y, z, sy) => add(mat, geo("ball", () => new THREE.SphereGeometry(1, 14, 10)), x, y, z, r, r * (sy || 1), r),
      dome: (mat, r, x, y, z, sy, sz, ry) => add(mat, geo("dome", () => new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2)), x, y, z, r, r * (sy || 1), r * (sz || 1), ry),
      tunnel: (mat, r, len, x, y, z, ry) => add(mat, geo("tunnel", () => { const g = new THREE.CylinderGeometry(1, 1, 1, 14, 1, false, 0, Math.PI); g.rotateZ(Math.PI / 2); g.rotateX(-Math.PI / 2); return g; }), x, y, z, len, r, r, ry),
      finish: (group, shadow) => { by.forEach((b, mat) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nrm, 3)); const o = new THREE.Mesh(g, mat); o.castShadow = shadow !== false; o.receiveShadow = true; group.add(o); }); by.clear(); return group; }
    };
    return B;
  }
  function sign(text, sub, w, h, bg, fg) {
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = Math.round(512 * h / w); const g = cv.getContext("2d");
    g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height); g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, cv.width - 16, cv.height - 16);
    const F = typeof JP !== "undefined" ? JP : "sans-serif"; g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    let px = Math.round(cv.height * (sub ? 0.4 : 0.52)); g.font = "800 " + px + "px " + F; while (g.measureText(text).width > cv.width - 44 && px > 14) { px -= 2; g.font = "800 " + px + "px " + F; }
    g.fillText(text, cv.width / 2, cv.height * (sub ? 0.38 : 0.52));
    if (sub) { let p2 = Math.round(cv.height * 0.2); g.font = "600 " + p2 + "px " + F; while (g.measureText(sub).width > cv.width - 44 && p2 > 10) { p2 -= 1; g.font = "600 " + p2 + "px " + F; } g.fillText(sub, cv.width / 2, cv.height * 0.76); }
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    // two faces back to back, so the text reads the right way round from either side
    const mat = new THREE.MeshBasicMaterial({ map: t }), pg = new THREE.PlaneGeometry(w, h), o = new THREE.Mesh(pg, mat), back = new THREE.Mesh(pg, mat);
    back.rotation.y = Math.PI; back.position.z = -0.02; o.add(back); return o;
  }
  // a name board on two posts, facing +z of the place
  function board(B, G, m, x, z, ry, w) {
    const M = mats; w = w || 3.4;
    B.box(M.darkwood, 0.14, 2.3, 0.14, x - w / 2 + 0.1, 1.15, z, ry); B.box(M.darkwood, 0.14, 2.3, 0.14, x + w / 2 - 0.1, 1.15, z, ry);
    const s = sign(m.jp || m.name, m.name, w, 1.1, "#f4efe2", "#2a2420"); s.position.set(x + Math.sin(ry) * 0.09, 1.7, z + Math.cos(ry) * 0.09); s.rotation.y = ry; G.add(s);
  }
  const gy = (x, z) => world.surfaceY ? world.surfaceY(x, z) : world.sampleHeight(x, z);
  function frame(m) {
    const cy = Math.cos(m.yaw), sy = Math.sin(m.yaw), y0 = gy(m.x, m.z);
    const W = (u, v) => [m.x + cy * u + sy * v, m.z - sy * u + cy * v];
    const G = new THREE.Group(); G.position.set(m.x, y0, m.z); G.rotation.y = m.yaw; root.add(G);
    const solid = (u, v, w, d, h) => { const q = W(u, v); solids.push({ c: [q[0], q[1]], size: [w, d], yaw: m.yaw * 180 / Math.PI, y: y0, h: h }); };
    // how far the ground at a local spot is above or below the pad
    const dy = (u, v) => { const q = W(u, v); return gy(q[0], q[1]) - y0; };
    return { G: G, W: W, y0: y0, solid: solid, dy: dy };
  }

  // ---- the places ---------------------------------------------------------------------------------------------------------------------
  const BUILD = {
    lighthouse(m) {
      const M = mats, F = frame(m), B = builder();
      B.cyl(M.concrete, 5.2, 5.6, 1.2, 0, 0.6, 0, 20);
      B.cyl(M.white, 2.9, 3.6, 7, 0, 4.7, 0, 20); B.cyl(M.red, 2.55, 2.9, 4, 0, 10.2, 0, 20); B.cyl(M.white, 2.2, 2.55, 5, 0, 14.7, 0, 20); B.cyl(M.red, 2.0, 2.2, 3, 0, 18.7, 0, 20); B.cyl(M.white, 1.9, 2.0, 2.4, 0, 21.4, 0, 20);
      B.cyl(M.metal, 3.3, 3.0, 0.3, 0, 22.75, 0, 20);
      for (let k = 0; k < 16; k++) { const a = k / 16 * 6.2832; B.box(M.metal, 0.07, 1.1, 0.07, Math.cos(a) * 3.15, 23.45, Math.sin(a) * 3.15); B.box(M.metal, 1.26, 0.06, 0.06, Math.cos(a + 0.196) * 3.1, 24.0, Math.sin(a + 0.196) * 3.1, -(a + 0.196) + Math.PI / 2); }
      B.cyl(M.lantern, 1.7, 1.7, 2.6, 0, 24.2, 0, 12);
      for (let k = 0; k < 12; k++) { const a = k / 12 * 6.2832; B.box(M.metal, 0.09, 2.6, 0.09, Math.cos(a) * 1.74, 24.2, Math.sin(a) * 1.74); }
      B.cone(M.red, 2.3, 1.7, 0, 26.35, 0, 16); B.ball(M.metal, 0.3, 0, 27.3, 0); B.cyl(M.metal, 0.03, 0.03, 1.6, 0, 28.1, 0, 6);
      B.box(M.navy, 1.1, 2.1, 0.12, 0, 2.25, 3.52); B.box(M.concrete, 2.2, 0.3, 1.4, 0, 1.2, 4.1);
      for (const h of [6, 11, 16]) B.box(M.glass, 0.6, 0.9, 0.1, 0, h, 3.25 - (h - 4.7) * 0.08);
      // the keeper's house and the fog-signal store
      B.box(M.stone, 9.6, 0.5, 6.6, -11, 0.25, 2); B.box(M.white, 9, 3.2, 6, -11, 2.1, 2); B.hip(M.tile, 10.4, 2.4, 7.4, -11, 3.7, 2);
      B.box(M.navy, 1, 2, 0.1, -11, 1.5, 5.03); for (const u of [-13.6, -8.4]) B.box(M.glass, 1.3, 1.1, 0.1, u, 2.3, 5.03);
      B.box(M.concrete, 4, 2.6, 3.4, 9, 1.3, -2); B.gable(M.galv, 4.4, 1.0, 3.9, 9, 2.6, -2); B.cyl(M.metal, 0.5, 0.3, 1.2, 9, 3.4, -0.3, 10, 0, Math.PI / 2);
      // the wall round the yard, open to the road side
      for (const u of [-17, 14]) B.box(M.white, 0.4, 1.1, 18, u, 0.55, 0); B.box(M.white, 31, 1.1, 0.4, -1.5, 0.55, 9);
      board(B, F.G, m, 5.5, -9.5, Math.PI, 3.6);
      B.finish(F.G); F.solid(0, 0, 7.2, 7.2, 27); F.solid(-11, 2, 9.2, 6.2, 5.5); F.solid(9, -2, 4.2, 3.6, 3.2);
      // the light: two beams, turned at night
      const beam = new THREE.Group(); beam.position.set(0, 24.3, 0);
      const bm = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      for (const sgn of [1, -1]) { const g = new THREE.ConeGeometry(9, 170, 14, 1, true); g.translate(0, -85, 0); const c = new THREE.Mesh(g, bm); c.rotation.z = sgn * Math.PI / 2; c.frustumCulled = false; beam.add(c); }
      F.G.add(beam); lamps.push({ beam: beam, mat: bm, ph: m.x * 0.01 });
      m.act = null; m.spot = F.W(0, 6);
    },
    windfarm(m) {
      const M = mats, F = frame(m), B = builder();
      // the substation at the middle
      B.box(M.concrete, 12, 0.3, 9, 0, 0.15, 0); B.box(M.galv, 5, 3, 3.2, -2, 1.8, -1); B.gable(M.galv, 5.4, 0.7, 3.6, -2, 3.3, -1);
      for (const u of [2.6, 4.4]) { B.box(M.metal, 1.3, 1.9, 1.5, u, 1.25, -1.2); for (const w of [-0.4, 0, 0.4]) B.cyl(M.white, 0.09, 0.12, 0.7, u + w, 2.55, -1.2, 8); }
      for (let k = 0; k < 14; k++) { const u = -6 + k * 0.92; B.box(M.metal, 0.06, 2.1, 0.06, u, 1.05, 4.5); B.box(M.metal, 0.06, 2.1, 0.06, u, 1.05, -4.5); }
      for (let k = 0; k < 10; k++) { const v = -4.5 + k; B.box(M.metal, 0.06, 2.1, 0.06, -6, 1.05, v); B.box(M.metal, 0.06, 2.1, 0.06, 6, 1.05, v); }
      for (const h of [0.5, 1.2, 2.0]) { B.box(M.metal, 12, 0.04, 0.04, 0, h, 4.5); B.box(M.metal, 12, 0.04, 0.04, 0, h, -4.5); B.box(M.metal, 0.04, 0.04, 9, -6, h, 0); B.box(M.metal, 0.04, 0.04, 9, 6, h, 0); }
      board(B, F.G, m, 0, 8, 0, 4.4);
      B.finish(F.G); F.solid(0, 0, 12, 9, 2.4);
      // the turbines: 78 m to the hub, 41 m blades, each on its own ground
      const blade = geo("blade", () => { const g = new THREE.BoxGeometry(1, 1, 1); const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const t = P.getY(i) + 0.5; P.setX(i, P.getX(i) * (1 - t * 0.72)); P.setZ(i, P.getZ(i) * (1 - t * 0.6)); } g.translate(0, 0.5, 0); g.computeVertexNormals(); return g; });
      (m.turbines || []).forEach((t, k) => {
        const T = new THREE.Group(), ty = gy(t[0], t[1]); T.position.set(t[0], ty, t[1]); T.rotation.y = m.yaw + Math.PI / 2 + 0.25; root.add(T);
        const b = builder(); b.cyl(M.concrete, 3.2, 3.6, 1.0, 0, 0.5, 0, 16); b.cyl(M.white, 1.25, 2.2, 78, 0, 40, 0, 18); b.box(M.white, 3.4, 3.4, 10, 0, 79.6, -1.4); b.box(M.navy, 3.44, 0.5, 10.04, 0, 78.6, -1.4); b.ball(M.beacon, 0.28, 0, 81.5, -4.5);
        b.finish(T); solids.push({ c: [t[0], t[1]], size: [4.4, 4.4], yaw: 0, y: ty, h: 80 });
        const R = new THREE.Group(); R.position.set(0, 79.6, 4.6); const rb = builder(); rb.ball(M.white, 1.7, 0, 0, 0, 1); rb.cone(M.white, 1.5, 2.6, 0, 0, 1.2, 12);
        rb.finish(R, false);
        for (let i = 0; i < 3; i++) { const o = new THREE.Mesh(blade, M.white); o.scale.set(3.4, 41, 0.7); o.rotation.z = i * 2.0944; o.castShadow = true; R.add(o); }
        T.add(R); spin.push({ o: R, w: 0.9 + (k % 4) * 0.07, a: k * 1.3 });
      });
      m.act = null; m.spot = F.W(0, 9);
    },
    shrine(m) {
      const M = mats, F = frame(m), B = builder();
      // the approach: steps, the torii, lanterns, and the hall on its stone base
      for (let k = 0; k < 4; k++) B.box(M.stone, 4.4, 0.22, 0.9, 0, 0.11 + k * 0.0, 10.5 - k * 0.9 + 1.4);
      B.box(M.stone, 3.2, 0.12, 12, 0, 0.06, 4.6);
      for (const u of [-2.3, 2.3]) { B.cyl(M.vermilion, 0.3, 0.36, 5.2, u, 2.6, 8.4, 14); B.cyl(M.darkstone, 0.5, 0.55, 0.5, u, 0.25, 8.4, 14); }
      B.box(M.vermilion, 6.6, 0.36, 0.5, 0, 5.3, 8.4); B.box(M.darkwood, 7.4, 0.3, 0.72, 0, 5.63, 8.4); B.box(M.vermilion, 5.4, 0.32, 0.36, 0, 4.25, 8.4); B.box(M.vermilion, 0.3, 0.75, 0.3, 0, 4.78, 8.4);
      B.cyl(M.rope, 0.09, 0.09, 4.4, 0, 3.95, 8.4, 8, 0, 0, Math.PI / 2); for (const u of [-1.2, 0, 1.2]) B.box(M.white, 0.22, 0.5, 0.02, u, 3.62, 8.42);
      for (const u of [-2.6, 2.6]) { B.box(M.stone, 0.8, 0.3, 0.8, u, 0.15, 4.4); B.cyl(M.stone, 0.16, 0.2, 1.3, u, 0.95, 4.4, 8); B.box(M.stone, 0.62, 0.14, 0.62, u, 1.67, 4.4); B.box(M.lantern, 0.42, 0.42, 0.42, u, 1.95, 4.4); B.hip(M.stone, 0.95, 0.36, 0.95, u, 2.16, 4.4); }
      B.box(M.darkstone, 7.6, 0.8, 6.4, 0, 0.4, -1.6); B.box(M.stone, 2.6, 0.26, 0.5, 0, 0.13, 2.1); B.box(M.stone, 2.6, 0.52, 0.5, 0, 0.26, 1.7);
      for (const u of [-2.7, 2.7]) for (const v of [-3.9, 0.6]) B.cyl(M.darkwood, 0.16, 0.16, 3.0, u, 2.3, v, 10);
      B.box(M.plaster, 5, 2.6, 3.6, 0, 2.1, -2.2); B.box(M.darkwood, 5.5, 0.18, 4.6, 0, 3.5, -1.65); B.box(M.darkwood, 1.7, 2.2, 0.1, 0, 1.9, -0.38); for (const u of [-1.9, 1.9]) B.box(M.darkwood, 0.12, 2.6, 0.12, u, 2.1, -0.38);
      B.gable(M.tile, 7.2, 2.3, 6.6, 0, 3.6, -1.65, Math.PI / 2); B.box(M.tile, 0.3, 0.3, 7.4, 0, 5.95, -1.65);
      for (const v of [-4.7, 1.4]) { B.box(M.darkwood, 0.2, 1.5, 0.12, 0.42, 6.35, v, 0, 0, 0.5); B.box(M.darkwood, 0.2, 1.5, 0.12, -0.42, 6.35, v, 0, 0, -0.5); }
      // the offering box, the bell rope, the summit stone
      B.box(M.darkwood, 1.5, 0.75, 0.8, 0, 1.18, 0.75); for (let k = 0; k < 6; k++) B.box(M.wood, 0.05, 0.04, 0.8, -0.6 + k * 0.24, 1.57, 0.75);
      B.cyl(M.rope, 0.05, 0.05, 1.9, 0, 2.6, 0.9, 6); B.ball(M.metal, 0.17, 0, 3.6, 0.9);
      B.box(M.stone, 0.42, 1.5, 0.42, 4.6, 0.75, 6.6); B.box(M.darkstone, 0.9, 0.3, 0.9, 4.6, 0.15, 6.6);
      board(B, F.G, m, -4.8, 7.4, 0.5, 3.2);
      B.finish(F.G); F.solid(0, -2.2, 5.2, 3.8, 6); F.solid(-2.3, 8.4, 0.8, 0.8, 5.6); F.solid(2.3, 8.4, 0.8, 0.8, 5.6); F.solid(0, 0.75, 1.5, 0.8, 1.4);
      m.act = { at: F.W(0, 1.9), r: 2.6, text: "Make an offering · ¥100", fn: () => offering(m) }; m.spot = F.W(3, 6);
    },
    mast(m) {
      const M = mats, F = frame(m), B = builder(), Hh = 96, sec = 12;
      const hw = y => 5.2 - 4.2 * Math.min(1, y / Hh);
      B.box(M.concrete, 13, 0.5, 13, 0, 0.25, 0);
      for (let k = 0; k < Hh / sec; k++) {
        const y0 = 0.5 + k * sec, y1 = y0 + sec, a = hw(y0 - 0.5), b = hw(y1 - 0.5), mat = k % 2 ? M.white : M.red, len = Math.hypot(sec, a - b), tilt = Math.atan2(a - b, sec);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(mat, 0.34, len, 0.34, sx * (a + b) / 2, (y0 + y1) / 2, sz * (a + b) / 2, 0, -sz * tilt, sx * tilt);
        for (const s of [-1, 1]) { B.box(mat, 2 * b, 0.2, 0.2, 0, y1, s * b); B.box(mat, 0.2, 0.2, 2 * b, s * b, y1, 0); const dl = Math.hypot(sec, a + b), da = Math.atan2(a + b, sec); B.box(mat, 0.16, dl, 0.16, 0, (y0 + y1) / 2, s * (a + b) / 2, 0, 0, (k % 2 ? 1 : -1) * da); B.box(mat, 0.16, dl, 0.16, s * (a + b) / 2, (y0 + y1) / 2, 0, 0, (k % 2 ? 1 : -1) * da, 0); }
      }
      for (const y of [36.5, 60.5, 84.5]) { const a = hw(y) + 1.3; B.box(M.galv, a * 2, 0.14, a * 2, 0, y, 0); for (const s of [-1, 1]) { B.box(M.metal, a * 2, 0.06, 0.06, 0, y + 1.1, s * a); B.box(M.metal, 0.06, 0.06, a * 2, s * a, y + 1.1, 0); } }
      for (const d of [[48, 2.2, 1], [52, 1.6, -1], [70, 1.8, 1], [74, 1.2, -1]]) { const a = hw(d[0]) + 0.6; B.cyl(M.white, d[1], d[1], 0.7, d[2] * a, d[0], 0, 16, 0, 0, Math.PI / 2); B.cyl(M.white, d[1] * 0.8, d[1] * 0.8, 0.7, 0, d[0] + 3, -d[2] * a, 16, 0, Math.PI / 2, 0); }
      B.cyl(M.white, 0.22, 0.4, 14, 0, Hh + 7.5, 0, 10); B.cyl(M.red, 0.12, 0.22, 8, 0, Hh + 18.5, 0, 8);
      for (const y of [36.9, 60.9, 84.9, Hh + 22.6]) for (const s of [-1, 1]) B.ball(M.beacon, 0.3, s * (y > Hh ? 0 : hw(y) + 1.2), y, s * (y > Hh ? 0 : hw(y) + 1.2));
      // the transmitter hall and the compound
      B.box(M.concrete, 9, 3.4, 5.4, -1, 2.2, -11); B.box(M.galv, 9.6, 0.3, 6, -1, 4.05, -11); B.box(M.navy, 1.1, 2.1, 0.1, -3, 1.55, -8.28); B.box(M.metal, 2.2, 1.4, 1.2, 2, 4.9, -11);
      for (let k = 0; k < 4; k++) B.box(M.galv, 0.3, 0.2, 9, -1.5 + k * 0.4, 3.6 - k * 0.02, -4.5);
      for (const s of [-1, 1]) { for (let k = 0; k <= 16; k++) { B.box(M.metal, 0.07, 2.3, 0.07, -10 + k * 1.25, 1.65, s * 10 - (s < 0 ? 5 : 0)); } B.box(M.metal, 20, 0.05, 0.05, 0, 2.7, s * 10 - (s < 0 ? 5 : 0)); B.box(M.metal, 20, 0.05, 0.05, 0, 1.4, s * 10 - (s < 0 ? 5 : 0)); }
      board(B, F.G, m, 6.5, 12.5, 0, 4.2);
      B.finish(F.G); for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.solid(sx * 5, sz * 5, 0.9, 0.9, 14); F.solid(-1, -11, 9.2, 5.6, 4.2);
      m.act = null; m.spot = F.W(0, 9);
    },
    lookout(m) {
      const M = mats, F = frame(m), B = builder();
      // a lay-by, a pavilion, and a deck out over the drop
      B.box(M.asphalt, 15, 0.14, 9, 0, 0.07, -9); for (let k = 0; k < 5; k++) B.box(M.white, 0.12, 0.02, 4.4, -5 + k * 2.5, 0.15, -10.4); B.box(M.concrete, 15.6, 0.22, 0.3, 0, 0.11, -4.4);
      const drop = Math.min(0, F.dy(0, 9));
      B.box(M.wood, 9, 0.2, 7, 0, 0.3, 5); for (let k = 0; k < 9; k++) B.box(M.darkwood, 0.04, 0.21, 7, -4 + k, 0.3, 5);
      for (const u of [-4, 0, 4]) for (const v of [2, 5, 8]) B.box(M.darkwood, 0.28, 2.2 - drop, 0.28, u, -0.9 + drop / 2, v);
      for (let k = 0; k <= 6; k++) { B.box(M.darkwood, 0.12, 1.15, 0.12, -4.4 + k * 1.467, 0.95, 8.4); if (k < 5) { B.box(M.darkwood, 0.12, 1.15, 0.12, -4.4, 0.95, 1.6 + k * 1.7); B.box(M.darkwood, 0.12, 1.15, 0.12, 4.4, 0.95, 1.6 + k * 1.7); } }
      for (const h of [0.95, 1.5]) { B.box(M.wood, 8.9, 0.1, 0.14, 0, h, 8.4); B.box(M.wood, 0.14, 0.1, 6.9, -4.4, h, 5); B.box(M.wood, 0.14, 0.1, 6.9, 4.4, h, 5); }
      // coin binoculars, benches, the table that names what you can see
      for (const u of [-2.4, 2.4]) { B.cyl(M.metal, 0.07, 0.11, 1.25, u, 1.02, 7.6, 10); B.box(M.navy, 0.42, 0.26, 0.5, u, 1.72, 7.6, 0, -0.12); B.cyl(M.metal, 0.09, 0.09, 0.12, u - 0.1, 1.72, 7.9, 8, 0, Math.PI / 2); B.cyl(M.metal, 0.09, 0.09, 0.12, u + 0.1, 1.72, 7.9, 8, 0, Math.PI / 2); }
      for (const u of [-2.6, 2.6]) { B.box(M.wood, 1.9, 0.08, 0.5, u, 0.86, 3.2); B.box(M.wood, 1.9, 0.5, 0.07, u, 1.18, 2.96, 0, -0.15); for (const w of [-0.8, 0.8]) B.box(M.metal, 0.07, 0.46, 0.44, u + w, 0.63, 3.2); }
      B.cyl(M.stone, 0.5, 0.6, 0.8, 0, 0.8, 6.4, 10); B.cyl(M.metal, 0.75, 0.75, 0.06, 0, 1.24, 6.4, 20, 0, -0.25);
      // the azumaya
      for (const u of [-1.9, 1.9]) for (const v of [-1.9, 1.9]) B.box(M.darkwood, 0.2, 2.7, 0.2, 7.5 + u, 1.35, -1 + v);
      B.hip(M.tile, 5.6, 1.5, 5.6, 7.5, 2.7, -1); B.box(M.wood, 2.6, 0.08, 0.5, 7.5, 0.5, -2.4); B.box(M.wood, 2.6, 0.08, 0.5, 7.5, 0.5, 0.4); B.box(M.stone, 4.4, 0.12, 4.4, 7.5, 0.06, -1);
      board(B, F.G, m, -6.2, -3.6, 0, 3.4);
      B.finish(F.G); for (const v of [2.4, 5, 7.6]) { F.solid(-4.4, v, 0.3, 2.6, 1.6); F.solid(4.4, v, 0.3, 2.6, 1.6); } F.solid(0, 8.4, 9, 0.3, 1.6);
      // the deck is a floor you can stand on over the drop
      try { const q = F.W(0, 5); if (world.walk) world.walk.push({ cx: q[0], cz: q[1], c: Math.cos(m.yaw), s: Math.sin(m.yaw), hw: 4.5, hl: 3.5, ya: F.y0 + 0.4, yb: F.y0 + 0.4, r: 6.5, country: true }); } catch (e) { /* no walk decks */ }
      m.act = { at: F.W(0, 6.4), r: 3.4, text: "Take in the view", fn: () => view(m) }; m.spot = F.W(0, 0);
    },
    farm(m) {
      const M = mats, F = frame(m), B = builder(), rice = [];
      // the yard by the road: house, barn, silo, tunnels, a shed with the tractor in it
      B.box(M.stone, 12.6, 0.4, 8.6, -16, 0.2, 48); B.box(M.plaster, 12, 3.1, 8, -16, 1.95, 48); B.hip(M.tile, 13.6, 2.6, 9.6, -16, 3.5, 48); B.box(M.darkwood, 1.5, 2.1, 0.1, -16, 1.45, 52.03);
      for (const u of [-20, -12]) { B.box(M.glass, 1.8, 1.2, 0.1, u, 2.1, 52.03); B.box(M.darkwood, 2.0, 0.1, 0.14, u, 1.45, 52.05); }
      B.box(M.wood, 12, 0.14, 1.6, -16, 0.55, 52.9); for (const u of [-21.6, -10.4]) B.box(M.darkwood, 0.14, 2.4, 0.14, u, 1.6, 53.5); B.box(M.tile, 12.6, 0.1, 2.2, -16, 2.85, 53.0, 0, 0.18);
      B.box(M.barn, 10, 5, 15, 8, 2.5, 46); B.gable(M.galv, 10.8, 3.0, 15.8, 8, 5, 46, Math.PI / 2); B.box(M.darkwood, 3.6, 3.6, 0.14, 8, 1.8, 53.55); B.box(M.white, 3.9, 0.16, 0.16, 8, 3.7, 53.57); for (const s of [-1, 1]) B.box(M.white, 0.16, 5.1, 0.16, 8 + s * 1.3, 1.8, 53.6, 0, 0, s * 0.62);
      B.cyl(M.galv, 2.3, 2.3, 9, 17.5, 4.5, 50, 18); B.cone(M.galv, 2.5, 1.5, 17.5, 9.75, 50, 18); B.box(M.metal, 0.3, 9, 0.3, 19.9, 4.5, 50);
      for (let k = 0; k < 3; k++) { const u = 30 + k * 8.2; B.tunnel(M.plastic, 3.2, 26, u, 0.1, 34, Math.PI / 2); for (let j = 0; j < 7; j++) B.box(M.metal, 6.5, 0.07, 0.07, u, 0.05 + 3.1, 22 + j * 4, 0, 0, 0); for (let j = 0; j < 2; j++) for (let r = 0; r < 11; r++) B.box(M.leaf, 1.6, 0.5, 1.5, u - 1.5 + j * 3, 0.35, 23 + r * 2.2); }
      for (const u of [-3, 3]) for (const v of [-2.4, 2.4]) B.box(M.metal, 0.16, 3.2, 0.16, -34 + u, 1.6, 47 + v); B.box(M.galv, 7.4, 0.12, 6.2, -34, 3.3, 47, 0, 0, 0.06);
      // the tractor: chassis, bonnet, cab frame, big rear wheels
      B.box(M.red, 1.3, 0.9, 2.4, -34, 1.25, 47.6); B.box(M.red, 1.5, 0.7, 1.4, -34, 1.1, 45.9); for (const u of [-0.6, 0.6]) for (const v of [45.3, 46.5]) B.box(M.metal, 0.07, 1.5, 0.07, -34 + u, 2.2, v); B.box(M.metal, 1.4, 0.08, 1.4, -34, 2.95, 45.9);
      for (const s of [-1, 1]) { B.cyl(M.rubber, 0.78, 0.78, 0.45, -34 + s * 0.95, 0.78, 46.0, 16, 0, 0, Math.PI / 2); B.cyl(M.rubber, 0.46, 0.46, 0.3, -34 + s * 0.8, 0.46, 48.4, 14, 0, 0, Math.PI / 2); }
      // the gate and the track in
      B.box(M.asphalt, 6, 0.1, 22, 0, 0.05, 58); for (const u of [-3.6, 3.6]) B.box(M.darkwood, 0.3, 2.2, 0.3, u, 1.1, 61);
      // the paddies: water between earth banks, rice in rows, stepped to the ground
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const u = -44 + i * 44, v = -62 + j * 32, d = F.dy(u, v);
        if (Math.abs(d) > 6) continue;
        const dry = (i + j * 2 + (m.x | 0)) % 4 === 0;
        B.box(M.soil, 41, 0.9, 29, u, d - 0.3, v); B.box(dry ? M.crop : M.paddy, 39, 0.08, 27, u, d + 0.2, v);
        for (const s of [-1, 1]) { B.box(M.soil, 41.6, 0.5, 1.0, u, d + 0.25, v + s * 14.5); B.box(M.soil, 1.0, 0.5, 29, u + s * 20.5, d + 0.25, v); }
        if (!dry) for (let a = 0; a < 26; a++) for (let b = 0; b < 12; b++) rice.push(u - 18.6 + a * 1.5 + ((b * 7 + a * 3) % 5) * 0.05, d + 0.24, v - 12.4 + b * 2.2);
      }
      for (let k = 0; k < 9; k++) { const u = -62 + k * 15.5; B.cyl(M.darkwood, 0.12, 0.14, 7, u, 3.5, 20, 6); if (k < 8) B.box(M.rubber, 15.5, 0.03, 0.03, u + 7.75, 6.7, 20); }
      board(B, F.G, m, 7, 62.5, 0, 3.6);
      B.finish(F.G);
      if (rice.length) {
        const g = new THREE.ConeGeometry(0.34, 0.75, 5), im = new THREE.InstancedMesh(g, M.leaf, rice.length / 3), t = new THREE.Matrix4();
        for (let i = 0; i < rice.length; i += 3) { t.makeTranslation(rice[i], rice[i + 1] + 0.38, rice[i + 2]); im.setMatrixAt(i / 3, t); }
        im.instanceMatrix.needsUpdate = true; im.receiveShadow = true; F.G.add(im); m.rice = im;
      }
      F.solid(-16, 48, 12.2, 8.2, 6); F.solid(8, 46, 10.2, 15.2, 8); F.solid(17.5, 50, 4.6, 4.6, 10); for (let k = 0; k < 3; k++) F.solid(30 + k * 8.2, 34, 6.4, 26, 3.2); F.solid(-34, 47, 1.8, 4, 2.6);
      m.act = { at: F.W(-16, 54.4), r: 3.2, text: "Buy vegetables at the farm door · ¥300", fn: () => buy(m, 300, "A bag of the morning's vegetables.", 0.12, 0.05) }; m.spot = F.W(0, 57);
    },
    camp(m) {
      const M = mats, F = frame(m), B = builder();
      // tents round a fire, tables, a wash house, a notice
      const tents = [[-9, 3, 0.4, M.tentA], [-4, -8, 1.3, M.tentB], [7, -7, -0.8, M.tentC], [11, 2, 2.4, M.tentA], [3, 11, 3.6, M.tentB], [-10, -4, 0.9, M.tentC]];
      tents.forEach(t => { const d = F.dy(t[0], t[1]); B.dome(t[3], 1.9, t[0], d + 0.02, t[1], 0.72, 1.25, t[2]); B.box(M.rope, 4.2, 0.03, 5.4, t[0], d + 0.03, t[1], t[2]); B.box(M.rubber, 0.9, 1.0, 0.04, t[0] + Math.sin(t[2]) * 2.36, d + 0.5, t[1] + Math.cos(t[2]) * 2.36, t[2]); F.solid(t[0], t[1], 3.4, 4.4, 1.3); });
      for (let k = 0; k < 10; k++) { const a = k / 10 * 6.2832; B.ball(M.darkstone, 0.26 + (k % 3) * 0.05, Math.cos(a) * 1.05, 0.14, Math.sin(a) * 1.05, 0.7); }
      for (let k = 0; k < 4; k++) B.cyl(M.darkwood, 0.09, 0.11, 1.3, 0, 0.42, 0, 7, k * 0.785, 0.95, 0); B.cone(M.ember, 0.42, 0.9, 0, 0.5, 0, 7); B.ball(M.ember, 0.34, 0, 0.16, 0, 0.5);
      for (let k = 0; k < 4; k++) { const a = k * 1.571 + 0.5; B.cyl(M.wood, 0.24, 0.26, 1.9, Math.cos(a) * 2.7, 0.26, Math.sin(a) * 2.7, 9, -a, 0, Math.PI / 2); }
      for (const t of [[-3, 6.5, 0.3], [6, 5, -0.5]]) { B.box(M.wood, 2.0, 0.07, 0.9, t[0], 0.76, t[1], t[2]); for (const s of [-1, 1]) { B.box(M.wood, 2.0, 0.06, 0.32, t[0] + Math.sin(t[2]) * s * 0.8, 0.46, t[1] + Math.cos(t[2]) * s * 0.8, t[2]); B.box(M.darkwood, 0.08, 0.76, 1.7, t[0] + Math.cos(t[2]) * s * 0.8, 0.38, t[1] - Math.sin(t[2]) * s * 0.8, t[2]); } }
      B.box(M.concrete, 6.4, 0.2, 4.2, -15, 0.1, 12); B.box(M.wood, 6, 2.5, 3.8, -15, 1.45, 12); B.gable(M.galv, 6.8, 1.2, 4.6, -15, 2.7, 12); for (const u of [-16.5, -13.5]) B.box(M.navy, 0.9, 2.0, 0.08, u, 1.2, 13.93); B.cyl(M.galv, 0.5, 0.5, 1.1, -11.2, 0.75, 12.5, 12);
      for (const p of [[-13, -12], [14, -9], [15, 10]]) { B.cyl(M.darkwood, 0.07, 0.09, 2.6, p[0], 1.3, p[1], 6); B.box(M.lantern, 0.26, 0.34, 0.26, p[0], 2.75, p[1]); B.hip(M.metal, 0.5, 0.18, 0.5, p[0], 2.92, p[1]); }
      board(B, F.G, m, 0, 15.5, 0, 3.6);
      B.finish(F.G); F.solid(-15, 12, 6.2, 4, 3.6); F.solid(0, 0, 1.6, 1.6, 0.4);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff8a3a, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending })); glow.position.set(0, 1.0, 0); glow.scale.set(7, 7, 1); F.G.add(glow); fires.push({ s: glow, ph: m.z * 0.1 });
      m.act = { at: F.W(0, 0), r: 4.2, text: "Sit by the fire", fn: () => rest(m) }; m.spot = F.W(0, 6);
    },
    rest(m) {
      const M = mats, F = frame(m), B = builder();
      // car park in front, the hall behind it under one big roof, a row of machines, banners, the toilets
      B.box(M.asphalt, 50, 0.12, 22, 0, 0.06, 15); for (let k = 0; k < 15; k++) { B.box(M.white, 0.14, 0.02, 5.2, -21 + k * 3, 0.13, 7.2); if (k % 2 === 0) B.box(M.white, 0.14, 0.02, 5.2, -21 + k * 3, 0.13, 22.6); } B.box(M.concrete, 50.4, 0.24, 0.3, 0, 0.12, 3.9);
      B.box(M.stone, 30, 0.3, 11, 0, 0.15, -3); B.box(M.wood, 27, 3.6, 8, 0, 2.1, -4); B.gable(M.tile, 31, 3.6, 13.6, 0, 3.9, -3.2); B.box(M.tile, 31.4, 0.34, 0.5, 0, 7.5, -3.2);
      for (let k = 0; k < 8; k++) { const u = -13.5 + k * 3.86; B.box(M.darkwood, 0.26, 3.8, 0.26, u, 2.05, 2.4); if (k < 7 && k !== 3) B.box(M.glass, 3.1, 2.3, 0.1, u + 1.93, 1.75, 0.03); }
      B.box(M.darkwood, 27.4, 0.3, 0.3, 0, 3.75, 2.4); B.box(M.navy, 3.2, 0.9, 0.05, 0, 3.0, 0.1); B.box(M.darkwood, 3.4, 2.6, 0.08, 0, 1.6, 0.02);
      const big = sign((m.jp || m.name), m.name, 9, 1.7, "#1d4a2c", "#f6f1e2"); big.position.set(0, 5.15, 3.68); big.rotation.x = -0.49; F.G.add(big);
      [[-12.4, M.vendR], [-11.2, M.vendW], [-10.0, M.vendB], [-8.8, M.vendR]].forEach(v => { B.box(v[1], 1.05, 1.85, 0.75, v[0], 1.23, 1.3); B.box(M.screen, 0.86, 0.95, 0.03, v[0], 1.5, 1.69); B.box(M.rubber, 0.86, 0.26, 0.03, v[0], 0.58, 1.69); F.solid(v[0], 1.3, 1.1, 0.8, 1.9); });
      for (const u of [5, 8.5, 12]) { B.box(M.wood, 2.2, 0.08, 0.55, u, 0.75, 1.5); for (const w of [-0.9, 0.9]) B.box(M.metal, 0.07, 0.45, 0.5, u + w, 0.52, 1.5); }
      for (let k = 0; k < 6; k++) { const u = -22 + k * 8.8; B.cyl(M.white, 0.03, 0.03, 4.2, u, 2.1, 4.6, 6); B.box([M.vermilion, M.green, M.navy][k % 3], 0.62, 2.4, 0.02, u + 0.34, 2.9, 4.6); }
      B.box(M.concrete, 7, 3, 5, 20, 1.65, -3); B.box(M.galv, 7.6, 0.24, 5.6, 20, 3.27, -3); for (const u of [18.4, 21.6]) B.box(M.navy, 1.0, 2.1, 0.08, u, 1.35, -0.46);
      for (const u of [-23, 23]) { B.cyl(M.metal, 0.09, 0.13, 7, u, 3.5, 4.8, 8); B.box(M.lantern, 0.9, 0.16, 0.34, u, 6.95, 5.4); }
      B.finish(F.G); F.solid(0, -4, 27.2, 8.2, 7); F.solid(20, -3, 7.2, 5.2, 3.4);
      m.act = { at: F.W(0, 1.3), r: 3.4, text: "Buy a hot bento · ¥600", fn: () => buy(m, 600, "A hot bento and a can of coffee, eaten on the bench.", 0.2, 0.1) }; m.spot = F.W(0, 8);
    }
  };
  let _glow = null;
  function glowTex() { if (_glow) return _glow; const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.4, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (_glow = new THREE.CanvasTexture(c)); }

  // ---- the daruma -----------------------------------------------------------------------------------------------------------------------
  function darumaMesh() {
    const M = mats, G = new THREE.Group(), B = builder();
    B.ball(M.red, 0.26, 0, 0.27, 0, 1.08); B.ball(M.red, 0.2, 0, 0.52, 0, 0.95); B.cyl(M.darkwood, 0.2, 0.22, 0.05, 0, 0.025, 0, 12);
    B.finish(G);
    const cv = document.createElement("canvas"); cv.width = cv.height = 128; const g = cv.getContext("2d");
    g.fillStyle = "#f3ead8"; g.beginPath(); g.ellipse(64, 60, 50, 44, 0, 0, 7); g.fill(); g.fillStyle = "#111"; g.beginPath(); g.arc(44, 54, 9, 0, 7); g.arc(84, 54, 9, 0, 7); g.fill();
    g.strokeStyle = "#111"; g.lineWidth = 7; g.lineCap = "round"; g.beginPath(); g.moveTo(26, 34); g.quadraticCurveTo(44, 20, 58, 36); g.moveTo(102, 34); g.quadraticCurveTo(84, 20, 70, 36); g.moveTo(40, 84); g.quadraticCurveTo(64, 70, 88, 84); g.stroke();
    g.fillStyle = "#c9a23a"; g.font = "900 26px " + (typeof JP !== "undefined" ? JP : "serif"); g.textAlign = "center"; g.fillText("福", 64, 122);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 18), new THREE.MeshBasicMaterial({ map: t, transparent: true })); face.position.set(0, 0.44, 0.215); face.rotation.x = -0.18; G.add(face);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffd76a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); halo.position.set(0, 0.4, 0); halo.scale.set(1.5, 1.5, 1); G.add(halo);
    return G;
  }
  function placeDaruma() {
    C.daruma.length = 0;
    const clear = (x, z) => { try { if (typeof insideBuilding === "function" && insideBuilding(x, z, 0.5)) return false; } catch (e) { /* none */ } return world.sampleLand(x, z) > 0.5 || gy(x, z) > 0.6; };
    const put = (id, x, z, where) => {
      // the nearest clear spot to where it was meant to go
      let bx = x, bz = z, ok = clear(x, z);
      for (let r = 2; r <= 24 && !ok; r += 2) for (let k = 0; k < 8 && !ok; k++) { const a = k * 0.785 + r, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (clear(px, pz)) { bx = px; bz = pz; ok = true; } }
      if (!ok) return;
      C.daruma.push({ id: id, x: bx, z: bz, y: gy(bx, bz), where: where, o: null });
    };
    C.marks.forEach(m => { const s = m.spot || [m.x, m.z], a = (m.x * 7 + m.z * 3) % 6.28, r = m.kind === "farm" ? 30 : m.kind === "windfarm" ? 24 : 7; put("m:" + m.id, s[0] + Math.cos(a) * r, s[1] + Math.sin(a) * r, m.name); });
    try { onsens.list.forEach((o, i) => put("o:" + i, o.at[0] - Math.sin(o.yaw) * 13, o.at[1] - Math.cos(o.yaw) * 13, o.name)); } catch (e) { /* none */ }
    try { ski.list.forEach((R, i) => put("s:" + i, R.res.top[0] + 9, R.res.top[1] + 6, (R.name || "Ski") + " summit")); } catch (e) { /* none */ }
    (world.airports || []).forEach((a, i) => { const p = fromRectLocal(a.sx / 2 - 60, a.sz - 100 + 14, a.cx, a.cz, a.yaw); put("a:" + i, p[0], p[1], a.name); });
    world.cities.forEach((c, ci) => {
      (c.stations || []).slice(0, ci ? 1 : 8).forEach((st, i) => put("t:" + ci + ":" + i, st.centre[0] + 16 + (i % 3) * 5, st.centre[1] - 14 - (i % 2) * 6, st.name));
      if (!ci) { (c.sites || []).forEach((s, i) => put("x:" + i, s.at[0] + 13, s.at[2] - 11, s.name)); (c.wards || []).forEach((w, i) => { if (i % 2 === 0) put("w:" + i, w.centre[0] - 21, w.centre[1] + 17, w.name); }); }
    });
  }

  // ---- built with the world ---------------------------------------------------------------------------------------------------------
  function buildCountry(r) {
    root = new THREE.Group(); root.name = "country"; r.add(root);
    C.marks = (world.landmarks || []).slice(); spin.length = lamps.length = fires.length = 0; materials();
    let built = 0;
    // keep the woods out of the places themselves (the trees are grown after this)
    const CLEAR = { lighthouse: 22, windfarm: 20, shrine: 18, mast: 18, lookout: 20, farm: 100, camp: 40, rest: 40 };
    try { C.marks.forEach(m => { bikeParks.clear.push([m.x, m.z, CLEAR[m.kind] || 18]); (m.turbines || []).forEach(t => bikeParks.clear.push([t[0], t[1], 9])); }); } catch (e) { /* no clearing list */ }
    C.marks.forEach(m => { try { BUILD[m.kind](m); built++; } catch (e) { console.warn("[Konto] country: " + m.name, e); } });
    placeDaruma();
    console.log("[Konto] the country: " + built + " landmarks built, " + C.daruma.length + " daruma hidden");
  }
  const _onsens = window.buildOnsens;
  if (typeof _onsens === "function") window.buildOnsens = function (r) { const out = _onsens.apply(this, arguments); try { buildCountry(r); } catch (e) { console.warn("[Konto] country:", e); } return out; };

  // ---- what you do there ---------------------------------------------------------------------------------------------------------------
  const at = () => (typeof playerAt === "function" ? playerAt() : player.pos);
  const calm = d => { try { stressAddRaw(-d); } catch (e) { /* no stress */ } };
  const heal = d => { try { vitals.health = Math.min(1, vitals.health + d); } catch (e) { /* no vitals */ } };
  const cool = (m, secs) => { const t = performance.now(), l = lastAct[m.id] || -1e9; if (t - l < secs * 1000) return false; lastAct[m.id] = t; return true; };
  function offering(m) {
    if (purse.yen < 100) { say("You have no coin for the box.", 3); return; }
    purse.yen -= 100; try { if (typeof seikoGesture === "function") seikoGesture("bow", 1.8); } catch (e) { /* no gesture */ }
    if (cool(m, 240)) { calm(0.12); try { standing.honor.deed("shrine_offering"); } catch (e) { /* standing off */ } say("A coin in the box, two bows, two claps, one bow. The wind drops.", 5); }
    else say("A coin in the box, and a bow.", 3);
  }
  function view(m) { if (cool(m, 90)) { calm(0.18); say(m.name + ". The whole of Konto under you, and nobody asking for anything.", 5.5); } else say("You look a while longer.", 2.5); }
  function rest(m) { if (cool(m, 120)) { calm(0.22); heal(0.1); say("Woodsmoke and the sound of the river. Your shoulders come down.", 5); } else say("The fire is warm.", 2.5); }
  function buy(m, yen, text, health, stress) { if (purse.yen < yen) { say("Not enough on you.", 3); return; } purse.yen -= yen; heal(health); calm(stress); say(text, 4.5); }
  function nearAct() {
    if (!C.marks.length || !player.placed || player.mode !== "walk" || drive.car || drive.train) return null;
    try { if (typeof interior !== "undefined" && interior.active) return null; } catch (e) { /* none */ }
    const p = at();
    for (const m of C.marks) { const a = m.act; if (a && Math.abs(a.at[0] - p.x) < a.r && Math.abs(a.at[1] - p.z) < a.r && Math.hypot(a.at[0] - p.x, a.at[1] - p.z) < a.r) return a; }
    return null;
  }
  const _use = window.useRide;
  if (typeof _use === "function") window.useRide = function () { let a = null; try { a = nearAct(); } catch (e) { /* theirs */ } if (a) { try { a.fn(); } catch (e) { console.warn("[Konto] country:", e); } return; } return _use.apply(this, arguments); };
  const _prompt = window.updatePrompt;
  if (typeof _prompt === "function") window.updatePrompt = function () { let a = null; try { a = nearAct(); } catch (e) { /* theirs */ } if (a) { setPromptText(a.text); return; } return _prompt.apply(this, arguments); };
  try {
    if (window.standing && standing.honor && standing.honor.define) {
      standing.honor.define("shrine_offering", { delta: 2, label: "Made an offering at a mountain shrine", icon: "help", cooldown: 240 });
      standing.honor.define("daruma_ten", { delta: 3, label: "Found ten daruma", icon: "help", cooldown: 1 });
    }
  } catch (e) { /* standing off */ }

  // ---- finding things ------------------------------------------------------------------------------------------------------------------
  function hud(text) {
    if (!hudEl) { hudEl = document.createElement("div"); hudEl.style.cssText = "position:fixed;right:22px;top:118px;z-index:40;padding:9px 14px;border-radius:10px;background:rgba(14,18,22,.82);color:#f6f1e2;font:700 14px/1.25 system-ui,'Segoe UI',sans-serif;letter-spacing:.02em;pointer-events:none;opacity:0;transition:opacity .35s;border-left:4px solid #d2452a;max-width:340px"; document.body.appendChild(hudEl); }
    hudEl.innerHTML = text; hudEl.style.opacity = "1"; hudT = performance.now() + 5200;
  }
  function discover(m) {
    C.found[m.id] = 1;
    hud("<span style='color:#e8b23c;font-size:11px;letter-spacing:.14em'>DISCOVERED · " + Object.keys(C.found).length + " / " + C.marks.length + "</span><br>" + m.name + (m.jp ? "<br><span style='font-weight:500;opacity:.8'>" + m.jp + "</span>" : ""));
    try { if (typeof saveMark === "function") saveMark("Discovered " + m.name); } catch (e) { /* no mark */ }
    if (Object.keys(C.found).length === C.marks.length) { purse.yen += 100000; say("Every landmark in Konto found. The tourist board sends ¥100,000 and a certificate.", 7); }
  }
  function collect(d) {
    C.got[d.id] = 1; if (d.o) { d.o.visible = false; }
    const n = Object.keys(C.got).length, all = C.daruma.length; purse.yen += 2000;
    hud("<span style='color:#e8b23c;font-size:11px;letter-spacing:.14em'>DARUMA · " + n + " / " + all + "</span><br>" + d.where + "<br><span style='font-weight:500;opacity:.8'>+¥2,000</span>");
    if (n % 10 === 0) { try { standing.honor.deed("daruma_ten"); } catch (e) { /* standing off */ } }
    if (n === all) { purse.yen += 500000; say("The last daruma. You paint in the second eye: ¥500,000 from a grateful shrine.", 8); }
  }
  let scanT = 0, dProto = null;
  function countryTick(dt) {
    if (!root || !world || !C.marks.length) return;
    const t = performance.now() / 1000, night = (typeof nightState !== "undefined" && nightState.lit) || 0;
    for (const s of spin) { s.a += dt * s.w; s.o.rotation.z = s.a; }
    for (const l of lamps) { l.beam.rotation.y = t * 0.55 + l.ph; l.mat.opacity = night * 0.11; l.beam.visible = night > 0.05; }
    for (const f of fires) { f.s.material.opacity = (0.25 + night * 0.5) * (0.8 + 0.2 * Math.sin(t * 9 + f.ph) * Math.sin(t * 5.3)); }
    if (mats) { mats.ember.emissiveIntensity = 1.0 + 0.5 * Math.sin(t * 11) * Math.sin(t * 6.1); mats.beacon.emissiveIntensity = (t % 2.4) < 1.2 ? 0.25 + night * 2.2 : 0.05; }
    if (hudEl && hudT && performance.now() > hudT) { hudEl.style.opacity = "0"; hudT = 0; }
    scanT -= dt; if (scanT > 0 || !player.placed) return; scanT = 0.25;
    try { if (typeof title === "object" && title.on) return; } catch (e) { /* none */ }
    const p = at();
    for (const m of C.marks) if (!C.found[m.id] && Math.abs(m.x - p.x) < 200 && Math.hypot(m.x - p.x, m.z - p.z) < (FIND_R[m.kind] || 60)) discover(m);
    for (const d of C.daruma) {
      if (C.got[d.id]) { if (d.o) d.o.visible = false; continue; }
      const dist = Math.abs(d.x - p.x) > 140 ? 999 : Math.hypot(d.x - p.x, d.z - p.z);
      if (dist < 130) { if (!d.o) { if (!dProto) dProto = darumaMesh(); d.o = dProto.clone(); d.y = gy(d.x, d.z); d.o.position.set(d.x, d.y, d.z); root.add(d.o); } d.o.visible = true; d.o.rotation.y = t * 0.9 + d.x; }
      else if (d.o) d.o.visible = false;
      if (dist < 1.5 && player.mode === "walk" && !drive.car && Math.abs(p.y - d.y) < 3) collect(d);
    }
  }
  const _tick = window.tick;
  if (typeof _tick === "function") window.tick = function (dt) { try { countryTick(Number.isFinite(dt) ? Math.min(dt, 0.1) : 0); } catch (e) { if (!countryTick.warned) { countryTick.warned = true; console.warn("[Konto] country:", e); } } return _tick.apply(this, arguments); };

  // ---- saving ------------------------------------------------------------------------------------------------------------------------
  const snap = window.snapshotSave, apply = window.applySave, sig = window.saveSig, fresh = window.newGameBackup;
  if (typeof snap === "function") window.snapshotSave = function () { const s = snap.apply(this, arguments); try { s.country = { found: Object.keys(C.found), got: Object.keys(C.got) }; } catch (e) { /* none */ } return s; };
  if (typeof apply === "function") window.applySave = function (s) { const r = apply.apply(this, arguments); try { C.found = {}; C.got = {}; if (s && s.country) { (s.country.found || []).forEach(k => { C.found[k] = 1; }); (s.country.got || []).forEach(k => { C.got[k] = 1; }); } } catch (e) { /* none */ } return r; };
  if (typeof sig === "function") window.saveSig = function () { return sig.apply(this, arguments) + "|c" + Object.keys(C.found).length + "." + Object.keys(C.got).length; };
  if (typeof fresh === "function") window.newGameBackup = function () { const r = fresh.apply(this, arguments); C.found = {}; C.got = {}; C.daruma.forEach(d => { if (d.o) d.o.visible = true; }); return r; };

  // ---- the map -----------------------------------------------------------------------------------------------------------------------
  const _pois = window.mapPois;
  if (typeof _pois === "function") window.mapPois = function (across) {
    const out = _pois.apply(this, arguments);
    try { C.marks.forEach(m => out.push({ x: m.x, z: m.z, name: C.found[m.id] ? m.name : "Undiscovered", kind: C.found[m.id] ? KIND[m.kind] : "Somewhere worth finding" })); } catch (e) { /* theirs */ }
    return out;
  };
  function icons(ctx, toScreen, opts) {
    const small = opts && opts.labels === false, r = small ? 7 : 10, F = typeof JP !== "undefined" ? JP : "sans-serif";
    C.marks.forEach(m => {
      const q = toScreen(m.x, m.z); if (q[0] < -20 || q[1] < -20 || q[0] > ctx.canvas.width + 20 || q[1] > ctx.canvas.height + 20) return;
      const known = !!C.found[m.id];
      ctx.save(); ctx.fillStyle = known ? "#1d4a2c" : "#5d6670"; ctx.strokeStyle = "#f6f1e2"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#f6f1e2"; ctx.font = "800 " + Math.round(r * 1.25) + "px " + F; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(known ? GLYPH[m.kind] : "?", q[0], q[1] + 0.5);
      ctx.restore();
    });
  }
  // (career.js owns the hook the map calls; when it is absent the icons are drawn through a hook of our own)
  const host = window.career || (window.career = {});
  const _icons = host.mapIcons;
  host.mapIcons = function (ctx, toScreen, opts) { if (_icons) try { _icons.apply(this, arguments); } catch (e) { /* theirs */ } try { icons(ctx, toScreen, opts); } catch (e) { /* ours */ } };

  // ---- LANDMARK: the next one ------------------------------------------------------------------------------------------------------
  function goMark(i) {
    if (!C.marks.length) { say("No landmarks on this map.", 3); return; }
    const m = C.marks[(i !== undefined ? i : goI++) % C.marks.length], s = m.spot || [m.x, m.z];
    try { if (drive.car && typeof leaveCar === "function") leaveCar(); if (typeof interior !== "undefined" && interior.active && typeof interiorLeave === "function") interiorLeave(true); } catch (e) { /* stay */ }
    if (typeof placeSeiko === "function") placeSeiko(new THREE.Vector3(s[0], gy(s[0], s[1]) + 0.2, s[1])); else player.pos.set(s[0], gy(s[0], s[1]) + 0.2, s[1]);
    player.yaw = player.targetYaw = Math.atan2(m.x - s[0], m.z - s[1]);
    say(m.name + ".", 3);
  }
  try { CHEAT_ACTIONS.LANDMARK = { dial: "5550999", note: "", fn: () => goMark() }; } catch (e) { /* no cheat table */ }

  // ---- built behind the loading screen ---------------------------------------------------------------------------------------------
  (window.PERSIST_EXTRA = window.PERSIST_EXTRA || []).push(function (P, facts) {
    P.stage("country", 0.2, async () => { facts.landmarks = C.marks.length; facts.daruma = C.daruma.length; facts.countryRoads = (world.links || []).filter(L => L.road && L.road.spur).length; });
  });
  console.log("[Konto] country: landmarks, country roads and daruma");
})();
