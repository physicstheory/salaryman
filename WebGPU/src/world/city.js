// Tōkonto: an 8 x 8 block city of Japanese street buildings with a fenced railway, a station and level crossings, shops on the street
// walls, vending machines, a park, a pier, street lamps and a sky that follows the clock. Roads run on the grid lines x = i * P and
// z = j * P; blocks sit between them.
import * as THREE from 'three/webgpu';
import { Rng } from '../util.js';
import { JpBuildings } from './buildings.js';
import { BirchForest, VARIANTS } from './trees.js';
import { ShopFront, VendingMachine, ActivitySpot, buildLamps } from './props.js';
import { buildRail } from './rail.js';
import { roadMaterial } from './roadmat.js';
import { SkyCycle } from './sky.js';

/** Makes a mesh's `uv` the world's (metres over the tile size), keeping the original UVs as `uv1`: the road's normal map is laid out in world space. */
function worldUV(mesh, tile) {
  const geo = mesh.geometry;
  mesh.updateMatrix();
  if (!geo.attributes.uv1) geo.setAttribute('uv1', geo.attributes.uv.clone());
  const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix); uv.setXY(i, v.x / tile, v.z / tile); }
  uv.needsUpdate = true;
}
import { Lod } from '../lod.js';

export const P = 52;
export const N = 8;
export const W = P * N;
const SHOP_CYCLE = ['eleven', 'ramen', 'petmart', 'sushi', 'pharmacy', 'ramen', 'eleven', 'books', 'sushi', 'petmart', 'clothes', 'ramen', 'sushi'];
const SPECIALS = { 3: 'sento', 5: 'plaza', 7: 'pachinko', 9: 'dokoto', 11: 'karaoke', 13: 'arcade', 14: 'capsule', 17: 'sento', 19: 'karaoke', 21: 'arcade', 23: 'pachinko', 25: 'capsule' };

export class City {
  constructor(phys, renderer, scene) {
    this.phys = phys; this.renderer = renderer; this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rng = new Rng(11);
    this.W = W; this.P = P; this.N = N;
    this.railX = 3 * P + P * 0.5;
    this.shops = []; this.vendors = []; this.spots = [];
    this.crossings = []; this.trains = [];
    this.buildingCount = 0;
    this.shopN = 0;
    this.sky = new SkyCycle(renderer, scene);
  }

  async build(progress = () => {}) {
    const say = (t) => progress(t);
    say('Ground'); await this.ground();
    say('Roads'); await this.roads();
    this.forest = new BirchForest(this.phys, this.group);
    await this.forest.load();
    this.jp = await new JpBuildings().load();
    say('Buildings'); this.blocks();
    say('Railway'); const r = await buildRail(this.phys, this.group, N, P, this.railX);
    this.crossings = r.crossings; this.trains = r.trains;
    say('Street furniture');
    const lamps = buildLamps(this.group, N, P);
    this.sky.setLamps(lamps);
    this.vending();
    this.activitySpots();
    this.forest.commit();
    say('Sky');
    this.sky.update(0, { position: new THREE.Vector3(W / 2, 20, W / 2) });
    await this.sky.refreshEnvironment();
  }

  // ---- ground, roads, sea
  async ground() {
    const half = W * 0.5;
    this.phys.staticBox(half, -1, half, (W + 160) / 2, 1, (W + 160) / 2, { grip: 1 });
    const pav = await roadMaterial({ pavement: true, normalMap: true });
    this.padMaterial = pav;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(W + 160, W + 160), pav);
    g.rotation.x = -Math.PI / 2; g.position.set(half, -0.02, half); g.receiveShadow = true;
    worldUV(g, 4);
    this.group.add(g);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x0a2438, roughness: 0.12, metalness: 0.6 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(half, -0.9, half);
    this.group.add(sea);
    // the edge of the map: low walls, so nothing drives into the sea
    const e = 34, wm = new THREE.MeshStandardMaterial({ color: 0x33384a, roughness: 0.9 });
    const wall = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wm); m.position.set(x, y, z); this.group.add(m); this.phys.staticBox(x, y, z, sx / 2, sy / 2, sz / 2); };
    wall(W + 2 * e, 3, 1, half, 1.5, -e); wall(W + 2 * e, 3, 1, half, 1.5, W + e);
    wall(1, 3, W + 2 * e, -e, 1.5, half); wall(1, 3, W + 2 * e, W + e, 1.5, half);
  }

  async roads() {
    const road = await roadMaterial({ roadLen: W + 12, pitch: P, markings: true, normalMap: true });
    const plain = await roadMaterial({ markings: false });
    for (let k = 0; k <= N; k++) {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(12, W + 12), road);
      a.rotation.x = -Math.PI / 2; a.position.set(k * P, 0.02, W * 0.5); a.receiveShadow = true;
      a.geometry = a.geometry.clone(); worldUV(a, 4);
      this.group.add(a);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(12, W + 12), road);
      b.rotation.x = -Math.PI / 2; b.rotation.z = Math.PI / 2; b.position.set(W * 0.5, 0.021, k * P); b.receiveShadow = true;
      b.rotation.order = 'XYZ'; worldUV(b, 4);
      this.group.add(b);
    }
    // junctions are plain asphalt, so the lane paint stops at the kerb
    const geo = new THREE.PlaneGeometry(12, 12);
    const m = new THREE.Matrix4();
    const junctions = new THREE.InstancedMesh(geo, plain, (N + 1) * (N + 1));
    let idx = 0;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      m.makeRotationX(-Math.PI / 2).setPosition(i * P, 0.04, j * P);
      junctions.setMatrixAt(idx++, m);
    }
    junctions.receiveShadow = true; junctions.frustumCulled = false;
    this.group.add(junctions);
  }

  // ---- blocks and lots
  blocks() {
    const rng = this.rng;
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x23472a, roughness: 1 });
    this.padMat = this.padMat || null;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x0 = i * P + 6, z0 = j * P + 6, s = P - 12;
      const isPark = i === 4 && (j === 3 || j === 4);
      // the pavement slab of the block: a raised box, solid
      this.pad(x0 + s * 0.5, z0 + s * 0.5, s, isPark ? parkMat : null);
      if (isPark) {
        for (let t = 0; t < 16; t++) {
          const v = rng.pick(VARIANTS);
          this.forest.add(v, x0 + 4 + rng.next() * (s - 8), 0.12, z0 + 4 + rng.next() * (s - 8), rng.range(0.75, 1.15), rng.next() * Math.PI * 2, BirchForest.leafColour(rng));
        }
        continue;
      }
      if (i === 3) continue;            // the railway cutting
      const mid = Math.abs(i - 3.5) + Math.abs(j - 3.5);
      this.lotJp(x0 + 1, z0 + 1, s - 2, mid);
      this.streetTrees(x0, z0, s);
    }
  }

  pad(cx, cz, s, mat) {
    if (!this.padGeo) this.padGeo = new THREE.BoxGeometry(1, 1, 1);
    if (!mat) {
      if (!this.padMaterial) throw new Error('pavement material missing');
      mat = this.padMaterial;
    }
    const m = new THREE.Mesh(this.padGeo, mat);
    m.scale.set(s, 0.12, s); m.position.set(cx, 0.06, cz); m.receiveShadow = true;
    this.group.add(m);
    this.phys.staticBox(cx, 0.06, cz, s / 2, 0.06, s / 2, { grip: 1 });
  }

  /** Birches along the pavement, in the strip between the kerb and the shopfronts, clear of the junctions. */
  streetTrees(x0, z0, s) {
    const rng = this.rng, edge = 0.9;
    for (let side = 0; side < 4; side++) {
      for (const k of [11, 27]) {
        if (rng.chance(0.18)) continue;
        let x, z;
        switch (side) {
          case 0: x = x0 + k; z = z0 + edge; break;
          case 1: x = x0 + k; z = z0 + s - edge; break;
          case 2: x = x0 + edge; z = z0 + k; break;
          default: x = x0 + s - edge; z = z0 + k;
        }
        this.forest.add(rng.pick(VARIANTS), x, 0.12, z, rng.range(0.42, 0.6), rng.next() * Math.PI * 2, BirchForest.leafColour(rng));
      }
    }
  }

  solidBox(box) {
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    this.phys.staticBox(c.x, c.y, c.z, s.x / 2, s.y / 2, s.z / 2);
    this.buildingCount++;
  }

  /** One city lot with the supplied buildings: either a single large one, or four small ones, each turned to show a street face. */
  lotJp(x, z, sz, mid) {
    const rng = this.rng, jp = this.jp;
    const cx = x + sz * 0.5, cz = z + sz * 0.5;
    const tallBias = Math.max(-0.3, Math.min(1.4, 1.6 - mid * 0.35));
    const V = (a, b) => ({ x: a, z: b });
    if (rng.chance(0.28)) {
      const it = jp.pick(rng, 18, 36, tallBias);
      const face = rng.int(0, 3);
      const outs = [[V(1, 0), V(-1, 0), V(0, 1), V(0, -1)][face], [V(-1, 0), V(1, 0), V(0, -1), V(0, 1)][face]];
      const yaw = rng.int(0, 3) * Math.PI * 0.5;
      const bx = jp.place(this.group, rng, it, cx, cz, yaw, sz - 2, outs);
      this.solidBox(bx);
      this.maybeShop(bx, outs, x, z, 0.4);
      return;
    }
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const dx = a === 1 ? 1 : -1, dz = b === 1 ? 1 : -1;
      const it = jp.pick(rng, 5, 17.2, tallBias);
      const outs = [V(dx, 0), V(0, dz)];
      const yaw = rng.int(0, 3) * Math.PI * 0.5;
      const bx = jp.place(this.group, rng, it, x + sz * (0.25 + 0.5 * a), z + sz * (0.25 + 0.5 * b), yaw, sz * 0.5 - 1.6, outs);
      this.solidBox(bx);
      this.maybeShop(bx, outs, x, z, 0.27);
    }
  }

  /** Some buildings have a branded shop on the street wall. Every seventh is the back-street armourer, and a few are special. */
  maybeShop(box, outs, lx, lz, chance) {
    const rng = this.rng;
    if (!outs.length || !rng.chance(chance)) return;
    const n = outs[0];
    let brand = SHOP_CYCLE[this.shopN % SHOP_CYCLE.length];
    const backStreet = lx < P + 8 || lx > (N - 1) * P - 8 || lz < P + 8 || lz > (N - 1) * P - 8;
    if (this.shopN % 7 === 3 && backStreet) brand = 'arms';
    else if (this.shopN % 7 === 3) brand = 'pharmacy';
    if (SPECIALS[this.shopN]) brand = SPECIALS[this.shopN];
    this.shopN++;
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const depth = Math.abs(n.x) * size.x * 0.5 + Math.abs(n.z) * size.z * 0.5;
    const t = { x: -n.z, z: n.x };
    const faceW = Math.abs(t.x) * size.x + Math.abs(t.z) * size.z;
    const sf = new ShopFront();
    sf.build(brand, { x: c.x + n.x * (depth + 0.02), y: 0.12, z: c.z + n.z * (depth + 0.02) }, n, faceW * 0.8, 0);
    this.group.add(sf.group);
    this.shops.push(sf);
  }

  vending() {
    const vr = new Rng(77);
    let placed = 0, tries = 0;
    while (placed < 20 && tries < 200) {
      tries++;
      const i = vr.int(0, N), j = vr.int(0, N - 1);
      if (i === 3 || (i === 4 && (j === 3 || j === 4))) continue;       // not in the railway cutting, not in the park
      const side = vr.chance(0.5) ? 1 : -1;
      const x = i * P + side * 6.6, z = j * P + 16 + vr.next() * 18;
      if (x < 2 || x > W - 2) continue;
      const vm = new VendingMachine();
      vm.build(this.phys, x, 0.12, z, Math.atan2(-side, 0));
      this.group.add(vm.group);
      this.vendors.push(vm);
      placed++;
    }
  }

  activitySpots() {
    // benches in the park, round the edge of the grass
    const cx = 4.5 * P, cz = 4 * P;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const s = new ActivitySpot();
      s.build(this.phys, 'bench', cx + Math.cos(a) * 24, 0.12, cz + Math.sin(a) * 30, Math.atan2(-Math.cos(a), -Math.sin(a)));
      this.group.add(s.group);
      this.spots.push(s);
    }
    // the pier on the east edge
    for (const z of [3 * P + 20, 5 * P - 20]) {
      const p = new ActivitySpot();
      p.build(this.phys, 'fishing', W + 22, 0.1, z, Math.PI * 0.5);
      this.group.add(p.group);
      this.spots.push(p);
    }
  }

  inPark(x, z) { return x > 4 * P + 6 && x < 5 * P - 6 && z > 3 * P + 6 && z < 5 * P - 6; }

  update(dt, camera) {
    for (const c of this.crossings) c.update(dt, this.trains);
    this.sky.update(dt, camera);
  }

  /** Distance along a heading to the stop line of a lowered barrier, or Infinity when the way is clear. */
  barrierDistance(pos, heading) {
    if (Math.abs(heading.x) < 0.5) return Infinity;
    const k = Math.round(pos.z / P);
    if (k < 0 || k >= this.crossings.length) return Infinity;
    const c = this.crossings[k];
    if (!c.down || Math.abs(pos.z - k * P) > 6) return Infinity;
    const d = heading.x > 0 ? this.railX - 10.8 - pos.x : pos.x - (this.railX + 10.8);
    return d > -1 && d < 40 ? d : Infinity;
  }
}
