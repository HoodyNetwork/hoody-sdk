// Playwright: the Files page's flows on fixtures (run by hub:check --page files).
// The six tagged tests are the functional e2e every list page keeps (FUNCTIONAL RULE), here on the left pane, whose
// view keys carry its letter (aq, akind, asort, apage). atlas's /srv/media holds 120 files, so there is a page 2.
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const MEDIA = '/files?a=atlas.00a1&ap=%2Fsrv%2Fmedia';
// Every locator is scoped to one pane's region, so the same table, search box and pager in the other pane never match.
const paneA = (page: Page) => page.getByRole('region', { name: strings['pane.a'] });
const paneB = (page: Page) => page.getByRole('region', { name: strings['pane.b'] });
const table = (page: Page) => paneA(page).getByRole('table', { name: strings['table.label'].replace('{{name}}', 'atlas') });
const dataRows = (page: Page) => table(page).locator('tbody tr');
// The left pane's own view (param 'a'): its search box is the one inside its region, never the other pane's.
const viewA = (page: Page) => ({ param: 'a', box: paneA(page).getByRole('searchbox') });

test('@search the search box narrows the rows and never writes ?aq', async ({ page }) => {
  await gotoHub(page, MEDIA);
  await expect(dataRows(page).first()).toBeVisible();
  // The search stays out of the URL, proved by the shared helper on the left pane's view (param 'a').
  await expectSearchStaysOutOfUrl(page, viewA(page), {
    text: 'photo-11',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(10); // photo-110 .. photo-119
      for (const row of await dataRows(page).all()) await expect(row).toContainText('photo-11');
    },
  });
});

test('@filter the Kind chip filters the rows and keeps ?akind', async ({ page }) => {
  await gotoHub(page, '/files?a=atlas.00a1&ap=%2Fhome%2Fada');
  await expect(dataRows(page).first()).toBeVisible();
  // A half-width pane folds its chips into the Filters button; a wide one shows them inline. The chip opens a menu,
  // which tells it from the Kind column's sort button (a full-width pane shows that column).
  const fold = paneA(page).getByRole('button', { name: 'Filters', exact: true });
  if (await fold.isVisible()) await fold.click();
  await page.getByRole('button', { name: new RegExp(`^${strings['filter.kind']}`) }).and(page.locator('[aria-haspopup]')).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${strings['kind.file']}`) }).click();
  await expect(page).toHaveURL(/[?&]akind=file/);
  // The Kind column is shed at half width: check by names (projects is a folder of /home/ada).
  await expect(table(page).getByRole('row', { name: /projects/ })).toHaveCount(0);
  await expect(table(page).getByRole('row', { name: /bell/ })).toBeVisible();
});

test('@sort a column header sorts the rows and keeps ?asort', async ({ page }) => {
  await gotoHub(page, MEDIA);
  const header = table(page).getByRole('columnheader', { name: strings['col.name'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]asort=-?name/);
  await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
  const names = await dataRows(page).locator('td:first-child').allInnerTexts();
  const sorted = [...names].sort(new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare);
  expect([names, [...names].reverse()]).toContainEqual(sorted);
});

test('@page the pager moves to page 2, keeps ?apage and shows the next rows', async ({ page }) => {
  await gotoHub(page, MEDIA);
  await expect(dataRows(page).first()).toBeVisible();
  const first = await dataRows(page).first().innerText();
  await paneA(page).getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/[?&]apage=2/);
  await expect(dataRows(page).first()).not.toHaveText(first);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]apage=/);
});

test('@reload the folder, chip, sort and page survive a reload, the search does not', async ({ page }) => {
  // The link brings the search with the folder, Kind chip, sort and page 2; the helper proves the search is adopted
  // once and gone after the reload while every kept key keeps its value. 'photo-11' matches ten of the 120 files (a page
  // past the last shows the last); with no search page 2 is the 50 rows photo-051 .. photo-100.
  await expectLinkSearchDroppedOnReload(page, viewA(page), {
    text: 'photo-11',
    path: MEDIA,
    keep: { a: 'atlas.00a1', ap: '/srv/media', akind: 'file', asort: 'name', apage: '2' },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(10);
      for (const row of await dataRows(page).all()) await expect(row).toContainText('photo-11');
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(50);
    },
    after: async () => {
      await expect(paneA(page).getByRole('navigation', { name: 'Pages' })).toContainText('51');
    },
  });
});

test('@no-match a search with no result shows the no-match state; Clear filters restores the rows', async ({ page }) => {
  await gotoHub(page, MEDIA);
  await expect(dataRows(page).first()).toBeVisible();
  const before = await dataRows(page).count();
  await paneA(page).getByRole('searchbox').fill('zzzz-no-such-file');
  await expect(page.getByText(strings.noMatch)).toBeVisible();
  await paneA(page).getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]aq=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

test('a folder opens on click, its breadcrumb goes back, and the right pane keeps its own folder', async ({ page }) => {
  await gotoHub(page, '/files?a=atlas.00a1&b=atlas.00a1&bp=%2Fetc');
  await table(page).getByRole('row', { name: /\bsrv\b/ }).click();
  await expect(page).toHaveURL(/[?&]ap=%2Fsrv(&|$)/);
  await expect(page).toHaveURL(/[?&]bp=%2Fetc/);
  await paneA(page).getByRole('list', { name: 'Breadcrumbs' }).getByRole('link', { name: 'atlas' }).click();
  await expect(page).not.toHaveURL(/[?&]ap=/);
  await expect(page).toHaveURL(/[?&]bp=%2Fetc/);
  await expect(paneB(page).getByRole('list', { name: 'Breadcrumbs' })).toContainText('etc');
});

test('on a phone one pane shows, with a From / To switch', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, '/files?a=atlas.00a1&b=cedar.00c3');
  await expect(table(page)).toBeVisible();
  await page.getByRole('radio', { name: strings['side.b'] }).click();
  await expect(page).toHaveURL(/[?&]side=b/);
  await expect(page.getByText(strings['st.stopped'].replace('{{name}}', 'cedar'))).toBeVisible();
  await expect(table(page)).toHaveCount(0);
});
