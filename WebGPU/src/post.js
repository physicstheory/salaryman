// The post-processing chain: the scene, ambient occlusion (GTAO), bloom, then tone mapping and the output colour transform.
// Built again whenever the graphics settings change. If the node pipeline is unavailable the game renders straight to the canvas.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';

export function buildPost(renderer, scene, camera, { bloom: useBloom = true, ssao = true } = {}) {
  try {
    const scenePass = pass(scene, camera);
    if (ssao) scenePass.setMRT(mrt({ output, normal: normalView }));
    const color = scenePass.getTextureNode('output');
    let out = color;
    if (ssao) {
      const depth = scenePass.getTextureNode('depth');
      const normal = scenePass.getTextureNode('normal');
      const aoPass = ao(depth, normal, camera);
      aoPass.resolutionScale = 0.5;
      aoPass.radius = 1.4;
      aoPass.thickness = 1.2;
      aoPass.distanceExponent = 1.4;
      aoPass.scale = 1.1;
      out = color.mul(aoPass.getTextureNode());
    }
    if (useBloom) out = out.add(bloom(out, 0.3, 0.55, 0.92));
    const post = new THREE.PostProcessing(renderer);
    post.outputNode = out;
    return post;
  } catch (err) {
    console.warn('post-processing unavailable, rendering directly:', err);
    return null;
  }
}
