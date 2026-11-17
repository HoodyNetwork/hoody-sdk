// Playwright: a strip chevron (StripMore) within one step of its edge reaches it in ONE press, left
// to right and right to left, light and dark. The other side's chevron mounts or unmounts on the way and changes the
// strip's width; a press that stopped short left both chevrons showing. Farther than a step, a press moves one step and
// stops short of the edge. Measured on the Board strip: nine Boards at 660, with a test style giving every tab one width
// (and a thin padding) worked out from the strip's own room, so the tabs overflow by about 40 px: well over the edges' 1 px tolerance and less
// than a step, whatever the Board's tools take of the row (the tools leave the tabs far less of it than 84 px
// tabs need); the far case widens the tabs more, since Boards stop at nine.
// Scroll positions need a real browser, not jsdom.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import board from '../../pages/board/strings.en.json';

interface Strip {
  /** Distance from the strip's start (positive in both directions). */
  scrolled: number;
  max: number;
  /** The scroller's width (a chevron press steps 60% of it, at least 80 px). A chevron that mounts narrows it. */
  client: number;
  /** The strip's whole box (scroller and chevrons): only the tabs' own overflow changes the scroller, never this. */
  box: number;
  /** The chevrons shown, by logical side. */
  more: string[];
}

const strip = (page: Page) => page.getByRole('tablist', { name: board['board.tabs'] });

const read = (page: Page): Promise<Strip> =>
  strip(page).evaluate((list) => {
    const sc = list.parentElement!;
    return {
      scrolled: Math.round(Math.abs(sc.scrollLeft)),
      max: sc.scrollWidth - sc.clientWidth,
      client: sc.clientWidth,
      box: sc.parentElement!.clientWidth,
      more: [...sc.parentElement!.querySelectorAll('[data-more]')].map((b) => b.getAttribute('data-more') ?? ''),
    };
  });

/** Waits until the strip stops moving (two equal reads a few frames apart), then returns it. */
async function settled(page: Page): Promise<Strip> {
  let last = '';
  let now = await read(page);
  await expect
    .poll(async () => {
      last = JSON.stringify(now);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
      now = await read(page);
      return JSON.stringify(now) === last;
    }, { timeout: 10_000 })
    .toBe(true);
  return now;
}

async function press(page: Page, side: 'start' | 'end'): Promise<Strip> {
  // The pointer off the strip, so no hover state rides along.
  await page.mouse.move(page.viewportSize()!.width / 2, 790);
  await page.locator(`[data-more="${side}"]`).click();
  return settled(page);
}

test.use({ viewport: { width: 660, height: 800 } });

for (const theme of ['light', 'dark'] as const)
  for (const rtl of [false, true])
    test(`one chevron press reaches each edge, a far press steps (${theme}, ${rtl ? 'right to left' : 'left to right'})`, async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, '/board', { theme });
      await expect(strip(page).getByRole('tab', { name: new RegExp(board['board.main']) })).toBeVisible({ timeout: 30_000 });
      if (rtl) await page.evaluate(() => void (document.documentElement.dir = 'rtl'));
      const add = page.getByRole('button', { name: board['board.new'], exact: true });
      for (let i = 0; i < 8; i++) await add.click();
      const tabs = strip(page).getByRole('tab');
      await expect(tabs).toHaveCount(9, { timeout: 15_000 });
      // One width for every tab, settled on the strip as drawn (the scroller hugs its tabs and takes the room it has):
      // nine of them overflow the scroller by 30-50 px.
      await strip(page).evaluate(async (list) => {
        const style = document.createElement('style');
        document.head.append(style);
        const sc = list.parentElement!;
        const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
        // Border box, so the width set is the tab's whole width, and never under 12 px (a negative width would drop the rule
        // and leave the tabs their own widths). A thin padding: at 660 the Boards menu and the Board's tools leave the tabs
        // under 200 px, which nine tabs at their own padding overflow by more than a step.
        let x = Math.ceil(tabs.reduce((w, t) => w + t.offsetWidth, 0) / tabs.length);
        for (let i = 0; i < 16; i++) {
          x = Math.max(12, x);
          style.textContent = `[role="tablist"] [role="tab"] { box-sizing: border-box !important; padding-inline: 2px !important; min-width: ${x}px !important; max-width: ${x}px !important; overflow: hidden !important; }`;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const over = sc.scrollWidth - sc.clientWidth;
          if (over >= 30 && over <= 50) return;
          x += Math.trunc((40 - over) / tabs.length) || (over < 30 ? 1 : -1);
        }
        throw new Error(`no tab width overflows the strip by 30-50 px: ${x} px, ${sc.scrollWidth - sc.clientWidth} over`);
      });
      await tabs.nth(0).click(); // the first Board: the strip back at its start
      await page.mouse.move(330, 790);
      await page.keyboard.press('Escape');

      const a = await settled(page);
      expect(a.max - a.scrolled, `nine Boards overflow at 660 by more than the 1 px tolerance: ${JSON.stringify(a)}`).toBeGreaterThan(1);
      expect(a.max, `and by less than a step: ${JSON.stringify(a)}`).toBeLessThan(Math.max(80, a.client * 0.6));
      expect(a.scrolled, `at the start: ${JSON.stringify(a)}`).toBeLessThanOrEqual(1);
      expect(a.more, `only the end chevron at the start: ${JSON.stringify(a)}`).toEqual(['end']);

      const b = await press(page, 'end');
      expect(b.scrolled, `one end press reaches the end: ${JSON.stringify(b)}`).toBeGreaterThanOrEqual(b.max - 1);
      expect(b.more, `only the start chevron at the end: ${JSON.stringify(b)}`).toEqual(['start']);

      const c = await press(page, 'start');
      expect(c.scrolled, `one start press reaches the start: ${JSON.stringify(c)}`).toBeLessThanOrEqual(1);
      expect(c.more, `only the end chevron at the start: ${JSON.stringify(c)}`).toEqual(['end']);

      await page.addStyleTag({ content: '[role="tablist"] [role="tab"] { min-width: 200px !important; max-width: none !important; }' });
      const d = await settled(page);
      expect(d.max, `wide tabs overflow by more than a step: ${JSON.stringify(d)}`).toBeGreaterThan(600);
      expect(d.scrolled).toBeLessThanOrEqual(1);
      const e = await press(page, 'end');
      // One step is 60% of the scroller's width at the press (at least 80 px). Right to left, the start chevron that mounts on
      // the way sits on the origin side, so the origin moves by its width: the same step reads that much farther.
      const shift = rtl ? d.client - e.client : 0;
      expect(Math.abs(e.scrolled - d.scrolled - Math.max(80, d.client * 0.6) - shift), `a far press moves exactly one step: ${JSON.stringify({ d, e, shift })}`).toBeLessThanOrEqual(1);
      expect(e.scrolled, `a far press stops short of the end: ${JSON.stringify(e)}`).toBeLessThan(e.max - 1);
    });

// :1806: the chevrons follow overflow that changes inside a scroller of the same width. With the strip at its end, the
// tabs grow (a test style; a rename or a late font does the same): nothing scrolls and the scroller keeps its width, yet
// there is now more beyond the end, so the end chevron shows beside the start one.
const toEdge = (page: Page, side: 'start' | 'end') =>
  strip(page).evaluate((list, to) => {
    const sc = list.parentElement!;
    const rtl = getComputedStyle(sc).direction === 'rtl';
    sc.dispatchEvent(new Event('strip-hand-scroll'));
    sc.scrollTo({ left: to === 'start' ? 0 : (rtl ? -1 : 1) * sc.scrollWidth, behavior: 'auto' });
  }, side);

for (const rtl of [false, true])
  test(`tabs that grow with no scroll show the chevron for the new overflow (light, ${rtl ? 'right to left' : 'left to right'})`, async ({ page }) => {
    test.setTimeout(120_000);
    await gotoHub(page, '/board', { theme: 'light' });
    await expect(strip(page).getByRole('tab', { name: new RegExp(board['board.main']) })).toBeVisible({ timeout: 30_000 });
    if (rtl) await page.evaluate(() => void (document.documentElement.dir = 'rtl'));
    const add = page.getByRole('button', { name: board['board.new'], exact: true });
    for (let i = 0; i < 8; i++) await add.click();
    await expect(strip(page).getByRole('tab')).toHaveCount(9, { timeout: 15_000 });
    await page.addStyleTag({ content: '[role="tablist"] [role="tab"] { min-width: 120px !important; }' });
    await page.mouse.move(330, 790);
    await toEdge(page, 'start');
    await settled(page);
    await toEdge(page, 'end');
    const a = await settled(page);
    expect(a.scrolled, `at the end: ${JSON.stringify(a)}`).toBeGreaterThanOrEqual(a.max - 1);
    expect(a.more, `only the start chevron at the end: ${JSON.stringify(a)}`).toEqual(['start']);

    await page.addStyleTag({ content: '[role="tablist"] [role="tab"] { min-width: 200px !important; }' });
    const b = await settled(page);
    // Nothing scrolled and the strip kept its width: the chevron follows the overflow alone.
    expect(b.scrolled, `the strip did not move when the tabs grew: ${JSON.stringify({ a, b })}`).toBe(a.scrolled);
    expect(b.box, `the strip kept its width when the tabs grew (the new chevron only narrows the scroller): ${JSON.stringify({ a, b })}`).toBe(a.box);
    expect(b.max, `the tabs grew past the end: ${JSON.stringify({ a, b })}`).toBeGreaterThan(a.max + 400);
    expect(b.max - b.scrolled, `more beyond the end now: ${JSON.stringify(b)}`).toBeGreaterThan(400);
    await expect.poll(async () => (await read(page)).more.sort(), { timeout: 5_000 }).toEqual(['end', 'start']);
  });
