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
// Rain: drops, occlusion, splashes, drips, sheets, mist and rain lighting, driven by the weather.
export { RainEngine, RAIN_QUALITY } from "./rain/RainEngine.js";
export { PROP_DEFS, drawProp, makeParts } from "./world/Props.js";
export { PROP_SLOTS, SLOT_MATERIALS } from "./world/PropSlots.js";
export { HostBridge } from "./host/HostBridge.js";
// Characters: hyper-realistic people (PBR maps, skin scattering, cloth sheen, hair, subdivision). Needs only THREE.
export { Characters, characters, CHAR_QUALITY, kindOf, bipedNames } from "./characters/Characters.js";
export { subdivideGeometry } from "./characters/Subdivide.js";
export { synthesizeMaps } from "./characters/MapSynth.js";
// Persistence: build the whole world behind the loading screen, check it, warm the GPU, and keep it resident.
export { Persistence, ResidentSet, estimateBytes, scanScene, shaderFailures, warmGPU, memoryBudget, MEMORY_BUDGET } from "./persist/Persistence.js";
// Standing: honor (what you do: crimes down, kindness up) and respect (how people regard you: rank, greetings), with their HUD.
export { Honor, HONOR_TIERS } from "./standing/Honor.js";
export { Respect, RESPECT_TIERS, TEMPERS } from "./standing/Respect.js";
export { StandingHud, STANDING_ICONS } from "./standing/StandingHud.js";
// Vehicles: motorcycle and bicycle dynamics (sprung wheels, magic-formula tyres, engine and clutch, wheelies, stoppies, jumps, crashes).
export { Motorcycle, BIKE_SPECS } from "./vehicles/Motorcycle.js";
// Boats: a lofted hull cut into faces, each pressed on by the real swell (buoyancy, planing lift, drag), a propeller or jet that can
// ventilate, steering foils, grounding. Ocean is the CPU twin of the water shader's Gerstner waves.
export { Boat, BOAT_SPECS, buildHull } from "./vehicles/Boat.js";
export { Ocean, GERSTNER_WAVES } from "./vehicles/Ocean.js";
// Ragdoll: limp bodies that fall, tumble and slide under real physics on any rigged human, then get back up. Needs only THREE.
export { RagdollSystem, RAGDOLL_JOINTS, findRagdollBones } from "./ragdoll/Ragdoll.js";
