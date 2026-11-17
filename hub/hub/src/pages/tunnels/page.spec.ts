// Playwright: the Tunnels page's flows on fixtures (run by hub:check --page tunnels). The six tagged tests are the
// functional e2e every list page keeps (FUNCTIONAL RULE): ?q, a filter key, ?sort, ?page, and all of them across a
// reload. Rows are grouped by session; group rows carry no data-row-id, so they never count as rows here.
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const table = (page: Page) => page.getByRole('table', { name: strings.title });
const dataRows = (page: Page) => table(page).locator('tbody tr[data-row-id]');
const S1 = 'S-4f2a9c1e-7b3d-4e21-9a55-0c1d2e3f4a51';

test('@search the search box narrows the rows and never writes ?q', async ({ page }) => {
  await gotoHub(page, '/tunnels');
  await expect(dataRows(page).nth(3)).toBeVisible();
  // 6379 is one port of the default fixtures.
  await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByRole('searchbox') }, {
    text: '6379',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      for (const row of await dataRows(page).all()) await expect(row).toContainText('6379');
    },
  });
});

test('@filter the Shared as chip keeps only places inside this computer and shows its value with ×', async ({ page }) => {
  await gotoHub(page, '/tunnels');
  await expect(dataRows(page).nth(3)).toBeVisible();
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: strings['filter.kind'] }).click();
  await page.getByRole('menuitemradio', { name: strings['kind.pull'] }).or(page.getByRole('menuitem', { name: strings['kind.pull'] })).click();
  await expect(page).toHaveURL(/[?&]kind=pull/);
  await expect.poll(() => dataRows(page).count()).toBe(3);
  for (const row of await dataRows(page).all()) await expect(row).toContainText(strings['kind.pull']);
});

test('@sort the Port header sorts the rows and keeps ?sort', async ({ page }) => {
  await gotoHub(page, '/tunnels', { state: 'many' });
  await expect(dataRows(page).nth(3)).toBeVisible();
  const header = table(page).getByRole('columnheader', { name: strings['col.port'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-?port/);
  await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
  const ports = (await dataRows(page).locator('td:nth-child(3)').allInnerTexts()).map((x) => Number(x.trim()));
  const asc = [...ports].sort((a, b) => a - b);
  expect([asc, [...asc].reverse()]).toContainEqual(ports);
});

test('@page the pager moves to page 2, keeps ?page and shows the next rows', async ({ page }) => {
  await gotoHub(page, '/tunnels', { state: 'many' });
  await expect(dataRows(page).nth(3)).toBeVisible();
  // The first data row's text (a reason: any row would do), to see the page change.
  const first = await dataRows(page).first().innerText();
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  // The first data row of page 2 (a reason: any row would do).
  await expect(dataRows(page).first()).not.toHaveText(first);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('@reload chip, sort, page and the open row survive a reload, the search does not', async ({ page }) => {
  // The link brings the search with the Kind chip, the sort, page 2 and the open row S1~51 (port 3050). The helper
  // proves the search is adopted and gone after the reload while every kept key keeps its value. The old text 'web' is
  // under the helper's 4 characters and is the kind label of every row: '3050' is the open row's port alone.
  await expectLinkSearchDroppedOnReload(page, { param: '', box: page.getByRole('searchbox') }, {
    text: '3050',
    path: '/tunnels',
    goto: { state: 'many' },
    keep: { kind: 'expose', sort: 'port', page: '2', sel: `${S1}~51` },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      await expect(dataRows(page).first()).toContainText('3050');
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(10);
    },
    before: async () => {
      await expect(page.getByText(strings['access.line'])).toBeVisible();
    },
    after: async () => {
      await expect(page.getByRole('navigation', { name: 'Pages' })).toContainText('51');
      await expect(page.getByText(strings['access.line'])).toBeVisible();
    },
  });
});

test('@no-match a search with no result shows the no-match state; Clear filters restores the rows', async ({ page }) => {
  await gotoHub(page, '/tunnels');
  await expect(dataRows(page).nth(3)).toBeVisible();
  const before = await dataRows(page).count();
  await page.getByRole('searchbox').fill('zzzz-no-such-thing');
  await expect(page.getByText(strings.noMatch)).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

test('a row opens its inspector; Show reveals the connection address; Back closes it', async ({ page }) => {
  await gotoHub(page, '/tunnels');
  await dataRows(page).filter({ hasText: '127.0.0.1:6379' }).click();
  await expect(page).toHaveURL(/sel=/);
  await expect(page.getByText(strings['pull.line'])).toBeVisible();
  await page.getByRole('button', { name: /^Show the connection address/ }).click();
  await expect(page.getByText('192.0.2.44')).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/sel=/);
});

test('a stopped tunnel program shows the stopped state and sends nothing to it', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/tunnel/')) sent.push(r.url());
  });
  await gotoHub(page, '/tunnels', { state: 'program-stopped' });
  await expect(page.getByText(strings['st.stopped'])).toBeVisible();
  expect(sent).toEqual([]);
});
