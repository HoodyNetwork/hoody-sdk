// Playwright: the schedules page's flows on fixtures (run by hub:check --page schedules).
// The five tagged tests are the functional e2e every list page keeps.
import { type Page, expect } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub, test } from '@app/e2e';
import strings from './strings.en.json';

const table = (page: Page) => page.getByRole('table', { name: strings.title });
const dataRows = (page: Page) => table(page).locator('tbody tr');

test('@search the search box narrows the rows and never writes ?q', async ({ hubPage: page }) => {
  await gotoHub(page, '/schedules');
  await expect(dataRows(page).nth(3)).toBeVisible();
  // 'backup' is the Nightly backup command in the default fixtures.
  await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'backup',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      for (const row of await dataRows(page).all()) await expect(row).toContainText(/backup/i);
    },
  });
});

test('@filter a chip filters the rows and shows its value with ×', async ({ hubPage: page }) => {
  await gotoHub(page, '/schedules');
  await expect(dataRows(page).nth(3)).toBeVisible();
  const before = await dataRows(page).count();
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: strings['f.status'] }).click();
  await page.getByRole('menuitemradio', { name: strings['f.attention'] }).or(page.getByRole('menuitem', { name: strings['f.attention'] })).first().click(); // first: radio and plain-menu variants of one item are never both present
  await expect(page).toHaveURL(/[?&]status=attention/);
  await expect.poll(() => dataRows(page).count()).toBeLessThan(before);
  for (const row of await dataRows(page).all()) await expect(row.getByLabel(strings['f.attention'])).toBeVisible();
});

test('@sort a column header sorts the rows and keeps ?sort', async ({ hubPage: page }) => {
  await gotoHub(page, '/schedules');
  await expect(dataRows(page).nth(1)).toBeVisible(); // the data rows are drawn before the columns are read
  const heads = await table(page).getByRole('columnheader').allInnerTexts();
  const col = heads.findIndex((h) => h.includes(strings['col.name']));
  const names = async () => (await dataRows(page).evaluateAll((rs, i) => rs.map((r) => (r.querySelectorAll('td, [role="gridcell"], [role="cell"]')[i]?.textContent ?? '').trim()), col));
  const header = table(page).getByRole('columnheader', { name: strings['col.name'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-?name/);
  await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
  const got = await names();
  expect(got.length).toBeGreaterThan(1);
  const asc = (await header.getAttribute('aria-sort')) === 'ascending';
  const want = [...got].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  if (!asc) want.reverse();
  expect(got).toEqual(want);
});

test('@page the pager moves to page 2, keeps ?page and shows the next rows', async ({ hubPage: page }) => {
  await gotoHub(page, '/schedules', { state: 'long' });
  await expect(dataRows(page).first()).toBeVisible();
  const first = await dataRows(page).first().innerText();
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(dataRows(page).first()).not.toHaveText(first);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('@reload chip, sort, page and the open row survive a reload, the search does not', async ({ hubPage: page }) => {
  // The link brings the search with the Kind chip, the sort, page 2 and the open row cron:user/a3 (sync-photos). The
  // helper proves the search is adopted and gone after the reload while every kept key keeps its value. The old text 'a'
  // is under the helper's 4 characters: 'photos' is the open row alone, so its detail is on screen with the search too.
  await expectLinkSearchDroppedOnReload(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'photos',
    path: '/schedules',
    goto: { state: 'long' },
    keep: { kind: 'commands', sort: 'name', page: '2', sel: 'cron:user/a3' },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      for (const row of await dataRows(page).all()) await expect(row).toContainText(/photos/i);
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(18);
    },
    before: async () => {
      await expect(page.getByRole('heading', { name: strings['detail.history'] })).toBeVisible();
    },
    after: async () => {
      await expect(page.getByRole('heading', { name: strings['detail.history'] })).toBeVisible();
    },
  });
});

test('@no-match a search with no result shows the no-match state; Clear filters restores the rows', async ({ hubPage: page }) => {
  await gotoHub(page, '/schedules');
  await expect(dataRows(page).nth(3)).toBeVisible();
  const before = await dataRows(page).count();
  await page.getByRole('searchbox').fill('zzzz-no-such-thing');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

test('select a schedule, then Back returns to the list', async ({ hubPage: page }) => {
  await gotoHub(page, '/schedules');
  await dataRows(page).nth(1).click();
  await expect(page).toHaveURL(/sel=/);
  await expect(page.getByRole('heading', { name: strings['detail.history'] })).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/sel=/);
});

test('New schedule opens the chooser and Back in the browser closes it', async ({ hubPage: page }) => {
  await gotoHub(page, '/schedules');
  await page.getByRole('button', { name: strings['action.new'] }).first().click(); // first: the header and the empty-state button both say New
  await expect(page).toHaveURL(/edit=new/);
  await expect(page.getByText(strings['new.pick'])).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/edit=/);
});

test('an unknown save locks the drawer and offers Check again only', async ({ hubPage: page }) => {
  await gotoHub(page, '/schedules?edit=cron%3Auser%2Fa1', { state: 'save-pending' });
  const runs = page.getByRole('dialog').getByRole('button', { name: new RegExp(strings['ed.when']) });
  await runs.click();
  await page.getByRole('option', { name: strings['ed.k.weekdays'] }).click();
  await page.getByRole('button', { name: strings['ed.save'] }).click();
  await expect(page.locator('[data-outcome="pending"]').first()).toBeVisible();
  await expect(runs).toBeDisabled();
});
