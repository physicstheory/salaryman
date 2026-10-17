// Text in the world: a canvas drawn once per string and colour, shown on a flat plane. Japanese signage uses the system's CJK fonts.
import * as THREE from 'three/webgpu';

const FONT = "'Noto Sans JP','Noto Sans CJK JP','Yu Gothic','Hiragino Sans','Meiryo','Segoe UI',system-ui,sans-serif";
const texCache = new Map();
const matCache = new Map();
const unitPlane = new THREE.PlaneGeometry(1, 1);

function makeTexture(text, color, size, outline, outlineColor) {
  const key = [text, color, size, outline, outlineColor].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `700 ${size}px ${FONT}`;
  g.font = font;
  const lines = String(text).split('\n');
  let w = 0;
  for (const l of lines) w = Math.max(w, g.measureText(l).width);
  const pad = outline + 4;
  c.width = Math.max(8, Math.ceil(w + pad * 2));
  c.height = Math.ceil(lines.length * size * 1.18 + pad * 2);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  lines.forEach((l, i) => {
    const y = pad + size * 0.59 + i * size * 1.18;
    if (outline > 0) { g.strokeStyle = outlineColor; g.lineWidth = outline; g.strokeText(l, c.width / 2, y); }
    g.fillStyle = color;
    g.fillText(l, c.width / 2, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  const rec = { tex: t, w: c.width, h: c.height };
  texCache.set(key, rec);
  return rec;
}

/**
 * A text plane. `px` is metres per canvas pixel (Godot's pixel_size); `size` is the glyph height in canvas pixels.
 * The plane faces local +Z; give it a rotation to face a street.
 */
export function textMesh(text, { color = '#ffffff', size = 64, px = 0.01, outline = 8, outlineColor = 'rgba(5,5,10,1)', doubleSided = false } = {}) {
  const rec = makeTexture(text, color, size, outline, outlineColor);
  const mkey = text + '|' + color + '|' + size + '|' + outline + '|' + doubleSided;
  let mat = matCache.get(mkey);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ map: rec.tex, transparent: true, alphaTest: 0.04, depthWrite: false, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide });
    matCache.set(mkey, mat);
  }
  const m = new THREE.Mesh(unitPlane, mat);
  m.scale.set(rec.w * px, rec.h * px, 1);
  return m;
}
