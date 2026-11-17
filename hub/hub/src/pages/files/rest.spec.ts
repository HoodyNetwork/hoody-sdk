// Playwright: Copy the rest in a real browser. A folder copy cut part way stays held with its count; the
// held band offers Copy the rest; its dialog lists what is missing and that the first copy is let go; axe finds nothing
// in it; one press copies the missing folder, and the copy is whole, the hold gone.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

const TWO = '/files?a=atlas.00a1&ap=%2Fhome%2Fada&b=atlas.00a1&bp=%2Ftmp';
const paneA = (page: Page) => page.getByRole('region', { name: strings['pane.a'] });
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

// The kit table's Row actions header cell (empty-table-header) is a known axe finding of the kit; see view.spec.ts.
const KNOWN_BEFORE = ['empty-table-header'];

test('a cut folder copy: Copy the rest lists what is missing, is axe clean, and one press makes the copy whole', async ({ page }) => {
  // Two dialogs, two copies and an axe pass: 31-36 s on a slow machine with every step correct, past the
  // 30 s default.
  test.setTimeout(90_000);
  await gotoHub(page, TWO, { state: 'folderCutFirst' });
  const r = paneA(page).getByRole('row', { name: /projects/ });
  await r.getByRole('button', { name: /actions|more/i }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${ts['action.copy']}`) }).click();
  let d = page.getByRole('dialog');
  const go = d.getByRole('button', { name: ts['copy.primary'], exact: true });
  await expect(go).toBeEnabled();
  await go.click();
  await expect(d.getByText(fill(ts['held.copyPart'], { count: '3', dest: '/tmp/projects' }))).toBeVisible();
  // Held: the footer's own button (Close or Cancel), never the kit's X (also named "Close").
  await d.getByRole('button', { name: /^(close|cancel)$/i }).and(d.locator(':not([data-dialog-close])')).click();
  await expect(d).toHaveCount(0);

  await paneA(page).getByRole('button', { name: ts['rest.action'] }).click();
  d = page.getByRole('dialog', { name: fill(ts['rest.title'], { name: 'projects' }) });
  await expect(d.getByText(ts['rest.release'])).toBeVisible();
  await expect(d.getByRole('list', { name: ts['several.listLabel'] }).getByRole('listitem')).toHaveCount(1);
  const press = d.getByRole('button', { name: ts['copy.primary'], exact: true });
  await expect(press).toBeEnabled();
  const axe = await new AxeBuilder({ page }).include('[role=dialog]').disableRules(KNOWN_BEFORE).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await press.click();
  await expect(d).toHaveCount(0);
  await expect(page.getByText(fill(ts['held.copy'], { name: 'projects', dest: '/tmp/projects' }), { exact: false })).toHaveCount(0);
});
