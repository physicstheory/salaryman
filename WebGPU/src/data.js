// The shop, item, brand, phone and radio tables, read from assets/data/game_data.json (built from the web game by tools/extract_game_data.js).

export const Data = {
  raw: null,
  items: {},
  brands: {},

  async load(preloaded = null) {
    const raw = preloaded || await (await fetch('./assets/data/game_data.json')).json();
    this.raw = raw;
    this.brands = { ...raw.brands };
    for (const it of raw.items) this.items[it.id] = it;
    // shelf items that are not in the bag table still need a record
    for (const sh of raw.shelves) for (const it of sh.items) if (!this.items[it.id]) this.items[it.id] = it;
    this.registerExtras();
    return this;
  },

  /** Brands for the places that are not shops (baths, pachinko, karaoke...), and the fish you can catch. */
  registerExtras() {
    Object.assign(this.brands, EXTRA_BRANDS);
    const fish = { fish_aji: ['Horse mackerel', 0.07, 0.10], fish_saba: ['Mackerel', 0.08, 0.12], fish_tai: ['Sea bream', 0.14, 0.2], fish_boot: ['An old boot', 0.0, -0.03] };
    for (const k in fish) this.items[k] = { id: k, name: fish[k][0], cat: 'food', stress: -fish[k][1], health: fish[k][2], note: 'Caught today', min: 8 };
  },

  item(id) { return this.items[id] || { id, name: id }; },
  brand(id) { return this.brands[id] || { name: id, band: '#444444', ink: '#ffffff', stripes: ['#888888', '#444444'], tag: '' }; },
  device(id) { return this.raw.devices[id]; },

  /** The shelves a shop sells from: [{name, items: [...]}]. */
  shelvesFor(brandId) {
    const raw = this.raw;
    switch (brandId) {
      case 'eleven':
      case 'petmart': {
        const out = [];
        for (const sh of raw.shelves) {
          const list = sh.items.filter((it) => (it.only ?? brandId) === brandId);
          if (list.length) out.push({ name: sh.name, items: list });
        }
        return out;
      }
      case 'arms':
        return [{ name: 'Hardware', items: raw.arms.filter((i) => i.id === 'baton') }, { name: 'Under the counter', items: raw.arms.filter((i) => i.id !== 'baton') }];
      case 'dokoto':
        return this.dokotoShelves();
      default:
        return raw.store_shelves[brandId] || [];
    }
  },

  dokotoShelves() {
    const raw = this.raw;
    const phones = [];
    for (const k in raw.devices) {
      const d = raw.devices[k];
      if (d.price > 0 && d.maker !== 'eleven' && d.maker !== 'petmart') phones.push({ id: 'dev_' + k, name: d.name, price: d.price, note: d.note, device: k });
    }
    const tvs = raw.tvs.map((t) => ({ id: t.id, name: t.name, price: t.price, note: t.note, tv: true }));
    const audio = [];
    for (const k of ['earbuds', 'headphones']) for (const s of raw.shop_items) if (s.id === k) audio.push({ id: k, name: s.name, price: s.price, note: s.note, audio: true });
    for (const k in raw.audio_price) audio.push({ id: k, name: raw.audio_names[k], price: raw.audio_price[k], note: 'Wireless earphones', audio: true });
    const gear = Object.values(raw.gear).map((g) => ({ id: g.id, name: g.name, price: g.price, note: g.note, gear: true }));
    const games = raw.games.map((g) => ({ id: 'game_' + g.id, name: g.name, price: g.price, note: `${g.genre} · ${String(g.tier).toUpperCase()}`, game: true }));
    return [{ name: 'Phones', items: phones }, { name: 'Audio', items: audio }, { name: 'Televisions', items: tvs }, { name: 'Consoles and watches', items: gear }, { name: 'Games', items: games }];
  },
};

// the non-shop places' fascia colours (from the web build's activity table)
export const EXTRA_BRANDS = {
  sento: { name: 'Yu no Sato Sento', jp: '湯の里', band: '#2a6f8f', ink: '#ffffff', stripes: ['#ffffff', '#1c4a63'], tag: 'Public bath · towels ¥100' },
  pachinko: { name: 'Golden Lotus Pachinko', jp: 'パチンコ 黄金', band: '#b8860b', ink: '#2a0505', stripes: ['#ffd23a', '#4a0a0a'], tag: 'Open 10 to midnight' },
  karaoke: { name: 'Karaoke Night', jp: 'カラオケ 夜', band: '#7a1a8f', ink: '#ffe680', stripes: ['#ff6ad9', '#2a0a38'], tag: 'Private rooms · drinks included' },
  arcade: { name: 'Game Centre Rocket', jp: 'ゲームセンター', band: '#1a1f6f', ink: '#7ae8ff', stripes: ['#ff3a8a', '#0a0f3a'], tag: '¥100 a go' },
};
