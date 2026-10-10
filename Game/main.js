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

const { app, BrowserWindow, protocol, net, shell, screen } = require("electron");
const path = require("path");
const url = require("url");

const APP_DIR = path.join(__dirname, "app");
const ROOT = __dirname;

protocol.registerSchemesAsPrivileged([
  { scheme: "konto", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

// A long world generation on a cold start looks like a hang unless something
// is on screen, so the window is shown with the page's own loading screen.
let win = null;

function resolve(request) {
  const u = new URL(request.url);
  let rel = decodeURIComponent(u.pathname).replace(/^\/+/, "");
  if (!rel) rel = "index.html";
  // konto://app/... is the staged page; konto://app/../vendor/... is three.js.
  const base = u.hostname === "vendor" ? path.join(ROOT, "vendor") : APP_DIR;
  const full = path.normalize(path.join(base, rel));
  // Nothing outside the two folders this app ships, whatever the url says.
  if (!full.startsWith(APP_DIR) && !full.startsWith(path.join(ROOT, "vendor"))) return null;
  return full;
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1600, Math.round(area.width * 0.9)),
    height: Math.min(900, Math.round(area.height * 0.9)),
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
      backgroundThrottling: false
    }
  });
  win.setMenuBarVisibility(false);
  win.once("ready-to-show", () => win.show());
  win.loadURL("konto://app/index.html");

  // F11 fullscreens, Escape belongs to the game, and links open outside.
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
    if (input.key === "F12") { win.webContents.toggleDevTools(); event.preventDefault(); }
    if (input.control && (input.key === "r" || input.key === "R")) { win.reload(); event.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });
}

// A game wants the discrete GPU and no frame-rate cap from the compositor.
app.commandLine.appendSwitch("force_high_performance_gpu");
app.commandLine.appendSwitch("disable-frame-rate-limit");
app.commandLine.appendSwitch("enable-gpu-rasterization");

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
