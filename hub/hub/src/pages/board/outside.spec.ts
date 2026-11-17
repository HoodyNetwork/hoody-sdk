// Playwright: Put on Board on an outside address opens it in the computer's browser as a
// new tab; with no computer to open it on, the web tile shows a card whose New tab opens a real tab of this browser.
// The fixtures open a browse only when it is asked as the Board asks it and only for example.org (fixtures.ts), so a
// browser tile after pressing the row that names example.org proves the host shown is the host sent.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

const URL_IN = 'https://Example.org/news';
const SENT = 'https://example.org/news';
const browserTile = (page: Page) => page.locator('iframe[title="browser-1 on atlas"]');
const card = (page: Page) => page.getByRole('main').getByText(strings['tile.blocked']);

async function openPicker(page: Page, w: number, state: string, theme: 'light' | 'dark') {
  await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
  await gotoHub(page, '/board', { state, theme });
  await page.getByRole('button', { name: strings['board.addProgram'] }).first().click(); // reason: the chips row's + (a phone, or a paged Board) has the same name, after the strip's or the empty slot's own
  return page.getByRole('dialog').last();
}

for (const theme of ['light', 'dark'] as const) {
  for (const w of [1350, 2400, 390]) {
    test(`${theme} ${w}: the typed row names the host and atlas; a press puts atlas's browser on the Board`, async ({ page }, info) => {
      const d = await openPicker(page, w, 'oneComputer', theme);
      await d.getByRole('searchbox').fill(URL_IN);
      const row = d.getByRole('row', { name: "Open example.org in atlas's browser" });
      await expect(row).toBeVisible();
      await noSideScroll(page);
      await page.screenshot({ path: info.outputPath(`row-${theme}-${w}.png`) });
      await row.click();
      await expect(browserTile(page)).toBeAttached();
      await expect(page.getByRole('status').filter({ hasText: 'example.org' })).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`tile-${theme}-${w}.png`) });
    });

    test(`${theme} ${w}: no computer runs: the card's New tab opens the address in a real new tab, without an opener`, async ({ page, context }, info) => {
      await context.route('https://example.org/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>outside</title>' }));
      const d = await openPicker(page, w, 'noneRunning', theme);
      await d.getByRole('searchbox').fill(SENT);
      await expect(d.getByRole('row', { name: /in .*'s browser$/ })).toHaveCount(0);
      await d.getByRole('row', { name: 'Open ' + SENT }).click();
      await expect(card(page)).toBeVisible();
      await expect(page.getByRole('main').getByText(/example\.org can't be shown inside the Hub/)).toBeVisible();
      await expect(page.getByRole('main').locator('iframe')).toHaveCount(0);
      await noSideScroll(page);
      await page.screenshot({ path: info.outputPath(`card-${theme}-${w}.png`) });
      // The card's own New tab (its words shown), not the tile header's icon of the same name.
      const [tab] = await Promise.all([context.waitForEvent('page'), page.getByRole('main').getByRole('link', { name: strings['tile.openNew'] }).filter({ hasText: strings['tile.openNew'] }).click()]);
      await tab.waitForLoadState('domcontentloaded');
      expect(tab.url()).toBe(SENT);
      expect(await tab.evaluate(() => window.opener)).toBeNull();
      await tab.close();
    });
  }
}

test('a private host or a data: address is never offered to a computer', async ({ page }) => {
  const d = await openPicker(page, 1350, 'oneComputer', 'light');
  await d.getByRole('searchbox').fill('http://192.168.1.1/');
  await expect(d.getByRole('row', { name: /in atlas's browser$/ })).toHaveCount(0);
  await expect(d.getByRole('row', { name: 'Open http://192.168.1.1/' })).toBeVisible();
  await d.getByRole('searchbox').fill('data:text/html,<b>x</b>');
  await expect(d.getByRole('row', { name: /in atlas's browser$|^Open data:/ })).toHaveCount(0);
  await d.getByRole('searchbox').fill('http://192.168.1.1/');
  await d.getByRole('row', { name: 'Open http://192.168.1.1/' }).click();
  await expect(card(page)).toBeVisible();
  await expect(browserTile(page)).toHaveCount(0);
});

// From atlas's own Web address form (several computers run in these states, so step 1 offers none).
async function fromAtlas(page: Page, state: string) {
  const d = await openPicker(page, 1350, state, 'light');
  await d.getByRole('row', { name: /^atlas/ }).click();
  // Web address is under the computer's Addresses kind.
  await d.getByRole('button', { name: 'Addresses' }).click();
  await d.getByRole('row', { name: /^Web address/ }).click();
  await d.getByRole('textbox', { name: 'Address' }).fill(SENT);
  await d.getByRole('button', { name: "Open example.org in atlas's browser" }).click();
}

test('browser down: it is started, then the address opens and its tile is placed', async ({ page }) => {
  await fromAtlas(page, 'default');
  await expect(browserTile(page)).toBeAttached();
});

test('the browser cannot be read: nothing starts, an error says so, and the card is placed', async ({ page }) => {
  await fromAtlas(page, 'browserReadFailed');
  await expect(page.getByText("Could not reach atlas's browser, so example.org was not opened there.")).toBeVisible();
  await expect(card(page)).toBeVisible();
});

test('the start answer is lost: nothing is sent again, the notice says so and the browser tile is placed', async ({ page }) => {
  await fromAtlas(page, 'browserStartPending');
  await expect(page.getByText(/atlas's browser did not answer while starting: example\.org may not have opened/)).toBeVisible();
  await expect(browserTile(page)).toBeAttached();
});
