// A tour for screenshots: the HUD with its rings, the map, every kind of shop from outside, a walk-in interior, each activity, every phone app.
export default async (page, snap) => {
  const ev = (f, a) => page.evaluate(f, a);
  const wait = (ms) => page.waitForTimeout(ms);
  await wait(500);
  await page.keyboard.press('Enter'); await wait(2500);
  await ev(async () => { const m = await import('/src/state.js'); m.gs.stress = 0.55; m.gs.health = 0.8; });
  await wait(600); await snap('hud_rings');
  await page.keyboard.press('KeyM'); await wait(800); await snap('map'); await page.keyboard.press('Escape'); await wait(400);
  // each brand from the street
  const brands = await ev(() => { const seen = new Set(); return window.game.city.shops.filter((s) => !seen.has(s.brand) && seen.add(s.brand)).map((s) => s.brand); });
  console.log('brands', brands.join(','));
  for (const b of brands) {
    await ev((br) => { const g = window.game; const s = g.city.shops.find((x) => x.brand === br); const n = s.outN; g.player.teleport(s.door.x + n.x * 2.5, 0.3, s.door.z + n.z * 2.5); g.player.face = Math.atan2(-n.x, -n.z); g.rig.yaw = Math.atan2(n.x, n.z) + 0; g.rig.snap(); }, b);
    await wait(1500); await snap('shop_' + b);
  }
  // inside one
  await ev(() => { const g = window.game; const s = g.city.shops.find((x) => x.brand === 'eleven'); g.player.teleport(s.door.x, 0.3, s.door.z); });
  await wait(600); await page.keyboard.press('KeyE'); await wait(1800); await snap('inside_eleven');
  await ev(() => { const g = window.game; const c = g.inside.counter.door; g.player.teleport(c.x, 0.1, c.z); });
  await wait(600); await page.keyboard.press('KeyE'); await wait(600); await snap('inside_counter'); await page.keyboard.press('Escape'); await wait(500);
  await ev(() => { const g = window.game; const c = g.inside.exit.door; g.player.teleport(c.x, 0.1, c.z); });
  await wait(600); await page.keyboard.press('KeyE'); await wait(1500);
  // activities
  for (const b of ['sento', 'pachinko', 'karaoke', 'arcade']) {
    await ev((br) => { const g = window.game; const s = g.city.shops.find((x) => x.brand === br); if (s) g.player.teleport(s.door.x, 0.3, s.door.z); }, b);
    await wait(700); await page.keyboard.press('KeyE'); await wait(900); await snap('activity_' + b);
    await page.keyboard.press('Escape'); await wait(500);
  }
  // every app
  await ev(async () => { const m = await import('/src/state.js'); m.gs.device = 'p17pm'; m.gs.owned.p17pm = true; });
  for (const app of ['Ryde', 'Poodle', 'Wallet', 'Camera', 'Photos', 'MyGram', 'Nihon', 'Phone', 'Mail', 'Contacts', 'Music', 'Settings', 'Numbers', 'Health']) {
    await page.keyboard.press('KeyP'); await wait(600);
    await ev((a) => window.game.phone.openApp(a), app);
    await wait(900); await snap('app_' + app.toLowerCase());
    await page.keyboard.press('KeyP'); await wait(400);
  }
};
