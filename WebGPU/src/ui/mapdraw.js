// Draws the city as a map onto a 2D canvas: the minimap and the full-screen map share this.
// A transform is (origin on screen, pixels per metre, rotation, world centre); north is up when rotation is 0.
import { Data } from '../data.js';
import { P, N } from '../world/city.js';

export const NS = ['Sakura Street', 'Kaigan Road', 'Chūō Avenue', 'Station Street', 'Park Street', 'Aoyama Road', 'Minato Street', 'Higashi Road', 'Seaside Drive'];
export const EW = ['Ginza Street', 'Shibuya Road', 'Marunouchi Avenue', 'Akasaka Street', 'Ueno Road', 'Asakusa Street', 'Roppongi Avenue', 'Shinjuku Road', 'Harbour Drive'];
const SEA = '#0a162b', LAND = '#1a1c24', ROAD = '#454a59', BLOCK = '#292b36', PARK = '#1f4730';
const FONT = "'Noto Sans JP','Yu Gothic','Segoe UI',system-ui,sans-serif";

export function streetName(x, z) {
  const i = Math.max(0, Math.min(N, Math.round(x / P)));
  const j = Math.max(0, Math.min(N, Math.round(z / P)));
  const dx = Math.abs(x - i * P), dz = Math.abs(z - j * P);
  if (dx < 8 && dz < 8) return `${NS[i]} at ${EW[j]}`;
  if (dx < dz) return dx < 14 ? NS[i] : `off ${NS[i]}`;
  return dz < 14 ? EW[j] : `off ${EW[j]}`;
}

export class MapDraw {
  constructor() { this.ox = 0; this.oy = 0; this.scale = 1; this.rot = 0; this.cx = 0; this.cz = 0; }

  toScreen(wx, wz) {
    const dx = (wx - this.cx), dz = (wz - this.cz);
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return [this.ox + (dx * c - dz * s) * this.scale, this.oy + (dx * s + dz * c) * this.scale];
  }
  toWorld(px, py) {
    const x = (px - this.ox) / this.scale, y = (py - this.oy) / this.scale;
    const c = Math.cos(-this.rot), s = Math.sin(-this.rot);
    return [x * c - y * s + this.cx, x * s + y * c + this.cz];
  }

  poly(g, pts, col) { g.fillStyle = col; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); }
  rect(g, x0, z0, x1, z1, col) { this.poly(g, [this.toScreen(x0, z0), this.toScreen(x1, z0), this.toScreen(x1, z1), this.toScreen(x0, z1)], col); }
  line(g, a, b, col, w) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  circle(g, p, r, col) { g.fillStyle = col; g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fill(); }

  draw(g, city, full, w, h) {
    const W = P * N;
    g.fillStyle = SEA; g.fillRect(0, 0, w, h);
    this.rect(g, -34, -34, W + 34, W + 34, LAND);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const park = i === 4 && (j === 3 || j === 4);
      this.rect(g, i * P + 6, j * P + 6, (i + 1) * P - 6, (j + 1) * P - 6, park ? PARK : BLOCK);
    }
    const rw = Math.max(12 * this.scale, 2);
    for (let k = 0; k <= N; k++) {
      this.line(g, this.toScreen(k * P, -6), this.toScreen(k * P, W + 6), ROAD, rw);
      this.line(g, this.toScreen(-6, k * P), this.toScreen(W + 6, k * P), ROAD, rw);
    }
    // the railway, with its station
    const rx = city.railX;
    this.line(g, this.toScreen(rx, 0), this.toScreen(rx, W), '#9ea3b3', Math.max(3 * this.scale, 1.5));
    this.line(g, this.toScreen(rx, 0), this.toScreen(rx, W), '#1a1c24', Math.max(1.2 * this.scale, 0.6));
    const st = this.toScreen(rx, 3 * P + 26);
    this.circle(g, st, Math.max(6 * this.scale, 5), '#14803f');
    this.circle(g, st, Math.max(3.5 * this.scale, 3), '#fff');
    if (full && this.scale > 0.5) { g.font = `14px ${FONT}`; g.fillStyle = '#b3ffcc'; g.textAlign = 'left'; g.fillText('東都駅 Tōkonto Station', st[0] + 10, st[1] + 4); }
    for (const t of city.trains) if (t.waiting <= 0) this.circle(g, this.toScreen(rx + t.trackOff, t.z), Math.max(3 * this.scale, 3), '#fff');
    // shops, in their chain colours
    const rad = !full ? Math.max(4.2 * this.scale, 3.5) : Math.max(4.5 * this.scale, 5);
    for (const s of city.shops) {
      const b = Data.brand(s.brand), p = this.toScreen(s.door.x, s.door.z);
      this.circle(g, p, rad + 1.5, 'rgba(0,0,0,0.7)');
      this.circle(g, p, rad, b.band);
      this.circle(g, p, rad * 0.45, b.stripes[0]);
    }
    for (const v of city.vendors) this.circle(g, this.toScreen(v.door.x, v.door.z), Math.max(2.2 * this.scale, 2), '#d94d40');
    if (full && this.scale > 0.9) {
      g.font = `12px ${FONT}`; g.fillStyle = 'rgba(204,217,255,0.8)'; g.textAlign = 'left';
      for (let k = 0; k <= N; k++) {
        const a = this.toScreen(k * P, 10); g.fillText(NS[k], a[0] + 4, a[1]);
        const b = this.toScreen(10, k * P); g.fillText(EW[k], b[0], b[1] - rw * 0.6);
      }
    }
  }

  /** `heading` is the angle of the facing vector in the x,z plane. */
  marker(g, wx, wz, heading, col, size = 9) {
    const p = this.toScreen(wx, wz);
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    const dx = Math.cos(heading), dz = Math.sin(heading);
    const d = [dx * c - dz * s, dx * s + dz * c];
    const n = [-d[1], d[0]];
    this.poly(g, [[p[0] + d[0] * size * 1.4, p[1] + d[1] * size * 1.4], [p[0] - d[0] * size * 0.9 + n[0] * size * 0.9, p[1] - d[1] * size * 0.9 + n[1] * size * 0.9], [p[0] - d[0] * size * 0.45, p[1] - d[1] * size * 0.45], [p[0] - d[0] * size * 0.9 - n[0] * size * 0.9, p[1] - d[1] * size * 0.9 - n[1] * size * 0.9]], col);
  }

  waypoint(g, wp, w, h) {
    if (!wp) return;
    const p = this.toScreen(wp.x, wp.z), col = '#ff408c';
    const inside = p[0] > 8 && p[0] < w - 8 && p[1] > 8 && p[1] < h - 8;
    if (inside) { this.circle(g, p, 9, 'rgba(0,0,0,0.6)'); this.circle(g, p, 7, col); this.circle(g, p, 3, '#fff'); }
    else {
      const mid = [w / 2, h / 2];
      const dx = p[0] - mid[0], dy = p[1] - mid[1], l = Math.hypot(dx, dy) || 1;
      const d = [dx / l, dy / l], k = Math.min(w, h) * 0.46;
      const e = [mid[0] + d[0] * k, mid[1] + d[1] * k], n = [-d[1], d[0]];
      this.poly(g, [[e[0] + d[0] * 9, e[1] + d[1] * 9], [e[0] - d[0] * 6 + n[0] * 7, e[1] - d[1] * 6 + n[1] * 7], [e[0] - d[0] * 6 - n[0] * 7, e[1] - d[1] * 6 - n[1] * 7]], col);
    }
  }
}
