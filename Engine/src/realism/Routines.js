// Routines: a whole day for one person, worked out from who they are, what kind of day it is and where their life is.
//
// A salaryman wakes at ten past six, leaves at five to seven, walks to the station, rides in, is at his desk by twenty to nine,
// smokes at twenty past ten behind the building, queues for ramen at noon, stays till the section chief goes, drinks on Fridays
// and on payday, misses the last train once a month. A retired widow is in the park for radio exercises at half past six, at
// the shrine at nine, at the supermarket for the four o'clock time sale, in bed by nine. Each person's day is a list of
// segments { a: activity, p: place index, t0, t1 } with travel between them, and it is the same every time it is asked for.
//
// Plan minutes run from 04:00 (240) to 04:00 the next morning (1680): the small hours belong to the evening before.

import { hash32, r01, rng, clamp } from "./Rng.js";
import { ROLES, TRAIT } from "./Census.js";

export const DAY_START = 240;
const WALK = 78;          // metres a minute, a city walking pace
const TRAIN = 650;        // metres a minute on the train, waits and changes included
const BIKE = 220;

// Activities: where they happen and whether you would see them from the street.
// out: on the street or in the open near the place; inside: in the building; away: nowhere near (on the train, out of town)
export const ACTS = {
  sleep: "inside", home: "inside", work: "inside", school: "inside", lunch: "inside", shop: "inside", drinks: "inside", gym: "inside", clinic: "inside",
  library: "inside", pachinko: "inside", bath: "inside", karaoke: "inside", cafe: "inside", cram: "inside", konbini: "inside",
  travel: "out", smoke: "out", walk_dog: "out", jog: "out", taiso: "out", stroll: "out", bench: "out", garden: "out", chat: "out", garbage: "out",
  shrine: "out", queue: "out", sweep: "out", play: "out", away: "away"
};
export const ACT_LABEL = {
  sleep: "asleep", home: "at home", work: "at work", school: "at school", lunch: "on lunch", shop: "shopping", drinks: "out drinking", gym: "at the gym", clinic: "at the clinic",
  library: "at the library", pachinko: "playing pachinko", bath: "at the bathhouse", karaoke: "at karaoke", cafe: "having coffee", cram: "at cram school", konbini: "at the konbini",
  travel: "on the way", smoke: "on a smoke break", walk_dog: "walking the dog", jog: "out for a run", taiso: "doing radio exercises", stroll: "out for a walk", bench: "sitting in the park",
  garden: "tending the garden", chat: "chatting with the neighbours", garbage: "putting the rubbish out", shrine: "praying at the shrine", queue: "queueing", sweep: "sweeping the shopfront", play: "playing", away: "out of town"
};

// The world a routine is planned in: the engine passes these in.
//   world.places, world.census, world.cal (Calendar), world.favourite(i, purposes, x, z, radius) -> place index or -1,
//   world.station(x, z) -> { x, z, name } nearest station or null
export class Planner {
  constructor(world) { this.w = world; this.cache = new Map(); this.max = 6000; }
  plan(i, day) {
    const key = i * 4096 + (day & 4095);
    const hit = this.cache.get(key);
    if (hit) { this.cache.delete(key); this.cache.set(key, hit); return hit; }
    const p = this.build(i, day);
    this.cache.set(key, p);
    if (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value);
    return p;
  }
  // where this person is at this minute: { a, p, seg, travel?: { from, to, mode, k, leg, x, z } }
  at(i, minute, day) {
    let t = minute, d = day;
    if (t < DAY_START) { t += 1440; d -= 1; }
    const plan = this.plan(i, d);
    for (const s of plan.segs) if (t >= s.t0 && t < s.t1) return this.resolve(s, t);
    return { a: "sleep", p: plan.home, seg: null };
  }
  resolve(s, t) {
    if (s.a !== "travel") return { a: s.a, p: s.p, seg: s, out: ACTS[s.a] === "out" };
    const k = (t - s.t0) / Math.max(1, s.t1 - s.t0), P = this.w.places, A = P[s.from], B = P[s.p];
    const tr = { from: s.from, to: s.p, mode: s.mode, k, leg: "walk", x: 0, z: 0 };
    if (s.mode === "train" && s.st1 && s.st2) {
      // walk to the station, ride, walk from the station
      const w1 = s.w1 / s.dur, w2 = s.w2 / s.dur;
      if (k < w1) { const u = k / w1; tr.leg = "walk"; tr.x = A.dx + (s.st1.x - A.dx) * u; tr.z = A.dz + (s.st1.z - A.dz) * u; tr.ax = A.dx; tr.az = A.dz; tr.bx = s.st1.x; tr.bz = s.st1.z; tr.toStation = true; }
      else if (k > 1 - w2) { const u = (k - (1 - w2)) / w2; tr.leg = "walk"; tr.x = s.st2.x + (B.dx - s.st2.x) * u; tr.z = s.st2.z + (B.dz - s.st2.z) * u; tr.ax = s.st2.x; tr.az = s.st2.z; tr.bx = B.dx; tr.bz = B.dz; tr.fromStation = true; }
      else { tr.leg = "train"; tr.x = NaN; tr.z = NaN; }
    } else {
      tr.leg = s.mode; tr.x = A.dx + (B.dx - A.dx) * k; tr.z = A.dz + (B.dz - A.dz) * k; tr.ax = A.dx; tr.az = A.dz; tr.bx = B.dx; tr.bz = B.dz;
    }
    return { a: "travel", p: s.p, seg: s, travel: tr, out: tr.leg === "walk" };
  }

  build(i, day) {
    const W = this.w, C = W.census, P = W.places, info = W.cal.info(day);
    const R = rng(hash32(C.seed, i, day, 5150)), week = rng(hash32(C.seed, i, Math.floor((day + 3) / 7), 5151));   // some things hold for the week
    const role = ROLES[C.role[i]], age = C.age[i], flags = C.flags[i], has = t => !!(flags & TRAIT[t]);
    const home = C.home[i], H = P[home], work = C.work[i];
    const segs = [];
    let t = DAY_START, at = home;
    const stay = (a, until, p) => { until = Math.max(t, Math.round(until)); if (until > t) segs.push({ a, p: p == null ? at : p, t0: t, t1: until }); t = until; };
    const go = (to, mode) => {
      if (to == null || to < 0 || to === at) return false;
      const tr = this.travel(at, to, mode, flags);
      segs.push(Object.assign({ a: "travel", from: at, p: to, t0: t, t1: t + tr.dur }, tr));
      t += tr.dur; at = to; return true;
    };
    const fav = (purposes, x, z, r) => W.favourite(i, purposes, x, z, r);
    const wake = (base, spread) => base + (R() - 0.35) * spread + (has("earlyBird") ? -25 : 0) + (has("nightOwl") ? 40 : 0);
    const garbageDay = W.cal.garbage(H.ward | 0, day) !== "none";
    const rain = 0;   // weather is applied when the plan is read, not when it is made (see Realism.whereAt)
    const out = (a, mins, p) => { const s = t; stay(a, s + mins, p); };
    const walkDog = (mins) => { if (has("dog")) { const park = fav(["park"], H.dx, H.dz, 500); if (park >= 0) { go(park, "walk"); out("walk_dog", mins); go(home, "walk"); } else out("walk_dog", mins, home); } };

    const sleepUntil = (w) => stay("sleep", w, home);
    const bed = (b) => { if (at !== home) go(home); stay("home", b); stay("sleep", DAY_START + 1440, home); };
    const workday = !info.offWork;

    if (role === "infant") { sleepUntil(wake(390, 30)); stay("home", DAY_START + 1440 - 120); stay("sleep", DAY_START + 1440); return finish(); }

    if (role === "salaryman" || role === "officeworker" || role === "civil" || role === "teacher") {
      if (workday && work >= 0) {
        const tr = this.travel(home, work, null, flags), arrive = (role === "teacher" ? 470 : 500) + R() * 40 - (R() < 0.08 ? 25 : 0);
        const leave = arrive - tr.dur, up = Math.min(leave - 30 - R() * 25, wake(375, 30));
        sleepUntil(up);
        if (has("dog") && up < leave - 45) { walkDog(15 + R() * 10); }
        if (garbageDay && R() < 0.22) { out("garbage", 4, home); }
        stay("home", leave);
        go(work);
        const Wp = P[work];
        if (has("smoker")) { stay("work", 620 + R() * 15); out("smoke", 8 + R() * 6); }
        stay("work", 715 + R() * 15);
        // lunch: out to a counter near the office, or a bentō at the desk
        if (R() < 0.62) { const l = fav(["ramen", "teishoku", "soba", "bento", "cafe", "konbini"], Wp.dx, Wp.dz, 450); if (l >= 0) { go(l, "walk"); if (P[l].def.queue && R() < 0.6) out("queue", 4 + R() * 12); stay("lunch", t + 25 + R() * 20); go(work, "walk"); } }
        if (has("smoker")) { stay("work", 900 + R() * 20); out("smoke", 8 + R() * 6); }
        const ot = role === "teacher" ? 1110 + R() * 90 : role === "civil" ? 1050 + R() * 70 : (role === "salaryman" ? 1080 : 1050) + R() * 60 + R() * (Wp.overtime || 0.4) * (role === "salaryman" ? 210 : 120);
        stay("work", ot - (info.beforeOff ? 25 : 0));
        // after work
        let drinkP = (has("drinker") ? 0.22 : 0.05) + (info.beforeOff ? 0.3 : 0) + (info.payday ? 0.15 : 0) + (info.bonus ? 0.1 : 0) + (has("sociable") ? 0.08 : 0);
        if (role === "teacher") drinkP *= 0.5;
        if (R() < drinkP) {
          const near = R() < 0.65 ? Wp : H;
          const iz = fav(["izakaya"], near.dx, near.dz, 700);
          if (iz >= 0) {
            go(iz); stay("drinks", t + 80 + R() * 100);
            if (R() < 0.3) { const second = fav(["bar", "snack", "karaoke"], P[iz].dx, P[iz].dz, 500); if (second >= 0) { go(second, "walk"); stay(P[second].purpose === "karaoke" ? "karaoke" : "drinks", t + 50 + R() * 70); } }
            // the last train: miss it and it is a taxi, or a capsule, or the karaoke box until the first one
          }
        } else if (has("gym") && week() < 0.45) { const g = fav(["gym"], Wp.dx, Wp.dz, 900); if (g >= 0) { go(g); stay("gym", t + 60 + R() * 30); } }
        if (at !== home) go(home);
        if (R() < 0.3) { const k = fav(["konbini", "supermarket"], H.dx, H.dz, 300); if (k >= 0) { go(k, "walk"); stay("konbini", t + 5 + R() * 10); go(home, "walk"); } }
        if (has("dog") && t < 1290) walkDog(15 + R() * 10);
        bed(Math.max(t + 50, 1410 + R() * 60 + (info.beforeOff ? 30 : 0)));
      } else {
        weekend();
      }
      return finish();
    }

    if (role === "retiree" || role === "homemaker" || role === "idle") {
      if (role === "idle") {
        sleepUntil(wake(600, 120)); stay("home", 780 + R() * 60);
        const k = fav(["konbini"], H.dx, H.dz, 400); if (k >= 0) { go(k, "walk"); stay("konbini", t + 8 + R() * 10); go(home, "walk"); }
        if (has("gambler") && R() < 0.5) { const pk = fav(["pachinko"], H.dx, H.dz, 1500); if (pk >= 0) { go(pk); stay("pachinko", t + 120 + R() * 180); go(home); } }
        if (has("nightOwl") && R() < 0.7) { stay("home", 1500 + R() * 40); const k2 = fav(["konbini"], H.dx, H.dz, 400); if (k2 >= 0) { go(k2, "walk"); stay("konbini", t + 10 + R() * 12); go(home, "walk"); } }
        bed(Math.max(t + 30, 1500 + R() * 60)); return finish();
      }
      const old = role === "retiree";
      sleepUntil(wake(old ? 320 : 345, 40));
      if (old && has("taiso")) { const park = fav(["park"], H.dx, H.dz, 600); if (park >= 0) { stay("home", 375); go(park, "walk"); stay("taiso", Math.max(t + 2, 405)); if (R() < 0.6) out("stroll", 15 + R() * 25); go(home, "walk"); } }
      walkDog(20 + R() * 15);
      if (garbageDay && t < 500) { stay("home", Math.max(t, 435 + R() * 45)); out("garbage", 4 + R() * 3, home); if (has("sociable") && R() < 0.55) out("chat", 5 + R() * 12, home); }
      if (old && has("gardener")) { stay("home", Math.max(t, 500 + R() * 60)); out("garden", 35 + R() * 50, home); }
      if (has("devout") && (R() < 0.45 || info.shrineDay)) { const sh = fav(["shrine"], H.dx, H.dz, 900); if (sh >= 0) { stay("home", Math.max(t, 530 + R() * 90)); go(sh, "walk"); out("shrine", 6 + R() * 10); go(home, "walk"); } }
      if (old && R() < 0.16 && workday) { const cl = fav(["clinic", "hospital"], H.dx, H.dz, 1500); if (cl >= 0) { stay("home", Math.max(t, 540)); go(cl); stay("clinic", t + 60 + R() * 70); go(home); } }
      if (!old && R() < 0.5) { stay("home", Math.max(t, 600 + R() * 40)); shopRun(); }
      if (!old && has("sociable") && R() < 0.45) { stay("home", Math.max(t, 650)); out("chat", 10 + R() * 25, home); }
      stay("home", Math.max(t, 800 + R() * 60));
      if (old) {
        const r = R();
        if (has("reader") && r < 0.35) { const lb = fav(["library"], H.dx, H.dz, 1500); if (lb >= 0) { go(lb); stay("library", t + 90 + R() * 60); go(home); } }
        else if (r < 0.6) { const park = fav(["park"], H.dx, H.dz, 600); if (park >= 0) { go(park, "walk"); out("bench", 40 + R() * 60); go(home, "walk"); } }
        else if (r < 0.75) { const k = fav(["kissaten", "cafe"], H.dx, H.dz, 800); if (k >= 0) { go(k, "walk"); stay("cafe", t + 40 + R() * 40); go(home, "walk"); } }
        if (has("sociable") && R() < 0.5) { stay("home", Math.max(t, 920)); out("chat", 10 + R() * 25, home); }
        if (R() < 0.22) { const b = fav(["sento"], H.dx, H.dz, 1000); if (b >= 0) { stay("home", Math.max(t, 960)); go(b, "walk"); stay("bath", t + 40 + R() * 30); go(home, "walk"); } }
      }
      // the four o'clock time sale
      stay("home", Math.max(t, 940 + R() * 50));
      if (R() < (old ? 0.4 : 0.65)) shopRun();
      if (has("dog")) { stay("home", Math.max(t, 1050 + R() * 40)); walkDog(20 + R() * 15); }
      bed(old ? 1250 + R() * 60 : 1380 + R() * 50);
      return finish();
    }

    if (role === "schoolchild") {
      const sch = work, young = age < 12;
      if (info.schoolDay && sch >= 0) {
        const tr = this.travel(home, sch, "walk", flags), arrive = (young ? 475 : 490) + R() * 15, leave = arrive - tr.dur;
        sleepUntil(Math.min(leave - 35, wake(395, 25))); stay("home", leave); go(sch, "walk");
        stay("school", young ? 885 + R() * 25 : 925 + R() * 15);
        if (!young && R() < 0.65) stay("school", 1050 + R() * 30);            // club
        if (young && R() < 0.4) { const park = fav(["park"], H.dx, H.dz, 400); if (park >= 0) { go(park, "walk"); out("play", 40 + R() * 40); } }
        if (!young && week() < 0.55) { const cr = fav(["cram"], H.dx, H.dz, 1500); if (cr >= 0) { go(cr); stay("cram", Math.max(t + 60, 1230 + R() * 30)); } }
        if (age >= 13 && R() < 0.2) { const k = fav(["konbini"], H.dx, H.dz, 500); if (k >= 0) { go(k, "walk"); stay("konbini", t + 8 + R() * 10); } }
        bed(young ? 1260 + R() * 30 : 1380 + R() * 50);
      } else {
        sleepUntil(wake(480, 90)); stay("home", 600 + R() * 60);
        if (info.weekend && !young && R() < 0.4 && sch >= 0) { go(sch); stay("school", 720 + R() * 40); }     // Saturday club
        const park = fav(["park"], H.dx, H.dz, 500); if (park >= 0 && R() < 0.5) { go(park, "walk"); out("play", 60 + R() * 60); }
        bed(young ? 1260 + R() * 30 : 1400 + R() * 50);
      }
      return finish();
    }

    if (role === "student") {
      sleepUntil(wake(500, 120));
      const lectures = workday && !info.schoolBreak && work >= 0 && week() < 0.85 && R() < 0.8;
      if (lectures) { stay("home", 560 + R() * 80); go(work); stay("school", t + 180 + R() * 240); }
      // a part-time job: the konbini or the izakaya near home, three or four evenings a week
      if (week() < 0.75 && R() < 0.55) { const job = fav(["konbini", "izakaya", "cafe", "karaoke", "ramen"], H.dx, H.dz, 900); if (job >= 0) { go(job); stay("work", Math.max(t + 120, 1080 + R() * 60) + 180 + R() * 60); } }
      else if (R() < 0.35) { const k = fav(["karaoke", "izakaya", "cafe"], at === home ? H.dx : P[at].dx, at === home ? H.dz : P[at].dz, 1200); if (k >= 0) { go(k); stay(P[k].purpose === "karaoke" ? "karaoke" : P[k].purpose === "cafe" ? "cafe" : "drinks", t + 90 + R() * 100); } }
      if (at !== home) go(home);
      if (R() < 0.35) { const k = fav(["konbini"], H.dx, H.dz, 300); if (k >= 0) { stay("home", Math.max(t, 1430)); go(k, "walk"); stay("konbini", t + 8 + R() * 8); go(home, "walk"); } }
      bed(Math.max(t + 60, 1500 + R() * 80)); return finish();
    }

    // shift workers: shop staff, part-timers, nights, nurses, the docks
    if (work >= 0) {
      const Wp = P[work], open = Wp.open, close = Wp.close;
      const off = (Wp.dayOff === info.dow) || (Wp.def.weekdaysOnly && info.offWork) || (week() < 0.28 && hash32(C.seed, i, day, 61) % 7 < 2);
      let s0, s1;
      if (role === "shopworker") { const owner = age > 45 || C.home[i] === work; s0 = owner ? open - 40 : Math.max(open - 15, 540 + R() * 60); s1 = owner ? Math.min(close + 30, DAY_START + 1440 - 30) : Math.min(close + 10, s0 + 480 + R() * 60); }
      else if (role === "freeter") { const sh = hash32(C.seed, i, Math.floor(day / 7), 62) % 3; s0 = [360, 840, 1320][sh]; s1 = s0 + 480; if (Wp.purpose !== "konbini") { s0 = Math.max(open, 1020); s1 = Math.min(close, s0 + 300); } }
      else if (role === "nightworker") { s0 = Math.max(open - 30, 1020); s1 = Math.min(close + 20, DAY_START + 1440 - 10); }
      else if (role === "carer") { const sh = Wp.purpose === "hospital" ? hash32(C.seed, i, Math.floor(day / 4), 63) % 3 : 0; s0 = [510, 960, 1440][sh]; s1 = s0 + [540, 510, 540][sh]; if (Wp.purpose !== "hospital") { s0 = open - 20; s1 = close + 20; } }
      else { s0 = 450 + R() * 30; s1 = 1020 + R() * 60; }   // manual
      if (off) { weekend(); return finish(); }
      if (s0 >= 1440 && role === "carer") {
        // the night shift: sleeps late, out in the afternoon, leaves at eleven
        sleepUntil(wake(800, 60)); stay("home", 960); shopRun(); stay("home", s0 - this.travel(home, work, null, flags).dur); go(work); stay("work", DAY_START + 1440 - 1); return finish();
      }
      if (s0 >= 900) {
        // an evening or night start: the morning is theirs (the small hours before belong to yesterday)
        sleepUntil(wake(role === "nightworker" ? 660 : 540, 80)); if (R() < 0.45) shopRun();
        walkDog(15);
      } else sleepUntil(Math.min(s0 - this.travel(home, work, null, flags).dur - 30, wake(s0 - 90, 30)));
      stay("home", s0 - (C.home[i] === work ? 0 : this.travel(home, work, null, flags).dur));
      go(work);
      if (Wp.def && Wp.def.staff && s0 < Wp.open && role === "shopworker" && C.home[i] === work) { out("sweep", 10 + R() * 8, work); }
      if (has("smoker") && s1 - t > 300) { stay("work", t + 200 + R() * 60); out("smoke", 7 + R() * 5); }
      stay("work", Math.min(s1, DAY_START + 1440 - 5));
      if (role === "manual" && has("drinker") && R() < 0.3 + (info.payday ? 0.2 : 0)) { const iz = fav(["izakaya", "soba"], Wp.dx, Wp.dz, 600); if (iz >= 0) { go(iz); stay("drinks", t + 60 + R() * 60); } }
      if (t < DAY_START + 1440 - 20) bed(Math.max(t + 30, role === "nightworker" ? t + 40 : 1350 + R() * 60));
      return finish();
    }
    // anyone else with no place to be
    weekend();
    return finish();

    // ---- helpers that need the closure ----
    function shopRun() {
      const k = fav(["supermarket", "greengrocer", "butcher", "fishmonger", "konbini", "pharmacy", "drycleaner", "bakery"], H.dx, H.dz, 600);
      if (k >= 0) { go(k, "walk"); stay("shop", t + 15 + R() * 30); go(home, "walk"); }
    }
    function weekend() {
      sleepUntil(wake(age > 60 ? 360 : 500, 100));
      walkDog(25 + R() * 20);
      if (has("jogger") && R() < 0.6) { out("jog", 30 + R() * 30, home); }
      stay("home", Math.max(t, 640 + R() * 60));
      const r = R();
      if (has("gambler") && r < 0.45) { const pk = fav(["pachinko"], H.dx, H.dz, 1500); if (pk >= 0) { go(pk); stay("pachinko", t + 180 + R() * 240); go(home); } }
      else if (r < 0.5) shopRun();
      else if (r < 0.7) { const park = fav(["park", "shrine"], H.dx, H.dz, 900); if (park >= 0) { go(park, "walk"); out(P[park].purpose === "shrine" ? "shrine" : "stroll", 30 + R() * 60); go(home, "walk"); } }
      else if (r < 0.85) { segs.push({ a: "away", p: -1, t0: t, t1: t + 180 + R() * 200 }); t = segs[segs.length - 1].t1; }   // out of town for the day
      if (has("gym") && R() < 0.4) { const g = fav(["gym"], H.dx, H.dz, 1200); if (g >= 0) { go(g); stay("gym", t + 70); go(home); } }
      if (has("drinker") && info.beforeOff && R() < 0.3) { const iz = fav(["izakaya", "bar"], H.dx, H.dz, 800); if (iz >= 0) { stay("home", Math.max(t, 1110)); go(iz); stay("drinks", t + 100 + R() * 80); go(home); } }
      if (has("dog") && t < 1080) { stay("home", Math.max(t, 1050)); walkDog(20 + R() * 10); }
      bed(Math.max(t + 30, 1410 + R() * 80));
    }
    function finish() {
      // clean: clip to the day, drop empty segments
      const out2 = [];
      for (const s of segs) { s.t0 = Math.max(DAY_START, Math.round(s.t0)); s.t1 = Math.min(DAY_START + 1440, Math.round(s.t1)); if (s.t1 > s.t0) out2.push(s); }
      return { i, day, home, segs: out2 };
    }
  }

  // how someone gets from one place to another: walking, cycling or the train, with the time it takes
  travel(a, b, force, flags) {
    const P = this.w.places, A = P[a], B = P[b];
    const d = Math.hypot(B.dx - A.dx, B.dz - A.dz) * 1.3;    // streets are not straight lines
    if (force === "walk" || d < 1300) return { mode: "walk", dur: Math.max(2, Math.round(d / WALK)) };
    if (flags & TRAIT.cyclist && d < 4000) return { mode: "bike", dur: Math.max(3, Math.round(d / BIKE)) };
    const s1 = this.w.station(A.dx, A.dz), s2 = this.w.station(B.dx, B.dz);
    if (s1 && s2 && s1 !== s2) {
      const w1 = Math.round(Math.hypot(s1.x - A.dx, s1.z - A.dz) * 1.3 / WALK), w2 = Math.round(Math.hypot(B.dx - s2.x, B.dz - s2.z) * 1.3 / WALK);
      const ride = Math.round(Math.hypot(s2.x - s1.x, s2.z - s1.z) / TRAIN) + 6;
      const dur = w1 + ride + w2;
      if (w1 + w2 < d / WALK) return { mode: "train", dur, w1, w2, st1: s1, st2: s2 };
    }
    if (flags & TRAIT.car) return { mode: "car", dur: Math.max(4, Math.round(d / 500) + 4) };
    return { mode: "walk", dur: Math.max(2, Math.round(d / WALK)) };
  }
}
