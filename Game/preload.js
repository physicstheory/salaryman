// Deliberately almost empty. The game is a self-contained page: it wants no
// filesystem, no network and nothing from Node, so nothing is exposed to it.
// What this does do is tell the page it is running as an application rather
// than in a tab, which is how it knows to hide the browser-only furniture.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("KONTO_DESKTOP", {
  platform: process.platform,
  version: process.versions.electron
});
