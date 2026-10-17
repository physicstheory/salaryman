// The heads-up display: money, the clock, health and stress bars, the speedometer, prompts, toasts and the controls hint.
import { gs } from '../state.js';
import { Input } from '../input.js';

export class Hud {
  constructor(game) {
    this.game = game;
    this.showHelp = true;
    this.prompt = '';
    const root = document.getElementById('ui');
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.innerHTML = `
      <div id="hud-top"><span id="hud-money"></span><span id="hud-clock"></span></div>
      <div id="hud-help"></div>
      <div id="hud-prompt"></div>
      <div id="hud-say"></div>
      <div id="hud-bars"><div class="bar"><i id="bar-health"></i><span>HEALTH</span></div><div class="bar"><i id="bar-stress"></i><span>STRESS</span></div></div>
      <div id="hud-speed"><b id="spd">0</b><small>km/h</small><em id="gear">1</em></div>
      <div id="hud-fps"></div>`;
    root.appendChild(this.el);
    this.q = (s) => this.el.querySelector(s);
    this.sayT = 0;
  }

  say(text, secs = 3) { this.q('#hud-say').textContent = text; this.sayT = secs; }

  update(dt) {
    const g = this.game;
    this.q('#hud-money').textContent = gs.yen(gs.money);
    this.q('#hud-clock').textContent = `Day ${gs.day}  ${gs.clockText()}`;
    this.q('#bar-health').style.width = (gs.health * 100).toFixed(0) + '%';
    this.q('#bar-stress').style.width = (gs.stress * 100).toFixed(0) + '%';
    const car = g.current;
    this.q('#hud-speed').style.display = car ? '' : 'none';
    if (car) {
      this.q('#spd').textContent = Math.max(0, Math.round(car.speedKmh()));
      this.q('#gear').textContent = car.gear === -1 ? 'R' : String(car.gear);
    }
    this.q('#hud-help').style.display = this.showHelp ? '' : 'none';
    this.q('#hud-help').textContent = Input.padConnected
      ? 'Left stick move · right stick look · X use · A jump / handbrake · Y phone · View map · LB equipment wheel'
      : 'WASD move · Shift run · Space jump / handbrake · E use · P phone · M map · Q equipment · R radio · L lights · H hide this';
    // prompts
    let p = '';
    if (!g.menuOpen()) {
      if (car) p = car.wrecked ? 'Wrecked. E to get out.' : Math.abs(car.forwardSpeed) < 4 ? 'E: get out' : '';
      else {
        const door = g.nearestDoor(g.player.position);
        const veh = g.nearestVehicle(g.player.position);
        if (door) p = 'E: ' + (door.brand === 'vending' ? 'buy a drink' : door.brand === 'bench' ? 'sit down' : door.brand === 'fishing' ? 'fish' : 'enter ' + door.shopName);
        else if (veh && !veh.wrecked && !g.player.dead) p = 'E: get in';
      }
    }
    this.q('#hud-prompt').textContent = p;
    this.q('#hud-prompt').style.opacity = p ? 1 : 0;
    if (this.sayT > 0) { this.sayT -= dt; if (this.sayT <= 0) this.q('#hud-say').textContent = ''; }
    this.q('#hud-fps').textContent = `${g.backend} ${g.fps.toFixed(0)} fps`;
  }
}
