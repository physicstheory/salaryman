// Shigoto rain engine.
//
// Everything rain does that you can see, run as one system the weather drives with a single number (how hard it is
// raining) plus the wind:
//   - falling rain in three depth layers with real drop sizes, terminal velocities and camera motion blur (Streaks)
//   - an occlusion height map of what is overhead, so rain stops under awnings, arcades, bridges and roofs, and
//     the ground under them stays dry (Occlusion, read by the wet surface patch too)
//   - crown splashes on whatever is uppermost, and drips falling off roof and awning edges (Splashes)
//   - rain sheets sweeping through in gusts, and ground mist in heavy rain (Atmosphere)
//   - light: every drop is lit by the scene's own sky, sun, street lamps, neon and car headlights, glowing when a
//     lamp is behind it, and by lightning
//   - gusty wind that bends the rain, drifts drizzle and rolls curtains of heavier rain across the street
// It reads the host's lights rather than owning any, renders nothing on its own except the occlusion map, and
// scales from "low" to "ultra" with the host's graphics tier.

import { RainOcclusion } from "./Occlusion.js";
import { makeStreakLayer } from "./Streaks.js";
import { makeSplashes, makeDrips } from "./Splashes.js";
import { makeSheets, makeMist } from "./Atmosphere.js";
import { MAX_RAIN_LIGHTS } from "./RainShaders.js";

export const RAIN_QUALITY = {
  low:    { near: 1000, mid: 4500,  far: 0,    splash: 280,  drips: 120, mist: 12, rings: 1, occRes: 256, occEvery: 2.0 },
  medium: { near: 1800, mid: 8000,  far: 4000, splash: 650,  drips: 260, mist: 24, rings: 2, occRes: 384, occEvery: 1.4 },
  high:   { near: 2800, mid: 14000, far: 8000, splash: 1100, drips: 420, mist: 36, rings: 3, occRes: 512, occEvery: 1.0 },
  ultra:  { near: 4000, mid: 20000, far: 12000, splash: 1800, drips: 640, mist: 48, rings: 3, occRes: 768, occEvery: 0.7 }
};

export class RainEngine {
  constructor(engine, opts) {
    opts = opts || {};
    this.engine = engine;
    const T = (this.T = engine.THREE);
    const S = engine.surfaces.uniforms;
    this.quality = RAIN_QUALITY[opts.quality] ? opts.quality : "high";
    this.indoors = false;
    this.linearOut = null;     // host: () => true when it draws into a linear HDR target
    this.groundAt = null;      // host: (x, z) => y, used where the occlusion map has nothing
    this.shutter = 1 / 40;     // the "camera" exposure the streaks are smeared over
    this.sheltered = false;    // is there a roof over the camera (from the last occlusion pass)
    this.lampScale = 0.55;
    this._camPrev = new T.Vector3();
    this._camVel = new T.Vector3();
    this._camInit = false;
    this._lights = [];
    this._lightScanAt = -1e9;
    this._pickAt = 0;
    this._gustT = Math.random() * 100;
    this._v3 = new T.Vector3();
    this._px = null;
    const LP = [], LC = [], LD = [];
    for (let i = 0; i < MAX_RAIN_LIGHTS; i++) { LP.push(new T.Vector4(0, -1e4, 0, 1)); LC.push(new T.Vector3()); LD.push(new T.Vector4(0, -1, 0, -2)); }
    // one uniform object shared by every rain material, so a frame's update is a handful of writes
    this.U = {
      rOcc: S.rOcc, rOccInfo: S.rOccInfo, rOccOn: S.rOccOn,
      rAmb: { value: new T.Vector3(0.2, 0.22, 0.25) }, rSun: { value: new T.Vector3() }, rSunDir: { value: new T.Vector3(0, 1, 0) },
      rFlash: { value: 0 }, rLP: { value: LP }, rLC: { value: LC }, rLD: { value: LD }, rLN: { value: 0 }, rDisplay: { value: 1 },
      uTime: { value: 0 }, uCenter: { value: new T.Vector3() }, uWind: { value: new T.Vector2() }, uWindOff: { value: new T.Vector2() },
      uCamVel: { value: new T.Vector3() }, uShutter: { value: this.shutter }, uAmount: { value: 0 }, uLambda: { value: 3 },
      uPix: { value: 0.001 }, uIntensity: { value: 1 }, uGround: { value: 0 }, uSplashK: { value: 1 }, uDrip: { value: 0 },
      uSheets: { value: 0 }, uFallV: { value: 7 }, uMist: { value: 0 }
    };
    this.group = new T.Group(); this.group.name = "shigoto-rain"; this.group.userData.shDry = true;
    this.ground = new T.Group(); this.ground.name = "shigoto-rain-ground"; this.ground.userData.shDry = true;
    engine.scene.add(this.group);
    engine.scene.add(this.ground);
    this._build();
  }

  _build() {
    const T = this.T, Q = RAIN_QUALITY[this.quality];
    this._disposeMeshes();
    this.layers = {};
    for (const name of ["far", "mid", "near"]) {
      if (!Q[name]) continue;
      const m = makeStreakLayer(T, name, Q[name], this.U);
      this.layers[name] = m;
      this.group.add(m);
    }
    this.sheets = makeSheets(T, Q.rings, this.U); this.group.add(this.sheets);
    this.mist = makeMist(T, Q.mist, this.U); this.group.add(this.mist);
    this.splashes = makeSplashes(T, Q.splash, this.U); this.ground.add(this.splashes);
    this.drips = makeDrips(T, Q.drips, this.U); this.ground.add(this.drips);
    if (this.occ) this.occ.dispose();
    this.occ = new RainOcclusion(this.engine, this.U, { size: 80, res: Q.occRes, every: Q.occEvery });
    this.drips.material.uniforms.uTexel.value = this.occ.size / this.occ.res;
    this.drops = (Q.near || 0) + (Q.mid || 0) + (Q.far || 0);
  }

  _disposeMeshes() {
    for (const g of [this.group, this.ground]) {
      for (let i = g.children.length - 1; i >= 0; i--) {
        const m = g.children[i];
        g.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
      }
    }
  }

  setQuality(q) {
    if (q === "potato") q = "low";
    if (!RAIN_QUALITY[q] || q === this.quality) return;
    this.quality = q;
    this._build();
  }

  // The car you are driving, a held umbrella, anything moving that should not count as a roof.
  ignore(obj) { if (this.occ && obj) this.occ.excluded.add(obj); }

  // Behind the loading screen: draw the first occlusion map and compile every rain shader, so the first shower in
  // play costs nothing.
  prepare(center) {
    const e = this.engine, T = this.T, r = e.renderer;
    const c = center || e.camera.position;
    let occ = false, compiled = false, error = null;
    try { occ = this.occ.render(c, true); this._readShelter(); } catch (err) { error = err; }
    try {
      const tmp = new T.Scene();
      const vis = [this.group.visible, this.ground.visible];
      tmp.add(this.group); tmp.add(this.ground);
      this.group.visible = this.ground.visible = true;
      this.group.children.concat(this.ground.children).forEach(m => { m.userData._v = m.visible; m.visible = true; });
      r.compile(tmp, e.camera);
      this.group.children.concat(this.ground.children).forEach(m => { m.visible = m.userData._v; });
      this.group.visible = vis[0]; this.ground.visible = vis[1];
      e.scene.add(this.group); e.scene.add(this.ground);
      compiled = true;
    } catch (err) { error = error || err; e.scene.add(this.group); e.scene.add(this.ground); }
    return { quality: this.quality, drops: this.drops, occlusion: occ, occlusionSupported: this.occ.supported, compiled, error: error ? String(error.message || error) : null };
  }

  report() {
    return {
      quality: this.quality, drops: this.drops, occlusion: this.occ.supported, passes: this.occ.passes,
      occlusionMs: Math.round(this.occ.lastMs * 10) / 10, lights: this.U.rLN.value, sheltered: this.sheltered,
      wind: this.U.uWind.value.length().toFixed(1) + " m/s"
    };
  }

  // ---- the scene's lights: lamps, neon, headlights; the sun and sky for the ambient a drop refracts -------------
  _scanLights(scene) {
    const lamps = [];
    let sun = null, hemi = null, amb = null;
    scene.traverse(o => {
      if (!o.isLight) return;
      if (o.isPointLight || o.isSpotLight) lamps.push(o);
      else if (o.isDirectionalLight) { if (!sun || o.intensity > sun.intensity) sun = o; }
      else if (o.isHemisphereLight) { if (!hemi || o.intensity > hemi.intensity) hemi = o; }
      else if (o.isAmbientLight) { if (!amb || o.intensity > amb.intensity) amb = o; }
    });
    this._lights = lamps; this._sun = sun; this._hemi = hemi; this._amb = amb;
  }

  static _shown(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }

  _pickLights(cam, linear) {
    const U = this.U, cand = [];
    for (const l of this._lights) {
      if (!(l.intensity > 0) || !RainEngine._shown(l)) continue;
      const e = l.matrixWorld.elements;
      const dx = e[12] - cam.x, dy = e[13] - cam.y, dz = e[14] - cam.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const reach = l.distance > 0 ? Math.min(l.distance, 45) : 28;
      if (d - reach > 34) continue;
      cand.push([d - reach * 0.4, l, e, reach]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    const n = Math.min(MAX_RAIN_LIGHTS, cand.length);
    const v = this._v3;
    for (let i = 0; i < n; i++) {
      const [, l, e, reach] = cand[i];
      U.rLP.value[i].set(e[12], e[13], e[14], reach);
      const k = Math.min(l.intensity, 8) * this.lampScale;
      U.rLC.value[i].set(l.color.r * k, l.color.g * k, l.color.b * k);
      if (l.isSpotLight && l.target) {
        l.target.updateMatrixWorld();
        const t = l.target.matrixWorld.elements;
        v.set(t[12] - e[12], t[13] - e[13], t[14] - e[14]).normalize();
        U.rLD.value[i].set(v.x, v.y, v.z, Math.cos(Math.min(l.angle * 1.15, Math.PI / 2)));
      } else U.rLD.value[i].set(0, -1, 0, -2);
    }
    U.rLN.value = n;
  }

  _skyLight(env, cloud, linear) {
    const U = this.U, a = U.rAmb.value, s = U.rSun.value;
    a.set(0, 0, 0); s.set(0, 0, 0);
    if (this._hemi) { const h = this._hemi, k = h.intensity; a.x += (h.color.r * 0.34 + h.groundColor.r * 0.1) * k; a.y += (h.color.g * 0.34 + h.groundColor.g * 0.1) * k; a.z += (h.color.b * 0.34 + h.groundColor.b * 0.1) * k; }
    if (this._amb) { const m = this._amb, k = m.intensity * 0.3; a.x += m.color.r * k; a.y += m.color.g * k; a.z += m.color.b * k; }
    if (this._sun) {
      const d = this._sun, k = d.intensity;
      a.x += d.color.r * k * 0.06; a.y += d.color.g * k * 0.06; a.z += d.color.b * k * 0.06;
      const sk = k * 0.5 * (1 - cloud * 0.85);
      s.set(d.color.r * sk, d.color.g * sk, d.color.b * sk);
      const p = d.matrixWorld.elements, t = d.target ? d.target.matrixWorld.elements : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      U.rSunDir.value.set(p[12] - t[12], p[13] - t[13], p[14] - t[14]).normalize();
    }
    this._day = Math.max(0, Math.min(1, ((this._sun ? U.rSunDir.value.y : env.sunDir.y) + 0.05) * 4));
    if (!this._hemi && !this._amb && !this._sun) {
      // no lights to read (a bare host): light the rain from the engine's clock
      const day = Math.max(0.08, Math.min(1, env.sunDir.y * 2 + 0.3)) * (1 - cloud * 0.4);
      a.set(0.16 * day + 0.01, 0.18 * day + 0.012, 0.21 * day + 0.016);
      U.rSunDir.value.copy(env.sunDir);
    }
    // the city never goes fully dark: wet air glows with it
    a.x = Math.max(a.x, 0.014); a.y = Math.max(a.y, 0.016); a.z = Math.max(a.z, 0.021);
    U.rDisplay.value = linear ? 0 : 1;
  }

  // Is there a roof over the camera? One pixel read back after each occlusion pass (float maps only), for the
  // muffled sound of rain on an awning overhead.
  _readShelter() {
    const occ = this.occ, r = this.engine.renderer, T = this.T;
    if (!occ.supported || occ.target.texture.type !== T.FloatType) { this.sheltered = false; return; }
    try {
      if (!this._px) this._px = new Float32Array(4);
      const c = occ.res >> 1;
      r.readRenderTargetPixels(occ.target, c, c, 1, 1, this._px);
      const h = this._px[0];
      this.sheltered = h > -900 && h + occ.U.rOccInfo.value.w > this.engine.camera.position.y + 0.4;
    } catch (e) { this.sheltered = false; }
  }

  update(dt, focus, cur, wetness) {
    const e = this.engine, U = this.U, T = this.T;
    const cam = e.camera.position;
    const rain = cur.rain;
    const env = e.env;
    // time and wind (integrated, so gusts bend the rain smoothly instead of teleporting it)
    U.uTime.value += dt;
    this._gustT += dt;
    const g = this._gustT;
    const base = e.surfaces.uniforms.shWind.value;
    const gust = 1 + 0.35 * Math.sin(g * 0.83) * Math.sin(g * 0.37 + 1.7) + 0.12 * Math.sin(g * 2.3);
    const veer = 0.18 * Math.sin(g * 0.21) * Math.sin(g * 0.13 + 0.4);
    const cs = Math.cos(veer), sn = Math.sin(veer);
    U.uWind.value.set((base.x * cs - base.y * sn) * gust, (base.x * sn + base.y * cs) * gust);
    U.uWindOff.value.addScaledVector(U.uWind.value, dt);
    if (U.uTime.value > 1200) { U.uTime.value = 0; U.uWindOff.value.set(0, 0); }
    // camera velocity, for motion blur (a cut or a teleport is not a velocity)
    if (!this._camInit) { this._camPrev.copy(cam); this._camInit = true; }
    if (dt > 0) {
      this._v3.subVectors(cam, this._camPrev).divideScalar(dt);
      if (this._v3.lengthSq() > 90 * 90) this._v3.set(0, 0, 0);
      this._camVel.lerp(this._v3, Math.min(1, dt * 10));
    }
    this._camPrev.copy(cam);
    U.uCamVel.value.copy(this._camVel);
    U.uCenter.value.copy(cam);
    // pixel footprint, so thin far drops are widened to a pixel and faded instead of flickering
    const cv = e.renderer.domElement;
    const hpx = Math.max(240, (cv && cv.height) || 1080);
    U.uPix.value = 2 * Math.tan(((e.camera.fov || 60) * Math.PI) / 360) / hpx;
    // how hard it rains: Marshall-Palmer slope from the rate, the share of drops drawn, splash size
    const rate = 0.3 + 45 * Math.pow(Math.max(rain, 0), 2.5);           // mm/h: drizzle ~2, rain ~15, storm ~45
    U.uLambda.value = 4.1 * Math.pow(rate, -0.21);
    U.uAmount.value = Math.min(1, Math.pow(Math.max(rain, 0), 0.8) * 1.05);
    U.uIntensity.value = 0.75 + 0.5 * rain;
    U.uSplashK.value = 0.8 + 0.5 * rain;
    U.uFallV.value = 4 + 4.5 * rain;
    U.uSheets.value = Math.max(0, rain - 0.15) * 0.4;
    U.uMist.value = Math.max(0, rain - 0.45) * 0.08;
    U.uDrip.value = Math.min(1, (wetness || 0) * 0.5 + rain * 0.6) * ((wetness || 0) > 0.2 ? 1 : 0);
    // lightning lights every drop at night; in daylight a strike barely shows on the rain
    U.rFlash.value = (env.flash || 0) * (0.12 + 0.88 * (1 - (this._day != null ? this._day : 0.5)));
    const gy = this.groundAt ? this.groundAt(focus.x, focus.z) : 0;
    if (isFinite(gy)) U.uGround.value = gy;
    const raining = rain > 0.01 && !this.indoors;
    const dripping = U.uDrip.value > 0.01 && !this.indoors;
    this.group.visible = raining;
    this.ground.visible = raining || dripping;
    this.splashes.visible = rain > 0.04;
    this.drips.visible = dripping;
    this.mist.visible = U.uMist.value > 0.002;
    this.sheets.visible = U.uSheets.value > 0.002;
    if (this.indoors) return;
    // lights: a full walk now and then, the nearest few picked several times a second
    const linear = !!(this.linearOut && this.linearOut());
    if (raining || dripping || (wetness || 0) > 0.05) {
      const now = performance.now();
      if (now - this._lightScanAt > (this._lights.length ? 4000 : 1000)) { this._lightScanAt = now; this._scanLights(e.scene); }
      this._pickAt -= dt;
      if (this._pickAt <= 0) { this._pickAt = 0.2; this._pickLights(cam, linear); }
      this._skyLight(env, cur.cloud || 0, linear);
      // the occlusion map also keeps sheltered ground dry while it is still wet out, so it runs then too (slower)
      if (this.occ.needs(raining ? dt : dt * 0.5, cam)) { this.occ.render(cam); this._readShelter(); }
    }
  }

  dispose() {
    this._disposeMeshes();
    this.engine.scene.remove(this.group);
    this.engine.scene.remove(this.ground);
    if (this.occ) this.occ.dispose();
  }
}
