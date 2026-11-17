// Playwright: Referral credit on Billing at 1440 and 390. The wallet card names it
// only when the account has some, and its first line ends with a link to Referrals while the Referrals page is served
// and a link to the wallet-credit question (FAQ); the Checkout review counts it toward the charge (general + Referral credit) and shows the two lines,
// with a Short by row only when the sum still lacks something; nothing scrolls sideways.
import { expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

const BUY = '/billing?checkout=buy&plan=fam-plus';
// The pages the dev server serves (scripts/check.ts passes the same HUB_PAGE to Vite and to Playwright): a
// billing-only server serves no Referrals page, so the wallet lines carry no Referrals link there (the wallet question link stays).
const BILLING_ONLY = process.env.HUB_PAGE === 'billing';
const LINK = `${BILLING_ONLY ? '' : ` · ${strings.referralLink}`} · ${strings['credit.more']}`;

for (const width of [1440, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('the wallet card shows Referral credit and what is owed only when above 0', async ({ page }) => {
      await gotoHub(page, '/billing?view=wallet', { state: 'wallet-referral' });
      const card = page.locator('[data-card="wallet"]');
      await expect(card.locator('[data-referral]')).toHaveText(strings.referralLine.replace('{{amount}}', '$12.40') + LINK);
      await expect(card.locator('[data-referral]').getByRole('button', { name: strings.referralLink })).toHaveCount(BILLING_ONLY ? 0 : 1);
      await expect(card.locator('[data-owed]')).toHaveCount(0);
      await noSideScroll(page);
      await gotoHub(page, '/billing?view=wallet', { state: 'wallet-owed' });
      await expect(page.locator('[data-card="wallet"] [data-owed]')).toHaveText(strings.owedLine.replace('{{amount}}', '$3.00') + LINK);
      await gotoHub(page, '/billing?view=wallet');
      await expect(page.locator('[data-balance]')).toBeVisible();
      await expect(page.locator('[data-card="wallet"] :is([data-referral], [data-owed])')).toHaveCount(0);
    });

    test('Checkout: Referral credit that covers the charge leaves no shortfall', async ({ page }) => {
      await gotoHub(page, BUY, { state: 'checkout-referral-covers' });
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(strings['buy.referral'])).toBeVisible();
      // No Short by row in the wallet lines and no strip with Add funds under them.
      await expect(dialog.locator('[data-ledger-tone="warn"]')).toHaveCount(0);
      await expect(dialog.locator('[data-ledger-strip]')).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: strings.addFunds })).toHaveCount(0);
      await noSideScroll(page);
    });

    test('Checkout: a partial Referral credit is short by what the sum lacks', async ({ page }) => {
      await gotoHub(page, BUY, { state: 'checkout-referral-partial' });
      const dialog = page.getByRole('dialog');
      // A purchase says it in its wallet lines: a Short by row with the amount, then the strip under them with the
      // sentence and Add funds.
      const short = dialog.getByLabel(strings.wallet, { exact: true }).locator('[data-ledger-tone="warn"]');
      await expect(short.locator('dt')).toHaveText(strings['buy.shortBy']);
      await expect(short.locator('dd')).toHaveText('$3.00');
      const strip = dialog.locator('[data-ledger-strip]');
      await expect(strip).toContainText(strings['buy.short'].replace('{{amount}}', '$3.00'));
      await expect(strip.getByRole('button', { name: strings.addFunds })).toBeVisible();
      await noSideScroll(page);
    });
  });
}
