// Playwright: the __ID__ page's flows on fixtures (run by hub:check --page __ID__).
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

async function toReview(page: Page, name = 'atlas') {
  await page.getByLabel(strings['name.label']).fill(name);
  await page.getByRole('button', { name: strings.next }).click();
  await page.getByRole('button', { name: strings.next }).click();
}

test('Next refuses a taken name and says why', async ({ page }) => {
  await gotoHub(page, '/__ID__');
  await page.getByLabel(strings['name.label']).fill('boreal');
  await page.getByRole('button', { name: strings.next }).click();
  await expect(page.getByText(strings['name.taken'])).toBeVisible();
  await expect(page).not.toHaveURL(/step=/);
});

test('the steps live in the URL, and Back walks them', async ({ page }) => {
  await gotoHub(page, '/__ID__');
  await toReview(page);
  await expect(page).toHaveURL(/[?&]step=review/);
  await page.goBack();
  await expect(page).toHaveURL(/[?&]step=plan/);
  await expect(page.getByRole('radiogroup', { name: strings['plan.label'] })).toBeVisible();
});

test('an unknown create locks the wizard and offers Check again only', async ({ page }) => {
  await gotoHub(page, '/__ID__', { state: 'save-unknown' });
  await toReview(page);
  await page.getByRole('button', { name: strings.create }).click();
  await expect(page.locator('[data-outcome="pending"]').first()).toBeVisible();
  await expect(page.getByRole('button', { name: strings.create })).toBeDisabled();
  await expect(page.getByRole('button', { name: strings.back })).toBeDisabled();
});

test('a failed create says so on the last step', async ({ page }) => {
  await gotoHub(page, '/__ID__', { state: 'save-failed' });
  await toReview(page);
  await page.getByRole('button', { name: strings.create }).click();
  await expect(page.locator('[data-outcome="failed"]').first()).toBeVisible();
});
