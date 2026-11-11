# Realism engine

A lived-in city: every plot given a purpose, every home its households, every person a job or a school and a day of their own.
Plain data in and out (no THREE), deterministic from the world seed, so the same woman walks the same dog past the same shrine
every morning without anything being saved.

| File | What it does |
|---|---|
| `Rng.js` | hashing: everything is a pure function of the seed and a few integers |
| `Calendar.js` | weekday, Japanese public holidays (Monday rules, substitutes), Golden Week, Obon, New Year, school terms, payday (25th), bonus months, rubbish collection rota per ward, sun times |
| `Places.js` | plot kind → purpose (konbini, ramen, izakaya, pharmacy, offices, school, shrine, park, home ...), name, opening hours, weekly day off, staff, state at a minute (open / preparing / closing / closed, busy) |
| `Census.js` | households per home (families, singles, elderly couples, students, the family over the shop), people (age, sex, role, traits, temper, name), jobs and schools matched to real workplaces by capacity |
| `Routines.js` | `Planner`: one person's day as segments from 04:00 to 04:00 (sleep, home, travel by foot/bike/train, work, lunch, smoke, queue, drinks, taiso, shrine, bench, ...), cached |
| `Realism.js` | `RealismEngine`: build, `whereAt`, `describe`, local population (`focus`/`tick` in budgeted slices), `peopleOut`, `scenes`, `placeState`, `garbageAt`, `windowLife`, `dressing`, `homeLights`; `WINDOW_LIFE_GLSL` for census-lit windows |

The game side is `Web/game/realism-hook.js` (see its header for what it changes and the `window.realism` API).

Test: `node Engine/tests/realism.test.mjs`.
