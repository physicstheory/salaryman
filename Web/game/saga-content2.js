// Missions 31 to 50 of Seiko's story: director, managing director, and The Chair. (8 to 30 are in saga-content.js.)
(function () {
  "use strict";
  const C = window.career, G = C && C.saga, O = C && C.office; if (!G || !O) return;

  // ==== DIRECTOR (31 to 40) ====================================================================================================================
  G.add(31, { title: "The Board", kind: "meeting",
    brief: [
      [0, "", "His first board meeting. Nine chairs, one of them reinforced."],
      [0, "Kuroda", "Item one. The recall cost eleven billion. The president proposes to recover it from headcount. Six hundred positions."],
      [0, "Akio", "Six hundred. Mostly Customer Operations. They answer telephones, a machine can answer telephones."],
      [0, "Reiko", "The newest director ran that department. Perhaps he has a view."]
    ],
    cast: { Kuroda: {}, Reiko: { female: true }, Board: {} }, head: "The board of SOTI",
    talks: { meeting: {
      start: { who: "Kuroda", say: "Director? The proposal is six hundred positions. Your vote, and anything you wish minuted.", opts: [
        { t: "“Against. Minute this: the recall was caused on this floor, not the third. Recover it from the dividend and the hospitality line, and I'll find the rest without a single redundancy.”", score: 2, honor: 6, respect: 4, reiko: 3, favor: -4, flag: "voted_no_layoffs", why: "Voted against six hundred redundancies", end: true, reply: "Four hands against. Five for. But the bank's man didn't raise his at all, and Akio noticed." },
        { t: "“Abstain. I'm new to the table.”", score: 0, honor: -1, end: true, reply: "Carried, five to three. Reiko does not look at you." },
        { t: "“In favour.”", score: 1, honor: -8, favor: 4, respect: -4, flag: "voted_layoffs", why: "Voted for six hundred redundancies", end: true, reply: "Carried, six to three. Akio winks at you. It is the worst thing that has happened to you all year." }] }
    } } });

  G.add(32, { title: "Layoffs", kind: "floor", incidents: ["layoff"], random: 2 });

  G.add(33, { title: "Kaido Factory", kind: "field",
    brief: [
      [0, "Akio", "The factory at Kaido makes the So25. The safety inspector is due and the foreman says line three isn't 'ready'."],
      [0, "Akio", "Go north. Take this. It's a fruit basket. For the inspector. Heavy, isn't it."],
      [0, "Seiko", "There's no fruit in it, Sotiyama-sama."], [0, "Akio", "He doesn't like fruit."]
    ],
    people: { fore: { name: "Foreman Ueda", look: "man_04", business: false }, insp: { name: "Inspector Hasegawa", look: "salaryman_01" } },
    steps: [
      { go: { city: "Kaido" }, who: "fore", text: "Drive to the Kaido factory", hint: "A long way north, inland. Take the expressway. The basket is on the back seat." },
      { talk: "fore", who: "fore" },
      { go: { shop: "eleven", near: { city: "Kaido" }, label: "Kaido" }, who: "insp", text: "Find the safety inspector", hint: "He is by the station, checking his watch.", radius: 8 },
      { talk: "insp", who: "insp" }
    ],
    talks: {
      fore: { start: { who: "Ueda", say: "Line three's welding cell has no guard and no extraction. Two of mine are off with their lungs. I told the tower. The tower sent a fruit basket. For him, not for them.", opts: [
        { t: "“Shut line three. Today, on my authority as a director. Send me the bill for the guard and the names of the two who are off.”", score: 2, honor: 6, respect: 3, reiko: 2, flag: "line_shut", why: "Shut an unsafe production line", end: true },
        { t: "“Keep it running till the inspector's gone. Then we'll talk.”", score: 0, honor: -5, favor: 2, why: "Kept an unsafe line running", end: true },
        { t: "“What would it cost to fix it properly?”", score: 1, honor: 1, end: true, reply: "“Nine million yen. About one of his dinners.”" }] } },
      insp: { start: { who: "Hasegawa", say: "SOTI's director. I usually get the basket from a driver. Line three, I'm told, is 'fine'. Is that what's in the basket?", opts: [
        { t: "“The basket's going back to Tōkonto unopened. Line three isn't fine. I've shut it. Write what you see.”", score: 2, honor: 7, respect: 3, flag: "no_bribe", why: "Refused to bribe a safety inspector", end: true, reply: "Hasegawa: “Thirty years in this job. First time.” He puts his pen away and takes out a better one." },
        { t: "Hand him the basket.", score: 1, honor: -9, favor: 4, flag: "bribed_inspector", why: "Bribed a safety inspector", end: true },
        { t: "Keep the basket yourself and tell him line three is fine.", yen: 2000000, score: -2, honor: -14, flag: "stole_bribe", why: "Stole the bribe and lied about safety", end: true }] } }
    },
    debrief: ctx => [
      ctx.flags.no_bribe ? [0, "Akio", "My basket. Back on my desk. And line three SHUT. Do you know what a day of line three is worth?"] : [0, "Akio", "The inspector passed it. Good basket."],
      ctx.flags.no_bribe ? [0, "Seiko", "Less than two men's lungs, Sotiyama-sama. I've sent you the bill for the guard. It's nine million."] : [0, "Seiko", "Hai."],
      [0, "Akio", ctx.flags.no_bribe ? "You're spending my money like it's the staff's. …Pay it. And get out of my sight for a week." : "See? Everybody likes fruit."]
    ] });

  G.add(34, { title: "The Whistle", kind: "field",
    brief: [
      [0, "", "No summons today. A note under his keyboard, in handwriting he knows from the third floor."],
      [0, "Secretary", "Director? Someone left this for you. I didn't read it. It says Gakushicho Station, after dark, come alone."],
      [0, "Seiko", "Nakano's handwriting."], [0, "Secretary", "I didn't see that either."]
    ],
    cast: { Secretary: {} }, noAkio: true,
    people: { nak: { name: "Nakano Yui", look: "officelady_03", female: true } },
    steps: [
      { fn: (ctx, next) => { if (gameMinutes() < 19 * 60) setGameTime(19 * 60 + 10); next(); } },
      { go: { station: "Gakushicho" }, who: "nak", text: "Meet Nakano at Gakushicho Station", hint: "After dark. Alone." },
      { talk: "nak", who: "nak" }
    ],
    noReturn: true,
    talks: { nak: {
      start: { who: "Nakano", say: "I moved to Accounts last year. There are two ledgers, Seiko. One for the auditors. One on a drive in his office safe: every envelope to the Kurogane-kai, eleven years of it. I photographed the index. If this comes out with my name on it I'll never work again.", opts: [
        { t: "“Then it comes out with mine on it. Give me the photographs. You were never here.”", score: 2, honor: 6, reiko: 3, flag: "whistle_backed", why: "Took the risk in a whistleblower's place", end: true, reply: "Nakano lets out a breath she seems to have been holding for a year. “You sat by the window. I knew you'd say that.”" },
        { t: "“Delete them, Nakano. For your own sake. He has people who do worse than sack.”", score: 1, honor: -2, end: true, reply: "She looks at you for a long moment. “…I thought you were different up there.” She doesn't delete them." },
        { t: "“Does he know you have them?” (He will by morning.)", score: 0, honor: -12, favor: 5, flag: "betrayed_nakano", why: "Betrayed a whistleblower to the boss", end: true }] }
    } } });

  G.add(35, { title: "Golden Week", kind: "field",
    brief: [
      [0, "Akio", "The executive retreat. Tomari. Hot springs, sake, and nobody leaves until I've won at mahjong."],
      [0, "Akio", "Directors come. That's you now. Bring cash. You're going to lose it to me, it's traditional."]
    ],
    people: { kur: { name: "Kuroda, finance director", look: "salaryman_10" } },
    steps: [
      { go: { city: "Tomari" }, who: "kur", text: "Join the executive retreat at Tomari", hint: "North-east, in the hills. Bring cash." },
      { talk: "kur", who: "kur" }
    ],
    noReturn: true,
    talks: { kur: {
      start: { who: "Kuroda", say: "He's in the bath. He'll be an hour. A word, director, between men who can read a balance sheet. He can't last. His heart, his aunt, the prosecutors. When he goes, somebody takes the chair. I'd back a man who remembered his friends.", opts: [
        { t: "“If he goes, it should be because the board removes him in daylight. I won't plot it in a bathhouse.”", score: 2, honor: 5, reiko: 1, flag: "refused_plot", why: "Refused to plot in the dark", next: "mah" },
        { t: "“I'm listening.”", score: 1, honor: -4, flag: "plot_kuroda", why: "Joined Kuroda's plot", next: "mah" },
        { t: "“He'd love to hear you said that.”", score: 0, honor: -3, favor: 2, why: "Held a colleague's words over him", next: "mah", reply: "Kuroda goes the colour of the tofu. “A joke. Obviously a joke.”" }] },
      mah: { lines: [["", "Midnight. The mahjong table. Akio is losing, which is not traditional, and everyone can see your winning hand."]], opts: [
        { t: "Win. Take the pot.", yen: 300000, score: 1, respect: 2, favor: -2, end: true, reply: "Akio stares at the tiles. Then at you. “…Nobody's done that in ten years. Deal again.”" },
        { t: "Throw the hand. Let him win.", yen: -100000, score: 1, favor: 3, honor: -1, end: true },
        { t: "Win, and put the pot in the staff welfare fund, in front of everyone.", score: 2, honor: 3, respect: 3, favor: -1, end: true, reply: "Akio, slowly: “Clap, all of you. He's making me look generous.”" }] }
    } } });

  G.add(36, { title: "Hostile Bid", kind: "meeting",
    brief: [
      [0, "Kuroda", "Konto Mobile has bid for the company. Nine hundred yen a share. The president's shares alone would make him the richest man in Tōkonto."],
      [0, "Akio", "And they'd close the tower in a year and keep the name. So what. It's my name. I'll sell it if I like."],
      [0, "Reiko", "It is my father's name. And twelve thousand people's wages."]
    ],
    cast: { Kuroda: {}, Reiko: { female: true }, Board: {} }, head: "The board of SOTI",
    talks: { meeting: {
      start: { who: "Kuroda", say: "The board must recommend for or against. Director?", opts: [
        { t: "“Against. The offer values the company at what it's worth with a broken name. Fix the name and it's worth twice that, to the people who work here as well as the people who own it.”", score: 2, honor: 5, respect: 3, reiko: 3, favor: -2, flag: "against_bid", why: "Voted to keep SOTI whole", end: true },
        { t: "“For. It's a good price.”", score: 1, honor: -6, favor: 3, respect: -3, flag: "for_bid", why: "Voted to sell twelve thousand jobs", end: true },
        { t: "“For, if the directors' share options vest on completion.”", yen: 1500000, score: 0, honor: -10, favor: 2, flag: "for_bid", why: "Voted to sell the company for your own options", end: true }] }
    } } });

  G.add(37, { title: "The Favour", kind: "field",
    brief: [
      [0, "Akio", "Jūzō's people are nervous. Prosecutors, newspapers. They want the year's 'consulting' in one go. Now. In cash."],
      [0, "Akio", "Forty million. It's in the bag. You take it to their office at the port, Higashiura, and you get it there with every note in it."],
      [0, "Akio", "I'm asking a director because a director has more to lose. Understand me?"]
    ],
    people: { kur: { name: "Kuroda of the Kurogane-kai", look: "salaryman_10" } },
    steps: [
      { go: { ward: "Higashiura" }, who: "kur", text: "Carry the bag to the Kurogane-kai at the port", hint: "Higashiura, the docks south of the centre. Forty million yen. Drive carefully." },
      { talk: "kur", who: "kur" }
    ],
    talks: { kur: {
      start: { who: "Kuroda", say: "The talker. A director now, and still carrying bags. Count it with me or trust me, your choice.", opts: [
        { t: "Hand over the bag, all of it.", score: 1, honor: -6, favor: 3, flag: "did_favor", why: "Carried forty million to the Kurogane-kai", next: "two" },
        { t: "“It isn't coming. I've driven it to the prosecutor's office instead. I came to tell you to your face.”", score: 1, honor: 9, respect: 4, reiko: 3, favor: -6, flag: "bag_to_prosecutor", why: "Took the boss's bribe to the prosecutors", next: "brave" },
        { t: "Hand over the bag, two million light.", yen: 2000000, score: -2, honor: -12, flag: "did_favor", why: "Skimmed the Kurogane-kai's money", next: "short" }] },
      two: { who: "Kuroda", say: "All there. The oyabun says you have steady hands. The offer from before still stands, salary man. Kurotani. The shrine. The fish market.", opts: [{ t: "Leave.", end: true }] },
      brave: { who: "Kuroda", say: "…You came here, alone, to say that. Either you're the bravest man in Tōkonto or the stupidest. The oyabun will want to know which. Go. While I'm still deciding.", opts: [{ t: "Go.", flag: "oyabun_respect", end: true }] },
      short: { who: "Kuroda", say: "Thirty-eight. …I'll tell the oyabun the fat man shorted us. You'd better hope he believes me. You owe me, talker.", opts: [{ t: "Leave, quickly.", flag: "owes_kuroda", end: true }] } }
    },
    debrief: ctx => [
      ctx.flags.bag_to_prosecutor ? [0, "Akio", "WHERE IS MY MONEY. Jūzō rang. The prosecutors rang. My AUNT rang!"] : [0, "Akio", "Delivered. Good. Now you're in it with the rest of us."],
      ctx.flags.bag_to_prosecutor ? [0, "Seiko", "It's in an evidence locker, Sotiyama-sama. With a statement. Mine."] : [0, "Seiko", "(In it with the rest of us.)"],
      [0, "Akio", ctx.flags.bag_to_prosecutor ? "I can't sack a director without a vote. I checked. …I'm going to get that vote." : "Sit down. Eat something. You've earned a lunch."]
    ] });

  G.add(38, { title: "Tea with Reiko", kind: "field",
    brief: [
      [0, "", "An invitation on thick paper, by hand. No company name on it anywhere."],
      [0, "Secretary", "From Sotiyama Reiko, director. Tea, at the castle gate, at three. She says to walk the last part. She says the president's driver reports where the cars go."]
    ],
    cast: { Secretary: {} }, noAkio: true,
    people: { reiko: { name: "Sotiyama Reiko", look: "woman_04", female: true, business: false } },
    steps: [
      { go: { castle: true }, who: "reiko", text: "Meet Reiko Sotiyama at the castle gate at 15:00", hint: "The old castle in the middle of the city. Walk the last part.", by: 15 * 60 + 5 },
      { talk: "reiko", who: "reiko" }
    ],
    noReturn: true,
    talks: { reiko: {
      start: { who: "Reiko", say: "My father brought me here as a girl and said: a company is a castle, and the walls are the people. Akio thinks the walls are his. I am going to call a vote to remove him. I need to know what I am putting in his place. Why do you want that office, Seiko-san?", opts: [
        { t: "“I used to want it because it was high up. Now I want it because I know what the third floor needs from whoever sits there.”", score: 2, honor: 4, reiko: 4, flag: "reiko_ally", why: "Gave Reiko an honest answer", next: "two" },
        { t: "“I've wanted it since the day he hired me. I've earned it.”", score: 1, reiko: 1, next: "two" },
        { t: "“Does it matter why, if I can deliver you the votes?”", score: 0, honor: -3, reiko: -3, why: "Treated the chair as a deal", next: "two" }] },
      two: { who: "Reiko", say: "Then I will tell you what my father told me. Whatever you have done to get this far, the staff already know. They always know. On the day, they will follow the man they know you to be. Not the one you say you are.", opts: [{ t: "“…I understand.”", end: true }] }
    } } });

  G.add(39, { title: "Year-End Party", kind: "field",
    brief: [
      [0, "Akio", "Bōnenkai. The whole company, one night, I sing, everybody claps."],
      [0, "Akio", "You organise it this year. Karaoke. Big room. And I want the third floor at the front where I can see who isn't clapping."]
    ],
    people: { mori: { name: "Mori Haruka", look: "officelady_01", female: true } },
    steps: [
      { fn: (ctx, next) => { if (gameMinutes() < 19 * 60) setGameTime(19 * 60 + 20); next(); } },
      { go: { venue: "karaoke" }, who: "mori", text: "Host the company's year-end party", hint: "The karaoke place under the station. The third floor at the front." },
      { talk: "mori", who: "mori" }
    ],
    noReturn: true,
    talks: { mori: {
      start: { lines: [["", "Eleven o'clock. Akio has the microphone and a bottle. He has stopped singing and started on the staff."], ["Akio", "Fujita! Stand up. Sing. No? Then take your tie off and bark. Bark for your president!"], ["Mori", "(to you) He's going to make him do it. In front of everyone. Seiko. You're a director."]], opts: [
        { t: "Take the microphone out of Akio's hand. “That's enough, Sotiyama-sama. I'll sing. Fujita, sit down.”", score: 2, honor: 7, respect: 5, favor: -4, flag: "stopped_party", why: "Stopped the boss humiliating your staff", end: true, reply: "You sing. Badly. Four hundred people clap like you've won a war. Akio is carried to his car, pointing at you." },
        { t: "Stand up and bark yourself, laughing, so it's a joke and not a punishment.", score: 1, honor: 3, respect: 2, favor: 1, end: true, reply: "The room laughs with you. Fujita mouths 'thank you'. Akio forgets what he was doing." },
        { t: "Look at your drink.", score: 0, honor: -6, respect: -4, flag: "watched_party", why: "Watched the boss humiliate your staff", end: true, reply: "Fujita barks. Nobody on the third floor looks at you for a week." }] }
    } } });

  G.add(40, { title: "Managing Director", kind: "meeting", promote: "md",
    brief: [
      [0, "", "Three years. The president's doctor has given orders. Somebody has to run the company from day to day."],
      [0, "Akio", "My heart. They want me in at eleven and out at three. Three! So I need a senmu. A second chair. Someone who does the work and brings me the paper."],
      [0, "Akio", "The board wants you. Even the ones I pay. That's how I know you're dangerous."]
    ],
    talks: { meeting: {
      start: { who: "Akio", say: "So here's how it goes. You run it. I own it. You sign what I say and you sit where I can see you. One word for me, senmu. What am I to you?", opts: [
        { t: "“The man who gave me a chance, Sotiyama-sama. And the man I'll tell to his face when he's wrong.”", score: 2, honor: 4, respect: 2, favor: -1, end: true, why: "Stayed straight with the boss" },
        { t: "“The boss.”", score: 1, favor: 3, end: true, reply: "“THAT'S the word.”" },
        { t: "“In the way.”", score: 1, honor: -2, favor: -5, respect: 1, flag: "said_in_the_way", end: true, reply: "A long silence. Then he laughs, and it isn't a nice laugh. “At last. An honest one. We'll see who moves.”" }] }
    } },
    promo: [
      [0, "Akio", "Managing director. The office next to mine. Thinner walls than you'd like."],
      [0, "Reiko", "And a gift from me, Seiko-san, not from the company. My father's watch has been in a drawer for thirty years. It should be on a wrist that's on time."],
      [0, "Akio", "You're giving him Grandfather's watch? I asked for that watch!"], [0, "Reiko", "You asked what it was worth, Akio. It isn't the same."],
      [0, "Seiko", "I'll look after it. I'll look after all of it."]
    ], promoCast: { Reiko: { female: true } } });

  // ==== MANAGING DIRECTOR (41 to 50) ===========================================================================================================
  G.add(41, { title: "Second Chair", kind: "meeting",
    brief: [
      [0, "", "The first morning the company is his to run. The president arrives at eleven. There are two hours."],
      [0, "Kuroda", "Senmu. The annual pay round is on your desk. The president's instruction is nothing for staff, eight percent for the board."],
      [0, "Gondō", "And the third floor have asked me to ask you, er, respectfully, as an old colleague, whether 'nothing' is really the number."]
    ],
    cast: { Kuroda: {}, "Gondō": {} }, noAkio: true, head: "The managing director's desk",
    talks: { meeting: {
      start: { who: "Kuroda", say: "It needs a signature before he's in at eleven, or he'll sign his own version.", opts: [
        { t: "Sign: four percent for all staff, nothing for the board, including you.", score: 2, honor: 6, respect: 4, reiko: 2, favor: -3, flag: "staff_raise", why: "Gave the raise to the staff", end: true, reply: "Gondō makes a noise like a kettle. Kuroda writes it down very slowly." },
        { t: "Sign: two percent for everyone.", score: 1, honor: 1, respect: 1, end: true },
        { t: "Sign the president's version.", score: 0, honor: -6, favor: 3, respect: -3, why: "Took a raise and gave the staff nothing", yen: 800000, end: true }] }
    } } });

  G.add(42, { title: "Shareholders", kind: "field",
    brief: [
      [0, "", "Reiko has thirty-one percent. Akio has thirty-four. The vote will turn on a bank in Nagisa and a pension fund in Shiokawa."],
      [0, "Reiko", "I cannot be seen asking them, Seiko-san. A managing director visiting his shareholders is only doing his job."],
      [0, "Reiko", "Tell them the truth about the company. If the truth does not win their proxies, we do not deserve them."]
    ],
    cast: { Reiko: { female: true } }, noAkio: true,
    people: { bank: { name: "Director Fukuda, Nagisa Bank", look: "salaryman_06" }, pen: { name: "Chairwoman Ōba, Fishermen's Pension Fund", look: "woman_06", female: true, business: false } },
    steps: [
      { go: { city: "Nagisa" }, who: "bank", text: "Visit the bank in Nagisa", hint: "East along the coast. They hold eighteen percent." },
      { talk: "bank", who: "bank" },
      { go: { city: "Shiokawa" }, who: "pen", text: "Visit the pension fund in Shiokawa", hint: "All the way back west and down the coast. They hold eleven." },
      { talk: "pen", who: "pen" }
    ],
    noReturn: true,
    talks: {
      bank: { start: { who: "Fukuda", say: "The bank has backed the Sotiyama family for sixty years. The president tells us everything is in hand. Should we believe him, managing director?", opts: [
        { t: "“No. Here is what the recall cost, why it happened, and what I'm doing so it can't happen again. Judge us on that.”", score: 2, honor: 5, reiko: 2, flag: "proxy_bank", why: "Won the bank with the truth", end: true, reply: "Fukuda reads all eleven pages. “The bank will vote its conscience. It has not been asked to for some time.”" },
        { t: "“Back the chair, and the bank's loans to SOTI are renewed at whatever rate you name.”", score: 1, honor: -6, flag: "proxy_bank_bought", why: "Bought the bank's vote", end: true },
        { t: "“Everything is in hand.”", score: 0, honor: -3, favor: 2, end: true }] } },
      pen: { start: { who: "Ōba", say: "My members gut fish for forty years and trust me with what's left. I bought SOTI because old Sotiyama bowed to my mother at her door. Don't give me numbers. Would you put your own father's pension in this company today?", opts: [
        { t: "“Not today. In a year, if the vote goes the right way, yes. My father grows rice in Mizuho. I'd tell him the same.”", score: 2, honor: 5, reiko: 2, flag: "proxy_pension", why: "Told a pension fund the truth", end: true, reply: "Ōba looks at you for a long time. “Mizuho rice. Hm. You have our proxy, rice boy. Don't make me come up there.”" },
        { t: "“Without hesitation.”", score: 0, honor: -4, end: true, reply: "“Then you're a liar or a fool, and I don't give my members' votes to either.”" },
        { t: "“There's a consultancy fee for funds that vote with management.”", score: 0, honor: -8, flag: "proxy_pension_bought", why: "Offered a pension fund a bribe", end: true, reply: "She takes it. She tells you she'll take Akio's too." }] } }
    } });

  G.add(43, { title: "The Ledger", kind: "meeting",
    brief: [
      [0, "", "Three in the afternoon. The president has gone home on doctor's orders. The office next door is empty, and the safe is behind the picture of his grandfather."],
      [0, "Seiko", "(Nakano said: a drive, in the safe. Eleven years of envelopes.)"],
      [0, "Secretary", "Senmu? He's left his keys on the desk again. I'm going for my break. Twenty minutes. I'm telling you that for no reason."]
    ],
    cast: { Secretary: {} }, noAkio: true, head: "The president's office",
    talks: { meeting: {
      start: { lines: [["", "The safe opens with the smallest key. Inside: a drive, a ledger in his handwriting, and about sixty million yen in cash."]], opts: [
        { t: "Copy the drive. Photograph the ledger. Touch nothing else, and lock it again.", score: 2, honor: 5, reiko: 4, flag: "ledger_copied", why: "Copied the second ledger for the board", end: true },
        { t: "Close the safe. “Not like this.” Tell Reiko where it is, and let the board demand it openly.", score: 2, honor: 7, reiko: 2, flag: "ledger_told", why: "Refused to go through the boss's safe", end: true },
        { t: "Take the drive, the ledger and ten million of the cash. Insurance.", yen: 10000000, score: 0, honor: -14, flag: "ledger_stolen", why: "Robbed the boss's safe", end: true, reply: "The drive is leverage. The cash is just cash. You know which one you took it for." }] }
    } } });

  G.add(44, { title: "Strike", kind: "floor", incidents: ["strike"], random: 1 });

  G.add(45, { title: "Prosecutor", kind: "field",
    brief: [
      [0, "Akio", "The prosecutors want to 'talk' to my managing director. About consulting fees. About my oldest friend."],
      [0, "Akio", "You'll go. You'll say you never saw an envelope, never carried a bag, never drove a car. Three sentences. Say them."],
      [0, "Akio", "And remember, senmu. Whatever I did, you carried it."]
    ],
    people: { pros: { name: "Prosecutor Shirai", look: "officelady_05", female: true } },
    steps: [
      { go: { site: "Konto Metropolitan Government" }, who: "pros", text: "Attend the prosecutor's office at the Metropolitan Government", hint: "Kanchogai, west of the centre. Three sentences." },
      { talk: "pros", who: "pros" }
    ],
    noReturn: true,
    talks: { pros: {
      start: { who: "Shirai", say: "Managing director. Thank you for coming without a lawyer. Eleven years of payments from SOTI to a Kurogane-kai front. Did you ever see an envelope, carry a bag, or drive the president to meet Kurogane Jūzō?", opts: [
        { t: "“All three. I'll give you dates. I should have come sooner, and I'll say that in the statement too.”", score: 2, honor: 9, reiko: 3, favor: -6, flag: "testified", why: "Told the prosecutor everything, including your own part", end: true, reply: "Shirai writes for two hours. “Most men in your chair say three sentences they've been taught. You'll be a witness, not a suspect.”" },
        { t: "“I never saw an envelope. I never carried a bag. I never drove a car.”", score: 1, honor: -9, favor: 4, flag: "perjured", why: "Lied to the prosecutor", end: true, reply: "Shirai closes the file. “Three sentences. He always teaches them three.”" },
        { t: "“I'd like immunity before I answer. In writing.”", score: 1, honor: -2, flag: "immunity", end: true, reply: "“That can be arranged. It usually tells me what the answer is.”" }] }
    } } });

  G.add(46, { title: "Old Friends", kind: "field",
    brief: [
      [0, "", "The vote is a week away. He hasn't eaten with anyone from the third floor since the office with the door."],
      [0, "Seiko", "(I need to tell someone. Someone who knew me by the window.)"]
    ],
    noAkio: true,
    people: { ishi: { name: "Ishikawa Ken", look: "salaryman_02" } },
    steps: [
      { fn: (ctx, next) => { if (gameMinutes() < 19 * 60) setGameTime(19 * 60 + 5); next(); } },
      { go: { venue: "izakaya" }, who: "ishi", text: "Have a drink with Ishikawa", hint: "The izakaya under the tracks, like the old days." },
      { talk: "ishi", who: "ishi" }
    ],
    noReturn: true,
    talks: { ishi: {
      start: { who: "Ishikawa", say: "Senmu-sama himself, in an izakaya. I'm joking. Sit. You look like I did after my first rough call. You took fifteen minutes of my queue that day. What's going on up there, Seiko?", opts: [
        { t: "Tell him all of it: the vote, Reiko, what you've done and what you're ashamed of.", score: 2, honor: 3, flag: "friend_ishikawa", why: "Trusted a friend with the truth", next: "two" },
        { t: "“Nothing. I just wanted a drink with someone who doesn't want anything from me.”", score: 1, honor: 1, next: "two" },
        { t: "Tell him the plan, and what's in it for him if he keeps the floor quiet: a manager's job.", score: 0, honor: -4, flag: "friend_ishikawa", why: "Bought a friend's silence", next: "two" }] },
      two: { who: "Ishikawa", say: "Whatever happens next week. The floor remembers who covered their queue and who walked past them like furniture. Both, in your case. Be the first one. Kanpai.", opts: [{ t: "“Kanpai.”", end: true }] }
    } } });

  G.add(47, { title: "The Offer", kind: "meeting",
    brief: [
      [0, "", "The president is in before nine. Nobody can remember that happening."],
      [0, "Akio", "Shut the door. I know about the vote. I know about my aunt, and the bank, and the fishwives' pension."],
      [0, "Akio", "I could fight. I'd probably win, I have Jūzō, and Jūzō has people who visit shareholders at night. But I'm tired, and you're good, so here it is."]
    ],
    talks: { meeting: {
      start: { who: "Akio", say: "Fifty million yen. Today. A house in Wakabadai. You vote with me, you tell them the ledger's a forgery, and when my heart stops, the chair is yours anyway. You get everything you wanted, boy. You just get it from ME.", opts: [
        { t: "“No, Sotiyama-sama. I wanted the office. I didn't want to become what's in it.”", score: 2, honor: 8, respect: 3, reiko: 3, favor: -8, flag: "refused_offer", why: "Refused fifty million yen", end: true, reply: "He looks, for a moment, like a much older man. “…My grandfather would have hired you too. Get out. I'll see you at the vote.”" },
        { t: "Take it.", yen: 50000000, score: 0, honor: -30, favor: 8, flag: "took_offer", why: "Sold the vote for fifty million", end: true, reply: "The bag is heavier than the one you carried to the port. It is the same kind of bag." },
        { t: "“A hundred, and I want it in writing that the chair is mine.”", yen: 20000000, score: 0, honor: -18, favor: -2, flag: "haggled_offer", why: "Haggled over the price of your vote", end: true, reply: "“Hah! NOW he's a Sotiyama.” He gives you twenty and a promise. You know what his promises are worth. You taught yourself that." }] }
    } } });

  G.add(48, { title: "Home", kind: "field",
    brief: [
      [0, "", "Three days before the vote, the managing director of SOTI takes a day off. Nobody can remember that happening either."],
      [0, "Seiko", "(Mizuho. Dawn over the rice. I haven't been back since the halt.)"]
    ],
    noAkio: true,
    people: { dad: { name: "Father", look: "salaryman_03", business: false } },
    steps: [
      { go: { city: "Mizuho" }, who: "dad", text: "Go home to Mizuho", hint: "The far north-west. The long train from Tōkonto Central, or half a day in the car." },
      { talk: "dad", who: "dad" }
    ],
    noReturn: true,
    talks: { dad: {
      start: { who: "Father", say: "Look at you. A suit like that, and a watch. Your mother's crying in the kitchen already. Sit on the step. You didn't come all this way to show me a watch. What is it, son?", opts: [
        { t: "“I'm about to get everything I said I wanted, and I don't know if I got it the right way.”", score: 2, honor: 3, next: "two" },
        { t: "“I'm going to be president of SOTI, Father.”", score: 1, next: "two" },
        { t: "“Nothing. I wanted to see the rice.”", score: 1, honor: 1, next: "two" }] },
      two: { who: "Father", say: "When you left I told you one thing at the halt. Do you remember? 'Whatever they make you up there, come back someone your sister can look at.' The rest is only work. Now come in. She's made too much.", opts: [
        { t: "“I remember.”", honor: 2, stress: -0.5, end: true }] }
    } } });

  G.add(49, { title: "The Night Before", kind: "field",
    brief: [
      [0, "", "The night before the board meets. One last count."],
      [0, "Reiko", "Tomorrow, Seiko-san. I have my shares. You were to bring the bank, the pension fund, and the third floor."],
      [0, "Reiko", "Go and see Gondō. Whatever else happens tomorrow, that man should hear it from you tonight."]
    ],
    cast: { Reiko: { female: true } }, noAkio: true,
    people: { gondo: { name: "Gondō Tetsuo", look: "salaryman_07" } },
    steps: [
      { fn: (ctx, next) => { if (gameMinutes() < 20 * 60) setGameTime(20 * 60); next(); } },
      { go: { station: "Shinmei" }, who: "gondo", text: "Find Gondō on his way home", hint: "He takes the 20:14 from Shinmei. He has for twenty years." },
      { talk: "gondo", who: "gondo" }
    ],
    noReturn: true,
    talks: { gondo: {
      start: { who: "Gondō", say: "Senmu. On my platform. Either I'm sacked or you want something. …I know about tomorrow. Everyone knows. He's promised me the department if I stand up and say you forged the ledger.", opts: [
        { t: "“I'm not here to ask you for anything, Gondō-san. I came to say that whatever you do tomorrow, you taught me the floor. I never thanked you.”", score: 2, honor: 5, respect: 2, flag: "gondo_ally", why: "Thanked Gondō and asked for nothing", end: true, reply: "Gondō takes his glasses off and cleans them for a long time. “Twenty years. Nobody's said it. …I'll be at the meeting. I know which way I'll bow.”" },
        { t: "“I can promise you the department too. And I'll still be here in a year.”", score: 1, honor: -3, flag: "gondo_bought", why: "Outbid the boss for Gondō", end: true, reply: "“Everybody's promising me a department this week.” The 20:14 comes in. He gets on it." },
        { t: "“Stand up against me tomorrow and you'll be on this platform for good.”", score: 0, honor: -8, respect: -3, why: "Threatened Gondō", end: true }] }
    } } });

  G.add(50, { title: "The Chair", kind: "finale" });
})();
