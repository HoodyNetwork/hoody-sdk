// Playwright: the shell's buttons with a keyboard shortcut carry aria-keyshortcuts on the real element (React Aria's
// Button drops the prop, kit/keyshortcuts.ts sets it). Desktop, where every one of them shows.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

test('desktop: search, realm, computer, AI and collapse say their shortcut', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/home');
  await expect(page.locator('[data-skeleton]')).toHaveCount(0);
  const mac = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform));
  const header = page.locator('header').first();
  await expect(header.locator('button[class*="TopBar-module__search"]')).toHaveAttribute('aria-keyshortcuts', mac ? 'Meta+K' : 'Control+K');
  await expect(header.locator('[data-hub-switch="realm"]')).toHaveAttribute('aria-keyshortcuts', 'Alt+R');
  await expect(header.locator('[data-hub-switch="computer"]')).toHaveAttribute('aria-keyshortcuts', 'Alt+C');
  await expect(header.getByRole('button', { name: /^AI\b/ })).toHaveAttribute('aria-keyshortcuts', mac ? 'Meta+J' : 'Control+J');
  await expect(page.locator('nav').getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute('aria-keyshortcuts', '[');
});
