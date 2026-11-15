// After hours: the other half of a salaryman's life. Bars, izakaya, clubs and karaoke boxes under the railway arches, the colleagues who
// phone to drag Seiko out, the boss who expects him at company karaoke, and the jobs that only happen after dark.
//
//   THE PHONE      From the evening of the first day at SOTI, work partners (and Gondō) ring after clock-out: "a few of us are at Torimaru
//                  under Oyamada Station, get down here". Accept and it goes on the map with a time; turn up late or not at all and they
//                  remember. Seiko can ring them too: their numbers are in Contacts (phone, P). Each colleague has a liking for him (0-100).
//   THE VENUES     Every station in Tōkonto has a place in the arches under it ("gādo-shita"): an izakaya, a bar, a club or a karaoke box.
//                  Walk up to the lit entrance and press F. On your own: a drink at the counter, the dance floor, the mic.
//   A NIGHT OUT    Sit with them: order a round, talk (what you say moves their liking, and sometimes honor and respect), and each place
//                  has its own game: janken for the bill at the izakaya, the bartender's special at the bar, the dance floor at the club,
//                  the mic in the karaoke box (karaoke.js). Every round eases stress and makes him tipsier; time passes.
//   AFTER-HOURS    Last Train (walk a very drunk Ishikawa to a station before the last train), The Forgotten Laptop (Nakano left her SOTI
//   MISSIONS       laptop at a bar), The Ōtsuka Renewal (Gondō sends floor-manager Seiko to keep a client happy until he signs).
//   COMPANY        Every few days after The Complaint Line, Akio texts at clock-out: company karaoke tonight. Seiko sings the company
//   KARAOKE        song, "Salary Man". The grade is respect; skipping it is noticed.
//   STANDING       Hangouts ease stress; a big night leaves a hangover (the morning starts stressed). Driving after drinking costs honor.
//                  Walking a drunk colleague to safety earns it; snooping on a colleague costs it. The boss's invitations and the company
//                  night move respect.
//
// Console: afterhours.status(), afterhours.invite("ishikawa"), afterhours.plan("izakaya", ["mori"]), afterhours.karaokeNight(),
//          afterhours.mission("lastTrain"|"laptop"|"client"), afterhours.venues.
// Events (career.on): ah:invite { who, kind, venue, accepted }, ah:hangout { who, kind, venue, like, stress }, ah:karaoke { grade, pct },
//          ah:mission { id, passed }.
(function () {
  "use strict";
  const C = window.career; if (!C || !C.office || !C.commute) { console.warn("[AfterHours] the career is not in this build"); return; }
  const O = C.office;
  const A = window.afterhours = C.after = {};
  A.version = "1.0.0";

  // ---- the people -----------------------------------------------------------------------------------------------------------------------
  const PEOPLE = {
    ishikawa: { name: "Ishikawa Ken", short: "Ishikawa", look: "salaryman_02", phone: "080-2231-5507", role: "partner", likes: ["izakaya", "bar"], drinks: "beer",
      hello: "Oi, Seiko! Over here! I already ordered for you.", bye: "Same time tomorrow? Kidding. …Unless?" },
    mori: { name: "Mori Haruka", short: "Mori", look: "officelady_01", female: true, phone: "080-6612-3088", role: "partner", likes: ["bar", "club"], drinks: "highball",
      hello: "You came. Good. I need someone to complain to who isn't Gondō.", bye: "Don't tell anyone I was nice to you." },
    nakano: { name: "Nakano Yui", short: "Nakano", look: "officelady_03", female: true, phone: "070-4451-2219", role: "partner", likes: ["club", "karaoke"], drinks: "lemon sour",
      hello: "Seiko-san! Yay! Okay, first round's on me, second's on you.", bye: "That was fun! See you on the floor!" },
    fujita: { name: "Fujita Daisuke", short: "Fujita", look: "salaryman_05", phone: "090-7783-6140", role: "partner", likes: ["karaoke", "izakaya"], drinks: "oolong-hai",
      hello: "Ah. Seiko. Hello. I booked us the room with the good microphone.", bye: "Thank you for coming. Really." },
    gondo: { name: "Gondō Tetsuo", short: "Gondō", look: "salaryman_07", phone: "090-4410-1919", role: "boss", likes: ["izakaya", "karaoke"], drinks: "sake",
      hello: "Seiko. Sit. A manager drinks with his people. That is the job too.", bye: "Nineteen years… Go home, Seiko. Don't be late." },
    akio: { name: "Akio Sotiyama", short: "Akio", look: "boss_akio", role: "exec", likes: ["karaoke"], drinks: "whisky" },
    otsuka: { name: "Ōtsuka Masaru", short: "Ōtsuka", look: "salaryman_08", role: "client", likes: ["bar"], drinks: "whisky" }
  };
  const PARTNERS = ["ishikawa", "mori", "nakano", "fujita"];
  A.people = PEOPLE;

  // What they talk about. Each topic: their line, and Seiko's answers (like: their liking, honor/respect: standing, stress).
  const TOPICS = {
    any: [
      { q: "So. What do you actually think of Gondō?", opts: [
        { label: "He's hard on us, but he's been here nineteen years for a reason.", reply: "…Huh. That's very fair of you.", like: 3, honor: 1 },
        { label: "Honestly? He's a dinosaur.", reply: "HA! Don't let him hear you say that.", like: 5, respect: -1 },
        { label: "I'd rather not talk about him behind his back.", reply: "Boring. But okay. Respect.", like: -1, honor: 2 } ] },
      { q: "Where are you from, anyway? You don't sound like Tōkonto.", opts: [
        { label: "Mizuho. A village by the sea. My father fixes boats.", reply: "That sounds… peaceful. Do you miss it?", like: 5, stress: -0.04 },
        { label: "Around. Here and there.", reply: "Mysterious. Fine, keep your secrets.", like: 0 },
        { label: "Somewhere you've never heard of. Next question.", reply: "…Okay then.", like: -3 } ] },
      { q: "Do you ever think about quitting? Just… walking out?", opts: [
        { label: "Every day. Then I think about my father, and I go in.", reply: "Yeah. Everyone's got someone.", like: 4, stress: -0.03 },
        { label: "No. I'm going to run this company one day.", reply: "Hah! Akio-sama had better watch out.", like: 1, respect: 1 },
        { label: "Let's not talk about work. Kanpai!", reply: "Kanpai! Best idea all night.", like: 3, stress: -0.05 } ] },
      { q: "The new targets came out. Two hundred calls an hour. Two hundred!", opts: [
        { label: "We'll manage it together. I'll talk to the floor tomorrow.", reply: "You really mean that, huh. Thanks, Seiko.", like: 6, respect: 1 },
        { label: "Then we just work harder.", reply: "Easy for you to say…", like: -2 },
        { label: "I'll make Gondō explain it himself.", reply: "I'd pay to see that.", like: 4 } ] }
    ],
    ishikawa: [
      { q: "My wife says I drink too much. One more round won't hurt, eh?", opts: [
        { label: "Maybe water this round, Ishikawa-san.", reply: "…Yeah. Yeah, you're right. Sumimasen, a water!", like: 2, honor: 3 },
        { label: "One more! Kanpai!", reply: "THAT'S my floor manager!", like: 6, stress: -0.03 },
        { label: "Your wife's right.", reply: "Oi… don't you start too.", like: -4 } ] },
      { q: "I've been on the phones eleven years. Eleven! They promoted you in a week.", opts: [
        { label: "You deserved it more. I'll put your name forward.", reply: "…You'd do that? Seiko. I won't forget it.", like: 8, honor: 2 },
        { label: "Akio-sama saw something. I don't know what.", reply: "Hmph. Lucky. Good luck, I mean.", like: 1 },
        { label: "Maybe work harder.", reply: "…Wow.", like: -8, respect: -1 } ] }
    ],
    mori: [
      { q: "I'm going to tell you something and you're not going to laugh. I write novels. Bad ones.", opts: [
        { label: "I'd like to read one.", reply: "…Really? Nobody's ever said that. Okay. Maybe.", like: 9 },
        { label: "What are they about?", reply: "A call-centre worker who becomes a samurai. Don't.", like: 4 },
        { label: "(laugh)", reply: "I SAID don't laugh.", like: -6 } ] },
      { q: "Gondō took credit for my report again. In front of Akio-sama.", opts: [
        { label: "I'll make sure Akio-sama knows it was yours.", reply: "You'd go over his head? …That's either brave or stupid.", like: 7, respect: 1 },
        { label: "That's how it works. Keep your head down.", reply: "Of course. Silly me.", like: -4 },
        { label: "Next time, send it to me too. I'll back you up.", reply: "Deal. Kanpai to that.", like: 5, honor: 1 } ] }
    ],
    nakano: [
      { q: "Okay okay, important question: what's your karaoke song?", opts: [
        { label: "The company song. 'Salary Man'. Obviously.", reply: "NO WAY. That's mine too! Duet next time!", like: 7 },
        { label: "I don't sing.", reply: "Everyone sings. You just haven't had enough lemon sours.", like: 1 },
        { label: "Something sad. From the countryside.", reply: "Aww. You're secretly soft, Seiko-san.", like: 4 } ] },
      { q: "My mum keeps sending me photos of men she wants me to marry. Look at this one!", opts: [
        { label: "He looks kind. But only if you want to.", reply: "Right?! Only if I want to. Thank you!", like: 5 },
        { label: "He looks like Gondō.", reply: "PFFT— oh no. Oh no he does.", like: 6 },
        { label: "Your mum has a point.", reply: "…Whose side are you on?!", like: -5 } ] }
    ],
    fujita: [
      { q: "I'm… thinking of asking Takeda-san to dinner. Is that weird? It's weird.", opts: [
        { label: "Not weird at all. Ask her. Tomorrow.", reply: "Tomorrow?! …Okay. Tomorrow. Maybe.", like: 8 },
        { label: "Office romance is complicated.", reply: "Yes. Yes it is. I'll think about it more. For a year.", like: 1 },
        { label: "She's out of your league.", reply: "…I know.", like: -7, honor: -1 } ] },
      { q: "Do you think the work we do matters? People just shout at us all day.", opts: [
        { label: "Every call is someone's bad day getting a little better.", reply: "…I'm writing that down.", like: 7, stress: -0.04 },
        { label: "It pays the rent.", reply: "Yes. True. It does.", like: 1 },
        { label: "Not really, no.", reply: "Oh. Okay.", like: -3 } ] }
    ],
    gondo: [
      { q: "You know why I'm hard on you, Seiko? (pours) Because nobody was ever hard on Akio.", opts: [
        { label: "I understand, Gondō-buchō. Thank you.", reply: "Hmph. Drink. Don't get sentimental.", like: 6, respect: 2 },
        { label: "Akio-sama promoted me. Maybe he sees something you don't.", reply: "…Maybe. Maybe not. Drink.", like: -4, respect: 1 },
        { label: "Is that the sake talking?", reply: "The sake ALWAYS talks. That's why it's honest.", like: 3 } ] },
      { q: "Nineteen years. Do you know what I wanted to be? A baseball umpire.", opts: [
        { label: "You'd have been a great umpire. Nobody argues with you.", reply: "HA! HAHAHA! …Yes. Yes I would.", like: 9 },
        { label: "It's not too late.", reply: "It's far too late. But thank you, Seiko.", like: 5, stress: -0.03 },
        { label: "You'd have been terrible.", reply: "…Get out of my izakaya.", like: -9, respect: -2 } ] }
    ]
  };

  // ---- state (saved with the career) ---------------------------------------------------------------------------------------------------
  function fresh() {
    const like = {}; Object.keys(PEOPLE).forEach(k => { like[k] = k === "gondo" ? 30 : k === "akio" ? 50 : 40; });
    return { v: 1, like: like, met: {}, plan: null, inviteDay: -1, inviteAt: 0, lastKaraoke: 0, tipsy: 0, hangover: false, drank: 0,
      missions: { done: {}, active: null, due: {} }, nights: 0, contacts: false, skippedKaraoke: 0, ddDay: -1 };
  }
  const S = A.state = () => { const c = C.state(); if (!c.after) c.after = fresh(); else if (!c.after.missions) Object.assign(c.after, fresh(), c.after); return c.after; };
  // an unbroken clock in game minutes (gameMinutes() wraps at midnight)
  const now = A.now = () => TIME.startMin + clock * TIME.rate;
  const dayMin = () => gameMinutes();
  const like = (k, d) => { const s = S(); s.like[k] = Math.max(0, Math.min(100, (s.like[k] || 40) + d)); return s.like[k]; };
  A.like = like;

  // ---- the venues under the stations ------------------------------------------------------------------------------------------------------
  const KINDS = {
    izakaya: { label: "izakaya", glyph: "居", col: "#e2462f", names: [["鳥丸", "Torimaru"], ["赤ちょうちん", "Aka-chōchin"], ["のんべえ", "Nonbē"], ["高架下 まる", "Kōkashita Maru"]], round: 1800, mood: "izakaya" },
    bar: { label: "bar", glyph: "B", col: "#d9a441", names: [["終電", "Bar Last Train"], ["銀杏", "Bar Ichō"], ["Arches", "The Arches"]], round: 2600, mood: "night" },
    club: { label: "club", glyph: "♫", col: "#b04dff", names: [["B1", "Konto Underground"], ["高架", "Kōka Club"]], round: 2200, mood: "night" },
    karaoke: { label: "karaoke box", glyph: "♪", col: "#ff3d8b", names: [["マイク館", "Karaoke Maikku-kan"], ["歌の箱", "Uta no Hako"]], round: 1500, mood: "play" }
  };
  const KIND_ORDER = ["izakaya", "bar", "karaoke", "club"];
  A.kinds = KINDS;
  A.venues = [];
  function stationList() { const city = world && world.cities && world.cities[0]; return city && city.stations ? city.stations : []; }
  const stName = st => String(st.name || "").replace(/\s*Station$/i, "");
  function fromLocal(st, lx, lz) { const r = (st.yaw || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [st.centre[0] + lx * c + lz * s, st.centre[1] - lx * s + lz * c]; }
  A.buildVenues = function () {
    const list = stationList(); if (!list.length) return false;
    A.venues.forEach(v => { if (v.g) scene.remove(v.g); });
    A.venues = [];
    const counts = {};
    const seen = {};
    list.forEach((st, i) => {
      if (seen[st.name]) return; seen[st.name] = true;
      const kind = st.forSoti ? "izakaya" : KIND_ORDER[i % KIND_ORDER.length];
      counts[kind] = (counts[kind] || 0);
      const nm = KINDS[kind].names[counts[kind]++ % KINDS[kind].names.length];
      // a stair down beside the station's own entrance (into the arches under an elevated line, or the arcade under a ground-level one):
      // a few steps along the station front either side, keeping the first spot with clear pavement in front of it
      let pick = null;
      const c = st.conc;
      if (c && c.door) {
        const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw), fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        for (const off of [11, -11, 16, -16, 7, -7, 22, -22]) {
          const d = [c.door[0] + rx * off, c.door[1] + rz * off], o = [d[0] + fx * 2.6, d[1] + fz * 2.6], gy = world.surfaceY(o[0], o[1]);
          if (typeof insideBuilding === "function" && insideBuilding(o[0], o[1], 0.5, gy)) continue;
          pick = { door: d, yaw: c.yaw }; break;
        }
      }
      const len = st.size ? st.size[0] : 120, wid = st.size ? st.size[1] : 30;
      for (const f of [0.3, -0.3, 0.16, -0.16, 0.42, -0.42, 0]) {
        if (pick) break;
        for (const side of [1, -1]) {
          const d = fromLocal(st, len * f, side * (wid / 2 + 1.6)), o = fromLocal(st, len * f, side * (wid / 2 + 4.2));
          const gy = world.surfaceY(o[0], o[1]);
          if (typeof insideBuilding === "function" && (insideBuilding(o[0], o[1], 0.5, gy) || insideBuilding((d[0] + o[0]) / 2, (d[1] + o[1]) / 2, 0.3, gy))) continue;
          pick = { door: d, yaw: Math.atan2(o[0] - d[0], o[1] - d[1]) }; break;
        }
      }
      if (!pick) { const d = fromLocal(st, len * 0.3, wid / 2 + 1.6), o = fromLocal(st, len * 0.3, wid / 2 + 4.2); pick = { door: d, yaw: Math.atan2(o[0] - d[0], o[1] - d[1]) }; }
      const v = { i: A.venues.length, kind: kind, jp: nm[0], name: nm[1], station: stName(st), st: st, door: pick.door, yaw: pick.yaw };
      v.shop = { brand: "nightspot", kind: kind, name: v.name, door: v.door, yaw: v.yaw, city: "Tōkonto", built: true, safe: false, venue: v };
      A.venues.push(v);
    });
    return true;
  };
  A.nearest = function (kind, x, z, except) {
    let b = null, bd = 1e12;
    A.venues.forEach(v => { if (kind && v.kind !== kind) return; if (except && v === except) return; const d = Math.hypot(v.door[0] - x, v.door[1] - z); if (d < bd) { bd = d; b = v; } });
    return b;
  };
  A.label = v => v.name + " (" + KINDS[v.kind].label + ", under " + v.station + " Station)";

  // ---- the entrances in the street --------------------------------------------------------------------------------------------------------
  function signCanvas(v, w, h) {
    const k = KINDS[v.kind];
    return O.canvas(w, h, (g) => {
      const bg = v.kind === "izakaya" ? "#2a1610" : v.kind === "bar" ? "#141010" : "#0d0718", ink = v.kind === "izakaya" ? "#fff2dc" : k.col;
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      const SF = window.SignFonts;
      g.textAlign = "center"; g.textBaseline = "middle";
      if (SF) {
        const st = SF.style(v.name + "|" + v.station, { text: v.jp, mood: k.mood });
        try { SF.panel(g, 0, 0, w, h, st, bg, ink); } catch (e) { /* plain board */ }
        SF.text(g, v.jp, w / 2, h * 0.4, st, ink, bg, h * 0.42, w * 0.9);
        const st2 = SF.style(v.name + "|latin", { text: v.name, mood: k.mood });
        SF.text(g, v.name.toUpperCase(), w / 2, h * 0.8, st2, v.kind === "izakaya" ? "#f2b84b" : "#ffffff", bg, h * 0.17, w * 0.9);
      } else {
        g.fillStyle = ink; g.font = "800 " + (h * 0.4) + "px serif"; g.fillText(v.jp, w / 2, h * 0.4);
        g.font = "700 " + (h * 0.16) + "px sans-serif"; g.fillStyle = "#fff"; g.fillText(v.name.toUpperCase(), w / 2, h * 0.8);
      }
    });
  }
  const lanternCanvas = () => O.canvas(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "#8f1a10"); gr.addColorStop(0.5, "#ff5a36"); gr.addColorStop(1, "#8f1a10");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(60,8,4,.5)"; for (let y = 8; y < h; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = "#1b0a06"; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
    g.fillStyle = "#1a0703"; g.font = "900 64px serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("酒", w / 2, h * 0.36); g.fillText("処", w / 2, h * 0.64);
  });
  function buildEntrance(v) {
    if (v.g) return;
    const g = new THREE.Group(), y = world.surfaceY(v.door[0], v.door[1]);
    g.position.set(v.door[0], y, v.door[1]); g.rotation.y = v.yaw; scene.add(g);
    const P = O.paint;
    const brick = O.pbr("ahbrick", 512, PAINT.brick, { rep: [2, 1.4], bump: 3, rough: [0.75, 0.95] });
    const metal = O.pbr("darkmetal", 256, P.darkmetal, { bump: 0.6, rough: [0.35, 0.55], metal: 0.7 });
    const box = (w, h, d, x, yy, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, yy, z); g.add(b); return b; };
    // the arch's brick face, the dark stair going down, the sign over it
    box(4.2, 3.4, 0.4, 0, 1.7, -0.5, brick);
    const stair = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.3), O.screenMat(O.canvas(64, 128, (x, w, h) => { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#2a1a10"); gr.addColorStop(1, "#050302"); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = "rgba(255,190,120,.25)"; for (let i = 0; i < 8; i++) x.fillRect(4, h - i * 14 - 10, w - 8, 3); })));
    stair.position.set(0, 1.15, -0.29); g.add(stair);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.75), O.screenMat(signCanvas(v, 512, 148)));
    sign.position.set(0, 2.75, -0.28); g.add(sign);
    box(0.08, 2.5, 0.08, -0.85, 1.25, -0.25, metal); box(0.08, 2.5, 0.08, 0.85, 1.25, -0.25, metal);
    const light = new THREE.PointLight(new THREE.Color(KINDS[v.kind].col).getHex(), 0.9, 9, 2); light.position.set(0, 2.4, 0.8); g.add(light);
    if (v.kind === "izakaya") {
      const lm = O.screenMat(lanternCanvas());
      [-1.5, 1.5].forEach(x => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.62, 14), lm); l.position.set(x, 2.2, -0.1); g.add(l); });
      // the noren curtain over the stair
      const noren = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.7), O.pbr("noren", 256, (x, w, h) => { x.fillStyle = "#1d2a44"; x.fillRect(0, 0, w, h); x.fillStyle = "#f1ece0"; x.font = "900 110px serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("鳥", w / 2, h / 2); for (let i = 1; i < 4; i++) { x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(i * w / 4 - 2, 0, 4, h); } }, { bump: 2, rough: [0.85, 1], side: THREE.DoubleSide }));
      noren.position.set(0, 1.95, -0.22); g.add(noren);
    } else {
      // a neon strip round the doorway
      const nm = O.screenMat(O.canvas(16, 16, (x, w, h) => { x.fillStyle = KINDS[v.kind].col; x.fillRect(0, 0, w, h); }));
      box(1.7, 0.05, 0.05, 0, 2.36, -0.25, nm); box(0.05, 2.3, 0.05, -0.83, 1.18, -0.24, nm); box(0.05, 2.3, 0.05, 0.83, 1.18, -0.24, nm);
    }
    v.g = g;
  }
  A.buildEntrances = function () { A.venues.forEach(buildEntrance); };

  // ---- painted sets for the rooms (one painting gives colour, normal and roughness: career-office.js pbr) -----------------------------------------
  const noise = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = (Math.random() < 0.5 ? "rgba(255,255,255," : "rgba(0,0,0,") + Math.random() * a + ")"; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } };
  const PAINT = {
    brick: (g, w, h) => { g.fillStyle = "#5a2e22"; g.fillRect(0, 0, w, h); const bw = w / 6, bh = h / 16; for (let r = 0; r < 16; r++) for (let c = -1; c < 7; c++) { const x = c * bw + (r % 2 ? bw / 2 : 0), t = 0.75 + Math.random() * 0.4; g.fillStyle = "rgb(" + (128 * t | 0) + "," + (62 * t | 0) + "," + (44 * t | 0) + ")"; g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4); } noise(g, w, h, 9000, 0.12); },
    darkwood: (g, w, h) => { g.fillStyle = "#3b2416"; g.fillRect(0, 0, w, h); for (let i = 0; i < 120; i++) { const y = Math.random() * h; g.strokeStyle = "rgba(20,10,4," + (0.1 + Math.random() * 0.2) + ")"; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 24) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3); g.stroke(); } noise(g, w, h, 3000, 0.06); },
    hinoki: (g, w, h) => { g.fillStyle = "#c9a477"; g.fillRect(0, 0, w, h); for (let i = 0; i < 100; i++) { const y = Math.random() * h; g.strokeStyle = "rgba(120,80,40," + (0.06 + Math.random() * 0.12) + ")"; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 24) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4); g.stroke(); } noise(g, w, h, 3000, 0.05); },
    leather: (g, w, h) => { g.fillStyle = "#4a1f1c"; g.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) { g.fillStyle = "rgba(0,0,0," + Math.random() * 0.12 + ")"; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 0, 7); g.fill(); } g.strokeStyle = "rgba(0,0,0,.4)"; for (let x = 0; x < w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } },
    velvet: (g, w, h) => { g.fillStyle = "#2a1640"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { g.fillStyle = "rgba(255,255,255," + Math.random() * 0.05 + ")"; g.fillRect(0, y, w, 1); } noise(g, w, h, 4000, 0.08); },
    rubber: (g, w, h) => { g.fillStyle = "#151517"; g.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) { g.fillStyle = "rgba(255,255,255,.05)"; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3, 0, 7); g.fill(); } noise(g, w, h, 6000, 0.08); },
    paperwall: (g, w, h) => { g.fillStyle = "#e8dcc0"; g.fillRect(0, 0, w, h); noise(g, w, h, 8000, 0.05); g.fillStyle = "rgba(90,60,30,.25)"; for (let i = 0; i < 6; i++) g.fillRect(0, i * h / 6, w, 2); },
    stool: (g, w, h) => { g.fillStyle = "#7a1a14"; g.fillRect(0, 0, w, h); noise(g, w, h, 4000, 0.12); },
    mirror: (g, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { const v = 150 + Math.random() * 100 | 0; g.fillStyle = "rgb(" + v + "," + v + "," + (v + 10) + ")"; g.fillRect(i * w / 16 + 1, j * h / 16 + 1, w / 16 - 2, h / 16 - 2); } }
  };
  const menuStrip = (lines) => O.canvas(128, 512, (g, w, h) => { g.fillStyle = "#efe4c8"; g.fillRect(0, 0, w, h); g.fillStyle = "#1b120c"; g.font = "800 46px serif"; g.textAlign = "center"; let y = 56; for (const ch of lines[0]) { g.fillText(ch, w / 2, y); y += 52; } g.fillStyle = "#b8281c"; g.font = "800 30px sans-serif"; g.fillText(lines[1], w / 2, h - 28); });
  const backbar = () => O.canvas(1024, 512, (g, w, h) => {
    g.fillStyle = "#1a1210"; g.fillRect(0, 0, w, h);
    for (let s = 0; s < 3; s++) { const y = 70 + s * 150; g.fillStyle = "rgba(255,190,110,.18)"; g.fillRect(0, y + 118, w, 6); for (let x = 16; x < w - 30; x += 30 + Math.random() * 14) { const bh = 70 + Math.random() * 45, hue = [30, 40, 15, 200, 120, 0][Math.random() * 6 | 0]; const gr = g.createLinearGradient(x, 0, x + 22, 0); gr.addColorStop(0, "hsla(" + hue + ",60%,18%,1)"); gr.addColorStop(0.5, "hsla(" + hue + ",70%,45%,1)"); gr.addColorStop(1, "hsla(" + hue + ",60%,18%,1)"); g.fillStyle = gr; g.fillRect(x, y + 118 - bh, 22, bh); g.fillRect(x + 7, y + 118 - bh - 22, 8, 24); g.fillStyle = "#e9dcc4"; g.fillRect(x + 3, y + 118 - bh * 0.55, 16, 18); } }
  });
  // the karaoke screen and the club floor are live canvases, redrawn by the room
  function liveCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return { c: c, g: c.getContext("2d"), t: t, mat: new THREE.MeshBasicMaterial({ map: t, toneMapped: false }) }; }

  // ---- inside: one room per kind of place ---------------------------------------------------------------------------------------------------
  A.buildRoom = function (kind) {
    const box7 = kind === "karaoke";
    const Wr = box7 ? 7 : 11, Dr = box7 ? 8 : 13, Hr = box7 ? 2.6 : 3.4, slot = interior.count++, ox = -3000 - slot * 60, oz = -3000, fy = interior.floorY;
    const root = new THREE.Group(); root.position.set(ox, fy, oz); root.visible = false; scene.add(root);
    if (typeof propLight === "function") propLight(root);
    const cols = [], spots = [];
    const room = { brand: "nightspot", key: "after:" + kind, kind: kind, group: root, ox: ox, oz: oz, W: Wr, D: Dr, H: Hr, doorW: 1.2, colliders: cols, items: [], stock: [], units: [], spots: spots, noExit: false,
      entry: new THREE.Vector3(ox, fy, oz + Dr / 2 - 1.0), seats: [], lights: [] };
    const solid = (x, z, w, d) => cols.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.receiveShadow = true; root.add(b); return b; };
    const P = O.paint, pbr = O.pbr;
    const brick = pbr("ahbrick", 512, PAINT.brick, { rep: [Wr / 2.5, Hr / 2.5], bump: 3, rough: [0.75, 0.95] });
    const dark = pbr("ahdarkwood", 512, PAINT.darkwood, { rep: [2, 1], bump: 1.5, rough: [0.35, 0.6] });
    const hinoki = pbr("ahhinoki", 512, PAINT.hinoki, { rep: [3, 1], bump: 1.2, rough: [0.45, 0.65] });
    const metal = pbr("darkmetal", 256, P.darkmetal, { bump: 0.6, rough: [0.35, 0.55], metal: 0.7 });
    const stoolTop = pbr("ahstool", 256, PAINT.stool, { bump: 2, rough: [0.4, 0.6] });
    const floorMat = (typeof inPhotoMat === "function" && inPhotoMat(kind === "izakaya" ? "concrete" : kind === "bar" ? "parquet" : "slate", 0.7, [Wr / 2.5, Dr / 2.5], kind === "club" ? 0x555566 : 0xffffff, 0.8)) || pbr("concrete", 256, P.concrete, { rep: [3, 3], bump: 2, rough: [0.7, 0.9] });
    // shell: the floor, the end walls, and (under the tracks) a brick barrel vault for a ceiling
    box(Wr, 0.1, Dr, 0, -0.05, 0, floorMat);
    box(Wr, Hr, 0.2, 0, Hr / 2, -Dr / 2, kind === "karaoke" ? pbr("ahvelvet", 256, PAINT.velvet, { rep: [3, 1], bump: 2, rough: [0.8, 1] }) : brick);
    box((Wr - 1.2) / 2, Hr, 0.2, -(0.6 + (Wr - 1.2) / 4), Hr / 2, Dr / 2, brick); box((Wr - 1.2) / 2, Hr, 0.2, 0.6 + (Wr - 1.2) / 4, Hr / 2, Dr / 2, brick);
    box(1.2, Hr - 2.1, 0.2, 0, 2.1 + (Hr - 2.1) / 2, Dr / 2, brick);
    if (box7) {
      const vel = pbr("ahvelvet", 256, PAINT.velvet, { rep: [3, 1], bump: 2, rough: [0.8, 1] });
      box(0.2, Hr, Dr, -Wr / 2, Hr / 2, 0, vel); box(0.2, Hr, Dr, Wr / 2, Hr / 2, 0, vel);
      box(Wr, 0.08, Dr, 0, Hr, 0, pbr("ceiling", 256, P.ceiling, { rep: [3, 3], bump: 1, rough: [0.8, 0.95] }));
    } else {
      box(0.2, Hr * 0.55, Dr, -Wr / 2, Hr * 0.275, 0, brick); box(0.2, Hr * 0.55, Dr, Wr / 2, Hr * 0.275, 0, brick);
      const vault = new THREE.Mesh(new THREE.CylinderGeometry(Wr / 2, Wr / 2, Dr, 24, 1, true, Math.PI / 2, Math.PI), pbr("ahbrick:v", 512, PAINT.brick, { rep: [6, 4], bump: 3, rough: [0.75, 0.95], side: THREE.BackSide }));
      vault.rotation.x = Math.PI / 2; vault.rotation.y = 0; vault.scale.set(1, 1, 0.42); vault.position.set(0, Hr * 0.55, 0); root.add(vault);
      // the trains overhead, felt: the vault's lights shiver now and then
      room.rumble = 6 + Math.random() * 10;
    }
    const lamp = (x, y, z, col, i, d) => { const l = new THREE.PointLight(col, i, d || 7, 2); l.position.set(x, y, z); root.add(l); room.lights.push(l); return l; };
    const stool = (x, z) => { box(0.38, 0.06, 0.38, x, 0.72, z, stoolTop); box(0.05, 0.7, 0.05, x, 0.35, z, metal); };
    // the spots: E on them
    const seatsAt = (list) => list.forEach(s => room.seats.push(s));
    if (kind === "izakaya") {
      // the counter with the master behind it, the grill, the menu strips, tables with stools, lanterns
      box(6.5, 1.0, 0.7, 0, 0.5, -Dr / 2 + 2.0, hinoki); box(6.7, 0.06, 0.9, 0, 1.03, -Dr / 2 + 2.0, dark); solid(0, -Dr / 2 + 2.0, 6.7, 0.9);
      for (let x = -2.6; x <= 2.7; x += 0.9) stool(x, -Dr / 2 + 2.75);
      const strips = [["生ビール", "¥480"], ["焼鳥", "¥180"], ["枝豆", "¥320"], ["唐揚げ", "¥580"], ["日本酒", "¥650"], ["ハイボール", "¥450"], ["冷奴", "¥300"], ["おでん", "¥520"]];
      strips.forEach((s, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 1.25), O.screenMat(menuStrip(s))); m.position.set(-3.2 + i * 0.9, 2.3, -Dr / 2 + 0.12); root.add(m); });
      const lm = O.screenMat(lanternCanvas());
      for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 14), lm); l.position.set(-3.6 + i * 2.4, 2.75, 0.5); root.add(l); lamp(-3.6 + i * 2.4, 2.4, 0.5, 0xff7a40, 0.55, 6); }
      [[-2.6, 1.6], [2.6, 1.6], [-2.6, 4.2]].forEach(t => { box(1.2, 0.05, 0.8, t[0], 0.72, t[1], hinoki); box(0.08, 0.7, 0.08, t[0], 0.35, t[1], metal); solid(t[0], t[1], 1.2, 0.8); stool(t[0] - 0.85, t[1]); stool(t[0] + 0.85, t[1]); stool(t[0], t[1] - 0.7); stool(t[0], t[1] + 0.7); });
      // the table they take: the one on the left, Seiko on its near side
      room.table = { x: -2.6, z: 1.6 };
      seatsAt([{ x: -3.45, z: 1.6, yaw: Math.PI / 2 }, { x: -1.75, z: 1.6, yaw: -Math.PI / 2 }, { x: -2.6, z: 0.9, yaw: 0 }, { x: -3.45, z: 2.3, yaw: Math.PI / 2 }, { x: -1.75, z: 2.3, yaw: -Math.PI / 2 }]);
      room.mine = { x: -2.6, z: 2.3, yaw: Math.PI };
      room.staff = { x: 0, z: -Dr / 2 + 1.2, yaw: 0, look: "salaryman_06" };
      lamp(0, 2.6, -Dr / 2 + 2, 0xffc890, 0.7, 7);
      spots.push({ x: 0, z: -Dr / 2 + 3.0, label: "the counter: a drink", act: "after:counter" });
      spots.push({ x: -2.6, z: 3.0, label: "the table", act: "after:table" });
    } else if (kind === "bar") {
      box(7.5, 1.1, 0.6, 0.5, 0.55, -Dr / 2 + 2.2, dark); box(7.7, 0.06, 0.8, 0.5, 1.13, -Dr / 2 + 2.2, pbr("ahleather", 256, PAINT.leather, { bump: 2, rough: [0.3, 0.5] })); solid(0.5, -Dr / 2 + 2.2, 7.7, 0.8);
      const bb = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.2), O.screenMat(backbar())); bb.position.set(0.5, 2.0, -Dr / 2 + 0.15); root.add(bb);
      for (let x = -2.8; x <= 3.8; x += 0.95) { box(0.36, 0.06, 0.36, x, 0.8, -Dr / 2 + 3.0, pbr("ahleather", 256, PAINT.leather, { bump: 2, rough: [0.3, 0.5] })); box(0.05, 0.78, 0.05, x, 0.39, -Dr / 2 + 3.0, metal); }
      for (let i = 0; i < 4; i++) lamp(-2.5 + i * 2.2, 2.3, -Dr / 2 + 2.3, 0xffb060, 0.5, 5);
      // the booth at the back on the left
      const lea = pbr("ahleather", 256, PAINT.leather, { bump: 2, rough: [0.3, 0.5] });
      box(0.6, 0.45, 2.8, -Wr / 2 + 0.6, 0.23, 2.5, lea); box(0.2, 0.9, 2.8, -Wr / 2 + 0.25, 0.7, 2.5, lea); solid(-Wr / 2 + 0.6, 2.5, 0.8, 2.8);
      box(1.0, 0.05, 1.6, -Wr / 2 + 1.6, 0.72, 2.5, dark); box(0.08, 0.7, 0.08, -Wr / 2 + 1.6, 0.35, 2.5, metal); solid(-Wr / 2 + 1.6, 2.5, 1.0, 1.6);
      room.table = { x: -Wr / 2 + 1.6, z: 2.5 };
      seatsAt([{ x: -Wr / 2 + 0.7, z: 2.0, yaw: Math.PI / 2 }, { x: -Wr / 2 + 0.7, z: 3.0, yaw: Math.PI / 2 }, { x: -Wr / 2 + 1.6, z: 1.45, yaw: 0 }, { x: -Wr / 2 + 2.5, z: 2.0, yaw: -Math.PI / 2 }]);
      room.mine = { x: -Wr / 2 + 2.5, z: 3.0, yaw: -Math.PI / 2 };
      room.staff = { x: 0.5, z: -Dr / 2 + 1.3, yaw: 0, look: "salaryman_09" };
      lamp(-Wr / 2 + 1.6, 2.0, 2.5, 0xffa040, 0.6, 5);
      spots.push({ x: 0.5, z: -Dr / 2 + 3.3, label: "the bar: a drink", act: "after:counter" });
      spots.push({ x: -Wr / 2 + 2.9, z: 2.5, label: "the booth", act: "after:table" });
    } else if (kind === "club") {
      // the LED floor, the DJ, the bar on the side, the lights that sweep
      const led = liveCanvas(256, 256); room.led = led;
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), led.mat); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.01, 0); root.add(fl);
      box(3.0, 1.1, 0.9, 0, 0.55, -Dr / 2 + 1.0, metal); solid(0, -Dr / 2 + 1.0, 3.0, 0.9);
      const djs = liveCanvas(256, 64); room.djs = djs; const dj = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), djs.mat); dj.position.set(0, 1.6, -Dr / 2 + 0.2); root.add(dj);
      box(0.6, 1.1, 5, Wr / 2 - 0.6, 0.55, 2.5, dark); solid(Wr / 2 - 0.6, 2.5, 0.8, 5);
      room.movers = [lamp(-2, 2.8, 0, 0xff2a8a, 1.2, 9), lamp(2, 2.8, 0, 0x2a8aff, 1.2, 9), lamp(0, 2.8, 2, 0x8a2aff, 1.0, 9)];
      room.table = { x: Wr / 2 - 1.4, z: 2.5 };
      seatsAt([{ x: Wr / 2 - 1.4, z: 1.6, yaw: -Math.PI / 2, stand: true }, { x: Wr / 2 - 1.4, z: 3.4, yaw: -Math.PI / 2, stand: true }, { x: 1.2, z: 0.6, yaw: Math.PI, stand: true }, { x: -1.1, z: -0.4, yaw: 0.6, stand: true }]);
      room.mine = { x: Wr / 2 - 2.2, z: 2.5, yaw: Math.PI / 2, stand: true };
      room.staff = { x: 0, z: -Dr / 2 + 0.5, yaw: 0, look: "salaryman_01" };
      spots.push({ x: 0, z: 1.2, label: "the dance floor", act: "after:dance" });
      spots.push({ x: Wr / 2 - 1.6, z: 2.5, label: "the bar: a drink", act: "after:counter" });
    } else {
      // a private karaoke room: the U of sofas, the low table, the screen, the mirror ball
      const vel = pbr("ahvelvet", 256, PAINT.velvet, { rep: [2, 1], bump: 2, rough: [0.8, 1] });
      box(5.6, 0.45, 0.7, 0, 0.23, -Dr / 2 + 2.6, vel); box(5.6, 0.7, 0.2, 0, 0.6, -Dr / 2 + 2.2, vel);
      box(0.7, 0.45, 3.0, -Wr / 2 + 0.75, 0.23, 0.6, vel); box(0.7, 0.45, 3.0, Wr / 2 - 0.75, 0.23, 0.6, vel);
      solid(0, -Dr / 2 + 2.5, 5.6, 0.9); solid(-Wr / 2 + 0.75, 0.6, 0.8, 3.0); solid(Wr / 2 - 0.75, 0.6, 0.8, 3.0);
      box(2.6, 0.06, 1.2, 0, 0.45, 0.2, pbr("ahhinoki:k", 512, PAINT.darkwood, { bump: 1.2, rough: [0.15, 0.3] })); box(2.4, 0.4, 1.0, 0, 0.21, 0.2, metal); solid(0, 0.2, 2.6, 1.2);
      const scr = liveCanvas(512, 288); room.screen = scr;
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), scr.mat); sm.position.set(0, 1.55, Dr / 2 - 0.22); sm.rotation.y = Math.PI; root.add(sm);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), pbr("ahmirror", 256, PAINT.mirror, { bump: 1, rough: [0.05, 0.2], metal: 0.95 })); ball.position.set(0, Hr - 0.4, 0.2); root.add(ball); room.ball = ball;
      room.movers = [lamp(-1.5, 2.2, 0.2, 0xff3d8b, 0.7, 7), lamp(1.5, 2.2, 0.2, 0x3db8ff, 0.7, 7)];
      lamp(0, 2.3, -2.0, 0xffe0c0, 0.4, 6);
      room.table = { x: 0, z: 0.2 };
      seatsAt([{ x: -1.6, z: -Dr / 2 + 2.6, yaw: 0 }, { x: 1.6, z: -Dr / 2 + 2.6, yaw: 0 }, { x: -Wr / 2 + 0.75, z: 0.2, yaw: Math.PI / 2 }, { x: Wr / 2 - 0.75, z: 0.2, yaw: -Math.PI / 2 }, { x: -0.5, z: -Dr / 2 + 2.6, yaw: 0 }, { x: Wr / 2 - 0.75, z: 1.3, yaw: -Math.PI / 2 }]);
      room.mine = { x: 0.6, z: -Dr / 2 + 2.6, yaw: 0 };
      room.stage = { x: 0, z: 2.6, yaw: Math.PI };
      spots.push({ x: 0, z: 1.9, label: "the mic", act: "after:sing" });
      spots.push({ x: 0, z: -Dr / 2 + 3.3, label: "the sofa", act: "after:table" });
    }
    if (typeof propPut === "function" && kind !== "karaoke") { propPut(root, "potted_plant_02", Wr / 2 - 0.6, 0, Dr / 2 - 0.8, 0, { h: 1.1 }); propPut(root, "wall_clock", -Wr / 2 + 0.2, 2.1, -2, Math.PI / 2, { w: 0.4 }); }
    room.tick = dt => roomTick(room, dt);
    return room;
  };
  function roomTick(R, dt) {
    const t = clock;
    if (R.rumble !== undefined) { R.rumble -= dt; if (R.rumble < 0) { R.rumble = 8 + Math.random() * 14; R.shake = 1.2; } if (R.shake > 0) { R.shake -= dt; R.lights.forEach((l, i) => { l.userData.i0 = l.userData.i0 || l.intensity; l.intensity = l.userData.i0 * (0.8 + Math.random() * 0.25); }); if (R.shake <= 0) R.lights.forEach(l => { if (l.userData.i0) l.intensity = l.userData.i0; }); } }
    if (R.movers) R.movers.forEach((l, i) => { l.position.x = Math.sin(t * (0.7 + i * 0.3) + i * 2) * (R.kind === "club" ? 2.6 : 1.6); l.position.z = (R.kind === "club" ? 0 : 0.2) + Math.cos(t * (0.5 + i * 0.2) + i) * (R.kind === "club" ? 2.6 : 1.2); });
    if (R.ball) R.ball.rotation.y += dt * 0.6;
    const k = window.karaoke && karaoke.state;
    if (R.led) {
      R.ledT = (R.ledT || 0) + dt; if (R.ledT > 0.12) { R.ledT = 0; const g = R.led.g, n = 8, s = 256 / n, beat = Math.floor(t * 2.07); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const h = ((i + j + beat) * 37) % 360, on = ((i * 3 + j * 5 + beat) % 4) === 0; g.fillStyle = on ? "hsl(" + h + ",95%,60%)" : "hsl(" + h + ",60%,10%)"; g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); } R.led.t.needsUpdate = true; }
    }
    if (R.djs) { R.djT = (R.djT || 0) + dt; if (R.djT > 0.08) { R.djT = 0; const g = R.djs.g; g.fillStyle = "#05030a"; g.fillRect(0, 0, 256, 64); for (let i = 0; i < 32; i++) { const v = Math.abs(Math.sin(t * 6 + i * 0.6)) * (0.4 + Math.random() * 0.6); g.fillStyle = "hsl(" + (280 + i * 3) + ",90%,60%)"; g.fillRect(i * 8 + 1, 64 - v * 60, 6, v * 60); } R.djs.t.needsUpdate = true; } }
    if (R.screen) {
      R.scT = (R.scT || 0) + dt; if (R.scT > 0.1) { R.scT = 0; const g = R.screen.g, w = 512, h = 288;
        const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "hsl(" + ((t * 20) % 360) + ",60%,22%)"); gr.addColorStop(1, "hsl(" + ((t * 20 + 120) % 360) + ",60%,12%)"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.textAlign = "center"; g.textBaseline = "middle";
        const singing = k && k.on && !k.loading, who = R.singer || (singing ? "Seiko" : null);
        g.fillStyle = "#fff"; g.font = "800 34px sans-serif"; g.fillText(singing ? "♪ " + k.title + " ♪" : (who ? "♪ " + who + " ♪" : "マイク館 · PICK A SONG"), w / 2, h * 0.32);
        g.font = "600 22px sans-serif"; g.fillStyle = "#ffd75e";
        g.fillText(singing ? Math.round(k.score) + " pts · " + (k.combo > 1 ? k.combo + " combo" : "") : (R.singerLine || "001  Salary Man  ·  dvheight"), w / 2, h * 0.6);
        g.fillStyle = "rgba(255,255,255,.3)"; for (let i = 0; i < 40; i++) g.fillRect((i * 13 + t * 60) % w, h - 30 - Math.abs(Math.sin(t * 5 + i)) * 26, 8, Math.abs(Math.sin(t * 5 + i)) * 26);
        R.screen.t.needsUpdate = true; }
    }
  }
  if (typeof INTERIOR_BRANDS !== "undefined" && INTERIOR_BRANDS.indexOf("nightspot") < 0) INTERIOR_BRANDS.push("nightspot");
  const was = {};
  const wrap = (name, make) => { if (typeof window[name] !== "function") { console.warn("[AfterHours] missing " + name); return; } was[name] = window[name]; window[name] = make(was[name]); };
  wrap("interiorRoom", orig => function (s) {
    if (s && s.brand === "nightspot") { const key = "after:" + s.kind; return interior.rooms[key] || (interior.rooms[key] = A.buildRoom(s.kind)); }
    return orig.apply(this, arguments);
  });

  // ---- poses for a night out ------------------------------------------------------------------------------------------------------------------
  if (typeof storyPeoplePoses === "function") {
    const orig = window.storyPeoplePoses;
    window.storyPeoplePoses = function (make) {
      orig.apply(this, arguments);
      const legs = { ThighR: [1.52, 0, 0.06], ThighL: [1.52, 0, -0.06], ShinR: [-1.5, 0, 0], ShinL: [-1.5, 0, 0], Spine: [0.1, 0, 0], Chest: [0.06, 0, 0] };
      make("drinksit", Object.assign({}, legs, { UpperArmR: [0.45, 0, 0.35], ForearmR: [0, 0, 2.35], UpperArmL: [0.6, 0, -0.3], ForearmL: [0, 0, -1.2], Neck: [-0.18, 0, 0] }), 0.44);
      make("laughsit", Object.assign({}, legs, { UpperArmR: [0.7, 0, 0.3], ForearmR: [0, 0, 1.1], UpperArmL: [0.7, 0, -0.3], ForearmL: [0, 0, -1.1], Spine: [-0.12, 0, 0], Neck: [-0.3, 0, 0] }), 0.44);
      make("cheer", { UpperArmR: [0, 0, 2.7], ForearmR: [0, 0, 0.35], UpperArmL: [0, 0, -2.7], ForearmL: [0, 0, -0.35], Neck: [-0.2, 0, 0] });
      make("mic", { UpperArmR: [0.5, 0, 0.42], ForearmR: [0, 0, 2.3], UpperArmL: [0, 0, -0.9], ForearmL: [0, 0, -0.3], Neck: [-0.1, 0, 0] });
      make("drunk", { Spine: [0.25, 0, 0.12], Chest: [0.12, 0, 0.08], Neck: [0.35, 0, 0.2], UpperArmR: [0, 0, 0.25], UpperArmL: [0, 0, -0.25] });
    };
  }
  const pose = (name, alt) => {
    const any = actors.list.find(a => a.acts && a.acts[name]) || (pplLib.ready[0] && pplLib.ready[0].clips && pplLib.ready[0].clips[name]);
    return any ? name : (alt || "idle");
  };

  // ---- people in the room ---------------------------------------------------------------------------------------------------------------------
  const RL = (R, x, y, z) => [R.ox + x, interior.floorY + y, R.oz + z];
  function seat(R, key, s, i) {
    const p = PEOPLE[key] || { look: "salaryman_03" };
    const sitting = !s.stand;
    const a = actorAdd({ x: R.ox + s.x, y: interior.floorY, z: R.oz + s.z, yaw: s.yaw, female: !!p.female, business: true, pick: 11 + i * 3, tag: "after", pose: sitting ? pose("sit") : "idle", look: [p.look], h: key === "gondo" ? 1.02 : 1 });
    a.who = key; a.sitting = sitting; a.home = s;
    return a;
  }
  function seatMe(R) {
    const m = R.mine; if (!m) return;
    player.pos.set(R.ox + m.x, interior.floorY, R.oz + m.z); player.yaw = player.targetYaw = m.yaw;
    if (player.obj) { player.obj.position.copy(player.pos); player.obj.rotation.y = m.yaw; player.obj.visible = true; }
    player.forceClip = m.stand ? null : "sit";
  }
  function twoShot(R) {
    // over Seiko's shoulder at the table, framed on the people he is with (or the table if he is alone)
    const m = R.mine, n = A.night || A.company, ppl = n && n.people && n.people.length ? n.people : null;
    let tx, tz, ty = interior.floorY + 1.05;
    if (ppl) { tx = 0; tz = 0; ppl.forEach(a => { tx += a.x; tz += a.z; }); tx /= ppl.length; tz /= ppl.length; if (ppl[0].sitting === false) ty += 0.4; }
    else { const t = R.table || { x: 0, z: 0 }; tx = R.ox + t.x; tz = R.oz + t.z; }
    const mx = R.ox + m.x, mz = R.oz + m.z, dx = tx - mx, dz = tz - mz, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    return { pos: [mx - ux * 0.95 + uz * 0.42, interior.floorY + 1.42, mz - uz * 0.95 - ux * 0.42], look: [tx, ty, tz] };
  }
  // a held shot stays on screen between the menus of a night out (the game's own camera would swing back to the third-person view)
  function holdCamera(sh) { A.camHold = sh; aim(sh); }
  function aim(sh) { camera.position.fromArray(sh.pos); camPos.copy(camera.position); camera.lookAt(_ahL.fromArray(sh.look)); }
  const _ahL = new THREE.Vector3();
  wrap("present", orig => function () {
    if (A.camHold && !cut.active) { if (!interior.active && !karaoke.on) A.camHold = null; else aim(A.camHold); }
    return orig.apply(this, arguments);
  });
  function addStaff(R) { if (!R.staff) return null; const s = R.staff; return actorAdd({ x: R.ox + s.x, y: interior.floorY, z: R.oz + s.z, yaw: s.yaw, female: false, business: false, pick: 4, tag: "after", pose: "idle", look: [s.look] }); }

  // ---- tipsy ---------------------------------------------------------------------------------------------------------------------------------
  function drink(n, label) {
    const s = S();
    s.tipsy = Math.min(1, s.tipsy + 0.16 * (n || 1)); s.drank += n || 1;
    const st = vitals.stress || 0;
    if (typeof stressSetRaw === "function") stressSetRaw(Math.max(0, st - 0.07 * (n || 1))); else vitals.stress = Math.max(0, st - 0.07);
    return s.tipsy;
  }
  function tipsyLook() {
    const s = story.career && story.career.after; const t = s ? s.tipsy : 0, el = renderer && renderer.domElement; if (!el) return;
    const want = t > 0.32 ? "blur(" + (Math.min(1.6, (t - 0.32) * 3)).toFixed(2) + "px) saturate(" + (1 + t * 0.3).toFixed(2) + ")" : "";
    if (el.style.filter !== want) el.style.filter = want;
    document.body.classList.toggle("ahtipsy", t > 0.55);
  }

  // ---- a plan: someone to meet, somewhere, by a time ---------------------------------------------------------------------------------------
  A.plan = function (kind, who, opts) {
    opts = opts || {};
    const s = S();
    if (!A.venues.length) A.buildVenues();
    const near = opts.venue || A.nearest(kind, player.pos.x, player.pos.z); if (!near) return null;
    s.plan = { who: who, kind: near.kind, vi: near.i, by: Math.round(now() + (opts.within || 55)), src: opts.src || "call", mission: opts.mission || null, made: Math.round(now()) };
    blipPlan();
    const names = who.map(k => PEOPLE[k].short).join(", ");
    storyObjective(opts.objective || "Meet " + names + " at " + near.name + " by " + hhmm(s.plan.by % 1440), opts.hint || near.name + " is in the arches under " + near.station + " Station. Walk up to the lit entrance and press F.");
    saveGame(null, true);
    return s.plan;
  };
  function planVenue() { const p = S().plan; return p ? A.venues[p.vi] : null; }
  function blipPlan() {
    const v = planVenue(); if (!v) return;
    if (A.blip && story.blips.indexOf(A.blip) >= 0) return;
    A.blip = storyBlip(v.door[0], v.door[1], v.name + " · " + KINDS[v.kind].label, { col: KINDS[v.kind].col });
  }
  function clearPlanBlip() { if (A.blip) { const i = story.blips.indexOf(A.blip); if (i >= 0) { if (A.blip.beam) scene.remove(A.blip.beam); story.blips.splice(i, 1); } if (nav.waypoint && Math.abs(nav.waypoint.x - A.blip.x) < 0.1) { nav.waypoint = null; nav.route = null; } A.blip = null; } }
  function backToDay() { storyClearObjective(); if (C.active() && (story.step === "c:home" || story.step === "c:clockout")) C.goHome(); }
  function planDone() { S().plan = null; clearPlanBlip(); }

  // ---- the phone: their numbers in Contacts, their calls, Seiko's calls ---------------------------------------------------------------------
  function unlocked() { return story.m >= 3 || (story.career && story.career.day > 1); }
  function contacts() {
    if (typeof mynet !== "object" || !mynet.contacts) return;
    const want = PARTNERS.concat(story.m >= 3 ? ["gondo"] : []);
    want.forEach(k => {
      const p = PEOPLE[k]; if (!p.phone) return;
      if (!mynet.contacts.some(c => c.handle === "soti:" + k)) mynet.contacts.push({ name: p.name + " · SOTI", handle: "soti:" + k, phone: p.phone, line: "", soti: k });
    });
    const s = S();
    if (!s.contacts) { s.contacts = true; setTimeout(() => notify("Contacts", "SOTI 3F", "Your colleagues' numbers are in Contacts now. After work, give them a ring.", 8), 1200); }
  }
  wrap("mynetCall", orig => function (c) {
    if (c && typeof c.handle === "string" && c.handle.indexOf("soti:") === 0) { if (phone.open) setPhone(false); A.call(c.handle.slice(5)); return; }
    return orig.apply(this, arguments);
  });
  wrap("phoneDial", orig => function (num) {
    const d = String(num).replace(/\D/g, "");
    const k = Object.keys(PEOPLE).find(k => PEOPLE[k].phone && PEOPLE[k].phone.replace(/\D/g, "") === d);
    if (k && player.placed) { if (phone.open) setPhone(false); A.call(k); return; }
    return orig.apply(this, arguments);
  });
  function ring(n, then) {
    let i = 0;
    const one = () => { try { playBlip(1320, 0.12, 0.05); setTimeout(() => playBlip(1100, 0.12, 0.05), 160); } catch (e) { /* quiet */ } if (++i < n) setTimeout(one, 900); else if (then) setTimeout(then, 500); };
    one();
  }
  const VENUE_ASK = { izakaya: "Drinks at an izakaya?", bar: "A quiet drink at a bar?", club: "Out to a club?", karaoke: "Karaoke?" };
  const workHours = () => { const m = dayMin(); return m > 8 * 60 + 30 && m < 18 * 60 && C.active() && (story.step === "c:floor" || story.step === "c:desk" || story.step === "c:toWork"); };
  A.call = function (key) {
    const p = PEOPLE[key], s = S(); if (!p) return;
    if (C.menuState.on || cut.active) return;
    const head = "📞 " + p.name;
    if (s.plan) { C.menu({ head: head, tag: "Calling", body: "“You're already meeting " + s.plan.who.map(k => PEOPLE[k].short).join(" and ") + ", aren't you? Have fun!”", opts: [{ label: "Hang up", fn: () => {} }], cancel: () => {} }); return; }
    const m = dayMin();
    if (workHours()) { C.menu({ head: head, tag: "Calling", body: "“Seiko, I'm literally three desks away from you. Call me after six.”", opts: [{ label: "Hang up", fn: () => {} }], cancel: () => {} }); return; }
    if (m > 1 * 60 + 30 && m < 16 * 60) { C.menu({ head: head, tag: "Voicemail", body: "(It rings out. " + p.short + " is asleep, or pretending to be.)", opts: [{ label: "Hang up", fn: () => {} }], cancel: () => {} }); return; }
    if (s.met[key] === C.state().day) { C.menu({ head: head, tag: "Calling", body: "“Again? We JUST saw each other. Go home, Seiko!”", opts: [{ label: "Hang up", fn: () => {} }], cancel: () => {} }); return; }
    const kinds = p.likes.concat(Object.keys(KINDS).filter(k => p.likes.indexOf(k) < 0));
    C.menu({ head: head, tag: "Calling", body: "“Moshi moshi, Seiko? What's up?”", cancel: () => {},
      opts: kinds.map(k => ({ label: VENUE_ASK[k], note: p.likes.indexOf(k) >= 0 ? "their kind of place" : "", fn: () => answer(key, k) })).concat([{ label: "Never mind. Just checking in.", fn: () => { like(key, 1); say(p.short + ": “…Okay? Weird. Good night, Seiko.”", 3.5); } }]) });
  };
  function answer(key, kind) {
    const p = PEOPLE[key], L = S().like[key] || 40, late = dayMin() > 23 * 60 + 30 || dayMin() < 2 * 60;
    let chance = 0.35 + L / 160 + (p.likes.indexOf(kind) >= 0 ? 0.2 : -0.1) - (late ? 0.3 : 0) - (key === "gondo" ? 0.15 : 0);
    const yes = Math.random() < chance;
    C.emit("ah:invite", { who: key, kind: kind, by: "seiko", accepted: yes });
    if (!yes) {
      const no = late ? "“It's late, Seiko. Some of us have a floor manager who yells at us if we're late.”" : key === "gondo" ? "“Drinking with a junior on a weeknight? …Not tonight.”" : ["“Ahh, I can't tonight, sorry! Next time!”", "“I'm already in my pyjamas. Next time, promise.”", "“Not tonight… my cat is judging me.”"][Math.random() * 3 | 0];
      C.menu({ head: "📞 " + p.name, tag: "Calling", body: no, opts: [{ label: "Hang up", fn: () => {} }], cancel: () => {} });
      return;
    }
    const v = A.nearest(kind, player.pos.x, player.pos.z);
    C.menu({ head: "📞 " + p.name, tag: "Calling", body: "“" + (kind === "karaoke" ? "Karaoke?! YES." : "Yeah, why not!") + " " + v.name + ", under " + v.station + " Station. Give me forty minutes.”", opts: [{ label: "See you there", fn: () => A.plan(kind, [key], { venue: v, src: "seiko" }) }], cancel: () => A.plan(kind, [key], { venue: v, src: "seiko" }) });
  }
  const INVITE = {
    ishikawa: v => "“Seiko! A few of us are at " + v.name + " under " + v.station + " Station. Get down here! First round's yours, floor manager.”",
    mori: v => "“If I have to hear one more complaint call I'll scream. " + v.name + ", under " + v.station + ". You're coming.”",
    nakano: v => "“Seiko-saaan! " + v.name + " under " + v.station + " Station! It's going to be so fun! Come come come!”",
    fujita: v => "“Ah, Seiko, sorry to call. I'm going to " + v.name + " under " + v.station + " Station. If you're free. No pressure. Some pressure.”",
    gondo: v => "“Seiko. " + v.name + ", under " + v.station + " Station. A manager drinks with his managers. Be there.”"
  };
  A.invite = function (key, kindOpt) {
    const p = PEOPLE[key], s = S(); if (!p) return;
    const kind = kindOpt || p.likes[Math.random() < 0.7 ? 0 : 1];
    const v = A.nearest(kind, player.pos.x, player.pos.z) || A.venues[0]; if (!v) return;
    const boss = key === "gondo";
    notify("Phone", p.name, "Incoming call…", 4);
    ring(3, () => {
      C.menu({ head: "📞 " + p.name, tag: "Incoming call", body: INVITE[key](v), cancel: null,
        opts: [
          { label: boss ? "Hai, Gondō-buchō. On my way." : "On my way!", note: "meet by " + hhmm((now() + 60) % 1440), fn: () => { C.emit("ah:invite", { who: key, kind: v.kind, venue: v.name, by: key, accepted: true }); A.plan(v.kind, [key], { venue: v, within: 60, src: "invite" }); } },
          { label: boss ? "I'm sorry, buchō. I'm exhausted tonight." : "Not tonight, sorry.", note: boss ? "he'll remember" : "", fn: () => {
            C.emit("ah:invite", { who: key, kind: v.kind, venue: v.name, by: key, accepted: false });
            like(key, boss ? -6 : -3);
            if (boss && window.standing) try { standing.earn(-2, "Turned down the boss"); } catch (e) { /* optional */ }
            say(p.short + ": " + (boss ? "“…Exhausted. Hmph. Fine.”" : "“Boo. Next time then!”"), 4);
          } }
        ] });
    });
  };

  // ---- arriving, the night, leaving ----------------------------------------------------------------------------------------------------------
  C.prompts.unshift({
    text: () => { if (drive.car || drive.train || !player.placed || player.mode !== "walk" || interior.active || (typeof railTrip === "object" && railTrip.on)) return null; const v = venueNear(); return v ? "Go in · " + v.name + " (" + KINDS[v.kind].label + ")" : null; },
    use: () => { const v = venueNear(); if (!v) return false; return enter(v); }
  });
  function venueNear() { if (!A.venues.length) return null; for (const v of A.venues) if (Math.hypot(player.pos.x - v.door[0], player.pos.z - v.door[1]) < 2.8) return v; return null; }
  function enter(v) {
    const m = dayMin();
    if (m > 4 * 60 + 30 && m < 17 * 60) { say(v.name + ": closed. Opens at 17:00.", 3); return true; }
    if (!interiorEnter(v.shop)) return false;
    A.inside = v;
    const R = interior.room; R.singer = null; R.singerLine = null;
    A.staff = addStaff(R);
    say(v.kind === "izakaya" ? "Irasshaimase! The smoke of the grill, the trains overhead." : v.kind === "bar" ? "Dim light, a long counter, ice in a glass somewhere." : v.kind === "club" ? "The bass comes up through the floor." : "A booth to yourself. The screen glows.", 4);
    const p = S().plan;
    if (p && p.vi === v.i) setTimeout(() => arrived(p, v), 500);
    return true;
  }
  wrap("interiorSpotAct", orig => function (sp) {
    if (sp && typeof sp.act === "string" && sp.act.indexOf("after:") === 0) { player.speed = 0; if (interior.prompt) interior.prompt.classList.remove("on"); spot(sp.act.slice(6), sp); return; }
    return orig.apply(this, arguments);
  });
  wrap("interiorLeave", orig => function () {
    const s = interior.active && interior.shop, night = s && s.brand === "nightspot";
    if (night && A.night) { A.endNight(true); }
    const r = orig.apply(this, arguments);
    if (night) { A.camHold = null; actorsClear("after"); A.inside = null; A.staff = null; player.forceClip = null; if (A.after) { const f = A.after; A.after = null; setTimeout(f, 300); } }
    return r;
  });
  function spot(a) {
    const v = A.inside, R = interior.room, s = S(); if (!v) return;
    const p = s.plan;
    if (a === "table" && p && p.vi === v.i && !A.night) { arrived(p, v); return; }
    if (a === "table" && A.night) { hangMenu(); return; }
    if (a === "counter") {
      const ms = s.missions;
      if (ms.active && ms.active.id === "laptop" && ms.active.step === 1 && ms.active.vi === v.i) { laptopPickup(); return; }
      const price = KINDS[v.kind].round / 2 | 0;
      C.menu({ head: v.name, tag: "At the counter", body: "On your own. The " + (v.kind === "izakaya" ? "master" : "bartender") + " nods. You have " + yenText(purse.yen) + ".", cancel: () => {},
        opts: [{ label: v.kind === "izakaya" ? "A cold beer and some yakitori" : v.kind === "bar" ? "A whisky, neat" : "A highball", note: yenText(price), dim: purse.yen < price, fn: () => { purse.yen -= price; drink(1); advanceGameMinutes(20); say(["The first sip of the evening. The day lets go of you a little.", "Ice, light, quiet. Stress eases.", "You watch the trains' light flicker on the bottles."][Math.random() * 3 | 0], 4); } },
          { label: "Just water, thanks", fn: () => { s.tipsy = Math.max(0, s.tipsy - 0.12); say("Water. Sensible. The " + (v.kind === "izakaya" ? "master" : "bartender") + " approves, quietly.", 3); } },
          { label: "Leave it", fn: () => {} }] });
      return;
    }
    if (a === "dance") { if (A.night) { activity(); return; } dance(null); return; }
    if (a === "sing") { if (A.night) { activity(); return; } sing(null, false); return; }
    if (a === "table") say("An empty table. Ring someone? Their numbers are in Contacts.", 3);
  }

  function arrived(p, v) {
    const s = S(), R = interior.room, late = now() - p.by;
    if (p.src === "company") { companyKaraoke(p, v); return; }
    if (p.mission === "client") { clientDinner(p, v); return; }
    clearPlanBlip(); storyClearObjective();
    const who = p.who, people = who.map((k, i) => seat(R, k, R.seats[i], i));
    A.night = { plan: p, v: v, who: who, people: people, rounds: 0, acts: 0, talked: {}, t0: now(), late: late > 10, stress0: vitals.stress || 0, likeStart: who.map(k => s.like[k]) };
    seatMe(R);
    people.forEach(a => actorLook(a, R.ox + R.mine.x, R.oz + R.mine.z));
    const host = PEOPLE[who[0]], t = R.table || { x: 0, z: 0 }, me = R.mine;
    const est = RL(R, 0, 2.4, R.D / 2 - 0.7), estTo = RL(R, 0.6, 2.1, R.D / 2 - 1.2);
    const shots = [
      { dur: 3.2, from: { pos: est, look: RL(R, t.x, 0.9, t.z) }, to: { pos: estTo, look: RL(R, t.x, 1.0, t.z) }, near: 0.05, timeScale: 0, handheld: 0.6, lines: [[0.3, "", v.name + " · " + hhmm(dayMin())]] },
      Object.assign({ dur: 4.4, near: 0.05, timeScale: 0, handheld: 0.4, speaker: people[0],
        enter: () => { people.forEach(a => { if (a.sitting) a.pose = pose("drinksit", "sit"); }); },
        lines: [[0.2, host.short, late > 10 ? "Look who finally showed up! " + Math.round(late) + " minutes, Seiko!" : host.hello]] }, closeOn(R, people[0], me)),
      Object.assign({ dur: 3.0, near: 0.05, timeScale: 0, handheld: 0.4, lines: [[0.2, "Everyone", "Kanpai!"]], enter: () => { people.forEach(a => { a.pose = a.sitting ? pose("drinksit", "sit") : pose("cheer"); }); } }, twoShotShot(R))
    ];
    if (late > 10) who.forEach(k => like(k, -4));
    cutPlay(shots, () => { people.forEach(a => { a.pose = a.sitting ? pose("sit") : "idle"; }); s.met[who[0]] = C.state().day; drink(1); hangMenu(); });
    s.plan = null;
  }
  function closeOn(R, a, me) {
    // a close-up of the one speaking, from beside Seiko's seat, slow push-in
    const ax = a.x, az = a.z, mx = R.ox + me.x, mz = R.oz + me.z, dx = ax - mx, dz = az - mz, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    const h = interior.floorY + (a.sitting ? 1.15 : 1.6);
    return { from: { pos: [ax - ux * 1.5 + uz * 0.35, h + 0.05, az - uz * 1.5 - ux * 0.35], look: [ax, h, az] }, to: { pos: [ax - ux * 1.2 + uz * 0.3, h + 0.03, az - uz * 1.2 - ux * 0.3], look: [ax, h, az] }, fov: 42 };
  }
  function twoShotShot(R) { const a = twoShot(R); const b = { pos: a.pos.slice(), look: a.look.slice() }; b.pos[1] -= 0.05; return { from: a, to: b }; }

  function hangMenu() {
    const n = A.night; if (!n) return;
    const R = interior.room, s = S(), v = n.v, host = PEOPLE[n.who[0]];
    holdCamera(twoShot(R));
    const price = KINDS[v.kind].round * Math.max(1, n.who.length) / 2 | 0;
    const opts = [];
    opts.push({ label: "Order a round", note: yenText(price) + (s.tipsy > 0.6 ? " · you're quite drunk" : ""), dim: purse.yen < price, fn: () => round(price) });
    const pool = (TOPICS[n.who[0]] || []).concat(TOPICS.any).filter(t => !n.talked[t.q]);
    pool.slice(0, 2).forEach(t => opts.push({ label: "Talk: “" + t.q.slice(0, 54) + (t.q.length > 54 ? "…”" : "”"), fn: () => talk(t) }));
    const act = { izakaya: "Janken for the bill", bar: "Ask the bartender for his special", club: "Hit the dance floor", karaoke: "Take the mic" }[v.kind];
    opts.push({ label: act, fn: activity });
    opts.push({ label: "Call it a night", note: hhmm(dayMin()), fn: () => A.endNight(false) });
    const tip = s.tipsy > 0.7 ? " The room is gently spinning." : s.tipsy > 0.4 ? " You're warm and loose." : "";
    C.menu({ head: v.name, tag: n.who.map(k => PEOPLE[k].short).join(" · ") + " · " + hhmm(dayMin()), body: host.short + " is " + mood(n.who[0]) + "." + tip, opts: opts, cancel: () => A.endNight(false) });
  }
  function mood(k) { const L = S().like[k]; return L > 80 ? "having the best night" : L > 60 ? "glad you came" : L >= 38 ? "relaxed" : L > 20 ? "a bit stiff with you" : "not impressed with you"; }
  function cheerPeople(p) { const n = A.night; if (!n) return; n.people.forEach(a => { a.pose = a.sitting ? pose(p === "laugh" ? "laughsit" : "drinksit", "sit") : pose(p === "laugh" ? "cheer" : "cheer"); }); setTimeout(() => { if (A.night) A.night.people.forEach(a => { a.pose = a.sitting ? pose("sit") : "idle"; }); }, 2200); }
  function tick(mins) { advanceGameMinutes(mins); A.night && (A.night.acts++); }
  function round(price) {
    const n = A.night, s = S(); purse.yen -= price; n.rounds++;
    drink(1); n.who.forEach(k => like(k, 2)); tick(25); cheerPeople("drink");
    const host = PEOPLE[n.who[0]];
    say(["Kanpai! " + host.short + " drains half the glass in one go.", "Another round. The talk gets louder.", host.short + ": “You're alright, Seiko. You're alright.”", "The " + (n.v.kind === "izakaya" ? "master" : "bartender") + " keeps them coming."][n.rounds % 4], 4);
    setTimeout(after, 1400);
  }
  function talk(t) {
    const n = A.night; n.talked[t.q] = true;
    const k = n.who[0], p = PEOPLE[k];
    C.menu({ head: p.short, tag: "Talking", body: "“" + t.q + "”", cancel: null, opts: t.opts.map(o => ({ label: o.label, fn: () => {
      n.who.forEach(w => like(w, w === k ? (o.like || 0) : Math.round((o.like || 0) / 2)));
      if (o.honor && window.standing) try { standing.honor.deed("talk_" + (o.honor > 0 ? "good" : "bad"), { delta: o.honor, label: o.honor > 0 ? "Spoke well of people" : "Spoke badly of someone" }); } catch (e) { /* optional */ }
      if (o.respect && window.standing) try { standing.earn(o.respect, o.respect > 0 ? "Held your own after hours" : "Said the wrong thing"); } catch (e) { /* optional */ }
      if (o.stress && typeof stressSetRaw === "function") stressSetRaw(Math.max(0, (vitals.stress || 0) + o.stress));
      tick(20);
      if ((o.like || 0) > 3) cheerPeople("laugh");
      C.menu({ head: p.short, tag: "Talking", body: "“" + o.reply + "”", opts: [{ label: "…", fn: after }], cancel: after });
    } })) });
  }
  function activity() {
    const n = A.night; if (!n) return;
    const v = n.v, k = n.who[0], p = PEOPLE[k], s = S();
    if (v.kind === "izakaya") {
      const hands = [["✊ Rock", 0], ["✋ Paper", 1], ["✌ Scissors", 2]];
      C.menu({ head: "Janken for the bill", tag: p.short + " · the loser pays", body: "“Saisho wa guu… jan, ken…”", cancel: null, opts: hands.map(h => ({ label: h[0], fn: () => {
        const them = Math.random() * 3 | 0, r = (h[1] - them + 3) % 3, bill = KINDS.izakaya.round * (n.who.length + 1);
        const names = ["rock", "paper", "scissors"];
        if (r === 0) { say("Aiko! Both " + names[them] + ". You split it: " + yenText(bill / 2 | 0) + ".", 4); purse.yen -= bill / 2 | 0; }
        else if (r === 1) { say(p.short + " threw " + names[them] + ". You win! " + p.short + " pays the bill, groaning.", 4); like(k, 1); }
        else { say(p.short + " threw " + names[them] + ". You lose: " + yenText(bill) + ". " + p.short + " is delighted.", 4); purse.yen -= Math.min(purse.yen, bill); like(k, 4); }
        tick(10); cheerPeople("laugh"); setTimeout(after, 1600);
      } })) });
      return;
    }
    if (v.kind === "bar") {
      const price = 3800;
      C.menu({ head: "The bartender's special", tag: "Bar", body: "He thinks for a moment, then reaches for a bottle without a label. “For a long day.” (" + yenText(price) + ")", cancel: () => after(),
        opts: [{ label: "Trust him", note: yenText(price), dim: purse.yen < price, fn: () => { purse.yen -= price; drink(1.5); if (typeof stressSetRaw === "function") stressSetRaw(Math.max(0, (vitals.stress || 0) - 0.15)); like(k, 3); tick(25); say("Smoke, honey, something like the sea at Mizuho. The day is very far away.", 5); setTimeout(after, 1500); } },
          { label: "Maybe not", fn: after }] });
      return;
    }
    if (v.kind === "club") { dance(n); return; }
    sing(n, false);
  }
  function after() { const n = A.night; if (!n) return; const s = S(); if (dayMin() > 1 * 60 + 15 && dayMin() < 5 * 60 && !n.lastCall) { n.lastCall = true; C.menu({ head: n.v.name, tag: "Last orders", body: "“Last orders!” It's " + hhmm(dayMin()) + ". The last trains are gone or going.", opts: [{ label: "Call it a night", fn: () => A.endNight(false) }, { label: "One more", fn: hangMenu }], cancel: () => A.endNight(false) }); return; } if (n.acts >= 6 && !n.suggested) { n.suggested = true; C.menu({ head: PEOPLE[n.who[0]].short, tag: n.v.name, body: "“Ahh… I should get going soon. Work tomorrow.”", opts: [{ label: "Yeah, let's call it a night", fn: () => A.endNight(false) }, { label: "One more, come on!", fn: () => { like(n.who[0], 1); hangMenu(); } }], cancel: hangMenu }); return; } if (s.tipsy >= 1 && !n.tooDrunk) { n.tooDrunk = true; drunkScene(); return; } hangMenu(); }
  function drunkScene() {
    const n = A.night, k = n.who[0];
    say("You knock a glass over. Then another. People are looking.", 4);
    if (window.standing) try { standing.deed("drunk_scene"); } catch (e) { /* optional */ }
    like(k, -3);
    setTimeout(hangMenu, 2000);
  }
  A.endNight = function (leaving) {
    const n = A.night; if (!n) return;
    A.night = null;
    const s = S();
    const gained = n.who.map((k, i) => (s.like[k] - n.likeStart[i]));
    const relief = Math.max(0, n.stress0 - (vitals.stress || 0));
    if (typeof stressSetRaw === "function") stressSetRaw(Math.max(0, (vitals.stress || 0) - 0.08));
    s.nights++;
    n.who.forEach(k => { s.met[k] = C.state().day; });
    if (n.who.indexOf("gondo") >= 0 && window.standing) try { standing.earn(2, "Drank with the boss"); } catch (e) { /* optional */ }
    C.emit("ah:hangout", { who: n.who, kind: n.v.kind, venue: n.v.name, like: gained, stress: Math.round(relief * 100) / 100, rounds: n.rounds });
    player.forceClip = null;
    const host = PEOPLE[n.who[0]];
    // what the night leads to
    const ms = s.missions;
    let next = null;
    if (n.who.indexOf("ishikawa") >= 0 && n.rounds >= 2 && !ms.done.lastTrain && !ms.active) next = () => A.mission("lastTrain", { v: n.v });
    if (n.who.indexOf("nakano") >= 0 && !ms.done.laptop && !ms.due.laptop) ms.due.laptop = C.state().day + 1;
    const sum = host.short + (gained[0] >= 0 ? " +" : " ") + gained[0] + " · stress −" + Math.round(relief * 100) + "%";
    const bye = () => { notify("Contacts", host.name, (gained[0] >= 0 ? "♥ " : "") + sum, 6); };
    if (leaving) { bye(); if (next) A.after = next; return; }
    cutPlay([Object.assign({ dur: 3.4, near: 0.05, timeScale: 0, handheld: 0.4, lines: [[0.2, host.short, host.bye || "Good night, Seiko."]], enter: () => n.people.forEach(a => { a.pose = pose("bow", "idle"); }) }, twoShotShot(interior.room))], () => {
      bye();
      A.after = next || backToDay;
      interiorLeave(true);
    });
  };

  // ---- the dance floor and the mic ------------------------------------------------------------------------------------------------------------
  function dance(n) {
    const R = interior.room;
    player.forceClip = null;
    player.pos.set(R.ox, interior.floorY, R.oz + 0.6); if (player.obj) player.obj.position.copy(player.pos);
    holdCamera({ pos: RL(R, 0.4, 2.6, 4.4), look: RL(R, 0, 1.0, 0) });
    if (n) n.people.forEach((a, i) => { a.x = R.ox + Math.sin(i * 2.1) * 1.4; a.z = R.oz + 0.6 + Math.cos(i * 2.1) * 1.2; a.y = interior.floorY; a.pose = "idle"; actorLook(a, R.ox, R.oz + 0.6); });
    karaoke.play({ mode: "dance", track: "dance", title: "The dance floor · " + (A.inside ? A.inside.name : ""),
      onBeat: ok => { player.forceClip = ok ? "wave" : null; if (n) n.people.forEach((a, i) => { a.pose = ok && (i + Math.floor(clock * 2)) % 2 ? pose("cheer") : "idle"; }); },
      done: r => {
        player.forceClip = null;
        if (!n) A.camHold = null;
        const relief = 0.06 + r.pct * 0.14; if (typeof stressSetRaw === "function") stressSetRaw(Math.max(0, (vitals.stress || 0) - relief));
        advanceGameMinutes(30);
        if (n) { n.who.forEach(k => like(k, Math.round(r.pct * 8) - 1)); n.acts++; n.people.forEach(a => { if (a.home) { a.x = R.ox + a.home.x; a.z = R.oz + a.home.z; a.yaw = a.home.yaw; a.pose = "idle"; } }); seatMe(R); }
        if (r.grade === "S" && window.standing) try { standing.earn(1, "Owned the dance floor"); } catch (e) { /* optional */ }
        say(r.grade === "S" || r.grade === "A" ? "The floor makes room for you. Somebody whoops." : r.grade === "D" ? "You danced. Technically." : "Sweaty, happy, lighter.", 4);
        if (n) setTimeout(after, 800);
      } });
  }
  function sing(n, company, then) {
    const R = interior.room;
    const st = R.stage || { x: 0, z: 2.6, yaw: Math.PI };
    player.forceClip = null;
    player.pos.set(R.ox + st.x, interior.floorY, R.oz + st.z); player.yaw = player.targetYaw = st.yaw + Math.PI; if (player.obj) { player.obj.position.copy(player.pos); player.obj.rotation.y = player.yaw; }
    // from beside the screen, back at Seiko with the mic and the sofas behind him
    holdCamera({ pos: RL(R, st.x + 2.3, 1.55, st.z + 0.9), look: RL(R, st.x - 0.6, 1.2, st.z - 1.6) });
    const crowd = n ? n.people : (A.company ? A.company.people : []);
    karaoke.play({ track: "salaryman", mode: "sing", title: "Salary Man", crowd: crowd,
      onFrame: (dt, k) => { player.forceClip = k.singing ? "mic" : null; },
      onBeat: ok => { crowd.forEach((a, i) => { a.pose = ok ? (a.sitting ? pose("laughsit", "sit") : pose("cheer")) : (a.sitting ? pose("sit") : "idle"); }); },
      done: r => {
        player.forceClip = null;
        crowd.forEach(a => { a.pose = a.sitting ? pose("sit") : "idle"; });
        const relief = 0.08 + r.pct * 0.18; if (typeof stressSetRaw === "function") stressSetRaw(Math.max(0, (vitals.stress || 0) - relief));
        advanceGameMinutes(15);
        if (then) { then(r); return; }
        if (n) { n.who.forEach(k => like(k, Math.round(r.pct * 10) - 2)); n.acts++; seatMe(R); say(r.grade === "S" || r.grade === "A" ? PEOPLE[n.who[0]].short + " is on their feet, clapping." : r.grade === "D" ? "Polite applause. Very polite." : "Applause, a tambourine, a cheer.", 4); setTimeout(after, 1000); }
        else { A.camHold = null; } if (!n) say(r.grade === "S" ? "Alone in a karaoke box, and you were magnificent." : "Nobody heard that. Probably for the best.", 4);
      } });
  }

  // ---- company karaoke ----------------------------------------------------------------------------------------------------------------------------
  A.karaokeNight = function (quiet) {
    const s = S(), so = story.soti;
    if (!A.venues.length) A.buildVenues();
    const v = A.nearest("karaoke", so ? so.door[0] : player.pos.x, so ? so.door[1] : player.pos.z); if (!v) return null;
    s.lastKaraoke = C.state().day;
    const by = now() + Math.max(40, 20 * 60 + 15 - dayMin());
    s.plan = { who: ["akio", "gondo", "mori", "ishikawa", "nakano", "fujita"], kind: "karaoke", vi: v.i, by: Math.round(by), src: "company", made: Math.round(now()) };
    blipPlan();
    if (!quiet) notify("Messages", "Akio Sotiyama", "Company karaoke tonight! " + v.name + " under " + v.station + " Station, " + hhmm(by % 1440) + ". Everyone comes. I'm paying. Prepare the company song. — A.", 10);
    storyObjective("Company karaoke: " + v.name + " by " + hhmm(by % 1440), "Under " + v.station + " Station. Akio-sama invited the whole company. Missing it would be noticed.");
    saveGame(null, true);
    return s.plan;
  };
  function companyKaraoke(p, v) {
    const s = S(), R = interior.room;
    clearPlanBlip(); storyClearObjective();
    s.plan = null;
    const keys = p.who, people = keys.map((k, i) => seat(R, k, R.seats[i % R.seats.length], i));
    A.company = { people: people, v: v };
    const ak = people[0], gd = people[1];
    seatMe(R);
    const late = now() - p.by;
    if (late > 15) { like("akio", -5); like("gondo", -5); }
    const scr = R.screen;
    R.singer = "Gondō"; R.singerLine = "Enka · 'The Harbour in Winter'";
    cutPlay([
      { dur: 3.4, from: { pos: RL(R, -2.6, 2.1, 3.4), look: RL(R, 0, 0.9, -1.5) }, to: { pos: RL(R, -2.0, 2.0, 3.2), look: RL(R, 0, 1.0, -1.5) }, near: 0.05, timeScale: 0, handheld: 0.5,
        lines: [[0.2, "", "Company karaoke · " + v.name], [1.8, "", late > 15 ? "You're late. Everyone noticed." : "Six SOTI people, one small room, too many tambourines."]] },
      Object.assign({ dur: 5.6, near: 0.05, timeScale: 0, handheld: 0.35, enter: () => { ak.pose = pose("cheer"); },
        lines: [[0.2, "Akio", "Everyone! A toast. To 3F, the hardest-working floor in SOTI."], [3.2, "Akio", "And to our newest floor manager. Kanpai!"]] }, closeOn(R, ak, R.mine)),
      { dur: 5.4, from: { pos: RL(R, 1.2, 1.5, -0.4), look: RL(R, 0, 1.4, 2.6) }, to: { pos: RL(R, 1.0, 1.5, -0.1), look: RL(R, 0, 1.45, 2.6) }, near: 0.05, timeScale: 0, handheld: 0.7,
        enter: () => { gd.x = R.ox; gd.z = R.oz + 2.6; gd.yaw = Math.PI; gd.pose = pose("mic"); people.slice(2).forEach(a => { a.pose = pose("laughsit", "sit"); }); },
        lines: [[0.2, "Gondō", "♪ The harbour… in winterrrr… ♪"], [2.6, "Mori", "(whispering) He does this every time."], [4.2, "Gondō", "♪ …nineteen yearrrrs… ♪"]] },
      Object.assign({ dur: 4.2, near: 0.05, timeScale: 0, handheld: 0.4, enter: () => { gd.pose = "idle"; ak.pose = "idle"; },
        lines: [[0.2, "Akio", "Thank you, Gondō. Very… moving. Seiko! The company song. You know it?"], [2.6, "Seiko", "(Everyone is looking at you.)"]] }, closeOn(R, ak, R.mine))
    ], () => {
      gd.x = R.ox + gd.home.x; gd.z = R.oz + gd.home.z; gd.yaw = gd.home.yaw; gd.pose = pose("sit");
      R.singer = null; R.singerLine = null;
      sing(null, true, r => {
        const g = r.grade;
        const resp = { S: 6, A: 4, B: 2, C: 0, D: -2 }[g];
        if (window.standing) try { standing.earn(resp, resp >= 0 ? "Sang the company song at company karaoke" : "Butchered the company song"); } catch (e) { /* optional */ }
        like("akio", resp * 2); like("gondo", resp); PARTNERS.forEach(k => like(k, Math.max(1, resp)));
        C.emit("ah:karaoke", { grade: g, pct: r.pct, score: r.score });
        const line = { S: ["Akio", "That… that was the best rendition of our song I have ever heard. Seiko. Remarkable."], A: ["Akio", "Wonderful! Ha! That's the spirit of SOTI!"], B: ["Akio", "Good, good! Gondō, take notes."], C: ["Gondō", "Hmph. At least you didn't sing about the harbour."], D: ["Akio", "…Well! It's about the heart, isn't it. Kanpai, everyone!"] }[g];
        seatMe(R);
        cutPlay([Object.assign({ dur: 4.6, near: 0.05, timeScale: 0, handheld: 0.4, lines: [[0.2, line[0], line[1]], [2.8, "", "Respect " + (resp >= 0 ? "+" : "") + resp]], enter: () => people.forEach(a => { a.pose = g === "D" ? (a.sitting ? pose("sit") : "idle") : pose("cheer"); }) }, closeOn(R, ak, R.mine))], () => {
          A.company = null; advanceGameMinutes(60); drink(1.5);
          A.after = backToDay;
          interiorLeave(true);
        });
      });
    });
  }

  // ---- after-hours missions -----------------------------------------------------------------------------------------------------------------------
  const MISSIONS = { lastTrain: "Last Train", laptop: "The Forgotten Laptop", client: "The Ōtsuka Renewal" };
  A.mission = function (id, o) {
    const s = S(), ms = s.missions; o = o || {};
    if (id === "lastTrain") return lastTrain(o.v || A.inside || A.nearest("izakaya", player.pos.x, player.pos.z));
    if (id === "laptop") { ms.due.laptop = 0; return laptopCall(); }
    if (id === "client") return clientCall();
  };
  function missionDone(id, passed, sub) {
    const ms = S().missions; ms.active = null; if (passed) ms.done[id] = true;
    C.emit("ah:mission", { id: id, passed: passed });
    clearPlanBlip(); storyClearBlipsOf("ah");
    if (passed) { storyPassed(MISSIONS[id], sub || "After hours"); }
    else if (typeof storyFailed === "function") storyFailed(MISSIONS[id], sub || "After hours"); else say("Mission failed · " + MISSIONS[id] + (sub ? " · " + sub : ""), 6);
    setTimeout(backToDay, passed ? 5600 : 1500);
    saveGame(null, true);
  }
  function storyClearBlipsOf(tag) { for (let i = story.blips.length - 1; i >= 0; i--) { const b = story.blips[i]; if (b.ah === tag) { if (b.beam) scene.remove(b.beam); story.blips.splice(i, 1); } } }
  function ahBlip(x, z, label) { const b = storyBlip(x, z, label, { col: "#b04dff", letter: "" }); b.ah = "ah"; return b; }

  // LAST TRAIN: Ishikawa can barely stand. Walk him to a station before the last train goes.
  function lastTrain(v) {
    const s = S(), ms = s.missions;
    const list = stationList().map(st => ({ st: st, d: Math.hypot(st.centre[0] - v.door[0], st.centre[1] - v.door[1]) })).filter(e => e.st !== v.st && e.d > 90).sort((a, b) => a.d - b.d);
    const dest = list[0] ? list[0].st : v.st;
    const deadline = now() + Math.max(30, Math.min(80, ((24 * 60 + 40) - dayMin() + 1440) % 1440));
    ms.active = { id: "lastTrain", dest: stName(dest), by: Math.round(deadline), lost: 0 };
    const a = actorAdd({ x: player.pos.x + 1.2, z: player.pos.z + 0.8, female: false, business: true, pick: 11, tag: "ahEscort", pose: pose("drunk", "idle"), look: [PEOPLE.ishikawa.look], sp: 1.2 });
    A.escort = { a: a, dest: dest, why: "lastTrain" };
    cutPlay([{ dur: 4.4, from: { pos: [player.pos.x + 3.2, player.pos.y + 1.6, player.pos.z + 2.6], look: [player.pos.x, player.pos.y + 1.1, player.pos.z] }, to: { pos: [player.pos.x + 2.8, player.pos.y + 1.5, player.pos.z + 2.2], look: [player.pos.x, player.pos.y + 1.1, player.pos.z] }, timeScale: 0, handheld: 0.9,
      lines: [[0.2, "Ishikawa", "Seikooo… the ground's moving. Is the ground moving?"], [2.4, "Ishikawa", "My train… last train… my wife will kill me…"]] }], () => {
      ahBlip(dest.conc && dest.conc.door ? dest.conc.door[0] : dest.centre[0], dest.conc && dest.conc.door ? dest.conc.door[1] : dest.centre[1], stName(dest) + " Station · last train");
      storyObjective("Last Train: walk Ishikawa to " + stName(dest) + " Station by " + hhmm(deadline % 1440), "He's slow and he wanders. Stay close or he sits down on the pavement.");
    });
    return ms.active;
  }
  function escortTick(dt) {
    const e = A.escort; if (!e) return;
    const a = e.a, ms = S().missions, m = ms.active;
    if (!m || interior.active) return;
    const dx = player.pos.x - a.x, dz = player.pos.z - a.z, d = Math.hypot(dx, dz);
    if (drive.car) { if (!e.carSaid) { e.carSaid = true; say("Ishikawa: “I'm not getting in a car. I'll be sick. Walk, Seiko. Walk.”", 4); } }
    if (d > 2.0 && d < 30) { a.path = [[player.pos.x - dx / d * 1.4 + Math.sin(clock * 1.7) * 0.6, player.pos.z - dz / d * 1.4 + Math.cos(clock * 1.3) * 0.6]]; a.pi = 0; a.sp = d > 8 ? 2.2 : 1.25; a.pose = pose("drunk", "idle"); m.lost = 0; }
    else if (d >= 30) { a.path = null; a.pose = pose("sit", "idle"); m.lost += dt; if (!e.sat) { e.sat = true; say("Ishikawa sits down on the kerb. “Go on without me…”", 4); } if (m.lost > 40) { actorsClear("ahEscort"); A.escort = null; like("ishikawa", -10); if (window.standing) try { standing.deed("broken_word"); } catch (x) { /* optional */ } missionDone("lastTrain", false, "you left him on the kerb"); } }
    else { a.path = null; e.sat = false; }
    const st = e.dest, r = (st.yaw || 0) * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r), lx = (a.x - st.centre[0]) * c - (a.z - st.centre[1]) * sn, lz = (a.x - st.centre[0]) * sn + (a.z - st.centre[1]) * c;
    const there = (Math.abs(lx) < (st.size ? st.size[0] / 2 : 60) + 6 && Math.abs(lz) < (st.size ? st.size[1] / 2 : 15) + 8) || (st.conc && st.conc.door && Math.hypot(a.x - st.conc.door[0], a.z - st.conc.door[1]) < 26);
    if (there && d < 8) {
      A.escort = null;
      const ax = a.x, az = a.z, ay = a.y;
      cutPlay([{ dur: 4.6, from: { pos: [ax + 2.4, ay + 1.5, az + 2.0], look: [ax, ay + 1.3, az] }, to: { pos: [ax + 2.0, ay + 1.5, az + 1.6], look: [ax, ay + 1.3, az] }, timeScale: 0, handheld: 0.5,
        enter: () => { a.path = null; a.pose = pose("bow", "idle"); actorLook(a, player.pos.x, player.pos.z); },
        lines: [[0.2, "Ishikawa", "Seiko… you're a good man. A good floor manager. The best."], [2.6, "Ishikawa", "I'm going to tell everyone. Tomorrow. If I remember."]] }], () => {
        actorsClear("ahEscort");
        like("ishikawa", 12);
        if (window.standing) try { standing.deed("help_escort"); standing.earn(2, "Got a colleague home"); } catch (x) { /* optional */ }
        missionDone("lastTrain", true, "Ishikawa caught the last train");
      });
      return;
    }
    if (now() > m.by) { actorsClear("ahEscort"); A.escort = null; like("ishikawa", -4); missionDone("lastTrain", false, "the last train left · Ishikawa takes a ¥9,000 taxi"); }
  }

  // THE FORGOTTEN LAPTOP: Nakano left her SOTI laptop at the bar. Get it back to her before anyone notices.
  function laptopCall() {
    const s = S(), ms = s.missions;
    const v = A.nearest("bar", player.pos.x, player.pos.z) || A.venues[0];
    const meetSt = stationList().filter(st => st !== v.st).sort((a, b) => Math.hypot(a.centre[0] - v.door[0], a.centre[1] - v.door[1]) - Math.hypot(b.centre[0] - v.door[0], b.centre[1] - v.door[1]))[1] || v.st, meet = { name: stName(meetSt), st: meetSt };
    notify("Phone", PEOPLE.nakano.name, "Incoming call…", 4);
    ring(3, () => C.menu({ head: "📞 " + PEOPLE.nakano.name, tag: "Incoming call", body: "“Seiko-san, I'm SO sorry, I think I left my SOTI laptop at " + v.name + " under " + v.station + "… If Gondō finds out I'm dead. Could you get it? I'll wait at " + meet.name + " Station. Before eleven? Please?”", cancel: null,
      opts: [{ label: "Leave it to me", fn: () => {
        ms.active = { id: "laptop", step: 1, vi: v.i, meet: meet.name, by: Math.round(now() + Math.max(60, 23 * 60 - dayMin())) };
        ahBlip(v.door[0], v.door[1], v.name + " · the laptop");
        storyObjective("The Forgotten Laptop: collect Nakano's laptop from " + v.name, "Ask at the counter. Then take it to her at " + meet.name + " Station before " + hhmm(ms.active.by % 1440) + ".");
      } }, { label: "Sorry, I can't tonight", fn: () => { like("nakano", -6); ms.done.laptop = true; say("Nakano: “Oh… okay. I'll… figure something out.”", 4); } }] }));
  }
  function laptopPickup() {
    const ms = S().missions, m = ms.active;
    C.menu({ head: A.inside.name, tag: "At the counter", body: "The bartender reaches under the counter: a grey SOTI laptop bag with a cat keyring. “Your friend's? She was very happy last night.”", cancel: null,
      opts: [{ label: "Take it. Thank him.", fn: () => step2(false) },
             { label: "Take it… and have a look at what's on it", note: "honor", fn: () => step2(true) }] });
    function step2(peek) {
      if (peek) { if (window.standing) try { standing.deed("snoop"); } catch (e) { /* optional */ } say("Her files: three unfinished resignation letters, a spreadsheet of cats. You close the lid. You feel bad.", 6); m.peeked = true; }
      else say("“Arigatō.” The bag is heavier than it looks.", 3);
      m.step = 2;
      storyClearBlipsOf("ah");
      const st = stationList().find(q => stName(q) === m.meet);
      if (st) { ahBlip(st.centre[0], st.centre[1], m.meet + " Station · Nakano"); A.waiting = actorAdd({ x: st.centre[0] + 0, z: st.centre[1] + 0, female: true, business: true, pick: 5, tag: "ahNakano", pose: "idle", look: [PEOPLE.nakano.look] }); placeBeside(A.waiting, st); }
      storyObjective("The Forgotten Laptop: take it to Nakano at " + m.meet + " Station by " + hhmm(m.by % 1440), "She's waiting by the station.");
    }
  }
  function placeBeside(a, st) {
    // just off the station's long side, on the clear side, like the venue doors
    const len = st.size ? st.size[0] : 100, wid = st.size ? st.size[1] : 30, c = st.conc;
    if (c && c.door) { const p = [c.door[0] + Math.sin(c.yaw) * 3 - Math.cos(c.yaw) * 5, c.door[1] + Math.cos(c.yaw) * 3 + Math.sin(c.yaw) * 5]; a.x = p[0]; a.z = p[1]; a.y = world.surfaceY(p[0], p[1]); a.yaw = c.yaw + Math.PI; }
    else for (const side of [1, -1]) { const p = fromLocal(st, len * -0.2, side * (wid / 2 + 3)); if (!(typeof insideBuilding === "function" && insideBuilding(p[0], p[1], 0.4, world.surfaceY(p[0], p[1])))) { a.x = p[0]; a.z = p[1]; a.y = world.surfaceY(p[0], p[1]); break; } }
    const b = story.blips.find(q => q.ah === "ah"); if (b) { b.x = a.x; b.z = a.z; if (b.beam) b.beam.position.set(a.x, a.y, a.z); nav.waypoint = { x: a.x, z: a.z }; }
  }
  function laptopTick() {
    const m = S().missions.active; if (!m || m.id !== "laptop") return;
    if (m.step === 2 && A.waiting && !interior.active && Math.hypot(player.pos.x - A.waiting.x, player.pos.z - A.waiting.z) < 3.2) {
      const a = A.waiting; A.waiting = null;
      cutPlay([{ dur: 5.0, from: { pos: [a.x + 2.2, a.y + 1.6, a.z + 1.6], look: [a.x, a.y + 1.4, a.z] }, to: { pos: [a.x + 1.8, a.y + 1.58, a.z + 1.3], look: [a.x, a.y + 1.45, a.z] }, timeScale: 0, handheld: 0.4,
        enter: () => { actorLook(a, player.pos.x, player.pos.z); a.pose = pose("bow", "idle"); },
        lines: [[0.2, "Nakano", "SEIKO-SAN! You're a lifesaver! Thank you thank you thank you!"], [2.6, "Nakano", m.peeked ? "…You didn't look at anything, right? Right. Of course not." : "I owe you. Karaoke's on me. Forever."]] }], () => {
        actorsClear("ahNakano");
        like("nakano", m.peeked ? 6 : 14);
        if (window.standing) try { standing.earn(2, "Saved a colleague's skin"); } catch (e) { /* optional */ }
        missionDone("laptop", true, "Nakano got her laptop back");
      });
      return;
    }
    if (now() > m.by) { actorsClear("ahNakano"); A.waiting = null; like("nakano", -8); missionDone("laptop", false, "Nakano had to tell Gondō"); }
  }

  // THE ŌTSUKA RENEWAL: Gondō sends the new floor manager to keep a client happy until he signs.
  function clientCall() {
    const s = S(), ms = s.missions;
    const v = A.nearest("bar", player.pos.x, player.pos.z) || A.venues[0];
    notify("Phone", PEOPLE.gondo.name, "Incoming call…", 4);
    ring(3, () => C.menu({ head: "📞 " + PEOPLE.gondo.name, tag: "Incoming call", body: "“Seiko. Ōtsuka-san from Ōsaka. Biggest account on our floor. His contract renewal is on the table and I have a… thing. You'll take him to " + v.name + " under " + v.station + ". Keep him happy. Do NOT let him leave without signing.”", cancel: null,
      opts: [{ label: "Hai. Leave it to me, buchō.", fn: () => { ms.active = { id: "client", vi: v.i }; A.plan("bar", ["otsuka"], { venue: v, within: 70, src: "mission", mission: "client", objective: "The Ōtsuka Renewal: meet Ōtsuka-san at " + v.name + " by " + hhmm((now() + 70) % 1440), hint: "Gondō's biggest client. Keep him happy until he signs." }); } },
             { label: "Buchō, it's my night off…", fn: () => { like("gondo", -10); ms.done.client = true; if (window.standing) try { standing.earn(-3, "Refused the boss's client"); } catch (e) { /* optional */ } say("Gondō: “Your night off. I'll remember that, Seiko.”", 4); } }] }));
  }
  function clientDinner(p, v) {
    const R = interior.room, s = S();
    clearPlanBlip(); storyClearObjective(); s.plan = null;
    const ot = seat(R, "otsuka", R.seats[0], 0);
    seatMe(R);
    let moodScore = now() - p.by > 10 ? -1 : 0;
    const Q = [
      { q: "So. Gondō sends the new boy. Is SOTI trying to tell me something?", opts: [["“Gondō-buchō trusts me with his most important client. So do I take it.”", 1], ["“He was busy, sorry.”", -1], ["“I asked to come. I wanted to meet the man behind our biggest account.”", 2]] },
      { q: "Your prices went up eight percent. My board is asking why I shouldn't go to Kanto Mobile.", opts: [["“Kanto Mobile's support line has a four-hour wait. Ours has 3F.”", 2], ["“I can see what I can do on the price.”", 0], ["“Then go to Kanto Mobile.”", -2]] },
      { q: "(He swirls his whisky.) Do you drink, Seiko-kun? A man who doesn't drink, I don't trust.", opts: [["“Kanpai, Ōtsuka-san.” (match him)", 1, true], ["“Just one, I have to work tomorrow.”", 0], ["“I don't, sorry.”", -1]] }
    ];
    const step = (i) => {
      holdCamera(twoShot(R));
      if (i >= Q.length) return finish();
      const q = Q[i];
      C.menu({ head: "Ōtsuka Masaru", tag: "Client · " + v.name, body: "“" + q.q + "”", cancel: null, opts: q.opts.map(o => ({ label: o[0], fn: () => { moodScore += o[1]; if (o[2]) drink(1); advanceGameMinutes(25); ot.pose = o[1] > 0 ? pose("laughsit", "sit") : pose("sit"); setTimeout(() => step(i + 1), 500); } })) });
    };
    const finish = () => {
      const win = moodScore >= 2;
      cutPlay([Object.assign({ dur: 4.4, near: 0.05, timeScale: 0, handheld: 0.4, lines: win ? [[0.2, "Ōtsuka", "Hah! You're alright, Seiko-kun. Give me the pen."], [2.6, "", "Ōtsuka-san signs the renewal."]] : [[0.2, "Ōtsuka", "I'll think about it. Tell Gondō I'll call him."], [2.6, "", "He doesn't sign."]] }, closeOn(R, ot, R.mine))], () => {
        if (win) { purse.yen += 30000; like("gondo", 10); if (window.standing) try { standing.earn(5, "Closed the Ōtsuka renewal"); } catch (e) { /* optional */ } setTimeout(() => notify("Messages", "Gondō Tetsuo", "Ōtsuka signed?! …Good work. Bonus is in your account. Don't let it go to your head.", 9), 6000); }
        else { like("gondo", -6); if (window.standing) try { standing.earn(-2, "Lost the Ōtsuka renewal"); } catch (e) { /* optional */ } setTimeout(() => notify("Messages", "Gondō Tetsuo", "He DIDN'T SIGN? Seiko. My office. 9:00.", 9), 3000); }
        S().missions.active = null; S().missions.done.client = true;
        C.emit("ah:mission", { id: "client", passed: win });
        if (win) storyPassed(MISSIONS.client, "Bonus ¥30,000"); else if (typeof storyFailed === "function") storyFailed(MISSIONS.client, "The client walked"); else say("Mission failed · " + MISSIONS.client, 5);
        A.after = backToDay;
        setTimeout(() => interiorLeave(true), win ? 1200 : 300);
      });
    };
    cutPlay([Object.assign({ dur: 4.2, near: 0.05, timeScale: 0, handheld: 0.4, lines: [[0.2, "Ōtsuka", "You must be Gondō's floor manager. Sit, sit. Whisky?"]] }, closeOn(R, ot, R.mine))], () => step(0));
  }

  // ---- every frame ---------------------------------------------------------------------------------------------------------------------------
  let ckT = 0;
  function frame(dt) {
    if (!story.career || !(story.m >= 2)) { tipsyLook(); return; }
    const s = S();
    // the tipsy fades with time
    if (s.tipsy > 0) { s.tipsy = Math.max(0, s.tipsy - dt * TIME.rate * 0.0035); }
    tipsyLook();
    if (A.night && !cut.active && !karaoke.on && interior.active && interior.room && interior.room.mine) { const R = interior.room; player.speed = 0; player.pos.x = R.ox + R.mine.x; player.pos.z = R.oz + R.mine.z; }
    if (A.escort) escortTick(dt);
    laptopTick();
    ckT += dt; if (ckT < 1) return; ckT = 0;
    if (!A.venues.length && world && world.cities && world.cities[0] && story.m >= 3) { A.buildVenues(); A.buildEntrances(); }
    if (A.venues.length && !A.venues[0].g) A.buildEntrances();
    if (unlocked()) contacts();
    // drink driving
    if (drive.car && s.tipsy > 0.45 && s.ddDay !== C.state().day) { s.ddDay = C.state().day; if (window.standing) try { standing.deed("drink_drive"); } catch (e) { /* optional */ } say("You've been drinking. Driving like this is how people get hurt.", 5); }
    // a plan that's still on the map
    if (s.plan) {
      blipPlan();
      if (now() > s.plan.by + 50 && !interior.active) {
        const p = s.plan; s.plan = null; clearPlanBlip();
        if (p.src === "company") { s.skippedKaraoke++; if (window.standing) try { standing.earn(-4, "Skipped company karaoke"); } catch (e) { /* optional */ } like("akio", -8); like("gondo", -6); setTimeout(() => notify("Messages", "Gondō Tetsuo", "Akio-sama asked where you were. I didn't know what to tell him. Don't do that again.", 9), 2000); }
        else if (p.mission === "client") { S().missions.active = null; S().missions.done.client = true; like("gondo", -12); if (window.standing) try { standing.earn(-4, "Stood up a client"); } catch (e) { /* optional */ } notify("Messages", "Gondō Tetsuo", "Ōtsuka-san waited an HOUR. Do you know what you've done?", 9); }
        else { p.who.forEach(k => like(k, -8)); notify("Messages", PEOPLE[p.who[0]].name, "We waited… guess you're not coming. 😑", 7); }
        backToDay();
      }
      return;
    }
    // the evening's phone calls
    if (cut.active || C.menuState.on || (C.desk && C.desk.on) || karaoke.on || interior.active || s.missions.active || drive.train || !unlocked()) return;
    if (C.active() && story.step !== "c:home") return;
    if (drive.car && Math.abs(drive.car.speed || 0) > 4) return;
    const day = C.state().day, m = dayMin();
    if (s.inviteDay !== day) { s.inviteDay = day; s.inviteAt = 18 * 60 + 40 + Math.random() * 220; s.called = false; }
    if (s.called || m < s.inviteAt || m > 23 * 60 + 30) return;
    s.called = true;
    const ms = s.missions;
    if (ms.due.laptop && day >= ms.due.laptop && !ms.done.laptop) { ms.due.laptop = 0; laptopCall(); return; }
    if (story.m >= 6 && !ms.done.client && Math.random() < 0.5) { clientCall(); return; }
    if (Math.random() < 0.82) {
      const pool = PARTNERS.filter(k => s.met[k] !== day).concat(story.m >= 4 && s.met.gondo !== day ? ["gondo"] : []);
      const w = pool.map(k => (s.like[k] || 40) + 20), tot = w.reduce((a, b) => a + b, 0);
      let r = Math.random() * tot, pick = pool[0]; for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) { pick = pool[i]; break; } }
      if (pick) A.invite(pick);
    }
  }
  const innerTick = window.tick;
  window.tick = function (dt) {
    if (karaoke.on) {
      try { karaoke.frame(dt); } catch (e) { console.warn("[AfterHours] karaoke:", e); karaoke.stop(); }
      if (actors.list.length) actorsTick(dt);
      if (interior.active && interior.room && interior.room.tick) interior.room.tick(dt);
      present();
      return;
    }
    innerTick(dt);
    if (typeof title === "object" && title.on) return;
    try { frame(dt); } catch (e) { console.warn("[AfterHours] frame:", e); }
  };

  // ---- the company karaoke invitation, the hangover, the save ----------------------------------------------------------------------------------
  C.on("shift:end", () => {
    const s = S(), day = C.state().day;
    if (story.m < 4 || s.plan) return;
    const since = day - (s.lastKaraoke || 0);
    if (since >= 7 || (since >= 4 && Math.random() < 0.45)) setTimeout(() => { if (!S().plan) A.karaokeNight(); }, 8500);
  });
  if (typeof C.sleep === "function") {
    const sleepWas = C.sleep;
    C.sleep = function (where) {
      const s = S(), m = dayMin(), heavy = s.tipsy > 0.5 || (m > 1 * 60 + 30 && m < 6 * 60);
      const r = sleepWas.apply(this, arguments);
      if (heavy) setTimeout(() => { s.hangover = true; s.tipsy = 0; if (typeof stressSetRaw === "function") stressSetRaw(0.18); notify("Health", "Hangover", "Your head is pounding. Stress starts high today. Water helps.", 8); }, 1400);
      else s.tipsy = 0;
      return r;
    };
  }
  if (window.standing && standing.honor && standing.honor.define) {
    standing.honor.define("drink_drive", { delta: -10, label: "Drove after drinking", icon: "car", cooldown: 600 });
    standing.honor.define("drunk_scene", { delta: -3, label: "Made a drunken scene", icon: "harass", cooldown: 300 });
    standing.honor.define("snoop", { delta: -4, label: "Snooped on a colleague", icon: "keep" });
    standing.honor.define("talk_good", { delta: 1, label: "Spoke well of people", icon: "service", cooldown: 120 });
    standing.honor.define("talk_bad", { delta: -1, label: "Spoke badly of someone", icon: "harass", cooldown: 120 });
  }
  // a reload: the plan comes back on the map, a mission in progress restarts cleanly
  wrap("storyLoad", orig => function () {
    const r = orig.apply(this, arguments);
    A.blip = null; A.night = null; A.escort = null; A.waiting = null; A.company = null;
    setTimeout(() => {
      if (!story.career || !story.career.after) return;
      const s = S(), m = s.missions;
      if (m.active && (m.active.id === "lastTrain" || m.active.id === "laptop")) { m.active = null; }
      if (!A.venues.length) A.buildVenues();
      if (s.plan) { blipPlan(); }
    }, 2600);
    return r;
  });

  // ---- on the map ------------------------------------------------------------------------------------------------------------------------------
  const mapWas = C.mapIcons;
  C.mapIcons = function (ctx, toScreen, opts) {
    if (mapWas) mapWas.apply(this, arguments);
    if (!A.venues.length || !(story.m >= 3)) return;
    const small = opts && opts.labels === false, p = S().plan;
    A.venues.forEach(v => {
      const planned = p && p.vi === v.i;
      if (small && !planned) return;
      const q = toScreen(v.door[0], v.door[1]), r = small ? 6 : 7, k = KINDS[v.kind];
      ctx.save(); ctx.fillStyle = k.col; ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "800 " + (r * 1.3 | 0) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(k.glyph, q[0], q[1] + 0.5);
      if (!small) { ctx.textAlign = "left"; ctx.font = "700 11px " + (typeof UI === "string" ? UI : "sans-serif"); ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.lineWidth = 3; ctx.strokeText(v.name, q[0] + r + 4, q[1]); ctx.fillText(v.name, q[0] + r + 4, q[1]); }
      ctx.restore();
    });
  };

  // ---- built behind the loading screen --------------------------------------------------------------------------------------------------------
  (window.PERSIST_EXTRA = window.PERSIST_EXTRA || []).push(function (P, facts) {
    P.stage("afterhours", 0.4, async ctx => {
      const built = [];
      for (const k of Object.keys(KINDS)) {
        try { if (!interior.rooms["after:" + k]) interior.rooms["after:" + k] = A.buildRoom(k); built.push(k); } catch (e) { facts.afterFail = (facts.afterFail || []).concat(k + ": " + e.message); }
        await ctx.breathe();
      }
      facts.after = built;
      return { built: built };
    }, { label: "Lighting the lanterns under the tracks" });
    P.check("world", "after-hours rooms ready", () => facts.afterFail && facts.afterFail.length ? "rooms that would not build: " + facts.afterFail.join(", ") : { ok: true, detail: (facts.after || []).join(", ") || "skipped" });
  });

  A.status = () => ({ state: story.career && story.career.after, venues: A.venues.map(v => v.name + " @ " + v.station + " (" + v.kind + ")"), night: !!A.night, escort: !!A.escort });
  console.log("[AfterHours] " + A.version + " · phone invites, venues under the tracks, hangouts, after-hours missions, company karaoke");
})();
