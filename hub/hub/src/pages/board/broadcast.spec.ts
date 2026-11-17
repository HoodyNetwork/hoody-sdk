// Playwright: what Broadcast offers in each engine. hub:check runs it on Chromium with every Board spec;
// broadcast/playwright.firefox.config.ts runs it on Chromium and Firefox. Firefox cannot send a live upload (a
// streaming request body) nor share a single tab, so its panel says what broadcasting needs and names the browsers
// that have it, with no Start; Chromium offers Start.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './broadcast/strings.en.json';

const LIMIT = strings['unsupported.no-stream-upload'];

test('the Broadcast panel offers Start, or says what this browser lacks', async ({ page, browserName }) => {
  await gotoHub(page, '/board');
  await page.getByRole('button', { name: strings.open, exact: true }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  if (browserName === 'firefox') {
    await expect(panel.getByText(LIMIT, { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: strings.start })).toHaveCount(0);
    // Both needs and a way out, in words a person acts on.
    expect(LIMIT).toMatch(/single-tab sharing/);
    expect(LIMIT).toMatch(/live uploads/);
    expect(LIMIT).toMatch(/Chrome or Edge/);
  } else {
    await expect(panel.getByRole('button', { name: strings.start })).toBeVisible();
    await expect(panel.getByText(LIMIT, { exact: true })).toHaveCount(0);
  }
});
