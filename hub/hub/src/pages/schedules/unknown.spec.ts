// Playwright: what a person sees of a change that may have gone through, at 1440 and at 390, and why
// the last run failed. On the fixture 'act-pending', every change answers "may have gone through".
import { type Locator, type Page, expect } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import strings from './strings.en.json';

const NAME = 'Nightly backup';
const rowOf = (page: Page, label: string) => page.locator('tbody tr[data-row-id]').filter({ hasText: label });
// The element whose own text holds the name (the cell also holds the kind tag).
const nameIn = (row: Locator) => row.locator(`xpath=.//*[text()[contains(normalize-space(.), "${NAME}")]]`).first();

// The box of `inner` lies inside the box of `outer` (a clipped button sticks out of its cell).
async function inside(inner: Locator, outer: Locator) {
  const a = await inner.boundingBox();
  const b = await outer.boundingBox();
  expect(a && b).toBeTruthy();
  expect(a!.x).toBeGreaterThanOrEqual(b!.x - 0.5);
  expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x + b!.width + 0.5);
}

// Text that is not cut: its element shows all of its content.
async function notCut(el: Locator) {
  const cut = await el.evaluate((n) => {
    for (let e: Element | null = n; e && e.tagName !== 'TD'; e = e.parentElement) if (e.scrollWidth > e.clientWidth + 1) return true;
    return false;
  });
  expect(cut).toBe(false);
}

test.describe('a change that may have gone through, at 1440', () => {
  test.beforeEach(async ({ hubPage }) => {
    await hubPage.setViewportSize({ width: 1440, height: 900 });
  });

  test('the row says so in words, Check again is whole, and the switch shows no settled state', async ({ hubPage: page }) => {
    await gotoHub(page, '/schedules', { state: 'act-pending' });
    const row = rowOf(page, NAME);
    await row.getByRole('switch', { name: strings['action.pauseName'].replace('{{name}}', NAME) }).click({ force: true });
    const words = row.getByText('May have gone through', { exact: true });
    await expect(words).toBeVisible();
    await notCut(words);
    const check = row.getByRole('button', { name: 'Check again' });
    await expect(check).toBeVisible();
    await inside(check, check.locator('xpath=ancestor::td[1]'));
    await expect(row.getByRole('switch')).toHaveCount(0);
    await expect(row.getByLabel(strings['on.unknown'])).toBeVisible();
  });

  test('the inspector shows on-or-off as not known, not a switch, after a turn-off that may have gone through', async ({ hubPage: page }) => {
    await gotoHub(page, '/schedules?sel=cron%3Auser%2Fa1', { state: 'act-pending' });
    const inspector = page.getByRole('region', { name: 'Details' });
    await inspector.getByRole('switch', { name: strings['action.pauseName'].replace('{{name}}', NAME) }).click({ force: true });
    await expect(inspector.getByText(strings['on.unknown'], { exact: true })).toBeVisible();
    await expect(inspector.getByRole('switch')).toHaveCount(0);
  });
});

test.describe('a change that may have gone through, at 390', () => {
  test.beforeEach(async ({ hubPage }) => {
    await hubPage.setViewportSize({ width: 390, height: 844 });
  });

  // A list row's line 2 is one fixed line beside the row menu: the note says it in fewer words, whole.
  test('the name stays whole and the note is on line 2, in words with Check again', async ({ hubPage: page }) => {
    await gotoHub(page, '/schedules', { state: 'act-pending' });
    const row = rowOf(page, NAME);
    await row.getByRole('button', { name: 'Row actions' }).click();
    await page.getByRole('menuitem', { name: /Turn off/ }).click();
    await expect(row.getByText(strings['op.pendingShort'], { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Check again' })).toBeVisible();
    const name = nameIn(row);
    await expect(name).toBeVisible();
    await notCut(row.getByText(strings['op.pendingShort'], { exact: true }));
    await notCut(name);
    const nameBox = await name.boundingBox();
    const noteBox = await row.getByText(strings['op.pendingShort'], { exact: true }).boundingBox();
    expect(noteBox!.y).toBeGreaterThan(nameBox!.y + nameBox!.height - 1);
  });
});

test.describe('why the last run failed', () => {
  test.beforeEach(async ({ hubPage }) => {
    await hubPage.setViewportSize({ width: 1440, height: 900 });
  });

  test('Last result shows the failed run\'s first output line, and See output opens that run in History', async ({ hubPage: page }) => {
    await gotoHub(page, '/schedules?sel=cron%3Auser%2Fa3');
    const details = page.locator('dl').first();
    await expect(details.getByText(/couldn't connect to remote:photos/)).toBeVisible();
    await page.getByRole('button', { name: strings['hist.seeOutput'] }).click();
    const hist = page.getByRole('table', { name: strings['detail.history'] });
    const opened = hist.locator('button[aria-expanded="true"]');
    await expect(opened).toHaveCount(1);
    await expect(opened).toBeFocused();
    await expect(hist.getByRole('figure', { name: strings['hist.output'] })).toBeVisible();
  });
});
