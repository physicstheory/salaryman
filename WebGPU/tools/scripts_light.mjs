// The street and the skyline at several hours, for tuning the light.
export default async (page, snap) => {
  await page.waitForTimeout(600);
  const view = async (label, x, y, z, tx, ty, tz, hour) => {
    await page.evaluate(([x, y, z, tx, ty, tz, hour]) => { const g = window.game; g.sky.debugHour = hour; g.titleUp = false; g.hud.el.style.display = 'none'; g.title.close(); g.rig.enabled = false; g.camera.position.set(x, y, z); g.camera.lookAt(tx, ty, tz); }, [x, y, z, tx, ty, tz, hour]);
    await page.waitForTimeout(2200);
    await snap(label);
  };
  for (const h of (process.env.HOURS || '12.5,17.2,21').split(',').map(Number)) await view('street_' + h, 2 * 52 + 3, 3.2, 5 * 52 + 38, 2 * 52 + 3, 4, 5 * 52 - 8, h);
  for (const h of (process.env.AHOURS || '12.5,23').split(',').map(Number)) await view('aerial_' + h, 208 + 120, 95, 208 + 260, 208, 10, 208 - 30, h);
};
