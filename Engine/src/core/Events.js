// A small event bus. The game listens for engine events (a cell came in, lightning struck, a body hit something)
// without the engine knowing anything about the game.
export class Events {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    let l = this.map.get(name);
    if (!l) this.map.set(name, (l = []));
    l.push(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    const l = this.map.get(name);
    if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
  }
  emit(name, a, b) {
    const l = this.map.get(name);
    if (!l) return;
    for (let i = 0; i < l.length; i++) {
      try { l[i](a, b); } catch (e) { console.error("[Shigoto] listener for " + name + " failed", e); }
    }
  }
}
