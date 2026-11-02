// Filling in the PBR maps a model did not ship with. A Tripo or Meshy export, a VRoid body or a low-poly base often arrives with a
// colour picture only; this works the rest out from it in the browser, once per texture:
//   normal  from the colour's luminance treated as a height field (Sobel), strength by material kind (cloth weave and skin pores
//           shallow, leather and hair deeper)
//   ORM     R occlusion (how far each texel sits below its blurred neighbourhood), G roughness (the kind's base value, rougher in
//           the dark crevices, glossier on the highlights), B skin mask (the same YCbCr skin test the build script uses)
// The results are ordinary textures, so the character shader treats a synthesised map exactly like an authored one.

const KIND_ROUGH = { skin: 0.55, head: 0.55, lip: 0.35, eye: 0.08, hair: 0.45, leather: 0.38, cloth: 0.85, glass: 0.06, other: 0.7 };
const KIND_DEPTH = { skin: 1.2, head: 1.2, lip: 1.0, eye: 0.2, hair: 3.0, leather: 2.2, cloth: 1.6, glass: 0.0, other: 1.6 };

function canvasOf(img, max) {
  const w0 = img.naturalWidth || img.videoWidth || img.width, h0 = img.naturalHeight || img.videoHeight || img.height;
  if (!w0 || !h0) return null;
  const k = Math.min(1, max / Math.max(w0, h0)), w = Math.max(4, Math.round(w0 * k)), h = Math.max(4, Math.round(h0 * k));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  return { c, g, w, h, d: g.getImageData(0, 0, w, h) };
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    let s = 0; for (let x = -r; x <= r; x++) s += src[y * w + ((x + w) % w)];
    for (let x = 0; x < w; x++) { tmp[y * w + x] = s / (2 * r + 1); s += src[y * w + ((x + r + 1) % w)] - src[y * w + ((x - r + w) % w)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0; for (let y = -r; y <= r; y++) s += tmp[((y + h) % h) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s / (2 * r + 1); s += tmp[((y + r + 1) % h) * w + x] - tmp[((y - r + h) % h) * w + x]; }
  }
  return out;
}

export function skinMaskValue(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b, cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const soft = (v, lo, hi, e) => Math.min(1, Math.max(0, (v - lo) / e + 1)) * Math.min(1, Math.max(0, (hi - v) / e + 1));
  let m = soft(cb, 80, 124, 6) * soft(cr, 136, 172, 6) * soft(y, 85, 255, 20);
  m *= Math.min(1, Math.max(0, (r - g) / 12)) * Math.min(1, Math.max(0, ((r - b) / Math.max(r, 1) - 0.27) / 0.08));
  return m;
}

// returns { normal, orm } as THREE textures (either may be null if the material already has one)
export function synthesizeMaps(T, mat, kind, opts = {}) {
  const img = mat.map && mat.map.image;
  if (!img) return {};
  const cv = canvasOf(img, opts.size || 1024);
  if (!cv) return {};
  const { w, h, d } = cv, px = d.data, n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
  // high-pass the height: the colour's broad shading is lighting painted in, not relief
  const low = boxBlur(lum, w, h, Math.max(2, Math.round(w / 128)));
  const hgt = new Float32Array(n); for (let i = 0; i < n; i++) hgt[i] = lum[i] - low[i];
  const res = {};
  const flipY = mat.map.flipY;
  const mk = (data) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").putImageData(new ImageData(data, w, h), 0, 0);
    const t = new T.CanvasTexture(c); t.flipY = flipY; t.wrapS = mat.map.wrapS; t.wrapT = mat.map.wrapT;
    t.encoding = T.LinearEncoding; t.anisotropy = 4; t.needsUpdate = true; t.userData=t.userData||{};t.userData.shigotoSynth = true;
    return t;
  };
  if (!mat.normalMap) {
    const s = (KIND_DEPTH[kind] ?? 1.6) * (opts.normalStrength || 1) * (w / 512);
    const nd = new Uint8ClampedArray(n * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const at = (dx, dy) => hgt[((y + dy + h) % h) * w + ((x + dx + w) % w)];
      const gx = (at(1, -1) + 2 * at(1, 0) + at(1, 1)) - (at(-1, -1) + 2 * at(-1, 0) + at(-1, 1));
      const gy = (at(-1, 1) + 2 * at(0, 1) + at(1, 1)) - (at(-1, -1) + 2 * at(0, -1) + at(1, -1));
      let nx = -gx * s, ny = (flipY ? gy : -gy) * s, nz = 1; const l = Math.hypot(nx, ny, nz);
      const o = (y * w + x) * 4;
      nd[o] = (nx / l * 0.5 + 0.5) * 255; nd[o + 1] = (ny / l * 0.5 + 0.5) * 255; nd[o + 2] = (nz / l * 0.5 + 0.5) * 255; nd[o + 3] = 255;
    }
    res.normal = mk(nd);
  }
  if (!mat.roughnessMap || !mat.aoMap) {
    const base = KIND_ROUGH[kind] ?? 0.7;
    const cav = boxBlur(hgt, w, h, 3);
    const od = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const c = cav[i] - hgt[i];                                // positive in crevices
      const ao = Math.min(1, Math.max(0.25, 1 - c * 6));
      const r = Math.min(1, Math.max(0.05, base + c * 1.5 - Math.max(0, hgt[i]) * 0.6));
      const sk = kind === "hair" || kind === "eye" || kind === "glass" ? 0 : skinMaskValue(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
      od[i * 4] = ao * 255; od[i * 4 + 1] = r * 255; od[i * 4 + 2] = sk * 255; od[i * 4 + 3] = 255;
    }
    res.orm = mk(od);
  }
  return res;
}
