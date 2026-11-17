// Playwright: in the Permissions drawer at 1440 the Computers tab is a table
// with every column drawn: the table drops a column it has no room for, and the drawer has no view menu to bring one
// back. Who gets in is one column with the room for its longest words ("Its own rules + project groups"), since no
// table cell wraps, and a reinstalled computer's story is a band that wraps. For the owner and for a member, with known
// and unknown access sources and with a reinstalled computer, each row's words are on screen whole (never cut to an
// ellipsis that only a hover can read), and nothing scrolls sideways. Layout needs a real browser.
import { expect, test, type Locator } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

test.setTimeout(120_000);
test.use({ viewport: { width: 1440, height: 900 } });
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
type Key = keyof typeof strings;
const NAME = 'Home base';

// Per fixture state: the words each row shows, in row order (as projects.computers.test.tsx reads them).
const CASES: readonly { state: string; who: string; rows: readonly (readonly Key[])[]; bands?: readonly string[] }[] = [
  { state: 'rulesChange', who: 'owner', rows: [['pp.cx.by.project'], ['pp.cx.by.both'], ['pp.cx.own.failed']] },
  { state: 'rulesChangeOpen', who: 'owner', rows: [['pp.cx.by.open'], ['pp.cx.by.own'], ['pp.cx.own.failed']] },
  { state: 'memberComputers', who: 'member', rows: [['pp.cx.by.project'], ['pp.cx.by.both'], ['pp.cx.own.failed']] },
  { state: 'memberComputersRulesFail', who: 'member, rules not read', rows: [['pp.cx.by.noOwn'], ['pp.cx.by.hasOwn'], ['pp.cx.own.failed']] },
  { state: 'projectExpired', who: 'owner, reinstalled', rows: [[], ['pp.cx.by.none'], []], bands: [fill(strings['pp.cx.reinstalledOf'], { name: 'cedar' })] },
];

/** The text's cell (or band) shows it whole: nothing past its box, so no ellipsis hides a part. */
async function whole(el: Locator) {
  await expect(el).toBeVisible();
  const cut = await el.evaluate((e) => {
    const box = (e.closest('td, [role="cell"], [role="gridcell"]') ?? e) as HTMLElement;
    return box.scrollWidth - box.clientWidth;
  });
  expect(cut).toBeLessThanOrEqual(1);
}

for (const { state, who, rows, bands = [] } of CASES)
  test(`${who} (${state}): every column drawn, each row's access words whole on screen, no sideways scroll`, async ({ page }) => {
    await gotoHub(page, '/computers/projects', { state });
    const row = page.locator('[data-row-id]').filter({ has: page.getByText(NAME, { exact: true }) });
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.getByRole('button', { name: 'Row actions' }).click();
    await page.getByRole('menu').getByRole('menuitem', { name: new RegExp(strings['pp.open']) }).click();
    const d = page.getByRole('dialog', { name: fill(strings['pp.title'], { name: NAME }) });
    await d.getByRole('tab', { name: strings['pp.tab.computers'] }).click();
    const table = d.getByRole('table', { name: fill(strings['pp.cx.title'], { name: NAME }) });
    await expect(table).toBeVisible({ timeout: 30_000 });
    for (const h of ['pp.cx.col.name', 'pp.cx.col.state', 'pp.cx.col.by'] as const)
      await expect(table.getByRole('columnheader', { name: strings[h] })).toBeVisible();
    const drawn = table.locator('[data-row-id]');
    await expect(drawn).toHaveCount(rows.length);
    for (const [i, words] of rows.entries())
      for (const k of words) await whole(drawn.nth(i).getByText(strings[k], { exact: true }));
    for (const b of bands) await whole(d.getByText(b, { exact: true }));
    await noSideScroll(page);
  });
