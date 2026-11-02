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
        "const peds={tpl:null};function animeArt(){return false;}function worldReal(){return true;}" +
        part("function cloneSkinned(", "// Called when Seiko") +
        part("const pplLib =", "function pplLoad()") +
        part("function pplSource()", "// Seiko's own new body") +
        part("function animeGradient()", "// anime proportions for a person"),
    });
    const castDir=process.env.CAST_DIR||'people';
    const manifest=JSON.parse(fs.readFileSync(root+'/Web/'+castDir+'/index.json'));
    const names=process.env.CAST_ONLY?process.env.CAST_ONLY.split(','):[...new Set([...manifest.people.map(e=>e.file),...manifest.outfits.filter(e=>!e.file.startsWith('../')).map(e=>e.file)].map(f=>f.replace(/\.glb$/,'')))];
    if(process.env.CHAR_ENGINE)await p.addScriptTag({path:root+'/Web/engine/shigoto.js'});
    const results = await p.evaluate(async ({names,castDir,engine}) => {
      const load = (u) =>
        new Promise((ok, no) => new THREE.GLTFLoader().load(u, ok, null, no));
      const base = await load("/Web/seiko.glb");
      peds.tpl=base.scene;const raw=pplSource();pplLib.src=null;
      base.scene.rotation.y=Math.PI; // Reproduce seikoLoaded/pedsAdopt.
      peds.tpl=base.scene;const src=pplSource();
      for(const name of Object.keys(raw.bindQ)){if(1-Math.abs(raw.bindQ[name].dot(src.bindQ[name]))>1e-6||raw.bindP[name].distanceTo(src.bindP[name])>1e-6)throw Error('Double-applied facing rotation: '+name+' '+JSON.stringify({rawQ:raw.bindQ[name].toArray(),loadedQ:src.bindQ[name].toArray(),rawP:raw.bindP[name].toArray(),loadedP:src.bindP[name].toArray(),auto:base.scene.matrixAutoUpdate}));}
      window.castModels = {};
      const results = [];
      for (const name of names) {
        const g = await load("/Web/"+castDir+"/" + name + ".glb");
        const root = g.scene;
        root.updateMatrixWorld(true);
        const bones = {};
        root.traverse((o) => {
          if (o.isBone) bones[o.name] = o;
        });
        const head=bones.Bip01_Head.getWorldPosition(new THREE.Vector3()),nose=(bones.Bip01_MNose||bones.Bip01_REye||bones.Bip01_Head).getWorldPosition(new THREE.Vector3());let fx=nose.x-head.x,fz=nose.z-head.z;
        if(Math.hypot(fx,fz)<1e-5){const l=bones.Bip01_L_Thigh.getWorldPosition(new THREE.Vector3()),r=bones.Bip01_R_Thigh.getWorldPosition(new THREE.Vector3());fx=-(l.z-r.z);fz=l.x-r.x;}root.rotation.y=-Math.atan2(fx,fz);root.updateMatrixWorld(true);
        if(engine){const C=SHIGOTO.characters(THREE,{quality:'high'});C.upgrade(root,{hero:name.startsWith('seiko'),model:name});root.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material])if(!['hair','glass'].includes(m.userData.charKind)&&(!m.map||!m.normalMap||!m.roughnessMap||!m.aoMap))throw Error(name+' missing PBR maps: '+m.name+' '+JSON.stringify(C.report()));});}
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
        if(animeArt())toonify(root);
        const mixer = new THREE.AnimationMixer(root);
        const idle = clips.idle || Object.values(clips)[0];
        mixer.clipAction(idle).play();
        mixer.setTime(0.7);
        for(const clip of Object.values(clips)){
          mixer.stopAllAction();mixer.clipAction(clip).reset().play();mixer.setTime(clip.duration*.37);root.updateMatrixWorld(true);
          const bounds=new THREE.Box3();root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();const attr=mesh.geometry.attributes.position;for(let v=0;v<attr.count;v+=37){const p=new THREE.Vector3().fromBufferAttribute(attr,v);mesh.boneTransform(v,p);mesh.localToWorld(p);if(!p.toArray().every(Number.isFinite))throw Error(name+' invalid posed vertex');bounds.expandByPoint(p);}});
          const size=bounds.getSize(new THREE.Vector3());if(size.y<1||size.y>2.4||size.x>3)throw Error(name+' bad animated bounds '+size.toArray());
        }
        mixer.stopAllAction();mixer.clipAction(idle).reset().play();mixer.setTime(.7);
        root.updateMatrixWorld(true);
        castModels[name] = { root, bones, mixer };
        results.push({
          name,
          clips: Object.keys(clips),
          bones: Object.keys(bones).length,
        });
      }
      window.portrait = (name, full, back) => {
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
        camera.position.set(head.x - 0.05, head.y + 0.045, head.z + 1.03);
        camera.lookAt(head.x, head.y - 0.04, head.z);
        if(full){camera.position.set(head.x+.28,head.y-.4,head.z+(back?3.9:-3.9));camera.lookAt(head.x,head.y-.7,head.z);}
        renderer.render(scene, camera);
        if(renderer.info.programs.some(p=>p.diagnostics?.runnable===false))throw Error("Character shader failed compilation");
        return { head: head.toArray(), name };
      };
      return results;
    }, {names,castDir,engine:!!process.env.CHAR_ENGINE});
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(
      path.join(output, "rig-validation.json"),
      JSON.stringify(results, null, 2),
    );
    for (const name of (process.env.CAST_ONLY ? names : [
      "seiko_player",
      "seiko_office",
      "seiko_suit_black",
      "salaryman_04",
      "officelady_02",
      "woman_05",
      "salaryman_03",
      "woman_02",
      "seiko_village",
      "seiko_village_denim",
    ]).filter(n=>names.includes(n))) {
      console.log(await p.evaluate((n) => portrait(n,true,true), name));
      if(process.env.SCREENSHOTS==="1") await p.screenshot({
        path: path.join(output, name + ".png"),
        timeout: 120000,
      });
    }
    console.log(
      "PASS redesigned rigs and animation retargeting",
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
