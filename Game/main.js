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

const { app, BrowserWindow, protocol, net, shell, screen, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const url = require("url");

const APP_DIR = path.join(__dirname, "app");
const ROOT = __dirname;

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
const ROAD = [
  { file: "asphalt_diff.jpg", label: "colour", re: /diff|colou?r|albedo|base/i },
  { file: "asphalt_nor.jpg", label: "normal map", re: /nor|normal/i },
  { file: "asphalt_arm.jpg", label: "roughness (ARM)", re: /arm|rough|orm/i }
];
function userOverride(rel) {
  const m = /^cars\/([\w.+-]+\.glb|user\.json)$/i.exec(rel) || /^art\/road\/([\w.+-]+\.jpg)$/i.exec(rel);
  if (!m) return null;
  const f = path.join(USER_DIR, rel.startsWith("cars") ? "cars" : "road", m[1]);
  return fs.existsSync(f) ? f : null;
}
function userJson() { try { return JSON.parse(fs.readFileSync(path.join(USER_DIR, "cars", "user.json"), "utf8")); } catch (e) { return {}; } }
function saveUserJson(j) { fs.mkdirSync(path.join(USER_DIR, "cars"), { recursive: true }); fs.writeFileSync(path.join(USER_DIR, "cars", "user.json"), JSON.stringify(j)); }

async function addFiles(files) {
  const added = [];
  for (const f of files) {
    const name = path.basename(f);
    if (/\.glb$/i.test(name)) {
      let guess = SLOTS.findIndex(sl => sl.re.test(name));
      const r = await dialog.showMessageBox(win, {
        type: "question", title: "Add a car", noLink: true, cancelId: SLOTS.length, defaultId: guess < 0 ? 0 : guess,
        message: "Which car does \"" + name + "\" replace?",
        detail: guess < 0 ? "Choose a slot." : "It looks like the " + SLOTS[guess].label.toLowerCase() + ".",
        buttons: SLOTS.map(sl => sl.label).concat(["Skip it"])
      });
      if (r.response >= SLOTS.length) continue;
      const slot = SLOTS[r.response];
      fs.mkdirSync(path.join(USER_DIR, "cars"), { recursive: true });
      fs.copyFileSync(f, path.join(USER_DIR, "cars", slot.id + ".glb"));
      const j = userJson(); j[slot.id] = j[slot.id] || { yaw: 0 }; saveUserJson(j);
      added.push(slot.label);
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
    filters: [{ name: "Cars (.glb) and textures (.jpg, .png)", extensions: ["glb", "jpg", "jpeg", "png"] }]
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

function resolve(request) {
  const u = new URL(request.url);
  let rel = decodeURIComponent(u.pathname).replace(/^\/+/, "");
  if (!rel) rel = "index.html";
  // konto://app/... is the staged page; konto://app/../vendor/... is three.js.
  const base = u.hostname === "vendor" ? path.join(ROOT, "vendor") : APP_DIR;
  const over = u.hostname === "vendor" ? null : userOverride(rel);
  if (over) return over;
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

app.whenReady().then(() => {
  protocol.handle("konto", request => {
    const file = resolve(request);
    if (!file) return new Response("Not found", { status: 404 });
    return net.fetch(url.pathToFileURL(file).toString());
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
