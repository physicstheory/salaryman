// Falling rain: three depth layers of drops, each one instanced draw positioned entirely on the GPU in a box that
// wraps around the camera.
//
// Each drop has a real size, drawn from the Marshall-Palmer distribution for the current rainfall rate, and falls
// at that size's terminal velocity (big drops ~9 m/s, drizzle ~2-4 m/s, which is why drizzle hangs and drifts).
// What the eye sees is the drop smeared over the camera's shutter time by its motion RELATIVE to the camera, so
// streaks lengthen and tilt towards you when you drive into the rain. Width never drops below a pixel and opacity
// is scaled down to match instead, which keeps distant rain from shimmering. Drops vanish where the occlusion map
// says something is overhead.

import { RAIN_COMMON, COLLAPSE } from "./RainShaders.js";

export const STREAK_LAYERS = {
  //       box (m)          size  alpha  glint
  near: { box: [9, 7, 9],     k: 1.15, a: 0.85, glint: 1.0 },
  mid:  { box: [26, 18, 26],  k: 1.0,  a: 0.7,  glint: 0.85 },
  far:  { box: [64, 34, 64],  k: 1.0,  a: 0.5,  glint: 0.6 }
};

export function makeStreakLayer(T, name, count, shared) {
  const L = STREAK_LAYERS[name];
  const g = new T.InstancedBufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  g.setAttribute("aSeed", new T.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = count;
  const U = Object.assign({}, shared, {
    uBox: { value: new T.Vector3().fromArray(L.box) },
    uSizeK: { value: L.k },
    uLayerA: { value: L.a },
    uGlint: { value: L.glint }
  });
  const mat = new T.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, fog: false, side: T.DoubleSide,
    vertexShader: RAIN_COMMON + `
      uniform float uTime; uniform vec3 uBox; uniform vec3 uCenter; uniform vec2 uWind; uniform vec2 uWindOff;
      uniform vec3 uCamVel; uniform float uShutter; uniform float uAmount; uniform float uLambda; uniform float uPix;
      uniform float uSizeK; uniform float uLayerA; uniform float uGlint; uniform float uIntensity;
      attribute vec4 aSeed;
      varying vec2 vQ; varying vec3 vCol; varying float vA;
      void main() {
        if (aSeed.w > uAmount) { ${COLLAPSE} return; }
        // drop size (mm), Marshall-Palmer: N(D) ~ exp(-Lambda D); only drops big enough to see are drawn
        float u = fract(aSeed.x * 7.13 + aSeed.y * 3.71 + aSeed.z * 1.37);
        float dmm = clamp(0.9 - log(max(u, 1e-4)) / uLambda, 0.9, 5.5) * uSizeK;
        // terminal velocity (Atlas et al.)
        float vt = max(9.65 - 10.3 * exp(-0.6 * dmm), 1.4);
        // small drops ride the gusts and wander in the turbulence; big ones cut straight through
        float follow = mix(0.8, 0.5, smoothstep(1.0, 4.0, dmm));
        float wob = 0.35 / (dmm + 0.5);
        vec3 p = aSeed.xyz * uBox;
        p.y -= vt * uTime;
        p.xz += uWindOff * follow;
        p.xz += wob * vec2(sin(uTime * 1.9 + aSeed.y * 40.0), cos(uTime * 1.4 + aSeed.z * 40.0));
        vec3 lo = uCenter - uBox * 0.5;
        p = lo + mod(p - lo, uBox);
        // under cover: trace back along the fall line to whatever is overhead
        float h0 = rOccH(p.xz);
        vec3 vel = vec3(uWind.x * follow + wob * 1.9 * cos(uTime * 1.9 + aSeed.y * 40.0), -vt, uWind.y * follow - wob * 1.4 * sin(uTime * 1.4 + aSeed.z * 40.0));
        float dy = max(h0 - p.y, 0.0);
        float h1 = dy > 0.0 ? rOccH(p.xz - vel.xz / vt * dy) : h0;
        if (p.y < max(h0, h1) - 0.03) { ${COLLAPSE} return; }
        // motion blur: the drop smeared along its velocity relative to the camera over the shutter time
        vec3 vr = vel - uCamVel;
        float sp = max(length(vr), 0.5);
        vec3 axis = vr / sp;
        float len = max(sp * uShutter, dmm * 0.004);
        vec3 toCam = cameraPosition - p;
        float d = length(toCam);
        toCam /= max(d, 1e-4);
        vec3 side = cross(axis, toCam);
        float sl = length(side);
        side = sl > 1e-3 ? side / sl : vec3(1.0, 0.0, 0.0);
        // a drop reads wider than it is (it refracts a bright halo); thinner than a pixel it is widened and faded
        float wPhys = dmm * 0.0025;
        float wPix = uPix * d * 1.1;
        float w = max(wPhys, wPix);
        vec3 wp = p + side * position.x * w - axis * position.y * len;
        // energy: a drop's light is spread over its streak (a faster or wider streak is fainter per pixel)
        float cover = sqrt(wPhys / w);
        float spread = clamp(sqrt(wPhys * 18.0 / len), 0.3, 1.0);
        float fade = smoothstep(0.25, 1.1, d) * (1.0 - smoothstep(uBox.x * 0.36, uBox.x * 0.5, d));
        vA = uLayerA * uIntensity * cover * spread * fade * (0.55 + 0.45 * smoothstep(0.5, 3.0, dmm));
        vQ = vec2(position.x, position.y);
        vCol = rDropLight(p, -toCam, uGlint);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: RAIN_COMMON + `
      varying vec2 vQ; varying vec3 vCol; varying float vA;
      void main() {
        float across = exp(-vQ.x * vQ.x * 3.5);
        // the leading end (the drop now) is brightest; the tail is where it was a shutter ago
        float along = smoothstep(0.0, 0.06, vQ.y) * (1.0 - 0.55 * vQ.y) * smoothstep(1.0, 0.72, vQ.y);
        float a = vA * across * along;
        if (a < 0.002) discard;
        gl_FragColor = vec4(rOut(vCol), a);
      }`
  });
  mat.toneMapped = false;
  const mesh = new T.Mesh(g, mat);
  mesh.name = "rain-" + name;
  mesh.frustumCulled = false;
  mesh.renderOrder = name === "far" ? 8 : name === "mid" ? 9 : 10;
  mesh.userData.shDry = true;
  mesh.userData.rainSkip = true;
  return mesh;
}
