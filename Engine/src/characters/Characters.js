// Shigoto Characters: the engine's character-rendering layer. It takes any rigged person (glTF from Rocketbox, Tripo, Meshy, Mixamo,
// VRoid or a low-poly base) and makes it a hyper-realistic, physically shaded character:
//
//   - full PBR: albedo, normal, roughness and ambient occlusion maps on every material; maps a model lacks are synthesised from its
//     colour map (MapSynth), and every material missing an authored map is listed in report()
//   - the character shader (CharacterShader): subsurface-scattering skin with pores, two-lobe skin specular, cloth sheen, anisotropic
//     hair, wet eyes, rain wetness; all on MeshStandardMaterial so the game's lights, shadows, reflections and post chain apply
//   - curved-triangle subdivision (Subdivide) on the quality tiers that can afford it, so low-poly silhouettes go round
//   - hair cards with alpha-to-coverage where the renderer has MSAA, a hard cut-out where it has not
//
// It needs only THREE, so it works before (or without) the rest of the engine starting:
//   const chars = SHIGOTO.characters(THREE);           // one shared instance per THREE
//   chars.upgrade(gltf.scene, { quality: "high", hero: true });
//   chars.setWet(0.6);                                  // from the weather
//   chars.report();                                     // what every character is drawing with

import { CHAR_COMMON, CHAR_BRDF, CHAR_SURFACE, CHAR_NORMAL } from "./CharacterShader.js";
import { subdivideGeometry } from "./Subdivide.js";
import { synthesizeMaps } from "./MapSynth.js";

export const CHAR_QUALITY = {
  low:    { subdiv: 0, heroSubdiv: 0, pores: 0, synth: 0, synthSize: 256 },
  medium: { subdiv: 0, heroSubdiv: 0, pores: 1, synth: 1, synthSize: 512 },
  high:   { subdiv: 0, heroSubdiv: 1, pores: 1, synth: 1, synthSize: 1024 },
  ultra:  { subdiv: 1, heroSubdiv: 1, pores: 1, synth: 1, synthSize: 1024 }
};

// material kind from what a model calls it (Rocketbox, VRoid, Mixamo, Tripo and Meshy names), or from the build's extras
const KINDS = [
  [/opacity|hair|lash|brow|beard|moustache|short0|long0|bob0|ponytail|braid|afro/i, "hair"],
  [/glass|lens/i, "glass"],
  [/eye(?!lash|line|brow)|cornea|iris|sclera/i, "eye"],
  [/mouth|lip|teeth|tongue/i, "lip"],
  [/_head\b|head|face/i, "head"],
  [/skin|body|ears|fingernails/i, "skin"],
  [/shoe|boot|leather|belt/i, "leather"],
  [/cloth|top|bottom|shirt|suit|jacket|skirt|pant|trouser|dress|coat/i, "cloth"]
];
export function kindOf(mat) {
  const ex = mat.userData && mat.userData.shigoto;
  if (ex && ex.kind) return ex.kind === "skin-atlas" ? "skin" : ex.kind;
  for (const [re, k] of KINDS) if (re.test(mat.name || "")) return k;
  return "other";
}

function poreTexture(T, size = 256) {
  // a tiling field of pores (small round pits) over fine noise, as a tangent-space normal map
  const n = size * size, h = new Float32Array(n);
  let seed = 1337; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) h[i] = rnd() * 0.25;
  for (let p = 0; p < size * size / 18; p++) {
    const cx = rnd() * size, cy = rnd() * size, r = 0.8 + rnd() * 1.6, dep = 0.6 + rnd() * 0.8;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = (Math.floor(cx) + dx + size) % size, y = (Math.floor(cy) + dy + size) % size;
      const d = Math.hypot(Math.floor(cx) + dx - cx, Math.floor(cy) + dy - cy) / r;
      if (d < 1) h[y * size + x] -= dep * (1 - d * d);
    }
  }
  // soft criss-cross lines, the skin's surface grain
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    h[y * size + x] += 0.12 * Math.sin(u * 23 + v * 17) * Math.sin(u * 11 - v * 29);
  }
  const data = new Uint8Array(n * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (dx, dy) => h[((y + dy + size) % size) * size + ((x + dx + size) % size)];
    const gx = at(1, 0) - at(-1, 0), gy = at(0, 1) - at(0, -1);
    const nx = -gx * 0.9, ny = -gy * 0.9, l = Math.hypot(nx, ny, 1), o = (y * size + x) * 4;
    data[o] = (nx / l * 0.5 + 0.5) * 255; data[o + 1] = (ny / l * 0.5 + 0.5) * 255; data[o + 2] = (1 / l * 0.5 + 0.5) * 255; data[o + 3] = 255;
  }
  const t = new T.DataTexture(data, size, size, T.RGBAFormat);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

export class Characters {
  constructor(THREE, opts = {}) {
    this.T = THREE;
    this.quality = opts.quality || "high";
    this.msaa = !!opts.msaa;
    this.uniforms = {
      chSSSColor: { value: new THREE.Color(1.0, 0.32, 0.2) },
      chSSSWidth: { value: 0.45 },
      chTrans: { value: 0.55 },
      chSheen: { value: 1.0 },
      chSpec2: { value: 0.2 },
      chWet: { value: 0 },
      chDetail: { value: (CHAR_QUALITY[this.quality]||CHAR_QUALITY.high).pores?.55:0 },
      chPores: { value: null }
    };
    this.cache = new Map();         // source material -> character material
    this.geoCache = new WeakMap();  // geometry -> subdivided geometry
    this.missing = new Map();       // "model: material" -> [maps]
    this.synthesised = 0;
    this.upgraded = 0;
  }

  setQuality(q) { if (CHAR_QUALITY[q]) {this.quality=q;this.uniforms.chDetail.value=CHAR_QUALITY[q].pores?.55:0;} }
  setWet(v) { this.uniforms.chWet.value = Math.max(0, Math.min(1, v || 0)); }

  _pores() { return this.uniforms.chPores.value || (this.uniforms.chPores.value = poreTexture(this.T)); }

  // the character material for one source material
  material(src, opts = {}) {
    const T = this.T, Q = CHAR_QUALITY[opts.quality || this.quality] || CHAR_QUALITY.high;
    if (!src || src.isShaderMaterial || src.userData.shigotoChar) return src;
    const key = src.uuid + ":" + (opts.skinned ? 1 : 0) + ":" + (opts.quality || this.quality);
    if (this.cache.has(key)) return this.cache.get(key);
    const kind = kindOf(src);
    const m = new T.MeshStandardMaterial({
      name: src.name, color: src.color ? src.color.clone() : 0xffffff, map: src.map || null,
      normalMap: src.normalMap || null, normalScale: src.normalScale ? src.normalScale.clone() : new T.Vector2(1, 1),
      roughness: 1, roughnessMap: src.roughnessMap || null, metalness: 0,
      aoMap: src.aoMap || null, aoMapIntensity: src.aoMapIntensity ?? 1,
      envMap: src.envMap || null,
      emissive: src.emissive ? src.emissive.clone() : 0x000000, emissiveMap: src.emissiveMap || null,
      alphaMap: src.alphaMap || null, side: src.side, vertexColors: !!src.vertexColors,
      transparent: false, opacity: 1, alphaTest: 0
    });
    if (opts.skinned) m.skinning = true;
    // roughness: the map if there is one; otherwise the source's own value if it chose one, otherwise the kind's
    const given = src.roughness !== undefined && src.roughness < 0.89 ? src.roughness : null;
    const kindRough = { skin: 0.55, head: 0.55, lip: 0.32, eye: 0.06, hair: 0.45, leather: 0.36, cloth: 0.86, glass: 0.06, other: 0.7 }[kind];
    if (!m.roughnessMap) m.roughness = given ?? kindRough;
    // hair cards, lashes: cut-outs
    if (kind === "hair" || src.alphaTest > 0 || src.transparent && kind !== "glass") {
      m.alphaTest = Math.max(0.35, src.alphaTest || 0.42);
      m.side = T.DoubleSide;
      if (this.msaa && "alphaToCoverage" in m) { m.alphaToCoverage = true; m.alphaTest = 0.2; }
    }
    if (kind === "glass") { m.transparent = true; m.opacity = Math.min(src.opacity ?? 0.3, 0.35); m.roughness = 0.05; m.depthWrite = false; }
    // the maps it lacks
    const lacks = ["map", "normalMap", "roughnessMap", "aoMap"].filter(k => !m[k]);
    if (lacks.length && kind !== "glass" && kind !== "hair") {
      this.missing.set((opts.model || "?") + ": " + (src.name || "?"), lacks);
      if (Q.synth && m.map && m.map.image) {
        try {
          const s = synthesizeMaps(T, m, kind, { size: Q.synthSize });
          if (s.normal) { m.normalMap = s.normal; m.normalScale.set(1, 1); }    // built in UV space already
          if (s.orm) { if (!m.roughnessMap) { m.roughnessMap = s.orm; m.roughness = 1; } if (!m.aoMap) m.aoMap = s.orm; m.userData.synthMask = m.roughnessMap===s.orm; }
          this.synthesised++;
        } catch (e) { /* a texture we cannot read (cross-origin): the shader works without */ }
      }
    }
    const hasMask = !!(m.roughnessMap && (src.userData.shigoto && /skinMask/.test(src.userData.shigoto.orm || "") || m.userData.synthMask));
    const U = Object.assign({}, this.uniforms, {
      chKind: { value: kind === "hair" ? 2 : 0 },
      chAllowSkin: {value:["cloth","leather","hair","glass","eye"].includes(kind)?0:1},
      chHasMask: { value: hasMask ? 1 : 0 },
      chDetailScale: { value: kind === "head" ? 26 : 40 },
      chHairShift: { value: 0 }
    });
    if (Q.pores) this._pores();
    if (!this.uniforms.chPores.value) this._pores();
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n" + CHAR_COMMON)
        .replace("#include <lights_physical_pars_fragment>", "#include <lights_physical_pars_fragment>\n" + CHAR_BRDF)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" + CHAR_SURFACE)
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + CHAR_NORMAL);
    };
    m.customProgramCacheKey = () => "shigoto-char-v1-" + kind + (hasMask ? "-m" : "");
    m.extensions = Object.assign({}, m.extensions, { derivatives: true });
    m.envMapIntensity = kind === "eye" ? 1.0 : kind === "hair" ? 0.5 : 0.75;
    m.userData = { shigotoChar: true, charKind: kind, sss: kind === "skin" || kind === "head", pbrDone: true, pbr: "dielectric", shDry: true };
    const unresolved=["map","normalMap","roughnessMap","aoMap"].filter(k=>!m[k]);
    const reportKey=(opts.model||"?")+": "+(src.name||"?");
    if(kind!=="hair"&&kind!=="glass"&&unresolved.length)this.missing.set(reportKey,unresolved);else this.missing.delete(reportKey);
    this.cache.set(key, m);
    return m;
  }

  // Upgrade every mesh under root. opts: quality, hero (a close-up character: Seiko, the story's people), model (a name for the report)
  upgrade(root, opts = {}) {
    if (!root) return root;
    const T = this.T, q = opts.quality || this.quality, Q = CHAR_QUALITY[q] || CHAR_QUALITY.high;
    const level = opts.hero ? Q.heroSubdiv : Q.subdiv;
    root.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const sk = !!o.isSkinnedMesh;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      // three samples occlusion from a second UV set; a model with one set shares it
      if (o.geometry && o.geometry.attributes.uv && !o.geometry.attributes.uv2 && mats.some(m => m && m.aoMap)) o.geometry.setAttribute("uv2", o.geometry.attributes.uv);
      const out = mats.map(m => this.material(m, { skinned: sk, quality: q, model: opts.model }));
      o.material = Array.isArray(o.material) ? out : out[0];
      if(o.geometry?.attributes.uv&&!o.geometry.attributes.uv2&&out.some(m=>m?.aoMap))o.geometry.setAttribute("uv2",o.geometry.attributes.uv);
      o.userData.shDry = true;
      // curved subdivision: solid parts only (cut-out cards would bulge)
      if (level > 0 && sk && o.geometry.index && o.geometry.index.count/3*4<=80000 && !out.some(m => m.alphaTest > 0 || m.transparent) && !(o.geometry.userData && o.geometry.userData.shigotoSubdiv)) {
        let g = this.geoCache.get(o.geometry);
        if (g === undefined) {
          try { g = subdivideGeometry(T, o.geometry); } catch (e) { g = null; }
          this.geoCache.set(o.geometry, g);
        }
        if (g) { o.geometry = g; if (!g.attributes.uv2 && g.attributes.uv && out.some(m => m.aoMap)) g.setAttribute("uv2", g.attributes.uv); }
      }
    });
    this.upgraded++;
    root.userData.shigotoCharacter = { quality: q, hero: !!opts.hero };
    return root;
  }

  report() {
    const kinds = {};
    this.cache.forEach(m => { kinds[m.userData.charKind] = (kinds[m.userData.charKind] || 0) + 1; });
    return { characters: this.upgraded, materials: this.cache.size, kinds, synthesised: this.synthesised,
      missing: [...this.missing.entries()].map(([k, v]) => k + " (" + v.join(", ") + ")") };
  }
}

const _instances = new WeakMap();
export function characters(THREE, opts) {
  let c = _instances.get(THREE);
  if (!c) { c = new Characters(THREE, opts); _instances.set(THREE, c); }
  else if (opts) { if (opts.quality) c.setQuality(opts.quality); if (opts.msaa !== undefined) c.msaa = opts.msaa; }
  return c;
}

// Rigs from the AI tools and marketplaces use Mixamo-style bone names (Meshy, Tripo, Mixamo, most Sketchfab and CC0 packs) or VRM's;
// the game retargets onto 3ds Max Biped names (Bip01_*). This renames a skeleton in place so any of them drops straight in.
const BIPED = {
  hips: "Bip01_Pelvis", pelvis: "Bip01_Pelvis", spine: "Bip01_Spine", spine1: "Bip01_Spine0", spine2: "Bip01_Spine1", chest: "Bip01_Spine1", upperchest: "Bip01_Spine2",
  neck: "Bip01_Neck", head: "Bip01_Head",
  leftshoulder: "Bip01_L_Clavicle", leftarm: "Bip01_L_UpperArm", leftupperarm: "Bip01_L_UpperArm", leftforearm: "Bip01_L_Forearm", leftlowerarm: "Bip01_L_Forearm", lefthand: "Bip01_L_Hand",
  rightshoulder: "Bip01_R_Clavicle", rightarm: "Bip01_R_UpperArm", rightupperarm: "Bip01_R_UpperArm", rightforearm: "Bip01_R_Forearm", rightlowerarm: "Bip01_R_Forearm", righthand: "Bip01_R_Hand",
  leftupleg: "Bip01_L_Thigh", leftupperleg: "Bip01_L_Thigh", leftleg: "Bip01_L_Calf", leftlowerleg: "Bip01_L_Calf", leftfoot: "Bip01_L_Foot", lefttoebase: "Bip01_L_Toe0", lefttoes: "Bip01_L_Toe0",
  rightupleg: "Bip01_R_Thigh", rightupperleg: "Bip01_R_Thigh", rightleg: "Bip01_R_Calf", rightlowerleg: "Bip01_R_Calf", rightfoot: "Bip01_R_Foot", righttoebase: "Bip01_R_Toe0", righttoes: "Bip01_R_Toe0"
};
export function bipedNames(root) {
  let n = 0, has = false;
  root.traverse(o => { if (o.isBone && /^Bip01_/.test(o.name)) has = true; });
  if (has) return 0;
  root.traverse(o => {
    if (!o.isBone) return;
    const k = o.name.replace(/^.*[:|]/, "").replace(/^(J_Bip_C_|J_Bip_L_|J_Bip_R_)/, m => m === "J_Bip_L_" ? "left" : m === "J_Bip_R_" ? "right" : "").replace(/[_\s.-]/g, "").toLowerCase()
      .replace(/^l(?=(shoulder|upperarm|lowerarm|hand|upperleg|lowerleg|foot|toes)$)/, "left").replace(/^r(?=(shoulder|upperarm|lowerarm|hand|upperleg|lowerleg|foot|toes)$)/, "right");
    if (BIPED[k]) { o.userData.srcName = o.name; o.name = BIPED[k]; n++; }
  });
  return n;
}
