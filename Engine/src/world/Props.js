// The prop library: the street furniture that makes a Tokyo street look lived in. Each type knows how to draw itself
// (from primitives, so it costs nothing to download) and how it collides: static (bollards, poles, lamps) or dynamic
// (cones, bins, crates, barriers, bicycles, even a vending machine, which a car can shove across the pavement).
// Game content can register its own types, drawn from glTF models, with engine.streamer.props.register(...).

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
  ball:      { dynamic: true, shape: "sphere", size: [0.11, 0.22, 0.11], mass: 0.43, restitution: 0.7, buoyancy: 4 }
};

// Draw a prop into a batcher (static) or return its parts (dynamic). `add(material, geometry, matrix, colour)`.
export function drawProp(T, type, add, rng) {
  const M = (x, y, z, ry, sx, sy, sz) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(0, ry || 0, 0)), new T.Vector3(sx || 1, sy || 1, sz || 1));
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cyl = (r0, r1, h, s) => new T.CylinderGeometry(r0, r1, h, s || 10);
  switch (type) {
    case "cone":
      add("plastic", cyl(0.02, 0.17, 0.62, 12), M(0, 0.36, 0), [0.95, 0.38, 0.06]);
      add("plastic", cyl(0.075, 0.115, 0.1, 12), M(0, 0.42, 0), [0.95, 0.95, 0.95]);
      add("plastic", box(0.4, 0.05, 0.4), M(0, 0.025, 0), [0.15, 0.15, 0.15]);
      break;
    case "bin":
      add("plastic", cyl(0.28, 0.25, 0.85, 14), M(0, 0.425, 0), rng() < 0.5 ? [0.2, 0.42, 0.25] : [0.25, 0.3, 0.55]);
      add("plastic", cyl(0.3, 0.3, 0.06, 14), M(0, 0.88, 0), [0.15, 0.15, 0.16]);
      break;
    case "crate":
      add("paint", box(0.6, 0.6, 0.6), M(0, 0.3, 0), [0.62, 0.47, 0.3]);
      add("paint", box(0.62, 0.06, 0.62), M(0, 0.12, 0), [0.5, 0.37, 0.22]);
      add("paint", box(0.62, 0.06, 0.62), M(0, 0.48, 0), [0.5, 0.37, 0.22]);
      break;
    case "pallet":
      add("paint", box(1.2, 0.03, 1.0), M(0, 0.135, 0), [0.66, 0.52, 0.36]);
      for (const x of [-0.5, 0, 0.5]) add("paint", box(0.12, 0.1, 1.0), M(x, 0.06, 0), [0.6, 0.47, 0.32]);
      break;
    case "barrier":
      for (let i = 0; i < 6; i++) add("plastic", box(0.233, 0.25, 0.08), M(-0.58 + i * 0.233, 0.62, 0), i % 2 ? [0.08, 0.08, 0.08] : [0.95, 0.78, 0.08]);
      add("metal", box(0.06, 0.8, 0.3), M(-0.62, 0.4, 0), [0.6, 0.6, 0.62]);
      add("metal", box(0.06, 0.8, 0.3), M(0.62, 0.4, 0), [0.6, 0.6, 0.62]);
      break;
    case "bicycle": {
      const c = [[0.8, 0.12, 0.1], [0.1, 0.2, 0.5], [0.9, 0.9, 0.9], [0.15, 0.15, 0.15]][(rng() * 4) | 0];
      for (const z of [-0.55, 0.55]) add("metal", new T.TorusGeometry(0.33, 0.025, 6, 20), new T.Matrix4().makeRotationY(Math.PI / 2).setPosition(0, 0.35, z), [0.1, 0.1, 0.1]);
      add("metal", box(0.04, 0.04, 1.0), M(0, 0.62, 0), c);
      add("metal", box(0.04, 0.5, 0.04), M(0, 0.55, -0.2), c);
      add("metal", box(0.2, 0.05, 0.1), M(0, 0.85, -0.25), [0.1, 0.1, 0.1]);
      add("metal", box(0.5, 0.03, 0.03), M(0, 0.95, 0.5), [0.7, 0.7, 0.7]);
      add("metal", box(0.3, 0.2, 0.25), M(0, 0.8, 0.62), [0.7, 0.7, 0.72]); // the basket
      break;
    }
    case "vending": {
      const body = [[0.9, 0.12, 0.12], [0.1, 0.35, 0.75], [0.95, 0.95, 0.95], [0.9, 0.55, 0.1]][(rng() * 4) | 0];
      add("paint", box(1.0, 1.85, 0.8), M(0, 0.925, 0), body);
      add("glow", box(0.86, 0.9, 0.02), M(0, 1.3, 0.41), [0.95, 0.95, 0.9]);
      for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) add("plastic", cyl(0.035, 0.035, 0.13, 6), M(-0.32 + k * 0.13, 1.0 + r * 0.28, 0.43), [rng(), rng(), rng()]);
      add("paint", box(0.7, 0.18, 0.05), M(0, 0.35, 0.41), [0.08, 0.08, 0.08]);
      break;
    }
    case "bench":
      add("paint", box(1.8, 0.06, 0.45), M(0, 0.45, 0), [0.55, 0.38, 0.22]);
      add("paint", box(1.8, 0.4, 0.05), M(0, 0.7, -0.2), [0.55, 0.38, 0.22]);
      for (const x of [-0.8, 0.8]) add("metal", box(0.06, 0.45, 0.45), M(x, 0.22, 0), [0.2, 0.2, 0.22]);
      break;
    case "bollard":
      add("metal", cyl(0.1, 0.12, 0.9, 10), M(0, 0.45, 0), [0.3, 0.32, 0.34]);
      add("plastic", cyl(0.105, 0.105, 0.06, 10), M(0, 0.78, 0), [0.95, 0.75, 0.1]);
      break;
    case "lamp":
      add("metal", cyl(0.07, 0.1, 6.5, 10), M(0, 3.25, 0), [0.35, 0.37, 0.4]);
      add("metal", box(0.08, 0.08, 1.6), M(0, 6.4, 0.75), [0.35, 0.37, 0.4]);
      add("metal", box(0.35, 0.12, 0.6), M(0, 6.35, 1.45), [0.3, 0.3, 0.32]);
      add("glow", box(0.3, 0.02, 0.5), M(0, 6.28, 1.45), [1.0, 0.86, 0.66]);
      break;
    case "pole":
      add("paint", cyl(0.13, 0.17, 10, 10), M(0, 5, 0), [0.62, 0.6, 0.56]);
      add("metal", box(1.8, 0.1, 0.1), M(0, 9.2, 0), [0.3, 0.3, 0.3]);
      add("metal", box(1.2, 0.1, 0.1), M(0, 8.4, 0), [0.3, 0.3, 0.3]);
      add("paint", cyl(0.25, 0.25, 0.7, 10), M(0.35, 7.6, 0), [0.55, 0.57, 0.58]); // transformer
      add("paint", box(0.3, 0.7, 0.02), M(0, 2.4, 0.17), [0.95, 0.85, 0.1]); // the yellow-and-black guard
      break;
    case "tree": {
      const s = 0.8 + rng() * 0.5;
      add("paint", cyl(0.12 * s, 0.18 * s, 3 * s, 7), M(0, 1.5 * s, 0), [0.32, 0.24, 0.17]);
      for (let i = 0; i < 6; i++) {
        const a = rng() * 6.28, r = rng() * 1.1 * s;
        add("leaves", new T.IcosahedronGeometry((0.9 + rng() * 0.6) * s, 1), M(Math.cos(a) * r, (3.2 + rng() * 1.4) * s, Math.sin(a) * r), [0.22 + rng() * 0.08, 0.36 + rng() * 0.1, 0.16]);
      }
      add("paint", box(1.2, 0.12, 1.2), M(0, 0.06, 0), [0.35, 0.3, 0.26]); // the tree grate
      break;
    }
    case "planter":
      add("paint", box(1.6, 0.5, 0.6), M(0, 0.25, 0), [0.55, 0.53, 0.5]);
      for (let i = 0; i < 4; i++) add("leaves", new T.IcosahedronGeometry(0.3 + rng() * 0.1, 0), M(-0.6 + i * 0.4, 0.6, 0), [0.25, 0.45 + rng() * 0.1, 0.2]);
      break;
    case "signpost":
      add("metal", cyl(0.04, 0.04, 3, 8), M(0, 1.5, 0), [0.6, 0.6, 0.62]);
      add("paint", new T.CylinderGeometry(0.3, 0.3, 0.03, 20).rotateX(Math.PI / 2), M(0, 2.7, 0.04), [0.85, 0.1, 0.1]);
      add("paint", box(0.4, 0.08, 0.04), M(0, 2.7, 0.06), [0.95, 0.95, 0.95]);
      break;
    case "ac":
      add("paint", box(0.8, 0.6, 0.3), M(0, 0.3, 0), [0.88, 0.88, 0.86]);
      add("metal", cyl(0.22, 0.22, 0.02, 16).rotateX(Math.PI / 2), M(-0.12, 0.3, 0.16), [0.2, 0.2, 0.2]);
      break;
    case "ball":
      add("plastic", new T.IcosahedronGeometry(0.11, 2), M(0, 0, 0), [0.95, 0.95, 0.95]);
      break;
    default:
      add("paint", box(0.5, 0.5, 0.5), M(0, 0.25, 0), [1, 0, 1]);
  }
}
