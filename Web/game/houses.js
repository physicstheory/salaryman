// =====================================================================================================================
// KONTO_HOUSES: the house designer.
//
// Every house in the game is designed on its own. Before a single wall goes up it is given a household: who lives
// there, what they do, when they leave in the morning and come home, whether the front room is a barber's or a
// tobacconist's or a piano teacher's, whether the place has stood empty since the old man died. The house is then
// built to fit that life: the footprint and storeys, the roof, the cladding, how many air-conditioners hang off it,
// the bicycles by the door (with a child seat or without), the laundry on the balcony, the bonsai on the shelf, the
// kei truck in the drive, the sign over the shop.
//
// The detail is small on purpose. A Japanese street reads as real because of things a few centimetres across:
// the aluminium mullions of a sliding sash, the shutter box over it, the gutter hangers, the gas meter and its yellow
// pipe, the Yagi antenna's elements, the joints of a block wall, every roll of a kawara roof. Those are all here as
// geometry, so they catch the sun and throw their own shade.
//
// Cost: all of a house is ONE material (Web/art/houses/atlas*.jpg, a 4x4 PBR atlas: base colour, normal, roughness),
// so a house is one draw call for its shell, one for its close-up clutter (a THREE.LOD drops it past ~70 m) and one
// for its signs if it has any. The game builds a house through the same close-up detail system as every other
// building (konto.html detailMake -> buildingDetail), so the persistence engine keeps it, the performance engine
// budgets the building of it, and the story's places are prebuilt behind the loading screen.
//
// For the realism engine (routines): KONTO_HOUSES.homes() lists every house with its door, purpose, opening hours and
// household (each member with a role, age, job and the times they leave and come back). Residents and routine hooks
// read from there.
//
// Off switch: ?houses=0 or localStorage konto.houses = "0" (the boxes and the old window detail come back).
// =====================================================================================================================
(function () {
  "use strict";

  const H = window.KONTO_HOUSES = {
    on: true, version: "1.0.0", built: 0, tris: 0, list: [], byPurpose: {},
    lit: { value: 0.0 },                    // share of windows lit right now (the households' evenings), set by tick()
    clutterRange: 75                        // metres: past this the close-up clutter (bikes, meters, pots...) is dropped
  };
  try { if (/[?&]houses=0\b/.test(location.search) || localStorage.getItem("konto.houses") === "0") H.on = false; } catch (e) { /* storage blocked */ }

  // ---- deterministic randomness ---------------------------------------------------------------------------------------
  function mulberry(seed) {
    let a = (seed >>> 0) || 1;
    return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hashi(a, b, c) { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function pickW(r, list) { let tot = 0; for (const x of list) tot += x[1]; let k = r() * tot; for (const x of list) { k -= x[1]; if (k <= 0) return x[0]; } return list[list.length - 1][0]; }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
  // tints are authored in sRGB and stored linear, like the engine's Batcher
  const lin = c => [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)];
  const hex = h => lin([(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]);
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

  // ---- the atlas -------------------------------------------------------------------------------------------------------
  // Cell order is the contract with Tools/houses/make_house_atlas.py. TILE_M is how many metres one repeat covers.
  const T = { plaster: 0, siding: 1, brick: 2, concrete: 3, timber: 4, kawara: 5, slate: 6, seam: 7, metal: 8, glass: 9, cloth: 10, leaf: 11, bark: 12, plastic: 13, paper: 14, gravel: 15 };
  const TILE_M = [2.0, 1.82, 1.4, 2.4, 2.4, 1.2, 0.9, 1.0, 0.6, 3.0, 0.25, 0.9, 1.2, 0.5, 0.6, 1.6];
  const ROT = 16;                           // tile flag: swap the projected u and v (kawara rolls and seams that run along x)

  // =====================================================================================================================
  // GEOMETRY: a small builder that writes boxes, cylinders, rods, blobs and quads into flat arrays, every vertex
  // carrying a linear tint, an atlas cell and a window-light key. A frame stack lets a part be built in its own axes.
  // =====================================================================================================================
  function GB() { this.p = []; this.n = []; this.c = []; this.t = []; this.ix = []; this.F = [{ x: 0, y: 0, z: 0, c: 1, s: 0 }]; this.col = [1, 1, 1]; this.tile = 0; this.key = 0; }
  GB.prototype.mat = function (col, tile, key) { this.col = col; this.tile = tile; this.key = key || 0; return this; };
  GB.prototype.push = function (x, y, z, yaw) {
    const f = this.F[this.F.length - 1], ca = Math.cos(yaw || 0), sa = Math.sin(yaw || 0);
    this.F.push({ x: f.x + x * f.c + z * f.s, y: f.y + y, z: f.z - x * f.s + z * f.c, c: f.c * ca - f.s * sa, s: f.s * ca + f.c * sa });
    return this;
  };
  GB.prototype.pop = function () { if (this.F.length > 1) this.F.pop(); return this; };
  // a vertex in the current frame (rotation about y: x' = x cos + z sin, z' = -x sin + z cos, the same as three.js)
  GB.prototype.v = function (x, y, z, nx, ny, nz) {
    const f = this.F[this.F.length - 1];
    this.p.push(f.x + x * f.c + z * f.s, f.y + y, f.z - x * f.s + z * f.c);
    this.n.push(nx * f.c + nz * f.s, ny, -nx * f.s + nz * f.c);
    this.c.push(this.col[0], this.col[1], this.col[2]);
    this.t.push(this.tile, this.key);
    return this.p.length / 3 - 1;
  };
  // a quad a-b-c-d, counter-clockwise seen from the side it faces
  GB.prototype.quad = function (a, b, c, d) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const i = this.v(a[0], a[1], a[2], nx, ny, nz); this.v(b[0], b[1], b[2], nx, ny, nz); this.v(c[0], c[1], c[2], nx, ny, nz); this.v(d[0], d[1], d[2], nx, ny, nz);
    this.ix.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return this;
  };
  GB.prototype.tri = function (a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const i = this.v(a[0], a[1], a[2], nx, ny, nz); this.v(b[0], b[1], b[2], nx, ny, nz); this.v(c[0], c[1], c[2], nx, ny, nz);
    this.ix.push(i, i + 1, i + 2);
    return this;
  };
  // an axis-aligned box about (x, y, z); m masks the faces: 1 +x, 2 -x, 4 top, 8 bottom, 16 +z, 32 -z (default: all but the bottom)
  GB.prototype.box = function (x, y, z, sx, sy, sz, m) {
    if (m === undefined) m = 55;
    const X0 = x - sx / 2, X1 = x + sx / 2, Y0 = y - sy / 2, Y1 = y + sy / 2, Z0 = z - sz / 2, Z1 = z + sz / 2;
    if (m & 1) this.quad([X1, Y0, Z1], [X1, Y0, Z0], [X1, Y1, Z0], [X1, Y1, Z1]);
    if (m & 2) this.quad([X0, Y0, Z0], [X0, Y0, Z1], [X0, Y1, Z1], [X0, Y1, Z0]);
    if (m & 4) this.quad([X0, Y1, Z1], [X1, Y1, Z1], [X1, Y1, Z0], [X0, Y1, Z0]);
    if (m & 8) this.quad([X0, Y0, Z0], [X1, Y0, Z0], [X1, Y0, Z1], [X0, Y0, Z1]);
    if (m & 16) this.quad([X0, Y0, Z1], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z1]);
    if (m & 32) this.quad([X1, Y0, Z0], [X0, Y0, Z0], [X0, Y1, Z0], [X1, Y1, Z0]);
    return this;
  };
  // box resting on y (its foot at y)
  GB.prototype.stand = function (x, y, z, sx, sy, sz, m) { return this.box(x, y + sy / 2, z, sx, sy, sz, m); };
  // a cylinder along an axis ("y": from y up h; "x"/"z": centred on (x, y, z), h long); r2 tapers the far end; caps: 1 near, 2 far
  GB.prototype.cyl = function (x, y, z, r, h, seg, axis, r2, caps) {
    seg = seg || 8; axis = axis || "y"; if (r2 === undefined) r2 = r; if (caps === undefined) caps = 2;
    const P = (a, rr, s) => {             // a point on the ring at end s (0 near, 1 far)
      const ca = Math.cos(a) * rr, sa = Math.sin(a) * rr;
      if (axis === "y") return [x + ca, y + h * s, z + sa];
      if (axis === "x") return [x - h / 2 + h * s, y + sa, z + ca];
      return [x + ca, y + sa, z - h / 2 + h * s];
    };
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const q = [P(a0, r, 0), P(a1, r, 0), P(a1, r2, 1), P(a0, r2, 1)];
      if (axis === "y") this.quad(q[1], q[0], q[3], q[2]); else this.quad(q[0], q[1], q[2], q[3]);
      if (caps & 2) { const c = P(0, 0, 1); if (axis === "y") this.tri(c, P(a1, r2, 1), P(a0, r2, 1)); else this.tri(c, P(a0, r2, 1), P(a1, r2, 1)); }
      if (caps & 1) { const c = P(0, 0, 0); if (axis === "y") this.tri(c, P(a0, r, 0), P(a1, r, 0)); else this.tri(c, P(a1, r, 0), P(a0, r, 0)); }
    }
    return this;
  };
  // a round bar from a to b (pipes, rails, spokes, antenna elements, wires)
  GB.prototype.rod = function (a, b, r, seg) {
    seg = seg || 5;
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz); if (L < 1e-4) return this;
    const w = [dx / L, dy / L, dz / L];
    const up = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [up[1] * w[2] - up[2] * w[1], up[2] * w[0] - up[0] * w[2], up[0] * w[1] - up[1] * w[0]]; const ul = Math.hypot(u[0], u[1], u[2]); u = u.map(k => k / ul);
    const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const o0 = [u[0] * Math.cos(a0) * r + v[0] * Math.sin(a0) * r, u[1] * Math.cos(a0) * r + v[1] * Math.sin(a0) * r, u[2] * Math.cos(a0) * r + v[2] * Math.sin(a0) * r];
      const o1 = [u[0] * Math.cos(a1) * r + v[0] * Math.sin(a1) * r, u[1] * Math.cos(a1) * r + v[1] * Math.sin(a1) * r, u[2] * Math.cos(a1) * r + v[2] * Math.sin(a1) * r];
      this.quad([a[0] + o0[0], a[1] + o0[1], a[2] + o0[2]], [a[0] + o1[0], a[1] + o1[1], a[2] + o1[2]], [b[0] + o1[0], b[1] + o1[1], b[2] + o1[2]], [b[0] + o0[0], b[1] + o0[1], b[2] + o0[2]]);
    }
    return this;
  };
  // a polyline of rods (bent pipes, frames)
  GB.prototype.path = function (pts, r, seg) { for (let i = 1; i < pts.length; i++) this.rod(pts[i - 1], pts[i], r, seg); return this; };
  // a ring of rods round the y axis or the x/z axes (wheels, tyres, rims)
  GB.prototype.ring = function (x, y, z, R, r, seg, axis) {
    const pts = [];
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, c = Math.cos(a) * R, s = Math.sin(a) * R; pts.push(axis === "x" ? [x, y + s, z + c] : axis === "z" ? [x + c, y + s, z] : [x + c, y, z + s]); }
    return this.path(pts, r, 4);
  };
  // a lumpy blob (shrubs, clipped azalea, tree crowns, a cedar ball): an octahedron subdivided twice, pushed about by noise
  const BLOB = (() => {
    let V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], F = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
    for (let k = 0; k < 2; k++) {
      const mid = new Map(), NF = [];
      const m = (a, b) => { const key = a < b ? a + "_" + b : b + "_" + a; if (mid.has(key)) return mid.get(key); const p = [(V[a][0] + V[b][0]) / 2, (V[a][1] + V[b][1]) / 2, (V[a][2] + V[b][2]) / 2], l = Math.hypot(p[0], p[1], p[2]); V.push(p.map(q => q / l)); mid.set(key, V.length - 1); return V.length - 1; };
      F.forEach(f => { const a = m(f[0], f[1]), b = m(f[1], f[2]), c = m(f[2], f[0]); NF.push([f[0], a, c], [a, f[1], b], [c, b, f[2]], [a, b, c]); });
      F = NF;
    }
    return { V: V, F: F };
  })();
  GB.prototype.blob = function (x, y, z, rx, ry, rz, seed, rough) {
    const r = mulberry(seed || 1), k = rough === undefined ? 0.22 : rough, off = BLOB.V.map(() => 1 + (r() - 0.5) * k);
    const P = BLOB.V.map((v, i) => [x + v[0] * rx * off[i], y + v[1] * ry * off[i], z + v[2] * rz * off[i]]);
    BLOB.F.forEach(f => {
      const i = this.p.length / 3;
      f.forEach(j => { const v = BLOB.V[j]; this.v(P[j][0], P[j][1], P[j][2], v[0], v[1], v[2]); });
      this.ix.push(i, i + 1, i + 2);
    });
    return this;
  };
  GB.prototype.tris = function () { return this.ix.length / 3; };
  // A builder that keeps nothing. The shell and the close-up clutter are built in separate passes (the clutter only when
  // you come near), and each pass runs the same code with the other half writing here, so the random choices line up.
  function NullGB() { this.F = [{ x: 0, y: 0, z: 0, c: 1, s: 0 }]; this.nul = true; this.ix = []; }
  ["mat", "push", "pop", "v", "quad", "tri", "box", "stand", "cyl", "rod", "path", "ring", "blob"].forEach(k => { NullGB.prototype[k] = function () { return this; }; });
  NullGB.prototype.tris = function () { return 0; };

  // ---- to a mesh -------------------------------------------------------------------------------------------------------
  function toGeometry(B) {
    if (!B.ix.length) return null;
    const g = new THREE.BufferGeometry(), nv = B.p.length / 3;
    const nn = new Int8Array(B.n.length), cc = new Uint8Array(B.c.length), tt = new Uint8Array(B.t);
    for (let i = 0; i < nn.length; i++) nn[i] = Math.round(clamp(B.n[i], -1, 1) * 127);
    for (let i = 0; i < cc.length; i++) cc[i] = Math.round(clamp(B.c[i], 0, 1) * 255);
    g.setAttribute("position", new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nn, 3, true));
    g.setAttribute("color", new THREE.BufferAttribute(cc, 3, true));
    g.setAttribute("aTile", new THREE.BufferAttribute(tt, 2, false));
    g.setIndex(nv > 65000 ? new THREE.Uint32BufferAttribute(B.ix, 1) : new THREE.Uint16BufferAttribute(B.ix, 1));
    g.computeBoundingSphere();
    return g;
  }

  // =====================================================================================================================
  // MATERIAL: one PBR material over the atlas. The vertex shader projects UVs from the house's own axes (so tiles and
  // siding line up with the walls and roof rolls run down the slope), scaled per cell to real-world size; the fragment
  // shader wraps inside the cell with explicit gradients so mip levels are chosen from the real tiling, not the jump
  // at a cell edge. Window panes carry a light key: at night a share of them, chosen by the households' hours, glow.
  // =====================================================================================================================
  const MATS = {};
  let ATLAS = null;
  function atlas() {
    if (ATLAS) return ATLAS;
    const L = new THREE.TextureLoader(), base = H.base || "art/houses/";
    const t = n => { const x = L.load(base + n); x.wrapS = x.wrapT = THREE.ClampToEdgeWrapping; x.anisotropy = 4; if (typeof window.sharpTex === "function") try { window.sharpTex(x); } catch (e) { /* older build */ } return x; };
    ATLAS = { color: t("atlas.jpg"), normal: t("atlas_nor.jpg"), rough: t("atlas_rough.jpg") };
    ATLAS.color.encoding = THREE.sRGBEncoding;
    return ATLAS;
  }
  const SCALES = TILE_M.map(m => 1 / m);
  function patch(m) {
    m.onBeforeCompile = sh => {
      sh.uniforms.uHScale = { value: SCALES };
      sh.uniforms.uHLit = H.lit;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aTile;\nuniform float uHScale[16];\nvarying vec2 vHCell;\nvarying float vHLit;\nvarying float vHMetal;")
        .replace("#include <uv_vertex>", `#include <uv_vertex>
{
  float hc = mod(aTile.x, 16.0);
  vec3 hn = abs(normal);
  vec2 hp = hn.y > 0.62 ? vec2(position.x, -position.z) : (hn.x > hn.z ? vec2(-position.z * sign(normal.x), position.y) : vec2(position.x * sign(normal.z), position.y));
  if (aTile.x >= 16.0) hp = hp.yx;
  vUv = hp * uHScale[int(hc)];
  vHCell = vec2(mod(hc, 4.0), floor(hc / 4.0));
  vHLit = aTile.y;
  vHMetal = (hc > 6.5 && hc < 8.5) ? 1.0 : 0.0;
}`);
      const HTEX = `
varying vec2 vHCell;
varying float vHLit;
varying float vHMetal;
uniform float uHLit;
vec4 hTex(sampler2D t, vec2 uv) {
  vec2 a = (vHCell + 0.03 + fract(uv) * 0.94) * 0.25;
#if __VERSION__ >= 300
  return textureGrad(t, a, dFdx(uv) * 0.235, dFdy(uv) * 0.235);
#else
  return texture2D(t, a);
#endif
}`;
      const C = THREE.ShaderChunk;
      let fs = sh.fragmentShader.replace("#include <common>", "#include <common>" + HTEX)
        .replace("#include <map_fragment>", C.map_fragment.replace("texture2D( map, vUv )", "hTex( map, vUv )"))
        .replace("#include <roughnessmap_fragment>", C.roughnessmap_fragment.replace("texture2D( roughnessMap, vUv )", "hTex( roughnessMap, vUv )"))
        .replace("#include <metalnessmap_fragment>", C.metalnessmap_fragment + "\nmetalnessFactor = max(metalnessFactor, vHMetal * 0.6);")
        .replace("#include <normal_fragment_maps>", C.normal_fragment_maps.replace("texture2D( normalMap, vUv )", "hTex( normalMap, vUv )"))
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= step(0.5, vHLit) * step(vHLit / 255.0, uHLit);");
      sh.fragmentShader = fs;
    };
    m.customProgramCacheKey = () => "konto-house-" + (m.isMeshStandardMaterial ? "pbr" : "lam");
  }
  function material(hi, env) {
    const k = hi ? "hi" : "lo";
    if (MATS[k]) { const m = MATS[k]; if (hi && (m.envMap || null) !== (env || null)) { m.envMap = env || null; m.needsUpdate = true; } return m; }
    const A = atlas();
    // the game's materials: PBR on high, Lambert on low - both on the atlas maps
    const m = hi
      ? new THREE.MeshStandardMaterial({ map: A.color, normalMap: A.normal, roughnessMap: A.rough, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 1, metalness: 0, vertexColors: true, envMap: env, envMapIntensity: 0.55, emissive: new THREE.Color(1.0, 0.76, 0.45), emissiveIntensity: 0 })
      : new THREE.MeshLambertMaterial({ map: A.color, vertexColors: true, emissive: new THREE.Color(1.0, 0.76, 0.45), emissiveIntensity: 0 });
    patch(m);
    m.userData.pbrDone = true; m.userData.shared = true; m.userData.houses = true;
    return (MATS[k] = m);
  }

  // ---- signs: one canvas of lettered boards (shop fascias, nameplates, the apartment's name), drawn with SignFonts ----
  const SIGN = { canvas: null, tex: null, slots: new Map(), n: 0, dirty: false, W: 2048, Hh: 2048, sw: 256, sh: 64, mat: {} };
  function signCanvas() {
    if (SIGN.canvas) return SIGN.canvas;
    SIGN.canvas = document.createElement("canvas"); SIGN.canvas.width = SIGN.W; SIGN.canvas.height = SIGN.Hh;
    SIGN.tex = new THREE.CanvasTexture(SIGN.canvas); SIGN.tex.encoding = THREE.sRGBEncoding; SIGN.tex.anisotropy = 4;
    if (window.SignFonts && SignFonts.ready) SignFonts.ready.then(() => { const keep = [...SIGN.slots.entries()]; keep.forEach(([k, s]) => drawSign(s)); SIGN.dirty = true; });
    return SIGN.canvas;
  }
  function drawSign(s) {
    const g = SIGN.canvas.getContext("2d"), x = s.i % 8 * SIGN.sw, y = Math.floor(s.i / 8) * SIGN.sh, w = SIGN.sw, h = SIGN.sh, d = s.d;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    const SF = window.SignFonts;
    if (SF) {
      const st = SF.style(d.seed || d.text, { text: d.text, mood: d.mood, stable: true, panel: d.panel });
      SF.panel(g, x, y, w, h, st, d.bg, d.ink);
      g.textAlign = "center"; g.textBaseline = "middle";
      SF.text(g, d.text, x + w / 2, y + h * 0.54, st, d.ink, d.bg, h * 0.62, w * 0.86);
      if (d.sub) { g.globalAlpha = 0.85; SF.text(g, d.sub, x + w / 2, y + h * 0.86, Object.assign({}, st, { treatment: "flat" }), d.ink, d.bg, h * 0.16, w * 0.8); }
    } else {
      g.fillStyle = d.bg; g.fillRect(x, y, w, h); g.fillStyle = d.ink; g.font = "bold " + Math.round(h * 0.55) + "px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(d.text, x + w / 2, y + h / 2, w * 0.9);
    }
    // grime: the bottom edge of an outdoor board is always darker
    const gr = g.createLinearGradient(0, y + h * 0.6, 0, y + h); gr.addColorStop(0, "rgba(40,34,26,0)"); gr.addColorStop(1, "rgba(40,34,26,0.22)");
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.restore();
  }
  function signSlot(d) {
    const key = d.text + "|" + d.bg + "|" + d.ink + "|" + (d.sub || "");
    if (SIGN.slots.has(key)) return SIGN.slots.get(key);
    signCanvas();
    const cap = (SIGN.W / SIGN.sw) * (SIGN.Hh / SIGN.sh);
    const s = { i: SIGN.n % cap, d: d };
    if (SIGN.n >= cap) for (const [k, o] of SIGN.slots) if (o.i === s.i) { SIGN.slots.delete(k); break; }
    SIGN.n++;
    drawSign(s); SIGN.slots.set(key, s); SIGN.dirty = true;
    return s;
  }
  function signMaterial(hi) {
    const k = hi ? "hi" : "lo";
    if (SIGN.mat[k]) return SIGN.mat[k];
    signCanvas();
    const m = hi ? new THREE.MeshStandardMaterial({ map: SIGN.tex, roughness: 0.55, metalness: 0.0, emissive: new THREE.Color(1, 1, 1), emissiveMap: SIGN.tex, emissiveIntensity: 0 })
                 : new THREE.MeshLambertMaterial({ map: SIGN.tex, emissive: new THREE.Color(1, 1, 1), emissiveMap: SIGN.tex, emissiveIntensity: 0 });
    m.userData.pbrDone = true; m.userData.shared = true;
    return (SIGN.mat[k] = m);
  }
  // sign boards are built as plain quads with UVs into the canvas
  function SB() { this.p = []; this.n = []; this.uv = []; this.ix = []; }
  SB.prototype.board = function (gb, s, cx, cy, cz, w, h, yaw) {
    if (gb.nul) return;
    // in gb's current frame: a board facing +z (rotated by yaw) centred on (cx, cy, cz)
    const f = gb.F[gb.F.length - 1], ca = Math.cos(yaw || 0), sa = Math.sin(yaw || 0);
    const P = (x, y) => { const lx = cx + x * ca, lz = cz - x * sa; return [f.x + lx * f.c + lz * f.s, f.y + cy + y, f.z - lx * f.s + lz * f.c]; };
    const nx0 = sa, nz0 = ca, nx = nx0 * f.c + nz0 * f.s, nz = -nx0 * f.s + nz0 * f.c;
    const u0 = (s.i % 8) * SIGN.sw / SIGN.W, u1 = u0 + SIGN.sw / SIGN.W, v1 = 1 - Math.floor(s.i / 8) * SIGN.sh / SIGN.Hh, v0 = v1 - SIGN.sh / SIGN.Hh;
    const i = this.p.length / 3;
    [[P(-w / 2, -h / 2), u0 + 0.002, v0 + 0.004], [P(w / 2, -h / 2), u1 - 0.002, v0 + 0.004], [P(w / 2, h / 2), u1 - 0.002, v1 - 0.004], [P(-w / 2, h / 2), u0 + 0.002, v1 - 0.004]].forEach(q => { this.p.push(q[0][0], q[0][1], q[0][2]); this.n.push(nx, 0, nz); this.uv.push(q[1], q[2]); });
    this.ix.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  SB.prototype.mesh = function (hi) {
    if (!this.ix.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.ix); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, signMaterial(hi)); m.receiveShadow = true; return m;
  };

  // =====================================================================================================================
  // WHO LIVES THERE
  // =====================================================================================================================
  const SURNAMES = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤", "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "斎藤", "清水",
                    "山崎", "森", "池田", "橋本", "阿部", "石川", "山下", "中島", "石井", "小川", "前田", "岡田", "長谷川", "藤田", "後藤", "近藤", "村上", "遠藤", "青木", "坂本"];
  const ROMAJI = { "佐藤": "Satō", "鈴木": "Suzuki", "高橋": "Takahashi", "田中": "Tanaka", "伊藤": "Itō", "渡辺": "Watanabe", "山本": "Yamamoto", "中村": "Nakamura", "小林": "Kobayashi", "加藤": "Katō",
                   "吉田": "Yoshida", "山田": "Yamada", "佐々木": "Sasaki", "山口": "Yamaguchi", "松本": "Matsumoto", "井上": "Inoue", "木村": "Kimura", "林": "Hayashi", "斎藤": "Saitō", "清水": "Shimizu",
                   "山崎": "Yamazaki", "森": "Mori", "池田": "Ikeda", "橋本": "Hashimoto", "阿部": "Abe", "石川": "Ishikawa", "山下": "Yamashita", "中島": "Nakajima", "石井": "Ishii", "小川": "Ogawa",
                   "前田": "Maeda", "岡田": "Okada", "長谷川": "Hasegawa", "藤田": "Fujita", "後藤": "Gotō", "近藤": "Kondō", "村上": "Murakami", "遠藤": "Endō", "青木": "Aoki", "坂本": "Sakamoto" };
  const hm = (h, m) => h * 60 + (m || 0);
  const JOBS = {
    office: { job: "office worker", leave: [hm(7, 10), hm(8, 0)], back: [hm(19, 0), hm(22, 30)], mode: "train" },
    factory: { job: "factory shift", leave: [hm(6, 20), hm(7, 0)], back: [hm(16, 30), hm(17, 30)], mode: "car" },
    parttime: { job: "part-time at the supermarket", leave: [hm(9, 0), hm(10, 0)], back: [hm(14, 0), hm(16, 0)], mode: "bicycle" },
    nurse: { job: "nurse, nights", leave: [hm(15, 30), hm(16, 30)], back: [hm(8, 30), hm(9, 30)], mode: "bicycle" },
    school: { job: "school", leave: [hm(7, 30), hm(8, 0)], back: [hm(15, 0), hm(17, 30)], mode: "walk" },
    highschool: { job: "high school, club after", leave: [hm(7, 0), hm(7, 40)], back: [hm(18, 30), hm(19, 30)], mode: "bicycle" },
    student: { job: "university", leave: [hm(9, 0), hm(11, 0)], back: [hm(17, 0), hm(23, 30)], mode: "bicycle" },
    nursery: { job: "nursery", leave: [hm(8, 0), hm(8, 40)], back: [hm(17, 0), hm(18, 30)], mode: "bicycle" },
    retired: { job: "retired: walk, shops, the clinic on Tuesdays", leave: [hm(9, 30), hm(10, 30)], back: [hm(11, 30), hm(12, 30)], mode: "walk" },
    home: { job: "at home", leave: [hm(10, 0), hm(11, 0)], back: [hm(11, 40), hm(12, 30)], mode: "bicycle" },
    fisher: { job: "fisherman", leave: [hm(3, 30), hm(4, 30)], back: [hm(11, 0), hm(13, 0)], mode: "walk" },
    farmer: { job: "rice and vegetables", leave: [hm(5, 30), hm(6, 30)], back: [hm(17, 0), hm(18, 0)], mode: "kei truck" },
    shop: { job: "runs the shop downstairs", leave: null, back: null, mode: "home" },
    remote: { job: "works from home", leave: [hm(12, 0), hm(12, 30)], back: [hm(12, 40), hm(13, 30)], mode: "walk" }
  };
  function member(r, role, age, jobKey) {
    const j = JOBS[jobKey] || JOBS.home;
    const at = rng => rng ? Math.round(lerp(rng[0], rng[1], r()) / 5) * 5 : null;
    const fmt = m => m === null ? null : String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
    const leave = at(j.leave), back = at(j.back);
    return { role: role, age: age, job: j.job, mode: j.mode, leave: fmt(leave), back: fmt(back), leaveMin: leave, backMin: back,
             wake: fmt(leave !== null ? Math.max(hm(4, 0), (leave - 50 - Math.round(r() * 30)) % 1440) : hm(6, 30) + Math.round(r() * 60)),
             sleep: fmt(hm(22, 0) + Math.round(r() * 120) - (age > 70 ? 60 : 0)) };
  }

  // =====================================================================================================================
  // PURPOSES. Each says how often it turns up in each kind of town, who lives there, and what the house needs.
  //   r: region weights (tokonto = the modern city and suburbs, nara = the old timber towns, coast = fishing towns)
  //   floors, w (frontage), d (depth): what the household builds when it has the choice
  //   shop: the ground floor front is a business; sign: what its board says; hours: when it is open
  // =====================================================================================================================
  const P = {};
  const def = (id, o) => { o.id = id; P[id] = o; };
  def("family", { label: "Young family", r: { tokonto: 16, nara: 4, coast: 4 }, floors: [2, 2], w: [7.5, 9.5], d: [7, 9],
    folk: r => [member(r, "father", 34 + (r() * 8 | 0), "office"), member(r, "mother", 32 + (r() * 8 | 0), r() < 0.6 ? "parttime" : "office"), member(r, "son", 6 + (r() * 6 | 0), "school"), ...(r() < 0.6 ? [member(r, "daughter", 2 + (r() * 3 | 0), "nursery")] : [])],
    car: ["onebox", "suv", "hatch"], kids: true, bikes: 2 });
  def("couple", { label: "Working couple", r: { tokonto: 9, nara: 1, coast: 1 }, floors: [2, 3], w: [6.5, 8], d: [7, 9], modern: true,
    folk: r => [member(r, "husband", 36 + (r() * 10 | 0), "office"), member(r, "wife", 34 + (r() * 10 | 0), r() < 0.3 ? "remote" : "office")], car: ["hatch", "sedan"], solar: 0.6, bikes: 1 });
  def("retired", { label: "Retired couple", r: { tokonto: 10, nara: 8, coast: 7 }, floors: [1, 2], w: [8, 11], d: [8, 10], old: true,
    folk: r => [member(r, "husband", 70 + (r() * 12 | 0), "retired"), member(r, "wife", 68 + (r() * 12 | 0), "home")], car: ["sedan", "kei"], bonsai: true, garden: 2, bikes: 1 });
  def("widow", { label: "Widow living alone", r: { tokonto: 6, nara: 5, coast: 5 }, floors: [1, 2], w: [6.5, 8.5], d: [7, 9], old: true,
    folk: r => [member(r, "grandmother", 76 + (r() * 14 | 0), "retired")], car: null, pots: 2.5, bikes: 1, shutUp: true });
  def("multigen", { label: "Three generations under one roof", r: { tokonto: 5, nara: 3, coast: 2 }, floors: [2, 2], w: [10, 12], d: [8.5, 10],
    folk: r => [member(r, "grandfather", 72 + (r() * 10 | 0), "retired"), member(r, "grandmother", 70 + (r() * 10 | 0), "home"), member(r, "son", 42 + (r() * 8 | 0), "office"), member(r, "daughter-in-law", 40 + (r() * 8 | 0), "parttime"), member(r, "grandson", 14 + (r() * 3 | 0), "highschool")],
    car: ["onebox", "kei"], twoDoors: true, kids: false, bikes: 3, garden: 1 });
  def("single", { label: "Salaryman renting alone", r: { tokonto: 6, nara: 1, coast: 1 }, floors: [1, 2], w: [6, 7.5], d: [6.5, 8],
    folk: r => [member(r, "tenant", 26 + (r() * 14 | 0), "office")], car: null, bikes: 1, untidy: true });
  def("share", { label: "Student share house", r: { tokonto: 3, nara: 1, coast: 0 }, floors: [2, 2], w: [7.5, 9], d: [8, 9.5],
    folk: r => [member(r, "student", 19 + (r() * 4 | 0), "student"), member(r, "student", 20 + (r() * 4 | 0), "student"), member(r, "student", 19 + (r() * 4 | 0), "student"), member(r, "student", 21 + (r() * 4 | 0), "student")],
    car: null, bikes: 5, untidy: true, laundry: 2 });
  def("akiya", { label: "Empty since the owner died", r: { tokonto: 3, nara: 4, coast: 5 }, floors: [1, 2], w: [7, 9], d: [7, 9], old: true, empty: true,
    folk: () => [], car: null, sign: [{ text: "売物件", sub: "Ōmura Realty", bg: "#f4f1e6", ink: "#b0201a" }] });
  def("apartment", { label: "Two-storey rental flats (アパート)", r: { tokonto: 5, nara: 0, coast: 1 }, floors: [2, 2], w: [10, 13], d: [6.5, 8], apartment: true,
    folk: r => { const a = []; for (let i = 0; i < 6; i++) a.push(member(r, "tenant, flat " + (i < 3 ? 101 + i : 201 + i - 3), 22 + (r() * 40 | 0), pick(r, ["office", "office", "parttime", "nurse", "student", "factory"]))); return a; },
    car: null, bikes: 4, laundry: 2 });
  def("tobacco", { label: "Tobacco and liquor shop on the ground floor", r: { tokonto: 2.5, nara: 1.5, coast: 1.5 }, floors: [2, 2], w: [7, 9], d: [8, 10], shop: true,
    folk: r => [member(r, "shopkeeper", 66 + (r() * 12 | 0), "shop"), member(r, "wife", 64 + (r() * 12 | 0), "shop")],
    sign: [{ text: "たばこ・酒", bg: "#b8261e", ink: "#fff6e8" }], hours: ["08:00", "21:00"], vending: 3, car: ["keivan"] });
  def("barber", { label: "Barber's shop with the family upstairs", r: { tokonto: 2, nara: 1, coast: 1 }, floors: [2, 2], w: [6.5, 8], d: [8, 10], shop: true,
    folk: r => [member(r, "barber", 55 + (r() * 15 | 0), "shop"), member(r, "wife", 52 + (r() * 15 | 0), "shop")],
    sign: r => [{ text: "理容 " + pick(r, ["ヤマダ", "さくら", "ミナミ", "マルイ", "あおば"]), bg: "#1b3d78", ink: "#ffffff" }], hours: ["09:00", "19:00"], pole: true, car: ["kei"] });
  def("clinic", { label: "Neighbourhood dental clinic", r: { tokonto: 1.5, nara: 0.5, coast: 0.5 }, floors: [2, 2], w: [9, 11], d: [9, 10], shop: true, modern: true,
    folk: r => [member(r, "dentist", 48 + (r() * 14 | 0), "shop"), member(r, "receptionist (wife)", 46 + (r() * 14 | 0), "shop")],
    sign: r => [{ text: pick(r, ["さくら", "みどり", "ひまわり", "青葉", "中央"]) + "歯科医院", bg: "#ffffff", ink: "#1e6a8c", sub: "Dental clinic · 9:00–18:30" }], hours: ["09:00", "18:30"], car: ["sedan"], garden: 1 });
  def("piano", { label: "Piano teacher's house", r: { tokonto: 2, nara: 1, coast: 0.5 }, floors: [2, 2], w: [7.5, 9], d: [8, 9],
    folk: r => [member(r, "piano teacher", 45 + (r() * 20 | 0), "remote"), member(r, "husband", 48 + (r() * 20 | 0), "office")],
    sign: [{ text: "ピアノ教室", sub: "Piano lessons", bg: "#fbf6ee", ink: "#7a2c48" }], hours: ["14:00", "20:00"], bikes: 4, garden: 1, kids: true });
  def("juku", { label: "Cram school in the front room", r: { tokonto: 1.5, nara: 0.5, coast: 0.5 }, floors: [2, 2], w: [8, 10], d: [8, 9.5], shop: true,
    folk: r => [member(r, "teacher", 40 + (r() * 20 | 0), "shop")], sign: r => [{ text: pick(r, ["明光", "進学", "個別指導", "英数"]) + "塾", bg: "#ffffff", ink: "#c02020", sub: "Juku · after school" }], hours: ["15:00", "22:00"], bikes: 6 });
  def("cyclefix", { label: "Bicycle repair shop", r: { tokonto: 1.5, nara: 1, coast: 1 }, floors: [2, 2], w: [7, 9], d: [8, 10], shop: true, workshop: true,
    folk: r => [member(r, "mechanic", 58 + (r() * 14 | 0), "shop"), member(r, "wife", 56 + (r() * 14 | 0), "home")],
    sign: [{ text: "サイクル", sub: "Cycle repairs", bg: "#f2c418", ink: "#1a1a1a" }], hours: ["09:30", "19:00"], bikes: 7 });
  def("cafe", { label: "Café in the front room", r: { tokonto: 2, nara: 2, coast: 1.5 }, floors: [2, 2], w: [7, 9], d: [8, 10], shop: true,
    folk: r => [member(r, "café owner", 38 + (r() * 20 | 0), "shop"), member(r, "partner", 38 + (r() * 20 | 0), "office")],
    sign: r => [{ text: "珈琲 " + pick(r, ["ことり", "木漏れ日", "ひだまり", "港", "灯"]), bg: "#2e2620", ink: "#f3e3c3" }], hours: ["08:00", "18:00"], awning: true, garden: 1 });
  def("gardener", { label: "Keen gardener's house", r: { tokonto: 3, nara: 2, coast: 1 }, floors: [1, 2], w: [7, 9], d: [7.5, 9],
    folk: r => [member(r, "husband", 60 + (r() * 15 | 0), "retired"), member(r, "wife", 58 + (r() * 15 | 0), "home")], greenhouse: true, pots: 3, garden: 3, car: ["kei"] });
  // the old towns
  def("sake", { label: "Sake brewer's shop", r: { tokonto: 0, nara: 3, coast: 0.5 }, floors: [2, 2], w: [8, 11], d: [9, 11], shop: true,
    folk: r => [member(r, "brewer", 60 + (r() * 15 | 0), "shop"), member(r, "son", 30 + (r() * 10 | 0), "shop")],
    sign: r => [{ text: pick(r, ["瑞穂", "白鷺", "千歳", "花泉"]) + "酒造", bg: "#1d1712", ink: "#efe3c0" }], hours: ["09:00", "18:00"], sugidama: true, car: ["keivan"] });
  def("teashop", { label: "Tea merchant", r: { tokonto: 0.5, nara: 2.5, coast: 0 }, floors: [2, 2], w: [7, 9], d: [9, 11], shop: true,
    folk: r => [member(r, "tea merchant", 55 + (r() * 20 | 0), "shop"), member(r, "wife", 52 + (r() * 20 | 0), "shop")], sign: [{ text: "日本茶", sub: "Tea · since 1952", bg: "#2f4a2a", ink: "#f1ead2" }], hours: ["09:30", "18:00"] });
  def("pottery", { label: "Potter's workshop", r: { tokonto: 0, nara: 2, coast: 1 }, floors: [1, 2], w: [7, 9], d: [8, 10], shop: true, workshop: true,
    folk: r => [member(r, "potter", 45 + (r() * 25 | 0), "shop")], sign: [{ text: "陶房", sub: "Pottery", bg: "#e8dcc6", ink: "#3a2a1e" }], hours: ["10:00", "17:00"], pots: 2 });
  def("guesthouse", { label: "Guest house", r: { tokonto: 0.5, nara: 2, coast: 2 }, floors: [2, 2], w: [8, 11], d: [9, 11], shop: true,
    folk: r => [member(r, "host", 40 + (r() * 25 | 0), "shop"), member(r, "partner", 40 + (r() * 25 | 0), "shop")],
    sign: r => [{ text: pick(r, ["民宿 ", "ゲストハウス "]) + pick(r, ["しおさい", "はなれ", "つばめ", "かもめ"]), bg: "#f6efe0", ink: "#24324a" }], hours: ["15:00", "22:00"], laundry: 2, bikes: 3 });
  def("farmer", { label: "Farming family", r: { tokonto: 0, nara: 4, coast: 1 }, floors: [2, 2], w: [9, 12], d: [8.5, 10], old: true,
    folk: r => [member(r, "farmer", 62 + (r() * 12 | 0), "farmer"), member(r, "wife", 60 + (r() * 12 | 0), "farmer"), member(r, "son", 32 + (r() * 8 | 0), "factory")], car: ["keivan"], farm: true, garden: 1, bikes: 1 });
  def("fisher", { label: "Fisherman's house", r: { tokonto: 0, nara: 0, coast: 9 }, floors: [1, 2], w: [7, 9], d: [7, 9], old: true,
    folk: r => [member(r, "fisherman", 50 + (r() * 20 | 0), "fisher"), member(r, "wife", 48 + (r() * 20 | 0), "home")], fishing: true, car: ["keivan"], bikes: 1 });
  def("himono", { label: "Dried-fish maker", r: { tokonto: 0, nara: 0, coast: 3 }, floors: [1, 2], w: [7, 9], d: [8, 10], shop: true,
    folk: r => [member(r, "fish drier", 55 + (r() * 20 | 0), "shop"), member(r, "husband", 58 + (r() * 20 | 0), "fisher")], sign: [{ text: "干物", sub: "Himono · dried fish", bg: "#f2ead8", ink: "#203a5a" }], hours: ["07:00", "16:00"], racks: true });
  def("surf", { label: "Surf shop", r: { tokonto: 0, nara: 0, coast: 1.5 }, floors: [2, 2], w: [7, 9], d: [8, 10], shop: true, modern: true,
    folk: r => [member(r, "surfer", 30 + (r() * 15 | 0), "shop")], sign: [{ text: "SURF", sub: "Boards · wax · rental", bg: "#0e7a8a", ink: "#ffffff" }], hours: ["08:00", "18:00"], boards: true, car: ["onebox"] });

  function purposeFor(region, r) {
    const k = region === "nara" ? "nara" : region === "coast" ? "coast" : "tokonto";
    return P[pickW(r, Object.keys(P).map(id => [id, P[id].r[k] || 0]))];
  }

  // ---- looks: what each kind of town builds in ---------------------------------------------------------------------------
  const WALLS = {
    siding: { tile: T.siding, cols: [0xe8e2d4, 0xd9d4c8, 0xc8c0ae, 0xeae6de, 0xb9b1a2, 0x8f8a80, 0xd8c8a8, 0x9a8c78] },
    plaster: { tile: T.plaster, cols: [0xeee8dc, 0xe2d8c4, 0xd6cbb6, 0xf2efe8, 0xcfc3ad] },
    seam: { tile: T.seam, cols: [0x3a3d40, 0x5b5f62, 0x26292c, 0x8c9094, 0x6e5a4a], rot: true },
    brick: { tile: T.brick, cols: [0xd8cfc8, 0xc8beb4] },
    timber: { tile: T.timber, cols: [0x8a6a4a, 0x6e5238, 0x5a4230, 0x3a2c22], rot: true },
    yakisugi: { tile: T.bark, cols: [0x5a5048, 0x403830, 0x6a5c50], rot: true }
  };
  const ROOFS = {
    kawara: { tile: T.kawara, cols: [0x8e96a0, 0x6c747e, 0x5a6068, 0x7c6a5e, 0x47566e] },
    slate: { tile: T.slate, cols: [0xb8b4ae, 0x9c9894, 0x8a7a6c, 0x6e7a86, 0xa48c7a] },
    seam: { tile: T.seam, cols: [0x4a4e52, 0x2e3234, 0x7a5a44, 0x5a6a5e, 0x9aa0a6] }
  };
  const FRAMES = [0x2a2622, 0x3c3832, 0xb8bcc0, 0x8a8478, 0x1c1c1e];

  // =====================================================================================================================
  // LAYOUT: called by konto.html while it lays out a block of houses, so the footprint fits the household and the lot
  // keeps room for a drive, a garden and a gate. Works in the lot's front frame (x across the frontage, +z toward the
  // street) and hands back sizes and offsets in the plot's axes.
  //   o = { seed, region, lot: [lx, lz] (plot axes), front: 0 +z | 1 -z | 2 +x | 3 -x, maxH }
  // =====================================================================================================================
  function frontSwap(front) { return front === 2 || front === 3; }
  // a vector in the house's front frame (x across, z to the street) to the plot's axes
  function toPlot(front, x, z) { return front === 0 ? [x, z] : front === 1 ? [-x, -z] : front === 2 ? [z, -x] : [-z, x]; }
  H.layout = function (o) {
    const r = mulberry(o.seed), pur = purposeFor(o.region, r);
    const sw = frontSwap(o.front), LW = sw ? o.lot[1] : o.lot[0], LD = sw ? o.lot[0] : o.lot[1];
    const floors = pur.floors[0] + Math.round(r() * (pur.floors[1] - pur.floors[0]));
    let w = clamp(lerp(pur.w[0], pur.w[1], r()), 5.2, Math.max(5.2, LW - 1.4));
    let d = clamp(lerp(pur.d[0], pur.d[1], r()), 5.5, Math.max(5.5, LD - 3.2));
    // a shop builds to the street; a house keeps a front garden deep enough for a car when the lot allows
    const back = clamp(LD * 0.06, 0.7, 1.4);
    let zc = LD / 2 - back - d / 2;                    // the back wall a metre or so off the back boundary
    if (pur.shop) zc = Math.min(zc, LD / 2 - d / 2 - 0.9);
    zc = -zc;                                          // +z is the street: the house sits toward the back (-z)
    const side = LW - w, sideBias = side > 3.4 ? (r() < 0.5 ? -1 : 1) : 0;
    const xc = sideBias ? sideBias * (side / 2 - 0.7) : (r() - 0.5) * Math.min(0.6, side * 0.3);
    const fh = pur.old ? 2.85 : 2.95, floorH = lerp(fh, fh + 0.2, r());
    const h = clamp(floors * floorH + 0.45, 3.3, o.maxH || 10.5);
    const off = toPlot(o.front, xc, zc), size = sw ? [d, w] : [w, d];
    return { size: size, off: off, h: h, purpose: pur.id, floors: floors };
  };

  // ---- the whole design, from the box the city laid out ------------------------------------------------------------------
  function design(b) {
    const hs = b.house, r = mulberry(hs.seed ^ 0x5bd1e995), region = hs.region || "";
    const pur = P[hs.purpose] || purposeFor(region, r);
    const sw = frontSwap(hs.front);
    const w = sw ? b.size[1] : b.size[0], d = sw ? b.size[0] : b.size[1];
    // the city trims a house back from a road it overlaps: then the lot it was drawn in runs onto the road, so keep to the house
    const trimmed = hs.size0 && (Math.abs(hs.size0[0] - b.size[0]) > 0.05 || Math.abs(hs.size0[1] - b.size[1]) > 0.05);
    const lotOK = hs.lot && !trimmed;
    const lotW = lotOK ? (sw ? hs.lot[1] : hs.lot[0]) : w + 0.8, lotD = lotOK ? (sw ? hs.lot[0] : hs.lot[1]) : d + 0.8;
    // the lot centre relative to the house, in the house's front frame
    const lo = lotOK ? (hs.lotOff || [0, 0]) : [0, 0], lc = hs.front === 0 ? lo : hs.front === 1 ? [-lo[0], -lo[1]] : hs.front === 2 ? [-lo[1], lo[0]] : [lo[1], -lo[0]];
    const floors = hs.floors || clamp(Math.round((b.h - 0.4) / 2.9), 1, 3);
    const old = !!pur.old || region === "nara" || (region === "coast" && r() < 0.6);
    const modern = !!pur.modern && !old;
    // cladding: the old towns are timber and plaster; the city is siding, with plaster on the older houses, galvalume on the new
    let wallA, wallB = null;
    if (region === "nara") { wallA = r() < 0.65 ? "plaster" : "timber"; wallB = wallA === "plaster" ? "timber" : "plaster"; }
    else if (region === "coast") { wallA = pickW(r, [["yakisugi", 3], ["seam", 3], ["timber", 2], ["siding", 2]]); wallB = r() < 0.3 ? "plaster" : null; }
    else if (modern) { wallA = pickW(r, [["seam", 4], ["plaster", 3], ["siding", 2]]); wallB = r() < 0.5 ? pickW(r, [["timber", 2], ["siding", 1], ["seam", 1]]) : null; }
    else if (old) { wallA = pickW(r, [["plaster", 4], ["siding", 3], ["timber", 1]]); wallB = r() < 0.25 ? "siding" : null; }
    else { wallA = pickW(r, [["siding", 7], ["plaster", 2], ["brick", 1]]); wallB = r() < 0.35 ? pickW(r, [["siding", 2], ["plaster", 1], ["seam", 1]]) : null; }
    if (wallB === wallA) wallB = null;
    const wa = WALLS[wallA], wb = WALLS[wallB || wallA];
    const colA = hex(pick(r, wa.cols)), colB = wallB ? hex(pick(r, wb.cols)) : mul(colA, 1.0);
    // roof
    let roofType, cover;
    if (region === "nara" || (old && r() < 0.7)) { roofType = floors > 1 && r() < 0.5 ? "hip" : "gable"; cover = "kawara"; }
    else if (region === "coast") { roofType = r() < 0.7 ? "gable" : "hip"; cover = r() < 0.6 ? "seam" : "kawara"; }
    else if (modern) { roofType = pickW(r, [["shed", 4], ["flat", 3], ["gable", 2]]); cover = roofType === "flat" ? "seam" : pickW(r, [["seam", 3], ["slate", 1]]); }
    else { roofType = pickW(r, [["gable", 5], ["hip", 4], ["shed", 1]]); cover = pickW(r, [["slate", 5], ["kawara", 2], ["seam", 2]]); }
    if (pur.apartment) { roofType = r() < 0.6 ? "gable" : "hip"; cover = r() < 0.6 ? "slate" : "seam"; }
    const roofCol = hex(pick(r, ROOFS[cover].cols));
    const frame = hex(pick(r, old ? [0x2a2622, 0x3c3832, 0x8a8478] : FRAMES));
    const pitch = cover === "kawara" ? lerp(0.42, 0.55, r()) : roofType === "shed" ? lerp(0.18, 0.3, r()) : lerp(0.32, 0.5, r());
    let surname = pick(r, SURNAMES);
    // the realism engine's census, when it is running, names the household (the same family it sends in and out of the door)
    try {
      if (window.realism && typeof realism.households === "function" && hs.plot) {
        const list = realism.households(hs.plot);
        const hh = list && list.length ? list[(hs.idx || 0) % list.length] : null;
        if (hh && hh.surname) surname = String(hh.surname);
      }
    } catch (e) { /* its API moved: keep our own */ }
    const aptName = pick(r, ["コーポ", "ハイツ", "メゾン", "グリーンハイツ", "サンライズ"]) + pick(r, ["さくら", "みどり", "青葉", "東", "大和", "ひかり"]);
    const folk = pur.folk ? pur.folk(r) : [];
    const signs = typeof pur.sign === "function" ? pur.sign(r) : (pur.sign || []);
    const empty = !!pur.empty;
    return {
      purpose: pur, id: pur.id, label: pur.label, region: region, r: r, seed: hs.seed,
      w: w, d: d, H: b.h, floors: floors, lotW: Math.max(lotW, w), lotD: Math.max(lotD, d), lc: lc,
      old: old, modern: modern, empty: empty,
      wall: { a: wa, b: wb, colA: colA, colB: colB, split: wallB ? 1 : 0 },
      roof: { type: roofType, cover: cover, col: roofCol, pitch: pitch, ov: old ? lerp(0.6, 0.85, r()) : modern ? lerp(0.08, 0.3, r()) : lerp(0.4, 0.6, r()) },
      frame: frame, surname: surname, aptName: aptName, folk: folk, signs: signs, hours: pur.hours || null,
      dirt: empty ? 0.75 : pur.untidy ? 0.92 : 1.0
    };
  }

  // =====================================================================================================================
  // BUILDING IT
  // =====================================================================================================================
  const E = 0.05;                                              // walls stand this far outside the city's box, which they hide
  const C = {                                                   // shared tints (linear)
    alu: hex(0xb4b8bc), aluDark: hex(0x3a3836), white: hex(0xeeeeec), offwhite: hex(0xdedad2), black: hex(0x1c1c1e),
    concrete: hex(0xc6cacc), concDark: hex(0x9a9ea0), gasYellow: hex(0xd8b830), pvc: hex(0xc9c6bc), pvcGrey: hex(0x8e9294),
    rubber: hex(0x202022), soffit: hex(0x8a8070), wood: hex(0xa88866), woodDark: hex(0x5a4532), leaf: hex(0x6a8a50), leafDark: hex(0x3e5a34),
    terracotta: hex(0xb06a44), glassDark: hex(0x6e7a84), glassFrost: hex(0xd4dadc), copper: hex(0xb8784a), red: hex(0xb02a24), blue: hex(0x2a4a8a),
    gravel: hex(0x9c968c), soil: hex(0x6a5a48), stone: hex(0xa4a098), steel: hex(0x6a6e72), rust: hex(0x8a5a3a), paper: hex(0xf2ece0)
  };
  const CLOTHES = [0xf2f2f0, 0x2a3a5a, 0xd8cfc0, 0x8a2a2a, 0x3a6a8a, 0xe8d8b0, 0x5a7a5a, 0xc8a0a8, 0x3a3a3c, 0xf0e070, 0x88a8c8].map(hex);

  // ---- walls, the footing, the trims -------------------------------------------------------------------------------------
  function walls(D, g) {
    const w = D.w, d = D.d, H = D.H, wl = D.wall, r = D.r, fH = (H - 0.45) / D.floors;
    const split = wl.split ? 0.45 + fH : -1;
    const face = (side, y0, y1, tile, rot, col) => {
      g.mat(mul(col, D.dirt), tile | (rot ? ROT : 0));
      const X = w / 2 + E, Z = d / 2 + E;
      if (side === 0) g.quad([-X, y0, Z], [X, y0, Z], [X, y1, Z], [-X, y1, Z]);
      if (side === 1) g.quad([X, y0, -Z], [-X, y0, -Z], [-X, y1, -Z], [X, y1, -Z]);
      if (side === 2) g.quad([X, y0, Z], [X, y0, -Z], [X, y1, -Z], [X, y1, Z]);
      if (side === 3) g.quad([-X, y0, -Z], [-X, y0, Z], [-X, y1, Z], [-X, y1, -Z]);
    };
    for (let s = 0; s < 4; s++) {
      if (split > 0) { face(s, 0.42, split, wl.a.tile, wl.a.rot, wl.colA); face(s, split, H, wl.b.tile, wl.b.rot, wl.colB); }
      else face(s, 0.42, H, wl.a.tile, wl.a.rot, wl.colA);
    }
    // the footing: board-marked concrete, a few centimetres proud, with the underfloor vents (床下換気口) every couple of metres
    g.mat(C.concrete, T.concrete).box(0, 0.22, 0, w + E * 2 + 0.06, 0.44, d + E * 2 + 0.06, 55);
    if (!D.purpose.apartment) for (const s of [0, 1, 2, 3]) {
      const len = s < 2 ? w : d, n = Math.max(1, Math.floor(len / 2.6));
      for (let k = 0; k < n; k++) {
        const u = -len / 2 + (k + 0.5) * len / n;
        g.push(...sidePos(D, s, u, 0), sideYaw(s));
        g.mat(C.black, T.metal).box(0, 0.25, 0.05, 0.3, 0.1, 0.02, 16);
        for (let q = 0; q < 6; q++) g.mat(C.concDark, T.metal).box(-0.125 + q * 0.05, 0.25, 0.062, 0.012, 0.1, 0.012, 21);
        g.pop();
      }
    }
    // belt between the two claddings, corner trims down every corner (siding needs them), the eaves' board
    if (split > 0) { g.mat(D.frame, T.metal); g.box(0, split, d / 2 + E + 0.02, w + E * 2 + 0.06, 0.06, 0.05); g.box(0, split, -d / 2 - E - 0.02, w + E * 2 + 0.06, 0.06, 0.05); g.box(w / 2 + E + 0.02, split, 0, 0.05, 0.06, d + E * 2 + 0.06); g.box(-w / 2 - E - 0.02, split, 0, 0.05, 0.06, d + E * 2 + 0.06); }
    if (wl.a.tile === T.siding || wl.a.tile === T.seam || wl.a.tile === T.timber || wl.a.tile === T.bark) {
      g.mat(wl.a.tile === T.seam ? mul(wl.colA, 0.8) : C.offwhite, T.metal);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * (w / 2 + E), H / 2 + 0.2, sz * (d / 2 + E), 0.09, H - 0.4, 0.09);
    }
    // old timber: posts and rails standing out of the plaster (真壁), the way a Kyoto or Nara house shows its frame
    if (D.region === "nara" || (D.old && wl.a.tile === T.plaster && r() < 0.5)) {
      g.mat(C.woodDark, T.timber | ROT);
      for (let s = 0; s < 4; s++) {
        const len = s < 2 ? w : d, n = Math.max(2, Math.round(len / 1.82));
        for (let k = 0; k <= n; k++) { g.push(...sidePos(D, s, -len / 2 + k * len / n, 0.02), sideYaw(s)); g.box(0, H / 2 + 0.2, 0.02, 0.12, H - 0.4, 0.05); g.pop(); }
        for (let f = 1; f <= D.floors; f++) { g.push(...sidePos(D, s, 0, 0.02), sideYaw(s)); g.box(0, 0.45 + f * fH - 0.08, 0.025, len + 0.1, 0.14, 0.06); g.pop(); }
      }
    }
  }
  // a point on a side of the house: s 0 front (+z), 1 back, 2 right (+x), 3 left; u along it (left to right seen from outside); out from the wall
  function sidePos(D, s, u, out) {
    const X = D.w / 2 + E + out, Z = D.d / 2 + E + out;
    return s === 0 ? [u, 0, Z] : s === 1 ? [-u, 0, -Z] : s === 2 ? [X, 0, -u] : [-X, 0, u];
  }
  function sideYaw(s) { return s === 0 ? 0 : s === 1 ? Math.PI : s === 2 ? Math.PI / 2 : -Math.PI / 2; }

  // ---- windows and the front door ------------------------------------------------------------------------------------------
  // In the side's frame (+z out of the wall, x along it, y up from the ground).
  function sash(D, g, x, y, ww, wh, opt) {
    const fr = D.frame, key = opt.key || 0, depth = 0.07;
    // the reveal: a frame box all round, the glass behind it, the sill under, the head flashing over
    g.mat(fr, T.metal);
    g.box(x, y + wh / 2 + 0.025, depth / 2, ww + 0.1, 0.05, depth, 55);
    g.box(x, y - wh / 2 - 0.025, depth / 2, ww + 0.1, 0.05, depth, 55);
    g.box(x - ww / 2 - 0.025, y, depth / 2, 0.05, wh, depth, 55);
    g.box(x + ww / 2 + 0.025, y, depth / 2, 0.05, wh, depth, 55);
    g.mat(mul(fr, 1.1), T.metal).box(x, y - wh / 2 - 0.06, 0.06, ww + 0.16, 0.025, 0.12, 21);
    if (opt.frost) { g.mat(C.glassFrost, T.glass, key).quad([x - ww / 2, y - wh / 2, 0.012], [x + ww / 2, y - wh / 2, 0.012], [x + ww / 2, y + wh / 2, 0.012], [x - ww / 2, y + wh / 2, 0.012]); }
    else {
      g.mat(C.glassDark, T.glass, key).quad([x - ww / 2, y - wh / 2, 0.012], [x + ww / 2, y - wh / 2, 0.012], [x + ww / 2, y + wh / 2, 0.012], [x - ww / 2, y + wh / 2, 0.012]);
      // curtains inside: a lace half, sometimes a drawn heavy one, lit with the room
      if (opt.curtain) {
        const cw = ww * opt.curtain, side = opt.curtainSide || -1;
        g.mat(opt.curtainCol || C.paper, T.cloth, key).quad([x + side * ww / 2 - (side > 0 ? cw : 0), y - wh / 2 + 0.02, 0.016], [x + side * ww / 2 + (side > 0 ? 0 : cw), y - wh / 2 + 0.02, 0.016], [x + side * ww / 2 + (side > 0 ? 0 : cw), y + wh / 2 - 0.02, 0.016], [x + side * ww / 2 - (side > 0 ? cw : 0), y + wh / 2 - 0.02, 0.016]);
      }
    }
    // the sliding sashes: two leaves, the meeting stiles overlapping in the middle, a crescent lock on one
    if (ww > 0.55) {
      g.mat(fr, T.metal);
      g.box(x - 0.02, y, 0.035, 0.035, wh, 0.03, 55); g.box(x + 0.02, y, 0.05, 0.035, wh, 0.03, 55);
      g.box(x, y + wh / 2 - 0.02, 0.04, ww, 0.03, 0.03, 20); g.box(x, y - wh / 2 + 0.02, 0.04, ww, 0.03, 0.03, 20);
      g.mat(C.alu, T.metal).box(x, y, 0.07, 0.03, 0.04, 0.012, 21);
    }
    if (opt.grille) {                                        // 面格子: the aluminium bars over a ground floor bathroom window
      g.mat(C.alu, T.metal);
      const n = Math.max(3, Math.round(ww / 0.11));
      for (let k = 0; k <= n; k++) g.box(x - ww / 2 - 0.02 + k * (ww + 0.04) / n, y, 0.13, 0.018, wh + 0.12, 0.018, 55);
      g.box(x, y + wh / 2 + 0.04, 0.13, ww + 0.1, 0.03, 0.03, 55); g.box(x, y - wh / 2 - 0.04, 0.13, ww + 0.1, 0.03, 0.03, 55);
      for (const sx of [-1, 1]) g.box(x + sx * (ww / 2 + 0.04), y + wh / 2 + 0.04, 0.07, 0.03, 0.03, 0.12, 55), g.box(x + sx * (ww / 2 + 0.04), y - wh / 2 - 0.04, 0.07, 0.03, 0.03, 0.12, 55);
    }
    if (opt.shutter) {                                       // the shutter box over a sweeping window, its guide rails down both jambs
      g.mat(mul(fr, 1.15), T.metal);
      g.box(x, y + wh / 2 + 0.17, 0.12, ww + 0.16, 0.24, 0.22, 55);
      g.box(x - ww / 2 - 0.05, y, 0.1, 0.05, wh, 0.06, 55); g.box(x + ww / 2 + 0.05, y, 0.1, 0.05, wh, 0.06, 55);
      if (opt.shutterDown > 0) {                              // the slats, down as far as the household left them
        const sh = wh * opt.shutterDown;
        g.mat(opt.shutterCol || hex(0xb8bcbe), T.seam | ROT).quad([x - ww / 2, y + wh / 2 - sh, 0.09], [x + ww / 2, y + wh / 2 - sh, 0.09], [x + ww / 2, y + wh / 2, 0.09], [x - ww / 2, y + wh / 2, 0.09]);
        g.mat(mul(fr, 0.8), T.metal).box(x, y + wh / 2 - sh, 0.1, ww, 0.04, 0.05, 55);
      }
    }
    if (opt.shoji) {                                         // an old house: the shoji's fine grid behind the glass
      g.mat(C.paper, T.paper, key).quad([x - ww / 2, y - wh / 2, 0.006], [x + ww / 2, y - wh / 2, 0.006], [x + ww / 2, y + wh / 2, 0.006], [x - ww / 2, y + wh / 2, 0.006]);
      g.mat(C.woodDark, T.timber);
      const nx = Math.max(2, Math.round(ww / 0.3)), ny = Math.max(2, Math.round(wh / 0.26));
      for (let k = 1; k < nx; k++) g.box(x - ww / 2 + k * ww / nx, y, 0.02, 0.02, wh, 0.02, 16);
      for (let k = 1; k < ny; k++) g.box(x, y - wh / 2 + k * wh / ny, 0.02, ww, 0.02, 0.02, 16);
    }
    if (opt.koshi) {                                         // 格子: the close timber lattice over a machiya's street windows
      g.mat(C.woodDark, T.timber | ROT);
      const n = Math.max(4, Math.round(ww / 0.075));
      for (let k = 0; k <= n; k++) g.box(x - ww / 2 + k * ww / n, y, 0.1, 0.035, wh + 0.1, 0.05, 55);
      g.box(x, y + wh / 2 + 0.07, 0.1, ww + 0.1, 0.06, 0.07, 55); g.box(x, y - wh / 2 - 0.07, 0.1, ww + 0.1, 0.06, 0.07, 55);
      g.box(x, y, 0.13, ww + 0.04, 0.035, 0.03, 55);
    }
  }
  function door(D, g, x, opt) {
    const r = D.r, w = opt.w || 0.95, h = opt.h || 2.2, y0 = opt.y0 || 0.42;
    const leaf = opt.col || hex(pick(r, D.old ? [0x5a4232, 0x3a2a20, 0x6e5a48] : [0x6a4a34, 0x3a3c3e, 0xe8e6e0, 0x8a6a4c, 0x2a3a4a, 0x7a5c40]));
    // the frame, the leaf set a few centimetres back, a long pull handle, the key cylinders, a frosted sidelight on the latch side
    g.mat(D.frame, T.metal);
    g.box(x, y0 + h + 0.04, 0.05, w + 0.16, 0.08, 0.1); g.box(x - w / 2 - 0.04, y0 + h / 2, 0.05, 0.08, h, 0.1); g.box(x + w / 2 + 0.04, y0 + h / 2, 0.05, 0.08, h, 0.1);
    if (opt.sliding) {                                        // the old house's glazed timber sliding door (引き戸), two leaves with a lattice
      g.mat(C.glassFrost, T.glass, opt.key || 0).quad([x - w / 2, y0, 0.02], [x + w / 2, y0, 0.02], [x + w / 2, y0 + h, 0.02], [x - w / 2, y0 + h, 0.02]);
      g.mat(leaf, T.timber | ROT);
      for (let k = 0; k <= 6; k++) g.box(x - w / 2 + k * w / 6, y0 + h / 2, 0.035, 0.035, h, 0.03, 55);
      for (let k = 0; k <= 8; k++) g.box(x, y0 + k * h / 8, 0.035, w, 0.035, 0.03, 55);
      g.box(x, y0 + h / 2, 0.05, 0.05, h, 0.04, 55);
    } else {
      g.mat(leaf, opt.timber ? (T.timber | ROT) : T.metal).box(x, y0 + h / 2, 0.025, w, h, 0.05, 55);
      g.mat(mul(leaf, 0.8), T.metal);                        // two raised panels' edges (the moulding) on the leaf
      for (const py of [0.3, 0.72]) g.box(x - 0.06, y0 + h * py, 0.055, w * 0.6, h * 0.34, 0.012, 21);
      g.mat(C.alu, T.metal).box(x + w / 2 - 0.12, y0 + 1.0, 0.1, 0.03, 0.9, 0.03, 55);
      g.box(x + w / 2 - 0.12, y0 + 0.66, 0.065, 0.02, 0.02, 0.06, 55); g.box(x + w / 2 - 0.12, y0 + 1.36, 0.065, 0.02, 0.02, 0.06, 55);
      g.mat(C.black, T.metal).box(x + w / 2 - 0.12, y0 + 1.1, 0.06, 0.04, 0.04, 0.012, 16);
      g.box(x + w / 2 - 0.12, y0 + 0.92, 0.06, 0.04, 0.04, 0.012, 16);
      if (opt.sidelight) { g.mat(C.glassFrost, T.glass, opt.key || 0).box(x + w / 2 + 0.2, y0 + h / 2, 0.02, 0.24, h - 0.1, 0.02, 16); g.mat(D.frame, T.metal).box(x + w / 2 + 0.34, y0 + h / 2, 0.05, 0.05, h, 0.1); }
    }
    // the porch: steps up from the path, a tiled landing, the canopy over it on brackets, a lamp, the intercom and the nameplate
    const pw = w + 0.9;
    if (!opt.noPorch) {
      g.mat(C.concrete, T.concrete).stand(x, 0, 0.5, pw, 0.42, 1.0, 55);
      g.mat(hex(0x9a9288), T.slate).box(x, 0.43, 0.5, pw - 0.02, 0.02, 0.98, 4);
      g.mat(C.concrete, T.concrete).stand(x, 0, 1.15, pw - 0.2, 0.21, 0.3, 55);
    }
    if (!opt.noCanopy) {
      g.mat(D.old ? C.woodDark : D.frame, D.old ? T.timber : T.metal).box(x, y0 + h + 0.38, 0.55, pw + 0.3, 0.08, 1.1);
      g.mat(D.old ? hex(0x6a727a) : C.alu, D.old ? T.kawara : T.metal).box(x, y0 + h + 0.44, 0.55, pw + 0.32, 0.03, 1.12, 4);
      g.mat(D.frame, T.metal); for (const sx of [-1, 1]) g.rod([x + sx * pw / 2, y0 + h + 0.34, 0.04], [x + sx * pw / 2, y0 + h - 0.1, 0.04], 0.02, 4), g.rod([x + sx * pw / 2, y0 + h + 0.34, 0.04], [x + sx * pw / 2, y0 + h + 0.34, 0.9], 0.015, 4);
    }
    g.mat(D.frame, T.metal).box(x - w / 2 - 0.35, y0 + 1.9, 0.07, 0.14, 0.2, 0.12, 55);
    g.mat(hex(0xf4ead8), T.glass, 1).box(x - w / 2 - 0.35, y0 + 1.88, 0.135, 0.1, 0.12, 0.012, 16);
    g.mat(C.offwhite, T.plastic).box(x + w / 2 + (opt.sidelight ? 0.6 : 0.35), y0 + 1.35, 0.03, 0.1, 0.16, 0.04, 55);
    g.mat(C.black, T.glass).box(x + w / 2 + (opt.sidelight ? 0.6 : 0.35), y0 + 1.39, 0.052, 0.03, 0.03, 0.01, 16);
    g.mat(C.alu, T.metal).box(x + w / 2 + (opt.sidelight ? 0.6 : 0.35), y0 + 1.31, 0.052, 0.04, 0.04, 0.01, 16);
  }

  // the openings of one side, floor by floor, worked out from the household's rooms
  function openings(D, g, fine, sb) {
    const r = D.r, H = D.H, fH = (H - 0.45) / D.floors, pur = D.purpose;
    const lit = () => D.empty ? 0 : 1 + Math.floor(r() * 254);
    const curtain = () => D.empty ? 0.5 : r() < 0.7 ? lerp(0.25, 0.7, r()) : 0;
    const shutDown = () => D.empty ? (r() < 0.8 ? 1 : 0.6) : pur.shutUp && r() < 0.5 ? 1 : r() < 0.12 ? 1 : r() < 0.15 ? 0.4 : 0;
    const timberHouse = D.region === "nara" || (D.old && D.wall.a.tile === T.timber);
    const cur = hex(pick(r, [0xf2ece0, 0xe8dcc0, 0xd8d0c8, 0xc8d4dc, 0xe6e0d0, 0xb8a890]));
    const shc = hex(pick(r, [0xb8bcbe, 0x9a9a94, 0xd0ccc0, 0x7a7670, 0xc8c4b8]));
    D.doorX = 0; D.doorSet = false;
    for (let s = 0; s < 4; s++) {
      const len = s < 2 ? D.w : D.d;
      for (let f = 0; f < D.floors; f++) {
        const y0 = 0.45 + f * fH;
        // the bays: what this wall has, left to right. Front: the living room's big windows, the door; back: kitchen and bath; sides: stairs, toilet, the odd small window
        const bays = [];
        if (s === 0 && f === 0) {
          if (pur.shop) bays.push({ k: "shopfront", w: Math.min(len * 0.62, 5.2) });
          if (pur.apartment) { for (let i = 0; i < 3; i++) bays.push({ k: "flatdoor", w: 0.85 }, { k: "small", w: 0.6 }); }
          else {
            const doorFirst = r() < 0.5;
            if (doorFirst) bays.push({ k: "door", w: 1.2 });
            if (!pur.shop) bays.push({ k: timberHouse ? "koshi" : "sweep", w: lerp(1.6, 2.6, r()) });
            if (pur.twoDoors) bays.push({ k: "door", w: 1.2 });
            if (!doorFirst) bays.push({ k: "door", w: 1.2 });
            if (len > 7.5 && !pur.shop) bays.push({ k: "small", w: 0.6 });
          }
        } else if (s === 0) {
          if (pur.apartment) { for (let i = 0; i < 3; i++) bays.push({ k: "flatdoor", w: 0.85 }, { k: "small", w: 0.6 }); }
          else { bays.push({ k: timberHouse ? "mushiko" : "window", w: lerp(1.2, 1.8, r()) }); if (len > 6.5) bays.push({ k: timberHouse ? "mushiko" : "window", w: lerp(1.2, 1.7, r()) }); if (len > 9) bays.push({ k: "small", w: 0.6 }); }
        } else if (s === 1) {
          if (pur.apartment) { for (let i = 0; i < 3; i++) bays.push({ k: "sweep", w: 1.7 }); }
          else if (f === 0) { bays.push({ k: "kitchen", w: 1.2 }, { k: "bath", w: 0.7 }); if (len > 7) bays.push({ k: "sweep", w: 1.7 }); }
          else { bays.push({ k: "window", w: 1.6 }); if (len > 7) bays.push({ k: "window", w: 1.2 }); }
        } else {
          if (f === 0) { bays.push({ k: "toilet", w: 0.45 }); if (len > 7) bays.push({ k: "window", w: 1.2 }); }
          else { bays.push({ k: "stair", w: 0.7 }); if (len > 7.5 && r() < 0.6) bays.push({ k: "window", w: 1.2 }); }
        }
        const gap = (len - bays.reduce((a, b) => a + b.w, 0)) / (bays.length + 1);
        if (gap < 0.25) bays.length = Math.max(1, bays.length - 1);
        let u = -len / 2 + Math.max(0.3, gap);
        for (const b of bays) {
          const x = u + b.w / 2; u += b.w + Math.max(0.3, gap);
          g.push(...sidePos(D, s, x, 0), sideYaw(s));
          switch (b.k) {
            case "door": door(D, g, 0, { sidelight: !D.old && r() < 0.6, sliding: D.old && r() < 0.7, key: 1, timber: D.old }); if (!D.doorSet) { D.doorX = x; D.doorSet = true; } else D.door2 = x; break;
            case "flatdoor": door(D, g, 0, { w: 0.8, h: 2.0, y0: y0, noCanopy: true, noPorch: true, key: lit(), col: hex(pick(r, [0xc8c0b0, 0x7a6a5a, 0xd8d4cc])) }); break;
            case "sweep": sash(D, g, 0, y0 + 1.05, b.w, 1.9, { key: lit(), curtain: curtain(), curtainCol: cur, shutter: !timberHouse, shutterDown: shutDown(), shutterCol: shc }); break;
            case "window": sash(D, g, 0, y0 + 1.45, b.w, 1.1, { key: lit(), curtain: curtain(), curtainCol: cur, shutter: !timberHouse && r() < 0.6, shutterDown: shutDown(), shutterCol: shc, shoji: timberHouse }); break;
            case "small": sash(D, g, 0, y0 + 1.6, b.w, 0.8, { key: lit(), frost: true, grille: f === 0 }); break;
            case "kitchen": sash(D, g, 0, y0 + 1.5, b.w, 0.85, { key: lit(), frost: r() < 0.4, grille: r() < 0.4 }); break;
            case "bath": sash(D, g, 0, y0 + 1.75, b.w, 0.6, { key: lit(), frost: true, grille: true }); break;
            case "toilet": sash(D, g, 0, y0 + 1.75, b.w, 0.45, { key: lit(), frost: true, grille: true }); break;
            case "stair": sash(D, g, 0, y0 + 0.6, b.w, 1.0, { key: lit(), frost: true }); break;
            case "koshi": sash(D, g, 0, y0 + 1.15, b.w, 1.45, { key: lit(), koshi: true, shoji: true }); break;
            case "mushiko": {                                  // 虫籠窓: the low upper storey's plastered slit windows
              const ww = b.w, wh = Math.min(0.7, fH * 0.32), y = y0 + fH * 0.5;
              g.mat(hex(0x2a2420), T.plaster, lit()).quad([-ww / 2, y - wh / 2, 0.01], [ww / 2, y - wh / 2, 0.01], [ww / 2, y + wh / 2, 0.01], [-ww / 2, y + wh / 2, 0.01]);
              g.mat(mul(D.wall.colA, 0.95), T.plaster);
              const n = Math.max(4, Math.round(ww / 0.12));
              for (let k = 0; k <= n; k++) g.box(-ww / 2 + k * ww / n, y, 0.04, 0.05, wh, 0.07, 55);
              g.box(0, y + wh / 2 + 0.05, 0.05, ww + 0.16, 0.1, 0.1); g.box(0, y - wh / 2 - 0.05, 0.05, ww + 0.16, 0.1, 0.1);
              break;
            }
            case "shopfront": shopfront(D, g, fine, sb, b.w, y0, fH); break;
          }
          g.pop();
        }
        // the eave of a timber house's ground floor: a pent roof (庇) the length of the front, tiled
        if (timberHouse && f === 0 && D.floors > 1 && (s === 0 || (s === 1 && r() < 0.4))) {
          g.push(...sidePos(D, s, 0, 0), sideYaw(s));
          pent(D, g, len, y0 + fH - 0.05, 0.9);
          g.pop();
        }
      }
    }
  }
  // a pent roof (下屋 / 庇) along a wall: a short tiled slope on rafters, its gutter
  function pent(D, g, len, y, depth) {
    const drop = depth * 0.4;
    g.mat(C.woodDark, T.timber);
    for (let k = 0; k <= Math.round(len / 0.45); k++) g.box(-len / 2 + k * len / Math.round(len / 0.45), y - drop / 2 - 0.05, depth / 2, 0.05, 0.07, depth + 0.1, 55);
    g.mat(D.roof.cover === "kawara" ? D.roof.col : hex(0x6a727a), T.kawara | ROT);
    g.quad([-len / 2 - 0.1, y - drop, depth + 0.08], [len / 2 + 0.1, y - drop, depth + 0.08], [len / 2 + 0.1, y + 0.05, 0], [-len / 2 - 0.1, y + 0.05, 0]);
    g.mat(D.roof.col, T.kawara);
    const n = Math.round(len / 0.3);
    for (let k = 0; k <= n; k++) { const x = -len / 2 + k * len / n; g.rod([x, y - drop + 0.03, depth + 0.08], [x, y + 0.08, 0], 0.045, 5); }
    g.mat(C.woodDark, T.timber).box(0, y - drop - 0.06, depth + 0.06, len + 0.2, 0.14, 0.05);
  }

  // a shop front: aluminium glazing floor to the fascia, the sign board over it, the roller shutter's box, an awning
  function shopfront(D, g, fine, sb, w, y0, fH) {
    const r = D.r, pur = D.purpose, h = Math.min(2.5, fH - 0.35), y = y0;
    // the glazing: a bay of tall panes with the door in the middle, frames a few centimetres
    const panes = Math.max(2, Math.round(w / 1.2));
    g.mat(C.glassDark, T.glass, 1 + Math.floor(r() * 80)).quad([-w / 2, y, 0.01], [w / 2, y, 0.01], [w / 2, y + h, 0.01], [-w / 2, y + h, 0.01]);
    g.mat(pur.workshop ? hex(0x2a2826) : C.alu, T.metal);
    if (pur.workshop) {                                       // a workshop is open to the street: the shutter up, the dark of the shop behind
      g.mat(hex(0x302c28), T.concrete, 1 + Math.floor(r() * 60)).quad([-w / 2, y, 0.015], [w / 2, y, 0.015], [w / 2, y + h, 0.015], [-w / 2, y + h, 0.015]);
      g.mat(hex(0x5a5650), T.concrete).box(0, y + 0.01, 0.4, w, 0.02, 0.8, 4);
    } else {
      for (let k = 0; k <= panes; k++) g.box(-w / 2 + k * w / panes, y + h / 2, 0.04, 0.05, h, 0.06, 55);
      g.box(0, y + 0.06, 0.04, w, 0.12, 0.08, 55); g.box(0, y + h - 0.03, 0.04, w, 0.06, 0.08, 55); g.box(0, y + 0.95, 0.04, w, 0.04, 0.05, 55);
      g.mat(C.alu, T.metal).box(-0.05, y + 1.05, 0.08, 0.03, 0.5, 0.03, 55); g.box(0.05, y + 1.05, 0.08, 0.03, 0.5, 0.03, 55);
    }
    // the shutter box and the guide rails, and the shutter itself part way down out of hours for the look of it
    g.mat(hex(0x8a8c8e), T.metal).box(0, y + h + 0.16, 0.14, w + 0.2, 0.3, 0.26);
    g.box(-w / 2 - 0.06, y + h / 2, 0.08, 0.05, h, 0.06, 55); g.box(w / 2 + 0.06, y + h / 2, 0.08, 0.05, h, 0.06, 55);
    // the fascia and the sign on it
    const sgn = D.signs[0];
    if (sgn) {
      g.mat(hex(0x2a2826), T.metal).box(0, y + h + 0.6, 0.12, w + 0.3, 0.6, 0.12);
      sb.board(g, signSlot(Object.assign({ seed: D.seed + sgn.text }, sgn)), 0, y + h + 0.6, 0.185, w + 0.1, Math.min(0.55, (w + 0.1) / 4), 0);
      // a little projecting board too, so it reads from up the street
      g.mat(C.alu, T.metal).rod([w / 2 + 0.1, y + h + 0.95, 0.05], [w / 2 + 0.1, y + h + 0.95, 0.75], 0.02, 4);
      g.box(w / 2 + 0.1, y + h + 0.65, 0.42, 0.06, 0.62, 0.64);
      sb.board(g, signSlot(Object.assign({ seed: D.seed + sgn.text }, sgn)), w / 2 + 0.135, y + h + 0.65, 0.42, 0.6, 0.15, Math.PI / 2);
      sb.board(g, signSlot(Object.assign({ seed: D.seed + sgn.text }, sgn)), w / 2 + 0.065, y + h + 0.65, 0.42, 0.6, 0.15, -Math.PI / 2);
    }
    // a café or a tobacconist: a canvas awning on its arms, a scalloped valance
    if (pur.awning || pur.id === "tobacco") {
      const ac = hex(pick(r, [0x2e5a3a, 0x7a2a24, 0x2a3a5a, 0xc8b89a]));
      g.mat(ac, T.cloth).quad([-w / 2 - 0.1, y + h + 0.0, 1.1], [w / 2 + 0.1, y + h + 0.0, 1.1], [w / 2 + 0.1, y + h + 0.35, 0.05], [-w / 2 - 0.1, y + h + 0.35, 0.05]);
      g.quad([w / 2 + 0.1, y + h + 0.0, 1.1], [-w / 2 - 0.1, y + h + 0.0, 1.1], [-w / 2 - 0.1, y + h + 0.35, 0.05], [w / 2 + 0.1, y + h + 0.35, 0.05]);
      const n = Math.round(w / 0.25);
      for (let k = 0; k < n; k++) g.box(-w / 2 + (k + 0.5) * w / n, y + h - 0.12, 1.1, w / n - 0.02, 0.22, 0.01, 48);
      g.mat(C.steel, T.metal); for (const sx of [-1, 1]) g.rod([sx * (w / 2), y + h - 0.6, 0.04], [sx * (w / 2), y + h, 1.08], 0.015, 4);
    }
    // the noren curtain at a timber shop's door
    if (D.region === "nara" || pur.id === "sake" || pur.id === "teashop") {
      const nc = hex(pick(r, [0x23305a, 0x5a2a20, 0x2a3a2a, 0xe8dcc0]));
      g.mat(C.woodDark, T.timber).rod([-0.6, y + 2.05, 0.18], [0.6, y + 2.05, 0.18], 0.02, 5);
      g.mat(nc, T.cloth); for (let k = 0; k < 3; k++) g.box(-0.4 + k * 0.4, y + 1.7, 0.18, 0.38, 0.7, 0.01, 48);
    }
  }

  // ---- the roof -------------------------------------------------------------------------------------------------------------
  function roof(D, g) {
    const R = D.roof, H = D.H, ov = R.ov, w = D.w + E * 2, d = D.d + E * 2, r = D.r;
    const thick = 0.14, fascia = D.old ? C.woodDark : mul(D.frame, 1.1);
    const tile = R.cover === "kawara" ? T.kawara : R.cover === "slate" ? T.slate : T.seam;
    D.slopes = [];
    if (R.type === "flat") { flatRoof(D, g); return; }
    const wallMat = () => g.mat(mul(D.wall.colB, D.dirt), D.wall.b.tile | (D.wall.b.rot ? ROT : 0));
    // The slopes as planes: [eave left, eave right, top right, top left] in house space, and the downslope direction.
    // The roof bears on the wall plates: at the wall line its underside is at H, so the eave drops below that by ov x pitch.
    const sl = D.slopes;
    if (R.type === "shed") {
      const k = R.pitch, back = r() < 0.5, run = d + ov * 2, rise = run * k;
      const zf = d / 2 + ov, zb = -d / 2 - ov, yl = H - ov * k, yh = yl + rise;
      const L = -w / 2 - ov, Rr = w / 2 + ov;
      sl.push(back ? { q: [[Rr, yl, zb], [L, yl, zb], [L, yh, zf], [Rr, yh, zf]], down: [0, 0, -1], ridgeX: true }
                   : { q: [[L, yl, zf], [Rr, yl, zf], [Rr, yh, zb], [L, yh, zb]], down: [0, 0, 1], ridgeX: true });
      const yAt = z => yl + k * (back ? z - zb : zf - z);
      wallMat();
      const zA = -d / 2, zB = d / 2;
      g.quad([w / 2, H, zB], [w / 2, H, zA], [w / 2, yAt(zA), zA], [w / 2, yAt(zB), zB]);
      g.quad([-w / 2, H, zA], [-w / 2, H, zB], [-w / 2, yAt(zB), zB], [-w / 2, yAt(zA), zA]);
      const zh = back ? zB : zA, yh2 = yAt(zh);
      if (back) g.quad([-w / 2, H, zh], [w / 2, H, zh], [w / 2, yh2, zh], [-w / 2, yh2, zh]);
      else g.quad([w / 2, H, zh], [-w / 2, H, zh], [-w / 2, yh2, zh], [w / 2, yh2, zh]);
      // modern shed roofs nearly always have a strip of high windows under the top
      if (D.modern && yh2 - H > 0.5) { g.push(0, 0, zh, back ? 0 : Math.PI); sash(D, g, 0, H + (yh2 - H) * 0.5, Math.min(w * 0.6, 3.2), (yh2 - H) * 0.5, { key: 1 + Math.floor(r() * 200) }); g.pop(); }
      // the barge boards up both sloping edges
      g.mat(fascia, D.old ? T.timber : T.metal);
      for (const sx of [-1, 1]) g.rod([sx * (w / 2 + ov), yl - 0.04, back ? zb : zf], [sx * (w / 2 + ov), yh - 0.04, back ? zf : zb], 0.08, 4);
    } else {
      const alongX = R.type === "hip" ? w >= d : (w >= d ? r() < 0.8 : r() < 0.25);
      const span = alongX ? d : w, len = alongX ? w : d;
      const half = len / 2 + ov, s2 = span / 2 + ov, yE = H - ov * R.pitch, top = H + span / 2 * R.pitch;
      const ridgeHalf = R.type === "hip" ? Math.max(0.05, half - s2) : half;
      // built where the ridge runs along x, then turned a quarter if it runs along z
      const M = alongX ? (p => p) : (p => [-p[2], p[1], p[0]]);
      const base = { ridgeX: alongX, hip: R.type === "hip", half: half, ridgeHalf: ridgeHalf, s2: s2 };
      sl.push(Object.assign({ q: [[-half, yE, s2], [half, yE, s2], [ridgeHalf, top, 0], [-ridgeHalf, top, 0]].map(M), down: M([0, 0, 1]) }, base));
      sl.push(Object.assign({ q: [[half, yE, -s2], [-half, yE, -s2], [-ridgeHalf, top, 0], [ridgeHalf, top, 0]].map(M), down: M([0, 0, -1]) }, base));
      if (R.type === "hip") {
        sl.push({ q: [[half, yE, s2], [half, yE, -s2], [ridgeHalf, top, 0], [ridgeHalf, top, 0]].map(M), down: M([1, 0, 0]), ridgeX: !alongX, tri: true });
        sl.push({ q: [[-half, yE, -s2], [-half, yE, s2], [-ridgeHalf, top, 0], [-ridgeHalf, top, 0]].map(M), down: M([-1, 0, 0]), ridgeX: !alongX, tri: true });
      } else {
        // the gable ends: a triangle of wall from the plates to the ridge, the barge boards up the rakes
        const lw = len / 2, sw2 = span / 2;
        wallMat();
        for (const sx of [-1, 1]) g.tri(M([sx * lw, H, sx * sw2]), M([sx * lw, H, -sx * sw2]), M([sx * lw, top, 0]));
        // a small louvred vent high in each gable (妻換気)
        g.mat(D.frame, T.metal);
        for (const sx of [-1, 1]) { const p = M([sx * (lw + 0.03), H + (top - H) * 0.55, 0]); g.box(p[0], p[1], p[2], alongX ? 0.06 : 0.36, 0.26, alongX ? 0.36 : 0.06, 55); }
        g.mat(fascia, D.old ? T.timber : T.metal);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.rod(M([sx * (half + 0.02), yE - 0.06, sz * (s2 + 0.02)]), M([sx * (half + 0.02), top + 0.0, 0]), 0.085, 4);
      }
    }
    // each slope: the covering, the soffit under it, the fascia along the eave, the covering's relief, the gutter, the rafters
    sl.forEach(S => {
      const [a, b, c, dd] = S.q;
      g.mat(mul(R.col, D.dirt), tile | (S.ridgeX ? 0 : ROT));
      if (S.tri) g.tri(a, b, c); else g.quad(a, b, c, dd);
      g.mat(D.old ? C.woodDark : mul(C.soffit, 1.1), D.old ? T.timber : T.plaster);
      if (S.tri) g.tri([b[0], b[1] - thick, b[2]], [a[0], a[1] - thick, a[2]], [c[0], c[1] - thick, c[2]]);
      else g.quad([b[0], b[1] - thick, b[2]], [a[0], a[1] - thick, a[2]], [dd[0], dd[1] - thick, dd[2]], [c[0], c[1] - thick, c[2]]);
      g.mat(fascia, D.old ? T.timber : T.metal);
      const o = 0.01;
      g.quad([a[0] + S.down[0] * o, a[1] - thick - 0.06, a[2] + S.down[2] * o], [b[0] + S.down[0] * o, b[1] - thick - 0.06, b[2] + S.down[2] * o], [b[0] + S.down[0] * o, b[1] + 0.02, b[2] + S.down[2] * o], [a[0] + S.down[0] * o, a[1] + 0.02, a[2] + S.down[2] * o]);
      cover(D, g, S, tile);
      gutter(D, g, a, b, S.down);
      // the rafter tails under an old house's deep eave (垂木), close set
      if (D.old && !S.tri) {
        g.mat(C.woodDark, T.timber);
        const L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.round(L / 0.45);
        for (let k = 1; k < n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t; g.rod([x, a[1] - thick - 0.03, z], [x - S.down[0] * ov, a[1] - thick - 0.03 + ov * R.pitch, z - S.down[2] * ov], 0.035, 4); }
      }
    });
    ridge(D, g, sl, tile);
    roofKit(D, g, sl);
  }
  // the covering's relief on one slope, built as geometry: every roll of a kawara roof, every course of slate, every seam of galvalume
  function cover(D, g, S, tile) {
    const [a, b, c, dd] = S.q, R = D.roof;
    const eL = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (eL < 0.5) return;
    const ux = (b[0] - a[0]) / eL, uz = (b[2] - a[2]) / eL;
    // the slope's length from the eave to the top along the fall line
    const top = S.tri ? c : dd, rise = top[1] - a[1], run = Math.abs((top[0] - a[0]) * S.down[0] + (top[2] - a[2]) * S.down[2]);
    const slopeL = Math.hypot(rise, run);
    if (slopeL < 0.3) return;
    const up = [-S.down[0] * run / slopeL, rise / slopeL, -S.down[2] * run / slopeL];          // unit vector up the slope
    const nrm = [S.down[0] * rise / slopeL, run / slopeL, S.down[2] * rise / slopeL];          // the slope's outward normal
    // how far up the slope the covering reaches at u along the eave (a hip end narrows; a hip side's ends are cut back)
    const reach = u => {
      if (S.tri) { const m = eL / 2, k = 1 - Math.abs(u - m) / m; return slopeL * clamp(k, 0, 1); }
      if (S.hip) { const cut = (S.half - S.ridgeHalf); const e = Math.min(u, eL - u); return slopeL * clamp(e / Math.max(0.01, cut), 0, 1); }
      return slopeL;
    };
    const at = (u, t, lift) => [a[0] + ux * u + up[0] * t + nrm[0] * lift, a[1] + up[1] * t + nrm[1] * lift, a[2] + uz * u + up[2] * t + nrm[2] * lift];
    g.mat(mul(R.col, D.dirt * 1.02), tile | (S.ridgeX ? 0 : ROT));
    if (R.cover === "kawara") {
      // the rolls, one every 0.3 m, each a half-round running down the slope, its round end (the manju) at the eave
      const n = Math.floor(eL / 0.3);
      for (let k = 0; k <= n; k++) {
        const u = (k + 0.5) * eL / (n + 1), L = reach(u) - 0.05; if (L < 0.2) continue;
        g.rod(at(u, -0.02, 0.0), at(u, L, 0.0), 0.06, 5);
      }
      // the bottom course's front edge, a little thicker
      g.mat(mul(R.col, 0.85), tile);
      g.rod(at(0, 0.0, 0.02), at(eL, 0.0, 0.02), 0.035, 4);
    } else if (R.cover === "slate") {
      // courses every 0.25 m: the butt edge of each a small step, with the snow guards (雪止め) a few courses up
      const n = Math.floor(slopeL / 0.25);
      for (let k = 1; k < n; k++) {
        const t = k * 0.25;
        let u0 = 0, u1 = eL;
        if (S.tri || S.hip) { const m = eL / 2; const ok = u => reach(u) > t; while (u0 < m && !ok(u0)) u0 += 0.1; while (u1 > m && !ok(u1)) u1 -= 0.1; if (u1 - u0 < 0.2) continue; }
        const p0 = at(u0, t, 0.012), p1 = at(u1, t, 0.012), p2 = at(u1, t + 0.02, 0.0), p3 = at(u0, t + 0.02, 0.0);
        g.quad(p0, p1, [p1[0] - nrm[0] * 0.012, p1[1] - nrm[1] * 0.012, p1[2] - nrm[2] * 0.012], [p0[0] - nrm[0] * 0.012, p0[1] - nrm[1] * 0.012, p0[2] - nrm[2] * 0.012]);
        void p2; void p3;
        if (k === 3 || k === 7) {
          g.mat(C.alu, T.metal);
          for (let u = u0 + 0.3; u < u1 - 0.2; u += 0.45) { const p = at(u, t + 0.05, 0.03); g.box(p[0], p[1], p[2], 0.04, 0.06, 0.04, 55); }
          g.mat(mul(R.col, D.dirt * 1.02), tile | (S.ridgeX ? 0 : ROT));
        }
      }
    } else {
      // standing seams down the slope every 0.45 m
      const n = Math.floor(eL / 0.45);
      for (let k = 1; k <= n; k++) {
        const u = k * eL / (n + 1), L = reach(u); if (L < 0.2) continue;
        const p0 = at(u, 0, 0.02), p1 = at(u, L, 0.02);
        g.rod(p0, p1, 0.018, 4);
      }
    }
  }
  function gutter(D, g, a, b, down) {
    // a half-round gutter hung off the fascia, its hangers every 0.9 m; the downpipe is placed with the walls
    const out = 0.09, y = a[1] - 0.2, L = Math.hypot(b[0] - a[0], b[2] - a[2]); if (L < 0.5) return;
    const p0 = [a[0] + down[0] * out, y, a[2] + down[2] * out], p1 = [b[0] + down[0] * out, y, b[2] + down[2] * out];
    const gc = D.old ? hex(0x7a7e82) : hex(pick(D.r, [0x3a3836, 0xe6e4de, 0x6a5a4a, 0x2a2a2c]));
    g.mat(gc, T.plastic).rod(p0, p1, 0.065, 6);
    g.mat(mul(gc, 0.7), T.metal);
    const n = Math.round(L / 0.9);
    for (let k = 1; k < n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t; g.rod([x - down[0] * 0.02, y + 0.13, z - down[2] * 0.02], [x + down[0] * (out + 0.06), y + 0.05, z + down[2] * (out + 0.06)], 0.01, 3); }
    // the end caps
    g.mat(gc, T.plastic).cyl(p0[0], p0[1], p0[2], 0.068, 0.02, 6, Math.abs(b[0] - a[0]) > Math.abs(b[2] - a[2]) ? "x" : "z");
    g.cyl(p1[0], p1[1], p1[2], 0.068, 0.02, 6, Math.abs(b[0] - a[0]) > Math.abs(b[2] - a[2]) ? "x" : "z");
    D.gutterCol = gc;
  }
  function ridge(D, g, sl, tile) {
    const R = D.roof, ss = sl.filter(s => !s.tri);
    if (R.type === "shed" || !ss.length) return;
    const S = ss[0], c = S.q[2], dd = S.q[3];
    g.mat(mul(R.col, 0.88), tile);
    if (R.cover === "kawara") {
      // the ridge: stacked tiles (のし瓦) under a round cap, the demon tiles (鬼瓦) at each end
      const L = Math.hypot(c[0] - dd[0], c[2] - dd[2]);
      if (L > 0.1) {
        g.push((c[0] + dd[0]) / 2, c[1], (c[2] + dd[2]) / 2, Math.abs(c[0] - dd[0]) > Math.abs(c[2] - dd[2]) ? 0 : Math.PI / 2);
        for (let k = 0; k < 3; k++) g.box(0, 0.05 + k * 0.07, 0, L + 0.1, 0.06, 0.32 - k * 0.04, 55);
        g.cyl(0, 0.3, 0, 0.1, L + 0.2, 6, "x", 0.1, 3);
        for (const sx of [-1, 1]) { g.box(sx * (L / 2 + 0.12), 0.25, 0, 0.12, 0.5, 0.42, 55); g.box(sx * (L / 2 + 0.12), 0.5, 0, 0.1, 0.12, 0.3, 55); }
        g.pop();
      }
    } else {
      const L = Math.hypot(c[0] - dd[0], c[2] - dd[2]);
      if (L > 0.1) { g.push((c[0] + dd[0]) / 2, c[1], (c[2] + dd[2]) / 2, Math.abs(c[0] - dd[0]) > Math.abs(c[2] - dd[2]) ? 0 : Math.PI / 2); g.mat(mul(R.col, 0.8), T.metal); g.box(0, 0.04, 0, L + 0.06, 0.08, 0.3, 55); g.box(0, 0.09, 0, L + 0.06, 0.03, 0.1, 55); g.pop(); }
    }
    // the hips' own cappings
    if (R.type === "hip") sl.filter(s => s.tri).forEach(t => { g.mat(mul(R.col, 0.85), tile); g.rod(t.q[0], t.q[2], R.cover === "kawara" ? 0.09 : 0.05, 5); g.rod(t.q[1], t.q[2], R.cover === "kawara" ? 0.09 : 0.05, 5); });
  }
  function flatRoof(D, g) {
    const w = D.w + E * 2, d = D.d + E * 2, H = D.H, r = D.r;
    // the parapet, its metal coping, a drain outlet and its pipe; a waterproofed deck with a hatch and the outdoor unit for the hot water
    g.mat(mul(D.wall.colB, D.dirt), D.wall.b.tile | (D.wall.b.rot ? ROT : 0));
    g.box(0, H + 0.35, d / 2 - 0.06, w, 0.7, 0.12); g.box(0, H + 0.35, -d / 2 + 0.06, w, 0.7, 0.12); g.box(w / 2 - 0.06, H + 0.35, 0, 0.12, 0.7, d); g.box(-w / 2 + 0.06, H + 0.35, 0, 0.12, 0.7, d);
    g.mat(C.alu, T.metal); g.box(0, H + 0.72, d / 2 - 0.06, w + 0.04, 0.04, 0.18); g.box(0, H + 0.72, -d / 2 + 0.06, w + 0.04, 0.04, 0.18); g.box(w / 2 - 0.06, H + 0.72, 0, 0.18, 0.04, d + 0.04); g.box(-w / 2 + 0.06, H + 0.72, 0, 0.18, 0.04, d + 0.04);
    g.mat(hex(0x7a7a78), T.concrete).box(0, H + 0.03, 0, w - 0.24, 0.06, d - 0.24, 4);
    g.mat(C.concDark, T.metal).box(w * 0.2, H + 0.12, -d * 0.2, 0.7, 0.18, 0.7, 55);
    D.flatTop = H + 0.06;
    void r;
  }
  function roofKit(D, g, sl) {
    const r = D.r, R = D.roof, ss = sl.filter(s => !s.tri);
    // solar: on the slope that faces the street or the longest one, in landscape rows, framed, each panel's cells lined
    if ((D.purpose.solar && r() < D.purpose.solar) || (D.modern && r() < 0.35) || (!D.old && r() < 0.12)) {
      const S = ss.reduce((a, b) => (Math.hypot(b.q[1][0] - b.q[0][0], b.q[1][2] - b.q[0][2]) > Math.hypot(a.q[1][0] - a.q[0][0], a.q[1][2] - a.q[0][2]) ? b : a), ss[0] || null);
      if (S && R.type !== "flat") solar(D, g, S);
    }
    // the aerial: on the ridge or the flat roof's corner
    if (r() < (D.old ? 0.75 : 0.45) && !D.empty) {
      let base;
      if (R.type === "flat") base = [-D.w * 0.3, D.flatTop || D.H, -D.d * 0.3];
      else if (ss.length) { const S = ss[0]; base = [(S.q[2][0] + S.q[3][0]) / 2 * 0.5, S.q[2][1], (S.q[2][2] + S.q[3][2]) / 2 * 0.5]; }
      if (base) aerial(D, g, base);
    } else if (!D.empty && r() < 0.5) {
      // the flat panel aerial on the gable wall instead (デザインアンテナ)
      g.push(...sidePos(D, 2, -D.d * 0.2, 0), sideYaw(2)); g.mat(C.offwhite, T.plastic).box(0, D.H - 0.6, 0.06, 0.45, 0.5, 0.08); g.mat(C.alu, T.metal).box(0, D.H - 0.6, 0.02, 0.06, 0.3, 0.04); g.pop();
    }
  }
  function solar(D, g, S) {
    const [a, b, c, dd] = S.q, eL = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const top = dd, rise = top[1] - a[1], run = Math.abs((top[0] - a[0]) * S.down[0] + (top[2] - a[2]) * S.down[2]), sL = Math.hypot(rise, run);
    const ux = (b[0] - a[0]) / eL, uz = (b[2] - a[2]) / eL, up = [-S.down[0] * run / sL, rise / sL, -S.down[2] * run / sL], nr = [S.down[0] * rise / sL, run / sL, S.down[2] * rise / sL];
    const at = (u, t, l) => [a[0] + ux * u + up[0] * t + nr[0] * l, a[1] + up[1] * t + nr[1] * l, a[2] + uz * u + up[2] * t + nr[2] * l];
    const pw = 1.65, ph = 0.99, cols = Math.max(0, Math.floor((eL - (S.hip ? (S.half - S.ridgeHalf) * 2 : 0.8)) / pw)), rows = Math.max(0, Math.floor((sL - 0.9) / ph));
    if (!cols || !rows) return;
    const u0 = (eL - cols * pw) / 2, t0 = 0.5;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const p = [at(u0 + i * pw + 0.02, t0 + j * ph + 0.02, 0.09), at(u0 + (i + 1) * pw - 0.02, t0 + j * ph + 0.02, 0.09), at(u0 + (i + 1) * pw - 0.02, t0 + (j + 1) * ph - 0.02, 0.09), at(u0 + i * pw + 0.02, t0 + (j + 1) * ph - 0.02, 0.09)];
      g.mat(hex(0x1e2638), T.glass).quad(p[0], p[1], p[2], p[3]);
      g.mat(C.alu, T.metal); g.path([p[0], p[1], p[2], p[3], p[0]], 0.012, 3);
      g.mat(hex(0x3a4458), T.metal);
      for (let k = 1; k < 6; k++) g.rod(at(u0 + i * pw + k * pw / 6, t0 + j * ph + 0.03, 0.095), at(u0 + i * pw + k * pw / 6, t0 + (j + 1) * ph - 0.03, 0.095), 0.004, 3);
    }
    void c;
  }
  function aerial(D, g, base) {
    const [x, y, z] = base, r = D.r, h = 2.6 + r() * 1.2, yaw = r() * Math.PI;
    g.mat(C.steel, T.metal);
    g.rod([x, y, z], [x, y + h, z], 0.022, 5);
    // guy wires to the eaves (four), turnbuckles near the foot
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + yaw * 0.3, L = 1.8 + r() * 0.6; g.rod([x, y + h * 0.7, z], [x + Math.cos(a) * L, y - 0.5, z + Math.sin(a) * L], 0.004, 3); }
    // the UHF Yagi: the boom, the reflector screen at the back, the directors (one every 8 cm, shorter toward the front)
    g.push(x, y + h - 0.15, z, yaw);
    g.rod([-0.05, 0, -0.75], [-0.05, 0, 0.75], 0.012, 4);
    for (let k = 0; k < 16; k++) { const zz = -0.6 + k * 0.08, L = 0.24 - k * 0.006; g.rod([-0.05 - L, 0, zz], [-0.05 + L, 0, zz], 0.004, 3); }
    for (let k = 0; k < 5; k++) g.rod([-0.05 - 0.3, -0.25 + k * 0.12, -0.74], [-0.05 + 0.3, -0.25 + k * 0.12, -0.74], 0.005, 3);
    g.mat(C.offwhite, T.plastic).box(-0.05, -0.04, -0.68, 0.08, 0.06, 0.08, 55);
    g.pop();
    // a BS dish lower on the mast, aimed south-west like every dish in Japan
    if (r() < 0.55) { g.push(x, y + h * 0.5, z, 0.8); g.mat(C.offwhite, T.plastic).cyl(0, 0, 0.18, 0.02, 0.1, 10, "z", 0.26, 2); g.mat(C.steel, T.metal).rod([0, 0, 0], [0, 0, 0.12], 0.015, 4).rod([0, -0.2, 0.2], [0, 0, 0.5], 0.01, 3); g.box(0, 0, 0.52, 0.06, 0.06, 0.08, 55); g.pop(); }
  }

  // ---- services on the walls ------------------------------------------------------------------------------------------------
  function services(D, g, fine) {
    const r = D.r, H = D.H, w = D.w, d = D.d, fH = (H - 0.45) / D.floors, pur = D.purpose;
    const side = r() < 0.5 ? 2 : 3, other = side === 2 ? 3 : 2;
    // the downpipes: from the gutter near a corner, back under the eave to the wall, down it to a gully; bracketed every 1.2 m
    const gc = D.gutterCol || C.pvc;
    const eaves = (D.slopes || []).filter(S => !S.tri).slice(0, 2);
    eaves.forEach((S, k) => {
      const [a, b] = S.q, L = Math.hypot(b[0] - a[0], b[2] - a[2]); if (L < 1) return;
      const t = (k ? L - 0.35 : 0.35) / L, ex = a[0] + (b[0] - a[0]) * t, ez = a[2] + (b[2] - a[2]) * t, gy = a[1] - 0.2;
      const top = [ex + S.down[0] * 0.09, gy - 0.05, ez + S.down[2] * 0.09];
      // the wall it comes back to
      const onX = Math.abs(S.down[0]) > 0.5, wx = onX ? Math.sign(S.down[0]) * (w / 2 + E + 0.06) : clamp(ex, -w / 2 + 0.15, w / 2 - 0.15), wz = onX ? clamp(ez, -d / 2 + 0.15, d / 2 - 0.15) : Math.sign(S.down[2]) * (d / 2 + E + 0.06);
      const yw = Math.min(gy - 0.45, H - 0.3);
      g.mat(gc, T.plastic).path([top, [top[0], gy - 0.25, top[2]], [wx, yw, wz], [wx, 0.25, wz], [wx + (onX ? Math.sign(S.down[0]) * 0.12 : 0), 0.08, wz + (onX ? 0 : Math.sign(S.down[2]) * 0.12)]], 0.04, 6);
      g.mat(mul(gc, 0.75), T.metal);
      for (let y = yw - 0.5; y > 0.6; y -= 1.2) g.box(wx - (onX ? Math.sign(S.down[0]) * 0.03 : 0), y, wz - (onX ? 0 : Math.sign(S.down[2]) * 0.03), onX ? 0.06 : 0.1, 0.04, onX ? 0.1 : 0.06, 55);
      fine.mat(C.concDark, T.concrete).stand(wx + (onX ? Math.sign(S.down[0]) * 0.18 : 0), 0, wz + (onX ? 0 : Math.sign(S.down[2]) * 0.18), 0.3, 0.06, 0.3, 55);
    });
    if (D.roof.type === "flat") {
      g.mat(gc, T.plastic).path([[w / 2 - 0.3, H + 0.1, d / 2 + E + 0.1], [w / 2 - 0.3, H - 0.2, d / 2 + E + 0.08], [w / 2 - 0.3, 0.1, d / 2 + E + 0.08]], 0.045, 6);
    }
    // on the service side: the electricity meter on its board with the conduit up to the eave, the gas meter and its yellow pipes,
    // the water heater or the EcoCute tank and heat pump, and the outdoor air-conditioning units (one per bedroom), their pipe covers
    const len = d;
    g.push(...sidePos(D, side, len * 0.25, 0), sideYaw(side));
    g.mat(C.offwhite, T.plastic).box(0, 1.65, 0.05, 0.36, 0.5, 0.06, 55);
    g.mat(hex(0x3a3c3e), T.metal).box(0, 1.72, 0.1, 0.2, 0.24, 0.08, 55);
    g.mat(C.glassFrost, T.glass).cyl(0, 1.72, 0.145, 0.07, 0.01, 10, "z");
    g.mat(C.pvcGrey, T.plastic).rod([0.1, 1.9, 0.04], [0.1, H - 0.25, 0.04], 0.022, 5);
    g.mat(C.black, T.plastic).cyl(0.1, H - 0.2, 0.04, 0.05, 0.08, 6, "y");
    g.pop();
    if (D.region !== "nara" || r() < 0.5) {
      fine.push(...sidePos(D, side, -len * 0.05, 0), sideYaw(side));
      fine.mat(hex(0xd8d4cc), T.metal).box(0, 1.15, 0.12, 0.32, 0.36, 0.18, 55);
      fine.mat(C.black, T.glass).box(0, 1.2, 0.215, 0.12, 0.05, 0.01, 16);
      fine.mat(C.gasYellow, T.metal).path([[-0.08, 0.97, 0.12], [-0.08, 0.6, 0.12], [-0.08, 0.6, 0.02]], 0.016, 5).path([[0.08, 0.97, 0.12], [0.08, 0.3, 0.12], [0.08, 0.0, 0.12]], 0.016, 5);
      fine.pop();
    }
    // hot water: the EcoCute tank and its heat pump on the back corner for a newer house, a wall-hung gas heater for an older one, a kerosene tank on the coast
    fine.push(...sidePos(D, side, -len * 0.38, 0), sideYaw(side));
    if (!D.old && r() < 0.55) {
      fine.mat(C.offwhite, T.plastic).stand(0, 0, 0.42, 0.62, 2.1, 0.68, 55);
      fine.mat(mul(C.offwhite, 0.85), T.plastic).box(0, 0.3, 0.77, 0.5, 0.2, 0.02, 16);
      fine.mat(C.pvcGrey, T.plastic).path([[0.2, 0.2, 0.08], [0.2, 0.2, 0.0]], 0.02, 5);
      acUnit(D, fine, 0.0, 0.0, 1.05, true);
    } else if (D.region === "coast" || (D.old && r() < 0.4)) {
      fine.mat(C.rust, T.metal).cyl(0, 0.75, 0.5, 0.32, 1.2, 10, "z", 0.32, 3);
      fine.mat(C.steel, T.metal); for (const sx of [-0.4, 0.4]) fine.rod([0, 0.45, 0.5 + sx], [0, 0, 0.5 + sx], 0.025, 4);
      fine.mat(C.copper, T.metal).path([[0, 0.45, 0.2], [0, 0.4, 0.05], [0, 1.4, 0.05]], 0.01, 4);
    } else {
      fine.mat(C.offwhite, T.plastic).box(0, 1.6, 0.13, 0.42, 0.6, 0.2, 55);
      fine.mat(C.black, T.metal).box(0, 1.85, 0.235, 0.3, 0.06, 0.01, 16);
      fine.mat(C.copper, T.metal); for (const sx of [-0.12, 0, 0.12]) fine.path([[sx, 1.3, 0.13], [sx, 1.0, 0.13], [sx, 1.0, 0.03]], 0.012, 4);
    }
    fine.pop();
    // the air-conditioners: one per bedroom upstairs (on the wall, on brackets) and one or two on the ground
    const units = D.empty ? 1 : clamp(1 + Math.round(D.folk.length * 0.6 + r()), 1, 5);
    for (let i = 0; i < units; i++) {
      const s = i % 2 ? other : (i === 0 ? 1 : side), up = D.floors > 1 && i > 0 && r() < 0.6, slen = s < 2 ? w : d;
      const u = (r() - 0.5) * slen * 0.6;
      fine.push(...sidePos(D, s, u, 0), sideYaw(s));
      acUnit(D, fine, 0, up ? 0.45 + fH + 0.3 : 0, 0.3, false, up, up ? 0.45 + fH + 1.9 : 2.1);
      fine.pop();
    }
    // vent hoods: kitchen and bathroom fans, round hoods with a down-turned lip
    for (let i = 0; i < 2 + D.floors; i++) {
      const s = [1, side, other, 1][i % 4], slen = s < 2 ? w : d;
      fine.push(...sidePos(D, s, (r() - 0.5) * slen * 0.8, 0), sideYaw(s));
      const y = 0.45 + Math.floor(r() * D.floors) * fH + 2.1;
      fine.mat(C.offwhite, T.plastic).cyl(0, y, 0.06, 0.1, 0.12, 8, "z", 0.11, 2);
      fine.mat(mul(C.offwhite, 0.6), T.plastic).box(0, y - 0.09, 0.1, 0.22, 0.03, 0.06, 55);
      fine.pop();
    }
    void pur;
  }
  // an outdoor air-conditioning unit: the case, the fan behind its round grille of rings and spokes, the fins down the side, the
  // refrigerant pipes in their cover up the wall to the room, the drain hose
  function acUnit(D, g, x, y, out, heatPump, bracket, pipeTop) {
    const r = D.r, w = heatPump ? 0.8 : lerp(0.7, 0.85, r()), h = heatPump ? 0.65 : lerp(0.5, 0.62, r()), dpt = 0.28;
    const col = hex(pick(r, [0xe8e6e0, 0xdcdad2, 0xd0cec6]));
    const yb = y + (bracket ? 0 : 0.12);
    if (bracket) { g.mat(C.steel, T.metal); for (const sx of [-1, 1]) { g.rod([x + sx * w * 0.35, yb, 0.02], [x + sx * w * 0.35, yb, out + 0.2], 0.015, 4); g.rod([x + sx * w * 0.35, yb - 0.4, 0.02], [x + sx * w * 0.35, yb, out + 0.15], 0.012, 4); } }
    else { g.mat(C.concrete, T.concrete); for (const sx of [-1, 1]) g.stand(x + sx * w * 0.3, y, out, 0.2, 0.12, 0.35, 55); }
    g.mat(mul(col, D.dirt), T.metal).stand(x, yb, out, w, h, dpt, 55);
    // the grille: a dark disc of fan, four rings and a cross over it
    const fx = x - w * 0.12, fy = yb + h / 2, fz = out + dpt / 2;
    g.mat(hex(0x2a2c2e), T.plastic).cyl(fx, fy, fz + 0.002, h * 0.38, 0.004, 14, "z");
    g.mat(mul(col, 0.92), T.metal);
    for (let k = 1; k <= 4; k++) g.ring(fx, fy, fz + 0.012, h * 0.38 * k / 4, 0.004, 16, "z");
    g.rod([fx - h * 0.38, fy, fz + 0.012], [fx + h * 0.38, fy, fz + 0.012], 0.005, 3).rod([fx, fy - h * 0.38, fz + 0.012], [fx, fy + h * 0.38, fz + 0.012], 0.005, 3);
    // the fins on the side panel and the service valves' cover
    g.mat(mul(col, 0.8), T.seam | ROT).quad([x + w / 2 + 0.002, yb + 0.05, out + dpt / 2 - 0.02], [x + w / 2 + 0.002, yb + 0.05, out - dpt / 2 + 0.02], [x + w / 2 + 0.002, yb + h - 0.05, out - dpt / 2 + 0.02], [x + w / 2 + 0.002, yb + h - 0.05, out + dpt / 2 - 0.02]);
    g.mat(mul(col, 0.95), T.metal).box(x + w / 2 - 0.1, yb + h * 0.35, out + dpt / 2 + 0.01, 0.16, 0.24, 0.02, 55);
    if (pipeTop) {                                            // the pipe cover (化粧カバー) from the unit to the hole in the wall, and the drain hose
      const px = x + w / 2 + 0.12;
      g.mat(hex(pick(r, [0xe6e2d8, 0xc8c2b4, 0x8a8478])), T.plastic);
      g.box(px, yb + h * 0.4, out * 0.5 + 0.02, 0.1, 0.08, out + 0.04, 55);
      g.stand(px, yb + h * 0.4 - 0.04, 0.05, 0.1, pipeTop - yb - h * 0.4, 0.07, 55);
      g.box(px, pipeTop, 0.05, 0.16, 0.12, 0.09, 55);
      g.mat(hex(0x9a9a92), T.plastic).path([[px + 0.08, pipeTop - 0.1, 0.05], [px + 0.12, yb, 0.08], [px + 0.15, 0.02, 0.2]], 0.01, 4);
    }
  }

  // ---- the second floor's balcony, its railing, the laundry, the futons ----------------------------------------------------------
  function balcony(D, g, fine) {
    const r = D.r, H = D.H, fH = (H - 0.45) / D.floors, pur = D.purpose;
    if (D.floors < 2 || D.region === "nara") return;
    const s = pur.apartment ? 1 : (r() < 0.65 ? 0 : 1), len = D.w;
    const bw = pur.apartment ? len - 0.3 : Math.min(len - 0.6, lerp(2.6, 4.2, r())), u = pur.apartment ? 0 : (r() - 0.5) * (len - bw) * 0.8, dep = pur.apartment ? 1.0 : lerp(0.8, 1.0, r());
    const y = 0.45 + fH;
    g.push(...sidePos(D, s, u, 0), sideYaw(s));
    g.mat(C.concrete, T.concrete).box(0, y - 0.08, dep / 2, bw, 0.16, dep, 55);
    g.mat(mul(D.frame, 1.1), T.metal).box(0, y - 0.17, dep / 2, bw + 0.02, 0.03, dep + 0.02, 8);
    // the rail: solid sided in siding, or aluminium balusters every 11 cm with a top rail and a bottom rail
    if (D.modern || r() < 0.35) {
      g.mat(mul(D.wall.colB, D.dirt), D.wall.b.tile | (D.wall.b.rot ? ROT : 0));
      g.box(0, y + 0.55, dep - 0.05, bw, 1.1, 0.1); g.box(-bw / 2 + 0.05, y + 0.55, dep / 2, 0.1, 1.1, dep); g.box(bw / 2 - 0.05, y + 0.55, dep / 2, 0.1, 1.1, dep);
      g.mat(C.alu, T.metal).box(0, y + 1.12, dep - 0.05, bw + 0.04, 0.04, 0.14);
    } else {
      g.mat(mul(D.frame, 1.2), T.metal);
      g.box(0, y + 1.05, dep - 0.03, bw, 0.05, 0.06, 55); g.box(0, y + 0.08, dep - 0.03, bw, 0.04, 0.04, 55);
      for (const sx of [-1, 1]) { g.box(sx * (bw / 2 - 0.03), y + 1.05, dep / 2, 0.06, 0.05, dep, 55); g.box(sx * (bw / 2 - 0.03), y + 0.55, dep - 0.03, 0.05, 1.0, 0.05, 55); }
      const n = Math.round(bw / 0.11);
      for (let k = 1; k < n; k++) g.box(-bw / 2 + k * bw / n, y + 0.56, dep - 0.03, 0.018, 0.96, 0.018, 51);
      for (const sx of [-1, 1]) { const m = Math.round(dep / 0.11); for (let k = 1; k < m; k++) g.box(sx * (bw / 2 - 0.03), y + 0.56, k * dep / m, 0.018, 0.96, 0.018, 51); }
    }
    g.pop();
    if (D.empty) return;
    // laundry: the pole hangers on the wall, the pole, what's hanging on it - shirts, towels, a peg hanger of socks; a futon over the rail
    fine.push(...sidePos(D, s, u, 0), sideYaw(s));
    const loads = (pur.laundry || 1) * (r() < 0.75 ? 1 : 0);
    if (loads) {
      fine.mat(C.alu, T.metal);
      for (const sx of [-1, 1]) fine.rod([sx * (bw / 2 - 0.2), y + 1.85, 0.0], [sx * (bw / 2 - 0.2), y + 1.85, dep * 0.55], 0.012, 4).rod([sx * (bw / 2 - 0.2), y + 1.85, dep * 0.55], [sx * (bw / 2 - 0.2), y + 1.7, dep * 0.55], 0.012, 4);
      fine.mat(hex(0x7a8aa0), T.metal).rod([-bw / 2 + 0.1, y + 1.7, dep * 0.55], [bw / 2 - 0.1, y + 1.7, dep * 0.55], 0.016, 5);
      let x = -bw / 2 + 0.3;
      while (x < bw / 2 - 0.4) {
        const kind = r(), col = pick(r, CLOTHES);
        fine.mat(col, T.cloth);
        if (kind < 0.35) { fine.rod([x - 0.2, y + 1.6, dep * 0.55], [x, y + 1.68, dep * 0.55], 0.006, 3).rod([x, y + 1.68, dep * 0.55], [x + 0.2, y + 1.6, dep * 0.55], 0.006, 3); fine.box(x, y + 1.28, dep * 0.55, 0.46, 0.64, 0.02, 51); fine.box(x - 0.27, y + 1.42, dep * 0.55, 0.14, 0.34, 0.02, 51); fine.box(x + 0.27, y + 1.42, dep * 0.55, 0.14, 0.34, 0.02, 51); x += 0.55; }
        else if (kind < 0.65) { fine.box(x, y + 1.38, dep * 0.55, 0.34, 0.62, 0.012, 51); x += 0.4; }
        else if (kind < 0.85 && D.purpose.kids) { fine.box(x, y + 1.5, dep * 0.55, 0.3, 0.32, 0.02, 51); x += 0.36; }
        else {                                                 // the peg hanger: a square frame, pegs, small things
          fine.mat(C.pvc, T.plastic).ring(x, y + 1.52, dep * 0.55, 0.22, 0.008, 4, "y").rod([x, y + 1.7, dep * 0.55], [x, y + 1.52, dep * 0.55], 0.006, 3);
          for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; fine.mat(pick(r, CLOTHES), T.cloth).box(x + Math.cos(a) * 0.18, y + 1.38, dep * 0.55 + Math.sin(a) * 0.18, 0.08, 0.2, 0.02, 51); }
          x += 0.55;
        }
      }
    }
    if (r() < 0.35) {                                          // a futon airing over the rail, two halves and the fold on top
      const fc = pick(r, [hex(0xe8e0d0), hex(0xc8a8a0), hex(0x8aa0c0), hex(0xe0c890)]), fx = (r() - 0.5) * (bw - 1.2), fz = dep - 0.03;
      fine.mat(fc, T.cloth).box(fx, y + 0.72, fz + 0.06, 1.0, 0.75, 0.07, 55).box(fx, y + 0.72, fz - 0.06, 1.0, 0.75, 0.07, 55).cyl(fx, y + 1.1, fz, 0.08, 1.0, 6, "x", 0.08, 3);
      fine.mat(C.pvc, T.plastic); for (const sx of [-0.35, 0.35]) fine.box(fx + sx, y + 1.12, fz, 0.04, 0.12, 0.2, 55);
    }
    // a BS dish clamped to the rail, a pot of herbs, the sandals by the door
    if (r() < 0.25) { fine.push(bw / 2 - 0.3, y + 1.0, dep - 0.1, -0.6); fine.mat(C.offwhite, T.plastic).cyl(0, 0.15, 0.1, 0.02, 0.08, 10, "z", 0.22, 2); fine.mat(C.steel, T.metal).rod([0, 0, 0], [0, 0.15, 0.08], 0.012, 3); fine.pop(); }
    fine.mat(C.rubber, T.plastic).box(-bw / 2 + 0.6, y + 0.02, 0.25, 0.1, 0.03, 0.24, 55).box(-bw / 2 + 0.72, y + 0.02, 0.25, 0.1, 0.03, 0.24, 55);
    fine.pop();
  }

  // ---- the apartment block's stair and walkway ------------------------------------------------------------------------------------
  const aptSign = D => ({ text: D.aptName, bg: "#f2efe6", ink: "#2a3a5a", seed: "apt" + D.aptName });
  function apartment(D, g, fine, sb) {
    const r = D.r, H = D.H, fH = (H - 0.45) / D.floors, w = D.w, y1 = 0.45 + fH;
    // the walkway along the front at first-floor level, its steel rail, the soffit lights; the open steel stair at one end
    const dep = 1.2, sx = r() < 0.5 ? -1 : 1;
    g.push(0, 0, D.d / 2 + E, 0);
    g.mat(C.concrete, T.concrete).box(0, y1 - 0.1, dep / 2, w, 0.2, dep, 63);
    g.mat(hex(0x5a5e62), T.metal).box(0, y1 + 1.05, dep - 0.03, w, 0.05, 0.06, 55).box(0, y1 + 0.1, dep - 0.03, w, 0.05, 0.05, 55);
    const n = Math.round(w / 0.12); for (let k = 0; k <= n; k++) g.box(-w / 2 + k * w / n, y1 + 0.57, dep - 0.03, 0.02, 0.92, 0.02, 51);
    g.mat(C.steel, T.metal); for (let k = 0; k <= 3; k++) g.stand(-w / 2 + 0.1 + k * (w - 0.2) / 3, 0, dep - 0.1, 0.12, y1 - 0.2, 0.12, 55);
    for (let k = 0; k < 3; k++) { g.mat(hex(0xf6f0e0), T.glass, 1).box(-w / 2 + (k + 0.5) * w / 3, y1 - 0.22, dep / 2, 0.22, 0.04, 0.1, 8); }
    // the stair: two stringers, fourteen treads, a landing, the handrail
    const steps = 14, rise = y1 / steps, run = 0.25, x0 = sx * (w / 2 + 0.6), z0 = dep - 0.1;
    g.mat(hex(0x4a4e52), T.metal);
    const sz0 = z0 + steps * run;
    for (const ox of [-0.45, 0.45]) g.rod([x0 + ox, 0.02, sz0], [x0 + ox, y1, z0], 0.05, 4);
    g.mat(hex(0x6a6e72), T.metal); for (let k = 0; k < steps; k++) g.box(x0, (k + 1) * rise - 0.02, sz0 - (k + 0.5) * run, 0.88, 0.04, run + 0.02, 55);
    g.mat(C.concrete, T.concrete).box(x0, y1 - 0.1, dep / 2, 1.0, 0.2, dep, 63);
    g.mat(hex(0x4a4e52), T.metal); g.rod([x0 - sx * -0.48, 0.9, sz0], [x0 - sx * -0.48, y1 + 0.9, z0], 0.022, 5);
    for (let k = 0; k <= steps; k += 2) g.rod([x0 - sx * -0.48, k * rise, sz0 - k * run], [x0 - sx * -0.48, k * rise + 0.9, sz0 - k * run], 0.012, 3);
    g.pop();
    // a washing machine outside some doors (it is cheaper than room for one inside), the mailbox bank by the stair, the bike shelter
    fine.push(0, 0, D.d / 2 + E, 0);
    for (let k = 0; k < 6; k++) {
      if (r() < 0.45) continue;
      const fl = k < 3 ? 0 : 1, x = -w / 2 + (k % 3 + 0.5) * w / 3 + 0.65, y = fl ? y1 : 0.42;
      fine.mat(C.white, T.plastic).stand(x, y, 0.35, 0.58, 0.95, 0.56, 55);
      fine.mat(hex(0x5a6a7a), T.glass).box(x, y + 0.96, 0.35, 0.4, 0.01, 0.34, 4);
      fine.mat(C.pvcGrey, T.plastic).box(x, y + 0.02, 0.35, 0.64, 0.04, 0.62, 4);
    }
    fine.push(x0 + sx * 0.9, 0, 0.6, sx * Math.PI / 2);
    fine.mat(hex(0xb8bcbe), T.metal).stand(0, 0.8, 0, 1.0, 0.7, 0.36, 55);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { fine.mat(hex(0x8a8e92), T.metal).box(-0.33 + i * 0.33, 0.97 + j * 0.34, 0.185, 0.3, 0.3, 0.01, 16); fine.mat(C.black, T.metal).box(-0.33 + i * 0.33, 1.04 + j * 0.34, 0.19, 0.18, 0.02, 0.01, 16); }
    fine.mat(C.steel, T.metal).stand(-0.45, 0, 0, 0.05, 0.8, 0.05, 55).stand(0.45, 0, 0, 0.05, 0.8, 0.05, 55);
    fine.pop();
    fine.pop();
    // its name on the end wall: コーポ / ハイツ / メゾン + a name
    const nm = D.aptName;
    g.push(...sidePos(D, sx > 0 ? 3 : 2, D.d * 0.3, 0), sideYaw(sx > 0 ? 3 : 2));
    g.mat(hex(0x2a2a2c), T.metal).box(0, H - 0.8, 0.02, 1.7, 0.42, 0.03, 55);
    sb.board(g, signSlot(aptSign(D)), 0, H - 0.8, 0.04, 1.6, 0.36, 0);
    g.pop();
  }

  // =====================================================================================================================
  // THE LOT: the boundary, the gate, the drive, the garden, and whatever the household keeps outside
  // =====================================================================================================================
  function lot(D, g, fine, sb) {
    const r = D.r, pur = D.purpose, w = D.w, d = D.d;
    // the lot in house space
    const L = { x0: D.lc[0] - D.lotW / 2, x1: D.lc[0] + D.lotW / 2, z0: D.lc[1] - D.lotD / 2, z1: D.lc[1] + D.lotD / 2 };
    const front = L.z1, fy = d / 2 + E;                  // the street boundary, the house's front wall
    const yard = front - fy;                              // depth of the front garden
    const sideL = -w / 2 - L.x0, sideR = L.x1 - w / 2;
    const terrace = D.region === "nara" || yard < 1.2;
    // where the car goes: the wider side if it fits a car alongside, else across the front garden
    const dv = D.empty ? null : planDrive(D);
    let drive = dv ? { x: dv.x, z: dv.z, w: 2.6, l: 5.2 } : null;
    // keep the drive off the path to the door
    if (drive && Math.abs(drive.x - D.doorX) < 1.9) drive = null;
    D.drive = drive;
    void sideL; void sideR;
    if (terrace) {
      // a terraced machiya or a shop on the street line: no garden, only what lives on the step - pots, a bench, the bins
      streetStep(D, fine);
      return;
    }
    // ---- the front boundary: block wall with its hollow blocks, aluminium fence on a low wall, or a clipped hedge
    const gateW = 1.1, gateX = D.doorX;
    const kind = pickW(r, D.old ? [["block", 4], ["hedge", 3], ["stone", 2]] : D.modern ? [["fence", 3], ["open", 3], ["block", 1]] : [["block", 4], ["fence", 3], ["hedge", 2], ["open", 1]]);
    const gaps = [[gateX - gateW / 2, gateX + gateW / 2]];
    if (drive) gaps.push([drive.x - drive.w / 2 - 0.1, drive.x + drive.w / 2 + 0.1]);
    if (pur.shop) gaps.push([-Math.min(w * 0.34, 2.6), Math.min(w * 0.34, 2.6)]);
    const runs = []; let x = L.x0 + 0.1;
    gaps.sort((a, b) => a[0] - b[0]).forEach(gp => { if (gp[0] > x + 0.2) runs.push([x, gp[0]]); x = Math.max(x, gp[1]); });
    if (L.x1 - 0.1 > x + 0.2) runs.push([x, L.x1 - 0.1]);
    const fz = front - 0.1;
    runs.forEach(([a, b]) => boundary(D, fine, g, kind, a, b, fz, 0));
    // the sides and back: lower, simpler, and the neighbour's side is usually block
    if (kind !== "open") {
      boundary(D, fine, g, kind === "hedge" ? "hedge" : "block", L.z0 + 0.1, fz - 0.1, L.x0 + 0.1, 1, 0.8);
      boundary(D, fine, g, kind === "hedge" ? "hedge" : "block", L.z0 + 0.1, fz - 0.1, L.x1 - 0.1, 2, 0.8);
      boundary(D, fine, g, "block", L.x0 + 0.1, L.x1 - 0.1, L.z0 + 0.1, 3, 0.8);
    }
    // ---- the gate: two pillars, the gate leaves, the nameplate, the postbox and the intercom on the pillar
    if (kind !== "open") gate(D, g, fine, sb, gateX, fz, gateW);
    else { mailpost(D, fine, sb, gateX + gateW / 2 + 0.4, fz); }
    // ---- the path from the gate to the door: stepping stones in gravel, or concrete with a tiled edge
    path(D, fine, gateX, fz, fy);
    // ---- the drive: two concrete strips with grass or gravel between (the slit), the car stops, sometimes a carport
    if (drive) driveway(D, g, fine, drive);
    // ---- the garden: plants, pots, a tree, a bonsai shelf, the household's things
    garden(D, fine, L, fy, drive);
  }
  function boundary(D, fine, g, kind, a, b, at, side, scale) {
    // side 0: along x at z=at (front); 1/2: along z at x=at (left/right), a..b in z; 3: along x at z=at (back)
    const r = D.r, len = b - a; if (len < 0.3) return;
    const h = (kind === "fence" ? 1.2 : kind === "hedge" ? 1.1 : kind === "stone" ? 0.9 : 1.2) * (scale || 1);
    const yaw = side === 0 ? 0 : side === 3 ? Math.PI : side === 1 ? -Math.PI / 2 : Math.PI / 2;
    const mid = (a + b) / 2;
    const P = side === 0 || side === 3 ? [side === 0 ? mid : mid, 0, at] : [at, 0, mid];
    const B = (kind === "hedge" || kind === "stone") ? fine : g;           // walls carry from afar; hedges are close detail
    B.push(P[0], 0, P[2], yaw);
    if (side === 3) B.push(0, 0, 0, 0);
    const uSign = side === 3 ? -1 : 1; void uSign;
    if (kind === "block") {
      // concrete blocks, 39 x 19 cm: the wall, a joint every course and every block (staggered), a cap; hollow blocks in the top courses here and there
      const courses = Math.round(h / 0.2), hh = courses * 0.2;
      B.mat(mul(C.concrete, 0.95 * D.dirt), T.concrete).stand(0, 0, 0, len, hh, 0.12, 55);
      B.mat(mul(C.concDark, 0.8), T.concrete);
      for (let k = 1; k < courses; k++) { B.box(0, k * 0.2, 0.061, len, 0.012, 0.004, 16); B.box(0, k * 0.2, -0.061, len, 0.012, 0.004, 32); }
      const blocks = Math.floor(len / 0.4);
      for (let c = 0; c < courses; c++) for (let k = 1; k < blocks; k++) { const xx = -len / 2 + k * 0.4 + (c % 2 ? 0.2 : 0); if (xx > len / 2 - 0.05) continue; B.box(xx, c * 0.2 + 0.1, 0.061, 0.012, 0.19, 0.004, 16); }
      if (r() < 0.6) {                                    // 透かしブロック: the patterned hollow blocks
        const row = courses - 2;
        for (let k = 1; k < blocks - 1; k += 3) { const xx = -len / 2 + k * 0.4 + 0.2 + (row % 2 ? 0.2 : 0); if (xx > len / 2 - 0.3) continue; B.mat(hex(0x2a2826), T.concrete).box(xx, row * 0.2 + 0.1, 0.0, 0.34, 0.14, 0.125, 48); B.mat(mul(C.concrete, 0.95), T.concrete).box(xx, row * 0.2 + 0.1, 0.0, 0.04, 0.14, 0.126, 48).box(xx, row * 0.2 + 0.1, 0.0, 0.34, 0.035, 0.126, 48); }
      }
      B.mat(mul(C.concrete, 1.05), T.concrete).box(0, hh + 0.025, 0, len + 0.02, 0.05, 0.16, 55);
    } else if (kind === "fence") {
      // aluminium slats on a low block wall, posts every 2 m
      B.mat(mul(C.concrete, 0.95), T.concrete).stand(0, 0, 0, len, 0.4, 0.15, 55);
      const fc = hex(pick(r, [0x3a3632, 0x5a4a3a, 0xb8b4ac, 0x2a2a2c, 0x8a6a4a]));
      B.mat(fc, T.metal);
      for (let k = 0; k <= Math.round(len / 2); k++) B.stand(-len / 2 + k * len / Math.round(len / 2) * (Math.round(len / 2) ? 1 : 0), 0.4, 0, 0.06, h - 0.4, 0.06, 55);
      const sl = Math.round((h - 0.45) / 0.12);
      for (let k = 0; k < sl; k++) B.box(0, 0.48 + k * 0.12 + 0.04, 0.0, len, 0.08, 0.02, 55);
    } else if (kind === "hedge") {
      // a clipped hedge of small-leaved holly or photinia: a few lumpy blobs merged along the run, on a low curb
      B.mat(mul(C.concrete, 0.9), T.concrete).stand(0, 0, 0, len, 0.2, 0.25, 55);
      const n = Math.max(1, Math.round(len / 0.9));
      B.mat(pick(r, [C.leaf, C.leafDark, hex(0x7a6a3a)]), T.leaf);
      for (let k = 0; k < n; k++) B.blob(-len / 2 + (k + 0.5) * len / n, h * 0.55, 0, len / n * 0.62, h * 0.5, 0.35, D.seed + k * 13, 0.18);
    } else if (kind === "stone") {
      // a dry-laid stone wall with a hedge on top
      const n = Math.max(1, Math.round(len / 0.45));
      for (let k = 0; k < n; k++) for (let j = 0; j < 2; j++) { B.mat(mul(C.stone, 0.85 + r() * 0.25), T.concrete).blob(-len / 2 + (k + 0.5 + (j ? 0.5 : 0)) * len / n, 0.18 + j * 0.3, 0, len / n * 0.55, 0.17, 0.25, D.seed + k * 7 + j, 0.3); }
      B.mat(C.leafDark, T.leaf); for (let k = 0; k < Math.round(len / 1.1); k++) B.blob(-len / 2 + (k + 0.5) * 1.1, 0.85, 0, 0.6, 0.35, 0.3, D.seed + k * 31, 0.25);
    }
    if (side === 3) B.pop();
    B.pop();
  }
  function gate(D, g, fine, sb, x, z, gw) {
    const r = D.r, pc = D.old ? hex(0x9a8e7e) : hex(pick(r, [0xc8bca8, 0x8a8278, 0x5a5652, 0xe0d8c8, 0x7a6a5a]));
    g.push(x, 0, z, 0);
    // the pillars: tiled or rendered, with a cap
    for (const sx of [-1, 1]) { g.mat(pc, D.old ? T.concrete : T.brick).stand(sx * (gw / 2 + 0.2), 0, 0, 0.4, 1.35, 0.4, 55); g.mat(mul(pc, 0.85), T.concrete).box(sx * (gw / 2 + 0.2), 1.38, 0, 0.46, 0.06, 0.46, 55); }
    // two gate leaves of aluminium bars, a little ajar
    const lc = hex(pick(r, [0x3a3632, 0x2a2a2c, 0x5a4a3a]));
    for (const sx of [-1, 1]) {
      g.push(sx * gw / 2, 0, 0, sx * (0.12 + r() * 0.2));
      g.mat(lc, T.metal);
      const lw = gw / 2 - 0.02, cx = -sx * lw / 2;
      g.box(cx, 0.15, 0, lw, 0.04, 0.03, 55); g.box(cx, 1.05, 0, lw, 0.04, 0.03, 55); g.box(-sx * 0.01, 0.6, 0, 0.04, 0.95, 0.04, 55); g.box(-sx * (lw - 0.01), 0.6, 0, 0.04, 0.95, 0.04, 55);
      const n = Math.round(lw / 0.1); for (let k = 1; k < n; k++) g.box(-sx * k * lw / n, 0.6, 0, 0.015, 0.88, 0.015, 51);
      g.pop();
    }
    g.pop();
    // on the right pillar: the nameplate (表札), the postbox, the intercom; the house number plate on the left
    const px = x + gw / 2 + 0.2;
    fine.push(px, 0, z + 0.2, 0);
    fine.mat(hex(0x3a3836), T.metal).box(0, 1.15, 0.01, 0.34, 0.12, 0.02, 16);
    sb.board(fine, signSlot(nameplate(D)), 0, 1.15, 0.022, 0.3, 0.09, 0);
    fine.mat(hex(pick(r, [0x8a2a24, 0x3a3836, 0xc8c4bc, 0x2a4a3a])), T.metal).box(0, 0.88, 0.04, 0.3, 0.36, 0.1, 55);
    fine.mat(C.black, T.metal).box(0, 0.98, 0.092, 0.22, 0.02, 0.01, 16);
    fine.mat(C.offwhite, T.plastic).box(0, 0.55, 0.02, 0.1, 0.16, 0.04, 55);
    fine.mat(C.black, T.glass).box(0, 0.59, 0.042, 0.03, 0.03, 0.01, 16);
    fine.pop();
    fine.push(x - gw / 2 - 0.2, 0, z + 0.2, 0);
    fine.mat(hex(0x2a4a8a), T.metal).box(0, 1.05, 0.01, 0.2, 0.08, 0.01, 16);
    fine.pop();
  }
  function nameplate(D) {
    const k = hashi(D.surname.charCodeAt(0), D.surname.length, 7) % 3;
    return { text: D.surname, bg: ["#e8e0cc", "#2a2826", "#f4f0e8"][k], ink: k === 1 ? "#e8e0cc" : "#1a1612", seed: "np" + D.surname, panel: "border" };
  }
  function mailpost(D, fine, sb, x, z) {
    const r = D.r;
    fine.push(x, 0, z, 0);
    fine.mat(C.steel, T.metal).stand(0, 0, 0, 0.06, 0.95, 0.06, 55);
    fine.mat(hex(pick(r, [0x3a3836, 0xc8c4bc, 0x5a6a5a])), T.metal).box(0, 1.05, 0, 0.32, 0.28, 0.24, 55);
    fine.mat(hex(0x3a3836), T.metal).box(0, 1.28, 0.0, 0.3, 0.1, 0.02, 16);
    sb.board(fine, signSlot(nameplate(D)), 0, 1.28, 0.012, 0.26, 0.08, 0);
    fine.pop();
  }
  function path(D, fine, x, z0, z1) {
    const r = D.r, len = z0 - z1 - 1.2; if (len < 0.4) return;
    if (D.old || r() < 0.45) {
      // stepping stones, in gravel
      fine.mat(C.gravel, T.gravel).box(x, 0.01, z1 + 1.2 + len / 2, 1.2, 0.02, len, 4);
      const n = Math.max(1, Math.round(len / 0.55));
      for (let k = 0; k < n; k++) fine.mat(mul(C.stone, 0.85 + r() * 0.2), T.concrete).cyl(x + (r() - 0.5) * 0.2, 0.0, z1 + 1.35 + (k + 0.5) * len / n, 0.24 + r() * 0.06, 0.06, 9, "y");
    } else {
      fine.mat(hex(pick(r, [0xb8a890, 0x9a948c, 0xc8beb0])), T.slate).box(x, 0.03, z1 + 1.2 + len / 2, 1.1, 0.06, len, 4);
      fine.mat(C.concDark, T.concrete).box(x - 0.57, 0.04, z1 + 1.2 + len / 2, 0.06, 0.08, len, 55).box(x + 0.57, 0.04, z1 + 1.2 + len / 2, 0.06, 0.08, len, 55);
    }
  }
  function driveway(D, g, fine, dv) {
    const r = D.r;
    fine.push(dv.x, 0, dv.z, 0);
    if (r() < 0.55) {                                          // the slit: two concrete strips, gravel or turf between
      fine.mat(C.concrete, T.concrete); for (const sx of [-0.7, 0.7]) fine.box(sx, 0.04, 0, 0.9, 0.08, dv.l, 4);
      fine.mat(C.gravel, T.gravel).box(0, 0.03, 0, 0.5, 0.06, dv.l, 4);
    } else fine.mat(mul(C.concrete, 0.96), T.concrete).box(0, 0.04, 0, dv.w, 0.08, dv.l, 4);
    fine.mat(mul(C.concrete, 0.9), T.concrete).box(0, 0.0805, 0, dv.w, 0.001, 0.02, 4);
    // the car stops (車止め), the hose reel against the wall
    fine.mat(hex(0xd8d4c8), T.concrete); for (const sx of [-0.55, 0.55]) fine.box(sx, 0.13, -dv.l / 2 + 0.6, 0.5, 0.1, 0.12, 55);
    fine.pop();
    // a carport: two posts on the house side, a polycarbonate roof on a frame
    if (r() < 0.45) {
      const cl = hex(pick(r, [0x3a3632, 0xb8b4ac, 0x5a4a3a]));
      g.push(dv.x, 0, dv.z, 0);
      g.mat(cl, T.metal);
      const side = dv.x > 0 ? 1 : -1;
      for (const z of [-dv.l / 2 + 0.4, dv.l / 2 - 0.4]) g.stand(side * (dv.w / 2 + 0.05), 0, z, 0.1, 2.3, 0.1, 55);
      g.box(side * (dv.w / 2 + 0.05), 2.3, 0, 0.12, 0.18, dv.l, 55);
      g.box(0, 2.42, -dv.l / 2 + 0.2, dv.w + 0.4, 0.08, 0.08, 55); g.box(0, 2.42, dv.l / 2 - 0.2, dv.w + 0.4, 0.08, 0.08, 55);
      g.mat(hex(0xb8c8cc), T.glass).box(0, 2.48, 0, dv.w + 0.5, 0.02, dv.l, 12);
      g.mat(cl, T.metal); for (let k = 0; k <= 6; k++) g.box(-dv.w / 2 - 0.25 + k * (dv.w + 0.5) / 6, 2.47, 0, 0.03, 0.03, dv.l, 55);
      g.pop();
    }
  }
  function streetStep(D, fine) {
    const r = D.r, pur = D.purpose, z = D.d / 2 + E + 0.35;
    fine.push(0, 0, z, 0);
    // pots on the step, a bench for the evening, the bin, a bicycle against the wall
    const n = (pur.pots || 1) * 3;
    for (let k = 0; k < n; k++) pot(D, fine, (r() - 0.5) * D.w * 0.9, (r() - 0.5) * 0.3, r() < 0.3 ? 1 : 0);
    if (r() < 0.4 && !D.empty) bench(D, fine, D.w * 0.3 * (r() < 0.5 ? -1 : 1), 0.1);
    if (pur.sugidama) { fine.mat(hex(0x6a7a40), T.leaf).blob(D.w * 0.3, 2.6, 0.25, 0.38, 0.38, 0.38, D.seed, 0.08); fine.mat(C.woodDark, T.timber).rod([D.w * 0.3, 3.1, -0.3], [D.w * 0.3, 3.1, 0.25], 0.025, 4).rod([D.w * 0.3, 3.1, 0.25], [D.w * 0.3, 2.98, 0.25], 0.01, 3); }
    if (!D.empty) for (let k = 0; k < (pur.bikes ? Math.min(2, pur.bikes) : (r() < 0.5 ? 1 : 0)); k++) bicycle(D, fine, -D.w * 0.38 + k * 0.5, 0.25, Math.PI / 2 + (r() - 0.5) * 0.2, false);
    fine.pop();
    purposeKit(D, fine, { x0: -D.w / 2, x1: D.w / 2, z: z + 0.5 });
  }
  function pot(D, f, x, z, big) {
    const r = D.r, pc = pick(r, [C.terracotta, hex(0x3a4a6a), hex(0x2a2a2c), hex(0xc8b8a0), hex(0x5a3a2a)]), s = big ? 1.6 : 0.8 + r() * 0.5;
    f.mat(pc, pc === C.terracotta ? T.brick : T.plastic).cyl(x, 0, z, 0.1 * s, 0.22 * s, 8, "y", 0.14 * s, 0);
    f.mat(C.soil, T.gravel).cyl(x, 0.2 * s, z, 0.13 * s, 0.01, 8, "y", 0.13 * s, 2);
    f.mat(pick(r, [C.leaf, C.leafDark, hex(0x8aa050), hex(0x6a7a3a)]), T.leaf);
    if (r() < 0.3) { for (let k = 0; k < 5; k++) f.rod([x, 0.2 * s, z], [x + (r() - 0.5) * 0.3 * s, 0.5 * s + r() * 0.3 * s, z + (r() - 0.5) * 0.3 * s], 0.012 * s, 3); f.blob(x, 0.65 * s, z, 0.12 * s, 0.1 * s, 0.12 * s, D.seed + x * 99, 0.4); }
    else f.blob(x, 0.32 * s, z, 0.17 * s, 0.15 * s, 0.17 * s, D.seed + x * 77 + z, 0.35);
    if (r() < 0.25) { f.mat(pick(r, [hex(0xd83a4a), hex(0xf0d040), hex(0xe8e8f0), hex(0xa050b0)]), T.cloth); for (let k = 0; k < 4; k++) f.blob(x + (r() - 0.5) * 0.22 * s, 0.42 * s, z + (r() - 0.5) * 0.22 * s, 0.03 * s, 0.03 * s, 0.03 * s, k, 0.1); }
  }
  function bench(D, f, x, z) {
    f.push(x, 0, z, 0);
    f.mat(C.wood, T.timber); f.box(0, 0.42, 0, 1.4, 0.04, 0.36, 55);
    for (let k = -2; k <= 2; k++) f.box(k * 0.28, 0.42, 0, 0.005, 0.042, 0.36, 4);
    f.mat(C.woodDark, T.timber); for (const sx of [-0.6, 0.6]) f.stand(sx, 0, 0, 0.06, 0.4, 0.3, 55);
    f.pop();
  }
  // a bicycle in detail: two wheels (tyre, rim, 32 spokes), the frame tubes, fork, bars, saddle, the basket; a child seat if the household has a toddler
  function bicycle(D, f, x, z, yaw, child) {
    const r = D.r, fc = pick(r, [hex(0xe8e6e0), hex(0x2a2a2c), hex(0x8a2a2a), hex(0x3a5a7a), hex(0xc8b080), hex(0x5a6a4a), hex(0xd0d4d8)]);
    f.push(x, 0, z, yaw);
    const R = 0.33, wb = 1.05;
    for (const wz of [-wb / 2, wb / 2]) {
      f.mat(C.rubber, T.plastic).ring(0, R, wz, R, 0.022, 18, "x");
      f.mat(C.alu, T.metal).ring(0, R, wz, R - 0.03, 0.008, 18, "x");
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; f.rod([0, R, wz], [0, R + Math.sin(a) * (R - 0.03), wz + Math.cos(a) * (R - 0.03)], 0.0025, 3); }
      f.cyl(0, R, wz, 0.03, 0.08, 6, "x", 0.03, 3);
      f.mat(fc, T.metal).box(0, R + 0.3, wz, 0.08, 0.02, 0.62, 55);                // the mudguard over it
    }
    // the step-through frame (mamachari): the down tube swoops low; seat tube, chain stays, fork, bars
    f.mat(fc, T.metal);
    const bb = [0, 0.3, -0.05], st = [0, 0.82, -0.18], ht = [0, 0.86, 0.38], rr = [0, R, -wb / 2], fr = [0, R, wb / 2];
    f.path([ht, [0, 0.55, 0.25], bb], 0.022, 5).rod(bb, st, 0.02, 5).rod(bb, rr, 0.012, 4).rod(st, rr, 0.01, 4).rod(ht, fr, 0.018, 4).rod([0, 0.86, 0.38], [0, 1.02, 0.34], 0.016, 4);
    f.mat(C.alu, T.metal).rod([-0.28, 1.04, 0.28], [0.28, 1.04, 0.28], 0.012, 4);
    f.mat(C.black, T.plastic).rod([-0.28, 1.04, 0.28], [-0.2, 1.04, 0.28], 0.018, 4).rod([0.2, 1.04, 0.28], [0.28, 1.04, 0.28], 0.018, 4);
    f.mat(pick(r, [C.black, hex(0x5a3a2a)]), T.plastic).box(0, 0.86, -0.2, 0.13, 0.05, 0.24, 55);
    f.mat(C.steel, T.metal).box(0, 0.22, -0.05, 0.02, 0.12, 0.2, 55);                     // the chain case
    f.mat(C.alu, T.metal); for (let k = 0; k < 5; k++) f.box(0, 0.78 + k * 0.05, 0.62, 0.32, 0.006, 0.22, 51);    // the front basket's wires
    f.box(0, 0.88, 0.62, 0.32, 0.22, 0.004, 16).box(0, 0.88, 0.51, 0.004, 0.22, 0.22, 3);
    f.mat(C.steel, T.metal).box(0, 0.62, -0.55, 0.2, 0.02, 0.3, 55);                       // the rear rack
    if (child) { f.mat(pick(r, [hex(0x2a4a8a), hex(0xd8d0c0), hex(0x6a2a2a)]), T.plastic).box(0, 0.82, -0.55, 0.32, 0.36, 0.32, 55).box(0, 1.06, -0.68, 0.32, 0.3, 0.06, 55); }
    f.mat(C.steel, T.metal).rod([0.03, 0.2, -0.45], [0.06, 0.0, -0.6], 0.01, 3);           // the stand
    f.pop();
  }
  function garden(D, fine, L, fy, drive) {
    const r = D.r, pur = D.purpose, f = fine;
    // the front garden's ground: gravel with an edge of bricks, or a strip of lawn
    const z0 = fy + 0.3, z1 = L.z1 - 0.3, x0 = L.x0 + 0.3, x1 = L.x1 - 0.3;
    if (z1 - z0 > 0.8) {
      const gx0 = drive ? (drive.x < 0 ? drive.x + drive.w / 2 + 0.2 : x0) : x0, gx1 = drive ? (drive.x > 0 ? drive.x - drive.w / 2 - 0.2 : x1) : x1;
      const lawn = D.empty ? 0 : r() < 0.18;
      f.mat(D.empty ? hex(0x7a7a4a) : lawn ? hex(0x5a7a3a) : C.gravel, D.empty || lawn ? T.leaf : T.gravel).box((gx0 + gx1) / 2, 0.012, (z0 + z1) / 2, gx1 - gx0, 0.024, z1 - z0, 4);
      // plants by the household: a pine or a maple, clipped azaleas, a row of pots
      const plants = D.empty ? 9 : Math.round(2 + (pur.garden || 0) * 2 + r() * 3);
      for (let k = 0; k < plants; k++) {
        const px = lerp(gx0 + 0.3, gx1 - 0.3, r()), pz = lerp(z0 + 0.2, z1 - 0.2, r());
        if (Math.abs(px - D.doorX) < 0.8) continue;
        if (D.empty) { f.mat(pick(r, [hex(0x7a8a3a), hex(0x5a6a2a), hex(0x8a8a5a)]), T.leaf).blob(px, 0.25, pz, 0.35 + r() * 0.3, 0.25 + r() * 0.35, 0.35 + r() * 0.3, D.seed + k, 0.5); continue; }
        const kind = r();
        if (kind < 0.35) { f.mat(pick(r, [C.leaf, C.leafDark]), T.leaf).blob(px, 0.32, pz, 0.45, 0.32, 0.45, D.seed + k * 3, 0.15); if (r() < 0.5) { f.mat(pick(r, [hex(0xd84a7a), hex(0xe8a0b8), hex(0xf0f0f0)]), T.cloth); for (let q = 0; q < 8; q++) f.blob(px + (r() - 0.5) * 0.7, 0.45 + r() * 0.15, pz + (r() - 0.5) * 0.7, 0.04, 0.03, 0.04, q, 0.1); } }
        else if (kind < 0.55 && k < 2) tree(D, f, px, pz);
        else pot(D, f, px, pz, r() < 0.2 ? 1 : 0);
      }
    }
    // the household's own things
    purposeKit(D, f, { x0: x0, x1: x1, z: Math.min(z1, fy + 1.6), drive: drive, back: L.z0 + 0.6 });
  }
  function tree(D, f, x, z) {
    const r = D.r, h = 1.8 + r() * 1.6, kind = r();
    f.mat(C.woodDark, T.bark).cyl(x, 0, z, 0.07, h * 0.75, 6, "y", 0.045, 0);
    if (kind < 0.45 || D.old) {
      // a garden pine (クロマツ) trained into flat pads, its limbs reaching out to each
      for (let k = 0; k < 4; k++) {
        const a = r() * Math.PI * 2, L = 0.3 + r() * 0.5, y = h * (0.4 + k * 0.16);
        f.mat(C.woodDark, T.bark).rod([x, y - 0.15, z], [x + Math.cos(a) * L, y, z + Math.sin(a) * L], 0.03, 4);
        f.mat(hex(0x3a5a3a), T.leaf).blob(x + Math.cos(a) * L, y + 0.08, z + Math.sin(a) * L, 0.34, 0.12, 0.3, D.seed + k * 11, 0.25);
      }
      f.mat(hex(0x3a5a3a), T.leaf).blob(x, h * 0.95, z, 0.36, 0.15, 0.36, D.seed + 77, 0.25);
    } else {
      // a maple or a dogwood: a round crown on a few branches
      const col = pick(r, [hex(0x6a8a3a), hex(0xa84a2a), hex(0x8a9a4a)]);
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + r(); f.mat(C.woodDark, T.bark).rod([x, h * 0.55, z], [x + Math.cos(a) * 0.4, h * 0.85, z + Math.sin(a) * 0.4], 0.03, 4); f.mat(col, T.leaf).blob(x + Math.cos(a) * 0.4, h * 0.95, z + Math.sin(a) * 0.4, 0.5, 0.4, 0.5, D.seed + k * 5, 0.3); }
    }
  }
  // what each household keeps outside
  function purposeKit(D, f, A) {
    const r = D.r, pur = D.purpose, dz = A.z;
    const spot = () => [lerp(A.x0 + 0.4, A.x1 - 0.4, r()), dz + (r() - 0.5) * 0.4];
    if (D.empty) {
      // a for-sale board on a stake, a rusted bike that never moved again, the bins left out
      const [x, z] = spot(), sg = D.signs[0];
      f.mat(C.woodDark, T.timber).stand(x, 0, z, 0.05, 1.3, 0.05, 55).box(x, 1.25, z - 0.03, 0.62, 0.42, 0.02, 55);
      if (sg && D.sb) { f.push(x, 0, z - 0.015, 0); D.sb.board(f, signSlot(Object.assign({ seed: "akiya" + D.seed }, sg)), 0, 1.25, 0.0, 0.58, 0.38, 0); f.pop(); }
      // the bins left out, a rusted bicycle that never moved again
      f.mat(hex(0x5a5a52), T.plastic).stand(x + 0.8, 0, z, 0.45, 0.6, 0.45, 55);
      bicycle(D, f, x - 1.0, z - 0.4, Math.PI / 2 + 0.3, false);
      return;
    }
    // bicycles: one per member who rides, a child seat if there is a toddler
    const nb = pur.bikes || 0, toddler = D.folk.some(m => m.age < 5);
    for (let k = 0; k < nb; k++) { const x = lerp(A.x0 + 0.5, A.x1 - 0.5, (k + 0.5) / Math.max(1, nb)) * 0.9; bicycle(D, f, x, dz - 0.3 + (k % 2) * 0.2, Math.PI / 2 + (r() - 0.5) * 0.35, toddler && k === 0); }
    // the kids' things
    if (pur.kids) {
      const [x, z] = spot();
      f.push(x, 0, z, r() * 6);                               // a tricycle
      f.mat(hex(pick(r, [0xd83a3a, 0x3a6ad8, 0xf0c030])), T.plastic).ring(0, 0.16, 0.3, 0.16, 0.02, 12, "x").ring(-0.2, 0.1, -0.15, 0.1, 0.018, 10, "x").ring(0.2, 0.1, -0.15, 0.1, 0.018, 10, "x");
      f.path([[0, 0.16, 0.3], [0, 0.5, 0.22], [0, 0.4, -0.1], [0, 0.12, -0.15]], 0.02, 4).rod([-0.2, 0.1, -0.15], [0.2, 0.1, -0.15], 0.015, 4);
      f.mat(C.black, T.plastic).box(0, 0.42, -0.05, 0.14, 0.04, 0.18, 55).rod([-0.16, 0.56, 0.22], [0.16, 0.56, 0.22], 0.012, 4);
      f.pop();
      const [bx, bz] = spot();
      f.mat(hex(pick(r, [0xf0f0f0, 0xd83a3a, 0x3a8ad8])), T.plastic).blob(bx, 0.11, bz, 0.11, 0.11, 0.11, 3, 0.02);
    }
    // bonsai on a stepped shelf, the old man's pride
    if (pur.bonsai) {
      const [x, z] = spot();
      f.push(x, 0, z, 0);
      f.mat(C.wood, T.timber); for (let k = 0; k < 3; k++) { f.box(0, 0.35 + k * 0.32, -k * 0.18, 1.6, 0.04, 0.24, 55); for (const sx of [-0.75, 0.75]) f.stand(sx, 0, -k * 0.18, 0.06, 0.35 + k * 0.32, 0.06, 55); }
      for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) {
        const px = -0.55 + j * 0.37, py = 0.37 + k * 0.32, pz = -k * 0.18;
        f.mat(pick(r, [hex(0x6a4a3a), hex(0x3a4a5a), hex(0x8a7a6a)]), T.brick).box(px, py + 0.03, pz, 0.22, 0.06, 0.15, 55);
        f.mat(C.woodDark, T.bark).path([[px, py + 0.06, pz], [px + 0.05, py + 0.14, pz], [px - 0.03, py + 0.22, pz]], 0.012, 3);
        f.mat(hex(0x3a5a3a), T.leaf).blob(px - 0.03, py + 0.24, pz, 0.1, 0.05, 0.08, k * 4 + j, 0.3).blob(px + 0.06, py + 0.18, pz, 0.07, 0.04, 0.06, k * 9 + j, 0.3);
      }
      f.pop();
    }
    // pots, a watering can, the hose reel
    const np = Math.round((pur.pots || 0.6) * (3 + r() * 4));
    for (let k = 0; k < np; k++) { const [x, z] = spot(); pot(D, f, x, z, r() < 0.15 ? 1 : 0); }
    if (pur.garden || pur.pots) {
      const [x, z] = spot();
      f.mat(hex(pick(r, [0x3a8a5a, 0xd8a030, 0x5a7ad8])), T.plastic).cyl(x, 0, z, 0.1, 0.24, 8, "y", 0.09, 2).rod([x, 0.15, z + 0.08], [x, 0.3, z + 0.3], 0.012, 3);
      f.mat(hex(0x3a8a5a), T.plastic).cyl(x + 0.5, 0.25, z, 0.22, 0.12, 12, "x", 0.22, 3);
      f.mat(hex(0x5ab05a), T.plastic).ring(x + 0.5, 0.25, z, 0.17, 0.012, 12, "x");
    }
    // the greenhouse: an aluminium frame, glass, staging with seedlings
    if (pur.greenhouse) {
      const x = A.x0 + 1.1, z = (A.back !== undefined ? A.back : dz - 2) + 0.8;
      f.push(x, 0, z, 0);
      f.mat(C.alu, T.metal);
      const gw = 1.8, gl = 1.4, gh = 1.8;
      for (const sx of [-gw / 2, gw / 2]) for (const sz of [-gl / 2, gl / 2]) f.stand(sx, 0, sz, 0.03, gh, 0.03, 55);
      f.rod([-gw / 2, gh + 0.4, 0], [gw / 2, gh + 0.4, 0], 0.02, 4);
      for (const sx of [-gw / 2, 0, gw / 2]) for (const sz of [-1, 1]) f.rod([sx, gh, sz * gl / 2], [sx, gh + 0.4, 0], 0.015, 3);
      f.mat(hex(0xc8d8d8), T.glass);
      f.quad([-gw / 2, 0.02, gl / 2], [gw / 2, 0.02, gl / 2], [gw / 2, gh, gl / 2], [-gw / 2, gh, gl / 2]).quad([gw / 2, 0.02, -gl / 2], [-gw / 2, 0.02, -gl / 2], [-gw / 2, gh, -gl / 2], [gw / 2, gh, -gl / 2]);
      f.quad([gw / 2, 0.02, gl / 2], [gw / 2, 0.02, -gl / 2], [gw / 2, gh, -gl / 2], [gw / 2, gh, gl / 2]).quad([-gw / 2, 0.02, -gl / 2], [-gw / 2, 0.02, gl / 2], [-gw / 2, gh, gl / 2], [-gw / 2, gh, -gl / 2]);
      f.quad([-gw / 2, gh, gl / 2], [gw / 2, gh, gl / 2], [gw / 2, gh + 0.4, 0], [-gw / 2, gh + 0.4, 0]).quad([gw / 2, gh, -gl / 2], [-gw / 2, gh, -gl / 2], [-gw / 2, gh + 0.4, 0], [gw / 2, gh + 0.4, 0]);
      f.mat(C.alu, T.metal); for (let k = 1; k < 4; k++) f.box(-gw / 2 + k * gw / 4, gh / 2, gl / 2 + 0.01, 0.02, gh, 0.02, 55);
      f.pop();
    }
    // the farmer's rice racks (はざかけ) and the crates, the fisherman's floats and nets, the dried-fish racks, the surfboards
    if (pur.farm) {
      const [x, z] = spot();
      f.push(x, 0, z, 0);
      f.mat(C.woodDark, T.bark); for (let k = 0; k < 3; k++) { const px = -1 + k; f.rod([px - 0.3, 0, -0.2], [px, 1.5, 0], 0.03, 4).rod([px + 0.3, 0, 0.2], [px, 1.5, 0], 0.03, 4); }
      f.rod([-1.2, 1.4, 0], [1.2, 1.4, 0], 0.025, 4);
      f.mat(hex(0xc8a85a), T.cloth); for (let k = 0; k < 10; k++) f.box(-1.1 + k * 0.24, 1.15, 0, 0.18, 0.5, 0.14, 55);
      f.mat(hex(0x3a6aa8), T.plastic); for (let k = 0; k < 3; k++) f.stand(1.4, k * 0.3, 0.6, 0.5, 0.3, 0.36, 55);
      f.pop();
    }
    if (pur.fishing) {
      const [x, z] = spot();
      f.push(x, 0, z, r() * 3);
      f.mat(hex(0x2a5a4a), T.cloth).blob(0, 0.25, 0, 0.7, 0.25, 0.5, D.seed, 0.4);                               // a heap of net
      f.mat(hex(0xe0a020), T.plastic); for (let k = 0; k < 6; k++) f.blob(0.9 + (k % 3) * 0.24, 0.12 + Math.floor(k / 3) * 0.2, (k % 2) * 0.2, 0.12, 0.12, 0.12, k, 0.02);   // floats
      f.mat(C.white, T.plastic); for (let k = 0; k < 4; k++) f.stand(-1.0, k * 0.28, 0.2, 0.6, 0.28, 0.4, 55);    // styrofoam fish boxes
      f.mat(C.rubber, T.plastic).stand(-0.4, 0, 0.6, 0.1, 0.45, 0.25, 55).stand(-0.25, 0, 0.6, 0.1, 0.45, 0.25, 55);   // boots
      f.pop();
    }
    if (pur.racks) {
      const [x, z] = spot();
      f.push(x, 0, z, 0);
      f.mat(C.steel, T.metal); for (const sx of [-0.9, 0.9]) f.stand(sx, 0, 0, 0.04, 1.0, 0.04, 55);
      for (let k = 0; k < 3; k++) { f.mat(hex(0x3a6a8a), T.cloth).box(0, 0.5 + k * 0.22, 0, 1.8, 0.02, 0.6, 55); f.mat(hex(0xb8a080), T.metal); for (let j = 0; j < 9; j++) f.box(-0.8 + j * 0.2, 0.52 + k * 0.22, (j % 2 - 0.5) * 0.2, 0.08, 0.012, 0.22, 4); }
      f.pop();
    }
    if (pur.boards) {
      const [x, z] = spot();
      for (let k = 0; k < 4; k++) { f.push(x + k * 0.3, 0, z, 0); f.mat(pick(r, [C.white, hex(0x3ab0c0), hex(0xf0d050), hex(0xe86a3a)]), T.plastic).box(0, 1.0, 0, 0.5, 2.0, 0.07, 55); f.pop(); }
    }
    if (pur.pole) {                                           // the barber's pole: red, white and blue bands round a glass drum, a cap top and bottom
      f.push(A.x1 - 0.6, 0, dz, 0);
      f.mat(C.alu, T.metal).cyl(0, 1.0, 0, 0.13, 0.12, 10, "y").cyl(0, 2.02, 0, 0.13, 0.1, 10, "y");
      for (let k = 0; k < 9; k++) f.mat([C.red, C.white, C.blue][k % 3], T.glass, 1).cyl(0, 1.12 + k * 0.1, 0, 0.11, 0.1, 10, "y", 0.11, 0);
      f.mat(C.steel, T.metal).stand(0, 0, 0, 0.04, 1.0, 0.04, 55);
      f.pop();
    }
    if (pur.vending) for (let k = 0; k < pur.vending; k++) vendingMachine(D, f, A.x1 - 0.8 - k * 1.05, dz + 0.1);
    if (pur.id === "cafe" || pur.id === "teashop") {          // the A-board menu, a bench, the herb pots
      const [x, z] = spot();
      f.push(x, 0, z, 0.3);
      f.mat(C.woodDark, T.timber).rod([-0.25, 0, 0.2], [-0.25, 0.9, 0], 0.02, 4).rod([0.25, 0, 0.2], [0.25, 0.9, 0], 0.02, 4).rod([-0.25, 0, -0.2], [-0.25, 0.9, 0], 0.02, 4).rod([0.25, 0, -0.2], [0.25, 0.9, 0], 0.02, 4);
      f.mat(hex(0x2a2e2a), T.slate).quad([-0.24, 0.1, 0.18], [0.24, 0.1, 0.18], [0.24, 0.85, 0.02], [-0.24, 0.85, 0.02]);
      f.pop();
      bench(D, f, x + 1.2, z);
    }
    if (pur.workshop && pur.id === "cyclefix") {               // tyres hung on the wall, an air pump, a bike up on the stand
      for (let k = 0; k < 4; k++) f.mat(C.rubber, T.plastic).ring(A.x0 + 0.8 + k * 0.08, 1.8 - k * 0.05, dz - 1.0, 0.32, 0.025, 16, "x");
      f.mat(hex(0xd83a3a), T.plastic).cyl(A.x0 + 1.4, 0, dz - 0.4, 0.05, 0.6, 8, "y", 0.04, 2).rod([A.x0 + 1.4, 0.6, dz - 0.4], [A.x0 + 1.6, 0.4, dz - 0.2], 0.008, 3);
    }
    if (pur.id === "pottery") for (let k = 0; k < 8; k++) { const [x, z] = spot(); f.mat(pick(r, [hex(0x8a5a3a), hex(0x3a3a3a), hex(0xc8b89a), hex(0x4a5a6a)]), T.brick).cyl(x, 0, z, 0.12, 0.3, 10, "y", 0.07, 2); }
    // the bins: a household rubbish bin with its lid, a recycling crate of bottles; an umbrella stand by the door, the sandals
    const [bx, bz] = spot();
    f.mat(hex(pick(r, [0x3a6a4a, 0x6a6a6a, 0x2a3a5a])), T.plastic).stand(bx, 0, bz, 0.45, 0.6, 0.45, 55).box(bx, 0.63, bz, 0.48, 0.06, 0.48, 55);
    if (r() < 0.5) { f.mat(hex(0xe8c030), T.plastic).stand(bx + 0.6, 0, bz, 0.45, 0.3, 0.32, 55); f.mat(hex(0x5a7a3a), T.glass); for (let k = 0; k < 6; k++) f.cyl(bx + 0.45 + (k % 3) * 0.12, 0.2, bz - 0.06 + Math.floor(k / 3) * 0.12, 0.035, 0.22, 6, "y", 0.02, 2); }
    if (D.doorX !== undefined) { f.mat(hex(pick(r, [0x8a8a8a, 0x2a2a2a, 0xc8b8a0])), T.metal).stand(D.doorX + 0.75, 0.44, D.d / 2 + 0.4, 0.24, 0.42, 0.24, 55); f.mat(pick(r, CLOTHES), T.cloth); for (let k = 0; k < 3; k++) f.rod([D.doorX + 0.7 + k * 0.05, 0.6, D.d / 2 + 0.4], [D.doorX + 0.68 + k * 0.06, 1.25, D.d / 2 + 0.43], 0.025, 5); }
    // a laundry stand in the garden for a single-storey house (no balcony)
    if (D.floors < 2 && r() < 0.7) {
      const [x, z] = spot();
      f.mat(C.concrete, T.concrete).stand(x - 1, 0, z, 0.3, 0.1, 0.3, 55).stand(x + 1, 0, z, 0.3, 0.1, 0.3, 55);
      f.mat(C.alu, T.metal).rod([x - 1, 0.1, z], [x - 1, 1.7, z], 0.02, 4).rod([x + 1, 0.1, z], [x + 1, 1.7, z], 0.02, 4).rod([x - 1.1, 1.65, z], [x + 1.1, 1.65, z], 0.016, 4);
      for (let k = 0; k < 4; k++) f.mat(pick(r, CLOTHES), T.cloth).box(x - 0.75 + k * 0.5, 1.35, z, 0.4, 0.55, 0.012, 51);
    }
  }
  function vendingMachine(D, f, x, z) {
    // body, the lit dummy-can window with three rows of cans, the selection buttons, the coin slot, the take-out flap, the bin beside it
    const r = D.r, bc = pick(r, [hex(0xd83030), hex(0x2a5ab0), hex(0xf0f0f0), hex(0x3a3a3c), hex(0x30a050)]);
    f.push(x, 0, z, 0);
    f.mat(bc, T.metal).stand(0, 0, 0, 1.0, 1.83, 0.7, 55);
    f.mat(hex(0xe8f0f4), T.glass, 1).box(0, 1.35, 0.352, 0.86, 0.62, 0.01, 16);
    for (let row = 0; row < 3; row++) for (let k = 0; k < 8; k++) { f.mat(pick(r, [hex(0xc83a2a), hex(0x2a4a9a), hex(0xe8d8a0), hex(0x3a8a3a), hex(0x8a5a2a), hex(0xf0f0f0)]), T.metal).cyl(-0.37 + k * 0.105, 1.1 + row * 0.2, 0.36, 0.028, 0.13, 6, "y", 0.028, 2); f.mat(C.black, T.plastic).box(-0.37 + k * 0.105, 1.07 + row * 0.2, 0.37, 0.05, 0.015, 0.01, 16); }
    f.mat(C.black, T.metal).box(0, 0.25, 0.352, 0.6, 0.18, 0.02, 16).box(0.3, 0.85, 0.352, 0.12, 0.28, 0.02, 16);
    f.mat(C.alu, T.metal).box(0.3, 0.9, 0.365, 0.04, 0.08, 0.01, 16);
    f.mat(C.offwhite, T.plastic).stand(0.62, 0, 0.1, 0.3, 0.8, 0.3, 55);
    f.pop();
  }

  // =====================================================================================================================
  // BUILD: the house as the game asks for it (via buildingDetail). Returns a Group in the box's frame.
  // =====================================================================================================================
  H.isHouse = b => !!(H.on && b && b.house);
  function pass(b, which) {
    const D = b.house.plan || (b.house.plan = design(b));
    D.r = mulberry(D.seed ^ 0x9e3779b9);                        // the same house every time it is built
    const g = which === "shell" ? new GB() : new NullGB(), fine = which === "fine" ? new GB() : new NullGB(), sb = new SB();
    D.sb = sb;
    walls(D, g);
    openings(D, g, fine, sb);
    roof(D, g);
    balcony(D, g, fine);
    if (D.purpose.apartment) apartment(D, g, fine, sb);
    services(D, g, fine);
    lot(D, g, fine, sb);
    return { D: D, g: which === "shell" ? g : fine, sb: sb };
  }
  // ctx (from konto.html): { hi: gfx.high, env: gfx.env, night: nightMats, nightLit: nightState.lit }
  H.ctx = { hi: true, env: null, night: null, nightLit: 0 };
  H.pending = new Set();
  // The house's shell: walls, windows, doors, roof and its covering, gutters, balcony, services on the walls, the boundary
  // walls and the gate. The clutter (plants, bikes, meters, laundry, bins, the household's things) follows when you come near.
  H.build = function (b, ctx) {
    const t0 = performance.now();
    if (ctx) H.ctx = ctx;
    const P0 = pass(b, "shell"), D = P0.D;
    const hi = H.ctx.hi !== false;
    const root = new THREE.Group(), mat = material(hi, H.ctx.env);
    registerNight(mat, 1.35); registerNight(signMaterial(hi), D.purpose.shop ? 0.55 : 0.2);
    const sg = toGeometry(P0.g);
    if (sg) { const m = new THREE.Mesh(sg, mat); m.castShadow = true; m.receiveShadow = true; m.name = "house-shell"; root.add(m); }
    const sm = P0.sb.mesh(hi); if (sm) { sm.name = "house-signs"; root.add(sm); }
    const lod = new THREE.LOD(), slot = new THREE.Group(); slot.name = "house-clutter";
    lod.addLevel(slot, 0); lod.addLevel(new THREE.Object3D(), H.clutterRange); root.add(lod);
    // the box's frame: the house was built facing +z; turn it to face the street
    const f = b.house.front, turn = f === 0 ? 0 : f === 1 ? Math.PI : f === 2 ? Math.PI / 2 : -Math.PI / 2;
    root.position.set(b.c[0], b.y, b.c[1]);
    root.rotation.y = b.yaw * Math.PI / 180 + turn;
    root.updateMatrixWorld(true);
    root.userData.house = b.house; root.userData.box = b; root.userData.slot = slot; root.userData.tris = P0.g.tris() + P0.sb.ix.length / 3;
    H.pending.add(root);
    H.built++; H.tris += root.userData.tris;
    H.lastMs = performance.now() - t0;
    // the realism engine learns where the door really is
    try { if (window.realism && realism.registerDoor && b.house.plot && b.house.home) realism.registerDoor(b.house.plot, b.house.home.door, b.house.idx); } catch (e) { /* its API moved */ }
    return root;
  };
  H.clutter = function (root) {
    const b = root.userData.box, t0 = performance.now();
    const P1 = pass(b, "fine"), hi = H.ctx.hi !== false, slot = root.userData.slot;
    const fg = toGeometry(P1.g);
    if (fg) { const m = new THREE.Mesh(fg, material(hi, H.ctx.env)); m.receiveShadow = true; m.castShadow = false; slot.add(m); }
    const sm = P1.sb.mesh(hi); if (sm) slot.add(sm);
    root.userData.clutter = true; root.userData.tris += P1.g.tris();
    H.clutterMs = performance.now() - t0;
  };
  function dropClutter(root) {
    const slot = root.userData.slot;
    for (let i = slot.children.length - 1; i >= 0; i--) { const o = slot.children[i]; slot.remove(o); if (o.geometry) o.geometry.dispose(); }
    root.userData.clutter = false;
  }
  // each frame or two: build the clutter of the nearest house that needs it (within the time the performance engine allows),
  // and let go of clutter far behind you so the memory goes to what is near
  function clutterTick(cam) {
    if (!cam || !H.pending.size) return;
    const near = H.clutterRange + 18, far = H.clutterRange * 3.2;
    let best = null, bd = 1e9;
    for (const root of H.pending) {
      if (!root.parent) { H.pending.delete(root); continue; }
      const dx = root.position.x - cam.x, dz = root.position.z - cam.z, dd = Math.sqrt(dx * dx + dz * dz);
      if (root.userData.clutter) { if (dd > far || !root.visible) dropClutter(root); continue; }
      if (root.visible && dd < near && dd < bd) { bd = dd; best = root; }
    }
    if (!best) return;
    const P = window.KONTO_PERF;
    const lim = P && P.on && P.budget ? P.budget("houses", 4) : 4;
    if (lim < 1.5 && bd > 30) return;                         // a full frame: wait unless it is right in front of you
    H.clutter(best);
  }
  function registerNight(m, gain) {
    const nm = H.ctx.night;
    if (!nm || !Array.isArray(nm)) return;
    if (!nm.some(n => n.m === m)) { nm.push({ m: m, gain: gain }); m.emissiveIntensity = (H.ctx.nightLit || 0) * gain; }
  }

  // ---- the city's side ------------------------------------------------------------------------------------------------------
  // konto.html calls register() for every house box it lays out; homes() is for the realism engine and the phone's map.
  H.register = function (b) {
    if (!b.house) return;
    if (!b.house.plan) b.house.plan = design(b);
    const D = b.house.plan, f = b.house.front, yaw = b.yaw * Math.PI / 180 + (f === 0 ? 0 : f === 1 ? Math.PI : f === 2 ? Math.PI / 2 : -Math.PI / 2);
    const fx = Math.sin(yaw), fz = Math.cos(yaw), out = D.d / 2 + 1.4;
    const home = {
      id: "h" + (H.list.length + 1), purpose: D.id, label: D.label, region: D.region || "tokonto",
      pos: [b.c[0], b.c[1]], y: b.y, yaw: yaw, door: [b.c[0] + fx * out, b.c[1] + fz * out], floors: D.floors,
      surname: D.surname, family: ROMAJI[D.surname] || D.surname, hours: D.hours ? { open: D.hours[0], close: D.hours[1] } : null,
      household: D.folk, empty: D.empty, shop: !!D.purpose.shop, box: b
    };
    b.house.home = home;
    // letter the boards now, behind the loading screen, not the first time someone walks past
    try { if (typeof document !== "undefined") { D.signs.forEach(sg => signSlot(Object.assign({ seed: D.seed + sg.text }, sg))); signSlot(nameplate(D)); if (D.purpose.apartment) signSlot(aptSign(D)); } } catch (e) { /* no canvas */ }
    H.list.push(home); H.byPurpose[D.id] = (H.byPurpose[D.id] || 0) + 1;
  };
  H.reset = function () { H.list.length = 0; H.byPurpose = {}; H.built = 0; H.tris = 0; };
  H.homes = function () { return H.list; };
  H.near = function (x, z, R) { R = R || 50; return H.list.filter(h => Math.hypot(h.pos[0] - x, h.pos[1] - z) < R); };
  // who should be home at a time of day (minutes after midnight): the routine hook
  H.atHome = function (home, min) {
    return (home.household || []).filter(m => {
      if (m.leaveMin === null || m.backMin === null) return true;
      if (m.leaveMin < m.backMin) return !(min >= m.leaveMin && min < m.backMin);
      return !(min >= m.leaveMin || min < m.backMin);       // a night shift
    });
  };
  // the driveways, as parking bays for the game's own parked-car system (the household's car is a real, enterable car)
  H.bays = function () {
    const out = [], KIND = { kei: 0, hatch: 1, sedan: 2, suv: 3, keivan: 4, onebox: 5 };
    H.list.forEach(h => {
      const b = h.box, D = b.house.plan; if (!D || D.empty) return;
      // the drive is only known after design: recompute the same decision cheaply by building the plan's lot numbers
      const dv = D.driveAt || planDrive(D); if (!dv) return;
      const cy = Math.cos(h.yaw), sy = Math.sin(h.yaw);
      const wx = b.c[0] + dv.x * cy + dv.z * sy, wz = b.c[1] - dv.x * sy + dv.z * cy;
      const want = D.purpose.car ? pick(mulberry(D.seed + 5), D.purpose.car) : "kei", k = KIND[want] !== undefined ? KIND[want] : 0;
      out.push({ x: wx, z: wz, yaw: h.yaw + (mulberry(D.seed + 9)() < 0.5 ? 0 : Math.PI), occ: !!D.purpose.car && mulberry(D.seed + 7)() < 0.8, kind: (k + 0.5) / 8, spawned: null, home: h.id });
    });
    return out;
  };
  // the drive decision without building (mirrors lot())
  function planDrive(D) {
    const r = mulberry(D.seed ^ 0x51ed27), pur = D.purpose, w = D.w, d = D.d;
    const L = { x0: D.lc[0] - D.lotW / 2, x1: D.lc[0] + D.lotW / 2, z1: D.lc[1] + D.lotD / 2 };
    const front = L.z1, yard = front - (d / 2 + E), sideL = -w / 2 - L.x0, sideR = L.x1 - w / 2;
    if (D.region === "nara" || yard < 1.2 || !pur.car || D.empty) return null;
    let dv = null;
    if (Math.max(sideL, sideR) > 2.9) { const sx = sideR > sideL ? 1 : -1; dv = { x: sx * (w / 2 + (sx > 0 ? sideR : sideL) / 2), z: front - 2.7 }; }
    else if (yard > 5.4) dv = { x: (r() < 0.5 ? -1 : 1) * w / 4, z: front - 2.7 };
    D.driveAt = dv;
    return dv;
  }

  // the households' evenings: how many windows are lit at this time of day (minutes after midnight)
  function litShare(min) {
    const h = min / 60;
    if (h < 4.5) return lerp(0.12, 0.05, h / 4.5);
    if (h < 7) return lerp(0.08, 0.45, (h - 4.5) / 2.5);           // up early: the kitchen lights
    if (h < 9) return lerp(0.45, 0.1, (h - 7) / 2);
    if (h < 16.5) return 0.1;
    if (h < 19.5) return lerp(0.1, 0.72, (h - 16.5) / 3);          // home from school and work
    if (h < 22.5) return lerp(0.72, 0.5, (h - 19.5) / 3);
    return lerp(0.5, 0.12, (h - 22.5) / 1.5 > 1 ? 1 : (h - 22.5) / 1.5);
  }
  H.tick = function (cam) {
    clutterTick(cam);
    try { const m = typeof window.gameMinutes === "function" ? window.gameMinutes() : 20 * 60; H.lit.value = litShare(m); } catch (e) { H.lit.value = 0.5; }
    if (SIGN.dirty && SIGN.tex) { SIGN.tex.needsUpdate = true; SIGN.dirty = false; }
  };
  H.stats = function () { return { houses: H.list.length, built: H.built, avgTris: H.built ? Math.round(H.tris / H.built) : 0, lastMs: +(H.lastMs || 0).toFixed(1), purposes: H.byPurpose, signs: SIGN.n, lit: +H.lit.value.toFixed(2) }; };
  // for tools and tests: build a house from a bare description
  H.demo = function (o) {
    const b = { c: [o.x || 0, o.z || 0], y: o.y || 0, yaw: o.yaw || 0, size: o.size || [8, 8], h: o.h || 6.4,
                house: { seed: o.seed || 1, region: o.region || "", front: o.front || 0, purpose: o.purpose, lot: o.lot || [o.size ? o.size[0] + 4 : 12, o.size ? o.size[1] + 8 : 16], lotOff: o.lotOff || [0, 2.5], floors: o.floors } };
    if (o.layout) { const lay = H.layout({ seed: b.house.seed, region: b.house.region, lot: b.house.lot, front: b.house.front }); b.size = lay.size; b.h = lay.h; b.house.purpose = o.purpose || lay.purpose; b.house.floors = lay.floors; b.house.lotOff = [-lay.off[0], -lay.off[1]]; }
    return { box: b, group: H.build(b) };
  };
  H.purposes = P;
})();
