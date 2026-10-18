// The game: boots the city, the player, the cars and the traffic, runs the fixed-step simulation and the render loop, and wires the controls,
// the menus, the wheels, the phone, the radio and the title screen.
import * as THREE from 'three/webgpu';
import { Physics, STEP } from './physics.js';
import { createRenderer, createScene } from './render.js';
import { City, P, N } from './world/city.js';
import { Player } from './player.js';
import { CamRig } from './camrig.js';
import { Vehicle } from './vehicle/vehicle.js';
import { AIDriver } from './vehicle/ai.js';
import { Input } from './input.js';
import { gs } from './state.js';
import { Rng, clamp, moveToward } from './util.js';
import { sky } from './world/sky.js';
import { Lod } from './lod.js';
import { Hud } from './ui/hud.js';
import { ShopUI } from './ui/shop.js';
import { ActivityUI } from './ui/activity.js';
import { MapUI } from './ui/map.js';
import { PauseMenu } from './ui/pause.js';
import { PhoneUI } from './ui/phone.js';
import { Wheels } from './ui/wheels.js';
import { TitleScreen } from './ui/title.js';
import { CarRadio } from './radio.js';
import { Audio_ } from './audio.js';
import { Settings } from './settings.js';
import { buildPost } from './post.js';
import { Interiors } from './world/interior.js';

export const START = new THREE.Vector3(2 * P + 7, 0.3, 5 * P + 11);
const TRAFFIC = 14;
const ACTIVITIES = ['sento', 'pachinko', 'karaoke', 'arcade', 'bench', 'fishing'];

export class Game {
  constructor() {
    this.parked = []; this.traffic = []; this.ais = [];
    this.current = null;
    this.paused = false;          // the simulation stops (menus, map)
    this.uiOpen = false;          // a shop, activity or phone is up
    this.phoneOpen = false;
    this.lights = false;
    this.titleUp = false;
    this.acc = 0;
    this.last = performance.now();
    this.t = 0;
    this.fps = 0; this._fpsN = 0; this._fpsT = 0;
    this.radioHold = -1;
    this.listeners = [];
    this.post = null;
  }

  async init(say) {
    say('Starting the renderer…');
    const { renderer, backend } = await createRenderer();
    this.renderer = renderer; this.backend = backend;
    const { scene, camera } = createScene();
    this.scene = scene; this.camera = camera;
    Input.attach(renderer.domElement);
    say('Physics…');
    this.phys = await Physics.create();
    this.city = new City(this.phys, renderer, scene);
    this.interiors = new Interiors(this.phys, scene);
    this.inside = null;
    await this.city.build(say);
    this.sky = this.city.sky;
    say('People and cars…');
    this.player = new Player(this.phys, START.x, START.y, START.z);
    scene.add(this.player.group);
    this.player.on('died', (r) => this.onDied(r));
    this.sky.focus = this.player.group;
    this.rig = new CamRig(camera, this.phys);
    this.rig.target = this.player;
    this.rig.sens = Settings.v.sens;
    this.rig.snap();
    await this.spawnCars();
    say('Interface…');
    this.hud = new Hud(this);
    this.radio = new CarRadio((t) => gs.say('Radio', t, '', 3));
    this.wheels = new Wheels(this);
    this.wheels.radio = this.radio;
    this.shopUI = new ShopUI(() => this.closeOverlay());
    this.activityUI = new ActivityUI(() => this.closeOverlay());
    this.mapUI = new MapUI(this, () => this.closeMap());
    this.pauseMenu = new PauseMenu(this, { onResume: () => this.resume(), onMap: () => this.openMap(), onTitle: () => this.toTitle() });
    this.phone = new PhoneUI(this, { onClose: () => this.closePhone() });
    this.phone.rebuild();
    this.title = new TitleScreen({ onNew: () => this.begin(false), onContinue: () => this.begin(true), onSettings: () => { this.title.close(); this.pauseMenu.open(); this.pauseMenu.setTab(2); this.paused = true; this.fromTitleSettings = true; } });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.bindControls();
    this.applyGraphics();
    this.fade = document.createElement('div');
    this.fade.id = 'fade';
    document.getElementById('ui').append(this.fade);
    this.showTitle();
  }

  // ---- graphics settings
  applyGraphics() {
    const s = Settings.v;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25) * s.renderScale);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    const sun = this.sky.sun, moon = this.sky.moon;
    this.renderer.shadowMap.enabled = s.shadows > 0;
    const size = s.shadows >= 2 ? 4096 : 2048;
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    this.shadowsOn = s.shadows > 0;
    this.post = buildPost(this.renderer, this.scene, this.camera, { bloom: s.bloom, ssao: s.ssao });
  }
  applyAudio() { Audio_.setVolume(Settings.v.volume); }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25) * Settings.v.renderScale);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.wheels) this.wheels.resize();
  }

  // ---- cars
  makeVehicle(kind, x, y, z, yawDeg) {
    const v = new Vehicle(this.phys, kind, { x, y, z }, yawDeg);
    this.scene.add(v.group);
    v.onCrash((s) => { if (v === this.current) { this.rig.bump(s); this.rumble(s); } });
    return v;
  }

  async spawnCars() {
    const kinds = ['rsq8', 'a7', 'byd_song', 'kei'];
    kinds.forEach((k, i) => this.parked.push(this.makeVehicle(k, 2 * P + 3, 0.9, 5 * P + 4 - 8 * i, 0)));
    const rng = new Rng(5);
    const tk = ['a7', 'byd_song', 'rsq8', 'kei', 'keivan', 'sedan'];
    for (let i = 0; i < TRAFFIC; i++) {
      const vert = rng.chance(0.5);
      const road = rng.int(0, N);
      const along = rng.range(20, P * N - 20);
      const dir = rng.chance(0.5) ? 1 : -1;
      const kind = rng.pick(tk);
      const speed = rng.range(9, 14);
      const h = vert ? new THREE.Vector3(0, 0, dir) : new THREE.Vector3(dir, 0, 0);
      const left = new THREE.Vector3(h.z, 0, -h.x);
      const pos = vert ? new THREE.Vector3(road * P, 0.9, along).addScaledVector(left, 3) : new THREE.Vector3(along, 0.9, road * P).addScaledVector(left, 3);
      pos.y = 0.9;
      // keep clear of the start and of the railway cutting
      if (pos.distanceTo(START) < 45 || Math.abs(pos.x - this.city.railX) < 12) continue;
      const yaw = (Math.atan2(-h.x, -h.z) * 180) / Math.PI;
      const v = this.makeVehicle(kind, pos.x, 0.9, pos.z, yaw);
      v.lightsOn = sky.night > 0.3;
      this.traffic.push(v);
      this.ais.push(new AIDriver(v, this.city, h, speed, this.phys, rng));
    }
  }

  nearestVehicle(p, maxD = 4) {
    let best = null, bd = maxD;
    for (const v of [...this.parked, ...this.traffic]) {
      const t = v.body.translation();
      const d = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  enter(v) {
    if (this.current) return;
    this.current = v;
    // take it over from the AI if it was driving itself
    const i = this.traffic.indexOf(v);
    if (i >= 0) { this.traffic.splice(i, 1); this.parked.push(v); }
    this.ais = this.ais.filter((a) => a.car !== v);
    this.player.active = false;
    this.player.setVisible(false);
    this.player.hideBody(true);
    v.driverPresent = true;
    // lights come on by themselves after dark; L still overrides
    this.lights = sky.night > 0.3;
    v.lightsOn = this.lights;
    this.rig.target = v;
    this.rig.chase = true;
    this.emit('enter', v);
  }

  leave() {
    if (!this.current) return;
    const v = this.current;
    this.current = null;
    v.driverPresent = false;
    v.throttle = 0; v.brake = 0.5; v.steerIn = 0; v.handbrake = true;
    const t = v.body.translation();
    const q = v.body.rotation();
    const left = new THREE.Vector3(-1, 0, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    this.player.hideBody(false);
    this.player.teleport(t.x + left.x * 2.3, 0.3, t.z + left.z * 2.3);
    this.player.setVisible(true);
    this.player.active = true;
    this.player.camYaw = this.rig.yaw;
    this.rig.target = this.player;
    this.rig.chase = false;
    Audio_.engineStop();
    this.emit('leave', v);
  }

  onDied(reason) {
    this.hud && this.hud.say(reason, 3);
    setTimeout(() => {
      this.player.revive(START.x, START.y, START.z);
      this.rig.target = this.player;
      this.rig.snap();
    }, 2500);
  }

  /** The nearest door you can go through: a shop's, a vending machine's, a bench or the pier. */
  nearestDoor(p, r = 3.2) {
    let best = null, bd = r;
    if (this.inside) {
      const R = this.inside;
      for (const s of [R.exit, R.counter]) { const d = Math.hypot(s.door.x - p.x, s.door.z - p.z); if (d < bd) { bd = d; best = s; } }
      return best;
    }
    for (const s of [...this.city.shops, ...this.city.vendors, ...this.city.spots]) {
      const d = Math.hypot(s.door.x - p.x, s.door.z - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // ---- small events
  on(name, fn) { this.listeners.push([name, fn]); }
  emit(name, ...a) { for (const [n, f] of this.listeners) if (n === name) f(...a); }

  rumble(strength) {
    const g = Input.pad();
    if (g && g.vibrationActuator && g.vibrationActuator.playEffect) {
      try { g.vibrationActuator.playEffect('dual-rumble', { duration: 280, strongMagnitude: clamp(strength * 0.08, 0, 1), weakMagnitude: clamp(strength * 0.05, 0, 0.6) }); } catch (e) { /* no rumble */ }
    }
  }

  // ---- screens: what is up decides what the keys mean
  menuOpen() { return this.paused || this.uiOpen || this.titleUp || this.phoneOpen || this.mapUI.isOpen; }
  wheelOpen() { return this.wheels && this.wheels.open; }
  setMenuMode(on) { Input.menuMode = on; if (on) Input.capture(false); }

  /** Through the shop's door: fade, then the room. Leaving puts Seiko back on the pavement outside. */
  walkIn(door) {
    this.doorOut = { x: door.door.x, z: door.door.z, face: this.player.face, brand: door.brand };
    this.fade.style.opacity = 1;
    setTimeout(() => {
      const r = this.interiors.enter(door.brand);
      this.inside = r;
      this.player.teleport(r.entry.x, r.entry.y, r.entry.z);
      this.player.face = Math.PI;
      this.rig.snap();
      this.fade.style.opacity = 0;
    }, 350);
  }
  walkOut() {
    this.fade.style.opacity = 1;
    setTimeout(() => {
      const o = this.doorOut;
      this.interiors.leave();
      this.inside = null;
      this.player.teleport(o.x, 0.3, o.z);
      this.rig.snap();
      this.fade.style.opacity = 0;
    }, 350);
  }

  openShop(door) {
    if (door.brand === 'exit') { this.walkOut(); return; }
    if (!door.interiorCounter && !this.inside && !ACTIVITIES.includes(door.brand) && door.kind === 'shop' && !door.vending) { this.walkIn(door); return; }
    this.uiOpen = true;
    this.player.active = false;
    this.player.vel.set(0, 0, 0);
    this.setMenuMode(true);
    if (ACTIVITIES.includes(door.brand)) this.activityUI.open(door.brand); else this.shopUI.open(door.brand);
  }
  closeOverlay() {
    this.uiOpen = false;
    if (!this.current) this.player.active = true;
    this.setMenuMode(false);
    Input.capture(true);
    gs.save();
  }

  pause() {
    this.paused = true;
    this.setMenuMode(true);
    this.pauseMenu.open();
  }
  resume() {
    this.pauseMenu.close();
    this.paused = false;
    if (this.fromTitleSettings) { this.fromTitleSettings = false; this.title.open(); return; }
    this.setMenuMode(false);
    Input.capture(true);
  }

  openMap() {
    if (this.titleUp) return;
    this.paused = true;
    this.setMenuMode(true);
    const pos = this.current ? this.current.position : this.player.position;
    let heading = Math.atan2(-Math.cos(this.rig.yaw), -Math.sin(this.rig.yaw));
    if (this.current && this.current.fwdBody) heading = Math.atan2(this.current.fwdBody.z, this.current.fwdBody.x);
    this.mapUI.open(pos, heading);
  }
  closeMap() { this.paused = false; this.setMenuMode(false); Input.capture(true); }

  openPhone() {
    if (this.titleUp) return;
    this.phoneOpen = true;
    if (!this.current) this.player.active = false;
    this.setMenuMode(true);
    this.phone.open();
  }
  closePhone() {
    this.phoneOpen = false;
    if (!this.current) this.player.active = true;
    this.setMenuMode(false);
    Input.capture(true);
  }

  /** A Ryde car takes you to a place: a fade, a short ride, a fade back. */
  async rydeTo(x, z, place) {
    gs.say('Ryde', 'Driver on the way', `Heading to ${place}`, 3);
    this.player.active = false;
    this.fade.style.opacity = 1;
    await new Promise((r) => setTimeout(r, 650));
    this.player.teleport(x, 0.4, z);
    gs.advanceMinutes(8); gs.addStress(-0.02);
    this.rig.snap();
    await new Promise((r) => setTimeout(r, 500));
    this.fade.style.opacity = 0;
    this.player.active = true;
    gs.say('Ryde', 'You have arrived', place, 3.5);
  }

  /** The camera app: copies the next rendered frame into a small JPEG. */
  capture(cb) { this._capture = cb; }

  // ---- the title: the city turning behind the nameplate, a day passing while you sit on the menu
  showTitle() {
    this.titleUp = true;
    this.player.active = false;
    this.hud.el.style.display = 'none';
    this.setMenuMode(true);
    this.title.open();
    this.titleT = 0;
  }
  begin(cont) {
    if (cont) gs.load(); else { gs.reset(); this.player.teleport(START.x, START.y, START.z); }
    this.title.close();
    this.titleUp = false;
    this.hud.el.style.display = '';
    this.player.active = !this.current;
    this.rig.snap();
    this.setMenuMode(false);
    Input.capture(true);
    this.hud.say('TŌKONTO NIGHTS', 3);
    this.rig.target = this.current || this.player;
  }
  toTitle() {
    this.pauseMenu.close();
    this.paused = false;
    gs.save();
    if (this.current) this.leave();
    this.showTitle();
  }
  titleCamera(dt) {
    this.titleT += dt;
    const a = this.titleT * 0.06;
    const c = this.city.W * 0.5;
    this.camera.position.set(c + Math.cos(a) * 190, 70, c + Math.sin(a) * 190);
    this.camera.lookAt(c, 8, c);
    // a whole day passes in a minute and a half
    gs.advanceMinutes(dt * 16);
  }

  // ---- controls
  bindControls() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => { if (!this.menuOpen()) Input.capture(true); });
    Input.on('lockchange', (locked) => { if (!locked && !this.menuOpen() && !this.wheelOpen()) this.pause(); });
    Input.on('key', (e) => this.onKey(e));
    Input.on('keyup', (e) => this.onKeyUp(e));
    Input.on('mousemove', (e) => { if (this.wheelOpen() && Input.locked) this.wheels.nudge(e.movementX, e.movementY); });
    Input.on('wheel', (e) => { if (this.wheelOpen()) this.wheels.stepItem(e.deltaY > 0 ? 1 : -1); });
  }

  onKey(e) {
    if (this.wheelOpen()) { this.wheelNav(e); return; }
    if (this.menuOpen()) return;
    switch (e.code) {
      case 'Escape': this.pause(); break;
      case 'KeyM': this.openMap(); break;
      case 'KeyP': this.openPhone(); break;
      case 'KeyE': case 'KeyF': this.interact(); break;
      case 'ArrowUp': this.openPhone(); break;
      case 'Tab': this.openEquip(); break;
      case 'KeyH': if (this.current) { this.lights = !this.lights; this.current.lightsOn = this.lights; } break;
      case 'KeyT': if (this.current) this.current.resetUpright(); break;
      case 'F1': this.hud.showHelp = !this.hud.showHelp; break;
      case 'KeyQ': if (this.current) this.radioPress(); else this.openEquip(); break;
      case 'KeyR': this.radioPress(); break;
      default:
    }
  }
  onKeyUp(e) {
    if (e.code === 'Tab') this.closeEquip();
    else if (e.code === 'KeyQ') { this.closeEquip(); this.radioRelease(); }
    else if (e.code === 'KeyR') this.radioRelease();
  }

  // ---- the wheels
  openEquip() {
    if (this.menuOpen() || this.wheelOpen()) return;
    this.wheels.openEquip();
    if (!this.current) this.player.active = false;
  }
  closeEquip() {
    if (this.wheels.mode !== 'equip') return;
    const line = this.wheels.closeEquip();
    if (!this.current && !this.menuOpen()) this.player.active = true;
    if (line) gs.say('Bag', line, '', 2.5);
  }
  radioPress() { if (this.menuOpen() || this.wheelOpen() || !this.current) return; this.radioHold = 0; }
  radioRelease() {
    if (this.wheels.mode === 'radio') this.wheels.closeRadio();
    else if (this.radioHold >= 0 && this.current) this.radio.next(1);
    this.radioHold = -1;
  }
  /** Arrows, the D-pad, and 1-8 move around whichever wheel is up. */
  wheelNav(e) {
    const w = this.wheels;
    const k = e.code;
    let dx = 0, dy = 0;
    if (k === 'ArrowLeft') dx = -1; else if (k === 'ArrowRight') dx = 1; else if (k === 'ArrowUp') dy = -1; else if (k === 'ArrowDown') dy = 1;
    else if (k === 'Enter' || k === 'Space') { if (w.mode === 'equip') this.closeEquip(); else this.radioRelease(); return; }
    else if (w.mode === 'radio' && /^Digit[1-8]$/.test(k)) { w.sel = Number(k.slice(5)) - 1; return; }
    else return;
    if (w.mode === 'equip') { if (dx) w.step(dx); if (dy) w.stepItem(dy); } else w.step(dx || dy);
  }
  padWheels() {
    // the controller: LB holds the equipment wheel, D-pad left taps the radio and holds its wheel
    if (this.menuOpen()) return;
    if (Input.btnJust(4)) { if (this.current) { this.radioPress(); this.padLbRadio = true; } else this.openEquip(); }
    if (!Input.btn(4) && Input.padPrevHeld4) { if (this.padLbRadio) { this.padLbRadio = false; this.radioRelease(); } else if (this.wheels.mode === 'equip') this.closeEquip(); }
    Input.padPrevHeld4 = Input.btn(4);
    if (Input.btnJust(14) && this.wheels.mode !== 'equip') this.radioPress();
    if (!Input.btn(14) && this.padRadioHeld) { this.padRadioHeld = false; this.radioRelease(); }
    if (Input.btn(14)) this.padRadioHeld = true;
    if (this.wheelOpen()) {
      const rs = Input.padAxes;
      const x = Math.hypot(rs[2], rs[3]) > 0.45 ? rs[2] : rs[0], y = Math.hypot(rs[2], rs[3]) > 0.45 ? rs[3] : rs[1];
      this.wheels.point(x, y);
      if (this.wheels.mode === 'equip') {
        if (Input.btnJust(12)) this.wheels.stepItem(-1); if (Input.btnJust(13)) this.wheels.stepItem(1);
        if (Input.btnJust(14)) this.wheels.step(-1); if (Input.btnJust(15)) this.wheels.step(1);
      } else { if (Input.btnJust(14) || Input.btnJust(12)) this.wheels.step(-1); if (Input.btnJust(15) || Input.btnJust(13)) this.wheels.step(1); }
    }
    // Start, View and Y reach the pause menu, the map and the phone
    if (Input.btnJust(9)) this.pause();
    if (Input.btnJust(8)) this.openMap();
    if (Input.btnJust(12) && !this.wheelOpen()) this.openPhone();
  }

  interact() {
    if (this.current) {
      if (Math.abs(this.current.forwardSpeed) < 4) this.leave();
      return;
    }
    if (this.player.dead) return;
    const door = this.nearestDoor(this.player.position);
    if (door) { this.openShop(door); return; }
    const v = this.nearestVehicle(this.player.position);
    if (v && !v.wrecked) this.enter(v);
  }

  // ---- the loop
  start() {
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  fixedUpdate(dt) {
    gs.tick(dt);
    gs.outdoors = !this.current && this.city.inPark(this.player.position.x, this.player.position.z);
    const strain = gs.strain();
    this.player.speedMult = 1 - 0.42 * strain;
    if (this.current) {
      const c = this.current;
      const locked = this.wheelOpen() || this.uiOpen || this.phoneOpen;
      let f = locked ? 0 : Input.strength('move_forward');
      const b = locked ? 0 : Input.strength('move_back');
      let s = locked ? 0 : Input.strength('move_right') - Input.strength('move_left');
      // a man at the end of his rope drives badly: he cannot hold the pedal, the wheel wanders, and he lapses
      f *= 1 - 0.35 * strain;
      if (strain > 0.2 && (this.t % 7) < 0.35 * strain) f *= 0.3;
      s += Math.sin(this.t * 3.1) * 0.22 * strain;
      c.throttle = moveToward(c.throttle, f, dt * 5);
      c.brake = moveToward(c.brake, b, dt * 6);
      const rate = Math.abs(s) > 0.01 ? 4.5 : 7;
      c.steerIn = moveToward(c.steerIn, clamp(s, -1, 1), dt * rate);
      c.handbrake = locked ? true : Input.held('handbrake');
    }
    this.player.camYaw = this.rig.yaw;
    this.player.update(dt);
    for (const a of this.ais) a.update(dt);
    for (const v of this.parked) v.update(dt);
    for (const v of this.traffic) v.update(dt);
    for (const tr of this.city.trains) tr.step(dt, this.player.dead || this.current ? [] : [this.player]);
    this.phys.step();
    this.t += dt;
  }

  frame(now) {
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    Input.poll(dt);
    if (!this.paused && !this.titleUp) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 8) { this.fixedUpdate(STEP); this.acc -= STEP; n++; }
      if (n === 8) this.acc = 0;
    }
    if (!this.titleUp) this.padWheels();
    // the radio: tap to change, hold for the wheel
    if (this.radioHold >= 0 && this.wheels.mode !== 'radio') {
      this.radioHold += dt;
      if (this.radioHold > 0.28 && this.current) this.wheels.openRadio();
    }
    this.radio.update(!!this.current && !this.titleUp);
    // look
    if (!this.menuOpen() && !this.wheelOpen()) {
      if (Input.locked) this.rig.look(Input.look.x, Input.look.y);
      const rs = Input.rightStick();
      if (rs.x || rs.y) this.rig.look(rs.x * 1100 * dt, rs.y * 1100 * dt);
    }
    this.player.sync(dt);
    for (const v of this.parked) v.sync(dt);
    for (const v of this.traffic) v.sync(dt);
    if (this.current && Audio_.ready) Audio_.engineSet(this.current.rpm, this.current.throttle);
    // traffic lights its lamps by itself after dark
    if (Math.floor(this.t * 0.5) !== this._lampT) { this._lampT = Math.floor(this.t * 0.5); const dark = sky.night > 0.3; for (const v of this.traffic) v.lightsOn = dark; }
    if (this.titleUp) this.titleCamera(dt); else this.rig.update(dt);
    this.city.update(dt, this.camera);
    Lod.update(this.camera.position);
    this.hud.update(dt);
    this.hud.el.classList.toggle('phone-up', !!this.phoneOpen);
    this.wheels.update(dt);
    this.sky.sun.castShadow = this.sky.sun.castShadow && this.shadowsOn;
    this.sky.moon.castShadow = this.sky.moon.castShadow && this.shadowsOn;
    Input.endFrame();
    try {
      if (this.post) this.post.render(); else this.renderer.render(this.scene, this.camera);
    } catch (err) {
      console.error('render failed, dropping post-processing:', err);
      this.post = null;
    }
    if (this._capture) {
      const cb = this._capture; this._capture = null;
      const c = document.createElement('canvas'); c.width = 960; c.height = 540;
      c.getContext('2d').drawImage(this.renderer.domElement, 0, 0, 960, 540);
      cb(c.toDataURL('image/jpeg', 0.82));
    }
    this._fpsN++; this._fpsT += dt;
    if (this._fpsT >= 0.5) { this.fps = this._fpsN / this._fpsT; this._fpsN = 0; this._fpsT = 0; }
  }
}
