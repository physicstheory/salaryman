// The renderer, scene and camera. WebGPU where it exists; WebGL2 otherwise (or when ?webgl is in the address).
import * as THREE from 'three/webgpu';
import { Assets } from './assets.js';

export async function createRenderer() {
  const forceWebGL = new URLSearchParams(location.search).has('webgl');
  const renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance', forceWebGL });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.id = 'game';
  document.body.prepend(renderer.domElement);
  await renderer.init();
  try { Assets.maxAniso = Math.min(16, renderer.getMaxAnisotropy()); } catch (e) { /* default */ }
  const backend = renderer.backend && renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  return { renderer, backend };
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x8fa6c4, 0.0009);
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2500);
  camera.position.set(0, 3, 10);
  return { scene, camera };
}
