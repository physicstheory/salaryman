// The sea's surface on the CPU, the same six Gerstner waves the water shader draws (konto.html WATER_GERSTNER), so what floats rides the
// swell you can see: the height of the surface at a point, its slope, and how the water itself is moving there (the orbital velocity of
// a trochoidal wave, which is what shoves a boat sideways on a crest and sucks it back in a trough).
//
// A Gerstner surface moves its points sideways as well as up, so the height above a fixed (x, z) is the height of the particle that has
// been carried there. One fixed-point step (find the particle whose displaced position lands on x, z) gets within a few millimetres for
// waves this steep, which is all a hull needs.
//
//   const sea = new Ocean({ amp: (x, z) => 0.6 * shallowFade(x, z) });
//   sea.time = water.t;  sea.height(x, z);  sea.sample(x, z, out)  // out: { y, vx, vy, vz, nx, ny, nz }

export const GERSTNER_WAVES = [
  // direction x, direction z, wavelength (m), steepness: the shader's table, in the same order
  [0.940, 0.342, 64.0, 0.13],
  [0.966, -0.259, 31.0, 0.14],
  [0.574, 0.819, 17.0, 0.15],
  [0.500, -0.866, 10.5, 0.13],
  [0.819, 0.574, 6.2, 0.11],
  [-0.259, 0.966, 3.6, 0.09]
];

export class Ocean {
  constructor(opts = {}) {
    this.level = opts.level || 0;
    this.time = 0;
    this.amp = typeof opts.amp === "function" ? opts.amp : (() => (opts.amp === undefined ? 0.6 : opts.amp));
    this.waves = (opts.waves || GERSTNER_WAVES).map((w, i) => {
      const k = 2 * Math.PI / w[2];
      return { dx: w[0], dz: w[1], k: k, c: Math.sqrt(9.81 / k), w: Math.sqrt(9.81 * k), s: w[3], ph: i * 1.7 };
    });
    this.scale = 1;          // a storm can raise the sea (the host keeps it in step with what it draws)
  }

  // The displacement of the particle that rests at (px, pz).
  _disp(px, pz, A, o) {
    let ox = 0, oy = 0, oz = 0, vx = 0, vy = 0, vz = 0, sx = 0, sz = 0;
    const t = this.time;
    for (let i = 0; i < this.waves.length; i++) {
      const W = this.waves[i];
      const a = W.s / W.k * A;
      if (a <= 0) continue;
      const f = W.k * (W.dx * px + W.dz * pz - W.c * t) + W.ph;
      const cf = Math.cos(f), sf = Math.sin(f);
      ox += W.dx * a * cf; oy += a * sf; oz += W.dz * a * cf;
      // d/dt of the offset: f changes at -omega
      vx += W.dx * a * W.w * sf; vy -= a * W.w * cf; vz += W.dz * a * W.w * sf;
      // the slope of the surface (for the normal), as the shader does it
      sx += W.dx * W.k * a * cf; sz += W.dz * W.k * a * cf;
    }
    o.ox = ox; o.oy = oy; o.oz = oz; o.vx = vx; o.vy = vy; o.vz = vz; o.sx = sx; o.sz = sz;
    return o;
  }

  sample(x, z, out) {
    out = out || {};
    const A = this.amp(x, z) * this.scale;
    if (!(A > 0)) { out.y = this.level; out.vx = out.vy = out.vz = 0; out.nx = 0; out.ny = 1; out.nz = 0; return out; }
    const d = this._d || (this._d = {});
    this._disp(x, z, A, d);
    // the particle that ends up over (x, z) started about one offset back
    this._disp(x - d.ox, z - d.oz, A, d);
    out.y = this.level + d.oy;
    out.vx = d.vx; out.vy = d.vy; out.vz = d.vz;
    const nx = -d.sx, nz = -d.sz, ny = 1;
    const L = Math.hypot(nx, ny, nz) || 1;
    out.nx = nx / L; out.ny = ny / L; out.nz = nz / L;
    return out;
  }

  height(x, z) { return this.sample(x, z, this._h || (this._h = {})).y; }
}
