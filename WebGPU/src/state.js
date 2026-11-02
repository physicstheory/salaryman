// Everything about the player that is not an object in the world: money, health, stress, the bag, what is worn, what is owned,
// the clock, deliveries, mail. The rules are the web build's.
import { Emitter, clamp, pad2, yen } from './util.js';
import { Data } from './data.js';

export const TIME_RATE = 0.4;           // game minutes per real second: a day lasts an hour
const COMFORT = ['ramen', 'nigiri', 'sushi', 'salmon', 'omakase', 'tsukemen', 'tonkotsu', 'miso', 'shoyu', 'bento', 'gyoza', 'karaage', 'onigiri', 'nikuman', 'meatbun'];

const START_MAIL = () => [
  { from: 'Section Chief Hara', subject: 'Re: Re: Re: Report', body: "Seiko-kun. The report is fine. Please redo it. Also, a brief word about the word 'brief'.\n\n— Hara", read: false },
  { from: 'Mom', subject: 'Eating properly?', body: 'Are you eating properly? Ramen is not a vegetable. Your father says hello. He did not say hello. I am saying it for him.', read: false },
  { from: 'Tōkonto Bank', subject: 'Your balance', body: 'Your account is in good standing. Thank you for your continued silence.', read: true },
  { from: 'Nihon Rail', subject: 'Last train notice', body: 'Please note that the last train is the last train. It will not wait. It has never waited.', read: true },
];

class State extends Emitter {
  constructor() { super(); this.reset(); }

  /** A new game: the same man, the same flat, ten past five on a weekday. */
  reset() {
    this.money = 500000;
    this.health = 1;                    // no passive regeneration: food, sleep and hospitals only
    this.stress = 0.14;
    this.awakeMin = 0;
    this.clockMin = 17 * 60 + 10;       // minutes since midnight
    this.day = 1;
    this.bag = {};                      // id -> count
    this.wearing = '';                  // audio id on the ears
    this.owned = { so24: true };        // phones, tvs, games, gear
    this.device = 'so24';
    this.phonePaint = 0;
    this.held = 'none';                 // what is in the hands, from the equipment wheel
    this.heldGame = '';
    this.shirt = '#f2f4f6';
    this.outdoors = false;
    this.waypoint = null;               // {x, z} or null
    this.waypointName = '';
    this.ledger = [];
    this.deliveries = [];
    this.photos = [];                   // data URLs of what the camera took
    this.mails = START_MAIL();
    this.liked = {};
    this.radioStation = 0;
  }

  strain() { return clamp((this.stress - 0.5) / 0.5, 0, 1); }

  eatRelief(id, rel) {
    if (rel === 0) return 0;
    if (this.stress > 0.3) for (const c of COMFORT) if (id.includes(c)) return rel * (1.6 + this.strain() * 1.2);
    return rel;
  }
  retailRelief(y) { if (this.stress > 0.3) this.stress = clamp(this.stress - clamp(0.012 + y / 60000, 0, 0.06), 0, 1); }
  addStress(d) { this.stress = clamp(this.stress + d, 0, 1); this.emit('changed'); }
  hurt(d) { this.health = clamp(this.health - d, 0, 1); this.emit('changed'); }

  tick(dt) {
    this.deliverDue();
    this.stress = clamp(this.stress + dt * 0.0016, 0, 1);
    this.awakeMin += dt * TIME_RATE;
    this.clockMin += dt * TIME_RATE;
    if (this.clockMin >= 1440) { this.clockMin -= 1440; this.day++; }
    if (this.awakeMin > 4320) this.stress = clamp(this.stress + dt * 0.0004 * Math.min(2.5, (this.awakeMin - 4320) / 2880), 0, 1);
    // being out in the open air is the free cure; a car or a street of shops is not
    if (this.outdoors && this.stress > 0.05) this.stress = clamp(this.stress - dt * 0.0036, 0, 1);
  }

  absMinute() { return this.day * 1440 + this.clockMin; }

  /** Order something online: it arrives after `hours` game hours, into the bag. */
  order(id, name, cost, hours) {
    if (!this.spend(cost, 'Hayabin: ' + name)) return false;
    this.deliveries.push({ id, name, due: this.absMinute() + hours * 60 });
    this.say('Hayabin', 'Order placed', `${name} · arrives in about ${Math.floor(hours)} hours`, 4);
    return true;
  }

  deliverDue() {
    if (!this.deliveries.length) return;
    const now = this.absMinute();
    for (const d of [...this.deliveries]) {
      if (now >= d.due) {
        this.deliveries.splice(this.deliveries.indexOf(d), 1);
        this.give(d.id, 1);
        this.say('Hayabin', 'Parcel delivered', `${d.name} is in your bag`, 5);
        this.mails.unshift({ from: 'Hayabin', subject: 'Delivered: ' + d.name, body: 'Your parcel was left with you, because you were the only person nearby.', read: false });
      }
    }
  }

  advanceMinutes(m) {
    this.clockMin += m;
    while (this.clockMin >= 1440) { this.clockMin -= 1440; this.day++; }
    this.emit('changed');
  }

  clockText() { const m = Math.floor(this.clockMin) % 1440; return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; }

  // ---- money
  canAfford(y) { return this.money >= y; }
  spend(y, what = 'Purchase') {
    if (this.money < y) return false;
    this.money -= y;
    this.ledger.unshift({ what, yen: -y, day: this.day, clock: this.clockText() });
    if (this.ledger.length > 40) this.ledger.pop();
    this.retailRelief(y);
    this.emit('changed');
    return true;
  }
  yen(n) { return yen(n); }

  // ---- the bag
  give(id, n = 1) { this.bag[id] = (this.bag[id] || 0) + n; this.emit('changed'); }
  hasItem(id) { return (this.bag[id] || 0) > 0; }

  /** Eat, drink, take or put on. Returns a line to show the player. */
  use(id) {
    if (!this.hasItem(id)) return '';
    const it = Data.item(id);
    const cat = it.cat || '';
    if (cat === 'audio') {
      this.wearing = this.wearing !== id ? id : '';
      this.emit('changed');
      return this.wearing === id ? `Put on ${it.name}.` : `Took off ${it.name}.`;
    }
    if (['food', 'drink', 'med'].includes(cat)) {
      this.bag[id]--;
      if (this.bag[id] <= 0) delete this.bag[id];
      this.applyConsumable(id, it);
      return `${it.name}. ${it.note || ''}`;
    }
    return '';
  }

  applyConsumable(id, it) {
    const s = Number(it.stress || 0), h = Number(it.health || 0);
    this.stress = clamp(s < 0 ? this.stress + this.eatRelief(id, s) : this.stress + s, 0, 1);
    this.health = clamp(this.health + h, 0, 1);
    if (it.min !== undefined) this.advanceMinutes(Number(it.min));
    this.emit('changed');
  }

  // ---- messages for the toast stack above the minimap
  say(app, title, body = '', secs = 4) { this.emit('notice', app, title, body, secs); }

  // ---- saving
  save() {
    try {
      localStorage.setItem('salaryman.save', JSON.stringify({ money: this.money, health: this.health, stress: this.stress, bag: this.bag, wearing: this.wearing, owned: this.owned, device: this.device, phonePaint: this.phonePaint, held: this.held, heldGame: this.heldGame, shirt: this.shirt, clock: this.clockMin, day: this.day, awake: this.awakeMin, ledger: this.ledger, deliveries: this.deliveries, photos: this.photos.slice(-12), mails: this.mails, liked: this.liked, radio: this.radioStation }));
    } catch (e) { /* storage unavailable */ }
  }
  hasSave() { try { return !!localStorage.getItem('salaryman.save'); } catch (e) { return false; } }
  load() {
    let d;
    try { d = JSON.parse(localStorage.getItem('salaryman.save') || 'null'); } catch (e) { d = null; }
    if (!d) return false;
    this.reset();
    Object.assign(this, {
      money: d.money ?? this.money, health: d.health ?? 1, stress: d.stress ?? 0.14, bag: d.bag || {}, wearing: d.wearing || '', owned: d.owned || { so24: true },
      device: d.device || 'so24', phonePaint: d.phonePaint || 0, held: d.held || 'none', heldGame: d.heldGame || '', shirt: d.shirt || this.shirt,
      clockMin: d.clock ?? this.clockMin, day: d.day || 1, awakeMin: d.awake || 0, ledger: d.ledger || [], deliveries: d.deliveries || [], photos: d.photos || [],
      liked: d.liked || {}, radioStation: d.radio || 0,
    });
    if (d.mails) this.mails = d.mails;
    this.emit('changed');
    return true;
  }
}

export const State_ = State;
export const gs = new State();
