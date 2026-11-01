// Turn one baked cell (plain JSON) into meshes, colliders, water and lights.
//
// Cell format (shigoto-level/1), everything in world metres, y up, yaw in degrees:
//   ground:    [{ rect: [x0, z0, x1, z1], y, surface: "asphalt" | "paving" | "grass" }]
//   blocks:    [{ rect | c+size+yaw | poly, kerb: 0.15 }]                 raised pavement islands between the roads
//   roads:     [{ a: [x, z], b: [x, z], width, lanes, centre: "dashed" | "solid" | "yellow" | "none", crossA, crossB }]
//   buildings: [{ id, c: [x, z], size: [w, d], yaw | poly, floors, floorH, groundH, style, colour, y, depth, lit,
//                 signs: [{ text, colour, kind: "vertical" | "fascia", side }], roofClutter }]
//   props:     [{ type, pos: [x, y, z], yaw, dynamic }]
//   wires:     [{ from: [x, z], to: [x, z], h }]
//   walls:     [{ a: [x, z], b: [x, z], y0, y1, thick, colour }]
//   water:     [{ rect | poly, level, colour }]
//   lights:    [{ pos: [x, y, z], colour, range }]

import { Batcher } from "./Batcher.js";
import { PROP_DEFS, drawProp } from "./Props.js";

const STYLE_IDS = { apartment: 0, office: 1, concrete: 2, brick: 3, shops: 4 };
const STYLE_COLOURS = {
  apartment: [[0.86, 0.83, 0.76], [0.78, 0.74, 0.68], [0.9, 0.88, 0.84], [0.74, 0.66, 0.58]],
  office: [[0.42, 0.48, 0.55], [0.35, 0.4, 0.46], [0.5, 0.52, 0.55]],
  concrete: [[0.62, 0.61, 0.58], [0.55, 0.55, 0.53], [0.68, 0.66, 0.6]],
  brick: [[0.52, 0.3, 0.22], [0.6, 0.36, 0.26], [0.45, 0.28, 0.22]],
  shops: [[0.82, 0.8, 0.74], [0.7, 0.68, 0.64], [0.6, 0.58, 0.55], [0.84, 0.78, 0.66]]
};
const SHOP_NAMES = ["ラーメン", "居酒屋", "カラオケ", "薬局", "喫茶", "不動産", "歯科", "焼肉", "書店", "美容室", "寿司", "麻雀", "BAR", "クリニック", "うどん", "質屋", "整体", "英会話", "中華", "スナック"];
const SIGN_COLOURS = ["#c8102e", "#0a5fb4", "#f2c200", "#1a8a3a", "#f07a10", "#7a2a8a", "#ffffff", "#101010"];

export class CellBuilder {
  constructor(engine, materials) {
    this.engine = engine;
    this.T = engine.THREE;
    this.mat = materials;
    this.protos = new Map();
  }

  build(cell, key, root, offset) {
    const T = this.T, eng = this.engine, ph = eng.physics;
    const ox = offset ? offset.x : 0, oz = offset ? offset.z : 0, oy = offset ? offset.y || 0 : 0;
    const group = new T.Group();
    group.name = "cell " + key;
    group.position.set(ox, oy, oz);
    const B = new Batcher(T);
    const add = (mname, geo, m, colour, extra) => B.add(mname, this.mat.get(mname), geo, m, colour, extra);
    const P = (x, z) => [x + ox, z + oz];
    const rng = seeded(hashStr(key));
    const lights = [];
    const signs = new SignAtlas(T, 1024);

    // ---- ground ---------------------------------------------------------------------------------------------
    for (const g of cell.ground || []) {
      const [x0, z0, x1, z1] = g.rect, y = g.y || 0;
      const geo = new T.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
      add(g.surface || "asphalt", geo, new T.Matrix4().makeTranslation((x0 + x1) / 2, y, (z0 + z1) / 2));
      if (ph) ph.addStaticBox(key, [(x0 + x1) / 2 + ox, y - 0.5 + oy, (z0 + z1) / 2 + oz], [x1 - x0, 1, z1 - z0], 0, { tag: "ground" });
    }

    // ---- pavements -----------------------------------------------------------------------------------------
    for (const b of cell.blocks || []) {
      const k = b.kerb != null ? b.kerb : 0.15, y = b.y || 0;
      const r = rectOf(b);
      if (r) {
        const m = new T.Matrix4().compose(new T.Vector3(r.c[0], y + k / 2, r.c[1]), new T.Quaternion().setFromEuler(new T.Euler(0, r.yaw, 0)), new T.Vector3(1, 1, 1));
        add(b.surface || "paving", topOnly(T, r.size[0], r.size[1], k), m);
        add("paint", sidesOnly(T, r.size[0], r.size[1], k), m, [0.62, 0.61, 0.58]);
        if (ph) ph.addStaticBox(key, [r.c[0] + ox, y + k / 2 + oy, r.c[1] + oz], [r.size[0], k, r.size[1]], r.yaw, { tag: "kerb" });
      } else if (b.poly) {
        const sh = new T.Shape(b.poly.map(p => new T.Vector2(p[0], -p[1])));
        const geo = new T.ExtrudeGeometry(sh, { depth: k, bevelEnabled: false }).rotateX(-Math.PI / 2);
        add("paving", geo, new T.Matrix4().makeTranslation(0, y, 0));
        if (ph) { const pos = geo.attributes.position; const v = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { v[i * 3] = pos.getX(i) + ox; v[i * 3 + 1] = pos.getY(i) + y + oy; v[i * 3 + 2] = pos.getZ(i) + oz; } const idx = new Uint32Array(pos.count); for (let i = 0; i < idx.length; i++) idx[i] = i; ph.addTrimesh(key, v, idx); }
      }
    }

    // ---- walls: embankments, retaining walls, fences ----------------------------------------------------------
    for (const w of cell.walls || []) {
      const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], len = Math.hypot(dx, dz), th = w.thick || 0.4, y0 = w.y0 != null ? w.y0 : 0, y1 = w.y1 != null ? w.y1 : 1.2;
      const c = [(w.a[0] + w.b[0]) / 2, (y0 + y1) / 2, (w.a[1] + w.b[1]) / 2], yaw = Math.atan2(dx, dz);
      add("paint", new T.BoxGeometry(th, y1 - y0, len), new T.Matrix4().compose(new T.Vector3(c[0], c[1], c[2]), new T.Quaternion().setFromEuler(new T.Euler(0, yaw, 0)), new T.Vector3(1, 1, 1)), w.colour ? hexToRgb(w.colour) : [0.58, 0.57, 0.54]);
      if (ph) ph.addStaticBox(key, [c[0] + ox, c[1] + oy, c[2] + oz], [th, y1 - y0, len], yaw, { tag: "wall" });
    }

    // ---- road markings -----------------------------------------------------------------------------------
    const W = [0.95, 0.95, 0.92], Y = [0.95, 0.72, 0.1];
    for (const r of cell.roads || []) {
      const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1], len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      const yaw = Math.atan2(dx, dz), y = (r.y || 0) + 0.012, wid = r.width || 8;
      const at = (s, lat, l, w, col) => {
        const cx = r.a[0] + dx * (s / len) + Math.cos(yaw) * lat, cz = r.a[1] + dz * (s / len) - Math.sin(yaw) * lat;
        add("marking", new T.PlaneGeometry(w, l).rotateX(-Math.PI / 2), new T.Matrix4().compose(new T.Vector3(cx, y, cz), new T.Quaternion().setFromEuler(new T.Euler(0, yaw, 0)), new T.Vector3(1, 1, 1)), col);
      };
      const c = r.centre || "dashed";
      const inset = r.crossA ? 4.5 : 0, insetB = r.crossB ? 4.5 : 0;
      const L = len - inset - insetB;
      if (L > 0) {
        if (c === "dashed") for (let s = inset + 1.5; s + 3 < len - insetB; s += 8) at(s + 1.5, 0, 3, 0.15, W);
        else if (c === "solid") at(inset + L / 2, 0, L, 0.15, W);
        else if (c === "yellow") { at(inset + L / 2, 0.15, L, 0.12, Y); at(inset + L / 2, -0.15, L, 0.12, Y); }
        if (r.edges !== false) { at(inset + L / 2, wid / 2 - 0.4, L, 0.15, W); at(inset + L / 2, -wid / 2 + 0.4, L, 0.15, W); }
        const lanes = r.lanes || 2;
        if (lanes >= 4) for (const lat of [-wid / 4, wid / 4]) for (let s = inset + 1.5; s + 3 < len - insetB; s += 8) at(s + 1.5, lat, 3, 0.12, W);
      }
      // zebra crossings: the white bars across the end of the road, then a stop line
      const zebra = (s) => { for (let lat = -wid / 2 + 0.8; lat < wid / 2 - 0.6; lat += 0.9) at(s, lat + 0.25, 3.2, 0.45, W); };
      if (r.crossA) { zebra(2.0); at(4.3, 0, 0.3, wid * 0.5, W); }
      if (r.crossB) { zebra(len - 2.0); }
    }

    // ---- buildings -------------------------------------------------------------------------------------------
    for (const b of cell.buildings || []) this._building(b, key, add, B, signs, rng, ox, oy, oz, lights);

    // ---- props -----------------------------------------------------------------------------------------------
    for (const p of cell.props || []) {
      const def = PROP_DEFS[p.type] || PROP_DEFS.crate;
      const dyn = p.dynamic != null ? p.dynamic : def.dynamic;
      const yaw = (p.yaw || 0) * Math.PI / 180;
      const pos = p.pos.length === 3 ? p.pos : [p.pos[0], 0, p.pos[1]];
      if (dyn && ph) {
        const holder = new T.Group();
        const inner = this._proto(p.type).clone();
        inner.position.y = def.shape === "sphere" ? 0 : -def.size[1] / 2;
        holder.add(inner);
        holder.position.set(pos[0] + ox, pos[1] + oy + (def.shape === "sphere" ? def.size[0] : def.size[1] / 2), pos[2] + oz);
        holder.rotation.y = yaw;
        eng.scene.add(holder);
        ph.addDynamic(key, { shape: def.shape, size: def.shape === "sphere" ? [def.size[0]] : def.shape === "cylinder" || def.shape === "cone" ? [def.size[0], def.size[1]] : def.size,
          pos: [holder.position.x, holder.position.y, holder.position.z], yaw, mass: def.mass, restitution: def.restitution, buoyancy: def.buoyancy, mesh: holder, sleeping: true, tag: p.type });
      } else {
        const m = new T.Matrix4().compose(new T.Vector3(pos[0], pos[1], pos[2]), new T.Quaternion().setFromEuler(new T.Euler(0, yaw, 0)), new T.Vector3(1, 1, 1));
        drawProp(T, p.type, (mn, g, mm, col) => add(mn, g, mm ? m.clone().multiply(mm) : m, col), rng);
        if (ph && def.shape) {
          const s = def.size;
          ph.addStaticBox(key, [pos[0] + ox, pos[1] + s[1] / 2 + oy, pos[2] + oz], def.shape === "box" ? s : [s[0] * 2, s[1], s[0] * 2], yaw, { tag: p.type });
        }
      }
      if (def.light && p.type === "lamp") lights.push({ pos: [pos[0] + ox + Math.sin(yaw) * 1.45, pos[1] + 6.1 + oy, pos[2] + oz + Math.cos(yaw) * 1.45], colour: 0xffd9a8, range: 18, intensity: 1.6 });
      if (def.light && p.type === "vending") lights.push({ pos: [pos[0] + ox + Math.sin(yaw) * 0.9, 1.3 + pos[1] + oy, pos[2] + oz + Math.cos(yaw) * 0.9], colour: 0xe8f0ff, range: 6, intensity: 0.8 });
    }

    // ---- overhead wires (the Tokyo sky is full of them) ------------------------------------------------------
    for (const w of cell.wires || []) {
      const h = w.h || 9.2;
      for (const off of [-0.8, 0, 0.8]) {
        const dx = w.to[0] - w.from[0], dz = w.to[1] - w.from[1], len = Math.hypot(dx, dz);
        const nx = -dz / len * off, nz = dx / len * off;
        const pts = [];
        for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new T.Vector3(w.from[0] + dx * t + nx, h - Math.sin(t * Math.PI) * len * 0.035, w.from[1] + dz * t + nz)); }
        add("metal", new T.TubeGeometry(new T.CatmullRomCurve3(pts), 12, 0.015, 3, false), null, [0.08, 0.08, 0.08]);
      }
    }

    // ---- lights and water -----------------------------------------------------------------------------------
    for (const l of cell.lights || []) lights.push({ pos: [l.pos[0] + ox, l.pos[1] + oy, l.pos[2] + oz], colour: l.colour || 0xffd2a0, range: l.range || 15, intensity: l.intensity || 1.5 });
    if (eng.water) for (const w of cell.water || []) {
      const body = Object.assign({}, w, { owner: key });
      if (w.rect) { body.shape = "rect"; body.rect = [w.rect[0] + ox, w.rect[1] + oz, w.rect[2] + ox, w.rect[3] + oz]; }
      if (w.poly) { body.shape = "poly"; body.poly = w.poly.map(p => [p[0] + ox, p[1] + oz]); }
      body.level = (w.level || 0) + oy;
      eng.water.add(body, root);
    }

    const meshes = B.build(group, { noShadow: new Set(["marking"]) });
    if (signs.used) {
      const mesh = signs.mesh();
      if (mesh) group.add(mesh);
    }
    root.add(group);
    return { group, lights, meshes, signs };
  }

  _proto(type) {
    if (this.protos.has(type)) return this.protos.get(type);
    const T = this.T, g = new T.Group(), B = new Batcher(T);
    drawProp(T, type, (mn, geo, m, col) => B.add(mn, this.mat.get(mn), geo, m, col), seeded(hashStr(type)));
    B.build(g);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.protos.set(type, g);
    return g;
  }

  _building(b, key, add, B, signs, rng, ox, oy, oz, lights) {
    const T = this.T, ph = this.engine.physics;
    const styleName = b.style || "apartment";
    const style = STYLE_IDS[styleName] != null ? STYLE_IDS[styleName] : 0;
    const floors = b.floors || 5, floorH = b.floorH || (style === 1 ? 3.8 : 3.0), groundH = b.groundH != null ? b.groundH : (style === 4 || b.signs ? 4.2 : 3.2);
    const H = groundH + (floors - 1) * floorH;
    const parapet = b.parapet != null ? b.parapet : 1.0;
    const y0 = b.y || 0;
    const seed = hashStr(b.id || key + ":" + (b.c || b.poly[0]).join(",")) % 997;
    const brng = seeded(seed + 11);
    const colours = STYLE_COLOURS[styleName] || STYLE_COLOURS.apartment;
    const colour = b.colour ? hexToRgb(b.colour) : colours[(brng() * colours.length) | 0];
    const bayW = b.bayW || (style === 1 ? 1.8 : style === 2 ? 2.6 : 3.2);
    // footprint, ordered so the wall normals face out
    let poly;
    const r = rectOf(b);
    if (r) {
      const c = Math.cos(r.yaw), s = Math.sin(r.yaw), hw = r.size[0] / 2, hd = r.size[1] / 2;
      poly = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [r.c[0] + x * c + z * s, r.c[1] - x * s + z * c]);
    } else poly = b.poly.slice();
    if (signedArea(poly) > 0) poly.reverse();
    const fac2 = [seed, b.depth || 4.5, b.lit != null ? b.lit : 0.55, H];
    for (let i = 0; i < poly.length; i++) {
      const p0 = poly[i], p1 = poly[(i + 1) % poly.length];
      const ex = p1[0] - p0[0], ez = p1[1] - p0[1], len = Math.hypot(ex, ez);
      if (len < 0.05) continue;
      const tx = ex / len, tz = ez / len, nx = -tz, nz = tx;
      // centre the window grid on the wall so a facade looks designed rather than cut off
      const u0 = (len % bayW) / 2;
      const geo = wallQuad(T, p0, p1, y0, y0 + H + parapet, -u0, len - u0, nx, nz);
      add("facade", geo, null, colour, { aTan: [tx, 0, tz], aFac: [style, floorH, bayW, groundH], aFac2: fac2 });
      // air-conditioner units hung on the wall (every Tokyo back street)
      if (b.ac !== false && style !== 1 && len > 4) {
        for (let f = 1; f < floors; f++) if (brng() < 0.35) {
          const t = 0.15 + brng() * 0.7, x = p0[0] + ex * t + nx * 0.2, z = p0[1] + ez * t + nz * 0.2;
          const m = new T.Matrix4().compose(new T.Vector3(x, y0 + groundH + (f - 1) * floorH + 0.2, z), new T.Quaternion().setFromEuler(new T.Euler(0, Math.atan2(nx, nz), 0)), new T.Vector3(1, 1, 1));
          drawProp(T, "ac", (mn, g, mm, col) => add(mn, g, m.clone().multiply(mm), col), brng);
        }
      }
    }
    // roof
    const contour = poly.map(p => new T.Vector2(p[0], p[1]));
    const tris = T.ShapeUtils.triangulateShape(contour, []);
    const rp = [], rn = [], ru = [];
    for (const t of tris) for (const k of [t[0], t[2], t[1]]) { rp.push(poly[k][0], y0 + H + 0.05, poly[k][1]); rn.push(0, 1, 0); ru.push(poly[k][0], poly[k][1]); }
    if (signedArea(poly.map(p => [p[0], p[1]])) < 0) { /* already clockwise */ }
    const rg = new T.BufferGeometry();
    rg.setAttribute("position", new T.Float32BufferAttribute(rp, 3));
    rg.setAttribute("normal", new T.Float32BufferAttribute(rn, 3));
    rg.setAttribute("uv", new T.Float32BufferAttribute(ru, 2));
    fixWinding(rg);
    add("roof", rg, null, [0.62, 0.62, 0.6]);
    // roof clutter: water tank, AC plant, a stair house
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    if (b.roofClutter !== false) {
      const rs = Math.min(...poly.map(p => Math.hypot(p[0] - cx, p[1] - cz))) * 0.55;
      const M = (x, y, z) => new T.Matrix4().makeTranslation(x, y, z);
      add("paint", new T.BoxGeometry(2.4, 2.6, 2.4), M(cx + rs * 0.3, y0 + H + 1.3, cz - rs * 0.2), [0.7, 0.7, 0.68]);
      if (brng() < 0.7) add("paint", new T.CylinderGeometry(0.9, 0.9, 1.6, 12), M(cx - rs * 0.5, y0 + H + 1.9, cz + rs * 0.3), [0.75, 0.78, 0.8]);
      if (brng() < 0.7) add("metal", new T.BoxGeometry(0.1, 2.0, 0.1), M(cx - rs * 0.5, y0 + H + 0.95, cz + rs * 0.3), [0.4, 0.4, 0.4]);
      for (let i = 0; i < 3; i++) if (brng() < 0.6) add("paint", new T.BoxGeometry(1.0, 0.8, 0.6), M(cx + (brng() - 0.5) * rs * 1.4, y0 + H + 0.4, cz + (brng() - 0.5) * rs * 1.4), [0.85, 0.85, 0.83]);
    }
    // signs: the vertical blade signs stacked up a shop building, and the fascia over the shopfront
    // the front: the wall whose outward normal points the way signFront says (N is -z, the way the maps draw it)
    let frontIdx = 0;
    if (b.signFront) {
      const want = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[b.signFront] || [0, 1];
      let best = -2;
      for (let i = 0; i < poly.length; i++) {
        const p0 = poly[i], p1 = poly[(i + 1) % poly.length], ex = p1[0] - p0[0], ez = p1[1] - p0[1], l = Math.hypot(ex, ez) || 1;
        const d = (-ez / l) * want[0] + (ex / l) * want[1];
        if (d > best) { best = d; frontIdx = i; }
      }
    }
    const sideWall = (side) => { const i = (side != null ? side : frontIdx) % poly.length; return [poly[i], poly[(i + 1) % poly.length]]; };
    const list = b.signs || (style === 4 ? autoSigns(brng, floors) : []);
    for (const s of list) {
      const [p0, p1] = sideWall(s.side);
      const ex = p1[0] - p0[0], ez = p1[1] - p0[1], len = Math.hypot(ex, ez), tx = ex / len, tz = ez / len, nx = -tz, nz = tx;
      const col = s.colour || SIGN_COLOURS[(brng() * SIGN_COLOURS.length) | 0];
      const text = s.text || SHOP_NAMES[(brng() * SHOP_NAMES.length) | 0];
      if (s.kind === "vertical") {
        const h = s.height || Math.min(H - groundH - 1, Math.max(3, text.length * 1.0 + 0.6));
        const t = s.at != null ? s.at : 0.85;
        const x = p0[0] + ex * t + nx * 0.75, z = p0[1] + ez * t + nz * 0.75, y = y0 + groundH + 0.5 + h / 2;
        const slot = signs.vertical(text, col);
        signs.blade(slot, x, y, z, tx, tz, 0.12, h, 1.0);
        lights.push({ pos: [x + ox + nx * 0.6, y + oy, z + oz + nz * 0.6], colour: new T.Color(col).getHex(), range: 9, intensity: 0.6, sign: true });
      } else {
        const w = Math.min(len * 0.8, s.width || len - 1), t = s.at != null ? s.at : 0.5;
        const x = p0[0] + ex * t + nx * 0.18, z = p0[1] + ez * t + nz * 0.18, y = y0 + groundH - 0.55;
        const slot = signs.fascia(text, col);
        signs.panel(slot, x, y, z, tx, tz, nx, nz, w, 0.9);
      }
    }
    // the building's collider: one box for a rectangle, a convex hull otherwise
    if (ph) {
      if (r) ph.addStaticBox(key, [r.c[0] + ox, y0 + (H + parapet) / 2 + oy, r.c[1] + oz], [r.size[0], H + parapet, r.size[1]], r.yaw, { tag: "building" });
      else {
        const pts = new Float32Array(poly.length * 6);
        poly.forEach((p, i) => { pts.set([p[0] + ox, y0 + oy, p[1] + oz, p[0] + ox, y0 + H + parapet + oy, p[1] + oz], i * 6); });
        const d = ph.R.ColliderDesc.convexHull(pts);
        if (d) { const c = ph.world.createCollider(d); ph._own(key).colliders.push(c); }
      }
    }
  }
}

// ---- sign atlas: every sign in a cell drawn onto one canvas, so a street of neon is one draw call ------------------
class SignAtlas {
  constructor(T, size) {
    this.T = T; this.size = size; this.used = 0;
    this.canvas = document.createElement("canvas"); this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext("2d");
    this.x = 0; this.y = 0; this.rowH = 0;
    this.pos = []; this.uv = []; this.nor = [];
  }
  _alloc(w, h) {
    if (this.x + w > this.size) { this.x = 0; this.y += this.rowH; this.rowH = 0; }
    if (this.y + h > this.size) return null;
    const s = { x: this.x, y: this.y, w, h };
    this.x += w; this.rowH = Math.max(this.rowH, h); this.used++;
    return s;
  }
  _font(px) { return "bold " + px + "px 'Yu Gothic', 'Hiragino Sans', Meiryo, 'Noto Sans JP', 'Noto Sans CJK JP', 'WenQuanYi Zen Hei', sans-serif"; }
  vertical(text, col) {
    const chars = [...text], cw = 64, s = this._alloc(cw, Math.max(4, chars.length) * cw * 0.95 + 16);
    if (!s) return null;
    const c = this.ctx, light = isLight(col);
    c.fillStyle = col; c.fillRect(s.x, s.y, s.w, s.h);
    c.strokeStyle = light ? "#202020" : "#ffffff"; c.lineWidth = 3; c.strokeRect(s.x + 3, s.y + 3, s.w - 6, s.h - 6);
    c.fillStyle = light ? "#141414" : "#ffffff"; c.font = this._font(48); c.textAlign = "center"; c.textBaseline = "middle";
    const step = (s.h - 16) / chars.length;
    chars.forEach((ch, i) => c.fillText(ch, s.x + s.w / 2, s.y + 8 + step * (i + 0.5)));
    return s;
  }
  fascia(text, col) {
    const s = this._alloc(512, 72);
    if (!s) return null;
    const c = this.ctx, light = isLight(col);
    c.fillStyle = col; c.fillRect(s.x, s.y, s.w, s.h);
    c.fillStyle = light ? "#141414" : "#ffffff"; c.font = this._font(50); c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(text, s.x + s.w / 2, s.y + s.h / 2 + 2);
    return s;
  }
  _quad(slot, corners, n) {
    if (!slot) return;
    const S = this.size, u0 = slot.x / S, u1 = (slot.x + slot.w) / S, v1 = 1 - slot.y / S, v0 = 1 - (slot.y + slot.h) / S;
    const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { this.pos.push(...corners[k]); this.uv.push(...uvs[k]); this.nor.push(...n); }
  }
  // a blade sign sticking out from the wall: text on both faces
  blade(slot, x, y, z, tx, tz, thick, h, w) {
    const nx = -tz, nz = tx;
    const cx = (a, b) => [x + nx * a + tx * b, 0, z + nz * a + tz * b];
    const face = (side) => {
      const off = side * thick / 2;
      const c = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([a, yy]) => { const p = cx(side > 0 ? a : -a, off); p[1] = y + yy; return p; });
      this._quad(slot, c, [tx * side, 0, tz * side]);
    };
    face(1); face(-1);
  }
  panel(slot, x, y, z, tx, tz, nx, nz, w, h) {
    const c = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([a, yy]) => [x + tx * a, y + yy, z + tz * a]);
    this._quad(slot, c, [nx, 0, nz]);
  }
  mesh() {
    if (!this.pos.length) return null;
    const T = this.T, g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new T.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(this.uv, 2));
    const tex = new T.CanvasTexture(this.canvas);
    tex.encoding = T.sRGBEncoding; tex.anisotropy = 8;
    this.tex = tex;
    const m = new T.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.35, side: T.DoubleSide });
    m.userData.shDry = true;
    const mesh = new T.Mesh(g, m);
    mesh.userData.signs = true;
    return mesh;
  }
}

function autoSigns(rng, floors) {
  const out = [{ kind: "fascia" }];
  if (floors >= 3) out.push({ kind: "vertical", at: 0.12 + rng() * 0.15 });
  if (floors >= 5 && rng() < 0.6) out.push({ kind: "vertical", at: 0.8 + rng() * 0.1 });
  return out;
}
function isLight(hex) { const c = parseInt(hex.slice(1), 16); return ((c >> 16 & 255) * 0.3 + (c >> 8 & 255) * 0.59 + (c & 255) * 0.11) > 150; }
function hexToRgb(h) { const c = parseInt(h.replace("#", ""), 16); return [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255]; }
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function seeded(s) { let a = s >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function rectOf(b) { if (b.rect) return { c: [(b.rect[0] + b.rect[2]) / 2, (b.rect[1] + b.rect[3]) / 2], size: [b.rect[2] - b.rect[0], b.rect[3] - b.rect[1]], yaw: 0 }; if (b.c && b.size) return { c: b.c, size: b.size, yaw: (b.yaw || 0) * Math.PI / 180 }; return null; }
function signedArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; }
function wallQuad(T, p0, p1, y0, y1, u0, u1, nx, nz) {
  const pos = [p0[0], y0, p0[1], p1[0], y0, p1[1], p1[0], y1, p1[1], p0[0], y0, p0[1], p1[0], y1, p1[1], p0[0], y1, p0[1]];
  const uv = [u0, 0, u1, 0, u1, y1 - y0, u0, 0, u1, y1 - y0, u0, y1 - y0];
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new T.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
  fixWinding(g);
  return g;
}
// make every triangle's winding agree with its stored normal (so front faces face out)
function fixWinding(g) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, uv = g.attributes.uv ? g.attributes.uv.array : null;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2];
    const bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    if (cx * n[i] + cy * n[i + 1] + cz * n[i + 2] < 0) {
      for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
      if (uv) { const j = (i / 9) * 6; for (let k = 0; k < 2; k++) { const t = uv[j + 2 + k]; uv[j + 2 + k] = uv[j + 4 + k]; uv[j + 4 + k] = t; } }
    }
  }
}
function topOnly(T, w, d, k) { const g = new T.PlaneGeometry(w, d).rotateX(-Math.PI / 2); g.translate(0, k / 2, 0); return g; }
function sidesOnly(T, w, d, k) {
  const g = new T.BoxGeometry(w, k, d).toNonIndexed();
  // drop the top and bottom faces (box face order: +x, -x, +y, -y, +z, -z; 6 vertices each)
  const keep = [0, 1, 4, 5];
  const out = new T.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const a = g.attributes[name], s = a.itemSize, arr = [];
    for (const f of keep) for (let i = 0; i < 6; i++) for (let j = 0; j < s; j++) arr.push(a.array[(f * 6 + i) * s + j]);
    out.setAttribute(name, new T.Float32BufferAttribute(arr, s));
  }
  return out;
}
