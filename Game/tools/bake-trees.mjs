// Bakes the island's trees into impostor atlases: each CC0 tree model (Poly Haven) is rendered from eight directions round it at three
// heights of eye, once for its colour (with the model's own ambient occlusion and a darkening toward the inside of the crown, which is what
// makes a crown read as a mass of leaves and not a cut-out) and once for its normals, so the game can light the picture from wherever the
// sun is. In the game each tree is then a single card that turns to face you and shows the view you would have of the real model.
//
//   node Game/tools/bake-trees.mjs <models-dir> <out-dir>
//
// <models-dir> holds the glTF downloads (fir_sapling, pine_sapling_small, island_tree_02 at 1k). The PNGs it writes are packed to WebP by
// build-trees.py's impostor step. Needs Playwright and Chromium.
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.resolve(here, "../vendor");
const MODELS = path.resolve(process.argv[2] || "/tmp/dl/models"), OUT = path.resolve(process.argv[3] || "/tmp/dl/imp");
fs.mkdirSync(OUT, { recursive: true });
let chromium;
try { ({ chromium } = await import("playwright")); } catch (e) { ({ chromium } = await import(process.env.PLAYWRIGHT || "playwright")); }

const mime = { ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".jpg": "image/jpeg", ".png": "image/png", ".js": "text/javascript", ".html": "text/html" };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split("?")[0]);
  if (u === "/") { r.setHeader("Content-Type", "text/html"); r.end('<html><body style="margin:0;background:#000"><script src="/vendor/three.min.js"></script><script src="/vendor/GLTFLoader.js"></script></body></html>'); return; }
  const f = u.startsWith("/vendor/") ? path.join(VENDOR, u.slice(8)) : path.join(MODELS, u);
  fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader("Content-Type", mime[path.extname(f)] || "application/octet-stream"); r.end(d); });
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
page.on("console", m => console.log("page:", m.text().slice(0, 200)));
page.on("pageerror", e => console.log("pageerror", String(e).slice(0, 300)));
await page.goto(`http://localhost:${port}/`);

// species: which model, and what is done to its leaves
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const SPECIES = [
  { name: "sugi", model: "fir_tree_01/fir_tree_01_1k.gltf" },
  { name: "matsu", model: "island_tree_02/island_tree_02_1k.gltf", leaf: [0.20, 0.30, 0.17], leafLift: 0.0 },
  { name: "keyaki", model: "island_tree_01/island_tree_01_1k.gltf" },
  { name: "sakura", model: "island_tree_01/island_tree_01_1k.gltf", leaf: [1.0, 0.70, 0.80], leafLift: 0.55 },
  { name: "momiji", model: "island_tree_01/island_tree_01_1k.gltf", leaf: [0.95, 0.26, 0.12], leafLift: 0.12 }
];
const COLS = 8, ROWS = 3, FR = 320, ELEV = [0, 30, 60];
const metaPath = path.join(OUT, "impostors.json"); const meta = {};
for (const sp of SPECIES.filter(q => !ONLY || ONLY.includes(q.name))) {
  const res = await page.evaluate(async ({ sp, COLS, ROWS, FR, ELEV }) => {
    const gltf = await new Promise((ok, bad) => new THREE.GLTFLoader().load("/" + sp.model, ok, undefined, bad));
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    // a file with a row of saplings in it: keep the tallest
    if (root.children.length > 1) {
      const tall = root.children.map(c => [c, new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3()).y]).sort((a, b) => b[1] - a[1])[0][0];
      root.children.slice().forEach(c => { if (c !== tall) root.remove(c); });
      root.updateMatrixWorld(true);
    }
    if (sp.stretch) { root.scale.y = sp.stretch; root.updateMatrixWorld(true); }
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const R = Math.hypot(size.x / 2, size.y / 2, size.z / 2) * 1.02, HW = Math.hypot(size.x, size.z) / 2 * 1.04;     // the frame is as wide as the tree can ever look, and as tall as it can
    const mats = { col: [], nrm: [] };
    root.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material, leafy = /leaf|leaves|twig/i.test(m.name || "") || /leaf|leaves|twig/i.test(o.name || "");
      const tint = leafy && sp.leaf ? new THREE.Vector3(...sp.leaf) : new THREE.Vector3(1, 1, 1), lift = leafy && sp.leafLift ? sp.leafLift : 0;
      const common = { side: THREE.DoubleSide, transparent: false };
      const uni = { map: { value: m.map || null }, aoMap: { value: m.aoMap || m.roughnessMap || null }, hasMap: { value: m.map ? 1 : 0 }, hasAo: { value: (m.aoMap || m.roughnessMap) ? 1 : 0 }, tint: { value: tint }, lift: { value: lift }, ctr: { value: ctr }, R: { value: R }, base: { value: m.color ? m.color.clone() : new THREE.Color(1, 1, 1) }, alphaT: { value: m.alphaTest || (m.transparent ? 0.4 : 0) } };
      const vs = "varying vec2 vUv; varying vec3 vN, vW; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }";
      const col = new THREE.ShaderMaterial(Object.assign({ uniforms: uni, vertexShader: vs, fragmentShader: `
        uniform sampler2D map, aoMap; uniform float hasMap, hasAo, lift, R, alphaT; uniform vec3 tint, ctr, base; varying vec2 vUv; varying vec3 vN, vW;
        void main(){ vec4 t = hasMap > 0.5 ? texture2D(map, vUv) : vec4(1.0); if (t.a < max(alphaT, 0.02)) discard;
          vec3 c = pow(t.rgb, vec3(2.2)) * base;
          // recoloured leaves: the photograph's shading kept, its colour replaced
          float l = dot(c, vec3(0.3, 0.59, 0.11)); if (tint != vec3(1.0)) c = mix(tint * (l * 2.4 + 0.06), tint * 0.85, lift);
          float ao = hasAo > 0.5 ? texture2D(aoMap, vUv).r : 1.0;
          // inside the crown is in shade
          float d = length((vW - ctr) * vec3(1.0, 0.7, 1.0)) / R; float inner = mix(0.45, 1.0, smoothstep(0.05, 0.75, d));
          c *= ao * inner;
          gl_FragColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0); }` }, common));
      const nrm = new THREE.ShaderMaterial(Object.assign({ uniforms: uni, vertexShader: vs, fragmentShader: `
        uniform sampler2D map; uniform float hasMap, alphaT; varying vec2 vUv; varying vec3 vN, vW;
        void main(){ vec4 t = hasMap > 0.5 ? texture2D(map, vUv) : vec4(1.0); if (t.a < max(alphaT, 0.02)) discard;
          vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); if (n.z < 0.0) n.z *= -0.3;   // a leaf seen from behind still faces you, a little
          gl_FragColor = vec4(normalize(n) * 0.5 + 0.5, 1.0); }` }, common));
      mats.col.push([o, col]); mats.nrm.push([o, nrm]);
    });
    const W = FR * COLS, H = FR * ROWS;
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const r = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(W, H, false); r.setClearColor(0x000000, 0);
    const scene = new THREE.Scene(); scene.add(root);
    const cam = new THREE.OrthographicCamera(-HW, HW, R, -R, 0.01, R * 8);
    const shots = {};
    for (const pass of ["col", "nrm"]) {
      mats[pass].forEach(([o, m]) => { o.material = m; });
      r.setScissorTest(true); r.setScissor(0, 0, W, H); r.clear();
      for (let row = 0; row < ROWS; row++) for (let c = 0; c < COLS; c++) {
        const az = c / COLS * Math.PI * 2, el = ELEV[row] * Math.PI / 180;
        cam.position.set(ctr.x + Math.sin(az) * Math.cos(el) * R * 3, ctr.y + Math.sin(el) * R * 3, ctr.z + Math.cos(az) * Math.cos(el) * R * 3);
        cam.lookAt(ctr); cam.updateMatrixWorld(true);
        // row 0 at the bottom of the image, as texture coordinates count
        r.setViewport(c * FR, row * FR, FR, FR); r.setScissor(c * FR, row * FR, FR, FR);
        r.render(scene, cam);
      }
      shots[pass] = canvas.toDataURL("image/png");
    }
    return { shots, R, HW, H: size.y, cy: ctr.y - box.min.y };
  }, { sp, COLS, ROWS, FR, ELEV });
  for (const pass of ["col", "nrm"]) fs.writeFileSync(path.join(OUT, `imp_${sp.name}_${pass}.png`), Buffer.from(res.shots[pass].split(",")[1], "base64"));
  meta[sp.name] = { r: +(res.R / res.H).toFixed(4), hw: +(res.HW / res.H).toFixed(4), cy: +(res.cy / res.H).toFixed(4) };
  console.log(sp.name, JSON.stringify(meta[sp.name]));
}
fs.writeFileSync(metaPath, JSON.stringify({ cols: COLS, rows: ROWS, elev: ELEV, species: meta }, null, 1));
await browser.close(); srv.close();
