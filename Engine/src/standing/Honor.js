// Honor: what kind of man the player is, measured by what he does.
//
// Honor is a single number from -100 (a disgrace) to +100 (a man of his word). Every deed the host reports moves it:
// crimes pull it down, kindness pushes it up. It does not care who saw: police and witnesses are the wanted level's
// business, honor is the player's own conscience. Each deed comes back as an event the HUD can show (a mark, a sign
// and an amount), and the tier the number sits in changes how the world treats him (the host reads effects()).
//
// Repeats are damped two ways so the number means something:
//   - a deed id can have a cooldown: the act and the phone call about the act are one deed, not two
//   - a deed group can have a window: three shop hold-ups in a minute is one spree, the later ones cost less
// and good deeds done over and over (helping the same kind of stranger ten times in a row) are worth less each time.
//
// Nothing in here knows about Seiko or Tōkonto: the deed table is the host's.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Tiers from the bottom up. `at` is the lowest honor in the tier.
export const HONOR_TIERS = [
  { id: "disgraced",   at: -100, name: "Disgraced",   line: "People cross the street when they see you coming." },
  { id: "dishonoured", at: -55,  name: "Dishonoured", line: "Your name is said quietly, and not kindly." },
  { id: "doubtful",    at: -20,  name: "Doubtful",    line: "People are not sure what to make of you." },
  { id: "decent",      at: 20,   name: "Decent",      line: "An ordinary, decent man." },
  { id: "upright",     at: 55,   name: "Upright",     line: "Strangers trust you. Shopkeepers remember you." },
  { id: "honourable",  at: 85,   name: "Honourable",  line: "A man of his word. People stand a little straighter around you." }
];

export class Honor {
  // deeds: { id: { delta, label, icon, group?, cooldown?, window? } }
  constructor(opts) {
    opts = opts || {};
    this.deeds = Object.assign({}, opts.deeds || {});
    this.value = clamp(opts.start != null ? opts.start : 0, -100, 100);
    this.now = opts.now || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000);
    this.ledger = [];                 // newest last, capped
    this.lastById = new Map();        // id -> time of last counted deed
    this.groupHits = new Map();       // group -> [times] inside its window
    this.goodRun = new Map();         // good deed id -> how many in a row recently
    this.listeners = [];
    this.totals = { good: 0, bad: 0, deeds: 0 };
  }

  on(fn) { this.listeners.push(fn); return () => { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); }; }
  emit(ev) { for (const fn of this.listeners) { try { fn(ev); } catch (e) { console.error("[Shigoto] honor listener failed", e); } } }

  define(id, def) { this.deeds[id] = def; return this; }

  tier(v) {
    v = v == null ? this.value : v;
    let t = HONOR_TIERS[0];
    for (const x of HONOR_TIERS) if (v >= x.at) t = x;
    return t;
  }
  // 0..1 position on the bar, for meters
  norm() { return (this.value + 100) / 200; }

  // Report a deed. Returns the event (with the applied delta), or null when it was damped to nothing.
  // opts: { scale (multiplies delta), label (overrides), note (shown under the label), silent, force (skip damping) }
  deed(id, opts) {
    opts = opts || {};
    const d = this.deeds[id];
    if (!d) return null;
    const t = this.now();
    if (!opts.force && d.cooldown) {
      const last = this.lastById.get(id);
      if (last != null && t - last < d.cooldown) return null;
    }
    // a deed may name others it is the same act as (the phone call about a shooting is not a second shooting)
    if (!opts.force && d.same) {
      for (const o of d.same) { const l = this.lastById.get(o); if (l != null && t - l < (d.cooldown || 10)) return null; }
    }
    let delta = d.delta * (opts.scale != null ? opts.scale : 1);
    if (!opts.force && d.group && d.window) {
      const hits = (this.groupHits.get(d.group) || []).filter(x => t - x < d.window);
      // the second act in a spree costs 60%, the third 36%... never nothing
      delta *= Math.max(0.2, Math.pow(0.6, hits.length));
      hits.push(t); this.groupHits.set(d.group, hits);
    }
    if (delta > 0 && !opts.force) {
      // the same kindness over and over: still kind, worth a bit less each time (recovers as time passes)
      const run = this.goodRun.get(id) || { n: 0, t: 0 };
      const n = t - run.t > 600 ? 0 : run.n;
      delta *= Math.max(0.35, 1 - n * 0.15);
      this.goodRun.set(id, { n: n + 1, t: t });
    }
    // near the ends it gets harder to move further: the last steps to a perfect name, or a lost one, are slow
    if (delta > 0 && this.value > 60) delta *= 1 - (this.value - 60) / 80;
    if (delta < 0 && this.value < -60) delta *= 1 - (-60 - this.value) / 80;
    delta = Math.round(delta * 10) / 10;
    this.lastById.set(id, t);
    if (!delta) return null;
    return this.apply(delta, { id: id, label: opts.label || d.label, icon: opts.icon || d.icon || id, note: opts.note || "", silent: !!opts.silent });
  }

  // Move honor directly (story beats, scripted rewards). Returns the event.
  apply(delta, info) {
    info = info || {};
    const before = this.value, tierBefore = this.tier().id;
    this.value = clamp(Math.round((this.value + delta) * 10) / 10, -100, 100);
    const applied = Math.round((this.value - before) * 10) / 10;
    const ev = { kind: "honor", id: info.id || "story", label: info.label || "", icon: info.icon || info.id || "story", note: info.note || "",
                 delta: applied, raw: delta, value: this.value, at: this.now(), tier: this.tier(), tierChanged: this.tier().id !== tierBefore, silent: !!info.silent };
    this.totals.deeds++; if (delta > 0) this.totals.good++; else this.totals.bad++;
    this.ledger.push({ id: ev.id, label: ev.label, delta: applied, at: ev.at });
    if (this.ledger.length > 60) this.ledger.splice(0, this.ledger.length - 60);
    this.emit(ev);
    return ev;
  }

  // What the tier does to the world, for the host to read. All multipliers are 1 at neutral.
  effects() {
    const v = this.value / 100;   // -1..1
    return {
      // how willing strangers are to ask you for help (a known thug does not get asked)
      askRate: clamp(1 + v * 0.8, 0.15, 1.8),
      // shop prices: a good name gets a little off, a bad one a little on
      priceMul: clamp(1 - v * 0.08, 0.92, 1.1),
      // how warmly people answer a greeting (added to the respect engine's warmth)
      warmth: v * 0.35,
      // how likely a witness is to look the other way for a minor offence
      blindEye: clamp(v * 0.25, 0, 0.25)
    };
  }

  save() { return { v: 1, value: this.value, ledger: this.ledger.slice(-20), totals: this.totals }; }
  load(s) {
    if (!s || typeof s.value !== "number") return false;
    this.value = clamp(s.value, -100, 100);
    this.ledger = Array.isArray(s.ledger) ? s.ledger.slice(-60) : [];
    if (s.totals) Object.assign(this.totals, s.totals);
    return true;
  }
}
