// Playwright: the focus-mode restore button is a kit IconButton xs at the kit's own sizes, whatever the window. With a
// mouse it is drawn 24 and pressed only where drawn, on a wide or a narrow window; on a coarse pointer (a tablet or a
// phone) it is still drawn 24 and its press is the kit's own 44 (xs's hit area), all of it on the screen (the restore
// sits --xs-press-out in from the corner there). Read on the Board in focus mode, both themes.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

async function restore(page: Page, theme: 'light' | 'dark') {
  await gotoHub(page, '/board', { theme });
  await page.getByRole('button', { name: /^Focus/ }).first().click({ timeout: 60_000 }); // reason: the strip shows Focus as an icon or a text button by its width; either turns focus mode on
  const btn = page.locator('[data-hub-chrome-restore] button');
  await expect(btn).toBeVisible({ timeout: 20_000 });
  return btn.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // The press: the farthest point from the centre, each way, that still lands on the button (::after included) and is
    // on the screen: the walk stops where the screen ends (nothing there, within 1 px of its edge), so a press cut by
    // the edge counts only what a thumb can reach. Nothing under a point well inside the screen is an error, not a pass.
    const reach = (dx: number, dy: number) => {
      for (let d = 0; d < 40; d += 0.5) {
        const x = cx + dx * (d + 0.5);
        const y = cy + dy * (d + 0.5);
        const e = document.elementFromPoint(x, y);
        if (!e && Math.min(x, y, innerWidth - x, innerHeight - y) < 1) return d;
        if (!e) throw new Error(`nothing under ${x},${y}, inside the screen`);
        if (e !== b && !b.contains(e)) return d;
      }
      return 40;
    };
    return { w: Math.round(r.width), h: Math.round(r.height), pressW: reach(-1, 0) + reach(1, 0), pressH: reach(0, -1) + reach(0, 1) };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`a mouse on a wide window (${theme})`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test(`the restore is the kit's xs: drawn 24, pressed only where drawn (${theme})`, async ({ page }) => {
      const r = await restore(page, theme);
      expect([r.w, r.h], 'drawn').toEqual([24, 24]);
      expect(r.pressW, 'a mouse presses no wider than drawn').toBeLessThanOrEqual(25);
      expect(r.pressH, 'a mouse presses no taller than drawn').toBeLessThanOrEqual(25);
    });
  });

  test.describe(`a coarse pointer (${theme})`, () => {
    test.use({ viewport: { width: 1024, height: 800 }, hasTouch: true, isMobile: true });
    test(`the restore is drawn 24 and pressed 44 on the screen, the kit's own touch hit (${theme})`, async ({ page }) => {
      const r = await restore(page, theme);
      expect([r.w, r.h], 'drawn').toEqual([24, 24]);
      expect(r.pressW, 'the press is a thumb wide').toBeGreaterThanOrEqual(43);
      expect(r.pressH, 'the press is a thumb tall').toBeGreaterThanOrEqual(43);
    });
  });

  test.describe(`a phone: narrow and coarse at 390 (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test(`the restore is drawn 24 and pressed 44 on the screen, the kit's own touch hit (${theme})`, async ({ page }) => {
      const r = await restore(page, theme);
      expect([r.w, r.h], 'drawn').toEqual([24, 24]);
      expect(r.pressW, 'the press is a thumb wide').toBeGreaterThanOrEqual(43);
      expect(r.pressW, 'the press is a thumb wide, no wider').toBeLessThanOrEqual(45);
      expect(r.pressH, 'the press is a thumb tall').toBeGreaterThanOrEqual(43);
      expect(r.pressH, 'the press is a thumb tall, no taller').toBeLessThanOrEqual(45);
    });
  });

  test.describe(`a mouse on a narrow window (${theme})`, () => {
    test.use({ viewport: { width: 700, height: 800 } });
    test(`the restore is the kit's xs there too: drawn 24, pressed only where drawn (${theme})`, async ({ page }) => {
      const r = await restore(page, theme);
      expect([r.w, r.h], 'drawn').toEqual([24, 24]);
      expect(r.pressW, 'a mouse presses no wider than drawn').toBeLessThanOrEqual(25);
      expect(r.pressH, 'a mouse presses no taller than drawn').toBeLessThanOrEqual(25);
    });
  });
}
