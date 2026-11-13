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

  F.list = function () {
    return Object.keys(F.index || {}).map(k => { const e = F.index[k]; return { id: k, category: e.category, tris: e.lods.map(l => l.tris).join(" / "), mb: +(e.bytes / 1e6).toFixed(1) }; });
  };
})();
