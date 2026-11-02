// The game's side of the Shigoto ragdoll (SHIGOTO.RagdollSystem; Engine/src/ragdoll).
//
// PEOPLE HIT BY CARS go limp the instant they are struck: the bumper takes their legs, the body wraps over the
// bonnet and is thrown, tumbles and slides to a stop on the road. If they lived, they get up (from face down onto
// all fours, from face up by sitting up, then through a crouch) and run. If they did not, they stay where they fell.
// People shot dead fall the same way, pushed by the shot.
//
// SEIKO comes off his bike when he crashes it: over the bars, off the back when he loops out a wheelie, low-siding
// when the back end lets go, into whatever he hit. The bike goes on sliding on its side. A hard enough crash in a
// car (about 80 km/h into something solid) puts him through the windscreen. Hit by traffic on foot, he is thrown.
// Hard landings hurt him; then he gets up on his own and the camera follows him the whole way.
//
// API (window.ragdoll), also used by the bike engine (Web/game/bike-hook.js):
//   ragdoll.launchSeiko({ pos, vel, spin, yaw, cause })  throw Seiko off whatever he is on. pos: where his hips are,
//       vel: m/s, spin: rad/s (world axes), yaw: which way he was facing, cause: "loopout" | "highside" | "lowside" |
//       "impact" | "landing" | "windscreen" | "struck". Takes him off the vehicle itself. Returns false if he is already down.
//   ragdoll.hitNpc(npc, { vel, from })  a vehicle at vel (m/s) hits a person (a peds.list entry). Knocks them down or kills
//       them (pedHurt), and ragdolls them. Returns "down", "dead" or null. Reporting the crime is the caller's business.
//   ragdoll.seikoActive()  true while Seiko is down or getting up;  ragdoll.onSeikoUp(fn)  called when he is back on his feet.
//   ragdoll.test(), ragdoll.testNpc()  from the console;  ragdoll.sys  the engine object;  ragdoll.report()
// Off switches: ?ragdoll=0 (everything), ?seatbelt=1 (never through the windscreen).

(function () {
  if (!window.SHIGOTO || !SHIGOTO.RagdollSystem) { console.warn("[Konto] ragdoll engine not in this build"); return; }
  if (/[?&]ragdoll=0\b/.test(location.search)) { console.log("[Konto] ragdoll turned off"); return; }
  const seatbelt = /[?&]seatbelt=1\b/.test(location.search);
  const V3 = THREE.Vector3;
  const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);

  const sys = new SHIGOTO.RagdollSystem({
    THREE: THREE,
    ground: (x, z, refY) => {
      try { return world.walkY ? world.walkY(x, z, refY) : world.surfaceY(x, z); } catch (e) { return 0; }
    },
    blocked: (x, z, r, y) => { try { return insideBuilding(x, z, r, y); } catch (e) { return false; } },
    // tarmac and paving grip clothes harder than grass and dirt do
    friction: (x, z) => { try { const u = world.sampleUrban ? world.sampleUrban(x, z) : 0; return (u > 0.04 || world.bridgeY(x, z) !== null) ? 0.7 : 0.52; } catch (e) { return 0.65; } },
    maxActive: 10
  });
  const S = { sys: sys, seiko: null, upFns: [], loose: [], pendingVel: null, peds: new Map() };
  window.ragdoll = S;

  // ---- Seiko ----------------------------------------------------------------------------------------------------------------------------
  const vecOf = (o, d) => o ? new V3(o.x || 0, o.y || 0, o.z || 0) : (d || new V3());

  // the bike he was on slides away on its side and stops
  function looseBike(c, kind) {
    const rec = drive.parked[drive.parked.length - 1]; if (!rec) return;
    const v = c.speed || 0, side = (c.fallDir || (c.roll >= 0 ? 1 : -1)) || 1;
    rec.slide = c.roll || 0; rec.pitch = 0;
    S.loose.push({ rec: rec, vx: Math.sin(c.yaw) * v * 0.85, vz: Math.cos(c.yaw) * v * 0.85, vy: c.air ? (c.vy || 0) : 0, roll: side * 1.38, t: 0, kind: kind });
  }
  function updateLoose(dt) {
    for (let i = S.loose.length - 1; i >= 0; i--) {
      const L = S.loose[i], r = L.rec; L.t += dt;
      if (drive.parked.indexOf(r) < 0 || L.t > 8) { S.loose.splice(i, 1); continue; }
      const nx = r.pos.x + L.vx * dt, nz = r.pos.z + L.vz * dt;
      if (insideBuilding(nx, nz, 0.4, r.pos.y)) { L.vx *= -0.2; L.vz *= -0.2; } else { r.pos.x = nx; r.pos.z = nz; }
      const gy = world.walkY(r.pos.x, r.pos.z, r.pos.y + 0.6);
      L.vy -= 9.81 * dt; r.pos.y += L.vy * dt;
      if (r.pos.y <= gy) {
        r.pos.y = gy; L.vy = 0;
        // metal and plastic on tarmac: about 0.45 g
        const sp = Math.hypot(L.vx, L.vz), ns = Math.max(0, sp - 0.45 * 9.81 * dt);
        if (sp > 1e-4) { L.vx *= ns / sp; L.vz *= ns / sp; }
      }
      r.slide = (r.slide || 0) + (L.roll - (r.slide || 0)) * (1 - Math.pow(0.003, dt));
      if (L.t > 1 && Math.hypot(L.vx, L.vz) < 0.05 && Math.abs(r.slide - L.roll) < 0.02) { r.slide = L.roll; S.loose.splice(i, 1); }
    }
  }

  // where his hips are in the pose he is in now, so he can be put on the seat
  function hipsOf(root) {
    root.updateMatrixWorld(true);
    const B = SHIGOTO.findRagdollBones(root);
    return B ? B.pelvis.getWorldPosition(new V3()) : null;
  }

  // Crashes are found in the middle of the driving code, which goes on using the car for the rest of the frame,
  // so getting off it waits for the end of the frame (a few milliseconds).
  function launchSeiko(o) {
    o = o || {};
    if (S.seiko || S.queued || !player.obj) return false;
    if (!SHIGOTO.findRagdollBones(player.obj)) return false;
    if (drive.car || drive.train) { S.queued = o; return true; }
    return launchNow(o);
  }
  function launchNow(o) {
    if (S.seiko || !player.obj) return false;
    const c = drive.car;
    if (c) {
      const kind = CAR_KINDS[c.kind], two = TWO_WHEELERS[kind.body];
      const snap = { speed: c.speed, yaw: c.yaw, roll: c.roll, fallDir: c.fallDir, air: c.air, vy: c.vy };
      leaveCar();
      if (two) looseBike(snap, kind);
    } else if (drive.train) return false;
    if (typeof interior !== "undefined" && interior.sit) interior.sit = null;
    player.mode = "walk";
    const yawv = o.yaw !== undefined ? o.yaw : player.yaw;
    player.obj.visible = true;
    if (o.pos) {
      // off a seat: sat, at the seat
      player.yaw = player.targetYaw = yawv;
      player.obj.rotation.set(0, yawv, 0);
      if (player.clips && player.clips.sit && player.mixer) { player.forceClip = null; playSeikoClip("sit", 0); player.mixer.update(1 / 60); }
      player.obj.position.set(o.pos.x, o.pos.y - 0.9, o.pos.z);
      const hp = hipsOf(player.obj);
      if (hp) player.obj.position.add(new V3(o.pos.x - hp.x, o.pos.y - hp.y, o.pos.z - hp.z));
      player.pos.set(o.pos.x, world.walkY(o.pos.x, o.pos.z, o.pos.y), o.pos.z);
    }
    player.obj.updateMatrixWorld(true);
    const rd = sys.spawn(player.obj, {
      velocity: o.vel, spin: o.spin, strike: o.strike,
      facing: { x: Math.sin(yawv), z: Math.cos(yawv) },
      onHit: (r, speed, part) => {
        const k = part === "head" ? 1.6 : part === "chest" || part === "pelvis" ? 1 : 0.3;
        const dmg = Math.min(0.12, (speed - 5) * 0.011 * k);
        S.seiko.hurt = (S.seiko.hurt || 0) + dmg;
        if (S.seiko.hurt < 0.55) vitals.health = clampN(vitals.health - dmg, 0.02, 1);
        if (speed > 7) { drive.shake = Math.max(drive.shake || 0, clampN(speed / 16, 0.2, 0.8)); if (typeof rumble === "function") rumble(0.7, 0.4, 120); }
      },
      onUp: (r, up) => {
        player.pos.set(up.x, up.y, up.z);
        player.yaw = player.targetYaw = up.yaw;
        player.obj.position.copy(player.pos); player.obj.rotation.set(0, up.yaw, 0);
        player.down = 0; player.knock.set(0, 0, 0); player.speed = 0; player.forceClip = null;
        playSeikoClip("idle", 0);
        S.seiko = null;
        S.upFns.slice().forEach(fn => { try { fn(); } catch (e) { console.warn("[ragdoll] onSeikoUp", e); } });
      }
    });
    if (!rd) return false;
    S.seiko = { rd: rd, cause: o.cause || "thrown", hurt: 0 };
    player.down = 999; player.speed = 0; player.jump = 0;
    vitals.stress = clampN(vitals.stress + 0.08, 0, 1);
    if (typeof adrenalineRush === "function") try { adrenalineRush(10); } catch (e) { /* none */ }
    return true;
  }
  S.launchSeiko = launchSeiko;
  S.seikoActive = () => !!(S.seiko || S.queued);
  S.onSeikoUp = fn => { if (typeof fn === "function") S.upFns.push(fn); };

  // the camera stays on him while he is down; his position follows his body so the world streams round him
  const _p = new V3();
  const origKnockdown = window.updateKnockdown;
  window.updateKnockdown = function (dt) {
    if (!S.seiko) return origKnockdown(dt);
    player.down = 999;
    sys.pelvis(S.seiko.rd, _p);
    player.pos.set(_p.x, world.walkY(_p.x, _p.z, _p.y + 0.4), _p.z);
    const head = _p.clone(); head.y += 0.35;
    const dir = new V3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const want = head.clone().sub(dir.multiplyScalar(5.4));
    want.y = Math.max(want.y, world.surfaceY(clampN(want.x, 0, WORLD_X), clampN(want.z, 0, WORLD_Z)) + 1.4);
    camPos.lerp(want, 1 - Math.pow(0.004, dt));
    camera.position.copy(camPos);
    camera.lookAt(head);
  };

  // hit by traffic on foot: the game decides he was hit, the ragdoll does the rest
  const origSafety = window.updatePedestrianSafety;
  window.updatePedestrianSafety = function (dt) {
    const before = player.down;
    origSafety(dt);
    if (before <= 0 && player.down > 0 && !S.seiko && player.knock.lengthSq() > 0.01) {
      const k = player.knock, v = k.length() / 0.42, d = k.clone().normalize();
      launchSeiko({ strike: { x: d.x * v, y: 0, z: d.z * v }, cause: "struck" });
    }
  };

  // ---- off the bike ---------------------------------------------------------------------------------------------------------------------
  function throwFromBike(c, cause, extra) {
    if (S.seiko || c !== drive.car) return false;
    const kind = CAR_KINDS[c.kind];
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), v = Math.abs(c.speed || 0) + (extra || 0);
    const side = (c.fallDir || (c.roll >= 0 ? 1 : -1)) || 1, lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw);
    const fwdSpin = k => ({ x: fz * k, y: 0, z: -fx * k });         // pitching forwards, head first
    let vel, spin;
    if (cause === "loopout") { vel = { x: fx * v * 0.7, y: 1.4, z: fz * v * 0.7 }; spin = fwdSpin(-(2.2 + v * 0.1)); }
    else if (cause === "highside") { vel = { x: fx * v * 0.95, y: 1.6 + v * 0.12, z: fz * v * 0.95 }; spin = fwdSpin(3 + v * 0.15); }
    else if (cause === "lowside") { vel = { x: fx * v * 0.9 + lx * side * 1.4, y: 0.4, z: fz * v * 0.9 + lz * side * 1.4 }; spin = { x: fx * side * 2.6, y: 0.6, z: fz * side * 2.6 }; }
    else if (cause === "impact") { vel = { x: fx * v * 0.85, y: 0.9 + v * 0.11, z: fz * v * 0.85 }; spin = fwdSpin(3.5 + v * 0.1); }
    else { vel = { x: fx * v * 0.95, y: 0.8, z: fz * v * 0.95 }; spin = fwdSpin(2.5); }
    if (c.air && c.vy) vel.y += c.vy;
    const seat = kind.body === "mtb" || kind.body === "scooter" ? 0.88 : kind.body === "dirtbike" ? 1.02 : 0.95;
    return launchSeiko({ pos: { x: c.pos.x - fx * 0.15, y: c.pos.y + seat, z: c.pos.z - fz * 0.15 }, vel: vel, spin: spin, yaw: c.yaw, cause: cause });
  }
  S.throwFromBike = throwFromBike;
  const CAUSE = { "Looped out.": "loopout", "Over the bars.": "highside", "The back end let go.": "lowside", "Straight into it.": "impact", "Cased it.": "landing", "Bad landing.": "landing" };
  const origBikeCrash = window.bikeCrash;
  if (typeof origBikeCrash === "function") window.bikeCrash = function (c, why) {
    const was = c && c.downT > 0;
    origBikeCrash(c, why);
    if (was || S.seiko || !c || c !== drive.car) return;
    const cause = CAUSE[why] || "impact";
    // a slow topple is a foot put down, not a crash
    if (Math.abs(c.speed || 0) < 2.2 && cause !== "loopout") return;
    throwFromBike(c, cause);
  };

  // ---- through the windscreen, or off the bike into a car -------------------------------------------------------------------------------
  const origCarDamage = window.carDamage;
  if (typeof origCarDamage === "function") window.carDamage = function (c, nx, nz, impact) {
    const r = origCarDamage.apply(this, arguments);
    try {
      if (c && c === drive.car && !S.seiko) {
        const kind = CAR_KINDS[c.kind];
        if (TWO_WHEELERS[kind.body]) { if (impact > 5.5) throwFromBike(c, "impact", impact); }
        else if (!seatbelt && impact > 22) {
          const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), v = impact * 0.9;
          const at = { x: c.pos.x + fx * kind.L * 0.32, y: c.pos.y + Math.min(1.25, kind.H * 0.82), z: c.pos.z + fz * kind.L * 0.32 };
          if (launchSeiko({ pos: at, vel: { x: fx * v, y: 2 + impact * 0.08, z: fz * v }, spin: { x: fz * 3.2, y: 0, z: -fx * 3.2 }, yaw: c.yaw, cause: "windscreen" })) {
            vitals.health = clampN(vitals.health - 0.12, 0.02, 1);
            if (typeof say === "function") say("Through the windscreen.", 3);
          }
        }
      }
    } catch (e) { console.warn("[ragdoll] carDamage", e); }
    return r;
  };
  // getting back on a bike that was lying down stands it up
  const origEnterParked = window.enterParked;
  if (typeof origEnterParked === "function") window.enterParked = function (i) {
    if (S.seiko) return;
    const p = drive.parked[i]; if (p) { delete p.slide; delete p.pitch; S.loose = S.loose.filter(L => L.rec !== p); }
    return origEnterParked.apply(this, arguments);
  };
  const origEnterCar = window.enterCar;
  if (typeof origEnterCar === "function") window.enterCar = function () { if (S.seiko) return; return origEnterCar.apply(this, arguments); };

  // ---- people on the street -------------------------------------------------------------------------------------------------------------
  function strikeFor(p) {
    if (S.pendingVel) return S.pendingVel;
    const car = drive.car;
    if (car && Math.hypot(p.x - car.pos.x, p.z - car.pos.z) < 5) {
      if (car.vel && car.vel.isVector2) return { x: car.vel.x, y: 0, z: car.vel.y };
      return { x: Math.sin(car.yaw) * car.speed, y: 0, z: Math.cos(car.yaw) * car.speed };
    }
    let best = null;
    try { carsNear(p.x, p.z, 6, c => { if (!best && inCarBox(c, p.x, p.z, 0.8)) best = c; }); } catch (e) { /* none */ }
    if (best) return { x: Math.sin(best.yawNow || 0) * best.v, y: 0, z: Math.cos(best.yawNow || 0) * best.v };
    return { x: 0, y: 0, z: 0 };
  }
  function ragdollPed(p, opts) {
    if (!p.holder || !p.mixer) return null;
    p.holder.rotation.set(0, p.yaw, 0); p.holder.position.set(p.x, p.y, p.z);
    p.holder.updateMatrixWorld(true);
    const rd = sys.spawn(p.holder, Object.assign({
      facing: { x: Math.sin(p.yaw), z: Math.cos(p.yaw) },
      onUp: (r, up) => {
        p.x = up.x; p.y = up.y; p.z = up.z; p.yaw = up.yaw;
        p.holder.position.set(up.x, up.y, up.z); p.holder.rotation.set(0, up.yaw, 0);
        S.peds.delete(p);
        if (p.state === "down") p.t = 3.01;                          // the game's own "down" ends: they run
      }
    }, opts));
    if (rd) S.peds.set(p, rd);
    return rd;
  }
  const origPedHurt = window.pedHurt;
  window.pedHurt = function (p, dmg, kind) {
    const was = p && p.state;
    const r = origPedHurt.apply(this, arguments);
    try {
      if ((r === "down" || r === "dead") && was !== "down" && was !== "dead") {
        let opts;
        if (kind === "car") opts = { strike: strikeFor(p), dead: r === "dead" };
        else {
          // shot: pushed away from the gun, at the chest
          const dx = p.x - player.pos.x, dz = p.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
          opts = { push: { x: dx / d * 2.4, y: 0.2, z: dz / d * 2.4, at: "chest" }, velocity: { x: dx / d * 0.5, y: 0, z: dz / d * 0.5 }, dead: r === "dead" };
        }
        if (!ragdollPed(p, opts)) return r;
      } else if (r === "dead" && was === "down") {
        const rd = S.peds.get(p);
        if (rd) { sys.kill(rd); p.holder.rotation.x = 0; p.holder.position.y = p.y; }
      }
    } catch (e) { console.warn("[ragdoll] pedHurt", e); }
    return r;
  };
  S.hitNpc = function (p, o) {
    if (!p || p.state === "down" || p.state === "dead") return null;
    o = o || {};
    const v = vecOf(o.vel), sp = Math.hypot(v.x, v.z);
    S.pendingVel = { x: v.x, y: v.y, z: v.z };
    let r = null;
    try { r = window.pedHurt(p, sp > 13 ? 200 : 60, "car"); } finally { S.pendingVel = null; }
    return r || null;
  };

  // ---- each frame: after the animation has run, before the picture is drawn ---------------------------------------------------------------
  let last = performance.now();
  function step(dt) {
    if (S.queued) { const o = S.queued; S.queued = null; try { launchNow(o); } catch (e) { console.warn("[ragdoll] launch", e); } }
    if (S.seiko) {
      // something else took him (a cutscene, a new body, a car): let go
      if (S.seiko.rd.state === "done" || drive.car || drive.train || S.seiko.rd.root !== player.obj) {
        if (S.seiko.rd.state !== "done") sys.release(S.seiko.rd);
        S.seiko = null; player.down = 0;
      }
    }
    S.peds.forEach((rd, p) => {
      if (rd.state === "done") { S.peds.delete(p); return; }
      if (rd.state === "fall" || rd.state === "still" || rd.state === "getup") {
        if (p.state === "down") p.t = 0;                             // they are down until the body says they are up
        sys.pelvis(rd, _p); p.x = _p.x; p.z = _p.z;
      }
    });
    updateLoose(dt);
    sys.update(dt);
  }
  const origPresent = window.present;
  window.present = function () {
    const now = performance.now(); let dt = Math.min(0.1, (now - last) / 1000); last = now;
    if ((typeof paused !== "undefined" && paused) || (typeof nav !== "undefined" && nav.mapOpen) || (typeof title !== "undefined" && title.on)) dt = 0;
    try { step(dt); } catch (e) { console.warn("[ragdoll]", e); }
    return origPresent.apply(this, arguments);
  };

  // ---- the console ----------------------------------------------------------------------------------------------------------------------
  S.test = function (speed) {
    const v = speed || 9, y = player.yaw;
    if (drive.car) return throwFromBike(drive.car, "highside") || launchSeiko({ pos: { x: drive.car.pos.x, y: drive.car.pos.y + 1, z: drive.car.pos.z }, vel: { x: Math.sin(y) * v, y: 3, z: Math.cos(y) * v }, yaw: drive.car.yaw });
    return launchSeiko({ vel: { x: Math.sin(y) * v, y: 3.5, z: Math.cos(y) * v }, spin: { x: Math.cos(y) * 3, y: 0, z: -Math.sin(y) * 3 }, cause: "test" });
  };
  S.testNpc = function (speed) {
    let best = null, bd = 60;
    peds.list.forEach(p => { if (p.state === "dead" || p.state === "down") return; const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); if (d < bd) { bd = d; best = p; } });
    if (!best) return null;
    const dx = best.x - player.pos.x, dz = best.z - player.pos.z, d = Math.hypot(dx, dz) || 1, v = speed || 11;
    return S.hitNpc(best, { vel: { x: dx / d * v, y: 0, z: dz / d * v }, from: "test" });
  };
  S.report = () => Object.assign(sys.report(), { seiko: S.seiko ? S.seiko.rd.state : null, loose: S.loose.length });
  console.log("[Konto] ragdoll ready");
})();
