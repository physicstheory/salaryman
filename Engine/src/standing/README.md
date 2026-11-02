# Standing: honor and respect

Two engines and their HUD. Nothing here knows about Seiko; the game hook is `Web/game/standing-hook.js`.

## Honor (`Honor.js`)
- One number, -100 to +100, with six tiers (Disgraced ... Honourable).
- `honor.deed(id, opts)` applies a deed from the host's table: `{ delta, label, icon, cooldown, same: [ids], group, window }`.
  - `cooldown`: the same deed id within N seconds counts once (the act and the witness's call are one deed).
  - `same`: other ids that are the same act (gunfire right after a shooting).
  - `group` + `window`: a spree is damped (60% for the second, 36% for the third, never below 20%).
  - Good deeds repeated within 10 minutes are worth 15% less each time (floor 35%).
- `honor.apply(delta, info)` for story beats. `honor.effects()` gives `askRate`, `priceMul`, `warmth`, `blindEye`.

## Respect (`Respect.js`)
- `value = rank.base + earned` (0 to 100). The host gives a ladder of ranks; `setRank(id)` promotes and emits an event.
- `greet("bow" | "antagonize", { id, temper, standing, warmth })` returns how the person answers and the change.
  Tempers: meek, polite, proud, hothead. People remember you (bowing twice is odd, antagonising the meek twice is harassment).
- `courtesy` grows with every bow and halves every five minutes; `bowChance(person)` is the chance a passer-by bows first.
- `returned(id)` when the player answers someone who bowed first. `earn(delta, info)` for jobs, missions.

## HUD (`StandingHud.js`)
- `push(ev)`: a mark under the wanted stars. Honor: round seal, red with a minus for a loss, gold with a plus for a gain. Respect: a silver-blue lozenge.
- `meter(honor, respect)`: slim double bar that fades. `card(info | null)`: full standing card.

Tests: `node Engine/tests/standing.test.mjs`; in game `Game/tools/standingtest.mjs <out>`.
