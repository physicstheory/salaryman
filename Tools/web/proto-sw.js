// The prototype build's service worker (build __BUILD__), written into /prototype/ by Tools/web/build-site.js.
// /prototype/ holds only the files that differ from the polished build; every other request is answered from /play/,
// so both builds fit in one GitHub Pages site. own.json lists the prototype's own files.
"use strict";
let own = null;
const scope = () => self.registration.scope;                       // .../prototype/
const shared = () => new URL("../play/", self.registration.scope); // .../play/
function loadOwn() {
  if (!own) own = fetch(new URL("own.json", scope()), { cache: "no-store" })
    .then(r => r.json()).then(j => new Set(j.files || []))
    .catch(() => { own = null; return null; });
  return own;
}
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(loadOwn()); });
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  const base = new URL(scope());
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return; // not ours: the network as usual
  const rel = decodeURIComponent(url.pathname.slice(base.pathname.length));
  e.respondWith(loadOwn().then(set => {
    if (!set || set.has(rel) || e.request.mode === "navigate") return fetch(e.request);
    const to = new URL(rel.split("/").map(encodeURIComponent).join("/") + url.search, shared());
    const r = e.request;
    return fetch(to, { method: r.method, headers: r.headers, credentials: r.credentials, cache: r.cache, redirect: "follow" });
  }));
});
