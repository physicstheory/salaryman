// The counter. Shelves on the left, goods on the right, your money at the top.
// Up/Down pick, Left/Right change shelf, Enter buys, Esc leaves. The mouse works too.
import { el, ListBox } from './dom.js';
import { Data } from '../data.js';
import { gs } from '../state.js';

export class ShopUI {
  constructor(onClose) {
    this.onClose = onClose;
    this.brand = 'eleven'; this.shelves = []; this.shelfI = 0; this.floorsMode = false; this.plazaFloor = -1; this.isOpen = false;
    this.shelfList = new ListBox({ onSelect: (i) => this.onShelf(i), cls: 'shelves' });
    this.itemList = new ListBox({ onSelect: (i, d) => this.onItem(d), onActivate: (i) => this.buy(i), cls: 'goods' });
    this.title = el('h1'); this.tag = el('small'); this.money = el('div', { class: 'money' });
    this.band = el('div', { class: 'band' }, el('div', {}, this.title, this.tag), this.money);
    this.note = el('div', { class: 'note' }); this.msg = el('div', { class: 'msg' });
    this.root = el('div', { id: 'shop', class: 'overlay' },
      el('div', { class: 'wrap' }, this.band, el('div', { class: 'cols' }, this.shelfList.root, this.itemList.root), this.note, this.msg,
        el('div', { class: 'help', text: '↑ ↓ choose      ← → shelf      Enter: buy      Esc: leave' })));
    document.getElementById('ui').append(this.root);
    this.keydown = (e) => this.onKey(e);
    gs.on('changed', () => this.refreshMoney());
  }

  open(brandId) {
    this.brand = brandId;
    this.capsule = brandId === 'capsule';
    this.floorsMode = brandId === 'plaza';
    this.plazaFloor = -1;
    const b = Data.brand(brandId);
    this.band.style.background = b.band;
    this.band.style.color = b.ink;
    this.title.textContent = b.name + (b.jp ? '   ' + b.jp : '');
    this.tag.textContent = b.tag || '';
    this.msg.textContent = '';
    if (this.floorsMode) this.showFloors();
    else if (this.capsule) {
      this.shelves = [{ name: 'The desk', items: [{ id: 'capsule_sleep', name: 'A capsule until morning', price: 3500, note: 'Eight hours. Stress gone, health back. Parcels wait for you.' }] }];
      this.fillShelves();
    } else { this.shelves = Data.shelvesFor(brandId); this.fillShelves(); }
    this.refreshMoney();
    this.root.classList.add('on');
    this.isOpen = true;
    window.addEventListener('keydown', this.keydown, true);
  }

  close() {
    this.root.classList.remove('on');
    this.isOpen = false;
    window.removeEventListener('keydown', this.keydown, true);
    this.onClose();
  }

  showFloors() {
    this.shelves = [];
    this.shelfList.clear(); this.itemList.clear();
    for (const f of Data.raw.plaza) this.shelfList.add(`${f.label}  ${f.name}`, f);
    this.shelfList.select(0, false);
    this.fillFloorStores(0);
  }

  fillFloorStores(fi) {
    this.itemList.clear();
    const f = Data.raw.plaza[fi];
    for (const st of f.stores) { const b = Data.brand(st); this.itemList.add(`${b.name}   (${b.tag || ''})`, st); }
    this.itemList.select(0, false);
    this.note.textContent = 'Take the lift to a floor, then pick a shop.';
  }

  fillShelves() {
    this.shelfList.clear();
    for (const s of this.shelves) this.shelfList.add(s.name, s);
    this.shelfI = 0;
    if (this.shelves.length) { this.shelfList.select(0, false); this.fillItems(); }
  }

  onShelf(i) {
    if (this.floorsMode && this.plazaFloor === -1) { this.fillFloorStores(i); return; }
    this.shelfI = i;
    this.fillItems();
  }

  ownedKey(it) { return it.device || it.id || ''; }

  fillItems(keep = 0) {
    this.itemList.clear();
    const sh = this.shelves[this.shelfI];
    if (!sh) return;
    for (const it of sh.items) {
      const price = Number(it.price || 0);
      const owned = gs.owned[this.ownedKey(it)] ? '  ✓ owned' : '';
      this.itemList.add(it.name, it, gs.yen(price) + owned);
    }
    if (this.itemList.count) this.itemList.select(Math.min(keep, this.itemList.count - 1));
  }

  onItem(m) {
    if (typeof m === 'object' && m) {
      const parts = [];
      if (m.note) parts.push(m.note);
      const it = Data.item(m.id);
      if (it.stress && Number(it.stress) !== 0) parts.push(`Stress ${Number(it.stress) > 0 ? '+' : ''}${Math.trunc(Number(it.stress) * 100)}%`);
      if (it.health && Number(it.health) !== 0) parts.push(`Health ${Number(it.health) > 0 ? '+' : ''}${Math.trunc(Number(it.health) * 100)}%`);
      if (m.stress !== undefined && it.stress === undefined) parts.push(`Stress ${m.stress > 0 ? '+' : ''}${Math.trunc(m.stress * 100)}%`);
      if (m.health !== undefined && it.health === undefined) parts.push(`Health ${m.health > 0 ? '+' : ''}${Math.trunc(m.health * 100)}%`);
      if (m.screen) parts.push(m.screen);
      this.note.textContent = parts.join('  ·  ');
    } else if (typeof m === 'string') this.note.textContent = Data.brand(m).tag || '';
  }

  refreshMoney() { this.money.textContent = gs.yen(gs.money); }
  say(t) { this.msg.textContent = t; }

  onKey(e) {
    if (!this.isOpen) return;
    const k = e.key;
    let used = true;
    if (k === 'Escape') {
      if (this.floorsMode && this.plazaFloor !== -1) { this.plazaFloor = -1; this.title.textContent = 'Konto Plaza   コント・プラザ'; this.showFloors(); }
      else this.close();
    } else if (k === 'ArrowUp') this.itemList.move(-1);
    else if (k === 'ArrowDown') this.itemList.move(1);
    else if (k === 'ArrowLeft') this.shelfList.move(-1);
    else if (k === 'ArrowRight') this.shelfList.move(1);
    else if (k === 'Enter') { if (this.itemList.sel >= 0) this.buy(this.itemList.sel); }
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }

  buy(i) {
    const m = this.itemList.items[i] && this.itemList.items[i].data;
    if (typeof m === 'string') {
      // a floor of the plaza: open that shop's shelves
      this.plazaFloor = 1;
      this.title.textContent = Data.brand(m).name;
      this.shelves = Data.shelvesFor(m);
      this.fillShelves();
      return;
    }
    if (!m || typeof m !== 'object') return;
    const price = Number(m.price || 0), id = m.id;
    if (id === 'capsule_sleep') {
      if (!gs.spend(price)) { this.say(`Not enough for a capsule. ${gs.yen(price)} at the desk.`); return; }
      gs.stress = 0; gs.health = 1; gs.awakeMin = 0; gs.advanceMinutes(480);
      gs.say('Capsule', 'Slept until morning', 'You feel human.', 5);
      this.say('Slept until morning. You feel human.');
      return;
    }
    if (m.device && gs.owned[m.device]) { this.say('You already own that.'); return; }
    if ((m.tv || m.game || m.gear) && gs.owned[id]) { this.say('You already own that.'); return; }
    if (!gs.spend(price, m.name)) { this.say(`Not enough money. That is ${gs.yen(price)}.`); return; }
    const done = this.deliver(m);
    gs.emit('purchased', id);
    this.say(done);
    this.fillItems(i);
  }

  /** What happens to the thing you bought. */
  deliver(m) {
    const id = m.id;
    if (m.device) {
      gs.owned[m.device] = true; gs.device = m.device; gs.phonePaint = 0;
      gs.say('Phone', 'New phone', `${m.name} is in your pocket.`, 5);
      return `Bought ${m.name}. It is already in your pocket.`;
    }
    if (m.tv || m.gear || m.game) { gs.owned[id] = true; return `${m.name} ordered. Delivered to the safehouse tomorrow.`; }
    if (m.shirt) { gs.shirt = m.shirt; return `Put on the ${m.name.toLowerCase()}.`; }
    if (m.eat || m.read) {
      gs.applyConsumable(id, { stress: m.stress || 0, health: m.health || 0, min: m.min ?? 10 });
      return m.eat ? `Ate the ${m.name}.` : `Read ${m.name}.`;
    }
    const rec = Data.item(id);
    if (m.phone) { gs.owned[id] = true; gs.device = id; gs.phonePaint = 0; return `Bought ${m.name}. It is your phone now.`; }
    gs.give(id, 1);
    if (rec.cat === 'audio') return `Bought ${m.name}. It is in the bag: put it on.`;
    return `Bought ${m.name}.`;
  }
}
