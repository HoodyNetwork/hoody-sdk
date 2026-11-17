// Two columns and keycap tiles: Your realms and Shortcuts end level on the same 332 px body,
// realms in two columns of 36 px rows where they fit and one on a phone, whole rows when the list scrolls, the shortcuts
// a 2 by 3 grid of equal tiles with a faint solid edge; no dashed line in either card. Checked at 1350 (the design width), 2400 and 390.
import { expect, type Locator, type Page } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import strings from './strings.en.json';

const open = async (page: Page, width: number, theme: 'light' | 'dark' = 'light') => {
  await page.setViewportSize({ width, height: 1000 });
  await gotoHub(page, '/home', { theme });
  await expect(page.locator('#hub-main button[data-realm]').first()).toBeVisible();
};
const realmsCard = (page: Page) => page.locator('#hub-main section').filter({ has: page.locator('button[data-realm]') });
const keysCard = (page: Page) => page.locator('#hub-main section').filter({ has: page.getByRole('button', { name: strings['keys.all'] }) });
const box = async (l: Locator) => (await l.boundingBox())!;
const body = (card: Locator) => card.locator('> :last-child');
type Body = { y: number; height: number };
/** Both card bodies in one read, so a card still filling in above cannot move the page between the two measures. */
const bodies = async (page: Page) => {
  const els = [await body(realmsCard(page)).elementHandle(), await body(keysCard(page)).elementHandle()];
  return page.evaluate(
    (list) =>
      list.map((el) => {
        const r = el!.getBoundingClientRect();
        return { y: r.y, height: r.height };
      }),
    els,
  );
};
/** Both bodies and both cards in one read (realms body, keys body, realms card, keys card), for the same reason. */
const bodiesAndCards = async (page: Page) => {
  const els = [
    await body(realmsCard(page)).elementHandle(), await body(keysCard(page)).elementHandle(),
    await realmsCard(page).elementHandle(), await keysCard(page).elementHandle(),
  ];
  return page.evaluate(
    (list) =>
      list.map((el) => {
        const r = el!.getBoundingClientRect();
        return { y: r.y, height: r.height };
      }),
    els,
  ) as Promise<[Body, Body, Body, Body]>;
};
/** How far apart the two bodies end, in whole pixels, from one read. A card still reaching its height can make one read
 * uneven, so the checks poll this until both read level; a real misalignment never reaches 0 and stays red. */
const levelGap = async (page: Page) => {
  const [rb, kb] = (await bodies(page)) as [Body, Body];
  return Math.round(Math.abs(rb.y + rb.height - (kb.y + kb.height)));
};
const head = (card: Locator) => card.locator('> header');
/** Forty more rows: the fixture world has three realms. A clone is the same button in the same list, so Tab and the scroll container treat it alike. */
const manyRows = (page: Page) =>
  page.locator('button[data-realm]').last().evaluate((b) => {
    const li = b.closest('li')!;
    for (let i = 0; i < 40; i++) li.after(li.cloneNode(true));
  });

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} 1350 px: the two cards share a 69 px head and a 332 px body and end level with no line under the body`, async ({ hubPage: page }) => {
    await open(page, 1350, theme);
    const [r, k] = [realmsCard(page), keysCard(page)];
    for (const c of [r, k]) {
      expect(Math.round((await box(head(c))).height)).toBe(69);
      expect(Math.round((await box(body(c))).height)).toBe(332);
      const end = await body(c).evaluate((el) => {
        const s = getComputedStyle(el);
        return `${s.borderBlockEndWidth} ${s.borderBlockEndStyle}`;
      });
      expect(end).toBe('0px none');
      // No dashed line anywhere in the card.
      expect(await c.evaluate((card) => [card, ...card.querySelectorAll('*')].filter((el) => ['Top', 'Right', 'Bottom', 'Left'].some((s) => getComputedStyle(el)[`border${s}Style` as 'borderTopStyle'] === 'dashed')).length)).toBe(0);
    }
    // Loading is over first: every home widget has replaced its loading skeleton (WidgetFrame's Suspense and each
    // widget's own Skeleton carry data-skeleton) and the fonts are in, the two things that move the layout here.
    await expect
      .poll(() => page.evaluate(() => document.fonts.status === 'loaded' && !document.querySelector('#hub-main [data-skeleton]')), { timeout: 20_000 })
      .toBe(true);
    // Then read all four boxes at once (separate reads let a card still filling in above move the page between them),
    // and only once two reads 250 ms apart are the same, so a layout still settling after the loading ends is not read mid-move.
    // Two equal reads show only that both samples matched: the boxes may have moved and come back between them, or move later.
    let last = '';
    let read: Awaited<ReturnType<typeof bodiesAndCards>> | undefined;
    await expect
      .poll(
        async () => {
          read = await bodiesAndCards(page);
          const now = JSON.stringify(read);
          const still = now === last;
          last = now;
          return still;
        },
        { timeout: 15_000, intervals: [250] },
      )
      .toBe(true);
    const [rb, kb, rc, kc] = read!;
    expect(rb.y + rb.height).toBeCloseTo(kb.y + kb.height, 0);
    expect(rc.y + rc.height).toBeCloseTo(kc.y + kc.height, 0);
    // 12 px under the body, then the card's 1 px border.
    expect(Math.round(rc.y + rc.height - (rb.y + rb.height))).toBe(13);
  });

  test(`${theme} 1350 px: realms are two columns of 36 px rows, each with a line, and All realms spans both`, async ({ hubPage: page }) => {
    await open(page, 1350, theme);
    // One read of every row, so cards still filling in above cannot move the list between two measures.
    const rows = await realmsCard(page)
      .locator('ul')
      .evaluate((ul) =>
        [...ul.children].map((li) => {
          const r = li.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height, line: getComputedStyle(li).borderBlockEndStyle };
        }),
      );
    const [all, a, b] = [rows[0]!, rows[1]!, rows[2]!];
    expect(a.y).toBeCloseTo(b.y, 0);
    expect(Math.round(b.x - (a.x + a.w))).toBe(20);
    expect(Math.round(all.w)).toBe(Math.round(a.w + b.w + 20));
    for (const r of rows) expect({ h: Math.round(r.h), line: r.line }).toEqual({ h: 36, line: 'solid' });
  });

  test(`${theme} 1350 px: the shortcuts are a 2 by 3 grid of equal tiles, each key tile with a faint solid edge, keycaps above the words, All shortcuts sixth`, async ({ hubPage: page }) => {
    await open(page, 1350, theme);
    const k = keysCard(page);
    const tiles = k.locator('dl > div');
    await expect(tiles).toHaveCount(5);
    const foot = k.locator('dl + div');
    const all = [...(await tiles.all()), foot];
    // One read of every tile, so cards still filling in above cannot move the grid between two measures.
    const boxes = await k.evaluate((card) =>
      [...card.querySelectorAll<HTMLElement>('dl > div, dl + div')].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );
    expect(boxes).toHaveLength(6);
    expect(new Set(boxes.map((b) => Math.round(b.x))).size).toBe(2);
    expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(3);
    expect(new Set(boxes.map((b) => Math.round(b.width))).size).toBe(1);
    expect(new Set(boxes.map((b) => Math.round(b.height))).size).toBe(1);
    expect(Math.round(boxes[1]!.x - (boxes[0]!.x + boxes[0]!.width))).toBe(8);
    expect(Math.round(boxes[2]!.y - (boxes[0]!.y + boxes[0]!.height))).toBe(8);
    expect(boxes[5]!.x).toBeGreaterThan(boxes[4]!.x);
    expect(boxes[5]!.y).toBeCloseTo(boxes[4]!.y, 0);
    // Each key tile: a 1 px solid edge in its own text colour at 14%; All shortcuts keeps the room and draws no line.
    const edges = await Promise.all(all.map((t) => t.evaluate((el) => {
      const c = getComputedStyle(el);
      const alpha = (v: string) => (v.startsWith('color(') ? Number(v.split('/')[1]?.replace(')', '') ?? 1) : Number(v.match(/rgba\([^)]*,\s*([\d.]+)\)/)?.[1] ?? 1));
      return { edge: `${c.borderBlockStartWidth} ${c.borderBlockStartStyle}`, alpha: alpha(c.borderBlockStartColor) };
    })));
    for (const e of edges) expect(e.edge).toBe('1px solid');
    for (const e of edges.slice(0, 5)) expect(e.alpha).toBeCloseTo(0.14, 2);
    expect(edges[5]!.alpha).toBe(0);
    const fills = await Promise.all(all.map((t) => t.evaluate((el) => getComputedStyle(el).backgroundColor)));
    expect(fills[5]).toBe('rgba(0, 0, 0, 0)');
    expect(new Set(fills.slice(0, 5)).size).toBe(1);
    const first = tiles.first();
    expect((await box(first.locator('dt'))).y).toBeLessThan((await box(first.locator('dd'))).y);
  });
}

test('2400 px: the narrower cards take one realm column so a name keeps its room, and still end level', async ({ hubPage: page }) => {
  await open(page, 2400);
  const items = realmsCard(page).locator('li');
  expect((await box(items.nth(2))).x).toBeCloseTo((await box(items.nth(1))).x, 0);
  await expect.poll(() => levelGap(page)).toBe(0);
  const [rb] = (await bodies(page)) as [Body, Body];
  expect(Math.round(rb.height)).toBe(332);
});

test('390 px: one realm column, and each card as tall as its content', async ({ hubPage: page }) => {
  await open(page, 390);
  const items = realmsCard(page).locator('li');
  expect((await box(items.nth(2))).x).toBeCloseTo((await box(items.nth(1))).x, 0);
  const r = body(realmsCard(page));
  expect(await r.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
  expect(Math.round((await box(r)).height)).toBeLessThan(332);
});

// A narrow card moves All shortcuts to a row of its own: half a tile would cut its words. No widths are guessed here: at
// each width of a different card size, nothing in the button is cut, the fixed card body does not scroll, and the cards end level.
for (const width of [2400, 1350, 1000, 760, 390]) {
  test(`${width} px: All shortcuts shows all its words and the Shortcuts body does not scroll`, async ({ hubPage: page }) => {
    await open(page, width);
    const k = keysCard(page);
    const cut = await k.getByRole('button', { name: strings['keys.all'] }).evaluate((b) => [b, ...b.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0).length);
    expect(cut).toBe(0);
    expect(await body(k).evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    if (width > 760) {
      await expect.poll(() => levelGap(page)).toBe(0);
    }
  });
}

for (const width of [1350, 390]) {
  test(`${width} px: past the card's rows the list scrolls, Tab reaches every row, and it stops on whole rows`, async ({ hubPage: page }) => {
    await open(page, width);
    await manyRows(page);
    const rows = realmsCard(page).locator('button[data-realm]');
    const scroller = body(realmsCard(page));
    await expect.poll(() => scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(Math.round((await box(scroller)).height)).toBe(332);
    await rows.first().focus();
    const n = await rows.count();
    for (let i = 1; i < n; i++) await page.keyboard.press('Tab');
    await expect(rows.last()).toBeFocused();
    await expect(rows.last()).toBeInViewport();
    // The scroller's top line and the rows' tops agree: the list rests on a row's start, never inside one.
    const rest = () =>
      page.evaluate(() => {
        const main = document.querySelector('button[data-realm]')!.closest('ul')!;
        const scroll = main.parentElement!;
        const top = scroll.getBoundingClientRect().top + parseFloat(getComputedStyle(scroll).paddingBlockStart);
        return Math.min(...[...main.children].map((li) => Math.abs(li.getBoundingClientRect().top - top)));
      });
    await expect.poll(rest).toBeLessThanOrEqual(1);
  });
}

test('coarse pointer: a realm row button is a 44 px target', async ({ hubPageCoarse: page }) => {
  await gotoHub(page, '/home');
  const row = page.locator('#hub-main button[data-realm]').first();
  await expect(row).toBeVisible();
  expect(Math.round((await box(row)).height)).toBeGreaterThanOrEqual(44);
});
