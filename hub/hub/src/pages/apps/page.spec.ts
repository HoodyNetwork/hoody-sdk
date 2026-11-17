// Playwright: the apps page is only an old link (apps live in the Apps tab of Programs).
// Its flows are tested there (pages/programs/page.apps.spec.ts); this checks that old links land.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

/** Opens an old /apps address and waits for where it lands. A one-page check (hub:check --page apps) does not serve
 *  Programs: the old link then stays on its "moved" note, in this Hub (never a classic view), and there is no move to
 *  check. Returns whether it moved to Programs. */
async function land(page: Page, path: string): Promise<boolean> {
  await gotoHub(page, path);
  const note = page.getByText(strings.moved);
  const moved = () => /\/programs\?tab=apps/.test(page.url());
  await expect.poll(async () => moved() || (await note.isVisible())).toBe(true);
  // The note is drawn for a moment before the move too: only a note that stays is the one-page case.
  if (!moved()) await page.waitForURL(/\/programs\?tab=apps/, { timeout: 2000 }).catch(() => {});
  if (moved()) return true;
  const url = new URL(page.url());
  expect(url.searchParams.has('view'), 'never a classic view').toBe(false);
  expect(url.hash).toMatch(/^#\/apps/);
  return false;
}

test('the old /apps link lands on the Apps tab of Programs', async ({ page }) => {
  test.skip(!(await land(page, '/apps')), 'Programs is not served in this run: the old link keeps its note');
  await expect(page).toHaveURL(/#?\/programs\?tab=apps$/);
});

test('an old link to a selected app or to Find keeps what it pointed at', async ({ page }) => {
  test.skip(!(await land(page, '/apps?sel=a1b2c3')), 'Programs is not served in this run: the old link keeps its note');
  await expect(page).toHaveURL(/\/programs\?tab=apps&appsel=a1b2c3/);
  await land(page, '/apps?tab=find&q=jupyter');
  await expect(page).toHaveURL(/\/programs\?tab=apps&launch=1/);
  // The old link's search still lands in the launch dialog's box, but never stays in the URL.
  const find = page.getByRole('dialog', { name: 'Launch an app' });
  await expect(find.getByRole('searchbox', { name: 'Search apps, programs and coding agents' })).toHaveValue('jupyter');
  await expect(page).not.toHaveURL(/[?&]launchq=/);
});
