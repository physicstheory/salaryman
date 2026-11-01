// Surfaces: one set of shader inputs (wetness, rain, wind, time, lightning) that every material in the world reads.
//
// Any three.js Standard, Physical, Phong or Lambert material can be "adopted": its shader gets a small patch that
// darkens it and makes it glossy as it gets wet, fills dips in flat ground with puddles that hold sharp reflections,
// and rings those puddles with raindrop ripples. Materials keep working exactly as before when it is dry, and any
// onBeforeCompile a material already had (the game's own shader tweaks) still runs first.

const RIPPLE_GLSL = /* glsl */ `
uniform float shWet;
uniform float shRain;
uniform float shTime;
uniform float shPuddles;
varying vec3 vShWorldPos;
varying vec3 vShWorldN;
float shHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float shNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(shHash(i), shHash(i + vec2(1, 0)), f.x), mix(shHash(i + vec2(0, 1)), shHash(i + vec2(1, 1)), f.x), f.y);
}
float shFbm(vec2 p) { return 0.5 * shNoise(p) + 0.3 * shNoise(p * 2.13 + 7.1) + 0.2 * shNoise(p * 4.37 + 3.3); }
// Raindrop rings: each cell of a grid gets a drop at a random moment in a repeating cycle; its ring spreads and fades.
vec2 shRipples(vec2 p, float t) {
  vec2 g = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 q = p * (k == 0 ? 5.0 : 7.3) + float(k) * 17.3;
    vec2 cell = floor(q);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      float h = shHash(c);
      vec2 centre = c + vec2(shHash(c + 3.1), shHash(c + 5.7));
      float ph = fract(t * (0.9 + 0.4 * h) + h * 7.0);
      vec2 d = q - centre;
      float r = length(d);
      float ring = ph * 0.7;
      float w = sin((r - ring) * 28.0) * smoothstep(0.08, 0.0, abs(r - ring)) * (1.0 - ph) * (1.0 - ph);
      g += normalize(d + 1e-4) * w;
    }
  }
  return g;
}
float shWetAmt;
float shPuddle;
void shSurface(vec3 wp, vec3 wn) {
  float up = clamp(wn.y, 0.0, 1.0);
  // walls take less water and in streaks running down them; anything facing the sky soaks fully
  float streak = 0.65 + 0.35 * shNoise(vec2(wp.x * 1.7 + wp.z * 1.7, wp.y * 0.12));
  shWetAmt = shWet * mix(streak * 0.75, 1.0, smoothstep(0.3, 0.9, up));
  float n = shFbm(wp.xz * 0.11) * 0.7 + shFbm(wp.xz * 0.5) * 0.3;
  shPuddle = smoothstep(0.66 - shPuddles * 0.12, 0.71 - shPuddles * 0.12, n) * smoothstep(0.93, 0.99, up) * smoothstep(0.35, 0.9, shWet);
}
`;

export class Surfaces {
  constructor(engine) {
    this.engine = engine;
    const T = engine.THREE;
    this.uniforms = {
      shWet: { value: 0 },
      shRain: { value: 0 },
      shTime: { value: 0 },
      shPuddles: { value: 0.5 },
      shWind: { value: new T.Vector2(1, 0) },
      shLightning: { value: 0 },
      shNight: { value: 0 }
    };
    this.adopted = new WeakSet();
    this.count = 0;
    this._scanAt = 0;
  }

  // Patch one material. Returns true if it was patched.
  adopt(mat) {
    if (!mat || this.adopted.has(mat) || (mat.userData && mat.userData.shDry)) return false;
    const kind = mat.isMeshStandardMaterial ? "std" : mat.isMeshPhongMaterial ? "phong" : mat.isMeshLambertMaterial ? "lambert" : null;
    if (!kind || mat.isShaderMaterial) return false;
    this.adopted.add(mat);
    this.count++;
    const U = this.uniforms;
    const prev = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey;
    mat.onBeforeCompile = function (shader, renderer) {
      if (prev && prev !== Surfaces._noop) prev.call(this, shader, renderer);
      Object.assign(shader.uniforms, U);
      let vs = shader.vertexShader;
      if (vs.indexOf("vShWorldPos") < 0) {
        vs = "varying vec3 vShWorldPos;\nvarying vec3 vShWorldN;\n" + vs;
        vs = vs.replace("#include <project_vertex>", `#include <project_vertex>
  {
    vec4 shP = vec4(transformed, 1.0);
    vec3 shN = objectNormal;
    #ifdef USE_INSTANCING
      shP = instanceMatrix * shP; shN = mat3(instanceMatrix) * shN;
    #endif
    vShWorldPos = (modelMatrix * shP).xyz;
    vShWorldN = normalize(mat3(modelMatrix) * shN);
  }`);
      }
      shader.vertexShader = vs;
      let fs = shader.fragmentShader;
      fs = fs.replace("#include <common>", "#include <common>\n" + RIPPLE_GLSL);
      // wet albedo is darker: water fills the pores and light goes in instead of scattering back out
      fs = fs.replace("#include <color_fragment>", `#include <color_fragment>
  shWetAmt = 0.0; shPuddle = 0.0;
  if (shWet > 0.001) {
    shSurface(vShWorldPos, normalize(vShWorldN));
    diffuseColor.rgb *= mix(1.0, 0.52, shWetAmt);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55 + vec3(0.004, 0.006, 0.008), shPuddle);
  }`);
      if (kind === "std") {
        fs = fs.replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.16), shWetAmt);
  roughnessFactor = mix(roughnessFactor, 0.025, shPuddle);`);
      } else if (kind === "phong") {
        fs = fs.replace("#include <specularmap_fragment>", `#include <specularmap_fragment>
  specularStrength = mix(specularStrength, 1.0, max(shWetAmt * 0.6, shPuddle));`);
      }
      if (kind !== "lambert") {
        // raindrop ripples bend the normal inside puddles (and faintly on any wet floor)
        fs = fs.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  if (shRain > 0.01 && (shPuddle > 0.01 || shWetAmt > 0.5)) {
    vec2 rg = shRipples(vShWorldPos.xz, shTime) * shRain * mix(0.05, 0.35, shPuddle);
    vec3 nw = normalize(vec3(-rg.x, 1.0, -rg.y));
    float k = max(shPuddle, (shWetAmt - 0.5) * 0.4) * smoothstep(0.9, 0.98, vShWorldN.y);
    normal = normalize(mix(normal, normalize((viewMatrix * vec4(nw, 0.0)).xyz), k));
  }`);
      }
      shader.fragmentShader = fs;
    };
    mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : "") + "|shigoto-wet1"; };
    mat.needsUpdate = true;
    return true;
  }

  // Adopt every eligible material under an object (a streamed cell, or the whole scene).
  adoptTree(root, budget) {
    let n = 0;
    root.traverse(o => {
      if (budget && n >= budget) return;
      if (!o.isMesh || !o.material) return;
      if (o.userData && o.userData.shDry) return;
      const m = o.material;
      if (Array.isArray(m)) m.forEach(x => { if (this.adopt(x)) n++; });
      else if (this.adopt(m)) n++;
    });
    return n;
  }

  // Keep adopting materials the host adds later (the game builds things as you travel). A few hundred per scan.
  autoAdopt(root, every) { this._auto = root; this._every = every || 2; }

  update(dt) {
    this.uniforms.shTime.value += dt;
    if (this._auto) {
      this._scanAt -= dt;
      if (this._scanAt <= 0) { this._scanAt = this._every; this.adoptTree(this._auto, 400); }
    }
  }
}
Surfaces._noop = function () {};
