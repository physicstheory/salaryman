// The engine object: owns the systems, runs them in a fixed order, and steps physics at a fixed rate.
//
// The host (the game, or the sandbox) keeps its own renderer, scene and camera and calls engine.update(dt, focus)
// once a frame. The engine never renders on its own: it changes the scene (streams cells in and out, moves rain,
// sets wetness) and the host draws it. That is the split the game needs: content and rules in konto.html, the
// heavy machinery here.

import { Events } from "./Events.js";
import { Physics } from "../physics/Physics.js";
import { Environment } from "../env/Environment.js";
import { Weather } from "../env/Weather.js";
import { WaterSystem } from "../env/Water.js";
import { Surfaces } from "../render/Surfaces.js";
import { Streamer } from "../world/Streamer.js";

export const VERSION = "0.7.1";

export class Engine {
  constructor(opts) {
    const THREE = (this.THREE = opts.THREE || window.THREE);
    if (!THREE) throw new Error("Shigoto: three.js must be loaded before the engine");
    this.renderer = opts.renderer;
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.opts = Object.assign({ physics: true, weather: true, water: true, streaming: true, ownsSky: false }, opts.options || {});
    this.events = new Events();
    this.time = 0;
    this.frame = 0;
    this.focus = new THREE.Vector3();
    this.systems = [];
    this.stats = { physicsMs: 0, streamMs: 0, bodies: 0, cells: 0, colliders: 0 };
    this.perf = opts.perf || null;     // a PerformanceEngine, if the host runs one: systems ask it for their per-frame work budgets
  }

  async init() {
    const THREE = this.THREE;
    // Shared shader inputs (wetness, wind, rain, time): one object, so every patched material reads the same numbers.
    this.surfaces = new Surfaces(this);
    this.env = new Environment(this);
    if (this.opts.physics) {
      this.physics = new Physics(this);
      await this.physics.init();
    }
    if (this.opts.weather) this.weather = new Weather(this);
    if (this.opts.water) this.water = new WaterSystem(this);
    if (this.opts.streaming) this.streamer = new Streamer(this);
    this.systems = [this.env, this.weather, this.water, this.streamer, this.physics].filter(Boolean);
    this.events.emit("ready", this);
    return this;
  }

  // Load a level (a folder with level.json and baked cells) and start streaming it around the focus.
  loadLevel(url, placement) {
    if (!this.streamer) throw new Error("Shigoto: streaming is off");
    return this.streamer.load(url, placement);
  }

  update(dt, focus) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.frame++;
    if (focus) this.focus.copy(focus);
    else if (this.camera) this.focus.copy(this.camera.position);
    for (let i = 0; i < this.systems.length; i++) this.systems[i].update(dt, this.focus);
    this.surfaces.update(dt);
  }

  dispose() {
    for (const s of this.systems) if (s.dispose) s.dispose();
    this.systems = [];
  }
}

export async function createEngine(opts) {
  const e = new Engine(opts);
  await e.init();
  return e;
}
