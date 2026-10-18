// The heads-up display: money, the clock, health and stress bars, the speedometer with its rev ring, the damage bar, notification toasts above the
// minimap, prompts and the controls hint.
import { gs } from '../state.js';
import { Input } from '../input.js';
import { MiniMap } from './minimap.js';

const APP_COLOURS = { Ryde: '#12b36b', Poodle: '#3b6ea8', Wallet: '#2a2f38', Camera: '#4a5058', MyGram: '#8a2be2', Nihon: '#157a46', Phone: '#2f8a4c', Mail: '#2f6fb0', Music: '#b4365c', Photos: '#d99a1c', Health: '#ff2d55', Map: '#e0457b', Bag: '#9a6bf0', System: '#6b7076', Capsule: '#1d2430', Hayabin: '#f08a2c', Radio: '#e3a82c' };

export class Hud {
  constructor(game) {
    this.game = game;
    this.showHelp = true;
    this.waypointLine = '';
    const root = document.getElementById('ui');
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.innerHTML = `
      <div id="hud-top"><span id="hud-money"></span><span id="hud-clock"></span></div>
      <div id="hud-help"></div>
      <div id="hud-small"></div>
      <div id="hud-prompt"></div>
      <div id="hud-say"></div>
      <div id="hud-waypoint"></div>
      <div id="hud-toasts"></div>
      
      <div id="hud-speed"><svg viewBox="0 0 180 180" width="180" height="180"><path id="rev-bg" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="7"/><path id="rev" fill="none" stroke="#66e6ff" stroke-width="7" stroke-linecap="round"/></svg><b id="spd">0</b><small>km/h</small><em id="gear">1</em><div id="dmg"><i></i></div><div id="slide">SLIDING</div></div>
      <div id="hud-fps"></div>`;
    root.appendChild(this.el);
    this.q = (s) => this.el.querySelector(s);
    this.sayT = 0; this.smallT = 0;
    this.toasts = [];
    this.minimap = new MiniMap(game);
    const arc = (t) => {
      const a0 = (135 * Math.PI) / 180, a1 = a0 + (270 * Math.PI) / 180 * t, r = 82, c = 90;
      const p = (a) => [c + r * Math.cos(a), c + r * Math.sin(a)];
      const [x0, y0] = p(a0), [x1, y1] = p(a1);
      return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
    };
    this.arc = arc;
    this.q('#rev-bg').setAttribute('d', arc(1));
    gs.on('notice', (app, title, body, secs) => this.toast(app, title, body, secs));
  }

  say(text, secs = 3) { this.q('#hud-say').textContent = text; this.sayT = secs; }
  saySmall(text, secs = 3.5) { this.q('#hud-small').textContent = text; this.smallT = secs; }

  toast(app, title, body, secs = 4) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.borderLeftColor = APP_COLOURS[app] || '#888';
    t.innerHTML = `<small></small><b></b><span></span>`;
    t.querySelector('small').textContent = app.toUpperCase();
    t.querySelector('b').textContent = title;
    t.querySelector('span').textContent = body || '';
    this.q('#hud-toasts').prepend(t);
    this.toasts.push({ el: t, life: secs });
    while (this.toasts.length > 4) { const o = this.toasts.shift(); o.el.remove(); }
  }

  update(dt) {
    const g = this.game;
    this.q('#hud-money').textContent = gs.yen(gs.money);
    this.q('#hud-clock').textContent = `Day ${gs.day}  ${gs.clockText()}`;
    const car = g.current;
    this.q('#hud-speed').style.display = car ? '' : 'none';
    if (car) {
      this.q('#spd').textContent = Math.abs(Math.round(car.speedKmh()));
      this.q('#gear').textContent = car.gear === -1 ? 'R' : car.gear === 0 ? 'N' : String(car.gear);
      const t = Math.max(0, Math.min(1.05, car.rpm / car.spec.redline));
      const rev = this.q('#rev');
      rev.setAttribute('d', this.arc(Math.max(0.001, Math.min(1, t))));
      rev.setAttribute('stroke', t < 0.82 ? '#66e6ff' : '#ff5940');
      const dmg = this.q('#dmg i');
      dmg.style.width = car.health + '%';
      dmg.style.background = car.health > 35 ? '#4dd973' : '#e64d40';
      let slip = 0;
      for (const w of car.wheels) slip = Math.max(slip, w.slip);
      this.q('#slide').style.opacity = slip > 1.2 ? 1 : 0;
    }
    this.q('#hud-help').style.display = this.showHelp ? '' : 'none';
    this.q('#hud-help').innerHTML = Input.padConnected
      ? 'Left stick move · right stick look · Y enter / use · X jump · A sprint / handbrake · D-pad ▲ phone · View map · LB wheel (equipment on foot, radio in a car)'
      : 'WASD move &amp; drive · Shift sprint · Space jump / handbrake<br>F get in or out · T flip the car upright · H headlights · F1 hide this<br>Tab (hold) equipment wheel · Q (hold, in a car) radio wheel · R next station · ↑ phone · M map · Esc pause';
    // prompts
    let p = '';
    if (!g.menuOpen()) {
      if (car) p = car.wrecked ? 'Wrecked. F to get out.' : Math.abs(car.forwardSpeed) < 4 ? 'F: get out' : '';
      else {
        const door = g.nearestDoor(g.player.position);
        const veh = g.nearestVehicle(g.player.position);
        if (door) p = door.brand === 'exit' ? 'F: leave' : door.interiorCounter ? 'F: speak to the clerk' : 'F: ' + (door.brand === 'vending' ? 'buy a drink' : door.brand === 'bench' ? 'sit down' : door.brand === 'fishing' ? 'fish' : 'enter ' + door.shopName);
        else if (veh && !veh.wrecked && !g.player.dead) p = 'F: get in';
      }
    }
    const pe = this.q('#hud-prompt');
    pe.textContent = p;
    pe.style.opacity = p ? 1 : 0;
    // the waypoint's distance
    const wl = this.q('#hud-waypoint');
    if (gs.waypoint) {
      const pos = car ? car.position : g.player.position;
      const d = Math.hypot(gs.waypoint.x - pos.x, gs.waypoint.z - pos.z);
      wl.textContent = `${gs.waypointName} · ${Math.floor(d)} m`;
      // arriving takes the waypoint away, as in the web build
      if (d < 14) { gs.waypoint = null; gs.say('Map', 'You have arrived', gs.waypointName, 3.5); }
    } else wl.textContent = '';
    if (this.sayT > 0) { this.sayT -= dt; if (this.sayT <= 0) this.q('#hud-say').textContent = ''; }
    if (this.smallT > 0) { this.smallT -= dt; if (this.smallT <= 0) this.q('#hud-small').textContent = ''; }
    for (const t of [...this.toasts]) {
      t.life -= dt;
      t.el.style.opacity = Math.max(0, Math.min(1, t.life * 2));
      if (t.life <= 0) { t.el.remove(); this.toasts.splice(this.toasts.indexOf(t), 1); }
    }
    this.q('#hud-fps').textContent = `${g.backend} ${g.fps.toFixed(0)} fps`;
    this.minimap.update(dt);
  }
}
