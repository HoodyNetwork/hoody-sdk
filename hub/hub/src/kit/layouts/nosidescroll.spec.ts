// Playwright: the shared sideways check (app/e2e.ts noSideScroll) can fail. Content wider than #hub-main turns it red while
// the old read of document.documentElement stays green, which is why no spec may read that one. A page without #hub-main
// is red too.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';

const SHORT = { timeout: 1_000 };
const oldRead = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('content wider than #hub-main is red on this check and green on the old read', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, '/notes');
  await noSideScroll(page);
  await page.evaluate(() => {
    const wide = document.createElement('div');
    wide.style.width = '2000px';
    wide.style.height = '1px';
    document.getElementById('hub-main')!.append(wide);
  });
  expect(await oldRead(page), 'the old read never saw it').toBeLessThanOrEqual(0);
  await expect(noSideScroll(page, SHORT)).rejects.toThrow(/hub-main/);
});

test('a page without #hub-main is red, not a pass with nothing to read', async ({ page }) => {
  await page.setContent('<main>no shell</main>');
  await expect(noSideScroll(page, SHORT)).rejects.toThrow(/hub-main/);
});
