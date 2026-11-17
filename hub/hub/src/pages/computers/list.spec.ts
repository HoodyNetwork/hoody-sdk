// Playwright: the functional e2e of the computers list (FUNCTIONAL RULE): search, chips, sort and
// paging through the kit data view; the URL holds that state across reload and back/forward; the
// nothing-yet and no-match states; and the keyboard-only way to a computer and its row menu.
// Fixtures only (gotoHub boots the fixture transport): nothing reaches a real API.
import { type Page, expect, test } from '@playwright/test';
import { expectSearchStaysOutOfUrl, gotoHub } from '@app/e2e';
import { pickFilter } from '@app/e2e-toolbar';
import kitStrings from '@kit/strings.en.json';
import strings from './strings.en.json';

const main = (page: Page) => page.locator('#hub-main');
const table = (page: Page) => main(page).getByRole('table', { name: strings.title });
const dataRows = (page: Page) => table(page).locator('tbody tr[data-row-id]');
/** The computer names in row order (the bold name leads each row). */
const rowNames = async (page: Page): Promise<string[]> => Promise.all((await dataRows(page).all()).map((r) => r.locator('h3, strong').first().innerText())); // reason: a card's name is its h3, a row's the first bold text
const byName = new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare;

async function pickChip(page: Page, chip: string, option: string) {
  await pickFilter(main(page), chip, option);
}

test('@search the search box narrows the rows to matching computers and never writes ?q', async ({ page }) => {
  await gotoHub(page, '/computers');
  await expect(dataRows(page).first()).toBeVisible();
  // The search stays out of the URL, proved by the shared helper (the URL, history state and every link, sampled through a settle window).
  await expectSearchStaysOutOfUrl(page, { param: '', box: main(page).getByRole('searchbox') }, {
    text: 'frankfurt',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(2); // borealis and ember, on the Frankfurt server
      for (const row of await dataRows(page).all()) await expect(row).toContainText('Frankfurt');
    },
  });
});

test('@filter the State chip keeps only that state, shows its count and keeps ?state', async ({ page }) => {
  await gotoHub(page, '/computers');
  await expect(dataRows(page).first()).toBeVisible();
  const before = await dataRows(page).count();
  await pickChip(page, strings['filter.state'], strings['filter.state.running']);
  await expect(page).toHaveURL(/[?&]state=running/);
  await expect.poll(() => dataRows(page).count()).toBeLessThan(before);
  const n = await dataRows(page).count();
  expect(n).toBeGreaterThan(0);
  for (const row of await dataRows(page).all()) await expect(row).toContainText(strings['state.running']);
  await expect(main(page).getByText(`${n} computers`)).toBeVisible();
});

test('@sort the Name header sorts the rows both ways and keeps ?sort', async ({ page }) => {
  await gotoHub(page, '/computers');
  // This test is about the wide table: List (the table at this width), since Cards is the default.
  await page.getByRole('radio', { name: kitStrings['table.present.list'] }).click();
  await expect(dataRows(page).first()).toBeVisible();
  const header = table(page).getByRole('columnheader', { name: strings['col.name'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-?name/);
  await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
  const first = await rowNames(page);
  const dir = (await header.getAttribute('aria-sort')) ?? '';
  expect(first).toEqual(dir === 'ascending' ? [...first].sort(byName) : [...first].sort(byName).reverse());
  await header.getByRole('button').click();
  await expect(header).not.toHaveAttribute('aria-sort', dir);
  await expect.poll(() => rowNames(page)).toEqual([...first].reverse());
});

test('@page the pager shows the rest of a long list on page 2 and keeps ?page', async ({ page }) => {
  await gotoHub(page, '/computers', { state: 'long' });
  await expect(dataRows(page).first()).toBeVisible();
  const one = await rowNames(page);
  await main(page).getByRole('navigation', { name: /pages/i }).getByRole('button', { name: /next/i }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect.poll(async () => (await rowNames(page)).some((x) => one.includes(x))).toBe(false);
  expect((await rowNames(page)).length).toBeGreaterThan(0);
});

// Sort and page each survive a reload in their own test. A reload of the 60-row 'long' world is slow under load, so
// both get test.slow() (3x the budget): the time is the reload, not a wait for the wrong thing.
test('@reload a sort survives a reload', async ({ page }) => {
  test.slow();
  await gotoHub(page, '/computers', { state: 'long' });
  // This test is about the wide table: List (the table at this width), since Cards is the default.
  await page.getByRole('radio', { name: kitStrings['table.present.list'] }).click();
  await expect(dataRows(page).first()).toBeVisible();
  await table(page).getByRole('columnheader', { name: strings['col.name'] }).getByRole('button').click();
  // The first click sorts ascending: exactly sort=name (the second test starts from it).
  await expect(page).toHaveURL(/[?&]sort=name(&|$)/);
  // The rows are in name order (the 'long' fixture's default order is not), so the sort is applied, not only written.
  // Each poll reads 20 rows' names; under load one pass took most of the 7 s expect timeout.
  await expect.poll(async () => { const n = await rowNames(page); return n.length > 0 && n.join() === [...n].sort(byName).join(); }, { timeout: 30_000 }).toBe(true);
  const sorted = await rowNames(page);

  await page.reload();
  await main(page).waitFor();
  // Under load the reloaded 'long' world's rows took over the 7 s expect timeout to show.
  await expect(dataRows(page).first()).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/[?&]sort=name(&|$)/);
  await expect.poll(() => rowNames(page), { timeout: 30_000 }).toEqual(sorted);
});

test('@reload a page survives a reload, and Back/Forward walk the pages with the sort kept', async ({ page }) => {
  test.slow();
  // Starts sorted from the URL (the test above proves the click writes it). Each row-name poll reads 20 rows; under
  // load one pass took most of the 7 s expect timeout, so they get 30 s like the reload.
  await gotoHub(page, '/computers?sort=name', { state: 'long' });
  // This test is about the wide table: List (the table at this width), since Cards is the default.
  await page.getByRole('radio', { name: kitStrings['table.present.list'] }).click();
  await expect(dataRows(page).first()).toBeVisible();
  const onePage = await rowNames(page);
  // The seeded sort is applied: page 1 is in name order (the 'long' fixture's default order is not).
  expect(onePage).toEqual([...onePage].sort(byName));
  await main(page).getByRole('navigation', { name: /pages/i }).getByRole('button', { name: /next/i }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect.poll(async () => (await rowNames(page)).some((x) => onePage.includes(x)), { timeout: 30_000 }).toBe(false);
  const twoPage = await rowNames(page);
  expect(twoPage).toEqual([...twoPage].sort(byName));

  await page.reload();
  await main(page).waitFor();
  // Under load the reloaded 'long' world's rows took over the 7 s expect timeout to show.
  await expect(dataRows(page).first()).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/[?&]sort=name(&|$)/);
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect.poll(() => rowNames(page), { timeout: 30_000 }).toEqual(twoPage);

  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
  await expect(page).toHaveURL(/[?&]sort=name(&|$)/);
  await expect.poll(() => rowNames(page), { timeout: 30_000 }).toEqual(onePage);

  await page.goForward();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect.poll(() => rowNames(page), { timeout: 30_000 }).toEqual(twoPage);
});

test('a chip survives a reload (the search does not), and Back from an opened computer keeps the search and the chip', async ({ page }) => {
  await gotoHub(page, '/computers');
  await expect(dataRows(page).first()).toBeVisible();
  await main(page).getByRole('searchbox').fill('e');
  await pickChip(page, strings['filter.state'], strings['filter.state.stopped']);
  await expect(page).toHaveURL(/[?&]state=stopped/);
  await expect(page).not.toHaveURL(/[?&]q=/);
  const filtered = await rowNames(page);
  expect(filtered.length).toBeGreaterThan(0);

  // The chip is in the URL and comes back; the search text lives in memory only, so the box is empty after a reload.
  await page.reload();
  await main(page).waitFor();
  await expect(page).toHaveURL(/[?&]state=stopped/);
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect(main(page).getByRole('searchbox')).toHaveValue('');
  await expect(dataRows(page).first()).toBeVisible(); // the reloaded list has drawn before the search is typed again
  await main(page).getByRole('searchbox').fill('e');
  await expect.poll(() => rowNames(page)).toEqual(filtered);

  await dataRows(page).first().getByText(filtered[0] as string, { exact: true }).click();
  await expect(page).toHaveURL(/[?&]sel=/);
  await expect(main(page).getByRole('tab', { name: strings['tab.connect'] })).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]sel=/);
  // The opened computer replaced the list; Back brings it back with the chip (URL) and the search (the list's own
  // history entry holds it, never the address).
  await expect(main(page).getByRole('searchbox')).toHaveValue('e');
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect(page).toHaveURL(/[?&]state=stopped/);
  await expect.poll(() => rowNames(page)).toEqual(filtered);
  await page.goForward();
  await expect(page).toHaveURL(/[?&]sel=/);
});

// The page names its own no-match state ("No computers match") instead of the kit's generic title; the first-use
// invite (no computer at all) never shows for a search that only filtered every row out.
test('@no-match a search with no result keeps the toolbar, says so, and Clear filters brings the rows back', async ({ page }) => {
  await gotoHub(page, '/computers');
  await expect(dataRows(page).first()).toBeVisible();
  const before = await dataRows(page).count();
  await main(page).getByRole('searchbox').fill('zzzz-no-such-computer');
  await expect(main(page).getByRole('heading', { name: strings['empty.title'], exact: true })).toBeVisible();
  await expect(main(page).getByText(kitStrings['table.noMatch'])).toHaveCount(0);
  await expect(dataRows(page)).toHaveCount(0);
  await expect(main(page).getByRole('searchbox')).toBeVisible();
  await expect(main(page).getByText(strings['zero.invite.title'])).toHaveCount(0);
  await main(page).getByRole('button', { name: kitStrings['table.clearFilters'] }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

test('with no computer yet the page shows the first-use state with no toolbar and no table', async ({ page }) => {
  await gotoHub(page, '/computers', { state: 'empty' });
  await expect(main(page).getByText(strings['zero.invite.title'])).toBeVisible();
  await expect(main(page).getByRole('searchbox')).toHaveCount(0);
  await expect(main(page).getByRole('table')).toHaveCount(0);
  await expect(main(page).getByText(kitStrings['table.noMatch'])).toHaveCount(0);
});

test('keyboard only: Tab into the list, j then Enter opens a computer, Escape returns to its row', async ({ page }) => {
  await gotoHub(page, '/computers');
  await expect(dataRows(page).first()).toBeVisible();
  await main(page).getByRole('searchbox').focus();
  await tabToRow(page);
  const start = await focusedRowId(page);
  await page.keyboard.press('j');
  const next = await focusedRowId(page);
  expect(next).not.toBe(start);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`[?&]sel=${escapeRe(encodeURIComponent(next))}(&|$)`));
  await expect(main(page).getByRole('tab', { name: strings['tab.connect'] })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/[?&]sel=/);
  await expect(dataRows(page).and(page.locator(`[data-row-id="${next}"]`))).toBeFocused();
});

test('keyboard only: the period key opens the focused row menu and Escape closes it', async ({ page }) => {
  await gotoHub(page, '/computers');
  await expect(dataRows(page).first()).toBeVisible();
  await main(page).getByRole('searchbox').focus();
  await tabToRow(page);
  await page.keyboard.press('j');
  const row = await focusedRowId(page);
  await page.keyboard.press('.');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: strings['menu.makeCurrent'] })).toBeVisible();
  // The keyboard is in the menu: the arrows walk its items.
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="menu"]'))).toBe(true);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('role'))).toMatch(/^menuitem/);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]sel=/);
  // Focus goes back into the row the menu came from, so the next key acts there.
  await expect.poll(() => page.evaluate((id) => !!document.activeElement?.closest(`[data-row-id="${id}"]`), row)).toBe(true);
});

/** Presses Tab until a table row holds the focus (the row strip is one tab stop). */
async function tabToRow(page: Page) {
  for (let i = 0; i < 30; i++) {
    if (await page.evaluate(() => document.activeElement?.matches('tbody tr[data-row-id]') ?? false)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Tab never reached a table row');
}

async function focusedRowId(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.getAttribute('data-row-id') ?? '');
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
