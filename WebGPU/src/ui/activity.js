// The things to do in the city that are not shopping: the bathhouse, pachinko, karaoke, the arcade (snake and breakout), fishing off
// the pier, and sitting on a bench. Each one is a menu and, for most, a short game, and each ends by moving your stress.
// Arrow keys and Enter drive the menus; Esc leaves. Drawn on a canvas, as in the Godot build.
import { el } from './dom.js';
import { Data } from '../data.js';
import { gs } from '../state.js';
import { Rng, clamp } from '../util.js';

const FONT = "'Noto Sans JP','Yu Gothic','Segoe UI',system-ui,sans-serif";

export class ActivityUI {
  constructor(onClose) {
    this.onClose = onClose;
    this.rng = new Rng((Math.random() * 1e9) | 0);
    this.kind = ''; this.title = ''; this.mode = 'menu'; this.opts = []; this.sel = 0; this.rects = []; this.result = ''; this.game = '';
    this.t = 0; this.score = 0; this.isOpen = false; this.keys = new Set();
    this.canvas = el('canvas', { id: 'activity-canvas' });
    this.root = el('div', { id: 'activity', class: 'overlay' }, this.canvas);
    document.getElementById('ui').append(this.root);
    this.kd = (e) => this.onKey(e);
    this.ku = (e) => this.keys.delete(e.code);
    this.canvas.addEventListener('click', (e) => this.onClick(e));
    this.last = 0;
  }

  open(kind) {
    this.kind = kind; this.mode = 'menu'; this.sel = 0; this.result = ''; this.opts = [];
    const M = (label, note, cost, extra = {}) => ({ label, note, cost, ...extra });
    switch (kind) {
      case 'sento':
        this.title = 'Yu no Sato Sento  湯の里';
        this.opts = [M('A quick rinse', '15 minutes', 520, { mins: 15, stress: 0.2, health: 0.04 }), M('A proper soak', '30 minutes', 900, { mins: 30, stress: 0.45, health: 0.08 }), M('The full course', 'an hour: bath, sauna, bath, milk', 1800, { mins: 60, stress: 0.85, health: 0.15 })];
        break;
      case 'pachinko': this.title = 'Golden Lotus Pachinko  パチンコ 黄金'; this.opts = [M('Play a round', '¥1,000 · the lights are the point', 1000)]; break;
      case 'karaoke':
        this.title = 'Karaoke Night  カラオケ 夜';
        this.opts = [M('Last Train Blues', 'slow · ¥1,200', 1200, { bpm: 84 }), M('Overtime Princess', 'medium · ¥1,200', 1200, { bpm: 112 }), M('Ramen Is Life', 'fast · ¥1,200', 1200, { bpm: 138 })];
        break;
      case 'arcade':
        this.title = 'Game Centre Rocket  ゲームセンター';
        this.opts = [M('Snake Run', 'arrows · ¥100', 100, { game: 'snake' }), M('Brick Breaker', 'left and right · ¥100', 100, { game: 'breakout' })];
        break;
      case 'bench': this.title = 'A bench in the park'; this.opts = [M('Sit for a while', '20 minutes · free', 0, { mins: 20, stress: 0.06, health: 0 })]; break;
      case 'fishing': this.title = 'The pier'; this.opts = [M('Cast a line', 'press Space when the marker is in the green', 0)]; break;
    }
    this.root.classList.add('on');
    this.isOpen = true;
    this.resize();
    window.addEventListener('keydown', this.kd, true);
    window.addEventListener('keyup', this.ku, true);
    window.addEventListener('resize', this.rs = () => this.resize());
    this.last = performance.now();
    this.raf = requestAnimationFrame((n) => this.loop(n));
  }

  close() {
    this.root.classList.remove('on');
    this.isOpen = false; this.mode = 'menu';
    window.removeEventListener('keydown', this.kd, true);
    window.removeEventListener('keyup', this.ku, true);
    window.removeEventListener('resize', this.rs);
    cancelAnimationFrame(this.raf);
    this.onClose();
  }

  resize() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; }

  choose(i) {
    const o = this.opts[i];
    if (!o) return;
    const cost = o.cost || 0;
    if (cost > 0 && !gs.spend(cost, this.title.split('  ')[0])) { this.result = `Not enough money. That is ${gs.yen(cost)}.`; this.mode = 'result'; return; }
    switch (this.kind) {
      case 'sento': case 'bench':
        gs.addStress(-o.stress);
        gs.health = clamp(gs.health + o.health, 0, 1);
        gs.advanceMinutes(o.mins);
        this.result = this.kind === 'sento' ? 'You soak until the world goes soft. The stress runs out of you.' : 'You sit. The city does its thing without you. It is lovely.';
        this.mode = 'result';
        break;
      case 'pachinko': {
        this.pachSpin = 2.2; this.mode = 'play'; this.game = 'pachinko'; this.pachReels = ['-', '-', '-'];
        const r = this.rng.next();
        this.pachWin = r < 0.70 ? 0 : r < 0.92 ? this.rng.int(1200, 2000) : r < 0.99 ? this.rng.int(3000, 6000) : 20000;
        break;
      }
      case 'karaoke': this.startKaraoke(o.bpm); break;
      case 'arcade': this.game = o.game; this.startArcade(); break;
      case 'fishing': this.startFishing(); break;
    }
  }

  onKey(e) {
    if (!this.isOpen) return;
    this.keys.add(e.code);
    const k = e.key;
    if (e.repeat && k !== 'ArrowUp' && k !== 'ArrowDown') { e.preventDefault(); e.stopPropagation(); return; }
    if (k === 'Escape') { if (this.mode === 'play') this.finish('You walk away from it.'); else this.close(); }
    else if (this.mode === 'menu') {
      if (k === 'ArrowUp') this.sel = Math.max(this.sel - 1, 0);
      else if (k === 'ArrowDown') this.sel = Math.min(this.sel + 1, this.opts.length - 1);
      else if (k === 'Enter' || k === ' ') this.choose(this.sel);
    } else if (this.mode === 'result') { if (k === 'Enter' || k === ' ') this.mode = 'menu'; }
    else if (this.mode === 'play') this.playKey(e.code, k);
    e.preventDefault(); e.stopPropagation();
  }

  onClick(e) {
    if (this.mode !== 'menu') return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    this.rects.forEach((q, i) => { if (x >= q[0] && x <= q[0] + q[2] && y >= q[1] && y <= q[1] + q[3]) { this.sel = i; this.choose(i); } });
  }

  playKey(code, k) {
    switch (this.game) {
      case 'karaoke': { const lane = { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3, KeyA: 0, KeyS: 1, KeyW: 2, KeyD: 3 }[code]; if (lane !== undefined) this.karaokePress(lane); break; }
      case 'snake': {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] }[code];
        if (d && !(d[0] === -this.dir[0] && d[1] === -this.dir[1])) this.dir = d;
        break;
      }
      case 'fishing': if (k === ' ' || k === 'Enter') this.fishPress(); break;
    }
  }

  finish(text) { this.result = text; this.mode = 'result'; }

  // ---- the games
  startKaraoke(bpm) {
    this.mode = 'play'; this.game = 'karaoke'; this.t = 0; this.hit = 0; this.miss = 0; this.combo = 0; this.notes = [];
    const beat = 60 / bpm, n = Math.floor(26 / beat);
    for (let i = 0; i < n; i++) if (this.rng.chance(0.75)) this.notes.push({ t: 2 + i * beat, lane: this.rng.int(0, 3), done: false });
  }
  karaokePress(lane) {
    for (const nt of this.notes) if (!nt.done && nt.lane === lane && Math.abs(nt.t - this.t) < 0.16) { nt.done = true; this.hit++; this.combo++; return; }
    this.combo = 0;
  }
  startArcade() {
    this.mode = 'play'; this.t = 0; this.score = 0;
    if (this.game === 'snake') { this.snake = [[8, 8], [7, 8], [6, 8]]; this.dir = [1, 0]; this.food = [14, 9]; this.acc = 0; }
    else {
      this.ball = [160, 170]; this.bv = [120, -150]; this.pad = 140; this.bricks = [];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) this.bricks.push([12 + c * 37, 24 + r * 14, 34, 11]);
    }
  }
  startFishing() { this.mode = 'play'; this.game = 'fishing'; this.bite = false; this.wait = this.rng.range(1.2, 3.2); this.bar = 0; this.barDir = 1; this.zone = [0.45, 0.62]; this.t = 0; }
  fishPress() {
    if (!this.bite) { this.finish('You pulled too early. Nothing was ever going to bite that fast.'); return; }
    if (!(this.bar >= this.zone[0] && this.bar <= this.zone[1])) { this.finish('It got away. They always do, in stories you tell later.'); return; }
    const r = this.rng.next();
    let id = 'fish_aji';
    if (r > 0.93) id = 'fish_tai'; else if (r > 0.55) id = 'fish_saba'; else if (r < 0.07) id = 'fish_boot';
    gs.give(id, 1); gs.addStress(-0.03); gs.advanceMinutes(15);
    this.finish(`Caught: ${Data.item(id).name}. It is in the bag.`);
  }

  loop(now) {
    if (!this.isOpen) return;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (this.mode === 'play') this.step(dt);
    this.draw();
    this.raf = requestAnimationFrame((n) => this.loop(n));
  }

  /** One tick of whichever game is running; split out so the tests can drive it. */
  step(dt) {
    this.t += dt;
    switch (this.game) {
      case 'pachinko':
        this.pachSpin -= dt;
        if (this.pachSpin > 0) for (let i = 0; i < 3; i++) this.pachReels[i] = String(this.rng.int(0, 7));
        if (this.pachSpin <= 0) {
          if (this.pachWin > 0) { gs.money += this.pachWin; gs.addStress(-0.06); this.finish(`The balls pour out. You win ${gs.yen(this.pachWin)}.`); }
          else { gs.addStress(-0.02); this.finish('The lights flash for a long time. You win nothing, pleasantly.'); }
          gs.advanceMinutes(20);
        }
        break;
      case 'karaoke':
        for (const nt of this.notes) if (!nt.done && this.t - nt.t > 0.18) { nt.done = true; this.miss++; this.combo = 0; }
        if (this.t > 29) {
          const total = Math.max(this.hit + this.miss, 1), acc = this.hit / total, relief = clamp(0.08 + 0.4 * acc, 0, 0.5);
          gs.addStress(-relief); gs.advanceMinutes(30);
          this.finish(`${this.hit} of ${total} notes. ${acc > 0.8 ? 'A standing ovation, from one man.' : 'Passion over pitch.'} Stress -${Math.floor(relief * 100)}%.`);
        }
        break;
      case 'snake':
        this.acc += dt;
        if (this.acc >= 0.11) {
          this.acc = 0;
          const head = [this.snake[0][0] + this.dir[0], this.snake[0][1] + this.dir[1]];
          if (head[0] < 0 || head[1] < 0 || head[0] >= 20 || head[1] >= 15 || this.snake.some((s) => s[0] === head[0] && s[1] === head[1])) { this.arcadeEnd(); return; }
          this.snake.unshift(head);
          if (head[0] === this.food[0] && head[1] === this.food[1]) { this.score += 10; this.food = [this.rng.int(0, 19), this.rng.int(0, 14)]; }
          else this.snake.pop();
        }
        break;
      case 'breakout': {
        if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) this.pad = Math.max(this.pad - 260 * dt, 24);
        if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) this.pad = Math.min(this.pad + 260 * dt, 296);
        this.ball[0] += this.bv[0] * dt; this.ball[1] += this.bv[1] * dt;
        if (this.ball[0] < 4 || this.ball[0] > 316) this.bv[0] = -this.bv[0];
        if (this.ball[1] < 4) this.bv[1] = Math.abs(this.bv[1]);
        if (this.ball[1] > 214 && this.ball[1] < 222 && Math.abs(this.ball[0] - this.pad) < 28 && this.bv[1] > 0) { this.bv[1] = -Math.abs(this.bv[1]); this.bv[0] += (this.ball[0] - this.pad) * 3; }
        if (this.ball[1] > 240) { this.arcadeEnd(); return; }
        for (const b of this.bricks) {
          if (this.ball[0] >= b[0] && this.ball[0] <= b[0] + b[2] && this.ball[1] >= b[1] && this.ball[1] <= b[1] + b[3]) { this.bricks.splice(this.bricks.indexOf(b), 1); this.bv[1] = -this.bv[1]; this.score += 5; break; }
        }
        if (!this.bricks.length) this.arcadeEnd();
        break;
      }
      case 'fishing':
        if (!this.bite) {
          this.wait -= dt;
          if (this.wait <= 0) { this.bite = true; const x = this.rng.range(0.2, 0.65); this.zone = [x, x + 0.17]; }
        } else {
          this.bar += this.barDir * dt * 1.3;
          if (this.bar > 1) { this.bar = 1; this.barDir = -1; } else if (this.bar < 0) { this.bar = 0; this.barDir = 1; }
          if (this.t > 12) this.finish('The fish lost interest. So did you, a little.');
        }
        break;
    }
  }

  arcadeEnd() {
    const relief = clamp(this.score * 0.0035, 0.01, 0.12);
    gs.addStress(-relief); gs.advanceMinutes(10);
    this.finish(`Score ${Math.floor(this.score)}. Stress -${Math.floor(relief * 100)}%.`);
  }

  // ---- drawing
  draw() {
    const c = this.canvas, g = c.getContext('2d'), W = c.width, H = c.height, cx = W / 2;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(5,8,15,0.9)'; g.fillRect(0, 0, W, H);
    const text = (s, x, y, size, col, align = 'center') => { g.font = `600 ${size}px ${FONT}`; g.textAlign = align; g.fillStyle = col; g.fillText(s, x, y); };
    text(this.title, cx, 80, 34, '#ffebb3');
    text(gs.yen(gs.money), W - 24, 40, 24, '#f2e6b3', 'right');
    this.rects = [];
    if (this.mode === 'menu') {
      let y = 170;
      this.opts.forEach((o, i) => {
        const r = [cx - 300, y, 600, 70];
        this.rects.push(r);
        g.fillStyle = i === this.sel ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)'; g.fillRect(...r);
        text(o.label, r[0] + 20, y + 30, 24, '#fff', 'left');
        text(o.note, r[0] + 20, y + 56, 15, 'rgba(255,255,255,0.65)', 'left');
        if (o.cost > 0) text(gs.yen(o.cost), r[0] + 580, y + 40, 22, '#ffe699', 'right');
        y += 84;
      });
      text('↑ ↓ choose      Enter: go      Esc: leave', cx, H - 50, 16, 'rgba(255,255,255,0.55)');
    } else if (this.mode === 'result') {
      text(this.result, cx, H * 0.45, 26, '#fff');
      text('Enter: back      Esc: leave', cx, H * 0.45 + 60, 16, 'rgba(255,255,255,0.55)');
    } else this.drawGame(g, text, W, H, cx);
  }

  drawGame(g, text, W, H, cx) {
    const oy = 130;
    switch (this.game) {
      case 'pachinko':
        for (let i = 0; i < 3; i++) {
          const x = cx - 190 + i * 130;
          g.fillStyle = '#260a0a'; g.fillRect(x, 260, 110, 140);
          g.strokeStyle = '#ffcc33'; g.lineWidth = 4; g.strokeRect(x, 260, 110, 140);
          text(this.pachReels[i], x + 55, 350, 72, '#ffe64d');
        }
        text('...', cx, 470, 30, 'rgba(255,255,255,0.5)');
        break;
      case 'karaoke': {
        g.fillStyle = '#0d051a'; g.fillRect(cx - 220, oy, 440, 440);
        const cols = ['#ff6680', '#66e6ff', '#99ff80', '#ffd94d'], arrows = ['←', '↓', '↑', '→'];
        for (let l = 0; l < 4; l++) {
          g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(cx - 220 + l * 110, oy, 108, 440);
          g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(cx - 165 + l * 110, oy + 400, 26, 0, 7); g.fill();
          text(arrows[l], cx - 165 + l * 110, oy + 408, 24, 'rgba(255,255,255,0.8)');
        }
        for (const nt of this.notes) {
          if (nt.done) continue;
          const y = oy + 400 - (nt.t - this.t) * 220;
          if (y > oy - 20 && y < oy + 460) { g.fillStyle = cols[nt.lane]; g.beginPath(); g.arc(cx - 165 + nt.lane * 110, y, 24, 0, 7); g.fill(); }
        }
        text(`hits ${this.hit}   misses ${this.miss}   combo ${this.combo}`, cx, oy + 480, 20, '#fff');
        break;
      }
      case 'snake': {
        const cs = 24, ox = cx - 240, oy2 = 140;
        g.fillStyle = '#0a1f0f'; g.fillRect(ox, oy2, 20 * cs, 15 * cs);
        g.fillStyle = '#80f266'; for (const s of this.snake) g.fillRect(ox + s[0] * cs, oy2 + s[1] * cs, cs - 2, cs - 2);
        g.fillStyle = '#ff6666'; g.fillRect(ox + this.food[0] * cs, oy2 + this.food[1] * cs, cs - 2, cs - 2);
        text(`score ${Math.floor(this.score)}`, cx, oy2 + 15 * cs + 40, 22, '#fff');
        break;
      }
      case 'breakout': {
        const k = 2, ox = cx - 320, oy2 = 120;
        g.fillStyle = '#0a0a1f'; g.fillRect(ox, oy2, 320 * k, 240 * k);
        g.fillStyle = '#e68033'; for (const b of this.bricks) g.fillRect(ox + b[0] * k, oy2 + b[1] * k, b[2] * k, b[3] * k);
        g.fillStyle = '#ccd9ff'; g.fillRect(ox + (this.pad - 28) * k, oy2 + 222 * k, 56 * k, 6 * k);
        g.fillStyle = '#fff'; g.beginPath(); g.arc(ox + this.ball[0] * k, oy2 + this.ball[1] * k, 6, 0, 7); g.fill();
        text(`score ${Math.floor(this.score)}`, cx, 120 + 240 * k + 34, 22, '#fff');
        break;
      }
      case 'fishing':
        g.fillStyle = '#1a2e47'; g.fillRect(cx - 260, 300, 520, 40);
        if (this.bite) {
          g.fillStyle = '#4dcc66'; g.fillRect(cx - 260 + this.zone[0] * 520, 300, (this.zone[1] - this.zone[0]) * 520, 40);
          g.fillStyle = '#fff'; g.fillRect(cx - 260 + this.bar * 520 - 3, 292, 6, 56);
          text('A BITE! Space!', cx, 280, 30, '#ffe64d');
        } else text('Waiting. The sea thinks about it.', cx, 280, 24, 'rgba(255,255,255,0.7)');
        break;
    }
  }
}
