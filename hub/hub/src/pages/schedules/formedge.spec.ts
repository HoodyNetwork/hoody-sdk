// Playwright: the New schedule drawer's form adds no inset of its own: its fields start and end on the drawer body's
// padding edges, as every other drawer's do (the drawer head lines up with the same edges). At 1440 (mouse) and
// 390 (touch), the Name field of the New command schedule form, light.
import { expect, type Page } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import strings from './strings.en.json';

async function openCommandForm(page: Page): Promise<void> {
  await gotoHub(page, '/schedules');
  await page.getByRole('button', { name: strings['action.new'] }).first().click(); // the toolbar's; an empty state's shares the name
  await page.getByRole('button', { name: new RegExp(strings['new.cmd']) }).click();
  await expect(page.getByRole('dialog').getByLabel(strings['e.name'])).toBeVisible();
  await expect(page.locator('[data-entering]'), 'the drawer has finished sliding in').toHaveCount(0);
}

async function edges(page: Page): Promise<{ field: number[]; body: number[] }> {
  return page.getByRole('dialog').evaluate((dialog, label) => {
    const body = dialog.querySelector('[data-drawer-body]')!;
    const s = getComputedStyle(body);
    const b = body.getBoundingClientRect();
    const left = b.left + body.clientLeft + parseFloat(s.paddingLeft);
    const right = b.left + body.clientLeft + body.clientWidth - parseFloat(s.paddingRight);
    const input = [...dialog.querySelectorAll('input')].find((i) => i.labels && [...i.labels].some((l) => l.textContent?.trim() === label))!;
    // The drawn field: the closest box with a border (the input or its wrapper).
    let e: Element = input;
    while (e.parentElement && parseFloat(getComputedStyle(e).borderLeftWidth) === 0) e = e.parentElement;
    const f = e.getBoundingClientRect();
    return { field: [f.left, f.right], body: [left, right] };
  }, strings['e.name']);
}

test('New command schedule, 1440: the Name field spans the drawer body edge to edge', async ({ hubPage: page }) => {
  await openCommandForm(page);
  const r = await edges(page);
  expect(Math.abs(r.field[0]! - r.body[0]!), 'the field starts on the body padding edge').toBeLessThanOrEqual(1);
  expect(Math.abs(r.field[1]! - r.body[1]!), 'the field ends on the body padding edge').toBeLessThanOrEqual(1);
});

test('New command schedule, 390 touch: the Name field spans the drawer body edge to edge', async ({ hubPageCoarse: page }) => {
  await openCommandForm(page);
  const r = await edges(page);
  expect(Math.abs(r.field[0]! - r.body[0]!), 'the field starts on the body padding edge').toBeLessThanOrEqual(1);
  expect(Math.abs(r.field[1]! - r.body[1]!), 'the field ends on the body padding edge').toBeLessThanOrEqual(1);
});
