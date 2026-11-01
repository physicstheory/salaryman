// Weather: a state machine (clear, cloudy, drizzle, rain, storm, fog) that eases between presets, and the things a
// state drives: cloud cover, rain falling around the camera, splashes, the world getting wet and drying out again,
// puddles that grow the longer it rains, lightning with thunder a distance-delayed beat later, and the rain's hiss.
//
// The rain is entirely on the GPU: twelve thousand streaks in one instanced draw, positioned in the vertex shader in
// a box that wraps around the camera, so it costs the same standing still as at 200 km/h.

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
    this.drops = 12000;
    this._buildRain();
    this._buildSplashes();
    this.audio = null;
  }

  set(state, instant) {
    if (!PRESETS[state]) throw new Error("Shigoto: no weather state " + state);
    this.state = state;
    this.target = PRESETS[state];
    if (instant) { Object.assign(this.cur, this.target); if (this.target.rain > 0.3) { this.wetness = 1; this.puddles = 0.6 + 0.4 * this.target.rain; } }
    this.engine.events.emit("weather", state);
  }

  _buildRain() {
    const T = this.T;
    const quad = new T.InstancedBufferGeometry();
    quad.setAttribute("position", new T.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(this.drops * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    quad.setAttribute("aSeed", new T.InstancedBufferAttribute(seeds, 4));
    quad.instanceCount = this.drops;
    this.rainU = {
      uTime: { value: 0 }, uBox: { value: new T.Vector3(46, 26, 46) }, uCenter: { value: new T.Vector3() },
      uFall: { value: 9.5 }, uWind: { value: new T.Vector2() }, uLen: { value: 0.75 }, uWidth: { value: 0.012 },
      uAmount: { value: 0 }, uLight: { value: new T.Color(0.7, 0.75, 0.82) }, uFlash: { value: 0 }
    };
    const mat = new T.ShaderMaterial({
      uniforms: this.rainU, transparent: true, depthWrite: false, fog: false,
      vertexShader: `
        uniform float uTime; uniform vec3 uBox; uniform vec3 uCenter; uniform float uFall; uniform vec2 uWind;
        uniform float uLen; uniform float uWidth; uniform float uAmount;
        attribute vec4 aSeed; varying float vA; varying float vY; varying float vX;
        void main(){
          if (aSeed.w > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float sp = uFall * (0.85 + 0.3 * aSeed.w);
          vec3 vel = vec3(uWind.x, -sp, uWind.y);
          vec3 p = aSeed.xyz * uBox + vel * uTime;
          vec3 lo = uCenter - uBox * 0.5;
          p = lo + mod(p - lo, uBox);
          vec3 axis = normalize(vel);
          vec3 toCam = normalize(cameraPosition - p);
          vec3 side = normalize(cross(axis, toCam));
          float d = length(cameraPosition - p);
          float w = uWidth * (1.0 + d * 0.06);
          vec3 wp = p + side * position.x * w - axis * position.y * uLen * (0.7 + 0.6 * aSeed.y);
          vA = smoothstep(0.4, 2.0, d) * (1.0 - smoothstep(uBox.x * 0.35, uBox.x * 0.5, d));
          vY = position.y; vX = position.x;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uLight; uniform float uFlash; varying float vA; varying float vY; varying float vX;
        void main(){
          float a = vA * (1.0 - abs(vX) * 2.0) * smoothstep(0.0, 0.3, vY) * smoothstep(1.0, 0.6, vY) * 0.38;
          gl_FragColor = vec4(uLight + vec3(uFlash * 1.5), a);
        }`
    });
    this.rain = new T.Mesh(quad, mat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 10;
    this.rain.userData.shDry = true;
    this.engine.scene.add(this.rain);
  }

  _buildSplashes() {
    const T = this.T, N = 900;
    const g = new T.InstancedBufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    const s = new Float32Array(N * 4);
    for (let i = 0; i < s.length; i++) s[i] = Math.random();
    g.setAttribute("aSeed", new T.InstancedBufferAttribute(s, 4));
    g.instanceCount = N;
    this.splashU = { uTime: this.rainU.uTime, uCenter: { value: new T.Vector3() }, uAmount: this.rainU.uAmount, uLight: this.rainU.uLight, uR: { value: 16 } };
    const mat = new T.ShaderMaterial({
      uniforms: this.splashU, transparent: true, depthWrite: false, fog: false,
      vertexShader: `
        uniform float uTime; uniform vec3 uCenter; uniform float uAmount; uniform float uR;
        attribute vec4 aSeed; varying vec2 vUv; varying float vPh;
        void main(){
          if (aSeed.w > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float rate = 2.2 + aSeed.z * 1.5;
          float cyc = uTime * rate + aSeed.w * 13.0;
          float id = floor(cyc); vPh = fract(cyc);
          vec2 r = fract(vec2(sin(id * 12.9898 + aSeed.x * 78.2), sin(id * 39.346 + aSeed.y * 11.1)) * 43758.5453) * 2.0 - 1.0;
          vec3 c = vec3(uCenter.x + r.x * uR, uCenter.y + 0.03, uCenter.z + r.y * uR);
          float size = 0.05 + vPh * 0.16;
          vUv = position.xz;
          gl_Position = projectionMatrix * viewMatrix * vec4(c + position * size, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uLight; varying vec2 vUv; varying float vPh;
        void main(){
          float r = length(vUv);
          float ring = smoothstep(0.25, 0.0, abs(r - 0.75)) * (1.0 - vPh);
          gl_FragColor = vec4(uLight * 1.2, ring * 0.5);
        }`
    });
    this.splash = new T.Mesh(g, mat);
    this.splash.frustumCulled = false;
    this.splash.userData.shDry = true;
    this.engine.scene.add(this.splash);
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
    this._hiss = ctx.createGain(); this._hiss.gain.value = 0;
    src.connect(hp); hp.connect(lp); lp.connect(this._hiss); this._hiss.connect(destination || ctx.destination);
    src.start();
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
    // rain around the camera
    const cam = this.engine.camera.position;
    const R = this.rainU;
    R.uTime.value += dt;
    R.uCenter.value.copy(cam);
    R.uWind.value.copy(S.shWind.value);
    R.uAmount.value = c.rain;
    R.uFlash.value = env.flash;
    const day = Math.max(0.12, Math.min(1, env.sunDir.y * 2 + 0.3)) * (1 - c.cloud * 0.4);
    R.uLight.value.setRGB(0.55 * day + 0.08, 0.6 * day + 0.09, 0.68 * day + 0.11);
    this.rain.visible = c.rain > 0.01;
    this.splash.visible = c.rain > 0.05;
    const gy = this.groundAt ? this.groundAt(focus.x, focus.z) : (this.groundY != null ? this.groundY : 0);
    this.splashU.uCenter.value.set(focus.x, gy, focus.z);
    if (this._hiss) this._hiss.gain.value += (c.rain * 0.22 - this._hiss.gain.value) * Math.min(1, dt * 2);
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
