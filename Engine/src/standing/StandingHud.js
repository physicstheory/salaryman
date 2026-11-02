// The standing HUD: how honor and respect changes are shown.
//
// Each change is a mark that slides in on the right, under the wanted stars: an emblem with the deed's icon in it,
// the sign and the amount, and what it was for. Honor uses a round seal; respect uses a lozenge, so the two read
// apart at a glance. A loss of honor is red with a minus, a gain is warm gold with a plus; respect is silver-blue.
// Under the marks a slim double meter shows where both stand now, and fades when nothing has changed for a while.
// card() shows the full standing (tiers, rank, the last few deeds) while the host holds it open.
//
// Pure DOM and inline SVG, no textures: it sits over the picture and costs nothing to draw.

const SVG = (body) => '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">' + body + "</svg>";
const P = (d, extra) => '<path d="' + d + '" fill="currentColor" ' + (extra || "") + "/>";
const S = (d, w) => '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round"/>';

// Icons, drawn for this game: line work in the emblem's colour.
export const STANDING_ICONS = {
  gun: SVG(P("M3 8h15l1-1h2v3h-3l-1 1h-4l-1 2h-2l-1 4H5l1.5-6H3z")),
  shooting: SVG(S("M12 3v4M12 17v4M3 12h4M17 12h4") + '<circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/>'),
  killing: SVG(P("M12 3c-4.4 0-7.5 3-7.5 7 0 2.3 1 4 2.5 5v3h10v-3c1.5-1 2.5-2.7 2.5-5 0-4-3.1-7-7.5-7zM9 9.5a1.7 1.7 0 110 3.4 1.7 1.7 0 010-3.4zm6 0a1.7 1.7 0 110 3.4 1.7 1.7 0 010-3.4zM10 19h1.2v2H10zm2.8 0H14v2h-1.2z")),
  car: SVG(P("M5 11l1.8-4.2A2 2 0 018.6 5.6h6.8a2 2 0 011.8 1.2L19 11a2 2 0 011.5 2v4h-2v1.5h-2.5V17h-8v1.5H5.5V17h-2v-4A2 2 0 015 11zm2.2 0h9.6l-1.3-3.2H8.5zM6.5 13.2a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4zm11 0a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z")),
  knockdown: SVG(P("M3 13l1.5-3.5A2 2 0 016.3 8.3h5.4a2 2 0 011.8 1.2L15 13v4h-2v1.2h-2V17H6v1.2H4V17H3z") + S("M18 6l3 3M21 6l-3 3", 1.8)),
  alarm: SVG(P("M12 3a1.4 1.4 0 011.4 1.4v.7A6 6 0 0118 11v4l2 2.5H4L6 15v-4a6 6 0 014.6-5.9v-.7A1.4 1.4 0 0112 3zm-2 16h4a2 2 0 01-4 0z")),
  robbery: SVG('<text x="12" y="18.5" text-anchor="middle" font-size="17" font-weight="800" font-family="Arial,Helvetica,sans-serif" fill="currentColor">¥</text>'),
  menace: SVG(P("M12 2l10 18H2zm-1 6v6h2V8zm0 8v2h2v-2z")),
  escape: SVG(P("M13.5 5.5a2 2 0 110-4 2 2 0 010 4zM9.8 8.4l3.4-1.2c.7-.2 1.4.1 1.8.7l1.6 2.7 2.9.9-.6 1.9-3.6-1.1-.9-1.4-1.1 3.6 2.4 2.3V22h-2v-4.2l-2.7-2.4-1 3.9H6.5l1.9-7.6-1.6.6V15H4.8v-4.2z")),
  harass: SVG(S("M4 12h4l2-5 4 10 2-5h4", 2.2)),
  help: SVG(P("M12 20.5l-1.3-1.2C5.9 15 3 12.4 3 9.2 3 6.6 5 4.5 7.6 4.5c1.5 0 3 .7 4.4 2 1.4-1.3 2.9-2 4.4-2C19 4.5 21 6.6 21 9.2c0 3.2-2.9 5.8-7.7 10.1z")),
  wallet: SVG(P("M4 7h14a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2zm11 6.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM5 4h11v2H5z")),
  keep: SVG(P("M4 7h14a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z") + S("M7 10l8 7M15 10l-8 7", 1.8)),
  directions: SVG(P("M11 2h2v3h6l2 2.5-2 2.5h-6v2h-2v-2H5L3 7.5 5 5h6zM11 14h2v8h-2z")),
  fare: SVG(P("M3 6h18v12H3zm2 2v8h14V8zm7 1.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z")),
  shopping: SVG(P("M6 8h12l-1 12H7zm3-1a3 3 0 016 0h-1.6a1.4 1.4 0 00-2.8 0z")),
  escort: SVG(P("M8 4.5a2 2 0 110 4 2 2 0 010-4zm8 0a2 2 0 110 4 2 2 0 010-4zM6 10h4l1 5-1.5.4V21H7.5v-5.6L6 15zm8 0h4l1 4.6-1.5.4.5 6h-2v-5.6L15 15z")),
  service: SVG(P("M5 4h14v4H5zm1 6h12v10H6zm3 2v6h2v-6zm4 0v6h2v-6z")),
  broken: SVG(S("M6 6l12 12M18 6L6 18", 2.4)),
  story: SVG(P("M6 3h12v18l-6-4-6 4z")),
  bow: SVG('<circle cx="15.5" cy="6" r="2.4" fill="currentColor"/>' + S("M14.5 9L8 12.5M9.2 11.8L9 21M9 16l3.5 5", 2.4)),
  ignored: SVG('<circle cx="15.5" cy="6" r="2.4" fill="currentColor"/>' + S("M14.5 9L8 12.5M9.2 11.8L9 21", 2.4) + S("M18 13h4", 2)),
  returned: SVG('<circle cx="7" cy="6" r="2" fill="currentColor"/><circle cx="17" cy="6" r="2" fill="currentColor"/>' + S("M8 8.5l2.5 3.5M16 8.5l-2.5 3.5M10.2 12v8M13.8 12v8", 2.2)),
  antagonize: SVG(P("M13 2L5 13h5l-1 9 8-11h-5z")),
  stare: SVG(P("M12 6c5 0 8.5 4 9.5 6-1 2-4.5 6-9.5 6s-8.5-4-9.5-6c1-2 4.5-6 9.5-6zm0 2.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z")),
  promotion: SVG(S("M6 13l6-6 6 6M6 19l6-6 6 6", 2.4)),
  demotion: SVG(S("M6 5l6 6 6-6M6 11l6 6 6-6", 2.4)),
  respect: SVG(P("M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z")),
  disrespect: SVG(P("M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z", 'opacity=".45"') + S("M5 19L19 5", 2))
};

const CSS = `
#stndg { position: fixed; top: 122px; right: calc(20px + env(safe-area-inset-right, 0px)); z-index: 31; width: 280px; pointer-events: none;
  display: flex; flex-direction: column; align-items: flex-end; gap: 6px; font-family: 'Konto Sans', 'Segoe UI', Arial, sans-serif; }
#stndg .mk { display: flex; align-items: center; gap: 9px; padding: 5px 12px 5px 6px; border-radius: 3px;
  background: linear-gradient(90deg, rgba(8,9,12,0) 0%, rgba(8,9,12,0.62) 26%, rgba(8,9,12,0.78) 100%);
  transform: translateX(26px); opacity: 0; transition: transform 260ms cubic-bezier(.2,.8,.2,1), opacity 260ms; }
#stndg .mk.in { transform: none; opacity: 1; }
#stndg .mk.out { opacity: 0; transform: translateX(14px); transition-duration: 500ms; }
#stndg .em { position: relative; width: 30px; height: 30px; flex: none; display: grid; place-items: center; }
#stndg .em i { width: 17px; height: 17px; display: block; position: relative; z-index: 1; }
#stndg .em::before { content: ""; position: absolute; inset: 0; border-radius: 50%; border: 2px solid currentColor; background: rgba(0,0,0,0.35); }
#stndg .mk.resp .em::before { border-radius: 2px; transform: rotate(45deg) scale(0.78); }
#stndg .amt { font-weight: 800; font-size: 19px; letter-spacing: 0.5px; min-width: 40px; text-align: right; font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
#stndg .txt { display: flex; flex-direction: column; text-align: right; max-width: 170px; }
#stndg .txt b { color: #f3f1ec; font-size: 13px; font-weight: 600; line-height: 1.15; text-shadow: 0 1px 2px #000; }
#stndg .txt span { color: rgba(243,241,236,0.62); font-size: 10.5px; letter-spacing: 1.2px; text-transform: uppercase; margin-top: 1px; }
#stndg .mk.hl { color: #e3252d; } #stndg .mk.hl .em::before { background: rgba(120,6,10,0.55); }
#stndg .mk.hg { color: #f0c76a; }
#stndg .mk.rg { color: #b9d4ec; } #stndg .mk.rl { color: #8c96a3; }
#stndg .tier { color: #f3f1ec; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; padding: 4px 10px; border-radius: 2px;
  background: rgba(8,9,12,0.78); border-right: 3px solid currentColor; opacity: 0; transition: opacity 300ms; }
#stndg .tier.in { opacity: 1; }
#stndgm { position: fixed; top: 78px; right: calc(20px + env(safe-area-inset-right, 0px)); z-index: 31; width: 130px; pointer-events: none;
  opacity: 0; transition: opacity 600ms; display: flex; flex-direction: column; gap: 4px; }
#stndgm.on { opacity: 1; }
#stndgm .bar { position: relative; height: 5px; background: rgba(0,0,0,0.58); box-shadow: 0 0 0 1px rgba(0,0,0,0.45); }
#stndgm .bar b { position: absolute; top: 0; bottom: 0; transition: left 400ms, width 400ms, background 400ms; }
#stndgm .bar.h::after { content: ""; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: rgba(255,255,255,0.55); }
#stndgm .bar.h b.pos { background: linear-gradient(90deg, #c99a3e, #f0c76a); }
#stndgm .bar.h b.neg { background: linear-gradient(90deg, #e3252d, #9a1418); }
#stndgm .bar.r b { left: 0; background: linear-gradient(90deg, #6f8fae, #b9d4ec); }
#stndgm .lbl { display: flex; justify-content: space-between; font: 600 9px/1 'Konto Sans', Arial, sans-serif; letter-spacing: 1.5px; color: rgba(243,241,236,0.7);
  text-transform: uppercase; text-shadow: 0 1px 2px #000; }
#stndgc { position: fixed; right: calc(20px + env(safe-area-inset-right, 0px)); top: 112px; z-index: 32; width: 300px; pointer-events: none;
  background: rgba(8,9,12,0.86); border-left: 3px solid #f0c76a; padding: 14px 16px; color: #f3f1ec; font-family: 'Konto Sans', Arial, sans-serif;
  opacity: 0; transform: translateY(-6px); transition: opacity 200ms, transform 200ms; }
#stndgc.on { opacity: 1; transform: none; }
#stndgc h4 { margin: 0 0 2px; font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; color: rgba(243,241,236,0.6); font-weight: 600; }
#stndgc .big { font-size: 20px; font-weight: 700; margin-bottom: 2px; }
#stndgc .ln { font-size: 12px; color: rgba(243,241,236,0.72); margin-bottom: 10px; line-height: 1.3; }
#stndgc .bar { position: relative; height: 6px; background: rgba(255,255,255,0.1); margin: 4px 0 12px; }
#stndgc .bar b { position: absolute; top: 0; bottom: 0; }
#stndgc .hist { border-top: 1px solid rgba(255,255,255,0.12); padding-top: 8px; font-size: 12px; }
#stndgc .hist div { display: flex; justify-content: space-between; padding: 2px 0; color: rgba(243,241,236,0.8); }
#stndgc .hist em { font-style: normal; font-weight: 700; }
#stndgc .keys { margin-top: 10px; font-size: 11px; color: rgba(243,241,236,0.6); }
#stndgc .keys b { display: inline-block; min-width: 16px; padding: 1px 5px; margin-right: 4px; border: 1px solid rgba(255,255,255,0.4); border-radius: 3px; color: #fff; text-align: center; }
body.titleup #stndg, body.paused #stndg, body.cutscene #stndg, body.titleup #stndgm, body.paused #stndgm, body.cutscene #stndgm, body.camfull #stndg, body.camfull #stndgm { visibility: hidden; }
@media (max-width: 640px) { #stndg { width: 220px; top: 100px; } #stndg .txt { max-width: 120px; } }
`;

const fmt = (d) => (d > 0 ? "+" : "−") + (Math.abs(d) >= 10 || Math.abs(d) % 1 === 0 ? Math.round(Math.abs(d)) : Math.abs(d).toFixed(1));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export class StandingHud {
  constructor(opts) {
    opts = opts || {};
    this.doc = opts.document || (typeof document !== "undefined" ? document : null);
    this.icons = Object.assign({}, STANDING_ICONS, opts.icons || {});
    this.max = opts.max || 4;
    this.hold = opts.hold || 4.2;
    this.root = this.meterEl = this.cardEl = null;
    this.meterT = 0;
  }

  mount() {
    const d = this.doc;
    if (!d || this.root) return this;
    const st = d.createElement("style"); st.id = "stndgcss"; st.textContent = CSS; d.head.appendChild(st);
    this.root = d.createElement("div"); this.root.id = "stndg"; d.body.appendChild(this.root);
    this.meterEl = d.createElement("div"); this.meterEl.id = "stndgm";
    this.meterEl.innerHTML = '<div class="lbl"><span>Honor</span><span class="hv"></span></div><div class="bar h"><b></b></div><div class="lbl"><span>Respect</span><span class="rv"></span></div><div class="bar r"><b></b></div>';
    d.body.appendChild(this.meterEl);
    this.cardEl = d.createElement("div"); this.cardEl.id = "stndgc"; d.body.appendChild(this.cardEl);
    return this;
  }

  // Show one change. ev: an event from Honor or Respect.
  push(ev) {
    if (!this.root || !ev || ev.silent || !ev.delta) return null;
    const d = this.doc, el = d.createElement("div");
    const honor = ev.kind === "honor", cls = honor ? (ev.delta < 0 ? "hl" : "hg") : (ev.delta < 0 ? "rl" : "rg");
    el.className = "mk " + cls + (honor ? "" : " resp");
    el.innerHTML = '<div class="em"><i>' + (this.icons[ev.icon] || this.icons[honor ? (ev.delta < 0 ? "broken" : "help") : (ev.delta < 0 ? "disrespect" : "respect")]) + "</i></div>" +
      '<div class="amt">' + fmt(ev.delta) + "</div>" +
      '<div class="txt"><b>' + esc(ev.label) + "</b><span>" + (honor ? "Honor" : "Respect") + (ev.note ? " · " + esc(ev.note) : "") + "</span></div>";
    this.root.appendChild(el);
    while (this.root.querySelectorAll(".mk").length > this.max) { const f = this.root.querySelector(".mk"); f.remove(); }
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16);
    raf(() => el.classList.add("in"));
    setTimeout(() => { el.classList.add("out"); el.classList.remove("in"); setTimeout(() => el.remove(), 520); }, this.hold * 1000 + (Math.abs(ev.delta) >= 10 ? 1500 : 0));
    if (ev.tierChanged) this.tier(ev);
    return el;
  }

  // A tier change gets its own line: "Honor · Dishonoured".
  tier(ev) {
    const d = this.doc, el = d.createElement("div");
    el.className = "tier";
    el.style.color = ev.kind === "honor" ? (ev.value < 0 ? "#e3252d" : "#f0c76a") : "#b9d4ec";
    el.textContent = (ev.kind === "honor" ? "Honor" : "Respect") + " · " + ev.tier.name;
    this.root.appendChild(el);
    setTimeout(() => el.classList.add("in"), 30);
    setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 400); }, 5200);
  }

  // The slim meter: honor centred on zero, respect from the left.
  meter(honor, respect, secs) {
    if (!this.meterEl) return;
    const hb = this.meterEl.querySelector(".bar.h b"), rb = this.meterEl.querySelector(".bar.r b");
    const h = Math.max(-100, Math.min(100, honor)), r = Math.max(0, Math.min(100, respect));
    hb.className = h < 0 ? "neg" : "pos";
    hb.style.left = (h < 0 ? 50 + h / 2 : 50) + "%"; hb.style.width = Math.abs(h) / 2 + "%";
    rb.style.width = r + "%";
    this.meterEl.querySelector(".hv").textContent = Math.round(h);
    this.meterEl.querySelector(".rv").textContent = Math.round(r);
    this.meterEl.classList.add("on");
    clearTimeout(this.meterT);
    if (secs !== 0) this.meterT = setTimeout(() => this.meterEl.classList.remove("on"), (secs || 6) * 1000);
  }

  // The full card. info: { honor, honorTier, respect, respectTier, rank, ledger: [{label, delta}], keys: [[key, what]] }; null hides it.
  card(info) {
    if (!this.cardEl) return;
    if (!info) { if (this.cardKey) { this.cardEl.classList.remove("on"); this.cardKey = ""; } return; }
    const key = JSON.stringify([info.honor, info.respect, info.rank, (info.ledger || []).length, info.keys]);
    if (key === this.cardKey) return;
    this.cardKey = key;
    const h = info.honor, r = info.respect;
    const hist = (info.ledger || []).slice(-4).reverse().map(x => '<div><span>' + esc(x.label) + '</span><em style="color:' + (x.delta < 0 ? "#e3252d" : "#f0c76a") + '">' + fmt(x.delta) + "</em></div>").join("");
    this.cardEl.style.borderLeftColor = h < 0 ? "#e3252d" : "#f0c76a";
    this.cardEl.innerHTML =
      "<h4>Honor</h4><div class=\"big\">" + esc(info.honorTier.name) + '</div><div class="ln">' + esc(info.honorTier.line) + "</div>" +
      '<div class="bar"><b style="background:' + (h < 0 ? "#e3252d" : "#f0c76a") + ";left:" + (h < 0 ? 50 + h / 2 : 50) + "%;width:" + Math.abs(h) / 2 + '%"></b></div>' +
      "<h4>Respect" + (info.rank ? " · " + esc(info.rank) : "") + '</h4><div class="big">' + esc(info.respectTier.name) + '</div><div class="ln">' + esc(info.respectTier.line) + "</div>" +
      '<div class="bar"><b style="background:#b9d4ec;left:0;width:' + r + '%"></b></div>' +
      (hist ? '<div class="hist">' + hist + "</div>" : "") +
      (info.keys ? '<div class="keys">' + info.keys.map(k => "<b>" + esc(k[0]) + "</b>" + esc(k[1])).join(" &nbsp; ") + "</div>" : "");
    this.cardEl.classList.add("on");
  }
}
