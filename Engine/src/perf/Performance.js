// Shigoto performance engine: a steady frame rate and no stutter on any laptop or PC.
//
// Stutter is not the same thing as a low frame rate. A game can average 60 fps and still feel bad, because what the eye notices is the odd
// long frame (a shader compiled the first time something is seen, a texture uploaded, the garbage collector, a building raised in one go)
// and frames that arrive unevenly (a 144 Hz screen asked for 144 frames a second by a game that can only do 90 gets a mix of one-vblank and
// two-vblank frames, which judders). This module works on both. It knows nothing about the game; the host feeds it timestamps and asks it
// questions.
//
//   FramePacer      locks the frame rate to a whole number of screen refreshes (60 Hz: every refresh; 120 Hz: every second one; 144 Hz:
//                   every second, i.e. a steady 72) and gives the simulation a time step snapped to those refreshes, so motion is even.
//                   A one-off long frame is spread over the next few instead of making everything jump at once.
//   FrameProfiler   times the named parts of each frame (self time, so nested parts are not counted twice) and, when a frame runs long,
//                   says why: which part, whether a shader was compiled or a texture uploaded, whether the garbage collector ran, or
//                   whether the time went to the graphics card / driver rather than the game.
//   FrameBudget     how many milliseconds a frame can give to deferrable work (building detail, streaming cells, uploads), shrinking
//                   when the frame is already full and right after a hitch; plus idle(): a promise that resolves straight after a frame
//                   that has room to spare, for background work that must never cause a hitch of its own.
//   QualityGovernor holds the target by the 90th-percentile frame (not the average, which hides stutter). Graphics-card-bound: it lowers
//                   the resolution a few per cent at a time, then switches on the host's cheap "levers" (shadows every other frame, no
//                   ambient occlusion), then lowers the resolution further. Processor-bound: lowering the resolution would not help, so
//                   it tightens the work budgets instead. It gives everything back, in reverse order, when there is room again.
//   probeHardware   what the machine is (graphics chip, integrated or discrete, cores, memory, screen) for defaults and reports.
//
// PerformanceEngine ties them together:
//   const perf = new PerformanceEngine({ targetFps: 60 });
//   rAF(now => { const f = perf.frame(now); if (!f.run) return; ...simulate(f.dt)...; perf.end(renderer); });
//   perf.budget("detail", 5)   // ms this frame may spend on that workload
//   await perf.idle()          // resolves after a frame with headroom

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const COMMON_RATES = [30, 48, 50, 60, 72, 75, 85, 90, 100, 120, 144, 160, 165, 170, 180, 200, 240, 360];

// percentile of the first n values of a typed array (copies into a scratch array, never allocates after the first call)
const _scratch = new Float64Array(1024);
function percentile(arr, n, p) {
  n = Math.min(n, arr.length, _scratch.length);
  if (n <= 0) return 0;
  for (let i = 0; i < n; i++) _scratch[i] = arr[i];
  const s = _scratch.subarray(0, n).sort();
  const k = Math.min(n - 1, Math.max(0, Math.round((n - 1) * p)));
  return s[k];
}

// ---- frame pacing ---------------------------------------------------------------------------------------------------------------------
export class FramePacer {
  constructor(opts) {
    opts = opts || {};
    this.targetFps = opts.targetFps || 60;
    this.cap = opts.cap === undefined ? "auto" : opts.cap;   // "auto": whole refreshes nearest the target; 0: no cap; a number: that rate
    this.minFps = opts.minFps || 55;          // never lock below this on its own (a 60 Hz screen is never locked to 30)
    this.maxDebt = opts.maxDebt || 0.25;      // seconds of a hitch carried forward; beyond that the time is dropped
    this.vs = new Float64Array(120);          // raw rAF deltas (every callback, run or skipped): the screen's refresh
    this.vsN = 0; this.vsI = 0;
    this.interval = 1000 / 60;                // ms per refresh, estimated
    this.refresh = 60;
    this.hintHz = opts.refreshHz || 0;        // the screen's rate if the host knows it
    this.bestHz = 0;                          // fastest rate measured
    this.swap = 1;                            // refreshes per game frame
    this.extraSwap = 0;                       // added by the governor on high-refresh screens when even the lowered rate is not held
    this.lastCb = 0; this.lastRun = 0;
    this.debt = 0;                            // ms of wall time the simulation still owes (or is ahead by, negative)
    this.frames = 0;
    this.out = { run: false, dt: 0, elapsed: 0, hitch: false, severe: false, period: 1000 / 60, swap: 1, refresh: 60 };
  }
  // the frame period the game is aiming for, in ms
  period() { return this.interval * this.swap; }
  _estimate() {
    if (this.vsN < 20) return;
    // the 25th percentile of the callback deltas: when frames are dropped some deltas are two refreshes, never fewer than one
    let ms = percentile(this.vs, this.vsN, 0.25);
    if (!(ms > 2 && ms < 60)) return;
    let hz = 1000 / ms;
    for (const r of COMMON_RATES) if (Math.abs(hz - r) / r < 0.04) { hz = r; break; }
    // A game that misses every refresh gets its callbacks every second refresh, which looks exactly like a screen of half the rate. So:
    // the screen's own figure wins when the host has it (the desktop app asks Electron), and otherwise the fastest rate measured so far
    // stands (the loading screen's cheap frames measure the real one), and nothing under 50 Hz is believed.
    if (this.hintHz > 0 && hz < this.hintHz * 1.1) hz = this.hintHz;
    else if (hz < this.bestHz) hz = this.bestHz;
    if (hz < 50) hz = 60;
    this.bestHz = Math.max(this.bestHz, hz);
    this.refresh = hz; this.interval = 1000 / hz;
    let swap = 1;
    const cap = this.cap === "auto" ? this.targetFps : +this.cap || 0;
    if (cap > 0) swap = Math.max(1, Math.floor(hz / cap + 0.03));        // 60 Hz:1, 75:1, 120:2, 144:2 (72 fps), 165:2, 240:4
    // the governor may ask for one more refresh per frame, but only where that still leaves a fluid rate (144 Hz -> 48 is refused)
    if (this.extraSwap && hz / (swap + this.extraSwap) >= this.minFps) swap += this.extraSwap;
    this.swap = swap;
  }
  frame(t) {
    const o = this.out;
    if (this.lastCb) {
      const d = t - this.lastCb;
      if (d > 0 && d < 100) { this.vs[this.vsI] = d; this.vsI = (this.vsI + 1) % this.vs.length; this.vsN = Math.min(this.vsN + 1, this.vs.length); }
    }
    this.lastCb = t;
    if ((++this.frames & 31) === 0 || this.vsN === 20) this._estimate();
    if (!this.lastRun) { this.lastRun = t; o.run = true; o.dt = this.interval / 1000; o.elapsed = this.interval; o.hitch = o.severe = false; return this._fill(o); }
    const e = t - this.lastRun;
    const P = this.period();
    // skip this refresh: not time for a game frame yet (half a refresh of slack absorbs timestamp jitter)
    if (this.swap > 1 && e < P - this.interval * 0.5) { o.run = false; return this._fill(o); }
    this.lastRun = t;
    // snap to whole refreshes: rAF timestamps wobble by a fraction of a millisecond, and feeding that wobble to the simulation is visible
    const k = Math.max(1, Math.round(e / this.interval));
    let dt = Math.abs(e - k * this.interval) < this.interval * 0.3 ? k * this.interval : e;
    this.debt += e - dt;
    // a hitch: show it as at most two frame periods, carry the rest forward and pay it back a little each frame (no jump, no slow-motion)
    o.hitch = e > P * 1.9 + 4; o.severe = e > Math.max(50, P * 3);
    if (dt > P * 2) { this.debt += dt - P * 2; dt = P * 2; }
    if (this.debt > this.maxDebt * 1000) this.debt = this.maxDebt * 1000;      // a long stall: that time is gone, as before
    if (this.debt < -P) this.debt = -P;
    const pay = Math.max(-P * 0.25, Math.min(P * 0.5, this.debt * 0.2));
    if (!o.hitch) { dt += pay; this.debt -= pay; }
    o.run = true; o.dt = dt / 1000; o.elapsed = e;
    return this._fill(o);
  }
  _fill(o) { o.period = this.period(); o.swap = this.swap; o.refresh = this.refresh; return o; }
  reset() { this.lastRun = 0; this.debt = 0; }
  // the screen changed (another monitor, a new refresh rate): measure again
  hint(hz) { this.hintHz = hz > 0 ? hz : 0; this.bestHz = 0; this.vsN = Math.min(this.vsN, 19); }
}

// ---- profiling ------------------------------------------------------------------------------------------------------------------------
const CAUSES = ["shader compile", "texture upload", "geometry upload", "garbage collection", "game code", "graphics card / driver"];
export class FrameProfiler {
  constructor(opts) {
    opts = opts || {};
    this.sections = new Map();               // name -> { ms (this frame, self), ema, max, calls }
    this.stack = []; this.depth = 0;
    this.frameStart = 0; this.cpuMs = 0;
    this.ring = { elapsed: new Float64Array(240), cpu: new Float64Array(240), i: 0, n: 0 };
    this.hitches = [];                       // newest last, at most 40
    this.maxHitches = opts.maxHitches || 40;
    this.last = null;                        // what the previous frame did (a long gap is that frame's fault, or the GPU's after it)
    this.counters = { programs: 0, textures: 0, geometries: 0, heap: 0 };
    this.causeCount = Object.create(null);
    this.wrapped = [];
    this.enabled = true;
  }
  _sec(name) { let s = this.sections.get(name); if (!s) { s = { name, ms: 0, ema: 0, max: 0, calls: 0, child: 0 }; this.sections.set(name, s); } return s; }
  // time a call as a named section (self time: time spent in nested sections is taken off the parent)
  enter(name) {
    if (!this.enabled) return;
    const s = this._sec(name);
    const fr = this.stack[this.depth] || (this.stack[this.depth] = { s: null, t: 0, child: 0 });
    fr.s = s; fr.t = now(); fr.child = 0; this.depth++;
  }
  leave() {
    if (!this.enabled || this.depth <= 0) return;
    const fr = this.stack[--this.depth], el = now() - fr.t;
    fr.s.ms += el - fr.child; fr.s.calls++;
    if (this.depth > 0) this.stack[this.depth - 1].child += el;
  }
  // replace owner[key] (a function) by a timed version; returns false if it is not a function
  wrap(owner, key, label) {
    const fn = owner && owner[key];
    if (typeof fn !== "function" || fn.__shigotoTimed) return false;
    const self = this, name = label || key;
    const timed = function () { self.enter(name); try { return fn.apply(this, arguments); } finally { self.leave(); } };
    timed.__shigotoTimed = true; timed.__orig = fn;
    try { owner[key] = timed; } catch (e) { return false; }
    if (owner[key] !== timed) return false;
    this.wrapped.push([owner, key, fn]);
    return true;
  }
  unwrapAll() { for (const [o, k, f] of this.wrapped) try { o[k] = f; } catch (e) { /* gone */ } this.wrapped.length = 0; }
  begin(t) { this.frameStart = t || now(); this.depth = 0; for (const s of this.sections.values()) s.ms = 0; }
  // end of the game's work for this frame; info: { programs, textures, geometries, heap } as read now
  end(info, elapsed, period) {
    const t = now();
    this.cpuMs = t - this.frameStart;
    const r = this.ring; r.elapsed[r.i] = elapsed || 0; r.cpu[r.i] = this.cpuMs; r.i = (r.i + 1) % r.elapsed.length; r.n = Math.min(r.n + 1, r.elapsed.length);
    let top = null, top2 = null;
    for (const s of this.sections.values()) {
      s.ema += (s.ms - s.ema) * 0.05; if (s.ms > s.max) s.max = s.ms;
      if (!top || s.ms > top.ms) { top2 = top; top = s; } else if (!top2 || s.ms > top2.ms) top2 = s;
    }
    // time in the frame that no named part accounts for is a part of its own
    const untimed = this.cpuMs - this._total();
    const U = this._untimed || (this._untimed = { name: "untimed code", ms: 0 });
    U.ms = untimed;
    if (this.sections.size && untimed > (top ? top.ms : 0)) { top2 = top; top = U; } else if (this.sections.size && (!top2 || untimed > top2.ms)) top2 = U;
    const c = this.counters;
    const L = this.last || (this.last = { cpu: 0, top: "", topMs: 0, top2: "", top2Ms: 0, programs: 0, textures: 0, geometries: 0, heapDrop: 0, at: 0, period: 16.7 });
    L.sumAtEnd = this._total();
    L.cpu = this.cpuMs; L.top = top ? top.name : ""; L.topMs = top ? top.ms : 0; L.top2 = top2 ? top2.name : ""; L.top2Ms = top2 ? top2.ms : 0; L.at = t; L.period = period || 16.7;
    if (info) {
      L.programs = info.programs != null && c.programs ? info.programs - c.programs : 0;
      L.textures = info.textures != null && c.textures ? info.textures - c.textures : 0;
      L.geometries = info.geometries != null && c.geometries ? info.geometries - c.geometries : 0;
      L.heapDrop = info.heap && c.heap ? Math.max(0, c.heap - info.heap) : 0;
      if (info.programs != null) c.programs = info.programs;
      if (info.textures != null) c.textures = info.textures;
      if (info.geometries != null) c.geometries = info.geometries;
      if (info.heap) c.heap = info.heap;
    }
  }
  _total() { let n = 0; for (const s of this.sections.values()) n += s.ms; return n; }
  // the frame that just ended took `elapsed` ms from the one before: if that was a hitch, blame the previous frame's work
  hitch(elapsed, period, heapNow) {
    const L = this.last;
    if (!L) return null;
    // timed work that ran between frames (a background upload resumed by idle(), a timer): the longest such part is named
    const outside = this._total() - (L.sumAtEnd || 0);
    if (outside > period * 0.8) {
      let top = null; for (const s of this.sections.values()) if (!top || s.ms > top.ms) top = s;
      const h = { at: Math.round(now()), ms: Math.round(elapsed), cpu: Math.round(L.cpu), cause: "background work", top: top ? top.name : "", topMs: Math.round(outside), top2: L.top, top2Ms: Math.round(L.topMs), programs: L.programs, textures: L.textures, gcMb: 0 };
      this.hitches.push(h); if (this.hitches.length > this.maxHitches) this.hitches.shift();
      this.causeCount[h.cause] = (this.causeCount[h.cause] || 0) + 1;
      return h;
    }
    // garbage collection between frames shows as the heap dropping by megabytes while the game's own work was small
    const gcDrop = Math.max(L.heapDrop, heapNow && this.counters.heap ? this.counters.heap - heapNow : 0);
    let cause;
    if (L.programs > 0) cause = CAUSES[0];
    // the game's own work is only to blame if it was most of the gap; otherwise the time went to the graphics card / driver
    else if (L.cpu > elapsed * 0.5 && L.textures > 0) cause = CAUSES[1];
    else if (L.cpu > elapsed * 0.5 && L.geometries > 2) cause = CAUSES[2];
    else if (gcDrop > 2e6 && L.cpu < elapsed * 0.6) cause = CAUSES[3];
    else if (L.cpu > elapsed * 0.5) cause = CAUSES[4];
    else cause = CAUSES[5];
    const h = { at: Math.round(now()), ms: Math.round(elapsed), cpu: Math.round(L.cpu), cause, top: L.top, topMs: Math.round(L.topMs), top2: L.top2, top2Ms: Math.round(L.top2Ms),
      programs: L.programs, textures: L.textures, gcMb: +(gcDrop / 1e6).toFixed(1) };
    this.hitches.push(h); if (this.hitches.length > this.maxHitches) this.hitches.shift();
    this.causeCount[cause] = (this.causeCount[cause] || 0) + 1;
    return h;
  }
  // stats over the last n frames
  stats(n) {
    const r = this.ring; n = Math.min(n || 60, r.n);
    if (!n) return { n: 0, p50: 0, p90: 0, p99: 0, cpu50: 0, cpu90: 0 };
    // the newest n entries
    const a = new Float64Array(n), b = new Float64Array(n);
    for (let k = 0; k < n; k++) { const i = (r.i - 1 - k + r.elapsed.length) % r.elapsed.length; a[k] = r.elapsed[i]; b[k] = r.cpu[i]; }
    return { n, p50: percentile(a, n, 0.5), p90: percentile(a, n, 0.9), p99: percentile(a, n, 0.99), cpu50: percentile(b, n, 0.5), cpu90: percentile(b, n, 0.9) };
  }
  topSections(k) { return [...this.sections.values()].sort((a, b) => b.ema - a.ema).slice(0, k || 6).map(s => ({ name: s.name, ms: +s.ema.toFixed(2), max: +s.max.toFixed(1) })); }
  recentHitches(withinMs) { const t = now(); return this.hitches.filter(h => t - h.at <= withinMs); }
}

// ---- per-frame work budgets -----------------------------------------------------------------------------------------------------------
export class FrameBudget {
  constructor(opts) {
    opts = opts || {};
    this.factor = 1;                 // scales every budget: below 1 when the frame is full or just hitched, up to 1.5 with room to spare
    this.cpuBound = 1;               // the governor's extra squeeze when the processor is the bottleneck
    this.sinceHitch = 999;           // game frames since the last hitch
    this.headroom = 1;               // fraction of the frame period left after the game's own work (smoothed)
    this.spent = Object.create(null);
    this.waiters = [];
    this.playing = false;
  }
  update(cpuMs, period, hitch) {
    const free = Math.max(0, 1 - cpuMs / period);
    this.headroom += (free - this.headroom) * 0.1;
    this.sinceHitch = hitch ? 0 : this.sinceHitch + 1;
    let f = Math.max(0.25, Math.min(1.5, this.headroom * 2));
    if (this.sinceHitch < 20) f = Math.min(f, 0.35);            // straight after a hitch, do as little extra as possible
    this.factor = this.playing ? f * this.cpuBound : 1;         // on the loading screen nothing is watched frame by frame
    for (const k in this.spent) this.spent[k] = 0;
  }
  // ms that workload `name` may spend this frame (it asks once a frame and stops when the time is up)
  get(name, baseMs) { return Math.max(0.5, baseMs * this.factor); }
  // resolve the next time a frame ends with this much headroom and no hitch for `quiet` frames
  idle(opts) {
    opts = opts || {};
    return new Promise(res => this.waiters.push({ res, head: opts.headroom != null ? opts.headroom : 0.3, quiet: opts.quiet || 30, until: opts.timeout ? now() + opts.timeout : 0 }));
  }
  _release() {
    if (!this.waiters.length) return;
    const t = now();
    // one waiter per frame, so background work is spread out rather than stacked into a single frame
    for (let i = 0; i < this.waiters.length; i++) {
      const w = this.waiters[i];
      if ((this.headroom >= w.head && this.sinceHitch >= w.quiet) || (w.until && t > w.until) || !this.playing) { this.waiters.splice(i, 1); w.res(true); return; }
    }
  }
}

// ---- the governor ---------------------------------------------------------------------------------------------------------------------
export class QualityGovernor {
  constructor(opts) {
    opts = opts || {};
    this.scale = 1; this.maxScale = opts.maxScale || 1; this.softFloor = opts.softFloor || 0.85; this.floor = opts.floor || 0.67;
    this.setScale = opts.setScale || null;     // host: apply a render-scale multiplier
    this.levers = [];                          // { name, kind: "gpu"|"cpu", on: false, apply(on) }
    this.engaged = [];                         // names, in the order they were switched on
    this.cool = 2; this.good = 0; this.bad = 0; this.capped = 0; this.ceil = 1; this.lastUpAt = -99; this.t = 0;
    this.enabled = true; this.bound = "-"; this.lowFor = 0;
    this.log = [];
  }
  lever(def) { this.levers.push(Object.assign({ kind: "gpu", on: false }, def)); return this; }
  _note(s) { this.log.push(Math.round(this.t) + "s " + s); if (this.log.length > 30) this.log.shift(); }
  _apply(m) { m = Math.max(this.floor, Math.min(this.maxScale, this.ceil, m)); if (Math.abs(m - this.scale) < 0.004) return false; this.scale = m; if (this.setScale) this.setScale(m); return true; }
  hold(s) { this.cool = Math.max(this.cool, s); this.good = this.bad = 0; }
  // called about twice a second with the recent frame stats; budget is the FrameBudget (squeezed when processor-bound)
  step(st, period, dtSec, budget, pacer) {
    this.t += dtSec;
    if (!this.enabled || st.n < 20) return;
    if (this.cool > 0) { this.cool -= dtSec; return; }
    // With vsync a frame that fits never shows how much room it had (it still waits for the refresh), so "room" is: on target, and the
    // game's own work well inside the period. Raising is then a trial; if it costs frames within 4 s, that level becomes the ceiling.
    const over = st.p90 > period * 1.08, under = st.p90 < period * 1.04 && st.cpu90 < period * 0.6;
    // processor-bound only when the game's own work is most of the frame (with a software or saturated GPU, the frame is far longer)
    const cpuBound = st.cpu90 > period * 0.85 && st.cpu90 > st.p90 * 0.5;
    this.bound = over ? (cpuBound ? "cpu" : "gpu") : "-";
    this.lowFor = st.p90 > period * 1.5 ? this.lowFor + dtSec : 0;
    if (over) {
      this.good = 0; this.bad++;
      if (this.bad < 2) return;                                   // one slow half-second is a door opening, not a slow computer
      this.bad = 0;
      if (cpuBound) {
        // the processor is the bottleneck: resolution would not help. Do less deferrable work per frame, then the host's cpu levers.
        if (budget.cpuBound > 0.5) { budget.cpuBound = Math.max(0.5, budget.cpuBound * 0.8); this._note("cpu-bound: budgets x" + budget.cpuBound.toFixed(2)); this.cool = 1; return; }
        if (this._engage("cpu")) return;
        return;                                                   // resolution is not the problem: leave the picture alone
      }
      const hard = st.p90 > period * 1.4;
      if (this.t - this.lastUpAt < 4) this.ceil = Math.min(this.ceil, this.scale);   // we just raised it and it got worse: that was too far
      if (this.scale > this.softFloor + 0.005) { this._apply(Math.max(this.softFloor, this.scale * (hard ? 0.86 : 0.93))); this._note("res x" + this.scale.toFixed(2)); this.cool = 1; return; }
      if (this._engage("gpu")) return;
      if (this.scale > this.floor + 0.005) { this._apply(this.scale * (hard ? 0.88 : 0.94)); this._note("res x" + this.scale.toFixed(2)); this.cool = 1; return; }
      // nothing left to give on a high-refresh screen: one more refresh per frame (144 Hz: 72 -> 48 is refused by the pacer as too slow)
      if (pacer && !pacer.extraSwap && pacer.refresh / (pacer.swap + 1) >= pacer.minFps) { pacer.extraSwap = 1; this._note("pace: one more refresh per frame"); this.cool = 3; }
      return;
    }
    this.bad = 0;
    if (!under) { this.good = 0; return; }
    if (++this.good < 4) return;                                  // two seconds of room before giving anything back
    this.good = 0;
    if (pacer && pacer.extraSwap) { pacer.extraSwap = 0; this._note("pace: back to full rate"); this.cool = 3; return; }
    if (this.scale < this.softFloor - 0.005) { this._apply(Math.min(this.softFloor, this.scale * 1.05)); this.lastUpAt = this.t; this.cool = 1.5; return; }
    if (this.engaged.length) { const name = this.engaged.pop(), L = this.levers.find(l => l.name === name); if (L) { L.on = false; try { L.apply(false); } catch (e) { /* host */ } this._note("lever off: " + name); } this.lastUpAt = this.t; this.cool = 2; return; }
    if (budget.cpuBound < 1) { budget.cpuBound = Math.min(1, budget.cpuBound * 1.15); this.cool = 1; return; }
    if (this.scale < Math.min(this.maxScale, this.ceil) - 0.005) { this._apply(this.scale * 1.04); this.lastUpAt = this.t; this.cool = 1.5; }
    // held at a ceiling with room to spare for about 8 s: the scene has got easier, so the ceiling may lift a little and be tried again
    else if (this.ceil < this.maxScale && ++this.capped >= 4) { this.capped = 0; this.ceil = Math.min(this.maxScale, this.ceil * 1.04); }
  }
  _engage(kind) {
    const L = this.levers.find(l => !l.on && l.kind === kind && (!l.available || l.available()));
    if (!L) return false;
    L.on = true; this.engaged.push(L.name);
    try { L.apply(true); } catch (e) { /* host */ }
    this._note("lever on: " + L.name); this.cool = 2;
    return true;
  }
  restore() {
    while (this.engaged.length) { const L = this.levers.find(l => l.name === this.engaged.pop()); if (L) { L.on = false; try { L.apply(false); } catch (e) { /* host */ } } }
    this.ceil = this.maxScale; this._apply(this.maxScale); this.hold(3);
  }
}

// ---- what the machine is ----------------------------------------------------------------------------------------------------------------
export function probeHardware(renderer) {
  const h = { gpu: "", vendor: "", software: false, integrated: false, cores: 0, memGB: 0, maxTex: 0, screen: "", dpr: 1, webgl2: false, parallelCompile: false, timerQuery: false, cls: "mid", score: 50 };
  try {
    const nav = typeof navigator !== "undefined" ? navigator : {};
    h.cores = nav.hardwareConcurrency || 0; h.memGB = nav.deviceMemory || 0;
    if (typeof screen !== "undefined") h.screen = screen.width + "x" + screen.height;
    h.dpr = (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1;
    const gl = renderer && renderer.getContext ? renderer.getContext() : null;
    if (gl) {
      h.webgl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      h.gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      h.vendor = String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR));
      h.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
      h.parallelCompile = !!gl.getExtension("KHR_parallel_shader_compile");
      h.timerQuery = !!gl.getExtension(h.webgl2 ? "EXT_disjoint_timer_query_webgl2" : "EXT_disjoint_timer_query");
    }
  } catch (e) { /* defaults */ }
  const g = h.gpu.toLowerCase();
  h.software = /swiftshader|llvmpipe|software|basic render/.test(g);
  h.integrated = !h.software && /intel|uhd|iris|hd graphics|radeon\(tm\) graphics|radeon graphics|vega \d|adreno|mali|apple m1(?! (pro|max|ultra))/.test(g) && !/arc a\d/.test(g);
  let s = 50;
  if (h.software) s = 5;
  else if (/rtx (40|50)\d0|rx (7|9)\d00|apple m[2-9] (max|ultra)/.test(g)) s = 95;
  else if (/rtx|rx [56]\d00|apple m\d (pro|max)|arc a7/.test(g)) s = 80;
  else if (/gtx|rx \d{3}\b|radeon rx|radeon pro|arc/.test(g)) s = 62;
  else if (h.integrated) s = /iris.? xe|780m|680m|apple m/.test(g) ? 40 : 25;
  if (h.cores && h.cores <= 4) s -= 10;
  if (h.memGB && h.memGB <= 4) s -= 10;
  h.score = Math.max(0, Math.min(100, s));
  h.cls = h.score < 20 ? "potato" : h.score < 35 ? "low" : h.score < 60 ? "mid" : h.score < 85 ? "high" : "ultra";
  return h;
}

// ---- all of it together ---------------------------------------------------------------------------------------------------------------
export class PerformanceEngine {
  constructor(opts) {
    opts = opts || {};
    this.pacer = new FramePacer(opts);
    this.profiler = new FrameProfiler(opts);
    this.budgets = new FrameBudget(opts);
    this.governor = new QualityGovernor(opts);
    this.hw = null;
    this.onHitch = opts.onHitch || null;         // (hitch, perf) for each hitch while playing
    this.win = 0; this.frames = 0; this.started = now();
    this.f = null; this.inFrame = false;
  }
  get playing() { return this.budgets.playing; }
  set playing(v) { v = !!v; if (v !== this.budgets.playing) { this.budgets.playing = v; this.governor.hold(2); } }
  probe(renderer) { this.hw = probeHardware(renderer); return this.hw; }
  _heap() { const m = typeof performance !== "undefined" && performance.memory; return m ? m.usedJSHeapSize : 0; }
  frame(t) {
    const f = this.pacer.frame(t);
    this.f = f;
    if (!f.run) return f;
    // a hitch is a frame much longer than the ones around it: on a machine that runs at 25 fps every frame misses 60, and that is a low
    // frame rate (the governor's business), not stutter
    if (f.hitch && this.lastStats && this.lastStats.p50 > 0 && f.elapsed < this.lastStats.p50 * 1.8) f.hitch = f.severe = false;
    if (f.hitch && this.playing && this.frames > 30) {
      const h = this.profiler.hitch(f.elapsed, f.period, this._heap());
      if (h && this.onHitch) try { this.onHitch(h, this); } catch (e) { /* host */ }
    }
    this.profiler.begin(t);
    this.inFrame = true;
    return f;
  }
  // after the game's work (and its render call) for a frame that ran
  end(renderer) {
    if (!this.inFrame) return;
    this.inFrame = false;
    const f = this.f;
    let info = null;
    if (renderer && renderer.info) { const i = renderer.info; info = { programs: i.programs ? i.programs.length : null, textures: i.memory.textures, geometries: i.memory.geometries, heap: this._heap() }; }
    else info = { heap: this._heap() };
    this.profiler.end(info, f.elapsed, f.period);
    this.budgets.update(this.profiler.cpuMs, f.period, f.hitch);
    this.frames++;
    this.win += f.elapsed / 1000;
    if (this.win >= 0.5) {
      const st = this.profiler.stats(Math.max(20, Math.round(1 / (f.period / 1000))));   // about the last second
      if (this.playing) this.governor.step(st, f.period, this.win, this.budgets, this.pacer);
      this.win = 0;
      this.lastStats = st;
    }
    this.budgets._release();
  }
  budget(name, baseMs) { return this.budgets.get(name, baseMs); }
  idle(opts) { return this.budgets.idle(opts); }
  report() {
    const st = this.profiler.stats(240), p = this.pacer, g = this.governor;
    return { refresh: p.refresh, swap: p.swap, targetFps: +(1000 / p.period()).toFixed(1), p50: +st.p50.toFixed(1), p90: +st.p90.toFixed(1), p99: +st.p99.toFixed(1), cpu90: +st.cpu90.toFixed(1),
      bound: g.bound, scale: +g.scale.toFixed(2), levers: g.engaged.slice(), budgetFactor: +this.budgets.factor.toFixed(2), hitches: this.profiler.hitches.length,
      causes: Object.assign({}, this.profiler.causeCount), top: this.profiler.topSections(6), recent: this.profiler.hitches.slice(-8), governorLog: g.log.slice(-10), hardware: this.hw };
  }
}
