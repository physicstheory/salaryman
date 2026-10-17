// The railway: a fenced cutting down block column 3, a station, level crossings with barriers and lamps, and two trains that shuttle
// end to end. A train kills anything on the track when it arrives, and its body is solid so cars crumple against it.
import * as THREE from 'three/webgpu';
import { Assets } from '../assets.js';
import { GROUPS } from '../physics.js';
import { textMesh } from '../text.js';
import { clamp } from '../util.js';

const unitBox = new THREE.BoxGeometry(1, 1, 1);

export class Crossing {
  constructor(parent, zk, rx) {
    this.down = false; this.amount = 1; this.roadZ = zk; this.railX = rx; this.t = 0;
    this.arms = []; this.dirs = []; this.lamps = [];
    const armMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0x401a1a, roughness: 0.5 });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xd11f1f });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x383f4c, roughness: 0.6 });
    for (const d of [[-1, -6, 1], [1, 6, -1]]) {
      const piv = new THREE.Group();
      piv.position.set(rx + d[0] * 7.4, 0.3, zk + d[1]);
      parent.add(piv);
      const arm = new THREE.Mesh(unitBox, armMat); arm.scale.set(0.2, 0.22, 6); arm.position.z = d[2] * 3; piv.add(arm);
      for (let n = 0; n < 3; n++) { const st = new THREE.Mesh(unitBox, stripeMat); st.scale.set(0.22, 0.24, 0.6); st.position.z = d[2] * (1 + n * 2); piv.add(st); }
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 8), postMat);
      post.position.set(rx + d[0] * 7.4, 1.9, zk + d[1]); parent.add(post);
      const lm = new THREE.MeshBasicMaterial({ color: 0x400f0f });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), lm);
      lamp.position.set(rx + d[0] * 7.4, 3.6, zk + d[1]); parent.add(lamp);
      this.arms.push(piv); this.dirs.push(d[2]); this.lamps.push(lamp);
    }
  }
  update(dt, trains) {
    this.t += dt;
    this.down = false;
    for (const tr of trains) {
      if (tr.waiting > 0) continue;
      if (tr.dir > 0) { if (tr.front > this.roadZ - 95 && tr.tail < this.roadZ + 16) this.down = true; }
      else if (tr.front < this.roadZ + 95 && tr.tail > this.roadZ - 16) this.down = true;
    }
    this.amount += ((this.down ? 0 : 1) - this.amount) * Math.min(1, 2.2 * dt);
    this.arms.forEach((a, i) => {
      a.rotation.x = -this.dirs[i] * 1.3 * this.amount;
      const on = this.down && Math.floor(this.t * 3) % 2 === i % 2;
      this.lamps[i].material.color.setHex(on ? 0xff1a14 : 0x400f0f);
    });
  }
}

export class Train {
  constructor(phys, parent) { this.phys = phys; this.parent = parent; this.cars = []; this.waiting = 0; this.z = 0; this.front = 0; this.tail = 0; }

  async setup(names, d, rx, wl, sp, startZ, wait) {
    this.dir = d; this.railX = rx; this.worldLen = wl; this.speed = sp; this.trackOff = 2 * d; this.carLen = 7.4;
    this.group = new THREE.Group();
    this.parent.add(this.group);
    for (let i = 0; i < names.length; i++) {
      const scn = await Assets.model(`./assets/kenney/train/${names[i]}.glb`);
      if (!scn) continue;
      scn.scale.setScalar(3);
      // the kit's rear car is turned round so its cab faces the other way
      scn.rotation.y = (i === names.length - 1 ? Math.PI : 0) + (d < 0 ? Math.PI : 0);
      scn.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const holder = new THREE.Group(); holder.add(scn);
      this.group.add(holder);
      this.cars.push(holder);
    }
    const n = names.length;
    // the whole consist is a single kinematic box, centred between the first and last car
    const { R, world } = this.phys;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(rx + this.trackOff, 3.2, 0));
    world.createCollider(R.ColliderDesc.cuboid(1.8, 3.0, n * this.carLen * 0.5).setCollisionGroups(GROUPS.world), this.body);
    this.z = startZ;
    this.waiting = wait;
    if (wait > 0) this.z = d * 1e4;
    this.apply();
  }

  apply() {
    const n = this.cars.length;
    const cz = this.z - this.dir * (n - 1) * this.carLen * 0.5;
    this.group.position.set(this.railX + this.trackOff, 0, cz);
    for (let i = 0; i < n; i++) {
      const along = ((n - 1) * 0.5 - i) * this.carLen * this.dir;
      this.cars[i].position.set(0, 0.62 + 0.36 * 3, along);
    }
    this.front = this.z + this.dir * this.carLen * 0.5;
    this.tail = this.z - this.dir * ((n - 1) * this.carLen + this.carLen * 0.5);
    this.body.setNextKinematicTranslation({ x: this.railX + this.trackOff, y: 3.2, z: cz });
  }

  step(dt, killables) {
    const n = this.cars.length;
    if (this.waiting > 0) {
      this.waiting -= dt;
      if (this.waiting <= 0) this.z = this.dir > 0 ? -this.carLen * n - 20 : this.worldLen + this.carLen * n + 20;
    } else {
      this.z += this.dir * this.speed * dt;
      if ((this.dir > 0 && this.z - n * this.carLen > this.worldLen + 30) || (this.dir < 0 && this.z + n * this.carLen < -30)) {
        this.waiting = 5 + Math.random() * 8;
        this.z = this.dir * 1e4;
      }
    }
    this.apply();
    if (this.waiting <= 0) {
      const lo = Math.min(this.front, this.tail) - 1, hi = Math.max(this.front, this.tail) + 1;
      for (const k of killables) {
        const p = k.position;
        if (Math.abs(p.x - (this.railX + this.trackOff)) < 2.3 && p.z > lo && p.z < hi) k.die && k.die('HIT BY A TRAIN');
      }
    }
  }
}

/** Builds the cutting, the station, the crossings and the trains. Returns {crossings, trains}. */
export async function buildRail(phys, parent, N, P, railX) {
  const W = P * N;
  const mat = (c, r = 0.9, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const gravel = mat(0x2b2926, 1), fence = mat(0x3d4552, 0.7, 0.4), plat = mat(0x808590, 0.8), roof = mat(0x296b4a, 0.6, 0.2);
  const add = (size, pos, m, solid = true, cast = true) => {
    const mesh = new THREE.Mesh(unitBox, m); mesh.scale.set(...size); mesh.position.set(...pos); mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh);
    if (solid) phys.staticBox(pos[0], pos[1], pos[2], size[0] / 2, size[1] / 2, size[2] / 2);
    return mesh;
  };
  for (let j = 0; j < N; j++) {
    const z0 = j * P + 6, z1 = (j + 1) * P - 6, zc = (z0 + z1) / 2, ln = z1 - z0;
    add([P - 16, 0.14, ln], [railX, 0.19, zc], gravel, false);
    for (const sd of [-1, 1]) add([0.25, 2.2, ln], [railX + sd * (P * 0.5 - 8.1), 1.2, zc], fence);
  }
  // rails: the kit's straight track tiles
  const tile = await Assets.model('./assets/kenney/train/railroad-straight.glb');
  const ts = 3.4, tileLen = 4 * ts;
  if (tile) {
    for (let n = 0; n * tileLen < W + tileLen; n++) {
      for (const off of [-2, 2]) {
        const t = tile.clone(true);
        t.scale.setScalar(ts);
        t.position.set(railX + off, 0.24, n * tileLen);
        t.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
        parent.add(t);
      }
    }
  }
  // the station, in the fourth block down
  const sz0 = 3 * P + 6;
  for (const sd of [-1, 1]) {
    const px = railX + sd * 6.4;
    add([4.4, 1.0, 34], [px, 0.5, sz0 + 20], plat);
    add([5.0, 0.3, 30], [px, 5.4, sz0 + 20], roof, false);
    for (const dz of [-12, 0, 12]) add([0.3, 5, 0.3], [px + sd * 1.7, 2.9, sz0 + 20 + dz], fence);
    for (const [zz, rot] of [[sz0 + 20 - 15.2, 0], [sz0 + 20 + 15.2, Math.PI]]) {
      const l = textMesh('東都駅  TŌKONTO', { size: 80, px: 0.03, outline: 8 });
      l.position.set(px, 4.4, zz); l.rotation.y = rot; parent.add(l);
    }
  }
  const crossings = [];
  for (let k = 0; k <= N; k++) crossings.push(new Crossing(parent, k * P, railX));
  const consists = [['train-electric-city-a', 'train-electric-city-b', 'train-electric-city-b', 'train-electric-city-c'], ['train-electric-bullet-a', 'train-electric-bullet-b', 'train-electric-bullet-b', 'train-electric-bullet-c']];
  const trains = [];
  for (let i = 0; i < 2; i++) {
    const tr = new Train(phys, parent);
    await tr.setup(consists[i], i === 0 ? 1 : -1, railX, W, i === 0 ? 22 : 34, 90, i === 0 ? 0 : 7);
    trains.push(tr);
  }
  return { crossings, trains };
}
