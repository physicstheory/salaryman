// A procedural Japanese city facade, drawn from world position so it does not depend on the mesh's UVs. Floors, bays, windows,
// balconies, air-conditioner boxes, a shopfront and a fascia on the ground storey, and a night pass where a share of the windows are
// lit. Written in TSL, so it runs the same on the WebGPU and WebGL2 backends.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, positionWorld, normalWorld, mix, step, smoothstep, floor, fract, abs, dot, max, min, clamp, select, sin, atan, normalize, uniform } from 'three/tsl';
import { nightU } from '../globals.js';

const h21 = Fn(([p]) => {
  const q = fract(p.mul(vec2(123.34, 456.21))).toVar();
  q.addAssign(dot(q, q.add(45.32)));
  return fract(q.x.mul(q.y));
});
const vnoise = Fn(([p]) => {
  const i = floor(p), f0 = fract(p);
  const f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return mix(mix(h21(i), h21(i.add(vec2(1, 0))), f.x), mix(h21(i.add(vec2(0, 1))), h21(i.add(vec2(1, 1))), f.x), f.y);
});
// 1 inside the rectangle lo..hi
const box = (p, lo, hi) => step(lo[0], p.x).mul(step(p.x, hi[0])).mul(step(lo[1], p.y)).mul(step(p.y, hi[1]));
const lampColour = (r) => select(r.lessThan(0.55), vec3(1.0, 0.78, 0.45),
  select(r.lessThan(0.8), vec3(0.85, 0.95, 1.0),
    select(r.lessThan(0.92), vec3(0.55, 0.7, 1.0), vec3(1.0, 0.55, 0.7))));

/** One material per building: the graph is shared, the uniforms are its own. */
export function facadeMaterial(p) {
  const wallCol = uniform(new THREE.Color(p.wall)), trimCol = uniform(new THREE.Color(p.trim)), shopCol = uniform(new THREE.Color(p.shop));
  const style = uniform(p.style), seed = uniform(p.seed), litRatio = uniform(p.lit);
  const floorH = uniform(p.floorH), bayW = uniform(p.bayW), shopH = uniform(4.6), glow = uniform(1.0);
  const night = nightU;

  const n = normalize(normalWorld);
  const t = normalize(vec2(n.z.negate(), n.x));
  const face = floor(atan(n.z, n.x).mul(1.27324)).add(seed.mul(13));
  const u = dot(positionWorld.xz, t).add(seed.mul(5.17));
  const v = positionWorld.y;

  // weathering: streaks down from the sills, a slow stain, a little grain
  const streak = vnoise(vec2(u.mul(1.7), v.mul(0.08).add(face)));
  const stain = vnoise(vec2(u.mul(0.12).add(face), v.mul(0.05)));
  let wall = wallCol.mul(float(0.86).add(stain.mul(0.22)).sub(streak.mul(0.1).mul(smoothstep(0, 14, float(14).sub(v)))));
  wall = wall.mul(h21(floor(vec2(u, v).mul(9))).mul(0.06).add(0.97));

  // ---- ground storey: shopfront
  const bw1 = bayW.mul(1.3);
  const cxS = floor(u.div(bw1)), fxS = fract(u.div(bw1));
  const rS = h21(vec2(cxS, face.add(seed)));
  const pS = vec2(fxS, v);
  const glass = box(pS, [0.07, 0.35], [0.93, 3.05]);
  const fascia = box(pS, [0.0, 3.1], [1.0, 4.35]);
  const pillar = float(1).sub(step(0.07, fxS).mul(step(fxS, 0.93)));
  const shutter = float(1).sub(step(0.2, rS));
  const slat = sin(v.mul(40)).mul(0.5).add(0.5);
  const shutterCol = mix(vec3(0.34, 0.36, 0.38), vec3(0.42, 0.44, 0.46), slat).mul(step(0.35, v));
  const shelf = step(0.5, fract(v.mul(3.2).add(h21(vec2(cxS, 3)))));
  const inner = mix(vec3(1.0, 0.92, 0.75), vec3(0.8, 0.9, 1.0), h21(vec2(cxS, 9)));
  const glassEmis = inner.mul(shelf.mul(0.3).add(0.28)).mul(glow).mul(mix(0.3, 1.0, night));
  const fasciaCol = shopCol.mul(h21(vec2(cxS, 5)).mul(0.45).add(0.55));
  const fasciaEmis = shopCol.mul(0.55).mul(glow).mul(mix(0.25, 1.0, night));
  // the shop face, when it is not a shutter
  let sCol = wall;
  sCol = mix(sCol, trimCol, pillar.mul(float(1).sub(glass)).mul(float(1).sub(fascia)));
  sCol = mix(sCol, vec3(0.05), glass);
  sCol = mix(sCol, fasciaCol, fascia);
  let sEmis = glassEmis.mul(glass);
  sEmis = mix(sEmis, fasciaEmis, fascia);
  let sMetal = glass.mul(0.2);
  let sRough = mix(float(0.88), 0.2, glass);
  // or a roll-down shutter, closed for the night
  sCol = mix(sCol, mix(shutterCol, shopCol.mul(0.5), fascia), shutter);
  sEmis = sEmis.mul(float(1).sub(shutter));
  sMetal = mix(sMetal, 0.6, shutter);
  sRough = mix(sRough, 0.45, shutter);

  // ---- upper storeys
  const yy = v.sub(shopH).div(floorH);
  const cy = floor(yy), fy = fract(yy);
  const cxU = floor(u.div(bayW)), fxU = fract(u.div(bayW));
  const rU = h21(vec2(cxU.add(face.mul(7)), cy.add(seed.mul(3))));
  const pU = vec2(fxU, fy);
  const s0 = step(style, 0.5), s1 = step(0.5, style).mul(step(style, 1.5)), s2 = step(1.5, style).mul(step(style, 2.5)), s3 = step(2.5, style);
  const win0 = box(pU, [0.12, 0.2], [0.62, 0.8]);
  const rail0 = box(pU, [0.04, 0.05], [0.96, 0.3]).mul(float(1).sub(box(pU, [0.07, 0.08], [0.93, 0.27])));
  const ac0 = box(pU, [0.7, 0.45], [0.9, 0.62]).mul(step(0.45, h21(vec2(cxU, cy.add(face)))));
  const win1 = box(pU, [0.0, 0.12], [1.0, 0.86]).mul(float(1).sub(box(pU, [0.47, 0.0], [0.53, 1.0])));
  const win2 = box(pU, [0.28, 0.28], [0.72, 0.72]);
  const ac2 = box(pU, [0.08, 0.1], [0.22, 0.24]).mul(step(0.7, rU));
  const win3 = box(pU, [0.15, 0.2], [0.85, 0.78]);
  const ac3 = box(pU, [0.4, 0.02], [0.6, 0.14]).mul(step(0.5, rU));
  const win = win0.mul(s0).add(win1.mul(s1)).add(win2.mul(s2)).add(win3.mul(s3));
  const rail = rail0.mul(s0);
  const ac = ac0.mul(s0).add(ac2.mul(s2)).add(ac3.mul(s3));
  const band = step(0, fy).mul(step(fy, 0.045));
  let uCol = mix(wall, trimCol, band.mul(0.8));
  uCol = mix(uCol, trimCol.mul(1.1), rail.mul(0.9));
  uCol = mix(uCol, vec3(0.78, 0.8, 0.82), ac);
  const on = step(rU, litRatio.mul(night).add(float(0.04).mul(float(1).sub(night)))).mul(step(0.04, fract(rU.mul(97))));
  const curtain = h21(vec2(cxU, cy.add(11))).mul(0.45).add(0.55);
  const lit = lampColour(fract(rU.mul(53))).mul(curtain).mul(0.85).mul(glow);
  const winLit = win.mul(on);
  const winDark = win.mul(float(1).sub(on));
  uCol = mix(uCol, vec3(0.06), winLit);
  uCol = mix(uCol, vec3(0.025, 0.035, 0.055), winDark);
  const uEmis = lit.mul(winLit);
  const uMetal = winDark.mul(0.85);
  const uRough = mix(float(0.88), 0.08, winDark);

  // ---- choose: roof, shopfront or upper storeys
  const isRoof = step(0.6, abs(n.y));
  const gravel = h21(floor(positionWorld.xz.mul(3)));
  const roofCol = mix(vec3(0.15, 0.16, 0.18), vec3(0.28, 0.28, 0.3), gravel).mul(select(n.y.greaterThan(0), float(1), float(0.5)));
  const isShop = float(1).sub(step(shopH, v));
  let col = mix(uCol, sCol, isShop);
  let emis = mix(uEmis, sEmis, isShop);
  let metal = mix(uMetal, sMetal, isShop);
  let rough = mix(uRough, sRough, isShop);
  col = mix(col, roofCol, isRoof);
  emis = emis.mul(float(1).sub(isRoof));
  metal = metal.mul(float(1).sub(isRoof));
  rough = mix(rough, 0.95, isRoof);

  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = col;
  m.emissiveNode = emis;
  m.roughnessNode = rough;
  m.metalnessNode = metal;
  return m;
}

export const FACADE_WALLS = [0xccc7b8, 0xbdb29e, 0x9ea3a8, 0xb2856b, 0x94a399, 0xd1d1d6, 0x8c94a8, 0xb8ad8c, 0x737075];
export const FACADE_SHOPS = [0xff5973, 0xffcc33, 0x4cccff, 0x80ff80, 0xff8c33, 0xd980ff, 0xf2f2f2];
