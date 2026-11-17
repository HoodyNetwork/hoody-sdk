// Playwright: a Bot picked from the list opens at its top on a phone, however far the list was
// scrolled, and Back returns to the list; on a wide page the list beside an open Bot keeps its own scroll (and the new
// Bot's log opens at its end: activity.scroll.spec).
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

test('at 390 px a Bot picked from a scrolled list opens with its header on screen, and Back shows the list again', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, '/bots');
  const row = page.getByText('Helper 11', { exact: true });
  await row.scrollIntoViewIfNeeded();
  const scrolled = await page.evaluate(() => (document.querySelector('#hub-main') as HTMLElement).scrollTop + (document.scrollingElement?.scrollTop ?? 0));
  expect(scrolled, 'the list was scrolled down').toBeGreaterThan(200);
  await row.click();
  const h = page.getByRole('heading', { level: 2, name: 'Helper 11' });
  await expect(h).toBeVisible();
  await page.waitForTimeout(300);
  const top = await h.evaluate((el) => el.getBoundingClientRect().top);
  expect(top, 'the Bot\'s name is on screen, near the top').toBeGreaterThanOrEqual(0);
  expect(top, 'the Bot\'s name is on screen, near the top').toBeLessThan(300);
  await page.goBack();
  await expect(page.getByText('Helper 11', { exact: true })).toBeVisible();
  await expect(h).toHaveCount(0);
});

test('at 1440 px picking another Bot keeps the list where it was scrolled', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await gotoHub(page, '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief');
  await expect(page.getByRole('heading', { level: 2, name: 'Chief' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Bots' });
  const row = table.getByRole('row', { name: /Helper 9/ });
  await row.scrollIntoViewIfNeeded();
  const before = await row.evaluate((el) => Math.round(el.getBoundingClientRect().top));
  await row.click();
  await expect(page.getByRole('heading', { level: 2, name: 'Helper 9' })).toBeVisible();
  await page.waitForTimeout(300);
  const after = await row.evaluate((el) => Math.round(el.getBoundingClientRect().top));
  expect(Math.abs(after - before), 'the picked row stays where it was').toBeLessThanOrEqual(2);
});

// Picking another Bot beside an open one passes keepScroll, so the
// router does not copy the last Bot's scroll onto the new one. Whichever page tab the open Bot is on (Work, Link, Chat apps; the
// Settings form is a drawer over the page), the list stays where it was, the new Bot opens at its top although the last was
// scrolled down, it keeps the tab, and Back shows the first Bot with the list in place.
/** How far the scroller that holds the Bot's name is scrolled (its nearest scrolling ancestor). */
const detailTop = (page: Page, name: string) =>
  page.getByRole('heading', { level: 2, name }).evaluate((h) => {
    for (let el: HTMLElement | null = h.parentElement; el; el = el.parentElement) {
      if (['auto', 'scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) return Math.round(el.scrollTop);
    }
    return Math.round(document.scrollingElement?.scrollTop ?? 0);
  });

for (const tab of ['work', 'link', 'apps'] as const) {
  test(`at 1440 px on the ${tab} tab, picking another Bot opens it at its top with the list in place, and Back shows the first Bot`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 500 });
    await gotoHub(page, `/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief&tab=${tab}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Chief' })).toBeVisible();
    // Scroll the open Bot's page down (the tab is taller than 500 px), then the list to the Bot to pick.
    await page.getByRole('heading', { level: 2, name: 'Chief' }).evaluate((h) => {
      for (let el: HTMLElement | null = h.parentElement; el; el = el.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) {
          el.scrollTop = 120;
          return;
        }
      }
    });
    expect(await detailTop(page, 'Chief'), `the first Bot's ${tab} tab is scrolled down`).toBeGreaterThan(60);
    const row = page.getByRole('table', { name: 'Bots' }).getByRole('row', { name: /Helper 2/ });
    await row.scrollIntoViewIfNeeded();
    const rowTop = () => row.evaluate((el) => Math.round(el.getBoundingClientRect().top));
    const before = await rowTop();
    await row.click();
    await expect(page.getByRole('heading', { level: 2, name: 'Helper 2' })).toBeVisible();
    await page.waitForTimeout(300);
    expect(await detailTop(page, 'Helper 2'), `the new Bot does not inherit the last Bot's scroll (${tab})`).toBeLessThanOrEqual(2);
    expect(Math.abs((await rowTop()) - before), `the picked row stays where it was (${tab})`).toBeLessThanOrEqual(2);
    await expect(page).toHaveURL(new RegExp(`tab=${tab}`));
    await page.goBack();
    await expect(page.getByRole('heading', { level: 2, name: 'Chief' })).toBeVisible();
    await page.waitForTimeout(300);
    expect(Math.abs((await rowTop()) - before), `Back leaves the list in place (${tab})`).toBeLessThanOrEqual(2);
  });
}
