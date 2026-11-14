// Seiko's phone, in his hand.
//
// * In the world: when the phone is up and he is on foot, his right arm comes up (a two-bone IK on the upper arm and forearm, eased
//   in and out over a quarter of a second) and he holds a handset in front of his chest, screen towards his face. Its screen glows,
//   and after dark it lights what is round him: his face, his hand, the wall he is leaning on. The light is the interior light
//   the game already has (idle while you are outdoors), so no new light is added to the scene and nothing recompiles.
// * In the HUD: his own hand round the phone, rendered from his realistic model in the outfit he is wearing
//   (Web/art/hud/hand_<outfit>.png, made by Tools/hud/build_hands.sh): thumb over the right edge of the screen, fingertips round the
//   left edge, the cuff and sleeve going off the bottom right of the screen.
//
// Off switch: ?phonehand=0 (or localStorage konto.phonehand=0).
(function () {
  "use strict";
  let off = /[?&]phonehand=0\b/.test(location.search);
  try { off = off || localStorage.getItem("konto.phonehand") === "0"; } catch (e) { /* private window */ }
  if (off || typeof THREE === "undefined") return;
  const H = window.phoneHand = { version: "1.0.0", w: 0, light: 0, hands: null, outfit: null };

  // ---- the HUD hand ---------------------------------------------------------------------------------------------------------------
  let img = null, outfitFiles = {};
  fetch("art/hud/hands.json").then(r => r.json()).then(j => { H.hands = j; }).catch(() => { H.hands = {}; });
  fetch("people/real/index.json").then(r => r.json()).then(j => { (j.outfits || []).forEach(o => { if (o.id && o.file && !outfitFiles[o.id]) outfitFiles[o.id] = o.file.replace(/^\.\.\//, ""); }); H.player = j.player; }).catch(() => {});
  function handFor() {
    if (!H.hands) return null;
    let f = (typeof player === "object" && player.outfit && outfitFiles[player.outfit]) || H.player || "seiko_suit_charcoal.glb";
    // the village clothes' hands are painted like work gloves; his own bare hand reads better round a phone
    if (/^seiko_village/.test(f)) f = "seiko_player.glb";
    return H.hands[f] || H.hands["seiko_suit_charcoal.glb"] || null;
  }
  function fit() {
    const ph = document.getElementById("phone"), body = document.getElementById("phonebody");
    if (!ph || !body) return;
    const h = handFor();
    if (!img) {
      img = document.createElement("img"); img.id = "phonehand"; img.alt = "";
      img.style.cssText = "position:absolute;pointer-events:none;z-index:5;max-width:none;filter:drop-shadow(0 10px 18px rgba(0,0,0,.45));";
      ph.appendChild(img);
    }
    if (!h) { img.style.display = "none"; return; }
    if (img.dataset.src !== h.img) { img.src = h.img; img.dataset.src = h.img; }
    // scale the picture so its phone is the game's phone (by width), and put its phone over the phone
    const pr = ph.getBoundingClientRect(), br = body.getBoundingClientRect();
    if (!br.width) return;
    const k = br.width / (h.phone[2] - h.phone[0]);
    img.style.width = (h.size[0] * k) + "px"; img.style.height = (h.size[1] * k) + "px";
    img.style.left = (br.left - pr.left - h.phone[0] * k) + "px";
    // the picture's phone is a little taller than the game's handset: keep the hand on the lower part of the handset
    img.style.top = (br.bottom - pr.top - h.phone[3] * k) + "px";
    img.style.display = "";
  }
  H.fit = fit;

  // ---- the arm, the handset and its light -----------------------------------------------------------------------------------------
  let bones = null, bonesFor = null, mesh = null, screenMat = null, screenTex = null, texAt = 0;
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  function findBones() {
    if (bonesFor === player.obj && bones) return bones;
    const b = {};
    player.obj.traverse(o => { if (!o.isBone) return; if (/R_UpperArm$/.test(o.name)) b.ua = o; else if (/R_Forearm$/.test(o.name)) b.fa = o; else if (/R_Hand$/.test(o.name)) b.hand = o; else if (/(^|_)Head$/.test(o.name)) b.head = o; else if (/Neck$/.test(o.name)) b.neck = o; });
    bonesFor = player.obj; bones = b.ua && b.fa && b.hand && b.head ? b : null;
    return bones;
  }
  function handset() {
    if (mesh) return mesh;
    mesh = new THREE.Group(); mesh.name = "seiko-phone";
    const mat = window.ShopAAA && ShopAAA.mat ? ShopAAA.mat("metal", "#1d2026") : null;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.152, 0.008), mat || new THREE.MeshBasicMaterial({ color: 0x1d2026 }));
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 128;
    screenTex = new THREE.CanvasTexture(cv); screenTex.encoding = THREE.sRGBEncoding;
    screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.144), screenMat); screen.position.z = 0.0042;
    body.castShadow = false; mesh.add(body, screen);
    mesh.visible = false;
    return mesh;
  }
  // the screen's picture: what the phone shows, shrunk (or a lit home screen when there is no canvas to copy)
  function screenUpdate() {
    if (!screenTex) return;
    const now = performance.now(); if (now - texAt < 500) return; texAt = now;
    const cv = screenTex.image, g = cv.getContext("2d");
    const src = document.querySelector("#phone canvas");
    try { if (src && src.width) g.drawImage(src, 0, 0, cv.width, cv.height); else throw 0; }
    catch (e) { const gr = g.createLinearGradient(0, 0, 0, cv.height); gr.addColorStop(0, "#3f6fd8"); gr.addColorStop(1, "#c46ad8"); g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height); }
    screenTex.needsUpdate = true;
  }
  function worldRot(bone, q) {
    // turn a bone by q in world space
    bone.getWorldQuaternion(q1); bone.parent.getWorldQuaternion(q2);
    q1.premultiply(q); bone.quaternion.copy(q2.invert().multiply(q1));
  }
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  function aim(bone, from, to, w) {
    // rotate bone so the direction 'from' becomes 'to' (world), by weight w
    const q = new THREE.Quaternion().setFromUnitVectors(tmpA.copy(from).normalize(), tmpB.copy(to).normalize());
    if (w < 1) q.slerp(new THREE.Quaternion(), 1 - w);
    worldRot(bone, q); bone.updateMatrixWorld(true);
  }
  function pose(w) {
    const B = findBones(); if (!B) return null;
    player.obj.updateMatrixWorld(true);
    const S = B.ua.getWorldPosition(new THREE.Vector3()), E = B.fa.getWorldPosition(new THREE.Vector3()), Wp = B.hand.getWorldPosition(new THREE.Vector3());
    const head = B.head.getWorldPosition(new THREE.Vector3());
    const fy = player.yaw, fwd = new THREE.Vector3(Math.sin(fy), 0, Math.cos(fy)), right = new THREE.Vector3(-Math.cos(fy), 0, Math.sin(fy));
    // where the phone is held: a forearm in front of the chest, a little to the right, below the chin
    const a = E.distanceTo(S), b = Wp.distanceTo(E);
    const T = head.clone().addScaledVector(fwd, 0.30).addScaledVector(right, 0.07).add(new THREE.Vector3(0, -0.36, 0));
    // the elbow: in the plane of the arm, down and out
    const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, T.distanceTo(S)));
    const dir = T.clone().sub(S).normalize();
    const pole = new THREE.Vector3(0, -1, 0).addScaledVector(right, 0.55).addScaledVector(fwd, -0.15);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const x = (a * a - b * b + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, a * a - x * x));
    const E2 = S.clone().addScaledVector(dir, x).addScaledVector(pole, hh);
    aim(B.ua, v1.copy(E).sub(S), v2.copy(E2).sub(S), w);
    const E3 = B.fa.getWorldPosition(new THREE.Vector3()), W3 = B.hand.getWorldPosition(new THREE.Vector3());
    aim(B.fa, v1.copy(W3).sub(E3), v2.copy(T).sub(E3), w);
    return { hand: B.hand.getWorldPosition(new THREE.Vector3()), head: head, fwd: fwd, right: right };
  }
  function lightNow() {
    const n = typeof nightState === "object" ? nightState.lit || 0 : 0;
    return (typeof interior === "object" && interior.active) ? 0.15 : n;
  }
  function holding() {
    return typeof phone === "object" && phone.open && player && player.obj && player.usingGlb && player.mode === "walk" &&
      !(typeof drive === "object" && (drive.car || drive.train)) && !(typeof cut === "object" && cut.active) &&
      !(typeof interior === "object" && (interior.sit || interior.card)) && !(typeof cameraFullOn === "function" && cameraFullOn());
  }
  function ensureLight() {
    // the interior light doubles as the phone's own: outdoors it is idle at zero
    if (typeof interior !== "object" || typeof scene === "undefined" || !scene) return null;
    if (!interior.light) { interior.light = new THREE.PointLight(0xfff2dd, 0, 14, 1.6); scene.add(interior.light); }
    return interior.light;
  }
  let lastT = performance.now(), lit = false;
  function after(dt) {
    const want = holding() ? 1 : 0;
    H.w += (want - H.w) * Math.min(1, dt * 9);
    if (H.w < 0.01) { H.w = 0; if (mesh) mesh.visible = false; if (lit) { const L = ensureLight(); if (L && !(interior && interior.active)) L.intensity = 0; lit = false; } return; }
    const P = pose(H.w); if (!P) return;
    const m = handset(); if (!m.parent) scene.add(m);
    // in the palm, screen to his eyes
    m.position.copy(P.hand).addScaledVector(P.fwd, 0.055).add(new THREE.Vector3(0, 0.03, 0));
    m.lookAt(P.head); m.visible = H.w > 0.5;
    screenUpdate();
    // indoors the room's own light rig is on that light, and a lit room needs no phone to see by
    const L = interior.active ? null : ensureLight(), k = lightNow();
    if (L) {
      L.color.setHex(0xd6e4ff); L.distance = 5; L.decay = 2;
      L.position.copy(m.position).addScaledVector(P.fwd, -0.12).add(new THREE.Vector3(0, 0.05, 0));
      L.intensity = 2.4 * k * H.w; lit = true; H.light = L.intensity;
    }
  }
  // after his animation is applied for the frame, before it is drawn
  function wrap(name, f) { const o = window[name]; if (typeof o !== "function") return false; window[name] = f(o); return true; }
  wrap("updateSeikoClip", orig => function (dt) {
    const r = orig.apply(this, arguments);
    try { after(dt || 1 / 60); } catch (e) { if (!H.err) { H.err = e; console.warn("[phone-hand]", e); } }
    return r;
  });
  wrap("setPhone", orig => function (on) {
    const r = orig.apply(this, arguments);
    try { fit(); } catch (e) { /* no phone yet */ }
    return r;
  });
  addEventListener("resize", () => { try { fit(); } catch (e) { /* no phone */ } });
  // standing still with the phone up: the mixer still runs, so the pose keeps being applied; if he has no mixer, run it here
  (function loop() {
    requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (typeof player === "object" && player && !player.mixer && H.w > 0) try { after(dt); } catch (e) { /* later */ }
    // the light exists from the start, so the first time the phone comes out nothing has to be recompiled
    if (typeof scene !== "undefined" && scene && typeof interior === "object" && !interior.light) ensureLight();
  })();
  H.report = () => ({ version: H.version, holding: holding(), weight: +H.w.toFixed(2), light: +(H.light || 0).toFixed(2), hand: handFor() && handFor().img });
  console.log("[phone-hand] " + H.version + " ready");
})();
