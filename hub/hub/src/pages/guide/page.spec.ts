// Playwright: the guide page's flows on fixtures (run by hub:check --page guide).
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

test('the section index jumps to a section', async ({ page }) => {
  await gotoHub(page, '/guide');
  await page.getByRole('navigation', { name: strings['sections.label'] }).getByRole('link', { name: strings['ix.keys'] }).click();
  await expect(page.getByRole('heading', { name: strings['keys.title'] })).toBeInViewport();
});

test('a door choice stays in the URL and Back undoes it', async ({ page }) => {
  await gotoHub(page, '/guide');
  await page.getByRole('button', { name: strings['door.sdk'], exact: true }).click();
  await expect(page).toHaveURL(/door=sdk/);
  await page.goBack();
  await expect(page).not.toHaveURL(/door=sdk/);
});

test('J moves to the next section', async ({ page }) => {
  await gotoHub(page, '/guide');
  await page.keyboard.press('j');
  await expect(page.getByRole('heading', { name: strings['connect.title'] })).toBeInViewport();
});

test('the last section can be reached and is marked at the end of the scroll', async ({ page }) => {
  await gotoHub(page, '/guide#look');
  await expect(page.getByRole('heading', { level: 2, name: strings['look.title'] })).toBeInViewport();
  await expect(page.getByRole('link', { name: strings['ix.look'] })).toHaveAttribute('aria-current', 'location');
});
