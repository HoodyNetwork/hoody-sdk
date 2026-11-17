// Playwright: an agent's reasoning effort in the whole Hub, at 1440 and 390. The row's inline
// Select lists the levels; a pick sends once, with no dialog. The fixtures' agents list never shows the new level, so the
// change reads as "may have gone through" with Check again and Stop tracking under it, the Select off; nothing spills
// sideways.
import { expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import forms from '@kit/forms/forms.strings.en.json';
import strings from './agents/strings.en.json';

for (const width of [1440, 390]) {
  test(`the effort row at ${width}: pick inline, held as may have gone through, Check again`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/ai/agents/reviewer');
    const select = page.getByRole('article', { name: 'reviewer' }).getByRole('button', { name: new RegExp(strings['ov.effort']) });
    await expect(select).toBeVisible({ timeout: 20_000 });
    await expect(select).toContainText(strings['ov.effortUnset']);
    await select.click();
    await page.getByRole('option', { name: strings['effort.high'], exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const alert = page.getByRole('alert').filter({ hasText: forms['outcome.pendingShort'] });
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await expect(alert.getByRole('button', { name: forms['outcome.check'] })).toBeVisible();
    await expect(page.getByRole('button', { name: strings['model.stop'], exact: true })).toBeVisible();
    await expect(select).toBeDisabled();
    await noSideScroll(page);
    await page.screenshot({ path: `${process.env.HUB_PW_OUT ?? 'test-results'}/effort-${width}.png`, fullPage: false });
  });
}
