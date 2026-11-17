// Playwright: a Tabs `before` and `after` slot ride the strip's own row. `before` starts it;
// `after` sits right after the last tab while the tabs fit (the tabs hug their width), and stays whole, beside the
// end chevron, when they do not (the tabs shrink and scroll). Measured on the kit gallery's buttonless Tabs
// (/_kit?tab=nav, "Board views": the Views menu before, New view after). Boxes need a real browser, not jsdom.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import gallery from '../gallery/kit2.strings.en.json';

const demo = (page: Page) => page.locator('[data-shot="tabs-buttonless"]');

/** The boxes on the strip's row: the before slot, the tabs (each whole or cut), the scroller, the after slot. */
async function row(page: Page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return demo(page).evaluate((root) => {
    const box = (el: Element | null) => {
      const r = el!.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
    };
    const list = root.querySelector('[role="tablist"]')!;
    const sc = list.parentElement!;
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const scb = sc.getBoundingClientRect();
    return {
      before: box(root.querySelector('[data-tabs-before]')),
      after: box(root.querySelector('[data-tabs-after]')),
      first: box(tabs[0]!),
      last: box(tabs.at(-1)!),
      scroller: box(sc),
      scrolls: sc.scrollWidth > sc.clientWidth + 1,
      gap: parseFloat(getComputedStyle(sc.parentElement!).columnGap) || 0,
      cut: tabs.filter((t) => {
        const r = t.getBoundingClientRect();
        return r.right > scb.left + 0.5 && r.left < scb.right - 0.5 && (r.left < scb.left - 0.5 || r.right > scb.right + 0.5);
      }).length,
      stacked: root.querySelector('[data-stacked]') !== null,
      win: window.innerWidth,
    };
  });
}

test.describe('Tabs before/after slots', () => {
  test('wide: before starts the row, after sits right after the last tab, all on one row', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHub(page, '/_kit?tab=nav');
    await expect(demo(page).getByRole('tab')).toHaveCount(3);
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(async () => {
      const r = await row(page);
      expect(r.scrolls).toBe(false);
      expect(r.before.right).toBeLessThanOrEqual(r.first.left + 0.5);
      // Right after the last tab: no more than the strip's gap (and the end chevron, hidden while nothing overflows).
      expect(r.after.left - r.last.right).toBeGreaterThanOrEqual(-0.5);
      expect(r.after.left - r.last.right).toBeLessThanOrEqual(r.gap + 1);
      // One row: each slot's middle lies within the tabs' row (never above or under it).
      for (const b of [r.before, r.after]) {
        const mid = (b.top + b.bottom) / 2;
        expect(mid).toBeGreaterThan(r.first.top);
        expect(mid).toBeLessThan(r.first.bottom);
      }
      expect(r.stacked).toBe(false);
    }).toPass({ timeout: 10_000 });
  });

  test('a tab more stays right after: New view adds one and the slot follows it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHub(page, '/_kit?tab=nav');
    const before = (await row(page)).after.left;
    await demo(page).getByRole('button', { name: gallery['tabs.newView'], exact: true }).click();
    await expect(demo(page).getByRole('tab')).toHaveCount(4);
    await expect(async () => {
      const r = await row(page);
      expect(r.after.left).toBeGreaterThan(before + 10);
      expect(r.after.left - r.last.right).toBeLessThanOrEqual(r.gap + 1);
    }).toPass({ timeout: 10_000 });
  });

  test('narrow, with more tabs than room: the tabs scroll, both slots stay whole in the window, no side scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    await gotoHub(page, '/_kit?tab=nav');
    const add = demo(page).getByRole('button', { name: gallery['tabs.newView'], exact: true });
    for (let i = 0; i < 5; i++) await add.click();
    await expect(demo(page).getByRole('tab')).toHaveCount(8);
    await expect(async () => {
      const r = await row(page);
      expect(r.scrolls).toBe(true);
      expect(r.before.left).toBeGreaterThanOrEqual(-0.5);
      expect(r.after.right).toBeLessThanOrEqual(r.win + 0.5);
      // The after slot follows the scroller (the end chevron between them), never over a tab.
      expect(r.after.left).toBeGreaterThanOrEqual(r.scroller.right - 0.5);
      expect(r.before.right).toBeLessThanOrEqual(r.scroller.left + 0.5);
      expect(r.stacked).toBe(false);
    }).toPass({ timeout: 10_000 });
    await noSideScroll(page);
  });

  test('RTL: before starts the row on the right, after follows the last tab to its left', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHub(page, '/_kit?tab=nav');
    await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
    await expect(async () => {
      const r = await row(page);
      expect(r.before.left).toBeGreaterThanOrEqual(r.first.right - 0.5);
      expect(r.last.left - r.after.right).toBeGreaterThanOrEqual(-0.5);
      expect(r.last.left - r.after.right).toBeLessThanOrEqual(r.gap + 1);
    }).toPass({ timeout: 10_000 });
  });
});

test('the hug is this strip\'s own: a plain Tabs inside the after slot keeps its scroller growing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoHub(page, '/_kit?tab=nav');
  await expect(demo(page).getByRole('tab')).toHaveCount(3);
  const grow = await demo(page).evaluate((root) => {
    const sc = root.querySelector('[role="tablist"]')!.parentElement!;
    const strip = sc.parentElement!;
    const slot = root.querySelector('[data-tabs-after]')!;
    // A strip of a plain Tabs (no after: no data-hug), with the kit's own classes, put in the after slot.
    const inner = document.createElement('div');
    inner.className = strip.className;
    const innerSc = document.createElement('div');
    innerSc.className = sc.className;
    inner.append(innerSc);
    slot.append(inner);
    const out = { outer: getComputedStyle(sc).flexGrow, inner: getComputedStyle(innerSc).flexGrow };
    inner.remove();
    return out;
  });
  expect(grow).toEqual({ outer: '0', inner: '1' });
});
