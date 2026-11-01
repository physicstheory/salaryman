// The engine's own materials for built content: facades (with windows you can see into), roads and their markings,
// pavements, roofs and plain painted things. All of them are ordinary MeshStandardMaterials with shader patches, so
// lights, shadows, fog, the reflection probe, tone mapping and the wetness patch all work on them unchanged.

const FACADE_V = /* glsl */ `
attribute vec3 aTan; attribute vec4 aFac; attribute vec4 aFac2;
varying vec3 vFTan; varying vec4 vFac; varying vec4 vFac2; varying vec2 vFUv; varying vec3 vFPos; varying vec3 vFNor;
`;
const FACADE_F = /* glsl */ `
uniform float shNight;
varying vec3 vFTan; varying vec4 vFac; varying vec4 vFac2; varying vec2 vFUv; varying vec3 vFPos; varying vec3 vFNor;
float fH(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float fN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = fH(vec3(i, 0.0)), b = fH(vec3(i + vec2(1,0), 0.0)), c = fH(vec3(i + vec2(0,1), 0.0)), d = fH(vec3(i + vec2(1,1), 0.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
float fGlass; vec3 fEmit; float fMetal;
// Interior mapping: the ray from the eye is carried on through the glass into a box-shaped room behind it
// (back wall, side walls, floor, ceiling), so every window has depth and parallax with no extra geometry.
vec3 fRoom(vec2 lp, vec3 vd, float depth, float h, float lit, float warm, out float backDist) {
  vec3 o = vec3(lp, 0.0);
  vec3 d = vd;
  vec3 t1 = (step(0.0, d) - o) / d; t1.z = depth / d.z;
  float t = min(min(t1.x, t1.y), t1.z);
  vec3 p = o + d * t;
  backDist = p.z / depth;
  vec3 wallC = mix(vec3(0.78, 0.74, 0.66), vec3(0.62, 0.68, 0.72), fH(vec3(h, 3.0, 1.0)));
  vec3 floorC = mix(vec3(0.36, 0.26, 0.18), vec3(0.32, 0.33, 0.34), fH(vec3(h, 5.0, 2.0)));
  vec3 ceilC = vec3(0.86, 0.86, 0.84);
  vec3 c;
  if (t == t1.z) { c = wallC * 0.9;
    // furniture silhouettes against the back wall: a desk or a sofa, a shelf, a doorway
    float k = fH(vec3(h, 7.0, 0.0));
    if (p.y < 0.38 && abs(p.x - 0.3 - k * 0.4) < 0.22) c *= 0.45;
    if (p.y > 0.25 && p.y < 0.78 && abs(p.x - 0.85 + k * 0.6) < 0.08) c *= 0.6;
  }
  else if (t == t1.y) { c = d.y > 0.0 ? ceilC : floorC; if (d.y > 0.0) c += step(abs(p.x - 0.5), 0.18) * step(abs(p.z / depth - 0.5), 0.12) * 0.6 * lit; }
  else c = wallC * 0.75;
  // light falls off into the room
  vec3 lightC = mix(vec3(1.0, 0.78, 0.52), vec3(0.86, 0.93, 1.0), warm);
  float fall = mix(1.0, 0.55, backDist);
  return c * lightC * fall;
}
`;

export class Materials {
  constructor(engine) {
    this.engine = engine;
    this.T = engine.THREE;
    this.cache = new Map();
  }

  get(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const m = this["_" + name] ? this["_" + name]() : this._paint();
    this.cache.set(name, m);
    this.engine.surfaces.adopt(m);
    return m;
  }

  _paint() { return new this.T.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.0 }); }
  _metal() { return new this.T.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.85 }); }
  _plastic() { return new this.T.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.0 }); }
  _glow() { const m = new this.T.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 1.0 }); m.userData.shDry = true;
    const S = this.engine.surfaces.uniforms;
    m.onBeforeCompile = sh => { sh.uniforms.shNight = S.shNight; sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float shNight;").replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor * mix(0.25, 2.4, shNight);"); };
    m.customProgramCacheKey = () => "shigoto-glow"; return m; }
  _leaves() { return new this.T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, flatShading: true }); }

  _asphalt() {
    const T = this.T;
    const m = new T.MeshStandardMaterial({ color: new this.T.Color(0x3a3c3f).convertSRGBToLinear(), roughness: 0.92, metalness: 0.0 });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vAW;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvAW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
        varying vec3 vAW;
        float aH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float aN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(aH(i), aH(i+vec2(1,0)), f.x), mix(aH(i+vec2(0,1)), aH(i+vec2(1,1)), f.x), f.y); }`)
        .replace("#include <map_fragment>", `#include <map_fragment>
        { float g = aH(floor(vAW.xz * 40.0)) * 0.18 + aN(vAW.xz * 0.35) * 0.22 + aN(vAW.xz * 3.0) * 0.12;
          diffuseColor.rgb *= 0.78 + g;
          // patched repairs: darker rectangles of newer tarmac
          float patchK = step(0.86, aH(floor(vAW.xz / 7.0)));
          diffuseColor.rgb *= 1.0 - patchK * 0.25 * step(0.2, fract(vAW.x / 7.0)) * step(0.3, fract(vAW.z / 7.0)); }`);
    };
    m.customProgramCacheKey = () => "shigoto-asphalt";
    return m;
  }

  _paving() {
    const T = this.T;
    const m = new T.MeshStandardMaterial({ color: new this.T.Color(0x9a9893).convertSRGBToLinear(), roughness: 0.85 });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vPW;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvPW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vPW;\nfloat pH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }")
        .replace("#include <map_fragment>", `#include <map_fragment>
        { vec2 t = vPW.xz / vec2(0.6, 0.3); t.x += step(1.0, mod(floor(t.y), 2.0)) * 0.5;
          vec2 f = fract(t); float grout = step(0.04, f.x) * step(0.06, f.y);
          diffuseColor.rgb *= mix(0.6, 0.92 + pH(floor(t)) * 0.14, grout); }`);
    };
    m.customProgramCacheKey = () => "shigoto-paving";
    return m;
  }

  _roof() { return new this.T.MeshStandardMaterial({ color: new this.T.Color(0x8c8a86).convertSRGBToLinear(), roughness: 0.9, vertexColors: true }); }

  // Road markings: white and yellow paint, a touch glossy, slightly worn.
  _marking() {
    const T = this.T;
    const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vMW;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvMW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vMW;\nfloat mH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }")
        .replace("#include <map_fragment>", "#include <map_fragment>\n diffuseColor.rgb *= 0.8 + 0.2 * mH(floor(vMW.xz * 30.0)); if (mH(floor(vMW.xz * 12.0)) < 0.07) diffuseColor.rgb = vec3(0.25);");
    };
    m.customProgramCacheKey = () => "shigoto-marking";
    return m;
  }

  _facade() {
    const T = this.T, S = this.engine.surfaces.uniforms;
    const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0 });
    m.onBeforeCompile = sh => {
      sh.uniforms.shNight = S.shNight;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + FACADE_V)
        .replace("#include <project_vertex>", `#include <project_vertex>
          vFTan = normalize(mat3(modelMatrix) * aTan); vFac = aFac; vFac2 = aFac2; vFUv = uv;
          vFPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vFNor = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + FACADE_F)
        .replace("#include <map_fragment>", `#include <map_fragment>
        fGlass = 0.0; fEmit = vec3(0.0); fMetal = 0.0;
        {
          int style = int(vFac.x + 0.5);
          // floor the seed: an interpolated varying wobbles in the last bits, and the hash would turn that into noise
          float floorH = vFac.y, bayW = vFac.z, groundH = vFac.w, seed = floor(vFac2.x + 0.5), depth = vFac2.y, litP = vFac2.z;
          vec2 uvm = vFUv;
          vec3 base = diffuseColor.rgb;
          // tiles / panels on the wall itself
          vec2 tile = style == 1 ? vec2(1.5, 0.9) : style == 3 ? vec2(0.23, 0.075) : vec2(0.45, 0.15);
          vec2 tf = fract(uvm / tile + vec2(step(1.0, mod(floor(uvm.y / tile.y), 2.0)) * 0.5, 0.0));
          base *= mix(0.86, 1.0, step(0.05, tf.x) * step(0.08, tf.y)) * (0.94 + 0.12 * fH(vec3(floor(uvm / tile), seed)));
          // grime: dark streaks under every window sill and a dirty band along the street
          float streak = fN(vec2(uvm.x * 2.3, uvm.y * 0.15 + seed)) * fN(vec2(uvm.x * 7.0, seed));
          base *= 1.0 - streak * 0.28 - (1.0 - smoothstep(0.0, 1.4, uvm.y)) * 0.25;
          vec3 V = normalize(vFPos - cameraPosition);
          vec3 N = normalize(vFNor), Tn = normalize(vFTan);
          vec3 vd = vec3(dot(V, Tn), V.y, -dot(V, N));
          bool shop = uvm.y < groundH;
          float fl = shop ? -1.0 : floor((uvm.y - groundH) / floorH);
          float bw = shop ? bayW * 2.0 : bayW;
          float bay = floor(uvm.x / bw);
          vec2 lp = vec2(fract(uvm.x / bw), shop ? uvm.y / groundH : fract((uvm.y - groundH) / floorH));
          vec4 win = style == 1 ? vec4(0.03, 0.97, 0.12, 0.94) : style == 2 ? vec4(0.24, 0.76, 0.32, 0.82) : style == 4 ? vec4(0.08, 0.92, 0.22, 0.9) : vec4(0.16, 0.84, 0.3, 0.86);
          if (shop) win = vec4(0.05, 0.95, 0.04, 0.78);
          float h = fH(vec3(bay, fl, seed));
          float inWin = step(win.x, lp.x) * step(lp.x, win.y) * step(win.z, lp.y) * step(lp.y, win.w);
          inWin *= step(uvm.y, vFac2.w - 0.25);
          if (uvm.y > vFac2.w) base *= 0.82; // the parapet
          // balconies / spandrels: a lighter slab at the foot of each floor on apartment buildings
          if (!shop && style == 0 && lp.y < 0.14) base = mix(base, vec3(0.86, 0.85, 0.82), 0.7) * (lp.y < 0.03 ? 0.6 : 1.0);
          if (style == 1 && inWin < 0.5) { base = vec3(0.16, 0.17, 0.19); fMetal = 0.7; }
          if (inWin > 0.5 && dot(V, N) < 0.0) {
            vec2 wl = vec2((lp.x - win.x) / (win.y - win.x), (lp.y - win.z) / (win.w - win.z));
            float frame = 1.0 - step(0.025, wl.x) * step(wl.x, 0.975) * step(0.03, wl.y) * step(wl.y, 0.97);
            float mull = style == 1 ? 0.0 : step(abs(wl.x - 0.5), 0.012);
            if (frame + mull > 0.5) { base = vec3(0.22, 0.23, 0.24); fMetal = 0.6; }
            else {
              float lit = step(fH(vec3(bay, fl, seed + 9.1)), litP * mix(0.25, 1.0, shNight)) ;
              if (shop) lit = 1.0;
              float warm = style == 1 || shop ? 0.85 : fH(vec3(bay, fl, seed + 4.4)) * 0.6;
              float fh = shop ? groundH : floorH;
              vec3 rd = vec3(vd.x / (bw * (win.y - win.x)), vd.y / (fh * (win.w - win.z)), max(vd.z, 0.02));
              float back; vec3 room = fRoom(wl, rd, depth, h, lit, warm, back);
              // blinds: half drawn in some rooms
              float blind = step(0.55, h) * step(1.0 - (h - 0.55) * 1.8, wl.y);
              if (blind > 0.5) room = mix(vec3(0.72, 0.7, 0.66), vec3(0.9, 0.75, 0.5), lit) * (0.92 + 0.08 * smoothstep(0.3, 0.7, fract(wl.y * 9.0)));
              float dayAmb = 0.10 * (1.0 - shNight) + 0.015;
              if (shop) {
                // a shop: shelves of goods in bands down the room, a counter, posters on the glass
                float band = step(0.5, fract(wl.y * 5.0)) * step(back, 0.97);
                vec3 goods = vec3(fH(vec3(floor(wl.x * 9.0), floor(wl.y * 5.0), seed)), fH(vec3(floor(wl.x * 7.0), floor(wl.y * 5.0), seed + 1.0)), fH(vec3(floor(wl.x * 8.0), floor(wl.y * 5.0), seed + 2.0)));
                room = mix(room, goods * 0.8 + 0.1, band * 0.55 * step(0.2, wl.y));
                if (wl.y > 0.62 && wl.y < 0.86 && fH(vec3(bay, 77.0, seed)) > 0.5 && abs(wl.x - 0.3) < 0.12) room = vec3(fH(vec3(bay, 1.0, seed)), 0.3, 0.4); // a poster
              }
              float lv = shop ? mix(0.16, 0.6, shNight) : mix(0.25, 1.0, shNight);
              fEmit = room * (lit * lv + dayAmb);
              base = vec3(0.02, 0.025, 0.03);
              fGlass = 1.0;
            }
          }
          diffuseColor.rgb = base;
        }`)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.04, fGlass); roughnessFactor = mix(roughnessFactor, 0.35, fMetal);")
        .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n metalnessFactor = max(metalnessFactor, fMetal * 0.8);")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n totalEmissiveRadiance += fEmit;");
    };
    m.customProgramCacheKey = () => "shigoto-facade2";
    return m;
  }
}
