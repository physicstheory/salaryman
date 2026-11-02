// Crossings: the signal cycle, cars stopping for red and for a level crossing that is down, and people crossing only at a crossing.
//   node --test Game/tools/crossings-test.cjs
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const html = fs.readFileSync(path.resolve(__dirname, '../../Web/konto.html'), 'utf8');
const part = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function ctx(extra) {
  const c = Object.assign({ Math, Map, Set, clamp, clock: 0, console, performance: { now: () => 0 }, THREE: { Object3D: function () {} },
    distToSeg(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, t = clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1); return Math.hypot(ax + dx * t - px, ay + dy * t - py); },
    insideBuilding: () => false, world: { sampleHeight: () => 5, surfaceY: () => 5 } }, extra || {});
  vm.createContext(c);
  vm.runInContext(part('const xing = {', '// ---- finding them') + part('const pedNet = {', '// ------------------------------------------------------------ street furniture') + ';this.xing=xing;this.pedNet=pedNet;', c);
  return c;
}
test('a junction gives each group green in turn, and people walk across a road only while its cars are red', () => {
  const c = ctx(), j = { kind: 'avenue', g0: 26, g1: 22, off: 0 };
  for (let t = 0; t < 120; t += 0.25) {
    const s = c.xingState(j, t);
    assert.ok(!(s.c[0] === 'G' && s.c[1] === 'G'), 'never both green');
    if (s.p[0] !== 'D') assert.equal(s.c[0], 'R', 'people cross group 0 only on its red (t=' + t + ')');
    if (s.p[1] !== 'D') assert.equal(s.c[1], 'R', 'people cross group 1 only on its red (t=' + t + ')');
  }
  const sc = { kind: 'scramble', g0: 20, g1: 20, off: 0 }; let all = 0;
  for (let t = 0; t < 120; t += 0.5) { const s = c.xingState(sc, t); if (s.s === 'W') { all++; assert.equal(s.c[0], 'R'); assert.equal(s.c[1], 'R'); } }
  assert.ok(all > 0, 'the scramble has its all-ways phase');
});
test('traffic stops at the stop line on red and for a level crossing that is down, and drives on through green', () => {
  const c = ctx(), j = { kind: 'avenue', g0: 26, g1: 22, off: 0 };
  const X = { type: 'zebra', j, grp: 0 }, lane = { xstops: [{ s: 100, X }], length: 1000 }, car = { s: 60, half: 2, v: 13 };
  c.clock = 2; assert.equal(c.xingLimit(car, lane, 13), 13, 'green: no limit');
  c.clock = 40; car.s = 85; const lim = c.xingLimit(car, lane, 13); assert.ok(lim < 13 && lim > 0, 'red ahead: slowing');
  car.s = 97.8; assert.equal(c.xingLimit(car, lane, 13), 0, 'red, at the line: stopped');
  const lx = { closed: true, warnT: 0 }, lane2 = { xstops: [{ s: 50, X: { type: 'level', lx } }], length: 500 }, car2 = { s: 47.8, half: 2, v: 0 };
  assert.equal(c.xingLimit(car2, lane2, 13), 0, 'the barrier is down');
  lx.closed = false; assert.equal(c.xingLimit(car2, lane2, 13), 13, 'up again');
});
test('people route along the pavements and take a road only by its crossing, and wait there for the green man', () => {
  const c = ctx();
  // two pavements either side of a road, joined only by one crossing
  const P = c.pedNet; P.x = []; P.z = []; P.adj = []; P.grid = new Map();
  const a = [], b = [];
  for (let i = 0; i <= 10; i++) { a.push(c.pedNetAdd(i * 6, 0)); b.push(c.pedNetAdd(i * 6, 20)); if (i) { c.pedNetLink(a[i - 1], a[i]); c.pedNetLink(b[i - 1], b[i]); } }
  const j = { kind: 'street', g0: 18, g1: 18, off: 0 }, X = { type: 'zebra', j, grp: 1, id: 0 };
  c.xing.list = [X]; c.pedNetLink(a[8], b[8], X); P.ready = true;
  const route = c.pedNetRoute(0, 0, 0, 20);
  assert.ok(route.includes(a[8]) && route.includes(b[8]), 'over the road at the crossing, nowhere else');
  for (let k = 1; k < route.length; k++) { const p = route[k - 1], q = route[k]; const across = (P.z[p] < 10) !== (P.z[q] < 10); if (across) assert.ok(c.pedNetEdgeX(p, q) === X); }
  // waiting: group 1 is crossed while group 0 is green (0..13 s walk); at t = 30 it is don't walk
  const ped = { na: a[8], nb: b[8], nu: 0, sp: 1.4, lat: 0, yaw: 0, x: 48, z: 0 };
  c.clock = 30; assert.equal(c.pedNetStep(ped, 0.1), false, 'waits at the kerb'); assert.equal(ped.nu, 0);
  c.clock = 2; assert.equal(c.pedNetStep(ped, 0.1), true, 'walks on green'); assert.ok(ped.crossing === X);
  c.clock = 30; c.pedNetStep(ped, 0.1); assert.ok(ped.nu > 0.01, 'and carries on across once started');
});
