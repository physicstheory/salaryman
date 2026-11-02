// SOTI Tower, 3F Customer Care: the floor, the desk, the laptop and the calls; the floor manager's job; Gondō.
//
// The floor is a room like the shops' (interior.js rules: walk round it, E on things), built here: carpet tiles, a ceiling of lit panels,
// glass on two sides with the city behind it, six clusters of desks with their people at them, Gondō's glass box in the corner, a copier,
// a water cooler, a whiteboard of numbers nobody likes. Every surface is a painted PBR set (base colour, normal and roughness maps made
// from the same painting), so it is lit like the rest of the world.
//
// The desk is first person: Seiko sits, the camera is his eyes, and the laptop in front of him is the game. A call rings, he answers,
// the caller talks (subtitles) and he picks what to say from the screen (1-3, arrows and Enter, the mouse on the screen, or the pad). Each
// caller has patience; kind and right answers keep it, wrong or rude ones burn it, and at nothing they hang up. How calm Seiko is when he
// sits down (the train and his phone help; a bad drive does not) is how long he has to think.
//
// As floor manager he walks the floor instead: people with a problem have a marker over them, and talking to them is a conversation where
// Gondō, his co-manager, usually has a worse idea. Morale and Gondō's goodwill are what it changes.
(function () {
  "use strict";
  const C = window.career; if (!C) return;
  const O = C.office = {};
  const W = 24, D = 18, H = 3.0;
  const SEAT = { x: -7.7, z: -3.95 };                       // Seiko's chair (room-local), facing -z (the window)
  const GONDO_DESK = { x: 10.0, z: -7.0 };

  // ---- painted PBR sets --------------------------------------------------------------------------------------------------------------------
  // One painting gives all three maps: the colour as painted, a normal map from its brightness (so grain, weave and seams have relief) and a
  // roughness map from it too, scaled into the range asked for.
  const cache = {};
  function canvas(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); return c; }
  function texOf(c, rep, srgb) {
    const t = new THREE.CanvasTexture(c); if (srgb) t.encoding = THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]);
    if (typeof sharpTex === "function") sharpTex(t);
    return t;
  }
  function deriveMaps(c, bump, r0, r1) {
    const w = c.width, h = c.height, src = c.getContext("2d").getImageData(0, 0, w, h).data;
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
    const n = document.createElement("canvas"); n.width = w; n.height = h;
    const r = document.createElement("canvas"); r.width = w; r.height = h;
    const nd = n.getContext("2d").createImageData(w, h), rd = r.getContext("2d").createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, L = lum[y * w + ((x + w - 1) % w)], R = lum[y * w + ((x + 1) % w)], U = lum[((y + h - 1) % h) * w + x], Dn = lum[((y + 1) % h) * w + x];
      let nx = (L - R) * bump, ny = (U - Dn) * bump, nz = 1; const k = 1 / Math.hypot(nx, ny, nz);
      nd.data[i * 4] = (nx * k * 0.5 + 0.5) * 255; nd.data[i * 4 + 1] = (ny * k * 0.5 + 0.5) * 255; nd.data[i * 4 + 2] = (nz * k * 0.5 + 0.5) * 255; nd.data[i * 4 + 3] = 255;
      const g = (r0 + (r1 - r0) * (1 - lum[i])) * 255; rd.data[i * 4] = rd.data[i * 4 + 1] = rd.data[i * 4 + 2] = g; rd.data[i * 4 + 3] = 255;
    }
    n.getContext("2d").putImageData(nd, 0, 0); r.getContext("2d").putImageData(rd, 0, 0);
    return { n: n, r: r };
  }
  // pbr(key, size, painter, { rep, bump, rough: [lo, hi], metal, transparent, opacity, side })
  function pbr(key, size, draw, o) {
    o = o || {};
    const ck = key + ":" + (o.rep ? o.rep.join("x") : "1");
    if (cache[ck]) return cache[ck];
    const base = cache["c:" + key] || (cache["c:" + key] = canvas(size, size, draw));
    const maps = cache["m:" + key] || (cache["m:" + key] = deriveMaps(base, o.bump || 2, (o.rough || [0.5, 0.8])[0], (o.rough || [0.5, 0.8])[1]));
    const m = new THREE.MeshStandardMaterial({ map: texOf(base, o.rep, true), normalMap: texOf(maps.n, o.rep, false), roughnessMap: texOf(maps.r, o.rep, false),
      roughness: 1, metalness: o.metal || 0, transparent: !!o.transparent, opacity: o.opacity === undefined ? 1 : o.opacity, side: o.side || THREE.FrontSide });
    m.userData.pbrDone = true;
    return (cache[ck] = m);
  }
  // a lit screen or sign: shows its picture at full brightness
  function screenMat(c) { const t = texOf(c, null, true); return new THREE.MeshBasicMaterial({ map: t, toneMapped: false }); }
  const noise = (g, w, h, n, a, light) => { for (let i = 0; i < n; i++) { g.fillStyle = (Math.random() < (light === undefined ? 0.5 : light) ? "rgba(255,255,255," : "rgba(0,0,0,") + (Math.random() * a) + ")"; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } };
  const P = {
    laminate: (g, w, h) => { g.fillStyle = "#d9c8a8"; g.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { const y = Math.random() * h; g.strokeStyle = "rgba(140,105,60," + (0.05 + Math.random() * 0.1) + ")"; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 3); g.stroke(); } noise(g, w, h, 4000, 0.05); },
    white: (g, w, h) => { g.fillStyle = "#e9e9e6"; g.fillRect(0, 0, w, h); noise(g, w, h, 5000, 0.04); },
    metal: (g, w, h) => { g.fillStyle = "#9aa1a8"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y++) { g.fillStyle = "rgba(" + (Math.random() < 0.5 ? "255,255,255" : "0,0,0") + "," + (Math.random() * 0.08) + ")"; g.fillRect(0, y, w, 1); } },
    darkmetal: (g, w, h) => { g.fillStyle = "#2b2f35"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y++) { g.fillStyle = "rgba(255,255,255," + (Math.random() * 0.05) + ")"; g.fillRect(0, y, w, 1); } },
    alu: (g, w, h) => { g.fillStyle = "#b9bdc2"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y++) { g.fillStyle = "rgba(" + (Math.random() < 0.5 ? "255,255,255" : "40,40,40") + "," + (Math.random() * 0.07) + ")"; g.fillRect(0, y, w, 1); } },
    plastic: (g, w, h) => { g.fillStyle = "#1c1f24"; g.fillRect(0, 0, w, h); noise(g, w, h, 6000, 0.05); },
    fabric: (g, w, h) => { g.fillStyle = "#3a4656"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { g.fillStyle = ((x + y) % 4 ? "rgba(255,255,255," : "rgba(0,0,0,") + (0.03 + Math.random() * 0.05) + ")"; g.fillRect(x, y, 2, 2); } },
    seat: (g, w, h) => { g.fillStyle = "#24282e"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 3) { g.fillStyle = "rgba(255,255,255," + (0.02 + Math.random() * 0.04) + ")"; g.fillRect(0, y, w, 1); } noise(g, w, h, 3000, 0.06); },
    mesh: (g, w, h) => { g.fillStyle = "#15181c"; g.fillRect(0, 0, w, h); g.strokeStyle = "rgba(120,130,140,.35)"; for (let i = -h; i < w; i += 6) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke(); } },
    carpet: (g, w, h) => { const t = w / 4; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? "#3f4650" : "#454c57"; g.fillRect(i * t, j * t, t, t); for (let k = 0; k < 900; k++) { g.fillStyle = "rgba(" + (Math.random() < 0.5 ? "255,255,255" : "0,0,0") + "," + Math.random() * 0.12 + ")"; const x = i * t + Math.random() * t, y = j * t + Math.random() * t; (i + j) % 2 ? g.fillRect(x, y, 1, 3) : g.fillRect(x, y, 3, 1); } } g.strokeStyle = "rgba(0,0,0,.25)"; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, h); g.moveTo(0, i * t); g.lineTo(w, i * t); g.stroke(); } },
    ceiling: (g, w, h) => { g.fillStyle = "#e6e5e0"; g.fillRect(0, 0, w, h); noise(g, w, h, 9000, 0.06); g.strokeStyle = "#b5b6b4"; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); },
    plaster: (g, w, h) => { g.fillStyle = "#dedbd3"; g.fillRect(0, 0, w, h); noise(g, w, h, 12000, 0.05); },
    concrete: (g, w, h) => { g.fillStyle = "#8d8c88"; g.fillRect(0, 0, w, h); noise(g, w, h, 16000, 0.12); for (let i = 0; i < 18; i++) { g.fillStyle = "rgba(40,36,30," + Math.random() * 0.08 + ")"; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 8 + Math.random() * 40, 0, 7); g.fill(); } },
    paper: (g, w, h) => { g.fillStyle = "#f4f2ec"; g.fillRect(0, 0, w, h); g.fillStyle = "#9aa3ad"; for (let y = 30; y < h - 20; y += 14) g.fillRect(24, y, 40 + Math.random() * (w - 90), 3); g.fillStyle = "#2a9ad6"; g.fillRect(24, 10, 60, 8); },
    keyboard: (g, w, h) => { g.fillStyle = "#202328"; g.fillRect(0, 0, w, h); const kw = w / 15; g.fillStyle = "#33373e"; for (let r = 0; r < 5; r++) for (let k = 0; k < 15; k++) { g.fillRect(k * kw + 2, r * (h / 5) + 2, kw - 4, h / 5 - 4); } g.fillStyle = "rgba(255,255,255,.18)"; for (let r = 0; r < 5; r++) for (let k = 0; k < 15; k++) g.fillRect(k * kw + kw * 0.35, r * (h / 5) + h / 15, kw * 0.3, 2); },
    laptopdeck: (g, w, h) => { P.alu(g, w, h); const x0 = w * 0.07, y0 = h * 0.08, kw = (w * 0.86) / 14, kh = (h * 0.5) / 6; g.fillStyle = "#16181b"; for (let r = 0; r < 6; r++) for (let k = 0; k < 14; k++) g.fillRect(x0 + k * kw + 2, y0 + r * kh + 2, kw - 4, kh - 4); g.fillStyle = "rgba(255,255,255,.22)"; for (let r = 0; r < 6; r++) for (let k = 0; k < 14; k++) g.fillRect(x0 + k * kw + kw * 0.38, y0 + r * kh + kh * 0.35, kw * 0.24, 2); g.fillStyle = "#c6cacf"; g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 2; g.fillRect(w * 0.33, h * 0.64, w * 0.34, h * 0.3); g.strokeRect(w * 0.33, h * 0.64, w * 0.34, h * 0.3); },
    mug: (g, w, h) => { g.fillStyle = "#f2f2ee"; g.fillRect(0, 0, w, h); g.fillStyle = "#2a9ad6"; g.fillRect(0, h * 0.55, w, h * 0.16); g.fillStyle = "#fff"; g.font = "800 " + (h * 0.12) + "px sans-serif"; g.fillText("SOTI", w * 0.1, h * 0.68); noise(g, w, h, 600, 0.04); },
    phone: (g, w, h) => { P.plastic(g, w, h); g.fillStyle = "#3b4048"; for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) g.fillRect(w * 0.55 + k * w * 0.13, h * 0.3 + r * h * 0.15, w * 0.1, h * 0.11); g.fillStyle = "#7fbf6a"; g.fillRect(w * 0.12, h * 0.3, w * 0.34, h * 0.18); },
    cooler: (g, w, h) => { g.fillStyle = "#e7e9ea"; g.fillRect(0, 0, w, h); g.fillStyle = "#c33"; g.fillRect(w * 0.3, h * 0.2, w * 0.12, h * 0.06); g.fillStyle = "#36c"; g.fillRect(w * 0.58, h * 0.2, w * 0.12, h * 0.06); noise(g, w, h, 1500, 0.05); },
    bottle: (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "#5a9fd0"); gr.addColorStop(0.5, "#b8e0f8"); gr.addColorStop(1, "#5a9fd0"); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let y = 10; y < h; y += 40) { g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(0, y, w, 4); } },
    copier: (g, w, h) => { g.fillStyle = "#dcdcd8"; g.fillRect(0, 0, w, h); g.fillStyle = "#3a3f46"; g.fillRect(w * 0.1, h * 0.08, w * 0.5, h * 0.12); g.fillStyle = "#79c6ff"; g.fillRect(w * 0.12, h * 0.1, w * 0.25, h * 0.08); g.fillStyle = "#b9b9b5"; for (let i = 0; i < 4; i++) g.fillRect(w * 0.08, h * (0.45 + i * 0.13), w * 0.84, h * 0.02); noise(g, w, h, 3000, 0.05); },
    frost: (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = "rgba(225,235,240,.10)"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(240,246,250,.75)"; g.fillRect(0, h * 0.42, w, h * 0.16); g.fillStyle = "rgba(42,154,214,.85)"; g.fillRect(0, h * 0.47, w, h * 0.012); },
    cabinet: (g, w, h) => { g.fillStyle = "#c8cbcd"; g.fillRect(0, 0, w, h); g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 3; for (let i = 0; i < 3; i++) { g.strokeRect(6, 6 + i * h / 3, w - 12, h / 3 - 12); g.fillStyle = "#7d8186"; g.fillRect(w * 0.4, i * h / 3 + h / 6 - 4, w * 0.2, 8); } noise(g, w, h, 2500, 0.05); }
  };

  O.pbr = pbr; O.paint = P; O.canvas = canvas; O.screenMat = screenMat;

  // ---- the floor ----------------------------------------------------------------------------------------------------------------------------
  O.buildFloor = function () {
    const slot = interior.count++, ox = -3000 - slot * 60, oz = -3000, fy = interior.floorY;
    const root = new THREE.Group(); root.position.set(ox, fy, oz); root.visible = false; scene.add(root);
    if (typeof propLight === "function") propLight(root);
    const cols = [], spots = [];
    const room = { brand: "sotifloor", key: "soti:floor", group: root, ox: ox, oz: oz, W: W, D: D, H: H, doorW: 1.8, colliders: cols, items: [], stock: [], units: [], spots: spots, noExit: false,
      entry: new THREE.Vector3(ox, fy, oz + D / 2 - 1.3), screens: [] };
    const solid = (x, z, w, d) => cols.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    const box = (w, h, d, x, y, z, mat, ry) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.receiveShadow = true; root.add(m); return m; };
    const cyl = (r0, r1, h, x, y, z, mat, seg) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg || 16), mat); m.position.set(x, y, z); root.add(m); return m; };
    const M = {
      floor: (typeof inPhotoMat === "function" && inPhotoMat("carpet", 0.95, [W / 3, D / 3], 0x5a606a, 0.6)) || pbr("carpet", 512, P.carpet, { rep: [W / 2, D / 2], bump: 3, rough: [0.85, 1] }),
      ceil: pbr("ceiling", 256, P.ceiling, { rep: [W / 1.2, D / 1.2], bump: 1.5, rough: [0.8, 0.95] }),
      wall: (typeof inPhotoMat === "function" && inPhotoMat("plaster", 0.92, [W / 3, H / 3], 0xe6e2da, 0.5)) || pbr("plaster", 512, P.plaster, { rep: [W / 3, 1], bump: 1, rough: [0.8, 0.95] }),
      desk: pbr("laminate", 512, P.laminate, { rep: [1, 1], bump: 1.2, rough: [0.35, 0.55] }),
      leg: pbr("metal", 256, P.metal, { bump: 0.6, rough: [0.3, 0.5], metal: 0.85 }),
      dark: pbr("darkmetal", 256, P.darkmetal, { bump: 0.6, rough: [0.35, 0.55], metal: 0.7 }),
      fabric: pbr("fabric", 256, P.fabric, { rep: [2, 1], bump: 3, rough: [0.85, 1] }),
      seat: pbr("seat", 256, P.seat, { bump: 2, rough: [0.7, 0.9] }),
      mesh: pbr("mesh", 256, P.mesh, { bump: 2.5, rough: [0.6, 0.85] }),
      plastic: pbr("plastic", 256, P.plastic, { bump: 1, rough: [0.4, 0.6] }),
      keyboard: pbr("keyboard", 512, P.keyboard, { bump: 3, rough: [0.45, 0.7] }),
      paper: pbr("paper", 256, P.paper, { bump: 0.5, rough: [0.85, 0.95] }),
      mug: pbr("mug", 256, P.mug, { bump: 0.4, rough: [0.2, 0.35] }),
      phone: pbr("phone", 256, P.phone, { bump: 1.5, rough: [0.4, 0.6] }),
      white: pbr("white", 256, P.white, { bump: 0.6, rough: [0.4, 0.6] }),
      cabinet: pbr("cabinet", 256, P.cabinet, { bump: 1.5, rough: [0.35, 0.55], metal: 0.3 }),
      copier: pbr("copier", 256, P.copier, { bump: 1.2, rough: [0.4, 0.6] }),
      cooler: pbr("cooler", 256, P.cooler, { bump: 0.8, rough: [0.3, 0.5] }),
      bottle: pbr("bottle", 128, P.bottle, { bump: 0.4, rough: [0.05, 0.15], transparent: true, opacity: 0.75 }),
      glass: pbr("frost", 256, P.frost, { bump: 0.2, rough: [0.05, 0.2], transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    };
    // shell: carpet, ceiling, the walls; glass along the back (-z) and the left (-x) with the skyline behind
    box(W, 0.1, D, 0, -0.05, 0, M.floor);
    box(W, 0.1, D, 0, H + 0.05, 0, M.ceil);
    box(0.2, H, D, W / 2, H / 2, 0, M.wall);                                   // right wall
    box((W - 1.8) / 2, H, 0.2, -(0.9 + (W - 1.8) / 4), H / 2, D / 2, M.wall);   // front wall, either side of the door
    box((W - 1.8) / 2, H, 0.2, 0.9 + (W - 1.8) / 4, H / 2, D / 2, M.wall);
    box(1.8, H - 2.3, 0.2, 0, 2.3 + (H - 2.3) / 2, D / 2, M.wall);
    const sky = typeof storySkylineTex === "function" ? storySkylineTex() : null;
    if (sky) {
      const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: sky, fog: false })); back.position.set(0, H / 2, -D / 2 - 0.05); root.add(back);
      const left = new THREE.Mesh(new THREE.PlaneGeometry(D, H), new THREE.MeshBasicMaterial({ map: sky, fog: false })); left.position.set(-W / 2 - 0.05, H / 2, 0); left.rotation.y = Math.PI / 2; root.add(left);
    }
    for (let i = 0; i <= 8; i++) box(0.1, H, 0.12, -W / 2 + i * W / 8, H / 2, -D / 2, M.dark);           // mullions
    for (let i = 0; i <= 6; i++) box(0.12, H, 0.1, -W / 2, H / 2, -D / 2 + i * D / 6, M.dark);
    box(W, 0.12, 0.3, 0, 0.06, -D / 2 + 0.15, M.dark); box(0.3, 0.12, D, -W / 2 + 0.15, 0.06, 0, M.dark);  // sills
    // the ceiling's light panels, glowing
    const panel = screenMat(canvas(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.7); gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#e9eef2"); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = "#c9ced2"; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); }));
    for (let i = -4; i <= 4; i++) for (let j = -3; j <= 3; j++) if ((i + j) % 2 === 0) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), panel); p.rotation.x = Math.PI / 2; p.position.set(i * 2.6, H - 0.005, j * 2.4); root.add(p); }
    // the logo wall at the door, and the name of the floor
    if (typeof inLabel === "function") {
      const a = inLabel("SOTI  Customer Care", 3.4, 0.5, "#0d1117", "#ffffff"); a.position.set(-3.6, 2.2, D / 2 - 0.12); a.rotation.y = Math.PI; root.add(a);
      const b = inLabel("顧客サポート部 · 3F", 2.6, 0.32, "#0d1117", "#2a9ad6"); b.position.set(3.4, 2.2, D / 2 - 0.12); b.rotation.y = Math.PI; root.add(b);
    }

    // ---- desks: six clusters of four, each two facing two over a fabric screen ------------------------------------------------------------
    const crm = [0, 1, 2].map(k => canvas(512, 320, (g, w, h) => O.paintCRM(g, w, h, k)));
    const crmMats = crm.map(screenMat);
    function chair(x, z, yaw) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; root.add(g);
      const add = (geo, mat, px, py, pz, rx) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); if (rx) m.rotation.x = rx; g.add(m); return m; };
      add(new THREE.BoxGeometry(0.5, 0.08, 0.48), M.seat, 0, 0.48, 0);
      add(new THREE.BoxGeometry(0.48, 0.58, 0.05), M.mesh, 0, 0.84, 0.25, -0.12);
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 10), M.leg, 0, 0.27, 0);
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2, leg = add(new THREE.BoxGeometry(0.04, 0.03, 0.3), M.dark, Math.sin(a) * 0.15, 0.07, Math.cos(a) * 0.15); leg.rotation.y = a; }
      add(new THREE.BoxGeometry(0.04, 0.2, 0.04), M.dark, -0.27, 0.6, 0.02); add(new THREE.BoxGeometry(0.04, 0.2, 0.04), M.dark, 0.27, 0.6, 0.02);
      add(new THREE.BoxGeometry(0.06, 0.03, 0.26), M.seat, -0.27, 0.7, 0.02); add(new THREE.BoxGeometry(0.06, 0.03, 0.26), M.seat, 0.27, 0.7, 0.02);
      return g;
    }
    function deskAt(x, z, face, opts) {           // face: +1 the person sits on +z and looks -z; -1 the other way
      const o = opts || {};
      box(1.4, 0.03, 0.78, x, 0.735, z, M.desk);
      box(0.04, 0.72, 0.7, x - 0.68, 0.36, z, M.leg); box(0.04, 0.72, 0.7, x + 0.68, 0.36, z, M.leg);
      box(1.3, 0.3, 0.02, x, 0.5, z - face * 0.36, M.leg);                                  // modesty panel
      if (!o.laptop) {
        const mz = z - face * 0.2;
        box(0.08, 0.2, 0.06, x, 0.85, mz, M.dark); box(0.24, 0.015, 0.18, x, 0.755, mz, M.dark);
        const mon = box(0.62, 0.38, 0.03, x, 1.12, mz, M.plastic);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.34), crmMats[(Math.abs(Math.round(x * 3 + z)) % 3)]);
        scr.position.set(x, 1.12, mz + face * 0.017); scr.rotation.y = face > 0 ? 0 : Math.PI; root.add(scr);
        box(0.44, 0.02, 0.14, x - 0.05, 0.76, z + face * 0.12, M.keyboard);
        box(0.06, 0.02, 0.1, x + 0.3, 0.76, z + face * 0.14, M.plastic);
        if ((x * 7 + z) % 3 > 1) box(0.21, 0.004, 0.3, x + 0.48, 0.752, z + face * 0.05, M.paper, 0.2);
        if ((x * 5 + z * 3) % 4 > 1.5) cyl(0.04, 0.035, 0.1, x - 0.5, 0.8, z + face * 0.02, M.mug, 18);
        box(0.18, 0.06, 0.2, x + 0.5, 0.775, z - face * 0.18, M.phone);
      }
      solid(x, z, 1.4, 0.8);
    }
    const clusters = [[-7.0, -5.2], [-1.6, -5.2], [-7.0, -1.2], [-1.6, -1.2], [-7.0, 2.8], [-1.6, 2.8]];
    room.seats = [];
    clusters.forEach((c, ci) => {
      const cx = c[0], cz = c[1];
      box(2.8, 0.42, 0.04, cx, 0.96, cz, M.fabric);                         // the screen between the two rows
      box(2.84, 0.03, 0.06, cx, 1.18, cz, M.leg);
      [-0.7, 0.7].forEach(dx => {
        [1, -1].forEach(face => {
          const x = cx + dx, z = cz + face * 0.42, seatZ = cz + face * 1.2, mine = ci === 0 && dx < 0 && face > 0;
          deskAt(x, z, face, { laptop: mine });
          chair(x, seatZ, face > 0 ? 0 : Math.PI);
          room.seats.push({ x: x, z: seatZ, yaw: face > 0 ? Math.PI : 0, mine: mine, cluster: ci });
        });
      });
    });
    // Seiko's desk: the laptop (its screen is the game), a desk phone, a mug, a notepad
    O.buildLaptop(root, SEAT.x, SEAT.z - 0.62, M, room);
    box(0.18, 0.06, 0.2, SEAT.x + 0.5, 0.775, SEAT.z - 0.95, M.phone);
    cyl(0.04, 0.035, 0.1, SEAT.x - 0.48, 0.8, SEAT.z - 0.6, M.mug, 18);
    box(0.15, 0.006, 0.21, SEAT.x + 0.38, 0.752, SEAT.z - 0.62, M.paper, -0.25);

    // ---- Gondō's glass box in the back right corner ----------------------------------------------------------------------------------------
    const gx0 = 7.2, gz1 = -4.0;
    const glassA = box(0.04, H, 3.2, gx0, H / 2, -D / 2 + 1.6, M.glass);          // side wall, from the window to the door gap
    const glassB = box(W / 2 - gx0, H, 0.04, (gx0 + W / 2) / 2, H / 2, gz1, M.glass);
    glassA.renderOrder = glassB.renderOrder = 2;
    box(0.06, H, 0.06, gx0, H / 2, gz1, M.dark); box(0.06, H, 0.06, gx0, H / 2, -D / 2 + 3.2, M.dark);
    solid(gx0, -D / 2 + 1.6, 0.2, 3.2); solid((gx0 + W / 2) / 2, gz1, W / 2 - gx0, 0.2);
    box(1.8, 0.04, 0.85, GONDO_DESK.x, 0.76, GONDO_DESK.z, M.desk); box(1.7, 0.7, 0.04, GONDO_DESK.x, 0.37, GONDO_DESK.z - 0.4, M.desk);
    box(0.04, 0.74, 0.8, GONDO_DESK.x - 0.88, 0.37, GONDO_DESK.z, M.leg); box(0.04, 0.74, 0.8, GONDO_DESK.x + 0.88, 0.37, GONDO_DESK.z, M.leg);
    solid(GONDO_DESK.x, GONDO_DESK.z, 1.8, 0.9);
    chair(GONDO_DESK.x, GONDO_DESK.z - 0.85, Math.PI); chair(GONDO_DESK.x - 0.4, GONDO_DESK.z + 1.2, 0);
    box(0.55, 0.35, 0.03, GONDO_DESK.x, 1.1, GONDO_DESK.z - 0.2, M.plastic);
    { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.51, 0.31), crmMats[2]); s.position.set(GONDO_DESK.x, 1.1, GONDO_DESK.z - 0.18); root.add(s); }
    if (typeof inLabel === "function") { const nm = inLabel("部長  GONDŌ T.", 1.0, 0.16, "#111316", "#c9a24a"); nm.position.set(GONDO_DESK.x, 0.83, GONDO_DESK.z + 0.43); nm.rotation.x = -0.4; root.add(nm); }
    if (typeof propPut === "function") {
      propPut(root, "steel_frame_shelves_03", 11.3, 0, -8.2, -Math.PI / 2, { h: 1.9 }); solid(11.3, -8.2, 0.8, 1.6);
      propPut(root, "potted_plant_02", 7.8, 0, -8.4, 0, { h: 1.1 });
      propPut(root, "standing_picture_frame_01", GONDO_DESK.x + 0.6, 0.78, GONDO_DESK.z - 0.2, 0.3, { h: 0.24 });
      // the rest of the floor
      propPut(root, "potted_plant_01", -11.2, 0, -8.2, 0, { h: 1.8 }); propPut(root, "potted_plant_01", -11.2, 0, 8.2, 0, { h: 1.8 });
      propPut(root, "potted_plant_04", 5.6, 0, 8.2, 0, { h: 1.2 }); propPut(root, "potted_plant_04", -5.6, 0, 8.2, 0, { h: 1.2 });
      propPut(root, "wall_clock", W / 2 - 0.08, 2.35, 1.0, -Math.PI / 2, { h: 0.4 });
      propPut(root, "security_camera_01", W / 2 - 0.3, H - 0.25, D / 2 - 0.3, -Math.PI * 0.75, { h: 0.25 });
      propPut(root, "drawer_cabinet", W / 2 - 0.35, 0, 4.2, -Math.PI / 2, { h: 1.1 }); propPut(root, "drawer_cabinet", W / 2 - 0.35, 0, 5.2, -Math.PI / 2, { h: 1.1 });
      solid(W / 2 - 0.35, 4.7, 0.7, 2.0);
    }
    // filing cabinets along the right wall, the copier, the water cooler
    for (let i = 0; i < 4; i++) box(0.5, 1.3, 0.6, W / 2 - 0.3, 0.65, -2.6 + i * 0.62, M.cabinet);
    solid(W / 2 - 0.3, -1.65, 0.6, 2.5);
    box(0.9, 1.15, 0.7, 9.4, 0.575, 7.6, M.copier); box(0.8, 0.06, 0.6, 9.4, 1.18, 7.6, M.dark); solid(9.4, 7.6, 0.9, 0.7);
    box(0.36, 1.05, 0.36, 11.4, 0.525, 7.9, M.cooler); cyl(0.14, 0.14, 0.42, 11.4, 1.26, 7.9, M.bottle, 20); solid(11.4, 7.9, 0.4, 0.4);
    // the whiteboard of numbers, on the right wall
    const wb = canvas(1024, 512, O.paintBoard);
    room.board = { canvas: wb, mat: screenMat(wb) };
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), room.board.mat); board.position.set(W / 2 - 0.12, 1.55, 3.0); board.rotation.y = -Math.PI / 2; root.add(board);
    box(0.04, 1.26, 2.46, W / 2 - 0.1, 1.55, 3.0, M.leg);

    // the desk, for sitting at
    spots.push({ x: SEAT.x, z: SEAT.z + 0.15, label: "sit at your desk", act: "career:desk" });
    room.tick = dt => { O.floorTick && O.floorTick(room, dt); };
    return room;
  };

  // A CRM screen for the other desks (three variants), and the whiteboard
  O.paintCRM = function (g, w, h, k) {
    g.fillStyle = "#f3f5f7"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#0d1117"; g.fillRect(0, 0, w, 26); g.fillStyle = "#2a9ad6"; g.fillRect(0, 26, w, 3);
    g.fillStyle = "#fff"; g.font = "700 14px sans-serif"; g.fillText("SOTI Care Desk", 10, 18);
    g.fillStyle = "#dfe5ea"; g.fillRect(0, 29, w * 0.3, h);
    for (let i = 0; i < 7; i++) { g.fillStyle = i === k + 1 ? "#2a9ad6" : "#9aa7b2"; g.fillRect(10, 44 + i * 30, w * 0.3 - 20, 18); }
    for (let i = 0; i < 6; i++) { const left = (i + k) % 2 === 0; g.fillStyle = left ? "#e4e8ec" : "#cfe7f7"; const bw = 120 + ((i * 53 + k * 31) % 160); g.fillRect(left ? w * 0.33 : w - bw - 14, 44 + i * 42, bw, 30); }
    g.fillStyle = "#14b86a"; g.fillRect(w * 0.33, h - 30, 90, 20); g.fillStyle = "#e0e5ea"; g.fillRect(w * 0.33 + 100, h - 30, 90, 20);
  };
  O.paintBoard = function (g, w, h) {
    g.fillStyle = "#f7f8f6"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c8ccd0"; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    const s = story.career || {}, f = s.floor || {};
    const hand = (t, x, y, sz, col, rot) => { g.save(); g.translate(x, y); g.rotate(rot || (Math.random() - 0.5) * 0.03); g.fillStyle = col || "#1d3f8f"; g.font = "600 " + sz + "px 'Comic Sans MS','Segoe Print',cursive"; g.fillText(t, 0, 0); g.restore(); };
    hand("3F CUSTOMER CARE · THIS WEEK", 40, 70, 40, "#c0392b", 0);
    hand("Calls answered: " + (380 + ((s.day || 1) * 37) % 90), 40, 140, 32);
    hand("Avg. wait: 3:" + String(10 + ((s.day || 1) * 13) % 40).padStart(2, "0"), 40, 190, 32);
    hand("CSAT: " + Math.round(62 + (f.morale || 0.6) * 20) + "%   (target 80%!!)", 40, 240, 32);
    hand("Remember: SMILE ON THE PHONE ☺", 40, 310, 30, "#1b7f4a");
    hand("— Gondō", 560, 360, 28, "#555");
    g.strokeStyle = "#1d3f8f"; g.lineWidth = 4; g.beginPath(); g.moveTo(640, 220); for (let i = 0; i < 8; i++) g.lineTo(640 + i * 40, 220 - Math.sin(i * 0.9) * 40 - i * 6); g.stroke();
    hand("Staff of the month:", 640, 120, 26); hand(s.promoted ? "SEIKO? (ask Gondō)" : "Nakano Y.", 640, 160, 30, "#8e44ad");
  };

  // ---- the laptop ----------------------------------------------------------------------------------------------------------------------------
  O.buildLaptop = function (root, x, z, M, room) {
    const g = new THREE.Group(); g.position.set(x, 0.75, z); root.add(g);
    const alu = pbr("alu", 256, P.alu, { bump: 0.5, rough: [0.25, 0.4], metal: 0.9 });
    const deck = pbr("laptopdeck", 512, P.laptopdeck, { bump: 2.2, rough: [0.3, 0.6], metal: 0.6 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.016, 0.25), [alu, alu, deck, alu, alu, alu]); base.position.set(0, 0.008, 0); g.add(base);
    const hinge = new THREE.Group(); hinge.position.set(0, 0.016, -0.125); hinge.rotation.x = -0.32; g.add(hinge);   // the lid, opened past upright
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.235, 0.007), [alu, alu, alu, alu, M.plastic, alu]); lid.position.set(0, 0.1175, 0); hinge.add(lid);
    const c = document.createElement("canvas"); c.width = 1280; c.height = 800;
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = typeof maxAniso === "function" ? maxAniso() : 4;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.206), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    scr.position.set(0, 0.1175, 0.0041); hinge.add(scr);
    room.laptop = { group: g, hinge: hinge, screen: scr, canvas: c, tex: t };
    O.screenIdle();
  };
  O.screenIdle = function () {
    const R = interior.rooms["soti:floor"]; if (!R || !R.laptop) return;
    const c = R.laptop.canvas, g = c.getContext("2d"), w = c.width, h = c.height;
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#0d1117"); gr.addColorStop(1, "#16324a"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff"; g.font = "800 96px " + (typeof UI === "string" ? UI : "sans-serif"); g.textAlign = "center"; g.fillText("SOTI", w / 2, h / 2 - 10);
    g.fillStyle = "#2a9ad6"; g.font = "600 30px " + (typeof UI === "string" ? UI : "sans-serif"); g.fillText("Make it yours.", w / 2, h / 2 + 40); g.textAlign = "left";
    R.laptop.tex.needsUpdate = true;
  };

  // ---- on the floor: who is here, and what they are doing ------------------------------------------------------------------------------
  const STAFF = [
    { key: "mori", name: "Mori Haruka", look: "officelady_01", female: true },
    { key: "ishikawa", name: "Ishikawa Ken", look: "salaryman_02" },
    { key: "fujita", name: "Fujita Daisuke", look: "salaryman_05" },
    { key: "nakano", name: "Nakano Yui", look: "officelady_03", female: true },
    { key: "ogawa", name: "Ogawa Shin", look: "salaryman_09" },
    { key: "takeda", name: "Takeda Emi", look: "officelady_04", female: true },
    { key: "sato", name: "Satō Ren", look: "salaryman_06" },
    { key: "kimura", name: "Kimura Aya", look: "officelady_05", female: true },
    { key: "hayashi", name: "Hayashi Jun", look: "salaryman_08" },
    { key: "inoue", name: "Inoue Mai", look: "officelady_01", female: true },
    { key: "kato", name: "Katō Riku", look: "salaryman_01" }
  ];
  O.staff = STAFF;
  const GONDO = { key: "gondo", name: "Gondō Tetsuo", look: "salaryman_07" };
  O.people = {};
  O.populate = function (R) {
    actorsClear("floor"); O.people = {};
    const fy = interior.floorY, seats = R.seats.filter(s => !s.mine);
    STAFF.forEach((p, i) => {
      const s = seats[(i * 2 + 1) % seats.length]; if (!s) return;
      const a = actorAdd({ x: R.ox + s.x, y: fy, z: R.oz + s.z + (s.yaw === Math.PI ? -0.05 : 0.05), yaw: s.yaw, female: !!p.female, business: true, pick: i * 3, tag: "floor", pose: O.pose("typing"), look: [p.look] });
      a.staff = p; a.seat = s; O.people[p.key] = a;
    });
    const g = actorAdd({ x: R.ox + GONDO_DESK.x - 0.2, y: fy, z: R.oz + GONDO_DESK.z + 1.0, yaw: 0, female: false, business: true, pick: 7, tag: "floor", pose: "idle", h: 1.02, look: [GONDO.look] });
    g.staff = GONDO; O.people.gondo = g;
  };
  // poses the floor uses, added to the people's clips when they load (a seated typing pose and a seated phone call)
  O.pose = name => {
    const any = actors.list.find(a => a.acts && a.acts[name]) || (pplLib.ready[0] && pplLib.ready[0].clips && pplLib.ready[0].clips[name]);
    return any ? name : (name === "typing" || name === "phonesit" ? "sit" : "idle");
  };
  if (typeof storyPeoplePoses === "function") {
    const orig = window.storyPeoplePoses;
    window.storyPeoplePoses = function (make) {
      orig.apply(this, arguments);
      const legs = { ThighR: [1.52, 0, 0.06], ThighL: [1.52, 0, -0.06], ShinR: [-1.5, 0, 0], ShinL: [-1.5, 0, 0], Spine: [0.1, 0, 0], Chest: [0.06, 0, 0] };
      make("typing", Object.assign({}, legs, { UpperArmR: [0.75, 0, 0.32], ForearmR: [0, 0, 1.25], UpperArmL: [0.75, 0, -0.32], ForearmL: [0, 0, -1.25], Neck: [0.12, 0, 0] }), 0.44);
      make("phonesit", Object.assign({}, legs, { UpperArmR: [0, 0, 0.55], ForearmR: [0, 0, 2.45], UpperArmL: [0.75, 0, -0.32], ForearmL: [0, 0, -1.25], Neck: [0.05, 0, 0.12] }), 0.44);
    };
  }

  // ---- in and out ------------------------------------------------------------------------------------------------------------------------
  O.shop = function () {
    const so = story.soti; if (!so) return null;
    return O._shop || (O._shop = { brand: "sotifloor", name: "SOTI · 3F Customer Care", door: so.door, yaw: so.yaw, groundY: so.groundY, city: "Tōkonto", built: true, safe: false });
  };
  O.room = () => interior.rooms["soti:floor"];
  O.enter = function () {
    const s = O.shop(); if (!s) return;
    if (interior.active) interiorLeave(true);
    if (!interiorEnter(s)) { say("The lift is out of order. Try the door again.", 3); return; }
    const R = interior.room;
    O.populate(R);
    O.paintBoard(R.board.canvas.getContext("2d"), R.board.canvas.width, R.board.canvas.height); R.board.mat.map.needsUpdate = true;
    const st = C.state(), def = C.mission();
    setTimeout(() => {
      if (story.step !== "c:floor") return;
      if (def.first && !st.seen.firstDay) { O.firstDayIntro(); return; }
      if (def.firstFloor && !st.seen.firstFloor) { O.firstFloorIntro(); return; }
      O.beginShift();
    }, 450);
  };
  O.leaving = function () { actorsClear("floor"); O.people = {}; O.clearMarkers(); O.floorPanel(false); };
  O.beginShift = function () {
    const st = C.state(), def = C.mission(), sh = st.shift || {};
    if (sh.done) { C.shiftDone({ rating: sh.rating, bonus: sh.bonus }); return; }
    if (sh.late && !sh.lateSaid) { sh.lateSaid = true; say("Gondō: “Late, Seiko! " + Math.max(1, Math.round(sh.start - 9 * 60)) + " minutes! That's coming out of your pay.”", 5); }
    if (def.kind === "desk") {
      storyObjective("Sit at your desk and take your calls", "Your desk is by the window, the one with the laptop. Walk up to the chair and press E.");
    } else O.floorShift(def);
  };
  O.spot = function (a, sp) {
    if (a === "desk") {
      const def = C.mission();
      if (story.step !== "c:floor") { say("Your desk. The day's work is done.", 2.5); return true; }
      if (def.kind === "desk") { O.deskShift(def); return true; }
      if (O.floor && O.floor.vipWaiting) { O.floorVip(); return true; }
      say("You're the floor manager now: the floor is your desk. Look for people with a problem.", 4);
      return true;
    }
    if (a === "talk") { O.talk(sp.inc); return true; }
    return false;
  };

  // ---- scenes ------------------------------------------------------------------------------------------------------------------------------
  const RL = (R, x, y, z) => [R.ox + x, interior.floorY + y, R.oz + z];
  O.firstDayLobby = function (then) {
    const so = story.soti, lob = storyLobbyRoom(), fy = interior.floorY;
    const L = (x, y, z) => [lob.ox + x, fy + y, lob.oz + z];
    const rec = actorAdd({ x: lob.ox, y: fy, z: lob.oz - 2.6, yaw: 0, female: true, business: true, pick: 1, tag: "soti", pose: "idle", look: ["officelady_02"] });
    lob.group.visible = true;
    cutPlay([
      { dur: 3.0, from: () => ({ pos: [so.door[0] + Math.sin(so.yaw) * 12, so.groundY + 1.6, so.door[1] + Math.cos(so.yaw) * 12], look: [so.at[0], so.groundY + 20, so.at[1]] }),
        to: () => ({ pos: [so.door[0] + Math.sin(so.yaw) * 8, so.groundY + 1.5, so.door[1] + Math.cos(so.yaw) * 8], look: [so.at[0], so.groundY + 60, so.at[1]] }), timeScale: 0,
        enter: () => { if (player.obj) player.obj.visible = false; }, lines: [[0.4, "", "SOTI Tower · " + hhmm(gameMinutes())]] },
      { dur: 5.6, from: { pos: L(2.2, 1.6, 3.2), look: L(0, 1.4, -2.4) }, to: { pos: L(1.5, 1.55, 2.2), look: L(0, 1.45, -2.6) }, near: 0.05, timeScale: 0,
        enter: () => { player.pos.set(lob.ox, fy, lob.oz - 0.9); player.yaw = player.targetYaw = Math.PI; player.obj.position.copy(player.pos); player.obj.rotation.y = Math.PI; player.obj.visible = true; rec.pose = "bow"; setTimeout(() => { rec.pose = "idle"; }, 1300); },
        lines: [[0.3, "Receptionist", "Good morning, Seiko-san! Your pass. Customer Care is on the third floor."], [3.0, "Receptionist", "Gondō-buchō is expecting you. Good luck… you'll need it."]] },
      { dur: 1.2, from: { pos: L(1.5, 1.55, 2.2), look: L(0, 1.45, -2.6) }, overlay: "black lift", timeScale: 0, lines: [[0.3, "", "*ding*  3F"]] }
    ], () => { actorsClear("soti"); lob.group.visible = false; then(); });
  };
  O.firstDayIntro = function () {
    const R = O.room(), st = C.state(), g = O.people.gondo;
    st.seen.firstDay = true;
    const me = () => { player.pos.set(R.ox + 2.4, interior.floorY, R.oz + 4.6); player.yaw = player.targetYaw = Math.PI * 0.85; player.obj.position.copy(player.pos); player.obj.rotation.y = player.yaw; };
    if (g) { g.x = R.ox + 3.0; g.z = R.oz + 3.4; g.yaw = Math.PI * 0.15 + Math.PI; actorLook(g, R.ox + 2.4, R.oz + 4.6); }
    cutPlay([
      { dur: 4.6, from: { pos: RL(R, -4, 2.4, 7.6), look: RL(R, -3, 1.0, -3) }, to: { pos: RL(R, -2, 2.2, 7.2), look: RL(R, -4, 1.0, -4) }, near: 0.05, timeScale: 0, enter: me,
        lines: [[0.4, "", "SOTI Customer Care · 3F"], [2.2, "", "Two hundred calls an hour. Twenty-three people. One Gondō."]] },
      { dur: 5.6, from: { pos: RL(R, 1.4, 1.65, 4.6), look: RL(R, 3.0, 1.6, 3.4) }, to: { pos: RL(R, 1.6, 1.62, 4.4), look: RL(R, 3.0, 1.62, 3.4) }, near: 0.05, timeScale: 0,
        lines: [[0.2, "Gondō", "So you're Akio-sama's little discovery. Hmph."], [2.6, "Gondō", "Gondō Tetsuo. Head of Customer Care. Nineteen years on this floor."]] },
      { dur: 6.4, from: { pos: RL(R, 3.6, 1.6, 2.6), look: RL(R, 2.4, 1.5, 4.6) }, to: { pos: RL(R, 3.4, 1.58, 2.9), look: RL(R, 2.4, 1.5, 4.6) }, near: 0.05, timeScale: 0,
        enter: () => { player.forceClip = "bow"; setTimeout(() => { player.forceClip = null; }, 1500); },
        lines: [[0.2, "Seiko", "Seiko desu. Yoroshiku onegaishimasu!"], [2.4, "Gondō", "Your desk is by the window. Laptop's on it. Headset's in the drawer."], [4.6, "Gondō", "Answer the phone. Be polite. Don't make me look bad."]] },
      { dur: 4.0, from: { pos: RL(R, 1.4, 1.65, 4.6), look: RL(R, 3.0, 1.6, 3.4) }, near: 0.05, timeScale: 0,
        lines: [[0.2, "Gondō", "And Seiko? The customer is always right. Even when they're idiots."]] }
    ], () => { if (g) { g.x = R.ox + GONDO_DESK.x - 0.2; g.z = R.oz + GONDO_DESK.z + 1.0; g.yaw = 0; } O.beginShift(); });
  };
  O.firstFloorIntro = function () {
    const R = O.room(), st = C.state(), g = O.people.gondo;
    st.seen.firstFloor = true;
    if (g) { g.x = R.ox + 0.4; g.z = R.oz + 6.2; actorLook(g, R.ox - 3, R.oz); }
    player.pos.set(R.ox + 1.2, interior.floorY, R.oz + 6.4); player.yaw = player.targetYaw = Math.PI; player.obj.position.copy(player.pos);
    const stand = ["mori", "nakano", "ishikawa", "ogawa"].map(k => O.people[k]).filter(Boolean);
    cutPlay([
      { dur: 6.0, from: { pos: RL(R, 3.2, 1.8, 7.8), look: RL(R, -1, 1.2, 2) }, to: { pos: RL(R, 2.6, 1.7, 7.6), look: RL(R, -1.5, 1.2, 2) }, near: 0.05, timeScale: 0,
        enter: () => stand.forEach(a => { a.pose = "idle"; actorLook(a, R.ox + 0.8, R.oz + 6.3); }),
        lines: [[0.2, "Gondō", "Everyone! Eyes up. Headsets down. This is Seiko."], [2.8, "Gondō", "As of today he is… also… floor manager. With me. Co-floor manager."]] },
      { dur: 5.4, from: { pos: RL(R, 0.4, 1.6, 4.4), look: RL(R, 0.8, 1.55, 6.3) }, to: { pos: RL(R, 0.5, 1.6, 4.6), look: RL(R, 0.8, 1.55, 6.3) }, near: 0.05, timeScale: 0,
        lines: [[0.2, "Mori", "Two managers. Wonderful. Twice the meetings."], [2.4, "Gondō", "I'll handle strategy. Seiko handles… problems. People problems. Floor problems."]] },
      { dur: 4.4, from: { pos: RL(R, -0.6, 1.6, 6.8), look: RL(R, 1.2, 1.55, 6.4) }, near: 0.05, timeScale: 0,
        enter: () => { player.forceClip = "bow"; setTimeout(() => { player.forceClip = null; }, 1500); },
        lines: [[0.2, "Seiko", "I'll do my best. If you have a problem, come to me."], [2.4, "Gondō", "(muttering) Or come to me. I'm the senior one."]] }
    ], () => { stand.forEach(a => { a.pose = O.pose("typing"); if (a.seat) a.yaw = a.seat.yaw; }); if (g) { g.x = R.ox + GONDO_DESK.x - 0.2; g.z = R.oz + GONDO_DESK.z + 1.0; g.yaw = 0; } O.beginShift(); });
  };
  // the end of Overtime: Gondō's office, and the news
  O.promotionScene = function (then) {
    const R = O.room(), g = O.people.gondo, st = C.state();
    const fy = interior.floorY;
    if (g) { g.x = R.ox + GONDO_DESK.x; g.z = R.oz + GONDO_DESK.z - 0.85; g.yaw = 0; g.pose = O.pose("sit"); }
    const seatMe = () => { player.pos.set(R.ox + GONDO_DESK.x - 0.4, fy, R.oz + GONDO_DESK.z + 1.25); player.yaw = player.targetYaw = Math.PI; player.obj.position.copy(player.pos); player.obj.rotation.y = Math.PI; player.forceClip = "sit"; player.obj.visible = true; };
    cutPlay([
      { dur: 3.4, from: { pos: RL(R, -6.6, 1.25, -3.3), look: RL(R, 8, 1.4, -6) }, to: { pos: RL(R, -6.3, 1.25, -3.4), look: RL(R, 9, 1.4, -6.5) }, near: 0.05, timeScale: 0,
        lines: [[0.2, "Gondō", "SEIKO! My office. Now."]] },
      { dur: 4.6, from: { pos: RL(R, 8.0, 1.5, -4.6), look: RL(R, 10, 1.2, -7.6) }, to: { pos: RL(R, 8.2, 1.45, -4.9), look: RL(R, 10, 1.2, -7.6) }, near: 0.05, timeScale: 0, enter: seatMe,
        lines: [[0.2, "Gondō", "Sit. Don't touch anything."], [2.0, "Gondō", "Sotiyama-sama — Akio-sama — has been listening to your calls."]] },
      { dur: 6.0, from: { pos: RL(R, 9.6, 1.18, -5.7), look: RL(R, 10, 1.25, -7.85) }, to: { pos: RL(R, 9.7, 1.2, -5.9), look: RL(R, 10, 1.27, -7.85) }, near: 0.05, timeScale: 0,
        lines: [[0.2, "Gondō", "He likes the way you work. He says you talk to people like they're people."], [3.2, "Gondō", "I don't see it. But he's the grandson of the founder, so."]] },
      { dur: 6.2, from: { pos: RL(R, 10.4, 1.2, -7.3), look: RL(R, 9.6, 1.0, -5.75) }, to: { pos: RL(R, 10.3, 1.2, -7.1), look: RL(R, 9.6, 1.0, -5.75) }, near: 0.05, timeScale: 0,
        lines: [[0.2, "Gondō", "You're promoted. Floor manager."], [2.2, "Seiko", "F-floor manager? Me?"], [3.8, "Gondō", "Together with me. Co-floor managers. Equal. On paper."]] },
      { dur: 6.4, from: { pos: RL(R, 9.6, 1.18, -5.7), look: RL(R, 10, 1.25, -7.85) }, near: 0.05, timeScale: 0,
        lines: [[0.2, "Gondō", "There's a company car. Don't scratch it. Fuel's on you — SOTI isn't a charity."], [3.4, "Gondō", "Tomorrow you start. And Seiko… nineteen years. Remember that."]] },
      { dur: 3.2, from: { pos: RL(R, 8.0, 1.5, -4.6), look: RL(R, 10, 1.2, -7.6) }, near: 0.05, timeScale: 0,
        enter: () => { player.forceClip = null; }, lines: [[0.3, "Seiko", "(Floor manager. One step closer.)"]] }
    ], () => {
      player.forceClip = null;
      player.pos.set(R.ox + 6.4, fy, R.oz - 3.2); player.yaw = player.targetYaw = 0; player.obj.position.copy(player.pos);
      if (g) { g.x = R.ox + GONDO_DESK.x - 0.2; g.z = R.oz + GONDO_DESK.z + 1.0; g.yaw = 0; g.pose = "idle"; }
      st.promoted = true;
      story.flags.sotiRank = "floor_manager";
      if (window.standing && typeof standing.promote === "function") try { standing.promote("floor_manager"); } catch (e) { /* the honor/respect layer is optional */ }
      C.emit("promotion", { to: "floor manager" });
      then && then();
    });
  };

  // ==== THE DESK ===============================================================================================================================
  const desk = C.desk = { on: false };
  function deskCss() {
    if (document.getElementById("cdeskcss")) return;
    const st = document.createElement("style"); st.id = "cdeskcss";
    st.textContent = `
body.careerdesk #hud,body.careerdesk #prompt,body.careerdesk #objective,body.careerdesk #phone,body.careerdesk #radiotoast,body.careerdesk #icard{visibility:hidden!important}
#cdesk{position:fixed;inset:0;z-index:40;pointer-events:none;display:none;font-family:'Konto Sans','Segoe UI',system-ui,sans-serif;color:#fff}
body.careerdesk #cdesk{display:block}
#cdesk .top{position:absolute;right:24px;top:20px;text-align:right;text-shadow:0 1px 4px #000}
#cdesk .top b{display:block;font-size:13px;letter-spacing:.12em;color:#8fd0ff}
#cdesk .top span{display:block;font-size:24px;font-weight:800}
#cdesk .top em{display:block;font-style:normal;font-size:13px;color:#d0d6dc;margin-top:2px}
#cdesk .sub{position:absolute;left:50%;bottom:7vh;transform:translateX(-50%);max-width:min(1000px,86vw);text-align:center;font-size:22px;line-height:1.4;text-shadow:0 2px 6px #000,0 0 2px #000}
#cdesk .sub b{color:#ffd21c;margin-right:8px}
#cdesk .keys{position:absolute;left:24px;bottom:20px;font-size:12px;color:rgba(255,255,255,.75);text-shadow:0 1px 3px #000}
#cdesk .calm{position:absolute;left:24px;top:20px;width:180px;font-size:12px;font-weight:700;text-shadow:0 1px 3px #000}
#cdesk .calm i{display:block;height:6px;margin-top:4px;background:rgba(0,0,0,.5)}
#cdesk .calm i u{display:block;height:100%;background:#5fd38a}
#cfloor{position:fixed;left:24px;bottom:120px;z-index:31;width:220px;font:700 12px 'Konto Sans','Segoe UI',system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000;display:none}
#cfloor.on{display:block}
#cfloor div{margin-top:6px}
#cfloor i{display:block;height:6px;margin-top:3px;background:rgba(0,0,0,.5)}
#cfloor i u{display:block;height:100%}
`;
    document.head.appendChild(st);
  }
  function deskEl() {
    let el = document.getElementById("cdesk");
    if (!el) { el = document.createElement("div"); el.id = "cdesk"; el.innerHTML = "<div class='calm'></div><div class='top'></div><div class='sub'></div><div class='keys'></div>"; document.body.appendChild(el); }
    return el;
  }
  // tones of answer: what they do to the caller's patience by default, if the call does not say
  O.deskShift = function (def) {
    const st = C.state();
    const ids = (def.calls || []).slice();
    desk.queue = ids; desk.done = []; desk.def = def;
    desk.start(() => {
      // every call took this long: the day stretches from now to half past five
      desk.nextCall();
    });
  };
  desk.start = function (then) {
    const R = O.room(); if (!R) return;
    deskCss(); C.css();
    const fade = document.getElementById("fade"); if (fade) { fade.style.transition = "opacity .25s"; fade.style.opacity = "1"; }
    setTimeout(() => {
      desk.on = true; desk.R = R; story.step = "c:desk";
      desk.was = { near: camera.near, fov: camera.fov };
      camera.near = 0.02; camera.fov = 48; camera.updateProjectionMatrix();
      if (player.obj) player.obj.visible = false;
      player.speed = 0;
      desk.look = { x: 0, y: 0, tx: 0, ty: 0 }; desk.t = 0; desk.state = "idle"; desk.sel = 0; desk.lines = []; desk.timer = 0;
      document.body.classList.add("careerdesk");
      storyClearObjective();
      deskEl(); desk.hud();
      desk.redraw();
      if (fade) fade.style.opacity = "0";
      then && then();
    }, 280);
  };
  desk.stop = function (then) {
    const fade = document.getElementById("fade"); if (fade) fade.style.opacity = "1";
    setTimeout(() => {
      desk.on = false; document.body.classList.remove("careerdesk");
      if (desk.was) { camera.near = desk.was.near; camera.fov = desk.was.fov; camera.updateProjectionMatrix(); }
      const R = desk.R;
      if (player.obj && R) { player.pos.set(R.ox + SEAT.x + 0.7, interior.floorY, R.oz + SEAT.z + 0.4); player.yaw = player.targetYaw = Math.PI * 0.5; player.obj.position.copy(player.pos); player.obj.rotation.y = player.yaw; player.obj.visible = true; }
      camPos.set(player.pos.x + 2, player.pos.y + 2, player.pos.z + 2); camera.position.copy(camPos);
      if (story.step === "c:desk") story.step = "c:floor";
      O.screenIdle();
      if (fade) fade.style.opacity = "0";
      then && then();
    }, 300);
  };
  desk.abort = function () { desk.on = false; document.body.classList.remove("careerdesk"); if (desk.was) { camera.near = desk.was.near; camera.fov = desk.was.fov; camera.updateProjectionMatrix(); } if (player.obj) player.obj.visible = true; if (story.step === "c:desk") story.step = "c:floor"; };
  desk.hud = function () {
    const el = deskEl(), st = C.state(), q = desk.queue || [], n = (desk.done || []).length, total = n + q.length + (desk.call ? 1 : 0);
    const calm = clamp01(1 - (vitals.stress || 0));
    el.querySelector(".top").innerHTML = "<b>" + (desk.vip ? "ESCALATION" : (STORY_TITLES[story.m] || "SOTI").toUpperCase()) + "</b><span>" + hhmm(gameMinutes()) + "</span><em>Call " + Math.min(total, n + (desk.call ? 1 : 0)) + " of " + total + " · rating " + st.rating.toFixed(1) + "★</em>";
    el.querySelector(".calm").innerHTML = "Composure<i><u style='width:" + Math.round(calm * 100) + "%;background:" + (calm > 0.6 ? "#5fd38a" : calm > 0.3 ? "#ffd21c" : "#ff5a45") + "'></u></i>";
    el.querySelector(".keys").textContent = pad.index >= 0 ? "D-pad choose · A answer/select · right stick look" : "1–3 or ▲▼ + Enter choose · click the screen · move the mouse to look around";
  };
  desk.say = function (who, text) {
    const el = deskEl().querySelector(".sub");
    el.innerHTML = text ? (who ? "<b>" + who + "</b>" : "") + text : "";
    desk.lines.push({ who: who, text: text }); if (desk.lines.length > 8) desk.lines.shift();
  };

  // ---- the calls ---------------------------------------------------------------------------------------------------------------------------
  const TONE_P = { kind: 12, firm: -4, rude: -32, wrong: -22, honest: 8, dishonest: -10 };
  desk.nextCall = function () {
    const id = desk.queue.shift();
    if (!id) { desk.endShift(); return; }
    const call = O.calls[id]; if (!call) { desk.nextCall(); return; }
    desk.call = call; desk.callId = id; desk.patience = call.patience; desk.node = "start"; desk.notes = (call.notes || []).slice(); desk.lines = []; desk.sel = 0; desk.rude = false; desk.honest = 0;
    desk.state = "idle"; desk.say("", "");
    desk.redraw(); desk.hud();
    desk.wait = 1.6 + Math.random() * 1.4;
  };
  desk.ring = function () { desk.state = "ring"; desk.ringT = 0; desk.redraw(); O.ringTone(true); };
  desk.answer = function () {
    O.ringTone(false);
    desk.state = "talk";
    const c = desk.call;
    C.emit("call:start", { call: desk.callId, caller: c.who, difficulty: c.diff || 1 });
    desk.say("Seiko", "SOTI Customer Care, this is Seiko speaking. How can I help?");
    setTimeout(() => { if (desk.call === c) desk.showNode(); }, 1300);
  };
  desk.showNode = function () {
    const n = desk.call.nodes[desk.node];
    if (!n) { desk.finish("resolved"); return; }
    desk.say(desk.call.who.split(" ")[0], n.say);
    desk.opts = n.opts; desk.sel = 0;
    // composure: a calm man has time to think; a frayed one is hurried
    const calm = clamp01(1 - (vitals.stress || 0));
    desk.timer = desk.timerMax = Math.round(11 + 13 * calm + (desk.vip ? 4 : 0));
    desk.redraw(); desk.hud();
  };
  desk.choose = function (i) {
    if (desk.state !== "talk" || !desk.opts || !desk.opts[i]) return;
    const o = desk.opts[i], c = desk.call;
    desk.opts = null;
    const dp = o.p !== undefined ? o.p : (TONE_P[o.tone] || 0);
    desk.patience = Math.max(0, Math.min(100, desk.patience + dp));
    if (o.tone === "rude") { desk.rude = true; vitals.stress = clamp01((vitals.stress || 0) - 0.03); }
    if (o.tone === "honest") desk.honest++;
    if (o.tone === "dishonest") desk.honest--;
    if (o.reveal) o.reveal.forEach(r => desk.notes.push(r));
    C.emit("call:choice", { call: desk.callId, tone: o.tone, text: o.t });
    desk.say("Seiko", o.t);
    desk.redraw();
    setTimeout(() => {
      if (desk.call !== c) return;
      if (desk.patience <= 0) { desk.say(c.who.split(" ")[0], (c.hangup || "That's it. I'm done with SOTI.") + "  *click*"); setTimeout(() => desk.finish("hungup"), 1600); return; }
      if (o.reply) desk.say(c.who.split(" ")[0], o.reply);
      const after = () => { if (desk.call !== c) return; if (o.end) desk.finish(o.end); else { desk.node = o.next; desk.showNode(); } };
      setTimeout(after, o.reply ? 2600 : 200);
    }, 1500);
  };
  desk.timeout = function () {
    const c = desk.call;
    desk.patience = Math.max(0, desk.patience - 15);
    desk.say(c.who.split(" ")[0], ["Hello? Are you still there?", "Hello?! Is anyone listening to me?", "I can hear you breathing. Say something!"][Math.floor(Math.random() * 3)]);
    vitals.stress = clamp01((vitals.stress || 0) + 0.03);
    if (desk.patience <= 0) { desk.opts = null; setTimeout(() => { desk.say(c.who.split(" ")[0], "Unbelievable.  *click*"); setTimeout(() => desk.finish("hungup"), 1500); }, 1400); return; }
    desk.timer = desk.timerMax; desk.redraw();
  };
  desk.finish = function (outcome) {
    const c = desk.call, st = C.state(); if (!c) return;
    const pat = desk.patience;
    let stars = outcome === "resolved" ? (pat >= 70 ? 5 : pat >= 45 ? 4 : 3) : outcome === "escalated" ? 2 : 1;
    if (desk.rude && stars > 2) stars--;
    st.calls.taken++; if (outcome === "resolved") st.calls.resolved++; if (outcome === "hungup") st.calls.lost++;
    st.rating = Math.round((st.rating * 0.8 + stars * 0.2) * 10) / 10;
    vitals.stress = clamp01((vitals.stress || 0) + (outcome === "resolved" ? 0.02 : 0.07) + (c.diff || 1) * 0.01);
    desk.done.push({ id: desk.callId, outcome: outcome, stars: stars });
    C.emit("call:end", { call: desk.callId, caller: c.who, outcome: outcome, patience: pat, rude: desk.rude, honest: desk.honest, stars: stars });
    desk.state = "wrap"; desk.outcome = { outcome: outcome, stars: stars, text: (c.after || {})[outcome] || "" };
    desk.say("", "");
    desk.redraw(); desk.hud();
    // the working day passes between calls
    const left = (desk.queue || []).length, now = gameMinutes(), endAt = 17 * 60 + 30;
    if (left > 0 && now < endAt) advanceGameMinutes(Math.max(20, (endAt - now) / (left + 1)));
  };
  desk.endShift = function () {
    const done = desk.done || [], avg = done.length ? done.reduce((a, b) => a + b.stars, 0) / done.length : 3;
    const vip = desk.vip; desk.vip = false; desk.call = null;
    if (vip) { desk.stop(() => O.floorVipDone(avg)); return; }
    desk.stop(() => {
      if (gameMinutes() < 17 * 60 + 30) setGameTime(17 * 60 + 30);
      const def = desk.def || C.mission(), st = C.state();
      if (avg < 2) {
        say("Gondō: “That was a disaster, Seiko. Same again tomorrow, and do it properly.”", 6);
        st.shift.passed = false;
        C.shiftDone({ rating: avg, bonus: 0, notes: "Gondō wasn't impressed: this day will have to be done again" });
        st.shift.passed = false;
        return;
      }
      const bonus = Math.round((avg - 3) * 1500);
      if (def.promotion) { O.promotionScene(() => C.shiftDone({ rating: avg, bonus: bonus + 5000, notes: "Promoted to floor manager" })); return; }
      say(avg >= 4 ? "Gondō: “Hm. Not bad. Don't let it go to your head.”" : "Gondō: “Adequate. Go home.”", 5);
      C.shiftDone({ rating: avg, bonus: bonus, notes: done.filter(d => d.outcome === "resolved").length + " of " + done.length + " calls resolved" });
    });
  };

  // ---- the desk, every frame ----------------------------------------------------------------------------------------------------------
  const _eye = new THREE.Vector3(), _at = new THREE.Vector3();
  desk.frame = function (dt) {
    const R = desk.R;
    desk.t += dt;
    clock += dt;
    if (typeof updateWorldSky === "function") updateWorldSky(dt);
    if (typeof followSun === "function") followSun();
    if (actors.list.length) actorsTick(dt);
    if (desk.state === "idle" && desk.call) { desk.wait -= dt; if (desk.wait <= 0) desk.ring(); }
    if (desk.state === "ring") { desk.ringT += dt; if (Math.floor(desk.ringT * 2) !== Math.floor((desk.ringT - dt) * 2)) desk.redraw(); }
    if (desk.state === "talk" && desk.opts) {
      const before = Math.ceil(desk.timer);
      desk.timer -= dt;
      if (Math.ceil(desk.timer) !== before) desk.redraw();
      if (desk.timer <= 0) desk.timeout();
    }
    // the pad
    const p = C.padPressed();
    if (p.up) desk.move(-1); if (p.down) desk.move(1); if (p.a) desk.act(); if (p.b && desk.state === "wrap") desk.act();
    const gp = navigator.getGamepads ? navigator.getGamepads()[pad.index] : null;
    if (gp) { desk.look.tx = clamp((gp.axes[2] || 0) * 0.7, -0.7, 0.7); desk.look.ty = clamp(-(gp.axes[3] || 0) * 0.35, -0.35, 0.35); }
    // the eyes: sitting, looking at the laptop, turned by the mouse a little; a breath now and then
    desk.look.x += (desk.look.tx - desk.look.x) * Math.min(1, dt * 5);
    desk.look.y += (desk.look.ty - desk.look.y) * Math.min(1, dt * 5);
    const fy = interior.floorY, bob = Math.sin(desk.t * 1.3) * 0.004;
    _eye.set(R.ox + SEAT.x, fy + 1.12 + bob, R.oz + SEAT.z - 0.17);
    const yawL = desk.look.x, pit = -0.42 + desk.look.y;
    _at.set(_eye.x - Math.sin(yawL) * Math.cos(pit), _eye.y + Math.sin(pit), _eye.z - Math.cos(yawL) * Math.cos(pit));
    camera.position.copy(_eye); camera.lookAt(_at); camPos.copy(_eye);
    present();
  };
  desk.move = function (d) { if (desk.state === "talk" && desk.opts) { desk.sel = (desk.sel + d + desk.opts.length) % desk.opts.length; desk.redraw(); } };
  desk.act = function () {
    if (desk.state === "ring") desk.answer();
    else if (desk.state === "talk" && desk.opts) desk.choose(desk.sel);
    else if (desk.state === "wrap") { desk.call = null; desk.nextCall(); }
  };
  window.addEventListener("keydown", e => {
    if (!desk.on) return;
    const k = e.code;
    if (k === "ArrowUp" || k === "KeyW") desk.move(-1);
    else if (k === "ArrowDown" || k === "KeyS") desk.move(1);
    else if ((k === "Enter" || k === "Space" || k === "KeyE" || k === "KeyF") && !e.repeat) desk.act();
    else if (/^Digit[1-4]$/.test(k) && desk.state === "talk" && desk.opts) desk.choose(+k.slice(5) - 1);
    else if (k === "F5") return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  window.addEventListener("keyup", e => { if (desk.on) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  window.addEventListener("mousemove", e => {
    if (!desk.on) return;
    const mx = e.clientX / innerWidth * 2 - 1, my = e.clientY / innerHeight * 2 - 1;
    const edge = v => Math.sign(v) * Math.max(0, Math.abs(v) - 0.45) / 0.55;   // the middle of the screen is for the laptop; the edges turn the head
    desk.look.tx = -edge(mx) * 0.75; desk.look.ty = -edge(my) * 0.35;
    if (desk.state === "talk" && desk.opts) { const hit = desk.pick(e); if (hit >= 0 && hit !== desk.sel) { desk.sel = hit; desk.redraw(); } }
  }, true);
  window.addEventListener("mousedown", e => {
    if (!desk.on) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.button !== 0) return;
    const hit = desk.pick(e);
    if (desk.state === "talk" && desk.opts) { if (hit >= 0) desk.choose(hit); }
    else if (hit === -2 || desk.state === "wrap" || desk.state === "ring") desk.act();
  }, true);
  // the mouse on the laptop's screen: which of the drawn buttons it is over (-2 is the big button, -1 nothing)
  const _ray = new THREE.Raycaster(), _m = new THREE.Vector2();
  desk.pick = function (e) {
    const L = desk.R && desk.R.laptop; if (!L) return -1;
    _m.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    _ray.setFromCamera(_m, camera);
    const hit = _ray.intersectObject(L.screen, false)[0]; if (!hit || !hit.uv) return -1;
    const x = hit.uv.x * L.canvas.width, y = (1 - hit.uv.y) * L.canvas.height;
    for (const b of desk.hits || []) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.i;
    return -1;
  };

  // ---- the laptop's screen -------------------------------------------------------------------------------------------------------------
  const F = typeof UI === "string" ? UI : "sans-serif";
  function wrapText(g, text, x, y, maxW, lh, maxLines) {
    const words = String(text).split(" "); let line = "", n = 0;
    for (let i = 0; i < words.length; i++) {
      const t = line ? line + " " + words[i] : words[i];
      if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y + n * lh); n++; line = words[i]; if (maxLines && n >= maxLines) return n; }
      else line = t;
    }
    if (line) { g.fillText(line, x, y + n * lh); n++; }
    return n;
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  desk.redraw = function () {
    const L = desk.R && desk.R.laptop; if (!L) return;
    const g = L.canvas.getContext("2d"), w = L.canvas.width, h = L.canvas.height, c = desk.call, st = C.state();
    desk.hits = [];
    g.fillStyle = "#eef1f4"; g.fillRect(0, 0, w, h);
    // the bar along the top
    g.fillStyle = "#0d1117"; g.fillRect(0, 0, w, 64); g.fillStyle = "#2a9ad6"; g.fillRect(0, 64, w, 4);
    g.fillStyle = "#fff"; g.font = "800 30px " + F; g.fillText("SOTI", 24, 43); g.font = "600 24px " + F; g.fillStyle = "#9fb3c4"; g.fillText("Care Desk", 104, 43);
    g.textAlign = "right"; g.fillStyle = "#fff"; g.font = "700 24px " + F;
    g.fillText(hhmm(gameMinutes()) + "   ·   Agent: Seiko (3F-117)   ·   " + "★".repeat(Math.round(st.rating)) + "☆".repeat(5 - Math.round(st.rating)), w - 24, 43); g.textAlign = "left";
    if (!c || desk.state === "idle") {
      g.fillStyle = "#5b6773"; g.font = "700 40px " + F; g.textAlign = "center";
      g.fillText(c ? "Waiting for the next call…" : "No calls in the queue", w / 2, h / 2 - 20);
      g.font = "500 26px " + F; g.fillText("Queue: " + ((desk.queue || []).length + (c ? 1 : 0)) + " waiting  ·  average wait 3:" + String(10 + (st.day * 7) % 40).padStart(2, "0"), w / 2, h / 2 + 30);
      g.textAlign = "left"; L.tex.needsUpdate = true; return;
    }
    // the caller's card, down the left
    const cw = 400;
    g.fillStyle = "#dde3e9"; g.fillRect(0, 68, cw, h - 68);
    g.fillStyle = "#2a9ad6"; g.beginPath(); g.arc(70, 130, 40, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.font = "800 34px " + F; g.textAlign = "center"; g.fillText(c.who.split(" ").map(s => s[0]).join(""), 70, 142); g.textAlign = "left";
    g.fillStyle = "#0d1117"; g.font = "800 28px " + F; g.fillText(c.who, 124, 122);
    g.fillStyle = "#4a5866"; g.font = "500 21px " + F; g.fillText(c.product + (c.age ? " · " + c.age : ""), 124, 152);
    let y = 200;
    g.font = "600 19px " + F;
    [["Plan", c.plan], ["Customer since", c.since], ["Account", c.account || ("SM-" + (100000 + (c.who.length * 7919) % 899999))]].forEach(r => { if (!r[1]) return; g.fillStyle = "#6b7884"; g.fillText(r[0], 24, y); g.fillStyle = "#0d1117"; g.fillText(String(r[1]), 190, y); y += 30; });
    // patience
    y += 10; g.fillStyle = "#6b7884"; g.fillText(desk.state === "ring" ? "Mood (predicted)" : "Customer mood", 24, y); y += 12;
    const pat = desk.patience / 100;
    g.fillStyle = "#c3ccd4"; g.fillRect(24, y, cw - 48, 16); g.fillStyle = pat > 0.6 ? "#14b86a" : pat > 0.3 ? "#f0a400" : "#e03b2c"; g.fillRect(24, y, (cw - 48) * pat, 16);
    y += 48; g.fillStyle = "#0d1117"; g.font = "800 20px " + F; g.fillText("NOTES", 24, y); y += 30; g.font = "500 19px " + F;
    (desk.notes || []).slice(-7).forEach(n => { g.fillStyle = /^!/.test(n) ? "#c0392b" : "#33414e"; y += 26 * wrapText(g, "• " + n.replace(/^!/, ""), 24, y, cw - 48, 24, 2) + 4; });
    const X0 = cw + 24, XW = w - cw - 48;
    if (desk.state === "ring") {
      const pulse = Math.floor(desk.ringT * 2) % 2;
      g.fillStyle = pulse ? "#14b86a" : "#0f9c59"; rr(g, X0 + XW / 2 - 230, h / 2 - 120, 460, 240, 26); g.fill();
      g.fillStyle = "#fff"; g.textAlign = "center"; g.font = "800 44px " + F; g.fillText("Incoming call", X0 + XW / 2, h / 2 - 40);
      g.font = "600 28px " + F; g.fillText(c.who + " · " + c.product, X0 + XW / 2, h / 2 + 6);
      g.font = "800 30px " + F; g.fillText("☎  Answer  [Enter]", X0 + XW / 2, h / 2 + 76); g.textAlign = "left";
      desk.hits.push({ x: X0 + XW / 2 - 230, y: h / 2 - 120, w: 460, h: 240, i: -2 });
      L.tex.needsUpdate = true; return;
    }
    if (desk.state === "wrap") {
      const o = desk.outcome, good = o.outcome === "resolved";
      g.fillStyle = good ? "#e6f7ee" : o.outcome === "escalated" ? "#fff5e0" : "#fde9e7"; rr(g, X0, 100, XW, h - 140, 20); g.fill();
      g.fillStyle = good ? "#0f9c59" : o.outcome === "escalated" ? "#b77900" : "#c0392b"; g.font = "800 52px " + F;
      g.fillText(good ? "✓ Resolved" : o.outcome === "escalated" ? "↗ Escalated" : "✕ Customer hung up", X0 + 40, 190);
      g.font = "700 46px " + F; g.fillStyle = "#f0a400"; g.fillText("★".repeat(o.stars) + "☆".repeat(5 - o.stars), X0 + 40, 260);
      g.fillStyle = "#33414e"; g.font = "500 26px " + F; wrapText(g, o.text || (good ? "Ticket closed. The customer left a rating." : "Ticket passed on. Gondō will hear about it."), X0 + 40, 320, XW - 80, 34, 5);
      g.fillStyle = "#2a9ad6"; rr(g, X0 + 40, h - 130, 360, 64, 14); g.fill(); g.fillStyle = "#fff"; g.font = "800 28px " + F;
      g.fillText((desk.queue || []).length ? "Next call  [Enter]" : "End of shift  [Enter]", X0 + 64, h - 88);
      desk.hits.push({ x: X0 + 40, y: h - 130, w: 360, h: 64, i: -2 });
      L.tex.needsUpdate = true; return;
    }
    // the conversation
    g.font = "500 22px " + F;
    let ty = 96;
    const shown = desk.lines.filter(l => l.text).slice(-4);
    shown.forEach(l => {
      const mine = l.who === "Seiko", bw = XW * 0.72, x = mine ? X0 + XW - bw : X0;
      const lines = Math.min(3, Math.ceil(g.measureText(l.text).width / (bw - 32)) + 0);
      const bh = 22 + Math.max(1, lines) * 27;
      g.fillStyle = mine ? "#cfe7f7" : "#ffffff"; rr(g, x, ty, bw, bh, 14); g.fill();
      g.fillStyle = "#1d2a36"; wrapText(g, l.text, x + 16, ty + 32, bw - 32, 27, 3);
      ty += bh + 10;
    });
    // the answers
    if (desk.opts) {
      const oy0 = h - 30 - desk.opts.length * 76;
      g.fillStyle = "rgba(13,17,23,.06)"; g.fillRect(X0 - 12, oy0 - 46, XW + 24, h - oy0 + 46);
      g.fillStyle = "#4a5866"; g.font = "700 20px " + F; g.fillText("YOUR REPLY", X0, oy0 - 16);
      const frac = clamp01(desk.timer / desk.timerMax);
      g.fillStyle = "#c3ccd4"; g.fillRect(X0 + 150, oy0 - 26, XW - 150, 8); g.fillStyle = frac > 0.35 ? "#2a9ad6" : "#e03b2c"; g.fillRect(X0 + 150, oy0 - 26, (XW - 150) * frac, 8);
      desk.opts.forEach((o, i) => {
        const y0 = oy0 + i * 76, on = i === desk.sel;
        g.fillStyle = on ? "#2a9ad6" : "#ffffff"; rr(g, X0, y0, XW, 66, 12); g.fill();
        g.fillStyle = on ? "#fff" : "#2a9ad6"; g.font = "800 26px " + F; g.fillText(String(i + 1), X0 + 18, y0 + 42);
        g.fillStyle = on ? "#fff" : "#1d2a36"; g.font = "600 21px " + F; wrapText(g, o.t, X0 + 52, y0 + 28, XW - 70, 25, 2);
        desk.hits.push({ x: X0, y: y0, w: XW, h: 66, i: i });
      });
    }
    L.tex.needsUpdate = true;
  };

  // the phone on the desk ringing (two tones, the way an office phone does)
  O.ringTone = function (on) {
    clearInterval(O._ring); O._ring = null;
    if (!on || typeof sound !== "object" || !sound.ctx || !sound.master) return;
    const beep = () => { try { const ctx = sound.ctx, t = ctx.currentTime; [0, 0.42].forEach(d => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = 880; const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = 1100; g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.08, t + d + 0.02); g.gain.setValueAtTime(0.08, t + d + 0.3); g.gain.linearRampToValueAtTime(0, t + d + 0.34); o.connect(g); o2.connect(g); g.connect(sound.master); o.start(t + d); o2.start(t + d); o.stop(t + d + 0.36); o2.stop(t + d + 0.36); }); } catch (e) { /* no sound */ } };
    beep(); O._ring = setInterval(() => { if (!desk.on || desk.state !== "ring") { clearInterval(O._ring); return; } beep(); }, 2000);
  };

  // ==== THE FLOOR (floor manager) ===============================================================================================================
  O.floor = null;
  O.floorShift = function (def) {
    const st = C.state();
    let ids = (def.incidents || []).slice();
    if (def.random) {
      const pool = Object.keys(O.incidents).filter(k => O.incidents[k].pool);
      const last = st.lastIncidents || [];
      const fresh = pool.filter(k => last.indexOf(k) < 0);
      ids = [];
      while (ids.length < def.random && fresh.length) ids.push(fresh.splice(Math.floor(Math.random() * fresh.length), 1)[0]);
      st.lastIncidents = ids.slice();
    }
    O.floor = { ids: ids, left: ids.slice(), done: [], good: 0, vipWaiting: false };
    O.floorPanel(true);
    O.placeMarkers();
    O.floorObjective();
  };
  O.floorObjective = function () {
    const f = O.floor; if (!f) return;
    const left = f.left.map(id => O.incidents[id]).filter(Boolean);
    if (!left.length) return;
    const next = left[0];
    storyObjective("Floor issues: " + f.done.length + " of " + f.ids.length + " sorted", next.brief + " (look for the marker; walk up and press E)");
  };
  O.markers = [];
  O.clearMarkers = function () {
    O.markers.forEach(m => { if (m.parent) m.parent.remove(m); }); O.markers = [];
    const R = O.room(); if (R) R.spots = R.spots.filter(s => s.act !== "career:talk");
  };
  O.placeMarkers = function () {
    O.clearMarkers();
    const R = O.room(), f = O.floor; if (!R || !f) return;
    f.left.forEach(id => {
      const inc = O.incidents[id]; if (!inc) return;
      const a = O.people[inc.who[0]] || O.people.gondo; if (!a) return;
      // the people involved stand up for it
      inc.who.forEach(k => { const p = O.people[k]; if (p && p !== O.people.gondo) { p.pose = "idle"; if (p.seat) { p.z = R.oz + p.seat.z + (p.seat.yaw === Math.PI ? 0.35 : -0.35); } } });
      const lx = a.x - R.ox, lz = a.z - R.oz + (a.seat ? (a.seat.yaw === Math.PI ? 0.7 : -0.7) : 0.8);
      R.spots.push({ x: lx, z: lz, label: "talk to " + (O.staffName(inc.who[0])) + " · " + inc.title, act: "career:talk", inc: id });
      const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
      x.fillStyle = "#2a9ad6"; x.beginPath(); x.moveTo(64, 120); x.lineTo(20, 50); x.arc(64, 50, 44, Math.PI, 0); x.closePath(); x.fill(); x.lineWidth = 6; x.strokeStyle = "#0d1117"; x.stroke();
      x.fillStyle = "#fff"; x.font = "900 64px " + F; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("!", 64, 52);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(0.4, 0.4, 1);
      sp.position.set(a.x, interior.floorY + 2.25, a.z); sp.renderOrder = 5; scene.add(sp); sp.userData.base = 2.25;
      O.markers.push(sp);
    });
  };
  O.staffName = k => k === "gondo" ? "Gondō" : ((STAFF.find(s => s.key === k) || {}).name || k).split(" ")[0];
  O.floorTick = function (R, dt) { O.markers.forEach((m, i) => { m.position.y = interior.floorY + m.userData.base + Math.sin(clock * 2.4 + i) * 0.06; }); };
  O.floorPanel = function (on) {
    let el = document.getElementById("cfloor");
    if (!el) { deskCss(); el = document.createElement("div"); el.id = "cfloor"; document.body.appendChild(el); }
    el.classList.toggle("on", !!on && interior.active);
    if (!on) return;
    const f = C.state().floor;
    const bar = (label, v, col) => "<div>" + label + "<i><u style='width:" + Math.round(v * 100) + "%;background:" + col + "'></u></i></div>";
    el.innerHTML = bar("Floor morale", f.morale, f.morale > 0.6 ? "#5fd38a" : f.morale > 0.35 ? "#ffd21c" : "#ff5a45") + bar("Gondō's goodwill", f.gondo, "#8fd0ff");
  };
  // a conversation about a floor problem
  O.talk = function (id) {
    const inc = O.incidents[id], f = O.floor; if (!inc || !f || f.left.indexOf(id) < 0) return;
    const st = C.state();
    let node = "start";
    const step = () => {
      const n = inc.nodes[node]; if (!n) return;
      const body = (n.lines || []).map(l => "<b>" + (l[0] === "Gondō" ? "Gondō" : l[0]) + ":</b> “" + l[1] + "”").join("<br>");
      C.menu({ head: inc.title, tag: n.tag || "Floor manager", body: body, opts: n.opts.map(o => ({ label: o.t, note: o.noteTone ? o.tone : "", fn: () => {
        st.floor.morale = clamp01(st.floor.morale + (o.morale || 0));
        if (o.gondo) { st.floor.gondo = clamp01(st.floor.gondo + o.gondo); C.emit("gondo:mood", { gondo: st.floor.gondo, delta: o.gondo }); }
        if (o.stress) vitals.stress = clamp01((vitals.stress || 0) + o.stress);
        C.emit("floor:choice", { incident: id, who: inc.who.map(O.staffName), tone: o.tone, text: o.t });
        O.floorPanel(true);
        if (o.reply) say(o.reply, 5);
        if (o.vip) { f.vipWaiting = true; f.vipId = id; f.vipCall = o.vip; f.vipGood = !!o.good; storyObjective("Take the escalated call at your desk", "The laptop by the window. Walk up and press E."); return; }
        if (o.end) O.incidentDone(id, !!o.good); else { node = o.next; setTimeout(step, o.reply ? 700 : 80); }
      } })) });
    };
    // face them
    const a = O.people[inc.who[0]]; if (a) actorLook(a, player.pos.x, player.pos.z);
    step();
  };
  O.incidentDone = function (id, good) {
    const f = O.floor, st = C.state(); if (!f) return;
    const i = f.left.indexOf(id); if (i >= 0) f.left.splice(i, 1);
    f.done.push({ id: id, good: good }); if (good) f.good++;
    const inc = O.incidents[id];
    (inc.who || []).forEach(k => { const p = O.people[k]; if (p && p !== O.people.gondo && p.seat) { p.z = O.room().oz + p.seat.z; p.yaw = p.seat.yaw; p.pose = O.pose("typing"); } });
    C.emit("floor:resolved", { incident: id, morale: st.floor.morale, gondo: st.floor.gondo, good: good });
    O.placeMarkers();
    if (typeof storyTick_done === "function") storyTick_done(() => {
      if (f.left.length) { O.floorObjective(); return; }
      // the day's problems are sorted
      const rating = Math.max(1, Math.min(5, Math.round((1 + 4 * st.floor.morale) * 0.6 + (f.good / Math.max(1, f.ids.length)) * 5 * 0.4)));
      st.floor.shifts++;
      O.floorPanel(false);
      const g = st.floor.gondo;
      say(g > 0.6 ? "Gondō: “Good day. I think my leadership really shone through.”" : g > 0.3 ? "Gondō: “We survived. Barely. Go home, Seiko.”" : "Gondō: “Don't think I don't see what you're doing, Seiko.”", 5);
      if (gameMinutes() < 17 * 60 + 30) setGameTime(17 * 60 + 30);
      C.shiftDone({ rating: rating, bonus: Math.round((rating - 3) * 2500 + f.good * 800), notes: f.good + " of " + f.ids.length + " handled well" });
    });
  };
  // the VIP escalation: the floor manager takes the call himself, at his old desk
  O.floorVip = function () {
    const f = O.floor; if (!f || !f.vipWaiting) return;
    f.vipWaiting = false;
    desk.queue = [f.vipCall]; desk.done = []; desk.vip = true; desk.def = C.mission();
    desk.start(() => desk.nextCall());
  };
  O.floorVipDone = function (avg) {
    const f = O.floor; if (!f) return;
    const good = avg >= 3.5;
    say(good ? "Gondō: “The VIP is happy?! …I trained you well.”" : "Gondō: “HQ is going to hear about that call. Not my fault. Yours.”", 5);
    C.state().floor.morale = clamp01(C.state().floor.morale + (good ? 0.08 : -0.1));
    O.incidentDone(f.vipId, good);
  };

  console.log("[Career] SOTI 3F: the floor, the desk and the calls");
})();
