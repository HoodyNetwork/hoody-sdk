// Playwright: the security summary's Review button brings the Sessions section into view, clear of the sticky phone strip.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const clear = (page: Page) =>
  page.evaluate(() => {
    const main = document.getElementById('hub-main');
    const h = document.querySelector<HTMLElement>('[data-section="sessions"] h2');
    if (!main || !h) return false;
    const nav = document.querySelector<HTMLElement>('nav[aria-label] [data-nav]')?.closest('nav');
    const strip = nav && getComputedStyle(nav).flexDirection === 'row' ? nav.offsetHeight : 0;
    const m = main.getBoundingClientRect();
    const r = h.getBoundingClientRect();
    return r.top >= m.top + strip - 1 && r.bottom <= m.bottom + 1;
  });

for (const size of [{ width: 1440, height: 520 }, { width: 390, height: 600 }]) {
  test(`Review lands on the sessions section below the strip at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await gotoHub(page, '/account');
    await page.locator('[data-section="sessions"] h2').waitFor({ state: 'attached' });
    await page.getByRole('button', { name: strings['sum.review'] }).click();
    await expect.poll(() => clear(page), { message: 'sessions heading in view below the strip', timeout: 10000 }).toBe(true);
    // The smooth scroll has ended by now: a position that only passed on the way is not enough.
    await page.waitForTimeout(600);
    expect(await clear(page), 'still clear of the strip once the scroll has settled').toBe(true);
  });
}
