// The watchmaker and the glassblower: draws every watch in luxury-data.js from its `look`, running, and every fragrance bottle.
//
//   LuxWatch.draw(g, watch, cx, cy, R, time, opts)   the watch face-on, R = case radius in pixels, strap running up and down
//       time = { h, m, s, date, dow }  (s may be fractional; mechanical watches sweep, quartz ones tick)
//       opts = { strap: length in R each way (default 2.6), glare: false to leave the crystal's reflection off }
//   LuxWatch.wrist(g, W, H, k, watch|null, time, opts)   Seiko's left wrist raised into the picture (k 0..1), the watch on it
//       opts = { sleeve: "suit" | "shirt" | "bare", sleeveC, cufflinks: null | "silver" | "gold", ring: bool }
//   LuxWatch.bottle(g, fragrance, cx, cy, h)          a bottle of it, h pixels tall
//
// The parts that do not move (strap, case, bezel, dial, indices) are painted once per watch and size and kept; only hands move.
(function () {
  "use strict";
  const TAU = Math.PI * 2, PI = Math.PI;
  const METAL = {
    steel: ["#f6f8fa", "#cfd4da", "#8d949d", "#585e66"], gold: ["#fff4c8", "#eccb6a", "#b98a2c", "#7a5a18"], rose: ["#ffe6d6", "#e9b193", "#b3745a", "#7a4a38"],
    titanium: ["#d6d8da", "#a3a7ab", "#6f7377", "#45484b"], black: ["#63666b", "#2c2e32", "#141517", "#050506"], resin: ["#44464b", "#1e1f22", "#0d0d0f", "#000000"],
    carbon: ["#5a5c60", "#2a2b2e", "#17181a", "#08080a"]
  };
  const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const ROMAN = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
  const SERIF = "Georgia, 'Times New Roman', serif", SANS = "'Konto Sans', 'Helvetica Neue', Arial, sans-serif";
  const cache = new Map();

  function mix(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - k) + ((pb >> 16) & 255) * k), g = Math.round(((pa >> 8) & 255) * (1 - k) + ((pb >> 8) & 255) * k), bl = Math.round((pa & 255) * (1 - k) + (pb & 255) * k);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  const lum = c => { const p = parseInt(c.slice(1), 16); return (((p >> 16) & 255) * 0.299 + ((p >> 8) & 255) * 0.587 + (p & 255) * 0.114) / 255; };
  function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function metalLin(g, x0, y0, x1, y1, m) {
    const c = METAL[m] || METAL.steel, gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, c[0]); gr.addColorStop(0.28, c[1]); gr.addColorStop(0.62, c[2]); gr.addColorStop(0.85, c[1]); gr.addColorStop(1, c[3]);
    return gr;
  }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function poly(g, r, n, rot, round) {
    const pts = []; for (let i = 0; i < n; i++) { const a = rot + i / n * TAU; pts.push([Math.sin(a) * r, -Math.cos(a) * r]); }
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n], o = pts[(i + n - 1) % n];
      const ax = p[0] + (o[0] - p[0]) * round, ay = p[1] + (o[1] - p[1]) * round, bx = p[0] + (q[0] - p[0]) * round, by = p[1] + (q[1] - p[1]) * round;
      if (i === 0) g.moveTo(ax, ay); else g.lineTo(ax, ay);
      g.quadraticCurveTo(p[0], p[1], bx, by);
    }
    g.closePath();
  }
  function barrel(g, hw, hh) {
    g.beginPath(); g.moveTo(-hw * 0.74, -hh);
    g.quadraticCurveTo(0, -hh * 1.07, hw * 0.74, -hh);
    g.bezierCurveTo(hw * 1.12, -hh * 0.72, hw * 1.12, hh * 0.72, hw * 0.74, hh);
    g.quadraticCurveTo(0, hh * 1.07, -hw * 0.74, hh);
    g.bezierCurveTo(-hw * 1.12, hh * 0.72, -hw * 1.12, -hh * 0.72, -hw * 0.74, -hh);
    g.closePath();
  }
  const at = (a, r) => [Math.sin(a) * r, -Math.cos(a) * r];

  // ---- the shape of each case: the paths, and how far the dial reaches in each direction -----------------------------------------------------
  function geom(w, R) {
    const L = w.look, s = L.shape, b = (L.bezel && L.bezel.type) || "none";
    const G = { R: R, shape: s };
    if (s === "round") {
      G.rd = R * ({ thin: 0.9, smooth: 0.86, dive: 0.74, gmt: 0.74, tachy: 0.75, fluted: 0.79, diamond: 0.77 }[b] || 0.86) - (L.bezel && L.bezel.wide ? R * 0.05 : 0);
      G.casePath = g => { g.beginPath(); g.arc(0, 0, R, 0, TAU); };
      G.dialPath = g => { g.beginPath(); g.arc(0, 0, G.rd, 0, TAU); };
      G.ext = () => G.rd; G.lug = R * 0.62;
    } else if (s === "octagon") {
      G.rd = R * 0.72;
      G.casePath = g => poly(g, R * 1.04, 8, PI / 8, 0.16);
      G.dialPath = g => { g.beginPath(); g.arc(0, 0, G.rd, 0, TAU); };
      G.ext = () => G.rd; G.lug = R * 0.8;
    } else if (s === "porthole") {
      G.rd = R * 0.75;
      G.casePath = g => poly(g, R * 1.04, 8, PI / 8, 0.42);
      G.dialPath = g => poly(g, G.rd * 1.05, 8, PI / 8, 0.44);
      G.ext = () => G.rd * 0.96; G.lug = R * 0.8;
    } else if (s === "tank") {
      G.hw = R * 0.56; G.hh = R * 0.82; G.rd = G.hw;
      G.casePath = g => rr(g, -R * 0.8, -R * 1.12, R * 1.6, R * 2.24, R * 0.16);
      G.dialPath = g => rr(g, -G.hw, -G.hh, G.hw * 2, G.hh * 2, R * 0.05);
      G.ext = a => Math.min(G.hw / Math.max(0.001, Math.abs(Math.sin(a))), G.hh / Math.max(0.001, Math.abs(Math.cos(a))));
      G.lug = R * 0.6;
    } else if (s === "tonneau") {
      G.hw = R * 0.7; G.hh = R * 0.98; G.rd = G.hw * 0.98;
      G.casePath = g => barrel(g, R * 0.9, R * 1.2);
      G.dialPath = g => barrel(g, G.hw, G.hh);
      G.ext = a => { const sx = Math.abs(Math.sin(a)) / (G.hw * 1.04), cy = Math.abs(Math.cos(a)) / G.hh; return 1 / Math.pow(Math.pow(sx, 3) + Math.pow(cy, 3), 1 / 3); };
      G.lug = R * 0.7;
    } else {   // digital
      G.hw = R * 0.92; G.hh = R * 1.0; G.rd = R * 0.6;
      G.casePath = g => rr(g, -G.hw, -G.hh, G.hw * 2, G.hh * 2, R * (L.armour ? 0.34 : 0.26));
      G.dialPath = g => rr(g, -R * 0.66, -R * 0.42, R * 1.32, R * 0.84, R * 0.06);
      G.ext = () => R * 0.5; G.lug = R * 0.66;
    }
    return G;
  }

  // ---- straps and bracelets ----------------------------------------------------------------------------------------------------------------------
  function strap(g, w, G, len) {
    const L = w.look, S = L.strap || { type: "leather", c: "#222" }, R = G.R, m = S.metal || (L.metal === "gold" || L.metal === "rose" ? L.metal : "steel");
    const y0 = (G.shape === "tank" ? 1.02 : G.shape === "tonneau" ? 1.08 : 0.86) * R, y1 = len * R, type = S.type;
    const metalStrap = ["oyster", "jubilee", "president", "integrated"].indexOf(type) >= 0;
    for (const dir of [-1, 1]) {
      g.save(); g.scale(1, dir);
      const wAt = y => { const k = Math.min(1, (y - y0) / (y1 - y0)); return type === "integrated" ? R * (0.8 - 0.22 * k) : G.lug * (1 - 0.14 * k); };
      // lugs: the horns the strap sits between (integrated bracelets grow out of the case instead)
      if (type !== "integrated" && G.shape !== "digital" && G.shape !== "tonneau") {
        g.fillStyle = metalLin(g, -R, 0, R, 0, L.metal === "carbon" ? "carbon" : L.metal);
        for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * G.lug * 0.98, R * 0.5); g.lineTo(sx * (G.lug + R * 0.2), R * 0.62); g.lineTo(sx * (G.lug + R * 0.17), y0 + R * 0.26); g.quadraticCurveTo(sx * (G.lug + R * 0.08), y0 + R * 0.34, sx * G.lug * 0.98, y0 + R * 0.3); g.closePath(); g.fill(); }
      }
      g.beginPath(); g.moveTo(-wAt(y0), y0 - R * 0.3); g.lineTo(wAt(y0), y0 - R * 0.3);
      for (let y = y0; y <= y1; y += R * 0.1) g.lineTo(wAt(y), y);
      for (let y = y1; y >= y0; y -= R * 0.1) g.lineTo(-wAt(y), y);
      g.closePath(); g.save(); g.clip();
      if (metalStrap) {
        const lh = R * (type === "jubilee" ? 0.17 : type === "integrated" ? 0.3 : 0.24), c = METAL[m], two = S.two ? METAL.gold : null;
        g.fillStyle = c[3]; g.fillRect(-R, y0 - R * 0.3, R * 2, y1 - y0 + R * 0.3);
        for (let y = y0 - R * 0.3, row = 0; y < y1; y += lh, row++) {
          const ww = wAt(Math.max(y0, y + lh / 2)), cols = type === "jubilee" ? [0.24, 0.17, 0.18, 0.17, 0.24] : type === "integrated" ? [1] : [0.28, 0.44, 0.28];
          let x = -ww;
          cols.forEach((f, ci) => {
            const cw = f * ww * 2, mid = cols.length > 1 && ci > 0 && ci < cols.length - 1, cc = mid && two ? two : c;
            const off = (type !== "integrated" && (mid ? 0 : lh / 2)) || 0, yy = y + off - (off ? lh : 0);
            for (let k = 0; k < (off ? 2 : 1); k++) {
              const ly = yy + k * lh, gr = g.createLinearGradient(0, ly, 0, ly + lh);
              const polished = mid || S.polished;
              gr.addColorStop(0, polished ? cc[0] : cc[1]); gr.addColorStop(0.45, polished ? cc[1] : cc[2]); gr.addColorStop(1, cc[3]);
              g.fillStyle = gr;
              if (type === "president") { g.beginPath(); g.ellipse(x + cw / 2, ly + lh / 2, cw / 2 - 0.6, lh / 2 + lh * 0.12, 0, 0, TAU); g.fill(); }
              else { rr(g, x + 0.6, ly + 0.6, cw - 1.2, lh - 1.2, lh * 0.18); g.fill(); }
              if (!polished) { g.globalAlpha = 0.13; g.strokeStyle = "#fff"; g.lineWidth = 0.6; for (let bx = x + 2; bx < x + cw - 1; bx += 2.4) { g.beginPath(); g.moveTo(bx, ly + 1.5); g.lineTo(bx, ly + lh - 1.5); g.stroke(); } g.globalAlpha = 1; }
            }
            x += cw;
          });
          if (type === "integrated") {      // the small polished connectors between the wide links
            g.fillStyle = c[0]; const ww2 = ww * 0.5; rr(g, -ww2, y + lh - R * 0.045, ww2 * 2, R * 0.09, R * 0.02); g.fill();
            g.fillStyle = "rgba(0,0,0,0.28)"; g.fillRect(-ww, y + lh - 0.8, ww * 2, 1.6);
          }
          if (S.rivets && row > 0 && row < 4) { g.fillStyle = c[0]; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * (ww - 2.2), y + lh / 2, R * 0.03, 0, TAU); g.fill(); } }
        }
      } else {
        const c = S.c || "#222", light = mix(c, "#ffffff", 0.16), dark = mix(c, "#000000", 0.42);
        const gr = g.createLinearGradient(-G.lug, 0, G.lug, 0); gr.addColorStop(0, dark); gr.addColorStop(0.22, c); gr.addColorStop(0.5, light); gr.addColorStop(0.78, c); gr.addColorStop(1, dark);
        g.fillStyle = gr; g.fillRect(-R, y0 - R * 0.3, R * 2, y1 - y0 + R * 0.3);
        const r = rnd(hash(w.id + type));
        if (type === "leather") {
          if (S.gloss) {   // scales, as on alligator
            g.strokeStyle = "rgba(0,0,0,0.28)"; g.lineWidth = Math.max(0.6, R * 0.012);
            for (let y = y0; y < y1; y += R * 0.21) { g.beginPath(); g.moveTo(-R, y + r() * 3); g.bezierCurveTo(-R * 0.3, y + R * 0.05, R * 0.3, y - R * 0.05, R, y + r() * 3); g.stroke(); const xm = (r() - 0.5) * R * 0.5; g.beginPath(); g.moveTo(xm, y); g.lineTo(xm + (r() - 0.5) * 4, y + R * 0.21); g.stroke(); }
            const sh = g.createLinearGradient(-G.lug, 0, G.lug, 0); sh.addColorStop(0.3, "rgba(255,255,255,0)"); sh.addColorStop(0.46, "rgba(255,255,255,0.22)"); sh.addColorStop(0.6, "rgba(255,255,255,0)"); g.fillStyle = sh; g.fillRect(-R, y0, R * 2, y1 - y0);
          } else { g.fillStyle = "rgba(0,0,0,0.1)"; for (let i = 0; i < 260; i++) g.fillRect((r() - 0.5) * R * 1.4, y0 + r() * (y1 - y0), 1, 1); }
          g.strokeStyle = S.stitch || mix(c, "#f1e3c8", 0.62); g.lineWidth = Math.max(1, R * 0.018); g.setLineDash([R * 0.055, R * 0.04]);
          for (const sx of [-1, 1]) { g.beginPath(); for (let y = y0 + R * 0.02; y <= y1; y += R * 0.1) { const xx = sx * (wAt(y) - R * 0.075); if (y === y0 + R * 0.02) g.moveTo(xx, y); else g.lineTo(xx, y); } g.stroke(); }
          g.setLineDash([]);
        } else if (type === "nato") {
          g.strokeStyle = "rgba(0,0,0,0.2)"; g.lineWidth = 1; for (let y = y0 - R * 0.3; y < y1; y += 2.2) { g.beginPath(); g.moveTo(-R, y); g.lineTo(R, y); g.stroke(); }
          g.fillStyle = mix(c, "#000000", 0.35); g.fillRect(-G.lug * 0.16, y0 - R * 0.3, G.lug * 0.32, y1);
        } else {    // rubber and resin
          g.fillStyle = "rgba(0,0,0,0.35)";
          if (S.vents) { for (let y = y0 + R * 0.2; y < y1 - R * 0.2; y += R * 0.3) for (const sx of [-1, 1]) { rr(g, sx * wAt(y) * 0.5 - R * 0.11, y, R * 0.22, R * 0.14, R * 0.05); g.fill(); } }
          else if (type === "resin") { for (let y = y0 + R * 0.12; y < y1; y += R * 0.16) g.fillRect(-R, y, R * 2, R * 0.035); if (dir > 0) for (let y = y0 + R * 0.7; y < y1; y += R * 0.3) { g.beginPath(); g.arc(0, y, R * 0.055, 0, TAU); g.fill(); } }
          else { g.fillRect(-G.lug * 0.5, y0, R * 0.03, y1); g.fillRect(G.lug * 0.5, y0, R * 0.03, y1); }
        }
      }
      g.restore();
      // the strap's own shadow where it meets the case
      const sh = g.createLinearGradient(0, y0 - R * 0.1, 0, y0 + R * 0.28); sh.addColorStop(0, "rgba(0,0,0,0.5)"); sh.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = sh; g.fillRect(-wAt(y0), y0 - R * 0.1, wAt(y0) * 2, R * 0.4);
      g.restore();
    }
  }

  // ---- the dial's surface ----------------------------------------------------------------------------------------------------------------------------
  function dialSurface(g, w, G) {
    const L = w.look, D = L.dial || { c: "#111", tex: "matte" }, R = G.R, rd = G.rd, c = D.c, tex = D.tex, r = rnd(hash(w.id + "dial"));
    const span = G.shape === "tank" || G.shape === "tonneau" ? G.hh * 1.1 : rd * 1.1;
    g.fillStyle = c; g.fillRect(-span, -span, span * 2, span * 2);
    if (tex === "sunburst") {
      if (g.createConicGradient) {
        const cg = g.createConicGradient(-PI / 2, 0, 0), a = mix(c, "#ffffff", 0.3), b = mix(c, "#000000", 0.32);
        for (let i = 0; i <= 8; i++) cg.addColorStop(i / 8, i % 2 ? b : a);
        g.fillStyle = cg; g.fillRect(-span, -span, span * 2, span * 2);
      }
      g.globalAlpha = 0.07; g.strokeStyle = "#fff"; g.lineWidth = 0.5;
      for (let i = 0; i < 240; i++) { const a = r() * TAU; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(a) * span, Math.cos(a) * span); g.stroke(); }
      g.globalAlpha = 1;
    } else if (tex === "waffle" || tex === "tapisserie") {
      const s = rd * (tex === "tapisserie" ? 0.085 : 0.07), hi = mix(c, "#ffffff", 0.2), lo = mix(c, "#000000", 0.4);
      for (let y = -span; y < span; y += s) for (let x = -span; x < span; x += s) {
        g.fillStyle = lo; g.fillRect(x, y, s, s);
        const gr = g.createLinearGradient(x, y, x + s, y + s); gr.addColorStop(0, hi); gr.addColorStop(1, c);
        g.fillStyle = gr; g.fillRect(x + s * 0.12, y + s * 0.12, s * 0.76, s * 0.76);
      }
      const v = g.createRadialGradient(0, 0, rd * 0.2, 0, 0, rd * 1.05); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.35)"); g.fillStyle = v; g.fillRect(-span, -span, span * 2, span * 2);
    } else if (tex === "grooves") {
      const s = rd * 0.105;
      for (let y = -span; y < span; y += s) { const gr = g.createLinearGradient(0, y, 0, y + s); gr.addColorStop(0, mix(c, "#ffffff", 0.22)); gr.addColorStop(0.5, c); gr.addColorStop(1, mix(c, "#000000", 0.5)); g.fillStyle = gr; g.fillRect(-span, y, span * 2, s); }
      const v = g.createLinearGradient(0, -rd, 0, rd); v.addColorStop(0, "rgba(120,170,220,0.16)"); v.addColorStop(1, "rgba(0,0,0,0.5)"); g.fillStyle = v; g.fillRect(-span, -span, span * 2, span * 2);
    } else if (tex === "wave") {
      g.lineWidth = rd * 0.035;
      for (let y = -span, i = 0; y < span; y += rd * 0.14, i++) {
        g.strokeStyle = i % 2 ? mix(c, "#ffffff", 0.2) : mix(c, "#000000", 0.3); g.beginPath();
        for (let x = -span; x <= span; x += 3) { const yy = y + Math.sin(x / rd * 5.2) * rd * 0.035; if (x === -span) g.moveTo(x, yy); else g.lineTo(x, yy); }
        g.stroke();
      }
    } else if (tex === "snow") {
      for (let i = 0; i < 2600; i++) { const x = (r() - 0.5) * span * 2, y = (r() - 0.5) * span * 2, s = 0.6 + r() * 2.4; g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.5)" : "rgba(150,165,185,0.2)"; g.beginPath(); g.ellipse(x, y, s * 1.8, s * 0.6, r() * PI, 0, TAU); g.fill(); }
    } else if (tex === "linen") {
      g.globalAlpha = 0.1; g.strokeStyle = "#000"; g.lineWidth = 0.6;
      for (let x = -span; x < span; x += 2.2) { g.beginPath(); g.moveTo(x, -span); g.lineTo(x + (r() - 0.5) * 2, span); g.stroke(); }
      for (let y = -span; y < span; y += 2.2) { g.beginPath(); g.moveTo(-span, y); g.lineTo(span, y + (r() - 0.5) * 2); g.stroke(); }
      g.globalAlpha = 1;
      if (L.worn) { g.fillStyle = "rgba(120,90,40,0.1)"; for (let i = 0; i < 22; i++) { g.beginPath(); g.arc((r() - 0.5) * span * 1.6, (r() - 0.5) * span * 1.6, r() * rd * 0.1, 0, TAU); g.fill(); } }
    } else if (tex === "guilloche") {
      g.globalAlpha = 0.07; g.strokeStyle = "#8a7a56"; g.lineWidth = 0.6;
      for (let i = 0; i < 46; i++) { const a = i / 46 * TAU; g.beginPath(); g.ellipse(Math.sin(a) * rd * 0.18, Math.cos(a) * rd * 0.18, rd * 0.5, rd * 0.78, a, 0, TAU); g.stroke(); }
      g.globalAlpha = 1;
    } else if (tex === "skeleton") {
      // the movement, seen through the dial: wheels, bridges, screws
      const acc = L.accent || "#c9a45a";
      const wheel = (x, y, rad, col, teeth) => {
        g.strokeStyle = col; g.lineWidth = rad * 0.13; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.stroke();
        g.lineWidth = rad * 0.09; for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + x; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * rad, y + Math.cos(a) * rad); g.stroke(); }
        g.lineWidth = rad * 0.06; for (let i = 0; i < teeth; i++) { const a = i / teeth * TAU; g.beginPath(); g.moveTo(x + Math.sin(a) * rad, y + Math.cos(a) * rad); g.lineTo(x + Math.sin(a) * rad * 1.1, y + Math.cos(a) * rad * 1.1); g.stroke(); }
        g.fillStyle = col; g.beginPath(); g.arc(x, y, rad * 0.16, 0, TAU); g.fill();
      };
      g.fillStyle = "#0b0b0d"; g.fillRect(-span, -span, span * 2, span * 2);
      wheel(-rd * 0.3, -rd * 0.52, rd * 0.36, "#7c828a", 36); wheel(rd * 0.38, -rd * 0.2, rd * 0.3, "#b98a2c", 30); wheel(-rd * 0.12, rd * 0.5, rd * 0.42, "#6a7078", 42); wheel(rd * 0.42, rd * 0.68, rd * 0.22, "#b98a2c", 22);
      g.strokeStyle = "#3a3d42"; g.lineWidth = rd * 0.11; g.lineCap = "round";
      [[-0.9, -0.9, 0.2, 0.1], [0.9, -0.95, -0.1, 0.25], [-0.85, 1.1, 0.1, 0.2], [0.9, 1.05, 0.05, -0.1]].forEach(b => { g.beginPath(); g.moveTo(b[0] * rd, b[1] * rd); g.lineTo(b[2] * rd, b[3] * rd); g.stroke(); });
      g.lineCap = "butt"; g.fillStyle = acc;
      [[-0.55, -0.1], [0.6, 0.35], [-0.5, 0.9], [0.1, -0.85]].forEach(p => { g.beginPath(); g.arc(p[0] * rd, p[1] * rd, rd * 0.035, 0, TAU); g.fill(); });
    } else {
      // matte, gloss, lacquer: a little depth from light falling across it
      const v = g.createRadialGradient(-rd * 0.3, -rd * 0.4, rd * 0.1, 0, 0, span * 1.2);
      v.addColorStop(0, tex === "gloss" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)"); v.addColorStop(1, lum(c) > 0.6 ? "rgba(90,80,60,0.14)" : "rgba(0,0,0,0.3)");
      g.fillStyle = v; g.fillRect(-span, -span, span * 2, span * 2);
      if (tex === "matte") { g.fillStyle = "rgba(255,255,255,0.035)"; for (let i = 0; i < 900; i++) g.fillRect((r() - 0.5) * span * 2, (r() - 0.5) * span * 2, 1, 1); }
    }
  }

  // ---- the hour markers --------------------------------------------------------------------------------------------------------------------------------
  function indices(g, w, G, skip) {
    const L = w.look, type = L.idx || "baton", R = G.R, dark = lum((L.dial && L.dial.c) || "#111") < 0.5;
    const lume = L.lume || (dark ? "#eef0ea" : "#f4f4f0"), ic = L.idxC || (dark ? "#dfe3e8" : "#2a2d33");
    if (type === "none") return;
    // minute track
    if (type !== "roman" && G.shape !== "tonneau") {
      g.strokeStyle = ic; g.globalAlpha = 0.75;
      for (let i = 0; i < 60; i++) { if (i % 5 === 0) continue; const a = i / 60 * TAU, e = G.ext(a), p = at(a, e * 0.975), q = at(a, e * 0.94); g.lineWidth = Math.max(0.6, R * 0.008); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); }
      g.globalAlpha = 1;
    }
    for (let h = 0; h < 12; h++) {
      if (skip && skip.indexOf(h) >= 0) continue;
      const a = h / 12 * TAU, e = G.ext(a), q = h % 3 === 0;
      g.save();
      if (type === "roman" || type === "arabic" || type === "field" || type === "rmarabic") {
        const p = at(a, e * (type === "roman" ? 0.76 : type === "field" ? 0.72 : 0.78));
        g.fillStyle = type === "field" ? lume : ic; g.textAlign = "center"; g.textBaseline = "middle";
        if (type === "roman") {
          g.translate(p[0], p[1]); g.rotate(h > 3 && h < 9 ? a + PI : a);
          g.font = "500 " + (G.rd * (G.shape === "tank" ? 0.3 : 0.2)) + "px " + SERIF; g.fillText(ROMAN[h], 0, 0);
        } else {
          g.font = (type === "rmarabic" ? "800 " : "600 ") + (G.rd * (type === "field" ? 0.2 : type === "rmarabic" ? 0.24 : 0.22)) + "px " + (type === "arabic" ? SERIF : SANS);
          if (type === "rmarabic") { g.strokeStyle = "rgba(0,0,0,0.7)"; g.lineWidth = R * 0.02; g.strokeText(String(h || 12), p[0], p[1]); }
          g.fillText(String(h || 12), p[0], p[1]);
          if (type === "field") { const p2 = at(a, e * 0.47); g.font = "500 " + (G.rd * 0.095) + "px " + SANS; g.globalAlpha = 0.8; g.fillText(String((h || 12) + 12), p2[0], p2[1]); g.globalAlpha = 1; const t = at(a, e * 0.92); g.beginPath(); g.moveTo(t[0], t[1]); const t2 = at(a - 0.05, e * 0.86), t3 = at(a + 0.05, e * 0.86); g.lineTo(t2[0], t2[1]); g.lineTo(t3[0], t3[1]); g.fill(); }
        }
      } else if (type === "dive") {
        const p = at(a, e * 0.8); g.translate(p[0], p[1]); g.rotate(a);
        g.fillStyle = ic; g.strokeStyle = ic;
        if (h === 0) { g.beginPath(); g.moveTo(-R * 0.1, -R * 0.09); g.lineTo(R * 0.1, -R * 0.09); g.lineTo(0, R * 0.1); g.closePath(); g.fill(); g.fillStyle = lume; g.beginPath(); g.moveTo(-R * 0.07, -R * 0.065); g.lineTo(R * 0.07, -R * 0.065); g.lineTo(0, R * 0.065); g.closePath(); g.fill(); }
        else if (q) { rr(g, -R * 0.05, -R * 0.11, R * 0.1, R * 0.22, R * 0.012); g.fill(); g.fillStyle = lume; g.fillRect(-R * 0.033, -R * 0.093, R * 0.066, R * 0.186); }
        else { g.beginPath(); g.arc(0, 0, R * 0.072, 0, TAU); g.fill(); g.fillStyle = lume; g.beginPath(); g.arc(0, 0, R * 0.054, 0, TAU); g.fill(); }
      } else if (type === "diamond") {
        const p = at(a, e * 0.8); g.translate(p[0], p[1]); g.rotate(a);
        gem(g, 0, 0, R * (q ? 0.075 : 0.055));
      } else {
        // applied batons: a polished bar with a facet down the middle
        const thin = type === "batonthin", len = e * (q ? 0.2 : 0.16), wd = R * (thin ? 0.022 : type === "facet" ? 0.05 : 0.04) * (h === 0 && !thin ? 1.7 : 1);
        const p = at(a, e * 0.9 - len / 2); g.translate(p[0], p[1]); g.rotate(a);
        g.shadowColor = "rgba(0,0,0,0.4)"; g.shadowBlur = R * 0.02; g.shadowOffsetY = R * 0.01;
        const gr = g.createLinearGradient(-wd, 0, wd, 0); gr.addColorStop(0, mix(ic, "#ffffff", 0.55)); gr.addColorStop(0.5, ic); gr.addColorStop(0.52, mix(ic, "#000000", 0.25)); gr.addColorStop(1, mix(ic, "#ffffff", 0.2));
        g.fillStyle = gr; g.fillRect(-wd, -len / 2, wd * 2, len); g.shadowColor = "transparent";
        if (h === 0 && !thin) { g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(-wd * 0.08, -len / 2, wd * 0.16, len); }
        if (!thin && type !== "facet") { g.fillStyle = lume; g.fillRect(-wd * 0.42, -len * 0.36, wd * 0.84, len * 0.72); }
        if (thin) { g.fillStyle = lume; g.fillRect(-wd, -len / 2, wd * 2, len); }
      }
      g.restore();
    }
  }
  function gem(g, x, y, r) {
    g.save(); g.translate(x, y);
    const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.05, 0, 0, r); gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.5, "#dfeaf6"); gr.addColorStop(1, "#8fa3b8");
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = Math.max(0.5, r * 0.12);
    for (let i = 0; i < 4; i++) { const a = i / 4 * PI; g.beginPath(); g.moveTo(Math.cos(a) * r, Math.sin(a) * r); g.lineTo(-Math.cos(a) * r, -Math.sin(a) * r); g.stroke(); }
    g.strokeStyle = "rgba(60,80,110,0.5)"; g.beginPath(); g.arc(0, 0, r * 0.55, 0, TAU); g.stroke();
    g.restore();
  }

  // ---- the bezel -----------------------------------------------------------------------------------------------------------------------------------------
  function bezel(g, w, G) {
    const L = w.look, B = L.bezel || { type: "none" }, R = G.R, rd = G.rd, m = B.metal || L.metal, c = METAL[m] || METAL.steel;
    const ring = (r0, r1, fill) => { g.beginPath(); g.arc(0, 0, r1, 0, TAU); g.arc(0, 0, r0, 0, TAU, true); g.fillStyle = fill; g.fill("evenodd"); };
    if (G.shape === "round") {
      const out = R * 0.975;
      if (B.type === "dive" || B.type === "gmt" || B.type === "tachy") {
        ring(rd, out, metalLin(g, -R, -R, R, R, m));
        const i0 = rd + R * 0.02, i1 = out - R * 0.035;
        if (B.type === "gmt") { g.save(); g.beginPath(); g.rect(-R, -R, R * 2, R); g.clip(); ring(i0, i1, B.c2); g.restore(); g.save(); g.beginPath(); g.rect(-R, 0, R * 2, R); g.clip(); ring(i0, i1, B.c); g.restore(); }
        else ring(i0, i1, B.c);
        const sh = g.createLinearGradient(-R, -R, R, R); sh.addColorStop(0, "rgba(255,255,255," + (B.ceramic ? 0.3 : 0.16) + ")"); sh.addColorStop(0.5, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(0,0,0,0.3)"); ring(i0, i1, sh);
        const mid = (i0 + i1) / 2, th = i1 - i0;
        g.fillStyle = B.ink; g.strokeStyle = B.ink; g.textAlign = "center"; g.textBaseline = "middle";
        if (B.type === "dive") {
          for (let i = 0; i < 60; i++) {
            const a = i / 60 * TAU; g.save(); g.rotate(a); g.translate(0, -mid);
            if (i === 0) { g.beginPath(); g.moveTo(-th * 0.42, -th * 0.34); g.lineTo(th * 0.42, -th * 0.34); g.lineTo(0, th * 0.4); g.closePath(); g.fill(); g.fillStyle = B.pip || "#f4f4ee"; g.beginPath(); g.arc(0, -th * 0.08, th * 0.14, 0, TAU); g.fill(); }
            else if (i % 10 === 0) { g.font = "700 " + th * 0.62 + "px " + SANS; g.fillText(String(i), 0, th * 0.03); }
            else if (i % 5 === 0) g.fillRect(-th * 0.07, -th * 0.34, th * 0.14, th * 0.68);
            else if (i < 15) g.fillRect(-th * 0.03, -th * 0.34, th * 0.06, th * 0.3);
            g.restore();
          }
        } else if (B.type === "gmt") {
          for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; g.save(); g.rotate(a); g.translate(0, -mid); if (i === 0) { g.beginPath(); g.moveTo(-th * 0.36, -th * 0.3); g.lineTo(th * 0.36, -th * 0.3); g.lineTo(0, th * 0.36); g.closePath(); g.fill(); } else if (i % 2 === 0) { g.font = "700 " + th * 0.56 + "px " + SANS; g.fillText(String(i), 0, th * 0.03); } else { g.beginPath(); g.arc(0, 0, th * 0.08, 0, TAU); g.fill(); } g.restore(); }
        } else {
          const marks = [60, 65, 70, 75, 80, 90, 100, 120, 140, 160, 200, 240, 300, 400, 500];
          marks.forEach(v => { const a = (60 / v) * TAU * (60 / 60); g.save(); g.rotate(a % TAU); g.translate(0, -mid); g.fillRect(-th * 0.03, th * 0.2, th * 0.06, th * 0.24); if (v % 20 === 0 || v === 60 || v === 500) { g.font = "600 " + th * 0.36 + "px " + SANS; g.fillText(String(v), 0, -th * 0.1); } g.restore(); });
          g.save(); g.rotate(0.14); g.translate(0, -mid); g.font = "600 " + th * 0.26 + "px " + SANS; g.fillText("TACHYMÈTRE", th * 1.6, th * 0.26); g.restore();
        }
        // the grip cut into the bezel's edge
        g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = Math.max(0.6, R * 0.008);
        const n = B.scallop ? 12 : 120; for (let i = 0; i < n; i++) { const a = i / n * TAU, p = at(a, out), q = at(a, out - R * (B.scallop ? 0.05 : 0.028)); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); }
      } else if (B.type === "fluted") {
        const n = 72;
        for (let i = 0; i < n; i++) {
          const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, light = 0.5 + 0.5 * Math.sin(a0 * 1 + (i % 2 ? 2.2 : 0.1));
          g.fillStyle = i % 2 ? mix(c[2], c[0], light * 0.7) : mix(c[3], c[1], light);
          g.beginPath(); const p = at(a0, out), q = at(a1, out), s = at(a1, rd), t = at(a0, rd); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.lineTo(s[0], s[1]); g.lineTo(t[0], t[1]); g.closePath(); g.fill();
        }
        g.strokeStyle = c[3]; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, rd, 0, TAU); g.stroke();
      } else if (B.type === "diamond") {
        ring(rd, out, metalLin(g, -R, -R, R, R, "gold"));
        const n = 44, mid = (rd + out) / 2; for (let i = 0; i < n; i++) { const p = at(i / n * TAU, mid); gem(g, p[0], p[1], (out - rd) * 0.42); }
      } else {
        const gr = g.createLinearGradient(-R, -R, R, R); gr.addColorStop(0, c[0]); gr.addColorStop(0.4, c[1]); gr.addColorStop(0.6, c[2]); gr.addColorStop(1, c[0]);
        ring(rd, out, gr);
        if (!L.matteCase) { g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = Math.max(0.6, R * 0.01); g.beginPath(); g.arc(0, 0, (rd + out) / 2, PI * 1.05, PI * 1.6); g.stroke(); }
      }
      g.strokeStyle = "rgba(0,0,0,0.55)"; g.lineWidth = Math.max(1, R * 0.014); g.beginPath(); g.arc(0, 0, rd, 0, TAU); g.stroke();
    } else if (G.shape === "octagon" || G.shape === "porthole") {
      const round = G.shape === "octagon" ? 0.14 : 0.42, out = R * (G.shape === "octagon" ? 0.98 : 0.97);
      g.save(); poly(g, out, 8, PI / 8, round); g.clip();
      // brushed, top to bottom
      g.fillStyle = metalLin(g, 0, -R, 0, R, m); g.fillRect(-R * 1.1, -R * 1.1, R * 2.2, R * 2.2);
      g.globalAlpha = 0.16; g.strokeStyle = "#fff"; g.lineWidth = 0.6; for (let x = -R; x < R; x += 2) { g.beginPath(); g.moveTo(x, -R); g.lineTo(x, R); g.stroke(); } g.globalAlpha = 1;
      g.restore();
      g.strokeStyle = c[0]; g.lineWidth = R * 0.018; poly(g, out, 8, PI / 8, round); g.stroke();   // the polished bevel
      if (G.shape === "octagon") for (let i = 0; i < 8; i++) {
        const p = at(i / 8 * TAU, R * 0.84); g.save(); g.translate(p[0], p[1]); g.rotate(i / 8 * TAU);
        g.fillStyle = METAL.steel[0]; poly(g, R * 0.058, 6, 0, 0.1); g.fill(); g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = R * 0.008; g.stroke();
        g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(-R * 0.05, -R * 0.008, R * 0.1, R * 0.016); g.restore();
      }
    } else if (G.shape === "tank") {
      // the brancards: the two bars down the sides
      for (const sx of [-1, 1]) { g.fillStyle = metalLin(g, sx * R * 0.8, 0, sx * G.hw, 0, m); rr(g, sx > 0 ? G.hw : -R * 0.8, -R * 1.12, R * 0.8 - G.hw, R * 2.24, R * 0.1); g.fill(); }
      g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = Math.max(1, R * 0.012); G.dialPath(g); g.stroke();
    } else if (G.shape === "tonneau") {
      if (B.screws) for (const p of [[-0.62, -1.02], [0.62, -1.02], [-0.86, -0.36], [0.86, -0.36], [-0.86, 0.36], [0.86, 0.36], [-0.62, 1.02], [0.62, 1.02]]) {
        g.fillStyle = METAL.titanium[0]; g.beginPath(); g.arc(p[0] * R, p[1] * R, R * 0.045, 0, TAU); g.fill();
        g.fillStyle = "#17181b"; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; g.beginPath(); g.arc(p[0] * R + Math.sin(a) * R * 0.026, p[1] * R + Math.cos(a) * R * 0.026, R * 0.009, 0, TAU); g.fill(); }
      }
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = Math.max(1, R * 0.014); G.dialPath(g); g.stroke();
    }
  }

  // ---- windows and registers on the dial (the parts of them that do not move) --------------------------------------------------------------------------------
  function subdialAt(w, G, name) {
    const rd = G.rd, k = { 3: [0.5, 0], 6: [0, 0.5], 9: [-0.5, 0], 12: [0, -0.5] }[name];
    return { x: k[0] * rd, y: k[1] * rd, r: rd * 0.24 };
  }
  function compsStatic(g, w, G, t) {
    const L = w.look, C = L.comps || [], R = G.R, rd = G.rd, dark = lum((L.dial && L.dial.c) || "#111") < 0.5, ink = L.idxC || (dark ? "#e8eaec" : "#2a2d33");
    const skip = [];
    const win = (x, y, ww, hh, txt, o) => {
      o = o || {};
      g.save(); g.fillStyle = o.bg || "#f6f5f0"; g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = R * 0.02; rr(g, x - ww / 2, y - hh / 2, ww, hh, R * 0.012); g.fill(); g.shadowColor = "transparent";
      g.strokeStyle = o.frame || "rgba(0,0,0,0.45)"; g.lineWidth = Math.max(0.7, R * 0.01); g.stroke();
      g.fillStyle = o.ink || "#17181b"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "700 " + hh * 0.84 + "px " + (o.serif ? SERIF : SANS); g.fillText(txt, x, y + hh * 0.05, ww * 0.94); g.restore();
    };
    const sub = (p, o) => {
      o = o || {};
      g.save(); g.translate(p.x, p.y);
      g.fillStyle = o.bg || (dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"); g.beginPath(); g.arc(0, 0, p.r, 0, TAU); g.fill();
      g.strokeStyle = o.ring || ink; g.lineWidth = o.ringW || Math.max(0.7, R * 0.008); g.beginPath(); g.arc(0, 0, p.r, 0, TAU); g.stroke();
      // azurage: the fine circles engraved in a register
      g.globalAlpha = 0.14; g.lineWidth = 0.5; g.strokeStyle = ink; for (let rr2 = p.r * 0.2; rr2 < p.r; rr2 += p.r * 0.13) { g.beginPath(); g.arc(0, 0, rr2, 0, TAU); g.stroke(); } g.globalAlpha = 1;
      g.strokeStyle = ink; g.fillStyle = ink; const n = o.n || 12;
      for (let i = 0; i < n; i++) { const a = i / n * TAU, q0 = at(a, p.r * 0.94), q1 = at(a, p.r * (i % (n / 4) === 0 ? 0.74 : 0.84)); g.lineWidth = Math.max(0.6, R * 0.008); g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.stroke(); }
      if (o.nums) { g.font = "600 " + p.r * 0.3 + "px " + SANS; g.textAlign = "center"; g.textBaseline = "middle"; o.nums.forEach((s, i) => { const q = at(i / o.nums.length * TAU, p.r * 0.52); if (s) g.fillText(s, q[0], q[1]); }); }
      g.restore();
    };
    for (const c of C) {
      if (c === "date") { win(rd * 0.7, 0, rd * 0.24, rd * 0.19, String(t.date), { serif: L.metal === "rose" }); skip.push(3); }
      else if (c === "date6") { win(0, rd * 0.7, rd * 0.2, rd * 0.17, String(t.date), { bg: "#0f1a2e", ink: "#f0f0ec", frame: "rgba(255,255,255,0.4)" }); skip.push(6); }
      else if (c === "daydate3") { win(rd * 0.6, 0, rd * 0.46, rd * 0.18, DAYS[t.dow].slice(0, 3) + " " + t.date); skip.push(3); }
      else if (c === "dayarc") {
        g.save(); g.fillStyle = "#f6f5f0"; g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = Math.max(0.7, R * 0.01);
        g.beginPath(); g.arc(0, 0, rd * 0.86, -PI / 2 - 0.42, -PI / 2 + 0.42); g.arc(0, 0, rd * 0.67, -PI / 2 + 0.42, -PI / 2 - 0.42, true); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = "#17181b"; g.font = "700 " + rd * 0.13 + "px " + SANS; g.textAlign = "center"; g.textBaseline = "middle";
        const s = DAYS[t.dow]; for (let i = 0; i < s.length; i++) { const a = (i - (s.length - 1) / 2) * 0.105; g.save(); g.rotate(a); g.fillText(s[i], 0, -rd * 0.765); g.restore(); }
        g.restore(); skip.push(0);
      }
      else if (c === "reserve") {
        g.save(); g.translate(-rd * 0.42, rd * 0.36); g.strokeStyle = ink; g.lineWidth = Math.max(0.8, R * 0.012);
        g.beginPath(); g.arc(0, 0, rd * 0.24, PI * 0.72, PI * 1.38); g.stroke();
        for (let i = 0; i <= 6; i++) { const a = PI * 0.72 + i / 6 * PI * 0.66; g.beginPath(); g.moveTo(Math.cos(a) * rd * 0.24, Math.sin(a) * rd * 0.24); g.lineTo(Math.cos(a) * rd * 0.2, Math.sin(a) * rd * 0.2); g.stroke(); }
        g.restore(); skip.push(7, 8);
      }
      else if (c === "smallsec") { sub(subdialAt(w, G, 6), { n: 12 }); skip.push(6); }
      else if (c === "chrono369" || c === "chrono369g") {
        const gold = c === "chrono369g" ? { ring: METAL.gold[1], ringW: R * 0.022, bg: "rgba(0,0,0,0.25)" } : null;
        sub(subdialAt(w, G, 3), Object.assign({ nums: ["30", "", "10", "", "20", ""] }, gold)); sub(subdialAt(w, G, 6), Object.assign({ nums: ["12", "", "", "4", "", "", "", "8", ""].slice(0, 6) }, gold)); sub(subdialAt(w, G, 9), Object.assign({ nums: ["60", "", "20", "", "40", ""] }, gold));
        skip.push(3, 6, 9);
      }
      else if (c === "chrono612") { sub(subdialAt(w, G, 12), { nums: ["30", "", "", "15", "", ""] }); sub(subdialAt(w, G, 6), { nums: ["60", "", "", "30", "", ""] }); skip.push(0, 6); }
      else if (c === "rmchrono") {
        const acc = L.accent || "#ff5a1f";
        [3, 6, 9].forEach(n => { const p = subdialAt(w, G, n); p.r *= 0.92; sub(p, { ring: acc, ringW: R * 0.016, bg: "rgba(0,0,0,0.45)" }); });
      }
      else if (c === "bigdate") { win(-rd * 0.1, -rd * 0.62, rd * 0.17, rd * 0.2, String(Math.floor(t.date / 10)), { bg: "#0d0d0f", ink: "#f2f2ee", frame: L.accent }); win(rd * 0.1, -rd * 0.62, rd * 0.17, rd * 0.2, String(t.date % 10), { bg: "#0d0d0f", ink: "#f2f2ee", frame: L.accent }); }
      else if (c === "lange") {
        // the time on its own dial to the left, the great date top right, seconds below it, the power reserve at the edge
        const hc = L.handC || "#b3745a";
        g.save(); g.translate(-rd * 0.24, 0); g.strokeStyle = "#2a2d33"; g.fillStyle = "#2a2d33"; g.lineWidth = Math.max(0.7, R * 0.008);
        g.beginPath(); g.arc(0, 0, rd * 0.56, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, rd * 0.5, 0, TAU); g.stroke();
        g.font = "500 " + rd * 0.13 + "px " + SERIF; g.textAlign = "center"; g.textBaseline = "middle";
        for (let h = 0; h < 12; h++) { const a = h / 12 * TAU; if (h % 3 === 0) { const p = at(a, rd * 0.4); g.fillText(ROMAN[h] === "IIII" ? "IV" : ROMAN[h], p[0], p[1]); } else { const p = at(a, rd * 0.42); g.save(); g.translate(p[0], p[1]); g.rotate(a); g.fillStyle = hc; g.beginPath(); g.moveTo(0, -rd * 0.05); g.lineTo(rd * 0.02, 0); g.lineTo(0, rd * 0.05); g.lineTo(-rd * 0.02, 0); g.fill(); g.restore(); g.fillStyle = "#2a2d33"; } }
        g.restore();
        for (const k of [0, 1]) { const x = rd * (0.3 + k * 0.21), y = -rd * 0.42; g.fillStyle = "#fbfaf6"; g.strokeStyle = hc; g.lineWidth = R * 0.014; rr(g, x - rd * 0.1, y - rd * 0.13, rd * 0.2, rd * 0.26, R * 0.01); g.fill(); g.stroke(); g.fillStyle = "#17181b"; g.font = "600 " + rd * 0.22 + "px " + SERIF; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(k ? t.date % 10 : Math.floor(t.date / 10) || ""), x, y + rd * 0.01); }
        sub({ x: rd * 0.36, y: rd * 0.42, r: rd * 0.24 }, { n: 12, ring: "#2a2d33" });
        g.save(); g.strokeStyle = "#2a2d33"; g.lineWidth = Math.max(0.7, R * 0.008); g.beginPath(); g.arc(rd * 0.36, 0, rd * 0.5, -0.5, 0.5); g.stroke(); g.fillStyle = "#2a2d33"; g.font = "500 " + rd * 0.07 + "px " + SANS; g.fillText("AUF", rd * 0.7, -rd * 0.3); g.fillText("AB", rd * 0.72, rd * 0.3); g.restore();
      }
    }
    return skip;
  }

  // ---- hands -----------------------------------------------------------------------------------------------------------------------------------------------
  function hand(g, type, a, len, wd, col, lume, kind) {
    g.save(); g.rotate(a);
    g.shadowColor = "rgba(0,0,0,0.5)"; g.shadowBlur = wd * 1.2; g.shadowOffsetX = wd * 0.5; g.shadowOffsetY = wd * 0.7;
    const hi = mix(col, "#ffffff", 0.45), lo = mix(col, "#000000", 0.3);
    const gr = g.createLinearGradient(-wd, 0, wd, 0); gr.addColorStop(0, hi); gr.addColorStop(0.49, col); gr.addColorStop(0.51, lo); gr.addColorStop(1, col);
    g.fillStyle = gr;
    const tail = len * 0.16;
    if (type === "dauphine") { g.beginPath(); g.moveTo(0, tail); g.lineTo(wd * 1.25, -len * 0.08); g.lineTo(0, -len); g.lineTo(-wd * 1.25, -len * 0.08); g.closePath(); g.fill(); }
    else if (type === "leaf") { g.beginPath(); g.moveTo(0, tail); g.bezierCurveTo(wd * 2.2, -len * 0.2, wd * 1.6, -len * 0.7, 0, -len); g.bezierCurveTo(-wd * 1.6, -len * 0.7, -wd * 2.2, -len * 0.2, 0, tail); g.fill(); }
    else if (type === "sword") { g.beginPath(); g.moveTo(-wd * 0.5, tail); g.lineTo(wd * 0.5, tail); g.lineTo(wd, -len * 0.78); g.lineTo(0, -len); g.lineTo(-wd, -len * 0.78); g.closePath(); g.fill(); }
    else if (type === "skeleton") { g.beginPath(); g.moveTo(-wd * 0.5, tail); g.lineTo(wd * 0.5, tail); g.lineTo(wd * 1.1, -len * 0.84); g.lineTo(0, -len); g.lineTo(-wd * 1.1, -len * 0.84); g.closePath(); g.rect(-wd * 0.42, -len * 0.5, wd * 0.84, len * 0.42); g.fill("evenodd"); }
    else {   // baton, mercedes, snowflake: a straight stem
      rr(g, -wd * 0.62, -len, wd * 1.24, len + tail, wd * 0.3); g.fill();
      if (type === "mercedes" && kind === "h") { g.beginPath(); g.arc(0, -len * 0.7, wd * 2.1, 0, TAU); g.fill(); }
      if (type === "snowflake" && kind === "h") { g.beginPath(); g.moveTo(0, -len * 0.98); g.lineTo(wd * 2.4, -len * 0.74); g.lineTo(0, -len * 0.5); g.lineTo(-wd * 2.4, -len * 0.74); g.closePath(); g.fill(); }
    }
    g.shadowColor = "transparent";
    if (lume) {
      g.fillStyle = lume;
      if (type === "mercedes" && kind === "h") { g.beginPath(); g.arc(0, -len * 0.7, wd * 1.55, 0, TAU); g.fill(); g.strokeStyle = col; g.lineWidth = wd * 0.3; for (let i = 0; i < 3; i++) { const b = i / 3 * TAU; g.beginPath(); g.moveTo(0, -len * 0.7); g.lineTo(Math.sin(b) * wd * 1.55, -len * 0.7 - Math.cos(b) * wd * 1.55); g.stroke(); } g.fillRect(-wd * 0.3, -len * 0.5, wd * 0.6, len * 0.36); }
      else if (type === "snowflake" && kind === "h") { g.beginPath(); g.moveTo(0, -len * 0.93); g.lineTo(wd * 1.8, -len * 0.74); g.lineTo(0, -len * 0.55); g.lineTo(-wd * 1.8, -len * 0.74); g.closePath(); g.fill(); }
      else if (type === "sword") { g.beginPath(); g.moveTo(-wd * 0.3, -len * 0.16); g.lineTo(wd * 0.3, -len * 0.16); g.lineTo(wd * 0.6, -len * 0.76); g.lineTo(0, -len * 0.93); g.lineTo(-wd * 0.6, -len * 0.76); g.closePath(); g.fill(); }
      else if (type === "baton" || type === "mercedes" || type === "snowflake") g.fillRect(-wd * 0.3, -len * 0.92, wd * 0.6, len * 0.66);
    }
    g.restore();
  }
  function needle(g, a, len, wd, col, counter) {
    g.save(); g.rotate(a); g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = wd * 2; g.shadowOffsetY = wd;
    g.fillStyle = col; g.beginPath(); g.moveTo(-wd, len * 0.22); g.lineTo(wd, len * 0.22); g.lineTo(wd * 0.35, -len); g.lineTo(-wd * 0.35, -len); g.closePath(); g.fill();
    if (counter) { g.beginPath(); g.arc(0, len * 0.22, wd * 2.2, 0, TAU); g.fill(); }
    g.restore();
  }

  function staticLayer(w, R, t, len) {
    const key = w.id + "@" + Math.round(R) + ":" + t.date + ":" + t.dow + ":" + len;
    let L = cache.get(key); if (L) return L;
    if (cache.size > 40) cache.clear();
    const G = geom(w, R), cw = Math.ceil(R * 2.9), ch = Math.ceil(R * 2 * (len + 0.05));
    const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
    const g = cv.getContext("2d"), look = w.look;
    g.translate(cw / 2, ch / 2);
    strap(g, w, G, len);
    // crown (and pushers for a chronograph)
    if (G.shape !== "digital") {
      const cm = look.metal === "carbon" ? "titanium" : look.metal, cx = (G.shape === "tank" ? 0.8 : G.shape === "tonneau" ? 0.98 : G.shape === "round" ? 0.97 : 1.0) * R;
      g.fillStyle = metalLin(g, 0, -R * 0.12, 0, R * 0.12, cm); rr(g, cx, -R * 0.11, R * 0.16, R * 0.22, R * 0.03); g.fill();
      g.strokeStyle = "rgba(0,0,0,0.3)"; g.lineWidth = 0.7; for (let y = -R * 0.09; y < R * 0.1; y += R * 0.035) { g.beginPath(); g.moveTo(cx + R * 0.02, y); g.lineTo(cx + R * 0.16, y); g.stroke(); }
      if (look.cabochon) { g.fillStyle = look.cabochon; g.beginPath(); g.arc(cx + R * 0.17, 0, R * 0.07, 0, TAU); g.fill(); g.fillStyle = "rgba(255,255,255,0.5)"; g.beginPath(); g.arc(cx + R * 0.15, -R * 0.025, R * 0.02, 0, TAU); g.fill(); }
      if ((look.comps || []).some(c => /chrono/.test(c))) for (const sy of [-1, 1]) { g.save(); g.rotate(sy * 0.5); g.fillStyle = metalLin(g, 0, -R * 0.08, 0, R * 0.08, cm); rr(g, R * 0.95, -R * 0.07, R * 0.15, R * 0.14, R * 0.03); g.fill(); g.restore(); }
    } else {
      g.fillStyle = "#2a2c30"; for (const p of [[-1, -0.45], [-1, 0.45], [1, -0.45], [1, 0.45]]) { rr(g, p[0] * R * 0.98 - R * 0.05, p[1] * R - R * 0.11, R * 0.1, R * 0.22, R * 0.03); g.fill(); }
    }
    // the case
    g.save(); g.shadowColor = "rgba(0,0,0,0.55)"; g.shadowBlur = R * 0.12; g.shadowOffsetY = R * 0.04;
    G.casePath(g); g.fillStyle = metalLin(g, -R, -R, R, R, look.metal); g.fill(); g.restore();
    if (look.metal === "carbon") {   // forged carbon: layered, like wood grain
      g.save(); G.casePath(g); g.clip(); const r = rnd(hash(w.id)); g.globalAlpha = 0.22;
      for (let i = 0; i < 26; i++) { g.strokeStyle = r() < 0.5 ? "#8a8d92" : "#000"; g.lineWidth = 1 + r() * 2.5; g.beginPath(); const y = (r() - 0.5) * R * 2.6; g.moveTo(-R * 1.2, y); g.bezierCurveTo(-R * 0.3, y + (r() - 0.5) * R * 0.5, R * 0.3, y + (r() - 0.5) * R * 0.5, R * 1.2, y + (r() - 0.5) * R * 0.4); g.stroke(); }
      g.restore();
    }
    if (G.shape === "digital") {
      // the face plate round the display, its printing, the corner screws
      g.fillStyle = "#101114"; rr(g, -R * 0.8, -R * 0.82, R * 1.6, R * 1.64, R * 0.16); g.fill();
      g.strokeStyle = look.accent; g.lineWidth = R * 0.022; rr(g, -R * 0.73, -R * 0.52, R * 1.46, R * 1.04, R * 0.1); g.stroke();
      g.fillStyle = "#e8e8e4"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "800 " + R * 0.15 + "px " + SANS; g.fillText(look.text[0], 0, -R * 0.66);
      g.font = "600 " + R * 0.085 + "px " + SANS; g.fillStyle = look.accent; g.fillText(look.armour ? "PROTECTION" : "ALARM CHRONO", -R * 0.2, R * 0.63); g.fillStyle = "#c9a45a"; g.fillText(look.armour ? "SHOCK RESIST" : "WATER RESIST", R * 0.3, R * 0.72);
      g.fillStyle = "#3a3c40"; if (look.armour) for (const p of [[-0.74, -0.84], [0.74, -0.84], [-0.74, 0.84], [0.74, 0.84]]) { g.beginPath(); g.arc(p[0] * R, p[1] * R, R * 0.05, 0, TAU); g.fill(); }
      G.dialPath(g); g.fillStyle = look.lcd; g.fill(); g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = R * 0.02; g.stroke();
    } else {
      const bezelFirst = G.shape === "octagon" || G.shape === "porthole";
      if (bezelFirst) bezel(g, w, G);
      g.save(); G.dialPath(g); g.clip(); dialSurface(g, w, G);
      const skip = compsStatic(g, w, G, t);
      indices(g, w, G, skip);
      // the names on the dial
      const dark = lum((look.dial && look.dial.c) || "#111") < 0.5, ink = dark ? "#e9ebee" : "#22252a", serif = /roman|arabic|facet/.test(look.idx || "") || look.metal === "rose";
      g.fillStyle = look.text && look.metal === "gold" && dark ? METAL.gold[1] : ink; g.textAlign = "center"; g.textBaseline = "middle";
      const ty = G.shape === "tank" ? -G.hh * 0.34 : -G.rd * 0.4, lange = (look.comps || []).indexOf("lange") >= 0;
      if (!lange && look.text[0]) {
        if (look.crown) { g.save(); g.translate(0, ty - G.rd * 0.15); const s = G.rd * 0.055; g.beginPath(); g.moveTo(-s * 1.5, s); g.lineTo(-s * 1.9, -s * 0.8); g.lineTo(-s * 0.9, 0); g.lineTo(0, -s * 1.4); g.lineTo(s * 0.9, 0); g.lineTo(s * 1.9, -s * 0.8); g.lineTo(s * 1.5, s); g.closePath(); g.fill(); g.restore(); }
        g.font = (serif ? "500 " : "700 ") + G.rd * (look.text[0].length > 12 ? 0.085 : 0.105) + "px " + (serif ? SERIF : SANS);
        try { g.letterSpacing = (G.rd * 0.012) + "px"; } catch (e) { /* older canvas */ }
        g.fillText(look.text[0], 0, ty, G.rd * 1.2);
        if (look.text[1]) { g.font = "500 " + G.rd * 0.07 + "px " + (serif ? SERIF : SANS); g.fillText(look.text[1], 0, (look.comps || []).some(c => c === "chrono369" || c === "chrono369g" || c === "date6" || c === "smallsec" || c === "chrono612") ? ty + G.rd * 0.13 : G.rd * 0.38, G.rd); }
        try { g.letterSpacing = "0px"; } catch (e) { /* older canvas */ }
      } else if (lange) { g.font = "500 " + G.rd * 0.06 + "px " + SERIF; g.fillStyle = "#2a2d33"; g.fillText(look.text[0], -G.rd * 0.24, -G.rd * 0.74); g.fillText(look.text[1], -G.rd * 0.24, G.rd * 0.74); }
      // the dial sits below the bezel: a soft shadow round its edge
      g.lineWidth = R * 0.07; g.strokeStyle = "rgba(0,0,0,0.3)"; G.dialPath(g); g.stroke();
      g.restore();
      if (!bezelFirst) bezel(g, w, G);
      else { g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = Math.max(1, R * 0.014); G.dialPath(g); g.stroke(); }
    }
    L = { cv: cv, G: G, cw: cw, ch: ch };
    cache.set(key, L);
    return L;
  }

  function draw(g, w, cx, cy, R, t, opts) {
    opts = opts || {};
    const len = opts.strap || 2.6, S = staticLayer(w, R, t, len), G = S.G, look = w.look, rd = G.rd;
    g.save(); g.translate(cx, cy);
    g.drawImage(S.cv, -S.cw / 2, -S.ch / 2);
    const sec = look.quartz ? Math.floor(t.s) : look.sweep === "glide" ? t.s : Math.floor(t.s * 8) / 8;
    if (G.shape === "digital") {
      const hh = String(Math.floor(t.h)).padStart(2, "0"), mm = String(Math.floor(t.m)).padStart(2, "0"), ss = String(Math.floor(t.s)).padStart(2, "0");
      g.fillStyle = "#16181a"; g.textBaseline = "middle"; g.textAlign = "left";
      g.font = "700 " + R * 0.17 + "px 'Courier New', monospace"; g.fillText(DAYS[t.dow].slice(0, 2), -R * 0.58, -R * 0.26); g.textAlign = "right"; g.fillText(String(t.date), R * 0.58, -R * 0.26);
      g.save(); g.transform(1, 0, -0.1, 1, 0, 0); g.textAlign = "left"; g.font = "700 " + R * 0.33 + "px 'Courier New', monospace";
      g.fillText(hh + (Math.floor(t.s * 2) % 2 ? ":" : " ") + mm, -R * 0.57, R * 0.12); g.font = "700 " + R * 0.19 + "px 'Courier New', monospace"; g.fillText(ss, R * 0.4, R * 0.16); g.restore();
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(-R * 0.62, -R * 0.14, R * 1.24, R * 0.012);
    } else {
      g.save(); G.dialPath(g); g.clip();
      const C = look.comps || [], dark = lum((look.dial && look.dial.c) || "#111") < 0.5, hc = look.handC || (dark ? "#e3e6ea" : "#2a2d33"), lume = look.lume || (/dive|field/.test(look.idx || "") ? "#eef0ea" : null);
      const sc = look.secC || (look.accent) || (C.indexOf("gmt") >= 0 ? hc : dark ? "#e3e6ea" : "#b3202a");
      const ah = ((t.h % 12) + t.m / 60) / 12 * TAU, am = (t.m + t.s / 60) / 60 * TAU, as = sec / 60 * TAU;
      let centralSeconds = true;
      for (const c of C) {
        if (c === "smallsec") { const p = subdialAt(w, G, 6); g.save(); g.translate(p.x, p.y); needle(g, as, p.r * 0.8, p.r * 0.05, hc); g.restore(); centralSeconds = false; }
        else if (c === "chrono369" || c === "chrono369g" || c === "rmchrono") {
          const p9 = subdialAt(w, G, 9), p3 = subdialAt(w, G, 3), p6 = subdialAt(w, G, 6), nc = c === "rmchrono" ? look.accent : c === "chrono369g" ? METAL.gold[1] : hc;
          g.save(); g.translate(p9.x, p9.y); needle(g, as, p9.r * 0.78, p9.r * 0.05, nc); g.restore();
          g.save(); g.translate(p3.x, p3.y); needle(g, 0.7, p3.r * 0.78, p3.r * 0.05, nc); g.restore();
          g.save(); g.translate(p6.x, p6.y); needle(g, 2.3, p6.r * 0.78, p6.r * 0.05, nc); g.restore();
          centralSeconds = "chrono";
        }
        else if (c === "chrono612") { const p6 = subdialAt(w, G, 6), p12 = subdialAt(w, G, 12); g.save(); g.translate(p6.x, p6.y); needle(g, as, p6.r * 0.78, p6.r * 0.05, hc); g.restore(); g.save(); g.translate(p12.x, p12.y); needle(g, 0, p12.r * 0.78, p12.r * 0.05, hc); g.restore(); centralSeconds = "chrono"; }
        else if (c === "reserve") { g.save(); g.translate(-rd * 0.42, rd * 0.36); needle(g, -PI * 0.5 - 0.5 + 0.9 * (0.5 + 0.4 * Math.sin(t.h)), rd * 0.2, rd * 0.012, look.secC || hc); g.restore(); }
        else if (c === "gmt") { const a24 = ((t.h + 9) % 24 + t.m / 60) / 24 * TAU; g.save(); g.rotate(a24); g.fillStyle = look.gmtC || "#c8372d"; g.fillRect(-rd * 0.012, -rd * 0.8, rd * 0.024, rd * 0.8); g.beginPath(); g.moveTo(0, -rd * 0.97); g.lineTo(rd * 0.07, -rd * 0.8); g.lineTo(-rd * 0.07, -rd * 0.8); g.closePath(); g.fill(); g.restore(); }
        else if (c === "lange") {
          g.save(); g.translate(rd * 0.36, rd * 0.42); needle(g, as, rd * 0.2, rd * 0.012, hc); g.restore();
          g.save(); g.translate(rd * 0.36, 0); needle(g, PI / 2 - 0.3, rd * 0.5, rd * 0.014, hc); g.restore();
          g.save(); g.translate(-rd * 0.24, 0); hand(g, "sword", ah, rd * 0.3, rd * 0.03, hc, null, "h"); hand(g, "sword", am, rd * 0.47, rd * 0.024, hc, null, "m"); g.fillStyle = hc; g.beginPath(); g.arc(0, 0, rd * 0.035, 0, TAU); g.fill(); g.restore();
          centralSeconds = "none";
        }
      }
      if (centralSeconds !== "none") {
        const e = G.shape === "tank" ? G.hw * 1.1 : rd, ht = look.hands || "baton";
        hand(g, ht, ah, e * (G.shape === "tank" ? 0.62 : 0.52), e * 0.042, hc, lume, "h");
        hand(g, ht, am, e * (G.shape === "tank" ? 0.98 : 0.84), e * 0.032, hc, lume, "m");
        if (G.shape !== "tank") {
          // a chronograph's centre hand is the stopwatch, parked at twelve
          needle(g, centralSeconds === "chrono" ? 0 : as, rd * 0.88, rd * 0.012, sc, true);
          if (look.hands === "mercedes" && centralSeconds === true) { g.save(); g.rotate(as); g.fillStyle = lume || "#fff"; g.beginPath(); g.arc(0, -rd * 0.56, rd * 0.03, 0, TAU); g.fill(); g.restore(); }
        }
        g.fillStyle = mix(hc, "#000000", 0.2); g.beginPath(); g.arc(0, 0, e * 0.05, 0, TAU); g.fill(); g.fillStyle = mix(hc, "#ffffff", 0.5); g.beginPath(); g.arc(0, 0, e * 0.022, 0, TAU); g.fill();
      }
      // the magnifier over the date
      if (C.indexOf("cyclops") >= 0) { const x = rd * 0.7; const gr = g.createRadialGradient(x - rd * 0.05, -rd * 0.05, 0, x, 0, rd * 0.2); gr.addColorStop(0, "rgba(255,255,255,0.3)"); gr.addColorStop(1, "rgba(255,255,255,0.02)"); g.fillStyle = gr; rr(g, x - rd * 0.17, -rd * 0.14, rd * 0.34, rd * 0.28, rd * 0.06); g.fill(); g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1; g.stroke(); }
      // the crystal: one long reflection, and the dome's edge
      if (opts.glare !== false) {
        const gl = g.createLinearGradient(-rd, -rd, rd * 0.4, rd * 0.6); gl.addColorStop(0, "rgba(255,255,255,0.2)"); gl.addColorStop(0.32, "rgba(255,255,255,0.05)"); gl.addColorStop(0.34, "rgba(255,255,255,0)"); gl.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gl; g.fillRect(-R * 1.2, -R * 1.3, R * 2.4, R * 2.6);
        if (look.domed) { const dg = g.createRadialGradient(0, 0, rd * 0.7, 0, 0, rd); dg.addColorStop(0, "rgba(255,255,255,0)"); dg.addColorStop(1, "rgba(255,255,255,0.16)"); g.fillStyle = dg; g.fillRect(-R, -R, R * 2, R * 2); }
        if (look.worn) { g.strokeStyle = "rgba(255,255,255,0.22)"; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-rd * 0.5, -rd * 0.2); g.lineTo(rd * 0.1, rd * 0.3); g.moveTo(rd * 0.2, -rd * 0.5); g.lineTo(rd * 0.45, -rd * 0.1); g.stroke(); }
      }
      g.restore();
    }
    g.restore();
  }

  // ---- the wrist ---------------------------------------------------------------------------------------------------------------------------------------------------
  // The left forearm comes up from the lower left; the hand ends to the right. Drawn in the arm's own frame: x along the arm, the watch at the origin.
  function wrist(g, W, H, k, w, t, opts) {
    opts = opts || {};
    const e = 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
    const R = Math.min(W, H) * 0.165, cx = W * 0.5 - (1 - e) * W * 0.3, cy = H * 0.5 + (1 - e) * H * 0.85, tilt = -0.2 + (1 - e) * 0.5;
    const skin = opts.skin || "#d9a988", skinD = mix(skin, "#5a2f1c", 0.42), skinL = mix(skin, "#fff1e2", 0.4), hw = R * 1.3;
    g.save(); g.translate(cx, cy); g.rotate(tilt);
    // the hand: back of it, knuckles, the thumb underneath
    const band = g.createLinearGradient(0, -hw * 1.3, 0, hw * 1.3); band.addColorStop(0, skinD); band.addColorStop(0.2, skin); band.addColorStop(0.45, skinL); band.addColorStop(0.75, skin); band.addColorStop(1, skinD);
    g.fillStyle = band;
    g.beginPath(); g.moveTo(-W, -hw * 1.12); g.lineTo(-R * 0.4, -hw); g.bezierCurveTo(R * 1.6, -hw * 1.05, R * 2.6, -hw * 1.42, R * 4.2, -hw * 1.3);
    g.bezierCurveTo(R * 5.4, -hw * 1.24, R * 6.6, -hw * 0.9, R * 7.4, -hw * 0.3); g.lineTo(R * 7.6, hw * 0.75); g.bezierCurveTo(R * 6.2, hw * 1.25, R * 4.4, hw * 1.34, R * 3.0, hw * 1.2);
    g.bezierCurveTo(R * 1.8, hw * 1.1, R * 0.8, hw * 1.0, -R * 0.4, hw); g.lineTo(-W, hw * 1.12); g.closePath(); g.fill();
    // thumb
    g.beginPath(); g.moveTo(R * 2.2, hw * 1.02); g.bezierCurveTo(R * 3.0, hw * 1.7, R * 4.6, hw * 2.0, R * 5.6, hw * 1.72); g.bezierCurveTo(R * 6.0, hw * 1.5, R * 5.4, hw * 1.2, R * 4.4, hw * 1.2); g.closePath(); g.fill();
    // knuckles and tendons, lightly
    g.strokeStyle = "rgba(90,45,25,0.16)"; g.lineWidth = R * 0.05; g.lineCap = "round";
    for (let i = 0; i < 4; i++) { const y = -hw * 0.95 + i * hw * 0.58; g.beginPath(); g.moveTo(R * 2.2, y * 0.8); g.lineTo(R * 5.4, y * 1.05); g.stroke(); g.beginPath(); g.arc(R * 5.9, y * 1.08, R * 0.16, 0, TAU); g.stroke(); }
    g.beginPath(); g.arc(R * 0.2, -hw * 0.72, R * 0.2, 0, TAU); g.strokeStyle = "rgba(255,240,225,0.25)"; g.stroke();   // the wrist bone
    if (opts.ring) { g.save(); g.translate(R * 6.6, hw * 0.62); g.rotate(0.12); g.fillStyle = metalLin(g, 0, -R * 0.4, 0, R * 0.4, "gold"); rr(g, -R * 0.14, -R * 0.36, R * 0.28, R * 0.72, R * 0.08); g.fill(); g.fillStyle = METAL.gold[2]; g.beginPath(); g.ellipse(0, 0, R * 0.19, R * 0.24, 0, 0, TAU); g.fill(); g.restore(); }
    // the watch, lying across the wrist
    if (w) {
      g.save(); g.fillStyle = "rgba(40,15,5,0.35)"; g.filter = "blur(" + (R * 0.12) + "px)"; g.beginPath(); g.ellipse(R * 0.08, R * 0.1, R * 1.12, R * 1.2, 0, 0, TAU); g.fill(); g.filter = "none"; g.restore();
      g.save(); g.beginPath(); g.rect(-R * 1.6, -hw * 1.02, R * 3.2, hw * 2.04); g.clip();
      draw(g, w, 0, 0, R, t, { strap: 1.42 });
      // the strap curves away round the wrist
      const cv = g.createLinearGradient(0, -hw, 0, hw); cv.addColorStop(0, "rgba(0,0,0,0.62)"); cv.addColorStop(0.16, "rgba(0,0,0,0)"); cv.addColorStop(0.84, "rgba(0,0,0,0)"); cv.addColorStop(1, "rgba(0,0,0,0.62)");
      const G = geom(w, R), sw = ((w.look.strap || {}).type === "integrated" ? R * 0.66 : G.lug * 0.9); g.fillStyle = cv; g.fillRect(-sw, -hw * 1.02, sw * 2, hw * 0.3); g.fillRect(-sw, hw * 0.72, sw * 2, hw * 0.3);
      g.restore();
    }
    // the sleeve, and the cuff with its link
    const sl = opts.sleeve || "bare";
    if (sl !== "bare") {
      const x1 = -R * (w ? 1.55 : 1.2);
      if (sl === "suit") {
        const cf = g.createLinearGradient(0, -hw * 1.3, 0, hw * 1.3); cf.addColorStop(0, "#b9bdc4"); cf.addColorStop(0.4, "#ffffff"); cf.addColorStop(1, "#aab0b8");
        g.fillStyle = cf; g.beginPath(); g.moveTo(-W, -hw * 1.3); g.lineTo(x1, -hw * 1.2); g.quadraticCurveTo(x1 + R * 0.14, 0, x1, hw * 1.2); g.lineTo(-W, hw * 1.3); g.closePath(); g.fill();
        g.strokeStyle = "rgba(0,0,0,0.14)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x1 - R * 0.12, -hw * 1.18); g.quadraticCurveTo(x1 + R * 0.02, 0, x1 - R * 0.12, hw * 1.18); g.stroke();
        if (opts.cufflinks) { g.save(); g.translate(x1 - R * 0.32, hw * 0.86); g.fillStyle = metalLin(g, -R * 0.14, -R * 0.14, R * 0.14, R * 0.14, opts.cufflinks === "gold" ? "gold" : "steel"); g.beginPath(); g.arc(0, 0, R * 0.14, 0, TAU); g.fill(); g.fillStyle = opts.cufflinks === "gold" ? "#0c0d10" : METAL.steel[2]; g.beginPath(); g.arc(0, 0, R * 0.075, 0, TAU); g.fill(); g.restore(); }
      }
      const x2 = sl === "suit" ? x1 - R * 0.62 : x1, sc = opts.sleeveC || (sl === "suit" ? "#1b2233" : "#e9ecf0");
      const sg = g.createLinearGradient(0, -hw * 1.5, 0, hw * 1.5); sg.addColorStop(0, mix(sc, "#000000", 0.55)); sg.addColorStop(0.35, mix(sc, "#ffffff", 0.1)); sg.addColorStop(0.6, sc); sg.addColorStop(1, mix(sc, "#000000", 0.6));
      g.fillStyle = sg; g.beginPath(); g.moveTo(-W, -hw * 1.62); g.lineTo(x2, -hw * 1.42); g.quadraticCurveTo(x2 + R * 0.2, 0, x2, hw * 1.42); g.lineTo(-W, hw * 1.62); g.closePath(); g.fill();
      // the weave, and the cuff buttons of a jacket
      g.save(); g.clip(); g.globalAlpha = 0.07; g.strokeStyle = "#fff"; g.lineWidth = 1; for (let x = -W; x < x2; x += 5) { g.beginPath(); g.moveTo(x, -hw * 1.7); g.lineTo(x + hw * 0.6, hw * 1.7); g.stroke(); } g.restore();
      if (sl === "suit") for (let i = 0; i < 3; i++) { g.fillStyle = "#0c0f18"; g.beginPath(); g.arc(x2 - R * (0.5 + i * 0.42), hw * 1.02, R * 0.11, 0, TAU); g.fill(); g.fillStyle = "rgba(255,255,255,0.14)"; g.beginPath(); g.arc(x2 - R * (0.53 + i * 0.42), hw * 0.99, R * 0.04, 0, TAU); g.fill(); }
    }
    g.restore();
    return { cx: cx, cy: cy, R: R };
  }

  // ---- bottles ---------------------------------------------------------------------------------------------------------------------------------------------------
  function bottle(g, f, cx, cy, h) {
    const B = f.bottle || ["block", "#ddd", "#222"], shape = B[0], glass = B[1], cap = B[2], c1 = f.col[0], c2 = f.col[1];
    g.save(); g.translate(cx, cy);
    const bw = h * ({ block: 0.56, flask: 0.62, round: 0.6, column: 0.36, can: 0.3, dome: 0.5 }[shape] || 0.5), bh = h * (shape === "can" ? 0.84 : shape === "column" ? 0.74 : 0.66), top = h / 2 - bh;
    // a soft pool of its colour underneath
    g.save(); g.translate(0, h / 2); g.scale(1, 0.22); const pool = g.createRadialGradient(0, 0, 2, 0, 0, h * 0.6); pool.addColorStop(0, c1 + "77"); pool.addColorStop(1, c1 + "00"); g.fillStyle = pool; g.beginPath(); g.arc(0, 0, h * 0.6, 0, 7); g.fill(); g.restore();
    const body = () => {
      if (shape === "round") { g.beginPath(); g.ellipse(0, top + bh / 2, bw / 2, bh / 2, 0, 0, TAU); }
      else if (shape === "flask") { g.beginPath(); g.moveTo(-bw * 0.2, top); g.bezierCurveTo(-bw * 0.62, top + bh * 0.1, -bw * 0.56, top + bh * 0.9, -bw * 0.44, top + bh); g.lineTo(bw * 0.44, top + bh); g.bezierCurveTo(bw * 0.56, top + bh * 0.9, bw * 0.62, top + bh * 0.1, bw * 0.2, top); g.closePath(); }
      else if (shape === "dome") { g.beginPath(); g.moveTo(-bw / 2, top + bh); g.lineTo(-bw / 2, top + bh * 0.42); g.bezierCurveTo(-bw / 2, top - bh * 0.02, bw / 2, top - bh * 0.02, bw / 2, top + bh * 0.42); g.lineTo(bw / 2, top + bh); g.closePath(); }
      else rr(g, -bw / 2, top, bw, bh, shape === "can" ? bw * 0.18 : shape === "column" ? bw * 0.14 : h * 0.035);
    };
    g.save(); g.shadowColor = "rgba(0,0,0,0.5)"; g.shadowBlur = h * 0.06; g.shadowOffsetY = h * 0.02; body(); g.fillStyle = glass; g.fill(); g.restore();
    g.save(); body(); g.clip();
    if (shape !== "can") {
      // the juice, seen through the glass when the glass is clear enough
      const clear = lum(glass) > 0.55; const jg = g.createLinearGradient(0, top, 0, top + bh); jg.addColorStop(0, clear ? c2 : mix(glass, c2, 0.25)); jg.addColorStop(1, clear ? c1 : mix(glass, c1, 0.35));
      g.fillStyle = jg; g.globalAlpha = clear ? 0.85 : 0.6; g.fillRect(-bw, top + bh * 0.1, bw * 2, bh); g.globalAlpha = 1;
      g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(-bw, top + bh * 0.1, bw * 2, h * 0.008);
    } else { const sg = g.createLinearGradient(-bw / 2, 0, bw / 2, 0); sg.addColorStop(0, "rgba(255,255,255,0.05)"); sg.addColorStop(0.3, "rgba(255,255,255,0.25)"); sg.addColorStop(1, "rgba(0,0,0,0.4)"); g.fillStyle = sg; g.fillRect(-bw, top, bw * 2, bh); g.fillStyle = cap; g.fillRect(-bw, top + bh * 0.62, bw * 2, bh * 0.05); }
    // glass: a bright edge, a dark edge, a thick base
    const eg = g.createLinearGradient(-bw / 2, 0, bw / 2, 0); eg.addColorStop(0, "rgba(255,255,255,0.5)"); eg.addColorStop(0.1, "rgba(255,255,255,0.08)"); eg.addColorStop(0.22, "rgba(255,255,255,0.28)"); eg.addColorStop(0.3, "rgba(255,255,255,0)"); eg.addColorStop(0.86, "rgba(0,0,0,0)"); eg.addColorStop(1, "rgba(0,0,0,0.35)");
    g.fillStyle = eg; g.fillRect(-bw, top, bw * 2, bh);
    if (shape !== "can") { g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-bw, top + bh * 0.93, bw * 2, bh * 0.07); }
    g.restore();
    // the label
    const dark = lum(glass) < 0.5, ink = shape === "can" ? "#f2f2ee" : dark ? "#f2efe6" : "#17181b";
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = ink;
    const ly = top + bh * (shape === "can" ? 0.3 : 0.52);
    if (!dark && shape !== "can" && shape !== "round") { g.fillStyle = "rgba(255,255,255,0.82)"; rr(g, -bw * 0.36, ly - bh * 0.16, bw * 0.72, bh * 0.32, 2); g.fill(); g.fillStyle = "#17181b"; }
    g.font = "600 " + Math.max(7, h * 0.036) + "px " + SERIF; g.fillText(f.house.toUpperCase(), 0, ly - bh * 0.07, bw * 0.66);
    g.font = "500 " + Math.max(8, h * 0.05) + "px " + SERIF; g.fillText(f.name.split(" ").slice(0, 3).join(" "), 0, ly + bh * 0.05, bw * 0.66);
    // neck, collar and cap
    if (shape !== "can") {
      g.fillStyle = metalLin(g, -bw * 0.1, 0, bw * 0.1, 0, "steel"); g.fillRect(-h * 0.045, top - h * 0.05, h * 0.09, h * 0.06);
      const cw = h * (shape === "dome" ? 0.16 : shape === "block" ? 0.24 : 0.17), chh = h * (shape === "dome" ? 0.2 : 0.2), cg = g.createLinearGradient(-cw / 2, 0, cw / 2, 0);
      cg.addColorStop(0, mix(cap, "#ffffff", 0.45)); cg.addColorStop(0.3, cap); cg.addColorStop(0.7, mix(cap, "#000000", 0.35)); cg.addColorStop(1, mix(cap, "#ffffff", 0.12));
      g.fillStyle = cg; g.save(); g.shadowColor = "rgba(0,0,0,0.4)"; g.shadowBlur = h * 0.03;
      if (shape === "dome") { g.beginPath(); g.moveTo(-cw / 2, top - h * 0.05); g.lineTo(-cw * 0.3, top - h * 0.05 - chh); g.lineTo(cw * 0.3, top - h * 0.05 - chh); g.lineTo(cw / 2, top - h * 0.05); g.closePath(); g.fill(); }
      else { rr(g, -cw / 2, top - h * 0.05 - chh, cw, chh, h * 0.012); g.fill(); }
      g.restore();
    } else { g.fillStyle = "#1c1d20"; rr(g, -bw * 0.34, top - h * 0.1, bw * 0.68, h * 0.11, h * 0.02); g.fill(); g.fillStyle = cap; g.fillRect(-bw * 0.1, top - h * 0.13, bw * 0.2, h * 0.04); }
    g.restore();
  }

  window.LuxWatch = { draw: draw, wrist: wrist, bottle: bottle, mix: mix, clear: () => cache.clear() };
})();
