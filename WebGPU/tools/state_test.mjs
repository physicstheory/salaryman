// Rules checks for the shop data and the player state (no rendering needed). Run: node tools/state_test.mjs
import fs from 'fs';
import { Data } from '../src/data.js';
import { gs } from '../src/state.js';

await Data.load(JSON.parse(fs.readFileSync(new URL('../assets/data/game_data.json', import.meta.url))));
const fails = [];
for (const b of ['eleven', 'petmart', 'arms', 'vending', 'ramen', 'sushi', 'pharmacy', 'books', 'clothes', 'dokoto']) {
  const sh = Data.shelvesFor(b);
  const n = sh.reduce((a, s) => a + s.items.length, 0);
  console.log(b.padEnd(9), sh.length, 'shelves,', n, 'items');
  if (!n) fails.push('empty shop ' + b);
}
let e = 0;
for (const s of Data.shelvesFor('petmart')) for (const it of s.items) if (it.id === 'eleven') e++;
if (e) fails.push('petmart sells the 11 phone');
gs.stress = 0.8;
const r = gs.eatRelief('ramen', -0.1);
console.log('comfort relief at stress 0.8:', r);
if (r > -0.15) fails.push('comfort food should help more when stressed');
gs.stress = 0.1;
if (gs.eatRelief('ramen', -0.1) !== -0.1) fails.push('comfort bonus applied when calm');
gs.stress = 0.6;
const before = gs.stress;
gs.spend(5000);
if (gs.stress >= before) fails.push('buying did not ease stress');
if (gs.money !== 495000) fails.push('money wrong');
gs.give('bento', 1);
gs.health = 0.5;
const line = gs.use('bento');
console.log('use bento:', line, 'health', gs.health);
if (gs.health <= 0.5 || gs.hasItem('bento')) fails.push('bento did not heal or was not consumed');
gs.health = 0.5;
for (let i = 0; i < 600; i++) gs.tick(0.1);
if (gs.health !== 0.5) fails.push('health regenerated on its own');
gs.stress = 0.5; gs.outdoors = true;
for (let i = 0; i < 600; i++) gs.tick(0.1);
if (gs.stress >= 0.5) fails.push('outdoors did not ease stress');
// an online order arrives in the bag
gs.reset();
gs.order('bento', 'Bento', 500, 1);
gs.advanceMinutes(90);
gs.tick(0.01);
if (!gs.hasItem('bento')) fails.push('the delivery did not arrive');
// a new game really is new: ten past five, day one, the same money
gs.reset();
if (gs.clockMin !== 17 * 60 + 10 || gs.day !== 1 || gs.money !== 500000) fails.push('reset is not a fresh game');
console.log('STATE TEST', fails.length ? 'FAILED: ' + fails.join(', ') : 'PASSED');
process.exit(fails.length ? 1 : 0);
