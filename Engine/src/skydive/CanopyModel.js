// The parachute as a thing you can look at: a ram-air canopy with its cells, ribs, open nose inlets, stabilisers and
// pillowed skins; the suspension lines in their cascades down to four risers; the brake lines to the toggles; the slider;
// the pilot chute on its bridle; and the container on the jumper's back. Everything moves with the flight model:
// the canopy fills from the centre cells outward, the slider comes down the lines, the trailing edge comes down with
// each toggle, and the fabric breathes and flutters.
//
// Materials are full PBR (base colour, tangent-space normal and roughness maps), painted at load: zero-porosity ripstop
// nylon with its 5 mm reinforcement grid, taped seams along every rib and the chord-wise load tapes; Cordura for the
// container; nylon webbing for the risers.
//
//   const rig = new CanopyRig(THREE, { spec: CANOPY_SPECS.base, scheme: "ink" });
//   scene.add(rig.group);   // origin at the jumper's shoulders (where the risers meet the harness), +z forward, +y up
//   rig.update({ fill, slider, brakeL, brakeR, risers, pcOut, linesOut, phase, t });
//   const pack = rig.makeContainer();  // add to the jumper's spine bone

export const CANOPY_SCHEMES = {
  // original designs: colours in sRGB hex, one per cell from the left tip; "accent" for the stabilisers and tapes
  ink:     { cells: ["#13161c", "#1d2330", "#c8102e", "#f2efe8", "#c8102e", "#1d2330", "#13161c", "#1d2330", "#13161c"], accent: "#c8102e", under: "#1b1f27" },
  sunrise: { cells: ["#f2efe8", "#f39a1e", "#e4572e", "#f2efe8", "#e4572e", "#f39a1e", "#f2efe8", "#f39a1e", "#e4572e"], accent: "#1d2330", under: "#d9d2c3" },
  harbour: { cells: ["#0d3b66", "#f2efe8", "#0d3b66", "#4d9de0", "#f2efe8", "#4d9de0", "#0d3b66", "#f2efe8", "#0d3b66"], accent: "#f2efe8", under: "#13304f" },
  sakura:  { cells: ["#f2efe8", "#e8a0b4", "#f2efe8", "#b8325a", "#f2efe8", "#b8325a", "#f2efe8", "#e8a0b4", "#f2efe8"], accent: "#b8325a", under: "#e5d9d6" }
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ---- painted PBR maps ----------------------------------------------------------------------------------------------------------------------
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
// a tangent-space normal map from a height field (Sobel), strength in "pixels of slope"
function normalFromHeight(H, w, h, strength) {
  const c = canvas(w, h), g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  const at = (x, y) => H[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = -dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}
function grayCanvas(V, w, h) {
  const c = canvas(w, h), g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  for (let i = 0; i < w * h; i++) { const v = clamp(V[i], 0, 1) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
}
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// The canopy fabric over the whole wing: u across the span (one band per cell), v along the chord.
function paintCanopy(scheme, cells, top) {
  const W = 1024, Hh = 512, c = canvas(W, Hh), g = c.getContext("2d"), R = rnd(top ? 7 : 11);
  const cw = W / cells;
  for (let i = 0; i < cells; i++) {
    const col = top ? scheme.cells[i % scheme.cells.length] : scheme.under;
    g.fillStyle = col; g.fillRect(Math.floor(i * cw), 0, Math.ceil(cw) + 1, Hh);
    // a faint sheen gradient across each cell (the pillow catches light) and dye variation between panels
    const gr = g.createLinearGradient(i * cw, 0, (i + 1) * cw, 0);
    gr.addColorStop(0, "rgba(0,0,0,0.10)"); gr.addColorStop(0.5, "rgba(255,255,255,0.05)"); gr.addColorStop(1, "rgba(0,0,0,0.10)");
    g.fillStyle = gr; g.fillRect(i * cw, 0, cw, Hh);
    for (let p = 0; p < 4; p++) { g.fillStyle = "rgba(" + (R() < 0.5 ? "0,0,0" : "255,255,255") + "," + (0.015 + R() * 0.02) + ")"; g.fillRect(i * cw, p * Hh / 4, cw, Hh / 4); }
  }
  // taped seams on every rib, load tapes along the chord, the leading-edge reinforcement
  const [ar, ag, ab] = hex(scheme.accent);
  for (let i = 0; i <= cells; i++) { g.fillStyle = "rgba(20,20,22,0.55)"; g.fillRect(i * cw - 3, 0, 6, Hh); g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(i * cw - 1, 0, 1, Hh); }
  for (let i = 0; i < cells; i++) { g.fillStyle = "rgba(15,15,18,0.22)"; g.fillRect(i * cw + cw / 2 - 1.5, 0, 3, Hh); }
  g.fillStyle = "rgba(" + ar + "," + ag + "," + ab + ",0.9)"; g.fillRect(0, 0, W, 10);
  if (top) {
    // an original mark on the centre cells: a rising-sun disc and a stripe (nobody's logo)
    const cx = W / 2, cy = Hh * 0.42;
    g.fillStyle = "rgba(" + ar + "," + ag + "," + ab + ",0.92)"; g.beginPath(); g.arc(cx, cy, cw * 0.32, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(242,239,232,0.9)"; g.fillRect(cx - cw * 1.4, Hh * 0.72, cw * 2.8, 9);
  }
  // fabric grain and wear
  const id = g.getImageData(0, 0, W, Hh), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 9; d[i] = clamp(d[i] + n, 0, 255); d[i + 1] = clamp(d[i + 1] + n, 0, 255); d[i + 2] = clamp(d[i + 2] + n, 0, 255); }
  g.putImageData(id, 0, 0);
  // height: the ripstop grid (heavier threads every 5 mm, at this scale a fine lattice), the seams, puckering by the tapes
  const H = new Float32Array(W * Hh), Rg = new Float32Array(W * Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const gx = (x % 8) < 1 ? 1 : 0, gy = (y % 8) < 1 ? 1 : 0;
    const u = (x % cw) / cw, seam = Math.min(u, 1 - u) * cw < 4 ? 1 : 0, mid = Math.abs(u - 0.5) * cw < 2 ? 0.6 : 0;
    const pucker = Math.exp(-Math.min(u, 1 - u) * cw / 9) * 0.5 * (0.5 + 0.5 * Math.sin(y * 0.35 + x * 0.05));
    H[y * W + x] = gx * 0.35 + gy * 0.35 + seam * 1.2 + mid + pucker + (R() - 0.5) * 0.08;
    Rg[y * W + x] = 0.48 + seam * 0.18 + (gx || gy ? 0.05 : 0) + (R() - 0.5) * 0.06;
  }
  return { map: c, normal: normalFromHeight(H, W, Hh, 1.6), rough: grayCanvas(Rg, W, Hh) };
}
function paintWeave(base, seed, w = 512, h = 512, coarse = 4, roughBase = 0.78) {
  const c = canvas(w, h), g = c.getContext("2d"), R = rnd(seed), [r0, g0, b0] = hex(base);
  const img = g.createImageData(w, h), d = img.data, H = new Float32Array(w * h), Rg = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const over = ((Math.floor(x / coarse) + Math.floor(y / coarse)) & 1) ? 1 : 0;
    const t = over ? Math.sin((x % coarse) / coarse * Math.PI) : Math.sin((y % coarse) / coarse * Math.PI);
    const n = (R() - 0.5) * 14 + t * 10 - 5, i = (y * w + x) * 4;
    d[i] = clamp(r0 + n, 0, 255); d[i + 1] = clamp(g0 + n, 0, 255); d[i + 2] = clamp(b0 + n, 0, 255); d[i + 3] = 255;
    H[y * w + x] = t; Rg[y * w + x] = roughBase + (R() - 0.5) * 0.1 - t * 0.06;
  }
  g.putImageData(img, 0, 0);
  return { map: c, normal: normalFromHeight(H, w, h, 2.2), rough: grayCanvas(Rg, w, h) };
}

// ---- the rig -------------------------------------------------------------------------------------------------------------------------------
export class CanopyRig {
  constructor(THREE, o = {}) {
    this.THREE = THREE;
    this.spec = o.spec;
    this.scheme = CANOPY_SCHEMES[o.scheme] || CANOPY_SCHEMES.ink;
    this.group = new THREE.Group(); this.group.name = "canopy-rig";
    this.cells = this.spec.cells; this.NU = this.cells * 6; this.NV = 18;
    this.mats = this.materials();
    this.buildWing();
    this.buildLines();
    this.buildRisers();
    this.buildSlider();
    this.buildPilot();
    this.update({ fill: 1, slider: 0, brakeL: 0, brakeR: 0, risers: 0, pcOut: 1, linesOut: 1, phase: "canopy", t: 0 });
  }

  tex(cnv, srgb, rep) {
    const T = this.THREE, t = new T.CanvasTexture(cnv);
    if (srgb) t.encoding = T.sRGBEncoding;
    t.anisotropy = 8; t.wrapS = t.wrapT = T.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]);
    return t;
  }
  pbr(set, extra, rep) {
    const T = this.THREE;
    return new T.MeshStandardMaterial(Object.assign({
      map: this.tex(set.map, true, rep), normalMap: this.tex(set.normal, false, rep), roughnessMap: this.tex(set.rough, false, rep),
      roughness: 1, metalness: 0
    }, extra || {}));
  }
  materials() {
    const T = this.THREE, cells = this.cells;
    const top = paintCanopy(this.scheme, cells, true), bot = paintCanopy(this.scheme, cells, false);
    const m = {
      top: this.pbr(top, { side: T.DoubleSide, normalScale: new T.Vector2(0.6, 0.6) }),
      bottom: this.pbr(bot, { side: T.DoubleSide, normalScale: new T.Vector2(0.6, 0.6) }),
      rib: this.pbr(paintWeave(this.scheme.under, 21, 256, 256, 3, 0.6), { side: T.DoubleSide }, [2, 1]),
      stab: this.pbr(paintWeave(this.scheme.accent, 23, 256, 256, 3, 0.55), { side: T.DoubleSide }, [2, 2]),
      webbing: this.pbr(paintWeave("#23262c", 31, 256, 256, 2, 0.72), {}, [1, 6]),
      cordura: this.pbr(paintWeave("#1f2a36", 41, 512, 512, 3, 0.86), {}, [2, 2]),
      mesh: this.pbr(paintWeave("#2a2c30", 51, 256, 256, 2, 0.8), { side: T.DoubleSide }, [3, 3])
    };
    // Lines: braided Dyneema 1.5 mm, which at any distance you will see it from is narrower than a pixel. aaa-ok: line primitive, no surface to texture
    m.line = new T.LineBasicMaterial({ color: 0x2b2e33, transparent: true, opacity: 0.8 });
    return m;
  }

  // the inflated shape: span s in -1..1, chord v 0 (nose) .. 1 (tail), top or bottom skin
  // -> a point in the canopy's frame (origin at the riser confluence)
  shape(s, v, top, st) {
    const S = this.spec, half = S.span / 2, H = S.lines + 0.55;
    // spanwise arc: the wing is curved down at the tips (anhedral), as the line lengths pull it
    const ang = s * 0.62, R = half / Math.sin(0.62);
    let x = Math.sin(ang) * R, y = H - (1 - Math.cos(ang)) * R * 0.9;
    // aerofoil (a thick, blunt ram-air section): thickness ~17% chord, max at 25%
    const c = S.chord, th = 0.17 * c;
    const t = 2.9 * th * (Math.sqrt(v) * 0.297 - 0.126 * v - 0.351 * v * v + 0.284 * v * v * v - 0.1015 * v * v * v * v);
    const camber = 0.035 * c * Math.sin(Math.PI * Math.min(1, v / 0.95));
    let z = (0.3 - v) * c;                                    // nose forward (+z), the rigging point under 30% chord
    // pillowing: between ribs the pressurised cell bulges out, top and bottom
    const cf = ((s + 1) / 2) * this.cells, cu = cf - Math.floor(cf), pillow = Math.sin(Math.PI * cu) * 0.045 * c * (0.4 + Math.sqrt(Math.max(v, 0)) * 0.6) * (1 - v * 0.7);
    let yy = camber + (top ? t + pillow : -t * 0.35 - pillow * 0.6);
    // brakes: the trailing third deflects down, more toward the tips (the brake lines' cascade attaches there)
    const side = s < 0 ? st.brakeL : st.brakeR, tipW = 0.35 + 0.65 * Math.abs(s);
    const tail = smooth((v - 0.62) / 0.38), defl = (side * 0.62 + st.flutter * Math.sin(st.t * 23 + s * 9) * 0.02) * tail * tipW;
    yy -= Math.sin(defl) * (v - 0.62) * c * 1.15; z += (1 - Math.cos(defl)) * (v - 0.62) * c * 0.5;
    // front risers pull the nose down (pitch the whole wing)
    const pit = -0.06 * st.risers;
    const zz = z * Math.cos(pit) - yy * Math.sin(pit), yr = z * Math.sin(pit) + yy * Math.cos(pit);
    // thickness is laid off along the arc's normal, so the section stays square to the wing at the tips too
    return [x + Math.sin(ang) * yr, y + Math.cos(ang) * yr, zz];
  }

  buildWing() {
    const T = this.THREE, NU = this.NU, NV = this.NV;
    const grid = (nv) => {
      const g = new T.BufferGeometry(), n = (NU + 1) * (nv + 1);
      g.setAttribute("position", new T.BufferAttribute(new Float32Array(n * 3), 3));
      const uv = new Float32Array(n * 2), idx = [];
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= NU; i++) { const k = j * (NU + 1) + i; uv[k * 2] = i / NU; uv[k * 2 + 1] = j / nv; }
      for (let j = 0; j < nv; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, d = a + NU + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
      g.setAttribute("uv", new T.BufferAttribute(uv, 2)); g.setIndex(idx); return g;
    };
    this.topGeo = grid(NV); this.botGeo = grid(NV);
    this.top = new T.Mesh(this.topGeo, this.mats.top); this.bot = new T.Mesh(this.botGeo, this.mats.bottom);
    this.top.castShadow = true; this.top.frustumCulled = false; this.bot.frustumCulled = false;
    this.group.add(this.top, this.bot);
    // ribs: an aerofoil-shaped panel at every cell wall (you see them through the open nose and at the tips)
    const ribN = this.cells + 1, RV = 12;
    const rg = new T.BufferGeometry(), rp = new Float32Array(ribN * (RV + 1) * 2 * 3), ruv = new Float32Array(ribN * (RV + 1) * 2 * 2), ri = [];
    for (let r = 0; r < ribN; r++) for (let j = 0; j <= RV; j++) {
      const base = (r * (RV + 1) + j) * 2; ruv[base * 2] = j / RV; ruv[base * 2 + 1] = 0; ruv[base * 2 + 2] = j / RV; ruv[base * 2 + 3] = 1;
      if (j < RV) { const a = base, b = base + 1, c2 = base + 2, d = base + 3; ri.push(a, c2, b, b, c2, d); }
    }
    rg.setAttribute("position", new T.BufferAttribute(rp, 3)); rg.setAttribute("uv", new T.BufferAttribute(ruv, 2)); rg.setIndex(ri);
    this.ribGeo = rg; this.ribs = new T.Mesh(rg, this.mats.rib); this.ribs.frustumCulled = false; this.group.add(this.ribs); this.RV = RV;
    // stabilisers: the triangular panels hanging under each tip that keep the wing tracking straight
    const sg = new T.BufferGeometry(); sg.setAttribute("position", new T.BufferAttribute(new Float32Array(2 * 3 * 3), 3));
    sg.setAttribute("uv", new T.BufferAttribute(new Float32Array([0, 1, 1, 1, 0.5, 0, 0, 1, 1, 1, 0.5, 0]), 2));
    this.stabGeo = sg; this.stabs = new T.Mesh(sg, this.mats.stab); this.stabs.frustumCulled = false; this.group.add(this.stabs);
  }

  buildLines() {
    const T = this.THREE;
    // per rib: four rows of attachment (A, B, C, D), each line cascading to its riser; plus the brake lines
    this.lineRows = [0.04, 0.28, 0.52, 0.78];
    const ribN = this.cells + 1, n = ribN * this.lineRows.length + 2 * 5 + 2 * 4 + 1;
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    this.lineGeo = g; this.lines = new T.LineSegments(g, this.mats.line); this.lines.frustumCulled = false; this.group.add(this.lines);
  }
  buildRisers() {
    const T = this.THREE; this.risers = [];
    for (let k = 0; k < 4; k++) { const m = new T.Mesh(new T.BoxGeometry(0.045, 0.56, 0.006), this.mats.webbing); this.group.add(m); this.risers.push(m); }
    // toggles: the two handles on the rear risers
    this.toggles = [];
    for (let k = 0; k < 2; k++) { const m = new T.Mesh(new T.BoxGeometry(0.03, 0.14, 0.03), this.mats.webbing); this.group.add(m); this.toggles.push(m); }
  }
  buildSlider() {
    const T = this.THREE, g = new T.PlaneGeometry(1.1, 0.9, 6, 6); g.rotateX(-Math.PI / 2);
    this.sliderMesh = new T.Mesh(g, this.mats.mesh); this.sliderMesh.visible = !!this.spec.slider; this.group.add(this.sliderMesh);
    this.sliderBase = g.attributes.position.array.slice();
  }
  buildPilot() {
    const T = this.THREE, pc = new T.Group();
    const cap = new T.Mesh(new T.SphereGeometry(0.48, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), this.mats.stab); cap.position.y = 0.0; pc.add(cap);
    const net = new T.Mesh(new T.CylinderGeometry(0.33, 0.06, 0.55, 14, 1, true), this.mats.mesh); net.position.y = -0.38; pc.add(net);
    this.pilot = pc; this.group.add(pc);
    const bg = new T.BufferGeometry(); bg.setAttribute("position", new T.BufferAttribute(new Float32Array(6), 3));
    this.bridle = new T.Line(bg, this.mats.line); this.bridle.frustumCulled = false; this.group.add(this.bridle);
    // the deployment bag, while the lines come out of it
    this.bagMesh = new T.Mesh(new T.BoxGeometry(0.36, 0.2, 0.26), this.mats.cordura); this.group.add(this.bagMesh);
  }

  // The container on his back: a rounded Cordura pack with the reserve on top, the main below, the pilot chute pouch
  // at the bottom and the yoke over the shoulders. About 0.42 x 0.55 x 0.17 m.
  makeContainer() {
    const T = this.THREE, g = new T.Group(); g.name = "container";
    const rounded = (w, h, d, r) => {
      const geo = new T.BoxGeometry(w, h, d, 6, 8, 3), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const ix = clamp(x, -w / 2 + r, w / 2 - r), iy = clamp(y, -h / 2 + r, h / 2 - r), iz = clamp(z, -d / 2 + r, d / 2 - r);
        const dx = x - ix, dy = y - iy, dz = z - iz, l = Math.hypot(dx, dy, dz) || 1;
        p.setXYZ(i, ix + dx / l * Math.min(r, l), iy + dy / l * Math.min(r, l), iz + dz / l * Math.min(r, l));
      }
      geo.computeVertexNormals(); return geo;
    };
    const main = new T.Mesh(rounded(0.4, 0.34, 0.16, 0.05), this.mats.cordura); main.position.set(0, -0.08, 0); g.add(main);
    const res = new T.Mesh(rounded(0.38, 0.2, 0.13, 0.045), this.mats.cordura); res.position.set(0, 0.18, -0.01); g.add(res);
    const bot = new T.Mesh(rounded(0.3, 0.07, 0.1, 0.03), this.mats.cordura); bot.position.set(0, -0.28, 0.01); g.add(bot);
    for (const s of [-1, 1]) { const strap = new T.Mesh(new T.BoxGeometry(0.05, 0.5, 0.012), this.mats.webbing); strap.position.set(s * 0.13, 0.05, 0.085); g.add(strap); }
    main.castShadow = res.castShadow = true;
    g.userData.flap = main;
    return g;
  }

  // st: { fill 0..1, slider 0..1 (1 at the top), brakeL, brakeR, risers, pcOut, linesOut, phase, t }
  update(st) {
    const S = this.spec, NU = this.NU, NV = this.NV, cells = this.cells;
    st.flutter = st.phase === "canopy" ? 1 : 3;
    const fill = st.phase === "canopy" ? 1 : st.phase === "deploy" ? clamp(st.fill || 0, 0, 1) : 1;
    const stretch = st.phase === "deploy" ? clamp(st.linesOut || 0, 0, 1) : 1;
    const H = S.lines + 0.55;
    // each cell fills when the air has reached it: the centre first, the tips last
    const cellFill = (s) => smooth((fill - Math.abs(s) * 0.45) / 0.55);
    const P = (s, v, top) => {
      const f = cellFill(s), q = this.shape(s, v, top, st);
      if (f >= 0.999) return q;
      // the packed / streaming shape: everything in a narrow bundle above the lines, flapping
      const fl = Math.sin(st.t * 17 + s * 7 + v * 5) * 0.12 * (1 - f);
      const yTop = H * stretch;
      const c = [s * 0.18 + fl, yTop + 0.2 - v * 1.8 * (1 - f * 0.5) + (top ? 0.05 : 0), (0.3 - v) * 0.5 + fl * 0.5];
      const k = f * f;
      return [c[0] + (q[0] - c[0]) * k, c[1] + (q[1] - c[1]) * k, c[2] + (q[2] - c[2]) * k];
    };
    const fillSkin = (geo, top, v0) => {
      const a = geo.attributes.position.array;
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const s = i / NU * 2 - 1, v = top ? j / NV : v0 + (1 - v0) * j / NV, q = P(s, v, top), k = (j * (NU + 1) + i) * 3;
        a[k] = q[0]; a[k + 1] = q[1]; a[k + 2] = q[2];
      }
      geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
    };
    // the top skin wraps the nose; the bottom skin starts behind it, leaving the cell inlets open
    fillSkin(this.topGeo, true, 0); fillSkin(this.botGeo, false, 0.075);
    // ribs
    const ra = this.ribGeo.attributes.position.array, RV = this.RV;
    for (let r = 0; r <= cells; r++) { const s = r / cells * 2 - 1;
      for (let j = 0; j <= RV; j++) { const v = 0.02 + 0.98 * j / RV, t = P(s, v, true), b = P(s, Math.max(v, 0.075), false), base = ((r * (RV + 1) + j) * 2) * 3;
        ra[base] = t[0]; ra[base + 1] = t[1] - 0.01; ra[base + 2] = t[2]; ra[base + 3] = b[0]; ra[base + 4] = b[1] + 0.01; ra[base + 5] = b[2]; } }
    this.ribGeo.attributes.position.needsUpdate = true; this.ribGeo.computeVertexNormals(); this.ribGeo.computeBoundingSphere();
    // stabilisers under each tip
    const sa = this.stabGeo.attributes.position.array;
    [-1, 1].forEach((s, k) => { const a = P(s, 0.08, false), b = P(s, 0.85, false), m = P(s, 0.45, false);
      const drop = [m[0] - s * 0.05, m[1] - 0.75 * cellFill(s), m[2]];
      sa.set([a[0], a[1], a[2], b[0], b[1], b[2], drop[0], drop[1], drop[2]], k * 9); });
    this.stabGeo.attributes.position.needsUpdate = true; this.stabGeo.computeVertexNormals();
    this.stabs.visible = fill > 0.6;
    // risers (from the harness at the origin, up to the connector links) and toggles
    const rTop = 0.56, rx = 0.17;
    const riserEnds = [[-rx, rTop, 0.06], [-rx, rTop, -0.06], [rx, rTop, 0.06], [rx, rTop, -0.06]];
    this.risers.forEach((m, k) => { const e = riserEnds[k]; m.position.set(e[0] * 0.75, rTop / 2, e[2]); m.rotation.set(0, 0, -e[0] * 0.25); });
    this.toggles.forEach((m, k) => { const side = k ? 1 : -1, b = k ? st.brakeR : st.brakeL; m.position.set(side * (rx * 0.9 + b * 0.05), rTop - 0.05 - b * 0.55, -0.1 + b * 0.06); });
    // lines: rows to the front (A, B) and rear (C, D) risers, cascaded; brake lines to the toggles
    const la = this.lineGeo.attributes.position.array; let w = 0;
    const seg = (a, b) => { la[w++] = a[0]; la[w++] = a[1]; la[w++] = a[2]; la[w++] = b[0]; la[w++] = b[1]; la[w++] = b[2]; };
    const stretchF = stretch;
    for (let r = 0; r <= cells; r++) { const s = r / cells * 2 - 1;
      this.lineRows.forEach((v, k) => { const a = P(s, v, false), e = riserEnds[(s < 0 ? 0 : 2) + (k < 2 ? 0 : 1)];
        // cascade: two lines join a third about two thirds of the way down
        seg([a[0], a[1], a[2]], [e[0] + (a[0] - e[0]) * 0.03 * (1 - stretchF), e[1], e[2]]); }); }
    for (const side of [-1, 1]) {
      const tog = this.toggles[side < 0 ? 0 : 1].position, cas = [side * S.span * 0.22, H * 0.55, -S.chord * 0.25];
      seg([tog.x, tog.y, tog.z], cas);
      for (let k = 0; k < 4; k++) { const s = side * (0.25 + k * 0.25), te = P(s, 0.99, false); seg(cas, te); }
    }
    // the slider: up against the canopy while it opens, then down the lines to sit just over the risers
    const sl = st.phase === "deploy" ? clamp(st.slider !== undefined ? st.slider : 1, 0, 1) : 0;
    if (this.sliderMesh.visible) {
      const sy = 0.65 + sl * (H * stretch - 1.2);
      this.sliderMesh.position.set(0, sy, 0);
      const pa = this.sliderMesh.geometry.attributes.position.array, b0 = this.sliderBase;
      for (let i = 0; i < pa.length; i += 3) { pa[i] = b0[i] * (0.5 + sl * 0.6); pa[i + 2] = b0[i + 2] * (0.5 + sl * 0.6); pa[i + 1] = -Math.hypot(b0[i], b0[i + 2]) * 0.12 * sl + Math.sin(st.t * 9 + b0[i] * 8) * 0.02; }
      this.sliderMesh.geometry.attributes.position.needsUpdate = true; this.sliderMesh.geometry.computeVertexNormals();
    }
    // the pilot chute: above and behind the canopy on its bridle, collapsed once the canopy is flying (a kill-line PC)
    const top0 = P(0, 0.35, true), pcY = st.phase === "deploy" ? Math.max(top0[1], H * stretch) + 1.6 + 1.8 * clamp(st.pcOut || 0, 0, 1) : top0[1] + 0.9;
    this.pilot.position.set(0, pcY, top0[2] - (st.phase === "canopy" ? 2.6 : 0.6));
    this.pilot.rotation.set(st.phase === "canopy" ? -1.2 : 0, 0, 0);
    this.pilot.scale.setScalar(st.phase === "canopy" ? 0.55 : 0.6 + 0.4 * clamp(st.pcOut || 0, 0, 1));
    const ba = this.bridle.geometry.attributes.position.array; ba.set([top0[0], top0[1], top0[2], this.pilot.position.x, this.pilot.position.y - 0.4, this.pilot.position.z]);
    this.bridle.geometry.attributes.position.needsUpdate = true;
    this.bagMesh.visible = st.phase === "deploy" && fill < 0.2;
    this.bagMesh.position.set(0, H * stretch + 0.3, 0);
  }

  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    Object.values(this.mats).forEach(m => { ["map", "normalMap", "roughnessMap"].forEach(k => m[k] && m[k].dispose()); m.dispose(); });
  }
}
