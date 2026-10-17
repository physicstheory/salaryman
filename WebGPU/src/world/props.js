// Things on the street: the branded face of a shop, vending machines, benches and the pier, and the street lamps.
import * as THREE from 'three/webgpu';
import { Data } from '../data.js';
import { glow } from './sky.js';
import { textMesh } from '../text.js';
import { Lod } from '../lod.js';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const cache = new Map();

function litMat(hex, energy, dayShare, plain = false) {
  const key = hex + '|' + energy + '|' + dayShare + '|' + plain;
  if (cache.has(key)) return cache.get(key);
  const c = new THREE.Color(hex);
  let m;
  if (energy > 0) {
    m = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.5), emissive: c, emissiveIntensity: energy, roughness: 0.7 });
    glow(m, energy, dayShare);
  } else m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  cache.set(key, m);
  return m;
}

function box(parent, size, pos, hex, energy, dayShare = 0.4) {
  const m = new THREE.Mesh(unitBox, litMat(hex, energy, dayShare));
  m.scale.set(size[0], size[1], size[2]);
  m.position.set(pos[0], pos[1], pos[2]);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** The branded face of a shop on a building's street wall. `door` is where you stand to go in. */
export class ShopFront {
  constructor() {
    this.group = new THREE.Group();
    this.brand = 'eleven'; this.shopName = ''; this.door = new THREE.Vector3(); this.outN = new THREE.Vector3(0, 0, -1); this.kind = 'shop';
  }

  build(brandId, wallPos, n, width, groundY = 0) {
    this.brand = brandId;
    this.outN.set(n.x, 0, n.z);
    const b = Data.brand(brandId);
    this.shopName = b.name;
    const yaw = Math.atan2(n.x, n.z);
    const g = this.group;
    g.position.set(wallPos.x, wallPos.y, wallPos.z);
    g.rotation.y = yaw;
    const w = Math.max(5, Math.min(9.5, width));
    const band = b.band, ink = b.ink;
    box(g, [w, 1.25, 0.3], [0, groundY + 3.55, 0.2], band, 0.8);
    const jp = b.jp || '';
    const title = b.name;
    const t1 = textMesh(title, { color: ink, size: 84, px: 0.0068 * Math.min(1, 11 / Math.max(11, title.length)), outline: 6, outlineColor: 'rgba(0,0,0,0.6)' });
    t1.position.set(0, groundY + 3.85, 0.38);
    g.add(t1);
    const t2 = textMesh(jp !== '' ? jp : (b.tag || ' '), { color: ink, size: jp !== '' ? 70 : 60, px: jp !== '' ? 0.0052 : 0.0042, outline: 6, outlineColor: 'rgba(0,0,0,0.6)' });
    t2.position.set(0, groundY + 3.25, 0.38);
    g.add(t2);
    // stripes under the fascia, as on a chain store
    box(g, [w, 0.16, 0.32], [0, groundY + 2.82, 0.2], b.stripes[0], 0.8);
    box(g, [w, 0.12, 0.32], [0, groundY + 2.66, 0.2], b.stripes[1], 0.8);
    // canopy
    box(g, [w * 0.9, 0.08, 1.4], [0, groundY + 2.5, 0.8], '#' + new THREE.Color(band).multiplyScalar(0.8).getHexString(), 0);
    // glass door and windows, lit from inside
    box(g, [w * 0.88, 2.2, 0.12], [0, groundY + 1.25, 0.15], '#ffdb99', 0.4);
    box(g, [1.5, 2.25, 0.16], [0, groundY + 1.2, 0.2], '#ccebff', 0.55);
    for (const sx of [-0.75, 0.75]) box(g, [0.06, 2.3, 0.2], [sx, groundY + 1.2, 0.22], '#14141a', 0);
    // the door sits a couple of metres in front of the wall
    this.door.set(wallPos.x + n.x * 2, 0, wallPos.z + n.z * 2);
    Lod.add(t1, 160); Lod.add(t2, 140);
  }
}

/** A drinks machine on the pavement. Press E beside it to buy. */
export class VendingMachine {
  constructor() { this.group = new THREE.Group(); this.door = new THREE.Vector3(); this.brand = 'vending'; this.shopName = 'Jihanki'; }
  build(phys, x, y, z, yaw) {
    const g = this.group;
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const body = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0xc73329, roughness: 0.5 }));
    body.scale.set(0.95, 1.95, 0.8);
    body.position.y = 0.975;
    body.castShadow = true;
    g.add(body);
    const gm = new THREE.MeshStandardMaterial({ color: 0x334d59, emissive: 0xb3f2ff, emissiveIntensity: 1.2, roughness: 0.3 });
    glow(gm, 1.2, 0.5);
    const face = new THREE.Mesh(unitBox, gm);
    face.scale.set(0.78, 1.1, 0.05);
    face.position.set(0, 1.15, 0.42);
    g.add(face);
    const l = textMesh('自動販売機', { size: 60, px: 0.0075, outline: 6 });
    l.position.set(0, 1.85, 0.42);
    g.add(l);
    Lod.add(l, 60);
    // a collider so nobody walks through it (the box is turned by the yaw: only 90 degree turns are used)
    const q = Math.round(yaw / (Math.PI * 0.5)) & 1;
    phys.staticBox(x, y + 0.975, z, q ? 0.4 : 0.475, 0.975, q ? 0.475 : 0.4);
    this.door.set(x + Math.sin(yaw) * 1.3, 0, z + Math.cos(yaw) * 1.3);
  }
}

/** A place in the open with something to do: a park bench, or a spot on the pier to fish from. */
export class ActivitySpot {
  constructor() { this.group = new THREE.Group(); this.door = new THREE.Vector3(); this.brand = 'bench'; this.shopName = 'Bench'; }
  build(phys, kind, x, y, z, yaw) {
    this.brand = kind;
    this.shopName = kind === 'bench' ? 'Bench' : 'Pier';
    const g = this.group;
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4526, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1f2129, metalness: 0.5, roughness: 0.5 });
    const add = (size, pos, mat) => {
      const m = new THREE.Mesh(unitBox, mat);
      m.scale.set(...size); m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; g.add(m);
    };
    if (kind === 'bench') {
      add([1.8, 0.1, 0.5], [0, 0.5, 0], wood);
      add([1.8, 0.5, 0.08], [0, 0.85, -0.22], wood);
      for (const sx of [-0.8, 0.8]) add([0.08, 0.5, 0.45], [sx, 0.25, 0], dark);
      this.door.set(x + Math.sin(yaw) * 0.9, 0, z + Math.cos(yaw) * 0.9);
    } else {
      // a plank deck with posts and a rail, and a lit sign
      add([14, 0.25, 4], [0, 0, 0], wood);
      for (let k = 0; k < 6; k++) add([0.25, 1.4, 0.25], [-6.5 + k * 2.6, 0.7, -1.9], dark);
      add([14, 0.08, 0.1], [0, 1.1, -1.9], dark);
      for (const rot of [0, Math.PI]) {
        const l = textMesh('釣り  FISHING', { color: '#80e6ff', size: 90, px: 0.012, outline: 8 });
        l.position.set(0, 2.4, -1.9); l.rotation.y = rot; g.add(l);
        Lod.add(l, 120);
      }
      this.door.set(x + Math.sin(yaw) * 0.5, 0, z + Math.cos(yaw) * 0.5);
      phys.staticBox(x, y, z, 7, 0.125, 2);
    }
  }
}

/** Street lamps: posts and glowing heads as two instanced meshes. Returns the head positions. */
export function buildLamps(parent, N, P) {
  const count = (N + 1) * (N + 1) * 2;
  const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.15, 7, 8), new THREE.MeshStandardMaterial({ color: 0x1f212b, roughness: 0.6, metalness: 0.4 }), count);
  const hm = new THREE.MeshStandardMaterial({ color: 0x8c8c80, emissive: 0xffd180, emissiveIntensity: 4, roughness: 0.5 });
  glow(hm, 4, 0);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 12, 8), hm, count);
  const m = new THREE.Matrix4();
  const pos = [];
  let idx = 0;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    for (const o of [[7, 7], [-7, -7]]) {
      post.setMatrixAt(idx, m.makeTranslation(i * P + o[0], 3.5, j * P + o[1]));
      head.setMatrixAt(idx, m.makeTranslation(i * P + o[0], 7.2, j * P + o[1]));
      pos.push(new THREE.Vector3(i * P + o[0], 7.2, j * P + o[1]));
      idx++;
    }
  }
  post.castShadow = true;
  post.frustumCulled = false; head.frustumCulled = false;
  parent.add(post, head);
  return pos;
}
