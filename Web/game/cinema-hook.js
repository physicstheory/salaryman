// Cinema: a lift for every cutscene, without touching the shots already written.
//
//   A camera that breathes   every shot gets a slow, organic drift (two layered sine noises on position and aim), so a held shot is never a
//                            dead still frame. shot.handheld = 0..1 asks for more (a party, a drunk walk); shot.steady = true turns it off.
//   A push-in on held shots  a shot with no `to` creeps forward 4% of the way to what it looks at: the eye reads it as tension, not a freeze.
//                            shot.push = 0 turns it off, 2 doubles it.
//   Lens moves               shot.fovTo (with shot.fov) zooms through the shot; with a push-in it makes the classic dolly-zoom.
//   Shot changes             shot.dip = seconds: a dip through black into the shot (time passing, a new place).
//   Someone speaking         shot.speaker = an actor: they shift their weight and turn a little while their lines are up.
//   The film look            grain, a soft vignette and gently fading subtitles while body.cutscene is on (CSS only; costs nothing).
//
// Off switch: ?cinema=0. Tuning from the console: cinema.amount = 1 (the default breathing), cinema.grain = 0.06.
(function () {
  "use strict";
  if (/[?&]cinema=0\b/.test(location.search)) return;
  if (typeof cutTick !== "function" || typeof present !== "function") return;
  const K = window.cinema = { amount: 1, grain: 0.055, version: "1.0.0" };

  // ---- the film look --------------------------------------------------------------------------------------------------------------------
  const st = document.createElement("style");
  const grainSvg = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.4 -0.2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  st.textContent = `
#cutfilm{position:fixed;inset:0;z-index:28;pointer-events:none;display:none}
body.cutscene #cutfilm{display:block}
#cutfilm::before{content:"";position:absolute;inset:-60px;background:url("${grainSvg}");opacity:var(--grain,.055);animation:cutgrain .5s steps(4) infinite;mix-blend-mode:overlay}
#cutfilm::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 55%,rgba(0,0,0,.42) 100%)}
@keyframes cutgrain{0%{transform:translate(0,0)}25%{transform:translate(-37px,21px)}50%{transform:translate(19px,-44px)}75%{transform:translate(-12px,33px)}100%{transform:translate(0,0)}}
#cutsub span,#cutsub b{animation:cutsubin .35s ease-out both}
@keyframes cutsubin{from{opacity:0;filter:blur(3px);transform:translateY(6px)}to{opacity:1;filter:none;transform:none}}
`;
  document.head.appendChild(st);
  const film = document.createElement("div"); film.id = "cutfilm"; document.body.appendChild(film);

  // ---- the camera ---------------------------------------------------------------------------------------------------------------------------
  const _f = new THREE.Vector3(), _l = new THREE.Vector3(), _a = new THREE.Vector3();
  const noise = (t, a, b, c) => Math.sin(t * a) * 0.6 + Math.sin(t * b + 1.7) * 0.3 + Math.sin(t * c + 4.1) * 0.1;
  let T = 0, shotWas = -1, dipEl = null;
  const pres = window.present;
  window.present = function () {
    if (cut.active && cut.shots[cut.i]) try { shape(cut.shots[cut.i]); } catch (e) { /* the shot plays plain */ }
    return pres.apply(this, arguments);
  };
  function shape(s) {
    T = performance.now() / 1000;
    if (shotWas !== cut.i) { shotWas = cut.i; enter(s); }
    const u = Math.max(0, Math.min(1, cut.t / (s.dur || 1))), e = u * u * (3 - 2 * u);
    // push-in on a held shot
    const from = typeof s.from === "function" ? null : s.from;
    if (!s.to && from && s.push !== 0) {
      _f.fromArray(from.pos); _l.fromArray(from.look); const d = _f.distanceTo(_l);
      camera.translateZ(-d * 0.04 * (s.push || 1) * e);
    }
    // the breathing, or handheld
    if (!s.steady && K.amount > 0) {
      const h = (s.handheld !== undefined ? s.handheld : 0) * K.amount;   // konto.html's cutTick already gives every shot a slow drift (shake); this adds handheld on top
      camera.position.x += noise(T, 0.9, 2.1, 5.3) * 0.016 * h; camera.position.y += noise(T + 3, 1.1, 2.6, 6.1) * 0.012 * h; camera.position.z += noise(T + 7, 0.7, 1.9, 4.7) * 0.016 * h;
      camera.rotateX(noise(T + 11, 0.8, 1.7, 4.3) * 0.0045 * h); camera.rotateY(noise(T + 17, 0.6, 1.5, 3.9) * 0.006 * h); camera.rotateZ(noise(T + 23, 0.5, 1.3, 3.1) * 0.002 * h);
    }
    // a zoom through the shot
    if (s.fovTo) { camera.fov = (s.fov || cut.fovWas || camera.fov) + (s.fovTo - (s.fov || cut.fovWas || camera.fov)) * e; camera.updateProjectionMatrix(); }
    // someone talking moves a little
    const a = s.speaker;
    if (a && a.holder) { if (a._yaw0 === undefined) a._yaw0 = a.yaw; const talking = (s.lines || []).some(L => cut.t >= L[0] && cut.t < L[0] + 2.6); a.holder.rotation.y = a.yaw + (talking ? Math.sin(T * 1.7) * 0.05 + Math.sin(T * 3.1) * 0.02 : 0); }
  }
  function enter(s) {
    film.style.setProperty("--grain", String(K.grain));
    if (s.dip) {
      dipEl = dipEl || document.getElementById("fade");
      if (dipEl) { dipEl.style.transition = "none"; dipEl.style.opacity = "1"; void dipEl.offsetWidth; dipEl.style.transition = "opacity " + s.dip + "s"; dipEl.style.opacity = "0"; }
    }
  }
  console.log("[Cinema] " + K.version + " · breathing camera, push-ins, lens moves, film look");
})();
