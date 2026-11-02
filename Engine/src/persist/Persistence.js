// Persistence: the whole world is built once, behind the loading screen, and then kept.
//
// Streaming worlds pay for travel with hitches and pop-in: cells are fetched, built, compiled and uploaded as you
// arrive, and thrown away again as you leave, so coming back means doing it all over. Salary Man's world is small
// and dense enough to hold at once, so the persistence engine turns that around:
//
//   1. load:     every stage the host registers (world, buildings, trees, physics, interiors, cast...) runs while
//                the loading screen is up, in time slices so the slideshow and the bar keep moving.
//   2. validate: every check the host and the engine register runs against the finished world before the screen
//                lifts: scene integrity, shaders, textures, physics, characters, memory. A failure that can be
//                repaired is repaired (and reported); nothing is left for the player to find.
//   3. warm:     every shader program is compiled and every geometry and texture uploaded to the GPU, in small
//                fenced batches so no single GPU job trips the driver's watchdog, and the first look at anything is not a stall.
//   4. keep:     built things are never disposed when you walk away. Far things are hidden, not destroyed; coming
//                back just shows them again. The only exception is the memory budget: if the machine cannot hold
//                something, the resident set evicts what is furthest away and least recently seen, and says so.
//
// Nothing here knows about Tōkonto. The game registers its stages and checks (Web/game/persist-hook.js).

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
// Give the browser a frame: the loading screen's slideshow and bar are DOM and CSS, they need the main thread back.
const breathe = () => new Promise(r => (typeof requestAnimationFrame === "function" && !(typeof document !== "undefined" && document.hidden) ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

// Bytes a tier is allowed to keep resident (geometry + textures, estimated). Conservative: a 2 GB laptop GPU shares
// that with the frame buffers, shadow maps and the browser itself.
export const MEMORY_BUDGET = { low: 700e6, medium: 1300e6, high: 2200e6, ultra: 3200e6 };
export function memoryBudget(tier) {
  let b = MEMORY_BUDGET[tier] || MEMORY_BUDGET.medium;
  // the JS heap is the other limit (geometry is held on both sides until it is uploaded)
  try { const m = performance.memory; if (m && m.jsHeapSizeLimit) b = Math.min(b, m.jsHeapSizeLimit * 0.55); } catch (e) { /* not chromium */ }
  return b;
}

// --- measuring --------------------------------------------------------------------------------------------------
function geoBytes(g, seen) {
  if (!g || seen.has(g)) return 0;
  seen.add(g);
  let n = 0;
  if (g.index) n += g.index.array.byteLength;
  for (const k in g.attributes) { const a = g.attributes[k]; if (a && a.array) n += a.array.byteLength; else if (a && a.data && a.data.array && !seen.has(a.data)) { seen.add(a.data); n += a.data.array.byteLength; } }
  return n;
}
function texBytes(t, seen) {
  if (!t || seen.has(t)) return 0;
  seen.add(t);
  const im = t.image;
  const w = (im && (im.width || im.videoWidth)) || 0, h = (im && (im.height || im.videoHeight)) || 0;
  return w * h * 4 * (t.generateMipmaps !== false ? 1.33 : 1) * (t.isCubeTexture ? 6 : 1);
}
const TEX_SLOTS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap", "bumpMap", "displacementMap", "lightMap", "specularMap", "clearcoatNormalMap", "transmissionMap"];
// Geometry and texture bytes under an object. Pass the same `seen` set to count shared data once across calls.
export function estimateBytes(root, seen) {
  seen = seen || new Set();
  let geo = 0, tex = 0;
  root.traverse(o => {
    if (o.geometry) geo += geoBytes(o.geometry, seen);
    if (o.isInstancedMesh && o.instanceMatrix && !seen.has(o.instanceMatrix)) { seen.add(o.instanceMatrix); geo += o.instanceMatrix.array.byteLength; }
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const s of TEX_SLOTS) if (m[s]) tex += texBytes(m[s], seen);
  });
  return { geo, tex, total: geo + tex };
}

// --- the resident set ---------------------------------------------------------------------------------------------
// Things that are built once and kept: buildings' close-up detail, tree tiles, grass tiles. Each entry has a place and
// a size; the owner decides when it should be shown (show/hide), the set only remembers and keeps within the budget.
export class ResidentSet {
  constructor(name, opts) {
    this.name = name;
    this.map = new Map();
    this.bytes = 0;
    this.budget = (opts && opts.budget) || Infinity;
    this.evictions = 0;
    this.onEvict = (opts && opts.onEvict) || null;
    this._tick = 0;
  }
  get size() { return this.map.size; }
  has(key) { return this.map.has(key); }
  get(key) { const e = this.map.get(key); if (e) e.seen = ++this._tick; return e ? e.obj : undefined; }
  // x, z: where it is (for eviction by distance). bytes: what it costs (estimated if left out).
  add(key, obj, x, z, bytes) {
    if (this.map.has(key)) this.remove(key, true);
    const b = bytes != null ? bytes : (obj ? estimateBytes(obj).total : 0);
    this.map.set(key, { obj, x: x || 0, z: z || 0, bytes: b, seen: ++this._tick });
    this.bytes += b;
    return obj;
  }
  // Mark an entry as seen (shown this frame): it is the last to go if memory runs short.
  touch(key) { const e = this.map.get(key); if (e) e.seen = ++this._tick; }
  remove(key, quiet) {
    const e = this.map.get(key);
    if (!e) return;
    this.map.delete(key);
    this.bytes -= e.bytes;
    if (!quiet && this.onEvict) this.onEvict(key, e.obj);
  }
  // Over budget: drop hidden entries, furthest from (fx, fz) and longest unseen first, until it fits. Visible ones stay.
  enforce(fx, fz) {
    if (this.bytes <= this.budget) return 0;
    const c = [];
    for (const [k, e] of this.map) if (!e.obj || !e.obj.visible) c.push([Math.hypot(e.x - fx, e.z - fz) - e.seen * 0.001, k]);
    c.sort((a, b) => b[0] - a[0]);
    let n = 0;
    for (const [, k] of c) { if (this.bytes <= this.budget * 0.92) break; this.remove(k); n++; }
    this.evictions += n;
    if (n) console.warn("[Shigoto] resident " + this.name + ": over its memory budget, let go of " + n + " far, hidden pieces (they rebuild if you go back)");
    return n;
  }
  report() { return { entries: this.map.size, mb: +(this.bytes / 1e6).toFixed(1), budgetMb: isFinite(this.budget) ? +(this.budget / 1e6).toFixed(0) : null, evictions: this.evictions }; }
}

// --- checking -----------------------------------------------------------------------------------------------------
// Integrity of everything under a root: geometry with NaN positions or no vertices, bounds that explode, materials with
// textures that never loaded. Repairs what it safely can (hides a broken mesh, drops a dead texture) and reports.
export function scanScene(root, opts) {
  const repair = !(opts && opts.repair === false);
  const out = { meshes: 0, tris: 0, nan: [], empty: [], badTex: [], repaired: 0 };
  const deadTex = new Set(), okTex = new Set();
  root.traverse(o => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    out.meshes++;
    const g = o.geometry;
    const p = g && g.attributes && g.attributes.position;
    if (!p || p.count === 0) {
      if (!o.isInstancedMesh || !p) { out.empty.push(o.name || o.uuid); }
      return;
    }
    out.tris += (g.index ? g.index.count : p.count) / 3 * (o.isInstancedMesh ? Math.max(1, o.count) : 1);
    if (!g.boundingSphere) { try { g.computeBoundingSphere(); } catch (e) { /* checked below */ } }
    const s = g.boundingSphere;
    if (!s || !isFinite(s.radius) || !isFinite(s.center.x + s.center.y + s.center.z)) {
      out.nan.push(o.name || o.parent && o.parent.name || o.uuid);
      if (repair) { o.visible = false; o.userData.persistBroken = true; out.repaired++; }
    }
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const sl of TEX_SLOTS) {
      const t = m[sl];
      if (!t || okTex.has(t)) continue;
      const im = t.image;
      const ok = deadTex.has(t) ? false : (t.isDataTexture || t.isCompressedTexture || t.isRenderTargetTexture || t.isCubeTexture || t.isVideoTexture || t.isCanvasTexture ||
        (im && (im instanceof (typeof HTMLCanvasElement !== "undefined" ? HTMLCanvasElement : Object) || (typeof ImageBitmap !== "undefined" && im instanceof ImageBitmap) || im.data || (im.complete !== false && (im.naturalWidth > 0 || im.width > 0)))));
      if (ok || !im) { okTex.add(t); continue; }
      // an <img> still on its way is fine (it uploads when it lands); one that failed is not
      if (im.complete === false) { okTex.add(t); continue; }
      deadTex.add(t);
      out.badTex.push((m.name || m.type) + "." + sl);
      if (repair) { m[sl] = null; m.needsUpdate = true; out.repaired++; }
    }
  });
  return out;
}

// Shader programs that failed to link: the object renders black or not at all. Reads the renderer's program cache.
export function shaderFailures(renderer) {
  const bad = [];
  try {
    const gl = renderer.getContext();
    for (const p of renderer.info.programs || []) {
      if (p.program && !gl.getProgramParameter(p.program, gl.LINK_STATUS)) bad.push(p.name || p.cacheKey || "program " + p.id);
      else if (p.diagnostics && p.diagnostics.runnable === false) bad.push(p.name || "program " + p.id);
    }
  } catch (e) { /* context lost: nothing to read */ }
  return bad;
}

// --- warming the GPU ----------------------------------------------------------------------------------------------
// Compile every program and upload every buffer and texture the world uses, so nothing is first touched in play.
// Everything under `root` is made visible and unculled for one render into a tiny target, then put back exactly as it was.
export function warmGPU(renderer, scene, camera, opts) {
  const T = opts && opts.THREE;
  const t0 = now(), saved = [];
  scene.traverse(o => {
    if (o.userData && o.userData.persistBroken) return;
    if (!o.visible || o.frustumCulled) { saved.push([o, o.visible, o.frustumCulled]); o.visible = true; o.frustumCulled = false; }
  });
  let programs0 = 0, programs1 = 0, error = null;
  try {
    programs0 = (renderer.info.programs || []).length;
    renderer.compile(scene, camera);
    if (T && T.WebGLRenderTarget) {
      const rt = new T.WebGLRenderTarget(16, 16);
      const was = renderer.getRenderTarget(), auto = renderer.shadowMap.autoUpdate;
      try {
        renderer.setRenderTarget(rt);
        renderer.render(scene, camera);
      } finally {
        renderer.setRenderTarget(was);
        renderer.shadowMap.autoUpdate = auto;
        rt.dispose();
      }
    }
    programs1 = (renderer.info.programs || []).length;
  } catch (e) { error = e; }
  for (let i = saved.length - 1; i >= 0; i--) { const s = saved[i]; s[0].visible = s[1]; s[0].frustumCulled = s[2]; }
  return { ms: Math.round(now() - t0), objects: saved.length, programs: programs1, newPrograms: programs1 - programs0, error: error ? String(error.message || error) : null };
}

// --- warming the GPU in small pieces ---------------------------------------------------------------------------------
// One render of the whole world is one enormous submission to the graphics driver: every program compiled, every
// texture uploaded and mipmapped, every mesh drawn twice (colour and shadow) in a single go. On Windows a GPU job
// that runs for more than about two seconds trips the driver's watchdog (TDR) and the driver is reset: the screen
// flashes, WebGL loses its context, and the game came up white. Chromium's own GPU watchdog does the same to a GPU
// process that stays busy too long. So the warm-up is cut into batches with a ceiling on what each one may ask of the
// driver (new programs, new texture bytes, triangles), and after each batch the loader waits, without blocking, for
// the GPU to report it finished (a WebGL2 fence) before it sends the next. A batch that took too long makes the next
// ones smaller. If the context is lost anyway the warm stops at once and says so; the host re-runs it when the
// context is restored, and only what was not yet warmed is done again.
//
// Each batch is drawn through a stand-in for the scene: an object whose prototype is the real scene (so the fog, the
// environment and the background are the scene's own) whose children are the scene's visible lights and the batch.
// The lights matter: a program is compiled for a number of lights, and the batch must get the same ones play will.
const WARM_TEX_SLOTS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap", "bumpMap", "displacementMap", "lightMap", "specularMap", "envMap", "gradientMap", "clearcoatNormalMap", "matcap"];
function materialTextures(m, out) {
  for (const k of WARM_TEX_SLOTS) { const t = m[k]; if (t && t.isTexture) out.push(t); }
  if (m.uniforms) for (const k in m.uniforms) { const u = m.uniforms[k]; const v = u && u.value; if (v && v.isTexture) out.push(v); }
  return out;
}
function texCost(t) {
  if (t.isRenderTargetTexture || (t.isDataTexture && !t.image)) return 0;
  const im = t.image;
  if (!im) return 0;
  if (Array.isArray(im)) { let n = 0; for (const f of im) n += ((f && (f.width || 0)) * (f && (f.height || 0))) * 4; return n * 1.34; }
  return (im.width || 0) * (im.height || 0) * 4 * (t.generateMipmaps === false ? 1 : 1.34);
}
function triCost(o) {
  const g = o.geometry;
  if (!g) return 0;
  const n = g.index ? g.index.count : g.attributes && g.attributes.position ? g.attributes.position.count : 0;
  return (n / 3) * (o.isInstancedMesh ? Math.max(1, o.count) : 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Wait until the GPU has done everything sent so far, without blocking the page (the slideshow keeps moving).
export async function gpuSettle(gl, maxMs) {
  if (!gl) return;
  try {
    if (typeof gl.fenceSync !== "function") { gl.flush(); await breathe(); return; }
    const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    if (!s) { await breathe(); return; }
    const t0 = now();
    while (now() - t0 < (maxMs || 4000)) {
      await sleep(4);
      if (gl.isContextLost()) break;
      if (gl.getSyncParameter(s, gl.SYNC_STATUS) === gl.SIGNALED) break;
    }
    gl.deleteSync(s);
  } catch (e) { /* context lost mid-wait: the caller checks */ }
}
// Meshes already warmed, so a second warm (after the opening adds its train, or after a driver reset) only does the rest.
let WARMED = new WeakSet(), WARMED_TEX = new WeakSet(), WARMED_TEX_BYTES = 0;   // shared by every warm until the context is lost
export function forgetWarm() { WARMED = new WeakSet(); WARMED_TEX = new WeakSet(); WARMED_TEX_BYTES = 0; }
export async function warmGPUChunked(renderer, scene, camera, opts) {
  opts = opts || {};
  const T = opts.THREE;
  const gl = renderer.getContext();
  const t0 = now();
  const res = { ms: 0, batches: 0, objects: 0, programs: 0, newPrograms: 0, texMb: 0, lost: false, error: null, slowest: 0 };
  if (gl.isContextLost()) { res.lost = true; return res; }
  const lim = Object.assign({ programs: 6, texBytes: 64e6, tris: 400e3, items: 600, targetMs: 120, maxMs: 450 }, opts.limits || {});
  const cur = { programs: lim.programs, texBytes: lim.texBytes, tris: lim.tris, items: lim.items };
  const roots = opts.roots || [scene];
  const lights = [];
  scene.traverseVisible(o => { if (o.isLight) lights.push(o); });
  scene.updateMatrixWorld(true);
  for (const root of roots) if (root !== scene && root.parent === null) root.updateMatrixWorld(true);
  const items = [];
  for (const root of roots) root.traverse(o => {
    if (o.userData && o.userData.persistBroken) return;
    if ((o.isMesh || o.isLine || o.isPoints || o.isSprite) && o.material && !WARMED.has(o)) items.push(o);
  });
  // Order: what matters first (the host's priority, e.g. distance from where the story starts, in bands), and within a band by
  // material, so a batch compiles few programs and shares what it uploads.
  const firstMat = o => (Array.isArray(o.material) ? o.material[0] : o.material) || {};
  const pri = new Map();
  if (opts.priority) for (const o of items) { let p = 0; try { p = +opts.priority(o) || 0; } catch (e) { /* 0 */ } pri.set(o, p); }
  items.sort((a, b) => ((pri.get(a) || 0) - (pri.get(b) || 0)) || ((firstMat(a).id || 0) - (firstMat(b).id || 0)));
  // Video memory: uploading every texture in the world at once can ask a 2-4 GB card for more than it has, and an over-committed card
  // is the other way a driver resets. Past the budget, meshes that would bring new textures are left to upload when first seen.
  const texBudget = opts.texBudget || Infinity;
  let texTotal = WARMED_TEX_BYTES;   // the budget covers every warm since the last context loss, not each call
  res.skipped = 0;
  const seenMat = new Set(), seenTex = WARMED_TEX;
  const proxy = Object.create(scene);
  proxy.autoUpdate = false;
  proxy.matrixAutoUpdate = false;
  const render = opts.render || ((p, cam) => {
    const rt = render.rt || (render.rt = new T.WebGLRenderTarget(16, 16));
    if (opts.encoding !== undefined) rt.texture.encoding = opts.encoding;
    const was = renderer.getRenderTarget();
    try { renderer.setRenderTarget(rt); renderer.render(p, cam); } finally { renderer.setRenderTarget(was); }
  });
  const programs0 = (renderer.info.programs || []).length;
  const autoShadow = renderer.shadowMap.autoUpdate;
  let i = 0;
  try {
    while (i < items.length) {
      // the next batch, within this round's ceilings (always at least one item)
      const batch = [];
      let progs = 0, texB = 0, tris = 0;
      while (i < items.length && batch.length < cur.items) {
        const o = items[i];
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        let np = 0, nt = 0;
        const texs = [];
        for (const m of mats) if (m) { if (!seenMat.has(m)) np++; materialTextures(m, texs); }
        for (const t of texs) if (!seenTex.has(t)) nt += texCost(t);
        if (nt > 0 && texTotal + nt > texBudget) { res.skipped++; i++; continue; }
        const tr = triCost(o);
        if (batch.length && (progs + np > cur.programs || texB + nt > cur.texBytes || tris + tr > cur.tris)) break;
        for (const m of mats) if (m) seenMat.add(m);
        for (const t of texs) seenTex.add(t);
        progs += np; texB += nt; tris += tr; texTotal += nt;
        batch.push(o); i++;
      }
      if (!batch.length) continue;
      const saved = batch.map(o => [o, o.visible, o.frustumCulled]);
      for (const o of batch) { o.visible = true; o.frustumCulled = false; }
      proxy.children = lights.concat(batch);
      const b0 = now();
      try {
        renderer.shadowMap.autoUpdate = true;
        render(proxy, camera);
      } finally {
        renderer.shadowMap.autoUpdate = autoShadow;
        for (const s of saved) { s[0].visible = s[1]; s[0].frustumCulled = s[2]; }
        proxy.children = [];
      }
      await gpuSettle(gl, 5000);
      const took = now() - b0;
      res.slowest = Math.max(res.slowest, Math.round(took));
      if (gl.isContextLost()) { res.lost = true; break; }
      for (const o of batch) WARMED.add(o);
      res.batches++; res.objects += batch.length; res.texMb += texB / 1e6;
      // adapt: a slow batch halves the next ones, a quick one lets them grow back towards the ceiling
      const k = took > lim.maxMs ? 0.5 : took > lim.targetMs ? 0.8 : took < lim.targetMs * 0.4 ? 1.4 : 1;
      cur.programs = Math.max(1, Math.min(lim.programs, Math.round(cur.programs * k)));
      cur.texBytes = Math.max(4e6, Math.min(lim.texBytes, cur.texBytes * k));
      cur.tris = Math.max(20e3, Math.min(lim.tris, cur.tris * k));
      cur.items = Math.max(8, Math.min(lim.items, Math.round(cur.items * k)));
      if (opts.progress) try { opts.progress(i / items.length); } catch (e) { /* cosmetic */ }
      await breathe();
    }
    // one shadow pass over the whole scene at the end, now that every depth program exists, so the first frame's shadow map is ready
    if (!res.lost && opts.finalShadow !== false) { renderer.shadowMap.needsUpdate = true; }
  } catch (e) { res.error = String(e && e.message || e); }
  finally { WARMED_TEX_BYTES = texTotal; renderer.shadowMap.autoUpdate = autoShadow; if (render.rt) { render.rt.dispose(); render.rt = null; } }
  const programs1 = (renderer.info.programs || []).length;
  res.programs = programs1; res.newPrograms = programs1 - programs0; res.texMb = +res.texMb.toFixed(0); res.ms = Math.round(now() - t0); res.items = items.length;
  return res;
}

// --- the loader ---------------------------------------------------------------------------------------------------
export class Persistence {
  constructor(opts) {
    opts = opts || {};
    this.sliceMs = opts.sliceMs || 28;          // work this long, then give the loading screen a frame
    this.stages = [];
    this.checks = [];
    this.resident = new Map();
    this.report = null;
    this.running = false;
    this.done = false;
    this.budget = opts.budget || memoryBudget(opts.tier);
    this.log = [];
  }

  // A stage of the load. fn(ctx) may be async; long loops call `await ctx.slice()` often and ctx.progress(0..1).
  stage(name, weight, fn, opts) { this.stages.push({ name, weight: weight || 1, fn, optional: !!(opts && opts.optional), label: (opts && opts.label) || name }); return this; }
  // A check against one framework (scene, shaders, physics, characters, memory, world...). fn(ctx) returns:
  //   true / undefined            pass
  //   "text"                      fail, with why
  //   { ok, detail, repaired }    full answer (repaired: it was wrong and has been put right)
  check(framework, name, fn) { this.checks.push({ framework, name, fn }); return this; }
  // A named resident set, sharing the persistence memory budget in the given proportion.
  residentSet(name, share) { let s = this.resident.get(name); if (!s) { s = new ResidentSet(name, { budget: this.budget * (share || 0.25) }); this.resident.set(name, s); } return s; }
  residentBytes() { let n = 0; for (const s of this.resident.values()) n += s.bytes; return n; }

  async run(onProgress) {
    if (this.running) throw new Error("Shigoto persistence: already loading");
    this.running = true;
    const T0 = now();
    const total = this.stages.reduce((a, s) => a + s.weight, 0) || 1;
    let before = 0, sliceAt = now();
    const report = { stages: [], checks: [], failed: 0, repaired: 0, ms: 0, residentMb: 0, budgetMb: Math.round(this.budget / 1e6) };
    const say = (label, t) => { try { onProgress && onProgress(label, Math.max(0, Math.min(1, t))); } catch (e) { /* the bar is cosmetic */ } };
    for (const st of this.stages) {
      const s0 = now();
      let frac = 0;
      const ctx = {
        persistence: this,
        progress: t => { frac = Math.max(frac, Math.min(1, t)); say(st.label, (before + st.weight * frac) / total); },
        // yield if this slice has used its time; cheap enough to call every iteration
        slice: async () => { if (now() - sliceAt > this.sliceMs) { await breathe(); sliceAt = now(); } },
        breathe: async () => { await breathe(); sliceAt = now(); },
        note: text => this.log.push("[" + st.name + "] " + text)
      };
      say(st.label, before / total);
      let result = null, error = null;
      try { result = await st.fn(ctx); } catch (e) { error = e; console.error("[Shigoto] persistence stage '" + st.name + "' failed", e); }
      before += st.weight;
      report.stages.push({ name: st.name, ms: Math.round(now() - s0), ok: !error, error: error ? String(error.message || error) : undefined, result: result == null ? undefined : result });
      await breathe(); sliceAt = now();
    }
    // the checks, after everything is built
    say("Checking the world", 0.995);
    for (const c of this.checks) {
      let r;
      try { r = await c.fn({ persistence: this }); } catch (e) { r = { ok: false, detail: "check threw: " + (e.message || e) }; }
      if (r === undefined || r === true) r = { ok: true };
      else if (typeof r === "string") r = { ok: false, detail: r };
      else if (r === false) r = { ok: false };
      const row = Object.assign({ framework: c.framework, name: c.name }, r);
      if (!row.ok) report.failed++;
      if (row.repaired) report.repaired++;
      report.checks.push(row);
      if (now() - sliceAt > this.sliceMs) { await breathe(); sliceAt = now(); }
    }
    report.ms = Math.round(now() - T0);
    report.residentMb = +(this.residentBytes() / 1e6).toFixed(1);
    report.resident = {};
    for (const [k, s] of this.resident) report.resident[k] = s.report();
    this.report = report;
    this.running = false;
    this.done = true;
    say("Ready", 1);
    const bad = report.checks.filter(c => !c.ok);
    console.log("[Shigoto] persistence: world built and checked in " + (report.ms / 1000).toFixed(1) + " s; " + report.checks.length + " checks, " +
      bad.length + " failed, " + report.repaired + " repaired; " + report.residentMb + " MB resident of a " + report.budgetMb + " MB budget");
    for (const b of bad) console.warn("[Shigoto] check failed: " + b.framework + " / " + b.name + (b.detail ? ": " + b.detail : ""));
    return report;
  }

  // A plain-text summary for the console and the F3 overlay.
  summary() {
    const r = this.report;
    if (!r) return this.running ? "persistence: loading" : "persistence: not run";
    const lines = ["persistence: built + checked in " + (r.ms / 1000).toFixed(1) + " s, " + r.residentMb + "/" + r.budgetMb + " MB"];
    for (const c of r.checks) lines.push((c.ok ? (c.repaired ? "FIXED " : "ok    ") : "FAIL  ") + c.framework + " / " + c.name + (c.detail ? " - " + c.detail : ""));
    return lines.join("\n");
  }
}
