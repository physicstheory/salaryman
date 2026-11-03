// Deliberately almost empty. The game is a self-contained page: it wants no
// filesystem, no network and nothing from Node, so nothing is exposed to it.
// What this does do is tell the page it is running as an application rather
// than in a tab, which is how it knows to hide the browser-only furniture.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("KONTO_DESKTOP", {
  platform: process.platform,
  version: process.versions.electron,
  // Where YouTube players are wrapped so they carry a referrer (see main.js, startYtShim). Empty if it could not start.
  ytShim: (() => { try { return ipcRenderer.sendSync("yt-shim") || ""; } catch (e) { return ""; } })(),
  update: () => ipcRenderer.send("update-game"),
  // Spotify sign-in: the main process opens Spotify's own page in a window and hands back the address it redirects to (nothing else)
  spotifyAuth: (url, redirect) => ipcRenderer.invoke("spotify-auth", url, redirect),
  // The error engine (Web/game/error-engine.js, main.js "error engine"): versions and GPU for its reports, the log file in userData, the
  // clipboard, a prefilled GitHub issue page for the player to submit, and what the main process saw (a crash, the GPU process going).
  errors: {
    info: () => { try { return ipcRenderer.sendSync("err-info") || {}; } catch (e) { return {}; } },
    pending: () => { try { return ipcRenderer.sendSync("err-pending") || []; } catch (e) { return []; } },
    write: rec => ipcRenderer.send("err-write", rec),
    copy: text => { ipcRenderer.send("err-copy", String(text)); return true; },
    openLog: () => ipcRenderer.send("err-open-log"),
    openIssue: url => ipcRenderer.send("err-issue", String(url)),
    onMain: cb => ipcRenderer.on("err-main", (_e, rec) => { try { cb(rec); } catch (x) { /* none */ } })
  }
});

// Files dropped on the window are handed to the main process, which asks where they belong (see main.js, addFiles). Only the paths go across.
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", e => {
  e.preventDefault();
  const paths = Array.from(e.dataTransfer ? e.dataTransfer.files : []).map(f => { try { return webUtils.getPathForFile(f); } catch (err) { return ""; } }).filter(Boolean);
  if (paths.length) ipcRenderer.send("add-files", paths);
});
