// Playwright: the __ID__ page's flows on fixtures (run by hub:check --page __ID__).
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

test('every widget shows its figures', async ({ page }) => {
  await gotoHub(page, '/__ID__');
  await expect(page.getByRole('heading', { name: strings['running.title'] })).toBeVisible();
  await expect(page.getByRole('list', { name: strings['recent.list'] })).toBeVisible();
});

test('one failed read shows a compact error per widget, never a blank page', async ({ page }) => {
  await gotoHub(page, '/__ID__', { state: 'error' });
  await expect(page.getByText(strings['recent.error'])).toBeVisible();
  await expect(page.getByText(strings['running.error'])).toBeVisible();
});

test('an unknown restart shows the C9 line and does not offer the restart again', async ({ page }) => {
  await gotoHub(page, '/__ID__', { state: 'save-unknown' });
  await page.getByRole('button', { name: strings['failed.restart'] }).click();
  await expect(page.locator('[data-outcome="pending"]').first()).toBeVisible();
  await expect(page.getByRole('button', { name: strings['failed.restart'] })).toBeDisabled();
});

test('a failed restart says so where the action was', async ({ page }) => {
  await gotoHub(page, '/__ID__', { state: 'save-failed' });
  await page.getByRole('button', { name: strings['failed.restart'] }).click();
  await expect(page.locator('[data-outcome="failed"]').first()).toBeVisible();
});
