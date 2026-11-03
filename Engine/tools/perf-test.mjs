// Tests for the Shigoto performance engine (Engine/src/perf/Performance.js), with a fake clock: node Engine/tools/perf-test.mjs
import { PerformanceEngine, FramePacer, FrameProfiler } from "../src/perf/Performance.js";

let fails = 0;
const ok = (c, msg) => { if (c) console.log("  ok  " + msg); else { fails++; console.log("  FAIL " + msg); } };
let clock = 0;
globalThis.performance = { now: () => clock, memory: { usedJSHeapSize: 100e6 } };

// drive the engine like the game's frameLoop: rAF every refresh (with jitter), work costs cpuMs, the GPU may add more
function run(perf, { hz, frames, cpu, gpu = 0, jitter = 0.3, hitchAt = -1, hitchMs = 0, playing = true, onRun, programsAt = -1, renderer }) {
  const vs = 1000 / hz; let t = clock, busyUntil = 0, ran = 0;
  const dts = [];
  for (let i = 0; i < frames; i++) {
    t += vs;
    let cb = t + (Math.random() - 0.5) * jitter;
    if (cb < busyUntil) { // the previous frame's work (and the GPU) still going: this refresh is missed
      const k = Math.ceil((busyUntil - t) / vs); t += k * vs; cb = t + (Math.random() - 0.5) * jitter;
    }
    clock = cb;
    const f = perf.frame(cb);
    if (!f.run) continue;
    ran++; dts.push(f.dt * 1000);
    const c = typeof cpu === "function" ? cpu(i) : cpu;
    clock = cb + c + (i === hitchAt ? hitchMs : 0);
    if (renderer && i === programsAt) renderer.info.programs.length += 1;
    perf.end(renderer || null);
    if (onRun) onRun(f, i);
    perf.playing = playing;
    busyUntil = clock + (typeof gpu === "function" ? gpu(i) : gpu);
  }
  return { ran, dts };
}
const fakeRenderer = () => ({ info: { programs: { length: 10 }, memory: { textures: 5, geometries: 5 } } });

console.log("frame pacing");
{
  const p = new PerformanceEngine({ targetFps: 60 }); p.playing = true;
  const r = run(p, { hz: 144, frames: 600, cpu: 6 });
  ok(p.pacer.refresh === 144, "detects a 144 Hz screen (" + p.pacer.refresh + ")");
  ok(p.pacer.swap === 2, "paces 144 Hz at every second refresh (swap " + p.pacer.swap + ")");
  const tail = r.dts.slice(-200), dev = Math.max(...tail.map(d => Math.abs(d - 2000 / 144)));
  ok(dev < 0.5, "steady 72 fps time step, worst deviation " + dev.toFixed(3) + " ms");
}
{
  const p = new PerformanceEngine({ targetFps: 60 }); p.playing = true;
  const r = run(p, { hz: 60, frames: 400, cpu: 5, jitter: 1.0 });
  ok(p.pacer.swap === 1, "60 Hz: every refresh");
  const tail = r.dts.slice(-200), exact = tail.filter(d => Math.abs(d - 1000 / 60) < 0.25).length;
  ok(exact / tail.length > 0.9, "time step snapped to the refresh despite 1 ms jitter (" + Math.round(exact / tail.length * 100) + "% exact)");
}
{
  const p = new PerformanceEngine({ targetFps: 60 }); p.playing = true;
  const p0 = clock; let sim = 0;
  const r = run(p, { hz: 60, frames: 300, cpu: 5, hitchAt: 150, hitchMs: 120, onRun: f => { sim += f.dt * 1000; } });
  const maxDt = Math.max(...r.dts);
  ok(maxDt <= 2 * 1000 / 60 + 0.01, "a 120 ms hitch shows as at most two frames of motion (" + maxDt.toFixed(1) + " ms)");
  ok(Math.abs((clock - p0) - sim) < 25, "and the time is paid back afterwards (sim vs wall " + Math.round(sim) + " / " + Math.round(clock - p0) + " ms)");
}
{
  const p = new PerformanceEngine({ targetFps: 60, cap: 0 }); p.playing = true;
  run(p, { hz: 144, frames: 300, cpu: 3 });
  ok(p.pacer.swap === 1, "cap 0: no pacing on 144 Hz");
}

{
  // a game slower than the screen from the first frame: the callbacks come every second refresh, which must not read as a 30 Hz screen
  const p = new PerformanceEngine({ targetFps: 60 }); p.playing = true;
  run(p, { hz: 60, frames: 200, cpu: 5, gpu: 20 });
  ok(p.pacer.refresh === 60, "slow from the start: still a 60 Hz screen, not 30 (" + p.pacer.refresh + ")");
  const q = new PerformanceEngine({ targetFps: 60, refreshHz: 144 }); q.playing = true;
  run(q, { hz: 144, frames: 200, cpu: 4, gpu: 12 });
  ok(q.pacer.refresh === 144 && q.pacer.swap === 2, "with the desktop app's figure: 144 Hz, every second refresh");
}

console.log("hitch causes");
{
  const p = new PerformanceEngine({ targetFps: 60 }); const R = fakeRenderer(); p.playing = true;
  const seen = []; p.onHitch = h => seen.push(h);
  run(p, { hz: 60, frames: 200, cpu: 4, hitchAt: 120, hitchMs: 90, programsAt: 120, renderer: R });
  ok(seen.length >= 1 && seen[0].cause === "shader compile", "a long frame that compiled a shader is blamed on it (" + (seen[0] && seen[0].cause) + ")");
}
{
  const p = new PerformanceEngine({ targetFps: 60 }); p.playing = true;
  const seen = []; p.onHitch = h => seen.push(h);
  run(p, { hz: 60, frames: 200, cpu: 4, gpu: i => (i === 120 ? 80 : 0) });
  ok(seen.length >= 1 && seen[0].cause === "graphics card / driver", "a long gap with little game work is the graphics card / driver (" + (seen[0] && seen[0].cause) + ")");
}
{
  const pr = new FrameProfiler();
  const o = { outer() { clock += 2; this.inner(); clock += 1; }, inner() { clock += 5; } };
  pr.wrap(o, "outer"); pr.wrap(o, "inner");
  pr.begin(clock); o.outer(); pr.end(null, 16, 16.7);
  ok(Math.abs(pr.sections.get("outer").ms - 3) < 1e-9 && Math.abs(pr.sections.get("inner").ms - 5) < 1e-9, "self time: outer 3 ms, inner 5 ms");
  ok(pr.last.top === "inner", "slowest part named");
}

console.log("governor");
{
  const p = new PerformanceEngine({ targetFps: 60, softFloor: 0.85, floor: 0.67 }); p.playing = true;
  run(p, { hz: 60, frames: 120, cpu: 3, playing: false });   // the loading screen's cheap frames measure the screen
  let scale = 1; p.governor.setScale = m => { scale = m; };
  const on = []; p.governor.lever({ name: "shadows", kind: "gpu", apply: v => on.push(["shadows", v]) }).lever({ name: "ao", kind: "gpu", apply: v => on.push(["ao", v]) });
  // GPU-bound: the GPU takes 26 ms a frame at full resolution, less as the scale drops
  run(p, { hz: 60, frames: 1500, cpu: 5, gpu: () => 21 * scale * scale * (p.governor.engaged.length ? 0.8 : 1) });
  ok(scale < 0.9, "graphics-card bound: resolution lowered (x" + scale.toFixed(2) + ")");
  ok(p.governor.engaged.length >= 1, "and levers engaged: " + p.governor.engaged.join(", "));
  // lighter scene: everything comes back
  run(p, { hz: 60, frames: 6000, cpu: 4, gpu: 2 });
  ok(scale > 0.97 && p.governor.engaged.length === 0, "room again: all given back (x" + scale.toFixed(2) + ", levers " + p.governor.engaged.length + ")");
}
{
  const p = new PerformanceEngine({ targetFps: 60 }); p.playing = true;
  let scale = 1; p.governor.setScale = m => { scale = m; };
  run(p, { hz: 60, frames: 120, cpu: 3, playing: false });
  let traffic = false; p.governor.lever({ name: "traffic", kind: "cpu", apply: v => { traffic = v; } });
  run(p, { hz: 60, frames: 1200, cpu: 22 });
  ok(scale === 1, "processor bound: resolution left alone");
  ok(p.budgets.cpuBound < 1 && traffic, "budgets squeezed (x" + p.budgets.cpuBound.toFixed(2) + ") and cpu lever on");
}

console.log("budgets and idle");
{
  const p = new PerformanceEngine({ targetFps: 60 }); p.playing = true;
  run(p, { hz: 60, frames: 120, cpu: 3 });
  const roomy = p.budget("detail", 5);
  run(p, { hz: 60, frames: 3, cpu: 3, hitchAt: 1, hitchMs: 80 });
  const after = p.budget("detail", 5);
  ok(roomy > 5 && after < 2, "budget grows with room (" + roomy.toFixed(1) + " ms) and shrinks after a hitch (" + after.toFixed(1) + " ms)");
  let fired = false; p.idle({ headroom: 0.3, quiet: 30 }).then(() => { fired = true; });
  run(p, { hz: 60, frames: 10, cpu: 3 });
  await Promise.resolve();
  const early = fired;
  run(p, { hz: 60, frames: 60, cpu: 3 });
  await new Promise(r => setTimeout(r, 0));
  ok(!early && fired, "idle() waits for quiet frames after a hitch, then resolves");
}

console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);
