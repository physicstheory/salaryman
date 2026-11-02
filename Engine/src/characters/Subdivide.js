// Curved-triangle subdivision for skinned characters (PN triangles, Vlachos et al. 2001), one level: every triangle becomes four,
// and each new edge vertex is lifted onto the cubic patch the corner normals describe. A game-ready body of 7-10k triangles keeps its
// shape but loses the facets on its silhouette: the jaw, the skull, shoulders and knuckles turn round instead of polygonal.
//
// Edge points depend only on the two corner positions and their position-smoothed normals, so triangles on either side of a UV seam or
// a material boundary agree exactly and the mesh stays closed. Skin weights of the new vertices are the two corners' weights merged
// (the four strongest kept), so the result deforms with the same skeleton. Morph-target meshes and cut-out cards (hair, lashes) are
// left alone.

export function subdivideGeometry(T, geo, opts = {}) {
  if (!geo.index || geo.morphAttributes && Object.keys(geo.morphAttributes).length) return null;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!pos || !nor) return null;
  const crease = Math.cos(((opts.creaseDeg ?? 55) * Math.PI) / 180);
  const n0 = pos.count, idx = geo.index.array;

  // position-smoothed normals (so seams agree)
  const keyOf = i => Math.round(pos.getX(i) * 1e4) + "," + Math.round(pos.getY(i) * 1e4) + "," + Math.round(pos.getZ(i) * 1e4);
  const groups = new Map(), sm = new Float32Array(n0 * 3);
  for (let i = 0; i < n0; i++) {
    const k = keyOf(i); let g = groups.get(k);
    if (!g) groups.set(k, (g = [0, 0, 0, []]));
    g[0] += nor.getX(i); g[1] += nor.getY(i); g[2] += nor.getZ(i); g[3].push(i);
  }
  groups.forEach(g => { const l = Math.hypot(g[0], g[1], g[2]) || 1; for (const i of g[3]) { sm[i * 3] = g[0] / l; sm[i * 3 + 1] = g[1] / l; sm[i * 3 + 2] = g[2] / l; } });

  const names = Object.keys(geo.attributes);
  // every attribute read through its accessors (glTF attributes are often interleaved) into plain arrays
  const comp = ["getX", "getY", "getZ", "getW"];
  const norm = a => !a.normalized ? 1 : a.array instanceof Uint8Array || a.array instanceof Int8Array ? 255 : a.array instanceof Uint16Array || a.array instanceof Int16Array ? 65535 : 1;
  const read = a => { const sz = a.itemSize, out = new Float32Array(a.count * sz), k = 1 / norm(a); for (let i = 0; i < a.count; i++) for (let c = 0; c < sz; c++) out[i * sz + c] = a[comp[c]](i) * k; return out; };
  // new vertices: originals first, then one per edge
  const edges = new Map();
  const extra = [];       // [a, b] per new vertex
  const tri = [];
  const mid = (a, b) => {
    const k = a < b ? a * n0 + b : b * n0 + a;
    let v = edges.get(k);
    if (v === undefined) { v = n0 + extra.length / 2; extra.push(a, b); edges.set(k, v); }
    return v;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    tri.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const ne = extra.length / 2, n1 = n0 + ne;
  const out = {};
  for (const name of names) {
    if (name === "skinIndex" || name === "skinWeight") continue;
    const src = geo.attributes[name], sz = src.itemSize, A = read(src), arr = new Float32Array(n1 * sz);
    arr.set(A);
    for (let e = 0; e < ne; e++) {
      const a = extra[e * 2], b = extra[e * 2 + 1], o = (n0 + e) * sz;
      if (name === "position") {
        const Pa = [A[a * 3], A[a * 3 + 1], A[a * 3 + 2]], Pb = [A[b * 3], A[b * 3 + 1], A[b * 3 + 2]];
        const Na = [sm[a * 3], sm[a * 3 + 1], sm[a * 3 + 2]], Nb = [sm[b * 3], sm[b * 3 + 1], sm[b * 3 + 2]];
        const D = [Pb[0] - Pa[0], Pb[1] - Pa[1], Pb[2] - Pa[2]];
        const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
        // cubic edge midpoint: 1/8 (P + Q) + 3/8 (b210 + b120), b210 = (2P + Q - (D.Na) Na) / 3; flat across creases
        const curved = dot(Na, Nb) > crease, wa = curved ? dot(D, Na) : 0, wb = curved ? -dot(D, Nb) : 0;
        for (let c = 0; c < 3; c++) arr[o + c] = (Pa[c] + Pb[c]) * 0.5 - (wa * Na[c] + wb * Nb[c]) * 0.125;
      } else {
        for (let c = 0; c < sz; c++) arr[o + c] = (A[a * sz + c] + A[b * sz + c]) / 2;
        if (name === "normal" || name === "tangent") {
          const l = Math.hypot(arr[o], arr[o + 1], arr[o + 2]) || 1;
          arr[o] /= l; arr[o + 1] /= l; arr[o + 2] /= l;
        }
      }
    }
    out[name] = new T.BufferAttribute(arr, sz);
  }
  if (geo.attributes.uv2 && geo.attributes.uv2 === geo.attributes.uv) out.uv2 = out.uv;
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  if (si && sw) {
    const SI = read(si), SW = read(sw);
    const I = new Uint16Array(n1 * 4), W = new Float32Array(n1 * 4);
    for (let i = 0; i < n0 * 4; i++) { I[i] = SI[i]; W[i] = SW[i]; }
    const acc = new Map();
    for (let e = 0; e < ne; e++) {
      const a = extra[e * 2], b = extra[e * 2 + 1], o = (n0 + e) * 4;
      acc.clear();
      for (const v of [a, b]) for (let c = 0; c < 4; c++) {
        const w = SW[v * 4 + c];
        if (w > 0) { const j = SI[v * 4 + c]; acc.set(j, (acc.get(j) || 0) + w * 0.5); }
      }
      const top = [...acc.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
      const sum = top.reduce((s, p) => s + p[1], 0) || 1;
      for (let c = 0; c < 4; c++) { I[o + c] = top[c] ? top[c][0] : 0; W[o + c] = top[c] ? top[c][1] / sum : 0; }
    }
    out.skinIndex = new T.BufferAttribute(I, 4);
    out.skinWeight = new T.BufferAttribute(W, 4);
  }
  const g2 = new T.BufferGeometry();
  for (const name of names) if (out[name]) g2.setAttribute(name, out[name]);
  g2.setIndex(new T.BufferAttribute(n1 > 65535 ? new Uint32Array(tri) : new Uint16Array(tri), 1));
  for (const gr of geo.groups) g2.addGroup(gr.start * 4, gr.count * 4, gr.materialIndex);
  g2.boundingBox = geo.boundingBox ? geo.boundingBox.clone() : null;
  g2.boundingSphere = geo.boundingSphere ? geo.boundingSphere.clone() : null;
  g2.userData = Object.assign({}, geo.userData, { shigotoSubdiv: (geo.userData.shigotoSubdiv || 0) + 1 });
  return g2;
}
