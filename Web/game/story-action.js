// Set pieces: the action steps (action-steps.js) worked into missions that were a walk to a marker and a conversation.
//
//   SOTI   19 The Driver          drive Akio to his dinner without throwing him about (passenger comfort, a time limit)
//          23 The Journalist      a photographer from the 58th floor was watching the interview: catch him
//          34 The Whistle         Nakano walks past you at the station: follow her, unseen, to where she will talk
//   Kurogane-kai
//          A Friendly Reminder    Tanabe sees the lanyard and runs
//          Cold Chain             the ice truck, against the clock; every hard knock cracks the load
//          The Old Man's Driver   the oyabun to his mother's grave, gently
//
// Each step is inserted next to the old one rather than replacing the mission, so the talks, flags and endings are untouched.
(function () {
  "use strict";
  const C = window.career, G = C && C.saga, Y = C && C.yakuza;
  if (!window.questAction) return;
  const at = (steps, test) => steps.findIndex(test);

  if (G && G.missions) {
    // 19 The Driver
    const m19 = G.missions[19];
    if (m19 && !m19.action) {
      m19.action = true;
      const i = at(m19.steps, s => s.go && s.go.venue);
      if (i >= 0) m19.steps.splice(i, 0, { drive: { to: m19.steps[i].go, secs: 300, smooth: true, label: "Drive the president",
        text: "Drive Sotiyama Akio to his dinner", hint: "He's in the back with a glass of whisky. Brake early, take corners slowly, keep it under 70.",
        smoothFail: "Akio: “STOP the car. Out. I'll have the restaurant send a car. You can walk to the job centre.”", lateFail: "Akio: “Forty minutes late. To dinner with HIM.” He rings for a taxi.", done: "Akio, climbing out: “Adequate. Wait here.”" } });
    }
    // 23 The Journalist
    const m23 = G.missions[23];
    if (m23 && !m23.action) {
      m23.action = true;
      m23.people = Object.assign({}, m23.people, { watcher: { name: "Ishida, 58F security", look: "salaryman_09" } });
      m23.talks = Object.assign({}, m23.talks, { watcher: { start: { who: "Ishida", say: "(Winded, against a shutter, the camera held to his chest) Orders. From upstairs. Photograph who she talks to. …It's just pictures, sir. It's just my job.", opts: [
        { t: "“Delete the ones of her. Keep the ones of me. Tell him exactly what I said to her.”", score: 1, honor: 3, end: true, reply: "He scrolls and deletes, hands shaking. “Thank you, sir. …He'll still ask.”" },
        { t: "Take the memory card.", score: 1, favor: -2, flag: "took_card", end: true, reply: "You pocket it. Ishida doesn't argue. His expression says the 58th floor will." },
        { t: "“Show me. …Good. Send them to him. All of them.”", score: 0, honor: -3, favor: 2, end: true, reply: "He nods and runs, glad to be out of it." }] } } });
      const i = at(m23.steps, s => s.talk === "rep");
      if (i >= 0) m23.steps.splice(i + 1, 0,
        { say: "Across the road a man with a long lens lowers his camera. A SOTI lanyard. He sees you see him.", secs: 4 },
        { chase: { who: "watcher", lead: 14, secs: 80, speed: 4.25, text: "Catch the photographer", hint: "Sprint (Shift / LB). He's not built for this; you've done the stairs at SOTI for a year.", caught: "Ishida runs out of breath before he runs out of street." } },
        { talk: "watcher", who: "watcher" });
    }
    // 34 The Whistle
    const m34 = G.missions[34];
    if (m34 && !m34.action) {
      m34.action = true;
      const i = at(m34.steps, s => s.go && s.go.station);
      if (i >= 0) {
        m34.steps[i] = Object.assign({}, m34.steps[i], { text: "Be at Gakushicho Station after dark", radius: 9 });
        m34.steps.splice(i + 1, 0,
          { say: "Nakano walks past you without a glance and keeps going. Behind her, nobody. Behind you, you hope, the same.", secs: 5 },
          { tail: { who: "nak", to: { away: 240 }, text: "Follow Nakano, at a distance", hint: "Stay well back. When she stops and looks round, be somewhere she won't see you.", arrived: "Nakano stops under a broken streetlight and waits." } });
      }
    }
  }

  if (Y && Y.jobs) {
    const debt = Y.jobs.benzo_debt;
    if (debt && !debt.action) {
      debt.action = true;
      const i = at(debt.steps, s => s.talk === "debtor");
      if (i >= 0) debt.steps.splice(i, 0, { chase: { who: "debtor", secs: 70, speed: 4.1, text: "Catch Tanabe", hint: "He knows the alleys. You know he has a bad knee.", shout: "Tanabe sees the lanyard, drops the ladle, and runs.", caught: "Tanabe's knee gives out by a vending machine." } });
      try { const s = debt.talks.debtor.start; if (!/out of breath/i.test(s.say)) s.say = "(Out of breath, one hand on the vending machine) " + s.say; } catch (e) { /* talk changed */ }
    }
    const ice = Y.jobs.hide_ice;
    if (ice && !ice.action) {
      ice.action = true;
      const i = at(ice.steps, s => s.by !== undefined);
      if (i >= 0) {
        const to = ice.steps[i].go;
        ice.steps[i] = { drive: { to: to, secs: 210, cargo: true, vehicle: "truck", label: "Ice to the market", text: "Get the ice to the fish market before it melts", hint: "Hide's at the auction floor. Every knock cracks a block: don't hit anything.",
          cargoHit: "Ice cracks in the back.", cargoFail: "Hide, on the phone: “It's slush. You've delivered me slush.”", lateFail: "Hide, on the phone: “Auction's over. The tuna's sold. Bring me a mop.”", done: "The market men start unloading before the engine's off." } };
      }
    }
    const hq = Y.jobs.hq_drive;
    if (hq && !hq.action) {
      hq.action = true;
      const i = at(hq.steps, s => s.go && s.go.site === "Gosho Gardens");
      if (i >= 0) hq.steps.splice(i, 0, { drive: { to: hq.steps[i].go, secs: 360, smooth: true, label: "Drive the oyabun", text: "Drive the oyabun to the Gosho Gardens", hint: "Slowly. He gets carsick, and he will tell Kuroda.",
        smoothFail: "Jūzō: “Pull over. …I'll have Kuroda fetch me. Don't take it to heart.” You do.", lateFail: "Jūzō: “The gates close at dusk. Take me home.”", done: "Jūzō: “Smooth. My old driver never managed smooth.”" } });
    }
  }
  console.log("[StoryAction] chases, tails and drives in missions 19, 23, 34 and three Kurogane-kai jobs");
})();
