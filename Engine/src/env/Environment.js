// Environment: the clock, the sun, the wind, and (when the engine owns them) the sky, the lights, the fog and the
// reflection probe. Weather pushes on this (cloud cover darkens the sun, rain thickens the fog); the game can either
// let the engine drive its lighting (ownsSky) or keep its own sky and just read env.wind, env.sunDir and env.hour.

export class Environment {
  constructor(engine) {
    this.engine = engine;
    const T = (this.T = engine.THREE);
    this.hour = 17.2;          // 0..24
    this.daySpeed = 0;         // game hours per real second (0 = frozen)
    this.cloud = 0.15;         // 0 clear .. 1 overcast (weather sets it)
    this.fogBoost = 0;         // weather adds murk
    this.wind = new T.Vector2(2.5, 0.8); // m/s, world XZ
    this.gust = 0;
    this.sunDir = new T.Vector3(0.4, 0.5, 0.3).normalize();
    this.flash = 0;            // lightning, 0..1
    this.t = 0;
    if (engine.opts.ownsSky) this._buildSky();
  }

  _buildSky() {
    const T = this.T, scene = this.engine.scene;
    this.sun = new T.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new T.HemisphereLight(0xbdd6ff, 0x3a3a38, 0.6);
    scene.add(this.hemi);
    scene.fog = new T.FogExp2(0xb8c6d6, 0.0025);
    this.skyU = {
      sunDir: { value: this.sunDir }, cloud: { value: 0 }, time: { value: 0 }, flash: { value: 0 },
      zenith: { value: new T.Color() }, horizon: { value: new T.Color() }, sunCol: { value: new T.Color() }
    };
    const mat = new T.ShaderMaterial({
      uniforms: this.skyU, side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 sunDir; uniform float cloud; uniform float time; uniform float flash;
        uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunCol; varying vec3 vDir;
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
        float fbm(vec2 p){ float a=0.5, s=0.; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          float up = max(d.y, 0.0);
          vec3 col = mix(horizon, zenith, pow(up, 0.55));
          float sd = max(dot(d, sunDir), 0.0);
          col += sunCol * (pow(sd, 900.0) * 30.0 + pow(sd, 12.0) * 0.35) * (1.0 - cloud * 0.9);
          // clouds: a deck projected onto a plane, thicker with cover
          if (d.y > 0.0) {
            vec2 uv = d.xz / (d.y + 0.08) * 1.6 + vec2(time * 0.004, time * 0.0015);
            float c = fbm(uv);
            float cov = smoothstep(0.62 - cloud * 0.5, 0.95 - cloud * 0.35, c);
            vec3 cc = mix(vec3(1.0), vec3(0.42, 0.45, 0.5), cloud) * (0.55 + 0.45 * max(sunDir.y, 0.15));
            cc += sunCol * pow(sd, 6.0) * 0.4 * (1.0 - cloud);
            col = mix(col, cc, cov * smoothstep(0.0, 0.15, d.y));
          }
          col = mix(col, horizon * 0.9, (1.0 - smoothstep(-0.05, 0.12, d.y)) * 0.8);
          col += vec3(0.8, 0.85, 1.0) * flash * 2.0;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          gl_FragColor = linearToOutputTexel(gl_FragColor);
        }`
    });
    this.sky = new T.Mesh(new T.SphereGeometry(4000, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    this.sky.userData.shDry = true;
    scene.add(this.sky);
    // Reflection probe: the sky rendered into a prefiltered environment map, refreshed as the light changes.
    this.pmrem = new T.PMREMGenerator(this.engine.renderer);
    this.probeScene = new T.Scene();
    // the probe's copy of the sky: ordinary depth (the main sky pins itself to the far plane, which a cube camera clips)
    const pmat = mat.clone();
    pmat.uniforms = this.skyU;
    pmat.vertexShader = "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
    this.probeSky = new T.Mesh(new T.SphereGeometry(50, 32, 16), pmat);
    this.probeScene.add(this.probeSky);
    this._probeAge = 99;
  }

  setHour(h) { this.hour = ((h % 24) + 24) % 24; this._probeAge = 99; }

  update(dt, focus) {
    const T = this.T;
    this.t += dt;
    this.hour = (this.hour + this.daySpeed * dt) % 24;
    // sun: rises in the east (+X), sets in the west, a little to the south
    const a = (this.hour - 6) / 12 * Math.PI;
    this.sunDir.set(Math.cos(a) * 0.9, Math.sin(a), -0.35).normalize();
    // wind: a base direction that wanders, with gusts
    this.gust = 0.5 + 0.5 * Math.sin(this.t * 0.37) * Math.sin(this.t * 0.11 + 1.3);
    const s = this.engine.surfaces.uniforms;
    s.shWind.value.copy(this.wind).multiplyScalar(0.6 + this.gust * 0.8);
    this.flash = Math.max(0, this.flash - dt * 3.5);
    s.shLightning.value = this.flash;
    s.shNight.value = 1 - smooth(-0.12, 0.12, this.sunDir.y);
    if (this.sky) this._lightSky(dt, focus);
  }

  _lightSky(dt, focus) {
    const T = this.T, sd = this.sunDir, day = smooth(-0.08, 0.25, sd.y), dusk = Math.exp(-Math.pow(sd.y / 0.18, 2));
    const cl = this.cloud;
    const zen = L(0x2f6fd6).lerp(L(0x0a1426), 1 - day).lerp(L(0x58606c).multiplyScalar(0.3 + 0.7 * day), cl * 0.85);
    const hor = L(0xc8dcf0).lerp(L(0xf09a5a), dusk * (1 - cl)).lerp(L(0x18202e), 1 - Math.max(day, dusk * 0.6)).lerp(L(0x8a9098).multiplyScalar(0.25 + 0.75 * day), cl * 0.8);
    const sunC = L(0xfff2dc).lerp(L(0xff8a40), dusk);
    this.skyU.zenith.value.copy(zen); this.skyU.horizon.value.copy(hor); this.skyU.sunCol.value.copy(sunC);
    this.skyU.cloud.value = cl; this.skyU.time.value = this.t; this.skyU.flash.value = this.flash;
    const f = focus || this.engine.camera.position;
    this.sky.position.copy(this.engine.camera.position);
    // sun light follows the focus so the shadow map covers what you can see
    const lightDir = sd.y > -0.05 ? sd : new T.Vector3(-sd.x, 0.4, -sd.z).normalize(); // the moon
    this.sun.position.set(f.x + lightDir.x * 200, f.y + lightDir.y * 200, f.z + lightDir.z * 200);
    this.sun.target.position.copy(f);
    this.sun.color.copy(sd.y > -0.05 ? sunC : L(0x8fa6d8));
    this.sun.intensity = (sd.y > -0.05 ? 2.6 * day + 0.6 * dusk : 0.25) * (1 - cl * 0.82) + this.flash * 6;
    this.hemi.color.copy(zen).lerp(L(0xffffff), 0.35);
    this.hemi.groundColor.set(0x2a2826).lerp(hor, 0.25);
    this.hemi.intensity = 0.12 + 0.5 * day * (1 - cl * 0.3) + this.flash * 2;
    const fog = this.engine.scene.fog;
    fog.color.copy(hor).lerp(zen, 0.15);
    fog.density = 0.0018 + cl * 0.0025 + this.fogBoost;
    // refresh the reflection probe every couple of seconds (or at once after a jump in time)
    this._probeAge += dt;
    if (this._probeAge > 2.0) {
      this._probeAge = 0;
      if (this.envRT) this.envRT.dispose();
      const flash = this.skyU.flash.value; this.skyU.flash.value = 0;
      this.envRT = this.pmrem.fromScene(this.probeScene, 0.02);
      this.skyU.flash.value = flash;
      this.engine.scene.environment = this.envRT.texture;
    }
  }
}

function L(hex) { return new (window.THREE.Color)(hex).convertSRGBToLinear(); }
function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
