// Playwright: in a DataTable list (two-line rows), every target of a row stays inside that row on
// a coarse pointer, where the row actions are 44 px tall on a 20 px line. A ⋯ running 1.5 px past 64 px
// rows or 7 px past rows with a third line (Scripts' Idea pill) would let a tap on the next row's top edge open this
// row's menu. Beyond the plain rows of the pages: the gallery list's inline action beside the ⋯, compact density
// with select mode on (its checkboxes are targets too), and a row grown past its minimum height. A compact
// table's row actions are xs (24 drawn, the rest of the 44 px press from the button's ::after), so a target is measured
// by where a press lands on it (elementFromPoint down its middle), not by the box it draws.
// And no press lands on a neighbour, along the middle line of the box each target draws.
// A page that draws its rows as cards at this width (/bots) is held to the same: a card is a row of its table.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/table.strings.en.json';
import kitStrings from '../strings.en.json';
import table from './DataTable.strings.en.json';

// A list row's second line, or a card's one cell (the kit's card, or one the page draws itself).
const ROW_MARK = '[class*="listLine2"], [class*="__cardCell"], [class*="customCardCell"]';
const PAGES = ['/tunnels', '/programs', '/keys', '/bots', '/schedules', '/notifications', '/scripts'];
const INLINE = [gallery['act.start'], gallery['act.resume'], gallery['act.restart']];

interface Target {
  name: string;
  kind: 'button' | 'checkbox';
  /** Distance from the row's top to the top of the target's press area, and from its bottom to the row's bottom. */
  top: number;
  bottom: number;
  /** The press area's height (a press down the target's middle lands on it), and the box it draws. */
  height: number;
  drawn: number;
  /** Where, along the middle line of the box it draws (1 px in from each edge), a press lands on another target of
   *  the row instead, or ''. */
  stolen: string;
}
interface ListRow {
  height: number;
  targets: Target[];
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** Each list row (or card row) under `root`, with its visible buttons and checkboxes (a checkbox's target is its label). Each target
 *  is scrolled to the middle of the window, then pressed down its middle line one pixel at a time (elementFromPoint):
 *  the press area is the run of points that land on the target, its ::after included. */
async function listRows(root: Locator): Promise<ListRow[]> {
  return root.evaluate((el, mark) =>
    Array.from(el.querySelectorAll(`tr:has(:is(${mark}))`)).map((tr) => {
      const all = Array.from(tr.querySelectorAll('button, label:has(input[type="checkbox"])')).filter((b) => { const x = b.getBoundingClientRect(); return x.width > 0 && x.height > 0; });
      const nameOf = (b: Element) => (b.tagName === 'LABEL' ? (b.querySelector('input')?.getAttribute('aria-label') ?? 'checkbox') : (b.getAttribute('aria-label') ?? b.textContent ?? '')).trim().slice(0, 40);
      const targets = all
        .map((b) => {
          b.scrollIntoView({ block: 'center' });
          const r = tr.getBoundingClientRect();
          const box = b.getBoundingClientRect();
          const cx = box.left + box.width / 2;
          const cy = box.top + box.height / 2;
          const on = (y: number) => { const e = document.elementFromPoint(cx, y); return !!e && (e === b || b.contains(e)); };
          let up = 0;
          while (up < 40 && on(cy - up - 1)) up++;
          let down = 0;
          while (down < 40 && on(cy + down + 1)) down++;
          let stolen = '';
          for (let px = box.left + 1; px <= box.right - 1 && !stolen; px += 0.25) {
            const e = document.elementFromPoint(px, cy);
            const owner = e ? all.find((o) => o === e || o.contains(e)) : undefined;
            if (owner && owner !== b) stolen = `+${(px - box.left).toFixed(2)} presses ${nameOf(owner)}`;
          }
          const top = Math.min(box.top, cy - up - 0.5);
          const bottom = Math.max(box.bottom, cy + down + 0.5);
          return {
            name: nameOf(b),
            kind: (b.tagName === 'LABEL' ? 'checkbox' : 'button') as 'button' | 'checkbox',
            top: top - r.top,
            bottom: r.bottom - bottom,
            height: bottom - top,
            drawn: box.height,
            stolen,
          };
        });
      return { height: tr.getBoundingClientRect().height, targets };
    }),
    ROW_MARK,
  );
}

/** The targets that run past their row's top or bottom edge. */
const outside = (rows: ListRow[]) =>
  rows.flatMap((r, i) => r.targets.filter((b) => b.top < -0.5 || b.bottom < -0.5).map((b) => `row ${i} (${r.height}px): ${b.name} top ${b.top.toFixed(1)} bottom ${b.bottom.toFixed(1)}`));

/** The targets part of whose drawn box a press would give to a neighbour in the same row. */
const stolen = (rows: ListRow[]) => rows.flatMap((r, i) => r.targets.filter((b) => b.stolen).map((b) => `row ${i}: ${b.name} ${b.stolen}`));

/** Not vacuous: the rows carry the 44 px row actions this guards. */
function expectRowActions(rows: ListRow[]) {
  const actions = rows.flatMap((r) => r.targets.filter((b) => b.name === kitStrings['table.rowActions']));
  expect(actions.length, 'list rows with a Row actions button').toBeGreaterThan(0);
  for (const a of actions) expect(a.height).toBeGreaterThanOrEqual(44);
}

for (const path of PAGES) {
  test(`${path} at 390 on touch: every row button ends inside its list row`, async ({ page }) => {
    await gotoHub(page, path);
    await page.locator(ROW_MARK).first().waitFor();
    const rows = await listRows(page.locator('body'));
    expectRowActions(rows);
    expect(outside(rows)).toEqual([]);
  expect(stolen(rows), 'a press that lands on a neighbour').toEqual([]);
    expect(stolen(rows), 'a press that lands on a neighbour').toEqual([]);
  });
}

/** The gallery's phone list (/_kit?tab=table): selectable, with View options, and inline Start/Resume/Restart. */
async function galleryList(page: Page): Promise<Locator> {
  await gotoHub(page, '/_kit?tab=table');
  const list = page.locator('[data-density]').filter({ has: page.getByRole('button', { name: kitStrings['table.view'] }) }).first(); // reason: the tab's first table with View options is the phone list (the pane beside it has none)
  await list.locator('[class*="listLine2"]').first().waitFor();
  return list;
}

test('gallery list at 390 on touch: an inline action and the ⋯ beside it both end inside their row', async ({ page }) => {
  const list = await galleryList(page);
  const rows = await listRows(list);
  expectRowActions(rows);
  // Not vacuous: some rows carry an inline action (44 px, words) on line 2 beside the ⋯.
  const inline = rows.flatMap((r) => r.targets.filter((b) => INLINE.includes(b.name)));
  expect(inline.length, 'rows with an inline action').toBeGreaterThan(0);
  for (const a of inline) expect(a.height).toBeGreaterThanOrEqual(44);
  expect(outside(rows)).toEqual([]);
  expect(stolen(rows), 'a press that lands on a neighbour').toEqual([]);
});

test('gallery list at 390 on touch, compact density with select mode on: buttons and checkboxes end inside their row', async ({ page }) => {
  const list = await galleryList(page);
  const view = list.getByRole('button', { name: kitStrings['table.view'] });
  await view.click();
  await page.getByRole('menuitemradio', { name: kitStrings['table.densityCompact'] }).or(page.getByRole('menuitem', { name: kitStrings['table.densityCompact'] })).click();
  await view.click();
  await page.getByRole('menuitem', { name: table['select.start'] }).click();
  await expect(list).toHaveAttribute('data-density', 'compact');
  await list.locator('[class*="listCheck"]').first().waitFor();
  const rows = await listRows(list);
  expectRowActions(rows);
  // A compact table asks for xs, so its ⋯ draws 24 (its press, above, is still 44).
  const more = rows.flatMap((r) => r.targets.filter((b) => b.name === kitStrings['table.rowActions']));
  expect(more.map((a) => Math.round(a.drawn)).filter((h) => h !== 24), 'a compact ⋯ that is not drawn 24').toEqual([]);
  // Not vacuous: select mode draws a checkbox in every row.
  expect(rows.every((r) => r.targets.some((b) => b.kind === 'checkbox')), JSON.stringify(rows.map((r) => r.targets.map((b) => b.name)))).toBe(true);
  expect(outside(rows)).toEqual([]);
  expect(stolen(rows), 'a press that lands on a neighbour').toEqual([]);
});

test('gallery list at 390 on touch: a row grown past its minimum height keeps its line 2 actions inside', async ({ page }) => {
  const list = await galleryList(page);
  const before = await listRows(list);
  // Line 1 has a 20 px minimum, not a fixed height: a taller line 1 piece grows the row, and then no minimum-height
  // slack is left below line 2 (so taller fixed rows would not do). A 64 px line 1 on the first row with an inline
  // action stands for that piece.
  const index = before.findIndex((r) => r.targets.some((b) => INLINE.includes(b.name)));
  expect(index, 'a row with an inline action').toBeGreaterThanOrEqual(0);
  await list.evaluate((el, i) => {
    const line1 = el.querySelectorAll('tr:has([class*="listLine2"])')[i]?.querySelector<HTMLElement>('[class*="listLine1"]');
    if (line1) line1.style.minHeight = '64px';
  }, index);
  const rows = await listRows(list);
  expect(rows[index]!.height, 'the row grew').toBeGreaterThan(before[index]!.height);
  expect(rows[index]!.targets.filter((b) => b.height >= 44).length, 'its inline action and ⋯').toBeGreaterThanOrEqual(2);
  expect(outside([rows[index]!])).toEqual([]);
});
