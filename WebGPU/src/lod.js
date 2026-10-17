// Distance culling for the small things (signs, labels, props): thousands of them are in the scene, a few hundred are near.
import * as THREE from 'three/webgpu';

const items = [];
const _p = new THREE.Vector3();

export const Lod = {
  /** Show `obj` only within `range` metres of the camera. */
  add(obj, range) { obj.userData.lodRange = range * range; items.push(obj); },
  clear() { items.length = 0; },
  update(camPos) {
    for (const o of items) {
      o.getWorldPosition(_p);
      const dx = _p.x - camPos.x, dz = _p.z - camPos.z;
      o.visible = dx * dx + dz * dz < o.userData.lodRange;
    }
  },
};
