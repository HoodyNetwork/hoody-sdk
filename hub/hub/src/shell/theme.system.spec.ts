// Playwright: in Chromium the Hub's theme defaults to the device's scheme. A browser set to dark
// with nothing saved draws dark from the first paint (fouc.js, run as an init script: fixtures mode serves no live boot
// scripts) and after the app starts (prefs.ts); a switch of the scheme flips the open page; a saved Light stays light.
// The address carries no ?theme= (a fixture's ?theme= pins the theme, so shots stay deterministic). No cookie is set.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { hubUrl } from '@app/e2e';

const FOUC = path.join(__dirname, '..', '..', '..', 'public', 'auth', 'fouc.js');

test.skip(process.env.HUB_PAGE !== 'keys' && process.env.HUB_PAGE !== '*', 'runs on the keys page (HUB_PAGE=keys)');
test.use({ colorScheme: 'dark' });

/** The Hub at `hash` without the fixtures' ?theme= pin. */
const unpinned = (hash: string) => {
  const u = new URL(hubUrl(hash));
  u.searchParams.delete('theme');
  return u.toString();
};
const foucInit = `(() => { const run = () => { ${readFileSync(FOUC, 'utf8')} };
  if (document.documentElement) run();
  else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); run(); } }).observe(document, { childList: true });
})();`;
const drawn = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-hx-theme'));

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.locator('#hub-main').waitFor();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: foucInit });
});

test('@theme a dark browser with empty storage draws dark, and a scheme switch flips the open page', async ({ page, context }) => {
  await open(page, unpinned('/keys'));
  expect(await page.evaluate(() => localStorage.getItem('hub_theme_v1'))).toBeNull();
  await expect(page.locator('html')).toHaveAttribute('data-hx-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-hx-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-hx-theme', 'dark');
  expect(await context.cookies()).toEqual([]);
});

test('@theme the account menu checks System; a saved Light stays light under a dark browser and across a reload', async ({ page, context }) => {
  await open(page, unpinned('/keys'));
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'System theme' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemradio', { name: 'Light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-hx-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('hub_theme_v1'))).toBe('light');
  await page.reload();
  await page.locator('#hub-main').waitFor();
  expect(await drawn(page)).toBe('light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await drawn(page)).toBe('light');
  expect(await context.cookies()).toEqual([]);
});

test('@theme a fixture ?theme=light stays light under a dark browser', async ({ page }) => {
  await open(page, hubUrl('/keys', { theme: 'light' }));
  expect(await drawn(page)).toBe('light');
});
