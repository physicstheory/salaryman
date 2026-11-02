// Water: bodies of water described as data (a canal, the bay, a pond, a flooded underpass), drawn with a shader that
// moves (layered Gerstner-style wave normals, a gentle swell in the vertices, raindrop rings when it rains, sky
// reflections through the environment probe and Fresnel), and known to physics, which floats things in it.
//
// The look can be replaced: water.materialFactory = (THREE, body, uniforms) => material lets the graphics layer
// put its own ocean shader on the same bodies without touching the rest.

export class WaterSystem {
  constructor(engine) {
    this.engine = engine;
    this.T = engine.THREE;
    this.bodies = [];
    this.current = [0.15, 0.05];
    this.materialFactory = null;
    this.u = { wTime: { value: 0 } };
  }

  // body: { id, shape: "rect" | "poly", rect: [x0, z0, x1, z1] | poly: [[x, z], ...], level, colour, swell, owner }
  add(body, parent) {
    const T = this.T;
    const b = Object.assign({ level: 0, colour: "#1d4a52", swell: 0.25, deep: "#0b1f26" }, body);
    let geo;
    if (b.shape === "poly" && b.poly) {
      const sh = new T.Shape(b.poly.map(p => new T.Vector2(p[0], -p[1])));
      geo = new T.ShapeGeometry(sh, 1);
      geo.rotateX(-Math.PI / 2);
      b.bounds = boundsOf(b.poly);
    } else {
      const [x0, z0, x1, z1] = b.rect;
      const w = x1 - x0, d = z1 - z0;
      const seg = Math.min(128, Math.max(2, Math.round(Math.max(w, d) / 3)));
      geo = new T.PlaneGeometry(w, d, Math.min(seg, Math.max(2, Math.round(w / 3))), Math.min(seg, Math.max(2, Math.round(d / 3))));
      geo.rotateX(-Math.PI / 2);
      geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      b.bounds = [x0, z0, x1, z1];
    }
    const mat = this.materialFactory ? this.materialFactory(T, b, this.u) : this._material(b);
    const mesh = new T.Mesh(geo, mat);
    mesh.position.y = b.level;
    mesh.receiveShadow = true;
    mesh.userData.shDry = true;
    mesh.userData.water = b;
    (parent || this.engine.scene).add(mesh);
    b.mesh = mesh;
    this.bodies.push(b);
    return b;
  }

  remove(owner) {
    this.bodies = this.bodies.filter(b => {
      if (b.owner !== owner) return true;
      if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh);
      if (b.mesh) { b.mesh.geometry.dispose(); }
      return false;
    });
  }

  // The surface height at (x, z), or null if (x, z) is not over water.
  levelAt(x, z) {
    for (const b of this.bodies) {
      const r = b.bounds;
      if (x < r[0] || x > r[2] || z < r[1] || z > r[3]) continue;
      if (b.shape === "poly" && !inPoly(b.poly, x, z)) continue;
      const t = this.u.wTime.value;
      return b.level + b.swell * 0.5 * (Math.sin(x * 0.12 + t * 1.1) * 0.6 + Math.sin(z * 0.09 - t * 0.8) * 0.4);
    }
    return null;
  }

  _material(b) {
    const T = this.T, S = this.engine.surfaces.uniforms, U = this.u;
    const m = new T.MeshStandardMaterial({ color: new T.Color(b.colour), roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.9 });
    m.userData.shDry = true;
    const swell = b.swell;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U, { shRain: S.shRain, shWind: S.shWind, wSwell: { value: swell }, wDeep: { value: new T.Color(b.deep) } });
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float wTime; uniform float wSwell; varying vec3 vWWorld;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          vec3 wwp = (modelMatrix * vec4(transformed, 1.0)).xyz;
          transformed.y += wSwell * 0.5 * (sin(wwp.x * 0.12 + wTime * 1.1) * 0.6 + sin(wwp.z * 0.09 - wTime * 0.8) * 0.4);
          vWWorld = wwp;`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          uniform float wTime; uniform float shRain; uniform vec2 shWind; uniform vec3 wDeep; varying vec3 vWWorld;
          float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          // sum of directional waves: returns the slope (dh/dx, dh/dz)
          vec2 wSlope(vec2 p, float t){
            vec2 s = vec2(0.0);
            vec2 wd = normalize(shWind + vec2(0.001));
            for (int i = 0; i < 6; i++){
              float fi = float(i);
              float ang = (wh(vec2(fi, 1.7)) - 0.5) * 1.6;
              vec2 d = vec2(wd.x * cos(ang) - wd.y * sin(ang), wd.x * sin(ang) + wd.y * cos(ang));
              float k = 0.35 * pow(1.65, fi);
              float a = 0.18 / pow(1.7, fi);
              float ph = dot(d, p) * k + t * sqrt(9.81 * k) + fi * 1.3;
              s += d * k * a * cos(ph);
            }
            return s;
          }
          vec2 wRings(vec2 p, float t){
            vec2 g = vec2(0.0); vec2 q = p * 2.5; vec2 c0 = floor(q);
            for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
              vec2 c = c0 + vec2(float(i), float(j)); float h = wh(c);
              vec2 ctr = c + vec2(wh(c + 3.1), wh(c + 5.7));
              float ph = fract(t * (1.0 + 0.5 * h) + h * 9.0);
              vec2 d = q - ctr; float r = length(d);
              g += normalize(d + 1e-4) * sin((r - ph) * 30.0) * smoothstep(0.1, 0.0, abs(r - ph)) * (1.0 - ph);
            }
            return g;
          }`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
          vec2 sl = wSlope(vWWorld.xz, wTime) + wRings(vWWorld.xz, wTime) * shRain * 0.35;
          vec3 wn = normalize(vec3(-sl.x, 1.0, -sl.y));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          // looking straight down you see into the water (dark, tinted); at a glance it is a mirror
          vec3 vd = normalize(cameraPosition - vWWorld);
          float fres = pow(1.0 - max(vd.y, 0.0), 4.0);
          diffuseColor.rgb = mix(wDeep, diffuseColor.rgb, 0.35 + 0.65 * fres);
          diffuseColor.a = mix(0.82, 0.97, fres);`);
    };
    m.customProgramCacheKey = () => "shigoto-water1";
    return m;
  }

  update(dt) { this.u.wTime.value += dt; }
}

function boundsOf(poly) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return [x0, z0, x1, z1];
}
function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
