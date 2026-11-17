// Playwright: the email change on the account page, on fixtures (run by hub:check --page account).
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

test('the email drawer opens from the profile, validates, sends, and Back closes it', async ({ page }) => {
  test.slow(); // two navigations (Back, Forward), a refused send and a sent one
  await gotoHub(page, '/account');
  await page.getByRole('button', { name: strings['e.change'] }).click();
  const drawer = page.getByRole('dialog', { name: strings['e.title'] });
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(/sheet=email/);
  await page.goBack();
  await expect(drawer).toBeHidden();
  await page.goForward();
  await expect(drawer).toBeVisible();
  await drawer.getByLabel(strings['e.new']).fill('ada@example.com');
  await drawer.getByLabel(strings['e.password']).fill('password');
  await drawer.getByRole('button', { name: strings['e.send'] }).click();
  await expect(drawer.getByText(strings['e.eSame'])).toBeVisible();
  await drawer.getByLabel(strings['e.new']).fill('ada.new@example.com');
  await drawer.getByLabel(strings['e.password']).fill('password');
  await drawer.getByLabel(strings['e.password']).press('Enter');
  await expect(drawer).toBeHidden();
  await expect(page.getByText('Check ada.new@example.com for the confirm link. It works for 24 hours.')).toBeVisible();
});

test('a waiting change shows on the profile and can be cancelled', async ({ page }) => {
  test.slow(); // the page load under a loaded host is most of the time, as in computers/list.spec.ts
  await gotoHub(page, '/account', { state: 'email-waiting' });
  await expect(page.getByText(/Waiting for confirmation at ada\.new@example\.com/)).toBeVisible();
  await page.getByRole('button', { name: strings['e.cancel'] }).click();
  await expect(page.getByText(strings['e.cancelled'])).toBeVisible();
});
