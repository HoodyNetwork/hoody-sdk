// Playwright: the __ID__ page's flows on fixtures (run by hub:check --page __ID__).
// The six tagged tests are the functional e2e every list page must keep (FUNCTIONAL RULE). The
// conformance test looks for the tags @search @filter @sort @page @reload @no-match in test titles,
// and for the URL each one proves: a filter key, ?sort, ?page, and all three across a reload. @search and @reload call
// the shared search helpers (app/e2e-search.ts), which app/search-proofs.ts requires per test.
// Adapt the names and values to your rows; keep what each test proves.
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const table = (page: Page) => page.getByRole('table', { name: strings.title });
const dataRows = (page: Page) => table(page).locator('tbody tr');

test('@search the search box narrows the rows and never writes ?q', async ({ page }) => {
  await gotoHub(page, '/__ID__');
  // The search stays out of the URL, proved by the shared helper (the URL, history state and every link, sampled through a settle window).
  // Use a search text of four or more characters that matches real rows and is on no link, path or kept value of
  // the page ('atlas' is the fixture world's computer, shown in the shell). Ten rows are kestrel-1 … kestrel-10.
  await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'kestrel',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(10);
      for (const row of await dataRows(page).all()) await expect(row).toContainText('kestrel');
    },
  });
});

test('@filter a chip filters the rows and shows its value with ×', async ({ page }) => {
  await gotoHub(page, '/__ID__');
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: strings['filter.status'] }).click();
  await page.getByRole('menuitemradio', { name: strings['status.failed'] }).or(page.getByRole('menuitem', { name: strings['status.failed'] })).click();
  await expect(page).toHaveURL(/[?&]status=failed/);
  for (const row of await dataRows(page).all()) await expect(row).toContainText(strings['status.failed']);
});

test('@sort a column header sorts the rows and keeps ?sort', async ({ page }) => {
  await gotoHub(page, '/__ID__');
  const header = table(page).getByRole('columnheader', { name: strings['col.name'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-?name/);
  await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
  const names = await dataRows(page).locator('td:first-child').allInnerTexts();
  // The kit sorts like a person reads numbers (atlas-2 before atlas-10).
  const sorted = [...names].sort(new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare);
  expect([names, [...names].reverse()]).toContainEqual(sorted);
});

test('@page the pager moves to page 2, keeps ?page and shows the next rows', async ({ page }) => {
  await gotoHub(page, '/__ID__');
  await expect(dataRows(page).first()).toBeVisible();
  const first = await dataRows(page).first().innerText();
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(dataRows(page).first()).not.toHaveText(first);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('@reload chip, sort, page and the open row survive a reload, the search does not', async ({ page }) => {
  // The link brings the search with the chip, sort, page and open row; the helper proves the search is adopted and
  // gone after the reload while every kept key keeps its value. Active rows: 72, page 2 = rows 51-72; six of them are
  // kestrel rows (a page past the last shows the last).
  await expectLinkSearchDroppedOnReload(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'kestrel',
    path: '/__ID__',
    keep: { status: 'active', sort: 'name', page: '2', sel: 'item-01' },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(6);
      for (const row of await dataRows(page).all()) await expect(row).toContainText('kestrel');
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(22);
    },
    after: async () => {
      await expect(page.getByRole('navigation', { name: 'Pages' })).toContainText('51');
      await expect(page.getByRole('heading', { name: strings['detail.facts'] })).toBeVisible();
    },
  });
});

test('@no-match a search with no result shows the no-match state; Clear filters restores the rows', async ({ page }) => {
  await gotoHub(page, '/__ID__');
  await expect(dataRows(page).first()).toBeVisible();
  const before = await dataRows(page).count();
  await page.getByRole('searchbox').fill('zzzz-no-such-thing');
  await expect(page.getByText(strings.noMatch)).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

test('select an item, then Back returns to the list', async ({ page }) => {
  await gotoHub(page, '/__ID__');
  await dataRows(page).nth(1).click();
  await expect(page).toHaveURL(/sel=item-/);
  await expect(page.getByRole('heading', { name: strings['detail.facts'] })).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/sel=/);
});

test('an unknown save locks the drawer and offers Check again only', async ({ page }) => {
  await gotoHub(page, '/__ID__?sel=item-02', { state: 'save-unknown' });
  await page.getByRole('button', { name: strings['action.edit'], exact: true }).click();
  await page.getByLabel(strings['edit.name']).fill('atlas-2');
  await page.getByRole('button', { name: strings['edit.save'] }).click();
  await expect(page.locator('[data-outcome="pending"]').first()).toBeVisible();
  await expect(page.getByLabel(strings['edit.name'])).toBeDisabled();
});
