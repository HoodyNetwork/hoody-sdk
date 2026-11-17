// Playwright: a program's ports and their aliases, on the default fixtures. The list's Ports cell of a
// single-port program opens its address; a range keeps its up/n text. The inspector lists each port's proxy aliases as
// links (the alias record's own url) in its Ports row, whose menu offers Create alias: an alias of another program on
// the same number, and every alias of a system program, stay out.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import kitStrings from '@kit/strings.en.json';
import strings from './strings.en.json';

const table = (page: Page) => page.getByRole('table', { name: strings.title });
const rowOf = (page: Page, name: string) => table(page).locator('tbody tr').filter({ has: page.getByText(name, { exact: true }) });
const inspector = (page: Page) => page.getByRole('region', { name: kitStrings['listDetail.detail'] });

test('a single-port program\'s Ports cell opens its address in a new tab; a range keeps its text', async ({ page }) => {
  await gotoHub(page, '/programs');
  await page.evaluate(() => {
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    window.open = (u?: string | URL) => (w.__opened.push(String(u)), null);
  });
  const web = rowOf(page, 'web');
  const port = web.getByRole('button', { name: /^3000 \(opens in a new tab\)$/ });
  await expect(port).toHaveText(/3000/);
  await port.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual([expect.stringMatching(/^https:\/\/[^/]*-3000\./)]);
  // The row was not opened by the press.
  await expect(page).not.toHaveURL(/[?&]sel=/);
  const api = rowOf(page, 'api');
  await expect(api).toContainText('8000-8003 · 2/4 up');
  await expect(api.getByRole('button', { name: /opens in a new tab/ })).toHaveCount(0);
});

test('the inspector lists a port\'s aliases with the alias url as given, never a program alias on the same number', async ({ page }) => {
  await gotoHub(page, '/programs?sel=prog%3A1');
  const pane = inspector(page);
  const alias = pane.getByRole('link', { name: /alias of port 3000/ });
  await expect(alias).toHaveAttribute('href', 'https://shop-front.custom-domain.example.test/');
  const ports = pane.getByRole('table', { name: 'Ports of web' });
  await ports.getByRole('row', { name: /^(Show details )?3000\b/ }).getByRole('button', { name: 'Row actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Create alias for port 3000' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pane.locator('a[href*="term-desk"]')).toHaveCount(0);
});

test('a range lists each port\'s aliases in its own row', async ({ page }) => {
  await gotoHub(page, '/programs?sel=prog%3A2');
  const pane = inspector(page);
  await expect(pane.getByRole('link', { name: /alias of port 8001/ })).toHaveAttribute('href', 'https://api-two.custom-domain.example.test/v1');
  await expect(pane.getByRole('link', { name: /alias of port 8003/ })).toHaveAttribute('href', 'https://api-four.custom-domain.example.test/');
  await expect(pane.getByRole('link', { name: /alias of port 8000/ })).toHaveCount(0);
});

test('a system program shows no alias, after the alias list was read', async ({ page }) => {
  await gotoHub(page, '/programs?sel=prog%3A1');
  await expect(inspector(page).getByRole('link', { name: /alias of port 3000/ })).toBeVisible();
  // The same page, another row: the alias list is already here.
  await page.evaluate(() => { window.location.hash = window.location.hash.replace(/sel=prog(%3A|:)1(?![0-9])/i, 'sel=prog%3A100'); });
  const pane = inspector(page);
  await expect(pane.getByRole('table', { name: /^Ports of / }).getByRole('row', { name: /^(Show details )?15000\b/ })).toBeVisible();
  await expect(pane.getByRole('link', { name: /alias of port/ })).toHaveCount(0);
  await expect(page.locator('a[href*="agent-door"]')).toHaveCount(0);
});
