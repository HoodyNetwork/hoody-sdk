// Playwright: every click on a settings rail item scrolls its section into view, not only the first one. The router's scroll
// restore re-applied the pre-jump position after the section param was written, so later clicks did nothing (account, ai).
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

/** The section heading sits inside the scroller, clear of the sticky phone strip. */
async function headingShown(page: Page, id: string): Promise<boolean> {
  return page.evaluate((sid) => {
    const main = document.getElementById('hub-main');
    const nav = document.querySelector<HTMLElement>('nav[aria-label] [data-nav]')?.closest('nav');
    const h = document.querySelector<HTMLElement>(`[data-section="${CSS.escape(sid)}"] h2`);
    if (!main || !h) return false;
    const strip = nav && getComputedStyle(nav).flexDirection === 'row' ? nav.offsetHeight : 0;
    const m = main.getBoundingClientRect();
    const r = h.getBoundingClientRect();
    return r.top >= m.top + strip - 1 && r.bottom <= m.bottom + 1;
  }, id);
}

const CASES = [
  ['/account', { width: 1440, height: 900 }],
  ['/account', { width: 390, height: 844 }],
  ['/ai/models', { width: 1440, height: 900 }],
] as const;

for (const [route, size] of CASES) {
  test(`rail clicks in a row each scroll their section into view: ${route} at ${size.width}`, async ({ page }) => {
    // Five clicks, each polled for up to 10 s and held for 0.5 s: about 25 s run alone, past the 30 s default under load.
    test.setTimeout(60_000);
    await page.setViewportSize(size);
    await gotoHub(page, route);
    const items = page.locator('nav[aria-label] button[data-nav]');
    await items.first().waitFor();
    const n = await items.count();
    expect(n).toBeGreaterThan(2);
    // Down, back up, down again: each click must move the scroller to its own section.
    for (const idx of [2, n - 1, 1, 3, 0]) {
      const item = items.nth(idx);
      const id = (await item.getAttribute('data-nav')) as string;
      await item.click();
      await expect.poll(() => headingShown(page, id), { message: `section ${id} (item ${idx}) in view after its click`, timeout: 10000 }).toBe(true);
      // A restore that lands after the first sight of the heading would move it away again: it has to stay.
      await page.waitForTimeout(500);
      expect(await headingShown(page, id), `section ${id} (item ${idx}) still in view half a second later`).toBe(true);
    }
  });
}
