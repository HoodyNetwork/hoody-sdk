// Playwright, wide and at 390 px: the Activity tab in one scroll, measured in a
// browser. The waiting card sits at the end of the thread, directly above the chat box; at 390 px the Activity head wraps so
// Archive is never cut, and after scrolling to the newest row the tab strip and the chat box are both on screen (the Bot header
// itself scrolls away on a phone); an empty or failed log leaves no blank band under the head.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const URL = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

const toEnd = (page: Page) =>
  page.evaluate(() => {
    const grid = document.querySelector('#hub-main [data-say-dock]')!.parentElement!;
    for (let el: Element | null = grid; el; el = el.parentElement) if (getComputedStyle(el).overflowY === 'auto') el.scrollTop = el.scrollHeight;
  });

for (const [width, height] of [[1440, 900], [390, 844]] as const) {
  test(`the waiting card sits directly above the chat box at the end of the thread at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await gotoHub(page, URL, { state: 'waitingApprove' });
    await expect(page.getByRole('textbox', { name: 'Message the Bot' })).toBeVisible();
    await toEnd(page);
    const g = await page.evaluate(() => {
      const dock = document.querySelector('#hub-main [data-say-dock]')!.getBoundingClientRect();
      const wrap = document.querySelector('#hub-main [data-gate-wrap]');
      const log = document.querySelector('#hub-main [data-say-dock]')!.parentElement!.querySelector('ol')!.getBoundingClientRect();
      if (!wrap) return null;
      const w = wrap.getBoundingClientRect();
      return { gap: dock.top - w.bottom, afterLog: w.top - log.bottom };
    });
    expect(g, 'a card wrap in the Activity tab').not.toBeNull();
    expect(g!.afterLog, 'after the log').toBeGreaterThanOrEqual(0);
    expect(g!.gap, 'not under the box').toBeGreaterThanOrEqual(0);
    expect(g!.gap, 'directly above the box (one gap)').toBeLessThanOrEqual(40);
  });
}

test('opened, the log is at its end: the waiting card is wholly above the chat box and no Waiting-for-you bar shows at 1440 px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, URL, { state: 'waitingApprove' });
  await expect(page.getByRole('textbox', { name: 'Message the Bot' })).toBeVisible();
  // The bar names a card that is not on screen; here the card is, so the dock carries no bar (once the page has settled).
  await expect(page.locator('#hub-main [data-say-dock] [data-needs-bar]')).toHaveCount(0);
  const g = await page.evaluate(() => {
    const dock = document.querySelector('#hub-main [data-say-dock]')!.getBoundingClientRect();
    const card = document.querySelector('#hub-main [data-card-end]')!.getBoundingClientRect();
    return { over: card.bottom - dock.top };
  });
  expect(g.over, 'the card ends above the box').toBeLessThanOrEqual(0);
});

test('at 390 px the Activity head wraps: Archive is wholly inside the pane, the head is at most two rows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, URL, { state: 'idle' });
  const archive = page.getByRole('button', { name: 'Archive' });
  await expect(archive).toBeVisible();
  const g = await archive.evaluate((el) => {
    const head = el.closest('h3')?.parentElement ?? el.parentElement!.closest('div')!;
    const h = head.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    // Rows: tops within 8 px of a row's first top are on that row (a fixed /8 grid split one row in two when the page's
    // scroll put its tops across a grid line).
    const tops = Array.from(head.children).map((c) => c.getBoundingClientRect().top).sort((x, y) => x - y);
    let rows = 0;
    let rowTop = -Infinity;
    for (const top of tops) if (top > rowTop + 8) { rows += 1; rowTop = top; }
    return { right: b.right, left: b.left, headRight: h.right, headLeft: h.left, rows };
  });
  expect(g.right, 'Archive ends inside the screen').toBeLessThanOrEqual(390);
  expect(g.right, 'Archive ends inside its head').toBeLessThanOrEqual(g.headRight + 1);
  expect(g.left, 'Archive starts inside its head').toBeGreaterThanOrEqual(g.headLeft - 1);
  expect(g.rows, 'the head is at most two rows').toBeLessThanOrEqual(2);
});

test('at 390x844, after scrolling to the newest row, the tab strip and the chat box are both on screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, URL, { state: 'idle' });
  await expect(page.getByRole('textbox', { name: 'Message the Bot' })).toBeVisible();
  await toEnd(page);
  const g = await page.evaluate(() => {
    // The visible box: the viewport cut to the nearest scroller and to the main area less its end padding.
    const main = document.querySelector('#hub-main')!;
    const m = main.getBoundingClientRect();
    const dockEl = document.querySelector('#hub-main [data-say-dock]')!;
    let sc: Element | null = dockEl.parentElement;
    while (sc && !(getComputedStyle(sc).overflowY === 'auto' && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement;
    const r = (sc ?? main).getBoundingClientRect();
    const top = Math.max(0, r.top, m.top);
    const bottom = Math.min(window.innerHeight, r.bottom, m.bottom - (Number.parseFloat(getComputedStyle(main).paddingBlockEnd) || 0));
    const tabs = document.querySelector('#hub-main [role="tablist"]')!.getBoundingClientRect();
    const dock = dockEl.getBoundingClientRect();
    return { tabsTop: tabs.top - top, tabsBottom: tabs.bottom - bottom, dockTop: dock.top - top, dockBottom: dock.bottom - bottom };
  });
  expect(g.tabsTop, 'the tab strip\'s top is on screen').toBeGreaterThanOrEqual(-1);
  expect(g.tabsBottom, 'the tab strip\'s bottom is on screen').toBeLessThanOrEqual(1);
  expect(g.dockTop, 'the box\'s top is on screen').toBeGreaterThanOrEqual(-1);
  expect(g.dockBottom, 'the box\'s bottom is on screen').toBeLessThanOrEqual(1);
});

for (const state of ['logEmpty', 'logError'] as const) {
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    test(`an ${state === 'logEmpty' ? 'empty' : 'unread'} log leaves no blank band under the head at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoHub(page, URL, { state });
      const head = page.getByRole('heading', { name: 'Activity', exact: true });
      await expect(head).toBeVisible();
      const g = await head.evaluate((h) => {
        const col = h.parentElement!.parentElement!;
        const kids = Array.from(col.children);
        const i = kids.indexOf(h.parentElement!);
        const next = kids[i + 1];
        return { gap: next ? next.getBoundingClientRect().top - h.parentElement!.getBoundingClientRect().bottom : -1 };
      });
      expect(g.gap, 'the state starts right under the head').toBeGreaterThanOrEqual(0);
      expect(g.gap, 'no band between the head and the state').toBeLessThanOrEqual(24);
    });
  }
}

// Show (the Waiting-for-you bar) brings the card wholly above the sticky chat box, not merely into the scroll.
for (const [width, height] of [[1440, 900], [390, 844]] as const) {
  test(`Show puts the waiting card wholly between the top of the scroll and the chat box at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await gotoHub(page, URL, { state: 'waitingApprove' });
    await expect(page.getByRole('textbox', { name: 'Message the Bot' })).toBeVisible();
    // Scrolled so the card's start is just above the box: in the scroll's own box, but under the dock.
    await page.evaluate(() => {
      const dock = document.querySelector('#hub-main [data-say-dock]')!;
      const card = document.querySelector('#hub-main [data-card-end]')!;
      let sc: Element | null = dock.parentElement;
      while (sc && !(getComputedStyle(sc).overflowY === 'auto' && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement;
      const el = (sc ?? document.scrollingElement)!;
      el.scrollTop += card.getBoundingClientRect().top - dock.getBoundingClientRect().top + 20;
    });
    const bar = page.locator('#hub-main [data-say-dock] [data-needs-bar]');
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: 'Show' }).click();
    // The space: under the tab strip (stuck at the top on a phone) and above the box. A card taller than that space starts at
    // its top; any other card is wholly inside it. Either way the bar has done its job and goes.
    const g = await page.evaluate(() => {
      const dock = document.querySelector('#hub-main [data-say-dock]')!.getBoundingClientRect();
      const card = document.querySelector('#hub-main [data-card-end]')!.getBoundingClientRect();
      const tabs = document.querySelector('#hub-main [role="tablist"]')!.getBoundingClientRect();
      const m = document.querySelector('#hub-main')!.getBoundingClientRect();
      const top = Math.max(0, m.top, tabs.bottom);
      return { tall: card.height > dock.top - top, over: card.bottom - dock.top, top: card.top - top };
    });
    expect(g.top, 'the card starts in the space, under the tab strip').toBeGreaterThanOrEqual(-1);
    if (g.tall) expect(g.top, 'a tall card starts at the top of the space').toBeLessThanOrEqual(12);
    else expect(g.over, 'the card ends above the box').toBeLessThanOrEqual(0);
    await expect(bar).toHaveCount(0);
  });
}

// Across the layout's phone breakpoint another element scrolls the log; a reader who scrolled up there is never
// pulled back to the end by the next resize.
for (const [from, to] of [[[1440, 900], [390, 844]], [[390, 844], [1440, 900]]] as const) {
  test(`scrolled up after a resize from ${from[0]} to ${to[0]} px, the next resize leaves the reader where they are`, async ({ page }) => {
    await page.setViewportSize({ width: from[0], height: from[1] });
    await gotoHub(page, URL, { state: 'waitingApprove' });
    await expect(page.getByRole('textbox', { name: 'Message the Bot' })).toBeVisible();
    await page.setViewportSize({ width: to[0], height: to[1] });
    await expect(page.getByRole('textbox', { name: 'Message the Bot' })).toBeVisible();
    const scroller = () =>
      page.evaluate(() => {
        let sc: Element | null = document.querySelector('#hub-main [data-say-dock]')!.parentElement;
        while (sc && !(getComputedStyle(sc).overflowY === 'auto' && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement;
        const el = (sc ?? document.scrollingElement)!;
        return { top: el.scrollTop, end: el.scrollHeight - el.clientHeight };
      });
    await page.mouse.move(to[0] / 2, to[1] / 2);
    await page.mouse.wheel(0, -100000);
    await expect.poll(async () => (await scroller()).top, { message: 'scrolled to the top' }).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: to[0] - 10, height: to[1] - 20 });
    await expect(page.getByRole('textbox', { name: 'Message the Bot' })).toBeAttached();
    // Two frames for the resize to be observed and acted on.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const g = await scroller();
    expect(g.end, 'the thread is longer than the screen').toBeGreaterThan(100);
    expect(g.top, 'still at the top').toBeLessThanOrEqual(1);
  });
}

// Another Bot opened from the list while the Activity tab shows: its thread opens at its end, whatever the last one's reader did.
test('scrolled up in one Bot, the next Bot opened from the list opens at the end of its thread', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 480 });
  await gotoHub(page, URL, { state: 'waitingApprove' });
  await expect(page.getByRole('textbox', { name: 'Message the Bot' })).toBeVisible();
  const scroller = () =>
    page.evaluate(() => {
      let sc: Element | null = document.querySelector('#hub-main [data-say-dock]')!.parentElement;
      while (sc && !(getComputedStyle(sc).overflowY === 'auto')) sc = sc.parentElement;
      const el = (sc ?? document.scrollingElement)!;
      return { top: el.scrollTop, end: el.scrollHeight - el.clientHeight };
    });
  await page.evaluate(() => {
    let sc: Element | null = document.querySelector('#hub-main [data-say-dock]')!.parentElement;
    while (sc && !(getComputedStyle(sc).overflowY === 'auto')) sc = sc.parentElement;
    (sc ?? document.scrollingElement)!.scrollTop = 0;
  });
  await expect.poll(async () => (await scroller()).top).toBeLessThanOrEqual(1);
  const here = /sel=([^&]*)/.exec(page.url())?.[1];
  // The list beside the pane (1440 px): another Bot's row.
  await page.getByRole('table', { name: strings.title }).getByRole('row', { name: /Support/ }).click();
  await expect.poll(() => /sel=([^&]*)/.exec(page.url())?.[1]).not.toBe(here);
  await expect(page.getByRole('textbox', { name: 'Message the Bot' })).toBeVisible();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const g = await scroller();
  expect(g.end, 'the new thread is longer than the screen').toBeGreaterThan(100);
  expect(g.end - g.top, 'at the end of the new thread').toBeLessThanOrEqual(24);
});
