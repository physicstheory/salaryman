// Builds the furniture and props in Web/props from Poly Haven (CC0): each model's 1k glTF is downloaded, simplified to a polygon budget a
// game can carry, its textures capped at 1024 (512 for small things), and packed as one .glb. Writes Web/props/index.json with each
// prop's size in metres, so the game can place it on a floor or a counter without loading it first.
//
//   npm i @gltf-transform/cli@4      (anywhere, then point GT at its .bin)
//   GT=/path/to/node_modules/.bin/gltf-transform node build-props.mjs
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../../Web/props"), TMP = path.resolve(process.env.TMPDIR || "/tmp", "props-src");
const GT = process.env.GT || "gltf-transform";
// id: [triangle budget, texture size]
const PROPS = {
  sofa_03: [12000, 1024], modern_coffee_table_01: [4000, 1024], chinese_tea_table: [6000, 1024], throw_pillows_01: [4000, 512],
  potted_plant_01: [8000, 1024], potted_plant_02: [8000, 1024], potted_plant_04: [5000, 512], modern_wooden_cabinet: [5000, 1024],
  drawer_cabinet: [5000, 1024], dining_table: [6000, 1024], dining_chair_02: [4000, 1024], electric_stove: [6000, 1024],
  vintage_microwave: [3000, 512], vintage_electric_kettle: [2000, 512], tea_set_01: [4000, 512], wall_clock: [2000, 512],
  standing_picture_frame_01: [1000, 512], side_table_01: [3000, 512], modern_ceiling_lamp_01: [3000, 512], chinese_screen_panels: [6000, 1024],
  television_02: [5000, 1024], gaming_console: [2000, 512], CashRegister_01: [4000, 512], wooden_display_shelves_01: [6000, 1024],
  steel_frame_shelves_03: [5000, 1024], WetFloorSign_01: [1500, 512], modular_street_seating: [6000, 1024], vintage_suitcase: [3000, 512],
  book_encyclopedia_set_01: [3000, 512], wooden_bookshelf_worn: [6000, 1024], security_camera_01: [2000, 512]
};
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
const get = async (u, f) => { if (fs.existsSync(f)) return; const r = await fetch(u); if (!r.ok) throw new Error(r.status + " " + u); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); };
const index = {};
for (const [id, [tris, tex]] of Object.entries(PROPS)) {
  try {
    const files = await (await fetch("https://api.polyhaven.com/files/" + id)).json();
    const g = files.gltf["1k"].gltf, dir = path.join(TMP, id), main = path.join(dir, path.basename(g.url));
    await get(g.url, main);
    for (const [rel, f] of Object.entries(g.include || {})) await get(f.url, path.join(dir, rel));
    const glb = path.join(OUT, id.toLowerCase() + ".glb"), mid = path.join(dir, "mid.glb");
    const run = (...a) => execFileSync(GT, a, { stdio: "pipe" });
    run("copy", main, mid);
    // weld, then simplify to the budget (meshopt), then cap the textures and re-encode them as JPEG
    run("weld", mid, mid);
    const before = triCount(mid), ratio = Math.min(1, tris / Math.max(1, before));
    if (ratio < 0.98) run("simplify", mid, mid, "--ratio", String(ratio.toFixed(4)), "--error", "0.002");
    if (triCount(mid) > tris * 1.3) run("simplify", mid, mid, "--ratio", String(Math.min(1, tris / triCount(mid)).toFixed(4)), "--error", "0.03");
    run("resize", mid, mid, "--width", String(tex), "--height", String(tex));
    run("jpeg", mid, mid, "--quality", "85");
    run("prune", mid, glb);
    const info = sizeOf(glb);
    index[id.toLowerCase()] = { file: id.toLowerCase() + ".glb", size: info.size, tris: info.tris, from: before };
    console.log(id, before, "->", info.tris, "tris", Math.round(fs.statSync(glb).size / 1024) + " KB", info.size.map(v => v.toFixed(2)).join(" x "));
  } catch (e) { console.log("skipped", id, String(e).slice(0, 200)); }
}
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1));
fs.writeFileSync(path.join(OUT, "LICENSE.txt"), "Props from Poly Haven (https://polyhaven.com), CC0 1.0 (public domain). Simplified and re-encoded by Game/tools/build-props.mjs.\n");

function readGlb(f) { const b = fs.readFileSync(f), jl = b.readUInt32LE(12); return { j: JSON.parse(b.slice(20, 20 + jl)), b: b }; }
function triCount(f) { const { j } = readGlb(f); let t = 0; (j.meshes || []).forEach(m => m.primitives.forEach(p => { t += p.indices !== undefined ? j.accessors[p.indices].count / 3 : j.accessors[p.attributes.POSITION].count / 3; })); return Math.round(t); }
// world-space bounds: walk the node tree applying translation/scale (the props have no rotations worth worrying about at the root)
function sizeOf(f) {
  const { j } = readGlb(f), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  const walk = (ni, s, t) => {
    const n = j.nodes[ni], ns = n.scale || [1, 1, 1], nt = n.translation || [0, 0, 0];
    const S = [s[0] * ns[0], s[1] * ns[1], s[2] * ns[2]], T = [t[0] + nt[0] * s[0], t[1] + nt[1] * s[1], t[2] + nt[2] * s[2]];
    if (n.mesh !== undefined) j.meshes[n.mesh].primitives.forEach(p => { const a = j.accessors[p.attributes.POSITION]; for (let k = 0; k < 3; k++) { const v1 = a.min[k] * S[k] + T[k], v2 = a.max[k] * S[k] + T[k]; lo[k] = Math.min(lo[k], v1, v2); hi[k] = Math.max(hi[k], v1, v2); } });
    (n.children || []).forEach(c => walk(c, S, T));
  };
  (j.scenes[j.scene || 0].nodes).forEach(n => walk(n, [1, 1, 1], [0, 0, 0]));
  return { size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], tris: triCount(f) };
}
