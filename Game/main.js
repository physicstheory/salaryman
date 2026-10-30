// Salary Man, as a desktop application.
//
// The engine is the same single page the browser build is; what this adds is
// everything a game wants and a tab does not: a window with no chrome, a
// proper fullscreen key, no pinch-zoom or context menu, a real origin so the
// character model can be fetched, and no network call on the way in.
//
// The origin is the part worth knowing about. Loaded from file:// a page has
// an opaque origin and cannot fetch its neighbours, so seiko.glb would never
// arrive. Serving the staged folder over a private konto:// scheme gives the
// page a normal origin without turning web security off.

const { app, BrowserWindow, protocol, net, shell, screen, dialog, ipcMain, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const url = require("url");

const APP_DIR = path.join(__dirname, "app");
const ROOT = __dirname;
const crypto = require("crypto");

protocol.registerSchemesAsPrivileged([
  { scheme: "konto", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

// A long world generation on a cold start looks like a hang unless something
// is on screen, so the window is shown with the page's own loading screen.
let win = null;

// --screenshot <file> loads the world, waits for the loading screen to go, and
// writes a PNG, then quits. It is how the build is smoke-tested without a
// person at the keyboard, and it is the quickest way for anyone to send a
// picture of what their machine actually drew.
function shotPath() {
  const i = process.argv.indexOf("--screenshot");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function takeShot(target) {
  try {
    await win.webContents.executeJavaScript(
      "new Promise(res => { const go = () => { const b = document.getElementById('boot');"
      + " if (b && b.hidden) res(true); else setTimeout(go, 400); }; go(); })", true);
    // A few frames after the loading screen goes, so the first render is done.
    await new Promise(r => setTimeout(r, 2500));
    const img = await win.webContents.capturePage();
    require("fs").writeFileSync(target, img.toPNG());
    console.log("screenshot written to " + target);
  } catch (err) {
    console.error("screenshot failed: " + err.message);
    process.exitCode = 1;
  }
  app.quit();
}

// ---- the player's own files ------------------------------------------------------------------------------------------------------------
// Press F8 (or drop files onto the window) to add a car or road textures. They are copied into a folder that belongs to the player, outside
// the game, and served over the game's own copy, so nothing needs a file explorer, an upload or a rebuild.
const USER_DIR = path.join(app.getPath("userData"), "Your Files");
const SLOTS = [
  { id: "sports", label: "Sports car", re: /revuelto|lambo|huracan|aventador|ferrari|mclaren|porsche|911|supercar|sport|gt/i },
  { id: "sedan", label: "Saloon, taxis and Ryde cars", re: /sedan|saloon|taxi|crown|camry|audi|a7|byd|bmw|mercedes|civic|corolla/i },
  { id: "kei", label: "Kei car", re: /kei|alto|n-?box|wagon|hatch|mini|cappuccino/i },
  { id: "keivan", label: "Kei truck / van", re: /truck|carry|pickup|pit|van|hijet|acty/i },
  { id: "bike", label: "Motorbike", re: /bike|moto|scooter|vespa|cub/i }
];
// Interiors are kept the same way, in their own folder, named by what they are. The game serves them at interiors/<name>.glb.
const INTERIORS = [
  { id: "home", label: "Interior: your home", re: /home|house|flat|apartment|bedroom|room/i },
  { id: "shop", label: "Interior: a shop", re: /shop|store|konbini|conveni|market|cafe|bar/i }
];
const ROAD = [
  { file: "asphalt_diff.jpg", label: "colour", re: /diff|colou?r|albedo|base/i },
  { file: "asphalt_nor.jpg", label: "normal map", re: /nor|normal/i },
  { file: "asphalt_arm.jpg", label: "roughness (ARM)", re: /arm|rough|orm/i }
];
// ---- real music for the radio ------------------------------------------------------------------------------------------------------------
// Songs go in "Add Your Files\music" (or are dropped on the window, or added with F8). Loose files make up the station "My Music"; a sub-folder named
// after a station (gold1, tokonto43, soul, westside, nashville) replaces that station's made-up songs with yours. "Artist - Title.mp3" is read as
// the artist and the title. The game asks for the list at music/index.json and plays the files from music/<station>/<file>.
const MUSIC_STATIONS = [["mymusic", "My Music"], ["gold1", "Gold 1"], ["tokonto43", "Tokonto.43"], ["soul", "Soul Radio"], ["westside", "WestSide Radio"], ["nashville", "Nashville 102.7"]];
const AUDIO_RE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;
function musicDirs() { return [path.join(ROOT, "Add Your Files", "music"), path.join(USER_DIR, "music")]; }
function musicIndex() {
  const out = {}, seen = {};
  const add = (st, file) => {
    const key = st + "/" + file; if (seen[key]) return; seen[key] = 1;
    const base = file.replace(AUDIO_RE, ""), m = /^(.+?)\s+[-\u2013\u2014]\s+(.+)$/.exec(base);
    (out[st] || (out[st] = [])).push({ f: "music/" + st + "/" + file, a: m ? m[1].trim() : "", t: m ? m[2].trim() : base.trim() });
  };
  for (const d of musicDirs()) {
    let names = []; try { names = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of names) {
      if (e.isFile() && AUDIO_RE.test(e.name)) add("mymusic", e.name);
      else if (e.isDirectory() && /^[\w-]+$/.test(e.name)) { try { for (const f of fs.readdirSync(path.join(d, e.name))) if (AUDIO_RE.test(f)) add(e.name.toLowerCase(), f); } catch (x) { /* unreadable */ } }
    }
  }
  return { stations: out };
}
function musicFile(rel) {
  const m = /^music\/([\w-]+)\/([^/\\]+)$/.exec(rel); if (!m || !AUDIO_RE.test(m[2])) return null;
  for (const d of musicDirs()) for (const f of [path.join(d, m[1], m[2]), m[1] === "mymusic" ? path.join(d, m[2]) : ""]) { if (f && fs.existsSync(f)) return f; }
  return null;
}
function userOverride(rel) {
  const mf = musicFile(rel); if (mf) return mf;
  const m = /^cars\/([\w.+-]+\.glb|user\.json)$/i.exec(rel) || /^art\/road\/([\w.+-]+\.jpg)$/i.exec(rel) || /^interiors\/([\w.+-]+\.glb)$/i.exec(rel);
  if (!m) return null;
  const f = path.join(USER_DIR, rel.startsWith("cars") ? "cars" : rel.startsWith("interiors") ? "interiors" : "road", m[1]);
  return fs.existsSync(f) ? f : null;
}
function userJson() { try { return JSON.parse(fs.readFileSync(path.join(USER_DIR, "cars", "user.json"), "utf8")); } catch (e) { return {}; } }
function saveUserJson(j) { fs.mkdirSync(path.join(USER_DIR, "cars"), { recursive: true }); fs.writeFileSync(path.join(USER_DIR, "cars", "user.json"), JSON.stringify(j)); }

// An .obj (with its .mtl and textures beside it) is converted to .glb on the way in, so a model downloaded as OBJ needs no Blender.
async function modelToGlb(f) {
  if (/\.glb$/i.test(f)) return fs.readFileSync(f);
  const obj2gltf = require("obj2gltf");
  if (win) win.webContents.executeJavaScript("typeof say === 'function' && say('Converting the model. A big one can take a minute.', 90)").catch(() => {});
  if (win) win.setProgressBar(2);
  try { return await obj2gltf(f, { binary: true }); }
  finally { if (win) win.setProgressBar(-1); }
}
async function addFiles(files) {
  const added = [];
  // textures and .mtl files dropped with a model belong to the model, not to the road
  const hasModel = files.some(f => /\.(glb|obj)$/i.test(f));
  for (const f of files) {
    const name = path.basename(f);
    if (hasModel && /\.(mtl|jpe?g|png|tga|bmp)$/i.test(name)) continue;
    if (/\.(glb|obj)$/i.test(name)) {
      const ALL = SLOTS.concat(INTERIORS);
      let guess = INTERIORS.findIndex(sl => sl.re.test(name));
      guess = guess >= 0 ? SLOTS.length + guess : SLOTS.findIndex(sl => sl.re.test(name));
      const r = await dialog.showMessageBox(win, {
        type: "question", title: "Add a model", noLink: true, cancelId: ALL.length, defaultId: guess < 0 ? 0 : guess,
        message: "What is \"" + name + "\"?",
        detail: guess < 0 ? "Choose where it goes." : "It looks like: " + ALL[guess].label.toLowerCase() + ".",
        buttons: ALL.map(sl => sl.label).concat(["Skip it"])
      });
      if (r.response >= ALL.length) continue;
      const slot = ALL[r.response];
      if (r.response >= SLOTS.length) {
        fs.mkdirSync(path.join(USER_DIR, "interiors"), { recursive: true });
        try { fs.writeFileSync(path.join(USER_DIR, "interiors", slot.id + ".glb"), await modelToGlb(f)); }
        catch (e) { await dialog.showMessageBox(win, { type: "error", message: "Could not convert " + name, detail: String(e && e.message || e) }); continue; }
        added.push(slot.label);
        continue;
      }
      fs.mkdirSync(path.join(USER_DIR, "cars"), { recursive: true });
      try { fs.writeFileSync(path.join(USER_DIR, "cars", slot.id + ".glb"), await modelToGlb(f)); }
      catch (e) { await dialog.showMessageBox(win, { type: "error", message: "Could not convert " + name, detail: String(e && e.message || e) }); continue; }
      const j = userJson(); j[slot.id] = j[slot.id] || { yaw: 0 }; saveUserJson(j);
      added.push(slot.label);
    } else if (AUDIO_RE.test(name)) {
      const r = await dialog.showMessageBox(win, { type: "question", title: "Add a song", noLink: true, cancelId: MUSIC_STATIONS.length, defaultId: 0,
        message: "Which radio station should \"" + name + "\" play on?", detail: "Songs play on the car radio. \"My Music\" is a station of your own songs; a named station swaps its made-up songs for yours.",
        buttons: MUSIC_STATIONS.map(x => x[1]).concat(["Skip it"]) });
      if (r.response >= MUSIC_STATIONS.length) continue;
      const dir = path.join(USER_DIR, "music", MUSIC_STATIONS[r.response][0]); fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(f, path.join(dir, name));
      added.push("song " + name);
    } else if (/\.(jpe?g|png)$/i.test(name)) {
      let guess = ROAD.findIndex(sl => sl.re.test(name));
      const r = await dialog.showMessageBox(win, {
        type: "question", title: "Add a road texture", noLink: true, cancelId: ROAD.length, defaultId: guess < 0 ? 0 : guess,
        message: "What is \"" + name + "\" for the road?", buttons: ROAD.map(x => x.label).concat(["Skip it"])
      });
      if (r.response >= ROAD.length) continue;
      fs.mkdirSync(path.join(USER_DIR, "road"), { recursive: true });
      fs.copyFileSync(f, path.join(USER_DIR, "road", ROAD[r.response].file));
      added.push("road " + ROAD[r.response].label);
    }
  }
  if (added.length) {
    await dialog.showMessageBox(win, { type: "info", title: "Added", message: "Added: " + added.join(", "), detail: "The world reloads now so they show up." });
    win.reload();
  }
}
async function pickFiles() {
  const r = await dialog.showOpenDialog(win, {
    title: "Add cars or road textures", properties: ["openFile", "multiSelections"],
    filters: [{ name: "Cars, models, textures and songs", extensions: ["glb", "obj", "jpg", "jpeg", "png", "mp3", "m4a", "aac", "ogg", "opus", "wav", "flac"] }]
  });
  if (!r.canceled && r.filePaths.length) await addFiles(r.filePaths);
}
// F7: a car that is facing the wrong way is turned half a circle.
async function flipCar() {
  const j = userJson(), ids = Object.keys(j);
  if (!ids.length) { await dialog.showMessageBox(win, { type: "info", message: "You have not added any cars yet.", detail: "Press F8 to add one." }); return; }
  const r = await dialog.showMessageBox(win, { type: "question", noLink: true, message: "Turn which car round?", buttons: ids.map(id => SLOTS.find(x => x.id === id).label).concat(["Cancel"]), cancelId: ids.length });
  if (r.response >= ids.length) return;
  const id = ids[r.response];
  j[id].yaw = ((j[id].yaw || 0) + Math.PI) % (Math.PI * 2);
  saveUserJson(j);
  win.reload();
}
async function removeUserFiles() {
  const r = await dialog.showMessageBox(win, { type: "warning", noLink: true, message: "Go back to the game's own cars and roads?", detail: "This removes the cars and textures you added.", buttons: ["Remove them", "Cancel"], cancelId: 1, defaultId: 1 });
  if (r.response === 0) { fs.rmSync(USER_DIR, { recursive: true, force: true }); win.reload(); }
}

// ---- updating the game from GitHub -------------------------------------------------------------------------------------------------------
// F9 (or the REFRESH cheat, or the "update" line on the pause menu) pulls the latest Web/ folder of the branch named in update.json and plays
// it from then on. Only files whose contents changed are downloaded. The new files live in the player's own folder, in front of the ones that
// were installed, so nothing in the install is touched and "Go back to the installed version" is just deleting that folder. If the repository
// is private, put a GitHub token (read access to contents) in "Add Your Files\github-token.txt".
const UPDATE_DIR = path.join(app.getPath("userData"), "Update");
const UPDATE_APP = path.join(UPDATE_DIR, "app");
const CDN_SWAPS = {
  "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js": "konto://vendor/three.min.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js": "konto://vendor/GLTFLoader.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/RGBELoader.js": "konto://vendor/RGBELoader.js"
};
function stagePage(page) {      // the same changes tools/stage.js makes: the libraries come from vendor/, and no web fonts
  Object.keys(CDN_SWAPS).forEach(u => { page = page.split(u).join(CDN_SWAPS[u]); });
  page = page.replace(/<link rel="preconnect"[^>]*>\s*/g, "");
  return page.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, "<!-- web fonts dropped for the desktop build; system faces stand in -->\n");
}
const blobSha = buf => crypto.createHash("sha1").update(Buffer.concat([Buffer.from("blob " + buf.length + "\0"), buf])).digest("hex");
function updateConfig() {
  let c = { repo: "physicstheory/salaryman", branch: "claude/friendly-cannon-alnk4v" };
  try { Object.assign(c, JSON.parse(fs.readFileSync(path.join(ROOT, "update.json"), "utf8"))); } catch (e) { /* the defaults */ }
  let token = process.env.GITHUB_TOKEN || "";
  for (const f of [path.join(ROOT, "Add Your Files", "github-token.txt"), path.join(USER_DIR, "github-token.txt")]) {
    try { const t = fs.readFileSync(f, "utf8").trim(); if (t) { token = t; break; } } catch (e) { /* none */ }
  }
  c.token = token;
  return c;
}
function updateManifest() { try { return JSON.parse(fs.readFileSync(path.join(UPDATE_DIR, "manifest.json"), "utf8")); } catch (e) { return null; } }
// A freshly installed copy (a new download of the game) must not be covered by an older update: if the installed page is not the one the update
// was made over, the update is dropped.
function dropStaleUpdate() {
  const m = updateManifest(); if (!m) return;
  let cur = "";
  try { cur = blobSha(fs.readFileSync(path.join(APP_DIR, "index.html"))); } catch (e) { /* none */ }
  if (m.base !== cur) fs.rmSync(UPDATE_DIR, { recursive: true, force: true });
}
async function gh(cfg, pathPart, raw) {
  const headers = { "User-Agent": "SalaryMan-updater", Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json" };
  if (cfg.token) headers.Authorization = "Bearer " + cfg.token;
  let target = "https://api.github.com/repos/" + cfg.repo + pathPart;
  // Without a token the API allows 60 requests an hour, so file downloads go to raw.githubusercontent.com instead, which does not count.
  const m = /^\/contents\/(.+)\?ref=(.+)$/.exec(pathPart);
  if (raw && !cfg.token && m) target = "https://raw.githubusercontent.com/" + cfg.repo + "/" + m[2] + "/" + m[1];
  const r = await fetch(target, { headers });
  if (!r.ok) {
    const hint = r.status === 404 ? " (the repository or branch was not found, or it is private and needs a token in Add Your Files\\github-token.txt)" : r.status === 403 || r.status === 429 ? " (GitHub's rate limit; try again in a little while, or put a token in Add Your Files\\github-token.txt)" : r.status === 401 ? " (the token in github-token.txt was refused)" : "";
    const e = new Error("GitHub answered " + r.status + hint); e.status = r.status; throw e;
  }
  return raw ? Buffer.from(await r.arrayBuffer()) : r.json();
}
const tell = msg => { if (win) win.webContents.executeJavaScript("typeof say === 'function' && say(" + JSON.stringify(msg) + ", 6)").catch(() => {}); };
// The repository is private, so GitHub wants to know who is asking. The player makes a read-only token once (GitHub > Settings > Developer settings >
// Fine-grained tokens: this repository, Contents: read-only), copies it, and chooses "Use the token on my clipboard". It is kept in their own folder.
async function askForToken(cfg, refused) {
  for (;;) {
    const r = await dialog.showMessageBox(win, { type: "info", title: "Update Salary Man", noLink: true, cancelId: 3, defaultId: 1,
      message: refused ? "GitHub refused the saved token." : "GitHub needs a token to download the game.",
      detail: "The game's repository is private, so GitHub wants to know who is asking. Make a token once:\n  1. Press \"Open the token page\" and sign in as the owner of the repository.\n  2. The page is already set up (the \"repo\" box is ticked). Scroll down and press Generate token.\n  3. Copy the token it shows (it starts with ghp_).\n  4. Come back here and press \"Use the token on my clipboard\".\n\nIt is kept on this computer and used only to download the game.",
      buttons: ["Open the token page", "Use the token on my clipboard", "Open the folder instead", "Cancel"] });
    if (r.response === 0) { shell.openExternal("https://github.com/settings/tokens/new?scopes=repo&description=Salary%20Man%20updater"); continue; }
    if (r.response === 2) { fs.mkdirSync(path.join(ROOT, "Add Your Files"), { recursive: true }); shell.openPath(path.join(ROOT, "Add Your Files")); return false; }
    if (r.response !== 1) return false;
    const t = clipboard.readText().trim();
    if (!/^(github_pat_|ghp_|gho_|ghs_)[\w]{20,}$/.test(t)) { await dialog.showMessageBox(win, { type: "warning", message: "That does not look like a GitHub token.", detail: "Copy the token (it starts with github_pat_ or ghp_), then try again." }); continue; }
    try { await gh(Object.assign({}, cfg, { token: t }), "/commits/" + encodeURIComponent(cfg.branch)); }
    catch (e) { await dialog.showMessageBox(win, { type: "warning", message: "GitHub did not accept that token.", detail: String(e.message) }); continue; }
    fs.mkdirSync(USER_DIR, { recursive: true }); fs.writeFileSync(path.join(USER_DIR, "github-token.txt"), t);
    return true;
  }
}
let updating = false;
async function updateGame() {
  if (updating) return;
  const cfg = updateConfig();
  const ask = await dialog.showMessageBox(win, { type: "question", title: "Update Salary Man", noLink: true, cancelId: 1, defaultId: 0,
    message: "Get the latest version of the game?", detail: "From github.com/" + cfg.repo + ", branch " + cfg.branch + ". Your saves are kept.\n" + (updateManifest() ? "You are on update " + updateManifest().commit.slice(0, 7) + "." : "You are on the installed version."),
    buttons: ["Update now", "Cancel", "Go back to the installed version"] });
  if (ask.response === 1) return;
  if (ask.response === 2) { fs.rmSync(UPDATE_DIR, { recursive: true, force: true }); await win.webContents.executeJavaScript("typeof saveGame==='function'&&saveGame('',true)").catch(() => {}); win.reload(); return; }
  updating = true; win.setProgressBar(2);
  try {
    tell("Checking for a new version...");
    const head = await gh(cfg, "/commits/" + encodeURIComponent(cfg.branch));
    const old = updateManifest();
    if (old && old.commit === head.sha) { await dialog.showMessageBox(win, { type: "info", message: "You already have the latest version.", detail: head.sha.slice(0, 7) + ": " + head.commit.message.split("\n")[0] }); return; }
    const tree = await gh(cfg, "/git/trees/" + head.commit.tree.sha + "?recursive=1");
    const files = (tree.tree || []).filter(e => e.type === "blob" && /^Web\/(konto\.html|seiko\.glb|art\/|cars\/[^/]+\.(glb|json)$|kenney\/|people\/|props\/)/.test(e.path) && !/\.md$/i.test(e.path));
    let base = ""; try { base = blobSha(fs.readFileSync(path.join(APP_DIR, "index.html"))); } catch (e) { /* none */ }
    const next = { commit: head.sha, message: head.commit.message.split("\n")[0], base: base, at: Date.now(), files: {} };
    fs.mkdirSync(UPDATE_APP, { recursive: true });
    let done = 0, got = 0;
    for (const e of files) {
      const rel = e.path.slice(4), isPage = rel === "konto.html", dest = path.join(UPDATE_APP, isPage ? "index.html" : rel);
      done++;
      next.files[rel] = e.sha;
      // already there: in the install or in an earlier update
      let have = null;
      try { have = blobSha(fs.readFileSync(isPage ? path.join(UPDATE_APP, "index.html.src") : (fs.existsSync(dest) ? dest : path.join(APP_DIR, rel)))); } catch (x) { /* not there */ }
      if (have === e.sha) continue;
      if (old && old.files && old.files[rel] === e.sha && fs.existsSync(dest)) continue;
      tell("Downloading " + rel + "  (" + done + " of " + files.length + ")");
      win.setProgressBar(done / files.length);
      const data = await gh(cfg, "/contents/" + e.path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(head.sha), true);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (isPage) { fs.writeFileSync(path.join(UPDATE_APP, "index.html.src"), data); fs.writeFileSync(dest, stagePage(data.toString("utf8"))); }
      else fs.writeFileSync(dest, data);
      got++;
    }
    if (!fs.existsSync(path.join(UPDATE_APP, "index.html"))) throw new Error("the update did not contain the game page (Web/konto.html)");
    fs.writeFileSync(path.join(UPDATE_DIR, "manifest.json"), JSON.stringify(next));
    const r = await dialog.showMessageBox(win, { type: "info", noLink: true, defaultId: 0, cancelId: 1, message: "Updated to " + head.sha.slice(0, 7) + ".",
      detail: next.message + "\n\n" + got + " file" + (got === 1 ? "" : "s") + " downloaded. Restart the game now? It saves first.", buttons: ["Restart now", "Later"] });
    if (r.response === 0) { await win.webContents.executeJavaScript("typeof saveGame==='function'&&saveGame('',true)").catch(() => {}); win.webContents.reloadIgnoringCache(); }
  } catch (err) {
    if ((err.status === 404 || err.status === 401 || (err.status === 403 && cfg.token)) && await askForToken(cfg, err.status === 401 || err.status === 403)) { updating = false; win.setProgressBar(-1); return updateGame(); }
    await dialog.showMessageBox(win, { type: "error", message: "Could not update.", detail: String(err && err.message || err) + "\n\nThe game you have still works as it was." });
  } finally { updating = false; win.setProgressBar(-1); }
}
ipcMain.on("update-game", () => { updateGame(); });

function resolve(request) {
  const u = new URL(request.url);
  let rel = decodeURIComponent(u.pathname).replace(/^\/+/, "");
  if (!rel) rel = "index.html";
  // konto://app/... is the staged page; konto://app/../vendor/... is three.js.
  const base = u.hostname === "vendor" ? path.join(ROOT, "vendor") : APP_DIR;
  const over = u.hostname === "vendor" ? null : userOverride(rel);
  if (over) return over;
  if (u.hostname !== "vendor") { const upd = path.normalize(path.join(UPDATE_APP, rel)); if (upd.startsWith(UPDATE_APP) && fs.existsSync(upd) && fs.statSync(upd).isFile()) return upd; }
  const full = path.normalize(path.join(base, rel));
  // Nothing outside the two folders this app ships, whatever the url says.
  if (!full.startsWith(APP_DIR) && !full.startsWith(path.join(ROOT, "vendor"))) return null;
  return full;
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: area.width,
    height: area.height,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: "#0c0e12",
    title: "Salary Man",
    show: false,
    autoHideMenuBar: true,
    icon: path.join(ROOT, "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(ROOT, "preload.js"),
      backgroundThrottling: false,
      autoplayPolicy: "no-user-gesture-required"
    }
  });
  // Opens filling the work area, so the taskbar stays where it is. F11 goes to
  // true fullscreen and back.
  win.maximize();
  win.setMenuBarVisibility(false);
  win.once("ready-to-show", () => win.show());
  win.on("leave-full-screen", () => { if (!win.isDestroyed()) win.maximize(); });
  win.loadURL("konto://app/index.html");
  const target = shotPath();
  if (target) win.webContents.once("did-finish-load", () => takeShot(target));

  // F11 fullscreens, Escape belongs to the game, and links open outside.
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
    if (input.key === "F8") { pickFiles(); event.preventDefault(); }
    if (input.key === "F7") { flipCar(); event.preventDefault(); }
    if (input.key === "F9") { updateGame(); event.preventDefault(); }
    if (input.key === "F6") { removeUserFiles(); event.preventDefault(); }
    if (input.key === "F12") { win.webContents.toggleDevTools(); event.preventDefault(); }
    if (input.control && (input.key === "r" || input.key === "R")) { win.reload(); event.preventDefault(); }
  });
  // Dropping files on the window adds them, instead of the page navigating away to the file.
  win.webContents.on("will-navigate", (event, target) => {
    if (target.startsWith("file:")) { event.preventDefault(); try { addFiles([url.fileURLToPath(target)]); } catch (e) { /* not a path */ } }
  });
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });
}

// A game wants the discrete GPU and no frame-rate cap from the compositor.
app.commandLine.appendSwitch("force_high_performance_gpu");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");

ipcMain.on("add-files", (_e, paths) => { if (Array.isArray(paths)) addFiles(paths.filter(p => typeof p === "string")); });

// Signing in to Spotify for the car radio. The game's page is served from konto://, which Spotify cannot send anyone back to, so the
// sign-in happens in a window of its own on Spotify's page; when Spotify redirects to the loopback address the game registered, that
// navigation is stopped and its address (the one-time code in it) is handed back to the page, which finishes the sign-in itself (PKCE).
// Only Spotify's authorize page is opened, and only a loopback redirect is caught.
ipcMain.handle("spotify-auth", (_e, authUrl, redirect) => new Promise(resolve => {
  if (typeof authUrl !== "string" || !authUrl.startsWith("https://accounts.spotify.com/authorize?") ||
      typeof redirect !== "string" || !/^http:\/\/127\.0\.0\.1:\d+\//.test(redirect)) { resolve(null); return; }
  let done = false;
  const w = new BrowserWindow({ width: 520, height: 780, parent: win || undefined, modal: !!win, title: "Sign in to Spotify", autoHideMenuBar: true,
    backgroundColor: "#121212", webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const finish = u => { if (done) return; done = true; resolve(u); if (!w.isDestroyed()) w.destroy(); };
  const catchRedirect = (ev, u) => { if (typeof u === "string" && u.startsWith(redirect)) { ev.preventDefault(); finish(u); } };
  w.webContents.on("will-redirect", catchRedirect);
  w.webContents.on("will-navigate", catchRedirect);
  w.webContents.setWindowOpenHandler(({ url: t }) => { if (/^https:\/\//.test(t)) shell.openExternal(t); return { action: "deny" }; });
  w.on("closed", () => finish(null));
  w.loadURL(authUrl);
}));

app.whenReady().then(() => {
  dropStaleUpdate();
  protocol.handle("konto", request => {
    if (new URL(request.url).pathname.replace(/^\/+/, "") === "music/index.json") return new Response(JSON.stringify(musicIndex()), { headers: { "content-type": "application/json" } });
    const file = resolve(request);
    if (!file) return new Response("Not found", { status: 404 });
    return net.fetch(url.pathToFileURL(file).toString());
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
