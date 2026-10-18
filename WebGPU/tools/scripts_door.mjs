// Walks into a shop and back out again with no key pressed.
export default async (page, snap) => {
  const ev = (f, a) => page.evaluate(f, a);
  const wait = (ms) => page.waitForTimeout(ms);
  await wait(500); await page.keyboard.press('Enter'); await wait(2500);
  await ev(() => { const g = window.game; const s = g.city.shops.find((x) => x.brand === 'ramen'); g.player.teleport(s.door.x + s.outN.x * 2.5, 0.3, s.door.z + s.outN.z * 2.5); window.__s = s; });
  await wait(800);
  await ev(() => { const g = window.game; const s = window.__s; g.player.teleport(s.door.x, 0.3, s.door.z); });
  await wait(1500);
  console.log('inside', await ev(() => !!window.game.inside));
  await snap('door_in');
  await ev(() => { const g = window.game; const d = g.inside.exit.door; g.player.teleport(d.x, 0.1, d.z); });
  await wait(5000);
  console.log('inside after exit', await ev(() => !!window.game.inside));
  await snap('door_out');
};
