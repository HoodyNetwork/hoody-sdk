// Playwright: a note's Copy link and Copy read-only link, in a real browser. The row menu copies the note's own Notes
// address; a Hub link with ?sel= opens that note, also from another realm; a linked note outside the recent list opens in its frame too; the menu shows Copy for
// an agent with what it copies. Shots of the menu and of the opened link at 1350 and 390, light and dark, with no sideways
// page scroll.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, hubUrl, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

const ATLAS = 'c0a7150000000000000000a1';
const OLDER = '0f0e0d0c0b0a090807060504';
// A followed link opens its note once the page and that computer's Notes have answered: on a loaded host that alone can
// take longer than one default wait.
const OPENS = 20_000;
const table = (page: Page) => page.getByRole('table', { name: strings.table });
const weekly = (page: Page) => table(page).locator('tbody tr[data-row-id]').filter({ hasText: 'Weekly plan' });

test('Copy link copies the note\'s own address in its computer\'s Notes; Copy read-only link adds the read-only view', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await gotoHub(page, '/notes');
  await weekly(page).getByRole('button', { name: 'Row actions' }).click();
  await page.getByRole('menuitem', { name: strings['action.copyLink'] }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('/notebook/');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).hostname).toContain('-notes-');
  expect(new URL(link).origin).not.toBe(new URL(page.url()).origin);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await weekly(page).getByRole('button', { name: 'Row actions' }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${strings['action.copyReadOnly']}`) }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${link}?mode=readonly`);
});

// A link followed while another realm is shown switches to the note's realm and opens it, through the shell.
test('a link opened while another realm is shown switches to the note\'s realm', async ({ page }) => {
  const PERSONAL = 'f1f1f1f1f1f1f1f1f1f1f1f1'; // atlas's realm
  const LAB = 'f3f3f3f3f3f3f3f3f3f3f3f3';
  await page.goto(hubUrl(`/notes?sel=${ATLAS}~${OLDER}&open_realm=${PERSONAL}`).replace('/?', `/?fxrealm=${LAB}&`));
  await page.locator('#hub-main').waitFor();
  await expect(page.getByRole('button', { name: strings['action.openNoteTab'] })).toBeVisible({ timeout: OPENS });
  await expect(page.getByTitle(strings['note.frame'].replace('{{title}}', strings['note.title']))).toBeAttached();
  await expect.poll(() => page.evaluate(() => window.location.hash)).not.toContain('open_realm');
});

for (const [w, h] of [[1350, 900], [390, 844]] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`the row menu's Copy link at ${w}px, ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h });
      await gotoHub(page, '/notes', { theme });
      await weekly(page).getByRole('button', { name: 'Row actions' }).click();
      await expect(page.getByRole('menuitem', { name: strings['action.copyLink'] })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: new RegExp(`^${strings['action.copyAgent']}`) })).toContainText(strings['action.copyAgentHint'].replace('{{computer}}', 'atlas'));
      await noSideScroll(page);
      await page.screenshot({ path: info.outputPath(`notes-copylink-menu-${w}-${theme}.png`) });
    });

    test(`a linked note outside the recent list opens at ${w}px, ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h });
      await gotoHub(page, `/notes?sel=${ATLAS}~${OLDER}`, { theme });
      await expect(page.getByRole('button', { name: strings['action.openNoteTab'] })).toBeVisible({ timeout: OPENS });
      await expect(page.getByTitle(strings['note.frame'].replace('{{title}}', strings['note.title']))).toBeAttached();
      await noSideScroll(page);
      await page.screenshot({ path: info.outputPath(`notes-copylink-unlisted-${w}-${theme}.png`) });
    });
  }
}
