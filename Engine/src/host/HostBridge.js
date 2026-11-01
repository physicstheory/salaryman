// HostBridge: how an existing game (konto.html, with its own procedural city) hands its world to the engine while it
// moves over to authored levels. The game describes what it has; the bridge keeps a physics copy of it around the
// player, streamed in 60 m tiles:
//
//   bridge.solids(list)        boxes the game already uses for walking into: { c: [x, z], size: [w, d], yaw (deg), y, h }
//   bridge.ground(fn)          (x, z) => ground height, turned into heightfield tiles
//   bridge.proxy("seiko", ...) a kinematic capsule or box that follows a game object and shoves props
//   bridge.scatter(...)        drop physics props (cones, bins, crates) on the ground near a point
//
// When a district is rebuilt as a level, its solids and ground stop coming from the game and come from the level.

export class HostBridge {
  constructor(engine, opts) {
    this.engine = engine;
    this.ph = engine.physics;
    this.tile = (opts && opts.tile) || 60;
    this.radius = (opts && opts.radius) || 130;
    this._solids = null;
    this._ground = null;
    this._tiles = new Map();
    this._index = null;
    this.proxies = new Map();
    this.props = [];
    this.maxProps = (opts && opts.maxProps) || 80;
  }

  solids(list) { this._solids = list; this._index = null; this._dropAll(); }
  ground(fn) { this._ground = fn; this._dropAll(); }

  // Follow a host object: get() returns { x, y, z, yaw } (y = the centre of the shape) or null to park it.
  proxy(name, shape, size, get) {
    const k = this.ph.addKinematic("proxy:" + name, shape, size);
    this.proxies.set(name, { k, get, parked: false });
    return k;
  }

  scatter(type, x, z, n, spread) {
    const st = this.engine.streamer;
    if (!st) return;
    const P = st.builder;
    const cell = { props: [] };
    for (let i = 0; i < n; i++) {
      const px = x + (Math.random() - 0.5) * spread, pz = z + (Math.random() - 0.5) * spread;
      const y = this._ground ? this._ground(px, pz) : 0;
      cell.props.push({ type, pos: [px, y + 0.02, pz], yaw: Math.random() * 360, dynamic: true });
    }
    const key = "scatter:" + (this._sc = (this._sc || 0) + 1);
    P.build(cell, key, st.root, null);
    this.props.push(key);
    while (this.props.length > Math.ceil(this.maxProps / Math.max(1, n))) this.ph.removeOwner(this.props.shift());
    return key;
  }

  _dropAll() { for (const k of this._tiles.keys()) this.ph.removeOwner(k); this._tiles.clear(); }

  _buildIndex() {
    const t = this.tile, map = new Map();
    (this._solids || []).forEach((b, i) => {
      const r = Math.max(b.size[0], b.size[1]) * 0.5;
      const x0 = Math.floor((b.c[0] - r) / t), x1 = Math.floor((b.c[0] + r) / t), z0 = Math.floor((b.c[1] - r) / t), z1 = Math.floor((b.c[1] + r) / t);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const k = x + "," + z; let l = map.get(k); if (!l) map.set(k, (l = [])); l.push(i); }
    });
    this._index = map;
  }

  update(dt, focus) {
    if (!this.ph) return;
    for (const [, p] of this.proxies) {
      const s = p.get();
      if (s) p.k.set(s.x, s.y, s.z, s.yaw); else p.k.set(0, -1000, 0, 0);
    }
    if (!this._solids && !this._ground) return;
    if (this._solids && !this._index) this._buildIndex();
    const t = this.tile, R = this.radius;
    const ix = Math.floor(focus.x / t), iz = Math.floor(focus.z / t), n = Math.ceil(R / t);
    const keep = new Set();
    let built = 0;
    for (let z = iz - n; z <= iz + n; z++) for (let x = ix - n; x <= ix + n; x++) {
      const cx = (x + 0.5) * t, cz = (z + 0.5) * t;
      if (Math.hypot(cx - focus.x, cz - focus.z) > R + t * 0.7) continue;
      const key = "host:" + x + "," + z;
      keep.add(key);
      if (this._tiles.has(key) || built >= 2) continue; // at most two tiles per frame
      built++;
      this._tiles.set(key, true);
      if (this._ground) this.ph.addHeightfield(key, cx, cz, t, 20, this._ground);
      const l = this._index && this._index.get(x + "," + z);
      if (l) for (const i of l) {
        const b = this._solids[i];
        // a solid spanning several tiles is added by the tile its centre is in
        if (Math.floor(b.c[0] / t) !== x || Math.floor(b.c[1] / t) !== z) continue;
        const h = b.h || 10, y = b.y || 0;
        this.ph.addStaticBox(key, [b.c[0], y + h / 2, b.c[1]], [b.size[0], h, b.size[1]], (b.yaw || 0) * Math.PI / 180, { tag: "host" });
      }
    }
    for (const k of [...this._tiles.keys()]) if (!keep.has(k)) { this.ph.removeOwner(k); this._tiles.delete(k); }
  }
}
