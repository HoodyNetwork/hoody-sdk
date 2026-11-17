// Playwright: Vault's header ⋯ (PageHeader `menu`) is drawn after the actions at 1440 and before them under 600 px. With
// the ⋯ focused, a window resize across 600 px keeps focus on the ⋯ (a real browser: the old slot leaves the document).
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from '../../pages/vault/strings.en.json';

test('the focused header ⋯ keeps focus when the window crosses 600 px, both ways', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/vault');
  const more = page.locator('header:has(h1)').first().getByRole('button', { name: strings['action.more'] });
  await more.waitFor({ timeout: 15_000 });
  await more.focus();
  await expect(more).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-head-menu] + *').first(), 'the ⋯ now precedes the actions').toBeAttached();
  await expect(more, 'focus stays on the ⋯ at 390').toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(more, 'focus stays on the ⋯ back at 1440').toBeFocused();
});
