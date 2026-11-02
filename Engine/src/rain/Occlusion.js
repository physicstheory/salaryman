// Rain occlusion: a height map of whatever is overhead around the camera, drawn from straight above.
//
// Every so often the scene is rendered top-down into a small float target with one override material that writes
// world height. Rain uses it everywhere: streaks vanish under awnings, arcades, bridges and umbrellas, splashes land
// on whatever is really there (roof, car top, kerb, the pavement), water drips off the edges of roofs, and the wet
// surface patch keeps the ground under cover dry. This is the technique console open-world games use for rain;
// it costs one cheap depth-like pass every second or so, not every frame.

const CLEAR = -1000;

export class RainOcclusion {
  constructor(engine, uniforms, opts) {
    this.engine = engine;
    const T = (this.T = engine.THREE);
    this.U = uniforms;          // rOcc, rOccInfo, rOccOn (shared with the wet surface patch)
    this.size = opts.size || 80;
    this.res = opts.res || 512;
    this.every = opts.every || 1;
    this.moveRefresh = opts.moveRefresh || 6;
    this.height = 320;          // the camera sits this far above the reference height, and sees as far below it
    this.supported = false;
    this.skipMinRadius = 400;   // sky domes, cloud decks and sea planes are not roofs
    this._t = 0;
    this._at = new T.Vector3(1e9, 0, 1e9);
    this._list = null;
    this._listAt = -1e9;
    this.passes = 0;
    this.lastMs = 0;
    this.excluded = new Set();  // objects the host does not want treated as cover (the car you are driving, ...)
    const r = engine.renderer;
    const caps = r && r.capabilities;
    const gl = r && r.getContext && r.getContext();
    if (!caps || !gl) return;
    // the shaders read the map in the vertex stage; floats need a renderable float or half-float target
    const vtf = caps.vertexTextures !== false && (caps.maxVertexTextures == null || caps.maxVertexTextures > 0);
    let type = null;
    if (caps.isWebGL2 && r.extensions.get("EXT_color_buffer_float")) type = T.FloatType;
    else if (caps.isWebGL2 || r.extensions.get("OES_texture_half_float")) type = T.HalfFloatType;
    if (!vtf || !type) return;
    this.target = new T.WebGLRenderTarget(this.res, this.res, {
      type, format: T.RGBAFormat, minFilter: T.NearestFilter, magFilter: T.NearestFilter,
      depthBuffer: true, stencilBuffer: false, generateMipmaps: false
    });
    this.target.texture.name = "shigoto-rain-occlusion";
    this.cam = new T.OrthographicCamera(-this.size / 2, this.size / 2, this.size / 2, -this.size / 2, 0.5, this.height * 2);
    this.cam.up.set(0, 0, -1);
    this.cam.layers.enableAll();
    this.refU = { value: 0 };
    this.mat = new T.ShaderMaterial({
      uniforms: { uRef: this.refU },
      side: T.DoubleSide,
      vertexShader: `
        varying float vY;
        void main() {
          vec4 p = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          vec4 w = modelMatrix * p;
          vY = w.y;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform float uRef; varying float vY;
        void main() { gl_FragColor = vec4(vY - uRef, 0.0, 0.0, 1.0); }`
    });
    this.mat.toneMapped = false;
    this.supported = true;
    this.U.rOcc.value = this.target.texture;
  }

  // Objects that must not count as cover: anything see-through, drawn without depth, sky-sized, skinned people
  // (their pose changes faster than the map), and anything the host or the rain engine marks.
  _skip(o) {
    if (this.excluded.has(o)) return true;
    const ud = o.userData;
    if (ud && (ud.shDry || ud.rainSkip)) return true;
    if (o.isPoints || o.isLine || o.isSprite || o.isSkinnedMesh) return true;
    if (!o.isMesh) return false;
    if (ud && ud.rainOccluder) return false; // Solid glass roofs still stop water.
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m) return true;
    if (m.depthWrite === false || (m.transparent && m.opacity < 0.85 && !m.alphaTest) || m.side === this.T.BackSide) return true;
    const g = o.geometry;
    if (g) {
      if (!g.boundingSphere && g.computeBoundingSphere && g.attributes && g.attributes.position) g.computeBoundingSphere();
      const s = g.boundingSphere;
      if (s) {
        const e = o.matrixWorld.elements;
        const sc = Math.sqrt(Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
        if (s.radius * sc > this.skipMinRadius) return true;
      }
    }
    return false;
  }

  // The skip list is rebuilt now and then (walking a resident open world is not free), not every pass.
  _skipList(scene, force) {
    const now = this.engine.time;
    if (!force && this._list && now - this._listAt < 8) return this._list;
    const list = [];
    scene.traverse(o => { if (o.visible && o !== scene && this._skip(o)) list.push(o); });
    this._list = list;
    this._listAt = now;
    return list;
  }

  needs(dt, center) {
    if (!this.supported) return false;
    this._t -= dt;
    if (this._t > this.every - 0.35) return false;   // never more than ~3 passes a second, even driving fast
    const dx = center.x - this._at.x, dz = center.z - this._at.z;
    return this._t <= 0 || dx * dx + dz * dz > this.moveRefresh * this.moveRefresh;
  }

  render(center, force) {
    if (!this.supported) return false;
    const t0 = performance.now();
    const T = this.T, r = this.engine.renderer, scene = this.engine.scene;
    this._t = this.every;
    // snap to texels so the map does not shimmer as the camera moves
    const texel = this.size / this.res;
    const cx = Math.round(center.x / texel) * texel, cz = Math.round(center.z / texel) * texel;
    const ref = Math.round(center.y);
    this._at.set(cx, ref, cz);
    this.cam.position.set(cx, ref + this.height, cz);
    this.cam.lookAt(cx, ref, cz);
    this.cam.updateMatrixWorld(true);
    this.refU.value = ref;
    const hidden = this._skipList(scene, force);
    const vis = new Array(hidden.length);
    for (let i = 0; i < hidden.length; i++) { vis[i] = hidden[i].visible; hidden[i].visible = false; }
    const was = {
      target: r.getRenderTarget(), auto: r.autoClear, override: scene.overrideMaterial, bg: scene.background, fog: scene.fog,
      shadowAuto: r.shadowMap.autoUpdate, shadowNeeds: r.shadowMap.needsUpdate, alpha: r.getClearAlpha(),
      color: r.getClearColor(new T.Color()), xr: r.xr && r.xr.enabled
    };
    let ok = true;
    try {
      r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;
      if (r.xr) r.xr.enabled = false;
      scene.overrideMaterial = this.mat; scene.background = null; scene.fog = null;
      r.setRenderTarget(this.target);
      r.setClearColor(new T.Color(CLEAR, 0, 0), 1);
      r.autoClear = true;
      r.clear(true, true, false);
      r.render(scene, this.cam);
    } catch (e) {
      ok = false;
      if (!this._warned) { this._warned = true; console.warn("[Shigoto] rain occlusion pass failed; rain falls everywhere", e); }
    }
    r.setRenderTarget(was.target);
    r.setClearColor(was.color, was.alpha);
    r.autoClear = was.auto;
    scene.overrideMaterial = was.override; scene.background = was.bg; scene.fog = was.fog;
    r.shadowMap.autoUpdate = was.shadowAuto; r.shadowMap.needsUpdate = was.shadowNeeds;
    if (r.xr) r.xr.enabled = was.xr;
    for (let i = 0; i < hidden.length; i++) hidden[i].visible = vis[i];
    this.U.rOccInfo.value.set(cx, cz, this.size, ref);
    this.U.rOccOn.value = ok ? 1 : 0;
    if (!ok) this.supported = false;
    this.passes++;
    this.lastMs = performance.now() - t0;
    return ok;
  }

  dispose() { if (this.target) this.target.dispose(); if (this.mat) this.mat.dispose(); }
}
