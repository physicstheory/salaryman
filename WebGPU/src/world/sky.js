// The day and the night. The clock in the game state turns the sun and the moon across a procedural sky, recolours the haze and the
// ambient light, warms the sunlight as it drops, lights the windows, signs and street lamps when it gets dark, and keeps a small pool
// of real lights on the lamps nearest the player. The sky is rendered into a prefiltered environment map for reflections and ambient
// light, refreshed as the sun moves.
//
// Anything that should come on at night registers itself with `glow(material, energyAtNight, shareLeftOnByDay)`.
import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { clamp, lerp, smoothstep } from '../util.js';
import { nightU } from '../globals.js';
import { gs } from '../state.js';

const glowers = [];
export const glow = (mat, energy, dayShare = 0) => { glowers.push([mat, energy, dayShare]); mat.emissiveIntensity = energy * (dayShare + (1 - dayShare)); return mat; };
export const sky = { night: 1, elevation: 0 };

const AZ = THREE.MathUtils.degToRad(125);

export class SkyCycle {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.debugHour = -1;
    this.focus = null;
    this.lamps = [];
    this.envBusy = false;
    this.envHour = -99;
    this.envTarget = null;

    const mk = () => {
      const s = new SkyMesh();
      s.scale.setScalar(2000);
      s.turbidity.value = 7.5; s.rayleigh.value = 1.6; s.mieCoefficient.value = 0.006; s.mieDirectionalG.value = 0.82;
      return s;
    };
    this.skyView = mk();
    scene.add(this.skyView);
    this.skyEnv = mk();
    this.skyScene = new THREE.Scene();
    this.skyScene.add(this.skyEnv);

    // stars, drawn only when the sun is well down
    const geo = new THREE.BufferGeometry();
    const n = 2600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos[i * 3] = r * Math.cos(a) * 2200; pos[i * 3 + 1] = Math.abs(u) * 2200; pos[i * 3 + 2] = r * Math.sin(a) * 2200;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // the moon: a soft disc far away
    const mc = document.createElement('canvas'); mc.width = mc.height = 128;
    const g = mc.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,248,1)'); gr.addColorStop(0.42, 'rgba(235,240,255,1)'); gr.addColorStop(0.5, 'rgba(200,215,255,0.35)'); gr.addColorStop(1, 'rgba(180,200,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    this.moonMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), transparent: true, depthWrite: false, fog: false, toneMapped: false });
    this.moonMesh = new THREE.Sprite(this.moonMat);
    this.moonMesh.scale.setScalar(150);
    this.moonMesh.frustumCulled = false;
    scene.add(this.moonMesh);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.near = 1; sc.far = 400; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110;
    this.sun.shadow.bias = -0.0002; this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);

    this.moon = new THREE.DirectionalLight(0x8fb0ff, 0);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const mcam = this.moon.shadow.camera;
    mcam.near = 1; mcam.far = 400; mcam.left = -90; mcam.right = 90; mcam.top = 90; mcam.bottom = -90;
    this.moon.shadow.bias = -0.0003;
    scene.add(this.moon, this.moon.target);

    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x30343c, 0.2);
    scene.add(this.hemi);

    this.pmrem = new THREE.PMREMGenerator(renderer);

    // a pool of real lights on the street lamps nearest the player
    this.pool = [];
    for (let i = 0; i < 10; i++) {
      const l = new THREE.PointLight(0xffc27a, 0, 26, 1.6);
      l.visible = false;
      scene.add(l);
      this.pool.push(l);
    }
    this._poolT = 0;
    this._sunDir = new THREE.Vector3();
    this._c = new THREE.Color();
    this._c2 = new THREE.Color();
  }

  hour() { return this.debugHour >= 0 ? this.debugHour : gs.clockMin / 60; }

  async refreshEnvironment() {
    if (this.envBusy) return;
    this.envBusy = true;
    try {
      const p = this.pmrem;
      const next = typeof p.fromSceneAsync === 'function' ? await p.fromSceneAsync(this.skyScene, 0, 0.1, 100000) : p.fromScene(this.skyScene, 0, 0.1, 100000);
      if (this.envTarget) this.envTarget.dispose();
      this.envTarget = next;
      this.scene.environment = next.texture;
    } catch (err) { console.warn('environment map unavailable:', err); }
    this.envHour = this.hour();
    this.envBusy = false;
  }

  setLamps(list) { this.lamps = list; }

  update(dt, camera) {
    const hr = this.hour();
    const ang = ((hr - 6) / 24) * Math.PI * 2;
    const el = Math.sin(ang);
    const sd = this._sunDir.set(Math.cos(ang) * 0.82, el, Math.cos(ang) * 0.57).normalize();
    this.skyView.sunPosition.value.copy(sd);
    this.skyEnv.sunPosition.value.copy(sd);
    const day = smoothstep(-0.06, 0.18, el);
    const low = 1 - clamp(el * 2.4, 0, 1);
    const dusk = smoothstep(-0.12, 0.02, el) * (1 - smoothstep(0.02, 0.35, el));
    const night = 1 - smoothstep(-0.14, 0.06, el);
    sky.night = night; sky.elevation = el;
    nightU.value = night;

    // follow the player so the shadow map covers what is near
    const f = this.focus ? this.focus.position : camera.position;
    const fx = Math.round(f.x / 8) * 8, fz = Math.round(f.z / 8) * 8;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + sd.x * 160, sd.y * 160, fz + sd.z * 160);
    this.sun.color.setRGB(1.0, 0.96 - 0.38 * low, 0.88 - 0.62 * low);
    this.sun.intensity = 3.1 * day * lerp(0.5, 1, 1 - low);
    this.sun.castShadow = day > 0.02;
    this.moon.target.position.set(fx, 0, fz);
    this.moon.position.set(fx - sd.x * 160, Math.max(-sd.y, 0.2) * 160, fz - sd.z * 160 + 24);
    this.moon.intensity = 0.7 * night;
    this.moon.castShadow = night > 0.5;
    this.moonMesh.position.set(camera.position.x - sd.x * 1800, Math.max(-sd.y, 0.12) * 1800 + 120, camera.position.z - sd.z * 1800);
    this.moonMat.opacity = smoothstep(-0.02, -0.2, el);

    this.hemi.intensity = lerp(0.12, 0.22, day);
    this.scene.environmentIntensity = lerp(0.14, 1.0, day) + 0.04;
    this.skyView.rayleigh.value = lerp(0.5, 1.6 + 1.6 * dusk, day);
    this.starMat.opacity = smoothstep(-0.04, -0.22, el) * 0.9;
    this.stars.position.copy(camera.position);
    this.skyView.position.copy(camera.position);

    // haze takes the colour of the sky near the horizon
    this._c.setRGB(0.56, 0.66, 0.8).lerp(this._c2.setRGB(1.0, 0.55, 0.34), dusk * 0.8).lerp(this._c2.setRGB(0.03, 0.04, 0.09), night);
    this.scene.fog.color.copy(this._c);
    this.scene.fog.density = lerp(0.0021, 0.0009, day) + 0.0007 * dusk;
    this.renderer.toneMappingExposure = lerp(1.7, 0.78, day);
    this.scene.backgroundIntensity = lerp(1.0, 0.55, day);

    for (const g of glowers) g[0].emissiveIntensity = g[1] * lerp(g[2], 1, night);

    // street lamps: real lights on the nearest few
    this._poolT -= dt;
    if (this._poolT <= 0) {
      this._poolT = 0.35;
      const fp = f;
      const near = [];
      for (const v of this.lamps) {
        const d = (v.x - fp.x) ** 2 + (v.z - fp.z) ** 2;
        if (d < 90 * 90) near.push([d, v]);
      }
      near.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < this.pool.length; i++) {
        const l = this.pool[i];
        if (i < near.length && night > 0.05) { l.position.set(near[i][1].x, near[i][1].y - 0.4, near[i][1].z); l.intensity = 140 * night; l.visible = true; }
        else l.visible = false;
      }
    }
    if (!this.envBusy && Math.abs(hr - this.envHour) > 0.3) this.refreshEnvironment();
  }
}
