// Boot: load the data, create the renderer and the world, then hand over to the game loop.
import { Data } from './data.js';
import { Game } from './game.js';

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
