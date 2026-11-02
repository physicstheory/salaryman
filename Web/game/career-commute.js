// Seiko's flat in outer Tōkonto and the long way to work: the train from his local station (where he can look at his phone and calm
// down), or the company car he gets with the promotion, which runs on fuel he pays for at the service stations.
//
//   the flat        SOTI rents it after the first day: the stop on a line out of Tōkonto Central that is furthest from SOTI Tower, and
//                   a block of flats a short walk from it. Its entrance (a sign, the mailboxes, the intercom) stands at the kerb; walk up
//                   and press F. Inside: the futon (sleep until the next morning), the wardrobe, the kitchen.
//   the train       walk into any station in Tōkonto and press F: the ticket machine lists where the trains from here go, with the one
//                   for SOTI Tower first. On the train, the phone (P) eases his stress several times faster than doing nothing.
//   the car         a SOTI company hatchback, parked at the tower on the day of the promotion. 36 litres; it burns about 1.5 L a km in
//                   this city of short blocks and stop lights, so a few round trips empty it. Below a fifth it warns you; empty, it
//                   rolls to a stop. Pull up at a pump (the Konto Oil stations on the map) and press F to buy fuel.
(function () {
  "use strict";
  const C = window.career; if (!C || !C.office) return;
  const K = C.commute = {};
  const TANK = 36, BURN = 1.5 / 1000, PRICE = 178, PRICE_HI = 189;
  const O = C.office;

  // ---- where the flat is ------------------------------------------------------------------------------------------------------------------
  function linesFrom(name) {
    const out = [];
    (rail.lines || []).forEach((line, li) => {
      if (!line.stops || !line.stops.length) return;
      const o = line.stops.find(q => q.name === name); if (!o) return;
      line.stops.forEach(q => {
        if (q.name === name) return;
        const ahead = line.loop ? ((q.s - o.s) % line.length + line.length) % line.length : q.s - o.s;
        if (ahead <= 30) return;
        out.push({ li: li, from: o, to: q, ahead: ahead, name: q.name, at: q.at, kind: line.kindName });
      });
    });
    return out;
  }
  K.destinationsFrom = function (name) {
    const so = story.soti, seen = {}, out = [];
    linesFrom(name).sort((a, b) => a.ahead - b.ahead).forEach(d => {
      if (seen[d.name]) return; seen[d.name] = true;
      d.soti = so ? Math.hypot(d.at[0] - so.at[0], d.at[1] - so.at[1]) : 1e9;
      d.fare = Math.round((160 + d.ahead / 1000 * 30) / 10) * 10 * (d.kind === "shinkansen" ? 4 : 1);
      out.push(d);
    });
    if (so && out.length) { const n = out.slice().sort((a, b) => a.soti - b.soti)[0]; if (n.soti < 900) { n.forSoti = true; out.splice(out.indexOf(n), 1); out.unshift(n); } }
    const f = C.state().flat;
    if (f) { const h = out.find(d => d.name === f.station); if (h) { h.forHome = true; out.splice(out.indexOf(h), 1); out.splice(h === out[0] ? 0 : 1, 0, h); } }
    return out;
  };
  K.pickFlat = function () {
    const home = railHome(), so = story.soti; if (!home || !so) return null;
    const dests = linesFrom(home.name).filter(d => d.kind !== "shinkansen");
    if (!dests.length) return null;
    dests.sort((a, b) => Math.hypot(b.at[0] - so.at[0], b.at[1] - so.at[1]) - Math.hypot(a.at[0] - so.at[0], a.at[1] - so.at[1]));
    const city = world.cities[0];
    for (const d of dests.slice(0, 4)) {
      const st = d.at;
      const plots = (city.plots || []).filter(p => !p.shop && !p.absorbed && (p.kind === "flats" || p.kind === "midrise" || p.kind === "houses"))
        .map(p => ({ p: p, d: Math.hypot(p.centre[0] - st[0], p.centre[1] - st[1]) })).filter(e => e.d > 60 && e.d < 320).sort((a, b) => (a.p.kind === "flats" ? 0 : 60) + a.d - ((b.p.kind === "flats" ? 0 : 60) + b.d));
      for (const e of plots) {
        const p = e.p;
        if (typeof plotFaceRoad === "function") try { plotFaceRoad(city, p); } catch (x) { /* as it was */ }
        const yaw = p.yaw * Math.PI / 180, half = p.size[1] * 0.5 + 1.4;
        const door = [p.centre[0] + Math.sin(yaw) * half, p.centre[1] + Math.cos(yaw) * half];
        if (typeof insideBuilding === "function" && insideBuilding(door[0], door[1], 0.4)) continue;
        if (world.sampleHeight(door[0], door[1]) < 0.3) continue;
        const area = d.name.replace(/ Station$/, "");
        return { station: d.name, stationAt: d.at.slice(), area: area + ", outer Tōkonto", name: "Hoshizora Heights 203", door: door, yaw: yaw };
      }
    }
    return null;
  };
  K.assignFlat = function (next, quiet) {
    const s = C.state();
    if (!s.flat) s.flat = K.pickFlat();
    const f = s.flat;
    if (!f) { if (next) next(); return; }
    K.buildEntrance();
    C.emit("flat:assigned", { station: f.station, x: f.door[0], z: f.door[1] });
    if (quiet) { if (next) next(); return; }
    notify("Phone", "Akio Sotiyama", "Calling…", 4);
    const lines = [
      ["Akio", "Seiko. Gondō tells me you survived your first day. Good."],
      ["Akio", "A man who works for SOTI does not sleep in a capsule. We have rented you a flat."],
      ["Akio", f.name + ", " + f.area + ". " + f.station + " is your station."],
      ["Akio", "It's a long way out. The train from Tōkonto Central. So leave early. Don't be late."]
    ];
    lines.forEach((l, i) => setTimeout(() => say(l[0] + ": “" + l[1] + "”", 4.4), 600 + i * 4600));
    setTimeout(() => { notify("Messages", "Akio Sotiyama", f.name + " · " + f.area + ". The key is in the mailbox.", 8); if (next) next(); }, 600 + lines.length * 4600);
  };

  // ---- the flat's entrance in the street ------------------------------------------------------------------------------------------------
  K.buildEntrance = function () {
    const f = C.state().flat; if (!f || K.entrance) return;
    const g = new THREE.Group(), y = world.surfaceY(f.door[0], f.door[1]);
    g.position.set(f.door[0], y, f.door[1]); g.rotation.y = f.yaw; scene.add(g);
    const pbr = O.pbr, P = O.paint;
    const metal = pbr("darkmetal", 256, P.darkmetal, { bump: 0.6, rough: [0.35, 0.55], metal: 0.7 });
    const conc = pbr("concrete", 256, P.concrete, { rep: [1, 1], bump: 2, rough: [0.8, 0.95] });
    const box = (w, h, d, x, yy, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, yy, z); g.add(b); return b; };
    // the entrance canopy on its two posts, the step, the mailboxes and the intercom, and the name of the block
    box(2.8, 0.12, 1.6, 0, 0.06, -0.4, conc);
    box(0.08, 2.6, 0.08, -1.3, 1.3, 0.3, metal); box(0.08, 2.6, 0.08, 1.3, 1.3, 0.3, metal);
    box(3.0, 0.1, 1.8, 0, 2.65, -0.4, metal);
    const sign = O.screenMat(O.canvas(512, 128, (x, w, h) => { x.fillStyle = "#1b1f25"; x.fillRect(0, 0, w, h); x.fillStyle = "#f2efe6"; x.font = "700 46px " + (typeof UI === "string" ? UI : "sans-serif"); x.fillText("星空ハイツ", 22, 58); x.font = "600 30px " + (typeof UI === "string" ? UI : "sans-serif"); x.fillStyle = "#c9a24a"; x.fillText("HOSHIZORA HEIGHTS", 22, 104); }));
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), sign); sp.position.set(0, 2.35, 0.32); g.add(sp);
    const mail = O.pbr("mailbox", 256, (x, w, h) => { x.fillStyle = "#b8bcc0"; x.fillRect(0, 0, w, h); x.strokeStyle = "#5b6066"; x.lineWidth = 3; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { x.strokeRect(8 + i * 61, 8 + j * 82, 55, 74); x.fillStyle = "#33373c"; x.fillRect(20 + i * 61, 20 + j * 82, 30, 5); x.fillStyle = "#fff"; x.fillRect(16 + i * 61, 60 + j * 82, 38, 12); x.fillStyle = "#222"; x.font = "700 10px sans-serif"; x.fillText((j + 1) + "0" + (i + 1), 22 + i * 61, 70 + j * 82); } }, { bump: 1.5, rough: [0.35, 0.55], metal: 0.5 });
    box(0.9, 1.1, 0.35, -1.0, 0.65, -0.9, mail);
    const inter = O.pbr("intercom", 128, (x, w, h) => { x.fillStyle = "#2b2f35"; x.fillRect(0, 0, w, h); x.fillStyle = "#9ad"; x.fillRect(30, 18, 68, 30); x.fillStyle = "#555b62"; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) x.fillRect(28 + j * 26, 60 + i * 15, 20, 11); }, { bump: 1, rough: [0.3, 0.5], metal: 0.4 });
    box(0.3, 1.3, 0.2, 1.05, 0.65, -0.6, inter);
    K.entrance = g;
  };
  K.flatShop = function () {
    const f = C.state().flat; if (!f) return null;
    return K._shop && K._shop.door === f.door ? K._shop : (K._shop = { brand: "flat", name: f.name, door: f.door, yaw: f.yaw, city: "Tōkonto", built: true, safe: false });
  };

  // ---- inside the flat ----------------------------------------------------------------------------------------------------------------------
  K.buildFlat = function () {
    const Wf = 7, Df = 9, Hf = 2.5, slot = interior.count++, ox = -3000 - slot * 60, oz = -3000, fy = interior.floorY;
    const root = new THREE.Group(); root.position.set(ox, fy, oz); root.visible = false; scene.add(root);
    if (typeof propLight === "function") propLight(root);
    const cols = [], spots = [];
    const room = { brand: "flat", key: "career:flat", group: root, ox: ox, oz: oz, W: Wf, D: Df, H: Hf, doorW: 1.2, colliders: cols, items: [], stock: [], units: [], spots: spots, noExit: false,
      entry: new THREE.Vector3(ox, fy, oz + Df / 2 - 1.0) };
    const solid = (x, z, w, d) => cols.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    const pbr = O.pbr, P = O.paint;
    const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.receiveShadow = true; root.add(b); return b; };
    const wood = (typeof inPhotoMat === "function" && inPhotoMat("planks", 0.55, [Wf / 2.4, Df / 2.4], 0xf2e6d8, 0.9)) || pbr("laminate", 512, P.laminate, { rep: [3, 4], bump: 1.2, rough: [0.4, 0.6] });
    const wall = (typeof inPhotoMat === "function" && inPhotoMat("plaster", 0.95, [Wf / 3, Hf / 3], 0xf0e8da, 0.6)) || pbr("plaster", 512, P.plaster, { rep: [2, 1], bump: 1, rough: [0.8, 0.95] });
    const tat = (typeof inPhotoMat === "function" && inPhotoMat("tatami", 0.85, [1, 2], 0xffffff, 0.8)) || pbr("fabric", 256, P.fabric, { bump: 3, rough: [0.85, 1] });
    const slate = (typeof inPhotoMat === "function" && inPhotoMat("slate", 0.6, [1, 0.5], 0xffffff, 0.8)) || pbr("concrete", 256, P.concrete, { bump: 2, rough: [0.7, 0.9] });
    const white = pbr("white", 256, P.white, { bump: 0.6, rough: [0.4, 0.6] });
    const metal = pbr("metal", 256, P.metal, { bump: 0.6, rough: [0.3, 0.5], metal: 0.85 });
    const cotton = pbr("cotton", 256, (x, w, h) => { x.fillStyle = "#f3f1ea"; x.fillRect(0, 0, w, h); for (let i = 0; i < 4000; i++) { x.fillStyle = "rgba(0,0,0," + Math.random() * 0.04 + ")"; x.fillRect(Math.random() * w, Math.random() * h, 2, 1); } }, { bump: 2, rough: [0.85, 1] });
    const duvet = pbr("duvet", 256, (x, w, h) => { x.fillStyle = "#2f4a6b"; x.fillRect(0, 0, w, h); x.strokeStyle = "rgba(255,255,255,.35)"; x.lineWidth = 3; for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) { x.beginPath(); x.arc(i * 32 + 16, j * 32 + 16, 9, 0, 7); x.stroke(); } }, { bump: 2.5, rough: [0.85, 1] });
    const curtain = pbr("curtain", 256, (x, w, h) => { x.fillStyle = "#cfc6b4"; x.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 16) { const gr = x.createLinearGradient(i, 0, i + 16, 0); gr.addColorStop(0, "rgba(0,0,0,.12)"); gr.addColorStop(0.5, "rgba(255,255,255,.1)"); gr.addColorStop(1, "rgba(0,0,0,.12)"); x.fillStyle = gr; x.fillRect(i, 0, 16, h); } }, { bump: 3, rough: [0.8, 1] });
    // shell
    box(Wf, 0.1, Df, 0, -0.05, 0, wood);
    box(Wf, 0.08, Df, 0, Hf + 0.04, 0, white);
    box(Wf, Hf, 0.15, 0, Hf / 2, -Df / 2, wall); box(0.15, Hf, Df, -Wf / 2, Hf / 2, 0, wall); box(0.15, Hf, Df, Wf / 2, Hf / 2, 0, wall);
    box((Wf - 1.2) / 2, Hf, 0.15, -(0.6 + (Wf - 1.2) / 4), Hf / 2, Df / 2, wall); box((Wf - 1.2) / 2, Hf, 0.15, 0.6 + (Wf - 1.2) / 4, Hf / 2, Df / 2, wall);
    box(1.2, Hf - 2.05, 0.15, 0, 2.05 + (Hf - 2.05) / 2, Df / 2, wall);
    // the genkan: slate, a step down, the shoe cupboard
    box(Wf - 0.2, 0.06, 1.3, 0, 0.0, Df / 2 - 0.7, slate);
    box(0.9, 0.9, 0.35, Wf / 2 - 0.6, 0.45, Df / 2 - 0.9, pbr("laminate", 512, P.laminate, { bump: 1.2, rough: [0.4, 0.6] })); solid(Wf / 2 - 0.6, Df / 2 - 0.9, 0.9, 0.4);
    // the window and its curtains, the city outside
    const sky = typeof storySkylineTex === "function" ? storySkylineTex() : null;
    if (sky) { const win = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.5), new THREE.MeshBasicMaterial({ map: sky, fog: false })); win.position.set(0, 1.4, -Df / 2 + 0.09); root.add(win); }
    box(0.9, 1.9, 0.06, -2.1, 1.3, -Df / 2 + 0.16, curtain); box(0.9, 1.9, 0.06, 2.1, 1.3, -Df / 2 + 0.16, curtain);
    box(3.4, 0.05, 0.05, 0, 2.28, -Df / 2 + 0.15, metal);
    // the tatami corner with the futon
    box(2.0, 0.04, 3.0, -2.3, 0.02, -2.4, tat);
    box(1.0, 0.1, 2.0, -2.5, 0.09, -2.6, cotton); box(1.05, 0.06, 1.4, -2.5, 0.17, -2.3, duvet); box(0.5, 0.1, 0.3, -2.5, 0.18, -3.4, cotton);
    // the low table and a cushion
    box(1.0, 0.04, 0.7, -0.2, 0.36, -1.0, pbr("laminate", 512, P.laminate, { bump: 1.2, rough: [0.4, 0.6] }));
    [[-0.65, -1.3], [0.25, -1.3], [-0.65, -0.7], [0.25, -0.7]].forEach(q => box(0.05, 0.34, 0.05, q[0], 0.17, q[1], metal));
    solid(-0.2, -1.0, 1.0, 0.7);
    // the kitchen along the right wall: counter, sink, hob, fridge
    box(0.65, 0.88, 2.4, Wf / 2 - 0.4, 0.44, 0.6, white); box(0.7, 0.04, 2.45, Wf / 2 - 0.4, 0.9, 0.6, metal); solid(Wf / 2 - 0.4, 0.6, 0.7, 2.4);
    box(0.4, 0.02, 0.5, Wf / 2 - 0.4, 0.93, 0.2, pbr("darkmetal", 256, P.darkmetal, { bump: 0.6, rough: [0.35, 0.55], metal: 0.7 }));
    box(0.65, 1.7, 0.65, Wf / 2 - 0.4, 0.85, 2.2, white); solid(Wf / 2 - 0.4, 2.2, 0.7, 0.7);
    if (typeof propPut === "function") {
      propPut(root, "modern_wooden_cabinet", -Wf / 2 + 0.35, 0, 1.2, Math.PI / 2, { w: 1.4 }); solid(-Wf / 2 + 0.35, 1.2, 0.6, 1.4);
      propPut(root, "television_02", 0.9, 0, -3.9, 0, { w: 1.0 }); solid(0.9, -3.9, 1.1, 0.5);
      propPut(root, "potted_plant_04", 2.9, 0, -3.9, 0, { h: 0.9 });
      propPut(root, "vintage_electric_kettle", Wf / 2 - 0.4, 0.92, 1.3, -Math.PI / 2, { h: 0.22 });
      propPut(root, "modern_ceiling_lamp_01", 0, 1.9, -1, 0, { h: 0.5 });
    }
    spots.push({ x: -2.5, z: -1.4, label: "sleep until morning", act: "career:sleep" });
    spots.push({ x: -Wf / 2 + 1.0, z: 1.2, label: "the wardrobe", act: "career:wardrobe" });
    spots.push({ x: Wf / 2 - 1.0, z: 0.6, label: "make cup noodles", act: "career:eat" });
    return room;
  };
  K.spot = function (a) {
    if (a === "sleep") {
      const h = gameMinutes();
      if (story.step === "c:toWork" && h > 6 * 60 && h < 9 * 60) { C.menu({ head: "Sleep?", body: "You're due at SOTI by 9:00. Sleeping now means missing the day.", opts: [{ label: "Back to bed. Call in sick… without calling.", fn: () => { interiorLeaveQuiet(); C.sleep("Slept"); } }, { label: "No: get to work", fn: () => {} }], cancel: () => {} }); return true; }
      interiorLeaveQuiet(); C.sleep("Slept"); return true;
    }
    if (a === "wardrobe") { if (typeof wardrobeOpen === "function") wardrobeOpen(); return true; }
    if (a === "eat") { vitals.stress = clamp01((vitals.stress || 0) - 0.06); vitals.health = Math.min(1, (vitals.health || 1) + 0.05); say("Cup noodles. Three minutes. Gourmet.", 3); return true; }
    return false;
  };
  // sleeping: stay in the room (the fade covers it), but the room is left first so the morning starts at the front door
  function interiorLeaveQuiet() { if (interior.active) { const keep = story.step; interiorLeave(true); story.step = keep; } }

  // ---- the company car --------------------------------------------------------------------------------------------------------------------
  function kerbNear(x, z) {
    let best = null, bd = 1e12;
    (traffic.lanes || []).forEach((L, li) => { if (!L.pts || L.wide === false && false) return; for (let i = 0; i < L.pts.length; i += 2) { const q = L.pts[i], d = (q[0] - x) * (q[0] - x) + (q[2] - z) * (q[2] - z); if (d < bd) { bd = d; best = { L: L, i: i }; } } });
    if (!best) return null;
    const P = best.L.pts, a = P[Math.max(0, best.i - 1)], b = P[Math.min(P.length - 1, best.i + 1)], q = P[best.i];
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
    // on the kerb side of the lane: towards the door
    const rx = Math.cos(yaw), rz = -Math.sin(yaw), side = ((x - q[0]) * rx + (z - q[2]) * rz) > 0 ? 1 : -1;
    return { x: q[0] + rx * side * 1.7, z: q[2] + rz * side * 1.7, yaw: yaw };
  }
  K.car = () => drive.parked.find(r => r.company) || (drive.car && drive.car.rec && drive.car.rec.company ? drive.car.rec : null);
  function makeCar(x, z, yaw) {
    let ki = typeof carKindIndex === "function" ? carKindIndex("hatch") : 0; if (ki < 0) ki = 0;
    const rec = { owned: true, company: true, id: 9001, name: "SOTI company car", kind: ki, kindName: "hatch", price: 0, paint: 0, pos: new THREE.Vector3(x, world.surfaceY(x, z) + 0.04, z), yaw: yaw,
      colour: [0.93, 0.93, 0.91], uv: [0, 0], atGarage: false };
    drive.parked.push(rec);
    return rec;
  }
  K.giveCar = function (next, quiet) {
    const s = C.state(), so = story.soti;
    if (!s.car) s.car = { fuel: TANK * 0.6, x: 0, z: 0, yaw: 0, warned: 0 };
    if (!K.car() && so) {
      const k = kerbNear(so.door[0] + Math.sin(so.yaw) * 8, so.door[1] + Math.cos(so.yaw) * 8) || { x: so.door[0] + Math.sin(so.yaw) * 8, z: so.door[1] + Math.cos(so.yaw) * 8, yaw: so.yaw + Math.PI / 2 };
      makeCar(k.x, k.z, k.yaw); s.car.x = k.x; s.car.z = k.z; s.car.yaw = k.yaw;
    }
    K.buildStations();
    C.emit("car:given", { fuel: s.car.fuel });
    if (quiet) { if (next) next(); return; }
    notify("Messages", "SOTI Fleet", "Your company car (white hatchback) is parked outside SOTI Tower. Fuel is your own expense: Konto Oil stations are on your map.", 10);
    say("A company car. Fuel: " + Math.round(s.car.fuel / TANK * 100) + "%. It's on you to fill it.", 5);
    if (next) setTimeout(next, 1200);
  };
  K.restore = function () {
    const s = C.state();
    if (s.flat) K.buildEntrance();
    if (s.car) { if (!K.car()) makeCar(s.car.x, s.car.z, s.car.yaw || 0); K.buildStations(); }
  };

  // ---- service stations: Konto Oil, on open lots across the city ------------------------------------------------------------------------
  K.stations = [];
  K.buildStations = function () {
    if (K.stations.length || !world || !world.cities) return;
    const city = world.cities[0]; if (!city || !city.plots) return;
    const carparks = (city.carparks || []).map(c => c.c);
    const lots = city.plots.filter(p => p.kind === "parking" && !p.absorbed && Math.min(p.size[0], p.size[1]) >= 18 && Math.max(p.size[0], p.size[1]) <= 70 &&
      !carparks.some(c => Math.hypot(c[0] - p.centre[0], c[1] - p.centre[1]) < 4));
    if (!lots.length) return;
    // spread them out: start with the lots nearest SOTI and the flat, then keep adding whichever is furthest from those already chosen
    const want = [], so = story.soti, f = C.state().flat;
    const near = at => lots.slice().sort((a, b) => Math.hypot(a.centre[0] - at[0], a.centre[1] - at[1]) - Math.hypot(b.centre[0] - at[0], b.centre[1] - at[1]))[0];
    if (so) want.push(near(so.at)); if (f) { const n = near(f.door); if (want.indexOf(n) < 0) want.push(n); }
    while (want.length < Math.min(8, lots.length)) {
      let best = null, bd = -1;
      lots.forEach(p => { if (want.indexOf(p) >= 0) return; const d = Math.min.apply(null, want.map(q => Math.hypot(q.centre[0] - p.centre[0], q.centre[1] - p.centre[1]))); if (d > bd) { bd = d; best = p; } });
      if (!best) break; want.push(best);
    }
    want.forEach((p, i) => { try { K.stations.push(buildStation(city, p, i)); } catch (e) { console.warn("[Career] service station:", e); } });
    console.log("[Career] " + K.stations.length + " Konto Oil service stations");
  };
  function buildStation(city, p, idx) {
    if (typeof plotFaceRoad === "function") try { plotFaceRoad(city, p); } catch (e) { /* as it was */ }
    const yaw = p.yaw * Math.PI / 180, gy = (p.groundY !== undefined ? p.groundY : world.surfaceY(p.centre[0], p.centre[1]));
    const g = new THREE.Group(); g.position.set(p.centre[0], gy, p.centre[1]); g.rotation.y = yaw; scene.add(g);
    const pbr = O.pbr, P = O.paint, sw = Math.min(p.size[0], 26), sd = Math.min(p.size[1], 22);
    const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.receiveShadow = true; g.add(b); return b; };
    const conc = pbr("forecourt", 512, (x, w, h) => { P.concrete(x, w, h); x.strokeStyle = "rgba(255,255,255,.55)"; x.lineWidth = 6; x.strokeRect(10, 10, w - 20, h - 20); for (let i = 0; i < 6; i++) { x.fillStyle = "rgba(20,18,15," + (0.06 + Math.random() * 0.08) + ")"; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 30, 10 + Math.random() * 20, Math.random() * 3, 0, 7); x.fill(); } }, { rep: [1, 1], bump: 2, rough: [0.7, 0.95] });
    const metal = pbr("metal", 256, P.metal, { bump: 0.6, rough: [0.3, 0.5], metal: 0.85 });
    const white = pbr("white", 256, P.white, { bump: 0.6, rough: [0.4, 0.6] });
    const red = pbr("kontored", 256, (x, w, h) => { x.fillStyle = "#c8102e"; x.fillRect(0, 0, w, h); for (let y = 0; y < h; y++) { x.fillStyle = "rgba(255,255,255," + Math.random() * 0.05 + ")"; x.fillRect(0, y, w, 1); } }, { bump: 0.6, rough: [0.25, 0.4], metal: 0.3 });
    // the slab over the lot's own paving, the canopy on four columns, its lit underside
    box(sw, 0.05, sd, 0, 0.03, 0, conc);
    const cz = sd * 0.5 - 5.5;                                  // the canopy sits towards the road
    [[-5.5, cz - 3.2], [5.5, cz - 3.2], [-5.5, cz + 3.2], [5.5, cz + 3.2]].forEach(q => box(0.35, 5.0, 0.35, q[0], 2.5, q[1], white));
    box(13.6, 0.9, 8.6, 0, 5.4, cz, white);
    const fascia = O.screenMat(O.canvas(1024, 64, (x, w, h) => { x.fillStyle = "#c8102e"; x.fillRect(0, 0, w, h); x.fillStyle = "#fff"; x.fillRect(0, h * 0.72, w, h * 0.08); x.font = "900 40px " + (typeof UI === "string" ? UI : "sans-serif"); x.fillText("KONTO OIL", 24, 44); x.textAlign = "right"; x.font = "700 30px " + (typeof UI === "string" ? UI : "sans-serif"); x.fillText("セルフ · SELF · 24h", w - 24, 42); }));
    [[0, cz + 4.31, 0], [0, cz - 4.31, Math.PI]].forEach(q => { const m = new THREE.Mesh(new THREE.PlaneGeometry(13.6, 0.85), fascia); m.position.set(q[0], 5.4, q[1]); m.rotation.y = q[2]; g.add(m); });
    const under = O.screenMat(O.canvas(256, 256, (x, w, h) => { x.fillStyle = "#d8dcdf"; x.fillRect(0, 0, w, h); x.fillStyle = "#ffffff"; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) x.fillRect(20 + i * 80, 30 + j * 120, 56, 70); }));
    { const u = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 8.4), under); u.rotation.x = Math.PI / 2; u.position.set(0, 4.94, cz); g.add(u); }
    // two pump islands
    const pumpFace = O.screenMat(O.canvas(256, 512, (x, w, h) => {
      x.fillStyle = "#f2f2f0"; x.fillRect(0, 0, w, h); x.fillStyle = "#c8102e"; x.fillRect(0, 0, w, 70);
      x.fillStyle = "#fff"; x.font = "900 34px sans-serif"; x.fillText("KONTO OIL", 18, 48);
      x.fillStyle = "#0d1117"; x.fillRect(24, 96, w - 48, 90); x.fillStyle = "#5fd38a"; x.font = "700 34px monospace"; x.fillText("¥ 0", 40, 154);
      [["レギュラー Regular", "#e03b2c", PRICE], ["ハイオク High-octane", "#f0a400", PRICE_HI], ["軽油 Diesel", "#14b86a", 159]].forEach((r, i) => { x.fillStyle = r[1]; x.fillRect(24, 220 + i * 78, 40, 60); x.fillStyle = "#1d2a36"; x.font = "700 20px sans-serif"; x.fillText(r[0], 74, 246 + i * 78); x.font = "800 24px sans-serif"; x.fillText("¥" + r[2] + "/L", 74, 274 + i * 78); });
    }));
    const pumps = [];
    [-3.0, 3.0].forEach(px => {
      box(1.2, 0.18, 3.6, px, 0.09, cz, conc);
      box(0.7, 1.7, 0.9, px, 1.03, cz, red);
      [1, -1].forEach(s2 => { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.24), pumpFace); f.position.set(px + s2 * 0.352, 1.1, cz); f.rotation.y = s2 * Math.PI / 2; g.add(f); });
      [-0.25, 0.25].forEach(dz => { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8), pbr("plastic", 256, P.plastic, { bump: 1, rough: [0.4, 0.6] })); h.position.set(px + 0.38, 1.0, cz + dz); h.rotation.z = 0.35; g.add(h); });
      box(0.16, 0.9, 0.16, px, 0.45, cz + 1.6, red); box(0.16, 0.9, 0.16, px, 0.45, cz - 1.6, red);   // the bollards that guard the island
      const w = new THREE.Vector3(px, 0, cz).applyEuler(new THREE.Euler(0, yaw, 0)).add(g.position);
      pumps.push({ x: w.x, z: w.z });
    });
    // the kiosk at the back, and the price tower at the road
    const kz = -sd * 0.5 + 2.4;
    const kiosk = O.pbr("kiosk", 512, (x, w, h) => { x.fillStyle = "#e9e9e6"; x.fillRect(0, 0, w, h); x.fillStyle = "#26323d"; x.fillRect(w * 0.08, h * 0.25, w * 0.84, h * 0.55); x.fillStyle = "rgba(160,210,240,.6)"; for (let i = 0; i < 4; i++) x.fillRect(w * 0.1 + i * w * 0.205, h * 0.27, w * 0.19, h * 0.51); x.fillStyle = "#c8102e"; x.fillRect(0, 0, w, h * 0.14); x.fillStyle = "#fff"; x.font = "900 40px sans-serif"; x.fillText("KONTO OIL · SHOP", 24, 48); }, { bump: 1, rough: [0.35, 0.6] });
    box(7, 3.2, 4, 0, 1.6, kz, kiosk);
    if (typeof solids !== "undefined" && Array.isArray(solids)) { const kw = new THREE.Vector3(0, 0, kz).applyEuler(new THREE.Euler(0, yaw, 0)).add(g.position); solids.push({ c: [kw.x, kw.z], size: [7, 4], yaw: p.yaw, y: gy, h: 3.2 }); }
    const tower = O.screenMat(O.canvas(256, 640, (x, w, h) => { x.fillStyle = "#c8102e"; x.fillRect(0, 0, w, h); x.fillStyle = "#fff"; x.font = "900 44px sans-serif"; x.fillText("KONTO", 34, 70); x.fillText("OIL", 34, 120); x.fillStyle = "#0d1117"; x.fillRect(16, 150, w - 32, h - 170);
      [["R", PRICE, "#ff5a45"], ["H", PRICE_HI, "#ffd21c"], ["D", 159, "#5fd38a"]].forEach((r, i) => { x.fillStyle = r[2]; x.font = "800 46px sans-serif"; x.fillText(r[0], 32, 230 + i * 150); x.font = "700 86px monospace"; x.fillText(String(r[1]), 84, 240 + i * 150); }); }));
    box(0.3, 7, 0.3, sw * 0.5 - 1.2, 3.5, sd * 0.5 - 0.8, metal);
    { const t = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.5), tower); t.position.set(sw * 0.5 - 1.2, 5.6, sd * 0.5 - 0.62); g.add(t); const t2 = t.clone(); t2.rotation.y = Math.PI; t2.position.z = sd * 0.5 - 0.98; g.add(t2); }
    // no parked cars on the forecourt
    try {
      const c = Math.cos(-yaw), s = Math.sin(-yaw);
      for (let i = parking.bays.length - 1; i >= 0; i--) {
        const b = parking.bays[i], dx = b.x - p.centre[0], dz = b.z - p.centre[1], lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) < sw / 2 + 1 && Math.abs(lz) < sd / 2 + 1) { if (b.spawned) { const k = drive.parked.indexOf(b.spawned); if (k >= 0) drive.parked.splice(k, 1); } parking.bays.splice(i, 1); }
      }
    } catch (e) { /* no bays here */ }
    return { name: "Konto Oil " + ["Central", "Station-mae", "Hondōri", "Minami", "Kita", "Ekimae", "Bypass", "Kōen"][idx % 8], at: [p.centre[0], p.centre[1]], pumps: pumps, group: g };
  }
  K.nearestStation = function (x, z) { let b = null, bd = 1e12; K.stations.forEach(s => { const d = Math.hypot(s.at[0] - x, s.at[1] - z); if (d < bd) { bd = d; b = s; } }); return b ? { s: b, d: bd } : null; };
  function compass(dx, dz) { const a = Math.atan2(dx, -dz) * 180 / Math.PI; return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(((a + 360) % 360) / 45) % 8]; }
  function pumpNear() {
    const c = drive.car; if (!c || !c.rec || !c.rec.company || Math.abs(c.speed || 0) > 1.5) return null;
    for (const s of K.stations) for (const p of s.pumps) if (Math.hypot(p.x - c.pos.x, p.z - c.pos.z) < 4.6) return s;
    return null;
  }
  K.refuel = function (st) {
    const s = C.state(), car = s.car; if (!car) return;
    const room = TANK - car.fuel, full = Math.ceil(room * PRICE);
    const buy = (litres, hi) => {
      const price = hi ? PRICE_HI : PRICE, yen = Math.ceil(litres * price);
      if (litres < 0.5) { say("The tank's already full.", 2.5); return; }
      if (purse.yen < yen) { say("Not enough money: " + yenText(yen) + " for that. You have " + yenText(purse.yen) + ".", 4); return; }
      purse.yen -= yen; car.fuel = Math.min(TANK, car.fuel + litres); car.warned = 0;
      if (drive.car) drive.car.fuelOut = false;
      C.emit("car:refuel", { litres: Math.round(litres * 10) / 10, yen: yen, station: st.name });
      notify("Wallet", st.name, Math.round(litres * 10) / 10 + " L " + (hi ? "high-octane" : "regular") + " · " + yenText(yen), 6);
      say("Fuel " + Math.round(car.fuel / TANK * 100) + "%. " + yenText(yen) + " gone. (The train would have been cheaper.)", 4);
    };
    const opts = [
      { label: "Fill it up (regular)", note: Math.round(room * 10) / 10 + " L · " + yenText(full), fn: () => buy(room, false), dim: room < 0.5 },
      { label: "¥2,000 of regular", note: Math.round(2000 / PRICE * 10) / 10 + " L", fn: () => buy(Math.min(room, 2000 / PRICE), false), dim: room < 0.5 },
      { label: "Fill it up (high-octane)", note: yenText(Math.ceil(room * PRICE_HI)), fn: () => buy(room, true), dim: room < 0.5 },
      { label: "Get out of the car", fn: () => { if (typeof leaveCar === "function") leaveCar(); } },
      { label: "Drive on", fn: () => {} }
    ];
    C.menu({ head: st.name, tag: "Self service", body: "Tank: <b>" + Math.round(car.fuel / TANK * 100) + "%</b> (" + Math.round(car.fuel) + " of " + TANK + " L). Regular ¥" + PRICE + "/L, high-octane ¥" + PRICE_HI + "/L. You have " + yenText(purse.yen) + ".", opts: opts, cancel: () => {} });
  };

  // ---- the stations you ride from ----------------------------------------------------------------------------------------------------------
  function stationNear(x, z) {
    const city = world && world.cities && world.cities[0]; if (!city || !city.stations) return null;
    const home = railHome();
    for (const st of city.stations) {
      if (home && st === home) continue;                        // Tōkonto Central has its concourse and ticket gates
      const r = (st.yaw || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), dx = x - st.centre[0], dz = z - st.centre[1];
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < st.size[0] / 2 + 4 && Math.abs(lz) < st.size[1] / 2 + 6) return st;
    }
    return null;
  }
  K.ticket = function (st) {
    const list = K.destinationsFrom(st.name).slice(0, 7);
    if (!list.length) { say("No trains from here right now.", 3); return; }
    C.menu({ head: st.name, tag: "改札 · Ticket gates", body: "Where to? " + (wallet.ic ? "Your IC card pays at the gate (" + yenText(wallet.ic.bal) + " on it)." : "No IC card: a paper ticket from the machine.") + " Trains every few minutes. On the train, your phone (P) helps you unwind.",
      opts: list.map(d => ({ label: d.name + (d.forSoti ? "  ·  for SOTI Tower" : d.forHome ? "  ·  home" : ""), note: yenText(d.fare), fn: () => { K.trip = { mode: "train", from: st.name, at: gameMinutes() }; railTripStart(d); } }))
        .concat([{ label: "Not now", fn: () => {} }]), cancel: () => {} });
  };
  // Tōkonto Central's own ticket gates list the way home too
  if (typeof railDestinations === "function") {
    const orig = window.railDestinations;
    window.railDestinations = function () {
      const out = orig.apply(this, arguments), f = C.state && story.career && story.career.flat;
      if (!f) return out;
      const home = railHome(); if (!home) return out;
      const mine = K.destinationsFrom(home.name).find(d => d.name === f.station);
      if (mine && !out.some(d => d.name === f.station)) { out.splice(1, 0, mine); if (out.length > 7) out.pop(); }
      const d = out.find(q => q.name === f.station); if (d && !/· home/.test(d.name)) d.name = d.name + " · home";
      K.trip = { mode: "train", from: home.name, at: gameMinutes() };
      return out;
    };
  }

  // ---- the prompts (F) ---------------------------------------------------------------------------------------------------------------
  C.prompts.push({
    text: () => pumpNear() ? "Refuel" : null,
    use: () => { const s = pumpNear(); if (!s) return false; K.refuel(s); return true; }
  });
  C.prompts.push({
    text: () => { if (!C.state || !story.career || !story.career.flat || drive.car || drive.train || !player.placed || player.mode !== "walk") return null; const f = story.career.flat; return Math.hypot(player.pos.x - f.door[0], player.pos.z - f.door[1]) < 2.6 ? "Go home · " + f.name : null; },
    use: () => {
      const f = story.career.flat; if (!f) return false;
      const ok = interiorEnter(K.flatShop()); if (!ok) return false;
      say("Tadaima… (nobody answers). The futon, the wardrobe, the kitchen.", 4);
      if (story.step === "c:home") storyObjective("Get some sleep", "The futon, by the window. Tomorrow: SOTI by 9:00.");
      return true;
    }
  });
  C.prompts.push({
    text: () => { if (drive.car || drive.train || !player.placed || player.mode !== "walk" || interior.active || railTrip.on) return null; const st = stationNear(player.pos.x, player.pos.z); return st ? "Take the train · " + st.name : null; },
    use: () => { const st = stationNear(player.pos.x, player.pos.z); if (!st) return false; K.ticket(st); return true; }
  });

  // ---- every frame: fuel, the phone on the train, the way to work ---------------------------------------------------------------------
  let last = null, saveT = 0, calmT = 0, wasTrain = false, wasCar = null;
  K.frame = function (dt) {
    const s = story.career; if (!s) return;
    // the fuel gauge, and what driving burns
    const car = s.car, c = drive.car, mine = c && c.rec && c.rec.company;
    const el = gauge();
    if (mine && car) {
      if (last) { const d = Math.hypot(c.pos.x - last.x, c.pos.z - last.z); if (d < 50) car.fuel = Math.max(0, car.fuel - d * BURN * (1 + 0.25 * Math.min(1, Math.abs(c.speed || 0) / 30))); }
      last = { x: c.pos.x, z: c.pos.z };
      // the engine idles too
      if (Math.abs(c.speed || 0) < 0.5) car.fuel = Math.max(0, car.fuel - dt * 0.0006);
      const f = car.fuel / TANK;
      c.fuelOut = car.fuel <= 0.01;
      if (f < 0.2 && !(car.warned >= 1)) { car.warned = 1; const n = K.nearestStation(c.pos.x, c.pos.z); C.emit("car:fuel-low", { fuel: car.fuel }); notify("Car", "Fuel low", Math.round(f * 100) + "% left." + (n ? " Nearest: " + n.s.name + ", " + Math.round(n.d / 10) * 10 + " m " + compass(n.s.at[0] - c.pos.x, n.s.at[1] - c.pos.z) + "." : ""), 8); }
      if (c.fuelOut && !(car.warned >= 2)) { car.warned = 2; C.emit("car:out-of-fuel", {}); const n = K.nearestStation(c.pos.x, c.pos.z); say("Out of fuel. The car rolls to a stop." + (n ? " " + n.s.name + " is " + Math.round(n.d / 10) * 10 + " m " + compass(n.s.at[0] - c.pos.x, n.s.at[1] - c.pos.z) + ": walk, or get a Ryde." : ""), 7); }
      if (el) { el.classList.add("on"); el.classList.toggle("low", f < 0.2); el.innerHTML = "FUEL  " + Math.round(f * 100) + "%<div class='bar'><i style='width:" + Math.round(f * 100) + "%'></i></div>"; }
    } else { last = null; if (el) el.classList.remove("on"); }
    // remember where the car is, for the save
    saveT += dt;
    if (saveT > 1 && car) { saveT = 0; const r = K.car(); if (r) { const p = mine ? c.pos : r.pos, y = mine ? c.yaw : r.yaw; car.x = Math.round(p.x * 10) / 10; car.z = Math.round(p.z * 10) / 10; car.yaw = y; } }
    // on the train, the phone is the calm before work
    if (drive.train) {
      if (!wasTrain && C.active()) { wasTrain = true; setTimeout(() => { if (drive.train) say("A long ride. Look at your phone (P) and let the day go quiet.", 5); }, 1500); }
      if (phone.open) {
        const before = vitals.stress || 0;
        vitals.stress = clamp01(before - dt * 0.012);
        calmT += dt;
        if (calmT > 6 && before > 0.02) { calmT = 0; C.emit("phone:calm", { stress: Math.round(vitals.stress * 100) / 100 }); }
      } else vitals.stress = clamp01((vitals.stress || 0) - dt * 0.002);
    } else if (wasTrain) { wasTrain = false; K.trip = Object.assign({}, K.trip || {}, { mode: "train", ended: gameMinutes() }); }
    if (mine) wasCar = gameMinutes(); else if (wasCar !== null && !c) { K.trip = { mode: "car", ended: gameMinutes() }; wasCar = null; }
  };
  K.arrived = function () {
    const t = K.trip || {}, now = gameMinutes();
    const mode = t.ended !== undefined && now - t.ended < 45 ? t.mode : (typeof ryde === "object" && ryde && ryde.last && now - ryde.last < 30 ? "taxi" : "walk");
    C.emit("commute:arrive", { mode: mode, minutes: t.at !== undefined ? Math.round(now - t.at) : null, calm: Math.round((1 - (vitals.stress || 0)) * 100) / 100 });
    K.trip = null;
  };
  K.storyTick = function () { if (story.career && story.career.flat && !K.entrance) K.buildEntrance(); if (story.career && story.career.car && !K.stations.length) K.buildStations(); };
  function gauge() {
    let el = document.getElementById("cfuel");
    if (!el) { C.css(); el = document.createElement("div"); el.id = "cfuel"; document.body.appendChild(el); }
    return el;
  }

  // ---- on the map: home, and the fuel stations once there is a car ---------------------------------------------------------------------
  C.mapIcons = function (ctx, toScreen, opts) {
    const s = story.career; if (!s) return;
    const small = opts && opts.labels === false;
    if (s.car) K.stations.forEach(st => {
      const p = toScreen(st.at[0], st.at[1]), r = small ? 6 : 8;
      ctx.save(); ctx.fillStyle = "#c8102e"; ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(p[0] - r, p[1] - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.fillRect(p[0] - r * 0.45, p[1] - r * 0.55, r * 0.6, r * 1.1); ctx.fillStyle = "#c8102e"; ctx.fillRect(p[0] - r * 0.3, p[1] - r * 0.4, r * 0.3, r * 0.3);
      if (!small) { ctx.font = "700 12px " + (typeof UI === "string" ? UI : "sans-serif"); ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.lineWidth = 3; ctx.strokeText(st.name, p[0] + r + 4, p[1] + 4); ctx.fillText(st.name, p[0] + r + 4, p[1] + 4); }
      ctx.restore();
    });
    if (s.flat && !story.blips.some(b => Math.hypot(b.x - s.flat.door[0], b.z - s.flat.door[1]) < 3)) {
      const p = toScreen(s.flat.door[0], s.flat.door[1]), r = small ? 7 : 9;
      ctx.save(); ctx.fillStyle = "#5fd38a"; ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p[0], p[1] - r * 1.1); ctx.lineTo(p[0] + r, p[1] - r * 0.1); ctx.lineTo(p[0] + r * 0.7, p[1] - r * 0.1); ctx.lineTo(p[0] + r * 0.7, p[1] + r); ctx.lineTo(p[0] - r * 0.7, p[1] + r); ctx.lineTo(p[0] - r * 0.7, p[1] - r * 0.1); ctx.lineTo(p[0] - r, p[1] - r * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!small) { ctx.font = "700 12px " + (typeof UI === "string" ? UI : "sans-serif"); ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.lineWidth = 3; ctx.strokeText("Home", p[0] + r + 4, p[1] + 4); ctx.fillText("Home", p[0] + r + 4, p[1] + 4); }
      ctx.restore();
    }
  };

  // ---- built behind the loading screen (the persistence engine's extra stages) ------------------------------------------------------------
  (window.PERSIST_EXTRA = window.PERSIST_EXTRA || []).push(function (P, facts) {
    P.stage("career", 0.5, async ctx => {
      let built = [];
      try { if (!interior.rooms["soti:floor"]) { interior.rooms["soti:floor"] = O.buildFloor(); } built.push("SOTI 3F"); } catch (e) { facts.careerFail = (facts.careerFail || []).concat("SOTI 3F: " + e.message); }
      await ctx.breathe();
      try { if (!interior.rooms["career:flat"]) { interior.rooms["career:flat"] = K.buildFlat(); } built.push("flat"); } catch (e) { facts.careerFail = (facts.careerFail || []).concat("flat: " + e.message); }
      facts.career = built;
      return { built: built };
    }, { label: "Opening the office" });
    P.check("world", "SOTI 3F and the flat ready", () => facts.careerFail && facts.careerFail.length ? "rooms that would not build: " + facts.careerFail.join(", ") : { ok: true, detail: (facts.career || []).join(", ") || "skipped" });
  });

  console.log("[Career] the flat, the trains, the company car and Konto Oil");
})();
