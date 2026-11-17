// Playwright: on a Bot's Activity tab the chat box is at the
// bottom, full width: its dock is the tab's last row and spans the whole tab (under the log and, on a wide pane, the
// details rail). The log has no scroll of its own and the dock is held at the bottom of the one scroll:
// at the scroll's start the box is already wholly on screen;
// it never covers the last row: scrolled to the end, the newest row (or the waiting card that ends the thread) sits wholly above the box and both are on screen (the
// viewport cut to the scroller), the box above the main area's end padding (the phone's bottom bar and the action button's
// room), and the dock is back in its row, the tab's last. A log with no rows fails: the end checks never pass on nothing.
// Measured in the browser, left-to-right and right-to-left.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const URL = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

const measure = (page: Page) =>
  page.evaluate(() => {
    const dock = document.querySelector('#hub-main [data-say-dock]');
    const grid = dock?.parentElement;
    const log = grid?.querySelector('ol');
    if (!dock || !grid || !log) return null;
    const d = dock.getBoundingClientRect();
    const g = grid.getBoundingClientRect();
    const rail = grid.querySelector(':scope > aside');
    const railBottom = rail && getComputedStyle(rail).display !== 'none' ? rail.getBoundingClientRect().bottom : -Infinity;
    // The thread's newest content: the waiting card when one ends the thread (it sits directly above the box), else
    // the log's last row.
    const rows = log.querySelectorAll(':scope > li');
    const newest = (grid.querySelector('[data-card-end]') ?? rows[rows.length - 1])?.getBoundingClientRect();
    if (!newest) return null;
    // The visible box: the viewport, cut to the nearest scroller and to the main area less its end padding; the log's
    // own box cuts the row's top too.
    const main = document.querySelector('#hub-main')!;
    const m = main.getBoundingClientRect();
    let sc: Element | null = grid.parentElement;
    while (sc && !(getComputedStyle(sc).overflowY === 'auto' && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement;
    const scr = (sc ?? main).getBoundingClientRect();
    const visTop = Math.max(0, scr.top, m.top);
    const visBottom = Math.min(window.innerHeight, scr.bottom, m.bottom - (Number.parseFloat(getComputedStyle(main).paddingBlockEnd) || 0));
    return {
      left: d.left - g.left,
      right: g.right - d.right,
      gridEnd: g.bottom - d.bottom,
      overLog: log.getBoundingClientRect().bottom - d.top,
      overRail: railBottom - d.top,
      newestOver: newest.bottom - d.top,
      newestTop: newest.top - Math.max(visTop, log.getBoundingClientRect().top),
      // Taller than the room above the box (a long card on a phone): its top cannot be on screen with its end.
      newestTall: newest.height > d.top - visTop + 1,
      newestBelow: newest.bottom - visBottom,
      boxAbove: visTop - d.top,
      boxBelow: d.bottom - visBottom,
    };
  });

const toEnd = (page: Page) =>
  page.evaluate(() => {
    const grid = document.querySelector('#hub-main [data-say-dock]')!.parentElement!;
    for (let el: Element | null = grid; el; el = el.parentElement) if (getComputedStyle(el).overflowY === 'auto') el.scrollTop = el.scrollHeight;
  });

// The scroll's start: the log opens at its end, so the start is a scroll away.
const toStart = (page: Page) =>
  page.evaluate(() => {
    const grid = document.querySelector('#hub-main [data-say-dock]')!.parentElement!;
    for (let el: Element | null = grid; el; el = el.parentElement) if (getComputedStyle(el).overflowY === 'auto') el.scrollTop = 0;
  });

// No box inside the tab scrolls on its own: the log, the details and the dock all move with the one scroll.
const ownScrollers = (page: Page) =>
  page.evaluate(() => {
    const grid = document.querySelector('#hub-main [data-say-dock]')!.parentElement!;
    return Array.from(grid.querySelectorAll<HTMLElement>('*')).filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1 && !el.closest('[data-say-dock]')).map((el) => `${el.tagName}.${el.className}`);
  });

for (const [width, height, dir] of [[1440, 900, 'ltr'], [1440, 900, 'rtl'], [2400, 1200, 'ltr'], [390, 844, 'ltr']] as const) {
  test(`the chat box is the tab's last row, full width, and held on screen, covering no last row, at ${width} px ${dir}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await gotoHub(page, URL);
    if (dir === 'rtl') await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
    await expect(page.getByRole('textbox', { name: 'Message the Bot' })).toBeVisible();
    expect(await ownScrollers(page), 'nothing in the tab scrolls on its own').toEqual([]);
    await toStart(page);
    const top = await measure(page);
    expect(top, 'a chat box dock under a log with rows').not.toBeNull();
    expect(Math.abs(top!.left), 'starts at the tab\'s start').toBeLessThanOrEqual(1);
    expect(Math.abs(top!.right), 'ends at the tab\'s end (under the rail too)').toBeLessThanOrEqual(1);
    expect(top!.boxAbove, 'held on screen at the scroll\'s start: the box\'s top is on screen').toBeLessThanOrEqual(1);
    expect(top!.boxBelow, 'held on screen at the scroll\'s start: the box\'s bottom is on screen').toBeLessThanOrEqual(1);
    await toEnd(page);
    const end = await measure(page);
    expect(Math.abs(end!.gridEnd), 'at the end, the tab\'s last row').toBeLessThanOrEqual(1);
    expect(end!.overLog, 'at the end, below the log (covers none of it)').toBeLessThanOrEqual(0);
    expect(end!.newestOver, 'the newest row ends above the box').toBeLessThanOrEqual(0);
    expect(end!.newestTall || end!.newestTop >= -1, 'the newest row\'s top is on screen (unless it is taller than the room above the box)').toBe(true);
    expect(end!.newestBelow, 'the newest row\'s bottom is on screen').toBeLessThanOrEqual(1);
    expect(end!.boxAbove, 'the box\'s top is on screen').toBeLessThanOrEqual(1);
    expect(end!.boxBelow, 'the box\'s bottom is on screen, above the bar and the action button\'s room').toBeLessThanOrEqual(1);
  });
}
