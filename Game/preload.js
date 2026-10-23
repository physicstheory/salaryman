// Deliberately almost empty. The game is a self-contained page: it wants no
// filesystem, no network and nothing from Node, so nothing is exposed to it.
// What this does do is tell the page it is running as an application rather
// than in a tab, which is how it knows to hide the browser-only furniture.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("KONTO_DESKTOP", {
  platform: process.platform,
  version: process.versions.electron,
  update: () => ipcRenderer.send("update-game")
});

// Files dropped on the window are handed to the main process, which asks where they belong (see main.js, addFiles). Only the paths go across.
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", e => {
  e.preventDefault();
  const paths = Array.from(e.dataTransfer ? e.dataTransfer.files : []).map(f => { try { return webUtils.getPathForFile(f); } catch (err) { return ""; } }).filter(Boolean);
  if (paths.length) ipcRenderer.send("add-files", paths);
});
