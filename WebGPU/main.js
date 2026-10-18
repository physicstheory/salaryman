'use strict';

const { app, BrowserWindow, session, globalShortcut, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.argv.includes('--dev') || !app.isPackaged;

// ---- GPU: hardware acceleration stays on, WebGPU is enabled, and the discrete GPU is preferred.
// Everything here must be set before the app is ready.
const features = ['Vulkan', 'WebGPU'];
if (process.platform === 'linux') features.push('VaapiVideoDecoder');
app.commandLine.appendSwitch('enable-features', features.join(','));
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// The game is served from its own secure origin (game://app/), not from file://, so that fetch(), ES modules and WebGPU all behave as they do on the web.
protocol.registerSchemesAsPrivileged([{ scheme: 'game', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.glb': 'model/gltf-binary', '.obj': 'text/plain; charset=utf-8', '.mtl': 'text/plain; charset=utf-8', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

// One copy of the game at a time.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    fullscreen: true,          // true fullscreen on the display the window opens on
    simpleFullscreen: true,    // macOS: borderless without a separate Space
    frame: false,              // no title bar, no border
    thickFrame: false,
    autoHideMenuBar: true,
    resizable: false,
    show: false,               // shown once the first frame is ready, so there is no white flash
    backgroundColor: '#000000',
    title: 'Salary Man',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webgl: true,
      spellcheck: false,
      backgroundThrottling: false,   // keep the game loop at full rate even if focus moves
      devTools: isDev
    }
  });

  win.removeMenu();
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // The page is the game; it never navigates and never opens windows.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // F11 toggles fullscreen, Ctrl/Cmd+Q quits, F12 opens the dev tools when running unpackaged.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (mod && input.key.toLowerCase() === 'q') {
      app.quit();
      event.preventDefault();
    } else if (isDev && input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  win.on('closed', () => {
    win = null;
  });

  // for automated checks: SALARYMAN_SHOT=/path/shot.png saves a screenshot after the game has booted, prints the page's console, and quits
  if (process.env.SALARYMAN_SHOT) {
    win.webContents.on('console-message', (_e, level, message) => { if (level >= 2 || /Could not|boot/.test(message)) console.log('[page]', message); });
    setTimeout(async () => {
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.SALARYMAN_SHOT, img.toPNG());
        console.log('[shot] saved', process.env.SALARYMAN_SHOT);
      } catch (err) { console.log('[shot] failed', err.message); }
      app.quit();
    }, Number(process.env.SALARYMAN_WAIT || 25000));
  }
  win.loadURL('game://app/index.html');
}

app.whenReady().then(() => {
  protocol.handle('game', async (request) => {
    const u = new URL(request.url);
    let rel = decodeURIComponent(u.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(__dirname, rel));
    if (!file.startsWith(__dirname)) return new Response('forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
    } catch (err) {
      return new Response('not found', { status: 404 });
    }
  });
  // The game asks for nothing: deny every permission request except what it needs (pointer lock and fullscreen are not permissions).
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// Say so in the terminal if the GPU process dies; the renderer falls back to WebGL2 by itself.
app.on('child-process-gone', (_event, details) => {
  if (details.type === 'GPU') {
    console.error('[gpu] process gone:', details.reason, 'exit code', details.exitCode);
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});
