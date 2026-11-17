// Forced colours: box-shadow is dropped there, so the tile chips' focus ring and the drop
// place a tile drag draws on a chip show a Highlight outline instead, as the kit Tabs' do.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const surface = (page: Page) => page.getByRole('group', { name: strings.tiles });
const frame = (page: Page, n: number) => page.locator(`iframe[title="terminal-${n} on atlas"]`);
const tileOf = (page: Page, n: number) => frame(page, n).locator('xpath=ancestor::*[@role="group"][@id][1]');
const chips = (page: Page) => page.getByRole('toolbar', { name: strings.chips });
const chip = (page: Page, n: number) => chips(page).getByRole('button', { name: new RegExp(`terminal-${n}\\b`) });
const outline = (l: Locator) => l.evaluate((el) => { const c = getComputedStyle(el); return { style: c.outlineStyle, width: parseFloat(c.outlineWidth), offset: parseFloat(c.outlineOffset) }; });

/** Main with terminal-1 on atlas, then copies up to `count` tiles (as board-pager.spec.ts). */
async function tiles(page: Page, count: number) {
  await gotoHub(page, '/board');
  await page.getByRole('button', { name: strings['board.addProgram'] }).first().click(); // reason: the chips row's + has the same name, after the strip's or the empty slot's own
  await page.getByRole('row', { name: /^atlas/ }).click();
  await page.getByRole('row', { name: /^Terminal/ }).click();
  await page.getByRole('row', { name: /^terminal-1/ }).click();
  await expect(frame(page, 1)).toBeAttached();
  for (let n = 2; n <= count; n++) {
    await surface(page).focus();
    await page.keyboard.press('.');
    await page.getByRole('menuitem', { name: strings['tile.duplicate'] }).click();
    await expect(frame(page, n)).toBeAttached();
  }
  await surface(page).focus();
}

test('forced colours, 1350 x 900: a focused chip and the drop chip each wear an outline; a plain chip none', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1350, height: 900 });
  await page.emulateMedia({ forcedColors: 'active' });
  await tiles(page, 6);
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);

  // Keyboard focus on a chip (focus-visible): focus one, then a key press.
  await chip(page, 2).focus();
  await page.keyboard.press('ArrowRight'); // reason: a key press makes the focus keyboard focus (focus-visible) whatever the toolbar's arrow handling
  const focused = chips(page).locator('button:focus-visible');
  await expect(focused).toHaveCount(1);
  const fo = await outline(focused);
  expect(fo.style).toBe('solid');
  expect(fo.width).toBeGreaterThan(0);
  expect(fo.offset).toBeLessThan(0); // drawn inside the chip
  await page.screenshot({ path: info.outputPath('forced-focus.png') });

  await page.keyboard.press('PageUp');
  const label = tileOf(page, 1).locator('[class*="label"]').first();
  const from = (await label.boundingBox())!;
  const to = (await chip(page, 6).boundingBox())!;
  await page.mouse.move(from.x + 8, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + from.height / 2 + 20, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await expect(chip(page, 6)).toHaveAttribute('data-drop-target', '');
  const dro = await outline(chip(page, 6));
  expect(dro.style).toBe('solid');
  expect(dro.width).toBeGreaterThan(0);
  expect(dro.offset).toBeLessThan(0);
  // A chip that is neither focused nor the drop place draws no outline.
  const plain = chip(page, 4);
  expect(await plain.evaluate((el) => el.matches(':focus-visible'))).toBe(false);
  expect((await outline(plain)).style).toBe('none');
  await page.screenshot({ path: info.outputPath('forced-drop.png') });
  await page.mouse.up();
});
