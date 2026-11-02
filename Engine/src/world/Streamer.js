// World streaming: a level is a grid of cells on disk; the cells near the focus are fetched, built and given colliders,
// and the ones that fall far behind are taken apart again. Fetching is asynchronous and building is rationed per
// frame, so the frame rate does not dip as you travel. Also runs the light pool: dozens of street lamps and signs in
// range, but only the nearest few get a real light at any moment, reassigned as you move.

import { CellBuilder } from "./CellBuilder.js";
import { Materials } from "../render/Materials.js";

export class Streamer {
  constructor(engine) {
    this.engine = engine;
    this.T = engine.THREE;
    this.levels = [];
    this.materials = new Materials(engine);
    this.builder = new CellBuilder(engine, this.materials);
    this.root = new this.T.Group();
    this.root.name = "shigoto world";
    engine.scene.add(this.root);
    this.maxInFlight = 3;
    this.buildBudgetMs = 6;
    this.lightCount = 10;
    this._pool = [];
    this._poolT = 0;
    // resident: cells are never taken apart once built (the persistence engine sets this after preloadAll). Far cells
    // are hidden instead, and shown again on the way back.
    this.resident = false;
  }

  // Fetch and build every cell of every loaded level now (behind a loading screen), then keep them all.
  // ctx: a persistence stage context ({ slice, progress }), or nothing.
  async preloadAll(ctx) {
    this.resident = true;
    const jobs = [];
    for (const l of this.levels) for (const k of l.have) if (!l.cells.has(k)) jobs.push([l, k]);
    let done = 0, failed = 0;
    const one = async ([l, k]) => {
      l.cells.set(k, { state: "loading" });
      try {
        const r = await fetch(l.base + "cells/" + k + ".json");
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        const out = this.builder.build(data, l.base + k, this.root, l.offset);
        l.cells.set(k, { state: "built", out });
        this.engine.events.emit("cell", { key: k, level: l.def.name, group: out.group });
      } catch (e) { failed++; console.warn("[Shigoto] cell " + k + " failed", e); l.cells.delete(k); l.have.delete(k); }
      done++;
      if (ctx) { ctx.progress(done / jobs.length); await ctx.slice(); }
    };
    // a few fetches at once, building as each lands
    for (let i = 0; i < jobs.length; i += 4) await Promise.all(jobs.slice(i, i + 4).map(one));
    this.engine.stats.cells = jobs.length - failed;
    return { cells: jobs.length - failed, failed };
  }

  // url: folder holding level.json. placement: { x, y, z } offset to put the level into a host world.
  async load(url, placement) {
    const base = url.replace(/\/?$/, "/");
    const res = await fetch(base + "level.json");
    if (!res.ok) throw new Error("Shigoto: could not load " + base + "level.json (" + res.status + ")");
    const def = await res.json();
    if (!/^shigoto-level\/1/.test(def.format || "")) throw new Error("Shigoto: " + base + " is not a shigoto-level/1 level");
    const lvl = { base, def, offset: placement || { x: 0, y: 0, z: 0 }, cells: new Map(), have: new Set(def.cells), queue: [], inFlight: 0 };
    this.levels.push(lvl);
    if (def.environment && this.engine.env) {
      if (def.environment.hour != null) this.engine.env.setHour(def.environment.hour);
      if (def.environment.weather && this.engine.weather) this.engine.weather.set(def.environment.weather, true);
    }
    this.engine.events.emit("level", def);
    return def;
  }

  unloadAll() {
    for (const l of this.levels) for (const k of [...l.cells.keys()]) this._drop(l, k);
    this.levels = [];
  }

  update(dt, focus) {
    const t0 = performance.now();
    for (const l of this.levels) this._level(l, focus, t0);
    this._lights(dt, focus);
    const s = this.engine.stats;
    s.cells = this.levels.reduce((n, l) => n + [...l.cells.values()].filter(c => c.state === "built").length, 0);
    s.streamMs = performance.now() - t0;
  }

  _level(l, focus, t0) {
    const d = l.def, cs = d.cellSize, R = d.loadRadius || cs * 3, U = d.unloadRadius || R + cs * 1.5;
    const fx = focus.x - l.offset.x, fz = focus.z - l.offset.z;
    const i0 = Math.floor((fx - R) / cs), i1 = Math.floor((fx + R) / cs), j0 = Math.floor((fz - R) / cs), j1 = Math.floor((fz + R) / cs);
    const want = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = i + "_" + j;
      if (!l.have.has(k) || l.cells.has(k)) continue;
      const dist = Math.hypot((i + 0.5) * cs - fx, (j + 0.5) * cs - fz);
      if (dist <= R) want.push([dist, k]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, k] of want) {
      if (l.inFlight >= this.maxInFlight) break;
      l.cells.set(k, { state: "loading" });
      l.inFlight++;
      fetch(l.base + "cells/" + k + ".json").then(r => r.ok ? r.json() : Promise.reject(new Error(r.status))).then(data => {
        l.inFlight--;
        const c = l.cells.get(k);
        if (!c) return; // dropped while in flight
        c.state = "ready"; c.data = data;
      }).catch(err => { l.inFlight--; console.warn("[Shigoto] cell " + k + " failed", err); l.cells.delete(k); l.have.delete(k); });
    }
    // build ready cells, nearest first, within the frame budget
    const ready = [...l.cells.entries()].filter(([, c]) => c.state === "ready");
    ready.sort((a, b) => cellDist(a[0], cs, fx, fz) - cellDist(b[0], cs, fx, fz));
    for (const [k, c] of ready) {
      if (performance.now() - t0 > this.buildBudgetMs && this.engine.frame > 2) break;
      try {
        const out = this.builder.build(c.data, l.base + k, this.root, l.offset);
        c.state = "built"; c.out = out; c.data = null;
        this.engine.events.emit("cell", { key: k, level: l.def.name, group: out.group });
      } catch (e) { console.error("[Shigoto] building cell " + k + " failed", e); c.state = "failed"; }
    }
    // drop far cells (resident: hide them, keep them built)
    for (const [k, c] of l.cells) {
      if (c.state === "loading") continue;
      const far = cellDist(k, cs, fx, fz) > U;
      if (this.resident) { if (c.out && c.out.group.visible === far) c.out.group.visible = !far; }
      else if (far) this._drop(l, k);
    }
  }

  _drop(l, k) {
    const c = l.cells.get(k);
    l.cells.delete(k);
    if (!c || !c.out) return;
    const key = l.base + k;
    if (this.engine.physics) this.engine.physics.removeOwner(key);
    if (this.engine.water) this.engine.water.remove(key);
    c.out.group.parent && c.out.group.parent.remove(c.out.group);
    c.out.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.userData.signs) { o.material.map.dispose(); o.material.dispose(); } } });
    this.engine.events.emit("cellOut", { key: k });
  }

  // The light pool: the nearest N light sources in range each get one of N real point lights.
  _lights(dt, focus) {
    const T = this.T, night = this.engine.surfaces.uniforms.shNight.value;
    if (!this._pool.length) {
      for (let i = 0; i < this.lightCount; i++) {
        const L = new T.PointLight(0xffffff, 0, 15, 2);
        L.visible = false;
        this.engine.scene.add(L);
        this._pool.push(L);
      }
    }
    this._poolT -= dt;
    if (this._poolT > 0) return;
    this._poolT = 0.25;
    const all = [];
    for (const l of this.levels) for (const c of l.cells.values()) if (c.out) for (const s of c.out.lights) {
      const d = (s.pos[0] - focus.x) ** 2 + (s.pos[2] - focus.z) ** 2;
      if (d < 90 * 90) all.push([d, s]);
    }
    all.sort((a, b) => a[0] - b[0]);
    const k = night > 0.15 ? 1 : 0;
    for (let i = 0; i < this._pool.length; i++) {
      const L = this._pool[i], e = all[i];
      if (!e || !k) { L.visible = false; continue; }
      const s = e[1];
      L.visible = true;
      L.position.set(s.pos[0], s.pos[1], s.pos[2]);
      L.color.set(s.colour);
      L.distance = s.range;
      L.intensity = s.intensity * night * 2.0;
    }
  }
}

function cellDist(k, cs, fx, fz) { const [i, j] = k.split("_").map(Number); return Math.hypot((i + 0.5) * cs - fx, (j + 0.5) * cs - fz); }
