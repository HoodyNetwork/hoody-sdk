// Playwright: Copy several selected items to the other side in a real browser. Two rows picked from the
// keyboard (three by their checkboxes in the second test), the bulk Copy opens one plan (a taken name under its Keep-both name), axe finds nothing in it, one press
// copies both, and a run whose second answer is lost stops there with nothing after it sent.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

const TWO = '/files?a=atlas.00a1&ap=%2Fhome%2Fada&b=atlas.00a1&bp=%2Ftmp';
const paneA = (page: Page) => page.getByRole('region', { name: strings['pane.a'] });
const paneB = (page: Page) => page.getByRole('region', { name: strings['pane.b'] });
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

// The kit table's Row actions header cell (empty-table-header) is a known axe finding of the kit; see view.spec.ts.
const KNOWN_BEFORE = ['empty-table-header'];

/** Picks rows from the keyboard, the way that works at every width: focus `first`, Space, then each step and Space. */
async function pick(page: Page, first: string, steps: readonly ('ArrowUp' | 'ArrowDown')[][]) {
  await paneA(page).locator('tr', { hasText: first }).getByText(first, { exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  for (const keys of steps) {
    for (const k of keys) await page.keyboard.press(k);
    await page.keyboard.press('Space');
  }
}

test('two picked items: one plan, a taken name kept beside, axe clean, one press copies both', async ({ page }) => {
  await gotoHub(page, TWO, { state: 'copyTaken' });
  await pick(page, 'notes.txt', [['ArrowDown']]);
  await paneA(page).getByRole('button', { name: ts['action.copySelected'] }).click();
  const d = page.getByRole('dialog');
  await expect(d.getByText('notes.txt → notes-1.txt')).toBeVisible();
  const r = await new AxeBuilder({ page }).include('[role=dialog]').disableRules(KNOWN_BEFORE).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
  await d.getByRole('button', { name: ts['copy.primary'], exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect(paneB(page).getByRole('row', { name: /notes-1\.txt/ })).toBeVisible();
  await expect(paneB(page).getByRole('row', { name: /report\.pdf/ })).toBeVisible();
});

test('a lost answer stops the run: the item stays may-have-gone-through, nothing after it is sent', async ({ page }) => {
  await gotoHub(page, TWO, { state: 'secondLost' });
  for (const name of ['hosts-link', 'notes.txt', 'report.pdf']) {
    await paneA(page).getByRole('row', { name: new RegExp(name.replace('.', '\\.')) }).getByRole('checkbox').click({ force: true }); // reason: the kit's checkbox input is visually hidden under its drawn box
  }
  // The kit's bulk bar count (kit strings): all three are picked before the bulk Copy.
  await expect(paneA(page).getByText(/^3 selected$/)).toBeVisible();
  await paneA(page).getByRole('button', { name: ts['action.copySelected'] }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: ts['copy.primary'], exact: true }).click();
  await expect(d.getByText([fill(ts['several.sumCopied'], { count: '1' }), fill(ts['several.sumPending'], { name: 'notes.txt' }), fill(ts['several.sumNotSent'], { count: '1' })].join(' '))).toBeVisible();
  await expect(d.getByText(ts['several.notSent'], { exact: true })).toBeVisible();
  // The footer's worded Close (data-dialog-cancel), not the dialog's X, which has the same name.
  await d.getByRole('button', { name: ts.close, exact: true }).and(d.locator('[data-dialog-cancel]')).click();
  // Not sent: report.pdf never reached the other side.
  await expect(paneB(page).getByRole('row', { name: /hosts-link/ })).toBeVisible();
  await expect(paneB(page).getByRole('row', { name: /report\.pdf/ })).toHaveCount(0);
});
