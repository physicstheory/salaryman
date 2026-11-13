// The Foundry in the game: models rebuilt in headless Blender (Tools/foundry) replace the code-built and toy-kit ones.
// Every Foundry model is a .glb in Web/foundry with LOD0/LOD1/LOD2 children and is listed in foundry/index.json.
//
//   trains    the commuter and shinkansen end/middle cars replace buildCarriage's boxes. They stay instanced: one
//             InstancedMesh per material per LOD, and each car is put in the LOD its distance from the camera asks for,
//             so 40 cars on screen cost a few dozen draw calls and the far ones a few thousand triangles.
//
//   console   foundry.list()   what was loaded, with triangles per LOD
//             foundry.stats()  instances drawn per LOD this frame
// Off switch: ?foundry=0 (or localStorage konto.foundry=0) brings back the old models.
(function () {
  "use strict";
  let off = /[?&]foundry=0\b/.test(location.search);
  try { off = off || localStorage.getItem("konto.foundry") === "0"; } catch (e) { /* private window */ }
  if (off || typeof THREE === "undefined" || typeof THREE.GLTFLoader !== "function") return;

  const BASE = window.__foundryBase || "";
  const F = window.foundry = { version: "1.0.0", index: null, models: {}, stats: () => F._stats, _stats: {} };
  const loader = new THREE.GLTFLoader();
  if (window.MeshoptDecoder && loader.setMeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);

  F.ready = fetch(BASE + "foundry/index.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null).then(ix => {
    F.index = ix && ix.models ? ix.models : {};
    return F.index;
  });

  // Load one model -> { lods: [ [ {geometry, material, name}, ... ], ... ], dists: [...] } with every mesh's transform
  // baked into its geometry (relative to the model root), so the parts can be instanced directly.
  F.load = function (id) {
    if (F.models[id]) return F.models[id];
    F.models[id] = F.ready.then(ix => new Promise((resolve, reject) => {
      const e = ix[id];
      if (!e) { reject(new Error("no foundry model " + id)); return; }
      loader.load(BASE + "foundry/" + e.file, gltf => {
        const root = gltf.scene;
        root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
        const lods = [], dists = [];
        const lodNodes = [];
        root.traverse(o => { const m = /^LOD(\d)$/.exec(o.name); if (m) lodNodes[+m[1]] = o; });
        if (!lodNodes.length) lodNodes[0] = root;
        lodNodes.forEach((n, li) => {
          const parts = [];
          n.traverse(o => {
            if (!o.isMesh) return;
            const g = floatGeometry(o.geometry);
            g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
            parts.push({ geometry: g, material: tune(o.material), name: o.name });
          });
          lods[li] = parts;
          dists[li] = (n.userData && n.userData.dist) || [0, 60, 220][li] || 0;
        });
        resolve({ id, entry: e, lods, dists });
      }, undefined, err => reject(err));
    }));
    return F.models[id];
  };

  // Packed models are quantized (KHR_mesh_quantization): r128's BufferAttribute does not de-normalise in getX/setX,
  // so turn every attribute back into floats before baking a transform into it.
  function floatGeometry(src) {
    const g = src.clone();
    for (const k of Object.keys(g.attributes)) {
      const a = g.attributes[k];
      const inter = !!a.isInterleavedBufferAttribute;
      const arr = inter ? a.data.array : a.array;
      if (!inter && arr instanceof Float32Array) continue;
      const stride = inter ? a.data.stride : a.itemSize, off = inter ? a.offset : 0;
      const div = !a.normalized ? 1 : arr instanceof Int8Array ? 127 : arr instanceof Uint8Array ? 255 : arr instanceof Int16Array ? 32767 : arr instanceof Uint16Array ? 65535 : 1;
      const out = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) {
        const v = arr[i * stride + off + c] / div;
        out[i * a.itemSize + c] = a.normalized ? Math.max(-1, v) : v;
      }
      g.setAttribute(k, new THREE.BufferAttribute(out, a.itemSize));
    }
    return g;
  }

  function tune(m) {
    if (!m || m.userData.foundry) return m;
    m.userData.foundry = true;
    m.userData.pbrDone = true;               // the game's pbrTune leaves finished materials alone
    if (m.map) m.map.anisotropy = 8;
    if (m.normalMap) m.normalMap.anisotropy = 8;
    if (m.transparent) { m.depthWrite = false; m.envMapIntensity = 1.4; }
    if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.3) { m.toneMapped = true; m.userData.lamp = true; }
    return m;
  }

  // ---- trains ----------------------------------------------------------------------------------------------
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3();
  const TR = F.trains = { ready: false, groups: [] };

  function trainSwap() {
    if (typeof rail !== "object" || !rail.ready || TR.started) return;
    TR.started = true;
    const kinds = TRAIN_KINDS.map(k => k.name);
    const jobs = [];
    kinds.forEach((kn, ki) => ["end", "mid"].forEach((part, end) => {
      jobs.push(F.load(kn + "_" + part).then(model => {
        const old = rail.body[ki] && rail.body[ki][end];
        if (!old) return;
        const cap = old.body.instanceMatrix.count;
        const root = old.body.parent;
        const lods = model.lods.map(parts => parts.map(pt => {
          const im = new THREE.InstancedMesh(pt.geometry, pt.material, cap);
          im.count = 0; im.frustumCulled = false; im.castShadow = !pt.material.transparent; im.receiveShadow = true;
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          root.add(im);
          return im;
        }));
        TR.groups.push({ old, lods, dists: model.dists, id: model.id });
        [old.body, old.trim, old.deco].forEach(m => { m.visible = false; });
      }).catch(err => console.warn("[Foundry] " + kn + " " + part + ":", err.message || err)));
    }));
    Promise.all(jobs).then(() => { TR.ready = TR.groups.length > 0; if (TR.ready) console.log("[Foundry] trains rebuilt in Blender: " + TR.groups.map(g => g.id).join(", ")); });
  }

  function trainTick() {
    if (!TR.ready || typeof camera === "undefined" || !camera) return;
    const cp = camera.position, st = F._stats.trains = [0, 0, 0];
    for (const g of TR.groups) {
      const src = g.old.body, n = src.count;
      const cnt = g.lods.map(() => 0);
      const d1 = g.dists[1] || 60, d2 = g.dists[2] || 220;
      for (let i = 0; i < n; i++) {
        src.getMatrixAt(i, _m);
        _p.setFromMatrixPosition(_m);
        const d = _p.distanceTo(cp);
        const li = d > d2 && g.lods[2] ? 2 : d > d1 && g.lods[1] ? 1 : 0;
        const slot = cnt[li]++;
        for (const im of g.lods[li]) im.setMatrixAt(slot, _m);
      }
      g.lods.forEach((ims, li) => {
        st[li] += cnt[li];
        for (const im of ims) { im.count = cnt[li]; im.instanceMatrix.needsUpdate = true; }
      });
    }
  }

  const _updateRail = window.updateRail;
  if (typeof _updateRail === "function") {
    window.updateRail = function (dt, at) {
      const r = _updateRail.apply(this, arguments);
      try { if (!TR.started) trainSwap(); trainTick(); } catch (e) { console.warn("[Foundry] trains:", e); TR.ready = false; }
      return r;
    };
  }

  // ---- rooftops -------------------------------------------------------------------------------------------
  // Every flat city roof gets what real ones carry (Tools/foundry/gen/roofs.py): plant rooms, chillers, condenser racks,
  // water tanks, cooling towers, masts, solar, rooftop sign frames and helipads on the tallest towers. Placed once per
  // world from the building boxes, merged per 256 m chunk and per material (a dozen draw calls a chunk), streamed with
  // the buildings, LOD1 within 260 m and LOD2 beyond. Replaces the coloured boxes the close-up detail used to put there.
  const RF = F.roofs = { boxes: [], chunks: [], ready: false, items: 0, tris: 0 };
  F.roofsOn = true;
  const ROOF_IDS = ["roof_chiller", "roof_condensers", "roof_watertank", "roof_liftroom", "roof_coolingtower", "roof_mast", "roof_solar", "roof_helipad", "roof_vents", "roof_billboard"];
  const RCH = 256;

  function flatRoof(b) {
    if (!b || b.deck || b.house || b.pier) return false;
    if (typeof GABLED === "object" && GABLED[b.style] && b.h <= (typeof GABLE_MAX_H === "number" ? GABLE_MAX_H : 12.5)) return false;
    if (b.style === "houses" || b.style === "machiya" || b.style === "kura") return false;
    return b.h >= 7 && Math.min(b.size[0], b.size[1]) >= 6;
  }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // -> [{id, lx, lz, yaw}] in the building's own frame (x along size[0], z along size[1])
  function roofPlan(b, sizes) {
    const r = mulberry((Math.round(b.c[0] * 7) * 73856093) ^ (Math.round(b.c[1] * 7) * 19349663));
    const W = b.size[0], D = b.size[1], H = b.h, area = W * D, out = [], taken = [];
    const fits = (id, lx, lz, rot) => {
      const s = sizes[id]; if (!s) return false;
      const sx = (rot ? s[2] : s[0]) / 2 + 0.6, sz = (rot ? s[0] : s[2]) / 2 + 0.6;
      if (Math.abs(lx) + sx > W / 2 - 0.8 || Math.abs(lz) + sz > D / 2 - 0.8) return false;
      for (const t of taken) if (Math.abs(lx - t[0]) < sx + t[2] && Math.abs(lz - t[1]) < sz + t[3]) return false;
      taken.push([lx, lz, sx, sz]); return true;
    };
    const put = (id, tries, where) => {
      for (let k = 0; k < (tries || 12); k++) {
        const rot = r() < 0.5 ? 1 : 0;
        let lx, lz;
        if (where === "centre") { lx = (r() - 0.5) * W * 0.15; lz = (r() - 0.5) * D * 0.15; }
        else if (where === "edge") { const e = r() < 0.5; lx = e ? (r() < 0.5 ? -1 : 1) * W * 0.3 : (r() - 0.5) * W * 0.5; lz = e ? (r() - 0.5) * D * 0.5 : (r() < 0.5 ? -1 : 1) * D * 0.3; }
        else { lx = (r() - 0.5) * W * 0.8; lz = (r() - 0.5) * D * 0.8; }
        if (fits(id, lx, lz, rot)) { out.push({ id, lx, lz, yaw: rot * Math.PI / 2 + (r() < 0.5 ? 0 : Math.PI) }); return true; }
      }
      return false;
    };
    if (H >= 110 && W >= 24 && D >= 24 && r() < 0.8) put("roof_helipad", 6, "centre");
    if (area > 90) put("roof_liftroom", 10);
    if (H >= 40) {
      const n = area > 1200 ? 4 : area > 500 ? 3 : 2;
      for (let i = 0; i < n; i++) put(r() < 0.55 ? "roof_chiller" : "roof_coolingtower");
      if (r() < 0.55) put("roof_mast", 8, "edge");
      for (let i = 0; i < 2; i++) put("roof_condensers");
      put("roof_vents");
    } else {
      if (r() < 0.6) put("roof_watertank");
      const n = 1 + Math.floor(r() * (area > 300 ? 4 : 2));
      for (let i = 0; i < n; i++) put("roof_condensers");
      if (r() < 0.5) put("roof_vents");
      if (r() < 0.22 && H < 30) put("roof_solar");
      if (r() < 0.18 && /shop|office/.test(b.style || "")) put("roof_billboard", 8, "edge");
      if (r() < 0.2) put("roof_chiller");
    }
    return out;
  }

  // merge [{parts, matrix}] by material name -> [Mesh]
  const _n3 = new THREE.Matrix3(), _v = new THREE.Vector3();
  function mergeByMaterial(list, matByName) {
    const groups = new Map();
    for (const it of list) for (const pt of it.parts) {
      const k = pt.material.name || pt.material.uuid;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push([pt.geometry, it.matrix]);
    }
    const meshes = [];
    groups.forEach((arr, k) => {
      let nv = 0, ni = 0;
      const hasColor = arr.some(([g]) => g.attributes.color), hasUv = arr.every(([g]) => g.attributes.uv);
      for (const [g] of arr) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = hasUv ? new Float32Array(nv * 2) : null, C = hasColor ? new Float32Array(nv * 3) : null;
      const I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let vo = 0, io = 0;
      for (const [g, m] of arr) {
        _n3.getNormalMatrix(m);
        const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, c = g.attributes.color;
        for (let i = 0; i < p.count; i++) {
          _v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m); P.set([_v.x, _v.y, _v.z], (vo + i) * 3);
          if (n) { _v.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(_n3).normalize(); N.set([_v.x, _v.y, _v.z], (vo + i) * 3); }
          if (U) { U[(vo + i) * 2] = u.getX(i); U[(vo + i) * 2 + 1] = u.getY(i); }
          if (C) { if (c) { C[(vo + i) * 3] = c.getX(i); C[(vo + i) * 3 + 1] = c.getY(i); C[(vo + i) * 3 + 2] = c.getZ(i); } else C.fill(1, (vo + i) * 3, (vo + i) * 3 + 3); }
        }
        if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i++) I[io + i] = ix[i] + vo; io += ix.length; }
        else { for (let i = 0; i < p.count; i++) I[io + i] = vo + i; io += p.count; }
        vo += p.count;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(P, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(N, 3));
      if (U) geo.setAttribute("uv", new THREE.BufferAttribute(U, 2));
      if (C) geo.setAttribute("color", new THREE.BufferAttribute(C, 3));
      geo.setIndex(new THREE.BufferAttribute(I, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, matByName.get(k));
      mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false;
      meshes.push(mesh);
      RF.tris += ni / 3;
    });
    return meshes;
  }

  function roofsBuild(parent) {
    const boxes = RF.boxes.filter(flatRoof);
    RF.boxes = [];
    if (!boxes.length) return;
    Promise.all(ROOF_IDS.map(id => F.load(id).catch(() => null))).then(models => {
      const byId = {}, sizes = {}, matByName = new Map();
      models.forEach(m => {
        if (!m) return;
        byId[m.id] = m; sizes[m.id] = m.entry.size;
        m.lods.forEach(parts => parts.forEach(pt => { const k = pt.material.name || pt.material.uuid; if (!matByName.has(k)) matByName.set(k, pt.material); }));
      });
      if (!Object.keys(byId).length) return;
      // plan every roof, bucket by chunk
      const chunks = new Map(), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
      for (const b of boxes) {
        const plan = roofPlan(b, sizes);
        if (!plan.length) continue;
        const key = Math.floor(b.c[0] / RCH) + "," + Math.floor(b.c[1] / RCH);
        let ch = chunks.get(key);
        if (!ch) chunks.set(key, ch = { near: [], far: [], bb: { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, y0: 1e9, y1: -1e9 } });
        const by = b.yaw * Math.PI / 180, cs = Math.cos(by), sn = Math.sin(by), top = b.y + b.h;
        for (const it of plan) {
          const m = byId[it.id]; if (!m) continue;
          const wx = b.c[0] + it.lx * cs + it.lz * sn, wz = b.c[1] - it.lx * sn + it.lz * cs;
          e.set(0, by + it.yaw, 0); q.setFromEuler(e);
          const mat = new THREE.Matrix4().compose(new THREE.Vector3(wx, top, wz), q, one);
          ch.near.push({ parts: m.lods[Math.min(1, m.lods.length - 1)], matrix: mat });
          ch.far.push({ parts: m.lods[m.lods.length - 1], matrix: mat });
          const bb = ch.bb; bb.x0 = Math.min(bb.x0, wx - 12); bb.x1 = Math.max(bb.x1, wx + 12); bb.z0 = Math.min(bb.z0, wz - 12); bb.z1 = Math.max(bb.z1, wz + 12); bb.y0 = Math.min(bb.y0, top); bb.y1 = Math.max(bb.y1, top + 12);
          RF.items++;
        }
      }
      // merge one chunk per slice of time, so the world build does not hitch
      const list = [...chunks.values()];
      const step = () => {
        const t0 = performance.now();
        while (list.length && performance.now() - t0 < 8) {
          const ch = list.shift();
          const g = new THREE.Group(), near = new THREE.Group(), far = new THREE.Group();
          mergeByMaterial(ch.near, matByName).forEach(m => near.add(m));
          mergeByMaterial(ch.far, matByName).forEach(m => far.add(m));
          g.add(near, far); near.visible = false;
          g.userData.foundryRoofs = true;
          parent.add(g);
          const c = new THREE.Vector3((ch.bb.x0 + ch.bb.x1) / 2, (ch.bb.y0 + ch.bb.y1) / 2, (ch.bb.z0 + ch.bb.z1) / 2);
          RF.chunks.push({ g, near, far, c, r: Math.hypot(ch.bb.x1 - ch.bb.x0, ch.bb.z1 - ch.bb.z0) / 2 });
          if (typeof streamAdd === "function" && typeof STREAM === "object") streamAdd(g, ch.bb, STREAM.low);
        }
        if (list.length) setTimeout(step, 0);
        else { RF.ready = true; console.log("[Foundry] rooftops: " + RF.items + " pieces on " + boxes.length + " roofs, " + RF.chunks.length + " chunks, " + Math.round(RF.tris / 1000) + "k triangles in all"); }
      };
      step();
    });
  }

  function roofsTick() {
    if (!RF.chunks.length || typeof camera === "undefined" || !camera) return;
    const cp = camera.position;
    for (const ch of RF.chunks) {
      if (!ch.g.visible) continue;
      const near = cp.distanceTo(ch.c) - ch.r < 260;
      if (ch.near.visible !== near) { ch.near.visible = near; ch.far.visible = !near; }
    }
  }

  // ---- stations ------------------------------------------------------------------------------------------------------------------------
  // NHRail stations (Tools/foundry/gen/station.py): 12 m platform bays (plain, with seats, with vending machines) down both side
  // platforms, stretched a little so whole bays fill the platform, and the concourse at its end. konto.html skips its own
  // boxes when stationsOn is set and leaves the layout in window.__stationKits. One merged group per station, LOD by distance.
  F.stationsOn = true;
  const ST = F.stations = { groups: [], ready: false };
  const ST_IDS = ["station_bay", "station_bay_bench", "station_bay_vend", "station_concourse"];
  function stationsBuild(parent) {
    const kits = window.__stationKits || [];
    window.__stationKits = [];
    if (!kits.length) return;
    Promise.all(ST_IDS.map(id => F.load(id).catch(() => null))).then(models => {
      const byId = {}, matByName = new Map();
      models.forEach(m => { if (!m) return; byId[m.id] = m; m.lods.forEach(parts => parts.forEach(pt => { const k = pt.material.name || pt.material.uuid; if (!matByName.has(k)) matByName.set(k, pt.material); })); });
      if (!byId.station_bay) return;
      const list = kits.slice(), Y = new THREE.Vector3(0, 1, 0);
      const step = () => {
        const t0 = performance.now();
        while (list.length && performance.now() - t0 < 8) {
          const k = list.shift(), near = [], far = [];
          const frame = new THREE.Matrix4().makeRotationY(k.yaw).setPosition(k.x, k.y, k.z);
          const put = (id, lx, ly, lz, rot, sz) => {
            const m = byId[id]; if (!m) return;
            const local = new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), new THREE.Quaternion().setFromAxisAngle(Y, rot), new THREE.Vector3(1, 1, sz || 1));
            const mat = frame.clone().multiply(local);
            near.push({ parts: m.lods[0], matrix: mat });
            far.push({ parts: m.lods[m.lods.length - 1], matrix: mat });
          };
          const n = Math.max(1, Math.ceil(k.PL / 12 - 0.15)), stretch = k.PL / (n * 12);
          [-1, 1].forEach(side => {
            for (let i = 0; i < n; i++) {
              const z = (i - (n - 1) / 2) * 12 * stretch;
              const id = i % 3 === 1 ? "station_bay_bench" : i % 4 === 2 ? "station_bay_vend" : "station_bay";
              put(byId[id] ? id : "station_bay", side * 6.7, 0, z, side > 0 ? 0 : Math.PI, stretch);
            }
          });
          put("station_concourse", 0, k.conY, k.conZ, k.fz > 0 ? 0 : Math.PI);
          const g = new THREE.Group(), gn = new THREE.Group(), gf = new THREE.Group();
          mergeByMaterial(near, matByName).forEach(m => gn.add(m));
          mergeByMaterial(far, matByName).forEach(m => gf.add(m));
          g.add(gn, gf); gn.visible = false;
          g.userData.foundryStation = true;
          parent.add(g);
          const c = new THREE.Vector3(k.x, k.y, k.z), r = k.PL / 2 + 25;
          ST.groups.push({ g, near: gn, far: gf, c, r });
          if (typeof streamAdd === "function" && typeof STREAM === "object") streamAdd(g, { x0: k.x - r, x1: k.x + r, z0: k.z - r, z1: k.z + r, y0: k.y - 20, y1: k.y + 10 }, STREAM.low);
        }
        if (list.length) setTimeout(step, 0);
        else { ST.ready = true; console.log("[Foundry] stations: " + ST.groups.length + " rebuilt from the Blender kit"); }
      };
      step();
    });
  }
  function stationsTick() {
    if (!ST.groups.length || typeof camera === "undefined" || !camera) return;
    const cp = camera.position;
    for (const s of ST.groups) {
      if (!s.g.visible) continue;
      const near = cp.distanceTo(s.c) - s.r < 140;
      if (s.near.visible !== near) { s.near.visible = near; s.far.visible = !near; }
    }
  }

  const _detailRegister = window.detailRegister;
  if (typeof _detailRegister === "function") {
    window.detailRegister = function (boxes) {
      try { if (Array.isArray(boxes)) for (const b of boxes) RF.boxes.push(b); } catch (e) { /* the roofs stay bare */ }
      return _detailRegister.apply(this, arguments);
    };
  }
  const _buildScene = window.buildScene;
  if (typeof _buildScene === "function") {
    window.buildScene = function (w) {
      RF.chunks.forEach(ch => { if (ch.g.parent) ch.g.parent.remove(ch.g); });
      if (typeof STREAM === "object" && STREAM.reg) STREAM.reg = STREAM.reg.filter(e => !(e.o.userData && e.o.userData.foundryRoofs));
      RF.chunks = []; RF.boxes = []; RF.items = 0; RF.tris = 0; RF.ready = false;
      ST.groups.forEach(s => { if (s.g.parent) s.g.parent.remove(s.g); });
      if (typeof STREAM === "object" && STREAM.reg) STREAM.reg = STREAM.reg.filter(e => !(e.o.userData && e.o.userData.foundryStation));
      ST.groups = []; ST.ready = false; window.__stationKits = [];
      const r = _buildScene.apply(this, arguments);
      try { roofsBuild(scene); } catch (e) { console.warn("[Foundry] rooftops:", e); }
      try { stationsBuild(scene); } catch (e) { console.warn("[Foundry] stations:", e); }
      return r;
    };
  }
  const _streamFrame = window.streamFrame;
  if (typeof _streamFrame === "function") {
    window.streamFrame = function () {
      const r = _streamFrame.apply(this, arguments);
      try { roofsTick(); stationsTick(); } catch (e) { /* next frame */ }
      return r;
    };
  }

  F.list = function () {
    return Object.keys(F.index || {}).map(k => { const e = F.index[k]; return { id: k, category: e.category, tris: e.lods.map(l => l.tris).join(" / "), mb: +(e.bytes / 1e6).toFixed(1) }; });
  };
})();
