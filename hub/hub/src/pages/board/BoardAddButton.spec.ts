// Playwright: Put on Board beside each place that opens a computer's program in a new tab, on
// fixtures (run by hub:check --page board). Each press lands on the Board with that program of atlas as a tile.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import kit from '@kit/strings.en.json';

const tile = (page: Page, name: string) => page.locator(`iframe[title="${name} on atlas"]`);

/** A use tile's own buttons show on pointer hover: hover the tile, then press its Put on Board. */
async function hoverPress(page: Page, tileName: string | RegExp, name: string) {
  await page.getByRole('main').getByRole('button', typeof tileName === 'string' ? { name: tileName, exact: true } : { name: tileName }).hover();
  await page.getByRole('button', { name }).click();
}

test('Home "Your computer": Put Agent on Board puts atlas\'s agent on the Board', async ({ page }) => {
  await gotoHub(page, '/');
  await hoverPress(page, 'Agent', 'Put Agent on Board');
  await expect(tile(page, 'agent-1')).toBeAttached();
});

test('Home "Your computer": the Desktop tile puts the display on the Board', async ({ page }) => {
  await gotoHub(page, '/');
  await hoverPress(page, 'Desktop', 'Put Desktop on Board');
  await expect(tile(page, 'display-1')).toBeAttached();
});

test('computer Overview: Put Browser on Board beside its use tile', async ({ page }) => {
  await gotoHub(page, '/computers?sel=atlas.00a1');
  await hoverPress(page, /^Browser /, 'Put Browser on Board'); // the Overview tile's name is its name, then its action word
  await expect(tile(page, 'browser-1')).toBeAttached();
});

test('computer Connect: each program row offers Put on Board (Files)', async ({ page }) => {
  await gotoHub(page, '/computers?sel=atlas.00a1&tab=connect');
  await page.getByRole('listitem').filter({ hasText: 'Files' }).getByRole('button', { name: 'Put Files on Board' }).click();
  await expect(tile(page, 'files-1')).toBeAttached();
});

test('computer Connect: the web terminal card offers Put on Board beside Open', async ({ page }) => {
  await gotoHub(page, '/computers?sel=atlas.00a1&tab=connect');
  await page.getByRole('heading', { name: 'In your browser', level: 4 }).locator('..').getByRole('button', { name: 'Put on Board', exact: true }).click();
  await expect(tile(page, 'terminal-1')).toBeAttached();
});

test('computer detail header: Put Terminal on Board beside Open terminal', async ({ page }) => {
  await gotoHub(page, '/computers?sel=atlas.00a1&tab=run');
  const open = page.getByRole('button', { name: 'Open terminal', exact: true });
  await open.locator('..').getByRole('button', { name: 'Put Terminal on Board' }).click();
  await expect(tile(page, 'terminal-1')).toBeAttached();
});

test('computer Run: Put on Board beside Open the terminal', async ({ page }) => {
  await gotoHub(page, '/computers?sel=atlas.00a1&tab=run');
  await page.getByRole('tabpanel').getByRole('button', { name: 'Put on Board', exact: true }).click();
  // Run's button opens a new terminal (session "new"): the next free number, 2, as atlas's fixture has terminal-1.
  await expect(tile(page, 'terminal-2')).toBeAttached();
});

test('Notes: a note row offers Put on Board in its row actions', async ({ page }) => {
  await gotoHub(page, '/notes?computer=c0a7150000000000000000a1');
  const row = page.getByRole('table').locator('tbody tr[data-row-id]').first(); // the first note row stands for any row: each offers the same entry
  await row.getByRole('button', { name: kit['table.rowActions'] }).click();
  await page.getByRole('menuitem', { name: 'Put on Board' }).click();
  await expect(tile(page, 'notes-1')).toBeAttached();
});
