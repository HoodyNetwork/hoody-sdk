// Playwright: the editor's Custom field says it takes a cron expression, shows the shape as a placeholder,
// and says in words what a typed expression means, at 1440 and 390.
import { expect } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import strings from './strings.en.json';

for (const width of [1440, 390]) {
  test.describe(`the cron field at ${width}`, () => {
    test.beforeEach(async ({ hubPage }) => {
      await hubPage.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    });

    test('is named cron, shows its shape, and says what an expression means', async ({ hubPage: page }) => {
      await gotoHub(page, '/schedules?edit=cron%3Auser%2Fa1');
      const dialog = page.getByRole('dialog');
      const runs = dialog.getByRole('button', { name: new RegExp(strings['ed.when']) });
      await runs.click();
      await page.getByRole('option', { name: strings['ed.k.custom'] }).click();
      const field = dialog.getByRole('textbox', { name: 'Cron expression' });
      await expect(field).toBeVisible();
      await expect(field).toHaveAttribute('placeholder', '* * * * *');
      await field.fill('*/15 * * * *');
      await expect(dialog.getByText('Every 15 minutes', { exact: true })).toBeVisible();
      await field.fill('0 8 * * *');
      await expect(dialog.getByText('Every day at 08:00', { exact: true })).toBeVisible();
      await field.fill('0 9-17 * * *');
      await expect(dialog.getByText('Every day at 08:00', { exact: true })).toHaveCount(0);
      await field.fill('* * * * *');
      await expect(dialog.getByText('Every minute', { exact: true })).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`cronfield-${width}.png`) });
      // The words belong to the Custom field: another kind of schedule never shows them, even with an expression typed.
      await field.fill('*/15 * * * *');
      await expect(dialog.getByText('Every 15 minutes', { exact: true })).toBeVisible();
      await runs.click();
      await page.getByRole('option', { name: strings['ed.k.daily'] }).click();
      await expect(dialog.getByText('Every 15 minutes', { exact: true })).toHaveCount(0);
    });
  });
}
