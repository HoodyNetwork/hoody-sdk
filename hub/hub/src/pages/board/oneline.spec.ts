// The Board strip is one row (a smart one-liner on tablet and
// mobile): at 1366, 1024 and 820 on a touch screen, 1366 with a
// mouse, and right to left, the tabs and the controls share one line, nothing scrolls the page sideways, the open tab is
// whole in view, the controls are whole and in the window, and on a touch screen every one is a 44 px target. The
// controls step down by the room the row has (Strip.tsx): a wide window keeps every word; while a tab is past an edge,
// the Board menu lists every Board; the tile note's short form opens the whole sentence on a press and is named by it.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

const surface = (page: Page) => page.getByRole('group', { name: strings.tiles });
const frame = (page: Page, n: number) => page.locator(`iframe[title="terminal-${n} on atlas"]`);
const row = (page: Page) => page.locator('[data-strip-step]');
const paged = (shown: number, count: number) => strings['overflow.paged'].replace('{{shown}}', String(shown)).replace('{{count}}', String(count));

/** Main with terminal-1 on atlas and copies up to 6 tiles (a page of 4 and a page of 2), then 4 more Boards, back on Main. */
async function board(page: Page) {
  await gotoHub(page, '/board');
  await page.getByRole('button', { name: strings['board.addProgram'] }).first().click(); // reason: the empty Board's welcome draws its own Add a program beside the strip's
  await page.getByRole('row', { name: /^atlas/ }).click();
  await page.getByRole('row', { name: /^Terminal/ }).click();
  await page.getByRole('row', { name: /^terminal-1/ }).click();
  await expect(frame(page, 1)).toBeAttached();
  for (let n = 2; n <= 6; n++) {
    await surface(page).focus();
    await page.keyboard.press('.');
    await page.getByRole('menuitem', { name: strings['tile.duplicate'] }).click();
    await expect(frame(page, n)).toBeAttached();
  }
  for (let k = 0; k < 4; k++) {
    await page.getByRole('button', { name: strings['board.new'], exact: true }).click();
  }
  await page.getByRole('tab', { name: strings['board.main'] }).click();
  await expect(page.getByRole('tab', { name: strings['board.main'] })).toHaveAttribute('aria-selected', 'true');
}

/**
 * One row: the strip row is one control high, and the tab list and every control sit inside it. The pointer is moved off
 * the row first: a window that narrows slides a button under the resting pointer, and the kit's hover lift (Button.module.css,
 * translateY(-1px)) then draws it 1 px above the row's box, which is the hover look, not a second line.
 */
async function oneRow(page: Page, coarse: boolean) {
  const vp = page.viewportSize()!;
  await page.mouse.move(1, vp.height - 1);
  await expect.poll(() => row(page).evaluate((el, c) => {
    const r = el.getBoundingClientRect();
    // One control (32 with a mouse, 44 by touch) plus the 8 px the controls keep above the strip's line.
    const tall = c ? 52 : 40;
    const inside = [...el.querySelectorAll('[role="tablist"], [data-tabs-before], [data-strip-new], [data-strip-end] > *')]
      .map((n) => n.getBoundingClientRect())
      .filter((b) => b.width > 0)
      .every((b) => b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5);
    return { oneHigh: r.height <= tall + 0.5, inside };
  }, coarse)).toEqual({ oneHigh: true, inside: true });
}

/**
 * The folder line under the row is the row's own inset shadow (board.module.css .stripRow, as the kit bar's), drawn
 * inside the row's box: it never adds height, so it is not a second header row. The tile area starts where the row ends,
 * with nothing between.
 */
async function folderLine(page: Page) {
  const tiles = (await surface(page).boundingBox())!;
  const r = await row(page).evaluate((el, top) => {
    const shadow = getComputedStyle(el).boxShadow;
    const box = el.getBoundingClientRect();
    return { inset: /inset/.test(shadow) && /-\d*\.?\d+px/.test(shadow), tilesAfter: top >= box.bottom - 0.5 && top - box.bottom <= 24 };
  }, tiles.y);
  expect(r).toEqual({ inset: true, tilesAfter: true });
}

/** The open tab whole inside the strip's scroller (unless `tabMayScroll`: a name wider than the scroller); every control
 * whole inside the window and inside the row's own box (the Board region, which a side panel can make narrower than the
 * window) and, on touch, 44 x 44. */
async function whole(page: Page, coarse: boolean, tabMayScroll = false) {
  const r = await row(page).evaluate((el, c) => {
    const box = el.getBoundingClientRect();
    const tab = el.querySelector('[role="tab"][aria-selected="true"]')!.getBoundingClientRect();
    const sc = el.querySelector('[role="tablist"]')!.parentElement!.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const small: string[] = [];
    const out: string[] = [];
    for (const b of el.querySelectorAll<HTMLElement>('[data-strip-new], [data-strip-end] button')) {
      const q = b.getBoundingClientRect();
      if (q.width === 0) continue;
      const name = b.getAttribute('aria-label') ?? (b.textContent ?? '').trim();
      if (q.left < -0.5 || q.right > vw + 0.5 || q.left < box.left - 0.5 || q.right > box.right + 0.5) out.push(name);
      if (c && (q.width < 43.5 || q.height < 43.5)) small.push(name);
    }
    return { tabIn: tab.left >= sc.left - 1 && tab.right <= sc.right + 1, out, small };
  }, coarse);
  expect({ ...r, tabIn: tabMayScroll || r.tabIn }).toEqual({ tabIn: true, out: [], small: [] });
}

for (const [w, h, coarse, rtl] of [
  [1366, 1024, false, false],
  [1366, 1024, true, false],
  [1024, 768, true, false],
  [820, 1180, true, false],
  [1024, 768, true, true],
] as Array<[number, number, boolean, boolean]>) {
  const name = `${w} ${coarse ? 'touch' : 'mouse'}${rtl ? ' right to left' : ''}`;
  test.describe(name, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: coarse, isMobile: coarse });
    test(`at ${name}: the Board strip is one row, nothing scrolls sideways, the open tab and every control are whole`, async ({ page }) => {
      test.setTimeout(150_000);
      await board(page);
      if (rtl) await page.evaluate(() => void (document.documentElement.dir = 'rtl'));
      await oneRow(page, coarse);
      await folderLine(page);
      await noSideScroll(page);
      await whole(page, coarse);
      // The tile note: the whole sentence in words, or its short form, which is named by it and opens it on a press.
      const sentence = paged(2, 6);
      const words = page.getByText(sentence, { exact: true });
      const short = page.getByRole('button', { name: sentence, exact: true });
      await expect(words.or(short).first()).toBeVisible(); // reason: the short form's button holds the sentence as screen-reader text too, so both match
      if (await short.isVisible()) {
        await short.click();
        await expect(page.getByRole('dialog').getByText(sentence, { exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
      }
      for (const theme of ['light', 'dark']) {
        await page.evaluate((t) => { document.documentElement.setAttribute('data-hx-theme', t); }, theme);
        // The geometry again in each theme: a theme that changed a size would show here, not only in the shot.
        await oneRow(page, coarse);
        await noSideScroll(page);
        await whole(page, coarse);
        await page.mouse.move(2, 2);
        await page.screenshot({ path: test.info().outputPath(`strip-${w}-${coarse ? 'touch' : 'mouse'}${rtl ? '-rtl' : ''}-${theme}.png`), clip: { x: 0, y: 0, width: w, height: 160 } });
      }
    });
  });
}

// A Board name at its 32-character limit (BoardView's rename maxLength): the row stays one row and every control stays
// whole at tablet widths; the open tab may be wider than the tabs' room then, which the kit strip scrolls.
test.describe('a 32-character Board name', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
  test('at 820, 700 and 660 on a touch screen: one row, nothing scrolls sideways, every control whole', async ({ page }) => {
    test.setTimeout(150_000);
    await board(page);
    const name = 'Quarterly numbers and the old one';
    expect(name.length).toBeGreaterThanOrEqual(32);
    // Boards ▾ > Rename: the rename in place on the open tab (as F2 there).
    await page.getByRole('button', { name: strings.boards, exact: true }).click();
    await page.getByRole('menuitem', { name: new RegExp(`^${strings['board.rename']}`) }).click();
    const field = page.getByRole('textbox', { name: new RegExp('^' + strings['board.rename']) });
    await expect(field).toBeFocused();
    await field.fill(name);
    await field.press('Enter');
    const long = name.slice(0, 32);
    await expect(page.getByRole('tab', { name: long })).toHaveAttribute('aria-selected', 'true');
    for (const width of [820, 700, 660]) {
      await page.setViewportSize({ width, height: 1180 });
      await oneRow(page, true);
      await noSideScroll(page);
      await whole(page, true, true);
    }
  });
});

test.describe('the steps', () => {
  test.use({ viewport: { width: 2400, height: 1000 }, hasTouch: true, isMobile: true });
  test('on a touch screen, a wide window keeps every word; narrowing steps down in order, the tabs never squeezed past the open tab, and widening comes back', async ({ page }) => {
    test.setTimeout(150_000);
    await board(page);
    const step = () => row(page).getAttribute('data-strip-step');
    const add = page.getByRole('button', { name: strings['board.addProgram'], exact: true }).first(); // reason: the chips row's + (a phone, or a paged Board) has the same name, after the strip's or the empty slot's own
    await expect.poll(step).toBe('0');
    await expect(add).toHaveText(new RegExp(strings['board.addProgram']));
    await expect(page.getByText(paged(2, 6), { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: strings['board.new'], exact: true })).toBeVisible();
    // Narrowing: each step only after the one before, one row at every width, the open tab whole.
    let last = 0;
    for (const width of [2400, 1800, 1500, 1300, 1100, 950, 820, 700, 660]) {
      await page.setViewportSize({ width, height: 1000 });
      await oneRow(page, true);
      await noSideScroll(page);
      await whole(page, true);
      const now = Number(await step());
      expect(now, `step at ${width}`).toBeGreaterThanOrEqual(last);
      last = now;
      // Even out tiles leaves at step 1 (Layout's Equalise does it); Layout is its icon from step 2; Boards ▾ from step 3;
      // Add a program keeps a word at every step, "Add" at the last (never a bare plus beside New Board's).
      if (now >= 1) await expect(page.getByRole('button', { name: strings['overflow.even'], exact: true })).toHaveCount(0);
      if (now >= 2) await expect(page.getByRole('button', { name: strings.layout, exact: true })).toHaveText('');
      if (now >= 3) await expect(page.getByRole('button', { name: strings.boards, exact: true })).toHaveText('');
      else await expect(page.getByRole('button', { name: strings.boards, exact: true })).toHaveText(strings.boards);
      if (now >= 4) await expect(add).toHaveText(new RegExp('^' + strings['board.addShort'] + '$'));
      else await expect(add).toHaveText(new RegExp(strings['board.addProgram']));
      // New Board never leaves the row (the drop target for a tile); nothing moves into the Board menu.
      await expect(page.getByRole('button', { name: strings['board.new'], exact: true })).toBeVisible();
    }
    expect(last).toBe(4);
    // At the last step, with tabs past an edge, Boards ▾ (its icon) lists every Board, as at every step.
    await page.getByRole('button', { name: strings.boards, exact: true }).click();
    const five = page.getByRole('menuitemradio', { name: new RegExp('^Board 5 · ') });
    await expect(five).toBeVisible();
    await five.click();
    await expect(page.getByRole('tab', { name: 'Board 5' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: strings['board.main'] }).click();
    await page.setViewportSize({ width: 2400, height: 1000 });
    await expect.poll(step).toBe('0');
  });
});

// Nine Boards, the most a realm holds: the row stays one row at 1440 with a mouse and at 1024 and
// 768 on a touch screen; New Board stays in the row after the tabs, soft-disabled with its reason; the tools group ends
// with Add a program. Shots at 1440 light and dark, 1024 and 768.
for (const [w, h, coarse] of [[1440, 900, false], [1024, 768, true], [768, 1024, true]] as Array<[number, number, boolean]>) {
  test.describe(`nine Boards at ${w}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: coarse, isMobile: coarse });
    test(`at ${w} ${coarse ? 'touch' : 'mouse'} with nine Boards: one row, New Board soft-disabled after the tabs, every control whole`, async ({ page }) => {
      test.setTimeout(180_000);
      await board(page);
      for (let k = 0; k < 4; k++) await page.getByRole('button', { name: strings['board.new'], exact: true }).click();
      await expect(page.getByRole('tab')).toHaveCount(9);
      await page.getByRole('tab', { name: strings['board.main'] }).click();
      const make = page.getByRole('button', { name: strings['board.new'], exact: true });
      await expect(make).toHaveAttribute('aria-disabled', 'true');
      await expect(make).toHaveAccessibleDescription(/9 Boards/);
      const tools = page.getByRole('group', { name: strings['board.tools'] });
      await expect(tools.getByRole('button', { name: strings['board.addProgram'], exact: true })).toBeVisible();
      await oneRow(page, coarse);
      await noSideScroll(page);
      await whole(page, coarse);
      await expect(make).toBeInViewport({ ratio: 1 });
      for (const theme of w === 1440 ? ['light', 'dark'] : ['light']) {
        await page.evaluate((t) => { document.documentElement.setAttribute('data-hx-theme', t); }, theme);
        await page.mouse.move(2, 2);
        await page.screenshot({ path: test.info().outputPath(`nine-${w}-${theme}.png`), clip: { x: 0, y: 0, width: w, height: 160 } });
      }
    });
  });
}

// The end slot is filled by Broadcast, which renders on its own (its Live words grow with the viewer count): a wider
// slot steps the row down at once, and when it goes the row comes back. The slot's
// content is grown here by hand (a live broadcast needs a screen share).
test.describe('a wider Broadcast in the slot', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
  test('at 1024 touch: a slot that grows steps the row down, one row and every control whole; it shrinks back', async ({ page }) => {
    test.setTimeout(150_000);
    await board(page);
    const step = async () => Number(await row(page).getAttribute('data-strip-step'));
    await oneRow(page, true);
    const before = await step();
    await page.locator('[data-strip-slot]').evaluate((el) => {
      const b = document.createElement('button');
      b.setAttribute('data-probe', '');
      b.setAttribute('aria-label', 'Live · 1234 watching · Broadcast');
      b.textContent = 'Live · 1234 watching';
      b.style.cssText = 'inline-size: 100px; block-size: 44px; flex: none; overflow: hidden; white-space: nowrap;';
      el.append(b);
    });
    await expect.poll(step).toBeGreaterThan(before);
    await oneRow(page, true);
    await noSideScroll(page);
    await whole(page, true);
    await page.locator('[data-probe]').evaluate((el) => el.remove());
    await expect.poll(step).toBe(before);
    await oneRow(page, true);
  });
});
