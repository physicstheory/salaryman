// Model Forge in the game: models made on our own GPU (Tools/forge) land in Web/props as ordinary props, with a "forge" record in
// props/index.json. propPut(parent, id, ...) and ShopAAA's SWAP table use them like any scanned prop; this file adds a way to look
// at them in the world.
//
//   Cheat FORGE (dial 555-3674)   puts the next forged model on the ground in front of Seiko, at its real size
//   console  forge.list()         every forged model with its size, triangles, prompt and model
//            forge.place(id, o)   put one in front of Seiko (o: {h: height m} | {w: width m} | {s: scale}), returns the holder
//            forge.clear()        take them all away again
// Off switch: ?forge=0.
(function () {
  "use strict";
  if (/[?&]forge=0\b/.test(location.search)) return;
  if (typeof propPut !== "function" || typeof player !== "object") return;
  const F = window.forge = { version: "1.0.0", items: [], placed: [], next: 0 };

  F.ready = fetch("props/index.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(ix => {
    F.items = Object.keys(ix).filter(k => ix[k] && ix[k].forge).map(k => Object.assign({ id: k }, ix[k]))
      .sort((a, b) => String(b.forge.made || "").localeCompare(String(a.forge.made || "")));
    return F.items;
  });

  F.list = function () {
    return F.items.map(i => ({ id: i.id, size: i.size.map(v => +v.toFixed(2)).join(" x ") + " m", tris: i.tris, model: i.forge.pipeline, prompt: i.forge.prompt || "(from images)", made: i.forge.made }));
  };

  F.place = function (id, opts) {
    const it = F.items.find(i => i.id === id);
    if (!it && !/^[a-z0-9_]+$/.test(id || "")) return null;
    const parent = (typeof scene !== "undefined" && scene) || null;
    if (!parent) return null;
    const fy = player.yaw || 0, d = 1.2 + Math.max(0.6, it ? Math.max(it.size[0], it.size[2]) : 1);
    const x = player.pos.x + Math.sin(fy) * d, z = player.pos.z + Math.cos(fy) * d;
    let y = player.pos.y;
    try { if (typeof world === "object" && world.walkY) y = world.walkY(x, z, player.pos.y + 1.5); } catch (e) { /* stand it at Seiko's feet */ }
    const h = propPut(parent, id, x, y, z, fy + Math.PI, opts || { s: 1 });  // models face +Z: turn them to face Seiko
    h.userData.forge = id;
    F.placed.push(h);
    return h;
  };

  F.clear = function () {
    F.placed.forEach(h => { if (h.parent) h.parent.remove(h); });
    F.placed.length = 0;
  };

  try {
    CHEAT_ACTIONS.FORGE = { dial: "5553674", note: "", fn: () => {
      F.ready.then(() => {
        if (!F.items.length) { say("Nothing has come out of the forge yet.", 3); return; }
        if (drive && drive.car) { say("Get out of the car first.", 2); return; }
        const it = F.items[F.next++ % F.items.length];
        F.place(it.id);
        say(it.id.replace(/_/g, " ") + " (" + it.forge.pipeline + ", " + it.tris.toLocaleString() + " triangles)", 4);
      });
    } };
  } catch (e) { /* no cheat table */ }
})();
