// The little map in the corner: rotates so your view is always up, shows the shops near you, the railway, and the waypoint
// (as an arrow on the edge when it is off the map).
import { MapDraw } from './mapdraw.js';
import { gs } from '../state.js';

const RANGE = 130;     // metres from the middle to the edge

export class MiniMap {
  constructor(game) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap';
    this.canvas.width = this.canvas.height = 184 * 2;
    this.canvas.style.width = this.canvas.style.height = '184px';
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
    const size = 184, game = this.game;
    const pos = game.current ? game.current.position : game.player.position;
    const yaw = game.rig.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const md = this.md;
    md.rot = -Math.PI * 0.5 - Math.atan2(fz, fx);
    md.scale = size * 0.5 / RANGE;
    md.ox = size / 2; md.oy = size / 2; md.cx = pos.x; md.cz = pos.z;
    g2.save();
    g2.beginPath(); g2.rect(0, 0, size, size); g2.clip();
    md.draw(g2, game.city, false, size, size);
    md.waypoint(g2, gs.waypoint, size, size);
    let heading = Math.atan2(fz, fx);
    if (game.current) { const f = game.current.fwdBody; if (f) heading = Math.atan2(f.z, f.x); }
    md.marker(g2, pos.x, pos.z, heading, '#ffe633', 8);
    g2.restore();
    g2.strokeStyle = 'rgba(255,255,255,0.55)'; g2.lineWidth = 2; g2.strokeRect(1, 1, size - 2, size - 2);
  }
}
