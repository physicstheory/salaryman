// The rain you see at a distance: sheets sweeping across the street in the gusts, and the mist that hangs over
// the ground in heavy rain (the spray of millions of splashes).
//
// Sheets are three concentric open cylinders around the camera (25, 55 and 110 m) shaded with streaky noise that
// falls, slants with the wind and is modulated by large moving gust bands, so curtains of heavier rain roll
// through. Buildings in front of a ring hide it through the depth test, so the sheets only ever appear in the
// open air between you and what is behind. Mist is a few dozen soft cards standing on the ground (from the
// occlusion map) that drift downwind, fade in and out, and catch the street lamps.

import { RAIN_COMMON, COLLAPSE } from "./RainShaders.js";

export function makeSheets(T, rings, shared) {
  const radii = [25, 55, 110].slice(0, Math.max(1, rings));
  const seg = 72, rows = 6;
  const pos = [], ring = [], idx = [];
  radii.forEach((R, k) => {
    const base = pos.length / 3;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(a), j / rows, Math.sin(a));
      ring.push(R, k, a);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  });
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("aRing", new T.Float32BufferAttribute(ring, 3));
  g.setIndex(idx);
  const U = Object.assign({}, shared, { uSheetH: { value: 48 } });
  const mat = new T.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, fog: false, side: T.DoubleSide,
    vertexShader: RAIN_COMMON + `
      uniform vec3 uCenter; uniform float uGround; uniform float uSheetH;
      attribute vec3 aRing;
      varying vec3 vW; varying float vH; varying float vR; varying float vTh; varying vec3 vCol;
      void main() {
        float R = aRing.x;
        vec3 w = vec3(uCenter.x + position.x * R, uGround - 3.0 + position.y * uSheetH, uCenter.z + position.z * R);
        vW = w; vH = position.y; vR = R; vTh = aRing.z;
        vCol = rDropLight(w, normalize(w - cameraPosition), 0.4);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: RAIN_COMMON + `
      uniform float uTime; uniform vec2 uWind; uniform vec2 uWindOff; uniform float uSheets; uniform float uFallV;
      varying vec3 vW; varying float vH; varying float vR; varying float vTh; varying vec3 vCol;
      float n2(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(rHash2(i), rHash2(i + vec2(1.0, 0.0)), f.x), mix(rHash2(i + vec2(0.0, 1.0)), rHash2(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float u = vTh * vR;                       // arc length around the ring (m)
        vec2 tang = vec2(-sin(vTh), cos(vTh));
        float wt = dot(uWind, tang);
        float wAlong = dot(uWindOff, tang);
        float y = vW.y;
        // slant with the wind: what lands here started upwind
        float us = u - wAlong - wt / max(uFallV, 1.0) * y;
        float fallY = y + uFallV * uTime;
        float streak = n2(vec2(us * 2.2, fallY * 0.09)) * 0.6 + n2(vec2(us * 5.3 + 13.0, fallY * 0.21)) * 0.4;
        streak = smoothstep(0.25, 0.95, streak);
        // gust bands: broad curtains of heavier rain rolling through
        float gust = n2(vec2(us * 0.035, uTime * 0.07 + float(vR) * 0.01)) * 0.7 + n2(vec2(us * 0.09 + 5.0, uTime * 0.13)) * 0.3;
        gust = smoothstep(0.32, 0.8, gust);
        float vfade = smoothstep(0.0, 0.08, vH) * (1.0 - smoothstep(0.55, 1.0, vH));
        float near = smoothstep(4.0, 20.0, distance(cameraPosition.xz, vW.xz));
        float a = uSheets * vfade * near * (0.18 + 0.55 * gust) * (0.45 + 0.55 * streak) * (vR > 80.0 ? 1.25 : vR > 40.0 ? 1.0 : 0.7);
        if (a < 0.002) discard;
        gl_FragColor = vec4(rOut(vCol * 0.95), min(a, 0.6));
      }`
  });
  mat.toneMapped = false;
  const mesh = new T.Mesh(g, mat);
  mesh.name = "rain-sheets";
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  mesh.userData.shDry = true;
  mesh.userData.rainSkip = true;
  return mesh;
}

export function makeMist(T, count, shared) {
  const g = new T.InstancedBufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const s = new Float32Array(count * 4);
  for (let i = 0; i < s.length; i++) s[i] = Math.random();
  g.setAttribute("aSeed", new T.InstancedBufferAttribute(s, 4));
  g.instanceCount = count;
  const mat = new T.ShaderMaterial({
    uniforms: shared, transparent: true, depthWrite: false, fog: false,
    vertexShader: RAIN_COMMON + `
      uniform float uTime; uniform vec3 uCenter; uniform vec2 uWind; uniform float uGround; uniform float uMist;
      attribute vec4 aSeed;
      varying vec2 vUv; varying float vA; varying vec3 vCol; varying float vSeed;
      void main() {
        if (uMist < 0.003) { ${COLLAPSE} return; }
        float life = 9.0 + aSeed.z * 7.0;
        float cyc = uTime / life + aSeed.w * 11.0;
        float id = floor(cyc) + aSeed.x * 71.0;
        float ph = fract(cyc);
        float r = 6.0 + 38.0 * sqrt(rHash(id * 1.9));
        float th = rHash(id * 3.3) * 6.2831853;
        vec2 xz = uCenter.xz + vec2(cos(th), sin(th)) * r + uWind * (ph - 0.5) * life * 0.8;
        float h = rOccH(xz);
        float y = h > -1e4 ? h : uGround;
        vec3 c = vec3(xz.x, y - 0.3, xz.y);
        vec3 toCam = cameraPosition - c;
        float d = length(toCam);
        vec3 fwd = normalize(vec3(toCam.x, 0.0, toCam.z) + vec3(1e-4, 0.0, 0.0));
        vec3 side = vec3(fwd.z, 0.0, -fwd.x);
        float wdt = 3.0 + 4.0 * aSeed.y, hgt = 1.4 + 1.6 * aSeed.z;
        vec3 wp = c + side * position.x * wdt + vec3(0.0, position.y * hgt, 0.0);
        vUv = position.xy; vSeed = id;
        vA = uMist * sin(3.14159 * ph) * smoothstep(4.0, 9.0, d) * (1.0 - smoothstep(38.0, 48.0, d));
        vCol = rDropLight(c + vec3(0.0, 1.0, 0.0), -toCam / max(d, 1e-4), 0.5);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: RAIN_COMMON + `
      uniform float uTime;
      varying vec2 vUv; varying float vA; varying vec3 vCol; varying float vSeed;
      float n2(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(rHash2(i), rHash2(i + vec2(1.0, 0.0)), f.x), mix(rHash2(i + vec2(0.0, 1.0)), rHash2(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec2 q = vUv * vec2(2.0, 1.4) + vec2(vSeed * 3.1, -uTime * 0.05);
        float n = n2(q) * 0.6 + n2(q * 2.3 + 7.0) * 0.4;
        float shape = (1.0 - smoothstep(0.4, 1.0, abs(vUv.x))) * smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
        float a = vA * shape * smoothstep(0.25, 0.85, n);
        if (a < 0.002) discard;
        gl_FragColor = vec4(rOut(vCol), a);
      }`
  });
  mat.toneMapped = false;
  const mesh = new T.Mesh(g, mat);
  mesh.name = "rain-mist";
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.userData.shDry = true;
  mesh.userData.rainSkip = true;
  return mesh;
}
