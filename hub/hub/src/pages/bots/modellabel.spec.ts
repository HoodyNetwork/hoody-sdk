// Playwright: a Bot that follows the AI page names the model it answers with,
// in the header's model chip at 1350 and 390 and in the list's Model cell on a wide desktop, and nothing scrolls sideways. With the agents
// read failed both say the Bots default. Never a blank chip.
import { expect } from '@playwright/test';
import { gotoHub, noSideScroll, test } from '@app/e2e';

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

// The Model column is priority 4: the list sheds it below a wide desktop (1350 included); the header chip carries it there.
test('on a wide desktop the list cell names the model the AI page gives', async ({ hubPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await gotoHub(page, '/bots', { state: 'followsAiPage' });
  await page.getByRole('radio', { name: /^List$/i }).click(); // the Model column is List's (the page opens on cards)
  await expect(page.getByRole('cell', { name: 'Hoody Free (AI page)' })).toBeAttached();
  await noSideScroll(page);
});

for (const width of [1350, 390]) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(async ({ hubPage }) => {
      await hubPage.setViewportSize({ width, height: 900 });
    });

    test('the header chip names it, and it links to the Bot settings', async ({ hubPage: page }) => {
      await gotoHub(page, `/bots?sel=${CHIEF}`, { state: 'followsAiPage' });
      await expect(page.getByRole('heading', { level: 2, name: 'Chief' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Hoody Free \(AI page\)/ })).toBeVisible();
      await noSideScroll(page);
    });

    test('with the agents read failed, the chip says the Bots default', async ({ hubPage: page }) => {
      await gotoHub(page, `/bots?sel=${CHIEF}`, { state: 'followsAiPageUnread' });
      await expect(page.getByRole('heading', { level: 2, name: 'Chief' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Bots default \(AI page\)/ })).toBeVisible();
      await expect(page.getByText('Hoody Free (AI page)')).toHaveCount(0);
    });
  });
}
