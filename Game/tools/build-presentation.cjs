// Build the app icon and loading cards from the real, validated character portraits.
// Run cast-test.cjs first and pass its output directory here.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const root = path.resolve(__dirname, "../..");
const web = path.join(root, "Web");
const input = path.resolve(process.argv[2] || "/tmp/salaryman-cast");
const portraits = [
  "seiko_office",
  "seiko_suit_black",
  "salaryman_04",
  "officelady_02",
  "woman_05",
  "salaryman_03",
  "woman_02",
];
fs.mkdirSync(path.join(web, "people/portraits"), { recursive: true });
for (const name of portraits)
  fs.copyFileSync(
    path.join(input, name + ".png"),
    path.join(web, "people/portraits", name + ".png"),
  );
const server = http.createServer((q, r) => {
  if (q.url === "/") {
    r.setHeader("Content-Type", "text/html");
    r.end("<html><body></body></html>");
    return;
  }
  const file = path.resolve(
    web,
    "." + new URL(q.url, "http://localhost").pathname,
  );
  if (!file.startsWith(web + path.sep)) {
    r.writeHead(403).end();
    return;
  }
  fs.readFile(file, (e, b) => {
    r.statusCode = e ? 404 : 200;
    if (file.endsWith(".css")) r.setHeader("Content-Type", "text/css");
    if (file.endsWith(".js")) r.setHeader("Content-Type", "text/javascript");
    r.end(e ? "missing" : b);
  });
});
async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    await page.goto("http://127.0.0.1:" + server.address().port + "/");
    await page.addScriptTag({ path: path.join(web, "art/interface.js") });
    const icon = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 512;
      SalaryDesign.monogram(c.getContext("2d"), 0, 0, 512);
      return c.toDataURL("image/png");
    });
    fs.writeFileSync(
      path.join(root, "Game/build/icon.png"),
      Buffer.from(icon.split(",")[1], "base64"),
    );
    const cards = [
      {
        file: "city-cast.jpg",
        kicker: "MIZUHO → TŌKONTO",
        title: "A NEW CITY.<br>A LIFE TO<br>MAKE YOUR OWN.",
        cast: [
          ["seiko_suit_black", "SEIKO SHIGU", "A new arrival"],
          ["salaryman_04", "AKIO", "SOTI"],
          ["officelady_02", "SOTI RECEPTION", "First impressions"],
        ],
      },
      {
        file: "family-cast.jpg",
        kicker: "THE SHIGU FAMILY · MIZUHO",
        title: "SOME ROOTS<br>TRAVEL<br>WITH YOU.",
        cast: [
          ["woman_05", "MOTHER", "Home, in Mizuho"],
          ["salaryman_03", "FATHER", "Home, in Mizuho"],
          ["woman_02", "SEIKO’S SISTER", "Home, in Mizuho"],
        ],
      },
    ];
    for (const card of cards) {
      await page.setContent(
        `<link rel="stylesheet" href="/art/fonts/konto-sans.css"><style>
        *{box-sizing:border-box}body{margin:0;background:#19343d;color:#f3eddf;font-family:'Konto Sans',sans-serif;width:1920px;height:1080px;overflow:hidden}
        .line{position:absolute;left:86px;right:86px;bottom:80px;height:3px;background:#406661}.line:before{content:'';display:block;width:180px;height:3px;background:#ed795e}
        .brand{position:absolute;left:80px;top:85px;width:600px}.kicker{position:absolute;left:95px;top:400px;font-size:18px;letter-spacing:4px;color:#eab965}
        h1{position:absolute;left:90px;top:440px;font-size:66px;line-height:1.16;letter-spacing:-1.5px;font-weight:800;margin:0}
        .cast{position:absolute;left:770px;right:65px;top:130px;bottom:145px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
        article{position:relative;background:#24454e;border:1px solid #45655f;border-radius:160px 160px 12px 12px;overflow:hidden}
        article img{position:absolute;width:100%;height:100%;object-fit:cover;object-position:50% 28%}
        article .caption{position:absolute;bottom:0;width:100%;padding:90px 18px 32px;background:linear-gradient(transparent,#102b34 55%)}
        article b{font-size:22px;display:block;letter-spacing:1px}article span{display:block;font-size:16px;color:#b6c9bc;margin-top:9px}
        footer{position:absolute;bottom:42px;left:94px;color:#bdc9bd;font-size:17px;letter-spacing:2px}
        .number{position:absolute;right:90px;bottom:37px;font-size:25px;color:#eab965}
      </style><img class="brand" src="/art/logo.png" alt="Salary Man"><div class="kicker">${card.kicker}</div><h1>${card.title}</h1><div class="cast">${card.cast.map(([id, name, sub]) => `<article><img src="/people/portraits/${id}.png"><div class="caption"><b>${name}</b><span>${sub}</span></div></article>`).join("")}</div><div class="line"></div><footer>ONE ISLAND. A THOUSAND ORDINARY STORIES.</footer><div class="number">SM / ${cards.indexOf(card) + 1}</div>`,
        { waitUntil: "networkidle" },
      );
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: path.join(web, "loading", card.file),
        type: "jpeg",
        quality: 91,
      });
      console.log("Built", card.file);
    }
    console.log(
      "Built 512px app icon and two loading cards from seven in-game portraits",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
