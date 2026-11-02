// Tarmac, with what is painted on it, and pavement slabs. The surface is a tiled PBR set (albedo, normal, occlusion/roughness/metal)
// sampled twice at two scales so it does not repeat, then worn by tyre tracks, repair patches, hairline cracks and oil. Lane paint is
// drawn from the road's own UVs: edge lines, a dashed centre line that turns into a double yellow near each junction, zebra crossings
// and stop lines. After dark the street is damp, with puddles that mirror the neon.
//
// Real scans win: drop asphalt_02_diff_*.jpg, asphalt_02_nor_gl_*.png and asphalt_02_arm_*.jpg (Poly Haven) into assets/textures/road/
// and list them in assets/textures/road/index.json (see README).
import * as THREE from 'three/webgpu';
import { Fn, Loop, float, vec2, vec3, texture, uv, positionWorld, mix, step, smoothstep, floor, fract, mod, abs, dot, max, min, clamp, select } from 'three/tsl';
import { Assets } from '../assets.js';
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
const fbm = Fn(([p0]) => {
  const p = p0.toVar(), a = float(0.5).toVar(), s = float(0).toVar();
  Loop(4, () => {
    s.addAssign(a.mul(vnoise(p)));
    p.assign(p.mul(2.07).add(vec2(13.7, 4.1)));
    a.mulAssign(0.5);
  });
  return s;
});
const bar = (x, c, hw) => step(abs(x.sub(c)), hw);

let texSet = null;
async function loadSet() {
  if (texSet) return texSet;
  const dir = './assets/textures/road/';
  let names = { diff: 'asphalt_diff.jpg', nor: 'asphalt_nor.png', arm: 'asphalt_arm.jpg' }, real = false;
  try {
    const idx = await (await fetch(dir + 'index.json')).json();
    if (idx.diff && idx.nor && idx.arm) { names = idx; real = true; }
  } catch (e) { /* the generated set */ }
  texSet = {
    diff: Assets.texture(dir + names.diff, { srgb: true }),
    nor: Assets.texture(dir + names.nor),
    arm: Assets.texture(dir + names.arm),
    tile: real ? 2.6 : 4.0,
  };
  return texSet;
}

/**
 * @param opts.roadLen  length of the road plane in metres (the plane's v runs along it)
 * @param opts.pitch    block spacing: where the junctions are
 * @param opts.markings paint on the road (not on the junction tiles)
 * @param opts.pavement concrete slabs instead of tarmac
 */
export async function roadMaterial({ roadLen = 428, roadW = 12, pitch = 52, markings = true, pavement = false, normalMap = false } = {}) {
  const t = await loadSet();
  const wp = positionWorld.xz;
  const uvw = wp.div(t.tile);
  const uv2 = wp.div(t.tile * 3.7).add(vec2(0.37, 0.11));
  const a1 = texture(t.diff, uvw).rgb;
  const a2 = texture(t.diff, uv2).rgb;
  const arm = texture(t.arm, uvw).rgb;
  const night = nightU;

  const m = new THREE.MeshStandardNodeMaterial();
  m.metalness = 0;
  // the micro-relief is an ordinary normal map, which needs the mesh's UVs to be the world's (see worldUV in city.js); a custom normal node
  // does not survive the multiple-render-target pass the ambient occlusion needs
  if (normalMap) { m.normalMap = t.nor; m.normalScale = new THREE.Vector2(1, 1); }

  if (pavement) {
    // concrete slabs a little over a metre across, with joints, stains and weathering
    const g = wp.div(1.2);
    const f = fract(g);
    const joint = clamp(step(f.x, 0.022).add(step(f.y, 0.022)), 0, 1);
    const slab = h21(floor(g).add(7.7));
    const lum = dot(a1, vec3(0.333));
    let c = vec3(0.5, 0.49, 0.46).mul(slab.mul(0.4).add(0.8)).mul(lum.mul(1.6).mul(0.9).add(0.55));
    c = c.mul(fbm(wp.mul(0.12)).mul(0.35).add(0.82));
    c = mix(c, c.mul(0.45), joint);
    const damp = night.mul(0.5);
    c = c.mul(float(1).sub(damp.mul(0.3)));
    m.colorNode = c;
    m.roughnessNode = clamp(float(0.85).sub(damp.mul(0.3)).sub(float(1).sub(joint).mul(slab).mul(0.1)), 0.2, 1);
    m.aoNode = arm.r;
    return m;
  }

  const lumA2 = dot(a2, vec3(0.333));
  let alb = a1.mul(lumA2.mul(0.5).add(0.78));
  let rough = arm.g;
  let ao = arm.r;

  // slow variation: bleached stretches and darker, patched ones
  alb = alb.mul(fbm(wp.mul(0.045)).mul(0.4).add(0.82));

  let u = float(0), s = float(0), d = float(100), paint = float(0), track = float(0);
  if (markings) {
    const p = uv(1);
    u = p.x.mul(roadW);
    s = p.y.mul(roadLen).sub(6);
    const srel = mod(s.add(pitch * 0.5), pitch).sub(pitch * 0.5);
    d = abs(srel);
    // tyre tracks: two bands per lane, darker with the rubber and a little polished
    const tr = max(max(bar(u, 2.2, 0.38), bar(u, 3.9, 0.38)), max(bar(u, 8.1, 0.38), bar(u, 9.8, 0.38)));
    track = tr.mul(vnoise(vec2(u.mul(3), s.mul(0.35))).mul(0.5).add(0.5));
    alb = alb.mul(float(1).sub(track.mul(0.22)));
    rough = rough.sub(track.mul(0.1));
  }
  // repair patches: rectangles of newer, darker asphalt with a seam round them
  const pcell = wp.div(vec2(7, 11));
  const pc = floor(pcell), pf = fract(pcell);
  const hp = h21(pc.add(3.7));
  const lo = vec2(h21(pc.add(1)).mul(0.2).add(0.1), h21(pc.add(2)).mul(0.25).add(0.1));
  const hi = lo.add(vec2(h21(pc.add(4)).mul(0.3).add(0.35), h21(pc.add(5)).mul(0.3).add(0.25)));
  const inside = step(0.9, hp).mul(step(lo.x, pf.x)).mul(step(pf.x, hi.x)).mul(step(lo.y, pf.y)).mul(step(pf.y, hi.y));
  const edgeD = min(min(pf.x.sub(lo.x), hi.x.sub(pf.x)), min(pf.y.sub(lo.y), hi.y.sub(pf.y)));
  const seam = inside.mul(float(1).sub(step(0.012, edgeD)));
  alb = mix(alb, alb.mul(0.62), inside);
  alb = mix(alb, alb.mul(0.4), seam);
  rough = mix(rough, 0.97, inside.mul(0.6));
  // hairline cracks along ridges of a noise field, where the road is old
  const cr = abs(fbm(wp.mul(0.9)).sub(0.5));
  const crack = smoothstep(0.012, 0.0, cr).mul(smoothstep(0.5, 0.65, fbm(wp.mul(0.06).add(9))));
  alb = alb.mul(float(1).sub(crack.mul(0.7)));
  ao = ao.mul(float(1).sub(crack.mul(0.5)));
  // oil and fuel stains, dark and smooth
  const oil = smoothstep(0.7, 0.8, vnoise(wp.mul(0.35).add(5))).mul(track);
  alb = alb.mul(float(1).sub(oil.mul(0.3)));
  rough = mix(rough, 0.35, oil);

  if (markings) {
    const edgeL = bar(u, 0.7, 0.08).add(bar(u, roadW - 0.7, 0.08));
    const dash = bar(u, roadW * 0.5, 0.08).mul(step(mod(s, 9), 3)).mul(step(9.5 + 14, d));
    const dbl = bar(u, roadW * 0.5 - 0.17, 0.07).add(bar(u, roadW * 0.5 + 0.17, 0.07)).mul(step(d, 9.5 + 14)).mul(step(9.5, d));
    const zebra = step(6.4, d).mul(step(d, 9.4)).mul(step(1, u)).mul(step(u, roadW - 1)).mul(step(mod(u, 1.1), 0.55));
    const stop = step(10, d).mul(step(d, 10.45)).mul(step(0.8, u)).mul(step(u, roadW - 0.8));
    const yellow = dbl;
    const white = clamp(edgeL.mul(step(6.4, d)).add(dash).add(zebra).add(stop), 0, 1);
    const wear = smoothstep(0.25, 0.75, vnoise(wp.mul(2.3))).mul(0.4).add(0.6).mul(float(1).sub(track.mul(0.16)));
    const grain = min(texture(t.diff, uvw.mul(2)).r.mul(3).mul(0.4).add(0.8), 1.2);
    paint = clamp(max(white, yellow), 0, 1).mul(wear);
    const pcol = mix(vec3(0.78, 0.78, 0.76), vec3(0.82, 0.6, 0.08), yellow).mul(grain);
    alb = mix(alb, pcol, paint.mul(0.95));
    rough = mix(rough, 0.55, paint);
  }

  // after dark the street is damp, with standing water in the dips
  const wet = night.mul(0.55);
  const pud = smoothstep(0.56, 0.66, fbm(wp.mul(0.16).add(3))).mul(night).mul(float(1).sub(paint.mul(0.6)));
  alb = alb.mul(float(1).sub(wet.mul(0.3)).sub(pud.mul(0.3)));
  rough = mix(rough.mul(float(1).sub(wet.mul(0.35))), 0.04, pud);

  m.colorNode = clamp(alb, 0, 1);
  m.roughnessNode = clamp(rough, 0.03, 1);
  m.aoNode = ao;
  return m;
}
