// Fetch the Japanese car models in cars.json from Sketchfab (all CC Attribution) and make them game-ready:
//   - simplified to the triangle budget in cars.json (meshoptimizer), welded and pruned;
//   - textures resized to at most 2048 px and stored as WebP (sharp);
//   - the body's paint renamed "paint" (so every car in traffic gets its own colour), the windows "glass" and the tyres "tyre";
//   - written to Web/cars/<kind>.glb, registered in Web/cars/user.json, and credited in Web/cars/CREDITS.md.
//
//   cd Game/tools/cars && npm install
//   SKETCHFAB_TOKEN=<your API token> node fetch-cars.mjs [kind ...]
//   node fetch-cars.mjs --local <kind> <file.gltf|glb>     (process a model you already have, e.g. one bought or made yourself)
//
// The token is free: sign in at sketchfab.com, Settings > Password & API > API token. Sketchfab only hands a file over to a signed-in
// account, which is the only reason one is needed. It is read from the environment and never written anywhere.
// Only CC Attribution and CC0 models are accepted: the licence is checked again at download time and anything else is skipped.
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld, simplify, textureCompress, flatten, join } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../../../Web/cars");
const CFG = JSON.parse(fs.readFileSync(path.join(here, "cars.json"), "utf8"));
const TOKEN = process.env.SKETCHFAB_TOKEN;
const API = "https://api.sketchfab.com/v3/models/";
const OK_LICENCES = ["CC Attribution", "CC0 Public Domain"];
const want = process.argv.includes("--local") ? [process.argv[process.argv.indexOf("--local") + 1]] : process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CFG).filter(k => !k.startsWith("_"));

async function getJSON(url, auth) {
  const r = await fetch(url, { headers: auth ? { Authorization: "Token " + TOKEN } : {} });
  if (!r.ok) throw new Error(url + " -> HTTP " + r.status + (r.status === 401 ? " (is SKETCHFAB_TOKEN set and valid?)" : ""));
  return r.json();
}
async function download(url, file) {
  const r = await fetch(url); if (!r.ok) throw new Error("download HTTP " + r.status);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
function triCount(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) { const i = p.getIndices(), pos = p.getAttribute("POSITION"); n += (i ? i.getCount() : pos ? pos.getCount() : 0) / 3; }
  return Math.round(n);
}
// the body paint: by name if the author named it, else the material covering the most triangles that is not glass, rubber, chrome or light
function nameMaterials(doc) {
  const area = new Map();
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const m = p.getMaterial(); if (!m) continue; const i = p.getIndices();
    area.set(m, (area.get(m) || 0) + (i ? i.getCount() : p.getAttribute("POSITION").getCount()) / 3);
  }
  const named = { paint: null, glass: [], tyre: [] };
  for (const m of doc.getRoot().listMaterials()) {
    const n = (m.getName() || "").toLowerCase();
    if (/glass|window|windscreen|windshield|wind_?shield/.test(n) || m.getAlphaMode() === "BLEND") named.glass.push(m);
    else if (/tyre|tire|rubber|wheel_?black/.test(n)) named.tyre.push(m);
    else if (!named.paint && /car_?paint|body_?paint|\bpaint|carpaint|body$|^body|exterior|coat/.test(n)) named.paint = m;
  }
  if (!named.paint) {
    let best = null, ba = 0;
    for (const [m, a] of area) {
      const n = (m.getName() || "").toLowerCase();
      if (named.glass.includes(m) || named.tyre.includes(m) || /chrome|metal|light|lamp|interior|seat|plate|logo|badge|grill|grille|mirror|disc|brake|rim|black/.test(n)) continue;
      if (m.getBaseColorTexture() && a < 1) continue;
      if (a > ba) { ba = a; best = m; }
    }
    named.paint = best;
  }
  if (named.paint) named.paint.setName("paint");
  named.glass.forEach(m => m.setName("glass"));
  named.tyre.forEach(m => m.setName("tyre"));
  return { paint: named.paint ? 1 : 0, glass: named.glass.length, tyre: named.tyre.length };
}

async function main() {
  const li = process.argv.indexOf("--local");
  const local = li >= 0 ? { kind: process.argv[li + 1], file: path.resolve(process.argv[li + 2]) } : null;
  if (!TOKEN && !local) { console.error("Set SKETCHFAB_TOKEN to your Sketchfab API token (free: sketchfab.com > Settings > Password & API)."); process.exit(1); }
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const userPath = path.join(OUT, "user.json"), credPath = path.join(OUT, "CREDITS.md");
  const user = fs.existsSync(userPath) ? JSON.parse(fs.readFileSync(userPath, "utf8")) : {};
  const credits = {};
  if (fs.existsSync(credPath)) for (const line of fs.readFileSync(credPath, "utf8").split("\n")) { const m = line.match(/^- \*\*(\w+)\*\*/); if (m) credits[m[1]] = line; }
  const done = new Map();          // a model used for two kinds is fetched once
  for (const kind of want) {
    const c = CFG[kind] || {}; if (!CFG[kind] && !local) { console.warn("no entry for", kind); continue; }
    try {
      const info = local ? { name: path.basename(local.file), user: { username: "you" }, viewerUrl: local.file, license: { label: "CC0 Public Domain" } } : await getJSON(API + c.uid);
      const lic = info.license && info.license.label;
      if (!OK_LICENCES.includes(lic)) { console.warn(kind + ": " + info.name + " is " + lic + ", not CC-BY or CC0; skipped"); continue; }
      let src = local ? local.file : done.get(c.uid);
      if (!src) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "konto-car-"));
        const dl = await getJSON(API + c.uid + "/download", true);
        const zip = path.join(dir, "model.zip");
        await download(dl.gltf.url, zip);
        execFileSync("unzip", ["-q", "-o", zip, "-d", dir]);
        const gltf = execFileSync("find", [dir, "-name", "*.gltf"]).toString().trim().split("\n")[0];
        if (!gltf) throw new Error("no .gltf in the download");
        src = gltf; done.set(c.uid, src);
      }
      const doc = await io.read(src);
      const before = triCount(doc);
      await doc.transform(dedup(), flatten(), join(), weld({ tolerance: 0.0001 }));
      const ratio = Math.min(1, (c.tris || 60000) / Math.max(1, triCount(doc)));
      if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: ratio, error: 0.002, lockBorder: false }));
      await doc.transform(textureCompress({ encoder: sharp, targetFormat: "webp", resize: [2048, 2048], quality: 88 }), prune(), dedup());
      const mats = nameMaterials(doc);
      const out = path.join(OUT, kind + ".glb");
      await io.write(out, doc);
      const after = triCount(doc);
      user[kind] = Object.assign({ yaw: c.yaw || 0 }, c.livery === false ? { livery: false } : {});
      if (!local) credits[kind] = `- **${kind}**: "${info.name}" by ${info.user.displayName || info.user.username} (https://sketchfab.com/${info.user.username}), ${info.viewerUrl}, licensed ${lic} (${(info.license && info.license.url) || "https://creativecommons.org/licenses/by/4.0/"}). Simplified from ${before.toLocaleString()} to ${after.toLocaleString()} triangles, textures resized and converted to WebP.`;
      console.log(kind + ": " + info.name + " — " + before + " -> " + after + " triangles, " + Math.round(fs.statSync(out).size / 1024) + " KB, materials " + JSON.stringify(mats));
    } catch (e) { console.warn(kind + ": " + e.message); }
  }
  fs.writeFileSync(userPath, JSON.stringify(user, null, 1));
  fs.writeFileSync(credPath, "# Car models\n\nThe vehicles in `Web/cars` that came from Sketchfab, each under the licence named. Made game-ready by `Game/tools/cars/fetch-cars.mjs`.\n\n" + Object.keys(credits).sort().map(k => credits[k]).join("\n") + "\n");
}
main();
