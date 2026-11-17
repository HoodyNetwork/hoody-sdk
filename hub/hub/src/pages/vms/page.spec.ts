// Playwright: the VM list's flows on fixtures (run by hub:check --page vms).
// The six tagged tests are the functional e2e of a list (search, filter, sort, paging, reload, no match); then the
// flows a person takes from the list: open a VM, start one, and a shut-down whose answer is lost.
// The default fixture state holds 17 VMs (one per state, then lab-01 to lab-06), ten to a table page.
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const LABEL = strings['list.label'].replace('{{name}}', 'atlas');
const named = (key: keyof typeof strings, vm: string) => strings[key].replace('{{vm}}', vm);
const table = (page: Page) => page.getByRole('table', { name: LABEL });
const dataRows = (page: Page) => table(page).locator('tbody tr');
const box = (page: Page) => page.getByRole('searchbox');

test('@search the search box narrows the rows and never writes ?q', async ({ page }) => {
  await gotoHub(page, '/vms');
  await expectSearchStaysOutOfUrl(page, { param: '', box: box(page) }, {
    text: 'lab-0',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(6);
      for (const row of await dataRows(page).all()) await expect(row).toContainText('lab-0');
    },
  });
});

test('@filter the State chip filters the rows and keeps ?state', async ({ page }) => {
  await gotoHub(page, '/vms');
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: strings['list.filter.state'] }).click();
  await page.getByRole('menuitemradio', { name: strings['state.stopped'] }).or(page.getByRole('menuitem', { name: strings['state.stopped'] })).click();
  await expect(page).toHaveURL(/[?&]state=stopped/);
  await expect(dataRows(page)).toHaveCount(8);
  for (const row of await dataRows(page).all()) await expect(row).toContainText(strings['state.stopped']);
});

test('@sort the Name header sorts the rows and keeps ?sort', async ({ page }) => {
  await gotoHub(page, '/vms');
  const header = table(page).getByRole('columnheader', { name: strings['list.col.name'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-?name/);
  await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
  const names = await dataRows(page).locator('td:first-child').allInnerTexts();
  const sorted = [...names].sort(new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare);
  expect([names, [...names].reverse()]).toContainEqual(sorted);
});

test('@page the pager moves to page 2, keeps ?page and shows the next rows', async ({ page }) => {
  await gotoHub(page, '/vms');
  await expect(dataRows(page)).toHaveCount(10);
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(dataRows(page)).toHaveCount(7);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('@reload sort and page survive a reload, the search does not', async ({ page }) => {
  // By name, page 2 holds 7 VMs (lab-04 to lab-06 among them); the search leaves the six lab VMs.
  await expectLinkSearchDroppedOnReload(page, { param: '', box: box(page) }, {
    text: 'lab-0',
    path: '/vms',
    keep: { sort: 'name', page: '2' },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(6);
      for (const row of await dataRows(page).all()) await expect(row).toContainText('lab-0');
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(7);
    },
  });
});

test('@no-match a search with no result shows the no-match state; Clear filters restores the rows', async ({ page }) => {
  await gotoHub(page, '/vms');
  await expect(dataRows(page)).toHaveCount(10);
  await box(page).fill('zzzz-no-such-vm');
  await expect(page.getByText(strings['list.noMatch'])).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect(dataRows(page)).toHaveCount(10);
});

test('a row opens the VM, with its tabs; Back returns to the list', async ({ page }) => {
  await gotoHub(page, '/vms');
  await table(page).getByText('web-1', { exact: true }).click();
  await expect(page).toHaveURL(/\/vms\/web-1/);
  await expect(page.getByRole('heading', { level: 1, name: 'web-1' })).toBeVisible();
  await expect(page.getByRole('tab', { name: strings['tab.overview'] })).toBeVisible();
  await page.goBack();
  await expect(table(page)).toBeVisible();
});

test('Start is sent once and the row then reads Running', async ({ page }) => {
  await gotoHub(page, '/vms?q=win11', { state: 'power-ok' });
  await table(page).getByRole('button', { name: named('power.named.start', 'win11') }).click();
  await expect(dataRows(page)).toContainText([strings['state.running']]);
  await expect(table(page).getByRole('button', { name: named('power.named.stop', 'win11') })).toBeVisible();
});

test('a shut-down whose answer is lost is held: Check again only, and the action waits', async ({ page }) => {
  await gotoHub(page, '/vms?q=web-1', { state: 'power-lost' });
  await table(page).getByRole('button', { name: named('power.named.stop', 'web-1') }).click();
  await expect(page.getByText(named('power.held.stop', 'web-1'))).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
  await expect(table(page).getByRole('button', { name: named('power.named.stop', 'web-1') })).toHaveAttribute('aria-disabled', 'true');
  await expect(dataRows(page)).toContainText([strings['state.running']]);
});

test('delete asks for the name before it sends, and the VM then leaves the list', async ({ page }) => {
  await gotoHub(page, '/vms?q=win11', { state: 'power-ok' });
  await table(page).getByRole('button', { name: 'Row actions' }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${named('power.named.delete', 'win11')}`) }).click();
  const go = page.getByRole('button', { name: strings['delete.ask.go'] });
  await expect(go).toBeDisabled();
  await page.getByRole('textbox', { name: /win11/ }).fill('win11');
  await go.click();
  await expect(table(page).getByText('win11', { exact: true })).toHaveCount(0);
});
