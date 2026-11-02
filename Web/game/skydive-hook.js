// The game's side of the Shigoto skydiving engine (SHIGOTO.Skydiver, WindField, CanopyRig; Engine/src/skydive).
//
// BASE JUMPS. The tallest towers on the island have their roofs open: walk up to the foot of one and take the lift to the
// roof (F / Y), where a BASE rig is waiting by the lift. Walk over it to put it on. Then run off the edge (or jump with Space /
// X): with a rig on, walking off the edge is jumping; without one, the edge stops you unless you jump on purpose.
// Dial 5550123 (or type BASEJUMP) to be put on the next roof with a rig on your back. Jumping out of an aircraft (F / Y in
// the air, or SKYDIVE / 5550122) gives you a sport rig.
//
// FREEFALL (SHIGOTO.Skydiver): you leave upright and the airflow lays you belly to earth over a couple of seconds.
//   W / stick forward   track: the body becomes a wing and carries you forward about a metre for every metre down
//   Shift + W           head down: the fastest way down, about 290 km/h
//   S / stick back      spread out: slower, about 165 km/h
//   A D / stick         turn (more bite the faster you go)
//   Space / A           throw the pilot chute
// The wind is real: it grows with height, gusts, swings round the towers, and blows up the windward face and over the roof.
//
// UNDER CANOPY: A / D are the left and right toggles (turns: the harder you pull, the more you bank and the more height a
// turn costs), S pulls both (slow flight, and pulled quickly near the ground, the flare), W pulls the front risers (faster,
// steeper). Hold full brakes too long and the wing stalls. Land into the wind and flare at about four metres.
//
// CRASHES: hitting a building, the ground in freefall, or landing hard throws Seiko into the ragdoll (window.ragdoll); a wall
// strike under canopy collapses it. Off switch: ?skydive=0 (the game's old parachute comes back).
// Console: skydive.roofs(), skydive.telemetry(), skydive.go(i).

(function () {
  if (!window.SHIGOTO || !SHIGOTO.Skydiver) { console.warn("[Konto] skydive engine not in this build"); return; }
  if (/[?&]skydive=0\b/.test(location.search)) { console.log("[Konto] skydive engine turned off"); return; }
  const V3 = THREE.Vector3, clampN = (v, a, b) => (v < a ? a : v > b ? b : v), lerpN = (a, b, t) => a + (b - a) * t;
  const DIRS = ["↑", "↖", "←", "↙", "↓", "↘", "→", "↗"];

  const SK = window.skydive = { sd: null, rigs: {}, kit: null, pack: null, have: false, haveSpec: "base", _roofs: [], roofKey: "", t: 0, said: {} };

  // ---- the world as the air sees it ---------------------------------------------------------------------------------------------------
  const solidsNear = (x, z, r) => {
    if (typeof solidGrid === "undefined" || !solidGrid) return [];
    const C = solidGrid.cell, out = [], seen = new Set();
    const x0 = Math.floor((x - r) / C), x1 = Math.floor((x + r) / C), z0 = Math.floor((z - r) / C), z1 = Math.floor((z + r) / C);
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      const l = solidGrid.map.get(gx + "," + gz); if (!l) continue;
      for (let k = 0; k < l.length; k++) { const i = l[k]; if (seen.has(i)) continue; seen.add(i); out.push(solids[i]); }
    }
    return out;
  };
  // buildings for the wind, refreshed twice a second round the jumper (the wind samples them 120 times a second)
  let obsCache = [], obsAt = { x: 1e9, z: 1e9, t: -1 };
  const obstacles = (x, z) => {
    if (Math.hypot(x - obsAt.x, z - obsAt.z) > 40 || SK.t - obsAt.t > 0.5) {
      obsCache = solidsNear(x, z, 260).filter(b => !b.deck && (b.h || 0) >= 25).map(b => ({ cx: b.c[0], cz: b.c[1], hw: b.size[0] / 2, hl: b.size[1] / 2, yaw: b.yaw * Math.PI / 180, base: b.y || 0, top: (b.y || 0) + b.h }));
      obsAt = { x: x, z: z, t: SK.t };
    }
    return obsCache;
  };
  const wind = new SHIGOTO.WindField({ obstacles: obstacles, dir: Math.random() * Math.PI * 2, seed: 1 + (Math.random() * 1000 | 0) });
  const groundAt = (x, z, y) => {
    let g = world.surfaceY(x, z);
    try { g = Math.max(g, chuteTop(x, z, y)); } catch (e) { /* none */ }
    for (const r of SK._roofs) if (r.deck && y >= r.top - 0.5 && onRoof(r, x, z, 0)) g = Math.max(g, r.top);
    if (world.sampleHeight(x, z) < 0.2) g = Math.max(g, 0);
    return g;
  };
  // inside a building? the outward normal of the face he went through
  const wallAt = (x, y, z, r) => {
    const list = r > 1.5 ? solidsNear(x, z, r) : (typeof solidGrid !== "undefined" && solidGrid ? (solidGrid.map.get(Math.floor(x / solidGrid.cell) + "," + Math.floor(z / solidGrid.cell)) || []).map(i => solids[i]) : []);
    for (let k = 0; k < list.length; k++) {
      const b = list[k]; if (b.deck || (b.h || 0) < 3) continue;
      const by = b.y || 0; if (y > by + b.h - 0.2 || y < by - 0.5) continue;
      const q = toRectLocal(x, z, b.c[0], b.c[1], b.yaw), hx = b.size[0] / 2 + r, hz = b.size[1] / 2 + r;
      if (Math.abs(q[0]) >= hx || Math.abs(q[1]) >= hz) continue;
      const px = hx - Math.abs(q[0]), pz = hz - Math.abs(q[1]);
      const lx = px < pz ? Math.sign(q[0]) || 1 : 0, lz = px < pz ? 0 : Math.sign(q[1]) || 1;
      const a = b.yaw * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
      return { nx: lx * cs + lz * sn, nz: -lx * sn + lz * cs, b: b };
    }
    return null;
  };
  function weatherNow() { try { return (window.shigoto && shigoto.engine && shigoto.engine.weather.state) || "clear"; } catch (e) { return "clear"; } }

  // ---- the rigs ------------------------------------------------------------------------------------------------------------------------
  function rigFor(kind) {
    if (!SK.rigs[kind]) {
      const r = new SHIGOTO.CanopyRig(THREE, { spec: SHIGOTO.CANOPY_SPECS[kind], scheme: kind === "base" ? "sunrise" : "harbour" });
      r.group.visible = false; scene.add(r.group); SK.rigs[kind] = r;
    }
    return SK.rigs[kind];
  }
  function kit() { return SK.kit || (SK.kit = rigFor("base")); }
  // the container on his back, placed from his chest bone each frame so it follows the arch and the hang
  function wearPack(on) {
    if (!player.obj) return;
    if (!SK.pack) { SK.pack = kit().makeContainer(); SK.pack.visible = false; scene.add(SK.pack); }
    SK.pack.visible = !!on && player.obj.visible;
  }
  const _q = new THREE.Quaternion(), _v = new V3(), _w = new V3();
  function placePack() {
    if (!SK.pack || !SK.pack.visible) return;
    if (!SK.bones || SK.bones.root !== player.obj) { const B = SHIGOTO.findRagdollBones(player.obj); SK.bones = B ? { root: player.obj, neck: B.neck, pelvis: B.pelvis } : { root: player.obj }; }
    player.obj.updateMatrixWorld(true);
    player.obj.getWorldQuaternion(_q);
    const back = new V3(0, 0, -1).applyQuaternion(_q), up = new V3(0, 1, 0).applyQuaternion(_q);
    if (SK.bones.neck) {
      SK.bones.neck.getWorldPosition(_v); SK.bones.pelvis.getWorldPosition(_w);
      const mid = _v.clone().lerp(_w, 0.42); SK.pack.position.copy(mid).addScaledVector(back, 0.17);
      const spineUp = _v.clone().sub(_w).normalize();
      const m = new THREE.Matrix4().lookAt(new V3(), back.clone().negate(), spineUp); SK.pack.quaternion.setFromRotationMatrix(m);
      SK.pack.rotateY(Math.PI);
    } else { SK.pack.position.copy(player.obj.position).addScaledVector(up, 1.3).addScaledVector(back, 0.18); SK.pack.quaternion.copy(_q); }
  }

  // ---- roofs you can jump from -------------------------------------------------------------------------------------------------------
  function onRoof(r, x, z, inset) { const q = toRectLocal(x, z, r.cx, r.cz, r.yawDeg); return Math.abs(q[0]) < r.hw - inset && Math.abs(q[1]) < r.hl - inset; }
  function addRoof(b, base) {
    const top = (b.y || 0) + b.h;
    if (SK._roofs.some(r => r.b === b)) return SK._roofs.find(r => r.b === b);
    const a = b.yaw * Math.PI / 180, hw = b.size[0] / 2 - 0.6, hl = b.size[1] / 2 - 0.6;
    const deck = { cx: b.c[0], cz: b.c[1], c: Math.cos(a), s: Math.sin(a), hw: hw, hl: hl, ya: top, yb: top, r: Math.hypot(hw, hl) + 1, basejump: true };
    world.walk.push(deck);
    const r = { b: b, cx: b.c[0], cz: b.c[1], yawDeg: b.yaw, hw: hw, hl: hl, top: top, base: b.y || 0, deck: deck, lift: null, rig: null, rigBack: 0, isBase: !!base };
    // the lift lobby comes out a few metres in from one side; the rig waits beside it
    const L = (lx, lz) => { const cs = Math.cos(a), sn = Math.sin(a); return [b.c[0] + lx * cs + lz * sn, b.c[1] - lx * sn + lz * cs]; };
    r.lift = L(0, -hl + Math.min(4, hl * 0.4)); r.rigAt = L(Math.min(2.2, hw * 0.4), -hl + Math.min(5.5, hl * 0.6));
    if (base) {
      const m = kit().makeContainer(); m.position.set(r.rigAt[0], top + 0.22, r.rigAt[1]); m.rotation.set(-1.25, -a, 0); m.scale.setScalar(1.15);
      scene.add(m); r.rig = m;
    }
    SK._roofs.push(r);
    return r;
  }
  function clearRoofs() {
    SK._roofs.forEach(r => { const i = world.walk.indexOf(r.deck); if (i >= 0) world.walk.splice(i, 1); if (r.rig) scene.remove(r.rig); });
    SK._roofs = [];
  }
  function scanRoofs() {
    if (typeof solids === "undefined" || !solids || solids.length < 50 || !world || !world.walk) return;
    const key = solids.length + ":" + (solids[0] && solids[0].c[0]);
    if (key === SK.roofKey) return;
    SK.roofKey = key; clearRoofs();
    const tall = solids.filter(b => !b.deck && (b.h || 0) + (b.y || 0) - world.surfaceY(b.c[0], b.c[1]) >= 95 && b.size[0] >= 14 && b.size[1] >= 14).sort((a, b) => (b.h + (b.y || 0)) - (a.h + (a.y || 0)));
    const pick = [];
    for (const b of tall) { if (pick.length >= 14) break; if (pick.every(p => Math.hypot(p.c[0] - b.c[0], p.c[1] - b.c[1]) > 240)) pick.push(b); }
    pick.forEach(b => addRoof(b, true));
    if (pick.length) console.log("[Konto] BASE roofs: " + pick.length + " (tallest " + Math.round(pick[0].h + (pick[0].y || 0)) + " m)");
  }
  SK.roofs_ = () => SK._roofs;
  SK.roofs = () => SK._roofs.filter(r => r.isBase).map(r => ({ x: Math.round(r.cx), z: Math.round(r.cz), top: Math.round(r.top) }));
  function roofUnder(x, z, y) { for (const r of SK._roofs) if (Math.abs(y - r.top) < 1.2 && onRoof(r, x, z, -0.5)) return r; return null; }
  function towerBeside(x, z, y) {
    for (const r of SK._roofs) { if (!r.isBase || y > r.base + 6) continue; const q = toRectLocal(x, z, r.cx, r.cz, r.yawDeg); if (Math.abs(q[0]) < r.hw + 5.5 && Math.abs(q[1]) < r.hl + 5.5) return r; }
    return null;
  }

  // walking about on a roof: the building under him is not a wall; the edge is a drop
  const _tryStep = window.tryStep;
  window.tryStep = function (dx, dz, radius) {
    if (typeof interior !== "undefined" && interior.active) return _tryStep.apply(this, arguments);
    const r = player.placed && roofUnder(player.pos.x, player.pos.z, player.pos.y);
    if (!r) return _tryStep.apply(this, arguments);
    const nx = player.pos.x + dx, nz = player.pos.z + dz;
    if (onRoof(r, nx, nz, 0.25)) { player.pos.x = nx; player.pos.z = nz; return true; }
    // over the parapet
    if (SK.have || player.jump > 0) { baseJump(r, dx, dz); return false; }
    if (!SK.said.edge || SK.t - SK.said.edge > 6) { SK.said.edge = SK.t; say("A long way down. Pick up the parachute by the lift, or Space to jump without one.", 4); }
    return false;
  };

  // ---- starting a jump -------------------------------------------------------------------------------------------------------------------
  function start(o) {
    const kind = o.spec;
    SK.sd = new SHIGOTO.Skydiver({ canopy: kind, wind: wind, ground: groundAt, wall: wallAt, mass: 88 });
    wind.set(weatherNow());
    wind.t0 = SK.t;
    SK.sd.exit({ pos: { x: o.pos.x, y: o.pos.y, z: o.pos.z }, vel: o.vel, yaw: o.yaw, from: o.from });
    SK.rig = rigFor(kind); SK.rig.group.visible = false; SK.noChute = !o.chute; SK.landT = 0; SK.camKick = 0;
    chute.active = true; chute.state = "fall"; chute.pos.set(o.pos.x, o.pos.y, o.pos.z); chute.h = o.yaw; chute.t = 0; chute.flying = false; chute.warned = false;
    player.obj.visible = true; player.speed = 0; player.mode = "walk"; player.jump = 0;
    SK.have = false; wearPack(!!o.chute);
    SK.fov0 = camera.fov;
    if (!chute.hud) { const h = document.createElement("div"); h.id = "chutehud"; h.style.cssText = "position:fixed;left:50%;bottom:calc(8% + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:60;pointer-events:none;color:#fff;font:800 17px 'Konto Sans','Segoe UI',sans-serif;padding:10px 20px;background:rgba(8,12,18,.72);border-left:4px solid #ffd21c;white-space:nowrap;text-align:center"; document.body.appendChild(h); chute.hud = h; }
    chute.hud.style.display = "block";
  }
  function baseJump(r, dx, dz) {
    const d = Math.hypot(dx, dz) || 1, sp = Math.max(player.speed, 3.2) + (player.jump > 0 ? 1.5 : 0);   // a committed push away from the wall
    const vx = dx / d * sp, vz = dz / d * sp, yawv = Math.atan2(vx, vz);
    const had = SK.have;
    start({ spec: SK.haveSpec || "base", chute: had, from: "building", yaw: yawv,
      pos: { x: player.pos.x + dx / d * 0.6, y: player.pos.y + 0.1, z: player.pos.z + dz / d * 0.6 }, vel: { x: vx, y: player.jump > 0 ? 2.6 : 0.6, z: vz } });
    yaw = yawv + Math.PI; pitch = -0.55;
    if (had) say((pad.index >= 0 ? padLabel("A") : "Space") + " throws the pilot chute. Give it a second or two to get clear of the building.", 5);
    else say("You jumped without a parachute.", 3);
    if (typeof adrenalineRush === "function") try { adrenalineRush(6); } catch (e) { /* none */ }
  }
  // out of an aircraft
  window.bailOut = function () {
    const f = flight; if (!f.active || !f.air) return;
    ghosts.push({ mesh: f.mesh, pos: f.pos.clone(), h: f.h, v: f.v, gamma: f.gamma, pitch: f.pitch, roll: f.roll, off: f.off, P: f.P, t: 0 });
    f.active = false; f.hud.style.display = "none"; flightQuality(false); f.mesh.visible = true;
    const v = f.v, cg = Math.cos(f.gamma || 0);
    placeSeiko(new V3(f.pos.x, 0, f.pos.z));
    start({ spec: "sport", chute: true, from: "aircraft", yaw: f.h, pos: { x: f.pos.x, y: f.pos.y - 2, z: f.pos.z },
      vel: { x: Math.sin(f.h) * v * cg * 0.8, y: Math.sin(f.gamma || 0) * v - 1, z: Math.cos(f.h) * v * cg * 0.8 } });
    yaw = f.h + Math.PI; pitch = -0.45;
    say("You jumped. " + (pad.index >= 0 ? padLabel("A") : "Space") + " opens the parachute. Do it with height to spare.", 6);
  };
  window.chuteOpen = function () {
    if (!chute.active || !SK.sd || SK.sd.phase !== "freefall") return;
    if (SK.noChute) { if (!SK.said.nochute || SK.t - SK.said.nochute > 3) { SK.said.nochute = SK.t; say("You have no parachute.", 2); } return; }
    if (SK.sd.deploy()) { if (typeof rumble === "function") rumble(0.35, 0.25, 200); }
  };

  // ---- the end of a jump ------------------------------------------------------------------------------------------------------------------
  function finish(how, ev) {
    const sd = SK.sd, p = sd.pos;
    if (SK.rig) SK.rig.group.visible = false;
    wearPack(false);
    if (SK.fov0) { camera.fov = SK.fov0; camera.updateProjectionMatrix(); }
    chute.pos.set(p.x, p.y, p.z); chute.h = sd.yaw;
    const vel = ev && ev.vel ? ev.vel : { x: sd.vel.x, y: sd.vel.y, z: sd.vel.z };
    const kmh = Math.round(Math.hypot(vel.x, vel.y, vel.z) * 3.6);
    const water = world.sampleHeight(p.x, p.z) < 0.2;
    const thrown = how === "crash" || how === "impact" || how === "fatal" || how === "wall" || how === "collapse";
    if (thrown && window.ragdoll && !water) {
      // into the ragdoll where he is, in the pose he is in, at the speed he was going
      chute.active = false; chute.state = ""; chute.flying = false; player.forceClip = null; if (chute.hud) chute.hud.style.display = "none";
      player.pos.set(p.x, p.y, p.z); player.yaw = player.targetYaw = sd.yaw;
      const spin = { x: Math.cos(sd.yaw) * (2 + kmh / 30), y: (Math.random() - 0.5) * 2, z: -Math.sin(sd.yaw) * (2 + kmh / 30) };
      const v = how === "wall" || how === "collapse" ? vel : { x: vel.x * 0.75, y: Math.max(vel.y * -0.12, 0.6), z: vel.z * 0.75 };
      const ok = ragdoll.launchSeiko({ vel: v, spin: spin, yaw: sd.yaw, cause: how === "wall" || how === "collapse" ? "impact" : "landing" });
      if (how === "fatal") { vitals.health = 0.02; vitals.stress = clampN(vitals.stress + 0.6, 0, 1); say("You hit the ground at " + kmh + " km/h.", 5); }
      else if (how === "impact") { vitals.health = clampN(vitals.health - 0.6, 0.03, 1); say("You hit the ground at " + kmh + " km/h. Pull higher.", 5); }
      else if (how === "crash") { vitals.health = clampN(vitals.health - 0.3, 0.04, 1); say("You came in at " + kmh + " km/h and tumbled. Flare at about four metres.", 5); }
      else if (how === "collapse") say("The canopy hit the building and folded.", 4);
      else say("You hit the building at " + kmh + " km/h.", 4);
      if (!ok) { player.down = 4; chuteEnd(null); }
      SK.sd = null; return;
    }
    let msg;
    if (how === "perfect") msg = "A perfect flare. You stepped down onto the ground.";
    else if (how === "good") msg = Math.hypot(vel.x, vel.z) > 5 ? "You ran it out. A good landing." : "A good landing.";
    else if (how === "hard") { vitals.health = clampN(vitals.health - 0.12, 0.05, 1); player.down = 1.6; msg = "A hard landing: you rolled it. Flare to slow down."; }
    else msg = null;
    if (water) msg = how === "fatal" || how === "impact" ? (vitals.health = 0.05, "You hit the water at " + kmh + " km/h. It was like concrete.") : null;
    chute.pos.y = p.y;
    chuteEnd(msg);
    // came down on a roof: stay on it (it becomes walkable, with a lift down)
    const roofB = !water && solidsNear(p.x, p.z, 2).find(s => !s.deck && Math.abs((s.y || 0) + s.h - p.y) < 0.8 && Math.abs(toRectLocal(p.x, p.z, s.c[0], s.c[1], s.yaw)[0]) < s.size[0] / 2 && Math.abs(toRectLocal(p.x, p.z, s.c[0], s.c[1], s.yaw)[1]) < s.size[1] / 2);
    if (roofB && p.y > world.surfaceY(p.x, p.z) + 4) { addRoof(roofB, false); player.pos.y = (roofB.y || 0) + roofB.h; player.obj.position.copy(player.pos); }
    if (how === "good" && Math.hypot(vel.x, vel.z) > 5) { player.speed = 3.5; }
    SK.sd = null;
  }

  // ---- every frame of a jump --------------------------------------------------------------------------------------------------------------
  const keyIs = c => !!(keys[c]);
  window.updateChute = function (dt) {
    const sd = SK.sd; if (!sd) { chute.active = false; return; }
    dt = Math.min(dt, 0.05);
    const w = wish();
    const R = (keyIs("KeyD") || keyIs("ArrowRight") ? 1 : 0), L = (keyIs("KeyA") || keyIs("ArrowLeft") ? 1 : 0);
    const F = (keyIs("KeyW") || keyIs("ArrowUp") ? 1 : 0), B = (keyIs("KeyS") || keyIs("ArrowDown") ? 1 : 0);
    const shift = keyIs("ShiftLeft") || keyIs("ShiftRight") || w.run;
    const turn = clampN(R - L + w.x, -1, 1), fwd = clampN(F - B - w.y, -1, 1);
    const inp = sd.phase === "canopy"
      ? { brakeL: Math.max(L, B, w.x < 0 ? -w.x : 0, w.y > 0 ? w.y : 0), brakeR: Math.max(R, B, w.x > 0 ? w.x : 0, w.y > 0 ? w.y : 0), risers: Math.max(F, w.y < 0 ? -w.y : 0) }
      : { pitch: fwd, turn: turn, dive: shift && fwd > 0.5 };
    const ev = sd.step(dt, inp);
    for (const e of ev) {
      if (e.type === "linestretch") { if (typeof rumble === "function") rumble(0.6, 0.5, 180); SK.camKick = 0.5; if (e.twists) say("Line twists! Hands off the toggles while it kicks out.", 3); else if (Math.abs(e.offHeading) > 0.6) say("Off-heading opening. Steer away from the wall!", 3); }
      if (e.type === "open") { chute.flying = true; if (typeof rumble === "function") rumble(0.8, 0.8, 260); say("Canopy open (" + e.g.toFixed(1) + " g). A/D toggles, S brakes and flare, W front risers.", 4); }
      if (e.type === "untwisted") say("Twists out. You have the toggles.", 2);
      if (e.type === "stall") say("Stall! Let the brakes up.", 2);
      if (e.type === "wall") {
        if (e.phase === "canopy" && e.part === "canopy" && e.into <= 2.2) { if (typeof rumble === "function") rumble(0.4, 0.4, 140); continue; }
        // a brush along the wall is a bounce; going into it properly is a ragdoll
        if (e.into > (e.phase === "canopy" ? 4 : 3.2)) { finish("wall", { vel: { x: sd.vel.x + e.normal.x * 2, y: sd.vel.y, z: sd.vel.z + e.normal.z * 2 } }); return; }
      }
      if (e.type === "collapse") { finish("collapse", null); return; }
      if (e.type === "land") { finish(e.phase === "canopy" ? e.quality : (e.quality === "good" ? "hard" : e.quality), e); return; }
    }
    if (sd.phase === "collapsed") { finish("collapse", null); return; }
    const st = sd.state(), p = sd.pos;
    SK.t += dt; chute.t += dt;
    chute.pos.set(p.x, p.y, p.z); chute.h = sd.yaw; chute.hs = st.ground; chute.vy = sd.vel.y; chute.vx = sd.vel.x; chute.vz = sd.vel.z;
    chute.state = sd.phase === "canopy" ? "open" : "fall";
    const alt = Math.max(0, st.alt);

    // ---- Seiko ----
    const ob = player.obj; ob.visible = true;
    const yawB = sd.yaw;
    if (sd.phase === "freefall" || (sd.phase === "deploy" && sd.fill < 0.4)) {
      const lay = 1 - st.upright;
      ob.position.set(p.x, p.y, p.z);
      ob.rotation.set(lay * (1.45 + Math.max(-0.4, st.theta) * 0.9), yawB, -st.roll * 0.8 * lay + (sd.phase === "deploy" ? 0.25 : 0), "YXZ");
      chuteClip(st.upright > 0.6 ? "canopy" : (inp.dive || st.theta > 0.7) ? "skydive_dive" : "skydive");
      if (SK.rig) SK.rig.group.visible = sd.phase === "deploy" && sd.linesOut > 0.15;
    } else {
      // hanging in the harness under the wing, swung by the turn and the surge
      const e = new THREE.Euler(-st.swing, yawB, -st.bank, "YXZ"), qq = new THREE.Quaternion().setFromEuler(e);
      const sh = new V3(p.x, p.y + 1.45, p.z), feet = new V3(0, -1.45, 0).applyQuaternion(qq).add(sh);
      // while it fills, he swings from belly down to upright under it
      const k = sd.phase === "deploy" ? clampN((sd.fill - 0.4) / 0.6, 0, 1) : 1;
      ob.position.copy(feet);
      ob.rotation.set(lerpN(1.45, -st.swing * 0.7, k), yawB, -st.bank * 0.7 * k, "YXZ");
      chuteClip(sd.phase !== "canopy" ? "canopy" : (st.brakeL > 0.5 && st.brakeR > 0.5) ? "flare" : st.brakeR > st.brakeL + 0.3 ? "canopy_r" : st.brakeL > st.brakeR + 0.3 ? "canopy_l" : "canopy");
    }
    if (player.mixer) updateSeikoClip(dt);
    placePack();
    // ---- the canopy ----
    if (SK.rig && (sd.phase === "deploy" || sd.phase === "canopy")) {
      const g = SK.rig.group; g.visible = sd.phase === "canopy" || sd.linesOut > 0.15;
      const cy = sd.phase === "canopy" ? sd.yaw : (sd.canopyYaw !== undefined && sd.fill > 0 ? sd.canopyYaw : sd.yaw);
      g.position.set(p.x, p.y + 1.45, p.z);
      const k = sd.phase === "canopy" ? 1 : smooth01(sd.fill);
      g.rotation.set(-st.swing * k, cy, -st.bank * k, "YXZ");
      SK.rig.update({ fill: st.fill, slider: sd.slider, brakeL: st.brakeL, brakeR: st.brakeR, risers: st.risers, pcOut: st.pcOut, linesOut: st.linesOut, phase: sd.phase, t: SK.t });
    }
    player.pos.set(p.x, p.y, p.z); player.speed = st.ground; player.yaw = yawB;

    // ---- the HUD: altimeter, speed, the wind relative to where you are heading ----
    const wv = st.wind, ws = Math.hypot(wv.x, wv.z), rel = Math.atan2(wv.x, wv.z) - yawB;
    const arrow = DIRS[((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8];
    const keysTxt = sd.phase === "canopy" ? (st.twists > 0 ? "LINE TWISTS" : st.stalled ? "STALL: let the brakes up" : "A/D toggles · S brakes · W risers") : SK.noChute ? "no parachute" : "W track · Shift+W dive · S slow · A/D turn · " + (pad.index >= 0 ? padLabel("A") : "Space") + " pull";
    const danger = sd.phase === "freefall" && !SK.noChute && alt < (sd.spec.slider ? 350 : 90);
    chute.hud.style.borderLeftColor = danger && Math.floor(SK.t * 3) % 2 === 0 ? "#ff3b2f" : sd.phase === "canopy" ? (st.stalled ? "#ff3b2f" : "#7df0a8") : "#ffd21c";
    chute.hud.textContent = Math.round(alt) + " m  ·  " + (sd.phase === "canopy" ? Math.round(st.ground * 3.6) + " km/h · " + st.sink.toFixed(1) + " m/s down" : Math.round(st.speed * 3.6) + " km/h") +
      (sd.phase === "deploy" ? "  ·  " + (st.fill > 0 ? "opening " + st.g.toFixed(1) + " g" : "pilot chute out") : "") +
      "  ·  wind " + Math.round(ws * 3.6) + " km/h " + arrow + "  ·  " + keysTxt + (sd.phase === "canopy" && alt < 12 && alt > 1.5 ? "  ·  FLARE (S)" : danger ? "  ·  PULL" : "");
    if (danger && !chute.warned && alt < (sd.spec.slider ? 250 : 60)) { chute.warned = true; say("Pull!", 1.5); }

    // ---- the camera: behind and above; it is yours to swing, and drifts back behind you when left alone ----
    if (!look.x && !look.y) { let d = (yawB + Math.PI) - yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; yaw += d * (1 - Math.exp(-(sd.phase === "canopy" ? 0.8 : 1.4) * dt)); }
    const open = sd.phase === "canopy" || (sd.phase === "deploy" && sd.fill > 0.3);
    const dist = open ? 12.5 : 6.5 + clampN(st.speed / 80, 0, 1) * 2.5;
    const dir = new V3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const tgt = new V3(p.x, p.y + (open ? 3.6 : 0.6), p.z);
    const want = tgt.clone().addScaledVector(dir, -dist); const gc = world.surfaceY(want.x, want.z) + 1.2; if (want.y < gc) want.y = gc;
    camPos.lerp(want, 1 - Math.pow(SK.camKick > 0 ? 0.2 : 0.0008, dt)); SK.camKick = Math.max(0, SK.camKick - dt);
    if (!open) { const sh = clampN(st.speed / 75, 0, 1) * 0.07 + (sd.phase === "deploy" ? 0.05 : 0); camPos.x += (Math.random() - 0.5) * sh; camPos.y += (Math.random() - 0.5) * sh; camPos.z += (Math.random() - 0.5) * sh; }
    camera.position.copy(camPos); camera.lookAt(tgt);
    if (SK.fov0) { const f = SK.fov0 + (open ? 0 : clampN((st.speed - 20) / 60, 0, 1) * 14); if (Math.abs(camera.fov - f) > 0.05) { camera.fov = lerpN(camera.fov, f, 1 - Math.exp(-3 * dt)); camera.updateProjectionMatrix(); } }
  };
  const smooth01 = t => { t = clampN(t, 0, 1); return t * t * (3 - 2 * t); };

  // ---- roofs: the lift up, the lift down, the rig, the pack on his back -----------------------------------------------------------------
  const _airNear = window.airNear, _airUse = window.airUse;
  window.airNear = function () {
    const a = _airNear.apply(this, arguments); if (a) return a;
    if (!player.placed || player.mode !== "walk" || drive.car || drive.train || chute.active) return null;
    const p = player.pos, r = roofUnder(p.x, p.z, p.y);
    if (r) return Math.hypot(p.x - r.lift[0], p.z - r.lift[1]) < 3.5 || !r.isBase ? { kind: "liftdown", roof: r, text: "Take the lift down" } : null;
    const t = towerBeside(p.x, p.z, p.y);
    if (t) return { kind: "liftup", roof: t, text: "Take the lift to the roof (" + Math.round(t.top - world.surfaceY(p.x, p.z)) + " m)" };
    return null;
  };
  window.airUse = function () {
    const a = window.airNear(); if (!a) return false;
    if (a.kind === "liftup") { goRoof(a.roof); return true; }
    if (a.kind === "liftdown") {
      const r = a.roof, cs = Math.cos(r.yawDeg * Math.PI / 180), sn = Math.sin(r.yawDeg * Math.PI / 180), lz = -(r.hl + 3.5);
      const x = r.cx + lz * sn, z = r.cz + lz * cs;
      player.pos.set(x, world.walkY(x, z, r.base + 2), z); player.obj.position.copy(player.pos); camPos.set(x, player.pos.y + 3, z);
      say("Ground floor.", 2); return true;
    }
    return _airUse.apply(this, arguments);
  };
  function goRoof(r, withRig) {
    if (typeof drive !== "undefined" && drive.car && typeof leaveCar === "function") leaveCar();
    if (typeof interior !== "undefined" && interior.active && typeof interiorLeave === "function") interiorLeave(true);
    player.pos.set(r.lift[0], r.top, r.lift[1]); player.onWalk = true;
    const a = r.yawDeg * Math.PI / 180; player.yaw = player.targetYaw = Math.atan2(Math.sin(a) * 1, Math.cos(a) * 1);
    player.obj.position.copy(player.pos); player.obj.rotation.set(0, player.yaw, 0);
    yaw = player.yaw + Math.PI; pitch = -0.2; camPos.set(player.pos.x, player.pos.y + 3, player.pos.z);
    if (withRig) { SK.have = true; SK.haveSpec = "base"; wearPack(true); }
    say(Math.round(r.top - world.surfaceY(r.cx, r.cz)) + " metres up." + (SK.have ? " Run off the edge to jump." : " The parachute is by the lift."), 4);
  }
  SK.go = (i) => { const L = SK._roofs.filter(r => r.isBase); if (!L.length) return say("No towers tall enough here.", 3); goRoof(L[((i | 0) % L.length + L.length) % L.length], true); };
  try {
    CHEAT_ACTIONS.BASEJUMP = { dial: "5550123", note: "", fn: () => { SK.next = (SK.next || 0) + 1; SK.go(SK.next - 1); } };
  } catch (e) { /* the cheat table is not there */ }

  // rigs on roofs: walk over one to put it on; it comes back a minute after it is taken
  function roofTick(dt) {
    SK.t += chute.active ? 0 : dt;
    if (Math.floor(SK.t) !== SK.lastScan) { SK.lastScan = Math.floor(SK.t); if (SK.lastScan % 3 === 0) scanRoofs(); }
    if (!player.placed || !player.obj) return;
    const p = player.pos;
    for (const r of SK._roofs) {
      if (!r.rig) continue;
      if (!r.rig.visible) { r.rigBack -= dt; if (r.rigBack <= 0) r.rig.visible = true; continue; }
      if (!chute.active && !SK.have && Math.abs(p.y - r.top) < 1.5 && Math.hypot(p.x - r.rigAt[0], p.z - r.rigAt[1]) < 1.3) {
        r.rig.visible = false; r.rigBack = 60; SK.have = true; SK.haveSpec = "base"; wearPack(true);
        say("BASE rig on. Run off the edge to jump; " + (pad.index >= 0 ? padLabel("A") : "Space") + " throws the pilot chute.", 5);
        if (typeof rumble === "function") rumble(0.3, 0.2, 120);
      }
    }
    if (!chute.active) { wearPack(SK.have && player.mode === "walk" && !drive.car && !drive.train); placePack(); }
  }
  // ---- built behind the loading screen: every canopy and the container, so the first jump does not build and upload them mid-air
  (window.PERSIST_EXTRA = window.PERSIST_EXTRA || []).push(function (P, facts) {
    P.stage("parachutes", 0.2, async () => {
      const built = [];
      try { Object.keys(SHIGOTO.CANOPY_SPECS || {}).forEach(k => { rigFor(k); built.push(k); }); kit(); if (!SK.pack) { SK.pack = kit().makeContainer(); SK.pack.visible = false; scene.add(SK.pack); } } catch (e) { facts.chuteFail = e.message; }
      facts.chutes = built;
      return { canopies: built };
    }, { label: "Packing the parachutes" });
    P.check("world", "parachutes packed", () => facts.chuteFail ? "parachutes would not build: " + facts.chuteFail : { ok: true, detail: (facts.chutes || []).join(", ") || "skipped" });
  });

  // the old jump: Space at the edge facing out is a jump off (the step is what carries him over)
  const _present = window.present;
  window.present = function () {
    try { const now = performance.now() / 1000, dt = Math.min(0.1, now - (SK.lastNow || now)); SK.lastNow = now; roofTick(dt); } catch (e) { console.warn("[skydive]", e); }
    return _present.apply(this, arguments);
  };

  SK.telemetry = () => SK.sd ? SK.sd.state() : null;
  SK.wind = wind;
  console.log("[Konto] skydive engine: Shigoto " + SHIGOTO.VERSION);
})();
