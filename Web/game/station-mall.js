// ---- Station mall: Tōkonto Central as a three-floor station building, and every station walked up to its platforms (2026-11-20) ----------
// Duncan: "Tōkonto station should be a major shopping mall with three floors which you go up via escalator or stairs, manually, no
// screens. The platforms are on the middle floor ... stations go up to the platform with stairs or escalator. Each station has at least a
// convenience store. Platforms have vending machines for lots of different things. Fill the station floors with souvenirs and props."
//
//   CENTRAL   one building, three storeys round a glass-roofed atrium (Tōkonto Station City): 1F street concourse with the souvenir fair,
//             info desk, lockers, ramen, pharmacy and books; 2F the platform floor, with the ticket gates, the paid concourse and the
//             passages out to the platforms, the konbini, ekiben and café; 3F restaurants and fashion (Suit Select, Machi Street, sushi).
//             Two pairs of escalators (up and down) and two staircases zig-zag through the atrium; you ride or climb them, no lift menu.
//   LOCAL     every other station: the street concourse with its konbini (and a ramen counter), then stairs and an up and a down
//             escalator to the gate floor at the height of the line, the paid side with its vending machines, and the platform passage.
//   WALKING   a room can now have levels: slabs with holes, ramps (stairs and escalators, which carry you), colliders per level. The
//             player's height inside a room is interior.room.curY; konto.html adds it where it used to pin the player to the floor.
//   PEOPLE    the concourse crowd walks every floor and rides the escalators.
//   PLATFORMS vending machine banks on every platform of every station: cold drinks, hot drinks, coffee, ice cream, snacks, cup noodles,
//             umbrellas, newspapers, souvenirs, phone chargers, masks, flowers and capsule toys. Each one sells what it shows (E).
//   TRAINS    the carriage window: glass with a faint reflection and grime, and the camera rides the bogies (sway, bounce, lean).
// Off: ?stationmall=0 (the old rooms with the lift come back). Console: StationMall.report().
(function () {
  "use strict";
  if (/[?&]stationmall=0\b/.test(location.search) || typeof THREE !== "object") return;
  if (window.StationMall && window.StationMall.dispose) try { window.StationMall.dispose(); } catch (e) { /* a reload in the console */ }
  const M = window.StationMall = { version: "1.0.0", rooms: 0, vending: 0, people: 0, errors: [] };
  const TAU = Math.PI * 2;
  const tierName = () => (typeof gfx === "object" && gfx && gfx.tier) || "high";
  const lean = () => tierName() === "low" || !!(window.GPU_GUARD && GPU_GUARD.on) || !!(typeof gfx === "object" && gfx && gfx.lean);
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = a => a[Math.floor(rnd() * a.length) % a.length];
  const UIF = () => (typeof UI === "string" ? UI : "sans-serif");

  // ---- materials: every surface from a tileable PBR set (colour, normal, roughness), UVs in metres -----------------------------------
  const loader = new THREE.TextureLoader(), texCache = new Map();
  const aniso = () => { try { return Math.min(lean() ? 4 : 8, renderer.capabilities.getMaxAnisotropy()); } catch (e) { return 4; } };
  function tex(path, srgb, tile) {
    const key = path + "|" + tile;
    if (texCache.has(key)) return texCache.get(key);
    const t = loader.load(path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / tile, 1 / tile); t.anisotropy = aniso();
    if (srgb) t.encoding = THREE.sRGBEncoding;
    texCache.set(key, t); return t;
  }
  const SETS = {
    granite:   ["art/station/granite_col.jpg", "art/station/granite_nor.jpg", "art/station/granite_rough.jpg", 1.2, 0x9a9ea4, 0, 1, 0.35],
    terrazzo:  ["art/interior/interior_tiles.jpg", "art/interior/interior_tiles_nor.jpg", "art/pbr/tile_rough.jpg", 2.4, 0xf2efe8, 0, 0.8, 0.5],
    limestone: ["art/pbr/paint_col.jpg", "art/pbr/paint_nor.jpg", "art/pbr/stone_rough.jpg", 1.5, 0xefece6, 0, 0.7, 0.4],
    plaster:   ["art/interior/white_plaster_02.jpg", "art/interior/white_plaster_02_nor.jpg", "art/pbr/paint_rough.jpg", 2.5, 0xf4f3ef, 0, 0.9, 0.35],
    steel:     ["art/pbr/metal_col.jpg", "art/pbr/metal_nor.jpg", "art/pbr/metal_rough.jpg", 1.0, 0xd6dade, 1, 0.38, 1.0],
    darksteel: ["art/pbr/metal_col.jpg", "art/pbr/metal_nor.jpg", "art/pbr/metal_rough.jpg", 1.0, 0x3b3f45, 0.85, 0.5, 0.9],
    chrome:    ["art/pbr/metal_col.jpg", "art/pbr/metal_nor.jpg", "art/pbr/metal_rough.jpg", 0.5, 0xeef1f4, 1, 0.16, 1.2],
    galv:      ["art/pbr/galv_col.jpg", "art/pbr/galv_nor.jpg", "art/pbr/galv_rough.jpg", 1.0, 0xc9ced3, 0.8, 0.5, 0.8],
    oak:       ["art/pbr/wood_col.jpg", "art/pbr/wood_nor.jpg", "art/pbr/wood_rough.jpg", 1.0, 0xc9a27a, 0, 0.55, 0.6],
    walnut:    ["art/pbr/wood_col.jpg", "art/pbr/wood_nor.jpg", "art/pbr/wood_rough.jpg", 1.0, 0x7a5236, 0, 0.5, 0.6],
    paint:     ["art/pbr/paint_col.jpg", "art/pbr/paint_nor.jpg", "art/pbr/paint_rough.jpg", 1.0, 0xffffff, 0, 0.6, 0.5],
    plastic:   ["art/pbr/plastic_col.jpg", "art/pbr/plastic_nor.jpg", "art/pbr/plastic_rough.jpg", 0.5, 0xffffff, 0, 0.42, 0.6],
    rubber:    ["art/pbr/rubber_col.jpg", "art/pbr/rubber_nor.jpg", "art/pbr/rubber_rough.jpg", 0.5, 0x1d1f22, 0, 0.75, 0.3],
    fabric:    ["art/pbr/fabric_col.jpg", "art/pbr/fabric_nor.jpg", "art/pbr/fabric_rough.jpg", 0.6, 0xffffff, 0, 0.95, 0.2],
    tile:      ["art/pbr/tile_col.jpg", "art/pbr/tile_nor.jpg", "art/pbr/tile_rough.jpg", 0.6, 0xffffff, 0, 0.6, 0.5],
    concrete:  ["art/pbr/concrete_col.jpg", "art/pbr/concrete_nor.jpg", "art/pbr/concrete_rough.jpg", 2.0, 0xc9c7c2, 0, 0.9, 0.3],
    parquet:   ["art/interior/herringbone_parquet.jpg", "art/interior/herringbone_parquet_nor.jpg", "art/pbr/wood_rough.jpg", 1.6, 0xcfc2b0, 0, 0.5, 0.6],
    carpet:    ["art/interior/dirty_carpet.jpg", "art/interior/dirty_carpet_nor.jpg", "art/pbr/fabric_rough.jpg", 1.5, 0x8a8f96, 0, 0.95, 0.15]
  };
  const mats = {};
  function mat(kind) {
    if (mats[kind]) return mats[kind];
    let m;
    if (kind === "glass") {
      m = new THREE.MeshPhysicalMaterial({ color: 0xcfe4e8, transparent: true, opacity: 0.2, roughness: 0.06, metalness: 0.1, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
    } else if (kind === "led" || kind === "warmled") {
      m = new THREE.MeshStandardMaterial({ color: 0xf4f7fa, map: tex("art/pbr/metal_col.jpg", true, 1), normalMap: tex("art/pbr/metal_nor.jpg", false, 1), roughnessMap: tex("art/pbr/metal_rough.jpg", false, 1),
        roughness: 0.6, metalness: 0, emissive: new THREE.Color(kind === "led" ? 0xeef3ff : 0xffe6c4), emissiveIntensity: 2.2, vertexColors: true });
    } else if (kind === "print" || kind === "lit" || kind === "vprint" || kind === "vlit") {
      const A = kind[0] === "v" ? vendAtlas() : mallAtlas();
      m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: A.tex, normalMap: tex("art/pbr/plastic_nor.jpg", false, 0.5), roughnessMap: tex("art/pbr/plastic_rough.jpg", false, 0.5), roughness: 0.45, metalness: 0, vertexColors: true });
      if (kind === "lit" || kind === "vlit") { m.emissive = new THREE.Color(1, 1, 1); m.emissiveMap = A.tex; m.emissiveIntensity = kind === "vlit" ? 0.9 : 0.75; }
      m.normalScale.set(0.025, 0.025);
    } else {
      const s = SETS[kind] || SETS.paint;
      m = new THREE.MeshStandardMaterial({ color: s[4], map: tex(s[0], true, s[3]), normalMap: tex(s[1], false, s[3]), roughnessMap: tex(s[2], false, s[3]),
        roughness: s[6], metalness: s[5], envMapIntensity: s[7], vertexColors: true });
      m.normalScale.set(0.7, 0.7);
    }
    m.userData.shDry = true; m.userData.stationMall = kind; m.userData.pbrDone = true;
    return (mats[kind] = m);
  }
  M.mat = mat;

  // ---- a batch: boxes, quads and shapes merged per material, so a whole station is a handful of draw calls --------------------------------
  const FACES = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
  const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _nm = new THREE.Matrix3(), _one = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
  function Batch() { this.b = new Map(); this.stack = [new THREE.Matrix4()]; this.tint = null; }
  Batch.prototype.bucket = function (k) { let b = this.b.get(k); if (!b) { b = { p: [], n: [], u: [], c: [], i: [] }; this.b.set(k, b); } return b; };
  Batch.prototype.push = function (x, y, z, ry) { const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry || 0, 0)), _one); this.stack.push(this.top().clone().multiply(m)); return this; };
  Batch.prototype.pop = function () { if (this.stack.length > 1) this.stack.pop(); return this; };
  Batch.prototype.top = function () { return this.stack[this.stack.length - 1]; };
  Batch.prototype.xf = function (x, y, z, o) {
    _e.set((o && o.rx) || 0, (o && o.ry) || 0, (o && o.rz) || 0); _q.setFromEuler(_e);
    return _m.compose(_v.set(x, y, z), _q, _one).premultiply(this.top());
  };
  // a box w x h x d centred at x,y,z (local to the frame), turned by o.ry / o.rx; o.c tints it; uv in metres (o.s scales them)
  Batch.prototype.box = function (k, w, h, d, x, y, z, o) {
    const B = this.bucket(k), X = this.xf(x, y, z, o), s = (o && o.s) || 1, dims = [d, h, d, h, w, d, w, d, w, h, w, h];
    _nm.getNormalMatrix(X); _c.set(o && o.c !== undefined ? o.c : 0xffffff);
    const hx = w / 2, hy = h / 2, hz = d / 2, P = [x, y, z];
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], U = dims[f * 2], V = dims[f * 2 + 1], base = B.p.length / 3;
      const cx = F[0][0] * hx, cy = F[0][1] * hy, cz = F[0][2] * hz;
      const uo = (P[0] * F[1][0] + P[1] * F[1][1] + P[2] * F[1][2]), vo = (P[0] * F[2][0] + P[1] * F[2][1] + P[2] * F[2][2]);
      for (let k2 = 0; k2 < 4; k2++) {
        const su = (k2 === 1 || k2 === 2) ? 0.5 : -0.5, sv = k2 >= 2 ? 0.5 : -0.5;
        _v.set(cx + F[1][0] * U * su + F[2][0] * V * sv, cy + F[1][1] * U * su + F[2][1] * V * sv, cz + F[1][2] * U * su + F[2][2] * V * sv).applyMatrix4(X);
        B.p.push(_v.x, _v.y, _v.z);
        _n.set(F[0][0], F[0][1], F[0][2]).applyMatrix3(_nm).normalize(); B.n.push(_n.x, _n.y, _n.z);
        B.u.push((uo + U * su) * s, (vo + V * sv) * s); B.c.push(_c.r, _c.g, _c.b);
      }
      B.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  };
  // a quad w x h facing +z (local), with an atlas rectangle [u0,v0,u1,v1]
  Batch.prototype.quad = function (k, w, h, x, y, z, uv, o) {
    const B = this.bucket(k), X = this.xf(x, y, z, o), base = B.p.length / 3;
    _nm.getNormalMatrix(X); _n.set(0, 0, 1).applyMatrix3(_nm).normalize(); _c.set(o && o.c !== undefined ? o.c : 0xffffff);
    const r = uv || [0, 0, w, h], C = [[-w / 2, -h / 2, r[0], r[1]], [w / 2, -h / 2, r[2], r[1]], [w / 2, h / 2, r[2], r[3]], [-w / 2, h / 2, r[0], r[3]]];
    C.forEach(q => { _v.set(q[0], q[1], 0).applyMatrix4(X); B.p.push(_v.x, _v.y, _v.z); B.n.push(_n.x, _n.y, _n.z); B.u.push(q[2], q[3]); B.c.push(_c.r, _c.g, _c.b); });
    B.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  };
  // any geometry (a cylinder, a lathe), its uvs optionally squeezed into an atlas rectangle
  Batch.prototype.geo = function (k, g, x, y, z, o) {
    const B = this.bucket(k), X = this.xf(x, y, z, o).clone(), base = B.p.length / 3;
    if (o && o.sc) X.multiply(new THREE.Matrix4().makeScale(o.sc[0], o.sc[1], o.sc[2]));
    _nm.getNormalMatrix(X); _c.set(o && o.c !== undefined ? o.c : 0xffffff);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, r = o && o.uv, us = (o && o.s) || 1;
    for (let i = 0; i < P.count; i++) {
      _v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(X); B.p.push(_v.x, _v.y, _v.z);
      _n.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(_nm).normalize(); B.n.push(_n.x, _n.y, _n.z);
      const u = U ? U.getX(i) : 0, v = U ? U.getY(i) : 0;
      if (r) B.u.push(r[0] + (r[2] - r[0]) * u, r[1] + (r[3] - r[1]) * v); else B.u.push(u * us, v * us);
      B.c.push(_c.r, _c.g, _c.b);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) B.i.push(base + g.index.getX(i)); else for (let i = 0; i < P.count; i++) B.i.push(base + i);
    return this;
  };
  Batch.prototype.build = function (root, name) {
    const out = [];
    this.b.forEach((B, k) => {
      if (!B.i.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(B.n, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(B.u, 2)); g.setAttribute("color", new THREE.Float32BufferAttribute(B.c, 3));
      g.setIndex(B.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.i, 1) : new THREE.Uint16BufferAttribute(B.i, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const m = new THREE.Mesh(g, mat(k)); m.name = (name || "station mall") + " · " + k; m.receiveShadow = true;
      m.userData.shDry = true; m.userData.pbrDone = true; m.userData.stationMall = true;
      if (k === "glass") m.renderOrder = 2;
      root.add(m); out.push(m);
    });
    this.b.clear();
    return out;
  };
  M.Batch = Batch;

  // ---- canvas atlases: the printed and lit things (shop signs, packaging, posters, vending machine fronts) ------------------------------
  function Atlas(size, k, hs) { this.k = k || 1; this.size = size; this.hs = hs || size; this.c = document.createElement("canvas"); this.c.width = size; this.c.height = this.hs; this.g = this.c.getContext("2d"); this.x = 2; this.y = 2; this.row = 0; this.memo = new Map(); this.tex = new THREE.CanvasTexture(this.c); this.tex.encoding = THREE.sRGBEncoding; this.tex.anisotropy = 8; }
  Atlas.prototype.add = function (key, w, h, draw) {
    if (key && this.memo.has(key)) return this.memo.get(key);
    const S = this.size, lw = w, lh = h; w = Math.max(4, Math.round(w * this.k)); h = Math.max(4, Math.round(h * this.k));
    if (this.x + w + 2 > S) { this.x = 2; this.y += this.row + 3; this.row = 0; }
    if (this.y + h + 2 > this.hs) { M.errors.push("atlas full: " + key); return [0, 0, 0.001, 0.001]; }
    const x = this.x, y = this.y, g = this.g; this.x += w + 3; this.row = Math.max(this.row, h);
    g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); g.scale(w / lw, h / lh);
    try { draw(g, lw, lh); } catch (e) { M.errors.push(String(e).slice(0, 120)); }
    g.restore();
    const HS = this.hs, r = [(x + 0.5) / S, 1 - (y + h - 0.5) / HS, (x + w - 0.5) / S, 1 - (y + 0.5) / HS];
    if (key) this.memo.set(key, r);
    this.tex.needsUpdate = true;
    return r;
  };
  let MALLA = null, VENDA = null;
  function mallAtlas() { return MALLA || (MALLA = lean() ? new Atlas(2048, 0.5, 1024) : new Atlas(4096, 1, 2048)); }
  function vendAtlas() { return VENDA || (VENDA = lean() ? new Atlas(1024, 0.5) : new Atlas(2048, 1)); }
  M.atlasUse = () => ({ mall: MALLA && [MALLA.size, MALLA.y + MALLA.row], vend: VENDA && [VENDA.size, VENDA.y + VENDA.row] });
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function fitText(g, t, x, y, maxW, px, weight, fam) { let p = px; g.font = (weight || 700) + " " + p + "px " + (fam || UIF()); while (p > 8 && g.measureText(t).width > maxW) { p -= 1; g.font = (weight || 700) + " " + p + "px " + (fam || UIF()); } g.fillText(t, x, y); }
  function grain(g, w, h, a) { const n = Math.round(w * h / 90); for (let i = 0; i < n; i++) { g.fillStyle = "rgba(" + (rnd() < 0.5 ? "0,0,0" : "255,255,255") + "," + (rnd() * a) + ")"; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); } }

  // A shop's fascia: lettered in its own face by SignFonts, the way a real sign shop would set it out, sized to the board it is on.
  function fascia(A, name, jp, bg, ink, mood, wM, hM) {
    const ppm = 80, w = Math.round(clampN(wM * ppm, 96, 900)), h = Math.round(clampN(hM * ppm, 28, 200));
    return A.add("fascia|" + name + "|" + w + "x" + h, w, h, (g) => {
      const SF = window.SignFonts, st = SF ? SF.style(name, { text: name + " " + (jp || ""), mood: mood || "shop", stable: true }) : null;
      const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, bg); grd.addColorStop(1, shade(bg, 0.82));
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      if (st && SF.panel) { try { SF.panel(g, 0, 0, w, h, st, bg, ink); } catch (e) { /* plain board */ } }
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = ink;
      const hasJp = jp && w / h > 3.2;
      const main = hasJp ? w * 0.62 : w * 0.9;
      if (st && SF.text) { try { SF.text(g, name, hasJp ? w * 0.36 : w / 2, h * 0.52, st, ink, bg, Math.round(h * 0.56), main); } catch (e) { fitText(g, name, w / 2, h / 2, main, Math.round(h * 0.56), 800); } }
      else fitText(g, name, hasJp ? w * 0.36 : w / 2, h * 0.52, main, Math.round(h * 0.56), 800);
      if (hasJp) { g.globalAlpha = 0.92; g.fillStyle = ink; fitText(g, jp, w * 0.83, h * 0.52, w * 0.28, Math.round(h * 0.42), 700); g.globalAlpha = 1; }
      grain(g, w, h, 0.05);
    });
  }
  function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return "#" + c.getHexString(); }
  // way-finding: the yellow-on-black and white-on-green boards of a Japanese station
  function wayfinding(A, text, sub, bg, ink, wM, hM) {
    const ppm = 90, w = Math.round(clampN(wM * ppm, 96, 1300)), h = Math.round(clampN(hM * ppm, 32, 200));
    return A.add("way|" + text + "|" + sub + "|" + w, w, h, g => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(0, 0, w, h * 0.08);
      g.fillStyle = ink; g.textBaseline = "middle"; g.textAlign = "left";
      fitText(g, text, h * 0.25, sub ? h * 0.38 : h * 0.52, w - h * 0.5, Math.round(h * (sub ? 0.42 : 0.55)), 800);
      if (sub) { g.globalAlpha = 0.85; fitText(g, sub, h * 0.25, h * 0.78, w - h * 0.5, Math.round(h * 0.26), 600); g.globalAlpha = 1; }
    });
  }

  // ---- packaging and print: the souvenirs, the ekiben, the posters ---------------------------------------------------------------------
  const OMIYAGE = [
    ["Tōkonto Banana", "東都ばな奈", "#f2c230", "#5a3a12"], ["Mizuho Senbei", "瑞穂せんべい", "#7a1f1a", "#f4e3c4"], ["Kanda Manjū", "神田まんじゅう", "#f1e7d2", "#7a3b22"],
    ["Sakura Mochi", "桜もち", "#f3b7c6", "#7a2240"], ["Matcha Langue", "抹茶ラング", "#3e6b3a", "#f3efe2"], ["Tower Sablé", "タワーサブレ", "#1d3b6a", "#f2c230"],
    ["Yuzu Jelly", "ゆずゼリー", "#f6d64a", "#3a5a1a"], ["Castella", "カステラ", "#c8372d", "#fff3dc"], ["Black Sesame", "黒ごま", "#22262d", "#e8c46a"],
    ["Honey Cake", "はちみつケーキ", "#e8a33d", "#5a2a0a"], ["Chestnut Yōkan", "栗ようかん", "#5a3a22", "#e8d8b0"], ["Soy Rusk", "しょうゆラスク", "#8a5a34", "#ffffff"],
    ["Strawberry Daifuku", "いちご大福", "#ffffff", "#d8382c"], ["Wasabi Crackers", "わさびせん", "#9ac46a", "#1f3a12"], ["Milk Pudding", "牛乳プリン", "#e8f1f8", "#2a5a9a"], ["Hōjicha Cookies", "ほうじ茶", "#9a6a3a", "#f6efe0"]];
  function boxArt(A, i) {
    const o = OMIYAGE[i % OMIYAGE.length];
    return A.add("omiyage|" + i, 160, 120, (g, w, h) => {
      g.fillStyle = o[2]; g.fillRect(0, 0, w, h);
      g.fillStyle = o[3]; g.globalAlpha = 0.18; for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(rnd() * w, rnd() * h, 6 + rnd() * 22, 0, TAU); g.fill(); } g.globalAlpha = 1;
      g.fillStyle = shade(o[2], 0.75); g.fillRect(0, h * 0.68, w, h * 0.32);
      g.fillStyle = o[3]; g.textAlign = "center"; g.textBaseline = "middle";
      fitText(g, o[1], w / 2, h * 0.36, w * 0.9, 26, 800);
      g.fillStyle = "#ffffff"; fitText(g, o[0], w / 2, h * 0.84, w * 0.9, 15, 700);
      g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    });
  }
  function bentoArt(A, i) {
    const names = [["Makunouchi", "幕の内"], ["Gyūtan", "牛たん"], ["Kamameshi", "釜めし"], ["Salmon & Roe", "はらこ飯"], ["Tonkatsu", "かつ弁"], ["Unagi", "うなぎ"]];
    const n = names[i % names.length];
    return A.add("bento|" + i, 160, 110, (g, w, h) => {
      g.fillStyle = "#1a1612"; g.fillRect(0, 0, w, h);
      const cells = [[0.04, 0.06, 0.44, 0.52], [0.52, 0.06, 0.44, 0.24], [0.52, 0.34, 0.44, 0.24], [0.04, 0.62, 0.92, 0.32]];
      const food = ["#f4f1ea", "#c8641a", "#e6b422", "#d8382c", "#4d9a45", "#8a5a34", "#f3b7c6"];
      cells.forEach((c, k) => { g.fillStyle = "#2a2420"; g.fillRect(c[0] * w, c[1] * h, c[2] * w, c[3] * h); for (let q = 0; q < 9; q++) { g.fillStyle = food[(i + k + q) % food.length]; g.beginPath(); g.ellipse((c[0] + c[2] * (0.15 + rnd() * 0.7)) * w, (c[1] + c[3] * (0.2 + rnd() * 0.6)) * h, 4 + rnd() * 7, 3 + rnd() * 5, rnd() * 3, 0, TAU); g.fill(); } });
      g.fillStyle = "rgba(200,40,30,0.92)"; g.fillRect(0, h * 0.42, w, h * 0.16); g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; fitText(g, n[1] + " ¥" + (980 + i * 120), w / 2, h * 0.5, w * 0.9, 14, 800);
    });
  }
  const POSTERS = [
    ["AUTUMN IN MIZUHO", "瑞穂の秋 · 2 hours by NHRail", "#7a1f1a", "#f2c230"], ["TŌKONTO TOWER", "東都タワー · night view 22:00", "#0d1b2a", "#e8c46a"],
    ["SHINKANSEN", "新幹線 · Tōkonto ⇄ Nagisa 58 min", "#f4f5f3", "#1d3b6a"], ["IC CARD", "タッチでピッ · charge at any machine", "#15894f", "#ffffff"],
    ["ONSEN WEEKEND", "温泉で週末 · Hamaura", "#3e6b3a", "#f6efe0"], ["SOTI", "Work that matters · ソティ", "#0d1117", "#2a9ad6"],
    ["KAI FESTIVAL", "海まつり · fireworks Sat 19:30", "#1d2b4a", "#f3b7c6"], ["MANNERS", "駆け込み乗車はおやめください · no rushing", "#ffd21c", "#14171b"]];
  function poster(A, i) {
    const p = POSTERS[i % POSTERS.length];
    return A.add("poster|" + i, 240, 340, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, p[2]); grd.addColorStop(1, shade(p[2], 0.6)); g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.22; g.fillStyle = p[3];
      if (i % 3 === 0) { g.beginPath(); g.moveTo(0, h * 0.62); for (let x = 0; x <= w; x += 12) g.lineTo(x, h * (0.45 + 0.12 * Math.sin(x * 0.03 + i))); g.lineTo(w, h * 0.62); g.fill(); }
      else if (i % 3 === 1) { for (let k = 0; k < 9; k++) g.fillRect(w * (0.1 + k * 0.09), h * (0.62 - 0.05 * ((k * 7) % 5)), w * 0.07, h); }
      else { g.beginPath(); g.arc(w * 0.62, h * 0.36, w * 0.28, 0, TAU); g.fill(); }
      g.globalAlpha = 1; g.fillStyle = p[3]; g.textAlign = "left"; g.textBaseline = "alphabetic";
      fitText(g, p[0], 14, h * 0.8, w - 28, 34, 900); g.globalAlpha = 0.9; fitText(g, p[1], 14, h * 0.88, w - 28, 14, 600); g.globalAlpha = 1;
      g.fillStyle = "#15894f"; g.fillRect(14, h - 22, 52, 10); g.fillStyle = "#fff"; g.font = "700 9px " + UIF(); g.fillText("NHRail", 17, h - 14);
    });
  }
  function solid(A, key, col) { return A.add("solid|" + key, 8, 8, (g, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); }); }
  // Folk dolls: kokeshi (lathe, painted body) and daruma (round, red, eyes left blank for a wish)
  function kokeshiArt(A, i) {
    const bodies = ["#c8372d", "#1d3b6a", "#3e6b3a", "#e8a33d", "#7a1f1a", "#f3b7c6"];
    return A.add("kokeshi|" + i, 64, 128, (g, w, h) => {
      g.fillStyle = "#f2dcb4"; g.fillRect(0, 0, w, h);
      g.fillStyle = bodies[i % bodies.length]; g.fillRect(0, h * 0.42, w, h * 0.58);
      g.fillStyle = "rgba(255,255,255,0.7)"; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(w * (0.15 + k * 0.18), h * (0.55 + (k % 2) * 0.18), 4, 0, TAU); g.fill(); }
      g.fillStyle = "#14171b"; g.fillRect(0, 0, w, h * 0.12);   // the hair
      g.fillStyle = "#14171b"; g.fillRect(w * 0.42, h * 0.22, 3, 2); g.fillRect(w * 0.55, h * 0.22, 3, 2);
      g.fillStyle = "#c8372d"; g.fillRect(w * 0.48, h * 0.3, 3, 2);
    });
  }
  function darumaArt(A) {
    return A.add("daruma", 128, 128, (g, w, h) => {
      g.fillStyle = "#c51f1a"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#f6efe0"; g.beginPath(); g.ellipse(w * 0.25, h * 0.55, w * 0.13, h * 0.16, 0, 0, TAU); g.fill();
      g.fillStyle = "#14171b"; g.beginPath(); g.arc(w * 0.21, h * 0.52, 3, 0, TAU); g.fill();
      g.fillStyle = "#e8c46a"; g.font = "800 22px " + UIF(); g.textAlign = "center"; g.fillText("福", w * 0.75, h * 0.62);
    });
  }

  // ---- vending machines: what each kind sells and how its front looks ------------------------------------------------------------------
  // body colour, header, kind of display, stock (what E buys; ids that are in ITEM go in the bag)
  const VEND = {
    cold:     { name: "KONTO DRINKS", jp: "つめた〜い", body: 0xc8372d, head: "#c8372d", show: "cans", hot: false },
    hot:      { name: "HOT & COLD", jp: "あったか〜い", body: 0x1d4f9a, head: "#1d4f9a", show: "cans", hot: true,
      stock: [["coffee", "Hot Black Coffee", 140, "#3a2414", 1], ["tea", "Hot Green Tea", 140, "#4d9a45", 1], ["cocoa", "Hot Cocoa", 150, "#8a5a34", 1], ["potage", "Corn Potage", 150, "#e6b422", 1], ["lemon", "Hot Lemon", 150, "#f6d64a", 1], ["oshiruko", "Oshiruko", 160, "#7a1f1a", 1], ["water", "Mineral Water", 110, "#cfe6f2", 0], ["cola", "Cola", 160, "#d8382c", 0]] },
    coffee:   { name: "KŌHĪ STAND", jp: "珈琲", body: 0x2a1f18, head: "#2a1f18", show: "cans", hot: true,
      stock: [["coffee", "Black, unsweetened", 140, "#14171b", 1], ["coffee", "Café au lait", 140, "#c9a27a", 1], ["coffee", "Espresso shot", 170, "#3a2414", 1], ["coffee", "Iced latte", 160, "#e8d8b0", 0], ["coffee", "Caramel macchiato", 170, "#e8a33d", 0], ["coffee", "Morning blend", 130, "#5a3a22", 1], ["tea", "Royal milk tea", 150, "#d8b48a", 1], ["coffee", "Cold brew", 180, "#22262d", 0]] },
    tea:      { name: "OCHA", jp: "お〜いお茶", body: 0x2f6b3a, head: "#2f6b3a", show: "bottles", hot: false,
      stock: [["tea", "Green tea", 150, "#4d9a45", 0], ["tea", "Hōjicha", 150, "#8a5a34", 0], ["tea", "Barley tea", 140, "#c9a27a", 0], ["tea", "Jasmine tea", 150, "#e8d8b0", 0], ["tea", "Oolong", 150, "#7a4a22", 0], ["water", "Alkaline water", 120, "#cfe6f2", 0], ["tea", "Genmaicha", 150, "#b9a06a", 1], ["tea", "Matcha latte", 170, "#9ac46a", 1]] },
    water:    { name: "AQUA", jp: "天然水", body: 0xe8eef3, head: "#2a9ad6", show: "bottles", hot: false,
      stock: [["water", "Mountain water", 110, "#cfe6f2", 0], ["water", "Sparkling water", 130, "#a8e0c4", 0], ["energy", "Energy drink", 210, "#14171b", 0], ["water", "Sports drink", 160, "#2c78d8", 0], ["water", "Vitamin water", 150, "#f6d64a", 0], ["water", "Peach water", 140, "#f3b7c6", 0], ["cola", "Cola zero", 160, "#22262d", 0], ["water", "Lemon water", 140, "#f6efa0", 0]] },
    ice:      { name: "ICE CREAM", jp: "アイスクリーム", body: 0xf4f5f3, head: "#e0587a", show: "ice", hot: false,
      stock: [["ice", "Vanilla cone", 160, "#f6efe0", 0], ["ice", "Matcha cone", 170, "#9ac46a", 0], ["ice", "Choco mint", 170, "#a8e0c4", 0], ["ice", "Strawberry", 160, "#f3b7c6", 0], ["ice", "Azuki bar", 140, "#7a1f1a", 0], ["ice", "Cookies & cream", 180, "#22262d", 0], ["ice", "Melon soda float", 190, "#4d9a45", 0], ["ice", "Ice candy", 120, "#53c1e6", 0]] },
    snack:    { name: "SNACK & BREAD", jp: "パン・おやつ", body: 0xe8a33d, head: "#c8641a", show: "coils", hot: false,
      stock: [["onigiri", "Salmon onigiri", 160, "#f4f1ea", 0], ["sando", "Egg sando", 280, "#f6d64a", 0], ["chips", "Seaweed chips", 150, "#3e6b3a", 0], ["chocolate", "Chocolate bar", 130, "#5a3a22", 0], ["sando", "Melon pan", 180, "#e8c46a", 0], ["chips", "Rice crackers", 140, "#c9a27a", 0], ["chocolate", "Pocky", 150, "#c8372d", 0], ["onigiri", "Tuna mayo onigiri", 160, "#f4f1ea", 0]] },
    noodle:   { name: "CUP NOODLE", jp: "カップ麺 · お湯つき", body: 0xd8382c, head: "#f6d64a", show: "cups", hot: true,
      stock: [["ramen", "Shoyu cup ramen", 230, "#c8372d", 1], ["ramen", "Curry cup", 240, "#e8a33d", 1], ["ramen", "Seafood cup", 240, "#2c78d8", 1], ["ramen", "Kitsune udon", 230, "#e8c46a", 1], ["ramen", "Tanuki soba", 230, "#5a3a22", 1], ["ramen", "Tonkotsu cup", 250, "#f4f1ea", 1], ["ramen", "Yakisoba", 230, "#14171b", 1], ["ramen", "Miso cup", 240, "#c9a27a", 1]] },
    umbrella: { name: "UMBRELLAS", jp: "傘 · レイングッズ", body: 0x1d2b4a, head: "#2a9ad6", show: "umbrellas", hot: false,
      stock: [["umbrella", "Clear umbrella", 700, "#e8f1f8", 0], ["umbrella", "Navy umbrella", 1200, "#1d2b4a", 0], ["umbrella", "Folding umbrella", 1500, "#22262d", 0], ["umbrella", "Red umbrella", 1200, "#c8372d", 0], ["poncho", "Rain poncho", 500, "#f6d64a", 0], ["towel", "Hand towel", 400, "#ffffff", 0], ["umbrella", "Check umbrella", 1400, "#7a4a22", 0], ["socks", "Dry socks", 500, "#59606a", 0]] },
    news:     { name: "NEWS & MAGAZINES", jp: "新聞・雑誌", body: 0x59606a, head: "#14171b", show: "papers", hot: false,
      stock: [["paper", "Tōkonto Shimbun", 160, "#f4f1ea", 0], ["paper", "Keizai Daily", 180, "#f2e4c4", 0], ["paper", "Sports Hōchi", 150, "#f6d64a", 0], ["mag", "Weekly Bunsho", 450, "#c8372d", 0], ["mag", "Car Graphic", 980, "#14171b", 0], ["mag", "Manga Sunday", 300, "#2a9ad6", 0], ["mag", "Travel Japan", 880, "#4d9a45", 0], ["paper", "English Times", 220, "#e8eef3", 0]] },
    charger:  { name: "CHARGE SPOT", jp: "モバイルバッテリー", body: 0x22262d, head: "#2ad6a0", show: "boxes", hot: false,
      stock: [["charger", "Rental battery (1 day)", 360, "#2ad6a0", 0], ["charger", "Power bank 10,000", 2480, "#22262d", 0], ["charger", "USB-C cable", 980, "#ffffff", 0], ["earbuds", "Earbuds", 1980, "#e8eef3", 0], ["charger", "Car charger", 1280, "#59606a", 0], ["charger", "Wall plug", 1480, "#f4f5f3", 0], ["charger", "Lightning cable", 980, "#cfd2d6", 0], ["charger", "Phone stand", 680, "#c8372d", 0]] },
    health:   { name: "HEALTH", jp: "マスク・くすり", body: 0xf3f7f4, head: "#2e9b5a", show: "boxes", hot: false,
      stock: [["mask", "Masks, 7 pack", 300, "#e8f1f8", 0], ["med", "Headache tablets", 680, "#2e9b5a", 0], ["med", "Eye drops", 580, "#2a9ad6", 0], ["med", "Throat lozenges", 300, "#f6d64a", 0], ["med", "Plasters", 250, "#f3b7c6", 0], ["med", "Hand sanitiser", 350, "#a8e0c4", 0], ["energy", "Vitamin shot", 200, "#e8a33d", 0], ["med", "Hangover drink", 300, "#c8641a", 0]] },
    omiyage:  { name: "OMIYAGE", jp: "東都みやげ", body: 0x7a1f1a, head: "#e8c46a", show: "boxes", hot: false,
      stock: OMIYAGE.slice(0, 8).map((o, i) => ["omiyage", o[0], 600 + i * 120, o[2], 0]) },
    flower:   { name: "FLOWERS", jp: "花の自販機", body: 0xf4f5f3, head: "#3e6b3a", show: "flowers", hot: false,
      stock: [["flower", "Sunflowers", 1200, "#f6d64a", 0], ["flower", "Roses", 1800, "#c8372d", 0], ["flower", "Chrysanthemum", 1000, "#f4f1ea", 0], ["flower", "Tulips", 1100, "#f3b7c6", 0], ["flower", "Lilies", 1600, "#ffffff", 0], ["flower", "Gerbera", 900, "#e8a33d", 0], ["flower", "Bonsai", 2800, "#3e6b3a", 0], ["flower", "Hydrangea", 1400, "#7a9ad6", 0]] },
    gacha:    { name: "GACHA", jp: "ガチャガチャ", body: 0xf3f3f0, head: "#e0587a", show: "gacha", hot: false,
      stock: [["toy", "Mini trains", 300, "#15894f", 0], ["toy", "Sushi keyrings", 300, "#c8372d", 0], ["toy", "Cat figures", 400, "#f6d64a", 0], ["toy", "Tiny vending machines", 400, "#2a9ad6", 0], ["toy", "Shiba charms", 300, "#e8a33d", 0], ["toy", "Salaryman figures", 500, "#22262d", 0], ["toy", "Capsule stamps", 200, "#9b6bd3", 0], ["toy", "Daruma charms", 300, "#c51f1a", 0]] }
  };
  M.VEND = VEND;
  const VEND_ORDER = ["cold", "hot", "coffee", "ice", "snack", "noodle", "tea", "umbrella", "news", "omiyage", "charger", "water", "health", "gacha", "flower"];
  function vendStock(t) {
    const V = VEND[t];
    if (!V.stock) return null;
    return [{ name: V.name, items: V.stock.map((s, i) => ({ id: s[0], name: s[1], price: s[2], col: s[3], hot: !!s[4] })) }];
  }
  function vendFront(t) {
    const V = VEND[t], A = vendAtlas();
    return A.add("vend|" + t, 224, 448, (g, w, h) => {
      const head = V.head, items = V.stock ? V.stock.map(s => s[3]) : ["#53c1e6", "#2c78d8", "#e8f1f8", "#a8e0c4", "#4d9a45", "#c8641a", "#8a5a34", "#e6b422"];
      g.fillStyle = "#0e1013"; g.fillRect(0, 0, w, h);
      g.fillStyle = head; g.fillRect(0, 0, w, 46); g.fillStyle = "rgba(255,255,255,0.15)"; g.fillRect(0, 0, w, 10);
      g.fillStyle = "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle";
      fitText(g, V.name, w / 2, 18, w - 16, 19, 900); g.globalAlpha = 0.9; fitText(g, V.jp, w / 2, 37, w - 16, 13, 700); g.globalAlpha = 1;
      // the lit display
      const dy = 52, dh = 270;
      const bg = g.createLinearGradient(0, dy, 0, dy + dh); bg.addColorStop(0, "#f8fbff"); bg.addColorStop(1, "#d8e2ea"); g.fillStyle = bg; g.fillRect(6, dy, w - 12, dh);
      const rows = V.show === "umbrellas" || V.show === "flowers" ? 2 : 3, cols = V.show === "umbrellas" ? 4 : V.show === "papers" ? 3 : V.show === "gacha" ? 2 : 4;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const k = (r * cols + c) % items.length, cw = (w - 20) / cols, ch = dh / rows, x = 10 + c * cw, y = dy + r * ch, col = items[k];
        g.fillStyle = "rgba(0,0,0,0.06)"; g.fillRect(x + 2, y + ch - 20, cw - 4, 4);
        if (V.show === "cans") { rr(g, x + cw * 0.22, y + 10, cw * 0.56, ch - 40, 5); g.fillStyle = col; g.fill(); g.fillStyle = "rgba(255,255,255,0.55)"; g.fillRect(x + cw * 0.22, y + ch * 0.35, cw * 0.56, 8); g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(x + cw * 0.3, y + 12, 3, ch - 46); g.fillStyle = "#9aa3ad"; g.fillRect(x + cw * 0.24, y + 8, cw * 0.52, 4); }
        else if (V.show === "bottles") { rr(g, x + cw * 0.28, y + 22, cw * 0.44, ch - 52, 6); g.fillStyle = col; g.fill(); g.fillStyle = "rgba(255,255,255,0.6)"; g.fillRect(x + cw * 0.28, y + ch * 0.45, cw * 0.44, 12); g.fillStyle = "#e8eef3"; g.fillRect(x + cw * 0.4, y + 8, cw * 0.2, 14); }
        else if (V.show === "cups") { g.fillStyle = col; g.beginPath(); g.moveTo(x + cw * 0.18, y + 16); g.lineTo(x + cw * 0.82, y + 16); g.lineTo(x + cw * 0.72, y + ch - 28); g.lineTo(x + cw * 0.28, y + ch - 28); g.fill(); g.fillStyle = "#ffffff"; g.fillRect(x + cw * 0.18, y + 12, cw * 0.64, 6); g.fillStyle = "rgba(255,255,255,0.7)"; g.fillRect(x + cw * 0.3, y + ch * 0.38, cw * 0.4, 9); }
        else if (V.show === "ice") { g.fillStyle = "#e8c46a"; g.beginPath(); g.moveTo(x + cw * 0.32, y + ch * 0.42); g.lineTo(x + cw * 0.68, y + ch * 0.42); g.lineTo(x + cw * 0.5, y + ch - 26); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(x + cw * 0.5, y + ch * 0.36, cw * 0.22, 0, TAU); g.fill(); }
        else if (V.show === "coils") { g.fillStyle = col; rr(g, x + cw * 0.12, y + 14, cw * 0.76, ch - 50, 4); g.fill(); g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(x + cw * 0.12, y + ch * 0.3, cw * 0.76, 7); g.strokeStyle = "#8a939c"; g.lineWidth = 2; g.beginPath(); for (let q = 0; q < 5; q++) g.ellipse(x + cw * (0.2 + q * 0.15), y + ch - 30, 5, 3, 0, 0, TAU); g.stroke(); }
        else if (V.show === "umbrellas") { g.fillStyle = col; g.beginPath(); g.moveTo(x + cw * 0.5, y + 10); g.lineTo(x + cw * 0.72, y + ch - 40); g.lineTo(x + cw * 0.28, y + ch - 40); g.fill(); g.strokeStyle = "#59606a"; g.lineWidth = 3; g.beginPath(); g.moveTo(x + cw * 0.5, y + ch - 40); g.lineTo(x + cw * 0.5, y + ch - 24); g.arc(x + cw * 0.44, y + ch - 24, 6, 0, Math.PI); g.stroke(); }
        else if (V.show === "papers") { g.fillStyle = col; g.fillRect(x + 6, y + 10, cw - 12, ch - 40); g.fillStyle = "#14171b"; g.fillRect(x + 10, y + 16, cw - 20, 9); for (let q = 0; q < 6; q++) { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x + 10, y + 32 + q * 7, (cw - 20) * (0.5 + rnd() * 0.5), 3); } g.fillStyle = "#c8372d"; g.fillRect(x + 10, y + 28, (cw - 20) * 0.4, 2); }
        else if (V.show === "flowers") { for (let q = 0; q < 7; q++) { g.fillStyle = col; g.beginPath(); g.arc(x + cw * (0.3 + rnd() * 0.4), y + 18 + rnd() * (ch * 0.4), 7, 0, TAU); g.fill(); } g.fillStyle = "#3e6b3a"; g.fillRect(x + cw * 0.46, y + ch * 0.5, 4, ch * 0.3); g.fillStyle = "rgba(255,255,255,0.6)"; g.fillRect(x + cw * 0.3, y + ch * 0.62, cw * 0.4, ch * 0.2); }
        else if (V.show === "gacha") { g.fillStyle = "rgba(220,235,245,0.9)"; g.beginPath(); g.arc(x + cw / 2, y + ch * 0.42, cw * 0.36, 0, TAU); g.fill(); for (let q = 0; q < 10; q++) { g.fillStyle = items[(k + q) % items.length]; g.beginPath(); g.arc(x + cw / 2 + (rnd() - 0.5) * cw * 0.5, y + ch * (0.36 + rnd() * 0.18), 7, 0, TAU); g.fill(); } g.fillStyle = col; g.fillRect(x + cw * 0.2, y + ch * 0.74, cw * 0.6, ch * 0.18); }
        else { g.fillStyle = col; g.fillRect(x + cw * 0.15, y + 14, cw * 0.7, ch - 46); g.fillStyle = "rgba(255,255,255,0.55)"; g.fillRect(x + cw * 0.15, y + ch * 0.32, cw * 0.7, 10); g.fillStyle = "rgba(0,0,0,0.2)"; g.fillRect(x + cw * 0.15, y + 14, 4, ch - 46); }
        // the price and the button under each
        g.fillStyle = "#14171b"; g.fillRect(x + 4, y + ch - 22, cw - 8, 16);
        const price = V.stock ? V.stock[k][2] : 130 + (k % 3) * 10;
        g.fillStyle = "#ff5a3c"; g.font = "700 11px " + UIF(); g.textAlign = "center"; g.fillText("¥" + price, x + cw * 0.42, y + ch - 13);
        g.fillStyle = (V.stock ? V.stock[k][4] : V.hot && k > 5) ? "#ff4a2a" : "#2ab4ff"; g.beginPath(); g.arc(x + cw * 0.82, y + ch - 14, 4, 0, TAU); g.fill();
      }
      // glass glare
      const gl = g.createLinearGradient(0, dy, w, dy + dh); gl.addColorStop(0, "rgba(255,255,255,0.25)"); gl.addColorStop(0.35, "rgba(255,255,255,0)"); gl.addColorStop(0.7, "rgba(255,255,255,0)"); gl.addColorStop(1, "rgba(255,255,255,0.12)"); g.fillStyle = gl; g.fillRect(6, dy, w - 12, dh);
      // the money panel and the flap
      const py = dy + dh + 8;
      g.fillStyle = "#1b1e23"; g.fillRect(6, py, w - 12, h - py - 6);
      g.fillStyle = "#2a2e35"; g.fillRect(w - 64, py + 10, 50, 24); g.fillStyle = "#0a0b0d"; g.fillRect(w - 56, py + 18, 34, 4);   // the note slot
      g.fillStyle = "#9aa3ad"; g.fillRect(w - 46, py + 44, 18, 26); g.fillStyle = "#0a0b0d"; g.fillRect(w - 39, py + 48, 3, 18);  // the coin slot
      g.fillStyle = "#1e88e5"; rr(g, 16, py + 10, 70, 36, 6); g.fill(); g.fillStyle = "#bfe2ff"; g.font = "800 12px " + UIF(); g.textAlign = "center"; g.fillText("IC ピッ", 51, py + 32);
      g.fillStyle = "#ff3b2a"; g.font = "700 18px monospace"; g.fillText("0", 120, py + 32);
      g.fillStyle = "#050607"; rr(g, 24, h - 52, w - 48, 38, 6); g.fill(); g.fillStyle = "#2a2e35"; g.fillRect(30, h - 48, w - 60, 6);
      g.fillStyle = "#e8eef3"; g.font = "600 9px " + UIF(); g.fillText("取出口  TAKE OUT", w / 2, h - 22);
      grain(g, w, h, 0.04);
    });
  }
  // One machine, built into a batch at the current frame, standing at x,z with its back to -z (it faces +z).
  function vendMachine(B, t, x, y, z, ry) {
    const V = VEND[t], col = V.body, uv = vendFront(t), gacha = V.show === "gacha";
    B.push(x, y, z, ry);
    if (gacha) {
      // a rack of capsule-toy machines, two wide and two high
      B.box("darksteel", 1.0, 0.5, 0.62, 0, 0.25, 0, { c: 0x888888 });
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
        const cx = -0.25 + c * 0.5, cy = 0.5 + r * 0.72;
        B.box("plastic", 0.46, 0.36, 0.5, cx, cy + 0.18, 0, { c: [0xe0587a, 0x2a9ad6, 0xf2c230, 0x15894f][(r * 2 + c) % 4] });
        B.geo("glass", sphereGeo(), cx, cy + 0.52, 0.02, { sc: [0.2, 0.17, 0.2] });
        B.quad("vprint", 0.4, 0.3, cx, cy + 0.2, 0.255, [uv[0] + (uv[2] - uv[0]) * c * 0.5, uv[1] + (uv[3] - uv[1]) * (1 - r) * 0.33 + (uv[3] - uv[1]) * 0.33, uv[0] + (uv[2] - uv[0]) * (c * 0.5 + 0.5), uv[1] + (uv[3] - uv[1]) * ((1 - r) * 0.33 + 0.66)]);
        B.box("chrome", 0.08, 0.08, 0.05, cx + 0.12, cy + 0.08, 0.27);
      }
      B.pop(); return;
    }
    B.box("paint", 1.0, 1.82, 0.78, 0, 0.93, 0, { c: col });                                   // the cabinet
    B.box("paint", 1.04, 0.1, 0.82, 0, 1.87, 0, { c: col });                                    // the cap
    B.box("darksteel", 0.98, 0.06, 0.74, 0, 0.03, 0);                                           // the plinth
    B.box("darksteel", 0.92, 1.72, 0.04, 0, 0.94, 0.39, { c: 0x666666 });                       // the door frame
    B.quad("vlit", 0.86, 1.68, 0, 0.95, 0.415, uv);                                             // the front, lit
    B.box("glass", 0.84, 1.0, 0.012, 0, 1.33, 0.425);                                           // the display glass
    B.box("chrome", 0.012, 0.36, 0.03, 0.42, 0.62, 0.43);                                       // the lock bar
    B.box("rubber", 0.6, 0.02, 0.04, 0, 0.22, 0.43);                                            // the flap's lip
    B.box("plastic", 0.98, 0.2, 0.1, 0, 2.0, -0.32, { c: 0xdddddd });                          // the vent hood behind
    B.pop();
  }
  let _sph = null, _cyl = null;
  function sphereGeo() { return _sph || (_sph = new THREE.SphereGeometry(1, 14, 10)); }
  function cylGeo() { return _cyl || (_cyl = new THREE.CylinderGeometry(1, 1, 1, 18, 1)); }
  function bin3(B, x, y, z, ry) {
    // the three-way recycling bin: cans, bottles, everything else
    B.push(x, y, z, ry);
    const cols = [0x2a9ad6, 0x15894f, 0xc8372d];
    for (let k = 0; k < 3; k++) {
      B.box("paint", 0.44, 0.92, 0.42, -0.46 + k * 0.46, 0.46, 0, { c: 0xe8eef3 });
      B.box("paint", 0.44, 0.1, 0.43, -0.46 + k * 0.46, 0.97, 0, { c: cols[k] });
      B.box("darksteel", 0.18, 0.1, 0.02, -0.46 + k * 0.46, 0.78, 0.215);
    }
    B.pop();
  }
  function bench(B, x, y, z, ry, len) {
    B.push(x, y, z, ry);
    const L = len || 1.8;
    for (const s of [-1, 1]) { B.box("darksteel", 0.06, 0.44, 0.46, s * (L / 2 - 0.12), 0.22, 0); B.box("darksteel", 0.06, 0.4, 0.06, s * (L / 2 - 0.12), 0.64, -0.2); }
    for (let k = 0; k < 5; k++) B.box("oak", L, 0.035, 0.07, 0, 0.45, -0.18 + k * 0.09);
    for (let k = 0; k < 3; k++) B.box("oak", L, 0.07, 0.03, 0, 0.62 + k * 0.1, -0.23);
    B.pop();
  }
  function plant(root, x, y, z, big) {
    try { if (typeof propPut === "function") { const h = propPut(root, big ? "potted_plant_02" : (rnd() < 0.5 ? "potted_plant_01" : "potted_plant_04"), x, y, z, rnd() * TAU, { h: big ? 2.4 : 1.3 }); h.userData.stationMallPlant = true; return h; } } catch (e) { /* no prop */ }
    return null;
  }

  // ---- the pieces of a station building ------------------------------------------------------------------------------------------------
  // A ramp is a staircase or an escalator running along z from z0 (height ya) to z1 (height yb), with a flat landing plate at each end.
  function rampY(r, z) {
    const len = Math.abs(r.z1 - r.z0), t = clampN(Math.abs(z - r.z0) / len, 0, 1), L = r.land / len;
    if (t <= L) return r.ya; if (t >= 1 - L) return r.yb;
    return r.ya + (r.yb - r.ya) * (t - L) / (1 - 2 * L);
  }
  // kind "up" / "down" escalator (moving towards z1 / towards z0), or "stairs"
  function addRamp(R, B, kind, x, z0, z1, ya, yb, width) {
    const vis = kind === "stairs" ? (width || 2.4) : 1.0, dir = Math.sign(z1 - z0), len = Math.abs(z1 - z0), land = kind === "stairs" ? 0.9 : 1.3;
    const r = { kind: kind, x: x, x0: x - vis / 2 + 0.22, x1: x + vis / 2 - 0.22, z0: z0, z1: z1, ya: ya, yb: yb, land: land, conv: kind === "up" ? dir : kind === "down" ? -dir : 0 };
    R.ramps.push(r);
    const rise = yb - ya, run = len - 2 * land, ang = Math.atan2(rise, run), slope = Math.hypot(rise, run), zm = (z0 + z1) / 2, ym = (ya + yb) / 2;
    const rx = dir > 0 ? -ang : ang;          // the pitch of the flight, so its far end is the high end
    if (kind === "stairs") {
      const n = Math.max(6, Math.round(Math.abs(rise) / 0.17)), step = run / n, hstep = rise / n;
      for (let i = 0; i < n; i++) {
        const z = z0 + dir * (land + (i + 0.5) * step), top = ya + hstep * (i + 1);
        B.box("granite", vis, 0.05, Math.abs(step) + 0.03, x, top - 0.025, z);                                  // the tread
        B.box("limestone", vis, Math.abs(hstep), 0.03, x, top - hstep / 2, z - dir * (Math.abs(step) / 2), { c: 0xdddddd });   // the riser
        B.box("steel", vis, 0.012, 0.05, x, top + 0.002, z + dir * (Math.abs(step) / 2 - 0.03), { c: 0xe8c21c });           // the nosing strip
      }
      B.box("concrete", vis, 0.35, slope, x, ym - 0.35, zm, { rx: rx });                                         // the stringer slab under it
      for (const s of [-1, 1]) {
        B.box("glass", 0.02, 0.95, slope, x + s * (vis / 2 + 0.02), ym + 0.55, zm, { rx: rx });
        B.box("steel", 0.05, 0.05, slope + 0.3, x + s * (vis / 2 + 0.02), ym + 1.05, zm, { rx: rx });           // the handrail
        B.box("steel", 0.06, 0.24, slope, x + s * (vis / 2 + 0.02), ym - 0.02, zm, { rx: rx, c: 0xbbbbbb });
      }
      return r;
    }
    // an escalator: the truss, the steps (a ribbed metal ramp), the comb plates, glass balustrades with black rubber handrails
    const tw = 1.5;
    B.box("steel", tw, 0.9, slope, x, ym - 0.62, zm, { rx: rx, c: 0xe2e4e6 });                                    // the truss, clad in brushed steel
    B.box("plaster", tw, 0.04, slope, x, ym - 1.09, zm, { rx: rx });                                              // its soffit underneath
    const ribs = Math.round(slope / 0.4);
    for (let i = 0; i < ribs; i++) { const z = z0 + dir * (land + (i + 0.5) * run / ribs), y = ya + rise * (i + 0.5) / ribs; B.box("darksteel", 0.98, 0.05, 0.36, x, y - 0.02, z, { c: 0x777777 }); B.box("steel", 0.98, 0.008, 0.02, x, y + 0.008, z + 0.17 * dir, { c: 0xe8c21c }); }
    for (const e of [[z0, ya], [z1, yb]]) {
      const zz = e[0] + (e[0] === z0 ? dir : -dir) * land / 2;
      B.box("chrome", 1.2, 0.04, land, x, e[1] + 0.0, zz);                                                          // the landing plate
      B.box("steel", 1.0, 0.012, 0.12, x, e[1] + 0.025, zz + (e[0] === z0 ? dir : -dir) * (land / 2 - 0.08), { c: 0xe8c21c }); // comb
    }
    for (const s of [-1, 1]) {
      B.box("glass", 0.02, 0.85, slope + 0.6, x + s * 0.6, ym + 0.5, zm, { rx: rx });
      B.box("rubber", 0.09, 0.07, slope + 1.4, x + s * 0.6, ym + 0.96, zm, { rx: rx });                             // the moving handrail
      B.box("steel", 0.12, 0.28, slope + 0.2, x + s * 0.62, ym + 0.02, zm, { rx: rx, c: 0xcccccc });               // the skirt
      for (const e of [[z0, ya], [z1, yb]]) B.box("steel", 0.14, 1.0, 0.5, x + s * 0.6, e[1] + 0.5, e[0] + (e[0] === z0 ? -dir : dir) * 0.05, { c: 0xbbbbbb });   // newels
    }
    return r;
  }
  // glass balustrade along a slab edge, leaving gaps; colliders on that level
  function balustrade(R, B, lv, ax, x0, x1, at, gaps) {
    const y = R.lv[lv].y, segs = [];
    let a = x0; (gaps || []).slice().sort((p, q) => p[0] - q[0]).forEach(g => { if (g[0] > a) segs.push([a, g[0]]); a = Math.max(a, g[1]); }); if (x1 > a) segs.push([a, x1]);
    segs.forEach(s => {
      const len = s[1] - s[0], c = (s[0] + s[1]) / 2; if (len < 0.2) return;
      if (ax === "x") { B.box("glass", len, 1.05, 0.02, c, y + 0.55, at); B.box("steel", len, 0.06, 0.08, c, y + 1.1, at); B.box("steel", len, 0.1, 0.1, c, y + 0.05, at, { c: 0xaaaaaa }); R.lv[lv].cols.push({ x0: s[0], x1: s[1], z0: at - 0.08, z1: at + 0.08 }); }
      else { B.box("glass", 0.02, 1.05, len, at, y + 0.55, c); B.box("steel", 0.08, 0.06, len, at, y + 1.1, c); B.box("steel", 0.1, 0.1, len, at, y + 0.05, c, { c: 0xaaaaaa }); R.lv[lv].cols.push({ x0: at - 0.08, x1: at + 0.08, z0: s[0], z1: s[1] }); }
    });
  }
  function column(R, B, x, z, y0, y1, r) {
    B.geo("paint", cylGeo(), x, (y0 + y1) / 2, z, { sc: [r, y1 - y0, r], c: 0xf1f1ee });
    B.geo("darksteel", cylGeo(), x, y0 + 0.06, z, { sc: [r + 0.03, 0.12, r + 0.03] });
    R.lv.forEach(L => { if (L.y >= y0 - 0.1 && L.y < y1 - 1) L.cols.push({ x0: x - r - 0.05, x1: x + r + 0.05, z0: z - r - 0.05, z1: z + r + 0.05 }); });
  }
  // a shop front set in a wall: the fascia board lettered for the shop, glazing with its window display, the glass door; spot leads inside
  function shopfront(R, B, root, lv, wall, c, width, brand, opts) {
    const o = opts || {}, y = R.lv[lv].y, W = R.W, D = R.D, A = mallAtlas();
    const br = (typeof SHOP_BRANDS === "object" && SHOP_BRANDS[brand]) || o.br || { name: brand, band: "#2a2d33", ink: "#ffffff" };
    const bg = br.band === "#ffffff" ? "#f4f5f3" : br.band, ink = br.band === "#ffffff" ? (br.ink || "#c0172b") : (br.ink || "#ffffff");
    // the frame along the wall: local u along the wall, n into the room
    let px, pz, ry;
    if (wall === "left") { px = -W / 2; pz = c; ry = Math.PI / 2; } else if (wall === "right") { px = W / 2; pz = c; ry = -Math.PI / 2; }
    else if (wall === "back") { px = c; pz = -D / 2; ry = 0; } else { px = c; pz = D / 2; ry = Math.PI; }
    B.push(px, y, pz, ry);
    const fh = o.fh || 0.75, H = o.h || 3.4, dW = 1.9;
    B.box("darksteel", width + 0.3, 0.12, 0.35, 0, H + fh + 0.06, 0.18);                                     // the head
    B.box("paint", width, fh, 0.22, 0, H + fh / 2, 0.12, { c: new THREE.Color(bg).getHex() });             // the fascia board
    B.quad("lit", width - 0.08, fh - 0.08, 0, H + fh / 2, 0.235, fascia(A, br.name, br.jp || "", bg, ink, o.mood || "shop", width - 0.08, fh - 0.08));
    B.box("darksteel", 0.08, H, 0.2, -width / 2, H / 2, 0.1); B.box("darksteel", 0.08, H, 0.2, width / 2, H / 2, 0.1);
    B.box("granite", width, 0.04, 1.2, 0, 0.02, 0.6, { c: 0x777777 });                                      // the threshold
    // glazing either side of the door, the window display behind it
    const side = (width - dW) / 2;
    for (const s of [-1, 1]) {
      const cx = s * (dW / 2 + side / 2);
      B.box("glass", side - 0.06, H - 0.5, 0.02, cx, 0.25 + (H - 0.5) / 2, 0.08);
      B.box("darksteel", side, 0.25, 0.12, cx, 0.125, 0.08);
      B.box("darksteel", 0.05, H, 0.08, s * dW / 2, H / 2, 0.08);
    }
    B.box("darksteel", width, 0.06, 0.1, 0, H - 0.25, 0.08);
    B.quad("print", dW - 0.1, H - 0.3, 0, (H - 0.3) / 2, 0.012, solid(A, "shopdark|" + brand, "#191b1f"));    // the dark shop beyond the door
    B.pop();
    // the window displays (the retail engine's dressed windows) and the opening door
    const wx = (lx, lz) => [px + Math.cos(ry) * lx + Math.sin(ry) * lz, pz - Math.sin(ry) * lx + Math.cos(ry) * lz];
    try {
      if (window.SalaryRetail && SalaryRetail.installWindows && !o.noWindows) {
        const theme = { books: 1, ramen: 2, clothes: 3, street: 3, plaza: 4, petmart: 5 }[brand] || 0;
        const list = [-1, 1].map(s => { const p = wx(s * (dW / 2 + side / 2), 0.35); return { x: p[0], y: y + 1.35, z: p[1], ry: ry, w: Math.min(2.4, side - 0.3), h: Math.min(2.3, H - 0.9), theme: theme, type: 0 }; }).filter(q => q.w > 0.6);
        const holder = new THREE.Group(); root.add(holder); SalaryRetail.installWindows(holder, list, () => {}, lean());
      }
    } catch (e) { M.errors.push("windows: " + String(e).slice(0, 80)); }
    try { const p = wx(0, 0.45); const d = interiorDoorAdd(R, p[0], p[1], ry, 1.05, 1.0); d.group.position.y = y; d.y = y; } catch (e) { /* no door */ }
    if (!o.noSpot) { const p = wx(0, 1.05); R.spots.push({ x: p[0], z: p[1], y: y, label: "go into " + br.name, act: "store", brand: brand, walk: true, ret: wall === "front" ? -1.9 : 1.9 }); }
    // and the wall it is in is solid
    const lvc = R.lv[lv].cols;
    if (wall === "left") lvc.push({ x0: -W / 2, x1: -W / 2 + 0.3, z0: c - width / 2, z1: c + width / 2 });
    return wx;
  }
  // the ticket gates: a row of automatic gates across x0..x1 at z, with fences beyond them to the walls (or to fx0/fx1)
  function gates(R, B, lv, x0, x1, z, fx0, fx1) {
    const y = R.lv[lv].y, n = Math.max(3, Math.floor((x1 - x0) / 1.05)), pitch = (x1 - x0) / n, cols = R.lv[lv].cols, A = mallAtlas();
    for (let i = 0; i <= n; i++) {
      const x = x0 + i * pitch, blue = i % 2;
      B.box("paint", 0.2, 1.0, 1.4, x, y + 0.5, z, { c: 0xdfe3e7 });
      B.box("darksteel", 0.22, 0.04, 1.42, x, y + 1.02, z);
      B.box("plastic", 0.18, 0.03, 0.3, x, y + 1.05, z + 0.48, { c: blue ? 0x2a9ad6 : 0x15894f });         // the IC reader
      B.quad("lit", 0.16, 0.12, x, y + 1.08, z + 0.62, solid(A, "gate-ok", "#36d27a"), { rx: -Math.PI / 2 });
      B.quad("lit", 0.1, 0.1, x, y + 0.9, z - 0.71, solid(A, "gate-in", i % 3 ? "#36d27a" : "#e53935"), { ry: Math.PI });
      if (i < n) { B.box("plastic", 0.04, 0.32, 0.46, x + 0.13, y + 0.62, z - 0.1, { c: 0xd9534f }); B.box("plastic", 0.04, 0.32, 0.46, x + pitch - 0.13, y + 0.62, z - 0.1, { c: 0xd9534f }); }
      cols.push({ x0: x - 0.11, x1: x + 0.11, z0: z - 0.7, z1: z + 0.7 });
    }
    const fence = (a, b) => { if (b - a < 0.2) return; B.box("glass", b - a, 1.05, 0.02, (a + b) / 2, y + 0.6, z); B.box("steel", b - a, 0.06, 0.08, (a + b) / 2, y + 1.15, z); B.box("darksteel", b - a, 0.1, 0.1, (a + b) / 2, y + 0.05, z); cols.push({ x0: a, x1: b, z0: z - 0.1, z1: z + 0.1 }); };
    fence(fx0 === undefined ? -R.W / 2 : fx0, x0 - 0.1); fence(x1 + 0.1, fx1 === undefined ? R.W / 2 : fx1);
    R.gates = { x0: x0, x1: x1, z: z, y: y, paid: false };
  }
  function ticketMachines(R, B, lv, x, z, n, ry) {
    const y = R.lv[lv].y, A = mallAtlas();
    const scr = A.add("ticketscreen", 160, 120, (g, w, h) => { g.fillStyle = "#0f3d6e"; g.fillRect(0, 0, w, h); g.fillStyle = "#ffffff"; g.font = "700 13px " + UIF(); g.textAlign = "center"; g.fillText("きっぷ  TICKETS", w / 2, 18); const b = ["IC チャージ", "きっぷ", "定期券", "English"]; b.forEach((t, i) => { g.fillStyle = ["#2ab4ff", "#36d27a", "#f2c230", "#e0587a"][i]; rr(g, 10 + (i % 2) * 74, 30 + Math.floor(i / 2) * 44, 66, 36, 6); g.fill(); g.fillStyle = "#0b1a2a"; g.fillText(t, 43 + (i % 2) * 74, 53 + Math.floor(i / 2) * 44); }); });
    const map = A.add("faremap", 512, 220, (g, w, h) => {
      g.fillStyle = "#f6f6f2"; g.fillRect(0, 0, w, h); g.fillStyle = "#15894f"; g.fillRect(0, 0, w, 26); g.fillStyle = "#fff"; g.font = "800 15px " + UIF(); g.fillText("運賃表  FARES FROM HERE (¥)", 10, 18);
      g.strokeStyle = "#9acd32"; g.lineWidth = 6; g.beginPath(); g.ellipse(w / 2, h * 0.58, w * 0.36, h * 0.3, 0, 0, TAU); g.stroke();
      ["#e53935", "#1e88e5", "#f2c230", "#8e24aa", "#00897b"].forEach((c, i) => { g.strokeStyle = c; g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, h * 0.58); g.lineTo(w / 2 + Math.cos(i * 1.3) * w * 0.48, h * 0.58 + Math.sin(i * 1.3) * h * 0.4); g.stroke(); });
      g.fillStyle = "#14171b"; g.font = "600 9px " + UIF(); for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; g.fillText(String(140 + (i % 7) * 30), w / 2 + Math.cos(a) * w * 0.36 - 8, h * 0.58 + Math.sin(a) * h * 0.3); }
    });
    B.push(x, y, z, ry || 0);
    for (let i = 0; i < n; i++) {
      const cx = (i - (n - 1) / 2) * 0.95;
      B.box("paint", 0.86, 1.62, 0.6, cx, 0.81, 0, { c: 0xe9ecef });
      B.box("paint", 0.86, 0.3, 0.62, cx, 1.68, 0, { c: 0x15894f });
      B.quad("lit", 0.5, 0.38, cx, 1.2, 0.31, scr, { rx: -0.25 });
      B.box("darksteel", 0.5, 0.06, 0.06, cx, 0.86, 0.31); B.box("darksteel", 0.3, 0.12, 0.04, cx, 0.6, 0.31);
    }
    B.quad("print", Math.max(2, n * 0.95), Math.max(2, n * 0.95) * 220 / 512, 0, 2.6, -0.28, map);
    B.pop();
    const c = Math.cos(ry || 0), s = Math.sin(ry || 0), hw = n * 0.48, out = 0.95;
    R.lv[lv].cols.push({ x0: x - Math.abs(c) * hw - Math.abs(s) * 0.35, x1: x + Math.abs(c) * hw + Math.abs(s) * 0.35, z0: z - Math.abs(s) * hw - Math.abs(c) * 0.35, z1: z + Math.abs(s) * hw + Math.abs(c) * 0.35 });
    R.spots.push({ x: x + s * out, z: z + c * out, y: y, label: "buy a ticket at the machine", act: "platforms" });
  }
  // a long counter shop (kiosk, ekiben, café): counter, goods, back shelves, canopy with its lettered sign
  function kiosk(R, B, root, lv, x, z, ry, w, d, name, jp, bg, ink, goods) {
    const y = R.lv[lv].y, A = mallAtlas();
    B.push(x, y, z, ry);
    B.box("walnut", w, 1.0, 0.6, 0, 0.5, d / 2 - 0.3);
    B.box("granite", w + 0.06, 0.05, 0.66, 0, 1.03, d / 2 - 0.3, { c: 0x555555 });
    B.box("paint", w, 2.6, 0.1, 0, 1.3, -d / 2 + 0.05, { c: 0xf1eee8 });
    for (let r = 0; r < 4; r++) B.box("oak", w - 0.2, 0.03, 0.36, 0, 0.5 + r * 0.45, -d / 2 + 0.28);
    // the goods on the back shelves and on the counter
    for (let r = 0; r < 4; r++) for (let k = 0; k < Math.floor((w - 0.4) / 0.3); k++) {
      const gx = -w / 2 + 0.3 + k * 0.3, gy = 0.52 + r * 0.45;
      if (goods === "bento") B.quad("print", 0.26, 0.17, gx, gy + 0.1, -d / 2 + 0.47, bentoArt(A, k + r));
      else if (goods === "cafe") B.geo("plastic", cylGeo(), gx, gy + 0.08, -d / 2 + 0.3, { sc: [0.05, 0.14, 0.05], c: [0xffffff, 0x3a2414, 0xc8372d][k % 3] });
      else B.box("paint", 0.22, 0.16 + (k % 3) * 0.04, 0.16, gx, gy + 0.1, -d / 2 + 0.3, { c: new THREE.Color(OMIYAGE[(k * 3 + r) % OMIYAGE.length][2]).getHex() });
    }
    for (let k = 0; k < Math.floor(w / 0.45); k++) {
      const gx = -w / 2 + 0.3 + k * 0.45;
      if (goods === "bento") { B.box("paint", 0.3, 0.07, 0.22, gx, 1.09, d / 2 - 0.3, { c: 0x2a2420 }); B.quad("print", 0.3, 0.22, gx, 1.126, d / 2 - 0.3, bentoArt(A, k), { rx: -Math.PI / 2 }); }
      else if (goods === "cafe") { if (k % 3 === 0) B.geo("chrome", cylGeo(), gx, 1.2, d / 2 - 0.35, { sc: [0.12, 0.28, 0.12] }); else B.box("glass", 0.36, 0.3, 0.3, gx, 1.21, d / 2 - 0.3); }
      else { B.box("paint", 0.28, 0.12, 0.2, gx, 1.12, d / 2 - 0.3, { c: new THREE.Color(OMIYAGE[k % OMIYAGE.length][2]).getHex() }); B.quad("print", 0.28, 0.2, gx, 1.181, d / 2 - 0.3, boxArt(A, k), { rx: -Math.PI / 2 }); }
    }
    // the canopy and the lettered sign
    B.box("paint", w + 0.2, 0.42, 0.25, 0, 2.75, d / 2 - 0.12, { c: new THREE.Color(bg).getHex() });
    B.quad("lit", w + 0.1, 0.36, 0, 2.75, d / 2 + 0.006, fascia(A, name, jp, bg, ink, goods === "cafe" ? "night" : "food", w + 0.1, 0.36));
    B.box("led", w, 0.03, 0.1, 0, 2.5, d / 2 - 0.2, { c: 0xffeedd });
    for (const s of [-1, 1]) B.box("walnut", 0.1, 2.6, d, s * w / 2, 1.3, 0);
    B.pop();
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    R.lv[lv].cols.push({ x0: x - (c * w + s * d) / 2, x1: x + (c * w + s * d) / 2, z0: z - (s * w + c * d) / 2, z1: z + (s * w + c * d) / 2 });
    { const lz = d / 2 - 1.05; R.staff.push({ x: x + Math.sin(ry) * lz, z: z + Math.cos(ry) * lz, y: y, yaw: ry }); }
  }
  // a souvenir stall: a table under a cloth canopy with boxed sweets, kokeshi, daruma and postcards
  function stall(R, B, lv, x, z, ry, idx) {
    const y = R.lv[lv].y, A = mallAtlas(), cloths = [0x7a1f1a, 0x1d3b6a, 0x3e6b3a, 0x5a3a22, 0xc8641a];
    B.push(x, y, z, ry);
    B.box("walnut", 2.4, 0.08, 1.1, 0, 0.82, 0); for (const sx of [-1.1, 1.1]) for (const sz of [-0.45, 0.45]) B.box("darksteel", 0.05, 0.8, 0.05, sx, 0.4, sz);
    B.box("fabric", 2.44, 0.42, 1.14, 0, 0.6, 0, { c: cloths[idx % cloths.length] });
    // stepped display of boxes
    for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) {
      const bx = -1.05 + k * 0.33, bz = -0.35 + r * 0.32, h = 0.07 + (2 - r) * 0.06;
      B.box("paint", 0.28, h, 0.24, bx, 0.86 + h / 2, bz, { c: new THREE.Color(OMIYAGE[(k + r * 7 + idx * 3) % OMIYAGE.length][2]).getHex() });
      B.quad("print", 0.28, 0.24, bx, 0.861 + h, bz, boxArt(A, k + r * 7 + idx * 3), { rx: -Math.PI / 2 });
    }
    // kokeshi and daruma at the back
    for (let k = 0; k < 5; k++) {
      const kx = -0.9 + k * 0.45;
      if ((k + idx) % 2) { B.geo("print", kokeshiGeo(), kx, 1.06, -0.45, { uv: kokeshiArt(A, k + idx), sc: [1, 1, 1] }); }
      else B.geo("print", sphereGeo(), kx, 1.04, -0.45, { uv: darumaArt(A), sc: [0.1, 0.12, 0.1], ry: -Math.PI / 2 });
    }
    // the canopy on its posts, with its lettered valance
    for (const sx of [-1.18, 1.18]) B.box("steel", 0.04, 2.3, 0.04, sx, 1.15, -0.5);
    B.box("fabric", 2.5, 0.03, 1.4, 0, 2.3, -0.05, { c: cloths[(idx + 2) % cloths.length], rx: 0.18 });
    const names = [["東都名産", "Tōkonto specialities"], ["瑞穂の味", "Tastes of Mizuho"], ["和菓子", "Wagashi"], ["こけし・だるま", "Folk crafts"], ["おみやげ", "Omiyage"]];
    const n = names[idx % names.length];
    B.quad("lit", 2.3, 0.32, 0, 2.08, 0.62, fascia(A, n[0], n[1], "#f6efe0", "#7a1f1a", "food", 2.3, 0.32));
    B.pop();
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    R.lv[lv].cols.push({ x0: x - (c * 2.5 + s * 1.2) / 2, x1: x + (c * 2.5 + s * 1.2) / 2, z0: z - (s * 2.5 + c * 1.2) / 2, z1: z + (s * 2.5 + c * 1.2) / 2 });
  }
  let _kok = null;
  function kokeshiGeo() {
    if (_kok) return _kok;
    const pts = [[0, 0], [0.05, 0], [0.055, 0.02], [0.048, 0.12], [0.04, 0.17], [0.03, 0.18], [0.045, 0.2], [0.052, 0.24], [0.045, 0.28], [0.02, 0.3], [0, 0.302]].map(p => new THREE.Vector2(p[0] * 1.3, p[1] * 1.3));
    return (_kok = new THREE.LatheGeometry(pts, 16));
  }
  function lockers(R, B, lv, x, z, ry, cols) {
    const y = R.lv[lv].y, A = mallAtlas();
    const face = A.add("lockerdoor", 64, 64, (g, w, h) => { g.fillStyle = "#d9dde2"; g.fillRect(0, 0, w, h); g.strokeStyle = "#9aa3ad"; g.strokeRect(1, 1, w - 2, h - 2); g.fillStyle = "#1e88e5"; g.fillRect(w - 16, h / 2 - 8, 8, 16); g.fillStyle = "#14171b"; g.font = "700 10px " + UIF(); g.fillText(String(100 + Math.floor(rnd() * 800)), 6, 14); });
    B.push(x, y, z, ry);
    B.box("paint", cols * 0.5 + 0.1, 2.0, 0.6, 0, 1.0, 0, { c: 0xc8ccd2 });
    for (let c = 0; c < cols; c++) for (let r = 0; r < 4; r++) B.quad("print", 0.46, 0.44, (c - (cols - 1) / 2) * 0.5, 0.3 + r * 0.47, 0.305, face);
    B.box("paint", cols * 0.5 + 0.1, 0.3, 0.62, 0, 2.15, 0, { c: 0x1e88e5 });
    B.quad("lit", cols * 0.5, 0.24, 0, 2.15, 0.315, wayfinding(A, "コインロッカー  Coin lockers", "IC · ¥400–700", "#1e88e5", "#ffffff", cols * 0.5, 0.24));
    B.pop();
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)), w = cols * 0.5 + 0.1;
    R.lv[lv].cols.push({ x0: x - (c * w + s * 0.6) / 2, x1: x + (c * w + s * 0.6) / 2, z0: z - (s * w + c * 0.6) / 2, z1: z + (s * w + c * 0.6) / 2 });
  }
  function signage(R, B, x, y, z, ry, text, sub, bg, ink, w, h) {
    const uv = wayfinding(mallAtlas(), text, sub, bg, ink, w, h);
    B.push(x, y, z, ry);
    B.box("darksteel", w + 0.08, h + 0.08, 0.12, 0, 0, 0);
    B.quad("lit", w, h, 0, 0, 0.065, uv); B.quad("lit", w, h, 0, 0, -0.065, uv, { ry: Math.PI });
    B.box("steel", 0.03, 1.2, 0.03, -w * 0.4, h / 2 + 0.6, 0); B.box("steel", 0.03, 1.2, 0.03, w * 0.4, h / 2 + 0.6, 0);
    B.pop();
  }
  function posterWall(B, x, y, z, ry, n, i0) {
    const A = mallAtlas();
    B.push(x, y, z, ry);
    for (let k = 0; k < n; k++) { const px = (k - (n - 1) / 2) * 1.0; B.box("darksteel", 0.86, 1.2, 0.04, px, 0, 0); B.quad("lit", 0.8, 1.13, px, 0, 0.022, poster(A, i0 + k)); }
    B.pop();
  }
  // a digital signage totem: a lit poster both sides
  function totem(R, B, lv, x, z, ry, i) {
    const y = R.lv[lv].y, A = mallAtlas();
    B.push(x, y, z, ry);
    B.box("darksteel", 0.7, 2.0, 0.22, 0, 1.0, 0); B.quad("lit", 0.6, 1.4, 0, 1.15, 0.115, poster(A, i)); B.quad("lit", 0.6, 1.4, 0, 1.15, -0.115, poster(A, i + 3), { ry: Math.PI });
    B.pop();
    R.lv[lv].cols.push({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 });
  }
  // the departures board: its own canvas, redrawn each game minute from the real timetable
  function departureBoard(R, root, x, y, z, ry, w, h, title) {
    const cv = document.createElement("canvas"); cv.width = 1024; cv.height = Math.round(1024 * h / w);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
    const m = new THREE.MeshStandardMaterial({ color: 0x111111, map: t, emissive: new THREE.Color(1, 1, 1), emissiveMap: t, emissiveIntensity: 1.1, roughness: 0.3 });
    m.userData.shDry = true; m.userData.pbrDone = true;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); mesh.position.set(x, y, z); mesh.rotation.y = ry; root.add(mesh);
    const back = mesh.clone(); back.rotation.y = ry + Math.PI; back.position.set(x - Math.sin(ry) * 0.02, y, z - Math.cos(ry) * 0.02); root.add(back);
    let minute = -1;
    const draw = () => {
      const g = cv.getContext("2d"), W = cv.width, H = cv.height;
      g.fillStyle = "#06090c"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#15894f"; g.fillRect(0, 0, W, H * 0.16); g.fillStyle = "#fff"; g.font = "800 " + Math.round(H * 0.09) + "px " + UIF(); g.textBaseline = "middle";
      const mins = typeof gameMinutes === "function" ? gameMinutes() : 480, hh = m2 => { m2 = ((m2 % 1440) + 1440) % 1440; return String(Math.floor(m2 / 60)).padStart(2, "0") + ":" + String(Math.floor(m2 % 60)).padStart(2, "0"); };
      g.fillText(title || "発車案内  DEPARTURES", W * 0.02, H * 0.08); g.textAlign = "right"; g.fillText(hh(mins), W * 0.98, H * 0.08); g.textAlign = "left";
      let rows = []; try { rows = (typeof railDestinations === "function" ? railDestinations(R.stationRef) : []).slice(0, 6); } catch (e) { rows = []; }
      if (!rows.length) rows = [{ name: "Kanjo Loop", kind: "local", fare: 160 }, { name: "Mizuho", kind: "local", fare: 420 }];
      const rh = H * 0.84 / Math.max(4, rows.length);
      rows.forEach((r, i) => {
        const yy = H * 0.16 + rh * (i + 0.5);
        g.fillStyle = i % 2 ? "#0b1015" : "#081016"; g.fillRect(0, yy - rh / 2, W, rh);
        g.font = "700 " + Math.round(rh * 0.5) + "px " + UIF();
        g.fillStyle = r.kind === "shinkansen" ? "#ff6a3c" : "#f2c230"; g.fillText(r.kind === "shinkansen" ? "新幹線" : (i % 3 === 0 ? "快速 Rapid" : "普通 Local"), W * 0.02, yy);
        g.fillStyle = "#ffffff"; g.fillText(hh(mins + 3 + i * 4 - (mins % 4)), W * 0.26, yy);
        g.fillStyle = "#c1e3d8"; g.fillText(r.name, W * 0.4, yy, W * 0.36);
        g.fillStyle = "#9fd0ff"; g.fillText((i % 2 ? "2" : "1") + "番線", W * 0.8, yy);
        g.fillStyle = "#f6efe0"; g.fillText((r.kind === "shinkansen" ? 16 : 10) + "両", W * 0.91, yy);
      });
      t.needsUpdate = true;
    };
    R.boards.push(() => { const mm = typeof gameMinutes === "function" ? Math.floor(gameMinutes()) : 0; if (mm !== minute) { minute = mm; draw(); } });
    return mesh;
  }
  // ceiling: a plaster soffit with recessed LED lines
  function soffit(B, x0, x1, z0, z1, y, holes) {
    const inHole = (x, z) => (holes || []).some(h => x > h.x0 - 0.01 && x < h.x1 + 0.01 && z > h.z0 - 0.01 && z < h.z1 + 0.01);
    const step = 4;
    for (let x = x0; x < x1 - 0.01; x += step) for (let z = z0; z < z1 - 0.01; z += step) {
      const w = Math.min(step, x1 - x), d = Math.min(step, z1 - z), cx = x + w / 2, cz = z + d / 2;
      if (inHole(cx, cz)) continue;
      B.box("paint", w, 0.06, d, cx, y, cz, { c: 0xf3f3f1 });
      if (((Math.round(x / step) + Math.round(z / step)) & 1) === 0) B.box("led", Math.min(2.6, w - 0.4), 0.02, 0.14, cx, y - 0.04, cz);
    }
  }
  // a slab: the floor of a level (granite on top, plaster underneath), with holes
  function slab(B, x0, x1, z0, z1, y, holes, top) {
    const xs = [x0, x1], zs = [z0, z1];
    (holes || []).forEach(h => { xs.push(h.x0, h.x1); zs.push(h.z0, h.z1); });
    const X = [...new Set(xs)].filter(v => v >= x0 && v <= x1).sort((a, b) => a - b), Z = [...new Set(zs)].filter(v => v >= z0 && v <= z1).sort((a, b) => a - b);
    for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Z.length - 1; j++) {
      const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2, w = X[i + 1] - X[i], d = Z[j + 1] - Z[j];
      if ((holes || []).some(h => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1)) continue;
      B.box(top || "granite", w, 0.08, d, cx, y - 0.04, cz);
      if (y > 0.5) B.box("concrete", w, 0.36, d, cx, y - 0.26, cz, { c: 0xcccccc });
    }
    // the slab edges round the holes: a steel fascia
    (holes || []).forEach(h => { if (y < 0.5) return; B.box("steel", h.x1 - h.x0, 0.46, 0.04, (h.x0 + h.x1) / 2, y - 0.23, h.z0 - 0.02); B.box("steel", h.x1 - h.x0, 0.46, 0.04, (h.x0 + h.x1) / 2, y - 0.23, h.z1 + 0.02); B.box("steel", 0.04, 0.46, h.z1 - h.z0, h.x0 - 0.02, y - 0.23, (h.z0 + h.z1) / 2); B.box("steel", 0.04, 0.46, h.z1 - h.z0, h.x1 + 0.02, y - 0.23, (h.z0 + h.z1) / 2); });
  }
  function tactile(B, x0, z0, x1, z1, y) {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0);
    B.box("plastic", 0.3, 0.012, len, (x0 + x1) / 2, y + 0.006, (z0 + z1) / 2, { ry: ry, c: 0xe8c21c });
  }

  // ---- a room with levels ----------------------------------------------------------------------------------------------------------------
  let slots = 0;
  function newRoom(s, key, W, D, H, central) {
    const k = slots++, ox = central ? -3000 : -3000 - k * 90, oz = central ? -4400 : -4650;
    const root = new THREE.Group(); root.name = "Station · " + (s.name || key); root.position.set(ox, interior.floorY, oz); root.visible = false;
    root.userData.shDry = true; root.userData.stationMall = true;
    scene.add(root);
    const R = {
      brand: "plaza", key: key, name: s.name, profile: { design: central ? "station-city" : "station-hall", wallHeight: H, accent: 0x15894f }, station: true, stationRef: s.stationRef, central: !!central,
      glassRoof: false, multi: true, noLift: true, W: W, D: D, H: H, group: root, ox: ox, oz: oz, colliders: [], items: [], stock: [], units: [], noExit: false, doorW: central ? 6 : 4,
      spots: [], lv: [], ramps: [], staff: [], boards: [], seats: [], crowd: [], doors: [], curY: 0, clear: 5.3, _views: true, stationMall: true,
      refurbishment: { rig: null, lights: [], fans: [], temperature: 24, brand: "plaza", design: "station" },
      entry: new THREE.Vector3(ox, interior.floorY, oz + D / 2 - 1.6)
    };
    return R;
  }
  function lights(R, list) {
    // (no point lights: the game draws a glow round every point light, and a hall full of them was a fog of glare)
    const hemi = new THREE.HemisphereLight(0xf4f7ff, 0x8b8579, 0.95); R.group.add(hemi);
    const key = new THREE.DirectionalLight(0xfff3e4, 0.55); key.position.set(8, 30, 14); key.target.position.set(0, 0, 0); R.group.add(key); R.group.add(key.target);
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.25); fill.position.set(-14, 20, -18); fill.target.position.set(0, 0, 0); R.group.add(fill); R.group.add(fill.target);
  }
  // the glass walls: panes that show the street photograph (seamless-hook), in steel mullions
  function glassBand(R, B, wall, from, to, y0, y1, bay, skip) {
    const S = window.seamless, W = R.W, D = R.D, n = Math.max(1, Math.round((to - from) / (bay || 3))), bw = (to - from) / n;
    for (let i = 0; i < n; i++) {
      const c = from + (i + 0.5) * bw;
      if (skip && skip(c, bw)) continue;
      const y = (y0 + y1) / 2, h = y1 - y0;
      let x, z, ry;
      if (wall === "front") { x = c; z = D / 2 - 0.12; ry = Math.PI; } else if (wall === "back") { x = c; z = -D / 2 + 0.12; ry = 0; }
      else if (wall === "left") { x = -W / 2 + 0.12; z = c; ry = Math.PI / 2; } else { x = W / 2 - 0.12; z = c; ry = -Math.PI / 2; }
      if (S && S.pane) { const m = S.pane(R.group, bw - 0.1, h, x, y, z, ry); m.userData.stationMall = true; }
      B.push(x, 0, z, ry);
      B.quad("print", bw - 0.1, h, 0, y, -0.06, solid(mallAtlas(), "sky", "#b9cfdc"));     // the daylight behind it until the photograph is taken
      B.box("darksteel", 0.1, h + 0.1, 0.16, -bw / 2, y, 0.02);
      B.pop();
    }
    const len = to - from, mid = (from + to) / 2;
    if (wall === "front" || wall === "back") { const z = wall === "front" ? D / 2 - 0.1 : -D / 2 + 0.1; B.box("darksteel", len, 0.14, 0.2, mid, y0 - 0.07, z); B.box("darksteel", len, 0.14, 0.2, mid, y1 + 0.07, z); B.box("darksteel", 0.1, y1 - y0, 0.16, to, (y0 + y1) / 2, z); }
    else { const x = wall === "left" ? -W / 2 + 0.1 : W / 2 - 0.1; B.box("darksteel", 0.2, 0.14, len, x, y0 - 0.07, mid); B.box("darksteel", 0.2, 0.14, len, x, y1 + 0.07, mid); }
  }
  // the passage out to the platforms: a portal in the back wall at level lv, its sign, and the walk-through spot
  // the back wall with real openings where the platform passages go through it
  function backWall(B, mat, W, H, D, c, holes) {
    const z = -D / 2 - 0.15, hs = holes.slice().sort((a, b) => a.x - b.x);
    let x = -W / 2;
    for (const h of hs) {
      const a = h.x - h.w / 2 - 0.3, b = h.x + h.w / 2 + 0.3;
      if (a > x) B.box(mat, a - x, H, 0.3, (x + a) / 2, H / 2, z, { c: c });
      if (h.y > 0) B.box(mat, b - a, h.y, 0.3, h.x, h.y / 2, z, { c: c });
      B.box(mat, b - a, H - h.y - 3.3, 0.3, h.x, (H + h.y + 3.3) / 2, z, { c: c });
      x = b;
    }
    if (x < W / 2) B.box(mat, W / 2 - x, H, 0.3, (x + W / 2) / 2, H / 2, z, { c: c });
  }
  // a platform passage: a real opening in the back wall, and behind it a stair climbing toward daylight
  function passage(R, B, lv, x, w, label) {
    const y = R.lv[lv].y, D = R.D, A = mallAtlas(), z = -D / 2, ow = w + 0.6, dz = 7.6, zb = z - 0.3 - dz;
    B.box("darksteel", 0.3, 3.3, 0.5, x - ow / 2 + 0.15, y + 1.65, z + 0.1); B.box("darksteel", 0.3, 3.3, 0.5, x + ow / 2 - 0.15, y + 1.65, z + 0.1); B.box("darksteel", ow, 0.3, 0.5, x, y + 3.15, z + 0.1);
    // the recess: floor, walls, a high ceiling with LED lines, the stair rising out of sight
    B.box("granite", ow, 0.1, dz, x, y - 0.05, z - 0.3 - dz / 2);
    for (const sx of [-1, 1]) {
      B.box("paint", 0.2, 6.2, dz, x + sx * (ow / 2 + 0.1), y + 3.1, z - 0.3 - dz / 2, { c: 0xeeeeea });
      B.box("granite", 0.04, 0.9, dz, x + sx * (ow / 2 - 0.02), y + 0.45, z - 0.3 - dz / 2);
      B.box("steel", 0.05, 0.05, dz - 1.4, x + sx * (ow / 2 - 0.12), y + 0.9 + 1.9, z - 0.3 - 1.4 - (dz - 1.4) / 2, { rx: -Math.atan2(4.2, 6.3) });
    }
    B.box("paint", ow + 0.4, 0.2, dz, x, y + 6.2, z - 0.3 - dz / 2, { c: 0xf3f3f1 });
    for (const k of [-0.6, 0.6]) B.box("led", 0.08, 0.03, dz - 0.4, x + k, y + 6.08, z - 0.3 - dz / 2);
    B.box("paint", ow + 0.4, 6.2, 0.2, x, y + 3.1, zb - 0.1, { c: 0xeeeeea });
    const n = 14, rise = 0.3, go = 0.45, s0 = z - 1.4;
    for (let i = 0; i < n; i++) {
      const zz = s0 - i * go - go / 2, top = y + (i + 1) * rise;
      B.box("granite", ow, top - y, go, x, (top + y) / 2, zz, { c: 0xb0b4b8 });
      B.box("darksteel", ow, 0.02, 0.05, x, top + 0.01, zz + go / 2 - 0.03);
    }
    B.box("granite", ow, n * rise, zb - (s0 - n * go), x, y + n * rise / 2, (zb + s0 - n * go) / 2, { c: 0xb0b4b8 });
    B.box("warmled", ow, 1.6, 0.04, x, y + n * rise + 1.0, zb + 0.02);           // daylight from the platform above
    B.quad("lit", w + 0.5, 0.42, x, y + 3.6, z + 0.52, wayfinding(A, label, "のりば  Platforms  ↑", "#14171b", "#ffd21c", w + 0.5, 0.42));
    tactile(B, x, z - 1.2, x, z + 4.5, y);
    R.spots.push({ x: x, z: z + 0.75, y: y, label: "up to the platforms", act: "toPlatform", walk: true });
    if (!R.platformGate) R.platformGate = { x: x, w: w, z: z, y: y };
  }

  // ---- Tōkonto Central: Station City ------------------------------------------------------------------------------------------------------
  function buildCentral(s, key) {
    seed = 20261120;
    const W = 72, D = 48, H = 18, R = newRoom(s, key, W, D, H, true), B = new Batch(), root = R.group, A = mallAtlas();
    const HOLE = { x0: -16, x1: 16, z0: -6.4, z1: 6.4 };
    R.lv = [{ y: 0, holes: [], cols: [] }, { y: 6, holes: [HOLE], cols: [] }, { y: 12, holes: [HOLE], cols: [] }];
    R.clear = 5.2;
    // the floors and the ceilings
    slab(B, -W / 2, W / 2, -D / 2, D / 2, 0, [], "granite");
    slab(B, -W / 2, W / 2, -D / 2, D / 2, 6, [HOLE], "granite");
    slab(B, -W / 2, W / 2, -D / 2, D / 2, 12, [HOLE], "parquet");
    soffit(B, -W / 2, W / 2, -D / 2, D / 2, 5.52, [HOLE]); soffit(B, -W / 2, W / 2, -D / 2, D / 2, 11.52, [HOLE]); soffit(B, -W / 2, W / 2, -D / 2, D / 2, 17.95, [HOLE]);
    // the walls: limestone, with the steel cap line at each floor
    backWall(B, "limestone", W, H, D, 0xf4f1ea, [{ x: -12, w: 3.4, y: 6 }, { x: 12, w: 3.4, y: 6 }]);
    for (const sx of [-1, 1]) B.box("limestone", 0.3, H, D, sx * (W / 2 + 0.15), H / 2, 0, { c: 0xf0ede6 });
    for (const y of [5.6, 11.6]) { B.box("steel", W, 0.4, 0.06, 0, y, -D / 2 + 0.02); for (const sx of [-1, 1]) B.box("steel", 0.06, 0.4, D, sx * (W / 2 - 0.02), y, 0); }
    // the street front: glass, three storeys, the doors in the middle of the ground floor
    glassBand(R, B, "front", -W / 2 + 0.3, W / 2 - 0.3, 0.12, 5.4, 3, (c, bw) => Math.abs(c) < 3 + bw / 2 - 0.1);
    glassBand(R, B, "front", -W / 2 + 0.3, W / 2 - 0.3, 6.12, 11.4, 3);
    glassBand(R, B, "front", -W / 2 + 0.3, W / 2 - 0.3, 12.12, 17.8, 3);
    B.box("darksteel", W, 0.6, 0.3, 0, 5.75, D / 2 - 0.15); B.box("darksteel", W, 0.6, 0.3, 0, 11.75, D / 2 - 0.15);
    B.box("darksteel", 6.4, 2.2, 0.3, 0, 4.3, D / 2 - 0.15);
    B.quad("lit", 6.0, 0.9, 0, 4.4, D / 2 - 0.32, wayfinding(A, "東都ステーションシティ", "TŌKONTO STATION CITY", "#15894f", "#ffffff", 6, 0.9), { ry: Math.PI });
    for (const sx of [-1, 1]) interiorDoorAdd(R, sx * 1.5, D / 2 - 0.2, Math.PI, 1.55, 1.2);
    B.box("rubber", 6, 0.02, 3.0, 0, 0.012, D / 2 - 1.6, { c: 0x2a2d33 });                                // the entrance mat
    // the glass roof over the atrium: a barrel vault on steel ribs
    {
      const N = 12, rise = 4.2, half = (HOLE.z1 - HOLE.z0) / 2, ybase = 18;
      for (let i = 0; i < N; i++) {
        const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N, z0 = -Math.cos(a0) * half, z1 = -Math.cos(a1) * half, y0 = ybase + Math.sin(a0) * rise, y1 = ybase + Math.sin(a1) * rise;
        const len = Math.hypot(z1 - z0, y1 - y0), rx = -Math.atan2(y1 - y0, z1 - z0);
        B.box("glass", HOLE.x1 - HOLE.x0, 0.03, len, 0, (y0 + y1) / 2, (z0 + z1) / 2, { rx: rx });
        for (let x = HOLE.x0; x <= HOLE.x1 + 0.01; x += 3.2) B.box("steel", 0.12, 0.22, len + 0.02, x, (y0 + y1) / 2 - 0.1, (z0 + z1) / 2, { rx: rx });
      }
      for (let x = HOLE.x0; x <= HOLE.x1; x += 1.6) B.box("steel", 0.05, 0.05, half * 2, x, ybase - 0.1, 0);
      B.box("steel", HOLE.x1 - HOLE.x0 + 0.6, 0.5, 0.5, 0, ybase - 0.25, HOLE.z0 - 0.25); B.box("steel", HOLE.x1 - HOLE.x0 + 0.6, 0.5, 0.5, 0, ybase - 0.25, HOLE.z1 + 0.25);
    }
    // the escalators and the stairs: up from the street floor towards the back, then up again towards the front
    addRamp(R, B, "stairs", -14.5, HOLE.z1, HOLE.z0, 0, 6, 2.5);
    addRamp(R, B, "down", -12.2, HOLE.z1, HOLE.z0, 0, 6);
    addRamp(R, B, "up", -10.4, HOLE.z1, HOLE.z0, 0, 6);
    addRamp(R, B, "up", 10.4, HOLE.z0, HOLE.z1, 6, 12);
    addRamp(R, B, "down", 12.2, HOLE.z0, HOLE.z1, 6, 12);
    addRamp(R, B, "stairs", 14.5, HOLE.z0, HOLE.z1, 6, 12, 2.5);
    R.lv[0].cols.push({ x0: -16.0, x1: -9.5, z0: HOLE.z0, z1: HOLE.z1 - 2.2 });            // under the first flights
    // balustrades round the atrium, open where the flights land
    balustrade(R, B, 1, "x", HOLE.x0, HOLE.x1, HOLE.z0, [[-16, -9.5], [9.5, 16]]);
    balustrade(R, B, 1, "x", HOLE.x0, HOLE.x1, HOLE.z1, []);
    balustrade(R, B, 1, "z", HOLE.z0, HOLE.z1, HOLE.x0, []); balustrade(R, B, 1, "z", HOLE.z0, HOLE.z1, HOLE.x1, []);
    balustrade(R, B, 2, "x", HOLE.x0, HOLE.x1, HOLE.z0, []);
    balustrade(R, B, 2, "x", HOLE.x0, HOLE.x1, HOLE.z1, [[9.5, 16]]);
    balustrade(R, B, 2, "z", HOLE.z0, HOLE.z1, HOLE.x0, []); balustrade(R, B, 2, "z", HOLE.z0, HOLE.z1, HOLE.x1, []);
    // the columns
    for (const x of [-28, -16.8, 16.8, 28]) for (const z of [-15, -7, 7, 15]) column(R, B, x, z, 0, 18, 0.38);
    // floor names on the columns by the flights
    [[0, "1F", "Street · Information · Souvenirs"], [1, "2F", "Ticket gates · Platforms · Konbini"], [2, "3F", "Restaurants · Fashion"]].forEach(f => {
      const y = R.lv[f[0]].y; for (const x of [-16.8, 16.8]) for (const z of [-7, 7]) { B.push(x, y + 2.6, z, Math.atan2(-x, -z)); B.quad("lit", 0.6, 0.36, 0, 0, 0.4, wayfinding(A, f[1], "", "#14171b", "#ffffff", 0.6, 0.36)); B.pop(); }
    });

    // ---- 1F: the street concourse ----
    shopfront(R, B, root, 0, "left", 13, 7, "ramen", { mood: "food" });
    shopfront(R, B, root, 0, "left", 1, 7.5, "pharmacy", { mood: "medical" });
    shopfront(R, B, root, 0, "left", -12, 7.5, "books", { mood: "retro" });
    kiosk(R, B, root, 0, W / 2 - 1.3, 15, -Math.PI / 2, 6, 2.4, "Hana-ya", "花屋", "#3e6b3a", "#f6efe0", "omiyage");
    kiosk(R, B, root, 0, W / 2 - 1.3, 5, -Math.PI / 2, 5, 2.4, "Taiyaki Kuro", "たい焼き", "#5a3a22", "#f2c230", "bento");
    kiosk(R, B, root, 0, W / 2 - 1.3, -5, -Math.PI / 2, 6, 2.4, "Tōkonto Meisan", "東都名産", "#7a1f1a", "#e8c46a", "omiyage");
    kiosk(R, B, root, 0, W / 2 - 1.3, -15, -Math.PI / 2, 5, 2.4, "Bakery Komugi", "ベーカリー", "#c8641a", "#ffffff", "bento");
    // the autumn souvenir fair under the atrium
    stall(R, B, 0, -4.5, -3.2, 0, 0); stall(R, B, 0, 1.0, -3.2, 0, 1); stall(R, B, 0, 6.5, -3.2, 0, 2);
    stall(R, B, 0, -4.5, 3.4, Math.PI, 3); stall(R, B, 0, 1.0, 3.4, Math.PI, 4); stall(R, B, 0, 6.5, 3.4, Math.PI, 0);
    signage(R, B, 1, 4.6, 0, 0, "秋の東都みやげ市", "Autumn souvenir fair · 1F atrium", "#7a1f1a", "#f6efe0", 5, 0.7);
    // information, lockers, cash machines, the posters along the back
    kiosk(R, B, root, 0, 9, 13, 0, 4.4, 2.0, "Information", "案内所", "#15894f", "#ffffff", "cafe");
    lockers(R, B, 0, -26, -D / 2 + 0.45, 0, 10); lockers(R, B, 0, -18.5, -D / 2 + 0.45, 0, 8);
    for (let k = 0; k < 3; k++) { B.push(-8 - k * 1.3, 0, -D / 2 + 0.5, 0); B.box("paint", 1.0, 1.7, 0.8, 0, 0.85, 0, { c: 0xdfe3e7 }); B.box("paint", 1.0, 0.3, 0.82, 0, 1.85, 0, { c: 0xc8372d }); B.quad("lit", 0.5, 0.36, 0, 1.25, 0.41, solid(A, "atm", "#1e5aa8"), { rx: -0.3 }); B.pop(); }
    R.lv[0].cols.push({ x0: -11.2, x1: -7.4, z0: -D / 2, z1: -D / 2 + 1 });
    B.quad("lit", 4, 0.4, -9.3, 2.45, -D / 2 + 0.92, wayfinding(A, "ATM  ·  両替", "", "#c8372d", "#ffffff", 4, 0.4));
    posterWall(B, 6, 2.2, -D / 2 + 0.05, 0, 8, 0); posterWall(B, 22, 2.2, -D / 2 + 0.05, 0, 6, 3);
    signage(R, B, 2, 4.2, -D / 2 + 3, 0, "トイレ  Toilets  →", "Lockers · ATM", "#14171b", "#ffd21c", 3.6, 0.5);
    for (const p of [[-20, 8], [20, 8], [-20, -8], [20, -8]]) bench(B, p[0], 0, p[1], 0, 2.2), bench(B, p[0], 0, p[1] + 0.8, Math.PI, 2.2), R.lv[0].cols.push({ x0: p[0] - 1.2, x1: p[0] + 1.2, z0: p[1] - 0.4, z1: p[1] + 1.2 });
    totem(R, B, 0, -8, 18, Math.PI, 0); totem(R, B, 0, 20, 18, Math.PI, 2); totem(R, B, 0, -24, 0, Math.PI / 2, 4);
    // seating islands round planters in the entrance hall, and the floor directory
    for (const x of [-7, 4]) { B.box("walnut", 3.2, 0.45, 3.2, x, 0.225, 12); B.box("oak", 3.4, 0.06, 3.4, x, 0.48, 12); B.box("darksteel", 1.6, 0.5, 1.6, x, 0.76, 12); plant(root, x, 1.0, 12, true); R.lv[0].cols.push({ x0: x - 1.75, x1: x + 1.75, z0: 10.25, z1: 13.75 }); R.seats.push({ x: x, z: 13.9, lv: 0, yaw: 0 }, { x: x, z: 10.1, lv: 0, yaw: Math.PI }); }
    { const dir = A.add("directory", 360, 520, (g, w, h) => { g.fillStyle = "#14171b"; g.fillRect(0, 0, w, h); g.fillStyle = "#15894f"; g.fillRect(0, 0, w, 60); g.fillStyle = "#fff"; g.font = "800 24px " + UIF(); g.fillText("フロアガイド  FLOOR GUIDE", 16, 40);
        [["3F", "Suit Select · Machi Street · Menya Ippai · Udon · Curry · Gyoza", "#7a1f1a"], ["2F", "Ticket gates · Platforms 1–4 · 11 Eleven · Sushi Go-Go · Ekiben · Wagashi · Mizu Coffee · EKIMART", "#15894f"], ["1F", "Street · Information · Menya Ippai · Kusuri Plus · Hon-no-Mori · Hana-ya · Taiyaki · Souvenir fair · Lockers · ATM", "#1e5aa8"]].forEach((f, i) => {
          const y = 80 + i * 145; g.fillStyle = f[2]; g.fillRect(16, y, 64, 125); g.fillStyle = "#fff"; g.font = "900 30px " + UIF(); g.fillText(f[0], 24, y + 74);
          g.font = "600 15px " + UIF(); const words = f[1].split(" · "); words.forEach((t, k) => g.fillText("· " + t, 92, y + 18 + k * 13 * 1.0 + k * 1.5));
        }); });
      B.push(0, 0, 9.4, 0); B.box("darksteel", 1.3, 2.0, 0.25, 0, 1.0, 0); B.quad("lit", 1.15, 1.66, 0, 1.1, 0.13, dir); B.quad("lit", 1.15, 1.66, 0, 1.1, -0.13, dir, { ry: Math.PI }); B.pop(); R.lv[0].cols.push({ x0: -0.8, x1: 0.8, z0: 9.1, z1: 9.7 }); }
    tactile(B, 0, D / 2 - 0.3, 0, 8, 0); tactile(B, 0, 8, -10.4, 7.6, 0);
    signage(R, B, -12, 4.7, 9, Math.PI, "↑ 2F  改札・のりば", "Ticket gates · Platforms · Konbini", "#14171b", "#ffd21c", 4.4, 0.7);
    signage(R, B, 12, 4.7, 9, Math.PI, "出口  EXIT  ↓", "Street · Taxis · Buses", "#ffd21c", "#14171b", 3.6, 0.6);
    // ---- 2F: the platform floor ----
    gates(R, B, 1, -9, 9, -13);
    R.lv[1].cols.push({ x0: -9.1, x1: 9.1, z0: -13.05, z1: -12.95 }); R.lv[1].cols.pop();       // (the lanes themselves are open)
    passage(R, B, 1, -12, 3.4, "1・2番線"); passage(R, B, 1, 12, 3.4, "3・4番線  新幹線");
    departureBoard(R, root, -5, 9.6, -12.6, 0, 8.4, 1.5, "発車案内  DEPARTURES  ·  NHRail"); departureBoard(R, root, 5, 9.6, -12.6, 0, 8.4, 1.5, "到着  ARRIVALS  ·  NHRail");
    B.box("darksteel", 18.4, 0.1, 0.1, 0, 10.45, -12.6); for (const x of [-8, 0, 8]) B.box("steel", 0.04, 1.5, 0.04, x, 11.2, -12.6);
    signage(R, B, 0, 8.5, -12.9, 0, "改札口  TICKET GATES", "IC ピッ · tickets from the machines", "#15894f", "#ffffff", 7, 0.6);
    ticketMachines(R, B, 1, -21, -12.4, 6, 0); ticketMachines(R, B, 1, 21, -12.4, 6, 0);
    tactile(B, -10.4, -7, -2, -12.2, 6); tactile(B, 10.4, -7, 2, -12.2, 6);
    // the paid side: vending machines of every kind, a kiosk, benches, a waiting room
    const vbank = (x0, list) => list.forEach((t, i) => { vendMachine(B, t, x0 + i * 1.08, 6, -D / 2 + 0.45, 0); });
    vbank(-32.5, ["cold", "hot", "coffee", "ice", "snack", "noodle", "tea", "water"]); R.lv[1].cols.push({ x0: -33.1, x1: -24.4, z0: -D / 2, z1: -D / 2 + 0.95 });
    vbank(24.4, ["umbrella", "news", "omiyage", "charger", "health", "flower", "gacha", "cold"]); R.lv[1].cols.push({ x0: 23.8, x1: 32.6, z0: -D / 2, z1: -D / 2 + 0.95 });
    bin3(B, -23.3, 6, -D / 2 + 0.4, 0); bin3(B, 22.6, 6, -D / 2 + 0.4, 0);
    kiosk(R, B, root, 1, 0, -D / 2 + 1.3, 0, 6, 2.4, "EKIMART", "駅マート", "#1e5aa8", "#ffffff", "omiyage");
    kiosk(R, B, root, 1, -20, -D / 2 + 1.3, 0, 4.8, 2.4, "Ekiben Matsuri", "駅弁まつり", "#7a1f1a", "#f2c230", "bento");
    kiosk(R, B, root, 1, 19.6, -D / 2 + 1.3, 0, 4.8, 2.4, "Mizu Coffee", "ミズコーヒー", "#173844", "#eaf2ef", "cafe");
    for (const x of [-26, -6, 6, 26]) { bench(B, x, 6, -17.5, 0, 2.4); bench(B, x, 6, -16.7, Math.PI, 2.4); R.lv[1].cols.push({ x0: x - 1.3, x1: x + 1.3, z0: -17.9, z1: -16.3 }); R.seats.push({ x: x, z: -17.6, lv: 1, yaw: 0 }); }
    posterWall(B, -6, 8.4, -D / 2 + 0.05, 0, 4, 1); posterWall(B, 6, 8.4, -D / 2 + 0.05, 0, 4, 5);
    // the front of the floor: the konbini, the ekiben shop, the café, souvenir stalls, the gacha wall
    shopfront(R, B, root, 1, "left", 14, 8, "eleven", { mood: "shop" });
    shopfront(R, B, root, 1, "left", 1, 7, "sushi", { mood: "food" });
    kiosk(R, B, root, 1, W / 2 - 1.3, 15, -Math.PI / 2, 6, 2.4, "Ekiben-ya", "駅弁屋", "#c8372d", "#ffffff", "bento");
    kiosk(R, B, root, 1, W / 2 - 1.3, 4, -Math.PI / 2, 6, 2.4, "Kanda Wagashi", "神田和菓子", "#3e6b3a", "#f6efe0", "omiyage");
    stall(R, B, 1, -8, 15, Math.PI, 1); stall(R, B, 1, -2.5, 15, Math.PI, 3); stall(R, B, 1, 3, 15, Math.PI, 2); stall(R, B, 1, 8.5, 15, Math.PI, 4);
    for (let i = 0; i < 8; i++) vendMachine(B, "gacha", -14 + i * 1.08, 6, D / 2 - 0.9, Math.PI);
    R.lv[1].cols.push({ x0: -14.6, x1: -5.8, z0: D / 2 - 1.4, z1: D / 2 });
    for (let i = 0; i < 4; i++) { const x = 20 + i * 3; B.geo("walnut", cylGeo(), x, 6.74, 20, { sc: [0.45, 0.04, 0.45] }); B.geo("darksteel", cylGeo(), x, 6.37, 20, { sc: [0.05, 0.72, 0.05] }); for (const s2 of [-1, 1]) { B.box("oak", 0.42, 0.04, 0.42, x + s2 * 0.75, 6.45, 20); B.box("darksteel", 0.04, 0.45, 0.04, x + s2 * 0.75, 6.22, 20); } R.lv[1].cols.push({ x0: x - 1.0, x1: x + 1.0, z0: 19.6, z1: 20.4 }); }
    signage(R, B, 10.4, 10.7, 8, Math.PI, "↑ 3F  レストラン・ファッション", "Restaurants · Suit Select · Machi Street", "#14171b", "#ffd21c", 4.6, 0.7);
    totem(R, B, 1, -24, 2, Math.PI / 2, 1); totem(R, B, 1, 24, -2, -Math.PI / 2, 6);
    plant(root, -31, 6, 20, true); plant(root, 31, 6, -10, true); plant(root, -31, 6, -10, false);
    // ---- 3F: restaurants and fashion ----
    shopfront(R, B, root, 2, "left", 12, 9, "clothes", { mood: "office" });
    shopfront(R, B, root, 2, "right", 12, 8, "street", { mood: "play" });
    shopfront(R, B, root, 2, "back", -12, 8, "ramen", { mood: "food" });
    kiosk(R, B, root, 2, 8, -D / 2 + 1.3, 0, 5, 2.4, "Udon Hachi", "うどん八", "#5a3a22", "#f6efe0", "bento");
    kiosk(R, B, root, 2, 15, -D / 2 + 1.3, 0, 5, 2.4, "Curry Kanda", "カレー神田", "#c8641a", "#ffffff", "bento");
    kiosk(R, B, root, 2, 22, -D / 2 + 1.3, 0, 5, 2.4, "Gyoza Gin", "餃子 銀", "#14171b", "#e8c46a", "bento");
    for (let i = 0; i < 12; i++) {
      const x = -28 + (i % 6) * 4.4, z = 17 + Math.floor(i / 6) * 4;
      if (Math.abs(x) < 2) continue;
      B.box("oak", 1.4, 0.05, 0.8, x, 12.74, z); B.box("darksteel", 0.06, 0.72, 0.06, x, 12.37, z);
      for (const s2 of [-1, 1]) { B.box("fabric", 0.44, 0.06, 0.44, x, 12.46, z + s2 * 0.7, { c: 0x1d3b6a }); B.box("darksteel", 0.04, 0.45, 0.04, x, 12.23, z + s2 * 0.7); B.box("fabric", 0.44, 0.45, 0.05, x, 12.7, z + s2 * 0.92, { c: 0x1d3b6a }); }
      R.lv[2].cols.push({ x0: x - 0.8, x1: x + 0.8, z0: z - 1.0, z1: z + 1.0 });
    }
    signage(R, B, 0, 16.4, 9, Math.PI, "レストラン街  RESTAURANTS", "Udon · Curry · Gyoza · Ramen", "#7a1f1a", "#f6efe0", 6, 0.7);
    plant(root, 31, 12, 20, true); plant(root, -31, 12, -2, true);
    totem(R, B, 2, 28, 2, -Math.PI / 2, 5);
    // the hanging name over the atrium, and the seasonal banners
    B.box("darksteel", 14.4, 1.6, 0.25, 0, 16.6, 0);
    const nm = wayfinding(A, "東都ステーションシティ", "TŌKONTO STATION CITY  ·  NHRail", "#0e2a33", "#f4f8fa", 14, 1.4);
    B.quad("lit", 14, 1.4, 0, 16.6, 0.13, nm); B.quad("lit", 14, 1.4, 0, 16.6, -0.13, nm, { ry: Math.PI });
    for (const x of [-12, 12]) B.box("steel", 0.03, 1.5, 0.03, x * 0.4, 17.6, 0);
    for (let i = 0; i < 6; i++) { const x = -12.5 + i * 5; B.box("fabric", 1.2, 3.2, 0.02, x, 15.0, HOLE.z1 - 0.25, { c: [0x7a1f1a, 0xc8641a, 0xe8a33d][i % 3] }); B.quad("print", 1.1, 3.0, x, 15.0, HOLE.z1 - 0.23, poster(A, i)); }
    // the people's seats and the staff
    R.seats.push({ x: -20, z: 7.6, lv: 0, yaw: 0 }, { x: 20, z: 7.6, lv: 0, yaw: 0 }, { x: -20, z: -8.3, lv: 0, yaw: 0 }, { x: 20, z: -8.3, lv: 0, yaw: 0 });
    lights(R, [[0, 4.4, 0, 0xfff1df, 1.1, 46], [0, 10, -16, 0xf4f7ff, 0.9, 40], [0, 10, 16, 0xfff1df, 0.9, 40], [0, 16.5, 10, 0xfff6ea, 0.8, 44], [-26, 4, 0, 0xfff1df, 0.6, 30], [26, 4, 0, 0xfff1df, 0.6, 30]]);
    B.build(root, "Tōkonto Station City");
    return R;
  }

  // ---- every other station: the street hall, the flights up to the gate floor at the line's height, the platform passage ------------------
  function buildLocal(s, key, st) {
    seed = 1 + (Math.abs(Math.round(((st && st.centre && st.centre[0]) || 7) * 13 + ((st && st.centre && st.centre[1]) || 3))) % 100000);
    const name = s.name || "Station", mizuho = /mizuho|瑞穂/i.test(name + " " + (s.city || "")), soti = /soti/i.test(name);
    let rise = 4.5; try { if (st && st.conc && st.conc.deckY) rise = st.conc.deckY - (s.groundY !== undefined ? s.groundY : world.surfaceY(s.door[0], s.door[1])); } catch (e) { /* default */ }
    const hU = Math.round(clampN(rise, 3.6, 6.4) * 10) / 10, W = 30, D = 30, H = hU + 4.6;
    const R = newRoom(s, key, W, D, H, false), B = new Batch(), root = R.group, A = mallAtlas();
    const run = hU * 1.75 + 2.6, z0 = 6.2, z1 = z0 - run, gz = z1 - 2.8;
    R.lv = [{ y: 0, holes: [], cols: [] }, { y: hU, holes: [{ x0: -W / 2, x1: W / 2, z0: z1, z1: D / 2 }], cols: [] }];
    R.clear = Math.min(4.2, hU - 0.6);
    const wall = mizuho ? "oak" : "limestone", floor = mizuho ? "terrazzo" : "granite";
    slab(B, -W / 2, W / 2, -D / 2, D / 2, 0, [], floor);
    slab(B, -W / 2, W / 2, -D / 2, z1, hU, [], floor);
    soffit(B, -W / 2, W / 2, -D / 2, z1, hU - 0.47, []); soffit(B, -W / 2, W / 2, -D / 2, D / 2, H - 0.05, []);
    backWall(B, wall, W, H, D, 0xf2efe8, [{ x: 0, w: 3.0, y: hU }]);
    for (const sx of [-1, 1]) B.box(wall, 0.3, H, D, sx * (W / 2 + 0.15), H / 2, 0, { c: 0xeeebe4 });
    B.box("steel", W, 0.3, 0.06, 0, hU - 0.3, -D / 2 + 0.02);
    glassBand(R, B, "front", -W / 2 + 0.3, W / 2 - 0.3, 0.12, Math.min(H - 0.4, 6.5), 3, (c, bw) => Math.abs(c) < 2 + bw / 2 - 0.1);
    if (H - 0.4 > 7) glassBand(R, B, "front", -W / 2 + 0.3, W / 2 - 0.3, 6.62, H - 0.3, 3);
    B.box("darksteel", 4.4, Math.max(0.6, Math.min(H - 0.4, 6.5) - 3.1), 0.3, 0, (3.1 + Math.min(H - 0.4, 6.5)) / 2, D / 2 - 0.15);
    B.quad("lit", 4.0, 0.6, 0, 3.6, D / 2 - 0.32, wayfinding(A, name, "NHRail  ·  " + (s.city || "Tōkonto"), "#15894f", "#ffffff", 4, 0.6), { ry: Math.PI });
    for (const sx of [-1, 1]) interiorDoorAdd(R, sx * 1.0, D / 2 - 0.2, Math.PI, 1.05, 1.1);
    B.box("rubber", 4, 0.02, 2.4, 0, 0.012, D / 2 - 1.4, { c: 0x2a2d33 });
    // the flights: stairs, an up and a down escalator
    addRamp(R, B, "stairs", -3.2, z0, z1, 0, hU, 2.6);
    addRamp(R, B, "up", -0.9, z0, z1, 0, hU);
    addRamp(R, B, "down", 0.9, z0, z1, 0, hU);
    R.lv[0].cols.push({ x0: -4.6, x1: 1.6, z0: z1, z1: z0 - 2.2 });
    balustrade(R, B, 1, "x", -W / 2, W / 2, z1, [[-4.5, 1.5]]);
    for (const x of [-9, 9]) column(R, B, x, z1 - 0.6, 0, H, 0.3);
    // the gate floor
    gates(R, B, 1, -5, 5, gz);
    passage(R, B, 1, 0, 3.0, mizuho ? "のりば" : "1・2番線");
    departureBoard(R, root, 0, hU + 3.0, gz + 0.3, 0, 6, 1.1);
    signage(R, B, 0, hU + 2.25, gz - 0.25, 0, "改札口  TICKET GATES", "", "#15894f", "#ffffff", 4.5, 0.4);
    ticketMachines(R, B, 1, 10, gz + 0.75, 3, 0);
    // the paid side: a row of vending machines and a bin each side of the passage, a bench
    const types = VEND_ORDER.slice(), off = Math.floor(rnd() * types.length);
    const nv = 5;
    for (let i = 0; i < nv; i++) { vendMachine(B, types[(off + i) % types.length], -14 + 0.55 + i * 1.08, hU, -D / 2 + 0.45, 0); vendMachine(B, types[(off + nv + i) % types.length], 14 - 0.55 - i * 1.08, hU, -D / 2 + 0.45, 0); }
    R.lv[1].cols.push({ x0: -15, x1: -14 + nv * 1.08 + 0.1, z0: -D / 2, z1: -D / 2 + 0.95 }, { x0: 14 - nv * 1.08 - 0.1, x1: 15, z0: -D / 2, z1: -D / 2 + 0.95 });
    bin3(B, -14 + nv * 1.08 + 1.0, hU, -D / 2 + 0.4, 0); bin3(B, 14 - nv * 1.08 - 1.0, hU, -D / 2 + 0.4, 0);
    R.lv[1].cols.push({ x0: -14 + nv * 1.08 + 0.2, x1: -14 + nv * 1.08 + 1.8, z0: -D / 2, z1: -D / 2 + 0.7 }, { x0: 14 - nv * 1.08 - 1.8, x1: 14 - nv * 1.08 - 0.2, z0: -D / 2, z1: -D / 2 + 0.7 });
    if (gz + D / 2 > 4.5) { for (const x of [-7, 7]) { bench(B, x, hU, (gz - D / 2) / 2, Math.PI, 2.4); R.lv[1].cols.push({ x0: x - 1.3, x1: x + 1.3, z0: (gz - D / 2) / 2 - 0.4, z1: (gz - D / 2) / 2 + 0.4 }); } }
    posterWall(B, -6.5, hU + 2.6, -D / 2 + 0.05, 0, 3, 2); posterWall(B, 6.5, hU + 2.6, -D / 2 + 0.05, 0, 3, 5);
    // the street hall: the konbini, a counter, lockers, the souvenir stand, benches, posters
    shopfront(R, B, root, 0, "left", 8.5, 7.5, "eleven", { mood: "shop", h: 3.1 });
    if (!mizuho) shopfront(R, B, root, 0, "right", 8.5, 6.5, soti ? "sushi" : "ramen", { mood: "food", h: 3.1 });
    else kiosk(R, B, root, 0, W / 2 - 1.3, 8.5, -Math.PI / 2, 5, 2.4, "Mizuho Soba", "瑞穂そば", "#5a3a22", "#f6efe0", "bento");
    kiosk(R, B, root, 0, W / 2 - 1.3, -1.5, -Math.PI / 2, 4.4, 2.2, mizuho ? "Mizuho Meisan" : "Eki Kiosk", mizuho ? "瑞穂名産" : "キオスク", mizuho ? "#7a1f1a" : "#1e5aa8", "#ffffff", "omiyage");
    lockers(R, B, 0, -10, -D / 2 + 0.45, 0, 8);
    stall(R, B, 0, 7, -10, 0, Math.floor(rnd() * 5));
    for (const p of [[-10, 0.5]]) { bench(B, p[0], 0, p[1], Math.PI / 2, 2.4); R.lv[0].cols.push({ x0: p[0] - 0.4, x1: p[0] + 0.4, z0: p[1] - 1.3, z1: p[1] + 1.3 }); R.seats.push({ x: p[0], z: p[1], lv: 0, yaw: Math.PI / 2 }); }
    posterWall(B, -W / 2 + 0.05, 2.2, -6, Math.PI / 2, 4, 0);
    totem(R, B, 0, 6, 10, Math.PI, Math.floor(rnd() * 8));
    vendMachine(B, "cold", -W / 2 + 0.45, 0, 0.6, Math.PI / 2); vendMachine(B, "hot", -W / 2 + 0.45, 0, 1.7, Math.PI / 2); R.lv[0].cols.push({ x0: -W / 2, x1: -W / 2 + 0.95, z0: 0, z1: 2.3 });
    signage(R, B, -3.2, Math.min(hU + 2.4, H - 0.9), z0 + 1.0, Math.PI, "↑ 改札・のりば", "Ticket gates · Platforms", "#14171b", "#ffd21c", 3.6, 0.6);
    tactile(B, 0, D / 2 - 0.3, 0, z0 + 0.5, 0); tactile(B, -0.9, z1 - 0.6, 0, gz + 0.8, hU);
    plant(root, -12.5, 0, 13, true); plant(root, 12.5, 0, 13, true);
    lights(R, [[0, Math.max(3, hU - 0.8), -8, 0xfff1df, 0.8, 26], [0, H - 1.2, 8, 0xf4f7ff, 0.9, 30]]);
    B.build(root, name);
    return R;
  }

  // ---- which room a station gets ---------------------------------------------------------------------------------------------------------
  function isCentral(s) { return !!s.central || /central|中央/i.test(s.name || ""); }
  function roomFor(s) {
    const central = isCentral(s), key = central ? "mall:central" : "mall:" + (s.name || "") + ":" + (s.city || "");
    if (interior.rooms[key]) return interior.rooms[key];
    let R;
    try { R = central ? buildCentral(s, key) : buildLocal(s, key, s.stationRef); }
    catch (e) { M.errors.push("build " + key + ": " + String(e && e.stack || e).slice(0, 300)); console.warn("[StationMall] build failed", e); return null; }
    R.tick = dt => tickRoom(R, dt);
    interior.rooms[key] = R; M.rooms++;
    return R;
  }
  M.roomFor = roomFor;

  // ---- walking with levels ----------------------------------------------------------------------------------------------------------------
  function resolve(R, lx, lz, cy, rad) {
    for (const r of R.ramps) {
      if (lx <= r.x0 || lx >= r.x1 || lz <= Math.min(r.z0, r.z1) || lz >= Math.max(r.z0, r.z1)) continue;
      const y = rampY(r, lz); if (Math.abs(y - cy) < 0.75) return { y: y, ramp: r };
    }
    for (let i = 0; i < R.lv.length; i++) {
      const L = R.lv[i]; if (Math.abs(L.y - cy) > 0.75) continue;
      if (L.holes.some(h => lx > h.x0 && lx < h.x1 && lz > h.z0 && lz < h.z1)) continue;
      if (L.cols.some(c => lx > c.x0 - rad && lx < c.x1 + rad && lz > c.z0 - rad && lz < c.z1 + rad)) continue;
      return { y: L.y, lv: i };
    }
    return null;
  }
  M.resolve = resolve;
  function multiStep(dx, dz, radius) {
    const R = interior.room, nx = player.pos.x + dx, nz = player.pos.z + dz, lx = nx - R.ox, lz = nz - R.oz, W = R.W, D = R.D;
    const cy = R.curY || 0, ground = cy < 0.5, inGap = ground && Math.abs(lx) < R.doorW / 2 - 0.2;
    if (lx < -W / 2 + radius + 0.15 || lx > W / 2 - radius - 0.15 || lz < -D / 2 + radius + 0.15) return false;
    if (lz > D / 2 - radius - (inGap ? -(interior.doorstep || 0.6) : 0.15)) return false;
    const r = resolve(R, lx, Math.min(lz, D / 2 - 0.2), cy, radius * 0.85);
    if (!r) return false;
    player.pos.x = nx; player.pos.z = nz; R.curY = r.y; R.onRamp = r.ramp || null; R.lvAt = r.lv === undefined ? R.lvAt : r.lv;
    return true;
  }
  function levelOk(R, y) { return y === undefined || Math.abs((R.curY || 0) - y) < 1.6; }

  // ---- the crowd: commuters and shoppers on every floor, riding the escalators -------------------------------------------------------------
  function crowdCount(R) {
    const t = tierName(); let n = R.central ? { ultra: 60, high: 44, medium: 30, low: 18 }[t] || 36 : { ultra: 16, high: 12, medium: 9, low: 6 }[t] || 10;
    if (window.GPU_GUARD && GPU_GUARD.on) n = Math.min(n, R.central ? 24 : 8);
    return n;
  }
  function free(R, lv, x, z, pad) {
    const L = R.lv[lv]; pad = pad || 0.5;
    if (Math.abs(x) > R.W / 2 - 1.0 || Math.abs(z) > R.D / 2 - 1.2) return false;
    if (L.holes.some(h => x > h.x0 - 0.4 && x < h.x1 + 0.4 && z > h.z0 - 0.4 && z < h.z1 + 0.4)) return false;
    if (L.cols.some(c => x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad)) return false;
    if (R.ramps.some(r => x > r.x0 - 0.6 && x < r.x1 + 0.6 && z > Math.min(r.z0, r.z1) - 0.3 && z < Math.max(r.z0, r.z1) + 0.3)) return false;
    if (R.gates && lv === R.lvGates && Math.abs(z - R.gates.z) < 1.0) return false;
    return true;
  }
  function clearLine(R, lv, x0, z0, x1, z1) {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5);
    for (let i = 1; i <= n; i++) { const t = i / n; if (!free(R, lv, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 0.35)) return false; }
    return true;
  }
  function randomSpot(R, lv) {
    for (let k = 0; k < 30; k++) { const x = (rnd() - 0.5) * (R.W - 3), z = (rnd() - 0.5) * (R.D - 3); if (free(R, lv, x, z)) return [x, z]; }
    return null;
  }
  function crowdInit(R) {
    if (R.crowdOn || typeof pplLib !== "object" || !pplLib.ready || !pplLib.ready.length || typeof pplFigure !== "function") return;
    R.crowdOn = true; R.walkers = [];
    R.lvGates = R.gates ? R.lv.findIndex(L => Math.abs(L.y - R.gates.y) < 0.1) : -1;
    const any = pplLib.ready, biz = any.filter(e => e.business);
    const n = crowdCount(R);
    // staff behind the counters
    R.staff.slice(0, R.central ? 10 : 3).forEach(p => {
      const fig = pplFigure(biz[Math.floor(rnd() * biz.length)] || any[0], 1.0);
      fig.holder.position.set(p.x, p.y, p.z); fig.holder.rotation.y = p.yaw; R.group.add(fig.holder); pedPlay(fig, "idle", 0);
      R.walkers.push({ f: fig, staff: true });
    });
    for (let i = 0; i < n; i++) {
      const lv = R.central ? (i % 3) : (i % 3 === 0 ? 1 : 0), p = randomSpot(R, lv); if (!p) continue;
      const fig = pplFigure(rnd() < 0.55 && biz.length ? biz[Math.floor(rnd() * biz.length)] : any[Math.floor(rnd() * any.length)], 0.95 + rnd() * 0.08);
      const w = { f: fig, lv: lv, x: p[0], z: p[1], y: R.lv[lv].y, path: [], wait: rnd() * 4, sp: 1.15 + rnd() * 0.35, ride: null };
      fig.holder.position.set(w.x, w.y, w.z); R.group.add(fig.holder); pedPlay(fig, "idle", 0);
      R.walkers.push(w);
    }
    M.people += R.walkers.length;
  }
  function plan(R, w) {
    // now and then: change floors on a flight that starts on this one
    if (R.ramps.length && rnd() < 0.42) {
      const lvY0 = R.lv[w.lv].y;
      const opts = R.ramps.filter(r => r.conv ? Math.abs((r.conv === Math.sign(r.z1 - r.z0) ? r.ya : r.yb) - lvY0) < 0.1 : (Math.abs(r.ya - lvY0) < 0.1 || Math.abs(r.yb - lvY0) < 0.1));
      if (opts.length) {
        const r = pick(opts), lvY = R.lv[w.lv].y;
        const fromZ0 = r.conv ? r.conv === Math.sign(r.z1 - r.z0) : Math.abs(r.ya - lvY) < 0.1;
        const zs = fromZ0 ? r.z0 : r.z1, ze = fromZ0 ? r.z1 : r.z0, out = Math.sign(zs - ze), ye = fromZ0 ? r.yb : r.ya;
        const ex = r.x + (rnd() - 0.5) * 0.3, entry = [ex, zs + out * 1.2];
        const lvE = R.lv.findIndex(L => Math.abs(L.y - ye) < 0.1);
        if (lvE >= 0 && free(R, w.lv, entry[0], entry[1], 0.2) && clearLine(R, w.lv, w.x, w.z, entry[0], entry[1])) {
          w.path = [{ x: entry[0], z: entry[1] }, { x: ex, z: zs, ramp: r }, { x: ex, z: ze, ramp: r, end: true, lv: lvE }, { x: ex, z: ze - out * 1.4 }];
          return;
        }
      }
    }
    // a seat, or somewhere on this floor in a straight line
    const seat = R.seats.find(s => s.lv === w.lv && !s.taken && rnd() < 0.2);
    if (seat && clearLine(R, w.lv, w.x, w.z, seat.x, seat.z + 0.5)) { seat.taken = w; w.path = [{ x: seat.x, z: seat.z + 0.5, seat: seat }]; return; }
    for (let k = 0; k < 14; k++) { const p = randomSpot(R, w.lv); if (p && clearLine(R, w.lv, w.x, w.z, p[0], p[1])) { w.path = [{ x: p[0], z: p[1] }]; return; } }
    w.wait = 1 + rnd() * 2;
  }
  function crowdTick(R, dt) {
    if (!R.crowdOn) { crowdInit(R); if (!R.crowdOn) return; }
    const px = player.pos.x - R.ox, pz = player.pos.z - R.oz, py = R.curY || 0;
    for (const w of R.walkers) {
      // far from you, on another floor, the animation runs at a lower rate
      const near = w.staff || (Math.abs((w.y || 0) - py) < 3 && Math.hypot((w.x || 0) - px, (w.z || 0) - pz) < 26);
      w.acc = (w.acc || 0) + dt; if (!near && w.acc < 0.1) continue;
      const step = w.acc; w.acc = 0;
      w.f.mixer.update(step);
      if (w.staff) continue;
      if (w.sitT > 0) { w.sitT -= step; if (w.sitT <= 0) { if (w.seat) w.seat.taken = null; w.seat = null; w.wait = 1; pedPlay(w.f, "idle", 0.4); } continue; }
      if (!w.path.length) { w.wait -= step; if (w.wait <= 0) { plan(R, w); if (w.path.length) pedPlay(w.f, "walk", 0.25, w.sp / (typeof WALK_SPEED === "number" ? WALK_SPEED : 1.4)); } continue; }
      const t = w.path[0];
      const riding = !!(w.ride && w.ride.conv), sp = riding ? 0.6 : w.ride ? 0.8 : w.sp;
      const dx = t.x - w.x, dz = t.z - w.z, d = Math.hypot(dx, dz), mv = Math.min(d, sp * step);
      if (d > 1e-3) { w.x += dx / d * mv; w.z += dz / d * mv; if (!riding) { const yaw = Math.atan2(dx, dz); w.f.holder.rotation.y = yaw; } }
      w.y = w.ride ? rampY(w.ride, w.z) : R.lv[w.lv].y;
      w.f.holder.position.set(w.x, w.y, w.z);
      if (d - mv < 0.05) {
        w.path.shift();
        if (t.ramp && !t.end) { w.ride = t.ramp; if (t.ramp.conv) pedPlay(w.f, "idle", 0.3); w.f.holder.rotation.y = Math.atan2(0, (w.path[0] ? w.path[0].z : w.z) - w.z); }
        else if (t.end) { w.ride = null; pedPlay(w.f, "walk", 0.25, w.sp / 1.4); }
        if (t.lv !== undefined) w.lv = t.lv;
        if (t.seat) { w.seat = t.seat; w.x = t.seat.x; w.z = t.seat.z; w.f.holder.position.set(w.x, R.lv[w.lv].y, w.z); w.f.holder.rotation.y = t.seat.yaw; w.sitT = 12 + rnd() * 30; pedPlay(w.f, "sit", 0.4); continue; }
        if (!w.path.length) { w.wait = 1.5 + rnd() * 6; pedPlay(w.f, "idle", 0.3); }
      }
    }
  }

  // ---- each frame inside ------------------------------------------------------------------------------------------------------------------
  function tickRoom(R, dt) {
    dt = Math.min(0.1, dt || 0);
    if (R.boards.length) R.boards.forEach(f => { try { f(); } catch (e) { /* */ } });
    try { crowdTick(R, dt); } catch (e) { if (!M.crowdErr) { M.crowdErr = String(e); console.warn("[StationMall] crowd", e); } }
    // the escalator you are standing on carries you
    if (interior.active && interior.room === R && R.onRamp && R.onRamp.conv && !interior.card && !interior.modal) {
      const step = R.onRamp.conv * 0.62 * dt;
      try { if (!window.interiorTryStep(0, step, 0.3)) R.onRamp = null; } catch (e) { R.onRamp = null; }
    }
    // the reflection probe, once the room has been seen
    if (R.group.visible && !R.probe && (R.probeWait = (R.probeWait || 0) + 1) > 3) probe(R);
  }
  let pmrem = null;
  function probe(R) {
    if (typeof renderer === "undefined" || !renderer) return;
    try {
      const size = lean() ? 128 : 256;
      const rt = new THREE.WebGLCubeRenderTarget(size, { format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, encoding: THREE.sRGBEncoding });
      const cam = new THREE.CubeCamera(0.2, 200, rt); const g = R.group;
      cam.position.set(g.position.x, g.position.y + (R.central ? 7.5 : 2.4), g.position.z + 2); scene.add(cam); cam.updateMatrixWorld(true);
      const pv = player && player.obj ? player.obj.visible : null; if (pv !== null) player.obj.visible = false;
      try { cam.update(renderer, scene); } finally { if (pv !== null) player.obj.visible = pv; scene.remove(cam); }
      if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
      R.probe = pmrem.fromCubemap(rt.texture).texture; rt.dispose();
      Object.keys(mats).forEach(k => { if (k === "glass") return; mats[k].envMap = R.probe; mats[k].needsUpdate = true; });
    } catch (e) { R.probe = true; }
  }

  // ---- hooking into the game --------------------------------------------------------------------------------------------------------------
  function wrap(name, f) {
    const o = window[name]; if (typeof o !== "function") { M.errors.push("no " + name); return; }
    const w = f(o); window[name] = function () { return M.dead ? o.apply(this, arguments) : w.apply(this, arguments); }; window[name].__stationMall = o;
  }
  M.dispose = () => {
    M.dead = true;
    Object.keys(interior.rooms || {}).forEach(k => { if (/^mall:/.test(k)) { const R = interior.rooms[k]; if (R.group && R.group.parent) R.group.parent.remove(R.group); delete interior.rooms[k]; } });
    (M.platforms && M.platforms.groups || []).forEach(q => { if (q.g.parent) q.g.parent.remove(q.g); });
    if (RIDE.glass && RIDE.glass.parent) RIDE.glass.parent.remove(RIDE.glass);
    const T = window.seamless && seamless.title; if (T && T.room && T.room.multi) { T.room = null; T.on = false; }
  };
  M.legacyLevel = window.interiorStationLevel;
  wrap("interiorLevels", orig => function (s) {
    if (s && s.station) { const R0 = roomFor(s); if (R0) return { kind: "station", floors: [{ id: 1, label: "", name: s.name || "Station" }], street: 1, make: () => roomFor(s) }; }
    return orig.apply(this, arguments);
  });
  wrap("interiorStationLevel", orig => function (s, idx) { return roomFor(s) || orig.apply(this, arguments); });
  wrap("interiorTryStep", orig => function (dx, dz, radius) { const R = interior.room; return R && R.multi ? multiStep(dx, dz, radius) : orig.apply(this, arguments); });
  wrap("interiorSpotFocus", orig => function () {
    const R = interior.room; if (!R || !R.multi) return orig.apply(this, arguments);
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw); let best = null, bd = 1.9;
    for (const sp of R.spots) { if (!levelOk(R, sp.y)) continue; const dx = R.ox + sp.x - player.pos.x, dz = R.oz + sp.z - player.pos.z, d = Math.hypot(dx, dz); if (d > bd) continue; if ((dx * fx + dz * fz) / Math.max(0.01, d) < 0.2) continue; bd = d; best = sp; }
    return best;
  });
  wrap("interiorDoorTick", orig => function (room, dt) {
    if (!room || !room.multi) return orig.apply(this, arguments);
    if (interior.room !== room || !interior.active) return;
    for (const d of room.doors || []) shopDoorAnimate(d, levelOk(room, d.y || 0) && Math.hypot(player.pos.x - room.ox - d.x, player.pos.z - room.oz - d.z) < 3.2, dt);
  });
  wrap("interiorShowRoom", orig => function (room, at, face) {
    const r = orig.apply(this, arguments);
    if (room && room.multi) { if (at && at.y !== undefined) room.curY = at.y; player.pos.y = interior.floorY + (room.curY || 0); player.obj.position.copy(player.pos); camPos.y = player.pos.y + 2.3; camera.position.copy(camPos); }
    return r;
  });
  wrap("interiorEnter", orig => function (s) {
    const r = orig.apply(this, arguments);
    if (r && interior.room && interior.room.multi) { interior.room.curY = 0; interior.room.onRamp = null; }
    return r;
  });
  wrap("interiorClampCam", orig => function (p) {
    const R = interior.room; if (!R || !R.multi) return orig.apply(this, arguments);
    const base = interior.floorY + (R.curY || 0);
    p.x = clampN(p.x, R.ox - R.W / 2 + 0.3, R.ox + R.W / 2 - 0.3); p.z = clampN(p.z, R.oz - R.D / 2 + 0.3, R.oz + R.D / 2 - 0.3);
    p.y = clampN(p.y, base + 0.5, base + R.clear);
  });
  // the vending machines on the platforms sell what they show
  wrap("shopNear", orig => function (x, z, radius, noVend) {
    if (!noVend && P.list.length && player && player.pos && !interior.active) {
      const y = player.pos.y; let best = null, bd = 1.7;
      for (const v of P.near) { const d = Math.hypot(v.door[0] - x, v.door[1] - z); if (d < bd && Math.abs(v.groundY - y) < 1.5) { bd = d; best = v; } }
      if (best) return best;
    }
    return orig.apply(this, arguments);
  });
  let shelvesWas = null;
  wrap("enterShop", orig => function (s) {
    if (s && s.vend && s.vstock && typeof STORE_SHELVES === "object") { shelvesWas = STORE_SHELVES.vending; STORE_SHELVES.vending = s.vstock; }
    return orig.apply(this, arguments);
  });
  wrap("leaveShop", orig => function () {
    const r = orig.apply(this, arguments);
    if (shelvesWas && typeof STORE_SHELVES === "object") { STORE_SHELVES.vending = shelvesWas; shelvesWas = null; }
    return r;
  });

  // ---- vending machines on every platform -------------------------------------------------------------------------------------------------
  // In the Foundry kit's plain bays (the ones without its own seats or machines), a bank of three machines of different kinds and a bin,
  // backed against the outer edge of each platform. One small batch per station, shown within 700 m.
  const P = M.platforms = { list: [], near: [], groups: [], built: false, at: 0 };
  function buildPlatforms() {
    if (P.built || typeof world !== "object" || !world || !world.cities || typeof scene === "undefined" || !scene) return false;
    const all = []; world.cities.forEach(c => (c.stations || []).forEach(st => { if (st.frame && st.conc && st.conc.PL) all.push(st); }));
    if (!all.length) return false;
    P.built = true;
    let typeAt = 0;
    all.forEach((st, si) => {
      const t = st.frame, C = st.conc, PL = C.PL, deck = C.deckY || t.y + 1.15, B = new Batch(), g = new THREE.Group();
      g.name = "Platform vending · " + st.name; g.userData.stationMall = true;
      const gaps = st.roadGaps || [], n = Math.max(1, Math.ceil(PL / 12 - 0.15)), stretch = PL / (n * 12);
      const terminus = !!st.terminus, perSide = terminus ? 3 : 2, plain = [];
      for (let i = 0; i < n; i++) {
        const z = (i - (n - 1) / 2) * 12 * stretch;
        if (i % 3 === 1 || i % 4 === 2) continue;                                   // the kit's own seats and machines are there
        if (gaps.some(gp => z + 7 > gp[0] && z - 7 < gp[1])) continue;
        if (Math.abs(z - C.face) < 16) continue;                                    // the end where you come out of the concourse
        if (Math.abs(Math.abs(z) - PL / 2) < 7) continue;
        plain.push(z);
      }
      const chosen = []; const stepI = Math.max(1, Math.floor(plain.length / perSide));
      for (let i = 0; i < plain.length && chosen.length < perSide; i += stepI) chosen.push(plain[i]);
      B.push(t.x, deck, t.z, t.yaw);
      const wc = Math.cos(t.yaw), ws = Math.sin(t.yaw), toW = (lx, lz) => [t.x + lx * wc + lz * ws, t.z - lx * ws + lz * wc];
      [-1, 1].forEach(side => chosen.forEach((z, ci) => {
        const lx = side * (6.7 + 3.5), ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        const kinds = [VEND_ORDER[(typeAt) % VEND_ORDER.length], VEND_ORDER[(typeAt + 1) % VEND_ORDER.length], VEND_ORDER[(typeAt + 2) % VEND_ORDER.length]];
        typeAt += 3;
        kinds.forEach((k, j) => {
          const lz = z + (j - 1) * 1.08;
          vendMachine(B, k, lx, 0, lz, ry);
          const w = toW(lx, lz), f = toW(lx - side * 1.0, lz), yaw = t.yaw + ry;
          P.list.push({ brand: "vending", vend: true, platform: true, kind: k, name: VEND[k].name.charAt(0) + VEND[k].name.slice(1).toLowerCase() + " machine", at: w, door: f, yaw: yaw, groundY: deck, size: [1, 1], vstock: vendStock(k), st: st });
        });
        bin3(B, lx, 0, z + 2.4, ry);
        P.list.push({ solidOnly: true, at: toW(lx, z + 2.4), r: 0.8, groundY: deck });
      }));
      B.pop();
      B.build(g, "platform vending");
      g.traverse(o => { if (o.isMesh) { o.frustumCulled = true; o.castShadow = false; } });
      scene.add(g);
      P.groups.push({ g: g, x: t.x, z: t.z });
    });
    M.vending = P.list.filter(v => v.vend).length;
    return true;
  }
  function platformsTick() {
    const now = performance.now();
    if (!P.built) { if (now - P.at > 2000) { P.at = now; try { buildPlatforms(); } catch (e) { P.built = true; M.errors.push("platforms: " + String(e).slice(0, 200)); } } return; }
    if (now - P.at < 900 || !player || !player.pos) return;
    P.at = now;
    const x = player.pos.x, z = player.pos.z;
    P.groups.forEach(q => { q.g.visible = Math.hypot(q.x - x, q.z - z) < 700; });
    P.near = P.list.filter(v => Math.abs(v.at[0] - x) < 260 && Math.abs(v.at[1] - z) < 260);
  }
  // you cannot walk through them
  wrap("tryStep", orig => function (dx, dz, radius) {
    if (!interior.active && P.near.length && player && player.pos) {
      const nx = player.pos.x + dx, nz = player.pos.z + dz, y = player.pos.y;
      for (const v of P.near) { if (Math.abs(v.groundY - y) > 1.6) continue; const d = Math.hypot(v.at[0] - nx, v.at[1] - nz); if (d < (v.r || 0.55) + radius && d < Math.hypot(v.at[0] - player.pos.x, v.at[1] - player.pos.z)) return false; }
    }
    return orig.apply(this, arguments);
  });

  // ---- the carriage window -----------------------------------------------------------------------------------------------------------------
  // The view out of the train is the world itself; what made it look like a camera on a stick was the glass (none) and the ride (none).
  // Now: a pane with a faint reflection of the carriage, fine grime at the edges and rain beads when it rains, and the camera rides the
  // bogies: a slow sway, a small bounce over the rail joints, and a lean into curves.
  const RIDE = { glass: null, t: 0, yaw: null, lean: 0 };
  function grimeTex() {
    const c = document.createElement("canvas"); c.width = 512; c.height = 256; const g = c.getContext("2d");
    g.clearRect(0, 0, 512, 256);
    const edge = g.createRadialGradient(256, 128, 60, 256, 128, 300); edge.addColorStop(0, "rgba(120,120,110,0)"); edge.addColorStop(0.7, "rgba(120,118,108,0.12)"); edge.addColorStop(1, "rgba(90,86,78,0.42)"); g.fillStyle = edge; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 70; i++) { g.strokeStyle = "rgba(255,255,255," + (0.02 + rnd() * 0.05) + ")"; g.lineWidth = 1 + rnd() * 2; const x = rnd() * 512; g.beginPath(); g.moveTo(x, rnd() * 60); g.bezierCurveTo(x + rnd() * 20 - 10, 90, x + rnd() * 30 - 15, 160, x + rnd() * 20 - 10, 256); g.stroke(); }
    for (let i = 0; i < 260; i++) { g.fillStyle = "rgba(255,255,255," + (0.04 + rnd() * 0.1) + ")"; g.beginPath(); g.arc(rnd() * 512, rnd() * 256, 0.6 + rnd() * 1.6, 0, TAU); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function rainTex() {
    const c = document.createElement("canvas"); c.width = 512; c.height = 256; const g = c.getContext("2d");
    for (let i = 0; i < 420; i++) { const x = rnd() * 512, y = rnd() * 256, r = 0.8 + rnd() * 2.6; const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r); gr.addColorStop(0, "rgba(255,255,255,0.75)"); gr.addColorStop(1, "rgba(200,210,220,0.15)"); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * 1.6, r, 0, 0, TAU); g.fill(); }
    for (let i = 0; i < 40; i++) { g.strokeStyle = "rgba(220,230,240,0.35)"; g.lineWidth = 1.2; const y = rnd() * 256; g.beginPath(); g.moveTo(rnd() * 512, y); g.lineTo(rnd() * 512, y + rnd() * 8 - 4); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function windowGlass() {
    if (RIDE.glass) return RIDE.glass;
    const grime = grimeTex(), rain = rainTex();
    const m = new THREE.MeshStandardMaterial({ color: 0xdfe8ea, map: grime, normalMap: tex("art/pbr/plastic_nor.jpg", false, 0.5), roughnessMap: tex("art/pbr/plastic_rough.jpg", false, 0.5), transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.3, envMapIntensity: 0.6, depthWrite: false });
    const mr = new THREE.MeshStandardMaterial({ color: 0xffffff, map: rain, normalMap: tex("art/pbr/plastic_nor.jpg", false, 0.5), transparent: true, opacity: 0.0, roughness: 0.1, depthWrite: false });
    [m, mr].forEach(x => { x.userData.shDry = true; x.userData.pbrDone = true; });
    const g = new THREE.Group(); g.name = "Carriage window glass";
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.95), m), beads = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.95), mr);
    pane.renderOrder = 5; beads.renderOrder = 6; beads.position.z = 0.005;
    g.add(pane, beads); g.userData = { pane: pane, beads: beads, rainMat: mr };
    g.traverse(o => { o.frustumCulled = false; });
    scene.add(g); RIDE.glass = g; return g;
  }
  wrap("updateRide", orig => function (dt) {
    const r = orig.apply(this, arguments);
    try {
      const t = drive.train; if (!t) return r;
      const set = rail.sets[t.set], line = rail.lines[set.line], kind = TRAIN_KINDS[set.kind];
      const p = sampleLane(line, set.s - t.car * (kind.L + kind.gap)), v = Math.abs(set.v || 0), k = clampN(v / 20, 0, 1);
      RIDE.t += dt * (0.6 + k);
      // the lean into a curve, from how fast the heading turns
      if (RIDE.yaw === null) RIDE.yaw = p.yaw;
      let dy = p.yaw - RIDE.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); RIDE.yaw = p.yaw;
      const yr = dt > 0 ? dy / dt : 0; RIDE.lean += (clampN(-yr * v * 0.012, -0.05, 0.05) - RIDE.lean) * Math.min(1, dt * 1.5);
      const sway = Math.sin(RIDE.t * 1.3) * 0.018 * k + Math.sin(RIDE.t * 2.9 + 1) * 0.007 * k;
      const joint = (RIDE.t * 3.1) % 1, bump = joint < 0.08 ? Math.sin(joint / 0.08 * Math.PI) * 0.01 * k : 0;
      const ax = Math.cos(p.yaw), az = -Math.sin(p.yaw);
      camera.position.x += ax * sway; camera.position.z += az * sway; camera.position.y += bump + Math.sin(RIDE.t * 0.8) * 0.004 * k;
      camera.rotateZ(RIDE.lean + Math.sin(RIDE.t * 1.3) * 0.004 * k);
      // the pane, in the carriage side beside the seat
      const G = windowGlass(); G.visible = true;
      const wx = -Math.cos(p.yaw) * 1.36, wz = Math.sin(p.yaw) * 1.36;
      G.position.set(p.x + wx, p.y + 2.38, p.z + wz); G.rotation.set(0, p.yaw + Math.PI / 2, 0);
      if (scene.environment && G.userData.pane.material.envMap !== scene.environment) { G.userData.pane.material.envMap = scene.environment; G.userData.pane.material.needsUpdate = true; }
      const rain = (window.shigoto && shigoto.engine && shigoto.engine.weather && shigoto.engine.weather.cur && shigoto.engine.weather.cur.rain) || 0;
      G.userData.rainMat.opacity = clampN(rain * 1.2, 0, 0.85);
      if (rain > 0.02) { const tx = G.userData.rainMat.map; tx.offset.x = (tx.offset.x + dt * 0.05 * (0.2 + k)) % 1; }
    } catch (e) { if (!M.rideErr) { M.rideErr = String(e); } }
    return r;
  });
  wrap("leaveTrain", orig => function () { if (RIDE.glass) RIDE.glass.visible = false; RIDE.yaw = null; return orig.apply(this, arguments); });

  // ---- each frame ------------------------------------------------------------------------------------------------------------------------
  function loop() {
    if (M.dead) return;
    requestAnimationFrame(loop);
    try { platformsTick(); } catch (e) { /* */ }
    // the title shows the concourse without an active interior: keep its people and boards going
    try { const T = window.seamless && seamless.title; if (T && T.on && T.room && T.room.multi && !interior.active) { /* ticked by seamless via R.tick */ } } catch (e) { /* */ }
  }
  requestAnimationFrame(loop);

  M.report = () => ({ version: M.version, rooms: M.rooms, keys: Object.keys(interior.rooms || {}).filter(k => /^mall:/.test(k)), vending: M.vending, people: M.people, here: interior.room && interior.room.multi ? { key: interior.room.key, y: interior.room.curY, ramp: interior.room.onRamp && interior.room.onRamp.kind } : null, errors: M.errors.slice(0, 8) });
  console.log("[StationMall] " + M.version + " ready: three-floor Tōkonto Central, stations walked up to the platforms, platform vending");
})();
