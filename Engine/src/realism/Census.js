// The census: every household in every home in the city, every person in every household, and where each of them works or
// goes to school. Held compactly (typed arrays, a few bytes a person) so a whole capital of a couple of hundred thousand
// people fits in a few megabytes; names, habits and faces are derived from the person's number when somebody asks.
//
// Built once from the places. Workers are matched to real workplaces with room for them (an office of four hundred desks gets
// four hundred people, most from nearby wards, some from the far suburbs on the first train), children to the nearest school,
// shop families to their own shop. The houses thread and anything else can ask who lives at a place and who works there.

import { hash32, r01, rng, pick, weighted, clamp } from "./Rng.js";

export const ROLES = ["salaryman", "officeworker", "shopworker", "student", "schoolchild", "infant", "retiree", "homemaker", "nightworker", "manual", "carer", "freeter", "teacher", "idle", "civil"];
export const ROLE = Object.fromEntries(ROLES.map((r, i) => [r, i]));
export const ROLE_LABEL = {
  salaryman: "Salaryman", officeworker: "Office worker", shopworker: "Shop staff", student: "University student", schoolchild: "Schoolchild", infant: "Little one",
  retiree: "Retired", homemaker: "Homemaker", nightworker: "Works nights", manual: "Works the docks and yards", carer: "Nurse", freeter: "Part-timer", teacher: "Teacher",
  idle: "Between jobs", civil: "Civil servant"
};
export const TRAITS = ["smoker", "drinker", "dog", "jogger", "gardener", "devout", "cyclist", "car", "earlyBird", "nightOwl", "gambler", "gym", "sociable", "taiso", "reader", "cat"];
export const TRAIT = Object.fromEntries(TRAITS.map((t, i) => [t, 1 << i]));
export const TEMPERS = ["meek", "polite", "proud", "hothead"];

const SURNAMES = ["Satō", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Itō", "Yamamoto", "Nakamura", "Kobayashi", "Katō", "Yoshida", "Yamada", "Sasaki", "Yamaguchi", "Matsumoto", "Inoue", "Kimura", "Hayashi", "Shimizu", "Yamazaki",
  "Mori", "Abe", "Ikeda", "Hashimoto", "Yamashita", "Ishikawa", "Nakajima", "Maeda", "Fujita", "Ogawa", "Gotō", "Okada", "Hasegawa", "Murakami", "Kondō", "Ishii", "Saitō", "Sakamoto", "Endō", "Aoki", "Fujii", "Nishimura",
  "Fukuda", "Ōta", "Miura", "Okamoto", "Matsuda", "Nakagawa", "Nakano", "Harada", "Ono", "Tamura", "Takeuchi", "Kaneko", "Wada", "Nakayama", "Ishida", "Ueda", "Morita", "Hara", "Shibata", "Sakai", "Kudō", "Yokoyama", "Miyazaki", "Uchida", "Takagi", "Andō", "Taniguchi", "Ōno", "Maruyama", "Imai", "Kōno", "Fujiwara", "Murata", "Takeda", "Ueno", "Sugiyama", "Masuda", "Hirano", "Ōtsuka", "Chiba", "Kubo", "Matsui", "Iwasaki", "Sakurai", "Kinoshita", "Noguchi", "Matsuo", "Kikuchi", "Nomura", "Arai", "Watanabe", "Sano", "Ōshima", "Sugawara", "Ichikawa", "Hirata", "Kojima", "Kumagai"];
const MALE = { old: ["Shigeru", "Hiroshi", "Isamu", "Minoru", "Osamu", "Takeshi", "Yoshio", "Masao", "Kazuo", "Tadashi", "Akira", "Saburō", "Kiyoshi", "Toshio", "Haruo"],
  mid: ["Makoto", "Takashi", "Kenji", "Hiroyuki", "Tetsuya", "Naoki", "Masahiro", "Kazuya", "Daisuke", "Satoshi", "Yūji", "Tomoya", "Shinji", "Kōji", "Hideki", "Atsushi", "Yasuhiro"],
  young: ["Haruto", "Ren", "Sōta", "Yūto", "Riku", "Hinata", "Minato", "Kaito", "Takumi", "Sho", "Yamato", "Daiki", "Ryōta", "Kōki", "Yūma", "Asahi", "Itsuki"] };
const FEMALE = { old: ["Kazuko", "Michiko", "Yoshiko", "Fumiko", "Sachiko", "Hiroko", "Setsuko", "Keiko", "Toshiko", "Chiyo", "Hanako", "Masako", "Yōko", "Teruko"],
  mid: ["Yumiko", "Naomi", "Tomoko", "Kumiko", "Megumi", "Mayumi", "Akiko", "Yuka", "Ayako", "Noriko", "Junko", "Kaori", "Emi", "Mika", "Satomi", "Rie", "Chie"],
  young: ["Himari", "Yui", "Aoi", "Mei", "Sakura", "Hina", "Rin", "Yuna", "Mio", "Akari", "Riko", "Haruka", "Nanami", "Saki", "Misaki", "Kokona", "Tsumugi"] };

// households, by the kind of building: [type, weight]
const HH_HOUSE = [["family", 34], ["elderly2", 22], ["elderly1", 12], ["threegen", 10], ["couple", 13], ["single", 5], ["singleparent", 4]];
const HH_FLAT = [["single", 36], ["couple", 18], ["family", 22], ["elderly1", 9], ["elderly2", 5], ["students", 5], ["singleparent", 5]];
const HH_SHOP = [["shopfamily", 1]];

// which kind of workplace each working role fills
const ROLE_WORK = {
  salaryman: ["office"], officeworker: ["office"], civil: ["civic"], shopworker: ["shop"], freeter: ["konbini", "shop"], nightworker: ["night"],
  manual: ["yard"], carer: ["care"], teacher: ["school"], student: ["university"], schoolchild: ["school"]
};
const PURPOSE_CAT = {
  office: "office", wardoffice: "civic", library: "civic", post: "civic", koban: "civic", community: "civic", bank: "office",
  school: "school", university: "university", hospital: "care", clinic: "care", dentist: "care", pharmacy: "care",
  workshop: "yard", warehouse: "yard", port: "yard",
  izakaya: "night", bar: "night", snack: "night", karaoke: "night", konbini: "konbini", pachinko: "shop", supermarket: "shop", shrine: "shop"
};

export class Census {
  constructor(places, seed) {
    this.places = places; this.seed = seed >>> 0;
    this.built = false;
  }
  // Build in slices (a generator: each yield is a breath for the loading screen). build() runs it to the end.
  *steps() {
    const P = this.places, S = this.seed;
    const home = [], hhOf = [], age = [], sex = [], role = [], flags = [];
    const hhPlace = [], hhFirst = [], hhCount = [], hhType = [], hhUnit = [], hhName = [];
    let n = 0;
    for (let pi = 0; pi < P.length; pi++) {
      const pl = P[pi]; pl.resFirst = n; pl.hhFirst = hhPlace.length;
      const shopHome = pl.kind === "shop" && pl.units > 0;
      for (let u = 0; u < pl.units; u++) {
        const R = rng(hash32(S, pl.id | 0, u, 9100));
        // the host may already know who lives here (a house whose nameplate is lettered): keep its surname, head count and ages
        const given = u === 0 && Array.isArray(pl.household) && pl.household.length ? pl.household : null;
        const type = given ? "given" : weighted(shopHome ? HH_SHOP : pl.kind === "houses" ? HH_HOUSE : HH_FLAT, R());
        const hid = hhPlace.length;
        hhPlace.push(pi); hhFirst.push(n); hhType.push(type);
        // a flat number: floor and door (302 is the second door on the third floor)
        const perFloor = Math.max(1, Math.ceil(pl.units / Math.max(1, (pl.floors || 1) - (pl.kind === "midrise" ? 1 : 0))));
        hhUnit.push(pl.kind === "houses" || shopHome ? 0 : (Math.floor(u / perFloor) + (pl.kind === "midrise" ? 2 : 1)) * 100 + (u % perFloor) + 1);
        hhName.push(u === 0 && pl.surname ? pl.surname : null);
        const members = given ? given.map(m => fromHost(m, R, shopHome)) : household(type, R);
        for (const m of members) { home.push(pi); hhOf.push(hid); age.push(m.age); sex.push(m.female ? 1 : 0); role.push(ROLE[m.role]); flags.push(traitsFor(m, R, pl)); n++; }
        hhCount.push(members.length);
      }
      pl.resEnd = n; pl.hhEnd = hhPlace.length;
      if ((pi & 1023) === 1023) yield pi / P.length * 0.6;
    }
    this.n = n;
    this.home = Int32Array.from(home); this.hh = Int32Array.from(hhOf); this.age = Uint8Array.from(age); this.sex = Uint8Array.from(sex);
    this.role = Uint8Array.from(role); this.flags = Uint16Array.from(flags); this.work = new Int32Array(n).fill(-1);
    this.hhPlace = Int32Array.from(hhPlace); this.hhFirst = Int32Array.from(hhFirst); this.hhCount = Uint8Array.from(hhCount); this.hhType = hhType; this.hhUnit = Int32Array.from(hhUnit); this.hhName = hhName;
    yield 0.65;
    // ---- jobs and schools ----
    const cats = {};
    for (let pi = 0; pi < P.length; pi++) {
      const pl = P[pi];
      let cat = PURPOSE_CAT[pl.purpose] || (pl.def && pl.def.staff ? "shop" : null);
      if (pl.purpose === "office" || pl.kind === "office" || pl.kind === "tower") cat = "office";
      if (pl.groundShop) addCat(cats, "shop", pl, 3, pi);
      if (!cat || !pl.jobs) continue;
      addCat(cats, cat, pl, cat === "school" ? 600 : cat === "university" ? 2500 : pl.jobs, pi);
      if (cat === "konbini") addCat(cats, "shop", pl, pl.jobs, pi);
    }
    for (const k in cats) finishCat(cats[k]);
    this.cats = cats;
    const work = this.work, R = rng(hash32(S, 7, 7, 9200));
    for (let i = 0; i < n; i++) {
      if ((i & 8191) === 8191) yield 0.65 + i / n * 0.3;
      const rname = ROLES[role[i]], wants = ROLE_WORK[rname];
      if (!wants) continue;
      // a shop family works in its own shop
      const hp = P[home[i]];
      if (hp.kind === "shop" && rname === "shopworker") { work[i] = home[i]; continue; }
      if (hp.groundShop && rname === "shopworker" && R() < 0.5) { work[i] = home[i]; continue; }
      let best = -1, bs = -1e9;
      for (const cname of wants) {
        const c = cats[cname]; if (!c) continue;
        const near = rname === "schoolchild" ? 4 : rname === "salaryman" || rname === "officeworker" ? 7 : 5;
        for (let t = 0; t < near; t++) {
          const k = sampleCat(c, R());
          const pl = P[c.idx[k]], d = Math.hypot(pl.x - hp.x, pl.z - hp.z);
          // children walk to the nearest school; office people take the train anywhere in the city; shop staff live close
          const scale = rname === "schoolchild" ? 250 : rname === "salaryman" || rname === "officeworker" || rname === "civil" ? 9000 : rname === "student" ? 15000 : 1800;
          const full = c.used[k] >= c.cap[k] ? 2.5 : 0;
          const s = -d / scale - full + (pl.city === hp.city ? 0.6 : 0) + R() * 0.15;
          if (s > bs) { bs = s; best = c.idx[k]; }
        }
        if (best >= 0) { const cc = cats[cname]; const kk = cc.pos.get(best); if (kk != null) cc.used[kk]++; break; }
      }
      // nowhere to work in reach: a freeter does shifts at whatever is near, a salaryman becomes between jobs
      if (best < 0) { if (rname === "salaryman" || rname === "officeworker") role[i] = ROLE.idle; continue; }
      work[i] = best;
    }
    // ---- who works where (counting sort) ----
    const cnt = new Int32Array(P.length + 1);
    for (let i = 0; i < n; i++) if (work[i] >= 0) cnt[work[i] + 1]++;
    for (let k = 1; k <= P.length; k++) cnt[k] += cnt[k - 1];
    const fill = cnt.slice(), list = new Int32Array(cnt[P.length]);
    for (let i = 0; i < n; i++) if (work[i] >= 0) list[fill[work[i]]++] = i;
    this.workStart = cnt; this.workList = list;
    for (const pl of P) { const s = cnt[pl.index], e = cnt[pl.index + 1]; pl.staffCount = e - s; if (pl.company === undefined && pl.purpose === "office" && pl.staffCount) pl.company = null; }
    this.built = true;
    yield 1;
  }
  build() { for (const _ of this.steps()) { /* to the end */ } return this; }

  // ---- asking about people ----
  residentsOf(place) { const out = []; for (let i = place.resFirst; i < place.resEnd; i++) out.push(i); return out; }
  workersOf(place) { const s = this.workStart[place.index], e = this.workStart[place.index + 1]; return Array.from(this.workList.subarray(s, e)); }
  householdsOf(place) { const out = []; for (let h = place.hhFirst; h < place.hhEnd; h++) out.push(this.household(h)); return out; }
  household(h) {
    const first = this.hhFirst[h], count = this.hhCount[h], members = [];
    for (let i = first; i < first + count; i++) members.push(this.person(i));
    return { id: h, place: this.places[this.hhPlace[h]], unit: this.hhUnit[h], type: this.hhType[h], surname: members.length ? members[0].surname : "", members };
  }
  person(i) {
    if (i < 0 || i >= this.n) return null;
    const S = this.seed, h = this.hh[i], female = !!this.sex[i], a = this.age[i];
    const surname = (this.hhName && this.hhName[h]) || pick(SURNAMES, r01(S, h, 31));
    const gen = a >= 60 ? "old" : a >= 30 ? "mid" : "young";
    const given = pick((female ? FEMALE : MALE)[gen], r01(S, i, 32));
    const roleName = ROLES[this.role[i]], f = this.flags[i];
    const traits = TRAITS.filter(t => f & TRAIT[t]);
    const tr = r01(S, i, 33);
    const temper = roleName === "salaryman" || roleName === "officeworker" || roleName === "civil" ? (tr < 0.18 ? "meek" : tr < 0.74 ? "polite" : tr < 0.93 ? "proud" : "hothead")
      : a >= 65 ? (tr < 0.15 ? "meek" : tr < 0.7 ? "polite" : tr < 0.9 ? "proud" : "hothead") : (tr < 0.22 ? "meek" : tr < 0.6 ? "polite" : tr < 0.84 ? "proud" : "hothead");
    const work = this.work[i] >= 0 ? this.places[this.work[i]] : null;
    return {
      id: i, surname, given, name: given + " " + surname, family: surname + " " + given, age: a, female, role: roleName, roleLabel: jobLabel(roleName, work, female, a),
      traits, temper, home: this.places[this.home[i]], household: h, unit: this.hhUnit[h], work,
      business: roleName === "salaryman" || roleName === "officeworker" || roleName === "civil" || (roleName === "shopworker" && work && /realestate|bank|tailor|electronics/.test(work.purpose)),
      seed: hash32(S, i, 34)
    };
  }
  has(i, trait) { return !!(this.flags[i] & TRAIT[trait]); }
  stats() {
    const byRole = {}; for (let i = 0; i < this.n; i++) { const r = ROLES[this.role[i]]; byRole[r] = (byRole[r] || 0) + 1; }
    let employed = 0; for (let i = 0; i < this.n; i++) if (this.work[i] >= 0) employed++;
    return { people: this.n, households: this.hhPlace.length, employed, byRole };
  }
}

function addCat(cats, name, pl, cap, pi) { const c = cats[name] || (cats[name] = { idx: [], cap: [], used: [], pos: new Map() }); c.pos.set(pi, c.idx.length); c.idx.push(pi); c.cap.push(cap); c.used.push(0); }
function finishCat(c) { const pre = new Float64Array(c.cap.length); let s = 0; for (let k = 0; k < c.cap.length; k++) { s += c.cap[k]; pre[k] = s; } c.pre = pre; c.total = s; }
function sampleCat(c, r) { const x = r * c.total, pre = c.pre; let lo = 0, hi = pre.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (pre[m] > x) hi = m; else lo = m + 1; } return lo; }

function jobLabel(role, work, female, age) {
  if (!work) return ROLE_LABEL[role] || role;
  const p = work.purpose;
  if (role === "salaryman" || role === "officeworker") return (role === "salaryman" ? "Salaryman" : "Office worker") + (work.company ? " at " + work.company : "");
  if (role === "shopworker") return (age > 45 ? "Runs " : "Works at ") + (work.name || work.def.name);
  if (role === "freeter") return "Part-time at " + (work.name || work.def.name);
  if (role === "nightworker") return (p === "snack" && female ? "Mama-san at " : "Works nights at ") + (work.name || work.def.name);
  if (role === "carer") return (p === "pharmacy" ? "Pharmacist at " : p === "dentist" ? "Dental nurse at " : "Nurse at ") + (work.name || work.def.name);
  if (role === "schoolchild") return age < 12 ? "Primary school pupil" : age < 15 ? "Middle-school pupil" : "High-school student";
  if (role === "teacher") return "Teacher";
  if (role === "civil") return work.def.name === "Kōban" ? "Police officer" : "Works at the " + work.def.name.toLowerCase();
  if (role === "manual") return "Works at the " + work.def.name.toLowerCase();
  return ROLE_LABEL[role] || role;
}

// the people in one household
function household(type, R) {
  const out = [], adult = (lo, hi, female) => ({ age: Math.round(lo + R() * (hi - lo)), female });
  const worker = (m, R) => { m.role = workerRole(m, R); return m; };
  const kid = (parentAge) => { const a = Math.max(0, Math.round(parentAge - 26 - R() * 12)); return { age: a, female: R() < 0.5, role: a < 6 ? "infant" : a < 18 ? "schoolchild" : a < 23 && R() < 0.6 ? "student" : null }; };
  switch (type) {
    case "single": { const m = adult(22, 58, R() < 0.45); out.push(worker(m, R)); break; }
    case "couple": { const a = adult(26, 60, false), b = { age: clamp(a.age + Math.round((R() - 0.6) * 8), 22, 70), female: true }; out.push(worker(a, R), worker(b, R)); break; }
    case "family": case "threegen": {
      const a = adult(32, 55, false), b = { age: clamp(a.age - Math.round(R() * 5), 28, 60), female: true };
      out.push(worker(a, R)); b.role = R() < 0.42 ? "homemaker" : workerRole(b, R); out.push(b);
      const kids = 1 + (R() < 0.55 ? 1 : 0) + (R() < 0.15 ? 1 : 0);
      for (let k = 0; k < kids; k++) { const c = kid(b.age); if (!c.role) c.role = workerRole(c, R); out.push(c); }
      if (type === "threegen") { const g = { age: Math.round(a.age + 26 + R() * 6), female: R() < 0.7 }; g.role = "retiree"; out.push(g); }
      break;
    }
    case "singleparent": { const a = adult(28, 50, R() < 0.85); out.push(worker(a, R)); const c = kid(a.age); if (!c.role) c.role = workerRole(c, R); out.push(c); break; }
    case "elderly1": out.push({ age: Math.round(68 + R() * 22), female: R() < 0.68, role: "retiree" }); break;
    case "elderly2": { const a = Math.round(66 + R() * 18); out.push({ age: a, female: false, role: a < 70 && R() < 0.3 ? "manual" : "retiree" }, { age: a - Math.round(R() * 4), female: true, role: "retiree" }); break; }
    case "students": { const k = 2 + (R() < 0.3 ? 1 : 0); for (let i = 0; i < k; i++) out.push({ age: Math.round(19 + R() * 4), female: R() < 0.45, role: "student" }); break; }
    case "shopfamily": { const a = adult(38, 72, false), b = { age: a.age - Math.round(R() * 5), female: true, role: "shopworker" }; a.role = "shopworker"; out.push(a, b); if (R() < 0.45) { const c = kid(b.age); if (!c.role) c.role = R() < 0.4 ? "shopworker" : workerRole(c, R); out.push(c); } break; }
  }
  return out;
}
// a household member as the host described it ({ role, age, job, female? }): its age and role kept, the rest ours
function fromHost(m, R, shopHome) {
  const age = Math.max(0, Math.min(99, Math.round(+m.age || (20 + R() * 40))));
  const txt = String((m.role || "") + " " + (m.job || "")).toLowerCase();
  let female = m.female != null ? !!m.female : m.sex ? /^f/i.test(m.sex) : /wife|mother|grandmother|daughter|homemaker|housewife|lady|woman|girl|mrs/.test(txt) ? true : /husband|father|grandfather|son\b|man\b|boy|mr\b/.test(txt) ? false : R() < 0.5;
  let role;
  if (age < 6 || /baby|infant|toddler/.test(txt)) role = "infant";
  else if (/retir|pension/.test(txt) || age >= 72) role = "retiree";
  else if (/pupil|school|child|kid/.test(txt) || age < 18) role = age < 18 ? "schoolchild" : "student";
  else if (/student|universit|college/.test(txt)) role = "student";
  else if (/homemaker|housewife|househusband|home/.test(txt)) role = "homemaker";
  else if (shopHome || /shop|store|owner|keeper|baker|grocer|butcher|fishmonger|florist|barber|cook|chef|ramen|cafe/.test(txt)) role = "shopworker";
  else if (/nurse|doctor|care|pharmac|dent/.test(txt)) role = "carer";
  else if (/teach/.test(txt)) role = "teacher";
  else if (/night|bar|club|snack|hostess|taxi/.test(txt)) role = "nightworker";
  else if (/factory|dock|port|construct|builder|driver|warehouse|labou?r|mechanic|plumb|electrician|carpenter/.test(txt)) role = "manual";
  else if (/civil|ward|post|police|city hall|library/.test(txt)) role = "civil";
  else if (/part[- ]?time|freeter|konbini/.test(txt)) role = "freeter";
  else if (/salary|office|company|bank|clerk|account|sales|engineer|manager/.test(txt)) role = female ? "officeworker" : "salaryman";
  else role = workerRole({ age, female }, R);
  return { age, female, role };
}
function workerRole(m, R) {
  const a = m.age, f = m.female, r = R();
  if (a >= 67) return r < 0.2 ? "shopworker" : "retiree";
  if (a < 18) return "schoolchild";
  if (a < 23 && r < 0.55) return "student";
  if (f) return weighted([["officeworker", 34], ["shopworker", 14], ["carer", 10], ["freeter", 12], ["teacher", 4], ["civil", 5], ["nightworker", 3], ["homemaker", a > 28 ? 12 : 2], ["idle", 3], ["manual", 2]], r);
  return weighted([["salaryman", 52], ["manual", 11], ["shopworker", 8], ["freeter", 7], ["civil", 6], ["teacher", 3], ["nightworker", 4], ["carer", 2], ["idle", 3]], r);
}
function traitsFor(m, R, pl) {
  let f = 0;
  const a = m.age, role = m.role, adult = a >= 20;
  if (adult && R() < (m.female ? 0.08 : 0.27)) f |= TRAIT.smoker;
  if (adult && R() < (role === "salaryman" ? 0.7 : 0.35)) f |= TRAIT.drinker;
  if (adult && R() < (pl.kind === "houses" ? 0.16 : 0.07)) f |= TRAIT.dog;
  if (a >= 20 && a < 60 && R() < 0.1) f |= TRAIT.jogger;
  if (a >= 45 && R() < (pl.kind === "houses" ? 0.4 : 0.15)) f |= TRAIT.gardener;
  if (R() < (a >= 60 ? 0.35 : 0.08)) f |= TRAIT.devout;
  if (R() < 0.45) f |= TRAIT.cyclist;
  if (adult && R() < (pl.kind === "houses" ? 0.55 : 0.18)) f |= TRAIT.car;
  if (a >= 60 || R() < 0.15) f |= TRAIT.earlyBird; else if (a < 35 && R() < 0.25) f |= TRAIT.nightOwl;
  if (adult && R() < (m.female ? 0.03 : 0.11)) f |= TRAIT.gambler;
  if (a >= 20 && a < 55 && R() < 0.12) f |= TRAIT.gym;
  if (R() < 0.35) f |= TRAIT.sociable;
  if (a >= 62 && R() < 0.45) f |= TRAIT.taiso;
  if (R() < 0.2) f |= TRAIT.reader;
  if (R() < 0.08) f |= TRAIT.cat;
  return f;
}
