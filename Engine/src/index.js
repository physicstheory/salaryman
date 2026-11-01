// Shigoto Engine: public surface. A host page loads three.js, then engine/shigoto.js, then:
//
//   const engine = await SHIGOTO.createEngine({ THREE, renderer, scene, camera, options: { ownsSky: true } });
//   await engine.loadLevel("levels/kanda");
//   // every frame:
//   engine.update(dt, focusPosition);  renderer.render(scene, camera);
//
// Nothing in here knows about Seiko, missions or Tōkonto: those are content, and live in the game.

export { Engine, createEngine, VERSION } from "./core/Engine.js";
export { PRESETS as WEATHER } from "./env/Weather.js";
export { PROP_DEFS } from "./world/Props.js";
export { HostBridge } from "./host/HostBridge.js";
