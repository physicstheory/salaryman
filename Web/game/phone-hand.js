// Seiko's phone, in his hand.
//
// The way the big open-world games do it: the HUD shows the phone on its own, in the bottom right corner, and the man in the world
// actually raises a handset.
//
// * Looking at it: his right forearm comes up in front of his chest and the handset sits in his palm, screen to his eyes, his
//   fingers wrapped round its left edge and his thumb up its right edge. His head drops a little to read it. It eases in and out
//   over a quarter of a second, and he can keep walking with it up.
// * On a call (dialling from the Phone app, the emergency operator, a voicemail, or one of the after-hours calls): the handset goes
//   up to his right ear, screen against his cheek, elbow out, until the call is over.
// * The handset is a real object: a rounded slab with a bevelled metal rail, a glass screen showing what the HUD phone shows
//   (copied four times a second), and a camera bump on the back. After dark the screen lights his face and hand (the interior
//   light the game already has, idle outdoors, so nothing is added to the scene and nothing recompiles).
// * The hand is posed from his own skeleton: the arm by a two-bone IK, the hand turned so its palm is behind the handset, and
//   every finger curled joint by joint round the edge. Nothing about the bone axes is assumed: the hand's frame is measured from
//   where his knuckles are each frame, so it works for every outfit model.
//
// The old HUD hand (a picture of a hand round the HUD phone) is gone by default because it covered the apps; ?hudhand=1 brings it back.
// Off switch: ?phonehand=0 (or localStorage konto.phonehand=0).
(function () {
  "use strict";
  let off = /[?&]phonehand=0\b/.test(location.search);
  try { off = off || localStorage.getItem("konto.phonehand") === "0"; } catch (e) { /* private window */ }
  if (off || typeof THREE === "undefined") return;
  const H = window.phoneHand = { version: "2.0.0", w: 0, ear: 0, light: 0, hands: null, mode: "none" };
  const HUD_HAND = /[?&]hudhand=1\b/.test(location.search);

  // ---- the HUD hand (opt-in) ------------------------------------------------------------------------------------------------------
  let img = null, outfitFiles = {};
  if (HUD_HAND) {
    fetch("art/hud/hands.json").then(r => r.json()).then(j => { H.hands = j; }).catch(() => { H.hands = {}; });
    fetch("people/real/index.json").then(r => r.json()).then(j => { (j.outfits || []).forEach(o => { if (o.id && o.file && !outfitFiles[o.id]) outfitFiles[o.id] = o.file.replace(/^\.\.\//, ""); }); H.player = j.player; }).catch(() => {});
  }
  function handFor() {
    if (!H.hands) return null;
    let f = (typeof player === "object" && player.outfit && outfitFiles[player.outfit]) || H.player || "seiko_suit_charcoal.glb";
    if (/^seiko_village/.test(f)) f = "seiko_player.glb";
    return H.hands[f] || H.hands["seiko_suit_charcoal.glb"] || null;
  }
  function fit() {
    const old = document.getElementById("phonehand");
    if (!HUD_HAND) { if (old) old.remove(); return; }
    const ph = document.getElementById("phone"), body = document.getElementById("phonebody");
    if (!ph || !body) return;
    const h = handFor();
    if (!img) {
      img = old || document.createElement("img"); img.id = "phonehand"; img.alt = "";
      img.style.cssText = "position:absolute;pointer-events:none;z-index:5;max-width:none;filter:drop-shadow(0 10px 18px rgba(0,0,0,.45));";
      ph.appendChild(img);
    }
    if (!h) { img.style.display = "none"; return; }
    if (img.dataset.src !== h.img) { img.src = h.img; img.dataset.src = h.img; }
    const pr = ph.getBoundingClientRect(), br = body.getBoundingClientRect();
    if (!br.width) return;
    const k = br.width / (h.phone[2] - h.phone[0]);
    img.style.width = (h.size[0] * k) + "px"; img.style.height = (h.size[1] * k) + "px";
    img.style.left = (br.left - pr.left - h.phone[0] * k) + "px";
    img.style.top = (br.bottom - pr.top - h.phone[3] * k) + "px";
    img.style.display = "";
  }
  H.fit = fit;

  // ---- the handset ----------------------------------------------------------------------------------------------------------------
  const PW = 0.071, PH = 0.150, PT = 0.0082;           // a 6.1-inch phone, in metres
  let mesh = null, screenTex = null, texAt = 0;
  function slab(w, h, r, depth, bevel) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
    g.translate(0, 0, -depth / 2);
    return g;
  }
  function roundedPlane(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ShapeGeometry(s, 6);
    // UVs across the screen, 0..1
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - x) / w, (p.getY(i) - y) / h);
    return g;
  }
  function handset() {
    if (mesh) return mesh;
    mesh = new THREE.Group(); mesh.name = "seiko-phone";
    const A = window.ShopAAA && ShopAAA.mat;
    const rail = A ? ShopAAA.mat("metal", "#2a2d33") : new THREE.MeshBasicMaterial({ color: 0x2a2d33 });
    const back = A ? ShopAAA.mat("plastic", "#16181c") : rail;
    const body = new THREE.Mesh(slab(PW - 0.002, PH - 0.002, 0.009, PT - 0.002, 0.001), [back, rail]);
    // the screen: glass that shows what the HUD phone shows
    const cv = document.createElement("canvas"); cv.width = 135; cv.height = 292;
    screenTex = new THREE.CanvasTexture(cv); screenTex.encoding = THREE.sRGBEncoding; screenTex.anisotropy = 4;
    const glassBlack = new THREE.Mesh(roundedPlane(PW - 0.002, PH - 0.002, 0.0085), new THREE.MeshBasicMaterial({ color: 0x050608 })); // aaa-ok: the black glass round the lit screen
    glassBlack.position.z = PT / 2 + 0.0002;
    const screen = new THREE.Mesh(roundedPlane(PW - 0.0055, PH - 0.0055, 0.007), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
    screen.position.z = PT / 2 + 0.0004;
    // the camera bump on the back, top left as you look at the back
    const bump = new THREE.Mesh(slab(0.026, 0.026, 0.006, 0.0014, 0.0004), rail);
    bump.position.set(PW / 2 - 0.018, PH / 2 - 0.018, -PT / 2 - 0.0007);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 16), new THREE.MeshBasicMaterial({ color: 0x0a0c10 })); // aaa-ok: camera lens glass
    lens.position.set(PW / 2 - 0.0225, PH / 2 - 0.0135, -PT / 2 - 0.0016); lens.rotation.y = Math.PI;
    const lens2 = lens.clone(); lens2.position.y = PH / 2 - 0.0225;
    [body, glassBlack, screen, bump, lens, lens2].forEach(m => { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; mesh.add(m); });
    mesh.visible = false;
    return mesh;
  }
  function screenUpdate(force) {
    if (!screenTex) return;
    const now = performance.now(); if (!force && now - texAt < 250) return; texAt = now;
    const cv = screenTex.image, g = cv.getContext("2d");
    const src = document.getElementById("phonecanvas");
    try {
      if (H.mode === "ear") { g.fillStyle = "#020304"; g.fillRect(0, 0, cv.width, cv.height); }   // the screen goes off against his cheek
      else if (src && src.width) g.drawImage(src, 0, 0, cv.width, cv.height); else throw 0;
    } catch (e) { const gr = g.createLinearGradient(0, 0, 0, cv.height); gr.addColorStop(0, "#3f6fd8"); gr.addColorStop(1, "#c46ad8"); g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height); }
    screenTex.needsUpdate = true;
  }

  // ---- his skeleton ---------------------------------------------------------------------------------------------------------------
  let bones = null, bonesFor = null;
  function findBones() {
    if (bonesFor === player.obj && bones) return bones;
    const b = { fing: [[], [], [], [], []] };
    player.obj.traverse(o => {
      if (!o.isBone) return; const n = o.name;
      if (/R_UpperArm$/.test(n)) b.ua = o; else if (/L_UpperArm$/.test(n)) b.la = o; else if (/R_Forearm$/.test(n)) b.fa = o; else if (/R_Hand$/.test(n)) b.hand = o;
      else if (/(^|_)Head$/.test(n)) b.head = o; else if (/(^|_)Neck$/.test(n)) b.neck = o;
      else { const m = /R_Finger(\d)(\d?)$/.exec(n); if (m) b.fing[+m[1]][m[2] === "" ? 0 : +m[2]] = o; }
    });
    bonesFor = player.obj;
    bones = b.ua && b.fa && b.hand && b.head && b.fing[1][0] && b.fing[2][0] && b.fing[4][0] ? b : null;
    if (bones) {
      // the fingers' own pose, kept to curl from every frame (the walk clips may not move them, so curling them in place would add up)
      b.digits = [].concat.apply([], b.fing).filter(Boolean); b.digitBase = b.digits.map(o => o.quaternion.clone());
      b.main = [b.ua, b.fa, b.hand, b.head]; b.snap = b.main.map(o => o.quaternion.clone()); b.wrote = [];
    }
    return bones;
  }
  const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qi = new THREE.Quaternion();
  function worldRot(bone, q) {
    // turn a bone by q in world space
    bone.getWorldQuaternion(_q1); bone.parent.getWorldQuaternion(_q2);
    _q1.premultiply(q); bone.quaternion.copy(_q2.invert().multiply(_q1)); bone.updateMatrixWorld(true);
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function aim(bone, from, to, w) {
    const q = new THREE.Quaternion().setFromUnitVectors(_a.copy(from).normalize(), _b.copy(to).normalize());
    if (w < 1) q.slerp(_qi, 1 - w);
    worldRot(bone, q);
  }
  let _ext = null;
  const wp = (o, v) => o.getWorldPosition(v || new THREE.Vector3());
  // the hand's frame as it is now: f along the middle finger, a across the knuckles (little finger to index), p out of the palm
  function handFrame(B) {
    const h = wp(B.hand), m = wp(B.fing[2][0]), i = wp(B.fing[1][0]), k = wp(B.fing[4][0]);
    const f = m.sub(h).normalize(), a = i.sub(k); a.addScaledVector(f, -a.dot(f)).normalize();
    const p = new THREE.Vector3().crossVectors(a, f);
    return { f: f, a: a, p: p };
  }
  function basisQ(x, y, z) { return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); }

  // ---- the two holds --------------------------------------------------------------------------------------------------------------
  //   face: a forearm in front of his chest, below his chin, a hand's width to the right; screen to his eyes
  //   ear:  against his right ear, top of the phone by the ear, the bottom towards his mouth
  function holdFrame(kind, head, fwd, right) {
    const up = new THREE.Vector3(0, 1, 0);
    if (kind === "ear") {
      const n = right.clone().negate();                                         // screen faces his cheek
      const pu = up.clone().multiplyScalar(0.72).addScaledVector(fwd, -0.70);    // from his mouth up to his ear
      pu.addScaledVector(n, -pu.dot(n)).normalize();
      const pr = new THREE.Vector3().crossVectors(pu, n);
      const P = head.clone().addScaledVector(right, 0.095).addScaledVector(fwd, 0.035).addScaledVector(up, -0.035);
      // fingers up the back of the phone towards the back of his head, a little across
      const fD = pu.clone().multiplyScalar(0.80).addScaledVector(pr, -0.6).normalize();
      return { P: P, n: n, up: pu, right: pr, fD: fD, grip: H.tune.ear.grip, pole: new THREE.Vector3(0, -0.55, 0).addScaledVector(right, 0.8).addScaledVector(fwd, 0.25) };
    }
    const P = head.clone().addScaledVector(fwd, 0.30).addScaledVector(right, 0.05).addScaledVector(up, -0.27);
    const n = head.clone().add(new THREE.Vector3(0, 0.02, 0)).sub(P).normalize();   // screen to his eyes
    const pr = right.clone(); pr.addScaledVector(n, -pr.dot(n)).normalize();
    const pu = new THREE.Vector3().crossVectors(n, pr);
    // fingers across the back of the phone towards its left edge, a little up; the thumb lies up the right edge
    const fD = pr.clone().multiplyScalar(-0.86).addScaledVector(pu, 0.5).normalize();
    return { P: P, n: n, up: pu, right: pr, fD: fD, grip: H.tune.face.grip, pole: new THREE.Vector3(0, -1, 0).addScaledVector(right, 0.55).addScaledVector(fwd, -0.2) };
  }
  // fingers curl round the edge, more for the ring and little fingers; [proximal, middle, distal] in degrees
  //   grip: [wrist to the phone's middle along the fingers, ... along the phone, out of the palm] in metres
  H.tune = {
    face: { grip: [0.085, 0.020, 0.024], curl: [null, [8, 70, 45], [6, 74, 48], [8, 78, 50], [12, 80, 52]] },
    ear: { grip: [0.070, 0.0, 0.024], curl: [null, [6, 50, 30], [6, 54, 32], [8, 58, 34], [12, 62, 36]] }
  };

  function relax(B) { B.digits.forEach((o, i) => o.quaternion.copy(B.digitBase[i])); }
  function pose(w, kind, fresh) {
    const B = findBones(); if (!B) return null;
    // fresh: his clip has just set his arm and head for this frame, so keep that as the pose to work from; otherwise start again from it
    // (a bone his clip does not move still holds what we wrote last frame: start that one from its pose before we touched it)
    B.main.forEach((o, i) => { if (fresh && !(B.wrote[i] && o.quaternion.equals(B.wrote[i]))) B.snap[i].copy(o.quaternion); else o.quaternion.copy(B.snap[i]); });
    relax(B);
    player.obj.updateMatrixWorld(true);
    const S = wp(B.ua), E = wp(B.fa), Wr = wp(B.hand), head = wp(B.head);
    // which way he is facing, from his own shoulders (so it follows a turn or a lean in his clip)
    const right = B.la ? S.clone().sub(wp(B.la)) : new THREE.Vector3(-Math.cos(player.yaw), 0, Math.sin(player.yaw));
    right.y = 0; right.normalize();
    const fwd = new THREE.Vector3(0, 1, 0).cross(right).normalize();
    const F = holdFrame(kind, head, fwd, right);
    // the wrist sits behind and below the middle of the phone, so the palm is behind the phone
    const T = F.P.clone().addScaledVector(F.fD, -F.grip[0]).addScaledVector(F.up, -F.grip[1] * (kind === "ear" ? 0 : 1)).addScaledVector(F.n, -F.grip[2]);
    // the arm: two-bone IK, elbow towards the pole
    const a = E.distanceTo(S), b = Wr.distanceTo(E);
    const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, T.distanceTo(S)));
    const dir = T.clone().sub(S).normalize();
    const pole = F.pole.clone(); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const x = (a * a - b * b + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, a * a - x * x));
    const E2 = S.clone().addScaledVector(dir, x).addScaledVector(pole, hh);
    aim(B.ua, E.clone().sub(S), E2.sub(S), w);
    const E3 = wp(B.fa), W3 = wp(B.hand);
    aim(B.fa, W3.clone().sub(E3), T.clone().sub(E3), w);
    // the hand: palm behind the phone, fingers across it
    const C = handFrame(B);
    const pD = F.n.clone(), aD = new THREE.Vector3().crossVectors(F.fD, pD).normalize(), fD = new THREE.Vector3().crossVectors(pD, aD);
    const qC = basisQ(C.f, C.p, C.a), qD = basisQ(fD, pD, aD);   // (f, p, a) is a right-handed frame
    const dq = qD.multiply(qC.invert());
    if (w < 1) dq.slerp(_qi, 1 - w);
    worldRot(B.hand, dq);
    // the fingers, joint by joint, round the edge (a rotation about the knuckle line moves the tip towards the palm side)
    const C2 = handFrame(B), curl = H.tune[kind].curl;
    for (let f = 1; f <= 4; f++) {
      const ch = B.fing[f];
      for (let j = 0; j < 3; j++) { if (!ch[j]) continue; worldRot(ch[j], new THREE.Quaternion().setFromAxisAngle(C2.a, THREE.MathUtils.degToRad(curl[f][j]) * w)); }
    }
    // the thumb lies along the right edge: bring it up and a little over the glass
    const th = B.fing[0];
    if (th[0] && th[1]) {
      const t0 = wp(th[0]), t1 = wp(th[1]), td = t1.sub(t0).normalize();
      const want = F.up.clone().multiplyScalar(kind === "ear" ? 0.2 : 0.85).addScaledVector(fD, kind === "ear" ? 0.6 : 0.15).addScaledVector(pD, 0.25).normalize();
      aim(th[0], td, want, w * 0.8);
      for (let j = 1; j < 3; j++) if (th[j]) worldRot(th[j], new THREE.Quaternion().setFromAxisAngle(C2.a, THREE.MathUtils.degToRad(kind === "ear" ? 20 : 12) * w));
    }
    // reading it, his head drops a little; on a call it tips a touch towards the phone
    if (kind === "face") { const look = F.P.clone().sub(head).normalize(); aim(B.head, fwd, look, 0.6 * w); }
    else aim(B.head, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0).addScaledVector(right, 0.12), w);
    B.main.forEach((o, i) => { B.wrote[i] = o.quaternion.clone(); });
    // where the phone actually is, from the hand as posed (so it never floats off his palm)
    const h = wp(B.hand), C3 = handFrame(B);
    const at = h.addScaledVector(C3.f, F.grip[0]).addScaledVector(F.up, kind === "ear" ? 0 : F.grip[1]).addScaledVector(C3.p, F.grip[2]);
    return { at: at, q: basisQ(F.right, F.up, F.n), head: head, fwd: fwd, n: F.n };
  }

  // ---- when ---------------------------------------------------------------------------------------------------------------------
  function onFoot() {
    return player && player.obj && player.usingGlb && player.mode === "walk" &&
      !(typeof drive === "object" && (drive.car || drive.train)) && !(typeof cut === "object" && cut.active) &&
      !(typeof interior === "object" && (interior.sit || interior.card)) && !(typeof cameraFullOn === "function" && cameraFullOn()) &&
      !(window.ragdoll && ragdoll.active);
  }
  function onCall() {
    if (typeof phone === "object" && phone.open && phone.app === "Phone" && (phone.call || phone.vmail)) return true;
    const M = window.career && career.menuState;
    return !!(M && M.on && M.o && /📞|^Call/.test(String(M.o.head || "")) );
  }
  function wanted() {
    if (!onFoot()) return "none";
    if (onCall()) return "ear";
    if (typeof phone === "object" && phone.open) return "face";
    return "none";
  }
  H.wanted = wanted;
  function lightNow() {
    const n = typeof nightState === "object" ? nightState.lit || 0 : 0;
    return (typeof interior === "object" && interior.active) ? 0.15 : n;
  }
  function ensureLight() {
    if (typeof interior !== "object" || typeof scene === "undefined" || !scene) return null;
    if (!interior.light) { interior.light = new THREE.PointLight(0xfff2dd, 0, 14, 1.6); scene.add(interior.light); }
    return interior.light;
  }
  let lastT = performance.now(), lit = false, shown = "face", ranAt = 0;
  function after(dt, fresh) {
    if (fresh) ranAt = performance.now();
    const want = wanted();
    // going between the two holds, the phone comes down to the chest first
    if (want !== "none" && want !== shown) { H.w -= dt * 6; if (H.w <= 0.05) { H.w = 0.05; shown = want; screenUpdate(true); } }
    else H.w += ((want === "none" ? 0 : 1) - H.w) * Math.min(1, dt * 10);
    H.mode = H.w > 0.01 ? shown : "none";
    if (H.w < 0.01) {
      if (H.w > 0 && bones && bonesFor === player.obj) { relax(bones); bones.main.forEach((o, i) => o.quaternion.copy(bones.snap[i])); bones.wrote = []; }
      H.w = 0; if (mesh) mesh.visible = false;
      if (lit) { const L = ensureLight(); if (L && !(interior && interior.active)) L.intensity = 0; lit = false; }
      return;
    }
    const e = H.w * H.w * (3 - 2 * H.w);                 // smoothstep: the arm accelerates up and settles
    const P = pose(e, shown, fresh); if (!P) return;
    const m = handset(); if (!m.parent) scene.add(m);
    m.position.copy(P.at); m.quaternion.copy(P.q);
    m.visible = e > 0.55;
    screenUpdate();
    const L = interior.active ? null : ensureLight(), k = lightNow();
    if (L) {
      L.color.setHex(0xd6e4ff); L.distance = 3; L.decay = 2;
      L.position.copy(m.position).addScaledVector(P.n, 0.10);
      L.intensity = (shown === "ear" ? 0.5 : 2.4) * k * e; lit = true; H.light = L.intensity;
    }
  }
  const originals = {};
  function wrap(name, f) { const o = window[name]; if (typeof o !== "function") return false; originals[name] = o; window[name] = f(o); return true; }
  // for probes that load a newer copy of this file into a running game
  H.unhook = () => { Object.keys(originals).forEach(k => { window[k] = originals[k]; }); H.dead = true; if (mesh && mesh.parent) mesh.parent.remove(mesh); };
  // after his animation is applied for the frame, before it is drawn
  wrap("updateSeikoClip", orig => function (dt) {
    const r = orig.apply(this, arguments);
    try { after(Math.min(0.1, dt || 1 / 60), true); } catch (e) { if (!H.err) { H.err = e; console.warn("[phone-hand]", e); } }
    return r;
  });
  wrap("setPhone", orig => function (on) {
    const r = orig.apply(this, arguments);
    try { fit(); } catch (e) { /* no phone yet */ }
    return r;
  });
  addEventListener("resize", () => { try { fit(); } catch (e) { /* no phone */ } });
  try { fit(); } catch (e) { /* later */ }
  (function loop() {
    if (H.dead) return;
    requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    // no mixer this frame (the clip is not running): pose him here so the phone still comes up and goes down
    if (typeof player === "object" && player && now - ranAt > 120 && (H.w > 0 || wanted() !== "none")) try { after(dt, false); } catch (e) { /* later */ }
    if (typeof scene !== "undefined" && scene && typeof interior === "object" && !interior.light) ensureLight();
  })();
  H.report = () => ({ version: H.version, wanted: wanted(), mode: H.mode, weight: +H.w.toFixed(2), light: +(H.light || 0).toFixed(2), bones: !!(player && player.obj && findBones()), hudHand: HUD_HAND });
  console.log("[phone-hand] " + H.version + " ready");
})();
