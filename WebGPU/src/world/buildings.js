// The city's own buildings (assets/buildings/jp, 50 meshes) textured in code as a Japanese street: a procedural facade shader per
// building (windows, balconies, air-conditioners, shopfronts, lit windows at night), then signs, billboards and banners.
import * as THREE from 'three/webgpu';
import { Assets } from '../assets.js';
import { facadeMaterial, FACADE_WALLS, FACADE_SHOPS } from './facade.js';
import { dress } from './signs.js';

const COUNT = 50;

export class JpBuildings {
  constructor() { this.items = []; this.ok = false; this.placed = 0; }

  async load() {
    const tasks = [];
    for (let i = 1; i <= COUNT; i++) tasks.push(Assets.objGeometry(`./assets/buildings/jp/b${String(i).padStart(2, '0')}.obj`).then((geo) => ({ geo, i })));
    for (const { geo, i } of await Promise.all(tasks)) {
      if (!geo) continue;
      const bb = geo.boundingBox;
      const size = bb.getSize(new THREE.Vector3());
      this.items.push({ geo, bb, size, foot: Math.max(size.x, size.z), height: size.y, id: i });
    }
    this.ok = this.items.length > 10;
    return this;
  }

  pick(rng, minFoot, maxFoot, wantTall) {
    let pool = [];
    for (const it of this.items) {
      if (it.foot >= minFoot && it.foot <= maxFoot) {
        const w = 1 + wantTall * Math.max(-0.6, Math.min(1, (it.height - 14) / 20));
        for (let k = 0; k < Math.max(1, Math.floor(w * 3)); k++) pool.push(it);
      }
    }
    if (!pool.length) pool = this.items;
    return pool[Math.floor(rng.next() * pool.length)];
  }

  material(rng, it) {
    const tall = it.height > 24;
    const style = tall && rng.chance(0.55) ? 1 : rng.int(0, 3);
    const wall = rng.pick(FACADE_WALLS);
    return facadeMaterial({
      wall, trim: new THREE.Color(wall).multiplyScalar(0.45).getHex(), shop: rng.pick(FACADE_SHOPS), style, seed: rng.range(0, 20),
      lit: rng.range(0.28, 0.6), floorH: rng.range(3.2, 3.7), bayW: rng.range(2.8, 3.5),
    });
  }

  /**
   * Place one building so it fits a square slot of `slot` metres, centred at (cx, cz), turned `yaw`.
   * `outs` are the directions that face a street. Returns the collider box (world space, Box3).
   */
  place(parent, rng, it, cx, cz, yaw, slot, outs, y0 = 0.12) {
    const s = Math.min(slot / it.foot, 1.3) * rng.range(0.9, 1.0);
    const wrapper = new THREE.Group();
    wrapper.position.set(cx, y0, cz);
    wrapper.rotation.y = yaw;
    wrapper.scale.setScalar(s);
    parent.add(wrapper);
    const mesh = new THREE.Mesh(it.geo, this.material(rng, it));
    mesh.position.set(-(it.bb.min.x + it.size.x * 0.5), -it.bb.min.y, -(it.bb.min.z + it.size.z * 0.5));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    wrapper.add(mesh);
    const q = Math.round(yaw / (Math.PI * 0.5)) & 1;
    const sx = (q === 1 ? it.size.z : it.size.x) * s;
    const sz = (q === 1 ? it.size.x : it.size.z) * s;
    const box = new THREE.Box3(new THREE.Vector3(cx - sx * 0.5, y0, cz - sz * 0.5), new THREE.Vector3(cx + sx * 0.5, y0 + it.size.y * s, cz + sz * 0.5));
    this.placed++;
    dress(parent, rng, box, outs, it.height * s > 20);
    return box;
  }
}
