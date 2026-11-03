// Writes docs/ERROR_CODES.md from the code table in Web/game/error-engine.js (the one source of truth), and checks every SM- code used in
// Game/main.js is in it.   node Tools/qa/error-codes.mjs          write the doc
//                          node Tools/qa/error-codes.mjs --check  fail if the doc is stale or a code is unknown
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(path.join(ROOT, "Web/game/error-engine.js"), "utf8");
const m = /const CODES = (\{[\s\S]*?\n  \});/.exec(src);
if (!m) { console.error("error-codes: no CODES table in error-engine.js"); process.exit(1); }
const CODES = vm.runInNewContext("(" + m[1] + ")");

const AREAS = { JS: "Scripts", ENG: "Shigoto engine", GPU: "Graphics", AST: "Assets", PER: "World preload (persistence)", BOOT: "Loading and frame loop",
  MEM: "Memory", SAV: "Saving", ELC: "Desktop app (Electron)" };
const esc = s => String(s).replace(/\|/g, "\\|");
const L = [];
L.push("# Salary Man error codes", "",
  "Generated from the table in `Web/game/error-engine.js` by `node Tools/qa/error-codes.mjs`. Do not edit by hand.", "",
  "When something goes wrong the game shows a code like **SM-GPU-001-3FA2** with *Copy report* and *Open GitHub issue* buttons.",
  "`SM-GPU-001` is the kind of fault (below). The last four characters are a fingerprint of the message and the top of the stack: the same bug",
  "gives the same fingerprint from run to run, so two pastes with the same full code are the same problem.", "",
  "**For Claude, when Duncan pastes a code or report:** find the code here, read *Where to look*, then use the report's Message, Stack, GPU line",
  "and recent log. Reports are also in `<userData>/error-log.txt` on his PC (`%APPDATA%/Salary Man/error-log.txt` on Windows), and GPU process",
  "events in `gpu-log.txt` beside it. In game, Ctrl+Shift+E lists everything this session has reported; in the console, `errors()`.", "",
  "Severity *error* shows a card; *warn* only counts on the small pill in the corner (the game carries on).", "");
for (const [area, name] of Object.entries(AREAS)) {
  const rows = Object.entries(CODES).filter(([k]) => k.split("-")[1] === area);
  if (!rows.length) continue;
  L.push("## " + name, "", "| Code | Severity | What the player sees | Where to look |", "|---|---|---|---|");
  for (const [k, v] of rows) L.push("| `" + k + "` | " + v.sev + " | **" + esc(v.title) + "**. " + esc(v.hint) + " | " + esc(v.look) + " |");
  L.push("");
}
const known = new Set(Object.keys(CODES));
const unknownArea = [...known].filter(k => !AREAS[k.split("-")[1]]);
const doc = L.join("\n");
const out = path.join(ROOT, "docs/ERROR_CODES.md");
const used = new Set();
for (const f of ["Game/main.js", "Web/game/error-engine.js"]) for (const c of fs.readFileSync(path.join(ROOT, f), "utf8").match(/SM-[A-Z]+-\d{3}/g) || []) used.add(c);
const missing = [...used].filter(c => !known.has(c));
const problems = [];
if (missing.length) problems.push("codes used but not in the table: " + missing.join(", "));
if (unknownArea.length) problems.push("codes with no area heading: " + unknownArea.join(", "));
for (const [k, v] of Object.entries(CODES)) if (!v.title || !v.hint || !v.look || !/^(error|warn)$/.test(v.sev)) problems.push(k + " is missing title/hint/look/sev");
if (process.argv.includes("--check")) {
  const cur = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (cur !== doc) problems.push("docs/ERROR_CODES.md is stale: run node Tools/qa/error-codes.mjs");
} else fs.writeFileSync(out, doc);
if (problems.length) { console.error("error-codes: " + problems.join("\n  ")); process.exit(1); }
console.log("error-codes: " + known.size + " codes" + (process.argv.includes("--check") ? ", doc up to date" : ", wrote docs/ERROR_CODES.md"));
