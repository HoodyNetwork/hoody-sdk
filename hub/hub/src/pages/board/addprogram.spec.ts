// Playwright: Add a program, one frame on every step. The dialog has a fixed height (nothing jumps between steps);
// its head holds the way here and the step's search; below it, section cards of tiles (a tile is the action: no
// per-row buttons). Step 1: a "Computers · N" card of computer tiles (state as a tag, the Hoody Kit names as the
// tile's one line). Step 2: the computer's kinds in a rail (a strip on a phone) beside the open kind's cards; its
// Apps are a kind of the same frame. A program's sessions: one "Sessions · N" card of tiles. Past the first step
// "All computers" goes back to the whole list. Screenshots are saved for inspection.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const S = strings as Record<string, string>;

async function openAdd(page: Page) {
  await gotoHub(page, '/board');
  await page.getByRole('button', { name: S['board.addProgram'] }).first().click(); // reason: the chips row's + (a phone, or a paged Board) has the same name, after the strip's or the empty slot's own
  const d = page.getByRole('dialog').last();
  await expect(d.getByRole('row', { name: /^atlas/ })).toBeVisible();
  return d;
}
/** The head of the frame: the way here and the search. */
const frameOf = (d: Locator) => d.getByRole('navigation', { name: S['picker.title'] }).locator('xpath=../..');
/** No content wider than its own box inside the panel (nothing to scroll sideways). */
async function noSideways(d: Locator) {
  const over = await d.evaluate((el) => [...el.querySelectorAll<HTMLElement>('[role="row"], [role="grid"], nav, section')].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent?.slice(0, 40)));
  expect(over).toEqual([]);
}
const height = async (l: Locator) => Math.round((await l.boundingBox())!.height);

for (const [label, size, touch] of [
  ['1440x900 mouse', { width: 1440, height: 900 }, false],
  ['1024x768 mouse', { width: 1024, height: 768 }, false],
  ['390 touch', { width: 390, height: 844 }, true],
] as const) {
  test.describe(label, () => {
    test.use({ viewport: size, hasTouch: touch, isMobile: touch });

    test('one frame of the same height on every step: computers, the computer\'s kinds, a program\'s sessions; All computers goes back', async ({ page }, info) => {
      const d = await openAdd(page);
      const press = (l: Locator) => (touch ? l.tap() : l.click());
      const frame = frameOf(d);
      const h = await height(frame);
      // Step 1: one counted card of computer tiles; the Hoody Kit names are the tile's line; no Launch an app.
      const n = await d.getByRole('row', { name: /, (Running|Stopped|Paused)/ }).count();
      await expect(d.getByRole('heading', { name: S['picker.computersCount']!.replace('{{count}}', String(n)) })).toBeVisible();
      await expect(d.getByRole('row', { name: /^Launch an app/ })).toHaveCount(0);
      await expect(d.getByRole('row', { name: /^atlas/ })).toHaveAccessibleName(new RegExp(`${S['program.agent']} · ${S['program.terminal']} · `));
      await expect(d.getByRole('button', { name: /^Open/ })).toHaveCount(0);
      await noSideways(d);
      if (size.width >= 1024) expect((await d.boundingBox())!.width).toBeGreaterThan(880);
      await page.screenshot({ path: info.outputPath(`add-${label.replace(/\W+/g, '-')}.png`) });
      // Step 2: the kinds beside (or over) the open kind's cards, in the same frame of the same height.
      await press(d.getByRole('row', { name: /^atlas/ }));
      await expect(d.getByRole('heading', { name: /^Hoody Kit · 8$/ })).toBeVisible();
      const kinds = touch ? d.getByRole('tablist', { name: S['browse.kinds'] }) : d.getByRole('group', { name: S['browse.kinds'] });
      await expect(kinds).toBeVisible();
      expect(await height(frameOf(d))).toBe(h);
      await noSideways(d);
      await page.screenshot({ path: info.outputPath(`computer-${label.replace(/\W+/g, '-')}.png`) });
      // A program's sessions: one card of tiles, the frame unchanged.
      await press(d.getByRole('row', { name: new RegExp('^' + S['program.terminal']) }));
      await expect(d.getByRole('heading', { name: /^Sessions · \d+$/ })).toBeVisible();
      await expect(d.getByRole('row', { name: /^New session/ })).toBeVisible();
      await expect(d.getByRole('navigation').getByRole('button', { name: `Back to atlas · ${S['program.terminal']}` })).toBeVisible();
      expect(await height(frameOf(d))).toBe(h);
      await page.screenshot({ path: info.outputPath(`sessions-${label.replace(/\W+/g, '-')}.png`) });
      await press(d.getByRole('navigation').getByRole('button', { name: 'Back to All computers' }));
      await expect(d.getByRole('row', { name: /^atlas/ })).toBeVisible();
    });

    test('a search with no match says so in the frame; the search field\'s clear button brings the computers back', async ({ page }) => {
      const d = await openAdd(page);
      await d.getByRole('searchbox', { name: S['picker.search'] }).fill('zzzz');
      await expect(d.getByText(S['picker.noMatchTitle']!.replace('{{q}}', 'zzzz'))).toBeVisible();
      await expect(d.getByRole('row')).toHaveCount(0);
      await d.getByRole('button', { name: 'Clear search' }).click();
      await expect(d.getByRole('searchbox', { name: S['picker.search'] })).toHaveValue('');
      await expect(d.getByRole('row', { name: /^atlas/ })).toBeVisible();
    });
  });
}

test.describe('the computer\'s frame: its kinds, its Apps among them', () => {
  for (const [label, size] of [['1440x900', { width: 1440, height: 900 }], ['390x844', { width: 390, height: 844 }]] as const) {
    test(`${label}: one search over every kind and the app catalogue; Apps is a kind of the same frame`, async ({ page }, info) => {
      await page.setViewportSize(size);
      const d = await openAdd(page);
      await d.getByRole('row', { name: /^atlas/ }).click();
      const kit = d.getByRole('grid', { name: S['picker.kit'] });
      await expect(kit.getByRole('row')).toHaveCount(8);
      // One search field in the frame (the catalogue draws none of its own).
      await expect(d.getByRole('searchbox')).toHaveCount(1);
      await d.locator('[data-side-tab="apps"], [role="tab"]').filter({ hasText: S['browse.tab.apps'] }).first().click();
      const apps = d.getByRole('group', { name: S['picker.apps'], exact: true });
      await expect(apps).toBeVisible();
      await noSideways(d);
      await page.screenshot({ path: info.outputPath(`frame2-apps-${label}.png`) });
      const search = d.getByRole('searchbox', { name: S['picker.searchPrograms'] });
      await search.fill('term');
      await expect(d.getByRole('row', { name: new RegExp('^' + S['program.terminal']) })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`frame2-search-${label}.png`) });
      // Enter picks the first tile the words keep: Terminal's sessions.
      await search.press('Enter');
      await expect(d.getByRole('row', { name: /^New session/ })).toBeVisible();
      await d.getByRole('navigation').getByRole('button', { name: /^Back to atlas/ }).click();
      await expect(d.getByRole('grid', { name: S['picker.kit'] }).getByRole('row')).toHaveCount(8);
    });
  }
});

// The Change program dialog (kit Dialog, 480) holds the same chooser in the same frame, its tiles one per line.
test.describe('Change program dialog, 1440 mouse', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('the chooser in the 480 dialog is the same frame; a press on a computer tile opens the computer\'s step', async ({ page }, info) => {
    // The fixture Board starts empty: Files (one instance) adds its tile at once.
    const add = await openAdd(page);
    await add.getByRole('row', { name: /^atlas/ }).click();
    await add.getByRole('row', { name: new RegExp('^' + S['program.files']) }).click();
    const menu = page.getByRole('button', { name: S['tile.menu'] });
    await expect(menu).toBeVisible();
    await menu.click();
    await page.getByRole('menuitem', { name: S['tile.changeProgram'] }).click();
    const d = page.getByRole('dialog', { name: S['tile.changeProgram'] });
    await d.getByRole('navigation').getByRole('button', { name: 'Back to All computers' }).click();
    const atlas = d.getByRole('row', { name: /^atlas/ });
    await expect(atlas).toBeVisible();
    await noSideways(d);
    await page.screenshot({ path: info.outputPath('change-dialog-1440.png') });
    await atlas.click();
    await expect(d.getByRole('heading', { name: /^Hoody Kit · 8$/ })).toBeVisible();
  });
});
