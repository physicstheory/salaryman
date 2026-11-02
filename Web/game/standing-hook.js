// The game's side of the Shigoto standing engine (SHIGOTO.Honor, SHIGOTO.Respect, SHIGOTO.StandingHud; Engine/src/standing).
//
// HONOR — what kind of man Seiko is.
//   Every crime costs honor the moment it is done, seen or not: a red seal with the deed's mark and a minus slides in
//   under the wanted stars. The phone call a witness makes about it later is the same deed, not a second one.
//   Strangers on the street sometimes need help: they wave and call out ("Sumimasen!"), and walking up and pressing
//   E helps them. Directions, train fare, spilled shopping, a lost wallet (give it back, or keep it), walking someone
//   to the corner. Helping earns honor (a gold seal with a plus); taking the job and walking off breaks your word.
//   Honor changes how people treat him: who asks him for help, how warmly they answer a greeting.
//
// RESPECT — how people regard him.
//   Hold Z (gamepad: hold LT with no weapon out) to regard the person in front of you: a marker shows who they are and their temper.
//   B bows (gamepad B), N antagonises (gamepad RT). They answer in kind: a deep bow, a bow, a nod, nothing, a flinch,
//   a glare, a squared-up chest. Rank at SOTI sets the floor of his respect, and promotion lifts it; bowing to many
//   people builds a habit of courtesy, and strangers start bowing to him first (bow back for a little more).
//   Hold Z with nobody in front of you to see the standing card.
//
// API for missions (window.standing):
//   standing.deed(id, opts)       report a deed from the table below (or define new ones with standing.honor.define)
//   standing.earn(delta, label)   respect for a job well done, a story beat
//   standing.promote(rankId)      set Seiko's SOTI rank (ids in SOTI_RANKS); also read from story.flags.sotiRank
//   standing.honor / .respect     the engine objects;  standing.card()  toggles the card;  console shigoto.standing()
//
// Saved with the game (snapshot.standing). Off switch: ?standing=0.

(function () {
  if (!window.SHIGOTO || !SHIGOTO.Honor || !SHIGOTO.Respect) { console.warn("[Konto] standing engine not in this build"); return; }
  if (/[?&]standing=0\b/.test(location.search)) { console.log("[Konto] standing turned off"); return; }

  // ---- the deeds ------------------------------------------------------------------------------------------------------------------------
  // Crime ids are the game's CRIMES ids, so every crime the police know about costs honor too.
  const DEEDS = {
    jacking:   { delta: -5,  label: "Stole a car",                icon: "car",       cooldown: 20, same: ["jackSeen"] },
    jackSeen:  { delta: -6,  label: "Carjacked someone",          icon: "car",       cooldown: 20, same: ["jacking"] },
    alarm:     { delta: -2,  label: "Set off an alarm",           icon: "alarm",     cooldown: 30 },
    knockdown: { delta: -8,  label: "Ran someone down",           icon: "knockdown", cooldown: 4, group: "violence", window: 60 },
    gun:       { delta: -3,  label: "Fired a gun in the street",  icon: "gun",       cooldown: 25, same: ["shooting", "killing"] },
    shooting:  { delta: -12, label: "Shot someone",               icon: "shooting",  cooldown: 3, group: "violence", window: 60 },
    killing:   { delta: -25, label: "Killed someone",             icon: "killing",   cooldown: 3, group: "violence", window: 90 },
    menace:    { delta: -5,  label: "Threatened someone",         icon: "menace",    cooldown: 30, same: ["robbery", "robbed", "holdup"] },
    holdup:    { delta: -14, label: "Held up a shop",             icon: "robbery",   cooldown: 60, group: "robbery", window: 600 },
    robbed:    { delta: -14, label: "Robbed a shop",              icon: "robbery",   cooldown: 60, same: ["holdup", "robbery"] },
    robbery:   { delta: -16, label: "Armed robbery",              icon: "robbery",   cooldown: 60, same: ["holdup", "robbed"] },
    escape:    { delta: -2,  label: "Ran from the police",        icon: "escape",    cooldown: 60 },
    harass:    { delta: -2,  label: "Harassed a stranger",        icon: "harass",    cooldown: 10 },
    broken_word: { delta: -3, label: "Broke your word",           icon: "broken" },
    keep_wallet: { delta: -8, label: "Kept a stranger's wallet",  icon: "keep" },
    help_directions: { delta: 3, label: "Showed someone the way", icon: "directions" },
    help_fare:     { delta: 5,  label: "Paid a stranger's fare",  icon: "fare" },
    help_shopping: { delta: 4,  label: "Helped with the shopping", icon: "shopping" },
    help_wallet:   { delta: 8,  label: "Returned a lost wallet",  icon: "wallet" },
    help_escort:   { delta: 6,  label: "Walked someone safely",   icon: "escort" },
    service:       { delta: 3,  label: "Community service",       icon: "service" }
  };

  // ---- the company ladder: rank sets the floor of respect -------------------------------------------------------------------------------
  const SOTI_RANKS = [
    { id: "outsider",      name: "Job seeker",               base: 0 },
    { id: "agent",         name: "Customer service, 3F",     base: 10 },
    { id: "floor_manager", name: "Floor manager",            base: 24 },
    { id: "section_chief", name: "Section chief",            base: 36 },
    { id: "dept_head",     name: "Department head",          base: 50 },
    { id: "director",      name: "Director",                 base: 64 },
    { id: "md",            name: "Managing director",        base: 78 },
    { id: "president",     name: "President of SOTI",        base: 90 }
  ];

  const now = () => (typeof clock === "number" ? clock : performance.now() / 1000);
  const honor = new SHIGOTO.Honor({ deeds: DEEDS, start: 10, now: now });
  const respect = new SHIGOTO.Respect({ ranks: SOTI_RANKS, rank: "outsider", now: now });
  const hud = new SHIGOTO.StandingHud();
  const S = { honor: honor, respect: respect, hud: hud, ranks: SOTI_RANKS, req: null, nextAsk: 70 + Math.random() * 60, regard: null, regardHeld: false,
              bowUntil: 0, bowedBy: null, sid: 0, ui: null, padWas: {}, cardOn: false, lastRankCheck: 0, sprites: {} };
  window.standing = S;

  const show = ev => { if (!ev) return; hud.push(ev); hud.meter(honor.value, respect.value); };
  honor.on(show); respect.on(show);

  S.deed = (id, opts) => honor.deed(id, opts);
  S.earn = (delta, label) => respect.earn(delta, { label: label || (delta >= 0 ? "Respect earned" : "Respect lost") });
  S.promote = (id) => { const ev = respect.setRank(id); if (ev && typeof story === "object") story.flags.sotiRank = id; return ev; };
  S.card = (on) => { S.cardOn = on == null ? !S.cardOn : !!on; drawCard(); };

  // ---- crimes -----------------------------------------------------------------------------------------------------------------------------
  // The act (witnessCrime is called the moment it happens) and the police finding out (commitCrime) both report; the
  // deed table's cooldowns and `same` lists make them one deed.
  const wrap = (name, after) => {
    const f = window[name]; if (typeof f !== "function") return;
    window[name] = function () { const r = f.apply(this, arguments); try { after.apply(this, [r].concat([].slice.call(arguments))); } catch (e) { console.warn("[Konto] standing:", e); } return r; };
  };
  wrap("witnessCrime", (r, id) => honor.deed(id));
  wrap("commitCrime", (r, id) => honor.deed(id));
  wrap("robStart", () => honor.deed("holdup"));
  wrap("serviceEnd", (r, won) => { if (won) honor.deed("service"); });

  // ---- Seiko's and the people's gestures ------------------------------------------------------------------------------------------------------
  const seikoClips = window.storySeikoClips;
  if (typeof seikoClips === "function") window.storySeikoClips = function (make) {
    seikoClips(make);
    // antagonising: chin up, chest out, arms out from the sides, a flick of the right hand
    const up = { Spine: [0.1, 0, 0], Chest: [0.08, 0, 0], Neck: [0.22, 0, 0.1], UpperArmR: [0, 0, 0.62], ForearmR: [0, 0, 0.7], UpperArmL: [0, 0, -0.62], ForearmL: [0, 0, -0.7] };
    make("scoff", 1.7, [{ t: 0, pose: {} }, { t: 0.35, pose: up }, { t: 0.7, pose: Object.assign({}, up, { ForearmR: [0, 0, 1.45] }) }, { t: 1.2, pose: up }, { t: 1.7, pose: {} }], false);
    // a short nod-bow for answering someone who bowed first
    make("nodbow", 1.3, [{ t: 0, pose: {} }, { t: 0.35, pose: { Spine: [-0.3, 0, 0], Neck: [-0.2, 0, 0] } }, { t: 0.8, pose: { Spine: [-0.3, 0, 0], Neck: [-0.2, 0, 0] } }, { t: 1.3, pose: {} }], false);
  };
  const peoplePoses = window.storyPeoplePoses;
  if (typeof peoplePoses === "function") window.storyPeoplePoses = function (make) {
    peoplePoses(make);
    make("deepbow", { Spine: [-0.85, 0, 0], Chest: [-0.28, 0, 0], Neck: [-0.2, 0, 0], UpperArmR: [0.1, 0, 0.12], UpperArmL: [0.1, 0, -0.12] });
    make("nod", { Spine: [-0.18, 0, 0], Neck: [-0.38, 0, 0] });
    make("square", { Spine: [0.08, 0, 0], Chest: [0.06, 0, 0], Neck: [0.1, 0, 0], UpperArmR: [0, 0, 0.14], ForearmR: [0, 0, 0.3], UpperArmL: [0, 0, -0.14], ForearmL: [0, 0, -0.3] });
    make("plead", { UpperArmR: [0.9, 0, 0.35], ForearmR: [0, 0, 1.1], UpperArmL: [0.9, 0, -0.35], ForearmL: [0, 0, -1.1], Spine: [-0.12, 0, 0], Neck: [-0.05, 0, 0] });
    make("crouch", { Spine: [-0.6, 0, 0], Chest: [-0.2, 0, 0], ThighR: [1.3, 0, 0], ThighL: [1.3, 0, 0], ShinR: [-1.55, 0, 0], ShinL: [-1.55, 0, 0], UpperArmR: [0.4, 0, 0.3], UpperArmL: [0.4, 0, -0.3] });
  };

  // ---- the people -------------------------------------------------------------------------------------------------------------------------------
  const TEMPER_NAME = { meek: "Timid", polite: "Polite", proud: "Proud", hothead: "Short-tempered" };
  function person(p) {
    if (!p._sid) {
      p._sid = ++S.sid;
      const r = Math.random();
      p._temper = p.commuter ? (r < 0.2 ? "meek" : r < 0.72 ? "polite" : r < 0.92 ? "proud" : "hothead") : (r < 0.22 ? "meek" : r < 0.62 ? "polite" : r < 0.84 ? "proud" : "hothead");
      p._standing = (p.commuter ? 0.3 : 0.15) + Math.random() * 0.3;
    }
    return { id: p._sid, temper: p._temper, standing: p._standing, warmth: honor.effects().warmth };
  }
  function who(p) {
    const f = p.female || /woman|lady|girl/i.test(p.real || "");
    return p.commuter ? (f ? "Office worker" : "Salaryman") : (f ? "Woman" : "Passer-by");
  }
  const LINES = {
    deep: ["Ohayō gozaimasu.", "A pleasure, sir.", "Please, after you.", "Good day to you."],
    bow: ["Konnichiwa.", "Good day.", "Hello.", "Dōmo."],
    nod: ["Mm.", "Hm. Hello.", "…"],
    ignore: [],
    puzzled: ["…Yes? We've met.", "You already bowed.", "Are you all right?"],
    flinch: ["S-sorry!", "I didn't mean anything!", "Please, I'm going."],
    offended: ["How rude.", "Who raised you?", "Shitsurei na!", "There's no call for that."],
    glare: ["What are you looking at?", "Keep walking.", "Hah."],
    backsdown: ["…My apologies.", "I meant no offence, sir.", "Sorry. Sorry."],
    squareup: ["You want something?", "Say that again.", "Try it, salaryman.", "Nan da yo?"],
    flee: ["Leave me alone!", "Somebody, this man—!", "Stop following me!"],
    ask: ["Sumimasen! Excuse me!", "Excuse me, could you help?", "Sorry to trouble you…"]
  };
  const pick = a => a[(Math.random() * a.length) | 0];
  const sayLine = (l, s) => { if (l && typeof say === "function") say("“" + l + "”", s || 2.4); };

  // Stop someone where they stand for a gesture, and put them back on their way after it.
  function hold(p, pose, secs, onEnd) {
    if (!p || p.state === "dead" || p.state === "down") return;
    if (p.state !== "greet" && p.state !== "ask" && p.state !== "follow") p._prev = p.state;
    p.state = "greet"; p.t = 0; p._greetFor = secs; p._greetEnd = onEnd || null;
    if (p.icon) p.icon.visible = false;
    if (pose) pedPlay(p, pose, 0.3);
  }
  function release(p) {
    const prev = p._prev || "wander"; p._prev = null;
    if (prev === "commute") { pedPlay(p, "walk", 0.3, p.sp / WALK_SPEED); p.state = "commute"; p.t = 0; }
    else if (prev === "walk" || prev === "idle") { pedSet(p, "walk"); }
    else { pedSet(p, "wander"); p.wh = p.yaw; }
  }
  function face(p, x, z, dt) { let dy = Math.atan2(x - p.x, z - p.z) - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dt == null ? dy : dy * Math.min(1, dt * 6); }

  // ---- on foot, free to roam? ------------------------------------------------------------------------------------------------------------------------
  function onFoot() {
    try {
      return player.placed && title.started && !paused && player.mode === "walk" && !drive.car && !drive.train && !flight.active && !chute.active
        && !interior.active && !cut.active && !phone.open && !heist.stage && !service.active && !shops.inside && !(typeof gunArmed === "function" && gunArmed() && gun.aimIn);
    } catch (e) { return false; }
  }
  const dist = p => Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
  const camFwd = () => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

  // ---- regard: lock on to someone ----------------------------------------------------------------------------------------------------------------------
  function regardTarget() {
    const f = camFwd(); let best = null, bs = 1e9;
    for (const p of peds.list) {
      if (p.state === "dead" || p.state === "down" || p.state === "flee") continue;
      const dx = p.x - player.pos.x, dz = p.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d > 11 || d < 0.4) continue;
      const cos = (dx * f.x + dz * f.z) / d; if (cos < 0.62) continue;
      const s = d * (1.6 - cos);
      if (s < bs) { bs = s; best = p; }
    }
    return best;
  }
  function ui() {
    if (S.ui) return S.ui;
    const st = document.createElement("style");
    st.textContent = `
#rgdmark { position: fixed; z-index: 33; pointer-events: none; transform: translate(-50%, -100%); display: none; text-align: center; font-family: 'Konto Sans', Arial, sans-serif; }
#rgdmark .ch { width: 22px; height: 12px; margin: 0 auto 4px; border: solid #f3f1ec; border-width: 0 2.5px 2.5px 0; transform: rotate(45deg) translate(-3px,-3px); width: 10px; height: 10px; filter: drop-shadow(0 1px 2px #000); }
#rgdmark .nm { color: #f3f1ec; font-size: 12px; font-weight: 600; text-shadow: 0 1px 3px #000; white-space: nowrap; }
#rgdmark .tp { font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase; color: rgba(243,241,236,0.7); text-shadow: 0 1px 2px #000; }
#rgdmark .tp.hothead { color: #ff8a6a; } #rgdmark .tp.proud { color: #e7c37a; } #rgdmark .tp.meek { color: #a9c9e8; }
#rgdkeys { position: fixed; left: 50%; bottom: calc(64px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 33; pointer-events: none; display: none;
  gap: 18px; font: 600 13px/1 'Konto Sans', Arial, sans-serif; color: #f3f1ec; text-shadow: 0 1px 3px #000; }
#rgdkeys span { display: inline-flex; align-items: center; gap: 7px; background: rgba(8,9,12,0.62); padding: 7px 12px 7px 7px; border-radius: 3px; }
#rgdkeys b { min-width: 22px; height: 22px; display: inline-grid; place-items: center; border: 1.5px solid rgba(255,255,255,0.75); border-radius: 4px; font-size: 12px; }
#helpprompt { position: fixed; left: 50%; bottom: calc(110px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 33; pointer-events: none; display: none;
  font: 600 14px/1.25 'Konto Sans', Arial, sans-serif; color: #f3f1ec; text-shadow: 0 1px 3px #000; background: rgba(8,9,12,0.72); padding: 9px 14px; border-radius: 3px; border-left: 3px solid #f0c76a; max-width: 460px; text-align: left; }
#helpprompt b { display: inline-grid; place-items: center; min-width: 22px; height: 22px; margin-right: 6px; border: 1.5px solid rgba(255,255,255,0.75); border-radius: 4px; font-size: 12px; }
#helpprompt em { font-style: normal; color: rgba(243,241,236,0.72); display: block; font-size: 12.5px; margin-bottom: 5px; }
body.titleup #rgdmark, body.paused #rgdmark, body.cutscene #rgdmark, body.titleup #rgdkeys, body.paused #rgdkeys, body.cutscene #rgdkeys, body.paused #helpprompt, body.cutscene #helpprompt, body.titleup #helpprompt { visibility: hidden; }`;
    document.head.appendChild(st);
    const mark = document.createElement("div"); mark.id = "rgdmark"; mark.innerHTML = '<div class="nm"></div><div class="tp"></div><div class="ch"></div>'; document.body.appendChild(mark);
    const keysEl = document.createElement("div"); keysEl.id = "rgdkeys"; document.body.appendChild(keysEl);
    const hp = document.createElement("div"); hp.id = "helpprompt"; document.body.appendChild(hp);
    return (S.ui = { mark: mark, keys: keysEl, help: hp, padKeys: null });
  }
  function drawRegard() {
    const u = ui(), p = S.regard;
    if (!p || !S.regardHeld) { u.mark.style.display = "none"; u.keys.style.display = "none"; return; }
    camera.updateMatrixWorld();
    const v = new THREE.Vector3(p.x, p.y + 1.95 * (p.h || 1), p.z).project(camera);
    if (v.z > 1) { u.mark.style.display = "none"; } else {
      u.mark.style.display = "block"; u.mark.style.left = ((v.x + 1) / 2 * innerWidth) + "px"; u.mark.style.top = ((1 - v.y) / 2 * innerHeight) + "px";
      const ps = person(p);
      u.mark.querySelector(".nm").textContent = who(p);
      const tp = u.mark.querySelector(".tp"); tp.textContent = TEMPER_NAME[ps.temper]; tp.className = "tp " + ps.temper;
    }
    const gp = pad.index >= 0;
    const html = gp ? "<span><b>B</b>Bow</span><span><b>RT</b>Antagonise</span>" : "<span><b>B</b>Bow</span><span><b>N</b>Antagonise</span>";
    if (u.keys.innerHTML !== html) u.keys.innerHTML = html;
    u.keys.style.display = "flex";
  }
  function drawCard() {
    const show = S.cardOn || (S.regardHeld && !S.regard);
    if (!show) { hud.card(null); return; }
    hud.card({ honor: honor.value, honorTier: honor.tier(), respect: respect.value, respectTier: respect.tier(), rank: respect.rank().base || respect.rankIndex() ? respect.rank().name : "",
               ledger: honor.ledger, keys: pad.index >= 0 ? [["LT", "Regard"], ["B", "Bow"], ["RT", "Antagonise"]] : [["Z", "Regard"], ["B", "Bow"], ["N", "Antagonise"]] });
  }

  // ---- greeting ----------------------------------------------------------------------------------------------------------------------------------------------
  function seikoGesture(clip, secs) {
    const turnTo = S.regard || (S.bowedBy && S.bowedBy.p);
    if (turnTo) { player.yaw = player.targetYaw = Math.atan2(turnTo.x - player.pos.x, turnTo.z - player.pos.z); }
    if (player.clips && player.clips[clip]) { player.forceClip = clip; S.gestureClip = clip; S.bowUntil = now() + secs; }
  }
  function greet(kind) {
    if (!onFoot()) return false;
    if (now() < S.bowUntil) return true;
    let p = S.regard;
    // somebody just bowed to you: B answers them, no need to lock on
    if (!p && kind === "bow" && S.bowedBy && now() - S.bowedBy.t < 4 && S.bowedBy.p.state !== "dead") {
      const q = S.bowedBy.p; S.bowedBy = null;
      S.regard = q; seikoGesture("nodbow", 1.3); S.regard = null;
      respect.returned(person(q).id);
      return true;
    }
    if (!p) {
      // a plain bow to nobody in particular, still a bow
      if (kind === "bow") seikoGesture("bow", 2.0); else seikoGesture("scoff", 1.7);
      return true;
    }
    const ps = person(p);
    // a very bad name makes even the proud nervous
    if (kind === "antagonize" && honor.value < -55 && Math.random() < 0.5) ps.temper = "meek";
    seikoGesture(kind === "bow" ? "bow" : "scoff", kind === "bow" ? 2.2 : 1.7);
    const res = respect.greet(kind, ps);
    if (res.harass) honor.deed("harass");
    const r = res.reply;
    setTimeout(() => {
      if (!p || p.state === "dead" || p.state === "down") return;
      if (r === "ignore") { sayLine(pick(["…", ""]), 1.2); return; }
      if (r === "flee") { pedSet(p, "flee", player.pos); sayLine(pick(LINES.flee)); return; }
      const pose = { deep: "deepbow", bow: "bow", nod: "nod", puzzled: "folded", flinch: "cower", offended: "folded", glare: "square", backsdown: "bow", squareup: "square" }[r];
      hold(p, pose, r === "squareup" ? 3.2 : r === "flinch" ? 1.8 : 2.0, r === "flinch" && Math.random() < 0.5 ? (q => pedSet(q, "flee", player.pos)) : null);
      p._faceSeiko = true;
      if (r === "squareup") { p._squared = (p._squared || 0) + 1; if (p._squared > 1) { vitals.stress = Math.min(1, vitals.stress + 0.1); sayLine("Back off!"); if (typeof rumble === "function") rumble(0.5, 0.3, 140); return; } }
      sayLine(pick(LINES[r] || [""]));
    }, kind === "bow" ? 600 : 450);
    return true;
  }

  // ---- strangers who need help -----------------------------------------------------------------------------------------------------------------------------
  const ASKS = [
    { kind: "directions", text: "Which way is {station}? I'm completely turned around.", act: "Point the way", w: 3 },
    { kind: "fare", text: "I've lost my pass. Could you spare ¥500 for the train home?", act: "Give ¥500", w: 2 },
    { kind: "shopping", text: "My bag split… oh no, the oranges.", act: "Help pick it up", w: 2 },
    { kind: "wallet", text: "I've dropped my wallet somewhere back along here. Could you look?", act: "Help look for it", w: 2 },
    { kind: "escort", text: "Could you walk me to the crossing? My eyes aren't what they were.", act: "Walk with them", w: 1.5 }
  ];
  function chooseAsk() { const tot = ASKS.reduce((a, b) => a + b.w, 0); let r = Math.random() * tot; for (const a of ASKS) { if ((r -= a.w) <= 0) return a; } return ASKS[0]; }
  function sprite(kind) {
    if (!S.sprites[kind]) {
      const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
      if (kind === "ask") {
        // an amber disc with a raised open hand: someone asking
        g.fillStyle = "rgba(10,10,12,0.55)"; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
        g.strokeStyle = "#f0c76a"; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.stroke();
        g.fillStyle = "#f0c76a"; g.font = "800 70px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("?", 64, 68);
      } else if (kind === "item") {
        // a small wallet with a glint, lying on the pavement
        const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, "rgba(255,240,200,0.9)"); gr.addColorStop(0.35, "rgba(240,199,106,0.35)"); gr.addColorStop(1, "rgba(240,199,106,0)");
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        g.fillStyle = "#3a2618"; g.fillRect(36, 46, 56, 38); g.fillStyle = "#5a3b24"; g.fillRect(36, 46, 56, 10); g.fillStyle = "#c9a45a"; g.fillRect(78, 60, 10, 10);
      } else {
        // a destination ring
        g.strokeStyle = "#f0c76a"; g.lineWidth = 9; g.beginPath(); g.arc(64, 64, 50, 0, 7); g.stroke();
        g.fillStyle = "#f0c76a"; g.beginPath(); g.moveTo(64, 30); g.lineTo(84, 70); g.lineTo(44, 70); g.closePath(); g.fill();
      }
      S.sprites[kind] = new THREE.CanvasTexture(c);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.sprites[kind], depthTest: false, transparent: true, fog: false }));
    s.renderOrder = 20;
    return s;
  }
  function nearestStationName() {
    try { let b = null, bd = 1e9; for (const s of commuteStations()) { const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z); if (d < bd) { bd = d; b = s; } } return b ? b.name + " station" : "the station"; } catch (e) { return "the station"; }
  }
  function freeSpot(x, z, rMin, rMax) {
    for (let t = 0; t < 16; t++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin), nx = x + Math.sin(a) * r, nz = z + Math.cos(a) * r;
      if (!insideBuilding(nx, nz, 0.6) && world.sampleHeight(nx, nz) > 0.4) return { x: nx, z: nz, y: world.surfaceY(nx, nz) };
    }
    return null;
  }
  function askStart() {
    const cand = peds.list.filter(p => (p.state === "walk" || p.state === "idle" || p.state === "wander") && !p.commuter && dist(p) > 16 && dist(p) < 45);
    if (!cand.length) return false;
    const p = cand[(Math.random() * cand.length) | 0], a = chooseAsk();
    person(p);
    p._prev = p.state; p.state = "ask"; p.t = 0;
    pedPlay(p, "wave", 0.3);
    const icon = sprite("ask"); icon.scale.set(0.42, 0.42, 0.42); icon.position.y = 2.3; p.holder.add(icon);
    S.req = { p: p, a: a, stage: "calling", t: 0, icon: icon, text: a.text.replace("{station}", nearestStationName()), called: false, close: false };
    return true;
  }
  function askEnd(outcome) {
    const R = S.req; if (!R) return;
    S.req = null;
    const p = R.p;
    if (R.icon && R.icon.parent) R.icon.parent.remove(R.icon);
    if (R.item && R.item.parent) R.item.parent.remove(R.item);
    if (R.dest && R.dest.parent) R.dest.parent.remove(R.dest);
    if (R.icon) R.icon.material.dispose(); if (R.item) R.item.material.dispose(); if (R.dest) R.dest.material.dispose();
    if (p && p.state !== "dead" && p.state !== "down" && p.state !== "flee") {
      if (outcome === "helped") { p._prev = "wander"; hold(p, "deepbow", 2.2); sayLine(pick(["Arigatō gozaimasu! Thank you!", "You're very kind.", "Thank you, really.", "Bless you."]), 3); }
      else if (outcome === "kept") { p._prev = "wander"; hold(p, "plead", 2.5); }
      else { p._prev = "wander"; release(p); }
    }
    S.nextAsk = (150 + Math.random() * 180) / honor.effects().askRate;
    ui().help.style.display = "none";
  }
  function helpPrompt(html) { const h = ui().help; if (!html) { h.style.display = "none"; return; } if (h.innerHTML !== html) h.innerHTML = html; h.style.display = "block"; }
  const KEY = () => (pad.index >= 0 ? "A" : "E");

  // E (or A) near someone who asked
  function helpAct(alt) {
    const R = S.req; if (!R || !onFoot()) return false;
    const p = R.p, d = dist(p);
    if (R.stage === "calling" || R.stage === "asking") {
      if (d > 2.8 || alt) return false;
      const k = R.a.kind;
      if (k === "directions") { seikoGesture("bow", 1.6); askEnd("helped"); honor.deed("help_directions"); }
      else if (k === "fare") {
        if (purse.yen < 500) { say("You don't have ¥500 on you.", 2.5); return true; }
        purse.yen -= 500; seikoGesture("bow", 1.6); askEnd("helped"); honor.deed("help_fare");
      } else if (k === "shopping") {
        R.stage = "task"; R.until = now() + 2.4; hold(p, "crouch", 2.6); p.state = "ask";
        if (player.clips && player.clips.hotwire) { player.forceClip = "hotwire"; S.gestureClip = "hotwire"; S.bowUntil = now() + 2.4; }
      } else if (k === "wallet") {
        const spot = freeSpot(p.x, p.z, 14, 30);
        if (!spot) { askEnd("none"); return true; }
        R.stage = "task"; R.item = sprite("item"); R.item.scale.set(0.55, 0.55, 0.55); R.item.position.set(spot.x, spot.y + 0.25, spot.z); scene.add(R.item);
        R.icon.visible = false; pedSet(p, "idle"); p.state = "ask"; pedPlay(p, "folded", 0.3);
        say("Look for it back along the pavement: it'll catch the light.", 3.5);
      } else if (k === "escort") {
        const spot = freeSpot(p.x, p.z, 35, 60);
        if (!spot) { askEnd("none"); return true; }
        R.stage = "task"; R.dest = sprite("dest"); R.dest.scale.set(1.2, 1.2, 1.2); R.dest.position.set(spot.x, spot.y + 1.0, spot.z); scene.add(R.dest);
        R.icon.visible = false; p.state = "follow"; p._prev = "wander"; pedPlay(p, "walk", 0.3, 0.6);
        say("Walk them to the marker. Not too fast.", 3);
      }
      return true;
    }
    if (R.stage === "task" && R.a.kind === "wallet") {
      if (!R.carrying && R.item && Math.hypot(R.item.position.x - player.pos.x, R.item.position.z - player.pos.z) < 1.8) {
        R.carrying = true; R.cash = (8 + ((Math.random() * 14) | 0)) * 1000;
        scene.remove(R.item); R.item.material.dispose(); R.item = null; R.icon.visible = true;
        say("Found it. " + yenText(R.cash) + " inside.", 3);
        return true;
      }
      if (R.carrying && d < 2.8) {
        if (alt) { purse.yen += R.cash; honor.deed("keep_wallet"); R.kept = true; askEnd("kept"); say("You pocket " + yenText(R.cash) + ".", 2.5); }
        else { seikoGesture("bow", 1.6); askEnd("helped"); honor.deed("help_wallet"); }
        return true;
      }
      if (R.carrying && alt) { purse.yen += R.cash; honor.deed("keep_wallet"); askEnd("kept"); say("You pocket " + yenText(R.cash) + ".", 2.5); return true; }
    }
    return false;
  }
  function askTick(dt) {
    const R = S.req;
    if (!R) {
      if (!onFoot() || (typeof wanted === "object" && wanted.stars > 0)) return;
      // fewer strangers stop him while the first mission's clock is running
      S.nextAsk -= dt * (typeof story === "object" && story.m === 1 ? 0.35 : 1);
      if (S.nextAsk <= 0) { if (!askStart()) S.nextAsk = 12; }
      return;
    }
    const p = R.p;
    R.t += dt;
    if (!p || peds.list.indexOf(p) < 0 || p.state === "dead" || p.state === "down" || p.state === "flee" || p.state === "cower" || p.state === "call" || p.state === "hands") {
      if (R.stage === "task" && R.carrying) { purse.yen += R.cash || 0; }
      askEnd("none"); return;
    }
    const d = dist(p), K = KEY(), alt = pad.index >= 0 ? "X" : "K";
    if (R.stage === "calling" || R.stage === "asking") {
      face(p, player.pos.x, player.pos.z, dt);
      if (d < 22 && !R.called) { R.called = true; sayLine(pick(LINES.ask), 2.5); }
      if (d < 7) { R.stage = "asking"; if (p.clip !== "plead") pedPlay(p, "plead", 0.3); }
      if (d < 2.8 && onFoot()) helpPrompt("<em>“" + R.text + "”</em><b>" + K + "</b>" + R.a.act);
      else helpPrompt(null);
      if (d < 14) R.close = true;
      // walked past and on: no harm done, they ask someone else
      if ((R.close && d > 55) || R.t > 150 || (typeof wanted === "object" && wanted.stars > 0)) askEnd("none");
      return;
    }
    // the task itself
    const k = R.a.kind;
    if (k === "shopping") {
      if (now() >= R.until) { if (S.gestureClip === "hotwire") { player.forceClip = null; S.gestureClip = null; } askEnd("helped"); honor.deed("help_shopping"); }
      return;
    }
    if (k === "wallet") {
      if (R.item) R.item.material.rotation = Math.sin(R.t * 3) * 0.1;
      const nearItem = R.item && Math.hypot(R.item.position.x - player.pos.x, R.item.position.z - player.pos.z) < 1.8;
      if (nearItem) helpPrompt("<b>" + K + "</b>Pick up the wallet");
      else if (R.carrying && d < 2.8) helpPrompt("<b>" + K + "</b>Give it back &nbsp; <b>" + alt + "</b>Keep it (" + yenText(R.cash) + ")");
      else if (R.carrying) helpPrompt("<em>Take the wallet back to its owner.</em><b>" + alt + "</b>Keep it (" + yenText(R.cash) + ")");
      else helpPrompt(null);
      face(p, player.pos.x, player.pos.z, dt);
      if (d > 70) { if (R.carrying) { purse.yen += R.cash; honor.deed("keep_wallet", { note: "walked off with it" }); } else honor.deed("broken_word"); askEnd("none"); }
      else if (R.t > 300) { if (R.carrying) { purse.yen += R.cash; honor.deed("keep_wallet"); } askEnd("none"); }
      return;
    }
    if (k === "escort") {
      // they follow at an old person's pace, and stop when you are too far ahead
      const dd = R.dest.position, toDest = Math.hypot(dd.x - p.x, dd.z - p.z);
      if (d > 2.2 && d < 18) {
        const sp = 0.95, ax = player.pos.x - p.x, az = player.pos.z - p.z;
        pedFree(p, dt, sp, ax, az); if (p.clip !== "walk") pedPlay(p, "walk", 0.3, 0.6);
      } else { if (p.clip !== "idle") pedPlay(p, "idle", 0.3); face(p, player.pos.x, player.pos.z, dt); }
      helpPrompt(d >= 18 ? "<em>They can't keep up. Wait for them.</em>" : null);
      if (toDest < 4.5) { askEnd("helped"); honor.deed("help_escort"); }
      else if (d > 45 || R.t > 400) { askEnd("none"); honor.deed("broken_word"); }
    }
  }

  // ---- strangers bowing first ------------------------------------------------------------------------------------------------------------------------------
  function bowersTick() {
    if (!onFoot()) return;
    for (const p of peds.list) {
      if (p._bowChk || !(p.state === "walk" || p.state === "commute" || p.state === "wander" || p.state === "idle")) continue;
      const d = dist(p); if (d > 4.2) continue;
      p._bowChk = true;
      // they must be coming towards him, or at least looking his way
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), dx = player.pos.x - p.x, dz = player.pos.z - p.z;
      if ((fx * dx + fz * dz) / (d || 1) < 0.2) continue;
      const ps = person(p);
      if (Math.random() < respect.bowChance(ps)) {
        hold(p, respect.value > 55 && Math.random() < 0.5 ? "deepbow" : "bow", 1.7);
        p._faceSeiko = true;
        S.bowedBy = { p: p, t: now() };
        if (Math.random() < 0.35) sayLine(pick(respect.rankIndex() >= 2 ? ["Good morning, sir.", "Sir.", "Otsukaresama desu."] : LINES.bow), 1.8);
      }
    }
  }

  // ---- every frame, after the people have moved ----------------------------------------------------------------------------------------------------------
  function peopleTick(dt) {
    for (const p of peds.list) {
      if (p.state === "greet") {
        if (p._faceSeiko) face(p, player.pos.x, player.pos.z, dt);
        if (p.t > p._greetFor) {
          p._faceSeiko = false;
          const end = p._greetEnd; p._greetEnd = null;
          if (S.req && S.req.p === p && S.req.stage !== "done") { p.state = S.req.stage === "task" && S.req.a.kind === "escort" ? "follow" : "ask"; }
          else if (end) end(p); else release(p);
        }
      }
    }
  }
  function gestureTick() {
    if (S.gestureClip && (now() >= S.bowUntil || !onFoot())) { if (player.forceClip === S.gestureClip) player.forceClip = null; S.gestureClip = null; }
    // moving cancels a bow: you cannot walk off mid-bow
    if (S.gestureClip && player.speed > 0.6) { if (player.forceClip === S.gestureClip) player.forceClip = null; S.gestureClip = null; S.bowUntil = 0; }
  }
  function rankTick() {
    if (now() - S.lastRankCheck < 2) return; S.lastRankCheck = now();
    try {
      const want = (story.flags && story.flags.sotiRank) || (story.m >= 2 ? "agent" : null);
      if (want && respect.rankIndex() < SOTI_RANKS.findIndex(r => r.id === want)) respect.setRank(want, want === "agent" ? { label: "Hired by SOTI" } : undefined);
    } catch (e) { /* no story */ }
  }
  function padTick() {
    const gp = pad.index >= 0 && navigator.getGamepads ? navigator.getGamepads()[pad.index] : null;
    if (!gp) return;
    const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), was = S.padWas, edge = i => b(i) && !was[i];
    const lt = gp.buttons[PAD.LT] ? gp.buttons[PAD.LT].value : 0, rt = gp.buttons[PAD.RT] ? gp.buttons[PAD.RT].value : 0;
    // LT aims a weapon when one is out; with empty hands it regards the person in front of you, and RT is the antagonise "trigger"
    S.padRegard = lt > 0.35 && onFoot() && !(typeof gunArmed === "function" && gunArmed());
    const rtEdge = rt > 0.5 && !was.rt; was.rt = rt > 0.5;
    if (onFoot()) {
      if (S.regardHeld && edge(PAD.B)) greet("bow");
      else if (S.regardHeld && rtEdge) greet("antagonize");
      else if (!S.regardHeld && edge(PAD.B) && S.bowedBy && now() - S.bowedBy.t < 4) greet("bow");
      if (S.req && edge(PAD.A)) helpAct(false);
      if (S.req && edge(PAD.X) && S.req.carrying) helpAct(true);
    }
    for (const i of [PAD.A, PAD.B, PAD.X]) was[i] = b(i);
  }

  const pedsTickGame = window.pedsTick;
  window.pedsTick = function (dt) {
    pedsTickGame(dt);
    try {
      if (!peds.list) return;
      padTick();
      S.regardHeld = (S.keyRegard || S.padRegard) && onFoot();
      if (S.regardHeld) { if (!S.regard || S.regard.state === "dead" || S.regard.state === "flee" || peds.list.indexOf(S.regard) < 0 || dist(S.regard) > 14) S.regard = regardTarget(); }
      else S.regard = null;
      peopleTick(dt); askTick(dt); bowersTick(); gestureTick(); rankTick();
      drawRegard(); drawCard();
    } catch (e) { if (!S.warned) { S.warned = true; console.warn("[Konto] standing tick:", e); } }
  };

  // ---- keys ---------------------------------------------------------------------------------------------------------------------------------------------------
  const typing = () => { const a = document.activeElement; return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable); };
  window.addEventListener("keydown", e => {
    if (typing() || !onFoot()) return;
    if (e.code === "KeyZ") { S.keyRegard = true; return; }
    if (e.repeat) return;
    if (e.code === "KeyB") { if (greet("bow")) e.preventDefault(); }
    else if (e.code === "KeyN") { if (greet("antagonize")) e.preventDefault(); }
    else if (e.code === "KeyE" && S.req) { if (helpAct(false)) { e.preventDefault(); e.stopImmediatePropagation(); } }
    else if (e.code === "KeyK" && S.req && S.req.carrying) { if (helpAct(true)) { e.preventDefault(); e.stopImmediatePropagation(); } }
  }, true);
  window.addEventListener("keyup", e => { if (e.code === "KeyZ") S.keyRegard = false; });
  window.addEventListener("blur", () => { S.keyRegard = false; });

  // ---- saving -------------------------------------------------------------------------------------------------------------------------------------------------
  const snap = window.snapshotSave, apply = window.applySave, sig = window.saveSig;
  if (typeof snap === "function") window.snapshotSave = function () { const s = snap.apply(this, arguments); try { s.standing = { honor: honor.save(), respect: respect.save() }; } catch (e) { /* none */ } return s; };
  if (typeof apply === "function") window.applySave = function (s) { const r = apply.apply(this, arguments); try { if (s && s.standing) { honor.load(s.standing.honor); respect.load(s.standing.respect); } } catch (e) { /* none */ } return r; };
  if (typeof sig === "function") window.saveSig = function () { return sig.apply(this, arguments) + "|" + Math.round(honor.value) + "|" + Math.round(respect.value) + "|" + respect.rankId; };
  // a new game starts a new man
  const newGame = window.newGameBackup;
  if (typeof newGame === "function") window.newGameBackup = function () { const r = newGame.apply(this, arguments); honor.value = 10; honor.ledger.length = 0; respect.load({ rank: "outsider", earned: 0 }); return r; };

  hud.mount();
  // on a train or in a car the people tick above does not run: make sure nothing is left hanging over the picture
  setInterval(() => {
    if (onFoot()) return;
    S.regard = null; S.regardHeld = false;
    if (S.ui) { S.ui.mark.style.display = "none"; S.ui.keys.style.display = "none"; S.ui.help.style.display = "none"; }
    if (!S.cardOn) hud.card(null);
  }, 250);
  // console
  window.shigoto = window.shigoto || {};
  window.shigoto.standing = () => {
    const o = { honor: honor.value, honorTier: honor.tier().name, respect: respect.value, respectTier: respect.tier().name, rank: respect.rank().name, courtesy: Math.round(respect.courtesy * 10) / 10,
                bows: respect.bowsTotal, request: S.req ? S.req.a.kind + " · " + S.req.stage : null, ledger: honor.ledger.slice(-8) };
    console.table ? console.log(o) : console.log(JSON.stringify(o));
    return o;
  };
  console.log("[Konto] standing engine on: honor " + honor.value + ", respect " + respect.value);
})();
