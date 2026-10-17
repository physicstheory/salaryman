// A few views of the city: street level, an aerial at three hours, and a drive.
export default async (page, snap) => {
  await page.waitForTimeout(800);
  const view = async (label, x, y, z, tx, ty, tz, hour) => {
    await page.evaluate(([x, y, z, tx, ty, tz, hour]) => {
      const g = window.game;
      if (hour !== undefined) g.sky.debugHour = hour;
      g.rig.enabled = false;
      g.camera.position.set(x, y, z);
      g.camera.lookAt(tx, ty, tz);
    }, [x, y, z, tx, ty, tz, hour]);
    await page.waitForTimeout(1800);
    await snap(label);
  };
  const c = 208;
  await view('aerial_noon', c + 120, 95, c + 260, c, 10, c - 30, 13);
  await view('aerial_dusk', c + 120, 95, c + 260, c, 10, c - 30, 18.3);
  await view('aerial_night', c + 120, 95, c + 260, c, 10, c - 30, 22);
  await view('street_noon', 2 * 52 + 3, 3.2, 5 * 52 + 38, 2 * 52 + 3, 2, 5 * 52 - 8, 13);
  await view('street_night', 2 * 52 + 3, 3.2, 5 * 52 + 38, 2 * 52 + 3, 2, 5 * 52 - 8, 22);
};
