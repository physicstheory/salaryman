#!/usr/bin/env node
// Is every line spoken? Compares what the scripts say (extract_lines.mjs) with what Web/audio/voice/index.json holds, the same way the
// game looks lines up (voice-all.js: speaker and text, else the text by anyone, else the pieces of a stitched line).
//   node Tools/voice/voice_audit.mjs [--missing]      exit code 1 when anything voiceable has no recording
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extract } from "./extract_lines.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const man = JSON.parse(fs.readFileSync(path.join(ROOT, "Web/audio/voice/index.json"), "utf8"));
const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\*[^*]{1,24}\*/g, "").replace(/\([^)]{0,90}\)/g, "").replace(/[^a-z0-9]+/g, "");
const byNorm = new Set(Object.keys(man.lines).map(k => norm(k.slice(k.indexOf("|") + 1))));
const lines = extract();
const narrSkip = t => /^(\*|Chapter|Respect|Peek)/.test(t) || t.includes("·") || t.includes("—") || (t.match(/[A-Za-z']+/g) || []).length < 3;
let total = 0, ok = 0; const miss = [], by = {};
for (const l of lines) {
  if (l.dyn && l.spk === "") continue;                      // title cards ("Rapid · for {station}") are not spoken
  if (l.text === "This part of Seiko's story is being written. It arrives in the next update.") continue;
  if (l.dyn) {
    const pieces = l.dyn.filter(s => typeof s === "string" && /[A-Za-z]{2}/.test(s));
    total++; const got = pieces.every(p => Object.keys(man.lines).some(k => k.endsWith("|piece|" + p.trim())));
    if (got) ok++; else miss.push(l);
    continue;
  }
  if (!/[A-Za-z]{2}/.test(l.text) || (l.spk === "" && !l.text.startsWith("♪") && narrSkip(l.text)) || (l.spk && l.text.startsWith("♪"))) continue;
  if (!norm(l.text)) continue;
  total++;
  const k = l.kind.replace(/[:-].*/, ""); by[k] = by[k] || [0, 0]; by[k][1]++;
  if (byNorm.has(norm(l.text))) { ok++; by[k][0]++; } else miss.push(l);
}
console.log(`${ok} of ${total} spoken lines have a voice (${(100 * ok / Math.max(1, total)).toFixed(1)}%)`);
for (const k in by) console.log(`  ${k.padEnd(8)} ${by[k][0]}/${by[k][1]}`);
if (process.argv.includes("--missing")) miss.forEach(l => console.log("  missing:", l.spk, "|", l.file + ":" + l.line, "|", (l.text || l.dyn.map(s => s === null ? "{}" : s).join("")).slice(0, 100)));
process.exit(miss.length ? 1 : 0);
