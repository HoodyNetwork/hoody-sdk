// Playwright: /market lives under Plans & billing. Old links land on the Bare metal view
// with their list state, and #plans lands on the plans.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

test('an old /market link opens Bare metal in Plans & billing and keeps its search', async ({ page }) => {
  await gotoHub(page, '/market?q=tokyo');
  await expect(page).toHaveURL(/\/billing\?view=servers/);
  // The link's ?q searches the listings once on load, then the view drops it from the URL.
  await expect(page.getByRole('searchbox')).toHaveValue('tokyo');
  await expect(page).not.toHaveURL(/[?&]q=/);
});

test('an old /market reservations link opens them with their own search', async ({ page }) => {
  await gotoHub(page, '/market?tab=reservations&rq=pending');
  await expect(page).toHaveURL(/\/billing\?view=servers/);
  await expect(page).toHaveURL(/[?&]tab=reservations/);
  // The reservations list's search key is rq (param 'r'): adopted once, then out of the URL.
  await expect(page.getByRole('searchbox')).toHaveValue('pending');
  await expect(page).not.toHaveURL(/[?&]rq=/);
});

test('an old /market#plans link opens the plans', async ({ page }) => {
  await gotoHub(page, '/market#plans');
  await expect(page).toHaveURL(/\/billing\?view=plans/);
});
