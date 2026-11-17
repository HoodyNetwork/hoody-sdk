// Playwright: the __ID__ page's flows on fixtures (run by hub:check --page __ID__).
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const name = strings['field.name'];

test('the save bar appears only while the form is dirty', async ({ page }) => {
  await gotoHub(page, '/__ID__');
  const save = page.getByRole('button', { name: strings.save });
  await expect(save).toHaveCount(0);
  await page.getByLabel(name).fill('atlas-team');
  await expect(save).toBeVisible();
  await page.getByLabel(name).fill('Personal');
  await expect(save).toHaveCount(0);
});

test('the section in view lives in the URL and survives a reload', async ({ page }) => {
  await gotoHub(page, '/__ID__?section=notifications');
  await page.reload();
  await page.locator('#hub-main').waitFor();
  await expect(page).toHaveURL(/section=notifications/);
  await expect(page.getByRole('heading', { name: strings['section.notifications'] })).toBeVisible();
});

test('an unknown save locks the fields and offers Check again only', async ({ page }) => {
  await gotoHub(page, '/__ID__', { state: 'save-unknown' });
  await page.getByLabel(name).fill('atlas-team');
  await page.getByRole('button', { name: strings.save }).click();
  await expect(page.locator('[data-outcome="pending"]').first()).toBeVisible();
  await expect(page.getByLabel(name)).toBeDisabled();
});

test('a failed save keeps the draft and says so', async ({ page }) => {
  await gotoHub(page, '/__ID__', { state: 'save-failed' });
  await page.getByLabel(name).fill('atlas-team');
  await page.getByRole('button', { name: strings.save }).click();
  await expect(page.locator('[data-outcome="failed"]').first()).toBeVisible();
  await expect(page.getByLabel(name)).toHaveValue('atlas-team');
});
