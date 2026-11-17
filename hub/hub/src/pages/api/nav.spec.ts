// Playwright: API sits in the sidebar right after Keys (shell/nav.ts NAV_PLACE, account
// block), not in the foot at the bottom-left with Guide and Support.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

test('API is right after Keys, not in the foot', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/home');
  const link = page.getByRole('link', { name: strings.nav, exact: true });
  const side = page.getByRole('navigation').filter({ has: link });
  await expect(side.getByRole('link', { name: strings.nav, exact: true })).toHaveCount(1);
  // The link drawn just before API's, in the same block, is Keys (/keys).
  const before = await side.getByRole('link', { name: strings.nav, exact: true }).evaluate((a) => {
    const links = Array.from(a.closest('[role="group"]')?.querySelectorAll('a[href]') ?? []);
    const i = links.indexOf(a);
    return i > 0 ? links[i - 1]!.getAttribute('href') : null;
  });
  expect(before).toMatch(/\/keys$/);
  await expect(side.locator('xpath=./div[last()]').getByRole('link', { name: strings.nav, exact: true })).toHaveCount(0);
});
