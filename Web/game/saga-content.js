// Missions 8 to 30 of Seiko's story: floor manager, section chief, department head. (31 to 50 are in saga-content2.js.)
//
// Lines in scenes are [0, "Speaker", "text"] (the 0 is where a time goes; quest.js times them). In a conversation each answer can carry
// score (how the day goes), honor, respect, favor (Akio's goodwill), reiko (Reiko Sotiyama's trust), yen, flag, reply, next or end.
(function () {
  "use strict";
  const C = window.career, G = C && C.saga, O = C && C.office; if (!G || !O) return;

  // ---- new problems for the third floor ---------------------------------------------------------------------------------------------------
  Object.assign(O.incidents, {
    collection: { who: ["fujita", "kimura"], title: "The birthday collection", brief: "An envelope is going round for the president's birthday. It is not optional", pool: true,
      nodes: { start: { lines: [["Fujita", "Five thousand yen each. For Akio-sama's birthday. 'Voluntary.' Kimura's keeping a list of who hasn't paid."], ["Kimura", "I was TOLD to keep a list. By the 58th floor."]], opts: [
        { t: "Put me down for the whole floor's share. Nobody else pays, and the list goes in the shredder.", tone: "kind", morale: 0.14, end: true, good: true, reply: "Fujita: “…You can't afford that.” You can't. You do it anyway." },
        { t: "It's five thousand yen. Pay it and keep your heads down.", tone: "yield", morale: -0.1, end: true, good: false },
        { t: "Kimura, add a column for 'paid in spirit'. Everyone's in it.", tone: "tactful", morale: 0.08, end: true, good: true, reply: "Kimura, typing: “Paid… in… spirit. He never reads past the total anyway.”" }] } } },
    kneel: { who: ["sato"], title: "The lobby", brief: "Satō was made to kneel in the lobby for a typo in the president's name", pool: true,
      nodes: { start: { lines: [["Satō", "One letter. 'Sotiyana.' He had me kneel by the lifts for an hour so everyone coming in could see. My knees are fine. It's the rest of me."]], opts: [
        { t: "That should never have happened, and I should have been down there with you. Take the afternoon. I'll proofread anything that goes upstairs from now on.", tone: "kind", morale: 0.12, end: true, good: true },
        { t: "Spell it right next time.", tone: "harsh", morale: -0.16, end: true, good: false },
        { t: "I'll raise it with HR.", tone: "honest", morale: 0.03, end: true, good: true, reply: "Satō: “HR is his cousin.” It is. You raise it anyway." }] } } },
    cameras: { who: ["mori", "gondo"], title: "Eyes in the ceiling", brief: "Cameras have appeared above every desk overnight", pool: false,
      nodes: { start: { lines: [["Mori", "There's a camera over my desk. Over every desk. One's pointed at the kettle. Who is watching a kettle?"], ["Gondō", "Orders from 58. 'Productivity observation.' I didn't ask. One doesn't."]], opts: [
        { t: "They stay off until the staff have it in writing what's recorded and who sees it. I'll sign for the delay myself.", tone: "honest", morale: 0.12, gondo: -0.06, end: true, good: true },
        { t: "Smile for the president, everyone.", tone: "yield", morale: -0.14, gondo: 0.06, end: true, good: false },
        { t: "Gondō-san, the one over your office door is pointed at your putting mat.", tone: "tactful", morale: 0.08, gondo: 0.02, end: true, good: true, reply: "Gondō, pale: “…Perhaps a review of the policy is in order.”" }] } } },
    nephew: { who: ["ogawa"], title: "The nephew", brief: "The president's nephew has joined the floor. He has not answered a call yet", pool: true,
      nodes: { start: { lines: [["Ogawa", "Sotiyama Junior has been here two weeks. He's taken no calls, eaten my lunch twice, and yesterday he asked me to fetch his dry cleaning."]], opts: [
        { t: "He takes calls like everyone else, starting now, and I'll sit with him for the first ten. If his uncle objects, his uncle can call me.", tone: "honest", morale: 0.12, end: true, good: true },
        { t: "Fetch the dry cleaning, Ogawa. It's not worth it.", tone: "yield", morale: -0.14, end: true, good: false },
        { t: "I'll put him on the Raku-Raku queue. Grandmothers will sort him out.", tone: "tactful", morale: 0.1, end: true, good: true, reply: "By four o'clock Kobayashi-san has taught him to make tea. He seems happier." }] } } },
    names: { who: ["nakano", "ishikawa"], title: "A list of names", brief: "Staff are talking about a union. The 58th floor wants to know who", pool: false,
      nodes: { start: { lines: [["Nakano", "We're not plotting anything. We want the overtime paid and the kneeling stopped. That's all a union is."], ["Ishikawa", "They say there's a memo. That he wants names. Seiko… did he ask you?"]], opts: [
        { t: "He asked. He's getting a blank page. And if you meet, meet off the premises, where I can't be asked what I saw.", tone: "honest", morale: 0.14, end: true, good: true },
        { t: "He asked. I haven't decided.", tone: "blunt", morale: -0.12, end: true, good: false },
        { t: "Nobody asked me anything.", tone: "dishonest", morale: 0.02, end: true, good: false }] } } },
    recall: { who: ["takeda", "gondo"], title: "The script about the batteries", brief: "A new script: tell callers the So24 batteries are safe. They are not", pool: false,
      nodes: { start: { lines: [["Takeda", "The new script says 'there is no fault with the So24 battery'. I've had three callers today whose phones caught fire."], ["Gondō", "It came from the president's office. We read what we're given."]], opts: [
        { t: "Nobody on this floor tells a customer a burning phone is safe. Tell them to stop charging it and take it to a store. I'll answer for the script.", tone: "honest", morale: 0.14, gondo: -0.1, end: true, good: true },
        { t: "Read the script.", tone: "yield", morale: -0.18, gondo: 0.08, end: true, good: false },
        { t: "Read the script, then 'personally recommend' they stop charging it. Word for word, we've said nothing wrong.", tone: "tactful", morale: 0.06, gondo: 0.04, end: true, good: true }] } } },
    layoff: { who: ["kato", "inoue", "hayashi"], title: "Three desks", brief: "The board wants three people gone from 3F by Friday. You choose", pool: false,
      nodes: {
        start: { lines: [["Katō", "We've all heard. Three of us. Just tell us how you're choosing."], ["Inoue", "I've got a mortgage."], ["Hayashi", "I've got the best first-call rate on the floor. That won't matter, will it."]], opts: [
          { t: "Nobody goes. I'll take the saving out of the managers' pay, mine first, and I'll make the board say no to my face.", tone: "kind", morale: 0.18, end: true, good: true, reply: "It costs you a fifth of your pay. Nobody clears a desk." },
          { t: "Last in, first out. Katō, Inoue, Hayashi. I'm sorry.", tone: "blunt", morale: -0.2, end: true, good: false },
          { t: "Three volunteers for a paid transfer to the Hamaura branch. Same salary, sea view.", tone: "tactful", morale: 0.1, end: true, good: true, reply: "Katō's hand goes up before you finish the sentence. He has always wanted a boat." }] } } },
    strike: { who: ["mori", "nakano", "fujita"], title: "Headsets down", brief: "The third floor has stopped answering the phones", pool: false,
      nodes: {
        start: { lines: [["Mori", "Headsets are down, Seiko. All of them. Not at you. At him."], ["Nakano", "Paid overtime, no more kneeling, and the battery script withdrawn. In writing."], ["Fujita", "You sat here. You know we're right."]], opts: [
          { t: "You are right. Give me the list. I'll take it upstairs as mine, with my name on it, and I'll stand here till it's signed.", tone: "honest", morale: 0.2, end: true, good: true },
          { t: "Back on the phones or I start taking names.", tone: "harsh", morale: -0.25, end: true, good: false },
          { t: "Give me till five. Take the calls from the hospital line only until then.", tone: "tactful", morale: 0.1, end: true, good: true }] } } }
  });
  // what kind of manager he is counts for his name too
  const TONE = { honest: 2, kind: 1.5, tactful: 0.8, dishonest: -3, harsh: -2, yield: -1 };
  C.on("floor:choice", d => { if (story.m >= 8 && TONE[d.tone]) quest.honor(TONE[d.tone], d.tone === "honest" ? "Told the truth at work" : d.tone === "kind" ? "Looked after your people" : d.tone === "tactful" ? "Kept the peace" : d.tone === "dishonest" ? "Lied at work" : d.tone === "harsh" ? "Bullied your staff" : "Looked the other way"); });

  const done = (good, ok, bad) => ctx => ctx.rating >= 4 ? good : ctx.rating >= 3 ? ok : bad;

  // ==== FLOOR MANAGER (to mission 10) =========================================================================================================
  G.add(8, { title: "Every Day at SOTI", kind: "floor", random: 3 });

  G.add(9, { title: "The Envelope", kind: "field",
    brief: [
      [0, "", "The 58th floor wants the new floor manager. Nobody on the third floor will meet his eye."],
      [0, "Akio", "There he is. The talker. Come in, don't hover, hovering makes me hungry."],
      [0, "Akio", "You're management now. Management does things for me. Small things. This is an envelope."],
      [0, "Akio", "A man in a white suit is waiting outside Kanchogai Station. You give it to him. You don't open it. You don't ask."],
      [0, "Seiko", "May I ask what—"],
      [0, "Akio", "No. That was the asking. You just did it. Go, before noon, he doesn't like to wait and neither do I."]
    ],
    people: { man: { name: "The man in the white suit", look: "salaryman_10" } },
    steps: [
      { go: { station: "Kanchogai" }, who: "man", text: "Take the envelope to the man at Kanchogai Station", hint: "Before noon. It is thick, and it is sealed with tape.", by: 12 * 60 },
      { talk: "man", who: "man" }
    ],
    talks: { man: {
      start: { who: "The man in the white suit", say: "You're Sotiyama's new boy. You're early. I like early. You have something for me.", opts: [
        { t: "Hand it over, sealed. “From Sotiyama-sama.”", score: 1, favor: 1, next: "after" },
        { t: "“What is it for?”", score: 0, honor: 1, reply: "He smiles with half his mouth. “Consulting.”", next: "ask" },
        { t: "Turn away and feel the envelope first. It's cash. A lot of it.", score: -1, honor: -2, flag: "peeked", why: "Went through the boss's envelope", next: "after" }] },
      ask: { who: "The man in the white suit", say: "The Kurogane-kai advises SOTI on… neighbourhood relations. Every month. Now. The envelope.", opts: [
        { t: "Hand it over.", score: 1, favor: 1, next: "after" },
        { t: "“I'd like a receipt.”", score: 1, honor: 2, flag: "receipt", reply: "He laughs for a long time. Then he writes one, on the back of a pachinko flyer, and signs it: Kuroda.", next: "after" }] },
      after: { who: "The man in the white suit", say: "Tell the big man the family sends its regards. And you, talker: if the tower ever stops suiting you, there's a mahjong parlour in Kurotani that's always hiring.", opts: [
        { t: "“I have a job.”", end: true }, { t: "“…Kurotani. I'll remember.”", flag: "kurotani_tip", end: true }] }
    } },
    debrief: ctx => [
      [0, "Akio", ctx.late ? "After noon. He rang me. I had to apologise. ME. Do you know what that costs?" : "He rang. He says you're polite. I pay for polite."],
      ctx.flags.receipt ? [0, "Akio", "And you asked the Kurogane-kai for a RECEIPT. Hah! …Give it here. No. Keep it. Burn it."] : [0, "Akio", "You didn't open it. I'd know. Good. There'll be more envelopes."],
      [0, "Seiko", "(Consulting. Every month.)"]
    ] });

  G.add(10, { title: "The Numbers", kind: "meeting", promote: "section_chief",
    brief: [
      [0, "", "Quarter end. The third floor's numbers go to the 58th, and the man who carries them is not Gondō."],
      [0, "Akio", "Customer Care. The floor that costs me money to be shouted at. Gondō usually brings me a graph that goes up. Does yours go up?"],
      [0, "Gondō", "If I may, Akio-sama, the graph was a joint—"],
      [0, "Akio", "Was I looking at you, Gondō?"]
    ],
    cast: { "Gondō": {} },
    talks: { meeting: {
      start: { who: "Akio", say: "Well? Complaints. Are they up or down. And don't say 'it's complicated', my doctor says that.", opts: [
        { t: "“Complaints are down a fifth. Calls are longer, because the floor is fixing things the first time. Those are Hayashi's and Nakano's ideas, and Gondō-san kept the floor running while we tried them.”", score: 2, honor: 3, respect: 2, next: "two", why: "Gave the credit where it was due" },
        { t: "“Down a fifth, Sotiyama-sama. I reorganised the floor.”", score: 1, honor: -2, favor: 1, next: "two", why: "Took the credit" },
        { t: "“Up, slightly. The So24 battery calls. I'd rather you heard it from me.”", score: 1, honor: 3, favor: -1, flag: "told_battery", next: "two", why: "Told the boss the truth" }] },
      two: { who: "Akio", say: "Hm. And what does it cost me? Everything costs me. What do you want.", opts: [
        { t: "“Headsets that work, and the overtime paid. That's all.”", score: 1, honor: 2, respect: 1, end: true, reply: "Akio: “He wants HEADSETS. Gondō, in nineteen years you never once asked me for anything.” Gondō: “…I didn't know one could.”" },
        { t: "“Nothing, Sotiyama-sama. The floor is grateful for what it has.”", score: 0, favor: 2, end: true },
        { t: "“A bigger title would help me get things done.”", score: 0, favor: 1, respect: -1, end: true, reply: "Akio laughs until the desk shakes. “He ASKS. I like it when they ask.”" }] }
    } },
    promo: [
      [0, "Akio", "Gondō. How long have you been head of that floor?"], [0, "Gondō", "Nineteen years and seven months, Akio-sama."],
      [0, "Akio", "And in nineteen years the graph never went down. Him, six months."],
      [0, "Akio", "Section chief. The boy. Gondō reports to him now. Don't look at me like that, Gondō, you keep your office."],
      [0, "Seiko", "Sotiyama-sama, Gondō-san has—"], [0, "Akio", "I didn't ask. Nobody listens. Section chief. Out, both of you, I have a lunch."],
      [0, "Gondō", "(in the lift) …Kachō. Congratulations. I mean it. Mostly."]
    ], promoCast: { "Gondō": {} } });

  // ==== SECTION CHIEF (11 to 20) ===============================================================================================================
  G.add(11, { title: "The New Section", kind: "floor", incidents: ["cameras", "collection"], random: 1 });

  G.add(12, { title: "The Golf Bag", kind: "field",
    brief: [
      [0, "Akio", "Section chief. You drive. I've seen the company car, it's still in one piece, so you drive well enough."],
      [0, "Akio", "My clubs are at the garage in town. The man there re-grips them. They are worth more than you. Bring them to the house in Wakabadai by two."],
      [0, "Seiko", "The Kustoms garage? Sotiyama-sama, I'm due on the floor at—"],
      [0, "Akio", "The floor will be there. My tee time will not. Two o'clock. And tell the garage to put it on SOTI's account. Everything goes on SOTI's account."]
    ],
    people: { mech: { name: "The mechanic", look: "man_03", business: false }, house: { name: "Sotiyama's housekeeper", look: "woman_05", female: true, business: false } },
    steps: [
      { go: { shop: "kustoms" }, who: "mech", text: "Collect the president's golf clubs from the garage", hint: "Take the company car. They are worth more than you." },
      { talk: "mech", who: "mech" },
      { go: { ward: "Wakabadai" }, who: "house", text: "Deliver the clubs to the Sotiyama house in Wakabadai by 14:00", hint: "The big houses on the hill, east of the centre.", by: 14 * 60 },
      { talk: "house", who: "house" }
    ],
    talks: {
      mech: { start: { who: "The mechanic", say: "Sotiyama's clubs. Done. That's ¥86,000 for the grips. And he's owed me for the last three sets, and the Bentley, since March. 'On account.' I've got a kid starting school.", opts: [
        { t: "“Write out everything he owes you. I'll walk it into Accounts myself and stand there until it's paid.”", score: 1, honor: 3, respect: 1, flag: "garage_paid", why: "Got a tradesman paid", end: true },
        { t: "Pay the ¥86,000 out of your own pocket.", need: 86000, score: 1, honor: 4, why: "Paid the boss's debt yourself", end: true, reply: "The mechanic: “That's not your debt, son.” He takes it anyway. He needs it." },
        { t: "“On account, he said.” Take the bag.", score: 0, honor: -2, favor: 1, why: "Left a tradesman unpaid", end: true }] } },
      house: { start: { who: "The housekeeper", say: "Oh, the clubs. He's already left, in the other car, with other clubs. He has eleven sets. He forgets. Would you like some barley tea? You look like someone who's had a morning.", opts: [
        { t: "“Thank you. …Does he always do this?”", score: 1, reply: "“Since he was a boy. His grandfather used to say: that one will eat the company.” She pours the tea.", flag: "housekeeper", end: true },
        { t: "“No, thank you. I should get back.”", score: 1, end: true }] } }
    },
    debrief: ctx => [
      [0, "Akio", ctx.late ? "Two o'clock, I said. I played with RENTED clubs. Like a tourist." : "The clubs. Yes. I used the other ones."],
      ctx.flags.garage_paid ? [0, "Akio", "And Accounts tells me you made them pay the garage. With my money. Who told you to pay people?"] : [0, "Akio", "You did as you were told. That's all a section chief is. A bigger errand boy."],
      [0, "Seiko", "(Eleven sets.)"]
    ] });

  G.add(13, { title: "Store Visit", kind: "field",
    brief: [
      [0, "Akio", "The Dokoto store that sells my phones. The manager there has sent four letters about the So24. Four. To ME."],
      [0, "Akio", "Go and make him stop writing. I don't care how. Smile at him. You're good at the smiling."],
      [0, "Seiko", "What do the letters say, Sotiyama-sama?"], [0, "Akio", "I don't read letters. That's what you're for."]
    ],
    people: { mgr: { name: "Store manager Ōnishi", look: "salaryman_09" } },
    steps: [
      { go: { shop: "dokoto" }, who: "mgr", text: "Visit the Dokoto store and see its manager", hint: "The electronics store. He has written four letters." },
      { talk: "mgr", who: "mgr" }
    ],
    talks: { mgr: {
      start: { who: "Ōnishi", say: "Four letters and they send a man in a suit. Fine. Look at this box. Returns. All So24. All swollen batteries. One of them went up in a child's schoolbag last week.", opts: [
        { t: "“Show me. All of it. I'm going to photograph every one and take it back with me.”", score: 1, honor: 3, flag: "battery_photos", why: "Took the evidence seriously", next: "two" },
        { t: "“Head office says there's no fault with the battery.”", score: -1, honor: -3, why: "Repeated the company line", next: "two" },
        { t: "“How many is 'all'?”", score: 1, next: "two", reply: "“Forty-one. This month. One store.”" }] },
      two: { who: "Ōnishi", say: "I'm taking them off the shelf tomorrow unless somebody tells me not to in writing. And then I'm writing to the newspaper.", opts: [
        { t: "“Take them off the shelf today. I'll put my own name on the instruction. And hold the newspaper a week: let me try to get you a recall.”", score: 2, honor: 4, respect: 2, reiko: 1, flag: "store_pulled", why: "Pulled a dangerous phone from sale", end: true },
        { t: "“Keep selling. There's a discount in it for the store: ten percent, from my budget.”", score: 0, honor: -5, favor: 2, why: "Paid a store to keep selling a dangerous phone", end: true },
        { t: "“I can't tell you what to do. But I know what I'd do if it were my shop.”", score: 1, honor: 1, end: true }] }
    } },
    debrief: ctx => [
      ctx.flags.store_pulled ? [0, "Akio", "He took my phones off his shelves. On YOUR signature. I sent you to stop the letters, not start a fire!"] : [0, "Akio", "No fifth letter. Good. See? Smiling."],
      ctx.flags.store_pulled ? [0, "Seiko", "The fire had already started, Sotiyama-sama. In a schoolbag."] : [0, "Seiko", "Hai."],
      [0, "Akio", "Careful, section chief. I promote fast. I demote faster."]
    ] });

  G.add(14, { title: "Recall", kind: "floor", incidents: ["recall", "kneel"], random: 1 });

  G.add(15, { title: "The Supplier", kind: "field",
    brief: [
      [0, "Akio", "Batteries. Everyone's whining about batteries. The supplier's in Shiokawa. He says the cheap cells were MY idea."],
      [0, "Akio", "They were. They were a brilliant idea. They saved four hundred yen a phone."],
      [0, "Akio", "Go down there. Make him sign that the fault was in his factory. He'll want something. Give him the new contract. Don't come back without ink."]
    ],
    people: { sup: { name: "Hirata, of Hirata Denchi", look: "salaryman_06" } },
    steps: [
      { go: { city: "Shiokawa" }, who: "sup", text: "Go to Shiokawa and meet the battery supplier", hint: "South-west down the coast. It's a long way: the car, or the train from Tōkonto Central." },
      { talk: "sup", who: "sup" }
    ],
    talks: { sup: {
      start: { who: "Hirata", say: "Thirty years I've made cells for SOTI. Your president rang me himself: thinner separator, no test cycle, four hundred yen off. I said they'd swell. I have it in an email. Now he wants me to sign that it was my factory?", opts: [
        { t: "“Don't sign it. Send me a copy of that email, and keep the original somewhere he can't reach.”", score: 1, honor: 5, reiko: 2, flag: "hirata_email", why: "Protected a supplier from taking the blame", next: "two" },
        { t: "“Sign, and the new three-year contract is yours. Refuse, and SOTI finds another supplier by Monday.”", score: 1, honor: -6, favor: 3, flag: "hirata_signed", why: "Forced a supplier to take the blame", next: "two" },
        { t: "“What would it take for this to go away for both of you?”", score: 0, next: "bribe" }] },
      bribe: { who: "Hirata", say: "For me? …Two hundred thousand, in your pocket, and you tell him I wouldn't see you. I've done it before with his other errand boys.", opts: [
        { t: "Take the money.", yen: 200000, score: -1, honor: -8, flag: "took_bribe", why: "Took a bribe", next: "two" },
        { t: "“Keep your money. Keep your email safer.”", score: 1, honor: 4, flag: "hirata_email", why: "Refused a bribe", next: "two" }] },
      two: { who: "Hirata", say: "You're not like the others he sends. They don't last, the ones like you. Or they end up running the place. One or the other.", opts: [{ t: "“We'll see which.”", end: true }] }
    } },
    debrief: ctx => [
      ctx.flags.hirata_signed ? [0, "Akio", "Ink! Look at that. His own signature. I knew you had teeth under the smile."] : [0, "Akio", "No signature. You went to Shiokawa and came back with sea air."],
      ctx.flags.hirata_signed ? [0, "Seiko", "(He'll lose the factory for that.)"] : [0, "Seiko", "He has your email, Sotiyama-sama. He wasn't going to sign anything."],
      [0, "Akio", ctx.flags.hirata_signed ? "Go and eat something. On SOTI." : "…Email. Who keeps emails. Get out."]
    ] });

  G.add(16, { title: "Karōshi Watch", kind: "floor", incidents: ["nephew"], random: 2 });

  G.add(17, { title: "The Boss Eats", kind: "field",
    brief: [
      [0, "Akio", "I am surrounded by people who bring me sandwiches. From a SHOP."],
      [0, "Akio", "There is a sushi-ya. A real one. The old man there cuts the tuna the way my grandfather liked. The big set, the one that isn't on the menu. Tell him it's for me."],
      [0, "Akio", "Back here by half past twelve, section chief. I get difficult after half past twelve."]
    ],
    cast: { Mori: {} },
    people: { chef: { name: "The old sushi chef", look: "man_05", business: false } },
    steps: [
      { go: { shop: "sushiya" }, who: "chef", text: "Fetch the president's lunch from the sushi-ya", hint: "The real one, not the conveyor. Back by 12:30." },
      { talk: "chef", who: "chef" },
      { go: "soti", text: "Get the president's lunch back to SOTI Tower by 12:30", hint: "He gets difficult after half past twelve.", by: 12 * 60 + 30 },
      { office: [[0, "Akio", "Finally. Put it there. Mori! You. Yes, you. Why is there a customer complaint with my name spelled wrong in it?"],
        [0, "Mori", "I— it was the customer who wrote it, Akio-sama, I only forwarded—"],
        [0, "Akio", "Then you forwarded an insult. Stand there while I eat. Don't move. I want to look at someone who makes mistakes."]], cast: { Mori: {} }, stay: true },
      { talk: "mori", head: "The 58th floor" },
      { leave: true }
    ],
    noReturn: true,
    talks: {
      chef: { start: { who: "The old chef", say: "For Sotiyama. The grandson. …His grandfather sat at that end of the counter every Friday for forty years and paid before he ate. This one sends boys, and a bill to an office. It will be ready when it's ready.", opts: [
        { t: "Bow, and wait. “Take the time it needs.”", score: 1, honor: 1, respect: 1, end: true, reply: "He works a little faster for that. Not much." },
        { t: "Pay for it yourself, in cash, before he starts.", need: 24000, score: 1, honor: 3, respect: 2, why: "Paid the old way", end: true, reply: "The old chef looks at the money, then at you. “Hm. Somebody raised you.”" },
        { t: "“He gets difficult after half past twelve.”", score: 0, end: true, reply: "“So did his father. Sit.”" }] } },
      mori: { start: { who: "Akio", say: "(eating) You're still here, section chief. Something to say? Say it. She's one of yours.", opts: [
        { t: "“She forwarded a complaint, which is her job. If someone has to stand there while you eat, Sotiyama-sama, I'll do it. Mori-san, back to your desk.”", score: 2, honor: 5, respect: 3, favor: -2, flag: "stood_for_mori", why: "Stood up for Mori", end: true, reply: "Nobody breathes. Akio chews. “…The tuna's good. You may both go.”" },
        { t: "Say nothing. Stand beside her until he has finished.", score: 1, honor: 2, respect: 1, end: true, reply: "Forty minutes. Mori's hand finds your sleeve, once, in the lift." },
        { t: "“An insult is an insult, Mori. Be more careful.”", score: 0, honor: -4, favor: 2, respect: -2, flag: "left_mori", why: "Let Mori be humiliated", end: true }] } }
    } });

  G.add(18, { title: "Union Whisper", kind: "floor", incidents: ["names"], random: 2 });

  G.add(19, { title: "The Driver", kind: "field",
    brief: [
      [0, "Akio", "My driver has had a heart attack. Selfish. Tonight I have a dinner. You have a licence and a quiet mouth."],
      [0, "Akio", "You drive me to an izakaya. You wait outside. You see who I eat with and you forget his face before he's sat down."],
      [0, "Seiko", "Who are you eating with, Sotiyama-sama?"],
      [0, "Akio", "My oldest friend. Kurogane Jūzō. We were at school together. He went into one family business. I went into another."]
    ],
    people: { oyabun: { name: "Kurogane Jūzō", look: "salaryman_03", h: 1.02 } },
    steps: [
      { go: { venue: "izakaya" }, who: "oyabun", text: "Drive the president to his dinner", hint: "An izakaya under the tracks. Wait outside. Forget the face." },
      { fn: (ctx, next) => { advanceGameMinutes(150); next(); } },
      { talk: "oyabun", who: "oyabun" }
    ],
    talks: { oyabun: {
      start: { who: "Kurogane Jūzō", say: "You're the one who asked my man Kuroda for a receipt? No? Then you're the other one. Akio's asleep in the back of my car, he'll be sent home. Sit. A driver hears things. What did you hear tonight?", opts: [
        { t: "“Nothing. I was outside.”", score: 1, favor: 1, next: "two" },
        { t: "“Enough to know SOTI pays you every month, and that the batteries came up.”", score: 1, honor: 2, respect: 2, flag: "oyabun_respect", next: "two", reply: "He nods slowly. “An honest answer. Stupid, and honest. I see why he keeps you.”" },
        { t: "“What's it worth to you that I heard nothing?”", score: -1, honor: -4, yen: 100000, flag: "oyabun_paid", why: "Sold your silence to the Kurogane-kai", next: "two" }] },
      two: { who: "Kurogane Jūzō", say: "Akio thinks I work for him. I let him. One day that tower will chew you up, salary man. When it does: the shrine at Mitamamori, the mahjong parlour in Kurotani, the fish market at Higashiura. My people are in all three. Bring them something that shows you looked for us.", opts: [
        { t: "“I'm a company man.”", end: true, reply: "“So was I. Different company.”" },
        { t: "“I'll remember the three places.”", flag: "kurotani_tip", end: true }] }
    } },
    debrief: () => [
      [0, "Akio", "My head. What did I say last night? Never mind. You drove, you waited, you saw nothing."],
      [0, "Seiko", "Nothing, Sotiyama-sama."], [0, "Akio", "Good. That's worth more than the graph."]
    ] });

  G.add(20, { title: "Department Head", kind: "meeting", promote: "dept_head",
    brief: [
      [0, "", "A year at SOTI. The battery calls have not stopped. The envelopes have not stopped. The department needs a head."],
      [0, "Akio", "My department heads are old men who agree with me. I have enough of those. I need one the staff actually listen to."],
      [0, "Akio", "But a department head of mine is family. Family is loyal. So I'm going to ask you one thing, and you're going to answer it standing up."]
    ],
    talks: { meeting: {
      start: { who: "Akio", say: "If my aunt Reiko, who sits on my board and counts my spoons, asked you what goes on up here. The envelopes. The batteries. What would you tell her?", opts: [
        { t: "“The truth, Sotiyama-sama. I'd rather you knew that now than found out later.”", score: 2, honor: 5, favor: -2, reiko: 2, flag: "said_truth", why: "Told the boss you would not lie for him", next: "two" },
        { t: "“Whatever you'd want her told.”", score: 1, honor: -5, favor: 3, flag: "said_loyal", why: "Promised to lie for the boss", next: "two" },
        { t: "“That I run a department, and departments don't have opinions.”", score: 1, favor: 1, next: "two" }] },
      two: { who: "Akio", say: "Hah. …I've sacked men for a better answer and promoted them for a worse one. You know why I'm doing it anyway? Because the third floor would walk out if I didn't. I can count, too.", opts: [{ t: "“Thank you, Sotiyama-sama.”", end: true }, { t: "“They'd walk out for less than that.”", respect: 1, favor: -1, end: true }] }
    } },
    promo: [
      [0, "Akio", "Department head. Customer Operations. Three floors, four hundred people, and Gondō, who comes with the furniture."],
      [0, "Akio", "You get the office with a door. You get the dinners. You get this."],
      [0, "Akio", "A watch. A real one. A department head of mine doesn't tell the time off his telephone."],
      [0, "Seiko", "I… thank you, Sotiyama-sama."],
      [0, "Akio", "Don't thank me. Owe me. It's better."]
    ] });

  // ==== DEPARTMENT HEAD (21 to 30) ============================================================================================================
  G.add(21, { title: "Budget Day", kind: "meeting",
    brief: [
      [0, "", "A department head has a budget. Akio Sotiyama has views on budgets."],
      [0, "Akio", "Four hundred million yen. Yours to spend. On paper."],
      [0, "Akio", "My 'executive hospitality' line is short this year. Sixty million short. I'm told your department has sixty million marked 'staff bonuses'. Funny, that."]
    ],
    talks: { meeting: {
      start: { who: "Akio", say: "So. Do the bonuses go to four hundred people who answer telephones, or to hospitality? Think about who signs your budget.", opts: [
        { t: "“The bonuses are the staff's. If hospitality is short, I'll find you sixty million in the consultants we don't need. Starting with 'neighbourhood relations'.”", score: 2, honor: 5, respect: 3, favor: -3, reiko: 2, flag: "kept_bonuses", why: "Protected the staff bonuses", end: true, reply: "Akio stops chewing. “…You don't touch that line. Keep your bonuses. Get out.”" },
        { t: "“Split it. Half each.”", score: 1, honor: -1, favor: 1, end: true, reply: "Four hundred people get half a bonus and never know why." },
        { t: "“Hospitality, Sotiyama-sama. The staff will understand.”", score: 0, honor: -6, favor: 4, respect: -3, flag: "gave_bonuses", why: "Gave the staff's bonuses to the boss", end: true, reply: "They do not understand." }] }
    } } });

  G.add(22, { title: "Hamaura Branch", kind: "field",
    brief: [
      [0, "Akio", "Hamaura. The branch up the coast. The manager there has stopped sending me his numbers and started sending me his opinions."],
      [0, "Akio", "Go and sack him. Bring me his keys. It's a nice drive, take the afternoon."],
      [0, "Seiko", "What are his opinions, Sotiyama-sama?"], [0, "Akio", "That I'm a crook. Imagine. In writing."]
    ],
    people: { mgr: { name: "Branch manager Shimizu", look: "salaryman_08" } },
    steps: [
      { go: { city: "Hamaura" }, who: "mgr", text: "Drive to Hamaura and deal with the branch manager", hint: "North up the coast road, the best part of an hour. Bring back his keys." },
      { talk: "mgr", who: "mgr" }
    ],
    talks: { mgr: {
      start: { who: "Shimizu", say: "They finally sent someone. I've run this branch twenty-two years. He's been billing 'regional consulting' through my books to a company with no office. I wouldn't sign the quarter. That's my opinion. You're here for my keys.", opts: [
        { t: "“I'm here for the invoices. Every one you wouldn't sign. Keep the keys: as far as Tōkonto knows, I found your books in order.”", score: 2, honor: 6, reiko: 3, respect: 2, flag: "shimizu_kept", why: "Protected an honest manager", end: true, reply: "Shimizu: “You know what he'll do when he finds out.” You have a fair idea." },
        { t: "“Sign the quarter and this visit never happened.”", score: 1, honor: -3, favor: 2, end: true, reply: "He signs. He doesn't look at you while he does it." },
        { t: "“The keys, Shimizu-san. I'm sorry. Twenty-two years deserves better than me.”", score: 1, honor: -5, favor: 3, flag: "shimizu_fired", why: "Sacked an honest man", end: true }] }
    } },
    debrief: ctx => [
      ctx.flags.shimizu_fired ? [0, "Akio", "Keys! On my desk! Twenty-two years and he went quietly? They always go quietly."] : [0, "Akio", "No keys. I asked for one thing. KEYS."],
      ctx.flags.shimizu_kept ? [0, "Seiko", "I went through his books, Sotiyama-sama. They're the cleanest in the company. Sacking him would bring the auditors."] : [0, "Seiko", "Hai, Sotiyama-sama."],
      [0, "Akio", ctx.flags.shimizu_kept ? "…Auditors. Fine. He stays. You're getting clever. I don't like clever." : "Good. Now the next one."]
    ] });

  G.add(23, { title: "The Journalist", kind: "field",
    brief: [
      [0, "Akio", "There's a woman from Konto Broadcasting. She's been ringing the stores about batteries. She wants 'a SOTI spokesman'."],
      [0, "Akio", "You're the spokesman. You have the face for it. Go to the Broadcasting Centre and tell her there is no story."],
      [0, "Akio", "And find out who's been talking to her. I want a name."]
    ],
    people: { rep: { name: "Aizawa Nao, KBC News", look: "officelady_04", female: true } },
    steps: [
      { go: { site: "Konto Broadcasting Centre" }, who: "rep", text: "Meet the reporter at the Konto Broadcasting Centre", hint: "South-west of the centre, by the water." },
      { talk: "rep", who: "rep" }
    ],
    talks: { rep: {
      start: { who: "Aizawa", say: "SOTI sent a department head. I must be close. Forty-one swollen batteries at one store, a burned schoolbag, and a script telling your call centre to say it's safe. On the record: is the So24 safe?", opts: [
        { t: "“On the record: stop charging it and take it back to the store. I can't say more than that, and I'll probably be sacked for saying that much.”", score: 2, honor: 7, reiko: 3, respect: 3, favor: -4, flag: "told_press", why: "Told the public the truth about the battery", next: "two" },
        { t: "“SOTI's products meet every safety standard. There is no story.”", score: 1, honor: -6, favor: 3, flag: "lied_press", why: "Lied to the press", next: "two" },
        { t: "“Off the record?”", score: 0, next: "off" }] },
      off: { who: "Aizawa", say: "Off the record, then. But I'll find somebody who'll say it on.", opts: [
        { t: "“Off the record: it isn't safe. Talk to the supplier in Shiokawa. He keeps his emails.”", score: 1, honor: 4, reiko: 2, flag: "leaked_press", why: "Pointed the press at the truth", next: "two" },
        { t: "“Off the record: run it and SOTI's lawyers will bury your station.”", score: 0, honor: -7, favor: 3, why: "Threatened a reporter", next: "two" }] },
      two: { who: "Aizawa", say: "He'll have asked you who my source is.", opts: [
        { t: "“He did. I'm not going to ask you.”", score: 1, honor: 2, end: true },
        { t: "“He did. Who is it?”", score: 0, honor: -2, end: true, reply: "“Nice try.” She almost smiles." }] }
    } },
    debrief: ctx => [
      ctx.flags.told_press ? [0, "Akio", "'STOP CHARGING IT.' On the six o'clock news! With your FACE! Do you know what my share price did?"] : ctx.flags.lied_press ? [0, "Akio", "'No story.' Word for word. I watched it twice. You lie beautifully, department head."] : [0, "Akio", "She ran nothing tonight. And the name? Who's her source?"],
      ctx.flags.told_press ? [0, "Seiko", "It did less than it will when one of them burns a house down, Sotiyama-sama."] : [0, "Seiko", "She wouldn't give a name."],
      ctx.flags.told_press ? [0, "Akio", "…My aunt rang to say she was proud. Of YOU. That is the only reason you still have a door on your office."] : [0, "Akio", "Hm. Keep looking."]
    ] });

  G.add(24, { title: "Headhunted", kind: "field",
    brief: [
      [0, "", "No call from the 58th floor today. A different call: a number he doesn't know, a voice that knows his salary."],
      [0, "Secretary", "Seiko-san? There's a gentleman from Konto Mobile on the line. He says it's personal. He says to meet him at the bar under the station."],
      [0, "Seiko", "Konto Mobile. Our competitor."], [0, "Secretary", "I didn't hear anything, Seiko-san. I never do."]
    ],
    cast: { Secretary: {} }, noAkio: true,
    people: { hh: { name: "Sakamoto, Konto Mobile", look: "salaryman_01" } },
    steps: [
      { go: { venue: "bar" }, who: "hh", text: "Meet the man from Konto Mobile", hint: "The bar under the station. It's personal." },
      { talk: "hh", who: "hh" }
    ],
    noReturn: true,
    talks: { hh: {
      start: { who: "Sakamoto", say: "Double the salary. A flat in the centre, not the end of the line. And no fat man throwing lunch at you. All I need to open the door is a small thing: SOTI's customer list. A file. You have the access.", opts: [
        { t: "“No. And if you ask anyone on my floors the same question, I'll hear about it.”", score: 2, honor: 5, respect: 2, flag: "refused_konto", why: "Refused to sell out SOTI's customers", end: true, reply: "Sakamoto shrugs. “The offer for you stands without the file. Think about it when he next makes you carry his golf clubs.”" },
        { t: "“The job, without the file?”", score: 1, honor: 1, flag: "konto_open", end: true, reply: "“…Maybe. Ring me when you've had enough.” He leaves his card on the bar." },
        { t: "“Three million, cash, and you get the list.”", yen: 3000000, score: -2, honor: -15, flag: "sold_list", why: "Sold four million customers' details", end: true, reply: "It takes eleven minutes on your laptop. Four million names. You don't sleep well." }] }
    } } });

  G.add(25, { title: "The Shredder", kind: "meeting",
    brief: [
      [0, "", "The auditors come on Monday. On Friday night, the 58th floor is very busy."],
      [0, "Akio", "Boxes. Those boxes. Hospitality, consulting, 'regional'. They go in the shredder tonight and you're going to feed it."],
      [0, "Akio", "I'd do it myself but I don't bend."]
    ],
    talks: { meeting: {
      start: { who: "Akio", say: "Don't read them. Shred them. And if anyone asks: there was a flood. Well? The machine's warm.", opts: [
        { t: "Feed the shredder slowly, and put one page in ten inside your jacket.", score: 1, honor: 4, reiko: 3, flag: "shred_copied", why: "Saved the evidence", end: true, reply: "By midnight your jacket doesn't close. Akio is asleep in his chair. He never bends, and he never checks." },
        { t: "“No, Sotiyama-sama. That's destroying evidence. I won't, and I'd advise you not to.”", score: 1, honor: 6, favor: -4, reiko: 1, flag: "shred_refused", why: "Refused to destroy evidence", end: true, reply: "“Then get OUT and send me someone who will!” Gondō is summoned. Gondō shreds. Gondō cries a little." },
        { t: "Shred it all.", score: 1, honor: -8, favor: 4, flag: "shredded", why: "Destroyed evidence for the boss", end: true, reply: "It takes four hours. The machine jams twice. There was a flood." }] }
    } } });

  G.add(26, { title: "Client Dinner", kind: "field",
    brief: [
      [0, "Akio", "The railway. NHRail. They buy ten thousand handsets a year for their staff. Their purchasing man is in town."],
      [0, "Akio", "Feed him. Water him. He likes to be told he's funny. Bring me the contract with his thumb on it."]
    ],
    people: { cl: { name: "Ōtsuka, NHRail purchasing", look: "salaryman_08" } },
    steps: [
      { go: { venue: "izakaya" }, who: "cl", text: "Take the NHRail buyer to dinner", hint: "The izakaya. He likes to be told he's funny." },
      { talk: "cl", who: "cl" }
    ],
    noReturn: true,
    talks: { cl: {
      start: { who: "Ōtsuka", say: "Kanpai! Now. Between us. Ten thousand So24s for my station staff. Your president says the battery talk is all rumour. I've got platform staff who carry these in their breast pockets twelve hours a day. Is it rumour?", opts: [
        { t: "“It isn't rumour. Don't buy the So24. Take the So22 at the same price: older, duller, and it has never hurt anyone. I'll eat the difference.”", score: 2, honor: 6, respect: 3, reiko: 2, flag: "honest_client", why: "Sold the client the safe phone", end: true, reply: "Ōtsuka puts his glass down. “…Nobody from SOTI has ever told me not to buy something. Fifteen thousand So22s. And you're funny.”" },
        { t: "“All rumour. Ten thousand, and I'll throw in the cases.”", score: 1, honor: -8, favor: 3, flag: "sold_bad", why: "Sold a dangerous phone to the railway", end: true },
        { t: "Pour him another and change the subject.", score: 0, honor: -1, end: true, reply: "He signs for ten thousand at midnight. You remember the breast pockets all the way home." }] }
    } } });

  G.add(27, { title: "Nagisa Launch", kind: "field",
    brief: [
      [0, "Akio", "The So25. New phone, new battery, we say. The launch is in Nagisa, on the seafront, in front of cameras."],
      [0, "Akio", "I was going to do the speech. My doctor says I'm not to stand that long. You do it. Read what's on the card."],
      [0, "Seiko", "What's on the card, Sotiyama-sama?"], [0, "Akio", "That the So24 was perfect and this one's better."]
    ],
    people: { stage: { name: "The stage manager", look: "officelady_03", female: true } },
    steps: [
      { go: { city: "Nagisa" }, who: "stage", text: "Get to the So25 launch in Nagisa by 15:00", hint: "East along the coast. The stage is by the station.", by: 15 * 60 },
      { talk: "stage", who: "stage" }
    ],
    talks: { stage: {
      start: { who: "The stage manager", say: "You're the speaker? Thank goodness. Two minutes. The demo phone on the podium has been charging all morning and it's… quite warm. Do we go ahead?", opts: [
        { t: "“Unplug it and get it off the stage. I'll hold up my own phone.”", score: 1, honor: 2, next: "speech" },
        { t: "“Leave it. It'll be fine for ten minutes.”", score: -1, honor: -2, flag: "hot_demo", next: "speech" }] },
      speech: { lines: [["", "Two hundred people, six cameras, the sea behind. The card says the So24 was perfect."]], opts: [
        { t: "Put the card down. “The last phone had a fault, and people were hurt. If you own a So24, bring it to any store and we will replace it today. That's what a new phone should start with.”", score: 2, honor: 8, respect: 4, reiko: 3, favor: -4, flag: "announced_recall", why: "Announced the recall yourself", end: true, reply: "A silence. Then one person claps. Then all of them. Your phone starts ringing: 58F." },
        { t: "Read the card.", score: 1, honor: -5, favor: 3, flag: "read_card", why: "Told two hundred people the So24 was perfect", end: true },
        { t: "Talk about the So25 and never mention the So24 at all.", score: 1, favor: 1, end: true }] }
    } },
    debrief: ctx => [
      ctx.flags.announced_recall ? [0, "Akio", "A RECALL. You announced a RECALL. From a stage I PAID for. That's eleven billion yen, department head. ELEVEN."] : [0, "Akio", "I watched. Not bad. You stand well."],
      ctx.flags.announced_recall ? [0, "Reiko", "And the board has voted to honour it, Akio. Unanimously. Sit down before you fall down."] : [0, "Akio", ctx.flags.hot_demo ? "The demo phone melted the podium after you left. Nobody filmed it. We were lucky." : "The card was good, wasn't it. I wrote the card."],
      ctx.flags.announced_recall ? [0, "Reiko", "Seiko-san. We haven't met properly. We spoke once, on the telephone. You were kinder than you needed to be."] : [0, "Seiko", "Hai, Sotiyama-sama."]
    ], debriefCast: { Reiko: { female: true } } });

  G.add(28, { title: "Gondō's Mistake", kind: "floor", incidents: ["gondomistake"], random: 2 });
  O.incidents.gondomistake = { who: ["gondo", "takeda"], title: "Eleven thousand refunds", brief: "Gondō has refunded eleven thousand customers twice. He is under his desk", pool: false,
    nodes: { start: { lines: [["Takeda", "He pressed 'process batch' twice. Eleven thousand refunds, paid double. Two hundred million yen. He's… under the desk, Seiko-san."], ["Gondō", "(from under the desk) Twenty years. Twenty years and one button."]], opts: [
      { t: "“Come out, Gondō-san. It went out on my authorisation: I'm the department head, it's my batch. We'll write to the customers together and most will pay it back.”", tone: "kind", morale: 0.16, gondo: 0.3, end: true, good: true, reply: "Gondō comes out from under the desk. He bows so low his glasses fall off. Most of them do pay it back." },
      { t: "“This goes upstairs with your name on it, Gondō-san. I'm sorry.”", tone: "blunt", morale: -0.08, gondo: -0.3, end: true, good: false, reply: "Akio makes him kneel in the lobby for a day. Twenty years." },
      { t: "“Takeda, reverse the batch before the banks close. Nobody upstairs needs to hear about a thing that didn't happen.”", tone: "dishonest", morale: 0.06, gondo: 0.2, end: true, good: true }] } } };

  G.add(29, { title: "The Founder's Day", kind: "field",
    brief: [
      [0, "Akio", "Founder's Day. Every year the family goes to the shrine at Mitamamori and bows to my grandfather's stone. Every year my aunt makes a speech about 'values'."],
      [0, "Akio", "My knees won't do the steps. You go for the company. Bow, carry the sake, come back. Don't talk to her."]
    ],
    people: { reiko: { name: "Sotiyama Reiko", look: "woman_04", female: true, business: false } },
    steps: [
      { go: { ward: "Mitamamori" }, who: "reiko", text: "Represent SOTI at the founder's memorial in Mitamamori", hint: "The shrine quarter, far to the west. Don't talk to her." },
      { talk: "reiko", who: "reiko" }
    ],
    noReturn: true,
    talks: { reiko: {
      start: { who: "Reiko", say: "He sent you because of the steps. He told you not to talk to me. …My father built a radio in a shed and sold it door to door. He bowed to every customer. Tell me, department head: what is my nephew doing to his company?", opts: [
        { t: "Tell her everything. The envelopes, the batteries, the shredder.", score: 2, honor: 5, reiko: 5, flag: "told_reiko", why: "Told the chair of the board the truth", next: "two" },
        { t: "“I'm only here to carry the sake, Sotiyama-san.”", score: 1, reiko: -1, next: "two" },
        { t: "“Nothing that isn't making all of us rich.”", score: 0, honor: -4, reiko: -4, favor: 2, why: "Covered for the boss to his family", next: "two" }] },
      two: { who: "Reiko", say: "I hold thirty-one percent. He holds thirty-four. The rest is pension funds and a bank in Nagisa. One day there will be a vote. On that day I will need someone the staff would follow. Pour the sake, Seiko-san. For my father.", opts: [{ t: "Pour, and bow to the stone.", honor: 1, end: true }] }
    } } });

  G.add(30, { title: "Director", kind: "meeting", promote: "director",
    brief: [
      [0, "", "Two years. The recall cost eleven billion yen and saved the company's name. Nobody on the 58th floor will say which mattered more."],
      [0, "Akio", "The board wants you on it. MY board. My aunt proposed it and the bank seconded it and I was eating."],
      [0, "Akio", "So you'll be a director. But before you sit at my table you'll hear how the table works."]
    ],
    talks: { meeting: {
      start: { who: "Akio", say: "At that table everybody votes the way I look at them. You'll vote the way I look at you. Say 'yes, Sotiyama-sama'.", opts: [
        { t: "“I'll vote for the company, Sotiyama-sama. Most days that will be the same thing.”", score: 2, honor: 4, respect: 2, reiko: 1, favor: -2, end: true, why: "Kept your vote your own", reply: "“…Most days.” He writes something on his blotter. It may be your name." },
        { t: "“Yes, Sotiyama-sama.”", score: 1, honor: -4, favor: 3, flag: "sworn_vote", why: "Promised the boss your vote", end: true },
        { t: "“What's a vote worth, at that table?”", score: 0, honor: -3, favor: 2, yen: 500000, why: "Sold your first vote", end: true, reply: "He laughs and opens a drawer. “Now you're a director.”" }] }
    } },
    promo: [
      [0, "Akio", "Director. Torishimariyaku. A seat, a car that someone else drives, a number I'm not going to say out loud."],
      [0, "Reiko", "The board welcomes you, Seiko-san. Some of us more than others."],
      [0, "Akio", "Auntie. You're in my office."], [0, "Reiko", "I'm in my father's office, Akio. You've only put on weight in it."],
      [0, "Seiko", "(A director. The 58th floor. And the two of them, and me in the middle.)"]
    ], promoCast: { Reiko: { female: true } } });
})();
