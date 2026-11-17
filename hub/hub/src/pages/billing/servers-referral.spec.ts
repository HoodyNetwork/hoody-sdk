// Playwright: the Market order footer at 1440 and 390 counts Referral credit with
// the general wallet against the total first payment (setup included) and names both parts. Needs the Billing page
// served (whole Hub): a market-only server has no buy actions.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './servers/strings.en.json';

const foot = (page: Page) => page.locator('footer[class*="detailFooter"]');

for (const width of [1440, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.skip(process.env.HUB_PAGE === 'market', 'no Billing page on a market-only dev server');

    test('setup counts: 140 + 80 against 179 + 49 is $8 short, with the split named', async ({ page }) => {
      await gotoHub(page, '/billing?view=servers&sel=l03', { state: 'servers-referral-partial' });
      await expect(foot(page).getByText(/\$8 short/)).toBeVisible();
      await expect(foot(page).locator('[data-order-split]')).toHaveText('Wallet $140 · Referral credit $80 (used first)');
      await expect(foot(page).getByRole('button', { name: strings['buy.addFunds'], exact: true })).toBeVisible();
      await noSideScroll(page);
    });

    test('Referral credit that covers the total: covered, split named', async ({ page }) => {
      await gotoHub(page, '/billing?view=servers&sel=l03', { state: 'servers-referral-covers' });
      await expect(foot(page).getByText(strings['buy.enough'])).toBeVisible();
      await expect(foot(page).locator('[data-order-split]')).toBeVisible();
    });
  });
}
