// The game's side of the Shigoto realism engine (SHIGOTO.RealismEngine, Engine/src/realism): Tōkonto lived in.
//
// Behind the loading screen every plot in every city is given a purpose (a ramen shop that shuts on Wednesdays, a block of
// forty flats, an insurance company's twelve floors), every home its households, and every one of the people in them a job or a
// school and a day of their own. The same day every time it is asked for: the man who leaves number 302 at ten to seven
// leaves it at ten to seven tomorrow too.
//
// What that changes in the game:
//   PEOPLE   Everyone on the pavement is somebody: a name, an age, a job, and somewhere to be. They come out of their own front
//            doors, walk to the station or the office or the ramen counter by the footways, and go in when they get there.
//            Regard someone (hold Z) and you see who they are and what they are doing.
//   CROWDS   How busy a street is follows who is out on it: the office blocks empty after the last overtime, the bar streets
//            fill at nine, the residential lanes are quiet at two in the afternoon and busy at six.
//   SCENES   What people are doing where they stand: radio exercises in the park at half six, rubbish going out on the ward's
//            collection days, smoke breaks behind the office at twenty past ten, queues at the ramen counter at noon,
//            neighbours talking on the step, shopkeepers sweeping before opening, old men on the park bench, prayers at the shrine.
//   PLACES   Shops keep hours: walk up to a shopfront and it tells you what it is, whether it's open and when it shuts.
//            Deliveries stack up outside food shops before they open; rubbish piles under the crow nets until the truck comes.
//   WINDOWS  At night the share of lit windows is the share of homes with somebody home and awake, of office floors with
//            somebody still at a desk: homes fill up from six, go out one by one from eleven; office floors go dark as the
//            overtime ends; on Sunday the towers are black. Some homes have a television on.
//
// API (window.realism) for missions and for the houses:
//   realism.engine                       the RealismEngine (places, census, planner, calendar)
//   realism.who(ped)                     { name, age, job, doing, temper, line } for a person on the street (or null)
//   realism.placeAt(x, z)                the place (plot) at a point, with .purpose .name .hoursText() .company
//   realism.households(plotOrPlace)      who lives there: [{ surname, unit, type, members: [{ name, age, role, roleLabel, traits }] }]
//   realism.dressing(plotOrPlace)        what the front of a home shows now: nameplates, bikes, car, plants, laundry, futons, ...
//   realism.homeLights(householdId)      which rooms of one household are lit now (genkan, living, kitchen, bedroom, bath, tv)
//   realism.householdOf(plot, idx)       one house's household with each member's wake/leave/back/sleep today and atHome(minute)
//   realism.registerDoor(plot, [x, z], idx)  a house's real front door: its people come out of and go in there
//   realism.today()                      the calendar: weekday, holiday, rubbish day, payday...
//   realism.status()                     counts; console shigoto.realism()
// Off switch: ?realism=0 (or localStorage konto.realism = "0").

(function () {
  "use strict";
  if (!window.SHIGOTO || !SHIGOTO.RealismEngine) { console.warn("[Konto] realism engine not in this build"); return; }
  let off = /[?&]realism=0\b/.test(location.search);
  try { if (localStorage.getItem("konto.realism") === "0") off = true; } catch (e) { /* private window */ }
  if (off) { console.log("[Konto] realism turned off"); return; }

  const RL = window.realism = { version: SHIGOTO.REALISM_VERSION, engine: null, ready: false, building: false, bodies: new Map(), staged: new Map(), props: new Map(), doors: new Map(), stats: { spawned: 0, scenes: 0, labelled: 0 } };
  const G = SHIGOTO.WINDOW_LIFE_GLSL;
  const has = n => typeof window[n] === "function";
  const dist = (a, b, c, d) => Math.hypot(a - c, b - d);

  // ---- time ----
  function absMinutes() { return TIME.startMin + clock * TIME.rate; }
  function calDay() { return Math.floor(absMinutes() / 1440); }
  function minuteNow() { return gameMinutes(); }
  function logicalDay() { return Math.floor((absMinutes() - 240) / 1440); }
  RL.today = () => RL.engine ? Object.assign(RL.engine.info(calDay()), { minute: Math.round(minuteNow()) }) : null;

  // ---- building the city's people ----
  // The houses (houses.js, KONTO_HOUSES) lay a plot of houses out as separate houses, each with its own front door: each of those
  // is its own place here, with one household (or none, if the house stands empty, or a shop with the family over it).
  function housesByPlot() {
    const map = new Map();
    try {
      const H = window.KONTO_HOUSES; if (!H || typeof H.homes !== "function") return map;
      for (const h of H.homes() || []) {
        const plot = h.plot || (h.box && h.box.house && h.box.house.plot); if (!plot) continue;
        (map.get(plot) || map.set(plot, []).get(plot)).push(h);
      }
      for (const L of map.values()) L.sort((a, b) => houseIdx(a) - houseIdx(b));
    } catch (e) { console.warn("[Konto] realism: houses not readable:", e); }
    return map;
  }
  const houseIdx = h => (h.box && h.box.house && h.box.house.idx != null ? h.box.house.idx : h.idx != null ? h.idx : 0);
  const xzOf = v => !v ? null : Array.isArray(v) ? (v.length >= 3 ? [v[0], v[2]] : [v[0], v[1]]) : [v.x, v.z];
  function plotsOfWorld() {
    const plots = [], ref = [], houses = housesByPlot();
    let hid = 0;
    (world.cities || []).forEach((city, ci) => {
      const wards = city.wards || [], village = !!(city.site && city.site.village);
      (city.plots || []).forEach(p => {
        if (!p || !p.centre || !p.kind) return;
        const w = wards[p.ward];
        const hs = houses.get(p);
        if (hs && hs.length) {
          hs.forEach(h => {
            const at = xzOf(h.pos) || p.centre, door = xzOf(h.door);
            plots.push({ id: 9000000 + (hid++), kind: h.shop ? "shop" : "houses", x: at[0], z: at[1], w: 8, d: 8, yaw: (h.yaw || 0) * (Math.abs(h.yaw || 0) <= 6.3 ? 180 / Math.PI : 1),
              floors: h.floors || 2, ward: ci * 1000 + (p.ward | 0), district: w ? w.kind : "default", city: ci, village, door, units: h.empty ? 0 : h.shop ? 1 : 1, label: h.shop ? h.label : null, hours: h.hours || null });
            ref.push(p); p.realismHouses = p.realismHouses || []; p.realismHouses[houseIdx(h)] = plots.length - 1;
          });
          return;
        }
        plots.push({ id: ci * 200000 + (p.id | 0), kind: p.kind, x: p.centre[0], z: p.centre[1], w: p.size[0], d: p.size[1], yaw: p.yaw || 0, floors: p.floors || 1,
          ward: ci * 1000 + (p.ward | 0), district: w ? w.kind : "default", city: ci, village });
        ref.push(p);
      });
    });
    return { plots, ref };
  }
  function stationsOfWorld() { try { return has("commuteStations") ? commuteStations().map(s => ({ x: s.x, z: s.z, name: s.name })) : []; } catch (e) { return []; } }
  // the build as a generator, so it can run behind the loading screen (persist stage) or a few ms a frame
  function* buildSteps() {
    const { plots, ref } = plotsOfWorld();
    const eng = new SHIGOTO.RealismEngine({ seed: (world.seed || 1964) ^ 0x5a17, epoch: Date.UTC(2026, 3, 6) });
    for (const k of eng.buildSteps(plots, stationsOfWorld())) yield k;
    eng.places.forEach((pl, k) => { pl.plot = ref[k]; if (!ref[k].realism) ref[k].realism = pl; (ref[k].realismPlaces || (ref[k].realismPlaces = [])).push(pl); });
    for (const p of ref) if (p.realismHouses) p.realismHouses = p.realismHouses.map(k => k == null ? null : eng.places[k]);
    RL.engine = eng; RL.forWorld = world; RL.ready = true; RL.building = false;
    const pend = RL.pendingDoors || []; RL.pendingDoors = []; pend.forEach(a => RL.registerDoor(a[0], a[1], a[2]));
    const s = eng.stats();
    console.log("[Konto] realism: " + s.places + " places, " + s.people + " people in " + s.households + " households, " + s.employed + " with work or school to go to");
  }
  function ensureBuilt(budgetMs) {
    if (typeof world === "undefined" || !world || !world.cities || !world.cities.length) return false;
    if (RL.ready && RL.forWorld === world) return true;
    if (!RL.gen || RL.genFor !== world) { RL.gen = buildSteps(); RL.genFor = world; RL.ready = false; RL.building = true; clearAll(); }
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) { const r = RL.gen.next(); if (r.done) { RL.gen = null; break; } }
    return RL.ready;
  }

  // ---- doors: where a place's people come out onto the footway ----
  function doorOf(pl) {
    if (pl._door) return pl._door;
    const reg = RL.doors.get(pl.id) || pl.door;
    let x = reg ? reg[0] : pl.x, z = reg ? reg[1] : pl.z;
    if (!pedNet.ready) return null;
    const near = pedNetNear(x, z, reg ? 20 : Math.max(30, Math.max(pl.w || 10, pl.d || 10)), id => pedNet.adj[id].length > 0)[0];
    if (!near) return (pl._door = { x, z, node: -1, fx: 0, fz: 1, tx: 1, tz: 0 });
    const nx = pedNet.x[near[1]], nz = pedNet.z[near[1]], dx = pl.x - nx, dz = pl.z - nz, L = Math.hypot(dx, dz) || 1;
    // facing in: toward the building; along: the pavement
    return (pl._door = { x: nx, z: nz, node: near[1], fx: dx / L, fz: dz / L, tx: -dz / L, tz: dx / L });
  }
  // several doors on one plot (a plot of houses) each go to the nearest of its places
  RL.registerDoor = (plot, xz, idx) => {
    xz = xzOf(xz); if (!plot || !xz) return;
    let pl = null;
    if (plot.realismHouses && idx != null) pl = plot.realismHouses[idx];
    if (!pl && plot.realismPlaces) { let bd = 1e9; for (const q of plot.realismPlaces) { const d = Math.hypot(q.x - xz[0], q.z - xz[1]); if (d < bd) { bd = d; pl = q; } } }
    if (!pl) pl = plot.realism || (plot.purpose ? plot : null);
    if (!pl) { (RL.pendingDoors || (RL.pendingDoors = [])).push([plot, xz, idx]); return; }
    RL.doors.set(pl.id, [xz[0], xz[1]]); pl._door = null; pl.dx = xz[0]; pl.dz = xz[1];
  };

  // ---- bodies: a cast member for a person, the same body every time they are met ----
  function figureFor(person) {
    const lib = pplLib.ready; if (!lib.length) return null;
    let pool = lib.filter(e => !!e.female === !!person.female && !!e.business === !!person.business);
    if (!pool.length) pool = lib.filter(e => !!e.female === !!person.female);
    if (!pool.length) pool = lib;
    const e = pool[person.seed % pool.length];
    const h = 0.93 + ((person.seed >>> 8) % 100) / 100 * 0.12 - (person.age > 70 ? 0.03 : 0);
    return { f: pplFigure(e, h), h };
  }
  function walkSpeed(person) {
    const a = person.age, base = a > 75 ? 0.85 : a > 65 ? 1.0 : a < 30 ? 1.42 : 1.3;
    return base * (0.9 + ((person.seed >>> 4) % 100) / 100 * 0.25);
  }
  function makeBody(i, x, z, yaw) {
    const person = RL.engine.person(i), fig = figureFor(person); if (!fig || !fig.f) return null;
    const p = Object.assign({}, fig.f, { x, z, y: world.surfaceY(x, z), yaw: yaw || 0, sp: walkSpeed(person), state: "walk", t: 0, hp: 100, idleIn: 1e9, h: fig.h, said: 0, rid: i, female: person.female, lat: (Math.random() - 0.5) * 1.0, moving: true });
    p.holder.position.set(p.x, p.y, p.z); p.holder.rotation.y = p.yaw;
    scene.add(p.holder);
    peds.list.push(p);
    RL.bodies.set(i, p);
    RL.stats.spawned++;
    return p;
  }
  // send someone along the footways to a point; they go in (vanish at the door) when they get there, unless keep
  function routeTo(p, x, z, keep) {
    const ids = pedNet.ready ? pedNetRoute(p.x, p.z, x, z) : null;
    if (!ids || ids.length < 2) return false;
    p.path = ids.map(id => [pedNet.x[id], pedNet.z[id], id]); p.pi = 0; p.pu = 0; p.next = commuteNext; p.toStation = !keep; p.keepAfter = !!keep;
    commutePlace(p); p.state = "commute"; p.t = 0; p.moving = true; pedPlay(p, p.jog && p.acts.run ? "run" : "walk", 0.3, p.sp / WALK_SPEED);
    return true;
  }
  function wander(p) {
    if (!pedNetAttach(p, 6)) return false;
    p.state = "walk"; p.t = 0; p.idleIn = 18 + Math.random() * 30; p.moving = true; pedPlay(p, p.jog && p.acts.run ? "run" : "walk", 0.3, p.sp / WALK_SPEED);
    return true;
  }

  // ---- people on the street ----
  const WALKERS = { walk_dog: 1, stroll: 1, jog: 1 };
  function spawnResident() {
    const E = RL.engine, px = player.pos.x, pz = player.pos.z, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const cands = [];
    for (const e of E.peopleOut(px, pz, 100)) {
      if (RL.bodies.has(e.i) || RL.staged.has(e.i)) continue;
      const w = e.w;
      if (w.a === "travel" ? !(w.travel && w.travel.leg === "walk") : !WALKERS[w.a]) continue;
      const d = dist(e.x, e.z, px, pz);
      // just stepping out of a door: they can appear there, even in view
      const leaving = w.a === "travel" && w.travel.k < 0.12 && !w.travel.fromStation;
      if (!leaving) { if (d < 30 || d > 95) continue; if ((e.x - px) * fx + (e.z - pz) * fz > 0.55 * d && d < 60) continue; }
      else if (d < 10 || d > 95) continue;
      cands.push(e);
    }
    if (!cands.length) return false;
    const e = cands[(Math.random() * cands.length) | 0], w = e.w;
    let sx = e.x, sz = e.z;
    if (w.a === "travel" && w.travel.k < 0.12 && !w.travel.fromStation) { const dr = doorOf(E.places[w.travel.from]); if (dr) { sx = dr.x; sz = dr.z; } }
    const q = pedNetNear(sx, sz, 25, id => pedNet.adj[id].length > 0)[0]; if (!q) return false;
    sx = pedNet.x[q[1]]; sz = pedNet.z[q[1]];
    if (insideBuilding(sx, sz, 0.4) || peds.list.some(o => dist(o.x, o.z, sx, sz) < 1.5)) return false;
    const p = makeBody(e.i, sx, sz, 0); if (!p) return false;
    p.realT = clock;
    if (WALKERS[w.a]) { p.jog = w.a === "jog"; if (p.jog) p.sp = 2.6; if (!wander(p)) { pedRemoveSafe(p); return false; } p.until = w.seg ? w.seg.t1 : 0; }
    else {
      const tr = w.travel;
      if (!routeTo(p, tr.bx, tr.bz, false)) { if (!wander(p)) { pedRemoveSafe(p); return false; } }
    }
    if (p.cur) p.cur.time = Math.random() * 2;
    return true;
  }
  function pedRemoveSafe(p) { try { pedRemove(p); } catch (e) { /* gone */ } }
  // a census identity for someone the game spawned itself (station crowds, the plain fill): a real local person who is out now
  function adopt(p, wantTrain) {
    const E = RL.engine; if (!E || p.rid != null) return;
    const L = E.local.out; if (!L.length) return;
    for (let t = 0; t < 12; t++) {
      const e = L[(Math.random() * L.length) | 0];
      if (RL.bodies.has(e.i) || RL.staged.has(e.i)) continue;
      const pr = E.census;
      if (wantTrain && !(e.w.travel && e.w.travel.mode === "train")) continue;
      if (!!pr.sex[e.i] !== !!p.female && p.female !== undefined) continue;
      p.rid = e.i; RL.bodies.set(e.i, p); RL.stats.labelled++;
      return;
    }
  }
  RL.who = (p) => {
    if (!RL.ready || !p || p.rid == null) return null;
    try { return RL.engine.describe(p.rid, minuteNow(), calDay()); } catch (e) { return null; }
  };
  RL.label = (p) => { const d = RL.who(p); return d ? d.line : null; };
  RL.doing = (p) => { const d = RL.who(p); return d ? d.doing : null; };

  // keep the people we placed doing what their day says
  function minder() {
    const E = RL.engine, m = minuteNow(), day = calDay();
    for (const [i, p] of RL.bodies) {
      if (peds.list.indexOf(p) < 0) { RL.bodies.delete(i); continue; }
      if (p.state === "dead" || p.state === "down" || p.state === "flee" || p.state === "cower" || p.state === "hands" || p.state === "call" || p.state === "greet" || p.state === "ask" || p.state === "follow") continue;
      if (p.stagedAt) continue;
      // a walker whose walk is over goes on to wherever they go next
      if (p.state === "walk" && p.until) {
        const w = E.whereAt(i, m, day);
        if (!WALKERS[w.a]) {
          p.until = 0; p.jog = false; p.sp = walkSpeed(E.person(i));
          const to = w.a === "travel" && w.travel && Number.isFinite(w.travel.bx) ? [w.travel.bx, w.travel.bz] : (() => { const d = doorOf(E.places[w.p >= 0 ? w.p : E.census.home[i]]); return d ? [d.x, d.z] : null; })();
          if (to) routeTo(p, to[0], to[1], false);
        }
      }
      // a commuter on a station walk who arrived: the station takes them (the game removes them); nothing to do
    }
  }

  // ---- scenes ----
  const SCENE = {
    taiso:   { max: 10, pose: "stretch", layout: "grid",  park: true },
    smoke:   { max: 4,  pose: "smoke",   layout: "huddle", side: 5 },
    queue:   { max: 8,  pose: "idle",    layout: "line" },
    chat:    { max: 3,  pose: "folded",  layout: "huddle", side: -3 },
    garbage: { max: 2,  pose: "crouch",  layout: "huddle", side: -2.5 },
    sweep:   { max: 1,  pose: "sweep",   layout: "front" },
    bench:   { max: 3,  pose: "sit",     layout: "bench", park: true },
    shrine:  { max: 3,  pose: "bow",     layout: "front", inset: 3 },
    garden:  { max: 1,  pose: "crouch",  layout: "front", inset: 1.2 },
    drinks:  { max: 0 }, play: { max: 0 }
  };
  const TAISO_POSES = ["stretch", "hands", "wave", "folded", "stretch", "idle"];
  function stageScenes() {
    const E = RL.engine, px = player.pos.x, pz = player.pos.z, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let budget = (gfx.tier === "low" ? 8 : gfx.tier === "medium" ? 14 : 20) - [...RL.staged.values()].length;
    const scenes = E.scenes(px, pz, 110).map(s => Object.assign(s, { d: dist(s.x, s.z, px, pz) })).sort((a, b) => a.d - b.d);
    const live = new Set();
    for (const sc of scenes) {
      const def = SCENE[sc.kind]; if (!def || !def.max) continue;
      live.add(sc.id);
      const pl = sc.place, door = doorOf(pl); if (!door) continue;
      const already = sc.people.filter(i => RL.staged.has(i)).length;
      const want = Math.min(def.max, sc.people.length) - already;
      if (want <= 0 || budget <= 0) continue;
      // never out of thin air under your nose
      const sd = dist(door.x, door.z, px, pz), inView = (door.x - px) * fx + (door.z - pz) * fz > 0.5 * sd;
      if (sd < 22 || (inView && sd < 45)) continue;
      const idx = already;
      let k = 0;
      for (const i of sc.people) {
        if (k >= want || budget <= 0) break;
        if (RL.staged.has(i) || RL.bodies.has(i)) continue;
        const slot = layout(def, pl, door, idx + k, sc);
        if (!slot) break;
        const p = makeBody(i, slot.x, slot.z, slot.yaw); if (!p) break;
        p.state = "scene"; p.stagedAt = sc.id; p.sceneKind = sc.kind; p.moving = false;
        pedPlay(p, (p.acts[def.pose] ? def.pose : (p.acts.folded ? "folded" : "idle")), 0, 1);
        if (sc.kind === "queue" && Math.random() < 0.4 && p.acts.phone) pedPlay(p, "phone", 0, 1);
        if (p.cur) p.cur.time = Math.random();
        RL.staged.set(i, p); k++; budget--; RL.stats.scenes++;
      }
      if (sc.kind === "garbage") propGarbage(pl, door);
    }
    // people whose scene is over walk off to the next thing in their day
    const m = minuteNow(), day = calDay();
    for (const [i, p] of RL.staged) {
      if (peds.list.indexOf(p) < 0) { RL.staged.delete(i); continue; }
      if (p.state !== "scene") { RL.staged.delete(i); p.stagedAt = null; continue; }
      const w = E.whereAt(i, m, day);
      if (w.a === p.sceneKind && live.has(p.stagedAt)) continue;
      RL.staged.delete(i); p.stagedAt = null;
      const to = w.travel && Number.isFinite(w.travel.bx) ? [w.travel.bx, w.travel.bz] : (() => { const d = doorOf(E.places[w.p >= 0 ? w.p : E.census.home[i]]); return d ? [d.x, d.z] : null; })();
      if (!(to && routeTo(p, to[0], to[1], false))) wander(p);
    }
    // the taiso class moves together
    const beat = Math.floor(clock / 1.7);
    if (beat !== RL.beat) {
      RL.beat = beat;
      for (const p of RL.staged.values()) if (p.sceneKind === "taiso") { const pose = TAISO_POSES[beat % TAISO_POSES.length]; pedPlay(p, p.acts[pose] ? pose : "idle", 0.55, 1); }
      for (const p of RL.staged.values()) if (p.sceneKind === "chat" && Math.random() < 0.25) { const pose = ["folded", "nod", "idle", "folded"][(Math.random() * 4) | 0]; pedPlay(p, p.acts[pose] ? pose : "idle", 0.5, 1); }
    }
  }
  function layout(def, pl, door, k, sc) {
    let bx = door.x, bz = door.z;
    const inX = door.fx, inZ = door.fz, aX = door.tx, aZ = door.tz;
    const face = (x, z) => Math.atan2(x, z);
    if (def.park) {
      // in the park itself: a little way in from the path
      const into = Math.min(10, Math.max(3, Math.min(pl.w || 20, pl.d || 20) * 0.25));
      bx = door.x + inX * into; bz = door.z + inZ * into;
      if (insideBuilding(bx, bz, 0.4)) { bx = door.x + inX * 2; bz = door.z + inZ * 2; }
    }
    let x, z, yaw;
    if (def.layout === "grid") {
      const col = k % 4, row = Math.floor(k / 4);
      x = bx + aX * (col - 1.5) * 1.7 + inX * row * 1.8; z = bz + aZ * (col - 1.5) * 1.7 + inZ * row * 1.8; yaw = face(-inX, -inZ);
    } else if (def.layout === "line") {
      x = bx + aX * (1.3 + k * 0.85) + inX * 0.6; z = bz + aZ * (1.3 + k * 0.85) + inZ * 0.6; yaw = face(-aX, -aZ);
    } else if (def.layout === "huddle") {
      const cx = bx + aX * (def.side || 0) + inX * 0.4, cz = bz + aZ * (def.side || 0) + inZ * 0.4, n = Math.max(2, Math.min(def.max, sc.people.length)), a = k / n * Math.PI * 2 + 0.6;
      x = cx + Math.sin(a) * 0.72; z = cz + Math.cos(a) * 0.72; yaw = face(cx - x, cz - z);
    } else if (def.layout === "bench") {
      x = bx + aX * (k - 1) * 0.62; z = bz + aZ * (k - 1) * 0.62; yaw = face(-inX, -inZ);
      propBench(sc.id, bx, bz, yaw);
    } else {
      const ins = def.inset || 0.5; x = bx + inX * ins + aX * k * 0.9; z = bz + inZ * ins + aZ * k * 0.9; yaw = face(inX, inZ);
    }
    if (insideBuilding(x, z, 0.25)) return null;
    return { x, z, yaw };
  }

  // ---- props: rubbish under the crow net, crates before opening, park benches ----
  const TEX = {};
  function texSet(name, rep) {
    if (TEX[name]) return TEX[name];
    const L = new THREE.TextureLoader(), base = "art/props/" + name;
    const t = (f, srgb) => { const x = L.load(base + f + ".jpg"); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.set(rep || 1, rep || 1); if (srgb) x.encoding = THREE.sRGBEncoding; return x; };
    return (TEX[name] = new THREE.MeshStandardMaterial({ map: t("", true), normalMap: t("_nor"), roughnessMap: t("_rough"), roughness: 1, metalness: 0, envMap: gfx.env || null, envMapIntensity: 0.3 }));
  }
  // translucent rubbish-bag plastic, drawn: creases as a height field, turned into colour, normal and roughness maps
  function bagMaterial(kind) {
    const key = "bag:" + kind; if (TEX[key]) return TEX[key];
    const N = 256, hc = document.createElement("canvas"); hc.width = hc.height = N; const g = hc.getContext("2d");
    g.fillStyle = "#808080"; g.fillRect(0, 0, N, N);
    for (let k = 0; k < 140; k++) { const x = Math.random() * N, y = Math.random() * N, a = Math.random() * Math.PI, l = 20 + Math.random() * 90; g.strokeStyle = "rgba(" + (Math.random() < 0.5 ? "255,255,255" : "0,0,0") + "," + (0.08 + Math.random() * 0.16) + ")"; g.lineWidth = 1 + Math.random() * 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    const H = g.getImageData(0, 0, N, N).data, h = (x, y) => H[(((y + N) % N) * N + ((x + N) % N)) * 4] / 255;
    const mk = () => { const c = document.createElement("canvas"); c.width = c.height = N; return c; };
    const cc = mk(), nc = mk(), rc = mk(), C = cc.getContext("2d").createImageData(N, N), Nn = nc.getContext("2d").createImageData(N, N), Rr = rc.getContext("2d").createImageData(N, N);
    const tint = kind === "plastic" ? [196, 214, 236] : kind === "cans" ? [220, 220, 205] : [232, 232, 226];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 4, v = h(x, y), dx = (h(x + 1, y) - h(x - 1, y)) * 3, dy = (h(x, y + 1) - h(x, y - 1)) * 3, l = Math.hypot(dx, dy, 1);
      const shade = 0.82 + v * 0.3;
      C.data[o] = tint[0] * shade; C.data[o + 1] = tint[1] * shade; C.data[o + 2] = tint[2] * shade; C.data[o + 3] = 255;
      Nn.data[o] = (-dx / l * 0.5 + 0.5) * 255; Nn.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255; Nn.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; Nn.data[o + 3] = 255;
      const r = 0.28 + Math.abs(v - 0.5) * 0.7; Rr.data[o] = Rr.data[o + 1] = Rr.data[o + 2] = r * 255; Rr.data[o + 3] = 255;
    }
    cc.getContext("2d").putImageData(C, 0, 0); nc.getContext("2d").putImageData(Nn, 0, 0); rc.getContext("2d").putImageData(Rr, 0, 0);
    const T = (c, s) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (s) t.encoding = THREE.sRGBEncoding; return t; };
    return (TEX[key] = new THREE.MeshStandardMaterial({ map: T(cc, true), normalMap: T(nc), roughnessMap: T(rc), roughness: 1, metalness: 0, envMap: gfx.env || null, envMapIntensity: 0.6 }));
  }
  function netMaterial() {
    if (TEX.net) return TEX.net;
    const N = 128, c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d");
    g.clearRect(0, 0, N, N); g.strokeStyle = "#1d4f9c"; g.lineWidth = 3;
    for (let k = 0; k <= N; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, N); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(N, k); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 3); t.encoding = THREE.sRGBEncoding;
    return (TEX.net = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 }));
  }
  function propGarbage(pl, door) {
    const id = "gomi:" + pl.id; if (RL.props.has(id)) return;
    const st = RL.engine.garbageAt(pl, minuteNow(), calDay()); if (!st) return;
    const grp = new THREE.Group(), mat = bagMaterial(st.kind), bag = new THREE.SphereGeometry(0.28, 10, 8);
    const pos = bag.attributes.position;
    for (let k = 0; k < pos.count; k++) { const y = pos.getY(k); pos.setY(k, y < -0.1 ? -0.1 - (y + 0.1) * 0.25 : y); pos.setX(k, pos.getX(k) * (1 + Math.sin(k * 1.7) * 0.08)); if (y > 0.22) { pos.setX(k, pos.getX(k) * 0.4); pos.setZ(k, pos.getZ(k) * 0.4); } }
    bag.computeVertexNormals();
    for (let k = 0; k < st.bags; k++) {
      const m = new THREE.Mesh(bag, mat), a = k * 2.399, r = 0.25 + 0.17 * Math.sqrt(k);
      m.position.set(Math.cos(a) * r, 0.2 + (k > 6 ? 0.28 : 0), Math.sin(a) * r * 0.7); m.rotation.y = a; m.scale.setScalar(0.85 + (k % 3) * 0.12);
      m.castShadow = true; grp.add(m);
    }
    const net = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 1.2), netMaterial()); net.position.y = 0.31; grp.add(net);
    const x = door.x - door.tx * 2.4 + door.fx * 0.9, z = door.z - door.tz * 2.4 + door.fz * 0.9;
    if (insideBuilding(x, z, 0.3)) return;
    grp.position.set(x, world.surfaceY(x, z), z); grp.rotation.y = Math.atan2(door.tx, door.tz);
    scene.add(grp); RL.props.set(id, { obj: grp, until: st.pickup, day: calDay(), x, z });
  }
  function propCrates(pl, door) {
    const id = "crates:" + pl.id; if (RL.props.has(id)) return;
    const grp = new THREE.Group(), mat = texSet("crate_wood", 1), box = new THREE.BoxGeometry(0.55, 0.3, 0.38);
    const n = 3 + (pl.seed % 5);
    for (let k = 0; k < n; k++) { const m = new THREE.Mesh(box, mat); m.position.set((k % 2) * 0.6, 0.15 + Math.floor(k / 2) * 0.31, 0); m.rotation.y = (k % 3 - 1) * 0.05; m.castShadow = true; grp.add(m); }
    const x = door.x + door.tx * 1.6 + door.fx * 0.7, z = door.z + door.tz * 1.6 + door.fz * 0.7;
    if (insideBuilding(x, z, 0.3)) return;
    grp.position.set(x, world.surfaceY(x, z), z); grp.rotation.y = Math.atan2(door.tx, door.tz);
    scene.add(grp); RL.props.set(id, { obj: grp, crates: pl, x, z });
  }
  function propBench(id, x, z, yaw) {
    const key = "bench:" + id; if (RL.props.has(key)) return;
    const grp = new THREE.Group(), wood = texSet("bench_wood", 1), iron = texSet("bench_iron", 1);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.42), wood); seat.position.set(0, 0.44, -0.05); grp.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.32, 0.04), wood); back.position.set(0, 0.72, -0.27); back.rotation.x = -0.12; grp.add(back);
    for (const sx of [-0.85, 0.85]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.46), iron); leg.position.set(sx, 0.22, -0.05); grp.add(leg); const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.42), iron); arm.position.set(sx, 0.62, -0.05); grp.add(arm); }
    grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // the sitters face out: the bench sits just behind them
    const bx = x - Math.sin(yaw) * 0.22, bz = z - Math.cos(yaw) * 0.22;
    grp.position.set(bx, world.surfaceY(bx, bz), bz); grp.rotation.y = yaw;
    scene.add(grp); RL.props.set(key, { obj: grp, scene: id, x: bx, z: bz });
  }
  function tendProps() {
    const E = RL.engine, m = minuteNow(), day = calDay(), px = player.pos.x, pz = player.pos.z;
    // rubbish points: one in every few homes along the street is the block's collection point
    for (const pl of E.placesNear(px, pz, 95, q => q.home && q.id % 5 === 0)) { const d = dist(pl.x, pl.z, px, pz); if (d > 30) { const door = doorOf(pl); if (door) propGarbage(pl, door); } }
    for (const pl of E.placesNear(px, pz, 90, q => !q.home && q.def && q.def.staff)) {
      const s = E.placeState(pl, m, day);
      if (s.delivery && dist(pl.x, pl.z, px, pz) > 30) { const door = doorOf(pl); if (door) propCrates(pl, door); }
    }
    for (const [id, pr] of RL.props) {
      let gone = dist(pr.x, pr.z, px, pz) > 160;
      if (pr.until != null && (pr.day !== day || m > pr.until) && dist(pr.x, pr.z, px, pz) > 25) gone = true;     // the truck has been
      if (pr.crates && !E.placeState(pr.crates, m, day).delivery && dist(pr.x, pr.z, px, pz) > 25) gone = true; // taken in
      if (pr.scene && ![...RL.staged.values()].some(p => p.stagedAt === pr.scene) && dist(pr.x, pr.z, px, pz) > 25) gone = true;
      if (gone) { scene.remove(pr.obj); RL.props.delete(id); }
    }
  }
  function clearAll() {
    for (const pr of RL.props.values()) scene.remove(pr.obj);
    RL.props.clear(); RL.bodies.clear(); RL.staged.clear();
  }

  // ---- the shopfront you are standing at ----
  function shopTag() {
    let el = RL.tagEl;
    if (!el) {
      el = RL.tagEl = document.createElement("div"); el.id = "realtag";
      el.style.cssText = "position:fixed;left:24px;bottom:calc(150px + env(safe-area-inset-bottom,0px));z-index:32;pointer-events:none;display:none;font:600 13px/1.35 'Konto Sans',Arial,sans-serif;color:#f3f1ec;text-shadow:0 1px 3px #000;background:rgba(8,9,12,.66);padding:8px 12px;border-radius:3px;border-left:3px solid #9fd0a8;max-width:320px";
      document.body.appendChild(el);
      const st = document.createElement("style"); st.textContent = "body.titleup #realtag, body.paused #realtag, body.cutscene #realtag { visibility: hidden; } #realtag em { font-style: normal; color: rgba(243,241,236,.7); font-size: 12px; display: block; }";
      document.head.appendChild(st);
    }
    const onFoot = !drive.car && !interior.active && player.placed;
    let html = "";
    if (onFoot && Math.hypot(player.vel ? player.vel.x : 0, player.vel ? player.vel.z : 0) < 2.2) {
      const pl = RL.engine.placeAt(player.pos.x, player.pos.z) || nearestFront();
      if (pl && !pl.home && pl.def && (pl.def.staff || pl.purpose === "laundromat")) {
        const s = RL.engine.placeState(pl, minuteNow(), calDay());
        const state = s.phase === "open" ? (s.busy > 0.75 ? "Open · busy" : "Open") : s.phase === "preparing" ? "Opening soon" : s.phase === "closing" ? "Closing up" : "Closed";
        html = "<b>" + esc(s.name) + "</b> <em>" + esc(pl.def.name) + " · " + state + " · " + esc(s.hours) + "</em>";
      } else if (pl && pl.home && pl.units > 1) {
        const names = RL.engine.census.householdsOf(pl).slice(0, 3).map(h => h.surname).join(", ") + (pl.units > 3 ? "…" : "");
        html = "<b>" + esc(pl.units + " homes") + "</b> <em>" + esc(names) + " on the letterboxes</em>";
      }
    }
    if (el._h !== html) { el._h = html; el.innerHTML = html; el.style.display = html ? "block" : "none"; }
  }
  function nearestFront() {
    const ps = RL.engine.placesNear(player.pos.x, player.pos.z, 26);
    let best = null, bd = 9;
    for (const pl of ps) { const d = pl._door; if (!d) continue; const dd = dist(d.x, d.z, player.pos.x, player.pos.z); if (dd < bd) { bd = dd; best = pl; } }
    return best;
  }
  const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

  // ---- lit windows ----
  const U = { life: { value: new THREE.Vector4(0.5, 0.4, 0.6, 0.3) }, clock: { value: new THREE.Vector2(0, 0) } };
  // nominal window bay and storey per style (metres): one lit cell is about one room
  const WIN = { houses: [3.0, 3.0, 0], flats: [3.6, 3.1, 0], machiya: [3.6, 2.7, 0], coast: [4.0, 2.8, 0], kura: [4.2, 3.3, 4], office: [3.2, 3.6, 1], glass: [3.0, 3.6, 1], shed: [7, 3.5, 1], shop: [3.2, 3.4, 2], civic: [3.5, 4.2, 3] };
  const patched = new Set();
  function patchMaterial(m, style) {
    if (!m || patched.has(m) || !WIN[style]) return;
    patched.add(m);
    const cfg = WIN[style], cell = { value: new THREE.Vector4(1, 1, 3, 3) }, prof = cfg[2];
    m.userData.realWin = { style, cell, cfg };
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      if (!/emissivemap_fragment/.test(sh.fragmentShader) || !/uv_pars_fragment/.test(sh.fragmentShader) || !/project_vertex/.test(sh.vertexShader)) return;
      sh.uniforms.uRealLife = U.life; sh.uniforms.uRealClock = U.clock; sh.uniforms.uRealGrid = cell;
      sh.vertexShader = G.vertexHead + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n" + G.vertexBody);
      const deriv = renderer && renderer.capabilities && renderer.capabilities.isWebGL2;
      sh.fragmentShader = "#define REAL_PROFILE " + prof.toFixed(1) + "\n" + (deriv ? "" : "#define REAL_NO_DERIVATIVES\n") + sh.fragmentShader.replace("#include <uv_pars_fragment>", "#include <uv_pars_fragment>\n" + G.fragmentHead).replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n" + G.fragmentBody);
    };
    m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(m) : "") + "|realwin" + prof; };
    m.needsUpdate = true;
  }
  function patchFacades() {
    if (typeof facadeCache === "undefined") return 0;
    let n = 0;
    for (const style of Object.keys(facadeCache)) { const e = facadeCache[style]; if (e && e.mats && e.mats[0] && !patched.has(e.mats[0])) { patchMaterial(e.mats[0], style); n++; } }
    return n;
  }
  // per material: how many metres of facade one unit of its texture coordinates covers (it changes when a photograph replaces the
  // drawn texture), so a lit cell lines up with the windows and buildings don't all share one pattern
  function updateWindows() {
    const E = RL.engine; if (!E) return;
    const life = E.windowLife(minuteNow(), logicalDay());
    // a light breeze of change: the share drifts toward the census figure, never jumps
    const v = U.life.value, k = 0.08;
    v.x += (life.home - v.x) * k; v.y += (life.office - v.y) * k; v.z += (life.shop - v.z) * k; v.w += (life.civic - v.w) * k;
    U.clock.value.set(performance.now() / 1000 % 10000, logicalDay() % 997);
    for (const m of patched) {
      const R = m.userData.realWin, spec = typeof FACADE_STYLES !== "undefined" && FACADE_STYLES[R.style]; if (!spec) continue;
      const rep = m.map && m.map.repeat ? m.map.repeat : { x: 1, y: 1 }, mW = spec.cell[0] / (rep.x || 1), mH = spec.cell[1] / (rep.y || 1);
      R.cell.value.set(Math.max(1, Math.round(mW / R.cfg[0])), Math.max(1, Math.round(mH / R.cfg[1])), mW, mH);
    }
  }

  // ---- the people in a house, for the houses ----
  const placeOf = (x) => x && (x.realism || (x.purpose ? x : null));
  RL.placeAt = (x, z) => RL.ready ? RL.engine.placeAt(x, z) : null;
  // a plot's households; for a plot laid out as separate houses, one entry per house in house order (an empty house: no members)
  RL.households = (plot) => {
    if (!RL.ready || !plot) return [];
    if (plot.realismHouses) return plot.realismHouses.map(pl => pl ? (RL.engine.householdsAt(pl)[0] || { surname: "", members: [], empty: true, place: pl }) : { surname: "", members: [], empty: true });
    const pl = placeOf(plot); return pl ? RL.engine.householdsAt(pl) : [];
  };
  // one house's household, with each member's day today: wake, leave, back, sleep (minutes past midnight; null if they stay in)
  RL.householdOf = (plot, idx) => {
    if (!RL.ready || !plot) return null;
    const pl = plot.realismHouses ? plot.realismHouses[idx | 0] : placeOf(plot); if (!pl) return null;
    const hh = RL.engine.householdsAt(pl)[plot.realismHouses ? 0 : (idx | 0) % Math.max(1, pl.units)]; if (!hh) return { surname: "", members: [], empty: true, place: pl };
    const day = calDay(), P = RL.engine.planner, mod = m => m == null ? null : Math.round(m) % 1440;
    hh.members.forEach(m => {
      const plan = P.plan(m.id, day), home = m.home.index; let wake = null, sleep = null, leave = null, back = null;
      for (const sg of plan.segs) {
        if (sg.a === "sleep" && wake == null) wake = sg.t1;
        if (sg.a === "sleep" && sg.t0 > 600) sleep = sg.t0;
        if (sg.a === "travel" && sg.from === home && leave == null) leave = sg.t0;
        if (sg.a === "travel" && sg.p === home) back = sg.t1;
      }
      Object.assign(m, { wake: mod(wake), leave: mod(leave), back: mod(back), sleep: mod(sleep), atHome: (min) => { const w = RL.engine.whereAt(m.id, min == null ? minuteNow() : min, day); return w.p === home && w.a !== "travel"; } });
    });
    return hh;
  };
  RL.dressing = (plot) => { const pl = placeOf(plot); return RL.ready && pl ? RL.engine.dressing(pl, minuteNow(), calDay()) : null; };
  RL.homeLights = (hid) => RL.ready ? RL.engine.homeLights(hid, minuteNow(), calDay()) : null;
  RL.placeState = (plot) => { const pl = placeOf(plot); return RL.ready && pl ? RL.engine.placeState(pl, minuteNow(), calDay()) : null; };
  RL.status = () => {
    if (!RL.ready) return { ready: false, building: RL.building };
    const s = RL.engine.stats();
    return Object.assign(s, { today: RL.today().label, onStreet: RL.bodies.size, inScenes: RL.staged.size, props: RL.props.size, windows: { home: +U.life.value.x.toFixed(2), office: +U.life.value.y.toFixed(2), shop: +U.life.value.z.toFixed(2), civic: +U.life.value.w.toFixed(2) }, patched: patched.size, totals: RL.stats });
  };

  // ---- wiring into the game ----
  // The people's extra poses: arms up for radio exercises, a cigarette, a broom, a box carried.
  const peoplePoses = window.storyPeoplePoses;
  if (typeof peoplePoses === "function") window.storyPeoplePoses = function (make) {
    peoplePoses(make);
    make("stretch", { UpperArmR: [0, 0, 2.85], ForearmR: [0, 0, 0.25], UpperArmL: [0, 0, -2.85], ForearmL: [0, 0, -0.25], Neck: [0.12, 0, 0], Spine: [0.05, 0, 0] });
    make("smoke", { UpperArmR: [0.55, 0, 0.42], ForearmR: [0, 0, 2.25], UpperArmL: [0.45, 0, -0.32], ForearmL: [0, 0, -1.55], Neck: [0.06, 0, 0.04] });
    make("sweep", { Spine: [-0.32, 0, 0], Chest: [-0.1, 0, 0], UpperArmR: [0.95, 0, 0.18], ForearmR: [0, 0, 0.55], UpperArmL: [0.75, 0, -0.22], ForearmL: [0, 0, -0.7], Neck: [-0.12, 0, 0] });
    make("carry", { UpperArmR: [1.05, 0, 0.12], ForearmR: [0, 0, 0.95], UpperArmL: [1.05, 0, -0.12], ForearmL: [0, 0, -0.95] });
  };

  // crowds follow who is out: a lively street gets more people, a dead one fewer (never fewer than 60% of the setting)
  const pedWantedOrig = window.pedWanted;
  if (typeof pedWantedOrig === "function") window.pedWanted = function () {
    const base = pedWantedOrig.apply(this, arguments);
    if (!RL.ready || !player || !player.placed) return base;
    const want = RL.engine.streetLife(player.pos.x, player.pos.z);
    RL.life = RL.life == null ? want : RL.life + (want - RL.life) * 0.02;
    return Math.round(base * Math.max(0.6, Math.min(1.4, RL.life)));
  };
  // people come from the census first; anyone the game makes itself is given a real person's life
  const pedSpawnOrig = window.pedSpawn;
  if (typeof pedSpawnOrig === "function") window.pedSpawn = function () {
    if (RL.ready && pedNet.ready && pplLib.ready.length && Math.random() < 0.9) { try { if (spawnResident()) return true; } catch (e) { console.warn("[Konto] realism spawn:", e); } }
    const n = peds.list.length, ok = pedSpawnOrig.apply(this, arguments);
    if (ok && RL.ready && peds.list.length > n) adopt(peds.list[peds.list.length - 1], false);
    return ok;
  };
  const commuteSpawnOrig = window.commuteSpawn;
  if (typeof commuteSpawnOrig === "function") window.commuteSpawn = function () {
    const p = commuteSpawnOrig.apply(this, arguments);
    if (p && RL.ready) adopt(p, true);
    return p;
  };
  const pedRemoveOrig = window.pedRemove;
  if (typeof pedRemoveOrig === "function") window.pedRemove = function (p) {
    if (p && p.rid != null) { if (RL.bodies.get(p.rid) === p) RL.bodies.delete(p.rid); if (RL.staged.get(p.rid) === p) RL.staged.delete(p.rid); }
    return pedRemoveOrig.apply(this, arguments);
  };

  // every frame people are about: keep the local population current, a slice at a time
  const pedsTickOrig = window.pedsTick;
  let slow = 0, slower = 0;
  if (typeof pedsTickOrig === "function") window.pedsTick = function (dt) {
    try {
      if (!RL.ready) ensureBuilt(window.KONTO_PERF ? KONTO_PERF.budget("realism-build", 4) : 4);
      if (RL.ready && player && player.placed && !interior.active) {
        const E = RL.engine, m = minuteNow(), day = calDay();
        E.setWeather({ rain: rainNow() });
        E.focus(player.pos.x, player.pos.z);
        E.tick(m, day, window.KONTO_PERF ? KONTO_PERF.budget("realism", 1.5) : 1.5);
        slow -= dt; slower -= dt;
        if (slow <= 0 && pedNet.ready && pplLib.ready.length) { slow = 1.2; minder(); stageScenes(); }
        if (slower <= 0) { slower = 2.5; tendProps(); }
      }
    } catch (e) { console.warn("[Konto] realism:", e); }
    return pedsTickOrig.apply(this, arguments);
  };
  function rainNow() {
    try { const e = window.shigoto && shigoto.engine; if (e && e.weather) { const W = SHIGOTO.WEATHER[e.weather.state]; return W ? W.rain : 0; } } catch (e) { /* no weather */ }
    return 0;
  }
  // and every frame regardless (windows are seen from a car, a train, a rooftop)
  const tickOrig = window.tick;
  let winT = 0;
  if (typeof tickOrig === "function") window.tick = function (dt) {
    const r = tickOrig.apply(this, arguments);
    try {
      if (RL.ready) {
        if (patched.size < 8) patchFacades();
        winT -= dt; if (winT <= 0) { winT = 0.25; updateWindows(); }
        U.clock.value.x = performance.now() / 1000 % 10000;
        RL.tagT = (RL.tagT || 0) - dt; if (RL.tagT <= 0) { RL.tagT = 0.3; shopTag(); }
      } else if (typeof world !== "undefined" && world && world.cities && player && player.placed && !RL.gen) ensureBuilt(3);
    } catch (e) { console.warn("[Konto] realism:", e); }
    return r;
  };

  // ---- built behind the loading screen ----
  (window.PERSIST_EXTRA = window.PERSIST_EXTRA || []).push(function (P, facts) {
    P.stage("realism", 0.8, async ctx => {
      if (RL.ready && RL.forWorld === world) return { cached: true };
      RL.gen = buildSteps(); RL.genFor = world; RL.building = true; clearAll();
      let t0 = performance.now();
      for (;;) { const r = RL.gen.next(); if (r.done) break; if (performance.now() - t0 > 12) { await ctx.breathe(); t0 = performance.now(); } }
      RL.gen = null;
      const n = patchFacades();
      updateWindows();
      const s = RL.engine.stats();
      facts.realism = { places: s.places, people: s.people, households: s.households, windows: n };
      return facts.realism;
    }, { label: "Giving every home its family and every family its day" });
    P.check("world", "the city's people and their days", () => {
      const f = facts.realism; if (!f) return { ok: true, detail: "built in play" };
      if (!f.people) return "nobody lives in the city: " + JSON.stringify(f);
      return { ok: true, detail: f.people + " people in " + f.households + " households across " + f.places + " places; " + f.windows + " facade styles light by who is home" };
    });
  });

  // console
  if (window.shigoto && typeof shigoto === "object") shigoto.realism = () => RL.status();
  else window.addEventListener("load", () => { if (window.shigoto) shigoto.realism = () => RL.status(); });
  console.log("[Konto] realism " + RL.version + " · every home a family, every person a day of their own");
})();
