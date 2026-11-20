// The prop library: the street furniture that makes a Tokyo street look lived in. Each type knows how to draw itself
// and how it collides: static (bollards, poles, lamps) or dynamic (cones, bins, crates, barriers, bicycles, even a
// vending machine, which a car can shove across the pavement).
//
// Props are detailed primitives: bevelled boxes, lathed profiles, tubes and tori, built from enough pieces to read as
// the real object up close (seams, rims, hinges, bolts, feet). Every piece is drawn with a named texture slot from
// PropSlots.js and carries UVs laid out for it (metres for tiling slots, 0..1 for wrap and face slots), so painted PBR
// textures in Web/art/props/ land at the right scale with no per-prop code. docs/PROP_TEXTURES.md lists the slots.
// Game content can register its own types, drawn from glTF models, with engine.streamer.props.register(...).

import { PROP_SLOTS } from "./PropSlots.js";

export const PROP_DEFS = {
  cone:      { dynamic: true, shape: "cone", size: [0.18, 0.72, 0.18], mass: 2.5, offsetY: 0 },
  bin:       { dynamic: true, shape: "cylinder", size: [0.28, 0.9, 0.28], mass: 9 },
  crate:     { dynamic: true, shape: "box", size: [0.6, 0.6, 0.6], mass: 14, buoyancy: 1.6 },
  pallet:    { dynamic: true, shape: "box", size: [1.2, 0.15, 1.0], mass: 18, buoyancy: 1.8 },
  barrier:   { dynamic: true, shape: "box", size: [1.4, 0.8, 0.35], mass: 22 },
  bicycle:   { dynamic: true, shape: "box", size: [0.25, 1.0, 1.7], mass: 13 },
  vending:   { dynamic: true, shape: "box", size: [1.0, 1.85, 0.8], mass: 260, light: true },
  bench:     { dynamic: false, shape: "box", size: [1.8, 0.45, 0.5] },
  bollard:   { dynamic: false, shape: "cylinder", size: [0.12, 0.9, 0.12] },
  lamp:      { dynamic: false, shape: "cylinder", size: [0.1, 6.5, 0.1], light: true },
  pole:      { dynamic: false, shape: "cylinder", size: [0.17, 10, 0.17] },
  tree:      { dynamic: false, shape: "cylinder", size: [0.2, 3, 0.2] },
  planter:   { dynamic: false, shape: "box", size: [1.6, 0.6, 0.6] },
  signpost:  { dynamic: false, shape: "cylinder", size: [0.05, 3, 0.05] },
  ac:        { dynamic: false, shape: null, size: [0.8, 0.6, 0.3] },
  ball:      { dynamic: true, shape: "sphere", size: [0.11, 0.22, 0.11], mass: 0.43, restitution: 0.7, buoyancy: 4 },
  // the small furniture of a Japanese street (2026-11-20 density pass): drawn with the existing PBR slots, recoloured by vertex colour
  bikerack:  { dynamic: false, shape: "box", size: [3.2, 0.7, 0.4] },
  utilitybox:{ dynamic: false, shape: "box", size: [1.1, 1.35, 0.55] },
  postbox:   { dynamic: false, shape: "box", size: [0.5, 1.3, 0.45] },
  curvemirror:{ dynamic: false, shape: "cylinder", size: [0.05, 3.4, 0.05] },
  pots:      { dynamic: false, shape: null, size: [1.2, 0.7, 0.45] }
};

// ---- geometry helpers: every piece gets UVs that suit its slot ------------------------------------------------------
function scaleUV(geo, from, to, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = from; i < to; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
}
function tileOf(slot) { const s = PROP_SLOTS[slot]; return s && s.uv === "tile" ? (s.tile || 1) : 0; }

export function makeParts(T, add) {
  const E = new T.Euler(), Q = new T.Quaternion(), V = new T.Vector3(), Sc = new T.Vector3(1, 1, 1);
  const M = (x, y, z, rx, ry, rz) => new T.Matrix4().compose(V.set(x, y, z), Q.setFromEuler(E.set(rx || 0, ry || 0, rz || 0)), Sc);
  const P = {
    M,
    // a box; tiling slots get metre UVs on every face
    box(slot, w, h, d, x, y, z, col, ry, rx, rz) {
      const g = new T.BoxGeometry(w, h, d), t = tileOf(slot);
      if (t) { const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; dims.forEach(([a, b], f) => scaleUV(g, f * 4, f * 4 + 4, a / t, b / t)); }
      add(slot, g, M(x, y, z, rx, ry, rz), col);
    },
    // a box with rounded vertical edges and a small bevel, which is what moulded and pressed things look like
    rbox(slot, w, h, d, r, x, y, z, col, ry) {
      const bev = Math.min(r * 0.5, 0.01);
      w -= bev * 2; d -= bev * 2; r = Math.max(0.002, r - bev);     // the bevel grows the outline: keep the outside at w x d
      const s = new T.Shape(), hw = w / 2 - r, hd = d / 2 - r;
      s.moveTo(-hw, -d / 2); s.lineTo(hw, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -hd); s.lineTo(w / 2, hd); s.quadraticCurveTo(w / 2, d / 2, hw, d / 2);
      s.lineTo(-hw, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, hd); s.lineTo(-w / 2, -hd); s.quadraticCurveTo(-w / 2, -d / 2, -hw, -d / 2);
      const g = new T.ExtrudeGeometry(s, { depth: h - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 3 });
      g.rotateX(-Math.PI / 2); g.translate(0, -h / 2 + bev, 0);
      const t = tileOf(slot) || 1; scaleUV(g, 0, g.attributes.uv.count, 1 / t, 1 / t);   // ExtrudeGeometry's UVs are in metres
      add(slot, g, M(x, y, z, 0, ry), col);
    },
    // a cylinder or truncated cone; wrap slots keep 0..1 round and up, tiling slots get metres
    cyl(slot, r0, r1, h, seg, x, y, z, col, rx, rz, ry, open) {
      seg = seg || 12;
      const g = new T.CylinderGeometry(r0, r1, h, seg, 1, !!open), t = tileOf(slot), side = (seg + 1) * 2;
      if (t) { scaleUV(g, 0, side, Math.PI * (r0 + r1) / t, h / t); scaleUV(g, side, g.attributes.uv.count, 2 * Math.max(r0, r1) / t, 2 * Math.max(r0, r1) / t); }
      add(slot, g, M(x, y, z, rx, ry, rz), col);
    },
    // a lathed profile [[radius, height], ...] from the bottom up: cones, bins, bollards, insulators
    lathe(slot, pts, seg, x, y, z, col) {
      const g = new T.LatheGeometry(pts.map(p => new T.Vector2(p[0], p[1])), seg || 16), t = tileOf(slot);
      if (t) { let len = 0, rmax = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); for (const p of pts) rmax = Math.max(rmax, p[0]); scaleUV(g, 0, g.attributes.uv.count, Math.PI * 2 * rmax / t, len / t); }
      // LatheGeometry runs u round and v up the profile already: exactly the wrap layout
      add(slot, g, M(x, y, z), col);
    },
    torus(slot, R, r, x, y, z, col, ry, rx, segs) {
      const g = new T.TorusGeometry(R, r, 8, segs || 24), t = tileOf(slot);
      if (t) scaleUV(g, 0, g.attributes.uv.count, Math.PI * 2 * R / t, Math.PI * 2 * r / t);
      add(slot, g, M(x, y, z, rx, ry), col);
    },
    // a tube along points [[x, y, z], ...]: handlebars, frames, rails, arms
    tube(slot, pts, r, col, segs) {
      const curve = new T.CatmullRomCurve3(pts.map(p => new T.Vector3(p[0], p[1], p[2])), false, "catmullrom", 0.1);
      const g = new T.TubeGeometry(curve, segs || Math.max(4, pts.length * 4), r, 8, false), t = tileOf(slot);
      if (t) scaleUV(g, 0, g.attributes.uv.count, curve.getLength() / t, Math.PI * 2 * r / t);
      add(slot, g, null, col);
    },
    // a flat face that shows a whole painted image (a sign, a window, a grille): facing +z before ry
    face(slot, w, h, x, y, z, col, ry, rx) { add(slot, new T.PlaneGeometry(w, h), M(x, y, z, rx, ry), col); },
    // a disc showing a whole image (road signs, grilles), facing +z before ry
    disc(slot, r, x, y, z, col, ry, segs) { add(slot, new T.CircleGeometry(r, segs || 24), M(x, y, z, 0, ry), col); },
    sphere(slot, r, x, y, z, col, sx) { const g = new T.SphereGeometry(r, 18, 12); add(slot, g, M(x, y, z), col); },
    // an irregular clump (foliage): an icosphere pushed in and out by a smooth function of direction, so it reads as a
    // mass of leaves rather than a ball. `lumpy` 0..1 is how far it is pushed.
    blob(slot, r, x, y, z, col, detail, lumpy, seed) {
      const g = new T.IcosahedronGeometry(r, detail == null ? 1 : detail), t = tileOf(slot) || 1;
      if (lumpy) {
        const p0 = g.attributes.position, k = seed || 0;
        for (let i = 0; i < p0.count; i++) {
          const vx = p0.getX(i) / r, vy = p0.getY(i) / r, vz = p0.getZ(i) / r;
          const n = Math.sin(vx * 3.1 + k) * Math.sin(vy * 2.7 + k * 1.7) * Math.sin(vz * 3.3 + k * 0.6) + 0.5 * Math.sin(vx * 7.3 - vz * 5.1 + k * 2.3) * Math.sin(vy * 6.1 + k);
          const f = 1 + lumpy * n - (vy < -0.3 ? lumpy * 0.5 * (-vy - 0.3) : 0);   // flatter underneath, like a real crown
          p0.setXYZ(i, p0.getX(i) * f, p0.getY(i) * f, p0.getZ(i) * f);
        }
        // smooth normals straight out from the centre (the faces are split, so computeVertexNormals would facet them)
        const nn = g.attributes.normal;
        for (let i = 0; i < p0.count; i++) { const vx = p0.getX(i), vy = p0.getY(i), vz = p0.getZ(i), l = Math.hypot(vx, vy, vz) || 1; nn.setXYZ(i, vx / l, vy / l, vz / l); }
        nn.needsUpdate = true;
      }
      // spherical UVs so foliage textures wrap the clump; scaled to metres for the tiling leaf slot
      const p = g.attributes.position, uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), l = Math.hypot(vx, vy, vz) || 1;
        uv[i * 2] = (Math.atan2(vz, vx) / (Math.PI * 2) + 0.5) * Math.PI * 2 * r / t; uv[i * 2 + 1] = (Math.acos(vy / l) / Math.PI) * Math.PI * r / t; }
      g.setAttribute("uv", new T.BufferAttribute(uv, 2));
      add(slot, g, M(x, y, z), col);
    }
  };
  return P;
}

const W = [1, 1, 1];

// Draw a prop into a batcher (static) or return its parts (dynamic). `add(slot, geometry, matrix, colour)`.
// opts.tint: the colour for the tinted parts (bin drums, bicycle frames, vending cabinets) instead of a random livery;
// pass [1, 1, 1] to leave them white for per-instance colour.
export function drawProp(T, type, add, rng, opts) {
  const P = makeParts(T, add), tint = opts && opts.tint;
  switch (type) {
    case "cone": {
      P.lathe("cone_body", [[0.17, 0.05], [0.165, 0.07], [0.04, 0.7], [0.028, 0.72], [0, 0.725]], 20, 0, 0, 0, W);
      P.rbox("cone_base", 0.4, 0.05, 0.4, 0.04, 0, 0.025, 0, W);
      P.cyl("cone_base", 0.19, 0.19, 0.012, 20, 0, 0.056, 0, W);
      break;
    }
    case "bin": {
      const c = tint || (rng() < 0.5 ? [0.32, 0.55, 0.36] : [0.34, 0.42, 0.68]);
      P.lathe("bin_body", [[0.24, 0.0], [0.25, 0.04], [0.27, 0.78], [0.28, 0.8], [0.28, 0.82]], 24, 0, 0, 0, c);
      P.lathe("bin_lid", [[0.3, 0.82], [0.3, 0.86], [0.25, 0.9], [0.12, 0.92], [0.12, 0.9], [0.0, 0.9]], 24, 0, 0, 0, W);
      P.cyl("bin_lid", 0.12, 0.12, 0.08, 18, 0, 0.88, 0, [0.05, 0.05, 0.05], 0, 0, 0, true);    // the throw-in mouth
      P.face("bin_label", 0.21, 0.28, 0, 0.5, 0.268, W, 0, -0.025);
      P.torus("bin_lid", 0.245, 0.012, 0, 0.03, 0, W, 0, Math.PI / 2, 20);                  // the foot ring
      break;
    }
    case "crate": {
      for (const y of [0.075, 0.225, 0.375, 0.525]) {
        P.box("crate_wood", 0.6, 0.12, 0.02, 0, y, 0.29, W); P.box("crate_wood", 0.6, 0.12, 0.02, 0, y, -0.29, W);
        P.box("crate_wood", 0.02, 0.12, 0.56, 0.29, y, 0, W); P.box("crate_wood", 0.02, 0.12, 0.56, -0.29, y, 0, W);
      }
      for (const x of [-0.27, 0.27]) for (const z of [-0.27, 0.27]) P.box("crate_wood", 0.05, 0.6, 0.05, x, 0.3, z, [0.85, 0.82, 0.78]);
      P.box("crate_wood", 0.56, 0.02, 0.56, 0, 0.012, 0, W);
      break;
    }
    case "pallet": {
      for (let i = 0; i < 7; i++) P.box("pallet_wood", 0.14, 0.022, 1.0, -0.53 + i * 0.177, 0.139, 0, W);
      for (const x of [-0.53, 0, 0.53]) { P.box("pallet_wood", 0.1, 0.022, 1.0, x, 0.011, 0, W); for (const z of [-0.44, 0, 0.44]) P.box("pallet_wood", 0.1, 0.085, 0.12, x, 0.065, z, [0.9, 0.86, 0.82]); }
      for (const z of [-0.44, 0, 0.44]) P.box("pallet_wood", 1.2, 0.022, 0.1, 0, 0.117, z, W);
      break;
    }
    case "barrier": {
      P.face("barrier_panel", 1.3, 0.31, 0, 0.62, 0.021, W);
      P.face("barrier_panel", 1.3, 0.31, 0, 0.62, -0.021, W, Math.PI);
      P.box("barrier_frame", 1.32, 0.33, 0.04, 0, 0.62, 0, [0.95, 0.95, 0.95]);
      for (const x of [-0.62, 0.62]) {
        P.cyl("barrier_frame", 0.022, 0.022, 0.8, 10, x, 0.42, 0, W);
        P.tube("barrier_frame", [[x, 0.06, -0.16], [x, 0.3, -0.05], [x, 0.5, 0]], 0.016, W);
        P.tube("barrier_frame", [[x, 0.06, 0.16], [x, 0.3, 0.05], [x, 0.5, 0]], 0.016, W);
        P.rbox("barrier_foot", 0.12, 0.07, 0.36, 0.03, x, 0.035, 0, W);
      }
      P.box("barrier_frame", 1.24, 0.03, 0.03, 0, 0.82, 0, W);
      break;
    }
    case "bicycle": {
      const c = tint || [[0.8, 0.2, 0.18], [0.24, 0.36, 0.7], [0.94, 0.94, 0.94], [0.25, 0.25, 0.26]][(rng() * 4) | 0];
      for (const z of [-0.55, 0.55]) {
        P.torus("bicycle_tyre", 0.33, 0.024, 0, 0.35, z, W, Math.PI / 2, 0, 28);
        P.torus("bicycle_steel", 0.3, 0.008, 0, 0.35, z, W, Math.PI / 2, 0, 28);              // the rim
        P.cyl("bicycle_steel", 0.03, 0.03, 0.1, 10, 0, 0.35, z, W, 0, Math.PI / 2);          // the hub
        for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; P.cyl("bicycle_steel", 0.002, 0.002, 0.29, 3, 0, 0.35 + Math.sin(a) * 0.15, z + Math.cos(a) * 0.15, W, Math.PI / 2 - a); }
        const guard = []; for (let k = 0; k <= 6; k++) { const a = Math.PI * (0.22 + k * 0.1); guard.push([0, 0.35 + Math.sin(a) * 0.37, z + Math.cos(a) * 0.37]); }
        P.tube("bicycle_frame", guard, 0.014, c, 16);                                            // the mudguard
      }
      // the step-through mamachari frame: down tube swooping low, seat tube, chain stays, fork
      P.tube("bicycle_frame", [[0, 0.88, 0.42], [0, 0.6, 0.25], [0, 0.32, 0.0], [0, 0.3, -0.12]], 0.022, c);
      P.tube("bicycle_frame", [[0, 0.3, -0.12], [0, 0.6, -0.2], [0, 0.82, -0.24]], 0.02, c);
      P.tube("bicycle_frame", [[0, 0.3, -0.12], [0, 0.35, -0.55]], 0.012, c);
      P.tube("bicycle_frame", [[0, 0.75, -0.22], [0, 0.35, -0.55]], 0.01, c);
      P.tube("bicycle_frame", [[0, 0.95, 0.45], [0, 0.6, 0.52], [0, 0.35, 0.55]], 0.016, c);
      P.cyl("bicycle_frame", 0.05, 0.05, 0.12, 12, 0, 0.32, -0.08, c, 0, Math.PI / 2);       // the chain case
      P.box("bicycle_frame", 0.04, 0.12, 0.42, 0.04, 0.33, -0.3, c);
      P.tube("bicycle_steel", [[-0.27, 1.02, 0.36], [-0.12, 1.0, 0.44], [0, 0.98, 0.46], [0.12, 1.0, 0.44], [0.27, 1.02, 0.36]], 0.011, W);
      for (const s of [-1, 1]) P.cyl("bicycle_saddle", 0.017, 0.017, 0.11, 8, s * 0.24, 1.02, 0.37, W, 0, Math.PI / 2);
      P.cyl("bicycle_steel", 0.012, 0.012, 0.22, 8, 0, 0.9, -0.24, W);
      P.rbox("bicycle_saddle", 0.17, 0.06, 0.26, 0.06, 0, 1.0, -0.25, W);
      P.box("bicycle_steel", 0.3, 0.012, 0.36, 0, 0.7, -0.55, W);                              // the rear rack
      // the front basket: a wire box drawn as panels
      P.face("bicycle_basket", 0.34, 0.26, 0, 0.84, 0.82, W);
      P.face("bicycle_basket", 0.34, 0.26, 0, 0.84, 0.56, W, Math.PI);
      for (const s of [-1, 1]) P.face("bicycle_basket", 0.26, 0.26, s * 0.17, 0.84, 0.69, W, s * Math.PI / 2);
      P.box("bicycle_steel", 0.34, 0.006, 0.26, 0, 0.71, 0.69, W);
      P.cyl("bicycle_steel", 0.035, 0.035, 0.05, 10, 0, 0.95, 0.5, [1, 0.95, 0.8], Math.PI / 2);       // the lamp
      P.box("bicycle_frame", 0.015, 0.25, 0.04, 0.1, 0.18, -0.15, c, 0, 0, 0.5);              // the kickstand
      break;
    }
    case "vending": {
      const body = tint || [[0.9, 0.24, 0.22], [0.26, 0.48, 0.82], [0.95, 0.95, 0.95], [0.92, 0.62, 0.22]][(rng() * 4) | 0];
      P.rbox("vending_body", 1.0, 1.78, 0.8, 0.03, 0, 0.96, -0.0, body);
      P.box("vending_body", 1.04, 0.12, 0.84, 0, 1.86, 0.0, body);                              // the top cap
      P.box("vending_trim", 1.0, 0.08, 0.78, 0, 0.04, 0, W);                                    // the plinth
      P.box("vending_body", 0.92, 1.0, 0.04, 0, 1.3, 0.41, body);                                // the door frame
      P.face("vending_front", 0.84, 0.88, 0, 1.31, 0.431, W);
      P.box("vending_trim", 0.86, 0.02, 0.03, 0, 0.86, 0.425, W);
      P.face("vending_panel", 0.92, 0.48, 0, 0.56, 0.403, W);
      for (const s of [-1, 1]) P.box("vending_trim", 0.02, 1.72, 0.03, s * 0.49, 0.96, 0.415, W);
      P.cyl("vending_trim", 0.012, 0.012, 0.2, 8, 0.4, 0.62, 0.445, W);                           // the door lock bar
      break;
    }
    case "bench": {
      for (let i = 0; i < 4; i++) P.rbox("bench_wood", 1.8, 0.04, 0.09, 0.012, 0, 0.44, -0.18 + i * 0.105, W);
      for (let i = 0; i < 3; i++) P.rbox("bench_wood", 1.8, 0.085, 0.035, 0.01, 0, 0.6 + i * 0.11, -0.25 - i * 0.02, W);
      for (const x of [-0.78, 0, 0.78]) {
        P.tube("bench_iron", [[x, 0.0, 0.2], [x, 0.4, 0.18], [x, 0.42, -0.18], [x, 0.0, -0.22]], 0.02, W);
        P.tube("bench_iron", [[x, 0.42, -0.2], [x, 0.62, -0.25], [x, 0.85, -0.3]], 0.018, W);
        if (x) P.tube("bench_iron", [[x, 0.42, 0.18], [x, 0.62, 0.17], [x, 0.63, -0.05]], 0.016, W);   // the arm rests
      }
      break;
    }
    case "bollard": {
      P.lathe("bollard_body", [[0.12, 0], [0.12, 0.03], [0.1, 0.05], [0.095, 0.82], [0.09, 0.85]], 18, 0, 0, 0, W);
      P.lathe("bollard_cap", [[0.095, 0.85], [0.097, 0.87], [0.07, 0.92], [0.0, 0.935]], 18, 0, 0, 0, W);
      P.torus("bollard_body", 0.098, 0.008, 0, 0.7, 0, W, 0, Math.PI / 2, 18);
      break;
    }
    case "lamp": {
      P.lathe("lamp_pole", [[0.16, 0], [0.16, 0.25], [0.11, 0.3], [0.1, 0.5], [0.07, 6.3], [0.06, 6.45]], 14, 0, 0, 0, W);
      P.box("lamp_pole", 0.18, 0.3, 0.12, 0, 1.0, 0.1, W);                                       // the inspection door box
      P.tube("lamp_pole", [[0, 6.2, 0], [0, 6.45, 0.25], [0, 6.48, 0.9], [0, 6.42, 1.35]], 0.04, W);
      P.rbox("lamp_head", 0.34, 0.12, 0.62, 0.08, 0, 6.38, 1.45, W);
      for (let k = 0; k < 5; k++) P.box("lamp_head", 0.26, 0.025, 0.02, 0, 6.455, 1.25 + k * 0.1, W);  // cooling fins
      P.face("lamp_lens", 0.26, 0.48, 0, 6.318, 1.45, W, 0, Math.PI / 2);
      P.cyl("lamp_head", 0.03, 0.03, 0.05, 8, 0, 6.47, 1.6, W);                                   // the photocell
      break;
    }
    case "pole": {
      P.cyl("pole_concrete", 0.13, 0.17, 10, 16, 0, 5, 0, W);
      P.cyl("pole_concrete", 0.135, 0.135, 0.02, 16, 0, 10.0, 0, [0.7, 0.7, 0.7]);
      for (let k = 0; k < 7; k++) P.cyl("pole_metal", 0.012, 0.012, 0.5, 6, 0, 2.4 + k * 0.45, 0, W, Math.PI / 2, 0, (k % 2) * Math.PI / 2);  // climbing steps
      P.box("pole_metal", 1.8, 0.09, 0.09, 0, 9.2, 0, W);
      P.box("pole_metal", 1.2, 0.09, 0.09, 0, 8.4, 0, W);
      for (const x of [-0.8, -0.4, 0.4, 0.8]) P.lathe("pole_metal", [[0.04, 0], [0.05, 0.03], [0.03, 0.05], [0.05, 0.08], [0.03, 0.1], [0.02, 0.14], [0, 0.14]], 10, x, 9.245, 0, [0.95, 0.95, 0.92]);
      P.cyl("pole_metal", 0.25, 0.25, 0.7, 16, 0.38, 7.6, 0, W);                                 // the transformer
      P.cyl("pole_metal", 0.26, 0.26, 0.04, 16, 0.38, 7.97, 0, W);
      P.box("pole_metal", 0.06, 0.5, 0.06, 0.12, 7.6, 0, W);
      P.face("pole_guard", 0.36, 0.84, 0, 0.62, 0.176, W);                                       // the yellow-and-black guard
      P.face("pole_guard", 0.36, 0.84, 0, 0.62, -0.176, W, Math.PI);
      P.face("pole_plate", 0.32, 0.96, 0, 2.4, 0.18, W);                                        // the advert plate
      P.box("pole_metal", 0.36, 0.02, 0.03, 0, 2.9, 0.165, W); P.box("pole_metal", 0.36, 0.02, 0.03, 0, 1.9, 0.165, W);
      break;
    }
    case "tree": {
      const s = 0.8 + rng() * 0.5;
      P.lathe("tree_bark", [[0.22 * s, 0], [0.18 * s, 0.3 * s], [0.14 * s, 2.0 * s], [0.12 * s, 3.0 * s], [0.06 * s, 3.4 * s]], 9, 0, 0, 0, W);
      for (let i = 0; i < 3; i++) { const a = rng() * 6.28; P.tube("tree_bark", [[0, 2.4 * s, 0], [Math.cos(a) * 0.5 * s, 3.1 * s, Math.sin(a) * 0.5 * s], [Math.cos(a) * 0.9 * s, 3.6 * s, Math.sin(a) * 0.9 * s]], 0.05 * s, W); }
      for (let i = 0; i < 18; i++) {
        const a = rng() * 6.28, r = Math.sqrt(rng()) * 1.5 * s, up = rng();
        P.blob("tree_leaves", (0.45 + rng() * 0.4) * s * (1.2 - up * 0.4), Math.cos(a) * r * (1 - up * 0.5), (2.9 + up * 2.0) * s, Math.sin(a) * r * (1 - up * 0.5),
          [0.85 + rng() * 0.25, 0.88 + rng() * 0.2, 0.8 + rng() * 0.2], 2, 0.35, rng() * 10);
      }
      P.face("tree_grate", 1.2, 1.2, 0, 0.024, 0, W, 0, -Math.PI / 2);
      P.box("planter_box", 1.24, 0.03, 1.24, 0, 0.003, 0, [0.6, 0.6, 0.6]);
      break;
    }
    case "planter": {
      P.rbox("planter_box", 1.6, 0.5, 0.6, 0.04, 0, 0.25, 0, W);
      P.box("planter_box", 1.66, 0.06, 0.66, 0, 0.5, 0, [0.92, 0.92, 0.9]);                     // the coping
      P.box("planter_shrub", 1.5, 0.02, 0.5, 0, 0.52, 0, [0.35, 0.28, 0.22]);                   // soil
      for (let i = 0; i < 8; i++) P.blob("planter_shrub", 0.2 + rng() * 0.08, -0.68 + i * 0.195, 0.62 + rng() * 0.06, (rng() - 0.5) * 0.18, W, 2, 0.3, rng() * 10);
      break;
    }
    case "signpost": {
      P.cyl("signpost_pole", 0.03, 0.03, 3, 10, 0, 1.5, 0, W);
      P.cyl("signpost_pole", 0.032, 0.032, 0.02, 10, 0, 3.0, 0, W);
      P.disc("sign_face", 0.3, 0, 2.7, 0.052, W);
      P.cyl("sign_back", 0.305, 0.305, 0.012, 24, 0, 2.7, 0.043, W, Math.PI / 2);
      for (const y of [2.55, 2.85]) P.box("signpost_pole", 0.08, 0.025, 0.05, 0, y, 0.025, W); // the clamps
      break;
    }
    case "ac": {
      P.rbox("ac_body", 0.8, 0.58, 0.28, 0.02, 0, 0.3, 0, W);
      P.disc("ac_grille", 0.22, -0.12, 0.3, 0.142, W);
      P.torus("ac_body", 0.225, 0.012, -0.12, 0.3, 0.142, W, 0, 0, 16);
      P.face("ac_fins", 0.26, 0.5, 0.401, 0.3, 0, W, Math.PI / 2);
      P.face("ac_fins", 0.76, 0.5, 0, 0.3, -0.141, W, Math.PI);
      P.box("ac_body", 0.18, 0.12, 0.05, 0.27, 0.16, 0.15, [0.85, 0.85, 0.82]);                  // the valve cover
      P.tube("ac_fins", [[0.3, 0.12, 0.1], [0.42, 0.06, 0.1], [0.5, 0.0, 0.1]], 0.012, [0.9, 0.9, 0.85]);
      for (const x of [-0.32, 0.32]) P.box("ac_body", 0.06, 0.03, 0.32, x, 0.0, 0, [0.6, 0.6, 0.6]);
      break;
    }
    case "bikerack": {
      // a municipal cycle rack: two rails on low feet and a row of wheel slots (the bikes are placed separately)
      for (const z of [-0.12, 0.12]) P.cyl("bicycle_steel", 0.022, 0.022, 3.2, 10, 0, 0.28, z, W, 0, Math.PI / 2);
      for (let i = 0; i < 6; i++) {
        const x = -1.35 + i * 0.54;
        P.tube("bicycle_steel", [[x, 0.0, -0.18], [x, 0.42, -0.14], [x, 0.5, 0], [x, 0.42, 0.14], [x, 0.0, 0.18]], 0.014, W);
      }
      for (const x of [-1.55, 1.55]) P.box("barrier_foot", 0.12, 0.05, 0.42, x, 0.025, 0, [0.5, 0.5, 0.52]);
      break;
    }
    case "utilitybox": {
      // the grey-green ground transformer cabinet (地上機器) every pavement in the city has, with louvres and a warning plate
      const g = [0.62, 0.7, 0.62];
      P.rbox("ac_body", 1.06, 1.25, 0.5, 0.02, 0, 0.7, 0, g);
      P.box("ac_body", 1.12, 0.05, 0.56, 0, 1.35, 0, [0.55, 0.62, 0.55]);                        // the drip cap
      P.box("planter_box", 1.14, 0.1, 0.58, 0, 0.05, 0, [0.8, 0.8, 0.78]);                         // the concrete plinth
      P.face("ac_fins", 0.7, 0.22, 0, 1.05, 0.252, W);
      P.face("ac_fins", 0.7, 0.22, 0, 0.32, 0.252, W);
      P.face("bin_label", 0.16, 0.2, 0.32, 0.72, 0.252, W);                                         // the warning sticker
      P.box("vending_trim", 0.02, 0.9, 0.02, 0, 0.7, 0.255, W);                                      // the door seam
      P.cyl("vending_trim", 0.012, 0.012, 0.06, 8, -0.1, 0.72, 0.27, W, Math.PI / 2);                // the handle
      break;
    }
    case "postbox": {
      // the red post box (郵便ポスト): a rounded drum on a short pedestal, two slots, the collection-time plate
      const red = [0.86, 0.12, 0.1];
      P.rbox("ac_body", 0.42, 0.9, 0.36, 0.06, 0, 0.82, 0, red);
      P.rbox("ac_body", 0.46, 0.06, 0.4, 0.03, 0, 1.3, 0, red);
      P.cyl("ac_body", 0.07, 0.09, 0.38, 12, 0, 0.19, 0, [0.5, 0.08, 0.07]);
      for (const x of [-0.1, 0.1]) P.box("vending_trim", 0.16, 0.025, 0.02, x, 1.12, 0.185, [0.15, 0.15, 0.16]);
      P.face("bin_label", 0.22, 0.26, 0, 0.82, 0.182, W);
      break;
    }
    case "curvemirror": {
      // the orange-posted convex mirror at a blind corner (カーブミラー)
      const org = [1.0, 0.48, 0.14];
      P.cyl("ac_body", 0.038, 0.038, 3.4, 10, 0, 1.7, 0, org);
      P.cyl("ac_body", 0.04, 0.04, 0.02, 10, 0, 3.4, 0, org);
      P.tube("ac_body", [[0, 3.05, 0], [0, 3.1, 0.12], [0, 3.1, 0.2]], 0.02, org);
      P.cyl("ac_body", 0.42, 0.42, 0.06, 28, 0, 3.1, 0.26, org, Math.PI / 2);                      // the rim
      P.disc("sign_back", 0.4, 0, 3.1, 0.295, [0.92, 0.95, 0.98], 0, 32);                             // the mirror
      P.disc("sign_back", 0.42, 0, 3.1, 0.225, [0.5, 0.5, 0.5], Math.PI, 32);                          // its back
      P.face("pole_guard", 0.08, 0.6, 0, 0.9, 0.04, W);
      break;
    }
    case "pots": {
      // a doorstep garden: terracotta and glazed pots of different sizes, each with its plant
      const cols = [[0.72, 0.38, 0.24], [0.3, 0.36, 0.46], [0.66, 0.6, 0.52], [0.7, 0.36, 0.22]];
      const n = 3 + ((rng() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const r = 0.12 + rng() * 0.1, h = r * (1.1 + rng() * 0.5), x = -0.5 + i * 1.0 / Math.max(1, n - 1) + (rng() - 0.5) * 0.08, z = (rng() - 0.5) * 0.25;
        P.lathe("planter_box", [[r * 0.7, 0], [r, h * 0.9], [r * 1.08, h], [r * 0.95, h], [0, h * 0.85]], 14, x, 0, z, cols[(rng() * cols.length) | 0]);
        const k = 1 + ((rng() * 2) | 0);
        for (let j = 0; j < k; j++) P.blob("planter_shrub", r * (0.8 + rng() * 0.5), x + (rng() - 0.5) * r * 0.6, h + r * (0.5 + j * 0.45), z + (rng() - 0.5) * r * 0.6, W, 1, 0.3, rng() * 10);
      }
      break;
    }
    case "ball":
      P.sphere("ball_skin", 0.11, 0, 0, 0, W);
      break;
    default:
      P.box("crate_wood", 0.5, 0.5, 0.5, 0, 0.25, 0, W);
  }
}
