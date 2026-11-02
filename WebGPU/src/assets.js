// Loading and caching of models and textures.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const gltf = new GLTFLoader();
const obj = new OBJLoader();
const tex = new THREE.TextureLoader();
const cache = new Map();

export const Assets = {
  maxAniso: 8,

  async gltf(url) {
    if (!cache.has(url)) cache.set(url, gltf.loadAsync(url).catch((e) => { console.warn('model missing:', url); return null; }));
    return cache.get(url);
  },

  /** A fresh clone of a loaded model's scene (materials shared), or null. */
  async model(url) {
    const g = await this.gltf(url);
    return g ? g.scene.clone(true) : null;
  },

  async obj(url) {
    if (!cache.has(url)) cache.set(url, obj.loadAsync(url).catch((e) => { console.warn('mesh missing:', url); return null; }));
    return cache.get(url);
  },

  /** One BufferGeometry from an OBJ, all its parts merged. */
  async objGeometry(url) {
    const g = await this.obj(url);
    if (!g) return null;
    const geos = [];
    g.traverse((o) => {
      if (o.isMesh) {
        const geo = o.geometry.clone();
        for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
        if (!geo.attributes.normal) geo.computeVertexNormals();
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        geos.push(geo.index ? geo.toNonIndexed() : geo);
      }
    });
    if (!geos.length) return null;
    const m = mergeGeometries(geos, false);
    m.computeBoundingBox();
    return m;
  },

  texture(url, { srgb = false, repeat = 1, aniso } = {}) {
    const t = tex.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = aniso ?? this.maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  },
};
