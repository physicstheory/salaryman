// The game: boots the city, the player, the cars and the traffic, runs the fixed-step simulation and the render loop, and wires the controls.
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
import { Rng, clamp } from './util.js';
import { sky } from './world/sky.js';
import { Lod } from './lod.js';
import { Hud } from './ui/hud.js';

export const START = new THREE.Vector3(2 * P + 7, 0.3, 5 * P + 11);
const TRAFFIC = 14;

export class Game {
  constructor() {
    this.parked = []; this.traffic = []; this.ais = [];
    this.current = null;
    this.paused = false;          // the simulation stops (menus, map)
    this.uiOpen = false;          // a shop, activity or phone is up
    this.lights = false;
    this.titleUp = false;
    this.acc = 0;
    this.last = performance.now();
    this.t = 0;
    this.fps = 0; this._fpsN = 0; this._fpsT = 0;
    this.listeners = [];
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
    await this.city.build(say);
    this.sky = this.city.sky;
    say('People and cars…');
    this.player = new Player(this.phys, START.x, START.y, START.z);
    scene.add(this.player.group);
    this.player.on('died', (r) => this.onDied(r));
    this.sky.focus = this.player.group;
    this.rig = new CamRig(camera, this.phys);
    this.rig.target = this.player;
    this.rig.snap();
    await this.spawnCars();
    this.hud = new Hud(this);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.bindControls();
    this.setupPost();
  }

  setupPost() { /* the post-processing chain is built in render.js once the scene exists */ this.post = null; }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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
      const h = vert ? new THREE.Vector3(0, 0, dir) : new THREE.Vector3(dir, 0, 0);
      const left = new THREE.Vector3(h.z, 0, -h.x);
      const pos = vert ? new THREE.Vector3(road * P, 0.9, along).addScaledVector(left, 3) : new THREE.Vector3(along, 0.9, road * P).addScaledVector(left, 3);
      pos.y = 0.9;
      // keep clear of the start and of the railway cutting
      if (pos.distanceTo(START) < 45 || Math.abs(pos.x - this.city.railX) < 12) { rng.next(); rng.next(); continue; }
      const yaw = (Math.atan2(-h.x, -h.z) * 180) / Math.PI;
      const v = this.makeVehicle(rng.pick(tk), pos.x, 0.9, pos.z, yaw);
      v.lightsOn = sky.night > 0.3;
      this.traffic.push(v);
      this.ais.push(new AIDriver(v, this.city, h, rng.range(9, 14), this.phys, rng));
      rng.next();
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
    this.engineAudio && this.engineAudio.start(v);
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
    this.engineAudio && this.engineAudio.stop();
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

  // ---- controls
  bindControls() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => { if (!this.menuOpen()) Input.capture(true); });
    Input.on('lockchange', (locked) => { if (!locked && !this.menuOpen() && !this.titleUp) this.pause(); });
    Input.on('key', (e) => this.onKey(e));
  }

  menuOpen() { return this.paused || this.uiOpen || this.titleUp; }

  onKey(e) {
    if (this.menuOpen()) return;
    switch (e.code) {
      case 'Escape': this.pause(); break;
      case 'KeyM': this.openMap && this.openMap(); break;
      case 'KeyP': this.openPhone && this.openPhone(); break;
      case 'KeyE': this.interact(); break;
      case 'KeyL': if (this.current) { this.lights = !this.lights; this.current.lightsOn = this.lights; } break;
      case 'KeyT': if (this.current) this.current.resetUpright(); break;
      case 'KeyH': this.hud && (this.hud.showHelp = !this.hud.showHelp); break;
      default:
    }
  }

  interact() {
    if (this.current) {
      if (Math.abs(this.current.forwardSpeed) < 4) this.leave();
      return;
    }
    if (this.player.dead) return;
    const door = this.nearestDoor(this.player.position);
    if (door) { this.openShop && this.openShop(door); return; }
    const v = this.nearestVehicle(this.player.position);
    if (v && !v.wrecked) this.enter(v);
  }

  pause() { /* replaced when the pause menu is wired */ this.paused = true; Input.capture(false); }
  resume() { this.paused = false; }

  // ---- the loop
  start() {
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  fixedUpdate(dt) {
    gs.tick(dt);
    gs.outdoors = !this.current && this.city.inPark(this.player.position.x, this.player.position.z);
    const strain = gs.strain();
    this.player.speedMult = 1 - 0.42 * strain;
    if (this.current && !this.uiOpen) {
      const c = this.current;
      const locked = this.wheelOpen && this.wheelOpen();
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
      c.handbrake = Input.held('handbrake');
    } else if (this.current) {
      this.current.throttle = 0; this.current.brake = 0.3;
    }
    this.player.camYaw = this.rig.yaw;
    this.player.update(dt);
    for (const a of this.ais) a.update(dt);
    for (const v of [...this.parked, ...this.traffic]) v.update(dt);
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
    // look
    if (!this.menuOpen() && !(this.wheelOpen && this.wheelOpen())) {
      if (Input.locked) this.rig.look(Input.look.x, Input.look.y);
      const rs = Input.rightStick();
      if (rs.x || rs.y) this.rig.look(rs.x * 1100 * dt, rs.y * 1100 * dt);
    }
    this.frameExtras && this.frameExtras(dt);
    this.player.sync(dt);
    for (const v of this.parked) v.sync(dt);
    for (const v of this.traffic) v.sync(dt);
    if (this.titleUp) this.titleCamera && this.titleCamera(dt); else this.rig.update(dt);
    this.city.update(dt, this.camera);
    Lod.update(this.camera.position);
    this.hud && this.hud.update(dt);
    Input.endFrame();
    this.renderer.render(this.scene, this.camera);
    this._fpsN++; this._fpsT += dt;
    if (this._fpsT >= 0.5) { this.fps = this._fpsN / this._fpsT; this._fpsN = 0; this._fpsT = 0; }
  }
}

function moveToward(v, target, d) { return Math.abs(target - v) <= d ? target : v + Math.sign(target - v) * d; }
