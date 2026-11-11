// The realism engine: a city that is lived in.
//
// It takes the host's plots and stations, gives every plot a purpose (Places), fills every home with households and every
// workplace with the people who work there (Census), and gives each of those people a day (Routines) that is the same every
// time it is asked for. From that it answers the questions a living world needs answered:
//
//   who is out on the street near here right now, doing what, coming from where and going to where   (peopleOut / pickWalker)
//   what is happening at this place now: open, preparing, busy, a queue, a smoke break, a send-off  (scenes, placeState)
//   how many windows are lit in homes, offices and shops at this minute, from who is actually in      (windowLife)
//   who lives in this house, what their front step looks like, which rooms have the light on          (household / dressing / homeLights)
//
// Nothing in here knows about Three.js, Seiko or Tōkonto. The host feeds it plain data and reads plain data back.

import { hash32, r01, clamp, strSeed } from "./Rng.js";
import { Calendar, sunTimes } from "./Calendar.js";
import { Place, PURPOSES } from "./Places.js";
import { Census, ROLES, TRAIT } from "./Census.js";
import { Planner, ACTS, ACT_LABEL, DAY_START } from "./Routines.js";

export const REALISM_VERSION = "1.0.0";
// activities that are given up when it rains (they stay in)
const FAIR_WEATHER = { stroll: 1, bench: 1, garden: 1, chat: 1, play: 1, taiso: 1, jog: 1 };

export class RealismEngine {
  constructor(opts) {
    opts = opts || {};
    this.seed = typeof opts.seed === "string" ? strSeed(opts.seed) : (opts.seed >>> 0) || 1964;
    this.cal = new Calendar({ epoch: opts.epoch, seed: this.seed });
    this.places = []; this.stations = [];
    this.census = null; this.planner = null;
    this.cell = 120; this.grid = new Map(); this.byPurpose = new Map();
    this.weather = { rain: 0 };
    this.local = { x: NaN, z: NaN, ids: [], out: [], scan: 0, at: -1, day: -1, r: opts.localRadius || 420, cap: opts.localCap || 3600 };
    this.windowSample = null; this.windowCache = { key: "", v: null };
    this.listeners = {};
    this.ready = false;
  }
  on(name, fn) { (this.listeners[name] || (this.listeners[name] = [])).push(fn); return () => { const L = this.listeners[name]; const k = L.indexOf(fn); if (k >= 0) L.splice(k, 1); }; }
  emit(name, ev) { (this.listeners[name] || []).forEach(f => { try { f(ev); } catch (e) { /* a listener's problem */ } }); }

  // ---- building ----
  // plots: [{ id, kind, x, z, w, d, yaw, floors, ward, district, city, village?, door?: [x, z] }], stations: [{ x, z, name }]
  *buildSteps(plots, stations) {
    this.stations = (stations || []).map(s => ({ x: s.x, z: s.z, name: s.name || "" }));
    this.places = plots.map((p, k) => new Place(p, this.seed, k));
    for (const pl of this.places) {
      pl.dx = pl.door ? pl.door[0] : pl.x; pl.dz = pl.door ? pl.door[1] : pl.z;
      const key = this.key(pl.x, pl.z); (this.grid.get(key) || this.grid.set(key, []).get(key)).push(pl.index);
      const add = (pp) => { (this.byPurpose.get(pp) || this.byPurpose.set(pp, []).get(pp)).push(pl.index); };
      add(pl.purpose); if (pl.groundShop) add(pl.groundShop);
    }
    yield 0.05;
    this.census = new Census(this.places, this.seed);
    for (const k of this.census.steps()) yield 0.05 + k * 0.9;
    for (const pl of this.places) if (pl.purpose === "office" && !pl.company) pl.company = null;
    this.planner = new Planner({ places: this.places, census: this.census, cal: this.cal, favourite: (i, P, x, z, r) => this.favourite(i, P, x, z, r), station: (x, z) => this.station(x, z) });
    this.planner.max = this.local.cap * 2 + 2000;
    this.buildWindowSample();
    this.ready = true;
    yield 1;
  }
  build(plots, stations) { for (const _ of this.buildSteps(plots, stations)) { /* all at once */ } return this; }
  key(x, z) { return Math.floor(x / this.cell) + "," + Math.floor(z / this.cell); }

  // ---- finding places ----
  placesNear(x, z, r, filter) {
    const out = [], c = this.cell, i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const L = this.grid.get(i + "," + j); if (!L) continue;
      for (const k of L) { const p = this.places[k]; if (Math.hypot(p.x - x, p.z - z) <= r && (!filter || filter(p))) out.push(p); }
    }
    return out;
  }
  placeAt(x, z) {
    let best = null, bd = 1e9;
    for (const p of this.placesNear(x, z, 60)) {
      const a = (p.yaw || 0) * Math.PI / 180, dx = x - p.x, dz = z - p.z, lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
      const inside = Math.abs(lx) <= (p.w || 10) / 2 + 1 && Math.abs(lz) <= (p.d || 10) / 2 + 1, d = Math.hypot(dx, dz);
      if (inside && d < bd) { bd = d; best = p; }
    }
    return best;
  }
  // A person's favourite of a kind of place near somewhere: not always the nearest (people have their ramen shop), but one of
  // the three nearest, the same one every time.
  favourite(i, purposes, x, z, r) {
    const near = [];
    for (const pp of purposes) {
      const L = this.byPurpose.get(pp); if (!L) continue;
      if (L.length > 60) {
        for (const p of this.placesNear(x, z, r, q => q.purpose === pp || q.groundShop === pp)) near.push([Math.hypot(p.dx - x, p.dz - z), p.index]);
      } else for (const k of L) { const p = this.places[k], d = Math.hypot(p.dx - x, p.dz - z); if (d <= r) near.push([d, k]); }
    }
    if (!near.length) return -1;
    near.sort((a, b) => a[0] - b[0]);
    const k = Math.min(near.length, 3), pickK = hash32(this.seed, i, purposes.length * 31 + purposes[0].length, Math.round(x / 50) ^ Math.round(z / 50) * 7) % k;
    return near[pickK][1];
  }
  station(x, z) {
    let best = null, bd = 1e18;
    for (const s of this.stations) { const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z); if (d < bd) { bd = d; best = s; } }
    return best && bd < 2600 * 2600 ? best : null;
  }

  // ---- time ----
  // the logical day (it turns over at four in the morning, when the city is quietest) and the minute
  dayOf(absMinutes) { return Math.floor((absMinutes - DAY_START) / 1440); }
  info(day) { return this.cal.info(day); }
  sun(day) { return sunTimes(this.cal, day); }
  setWeather(w) { this.weather = Object.assign(this.weather, w || {}); }

  // Where person i is at this minute on this (calendar) day, with the weather applied.
  whereAt(i, minute, day) {
    const r = this.planner.at(i, minute, day);
    if (r.a in FAIR_WEATHER && this.weather.rain > 0.35 && r01(this.seed, i, day, 77) < 0.85) return { a: "home", p: this.census.home[i], seg: r.seg, out: false, rained: true };
    return r;
  }
  person(i) { return this.census.person(i); }
  // "Kenji Watanabe, 42 · Salaryman at Sōwa Trading · on the way home"
  describe(i, minute, day) {
    const p = this.census.person(i), w = this.whereAt(i, minute, day);
    let doing = ACT_LABEL[w.a] || w.a;
    if (w.a === "travel" && w.travel) {
      const to = this.places[w.travel.to];
      doing = to.index === p.home.index ? "on the way home" : to === p.work ? (p.role === "schoolchild" || p.role === "student" ? "on the way to school" : "on the way to work") : "on the way to " + (to.name || (to.company ? to.company : PURPOSES[to.purpose].name).toLowerCase());
      if (w.travel.toStation) doing += " (to the station)";
    } else if (w.p >= 0 && this.places[w.p] && w.a !== "home" && w.a !== "sleep") {
      const pl = this.places[w.p]; if (pl.name && (w.a === "queue" || w.a === "drinks" || w.a === "lunch" || w.a === "shop")) doing += " at " + pl.name;
    }
    return { name: p.name, age: p.age, job: p.roleLabel, doing, temper: p.temper, traits: p.traits, female: p.female, business: p.business, line: p.name + ", " + p.age + " · " + p.roleLabel, person: p, where: w };
  }

  // ---- the people out near the player ----
  // focus() picks the population that could be on these streets (who lives and works within the radius); tick() works through
  // them a slice at a time (budgetMs), keeping a list of who is out of doors now and where.
  focus(x, z) {
    const L = this.local;
    if (Number.isFinite(L.x) && Math.hypot(x - L.x, z - L.z) < L.r * 0.3) return false;
    L.x = x; L.z = z;
    const ids = [], C = this.census;
    for (const p of this.placesNear(x, z, L.r)) {
      for (let i = p.resFirst; i < p.resEnd; i++) ids.push(i);
      const s = C.workStart[p.index], e = C.workStart[p.index + 1];
      for (let k = s; k < e; k++) ids.push(C.workList[k]);
    }
    // a big tower's four thousand desks would crowd out the street's own people: keep a fair sample
    let sel = ids;
    if (ids.length > L.cap) { const step = ids.length / L.cap; sel = []; for (let k = 0; k < L.cap; k++) sel.push(ids[Math.floor(k * step)]); }
    L.ids = Array.from(new Set(sel)); L.scan = 0; L.fresh = [];
    return true;
  }
  tick(minute, day, budgetMs, now) {
    const L = this.local; if (!L.ids.length) return;
    const clock = now || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    const t0 = clock(), budget = budgetMs == null ? 2 : budgetMs;
    if (L.scan === 0) L.fresh = [];
    let n = 0;
    while (L.scan < L.ids.length) {
      const i = L.ids[L.scan++], w = this.whereAt(i, minute, day);
      if (w.out) L.fresh.push({ i, w });
      if ((++n & 3) === 0 && clock() - t0 > budget) break;
    }
    if (L.scan >= L.ids.length) { L.out = L.fresh; L.fresh = []; L.scan = 0; L.at = minute; L.day = day; L.passes = (L.passes || 0) + 1; }
  }
  // everyone out of doors near (x, z): [{ i, w, x, z }] (position is where they would be: on their walk, or at the place)
  peopleOut(x, z, r) {
    const out = [];
    for (const e of this.local.out) {
      const pos = this.posOf(e.w); if (!pos) continue;
      if (Math.hypot(pos[0] - x, pos[1] - z) <= r) out.push({ i: e.i, w: e.w, x: pos[0], z: pos[1] });
    }
    return out;
  }
  posOf(w) {
    if (w.travel) return Number.isFinite(w.travel.x) && w.travel.leg === "walk" ? [w.travel.x, w.travel.z] : null;
    const p = this.places[w.p]; if (!p) return null;
    return [p.dx, p.dz];
  }
  // How lively the street is compared with an ordinary afternoon (0.4 .. 1.6), for the host's crowd sizes.
  streetLife(x, z) {
    const near = this.peopleOut(x, z, 220).length, pop = this.local.ids.length;
    if (!pop || this.local.passes == null) return 1;
    const expect = Math.max(4, pop * 0.035);
    return clamp(0.4 + near / expect * 0.6, 0.4, 1.6);
  }

  // ---- scenes: people out at a place, grouped so the host can stage them ----
  // [{ id, kind, place, people: [i...], x, z }]: kinds are the activities (taiso, smoke, queue, chat, garbage, sweep, bench, shrine, ...)
  scenes(x, z, r) {
    const groups = new Map();
    for (const e of this.peopleOut(x, z, r)) {
      if (e.w.a === "travel" || e.w.a === "walk_dog" || e.w.a === "jog" || e.w.a === "stroll") continue;
      const k = e.w.a + ":" + e.w.p;
      const g = groups.get(k) || groups.set(k, { id: k, kind: e.w.a, place: this.places[e.w.p], people: [], x: e.x, z: e.z }).get(k);
      g.people.push(e.i);
    }
    return [...groups.values()];
  }
  // what the front of a place looks like now (open/preparing/closing/closed, busy) and the props of the hour
  placeState(place, minute, day) {
    const info = this.cal.info(day), s = place.state(minute, info);
    s.hours = place.hoursText(); s.name = place.name || place.company || PURPOSES[place.purpose].name;
    // deliveries: food shops get theirs before they open
    s.delivery = /konbini|ramen|teishoku|soba|izakaya|bakery|bento|supermarket|greengrocer|fishmonger|butcher|cafe/.test(place.purpose) && minute >= place.open - 120 && minute < place.open + (place.purpose === "konbini" ? 600 : 30) && (hash32(this.seed, place.id | 0, day, 41) % 3 === 0 || place.purpose === "konbini" && minute % 240 < 30);
    return s;
  }
  // Rubbish bags: on a ward's collection days they go out at the collection point under a crow net from about six, and the truck
  // takes them around half nine (the host draws the pile: realism-hook.js propGarbage).
  garbageAt(place, minute, day) {
    const kind = this.cal.garbage(place.ward | 0, day);
    if (kind === "none") return null;
    const pickup = 540 + (hash32(this.seed, place.ward | 0, day, 43) % 90);
    if (minute < 330 || minute > pickup) return null;
    return { kind, pickup, bags: Math.min(14, Math.round((minute - 330) / (pickup - 330) * 6 + 2 + (place.units || 1) * 0.2)) };
  }

  // ---- lit windows ----
  // A fixed sample of households and office workers, walked through their routines: the share of homes with somebody home and
  // awake, of office desks still occupied, of shops and public buildings open. The host's window shader lights that share.
  buildWindowSample() {
    const C = this.census, homes = [], desks = [], shops = [], civic = [];
    const H = C.hhPlace.length;
    for (let k = 0; k < Math.min(360, H); k++) homes.push(Math.floor((k + 0.5) * H / Math.min(360, H)));
    for (let i = 0, step = Math.max(1, Math.floor(C.n / 3000)); i < C.n && desks.length < 320; i += step) { const w = C.work[i]; if (w >= 0 && this.places[w].purpose === "office") desks.push(i); }
    for (const p of this.places) { if (p.def && p.def.staff && !p.home && p.purpose !== "park" && p.purpose !== "parking") (/wardoffice|library|school|hospital|community|university|post/.test(p.purpose) ? civic : shops).push(p.index); }
    this.windowSample = { homes, desks, shops: shops.filter((_, k) => k % Math.max(1, Math.floor(shops.length / 300)) === 0), civic };
  }
  // { home, office, shop, civic } in 0..1 at this minute, plus the day (for the shader's per-window shuffle)
  windowLife(minute, day) {
    const key = day + ":" + Math.floor(minute / 4);
    if (this.windowCache.key === key) return this.windowCache.v;
    const S = this.windowSample, C = this.census, P = this.places, info = this.cal.info(day);
    if (!S) return { home: 0.5, office: 0.4, shop: 0.6, civic: 0.3, day };
    let lit = 0;
    for (const h of S.homes) {
      const f = C.hhFirst[h], n = C.hhCount[h];
      for (let i = f; i < f + n; i++) { const w = this.planner.at(i, minute, day); if (w.a === "home" || (w.a !== "sleep" && w.a !== "travel" && w.p === C.home[i] && ACTS[w.a] === "inside")) { lit++; break; } }
    }
    let at = 0; for (const i of S.desks) { const w = this.planner.at(i, minute, day); if (w.a === "work" || w.a === "smoke") at++; }
    let open = 0; for (const k of S.shops) if (P[k].isOpen(minute, info)) open++;
    let copen = 0; for (const k of S.civic) if (P[k].isOpen(minute, info)) copen++;
    const v = {
      // vacant flats, people in the back room: never every window. Insomniacs and night shifts: never none.
      home: clamp(lit / Math.max(1, S.homes.length) * 0.88 + 0.03, 0.03, 0.92),
      office: clamp(at / Math.max(1, S.desks.length) * 0.95 + (info.offWork ? 0.02 : 0.04), 0.02, 0.97),
      shop: clamp(open / Math.max(1, S.shops.length), 0.04, 1),
      civic: clamp(copen / Math.max(1, S.civic.length) * 0.9 + 0.05, 0.05, 0.95),
      day
    };
    this.windowCache = { key, v };
    return v;
  }

  // ---- for houses: who lives here, what it looks like from the street, which rooms are lit ----
  householdsAt(place) { return this.census.householdsOf(place); }
  // Things a house's front would show because of who lives there and what they are doing today.
  dressing(place, minute, day) {
    const C = this.census, info = this.cal.info(day), out = { nameplates: [], bikes: 0, childBikes: 0, car: false, dogHouse: false, plants: 0, laundry: false, futons: false, umbrellas: 0, shoes: 0, mailboxes: Math.max(1, place.units), letters: 0, garden: null, kamidana: false, lightsOn: 0, unitsHome: 0 };
    const dry = (this.weather.rain || 0) < 0.15;
    for (let h = place.hhFirst; h < place.hhEnd; h++) {
      const f = C.hhFirst[h], n = C.hhCount[h], hh = C.household(h);
      out.nameplates.push(hh.surname);
      let home = 0, awake = 0, homemaker = false, kids = 0;
      for (let i = f; i < f + n; i++) {
        const w = minute == null ? null : this.planner.at(i, minute, day), fl = C.flags[i], role = ROLES[C.role[i]];
        if (fl & TRAIT.cyclist && (!w || w.p === C.home[i])) out.bikes++;
        if (role === "schoolchild" && C.age[i] < 12) kids++;
        if (fl & TRAIT.car) out.car = true;
        if (fl & TRAIT.dog) out.dogHouse = place.kind === "houses";
        if (fl & TRAIT.gardener) { out.plants += 6; out.garden = C.age[i] > 60 ? "vegetables" : "flowers"; }
        if (fl & TRAIT.devout) out.kamidana = true;
        if (role === "homemaker" || role === "retiree") homemaker = true;
        if (w && w.p === C.home[i] && w.a !== "travel") { home++; out.shoes += 1; if (w.a !== "sleep") awake++; }
      }
      out.plants += hash32(this.seed, h, 51) % 4;
      out.childBikes += kids;
      out.umbrellas += n;
      // washing goes out on dry mornings in homes with someone home in the day; futons are aired on fine weekends
      if (dry && homemaker && minute >= 480 && minute < 900 && hash32(this.seed, h, day, 52) % 3 !== 0) out.laundry = true;
      if (dry && info.weekend && minute >= 540 && minute < 840 && hash32(this.seed, h, day, 53) % 4 === 0) out.futons = true;
      if (home) out.unitsHome++; if (awake) out.lightsOn++;
      out.letters += hash32(this.seed, h, day, 54) % 3;
    }
    return out;
  }
  // Rooms lit in one household now: genkan, living, kitchen, bedroom(s), bath. For a house's own windows.
  homeLights(householdId, minute, day) {
    const C = this.census, f = C.hhFirst[householdId], n = C.hhCount[householdId], R = { genkan: false, living: false, kitchen: false, bedroom: false, bath: false, tv: false };
    const dark = (() => { const s = this.sun(day); return minute < s.rise + 20 || minute > s.set - 30; })();
    for (let i = f; i < f + n; i++) {
      const w = this.planner.at(i, minute, day); if (w.p !== C.home[i] || w.a === "travel") continue;
      if (w.a === "sleep") continue;
      const r = r01(this.seed, i, Math.floor(minute / 20), 55);
      if (minute >= 1020 && minute < 1170 && r < 0.6) R.kitchen = true;
      else if (minute >= 360 && minute < 480 && r < 0.5) R.kitchen = true;
      if (r < 0.65) R.living = true; else R.bedroom = true;
      if (minute >= 1200 && r > 0.8) R.bath = true;
      if (R.living && r < 0.4) R.tv = true;
      // someone just in or going out
      const s = w.seg; if (s && (minute - s.t0 < 3 || s.t1 - minute < 3)) R.genkan = true;
    }
    if (!dark) for (const k in R) if (k !== "tv") R[k] = R[k] && k === "bath";
    return R;
  }

  stats() {
    const s = this.census ? this.census.stats() : {};
    const kinds = {}; for (const p of this.places) kinds[p.purpose] = (kinds[p.purpose] || 0) + 1;
    return Object.assign(s, { places: this.places.length, purposes: kinds, stations: this.stations.length, local: this.local.ids.length, out: this.local.out.length });
  }
}

// ---- the window shader: lights a share of windows by the census, one window at a time ----
// The host puts fragmentHead after uv_pars_fragment (it reads vUv), adds the varyings, and calls realWindow() on its facade's emissive, with uRealGrid = (cells per texture unit across, up,
// metres per texture unit across, up). Define REAL_NO_DERIVATIVES on WebGL1 without OES_standard_derivatives. Profiles: 0 home, 1 office, 2 shop (homes over it), 3 civic, 4 dark (storehouses). Per window: one hash decides whether it is among the share lit tonight (so windows go out one by one as people
// go to bed, and come on one by one as they come home), another its light (warm bulb, daylight fluorescent, the blue flicker of
// a television).
export const WINDOW_LIFE_GLSL = {
  vertexHead: "varying vec3 vRealPos;\nvarying vec3 vRealN;\n",
  vertexBody: `
  {
    vec4 rwp = vec4(transformed, 1.0);
    vec3 rwn = objectNormal;
    #ifdef USE_INSTANCING
      rwp = instanceMatrix * rwp; rwn = mat3(instanceMatrix) * rwn;
    #endif
    rwp = modelMatrix * rwp;
    vRealPos = rwp.xyz; vRealN = normalize(mat3(modelMatrix) * rwn);
  }`,
  fragmentHead: `varying vec3 vRealPos;
varying vec3 vRealN;
uniform vec4 uRealLife;
uniform vec2 uRealClock;
uniform vec4 uRealGrid;
float realHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
vec3 realWindow(float profile) {
  vec3 n = normalize(vRealN);
  if (profile > 3.5) return vec3(0.0);
  if (abs(n.y) > 0.6) return vec3(1.0);
#ifdef USE_UV
  bool xFace = abs(n.x) > abs(n.z);
  float along = xFace ? vRealPos.z : vRealPos.x;
  float face = xFace ? vRealPos.x : vRealPos.z;
  // the wall's own corner, found by walking back along u: one id per building face, so no two buildings share a pattern
#ifdef REAL_NO_DERIVATIVES
  float s = 1.0;
#else
  float s = sign(dFdx(along) * dFdx(vUv.x) + dFdy(along) * dFdy(vUv.x));
  if (s == 0.0) s = 1.0;
#endif
  float corner = floor((along - s * vUv.x * uRealGrid.z) * 0.25 + 0.5);
  // one cell is about one room: uRealGrid.xy windows per unit of the facade's texture coordinates
  vec2 cell = floor(vUv * uRealGrid.xy);
  vec3 id = vec3(cell.x + corner * 7.13, cell.y, floor(face * 0.5) + (xFace ? 0.0 : 517.0));
  float h = realHash(id), h2 = realHash(id.yzx + 19.7);
  float share = profile < 0.5 ? uRealLife.x : profile < 1.5 ? uRealLife.y : profile < 2.5 ? (cell.y >= 1.0 ? uRealLife.x : uRealLife.z) : uRealLife.w;
  // offices empty floor by floor more than desk by desk
  if (profile > 0.5 && profile < 1.5) h = mix(h, realHash(vec3(cell.y, corner, floor(face * 0.5))), 0.7);
  float lit = step(fract(h + uRealClock.y * 0.6180339), share);
  vec3 warm = vec3(1.0, 0.80, 0.56), cool = vec3(0.86, 0.94, 1.0);
  bool homeLike = profile < 0.5 || (profile > 1.5 && profile < 2.5 && cell.y >= 1.0);
  vec3 tint = homeLike ? mix(warm, cool, step(0.58, h2)) : mix(cool, warm, step(0.8, h2));
  float tv = homeLike ? step(0.86, h2) : 0.0;
  float flick = 0.55 + 0.45 * sin(uRealClock.x * 6.1 + h * 40.0) * sin(uRealClock.x * 1.7 + h2 * 23.0);
  vec3 c = mix(vec3(1.0), tint, 0.65);
  c = mix(c, vec3(0.55, 0.68, 1.0) * (0.45 + 0.4 * flick), tv);
  return c * lit * (0.75 + 0.5 * h2);
#else
  return vec3(1.0);
#endif
}
`,
  // multiply the emissive by this after emissivemap_fragment
  fragmentBody: "totalEmissiveRadiance *= realWindow(REAL_PROFILE);"
};
