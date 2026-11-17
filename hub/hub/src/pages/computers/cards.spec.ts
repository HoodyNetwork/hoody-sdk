// Playwright: Servers as cards grouped Free / Subservers / Bare metal, and Computers as cards, at
// 1440 and 390. Each card sits inside the page (no sideways scroll), the title is whole, and the choice carries over.
import { expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import { choosePresentation } from '@app/e2e-toolbar';
import type { Locator } from '@playwright/test';

// Every control of the list's toolbar sits whole inside it (a panel clips what overflows, so the page never scrolls).
async function toolbarFits(table: Locator) {
  const ok = await table.evaluate((t) => {
    const panel = t.closest('[data-dataview], [class*="wrap"]') ?? t.parentElement!;
    const bar = panel.querySelector('[class*="toolbar"]');
    if (!bar) return true;
    const r = bar.getBoundingClientRect();
    return [...bar.querySelectorAll('button, input, [role="radio"]')].every((e) => {
      const b = e.getBoundingClientRect();
      // A visually hidden input (a switch's own checkbox) is 1-2 px: not a control anyone sees.
      if (b.width <= 2 || b.height <= 2) return true;
      return b.left >= r.left - 1 && b.right <= r.right + 1;
    });
  });
  expect(ok).toBe(true);
}

for (const width of [1440, 390]) {
  test.describe(`cards at ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('Servers: grouped cards, whole titles, no sideways scroll; Computers follows the choice', async ({ page }) => {
      await gotoHub(page, '/computers/servers', { state: 'serversKinds' });
      const servers = page.getByRole('table', { name: 'Servers' });
      await expect(servers.getByText('n12', { exact: true })).toBeVisible();
      await choosePresentation(page.locator('#hub-main'), 'cards');
      await expect(servers).toHaveAttribute('role', 'table');
      await toolbarFits(servers);
      for (const g of ['Free', 'Subservers', 'Bare metal', 'Other servers']) await expect(servers.getByRole('button', { name: new RegExp(`^${g}`) })).toBeVisible();
      const cards = servers.locator('tbody tr[data-row-id]');
      await expect(cards).toHaveCount(4);
      const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
      for (const c of await cards.all()) {
        const box = await c.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(pageWidth + 0.5);
        // Nothing spills out of the card: every part sits inside its box.
        expect(await c.evaluate((n) => { const r = n.getBoundingClientRect(); return [...n.querySelectorAll('*')].every((e) => { const b = e.getBoundingClientRect(); return b.height === 0 || (b.top >= r.top - 1 && b.bottom <= r.bottom + 1); }); })).toBe(true);
        const title = c.locator('strong').first();
        expect(await title.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
      }
      await noSideScroll(page);
      await page.screenshot({ path: test.info().outputPath(`servers-cards-${width}.png`), fullPage: true });

      await page.getByRole('tab', { name: 'Computers', exact: true }).click();
      const list = page.getByRole('table', { name: 'Computers' });
      await expect(list).toHaveAttribute('role', 'table');
      await toolbarFits(list);
      await expect(list.locator('tbody tr[data-row-id]').first()).toBeVisible();
      for (const c of await list.locator('tbody tr[data-row-id]').all()) {
        expect(await c.evaluate((n) => { const r = n.getBoundingClientRect(); return [...n.querySelectorAll('*')].every((e) => { const b = e.getBoundingClientRect(); return b.height === 0 || (b.top >= r.top - 1 && b.bottom <= r.bottom + 1); }); })).toBe(true);
      }
      await noSideScroll(page);
      await page.screenshot({ path: test.info().outputPath(`computers-cards-${width}.png`), fullPage: true });
    });
  });
}
