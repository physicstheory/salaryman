// The rest of Seiko's story at SOTI: missions 8 to 50, the ladder, and how it ends.
//
// SOTI is run by Akio Sotiyama, the founder's grandson: a huge man who runs the company the way a boss runs a family. Everyone bows, everyone
// pays, everyone is shouted at. Seiko climbs under him:
//
//    4  floor manager (Gondō's news, career-office.js)      10  section chief      20  department head      30  director
//   40  managing director                                   50  The Chair: the extraordinary board meeting, and the end
//
// A promotion comes every ten missions. Keep your name good (honor) and your work good (the stars on each day) and it comes early: from the
// sixth mission of a rank, HR rings with the news. Each rank pays more, lifts the floor of his respect (standing.promote) and brings a gift
// from the people around him (see "gifts" below, for the wardrobe/watch/fragrance side of the game).
//
// THE END (mission 50) turns on honor, and rolls the credits either way:
//   honor >= 0   The Top Floor: the board removes Akio and names Seiko president. The top office, everyone bows, the president's pay.
//   honor < 0    The Cardboard Box: Seiko tries to bring Akio down by a plot of his own; the friend he trusted tells the boss; he is fired.
//
// Missions are data (saga-content.js), run by quest.js when they are out in the world or up on 58F, and by the floor on 3F when they are not.
//
// ---- gifts (for the luxury thread) ------------------------------------------------------------------------------------------------------
//   career.on("rank:gift", fn)      fn({ rank, rankName, tier (1-6), from, note, kinds: ["watch","fragrance",...], budget, id })
//   window event "salaryman:rank:gift" carries the same detail. When luxury.js is in the build it hands over the actual watch or scent
//   (its own gift table, keyed by the respect rank and by "salaryman:rank" { track: "yakuza", index 1-4 } from yakuza.js). career.saga.gifts() lists every gift so far (saved), career.saga.rank() the rank now,
//   career.saga.tier() 0-7, and career.saga.ladder the table. The Kurogane-kai side fires "yakuza:gift" the same way (yakuza.js).
(function () {
  "use strict";
  const C = window.career, Q = window.quest;
  if (!C || !Q || !C.office) { console.warn("[Saga] the career is not in this build"); return; }
  const G = C.saga = {};
  G.version = "1.0.0";
  C.FINAL = 50; C.LAST = 51;

  // ---- the ladder ------------------------------------------------------------------------------------------------------------------------
  G.ladder = [
    { id: "agent", name: "Customer service", jp: "", wage: 9800, at: 2 },
    { id: "floor_manager", name: "Floor manager", jp: "", wage: 16500, at: 4 },
    { id: "section_chief", name: "Section chief", jp: "kachō", wage: 26000, at: 10, from: "Gondō and the third floor", kinds: ["watch"], budget: 60000,
      note: "The floor had a whip-round. Don't tell Gondō I organised it. — Mori" },
    { id: "dept_head", name: "Department head", jp: "buchō", wage: 42000, at: 20, from: "Sotiyama Akio", kinds: ["watch", "fragrance"], budget: 400000,
      note: "A department head of mine does not wear a plastic watch. Wear this. — A.S." },
    { id: "director", name: "Director", jp: "torishimariyaku", wage: 78000, at: 30, from: "The board of SOTI", kinds: ["watch", "fragrance", "accessory"], budget: 1500000,
      note: "With the board's compliments on your appointment." },
    { id: "md", name: "Managing director", jp: "senmu", wage: 140000, at: 40, from: "Sotiyama Reiko", kinds: ["watch", "fragrance", "accessory"], budget: 4000000,
      note: "My father wore one like it when he built the first radio. Earn it. — Reiko" },
    { id: "president", name: "President of SOTI", jp: "shachō", wage: 520000, at: 50, from: "The staff of SOTI", kinds: ["watch", "fragrance", "accessory"], budget: 12000000,
      note: "From all of us, on every floor." }
  ];
  const rankAt = id => G.ladder.findIndex(r => r.id === id);
  const st = () => { const s = C.state(); const g = s.saga || (s.saga = {}); if (g.favor === undefined) g.favor = 0; if (g.reiko === undefined) g.reiko = 0; g.flags = g.flags || {}; g.ratings = g.ratings || []; g.gifts = g.gifts || []; g.early = g.early || {}; return g; };
  G.state = st;
  G.rankId = () => (C.state().saga && C.state().saga.rank) || (story.flags && story.flags.sotiRank) || (C.state().promoted ? "floor_manager" : "agent");
  G.rank = () => G.ladder[Math.max(0, rankAt(G.rankId()))];
  G.tier = () => Math.max(0, rankAt(G.rankId())) + 1;
  G.gifts = () => st().gifts.slice();
  G.honor = () => (window.standing && standing.honor ? standing.honor.value : 0);
  G.wage = () => G.rank().wage;

  G.missions = {};
  // G.add(n, def): def.kind "field" (out in the world), "meeting" (on 58F), "floor" (3F) or "desk"
  G.add = function (n, def) {
    def.n = n; def.id = "m" + n;
    G.missions[n] = def;
    STORY_TITLES[n] = def.title;
    Object.defineProperty(def, "wage", { get: G.wage, enumerable: true, configurable: true });
    C.missions[n] = def;
  };
  STORY_TITLES[51] = "SOTI";

  // ---- a day that is not on the floor -------------------------------------------------------------------------------------------------------
  G.arrive = function (def) {
    if (story.m === 51) return G.presidentDay();
    if (!def || (def.kind !== "field" && def.kind !== "meeting" && def.kind !== "finale")) return false;
    story.step = "c:field";
    if (def.kind === "finale") { G.finale(); return true; }
    const brief = { office: def.brief, cast: def.cast, card: def.title + "  ·  " + G.rank().name, stay: def.kind === "meeting", noAkio: !!def.noAkio };
    let steps;
    if (def.kind === "meeting") steps = [brief, { talk: "meeting", head: def.head || "Sotiyama Akio" }].concat(def.steps || []).concat([{ leave: true }]);
    else steps = [brief].concat(def.steps).concat(def.noReturn ? [] : [{ go: "soti", text: def.backText || "Report back to SOTI Tower", hint: "The boss does not like to wait." }]);
    if (def.debrief) steps.push({ office: ctx => def.debrief(ctx), cast: def.debriefCast || def.cast });
    Q.run({ id: def.id, title: def.title, steps: steps, people: def.people, talks: def.talks }, ctx => G.fieldDone(def, ctx));
    return true;
  };
  G.fieldDone = function (def, ctx) {
    const s = C.state();
    if (!s.shift) s.shift = { day: s.day };
    const rating = ctx.rating;
    C.shiftDone(ctx.failed ? { rating: 1, bonus: 0, notes: "the job went wrong; it will be waiting tomorrow", failed: true } : { rating: rating, bonus: Math.round((rating - 3) * G.wage() * 0.12), notes: "" });
    if (gameMinutes() < 17 * 60) setGameTime(17 * 60 + 20);
    setTimeout(() => C.clockOut(), 700);
  };
  // the floor counts a day's stars too
  C.on("shift:end", d => { if (story.m >= 5 && d.rating) { const r = st().ratings; r.push(d.rating); if (r.length > 8) r.shift(); } });

  // ---- promotion -------------------------------------------------------------------------------------------------------------------------
  function nextRung() { const i = rankAt(G.rankId()); return i >= 1 && i < G.ladder.length - 2 ? G.ladder[i + 1] : null; }      // president is the ending's to give
  G.reputation = function () {
    const r = st().ratings.slice(-5), avg = r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
    return { honor: G.honor(), stars: Math.round(avg * 10) / 10, days: r.length, high: G.honor() >= 25 && r.length >= 4 && avg >= 3.8 };
  };
  G.promote = function (id, how) {
    const g = st(), r = G.ladder[rankAt(id)]; if (!r) return;
    g.rank = id; story.flags.sotiRank = id;
    try { if (window.standing && standing.promote) standing.promote(id); } catch (e) { /* the honor/respect layer is optional */ }
    C.emit("promotion", { to: r.name.toLowerCase(), rank: id, tier: G.tier(), early: how === "early", wage: r.wage });
    G.achieve("rank_" + id);
    setTimeout(() => notify("Wallet", "SOTI Payroll", r.name + ": " + yenText(r.wage) + " a day from tomorrow.", 8), 2500);
    if (r.kinds) setTimeout(() => G.gift(r), 6000);
  };
  G.gift = function (r, extra) {
    const g = st(), d = Object.assign({ id: "soti:" + r.id, rank: r.id, rankName: r.name, tier: rankAt(r.id) + 1, from: r.from, note: r.note, kinds: r.kinds.slice(), budget: r.budget }, extra || {});
    if (g.gifts.some(x => x.id === d.id)) return;
    g.gifts.push(d);
    C.emit("rank:gift", d);
    // the luxury layer (luxury.js) hands over the actual watch/scent for this rank itself, from the respect rank standing.promote set
    if (window.luxury && luxury.data) { try { window.dispatchEvent(new CustomEvent("salaryman:rank", { detail: { track: "soti", rank: r.id } })); } catch (e) { /* optional */ } return; }
    notify("Messages", r.from, (d.item ? "A gift for the new " + r.name.toLowerCase() + ": " + d.item + ". " : "A box is waiting on your desk. ") + "“" + r.note + "”", 10);
  };
  // after a mission is passed: the tenth of a rank is the promotion; a good name brings it sooner
  G.afterPass = function (m, next) {
    const def = G.missions[m], g = st();
    if (m === 50) return false;
    if (def && def.promote) {
      const r = G.ladder[rankAt(def.promote)], had = rankAt(G.rankId()) >= rankAt(def.promote);
      const lines = had ? def.promoHad || [[0, "Akio", "You already have the title. Fine. Have the money that goes with it."], [0, "Akio", "A bonus. Don't spend it on anything sensible."]] : def.promo;
      Q.office(lines, { cast: def.promoCast, card: had ? "58F" : "Promotion", seikoBow: true }, () => {
        if (had) { const b = r.wage * 5; purse.yen += b; notify("Wallet", "SOTI Payroll", "Bonus: " + yenText(b), 7); }
        else G.promote(def.promote);
        next();
      });
      return true;
    }
    const r = nextRung();
    if (r && !g.early[r.id] && m >= r.at - 4 && m < r.at && G.reputation().high) {
      g.early[r.id] = true;
      Q.office([[0, "", "A call from the 58th floor, on a good day."], [0, "Akio", "Sit. No, stand. I've been hearing your name. From customers. From my aunt. I don't like hearing names that aren't mine."],
        [0, "Akio", "But the numbers are the numbers. " + r.name + ". From tomorrow. Early. Don't make me regret being generous."], [0, "Seiko", "Thank you, Sotiyama-sama. I won't."],
        [0, "Akio", "They all say that. Get out, I'm eating."]], { card: "Promoted early · a good name", seikoBow: true }, () => { G.promote(r.id, "early"); next(); });
      return true;
    }
    return false;
  };
  G.jumped = function (m) {
    const g = st();
    let id = m >= 5 ? "floor_manager" : "agent";
    G.ladder.forEach(r => { if (r.at <= 40 && m > r.at) id = r.id; });
    if (m >= 51 && g.ending === "president") id = "president";
    g.rank = id; story.flags.sotiRank = id;
    try { if (window.standing && standing.promote) standing.promote(id); } catch (e) { /* optional */ }
    if (m <= 50) { g.ending = null; }
  };

  // ---- achievements ----------------------------------------------------------------------------------------------------------------------
  // (kept with the save and in localStorage; the Kurogane-kai's are in the same list)
  G.ACH = {
    rank_section_chief: ["Kachō", "Promoted to section chief"], rank_dept_head: ["Buchō", "Promoted to department head"], rank_director: ["A seat at the table", "Promoted to director"],
    rank_md: ["The second chair", "Promoted to managing director"], rank_president: ["Shachō", "Became president of SOTI"],
    ending_top: ["The Top Floor", "Finished the story with your honor intact"], ending_box: ["The Cardboard Box", "Finished the story the other way"],
    early_bird: ["A good name", "Promoted early on reputation"], clean_hands: ["Clean hands", "Reached the board meeting without doing one of Akio's favours"]
  };
  function achStore() { try { return JSON.parse(localStorage.getItem("konto.achievements") || "{}"); } catch (e) { return {}; } }
  G.achieved = () => Object.assign({}, achStore(), (C.state().ach || {}));
  G.achieve = function (id) {
    const a = G.ACH[id]; if (!a) return false;
    const s = C.state(); s.ach = s.ach || {};
    const all = achStore();
    if (s.ach[id] && all[id]) return false;
    const fresh = !all[id];
    s.ach[id] = all[id] = Date.now();
    try { localStorage.setItem("konto.achievements", JSON.stringify(all)); } catch (e) { /* private window */ }
    if (fresh) achToast(a);
    C.emit("achievement", { id: id, title: a[0], text: a[1] });
    return true;
  };
  function achToast(a) {
    C.css(); sagaCss();
    const el = document.createElement("div"); el.className = "sgach";
    el.innerHTML = "<i>★</i><div><b>Achievement</b><span>" + a[0] + "</span><small>" + a[1] + "</small></div>";
    document.body.appendChild(el);
    try { playBlip(880, 0.12, 0.05); setTimeout(() => playBlip(1320, 0.2, 0.05), 130); } catch (e) { /* quiet */ }
    requestAnimationFrame(() => el.classList.add("on"));
    setTimeout(() => { el.classList.remove("on"); setTimeout(() => el.remove(), 600); }, 6500);
  }
  G.showAchievements = function () {
    const got = G.achieved(), ids = Object.keys(G.ACH);
    C.menu({ head: "Achievements", tag: ids.filter(k => got[k]).length + " of " + ids.length,
      body: ids.map(k => (got[k] ? "<b>★ " + G.ACH[k][0] + "</b>: " + G.ACH[k][1] : "<span style='opacity:.45'>☆ " + (G.ACH[k][2] ? "???" : G.ACH[k][0]) + "</span>")).join("<br>"),
      opts: [{ label: "Close", fn: () => {} }], cancel: () => {} });
  };
  function sagaCss() {
    if (document.getElementById("sagacss")) return;
    const s = document.createElement("style"); s.id = "sagacss";
    s.textContent = `
.sgach{position:fixed;right:28px;top:120px;z-index:70;display:flex;gap:14px;align-items:center;padding:12px 18px 12px 14px;color:#fff;font-family:'Konto Sans','Segoe UI',system-ui,sans-serif;background:rgba(10,12,16,.9);border-left:4px solid #c9a24a;transform:translateX(120%);transition:transform .45s cubic-bezier(.2,.9,.2,1);box-shadow:0 14px 40px rgba(0,0,0,.45)}
.sgach.on{transform:none}
.sgach i{font-style:normal;font-size:30px;color:#c9a24a}
.sgach b{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#c9a24a}
.sgach span{display:block;font-size:19px;font-weight:800}
.sgach small{display:block;font-size:13px;color:#b9c0c8}
#credits{position:fixed;inset:0;z-index:90;background:#050607;color:#fff;font-family:'Konto Sans','Segoe UI',system-ui,sans-serif;overflow:hidden;opacity:0;transition:opacity 1.6s;pointer-events:none}
#credits.on{opacity:1;pointer-events:auto}
#credits .roll{position:absolute;left:0;right:0;top:100%;text-align:center;will-change:transform}
#credits h1{font-size:64px;letter-spacing:.3em;font-weight:900;margin:0 0 6px}
#credits h2{font-size:15px;letter-spacing:.3em;text-transform:uppercase;color:#c9a24a;margin:70px 0 14px;font-weight:700}
#credits h3{font-size:26px;font-weight:800;margin:0 0 40px}
#credits p{margin:5px 0;font-size:19px;color:#e6e9ec}
#credits p i{font-style:normal;color:#8a939c;display:inline-block;width:46%;text-align:right;padding-right:18px}
#credits p b{display:inline-block;width:46%;text-align:left;font-weight:600}
#credits .end{font-size:22px;color:#c9a24a;margin-top:90px}
#credits .skip{position:absolute;right:26px;bottom:20px;font-size:13px;color:#7b848d}
`;
    document.head.appendChild(s);
  }
  G.css = sagaCss;

  // the things Akio asked of him that a clean man refused
  G.DIRTY = ["did_favor", "hirata_signed", "shredded", "lied_press", "gave_bonuses", "sold_bad", "shimizu_fired", "took_bribe", "bribed_inspector", "stole_bribe", "perjured", "took_offer", "haggled_offer", "sold_list", "betrayed_nakano", "voted_layoffs"];
  // ---- the end ---------------------------------------------------------------------------------------------------------------------------
  // the friend he confided in (mission 46, "Old Friends"); Ishikawa if he never chose
  G.friend = () => { const f = st().flags; return f.friend_mori ? "Mori" : f.friend_nakano ? "Nakano" : "Ishikawa"; };
  G.finale = function () {
    const g = st(), high = G.honor() >= 0, f = g.flags, friend = G.friend();
    const boardCast = { Reiko: { look: "woman_04", female: true }, Kuroda: { look: "salaryman_10" }, Board: { look: "salaryman_06" }, "Gondō": { look: "salaryman_07" } };
    boardCast[friend] = { look: Q.looks[friend] };
    storyClearBlips(); storyClearObjective();
    if (high) {
      const ledger = f.ledger_copied || f.shred_copied || f.whistle_backed;
      Q.office([
        [0, "", "The 58th floor. An extraordinary meeting of the board of SOTI Corporation."],
        [0, "Akio", "Extraordinary. I'll tell you what's extraordinary. Being dragged out of my own lunch by my own board. Who called this?"],
        [0, "Reiko", "I did, Akio. Sit down."],
        [0, "Akio", "I don't sit when I'm told, Auntie. I'm the president. My grandfather's name is on the building."],
        [0, "Reiko", "My father's name. And he would not know this company. " + (ledger ? "The board has the second ledger. Every envelope. Every 'consulting fee' to the Kurogane-kai." : "The auditors have finished. The prosecutors have not.")],
        [0, "Akio", "Lies. Who gave you— YOU. The boy from the rice fields. I MADE you. I picked you off a bench at the station!"],
        [0, "Seiko", "You did, Sotiyama-sama. And you taught me the rule. Be where you said you would be. I said I would look after this company."],
        [0, "Kuroda", "The motion is the removal of the president. Those in favour."],
        [0, "Board", "In favour."], [0, "Reiko", "In favour."],
        [0, "Kuroda", "Carried. Sotiyama-san, security will see you to your car."],
        [0, "Akio", "You'll come crawling. All of you. Nobody runs this place but a Sotiyama!"],
        [0, "Reiko", "One will be watching. But the chair goes to the one person in this building the third floor would follow anywhere. Seiko-san. Will you take it?"],
        [0, "Seiko", "…I'll do my best. For every floor."]
      ], { cast: boardCast, card: "The Chair" }, () => {
        Q.office([
          [0, "", "The same office. A different morning."],
          [0, "Gondō", "Shachō. …It still sounds wrong. Nineteen— twenty years, and I'm bowing to the boy by the window."],
          [0, "Seiko", "You don't have to bow, Gondō-san."],
          [0, "Gondō", "I know. That's why I'm doing it."],
          [0, friend, "The whole floor's outside, Seiko. I mean, Shachō. They want to see the office. Mori's already measuring it for a ping-pong table."],
          [0, "Reiko", "Your pay is the president's pay. Your hours are everyone's hours. And Seiko-san: nine o'clock."],
          [0, "Seiko", "I won't be late."],
          [0, "", "(One day, this office will be mine. — It is.)"]
        ], { cast: Object.assign({ Mori: { look: "officelady_01", female: true }, Nakano: { look: "officelady_03", female: true }, Fujita: { look: "salaryman_05" } }, boardCast), noAkio: true, behindDesk: true, allBow: true, card: "The Top Floor" }, () => G.ended("president"));
      });
    } else {
      Q.office([
        [0, "", "The 58th floor. Seiko has waited weeks for this meeting. He has the votes. He counted them himself."],
        [0, "Seiko", "Before the agenda. I move that the board has no confidence in the president."],
        [0, "Akio", "Hah. HAH! There it is. Say it again, boy, I want to enjoy it."],
        [0, "Seiko", "The directors have seen what I've seen. Kuroda-san. The shareholders' proxies. It's done, Sotiyama-san."],
        [0, "Akio", "'Sotiyama-san'. Not 'sama' any more. Kuroda, how did you vote in the car park last night?"],
        [0, "Kuroda", "…I voted the way I was paid to, Akio-sama. As always."],
        [0, "Akio", "You bought them with promises. I bought them with money. And you learned every trick from me, so I knew which ones you'd use."],
        [0, "Akio", "But I didn't have to guess. Did I? Come in. Don't be shy. Tell him what you told me."],
        [0, friend, "…I'm sorry, Seiko. He already knew half of it. And I have a family. You stopped caring who got hurt a long time ago. I just… picked a side."],
        [0, "Seiko", "I told you because you were my friend."],
        [0, friend, "I was. That's why I waited until last night."],
        [0, "Akio", "My grandfather had one rule. I have another. Nobody takes what's mine. You're fired. The car, the keys, the pass. Security!"],
        [0, "", "The lift takes fifty-eight floors to reach the street. It has never felt slower."]
      ], { cast: boardCast, card: "The Chair" }, () => G.ended("fired"));
    }
  };
  G.ended = function (how) {
    const g = st(), s = C.state();
    g.ending = how; g.endedDay = s.day;
    if (Q.active()) Q.abort(true);
    story.m = 51;
    C.emit("mission:passed", { mission: 50, title: STORY_TITLES[50], ending: how });
    C.emit("ending", { ending: how, honor: G.honor() });
    if (how === "president") {
      G.promote("president");
      G.achieve("ending_top");
      if (!G.DIRTY.some(k => g.flags[k])) G.achieve("clean_hands");
      purse.yen += 5000000;
    } else {
      G.achieve("ending_box");
      g.rank = "floor_manager"; story.flags.sotiRank = "outsider";
      try { if (window.standing) { standing.respect.setRank("outsider", { label: "Fired from SOTI" }); standing.earn(-10, "Fired from SOTI"); } } catch (e) { /* optional */ }
      if (s.car) { s.carGone = true; }
      purse.yen += 180000;                                             // a month in lieu, counted out by security
    }
    G.credits(how, () => {
      if (how === "president") {
        storyPassed("The Chair", "Ending 1 of 2 · The Top Floor · President of SOTI");
        s.day++; C.goHome();
        setTimeout(() => notify("Messages", "Sotiyama Reiko", "Enjoy tonight. The work starts at nine. The top office is yours: use the door of the tower.", 10), 6500);
      } else {
        storyPassed("The Chair", "Ending 2 of 2 · The Cardboard Box · Fired");
        story.step = "free"; storyClearBlips();
        setTimeout(() => { storyObjective("Tōkonto is still out there", "No desk, no pass, a month's pay. There are other ways up in this city."); notify("Messages", "SOTI Human Resources", "Your employment ended today. Your flat is paid to the end of the lease. Please do not approach the tower.", 10); }, 6500);
      }
      saveGame("Saved.", true);
    });
  };
  G.CREDITS = [
    ["h2", "Cast"],
    ["p", "Seiko Shigu", "the salary man"], ["p", "Akio Sotiyama", "president of SOTI"], ["p", "Reiko Sotiyama", "chair of the board"], ["p", "Tetsuo Gondō", "nineteen years on the third floor"],
    ["p", "Haruka Mori", "customer care"], ["p", "Ken Ishikawa", "customer care"], ["p", "Yui Nakano", "customer care"], ["p", "Daisuke Fujita", "customer care"],
    ["p", "Kurogane Jūzō", "oyabun of the Kurogane-kai"], ["p", "Father, Mother and Sister Shigu", "Mizuho"],
    ["h2", "A game by"], ["h3", "Duncan Height · DHInc / Ink Games"],
    ["h2", "Story, world and missions"], ["p", "Tōkonto, Mizuho, Shiokawa, Nagisa,", "Hamaura, Isobe, Kaido and Tomari"],
    ["h2", "Engine"], ["h3", "Shigoto Engine"], ["p", "Rendering", "Three.js"], ["p", "Physics", "Rapier"], ["p", "Voices", "Kokoro"],
    ["h2", "People of Tōkonto"], ["p", "Microsoft Rocketbox", "avatar library"],
    ["h2", "Thank you"], ["p", "to the artists and open-source contributors", "named under Credits & licenses"],
  ];
  G.credits = function (how, then) {
    sagaCss();
    let el = document.getElementById("credits"); if (el) el.remove();
    el = document.createElement("div"); el.id = "credits";
    const row = r => r[0] === "p" ? "<p><i>" + r[1] + "</i><b>" + r[2] + "</b></p>" : "<" + r[0] + ">" + r[1] + "</" + r[0] + ">";
    el.innerHTML = "<div class='roll'><h1>SALARY MAN</h1><h2>" + (how === "president" ? "Ending 1 of 2" : "Ending 2 of 2") + "</h2><h3>" + (how === "president" ? "The Top Floor" : "The Cardboard Box") + "</h3>" +
      G.CREDITS.map(row).join("") + "<div class='end'>" + (how === "president" ? "“Be where you said you would be.”" : "“Nobody takes what's mine.”") + "</div><h2>Tōkonto goes on</h2><p style='margin-bottom:60vh'>&nbsp;</p></div><div class='skip'>hold Enter / A to skip</div>";
    document.body.appendChild(el);
    const roll = el.querySelector(".roll");
    G.creditsOn = { el: el, roll: roll, t: 0, hold: 0, then: then, len: 0, t0: performance.now() };
    requestAnimationFrame(() => { el.classList.add("on"); G.creditsOn.len = roll.offsetHeight + window.innerHeight; creditsFrame(); });
  };
  const keysDown = {};
  window.addEventListener("keydown", e => { keysDown[e.code] = true; if (G.creditsOn) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  window.addEventListener("keyup", e => { keysDown[e.code] = false; }, true);
  function creditsFrame() {
    const c = G.creditsOn; if (!c) return;
    const now = performance.now(), dt = Math.min(0.1, (now - (c.last || now)) / 1000); c.last = now;
    c.t += dt;
    let held = keysDown.Enter || keysDown.Space;
    try { const gp = navigator.getGamepads && Array.from(navigator.getGamepads()).find(x => x); if (gp && gp.buttons[0] && gp.buttons[0].pressed) held = true; } catch (e) { /* no pad */ }
    c.hold = held && c.t > 2 ? c.hold + dt : 0;
    const y = c.t * 62;
    c.roll.style.transform = "translateY(" + (-y) + "px)";
    if (y > c.len || c.hold > 1.1 || G.creditsSkip) { G.creditsSkip = false; G.creditsOn = null; c.el.classList.remove("on"); setTimeout(() => c.el.remove(), 1700); const f = c.then; setTimeout(() => f && f(), 900); return; }
    requestAnimationFrame(creditsFrame);
  }

  // ---- after the story -----------------------------------------------------------------------------------------------------------------------
  // President: the door of the tower takes him to the top office. One decision a day, everyone bows, and the president's pay.
  const DECISIONS = [
    { say: "Shachō, the third floor is asking for a fourth break in the afternoon. Ten minutes.", who: "Gondō", opts: [
      { t: "Give them fifteen.", honor: 2, respect: 1, score: 1, reply: "Gondō: “Fifteen. …They'll name a meeting room after you.”" },
      { t: "Ten is fine.", score: 1 }, { t: "No. We have targets.", honor: -2, respect: -1, score: -1 }] },
    { say: "Konto Mobile is offering to sell us their customer list. Quietly. It's not strictly theirs to sell.", who: "Kuroda", opts: [
      { t: "No. And tell the regulator who offered.", honor: 4, respect: 2, score: 1 }, { t: "No. Leave it there.", honor: 1, score: 1 },
      { t: "Buy it. Nobody will know.", honor: -6, yen: 400000, score: -1, why: "Bought a stolen customer list" }] },
    { say: "A call got through to this office somehow. An old lady. Her phone has gone quiet.", who: "Secretary", opts: [
      { t: "Put her through. I know this one.", honor: 3, respect: 2, score: 2, reply: "Kobayashi-san: “Oh! It beeped! Are you the nice young man? You sound important now.”" },
      { t: "Send it down to the third floor.", score: 0 }] },
    { say: "The Kurogane-kai's 'consulting' invoice has arrived again. Same amount as under your predecessor.", who: "Kuroda", opts: [
      { t: "Send it to the prosecutor's office instead.", honor: 5, respect: 2, score: 2, why: "Refused to pay the Kurogane-kai" },
      { t: "Pay it. I don't want trouble.", honor: -5, score: -1, why: "Paid protection" }] },
    { say: "Bonus season. The board suggests the usual: large at the top, small at the bottom.", who: "Reiko", opts: [
      { t: "Turn it upside down this year.", honor: 4, respect: 3, score: 2, reply: "Reiko: “My father would have liked you.”" },
      { t: "The usual.", score: 0 }, { t: "Larger at the top. I earned it.", honor: -4, yen: 2000000, score: -1, why: "Took the staff's bonus" }] }
  ];
  G.presidentDay = function () {
    const g = st(), s = C.state();
    if (g.ending !== "president") return false;
    story.step = "c:field";
    const d = DECISIONS[(s.day + (g.decN = (g.decN || 0) + 1)) % DECISIONS.length];
    const cast = {}; ["Gondō", "Kuroda", "Secretary", "Reiko"].forEach(k => { cast[k] = { look: Q.looks[k] }; });
    Q.run({ id: "president", title: "SOTI", steps: [
      { office: [[0, "", "58F. The president's office."], [0, "Everyone", "Good morning, Shachō!"], [0, d.who, d.say]], cast: cast, noAkio: true, behindDesk: true, allBow: true, stay: true, card: "President of SOTI" },
      { talk: { start: { who: d.who, say: d.say, opts: d.opts.map(o => Object.assign({ end: true }, o)) } }, head: "The president's desk" },
      { leave: true }
    ] }, ctx => G.fieldDone({}, ctx));
    return true;
  };
  // fired: the tower's door is shut to him
  const doorWas = window.storySotiDoor;
  if (typeof doorWas === "function") window.storySotiDoor = function () {
    if (story.m === 51 && st().ending === "fired") { say("Security: “Not you. Sotiyama-sama's orders. Move along.”", 4); return; }
    return doorWas.apply(this, arguments);
  };
  // the company car goes back when he is fired
  const startDayWas = C.startDay;
  C.startDay = function () { if (story.m === 51 && st().ending === "fired") { story.step = "free"; return; } return startDayWas.apply(this, arguments); };

  // ---- console ---------------------------------------------------------------------------------------------------------------------------
  G.status = () => ({ m: story.m, title: STORY_TITLES[story.m], rank: G.rankId(), wage: G.wage(), reputation: G.reputation(), state: st(), friend: G.friend() });
  console.log("[Saga] " + G.version + " · missions 8–50, the ladder and the two endings");
})();
