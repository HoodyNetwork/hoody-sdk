// Playwright: a Tag's remove button is the one listed exception to the kit's button
// sizes. It is an IconButton sm drawn 18 x 18 inside the 20 px tag at every pointer (Display.module.css .tagRemove), and
// its press is its own ::before, centred, --icon-hit wide: so on a coarse pointer a press down its middle lands on it
// across at least 44 px both ways, while the tag stays 20 tall. Measured in the gallery's Pieces tab, both themes.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

/** The first removable tag's remove button: its drawn box, the tag's height, and the run of a press across its middle
 *  (each way) that lands on it. */
async function measure(page: Page, theme: 'light' | 'dark') {
  await gotoHub(page, '/_kit?tab=pieces', { theme });
  const b = page.getByRole('button', { name: /^Remove / }).first(); // reason: every removable tag in the Pieces tab is the same Tag part; the first is measured
  await b.waitFor({ timeout: 20_000 });
  await b.scrollIntoViewIfNeeded();
  return b.evaluate((el) => {
    const x = el.getBoundingClientRect();
    const cx = x.left + x.width / 2;
    const cy = x.top + x.height / 2;
    const on = (px: number, py: number) => { const e = document.elementFromPoint(px, py); return !!e && (e === el || el.contains(e)); };
    // Quarter-pixel steps: the run is the press area to within 0.25 px at each edge.
    const run = (dx: number, dy: number) => { let n = 0; while (n < 160 && on(cx + (dx * (n + 1)) / 4, cy + (dy * (n + 1)) / 4)) n++; return n / 4; };
    return {
      w: Math.round(x.width * 10) / 10,
      h: Math.round(x.height * 10) / 10,
      tag: Math.round(el.parentElement!.getBoundingClientRect().height * 10) / 10,
      pressH: run(0, -1) + run(0, 1),
      pressW: run(-1, 0) + run(1, 0),
    };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`fine pointer (${theme}): the remove button is drawn 18 x 18 in a 20 px tag, its press no larger than --icon-hit either way`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    const m = await measure(page, theme);
    expect([m.w, m.h]).toEqual([18, 18]);
    expect(m.tag).toBe(20);
    // --icon-hit is 28 on a mouse; a whole-pixel hit test reads up to a pixel more. Both ways.
    expect(m.pressH, 'press height').toBeLessThanOrEqual(29);
    expect(m.pressW, 'press width').toBeLessThanOrEqual(29);
  });

  test.describe(`coarse pointer (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test(`the remove button stays 18 x 18 in a 20 px tag, and a press reaches 44 both ways (${theme})`, async ({ page }) => {
      const m = await measure(page, theme);
      expect([m.w, m.h], 'drawn as on a mouse: the listed exception').toEqual([18, 18]);
      expect(m.tag).toBe(20);
      // Chromium hit-tests whole pixels, so a 44 px press reads 43 to 44 here.
      expect(m.pressH, 'press height').toBeGreaterThanOrEqual(43);
      expect(m.pressW, 'press width').toBeGreaterThanOrEqual(43);
      // And no wider than --icon-hit: a larger press would take taps meant for the tag's neighbours.
      expect(m.pressH, 'press height at most 44').toBeLessThanOrEqual(45);
      expect(m.pressW, 'press width at most 44').toBeLessThanOrEqual(45);
    });
  });
}
