// Where the rain lands: crown splashes with flying secondary droplets, and water dripping off the edges of roofs,
// awnings and bridges.
//
// Splashes are placed on the GPU on whatever the occlusion map says is uppermost (a roof, the top of a parked car,
// a kerb, the road), packed densely near the camera where you can see them and thinning out with distance. Each
// one is a camera-facing card whose crown, rim and droplets are drawn analytically in the fragment shader, so a
// thousand of them is one cheap draw. Drips search the height map for edges with a drop below them and fall off
// those edges under gravity; they keep going for a while after the rain stops, as long as things are wet.

import { RAIN_COMMON, COLLAPSE } from "./RainShaders.js";

function cardGeometry(T, count) {
  const g = new T.InstancedBufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const s = new Float32Array(count * 4);
  for (let i = 0; i < s.length; i++) s[i] = Math.random();
  g.setAttribute("aSeed", new T.InstancedBufferAttribute(s, 4));
  g.instanceCount = count;
  return g;
}

export function makeSplashes(T, count, shared) {
  const U = Object.assign({}, shared, { uR: { value: 18 } });
  const mat = new T.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, fog: false, side: T.DoubleSide,
    vertexShader: RAIN_COMMON + `
      uniform float uTime; uniform vec3 uCenter; uniform float uAmount; uniform float uR; uniform float uPix;
      uniform float uGround; uniform float uIntensity; uniform float uSplashK;
      attribute vec4 aSeed;
      varying vec2 vUv; varying float vPh; varying float vId; varying vec3 vCol; varying float vA;
      void main() {
        if (aSeed.w > uAmount) { ${COLLAPSE} return; }
        float period = 0.22 + aSeed.z * 0.5;
        float cyc = uTime / period + aSeed.w * 17.0;
        float id = floor(cyc);
        float life = 0.42;          // the visible part of each cycle
        vPh = fract(cyc) / life;
        if (vPh > 1.0) { ${COLLAPSE} return; }
        vId = id + aSeed.x * 113.0;
        // dense near the camera, thinning out with distance
        float r = uR * pow(rHash(vId * 1.31 + 0.7), 0.85);
        float th = rHash(vId * 2.17 + 3.1) * 6.2831853;
        vec2 xz = uCenter.xz + vec2(cos(th), sin(th)) * r;
        float h = rOccH(xz);
        float y = h > -1e4 ? h : uGround;
        vec3 c = vec3(xz.x, y + 0.004, xz.y);
        vec3 toCam = cameraPosition - c;
        float d = length(toCam);
        // a card standing upright, turned to face the viewer
        vec3 fwd = normalize(vec3(toCam.x, 0.0, toCam.z) + vec3(1e-4, 0.0, 0.0));
        vec3 side = vec3(fwd.z, 0.0, -fwd.x);
        float dmm = 0.8 + 2.2 * rHash(vId * 5.3);
        float s = (0.022 + 0.05 * sqrt(clamp(vPh, 0.0, 1.0))) * (0.6 + 0.25 * dmm) * uSplashK;
        float sPix = uPix * d * 2.5;
        float cover = s / max(s, sPix);
        s = max(s, sPix);
        vUv = position.xy * vec2(1.0, 1.4);
        vec3 wp = c + side * position.x * s + vec3(0.0, 1.0, 0.0) * position.y * s * 1.4;
        vA = uIntensity * cover * (1.0 - smoothstep(uR * 0.55, uR, d)) * smoothstep(0.3, 1.0, d);
        vCol = rDropLight(c + vec3(0.0, 0.05, 0.0), -toCam / max(d, 1e-4), 1.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: RAIN_COMMON + `
      varying vec2 vUv; varying float vPh; varying float vId; varying vec3 vCol; varying float vA;
      void main() {
        float ph = clamp(vPh, 0.0, 1.0);
        float x = abs(vUv.x), y = vUv.y;
        // the crown: a thin flared sheet of water, brightest along its rim
        float grow = min(ph * 1.6, 1.0);
        float hgt = 0.95 * sin(3.14159 * min(ph * 1.15, 1.0)) * (0.6 + 0.4 * rHash(vId));
        float rim = 0.25 + 0.55 * grow;
        float yy = clamp(y / max(hgt, 1e-3), 0.0, 1.0);
        float cupX = mix(rim * 0.55, rim, yy * yy);
        float wall = smoothstep(0.07, 0.0, abs(x - cupX)) * step(y, hgt) * (0.25 + 0.75 * yy);
        // spikes along the rim that pinch off into droplets
        float spikes = smoothstep(0.06, 0.0, abs(y - hgt)) * step(x, rim + 0.04) * (0.5 + 0.5 * sin(vUv.x * 40.0 + vId));
        // the flat spray sheet skimming outwards at the base
        float base = smoothstep(0.06, 0.0, y) * smoothstep(rim + 0.35, rim, x) * (1.0 - ph);
        // secondary droplets thrown up and out on ballistic paths
        float drops = 0.0;
        for (int i = 0; i < 6; i++) {
          float fi = float(i);
          float ang = rHash(vId * 3.7 + fi * 1.9) * 6.2831853;
          float spd = 0.6 + 0.6 * rHash(vId * 1.3 + fi * 7.1);
          vec2 dp = vec2(cos(ang) * spd * ph * 1.3, (1.7 * spd * ph - 1.9 * ph * ph) * 1.1 + 0.15 * ph);
          float dd = length(vUv - dp);
          drops += smoothstep(0.075, 0.02, dd) * step(0.0, dp.y);
        }
        float a = (wall * 1.2 + spikes * 0.8 + base * 0.6 + drops * 1.4) * pow(1.0 - ph, 1.2) * vA;
        if (a < 0.003) discard;
        gl_FragColor = vec4(rOut(vCol * 1.2), min(a, 1.0));
      }`
  });
  mat.toneMapped = false;
  const mesh = new T.Mesh(cardGeometry(T, count), mat);
  mesh.name = "rain-splashes";
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;
  mesh.userData.shDry = true;
  mesh.userData.rainSkip = true;
  return mesh;
}

export function makeDrips(T, count, shared) {
  const U = Object.assign({}, shared, { uDripR: { value: 20 }, uTexel: { value: 0.16 } });
  const mat = new T.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, fog: false, side: T.DoubleSide,
    vertexShader: RAIN_COMMON + `
      uniform float uTime; uniform vec3 uCenter; uniform float uDrip; uniform float uDripR; uniform float uPix;
      uniform float uTexel; uniform vec3 uCamVel; uniform float uShutter; uniform float uIntensity;
      attribute vec4 aSeed;
      varying vec2 vQ; varying vec3 vCol; varying float vA;
      void main() {
        if (aSeed.w > uDrip || rOccOn < 0.5) { ${COLLAPSE} return; }
        float period = 1.1 + aSeed.z * 1.4;
        float cyc = uTime / period + aSeed.y * 31.0;
        float id = floor(cyc) + aSeed.x * 977.0;
        float t = fract(cyc) * period;
        // look for an edge: a point that is low next to one that is high (the drip hangs just off the high edge)
        vec2 found = vec2(0.0); float top = 0.0, bottom = 0.0; float ok = 0.0;
        for (int k = 0; k < 4; k++) {
          if (ok > 0.5) break;
          float fk = float(k);
          float r = uDripR * sqrt(rHash(id * 1.7 + fk * 3.3));
          float th = rHash(id * 2.9 + fk * 5.1) * 6.2831853;
          vec2 c = uCenter.xz + vec2(cos(th), sin(th)) * r;
          float hc = rOccH(c);
          if (hc < -1e4) continue;
          float st = uTexel * 2.0;
          vec2 dirs[4];
          dirs[0] = vec2(st, 0.0); dirs[1] = vec2(-st, 0.0); dirs[2] = vec2(0.0, st); dirs[3] = vec2(0.0, -st);
          for (int j = 0; j < 4; j++) {
            float hn = rOccH(c + dirs[j]);
            if (hn - hc > 0.9 && hn - hc < 40.0) { found = c + dirs[j] * 0.35; top = hn - 0.02; bottom = hc; ok = 1.0; break; }
          }
        }
        if (ok < 0.5) { ${COLLAPSE} return; }
        // hang for a moment, then fall under gravity
        float hang = 0.25 + 0.3 * rHash(id * 4.1);
        float tf = max(t - hang, 0.0);
        float y = top - 4.9 * tf * tf;
        if (y < bottom) { ${COLLAPSE} return; }
        vec3 p = vec3(found.x, y, found.y);
        vec3 vel = vec3(0.0, -9.8 * tf - 0.05, 0.0);
        vec3 vr = vel - uCamVel;
        float sp = max(length(vr), 0.2);
        vec3 axis = vr / sp;
        float len = max(sp * uShutter, 0.006);
        vec3 toCam = cameraPosition - p;
        float d = length(toCam);
        toCam /= max(d, 1e-4);
        vec3 side = cross(axis, toCam); float sl = length(side); side = sl > 1e-3 ? side / sl : vec3(1.0, 0.0, 0.0);
        float wPhys = 0.0035;
        float w = max(wPhys, uPix * d * 0.9);
        vec3 wp = p + side * position.x * w - axis * position.y * len;
        vA = uIntensity * (wPhys / w) * clamp(sqrt(wPhys * 40.0 / len), 0.25, 1.0) * 0.7 * smoothstep(0.3, 1.0, d) * (1.0 - smoothstep(uDripR * 0.7, uDripR, d));
        vQ = position.xy;
        vCol = rDropLight(p, -toCam, 1.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: RAIN_COMMON + `
      varying vec2 vQ; varying vec3 vCol; varying float vA;
      void main() {
        float a = vA * exp(-vQ.x * vQ.x * 3.0) * smoothstep(0.0, 0.1, vQ.y) * smoothstep(1.0, 0.6, vQ.y);
        if (a < 0.002) discard;
        gl_FragColor = vec4(rOut(vCol * 1.3), a);
      }`
  });
  mat.toneMapped = false;
  const mesh = new T.Mesh(cardGeometry(T, count), mat);
  mesh.name = "rain-drips";
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;
  mesh.userData.shDry = true;
  mesh.userData.rainSkip = true;
  return mesh;
}
