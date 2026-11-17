// Playwright: Download from a link in a real browser. The dialog takes a pasted link; the folder shows one
// notice for its link downloads that links to Transfers, where the download's row follows
// it to its end, and the file is listed; a lost answer leaves a held row with Check again. The link is never shown on
// the page after the dialog closes. axe finds nothing in the dialog, the notice or the rows.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';
import ls from './link/link.strings.en.json';
import xs from './transfers/transfers.strings.en.json';

const TMP = '/files?a=atlas.00a1&ap=%2Ftmp';
const LINK = 'https://downloads.example/big.iso?token=SECRET';
const paneA = (page: Page) => page.getByRole('region', { name: strings['pane.a'] });
async function axeClean(page: Page) {
  const b = new AxeBuilder({ page }).include('#hub-main');
  if (await page.getByRole('dialog').count()) b.include('[role="dialog"]');
  const r = await b.analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.html.slice(0, 160)}`).join(' | ')}`)).toEqual([]);
}
async function send(page: Page, state?: string) {
  await gotoHub(page, TMP, state ? { state } : {});
  // Download from link is in the pane bar's More menu.
  await paneA(page).getByRole('button', { name: strings['action.more'], exact: true }).click();
  const b = page.getByRole('menuitem', { name: ls.action });
  await expect(b).toBeEnabled();
  await b.click();
  const d = page.getByRole('dialog');
  await d.getByRole('textbox', { name: ls['field.link'] }).fill(LINK);
  await expect(d.getByRole('textbox', { name: ls['field.name'] })).toHaveValue('big.iso');
  await axeClean(page);
  await d.getByRole('button', { name: ls.send }).click();
  await expect(d).toHaveCount(0);
}

test('download from link: accepted, followed to done, the file listed; the link never shown; axe finds nothing', async ({ page }) => {
  await send(page);
  // One notice, never a line per download; it ends as "1 download ended".
  await expect(page.getByText('1 download ended', { exact: false })).toBeVisible({ timeout: 10_000 });
  await axeClean(page);
  await expect(paneA(page).locator('tbody tr', { hasText: 'big.iso' })).toBeVisible();
  expect(await page.content()).not.toContain('SECRET');
  await page.getByRole('button', { name: ls['notice.open'] }).click();
  await expect(page.getByRole('tab', { name: xs['tab.transfers'] })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('row', { name: /big\.iso → tmp/ }).getByText(xs['state.done'], { exact: true })).toBeVisible();
  await axeClean(page);
});

test('download from link: a lost answer is held with Check again, which finds it and follows it', async ({ page }) => {
  await send(page, 'linkLost');
  await expect(page.getByText('1 download needs you', { exact: false })).toBeVisible();
  await axeClean(page);
  expect(await page.content()).not.toContain('SECRET');
  await page.getByRole('button', { name: ls['notice.open'] }).click();
  const row = page.getByRole('row', { name: /big\.iso → tmp/ });
  await expect(row.getByText(xs['state.unknown'], { exact: true })).toBeVisible();
  await axeClean(page);
  await row.getByRole('button', { name: /check again/i }).click();
  await expect(row.getByText(xs['state.done'], { exact: true })).toBeVisible({ timeout: 10_000 });
});

test('download from link at phone width: the action stays reachable with its name', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, TMP);
  await paneA(page).getByRole('button', { name: strings['action.more'], exact: true }).click();
  await expect(page.getByRole('menuitem', { name: ls.action })).toBeVisible();
});
