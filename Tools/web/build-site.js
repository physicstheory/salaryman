// Build the Salary Man website: the polished build and the prototype build, playable in a browser with no install.
//
//   node Tools/web/build-site.js --polished <checkout> --polished-sha <sha> \
//        [--proto <checkout> --proto-sha <sha> --proto-ref <name>] --out <site dir>
//
// Site layout (GitHub Pages, see .github/workflows/web.yml and docs/WEB_BUILDS.md):
//   /              a landing page with both builds and the desktop downloads
//   /play/         the polished build (the latest-build release's commit, AAA gated)
//   /prototype/    the prototype build. Only the files that differ from /play/ are stored there; a service worker
//                  (sw.js) answers every other request from /play/, so the two builds fit in one Pages site (1 GB cap).
//   /status.json   which commits are deployed (the workflow reads it back to keep one channel while it rebuilds the other)
//
// No dependencies: plain Node 18+.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) { args[a.slice(2)] = process.argv[i + 1]; i++; }
}
if (!args.polished || !args.out) {
  console.error("usage: build-site.js --polished <checkout> --polished-sha <sha> [--proto <checkout> --proto-sha <sha> --proto-ref <ref>] --out <dir>");
  process.exit(2);
}
const OUT = path.resolve(args.out);
const built = new Date().toISOString();

// What the browser never needs: notes, Python wheels, the author's tools and the old experiments' sources.
const SKIP_FILE = /(\.md|\.whl|\.tar\.gz|\.py|\.pyc|\.blend|\.blend1)$/i;
const SKIP_DIR = new Set(["tools", "__pycache__", ".git"]);

function walk(root) {
  const out = [];
  (function rec(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) rec(path.join(dir, e.name), r); }
      else if (e.isFile() && (!SKIP_FILE.test(e.name) || /LICENSE/i.test(e.name))) out.push(r);
    }
  })(root, "");
  return out;
}
const hash = f => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex");
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// The game page with the channel stamped in front of game/channel.js (and, for the prototype, a guard that sends a
// page opened without its service worker - a hard reload - back through the bootstrap).
const CDN = /https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.128\.0\/(?:build|examples\/js\/loaders)\/(three\.min\.js|GLTFLoader\.js|RGBELoader\.js)/g;
function gamePage(webDir, stamp, guard) {
  let page = fs.readFileSync(path.join(webDir, "konto.html"), "utf8");
  // three.js from our own copy (Game/vendor, the desktop app's) rather than a CDN: one less thing to fail, and same-origin
  const vendor = path.join(webDir, "..", "Game", "vendor");
  page = page.replace(CDN, (m, f) => fs.existsSync(path.join(vendor, f)) ? "vendor/" + f : m);
  const tag = '<script src="game/channel.js"></script>';
  const inject = (guard || "") + "<script>window.KONTO_CHANNEL=" + JSON.stringify(stamp) + ";</script>\n";
  if (page.indexOf(tag) >= 0) page = page.replace(tag, inject + tag);
  else page = page.replace(/<head>/i, "<head>\n" + inject); // an older commit without channel.js still gets the stamp
  return page;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

// ---- polished: /play/ ----------------------------------------------------------------------------------------------
const polWeb = path.join(path.resolve(args.polished), "Web");
const polFiles = walk(polWeb);
const polHash = new Map();
let polBytes = 0;
for (const r of polFiles) {
  const src = path.join(polWeb, r);
  copy(src, path.join(OUT, "play", r));
  polBytes += fs.statSync(src).size;
}
const vendorFiles = dir => { const v = path.join(dir, "..", "Game", "vendor"); return fs.existsSync(v) ? fs.readdirSync(v).filter(f => f.endsWith(".js")).map(f => ["vendor/" + f, path.join(v, f)]) : []; };
for (const [r, src] of vendorFiles(polWeb)) copy(src, path.join(OUT, "play", r));
const polStamp = { name: "polished", commit: args["polished-sha"] || "", ref: "latest-build", built };
fs.writeFileSync(path.join(OUT, "play", "index.html"), gamePage(polWeb, polStamp));
fs.writeFileSync(path.join(OUT, "play", "build.json"), JSON.stringify(polStamp));

// ---- prototype: /prototype/ ----------------------------------------------------------------------------------------
let proto = null;
if (args.proto) {
  const proWeb = path.join(path.resolve(args.proto), "Web");
  const own = [];
  let proBytes = 0;
  const polVendor = new Map(vendorFiles(polWeb));
  const items = walk(proWeb).map(r => [r, path.join(proWeb, r), path.join(polWeb, r)])
    .concat(vendorFiles(proWeb).map(([r, src]) => [r, src, polVendor.get(r) || ""]));
  for (const [r, src, twin] of items) {
    let same = false;
    if (twin && fs.existsSync(twin) && fs.statSync(twin).size === fs.statSync(src).size) {
      if (!polHash.has(r)) polHash.set(r, hash(twin));
      same = polHash.get(r) === hash(src);
    }
    if (same) continue;
    copy(src, path.join(OUT, "prototype", r));
    own.push(r);
    proBytes += fs.statSync(src).size;
  }
  const stamp = { name: "prototype", commit: args["proto-sha"] || "", ref: args["proto-ref"] || "", built };
  const guard = "<script>if(!(navigator.serviceWorker&&navigator.serviceWorker.controller)){location.replace('./'+location.search);window.stop&&window.stop();}</script>\n";
  fs.writeFileSync(path.join(OUT, "prototype", "game.html"), gamePage(proWeb, stamp, guard));
  fs.writeFileSync(path.join(OUT, "prototype", "build.json"), JSON.stringify(stamp));
  own.push("game.html", "build.json", "index.html", "sw.js", "own.json", "");
  fs.writeFileSync(path.join(OUT, "prototype", "own.json"), JSON.stringify({ commit: stamp.commit, files: own }));
  fs.writeFileSync(path.join(OUT, "prototype", "sw.js"),
    fs.readFileSync(path.join(__dirname, "proto-sw.js"), "utf8").replace("__BUILD__", stamp.commit + " " + built));
  fs.writeFileSync(path.join(OUT, "prototype", "index.html"), fs.readFileSync(path.join(__dirname, "proto-boot.html"), "utf8"));
  proto = { stamp, files: own.length, bytes: proBytes };
}

// ---- landing page and status ---------------------------------------------------------------------------------------
const repo = args.repo || "physicstheory/salaryman";
const status = { built, polished: polStamp, prototype: proto ? proto.stamp : null };
fs.writeFileSync(path.join(OUT, "status.json"), JSON.stringify(status, null, 2));
const short = s => (s || "").slice(0, 7);
let landing = fs.readFileSync(path.join(__dirname, "landing.html"), "utf8");
const fill = {
  POL_COMMIT: short(polStamp.commit),
  POL_LINK: "https://github.com/" + repo + "/commit/" + polStamp.commit,
  PRO_COMMIT: proto ? short(proto.stamp.commit) : "",
  PRO_REF: proto ? proto.stamp.ref : "",
  PRO_LINK: proto ? "https://github.com/" + repo + "/commit/" + proto.stamp.commit : "#",
  PRO_HIDDEN: proto ? "" : "hidden",
  BUILT: built,
  RELEASE: "https://github.com/" + repo + "/releases/tag/latest-build"
};
landing = landing.replace(/\{\{(\w+)\}\}/g, (m, k) => esc(fill[k] !== undefined ? fill[k] : m));
fs.writeFileSync(path.join(OUT, "index.html"), landing);

const mb = b => (b / 1048576).toFixed(0) + " MB";
console.log("polished " + short(polStamp.commit) + ": " + polFiles.length + " files, " + mb(polBytes));
if (proto) console.log("prototype " + short(proto.stamp.commit) + " (" + proto.stamp.ref + "): " + proto.files + " own files, " + mb(proto.bytes) + " (the rest is shared with /play/)");
if (polBytes + (proto ? proto.bytes : 0) > 950 * 1048576) console.warn("::warning::the site is close to GitHub Pages' 1 GB limit");
