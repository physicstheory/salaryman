// Bake a level: read the hand-authored district files in Web/levels/<name>/src/ and write the streamable form,
// Web/levels/<name>/level.json plus one cells/<i>_<j>.json per grid cell that has anything in it.
//
//   node tools/bake-level.mjs kanda
//
// Authors (people or tools) edit the src/ files: whole streets and buildings in world metres. Baking clips ground,
// water and road markings at cell edges and drops every building, prop and light into the cell its centre is in.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) { console.error("usage: node tools/bake-level.mjs <level>"); process.exit(1); }
const dir = path.resolve(here, "../../Web/levels", name);
const meta = JSON.parse(fs.readFileSync(path.join(dir, "src/level.json"), "utf8"));
const cs = meta.cellSize || 64;
const cells = new Map();
const cell = (i, j) => { const k = i + "_" + j; let c = cells.get(k); if (!c) cells.set(k, (c = {})); return c; };
const push = (i, j, kind, v) => { const c = cell(i, j); (c[kind] || (c[kind] = [])).push(v); };
const at = (x, z) => [Math.floor(x / cs), Math.floor(z / cs)];
const centreOf = e => e.c ? e.c : e.pos ? (e.pos.length === 3 ? [e.pos[0], e.pos[2]] : e.pos) : e.rect ? [(e.rect[0] + e.rect[2]) / 2, (e.rect[1] + e.rect[3]) / 2] : e.poly ? avg(e.poly) : e.a && e.b ? [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2] : e.from ? [(e.from[0] + e.to[0]) / 2, (e.from[1] + e.to[1]) / 2] : [0, 0];
function avg(p) { return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]; }

function clipRect(kind, e) {
  const [x0, z0, x1, z1] = e.rect;
  for (let j = Math.floor(z0 / cs); j * cs < z1; j++) for (let i = Math.floor(x0 / cs); i * cs < x1; i++) {
    const r = [Math.max(x0, i * cs), Math.max(z0, j * cs), Math.min(x1, (i + 1) * cs), Math.min(z1, (j + 1) * cs)];
    if (r[2] - r[0] < 0.01 || r[3] - r[1] < 0.01) continue;
    push(i, j, kind, Object.assign({}, e, { rect: r }));
  }
}

// a road polyline becomes straight pieces, each cut where it crosses a cell edge
function splitRoad(r) {
  const pts = r.path;
  for (let s = 1; s < pts.length; s++) {
    const a = pts[s - 1], b = pts[s];
    const ts = [0, 1];
    for (const ax of [0, 1]) {
      const lo = Math.min(a[ax], b[ax]), hi = Math.max(a[ax], b[ax]);
      for (let g = Math.ceil(lo / cs) * cs; g < hi; g += cs) { const t = (g - a[ax]) / (b[ax] - a[ax]); if (t > 0 && t < 1) ts.push(t); }
    }
    ts.sort((x, y) => x - y);
    for (let k = 1; k < ts.length; k++) {
      const p = [a[0] + (b[0] - a[0]) * ts[k - 1], a[1] + (b[1] - a[1]) * ts[k - 1]];
      const q = [a[0] + (b[0] - a[0]) * ts[k], a[1] + (b[1] - a[1]) * ts[k]];
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.2) continue;
      const m = at((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      const seg = { a: p, b: q, width: r.width, lanes: r.lanes, centre: r.centre, edges: r.edges, y: r.y };
      if (s === 1 && k === 1 && r.crossStart) seg.crossA = true;
      if (s === pts.length - 1 && k === ts.length - 1 && r.crossEnd) seg.crossB = true;
      push(m[0], m[1], "roads", seg);
    }
  }
}

const srcDir = path.join(dir, "src");
let counts = {};
for (const f of fs.readdirSync(srcDir).filter(f => f.endsWith(".json") && f !== "level.json").sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(srcDir, f), "utf8"));
  for (const kind of Object.keys(d)) {
    if (kind.startsWith("_")) continue;
    for (const e of d[kind]) {
      counts[kind] = (counts[kind] || 0) + 1;
      if (kind === "ground" || kind === "water") { if (e.rect) clipRect(kind, e); else { const c = at(...centreOf(e)); push(c[0], c[1], kind, e); } }
      else if (kind === "roads") splitRoad(e);
      else { const c = at(...centreOf(e)); push(c[0], c[1], kind, e); }
    }
  }
}

fs.rmSync(path.join(dir, "cells"), { recursive: true, force: true });
fs.mkdirSync(path.join(dir, "cells"), { recursive: true });
for (const [k, c] of cells) fs.writeFileSync(path.join(dir, "cells", k + ".json"), JSON.stringify(c));
const out = Object.assign({}, meta, { format: "shigoto-level/1", cellSize: cs, cells: [...cells.keys()].sort(), baked: new Date().toISOString() });
fs.writeFileSync(path.join(dir, "level.json"), JSON.stringify(out, null, 2));
console.log("baked " + name + ": " + cells.size + " cells from", counts);
