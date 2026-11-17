// Playwright: on phone-width content (< 600) a long page title wraps onto more lines instead of being cut off with an
// ellipsis; on wide content the title stays one line, as before. Container queries need a real browser, not jsdom.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const LONG = 'Welcome, Maximiliana-Theodora Featherstonehaugh of the Northern Realm';
const UNBROKEN = 'Welcome, Wolfeschlegelsteinhausenbergerdorffvoralternwarengewissenhaft';

/** Puts `text` into the page title and measures it: whether any of it is clipped, its line count, and its end edge. */
async function measure(page: Page, text: string) {
  return page.evaluate((t) => {
    const h = document.querySelector<HTMLElement>('[data-hub-title]');
    if (!h) throw new Error('no page title');
    h.textContent = t;
    const cs = getComputedStyle(h);
    const line = parseFloat(cs.lineHeight);
    return {
      clipped: h.scrollWidth > h.clientWidth + 1,
      lines: Math.round(h.getBoundingClientRect().height / line),
      end: h.getBoundingClientRect().right,
      viewport: document.documentElement.clientWidth,
      whiteSpace: cs.whiteSpace,
    };
  }, text);
}

for (const width of [390, 360]) {
  test(`a long page title wraps, never cut off, at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await gotoHub(page, '/home');
    await page.locator('[data-hub-title]').waitFor();
    for (const text of [LONG, UNBROKEN]) {
      const m = await measure(page, text);
      expect(m.clipped, text).toBe(false);
      expect(m.lines, text).toBeGreaterThan(1);
      expect(m.end, text).toBeLessThanOrEqual(m.viewport);
    }
  });
}

test('on wide content the page title stays one line, as before (desktop layout unchanged)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/home');
  await page.locator('[data-hub-title]').waitFor();
  const m = await measure(page, 'Good evening, Ada');
  expect(m.whiteSpace).toBe('nowrap');
  expect(m.lines).toBe(1);
  expect(m.clipped).toBe(false);
});
