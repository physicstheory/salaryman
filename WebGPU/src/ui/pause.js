// The pause menu: Bag, Stats, Settings, Controls and the system buttons. Q and E change tab.
import { el, ListBox } from './dom.js';
import { Data } from '../data.js';
import { gs } from '../state.js';
import { Settings } from '../settings.js';

export class PauseMenu {
  constructor(game, { onResume, onMap, onTitle }) {
    this.game = game; this.onResume = onResume; this.onMap = onMap; this.onTitle = onTitle;
    this.isOpen = false; this.tab = 0;
    this.names = ['Bag', 'Stats', 'Settings', 'Controls', 'System'];
    this.tabBar = el('div', { class: 'tabs' });
    this.names.forEach((n, i) => this.tabBar.append(el('button', { class: 'tab', text: n, onclick: () => this.setTab(i) })));
    this.pages = this.names.map(() => el('div', { class: 'page' }));
    this.buildBag(this.pages[0]); this.buildStats(this.pages[1]); this.buildSettings(this.pages[2]); this.buildControls(this.pages[3]); this.buildSystem(this.pages[4]);
    this.root = el('div', { id: 'pause', class: 'overlay' }, el('div', { class: 'pwrap' }, el('h1', { text: 'Salary Man  ·  Pause Menu' }), this.tabBar, ...this.pages, el('div', { class: 'help', text: 'Q / E  change tab      ↑ ↓  choose      Enter  select      Esc  resume      M  map' })));
    document.getElementById('ui').append(this.root);
    this.kd = (e) => this.onKey(e);
  }

  buildBag(p) {
    this.bag = new ListBox({ onSelect: (i, id) => this.bagSelected(id), onActivate: () => this.useSelected(), cls: 'baglist' });
    this.bagNote = el('div', { class: 'bagnote' });
    p.append(el('div', { class: 'bagcols' }, this.bag.root, el('div', { class: 'bagside' }, this.bagNote, el('button', { class: 'btn', text: 'Use  (Enter)', onclick: () => this.useSelected() }))));
  }
  buildStats(p) { this.stats = el('div', { class: 'stats' }); p.append(this.stats); }

  buildSettings(p) {
    const row = (label, ctl) => el('div', { class: 'setrow' }, el('label', { text: label }), ctl);
    const range = (min, max, step, key, fmt, apply) => {
      const out = el('span', { class: 'val' });
      const i = el('input', { type: 'range', min, max, step, 'data-nav': '1' });
      i.value = Settings.v[key];
      const show = () => { out.textContent = fmt(Number(i.value)); };
      i.addEventListener('input', () => { Settings.set(key, Number(i.value)); show(); apply && apply(Number(i.value)); });
      show();
      return el('div', { class: 'ctl' }, i, out);
    };
    const select = (opts, key, apply) => {
      const s = el('select', { 'data-nav': '1' }, opts.map((o) => el('option', { value: o[0], text: o[1] })));
      s.value = Settings.v[key];
      s.addEventListener('change', () => { const v = isNaN(Number(s.value)) ? s.value : Number(s.value); Settings.set(key, v); apply && apply(v); });
      return s;
    };
    const check = (key, apply) => {
      const c = el('input', { type: 'checkbox', 'data-nav': '1' });
      c.checked = !!Settings.v[key];
      c.addEventListener('change', () => { Settings.set(key, c.checked); apply && apply(c.checked); });
      return c;
    };
    const g = this.game;
    p.append(
      row('3D render scale', select([[1, '100%'], [0.85, '85%'], [0.75, '75%'], [0.67, '67%'], [0.5, '50%']], 'renderScale', () => g.applyGraphics())),
      row('Shadows', select([[0, 'Off'], [1, 'Low'], [2, 'High']], 'shadows', () => g.applyGraphics())),
      row('Bloom', check('bloom', () => g.applyGraphics())),
      row('Ambient occlusion', check('ssao', () => g.applyGraphics())),
      row('Reflections on wet roads', check('ssr', () => g.applyGraphics())),
      row('Master volume', range(0, 1, 0.05, 'volume', (v) => Math.round(v * 100) + '%', () => g.applyAudio && g.applyAudio())),
      row('Mouse sensitivity', range(0.3, 2.5, 0.05, 'sens', (v) => v.toFixed(2), (v) => { g.rig.sens = v; })),
      row('Fullscreen', check('fullscreen', (on) => { if (on) document.documentElement.requestFullscreen?.().catch(() => {}); else document.exitFullscreen?.().catch(() => {}); })));
  }

  buildControls(p) {
    p.append(el('div', { class: 'controls', html: `
      <b>On foot</b><br>W A S D move · Shift sprint · Space jump · F enter a shop, use a vending machine, or get in a car · Mouse look · Tab hold: equipment wheel<br><br>
      <b>In a car</b><br>W throttle · S brake and reverse · A D steer · Space handbrake · T flip upright · H headlights · F get out (when nearly stopped)<br><br>
      <b>Wheels</b><br>Hold Tab for the equipment wheel · in a car hold Q for the radio wheel, tap R for the next station · point with the mouse, arrows or a stick, let go to use<br><br>
      <b>Anywhere</b><br>Up arrow (or P) phone · M map · Esc pause · F1 hide help<br><br>
      <b>Gamepad</b><br>Right trigger throttle · left trigger brake · left stick steer or move · right stick look · Y enter or exit, use · X jump · A sprint or handbrake · D-pad up phone · View map · Start pause · LB hold: equipment wheel on foot, radio wheel in a car · R3 flip car` }));
  }

  buildSystem(p) {
    const b = (t, fn) => el('button', { class: 'btn big', text: t, 'data-nav': '1', onclick: fn });
    p.append(el('div', { class: 'sys' },
      b('Resume', () => this.onResume()), b('Open the map', () => { this.close(); this.onMap(); }),
      b('Save', () => { gs.save(); gs.say('System', 'Saved', 'Your game is saved.', 2.5); }),
      b('Return to the title', () => this.onTitle()), b('Quit', () => { window.close(); })));
  }

  open() {
    this.isOpen = true;
    this.root.classList.add('on');
    this.refresh();
    this.setTab(this.tab);
    window.addEventListener('keydown', this.kd, true);
  }
  close() { this.isOpen = false; this.root.classList.remove('on'); window.removeEventListener('keydown', this.kd, true); }

  setTab(i) {
    this.tab = (i + this.names.length) % this.names.length;
    [...this.tabBar.children].forEach((b, k) => b.classList.toggle('on', k === this.tab));
    this.pages.forEach((pg, k) => pg.classList.toggle('on', k === this.tab));
    const first = this.pages[this.tab].querySelector('[data-nav]');
    if (first) first.focus();
  }

  navItems() { return [...this.pages[this.tab].querySelectorAll('[data-nav]')]; }

  onKey(e) {
    if (!this.isOpen) return;
    const k = e.key;
    const ae = document.activeElement;
    const inField = ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT') && ae.type !== 'checkbox';
    if (k === 'Escape') this.onResume();
    else if (k === 'q' || k === 'Q') this.setTab(this.tab - 1);
    else if (k === 'e' || k === 'E') this.setTab(this.tab + 1);
    else if (k === 'm' || k === 'M') { this.close(); this.onMap(); }
    else if (this.tab === 0 && (k === 'ArrowUp' || k === 'ArrowDown')) this.bag.move(k === 'ArrowUp' ? -1 : 1);
    else if (this.tab === 0 && k === 'Enter') this.useSelected();
    else if ((k === 'ArrowUp' || k === 'ArrowDown') && this.tab >= 2) {
      const items = this.navItems(), i = items.indexOf(ae);
      const n = items[(i < 0 ? 0 : i + (k === 'ArrowUp' ? -1 : 1) + items.length) % items.length];
      if (n) n.focus();
    } else if (k === 'Enter' && ae && ae.tagName === 'BUTTON') ae.click();
    else if (k === 'Enter' && ae && ae.type === 'checkbox') ae.click();
    else if (inField && (k === 'ArrowLeft' || k === 'ArrowRight')) return;       // let the slider or list take it
    else if (k === ' ' && ae && ae.type === 'checkbox') return;
    else return;
    e.preventDefault(); e.stopPropagation();
  }

  refresh() {
    this.bag.clear();
    const keys = Object.keys(gs.bag).sort();
    for (const id of keys) {
      const it = Data.item(id);
      this.bag.add(`${it.name || id}  ×${gs.bag[id]}${gs.wearing === id ? '   (worn)' : ''}`, id);
    }
    if (!keys.length) { this.bag.add('The bag is empty. Try a shop.', null); this.bagNote.textContent = ''; }
    else this.bag.select(0);
    const s = gs;
    const owned = Object.keys(s.owned).filter((k) => k !== 'so24');
    const dev = Data.raw.devices[s.device];
    this.stats.innerHTML = [
      `<b>Money</b>   ${s.yen(s.money)}`,
      `<b>Health</b>   ${Math.floor(s.health * 100)}%     <b>Stress</b>   ${Math.floor(s.stress * 100)}%${s.strain() > 0.2 ? '   (it is showing in how he walks and drives)' : ''}`,
      `<b>Time</b>   Day ${s.day}, ${s.clockText()}     awake for ${Math.floor(s.awakeMin / 60)} h`,
      `<b>Phone</b>   ${dev ? dev.name : s.device}`,
      `<b>Wearing</b>   ${s.wearing ? Data.item(s.wearing).name || s.wearing : 'nothing on the ears'}`,
      `<b>Owned</b>   ${owned.length ? owned.join(', ') : 'nothing yet'}`,
    ].join('<br><br>');
  }

  bagSelected(id) {
    if (!id) return;
    const it = Data.item(id);
    const parts = [it.note || ''];
    if (it.stress !== undefined) parts.push(`Stress ${it.stress > 0 ? '+' : ''}${Math.trunc(it.stress * 100)}%`);
    if (it.health !== undefined) parts.push(`Health ${it.health > 0 ? '+' : ''}${Math.trunc(it.health * 100)}%`);
    this.bagNote.textContent = parts.join('\n');
  }

  useSelected() {
    const id = this.bag.data;
    if (!id) return;
    const line = gs.use(id);
    if (line) gs.say('Bag', line, '', 3);
    this.refresh();
  }
}
