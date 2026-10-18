// The little map in the corner: rotates so your view is always up, shows the shops near you, the railway, and the waypoint
// (as an arrow on the edge when it is off the map).
import { MapDraw } from './mapdraw.js';
import { gs } from '../state.js';

const RANGE = 130;
const SIZE = 220;     // metres from the middle to the edge

export class MiniMap {
  constructor(game) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap';
    this.canvas.width = this.canvas.height = SIZE * 2;
    this.canvas.style.width = this.canvas.style.height = SIZE + 'px';
    document.getElementById('hud').append(this.canvas);
    this.md = new MapDraw();
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    if (this.t < 0.05) return;
    this.t = 0;
    const g2 = this.canvas.getContext('2d');
    const S = this.canvas.width;
    g2.setTransform(2, 0, 0, 2, 0, 0);
    const size = SIZE, game = this.game;
    const pos = game.current ? game.current.position : game.player.position;
    const yaw = game.rig.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const md = this.md;
    md.rot = -Math.PI * 0.5 - Math.atan2(fz, fx);
    md.scale = size * 0.5 / RANGE;
    md.ox = size / 2; md.oy = size / 2; md.cx = pos.x; md.cz = pos.z;
    g2.clearRect(0, 0, size, size);
    g2.save();
    g2.beginPath(); g2.arc(size / 2, size / 2, size * 0.405, 0, Math.PI * 2); g2.clip();
    g2.fillStyle = '#1b2a33'; g2.fillRect(0, 0, size, size);
    md.draw(g2, game.city, false, size, size);
    md.waypoint(g2, gs.waypoint, size, size);
    let heading = Math.atan2(fz, fx);
    if (game.current) { const f = game.current.fwdBody; if (f) heading = Math.atan2(f.z, f.x); }
    md.marker(g2, pos.x, pos.z, heading, '#ffe633', 8);
    g2.restore();
    g2.strokeStyle = 'rgba(12,14,18,0.8)'; g2.lineWidth = 3; g2.beginPath(); g2.arc(size / 2, size / 2, size * 0.405, 0, Math.PI * 2); g2.stroke();
    // the vitals ring the map, as in the web build: health outside, stress inside
    const ring = (r, v, col, w) => {
      g2.lineWidth = w; g2.lineCap = 'round';
      g2.strokeStyle = 'rgba(0,0,0,0.45)'; g2.beginPath(); g2.arc(size / 2, size / 2, r, 0, Math.PI * 2); g2.stroke();
      if (v > 0.001) { g2.strokeStyle = col; g2.beginPath(); g2.arc(size / 2, size / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, v)); g2.stroke(); }
    };
    ring(size * 0.465, gs.health, '#d8483c', size * 0.03);
    ring(size * 0.425, gs.stress, '#3f8fe0', size * 0.026);
  }
}
