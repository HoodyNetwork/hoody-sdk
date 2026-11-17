// Servers > Subscriptions at phone width: the overdue subscription's Pay now is the
// row's inline kit action in the list presentation (DataTable actions, data-row-actions; the fixture world's fra-7 plan,
// "Payment overdue"), in sight and hit at its middle,
// on a fine and a coarse pointer; it goes to Billing. Before, Pay now was a table column the phone list left out.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`Servers subscriptions at 390, ${pointer} pointer`, () => {
    if (pointer === 'coarse') test.use({ hasTouch: true, isMobile: true });

    test(`@paynow the overdue subscription shows Pay now as its inline row action, in sight, and it opens Billing (${pointer})`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: 390, height: 844 });
      await gotoHub(page, '/computers/servers');
      const subs = page.getByRole('table', { name: 'Subscriptions' });
      // The overdue subscription's row, by its words: one row (its plan and state cells may both say it, so the row, not the text).
      const overdue = subs.getByRole('row').filter({ hasText: 'Payment overdue' });
      await expect(overdue).toHaveCount(1, { timeout: 30_000 });
      await expect(overdue).toBeVisible();
      // The list presentation: its one header is the primary column's (Plan), and each row is one cell; the
      // table presentation would show State, Renews and its row actions header as columns of their own.
      await expect(subs.getByRole('columnheader')).toHaveText(['Plan']);
      await expect(subs.getByRole('button', { name: 'Pay now' })).toHaveCount(1);
      const pay = overdue.getByRole('button', { name: 'Pay now' });
      await expect(pay).toBeVisible();
      const where = await pay.evaluate((b) => {
        const r = b.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          inActions: b.closest('[data-row-actions]') !== null,
          row: (b.closest('tr')?.textContent ?? '').includes('Payment overdue'),
          cells: b.closest('tr')?.querySelectorAll('td').length ?? 0,
          // The kit's list layout marker: a list row is one DataTable listCell (kit/data/DataTable.tsx, asList).
          listCell: b.closest('td')?.matches('[class*="listCell"]') ?? false,
          hit: at !== null && b.contains(at),
          inView: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0,
        };
      });
      expect(where).toEqual({ inActions: true, row: true, cells: 1, listCell: true, hit: true, inView: true });
      await pay.click();
      await expect(page).toHaveURL(/\/billing(?:[?#]|$)/);
    });
  });
}
