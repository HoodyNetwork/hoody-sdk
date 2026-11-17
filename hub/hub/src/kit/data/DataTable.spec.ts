// Playwright: the standard data view on the kit gallery (/_kit?tab=table). The table there runs
// on useDataView with the URL prefix "g" (gq, gstate, gserver, gram, gsort, gpage). These are the
// same five functional proofs every list page keeps (search, chip, sort, reload, no-match).
import { type Page, expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub } from '@app/e2e';
import kit from '../strings.en.json';
import strings from '../gallery/table.strings.en.json';

// The full table's box: the gallery also shows list-presentation tables with their own search and chips.
const box = (page: Page) => page.locator('[data-gallery="full-table"]');
const table = (page: Page) => box(page).getByRole('table', { name: strings['sec.full'] });
const dataRows = (page: Page) => table(page).locator('tbody tr[data-row-id]');
const names = (page: Page) => dataRows(page).locator('td:nth-child(2)').allInnerTexts();

/**
 * Ready waits have no cap of their own: the test's budget bounds them. A whole-gallery load takes about 10 s on a
 * quiet machine and over 2 minutes with the CPU slowed 20x, so any fixed number here would be a guess.
 */
const READY = 0;

/** Open the gallery tab and wait until the table has drawn its rows (the gallery loads lazily). */
async function open(page: Page, query = ''): Promise<void> {
  await gotoHub(page, `/_kit?tab=table${query}`);
  await table(page).waitFor({ timeout: READY });
}

const view = (page: Page) => ({ param: 'g', box: box(page).getByRole('searchbox') });
const rowIds = (page: Page) => dataRows(page).evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-row-id')));

test('@search search folds case, never writes the search to the URL and narrows the rows', async ({ page }) => {
  await open(page);
  await dataRows(page).first().waitFor();
  // The search stays out of the URL, proved by the shared helper. 'atl' was the old text: 'atlas' is the fixture world's computer, shown in the
  // shell, so the term is the project "Acme storefront" of borealis, ember and granite. Typed as 'ACME', the three rows
  // are the proof that the search folds case (the rows show no project text, so the ids say which rows answered).
  await expectSearchStaysOutOfUrl(page, view(page), {
    text: 'ACME',
    searched: async () => {
      await expect.poll(() => rowIds(page), { timeout: READY }).toEqual(['borealis', 'ember', 'granite']);
    },
  });
  await expect(box(page).getByRole('searchbox')).toHaveValue('ACME');
});

test('@filter a chip filters, shows its value with ×, and × clears it', async ({ page }) => {
  await open(page);
  const chips = box(page).getByRole('group', { name: 'Filters' });
  await chips.getByRole('button', { name: strings['filter.state'] }).click();
  await page.getByRole('menuitemradio', { name: strings['state.running'] }).click();
  await expect(page).toHaveURL(/[?&]gstate=running/);
  for (const row of await dataRows(page).all()) await expect(row).toContainText(strings['state.running']);
  await chips.getByRole('button', { name: kit['table.clearFilter'].replace('{{name}}', strings['filter.state']), exact: true }).click();
  await expect(page).not.toHaveURL(/gstate=/);
});

test('@sort a header sorts the rows and keeps ?gsort', async ({ page }) => {
  await open(page);
  const header = table(page).getByRole('columnheader', { name: strings['col.name'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]gsort=-name/);
  await expect(header).toHaveAttribute('aria-sort', 'descending');
  const got = await names(page);
  expect(got).toEqual([...got].sort((a, b) => b.localeCompare(a, 'en', { numeric: true })));
});

/**
 * The reload view: search "acme", State = Running, Name descending. On the gallery's fixture each part narrows or
 * orders the rows on its own: the search keeps 3 of 8 (borealis, ember, granite), Running drops ember, and the sort puts
 * granite first. So the exact row ids prove all three, and that no row is missing or left over. Without the search the
 * running rows are the four running computers, Name descending.
 */
const RELOAD_ROWS = ['granite', 'borealis'];
const RUNNING_ROWS = ['harbor', 'granite', 'borealis', 'atlas'];

/** The State chip shows Running with its clear button and Name sorts descending (the chips and sort are in the page, not the search). */
async function expectChipAndSort(page: Page): Promise<void> {
  const chips = box(page).getByRole('group', { name: 'Filters' });
  await expect(chips.getByRole('button', { name: new RegExp(`^${strings['filter.state']}`) })).toContainText(strings['state.running'], { timeout: READY });
  await expect(chips.getByRole('button', { name: kit['table.clearFilter'].replace('{{name}}', strings['filter.state']), exact: true })).toBeVisible({ timeout: READY });
  await expect(table(page).getByRole('columnheader', { name: strings['col.name'] })).toHaveAttribute('aria-sort', 'descending', { timeout: READY });
}

test('@reload chips and sort survive a reload, the search does not', async ({ page }) => {
  test.slow(); // whole-gallery loads: the helper opens the page twice and reloads it
  // The link brings the search with State = Running and Name descending (gpage 2 is past the last page of eight rows: the
  // view shows the last). 'acme' was the old text; it stays, and is on no link. The helper proves the search is adopted
  // and gone after the reload while every kept key keeps its value.
  await expectLinkSearchDroppedOnReload(page, view(page), {
    text: 'acme',
    path: '/_kit?tab=table',
    keep: { gstate: 'running', gsort: '-name', gpage: '2' },
    searched: async () => {
      await expect.poll(() => rowIds(page), { timeout: READY }).toEqual(RELOAD_ROWS);
    },
    unsearched: async () => {
      await expect.poll(() => rowIds(page), { timeout: READY }).toEqual(RUNNING_ROWS);
    },
    before: () => expectChipAndSort(page),
    after: () => expectChipAndSort(page),
  });
});

test('@no-match nothing matches: the no-match state, and Clear filters restores every row', async ({ page }) => {
  await open(page);
  await dataRows(page).first().waitFor();
  const before = await dataRows(page).count();
  await box(page).getByRole('searchbox').fill('zzzz-no-such-thing');
  await expect(box(page).getByRole('button', { name: 'Clear filters' })).toBeVisible();
  await box(page).getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]gq=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

// The wide table's Row actions header cell has text for readers (visually hidden), so
// axe's empty-table-header rule finds nothing on a table with row actions.
test('@a11y the Row actions header has text: axe finds no empty table header', async ({ page }) => {
  await open(page);
  await dataRows(page).first().waitFor();
  await expect(table(page).getByRole('columnheader', { name: kit['table.rowActions'] })).toHaveCount(1);
  const r = await new AxeBuilder({ page }).include('[data-gallery="full-table"]').withRules(['empty-table-header']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
});
