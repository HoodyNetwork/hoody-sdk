// Playwright: a segmented control inside the kit Toolbar keeps its arrow keys. React Aria drops a
// ToggleButtonGroup's arrows inside any [role="toolbar"], so this goes red if the kit Toolbar takes that role again.
// AI Spending is the kit Toolbar user with a segmented control (Logs proves its own bar in pages/logs/page.spec.ts).
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

test('AI Spending: arrow keys move the period inside the kit Toolbar, and the bar is a group, not a toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/ai/models?section=spending');
  const period = page.locator('#hub-main [role="radiogroup"][aria-label="Period"]');
  await expect(period).toBeVisible();
  await period.getByRole('radio', { name: '7 days' }).click();
  await expect(period.getByRole('radio', { name: '7 days' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(period.getByRole('radio', { name: '30 days' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/period=30d/);
  await page.keyboard.press('ArrowLeft');
  await expect(period.getByRole('radio', { name: '7 days' })).toBeFocused();
  await expect(page.locator('#hub-main [role="toolbar"]')).toHaveCount(0);
});
