// Respect: how other people regard the player, and how they show it.
//
// Honor is what you are; respect is what people give you. It has two sources:
//
//   standing  your rank in the company you work for. The host gives a ladder of ranks, each with a floor of respect;
//             promotion lifts the floor, and nothing you do on the street takes you below what your title commands.
//   earned    how you carry yourself: greeting people properly earns it, antagonising them loses it. Bounded so the
//             street alone cannot make a junior clerk a lord, or a director a nobody.
//
// Greeting is a conversation, not a button: the person you face has a temper (meek, polite, proud, hothead) and a
// memory of you, and answers with a deep bow, a bow, a nod, nothing, a flinch, a glare or a squared-up chest. Bow to
// many people and the habit ("courtesy") spreads: strangers start bowing to you first. The host asks bowChance()
// for each passer-by.
//
// Nothing in here knows about Seiko, Soti or Tōkonto: the ladder and the lines are the host's.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const RESPECT_TIERS = [
  { id: "nobody",   at: 0,  name: "Nobody",          line: "Just another suit on the pavement." },
  { id: "familiar", at: 15, name: "A familiar face", line: "A few people nod when you pass." },
  { id: "respected",at: 35, name: "Respected",       line: "People make room for you." },
  { id: "esteemed", at: 60, name: "Esteemed",        line: "Strangers bow first." },
  { id: "revered",  at: 85, name: "Revered",         line: "The street goes quiet when you walk down it." }
];

export const TEMPERS = ["meek", "polite", "proud", "hothead"];
const TEMPER_WARMTH = { meek: 0.12, polite: 0.1, proud: -0.15, hothead: -0.22 };

export class Respect {
  // opts: { ranks: [{ id, name, base }], rank, earned, now }
  constructor(opts) {
    opts = opts || {};
    this.ranks = (opts.ranks || [{ id: "none", name: "", base: 0 }]).slice();
    this.rankId = opts.rank || this.ranks[0].id;
    this.earned = clamp(opts.earned || 0, -40, 50);
    this.now = opts.now || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000);
    this.courtesy = 0;       // decaying count of recent bows
    this.courtesyAt = this.now();
    this.bowsTotal = 0; this.antagTotal = 0; this.bowedTo = 0;
    this.people = new Map(); // person id -> { bows, antag, last, lastBow, lastAntag }
    this.recent = [];        // times of recent greetings (spam check)
    this.listeners = [];
    this.rand = opts.random || Math.random;
  }

  on(fn) { this.listeners.push(fn); return () => { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); }; }
  emit(ev) { for (const fn of this.listeners) { try { fn(ev); } catch (e) { console.error("[Shigoto] respect listener failed", e); } } }

  rank() { return this.ranks.find(r => r.id === this.rankId) || this.ranks[0]; }
  rankIndex() { return Math.max(0, this.ranks.indexOf(this.rank())); }
  get value() { return clamp(Math.round((this.rank().base + this.earned) * 10) / 10, 0, 100); }
  tier(v) {
    v = v == null ? this.value : v;
    let t = RESPECT_TIERS[0];
    for (const x of RESPECT_TIERS) if (v >= x.at) t = x;
    return t;
  }
  norm() { return this.value / 100; }

  // Promotion (or demotion). Returns the event, or null if nothing changed.
  setRank(id, info) {
    const r = this.ranks.find(x => x.id === id);
    if (!r || r.id === this.rankId) return null;
    const before = this.value, tierBefore = this.tier().id, up = this.ranks.indexOf(r) > this.rankIndex();
    this.rankId = r.id;
    return this.event(this.value - before, Object.assign({ id: up ? "promotion" : "demotion", label: (up ? "Promoted: " : "Demoted: ") + r.name, icon: up ? "promotion" : "demotion" }, info), tierBefore);
  }

  // Add earned respect from outside (a job done well, a story beat). Returns the event.
  earn(delta, info) {
    const before = this.value, tierBefore = this.tier().id;
    this.earned = clamp(this.earned + delta, -40, 50);
    return this.event(this.value - before, Object.assign({ id: "earned", icon: delta >= 0 ? "respect" : "disrespect" }, info), tierBefore);
  }

  event(applied, info, tierBefore) {
    applied = Math.round(applied * 10) / 10;
    const ev = { kind: "respect", id: info.id, label: info.label || "", icon: info.icon || info.id, note: info.note || "", delta: applied,
                 value: this.value, at: this.now(), tier: this.tier(), tierChanged: this.tier().id !== tierBefore, silent: !!info.silent };
    this.emit(ev);
    return ev;
  }

  decay() {
    const t = this.now(), dt = t - this.courtesyAt;
    // courtesy halves every five minutes without a bow
    if (dt > 0) { this.courtesy *= Math.pow(0.5, dt / 300); this.courtesyAt = t; }
    this.recent = this.recent.filter(x => t - x < 60);
    return t;
  }

  memory(id) {
    let m = this.people.get(id);
    if (!m) {
      m = { bows: 0, antag: 0, last: -1e9, lastBow: -1e9, lastAntag: -1e9 };
      this.people.set(id, m);
      if (this.people.size > 400) this.people.delete(this.people.keys().next().value);
    }
    return m;
  }

  // The player greets someone. kind: "bow" | "antagonize".
  // person: { id, temper, standing (0..1, how important they are), warmth (extra, e.g. from honor) }
  // Returns { reply, delta, ev, harass } where reply is one of
  //   bow: "deep" | "bow" | "nod" | "ignore" | "puzzled"      antagonize: "flinch" | "offended" | "glare" | "backsdown" | "squareup" | "flee"
  greet(kind, person) {
    person = person || {};
    const t = this.decay(), m = this.memory(person.id != null ? person.id : "?"), temper = TEMPERS.includes(person.temper) ? person.temper : "polite";
    const standing = clamp(person.standing != null ? person.standing : 0.3, 0, 1), v = this.value;
    const spam = this.recent.length;            // greetings in the last minute
    this.recent.push(t);
    let reply, delta = 0, label = "", harass = false;
    if (kind === "bow") {
      this.bowsTotal++;
      this.courtesy += 1;
      if (t - m.lastBow < 45 && m.bows > 0) {
        // bowing to the same person again and again
        reply = "puzzled"; delta = m.bows > 1 ? -0.5 : 0; label = "Bowed too often";
      } else {
        let w = 0.45 + (person.warmth || 0) + (v - 30) / 150 + TEMPER_WARMTH[temper] - m.antag * 0.25;
        // bowing to someone more important than you is expected; them bowing deeply back is not
        w -= Math.max(0, standing - v / 100) * 0.3;
        const r = this.rand();
        if (r < w * 0.45 + (v > 60 ? 0.15 : 0)) { reply = "deep"; delta = 2.2; label = "Bowed to deeply"; }
        else if (r < w) { reply = "bow"; delta = 1.4; label = "Greeting returned"; }
        else if (r < w + 0.28) { reply = "nod"; delta = 0.5; label = "A nod back"; }
        else { reply = "ignore"; delta = -0.4; label = "Ignored"; }
        // greeting someone who matters is worth more; and the first greeting of a person counts most
        if (delta > 0) delta *= (0.8 + standing * 0.6) * (m.bows ? 0.5 : 1) * Math.max(0.3, 1 - Math.max(0, spam - 4) * 0.12);
        // already at the top of what manners alone can earn
        if (delta > 0 && this.earned > 30) delta *= 0.5;
      }
      m.bows++; m.lastBow = t;
    } else {
      this.antagTotal++;
      this.courtesy *= 0.6;
      const again = t - m.lastAntag < 40 && m.antag > 0;
      if (again && (temper === "meek" || temper === "polite")) { reply = "flee"; delta = -2; label = "Harassed a stranger"; harass = true; }
      else if (temper === "meek") { reply = "flinch"; delta = -1; label = "Intimidated someone"; }
      else if (temper === "polite") { reply = "offended"; delta = -2.5; label = "Caused offence"; }
      else if (temper === "proud") {
        // a proud man backs down from someone clearly above him, and the street notices
        if (v / 100 > standing + 0.25 && this.rand() < 0.6) { reply = "backsdown"; delta = 1; label = "Stared someone down"; }
        else { reply = "glare"; delta = -1.5; label = "Lost a staring match"; }
      } else { reply = again ? "squareup" : (this.rand() < 0.5 ? "squareup" : "glare"); delta = -1.2; label = reply === "squareup" ? "Picked a fight" : "Lost a staring match"; }
      m.antag++; m.lastAntag = t;
    }
    m.last = t;
    const ev = delta ? this.earn(delta, { id: kind === "bow" ? "greet" : "antagonize", label: label, icon: kind === "bow" ? (delta > 0 ? "bow" : "ignored") : (delta > 0 ? "stare" : "antagonize") }) : null;
    return { reply: reply, delta: ev ? ev.delta : 0, ev: ev, harass: harass, temper: temper };
  }

  // Someone bowed to the player first and he bowed back: a little respect, a little courtesy.
  returned(personId) {
    this.decay();
    const m = this.memory(personId);
    if (m.bows && this.now() - m.lastBow < 120) return null;
    m.bows++; m.lastBow = this.now(); this.courtesy += 0.5; this.bowedTo++;
    return this.earn(0.4, { id: "returned", label: "Returned a bow", icon: "bow" });
  }

  // Probability that a passer-by bows to the player first. person: { temper, standing, warmth }.
  bowChance(person) {
    this.decay();
    person = person || {};
    const v = this.value, c = Math.min(1, this.courtesy / 12);
    let p = Math.max(0, (v - 20) / 100) * 0.55 + c * 0.3 + (person.warmth || 0) * 0.3 + TEMPER_WARMTH[person.temper || "polite"] * 0.4;
    // people above you rarely bow first
    p -= Math.max(0, (person.standing || 0.3) - v / 100) * 0.6;
    return clamp(p, 0, 0.75);
  }

  save() {
    return { v: 1, rank: this.rankId, earned: this.earned, courtesy: Math.round(this.courtesy * 10) / 10, bows: this.bowsTotal, antag: this.antagTotal, bowedTo: this.bowedTo };
  }
  load(s) {
    if (!s || typeof s.earned !== "number") return false;
    if (this.ranks.some(r => r.id === s.rank)) this.rankId = s.rank;
    this.earned = clamp(s.earned, -40, 50);
    this.courtesy = s.courtesy || 0; this.courtesyAt = this.now();
    this.bowsTotal = s.bows || 0; this.antagTotal = s.antag || 0; this.bowedTo = s.bowedTo || 0;
    return true;
  }
}
