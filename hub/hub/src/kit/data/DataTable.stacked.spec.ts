// Playwright: groupHeader="stacked" measured in a browser on the kit gallery (/_kit?tab=table, the
// "Stacked group headers" table: checkboxes, groups and expandable rows). The unit test checks where the indent mark
// lands; this checks the CSS really wins (`.tr > td:first-child` is a stronger selector than a two-class rule) and stays
// off the checkbox cell and off a nested table.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import kit from '../strings.en.json';
import strings from '../gallery/table.strings.en.json';

const stacked = (page: Page) => page.getByRole('table', { name: strings['sec.groupsStacked'] });

/** A spacing token in px, read by laying it out (the tokens are rem). */
const token = (page: Page, name: string) =>
  page.evaluate((n) => {
    const el = document.createElement('div');
    el.style.width = `var(${n})`;
    document.body.append(el);
    const w = el.getBoundingClientRect().width;
    el.remove();
    return w;
  }, name);

const pad = (loc: Locator, side: 'paddingInlineStart' | 'paddingBlockStart') =>
  loc.evaluate((el, p) => parseFloat(getComputedStyle(el)[p as 'paddingInlineStart']), side);

test('@stacked grouped rows indent their first content cell; the checkbox cell, the header and a nested table keep theirs', async ({ page }) => {
  await gotoHub(page, '/_kit?tab=table');
  const t = stacked(page);
  await t.waitFor({ timeout: 30_000 });
  const sp3 = await token(page, '--sp-3');
  const sp4 = await token(page, '--sp-4');
  expect(sp3).toBeGreaterThan(0);

  const row = t.locator(':scope > tbody > tr[data-row-id]').first();
  await row.waitFor();
  // The checkbox cell is the row's first cell: the plain first-cell inset.
  const first = row.locator(':scope > td').first();
  await expect(first.getByRole('checkbox')).toHaveCount(1);
  expect(await pad(first, 'paddingInlineStart')).toBeCloseTo(sp4, 1);
  // The first content cell carries the indent, and the computed padding is the indent (the rule wins): its own 12 and
  // --group-indent, the chevron's lead column and gap.
  const content = row.locator(':scope > td[data-group-indent]');
  await expect(content).toHaveCount(1);
  expect(await pad(content, 'paddingInlineStart')).toBeCloseTo(sp3 + (await token(page, '--rail-lead')) + (await token(page, '--rail-gap')), 1);

  // The group header: sp-3 above, the title button alone on its first line.
  const head = t.locator(':scope > tbody > tr:not([data-row-id])').filter({ has: page.locator('button[aria-expanded]') }).first();
  expect(await pad(head.locator(':scope > td'), 'paddingBlockStart')).toBeCloseTo(sp3, 1);

  // A nested table in an expanded row takes none of it.
  await t.getByRole('button', { name: kit['table.expandRow'] }).first().click(); // reason: each expandable row has its own; any one opens a nested table
  const inner = t.getByRole('table', { name: strings['parts.title'] });
  await inner.waitFor();
  await expect(inner).not.toHaveAttribute('data-group-header', /./);
  const innerFirst = inner.locator(':scope > tbody > tr[data-row-id] > td').first();
  expect(await pad(innerFirst, 'paddingInlineStart')).toBeCloseTo(sp4, 1);
  await expect(inner.locator('[data-group-indent]')).toHaveCount(0);
});

/** The space between a stacked group header's title button and its second line (the group's extra), in px. */
const headGap = async (page: Page) => {
  const head = stacked(page).locator(':scope > tbody > tr:not([data-row-id])').filter({ has: page.locator('[data-group-extra]') }).first();
  await head.waitFor();
  const btn = await head.locator('button[aria-expanded]').boundingBox();
  const extra = await head.locator('[data-group-extra]').boundingBox();
  if (!btn || !extra) throw new Error('stacked group header not laid out');
  return extra.y - (btn.y + btn.height);
};

test('@stacked a fine pointer keeps sp-1 between the header title and its second line', async ({ page }) => {
  await gotoHub(page, '/_kit?tab=table');
  await stacked(page).waitFor({ timeout: 30_000 });
  expect(await headGap(page)).toBeCloseTo(await token(page, '--sp-1'), 1);
});

test.describe('stacked group headers on a coarse pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: true });

  // The title button and the group's own controls under it are both touch targets, so the space
  // between them is at least --touch-gap, as between the table's other wrapping touch rows.
  test('@stacked the header title and its second line keep --touch-gap between them', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=table');
    await stacked(page).waitFor({ timeout: 30_000 });
    const touchGap = await token(page, '--touch-gap');
    expect(touchGap).toBeGreaterThanOrEqual(8);
    // Exactly the larger of the two: neither the fine-pointer 4 px nor more than the touch rows' gap.
    expect(await headGap(page)).toBeCloseTo(Math.max(await token(page, '--sp-1'), touchGap), 1);
  });
});
