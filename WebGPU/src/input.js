// Keyboard, mouse and controller, behind named actions. In menus the controller is turned into the keyboard
// (D-pad and left stick are the arrows, A is Enter, B is Escape, LB/RB are Q/E), so every screen works from the sofa.
import { Emitter } from './util.js';

const KEYS = {
  move_forward: ['KeyW', 'ArrowUp'],
  move_back: ['KeyS', 'ArrowDown'],
  move_left: ['KeyA', 'ArrowLeft'],
  move_right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE'],
  reset_car: ['KeyT'],
  lights: ['KeyL'],
  hide_help: ['KeyH'],
};
// controller buttons (standard mapping): 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 View, 9 Start, 10 L3, 11 R3, 12-15 D-pad
const PAD_BUTTONS = {
  handbrake: [0], jump: [0], interact: [2], lights: [1], sprint: [10], reset_car: [11],
};

class InputSystem extends Emitter {
  constructor() {
    super();
    this.down = new Set();           // KeyboardEvent.code currently held
    this.pressedThisFrame = new Set();
    this.padPrev = [];
    this.padNow = [];
    this.padAxes = [0, 0, 0, 0];
    this.padConnected = false;
    this.look = { x: 0, y: 0 };      // mouse movement since last frame
    this.locked = false;
    this.menuMode = false;           // when true the controller drives the DOM as a keyboard
    this.canvas = null;
    this._navRepeat = 0;
    this._navDir = '';
    this._pad_just = new Set();
  }

  attach(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressedThisFrame.add(e.code);
      this.emit('key', e);
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); this.emit('keyup', e); });
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousemove', (e) => {
      if (this.locked) { this.look.x += e.movementX; this.look.y += e.movementY; }
      this.emit('mousemove', e);
    });
    window.addEventListener('mousedown', (e) => { this.emit('mousedown', e); });
    window.addEventListener('wheel', (e) => { this.emit('wheel', e); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; this.emit('lockchange', this.locked); });
    window.addEventListener('gamepadconnected', () => { this.padConnected = true; });
    window.addEventListener('gamepaddisconnected', () => { this.padConnected = !!this.pad(); });
  }

  capture(on) {
    if (!this.canvas) return;
    if (on && !this.locked) { try { this.canvas.requestPointerLock(); } catch (e) { /* needs a user gesture */ } }
    else if (!on && this.locked) document.exitPointerLock();
  }

  pad() {
    const list = (navigator.getGamepads && navigator.getGamepads()) || [];
    for (const g of list) if (g && g.connected) return g;
    return null;
  }

  /** Call once per frame, before the game reads any action. */
  poll(dt) {
    const g = this.pad();
    this.padPrev = this.padNow;
    this._pad_just.clear();
    if (g) {
      this.padNow = g.buttons.map((b) => b.pressed || b.value > 0.5);
      for (let i = 0; i < this.padNow.length; i++) if (this.padNow[i] && !this.padPrev[i]) this._pad_just.add(i);
      const dz = (v) => (Math.abs(v) < 0.14 ? 0 : v);
      this.padAxes = [dz(g.axes[0] || 0), dz(g.axes[1] || 0), dz(g.axes[2] || 0), dz(g.axes[3] || 0)];
      this.padTriggers = [g.buttons[6] ? g.buttons[6].value : 0, g.buttons[7] ? g.buttons[7].value : 0];
      this.padConnected = true;
    } else {
      this.padNow = []; this.padAxes = [0, 0, 0, 0]; this.padTriggers = [0, 0];
    }
    if (this.menuMode) this._padAsKeyboard(dt);
  }

  endFrame() { this.pressedThisFrame.clear(); this.look.x = 0; this.look.y = 0; }

  btn(i) { return !!this.padNow[i]; }
  btnJust(i) { return this._pad_just.has(i); }

  // ---- actions
  held(action) {
    for (const k of KEYS[action] || []) if (this.down.has(k)) return true;
    for (const b of PAD_BUTTONS[action] || []) if (this.btn(b)) return true;
    return false;
  }
  just(action) {
    for (const k of KEYS[action] || []) if (this.pressedThisFrame.has(k)) return true;
    for (const b of PAD_BUTTONS[action] || []) if (this.btnJust(b)) return true;
    return false;
  }
  /** -1..1 strength of a movement direction: keys give 1, the stick gives its analogue value, triggers drive the car. */
  strength(action) {
    let v = this.held(action) && KEYS[action] && KEYS[action].some((k) => this.down.has(k)) ? 1 : 0;
    const [lx, ly] = this.padAxes;
    switch (action) {
      case 'move_forward': v = Math.max(v, -ly, this.padTriggers ? this.padTriggers[1] : 0); break;
      case 'move_back': v = Math.max(v, ly, this.padTriggers ? this.padTriggers[0] : 0); break;
      case 'move_left': v = Math.max(v, -lx); break;
      case 'move_right': v = Math.max(v, lx); break;
    }
    return Math.min(1, Math.max(0, v));
  }
  /** The movement vector, x right and y back, length at most 1. */
  moveVector() {
    const x = this.strength('move_right') - this.strength('move_left');
    const y = this.strength('move_back') - this.strength('move_forward');
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }
  /** Right stick, scaled for looking: radians per second are applied by the caller. */
  rightStick() {
    const x = this.padAxes[2], y = this.padAxes[3];
    const l = Math.hypot(x, y);
    if (l < 0.18) return { x: 0, y: 0 };
    const k = (l - 0.18) / 0.82 / l;
    return { x: x * k, y: y * k };
  }
  key(code) { return this.down.has(code); }
  keyJust(code) { return this.pressedThisFrame.has(code); }

  // ---- the controller as a keyboard, for menus
  _fire(type, key, code) {
    const e = new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true });
    (document.activeElement && document.activeElement !== document.body ? document.activeElement : document).dispatchEvent(e);
  }
  _padAsKeyboard(dt) {
    const map = { 12: ['ArrowUp', 'ArrowUp'], 13: ['ArrowDown', 'ArrowDown'], 14: ['ArrowLeft', 'ArrowLeft'], 15: ['ArrowRight', 'ArrowRight'], 0: ['Enter', 'Enter'], 1: ['Escape', 'Escape'], 2: ['x', 'KeyX'], 3: ['p', 'KeyP'], 4: ['q', 'KeyQ'], 5: ['e', 'KeyE'], 8: ['m', 'KeyM'], 9: ['Escape', 'Escape'] };
    for (const b of this._pad_just) if (map[b]) { this._fire('keydown', map[b][0], map[b][1]); this._fire('keyup', map[b][0], map[b][1]); }
    // the left stick repeats like the arrows
    const [x, y] = this.padAxes;
    let dir = '';
    if (Math.hypot(x, y) > 0.6) dir = Math.abs(x) > Math.abs(y) ? (x < 0 ? 'ArrowLeft' : 'ArrowRight') : (y < 0 ? 'ArrowUp' : 'ArrowDown');
    this._navRepeat -= dt;
    if (dir !== this._navDir || (dir && this._navRepeat <= 0)) {
      if (dir) { this._fire('keydown', dir, dir); this._fire('keyup', dir, dir); }
      this._navRepeat = dir !== this._navDir ? 0.3 : 0.11;
      this._navDir = dir;
    }
  }
}

export const Input = new InputSystem();
