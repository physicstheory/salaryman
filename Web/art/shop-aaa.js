/* Salary Man: shop interiors brought up to the AAA bar (Duncan, 2026-11-02).
 *
 * The shop rooms in konto.html are assembled from boxes. Until now those boxes were drawn unlit in flat colours, the room was lit by one
 * weak lamp, and indoors still used the outdoor night sky as its reflection, so walls, floors and people went near-black at night while the
 * stock glowed in pastel. This file fixes that without touching the room layouts, the stock, the colliders or the shopping:
 *
 *   ShopAAA.finish(room, root)   runs once when a room is built. Every surface gets a full PBR material (base colour, normal, roughness)
 *                                from the scanned texture library, with UVs in metres so nothing stretches. Signs and posters are lit.
 *                                Bare primitive decor that has no real counterpart is removed; scanned props stand in where they exist.
 *   ShopAAA.enter(room) / leave() swap the reflections to a bright indoor light probe, switch the sun and sky light off indoors and pin
 *                                the exposure, so a shop looks the same at noon and at midnight, the way a lit shop does.
 *   ShopAAA.book(group, item)    a real-looking book for the bookshop (cloth spine, printed cover, page block) instead of a coloured box.
 *   ShopAAA.audit(root)          lists any colour-only surface still visible in a room (the persistence checks and tests call it).
 */
(function () {
  'use strict';
  const T = THREE;
  const low = () => typeof gfx !== 'undefined' && gfx.tier === 'low';
  const state = { finished: 0, removed: 0, swapped: 0, env: null, saved: null, rooms: 0 };

  // ---- texture library ----------------------------------------------------------------------------------------------------------------
  const texCache = new Map();
  function tex(url, srgb, tile) {
    const key = url + '|' + tile;
    if (texCache.has(key)) return texCache.get(key);
    const t = new T.TextureLoader().load(url);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = low() ? 2 : 8;
    if (srgb) t.encoding = T.sRGBEncoding;
    t.repeat.set(1 / tile, 1 / tile);
    texCache.set(key, t); return t;
  }
  const R = 'art/realism/', I = 'art/interior/';
  const rl = n => R + n + (low() ? '-low' : '') + '.jpg';
  // tile: metres one copy of the texture covers. rough: roughness when the set has no roughness map.
  const SETS = {
    wood:    { map: I + 'wood_floor.jpg', nor: I + 'wood_floor_nor.jpg', tile: 1.8, rough: 0.5, ns: 0.8 },
    parquet: { map: I + 'herringbone_parquet.jpg', nor: I + 'herringbone_parquet_nor.jpg', tile: 1.6, rough: 0.42, ns: 0.7 },
    tiles:   { map: I + 'interior_tiles.jpg', nor: I + 'interior_tiles_nor.jpg', tile: 1.4, rough: 0.22, ns: 0.6 },
    marble:  { map: I + 'marble_01.jpg', nor: I + 'marble_01_nor.jpg', tile: 2.4, rough: 0.14, ns: 0.4 },
    slate:   { map: I + 'slate_floor.jpg', nor: I + 'slate_floor_nor.jpg', tile: 1.4, rough: 0.66, ns: 1.0 },
    tatami:  { map: I + 'tatami_mat.jpg', nor: I + 'tatami_mat_nor.jpg', tile: 1.8, rough: 0.8, ns: 0.8 },
    plaster: { map: I + 'white_plaster_02.jpg', nor: I + 'white_plaster_02_nor.jpg', tile: 2.6, rough: 0.88, ns: 0.5 },
    ceiling: { map: rl('plaster-color'), nor: rl('plaster-normal'), rmap: rl('plaster-roughness'), tile: 2.2, rough: 0.9, ns: 0.35 },
    metal:   { map: rl('metal-color'), nor: rl('metal-normal'), rmap: rl('metal-roughness'), tile: 1.2, rough: 0.42, metal: 0.55, ns: 0.5 },
    concrete:{ map: rl('concrete-color'), nor: rl('concrete-normal'), rmap: rl('concrete-roughness'), tile: 2.0, rough: 0.8, ns: 0.6 },
    // painted MDF / powder-coated steel / printed board / moulded plastic: the colour is the paint, the scan gives the surface
    paint:   { nor: rl('plaster-normal'), rmap: rl('plaster-roughness'), tile: 1.5, rough: 0.48, ns: 0.18, roughK: 0.55 },
    plastic: { nor: rl('metal-normal'), tile: 0.8, rough: 0.36, ns: 0.08 },
    cloth:   { map: I + 'dirty_carpet.jpg', nor: I + 'dirty_carpet_nor.jpg', tile: 0.5, rough: 0.95, ns: 0.6 },
    card:    { map: null, nor: rl('concrete-normal'), tile: 0.6, rough: 0.86, ns: 0.25 }
  };
  const FLOOR = { books: 'wood', clothes: 'parquet', dokoto: 'tiles', eleven: 'tiles', petmart: 'tiles', pharmacy: 'tiles', police: 'tiles',
    arms: 'concrete', plaza: 'marble', street: 'marble', airport: 'marble', ramen: 'slate', sushi: 'wood', sushiya: 'wood', kaiten: 'wood', home: 'wood' };

  // corrugated kraft board with a printed carton mark, for cartons and stacked stock
  let kraftTex = null;
  function kraft() {
    if (kraftTex) return kraftTex;
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 512);
    for (let x = 0; x < 512; x += 6) { g.fillStyle = 'rgba(90,60,30,' + (0.05 + (x % 12 ? 0.02 : 0.06)) + ')'; g.fillRect(x, 0, 3, 512); }
    g.strokeStyle = 'rgba(40,30,25,.55)'; g.lineWidth = 3; g.strokeRect(150, 170, 212, 120);
    g.fillStyle = 'rgba(40,30,25,.6)'; g.font = '700 30px sans-serif'; g.textAlign = 'center'; g.fillText('KONTO', 256, 220); g.font = '500 18px sans-serif'; g.fillText('取扱注意  FRAGILE', 256, 258);
    g.font = '700 22px sans-serif'; g.fillText('↑↑', 60, 60); g.fillStyle = 'rgba(200,190,160,.75)'; g.fillRect(0, 236, 512, 40);
    noise(g, 512, 512, 0.06, 11);
    kraftTex = new T.CanvasTexture(c); kraftTex.encoding = T.sRGBEncoding; kraftTex.wrapS = kraftTex.wrapT = T.RepeatWrapping; kraftTex.repeat.set(1 / 0.6, 1 / 0.6); kraftTex.anisotropy = 4;
    return kraftTex;
  }
  const linCol = hex => new T.Color(hex).convertSRGBToLinear();
  const matCache = new Map();
  function mat(kind, hex, extra) {
    const key = kind + '|' + (hex || '') + '|' + (extra ? JSON.stringify(extra) : '') + '|' + low();
    if (matCache.has(key)) return matCache.get(key);
    const S = SETS[kind] || SETS.paint;
    const o = { roughness: S.rough, metalness: S.metal || 0, envMapIntensity: 1.0 };
    if (S.map) o.map = tex(S.map, true, S.tile);
    if (kind === 'card') o.map = kraft();
    if (S.nor) { o.normalMap = tex(S.nor, false, S.tile); o.normalScale = new T.Vector2(S.ns, S.ns); }
    if (S.rmap) { o.roughnessMap = tex(S.rmap, false, S.tile); if (S.roughK) o.roughness = S.roughK; else o.roughness = 1; }
    o.color = hex ? linCol(hex) : new T.Color(1, 1, 1);
    if (extra) Object.assign(o, extra);
    const m = new T.MeshStandardMaterial(o);
    m.userData.shopPBR = kind;
    matCache.set(key, m); return m;
  }

  // ---- geometry with UVs in metres ------------------------------------------------------------------------------------------------------
  // The rooms reuse one unit cube scaled per box, so a texture would stretch with it. Each size gets its own cube whose UVs count metres.
  const boxCache = new Map();
  function metricBox(w, h, d) {
    const key = w.toFixed(3) + ',' + h.toFixed(3) + ',' + d.toFixed(3);
    if (boxCache.has(key)) return boxCache.get(key);
    const g = new T.BoxGeometry(1, 1, 1), uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];      // +x -x +y -y +z -z
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
    uv.needsUpdate = true; boxCache.set(key, g); return g;
  }
  function metricPlane(m, w, h) {
    const g = m.geometry.clone(), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
    uv.needsUpdate = true; m.geometry = g;
  }
  function metricCyl(m) {
    const p = m.geometry.parameters || {}; const r = p.radiusTop || 0.1, h = p.height || 0.1;
    const g = m.geometry.clone(), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * h);
    uv.needsUpdate = true; m.geometry = g;
  }

  // ---- what a colour-only box is ------------------------------------------------------------------------------------------------------
  function hsl(hex) { const c = new T.Color(hex), o = {}; c.getHSL(o); return o; }
  const WOOD = /^#(c8a878|c2b5a0|886346|b79a71|d8b88a|9a7a58|8a6a48|a97c50|795943|8a7a62|a78b75|8a6a44|6a4a2e|4a3220|a98858|7a5a38|b08a58|9a7648|c9a878|d9c08a|5a4430|5c3f27|5b3b24|c9a272|b8925f|d4b080|6a4a7a)$/i;
  const CARD = /^#(c9a272|b8925f|d4b080|e8d9b8)$/i;
  function classify(hex, sz, pos, H) {
    hex = (hex || '#888888').toLowerCase();
    const big = Math.max(sz.x, sz.z), tall = sz.y;
    if (pos.y + sz.y / 2 <= 0.08 && big > 2.5) return ['floor'];
    if (pos.y - sz.y / 2 >= H - 0.2 && big > 2.5) return ['ceiling'];
    if (tall >= 2.3 && Math.min(sz.x, sz.z) <= 0.35 && big > 0.9) return ['wall', hex];
    if (CARD.test(hex)) return ['card', hex];
    if (WOOD.test(hex)) return ['wood', hex];
    const c = hsl(hex);
    if (c.l < 0.13 && tall > 1.6 && Math.max(sz.x, sz.z) > 1.2 && Math.min(sz.x, sz.z) < 0.5) return ['glass', hex];   // dark openings and screens: smoked glass
    if (c.s < 0.12 && c.l < 0.5) return ['metal', hex];           // dark greys: steel, frames, fixtures
    if (c.s < 0.12) return ['paint', hex];                         // whites and light greys: painted boards
    return ['paint', hex];                                         // colours: painted trims, printed packaging
  }

  // ---- decor with no real counterpart ---------------------------------------------------------------------------------------------------
  // Each IN_PROP kind either becomes a scanned prop, stays (printed signage, cartons and the like are boxes in life too, and get real
  // materials), or is dropped. konto.html asks propFor() before it builds one.
  const SWAP = {
    plant:   [{ id: 'potted_plant_01', h: 1.3 }, { id: 'potted_plant_02', h: 0.95 }],
    bench:   [{ id: 'sofa_03', w: 1.7 }],
    magrack: [{ id: 'wooden_bookshelf_worn', w: 1.3, books: [0.108, 0.392, 0.672, 0.96, 1.277, 1.663], src: 1.374, gap: 0.27 }],
    foldtable: [{ id: 'dining_table', w: 1.5, top: 'book_encyclopedia_set_01' }],
    cattree: [{ id: 'drawer_cabinet', h: 1.2 }],
    kiosk:   [{ id: 'modern_wooden_cabinet', w: 1.5, top: 'gaming_console' }],
    tvboxes: [{ id: 'steel_frame_shelves_03', w: 1.4, top: 'television_02' }]
  };
  const DROP = new Set(['basket', 'spinner', 'rounder', 'umbrella', 'maneki', 'dogbed', 'ladder', 'reel', 'paint', 'toolbox', 'bags']);
  function propFor(kind, n) {
    if (DROP.has(kind)) return { drop: true };
    const s = SWAP[kind]; if (!s) return null;
    return s[(n || 0) % s.length];
  }
  function placeSwap(g, sw, put) {
    put(g, sw.id, 0, 0, 0, 0, sw.h ? { h: sw.h } : { w: sw.w });
    if (sw.books) { const k = sw.w / sw.src; sw.books.forEach((y, i) => { const row = bookRow(1.18 * k, 977 + i * 131 + (g.id || 0), sw.gap * k - 0.01); row.position.set(0, y * k, 0.2); g.add(row); }); }
    if (sw.top) {
      const y = sw.id === 'dining_table' ? 0.77 : sw.id === 'modern_wooden_cabinet' ? 0.68 : sw.id === 'steel_frame_shelves_03' ? 1.0 : 0.8;
      put(g, sw.top, -0.25, y, 0, 0.2, sw.top === 'television_02' ? { h: 0.42 } : sw.top === 'gaming_console' ? { w: 0.33 } : { w: 0.55 });
      if (sw.top === 'book_encyclopedia_set_01') put(g, 'standing_picture_frame_01', 0.45, y, 0.1, -0.4, { h: 0.25 });
    }
  }

  // ---- books -----------------------------------------------------------------------------------------------------------------------------
  const CLOTH = ['#5a1f22', '#1f3049', '#24402f', '#8a6a2a', '#2b2b30', '#e4dccb', '#6b2f45', '#33514f', '#7a3b1f', '#43464d', '#b7a27a', '#1e2a3a'];
  const TITLES = ['海辺の町', 'The Quiet Office', '夜の電車', 'Salary', '東京物語', 'A Year of Rain', '仕事の哲学', 'Komorebi', 'Night Shift', '月と煙草',
    'The Long Commute', '静かな部屋', 'Small Hours', '雪国', 'Lanterns', '珈琲の時間', 'Paper Cranes', '働く人', 'Kanda Nights', '風の歌'];
  const AUTH = ['Haruki Mori', 'Aoi Sato', 'K. Tanabe', 'Yuko Ishida', 'Ren Fujita', 'M. Okada', 'Saki Ueno', 'Jun Kurosawa'];
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function noise(g, w, h, a, seed) {
    const id = g.getImageData(0, 0, w, h), d = id.data; let s = seed || 1;
    for (let i = 0; i < d.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; const n = ((s >>> 24) - 128) * a; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(id, 0, 0);
  }
  let spineAtlas = null, pageTex = null, pageMat = null;
  const SPINES = 24;
  function spines() {
    if (spineAtlas) return spineAtlas;
    const W = 48, H = 512, c = document.createElement('canvas'); c.width = W * SPINES; c.height = H; const g = c.getContext('2d');
    for (let i = 0; i < SPINES; i++) {
      const x = i * W, col = CLOTH[i % CLOTH.length], light = hsl(col).l > 0.6;
      g.fillStyle = col; g.fillRect(x, 0, W, H);
      const gr = g.createLinearGradient(x, 0, x + W, 0); gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(0.22, 'rgba(255,255,255,.07)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.4)');
      g.fillStyle = gr; g.fillRect(x, 0, W, H);
      const ink = light ? '#2a2420' : (i % 3 === 0 ? '#d8b56a' : '#efe8d8');
      g.fillStyle = ink; g.globalAlpha = 0.85;
      if (i % 2) { g.fillRect(x + 4, 22, W - 8, 2); g.fillRect(x + 4, 28, W - 8, 1); g.fillRect(x + 4, H - 30, W - 8, 1); g.fillRect(x + 4, H - 24, W - 8, 2); }
      else { g.fillRect(x, 40, W, 26); g.fillStyle = col; g.fillRect(x, 44, W, 18); g.fillStyle = ink; }
      g.globalAlpha = 1; g.save(); g.translate(x + W / 2, 90); g.rotate(Math.PI / 2);
      g.font = (i % 4 === 1 ? 'italic 600 ' : '600 ') + '21px Georgia, "Times New Roman", serif'; g.textBaseline = 'middle'; g.fillStyle = ink;
      g.fillText(TITLES[i % TITLES.length], 0, 0, 300); g.font = '500 13px Georgia, serif'; g.globalAlpha = 0.8; g.fillText(AUTH[i % AUTH.length], 310, 0, 90); g.restore();
      g.globalAlpha = 0.9; g.fillStyle = ink; g.beginPath(); g.arc(x + W / 2, H - 52, 7, 0, 7); g.fill(); g.globalAlpha = 1;
    }
    noise(g, c.width, c.height, 0.09, 7);
    spineAtlas = new T.CanvasTexture(c); spineAtlas.encoding = T.sRGBEncoding; spineAtlas.anisotropy = low() ? 2 : 8;
    return spineAtlas;
  }
  function pages() {
    if (pageMat) return pageMat;
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#e9e1cc'; g.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 2) { g.fillStyle = 'rgba(120,100,70,' + (0.05 + ((y * 37) % 11) / 90) + ')'; g.fillRect(0, y, 64, 1); }
    noise(g, 64, 256, 0.05, 3);
    pageTex = new T.CanvasTexture(c); pageTex.encoding = T.sRGBEncoding;
    pageMat = new T.MeshStandardMaterial({ map: pageTex, roughness: 0.92, normalMap: tex(rl('plaster-normal'), false, 0.3), normalScale: new T.Vector2(0.2, 0.2) });
    return pageMat;
  }
  const coverCache = new Map();
  function cover(it) {
    const key = it.id || it.name || 'book';
    if (coverCache.has(key)) return coverCache.get(key);
    const h = hash(key), col = CLOTH[h % CLOTH.length], c = document.createElement('canvas'); c.width = 384; c.height = 560; const g = c.getContext('2d');
    g.fillStyle = col; g.fillRect(0, 0, 384, 560);
    // a jacket: a painted band of colour and light, the title in a serif, the publisher's mark
    const a = (h >>> 4) % 4, gr = g.createLinearGradient(0, 120, 384, 420);
    gr.addColorStop(0, ['#d9b48a', '#9cb7c4', '#c9c2a2', '#b08aa0'][a]); gr.addColorStop(1, ['#6a3a2a', '#24384a', '#3a4a32', '#3a2a40'][a]);
    g.fillStyle = gr; g.fillRect(28, 150, 328, 250);
    g.globalAlpha = 0.5; g.fillStyle = '#f6efe0';
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(80 + ((h >>> (i * 3)) % 230), 200 + ((h >>> (i * 2)) % 160), 14 + ((h >>> i) % 40), 0, 7); g.fill(); }
    g.globalAlpha = 1; g.fillStyle = hsl(col).l > 0.6 ? '#221c18' : '#f3ecdc'; g.textAlign = 'center';
    g.font = '600 38px Georgia, "Times New Roman", serif'; g.fillText(it.name || TITLES[h % TITLES.length], 192, 84, 340);
    g.font = 'italic 22px Georgia, serif'; g.fillText(AUTH[h % AUTH.length], 192, 118, 340);
    g.font = '600 14px Georgia, serif'; g.fillText('KOMOREBI PRESS', 192, 520);
    noise(g, 384, 560, 0.07, h);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = low() ? 2 : 8;
    const m = new T.MeshStandardMaterial({ map: t, roughness: 0.62, normalMap: tex(rl('plaster-normal'), false, 0.25), normalScale: new T.Vector2(0.15, 0.15) });
    coverCache.set(key, m); return m;
  }
  // One merged row of spine-out books: per-face UVs pick a spine from the atlas, the page block shows on top and front edge.
  function bookRow(len, seed, maxH) {
    const pos = [], nor = [], uv = [], idx = [], groups = []; let x = -len / 2, s = seed >>> 0, v = 0;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const quads = { spine: [], page: [] };
    while (x < len / 2 - 0.03) {
      const t = 0.018 + rnd() * 0.03, hgt = Math.min(maxH || 1, 0.19 + rnd() * 0.09), d = 0.13 + rnd() * 0.05, lean = (rnd() < 0.06) ? 0.12 : 0;
      const sp = Math.floor(rnd() * SPINES), u0 = sp / SPINES, u1 = (sp + 1) / SPINES;
      const x0 = x, x1 = x + t, y0 = 0, y1 = hgt, z1 = 0.0, z0 = -d;
      const P = (px, py, pz) => [px + py * lean, py, pz];
      const face = (a, b, c2, dd, n, uvs, kind) => { const base = pos.length / 3; [a, b, c2, dd].forEach(p => pos.push(...p)); for (let k = 0; k < 4; k++) nor.push(...n); uv.push(...uvs); quads[kind].push([base, base + 1, base + 2, base, base + 2, base + 3]); };
      face(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), [0, 0, 1], [u0, 0.02, u1, 0.02, u1, 0.98, u0, 0.98], 'spine');      // spine faces out
      face(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), [1, 0, 0], [u1, 0.02, u1, 0.02, u1, 0.98, u1, 0.98], 'spine');   // board edge
      face(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), [-1, 0, 0], [u0, 0.02, u0, 0.02, u0, 0.98, u0, 0.98], 'spine');
      face(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], 'page');                    // page tops
      x += t + (rnd() < 0.08 ? 0.03 : 0.002); v++;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    const sI = [].concat(...quads.spine), pI = [].concat(...quads.page);
    g.setIndex(sI.concat(pI)); g.addGroup(0, sI.length, 0); g.addGroup(sI.length, pI.length, 1);
    const spineMat = matCache.get('spine') || (matCache.set('spine', new T.MeshStandardMaterial({ map: spines(), roughness: 0.78, normalMap: tex(I + 'dirty_carpet_nor.jpg', false, 0.05), normalScale: new T.Vector2(0.25, 0.25) })), matCache.get('spine'));
    const m = new T.Mesh(g, [spineMat, pages()]); m.userData.shopBooks = true; m.castShadow = false; m.receiveShadow = true;
    return m;
  }
  // A stocked title: a row of spines with the title itself standing face-out in the middle on a little stand.
  function book(g, it) {
    const row = bookRow(0.56, hash(it.id || it.name || 'b')); row.position.set(0, 0, 0.05); g.add(row);
    const c = cover(it), w = 0.15, h = 0.22, t = 0.025;
    const b = new T.Mesh(metricBox(w, h, t), [pages(), pages(), pages(), pages(), c, c]);
    b.scale.set(w, h, t); b.position.set(0, h / 2 + 0.01, 0.09); b.rotation.x = -0.12; g.add(b);
    const stand = new T.Mesh(metricBox(0.12, 0.012, 0.08), mat('metal', '#3a3d42')); stand.scale.set(0.12, 0.012, 0.08); stand.position.set(0, 0.006, 0.1); g.add(stand);
    return 0.3;
  }

  // ---- finishing a room -------------------------------------------------------------------------------------------------------------------
  const v3 = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3();
  function finish(room, root, H) {
    H = H || (room && room.H) || 3.7;
    const brand = room && room.brand;
    root.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(root.matrixWorld).invert();
    const list = []; root.traverse(o => { if (o.isMesh) list.push(o); });
    for (const m of list) {
      if (m.userData.shopDone || m.isSkinnedMesh) continue;
      const mt = m.material;
      if (!mt || Array.isArray(mt) || mt.isShaderMaterial) continue;
      // the room's own surfaces painted by interiorDecor
      const surf = m.userData.shopSurface;
      if (surf) {
        const p = m.geometry.parameters || {};
        metricPlane(m, p.width || 1, p.height || 1);
        m.material = surf === 'floor' ? mat(FLOOR[brand] || 'tiles') : surf === 'ceiling' ? mat('ceiling', '#f1efe9') : mat('plaster', wallTint(room));
        m.receiveShadow = true; m.userData.shopDone = true; state.swapped++; continue;
      }
      if (!mt.isMeshBasicMaterial) continue;
      // glow shells, light panels, the street glass and other deliberately emissive things stay as they are
      if (m.name === 'glow' || mt.side === T.BackSide || mt.transparent) continue;
      const hex = m.userData.salaryFinish || ('#' + mt.color.getHexString());
      if (/^#(ffffff|fff1d0|cfe6f2|6fe0a0)$/i.test(hex) && !mt.map) { m.userData.shopDone = true; continue; }
      if (mt.map) {
        // signs, posters, labels, product faces: printed and lit, with a soft backlight on the sign boxes
        const sign = m.geometry && m.geometry.type === 'PlaneGeometry' && m.position.y > 2.4;
        m.material = new T.MeshStandardMaterial({ map: mt.map, roughness: 0.55, metalness: 0, emissive: new T.Color(1, 1, 1), emissiveMap: mt.map, emissiveIntensity: sign ? 0.45 : 0.12 });
        m.userData.shopDone = true; state.swapped++; continue;
      }
      // a colour-only box: work out what it is and give it the real material
      m.matrixWorld.decompose(v3, q, sc); const pos = v3.clone().applyMatrix4(inv);
      const isBox = m.geometry && m.geometry.type === 'BoxGeometry' && m.geometry.parameters && m.geometry.parameters.width === 1;
      const sz = isBox ? new T.Vector3(Math.abs(m.scale.x), Math.abs(m.scale.y), Math.abs(m.scale.z)) : (m.geometry.computeBoundingBox(), m.geometry.boundingBox.getSize(new T.Vector3()).multiply(sc));
      const [kind, tint] = classify(hex, sz, pos, H);
      if (kind === 'floor') { m.material = mat(FLOOR[brand] || 'tiles'); }
      else if (kind === 'ceiling') m.material = mat('ceiling', '#f1efe9');
      else if (kind === 'wall') m.material = mat('plaster', wallTint(room, tint));
      else if (kind === 'wood') m.material = mat('wood', mixHex(tint, '#ffffff', 0.35));
      else if (kind === 'metal') m.material = mat('metal', mixHex(tint, '#9aa0a6', 0.12));
      else if (kind === 'glass') m.material = mat('plastic', '#0e1215', { roughness: 0.06, metalness: 0.2, envMapIntensity: 1.4 });
      else if (kind === 'card') m.material = mat('card', tint);
      else m.material = mat('paint', tint);
      if (isBox) m.geometry = metricBox(sz.x, sz.y, sz.z);
      else if (m.geometry.type === 'CylinderGeometry') metricCyl(m);
      m.receiveShadow = true; m.userData.shopDone = true; state.swapped++;
    }
    // the coloured checker squares laid over the old flat floor are part of the old look: the scanned floor replaces them
    list.forEach(m => { const s = m.scale; if (m.parent === root && m.position.y < 0.02 && s.y <= 0.021 && s.x > 1 && s.z > 1 && !m.userData.shopSurface) { m.visible = false; state.removed++; } });
    root.userData.shopAAA = true; state.finished++;
  }
  function wallTint(room, hex) {
    const th = window.SalaryRetail && room && SalaryRetail.identity ? SalaryRetail.identity(room.brand, room.key) : null;
    return mixHex(hex || (th && th.wall) || '#efece4', '#ffffff', 0.55);
  }
  function mixHex(a, b, k) { const c = new T.Color(a).lerp(new T.Color(b), k); return '#' + c.getHexString(); }

  // ---- indoor light ---------------------------------------------------------------------------------------------------------------------
  // A probe of a bright shop: white walls, a warm floor and rows of ceiling panels (after three.js's RoomEnvironment, MIT).
  function env(renderer) {
    if (state.env) return state.env;
    const s = new T.Scene(), box = new T.BoxGeometry();
    const room = new T.Mesh(box, new T.MeshStandardMaterial({ side: T.BackSide, color: 0xb9b4aa, roughness: 1 }));
    room.scale.set(16, 4, 11); room.position.set(0, 2, 0); s.add(room);
    const floor = new T.Mesh(box, new T.MeshStandardMaterial({ color: 0x6e5a45, roughness: 1 })); floor.scale.set(16, 0.05, 11); floor.position.set(0, 0.02, 0); s.add(floor);
    s.add(new T.AmbientLight(0xffffff, 0.6));
    const panel = c => new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(9) });
    for (const x of [-5, 0, 5]) for (const z of [-3, 1.5]) { const l = new T.Mesh(box, panel(0xfff1dc)); l.scale.set(2.4, 0.05, 0.5); l.position.set(x, 3.95, z); s.add(l); }
    const door = new T.Mesh(box, panel(0xdfe9f2)); door.material.color.multiplyScalar(0.25); door.scale.set(2.4, 2.4, 0.05); door.position.set(0, 1.2, 5.45); s.add(door);
    const pm = new T.PMREMGenerator(renderer); const rt = pm.fromScene(s, 0.03); pm.dispose();
    s.traverse(o => { if (o.material) o.material.dispose(); }); box.dispose();
    state.env = rt.texture; return state.env;
  }
  // The per-room light rig: sky light from the ceiling and floor bounce, a soft key from the panels, a cool fill from the door.
  function rig(root) {
    if (root.userData.shopRig) return;
    const h = new T.HemisphereLight(0xfff4e6, 0x8a7a66, 0.55); root.add(h);
    const k = new T.DirectionalLight(0xfff0dc, 0.75); k.position.set(1.5, 8, 2.5); root.add(k); root.add(k.target);
    const f = new T.DirectionalLight(0xd5e4f0, 0.18); f.position.set(-3, 2.5, 6); root.add(f); root.add(f.target);
    root.userData.shopRig = true; root.userData.propLight = true;
  }
  function swapEnv(obj, to, rec) {
    obj.traverse(o => { if (!o.material) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      if (!m || !('envMap' in m) || m.isShaderMaterial) return;
      if (m.envMap === to) return; rec.push([m, m.envMap, m.envMapIntensity]); m.envMap = to; if (m.envMapIntensity < 0.6) m.envMapIntensity = 0.9; m.needsUpdate = true; }); });
  }
  function enter(room) {
    try {
      if (typeof renderer === 'undefined' || !renderer) return;
      const e = env(renderer);
      leave(true);
      const rec = []; state.saved = { rec: rec, envWas: scene.environment };
      scene.environment = e;
      swapEnv(room.group, e, rec);
      if (typeof player !== 'undefined' && player.obj) swapEnv(player.obj, e, rec);
      if (room.clerkFig && room.clerkFig.holder) swapEnv(room.clerkFig.holder, e, rec);
      inside();
    } catch (err) { console.warn('[ShopAAA] indoor light failed:', err); }
  }
  function leave(quiet) {
    const s = state.saved; if (!s) return;
    s.rec.forEach(([m, envMap, k]) => { m.envMap = envMap; m.envMapIntensity = k; m.needsUpdate = true; });
    if (scene.environment === state.env) scene.environment = (typeof gfx !== 'undefined' && gfx.env) || s.envWas || null;
    state.saved = null;
    if (!quiet && typeof updateWorldSky === 'function') try { updateWorldSky(0, true); } catch (e) {}
  }
  // Called after every sky update while inside: no sun or sky through the ceiling, and a shop's exposure, day or night.
  function inside() {
    if (typeof sunLight !== 'undefined' && sunLight) sunLight.intensity = 0;
    if (typeof hemiLight !== 'undefined' && hemiLight) hemiLight.intensity = 0;
    if (typeof renderer !== 'undefined' && renderer) renderer.toneMappingExposure = 1.0;
    if (typeof interior !== 'undefined' && interior.light) { interior.light.intensity = 1.1; interior.light.distance = 20; interior.light.decay = 1.2; interior.light.color.setHex(0xfff2e0); }
  }

  // ---- audit: is any bare colour box still on show? -------------------------------------------------------------------------------------
  function audit(root) {
    const bad = [];
    root.traverse(o => {
      if (!o.isMesh || !o.visible) return; let v = true; for (let p = o.parent; p && p !== root; p = p.parent) if (!p.visible) { v = false; break; }
      if (!v || o.name === 'glow') return;
      const m = o.material; if (!m || Array.isArray(m)) return;
      if (m.isMeshBasicMaterial && !m.map && !m.transparent && m.side !== T.BackSide && !/^(ffffff|fff1d0|cfe6f2|6fe0a0)$/.test(m.color.getHexString())) {
        const hex = o.userData.salaryFinish || '#' + m.color.getHexString(); if (!/^#(ffffff|fff1d0|cfe6f2|6fe0a0)$/i.test(hex)) bad.push(hex);
      }
    });
    return bad;
  }

  window.ShopAAA = { finish, enter, leave, inside, rig, env, book, bookRow, propFor, placeSwap, audit, mat, metricBox, state };
})();
