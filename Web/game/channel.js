// Release channels: which build of the game this is, and the prototype mode.
//
//   polished   the reviewed build: the latest-build release (desktop zip) and the website's /play/. Passed the AAA gate.
//   prototype  unpolished, experimental builds: the website's /prototype/. Nothing here has to pass the gate.
//   dev        the page served straight from Web/ while working on it (prototypes on, so new work can be seen).
//
// The build stamps window.KONTO_CHANNEL = { name, commit, ref, built } into the page's <head> before this file
// (Tools/web/build-site.js for the website, Game/tools/stage.js for the desktop app). With no stamp, the desktop app
// counts as polished and anything else as dev. ?channel=prototype|polished overrides it, for testing.
//
// Experimental code goes behind the prototype switch, so it can live on the main branch without reaching the polished build:
//
//   KONTO_PROTO.feature("night-markets", () => { ...set up the experiment... });   // runs only in prototype/dev
//   if (KONTO_PROTO.on) { ... }                                                       // the same, inline
//
// ?proto=1 / ?proto=0 turns prototypes on or off in any channel. Prototype saves are kept apart from polished saves
// (both websites share one origin), so an experiment can never break a real save.
(function () {
  "use strict";
  var q = {};
  try { new URLSearchParams(location.search).forEach(function (v, k) { q[k] = v; }); } catch (e) { /* old browser */ }

  var stamp = window.KONTO_CHANNEL && typeof window.KONTO_CHANNEL === "object" ? window.KONTO_CHANNEL : {};
  var name = stamp.name || (window.KONTO_DESKTOP ? "polished" : "dev");
  if (q.channel === "prototype" || q.channel === "polished" || q.channel === "dev") name = q.channel;
  var ch = { name: name, commit: stamp.commit || "", ref: stamp.ref || "", built: stamp.built || "" };
  window.KONTO_CHANNEL = ch;

  var on = name !== "polished";
  if (q.proto === "1") on = true;
  if (q.proto === "0") on = false;

  var features = [];
  window.KONTO_PROTO = {
    on: on,
    channel: name,
    features: features,
    // run fn only in prototype mode; a broken experiment is logged and skipped, never takes the game down
    feature: function (id, fn) {
      features.push({ id: String(id), ran: on });
      if (!on) return undefined;
      try { return fn(); } catch (e) { console.warn("[prototype] " + id + " failed:", e); return undefined; }
    }
  };

  if (name !== "prototype") return;

  // Keep prototype saves and caches apart from the polished ones: every key gets a "proto:" prefix.
  var P = "proto:";
  try {
    var S = Storage.prototype, get = S.getItem, set = S.setItem, rem = S.removeItem, key = S.key;
    var lenDesc = Object.getOwnPropertyDescriptor(S, "length");
    var own = function (st) { var out = []; for (var i = 0, n = lenDesc.get.call(st); i < n; i++) { var k = key.call(st, i); if (k && k.indexOf(P) === 0) out.push(k); } return out; };
    S.getItem = function (k) { return get.call(this, P + k); };
    S.setItem = function (k, v) { return set.call(this, P + k, v); };
    S.removeItem = function (k) { return rem.call(this, P + k); };
    S.key = function (i) { var k = own(this)[i]; return k === undefined ? null : k.slice(P.length); };
    S.clear = function () { var st = this; own(st).forEach(function (k) { rem.call(st, k); }); };
    Object.defineProperty(S, "length", { configurable: true, get: function () { return own(this).length; } });
  } catch (e) { console.warn("[prototype] could not separate saves:", e); }
  try {
    if (typeof CacheStorage !== "undefined") {
      var C = CacheStorage.prototype, open = C.open, del = C["delete"], has = C.has;
      C.open = function (n) { return open.call(this, P + n); };
      C["delete"] = function (n) { return del.call(this, P + n); };
      C.has = function (n) { return has.call(this, P + n); };
    }
  } catch (e) { /* no Cache API */ }

  // A small corner label so a prototype screenshot is never mistaken for the real thing.
  var badge = function () {
    if (!document.body || document.getElementById("protoBadge")) return;
    var b = document.createElement("div");
    b.id = "protoBadge";
    b.textContent = "PROTOTYPE" + (ch.commit ? " · " + ch.commit.slice(0, 7) : "") + (ch.ref ? " · " + ch.ref : "");
    b.style.cssText = "position:fixed;left:8px;bottom:6px;z-index:2147483000;pointer-events:none;font:600 11px/1.2 system-ui,sans-serif;"
      + "letter-spacing:.08em;color:#ffd166;background:rgba(0,0,0,.45);padding:3px 7px;border-radius:3px;opacity:.85";
    document.body.appendChild(b);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", badge); else badge();
})();
