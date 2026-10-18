// Boot: load the data, create the renderer and the world, then hand over to the game loop.
import { Data } from './data.js';
import { Game } from './game.js';

// Anything that goes wrong is kept and shown with F10, so a black screen can be reported with its reason.
const errs = [];
const log = document.createElement('div'); log.id = 'errlog'; document.body.append(log);
const note = (m) => { errs.push(String(m)); if (errs.length > 40) errs.shift(); log.textContent = 'F10 hides this. Please send a photo of it.\n\n' + errs.join('\n'); };
addEventListener('error', (e) => note('error: ' + e.message));
addEventListener('unhandledrejection', (e) => note('promise: ' + (e.reason && e.reason.message || e.reason)));
const ce = console.error.bind(console); console.error = (...a) => { note('console.error: ' + a.map((x) => (x && x.message) || x).join(' ')); ce(...a); };
const cw = console.warn.bind(console); console.warn = (...a) => { const m = a.join(' '); if (!/model missing|mesh missing/.test(m)) note('warn: ' + m.slice(0, 300)); cw(...a); };
addEventListener('keydown', (e) => { if (e.code === 'F10') log.classList.toggle('on'); });

const line = document.getElementById('boot-line');
const say = (t) => { line.textContent = t; };

(async () => {
  try {
    say('Reading the tables…');
    await Data.load();
    const game = new Game();
    await game.init(say);
    document.getElementById('boot').classList.add('gone');
    game.start();
    window.game = game;
  } catch (err) {
    console.error(err);
    say('Could not start: ' + (err && err.message ? err.message : err));
  }
})();
