// Playwright: a launch end to end in a real browser, on the dev fixtures' kit fake
// (core's runOpenFixture answers the run, terminal and display routes). Files row menu -> Open with… -> Nano, kept
// for the file's kind, lands on the keyed program board with the new terminal's tile, and Back returns to the
// folder; the row menu then offers Open in Nano, which finds it running, and Show it returns to that board. The Apps
// tab of Programs keeps its own fixture answers (only the Open with drawer runs the live machine in fixture builds).
// Phone and wide widths. A second test: the landed tile is entered (it has the keys), and a
// second file opened with Nano adds a second tile to the same keyed board, entered in its turn.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';
import kit from '@kit/strings.en.json';

// The apps page's strings these tests name (copied: a page imports only another page's links.ts).
const ow = {
  'ow.chooser.title': 'Open “{{file}}” with',
  'ow.chooser.titleOne': 'Open “{{file}}”',
  'ow.chooser.showIt': 'Show it',
  'r.running': '{{p}} is already running, started with {{file}}.',
  'r.held': "{{p}} may still be starting with {{file}} from before, so it wasn't started again.",
} as const;
const apps = { 'tab.open': 'Opened apps' } as const;

const APP = '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp';
const FOLDER = /#\/files\?a=atlas\.00a1&ap=%2Fsrv%2Fapp$/;
const row = (page: Page, name: string) =>
  page.getByRole('region', { name: strings['pane.a'] }).locator('tbody tr').filter({ hasText: name });
const title = (file: string) => ow['ow.chooser.title'].replace('{{file}}', file);

async function rowMenu(page: Page, name: string) {
  const r = row(page, name);
  await expect(r).toBeVisible();
  await r.getByRole('button', { name: kit['table.rowActions'] }).click();
}
/** On the board the launch keyed: its tab is the selected one (a phone folds the tabs into one button naming the
 *  board shown) and the new terminal's tile is drawn. */
async function onNanoBoard(page: Page) {
  await expect(page).toHaveURL(/#\/board$/);
  const board = /^Nano · atlas/i;
  await expect(page.getByRole('tab', { name: board, selected: true }).or(page.getByRole('button', { name: board }))).toBeVisible();
  await expect(page.locator('iframe[title^="terminal-8"][title$=" on atlas"]').first()).toBeAttached(); // reason: a board with a second file's launch holds two terminal tiles
}
/** Row menu -> Open with… for `file`, until its drawer is drawn in full. On a loaded machine a key can reach the
 *  menu before it is ready (seen once in 5 runs: the menu shut and no drawer came); then the row menu is opened again,
 *  as a person would. Once only: a second miss fails the test, and a reopen is written into the report, so a drawer
 *  that does not open is never passed over in silence. */
async function openWithDrawer(page: Page, file: string) {
  const drawer = page.getByRole('dialog', { name: title(file) });
  const openWith = page.getByRole('menuitem', { name: strings['ow.openWith'] });
  for (let tries = 0; ; tries++) {
    await rowMenu(page, file);
    await openWith.press('Enter');
    const opened = await drawer.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
    if (opened) break;
    expect(tries, 'Open with… opened no drawer twice').toBe(0);
    test.info().annotations.push({ type: 'reopened', description: 'Open with… opened no drawer; the row menu was opened again' });
    await expect(openWith).toBeHidden();
  }
  const nano = drawer.getByRole('button', { name: 'Nano', exact: true });
  await expect(nano).toBeEnabled(); // its checks are back: the drawer is drawn in full
  return { drawer, nano };
}
/** The one tile that has the keys (its root carries data-hub-keys="frame") is a terminal-8xxx tile, and focus is in its
 *  frame: the landing entered it. Returns that frame's title (the terminal it shows). */
async function enteredTerminal(page: Page): Promise<string> {
  const inside = page.locator('[data-hub-keys="frame"]');
  await expect(inside).toHaveCount(1);
  const frame = inside.locator('iframe[title^="terminal-8"][title$=" on atlas"]');
  await expect(frame).toBeAttached();
  await expect.poll(() => frame.evaluate((f) => document.activeElement === f)).toBe(true);
  return (await frame.getAttribute('title'))!;
}
async function backToFolder(page: Page) {
  await page.goBack();
  await expect(page).toHaveURL(FOLDER);
  await expect(row(page, 'server.js')).toBeVisible();
}

for (const [width, height] of [[390, 844], [1440, 900]] as const) {
  test(`@openwith a launch lands on its program board and Back returns to the folder (${width})`, async ({ page }) => {
    test.setTimeout(90_000); // three navigations and a launch's confirm poll
    await page.setViewportSize({ width, height });
    await gotoHub(page, APP);

    const { drawer, nano } = await openWithDrawer(page, 'server.js');
    // Kept for this kind of file on this computer, so the row menu offers it next time.
    // By keyboard: the drawer's later check rows can move the box between a pointer's aim and its click.
    const always = drawer.getByRole('checkbox', { name: /^Always use the program I pick for / });
    await always.press('Space');
    await expect(always).toBeChecked();
    await nano.click();
    await onNanoBoard(page);
    await backToFolder(page);

    // The row menu remembers the choice: Open in Nano, straight from the row, finds the one already running and
    // starts nothing new; Show it goes back to its board. The first launch is confirmed a few seconds after it reads
    // running (the run-open machine's confirm poll); a press before that says it may still be starting, and is
    // pressed again, as a person would.
    const again = page.getByRole('dialog', { name: ow['ow.chooser.titleOne'].replace('{{file}}', 'server.js') });
    const running = again.getByText(ow['r.running'].replace('{{p}}', 'Nano').replace('{{file}}', 'server.js'));
    const held = again.getByText(ow['r.held'].replace('{{p}}', 'Nano').replace('{{file}}', 'server.js'));
    await expect(async () => {
      if (await again.isVisible()) await again.getByRole('button', { name: kit['action.close'] }).first().click(); // reason: the drawer has a Close in its header and its footer
      await rowMenu(page, 'server.js');
      await page.getByRole('menuitem', { name: strings['ow.openIn'].replace('{{p}}', 'Nano') }).press('Enter');
      await expect(running.or(held)).toBeVisible();
      await expect(running).toBeVisible({ timeout: 500 });
    }).toPass({ intervals: [1000], timeout: 20000 });
    await again.getByRole('button', { name: ow['ow.chooser.showIt'] }).click();
    await onNanoBoard(page);
    await backToFolder(page);

    // The Apps tab still reads its fixtures, not the kit fake.
    await gotoHub(page, '/programs?tab=apps');
    const open = page.getByRole('table', { name: apps['tab.open'] });
    await expect(open.getByRole('row', { name: /JupyterLab/ })).toBeVisible();
    await expect(open.getByRole('row', { name: /Firefox/ })).toBeVisible();
  });
}

for (const [width, height] of [[390, 844], [1440, 900]] as const) {
  test(`@openwith two files opened with Nano: each landing enters its tile, the second adds a tile to the same board (${width})`, async ({ page }, info) => {
    test.setTimeout(120_000); // two launches, four navigations
    await page.setViewportSize({ width, height });
    await gotoHub(page, APP);

    await (await openWithDrawer(page, 'server.js')).nano.click();
    await onNanoBoard(page);
    const first = await enteredTerminal(page);
    await backToFolder(page);

    await (await openWithDrawer(page, 'package.json')).nano.click();
    await onNanoBoard(page);
    const second = await enteredTerminal(page);
    // The same keyed board, now with both terminals: the second file added a tile, it did not replace the first.
    expect(second).not.toBe(first);
    await expect(page.locator('iframe[title^="terminal-8"][title$=" on atlas"]')).toHaveCount(2);
    await expect(page.locator(`iframe[title="${first}"]`)).toBeAttached();
    await page.screenshot({ path: info.outputPath(`openwith-second-${width}.png`) });
    await backToFolder(page);
  });
}
