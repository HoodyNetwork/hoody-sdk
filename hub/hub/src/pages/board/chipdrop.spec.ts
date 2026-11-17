// A tile dragged onto a tile chip of a Board that pages, in the browser: the chip under the pointer
// wears the drop ring, the release swaps the two tiles, so the dragged one goes to the chip's page (the view follows it, the active tile), and
// one Undo puts them back.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const surface = (page: Page) => page.getByRole('group', { name: strings.tiles });
const frame = (page: Page, n: number) => page.locator(`iframe[title="terminal-${n} on atlas"]`);
const tileOf = (page: Page, n: number) => frame(page, n).locator('xpath=ancestor::*[@role="group"][@id][1]');
const chips = (page: Page) => page.getByRole('toolbar', { name: strings.chips });
const chip = (page: Page, n: number) => chips(page).getByRole('button', { name: new RegExp(`terminal-${n}\\b`) });
const counted = (p: number, of: number) => strings['pager.count'].replace('{{page}}', String(p)).replace('{{pages}}', String(of));

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

test('at 1350 x 900: terminal-1 dragged onto terminal-6\'s chip swaps with it and the view follows it to page 2; Undo puts it back', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1350, height: 900 });
  await tiles(page, 6);
  await page.keyboard.press('PageUp');
  await expect(page.getByText(counted(1, 2), { exact: true })).toBeVisible();
  await expect(frame(page, 1)).toBeVisible();

  // The press lands on the head's name, away from its controls.
  const label = tileOf(page, 1).locator('[class*="label"]').first();
  const from = (await label.boundingBox())!;
  const to = (await chip(page, 6).boundingBox())!;
  await page.mouse.move(from.x + 8, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + from.height / 2 + 20, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await expect(chip(page, 6)).toHaveAttribute('data-drop-target', '');
  await expect(chip(page, 5)).not.toHaveAttribute('data-drop-target');
  const ring = await chip(page, 6).evaluate((el) => getComputedStyle(el).boxShadow);
  expect(ring).not.toBe('none');
  await page.screenshot({ path: info.outputPath('chipdrop-over.png') });
  await page.mouse.up();

  await expect(chip(page, 6)).not.toHaveAttribute('data-drop-target');
  // terminal-1 took terminal-6's place on page 2 and stays active, so the view follows it there; the chips read the
  // new order, and terminal-6 holds page 1's first place.
  await expect(page.getByText(counted(2, 2), { exact: true })).toBeVisible();
  await expect(frame(page, 1)).toBeVisible();
  await expect(frame(page, 6)).toBeHidden();
  await expect(chips(page).getByRole('button', { name: /terminal-\d/ })).toHaveText([/terminal-6/, /terminal-2/, /terminal-3/, /terminal-4/, /terminal-5/, /terminal-1/]);
  await page.screenshot({ path: info.outputPath('chipdrop-after.png') });
  await page.getByRole('button', { name: strings['pager.prev'] }).click();
  await expect(frame(page, 6)).toBeVisible();

  // One undo step puts both back.
  await surface(page).focus();
  await page.keyboard.press('u');
  await expect(chips(page).getByRole('button', { name: /terminal-\d/ })).toHaveText([/terminal-1/, /terminal-2/, /terminal-3/, /terminal-4/, /terminal-5/, /terminal-6/]);
});
