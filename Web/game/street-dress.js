// Street dressing: the small things that make a Tōkonto street feel lived in (the 2026-11-20 density pass).
//
// konto.html lays the roads, the shops, the vending machines and the lamps. This file walks every kerb and doorstep of
// the city once and decides where the rest of a Japanese street goes:
//   - concrete utility poles down one side of the side streets and lanes, with the power lines slung between them and a
//     service drop across to the houses opposite (電柱 and the tangle of wires overhead)
//   - parked mamachari, in ones and twos outside the shops and in long rows with a municipal rack by the stations
//   - recycling bins in pairs beside the vending machines
//   - bollards at the corners, planters and ground transformer boxes along the avenues, a red post box now and then
//   - orange curve mirrors at the blind corners of the lanes, road signs at the ends of the streets
//   - aircon outdoor units and crates against the shop walls, doorstep gardens of pots outside the small shops
//   - the odd patch of road works: a striped barrier and a few cones
//
// Everything is drawn with the Shigoto engine's PBR props (Engine/src/world/Props.js, textures in art/props/), one
// InstancedMesh per texture slot per type, refilled in a ring round the camera (about 40 draw calls in all). The ring and
// the counts follow the graphics tier, and on integrated graphics (GPU guard on) both are smaller and the prop maps are
// 512 px, so the denser streets stay inside the Iris Xe video-memory budget.
//
// Off switch: ?dress=0 (or localStorage konto.dress = "0"). Console: shigoto.dress() / streetDress.report().
(function () {
  "use strict";
  const qs = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(""); } })();
  const off = qs.get("dress") === "0" || (() => { try { return localStorage.getItem("konto.dress") === "0"; } catch (e) { return false; } })();
  const D = window.streetDress = {
    version: "1.0", on: !off, ready: false, forWorld: null, gen: null,
    items: {}, grids: {}, wires: [], stats: {}, made: false, root: null, last: null, t: 0, counts: {}
  };
  if (off) { console.log("[Konto] street dressing off (?dress=0)"); return; }

  const TYPES = ["pole", "bicycle", "bikerack", "bin", "bollard", "planter", "signpost", "ac", "crate", "pallet", "cone", "barrier", "utilitybox", "postbox", "curvemirror", "pots"];
  // instances kept in the ring at medium; other tiers scale this
  const CAP = { pole: 64, bicycle: 110, bikerack: 10, bin: 48, bollard: 120, planter: 40, signpost: 40, ac: 90, crate: 40, pallet: 12, cone: 30, barrier: 12,
    utilitybox: 28, postbox: 10, curvemirror: 24, pots: 56 };
  // which types throw a sun shadow (the tall ones; the small ones are lost in the kerb's own shading)
  const SHADOW = { pole: true, bicycle: true, planter: true, utilitybox: true, postbox: true, bikerack: false, curvemirror: true, barrier: true };
  // how close two dressed things may stand (metres, centre to centre)
  const GAP = { pole: 1.2, bicycle: 0.5, bikerack: 1.0, bin: 0.45, bollard: 0.8, planter: 1.4, signpost: 0.8, ac: 0.7, crate: 0.6, pallet: 1.0, cone: 0.5, barrier: 1.0,
    utilitybox: 1.2, postbox: 0.9, curvemirror: 0.9, pots: 1.0 };
  const CELL = 40;
  const BIKE = [[0.62, 0.12, 0.1], [0.18, 0.28, 0.55], [0.92, 0.92, 0.9], [0.16, 0.16, 0.17], [0.55, 0.6, 0.62], [0.2, 0.42, 0.3], [0.85, 0.7, 0.25], [0.7, 0.45, 0.55]];
  const BINC = [[0.2, 0.36, 0.7], [0.25, 0.5, 0.3], [0.85, 0.85, 0.82], [0.75, 0.55, 0.15]];

  // ---- placement --------------------------------------------------------------------------------------------------
  function hash(a, b, c) { return typeof rnd === "function" ? rnd(Math.round(a * 7) | 0, Math.round(b * 7) | 0, c) : ((Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453) % 1 + 1) % 1; }
  function key(x, z) { return Math.floor(x / CELL) + "," + Math.floor(z / CELL); }

  function* plan(w) {
    const items = {}, grids = {}, occ = new Map(), wires = [];
    TYPES.forEach(t => { items[t] = []; grids[t] = new Map(); });
    let solidsAdded = 0;
    // things that must stay clear: crossing ends, shop doors, vending machines, bus stops
    const keep = new Map();
    const keepAdd = (x, z, r) => { const k = key(x, z); let l = keep.get(k); if (!l) keep.set(k, l = []); l.push([x, z, r]); };
    const kept = (x, z, r) => {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = keep.get((cx + i) + "," + (cz + j)); if (l) for (const q of l) if (Math.hypot(q[0] - x, q[1] - z) < q[2] + r) return true; }
      return false;
    };
    if (typeof xing === "object" && xing && xing.list) for (const X of xing.list) for (const e of [-1, 1]) keepAdd(X.cx + X.ux * e * (X.half + 1.0), X.cz + X.uz * e * (X.half + 1.0), 2.0);
    if (typeof shops === "object" && shops.list) for (const s of shops.list) if (s.door) keepAdd(s.door[0], s.door[1], 2.2);
    if (typeof vending === "object" && vending.list) for (const v of vending.list) keepAdd(v.at[0], v.at[1], 0.9);
    for (const c of w.cities) { const f = c.furniture; if (f && f.stops) for (const s of f.stops) keepAdd(s[0], s[2], 3.5); }
    yield;

    const occupied = (x, z, r) => {
      const cx = Math.floor(x / 8), cz = Math.floor(z / 8);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = occ.get((cx + i) + "," + (cz + j)); if (l) for (const q of l) if (Math.hypot(q[0] - x, q[1] - z) < q[2] + r) return true; }
      return false;
    };
    const ground = (x, z) => {
      if (x < 40 || z < 40 || x > WORLD_X - 40 || z > WORLD_Z - 40) return null;
      if (world.sampleLand(x, z) < 0.9 || world.bridgeY(x, z) !== null) return null;
      const y = world.surfaceY(x, z); return y < 1.2 ? null : y;
    };
    // can a thing of radius r stand here: on land, off every carriageway, out of every building, clear of the kept spots and of what is already placed
    const ok = (x, z, r, wallOk) => {
      const y = ground(x, z); if (y === null) return null;
      if (!wallOk && insideBuilding(x, z, r)) return null;
      if (typeof xingRoadAt === "function" && xingRoadAt(x, z, 0.05)) return null;
      if (kept(x, z, r) || occupied(x, z, r)) return null;
      return y;
    };
    const put = (type, x, z, yaw, y, extra) => {
      const it = Object.assign({ x, y, z, yaw }, extra || {});
      const list = items[type], i = list.length; list.push(it);
      const k = key(x, z); let l = grids[type].get(k); if (!l) grids[type].set(k, l = []); l.push(i);
      const ok8 = Math.floor(x / 8) + "," + Math.floor(z / 8); let o = occ.get(ok8); if (!o) occ.set(ok8, o = []); o.push([x, z, GAP[type] || 0.6]);
      return i;
    };
    const solid = (x, z, w2, d2, yaw, y, h) => { solids.push({ c: [x, z], size: [w2, d2], yaw: yaw * 180 / Math.PI, y, h, dress: true }); solidsAdded++; };
    // a rebuild (a new world, or the console) first takes away what the last one stood up
    for (let i = solids.length - 1; i >= 0; i--) if (solids[i].dress) solids.splice(i, 1);
    if (typeof buildSolidGrid === "function") buildSolidGrid();
    const wallBehind = (x, z, nx, nz, from, to) => { for (let d = from; d <= to; d += 0.3) if (insideBuilding(x + nx * d, z + nz * d, 0.05)) return d; return -1; };

    // stations: within 90 m of one, bicycles are three times as likely and come in racks
    const stations = [];
    for (const c of w.cities) for (const st of c.stations || []) if (st.centre) stations.push(st.centre);
    const nearStation = (x, z) => stations.some(s => Math.hypot(s[0] - x, s[1] - z) < 90);

    // a cluster of parked bicycles along a kerb or a wall: t,n the run's direction and the side's outward normal
    const bikes = (px, pz, tx, tz, nx, nz, n, ang, seed, rack) => {
      let placed = 0;
      const yaw0 = Math.atan2(nx, nz);     // a bike's length is its local z: facing out across the pavement
      for (let i = 0; i < n; i++) {
        const along = i * (rack ? 0.54 : 0.62) + (hash(px, pz, seed + i) - 0.5) * 0.08, a = yaw0 + ang + (hash(pz, px, seed + i * 3) - 0.5) * 0.18;
        const bx = px + tx * along + Math.sin(a) * 0.82, bz = pz + tz * along + Math.cos(a) * 0.82;
        const y = ok(bx, bz, 0.25); if (y === null) continue;
        put("bicycle", bx, bz, a, y, { c: BIKE[(hash(bx, bz, seed + 17) * BIKE.length) | 0] });
        placed++;
      }
      // the rack the row stands in, under the bikes' front wheels (placed after them so it does not crowd them out)
      if (rack && placed >= 4) {
        const rx = px + tx * ((n - 1) * 0.27) + nx * 1.25, rz = pz + tz * ((n - 1) * 0.27) + nz * 1.25, y = ground(rx, rz);
        if (y !== null && !insideBuilding(rx, rz, 0.1)) put("bikerack", rx, rz, Math.atan2(tx, tz) + Math.PI / 2, y);
      }
      return placed;
    };

    let work = 0;
    for (const city of w.cities) {
      // ---- the side streets and lanes ----
      for (const L of city.streetPlan || []) {
        for (const run of L.runs || []) {
          const a = L.pt(run[0]), b = L.pt(run[1]), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (len < 14) continue;
          const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len, lane = !(L.fw > 0);
          const h0 = hash(a[0], a[1], 9101);
          const kerb = lane ? L.hw - 0.3 : L.hw + 0.12 + 0.32;          // the kerb strip (or, in a lane, its edge)
          const wallOff = lane ? L.hw + 0.1 : L.hw + 0.12 + L.fw;      // roughly where the frontages stand
          // poles down one side, every 26-36 m, wired together
          const ps = h0 < 0.5 ? 1 : -1, pnx = -tz * ps, pnz = tx * ps;
          let prev = -1, prevAt = -1e9;
          for (let s = 4 + h0 * 8; s < len - 3; s += 26 + hash(a[0] + s, a[1], 9103) * 10) {
            const x = a[0] + tx * s + pnx * kerb, z = a[1] + tz * s + pnz * kerb, y = ok(x, z, 0.3);
            if (y === null) { prev = -1; continue; }
            const i = put("pole", x, z, Math.atan2(tx, tz), y);
            solid(x, z, 0.36, 0.36, 0, y, 10);
            const P = items.pole[i];
            // the service drop: across the street to the frontage opposite, if there is one
            const far = wallBehind(a[0] + tx * s, a[1] + tz * s, -pnx, -pnz, L.hw + 0.5, L.hw + (L.fw || 0) + 6);
            P.drop = far > 0 ? [a[0] + tx * s - pnx * far, y + 5.6 + hash(x, z, 9105) * 1.2, a[1] + tz * s - pnz * far] : null;
            if (prev >= 0 && s - prevAt < 48) P.prev = prev;
            prev = i; prevAt = s;
          }
          // the corners: bollards, a sign, a curve mirror at a lane's blind corner
          for (const e of [0, 1]) for (const sd of [-1, 1]) {
            const s = e ? len - 2.6 : 2.6, nx = -tz * sd, nz = tx * sd, cx = a[0] + tx * s, cz = a[1] + tz * s, hc = hash(cx + sd, cz, 9111 + e);
            if (!lane && hc < 0.45) {
              for (let k = 0; k < 3; k++) { const q = s + (e ? -1 : 1) * k * 1.1, x = a[0] + tx * q + nx * (L.hw + 0.3), z = a[1] + tz * q + nz * (L.hw + 0.3), y = ok(x, z, 0.12); if (y !== null) put("bollard", x, z, 0, y); }
            } else if (hc < 0.62) {
              const x = cx + nx * kerb, z = cz + nz * kerb, y = ok(x, z, 0.1); if (y !== null) put("signpost", x, z, Math.atan2(tx, tz) + (e ? 0 : Math.PI), y);
            } else if (hc < (lane ? 0.9 : 0.74)) {
              const x = cx + nx * (kerb + (lane ? -0.05 : 0.1)), z = cz + nz * (kerb + (lane ? -0.05 : 0.1)), y = ok(x, z, 0.15);
              if (y !== null) { put("curvemirror", x, z, Math.atan2(tx, tz) + (e ? Math.PI : 0) + sd * 0.5, y); solid(x, z, 0.15, 0.15, 0, y, 3.4); }
            }
          }
          // along each side: bicycles, doorstep pots, transformer boxes, post boxes, the odd road works
          for (const sd of [-1, 1]) {
            const nx = -tz * sd, nz = tx * sd;
            for (let s = 6 + hash(a[0], a[1], 9121 + sd) * 8; s < len - 6; s += 7 + hash(a[0] + s, a[1] + sd, 9123) * 12) {
              const cx = a[0] + tx * s, cz = a[1] + tz * s, r = hash(cx, cz, 9125 + sd);
              const st = nearStation(cx, cz), pB = lane ? 0.2 : st ? 0.62 : 0.3;
              if (r < pB) {
                // on a footway the bikes stand on the kerb strip, angled; in a lane, along the wall
                const n = st ? 4 + ((hash(cz, cx, 9127) * 6) | 0) : 1 + ((hash(cz, cx, 9127) * 3) | 0);
                const base = lane ? wallOff - 0.35 : kerb - 0.15;
                bikes(cx + nx * base, cz + nz * base, tx, tz, lane ? -nx : nx, lane ? -nz : nz, n, lane ? 1.25 : 1.05, (cx * 13 + cz) | 0, st && n >= 5);
              } else if (r < pB + 0.16) {
                // pots at a doorstep: against the frontage
                const d = wallBehind(cx, cz, nx, nz, Math.max(0.8, wallOff - 1.2), wallOff + 2.5);
                if (d > 0) { const x = cx + nx * (d - 0.32), z = cz + nz * (d - 0.32), y = ok(x, z, 0.25, true); if (y !== null && !insideBuilding(x, z, 0.02)) put("pots", x, z, Math.atan2(-nx, -nz) + (hash(x, z, 9129) - 0.5) * 0.2, y); }
              } else if (r < pB + 0.24) {
                // an aircon outdoor unit on the pavement against the wall (two stacked on a frame, sometimes)
                const d = wallBehind(cx, cz, nx, nz, Math.max(0.8, wallOff - 1.2), wallOff + 2.5);
                if (d > 0) {
                  const x = cx + nx * (d - 0.2), z = cz + nz * (d - 0.2), y = ok(x, z, 0.2, true);
                  if (y !== null && !insideBuilding(x, z, 0.02)) { const yw = Math.atan2(-nx, -nz); put("ac", x, z, yw, y); if (hash(x, z, 9131) < 0.35) put("ac", x, z, yw, y + 0.62); solid(x, z, 0.8, 0.3, yw, y, 0.6); }
                }
              } else if (r < pB + 0.30 && !lane) {
                const x = cx + nx * (kerb + 0.15), z = cz + nz * (kerb + 0.15), y = ok(x, z, 0.6);
                if (y !== null) { const yw = Math.atan2(tx, tz) + Math.PI / 2 * sd; put("utilitybox", x, z, Math.atan2(-nx, -nz) + Math.PI, y); solid(x, z, 1.1, 0.55, yw, y, 1.4); }
              } else if (r < pB + 0.32) {
                const x = cx + nx * (kerb + 0.05), z = cz + nz * (kerb + 0.05), y = ok(x, z, 0.3);
                if (y !== null) { put("postbox", x, z, Math.atan2(nx, nz), y); solid(x, z, 0.5, 0.45, 0, y, 1.35); }
              } else if (r < pB + 0.335 && !lane) {
                // road works on the footway: a barrier along the kerb and cones round it
                const x = cx + nx * (kerb + 0.3), z = cz + nz * (kerb + 0.3), y = ok(x, z, 0.7);
                if (y !== null) {
                  put("barrier", x, z, Math.atan2(tx, tz) + Math.PI / 2, y);
                  for (const k of [-1.2, 1.2]) { const qx = x + tx * k, qz = z + tz * k, qy = ok(qx, qz, 0.2); if (qy !== null) put("cone", qx, qz, hash(qx, qz, 1) * 6, qy); }
                  const px = x + tx * 2.2 + nx * 0.4, pz = z + tz * 2.2 + nz * 0.4, py = ok(px, pz, 0.6); if (py !== null) put("pallet", px, pz, Math.atan2(tx, tz), py);
                }
              }
            }
          }
          if (++work % 30 === 0) yield;
        }
      }
      // ---- the avenues: planters, transformer boxes, bollards, bikes by the stations ----
      for (const road of city.roads) {
        if (!road.pts || road.elevated || road.dead || road.cls !== "arterial") continue;
        const hw = road.halfWidth || 10, kerb = hw + 0.5;
        let carry = 10 + hash(road.pts[0][0], road.pts[0][2], 9201) * 20;
        for (let i = 1; i < road.pts.length; i++) {
          const A = road.pts[i - 1], Bp = road.pts[i], len = Math.hypot(Bp[0] - A[0], Bp[2] - A[2]); if (len < 0.01) continue;
          const tx = (Bp[0] - A[0]) / len, tz = (Bp[2] - A[2]) / len;
          while (carry <= len) {
            const cx = A[0] + tx * carry, cz = A[2] + tz * carry;
            for (const sd of [-1, 1]) {
              const nx = -tz * sd, nz = tx * sd, r = hash(cx + sd * 3, cz, 9203), st = nearStation(cx, cz);
              const x = cx + nx * kerb, z = cz + nz * kerb;
              if (st && r < 0.55) {
                bikes(cx + nx * (hw + 0.35), cz + nz * (hw + 0.35), tx, tz, nx, nz, 6 + ((r * 20) | 0) % 6, 0, (cx + cz * 7) | 0, true);
              } else if (r < 0.42) {
                const y = ok(x, z, 0.9); if (y !== null) { const yw = Math.atan2(tx, tz) + Math.PI / 2; put("planter", x + nx * 0.1, z + nz * 0.1, yw, y); solid(x + nx * 0.1, z + nz * 0.1, 1.6, 0.6, yw, y, 0.6); }
              } else if (r < 0.52) {
                const y = ok(x, z, 0.6); if (y !== null) { put("utilitybox", x, z, Math.atan2(-nx, -nz) + Math.PI, y); solid(x, z, 1.1, 0.55, Math.atan2(tx, tz) + Math.PI / 2, y, 1.4); }
              } else if (r < 0.66) {
                for (let k = 0; k < 4; k++) { const qx = cx + tx * k * 1.4 + nx * (hw + 0.3), qz = cz + tz * k * 1.4 + nz * (hw + 0.3), y = ok(qx, qz, 0.12); if (y !== null) put("bollard", qx, qz, 0, y); }
              } else if (r < 0.72) {
                const y = ok(x, z, 0.2); if (y !== null) put("signpost", x, z, Math.atan2(tx, tz) + (sd > 0 ? 0 : Math.PI), y);
              } else if (r < 0.8) {
                bikes(cx + nx * (hw + 0.35), cz + nz * (hw + 0.35), tx, tz, nx, nz, 1 + ((r * 31) | 0) % 3, 0.35, (cx * 3 + cz) | 0, false);
              }
            }
            carry += 16 + hash(cx, cz, 9207) * 22;
          }
          carry -= len;
        }
        if (++work % 4 === 0) yield;
      }
    }
    // ---- the shops: aircon units and crates at the flanks, pots by the door, bins by the vending machines ----
    if (typeof shops === "object" && shops.list) {
      let k = 0;
      for (const s of shops.list) {
        if (!s.built || s.mall || s.plaza || s.safe || !s.size) continue;
        const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw), face = s.size[1] * 0.5;
        const half = Math.min(14, s.size[0] * 0.82) * 0.5, h = hash(s.at[0], s.at[1], 9301);
        const at = (lat, out) => [s.at[0] + fx * (face + out) + rx * lat, s.at[1] + fz * (face + out) + rz * lat];
        const sd = h < 0.5 ? 1 : -1;
        // an aircon outdoor unit against the wall at one end of the frontage (two stacked on a frame, sometimes)
        for (const out of [0.22, 0.4, 0.7, 1.0, 1.4]) {
          const q = at(sd * (half - 0.55), out), y = ok(q[0], q[1], 0.3, true);
          if (y === null || insideBuilding(q[0], q[1], 0.05)) continue;
          put("ac", q[0], q[1], s.yaw, y); solid(q[0], q[1], 0.8, 0.3, s.yaw, y, 0.6);
          if (h < 0.3) put("ac", q[0], q[1], s.yaw, y + 0.62);
          break;
        }
        // stock crates at the other end, for the food shops and the convenience stores; pots for the small shops
        let q = at(-sd * (half - 0.5), 0.45); for (const out of [0.7, 1.0, 1.4]) { if (!insideBuilding(q[0], q[1], 0.05)) break; q = at(-sd * (half - 0.5), out); }
        const r2 = hash(s.at[1], s.at[0], 9303);
        if (r2 < 0.45) { const y = ok(q[0], q[1], 0.35, true); if (y !== null && !insideBuilding(q[0], q[1], 0.05)) { put("crate", q[0], q[1], s.yaw + (r2 - 0.2), y); if (r2 < 0.2) put("crate", q[0], q[1], s.yaw + 0.3, y + 0.6); } }
        else if (r2 < 0.75) { const y = ok(q[0], q[1], 0.3, true); if (y !== null && !insideBuilding(q[0], q[1], 0.05)) put("pots", q[0], q[1], s.yaw, y); }
        if (++k % 200 === 0) yield;
      }
    }
    if (typeof vending === "object" && vending.list) {
      for (const v of vending.list) {
        const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw), fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), sd = hash(v.at[0], v.at[1], 9401) < 0.5 ? 1 : -1;
        let n = 0;
        for (const lat of [0.78, 1.28]) {
          const x = v.at[0] + rx * sd * lat - fx * 0.05, z = v.at[1] + rz * sd * lat - fz * 0.05, y = ground(x, z);
          if (y === null || insideBuilding(x, z, 0.02) || occupied(x, z, 0.2) || (typeof xingRoadAt === "function" && xingRoadAt(x, z, 0.05))) break;
          put("bin", x, z, v.yaw, y, { c: BINC[(n + (hash(x, z, 9403) < 0.5 ? 0 : 2)) % BINC.length] }); n++;
        }
      }
    }
    // the wires: each pole to the one before it, and its service drop
    for (let i = 0; i < items.pole.length; i++) {
      const P = items.pole[i], pts = [];
      const loc = (q, lx, ly) => { const c = Math.cos(q.yaw), s = Math.sin(q.yaw); return [q.x + c * lx, q.y + ly, q.z - s * lx]; };
      if (P.prev !== undefined) {
        const Q = items.pole[P.prev];
        for (const [lx, ly] of [[-0.8, 9.38], [-0.4, 9.38], [0.4, 9.38], [0.8, 9.38], [-0.55, 8.48], [0.55, 8.48], [0.2, 5.4], [-0.2, 4.9]]) pts.push([loc(P, lx, ly), loc(Q, lx, ly), ly < 6 ? 0.55 : 0.32]);
      }
      if (P.drop) pts.push([loc(P, 0, 7.6), P.drop, 0.4]);
      P.wires = pts;
    }
    D.items = items; D.grids = grids;
    if (solidsAdded && typeof buildSolidGrid === "function") buildSolidGrid();
    const st = {}; TYPES.forEach(t => { st[t] = items[t].length; }); st.solids = solidsAdded;
    D.stats = st;
    D.ready = true; D.forWorld = w;
    console.log("[Konto] street dressing: " + TYPES.map(t => items[t].length + " " + t).join(", "));
  }

  // ---- drawing: a ring of instances round the camera ---------------------------------------------------------------
  function tierScale() {
    const t = (typeof gfx === "object" && gfx && gfx.tier) || "medium";
    let s = t === "low" ? 0.6 : t === "high" ? 1.6 : t === "ultra" ? 2.2 : 1;
    let R = t === "low" ? 80 : t === "high" ? 190 : t === "ultra" ? 240 : 130;
    if (window.GPU_GUARD && GPU_GUARD.on) { s = Math.min(s, 0.85); R = Math.min(R, 115); }
    return { s, R, tier: t };
  }
  function make() {
    const B = window.shigoto && shigoto.engine && shigoto.engine.streamer && shigoto.engine.streamer.builder;
    if (!B || !B.instanceProps) return false;
    const T = tierScale(), root = new THREE.Group(); root.name = "street dressing";
    const igpu = !!(window.GPU_GUARD && GPU_GUARD.on);
    D.layers = {};
    for (const type of TYPES) {
      const cap = Math.max(4, Math.round(CAP[type] * T.s));
      const dummy = []; for (let i = 0; i < cap; i++) dummy.push({ x: 0, y: -9999, z: 0, yaw: 0, colour: [1, 1, 1] });
      let g;
      try { g = B.instanceProps(type, dummy); } catch (e) { console.warn("[Konto] street dressing: no " + type, e); continue; }
      const shadow = !!SHADOW[type] && !(igpu && (type === "bicycle" || type === "planter"));
      g.children.forEach(m => { m.count = 0; m.castShadow = shadow && (typeof gfx !== "object" || gfx.tier !== "low"); m.receiveShadow = true; m.userData.dress = type; });
      root.add(g);
      D.layers[type] = { g, cap, meshes: g.children };
    }
    // the wires: one line set for the whole ring
    const WCAP = Math.round(CAP.pole * T.s) * 10 * 8;
    const pos = new Float32Array(WCAP * 2 * 3), geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setDrawRange(0, 0);
    const wm = new THREE.LineBasicMaterial({ color: 0x15161a, transparent: true, opacity: 0.9 });
    const lines = new THREE.LineSegments(geo, wm); lines.frustumCulled = false; lines.name = "power lines"; lines.userData.rainSkip = true;
    root.add(lines);
    D.wireMesh = { lines, pos, cap: WCAP };
    scene.add(root); D.root = root; D.made = true; D.scale = T;
    D.last = null;
    return true;
  }
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), p4 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c4 = new THREE.Color();
  function refill(cx, cz) {
    const R = D.scale.R, r0 = Math.floor((cx - R) / CELL), r1 = Math.floor((cx + R) / CELL), s0 = Math.floor((cz - R) / CELL), s1 = Math.floor((cz + R) / CELL);
    const poles = [];
    for (const type of TYPES) {
      const Lr = D.layers[type]; if (!Lr) continue;
      const list = D.items[type], grid = D.grids[type], pick = [];
      for (let i = r0; i <= r1; i++) for (let j = s0; j <= s1; j++) {
        const l = grid.get(i + "," + j); if (!l) continue;
        for (const k of l) { const it = list[k], d = (it.x - cx) * (it.x - cx) + (it.z - cz) * (it.z - cz); if (d < R * R) pick.push([d, it]); }
      }
      if (pick.length > Lr.cap) { pick.sort((p, q) => p[0] - q[0]); pick.length = Lr.cap; }
      for (const m of Lr.meshes) {
        for (let i = 0; i < pick.length; i++) {
          const it = pick[i][1];
          e4.set(0, it.yaw || 0, 0); q4.setFromEuler(e4); p4.set(it.x, it.y, it.z); m4.compose(p4, q4, one); m.setMatrixAt(i, m4);
          if (m.instanceColor) { const k = it.c || [1, 1, 1]; c4.setRGB(Math.pow(k[0], 2.2), Math.pow(k[1], 2.2), Math.pow(k[2], 2.2)); m.setColorAt(i, c4); }
        }
        m.count = pick.length; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
      D.counts[type] = pick.length;
      if (type === "pole") for (const p of pick) poles.push(p[1]);
    }
    // the wires of the poles in the ring, each a sagging chain of 8 links
    const W = D.wireMesh; let n = 0;
    const SEG = 8;
    for (const P of poles) for (const w of P.wires || []) {
      if ((n + SEG) * 6 > W.pos.length) break;
      const a = w[0], b = w[1], sag = w[2] * Math.min(1.6, Math.hypot(b[0] - a[0], b[2] - a[2]) / 28);
      for (let k = 0; k < SEG; k++) {
        for (const kk of [k, k + 1]) {
          const t = kk / SEG, o = n * 6 + (kk - k) * 3;
          W.pos[o] = a[0] + (b[0] - a[0]) * t; W.pos[o + 1] = a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t); W.pos[o + 2] = a[2] + (b[2] - a[2]) * t;
        }
        n++;
      }
    }
    W.lines.geometry.setDrawRange(0, n * 2); W.lines.geometry.attributes.position.needsUpdate = true;
    D.counts.wires = n;
  }
  function tick(dt) {
    if (!D.ready) return;
    if (!D.made) { D.t -= dt; if (D.t > 0) return; D.t = 1; if (!make()) return; }
    const T = tierScale();
    if (D.scale && (T.R !== D.scale.R || T.s !== D.scale.s)) { scene.remove(D.root); D.made = false; D.t = 0; return; }     // tier changed: rebuild the layers
    if (D.root.parent !== scene) scene.add(D.root);
    const cam = camera.position, inside = (typeof interior === "object" && interior && interior.active);
    D.root.visible = !inside;
    if (inside) return;
    D.t -= dt;
    if (D.t > 0 && D.last && Math.hypot(cam.x - D.last[0], cam.z - D.last[1]) < 10) return;
    D.t = 0.5; D.last = [cam.x, cam.z];
    refill(cam.x, cam.z);
  }
  function step(budgetMs) {
    if (!D.gen) return;
    const t0 = performance.now();
    for (;;) { let r; try { r = D.gen.next(); } catch (e) { console.warn("[Konto] street dressing failed:", e); D.gen = null; return; } if (r.done) { D.gen = null; return; } if (performance.now() - t0 > budgetMs) return; }
  }
  D.build = function (w) { D.ready = false; D.made = false; if (D.root && D.root.parent) D.root.parent.remove(D.root); D.gen = plan(w || world); };
  D.report = () => ({ version: D.version, ready: D.ready, placed: D.stats, inRing: D.counts, ring: D.scale });
  D.refill = () => { D.last = null; D.t = 0; };

  // built behind the loading screen when the persistence engine runs, otherwise a few milliseconds a frame in play
  const tickOrig = window.tick;
  if (typeof tickOrig === "function") window.tick = function (dt) {
    const r = tickOrig.apply(this, arguments);
    try {
      if (typeof world !== "undefined" && world && world.cities && (D.forWorld !== world) && !D.gen && player && player.placed) D.build(world);
      if (D.gen) step(4);
      tick(dt || 0.016);
    } catch (e) { console.warn("[Konto] street dressing:", e); }
    return r;
  };
  (window.PERSIST_EXTRA = window.PERSIST_EXTRA || []).push(function (P, facts) {
    P.stage("dressing", 0.3, async ctx => {
      if (D.ready && D.forWorld === world) return { cached: true };
      D.build(world);
      let t0 = performance.now();
      while (D.gen) { step(12); if (D.gen) { await ctx.breathe(); t0 = performance.now(); } }
      facts.dressing = D.stats;
      return D.stats;
    }, { label: "Parking the bicycles and stringing the power lines" });
  });
  if (window.shigoto && typeof shigoto === "object") shigoto.dress = () => D.report();
  else window.addEventListener("load", () => { if (window.shigoto) shigoto.dress = () => D.report(); });
  console.log("[Konto] street dressing " + D.version);
})();
