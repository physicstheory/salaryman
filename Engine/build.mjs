// Bundle the engine into one classic script, Web/engine/shigoto.js, that sets window.SHIGOTO.
// three.js stays outside the bundle: the engine uses whatever THREE the host page already loaded,
// so the game and the engine always share one copy (and one renderer).
import { build } from "esbuild";
import { fileURLToPath } from "url";
import path from "path";
const here = path.dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [path.join(here, "src/index.js")],
  bundle: true,
  format: "iife",
  globalName: "SHIGOTO",
  minify: process.argv.includes("--min"),
  sourcemap: false,
  target: ["chrome110"],
  outfile: path.join(here, "../Web/engine/shigoto.js"),
  banner: { js: "/* Shigoto Engine - the runtime under Salary Man. Built from Engine/src; do not edit by hand. */" },
  logLevel: "info"
});
