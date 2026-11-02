/* Shared, dependency-free canvas identity. Loaded before the game. */
(function () {
  "use strict";
  const palette = Object.freeze({
    ink: "#132b32",
    panel: "#19343d",
    raised: "#244650",
    paper: "#f3eddf",
    muted: "#a9bdb5",
    accent: "#ed795e",
    jade: "#91c1ad",
    gold: "#eab965",
  });
  const logo = new Image();
  logo.onload = () => window.dispatchEvent(new Event("salarybrandready"));
  logo.src = "art/logo.png";
  function brand(g, x, y, w, h) {
    g.save();
    if (logo.complete && logo.naturalWidth) {
      const s = Math.min(w / logo.naturalWidth, h / logo.naturalHeight);
      g.drawImage(
        logo,
        x + (w - logo.naturalWidth * s) / 2,
        y + (h - logo.naturalHeight * s) / 2,
        logo.naturalWidth * s,
        logo.naturalHeight * s,
      );
    } else {
      g.fillStyle = palette.accent;
      g.beginPath();
      g.arc(x + h * 0.44, y + h * 0.44, h * 0.34, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = palette.paper;
      g.font =
        "900 " + Math.round(Math.min(h * 0.35, w * 0.1)) + "px sans-serif";
      g.textBaseline = "middle";
      g.fillText("SALARY MAN", x + h * 0.85, y + h * 0.48, w - h * 0.9);
    }
    g.restore();
  }
  function monogram(g, x, y, s) {
    g.save();
    g.fillStyle = palette.ink;
    g.fillRect(x, y, s, s);
    g.fillStyle = palette.accent;
    g.beginPath();
    g.arc(x + s * 0.5, y + s * 0.42, s * 0.32, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = palette.paper;
    g.fillRect(x + s * 0.23, y + s * 0.38, s * 0.54, s * 0.38);
    g.lineWidth = s * 0.055;
    g.strokeStyle = palette.paper;
    g.strokeRect(x + s * 0.4, y + s * 0.26, s * 0.2, s * 0.17);
    g.fillStyle = palette.ink;
    g.fillRect(x + s * 0.46, y + s * 0.53, s * 0.08, s * 0.09);
    g.restore();
  }
  window.SalaryDesign = Object.freeze({ palette, brand, monogram });
})();
/* Product illustration vocabulary: same fictional goods as the world's adverts. */
window.SalaryAdProduct = function (g, ad) {
  g.save();
  g.fillStyle = "rgba(0,0,0,.15)";
  g.beginPath();
  g.ellipse(0, 81, 102, 13, 0, 0, Math.PI * 2);
  g.fill();
  const ivory = "#f4efdf",
    dark = "#17313b";
  g.strokeStyle = ad.tint;
  g.fillStyle = ivory;
  g.lineWidth = 5;
  g.lineJoin = "round";
  if (ad.glyph === "can") {
    const shine = g.createLinearGradient(-40, 0, 42, 0);
    shine.addColorStop(0, "#a8bcb5");
    shine.addColorStop(0.35, ivory);
    shine.addColorStop(1, "#8ba59d");
    g.fillStyle = shine;
    g.fillRect(-42, -76, 84, 150);
    g.beginPath();
    g.ellipse(0, -76, 42, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = ad.tint;
    g.fillRect(-42, -46, 84, 104);
    g.fillStyle = dark;
    g.font = "900 23px sans-serif";
    g.textAlign = "center";
    g.fillText("G", 0, -10);
    g.font = "700 12px sans-serif";
    g.fillText("GANBARE", 0, 17);
    g.fillText("ENERGY", 0, 34);
    g.strokeStyle = "#697c77";
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(0, -75, 14, 4, 0, 0, Math.PI * 2);
    g.stroke();
  } else if (ad.glyph === "store") {
    g.fillStyle = ivory;
    g.fillRect(-95, -39, 190, 112);
    g.fillStyle = dark;
    g.fillRect(-81, -17, 56, 64);
    g.fillRect(25, -17, 56, 64);
    g.fillRect(-15, -17, 30, 90);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = ["#db7056", "#f1e8cd", "#3d7e66"][i];
      g.fillRect(-105, -65 + i * 9, 210, 9);
    }
    g.fillStyle = ivory;
    g.font = "900 17px sans-serif";
    g.textAlign = "center";
    g.fillText("11 ELEVEN", 0, -78);
  } else if (ad.glyph === "cone") {
    g.fillStyle = "#d4a76b";
    g.beginPath();
    g.moveTo(-39, -3);
    g.lineTo(39, -3);
    g.lineTo(0, 85);
    g.closePath();
    g.fill();
    g.strokeStyle = "#a87947";
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(-33 + i * 12, 8);
      g.lineTo(0 + i * 5, 66 - i * 10);
      g.stroke();
    }
    for (const [x, y, r, c] of [
      [-19, -24, 35, "#f3e7cc"],
      [19, -34, 38, "#e7a8ad"],
      [0, -66, 29, "#f2cec4"],
    ]) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  } else if (ad.glyph === "nh") {
    g.fillStyle = ivory;
    g.fillRect(-76, -55, 152, 104);
    g.fillStyle = dark;
    g.fillRect(-66, -43, 132, 45);
    g.fillStyle = "#548f78";
    g.fillRect(-76, 12, 152, 13);
    g.fillStyle = ivory;
    g.beginPath();
    g.arc(-47, 36, 8, 0, 7);
    g.arc(47, 36, 8, 0, 7);
    g.fill();
    g.strokeStyle = ad.tint;
    g.beginPath();
    g.moveTo(-55, 53);
    g.lineTo(-80, 78);
    g.moveTo(55, 53);
    g.lineTo(80, 78);
    g.stroke();
  } else if (ad.glyph === "card") {
    g.rotate(-0.12);
    g.fillStyle = ivory;
    g.fillRect(-98, -50, 196, 112);
    g.fillStyle = dark;
    g.font = "700 18px sans-serif";
    g.textAlign = "left";
    g.fillText("SOTI", -78, -17);
    g.fillStyle = "#3b716b";
    g.fillRect(-78, 1, 92, 4);
    g.fillRect(-78, 18, 135, 3);
    g.fillRect(-78, 33, 116, 3);
    g.fillStyle = ad.tint;
    g.fillRect(58, -31, 20, 20);
  } else if (ad.glyph === "pod") {
    g.fillStyle = ivory;
    g.beginPath();
    g.ellipse(0, 0, 91, 70, 0, 0, 7);
    g.fill();
    g.fillStyle = dark;
    g.beginPath();
    g.ellipse(0, 0, 72, 51, 0, 0, 7);
    g.fill();
    g.fillStyle = "#d4c5a2";
    g.fillRect(-52, 12, 104, 24);
    g.fillStyle = ivory;
    g.fillRect(19, 2, 34, 16);
    g.fillStyle = ad.tint;
    g.fillRect(-52, -30, 26, 4);
  } else if (ad.glyph === "mic") {
    g.rotate(-0.25);
    g.fillStyle = ivory;
    g.beginPath();
    g.arc(0, -37, 43, 0, 7);
    g.fill();
    g.fillStyle = dark;
    g.fillRect(-17, 0, 34, 84);
    g.strokeStyle = "#6b8983";
    g.lineWidth = 3;
    for (let i = -2; i < 3; i++) {
      g.beginPath();
      g.moveTo(-32, -37 + i * 11);
      g.lineTo(32, -37 + i * 11);
      g.stroke();
    }
  } else {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i === 0 ? ivory : ad.tint;
      const x = -75 + i * 50;
      g.beginPath();
      g.arc(x, -30, 17, 0, 7);
      g.fill();
      g.fillRect(x - 13, -7, 26, 57);
    }
    g.strokeStyle = ivory;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-103, 68);
    g.lineTo(101, 68);
    g.lineTo(91, 58);
    g.stroke();
  }
  g.restore();
};
(function () {
  const cache = {};
  window.SalaryPortrait = function (who) {
    const name = String((who && who.name) || "").toLowerCase();
    const key =
      who && who.me
        ? "seiko_office"
        : /akio/.test(name)
          ? "salaryman_04"
          : /mother|mum/.test(name)
            ? "woman_05"
            : /father|dad/.test(name)
              ? "salaryman_03"
              : /sister/.test(name)
                ? "woman_02"
                : /reception/.test(name)
                  ? "officelady_02"
                  : null;
    if (!key) return null;
    if (!cache[key]) {
      const img = new Image();
      img.onload = () => window.dispatchEvent(new Event("salaryportraitready"));
      img.src = "people/portraits/" + key + ".png";
      cache[key] = img;
    }
    return cache[key].complete && cache[key].naturalWidth ? cache[key] : null;
  };
})();
