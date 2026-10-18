// The app icons, drawn exactly as the web build draws them (a rounded square in the app's colour with a flat white mark on it).
const UI = '"Zen Kaku Gothic New","Noto Sans JP","Hiragino Kaku Gothic ProN","Helvetica Neue",Arial,"Liberation Sans",sans-serif';
const SERIF = '"Playfair Display","Times New Roman",Georgia,serif';
const mynet = { ready: false };
const mynetBadge = () => 0;
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function mnLogo(g, x, y, s, tile) {
  g.save();
  if (!tile) { roundRect(g, x, y, s, s, s * 0.235); g.clip(); }
  const q = g.createRadialGradient(x + s * 0.28, y + s * 1.02, s * 0.02, x + s * 0.28, y + s * 1.02, s * 1.25);
  q.addColorStop(0, "#fdf497"); q.addColorStop(0.08, "#fdf497"); q.addColorStop(0.42, "#fd5949"); q.addColorStop(0.62, "#d6249f"); q.addColorStop(0.95, "#285aeb");
  g.fillStyle = q; g.fillRect(x, y, s, s);
  // a paper plane, in white
  g.strokeStyle = "#ffffff"; g.fillStyle = "#ffffff"; g.lineWidth = s * 0.07; g.lineJoin = "round"; g.lineCap = "round";
  const cx = x + s * 0.5, cy = y + s * 0.5;
  g.beginPath();
  g.moveTo(cx - s * 0.30, cy + s * 0.02); g.lineTo(cx + s * 0.30, cy - s * 0.27); g.lineTo(cx + s * 0.11, cy + s * 0.29); g.lineTo(cx - s * 0.02, cy + s * 0.07); g.closePath();
  g.stroke();
  g.beginPath(); g.moveTo(cx - s * 0.02, cy + s * 0.07); g.lineTo(cx + s * 0.30, cy - s * 0.27); g.stroke();
  g.beginPath(); g.moveTo(cx - s * 0.02, cy + s * 0.07); g.lineTo(cx - s * 0.04, cy + s * 0.24); g.lineTo(cx + s * 0.11, cy + s * 0.29); g.stroke();
  g.restore();
}

function phoneIcon(g, x, y, s, colour, glyph) {
  const r = s * 0.235;
  g.save();
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + s - r, y);
  g.quadraticCurveTo(x + s, y, x + s, y + r); g.lineTo(x + s, y + s - r);
  g.quadraticCurveTo(x + s, y + s, x + s - r, y + s); g.lineTo(x + r, y + s);
  g.quadraticCurveTo(x, y + s, x, y + s - r); g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
  const grd = g.createLinearGradient(x, y, x, y + s);
  grd.addColorStop(0, colour);
  grd.addColorStop(1, "rgba(0,0,0,0.35)");
  g.fillStyle = colour;
  g.fill();
  g.fillStyle = grd;
  g.globalAlpha = 0.32;
  g.fill();
  g.globalAlpha = 1;
  g.clip();

  const c = x + s / 2, m = y + s / 2, u = s * 0.5;
  g.strokeStyle = "#f4f6f8";
  g.fillStyle = "#f4f6f8";
  g.lineWidth = s * 0.075;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (glyph === "call") {
    g.beginPath();
    g.moveTo(c - u * 0.42, m - u * 0.46);
    g.quadraticCurveTo(c - u * 0.1, m + u * 0.1, c + u * 0.46, m + u * 0.42);
    g.lineTo(c + u * 0.46, m + u * 0.12);
    g.moveTo(c - u * 0.42, m - u * 0.46);
    g.lineTo(c - u * 0.12, m - u * 0.46);
    g.stroke();
  } else if (glyph === "chat") {
    g.beginPath();
    g.moveTo(c - u * 0.5, m - u * 0.36);
    g.lineTo(c + u * 0.5, m - u * 0.36);
    g.lineTo(c + u * 0.5, m + u * 0.2);
    g.lineTo(c - u * 0.14, m + u * 0.2);
    g.lineTo(c - u * 0.38, m + u * 0.52);
    g.lineTo(c - u * 0.38, m + u * 0.2);
    g.lineTo(c - u * 0.5, m + u * 0.2);
    g.closePath();
    g.fill();
  } else if (glyph === "cam") {
    g.beginPath(); g.arc(c, m + u * 0.05, u * 0.3, 0, 6.2832); g.stroke();
    g.strokeRect(c - u * 0.52, m - u * 0.3, u * 1.04, u * 0.78);
    g.fillRect(c - u * 0.18, m - u * 0.46, u * 0.36, u * 0.16);
  } else if (glyph === "sos") {
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "800 " + Math.round(s * 0.27) + "px " + UI;
    g.fillText("110", c, m - u * 0.26);
    g.fillText("119", c, m + u * 0.26);
  } else if (glyph === "rail") {
    g.lineWidth = s * 0.1;
    g.beginPath();
    g.moveTo(c - u * 0.3, m - u * 0.5); g.lineTo(c - u * 0.3, m + u * 0.5);
    g.moveTo(c + u * 0.3, m - u * 0.5); g.lineTo(c + u * 0.3, m + u * 0.5);
    g.stroke();
    g.beginPath(); g.moveTo(c - u * 0.3, m + u * 0.22); g.lineTo(c + u * 0.3, m - u * 0.22); g.stroke();
  } else if (glyph === "ryde") {
    g.fillStyle = "#07140f";
    g.font = "700 " + Math.round(s * 0.3) + "px " + UI;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("R", c, m);
  } else if (glyph === "store") {
    g.beginPath();
    g.moveTo(c - u * 0.56, m - u * 0.1); g.lineTo(c, m - u * 0.5); g.lineTo(c + u * 0.56, m - u * 0.1);
    g.closePath(); g.fill();
    g.fillRect(c - u * 0.44, m - u * 0.08, u * 0.88, u * 0.56);
  } else if (glyph === "sun") {
    g.beginPath(); g.arc(c, m, u * 0.3, 0, 6.2832); g.fill();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 6.2832;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * u * 0.44, m + Math.sin(a) * u * 0.44);
      g.lineTo(c + Math.cos(a) * u * 0.58, m + Math.sin(a) * u * 0.58);
      g.stroke();
    }
  } else if (glyph === "pin") {
    g.beginPath();
    g.arc(c, m - u * 0.12, u * 0.33, Math.PI * 0.86, Math.PI * 0.14);
    g.lineTo(c, m + u * 0.56);
    g.closePath(); g.fill();
    g.fillStyle = "#d8694a";
    g.beginPath(); g.arc(c, m - u * 0.14, u * 0.13, 0, 6.2832); g.fill();
  } else if (glyph === "card") {
    g.fillRect(c - u * 0.54, m - u * 0.34, u * 1.08, u * 0.68);
    g.fillStyle = "#2a2d33";
    g.fillRect(c - u * 0.54, m - u * 0.14, u * 1.08, u * 0.14);
  } else if (glyph === "note") {
    g.beginPath(); g.arc(c - u * 0.18, m + u * 0.3, u * 0.17, 0, 6.2832); g.fill();
    g.beginPath(); g.arc(c + u * 0.34, m + u * 0.16, u * 0.17, 0, 6.2832); g.fill();
    g.fillRect(c - u * 0.03, m - u * 0.46, u * 0.1, u * 0.78);
    g.fillRect(c + u * 0.45, m - u * 0.6, u * 0.1, u * 0.78);
    g.fillRect(c - u * 0.03, m - u * 0.6, u * 0.58, u * 0.14);
  } else if (glyph === "photo") {
    g.strokeRect(c - u * 0.52, m - u * 0.4, u * 1.04, u * 0.8);
    g.beginPath();
    g.moveTo(c - u * 0.46, m + u * 0.34); g.lineTo(c - u * 0.1, m - u * 0.12);
    g.lineTo(c + u * 0.16, m + u * 0.14); g.lineTo(c + u * 0.32, m - u * 0.02);
    g.lineTo(c + u * 0.46, m + u * 0.34);
    g.closePath(); g.fill();
  } else if (glyph === "clock") {
    g.beginPath(); g.arc(c, m, u * 0.52, 0, 6.2832); g.stroke();
    g.beginPath(); g.moveTo(c, m); g.lineTo(c, m - u * 0.33);
    g.moveTo(c, m); g.lineTo(c + u * 0.24, m + u * 0.1); g.stroke();
  } else if (glyph === "note2") {
    g.fillStyle = "#2a2a1e";
    g.fillRect(c - u * 0.42, m - u * 0.5, u * 0.84, u * 1.0);
    g.fillStyle = "#f4f6f8";
    for (let i = 0; i < 4; i++) g.fillRect(c - u * 0.28, m - u * 0.3 + i * u * 0.2, u * 0.56, u * 0.07);
  } else if (glyph === "globe") {
    g.beginPath(); g.arc(c, m, u * 0.52, 0, 6.2832); g.stroke();
    g.beginPath(); g.ellipse(c, m, u * 0.22, u * 0.52, 0, 0, 6.2832); g.stroke();
    g.beginPath(); g.moveTo(c - u * 0.52, m); g.lineTo(c + u * 0.52, m); g.stroke();
  } else if (glyph === "heart") {
    g.beginPath();
    g.moveTo(c, m + u * 0.46);
    g.bezierCurveTo(c - u * 0.95, m - u * 0.02, c - u * 0.46, m - u * 0.66, c, m - u * 0.22);
    g.bezierCurveTo(c + u * 0.46, m - u * 0.66, c + u * 0.95, m - u * 0.02, c, m + u * 0.46);
    g.fillStyle = "#ffffff"; g.fill();
  } else if (glyph === "gear") {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a0 = i / 8 * 6.2832, a1 = (i + 0.5) / 8 * 6.2832;
      g.lineTo(c + Math.cos(a0) * u * 0.56, m + Math.sin(a0) * u * 0.56);
      g.lineTo(c + Math.cos(a1) * u * 0.38, m + Math.sin(a1) * u * 0.38);
    }
    g.closePath(); g.fill();
    g.fillStyle = colour;
    g.beginPath(); g.arc(c, m, u * 0.2, 0, 6.2832); g.fill();
  } else if (glyph === "mynet") {
    mnLogo(g, x, y, s, true);
  } else if (glyph === "soti") {
    g.fillStyle = "#f4f6f8";
    g.font = "400 " + Math.round(s * 0.26) + "px " + SERIF;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("SOTI", c, m);
  }
  g.restore();
  if (glyph === "mynet" && mynet.ready) {
    const n = mynetBadge();
    if (n > 0) {
      const bx = x + s * 0.93, by = y + s * 0.07, br = s * 0.19;
      g.fillStyle = "#ff3b30"; g.beginPath(); g.arc(bx, by, br, 0, 7); g.fill();
      g.fillStyle = "#fff"; g.font = "800 " + Math.round(br * 1.2) + "px " + UI; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(n > 9 ? "9+" : String(n), bx, by + br * 0.06); g.textBaseline = "alphabetic"; g.textAlign = "left";
    }
  }
}

export { phoneIcon, mnLogo };
