// Playwright: the Transfers tab in a real browser. A quiet computer says nothing is moving; a
// link download started in Browse is a row of the Transfers table with its progress and Cancel, never its link. axe
// finds nothing on the tab.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';
import ls from './link/link.strings.en.json';
import xs from './transfers/transfers.strings.en.json';

const TMP = '/files?a=atlas.00a1&ap=%2Ftmp';
const paneA = (page: Page) => page.getByRole('region', { name: strings['pane.a'] });
async function axeClean(page: Page) {
  const r = await new AxeBuilder({ page }).include('#hub-main').analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.html.slice(0, 160)}`).join(' | ')}`)).toEqual([]);
}

test('transfers: a quiet computer, then a running link download with Cancel; axe finds nothing', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoHub(page, `${TMP}&tab=transfers`, { state: 'linkRunning' });
  await expect(page.getByText('Nothing is moving on atlas.')).toBeVisible({ timeout: 30_000 });
  await axeClean(page);
  await page.getByRole('tab', { name: xs['tab.browse'] }).click();
  // Download from link is in the pane bar's More menu.
  await paneA(page).getByRole('button', { name: strings['action.more'], exact: true }).click();
  const b = page.getByRole('menuitem', { name: ls.action });
  await expect(b).toBeEnabled();
  await b.click();
  const d = page.getByRole('dialog');
  await d.getByRole('textbox', { name: ls['field.link'] }).fill('https://downloads.example/big.iso?token=SECRET');
  await d.getByRole('button', { name: ls.send }).click();
  await expect(d).toHaveCount(0);
  await page.getByRole('tab', { name: xs['tab.transfers'] }).click();
  await expect(page).toHaveURL(/tab=transfers/);
  await expect(page.getByText('big.iso → tmp')).toBeVisible();
  await expect(page.getByRole('button', { name: `${ls.cancel} big.iso` })).toBeEnabled();
  await axeClean(page);
  // Details is kept at every table width; it drops only with the table, into the list row's line 2 (list mode is one
  // "Item → folder" column whose row still shows the details).
  const detail = ls['line.runningBusy'].replace('{{folder}}', 'tmp');
  for (const width of [1440, 1100, 900, 768, 600]) {
    await page.setViewportSize({ width, height: 900 });
    const heads = page.locator('#files-transfers').getByRole('columnheader');
    const shown = async () => {
      const n = await heads.count();
      if (n > 1) return (await heads.filter({ hasText: xs['col.detail'] }).count()) === 1;
      return (await page.locator('#files-transfers').getByText(detail).count()) > 0;
    };
    await expect.poll(shown, { message: `Details at ${width}` }).toBe(true);
  }
  expect(await page.content()).not.toContain('SECRET');
});

test('transfers at phone width: the tabs stay reachable', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, `${TMP}&tab=transfers`);
  await expect(page.getByRole('tab', { name: xs['tab.transfers'] })).toBeVisible();
  await expect(page.getByText('Nothing is moving on atlas.')).toBeVisible({ timeout: 30_000 });
});
