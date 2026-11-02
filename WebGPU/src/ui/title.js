// The classic opening: the city turning slowly behind a station nameplate, the sky wound forward so a whole day passes while you sit on the menu,
// and three choices. Enter, or A on the controller.
import { el } from './dom.js';
import { gs } from '../state.js';

export class TitleScreen {
  constructor({ onNew, onContinue, onSettings }) {
    this.onNew = onNew; this.onContinue = onContinue; this.onSettings = onSettings;
    this.sel = 0; this.isOpen = false;
    this.items = [];
    this.menu = el('div', { class: 'tmenu' });
    const sign = el('div', { class: 'sign' },
      el('div', { class: 'sh' }, el('span', { text: 'NHRail  ·  日本レール' }), el('span', { text: 'KT 01' })),
      el('div', { class: 'sb' }, el('div', { class: 'badge' }, el('small', { text: 'KT' }), el('b', { text: '01' })), el('div', { class: 'names' }, el('div', { class: 'jp', text: 'サラリーマン' }), el('div', { class: 'en', text: 'SALARY MAN' }), el('div', { class: 'rule' }))),
      el('div', { class: 'sf' }, el('span', { text: '◀  Mizuho  みずほ' }), el('span', { text: 'Tōkonto  東京都  ▶' })));
    this.root = el('div', { id: 'title' }, el('div', { class: 'tshade' }), el('div', { class: 'tcol' }, sign, this.menu, el('div', { class: 'thint', html: 'ENTER, OR <b>A</b> ON THE CONTROLLER' })), el('div', { class: 'tfoot', text: 'KONTO · ONE ISLAND, ONE SEED' }));
    document.getElementById('ui').append(this.root);
    this.kd = (e) => this.onKey(e);
  }

  open() {
    this.isOpen = true;
    this.root.classList.add('on');
    this.menu.textContent = '';
    this.items = [['NEW GAME', () => this.onNew()]];
    if (gs.hasSave()) this.items.push(['CONTINUE', () => this.onContinue()]);
    this.items.push(['SETTINGS', () => this.onSettings()]);
    this.items.forEach(([t, fn], i) => {
      const b = el('div', { class: 'titem', text: t, onclick: () => { this.sel = i; this.sync(); fn(); }, onmouseenter: () => { this.sel = i; this.sync(); } });
      this.menu.append(b);
    });
    this.sel = 0; this.sync();
    window.addEventListener('keydown', this.kd, true);
  }
  close() { this.isOpen = false; this.root.classList.remove('on'); window.removeEventListener('keydown', this.kd, true); }
  sync() { [...this.menu.children].forEach((c, i) => c.classList.toggle('sel', i === this.sel)); }
  onKey(e) {
    if (!this.isOpen) return;
    if (e.key === 'ArrowDown') this.sel = (this.sel + 1) % this.items.length;
    else if (e.key === 'ArrowUp') this.sel = (this.sel + this.items.length - 1) % this.items.length;
    else if (e.key === 'Enter' || e.key === ' ') { this.items[this.sel][1](); }
    else return;
    this.sync(); e.preventDefault(); e.stopPropagation();
  }
}
