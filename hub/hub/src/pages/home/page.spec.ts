// Playwright: the home page's flows on fixtures (run by hub:check --page home).
import { expect, test } from '@playwright/test';
import { gotoHub, hubUrl } from '@app/e2e';
import strings from './strings.en.json';

// The pages the dev server serves (scripts/check.ts passes the same HUB_PAGE to Vite and to Playwright): a home-only
// server has no other page for Start something to link to, so that card hides itself (QuickActions: no main tile).
// Unset means the whole Hub.
const HOME_ONLY = process.env.HUB_PAGE === 'home';

test('the dashboard shows the cards and the Ask box', async ({ page }) => {
  // Ask is off until a live turn is proven; the fixture build turns it on with ?ask=1.
  await page.goto(hubUrl('/home').replace('/?', '/?ask=1&'));
  await page.locator('#hub-main').waitFor();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
  const actions = page.getByRole('heading', { name: strings['actions.title'] });
  if (HOME_ONLY) await expect(actions).toHaveCount(0);
  else await expect(actions).toBeVisible();
  // This returning account has a computer and a key, so First steps shows nothing to do and stays hidden.
  await expect(page.getByText(strings['steps.title'])).toHaveCount(0);
  await expect(page.locator('main form').getByRole('button', { name: strings['ask.submit'] })).toBeVisible();
});

test('Customize opens and Back closes it', async ({ page }) => {
  await gotoHub(page, '/home');
  await page.getByRole('button', { name: strings['action.customize'] }).click();
  await expect(page).toHaveURL(/customize=1/);
  await expect(page.getByText(strings['customize.title'])).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/customize=1/);
});

test('arrow keys move between cards', async ({ page }) => {
  await gotoHub(page, '/home');
  // Only the cards of the pages the dev server shows exist; with Home alone there is nothing to move between.
  test.skip(HOME_ONLY, 'a home-only server has fewer than two cards');
  const links = page.locator('section header a[href]');
  // The cards load after the first paint: wait for a second one before moving (a count right away read 0 and skipped).
  await expect(links.nth(1)).toBeVisible();
  await links.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(links.nth(1)).toBeFocused();
});
