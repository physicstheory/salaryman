// The street talks back. What passers-by, shop staff, station staff, drivers and police say, by situation, each line recorded in six
// voices (three men, three women: "~m0".."~f2" in Web/audio/voice/index.json, built by Tools/voice/build_voices.py from the table below)
// and played from where the speaker stands (voice-all.js puts it in the 3D mix, with distance, direction and the room it is in).
//
//   barks.say(ctx, who, opts)   who = a street person (peds.list entry, actor, or {x, y, z, female}); a random line of that kind
//   barks.status()              what has been said lately
//
// The table between the markers is plain JSON: the voice build reads it. Add a line, run build_voices.py, and it is spoken.
(function () {
  "use strict";
  const BARKS = /*BARKS*/{
  "greet_morning": ["Ohayō gozaimasu.", "Morning.", "Good morning.", "Another Monday, huh.", "Morning. Cold one today."],
  "greet_day": ["Konnichiwa.", "Afternoon.", "Hello there.", "Nice day for it."],
  "greet_evening": ["Konbanwa.", "Evening.", "Otsukaresama desu.", "Long day? Me too."],
  "bow_back": ["Dōmo.", "Ah, dōmo dōmo.", "Thank you, thank you.", "Likewise.", "Good to see you."],
  "bump": ["Hey, watch it!", "Sumimasen!", "Excuse me!", "Look where you're going.", "Ow. Careful!", "Do you mind?", "Oi!", "Some of us are walking here."],
  "shove": ["What's your problem?", "Who do you think you are?", "Back off!", "Don't touch me!", "You want trouble?", "I'm calling the police."],
  "near_miss": ["Are you crazy?!", "Slow down!", "Abunai!", "That was a red light!", "You nearly killed me!", "Learn to drive!", "Watch the road!"],
  "hit": ["Argh!", "My leg!", "Ow! Ow!", "Somebody call an ambulance!", "I can't feel my arm…"],
  "witness": ["Is everyone okay?", "Call an ambulance!", "Did you see that?", "Oh my god.", "Someone get his plate number!"],
  "flee": ["Help!", "Run!", "He's got a gun!", "Somebody help!", "Tasukete!", "Get down!", "Everybody run!", "Get away from him!"],
  "hands": ["Don't shoot!", "Please, take what you want!", "I didn't see anything!", "I have a family!", "Okay, okay! Easy!"],
  "call_police": ["Police? There's a man with a gun…", "Hello, police? Come quickly!", "I'm calling the police!", "Yes, a man in a suit. He's still here."],
  "cop_stop": ["Stop! Police!", "Stay where you are!", "Get on the ground!", "Drop the weapon!", "Hands where I can see them!", "Don't move!"],
  "cop_chase": ["Suspect on foot, heading north!", "He's getting away!", "Pull over! Pull over now!", "Block the junction!", "Requesting backup!", "Stop the vehicle!"],
  "cop_calm": ["Move along, please.", "Everything all right here?", "Keep it moving.", "Evening, sir."],
  "clerk_hello": ["Irasshaimase!", "Irasshaimase, konnichiwa!", "Welcome!", "Hello, welcome in!"],
  "clerk_thanks": ["Arigatō gozaimashita!", "Thank you very much!", "Please come again!", "Thank you, have a good day!"],
  "clerk_ask": ["Would you like a bag?", "Do you have a point card?", "Shall I heat that up for you?", "Chopsticks?", "That's everything?"],
  "ramen": ["Irasshai!", "Take a seat anywhere!", "One ramen, coming up!", "Arigatō gozaimashita!"],
  "station": ["Please stand behind the yellow line.", "Please do not rush onto the train.", "The doors are closing.", "Mind the gap, please.", "Please hold the handrail."],
  "rain": ["Of course it's raining.", "I left my umbrella at the office.", "Ugh, my shoes.", "It's really coming down."],
  "heat": ["It's so hot.", "Atsui… atsui…", "I need a cold drink."],
  "cold": ["It's freezing.", "Samui!", "Should've worn a coat."],
  "phone": ["Yes, yes. I'll be there in ten minutes.", "No, I already sent it.", "Moshi moshi? Sorry, I'm on the street.", "Tell him I'm in a meeting.", "I'll call you back. I'm on my way.", "What do you mean the deadline moved?", "Yes, Mum. I'm eating properly.", "Can you hear me? Hello?"],
  "chat": ["Did you see the match last night?", "The trains were a mess this morning.", "My boss wants it by Friday.", "Let's get yakitori after work.", "Have you tried the new ramen place?", "I can't believe it's only Tuesday.", "Is that place still open?", "He said he'd call. He didn't call."],
  "drunk": ["One more bar! One more!", "Kanpai!", "I love this city!", "Where's… where's the station?", "Who wants karaoke?!"],
  "tired": ["Another late one.", "I just want to sleep.", "Last train… I can make it.", "Overtime again."],
  "admire_car": ["Nice car!", "Whoa. Look at that.", "Is that yours?", "How much does that cost?"],
  "admire_watch": ["Is that real?", "Nice watch.", "Somebody's doing well."],
  "driver_angry": ["Move it!", "Come on!", "Get out of the road!", "Are you blind?", "Learn to drive!", "It's green! Go!"],
  "fight": ["Is that all you've got?", "Come on then!", "You'll regret that.", "Get him!", "Stay down!"],
  "hurt": ["Ugh!", "Argh!", "My nose!", "Okay, okay, I give up!"],
  "vendor": ["Yakitori! Fresh off the grill!", "Hot sweet potatoes!", "Free tissues, please take one!", "Try our new menu, please!", "Two for one, today only!"],
  "kid": ["Mum, look!", "Can we get ice cream?", "I'm hungry!"],
  "tourist": ["Excuse me, which way is the station?", "Is this the way to the shrine?", "Can you take our photo?"]
}/*END*/;
  const B = window.barks = { table: BARKS, last: {}, log: [] };
  const pick = a => a[(Math.random() * a.length) | 0];
  // one line from a context, not the same one twice in a row, not more than once every few seconds from the same kind
  B.line = function (ctx) {
    const a = BARKS[ctx]; if (!a || !a.length) return null;
    let l = pick(a); if (a.length > 1 && l === B.last[ctx]) l = pick(a);
    B.last[ctx] = l; return l;
  };
  B.cool = {};
  B.say = function (ctx, who, opts) {
    opts = opts || {};
    const now = performance.now() / 1000, gap = opts.gap !== undefined ? opts.gap : 2.2;
    if (B.cool[ctx] && now - B.cool[ctx] < gap && !opts.force) return null;
    const line = opts.line || B.line(ctx); if (!line) return null;
    B.cool[ctx] = now;
    B.log.push({ t: Math.round(now), ctx: ctx, line: line }); if (B.log.length > 30) B.log.shift();
    if (window.VO && VO.bark) VO.bark(who, line, { ctx: ctx, subtitle: opts.subtitle !== false, secs: opts.secs });
    else if (opts.subtitle !== false && typeof say === "function") say("“" + line + "”", opts.secs || 2.2);
    return line;
  };
  B.status = () => ({ contexts: Object.keys(BARKS).length, lines: Object.values(BARKS).reduce((n, a) => n + a.length, 0), recent: B.log.slice(-8) });
})();
