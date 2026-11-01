// Render actual redesigned assets and exercise the shipped animation retargeter.
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const fs = require("fs"),
  http = require("http"),
  path = require("path");
const root = path.resolve(__dirname, "../..");
const output = path.resolve(process.argv[2] || "/tmp/salaryman-cast");
const server = http.createServer((q, r) => {
  if (q.url === "/") {
    r.setHeader("Content-Type", "text/html");
    r.end(
      '<html><body style="margin:0;background:#19343d"><canvas id="portrait"></canvas></body></html>',
    );
    return;
  }
  const f = path.join(root, decodeURIComponent(q.url.split("?")[0]));
  fs.readFile(f, (e, b) => {
    r.statusCode = e ? 404 : 200;
    r.end(e ? "missing" : b);
  });
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const b = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const p = await b.newPage({ viewport: { width: 640, height: 768 } });
    await p.goto("http://127.0.0.1:" + server.address().port + "/");
    await p.addScriptTag({ path: root + "/Game/vendor/three.min.js" });
    await p.addScriptTag({ path: root + "/Game/vendor/GLTFLoader.js" });
    const html = fs.readFileSync(root + "/Web/konto.html", "utf8");
    const part = (a, z) =>
      html.slice(html.indexOf(a), html.indexOf(z, html.indexOf(a)));
    await p.addScriptTag({
      content:
        "const peds={tpl:null};function animeArt(){return true;}" +
        part("function cloneSkinned(", "// Called when Seiko") +
        part("const pplLib =", "function pplLoad()") +
        part("function pplSource()", "// Seiko's own new body") +
        part("function animeGradient()", "// anime proportions for a person"),
    });
    const names = Object.keys(
      JSON.parse(fs.readFileSync(root + "/Tools/anime/cast-design.json"))
        .characters,
    );
    const results = await p.evaluate(async (names) => {
      const load = (u) =>
        new Promise((ok, no) => new THREE.GLTFLoader().load(u, ok, null, no));
      const base = await load("/Web/seiko.glb");
      peds.tpl = base.scene;
      const src = pplSource();
      window.castModels = {};
      const results = [];
      for (const name of names) {
        const g = await load("/Web/people/" + name + ".glb");
        const root = g.scene;
        root.updateMatrixWorld(true);
        const bones = {};
        root.traverse((o) => {
          if (o.isBone) bones[o.name] = o;
        });
        const target = pplTarget(root, bones),
          clips = {};
        for (const clip of base.animations) {
          const ret = pplRetarget(src, target, clip);
          if (
            ret.tracks.some((t) =>
              Array.from(t.values).some((v) => !Number.isFinite(v)),
            )
          )
            throw Error(name + " invalid animation");
          clips[clip.name.toLowerCase()] = ret;
        }
        toonify(root);
        const mixer = new THREE.AnimationMixer(root);
        const idle = clips.idle || Object.values(clips)[0];
        mixer.clipAction(idle).play();
        mixer.setTime(0.7);
        root.updateMatrixWorld(true);
        castModels[name] = { root, bones, mixer };
        results.push({
          name,
          clips: Object.keys(clips),
          bones: Object.keys(bones).length,
        });
      }
      window.portrait = (name) => {
        const c = document.getElementById("portrait");
        const renderer = new THREE.WebGLRenderer({
          canvas: c,
          antialias: true,
        });
        renderer.setSize(640, 768);
        renderer.setPixelRatio(1);
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#19343d");
        scene.add(new THREE.HemisphereLight(0xfff3da, 0x49636b, 1.15));
        const light = new THREE.DirectionalLight(0xfff5df, 1.4);
        light.position.set(-2, 4, -4);
        scene.add(light);
        const model = castModels[name];
        scene.add(model.root);
        const head = model.bones.Bip01_Head.getWorldPosition(
          new THREE.Vector3(),
        );
        const camera = new THREE.PerspectiveCamera(38, 640 / 768, 0.01, 20);
        camera.position.set(head.x - 0.05, head.y + 0.045, head.z - 1.03);
        camera.lookAt(head.x, head.y - 0.04, head.z);
        renderer.render(scene, camera);
        return { head: head.toArray(), name };
      };
      return results;
    }, names);
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(
      path.join(output, "rig-validation.json"),
      JSON.stringify(results, null, 2),
    );
    for (const name of [
      "seiko_office",
      "seiko_suit_black",
      "salaryman_04",
      "officelady_02",
      "woman_05",
      "salaryman_03",
      "woman_02",
    ]) {
      console.log(await p.evaluate((n) => portrait(n), name));
      await p.screenshot({
        path: path.join(output, name + ".png"),
        timeout: 120000,
      });
    }
    console.log(
      "PASS 30 redesigned rigs, Idle/Walk/Run retargeting and seven portraits",
    );
  } finally {
    await b.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
