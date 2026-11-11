// Deterministic hashing for the realism engine. Everything about a person or a place (their name, their habits, what they do
// next Tuesday at a quarter past seven) is a pure function of the world seed and a few integers, so nothing has to be stored
// and the same woman walks the same dog past the same shrine every morning, save or no save.

export function hash32(a, b, c, d) {
  let h = 0x811c9dc5 ^ (a | 0);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = (h + (b | 0) * 0x9e3779b1) | 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = (h + (c | 0) * 0x27d4eb2f) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = (h + (d | 0) * 0x165667b1) | 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
// a number in [0, 1) from up to four integers
export function r01(a, b, c, d) { return hash32(a, b, c, d) / 4294967296; }

// a small sequential generator, for when one decision needs many draws
export function rng(seed) {
  let s = (seed >>> 0) || 0x6d2b79f5;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(arr, r) { return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))]; }
// weights: { key: w } or [[key, w], ...]
export function weighted(weights, r) {
  const list = Array.isArray(weights) ? weights : Object.entries(weights);
  let sum = 0; for (const e of list) sum += e[1];
  let x = r * sum;
  for (const e of list) { x -= e[1]; if (x < 0) return e[0]; }
  return list[list.length - 1][0];
}
// a roughly normal number (sum of three uniforms), mean 0, sd ~1
export function gauss(r) { const a = r(), b = r(), c = r(); return (a + b + c - 1.5) * 2; }
// a string to a seed
export function strSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
