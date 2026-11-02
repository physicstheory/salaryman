// Piers, and the boats tied up at them that Seiko can steal and drive (the Shigoto boat dynamics: SHIGOTO.Boat, SHIGOTO.Ocean).
//
// Piers: timber jetties on tarred piles, built out from the shore round the capital's waterfront, every coastal town and the three holiday
// islands, out to water deep enough to float a boat. Each has a plank deck you walk on, a ramp up from the shore, lamps, bollards, a life
// ring, ladders, and a T-head at the end. Boats lie alongside on either side: a sport runabout, a rigid inflatable, jet skis, an open
// fishing skiff and the white fibreglass gyosen you see in every Japanese harbour.
//
// Stealing one: walk up to it on the pier and press F / Y. Seiko climbs in and starts it; that is a crime (a wanted star and lost honor),
// the first time. After that the boat is the one you took and you can come back to it.
//
// Driving: the hull is simulated, not animated (Engine/src/vehicles/Boat.js): it floats at its real draft on the swell the water shader
// draws, climbs onto the plane, banks into turns, ventilates its prop off a crest, runs aground on a beach and bumps off a quay.
//   W / RT          throttle            S / LT     astern
//   A D / stick     steer               Shift / stick back   trim the drive up (bow up, faster on flat water)   Ctrl / stick forward   trim down
//   F / Y           step off (alongside a pier, a pontoon or a beach)
// Press F twice out in open water to go over the side and swim for the nearest shore.
//
// Dial 5550888 (or type HARBOUR) to be put on the nearest pier. Console: boating.piers(), boating.boats(), boating.telemetry().
// Off switch: ?boats=0.

(function () {
  if (!window.SHIGOTO || !SHIGOTO.Boat || !SHIGOTO.Ocean) { console.warn("[Konto] boat dynamics not in this engine build"); return; }
  if (/[?&]boats=0\b/.test(location.search)) { console.log("[Konto] boats turned off"); return; }

  const B = window.boating = { piers: () => piers.map(p => ({ at: [Math.round(p.x0), Math.round(p.z0)], len: Math.round(p.len), boats: p.boats.length, where: p.where })),
    boats: () => fleet.map(b => ({ kind: b.kind, state: b.state, at: [Math.round(b.pos.x), Math.round(b.pos.z)], stolen: b.stolen })),
    telemetry: () => ride.boat && ride.boat.phys ? ride.boat.phys.telemetry() : null, go: i => goPier(i) };
  const piers = [], fleet = [];
  const ride = { boat: null, t: 0, crank: 0, leaveTap: -9, hud: null, hudC: null, snd: null, look0: null, lookIdle: 0 };
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

  // ---- the sea, as the water shader draws it ---------------------------------------------------------------------------------------
  // The swell is the water material's own: wAmp (0 on tiers without the wave patch, so a flat sea there), faded in the shallows the way
  // the shader fades it, and timed by the same clock (water.t).
  function seaAmp() {
    try { for (const U of water.mats) if (U.wAmp && U.wAmp.value > 0) return U.wAmp.value; } catch (e) { /* no water yet */ }
    return 0;
  }
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const sea = new SHIGOTO.Ocean({ amp: (x, z) => seaAmpNow * smooth(0.3, 7.0, -world.sampleHeight(x, z)) });
  let seaAmpNow = 0;
  function seaSync() { seaAmpNow = seaAmp(); sea.time = (typeof water !== "undefined" && water.t) || 0; }
  const W = {
    sea: sea,
    ground: (x, z) => world.sampleHeight(x, z),
    solid: (x, z, y) => {
      if (y < 4 && insideBuilding(x, z, 0.1)) return true;
      for (let i = 0; i < piers.length; i++) { const p = piers[i]; if (Math.abs(x - p.cx) < p.r && Math.abs(z - p.cz) < p.r && pierHit(p, x, z, y)) return true; }
      for (let i = 0; i < fleet.length; i++) {
        const o = fleet[i]; if (o === ride.boat || o.state === "gone") continue;
        if (Math.abs(x - o.pos.x) < o.len && Math.abs(z - o.pos.z) < o.len && boatHit(o, x, z, 0.1)) return true;
      }
      return false;
    }
  };

  // ---- materials ------------------------------------------------------------------------------------------------------------------
  // Every surface is a PBR set from Web/art/marine (Tools/textures/make_marine.py): colour, normal and roughness, at real-world scale.
  const TL = new THREE.TextureLoader(), texCache = {};
  function tex(name, srgb, tile) {
    const key = name + "@" + tile;
    if (texCache[key]) return texCache[key];
    const t = TL.load("art/marine/" + name + ".jpg");        // the browser fetches each image once, however many tilings share it
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.repeat.set(1 / tile, 1 / tile);
    return (texCache[key] = t);
  }
  const matCache = {};
  // name: the set; tile: metres per repeat; o: { tint, metal, rough, side, ns }
  function marine(name, tile, o) {
    o = o || {};
    const key = name + "|" + tile + "|" + (o.tint || "") + "|" + (o.metal || 0) + "|" + (o.side || 0);
    if (matCache[key]) return matCache[key];
    const m = new THREE.MeshStandardMaterial({ map: tex(name, true, tile), normalMap: tex(name + "_nor", false, tile), roughnessMap: tex(name + "_rough", false, tile),
      color: new THREE.Color(o.tint || 0xffffff), metalness: o.metal || 0, roughness: o.rough || 1, side: o.side || THREE.DoubleSide,
      envMap: (typeof gfx !== "undefined" && gfx.env) || null, envMapIntensity: o.env || 0.8 });
    m.normalScale.set(o.ns || 1, o.ns || 1);
    return (matCache[key] = m);
  }
  // r128's sRGB Color() hex is linear in the shader, so tints are given as sRGB and converted
  const tint = hex => new THREE.Color(hex).convertSRGBToLinear().getHex();
  const glassMat = () => matCache.glass || (matCache.glass = new THREE.MeshStandardMaterial({ color: 0x223038, transparent: true, opacity: 0.32, roughness: 0.04, metalness: 0.2, envMap: (typeof gfx !== "undefined" && gfx.env) || null, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false }));
  function lampMat(c) { const k = "lamp" + c; return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 1.2, roughness: 0.3 })); }

  // ---- geometry helpers -----------------------------------------------------------------------------------------------------------
  // UVs in metres, so a texture's tile size is its real size whatever the part's size
  function boxM(w, h, d) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
    return g;
  }
  function cylM(r0, r1, h, seg, open) {
    const g = new THREE.CylinderGeometry(r0, r1, h, seg || 12, 1, !!open), uv = g.attributes.uv, c = Math.PI * 2 * Math.max(r0, r1);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * c, uv.getY(i) * h);
    return g;
  }
  function tubeM(pts, r, seg, closed) {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), !!closed);
    const g = new THREE.TubeGeometry(curve, seg || pts.length * 4, r, 10, !!closed), uv = g.attributes.uv, L = curve.getLength();
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L, uv.getY(i) * Math.PI * 2 * r);
    return g;
  }
  // A builder that collects parts and merges them per material, so a whole boat or pier is a handful of draw calls.
  function Kit() {
    const parts = new Map();
    return {
      add(geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, "YXZ")), new THREE.Vector3(sx || 1, sy || 1, sz || 1));
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        g.applyMatrix4(m);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        (parts.get(mat) || parts.set(mat, []).get(mat)).push(g);
        return g;
      },
      build(group, shadow) {
        parts.forEach((list, mat) => {
          let n = 0; list.forEach(g => { n += g.attributes.position.count; });
          const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
          let o = 0;
          list.forEach(g => { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); U.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); });
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(P, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(N, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(U, 2));
          geo.computeBoundingSphere();
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = shadow !== false && !mat.transparent; mesh.receiveShadow = true;
          group.add(mesh);
        });
        parts.clear();
        return group;
      }
    };
  }
  // a strip of quads between two polylines (same length), UVs in metres along and across
  function stripGeo(a, b, flip) {
    const pos = [], uv = [];
    let along = 0;
    for (let i = 0; i < a.length - 1; i++) {
      const a0 = a[i], a1 = a[i + 1], b0 = b[i], b1 = b[i + 1];
      const da = Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]);
      const w0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]), w1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1], b1[2] - a1[2]);
      const q = [[a0, along, 0], [a1, along + da, 0], [b1, along + da, w1], [b0, along, w0]];
      const tri = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      tri.forEach(k => { pos.push(q[k][0][0], q[k][0][1], q[k][0][2]); uv.push(q[k][1], q[k][2]); });
      along += da;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  // ---- the boats ----------------------------------------------------------------------------------------------------------------------
  // Each is drawn on the same hull the physics floats (SHIGOTO.buildHull), so what you see in the water is what the water pushes on.
  const LIVERIES = {
    runabout: [0x0f2a4a, 0x8a1020, 0xf2f2ee, 0x1d1d1f, 0x2f5f3a],
    rib: [0x2a2c2e, 0xd2531a, 0x5a6066, 0x203a5a],
    jetski: [0x1a6fd0, 0xe2b400, 0xd02a2a, 0x23a07a, 0x111111],
    skiff: [0xf0efe8, 0x7a9cb2, 0xd9cfa8],
    gyosen: [0xf2f2ee]
  };
  const NAMES = ["海風", "第二さくら", "あおば", "はやて", "しおかぜ", "カモメ", "SEA BREEZE", "NAMI", "第三恵比寿丸", "KONTO MARINE"];
  function nameTex(txt) {
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 96;
    const g = cv.getContext("2d"); g.clearRect(0, 0, 512, 96); g.fillStyle = "#16202c";
    g.font = "800 64px " + (typeof UI === "string" ? UI : "sans-serif"); g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, 256, 50);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  }

  function hullParts(K, hull, topMat, botMat, stripeMat) {
    const rows = hull.rows.map(r => r.map(i => hull.verts[i]));
    const n = rows[0].length, mid = (n - 1) / 2;
    // the skin, a strip per pair of ring points: chine to keel is bottom paint, chine to gunwale is the gelcoat
    for (let k = 0; k < n - 1; k++) {
      const a = rows.map(r => r[k]), b = rows.map(r => r[k + 1]);
      const bottom = k >= 1 && k < n - 2;
      K.add(stripGeo(a, b, k >= mid), bottom ? botMat : topMat);
    }
    // a boot stripe just above the chine
    if (stripeMat) for (const side of [0, n - 2]) {
      const a = rows.map(r => { const p = r[side + (side ? 1 : 0)], q = r[side + (side ? 0 : 1)]; return [p[0] + (q[0] - p[0]) * 0.18, p[1] + (q[1] - p[1]) * 0.18, p[2]]; });
      const b = rows.map(r => { const p = r[side + (side ? 1 : 0)], q = r[side + (side ? 0 : 1)]; return [p[0] + (q[0] - p[0]) * 0.32, p[1] + (q[1] - p[1]) * 0.32, p[2]]; });
      const o = side ? 1.004 : 1.004;
      K.add(stripGeo(a.map(p => [p[0] * o, p[1], p[2]]), b.map(p => [p[0] * o, p[1], p[2]]), side !== 0), stripeMat);
    }
    // the transom
    const r0 = rows[0], fan = [];
    const cy = (r0[0][1] + r0[mid][1]) / 2;
    for (let k = 0; k < n - 1; k++) fan.push(0, cy, r0[0][2], r0[k + 1][0], r0[k + 1][1], r0[k + 1][2], r0[k][0], r0[k][1], r0[k][2]);
    const tg = new THREE.BufferGeometry(); tg.setAttribute("position", new THREE.Float32BufferAttribute(fan, 3));
    const tuv = []; for (let i = 0; i < fan.length; i += 3) tuv.push(fan[i], fan[i + 1]); tg.setAttribute("uv", new THREE.Float32BufferAttribute(tuv, 2)); tg.computeVertexNormals();
    K.add(tg, topMat);
    return rows;
  }
  // the deck: the foredeck at the sheer, a cockpit sole lower down aft, its liner, the gunwale caps and the transom's inner face
  function deckParts(K, rows, o) {
    const n = rows[0].length, S = rows.length - 1, fore = Math.round(S * (o.fore || 0.62)), inset = o.inset || 0.12;
    const gS = rows.map(r => r[0]), gP = rows.map(r => r[n - 1]);
    const inS = gS.map(p => [p[0] + inset, p[1], p[2]]), inP = gP.map(p => [p[0] - inset, p[1], p[2]]);
    const sole = o.sole;
    // gunwale caps
    K.add(stripGeo(gS, inS, true), o.cap); K.add(stripGeo(gP, inP, false), o.cap);
    // foredeck (a slight crown down the middle)
    const fS = inS.slice(fore), fP = inP.slice(fore), fM = fS.map((p, i) => [0, Math.max(p[1], fP[i][1]) + (o.crown || 0.06), p[2]]);
    K.add(stripGeo(fS, fM, true), o.deck); K.add(stripGeo(fM, fP, true), o.deck);
    if (o.open === false) {
      // a closed deck the whole length (the jet ski's)
      const aS = inS.slice(0, fore + 1), aP = inP.slice(0, fore + 1), aM = aS.map((p, i) => [0, Math.max(p[1], aP[i][1]) + (o.crown || 0.06), p[2]]);
      K.add(stripGeo(aS, aM, true), o.deck); K.add(stripGeo(aM, aP, true), o.deck);
      return { fore: fore };
    }
    // cockpit: liner down to the sole, the sole, the forward bulkhead and the transom's inside
    const cS = inS.slice(0, fore + 1), cP = inP.slice(0, fore + 1);
    K.add(stripGeo(cS, cS.map(p => [p[0], sole, p[2]]), false), o.liner);
    K.add(stripGeo(cP, cP.map(p => [p[0], sole, p[2]]), true), o.liner);
    K.add(stripGeo(cS.map(p => [p[0], sole, p[2]]), cP.map(p => [p[0], sole, p[2]]), true), o.soleMat);
    const zf = cS[fore][2], wf = cP[fore][0] - cS[fore][0], hf = Math.max(cS[fore][1], cP[fore][1]) - sole;
    K.add(boxM(wf, hf, 0.06), o.liner, 0, sole + hf / 2, zf);
    const zt = cS[0][2] + 0.05, wt = cP[0][0] - cS[0][0], ht = Math.max(cS[0][1], cP[0][1]) - sole;
    K.add(boxM(wt, ht, 0.06), o.liner, 0, sole + ht / 2, zt);
    return { fore: fore, zf: zf, zt: zt, wf: wf, wt: wt };
  }
  // stainless fittings: cleats, a bow rail, nav lights
  function fittings(K, rows, steel, o) {
    const n = rows[0].length, S = rows.length - 1;
    [[0.05, -1], [0.05, 1], [0.8, -1], [0.8, 1]].forEach(c => {
      const r = rows[Math.round(S * c[0])], p = c[1] < 0 ? r[0] : r[n - 1];
      K.add(boxM(0.22, 0.05, 0.05), steel, p[0] - c[1] * 0.08, p[1] + 0.05, p[2], 0, Math.PI / 2, 0);
    });
    if (o && o.rail) for (const side of [0, n - 1]) {
      const pts = []; for (let i = Math.round(S * 0.6); i <= S - 1; i++) { const p = rows[i][side]; pts.push([p[0] * 0.9, p[1] + 0.55, p[2]]); }
      const tip = rows[S][side]; pts.push([0, tip[1] + 0.55, tip[2] - 0.15]);
      if (pts.length > 2) { K.add(tubeM(pts, 0.016, pts.length * 3), steel); pts.forEach((p, i) => { if (i % 2 === 0) K.add(cylM(0.012, 0.012, 0.55, 6), steel, p[0], p[1] - 0.27, p[2]); }); }
    }
    // port red, starboard green, at the bow
    const bow = rows[Math.round(S * 0.86)];
    K.add(boxM(0.06, 0.05, 0.1), lampMat(0xff2a1a), bow[n - 1][0] - 0.04, bow[n - 1][1] + 0.04, bow[n - 1][2]);
    K.add(boxM(0.06, 0.05, 0.1), lampMat(0x22ff6a), bow[0][0] + 0.04, bow[0][1] + 0.04, bow[0][2]);
  }
  function outboard(K, at, scale, cowl, steel) {
    const s = scale, x = at[0], y = at[1], z = at[2];
    // cowling, midsection, leg, cavitation plate, gearcase and a three-blade prop (the prop is its own mesh so it can turn)
    K.add(new THREE.SphereGeometry(0.32 * s, 16, 12), cowl, x, y + 0.75 * s, z - 0.08 * s, 0, 0, 0, 0.85, 1.05, 1.25);
    K.add(boxM(0.26 * s, 0.4 * s, 0.34 * s), cowl, x, y + 0.36 * s, z - 0.05 * s);
    K.add(boxM(0.12 * s, 0.75 * s, 0.22 * s), cowl, x, y - 0.18 * s, z - 0.02 * s);
    K.add(boxM(0.34 * s, 0.025 * s, 0.42 * s), cowl, x, y - 0.42 * s, z - 0.05 * s);
    K.add(cylM(0.06 * s, 0.06 * s, 0.4 * s, 10), cowl, x, y - 0.62 * s, z - 0.02 * s, Math.PI / 2);
    K.add(boxM(0.04 * s, 0.25 * s, 0.1 * s), steel, x, y + 0.1 * s, z + 0.17 * s);
  }
  function propMesh(r, steel) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(boxM(0.02, r, r * 0.45), steel); b.position.y = r / 2; const piv = new THREE.Group(); piv.rotation.z = i * Math.PI * 2 / 3; b.rotation.y = 0.5; piv.add(b); g.add(piv); }
    const hub = new THREE.Mesh(cylM(0.04, 0.03, 0.12, 8), steel); hub.rotation.x = Math.PI / 2; g.add(hub);
    return g;
  }
  function seat(K, mat, x, y, z, w, d, back, yaw) {
    K.add(boxM(w, 0.14, d), mat, x, y + 0.07, z, 0, yaw || 0, 0);
    K.add(boxM(w * 0.9, 0.3, 0.12), mat, x, y + 0.32, z - d * 0.45, -0.12, yaw || 0, 0);
    if (back) K.add(boxM(w, back, 0.1), mat, x, y + back / 2 + 0.14, z - d * 0.5, -0.2, yaw || 0, 0);
  }
  function steeringWheel(K, steel, dark, x, y, z, tilt) {
    K.add(new THREE.TorusGeometry(0.18, 0.018, 8, 24), dark, x, y, z, tilt, 0, 0);
    K.add(cylM(0.02, 0.02, 0.32, 8), steel, x, y, z, tilt + Math.PI / 2, 0, 0, 1, 1, 1);
  }

  function makeBoatModel(kind, seed) {
    const R = k => rnd(seed, k, 7717);
    const sp = SHIGOTO.BOAT_SPECS[kind];
    const G = new THREE.Group(), K = Kit();
    const liv = LIVERIES[kind][Math.floor(R(1) * LIVERIES[kind].length)];
    const steel = marine("stainless", 0.6, { metal: 0.9, rough: 0.9, env: 1.2 });
    const gelW = marine("gelcoat", 2.0, { tint: tint(0xf3f3ef) });
    const gelT = marine("gelcoat", 2.0, { tint: tint(liv) });
    const dark = marine("gelcoat", 2.0, { tint: tint(0x1c1e21) });
    const vinyl = marine("vinyl", 0.9, { tint: tint(R(2) < 0.5 ? 0xf2ede2 : 0xd9d2c4) });
    const nonskid = marine("nonskid", 1.0);
    const out = { group: G, helm: [0, 0, 0], sit: true, props: [], len: sp.L, beam: sp.B, kind: kind, seikoVisible: true };
    if (kind === "gyosen") {
      // the harbour's white fishing boat (konto.html makeBoat), scaled to the hull the physics floats
      const b = makeBoat("gyosen", 900 + seed);
      const s = sp.L / b.len; b.obj.scale.setScalar(s);
      const hull = SHIGOTO.buildHull(sp);
      b.obj.position.set(0, 0, hull.zT + sp.L / 2);
      out.model = b.obj; G.add(b.obj);
      out.helm = [0, hull.yK + sp.H * 0.7, hull.zT + sp.L * 0.3]; out.sit = false; out.seikoVisible = false;
      out.waterOffset = true;         // makeBoat's origin is its waterline; set once the hull has settled
      return out;
    }
    const hull = SHIGOTO.buildHull(sp);
    const sole = hull.yK + sp.H * (kind === "jetski" ? 0.62 : 0.42);
    if (kind === "rib") {
      // the GRP hull below, Hypalon tubes all round, a centre console, a leaning post, an outboard on the transom and a stainless A-frame
      const rows = hullParts(K, hull, gelW, marine("gelcoat", 2.0, { tint: tint(0x9aa1a6) }), null);
      const d = deckParts(K, rows, { sole: sole, cap: gelW, deck: nonskid, liner: gelW, soleMat: nonskid, fore: 0.85, inset: 0.08 });
      const tube = marine("hypalon", 1.2, { tint: tint(liv) });
      const n = rows[0].length, S = rows.length - 1, rT = sp.B * 0.11, pts = [];
      for (let i = 0; i <= S; i++) pts.push([rows[i][0][0] - rT * 0.35, rows[i][0][1] + rT * 0.15, rows[i][0][2]]);
      const tip = rows[S][0]; pts.push([0, tip[1] + rT * 0.4, tip[2] + rT * 0.6]);
      for (let i = S; i >= 0; i--) pts.push([rows[i][n - 1][0] + rT * 0.35, rows[i][n - 1][1] + rT * 0.15, rows[i][n - 1][2]]);
      pts.unshift([pts[0][0], pts[0][1], pts[0][2] - 0.45]); pts.push([pts[pts.length - 1][0], pts[pts.length - 1][1], pts[pts.length - 1][2] - 0.45]);
      K.add(tubeM(pts, rT, 120), tube);
      [pts[0], pts[pts.length - 1]].forEach(p => K.add(new THREE.ConeGeometry(rT, rT * 1.4, 14), tube, p[0], p[1], p[2] - rT * 0.6, -Math.PI / 2));
      // rub strake and a grab line
      K.add(tubeM(pts.map(p => [p[0] * 1.04, p[1] - rT * 0.55, p[2]]), rT * 0.18, 120), dark);
      K.add(tubeM(pts.map(p => [p[0] * 1.0, p[1] + rT * 0.98, p[2]]), 0.008, 120), marine("rope", 0.3, { tint: tint(0xe8e1cf) }));
      // console
      const cz = hull.zT + sp.L * 0.48;
      K.add(boxM(0.8, 1.0, 0.75), gelW, 0, sole + 0.5, cz);
      K.add(boxM(0.82, 0.08, 0.5), dark, 0, sole + 1.0, cz + 0.08, -0.35);
      K.add(new THREE.PlaneGeometry(0.8, 0.42), glassMat(), 0, sole + 1.22, cz + 0.32, -0.45);
      steeringWheel(K, steel, dark, 0, sole + 1.02, cz - 0.42, -0.9);
      // leaning post with a cushion, and a cushion in the bow
      const lz = cz - 1.05;
      K.add(boxM(0.7, 0.75, 0.5), gelW, 0, sole + 0.38, lz);
      K.add(boxM(0.72, 0.2, 0.45), vinyl, 0, sole + 0.85, lz);
      K.add(boxM(0.7, 0.35, 0.12), vinyl, 0, sole + 1.05, lz - 0.2);
      K.add(boxM(1.0, 0.15, 0.9), vinyl, 0, sole + 0.5, hull.zT + sp.L * 0.75);
      // A-frame over the transom with a nav light
      const az = hull.zT + 0.25, ay = rows[0][0][1];
      [-1, 1].forEach(s => K.add(cylM(0.025, 0.025, 1.6, 8), steel, s * sp.B * 0.38, ay + 0.75, az, 0, 0, s * 0.16));
      K.add(cylM(0.025, 0.025, sp.B * 0.55, 8), steel, 0, ay + 1.52, az, 0, 0, Math.PI / 2);
      K.add(cylM(0.05, 0.05, 0.12, 10), lampMat(0xffffff), 0, ay + 1.62, az);
      outboard(K, [0, hull.yK + 0.2, hull.zT - 0.25], 1.0, dark, steel);
      fittings(K, rows, steel, {});
      out.helm = [0, sole, cz - 0.75]; out.sit = false;
      const pr = propMesh(0.17, steel); pr.position.set(0, hull.yK - 0.42, hull.zT - 0.5); out.props.push(pr); G.add(pr);
    } else if (kind === "runabout") {
      const rows = hullParts(K, hull, gelT, marine("antifoul", 1.5), gelW);
      const d = deckParts(K, rows, { sole: sole, cap: gelW, deck: gelW, liner: gelW, soleMat: marine("teak", 1.2), fore: 0.6, inset: 0.14, crown: 0.1 });
      // windscreen wrapping round the cockpit, its frame, the dash and wheel
      const wz = d.zf - 0.05, wy = rows[Math.round((rows.length - 1) * 0.6)][0][1];
      const ws = new THREE.CylinderGeometry(sp.B * 0.47, sp.B * 0.44, 0.5, 24, 1, true, -1.15, 2.3);
      K.add(ws, glassMat(), 0, wy + 0.24, wz - sp.B * 0.32, -0.32, Math.PI, 0);
      K.add(new THREE.TorusGeometry(sp.B * 0.47, 0.018, 6, 24, 2.3), steel, 0, wy + 0.49, wz - sp.B * 0.32 + 0.08, Math.PI / 2 - 0.32, 0, Math.PI / 2 - 1.15 + Math.PI);
      K.add(boxM(sp.B * 0.62, 0.45, 0.5), dark, -sp.B * 0.18, sole + 0.55, d.zf - 0.25);
      steeringWheel(K, steel, dark, -sp.B * 0.22, sole + 0.85, d.zf - 0.55, -0.8);
      // gauges
      const gTex = matCache.gauges || (matCache.gauges = new THREE.MeshStandardMaterial({ color: 0x0a0c0f, emissive: new THREE.Color(0x9ad7ff), emissiveIntensity: 0.25, emissiveMap: gaugeTex(), map: gaugeTex(), roughness: 0.2 }));
      K.add(new THREE.PlaneGeometry(0.42, 0.14), gTex, -sp.B * 0.22, sole + 0.79, d.zf - 0.49, -0.9, Math.PI, 0);
      // helm and passenger buckets, a bench across the stern with a sunpad over the engine, the swim platform
      seat(K, vinyl, -sp.B * 0.22, sole + 0.3, d.zf - 1.05, 0.55, 0.55, 0.45);
      seat(K, vinyl, sp.B * 0.22, sole + 0.3, d.zf - 1.05, 0.55, 0.55, 0.45);
      K.add(boxM(sp.B * 0.8, 0.45, 0.55), vinyl, 0, sole + 0.22, hull.zT + 1.15);
      K.add(boxM(sp.B * 0.8, 0.45, 0.12), vinyl, 0, sole + 0.6, hull.zT + 0.9, -0.15);
      K.add(boxM(sp.B * 0.82, 0.12, 0.85), vinyl, 0, rows[0][0][1] + 0.02, hull.zT + 0.48);
      K.add(boxM(sp.B * 0.92, 0.07, 0.7), marine("teak", 1.2), 0, hull.yK + 0.42, hull.zT - 0.33);
      // sterndrive leg under the platform
      K.add(boxM(0.18, 0.75, 0.32), dark, 0, hull.yK - 0.05, hull.zT - 0.35);
      K.add(boxM(0.44, 0.03, 0.5), dark, 0, hull.yK - 0.32, hull.zT - 0.38);
      K.add(cylM(0.07, 0.07, 0.42, 10), dark, 0, hull.yK - 0.5, hull.zT - 0.38, Math.PI / 2);
      // name on the topsides
      const nm = NAMES[Math.floor(R(3) * NAMES.length)], nt = new THREE.MeshStandardMaterial({ map: nameTex(nm), transparent: true, depthWrite: false, roughness: 0.3 });
      const S = rows.length - 1, nr = rows[Math.round(S * 0.7)], nn = nr.length;
      [[nr[0], -1], [nr[nn - 1], 1]].forEach(q => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), nt); m.position.set(q[0][0] + q[1] * 0.03, q[0][1] - 0.25, q[0][2]); m.rotation.y = q[1] * Math.PI / 2; G.add(m); });
      fittings(K, rows, steel, { rail: true });
      out.helm = [-sp.B * 0.22, sole + 0.3, d.zf - 1.05]; out.sit = true;
      const pr = propMesh(0.18, steel); pr.position.set(0, hull.yK - 0.5, hull.zT - 0.62); out.props.push(pr); G.add(pr);
    } else if (kind === "jetski") {
      const rows = hullParts(K, hull, gelT, dark, null);
      deckParts(K, rows, { open: false, cap: dark, deck: gelT, inset: 0.05, crown: 0.12, fore: 0.6 });
      const top = rows[Math.round((rows.length - 1) * 0.5)][0][1] + 0.1;
      // footwells, a long saddle, the hood with its mirrors and handlebars, the pump nozzle
      [-1, 1].forEach(s => K.add(boxM(0.22, 0.04, sp.L * 0.5), nonskid, s * sp.B * 0.34, top - 0.05, hull.zT + sp.L * 0.33));
      K.add(new THREE.CylinderGeometry(0.2, 0.2, sp.L * 0.42, 16, 1), vinyl, 0, top + 0.2, hull.zT + sp.L * 0.38, Math.PI / 2, 0, 0, 1.25, 1, 0.8);
      K.add(boxM(0.5, 0.3, sp.L * 0.42), gelT, 0, top + 0.05, hull.zT + sp.L * 0.38);
      K.add(new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), gelT, 0, top, hull.zT + sp.L * 0.75, 0, 0, 0, 0.95, 0.75, 1.5);
      K.add(new THREE.PlaneGeometry(0.5, 0.2), glassMat(), 0, top + 0.42, hull.zT + sp.L * 0.66, -0.9);
      const hz = hull.zT + sp.L * 0.62;
      K.add(cylM(0.035, 0.035, 0.35, 8), dark, 0, top + 0.35, hz, -0.4);
      K.add(cylM(0.018, 0.018, 0.8, 8), steel, 0, top + 0.52, hz - 0.08, 0, 0, Math.PI / 2);
      [-1, 1].forEach(s => K.add(cylM(0.03, 0.03, 0.14, 10), dark, s * 0.42, top + 0.52, hz - 0.08, 0, 0, Math.PI / 2));
      K.add(cylM(0.09, 0.07, 0.35, 12), steel, 0, hull.yK + 0.12, hull.zT - 0.08, Math.PI / 2);
      K.add(boxM(0.6, 0.04, 0.3), dark, 0, hull.yK + 0.3, hull.zT - 0.12);
      out.helm = [0, top + 0.02, hull.zT + sp.L * 0.4]; out.sit = true;
    } else {
      // the skiff: an open boat, two thwarts, a tiller outboard
      const rows = hullParts(K, hull, gelT, marine("antifoul", 1.5, { tint: tint(0x5a6a70) }), null);
      const d = deckParts(K, rows, { sole: sole, cap: marine("teak", 1.2), deck: gelW, liner: gelW, soleMat: nonskid, fore: 0.8, inset: 0.1 });
      const teak = marine("teak", 1.2);
      [0.25, 0.55].forEach(f => { const r = rows[Math.round((rows.length - 1) * f)], w = (r[r.length - 1][0] - r[0][0]) * 0.86; K.add(boxM(w, 0.05, 0.28), teak, 0, sole + 0.38, r[0][2]); });
      outboard(K, [0, hull.yK + 0.25, hull.zT - 0.2], 0.8, marine("gelcoat", 2.0, { tint: tint(0x2a2c30) }), steel);
      K.add(cylM(0.022, 0.022, 0.6, 8), steel, 0, hull.yK + 0.85, hull.zT + 0.22, Math.PI / 2 - 0.2);
      fittings(K, rows, steel, {});
      out.helm = [0, sole + 0.38 - 0.0, hull.zT + sp.L * 0.25]; out.sit = true;
      const pr = propMesh(0.13, steel); pr.position.set(0, hull.yK - 0.35, hull.zT - 0.3); out.props.push(pr); G.add(pr);
      void d;
    }
    K.build(G);
    return out;
  }
  let _gauge = null;
  function gaugeTex() {
    if (_gauge) return _gauge;
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 96; const g = cv.getContext("2d");
    g.fillStyle = "#06080a"; g.fillRect(0, 0, 256, 96);
    [[48, 48], [128, 48], [208, 48]].forEach((c, i) => {
      g.strokeStyle = "#cfe8ff"; g.lineWidth = 3; g.beginPath(); g.arc(c[0], c[1], 34, 0, Math.PI * 2); g.stroke();
      for (let k = 0; k <= 8; k++) { const a = Math.PI * (0.75 + k * 0.1875); g.beginPath(); g.moveTo(c[0] + Math.cos(a) * 26, c[1] + Math.sin(a) * 26); g.lineTo(c[0] + Math.cos(a) * 32, c[1] + Math.sin(a) * 32); g.stroke(); }
      g.strokeStyle = "#ff7a2a"; g.beginPath(); g.moveTo(c[0], c[1]); const a = Math.PI * (0.9 + i * 0.4); g.lineTo(c[0] + Math.cos(a) * 26, c[1] + Math.sin(a) * 26); g.stroke();
    });
    _gauge = new THREE.CanvasTexture(cv); _gauge.encoding = THREE.sRGBEncoding; return _gauge;
  }

  // ---- piers --------------------------------------------------------------------------------------------------------------------------
  const DECK_Y = 2.1, PIER_HW = 1.7;
  // pier: { x0, z0 (shore end), ux, uz (seaward), len, ramp, cx, cz, r, group, boats: [], head: { hw, hl } }
  function pierHit(p, x, z, y) {
    const dx = x - p.x0, dz = z - p.z0, a = dx * p.ux + dz * p.uz, l = Math.abs(dx * p.uz - dz * p.ux);
    if (a > -1 && a < p.len + 0.4 && l < PIER_HW + 0.2) return true;                     // the jetty's deck and piles
    if (a > p.len - 3.4 && a < p.len + 0.4 && l < p.headHW + 0.2) return true;           // its T-head
    return false;
  }
  function boatHit(o, x, z, pad) {
    const dx = x - o.pos.x, dz = z - o.pos.z, c = Math.cos(-o.yaw), s = Math.sin(-o.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < o.beam * 0.5 + pad && Math.abs(lz - o.zMid) < o.len * 0.5 + pad;
  }

  function planPier(x, z, a) {
    // from a point in the water, walk back to the shore along the bearing, then out until it is deep enough
    const ux = Math.sin(a), uz = Math.cos(a), H = world.sampleHeight;
    let shore = null;
    for (let r = 0; r < 120; r += 1) { const px = x - ux * r, pz = z - uz * r; if (H(px, pz) > 0.35) { shore = r; break; } }
    if (shore === null) return null;
    const x0 = x - ux * (shore + 4), z0 = z - uz * (shore + 4);            // four metres onto the land
    if (insideBuilding(x0, z0, 2) || world.bridgeY(x0, z0) !== null) return null;
    let len = 0;
    for (let r = 8; r <= 90; r += 2) {
      const px = x0 + ux * r, pz = z0 + uz * r, h = H(px, pz);
      if (h > 0.35 && r > 14) return null;                                  // back over land: a spit, not the open water
      if (insideBuilding(px, pz, PIER_HW + 1)) return null;
      len = r;
      if (h < -3.2 && r >= 26) break;
    }
    if (H(x0 + ux * len, z0 + uz * len) > -2.2) return null;
    // and the water either side of the outer half must be deep enough to moor in
    for (let r = len * 0.5; r <= len; r += 4) for (const s of [-1, 1]) { const px = x0 + ux * r + uz * s * 5.5, pz = z0 + uz * r - ux * s * 5.5; if (H(px, pz) > -1.2) return null; }
    return { x0, z0, ux, uz, len, a };
  }
  function overlaps(pl) {
    const mx = pl.x0 + pl.ux * pl.len / 2, mz = pl.z0 + pl.uz * pl.len / 2;
    if (piers.some(p => Math.hypot(p.cx - mx, p.cz - mz) < p.len / 2 + pl.len / 2 + 60)) return true;
    try { if (boats.list.some(b => Math.hypot(b.x - mx, b.z - mz) < pl.len / 2 + 20)) return true; } catch (e) { /* no scenic boats */ }
    return false;
  }

  function buildPier(root, pl, where, seed, kinds) {
    const R = k => rnd(seed, k, 7723);
    const { x0, z0, ux, uz, len } = pl, a = pl.a;
    const g0 = Math.max(0.4, world.surfaceY(x0, z0));
    const ramp = Math.min(10, Math.max(4, (DECK_Y - g0) * 4));
    const headHW = 7, headL = 3.2;
    const G = new THREE.Group(); G.position.set(x0, 0, z0); G.rotation.y = a;   // local: z seaward, x across (to the left)
    const K = Kit();
    const deck = marine("pier_deck", 2.4), pile = marine("pier_pile", 1.2), weed = marine("pile_weed", 0.8), steel = marine("stainless", 0.6, { metal: 0.85, rough: 0.9 });
    const timber = marine("pier_pile", 1.6, { tint: tint(0xb8a890) }), rope = marine("rope", 0.3, { tint: tint(0xe0d7bf) }), quay = marine("quay", 3.0);
    // the shore abutment: a concrete block the ramp climbs from
    K.add(boxM(PIER_HW * 2 + 0.6, Math.max(0.5, g0 + 0.6), 3.0), quay, 0, (g0 - 0.6) / 2 + 0.05, 1.5);
    // ramp, deck and T-head: planks over joists over cross-beams on piles
    const yAt = s => (s < ramp ? g0 + (DECK_Y - g0) * (s / ramp) : DECK_Y);
    const step = 3.0;
    for (let s = 0; s < len; s += step) {
      const e = Math.min(len, s + step), y0 = yAt(s), y1 = yAt(e), mid = (s + e) / 2, ym = (y0 + y1) / 2, tilt = Math.atan2(y1 - y0, e - s);
      K.add(boxM(PIER_HW * 2, 0.08, (e - s) / Math.cos(tilt) + 0.02), deck, 0, ym - 0.04, mid, -tilt);
      [-1, 1].forEach(sd => K.add(boxM(0.12, 0.25, (e - s) / Math.cos(tilt)), timber, sd * (PIER_HW - 0.15), ym - 0.2, mid, -tilt));
      // a bent of piles where the deck is over the water (or near it)
      if (world.sampleHeight(x0 + ux * s, z0 + uz * s) < 0.6 || s >= ramp) {
        const bed = Math.min(world.sampleHeight(x0 + ux * s, z0 + uz * s), y0 - 0.5);
        const top = y0 - 0.3, h = top - bed + 0.5;
        [-1, 1].forEach(sd => {
          K.add(cylM(0.17, 0.19, h, 10), pile, sd * (PIER_HW - 0.1), bed - 0.5 + h / 2, s);
          if (bed < 0.2) K.add(cylM(0.2, 0.21, 1.6, 10), weed, sd * (PIER_HW - 0.1), Math.max(bed + 0.8, -0.6), s);
        });
        K.add(boxM(PIER_HW * 2 + 0.4, 0.22, 0.2), timber, 0, top, s);
        if (bed < -1) [-1, 1].forEach(sd => K.add(boxM(0.08, Math.min(3, top - bed) * 1.3, 0.14), timber, 0, (top + Math.max(bed, top - 3)) / 2, s, 0, 0, sd * 0.8));
      }
      // handrails up the ramp and along the shore half, rope-and-post along the rest
      if (s < len * 0.45) [-1, 1].forEach(sd => {
        K.add(boxM(0.1, 1.0, 0.1), timber, sd * (PIER_HW - 0.05), y0 + 0.5, s);
        K.add(boxM(0.08, 0.08, (e - s) / Math.cos(tilt)), timber, sd * (PIER_HW - 0.05), ym + 1.0, mid, -tilt);
      });
    }
    // T-head
    K.add(boxM(headHW * 2, 0.1, headL), deck, 0, DECK_Y - 0.05, len - headL / 2);
    for (let x = -headHW + 0.3; x <= headHW - 0.3; x += 2.8) {
      const bx = x0 + ux * len + uz * x, bz = z0 + uz * len - ux * x, bed = Math.min(-0.5, world.sampleHeight(bx, bz)), h = DECK_Y - 0.3 - bed + 0.5;
      [0.2, headL - 0.2].forEach(dz => { K.add(cylM(0.17, 0.19, h, 10), pile, x, bed - 0.5 + h / 2, len - dz); K.add(cylM(0.2, 0.21, 1.6, 10), weed, x, -0.6, len - dz); });
    }
    K.add(boxM(headHW * 2, 0.22, 0.2), timber, 0, DECK_Y - 0.3, len - 0.2);
    // bollards along both edges, a lamp every nine metres, a life ring, ladders down to the water
    const lampAt = [];
    for (let s = ramp + 2; s < len - 1; s += 4.5) [-1, 1].forEach(sd => K.add(cylM(0.11, 0.13, 0.4, 10), marine("gelcoat", 1.0, { tint: tint(0x2a2c30) }), sd * (PIER_HW - 0.25), DECK_Y + 0.2, s));
    for (let s = ramp; s < len; s += 9) lampAt.push(s);
    lampAt.forEach((s, i) => {
      const sd = i % 2 ? 1 : -1;
      K.add(cylM(0.05, 0.07, 3.6, 8), marine("gelcoat", 1.0, { tint: tint(0x2b3238) }), sd * (PIER_HW - 0.1), DECK_Y + 1.8, s);
      K.add(boxM(0.5, 0.06, 0.12), marine("gelcoat", 1.0, { tint: tint(0x2b3238) }), sd * (PIER_HW - 0.35), DECK_Y + 3.55, s);
      K.add(boxM(0.22, 0.08, 0.16), lampMat(0xffd9a0), sd * (PIER_HW - 0.55), DECK_Y + 3.48, s);
    });
    K.add(new THREE.TorusGeometry(0.36, 0.08, 10, 24), marine("canvas", 0.3, { tint: tint(0xe0451c) }), PIER_HW - 0.1, DECK_Y + 1.0, ramp + 3, 0, Math.PI / 2, 0);
    K.add(boxM(0.1, 1.3, 0.1), timber, PIER_HW - 0.05, DECK_Y + 0.65, ramp + 3.45);
    [len * 0.6, len - 3.4].forEach((s, i) => {
      const sd = i ? -1 : 1;
      [-0.22, 0.22].forEach(o => K.add(cylM(0.02, 0.02, DECK_Y + 0.8, 6), steel, sd * (PIER_HW + 0.05), (DECK_Y + 0.8) / 2 - 0.8, s + o));
      for (let y = -0.6; y < DECK_Y; y += 0.3) K.add(cylM(0.016, 0.016, 0.44, 6), steel, sd * (PIER_HW + 0.05), y, s, Math.PI / 2);
    });
    // a sign at the shore end
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshStandardMaterial({ map: signTex(where), roughness: 0.6 }));
    sg.position.set(-PIER_HW - 0.06, g0 + 1.6, 0.8); sg.rotation.y = -Math.PI / 2; G.add(sg);
    K.add(boxM(0.1, 1.9, 0.1), timber, -PIER_HW - 0.1, g0 + 0.95, 0.2); K.add(boxM(0.1, 1.9, 0.1), timber, -PIER_HW - 0.1, g0 + 0.95, 1.4);
    K.build(G);
    root.add(G);

    // walking: the ramp, the deck, the T-head (world.walk), and a bridge entry so the waterline does not stop Seiko
    const W2 = (lx, lz) => [x0 + ux * lz + uz * lx, z0 + uz * lz - ux * lx];
    const c = Math.cos(a), s = Math.sin(a);
    const rc = W2(0, ramp / 2), dc = W2(0, (ramp + len) / 2), hc = W2(0, len - headL / 2);
    world.walk.push({ cx: rc[0], cz: rc[1], c: c, s: s, hw: PIER_HW, hl: ramp / 2, ya: g0, yb: DECK_Y, r: Math.hypot(PIER_HW, ramp / 2) + 1, pier: true });
    world.walk.push({ cx: dc[0], cz: dc[1], c: c, s: s, hw: PIER_HW, hl: (len - ramp) / 2, ya: DECK_Y, yb: DECK_Y, r: Math.hypot(PIER_HW, (len - ramp) / 2) + 1, pier: true });
    world.walk.push({ cx: hc[0], cz: hc[1], c: c, s: s, hw: headHW, hl: headL / 2, ya: DECK_Y, yb: DECK_Y, r: Math.hypot(headHW, headL / 2) + 1, pier: true });
    const A = W2(0, 0), Bp = W2(0, len);
    world.bridges.push({ ax: A[0], az: A[1], ux: ux, uz: uz, len: len, hw: PIER_HW, ya: g0, yb: DECK_Y, x0: Math.min(A[0], Bp[0]) - headHW, x1: Math.max(A[0], Bp[0]) + headHW, z0: Math.min(A[1], Bp[1]) - headHW, z1: Math.max(A[1], Bp[1]) + headHW, pier: true });
    const H0 = W2(-headHW, len - headL / 2), H1 = W2(headHW, len - headL / 2);
    world.bridges.push({ ax: H0[0], az: H0[1], ux: (H1[0] - H0[0]) / (2 * headHW), uz: (H1[1] - H0[1]) / (2 * headHW), len: 2 * headHW, hw: headL / 2, ya: DECK_Y, yb: DECK_Y, x0: Math.min(H0[0], H1[0]) - headL, x1: Math.max(H0[0], H1[0]) + headL, z0: Math.min(H0[1], H1[1]) - headL, z1: Math.max(H0[1], H1[1]) + headL, pier: true });

    const mid = W2(0, len / 2);
    const P = { x0, z0, ux, uz, a, len, ramp, headHW, cx: mid[0], cz: mid[1], r: len / 2 + headHW + 4, group: G, boats: [], where: where, root: root };
    piers.push(P);
    // berths: alongside the outer part of the jetty, both sides, bows out to sea, and along the T-head's outer face
    const berths = [];
    for (const sd of [-1, 1]) for (let s0 = len - headL - 2; s0 > Math.max(ramp + 4, len * 0.35); ) {
      berths.push({ side: sd, s: s0 }); s0 -= 9.5;
    }
    let bi = 0;
    for (const b of berths) {
      if (bi >= kinds.length) break;
      const kind = kinds[bi];
      const sp = SHIGOTO.BOAT_SPECS[kind], off = PIER_HW + sp.B / 2 + 0.55;
      const along = b.s - sp.L * 0.5 + (0.5 - sp.cg) * sp.L * 0;              // the bow just short of the berth mark
      const p = W2(b.side * off, along);
      // deep enough under the whole hull?
      let ok = true;
      for (const t of [-0.5, 0, 0.5]) for (const w of [-0.5, 0.5]) { const q = W2(b.side * off + w * sp.B, along + t * sp.L); if (world.sampleHeight(q[0], q[1]) > -(sp.H * 0.7 + 0.4)) ok = false; }
      if (!ok) continue;
      const boat = addBoat(root, kind, seed * 31 + bi, p[0], p[1], a, P);
      P.boats.push(boat); bi++;
    }
    return P;
  }
  function signTex(where) {
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 160; const g = cv.getContext("2d");
    g.fillStyle = "#14324f"; g.fillRect(0, 0, 512, 160); g.strokeStyle = "#f2efe6"; g.lineWidth = 6; g.strokeRect(8, 8, 496, 144);
    g.fillStyle = "#f2efe6"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "800 54px " + (typeof UI === "string" ? UI : "sans-serif"); g.fillText("桟橋", 256, 58);
    g.font = "700 30px " + (typeof UI === "string" ? UI : "sans-serif"); g.fillText((where || "PIER").toUpperCase() + "  ·  PIER", 256, 116);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t;
  }

  // ---- the fleet --------------------------------------------------------------------------------------------------------------------
  const restCache = {};
  function restOf(kind) {
    // where the cg sits above the water when the hull is at rest (settled once per kind on a flat sea)
    if (restCache[kind]) return restCache[kind];
    const b = new SHIGOTO.Boat(kind), flat = { sea: new SHIGOTO.Ocean({ amp: 0 }), ground: () => -50 };
    b.reset({ x: 0, z: 0, yaw: 0, y: 0.2 });
    for (let i = 0; i < 400; i++) b.step(1 / 60, {}, flat);
    return (restCache[kind] = { y: b.pos[1], trim: b.trim, hull: b.hull });
  }
  function addBoat(root, kind, seed, x, z, yaw, pier) {
    const m = makeBoatModel(kind, seed), sp = SHIGOTO.BOAT_SPECS[kind], rest = restOf(kind);
    if (m.waterOffset && m.model) m.model.position.y = -rest.y;
    const o = { kind: kind, model: m, obj: m.group, pos: new THREE.Vector3(x, rest.y, z), yaw: yaw, berth: { x: x, z: z, yaw: yaw }, pier: pier,
                state: "moored", stolen: false, phys: null, len: sp.L, beam: sp.B, ph: Math.random() * 6.28, rest: rest,
                zMid: rest.hull.zT + sp.L / 2, root: root };
    m.group.position.copy(o.pos); m.group.rotation.set(0, yaw, 0);
    root.add(m.group);
    fleet.push(o);
    return o;
  }

  // ---- building them: round the mainland's coast with the scenic boats, and on each holiday island when it is built ----------------
  function buildPiers(root, w) {
    piers.filter(p => p.root === root).forEach(p => { root.remove(p.group); p.boats.forEach(b => root.remove(b.obj)); });
    for (let i = piers.length - 1; i >= 0; i--) if (piers[i].root === root) piers.splice(i, 1);
    for (let i = fleet.length - 1; i >= 0; i--) if (fleet[i].root === root) fleet.splice(i, 1);
    let seed = 1;
    (w.cities || []).forEach((city, ci) => {
      if (!city.plots || !city.plots.length) return;
      const c = [0, 0]; city.plots.forEach(p => { c[0] += p.centre[0] / city.plots.length; c[1] += p.centre[1] / city.plots.length; });
      const capital = ci === 0, coastal = city.site && city.site.coastal;
      if (!capital && !coastal) return;
      const spots = shoreSpots(c[0], c[1], capital ? 2800 : 1100, 3.0, capital ? 72 : 36);
      const want = capital ? 4 : 1 + (rnd(ci, 1, 7731) < 0.5 ? 1 : 0);
      const name = city.name || (capital ? "Tōkonto" : "Harbour");
      let made = 0;
      const order = spots.map((s, i) => [s, rnd(i, ci, 7733)]).sort((a, b) => a[1] - b[1]).map(q => q[0]);
      for (const sp of order) {
        if (made >= want) break;
        const pl = planPier(sp.x, sp.z, sp.a); if (!pl || overlaps(pl)) continue;
        const kinds = capital ? (made % 2 ? ["runabout", "jetski", "rib", "skiff", "jetski", "gyosen"] : ["rib", "runabout", "jetski", "gyosen", "skiff", "jetski"])
                              : ["skiff", "gyosen", "rib", "jetski", "runabout"];
        try { buildPier(root, pl, name, seed++, kinds); made++; } catch (e) { console.warn("[Konto] a pier could not be built:", e); }
      }
    });
    console.log("[Konto] " + piers.length + " piers, " + fleet.length + " boats moored");
  }
  function buildIslandPiers(site) {
    if (!site || !site.group || site.piers) return;
    site.piers = [];
    const spots = shoreSpots(site.cx, site.cz, Math.max(site.hx, site.hz), 3.0, 40);
    const want = site.id === "seoul" ? 1 : 2;
    const order = spots.map((s, i) => [s, rnd(i, site.id.length, 7741)]).sort((a, b) => a[1] - b[1]).map(q => q[0]);
    let made = 0;
    for (const sp of order) {
      if (made >= want) break;
      const pl = planPier(sp.x, sp.z, sp.a); if (!pl || overlaps(pl)) continue;
      // keep inside the island's own box, so it is drawn with it
      if (Math.abs(pl.x0 + pl.ux * pl.len - site.cx) > site.hx - 10 || Math.abs(pl.z0 + pl.uz * pl.len - site.cz) > site.hz - 10) continue;
      const kinds = site.id === "kohana" ? ["jetski", "runabout", "jetski", "rib"] : site.id === "ryujima" ? ["gyosen", "skiff", "rib", "jetski"] : ["runabout", "rib", "jetski"];
      try { site.piers.push(buildPier(site.group, pl, (typeof AIR_DESTS !== "undefined" && AIR_DESTS[site.id] && AIR_DESTS[site.id].name) || site.id, 500 + made, kinds)); made++; } catch (e) { console.warn("[Konto] island pier:", e); }
    }
    console.log("[Konto] " + site.id + ": " + made + " piers");
  }
  const _buildBoats = window.buildBoats;
  if (typeof _buildBoats === "function") window.buildBoats = function (root, w) { const r = _buildBoats.apply(this, arguments); try { buildPiers(root, w); } catch (e) { console.warn("[Konto] piers:", e); } return r; };
  const _destEnsure = window.destEnsure;
  if (typeof _destEnsure === "function") window.destEnsure = function (id) { const s = _destEnsure.apply(this, arguments); try { buildIslandPiers(s); } catch (e) { console.warn("[Konto] island piers:", e); } return s; };

  // ---- each frame: moored boats ride the swell; a boat left adrift is still simulated near you -------------------------------------
  const SAMP = {};
  function bob(o, t) {
    const sp = SHIGOTO.BOAT_SPECS[o.kind], c = Math.cos(o.yaw), s = Math.sin(o.yaw), zm = o.zMid;
    const at = (lx, lz) => sea.sample(o.pos.x + lx * c + lz * s, o.pos.z - lx * s + lz * c, SAMP).y;
    const hb = at(0, zm + sp.L * 0.35), hs = at(0, zm - sp.L * 0.35), hp = at(sp.B * 0.4, zm), hq = at(-sp.B * 0.4, zm);
    const y = (hb + hs + hp + hq) / 4 + o.rest.y;
    // a hull has inertia: it follows the water a little behind and short of it
    o.pos.y += (y - o.pos.y) * 0.25;
    const pitch = -Math.atan2(hb - hs, sp.L * 0.7) * 0.75 - o.rest.trim, roll = Math.atan2(hp - hq, sp.B * 0.8) * 0.6;
    // swinging a little on its lines
    const sway = o.state === "moored" ? Math.sin(t * 0.21 + o.ph) * 0.025 : 0;
    o.obj.position.set(o.pos.x, o.pos.y, o.pos.z);
    o.obj.rotation.set(pitch, o.yaw + sway, roll, "YXZ");
  }
  let visT = 0;
  function fleetTick(dt) {
    if (!fleet.length) return;
    seaSync();
    const cam = camera.position;
    visT -= dt;
    const doVis = visT <= 0; if (doVis) visT = 0.4;
    for (let i = 0; i < fleet.length; i++) {
      const o = fleet[i];
      if (o === ride.boat) continue;
      const d = Math.hypot(o.pos.x - cam.x, o.pos.z - cam.z);
      if (doVis) o.obj.visible = d < 900 && (!o.obj.parent || o.obj.parent.visible !== false);
      if (o.state === "adrift" && o.phys && d < 350) {
        o.phys.step(dt, { throttle: 0 }, W);
        fromPhys(o);
        if (o.phys.capsized > 4) sink(o);
        continue;
      }
      if (d < 600) bob(o, clock);
    }
    piersVis(doVis);
    ride.t += dt;
  }
  function piersVis(doVis) {
    if (!doVis) return;
    const cam = camera.position;
    for (const p of piers) p.group.visible = Math.hypot(p.cx - cam.x, p.cz - cam.z) < 1400;
  }
  function fromPhys(o) {
    const P = o.phys;
    o.pos.set(P.pos[0], P.pos[1], P.pos[2]); o.yaw = P.yaw;
    o.obj.position.copy(o.pos); o.obj.quaternion.set(P.quat[0], P.quat[1], P.quat[2], P.quat[3]);
  }
  function sink(o) {
    o.state = "gone"; o.obj.visible = false; o.phys = null;
  }

  // ---- getting in -------------------------------------------------------------------------------------------------------------------
  function boatNear() {
    if (!player.placed || player.mode !== "walk" || drive.car || drive.train || ride.boat || player.down > 0) return null;
    const px = player.pos.x, pz = player.pos.z;
    let best = null, bd = 4.2;
    for (const o of fleet) {
      if (o.state === "gone") continue;
      if (Math.abs(o.pos.x - px) > 20 || Math.abs(o.pos.z - pz) > 20) continue;
      // distance from Seiko to the hull's side (a box test, then how far outside it)
      const dx = px - o.pos.x, dz = pz - o.pos.z, c = Math.cos(-o.yaw), s = Math.sin(-o.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c - o.zMid;
      const ex = Math.max(0, Math.abs(lx) - o.beam / 2), ez = Math.max(0, Math.abs(lz) - o.len / 2);
      const d = Math.hypot(ex, ez);
      if (Math.abs(player.pos.y - o.pos.y) > 3.2) continue;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  function board(o) {
    const sp = SHIGOTO.BOAT_SPECS[o.kind];
    if (!o.phys) {
      o.phys = new SHIGOTO.Boat(o.kind);
      o.phys.reset({ x: o.pos.x, z: o.pos.z, yaw: o.yaw, y: o.pos.y });
    }
    o.state = "ride"; ride.boat = o; ride.crank = o.stolen ? 0.5 : 1.1; ride.leaveTap = -9; ride.t = 0;
    ride.look0 = { yaw: yaw, pitch: pitch }; ride.lookIdle = 0; ride.lastYaw = yaw; ride.lastPitch = pitch;
    if (!o.stolen) {
      o.stolen = true;
      try { commitCrime("boatTheft", player.pos.clone()); } catch (e) { /* no police */ }
      say("You untie the " + sp.name.toLowerCase() + " and climb in. It isn't yours.", 4);
    } else say("Back aboard.", 2);
    player.speed = 0;
    player.forceClip = o.model.sit && player.clips && player.clips.sit ? "sit" : null;
    if (player.obj) player.obj.visible = o.model.seikoVisible;
    showHud(true);
    hint(o.kind);
  }
  function hint(kind) {
    const padOn = typeof pad === "object" && pad.index >= 0;
    say("W throttle · S astern · A/D steer · Shift trim up, Ctrl trim down" + (kind === "jetski" ? " · a jet ski only steers with the throttle open" : "") + " · F step off alongside" + (padOn ? " · pad: RT/LT, stick, " + padLabel("Y") + " step off" : ""), 8);
  }

  // ---- getting out ------------------------------------------------------------------------------------------------------------------
  function exitSpot(o) {
    const P = o.phys, sp = SHIGOTO.BOAT_SPECS[o.kind];
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    const tries = [];
    for (const d of [0.7, 1.3, 2.2, 3.4]) for (const sd of [1, -1]) for (const t of [0, 0.25, -0.25]) tries.push([sd * (sp.B / 2 + d), o.zMid + t * sp.L]);
    for (const d of [0.8, 1.8]) { tries.push([0, o.zMid + sp.L / 2 + d]); tries.push([0, o.zMid - sp.L / 2 - d]); }
    for (const q of tries) {
      const x = o.pos.x + q[0] * c + q[1] * s, z = o.pos.z - q[0] * s + q[1] * c;
      const wy = world.walkY(x, z, o.pos.y + 3);
      if (world.walkOn && wy > -0.2) return [x, wy, z];
      const h = world.sampleHeight(x, z);
      if (h > 0.3 && !insideBuilding(x, z, 0.45)) return [x, world.surfaceY(x, z), z];
    }
    void P;
    return null;
  }
  function swimSpot(x, z) {
    for (let r = 4; r < 400; r += 4) for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      if (world.sampleHeight(px, pz) > 0.4 && !insideBuilding(px, pz, 0.5)) return [px, world.surfaceY(px, pz), pz];
    }
    return null;
  }
  function leave(force) {
    const o = ride.boat; if (!o) return false;
    const P = o.phys;
    const spot = Math.abs(P.speed) < 2.5 ? exitSpot(o) : null;
    let at = spot;
    if (!at) {
      if (Math.abs(P.speed) >= 2.5 && !force) { say("Slow down first.", 2); return false; }
      if (clock - ride.leaveTap > 1.6 && !force) { ride.leaveTap = clock; say("Nowhere to step off here. Bring her alongside a pier or onto a beach, or press F again to swim for it.", 4); return false; }
      at = swimSpot(o.pos.x, o.pos.z);
      if (!at) { say("Too far from anywhere to swim.", 3); return false; }
      say("Over the side. You swim ashore, soaked through.", 4);
      try { vitals.stress = Math.min(1, vitals.stress + 0.08); } catch (e) { /* none */ }
    }
    o.state = "adrift"; ride.boat = null;
    player.forceClip = null;
    player.pos.set(at[0], at[1], at[2]); player.onWalk = world.walkOn; player.speed = 0;
    player.yaw = player.targetYaw = o.yaw;
    if (player.obj) { player.obj.visible = true; player.obj.position.copy(player.pos); player.obj.rotation.set(0, player.yaw, 0); }
    camPos.copy(player.pos).add(new THREE.Vector3(-Math.sin(o.yaw) * 5, 2.4, -Math.cos(o.yaw) * 5));
    showHud(false); engineSound(null);
    return true;
  }

  // ---- driving ----------------------------------------------------------------------------------------------------------------------
  function rideFrame(dt) {
    const o = ride.boat, P = o.phys;
    seaSync();
    const w = typeof wish === "function" ? wish() : { x: 0, y: 0 };
    let thr = clamp((pad.throttle || 0) + (keys.KeyW || keys.ArrowUp ? 1 : 0), 0, 1) - clamp((pad.brake || 0) + (keys.KeyS || keys.ArrowDown ? 1 : 0), 0, 1);
    const steer = clamp((keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + w.x, -1, 1);
    let trim = clamp((keys.ShiftLeft || keys.ShiftRight ? 1 : 0) - (keys.ControlLeft || keys.ControlRight ? 1 : 0) + w.y, -1, 1);
    if (ride.crank > 0) { ride.crank -= dt; thr = 0; if (ride.crank <= 0) say("The engine catches.", 1.5); }
    // stress gets into the hands here too
    const strain = typeof strainOf === "function" ? strainOf() : 0;
    const st = clamp(steer + Math.sin(clock * 2.3) * 0.2 * strain, -1, 1);
    const ev = P.step(dt, { throttle: thr, steer: st, trim: trim, lean: o.kind === "jetski" ? steer * 0.5 : 0 }, W);
    for (const e of ev) {
      if (e.type === "hit") { playCrash(Math.min(30, e.speed * 2)); drive.shake = Math.max(drive.shake || 0, clamp(e.speed / 8, 0.2, 1)); rumble(0.9, 0.7, 280); if (e.speed > 6) { vitals.health = clamp01(vitals.health - e.speed * 0.006); say("You've holed her.", 2); } }
      else if (e.type === "slam") { drive.shake = Math.max(drive.shake || 0, clamp(e.speed / 6, 0.15, 0.7)); rumble(0.6, 0.5, 200); spray(o, 1); }
      else if (e.type === "ground") { playCrash(Math.min(14, e.speed)); drive.shake = Math.max(drive.shake || 0, 0.5); say("Aground.", 2); }
    }
    if (P.capsized > 2.5) { say("She's gone over.", 3); leave(true); sink(o); return; }
    fromPhys(o);
    // the prop turns with the throttle
    o.model.props.forEach(pr => { pr.rotation.z += (P.throttleNow * 90 + 6 * Math.sign(P.throttleNow)) * dt; });
    // Seiko at the helm
    const helm = o.model.helm, hw = P.toWorld([helm[0], helm[1] - (player.forceClip === "sit" ? 0.44 : 0), helm[2]]);     // seated: the clip's hips sit about this far above its feet
    player.pos.set(hw[0], hw[1], hw[2]);
    player.yaw = player.targetYaw = P.yaw; player.speed = 0;
    if (player.obj) {
      player.obj.visible = o.model.seikoVisible && ride.cam !== 1;
      player.obj.position.copy(player.pos);
      player.obj.quaternion.set(P.quat[0], P.quat[1], P.quat[2], P.quat[3]);
      if (player.mixer) updateSeikoClip(dt);
    }
    wakeTick(o, dt);
    sprayTick(o, dt);
    camFrame(o, dt);
    engineSound(o);
    drawHud(o);
  }
  function camFrame(o, dt) {
    const P = o.phys, sp = SHIGOTO.BOAT_SPECS[o.kind];
    if (yaw !== ride.lastYaw || pitch !== ride.lastPitch) { ride.lookIdle = 0; ride.lastYaw = yaw; ride.lastPitch = pitch; } else ride.lookIdle += dt;
    // look round freely; let go and it drifts back behind the boat
    const behind = P.yaw + Math.PI;
    if (ride.lookIdle > 1.5) { let d = behind - yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; yaw += d * (1 - Math.pow(0.15, dt)); pitch += (-0.16 - pitch) * (1 - Math.pow(0.2, dt)); ride.lastYaw = yaw; ride.lastPitch = pitch; }
    const dist = sp.L * 1.2 + 4.5 + Math.min(4, Math.abs(P.speed) * 0.12);
    const head = new THREE.Vector3(o.pos.x, o.pos.y + sp.H + 0.9, o.pos.z);
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const want = head.clone().sub(dir.multiplyScalar(dist));
    const sy = sea.height(want.x, want.z), gy = world.surfaceY(clamp(want.x, 0, WORLD_X), clamp(want.z, 0, WORLD_Z));
    want.y = Math.max(want.y, sy + 1.2, gy + 1.2);
    camPos.lerp(want, 1 - Math.pow(0.002, dt));
    // the camera gets thrown about with the hull a little, not all of it
    const shake = drive.shake || 0;
    if (shake > 0) { camPos.x += (Math.random() - 0.5) * shake * 0.3; camPos.y += (Math.random() - 0.5) * shake * 0.3; drive.shake = Math.max(0, shake - dt * 2); }
    camera.position.copy(camPos);
    camera.lookAt(head);
  }

  // ---- wake, spray ------------------------------------------------------------------------------------------------------------------
  // The wake is three ribbons laid on the moving sea: the white prop wash straight behind, and the two arms of the Kelvin wedge spreading
  // at about 19 degrees either side, widening and fading as they age.
  const WAKE_N = 140;
  const wake = { pts: [], mesh: null, t: 0 };
  function wakeMaterial() {
    const m = new THREE.MeshStandardMaterial({ map: tex("foam", true, 4), alphaMap: tex("foam", false, 4), normalMap: tex("foam_nor", false, 4), roughnessMap: tex("foam_rough", false, 4),
      transparent: true, depthWrite: false, roughness: 0.6, color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2 });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float fade;\nvarying float vFade;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = fade;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vFade;").replace("#include <alphamap_fragment>", "#include <alphamap_fragment>\ndiffuseColor.a *= vFade;");
    };
    return m;
  }
  function wakeMesh() {
    if (wake.mesh) return wake.mesh;
    const n = WAKE_N * 3 * 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 3).map((v, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute("fade", new THREE.BufferAttribute(new Float32Array(n), 1));
    const idx = [];
    for (let r = 0; r < 3; r++) for (let i = 0; i < WAKE_N - 1; i++) { const a = (r * WAKE_N + i) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    g.setIndex(idx);
    const m = new THREE.Mesh(g, wakeMaterial()); m.frustumCulled = false; m.renderOrder = 2; m.receiveShadow = true;
    scene.add(m); wake.mesh = m;
    return m;
  }
  function wakeTick(o, dt) {
    const P = o.phys, sp = SHIGOTO.BOAT_SPECS[o.kind], m = wakeMesh();
    m.visible = true;
    wake.t += dt;
    const v = Math.max(0, P.speed);
    if (wake.t > 0.07) {
      wake.t = 0;
      const st = P.toWorld([0, 0, P.hull.zT]);
      const f = P.forward();
      wake.pts.unshift({ x: st[0], z: st[2], rx: -f[2], rz: f[0], fx: f[0], fz: f[2], v: v, age: 0, on: P.air > 0 ? 0 : clamp01((v - 0.8) / 6) });
      if (wake.pts.length > WAKE_N) wake.pts.length = WAKE_N;
    }
    const pos = m.geometry.attributes.position.array, uv = m.geometry.attributes.uv.array, fd = m.geometry.attributes.fade.array;
    const S = {};
    for (let i = 0; i < WAKE_N; i++) {
      const p = wake.pts[i];
      for (let r = 0; r < 3; r++) {
        const base = (r * WAKE_N + i) * 2;
        if (!p) { for (let k = 0; k < 2; k++) { fd[base + k] = 0; pos[(base + k) * 3 + 1] = -100; } continue; }
        if (r === 0) p.age += dt;
        const spread = r === 0 ? 0 : (r === 1 ? 1 : -1) * (sp.B * 0.45 + p.age * p.v * 0.33);
        const w = r === 0 ? sp.B * 0.35 + p.age * 0.6 : 0.5 + p.age * 0.35;
        const cx = p.x + p.rx * spread, cz = p.z + p.rz * spread;
        const life = clamp01(1 - p.age / (r === 0 ? 7 : 9)) * p.on * (r === 0 ? 0.95 : 0.7);
        for (let k = 0; k < 2; k++) {
          const sgn = k ? 1 : -1, x = cx + p.rx * w * 0.5 * sgn, z = cz + p.rz * w * 0.5 * sgn;
          const y = sea.sample(x, z, S).y + 0.04;
          const j = (base + k) * 3; pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
          uv[(base + k) * 2] = (x * p.fx + z * p.fz) / 1; uv[(base + k) * 2 + 1] = sgn * w * 0.5 + r * 7;
          fd[base + k] = life * (i < 2 ? i / 2 : 1);
        }
      }
    }
    m.geometry.attributes.position.needsUpdate = true; m.geometry.attributes.uv.needsUpdate = true; m.geometry.attributes.fade.needsUpdate = true;
  }
  const SPRAY_N = 360;
  const spr = { pts: null, list: [], i: 0 };
  function sprayPoints() {
    if (spr.pts) return spr.pts;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPRAY_N * 3).fill(-1000), 3));
    const mat = new THREE.PointsMaterial({ map: dropTex(), transparent: true, depthWrite: false, size: 0.35, sizeAttenuation: true, opacity: 0.75, color: 0xeef6ff });
    const p = new THREE.Points(g, mat); p.frustumCulled = false; scene.add(p); spr.pts = p;
    for (let i = 0; i < SPRAY_N; i++) spr.list.push({ x: 0, y: -1000, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
    return p;
  }
  let _drop = null;
  function dropTex() {
    if (_drop) return _drop;
    const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.5, "rgba(240,248,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); _drop = new THREE.CanvasTexture(cv); return _drop;
  }
  function spray(o, burst) {
    const P = o.phys, sp = SHIGOTO.BOAT_SPECS[o.kind];
    sprayPoints();
    const n = Math.round(burst * 40);
    const f = P.forward(), l = P.left();
    for (let k = 0; k < n; k++) {
      const q = spr.list[spr.i++ % SPRAY_N];
      const side = k % 2 ? 1 : -1, at = P.toWorld([side * sp.B * 0.45, P.hull.yK + 0.2, P.hull.zT + sp.L * (0.45 + Math.random() * 0.2)]);
      const v = Math.max(2, P.speed);
      q.x = at[0]; q.y = at[1]; q.z = at[2];
      q.vx = l[0] * side * (2 + Math.random() * 3) + f[0] * v * 0.3; q.vz = l[2] * side * (2 + Math.random() * 3) + f[2] * v * 0.3; q.vy = 2 + Math.random() * 3 * burst;
      q.life = 0.6 + Math.random() * 0.6;
    }
  }
  function sprayTick(o, dt) {
    const P = o.phys;
    if (P.planing && P.air === 0) spray(o, clamp01(P.speed / 30) * 0.18);
    if (!spr.pts) return;
    const a = spr.pts.geometry.attributes.position.array;
    for (let i = 0; i < SPRAY_N; i++) {
      const q = spr.list[i];
      if (q.life <= 0) { a[i * 3 + 1] = -1000; continue; }
      q.life -= dt; q.vy -= 9.81 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < sea.height(q.x, q.z)) q.life = 0;
      a[i * 3] = q.x; a[i * 3 + 1] = q.y; a[i * 3 + 2] = q.z;
    }
    spr.pts.geometry.attributes.position.needsUpdate = true;
  }

  // ---- sound: the engine note, and the hull through the water -------------------------------------------------------------------
  function engineSound(o) {
    try {
      if (!sound.ready || !sound.ctx) return;
      const ctx = sound.ctx;
      if (!o) { if (ride.snd) ride.snd.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2); return; }
      if (!ride.snd) {
        const e = buildEngine(), g = ctx.createGain(); g.gain.value = 0;
        e.out.disconnect(); e.out.connect(g); g.connect(ctx.destination);
        ride.snd = { e: e, gain: g };
      }
      const P = o.phys, r = P.rpm / 6600, now = ctx.currentTime, E = ride.snd.e;
      const base = o.kind === "gyosen" ? 18 : o.kind === "jetski" ? 40 : 30;
      E.oscs.forEach(q => q.osc.frequency.setTargetAtTime(base * (0.5 + r * 3.2) * q.mul, now, 0.06));
      E.filter.frequency.setTargetAtTime(300 + r * 2200 + P.vent * 1200, now, 0.08);
      E.out.gain.setTargetAtTime(0.14 + r * 0.22, now, 0.06);
      E.noise.gain.setTargetAtTime(0.02 + Math.min(0.12, Math.abs(P.speed) * 0.004 + (P.planing ? 0.03 : 0)), now, 0.1);
      ride.snd.gain.gain.setTargetAtTime(ride.crank > 0 ? 0.15 : 0.5, now, 0.15);
    } catch (e) { /* no audio */ }
  }

  // ---- HUD: speed in knots and km/h, revs, trim, on the plane ----------------------------------------------------------------------
  function showHud(on) {
    if (!ride.hud) {
      const h = document.createElement("div"); h.id = "boathud";
      h.style.cssText = "position:fixed;right:calc(2% + env(safe-area-inset-right,0px));bottom:calc(14% + env(safe-area-inset-bottom,0px));z-index:60;pointer-events:none;display:none";
      const c = document.createElement("canvas"); c.width = 300; c.height = 150; c.style.cssText = "width:min(300px,60vw);height:auto;display:block;filter:drop-shadow(0 4px 10px rgba(0,0,0,.5))";
      h.appendChild(c); document.body.appendChild(h); ride.hud = h; ride.hudC = c;
    }
    ride.hud.style.display = on ? "block" : "none";
    if (wake.mesh && !on) wake.mesh.visible = true;
  }
  function drawHud(o) {
    const c = ride.hudC; if (!c) return; const g = c.getContext("2d"), P = o.phys, Wd = c.width, Hd = c.height, F = "'Konto Sans','Segoe UI',sans-serif";
    g.clearRect(0, 0, Wd, Hd);
    g.fillStyle = "rgba(6,10,16,0.6)"; g.beginPath(); g.roundRect ? g.roundRect(2, 2, Wd - 4, Hd - 4, 14) : g.rect(2, 2, Wd - 4, Hd - 4); g.fill();
    const kn = Math.abs(P.speed) * 1.9438;
    g.fillStyle = "#fff"; g.textAlign = "left"; g.font = "800 46px " + F; g.fillText(String(Math.round(kn)), 18, 62);
    g.font = "700 15px " + F; g.fillStyle = "#9db"; g.fillText("KNOTS   " + Math.round(Math.abs(P.speed) * 3.6) + " km/h" + (P.speed < -0.3 ? "  ASTERN" : ""), 18, 84);
    // revs
    const r = clamp01(P.rpm / (o.kind === "gyosen" ? 3600 : 6600));
    g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(18, 100, Wd - 36, 10);
    g.fillStyle = r > 0.9 ? "#ff6b5a" : "#7df0a8"; g.fillRect(18, 100, (Wd - 36) * r, 10);
    g.font = "600 12px " + F; g.fillStyle = "#cfe"; g.fillText(Math.round(P.rpm) + " rpm" + (P.vent > 0.4 ? "  · prop out of the water" : ""), 18, 128);
    // trim and status
    g.textAlign = "right"; g.font = "700 14px " + F; g.fillStyle = "#fff";
    g.fillText("TRIM " + (P.trimNow >= 0 ? "+" : "") + Math.round(P.trimNow * 100) + "%", Wd - 18, 30);
    g.fillStyle = P.planing ? "#7df0a8" : "#9db"; g.fillText(ride.crank > 0 ? "STARTING" : P.grounded ? "AGROUND" : P.air > 0.1 ? "AIRBORNE" : P.planing ? "ON THE PLANE" : Math.abs(P.speed) > 1 ? "UNDER WAY" : "IDLE", Wd - 18, 52);
    g.fillStyle = "#9db"; g.font = "600 12px " + F; g.fillText(SHIGOTO.BOAT_SPECS[o.kind].name, Wd - 18, 72);
  }

  // ---- the game's own functions, wrapped -------------------------------------------------------------------------------------------
  // On a boat Seiko is still "walking" as far as the rest of the game knows (so the people, the traffic, the police and the HUD all run as
  // they do on foot); the frame that would move him on foot moves the boat instead.
  const _updateWalk = window.updateWalk;
  if (typeof _updateWalk === "function") window.updateWalk = function (dt) {
    if (ride.boat) { try { rideFrame(dt); } catch (e) { console.warn("[Konto] boat frame:", e); leave(true); } return; }
    return _updateWalk.apply(this, arguments);
  };
  const _useRide = window.useRide;
  if (typeof _useRide === "function") window.useRide = function () {
    if (ride.boat) { leave(false); return; }
    const o = boatNear();
    if (o) { board(o); return; }
    return _useRide.apply(this, arguments);
  };
  const _prompt = window.updatePrompt;
  if (typeof _prompt === "function") window.updatePrompt = function () {
    if (ride.boat) { setPromptText(Math.abs(ride.boat.phys.speed) < 2.5 && exitSpot(ride.boat) ? "Step off" : null); return; }
    const o = boatNear();
    if (o) { setPromptText(o.stolen ? "Take the " + SHIGOTO.BOAT_SPECS[o.kind].name.toLowerCase() : "Steal the " + SHIGOTO.BOAT_SPECS[o.kind].name.toLowerCase()); return; }
    return _prompt.apply(this, arguments);
  };
  const _gunArmed = window.gunArmed;
  if (typeof _gunArmed === "function") window.gunArmed = function () { return ride.boat ? false : _gunArmed.apply(this, arguments); };
  const _hail = window.hailTaxi;
  if (typeof _hail === "function") window.hailTaxi = function () { if (ride.boat) return; return _hail.apply(this, arguments); };
  // wherever Seiko is, the game asks playerAt(); on a boat that is the boat
  const _tick = window.tick;
  window.tick = function (dt) {
    try { if (typeof title === "object" && !title.on && world && world.cities) fleetTick(Number.isFinite(dt) ? Math.min(dt, 0.1) : 0); } catch (e) { console.warn("[Konto] boats:", e); }
    if (!ride.boat && wake.mesh && wake.pts.length) { wake.pts.forEach(p => { p.age += dt; }); if (wake.pts[0].age > 10) { wake.pts.length = 0; wake.mesh.visible = false; } }
    return _tick.apply(this, arguments);
  };

  // ---- the crime -----------------------------------------------------------------------------------------------------------------
  try { CRIMES.boatTheft = { stars: 1, what: "Stealing a boat" }; } catch (e) { /* no police in this build */ }
  try {
    if (window.standing && standing.honor) {
      standing.honor.define("boatTheft", { delta: -5, label: "Stole a boat", icon: "boat", cooldown: 20 });
      if (standing.hud && standing.hud.icons) standing.hud.icons.boat = '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path d="M3 15h18l-2.6 4.2a2 2 0 01-1.7.8H7.3a2 2 0 01-1.7-.8zM11 4h1.6l5.4 9H11zM9.5 7.5V13H5.2z" fill="currentColor"/></svg>';
    }
  } catch (e) { /* standing off */ }

  // ---- the map: an anchor at every pier --------------------------------------------------------------------------------------------
  if (window.career) {
    const _icons = career.mapIcons;
    career.mapIcons = function (ctx, toScreen, opts) {
      if (_icons) try { _icons.apply(this, arguments); } catch (e) { /* theirs */ }
      const small = opts && opts.labels === false;
      piers.forEach(p => {
        const q = toScreen(p.x0 + p.ux * p.len, p.z0 + p.uz * p.len), r = small ? 6 : 8;
        ctx.save(); ctx.fillStyle = "#1d5fa8"; ctx.strokeStyle = "#0b1622"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.beginPath();
        ctx.moveTo(q[0], q[1] - r * 0.6); ctx.lineTo(q[0], q[1] + r * 0.55); ctx.moveTo(q[0] - r * 0.35, q[1] - r * 0.25); ctx.lineTo(q[0] + r * 0.35, q[1] - r * 0.25);
        ctx.moveTo(q[0] - r * 0.55, q[1] + r * 0.1); ctx.quadraticCurveTo(q[0] - r * 0.4, q[1] + r * 0.6, q[0], q[1] + r * 0.55); ctx.quadraticCurveTo(q[0] + r * 0.4, q[1] + r * 0.6, q[0] + r * 0.55, q[1] + r * 0.1);
        ctx.stroke(); ctx.restore();
      });
    };
  }

  // ---- built behind the loading screen ---------------------------------------------------------------------------------------------
  (window.PERSIST_EXTRA = window.PERSIST_EXTRA || []).push(function (P, facts) {
    P.stage("boats", 0.3, async () => {
      // the islands are built in the holidays stage (and get their piers then); make sure each has them, and settle every hull type once
      try { DEST.sites.forEach(s => { if (s.built) buildIslandPiers(s); }); } catch (e) { /* no islands */ }
      Object.keys(SHIGOTO.BOAT_SPECS).forEach(restOf);
      facts.piers = piers.length; facts.boats = fleet.length;
    });
  });

  // ---- HARBOUR: the nearest pier -----------------------------------------------------------------------------------------------------
  function goPier(i) {
    if (!piers.length) { say("No piers on this map.", 3); return; }
    const at = typeof playerAt === "function" ? playerAt() : player.pos;
    const p = i !== undefined ? piers[i % piers.length] : piers.slice().sort((a, b) => Math.hypot(a.cx - at.x, a.cz - at.z) - Math.hypot(b.cx - at.x, b.cz - at.z))[0];
    if (ride.boat) leave(true);
    if (drive.car && typeof leaveCar === "function") leaveCar();
    if (typeof interiorLeave === "function" && interior && interior.active) interiorLeave(true);
    const s = p.len - 6, x = p.x0 + p.ux * s, z = p.z0 + p.uz * s;
    player.pos.set(x, world.walkY(x, z, 99), z); player.onWalk = true;
    player.yaw = player.targetYaw = Math.atan2(p.ux, p.uz);
    if (player.obj) player.obj.position.copy(player.pos);
    camPos.set(x - p.ux * 5, player.pos.y + 2.4, z - p.uz * 5);
    say(p.where + " pier. " + p.boats.filter(b => b.state === "moored").length + " boats tied up.", 4);
  }
  try { CHEAT_ACTIONS.HARBOUR = { dial: "5550888", note: "", fn: () => goPier() }; } catch (e) { /* no cheat table */ }

  console.log("[Konto] boats: Shigoto " + SHIGOTO.VERSION);
})();
