// The axe target-size check on "apps (/apps)" in all pages: in the Apps tab's "Open on
// this computer" table each row's own action (RowPrimary: Open display, Open terminal, Check again…) sits whole inside its
// Action cell, so it never runs under the row's ⋯ (Row actions), and every row keeps the kit's 32 px ⋯. The Action column
// is as wide as the widest action any row can show, so this holds at every width the table draws, down to where a
// column drops or the table becomes a list, not only at the three widths axe checks. The list (a phone) keeps
// the action on each row's line 2. The sweep checks the list rows too, and each step waits until
// the kit's plan for the new width is drawn (data-plan-width), and every row shows its fixture action (
// a stale plan from the previous width).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const MENU = 'Row actions';

async function openTable(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await gotoHub(page, '/apps');
  const table = page.getByRole('table', { name: strings['tab.open'] });
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-skeleton]')).toHaveCount(0, { timeout: 20_000 });
  // The fixture's widest drawn action is Firefox's "Open display" (a link with its external icon).
  await expect(table.getByRole('link', { name: new RegExp(strings['act.screen']) })).toBeVisible();
  return table;
}

/** Each fixture row's own action, from the fixture itself (pages/apps/fixtures.ts 'many', the dev server's default) and
 *  the page's own rules (launchOf picks the action, RowPrimary draws nothing for 'wait' or a link without its address):
 *  its words, or '' for a row with no action. Read in the page through the dev server's modules, never from what is drawn,
 *  so a row that lost its action in every layout still fails. */
async function fixtureActions(page: Page): Promise<Record<string, string>> {
  // A module script on the dev server (as launchcard.spec seeds its store): it reads the fixture and the page's rules and
  // leaves each row's action key (or '') on window.
  await page.addScriptTag({
    type: 'module',
    content: `
import fx from '/src/pages/apps/fixtures.ts';
import { launchOf, ACTION_KEY } from '/src/pages/apps/parts/words.ts';
import { LINK_ACTIONS, hrefFor } from '/src/pages/apps/launch/RowPrimary.tsx';
const rows = fx.states.many.opened.data;
const out = {};
for (const r of rows) {
  const act = launchOf(r, rows).primary;
  out[r.key] = act && act !== 'wait' && (!LINK_ACTIONS.has(act) || hrefFor(r, act)) ? ACTION_KEY[act] : '';
}
window.__oaFixtureActions = out;
`,
  });
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __oaFixtureActions?: unknown }).__oaFixtureActions)).toBe(true);
  const keys = await page.evaluate(() => (window as unknown as { __oaFixtureActions: Record<string, string> }).__oaFixtureActions);
  return Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v ? (strings[v as keyof typeof strings] ?? `?${v}`) : '']));
}

/** What is wrong with the Open table as drawn now: a table without its Action column; per row, its ⋯ missing or under
 * 32 px, its Action cell missing, or its own action (the control in that cell) past the cell or over the ⋯. A list row
 * (a phone) has no cells to check: its ⋯ must still be 32 px, and its own action inside the row and clear of the ⋯.
 * The row's action is its [data-row-primary] control (RowPrimary's marker), and it must be visible. With `want`
 * (fixtureActions), each row must show exactly that action, so a layout that drops a row's action fails rather than
 * skipping the row. `table` is whether it
 * draws as a table (two or more column headers) or a list; `rows` counts the rows checked, either way; `sig` is the
 * layout drawn (headers and the first row's cell edges), to tell when a resize has settled. */
function problems(page: Page, want?: Record<string, string>) {
  return page.evaluate(
    ({ name, header, menu, want }) => {
      const table = document.querySelector(`[aria-label="${name}"]`);
      if (!table) return { table: false, rows: 0, out: ['no Open table'], sig: '' };
      const heads = Array.from(table.querySelectorAll('th, [role="columnheader"]'));
      const first = table.querySelector('[data-row-id]');
      const sig = `${heads.map((h) => (h.textContent ?? '').trim()).join('|')} ${Array.from(first?.children ?? []).map((c) => Math.round(c.getBoundingClientRect().right)).join(',')}`;
      const words = (c: Element | undefined) => (c?.textContent ?? '').trim();
      /** Drawn and seen: a box, not visibility:hidden, not opacity 0 (itself or an ancestor). */
      const seen = (c: Element) => (c as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true }) && c.getBoundingClientRect().width > 0;
      /** The row's action against what it should be: a problem, or null. */
      const wrong = (id: string, act: Element | undefined) => {
        if (!want) return null;
        const label = want[id];
        if (label === undefined) return `${id}: a row the fixture does not have`;
        if (label === '' && act) return `${id}: an action "${words(act)}" where the fixture has none`;
        if (label !== '' && !act) return `${id}: no "${label}" action`;
        return null;
      };
      // The list presentation draws one header cell (kit DataTable colCount 1); a table has Name and the ⋯ column at least.
      if (heads.length <= 1) {
        const out: string[] = [];
        let rows = 0;
        for (const row of Array.from(table.querySelectorAll('[data-row-id]'))) {
          rows++;
          const id = row.getAttribute('data-row-id') ?? '';
          const r = row.getBoundingClientRect();
          const m = row.querySelector(`button[aria-label="${menu}"]`)?.getBoundingClientRect();
          if (!m) out.push(`${id}: no row menu`);
          else if (m.width < 31.5 || m.height < 31.5) out.push(`${id}: row menu ${m.width}x${m.height}`);
          const el = row.querySelector('[data-row-primary]') ?? undefined;
          const w = wrong(id, el);
          if (w) out.push(w);
          else if (want && el && words(el) !== want[id]) out.push(`${id}: action "${words(el)}", the fixture's is "${want[id]}"`);
          if (el && !seen(el)) out.push(`${id}: action "${words(el)}" not visible`);
          if (!el || !m) continue;
          const act = el.getBoundingClientRect();
          if (act.left < r.left - 0.5 || act.right > r.right + 0.5 || act.top < r.top - 0.5 || act.bottom > r.bottom + 0.5) out.push(`${id}: action outside its row`);
          if (act.right > m.left + 0.5 && act.left < m.right - 0.5 && act.bottom > m.top + 0.5 && act.top < m.bottom - 0.5) out.push(`${id}: action over the row menu`);
        }
        return { table: false, rows, out, sig };
      }
      const at = heads.findIndex((h) => (h.textContent ?? '').trim().toLowerCase() === header.toLowerCase());
      const out: string[] = at < 0 ? [`a table of ${heads.length} columns without its Action column`] : [];
      let rows = 0;
      for (const row of Array.from(table.querySelectorAll('[data-row-id]'))) {
        const cells = Array.from(row.querySelectorAll(':scope > td, :scope > [role="cell"], :scope > [role="gridcell"]'));
        if (cells.length === 0) continue;
        rows++;
        const id = row.getAttribute('data-row-id') ?? '';
        const m = row.querySelector(`button[aria-label="${menu}"]`)?.getBoundingClientRect();
        if (!m) {
          out.push(`${id}: no row menu`);
          continue;
        }
        if (m.width < 31.5 || m.height < 31.5) out.push(`${id}: row menu ${m.width}x${m.height}`);
        if (at < 0) continue;
        if (!cells[at]) {
          out.push(`${id}: no Action cell`);
          continue;
        }
        const el = cells[at].querySelector('[data-row-primary]') ?? undefined;
        const w = wrong(id, el);
        if (w) out.push(w);
        else if (want && el && words(el) !== want[id]) out.push(`${id}: action "${words(el)}", the fixture's is "${want[id]}"`);
        if (el && !seen(el)) out.push(`${id}: action "${words(el)}" not visible`);
        if (!el) continue; // a row whose action waits shows none
        const cell = cells[at].getBoundingClientRect();
        const act = el.getBoundingClientRect();
        if (act.right > cell.right + 0.5) out.push(`${id}: action ends ${(act.right - cell.right).toFixed(1)} px past its cell`);
        if (act.right > m.left) out.push(`${id}: action runs ${(act.right - m.left).toFixed(1)} px under the row menu`);
      }
      return { table: true, rows, out, sig };
    },
    { name: strings['tab.open'], header: strings['col.action'], menu: MENU, want },
  );
}

for (const width of [1440, 1350, 1100]) {
  test(`the Open table at ${width}: every row's action fits its cell and clears its 32 px row menu (axe target-size)`, async ({ page }) => {
    await openTable(page, width);
    const p = await problems(page);
    expect(p.rows, 'table rows checked').toBeGreaterThan(3);
    expect(p.out).toEqual([]);
    const found = await new AxeBuilder({ page }).include(`[aria-label="${strings['tab.open']}"]`).withRules(['target-size']).analyze();
    expect(found.violations.flatMap((v) => v.nodes.map((n) => n.html.slice(0, 120)))).toEqual([]);
  });
}

/** The Open table once a resize at `width` has settled: kit DataTable writes data-plan-width (the box width its plan was
 *  made for) on its scroll box in the same commit as the plan, so once it names the box's current width the drawn columns
 *  and presentation are that width's. Then two reads a frame apart must agree. A step that leaves the box's
 *  width as it was passes at once. */
async function settled(page: Page, width: number, want: Record<string, string>) {
  await page.setViewportSize({ width, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.clientWidth)).toBe(width);
  await expect
    .poll(
      () =>
        page.evaluate((name) => {
          const box = document.querySelector(`[aria-label="${name}"]`)?.parentElement;
          const plan = Number(box?.getAttribute('data-plan-width'));
          return !!box && Number.isFinite(plan) && Math.abs(plan - box.clientWidth) <= 1;
        }, strings['tab.open']),
      { message: `the plan drawn at ${width} is for the box's width` },
    )
    .toBe(true);
  await expect
    .poll(async () => {
      const now = (await problems(page)).sig;
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      return now === (await problems(page)).sig;
    })
    .toBe(true);
  return problems(page, want);
}

test('the Open table from 1440 down to a list: every table keeps its Action column, and no row action runs past its cell or under its menu', async ({ page }) => {
  // 52 steps, each waiting for its render: past the 30 s default on a slow machine.
  test.setTimeout(150_000);
  await openTable(page, 1440);
  // What each row's action is, from the fixture: every step must show it.
  const want = await fixtureActions(page);
  expect(Object.values(want).filter((a) => a !== '').length, 'fixture rows with an action').toBeGreaterThan(3);
  expect((await problems(page, want)).out).toEqual([]);
  let tables = 0;
  let lists = 0;
  let sawList = false;
  for (let width = 1420; width >= 400; width -= 20) {
    const p = await settled(page, width, want);
    if (p.table) {
      expect(sawList, `a table again at ${width} after the list`).toBe(false);
      tables++;
      expect(p.rows, `rows at ${width}`).toBeGreaterThan(3);
    } else {
      sawList = true;
      lists++;
      expect(p.rows, `list rows at ${width}`).toBeGreaterThan(3);
    }
    expect(p.out, `at ${width}`).toEqual([]);
  }
  // The sweep crossed real table layouts, then real list layouts.
  expect(tables).toBeGreaterThan(10);
  expect(lists).toBeGreaterThan(0);
});

// The list presentation (a phone) keeps each row's own action on its line 2, inside the row, so
// a row's recovery is never only in its inspector; every row still has its 32 px row menu.
test('the Open list at 390: a row shows its own action inside the row, beside its row menu (axe target-size)', async ({ page }) => {
  // Each row's action from the fixture, so a list row that lost its action fails.
  const table = await openTable(page, 1440);
  const want = await fixtureActions(page);
  const p = await settled(page, 390, want);
  expect(p.table, 'a list at 390, not a table').toBe(false);
  // Every list row: its 32 px ⋯, and its own action inside the row and clear of the ⋯.
  expect(p.rows, 'list rows checked').toBeGreaterThan(3);
  expect(p.out).toEqual([]);
  // Firefox's row by its exact name (a row named, say, "Firefox Nightly" would also contain the text).
  const row = table.locator('[data-row-id]').filter({ has: page.getByText('Firefox', { exact: true }) });
  await expect(row).toHaveCount(1);
  const open = row.getByRole('link', { name: new RegExp(strings['act.screen']) });
  await expect(open).toBeVisible();
  const r = await row.boundingBox();
  const o = await open.boundingBox();
  const m = await row.getByRole('button', { name: MENU }).boundingBox();
  expect(r && o && m, 'row, action and row menu drawn').toBeTruthy();
  if (!r || !o || !m) return;
  expect(o.x >= r.x - 0.5 && o.x + o.width <= r.x + r.width + 0.5, 'the action inside its row').toBe(true);
  expect(o.x + o.width <= m.x + 0.5 || o.y >= m.y + m.height - 0.5, 'the action clear of the row menu').toBe(true);
  expect(m.width).toBeGreaterThanOrEqual(31.5);
  const found = await new AxeBuilder({ page }).include(`[aria-label="${strings['tab.open']}"]`).withRules(['target-size']).analyze();
  expect(found.violations.flatMap((v) => v.nodes.map((n) => n.html.slice(0, 120)))).toEqual([]);
});
