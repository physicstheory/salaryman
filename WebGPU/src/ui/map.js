// The full-screen map. Wheel zooms, right-drag or arrows pan, left-click sets a waypoint, X clears it, M or Esc closes.
import { el } from './dom.js';
import { MapDraw, streetName } from './mapdraw.js';
import { gs } from '../state.js';
import { Data } from '../data.js';
import { P, N } from '../world/city.js';

const FONT = "'Noto Sans JP','Yu Gothic','Segoe UI',system-ui,sans-serif";

export class MapUI {
  constructor(game, onClose) {
    this.game = game; this.onClose = onClose;
    this.canvas = el('canvas', { id: 'map-canvas' });
    this.root = el('div', { id: 'map', class: 'overlay' }, this.canvas);
    document.getElementById('ui').append(this.root);
    this.md = new MapDraw();
    this.zoom = 0.55; this.panX = 0; this.panZ = 0; this.dragging = false; this.hover = [0, 0]; this.isOpen = false;
    this.pos = { x: 0, z: 0 }; this.heading = 0;
    this.kd = (e) => this.onKey(e);
    this.canvas.addEventListener('wheel', (e) => { this.zoom = Math.max(0.4, Math.min(4, this.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); e.preventDefault(); this.draw(); }, { passive: false });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2 || e.button === 1) { this.dragging = true; return; }
      if (e.button === 0) { const w = this.md.toWorld(e.offsetX, e.offsetY); this.setWaypoint(w[0], w[1]); this.draw(); }
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousemove', (e) => {
      this.hover = [e.offsetX, e.offsetY];
      if (this.dragging) { const c = Math.cos(-this.md.rot), s = Math.sin(-this.md.rot); const dx = -e.movementX / this.md.scale, dy = -e.movementY / this.md.scale; this.panX += dx * c - dy * s; this.panZ += dx * s + dy * c; }
      this.draw();
    });
  }

  setWaypoint(x, z) {
    gs.waypoint = { x, z };
    gs.waypointName = streetName(x, z);
    gs.say('Map', 'Waypoint set', gs.waypointName, 3);
  }

  open(pos, heading) {
    this.pos = { x: pos.x, z: pos.z }; this.heading = heading;
    this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight;
    this.zoom = Math.max(0.5, Math.min(3, (window.innerHeight - 120) / (P * N + 70)));
    this.panX = this.panZ = P * N * 0.5;
    this.root.classList.add('on'); this.isOpen = true;
    window.addEventListener('keydown', this.kd, true);
    this.draw();
  }
  close() { this.root.classList.remove('on'); this.isOpen = false; window.removeEventListener('keydown', this.kd, true); this.onClose(); }

  onKey(e) {
    if (!this.isOpen) return;
    const k = e.key, step = 30 / this.zoom;
    if (k === 'Escape' || k === 'm' || k === 'M') this.close();
    else if (k === 'x' || k === 'X') gs.waypoint = null;
    else if (k === 'ArrowLeft') this.panX -= step; else if (k === 'ArrowRight') this.panX += step;
    else if (k === 'ArrowUp') this.panZ -= step; else if (k === 'ArrowDown') this.panZ += step;
    else if (k === '=' || k === '+') this.zoom = Math.min(4, this.zoom * 1.2);
    else if (k === '-') this.zoom = Math.max(0.25, this.zoom / 1.2);
    else if (k === 'c' || k === 'C') { this.panX = this.pos.x; this.panZ = this.pos.z; }
    else if (k === 'Enter') { this.setWaypoint(this.panX, this.panZ); }
    else return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) this.hover = [this.canvas.width / 2, this.canvas.height / 2];
    e.preventDefault(); e.stopPropagation();
    this.draw();
  }

  draw() {
    const c = this.canvas, g = c.getContext('2d'), w = c.width, h = c.height;
    const md = this.md;
    md.ox = w / 2; md.oy = h / 2; md.scale = this.zoom; md.rot = 0; md.cx = this.panX; md.cz = this.panZ;
    md.draw(g, this.game.city, true, w, h);
    md.marker(g, this.pos.x, this.pos.z, this.heading, '#ffe633', 10);
    md.waypoint(g, gs.waypoint, w, h);
    // the crosshair a controller pans and sets the waypoint with
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(w / 2, h / 2, 9, 0, 7); g.stroke();
    for (const [a, b] of [[-16, -5], [5, 16]]) { g.beginPath(); g.moveTo(w / 2 + a, h / 2); g.lineTo(w / 2 + b, h / 2); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, w, 44);
    g.font = `700 24px ${FONT}`; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText('TŌKONTO', 20, 30);
    const wd = md.toWorld(this.hover[0], this.hover[1]);
    g.font = `18px ${FONT}`; g.fillStyle = '#b3e6ff'; g.fillText(streetName(wd[0], wd[1]), 160, 30);
    let near = '', bd = 14 / Math.max(this.zoom, 0.3);
    for (const s of this.game.city.shops) { const d = Math.hypot(s.door.x - wd[0], s.door.z - wd[1]); if (d < bd) { bd = d; near = s.shopName; } }
    if (near) { g.fillStyle = '#ffe680'; g.fillText(near, w * 0.5, 30); }
    g.font = `14px ${FONT}`; g.fillStyle = 'rgba(255,255,255,0.65)'; g.textAlign = 'right';
    g.fillText('wheel zoom · right-drag pan · click or Enter waypoint · X clear · C centre · M close', w - 20, 29);
    // legend
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(14, 54, 190, 230);
    const shown = {};
    let y = 70;
    g.textAlign = 'left'; g.font = `14px ${FONT}`;
    for (const s of this.game.city.shops) {
      if (shown[s.brand]) continue;
      shown[s.brand] = true;
      const b = Data.brand(s.brand);
      g.fillStyle = b.band; g.beginPath(); g.arc(30, y - 5, 7, 0, 7); g.fill();
      g.fillStyle = b.stripes[0]; g.beginPath(); g.arc(30, y - 5, 3, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(b.name, 46, y);
      y += 19;
    }
    g.fillStyle = '#d94d40'; g.beginPath(); g.arc(30, y - 5, 4, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText('Vending machine', 46, y);
    if (gs.waypoint) {
      const d = Math.hypot(gs.waypoint.x - this.pos.x, gs.waypoint.z - this.pos.z);
      g.font = `20px ${FONT}`; g.fillStyle = '#ff80bf'; g.textAlign = 'center'; g.fillText(`Waypoint: ${gs.waypointName} · ${Math.floor(d)} m away`, w / 2, h - 22);
    }
  }
}
