// Error engine test: loads Web/game/error-engine.js in a bare page (with a stand-in desktop bridge and three.js loader), sets off each kind of
// fault and checks the code, the fingerprint (stable across a reload), the card, the report text, the GitHub issue link and "last time".
//   node Game/tools/error-engine-test.cjs            (PLAYWRIGHT=/path/to/playwright if it is not installed here)
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const WEB = path.resolve(__dirname, "../../Web");

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script>
  window.__written = []; window.__copied = []; window.__issues = [];
  window.KONTO_DESKTOP = { errors: {
    info: () => ({ version: "9.9.9", build: "abc1234", electron: "33.0.0", os: "test-os", gpu: "Test GPU", driver: "1.2.3", logPath: "/tmp/error-log.txt" }),
    pending: () => (sessionStorage.getItem("pend") ? (sessionStorage.removeItem("pend"), [{ code: "SM-ELC-001", fp: "BEEF", message: "the game page stopped: crashed (exit 1)", at: new Date().toISOString(), log: ["x"] }]) : []),
    write: r => window.__written.push(r), copy: t => { window.__copied.push(t); return true; }, openLog: () => {}, openIssue: u => window.__issues.push(u),
    onMain: cb => { window.__main = cb; } } };
</script>
<script src="/game/error-engine.js"></script>
<script>
  // a stand-in three.js with a loader that always fails
  window.THREE = { GLTFLoader: function () {} };
  THREE.GLTFLoader.prototype.load = function (url, ok, prog, err) { setTimeout(() => err && err(new Error("404 " + url)), 5); };
  window.persistLoad = async () => ({ stages: [{ name: "trees", ok: false, error: "boom" }, { name: "grass", ok: true }],
    checks: [{ framework: "world", name: "story places exist", ok: false, detail: "Tōkonto Central" }, { framework: "scene", name: "ok", ok: true }], residentMb: 1, budgetMb: 2, ms: 3 });
</script>
<script src="/game/missing-file.js"></script>
</head><body><div id="boot" hidden></div><canvas id="c"></canvas></body></html>`;

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/" || p === "/index.html") { res.writeHead(200, { "content-type": "text/html" }); res.end(PAGE); return; }
  const f = path.resolve(WEB, "." + p);
  if (!f.startsWith(WEB) || !fs.existsSync(f)) { res.writeHead(404); res.end("no"); return; }
  res.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : "application/octet-stream" }); res.end(fs.readFileSync(f));
});

(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port + "/";
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.KONTO_ERRORS);
  await page.evaluate(async () => {
    setTimeout(() => { null.boom; }, 0);
    Promise.reject(new Error("nobody caught me"));
    new THREE.GLTFLoader().load("people/real/nobody.glb", () => {}, null, () => {});
    await fetch("/levels/none.json").catch(() => {});
    const img = new Image(); document.body.appendChild(img); img.src = "/art/nothing.png";
    console.error("THREE.WebGLProgram: shader error: ", 1282, "ERROR: 0:12: 'foo' : undeclared identifier");
    await window.persistLoad();
    try { localStorage.setItem("x", "y"); } catch (e) { /* none */ }
    window.__main({ code: "SM-GPU-002", fp: "AB12", message: "GPU process gone: crashed (exit 5)" });
    // a real context loss on a canvas in the page
    const gl = document.getElementById("c").getContext("webgl"); gl.getExtension("WEBGL_lose_context").loseContext();
    await new Promise(r => setTimeout(r, 400));
  });
  const recs = await page.evaluate(() => KONTO_ERRORS.records.map(r => ({ code: r.code, full: r.full, title: r.title, message: r.message, sev: r.sev })));
  const codes = recs.map(r => r.code);
  console.log(recs.map(r => r.full + "  " + r.title + "  " + r.message.slice(0, 80)).join("\n"));
  for (const c of ["SM-JS-001", "SM-JS-003", "SM-AST-001", "SM-AST-002", "SM-AST-003", "SM-AST-004", "SM-GPU-005", "SM-PER-001", "SM-PER-002", "SM-GPU-002", "SM-GPU-001"])
    assert.ok(codes.includes(c), "expected " + c + " in " + codes.join(","));
  for (const r of recs) assert.match(r.full, /^SM-[A-Z]+-\d{3}-[0-9A-F]{4}$/);
  assert.equal(pageErrors.filter(m => !/boom|null|nobody caught/.test(m)).length, 0, "the engine itself threw: " + pageErrors.join("; "));

  // the card for the first error, and its buttons
  assert.ok(await page.locator("#smerr .card .code").count() === 1, "an error card is shown");
  await page.locator("#smerr .card button.p").click();
  const copied = await page.evaluate(() => window.__copied[window.__copied.length - 1]);
  for (const want of ["Salary Man error report", "Code: SM-", "Version: 9.9.9 (build abc1234)", "GPU:", "Full log on this PC"]) assert.ok(copied.includes(want), "report has " + want);
  const later = await page.evaluate(() => KONTO_ERRORS.reportText(KONTO_ERRORS.records.find(r => r.code === "SM-GPU-001")));
  assert.match(later, /Recent log \(\d+ lines\):[\s\S]*undeclared identifier/, "a later report carries the recent log");
  assert.match(later, /Other problems this session: SM-/);
  await page.locator("#smerr .card button", { hasText: "Open GitHub issue" }).click();
  const issue = await page.evaluate(() => window.__issues[0]);
  assert.ok(issue.startsWith("https://github.com/physicstheory/salaryman/issues/new?title=%5BSM-"), "issue link");
  assert.ok(issue.length < 8000, "issue link short enough: " + issue.length);
  const written = await page.evaluate(() => window.__written.length);
  assert.ok(written >= recs.length - 1, "reports written to the log file (" + written + ")");

  // the panel
  await page.keyboard.press("Control+Shift+E");
  assert.ok(await page.locator("#smerr .li").count() >= recs.length, "the list shows every problem");

  // fingerprints are stable, and the last session's unseen error is shown after a reload; the desktop app's pending crash too
  const firstJs = recs.find(r => r.code === "SM-JS-001").full;
  await page.evaluate(() => { sessionStorage.setItem("pend", "1"); KONTO_ERRORS.records.forEach(r => { r.seen = r.code !== "SM-GPU-001"; }); localStorage.setItem("konto.errors", JSON.stringify(KONTO_ERRORS.records)); });
  await page.reload();
  await page.waitForFunction(() => /Last time/.test((document.querySelector("#smerr .card .k") || {}).textContent || ""), null, { timeout: 5000 });
  const label = await page.locator("#smerr .card .k").textContent();
  const shownCode = await page.locator("#smerr .card .code").textContent();
  assert.match(label, /Last time/);
  assert.match(shownCode, /^SM-(ELC-001-BEEF|GPU-001-)/);
  await page.evaluate(() => { setTimeout(() => { null.boom; }, 0); });
  await page.waitForTimeout(200);
  const again = await page.evaluate(() => KONTO_ERRORS.records.filter(r => r.code === "SM-JS-001" && !r.prev).map(r => r.full));
  assert.ok(again.includes(firstJs), "same fault, same code after a reload: " + firstJs + " vs " + again.join(","));
  console.log("error engine test: PASS (" + recs.length + " reports, card, copy, issue link, list, last time, stable fingerprint)");
  await browser.close(); server.close();
})().catch(e => { console.error("error engine test: FAIL", e); process.exit(1); });
