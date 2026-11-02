// Wind for anything that flies through the air on its own: a skydiver, a canopy, a leaf.
//
// Three layers, added together:
//   1. The mean wind. A direction and a ten-metre speed set by the weather, growing with height on the urban power law
//      (U(h) = U10 * (h / 10)^0.24, the exponent for a city's rough ground) and veering clockwise with height, the way
//      friction with the ground turns the wind (the Ekman spiral: about 20 degrees between the street and 600 m).
//   2. Turbulence. Smooth three-octave value noise in space and in time, carried downwind with the mean flow (Taylor's
//      frozen turbulence), with an intensity that is highest near the ground and falls off with height, plus slow gust fronts.
//   3. Buildings. Each tall building near the jumper bends the flow round itself: it stagnates and splits on the windward
//      face (the flow above two thirds of the height goes up and over the roof, below it goes down the facade: the
//      downwash that pulls the unwary into the wall), speeds up round the corners, and leaves a slow, gusty wake behind
//      it several heights long. Over the roof the flow separates at the windward edge and lifts.
//
// sample(x, y, z, t, groundY) returns the air's velocity in m/s at that point. Pure maths, no three.js.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = t => t * t * (3 - 2 * t);

export const WIND_PRESETS = {
  clear:  { u10: 3.2, gust: 0.22, veer: 0.35 },
  cloudy: { u10: 4.6, gust: 0.28, veer: 0.35 },
  fog:    { u10: 1.4, gust: 0.12, veer: 0.2 },
  drizzle: { u10: 5.2, gust: 0.3, veer: 0.38 },
  rain:   { u10: 6.8, gust: 0.34, veer: 0.4 },
  snow:   { u10: 4.0, gust: 0.26, veer: 0.35 },
  storm:  { u10: 9.5, gust: 0.48, veer: 0.5 }
};

// hashed lattice value noise in 3D, smooth (C1) between lattice points
function hash3(i, j, k, seed) {
  let h = (i * 374761393 + j * 668265263 + k * 1274126177 + seed * 974634221) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 32767.5 - 1;
}
function noise3(x, y, z, seed) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const fx = smooth(x - i), fy = smooth(y - j), fz = smooth(z - k);
  const L = (a, b, t) => a + (b - a) * t;
  const c00 = L(hash3(i, j, k, seed), hash3(i + 1, j, k, seed), fx), c10 = L(hash3(i, j + 1, k, seed), hash3(i + 1, j + 1, k, seed), fx);
  const c01 = L(hash3(i, j, k + 1, seed), hash3(i + 1, j, k + 1, seed), fx), c11 = L(hash3(i, j + 1, k + 1, seed), hash3(i + 1, j + 1, k + 1, seed), fx);
  return L(L(c00, c10, fy), L(c01, c11, fy), fz);
}
function fbm(x, y, z, seed) { return noise3(x, y, z, seed) * 0.62 + noise3(x * 2.03, y * 2.03, z * 2.03, seed + 7) * 0.27 + noise3(x * 4.1, y * 4.1, z * 4.1, seed + 13) * 0.11; }

export class WindField {
  // o.dir: the direction the wind blows TOWARD, radians from +z toward +x. o.obstacles(x, z, r): buildings near (x, z):
  // [{ cx, cz, hw, hl, yaw (radians), base, top }]
  constructor(o = {}) {
    this.dir = o.dir !== undefined ? o.dir : 0.9;
    this.seed = o.seed || 1;
    this.obstacles = o.obstacles || null;
    this.alpha = 0.24;
    this.set(o.weather || "clear");
    this.out = { x: 0, y: 0, z: 0 };
  }
  set(weather, dir) {
    const p = WIND_PRESETS[weather] || WIND_PRESETS.clear;
    this.u10 = p.u10; this.gust = p.gust; this.veer = p.veer; this.weather = weather;
    if (dir !== undefined) this.dir = dir;
    return this;
  }
  // the mean wind speed at height h above the ground
  meanSpeed(h) { return this.u10 * clamp(Math.pow(Math.max(h, 2) / 10, this.alpha), 0.55, 2.7); }

  sample(x, y, z, t, groundY = 0) {
    const h = Math.max(0, y - groundY);
    const U = this.meanSpeed(h);
    const dir = this.dir + this.veer * clamp(h / 600, 0, 1.4);
    const dx = Math.sin(dir), dz = Math.cos(dir);
    // gust fronts: a few minutes long, the whole field breathing together
    const front = 1 + 0.22 * Math.sin(t * 0.071 + this.seed) + 0.14 * Math.sin(t * 0.193 + 2 * this.seed) + 0.08 * Math.sin(t * 0.61);
    let ux = dx * U * front, uz = dz * U * front, uy = 0;
    // turbulence: eddies about 40 m across near the ground, larger higher up, swept downwind
    const I = this.gust * (0.55 + 0.75 * Math.exp(-h / 120)), sig = I * U;
    const Ls = 38 + h * 0.25, adv = U * t;
    const px = (x - dx * adv) / Ls, py = y / (Ls * 0.7), pz = (z - dz * adv) / Ls, tt = t * 0.11;
    ux += sig * fbm(px, py, pz + tt, this.seed) * 1.6;
    uz += sig * fbm(px + 31.7, py, pz - tt, this.seed + 101) * 1.6;
    uy += sig * fbm(px - 17.3, py + 9.1, pz + tt, this.seed + 211) * 0.9;
    if (this.obstacles) { const b = this.buildings(x, y, z, U, dx, dz, t); ux = ux * b.k + b.x; uy = uy * b.kt + b.y; uz = uz * b.k + b.z; }
    const o = this.out; o.x = ux; o.y = uy; o.z = uz; return o;
  }

  // how the buildings near (x, y, z) change the wind: a factor on the mean flow and on the turbulence, plus an added velocity
  buildings(x, y, z, U, dx, dz, t) {
    const res = { k: 1, kt: 1, x: 0, y: 0, z: 0 };
    const list = this.obstacles(x, z, 260);
    if (!list || !list.length) return res;
    for (let i = 0; i < list.length; i++) {
      const b = list[i], H = b.top - b.base; if (H < 25) continue;
      // into the wind's frame: a downwind, c across (to the wind's right)
      const rx = x - b.cx, rz = z - b.cz;
      const a = rx * dx + rz * dz, c = rx * dz - rz * dx;
      // the building's half-size seen along and across the wind
      const cy = Math.cos(b.yaw), sy = Math.sin(b.yaw);
      const ca = Math.abs(dx * cy - dz * sy), sa = Math.abs(dx * sy + dz * cy);
      const D = b.hw * sa + b.hl * ca, W = b.hw * ca + b.hl * sa;
      const rel = (y - b.base) / H;
      if (rel > 1.35 || rel < -0.05) continue;
      if (rel <= 1) {
        // the wake: slow and gusty, widening and recovering over several building heights
        if (a > D) {
          const s = a - D, Lw = Math.min(H, 2.5 * W) * 3.2, wid = W * (1 + s / (Lw * 0.6));
          if (s < Lw * 1.6 && Math.abs(c) < wid) {
            const def = 0.78 * Math.exp(-s / Lw) * (1 - smooth(clamp((Math.abs(c) - W * 0.6) / (wid - W * 0.6 + 1e-3), 0, 1))) * (rel > 0.85 ? (1 - (rel - 0.85) / 0.15) : 1);
            res.k *= 1 - def; res.kt *= 1 + 2.4 * def;
            // the wake's eddies roll: alternate vortices shed off the two sides (a von Karman street, Strouhal 0.2)
            const fs = 0.2 * U / Math.max(4, 2 * W), ph = Math.sin(TAU * fs * t - s / Math.max(6, W) * 1.7);
            res.x += dz * ph * def * U * 0.45; res.z += -dx * ph * def * U * 0.45;
          }
        } else if (a > -D - H * 0.55 && Math.abs(c) < W + 4) {
          // the windward face: the flow slows as it nears the wall, splits at the stagnation point (about 0.7 H) and goes up or down
          const gap = Math.max(0, -D - a), near = 1 - smooth(clamp(gap / (H * 0.55), 0, 1));
          if (Math.abs(c) < W) {
            res.k *= 1 - 0.85 * near;
            const vert = rel > 0.7 ? (rel - 0.7) / 0.3 * 0.65 : -(0.7 - rel) / 0.7 * 0.4;
            res.y += vert * U * near;
            res.x += (c >= 0 ? dz : -dz) * 0.35 * U * near * Math.abs(c) / W;
            res.z += (c >= 0 ? -dx : dx) * 0.35 * U * near * Math.abs(c) / W;
          }
        }
        // round the corners and along the sides: faster (about 1.4 times)
        if (Math.abs(a) < D + 6 && Math.abs(c) > W && Math.abs(c) < W * 1.7 + 8) {
          const e = 1 - clamp((Math.abs(c) - W) / (W * 0.7 + 8), 0, 1);
          res.k *= 1 + 0.42 * e * (rel < 0.95 ? 1 : 0.4);
          res.kt *= 1 + 0.6 * e;
        }
      } else {
        // over the roof: the flow leaves the windward edge going up, separates, and the air over the roof is rough
        const lx = rx * cy - rz * sy, lz = rx * sy + rz * cy;
        if (Math.abs(lx) < b.hw + 6 && Math.abs(lz) < b.hl + 6) {
          const above = clamp((y - b.top) / (H * 0.35), 0, 1);
          const windward = clamp(-a / Math.max(D, 1), -1, 1);
          res.y += U * 0.32 * (1 - above) * clamp(windward + 0.4, 0, 1.4);
          res.kt *= 1 + 1.5 * (1 - above);
        }
      }
    }
    return res;
  }
}
