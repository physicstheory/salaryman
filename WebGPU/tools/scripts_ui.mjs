// Plays through the game's screens: new game, a drive, a shop, the phone (three handsets), the map, the pause menu, both wheels.
export default async (page, snap) => {
  const ev = (f, a) => page.evaluate(f, a);
  const wait = (ms) => page.waitForTimeout(ms);
  await wait(500);
  await page.keyboard.press('Enter');          // NEW GAME
  await wait(2500);
  await snap('walking');
  // get into the first car and drive a little
  await ev(() => { const g = window.game; const v = g.parked[0]; const t = v.body.translation(); g.player.teleport(t.x - 2.5, 0.3, t.z); });
  await wait(1200);
  await page.keyboard.press('KeyE');
  await wait(800);
  await page.keyboard.down('KeyW');
  await wait(5000);
  await snap('driving');
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS'); await wait(3000); await page.keyboard.up('KeyS');
  await ev(() => { window.game.current && (window.game.current.handbrake = true); });
  await wait(500);
  console.log(JSON.stringify(await ev(() => { const c = window.game.current; return c ? { kmh: c.speedKmh(), gear: c.gear, rpm: Math.round(c.rpm) } : null; })));
  await page.keyboard.press('KeyE');
  await wait(800);
  // a shop
  const door = await ev(() => { const g = window.game; const s = g.city.shops.find((x) => x.brand === 'eleven'); g.player.teleport(s.door.x, 0.3, s.door.z); return [s.door.x, s.door.z]; });
  await wait(800);
  await page.keyboard.press('KeyE'); await wait(600);
  await snap('shop');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await wait(300);
  await snap('shop_bought');
  await page.keyboard.press('Escape'); await wait(500);
  // the phone, in three brands
  for (const [dev, shot] of [['so24', 'phone_soti'], ['p16pm', 'phone_pear'], ['eleven', 'phone_eleven']]) {
    await ev((d) => { const g = window.game; g.phone.rebuild; window.__gs ??= null; }, dev);
    await ev(async (d) => { const m = await import('/src/state.js'); m.gs.device = d; m.gs.owned[d] = true; m.gs.phonePaint = 0; }, dev);
    await page.keyboard.press('KeyP'); await wait(700);
    await snap(shot);
    if (dev === 'so24') { await page.keyboard.press('Enter'); await wait(500); await snap('phone_app'); }
    await page.keyboard.press('KeyP'); await wait(400);
  }
  // map
  await page.keyboard.press('KeyM'); await wait(700); await snap('map'); await page.keyboard.press('Escape'); await wait(400);
  // pause menu
  await page.keyboard.press('Escape'); await wait(700); await snap('pause'); await page.keyboard.press('Escape'); await wait(400);
  // the equipment wheel
  await ev(async () => { const m = await import('/src/state.js'); for (const id of ['onigiri', 'ramen_cup', 'canned_coffee']) m.gs.give(id, 2); m.gs.give('umbrella', 1); m.gs.give('earbuds', 1); });
  await page.keyboard.down('KeyQ'); await wait(700); await snap('wheel_equipment'); await page.keyboard.up('KeyQ'); await wait(400);
  // the radio wheel, in a car
  await ev(() => { const g = window.game; const v = g.parked[0]; const t = v.body.translation(); g.player.teleport(t.x - 2.5, 0.3, t.z); });
  await wait(800); await page.keyboard.press('KeyE'); await wait(600);
  await page.keyboard.down('KeyR'); await wait(900); await snap('wheel_radio'); await page.keyboard.up('KeyR'); await wait(300);
};
