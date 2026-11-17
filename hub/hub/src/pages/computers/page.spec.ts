// Playwright: the computers page's flows on fixtures (run by hub:check --page computers).
import { expect, test, type Page } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub } from '@app/e2e';
import { pickFilter } from '@app/e2e-toolbar';
import kitStrings from '@kit/strings.en.json';
import strings from './strings.en.json';

test('select a computer, then Back returns to the list', async ({ page }) => {
  await gotoHub(page, '/computers');
  await page.getByRole('table').getByText('borealis').click();
  await expect(page).toHaveURL(/sel=borealis\./);
  await expect(page.getByRole('tab', { name: strings['tab.connect'] })).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/sel=/);
});

test('the Get a computer drawer opens and closes', async ({ page }) => {
  await gotoHub(page, '/computers');
  await page.getByRole('button', { name: strings['action.get'] }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('the Servers view lists servers', async ({ page }) => {
  await gotoHub(page, '/computers/servers');
  await expect(page.getByText('fra-7').first()).toBeVisible(); // reason: several computers sit on fra-7
});

const main = (page: Page) => page.locator('#hub-main');
const rows = (page: Page) => page.getByRole('table').getByRole('row');

const dataRows = (page: Page) => page.getByRole('table').locator('tbody tr[data-row-id]');

test('@search @reload search narrows the table, never reaches the URL and a reload clears it', async ({ page }) => {
  test.slow(); // two helper proofs: the app boots four times (each open and each reload) and each proof waits out a settle window
  await gotoHub(page, '/computers');
  const table = page.getByRole('table');
  await expect(table.getByText('cedar')).toBeVisible();
  // The search stays out of the URL, proved by the shared helper (the URL, history state and every link, sampled through a settle window).
  await expectSearchStaysOutOfUrl(page, { param: '', box: main(page).getByRole('searchbox') }, {
    text: 'cedar',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      await expect(table.getByText('cedar')).toBeVisible();
      await expect(table.getByText('borealis')).toBeHidden();
    },
  });
  // The typed search itself is gone after a reload (the link proof below starts from a fresh document, so it cannot
  // see a typed search that survives one).
  await page.reload();
  await page.locator('#hub-main').waitFor(); // the reload boots the whole app again: wait for the shell, as the base does after its second reload
  await expect(main(page).getByRole('searchbox')).toHaveValue('');
  await expect(page.getByRole('table').getByText('borealis')).toBeVisible();
  // state, sort and page ride the URL: open a link with all of them and the search, reload, and each survives (the
  // search does not). 'granite' is a running computer (cedar is stopped).
  await expectLinkSearchDroppedOnReload(page, { param: '', box: main(page).getByRole('searchbox') }, {
    text: 'granite',
    path: '/computers',
    keep: { state: 'running', sort: 'name', page: '1' },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      await expect(page.getByRole('table').getByText('granite')).toBeVisible();
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(4); // atlas, borealis, granite and harbor run
      await expect(page.getByRole('table').getByText('borealis')).toBeVisible();
    },
  });
});

test('@page the pager moves to page 2, keeps ?page and shows other rows', async ({ page }) => {
  await gotoHub(page, '/computers', { state: 'long' });
  // Cards is the default view: each computer is an article headed by its name.
  const body = main(page).getByRole('article').getByRole('heading', { level: 3 });
  await expect(body.first()).toBeVisible(); // reason: first card of the page, by position
  const first = await body.first().innerText(); // reason: first card
  await page.getByRole('navigation', { name: /pages/i }).getByRole('button', { name: /next/i }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(body.first()).not.toHaveText(first); // reason: first card
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('@no-match a no-match search offers Clear filters, which restores the rows', async ({ page }) => {
  await gotoHub(page, '/computers');
  await main(page).getByRole('searchbox').fill('zzzz-none');
  await expect(main(page).getByRole('button', { name: /clear filters/i })).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await main(page).getByRole('button', { name: /clear filters/i }).click();
  await expect(page.getByRole('table').getByText('borealis')).toBeVisible();
});

test('@filter a State chip filters the rows', async ({ page }) => {
  await gotoHub(page, '/computers');
  await pickFilter(main(page), strings['filter.state'], strings['filter.state.stopped']);
  await expect(page).toHaveURL(/[?&]state=stopped/);
  await expect(page.getByRole('table').getByText('cedar')).toBeVisible();
  await expect(page.getByRole('table').getByText('borealis')).toBeHidden();
});

test('@sort sorting by Name reorders the rows', async ({ page }) => {
  await gotoHub(page, '/computers');
  // This test is about the wide table: List (the table at this width), since Cards is the default.
  await page.getByRole('radio', { name: kitStrings['table.present.list'] }).click();
  const first = async () => (await page.getByRole('table').locator('tbody strong').first().innerText()); // reason: first data row
  const before = await first();
  await page.getByRole('columnheader', { name: strings['col.name'] }).getByRole('button').click();
  await page.getByRole('columnheader', { name: strings['col.name'] }).getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-?name/);
  expect(await first()).not.toBe(before);
});

test('a stopped row starts inline and shows its outcome', async ({ page }) => {
  await gotoHub(page, '/computers', { state: 'pendingOps' });
  const cedar = rows(page).filter({ hasText: 'cedar' });
  await cedar.getByRole('button', { name: strings['menu.start'] }).click();
  // the answer is unknown: the row says so and the Start button is gone (never a second send)
  await expect(cedar.getByText(strings['op.pill.pending'], { exact: true })).toBeVisible();
  await expect(cedar.getByRole('button', { name: strings['menu.start'] })).toHaveCount(0);
});

test('the row menu opens from the keyboard and from the button', async ({ page }) => {
  await gotoHub(page, '/computers');
  await rows(page).filter({ hasText: 'borealis' }).getByRole('button', { name: /actions|row/i }).first().click(); // reason: the row has the hover icons' menu and the dots button; either opens the menu
  await expect(page.getByRole('menuitem', { name: strings['menu.makeCurrent'] })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: strings['menu.makeCurrent'] })).toBeHidden();
});

test('j/k then Enter opens the detail and Escape closes it', async ({ page }) => {
  await gotoHub(page, '/computers');
  await rows(page).nth(1).focus(); // reason: second table row (row 0 is the header)
  await page.keyboard.press('j');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/sel=/);
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/sel=/);
});

test('checking two rows shows the bulk bar', async ({ page }) => {
  await gotoHub(page, '/computers');
  // This test is about the wide table: List (the table at this width), since Cards is the default.
  await page.getByRole('radio', { name: kitStrings['table.present.list'] }).click();
  await rows(page).nth(1).getByRole('checkbox').click({ force: true }); // reason: second table row (row 0 is the header)
  await rows(page).nth(2).getByRole('checkbox').click({ force: true }); // reason: third table row
    await expect(page.getByText(/2 selected/)).toBeVisible();
});
