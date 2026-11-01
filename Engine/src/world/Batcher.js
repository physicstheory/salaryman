// Merge many small pieces into one mesh per material, so a whole street is a handful of draw calls.
// Every piece is converted to non-indexed triangles with position, normal, uv and colour, plus any extra
// per-vertex attributes the material needs (the facade shader's tangent and window layout).

export class Batcher {
  constructor(THREE) {
    this.T = THREE;
    this.groups = new Map(); // key -> { material, parts: [], extra: { name: itemSize } }
    this._m = new THREE.Matrix4();
    this._n = new THREE.Matrix3();
  }

  // geo: a BufferGeometry. matrix: placement. colour: [r,g,b] (0..1). extra: { name: [values per vertex, constant] }
  add(key, material, geo, matrix, colour, extra) {
    let g = this.groups.get(key);
    if (!g) this.groups.set(key, (g = { material, parts: [], extraSizes: {} }));
    const src = geo.index ? geo.toNonIndexed() : geo;
    if (extra) for (const k in extra) g.extraSizes[k] = extra[k].length;
    // colours are authored as sRGB (what you would pick in a paint program); lighting works in linear
    const lin = colour ? [Math.pow(colour[0], 2.2), Math.pow(colour[1], 2.2), Math.pow(colour[2], 2.2)] : [1, 1, 1];
    g.parts.push({ geo: src, matrix: matrix ? matrix.clone() : null, colour: lin, extra, own: src !== geo });
  }

  build(parent, opts) {
    const T = this.T, out = [];
    for (const [key, g] of this.groups) {
      let n = 0;
      for (const p of g.parts) n += p.geo.attributes.position.count;
      if (!n) continue;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
      const extras = {};
      for (const k in g.extraSizes) extras[k] = new Float32Array(n * g.extraSizes[k]);
      let o = 0;
      const v = new T.Vector3();
      for (const p of g.parts) {
        const a = p.geo.attributes, c = a.position.count;
        const m = p.matrix;
        if (m) this._n.getNormalMatrix(m);
        for (let i = 0; i < c; i++) {
          v.fromBufferAttribute(a.position, i); if (m) v.applyMatrix4(m);
          pos[(o + i) * 3] = v.x; pos[(o + i) * 3 + 1] = v.y; pos[(o + i) * 3 + 2] = v.z;
          if (a.normal) { v.fromBufferAttribute(a.normal, i); if (m) v.applyMatrix3(this._n).normalize(); nor[(o + i) * 3] = v.x; nor[(o + i) * 3 + 1] = v.y; nor[(o + i) * 3 + 2] = v.z; }
          if (a.uv) { uv[(o + i) * 2] = a.uv.getX(i); uv[(o + i) * 2 + 1] = a.uv.getY(i); }
          if (a.color) { col[(o + i) * 3] = a.color.getX(i) * p.colour[0]; col[(o + i) * 3 + 1] = a.color.getY(i) * p.colour[1]; col[(o + i) * 3 + 2] = a.color.getZ(i) * p.colour[2]; }
          else { col[(o + i) * 3] = p.colour[0]; col[(o + i) * 3 + 1] = p.colour[1]; col[(o + i) * 3 + 2] = p.colour[2]; }
        }
        for (const k in g.extraSizes) {
          const s = g.extraSizes[k], dst = extras[k];
          const own = a[k];
          for (let i = 0; i < c; i++) for (let j = 0; j < s; j++) dst[(o + i) * s + j] = own ? own.array[i * s + j] : (p.extra && p.extra[k] ? p.extra[k][j] : 0);
        }
        o += c;
        if (p.own) p.geo.dispose();
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(pos, 3));
      geo.setAttribute("normal", new T.BufferAttribute(nor, 3));
      geo.setAttribute("uv", new T.BufferAttribute(uv, 2));
      geo.setAttribute("color", new T.BufferAttribute(col, 3));
      for (const k in extras) geo.setAttribute(k, new T.BufferAttribute(extras[k], g.extraSizes[k]));
      geo.computeBoundingSphere();
      const mesh = new T.Mesh(geo, g.material);
      mesh.castShadow = !(opts && opts.noShadow && opts.noShadow.has(key));
      mesh.receiveShadow = true;
      mesh.name = key;
      parent.add(mesh);
      out.push(mesh);
    }
    this.groups.clear();
    return out;
  }
}
