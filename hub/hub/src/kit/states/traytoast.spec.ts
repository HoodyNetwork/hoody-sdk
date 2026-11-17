// Playwright: toasts and an open phone tray share the visual viewport. While a tray is open the
// toasts move to a band at the top; the tray keeps its reserve R (head + up to 3 rows, 1 on a small screen, + safe area)
// and the band gets B = vvh − R − 2·gap, scrolling inside; below one toast's title line + Close (T_min) the toasts queue,
// hidden, with timed ones paused; below R the tray takes the whole viewport in one scroll box. Overlap is judged on
// clipped rectangles only: visibleToast = toast ∩ band scrollport ∩ visual viewport, visibleRow = row ∩ tray scrollport
// ∩ visual viewport, never intersecting. Every case first asserts its measured preconditions.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/overlays.strings.en.json';
import overlays from '../overlays/strings.en.json';
import kit from '../strings.en.json';

const GALLERY = '/_kit?tab=overlays';
const tray = (page: Page) => page.locator('[data-hub-tray]');
const region = (page: Page) => page.locator('[data-hub-toasts]');
const toasts = (page: Page) => region(page).locator('[role="alertdialog"]');
const button = (page: Page, key: keyof typeof gallery) => page.getByRole('button', { name: gallery[key], exact: true });

/** Fire gallery toasts by their buttons from the keyboard (the page is still free: no tray yet; a toast may cover a
 *  button, which a click would hit instead). */
async function fire(page: Page, ...keys: (keyof typeof gallery)[]) {
  for (const k of keys) {
    const b = button(page, k);
    await b.focus();
    await page.keyboard.press('Enter');
  }
}

/** Opens a gallery menu from the keyboard: by default the long menu (14 rows, the maximum-height tray); `btn.reasonMenu`
 *  is the two-line one, with a reason and a description that wrap to several lines. */
async function openTray(page: Page, key: keyof typeof gallery = 'btn.longMenu') {
  const b = button(page, key);
  await b.scrollIntoViewIfNeeded();
  await b.focus();
  await page.keyboard.press('Enter');
  await expect(tray(page)).toBeVisible();
  // Measured once it has slid in: rows mid-slide sit lower than they will.
  await tray(page).evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await settle(page);
}

/** Scrolls the tray, and its menu, to their start (the head) or their end (the last row). */
const toEnd = (page: Page, end: 'start' | 'end') =>
  tray(page).evaluate((t, e) => {
    for (const el of [t, t.querySelector<HTMLElement>('[role="menu"]')]) if (el) el.scrollTop = e === 'start' ? 0 : el.scrollHeight;
  }, end);

/** Two frames: the placement loop runs at most once a frame. */
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

interface Measured {
  vvh: number;
  gap: number;
  head: number;
  rowH: number;
  rows: number;
  safe: number;
  /** The tray's reserves, its --tray-r1/--tray-r3 token sums as resolved (what Toaster reads). */
  r1: number;
  r3: number;
  /** How many leading rows show whole (inside the tray's scrollport and the visual viewport). */
  whole: number;
  /** How many rows show whole anywhere (after scrolling the menu, the leading ones are gone). */
  wholeAny: number;
  tMin: number;
  stack: number;
  mode: string | undefined;
  fit: string | undefined;
  trayTop: number;
  trayH: number;
  band: number;
  overlaps: string[];
  shown: number;
}

/** The budget's inputs as the page measures them, and the clipped-rectangle overlap check. */
const measure = (page: Page) =>
  page.evaluate((): Measured => {
    const vvh = window.visualViewport?.height ?? window.innerHeight;
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sp-2')) || 8;
    const t = document.querySelector<HTMLElement>('[data-hub-tray]')!;
    const r = document.querySelector<HTMLElement>('[data-hub-toasts]');
    const items = [...t.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
    const head = t.querySelector('[data-tray-head]')!.getBoundingClientRect().height;
    const first = r?.querySelector<HTMLElement>('[role="alertdialog"]');
    let tMin = 0;
    if (first) {
      const fs = getComputedStyle(first);
      const close = first.querySelector('[slot="close"]')?.getBoundingClientRect().height ?? 0;
      const title = parseFloat(getComputedStyle(first.querySelector('[slot="title"]') ?? first).lineHeight) || 0;
      tMin = Math.max(close, title) + parseFloat(fs.paddingTop) + parseFloat(fs.paddingBottom) + parseFloat(fs.borderTopWidth) + parseFloat(fs.borderBottomWidth);
    }
    type R = { l: number; t: number; r: number; b: number };
    const box = (el: Element): R => {
      const b = el.getBoundingClientRect();
      return { l: b.left, t: b.top, r: b.right, b: b.bottom };
    };
    const cut = (a: R, c: R): R | null => {
      const x = { l: Math.max(a.l, c.l), t: Math.max(a.t, c.t), r: Math.min(a.r, c.r), b: Math.min(a.b, c.b) };
      return x.r - x.l > 0.5 && x.b - x.t > 0.5 ? x : null;
    };
    const view: R = { l: 0, t: 0, r: window.innerWidth, b: vvh };
    const body = t.querySelector('[role="menu"]')?.parentElement ?? t;
    const rowScroll = (() => {
      // The tray's scrollport: the nearest ancestor of the rows that scrolls (the body, or the whole tray when full).
      let el: HTMLElement | null = items[0] ?? null;
      while (el && el !== t.parentElement) {
        const o = getComputedStyle(el).overflowY;
        if (o === 'auto' || o === 'scroll') return box(el);
        el = el.parentElement;
      }
      return box(body);
    })();
    const ts = getComputedStyle(t);
    const isWhole = (i: Element) => {
      const b = box(i);
      return b.t >= Math.max(rowScroll.t, 0) - 0.5 && b.b <= Math.min(rowScroll.b, vvh) + 0.5;
    };
    let whole = 0;
    for (const i of items) {
      if (!isWhole(i)) break;
      whole += 1;
    }
    const wholeAny = items.filter(isWhole).length;
    const visibleRows = items.map((i) => cut(box(i), rowScroll)).map((x) => (x ? cut(x, view) : null)).filter((x): x is R => x !== null);
    const all = r ? [...r.querySelectorAll<HTMLElement>('[role="alertdialog"]')] : [];
    const shownToasts = all.filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
    const visibleToasts = r ? shownToasts.map((el) => cut(box(el), box(r))).map((x) => (x ? cut(x, view) : null)).filter((x): x is R => x !== null) : [];
    const overlaps: string[] = [];
    visibleToasts.forEach((a, i) => visibleRows.forEach((b, j) => {
      if (cut(a, b)) overlaps.push(`toast ${i} over row ${j}`);
    }));
    const tb = t.getBoundingClientRect();
    return {
      vvh,
      gap,
      head,
      rowH: items[0]?.getBoundingClientRect().height ?? 0,
      rows: items.length,
      safe: parseFloat(getComputedStyle(t).paddingBottom) || 0,
      r1: parseFloat(ts.getPropertyValue('--tray-r1')),
      r3: parseFloat(ts.getPropertyValue('--tray-r3')),
      whole,
      wholeAny,
      tMin,
      stack: r?.scrollHeight ?? 0,
      mode: r?.dataset.tray,
      // The fallback is the tray's own CSS (no attribute): it covers the whole viewport.
      fit: tb.top <= 0.5 && tb.height >= vvh - 0.5 ? 'full' : undefined,
      trayTop: tb.top,
      trayH: tb.height,
      band: r ? r.getBoundingClientRect().height : 0,
      overlaps,
      shown: visibleToasts.length,
    };
  });

const reserve = (m: Measured, n: 1 | 3) => (n === 1 ? m.r1 : m.r3);

/** Scrolls the band to each end and checks the invariant there. The region stacks bottom-up (column-reverse): its
 *  scroll range runs from 0 (the newest end) down to −(scrollHeight − clientHeight). The two positions must differ, and
 *  at each a toast's Close showing in the band is the element under its own centre (it can be pressed). */
async function bothEnds(page: Page) {
  const at: number[] = [];
  for (const end of ['newest', 'oldest'] as const) {
    const top = await region(page).evaluate((el, e) => {
      el.scrollTop = e === 'newest' ? 0 : -(el.scrollHeight - el.clientHeight);
      return el.scrollTop;
    }, end);
    at.push(top);
    await settle(page);
    const m = await measure(page);
    expect(m.overlaps, `no visible toast over a visible row (band at its ${end} end)`).toEqual([]);
    // Every control showing whole in the band is the element under its own centre: nothing covers it.
    const covered = await region(page).evaluate((el) => {
      const band = el.getBoundingClientRect();
      return [...el.querySelectorAll<HTMLElement>('button, a[href]')]
        .filter((c) => {
          const b = c.getBoundingClientRect();
          return b.height > 0 && b.top >= band.top && b.bottom <= band.bottom;
        })
        .filter((c) => {
          const b = c.getBoundingClientRect();
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return hit === null || !c.contains(hit);
        })
        .map((c) => c.getAttribute('aria-label') ?? c.textContent ?? '');
    });
    expect(covered, `controls showing at the ${end} end can be pressed`).toEqual([]);
  }
  const range = await region(page).evaluate((el) => el.scrollHeight - el.clientHeight);
  if (range > 1) expect(Math.abs(at[0]! - at[1]!), 'the two ends are different scroll positions').toBeGreaterThan(1);
}

for (const [w, h] of [[360, 640], [390, 700]] as const) {
  test(`@traytoast (t1) three short sticky toasts fit in the band; the tray gives up their room (${w}x${h})`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await gotoHub(page, GALLERY);
    await fire(page, 'btn.toastSticky', 'btn.toastSticky', 'btn.toastSticky');
    await expect(toasts(page)).toHaveCount(3);
    await openTray(page);
    const m = await measure(page);
    const B = m.vvh - reserve(m, 3) - 2 * m.gap;
    expect(B, 'precondition: the three-row reserve leaves a band').toBeGreaterThanOrEqual(m.tMin);
    expect(m.stack, 'precondition: the stack fits the band').toBeLessThanOrEqual(B);
    expect(m.mode).toBe('band');
    expect(m.shown, 'all three toasts show').toBe(3);
    expect(m.trayTop, 'the tray starts below the band and its gap').toBeGreaterThanOrEqual(m.gap + m.band + m.gap - 1);
    expect(m.overlaps).toEqual([]);
  });

  test(`@traytoast (t2) a stack taller than the band is capped at B and scrolls inside (${w}x${h})`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await gotoHub(page, GALLERY);
    await fire(page, 'btn.toastLong', 'btn.toastHuge', 'btn.toastHuge');
    await expect(toasts(page)).toHaveCount(3);
    await openTray(page);
    const m = await measure(page);
    const B = m.vvh - reserve(m, 3) - 2 * m.gap;
    expect(m.stack, 'precondition: the stack exceeds the band').toBeGreaterThan(B);
    expect(m.mode).toBe('band');
    expect(m.band, 'the band is capped at B').toBeLessThanOrEqual(B + 1);
    expect(m.trayH, 'the tray keeps its reserve').toBeGreaterThanOrEqual(reserve(m, 3) - 1);
    expect(m.whole, 'its first three rows show whole').toBeGreaterThanOrEqual(3);
    await bothEnds(page);
    // The last toast's Close is exposed by scrolling the band, and works.
    const close = toasts(page).last().getByRole('button', { name: kit['toast.dismiss'], exact: true });
    await close.scrollIntoViewIfNeeded();
    await close.click();
    await expect(toasts(page)).toHaveCount(2);
    await expect(tray(page), 'closing a toast leaves the tray open').toBeVisible();
  });
}

test('@traytoast (t3) one oversized toast: the band is capped, the tray keeps its reserve, both ends of the band scroll', async ({ page }) => {
  // The gallery's oversized toast is ~320 px at 360 wide, so 480 tall makes it taller than the band (measured below).
  await page.setViewportSize({ width: 360, height: 480 });
  await gotoHub(page, GALLERY);
  await fire(page, 'btn.toastHuge');
  await openTray(page);
  const m = await measure(page);
  const B = m.vvh - reserve(m, 3) - 2 * m.gap;
  expect(m.stack, 'precondition: one toast taller than the band').toBeGreaterThan(B);
  expect(m.band).toBeLessThanOrEqual(B + 1);
  expect(m.trayH).toBeGreaterThanOrEqual(reserve(m, 3) - 1);
  expect(m.whole, 'its first three rows show whole').toBeGreaterThanOrEqual(3);
  await bothEnds(page);
});

test('@traytoast (t4a) at 320 px the three-row reserve is kept and the oversized toast scrolls in its band', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 320 });
  await gotoHub(page, GALLERY);
  await fire(page, 'btn.toastHuge');
  await openTray(page);
  const m = await measure(page);
  expect(m.vvh - reserve(m, 3) - 2 * m.gap, 'precondition: the three-row band holds T_min').toBeGreaterThanOrEqual(m.tMin);
  expect(m.stack, 'precondition: the toast is taller than the band').toBeGreaterThan(m.vvh - reserve(m, 3) - 2 * m.gap);
  expect(m.mode).toBe('band');
  expect(m.trayH).toBeGreaterThanOrEqual(reserve(m, 3) - 1);
  expect(m.whole, 'its first three rows show whole').toBeGreaterThanOrEqual(3);
  await bothEnds(page);
});

test('@traytoast (t4b) at 220 px the reserve falls back to one row', async ({ page }) => {
  // 220, not 240: the measured reserve (frame, head and rows with their gaps and the menu's padding) and
  // T_min put the one-row branch in a narrower range here; the preconditions below are what the case needs.
  await page.setViewportSize({ width: 390, height: 220 });
  await gotoHub(page, GALLERY);
  await fire(page, 'btn.toastSticky');
  await openTray(page);
  const m = await measure(page);
  expect(m.vvh - reserve(m, 3) - 2 * m.gap, 'precondition: three rows leave too little').toBeLessThan(m.tMin);
  expect(m.vvh - reserve(m, 1) - 2 * m.gap, 'precondition: one row leaves enough').toBeGreaterThanOrEqual(m.tMin);
  expect(m.mode).toBe('band');
  expect(m.shown).toBe(1);
  expect(m.trayH).toBeGreaterThanOrEqual(reserve(m, 1) - 1);
  expect(m.whole, 'its first row shows whole').toBeGreaterThanOrEqual(1);
  expect(m.overlaps).toEqual([]);
});

test('@traytoast (t4c) at 160 px the toasts queue, hidden, and the tray takes max(R, vvh - 48)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 160 });
  await gotoHub(page, GALLERY);
  await fire(page, 'btn.toastSticky');
  await openTray(page);
  const m = await measure(page);
  expect(m.vvh - reserve(m, 1) - 2 * m.gap, 'precondition: not even one row leaves T_min').toBeLessThan(m.tMin);
  expect(m.vvh, 'precondition: the reserve fits').toBeGreaterThanOrEqual(reserve(m, 1));
  expect(m.mode).toBe('queued');
  expect(m.shown, 'no toast shows').toBe(0);
  expect(Math.abs(m.trayH - Math.max(reserve(m, 1), m.vvh - 48)), 'tray max').toBeLessThanOrEqual(1);
});

test('@traytoast (t4d) below the reserve the tray takes the whole viewport, Close and every action in one scroll box', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 90 });
  await gotoHub(page, GALLERY);
  await fire(page, 'btn.toastSticky');
  await openTray(page);
  const m = await measure(page);
  expect(m.vvh, 'precondition: the one-row reserve does not fit').toBeLessThan(reserve(m, 1));
  expect(m.fit).toBe('full');
  expect(m.shown).toBe(0);
  const close = tray(page).getByRole('button', { name: overlays.close, exact: true });
  await toEnd(page, 'start');
  await expect(close, 'Close shows whole').toBeInViewport({ ratio: 1 });
  const last = tray(page).getByRole('menuitem').last();
  await toEnd(page, 'end');
  await expect(last, 'the last action shows whole').toBeInViewport({ ratio: 1 });
});

test('@traytoast branch boundaries: one pixel either side of B = T_min and of vvh = R', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 240 });
  await gotoHub(page, GALLERY);
  await fire(page, 'btn.toastSticky');
  await openTray(page);
  const m = await measure(page);
  const r1 = reserve(m, 1);
  // B = T_min at vvh = R₁ + 2·gap + T_min (the one-row reserve, which applies at these heights).
  const edge = Math.ceil(r1 + 2 * m.gap + m.tMin);
  for (const [vh, want] of [[edge + 1, 'band'], [edge - 1, 'queued']] as const) {
    await page.setViewportSize({ width: 390, height: vh });
    await settle(page);
    await settle(page);
    expect((await measure(page)).mode, `vvh ${vh}`).toBe(want);
  }
  const full = Math.ceil(r1);
  for (const [vh, want] of [[full + 1, undefined], [full - 1, 'full']] as const) {
    await page.setViewportSize({ width: 390, height: vh });
    await settle(page);
    await settle(page);
    expect((await measure(page)).fit, `vvh ${vh}`).toBe(want);
  }
});

test('@traytoast (t5) a toast arriving while the tray is open, and the tray scrolling, keep the invariant', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await gotoHub(page, GALLERY);
  await fire(page, 'btn.toastLong');
  await fire(page, 'btn.toastLater');
  await openTray(page);
  await expect(toasts(page)).toHaveCount(2, { timeout: 5000 });
  await settle(page);
  expect((await measure(page)).overlaps).toEqual([]);
  await tray(page).getByRole('menuitem').last().scrollIntoViewIfNeeded();
  await settle(page);
  await bothEnds(page);
});

test('@traytoast (t6) closing the tray, or growing the viewport, brings queued toasts back in order; a timed one resumes', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 160 });
  await gotoHub(page, GALLERY);
  await fire(page, 'btn.toastSticky', 'btn.toastLong');
  const order = () => toasts(page).evaluateAll((els) => els.map((e) => e.textContent ?? ''));
  const before = await order();
  await openTray(page);
  expect((await measure(page)).mode, 'precondition: queued').toBe('queued');
  // Closing the tray: the same toasts, in the same order, show again.
  await page.keyboard.press('Escape');
  await expect(tray(page)).toHaveCount(0);
  await settle(page);
  expect(await order()).toEqual(before);
  await expect(toasts(page).first()).toBeVisible();

  // Growing the viewport out of the queued branch, with a toast that arrived while queued.
  await fire(page, 'btn.toastLater');
  await openTray(page);
  expect((await measure(page)).mode).toBe('queued');
  await expect(toasts(page)).toHaveCount(3, { timeout: 5000 });
  expect((await measure(page)).shown, 'the arrival is held back too').toBe(0);
  await page.setViewportSize({ width: 390, height: 700 });
  await settle(page);
  await settle(page);
  const m = await measure(page);
  expect(m.mode).toBe('band');
  expect(m.shown, 'all three come back').toBe(3);
  await page.keyboard.press('Escape');

  // A timed toast queued for longer than its timeout is still there when it comes back, then times out.
  await page.setViewportSize({ width: 390, height: 160 });
  await settle(page);
  while ((await toasts(page).count()) > 0) {
    await toasts(page).first().getByRole('button', { name: kit['toast.dismiss'], exact: true }).focus();
    await page.keyboard.press('Enter');
  }
  await expect(toasts(page)).toHaveCount(0);
  await fire(page, 'btn.toastShort');
  await openTray(page);
  expect((await measure(page)).mode).toBe('queued');
  await page.waitForTimeout(3500);
  await expect(toasts(page), 'paused while queued: not timed out').toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(toasts(page).first()).toBeVisible();
  await expect(toasts(page), 'its remaining time runs out').toHaveCount(0, { timeout: 5000 });
});

test('@traytoast (t4e) with no toast at all, below the reserve the tray still takes the whole viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 90 });
  await gotoHub(page, GALLERY);
  await openTray(page);
  const m = await measure(page);
  expect(m.shown, 'precondition: no toast').toBe(0);
  expect(m.vvh, 'precondition: the one-row reserve does not fit').toBeLessThan(reserve(m, 1));
  expect(m.fit).toBe('full');
  expect(Math.abs(m.trayTop), 'from the top').toBeLessThanOrEqual(1);
  expect(Math.abs(m.trayH - m.vvh), 'the whole viewport').toBeLessThanOrEqual(1);
  const close = tray(page).getByRole('button', { name: overlays.close, exact: true });
  await toEnd(page, 'start');
  await expect(close, 'Close shows whole').toBeInViewport({ ratio: 1 });
  const last = tray(page).getByRole('menuitem').last();
  await toEnd(page, 'end');
  await expect(last, 'the last action shows whole').toBeInViewport({ ratio: 1 });
});

test('@traytoast (t7) when the last toast goes the tray takes its own height back, and still falls back below its reserve', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await gotoHub(page, GALLERY);
  await fire(page, 'btn.toastShort');
  await openTray(page);
  const sized = await tray(page).evaluate((el) => el.style.getPropertyValue('--tray-max'));
  expect(sized, 'precondition: sized beside the toast').not.toBe('');
  // The 3 s toast runs out with the tray open (a band, not queued: its timer runs).
  await expect(toasts(page)).toHaveCount(0, { timeout: 8000 });
  await settle(page);
  expect(await tray(page).evaluate((el) => el.style.getPropertyValue('--tray-max')), 'no stale budget').toBe('');
  let m = await measure(page);
  expect(Math.abs(m.trayH - Math.min(m.vvh - 48, (await tray(page).evaluate((el) => el.scrollHeight)))), 'its own height').toBeLessThanOrEqual(1);
  // 320 tall: the tray's own cap, its head and Close still on screen.
  await page.setViewportSize({ width: 390, height: 320 });
  await settle(page);
  await settle(page);
  await expect(tray(page).getByRole('button', { name: overlays.close, exact: true })).toBeInViewport();
  // Shrink below the reserve: the tray judges the fallback itself.
  await page.setViewportSize({ width: 390, height: 90 });
  await settle(page);
  await settle(page);
  m = await measure(page);
  expect(m.fit, 'full below the reserve').toBe('full');
  const close = tray(page).getByRole('button', { name: overlays.close, exact: true });
  await toEnd(page, 'start');
  await expect(close, 'Close shows whole').toBeInViewport({ ratio: 1 });
  // And grows back out of it.
  await page.setViewportSize({ width: 390, height: 700 });
  await settle(page);
  await settle(page);
  m = await measure(page);
  expect(m.fit, 'the fallback ends').toBeUndefined();
  expect(m.trayH, 'not stuck at the small height').toBeGreaterThan(200);
});

test('@traytoast (t8) scrolling the menu keeps the reserve: the tray height and three whole rows stay', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 400 });
  await gotoHub(page, GALLERY);
  await fire(page, 'btn.toastHuge');
  await openTray(page);
  const before = await measure(page);
  expect(before.mode, 'precondition: a band beside the tray').toBe('band');
  expect(before.stack, 'precondition: the toast is taller than the band').toBeGreaterThan(before.band);
  const menu = tray(page).locator('[role="menu"]');
  const port = () => menu.evaluate((el) => el.clientHeight);
  const portBefore = await port();
  await menu.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await settle(page);
  await settle(page);
  const after = await measure(page);
  expect(Math.abs(after.trayH - before.trayH), 'the tray keeps its height').toBeLessThanOrEqual(1);
  expect(Math.abs(after.band - before.band), 'the band does not take the reserve').toBeLessThanOrEqual(1);
  expect(after.trayH).toBeGreaterThanOrEqual(after.r3 - 1);
  expect(await port(), 'the rows keep their scrollport').toBe(portBefore);
  // Scrolled to the end, a rule before the last row can leave two rows whole beside it, never none.
  expect(after.wholeAny, 'rows still show whole').toBeGreaterThanOrEqual(2);
  expect(after.overlaps).toEqual([]);
});

test('@traytoast (t9) with no toast, every height from just below the one-row reserve up shows Close and a whole row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 200 });
  await gotoHub(page, GALLERY);
  await openTray(page);
  const r1 = (await measure(page)).r1;
  expect(r1, 'precondition: the reserve resolves').toBeGreaterThan(60);
  for (let h = Math.floor(r1) - 6; h <= Math.ceil(r1) + 60; h += 6) {
    await page.setViewportSize({ width: 390, height: h });
    await settle(page);
    await settle(page);
    const m = await measure(page);
    if (m.vvh < m.r1) {
      expect(m.fit, `${h}: below the reserve the tray takes the viewport`).toBe('full');
      await toEnd(page, 'end');
      await expect(tray(page).getByRole('menuitem').last(), `${h}: scrolling shows a whole row`).toBeInViewport({ ratio: 1 });
      continue;
    }
    expect(m.trayH, `${h}: never under the one-row reserve`).toBeGreaterThanOrEqual(m.r1 - 1);
    expect(m.wholeAny, `${h}: a row shows whole`).toBeGreaterThanOrEqual(1);
    await expect(tray(page).getByRole('button', { name: overlays.close, exact: true }), `${h}: Close on screen`).toBeInViewport({ ratio: 1 });
  }
});

test('@traytoast (t10) opening a tray from a focused text field moves focus into the tray (no keyboard stays up under it)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await gotoHub(page, GALLERY);
  // A stand-in text field; with it focused a phone keyboard would be up (the visual viewport shorter than the layout).
  await page.evaluate(() => {
    const i = document.createElement('input');
    i.id = 'kbd-probe';
    i.setAttribute('aria-label', 'probe');
    document.body.prepend(i);
  });
  await page.locator('#kbd-probe').focus();
  const b = button(page, 'btn.longMenu');
  await b.scrollIntoViewIfNeeded();
  await b.click();
  await expect(tray(page)).toBeVisible();
  const where = await page.evaluate(() => {
    const a = document.activeElement;
    return { inTray: !!a?.closest('[data-hub-tray]'), field: a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement };
  });
  expect(where).toEqual({ inTray: true, field: false });
});

test('@traytoast the token reserves match the real tray: r1 and r3 cover the frame and the first one or three rows whole', async ({ page }) => {
  // In a menu of one-line rows the reserves are token sums, never measured at run time (a two-line menu's are pinned
  // below); this pins them to the geometry they stand for (rows with
  // their gaps, the menu's padding, the head, the border and the bottom padding), so a token drifting out of step fails.
  for (const touch of [false, true]) {
    const ctx = await page.context().browser()!.newContext({ viewport: { width: 390, height: 700 }, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage();
    await gotoHub(p, GALLERY);
    await openTray(p);
    const g = await tray(p).evaluate((t) => {
      const menu = t.querySelector<HTMLElement>('[role="menu"]')!;
      const rows = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
      const top = t.getBoundingClientRect().top;
      const tail = (parseFloat(getComputedStyle(menu).paddingBlockEnd) || 0) + (parseFloat(getComputedStyle(t).paddingBlockEnd) || 0);
      const cs = getComputedStyle(t);
      return {
        need1: rows[0]!.getBoundingClientRect().bottom - top + tail,
        need3: rows[2]!.getBoundingClientRect().bottom - top + tail,
        r1: parseFloat(cs.getPropertyValue('--tray-r1')),
        r3: parseFloat(cs.getPropertyValue('--tray-r3')),
      };
    });
    expect(Math.abs(g.r1 - g.need1), `r1 (touch ${touch})`).toBeLessThanOrEqual(1);
    expect(Math.abs(g.r3 - g.need3), `r3 (touch ${touch})`).toBeLessThanOrEqual(1);
    await ctx.close();
  }
});

test('@traytoast with no tray the toasts keep their desktop place', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, GALLERY);
  await fire(page, 'btn.toastSticky');
  await expect(toasts(page)).toHaveCount(1);
  await settle(page);
  const at = await region(page).evaluate((el) => ({ tray: el.dataset.tray, at: el.dataset.at, bottom: el.getBoundingClientRect().bottom }));
  expect(at.tray).toBeUndefined();
  expect(at.at).toBeUndefined();
  expect(at.bottom).toBeGreaterThan(900 / 2);
});

// The tray and the toasts are fixed in the layout viewport, so pinch zoom (CDP page scale 2, which halves
// visualViewport.height here; probed) must not shrink the tray or change the band. Panning (offsetTop) is covered by the
// unit and Toaster rows: a synthesized touch pan leaves offsetTop at 0 here, so this row does not claim it.
test('@traytoast pinch zoom keeps the tray and the band as laid out', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP page scale is Chromium only');
  await page.setViewportSize({ width: 390, height: 640 });
  await gotoHub(page, GALLERY);
  await fire(page, 'btn.toastSticky');
  await openTray(page);
  const laid = await measure(page);
  expect(laid.mode, 'precondition: a band at scale 1').toBe('band');
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    // The resize event and the re-placement can land late under load: poll, never one sample.
    await expect.poll(() => page.evaluate(() => visualViewport!.scale), { message: 'precondition: zoomed in' }).toBe(2);
    await expect
      .poll(() => page.evaluate(() => visualViewport!.height), { message: 'precondition: the visual viewport is the zoomed slice' })
      .toBeLessThan(laid.vvh - 1);
    await expect.poll(() => region(page).evaluate((el) => el.dataset.tray), { message: 'the band stays when zoomed' }).toBe('band');
    await expect
      .poll(async () => Math.abs((await tray(page).evaluate((t) => t.getBoundingClientRect().height)) - laid.trayH), {
        message: 'the tray keeps its laid-out height when zoomed',
      })
      .toBeLessThanOrEqual(1);
  } finally {
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  }
});

// In a menu with a two-line row the reserves take the tallest row as
// drawn (the long reason, wrapped), not one token row: r1 is the frame and that row, r3 adds two two-line rows and their
// gaps. Toaster reads them, so the toasts' band never takes the room that row needs.
test('@traytoast a two-line tray reserves its tallest row as drawn: r1 covers the frame and that row, r3 two more two-line rows', async ({ page }) => {
  for (const touch of [false, true]) {
    const ctx = await page.context().browser()!.newContext({ viewport: { width: 390, height: 700 }, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage();
    await gotoHub(p, GALLERY);
    await openTray(p, 'btn.reasonMenu');
    await expect(tray(p)).toHaveAttribute('data-two-line');
    const g = await tray(p).evaluate((t) => {
      const menu = t.querySelector<HTMLElement>('[role="menu"]')!;
      const rows = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')].map((r) => r.getBoundingClientRect());
      const top = t.getBoundingClientRect().top;
      const tail = (parseFloat(getComputedStyle(menu).paddingBlockEnd) || 0) + (parseFloat(getComputedStyle(t).paddingBlockEnd) || 0);
      const cs = getComputedStyle(t);
      const tallest = Math.max(...rows.map((r) => r.height));
      return {
        tallest,
        // The restart row: a description of one line, so a plain two-line row; the gap is the one before it.
        twoLine: rows[2]!.height,
        gap: rows[2]!.top - rows[1]!.bottom,
        need1: rows[0]!.top - top + tallest + tail,
        r1: parseFloat(cs.getPropertyValue('--tray-r1')),
        r3: parseFloat(cs.getPropertyValue('--tray-r3')),
      };
    });
    expect(g.tallest, `precondition: the long reason makes a row taller than a two-line row (touch ${touch})`).toBeGreaterThan(g.twoLine + 10);
    expect(Math.abs(g.r1 - g.need1), `r1 (touch ${touch}) ${JSON.stringify(g)}`).toBeLessThanOrEqual(1);
    expect(Math.abs(g.r3 - (g.r1 + 2 * (g.twoLine + g.gap))), `r3 (touch ${touch}) ${JSON.stringify(g)}`).toBeLessThanOrEqual(1);
    await ctx.close();
  }
});

test('@traytoast (t11) a two-line tray beside a toast: from just below r1 up, Close and the tallest row show whole together', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await gotoHub(page, GALLERY);
  await fire(page, 'btn.toastSticky');
  await openTray(page, 'btn.reasonMenu');
  const r1 = (await measure(page)).r1;
  expect(r1, 'precondition: the reserve resolves').toBeGreaterThan(100);
  const move = tray(page).getByRole('menuitem').first(); // reason: the reason menu's first row is the disabled Move row, the tallest (its wrapped reason)
  for (let h = Math.floor(r1) - 6; h <= Math.ceil(r1) + 60; h += 6) {
    await page.setViewportSize({ width: 390, height: h });
    await settle(page);
    await settle(page);
    const m = await measure(page);
    if (m.vvh < m.r1) {
      expect(m.fit, `${h}: below the reserve the tray takes the viewport`).toBe('full');
      await move.scrollIntoViewIfNeeded();
      await expect(move, `${h}: scrolling shows the tallest row whole`).toBeInViewport({ ratio: 1 });
      // Back at the start of the one scroll box, Close is on screen too.
      await toEnd(page, 'start');
      await expect(tray(page).getByRole('button', { name: overlays.close, exact: true }), `${h}: scrolling back shows Close`).toBeInViewport({ ratio: 1 });
      continue;
    }
    expect(m.trayH, `${h}: never under the one-row reserve`).toBeGreaterThanOrEqual(m.r1 - 1);
    // The tray itself does not scroll: the head and the tallest row are on screen at once.
    const whole = await tray(page).evaluate((t) => t.scrollHeight - t.clientHeight);
    expect(whole, `${h}: the tray holds head and row without scrolling whole`).toBeLessThanOrEqual(1);
    await tray(page).locator('[role="menu"]').evaluate((el) => (el.scrollTop = 0));
    await expect(move, `${h}: the tallest row shows whole`).toBeInViewport({ ratio: 1 });
    await expect(tray(page).getByRole('button', { name: overlays.close, exact: true }), `${h}: Close on screen`).toBeInViewport({ ratio: 1 });
    expect(m.overlaps, `${h}: no toast over a row`).toEqual([]);
  }
});
