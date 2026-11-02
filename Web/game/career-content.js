// What happens at SOTI: the callers on the Care Desk and the problems on the floor.
//
// A call: who rings, about what, how much patience they start with, and a few exchanges. Each answer has a tone (kind, firm, rude, wrong,
// honest, dishonest) that moves the caller's patience (p overrides the tone's default), can add notes to the caller's card (reveal), can get a
// reply, and either leads on (next) or ends the call (end: resolved, escalated, hungup). The tones are what the honor and respect systems hear.
//
// A floor incident: who (staff keys from career-office.js), a title and a brief for the objective, and a conversation; answers move floor
// morale and Gondō's goodwill, and end it well (good) or not. vip: sends the floor manager to his desk for that call.
(function () {
  "use strict";
  const C = window.career; if (!C || !C.office) return;
  const O = C.office;

  O.calls = {
    // ---- 2 · First Day ---------------------------------------------------------------------------------------------------------------------
    charger: { who: "Yamamoto Kenji", age: 34, product: "SOTI So24", plan: "SOTI Mobile Basic", since: "3 weeks", diff: 1, patience: 70,
      notes: ["Bought a So24 three weeks ago", "No previous calls"],
      after: { resolved: "Mr Yamamoto's phone is charging. He said thank you twice.", escalated: "A repair ticket for a phone that only needed a charger.", hungup: "He'll be in a SOTI store tomorrow, angry." },
      nodes: {
        start: { say: "Hello? My new So24 won't charge. I left it plugged in all night and it's still at four percent. I need it for work!", opts: [
          { t: "I'm sorry, that's stressful when you need it for work. Which charger and cable are you using?", tone: "kind", next: "cable" },
          { t: "Have you tried turning it off and on again?", tone: "firm", reply: "…Yes. Obviously. It's still at four percent.", next: "cable" },
          { t: "Phones don't just stop charging, sir. You've probably broken it.", tone: "rude", next: "cable" }] },
        cable: { say: "Er… the one from my old phone. It's a bit frayed near the plug, if that matters.", opts: [
          { t: "That'll be it. The So24 needs a USB-C fast charger: use the cable from the box, and I'll email you a 10% code for a SOTI charger.", tone: "kind", p: 20, end: "resolved", reply: "Oh! It's going up. Five percent… six! Thank you!" },
          { t: "Buy a new SOTI charger. They're in every store.", tone: "firm", end: "resolved", reply: "Fine. I'll buy one. Bye." },
          { t: "I'll book it in for repair. Seven to ten working days.", tone: "wrong", end: "escalated", reply: "Ten days?! Without a phone?! Fine. Book it." }] }
      } },
    bill: { who: "Tanaka Michiko", age: 51, product: "SOTI Mobile", plan: "Family Plus (4 lines)", since: "2011", diff: 2, patience: 55,
      notes: ["Family Plus: four lines", "!Bill this month: ¥48,300 (usually ¥12,000)"],
      after: { resolved: "Mrs Tanaka is paying for her son's roaming, but she's paying it in three parts, and she's calmer.", escalated: "Passed to Billing. They'll call her back in 5–7 days.", hungup: "She's switching the whole family to Konto Mobile." },
      nodes: {
        start: { say: "I want to know why my bill is forty-eight thousand yen. FORTY-EIGHT. It's normally twelve. Is this a joke?", opts: [
          { t: "That's a big jump, I understand why you're upset. Let me look at the charges with you.", tone: "kind", next: "look", reveal: ["!¥36,000 of data roaming: line 3 (Tanaka Sho), Seoul, 6 days"] },
          { t: "The bill is correct, madam. Our system doesn't make mistakes.", tone: "rude", next: "look", reveal: ["!¥36,000 of data roaming: line 3 (Tanaka Sho), Seoul, 6 days"] },
          { t: "I'll refund the whole thing.", tone: "wrong", p: -6, end: "escalated", reply: "…You can do that? Then do it. Now." }] },
        look: { say: "Roaming? In Seoul? Sho said it was a school trip… he swore he'd turn data off.", opts: [
          { t: "Teenagers. I can't wipe it, but I can split it over three bills, and add a roaming cap to Sho's line so it can't happen again.", tone: "honest", p: 18, end: "resolved", reply: "Three months, and a cap. Yes. And I'll be having words with Sho." },
          { t: "Maybe ask your son about it, madam. That's a family matter.", tone: "firm", p: -10, next: "look2" },
          { t: "Oh, roaming errors happen all the time. I'm sure it's our fault, I'll pass it to Billing.", tone: "dishonest", end: "escalated", reply: "Well, good. I'll wait for their call." }] },
        look2: { say: "A family matter. A forty-eight-thousand-yen family matter. Can you do ANYTHING?", opts: [
          { t: "Yes, sorry. I can split it over three months and cap roaming on his line.", tone: "kind", p: 6, end: "resolved", reply: "Fine. Thank you. Finally." },
          { t: "Not really, no.", tone: "rude", end: "hungup" }] }
      } },
    obaachan: { who: "Kobayashi Fumiko", age: 82, product: "SOTI Raku-Raku", plan: "Silver Simple", since: "2019", diff: 1, patience: 85,
      notes: ["Large-button Raku-Raku phone", "Calls every week (12 calls this year)"],
      hangup: "Oh dear, I'll ask my grandson. Sorry to bother you.",
      after: { resolved: "Kobayashi-san can call her grandson again. She told you about her cat for four minutes.", escalated: "Sent a technician to a woman who needed one button pressing.", hungup: "She gave up, very politely." },
      nodes: {
        start: { say: "Hello, dear? I'm sorry to bother you. My phone has gone quiet. I can't hear my grandson any more. Is it broken?", opts: [
          { t: "You're not bothering me at all. Let's sort it together. Can you see the buttons on the side of the phone?", tone: "kind", next: "side" },
          { t: "Please hold while I check the network status in your area.", tone: "firm", p: -8, reply: "Oh. All right, dear. I'll hold.", next: "side" },
          { t: "Madam, I have a lot of calls waiting. What's the problem exactly?", tone: "rude", next: "side" }] },
        side: { say: "There's a long one and a little one. Oh! And there's a picture of a little speaker with a line through it on the screen. Is that bad?", opts: [
          { t: "That means it's on silent. Press the top of the long button a few times, until the little speaker comes back.", tone: "kind", p: 14, end: "resolved", reply: "Oh! It beeped! Oh, you're so clever. Do you have a girlfriend? My granddaughter—" },
          { t: "I'll send a technician to your house.", tone: "wrong", end: "escalated", reply: "Oh, a visitor! I'll make tea." },
          { t: "Read the manual, it's all in there.", tone: "rude", end: "hungup" }] }
      } },

    // ---- 3 · The Complaint Line -----------------------------------------------------------------------------------------------------------
    cracked: { who: "Hayashi Daichi", age: 27, product: "SOTI So24 Ultra", plan: "Unlimited Max", since: "2022", diff: 2, patience: 50,
      notes: ["So24 Ultra, 11 months old", "SOTI Care+ insurance: NO"],
      after: { resolved: "A discounted screen repair, booked for Saturday. He grumbled, but he booked it.", escalated: "A warranty claim that will be refused in a week. He'll be back.", hungup: "He's posting the cracked screen on Pearbook. With your name." },
      nodes: {
        start: { say: "My screen cracked. I just put it down on the table and it cracked. That's a manufacturing defect, so you're fixing it for free, right?", opts: [
          { t: "I'm sorry, that's frustrating. Can I ask: was it a flat table, or did it land on something?", tone: "kind", next: "how" },
          { t: "Glass doesn't crack by itself, sir.", tone: "firm", p: -12, next: "how" },
          { t: "Sure, free repair. No problem.", tone: "dishonest", end: "escalated" }] },
        how: { say: "…Okay, it maybe fell off the table. Onto the floor. Tile floor. Once. Whatever. It's still a defect.", opts: [
          { t: "Thanks for being honest. A drop isn't covered by the warranty, but I can give you 30% off a screen repair this week.", tone: "honest", p: 14, end: "resolved", reply: "Thirty percent… fine. Saturday morning." },
          { t: "Then it's not a defect, it's your fault. Full price.", tone: "rude", end: "hungup" },
          { t: "I'll log it as a defect and see what happens.", tone: "dishonest", end: "escalated" }] }
      } },
    roaming: { who: "Watanabe Sora", age: 23, product: "SOTI So24", plan: "Lite 5GB", since: "2024", diff: 2, patience: 60,
      notes: ["!Line suspended: unpaid ¥9,800", "Calling from a hotel phone, Bangkok"],
      after: { resolved: "Line back on, paid by card. Sora can get home.", escalated: "Sora is stuck in Bangkok, waiting for a callback.", hungup: "The hotel phone went dead." },
      nodes: {
        start: { say: "Hi, I'm in Bangkok and my phone just stopped working. My flight home is tomorrow and the boarding pass is on my phone. Please help!", opts: [
          { t: "Don't worry, we'll get you home. Let me check your line.", tone: "kind", next: "why" },
          { t: "Your line's suspended. You didn't pay.", tone: "firm", p: -10, next: "why" },
          { t: "Should've printed the boarding pass.", tone: "rude", next: "why" }] },
        why: { say: "Suspended?! I set up auto-pay… oh no. My card expired last month. Can I pay now? I have a new card.", opts: [
          { t: "Yes. I'll take the payment now and switch the line straight back on, and I'll turn on roaming for 24 hours at the travel rate.", tone: "kind", p: 18, end: "resolved", reply: "It's back! I've got bars! You're a lifesaver!" },
          { t: "You'll have to pay online.", tone: "wrong", p: -20, reply: "I CAN'T get online, that's the PROBLEM!", next: "why2" },
          { t: "Payments take three working days.", tone: "dishonest", end: "escalated" }] },
        why2: { say: "Please. I'm in a hotel lobby in my socks. Can't you just take the card?", opts: [
          { t: "Sorry, you're right. Read me the number and I'll do it now.", tone: "kind", end: "resolved", reply: "Thank you. Thank you so much." },
          { t: "Policy is policy.", tone: "rude", end: "hungup" }] }
      } },
    scam: { who: "\"Officer\" Endō", age: null, product: "Not a customer", plan: "—", since: "—", diff: 3, patience: 60, account: "—",
      notes: ["!Caller ID withheld", "Asking about account SM-448120 (Ishida Haru)"],
      hangup: "You'll regret this. *click*",
      after: { resolved: "You didn't give a scammer a stranger's details. Security has his number now.", escalated: "You gave out a customer's address. Security is very interested in this call.", hungup: "He hung up. Probably to try someone else." },
      nodes: {
        start: { say: "Konto Police, Detective Endō. I need the home address and date of birth for account SM-448120. It's urgent: a kidnapping.", opts: [
          { t: "I'm sorry, I can't give out customer details on the phone. Police requests go through our legal team in writing.", tone: "honest", p: -10, next: "push" },
          { t: "Of course, Detective. One moment.", tone: "wrong", next: "give" },
          { t: "A kidnapping? Then why are you calling customer service?", tone: "firm", p: -15, next: "push" }] },
        push: { say: "Listen, kid. A girl's life is on the line and you're hiding behind paperwork? Give me the address or I'll have you arrested.", opts: [
          { t: "If it's real, our legal team answers police within the hour. I'm flagging this call to Security now.", tone: "honest", p: -30, end: "resolved" },
          { t: "…All right. It's 4-12 Kanda, flat 3.", tone: "dishonest", end: "escalated", reply: "Good boy. *click*" },
          { t: "Arrest me, then. Officer.", tone: "rude", p: -60, end: "resolved" }] },
        give: { say: "Good. The address and the date of birth. Quickly.", opts: [
          { t: "Wait… what's your badge number and station? I'll call you back through the switchboard.", tone: "honest", p: -40, end: "resolved" },
          { t: "4-12 Kanda, flat 3. Born 1990-04-02.", tone: "dishonest", end: "escalated", reply: "*click*" }] }
      } },
    gamer: { who: "Ishii Kaito", age: 15, product: "SOTI PlayBox 5", plan: "PlayBox Online", since: "2025", diff: 2, patience: 45,
      notes: ["PlayBox 5", "!Account holder: Ishii Naoko (mother)"],
      after: { resolved: "Error E-104 fixed. Kaito made his tournament. His mother doesn't know he called.", escalated: "A technician for a router that needed unplugging.", hungup: "He rage-quit the call." },
      nodes: {
        start: { say: "Bro, my PlayBox keeps disconnecting, error E-104, and my tournament is in TWENTY MINUTES. Fix it fix it fix it.", opts: [
          { t: "Twenty minutes, okay, let's be quick. Is the PlayBox on Wi-Fi or a cable?", tone: "kind", next: "wifi" },
          { t: "Are you the account holder?", tone: "firm", p: -10, reply: "…Yes. I'm Naoko. Obviously. Can you fix it?", next: "wifi" },
          { t: "Maybe go outside instead.", tone: "rude", next: "wifi" }] },
        wifi: { say: "Wi-Fi. The router's in the kitchen, I'm upstairs. It's always been fine.", opts: [
          { t: "E-104 is a weak signal. Turn the router off for ten seconds, then on, and set the PlayBox to the 5 GHz network.", tone: "kind", p: 16, end: "resolved", reply: "It's… connected! Full bars! You're actually goated." },
          { t: "Buy our SOTI Mesh extender, ¥18,000.", tone: "dishonest", p: -10, end: "escalated", reply: "I'm FIFTEEN. I don't have eighteen thousand yen." },
          { t: "Sounds like your router's broken. Call your internet company.", tone: "wrong", end: "hungup" }] }
      } },

    // ---- 4 · Overtime ------------------------------------------------------------------------------------------------------------------
    buds: { who: "Matsumoto Rina", age: 30, product: "SOTI Buds 3", plan: "—", since: "2021", diff: 1, patience: 65,
      notes: ["SOTI Buds 3, bought in March", "Find My Buds: enabled"],
      after: { resolved: "Both Buds found. One was in the washing machine (it survived).", escalated: "A replacement order for Buds that were in her coat pocket.", hungup: "She'll buy Pear Buds." },
      nodes: {
        start: { say: "I've lost my left Bud. Just the left one. Do I have to buy a whole new pair? They were twenty-four thousand yen!", opts: [
          { t: "Let's try to find it first. Your Buds have Find My Buds on: I can make it play a sound.", tone: "kind", next: "find" },
          { t: "Yes, you have to buy a new pair.", tone: "wrong", p: -25, next: "find" },
          { t: "You'd be surprised how often people lose them. Try harder.", tone: "rude", next: "find" }] },
        find: { say: "…Oh. I can hear beeping. It's… it's coming from the washing machine.", opts: [
          { t: "Don't panic: the Buds 3 are waterproof. Dry it for an hour, then put it in the case. If it doesn't charge, call me back and I'll replace just the left one.", tone: "kind", p: 15, end: "resolved", reply: "It lights up! Thank you, honestly." },
          { t: "That's water damage. Not covered.", tone: "firm", end: "escalated" }] }
      } },
    influencer: { who: "Kirara ✦", age: 24, product: "SOTI So24 Ultra", plan: "Creator Unlimited", since: "2023", diff: 3, patience: 40, account: "SM-777001",
      notes: ["!840,000 followers on Pearbook", "Wants a free So25 before launch"],
      hangup: "Enjoy being trending tomorrow. *click*",
      after: { resolved: "No free phone, but a real SOTI partnership contact. She posted that SOTI 'actually listened'.", escalated: "A free phone you weren't allowed to promise. Marketing will be furious.", hungup: "She's live-streaming a rant about SOTI." },
      nodes: {
        start: { say: "Hiii, so I'm Kirara, like, THE Kirara? My camera is giving potato. I need the new So25 before launch or I'm telling my followers SOTI is dead.", opts: [
          { t: "Hi Kirara. Let's get your camera sorted first: what's going wrong with it?", tone: "kind", next: "cam" },
          { t: "We don't do favours for influencers.", tone: "firm", p: -15, next: "cam" },
          { t: "Sure, I'll send you a So25!", tone: "dishonest", end: "escalated" }] },
        cam: { say: "Everything's blurry and it says 'Lens Assist failed'. My ring light video is RUINED. Eight hundred forty thousand people are waiting.", opts: [
          { t: "Lens Assist fails when the camera lens has a film on it. Wipe it with a soft cloth and restart the camera. And I'll pass your name to our creator team: they decide who gets launch phones, not me.", tone: "honest", p: 18, end: "resolved", reply: "OMG it's sharp. Like, actually sharp. Okay, you're cute. Tell the creator team I said hi." },
          { t: "Maybe the problem is the person in front of the camera.", tone: "rude", end: "hungup" },
          { t: "I can't promise a So25… but I'll try.", tone: "firm", end: "escalated" }] }
      } },
    landlord: { who: "Okada Takeshi", age: 58, product: "SOTI Business", plan: "Business 20 lines", since: "2008", diff: 3, patience: 35,
      notes: ["!Business account, 20 lines, ¥380,000/month", "Contract renewal next month"],
      after: { resolved: "The broken lines are back and the contract renewal is safe. A ¥4.5m account kept.", escalated: "Passed to Business Support. He's already looking at other networks.", hungup: "SOTI just lost twenty business lines." },
      nodes: {
        start: { say: "This is Okada of Okada Property. Six of my twenty lines have been down since this morning. My agents can't call tenants. Who is in charge?", opts: [
          { t: "Okada-sama, I'm sorry. I'll take personal ownership of this. Which six lines?", tone: "kind", next: "lines", reveal: ["Lines 14–19: SIMs deactivated 08:12 by 'bulk update'"] },
          { t: "I'm only a customer service agent, sir.", tone: "firm", p: -15, next: "lines", reveal: ["Lines 14–19: SIMs deactivated 08:12 by 'bulk update'"] },
          { t: "Have you paid your bill?", tone: "rude", next: "lines", reveal: ["Lines 14–19: SIMs deactivated 08:12 by 'bulk update'"] }] },
        lines: { say: "Fourteen to nineteen. Twenty years I have been with SOTI. Twenty years. And this is how I am treated.", opts: [
          { t: "It's our mistake: a bulk update turned them off at 8:12. I'm switching them back on now, and I'll credit this month's charge for those six lines.", tone: "honest", p: 25, end: "resolved", reply: "…They are working. Thank you, young man. What is your name? I will write to Sotiyama-sama." },
          { t: "I'll raise a ticket with the technical team.", tone: "firm", end: "escalated" },
          { t: "I'm sure it's something on your end, sir.", tone: "dishonest", end: "hungup" }] }
      } },
    lonely: { who: "Mr Saitō", age: 76, product: "SOTI Home Phone", plan: "Landline Basic", since: "1994", diff: 1, patience: 80,
      notes: ["Calls most evenings", "Wife: deceased 2023 (from previous call notes)"],
      hangup: "Sorry. I'll let you go. *click*",
      after: { resolved: "Nothing was broken. Mr Saitō just wanted to talk to someone. You did.", escalated: "You sent an engineer to a man who was lonely.", hungup: "Mr Saitō said sorry for bothering you, and hung up." },
      nodes: {
        start: { say: "Hello. Is that SOTI? I… I think my phone is working. I'm not sure why I called. It's very quiet here in the evenings.", opts: [
          { t: "It's good to hear from you, Saitō-san. How has your day been?", tone: "kind", next: "talk" },
          { t: "Sir, if there's no fault, I'll have to end the call.", tone: "firm", p: -25, next: "talk" },
          { t: "This line is for problems, sir.", tone: "rude", end: "hungup" }] },
        talk: { say: "My day? Well… I went to the shrine. Bought some mikan. My wife used to peel them for me. Silly, isn't it, an old man calling the phone company.", opts: [
          { t: "Not silly at all. Did you know the ward runs a tea afternoon on Thursdays? I can text you the details on this number.", tone: "kind", p: 12, end: "resolved", reply: "Thursdays… I might. Thank you, young man. You're very kind." },
          { t: "Mm. Anyway, is there anything wrong with your phone?", tone: "firm", end: "resolved", reply: "No. No, it's fine. Goodnight." },
          { t: "I'll book an engineer to check the line.", tone: "wrong", end: "escalated" }] }
      } },

    // ---- 7 · The Audit: the VIP, taken by the floor manager himself ---------------------------------------------------------------------
    vip: { who: "Sotiyama Reiko", age: 61, product: "SOTI So24 Ultra", plan: "Board member line", since: "1987", diff: 3, patience: 40, account: "SM-000004",
      notes: ["!VIP: board member", "!Akio Sotiyama's aunt", "Complaint: 'rude agent, twice'"],
      hangup: "I will be speaking to my nephew. *click*",
      after: { resolved: "Reiko Sotiyama has asked for your name. In a good way.", escalated: "A board member is unhappy, and the audit heard all of it.", hungup: "A board member hung up on 3F. During the audit." },
      nodes: {
        start: { say: "This is Sotiyama Reiko. Twice this week your agents have put me on hold for forty minutes and then cut me off. Do you know who I am?", opts: [
          { t: "I do, Sotiyama-sama, and you should never have waited. I'm the floor manager; I'll stay on this call until it's fixed.", tone: "kind", next: "issue" },
          { t: "Every customer is treated equally, madam.", tone: "honest", p: -6, next: "issue" },
          { t: "Everyone waits. That's how phones work.", tone: "rude", next: "issue" }] },
        issue: { say: "My phone loses every call in the Akasaka building. Every one. And your people told me to 'stand by a window'.", opts: [
          { t: "That's a coverage gap in that building. I'll order a SOTI indoor booster for your office today, installed free, and I'll call you myself Friday to check.", tone: "kind", p: 22, end: "resolved", reply: "…Finally, someone with sense. What did you say your name was? Seiko. I'll remember it." },
          { t: "Standing by a window does help, to be fair.", tone: "firm", p: -20, end: "escalated" },
          { t: "I'll make sure the agents who cut you off are disciplined.", tone: "dishonest", p: -4, end: "escalated", reply: "I don't care about your agents. I care about my phone." }] }
      } },

    // ---- every day (the floor manager's VIPs come from this pool too) ---------------------------------------------------------------
    stolen: { who: "Nishimura Kaede", age: 29, product: "SOTI So24", plan: "Standard 20GB", since: "2020", diff: 2, patience: 45,
      notes: ["!Device reported: last seen Shinmei Station, 18:02"],
      after: { resolved: "SIM blocked, phone locked, a loan phone ready at the Shinmei store.", escalated: "She's waiting for Security to call back. The phone is still unlocked.", hungup: "She went to the police instead." },
      nodes: { start: { say: "My phone was stolen on the train. My whole life is on it. My bank app. My photos. What do I do?", opts: [
        { t: "First, I'm blocking the SIM and locking the phone remotely, right now. Then a loan phone at the Shinmei store tonight.", tone: "kind", p: 20, end: "resolved", reply: "Okay. Okay. Thank you. I can breathe." },
        { t: "You should call the police.", tone: "firm", end: "escalated" },
        { t: "People should hold on to their phones.", tone: "rude", end: "hungup" }] } } }
  };

  // ---- the floor ------------------------------------------------------------------------------------------------------------------------
  O.incidents = {
    aircon: { who: ["mori", "ogawa"], title: "The air-con war", brief: "Mori and Ogawa are fighting over the air conditioning again", pool: true,
      nodes: {
        start: { lines: [["Mori", "It's nineteen degrees in here. My fingers are blue. I can't type."], ["Ogawa", "It's a sauna! I've sweated through my shirt by ten o'clock."]], opts: [
          { t: "Swap desks: Mori by the window where it's warm, Ogawa under the vent. Same team, two climates.", tone: "tactful", morale: 0.08, next: "gondo" },
          { t: "Grow up, both of you. Back to work.", tone: "harsh", morale: -0.1, next: "gondo" },
          { t: "Ogawa's senior. It stays cold.", tone: "blunt", morale: -0.04, next: "gondo" }] },
        gondo: { tag: "Gondō walks over", lines: [["Gondō", "What's all this? Simple. I'll lock the remote in my office. Nobody touches it but me. I like it at seventeen."]], opts: [
          { t: "Good thinking, Gondō-san. Maybe we keep the remote in your office, set to twenty-two, and they've swapped desks anyway.", tone: "tactful", gondo: 0.06, morale: 0.06, end: true, good: true, reply: "Gondō: “…Twenty-two. Yes. That was my idea.”" },
          { t: "With respect, seventeen would freeze the whole floor. No.", tone: "blunt", gondo: -0.12, morale: 0.05, end: true, good: true },
          { t: "Whatever you think, Gondō-san.", tone: "yield", gondo: 0.08, morale: -0.14, end: true, good: false, reply: "Mori puts her coat on. And her scarf." }] }
      } },
    newhire: { who: ["ishikawa"], title: "A rough call", brief: "The new hire, Ishikawa, has just been screamed at by a caller", pool: true,
      nodes: {
        start: { lines: [["Ishikawa", "(quietly) He called me useless. He said he'd find out where I live. I… I'm fine. I'm fine."]], opts: [
          { t: "You're not fine, and that's okay. Take fifteen minutes. Get a coffee, get some air. I'll cover your queue.", tone: "kind", morale: 0.1, stress: 0.03, next: "gondo" },
          { t: "Shake it off. It's part of the job.", tone: "harsh", morale: -0.08, next: "gondo" },
          { t: "Was he right? Were you useless?", tone: "harsh", morale: -0.15, next: "gondo" }] },
        gondo: { tag: "Gondō, from his doorway", lines: [["Gondō", "Ishikawa! Why aren't you on the phone? Breaks are at twelve. Not when you feel like it."]], opts: [
          { t: "I sent him, Gondō-san. A threat on a call goes to Security; he's writing it up for them. Proper procedure.", tone: "tactful", gondo: 0.02, morale: 0.08, end: true, good: true, reply: "Gondō: “…Procedure. Right. Carry on.”" },
          { t: "Leave him alone. He just got threatened.", tone: "blunt", gondo: -0.12, morale: 0.06, end: true, good: true },
          { t: "Back to your desk, Ishikawa.", tone: "yield", gondo: 0.06, morale: -0.16, end: true, good: false, reply: "Ishikawa puts his headset back on. His hands are shaking." }] }
      } },
    credit: { who: ["nakano", "gondo"], title: "Whose idea was it?", brief: "Gondō is presenting Nakano's idea to HQ as his own", pool: false,
      nodes: {
        start: { lines: [["Nakano", "That callback system Gondō just emailed to HQ? 'Gondō's Callback Initiative'? I wrote that. Every word. He changed the font."]], opts: [
          { t: "I believe you. Let me talk to him.", tone: "kind", morale: 0.05, next: "gondo" },
          { t: "Do you have proof? Emails, drafts?", tone: "tactful", morale: 0.02, reply: "Nakano: “The file history. My name's on every version.”", next: "gondo" },
          { t: "That's how it works here. Let it go.", tone: "yield", morale: -0.12, end: true, good: false }] },
        gondo: { tag: "Gondō's office", lines: [["Gondō", "Seiko! Did you see my callback initiative? HQ loved it. I might get a bonus."]], opts: [
          { t: "It's great work. HQ would love it even more as 'a 3F team initiative led by Gondō, designed by Nakano'. It makes you look like a leader who builds people.", tone: "tactful", gondo: 0.04, morale: 0.12, end: true, good: true, reply: "Gondō: “A leader who builds people… Yes. I'll send a correction.”" },
          { t: "It's Nakano's work, and you know it. Tell HQ, or I will.", tone: "blunt", gondo: -0.2, morale: 0.1, end: true, good: true, reply: "Gondō goes very red. He sends the correction. He will not forget this." },
          { t: "Congratulations, Gondō-san.", tone: "yield", gondo: 0.1, morale: -0.15, end: true, good: false, reply: "Nakano saw you through the glass. She's updating her CV." }] }
      } },
    late: { who: ["fujita"], title: "Late again", brief: "Fujita has been late four times this month", pool: true,
      nodes: {
        start: { lines: [["Fujita", "I know, I know. Fourth time. My daughter's nursery doesn't open till 8:30 and the train's forty minutes. I can't be in two places."]], opts: [
          { t: "Then let's change your hours: 9:30 to 6:30. You cover the evening rush, which we need anyway.", tone: "kind", morale: 0.1, next: "gondo" },
          { t: "Your daughter isn't SOTI's problem.", tone: "harsh", morale: -0.14, next: "gondo" },
          { t: "One more time and it's a written warning.", tone: "blunt", morale: -0.05, next: "gondo" }] },
        gondo: { tag: "Gondō overhears", lines: [["Gondō", "Changing hours? Nobody changes hours. I came in at seven every day for nineteen years. If he can't manage, he can go."]], opts: [
          { t: "And your nineteen years are why this floor works, Gondō-san. Fujita's evenings cut the queue after six: your numbers go up.", tone: "tactful", gondo: 0.05, morale: 0.08, end: true, good: true, reply: "Gondō: “My numbers. …Fine. A trial. One month.”" },
          { t: "This isn't 1995. We're doing it.", tone: "blunt", gondo: -0.14, morale: 0.08, end: true, good: true },
          { t: "You're right. Seven o'clock, Fujita.", tone: "yield", gondo: 0.08, morale: -0.16, end: true, good: false }] }
      } },
    script: { who: ["gondo", "mori"], title: "Gondō's new script", brief: "Gondō has written a new phone script and the team hates it", pool: false,
      nodes: {
        start: { lines: [["Mori", "Have you read it? We have to say 'SOTI: Make It Yours, Make It Today, Make It SOTI' before every call. And sing it. He wants us to SING it."], ["Gondō", "It's called energy, Mori."]], opts: [
          { t: "Let's test it properly: half the floor with the song, half without, for one week. The numbers decide.", tone: "tactful", gondo: 0.04, morale: 0.08, end: true, good: true, reply: "Gondō: “A test! Excellent. My half will crush it.” (It won't.)" },
          { t: "Nobody is singing, Gondō-san. Customers will think it's a prank call.", tone: "blunt", gondo: -0.15, morale: 0.1, end: true, good: true },
          { t: "Everyone sing, please.", tone: "yield", gondo: 0.1, morale: -0.18, end: true, good: false, reply: "Twenty-three people sing the SOTI song. Badly. Mori stares at you the whole time." }] }
      } },
    printer: { who: ["takeda"], title: "The copier is smoking", brief: "Takeda says the copier is smoking. Actually smoking", pool: true,
      nodes: {
        start: { lines: [["Takeda", "Seiko-san! The copier! There's smoke coming out of the back and it smells like burnt toast and… plastic?"]], opts: [
          { t: "Unplug it at the wall, open the window vents, and everyone away from it. I'll call Facilities.", tone: "kind", morale: 0.06, next: "gondo" },
          { t: "Probably just toner. Ignore it.", tone: "blunt", morale: -0.1, stress: 0.05, next: "gondo" }] },
        gondo: { tag: "Gondō appears", lines: [["Gondō", "Don't touch it! I'm printing the quarterly report. Forty pages. It will finish."]], opts: [
          { t: "Gondō-san, I'll print it on 5F for you, right now, while it cools. Safer for your report.", tone: "tactful", gondo: 0.06, morale: 0.06, end: true, good: true, reply: "Gondō: “5F has the colour printer… Fine.” The copier gives one last sad puff." },
          { t: "It's on fire. The report can wait.", tone: "blunt", gondo: -0.1, morale: 0.04, end: true, good: true },
          { t: "Let it finish, then.", tone: "yield", gondo: 0.06, morale: -0.12, stress: 0.06, end: true, good: false, reply: "Page 38 comes out on fire. The alarm goes off. Everyone stands in the street for an hour." }] }
      } },
    audit: { who: ["takeda", "gondo"], title: "The auditor wants the call logs", brief: "HQ's auditor wants three months of call logs, and some are missing", pool: false,
      nodes: {
        start: { lines: [["Takeda", "The auditor wants every call log since August. But September's are… gone. Gondō deleted a folder 'to save space'."], ["Gondō", "(whispering) Tell him the server crashed. Servers crash. It's normal."]], opts: [
          { t: "We tell him the truth: a folder was deleted by mistake, and IT's backups can restore it by tomorrow. Takeda, call IT.", tone: "honest", gondo: -0.04, morale: 0.08, end: true, good: true, reply: "The auditor nods and writes 'self-reported, restored'. Gondō breathes again." },
          { t: "Fine. The server crashed.", tone: "dishonest", gondo: 0.1, morale: -0.06, end: true, good: false, reply: "The auditor checks the server logs. There was no crash. He writes something long." },
          { t: "Gondō deleted them. It's his problem.", tone: "blunt", gondo: -0.22, morale: 0.02, end: true, good: false, reply: "The auditor writes 'management conflict, 3F'. Nobody comes out of that well." }] }
      } },
    blame: { who: ["gondo", "hayashi"], title: "The blame game", brief: "Gondō is blaming Hayashi for the audit's findings", pool: false,
      nodes: {
        start: { lines: [["Gondō", "Hayashi! Your call times are the reason the audit found problems. Two-minute average! Lazy!"], ["Hayashi", "They're long because I actually solve things on the first call…"]], opts: [
          { t: "Hayashi's first-call fix rate is the best on the floor. Long calls, fewer callbacks. Gondō-san, that's a strength we should show the auditor.", tone: "tactful", gondo: 0.04, morale: 0.1, next: "vip", good: true },
          { t: "Gondō-san, stop. You're embarrassing yourself.", tone: "blunt", gondo: -0.18, morale: 0.06, next: "vip" },
          { t: "Speed up, Hayashi.", tone: "yield", gondo: 0.08, morale: -0.14, next: "vip" }] },
        vip: { tag: "The phones", lines: [["Takeda", "Seiko-san! A VIP escalation on line one. It's… Sotiyama Reiko. Akio-sama's aunt. And the auditor is listening in."], ["Gondō", "I'm, er, in a meeting. You take it."]], opts: [
          { t: "Put it through to my desk. I'll take it.", tone: "kind", morale: 0.04, vip: "vip", good: true }] }
      } },
    vip: { who: ["takeda"], title: "A VIP on line one", brief: "A VIP escalation is waiting", pool: false,
      nodes: { start: { lines: [["Takeda", "A VIP escalation, Seiko-san. Line one."]], opts: [{ t: "Put it through to my desk.", tone: "kind", vip: "vip", good: true }] } } },
    // ---- every day ---------------------------------------------------------------------------------------------------------------------
    gossip: { who: ["kimura", "inoue"], title: "Office gossip", brief: "Kimura and Inoue are spreading a rumour about layoffs", pool: true,
      nodes: { start: { lines: [["Kimura", "Is it true? Half the floor's being replaced by an AI chatbot in spring?"], ["Inoue", "My cousin in HR says it's already decided."]], opts: [
        { t: "I haven't heard anything like that. If I do, you'll hear it from me first, not from a cousin.", tone: "honest", morale: 0.1, end: true, good: true },
        { t: "Maybe. So work harder.", tone: "harsh", morale: -0.16, end: true, good: false },
        { t: "Gondō-san says there's nothing to it.", tone: "dishonest", morale: 0.02, gondo: 0.04, end: true, good: false, reply: "Gondō, from his office: “There's WHAT to what?”" }] } } },
    headset: { who: ["sato"], title: "No headsets", brief: "Satō's headset is broken and there are no spares", pool: true,
      nodes: { start: { lines: [["Satō", "My headset's dead. Again. There are no spares, and Gondō says the budget's frozen till April."]], opts: [
        { t: "Use mine from the drawer for today, and I'll put in an order on my own sign-off.", tone: "kind", morale: 0.1, gondo: -0.04, end: true, good: true },
        { t: "Hold the phone to your ear like it's 1990.", tone: "harsh", morale: -0.1, end: true, good: false },
        { t: "Ask Gondō to unfreeze it. Nicely. Mention his budget skills.", tone: "tactful", morale: 0.04, gondo: 0.06, end: true, good: true, reply: "Gondō: “Well. A small exception. I am, after all, very good with budgets.”" }] } } },
    sick: { who: ["kato"], title: "Sick at his desk", brief: "Katō has come in with a fever so he doesn't 'let the team down'", pool: true,
      nodes: { start: { lines: [["Katō", "(coughing) I'm fine. Thirty-eight point five. Gondō says taking a sick day shows a lack of fighting spirit."]], opts: [
        { t: "Go home, Katō. Paid sick day. I'll square it with Gondō.", tone: "kind", morale: 0.12, gondo: -0.06, end: true, good: true },
        { t: "Wear a mask and keep going.", tone: "blunt", morale: -0.1, end: true, good: false, reply: "Three more people are coughing by Thursday." },
        { t: "Fighting spirit! Good man.", tone: "yield", morale: -0.14, gondo: 0.06, end: true, good: false }] } } },
    overtime: { who: ["nakano"], title: "Unpaid overtime", brief: "Nakano has been staying till ten every night, unpaid", pool: true,
      nodes: { start: { lines: [["Nakano", "Gondō 'suggested' the queue should be zero before anyone leaves. So I stay. Till ten. Unpaid. Every night."]], opts: [
        { t: "That stops today. The queue goes to the evening shift at 6. Anyone who stays gets paid for it.", tone: "kind", morale: 0.12, gondo: -0.08, end: true, good: true },
        { t: "That's just the culture here. We all stay late.", tone: "yield", morale: -0.12, end: true, good: false },
        { t: "I'll ask Gondō to log it as paid overtime: his staff working hard makes his numbers look great.", tone: "tactful", morale: 0.08, gondo: 0.04, end: true, good: true }] } } },
    complaint: { who: ["hayashi"], title: "A complaint about you", brief: "Hayashi has a complaint, and it's about you", pool: true,
      nodes: { start: { lines: [["Hayashi", "Can I be honest? Since you got promoted, you walk past us like we're furniture. You never say good morning any more."]], opts: [
        { t: "You're right, and thank you for telling me. Good morning, Hayashi. I mean it.", tone: "honest", morale: 0.12, end: true, good: true },
        { t: "I'm a manager now. I'm busy.", tone: "harsh", morale: -0.12, end: true, good: false },
        { t: "Who else thinks that?", tone: "blunt", morale: -0.06, end: true, good: false }] } } }
  };
})();
