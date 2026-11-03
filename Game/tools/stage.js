// Stage the engine into Game/app, for Electron.
//
// Web/konto.html is written to be served: it pulls three.js from a CDN and
// fetches seiko.glb from the folder beside it. Neither is right for something
// you install and run on a laptop that may be offline, so this copies the page
// in, points it at the vendored libraries, and leaves the model where the
// custom protocol in main.js can serve it.
//
//   node tools/stage.js
//
// It is idempotent, and npm start / npm run dist call it for you.

const fs = require("fs");
const path = require("path");

const GAME = path.resolve(__dirname, "..");
const REPO = path.resolve(GAME, "..");
const SRC = path.join(REPO, "Web");
const OUT = path.join(GAME, "app");

// konto://vendor/... rather than ../vendor/..., because a relative path from
// konto://app/index.html is clamped at the host and would look for the library
// inside the staged folder.
const CDN = {
  "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js": "konto://vendor/three.min.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js": "konto://vendor/GLTFLoader.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/RGBELoader.js": "konto://vendor/RGBELoader.js"
};

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const pagePath = path.join(SRC, "konto.html");
  if (!fs.existsSync(pagePath)) {
    console.error("Could not find " + pagePath + ". Run this from inside the repository.");
    process.exit(1);
  }
  let page = fs.readFileSync(pagePath, "utf8");

  let rewrote = 0;
  Object.keys(CDN).forEach(url => {
    if (page.indexOf(url) < 0) return;
    page = page.split(url).join(CDN[url]);
    rewrote++;
  });
  if (page.indexOf("cdn.jsdelivr.net") >= 0) {
    console.error("The page still points at a CDN after rewriting. Has a script tag moved?");
    process.exit(1);
  }
  Object.values(CDN).forEach(rel => {
    const f = path.join(GAME, "vendor", rel.split("/").pop());
    if (!fs.existsSync(f)) {
      console.error("Missing " + f + ". The vendored libraries are part of the repository.");
      process.exit(1);
    }
  });

  // Google Fonts is a network call too. The page falls back to system faces
  // without it, which is what a laptop with no internet gets.
  page = page.replace(/<link rel="preconnect"[^>]*>\s*/g, "");
  page = page.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g,
    "<!-- web fonts dropped for the desktop build; system faces stand in -->\n");

  fs.writeFileSync(path.join(OUT, "index.html"), page);
  // which commit this build is, for the error engine's reports (Game/main.js buildInfo)
  let commit = process.env.GITHUB_SHA || "";
  if (!commit) try { commit = require("child_process").execSync("git rev-parse HEAD", { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch (e) { /* not a checkout */ }
  fs.writeFileSync(path.join(OUT, "build.json"), JSON.stringify({ commit, staged: new Date().toISOString() }));

  const glb = path.join(SRC, "seiko.glb");
  if (fs.existsSync(glb)) fs.copyFileSync(glb, path.join(OUT, "seiko.glb"));
  else console.warn("seiko.glb is not there; the built-in figure will stand in for him.");

  // Everything else the page fetches at runtime travels with it, whole: art/ (textures, the sky, the radio's recordings), cars/ (the
  // models and user.json, the list that says which of them to fit - without it no imported or exotic car appears), people/ (the
  // pedestrians and Seiko's own model and outfits), props/ (the furniture in the interiors) and kenney/. Only the author's notes stay.
  let cars = 0;
  ["art", "cars", "people", "props", "kenney", "loading", "engine", "levels", "game"].forEach(dir => {
    const from = path.join(SRC, dir);
    if (!fs.existsSync(from)) { console.warn(dir + "/ is not there; the game will do without it."); return; }
    const to = path.join(OUT, dir);
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true, filter: src => !/\.md$/i.test(src) || /LICENSE/i.test(src) });
    if (dir === "cars") cars = fs.readdirSync(to).filter(f => f.endsWith(".glb")).length;
  });
  if (!fs.existsSync(path.join(OUT, "cars", "user.json"))) console.warn("cars/user.json is missing: the imported cars will not be fitted.");

  // "Add Your Files": anything the player drops in there goes over the game's own copy, so a new car or a real road scan is a copy-and-paste,
  // with no upload and no git. cars/*.glb replaces a car of the same name, road/* replaces the road textures, seiko.glb replaces the character.
  const drop = path.join(GAME, "Add Your Files");
  let added = 0;
  const overlay = (from, to, re, mirror) => {
    if (!fs.existsSync(from)) return;
    fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).filter(f => re.test(f)).forEach(f => { fs.copyFileSync(path.join(from, f), path.join(to, f)); if(mirror){fs.mkdirSync(mirror,{recursive:true});fs.copyFileSync(path.join(from,f),path.join(mirror,f));} added++; console.log("  using your file: " + f); });
  };
  overlay(path.join(drop, "cars"), path.join(OUT, "cars"), /\.glb$/i, path.join(OUT,"cars","low"));
  overlay(path.join(drop, "road"), path.join(OUT, "art", "road"), /\.(jpe?g|png)$/i);
  overlay(drop, OUT, /^seiko\.glb$/i);

  console.log("staged app/index.html (" + rewrote + " script tags pointed at vendor/)"
    + (fs.existsSync(glb) ? " and seiko.glb" : "") + ", " + cars + " car models" + (added ? ", " + added + " of your own files" : ""));
}

main();
