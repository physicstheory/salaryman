// The character shader: patches for an ordinary MeshStandardMaterial, so three's lights, shadows, fog, image-based lighting and
// tone mapping all keep working, with the shading that people need on top of it.
//
// It reads all four PBR maps - albedo (map), normal (normalMap), roughness (ORM green) and ambient occlusion (ORM red) - and a skin
// mask (ORM blue; glTF's metalness slot, which no character uses). Models without a mask get one worked out per pixel from the colour.
//
// Per light (it replaces three's RE_Direct, so every directional, point and spot light, shadowed, goes through it):
//   skin   subsurface scattering as a wrapped, per-channel diffuse profile: red light travels furthest under skin, so the shadow edge
//          goes warm and soft instead of grey and hard, wider where the surface curves tightly (nose, ears, fingers); transmission
//          when a light is behind thin parts; and a two-lobe specular (a broad lobe plus a tight oily one, the way skin really reflects)
//   cloth  a sheen lobe (the "Charlie" distribution): fibres catch light at grazing angles, which is what makes wool and cotton read
//          as cloth instead of plastic
//   hair   Kajiya-Kay: two highlights stretched across the strands, the second tinted by the hair colour and shifted toward the tip
// Per pixel: pore-scale micro normals on skin that fade out with distance, and rain wetness (darker cloth, glossier everything).

export const CHAR_COMMON = /* glsl */ `
uniform vec3 chSSSColor;
uniform float chSSSWidth, chTrans, chSheen, chSpec2, chWet, chDetail, chDetailScale, chKind, chHasMask, chHairShift;
uniform sampler2D chPores;
float chSkin = 0.0;
float chCurv = 0.0;
float chCloth = 0.0;
vec3 chHairT = vec3(0.0, 1.0, 0.0);
vec3 chAlbedo = vec3(0.5);
float chSkinFromColour(vec3 lin) {
  vec3 c = pow(max(lin, vec3(0.0)), vec3(1.0 / 2.2)) * 255.0;
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  float cb = 128.0 - 0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b;
  float cr = 128.0 + 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b;
  float m = smoothstep(74.0, 80.0, cb) * (1.0 - smoothstep(124.0, 130.0, cb)) * smoothstep(130.0, 136.0, cr) * (1.0 - smoothstep(172.0, 178.0, cr));
  m *= smoothstep(60.0, 90.0, y) * smoothstep(0.24, 0.32, (c.r - c.b) / max(c.r, 1.0));
  return m;
}
`;

export const CHAR_BRDF = /* glsl */ `
float chSheenD(float r, float nh) { float inv = 1.0 / max(r, 0.07); float s2 = max(1.0 - nh * nh, 0.0078125); return (2.0 + inv) * pow(s2, inv * 0.5) / (2.0 * PI); }
float chSheenV(float nl, float nv) { return clamp(1.0 / (4.0 * (nl + nv - nl * nv)), 0.0, 1.0); }
void RE_Direct_Char(const in IncidentLight dl, const in GeometricContext g, const in PhysicalMaterial m, inout ReflectedLight rl) {
  vec3 N = g.normal, V = g.viewDir, L = dl.direction;
  float ndl = dot(N, L);
  float nl = saturate(ndl), nv = saturate(dot(N, V));
  vec3 C = dl.color;
  #ifndef PHYSICALLY_CORRECT_LIGHTS
    C *= PI;
  #endif
  // diffuse: Lambert, or for skin a wrapped profile per colour channel (red widest), energy kept
  vec3 w = chSkin * chSSSWidth * (1.0 + chCurv * 2.0) * vec3(1.0, 0.42, 0.26);
  vec3 wrapD = saturate((vec3(ndl) + w) / ((1.0 + w) * (1.0 + w)));
  vec3 tint = mix(vec3(1.0), mix(vec3(1.0), chSSSColor, 0.35), chSkin * (1.0 - nl) * (1.0 - nl));
  rl.directDiffuse += C * wrapD * tint * BRDF_Diffuse_Lambert(m.diffuseColor);
  if (chSkin > 0.0) {
    // light passing through thin flesh (ears, nostrils, fingers) toward the eye
    vec3 Lt = normalize(L + N * 0.35);
    float tr = pow(saturate(dot(V, -Lt)), 4.0) * (0.35 + chCurv) * chTrans;
    rl.directDiffuse += C * tr * chSkin * chSSSColor * m.diffuseColor * RECIPROCAL_PI;
  }
  vec3 spec;
  if (chKind > 1.5) {
    // hair: Kajiya-Kay, two lobes along the strand direction
    vec3 H = normalize(L + V);
    vec3 T1 = normalize(chHairT + N * (chHairShift - 0.12)), T2 = normalize(chHairT + N * (chHairShift + 0.18));
    float d1 = dot(T1, H), d2 = dot(T2, H);
    float s1 = pow(sqrt(max(1.0 - d1 * d1, 0.0)), 180.0), s2 = pow(sqrt(max(1.0 - d2 * d2, 0.0)), 36.0);
    spec = (vec3(0.11) * s1 + chAlbedo * 0.4 * s2) * smoothstep(-0.1, 0.25, ndl);
    rl.directSpecular += C * spec;
    return;
  }
  spec = BRDF_Specular_GGX(dl, V, N, m.specularColor, m.specularRoughness);
  if (chSkin > 0.0) {
    vec3 tight = BRDF_Specular_GGX(dl, V, N, m.specularColor, max(m.specularRoughness * 0.5, 0.08));
    spec = mix(spec, spec * 0.8 + tight * chSpec2, chSkin);
  }
  rl.directSpecular += C * nl * spec;
  if (chCloth > 0.0) {
    vec3 H = normalize(L + V);
    float sh = chSheenD(m.specularRoughness, saturate(dot(N, H))) * chSheenV(nl, nv);
    rl.directSpecular += C * nl * sh * chCloth * chSheen * mix(vec3(0.04), sqrt(max(chAlbedo, vec3(0.0))), 0.6);
  }
}
#undef RE_Direct
#define RE_Direct RE_Direct_Char
`;

// after <roughnessmap_fragment>: the skin mask, the cloth weight, wetness
export const CHAR_SURFACE = /* glsl */ `
  chAlbedo = diffuseColor.rgb;
  #ifdef USE_ROUGHNESSMAP
    chSkin = chHasMask > 0.5 ? texelRoughness.b : chSkinFromColour(diffuseColor.rgb);
  #else
    chSkin = chSkinFromColour(diffuseColor.rgb);
  #endif
  if (chKind > 1.5) chSkin = 0.0;
  roughnessFactor = mix(roughnessFactor, max(roughnessFactor, 0.46), chSkin);   // skin is never lacquer: its gloss is the second lobe's job
  chCloth = (1.0 - chSkin) * smoothstep(0.55, 0.85, roughnessFactor) * step(chKind, 1.5);
  // rain: water fills the weave (darker cloth, a little darker hair), and everything wet is glossier
  if (chWet > 0.001) {
    float soak = chWet * mix(1.0, 0.35, chSkin);
    diffuseColor.rgb *= mix(1.0, 0.62, soak * (1.0 - chSkin));
    roughnessFactor = mix(roughnessFactor, min(roughnessFactor, mix(0.3, 0.22, chSkin)), soak);
  }
  chCurv = 0.0;
`;

// after <normal_fragment_maps>: pores and fine skin relief, fading out before they alias; curvature for the scattering width;
// the hair strand direction from the card's UVs
export const CHAR_NORMAL = /* glsl */ `
  #ifdef USE_UV
  {
    vec2 duv = fwidth(vUv);
    #ifdef TANGENTSPACE_NORMALMAP
      if (chSkin > 0.01 && chDetail > 0.0) {
        vec2 puv = vUv * chDetailScale;
        float fade = 1.0 - smoothstep(0.25, 1.0, max(duv.x, duv.y) * chDetailScale * 48.0);
        if (fade > 0.0) {
          vec3 pn = texture2D(chPores, puv).xyz * 2.0 - 1.0;
          pn.xy *= chDetail * chSkin * fade;
          normal = perturbNormal2Arb(-vViewPosition, normal, normalize(pn), faceDirection);
        }
      }
    #endif
    vec3 dN = fwidth(normal), dP = fwidth(vViewPosition);
    chCurv = clamp(length(dN) / max(length(dP), 1e-4) * 0.012, 0.0, 1.0);
    if (chKind > 1.5) {
      // strands run along the cards' V direction
      vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
      vec2 dux = dFdx(vUv), duy = dFdy(vUv);
      float det = dux.x * duy.y - duy.x * dux.y;
      vec3 B = (dpy * dux.x - dpx * duy.x) * sign(det);
      chHairT = normalize(B - normal * dot(B, normal) + vec3(1e-5));
    }
  }
  #endif
`;
