// Playwright: the programs page's flows on fixtures (run by hub:check --page programs).
// The five tagged tests are the functional e2e every list page keeps (FUNCTIONAL RULE).
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub } from '@app/e2e';
import kitStrings from '@kit/strings.en.json';
import strings from './strings.en.json';

const table = (page: Page) => page.getByRole('table', { name: strings.title });
// Program rows only: a group row (System programs) and a range's parts row span the table in one cell.
const dataRows = (page: Page) => table(page).locator('tbody tr').filter({ hasNot: page.locator('td[colspan]') });
/** The inspector pane: the kit's list/detail region, so a control shown in a row too is found once. */
const inspector = (page: Page) => page.getByRole('region', { name: kitStrings['listDetail.detail'] });

test('@search the search box narrows the rows and never writes ?q', async ({ page }) => {
  await gotoHub(page, '/programs');
  await expect(dataRows(page).nth(3)).toBeVisible();
  // 'worker' is the one program of that name in the default fixtures.
  await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'worker',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      for (const row of await dataRows(page).all()) await expect(row).toContainText(/worker/i);
    },
  });
});

test('@filter the State filter narrows the rows and keeps ?state', async ({ page }) => {
  await gotoHub(page, '/programs');
  await expect(dataRows(page).nth(3)).toBeVisible();
  const before = await dataRows(page).count();
  await page.getByRole('radio', { name: strings['f.stopped'] }).click();
  await expect(page).toHaveURL(/[?&]state=stopped/);
  await expect.poll(() => dataRows(page).count()).toBeLessThan(before);
  // Stopped covers every stopped bucket (stopped, finished, idle): none of the rows is running.
  for (const row of await dataRows(page).all()) await expect(row).not.toContainText(/Running/);
});

test('@sort a column header sorts the rows and keeps ?sort', async ({ page }) => {
  await gotoHub(page, '/programs');
  const header = table(page).getByRole('columnheader', { name: strings['col.name'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-?name/);
  await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
});

test('@page the pager moves to page 2, keeps ?page and shows the next rows', async ({ page }) => {
  await gotoHub(page, '/programs', { state: 'paged' });
  await expect(dataRows(page).nth(3)).toBeVisible();
  // The whole page of names, not one row: page 2 shows a different set.
  const names = () => dataRows(page).evaluateAll((rows) => rows.map((r) => r.getAttribute('data-row-id')).join(','));
  const pageOne = await names();
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect.poll(names).not.toBe(pageOne);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('@reload State filter, sort, page and the open row survive a reload, the search does not', async ({ page }) => {
  test.slow(); // the helper's settle windows on a 70-program page
  // The link brings the search with the State filter, the sort, page 2 and the open row prog:255 (job-56). The helper
  // proves the search is adopted and gone after the reload while every kept key keeps its value. The old text 'job' is
  // under the helper's 4 characters: 'job-1' is job-10 … job-19 (not the open job-56, whose name no link may carry).
  await expectLinkSearchDroppedOnReload(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'job-1',
    path: '/programs',
    goto: { state: 'paged' },
    keep: { state: 'running', sort: 'name', page: '2', sel: 'prog:255' },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(10);
      for (const row of await dataRows(page).all()) await expect(row).toContainText(/job-1/i);
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(21);
    },
    before: async () => {
      await expect(inspector(page).getByText(strings['fact.kind'], { exact: true })).toBeVisible();
    },
    after: async () => {
      await expect(inspector(page).getByText(strings['fact.kind'], { exact: true })).toBeVisible();
    },
  });
});

test('@no-match a search with no result shows the no-match state; Clear filters restores the rows', async ({ page }) => {
  await gotoHub(page, '/programs');
  await expect(dataRows(page).nth(3)).toBeVisible();
  const before = await dataRows(page).count();
  await page.getByRole('searchbox').fill('zzzz-no-such-thing');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

test('select a program, then Back returns to the list', async ({ page }) => {
  await gotoHub(page, '/programs');
  await dataRows(page).nth(1).click();
  await expect(page).toHaveURL(/sel=prog/);
  await expect(inspector(page).getByText(strings['fact.kind'], { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/sel=/);
});

test('an unknown outcome says "may have gone through" and offers Check again, which only reads', async ({ page }) => {
  await gotoHub(page, '/programs?sel=prog%3A1', { state: 'press-pending' });
  await inspector(page).getByRole('button', { name: 'Restart web' }).click();
  await expect(inspector(page).getByText(strings['op.pending'])).toBeVisible();
  await expect(inspector(page).getByRole('button', { name: 'Restart web' })).toBeDisabled();
  await expect(inspector(page).getByRole('button', { name: /Check again/ })).toBeVisible();
});
