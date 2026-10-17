// The five birches from the tree kit, drawn as a few InstancedMeshes (bark and leaves per variant) so hundreds of trees cost ten draw
// calls. Every trunk gets a solid collider.
import * as THREE from 'three/webgpu';
import { Assets } from '../assets.js';

export const VARIANTS = [1, 2, 4, 5, 6];

export class BirchForest {
  constructor(phys, group) {
    this.phys = phys; this.group = group;
    this.items = {}; this.bark = {}; this.leaf = {}; this.count = 0;
    this.barkMat = new THREE.MeshStandardMaterial({ color: 0xdbd6c9, roughness: 0.85 });
    this.leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
    for (const v of VARIANTS) this.items[v] = [];
  }

  async load() {
    for (const v of VARIANTS) {
      const g = await Assets.obj(`./assets/trees/Birch_${v}.obj`);
      if (!g) continue;
      g.traverse((o) => {
        if (!o.isMesh) return;
        const geo = o.geometry;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.attributes.position.count, materialIndex: 0 }];
        for (const gr of groups) {
          const name = (mats[gr.materialIndex] && mats[gr.materialIndex].name) || '';
          const part = new THREE.BufferGeometry();
          for (const k of ['position', 'normal']) {
            const a = geo.attributes[k];
            if (!a) continue;
            const arr = a.array.slice(gr.start * 3, (gr.start + gr.count) * 3);
            part.setAttribute(k, new THREE.BufferAttribute(arr, 3));
          }
          if (!part.attributes.normal) part.computeVertexNormals();
          if (/leaf|leaves/i.test(name)) this.leaf[v] = part; else if (!this.bark[v]) this.bark[v] = part;
        }
      });
    }
    return this;
  }

  /** A pleasant spread of greens, now and then turning gold. */
  static leafColour(rng) {
    const r = rng.next();
    if (r < 0.12) return new THREE.Color(0.82, 0.66, 0.16).lerp(new THREE.Color(0.9, 0.45, 0.1), rng.next() * 0.5);
    return new THREE.Color(0.27, 0.5, 0.17).lerp(new THREE.Color(0.5, 0.64, 0.2), rng.next());
  }

  add(variant, x, y, z, scale, yaw, leaf, solid = true) {
    if (!this.items[variant] || !this.bark[variant]) return;
    this.items[variant].push({ x, y, z, scale, yaw, leaf });
    this.count++;
    if (solid) this.phys.staticCylinder(x, y + 2 * scale, z, 2 * scale, 0.32 * scale + 0.08);
  }

  commit() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const v of VARIANTS) {
      const list = this.items[v];
      if (!list.length || !this.bark[v]) continue;
      const bark = new THREE.InstancedMesh(this.bark[v], this.barkMat, list.length);
      const leaf = this.leaf[v] ? new THREE.InstancedMesh(this.leaf[v], this.leafMat, list.length) : null;
      list.forEach((t, i) => {
        q.setFromAxisAngle(up, t.yaw);
        m.compose(p.set(t.x, t.y, t.z), q, s.setScalar(t.scale));
        bark.setMatrixAt(i, m);
        if (leaf) { leaf.setMatrixAt(i, m); leaf.setColorAt(i, t.leaf); }
      });
      for (const im of [bark, leaf]) if (im) { im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; this.group.add(im); }
    }
  }
}
