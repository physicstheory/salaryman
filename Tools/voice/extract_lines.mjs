#!/usr/bin/env node
// Every spoken line in the game, found by reading the scripts (not by guessing from loudness or by playing): a JavaScript parser walks
// Web/konto.html and Web/game/*.js and picks out what people say, and who says it.
//
//   node Tools/voice/extract_lines.mjs [--out file.json] [--stats] [--dump]
//
// What counts as speech (and whose):
//   cutscene lines          [t, "Speaker", text]                                              the speaker
//   conversation lines      lines: [["Speaker", text], ...]  and  { who: "Speaker", say: text } the speaker
//   Care Desk calls         O.calls.x = { who: "Family Given", nodes: { say, opts: [{ t, reply }] }, hangup }
//                                                                                              the caller (say, reply, hangup), Seiko (t)
//   people tables           { short: "Mori", hello, bye }                                      that person
//   quoted speech           "Gondō: “text”", "Kimura, typing: “text”"                          the name before the colon
//   Seiko's answers         opts: [{ t: text }] in a conversation (not stage directions), labels in “quotes”
//   a few tables by name    PED_LINES (anyone in the street), TALK_LINES (the radio hosts), BARKS (barks.js)
// A text glued together at run time ("at " + v.name + " under ...") is kept as its pieces: the literal pieces are voiced, and the
// runtime stitches them around the names it knows (voice-all.js).
// Output: [{ spk, text, kind, file, line, dyn?: [pieces], phone? }], spk "?" = not known from the script (decided at run time).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as acorn from "./vendor/acorn.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

export function sources() {
  const out = [["Web/konto.html", null]];
  for (const f of fs.readdirSync(path.join(ROOT, "Web/game")).sort()) if (f.endsWith(".js")) out.push(["Web/game/" + f, null]);
  return out;
}

// konto.html: the inline scripts, each parsed on its own, with their line offsets
function chunks(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (!rel.endsWith(".html")) return [{ code: src, line0: 0 }];
  const out = [], re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(src))) {
    if (m[1] && /src=|type="(?!text\/javascript)/.test(m[1])) continue;
    out.push({ code: m[2], line0: src.slice(0, m.index + m[0].indexOf(">") + 1).split("\n").length - 1 });
  }
  return out;
}

const SPEAKERISH = /^[A-ZŌŪ][\wōūéā'’.-]*(?: [A-ZŌŪ][\wōūéā'’.-]*){0,2}$/;
const words = s => (String(s).match(/[A-Za-zÀ-ž']+/g) || []).length;
const isSentence = s => typeof s === "string" && words(s) >= 1 && /[a-z]/i.test(s) && !/^[a-z_]+$/.test(s) && !/^https?:|\.(js|glb|png|ogg|json)$/.test(s);

// the strings an expression can be: [{ text } | { dyn: [string | null, ...] }]
function values(n, depth = 0) {
  if (!n || depth > 6) return [];
  switch (n.type) {
    case "Literal": return typeof n.value === "string" ? [{ text: n.value }] : [];
    case "TemplateLiteral":
      if (!n.expressions.length) return [{ text: n.quasis[0].value.cooked }];
      return [{ dyn: n.quasis.flatMap((q, i) => i < n.expressions.length ? [q.value.cooked, null] : [q.value.cooked]) }];
    case "ConditionalExpression": return [...values(n.consequent, depth + 1), ...values(n.alternate, depth + 1)];
    case "LogicalExpression": return [...values(n.left, depth + 1), ...values(n.right, depth + 1)];
    case "ArrayExpression": return n.elements.flatMap(e => values(e, depth + 1));
    case "MemberExpression": return n.object.type === "ArrayExpression" ? values(n.object, depth + 1) : [];
    case "CallExpression": {
      // pick([...]), x.replace(...) on a literal, fill(pick(...)) and friends: what goes in is what comes out
      const a = n.arguments.flatMap(e => values(e, depth + 1));
      if (n.callee.type === "MemberExpression" && n.callee.property.name === "replace") return [];
      return a;
    }
    case "BinaryExpression": {
      if (n.operator !== "+") return [];
      const parts = [];
      const flat = e => { if (e.type === "BinaryExpression" && e.operator === "+") { flat(e.left); flat(e.right); } else parts.push(e); };
      flat(n);
      // every piece is a literal (or a choice of literals): still a fixed set of texts
      const lit = parts.map(p => p.type === "Literal" && typeof p.value === "string" ? [p.value] : p.type === "ConditionalExpression" ? values(p).filter(v => v.text !== undefined).map(v => v.text) : null);
      if (lit.every(x => x && x.length) && lit.reduce((a, x) => a * x.length, 1) <= 8) {
        let acc = [""]; lit.forEach(x => { acc = acc.flatMap(a => x.map(y => a + y)); }); return acc.map(t => ({ text: t }));
      }
      const dyn = [];
      parts.forEach(p => { const v = p.type === "Literal" && typeof p.value === "string" ? p.value : p.type === "TemplateLiteral" && !p.expressions.length ? p.quasis[0].value.cooked : null;
        if (v !== null) { if (typeof dyn[dyn.length - 1] === "string") dyn[dyn.length - 1] += v; else dyn.push(v); } else if (dyn[dyn.length - 1] !== null) dyn.push(null); });
      return [{ dyn }];
    }
  }
  return [];
}

// "Gondō: “…”", "Kimura, typing: “…”", "Someone, as you walk away: “…”" -> [{ spk, text }]; spk null when nobody is named
const QUOTE = /(?:(?:^|[.!?…)]\s+|^\s*|<b>)([A-ZŌŪ][\wōūéā'’.-]*(?: [A-ZŌŪ][\wōūéā'’.-]*){0,2})(?:,[^:“”]{0,40})?:(?:<\/b>)?\s*)?“([^”]+)”/g;
export function quotes(s) {
  const out = []; let m; QUOTE.lastIndex = 0;
  while ((m = QUOTE.exec(s))) out.push({ spk: m[1] || null, text: m[2] });
  return out;
}

const NOT_SPEECH = /^(Take|Walk|Leave|Pay|Give|Bow|Say nothing|Nod|Shake|Stay|Hand|Drink|Refuse|Accept|Go |Sit|Stand|Look|Ignore|Keep walking|Hang up|Pick up|Answer|Decline|Fight|Run|Follow|Wait|Call|Open|Close|Read|Buy|Sell|Order|Check|Skip|Head|Drive|Get in|Get out|Back|Cancel|Continue|Done|OK|Yes|No|Not now|Later|Maybe later|Listen|Smile|Laugh|Shrug|Sign|Put|Show|Hide|Burn|Delete|Forward|Report|Text|Message|Send|Stay quiet|Quietly|Silently|Bribe|Threaten|Punch|Hit|Push|Shove|Kick|Shoot|Draw|Pocket|Slip|Tip|Leave it|Walk away|Turn|Throw|Pour|Sip|Down|Toast|Eat|Sleep|Rest|Bow deeply|Bow low)\b/;
function seikoSays(t) {
  if (!isSentence(t)) return false;
  if (/^“/.test(t)) return true;
  if (/^\(|\)$|^\[|^…$/.test(t)) return false;
  if (NOT_SPEECH.test(t) && !/\b(I|I'm|I'll|I've|me|my|we|we'll|us|you|your)\b/.test(t)) return false;
  return words(t) >= 2;
}

// who an unattributed line can belong to, from where it sits (the table key or the function it is in)
const AH = { ishikawa: "Ishikawa", mori: "Mori", nakano: "Nakano", fujita: "Fujita", gondo: "Gondō", otsuka: "Ōtsuka" };
const HINTS = {
  "Web/game/afterhours.js": names => {
    for (const n of names) if (AH[n]) return [AH[n]];
    if (names.includes("clientDinner")) return ["Ōtsuka"];
    if (names.includes("any") || names.includes("call") || names.includes("answer") || names.includes("round") || names.includes("talk") || names.includes("activity")) return ["Ishikawa", "Mori", "Nakano", "Fujita", "Gondō"];
    return null;
  }
};
function ctxNames(anc) {
  const out = [];
  for (let i = anc.length - 1; i >= 0; i--) {
    const a = anc[i];
    if (a.type === "Property") out.push(keyOf(a));
    else if (a.type === "FunctionDeclaration" && a.id) out.push(a.id.name);
    else if (a.type === "VariableDeclarator" && a.id && a.id.name) out.push(a.id.name);
    else if (a.type === "AssignmentExpression" && a.left.type === "MemberExpression" && a.left.property) out.push(a.left.property.name);
  }
  return out;
}
let CUR = { rel: "", anc: [] };
const candsFor = () => { const h = HINTS[CUR.rel]; return (h && h(ctxNames(CUR.anc))) || null; };

function walk(node, anc, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node, anc);
  anc.push(node);
  for (const k in node) {
    if (k === "type" || k === "start" || k === "end" || k === "loc") continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && walk(c, anc, visit));
    else if (v && typeof v.type === "string") walk(v, anc, visit);
  }
  anc.pop();
}
const keyOf = p => p && p.type === "Property" ? (p.key.name || p.key.value) : null;
const propOf = (obj, k) => obj && obj.type === "ObjectExpression" ? obj.properties.find(p => keyOf(p) === k) : null;
const strProp = (obj, k) => { const p = propOf(obj, k); return p && p.value.type === "Literal" && typeof p.value.value === "string" ? p.value.value : null; };

export function extract() {
  const out = [], seen = new Set();
  const add = (spk, v, kind, file, line, extra) => {
    const list = Array.isArray(v) ? v : [v];
    for (const x of list) {
      if (x.text !== undefined) {
        const qs = quotes(x.text);
        // a line that is all quotes (“Arigatō.” The bag is heavier…) is its quotes; a line with none is itself
        if (qs.length && kind !== "cut") { qs.forEach(q => add1(q.spk || spk, q.text, kind + "-q", file, line, extra)); continue; }
        add1(spk, x.text, kind, file, line, extra);
      } else if (x.dyn) {
        const lit = x.dyn.filter(s => typeof s === "string").join(" ");
        if (lit.includes("“") && kind !== "cut") {         // "Name: “" + text + "”": the quote is a variable, not a line here
          const qs = quotes(lit); qs.forEach(q => add1(q.spk || spk, q.text, kind + "-q", file, line, extra)); continue;
        }
        if (words(lit) < 2) continue;
        if (spk === null || spk === undefined) spk = "?";
        const cands = spk === "?" ? candsFor() : null; if (cands && cands.length === 1) spk = cands[0];
        if (cands && cands.length > 1) extra = { ...extra, cands };
        const k = spk + "|dyn|" + x.dyn.map(s => s === null ? "{}" : s).join("");
        if (seen.has(k)) continue; seen.add(k);
        out.push({ spk, dyn: x.dyn, kind, file, line, ...extra });
      }
    }
  };
  const add1 = (spk, text, kind, file, line, extra) => {
    text = String(text).replace(/\s+/g, " ").trim();
    if (!isSentence(text)) return;
    if (spk === null || spk === undefined) spk = "?";
    const cands = spk === "?" ? candsFor() : null;
    if (cands && cands.length === 1) spk = cands[0];
    const k = spk + "|" + text; if (seen.has(k)) return; seen.add(k);
    out.push({ spk, text, kind, file, line, ...extra, ...(cands && cands.length > 1 ? { cands } : {}) });
  };
  for (const [rel] of sources()) {
    for (const ch of chunks(rel)) {
      let ast;
      try { ast = acorn.parse(ch.code, { ecmaVersion: "latest", sourceType: "script", locations: true, allowReturnOutsideFunction: true, allowHashBang: true }); }
      catch (e) { console.warn("[extract] cannot parse", rel, "at", ch.line0 + (e.loc ? e.loc.line : 0), e.message); continue; }
      const handled = new WeakSet();
      walk(ast, [], (n, anc) => {
        CUR = { rel, anc };
        const line = ch.line0 + (n.loc ? n.loc.start.line : 0);
        const parent = anc[anc.length - 1], gp = anc[anc.length - 2];
        // cutscene: [t, "Speaker", text]
        if (n.type === "ArrayExpression" && n.elements.length >= 3 && n.elements[0] && n.elements[0].type === "Literal" && typeof n.elements[0].value === "number" &&
            n.elements[1] && n.elements[1].type === "Literal" && typeof n.elements[1].value === "string") {
          const spk = n.elements[1].value;
          if (spk === "" || SPEAKERISH.test(spk)) { add(spk === "" ? "" : spk, values(n.elements[2]), "cut", rel, line); handled.add(n.elements[2]); markLits(n.elements[2], handled); }
          return;
        }
        // ["Speaker", text] in lines: [...] (or any list of such pairs)
        if (n.type === "ArrayExpression" && n.elements.length === 2 && n.elements[0] && n.elements[0].type === "Literal" && typeof n.elements[0].value === "string" &&
            SPEAKERISH.test(n.elements[0].value) && parent && parent.type === "ArrayExpression") {
          const holder = gp && gp.type === "Property" ? keyOf(gp) : null;
          const vs = values(n.elements[1]);
          const sentence = vs.some(v => (v.text && words(v.text) >= 2) || v.dyn);
          const real = vs.some(v => v.text && words(v.text) >= 3 && /[.!?…]/.test(v.text) && !/^#/.test(v.text));
          if (sentence && (holder === "lines" || real && ( holder === "chatter" || holder === "talk" || parent.elements.every(e => e && e.type === "ArrayExpression" && e.elements.length === 2)))) {
            add(n.elements[0].value, vs, "pair", rel, line); markLits(n.elements[1], handled);
          }
          return;
        }
        if (n.type !== "Property") {
          if (n.type === "Literal" && typeof n.value === "string" && !handled.has(n) && n.value.includes("“") && !ctxNames(anc).some(x => /^draw|^paint|^say2$/.test(x || ""))) {
            // quoted speech anywhere: in an answer list it is Seiko's, else the name before the colon, else not known
            const inOpts = anc.some(a => a.type === "Property" && (keyOf(a) === "opts" || keyOf(a) === "options"));
            quotes(n.value).filter(q => q.spk || (words(q.text) >= 2 && /^[^a-z]/.test(q.text))).forEach(q => add1(q.spk || (inOpts && !/^\s*[A-Z][^“]*:\s*“/.test(n.value) ? "Seiko" : null), q.text, "quote", rel, line));
          }
          if (n.type === "BinaryExpression" && n.operator === "+" && !handled.has(n) && !(parent && parent.type === "BinaryExpression")) {
            // "Nakano: “" + text + "”" built at run time, or "“Seiko-san, I left it at " + v.name + "…”"
            const vs = values(n); if (vs.length === 1 && vs[0].dyn) {
              const d = vs[0].dyn, lit = d.filter(s => typeof s === "string").join("");
              const open = lit.indexOf("“");
              if (open >= 0 && d.some(s => s === null)) {
                // the speaker is the "Name: " before the opening quote, if any
                const pre = (d.find(s => typeof s === "string" && s.includes("“")) || "").split("“")[0];
                const m = pre.match(/([A-ZŌŪ][\wōū'.-]*(?: [A-ZŌŪ][\wōū'.-]*){0,2})(?:,[^:]{0,40})?:\s*$/);
                // keep only the part inside the quotes
                let inside = false; const piece = [];
                d.forEach(s => {
                  if (s === null) { if (inside) piece.push(null); return; }
                  let t = s, o = "";
                  for (const c of t) { if (c === "“") { inside = true; continue; } if (c === "”") { inside = false; continue; } if (inside) o += c; }
                  if (o) { if (typeof piece[piece.length - 1] === "string") piece[piece.length - 1] += o; else piece.push(o); }
                });
                if (piece.some(s => s === null) && piece.filter(s => typeof s === "string").join(" ").trim().length > 6) {
                  const k2 = "dynq|" + piece.map(s => s === null ? "{}" : s).join("");
                  if (!seen.has(k2)) { seen.add(k2); const c = m ? null : candsFor(); out.push({ spk: m ? m[1] : c && c.length === 1 ? c[0] : "?", dyn: piece, kind: "quote-dyn", file: rel, line, ...(c && c.length > 1 ? { cands: c } : {}) }); }
                }
                markLits(n, handled);
              }
            }
          }
          return;
        }
        const k = keyOf(n), obj = parent;
        const callOf = () => anc.slice().reverse().find(a => a.type === "ObjectExpression" && propOf(a, "patience") && strProp(a, "who"));
        const whoUp = () => { for (let i = anc.length - 1; i >= 0; i--) { const a = anc[i]; if (a.type !== "ObjectExpression") continue; const w = strProp(a, "who") || strProp(a, "short"); if (w && SPEAKERISH.test(w)) return w; } return null; };
        if (k === "say" || k === "hello" || k === "bye" || k === "q" || k === "hangup" || k === "line" || k === "greet" || k === "meet") {
          const call = callOf();
          const spk = call ? strProp(call, "who").split(" ")[0] : k === "meet" ? "Officer" : (strProp(obj, "who") || strProp(obj, "short") || (k === "line" && strProp(obj, "name")) || (k === "q" || k === "say" ? null : whoUp()));
          // quest { say: text } steps are notices: only their quotes are speech
          const notice = k === "meet" ? false : k === "say" && !call && !strProp(obj, "who") && !propOf(obj, "opts");
          const vs = values(n.value);
          if (notice) vs.forEach(v => v.text && quotes(v.text).forEach(q => add1(q.spk, q.text, "notice-q", rel, line)));
          else if (k === "meet") vs.forEach(v => v.text && quotes(v.text).forEach(q => add1("Officer", q.text, "meet-q", rel, line)));
          else add(spk, vs, call ? "call" : k, rel, line, call ? { phone: 1, as: strProp(call, "who") } : undefined);
          markLits(n.value, handled);
          return;
        }
        if (k === "reply") {
          const call = callOf();
          const vs = values(n.value);
          if (call) add(strProp(call, "who").split(" ")[0], vs, "call", rel, line, { phone: 1, as: strProp(call, "who") });
          else vs.forEach(v => { if (!v.text) return; const qs = quotes(v.text);
            if (qs.length) qs.forEach(q => add1(q.spk, q.text, "reply-q", rel, line));
            else if (HINTS[rel] && candsFor()) add1(null, v.text, "reply", rel, line); });   // after hours: the answer is theirs, said aloud
          markLits(n.value, handled);
          return;
        }
        if ((k === "t" || k === "label") && anc.some(a => a.type === "Property" && keyOf(a) === "opts") && gp && gp.type === "ArrayExpression" && !propOf(obj, "delta")) {
          const call = !!callOf();
          values(n.value).forEach(v => { if (v.text && (call || seikoSays(v.text))) { const qs = quotes(v.text); if (qs.length) qs.forEach(q => add1("Seiko", q.text, "answer", rel, line)); else add1("Seiko", v.text, "answer", rel, line); } });
          markLits(n.value, handled);
        }
      });
      // named tables, and lines handed straight to the street's own say (standing-hook's sayLine)
      walk(ast, [], (n) => {
        // desk.say("Seiko", "…"), desk.say(caller, ["Hello?", …][i]): the Care Desk's own lines
        if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && n.callee.property && n.callee.property.name === "say" && n.arguments.length === 2) {
          const a0 = n.arguments[0], spk = a0.type === "Literal" && typeof a0.value === "string" && SPEAKERISH.test(a0.value) ? a0.value : null;
          values(n.arguments[1]).forEach(v => v.text && words(v.text) >= 1 && /[A-Za-z]{2}/.test(v.text) && add1(spk || "?", v.text.replace(/\s*\*click\*\s*$/, ""), "desk", rel, ch.line0 + n.loc.start.line));
        }
        if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "sayLine" && n.arguments[0])
          values(n.arguments[0]).forEach(v => v.text && words(v.text) >= 1 && /[A-Za-z]{2}/.test(v.text) && add1("?", v.text, "bark:standing", rel, ch.line0 + n.loc.start.line));
        if (n.type !== "VariableDeclarator" || !n.id || !n.init) return;
        const name = n.id.name, line = ch.line0 + n.loc.start.line;
        if (name === "PED_LINES" || name === "BARKS" || (name === "LINES" && rel.endsWith("standing-hook.js"))) n.init.properties && n.init.properties.forEach(p => values(p.value).forEach(v => v.text && add1("?", v.text, "bark:" + (p.key.name || p.key.value), rel, line)));
      });
    }
  }
  return out;
}
function markLits(n, set) { walk(n, [], x => { if (x.type === "Literal" || x.type === "BinaryExpression") set.add(x); }); }

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const lines = extract();
  if (args.includes("--stats")) {
    const by = {}; lines.forEach(l => { const k = l.kind.replace(/:.*/, ""); by[k] = (by[k] || 0) + 1; });
    const spk = {}; lines.forEach(l => { spk[l.spk] = (spk[l.spk] || 0) + 1; });
    console.log(lines.length, "lines;", lines.filter(l => l.dyn).length, "built at run time"); console.log(by); console.log(spk);
  }
  if (args.includes("--dump")) lines.forEach(l => console.log([l.spk, l.kind, l.file.replace("Web/", "") + ":" + l.line, l.text || l.dyn.map(s => s === null ? "{…}" : s).join("")].join(" | ")));
  if (opt("--out")) fs.writeFileSync(opt("--out"), JSON.stringify(lines, null, 0));
}
