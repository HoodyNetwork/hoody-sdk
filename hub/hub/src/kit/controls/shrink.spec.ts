// Playwright: a `shrink` Button under its parent's cap is no wider than the cap and its label ends in an ellipsis; on a
// coarse pointer it keeps its 44 px touch target. Measured on the gallery's "Label cut to fit" specimen.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/strings.en.json';

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`a shrink button under a cap (${pointer} pointer)`, () => {
    test.use({ viewport: { width: 1350, height: 900 }, hasTouch: pointer === 'coarse', isMobile: pointer === 'coarse' });
    test('no wider than its parent, the label cut with an ellipsis, the touch floor kept', async ({ page }) => {
      await gotoHub(page, '/_kit?tab=actions', { theme: 'light' });
      const b = page.locator('[data-gallery-cap]').getByRole('button', { name: gallery['btn.shrinkName'], exact: true });
      await b.waitFor({ timeout: 15_000 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const m = await b.evaluate((el) => {
        const label = el.querySelector('[data-btn-label]') as HTMLElement;
        return {
          w: el.getBoundingClientRect().width,
          h: el.getBoundingClientRect().height,
          cap: el.parentElement!.getBoundingClientRect().width,
          cut: label.scrollWidth > label.clientWidth,
          ellipsis: getComputedStyle(label).textOverflow,
        };
      });
      expect(m.w, 'no wider than the cap').toBeLessThanOrEqual(m.cap + 0.5);
      expect(m.cut, 'the label is cut').toBe(true);
      expect(m.ellipsis).toBe('ellipsis');
      if (pointer === 'coarse') expect(m.h, 'the touch floor').toBeGreaterThanOrEqual(44);
    });
    test('in a slot squeezed narrower than any button: the touch floor still holds both ways on a coarse pointer', async ({ page }) => {
      await gotoHub(page, '/_kit?tab=actions', { theme: 'light' });
      const b = page.locator('[data-gallery-cap-squeezed]').getByRole('button', { name: gallery['btn.shrinkShort'], exact: true });
      await b.waitFor({ timeout: 15_000 });
      const r = await b.evaluate((el) => el.getBoundingClientRect().toJSON() as { width: number; height: number });
      if (pointer === 'coarse') {
        expect(r.width, 'the touch floor, across').toBeGreaterThanOrEqual(43.5);
        expect(r.height, 'the touch floor, down').toBeGreaterThanOrEqual(43.5);
      } else expect(r.width, 'a mouse: no floor, the button follows its slot').toBeLessThan(43.5);
    });
  });
}
