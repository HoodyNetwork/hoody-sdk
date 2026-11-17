// In the browser: a chip tap on a phone-width Board and a press on a live tile's body enter the tile (its frame
// takes focus); a plain arrow on the Board moves without entering.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const terminal = (page: Page) => page.locator('iframe[title="terminal-1 on atlas"]');
const files = (page: Page) => page.locator('iframe[title="files-1 on atlas"]');

async function addProgram(page: Page, program: RegExp, session?: RegExp) {
  await page.getByRole('row', { name: /^atlas/ }).click();
  await page.getByRole('row', { name: program }).click();
  if (session) await page.getByRole('row', { name: session }).click();
}
/** Main with terminal-1 and files-1 on atlas, side by side (files-1 active). */
async function twoTiles(page: Page) {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/board');
  await page.getByRole('button', { name: strings['board.addProgram'] }).first().click(); // reason: the chips row's + (a phone, or a paged Board) has the same name, after the strip's or the empty slot's own
  await addProgram(page, /^Terminal/, /^terminal-1/);
  await expect(terminal(page)).toBeAttached();
  await page.getByRole('group', { name: strings.tiles }).focus();
  await page.keyboard.press('s');
  await addProgram(page, /^Files/);
  await expect(files(page)).toBeAttached();
}

test('at 390: a tap on a chip shows that tile and its frame takes focus', async ({ page }) => {
  await twoTiles(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const chips = page.getByRole('toolbar', { name: strings.chips });
  // files-1 (the current chip) first, then terminal-1: the strip scrolls a newly current chip into view, so no click
  // aims at a chip that is still moving.
  await chips.getByRole('button', { name: /files-1/ }).click();
  await expect(files(page)).toBeFocused();
  await chips.getByRole('button', { name: /terminal-1/ }).click();
  await expect(terminal(page)).toBeFocused();
  await expect(page.getByRole('group', { name: /terminal-1/ })).toHaveAttribute('data-hub-keys', 'frame');
});

test('at 1350: a plain arrow keeps the Board; a real click on a loading tile\'s skeleton enters it', async ({ page }) => {
  // The program pages never answer here, so the frames stay loading and their skeleton covers them: the click lands
  // on the tile's body, not in the frame (a click in the frame enters natively).
  await page.route(/fixture\.invalid/, () => undefined);
  await twoTiles(page);
  const surface = page.getByRole('group', { name: strings.tiles });
  await surface.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(surface).toBeFocused();
  const skeleton = page.getByRole('group', { name: /terminal-1/ }).locator('[aria-hidden="true"]:has(> i)');
  await skeleton.click();
  await expect(terminal(page)).toBeFocused();
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });
  test('at 1350: a tap on a loading tile\'s skeleton enters it, and the focus stays in the frame', async ({ page }) => {
    await page.route(/fixture\.invalid/, () => undefined);
    await twoTiles(page);
    const skeleton = page.getByRole('group', { name: /terminal-1/ }).locator('[aria-hidden="true"]:has(> i)');
    // The tap's compatibility mousedown is cancelled: the Board surface never takes the focus on the way in.
    await page.evaluate(() => {
      const w = window as unknown as { surfaceFocus: number };
      w.surfaceFocus = 0;
      document.addEventListener('focusin', (e) => { if ((e.target as Element).getAttribute('aria-label') === 'Board tiles') w.surfaceFocus++; });
    });
    await skeleton.tap();
    await expect(terminal(page)).toBeFocused();
    // Two more frames: past the touch's compatibility mouse events and the deferred entry.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect(terminal(page)).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as { surfaceFocus: number }).surfaceFocus)).toBe(0);
  });
});
