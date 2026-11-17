// Playwright: the computer page's link (#/files?computer=) becomes pane A
// with one history replace, Back from it goes back to the page it came from, and leaving it changes the route once (the
// Files page makes no move of its own after the person left). Times are noted on the test, never asserted: the run's load
// sets them. Whole-Hub only: the cases come from and go to other pages.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const SERVED = !process.env.HUB_PAGE || process.env.HUB_PAGE === '*';
const H = 'atlas.00a1';
const WAIT = 30_000;

const h1 = (page: Page) => page.locator('#hub-main').getByRole('heading', { level: 1 }).textContent({ timeout: 1000 }).catch(() => null);
const hash = (page: Page) => page.evaluate(() => location.hash);
/** Every history push and replace the app made since the page loaded, oldest first. */
const moves = (page: Page) => page.evaluate(() => (window as unknown as { __moves: string[] }).__moves);

test.describe('Files ?computer= moves only on its own route', () => {
  test.skip(!SERVED, 'needs the Computers and Notes pages (whole-Hub run)');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __moves: string[] };
      w.__moves = [];
      for (const k of ['pushState', 'replaceState'] as const) {
        const orig = history[k].bind(history);
        history[k] = (d: unknown, u: string, url?: string | URL | null) => {
          if (url != null) w.__moves.push(`${k} ${new URL(String(url), location.href).hash}`);
          return orig(d, u, url);
        };
      }
    });
  });

  test('the link becomes pane A with one replace, and Back goes back to Computers', async ({ page }) => {
    await gotoHub(page, `/computers?sel=${H}`);
    await expect.poll(() => h1(page), { timeout: WAIT }).toBe('Computers');
    const before = await page.evaluate(() => history.length);
    await page.evaluate((h) => { location.hash = `#/files?computer=${h}`; }, H);
    await expect.poll(() => hash(page), { timeout: WAIT }).toBe(`#/files?a=${H}`);
    await expect.poll(() => h1(page), { timeout: WAIT }).toBe('Files');
    expect(await page.evaluate(() => history.length), 'the link is one new entry').toBe(before + 1);
    const t0 = Date.now();
    await page.goBack();
    await expect.poll(() => h1(page), { timeout: WAIT }).toBe('Computers');
    test.info().annotations.push({ type: 'back-ms', description: String(Date.now() - t0) });
    expect(await hash(page), 'Back went to the entry before the link').toBe(`#/computers?sel=${H}`);
    expect((await moves(page)).filter((m) => m.startsWith('replaceState #/files')), 'one replace, no loop').toEqual([`replaceState #/files?a=${H}`]);
  });

  test('leaving it changes the route once', async ({ page }) => {
    await gotoHub(page, `/files?computer=${H}`);
    await expect.poll(() => hash(page), { timeout: WAIT }).toBe(`#/files?a=${H}`);
    await expect.poll(() => h1(page), { timeout: WAIT }).toBe('Files');
    const made = (await moves(page)).length;
    const t0 = Date.now();
    await page.evaluate(() => { location.hash = '#/notes'; });
    await expect.poll(() => h1(page), { timeout: WAIT }).toBe('Notes');
    test.info().annotations.push({ type: 'leave-ms', description: String(Date.now() - t0) });
    expect(await hash(page)).toBe('#/notes');
    expect((await moves(page)).slice(made).filter((m) => m.includes('#/files')), 'Files moves nobody after the leave').toEqual([]);
  });
});
