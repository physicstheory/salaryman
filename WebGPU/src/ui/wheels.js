// The two wheels. Hold Q (or LB): a ring of categories (hands, firearms, phones, audio, games, food, drinks, medicine, tech), each showing what
// you have in it; the mouse or a stick points at one, up and down choose within it, letting go uses what is selected. Hold R in a car: a ring of
// radio stations with their logos and what each is playing. Drawn on one canvas, as in the web build.
import { Equipment } from '../equipment.js';
import { gs } from '../state.js';
import { Data } from '../data.js';

const FONT = "'Noto Sans JP','Yu Gothic','Segoe UI',system-ui,sans-serif";
const mix = (a, b, t) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

function seg(g, cx, cy, inner, outer, a0, a1) { g.beginPath(); g.arc(cx, cy, outer, a0, a1); g.arc(cx, cy, inner, a1, a0, true); g.closePath(); }
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
function fit(g, text, w) { while (text.length > 4 && g.measureText(text).width > w) text = text.slice(0, -2); return text; }

/** The little pictures on the equipment wheel, drawn from shapes. */
export function wheelIcon(g, e, cat, cx, cy, r, dim = false) {
  g.save(); g.globalAlpha = dim ? 0.45 : 1; g.translate(cx, cy);
  const ink = '#f5f7fa', id = e.id || '';
  const hue = (s, l = 60) => `hsl(${hash(id) % 360},${s}%,${l}%)`;
  switch (cat) {
    case 'hand':
      if (id === 'umbrella') { g.fillStyle = 'rgba(190,230,255,0.55)'; g.strokeStyle = ink; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * 0.9, Math.PI, 0); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, r * 0.7); g.arc(-r * 0.12, r * 0.7, r * 0.12, 0, Math.PI); g.lineWidth = 3; g.stroke(); }
      else if (id === 'baton') { g.strokeStyle = '#33383f'; g.lineWidth = r * 0.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-r * 0.7, r * 0.6); g.lineTo(r * 0.7, -r * 0.6); g.stroke(); g.strokeStyle = ink; g.beginPath(); g.moveTo(-r * 0.7, r * 0.6); g.lineTo(-r * 0.35, r * 0.25); g.stroke(); }
      else { g.fillStyle = '#f5d19e'; rr(g, -r * 0.55, -r * 0.25, r * 1.1, r * 0.8, r * 0.25); g.fill(); for (let i = 0; i < 4; i++) { rr(g, -r * 0.5 + i * r * 0.27, -r * 0.55, r * 0.24, r * 0.5, r * 0.1); g.fill(); } }
      break;
    case 'gun':
      g.fillStyle = '#eeb3b8'; { const len = id === 'pistol' ? 0.8 : 1.1; rr(g, -r * len * 0.55, -r * 0.3, r * len * 1.1, r * 0.26, 2); g.fill(); g.beginPath(); g.moveTo(-r * 0.2, -r * 0.05); g.lineTo(r * 0.08, -r * 0.05); g.lineTo(r * 0.02, r * 0.6); g.lineTo(-r * 0.24, r * 0.6); g.fill(); }
      break;
    case 'phone': {
      const d = Data.raw.devices[id] || {}, basic = d.ui === 'basic';
      const shell = d.colours ? d.colours[0][1] : (d.body ? d.body[0] : '#4b4e54');
      const w = r * (basic ? 0.58 : 0.62);
      g.fillStyle = shell; g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; rr(g, -w / 2, -r * 0.75, w, r * 1.5, r * 0.14); g.fill(); g.stroke();
      if (basic) { g.fillStyle = '#1a334d'; g.fillRect(-w * 0.4, -r * 0.62, w * 0.8, r * 0.6); g.fillStyle = '#f2f0e6'; for (let k = 0; k < 6; k++) g.fillRect(-w * 0.36 + (k % 3) * w * 0.26, r * 0.12 + Math.floor(k / 3) * r * 0.24, w * 0.2, r * 0.16); }
      else { g.fillStyle = '#1a2e57'; rr(g, -w * 0.43, -r * 0.68, w * 0.86, r * 1.36, r * 0.1); g.fill(); g.fillStyle = 'rgba(230,115,100,0.7)'; g.fillRect(-w * 0.43, r * 0.1, w * 0.86, r * 0.58); }
      break;
    }
    case 'audio':
      g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 3;
      if (id.startsWith('headphones')) { g.beginPath(); g.arc(0, r * 0.1, r * 0.6, Math.PI, 0); g.stroke(); rr(g, -r * 0.75, 0, r * 0.3, r * 0.55, r * 0.1); g.fill(); rr(g, r * 0.45, 0, r * 0.3, r * 0.55, r * 0.1); g.fill(); }
      else for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * r * 0.32, -r * 0.2, r * 0.2, 0, 7); g.fill(); g.lineWidth = r * 0.1; g.beginPath(); g.moveTo(sx * r * 0.32, -r * 0.05); g.lineTo(sx * r * 0.32, r * 0.55); g.stroke(); }
      break;
    case 'game':
      g.fillStyle = hue(55, 55); rr(g, -r * 0.5, -r * 0.7, r, r * 1.4, 4); g.fill();
      g.fillStyle = '#0d0f1a'; rr(g, -r * 0.38, -r * 0.58, r * 0.76, r * 0.7, 2); g.fill();
      g.fillStyle = '#fff'; g.font = `700 ${r * 0.45}px ${FONT}`; g.textAlign = 'center'; g.fillText((e.name || '?')[0], 0, r * 0.45);
      break;
    case 'food':
      if (id.includes('onigiri') || id.includes('rice')) { g.fillStyle = '#faf7f2'; g.beginPath(); g.moveTo(0, -r * 0.7); g.lineTo(r * 0.7, r * 0.55); g.lineTo(-r * 0.7, r * 0.55); g.closePath(); g.fill(); g.fillStyle = '#121f1a'; g.fillRect(-r * 0.35, r * 0.15, r * 0.7, r * 0.4); }
      else { g.strokeStyle = hue(50, 70); g.lineWidth = r * 0.5; g.beginPath(); g.arc(0, -r * 0.05, r * 0.62, 0, Math.PI); g.stroke(); g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.moveTo(-r * 0.7, r * 0.2); g.lineTo(r * 0.7, r * 0.2); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-r * 0.25 + i * r * 0.25, -r * 0.45); g.lineTo(-r * 0.15 + i * r * 0.25, -r * 0.7); g.stroke(); } }
      break;
    case 'drink':
      g.fillStyle = '#d1d6de'; rr(g, -r * 0.28, -r * 0.62, r * 0.56, r * 1.24, r * 0.1); g.fill();
      g.fillStyle = hue(60, 52); g.fillRect(-r * 0.28, -r * 0.28, r * 0.56, r * 0.6);
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(0, r * 0.02, r * 0.12, 0, 7); g.fill();
      break;
    case 'med':
      g.fillStyle = '#f7f7f7'; rr(g, -r * 0.5, -r * 0.5, r, r, r * 0.12); g.fill();
      g.fillStyle = '#d92633'; g.fillRect(-r * 0.1, -r * 0.34, r * 0.2, r * 0.68); g.fillRect(-r * 0.34, -r * 0.1, r * 0.68, r * 0.2);
      break;
    default:
      g.fillStyle = '#99a3b3'; rr(g, -r * 0.4, -r * 0.3, r * 0.8, r * 0.6, r * 0.1); g.fill();
      g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.moveTo(-r * 0.2, -r * 0.3); g.lineTo(-r * 0.2, -r * 0.65); g.moveTo(r * 0.2, -r * 0.3); g.lineTo(r * 0.2, -r * 0.65); g.stroke();
  }
  g.restore();
}

export class Wheels {
  constructor(game) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'wheel-canvas';
    document.getElementById('ui').append(this.canvas);
    this.mode = '';          // '', 'equip' or 'radio'
    this.sel = 0; this.idx = {}; this.fade = 0; this.ptr = { x: 0, y: 0 };
    this.logos = {};
    this.radio = null;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; }
  get open() { return this.mode !== ''; }
  count() { return this.mode === 'radio' ? this.radio.stations().length : Equipment.cats().length; }

  openEquip() { this.mode = 'equip'; this.sel = this.lastEquip ?? 0; this.ptr = { x: 0, y: 0 }; }
  closeEquip() {
    if (this.mode !== 'equip') return '';
    const c = Equipment.cats()[this.sel];
    const l = Equipment.list(c.id);
    const e = l.length ? l[Math.max(0, Math.min(this.idx[c.id] || 0, l.length - 1))] : null;
    this.lastEquip = this.sel;
    this.mode = '';
    return Equipment.apply(c.id, e);
  }
  openRadio() { this.mode = 'radio'; this.sel = this.radio.st; this.ptr = { x: 0, y: 0 }; }
  closeRadio() { if (this.mode !== 'radio') return; this.mode = ''; if (this.sel !== this.radio.st) this.radio.setStation(this.sel); }

  /** Point with a vector (a stick, or the mouse nudged away from the middle): the segment in that direction is selected. */
  point(x, y) {
    if (Math.hypot(x, y) < 0.45) return;
    const n = this.count(), a = Math.atan2(x, -y);
    this.sel = Math.round(a / (Math.PI * 2 / n) + n) % n;
  }
  nudge(dx, dy) {
    this.ptr.x += dx / 110; this.ptr.y += dy / 110;
    const l = Math.hypot(this.ptr.x, this.ptr.y);
    if (l > 1) { this.ptr.x /= l; this.ptr.y /= l; }
    this.point(this.ptr.x, this.ptr.y);
  }
  step(d) { this.sel = (this.sel + d + this.count()) % this.count(); }
  stepItem(d) {
    if (this.mode !== 'equip') return;
    const c = Equipment.cats()[this.sel], l = Equipment.list(c.id);
    if (!l.length) return;
    this.idx[c.id] = ((this.idx[c.id] || 0) + d + l.length) % l.length;
  }

  logo(id) {
    if (!(id in this.logos)) { const im = new Image(); im.src = `./assets/radio/${id}.jpg`; this.logos[id] = im; }
    const im = this.logos[id];
    return im.complete && im.naturalWidth ? im : null;
  }

  update(dt) {
    this.fade += ((this.open ? 1 : 0) - this.fade) * Math.min(1, dt * 12);
    this.canvas.style.opacity = this.fade;
    this.canvas.style.display = this.fade < 0.02 && !this.open ? 'none' : 'block';
    if (this.fade < 0.02 && !this.open) return;
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.mode === 'radio') this.drawRadio(g); else if (this.mode === 'equip') this.drawEquip(g);
  }

  drawEquip(g) {
    const W = this.canvas.width, H = this.canvas.height, sc = Math.min(W, H);
    const cx = W / 2, cy = H * 0.45, outer = sc * 0.30, inner = outer * 0.43;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, H);
    const cats = Equipment.cats(), n = cats.length, step = Math.PI * 2 / n;
    cats.forEach((cat, i) => {
      const mid = i * step - Math.PI / 2, a0 = mid - step / 2 + 0.016, a1 = mid + step / 2 - 0.016, on = i === this.sel;
      const list = Equipment.list(cat.id);
      seg(g, cx, cy, inner, outer, a0, a1);
      if (list.length) {
        g.fillStyle = on ? mix(cat.colour, '#ffffff', 0.18) : mix(cat.colour, '#12141a', 0.52); g.fill();
        g.strokeStyle = on ? '#fff' : mix(cat.colour, '#12141a', 0.25); g.lineWidth = on ? 4 : 2; g.stroke();
      } else {
        g.fillStyle = on ? 'rgba(255,255,255,0.14)' : 'rgba(14,16,20,0.3)'; g.fill();
        g.setLineDash([9, 8]); g.strokeStyle = cat.colour; g.globalAlpha = on ? 0.9 : 0.55; g.lineWidth = 2.5; g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      }
      const gr = (inner + outer) / 2, gx = cx + Math.cos(mid) * gr, gy = cy + Math.sin(mid) * gr;
      if (list.length) {
        const e = list[Math.max(0, Math.min(this.idx[cat.id] || 0, list.length - 1))];
        wheelIcon(g, e, cat.id, gx, gy, outer * 0.2);
        if ((e.count || 1) > 1) {
          g.fillStyle = '#0e1014'; g.beginPath(); g.arc(gx + outer * 0.17, gy + outer * 0.16, 16, 0, 7); g.fill();
          g.fillStyle = '#fff'; g.font = `800 15px ${FONT}`; g.textAlign = 'center'; g.fillText('×' + e.count, gx + outer * 0.17, gy + outer * 0.16 + 5);
        }
      } else { g.globalAlpha = on ? 0.55 : 0.28; g.strokeStyle = cat.colour; g.lineWidth = 3; g.beginPath(); g.arc(gx, gy, outer * 0.085, 0, 7); g.stroke(); g.globalAlpha = 1; }
    });
    const cc = cats[this.sel], list = Equipment.list(cc.id);
    g.fillStyle = 'rgba(10,11,14,0.9)'; g.beginPath(); g.arc(cx, cy, inner - 8, 0, 7); g.fill();
    g.strokeStyle = cc.colour; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, inner - 8, 0, 7); g.stroke();
    const ci = list.length ? Math.max(0, Math.min(this.idx[cc.id] || 0, list.length - 1)) : 0, cur = list[ci];
    g.textAlign = 'center'; const iw = (inner - 14) * 2;
    g.fillStyle = cc.colour; g.font = `800 ${outer * 0.075}px ${FONT}`; g.fillText(cc.name.toUpperCase(), cx, cy - outer * 0.13);
    g.fillStyle = cur ? '#fff' : '#7a828c'; g.font = `700 ${outer * 0.098}px ${FONT}`; g.fillText(fit(g, cur ? cur.name : cc.empty, iw), cx, cy + outer * 0.0);
    g.fillStyle = '#8a929c'; g.font = `500 ${outer * 0.07}px ${FONT}`;
    if (cur) { const sub = ((cur.count || 1) > 1 ? '×' + cur.count + ' · ' : '') + (cur.note || ''); if (sub) g.fillText(fit(g, sub, iw), cx, cy + outer * 0.1); }
    if (list.length > 1) { g.fillStyle = '#6b737d'; g.fillText(`${ci + 1} / ${list.length}`, cx, cy + outer * 0.19); }
    // the strip under the ring
    if (list.length > 1) {
      const sy = cy + outer + sc * 0.09, cell = sc * 0.095, vis = Math.min(list.length, 7);
      const start = Math.max(0, Math.min(ci - Math.floor(vis / 2), list.length - vis));
      const x0 = cx - vis * cell / 2 + cell / 2;
      for (let k = 0; k < vis; k++) {
        const li = start + k, x = x0 + k * cell, sel = li === ci;
        g.fillStyle = sel ? mix(cc.colour, '#12141a', 0.35) : 'rgba(14,16,20,0.62)'; rr(g, x - cell * 0.44, sy - cell * 0.44, cell * 0.88, cell * 0.88, 12); g.fill();
        g.strokeStyle = sel ? '#fff' : 'rgba(255,255,255,0.12)'; g.lineWidth = sel ? 3.5 : 1.5; g.stroke();
        wheelIcon(g, list[li], cc.id, x, sy, cell * (sel ? 0.32 : 0.26));
      }
      g.fillStyle = '#c9ced4'; g.font = `700 28px ${FONT}`;
      if (start > 0) { g.textAlign = 'right'; g.fillText('‹', x0 - cell / 2 - 8, sy + 10); }
      if (start + vis < list.length) { g.textAlign = 'left'; g.fillText('›', x0 + (vis - 1) * cell + cell / 2 + 8, sy + 10); }
    }
  }

  plate(g, s, x, y, w, h) {
    g.save();
    if (s.off) {
      g.fillStyle = '#1b1e23'; rr(g, x - w / 2, y - h / 2, w, h, h * 0.2); g.fill();
      g.strokeStyle = '#cfd5db'; g.lineWidth = Math.max(3, h * 0.07); g.lineCap = 'round';
      g.beginPath(); g.arc(x, y + h * 0.02, h * 0.26, -Math.PI * 0.30, Math.PI * 1.30); g.stroke();
      g.beginPath(); g.moveTo(x, y - h * 0.30); g.lineTo(x, y + h * 0.02); g.stroke();
    } else {
      const im = s.talk ? null : this.logo(s.logo);
      if (im) { const k = Math.min(w / im.naturalWidth, h / im.naturalHeight), dw = im.naturalWidth * k, dh = im.naturalHeight * k; rr(g, x - dw / 2, y - dh / 2, dw, dh, 8); g.clip(); g.drawImage(im, x - dw / 2, y - dh / 2, dw, dh); }
      else {
        g.fillStyle = s.colour; rr(g, x - w / 2, y - h / 2, w, h, h * 0.2); g.fill();
        g.fillStyle = '#fff'; g.textAlign = 'center'; const night = s.talk === 'night';
        g.font = `900 ${Math.round(h * 0.34)}px ${FONT}`; g.fillText(night ? 'NIGHT OWL' : 'KONTO TALK', x, y - h * 0.02);
        g.font = `700 ${Math.round(h * 0.22)}px ${FONT}`; g.fillText(s.freq + (night ? '  ·  24 HOURS' : '  AM'), x, y + h * 0.3);
      }
    }
    g.restore();
  }

  drawRadio(g) {
    const r = this.radio, W = this.canvas.width, H = this.canvas.height, sc = Math.min(W, H);
    const cx = W / 2, cy = H / 2, outer = sc * 0.42, inner = outer * 0.5;
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 0, W, H);
    const list = r.stations(), n = list.length, step = Math.PI * 2 / n;
    g.textAlign = 'center';
    list.forEach((s, i) => {
      const mid = i * step - Math.PI / 2, a0 = mid - step / 2 + 0.012, a1 = mid + step / 2 - 0.012, on = i === this.sel, live = i === r.st;
      seg(g, cx, cy, inner, outer, a0, a1);
      g.fillStyle = on ? mix(s.colour, '#ffffff', 0.12) : mix(s.colour, '#0c0e12', 0.78); g.fill();
      g.strokeStyle = on ? '#fff' : live ? s.colour : 'rgba(255,255,255,0.10)'; g.lineWidth = on ? 4 : live ? 3 : 1.5; g.stroke();
      const gr = (inner + outer) / 2, gx = cx + Math.cos(mid) * gr, gy = cy + Math.sin(mid) * gr;
      this.plate(g, s, gx, gy - 14, outer * 0.36, outer * 0.17);
      g.fillStyle = on ? '#0c0e12' : '#e9edf0'; g.font = `600 ${Math.round(sc * 0.0155)}px ${FONT}`; g.textAlign = 'center';
      if (s.off) g.fillText('Radio off', gx, gy + outer * 0.13);
      else { const inf = r.info(s), tt = s.talk ? 'On air' : inf.title; g.fillText(fit(g, tt, outer * 0.38), gx, gy + outer * 0.13); }
    });
    const s = list[this.sel], inf = r.info(s);
    g.fillStyle = 'rgba(10,11,14,0.93)'; g.beginPath(); g.arc(cx, cy, inner - 8, 0, 7); g.fill();
    g.strokeStyle = s.colour; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, inner - 8, 0, 7); g.stroke();
    this.plate(g, s, cx, cy - inner * 0.42, inner * 1.05, inner * 0.5);
    g.textAlign = 'center';
    if (s.off) {
      g.fillStyle = '#fff'; g.font = `700 ${Math.round(sc * 0.026)}px ${FONT}`; g.fillText('Radio off', cx, cy + inner * 0.14);
      g.fillStyle = '#a9b0b8'; g.font = `500 ${Math.round(sc * 0.018)}px ${FONT}`; g.fillText('Let go to switch it off', cx, cy + inner * 0.38);
      return;
    }
    g.fillStyle = s.colour; g.font = `800 ${Math.round(sc * 0.019)}px ${FONT}`; g.fillText(`${s.freq}  ·  ${s.genre}`, cx, cy + inner * 0.09);
    g.fillStyle = '#fff'; g.font = `700 ${Math.round(sc * 0.024)}px ${FONT}`; g.fillText(fit(g, inf.title, inner * 1.7), cx, cy + inner * 0.31);
    g.fillStyle = '#a9b0b8'; g.font = `500 ${Math.round(sc * 0.018)}px ${FONT}`; g.fillText(fit(g, s.talk ? inf.cap : inf.artist, inner * 1.7), cx, cy + inner * 0.49);
    if (!s.talk) {
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(cx - inner * 0.7, cy + inner * 0.62, inner * 1.4, 5);
      g.fillStyle = s.colour; g.fillRect(cx - inner * 0.7, cy + inner * 0.62, inner * 1.4 * Math.min(1, inf.pos / inf.dur), 5);
    }
  }
}
