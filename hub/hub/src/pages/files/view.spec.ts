// Playwright: the Files One pane / Two panes toggle in a real browser. One pane is the default; Two panes is
// remembered across a reload; a link saying one pane still opens one; axe finds nothing in either mode.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const APP = '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp';
const paneA = (page: Page) => page.getByRole('region', { name: strings['pane.a'] });
const paneB = (page: Page) => page.getByRole('region', { name: strings['pane.b'] });
const rows = (page: Page) => paneA(page).locator('tbody tr');

// Every axe finding fails, the pane picker's Label in Name (label-content-name-mismatch) included. (The kit table's
// Row actions header carries visually hidden text, so empty-table-header is checked too.)
async function axeClean(page: Page) {
  const r = await new AxeBuilder({ page }).include('#hub-main').analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.html.slice(0, 160)}`).join(' | ')}`)).toEqual([]);
}
async function choose(page: Page, label: string) {
  await page.getByRole('radiogroup', { name: strings['view.label'] }).getByRole('radio', { name: label }).click();
}

test('one pane by default; Two panes is remembered across a reload; axe finds nothing', async ({ page }) => {
  test.setTimeout(90_000); // three loads, two reloads and an axe pass; the 30 s default runs out under host load
  await gotoHub(page, APP);
  await expect(rows(page).first()).toBeVisible();
  await expect(paneB(page)).toHaveCount(0);
  await axeClean(page);

  await expect(page.getByRole('radio', { name: strings['view.one'] })).toHaveAttribute('aria-checked', 'true');
  await choose(page, strings['view.two']);
  await expect(paneB(page)).toBeVisible();
  await expect(page).toHaveURL(/[?&]panes=two/);
  await axeClean(page);

  // The remembered choice: an address that names no mode opens two panes after a reload.
  await gotoHub(page, APP);
  await expect(rows(page).first()).toBeVisible();
  await expect(paneB(page)).toBeVisible();

  // The address still wins: a link saying one pane opens one (without changing what is remembered); One picked on the
  // toggle is remembered in turn. A radio sends nothing for the choice already shown, so it is picked from Two.
  await gotoHub(page, `${APP}&panes=one`);
  await expect(rows(page).first()).toBeVisible();
  await expect(paneB(page)).toHaveCount(0);
  await choose(page, strings['view.two']);
  await expect(paneB(page)).toBeVisible();
  await choose(page, strings['view.one']);
  await expect(paneB(page)).toHaveCount(0);
  await gotoHub(page, APP);
  await expect(rows(page).first()).toBeVisible();
  await expect(paneB(page)).toHaveCount(0);
});
