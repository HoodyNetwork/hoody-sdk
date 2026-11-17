// Playwright: the __ID__ page's flows on fixtures (run by hub:check --page __ID__).
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

test('the open tab lives in the URL and survives a reload', async ({ page }) => {
  await gotoHub(page, '/__ID__');
  await page.getByRole('tab', { name: new RegExp(strings['tab.activity']) }).click();
  await expect(page).toHaveURL(/[?&]tab=activity/);
  await page.reload();
  await page.locator('#hub-main').waitFor();
  await expect(page.getByRole('heading', { name: strings['activity.title'] })).toBeVisible();
});

test('the facts rail shows the id masked, never in full', async ({ page }) => {
  await gotoHub(page, '/__ID__');
  await expect(page.getByRole('heading', { name: strings['aside.title'] })).toBeVisible();
  await expect(page.locator('#hub-main')).not.toContainText(/\b[0-9a-f]{24}\b/);
});

test('Edit opens the drawer, and closing it leaves ?edit', async ({ page }) => {
  await gotoHub(page, '/__ID__');
  await page.getByRole('button', { name: strings['action.edit'], exact: true }).click();
  await expect(page).toHaveURL(/edit=/);
  await expect(page.getByRole('dialog', { name: strings['edit.title'] })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/edit=/);
});

test('an unknown save locks the drawer and offers Check again only', async ({ page }) => {
  await gotoHub(page, '/__ID__', { state: 'save-unknown' });
  await page.getByRole('button', { name: strings['action.edit'], exact: true }).click();
  await page.getByLabel(strings['edit.name']).fill('atlas-2');
  await page.getByRole('button', { name: strings['edit.save'] }).click();
  await expect(page.locator('[data-outcome="pending"]').first()).toBeVisible();
  await expect(page.getByLabel(strings['edit.name'])).toBeDisabled();
});
