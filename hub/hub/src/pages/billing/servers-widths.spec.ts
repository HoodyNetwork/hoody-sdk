// Playwright: the listing inspector at phone and in-between widths. The purchase
// footer puts the shortfall on its own line above its actions, which never overlap or cut; the detail body starts
// where its header's title starts.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './servers/strings.en.json';

// The pages the dev server serves (scripts/check.ts passes the same HUB_PAGE to Vite and to Playwright): only a
// market-only server lacks Billing. Unset means the whole Hub.
const MARKET_ONLY = process.env.HUB_PAGE === 'market';

// The detail's own footer (the page header has an Add funds of its own).
const foot = (page: Page) => page.locator('footer[class*="detailFooter"]');
const box = async (page: Page, name: string) => {
  const b = await foot(page).getByRole('button', { name, exact: true }).boundingBox();
  if (!b) throw new Error(`no box for ${name}`);
  return b;
};

for (const width of [360, 390, 1100]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('a short balance: the shortfall line sits above Add funds and Rent, which never overlap or cut', async ({ page }) => {
      await gotoHub(page, '/billing?view=servers&sel=l03', { state: 'servers-balance-short' });
      const add = foot(page).getByRole('button', { name: strings['buy.addFunds'], exact: true });
      if (MARKET_ONLY) {
        // The page gate's market-only server routes no Billing page: the footer says buying is unavailable and has no
        // actions to measure. Every other mode must draw them: a missing Billing link fails below.
        await expect(foot(page).getByText(strings['buy.unavailable'], { exact: true })).toBeVisible();
        test.skip(true, 'no Billing page on a market-only dev server (HUB_PAGE=market)');
      }
      await expect(add).toBeVisible();
      const a = await box(page, strings['buy.addFunds']);
      const r = await box(page, strings['buy.rent']);
      const apart = a.x + a.width <= r.x + 0.5 || r.x + r.width <= a.x + 0.5 || a.y + a.height <= r.y + 0.5 || r.y + r.height <= a.y + 0.5;
      expect(apart, 'Add funds and Rent this server do not overlap').toBe(true);
      for (const b of [a, r]) expect(b.x + b.width).toBeLessThanOrEqual(width);
      const cut = await add.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(cut, 'Add funds keeps its whole label').toBe(false);
      const short = await foot(page).getByText(/short/).boundingBox();
      expect(short && short.y + short.height <= Math.min(a.y, r.y) + 0.5, 'the shortfall line is above the actions').toBe(true);
    });

    test('the detail body starts where the detail title starts', async ({ page }) => {
      await gotoHub(page, '/billing?view=servers&sel=l01');
      const title = page.locator('header[class*="detailHeader"] [data-hub-title]');
      await expect(title).toBeVisible();
      const tl = (await title.boundingBox())!.x;
      const facts = page.locator('header[class*="detailHeader"] ~ * dl, header[class*="detailHeader"] ~ * [role="radiogroup"]').first(); // reason: the first body block, whichever kind the pane draws first
      const fl = (await facts.boundingBox())!.x;
      expect(Math.abs(fl - tl), `title ${tl} vs body ${fl}`).toBeLessThanOrEqual(1);
    });
  });
}
