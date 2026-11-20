// ---- Ultra Max: the cinematic render mode ------------------------------------------------------------------------------
// A render mode above Ultra, kept for the moments nobody is steering: cutscenes, the title flyovers, and the recordings
// those flyovers are made from (Game/tools/record-reel.mjs). Play itself never uses it.
//
// What it adds, on top of the AAA chain (fxBuild in konto.html), as one extra full-screen pass before SMAA:
//   light shafts   the sun's light scattered through the air, marched from every pixel back towards the sun across the open
//                  sky in the depth buffer, so towers, ridges and trees cut beams out of it
//   air            aerial perspective with the sun in it: far things take on the colour of the haze, warmer towards the sun
//   depth of field a 24-tap golden-angle bokeh on the circle of confusion from the real depth (a shot can rack focus)
//   lens           halation round the highlights, edge falloff, a whisper of chromatic fringing, fine film grain
//   grade          a filmic S-curve, warm highlights over cool shadows, a little more colour, and 2.39:1 bars on recordings
// and, in the light itself: stronger, wider ambient occlusion, a softer and brighter bloom, and contact shadows tightened.
//
// Levels: 2 = full (discrete graphics cards, and the recordings), 1 = lite (integrated graphics such as Iris Xe: shafts with
// fewer taps, no depth of field, nothing else made heavier), 0 = off. Lite costs one full-screen pass and no extra memory.
// Switches: ?ultramax=0 never, ?ultramax=1 always full (the recorder), ULTRAMAX.report() in the console.
(function () {
  "use strict";
  const QS = location.search;
  if (/[?&]ultramax=0\b/.test(QS)) return;
  const UM = window.ULTRAMAX = {
    level: 0, want: 0, why: "", forced: /[?&]ultramax=1\b/.test(QS),
    // a shot may set these (title-reel.js does); they are put back when the mode ends
    focus: 0, aperture: 0, letterbox: 0, shafts: 1, haze: 1, warmth: 1, exposure: 1,
    pass: null, frames: 0, saved: null
  };

  // How far this machine may go.
  function ceiling() {
    if (UM.forced) return 2;
    try { if (window.GFX_SAFE && GFX_SAFE.level >= 2) return 0; } catch (e) { /* none */ }
    try { if (window.GPU_GUARD && GPU_GUARD.on) return 1; } catch (e) { /* none */ }
    if (typeof gfx === "object" && (gfx.tier === "low" || gfx.tier === "medium")) return 1;
    return 2;
  }
  // When the mode is wanted: a cutscene, the live title backdrop, or a recording that asked for it.
  function wanted() {
    if (UM.forced) return true;
    if (UM.manual !== undefined) return !!UM.manual;
    try { if (typeof cut === "object" && cut.active) return true; } catch (e) { /* none */ }
    try { if (typeof title === "object" && title.on) return true; } catch (e) { /* none */ }
    return false;
  }

  const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uRes, uSun;
uniform vec3 uSunCol, uHaze;
uniform float uSunOn, uNear, uFar, uFocus, uAperture, uLetter, uTime, uShafts, uHazeK, uWarm, uExpo, uFull;
float linZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 0.37) * 43758.5453); }
vec3 dof(vec2 uv, float z, vec3 base) {
  if (uAperture <= 0.0 || uFull < 0.5) return base;
  float coc = clamp(abs(z - uFocus) / max(z, 0.1) * uAperture, 0.0, 1.0) * 14.0;      // pixels of blur at this depth
  if (coc < 0.6) return base;
  vec3 acc = base; float w = 1.0;
  for (int i = 0; i < 24; i++) {
    float fi = float(i) + 0.5;
    float r = sqrt(fi / 24.0) * coc, a = fi * 2.39996323;
    vec2 o = vec2(cos(a), sin(a)) * r / uRes;
    float zt = linZ(texture2D(tDepth, uv + o).x);
    // a sharp thing in front must not smear over what is behind it
    float cocT = clamp(abs(zt - uFocus) / max(zt, 0.1) * uAperture, 0.0, 1.0) * 14.0;
    float k = zt < z - 0.5 ? smoothstep(0.0, 1.0, cocT / max(r, 0.5)) : 1.0;
    vec3 c = texture2D(tDiffuse, uv + o).rgb;
    float hl = 1.0 + 2.5 * smoothstep(0.75, 1.0, lum(c));                       // bright points open into discs
    acc += c * k * hl; w += k * hl;
  }
  return acc / w;
}
vec3 shafts(vec2 uv) {
  if (uSunOn <= 0.001 || uShafts <= 0.0) return vec3(0.0);
  const int N = 40;
  int n = uFull > 0.5 ? N : 14;
  vec2 d = (uSun - uv) / float(n) * 0.92;
  vec2 p = uv + d * hash(uv * uRes);
  float acc = 0.0, decay = 1.0;
  for (int i = 0; i < N; i++) {
    if (i >= n) break;
    float sky = step(0.99995, texture2D(tDepth, p).x);
    float l = lum(texture2D(tDiffuse, p).rgb);
    acc += sky * smoothstep(0.55, 1.0, l) * decay;
    decay *= 0.965;
    p += d;
  }
  float r = length((uv - uSun) * vec2(uRes.x / uRes.y, 1.0));
  return uSunCol * acc / float(n) * uSunOn * uShafts * 0.55 * exp(-r * 1.4);
}
void main() {
  vec2 uv = vUv;
  float d = texture2D(tDepth, uv).x, sky = step(0.99995, d), z = linZ(d);
  vec3 c = texture2D(tDiffuse, uv).rgb;
  c = dof(uv, z, c);
  // air: far things go towards the haze, which is brighter and warmer looking towards the sun
  vec2 toSun = (uv - uSun) * vec2(uRes.x / uRes.y, 1.0);
  float sunward = uSunOn * exp(-dot(toSun, toSun) * 2.2);
  vec3 air = uHaze * (1.0 + 0.35 * sunward) + uSunCol * 0.12 * sunward;
  float f = (1.0 - sky) * (1.0 - exp(-max(z - 60.0, 0.0) * 0.00028)) * 0.34 * uHazeK;
  c = mix(c, min(air, vec3(1.0)), f);
  // the sun's light through the air
  c += shafts(uv);
  // halation: highlights bleed a warm red into their surroundings, as on film
  float hl = smoothstep(0.82, 1.0, lum(c));
  c += vec3(0.06, 0.025, 0.0) * hl * uWarm;
  // grade: filmic S-curve, warm highlights over cool shadows, a little more colour
  c *= uExpo;
  c = clamp(c, 0.0, 1.0);
  c = c * c * (3.0 - 2.0 * c) * 0.35 + c * 0.65;
  float L = lum(c);
  vec3 shadowTint = vec3(-0.012, 0.004, 0.022), highTint = vec3(0.035, 0.012, -0.03) * uWarm;
  c += shadowTint * (1.0 - smoothstep(0.0, 0.45, L)) + highTint * smoothstep(0.45, 1.0, L);
  c = mix(vec3(lum(c)), c, 1.08);
  // lens: falloff, fringe, grain
  vec2 q = uv - 0.5;
  float v = 1.0 - dot(q, q) * 0.55;
  c *= v;
  if (uFull > 0.5) {
    vec2 ca = q * 0.0018;
    c.r = mix(c.r, texture2D(tDiffuse, uv + ca).r * v, 0.35 * smoothstep(0.1, 0.5, length(q)));
    c.b = mix(c.b, texture2D(tDiffuse, uv - ca).b * v, 0.35 * smoothstep(0.1, 0.5, length(q)));
  }
  c += (hash(uv * uRes + 3.1) - 0.5) * 0.018;
  // 2.39:1 bars on a 16:9 frame (recordings; cutscenes have their own)
  float bar = uLetter * 0.5 * (1.0 - (uRes.x / uRes.y) / 2.39);
  if (uv.y < bar || uv.y > 1.0 - bar) c = vec3(0.0);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

  function build() {
    if (UM.pass || typeof fx !== "object" || !fx.composer || !THREE.ShaderPass) return UM.pass;
    const pass = new THREE.ShaderPass({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uSun: { value: new THREE.Vector2(0.5, 0.5) },
        uSunCol: { value: new THREE.Color(1, 0.9, 0.75) }, uHaze: { value: new THREE.Color(0.7, 0.75, 0.8) },
        uSunOn: { value: 0 }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uFocus: { value: 50 }, uAperture: { value: 0 }, uLetter: { value: 0 },
        uTime: { value: 0 }, uShafts: { value: 1 }, uHazeK: { value: 1 }, uWarm: { value: 1 }, uExpo: { value: 1 }, uFull: { value: 1 }
      },
      vertexShader: "varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: FRAG
    });
    pass.enabled = false;
    const list = fx.composer.passes, smaa = fx.p && fx.p.smaa ? list.indexOf(fx.p.smaa) : -1;
    fx.composer.insertPass(pass, smaa >= 0 ? smaa : list.length);
    UM.pass = pass;
    return pass;
  }

  // The light, not only the picture: the AAA chain's own numbers, raised while the mode is on and put back after.
  function lift(level) {
    if (UM.saved) return;
    UM.saved = { ssao: Object.assign({}, fx.ssao), bloom: Object.assign({}, fx.bloom) };
    if (level >= 2) {
      Object.assign(fx.ssao, { radius: 1.6, intensity: 1.45, strength: 1.0 });
      Object.assign(fx.bloom, { strength: 0.68, radius: 0.72, threshold: 2.8 });
      try { if (sunLight && sunLight.shadow) { UM.saved.bias = sunLight.shadow.bias; UM.saved.nb = sunLight.shadow.normalBias; sunLight.shadow.bias = -0.00025; } } catch (e) { /* none */ }
    } else {
      Object.assign(fx.bloom, { strength: fx.bloom.strength * 1.15, radius: 0.62 });
    }
  }
  function drop() {
    if (!UM.saved) return;
    Object.assign(fx.ssao, UM.saved.ssao); Object.assign(fx.bloom, UM.saved.bloom);
    try { if (UM.saved.bias !== undefined) sunLight.shadow.bias = UM.saved.bias; } catch (e) { /* none */ }
    UM.saved = null;
  }

  const v3 = new THREE.Vector3();
  function feed(pass) {
    const u = pass.uniforms, sp = fx.p && fx.p.scene;
    u.tDepth.value = sp && sp.rt ? sp.rt.depthTexture : null;
    u.uRes.value.set(fx.w || 2, fx.h || 2);
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    u.uTime.value = (UM.frames++ % 997) * 0.731;
    // where the sun is on screen, and whether it is in front of us and up
    let on = 0;
    try {
      v3.copy(sunDir).multiplyScalar(5000).add(camera.position).project(camera);
      const ahead = v3.z < 1;
      u.uSun.value.set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5);
      const off = Math.max(Math.abs(v3.x), Math.abs(v3.y));
      on = ahead ? Math.max(0, Math.min(1, (1.9 - off) / 0.9)) : 0;
      on *= Math.max(0, Math.min(1, (sunDir.y + 0.04) / 0.1));        // nothing once it has set
      if (sunLight) u.uSunCol.value.copy(sunLight.color).multiplyScalar(0.35 + 0.65 * Math.min(1, sunLight.intensity));
    } catch (e) { on = 0; }
    u.uSunOn.value = on;
    if (scene && scene.fog) u.uHaze.value.copy(scene.fog.color);
    u.uFocus.value = UM.focus > 0 ? UM.focus : 1e5;
    u.uAperture.value = UM.focus > 0 ? UM.aperture : 0;
    u.uLetter.value = UM.letterbox; u.uShafts.value = UM.shafts; u.uHazeK.value = UM.haze; u.uWarm.value = UM.warmth; u.uExpo.value = UM.exposure;
    u.uFull.value = UM.level >= 2 ? 1 : 0;
  }

  function frame() {
    if (typeof fx !== "object" || !fx.composer) { UM.level = 0; return; }
    const want = wanted() ? ceiling() : 0;
    if (want !== UM.level) {
      if (UM.level) drop();
      UM.level = want;
      if (want) lift(want);
      UM.why = want ? (UM.forced ? "forced" : cut.active ? "cutscene" : title.on ? "title" : "manual") : "";
    }
    const pass = build();
    if (!pass) return;
    pass.enabled = UM.level > 0;
    if (UM.level) feed(pass);
  }

  // The chain is built on its first frame; the pass goes in after, and is fed before every frame.
  function hook() {
    if (typeof window.fxRender !== "function") { setTimeout(hook, 500); return; }
    const inner = window.fxRender;
    window.fxRender = function () {
      try { if (fx.composer) frame(); } catch (e) { console.warn("[UltraMax]", e); UM.level = 0; if (UM.pass) UM.pass.enabled = false; }
      const r = inner.apply(this, arguments);
      if (!fx.composer) return r;
      if (!UM.pass) try { frame(); } catch (e) { /* next frame */ }
      return r;
    };
  }
  hook();

  UM.set = function (o) { Object.assign(UM, o || {}); return UM; };
  UM.reset = function () { Object.assign(UM, { focus: 0, aperture: 0, letterbox: 0, shafts: 1, haze: 1, warmth: 1, exposure: 1 }); delete UM.manual; return UM; };
  UM.report = function () { return { level: UM.level, ceiling: ceiling(), why: UM.why, pass: !!UM.pass, focus: UM.focus, aperture: UM.aperture }; };
})();
