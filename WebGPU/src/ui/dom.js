// Tiny DOM helpers for the menus.
export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in props) {
    if (k === 'class') e.className = props[k];
    else if (k === 'style' && typeof props[k] === 'object') Object.assign(e.style, props[k]);
    else if (k === 'text') e.textContent = props[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), props[k]);
    else if (k === 'html') e.innerHTML = props[k];
    else e.setAttribute(k, props[k]);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}

/** A vertical list you move through with the arrows, with a selection that can be clicked, double-clicked or read. */
export class ListBox {
  constructor({ onSelect = () => {}, onActivate = () => {}, cls = '' } = {}) {
    this.root = el('div', { class: 'listbox ' + cls, tabindex: '-1' });
    this.items = []; this.sel = -1;
    this.onSelect = onSelect; this.onActivate = onActivate;
  }
  clear() { this.root.textContent = ''; this.items = []; this.sel = -1; }
  add(label, data, extra = '') {
    const row = el('div', { class: 'row' }, el('span', { class: 'lbl', text: label }), el('span', { class: 'xtra', text: extra }));
    const i = this.items.length;
    row.addEventListener('click', () => this.select(i));
    row.addEventListener('dblclick', () => { this.select(i); this.onActivate(i, data); });
    this.root.append(row);
    this.items.push({ row, data });
    return i;
  }
  select(i, fire = true) {
    if (!this.items.length) return;
    i = Math.max(0, Math.min(this.items.length - 1, i));
    if (this.sel >= 0 && this.items[this.sel]) this.items[this.sel].row.classList.remove('sel');
    this.sel = i;
    const r = this.items[i].row;
    r.classList.add('sel');
    r.scrollIntoView({ block: 'nearest' });
    if (fire) this.onSelect(i, this.items[i].data);
  }
  move(d) { this.select((this.sel < 0 ? 0 : this.sel) + d); }
  get data() { return this.sel >= 0 ? this.items[this.sel].data : null; }
  get count() { return this.items.length; }
}
