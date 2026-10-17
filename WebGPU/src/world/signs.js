// Dressing a building: the sign over the door, blade signs, rooftop billboards and tower banners (see signdata.js for the brands).
import * as THREE from 'three/webgpu';
import { ADS, BLADES, SHOP_NAMES } from './signdata.js';
import { glow } from './sky.js';
import { textMesh } from '../text.js';
import { Lod } from '../lod.js';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();
const VISIBLE_TO = 150;

const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
const lighten = (hex, t) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), t);

function glowMat(hex, energy, dayShare = 0.3, darken = 0.55) {
  const key = hex + '|' + energy + '|' + dayShare + '|' + darken;
  if (matCache.has(key)) return matCache.get(key);
  const c = new THREE.Color(hex);
  const m = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(1 - darken), emissive: c, emissiveIntensity: energy, roughness: 0.6 });
  if (energy > 0) glow(m, energy, dayShare);
  matCache.set(key, m);
  return m;
}

function panel(parent, size, pos, hex, energy, dayShare) {
  const m = new THREE.Mesh(unitBox, glowMat(typeof hex === 'string' ? hex : '#' + hex.getHexString(), energy, dayShare, energy > 0 ? 0.55 : 0));
  m.scale.set(size[0], size[1], size[2]);
  m.position.set(pos[0], pos[1], pos[2]);
  parent.add(m);
  return m;
}
const hexOf = (c) => '#' + new THREE.Color(c).getHexString();

function holderAt(parent, pos, yaw) {
  const h = new THREE.Group();
  h.position.set(pos.x, pos.y, pos.z);
  h.rotation.y = yaw;
  parent.add(h);
  return h;
}

/** A vertical blade sign standing out from a wall, readable from both directions along the street. */
export function blade(parent, base, outN, height, word, colHex) {
  const yaw = Math.atan2(outN.x, outN.z);
  const h = holderAt(parent, { x: base.x + outN.x * 0.7, y: base.y, z: base.z + outN.z * 0.7 }, yaw);
  panel(h, [0.28, height, 1.15], [0, height * 0.5, 0], hexOf(shade(colHex, 0.6)), 0.7, 0.3);
  const n = word.length;
  const step = Math.min(height / (n + 1), 1.15);
  const lc = hexOf(lighten(colHex, 0.35));
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const y = height - (i + 0.9) * step;
      const l = textMesh(word[i], { color: lc, size: 110, px: 0.0095, outline: 14 });
      l.position.set(side * 0.15, y, 0);
      l.rotation.y = (Math.PI * 0.5) * side;
      h.add(l);
    }
  }
  Lod.add(h, VISIBLE_TO);
}

export function shopSign(parent, pos, yaw, width, text, colHex) {
  const h = holderAt(parent, pos, yaw);
  panel(h, [width, 1.05, 0.2], [0, 0, 0], hexOf(shade(colHex, 0.55)), 0.9, 0.3);
  const l = textMesh(text, { color: hexOf(lighten(colHex, 0.4)), size: 96, px: 0.0105, outline: 12 });
  l.position.set(0, 0, 0.12);
  h.add(l);
  Lod.add(h, VISIBLE_TO);
}

export function billboard(parent, pos, yaw, w, ad) {
  const h = holderAt(parent, pos, yaw);
  const hh = w * 0.42;
  const bg = new THREE.Color(ad[2]).lerp(new THREE.Color(0xffffff), 0.1);
  panel(h, [w + 0.5, hh + 0.5, 0.35], [0, hh * 0.5 + 1.2, -0.05], '#1f1f24', 0, 0);
  panel(h, [w, hh, 0.2], [0, hh * 0.5 + 1.2, 0.05], hexOf(bg), 0.9, 0.3);
  for (const sx of [-0.35, 0.35]) panel(h, [0.25, 1.4, 0.25], [sx * w, 0.6, 0], '#242429', 0, 0);
  const t1 = textMesh(ad[0], { color: ad[3], size: 120, px: w * 0.0021, outline: 14 });
  t1.position.set(0, hh * 0.62 + 1.2, 0.2);
  h.add(t1);
  const t2 = textMesh(ad[1], { color: hexOf(new THREE.Color(ad[3]).lerp(new THREE.Color(0xffffff), 0.3)), size: 80, px: w * 0.0009, outline: 8 });
  t2.position.set(0, hh * 0.2 + 1.2, 0.2);
  h.add(t2);
  panel(h, [w, hh * 0.06, 0.22], [0, 1.2 + hh * 0.03, 0.06], ad[3], 1.2, 0.3);
  Lod.add(h, VISIBLE_TO + 120);
}

/** A tall banner on the wall of a tower. */
export function wallBanner(parent, pos, outN, w, hgt, ad) {
  const yaw = Math.atan2(outN.x, outN.z);
  const h = holderAt(parent, { x: pos.x + outN.x * 0.12, y: pos.y, z: pos.z + outN.z * 0.12 }, yaw);
  panel(h, [w, hgt, 0.12], [0, 0, 0], ad[2], 0.75, 0.3);
  const t1 = textMesh(ad[0], { color: ad[3], size: 110, px: w * 0.0058, outline: 12 });
  t1.position.set(0, hgt * 0.18, 0.08);
  h.add(t1);
  const t2 = textMesh(ad[1], { color: hexOf(new THREE.Color(ad[3]).lerp(new THREE.Color(0xffffff), 0.3)), size: 80, px: w * 0.0026, outline: 8 });
  t2.position.set(0, -hgt * 0.3, 0.08);
  h.add(t2);
  Lod.add(h, VISIBLE_TO + 60);
}

/** Dress one building. `box` is its world bounds (Box3), `outs` the street-facing directions (unit vectors in x or z). */
export function dress(parent, rng, box, outs, tallEnoughForBanner) {
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const top = box.max.y;
  const baseY = box.min.y;
  for (const n of outs) {
    const t = { x: -n.z, z: n.x };
    const faceW = Math.abs(t.x) * size.x + Math.abs(t.z) * size.z;
    const depth = Math.abs(n.x) * size.x * 0.5 + Math.abs(n.z) * size.z * 0.5;
    const wall = { x: centre.x + n.x * depth, z: centre.z + n.z * depth };
    const yaw = Math.atan2(n.x, n.z);
    // the shop name over the door
    if (rng.chance(0.85)) {
      const nm = rng.pick(SHOP_NAMES);
      const col = rng.pick(BLADES)[1];
      const off = rng.range(-faceW * 0.25, faceW * 0.25);
      shopSign(parent, { x: wall.x + n.x * 0.16 + t.x * off, y: 3.55 + baseY, z: wall.z + n.z * 0.16 + t.z * off }, yaw, Math.min(nm.length * 0.95 + 1.2, faceW * 0.8), nm, col);
    }
    // blade signs, one to three, at the corners and middle of the face
    const blades = rng.int(1, 3);
    for (let i = 0; i < blades; i++) {
      const b = rng.pick(BLADES);
      const along = (i - (blades - 1) * 0.5) * faceW * 0.4 + rng.range(-1, 1);
      const hh = rng.range(4, Math.min(9, size.y * 0.5));
      const a = Math.max(-faceW * 0.45, Math.min(faceW * 0.45, along));
      blade(parent, { x: wall.x + t.x * a, y: baseY + rng.range(4.8, Math.max(5, size.y * 0.55 - hh)), z: wall.z + t.z * a }, n, hh, b[0], b[1]);
    }
    // a banner screen up the tower
    if (tallEnoughForBanner && rng.chance(0.55)) {
      const ad = rng.pick(ADS);
      const bh = rng.range(7, 11);
      const off = rng.range(-faceW * 0.2, faceW * 0.2);
      wallBanner(parent, { x: wall.x + t.x * off, y: baseY + Math.max(10, size.y * 0.55), z: wall.z + t.z * off }, n, Math.min(faceW * 0.35, 3.6), bh, ad);
    }
  }
  // a billboard on the roof of some, facing the first street
  if (outs.length > 0 && rng.chance(0.4)) {
    const n = outs[0];
    const t = { x: -n.z, z: n.x };
    const faceW = Math.abs(t.x) * size.x + Math.abs(t.z) * size.z;
    const depth = Math.abs(n.x) * size.x * 0.5 + Math.abs(n.z) * size.z * 0.5;
    billboard(parent, { x: centre.x + n.x * (depth - 1), y: top, z: centre.z + n.z * (depth - 1) }, Math.atan2(n.x, n.z), Math.max(5, Math.min(11, faceW * 0.8)), rng.pick(ADS));
  }
}
