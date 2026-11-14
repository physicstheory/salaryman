// The Kurogane-kai's work: what Benzō, Brother Genji, Sharkskin Hide and the office at the docks ask of Seiko (yakuza.js runs it).
//
// A job: { from: benzo | genji | hide | hq, rank (lowest rank that gets offered it), after: [jobs done first], when(state), pay (yen),
// regard (the family's regard it earns at a three-star rating), brief (what the contact says when he offers it), arm (hand him a pistol
// first), people, steps, talks, done(ctx, state) }. Steps and talks are the same as the SOTI missions (quest.js).
// "sakazuki" (the cup) makes him wakashu; "tower" is the last job before the oyabun names his second.
(function () {
  "use strict";
  const C = window.career, Y = C && C.yakuza; if (!Y) return;
  const SUIT = "salaryman_08", HEAVY = "man_01";

  // ---- Benzō, the tables, Kurotani ------------------------------------------------------------------------------------------------------------
  Y.add("benzo_debt", { from: "benzo", rank: 1, pay: 40000, regard: 7, title: "A Friendly Reminder",
    brief: "A noodle man in Kurotani owes the tables two hundred thousand. Go and remind him. You've got an honest face. Use it.",
    people: { debtor: { name: "Noodle-stand Tanabe", look: "man_03", business: false } },
    steps: [
      { go: { ward: "Kurotani", dx: -40, dz: 30 }, who: "debtor", text: "Find Tanabe's noodle stand in Kurotani", hint: "Benzō says he closes at midnight and lies about it." },
      { talk: "debtor", who: "debtor" }
    ],
    talks: { debtor: { start: { who: "Tanabe", say: "You're not one of Benzō's. You've got a lanyard. …He sent a salary man? I've got eighty thousand. My daughter's school fees are in that drawer too.", opts: [
      { t: "“Take the eighty. The fees stay in the drawer. I'll tell Benzō the rest is coming.”", score: 1, honor: 2, crew: -1, end: true, reply: "Tanabe bows until his forehead nearly touches the counter." },
      { t: "Empty the drawer.", score: 2, honor: -4, crew: 2, yen: 20000, end: true, reply: "He doesn't stop you. That's worse." },
      { t: "Pay the difference yourself, quietly.", need: 120000, score: 1, honor: 4, end: true, reply: "Benzō counts it twice. “Hm. Paid in full. Never seen that.”" }] } } } });

  Y.add("benzo_table", { from: "benzo", rank: 1, after: ["benzo_debt"], pay: 60000, regard: 8, title: "A Seat at the Table",
    brief: "A man from Osaka is winning too much at my tables. Sit across from him. Watch his hands, not the tiles.",
    people: { cheat: { name: "The man from Osaka", look: "salaryman_03" } },
    steps: [
      { go: { ward: "Kurotani", dx: 20, dz: 20 }, who: "cheat", text: "Sit in at Benzō's mahjong parlour", hint: "Back room. Fourth table. The one in the brown jacket." },
      { talk: "cheat", who: "cheat" }
    ],
    talks: { cheat: { start: { who: "The man from Osaka", say: "Salary man at a Kurotani table? Brave. Ron. That's my hand again. Lucky night.", opts: [
      { t: "Catch his sleeve before he can swap the tile. “Your luck is up your arm.”", score: 2, crew: 2, end: true, reply: "Three white dragons fall out of his cuff. The room goes quiet. Benzō smiles for the first time." },
      { t: "Say nothing and lose politely.", score: -1, end: true },
      { t: "“Deal me in on your trick and we split it.”", score: 1, honor: -3, flag: "yk_cheat_split", end: true, reply: "He grins. Benzō hears about it by morning. He always does." }] } } } });

  Y.add("benzo_ledger", { from: "benzo", rank: 2, after: ["benzo_table"], pay: 90000, regard: 10, title: "The Second Ledger",
    brief: "The police have a man in the Kanchogai tax office who wants my second ledger. You work in an office. Make one that looks like the first.",
    people: { clerk: { name: "Tax clerk Kawada", look: "salaryman_05" } },
    steps: [
      { go: { station: "Kanchogai" }, who: "clerk", text: "Meet the tax office clerk at Kanchogai station", hint: "He'll be holding a Konto Shimbun. Folded, not open." },
      { talk: "clerk", who: "clerk" }
    ],
    talks: { clerk: { start: { who: "Kawada", say: "You're the spreadsheet man. Good. The inspector expects a ledger by Friday. Give me one that adds up and I lose the other one.", opts: [
      { t: "Hand over a ledger that adds up perfectly and says nothing.", score: 2, crew: 2, honor: -2, end: true, reply: "“Beautiful. Even the rounding errors look tired.”" },
      { t: "Hand over the real one and walk away.", score: -2, honor: 3, crew: -4, flag: "yk_ledger_real", end: true, reply: "Benzō won't speak to you for a week. Someone at the tax office gets a medal." }] } } } });

  Y.add("benzo_raid", { from: "benzo", rank: 3, after: ["benzo_ledger"], pay: 150000, regard: 12, arm: true, title: "Night at the Parlour",
    brief: "The Ryūjin-gumi think my parlour is theirs now. Four of them. Tonight. You've got a gun in the bag. You won't need all of it.",
    steps: [
      { go: { ward: "Kurotani", dx: 20, dz: 20 }, text: "Get to the mahjong parlour in Kurotani", hint: "Benzō's people are already outside, keeping the door." },
      { fight: { at: { ward: "Kurotani", dx: 26, dz: 14 }, n: 4, guns: 1, text: "Run the Ryūjin-gumi out of Kurotani", hint: "Four of them, one armed. Fists, or the pistol (wheel)." } },
      { say: "Benzō, pouring: “You fight like a man who's been shouted at for twenty years. Good.”" }
    ] });

  // ---- Brother Genji, the stalls, Mitamamori ------------------------------------------------------------------------------------------------------
  Y.add("genji_stalls", { from: "genji", rank: 1, pay: 35000, regard: 7, title: "Festival Rent",
    brief: "The stall-keepers at the Mitamamori festival pay rent. To us, not to the shrine. Collect it. Be polite. It's a festival.",
    people: { taiyaki: { name: "Old Mrs Hirose", look: "woman_05", female: true, business: false } },
    steps: [
      { go: { ward: "Mitamamori", dx: 30, dz: -20 }, who: "taiyaki", text: "Collect the stall rent at the Mitamamori festival", hint: "The taiyaki stall is last. Mrs Hirose always pays last." },
      { talk: "taiyaki", who: "taiyaki" }
    ],
    talks: { taiyaki: { start: { who: "Mrs Hirose", say: "Genji's new boy. In a suit! Here. Thirty thousand. It was twenty last year. Have a taiyaki, you look hungry.", opts: [
      { t: "Take twenty. Tell Genji it was a slow night.", score: 1, honor: 2, yen: -10000, end: true, reply: "You make up the ten thousand yourself. The taiyaki is excellent." },
      { t: "Take thirty and the taiyaki.", score: 2, crew: 1, end: true },
      { t: "“The rent went up again? Who told you thirty?”", score: 1, next: "who" }] },
      who: { say: "Genji's cousin Kaz. He comes round the week before and says 'thirty'. Then Genji comes and says 'twenty' and Kaz says it's a misunderstanding.", opts: [
        { t: "Take twenty and tell Genji about his cousin.", score: 2, crew: 3, honor: 1, flag: "yk_kaz", end: true, reply: "Genji, later: “Kaz. Of course it's Kaz.” Kaz is not at the festival next year." }] } } } });

  Y.add("genji_omamori", { from: "genji", rank: 1, after: ["genji_stalls"], pay: 50000, regard: 8, title: "Lucky Charms",
    brief: "Our omamori come in from Nagisa on the morning train. The shrine thinks they're blessed. They are, by me. Collect the box.",
    people: { courier: { name: "A courier with a cooler box", look: "man_05", business: false } },
    steps: [
      { go: { city: "Nagisa" }, who: "courier", text: "Collect the box of omamori in Nagisa", hint: "Take the train. He's by the ticket gates with a fishing cooler." },
      { talk: "courier", who: "courier" },
      { go: { ward: "Mitamamori", dx: 40, dz: -10 }, text: "Bring the box back to Genji's stall", hint: "Don't open it on the train." }
    ],
    talks: { courier: { start: { who: "The courier", say: "Genji's? Here. It's heavier than charms. Don't ask me. I don't ask.", opts: [
      { t: "Don't ask.", score: 2, crew: 1, end: true },
      { t: "Lift the lid.", score: 1, honor: 1, flag: "yk_omamori_looked", end: true, reply: "Charms on top. Under them, rolls of ten-thousand-yen notes in festival paper. You put the lid back." }] } } } });

  Y.add("genji_shrine", { from: "genji", rank: 2, after: ["genji_omamori"], pay: 80000, regard: 10, title: "The Priest Says No",
    brief: "The new priest at the Mitamamori shrine wants the family's stalls gone. The old priest liked us. Talk to the new one. Salary men are good at talking.",
    people: { priest: { name: "Priest Ōmura", look: "man_02", business: false } },
    steps: [
      { go: { ward: "Mitamamori", dx: 0, dz: 20 }, who: "priest", text: "Talk to the new priest at the Mitamamori shrine", hint: "He sweeps the steps at dusk." },
      { talk: "priest", who: "priest" }
    ],
    talks: { priest: { start: { who: "Priest Ōmura", say: "You're from Kurogane. I can tell by the way you've bowed slightly too long. The answer is no. The festival is for the neighbourhood.", opts: [
      { t: "“The stalls stay, and from now the family pays the shrine rent. Real rent. Ten per cent of the night.”", score: 2, crew: 2, honor: 2, end: true, reply: "He thinks for a long time. “…Twelve.” Genji agrees to twelve and pretends it was his idea." },
      { t: "“The old priest had a car accident, didn't he?”", score: 1, crew: 3, honor: -5, end: true, reply: "He goes white and stops sweeping. The stalls stay." },
      { t: "“You're right. I'll tell Genji.”", score: -2, honor: 3, crew: -3, end: true }] } } } });

  Y.add("genji_rival", { from: "genji", rank: 3, after: ["genji_shrine"], pay: 140000, regard: 12, arm: true, title: "Fireworks",
    brief: "The Ryūjin-gumi set fire to two of my stalls. They're drinking by the river in Mitamamori, celebrating. Let's celebrate with them.",
    steps: [
      { go: { ward: "Mitamamori", dx: 60, dz: 30 }, text: "Find the Ryūjin-gumi by the river in Mitamamori", hint: "Follow the smell of burnt sugar." },
      { fight: { at: { ward: "Mitamamori", dx: 64, dz: 36 }, n: 5, guns: 1, text: "Teach the Ryūjin-gumi some festival manners", hint: "Five of them. Keep moving; don't let them circle you." } },
      { say: "Genji, from the bridge: “The festival goes on. It always goes on.”" }
    ] });

  // ---- Sharkskin Hide, the fish market, Higashiura -----------------------------------------------------------------------------------------
  Y.add("hide_ice", { from: "hide", rank: 1, pay: 45000, regard: 7, title: "Cold Chain",
    brief: "Ice truck in Kanmei-futo. Drive it to the market before five. Don't look in the back and don't hit anything.",
    steps: [
      { go: { ward: "Kanmei-futo", dx: 20, dz: 0 }, text: "Pick up the ice truck at Kanmei-futo", hint: "The white one. Keys on the wheel." },
      { go: { ward: "Higashiura", dx: -30, dz: 10 }, text: "Deliver the ice to the fish market by 05:00", hint: "Hide's at the auction floor.", by: 5 * 60 },
      { say: "Hide: “On time. In those shoes. I could get used to you.”" }
    ] });

  Y.add("hide_scale", { from: "hide", rank: 1, after: ["hide_ice"], pay: 55000, regard: 8, title: "The Honest Scale",
    brief: "A restaurant buyer says our scales are heavy. They are. He's going to the newspaper. Go and see him at his sushi bar.",
    people: { chef: { name: "Chef Morikawa", look: "man_06", business: false } },
    steps: [
      { go: { shop: "sushiya" }, who: "chef", text: "Visit Chef Morikawa at his sushi bar", hint: "He opens at five. He'll know who sent you." },
      { talk: "chef", who: "chef" }
    ],
    talks: { chef: { start: { who: "Chef Morikawa", say: "Hide sent a salary man. Hah. Fifteen per cent heavy, every crate, for six years. I've written it all down.", opts: [
      { t: "“The scales get fixed tomorrow, and the family credits you six years. Keep your notebook and your fish.”", score: 2, honor: 3, crew: 1, end: true, reply: "Hide swears for a full minute when you tell him. Then he fixes the scales." },
      { t: "“Newspapers close. Restaurants close faster.”", score: 1, crew: 3, honor: -4, end: true, reply: "He puts the notebook in the fryer. You watch it burn." }] } } } });

  Y.add("hide_boat", { from: "hide", rank: 2, after: ["hide_scale"], pay: 100000, regard: 10, title: "Something in the Nets",
    brief: "One of our boats comes in tonight with something in the nets that isn't fish. Meet it on the pier. If the coastguard's there, you're a tourist.",
    people: { skipper: { name: "Skipper Ono", look: "man_04", business: false } },
    steps: [
      { go: { ward: "Kanmei-futo", dx: -10, dz: 40 }, who: "skipper", text: "Meet Hide's boat on the pier at Kanmei-futo", hint: "After dark. The boat with one light." },
      { talk: "skipper", who: "skipper" }
    ],
    talks: { skipper: { start: { who: "Skipper Ono", say: "Six cases. Watches, from Hong Kong. Fake, but good fakes. Coastguard came by an hour ago, they'll be back.", opts: [
      { t: "Load the cases and go, fast.", score: 2, crew: 2, honor: -1, end: true },
      { t: "“Real watches don't come in nets.” Keep one case back for the fish market's own people.", score: 1, crew: 1, honor: 1, flag: "yk_watches", end: true, reply: "Hide's porters get a watch each. They never forget it." }] } } } });

  Y.add("hide_strike", { from: "hide", rank: 3, after: ["hide_boat"], pay: 160000, regard: 12, arm: true, title: "The Auction",
    brief: "The Ryūjin-gumi want the five o'clock auction. They're bringing six men to take it. I'm bringing you.",
    steps: [
      { go: { ward: "Higashiura", dx: -30, dz: 10 }, text: "Be at the fish market for the five o'clock auction", hint: "Hide is behind the tuna, with a hook." },
      { fight: { at: { ward: "Higashiura", dx: -36, dz: 4 }, n: 6, guns: 2, text: "Hold the fish market", hint: "Six of them, two armed. Use the crates for cover." } },
      { say: "Hide: “Auction's open. Who wants tuna?”" }
    ] });

  // ---- the office at the docks: the oyabun ------------------------------------------------------------------------------------------------------
  Y.add("sakazuki", { from: "hq", rank: 1, when: s => s.regard >= 20, pay: 0, regard: 4, title: "The Sake Cup",
    brief: "The old man will drink the cup with you. Kneel. Don't spill it. Once you drink, you're his son until one of you dies.",
    people: { oyabun: { name: "Kurogane Jūzō", look: HEAVY } },
    steps: [
      { go: { ward: "Higashiura", dx: 60, dz: 60 }, who: "oyabun", text: "Go to Kurogane Kōgyō for the cup ceremony", hint: "The office at the Higashiura docks. Wear the good suit." },
      { talk: "cup", who: "oyabun" }
    ],
    talks: { cup: { start: { who: "Kurogane Jūzō", say: "The salary man. Benzō says you count. Genji says you talk. Hide says you walk. I say: drink. From tonight the family is your family, and the company is just a place you go in the morning.", opts: [
      { t: "Drink.", score: 2, crew: 2, flag: "yk_cup", end: true, reply: "It's cold and very sweet. The room bows. Kuroda pins a small black anvil to your lapel." },
      { t: "Drink, and bow lower than you have ever bowed to Sotiyama.", score: 2, crew: 3, respect: 1, flag: "yk_cup", end: true, reply: "The old man laughs. “Lower than Akio! Good. He never bows to anyone.”" }] } } },
    done: () => { C.saga.achieve("yk_cup"); } });

  Y.add("hq_akio", { from: "hq", rank: 2, after: ["sakazuki"], pay: 120000, regard: 10, title: "What Akio Owes",
    brief: "Your president borrows from us. Has done for ten years. This month he has not paid. You work in his building. Remind him, quietly, the way we do.",
    people: { sec: { name: "Akio's secretary", look: "officelady_05", female: true } },
    steps: [
      { go: { soti: true }, who: "sec", text: "Deliver the family's reminder to SOTI Tower", hint: "The secretary on 58 takes his post. Nobody else touches it." },
      { talk: "sec", who: "sec" }
    ],
    talks: { sec: { start: { who: "Akio's secretary", say: "An envelope for Sotiyama-sama? There's no name on it. …There's a small black anvil on the back. Oh. Oh, I know these. He goes grey when these come.", opts: [
      { t: "“Make sure he opens it today.”", score: 2, crew: 2, end: true, reply: "That afternoon the money arrives at the docks. Akio spends the rest of the week shouting at the eleventh floor." },
      { t: "Add a note in your own hand: “Pay the garage, too.”", score: 1, crew: 1, honor: 2, flag: "yk_akio_note", end: true, reply: "The mechanic in town gets a cheque for six months of grips. He has no idea why." }] } } } });

  Y.add("hq_drive", { from: "hq", rank: 3, after: ["hq_akio"], pay: 110000, regard: 10, title: "The Old Man's Driver",
    brief: "The oyabun goes to see his mother's grave in the Gosho Gardens. His driver is sick. You drive. Nobody follows.",
    people: { oyabun: { name: "Kurogane Jūzō", look: HEAVY } },
    steps: [
      { go: { ward: "Higashiura", dx: 60, dz: 60 }, who: "oyabun", text: "Pick up the oyabun at Kurogane Kōgyō", hint: "Bring a car. A clean one." },
      { go: { site: "Gosho Gardens" }, who: "oyabun", text: "Drive the oyabun to the Gosho Gardens", hint: "Slowly. He gets carsick." },
      { talk: "grave", who: "oyabun" }
    ],
    talks: { grave: { start: { who: "Kurogane Jūzō", say: "She grew white chrysanthemums. You found one, Genji says. That's how you came to us. …I'm tired, salary man. My heart. Benzō is greedy, Hide is mad, Genji is soft. Who sits in my chair?", opts: [
      { t: "“You do. For a long time yet.”", score: 2, crew: 2, end: true, reply: "“Liar. A kind one.” He puts a hand on your shoulder all the way back to the car." },
      { t: "“Someone who can count.”", score: 2, crew: 3, respect: 1, flag: "yk_chair", end: true, reply: "He looks at you for a long time. “Yes. That's what I think too.”" }] } } } });

  Y.add("hq_rival", { from: "hq", rank: 4, after: ["hq_drive", "benzo_raid", "genji_rival", "hide_strike"], pay: 300000, regard: 16, arm: true, title: "The Dragon's Office",
    brief: "The Ryūjin-gumi have hit all three corners and lost all three times. Now we finish it. Their office is above a karaoke bar. Their boss is called Ryūzaki. Bring him to the table or put him under it.",
    steps: [
      { go: { venue: "karaoke" }, text: "Find the Ryūjin-gumi office above the karaoke bar", hint: "Hide's people say the back stairs." },
      { fight: { at: { venue: "karaoke" }, n: 6, guns: 3, boss: { name: "Ryūzaki", look: "salaryman_10", hp: 260 }, text: "Take the Ryūjin-gumi office", hint: "Six men and Ryūzaki. He has a gun and a temper." } },
      { say: "Ryūzaki, on the floor: “…The salary man. They said you were a joke.”" }
    ] });

  Y.add("tower", { from: "hq", rank: 5, after: ["hq_rival"], pay: 500000, regard: 10, title: "The Ledger on 58",
    brief: "Akio Sotiyama keeps a book of everything SOTI has paid us, and everything we've done for SOTI. Twenty years of it, in his office safe. If he goes down, he takes us with him. Bring it to me. Then we talk about my chair.",
    people: { sec: { name: "Akio's secretary", look: "officelady_05", female: true }, guard: { name: "The night guard", look: SUIT } },
    steps: [
      { go: { soti: true }, who: "guard", text: "Get into SOTI Tower after hours", hint: "The night guard knows your face. That's the point." },
      { talk: "guard", who: "guard" },
      { go: { soti: true }, who: "sec", text: "Open the safe on 58", hint: "The secretary works late. She always does." },
      { talk: "safe", who: "sec" },
      { go: { ward: "Higashiura", dx: 60, dz: 60 }, text: "Bring the ledger to the oyabun", hint: "Kurogane Kōgyō, Higashiura docks." }
    ],
    talks: {
      guard: { start: { who: "The night guard", say: "Sotiyama-san? At eleven at night? …Overtime again. Go on up. I never saw you. I never see anyone.", opts: [
        { t: "“Thank you. Go and get a coffee.”", score: 1, end: true }] } },
      safe: { start: { who: "Akio's secretary", say: "You want the safe. Of course you do. I've typed every page in that book for nineteen years. The code is his mother's birthday. He thinks nobody knows his mother.", opts: [
        { t: "“Come with me. When it's over, you'll never type for him again.”", score: 2, honor: 1, crew: 2, flag: "yk_secretary", end: true, reply: "She takes her coat and nothing else. “I've been waiting for someone to say that since 2007.”" },
        { t: "Take the ledger and leave her a week's pay on the desk.", score: 1, crew: 2, end: true }] } }
    },
    done: () => { C.saga.achieve("yk_second"); } });

  Y.add("hq_ledger_copy", { from: "hq", rank: 5, after: ["tower"], when: s => !s.choice, pay: 80000, regard: 4, title: "A Copy for Safekeeping",
    brief: "Benzō wants a copy of Akio's book. So does Hide. So does Genji. Make one. Give it to whoever you trust.",
    steps: [
      { go: { shop: "eleven" }, text: "Copy the ledger at a convenience store", hint: "Any Eleven. Pay cash for the copies." },
      { say: "You make one copy and keep it yourself. In this family that's the only person you can trust." }
    ] });
})();
