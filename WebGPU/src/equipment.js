// What the equipment wheel offers and what letting go of it does. The categories, the items and their notes are the web build's;
// what is owned lives in the game state (the bag for things, `owned` for handsets, games and gear).
import { Data } from './data.js';
import { gs } from './state.js';

export const Equipment = {
  cats() { return Data.raw.wheel_cats; },

  /** Every owned thing in one category, in the order the strip shows them: [{id, name, note, count, kind, current}] */
  list(cat) {
    const out = [];
    if (cat === 'phone') {
      const dev = Data.raw.devices[gs.device] || {};
      out.push({ id: gs.device, name: dev.name || 'Phone', note: 'In use', kind: 'phone', current: true });
      for (const id in Data.raw.devices) if (id !== gs.device && gs.owned[id]) out.push({ id, name: Data.raw.devices[id].name, note: 'In the bag', kind: 'phone' });
      return out;
    }
    if (cat === 'game') {
      for (const g of Data.raw.games) if (gs.owned[g.id]) out.push({ id: g.id, name: g.name, note: (gs.heldGame === g.id ? 'In hand · ' : '') + g.genre, kind: 'game' });
      return out;
    }
    for (const it of Data.raw.items) {
      if (it.cat !== cat) continue;
      const n = it.always ? 1 : (gs.bag[it.id] || 0);
      if (n > 0) out.push({ id: it.id, name: it.name, note: it.note || '', count: n, kind: 'item', item: it });
    }
    if (cat === 'tech') for (const id in Data.raw.gear) if (gs.owned[id]) out.push({ id, name: Data.raw.gear[id].name, note: Data.raw.gear[id].note, kind: 'gear' });
    return out;
  },

  /** Letting go of the wheel uses what is under the pointer. Returns a line for the toast. */
  apply(cat, e) {
    const cdef = this.cats().find((c) => c.id === cat) || {};
    if (!e) return (cdef.empty || 'Nothing') + ' yet.';
    switch (cat) {
      case 'hand': case 'gun': gs.held = e.id; gs.emit('changed'); return e.id === 'none' ? 'Put away.' : `${e.name} out.`;
      case 'audio': gs.wearing = gs.wearing === e.id ? '' : e.id; gs.emit('changed'); return gs.wearing === e.id ? `${e.name} on.` : `${e.name} off.`;
      case 'phone':
        if (e.current) return `${e.name} is already in your pocket.`;
        gs.device = e.id; gs.phonePaint = 0; gs.emit('changed'); return `${e.name} in your pocket.`;
      case 'game': gs.heldGame = e.id; return `${e.name} in hand.`;
      case 'food': case 'drink': case 'med': return gs.use(e.id) || 'Nothing happened.';
      case 'tech': return `${e.name}. ${e.note || ''}`;
      default: return '';
    }
  },
};
