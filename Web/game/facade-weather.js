// Facade weathering: the coat of a real city on every street building (2026-11-20).
//
// The facades (konto.html facadeMaterial, one material per style, shared by every building of that style) were clean
// repeats of one texture: every storey the same, every building of a style the same shade, no ground dirt, no rain marks.
// This patches those materials' shaders (chained after the game's own and the realism engine's window patch) with:
//   - per-building variation: each building (found from its world position) gets its own slightly different paint
//     tone and age, so a row of one style no longer reads as copies
//   - rain streaks: dark vertical runs from under each storey's sills and from the parapet, broken up by noise
//   - ground grime: splash-back and dirt along the first metre, darker in the corners
//   - large stains and sun bleaching: soft patches a few metres across, lighter near the top where the sun hits
//   - roughness to match: dirty plaster rougher, streaks slightly smoother where water runs
// All of it is a few noise lookups per pixel, no textures, so it costs no video memory (fine on Iris Xe).
// Off switch: ?weather=0 is the weather engine's; this one is ?facadecoat=0. Console: facadeCoat.report().
(function () {
  "use strict";
  let off = false;
  try { off = new URLSearchParams(location.search).get("facadecoat") === "0"; } catch (e) { /* no query */ }
  const FC = window.facadeCoat = { on: !off, patched: new Set(), strength: { value: 1.0 } };
  if (off) return;

  const VERT_HEAD = "varying vec3 vFcW; varying vec3 vFcN; varying float vFcH;\n";
  const VERT_BODY = [
    "{",
    "  vec4 fcw = vec4(transformed, 1.0);",
    "  vec3 fcn = objectNormal;",
    "  #ifdef USE_INSTANCING",
    "    fcw = instanceMatrix * fcw; fcn = mat3(instanceMatrix) * fcn;",
    "  #endif",
    "  fcw = modelMatrix * fcw;",
    "  vFcW = fcw.xyz; vFcN = normalize(mat3(modelMatrix) * fcn);",
    "  #ifdef USE_UV",
    "    vFcH = uv.y * max(1.0, aTile.z);",
    "  #else",
    "    vFcH = 0.0;",
    "  #endif",
    "}"
  ].join("\n");
  const FRAG_HEAD = [
    "varying vec3 vFcW; varying vec3 vFcN; varying float vFcH; uniform float uFcStrength;",
    "float fcH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float fcN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(fcH(i), fcH(i + vec2(1.0, 0.0)), f.x), mix(fcH(i + vec2(0.0, 1.0)), fcH(i + vec2(1.0, 1.0)), f.x), f.y); }",
    "float fcF(vec2 p) { return fcN(p) * 0.55 + fcN(p * 2.03 + 17.1) * 0.3 + fcN(p * 4.1 + 3.7) * 0.15; }",
    "float fcGrime = 0.0;"
  ].join("\n");
  const FRAG_BODY = [
    "{",
    "  vec3 n = normalize(vFcN);",
    "  if (abs(n.y) < 0.5) {",
    "    float along = abs(n.x) > abs(n.z) ? vFcW.z : vFcW.x;",
    "    // a building's own identity: the 14 m cell its wall stands in, hashed",
    "    vec2 bid = floor(vFcW.xz / 14.0);",
    "    float age = fcH(bid + 3.1), tone = fcH(bid + 7.7) - 0.5;",
    "    float k = uFcStrength * (0.55 + 0.6 * age);",
    "    // rain streaks: thin vertical runs that start under each storey's sill and fade downwards",
    "    float storey = fract(vFcH);",
    "    float run = pow(fcN(vec2(along * 3.1, floor(vFcH) * 5.3)), 3.0);",
    "    float under = smoothstep(1.0, 0.55, storey) * smoothstep(0.0, 0.12, storey);",
    "    float streak = run * under * (0.6 + 0.4 * fcN(vec2(along * 11.0, vFcW.y * 0.6)));",
    "    // ground grime: splash-back on the first metre and a half, ragged at the top",
    "    float base = clamp(vFcH, 0.0, 9.0);",
    "    float ground = smoothstep(0.45 + 0.12 * fcN(vec2(along * 1.7, 2.0)), 0.0, base) ;",
    "    // big soft stains and sun bleaching",
    "    float stain = smoothstep(0.55, 0.85, fcF(vec2(along, vFcW.y) * 0.18 + bid));",
    "    float bleach = smoothstep(2.0, 8.0, base) * 0.5 + 0.5 * fcF(vec2(along, vFcW.y) * 0.05 + bid * 1.7);",
    "    fcGrime = clamp(streak * 0.55 + ground * 0.6 + stain * 0.25, 0.0, 1.0) * k;",
    "    vec3 c = diffuseColor.rgb;",
    "    c *= 1.0 + tone * 0.16;                                   // this building's own shade",
    "    c = mix(c, c * vec3(0.93, 0.95, 0.98) + 0.03, bleach * 0.25 * k);",
    "    c = mix(c, c * vec3(0.52, 0.5, 0.47), fcGrime);",
    "    diffuseColor.rgb = c;",
    "  }",
    "}"
  ].join("\n");
  const ROUGH_BODY = "\n#ifdef USE_ROUGHNESSMAP\n#endif\n roughnessFactor = clamp(roughnessFactor + fcGrime * 0.18, 0.0, 1.0);\n";

  function patch(m) {
    if (!m || FC.patched.has(m) || m.userData.glassy) return;
    FC.patched.add(m);
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      if (!/#include <map_fragment>/.test(sh.fragmentShader) || !/#include <project_vertex>/.test(sh.vertexShader) || !/attribute vec3 aTile/.test(sh.vertexShader)) return;
      sh.uniforms.uFcStrength = FC.strength;
      sh.vertexShader = VERT_HEAD + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n" + VERT_BODY);
      sh.fragmentShader = FRAG_HEAD + "\n" + sh.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n" + FRAG_BODY);
      if (/#include <roughnessmap_fragment>/.test(sh.fragmentShader)) sh.fragmentShader = sh.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>" + ROUGH_BODY);
    };
    m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(m) : "") + "|fcoat"; };
    m.needsUpdate = true;
  }
  function sweep() {
    if (typeof facadeCache === "undefined") return 0;
    let n = 0;
    for (const style of Object.keys(facadeCache)) {
      if (style === "glass" || style === "deck" || style === "highway") continue;
      const e = facadeCache[style]; if (!e || !e.mats) continue;
      const side = e.mats[0]; if (side && !FC.patched.has(side)) { patch(side); n++; }
    }
    return n;
  }
  FC.sweep = sweep;
  FC.report = () => ({ on: FC.on, materials: FC.patched.size, strength: FC.strength.value });
  const tickOrig = window.tick;
  let t = 0;
  if (typeof tickOrig === "function") window.tick = function (dt) {
    const r = tickOrig.apply(this, arguments);
    try { t -= dt || 0.016; if (t <= 0) { t = 2; sweep(); } } catch (e) { console.warn("[Konto] facade coat:", e); }
    return r;
  };
  console.log("[Konto] facade coat 1.0 · streaks, grime and age on every street building");
})();
