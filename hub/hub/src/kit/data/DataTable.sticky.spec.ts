// Playwright: the kit gallery's sticky-groups specimen (/_kit?tab=table). 300 virtual rows in four groups:
// scrolled far into a group, its head row stays drawn right under the column header with its own rows passing under
// it; further down, the next group's head takes its place. The same table without the prop is the table gallery's
// other grouped specimens, unchanged.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from '../gallery/table.strings.en.json';

test.use({ viewport: { width: 1440, height: 900 } });

/** The head row nearest the column header's bottom: its label, whether it sits right under the header, and whether a
 *  row of its own group is scrolled under it (only a stuck head has its own rows above it on screen). */
const stuck = (table: HTMLTableElement) => {
  // The header cells stick, not the thead (which scrolls away with the table): measure a cell.
  const below = table.tHead!.rows[0]!.cells[0]!.getBoundingClientRect().bottom;
  const trs = [...table.tBodies[0]!.rows].filter((tr) => tr.getAttribute('aria-hidden') !== 'true');
  const heads = trs.filter((tr) => tr.querySelector('[aria-expanded]'));
  const top = (tr: HTMLTableRowElement) => tr.cells[0]!.getBoundingClientRect().top;
  const head = heads.reduce((a, b) => (Math.abs(top(b) - below) < Math.abs(top(a) - below) ? b : a));
  const own = trs.slice(trs.indexOf(head) + 1);
  const next = own.findIndex((tr) => heads.includes(tr));
  const rows = next < 0 ? own : own.slice(0, next);
  return { label: head.textContent ?? '', underHeader: Math.abs(top(head) - below) <= 2, rowsScrolledUnder: rows.some((tr) => top(tr) < top(head) - 4) };
};

test('the group in sight keeps its head under the column header, virtual rows and all; the next group takes over', async ({ page }) => {
  await gotoHub(page, '/_kit?tab=table');
  const table = page.locator('[data-specimen="sticky-groups"]').getByRole('table', { name: strings['sec.sticky'] });
  await table.scrollIntoViewIfNeeded();
  await expect(table.locator('tbody tr').nth(1)).toBeVisible(); // reason: a body row is drawn
  const scroller = table.locator('xpath=..');
  const scrollTo = async (y: number) => {
    await scroller.evaluate((el, to) => { el.scrollTop = to; }, y);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(y - 50);
  };
  // 40 rows into Files (75 rows of it): the row of item 0 is long gone, Files' head is still there.
  const rowH = await table.locator('tbody tr[data-row-id]').first().evaluate((el) => el.getBoundingClientRect().height); // reason: one row's height
  await scrollTo(Math.round(rowH * 40));
  await expect.poll(() => table.evaluate(stuck)).toMatchObject({ label: expect.stringContaining(strings['group.files']), underHeader: true, rowsScrolledUnder: true });
  await expect(table.locator('tr[data-row-id="e0"]')).toHaveCount(0);
  // Well into Terminal (rows 150-224): its head has taken the place.
  await scrollTo(Math.round(rowH * 190));
  await expect.poll(() => table.evaluate(stuck)).toMatchObject({ label: expect.stringContaining(strings['group.terminal']), underHeader: true, rowsScrolledUnder: true });
});

test('keyboard row navigation with the head stuck: End, Home, pages and the group boundary land on the right rows', async ({ page }) => {
  // 75 presses below, each waited for: a busy machine needs more than the default time for them.
  test.slow();
  await gotoHub(page, '/_kit?tab=table');
  const table = page.locator('[data-specimen="sticky-groups"]').getByRole('table', { name: strings['sec.sticky'] });
  await table.scrollIntoViewIfNeeded();
  const focused = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.rowId ?? 'none');
  await table.locator('tr[data-row-id="e0"]').focus();
  await page.keyboard.press('End');
  await expect.poll(focused).toBe('e299');
  await page.keyboard.press('Home');
  await expect.poll(focused).toBe('e0');
  await page.keyboard.press('PageDown');
  // Focus lands on the new row a moment after the press: wait until it is past the first rows.
  await expect.poll(async () => Number((await focused()).slice(1))).toBeGreaterThan(1);
  await page.keyboard.press('PageUp');
  await expect.poll(focused).toBe('e0');
  // Files ends at e74, Notes starts at e75: arrows cross the boundary (its head is a button, not a row) both ways.
  // One press at a time, each waited for: a press sent before focus has landed on a newly drawn row would go to the old one.
  for (let i = 1; i <= 74; i++) {
    await page.keyboard.press('ArrowDown');
    await expect.poll(focused).toBe(`e${i}`);
  }
  await page.keyboard.press('ArrowDown');
  await expect.poll(focused).toBe('e75');
  await page.keyboard.press('ArrowUp');
  await expect.poll(focused).toBe('e74');
  // The focused row is never under the stuck head: it is scrolled wholly below it.
  const [headBottom, rowTop] = await Promise.all([
    table.locator('tr').filter({ has: page.locator('[aria-expanded]') }).filter({ hasText: strings['group.files'] }).first().evaluate((el) => el.getBoundingClientRect().bottom), // reason: Files' head, the one stuck
    table.locator('tr[data-row-id="e74"]').evaluate((el) => el.getBoundingClientRect().top),
  ]);
  expect(rowTop).toBeGreaterThanOrEqual(headBottom - 1);
});

