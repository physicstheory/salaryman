import { RainEngine } from "../rain/RainEngine.js";

// Weather: a state machine (clear, cloudy, drizzle, rain, storm, fog) that eases between presets, and the things a
// state drives: cloud cover, rain falling around the camera, splashes, the world getting wet and drying out again,
// puddles that grow the longer it rains, lightning with thunder a distance-delayed beat later, and the rain's hiss.
//
// The rain itself is the rain engine (rain/RainEngine.js): drops with real sizes and fall speeds in three depth
// layers with motion blur, an occlusion map so it stops under cover, splashes, roof drips, sheets, mist, and drops
// lit by the scene's lamps. All on the GPU around the camera, so it costs the same standing still as at 200 km/h.

export const PRESETS = {
  clear:   { cloud: 0.10, rain: 0.00, fog: 0.0000, wind: 2.0, storm: 0 },
  cloudy:  { cloud: 0.62, rain: 0.00, fog: 0.0008, wind: 3.5, storm: 0 },
  drizzle: { cloud: 0.75, rain: 0.25, fog: 0.0020, wind: 3.0, storm: 0 },
  rain:    { cloud: 0.88, rain: 0.65, fog: 0.0035, wind: 5.0, storm: 0 },
  storm:   { cloud: 1.00, rain: 1.00, fog: 0.0050, wind: 9.0, storm: 1 },
  fog:     { cloud: 0.55, rain: 0.00, fog: 0.0160, wind: 0.8, storm: 0 }
};

export class Weather {
  constructor(engine) {
    this.engine = engine;
    const T = (this.T = engine.THREE);
    this.state = "clear";
    this.cur = Object.assign({}, PRESETS.clear);
    this.target = PRESETS.clear;
    this.blend = 0.08;       // how fast the sky changes (per second)
    this.wetness = 0;        // 0..1, how wet the world is
    this.puddles = 0.2;      // grows with sustained rain
    this.auto = false;       // wander between states on its own
    this._autoT = 240;
    this._strikeT = 6;
    this.groundAt = null;    // host may supply (x, z) => y for splash placement
    this.linearOut = null;   // host may supply () => true when it renders into a linear target
    this.indoors = false;    // host: true inside a building (no rain, no splashes, no occlusion passes)
    this.rainEngine = new RainEngine(engine, { quality: engine.opts.rainQuality || "high" });
    // older names the host already uses: the falling rain and the things on the ground
    this.rain = this.rainEngine.group;
    this.splash = this.rainEngine.ground;
    this.drops = this.rainEngine.drops;
    this.audio = null;
  }

  set(state, instant) {
    if (!PRESETS[state]) throw new Error("Shigoto: no weather state " + state);
    this.state = state;
    this.target = PRESETS[state];
    if (instant) { Object.assign(this.cur, this.target); if (this.target.rain > 0.3) { this.wetness = 1; this.puddles = 0.6 + 0.4 * this.target.rain; } }
    this.engine.events.emit("weather", state);
  }

  strike(dist) {
    const env = this.engine.env;
    env.flash = 1;
    const d = dist != null ? dist : 300 + Math.random() * 2500;
    this.engine.events.emit("lightning", { distance: d });
    if (this.audio) setTimeout(() => this._thunder(d), d / 343 * 1000);
  }

  // ---- audio: rain hiss from filtered noise, thunder as a long low rumble ------------------------------------
  enableAudio(ctx, destination) {
    this.audio = ctx;
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 7000;
    this._hissLP = lp;
    this._hiss = ctx.createGain(); this._hiss.gain.value = 0;
    src.connect(hp); hp.connect(lp); lp.connect(this._hiss); this._hiss.connect(destination || ctx.destination);
    // the low body of heavy rain (the roar of a whole street of splashes), and drumming on a roof overhead
    const src2 = ctx.createBufferSource(); src2.buffer = buf; src2.loop = true; src2.playbackRate.value = 0.37;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 420; bp.Q.value = 0.7;
    this._roar = ctx.createGain(); this._roar.gain.value = 0;
    src2.connect(bp); bp.connect(this._roar); this._roar.connect(destination || ctx.destination);
    src.start(); src2.start();
    this._dest = destination || ctx.destination;
  }
  _thunder(d) {
    const ctx = this.audio; if (!ctx) return;
    const src = ctx.createBufferSource(); src.buffer = this._noise; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = d < 800 ? 420 : 160;
    const g = ctx.createGain(); const t = ctx.currentTime, vol = Math.min(1, 900 / d) * 0.9;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.08); g.gain.exponentialRampToValueAtTime(vol * 0.4, t + 0.9);
    g.gain.linearRampToValueAtTime(vol * 0.55, t + 1.4); g.gain.exponentialRampToValueAtTime(0.001, t + 5.5);
    src.connect(lp); lp.connect(g); g.connect(this._dest); src.start(t); src.stop(t + 6);
  }

  dispose() { if (this.rainEngine) this.rainEngine.dispose(); }

  update(dt, focus) {
    const c = this.cur, t = this.target, k = Math.min(1, this.blend * dt * 3);
    for (const key in t) c[key] += (t[key] - c[key]) * k;
    const env = this.engine.env, S = this.engine.surfaces.uniforms;
    env.cloud = c.cloud;
    env.fogBoost = c.fog;
    env.wind.setLength(Math.max(0.1, c.wind));
    // wetting and drying: rain soaks quickly, the sun and wind dry slowly
    if (c.rain > 0.05) { this.wetness = Math.min(1, this.wetness + dt * c.rain * 0.09); this.puddles = Math.min(1, this.puddles + dt * c.rain * 0.004); }
    else { const dry = 0.004 + 0.01 * Math.max(0, env.sunDir.y) * (1 - c.cloud); this.wetness = Math.max(0, this.wetness - dt * dry); this.puddles = Math.max(0.2, this.puddles - dt * dry * 0.4); }
    S.shWet.value = this.wetness;
    S.shRain.value = c.rain;
    S.shPuddles.value = this.puddles;
    // the rain engine: drops, occlusion, splashes, drips, sheets, mist, lighting
    const RE = this.rainEngine;
    RE.indoors = this.indoors;
    if (this.linearOut) RE.linearOut = this.linearOut;
    if (this.groundAt) RE.groundAt = this.groundAt;
    else if (this.groundY != null) RE.groundAt = () => this.groundY;
    RE.update(dt, focus, c, this.wetness);
    this.drops = RE.drops;
    if (this._hiss) {
      const k = Math.min(1, dt * 2), roof = RE.sheltered, out = this.indoors ? 0.25 : 1;
      this._hiss.gain.value += (c.rain * (roof ? 0.15 : 0.22) * out - this._hiss.gain.value) * k;
      this._hissLP.frequency.value += ((roof || this.indoors ? 1600 : 7000) - this._hissLP.frequency.value) * k;
      this._roar.gain.value += (Math.max(0, c.rain - 0.3) * (roof ? 0.5 : 0.28) * out - this._roar.gain.value) * k;
    }
    // lightning in storms
    if (c.storm > 0.5) {
      this._strikeT -= dt;
      if (this._strikeT <= 0) { this._strikeT = 5 + Math.random() * 18; this.strike(); }
    }
    if (this.auto) {
      this._autoT -= dt;
      if (this._autoT <= 0) {
        this._autoT = 180 + Math.random() * 300;
        const next = { clear: ["cloudy", "clear"], cloudy: ["drizzle", "clear", "rain"], drizzle: ["rain", "cloudy"], rain: ["storm", "drizzle", "cloudy"], storm: ["rain"], fog: ["clear", "cloudy"] }[this.state];
        this.set(next[(Math.random() * next.length) | 0]);
      }
    }
  }
}
