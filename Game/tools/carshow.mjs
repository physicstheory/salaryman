// A contact sheet of every imported car in Web/cars (the ones listed in cars/user.json), each fitted the way the game fits it: nose down +Z,
// the body paint swapped for a test red. Seen from the front-right quarter, so a car facing the wrong way shows its tail lamps.
//
//   node tools/carshow.mjs <out-dir>
//
// Needs Playwright; serves Web/ and Game/vendor itself so it runs offline.
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "../../Web"), VENDOR = path.resolve(here, "../vendor");
const OUT = path.resolve(process.argv[2] || "carshow");
fs.mkdirSync(OUT, { recursive: true });
let chromium;
try { ({ chromium } = await import("playwright")); }
catch (e) { { const m = await import(process.env.PLAYWRIGHT || "playwright"); chromium = m.chromium || m.default.chromium; } }

const user = JSON.parse(fs.readFileSync(path.join(WEB, "cars/user.json"), "utf8"));
const page = `<!doctype html><body style="margin:0;background:#20242a;font:13px sans-serif;color:#ddd">
<div id="g" style="display:grid;grid-template-columns:repeat(4,400px);gap:4px"></div>
<script src="/vendor/three.min.js"></script><script src="/vendor/GLTFLoader.js"></script><script>
const kinds = ${JSON.stringify(Object.keys(user))}, yaws = ${JSON.stringify(Object.fromEntries(Object.entries(user).map(([k, v]) => [k, v.yaw || 0])))};
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(400, 260); r.outputEncoding = THREE.sRGBEncoding;
const loader = new THREE.GLTFLoader();
(async () => {
  for (const k of kinds) {
    const gltf = await new Promise(res => loader.load("/cars/" + k + ".glb", res, undefined, () => res(null)));
    const cell = document.createElement("div"); cell.style.position = "relative";
    if (!gltf) { cell.textContent = k + ": did not load"; g.appendChild(cell); continue; }
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9aa6b2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(4, 8, 6); scene.add(sun);
    const inner = new THREE.Group(); inner.add(gltf.scene); inner.rotation.y = yaws[k];
    inner.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(inner), s0 = box.getSize(new THREE.Vector3());
    if (s0.x > s0.z * 1.15) { inner.rotation.y += Math.PI / 2; inner.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(inner); }
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), sc = 4.4 / size.z;
    inner.scale.setScalar(sc); inner.position.set(-c.x * sc, -box.min.y * sc, -c.z * sc);
    let tris = 0, mats = new Set();
    gltf.scene.traverse(o => { if (!o.isMesh) return; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      o.material = ms.map(m => { const n = (m.name || "").split(".")[0]; mats.add(n);
        return n === "paint" ? new THREE.MeshStandardMaterial({ color: 0xb01818, metalness: 0.2, roughness: 0.3 }) : n === "glass" ? new THREE.MeshStandardMaterial({ color: 0x0d1014, roughness: 0.06 }) : m; });
      if (!Array.isArray(o.material) || o.material.length === 1) o.material = o.material[0] || o.material; });
    scene.add(inner);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x55585c })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const cam = new THREE.PerspectiveCamera(32, 400 / 260, 0.1, 100); cam.position.set(5.2, 2.6, 6.4); cam.lookAt(0, size.y * sc * 0.45, 0);
    r.render(scene, cam);
    const img = new Image(); img.src = r.domElement.toDataURL(); cell.appendChild(img);
    const t = document.createElement("div"); t.style.cssText = "position:absolute;left:6px;top:4px;background:#000a;padding:2px 6px";
    t.textContent = k + " · " + Math.round(tris / 1000) + "k tris · " + (mats.has("paint") ? "paint" : "NO PAINT") + (mats.has("glass") ? " · glass" : "");
    cell.appendChild(t); g.appendChild(cell);
  }
  document.title = "done";
})();
</script>`;
const mime = { ".js": "text/javascript", ".glb": "model/gltf-binary", ".json": "application/json", ".html": "text/html" };
const srv = http.createServer((q, res) => {
  const u = decodeURIComponent(q.url.split("?")[0]);
  if (u === "/") { res.setHeader("Content-Type", "text/html"); res.end(page); return; }
  const f = u.startsWith("/vendor/") ? path.join(VENDOR, u.slice(8)) : path.join(WEB, u);
  fs.readFile(f, (e, d) => { if (e) { res.statusCode = 404; res.end(); return; } res.setHeader("Content-Type", mime[path.extname(f)] || "application/octet-stream"); res.end(d); });
}).listen(0);
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await browser.newPage({ viewport: { width: 1612, height: 1100 } });
p.on("console", m => { if (m.type() === "error") console.log("page:", m.text()); });
await p.goto("http://localhost:" + srv.address().port + "/");
await p.waitForFunction(() => document.title === "done", null, { timeout: 600000 });
await p.screenshot({ path: path.join(OUT, "cars.png"), fullPage: true });
console.log("wrote", path.join(OUT, "cars.png"));
await browser.close(); srv.close();
