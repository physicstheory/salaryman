// The phone, as in the Phone Lab: a handset in the colour you chose, with the cut-out, status bar and bottom controls of its brand (SOTI punch-hole
// and nav buttons, Pear notch or island and home bar, the store phones' keypad), a home screen in its own style, and the apps: Ryde, Poodle, Wallet,
// Camera, Photos, MyGram, Nihon, Phone, Mail, Contacts, Music, Settings and Numbers. P opens and closes it, Esc goes back, the arrows move around.
import { el } from './dom.js';
import { Data } from '../data.js';
import { gs } from '../state.js';
import { Audio_ } from '../audio.js';
import { phoneIcon } from './phoneicons.js';
import { CONTACTS, STATIONS, NEWS, FORUM, POSTS, WALLPAPERS } from './phonedata.js';
import { streetName } from './mapdraw.js';
import { P, N } from '../world/city.js';
import { Rng } from '../util.js';

const FONT = "'Zen Kaku Gothic New','Noto Sans JP','Segoe UI',system-ui,sans-serif";
const DPR = 2;

export const isBasic = (d) => d && d.ui === 'basic';

/** Size of the handset, the glass in it, the status bar and the nav strip: same numbers as the Godot build. */
export function layoutFor(d) {
  if (isBasic(d)) return { bw: 312, bh: 680, screen: [30, 84, 252, 290], status: 22, nav: 20, bez: 5, r: 54 };
  const inch = parseFloat(String(d.screen || '6.1"').replace('"', ''));
  const bw = 318 + (inch - 6.1) * 12;
  const top = d.top || 'punch';
  const status = { punch: 28, notch: 32, island: 40, island2: 38 }[top] || 28;
  const nav = d.nav === 'buttons' ? 30 : 20;
  const bez = d.flat ? 6 : 7;
  return { bw, bh: 680, screen: [bez, bez, bw - bez * 2, 680 - bez * 2], status, nav, bez, r: d.flat ? 30 : 46 };
}

const mixHex = (a, b, t) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const rnd = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

export class PhoneUI {
  constructor(game, { onClose }) {
    this.game = game; this.onClose = onClose;
    this.app = ''; this.pages = []; this.isOpen = false; this.wallI = 0; this.bright = 1;
    this.keys = {}; this.dev = null; this.lay = null; this.viewfinder = false;
    this.back = el('canvas', { class: 'pback' });
    this.wall = el('canvas', { class: 'pwall' });
    this.screen = el('div', { class: 'pscreen' });
    this.dim = el('div', { class: 'pdim' });
    this.front = el('canvas', { class: 'pfront' });
    this.body = el('div', { class: 'pbody' }, this.back, this.wall, this.screen, this.dim, this.front);
    this.flash = el('div', { class: 'pflash' });
    this.vf = el('div', { class: 'pvf' });
    this.root = el('div', { id: 'phone', class: 'overlay-phone' }, this.body);
    document.getElementById('ui').append(this.root, this.flash, this.vf);
    this.front.addEventListener('click', (e) => this.frontClick(e));
    this.kd = (e) => this.onKey(e);
    this.tick = 0;
  }

  device() { return Data.raw.devices[gs.device] || Data.raw.devices.so24; }

  // ---- the handset
  rebuild() {
    const d = this.device();
    this.dev = d; this.devId = d.id; this.paint = gs.phonePaint;
    const L = this.lay = layoutFor(d);
    this.body.style.width = L.bw + 'px'; this.body.style.height = L.bh + 'px';
    for (const c of [this.back, this.front]) { c.width = L.bw * DPR; c.height = L.bh * DPR; c.style.width = L.bw + 'px'; c.style.height = L.bh + 'px'; }
    const [sx, sy, sw, sh] = L.screen;
    this.wall.width = sw * DPR; this.wall.height = sh * DPR;
    Object.assign(this.wall.style, { left: sx + 'px', top: sy + 'px', width: sw + 'px', height: sh + 'px', borderRadius: Math.max(8, L.r - L.bez) + 'px' });
    const inset = isBasic(d) ? 6 : 8;
    Object.assign(this.screen.style, { left: sx + inset + 'px', top: sy + L.status + 'px', width: sw - inset * 2 + 'px', height: sh - L.status - L.nav + 'px' });
    Object.assign(this.dim.style, { left: sx + 'px', top: sy + 'px', width: sw + 'px', height: sh + 'px', borderRadius: Math.max(8, L.r - L.bez) + 'px' });
    this.drawBack(); this.drawWall(); this.drawFront();
  }

  shell() {
    const d = this.dev;
    if (isBasic(d)) return (d.body || ['#0d7a4c'])[0];
    const cols = d.colours || [['', '#6a6f77']];
    return cols[Math.max(0, Math.min(gs.phonePaint, cols.length - 1))][1];
  }

  drawBack() {
    const L = this.lay, g = this.back.getContext('2d'), d = this.dev;
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, L.bw, L.bh);
    const c = this.shell();
    if (isBasic(d)) {
      const c2 = (d.body || [0, '#08492d'])[1];
      const gr = g.createLinearGradient(0, 0, 0, L.bh); gr.addColorStop(0, c); gr.addColorStop(1, c2);
      g.fillStyle = gr; rr(g, 0, 0, L.bw, L.bh, L.r); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3; rr(g, 1.5, 1.5, L.bw - 3, L.bh - 3, L.r); g.stroke();
      return;
    }
    g.fillStyle = mixHex(c, '#ffffff', 0.34); rr(g, 0, 0, L.bw, L.bh, L.r); g.fill();
    g.fillStyle = c; rr(g, 2, 2, L.bw - 4, L.bh - 4, L.r - 2); g.fill();
    g.fillStyle = mixHex(c, '#000000', 0.5); rr(g, 4, 4, L.bw - 8, L.bh - 8, L.r - 3); g.fill();
    g.fillStyle = mixHex(c, '#ffffff', 0.2); g.fillRect(L.bw - 1, 150, 3, 56); g.fillRect(L.bw - 1, 220, 3, 56);
  }

  drawWall() {
    const [, , w, h] = this.lay.screen, g = this.wall.getContext('2d'), d = this.dev;
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h);
    const wp = WALLPAPERS[this.wallI];
    let top = wp[1], bottom = wp[2];
    const lin = (c0, c1, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(0, y0, w, y1 - y0); };
    if (d.ui === 'pear') {
      if (this.wallI === 0) { top = '#5a3fa0'; bottom = '#2a8a86'; }
      lin(mixHex(bottom, '#000000', 0.35), mixHex(top, '#ffffff', 0.05), 0, h);
      for (const [x, y, r, col] of [[0.2, 0.28, 0.62, 'rgba(80,190,170,0.28)'], [0.85, 0.62, 0.7, 'rgba(150,90,230,0.3)'], [0.3, 0.95, 0.55, 'rgba(25,128,140,0.22)']]) { g.fillStyle = col; g.beginPath(); g.arc(w * x, h * y, w * r, 0, 7); g.fill(); }
    } else if (isBasic(d)) {
      const b0 = d.body[0], b1 = d.body[1];
      lin(mixHex(b0, '#ffffff', 0.1), b1, 0, h);
      const st = d.stripes || ['#e8711a', '#cf2027'];
      for (let j = 0; j < 2; j++) { const y0 = h * (0.2 + j * 0.06); g.fillStyle = st[j]; g.globalAlpha = 0.8; g.beginPath(); g.moveTo(w * 0.35, y0); g.lineTo(w * 0.8, y0 - 14); g.lineTo(w * 0.8, y0 - 4); g.lineTo(w * 0.35, y0 + 10); g.fill(); g.globalAlpha = 1; }
      if (d.id === 'petmart') for (let k = 0; k < 7; k++) { const px = rnd(k, 11) * w, py = rnd(k, 12) * h; g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(px, py, 7, 0, 7); g.fill(); for (let t = 0; t < 4; t++) { g.beginPath(); g.arc(px + (t - 1.5) * 7, py - 9 - (t === 1 || t === 2 ? 3 : 0), 2.6, 0, 7); g.fill(); } }
    } else {
      // dusk over Tōkonto: indigo overhead, warm at the horizon, the bay below it
      const hz = h * 0.66;
      lin(mixHex(top, '#ffffff', 0.1), bottom, 0, hz);
      lin('#0f1129', '#1a1a33', hz, h);
      g.fillStyle = 'rgba(46,36,61,0.9)'; g.beginPath(); g.moveTo(0, hz); g.lineTo(w * 0.28, hz - h * 0.12); g.lineTo(w * 0.5, hz - h * 0.05); g.lineTo(w * 0.74, hz - h * 0.17); g.lineTo(w, hz); g.fill();
      let x = 0, i = 0;
      while (x < w) {
        const bw = 16 + rnd(i, 1) * 26, bh = h * (0.06 + rnd(i, 2) * 0.2);
        g.fillStyle = '#0d0d1c'; g.fillRect(x, hz - bh, bw, bh);
        for (let wy = 0; wy < Math.floor(bh / 9); wy++) for (let wx = 0; wx < Math.floor(bw / 7); wx++) if (rnd(i * 31 + wy, wx + 3) > 0.62) { g.fillStyle = 'rgba(255,209,128,0.85)'; g.fillRect(x + 3 + wx * 7, hz - bh + 4 + wy * 9, 3, 4); }
        x += bw + 1; i++;
      }
      for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(255,196,128,${0.06 + rnd(k, 8) * 0.16})`; g.fillRect(rnd(k, 5) * w, hz + 4 + rnd(k, 6) * (h - hz) * 0.5, 3 + rnd(k, 7) * 9, 1.4); }
    }
  }

  drawFront() {
    const L = this.lay, g = this.front.getContext('2d'), d = this.dev;
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, L.bw, L.bh);
    this.keyRects = {};
    const [sx, sy, sw, sh] = L.screen;
    const basic = isBasic(d);
    if (basic) {
      g.strokeStyle = '#000'; g.lineWidth = 6; rr(g, sx - 3, sy - 3, sw + 6, sh + 6, 16); g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(L.bw / 2 - 30, 28, 60, 5);
      g.fillStyle = '#fff'; g.font = `700 15px ${FONT}`; g.textAlign = 'center'; g.fillText(d.id === 'eleven' ? '11 PHONE' : 'PETO', L.bw / 2, 58);
      this.status(g, d.id === 'eleven' ? '11 Mobile' : 'Peto Link');
      this.keypad(g);
      return;
    }
    g.strokeStyle = '#05050a'; g.lineWidth = L.bez + 1; rr(g, (L.bez + 1) / 2, (L.bez + 1) / 2, L.bw - L.bez - 1, L.bh - L.bez - 1, L.r - 1); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 1; rr(g, 0.5, 0.5, L.bw - 1, L.bh - 1, L.r); g.stroke();
    this.status(g, '5G');
    const top = d.top || 'punch', cx = L.bw / 2;
    if (top === 'punch') { g.fillStyle = '#000'; g.beginPath(); g.arc(cx, sy + 14, 5.5, 0, 7); g.fill(); g.fillStyle = '#1a1f33'; g.beginPath(); g.arc(cx, sy + 14, 2, 0, 7); g.fill(); }
    else if (top === 'notch') {
      const w = L.bw * 0.4; g.fillStyle = '#000'; rr(g, cx - w / 2, sy - 18, w, 42, 16); g.fill();
      g.fillStyle = '#292930'; rr(g, cx - 22, sy + 6, 44, 5, 3); g.fill(); g.fillStyle = '#14141f'; g.beginPath(); g.arc(cx + 28, sy + 9, 3.5, 0, 7); g.fill();
    } else {
      const w = top === 'island' ? 92 : 74, h = top === 'island' ? 26 : 21;
      g.fillStyle = '#000'; rr(g, cx - w / 2, sy + 9, w, h, h / 2); g.fill();
      if (this.playing()) {
        g.fillStyle = '#5a3fb0'; rr(g, cx - w / 2 + 6, sy + 12, h - 6, h - 6, 4); g.fill();
        for (let i = 0; i < 4; i++) { const hh = 4 + ((i * 5 + Math.floor(performance.now() / 120)) % 9); g.fillStyle = '#ff4a6a'; g.fillRect(cx + w / 2 - 26 + i * 6, sy + 9 + h / 2 - hh / 2, 3, hh); }
      }
    }
    const by = sy + sh;
    if (d.nav === 'buttons') {
      const ny = by - 15; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.8; g.lineCap = 'round';
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(cx - 70 + i * 4.5, ny - 6); g.lineTo(cx - 70 + i * 4.5, ny + 6); g.stroke(); }
      g.beginPath(); g.arc(cx, ny, 7, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(cx + 74, ny - 7); g.lineTo(cx + 66, ny); g.lineTo(cx + 74, ny + 7); g.stroke();
      this.keyRects = { recents: [cx - 90, ny - 14, 40, 28], home: [cx - 20, ny - 14, 40, 28], back: [cx + 50, ny - 14, 40, 28] };
    } else {
      g.fillStyle = 'rgba(255,255,255,0.88)'; rr(g, cx - 54, by - 11, 108, 4, 2); g.fill();
      this.keyRects = { home: [cx - 60, by - 18, 120, 18] };
    }
  }

  status(g, carrier) {
    const L = this.lay, [sx, sy, sw] = L.screen, d = this.dev;
    const y = sy + 19, top = d.top || 'none';
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = `${isBasic(d) ? 600 : 600} ${isBasic(d) ? 11 : 13}px ${FONT}`;
    g.fillText(gs.clockText(), sx + (top === 'notch' || top.startsWith('island') ? 22 : 14), y);
    const rx = sx + sw - 12;
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1; rr(g, rx - 22, y - 10, 22, 11, 3); g.stroke();
    g.fillRect(rx - 20, y - 8, 15, 7); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(rx + 1, y - 7, 2, 5);
    g.fillStyle = '#fff';
    const bx = rx - 56; for (let i = 0; i < 4; i++) g.fillRect(bx + i * 5, y - 3 - i * 2.5, 3, 3 + i * 2.5);
    if (top === 'punch' || isBasic(d)) { g.font = `10px ${FONT}`; g.textAlign = 'right'; g.fillText(carrier, bx - 6, y); }
  }

  keypad(g) {
    const L = this.lay, d = this.dev, bw = L.bw, x0 = 26, kw = (bw - 52 - 20) / 3;
    const shell = this.shell(), dark = d.body[1], accent = d.accent || '#e8711a';
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 - 6, 398); g.lineTo(bw - x0 + 6, 398); g.stroke();
    const btn = (rc, fill, label, ink, size = 12) => { g.fillStyle = fill; rr(g, ...rc, 8); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.stroke(); g.fillStyle = ink; g.font = `700 ${size}px ${FONT}`; g.textAlign = 'center'; g.fillText(label, rc[0] + rc[2] / 2, rc[1] + 19); };
    let y = 410;
    [['MENU', 'home', mixHex(shell, '#ffffff', 0.12)], ['OK', 'ok', accent], ['BACK', 'back', mixHex(shell, '#ffffff', 0.12)]].forEach((k, i) => { const rc = [x0 + i * (kw + 10), y, kw, 28]; btn(rc, k[2], k[0], k[1] === 'ok' && accent === '#ffffff' ? '#0e4f9a' : '#fff'); this.keyRects[k[1]] = rc; });
    y += 36;
    [['CALL', 'call', '#2cb860'], ['C', 'clear', mixHex(shell, '#ffffff', 0.08)], ['END', 'end', '#cf2027']].forEach((k, i) => { const rc = [x0 + i * (kw + 10), y, kw, 28]; btn(rc, k[2], k[0], '#fff'); this.keyRects[k[1]] = rc; });
    y += 38;
    const digits = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];
    digits.forEach((dg, i) => {
      const rc = [x0 + (i % 3) * (kw + 10), y + Math.floor(i / 3) * 40, kw, 34];
      g.fillStyle = '#f3efe6'; rr(g, ...rc, 8); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.stroke();
      g.fillStyle = dark; g.font = `700 20px ${FONT}`; g.textAlign = 'left'; g.fillText(dg[0], rc[0] + 10, rc[1] + 24);
      g.fillStyle = '#666'; g.font = `8px ${FONT}`; g.textAlign = 'right'; g.fillText(dg[1], rc[0] + rc[2] - 8, rc[1] + 22);
      this.keyRects['d' + dg[0]] = rc;
    });
  }

  frontClick(e) {
    const r = this.front.getBoundingClientRect();
    const x = (e.clientX - r.left) * (this.lay.bw / r.width), y = (e.clientY - r.top) * (this.lay.bh / r.height);
    for (const k in this.keyRects) {
      const q = this.keyRects[k];
      if (x >= q[0] && x <= q[0] + q[2] && y >= q[1] && y <= q[1] + q[3]) { this.onKeyPad(k); return; }
    }
  }
  onKeyPad(k) {
    switch (k) {
      case 'home': case 'recents': this.goHome(); break;
      case 'back': case 'clear': if (this.app === '') this.close(); else this.backPage(); break;
      case 'ok': { const f = document.activeElement; if (f && this.screen.contains(f)) f.click(); break; }
      case 'end': this.close(); break;
      case 'call': this.openApp('Phone'); break;
      default: if (k[0] === 'd') { const inp = this.screen.querySelector('input'); if (inp) { inp.value += k[1]; inp.dispatchEvent(new Event('input')); } }
    }
  }

  playing() { return Audio_.bandOn && Audio_.bandStyle >= 0 && Audio_.bandStyle <= 5; }

  // ---- opening and closing
  open() {
    this.isOpen = true;
    this.root.classList.add('on');
    const d = this.device();
    if (d.id !== this.devId || gs.phonePaint !== this.paint) { this.app = ''; this.rebuild(); }
    if (this.app === '') this.goHome(); else this.buildApp(this.app);
    window.addEventListener('keydown', this.kd, true);
    this.timer = setInterval(() => { if (this.isOpen && !this.viewfinder) this.drawFront(); }, 150);
  }
  close() {
    if (this.viewfinder) this.endViewfinder();
    this.isOpen = false;
    this.root.classList.remove('on');
    window.removeEventListener('keydown', this.kd, true);
    clearInterval(this.timer);
    this.onClose();
  }

  clear() { this.screen.textContent = ''; }
  push(builder) { this.pages.push(builder); this.clear(); builder(); this.focusFirst(); }
  backPage() {
    if (this.viewfinder) this.endViewfinder();
    if (this.pages.length > 1) { this.pages.pop(); this.clear(); this.pages[this.pages.length - 1](); this.focusFirst(); }
    else this.goHome();
  }
  rerender() { this.clear(); this.pages[this.pages.length - 1](); this.focusFirst(); }
  focusFirst() { const f = this.screen.querySelector('[data-nav]'); if (f) f.focus({ preventScroll: true }); }

  // ---- keys: the arrows move round the screen like a D-pad does on a real handset
  onKey(e) {
    if (!this.isOpen) return;
    const k = e.key;
    const ae = document.activeElement;
    const typing = ae && ae.tagName === 'INPUT' && ae.type === 'text';
    if (k === 'p' || k === 'P') { if (typing) return; this.close(); }
    else if (k === 'Escape') { if (this.app === '') this.close(); else this.backPage(); }
    else if (this.viewfinder && (k === ' ' || k === 'Enter')) this.takePhoto();
    else if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
      if (typing && (k === 'ArrowLeft' || k === 'ArrowRight')) return;
      if (ae && ae.type === 'range' && (k === 'ArrowLeft' || k === 'ArrowRight')) return;
      this.spatial(k.slice(5).toLowerCase());
    }
    else if (k === 'Enter') { if (ae && this.screen.contains(ae) && ae.tagName !== 'INPUT') ae.click(); }
    else return;
    e.preventDefault(); e.stopPropagation();
  }

  spatial(dir) {
    const items = [...this.screen.querySelectorAll('[data-nav]')].filter((n) => n.offsetParent);
    if (!items.length) return;
    const cur = document.activeElement && items.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) { items[0].focus(); return; }
    const a = cur.getBoundingClientRect(), ac = [a.left + a.width / 2, a.top + a.height / 2];
    let best = null, bd = Infinity;
    for (const n of items) {
      if (n === cur) continue;
      const b = n.getBoundingClientRect(), bc = [b.left + b.width / 2, b.top + b.height / 2];
      const dx = bc[0] - ac[0], dy = bc[1] - ac[1];
      const ok = dir === 'up' ? dy < -4 : dir === 'down' ? dy > 4 : dir === 'left' ? dx < -4 : dx > 4;
      if (!ok) continue;
      const primary = dir === 'up' || dir === 'down' ? Math.abs(dy) : Math.abs(dx), cross = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      const dist = primary + cross * 2.2;
      if (dist < bd) { bd = dist; best = n; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); }
  }

  // ---- the home screen, in the style of the handset
  goHome() {
    this.app = ''; this.pages = []; this.endViewfinder();
    this.clear();
    const d = this.dev, ui = d.ui, s = this.screen;
    const apps = this.homeApps();
    const basic = isBasic(d);
    const mk = (cls, text, style = {}) => el('div', { class: cls, text, style });
    if (ui === 'pear') {
      const t = gs.clockText();
      s.append(el('div', { class: 'widgets' },
        el('div', { class: 'glass w' }, mk('wl', 'TŌKONTO'), mk('wbig', t), mk('wsm', `Day ${gs.day}`)),
        el('div', { class: 'glass w' }, mk('wl', 'WEATHER'), mk('wbig', '18°'), mk('wsm', 'Clear · H 21° L 12°'))));
    } else if (!basic) {
      s.append(el('div', { class: 'bigclock' }, mk('', gs.clockText()), mk('d', `Day ${gs.day} · Tōkonto`)));
    }
    const grid = el('div', { class: 'grid ' + (basic ? 'g3' : 'g4') + ' ' + ui });
    apps.forEach((a) => grid.append(this.appCell(a, basic ? 38 : ui === 'pear' ? 50 : 46, basic ? 9 : ui === 'pear' ? 10 : 11)));
    s.append(grid);
    if (ui === 'pear') s.append(el('div', { class: 'searchpill', text: '⌕ Search' }));
    if (!basic) {
      const dock = el('div', { class: 'dock ' + ui });
      for (const n of ['Ryde', 'Poodle', 'Phone', 'Camera']) { const a = apps.find((x) => x[0] === n); if (a) dock.append(this.icon(a, ui === 'pear' ? 50 : 46)); }
      s.append(dock);
    } else {
      s.append(el('div', { class: 'ticker', text: d.id === 'eleven' ? '●  OPEN 24 HOURS  ●  ONIGIRI 2 FOR ¥200' : '●  PET MART  ●  YOUR NEIGHBOURHOOD STORE' }));
    }
    this.focusFirst();
  }

  homeApps() {
    const basic = isBasic(this.dev);
    const list = Data.raw.phone_apps.filter((a) => !basic || Data.raw.basic_apps.includes(a[0]));
    if (gs.owned.pearwatch || gs.owned.pearwatchu) list.push(['Health', '#ff2d55', 'heart']);
    return list;
  }

  icon(a, size) {
    const c = el('canvas', { class: 'appicon' });
    c.width = c.height = size * DPR; c.style.width = c.style.height = size + 'px';
    const g = c.getContext('2d'); g.scale(DPR, DPR);
    phoneIcon(g, 0, 0, size, a[1], a[2]);
    if (a[0] === 'Mail') {
      const n = gs.mails.filter((m) => !m.read).length;
      if (n > 0) { g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(size * 0.93, size * 0.07, size * 0.19, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = `800 ${size * 0.22}px ${FONT}`; g.textAlign = 'center'; g.fillText(n > 9 ? '9+' : String(n), size * 0.93, size * 0.07 + size * 0.08); }
    }
    return c;
  }

  appCell(a, size, fs) {
    const b = el('button', { class: 'appcell', 'data-nav': '1', onclick: () => this.openApp(a[0]) }, this.icon(a, size), el('span', { text: a[0], style: { fontSize: fs + 'px' } }));
    return b;
  }

  openApp(name) { this.app = name; this.pages = []; this.buildApp(name); }

  buildApp(name) {
    const map = { Ryde: () => this.ryde(), Poodle: () => this.poodle(), Wallet: () => this.wallet(), Camera: () => this.camera(), Photos: () => this.photos(), MyGram: () => this.mygram(), Nihon: () => this.nihon(), Phone: () => this.dialer(), Mail: () => this.mail(), Contacts: () => this.contacts(), Music: () => this.music(), Settings: () => this.settings(), Numbers: () => this.numbers(), Health: () => this.health() };
    if (map[name]) this.push(map[name]); else this.goHome();
  }

  // ---- builders
  page(title) {
    const root = el('div', { class: 'ppage' });
    const head = el('div', { class: 'phead' }, el('button', { class: 'pback-btn', 'data-nav': '1', text: '‹ Back', onclick: () => this.backPage() }), el('div', { class: 'ptitle', text: title }));
    const list = el('div', { class: 'plist' });
    root.append(head, list);
    this.screen.append(root);
    return { root, list };
  }
  btn(parent, text, cb, cls = '') {
    const b = el('button', { class: 'pbtn ' + cls, 'data-nav': '1', onclick: cb });
    String(text).split('\n').forEach((ln, i) => b.append(el('div', { class: i ? 'sub' : 'main', text: ln })));
    parent.append(b);
    return b;
  }
  text(parent, t, size = 15, col = 'rgba(255,255,255,0.9)') { const d = el('div', { class: 'ptext', text: t, style: { fontSize: size + 'px', color: col } }); parent.append(d); return d; }

  // ---- Ryde: a car to anywhere you can name
  destinations() {
    const c = this.game.city;
    const out = [['Tōkonto Station', { x: c.railX - 14, z: 3 * P + 26 }], ['The park', { x: 4.5 * P, z: 3 * P + 12 }], ['The harbour', { x: 8 * P - 8, z: 4 * P }], ['Where you started', { x: 2 * P + 7, z: 5 * P + 11 }]];
    const seen = {};
    for (const s of c.shops) {
      if (seen[s.shopName]) continue;
      seen[s.shopName] = 1;
      out.push([`${s.shopName} (${streetName(s.door.x, s.door.z)})`, { x: s.door.x, z: s.door.z }]);
    }
    return out;
  }
  ryde() {
    const { list, root } = this.page('Ryde');
    this.text(list, 'Where to? A car is three minutes away, and it is always an Audi.', 14, 'rgba(255,255,255,0.7)');
    const here = this.game.player.position;
    for (const d of this.destinations()) {
      const dist = Math.hypot(d[1].x - here.x, d[1].z - here.z), fare = 380 + Math.floor(dist * 1.4);
      this.btn(list, `${d[0]}\n${gs.yen(fare)} · ${Math.floor(dist)} m`, () => this.rydeGo(d[0], d[1], fare), 'green');
    }
  }
  rydeGo(place, pos, fare) {
    if (this.game.current) { gs.say('Ryde', 'Get out of your car first', 'Ryde only picks up pedestrians.', 3); return; }
    if (!gs.spend(fare, 'Ryde to ' + place)) { gs.say('Ryde', 'Not enough money', `The fare is ${gs.yen(fare)}.`, 3); return; }
    this.close();
    this.game.rydeTo(pos.x, pos.z, place);
  }

  // ---- Poodle: the internet
  poodle() {
    const { list } = this.page('Poodle');
    const search = el('input', { type: 'text', class: 'psearch', placeholder: 'Search the web', 'data-nav': '1' });
    const results = el('div', { class: 'results' });
    list.append(search, results);
    const fill = (filter) => {
      results.textContent = '';
      const f = filter.toLowerCase();
      for (const [arr, cls] of [[Data.raw.web, 'blue'], [Data.raw.filler_sites, 'grey']]) {
        for (const s of arr) if (!f || `${s.title} ${s.host} ${s.kw || ''}`.toLowerCase().includes(f)) this.btn(results, `${s.title}\n${s.host}`, () => this.site(s), cls);
      }
    };
    search.addEventListener('input', () => fill(search.value));
    fill('');
  }
  site(s) { this.push(() => this.sitePage(s)); }
  sitePage(s) {
    const { list } = this.page(s.title);
    this.text(list, s.host, 12, '#99ccff');
    const kind = s.kind || 'page';
    if (kind === 'shop' || kind === 'tech') {
      const shelves = kind === 'shop' ? Data.shelvesFor(s.brand) : Data.dokotoShelves();
      this.text(list, 'Order online. It arrives with Hayabin, in the bag.', 13, 'rgba(255,255,255,0.65)');
      for (const sh of shelves) {
        this.text(list, sh.name, 16, '#ffd980');
        for (const it of sh.items) this.btn(list, `${it.name}   ${gs.yen(Number(it.price || 0))}`, () => this.webBuy(it, (it.days || 0) * 24 + 2));
      }
    } else if (kind === 'cars') {
      this.text(list, 'Showroom prices. Test drives happen at the lot; the lot opens in a later build.', 13, 'rgba(255,255,255,0.65)');
      const cars = { luxury: [['Audi RS Q8', 18900000], ['Audi A7 Sportback', 11800000], ['BYD Song', 4980000]], budget: [['Kei car', 980000], ['Kei van', 1180000], ['Family sedan', 2180000]], cruiser: [['Hadson Roadking', 2890000], ['Hadson Sportster', 1980000]] };
      for (const c of cars[s.tier || 'budget'] || []) this.text(list, `${c[0]}   ${gs.yen(c[1])}`, 17);
    } else if (kind === 'news') for (const n of NEWS) this.text(list, '• ' + n, 15);
    else if (kind === 'forum') for (const f of FORUM) { this.text(list, f[0], 16, '#ffd980'); this.text(list, '↳ ' + f[1], 14, 'rgba(255,255,255,0.7)'); }
    else if (kind === 'scam') {
      this.text(list, '★ CONGRATULATIONS! ★\nYou are our 1,000,000th visitor and have WON a free vacation.', 18, '#ffe64d');
      this.btn(list, 'CLAIM NOW (processing fee ¥3,000)', () => {
        if (gs.spend(3000, 'win-now.biz processing fee')) {
          gs.say('Poodle', 'Fee paid', 'No vacation has been, or will be, received.', 4);
          gs.mails.unshift({ from: 'win-now.biz', subject: 'Your vacation (pending)', body: 'Thank you for your fee. Your vacation is in the post. The post is also in the post.', read: false });
        }
      }, 'red');
    } else if (kind === 'gov') for (const l of ['Tōkonto City Hall — Services', 'Parking fines: pay at the counter (counters open Tuesdays)', 'Residence certificate: Form 7-B, in triplicate', 'Lost property: umbrellas, 4,112; umbrellas collected, 3']) this.text(list, l, 15);
    else { this.text(list, s.tag || '', 17, '#ffd980'); for (const l of s.lines || []) this.text(list, l, 15); }
  }
  webBuy(it, hours) {
    const id = it.id;
    if (it.device) {
      if (gs.owned[it.device]) { gs.say('Poodle', 'You already own that', '', 2.5); return; }
      if (gs.spend(Number(it.price), it.name)) { gs.owned[it.device] = true; gs.device = it.device; gs.phonePaint = 0; gs.say('Phone', 'New phone', `${it.name} is yours.`, 4); this.rebuildSoon(); }
      else gs.say('Poodle', 'Not enough money', '', 2.5);
      return;
    }
    if (it.tv || it.game || it.gear) {
      if (gs.owned[id]) gs.say('Poodle', 'You already own that', '', 2.5);
      else if (gs.spend(Number(it.price), it.name)) { gs.owned[id] = true; gs.say('Hayabin', 'Order placed', `${it.name} ships to the safehouse.`, 4); }
      else gs.say('Poodle', 'Not enough money', '', 2.5);
      return;
    }
    if (!gs.order(id, it.name, Number(it.price || 0), hours)) gs.say('Poodle', 'Not enough money', '', 2.5);
  }
  rebuildSoon() { setTimeout(() => { if (this.isOpen) { this.rebuild(); } }, 0); }

  // ---- Wallet
  wallet() {
    const { list } = this.page('Wallet');
    this.text(list, gs.yen(gs.money), 36, '#f2e6b3').style.textAlign = 'center';
    if (gs.deliveries.length) { this.text(list, 'On its way', 14, '#ffd980'); for (const d of gs.deliveries) this.text(list, `📦 ${d.name} · about ${Math.max(0, Math.floor(d.due - gs.absMinute()))} min`, 13); }
    this.text(list, 'Recent', 14, '#ffd980');
    if (!gs.ledger.length) this.text(list, 'Nothing spent yet.', 14, 'rgba(255,255,255,0.6)');
    for (const l of gs.ledger) this.text(list, `Day ${l.day} ${l.clock}   ${l.what}   ${gs.yen(l.yen)}`, 13);
  }

  // ---- Camera and Photos
  camera() {
    this.viewfinder = true;
    this.body.style.visibility = 'hidden';
    const d = this.dev;
    this.vf.className = 'pvf on';
    this.vf.innerHTML = '';
    this.vf.append(el('div', { class: 'vfinfo', text: `${d.name} · camera ${d.cam}/10` }), el('div', { class: 'vfgrid' }),
      el('div', { class: 'vfhint', text: `Space: take photo      Esc: back      ${gs.photos.length} in the gallery` }),
      el('div', { class: 'vfshutter', onclick: () => this.takePhoto() }));
    // an empty page keeps the Back stack consistent
    const { list } = this.page('Camera');
    list.append(el('div'));
    this.screen.style.visibility = 'hidden';
  }
  endViewfinder() {
    if (!this.viewfinder) return;
    this.viewfinder = false;
    this.body.style.visibility = '';
    this.screen.style.visibility = '';
    this.vf.className = 'pvf';
  }
  takePhoto() {
    this.game.capture((url) => {
      gs.photos.push(url);
      if (gs.photos.length > 24) gs.photos.shift();
      this.flash.style.opacity = 0.8;
      setTimeout(() => { this.flash.style.opacity = 0; }, 90);
      gs.say('Camera', 'Photo saved', `${gs.photos.length} in the gallery`, 2.5);
    });
  }
  photos() {
    const { list } = this.page('Photos');
    if (!gs.photos.length) { this.text(list, 'No photos yet. The Camera app has a shutter.', 14, 'rgba(255,255,255,0.65)'); return; }
    for (const url of gs.photos.slice(-12).reverse()) list.append(el('img', { class: 'photo', src: url }));
  }

  // ---- MyGram
  mygram() {
    const { list } = this.page('MyGram');
    const rng = new Rng(gs.day * 977 + Math.floor(gs.clockMin / 120));
    const handles = ['aiko_in_tokonto', 'salaryman_no_1', 'noodle.hunter', 'last.train.kei', 'umbrella_thief_hq', 'konbini_poet', 'night.shift.mika', 'pachinko_ghost'];
    const shops = this.game.city.shops;
    for (let k = 0; k < 10; k++) {
      const tmpl = rng.pick(POSTS), shop = shops.length ? rng.pick(shops) : null;
      const street = shop ? streetName(shop.door.x, shop.door.z) : 'the main street';
      const text = tmpl.replace('{shop}', shop ? shop.shopName : 'that shop').replace('{brand}', shop ? shop.shopName : 'that place').replace('{street}', street).replace('{station}', 'Tōkonto Station');
      const key = `p${gs.day}_${k}_${tmpl.length}`;
      const likes = rng.int(8, 4200);
      const card = el('div', { class: 'post' }, el('div', { class: 'handle', text: '@' + rng.pick(handles) }), el('div', { text }));
      const lb = el('button', { class: 'pbtn like', 'data-nav': '1', text: `♥ ${likes + (gs.liked[key] ? 1 : 0)}`, onclick: () => { if (!gs.liked[key]) { gs.liked[key] = true; gs.addStress(-0.004); lb.textContent = `♥ ${likes + 1}`; } } });
      card.append(lb);
      list.append(card);
    }
  }

  // ---- Nihon: the trains, as they actually are
  nihon() {
    const { list } = this.page('Nihon Rail');
    this.text(list, 'Tōkonto Station · Kanjō Loop', 18, '#99ffbf');
    const sz = 3 * P + 26;
    for (const t of this.game.city.trains) {
      const name = t.dir > 0 ? 'Northbound (to the harbour road)' : 'Southbound (to the old town)';
      if (t.waiting > 0) this.text(list, `${name}\nDeparting the depot in ${Math.floor(t.waiting)} s`, 15);
      else { const d = (sz - t.z) * t.dir; if (d >= 0) this.text(list, `${name}\nArriving in ${Math.floor(d / t.speed)} s`, 15); else this.text(list, `${name}\nHas just left the station`, 15, 'rgba(255,255,255,0.6)'); }
    }
    this.text(list, 'Please stand behind the yellow line. The yellow line is also a suggestion.', 13, 'rgba(255,255,255,0.55)');
  }

  // ---- Phone, Contacts, Numbers
  dialer() {
    const { list } = this.page('Phone');
    const num = el('input', { type: 'text', class: 'dialnum', readonly: 'readonly', value: '' });
    const g = el('div', { class: 'dialpad' });
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']) g.append(el('button', { class: 'pbtn key', 'data-nav': '1', text: k, onclick: () => { num.value += k; } }));
    list.append(num, g, el('div', { class: 'dialrow' }, el('button', { class: 'pbtn', 'data-nav': '1', text: '⌫', onclick: () => { num.value = num.value.slice(0, -1); } }), el('button', { class: 'pbtn green grow', 'data-nav': '1', text: 'Call', onclick: () => this.call(num.value) })));
  }
  contacts() {
    const { list } = this.page('Contacts');
    for (const c of CONTACTS) this.btn(list, `${c[0]}\n${c[1]}`, () => this.call(c[0]), 'tan');
  }
  numbers() {
    const { list } = this.page('Emergency numbers');
    this.text(list, 'Free from any phone. Please use for emergencies.', 13, 'rgba(255,255,255,0.6)');
    for (const c of [['110  Police', '110'], ['119  Ambulance and fire', '119'], ['118  Coast guard', '118']]) this.btn(list, c[0], () => this.call(c[1]), 'red');
  }
  call(who) {
    let line = '';
    switch (who) {
      case '110': line = "Police: 'Is anyone hurt? ...No? Then please see the nearest koban.'"; break;
      case '118': line = "Coast guard: 'You are calling from inland. We admire the optimism.'"; break;
      case '119':
        if (gs.health >= 0.95) line = "Ambulance: 'Are you ill? You sound well. Please eat something and call back.'";
        else if (gs.spend(12000, 'Ambulance')) { gs.health = Math.min(1, gs.health + 0.6); gs.addStress(-0.1); gs.advanceMinutes(180); line = 'The ambulance came. Three hours at the hospital, ¥12,000, and you feel much better.'; gs.say('Health', 'Treated at hospital', '+60% health', 4); }
        else line = "Ambulance: 'Sir, there is a fee.' You cannot afford the fee.";
        break;
      case 'Mom': gs.addStress(-0.05); line = 'Mom talks for twenty minutes. She asks if you are eating properly. You are, technically.'; break;
      case 'Section Chief Hara': gs.addStress(0.08); line = "Hara: 'A brief word. It will take four hours.' It takes four hours."; gs.advanceMinutes(60); break;
      case 'Ramen Ippai (reservations)': line = "'We do not take reservations. We do not have a reservations book. Please just come.'"; break;
      case 'Ryde Support': line = "'Your driver has been located. Your driver has located you. We are both very pleased.'"; break;
      default: line = 'No answer. The phone rings in an empty room, somewhere.';
    }
    this.push(() => { const { list } = this.page('Calling ' + who); this.text(list, '📞', 64).style.textAlign = 'center'; this.text(list, line, 17); });
  }

  // ---- Mail
  mail() {
    const { list } = this.page('Mail');
    for (const m of gs.mails) this.btn(list, `${m.read ? '' : '● '}${m.from}\n${m.subject}`, () => { m.read = true; this.push(() => this.mailPage(m)); }, m.read ? '' : 'blue');
  }
  mailPage(m) {
    const { list } = this.page(m.subject);
    this.text(list, 'From: ' + m.from, 14, '#99ccff');
    this.text(list, m.body, 16);
  }

  // ---- Music
  music() {
    const { list } = this.page('Music');
    const worn = gs.wearing !== '';
    if (!worn) this.text(list, 'Put on earphones to listen. The bag has them, if you have bought a pair.', 14, '#ffb366');
    else this.text(list, `Wearing ${Data.item(gs.wearing).name || gs.wearing}.`, 13, '#99ffb3');
    for (const s of STATIONS) {
      const on = Audio_.bandOn && Audio_.bandStyle === s[3];
      this.btn(list, `${on ? '▶  ' : ''}${s[0]}\n${s[1]}${s[2] > 0 ? '' : ' · a man reads out the weather'}`, () => {
        if (!gs.wearing) { gs.say('Music', 'Nothing in your ears', 'Wear earphones first.', 3); return; }
        Audio_.playBand(s[3], s[2] || 60, 0);
        gs.addStress(-0.01);
        this.rerender();
      }, on ? 'pink' : '');
    }
    this.btn(list, '■  Stop', () => { Audio_.stopBand(); this.rerender(); });
  }

  // ---- Settings and Health
  settings() {
    const { list } = this.page('Settings');
    const d = this.dev;
    this.text(list, `${d.name}\n${d.note || ''}`, 14, 'rgba(255,255,255,0.7)');
    this.text(list, 'Wallpaper', 16, '#ffd980');
    const row = el('div', { class: 'swatches' });
    WALLPAPERS.forEach((w, i) => row.append(el('button', { class: 'pbtn sw', 'data-nav': '1', text: w[0], style: { background: w[2] }, onclick: () => { this.wallI = i; this.drawWall(); } })));
    list.append(row);
    const cols = d.colours || [];
    if (cols.length > 1) {
      this.text(list, 'Colour: ' + cols[Math.max(0, Math.min(gs.phonePaint, cols.length - 1))][0], 16, '#ffd980');
      const crow = el('div', { class: 'swatches' });
      cols.forEach((c, i) => crow.append(el('button', { class: 'pbtn dot', 'data-nav': '1', style: { background: c[1] }, onclick: () => { gs.phonePaint = i; this.drawBack(); this.drawFront(); this.rerender(); } })));
      list.append(crow);
    }
    this.text(list, 'Brightness', 16, '#ffd980');
    const s = el('input', { type: 'range', min: 0.3, max: 1, step: 0.05, value: this.bright, 'data-nav': '1' });
    s.addEventListener('input', () => { this.bright = Number(s.value); this.dim.style.background = `rgba(0,0,0,${1 - this.bright})`; });
    list.append(s);
  }
  health() {
    const { list } = this.page('Health');
    this.text(list, `Health  ${Math.floor(gs.health * 100)}%`, 26, '#ff5966');
    this.text(list, `Stress  ${Math.floor(gs.stress * 100)}%`, 20, '#66b3ff');
    this.text(list, `Awake for ${Math.floor(gs.awakeMin / 60)} hours.`, 16);
    this.text(list, gs.strain() < 0.2 ? 'You are fine.' : 'Your watch suggests ramen, a purchase, or fresh air.', 15, 'rgba(255,255,255,0.7)');
  }
}
