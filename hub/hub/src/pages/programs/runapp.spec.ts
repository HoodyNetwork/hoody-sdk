// Playwright: on a phone, Programs' primary action is the floating Launch an app button (the kit FAB), and a tap opens
// the Apps tab with the launcher drawer.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('@launch the phone FAB is Launch an app and opens the launcher', async ({ page }) => {
  await gotoHub(page, '/programs');
  await expect(page.getByRole('tab', { name: strings['tab.running'], selected: true })).toBeVisible();
  // At phone width the header draws no button for it; the one Launch an app is the floating button (the kit FAB, a
  // fixed primary outside the header, bottom right).
  await expect(page.locator('header').getByRole('button', { name: strings['runApp'], exact: true })).toHaveCount(0);
  const launch = page.getByRole('button', { name: strings['runApp'], exact: true });
  await expect(launch).toHaveCount(1);
  await expect(launch).toHaveAttribute('data-variant', 'primary');
  const at = await launch.evaluate((el) => {
    let n: HTMLElement | null = el as HTMLElement;
    while (n && getComputedStyle(n).position !== 'fixed') n = n.parentElement;
    const r = el.getBoundingClientRect();
    return { fixed: n !== null, right: r.right > innerWidth / 2, low: r.top > innerHeight / 2 };
  });
  expect(at).toEqual({ fixed: true, right: true, low: true });
  await launch.tap();
  await expect(page).toHaveURL(/[?&]launch=1/);
  await expect(page.getByRole('dialog', { name: 'Launch an app' /* the apps page's launch.title */ })).toBeVisible();
  await expect(page.getByRole('tab', { name: strings['tab.apps'], selected: true })).toBeVisible();
});
