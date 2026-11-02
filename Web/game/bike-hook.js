// The game's side of the Shigoto motorcycle dynamics (SHIGOTO.Motorcycle; Engine/src/vehicles/Motorcycle.js).
//
// Every two-wheeler Seiko rides (the supersport, the scooter, the Hadson cruiser and tourer, the trail bike and the mountain bike) runs on
// the engine's model: sprung wheels on the real ground, magic-formula tyres, an engine with a clutch and gearbox, and a rider who leans and
// shifts his weight. konto.html's own updateBike() is replaced; everything around it (input, strain, collisions with traffic, the camera,
// the pad's rumble) is the game's as before.
//
//   W / RT          throttle            S / LT     front brake (the cruiser, tourer and scooter link some rear in)
//   Space / B       rear brake          A D / stick  lean (the bike counter-steers itself to get there)
//   Shift / stick back   weight back: with the throttle it brings the front up, and turns off wheelie control for as long as you hold it
//   stick forward        weight forward
//   Shift + a stab of throttle from low speed is a clutch pop
//   In the air: weight back/forward pitches the bike, throttle lifts the nose (the rear wheel is a gyroscope), the rear brake drops it.
//
// Crashes (looping a wheelie, over the bars, lowside, highside, casing a jump, a bad landing, hitting a wall or a person at speed) throw
// Seiko off into the ragdoll (window.ragdoll.launchSeiko, from game/ragdoll-hook.js). Without it, the old fall is played.
//
// People: the game's own pedestrian code knocks them down (into the ragdoll); above 9 m/s the rider goes over the bars too.
//
// Big jumps: buildBigJumps() finds open, level runs of ground away from the roads around the island and builds a kicker, a gap and a
// landing at each, with trail bikes parked at the top. They are deliberately not on the map. Dial 5550777 (or type BIGAIR) to be put at the
// next one. Console: bikes.jumps() lists them, bikes.telemetry() shows the ridden bike's state.
//
// Off switch: ?bikephys=0 (the game's own bike model comes back).

(function () {
  if (!window.SHIGOTO || !SHIGOTO.Motorcycle) { console.warn("[Konto] bike dynamics not in this engine build"); return; }
  if (/[?&]bikephys=0\b/.test(location.search)) { console.log("[Konto] bike dynamics turned off"); return; }

  const SPEC_OF = { bike: "sport", scooter: "scooter", cruiser: "cruiser", tourer: "tourer", dirtbike: "dirt", mtb: "mtb" };
  const LINKED = { cruiser: 0.35, tourer: 0.3, scooter: 0.45 };
  const B = window.bikes = { _dbg: /dbgjump/.test(location.search) ? [] : null, jumps: () => jumps.list.map(j => j.where), telemetry: () => { const c = drive.car; return c && c._moto ? c._moto.telemetry() : null; } };

  // ---- the world the bike rides on ------------------------------------------------------------------------------------------------------
  const W = {
    ground: (x, z, refY) => world.walkY(x, z, refY),
    grip: (x, z) => {
      const deck = world.walkOn ? lastDeck(x, z) : null;
      const urban = world.sampleUrban ? world.sampleUrban(x, z) : 0;
      const paved = !(deck && deck.dirt) && (urban > 0.04 || world.bridgeY(x, z) !== null || (deck && !deck.park));
      const wet = wetness();
      return { dirt: !paved, mu: paved ? 1 - 0.32 * wet : (deck ? 1 - 0.12 * wet : 0.92 - 0.22 * wet) };
    }
  };
  function lastDeck(x, z) {
    // which walkable deck is under this point (the bike parks and the big jumps are dirt; car park ramps and platforms are paved)
    const L = world.walk;
    for (let i = 0; i < L.length; i++) {
      const d = L[i];
      if (Math.abs(x - d.cx) > d.r || Math.abs(z - d.cz) > d.r) continue;
      const dx = x - d.cx, dz = z - d.cz, lx = dx * d.c - dz * d.s, lz = dx * d.s + dz * d.c;
      if (Math.abs(lx) <= d.hw && Math.abs(lz) <= d.hl) return d;
    }
    return null;
  }
  function wetness() { try { return (window.shigoto && shigoto.engine && shigoto.engine.weather && shigoto.engine.weather.wetness) || 0; } catch (e) { return 0; } }

  function motoFor(c, kind) {
    let M = c._moto;
    if (M && M._kind === c.kind) return M;
    const perf = perfOf(kind, { top: 30, to100: 6 });
    M = new SHIGOTO.Motorcycle(SPEC_OF[kind.body] || "sport", { top: perf.top, to100: perf.to100 });
    M._kind = c.kind;
    Object.defineProperty(c, "_moto", { value: M, writable: true, configurable: true, enumerable: false });
    placeMoto(c, kind, M, c.speed || 0);
    return M;
  }
  // put the model where the drawn bike is: c.pos is the middle of the bike on the ground, and the drawing pivots about the rear axle,
  // kind.L * 0.34 behind it
  function placeMoto(c, kind, M, speed) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), back = kind.L * 0.34;
    const rx = c.pos.x - fx * back, rz = c.pos.z - fz * back, b = M.spec.b;
    const gx = rx + fx * b, gz = rz + fz * b;
    M.reset({ x: gx, z: gz, y: world.walkY(gx, gz, c.pos.y + 0.6), yaw: c.yaw, speed: speed });
    // settle it on its springs
    for (let i = 0; i < 20; i++) M.step(1 / 60, { throttle: 0, front: speed > 0.5 ? 0 : 0.3 }, W);
    M.crashed = null;
    c._out = { x: c.pos.x, z: c.pos.z, speed: speed };
  }

  // ---- crashes --------------------------------------------------------------------------------------------------------------------------
  const WHY = { loopout: "Looped it.", overbars: "Over the bars.", nosed: "Nosed in.", looped: "Landed on the back wheel and went over.", lowside: "Lowside: the front tucked.",
    highside: "Highsided.", cased: "Cased it.", landing: "Bad landing.", fell: "Down.", impact: "Straight into it.", person: "Ran into someone and went over the bars." };
  function crash(c, kind, M, cause) {
    if (c.downT > 0) return;
    const v = Math.max(Math.abs(M.u), Math.hypot(M.u, M.w));
    playCrash(Math.max(3, v * 0.8));
    drive.shake = Math.max(drive.shake || 0, clamp(v / 14, 0.3, 1));
    vitals.health = clamp01(vitals.health - clamp(0.04 + v * 0.0045, 0.05, 0.28));
    vitals.stress = clamp01(vitals.stress + 0.1);
    say(WHY[cause] || "Off.", 3);
    const fx = Math.sin(M.yaw), fz = Math.cos(M.yaw), rx = -fz, rz = fx, sl = Math.sign(M.lean) || 1;
    // where he is going when he comes off, and how he is turning
    const vel = { x: fx * M.u + rx * M.vl, y: M.w, z: fz * M.u + rz * M.vl };
    let spin = { x: 0, y: 0, z: 0 };
    const add = (ax, k) => { spin.x += ax[0] * k; spin.y += ax[1] * k; spin.z += ax[2] * k; };
    const R = [rx, 0, rz], F = [fx, 0, fz];
    if (cause === "loopout" || cause === "looped") { add(R, 3.5 + M.q); vel.y += 1.2; vel.x -= fx * 1.5; vel.z -= fz * 1.5; }
    else if (cause === "overbars" || cause === "nosed" || cause === "impact" || cause === "person" || cause === "cased") { add(R, -(4 + v * 0.15)); vel.y += 1.5 + v * 0.08; }
    else if (cause === "highside") { add(F, -sl * 6); vel.y += 4.5; vel.x -= rx * sl * 3; vel.z -= rz * sl * 3; }
    else if (cause === "lowside" || cause === "fell") { add(F, sl * 2.5); vel.y += 0.3; }
    else { add(R, -3); vel.y += 1; }
    const hip = { x: M.x, y: M.y + 0.25, z: M.z };
    let thrown = false;
    if (window.ragdoll && typeof ragdoll.launchSeiko === "function") {
      try {
        // the bike is left where it fell
        writeBack(c, kind, M, {});
        thrown = !!ragdoll.launchSeiko({ pos: hip, vel: vel, spin: spin, yaw: M.yaw, cause: cause });
      } catch (e) { console.warn("[Konto] ragdoll launch", e); }
    }
    if (!thrown) { c.downT = 1.7; c.fallDir = sl; c._downSpeed = M.u; }
  }

  // ---- the ride -------------------------------------------------------------------------------------------------------------------------
  function updateBikeShigoto(dt, c, kind, inp) {
    const M = motoFor(c, kind);
    const fx0 = Math.sin(M.yaw), fz0 = Math.cos(M.yaw);
    // the game moved the bike since last frame (a collision with traffic, a teleport, a cutscene): follow it, and a hard knock is a crash
    if (c._out) {
      const moved = Math.hypot(c.pos.x - c._out.x, c.pos.z - c._out.z);
      if (moved > 6 || Math.abs(c.yaw - M.yaw) > 0.5) { placeMoto(c, kind, M, c.speed || 0); }
      else if (moved > 0.001) { M.x += c.pos.x - c._out.x; M.z += c.pos.z - c._out.z; }
      const dv = (c.speed || 0) - c._out.speed;
      if (Math.abs(dv) > 0.01 && c.downT <= 0) {
        if (Math.abs(dv) > 5.5 && Math.abs(c._out.speed) > 6) { crash(c, kind, M, "impact"); if (drive.car !== c) return; }
        M.u = c.speed; M.wheel[0] = M.u / M.spec.rr; M.wheel[1] = M.u / M.spec.rf;
      }
    }
    // ---- down (no ragdoll): the old fall, then back on the bike
    if (c.downT > 0) {
      c.downT -= dt;
      c._downSpeed = (c._downSpeed || 0) * Math.pow(0.12, dt);
      c.roll = lerp(c.roll || 0, (c.fallDir || 1) * 1.38, 1 - Math.pow(0.002, dt));
      c.pitch = lerp(c.pitch || 0, 0, 1 - Math.pow(0.01, dt));
      c.pos.x += Math.sin(c.yaw) * c._downSpeed * dt; c.pos.z += Math.cos(c.yaw) * c._downSpeed * dt;
      c.pos.y = world.walkY(c.pos.x, c.pos.z, c.pos.y + 0.6) + 0.04;
      c.speed = c._downSpeed; c.slide = c.roll; c.wheelie = false; c.air = false;
      if (c.downT <= 0) { c.roll = 0; c.pitch = 0; c.speed = 0; placeMoto(c, kind, M, 0); }
      else c._out = { x: c.pos.x, z: c.pos.z, speed: c.speed };
      return;
    }
    // ---- walking it backwards
    if (inp.brake > 0.3 && inp.throttle === 0 && Math.abs(M.u) < 0.6 && !M.air) {
      M.u = Math.max(-1.4, Math.min(0, M.u) - 1.6 * dt);
      M.wheel[0] = M.u / M.spec.rr; M.wheel[1] = M.u / M.spec.rf;
      M.x += fx0 * M.u * dt; M.z += fz0 * M.u * dt;
      M.yaw -= inp.steer * M.u * Math.tan(0.5) / M.spec.wb * dt * -1;
      M.lean *= Math.pow(0.05, dt); M.leanRate = 0;
      if (blockedAt(c, kind, M)) { M.x -= fx0 * M.u * dt; M.z -= fz0 * M.u * dt; M.u = 0; }
      writeBack(c, kind, M, inp);
      return;
    }
    if (M.u < 0 && inp.throttle > 0) M.u = 0;
    // ---- the rider's controls
    const rearIn = (inp.hand ? 1 : 0) + inp.brake * (LINKED[kind.body] || 0);
    const pop = inp.throttle > 0.8 && (c._thrPrev || 0) < 0.3 && inp.leanIn < -0.5;
    c._thrPrev = inp.throttle;
    const input = { throttle: inp.throttle, front: inp.brake, rear: Math.min(1, rearIn), steer: inp.steer, weight: inp.leanIn, clutchPop: pop };
    const px = M.x, pz = M.z, pu = M.u;
    const wasWheelie = M.wheelie, wasStoppie = M.stoppie;
    const ev = M.step(dt, input, W);
    // ---- walls, trees, water and the edge of the map
    if (blockedAt(c, kind, M)) {
      M.x = px; M.z = pz;
      if (Math.abs(pu) > 6 && !(c.crashCool > 0)) { M.u = 0; crash(c, kind, M, "impact"); c.crashCool = 1; if (drive.car !== c) return; }
      else { if (Math.abs(pu) > 2.5 && !(c.crashCool > 0)) { playCrash(Math.abs(pu)); c.crashCool = 0.8; } M.u = -pu * 0.2; M.vl = 0; M.wheel[0] = M.u / M.spec.rr; M.wheel[1] = M.u / M.spec.rf; }
    }
    if (c.crashCool > 0) c.crashCool -= dt;
    // ---- people: running into someone at speed puts them down and you over the bars
    if (Math.abs(M.u) > 3.5 && typeof peds !== "undefined" && peds.list) {
      const fx = Math.sin(M.yaw), fz = Math.cos(M.yaw);
      for (const p of peds.list) {
        // the game's own pedestrian code knocks them down (and the ragdoll takes them); this only decides what happens to the rider, so a
        // person who went down this very moment still counts
        if (!p || p.state === "dead" || (p.state === "down" && (p.t || 0) > 0.2) || Math.abs(p.x - M.x) > 4 || Math.abs(p.z - M.z) > 4 || Math.abs((p.y || 0) - c.pos.y) > 2) continue;
        const dx = p.x - c.pos.x, dz = p.z - c.pos.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
        if (along < -0.4 || along > kind.L * 0.5 + 0.5 || side > 0.55) continue;
        const now = performance.now();
        if (p._bikeHit && now - p._bikeHit < 2000) continue;
        p._bikeHit = now;
        if (Math.abs(M.u) > 9) { crash(c, kind, M, "person"); if (drive.car !== c) return; }
        else M.u *= 0.6;
        break;
      }
    }
    // ---- what happened
    for (const e of ev) {
      if (e.type === "crash") { crash(c, kind, M, e.cause); if (drive.car !== c) return; break; }
      if (e.type === "land") {
        const hard = Math.max(0, e.impact);
        drive.shake = Math.max(drive.shake || 0, clamp(hard / 9, 0.1, 0.9));
        if (hard > 3) playCrash(2 + hard * 0.4);
        if (e.air > 0.9) say("Big air  " + e.air.toFixed(1) + " s", 1.8);
      }
    }
    // wheelies and stoppies are measured
    if (M.wheelie) { c._wheelieM = (c._wheelieM || 0) + Math.abs(M.u) * dt; }
    else if (wasWheelie && c._wheelieM > 25) { say("Wheelie  " + Math.round(c._wheelieM) + " m", 1.8); c._wheelieM = 0; }
    else if (!M.wheelie) c._wheelieM = 0;
    if (M.stoppie) { c._stoppieM = (c._stoppieM || 0) + Math.abs(M.u) * dt; }
    else if (wasStoppie && c._stoppieM > 6) { say("Stoppie  " + Math.round(c._stoppieM) + " m", 1.6); c._stoppieM = 0; }
    else if (!M.stoppie) c._stoppieM = 0;
    writeBack(c, kind, M, inp);
  }

  function blockedAt(c, kind, M) {
    const fx = Math.sin(M.yaw), fz = Math.cos(M.yaw), back = kind.L * 0.34;
    const p = M.pose(), nx = p.rearX + fx * back, nz = p.rearZ + fz * back;
    const sg = Math.sign(M.u || 1), hx = nx + fx * kind.L * 0.4 * sg, hz = nz + fz * kind.L * 0.4 * sg;
    const onDeck = world.bridgeY(nx, nz) !== null || world.walkOn;
    return nx < 50 || nz < 50 || nx > WORLD_X - 50 || nz > WORLD_Z - 50
      || (!onDeck && !M.air && world.sampleHeight(nx, nz) < 0.4)
      || insideBuilding(nx, nz, kind.W * 0.45)
      || treeBlocks(nx, nz, kind.W * 0.42, c.pos.x, c.pos.z)
      || treeBlocks(hx, hz, kind.W * 0.38, c.pos.x + fx * kind.L * 0.4 * sg, c.pos.z + fz * kind.L * 0.4 * sg);
  }

  // the model's state into the fields the rest of the game reads (drawing, camera, rumble, collisions, the HUD)
  function writeBack(c, kind, M, inp) {
    const p = M.pose(), fx = Math.sin(M.yaw), fz = Math.cos(M.yaw), back = kind.L * 0.34;
    c.pos.x = p.rearX + fx * back; c.pos.z = p.rearZ + fz * back;
    c.pos.y = p.rearY + 0.04;
    c.yaw = M.yaw; c.speed = M.u;
    c.pitch = -M.pitch;                       // the drawing pitches about the rear axle, negative is nose up
    c.roll = M.lean; c.slide = M.lean;
    c.lean = inp.leanIn || 0;
    c.theta = M.pitch; c.omega = M.q; c.wheelie = M.wheelie; c.stoppie = M.stoppie;
    c.air = M.air; c.airT = M.airT; c.vy = M.w;
    c.slip = Math.abs(M.alpha[0]) + Math.max(0, Math.abs(M.slip[0]) - 0.2);
    c.steerRate = M.r; c.gear = M.spec.gears ? M.gear + 1 : 0; c.rpm = M.rpm;
    c.gy = c.pos.y - 0.04;
    c._out = { x: c.pos.x, z: c.pos.z, speed: c.speed };
  }

  window.updateBike = updateBikeShigoto;
  // a bike you get on starts from rest on its stand, and from where it was drawn
  const _enter = window.enterCar;
  if (typeof _enter === "function") window.enterCar = function () { const r = _enter.apply(this, arguments); try { if (drive.car && drive.car._moto) drive.car._moto = null; } catch (e) { /* none */ } return r; };

  // ======================================================================================================================================
  // BIG JUMPS
  // A kicker, a gap and a landing, sized for a trail bike at the speed it can carry across the run-in, at the best open ground around the
  // island: level, away from towns and roads, not over water. Built when the bike parks are, as decks the bike physics ask the height of,
  // with a packed-dirt PBR surface. Not on the map.
  // ======================================================================================================================================
  const jumps = B._jumps = { list: [], next: 0 };
  const SIZES = [
    // rise of the lip (m), kicker length, gap (or table) to the landing, half width; table: a tabletop rather than an open gap
    { rise: 3.0, kick: 10, gap: 16, hw: 2.8, table: true, name: "tabletop" },
    { rise: 3.6, kick: 12, gap: 22, hw: 3.0, table: true, name: "big tabletop" },
    { rise: 4.5, kick: 15, gap: 28, hw: 3.4, table: false, name: "big gap" },
    { rise: 3.2, kick: 11, gap: 18, hw: 2.8, table: true, name: "tabletop" },
    { rise: 5.5, kick: 18, gap: 36, hw: 3.8, table: false, name: "the monster" },
    { rise: 3.4, kick: 11, gap: 20, hw: 3.0, table: true, name: "tabletop" },
    { rise: 4.0, kick: 13, gap: 24, hw: 3.2, table: true, name: "big tabletop" }
  ];
  let dirtMat = null;
  function dirtMaterial() {
    if (dirtMat) return dirtMat;
    const L = new THREE.TextureLoader(), ld = (f, srgb) => { const t = L.load("art/terrain/" + f); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.encoding = THREE.sRGBEncoding; return t; };
    dirtMat = new THREE.MeshStandardMaterial({ map: ld("jumpdirt.jpg", true), normalMap: ld("jumpdirt_nor.jpg"), roughnessMap: ld("jumpdirt_rough.jpg"), roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1.2, 1.2) });
    dirtMat.userData.pbrDone = true;
    return dirtMat;
  }

  function roadIndex() {
    const cell = 120, grid = new Map();
    const add = (a, b) => {
      const x0 = Math.floor(Math.min(a[0], b[0]) / cell), x1 = Math.floor(Math.max(a[0], b[0]) / cell), z0 = Math.floor(Math.min(a[2], b[2]) / cell), z1 = Math.floor(Math.max(a[2], b[2]) / cell);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = i * 4096 + j; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push([a[0], a[2], b[0], b[2]]); }
    };
    const path = P => { if (P) for (let i = 1; i < P.length; i++) add(P[i - 1], P[i]); };
    if (world.highway) path(world.highway.pts);
    (world.links || []).forEach(L => path(L.road && L.road.pts));
    (world.cities || []).forEach(ci => (ci.roads || []).forEach(r => path(r.pts)));
    return {
      dist(x, z, lim) {
        let best = lim;
        const i0 = Math.floor((x - lim) / cell), i1 = Math.floor((x + lim) / cell), j0 = Math.floor((z - lim) / cell), j1 = Math.floor((z + lim) / cell);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const l = grid.get(i * 4096 + j); if (!l) continue;
          for (const s of l) {
            const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz;
            const t = l2 > 1e-6 ? clamp(((x - s[0]) * dx + (z - s[1]) * dz) / l2, 0, 1) : 0;
            const d = Math.hypot(s[0] + dx * t - x, s[1] + dz * t - z);
            if (d < best) best = d;
          }
        }
        return best;
      }
    };
  }

  function cityNear(x, z) {
    let best = null, bd = Infinity;
    (world.cities || []).forEach(ci => { if (!ci.centre) return; const d = Math.hypot(ci.centre[0] - x, ci.centre[1] - z); if (d < bd) { bd = d; best = ci; } });
    return best ? { name: (best.site && best.site.name) || best.name || "town", d: bd, dx: x - best.centre[0], dz: z - best.centre[1] } : null;
  }
  function compass(dx, dz) {
    // the map has north at the top: -z is north, +x is east
    const a = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
    return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(a / 45) % 8];
  }

  function findSites(n) {
    const H = (x, z) => world.sampleHeight(x, z);
    const roads = roadIndex();
    const cands = [];
    const step = 170;
    const avoid = (x, z) => {
      for (const q of bikeParks.clear) if (Math.hypot(x - q[0], z - q[1]) < q[2] + 60) return true;
      for (const a of world.airports || []) if (Math.hypot(x - a.cx, z - a.cz) < Math.max(a.len || 0, a.wid || 0) * 0.7 + 250) return true;
      return false;
    };
    for (let x = 300; x < WORLD_X - 300; x += step) for (let z = 300; z < WORLD_Z - 300; z += step) {
      const ox = x + (rnd(x, z, 77) - 0.5) * step * 0.6, oz = z + (rnd(z, x, 78) - 0.5) * step * 0.6;
      const h0 = H(ox, oz);
      if (h0 < 1.4 || h0 > 420) continue;
      if (world.sampleUrban(ox, oz) > 0.01 || avoid(ox, oz)) continue;
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + rnd(ox, oz, 31 + k) * 0.3, dx = Math.sin(a), dz = Math.cos(a);
        const len = 190;
        let ok = true, prev = h0, pen = 0, lo = h0, hi = h0;
        for (let s = 0; s <= len; s += 10) {
          const px = ox + dx * s, pz = oz + dz * s;
          let worst = 0;
          for (const o of [-5, 5]) {
            const qx = px + dz * o, qz = pz - dx * o, h = H(qx, qz);
            if (h < 1.2 || world.sampleUrban(qx, qz) > 0.01 || world.sampleRiver(qx, qz) > 0.1 || world.bridgeY(qx, qz) !== null || insideBuilding(qx, qz, 3)) { ok = false; break; }
            worst = Math.max(worst, Math.abs(h - prev));
          }
          if (!ok) break;
          const h = H(px, pz);
          lo = Math.min(lo, h); hi = Math.max(hi, h);
          pen += worst + Math.abs(h - prev) * 2;
          if (Math.abs(h - prev) > 0.9) { ok = false; break; }            // nothing steeper than 1 in 11 along the line
          prev = h;
        }
        if (!ok || hi - lo > 9) continue;
        // clear of the roads (and their verges and traffic), but not so far that nobody finds it
        let rmin = 1e9;
        for (let s = 0; s <= len; s += 20) rmin = Math.min(rmin, roads.dist(ox + dx * s, oz + dz * s, 400));
        if (rmin < 26) continue;
        const reach = rmin > 380 ? 40 : rmin / 12;
        const beach = h0 < 6 && lo < 4.5;
        cands.push({ x: ox, z: oz, dx: dx, dz: dz, h0: h0, score: pen + (hi - lo) * 3 + reach - (beach ? 12 : 0), beach: beach, road: rmin, lo: lo, hi: hi });
      }
    }
    cands.sort((a, b) => a.score - b.score);
    // spread them out over the island: the best sites at least 1.3 km from each other, a beach among them if there is one
    const out = [];
    const far = (c, d) => out.every(o => Math.hypot(o.x - c.x, o.z - c.z) > d);
    const beaches = () => out.filter(o => o.beach).length;
    // the capital gets one or two you can ride out to from the city, then one on a beach, then the best of the rest, at most three on sand
    const cap = (world.cities || []).find(ci => ci.site && ci.site.capital && ci.centre);
    if (cap) {
      const near = cands.filter(c => !c.beach && Math.hypot(c.x - cap.centre[0], c.z - cap.centre[1]) < 4500);
      for (const c of near) { if (out.length >= 2) break; if (far(c, 1300)) out.push(c); }
    }
    const beachC = cands.find(c => c.beach && far(c, 1300));
    if (beachC) out.push(beachC);
    for (const d of [1300, 900, 600]) { for (const c of cands) { if (out.length >= n) break; if (c.beach && beaches() >= 3) continue; if (far(c, d)) out.push(c); } if (out.length >= n) break; }
    return out;
  }

  // ride a jump on the trail bike model at a range of speeds: hold the speed to the foot of the kicker, a steady throttle up it, and in the
  // air keep the bike pitched for the landing (as a rider would); return the band of speeds that land on the landing without crashing
  function speedWindow(decks, P, k0, l0, l1) {
    const ki = CAR_KINDS.findIndex(q => q.name === "dirtbike");
    const perf = ki >= 0 ? perfOf(CAR_KINDS[ki], { top: 36, to100: 4 }) : { top: 36, to100: 4 };
    const ground = (x, z, refY) => {
      let best = null;
      for (const d of decks) {
        const dx = x - d.cx, dz = z - d.cz, lx = dx * d.c - dz * d.s, lz = dx * d.s + dz * d.c;
        if (Math.abs(lx) > d.hw || Math.abs(lz) > d.hl) continue;
        const t = (lz + d.hl) / (2 * d.hl), y = d.ya + (d.yb - d.ya) * (d.prof === 2 ? t * t : t);
        if (y <= refY + 0.9 && (best === null || y > best)) best = y;
      }
      const g = world.sampleHeight(x, z);
      return best === null ? g : Math.max(best, g);
    };
    const Wj = { ground: ground, grip: () => ({ mu: 1, dirt: true }) };
    const s0 = k0 - 14, a = P(s0), dirX = P(s0 + 1)[0] - a[0], dirZ = P(s0 + 1)[1] - a[1];
    const ok = [];
    const vMax = Math.min(34, perf.top * 0.97);
    for (let v = 8; v <= vMax; v += 0.75) {
      const M = new SHIGOTO.Motorcycle("dirt", { top: perf.top, to100: perf.to100 });
      M.reset({ x: a[0], z: a[1], y: ground(a[0], a[1], 999), yaw: Math.atan2(dirX, dirZ), speed: v });
      let t = 0, flew = false, ev0 = null;
      while (t < 7 && !M.crashed) {
        const s = (M.x - a[0]) * dirX + (M.z - a[1]) * dirZ + s0;
        const ev = M.step(1 / 30, { throttle: M.air ? 0.3 : (s < k0 ? (M.u < v ? 1 : 0) : 1), weight: M.air ? clamp((M.pitch + 0.42) * 1.5 + M.q * 0.6, -1, 1) : 0 }, Wj);
        for (const e of ev) { if (e.type === "land" && e.air > 0.5) flew = true; if (e.type === "crash") ev0 = e.cause + '@' + s.toFixed(0); }
        t += 1 / 30;
        if (flew && s > l1 + 12) break;
      }
      ok.push(!M.crashed && flew ? v : null);
      if (B._dbg) B._dbg.push([v, M.crashed && (ev0 || '?'), flew, +t.toFixed(2)]);
    }
    // the longest run of clean speeds
    let best = null, cur = null;
    for (const v of ok) { if (v !== null) { if (!cur) cur = { lo: v, hi: v }; else cur.hi = v; if (!best || cur.hi - cur.lo > best.hi - best.lo) best = { lo: cur.lo, hi: cur.hi }; } else cur = null; }
    if (best) best.mid = (best.lo + best.hi) / 2;
    return best;
  }

  function buildBigJumps(root) {
    jumps.list.length = 0;
    world.walk = world.walk.filter(d => !d.bigjump);
    if (B._mesh && B._mesh.parent) B._mesh.parent.remove(B._mesh);
    let sites;
    try { sites = findSites(SIZES.length); } catch (e) { console.warn("[Konto] big jumps: no sites", e); return; }
    const pos = [], uv = [], idx = [];
    const H = (x, z) => world.sampleHeight(x, z);
    // a deck the bike can ride, plus its mesh; profile 2 curves (flat at the start, steepest at the end)
    const addDeck = (d) => {
      d.bigjump = true; d.park = true; d.dirt = true; d.r = Math.hypot(d.hw, d.hl) + 2;
      world.walk.push(d);
      const nx = Math.max(2, Math.round(d.hw * 2 / 1.0)), nz = Math.max(4, Math.round(d.hl * 2 / 0.8));
      const W2 = (lx, lz) => [d.cx + lx * d.c + lz * d.s, d.cz - lx * d.s + lz * d.c];
      const f = (lx, lz) => { const t = (lz + d.hl) / (2 * d.hl); return d.ya + (d.yb - d.ya) * (d.prof === 2 ? t * t : t); };
      const base = pos.length / 3;
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const lx = -d.hw + 2 * d.hw * i / nx, lz = -d.hl + 2 * d.hl * j / nz, w = W2(lx, lz);
        // the edges roll off a little, like a shaped lip, instead of a knife edge
        const e = Math.abs(lx) / d.hw, roll = e > 0.85 ? (e - 0.85) / 0.15 * 0.25 : 0;
        pos.push(w[0], f(lx, lz) + 0.02 - roll, w[1]); uv.push(w[0] / 3.5, w[1] / 3.5);
      }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = base + j * (nx + 1) + i, b = a + 1, c2 = a + nx + 1, d2 = c2 + 1; idx.push(a, c2, b, b, c2, d2); }
      // the sides and the open end, down into the ground
      const side = (lxA, lzA, lxB, lzB) => {
        const n = Math.max(2, Math.round(Math.hypot(lxB - lxA, lzB - lzA) / 1.2));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          const l0 = [lxA + (lxB - lxA) * t0, lzA + (lzB - lzA) * t0], l1 = [lxA + (lxB - lxA) * t1, lzA + (lzB - lzA) * t1];
          const w0 = W2(l0[0], l0[1]), w1 = W2(l1[0], l1[1]), y0 = f(l0[0], l0[1]) - 0.23, y1 = f(l1[0], l1[1]) - 0.23;
          const o = pos.length / 3, g0 = H(w0[0], w0[1]) - 0.5, g1 = H(w1[0], w1[1]) - 0.5;
          // spread outwards at the foot, like a pile of earth
          const out = Math.sign(l0[0]) || 0, sx = out * d.c * 0.9, sz = -out * d.s * 0.9;
          pos.push(w0[0], y0, w0[1], w1[0], y1, w1[1], w0[0] + sx * (y0 - g0), g0, w0[1] + sz * (y0 - g0), w1[0] + sx * (y1 - g1), g1, w1[1] + sz * (y1 - g1));
          const along0 = (l0[1] + l0[0]) / 3.5, along1 = (l1[1] + l1[0]) / 3.5;
          uv.push(along0, y0 / 3.5, along1, y1 / 3.5, along0, g0 / 3.5, along1, g1 / 3.5);
          idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3, o, o + 1, o + 2, o + 1, o + 3, o + 2);
        }
      };
      side(-d.hw, -d.hl, -d.hw, d.hl); side(d.hw, -d.hl, d.hw, d.hl); side(-d.hw, d.hl, d.hw, d.hl);
      return d;
    };
    sites.forEach((S, si) => {
      const Z = SIZES[si % SIZES.length];
      const dx = S.dx, dz = S.dz, yaw = Math.atan2(dx, dz), c = Math.cos(yaw), sn = Math.sin(yaw);
      const P = s => [S.x + dx * s, S.z + dz * s];
      // the layout for a given gap: kicker, lip, landing (as high as the lip, a straight 35-degree face for 85% of its height, which is what
      // a rider coming down from the top of the arc lands on, then a curved transition out to the ground, running the other way so its curve
      // is flat at the bottom), and a tabletop or a knuckle between them
      const k0 = 62, k1 = k0 + Z.kick;
      const a = P(k0), b = P(k1), gA = H(a[0], a[1]), gB = H(b[0], b[1]);
      const lip = gB + Z.rise, lTop = lip - 0.4, LA = Math.tan(0.61);
      const layout = (gap) => {
        const l0 = k1 + gap, D = [];
        const mk = P((k0 + k1) / 2), lp = P(k1 + 0.6);
        D.push({ cx: mk[0], cz: mk[1], c: c, s: sn, hw: Z.hw, hl: Z.kick / 2, ya: gA, yb: lip, prof: 2 });
        D.push({ cx: lp[0], cz: lp[1], c: c, s: sn, hw: Z.hw, hl: 0.6, ya: lip, yb: lip - 0.05, prof: 0 });
        const gL = H(P(l0)[0], P(l0)[1]), hTot = Math.max(1, lTop - gL), yMid = gL + hTot * 0.15;
        const sLen = (lTop - yMid) / LA, tLen = 2 * (yMid - gL) / LA, lLen = sLen + tLen;
        const ms = P(l0 + sLen / 2), e = P(l0 + lLen), gE = H(e[0], e[1]), ml = P(l0 + sLen + tLen / 2);
        D.push({ cx: ms[0], cz: ms[1], c: c, s: sn, hw: Z.hw + 0.6, hl: sLen / 2, ya: lTop, yb: yMid, prof: 0 });
        D.push({ cx: ml[0], cz: ml[1], c: -c, s: -sn, hw: Z.hw + 0.6, hl: tLen / 2, ya: gE, yb: yMid, prof: 2 });
        // a tabletop (come up short and you land on the table, which hurts but is survivable); the open gaps have only a knuckle to catch you
        if (Z.table) { const tb = P((k1 + 1.2 + l0) / 2); D.push({ cx: tb[0], cz: tb[1], c: c, s: sn, hw: Z.hw + 0.3, hl: (l0 - k1 - 1.2) / 2, ya: lTop, yb: lTop, prof: 0 }); }
        else { const kn = P(l0 - 1.5); D.push({ cx: kn[0], cz: kn[1], c: c, s: sn, hw: Z.hw + 0.6, hl: 1.5, ya: lTop - 0.05, yb: lTop, prof: 0 }); }
        return { D: D, l0: l0, lLen: lLen, gap: gap };
      };
      // the speed it needs: ridden here, on the bike model itself, at every speed a trail bike can reach; the band that lands clean is what
      // you are told (the suspension's pop off the lip and the rider's air control are in it, which no formula has). If the gap is too long
      // for a trail bike's top speed it is shortened until it is not.
      // A band narrower than 1.5 m/s (5 km/h) is not something a rider can hit on purpose, so that counts as too long too.
      let L = null, win = null, keep = null;
      for (let gap = Z.gap; gap >= 8; gap -= 2) {
        L = layout(gap); win = speedWindow(L.D, P, k0, L.l0, L.l0 + L.lLen);
        if (win && !keep) keep = { L: L, win: win };
        if (win && win.hi - win.lo >= 1.5) break;
      }
      if (!win || win.hi - win.lo < 1.5) { if (keep) { L = keep.L; win = keep.win; } }
      L.D.forEach(addDeck);
      const l0 = L.l0, lLen = L.lLen, gapUsed = L.gap;
      // keep trees and street furniture off it
      for (let s = 0; s <= l0 + lLen + 30; s += 20) { const q = P(s); bikeParks.clear.push([q[0], q[1], 14]); }
      if (!win) { console.warn("[Konto] big jump at " + S.x.toFixed(0) + "," + S.z.toFixed(0) + " has no clean speed"); }
      const vIn = win ? win.mid : 18;
      // trail bikes at the start of the run-in
      const ki = CAR_KINDS.findIndex(q => q.name === "dirtbike");
      if (ki >= 0) [0, 1].forEach(k => {
        const q = P(6 + k * 2.6), lx = -dz, lz = dx, side = k ? 1 : -1;
        const pal = [[0.86, 0.30, 0.08], [0.12, 0.36, 0.78], [0.86, 0.80, 0.12], [0.18, 0.62, 0.30]][(si + k) % 4];
        bikeParks.rentals.push({ kind: ki, pos: new THREE.Vector3(q[0] + lx * side * 4, H(q[0] + lx * side * 4, q[1] + lz * side * 4) + 0.04, q[1] + lz * side * 4), yaw: yaw, colour: pal.slice(), uv: [0, 0], rental: true });
      });
      const cn = cityNear(S.x, S.z);
      const terrain = S.beach ? "on the beach" : S.h0 > 90 ? "up in the hills" : "on open ground";
      const where = (cn ? terrain + " " + (cn.d / 1000).toFixed(1) + " km " + compass(cn.dx, cn.dz) + " of " + cn.name : terrain) +
        ": " + (Z.table ? "a " + Z.rise.toFixed(1) + " m tabletop, " + gapUsed + " m long" : "a " + Z.rise.toFixed(1) + " m kicker over a " + gapUsed + " m gap") + ", hit it at " + (win ? Math.round(win.lo * 3.6) + "-" + Math.round(win.hi * 3.6) : "about " + Math.round(vIn * 3.6)) + " km/h";
      if (win) jumps.list.push({ x: S.x, z: S.z, yaw: yaw, start: P(4), size: Z, where: where, speed: vIn, lo: win.lo, hi: win.hi, name: Z.name });
    });
    if (idx.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, dirtMaterial());
      mesh.receiveShadow = true; mesh.castShadow = true; mesh.name = "bigjumps";
      root.add(mesh); B._mesh = mesh;
    }
    console.log("[Konto] big jumps:\n  " + jumps.list.map((j, i) => (i + 1) + ". " + j.where).join("\n  "));
  }

  const _parks = window.buildBikeParks;
  if (typeof _parks === "function") window.buildBikeParks = function (root) { const r = _parks.apply(this, arguments); try { buildBigJumps(root); } catch (e) { console.warn("[Konto] big jumps", e); } return r; };

  // BIGAIR: on a trail bike at the start of the next jump's run-in
  try {
    CHEAT_ACTIONS.BIGAIR = { dial: "5550777", note: "", fn: () => {
      if (!jumps.list.length) { say("No jumps on this island.", 3); return; }
      const j = jumps.list[jumps.next++ % jumps.list.length];
      if (drive.car && typeof leaveCar === "function") leaveCar();
      if (typeof interiorLeave === "function" && interior && interior.active) interiorLeave(true);
      player.pos.set(j.start[0], world.walkY(j.start[0], j.start[1], 999), j.start[1]);
      player.yaw = player.targetYaw = j.yaw;
      cheatSpawn("dirtbike");
      say("Hit it at about " + Math.round(j.speed * 3.6) + " km/h.", 4);
    } };
  } catch (e) { /* the cheat table is not there */ }

  console.log("[Konto] bike dynamics: Shigoto " + SHIGOTO.VERSION);
})();
