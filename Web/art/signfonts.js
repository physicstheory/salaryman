// SignFonts: every shop sign, blade sign, billboard and advert picks its own typeface and lettering treatment, so no
// two signs on a street look the same. The faces are open-licence fonts (OFL / Apache) bundled in art/signfonts/,
// built by Tools/fonts/build_sign_fonts.py; art/signfonts/fonts.js lists them.
//
//   const st = SignFonts.style("ramen|Kanda 12", { text: "ラーメン", mood: "food" });
//   g.font = SignFonts.font(st, 48);                       // or let SignFonts fit and draw it:
//   SignFonts.panel(g, x, y, w, h, st, bg, ink);            // the sign board behind the letters (border, bands, gradient...)
//   SignFonts.text(g, "ラーメン", cx, cy, st, ink, bg, 64, maxWidth);
//   SignFonts.vertical(g, "居酒屋", cx, top, bottom, st, ink, bg, 48);
//
// The same seed always gives the same style, so a chain keeps its logo face (seed it with the brand) while an
// independent shop gets its own (seed it with its name and place). SignFonts.ready resolves once the faces are in.
(function () {
  "use strict";
  const LIST = (window.SIGN_FONT_LIST || []).slice();
  const FALLBACK = "'Konto Sans','Zen Kaku Gothic New','Hiragino Kaku Gothic ProN','Yu Gothic','Noto Sans JP',Meiryo,sans-serif";
  const me = document.currentScript && document.currentScript.src;
  const base = me ? me.replace(/[^/]*$/, "") + "signfonts/" : "art/signfonts/";

  // ---- loading ---------------------------------------------------------------------------------------------------
  const loaded = new Set();
  const ready = (typeof FontFace === "function" && document.fonts) ? Promise.all(LIST.map(f => {
    try {
      const face = new FontFace(f.family, "url(" + base + f.file + ") format('woff2')", { weight: "100 900", display: "block" });
      document.fonts.add(face);
      return face.load().then(() => { loaded.add(f.id); }, () => {});
    } catch (e) { return Promise.resolve(); }
  })).then(() => loaded.size) : Promise.resolve(0);

  // ---- the moods a shop's name suggests, and which genres of face suit them --------------------------------------
  const MOODS = {
    food:     ["brush", "traditional", "heavy", "pop", "hand"],
    izakaya:  ["brush", "traditional", "mincho", "hand"],
    night:    ["script", "neon", "elegant", "retro", "deco"],
    play:     ["pop", "display", "neon", "pixel", "heavy", "tech"],
    medical:  ["gothic", "round", "corporate"],
    office:   ["corporate", "gothic", "mincho", "condensed"],
    beauty:   ["elegant", "script", "round", "cute"],
    shop:     ["pop", "round", "gothic", "display", "condensed", "heavy"],
    retro:    ["retro", "mincho", "outline", "slab", "deco"],
    tech:     ["tech", "display", "condensed", "corporate", "pixel"],
    any:      null
  };
  const MOOD_WORDS = [
    [/ラーメン|らーめん|うどん|そば|蕎麦|寿司|鮨|焼肉|焼鳥|やきとり|定食|丼|弁当|中華|餃子|カレー|食堂|ramen|sushi|udon|soba|curry|grill|bbq|noodle|diner|kitchen/i, "food"],
    [/居酒屋|酒|呑|処|亭|屋台|izakaya|sake/i, "izakaya"],
    [/スナック|バー|BAR|パブ|ラウンジ|クラブ|ホテル|lounge|club|pub|hotel|night|love/i, "night"],
    [/カラオケ|パチンコ|麻雀|ゲーム|ゲーセン|漫画|まんが|アニメ|arcade|game|karaoke|pachinko|manga/i, "play"],
    [/クリニック|歯科|内科|外科|皮膚科|眼科|薬局|薬|整体|鍼|灸|病院|clinic|dental|pharmacy|medical/i, "medical"],
    [/不動産|税理士|司法|法律|銀行|保険|生命|証券|会計|事務所|学習塾|塾|英会話|予備校|bank|insurance|law|realty|school/i, "office"],
    [/美容|ヘア|サロン|エステ|ネイル|花|フラワー|salon|beauty|hair|nail|flower|spa/i, "beauty"],
    [/喫茶|珈琲|コーヒー|純喫茶|質|古書|書店|骨董|cafe|coffee|kissa|antique|books/i, "retro"],
    [/電気|カメラ|スマホ|携帯|PC|パソコン|camera|phone|tech|electric|digital/i, "tech"]
  ];
  function moodOf(text) { for (const [re, m] of MOOD_WORDS) if (re.test(text || "")) return m; return "any"; }
  const hasCJK = t => /[　-ヿ㐀-鿿＀-￯]/.test(t || "");

  // ---- deterministic randomness from a seed --------------------------------------------------------------------------
  function hash(s) { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = hash(seed) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pickW = (r, items, w) => { let tot = 0; for (const x of w) tot += x; let k = r() * tot; for (let i = 0; i < items.length; i++) { k -= w[i]; if (k <= 0) return items[i]; } return items[items.length - 1]; };

  const TREATMENTS = ["flat", "outline", "shadow", "neon", "emboss", "inline", "extrude", "flat", "outline", "shadow"];
  const PANELS = ["solid", "border", "double", "bands", "gradient", "rounded", "frame", "solid", "border", "stripe", "plate"];
  const recent = [];   // the last few faces handed out, so neighbours rarely share one even with nearby seeds

  function style(seed, opts) {
    opts = opts || {};
    const r = rng(seed);
    const text = opts.text || "";
    const needJP = opts.script === "jp" || (opts.script !== "latin" && hasCJK(text));
    const mood = opts.mood || moodOf(text + " " + (opts.hint || ""));
    const want = MOODS[mood] || null;
    let pool = LIST.filter(f => !needJP || f.script === "jp");
    if (!pool.length) pool = LIST.slice();
    const weights = pool.map(f => {
      let w = 1;
      if (want) for (const g of f.genres) if (want.includes(g)) w += 2.2;
      if (opts.avoid && opts.avoid.some(g => f.genres.includes(g))) w *= 0.15;
      if (opts.prefer && opts.prefer.some(g => f.genres.includes(g))) w *= 3;
      if (recent.includes(f.id) && !opts.stable) w *= 0.2;
      return w;
    });
    const f = pool.length ? pickW(r, pool, weights) : null;
    if (f && !opts.stable) { recent.push(f.id); if (recent.length > 6) recent.shift(); }
    const neonish = f && (f.genres.includes("neon") || f.genres.includes("script"));
    const treatment = opts.treatment || (neonish && r() < 0.6 ? "neon" : TREATMENTS[(r() * TREATMENTS.length) | 0]);
    return {
      id: f ? f.id : "fallback",
      family: f ? "'" + f.family + "'," + FALLBACK : FALLBACK,
      weight: f ? f.weight : 800,
      script: f ? f.script : "jp",
      genres: f ? f.genres : [],
      treatment,
      panel: opts.panel || PANELS[(r() * PANELS.length) | 0],
      tracking: f && f.genres.includes("condensed") ? 0.06 : (r() < 0.25 ? 0.12 : 0),
      skew: f && f.genres.includes("script") ? 0 : (r() < 0.12 ? -0.18 : 0),
      upper: f && f.script === "latin" && !f.genres.includes("script") && r() < 0.7,
      seed: hash(seed)
    };
  }

  function font(st, px) { return (st.weight || 400) + " " + Math.max(1, Math.round(px)) + "px " + st.family; }

  // Width of a run of text in a style, tracking included.
  function measure(g, text, st, px) {
    g.font = font(st, px);
    const t = st.upper ? text.toUpperCase() : text;
    return g.measureText(t).width + (st.tracking ? st.tracking * px * Math.max(0, [...t].length - 1) : 0);
  }
  function fit(g, text, st, px, maxW, minPx) {
    let s = px; const lo = minPx || 8;
    while (s > lo && measure(g, text, st, s) > maxW) s *= 0.95;
    return s;
  }

  // ---- colour helpers ---------------------------------------------------------------------------------------------
  function rgb(c) {
    if (!c || c[0] !== "#") return [255, 255, 255];
    const n = parseInt(c.length === 4 ? c.slice(1).split("").map(x => x + x).join("") : c.slice(1, 7), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  const lum = c => { const [r, g, b] = rgb(c); return r * 0.3 + g * 0.59 + b * 0.11; };
  const shade = (c, k) => { const [r, g, b] = rgb(c); const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))); return "rgb(" + f(r) + "," + f(g) + "," + f(b) + ")"; };

  // ---- the board behind the letters --------------------------------------------------------------------------------
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function panel(g, x, y, w, h, st, bg, ink) {
    const m = Math.min(w, h);
    g.save();
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    switch (st.panel) {
      case "border": g.strokeStyle = ink; g.globalAlpha = 0.9; g.lineWidth = Math.max(2, m * 0.05); g.strokeRect(x + m * 0.07, y + m * 0.07, w - m * 0.14, h - m * 0.14); break;
      case "double": g.strokeStyle = ink; g.lineWidth = Math.max(1.5, m * 0.025); g.strokeRect(x + m * 0.05, y + m * 0.05, w - m * 0.1, h - m * 0.1); g.strokeRect(x + m * 0.11, y + m * 0.11, w - m * 0.22, h - m * 0.22); break;
      case "bands": g.fillStyle = shade(bg, lum(bg) > 140 ? -0.35 : 0.3); g.fillRect(x, y, w, h * 0.1); g.fillRect(x, y + h * 0.9, w, h * 0.1); break;
      case "gradient": { const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, shade(bg, 0.28)); gr.addColorStop(0.55, bg); gr.addColorStop(1, shade(bg, -0.35)); g.fillStyle = gr; g.fillRect(x, y, w, h); break; }
      case "rounded": g.fillStyle = shade(bg, -0.45); g.fillRect(x, y, w, h); g.fillStyle = bg; roundRect(g, x + m * 0.06, y + m * 0.06, w - m * 0.12, h - m * 0.12, m * 0.2); g.fill(); break;
      case "frame": g.fillStyle = "#2a2a2c"; g.fillRect(x, y, w, h); g.fillStyle = bg; g.fillRect(x + m * 0.08, y + m * 0.08, w - m * 0.16, h - m * 0.16);
        g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(x + m * 0.08, y + m * 0.08, w - m * 0.16, Math.max(1, m * 0.03)); break;
      case "stripe": g.fillStyle = ink; g.globalAlpha = 0.85; if (w > h) { g.fillRect(x, y + h * 0.82, w, h * 0.06); } else { g.fillRect(x + w * 0.82, y, w * 0.06, h); } break;
      case "plate": { const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, shade(bg, 0.18)); gr.addColorStop(0.5, bg); gr.addColorStop(1, shade(bg, -0.2)); g.fillStyle = gr; g.fillRect(x, y, w, h);
        g.fillStyle = shade(bg, -0.5); for (const [px, py] of [[0.04, 0.12], [0.96, 0.12], [0.04, 0.88], [0.96, 0.88]]) { g.beginPath(); g.arc(x + w * px, y + h * py, Math.max(1.5, m * 0.035), 0, 7); g.fill(); } break; }
      default: break;
    }
    g.restore();
  }

  // ---- lettering -----------------------------------------------------------------------------------------------------
  // Draw one run with tracking (canvas has no letter-spacing everywhere, so track by hand when asked).
  function run(g, t, x, y, st, px, mode) {
    const chars = [...t];
    if (!st.tracking) { mode === "stroke" ? g.strokeText(t, x, y) : g.fillText(t, x, y); return; }
    const tr = st.tracking * px, total = g.measureText(t).width + tr * (chars.length - 1);
    const align = g.textAlign; let cx = align === "center" ? x - total / 2 : align === "right" || align === "end" ? x - total : x;
    g.textAlign = "left";
    for (const ch of chars) { mode === "stroke" ? g.strokeText(ch, cx, y) : g.fillText(ch, cx, y); cx += g.measureText(ch).width + tr; }
    g.textAlign = align;
  }
  function text(g, str, x, y, st, ink, bg, px, maxW) {
    if (!str) return px;
    const t = st.upper ? str.toUpperCase() : str;
    if (maxW) px = fit(g, t, st, px, maxW);
    g.save();
    g.font = font(st, px);
    if (st.skew) { g.translate(x, y); g.transform(1, 0, st.skew, 1, 0, 0); x = 0; y = 0; }
    const contrast = lum(ink) > 140 ? "#121214" : "#ffffff";
    g.lineJoin = "round";
    switch (st.treatment) {
      case "outline": g.strokeStyle = lum(bg) > 140 === lum(ink) > 140 ? contrast : bg; g.lineWidth = Math.max(2, px * 0.12); run(g, t, x, y, st, px, "stroke"); g.fillStyle = ink; run(g, t, x, y, st, px); break;
      case "shadow": g.fillStyle = "rgba(0,0,0,0.45)"; run(g, t, x + px * 0.06, y + px * 0.07, st, px); g.fillStyle = ink; run(g, t, x, y, st, px); break;
      case "neon": g.shadowColor = ink; g.shadowBlur = px * 0.35; g.fillStyle = ink; run(g, t, x, y, st, px); g.shadowBlur = px * 0.12; g.fillStyle = shade(ink, 0.65); run(g, t, x, y, st, px); break;
      case "emboss": g.fillStyle = shade(bg, -0.55); run(g, t, x + px * 0.03, y + px * 0.04, st, px); g.fillStyle = shade(bg, 0.5); run(g, t, x - px * 0.02, y - px * 0.025, st, px); g.fillStyle = ink; run(g, t, x, y, st, px); break;
      case "inline": g.strokeStyle = ink; g.lineWidth = Math.max(2, px * 0.16); run(g, t, x, y, st, px, "stroke"); g.fillStyle = bg; run(g, t, x, y, st, px); g.strokeStyle = ink; g.lineWidth = Math.max(1, px * 0.03); run(g, t, x, y, st, px, "stroke"); break;
      case "extrude": { const d = shade(ink, -0.6); g.fillStyle = d; for (let k = Math.max(2, Math.round(px * 0.08)); k > 0; k--) run(g, t, x + k * 0.8, y + k, st, px); g.fillStyle = ink; run(g, t, x, y, st, px); break; }
      default: g.fillStyle = ink; run(g, t, x, y, st, px);
    }
    g.restore();
    return px;
  }
  // Japanese blade signs read top to bottom; long-vowel marks and dashes turn on their side, as they do in print.
  const TURN = /[ーー〜～—―…‥\-–()（）「」『』【】〈〉《》]/;
  function vertical(g, str, cx, top, bottom, st, ink, bg, px) {
    const chars = [...(str || "")];
    if (!chars.length) return px;
    const step = (bottom - top) / chars.length;
    px = Math.min(px, step * 0.92);
    const st1 = Object.assign({}, st, { tracking: 0, skew: 0 });
    g.save(); g.textAlign = "center"; g.textBaseline = "middle";
    chars.forEach((ch, i) => {
      const y = top + step * (i + 0.5);
      if (TURN.test(ch)) { g.save(); g.translate(cx, y); g.rotate(Math.PI / 2); text(g, ch, 0, 0, st1, ink, bg, px); g.restore(); }
      else text(g, ch, cx, y, st1, ink, bg, px);
    });
    g.restore();
    return px;
  }

  window.SignFonts = { ready, style, font, fit, measure, panel, text, vertical, moodOf, list: LIST, loaded, FALLBACK, hash };
})();
