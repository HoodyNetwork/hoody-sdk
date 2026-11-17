// Playwright: Programs > System programs opened, then a program's Logs, then Back: System programs is
// still open. Also when the Hub is left by its address (a reload on Back), and a group closed again stays closed.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, hubUrl } from '@app/e2e';
import strings from './strings.en.json';

const table = (page: Page) => page.getByRole('table', { name: strings.title });
const system = (page: Page) => table(page).getByRole('button', { name: new RegExp(strings['group.system']) });

const openSystem = async (page: Page) => {
  await gotoHub(page, '/programs');
  await expect(system(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(table(page).getByText('hoody-agent')).toHaveCount(0);
  await system(page).click();
  await expect(system(page)).toHaveAttribute('aria-expanded', 'true');
};

const expectStillOpen = async (page: Page) => {
  await expect(system(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(table(page).getByText('hoody-agent', { exact: true })).toBeVisible();
};

test('System programs opened, then a program\'s Logs, then Back: still open, its programs shown', async ({ page }) => {
  // The pages the dev server serves (scripts/check.ts passes the same HUB_PAGE to Vite and to Playwright): a Programs-only
  // server serves no Logs page. Every other load has one, and the test fails if the Logs item is missing.
  test.skip(process.env.HUB_PAGE === 'programs', 'a Programs-only load serves no Logs page');
  await openSystem(page);
  const row = table(page).locator('tbody tr').filter({ has: page.getByText('hoody-agent', { exact: true }) });
  await row.getByRole('button', { name: 'Row actions' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  const logs = page.getByRole('menuitem', { name: strings['action.logs'] });
  await expect(logs).toBeVisible();
  await logs.click();
  await expect(page).toHaveURL(/\/logs/);
  await expect(table(page)).toHaveCount(0);
  await page.goBack();
  await expectStillOpen(page);
});

test('System programs opened, the Hub left by its address, then Back: still open', async ({ page }) => {
  await openSystem(page);
  await page.goto(hubUrl('/home'));
  await expect(table(page)).toHaveCount(0);
  await page.goBack();
  await expectStillOpen(page);
});

test('closed again, it comes back closed after leaving and Back', async ({ page }) => {
  await gotoHub(page, '/programs');
  await system(page).click();
  await expect(system(page)).toHaveAttribute('aria-expanded', 'true');
  await system(page).click();
  await expect(system(page)).toHaveAttribute('aria-expanded', 'false');
  await page.goto(hubUrl('/home'));
  await expect(table(page)).toHaveCount(0);
  await page.goBack();
  await expect(system(page)).toHaveAttribute('aria-expanded', 'false');
});
