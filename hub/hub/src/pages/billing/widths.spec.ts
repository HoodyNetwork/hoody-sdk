// Playwright: Billing at in-between widths. Server subscriptions keep the Price column at 1100
// (Dates drops first there, by priority) and, where Dates is drawn (1440), each Dates cell fits in two lines;
// AI usage fits its frame at 1100 (as a table or, when a column would drop, as cards; fit.spec.ts): no sideways scroll
// and no row action cut.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const usage = (page: Page) => page.getByRole('table', { name: strings['aiu.title'] });

test.describe('at 1100px', () => {
  test.use({ viewport: { width: 1100, height: 1000 } });
  test('Server subscriptions keep every column but Dates at 1100, Price included, with a price in every row', async ({ page }) => {
    await gotoHub(page, '/billing?view=wallet');
    const subs = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: strings['col.renew'] }) });
    await expect(subs).toBeVisible();
    // Every column but Dates is drawn (Dates drops first, by priority): a dropped column has no header cell at all.
    const heads = await subs.getByRole('columnheader').evaluateAll((hs) => hs.map((h) => (h.textContent ?? '').trim()));
    for (const k of ['col.plan', 'col.server', 'col.state', 'col.price', 'col.renew', 'col.action'] as const) expect(heads, k).toContain(strings[k]);
    const priceAt = await subs.getByRole('columnheader').evaluateAll((hs, name) => hs.findIndex((h) => (h.textContent ?? '').trim() === name), strings['col.price']);
    const prices = await subs.locator('tbody tr').evaluateAll((rows, i) => rows.map((r) => (r.children[i]?.textContent ?? '').trim()), priceAt);
    expect(prices.length).toBeGreaterThan(0);
    for (const p of prices) expect(p).toMatch(/\d/);
  });
  test('AI usage fits its frame: no sideways scroll, every row action fully inside', async ({ page }) => {
    await gotoHub(page, '/billing?view=wallet');
    const t = usage(page);
    await expect(t).toBeVisible();
    const m = await t.evaluate((el) => {
      const f = el.parentElement!.getBoundingClientRect();
      const btns = [...el.querySelectorAll('tbody button')].map((b) => b.getBoundingClientRect().right);
      return { over: el.parentElement!.scrollWidth - el.parentElement!.clientWidth, right: f.right, btns };
    });
    expect(m.over).toBeLessThanOrEqual(0);
    expect(m.btns.length).toBeGreaterThan(0);
    for (const r of m.btns) expect(r).toBeLessThanOrEqual(m.right);
  });
});

test.describe('at 1440px', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });
  test('Server subscriptions draw Dates, and every Dates cell takes at most two lines', async ({ page }) => {
    await gotoHub(page, '/billing?view=wallet');
    const subs = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: strings['col.renew'] }) });
    await expect(subs).toBeVisible();
    // Dates is drawn here: its header cell is there (a dropped column has none).
    await expect(subs.getByRole('columnheader', { name: strings['col.dates'] })).toBeVisible();
    const cells = subs.locator('td span[class*="datesCell"]');
    await expect(cells.first()).toBeVisible();
    const lines = await cells.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight))));
    expect(lines.length).toBeGreaterThan(0);
    for (const n of lines) expect(n).toBeLessThanOrEqual(2);
  });
});
