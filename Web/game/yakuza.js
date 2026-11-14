// The Kurogane-kai: the other way up in Tōkonto.
//
// FINDING THEM. Three of the family's people work in three corners of the city, and none of them talks to a stranger. Each wants to see
// something that shows you went looking (a small gold marker in the world; walk up and press F):
//   a pachinko ball stamped with the family's crest   on the shopping streets of Suzuran          -> Benzō, the mahjong parlour, Kurotani
//   a white chrysanthemum                              in the Gosho Gardens                        -> Brother Genji, the festival stalls, Mitamamori
//   a tuna auction tally                               on the quay at Kanmei-futo                  -> Sharkskin Hide, the fish market, Higashiura
// From mission 3 the three corners are marked "?" on the map. Show a contact his token and he gives you work.
//
// RISING. Jobs (yakuza-content.js) earn the family's regard, and regard is rank:
//   associate -> wakashu (the sake cup) -> kyōdai -> shatei-gashira -> honbuchō -> wakagashira
// Each rank brings a gift from the family ("yakuza:gift", the same shape as the SOTI "rank:gift"), a bigger cut, and harder work.
//
// THE CHOICE. When the oyabun, Kurogane Jūzō, names Seiko his second, there are two ways on:
//   stay        sworn for life: the three old places are his to run for the family, for a share
//   end them    the contacts, the lieutenants and the oyabun, in one night. Beat them all and the empire is his.
//
// THE EMPIRE (after they are beaten): the office (phone Contacts, "The Office") hires people (enforcers, bookkeepers, fixers, drivers) and
// buys new places; every place is a door in the city with its manager outside. Visit to collect the takings, set how hard it squeezes,
// upgrade it, or put one of your people in charge. Squeezing pays more and brings heat (raids) and costs honor; running it quiet does the
// opposite.
//
// API: career.yakuza.status(), .rank(), .rankName(), .unlock() (console: meet everyone), career.on("yakuza:rank" | "yakuza:gift" |
// "yakuza:job" | "yakuza:choice" | "yakuza:income", fn). Saved with the story (story.career.yk).
(function () {
  "use strict";
  const C = window.career, Q = window.quest, G = C && C.saga;
  if (!C || !Q || !G) { console.warn("[Yakuza] the story is not in this build"); return; }
  const Y = C.yakuza = {};
  Y.version = "1.0.0";

  Y.RANKS = [
    { id: "outsider", name: "Outsider", need: 0 },
    { id: "associate", name: "Associate", jp: "jun-kōseiin", need: 1 },
    { id: "wakashu", name: "Wakashu", jp: "sworn soldier", need: 22, kinds: ["accessory"], budget: 150000, note: "The cup is drunk. A man of the family carries the family's pin." },
    { id: "kyodai", name: "Kyōdai", jp: "brother", need: 48, kinds: ["watch"], budget: 900000, note: "A brother doesn't check a phone for the time in front of a debtor. — Benzō" },
    { id: "shateigashira", name: "Shatei-gashira", jp: "captain", need: 80, kinds: ["fragrance", "accessory"], budget: 600000, note: "You smell of the office. Wear this to the tables. — Genji" },
    { id: "honbucho", name: "Honbuchō", jp: "headquarters chief", need: 115, kinds: ["watch", "accessory"], budget: 6000000, note: "From the oyabun's own wrist. He does not give twice." },
    { id: "wakagashira", name: "Wakagashira", jp: "the second", need: 9999, kinds: ["watch", "fragrance", "accessory"], budget: 15000000, note: "For my second. — Kurogane Jūzō" },
    { id: "oyabun", name: "Oyabun", jp: "the head of the family", need: 99999 }
  ];
  const fresh = () => ({ v: 1, items: {}, met: {}, regard: 0, rank: 0, done: {}, choice: null, gifts: [], hq: false, empire: null, day: -1, fails: 0 });
  const S = Y.state = () => { const s = C.state(); if (!s.yk) s.yk = fresh(); return s.yk; };
  Y.rank = () => S().rank;
  Y.rankName = () => Y.RANKS[S().rank].name;
  Y.unlocked = () => story.m >= 3;
  Y.jobs = {};
  Y.add = (id, def) => { def.id = id; Y.jobs[id] = def; };

  Object.assign(G.ACH, {
    yk_token: ["Something to show", "Found one of the Kurogane-kai's tokens"], yk_doors: ["Three doors", "Met all three of the family's people"],
    yk_cup: ["The cup", "Drank the sake cup and became wakashu"], yk_second: ["The second", "Named wakagashira by the oyabun"],
    yk_stay: ["Sworn brother", "Chose to stay with the Kurogane-kai"], yk_sweep: ["Kurogane falls", "Beat the whole of the Kurogane-kai"],
    yk_mercy: ["An old man's train ticket", "Let the oyabun leave Tōkonto alive"], yk_cold: ["No loose ends", "Left nobody to come back"],
    yk_landlord: ["Landlord", "Own every place in the empire"], yk_crew: ["Full table", "Hired six people"], yk_legit: ["Almost respectable", "Ran every place quiet for a week"]
  });

  // ---- the places ------------------------------------------------------------------------------------------------------------------------
  Y.TOKENS = {
    ball: { name: "a pachinko ball with a crest", place: { ward: "Suzuran", dx: 30, dz: -20 }, found: "A steel ball in the gutter outside a pachinko parlour. Somebody has stamped a tiny crest into it: a black anvil.", for: "benzo" },
    kiku: { name: "a white chrysanthemum", place: { site: "Gosho Gardens" }, found: "One white chrysanthemum, cut and left on a bench. A paper band round the stem: a black anvil.", for: "genji" },
    tally: { name: "a tuna auction tally", place: { ward: "Kanmei-futo", dx: -20, dz: 30 }, found: "A wooden tally from the tuna auction, dropped on the quay. Burned into the back: a black anvil.", for: "hide" }
  };
  Y.CONTACTS = {
    benzo: { name: "Benzō", full: "Benzō of the tables", look: "salaryman_09", place: { ward: "Kurotani", dx: 20, dz: 20 }, spot: "the mahjong parlour, Kurotani", token: "ball",
      cold: "Members only, salary man. The tower's the other way.", warm: "…Where did you get that ball? Nobody finds those by accident. All right. You looked for us. Come round the back." },
    genji: { name: "Brother Genji", full: "Brother Genji of the stalls", look: "man_02", business: false, place: { ward: "Mitamamori", dx: 40, dz: -10 }, spot: "the festival stalls, Mitamamori", token: "kiku",
      cold: "Fortunes are five hundred yen. Anything else, I don't sell.", warm: "A white one. From the Gardens. …The oyabun's mother grew those. You've been doing your reading, suit. Sit down." },
    hide: { name: "Sharkskin Hide", full: "Sharkskin Hide", look: "man_04", business: false, place: { ward: "Higashiura", dx: -30, dz: 10 }, spot: "the fish market, Higashiura", token: "tally",
      cold: "Auction's at five in the morning. You're not a buyer. Walk on.", warm: "That's a Kurogane tally. You walked the quay at Kanmei-futo to find that? In those shoes? Hah. I've got work for a man who walks." }
  };
  Y.HQ = { name: "Kurogane Kōgyō", place: { ward: "Higashiura", dx: 60, dz: 60 }, spot: "the Kurogane Kōgyō office, Higashiura docks" };
  Y.VENUES = {
    mahjong: { name: "Jantaku Kurogane", kind: "Mahjong parlour", place: { ward: "Kurotani", dx: 20, dz: 20 }, price: 0, income: 90000, heat: 2, old: true, mgr: "salaryman_09" },
    yatai: { name: "The Mitamamori stalls", kind: "Festival stalls", place: { ward: "Mitamamori", dx: 40, dz: -10 }, price: 0, income: 60000, heat: 1, old: true, mgr: "man_02" },
    fish: { name: "Stall No. 8, Higashiura", kind: "Fish market", place: { ward: "Higashiura", dx: -30, dz: 10 }, price: 0, income: 110000, heat: 1, old: true, mgr: "man_04" },
    pachinko: { name: "Parlor Ginga", kind: "Pachinko parlour", place: { ward: "Suzuran", dx: 30, dz: -20 }, price: 9000000, income: 260000, heat: 2, mgr: "salaryman_05" },
    club: { name: "Club Shirayuri", kind: "Hostess club", place: { station: "Shin-Tokura", dx: 30, dz: 14 }, price: 14000000, income: 380000, heat: 3, mgr: "officelady_05" },
    hotel: { name: "Hotel Aurora", kind: "Love hotel", place: { ward: "Toyosaka", dx: -40, dz: 30 }, price: 22000000, income: 520000, heat: 2, mgr: "woman_03" },
    sarakin: { name: "Smile Finance", kind: "Loan office", place: { station: "Kanchogai", dx: -26, dz: 18 }, price: 12000000, income: 440000, heat: 5, mgr: "salaryman_01" },
    kensetsu: { name: "Kurogane Kensetsu", kind: "Construction firm", place: { ward: "Shiogama", dx: 20, dz: 0 }, price: 40000000, income: 900000, heat: 3, mgr: "man_03" },
    talent: { name: "Star Road Promotion", kind: "Talent agency", place: { site: "Konto Broadcasting Centre", dx: 40, dz: 20 }, price: 18000000, income: 420000, heat: 2, mgr: "officelady_04" },
    sauna: { name: "Sauna Daikoku", kind: "Bathhouse", place: { station: "Hozumi", dx: 24, dz: -16 }, price: 7000000, income: 190000, heat: 1, mgr: "man_01" },
    casino: { name: "The Back Room", kind: "Underground casino", place: { ward: "Umishima", dx: 0, dz: 0 }, price: 60000000, income: 1500000, heat: 7, mgr: "salaryman_10" },
    reefer: { name: "Pier 9 Cold Store", kind: "Port warehouse", place: { ward: "Kanmei-futo", dx: 60, dz: -30 }, price: 30000000, income: 700000, heat: 4, mgr: "man_05" }
  };
  Y.CREW = [
    { id: "ryu", name: "Ryū the Wall", role: "enforcer", fee: 800000, wage: 40000, text: "Stood on the door at Club Shirayuri for nine years. Nobody got past him. Nobody tried twice." },
    { id: "omasa", name: "O-Masa", role: "bookkeeper", fee: 1200000, wage: 55000, text: "Kept two sets of books for Smile Finance and a third for herself. Wants to keep one, honestly, for once." },
    { id: "sen", name: "Sen the Ear", role: "fixer", fee: 1500000, wage: 60000, text: "Drinks with half the Kanchogai police station. Knows about a raid a day before the officers do." },
    { id: "taku", name: "Taku", role: "driver", fee: 500000, wage: 25000, text: "Drove a fish lorry for Hide. Has never been stopped. Collects from every place while you sleep." },
    { id: "ikki", name: "Ikki", role: "enforcer", fee: 600000, wage: 35000, text: "Young, loud, loyal to whoever fed him last. That's you now." },
    { id: "fumi", name: "Fumi-nēsan", role: "bookkeeper", fee: 900000, wage: 45000, text: "Ran the Mitamamori stalls' float out of a biscuit tin for thirty years and never lost a yen." },
    { id: "doc", name: "The Doctor", role: "fixer", fee: 2000000, wage: 70000, text: "Struck off. Stitches without questions, and knows which councillor owes whom." },
    { id: "kaze", name: "Kaze", role: "driver", fee: 700000, wage: 30000, text: "Rides a 400 through Suzuran at rush hour like it's an empty field." }
  ];
  const ROLE = { enforcer: "keeps a place safe and its heat down", bookkeeper: "a fifth more out of any place they run", fixer: "raids come half as often", driver: "brings the takings to the office every night" };
  const POLICY = { quiet: { name: "Run it quiet", mult: 0.6, heat: -3, honor: 0.4 }, business: { name: "Business as usual", mult: 1, heat: 1, honor: 0 }, squeeze: { name: "Squeeze it", mult: 1.7, heat: 4, honor: -1.2 } };

  const spots = {};
  const at = (key, spec) => spots[key] || (spots[key] = Q.place(Object.assign({ label: "" }, spec)));
  Y.spot = at;
  const ready = () => typeof world === "object" && world.cities && world.cities[0] && player.placed;

  // ---- markers in the world --------------------------------------------------------------------------------------------------------------
  let crestTex = null;
  function crest() {
    if (crestTex) return crestTex;
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
    const gr = g.createRadialGradient(64, 64, 6, 64, 64, 62); gr.addColorStop(0, "rgba(255,226,150,0.95)"); gr.addColorStop(0.45, "rgba(201,162,74,0.55)"); gr.addColorStop(1, "rgba(201,162,74,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#14110a"; g.beginPath(); g.moveTo(40, 52); g.lineTo(96, 52); g.lineTo(84, 64); g.lineTo(76, 64); g.lineTo(76, 76); g.lineTo(88, 84); g.lineTo(40, 84); g.lineTo(52, 76); g.lineTo(52, 64); g.lineTo(34, 60); g.closePath(); g.fill();
    crestTex = new THREE.CanvasTexture(c); crestTex.encoding = THREE.sRGBEncoding;
    return crestTex;
  }
  const marks = {};
  function mark(key, p, on) {
    let m = marks[key];
    if (!on) { if (m) { scene.remove(m); delete marks[key]; } return; }
    if (!m) { m = marks[key] = new THREE.Sprite(new THREE.SpriteMaterial({ map: crest(), depthTest: true, transparent: true, fog: false })); m.scale.set(0.7, 0.7, 1); scene.add(m); m.userData.y = world.surfaceY(p.x, p.z) + 0.75; }
    m.position.set(p.x, m.userData.y + Math.sin(clock * 2.2) * 0.08, p.z);
  }
  // people standing where they stand (contacts, managers), there while you are near
  const standers = {};
  function person(key, p, look, on, business) {
    let a = standers[key];
    if (a && (!on || actors.list.indexOf(a) < 0)) { if (actors.list.indexOf(a) >= 0) a.gone = true; delete standers[key]; a = null; }
    if (on && !a && !cut.active) { a = standers[key] = actorAdd({ x: p.x + 0.6, z: p.z + 0.6, female: /officelady|woman/.test(look), business: business !== false, tag: "yk", pose: "idle", look: [look] }); }
    if (a && Math.hypot(player.pos.x - a.x, player.pos.z - a.z) < 12) actorLook(a, player.pos.x, player.pos.z);
    return a;
  }

  // ---- what is near, and the F key ----------------------------------------------------------------------------------------------------------
  let near = null, scanT = 0;
  function scan() {
    near = null;
    if (!ready() || !Y.unlocked() || interior.active || drive.car || drive.train || cut.active) return;
    const s = S(), px = player.pos.x, pz = player.pos.z;
    const d = p => Math.hypot(px - p.x, pz - p.z);
    const consider = (kind, key, p, r) => { const dist = d(p); if (dist < (r || 2.6) && (!near || dist < near.d)) near = { kind: kind, key: key, d: dist }; return dist; };
    const gone = s.choice === "wipe";
    Object.keys(Y.TOKENS).forEach(k => { const t = Y.TOKENS[k], p = at("t:" + k, t.place), have = !!s.items[k] || !!s.met[t.for] || gone; const dist = d(p); mark("t:" + k, p, !have && dist < 160); if (!have) consider("token", k, p, 2.2); });
    Object.keys(Y.CONTACTS).forEach(k => { const c = Y.CONTACTS[k], p = at("c:" + k, c.place), dist = d(p), here = !gone && !fight.on; person("c:" + k, p, c.look, here && dist < 110, c.business); if (here) consider("contact", k, p, 3.2); });
    if (s.hq && !gone) { const p = at("hq", Y.HQ.place), dist = d(p); person("hq", p, "salaryman_10", dist < 110 && !fight.on); consider("hq", "hq", p, 3.2); }
    if (s.empire) Object.keys(Y.VENUES).forEach(k => { const v = Y.VENUES[k], p = at("v:" + k, v.place), dist = d(p); if (v.old && !gone) { consider("venue", k, p, 3.2); return; } person("v:" + k, p, v.mgr, dist < 110 && !fight.on, !/^(man|woman)_/.test(v.mgr)); consider("venue", k, p, 3.2); });
  }
  const promptText = () => {
    if (!near || C.menuState.on || Q.active() && near.kind !== "token") return "";
    const s = S(), k = pad.index >= 0 ? "Y" : "F";
    if (near.kind === "token") return k + "  pick up " + Y.TOKENS[near.key].name;
    if (near.kind === "contact") return k + "  talk to " + (s.met[near.key] ? Y.CONTACTS[near.key].name : "the man at " + Y.CONTACTS[near.key].spot.split(",")[0]);
    if (near.kind === "hq") return k + "  the Kurogane Kōgyō office";
    if (near.kind === "venue") return k + "  " + Y.VENUES[near.key].name + (s.empire && s.empire.owned[near.key] ? "" : " (for sale)");
    return "";
  };
  C.prompts.push({ text: promptText, use: () => {
    if (!near) return false;
    if (near.kind === "token") return pick(near.key), true;
    if (near.kind === "contact") return talkContact(near.key), true;
    if (near.kind === "hq") return talkHQ(), true;
    if (near.kind === "venue") return visit(near.key), true;
    return false;
  } });

  function pick(k) {
    const s = S(), t = Y.TOKENS[k]; if (s.items[k]) return;
    s.items[k] = true; mark("t:" + k, null, false);
    try { playBlip(660, 0.1, 0.05); setTimeout(() => playBlip(990, 0.16, 0.05), 110); } catch (e) { /* quiet */ }
    C.menu({ head: "Found: " + t.name, tag: "Kurogane-kai", body: t.found + "<br><br><i>Someone at " + Y.CONTACTS[t.for].spot + " would know what it means.</i>", opts: [{ label: "Keep it", fn: () => {} }], cancel: () => {} });
    G.achieve("yk_token"); saveGame(null, true);
  }

  // ---- regard, rank, gifts -------------------------------------------------------------------------------------------------------------------
  Q.handlers.crew = n => Y.regard(n);
  Y.regard = function (n, quiet) {
    const s = S(); s.regard = Math.max(0, s.regard + n);
    if (!quiet && n) say((n > 0 ? "The family thinks more of you" : "The family thinks less of you") + " (" + (n > 0 ? "+" : "") + n + ").", 3);
    let r = s.rank;
    while (r < 5 && s.regard >= Y.RANKS[r + 1].need && (r + 1 < 2 || s.done.sakazuki)) r++;
    if (r > s.rank) Y.setRank(r);
  };
  Y.setRank = function (r) {
    const s = S(), R = Y.RANKS[r]; if (r <= s.rank) return;
    s.rank = r;
    setTimeout(() => { storyPassed(R.name, "Kurogane-kai" + (R.jp ? " · " + R.jp : "")); }, 400);
    C.emit("yakuza:rank", { rank: R.id, name: R.name, tier: r });
    try { if (window.standing) window.standing.earn(4 + r * 2, R.name + " of the Kurogane-kai"); } catch (e) { /* optional */ }
    if (R.kinds) setTimeout(() => {
      const d = { id: "kai:" + R.id, family: "kurogane", rank: R.id, rankName: R.name, tier: r, from: r >= 6 ? "Kurogane Jūzō" : "The Kurogane-kai", note: R.note, kinds: R.kinds.slice(), budget: R.budget };
      if (s.gifts.some(x => x.id === d.id)) return;
      let got = null; try { if (window.luxury && typeof luxury.gift === "function") got = luxury.gift(d); } catch (e) { console.warn("[Yakuza] luxury.gift:", e); }
      if (got && got.name) d.item = got.name;
      s.gifts.push(d); C.emit("yakuza:gift", d);
      notify("Messages", d.from, (d.item ? d.item + ". " : "A small box, wrapped in black. ") + "“" + R.note + "”", 10);
    }, 6500);
    saveGame(null, true);
  };
  Y.gifts = () => S().gifts.slice();
  Y.startJob = id => startJob(Y.jobs[id]);
  Y.talkTo = k => k === "hq" ? talkHQ() : talkContact(k);

  // ---- the contacts ------------------------------------------------------------------------------------------------------------------------
  function available(from) {
    const s = S();
    return Object.keys(Y.jobs).map(k => Y.jobs[k]).filter(j => j.from === from && !s.done[j.id] && s.rank >= (j.rank || 1) && (j.after || []).every(k => s.done[k]) && (!j.when || j.when(s)));
  }
  function talkContact(k) {
    const s = S(), c = Y.CONTACTS[k];
    if (Q.active()) { say(c.name + ": “Finish what you're doing first.”", 3); return; }
    if (!s.met[k]) {
      if (!s.items[c.token]) { C.menu({ head: "A man at " + c.spot.split(",")[0], tag: "", body: "“" + c.cold + "”", opts: [{ label: "Walk on", fn: () => {} }], cancel: () => {} }); return; }
      s.met[k] = true; if (s.rank < 1) { s.regard = Math.max(s.regard, 1); Y.setRank(1); }
      if (!mynet.contacts.some(x => x.handle === "yk:" + k)) mynet.contacts.push({ name: c.full + " · Kurogane-kai", handle: "yk:" + k, phone: "090-9" + (100 + Object.keys(Y.CONTACTS).indexOf(k)) + "-8931", line: "" });
      if (Object.keys(Y.CONTACTS).every(x => s.met[x])) { G.achieve("yk_doors"); s.hq = true; setTimeout(() => notify("Messages", "Unknown number", "You've met all three. The oyabun will see you. Kurogane Kōgyō, Higashiura docks.", 10), 5000); }
      C.menu({ head: c.full, tag: "Kurogane-kai", body: "“" + c.warm + "”", opts: [{ label: "“I'm listening.”", fn: () => setTimeout(() => talkContact(k), 150) }] });
      saveGame(null, true); return;
    }
    const jobs = available(k);
    const opts = jobs.map(j => ({ label: j.title, note: "pays " + yenText(j.pay), fn: () => startJob(j) }));
    opts.push({ label: "“What do you hear?”", fn: () => say(c.name + ": “" + rumour(k) + "”", 6) });
    opts.push({ label: "Leave", fn: () => {} });
    C.menu({ head: c.full, tag: Y.rankName() + " · regard " + s.regard, body: jobs.length ? "“Work, if you want it.”" : (allFrom(k).every(j => s.done[j.id]) ? "“Nothing more from me. You've outgrown my corner. Go and see the others, or the office at the docks.”" : "“Nothing for you yet. Come back when the family knows you better.”"), opts: opts, cancel: () => {} });
  }
  const allFrom = k => Object.keys(Y.jobs).map(x => Y.jobs[x]).filter(j => j.from === k);
  function rumour(k) {
    const s = S(), left = Object.keys(Y.CONTACTS).filter(x => !s.met[x]);
    if (left.length) { const c = Y.CONTACTS[left[0]], t = Y.TOKENS[c.token]; return "There's a man at " + c.spot + ". He won't talk unless you show him " + t.name + ". Try " + (c.token === "ball" ? "the shopping streets in Suzuran" : c.token === "kiku" ? "the Gosho Gardens" : "the quay at Kanmei-futo") + "."; }
    if (s.rank < 5) return "The oyabun's watching you. " + (Y.RANKS[s.rank + 1].need - s.regard) + " more and you move up.";
    return "The old man isn't well. When he goes, somebody sits in his chair. People are saying it's the salary man.";
  }
  function startJob(j) {
    const run = () => {
      const def = { id: "yk:" + j.id, title: j.title, people: j.people, talks: j.talks, steps: j.steps };
      Y.job = j;
      const ctx = Q.run(def, c => jobDone(j, c));
      ctx.yk = true;
    };
    if (j.arm && !wheel.pistolOwned) { wheel.pistolOwned = true; gunGive("pistol", 3); notify("Messages", "Kurogane-kai", "There's a pistol in the bag. It was never registered to anyone. Keep it.", 7); }
    if (j.brief) Q.talk({ start: { who: (Y.CONTACTS[j.from] || { name: "Kurogane Jūzō" }).name, say: j.brief, opts: [{ t: "“I'll do it.”", end: true }, { t: "“Not this one.”", flag: "__no", end: true }] } }, { score: 0, n: 0, flags: {} }, c => { if (!c.flags.__no) run(); }, j.title);
    else run();
  }
  function restoreDay() {
    if (!C.active()) { storyClearObjective(); return; }
    const so = story.soti;
    if (story.step === "c:home") C.goHome();
    else if (so && (story.step === "c:toWork" || story.step === "c:floor" || story.step === "c:field")) { storyClearBlips(); storyBlip(so.door[0], so.door[1], "SOTI Tower"); storyObjective(story.step === "c:toWork" ? "Get to SOTI Tower by 9:00" : "Back to work: SOTI Tower", ""); }
  }
  function jobDone(j, ctx) {
    const s = S();
    Y.job = null;
    if (ctx.failed) { s.fails++; storyClearBlips(); say("The job went wrong. " + (Y.CONTACTS[j.from] ? Y.CONTACTS[j.from].name : "The office") + " will have it for you again.", 5); restoreDay(); return; }
    s.done[j.id] = true;
    const pay = Math.round(j.pay * (0.7 + 0.1 * ctx.rating) / 1000) * 1000;
    purse.yen += pay;
    storyPassed(j.title, "Kurogane-kai · paid " + yenText(pay));
    C.emit("yakuza:job", { job: j.id, title: j.title, pay: pay, rating: ctx.rating });
    setTimeout(() => { Y.regard(Math.round((j.regard || 8) * (0.6 + 0.1 * ctx.rating)), true); if (j.done) try { j.done(ctx, s); } catch (e) { console.warn("[Yakuza] after " + j.id + ":", e); } restoreDay(); saveGame(null, true); }, 5400);
  }

  // ---- the office at the docks: the oyabun, and the choice --------------------------------------------------------------------------------------
  function talkHQ() {
    const s = S();
    if (Q.active()) { say("Kuroda: “Later.”", 2.5); return; }
    const jobs = available("hq");
    if (s.choice === "stay") {
      C.menu({ head: "Kurogane Kōgyō", tag: "Wakagashira", body: "<b>Kuroda:</b> “Kashira. The three old places are yours to run. The old man's asleep.”", cancel: () => {}, opts: [
        { label: "The family's places", fn: () => Y.office() },
        { label: "“It's time the family had a new head.” (end them)", fn: () => confirmWipe() }, { label: "Leave", fn: () => {} }] });
      return;
    }
    const opts = jobs.map(j => ({ label: j.title, note: j.pay ? "pays " + yenText(j.pay) : "", fn: () => startJob(j) }));
    if (s.rank >= 5 && s.done.tower && !s.choice) opts.unshift({ label: "The oyabun is asking for you", note: "the choice", fn: () => Y.succession() });
    opts.push({ label: "Leave", fn: () => {} });
    C.menu({ head: "Kurogane Kōgyō", tag: Y.rankName() + " · regard " + s.regard, cancel: () => {},
      body: "<b>Kuroda:</b> “" + (jobs.length || opts.length > 1 ? "The oyabun has work for you." : s.rank < 2 ? "The old man will drink the cup with you when the family knows your name. Twenty-two, he says. You're at " + s.regard + "." : "Nothing today. Earn the family's regard at the three corners.") + "”", opts: opts });
  }
  Y.succession = function () {
    const s = S();
    C.menu({ head: "Kurogane Jūzō", tag: "The back room", body: "<b>Jūzō:</b> “Sit. I'm seventy-four and my liver is older. Benzō is greedy, Genji is sentimental, Hide can't count. You can count, and you bow like you mean it.<br>I'm naming you wakagashira. My second. When I go, the chair is yours.<br>But a second is for life, salary man. You drink this cup and there is no tower to go back to. Or you put the cup down, and we both know what a man who knows this much and won't drink has to do next.”",
      opts: [
        { label: "Drink the cup. Stay with the family.", note: "wakagashira", fn: () => choose("stay") },
        { label: "Put the cup down. End the Kurogane-kai tonight.", note: "kill them all", fn: () => confirmWipe() },
        { label: "“Give me a night to think.”", fn: () => say("Jūzō: “One night. I may not have many more to give.”", 4) }] });
  };
  function choose(how) {
    const s = S();
    s.choice = how;
    C.emit("yakuza:choice", { choice: how });
    if (how === "stay") {
      s.rank = Math.max(s.rank, 5); Y.setRank(6);
      G.achieve("yk_second"); G.achieve("yk_stay");
      Q.honor(-6, "Swore yourself to the Kurogane-kai for life");
      s.empire = s.empire || freshEmpire(false);
      setTimeout(() => notify("Messages", "Kuroda", "Kashira. The mahjong tables, the stalls and Stall No. 8 answer to you now. A fifth of what they take is yours. Visit them.", 10), 7000);
      addOffice();
    }
    saveGame(null, true);
  }
  function confirmWipe() {
    C.menu({ head: "End the Kurogane-kai", tag: "No way back", body: "Benzō at the tables. Genji at the stalls. Hide at the market. Kuroda and the office. And the old man.<br>All of them, tonight, before any of them can warn the next.<br><br><i>You will need a gun, ammunition, and your health. It cannot be undone.</i>",
      opts: [{ label: "Do it.", fn: () => Y.wipe() }, { label: "Not yet.", fn: () => {} }], cancel: () => {} });
  }
  Y.wipe = function () {
    const s = S();
    if (!wheel.pistolOwned) { wheel.pistolOwned = true; }
    gunGive("pistol", 6);
    if (GUNS.smg) { wheel.smgOwned = true; gunGive("smg", 4); }
    const stop = (k, n, guns, text) => ({ fight: { at: Y.CONTACTS[k].place, n: n, guns: guns, boss: { name: Y.CONTACTS[k].name, look: Y.CONTACTS[k].look, hp: 240 }, text: text, hint: "They are armed. Aim with right mouse / LT, fire with left mouse / RT." } });
    Y.job = { id: "wipe", title: "Kurogane Falls" };
    const ctx = Q.run({ id: "yk:wipe", title: "Kurogane Falls", steps: [
      { say: "Tonight. All of them." },
      stop("benzo", 3, 2, "The mahjong parlour, Kurotani: Benzō and his table"),
      stop("genji", 3, 1, "The stalls at Mitamamori: Brother Genji"),
      stop("hide", 4, 2, "The fish market, Higashiura: Sharkskin Hide"),
      { fight: { at: Y.HQ.place, n: 6, guns: 4, boss: { name: "Kuroda", look: "salaryman_10", hp: 320 }, text: "Kurogane Kōgyō: Kuroda and the office", hint: "The last of them. The old man is inside." } },
      { talk: { start: { who: "Kurogane Jūzō", say: "…So. The cup went down. I heard the shooting come across the city, corner by corner, and I thought: he counts well. Seventy-four years, and it's a salary man. I'm unarmed, boy. I always was. What now?", opts: [
        { t: "“There's a train to Mizuho at six. Be on it. Tōkonto never sees you again.”", honor: 10, flag: "mercy", why: "Let an old man leave alive", end: true, reply: "Jūzō stands, slowly, and bows. Properly. “Mizuho. Rice country. …You'll make a strange oyabun.”" },
        { t: "Raise the gun.", honor: -12, flag: "cold", why: "Shot an unarmed old man", end: true, reply: "One shot. The city is very quiet afterwards." }] } }, head: "The back room" }
    ] }, c => {
      Y.job = null;
      if (c.failed) { say("You didn't finish it. They know now. Finish it, or they will.", 6); s.choice = s.choice === "stay" ? "stay" : null; s.warned = true; restoreDay(); return; }
      s.choice = "wipe"; s.rank = 7; s.hq = false;
      Object.keys(standers).forEach(k => person(k, null, "", false));
      storyPassed("Kurogane Falls", "The Kurogane-kai is finished. The empire is yours.");
      G.achieve("yk_sweep"); G.achieve(c.flags.mercy ? "yk_mercy" : "yk_cold");
      C.emit("yakuza:choice", { choice: "wipe", mercy: !!c.flags.mercy });
      C.emit("yakuza:rank", { rank: "oyabun", name: "Oyabun", tier: 7 });
      try { if (window.standing) window.standing.earn(14, "Took the Kurogane-kai's empire"); } catch (e) { /* optional */ }
      s.empire = freshEmpire(true, s.empire);
      addOffice();
      setTimeout(() => { notify("Messages", "The Office", "Every door the Kurogane-kai had is yours, and there are more for sale. Open Contacts and ring The Office to hire people and buy places. Visit a place to run it.", 12); restoreDay(); saveGame("Saved.", true); }, 6000);
    });
    ctx.yk = true;
  };

  // ---- fights -----------------------------------------------------------------------------------------------------------------------------
  // Gangsters are people on the street (peds.list) in a state of their own: they close on Seiko, the armed ones stop and shoot, the rest swing.
  const fight = Y.fight = { on: false, list: [], at: null, engaged: false, next: null, ctx: null, text: "" };
  const SUITS = ["salaryman_01", "salaryman_05", "salaryman_06", "salaryman_08", "salaryman_09", "man_01", "man_03", "man_05"];
  function gangster(x, z, o) {
    const e = pplLib.ready.find(p => p.name === o.look) || pplLib.ready.filter(p => !p.female)[(Math.random() * 8) | 0] || pplLib.ready[0];
    if (!e) return null;
    const h = o.boss ? 1.04 : 0.95 + Math.random() * 0.1, f = pplFigure(e, h);
    const p = Object.assign({ moving: true }, f, { x: x, z: z, y: world.surfaceY(x, z), yaw: Math.random() * 6.28, sp: 3.2 + Math.random() * 1.2, state: "yk", yk: true, t: 0, hp: o.hp || 110, h: h, said: 0, armed: !!o.armed, boss: !!o.boss, ykName: o.name || "", coolT: 1.2 + Math.random() * 2, idleIn: 999 });
    p.holder.position.set(p.x, p.y, p.z); scene.add(p.holder); pedPlay(p, "idle", 0);
    peds.list.push(p);
    return p;
  }
  Q.handlers.fight = function (f, ctx, next, q) {
    const p = Q.place(f.at);
    Object.assign(fight, { on: true, list: [], at: p, engaged: false, next: next, ctx: ctx, f: f, q: q, spawned: false });
    storyClearBlips(); storyBlip(p.x, p.z, f.text, { col: "#e0453a" });
    storyObjective(f.text, f.hint || "");
  };
  Q.handlers.abort = function () { endFight(false); };
  function spawnFight() {
    const f = fight.f, p = fight.at; fight.spawned = true;
    const n = f.n || 3;
    for (let i = 0; i < n + (f.boss ? 1 : 0); i++) {
      const boss = f.boss && i === n, a = (i / (n + 1)) * Math.PI * 2, r = boss ? 2 : 4 + Math.random() * 5;
      let x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
      if (typeof insideBuilding === "function" && insideBuilding(x, z, 0.5)) { x = p.x; z = p.z; }
      const g = gangster(x, z, boss ? { boss: true, hp: f.boss.hp, look: f.boss.look, name: f.boss.name, armed: true } : { armed: i < (f.guns || 0), look: SUITS[(i * 3 + n) % SUITS.length] });
      if (g) fight.list.push(g);
    }
  }
  function endFight(won) {
    if (!fight.on) return;
    fight.on = false;
    fight.list.forEach(p => { if (p.state !== "dead" && peds.list.indexOf(p) >= 0) { p.yk = false; pedSet(p, "flee"); } });
    fight.list = [];
    const el = document.getElementById("ykfight"); if (el) el.classList.remove("on");
    if (won === undefined) return;
  }
  function failFight(why) {
    const q = Q.cur, done = q && q.done, ctx = fight.ctx;
    endFight(false);
    if (q) { Q.cur = null; actorsClear("quest"); storyClearBlips(); storyClearObjective(); }
    say(why, 5);
    if (ctx) ctx.failed = true;
    if (done) try { done(Object.assign(ctx || {}, { failed: true, rating: 1 })); } catch (e) { console.warn("[Yakuza] fail:", e); }
  }
  function fightHud() {
    let el = document.getElementById("ykfight");
    if (!el) { ykCss(); el = document.createElement("div"); el.id = "ykfight"; document.body.appendChild(el); }
    const alive = fight.list.filter(p => p.state !== "dead"), boss = alive.find(p => p.boss);
    el.classList.add("on");
    el.innerHTML = "<b>" + alive.length + "</b> left" + (boss ? "<span>" + boss.ykName + "<i><u style='width:" + Math.max(0, Math.round(boss.hp / fight.f.boss.hp * 100)) + "%'></u></i></span>" : "");
  }
  function fightTick(dt) {
    if (!fight.on || cut.active || C.menuState.on) return;
    const px = player.pos.x, pz = player.pos.z, at = drive.car ? drive.car.pos : player.pos;
    const d = Math.hypot(at.x - fight.at.x, at.z - fight.at.z);
    if (!fight.spawned) { if (d < 70 && !interior.active) spawnFight(); return; }
    if (!fight.engaged && d < 26) { fight.engaged = true; storyClearBlips(); say(fight.f.boss ? fight.f.boss.name + ": “It's the salary man. He's come to count us.”" : "“That's him! Get him!”", 4); adrenalineRush(30); }
    if (!fight.engaged) { fight.list.forEach(p => { if (p.state !== "dead") p.state = "yk"; }); return; }
    if (d > 240) { failFight("You ran. They'll be ready next time."); return; }
    let alive = 0;
    for (const p of fight.list) {
      if (p.state === "dead") continue;
      if (peds.list.indexOf(p) < 0) continue;                                    // gone with the street (left far behind)
      alive++;
      if (p.state === "down") continue;
      p.state = "yk";
      const dx = px - p.x, dz = pz - p.z, dist = Math.hypot(dx, dz) || 1;
      p.coolT -= dt;
      const hold = p.armed ? (p.boss ? 9 : 7 + (p.sp * 1.3)) : 1.25;
      if (dist > hold) { pedFree(p, dt, p.armed ? p.sp * 0.8 : p.sp, dx, dz); pedPlay(p, "run", 0.2, 1); }
      else {
        let dy = Math.atan2(dx, dz) - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * Math.min(1, dt * 8);
        pedPlay(p, "idle", 0.2);
        if (p.coolT <= 0 && !interior.active) {
          if (p.armed) {
            p.coolT = (p.boss ? 0.9 : 1.5) + Math.random() * 1.2;
            try { gunSound(GUNS.pistol); } catch (e) { /* quiet */ }
            const moving = Math.abs(player.speed || 0) > 3 || !!drive.car, hit = Math.random() < Math.max(0.12, 0.62 - dist * 0.022 - (moving ? 0.22 : 0));
            if (hit) hurtSeiko(drive.car ? 0.03 : 0.075);
            try { gunSpark(new THREE.Vector3(px + (hit ? 0 : (Math.random() - 0.5) * 2.4), player.pos.y + 1.2, pz + (hit ? 0 : (Math.random() - 0.5) * 2.4)), 0xffd27a); } catch (e) { /* no spark */ }
          } else if (!drive.car) { p.coolT = 0.9 + Math.random() * 0.5; hurtSeiko(0.05); try { playBlip(120, 0.08, 0.08); } catch (e) { /* quiet */ } }
        }
      }
    }
    fightHud();
    if (vitals.health <= 0.01) { try { collapse(); } catch (e) { vitals.health = 1; } failFight("You woke up in hospital. The family sent flowers. Black ones."); return; }
    if (!alive) {
      const next = fight.next; endFight(true);
      say("It's done here.", 3);
      storyTick_done(() => next && next());
    }
  }
  function hurtSeiko(n) {
    vitals.health = Math.max(0, vitals.health - n); vitals.stress = Math.min(1, (vitals.stress || 0) + 0.02);
    try { rumble(0.8, 0.6, 140); } catch (e) { /* no pad */ }
    const f = document.getElementById("ykhit") || (() => { ykCss(); const e = document.createElement("div"); e.id = "ykhit"; document.body.appendChild(e); return e; })();
    f.classList.remove("on"); void f.offsetWidth; f.classList.add("on");
  }
  // shooting a gangster who is shooting at you is not the same deed as shooting a stranger, and nobody rings the police for him
  const witnessWas = window.witnessCrime;
  if (typeof witnessWas === "function") window.witnessCrime = function (id, where, R, except) {
    if (fight.on && fight.engaged && (except && except.yk || id === "gun")) { try { adrenalineRush(15); pedAlarm(where, R || 45, null, except); } catch (e) { /* quiet */ } return false; }
    return witnessWas.apply(this, arguments);
  };
  const hurtWas = window.pedHurt;
  if (typeof hurtWas === "function") window.pedHurt = function (p, dmg, kind) {
    const was = p && p.yk;
    const r = hurtWas.apply(this, arguments);
    if (was && r === "hurt") { p.state = "yk"; p.coolT = Math.min(p.coolT, 0.4); if (fight.on && !fight.engaged) fight.engaged = true; }
    return r;
  };
  const pedsTickWas = window.pedsTick;
  window.pedsTick = function (dt) { pedsTickWas.apply(this, arguments); try { fightTick(dt); } catch (e) { console.warn("[Yakuza] fight:", e); } };

  // ---- the empire --------------------------------------------------------------------------------------------------------------------------
  function freshEmpire(all, was) {
    const e = was || { owned: {}, crew: [], heat: 0, bank: 0, quietDays: 0 };
    e.share = all ? 1 : 0.2;
    Object.keys(Y.VENUES).forEach(k => { if (Y.VENUES[k].old && !e.owned[k]) e.owned[k] = { level: 1, policy: "business", manager: null, till: 0, shut: 0 }; });
    return e;
  }
  const dayNow = () => Math.floor(((typeof TIME === "object" ? TIME.startMin : 0) + clock * (typeof TIME === "object" ? TIME.rate : 1)) / 1440);
  const crewOf = id => Y.CREW.find(c => c.id === id);
  Y.incomeOf = function (k) {
    const e = S().empire, o = e && e.owned[k]; if (!o) return 0;
    const v = Y.VENUES[k], m = o.manager && crewOf(o.manager);
    return Math.round(v.income * (1 + 0.4 * (o.level - 1)) * POLICY[o.policy].mult * (m && m.role === "bookkeeper" ? 1.2 : 1) * e.share / 1000) * 1000;
  };
  function daily() {
    const s = S(), e = s.empire; if (!e) return;
    const d = dayNow();
    if (s.day < 0) { s.day = d; return; }
    if (d <= s.day) return;
    const days = Math.min(3, d - s.day); s.day = d;
    for (let n = 0; n < days; n++) {
      let total = 0, heat = 0, honor = 0, allQuiet = true;
      const has = role => e.crew.some(id => crewOf(id).role === role);
      Object.keys(e.owned).forEach(k => {
        const o = e.owned[k], v = Y.VENUES[k], m = o.manager && crewOf(o.manager);
        if (o.shut > 0) { o.shut--; return; }
        const inc = Y.incomeOf(k); o.till += inc; total += inc;
        heat += (v.heat + POLICY[o.policy].heat) * (m && m.role === "enforcer" ? 0.5 : 1);
        honor += POLICY[o.policy].honor; if (o.policy !== "quiet") allQuiet = false;
      });
      const wages = e.crew.reduce((a, id) => a + crewOf(id).wage, 0);
      e.heat = Math.max(0, Math.min(100, e.heat * 0.9 + heat * 0.5 - (has("enforcer") ? 1 : 0)));
      if (has("driver")) { let got = 0; Object.keys(e.owned).forEach(k => { got += e.owned[k].till; e.owned[k].till = 0; }); e.bank += got; }
      e.bank -= wages;
      if (honor) Q.honor(Math.max(-4, Math.min(3, honor * 0.5)), honor > 0 ? "Ran your places quiet" : "Squeezed the neighbourhood");
      e.quietDays = allQuiet ? e.quietDays + 1 : 0; if (e.quietDays >= 7) G.achieve("yk_legit");
      // a raid: the hotter the empire, the likelier; a fixer hears about it first
      const chance = Math.max(0, (e.heat - 35) / 160) * (has("fixer") ? 0.5 : 1);
      if (Math.random() < chance) {
        const open = Object.keys(e.owned).filter(k => !e.owned[k].shut), k = open[(Math.random() * open.length) | 0];
        if (k) { const o = e.owned[k], lost = o.till; o.till = 0; o.shut = 2; e.heat *= 0.6; notify("Messages", "The Office", "The police raided " + Y.VENUES[k].name + ". " + (lost ? yenText(lost) + " in the till is gone, and it's " : "It's ") + "shut for two days. Ease off, or hire someone who hears things.", 10); }
      }
      C.emit("yakuza:income", { total: total, wages: wages, heat: Math.round(e.heat), bank: e.bank });
    }
    if (e.bank < 0 && e.crew.length) { const id = e.crew.pop(); notify("Messages", "The Office", crewOf(id).name + " hasn't been paid and has walked. The office is " + yenText(-e.bank) + " short.", 9); Object.keys(e.owned).forEach(k => { if (e.owned[k].manager === id) e.owned[k].manager = null; }); }
  }
  function addOffice() { if (!mynet.contacts.some(x => x.handle === "yk:office")) mynet.contacts.unshift({ name: "The Office", handle: "yk:office", phone: "090-8931-0001", line: "" }); }
  Y.office = function () {
    const s = S(), e = s.empire; if (!e) return;
    const owned = Object.keys(e.owned), boss = s.choice === "wipe";
    const tills = owned.reduce((a, k) => a + e.owned[k].till, 0), perDay = owned.reduce((a, k) => a + (e.owned[k].shut ? 0 : Y.incomeOf(k)), 0), wages = e.crew.reduce((a, id) => a + crewOf(id).wage, 0);
    C.menu({ head: boss ? "The Office" : "The family's places", tag: boss ? "Oyabun" : "Wakagashira · a fifth is yours", cancel: () => {},
      body: "<b>" + owned.length + "</b> places · " + yenText(perDay) + " a day" + (wages ? " · wages " + yenText(wages) : "") + "<br>In the office safe: <b>" + yenText(Math.max(0, e.bank)) + "</b> · waiting in the tills: <b>" + yenText(tills) + "</b><br>Heat: <b>" + Math.round(e.heat) + "</b> / 100" + (e.heat > 50 ? " — <span style='color:#ff8a7a'>raids are coming</span>" : ""),
      opts: [
        { label: "Take the money in the safe", note: yenText(Math.max(0, e.bank)), dim: e.bank <= 0, fn: () => { purse.yen += e.bank; notify("Wallet", "The Office", "+" + yenText(e.bank), 5); e.bank = 0; saveGame(null, true); } },
        { label: "Places", note: owned.length + " of " + Object.keys(Y.VENUES).length, fn: () => placesMenu() },
        { label: "People", note: boss ? e.crew.length + " hired" : "the oyabun hires", dim: !boss, fn: () => crewMenu() },
        { label: "Close", fn: () => {} }] });
  };
  function placesMenu() {
    const s = S(), e = s.empire, boss = s.choice === "wipe";
    C.menu({ head: "Places", tag: "Visit one to run it", cancel: () => Y.office(), opts: Object.keys(Y.VENUES).map(k => {
      const v = Y.VENUES[k], o = e.owned[k];
      return { label: v.name + " · " + v.kind, note: o ? (o.shut ? "raided, shut" : yenText(Y.incomeOf(k)) + "/day · till " + yenText(o.till)) : "for sale " + yenText(v.price), dim: !o && !boss, fn: () => {
        const p = at("v:" + k, v.place); storyClearBlips(); storyBlip(p.x, p.z, v.name, { col: "#c9a24a" }); say(v.name + " is marked on your map.", 3); } };
    }).slice(0, 12) });
  }
  function crewMenu() {
    const e = S().empire;
    C.menu({ head: "People", tag: e.crew.length + " hired", cancel: () => Y.office(), opts: Y.CREW.map(c => {
      const mine = e.crew.indexOf(c.id) >= 0;
      return { label: c.name + " · " + c.role, note: mine ? "yours · " + yenText(c.wage) + "/day" : yenText(c.fee) + " + " + yenText(c.wage) + "/day", fn: () => {
        C.menu({ head: c.name, tag: c.role + ": " + ROLE[c.role], body: c.text, cancel: () => crewMenu(), opts: mine
          ? [{ label: "Let them go", fn: () => { e.crew.splice(e.crew.indexOf(c.id), 1); Object.keys(e.owned).forEach(k => { if (e.owned[k].manager === c.id) e.owned[k].manager = null; }); crewMenu(); } }, { label: "Back", fn: () => crewMenu() }]
          : [{ label: "Hire", note: yenText(c.fee), dim: purse.yen < c.fee, fn: () => { purse.yen -= c.fee; e.crew.push(c.id); notify("Messages", c.name, "Oyabun. I'm yours. Put me somewhere.", 6); if (e.crew.length >= 6) G.achieve("yk_crew"); saveGame(null, true); crewMenu(); } }, { label: "Back", fn: () => crewMenu() }] });
      } };
    }) });
  }
  // at the door of a place
  function visit(k) {
    const s = S(), e = s.empire, v = Y.VENUES[k]; if (!e) return;
    const o = e.owned[k], boss = s.choice === "wipe";
    if (!o) {
      C.menu({ head: v.name, tag: v.kind + " · for sale", cancel: () => {}, body: "<b>The owner:</b> “The Kurogane-kai used to take a third of this place. You're the one who ended them? Then buy it outright and I'll run it for you. " + yenText(v.income) + " a day, on a normal day.”",
        opts: [{ label: "Buy " + v.name, note: yenText(v.price), dim: !boss || purse.yen < v.price, fn: () => { purse.yen -= v.price; e.owned[k] = { level: 1, policy: "business", manager: null, till: 0, shut: 0 }; storyPassed(v.name, "A new place for the empire"); try { if (window.standing) window.standing.earn(3, "Bought " + v.name); } catch (e2) { /* optional */ } if (Object.keys(Y.VENUES).every(x => e.owned[x])) G.achieve("yk_landlord"); saveGame(null, true); } }, { label: "Leave", fn: () => {} }] });
      return;
    }
    const m = o.manager && crewOf(o.manager), up = o.level < 3 ? Math.round((v.price || 6000000) * 0.4 * o.level) : 0;
    C.menu({ head: v.name, tag: v.kind + " · level " + o.level, cancel: () => {},
      body: (o.shut ? "<span style='color:#ff8a7a'>Shut after a raid: " + o.shut + " more day" + (o.shut > 1 ? "s" : "") + ".</span><br>" : "") + "Takes " + yenText(Y.incomeOf(k)) + " a day · " + POLICY[o.policy].name.toLowerCase() + "<br>In the till: <b>" + yenText(o.till) + "</b><br>Run by: <b>" + (m ? m.name + " (" + m.role + ")" : "the old manager") + "</b>",
      opts: [
        { label: "Collect the takings", note: yenText(o.till), dim: !o.till, fn: () => { purse.yen += o.till; notify("Wallet", v.name, "+" + yenText(o.till), 5); o.till = 0; saveGame(null, true); } },
        { label: "How it's run", note: POLICY[o.policy].name, fn: () => C.menu({ head: v.name, tag: "How it's run", cancel: () => visit(k), opts: Object.keys(POLICY).map(p => ({ label: POLICY[p].name, note: "×" + POLICY[p].mult + " money · " + (POLICY[p].heat > 1 ? "a lot of heat, costs honor" : POLICY[p].heat < 0 ? "cools the heat, good for your name" : "a little heat"), fn: () => { o.policy = p; visit(k); } })) }) },
        { label: "Improve the place", note: up ? yenText(up) : "as good as it gets", dim: !up || !boss || purse.yen < up, fn: () => { purse.yen -= up; o.level++; say(v.name + " is better for it. Level " + o.level + ".", 4); saveGame(null, true); visit(k); } },
        { label: "Put someone in charge", note: boss ? (e.crew.length ? "" : "hire people at The Office") : "the oyabun decides", dim: !boss || !e.crew.length, fn: () => C.menu({ head: v.name, tag: "Who runs it", cancel: () => visit(k), opts: e.crew.map(id => { const c = crewOf(id), busy = Object.keys(e.owned).find(x => e.owned[x].manager === id); return { label: c.name + " · " + c.role, note: busy ? "at " + Y.VENUES[busy].name : ROLE[c.role], fn: () => { if (busy) e.owned[busy].manager = null; o.manager = id; visit(k); } }; }).concat([{ label: "The old manager", fn: () => { o.manager = null; visit(k); } }]) }) },
        { label: "Leave", fn: () => {} }] });
  }

  // ---- the phone ----------------------------------------------------------------------------------------------------------------------------
  const callWas = window.mynetCall;
  if (typeof callWas === "function") window.mynetCall = function (c) {
    if (c && typeof c.handle === "string" && c.handle.indexOf("yk:") === 0) {
      if (phone.open) setPhone(false);
      const k = c.handle.slice(3), s = S();
      if (k === "office") { if (s.empire) Y.office(); return; }
      if (s.choice === "wipe") { say("The number is no longer in service.", 3); return; }
      const cc = Y.CONTACTS[k], p = at("c:" + k, cc.place), jobs = available(k);
      C.menu({ head: "📞 " + cc.full, tag: "Kurogane-kai", body: "“" + (jobs.length ? "I've got work. Not on the phone. Come to " + cc.spot + "." : "Nothing for you. Don't ring this number for nothing.") + "”", cancel: () => {},
        opts: [{ label: "Mark " + cc.spot.split(",")[0] + " on the map", fn: () => { if (!Q.active()) { storyClearBlips(); storyBlip(p.x, p.z, cc.spot, { col: "#c9a24a" }); } } }, { label: "Hang up", fn: () => {} }] });
      return;
    }
    return callWas.apply(this, arguments);
  };

  // ---- on the map ----------------------------------------------------------------------------------------------------------------------------
  const mapWas = C.mapIcons;
  C.mapIcons = function (ctx, toScreen, opts) {
    if (mapWas) mapWas.apply(this, arguments);
    if (!Y.unlocked() || !ready() || (opts && opts.labels === false)) return;
    const s = S(), dot = (p, col, ch, label) => { const q = toScreen(p.x, p.z); ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], 8, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#111"; ctx.font = "900 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ch, q[0], q[1] + 1); if (label) { ctx.font = "700 12px sans-serif"; ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.lineWidth = 3; ctx.strokeText(label, q[0], q[1] + 19); ctx.fillText(label, q[0], q[1] + 19); } ctx.restore(); };
    if (s.choice !== "wipe") {
      Object.keys(Y.CONTACTS).forEach(k => { const c = Y.CONTACTS[k]; dot(at("c:" + k, c.place), s.met[k] ? "#c9a24a" : "#8a8f96", s.met[k] ? "組" : "?", s.met[k] ? c.name : ""); });
      Object.keys(Y.TOKENS).forEach(k => { const t = Y.TOKENS[k]; if (!s.items[k] && !s.met[t.for] && s.met[Object.keys(Y.CONTACTS).find(x => s.met[x])]) dot(at("t:" + k, t.place), "#8a8f96", "?", ""); });
      if (s.hq) dot(at("hq", Y.HQ.place), "#c9a24a", "本", "Kurogane Kōgyō");
    }
    if (s.empire) Object.keys(Y.VENUES).forEach(k => { const o = s.empire.owned[k]; if (!o && s.choice !== "wipe") return; dot(at("v:" + k, Y.VENUES[k].place), o ? (o.shut ? "#e0453a" : "#c9a24a") : "#5f6b78", o ? "¥" : "売", Y.VENUES[k].name); });
  };

  function ykCss() {
    if (document.getElementById("ykcss")) return;
    const st = document.createElement("style"); st.id = "ykcss";
    st.textContent = `
#ykfight{position:fixed;left:50%;top:86px;transform:translateX(-50%);z-index:40;padding:7px 16px;color:#fff;font:700 15px 'Konto Sans','Segoe UI',system-ui,sans-serif;background:rgba(10,12,16,.82);border-top:3px solid #e0453a;display:none;gap:14px;align-items:center}
#ykfight.on{display:flex}
#ykfight b{font-size:20px;color:#ff8a7a;margin-right:5px}
#ykfight span{display:flex;gap:8px;align-items:center;font-size:13px}
#ykfight i{display:block;width:150px;height:7px;background:rgba(255,255,255,.18)}
#ykfight u{display:block;height:100%;background:#e0453a}
#ykhit{position:fixed;inset:0;z-index:39;pointer-events:none;opacity:0;box-shadow:inset 0 0 140px 30px rgba(190,20,20,.75)}
#ykhit.on{animation:ykhit .5s ease-out}
@keyframes ykhit{0%{opacity:1}100%{opacity:0}}
`;
    document.head.appendChild(st);
  }

  // ---- the frame -----------------------------------------------------------------------------------------------------------------------------
  const frameWas = C.commute && C.commute.frame;
  const tickWas = window.storyTick;
  window.storyTick = function (dt) {
    tickWas.apply(this, arguments);
    try {
      scanT -= dt;
      if (scanT <= 0) { scanT = 0.25; scan(); if (ready() && S().empire) daily(); }
      for (const k in marks) { const m = marks[k]; m.position.y = m.userData.y + Math.sin(clock * 2.2) * 0.08; }
    } catch (e) { console.warn("[Yakuza] tick:", e); }
  };
  // a hint after the first days at SOTI
  C.on("mission:passed", d => { if (d.mission === 3) setTimeout(() => notify("Peek", "Tōkonto after dark", "They say three men in this city answer to the Kurogane-kai: at a mahjong parlour, a shrine fair and the fish market. They are on your map as “?”. They only talk to people who bring the right thing.", 12), 20000); });
  const loadWas = window.storyLoad;
  if (typeof loadWas === "function") window.storyLoad = function () { const r = loadWas.apply(this, arguments); try { Object.keys(spots).forEach(k => delete spots[k]); const s = story.career && story.career.yk; if (s) { Object.keys(Y.CONTACTS).forEach(k => { const c = Y.CONTACTS[k]; if (s.met[k] && s.choice !== "wipe" && !mynet.contacts.some(x => x.handle === "yk:" + k)) mynet.contacts.push({ name: c.full + " · Kurogane-kai", handle: "yk:" + k, phone: "090-9" + (100 + Object.keys(Y.CONTACTS).indexOf(k)) + "-8931", line: "" }); }); if (s.empire) addOffice(); } } catch (e) { console.warn("[Yakuza] load:", e); } return r; };

  // ---- console ---------------------------------------------------------------------------------------------------------------------------
  Y.unlock = function (regard) { const s = S(); Object.keys(Y.TOKENS).forEach(k => { s.items[k] = true; }); Object.keys(Y.CONTACTS).forEach(k => { s.met[k] = true; }); s.hq = true; if (s.rank < 1) s.rank = 1; if (regard) { s.done.sakazuki = s.done.sakazuki || regard >= 22; Y.regard(regard, true); } return Y.status(); };
  Y.status = () => { const s = S(); return { rank: Y.rankName(), regard: s.regard, met: s.met, items: s.items, done: Object.keys(s.done), choice: s.choice, empire: s.empire && { owned: Object.keys(s.empire.owned), crew: s.empire.crew, heat: Math.round(s.empire.heat), bank: s.empire.bank }, near: near, fight: fight.on && { alive: fight.list.filter(p => p.state !== "dead").length, engaged: fight.engaged } }; };
  console.log("[Yakuza] " + Y.version + " · the Kurogane-kai");
})();
