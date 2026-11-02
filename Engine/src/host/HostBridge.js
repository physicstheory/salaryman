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
    // resident: tiles are never removed once built (the persistence engine builds them all up front)
    this.resident = false;
    this._hf = new Set();      // tiles with their ground heightfield
    this._boxed = new Set();   // tiles with their solids' boxes
  }

  // Build the physics for the whole host world now: a collider for every solid in the world, and the ground
  // (heightfields, which cost far more to sample) for the tiles within groundR metres of the points in `near` (where play
  // starts). Ground elsewhere is added as you first get near it, and kept. ctx: a persistence stage context, or nothing.
  async prebuildAll(ctx, near, groundR) {
    if (!this.ph) return { tiles: 0 };
    this.resident = true;
    if (this._solids && !this._index) this._buildIndex();
    const t = this.tile, R = groundR || 360;
    const keys = this._index ? [...this._index.keys()] : [];
    const want = new Set(keys);
    for (const p of near || []) for (let z = Math.floor((p[1] - R) / t); z <= Math.floor((p[1] + R) / t); z++) for (let x = Math.floor((p[0] - R) / t); x <= Math.floor((p[0] + R) / t); x++)
      if (Math.hypot((x + 0.5) * t - p[0], (z + 0.5) * t - p[1]) <= R + t * 0.7) want.add(x + "," + z + ",g");
    let n = 0, boxes = 0, ground = 0;
    for (const k of want) {
      const [x, z, g] = k.split(",");
      if (g) { if (this._buildGround(+x, +z)) ground++; }
      else boxes += this._buildTile(+x, +z, false);
      n++;
      if (ctx) { if ((n & 15) === 0) ctx.progress(n / want.size); await ctx.slice(); }
    }
    // Rapier's ray and shape queries see new colliders after a step
    try { this.ph.world.step(); } catch (e) { /* not ready */ }
    return { tiles: this._tiles.size, boxes, groundTiles: ground, solids: this._solids ? this._solids.length : 0 };
  }

  _buildGround(x, z) {
    const t = this.tile, key = "host:" + x + "," + z;
    if (!this._ground || this._hf.has(key)) return false;
    this._hf.add(key);
    if (!this._tiles.has(key)) this._tiles.set(key, true);
    this.ph.addHeightfield(key, (x + 0.5) * t, (z + 0.5) * t, t, 20, this._ground);
    return true;
  }

  _buildTile(x, z, withGround) {
    const t = this.tile, key = "host:" + x + "," + z;
    if (withGround !== false) this._buildGround(x, z);
    if (this._boxed.has(key)) return 0;
    this._boxed.add(key);
    this._tiles.set(key, true);
    let n = 0;
    const l = this._index && this._index.get(x + "," + z);
    if (l) for (const i of l) {
      const b = this._solids[i];
      // a solid spanning several tiles is added by the tile its centre is in
      if (Math.floor(b.c[0] / t) !== x || Math.floor(b.c[1] / t) !== z) continue;
      const h = b.h || 10, y = b.y || 0;
      this.ph.addStaticBox(key, [b.c[0], y + h / 2, b.c[1]], [b.size[0], h, b.size[1]], (b.yaw || 0) * Math.PI / 180, { tag: "host" });
      n++;
    }
    return n;
  }

  // How many solids have a collider (for the persistence checks): every solid belongs to exactly one tile.
  coverage() {
    if (!this._solids) return { solids: 0, covered: 0 };
    const t = this.tile;
    let covered = 0;
    for (const b of this._solids) if (this._boxed.has("host:" + Math.floor(b.c[0] / t) + "," + Math.floor(b.c[1] / t))) covered++;
    return { solids: this._solids.length, covered };
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

  _dropAll() { for (const k of this._tiles.keys()) this.ph.removeOwner(k); this._tiles.clear(); this._hf.clear(); this._boxed.clear(); }

  _buildIndex() {
    const t = this.tile, map = new Map();
    (this._solids || []).forEach((b, i) => {
      const r = Math.max(b.size[0], b.size[1]) * 0.5;
      const x0 = Math.floor((b.c[0] - r) / t), x1 = Math.floor((b.c[0] + r) / t), z0 = Math.floor((b.c[1] - r) / t), z1 = Math.floor((b.c[1] + r) / t);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const k = x + "," + z; let l = map.get(k); if (!l) map.set(k, (l = [])); l.push(i); }
    });
    this._index = map;
    this._indexedN = (this._solids || []).length;
  }

  // The game adds solids after the world is built (the holiday islands, an airport gate, a story set) and takes the odd one away (a gate
  // arm smashed through). Additions get a collider straight away if their tile is already built, otherwise when the tile is; a removal
  // drops the physics copy and builds it again around the player, so nothing removed stays solid.
  syncSolids() {
    const L = this._solids;
    if (!L || !this._index) return 0;
    const n0 = this._indexedN || 0;
    if (L.length === n0) return 0;
    if (L.length < n0) { this.solids(L); this._buildIndex(); return -1; }
    const t = this.tile, map = this._index;
    let boxed = 0;
    for (let i = n0; i < L.length; i++) {
      const b = L[i];
      const r = Math.max(b.size[0], b.size[1]) * 0.5;
      const x0 = Math.floor((b.c[0] - r) / t), x1 = Math.floor((b.c[0] + r) / t), z0 = Math.floor((b.c[1] - r) / t), z1 = Math.floor((b.c[1] + r) / t);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const k = x + "," + z; let l = map.get(k); if (!l) map.set(k, (l = [])); l.push(i); }
      const tx = Math.floor(b.c[0] / t), tz = Math.floor(b.c[1] / t), key = "host:" + tx + "," + tz;
      if (this._boxed.has(key)) {
        const h = b.h || 10, y = b.y || 0;
        this.ph.addStaticBox(key, [b.c[0], y + h / 2, b.c[1]], [b.size[0], h, b.size[1]], (b.yaw || 0) * Math.PI / 180, { tag: "host" });
        boxed++;
      } else if (this.resident) this._buildTile(tx, tz, false);
    }
    this._indexedN = L.length;
    return boxed;
  }

  // Ground for a whole area now (the holiday islands, built behind the loading screen): heightfields for every tile it covers.
  prebuildArea(x0, z0, x1, z1) {
    if (!this.ph || !this._ground) return 0;
    const t = this.tile;
    let n = 0;
    for (let z = Math.floor(z0 / t); z <= Math.floor(z1 / t); z++) for (let x = Math.floor(x0 / t); x <= Math.floor(x1 / t); x++) if (this._buildGround(x, z)) n++;
    try { this.ph.world.step(); } catch (e) { /* not ready */ }     // queries see new colliders only after a step
    return n;
  }

  update(dt, focus) {
    if (!this.ph) return;
    if (this._solids && this._index) this.syncSolids();
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
      if ((this._boxed.has(key) && (this._hf.has(key) || !this._ground)) || built >= 2) continue; // at most two tiles per frame
      built++;
      this._buildTile(x, z);
    }
    if (!this.resident) for (const k of [...this._tiles.keys()]) if (!keep.has(k)) { this.ph.removeOwner(k); this._tiles.delete(k); this._hf.delete(k); this._boxed.delete(k); }
  }
}
