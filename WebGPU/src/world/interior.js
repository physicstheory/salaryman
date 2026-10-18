// Walk-in shop interiors. Each brand gets a small furnished room in a hidden corner of the world: the door in the shop front takes Seiko in
// (a quick fade), he walks the aisles, talks to the clerk at the counter to buy, and walks back out of the door to the street.
// If assets/interiors/<brand>.glb exists it is used for the room's looks; the collision box and the counter and door markers stay the same.
import * as THREE from 'three/webgpu';
import { Data } from '../data.js';
import { Assets } from '../assets.js';

const ORIGIN = { x: 24000, z: 24000 };
const SLOT = 40;
const W = 12, D = 9, H = 3.6;

const mat = (color, rough = 0.85, emissive = 0) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  if (emissive) { m.emissive = new THREE.Color(color); m.emissiveIntensity = emissive; }
  return m;
};

export class Interiors {
  constructor(phys, scene) {
    this.phys = phys; this.scene = scene;
    this.rooms = new Map();
    this.count = 0;
    this.light = new THREE.PointLight('#fff4e0', 0, 16, 1.6);
    this.light2 = new THREE.PointLight('#fff4e0', 0, 16, 1.6);
    scene.add(this.light, this.light2);
    this.active = null;
  }

  room(brandId) {
    let r = this.rooms.get(brandId);
    if (r) return r;
    const slot = this.count++;
    const ox = ORIGIN.x + slot * SLOT, oz = ORIGIN.z;
    const b = Data.brand(brandId);
    const g = new THREE.Group();
    g.position.set(ox, 0, oz);
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    const box = (w, h, d, m, x, y, z) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z);
    const wall = mat('#e9e4d8'), trim = mat(b.band, 0.6), floor = mat('#c9c4b8', 0.45);
    box(W, 0.2, D, floor, 0, -0.1, 0);
    box(W, 0.1, D, mat('#f4f2ec', 0.9), 0, H + 0.05, 0);
    box(W, H, 0.2, wall, 0, H / 2, -D / 2);
    box(0.2, H, D, wall, -W / 2, H / 2, 0);
    box(0.2, H, D, wall, W / 2, H / 2, 0);
    // front wall with the doorway, so you see the street through the glass
    box(W / 2 - 1.2, H, 0.2, wall, -(W / 4 + 0.6), H / 2, D / 2);
    box(W / 2 - 1.2, H, 0.2, wall, W / 4 + 0.6, H / 2, D / 2);
    box(2.4, H - 2.4, 0.2, wall, 0, 2.4 + (H - 2.4) / 2, D / 2);
    box(W, 0.35, 0.22, trim, 0, H - 0.4, -D / 2 + 0.02);
    box(W, 0.35, 0.22, trim, 0, 0.18, -D / 2 + 0.02);
    // ceiling panels that glow
    for (const x of [-3.5, 0, 3.5]) for (const z of [-2.5, 2]) box(2.2, 0.05, 0.5, mat('#fffdf4', 0.5, 2.2), x, H - 0.02, z);
    // shelves along the back and one gondola in the middle, stocked in the shop's colours
    const goods = [b.band, b.stripes[0], b.stripes[1], '#d9a441', '#c9503f', '#4a7fb5', '#6aa34d'];
    const shelf = (x, z, len, along) => {
      const sx = along === 'x' ? len : 0.5, sz = along === 'x' ? 0.5 : len;
      box(sx, 1.9, sz, mat('#8a8f98', 0.5), x, 0.95, z);
      for (let lvl = 0; lvl < 4; lvl++) {
        const n = Math.floor(len / 0.35);
        for (let i = 0; i < n; i++) {
          const t = (i - (n - 1) / 2) * 0.35;
          const c = goods[(i * 3 + lvl * 5 + slot) % goods.length];
          const px = along === 'x' ? x + t : x, pz = along === 'x' ? z : z + t;
          box(0.26, 0.28, 0.26, mat(c, 0.7), px, 0.4 + lvl * 0.42, pz + (along === 'x' ? 0.22 : 0));
          if (along === 'x') box(0.26, 0.28, 0.26, mat(c, 0.7), px, 0.4 + lvl * 0.42, pz - 0.22);
        }
      }
    };
    shelf(-2.2, -D / 2 + 0.55, 7.2, 'x');
    shelf(1.2, 0.4, 5, 'x');
    shelf(-W / 2 + 0.55, 1.3, 4, 'z');
    // counter with the register and the clerk behind it
    const cx = W / 2 - 2.3, cz = -1.2;
    box(0.9, 1.05, 3.4, mat('#4b5058', 0.5), cx, 0.52, cz);
    box(0.95, 0.06, 3.5, mat(b.band, 0.4), cx, 1.07, cz);
    box(0.35, 0.28, 0.35, mat('#1c1f24', 0.4), cx, 1.22, cz + 0.8);
    const clerk = new THREE.Group();
    clerk.add(add(new THREE.CapsuleGeometry(0.24, 0.9, 4, 10), mat(b.band, 0.8), 0, 0, 0));
    clerk.children[0].position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), mat('#e8c4a0', 0.8));
    head.position.y = 1.72; clerk.add(head);
    clerk.position.set(cx + 0.95, 0, cz); clerk.rotation.y = -Math.PI / 2;
    g.add(clerk);
    // sign over the door, readable from inside
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.35), mat('#2e8b57', 0.5, 1.2)); sign.position.set(0, H - 0.25, D / 2 - 0.12); sign.rotation.y = Math.PI; g.add(sign);
    this.scene.add(g);
    // collision: floor, ceiling, walls and the counter
    const P = this.phys;
    P.staticBox(ox, -0.5, oz, W / 2 + 1, 0.5, D / 2 + 1);
    P.staticBox(ox, H + 0.5, oz, W / 2, 0.5, D / 2);
    P.staticBox(ox, H / 2, oz - D / 2, W / 2, H / 2, 0.1);
    P.staticBox(ox - W / 2, H / 2, oz, 0.1, H / 2, D / 2);
    P.staticBox(ox + W / 2, H / 2, oz, 0.1, H / 2, D / 2);
    P.staticBox(ox - (W / 4 + 0.6), H / 2, oz + D / 2, W / 4 - 0.6, H / 2, 0.1);
    P.staticBox(ox + (W / 4 + 0.6), H / 2, oz + D / 2, W / 4 - 0.6, H / 2, 0.1);
    P.staticBox(ox + cx, 0.55, oz + cz, 0.5, 0.55, 1.7);
    P.staticBox(ox - 2.2, 0.95, oz - D / 2 + 0.55, 3.6, 0.95, 0.3);
    P.staticBox(ox + 1.2, 0.95, oz + 0.4, 2.5, 0.95, 0.3);
    r = {
      brand: brandId, group: g, ox, oz,
      entry: new THREE.Vector3(ox, 0.1, oz + D / 2 - 1.6),
      exit: { brand: 'exit', shopName: 'the street', door: new THREE.Vector3(ox, 0, oz + D / 2 - 0.4) },
      counter: { brand: brandId, shopName: b.name, interiorCounter: true, door: new THREE.Vector3(ox + cx - 1.1, 0, oz + cz + 0.4) },
    };
    this.rooms.set(brandId, r);
    // a modelled interior replaces the placeholder's looks when one is supplied
    const url = `assets/interiors/${brandId}.glb`;
    fetch(url, { method: 'HEAD' }).then((res) => (res.ok ? Assets.model(url) : null)).then((m) => { if (!m) return; for (const c of [...g.children]) if (c.isMesh) c.visible = false; g.add(m); }).catch(() => {});
    return r;
  }

  enter(brandId) {
    const r = this.room(brandId);
    this.active = r;
    this.light.position.set(r.ox - 3, H - 0.6, r.oz); this.light2.position.set(r.ox + 3, H - 0.6, r.oz);
    this.light.intensity = this.light2.intensity = 14;
    return r;
  }

  leave() { this.active = null; this.light.intensity = this.light2.intensity = 0; }
}
