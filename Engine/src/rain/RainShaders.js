// GLSL shared by every part of the rain engine.
//
// RAIN_COMMON: hashing, the rain occlusion height map (what is overhead at any point near the camera), and the
// light a raindrop picks up: the sky it refracts, the sun it glints in, the street lamps and neon it catches when
// they are behind it (drops scatter light forward, which is why rain only "appears" around lights at night), and
// lightning. Colours are computed in linear HDR; uDisplay = 1 converts to display colour for hosts that draw
// straight to the screen, uDisplay = 0 leaves linear light for hosts with their own HDR chain (glints then bloom).

export const MAX_RAIN_LIGHTS = 8;

export const RAIN_COMMON = /* glsl */ `
uniform sampler2D rOcc;
uniform vec4 rOccInfo;   // x, z of the map's centre, its size in metres, the height everything in it is stored against
uniform float rOccOn;
uniform vec3 rAmb;       // light a drop refracts from all around (sky, overcast, city glow), linear
uniform vec3 rSun;       // direct sun or moon colour, linear
uniform vec3 rSunDir;    // towards the sun
uniform float rFlash;    // lightning 0..1
uniform vec4 rLP[${MAX_RAIN_LIGHTS}];  // lamp position and reach
uniform vec3 rLC[${MAX_RAIN_LIGHTS}];  // lamp colour * intensity, linear
uniform vec4 rLD[${MAX_RAIN_LIGHTS}];  // spotlight direction and cosine of its cone (-2 for a lamp that shines all round)
uniform int rLN;
uniform float rDisplay;

float rHash(float n) { return fract(sin(n) * 43758.5453123); }
float rHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// The highest surface above (x, z): roofs, awnings, bridges, car tops, the ground itself. -1e5 when unknown.
float rOccH(vec2 xz) {
  if (rOccOn < 0.5) return -1e5;
  vec2 uv = vec2(xz.x - rOccInfo.x, -(xz.y - rOccInfo.y)) / rOccInfo.z + 0.5;
  if (uv.x < 0.002 || uv.y < 0.002 || uv.x > 0.998 || uv.y > 0.998) return -1e5;
  float h = texture2D(rOcc, uv).r;
  return h < -900.0 ? -1e5 : h + rOccInfo.w;
}

// What a drop at p shows the viewer: forward-scattered lamp light, sun glint, the refracted surroundings.
vec3 rDropLight(vec3 p, vec3 V, float glint) {
  vec3 col = rAmb * 1.6;
  float fs = max(dot(V, rSunDir), 0.0);
  col += rSun * (0.05 + glint * (pow(fs, 10.0) * 1.6 + pow(fs, 2.0) * 0.12));
  for (int i = 0; i < ${MAX_RAIN_LIGHTS}; i++) {
    if (i >= rLN) break;
    vec3 L = rLP[i].xyz - p;
    float d = length(L);
    float reach = rLP[i].w;
    float cone = rLD[i].w > -1.5 ? smoothstep(rLD[i].w, mix(rLD[i].w, 1.0, 0.25), dot(-L / max(d, 1e-3), rLD[i].xyz)) : 1.0;
    if (d < reach && cone > 0.0) {
      float att = (1.0 - d / reach); att *= att;
      att /= 1.0 + d * d * 0.08;
      // lamp behind the drop (in line with the eye): bright; beside or in front: a faint sparkle
      float ph = 0.22 + glint * 3.2 * pow(max(dot(V, L / max(d, 1e-3)), 0.0), 5.0);
      col += rLC[i] * att * ph * cone;
    }
  }
  col += vec3(0.75, 0.82, 1.0) * rFlash * 2.4;
  return col;
}

vec3 rOut(vec3 c) {
  if (rDisplay > 0.5) { c = c / (1.0 + c * 0.55); c = pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }
  return c;
}
`;

// Hides a vertex: puts it outside the clip volume so the triangle is dropped before rasterising.
export const COLLAPSE = "gl_Position = vec4(2.0, 2.0, 2.0, 1.0);";
