// Shrink Foundry models for the game: merge duplicate textures/accessors, weld, quantize and meshopt-compress the
// geometry. Textures stay JPEG (the AAA gate reads them). three.js r128 decodes with Web/game/lib/meshopt_decoder.js.
//   node Tools/foundry/pack.mjs Web/foundry/trains/commuter_end.glb [...more]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import fs from "node:fs";

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const quiet = { debug() {}, info() {}, warn() {}, error: console.error };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
for (const f of process.argv.slice(2)) {
  const before = fs.statSync(f).size;
  const doc = await io.read(f);
  doc.setLogger(quiet);
  await doc.transform(dedup(), prune({ keepExtras: true, keepSolidTextures: true }), weld(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  await io.write(f, doc);
  console.log("  packed " + f + "  " + (before / 1e6).toFixed(1) + " -> " + (fs.statSync(f).size / 1e6).toFixed(1) + " MB");
}
