// Interior mapping for every city building: each window has a room behind it, with depth and parallax.
//
// The rooms are modelled and rendered in Blender (Tools/foundry/gen/rooms.py): 16 workplaces (open-plan office, meeting
// room, server room, call centre, clinic, gym, cram school, izakaya, karaoke...) and 16 homes (living rooms, kitchens,
// bedrooms, a washitsu, a student's room...), each a picture taken from 4 m outside the window looking straight in. The
// facade shader traces the eye ray through the glass into a box behind it and reads the picture where the ray lands, so
// the room's walls, floor and furniture shift with the camera as a real room would.
//
// Which room: the facade's window mask (Web/art/facades/<style>_win.png, baked with the facade) says where each opening
// is and how big. Every building and storey gets a tenant (from the building's position and the storey): workplace or
// home, a main room and a second one, its light colour, how many of its rooms are lit at night, blinds or curtains. Then
// every window picks between the tenant's rooms, may be mirrored, and has its own blind height. So each floor of each
// building is different, and two buildings side by side never match.
//
// Off switch: ?interiors=0 (or localStorage konto.interiors=0).
(function () {
  "use strict";
  let off = /[?&]interiors=0\b/.test(location.search);
  try { off = off || localStorage.getItem("konto.interiors") === "0"; } catch (e) { /* private window */ }
  if (off || typeof THREE === "undefined") return;

  // metres one facade texture covers, and the storey height in it (the Blender sections, Tools/foundry/gen/facades.py)
  const STYLES = {
    office: { size: [12.8, 16.0], storey: 4.0, home: 0.12 },
    glass:  { size: [12.8, 16.8], storey: 4.2, home: 0.06 },
    flats:  { size: [12.4, 12.4], storey: 3.1, home: 0.9 },
    civic:  { size: [14.0, 13.8], storey: 4.6, home: 0.04 }
  };
  const BASE = window.__interiorsBase || "";
  const I = window.interiors = { version: "1.0.0", styles: STYLES, patched: [] };
  const night = { get value() { return typeof nightState !== "undefined" ? nightState.lit : 0; } };
  const low = () => typeof gfx !== "undefined" && gfx.tier === "low";
  const loader = new THREE.TextureLoader();
  let atlases = null;

  function atlas(name) {
    const t = loader.load(BASE + "art/rooms/rooms_" + name + (low() ? "-low" : "") + ".jpg");
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    return t;
  }
  function winMask(style) {
    const t = loader.load(BASE + "art/facades/" + style + "_win.png");
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapNearestFilter;
    t.generateMipmaps = true;
    return t;
  }

  const VERT_HEAD = `
varying vec3 vIMPos; varying vec3 vIMN; varying vec3 vIMT; varying vec2 vIMSeed;`;
  const VERT_BODY = `
  {
    vec4 imP = vec4(transformed, 1.0);
    mat3 imM = mat3(modelMatrix);
    vIMSeed = vec2(0.0);
#ifdef USE_INSTANCING
    imP = instanceMatrix * imP;
    imM = imM * mat3(instanceMatrix);
    vIMSeed = instanceMatrix[3].xz;
#endif
    vIMPos = (modelMatrix * imP).xyz;
    vIMN = normalize(imM * objectNormal);
    vIMT = normalize(imM * cross(vec3(0.0, 1.0, 0.0), objectNormal));
  }`;
  const FRAG_HEAD = `
uniform sampler2D imWin; uniform sampler2D imWork; uniform sampler2D imHome;
uniform vec2 imSize; uniform float imStorey; uniform float imHomeShare; uniform float imNight; uniform float imRes;
varying vec3 vIMPos; varying vec3 vIMN; varying vec3 vIMT; varying vec2 vIMSeed;
float imH(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
vec3 imRoom(sampler2D A, float idx, vec2 img, float lod) {
  vec2 cell = vec2(mod(idx, 4.0), 3.0 - floor(idx / 4.0));
  vec2 uv = (cell + clamp(img, 0.004, 0.996)) * 0.25;
  vec3 c = texture2DLodEXT(A, uv, lod).rgb;
  return c * c;   // sRGB to linear, near enough
}`;
  const FRAG_BODY = `
  {
    vec4 imW = texture2D(imWin, vUv);
    if (imW.a > 0.02 && abs(vIMN.y) < 0.5) {
      vec2 wm = max(vec2(imW.b, imW.a) * 6.4, vec2(0.4));
      // where in the opening, exact inside the mask's texel
      vec2 loc = clamp(imW.rg + (fract(vUv * imRes) - 0.5) / imRes * imSize / wm, 0.0, 1.0);
      vec2 cen = vUv - (loc - 0.5) * wm / imSize;                 // the opening's centre, in texture repeats
      float bot = (vUv.y - loc.y * wm.y / imSize.y) * imSize.y;   // its sill, in metres up the facade
      float storey = floor(bot / imStorey + 0.01);
      vec2 seed = floor(vIMSeed * 0.5);
      vec3 win = vec3(floor(cen * 24.0 + 0.5), storey);
      // the tenant of this storey of this building, and this window
      float t0 = imH(vec3(seed, storey * 7.13 + 1.0)), t1 = imH(vec3(seed + 17.0, storey * 3.7 + 5.0)), t2 = imH(vec3(seed - 9.0, storey * 1.3 + 11.0));
      float w0 = imH(win + vec3(seed, 3.0)), w1 = imH(win + vec3(seed, 19.0)), w2 = imH(win + vec3(seed, 41.0));
      float home = step(t0, imHomeShare);
      float rA = floor(t1 * 16.0), rB = floor(t2 * 16.0);
      float idx = w0 < 0.62 ? rA : (w0 < 0.92 ? rB : floor(w1 * 16.0));
      float mirror = step(0.5, w1);
      // the ray from the eye, in the window's frame: x across, y up, z into the building
      vec3 V = normalize(vIMPos - cameraPosition);
      vec3 N = normalize(vIMN), T = normalize(vIMT), Bt = cross(N, T);
      vec3 d = vec3(dot(V, T), dot(V, Bt), -dot(V, N));
      // the room: wider than the opening, a little taller, 3.5..6 m deep
      float rw = max(wm.x + 1.0, 3.0 + t1);
      float rh = max(2.8, wm.y + 0.05);
      float rd = 3.5 + 2.5 * t2;
      vec3 o = vec3((0.5 * (rw - wm.x) + loc.x * wm.x) / rw, (clamp(2.62 - wm.y, 0.0, 1.2) + loc.y * wm.y) / rh, 0.0);
      vec3 rdir = vec3(d.x / rw, d.y / rh, max(d.z, 0.02) / rd);
      if (mirror > 0.5) { o.x = 1.0 - o.x; rdir.x = -rdir.x; }
      vec3 tt = (step(0.0, rdir) - o) / rdir;
      float t = min(min(tt.x, tt.y), tt.z);
      vec3 p = o + rdir * t;
      vec2 img = 0.5 + (p.xy - 0.5) / (1.0 + p.z);
      float lod = clamp(log2(max(length(dFdx(vUv)), length(dFdy(vUv))) * imSize.x * 512.0 / rw), 0.0, 9.0);
      vec3 room = home > 0.5 ? imRoom(imHome, idx, img, lod) : imRoom(imWork, idx, img, lod);
      // light: warm homes, cooler offices; a share of rooms lit at night, the rest dark
      vec3 tint = home > 0.5 ? mix(vec3(1.0, 0.82, 0.62), vec3(1.0, 0.92, 0.8), t2) : mix(vec3(0.92, 0.96, 1.0), vec3(1.0, 0.9, 0.74), step(0.7, t2));
      float litShare = home > 0.5 ? 0.35 + 0.4 * t1 : (t0 < 0.25 ? 0.1 : 0.45 + 0.45 * t2);
      float lit = step(w2, litShare);
      float day = 0.5 + 0.25 * t0;
      vec3 inside = room * mix(vec3(day), tint * mix(0.012, 1.25, lit), imNight);
      // blinds (offices: venetian, homes: curtains), drawn on the inside of the glass
      float bl = home > 0.5 ? 0.0 : clamp((w1 * 1.3 - 0.35) * step(0.4, t0), 0.0, 0.92);
      if (loc.y > 1.0 - bl) {
        float s = fract(loc.y * wm.y / 0.026);
        vec3 slat = vec3(0.70, 0.70, 0.67) * (0.55 + 0.45 * smoothstep(0.0, 0.5, s) * smoothstep(1.0, 0.7, s));
        inside = slat * mix(vec3(day * 0.9), tint * mix(0.01, 0.55, lit), imNight);
      }
      float cw = home > 0.5 ? (0.1 + 0.35 * w2) * step(0.3, w0) : 0.0;
      if (loc.x < cw || loc.x > 1.0 - cw * (0.6 + 0.8 * w1)) {
        vec3 cc = mix(vec3(0.82, 0.78, 0.7), mix(vec3(0.55, 0.62, 0.7), vec3(0.75, 0.62, 0.52), t1), step(0.5, t0));
        float fold = 0.78 + 0.22 * sin(loc.x * wm.x * 38.0 + w0 * 6.0);
        inside = cc * fold * mix(vec3(day * 0.8), tint * mix(0.01, 0.7, lit), imNight);
      }
      // the glass: dark, reflective (its roughness map keeps it smooth), the room behind it through the Fresnel
      float F = 0.04 + 0.96 * pow(1.0 - clamp(abs(d.z), 0.0, 1.0), 5.0);
      float m = smoothstep(0.02, 0.06, imW.a);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012), m);
      totalEmissiveRadiance = mix(totalEmissiveRadiance, inside * (1.0 - F), m);
    }
  }`;

  function patch(side, style) {
    if (!side || !side.isMeshStandardMaterial || side.userData.interiors) return;
    const S = STYLES[style];
    if (!atlases) atlases = { work: atlas("work"), home: atlas("home") };
    side.userData.interiors = style;
    const win = winMask(style);
    const prev = side.onBeforeCompile, prevKey = side.customProgramCacheKey;
    side.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      Object.assign(sh.uniforms, {
        imWin: { value: win }, imWork: { value: atlases.work }, imHome: { value: atlases.home },
        imSize: { value: new THREE.Vector2(S.size[0], S.size[1]) }, imStorey: { value: S.storey },
        imHomeShare: { value: S.home }, imNight: night, imRes: { value: 1024 }
      });
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>" + VERT_HEAD)
        .replace("#include <fog_vertex>", "#include <fog_vertex>" + VERT_BODY);
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>" + FRAG_HEAD)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>" + FRAG_BODY);
    };
    side.customProgramCacheKey = () => (prevKey ? prevKey.call(side) : "") + "|interiors-" + style;
    side.needsUpdate = true;
    I.patched.push(style);
  }

  // facadeMaterials(style) builds (and caches) the material set of a city style; the walls are mats[0].
  if (typeof window.facadeMaterials === "function") {
    const orig = window.facadeMaterials;
    window.facadeMaterials = function (style) {
      const set = orig.apply(this, arguments);
      try {
        const ok = typeof renderer === "undefined" || renderer.capabilities.isWebGL2;
        if (ok && STYLES[style] && set && set.mats && !(typeof gameSet !== "undefined" && gameSet.drawnFacades)) patch(set.mats[0], style);
      } catch (e) { console.warn("[interiors] could not fit " + style, e); }
      return set;
    };
  }
  I.patch = patch;
})();
