// Small helpers shared by the whole game: a seeded random generator, a few maths functions and a tiny event emitter.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const moveToward = (v, target, d) => (Math.abs(target - v) <= d ? target : v + Math.sign(target - v) * d);
export const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; };
export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;

/** A seeded generator (mulberry32). Same seed, same city. */
export class Rng {
  constructor(seed = 1) { this.s = seed >>> 0; }
  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }     // inclusive both ends
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
}

/** A minimal event emitter. */
export class Emitter {
  constructor() { this._h = {}; }
  on(name, fn) { (this._h[name] ||= []).push(fn); return this; }
  off(name, fn) { this._h[name] = (this._h[name] || []).filter((f) => f !== fn); }
  emit(name, ...args) { for (const f of this._h[name] || []) f(...args); }
}

export const yen = (n) => {
  const s = String(Math.abs(Math.trunc(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) { if (i && (s.length - i) % 3 === 0) out += ','; out += s[i]; }
  return (n < 0 ? '-¥' : '¥') + out;
};

export const pad2 = (n) => String(n).padStart(2, '0');
