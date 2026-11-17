// Playwright: a detail's tab strip sticks right under its header, at the header's real height,
// whatever the header's lines: no strip of scrolled content shows between them and the strip never covers the
// header. Where the header scrolls away (phone width), the strip sticks at the top of the scroll box.
// Sticky offsets and container sizes need a real browser, not jsdom.
//
// The detail is made tall (min-heights on the header's box and the tab set) so the strip really sticks, and the header is made taller than
// its 64 px (a long meta line, which wraps) so a fixed offset would leave a gap or an overlap.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const DETAIL = '/scripts?sel=atlas.00a1~daily-digest.ts&tab=code';
const META = 'A long line of facts about this script that wraps onto more lines in the header · '.repeat(4);

/** Grows the header and the panel, scrolls the box the detail scrolls in, then measures header, strip and box. */
async function scrolled(page: Page, growHeader: boolean) {
  return page.evaluate(
    async ({ grow, meta }) => {
      const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const title = document.querySelector<HTMLElement>('h2[data-hub-title]');
      const header = title?.closest('header');
      // The strip and panel of this detail: in the box the header sits in (the page may hold other tab sets).
      const host = header?.parentElement;
      const bar = host?.querySelector<HTMLElement>('[role="tablist"]')?.closest<HTMLElement>('[class*="sticky"]');
      if (!title || !header || !host || !bar?.parentElement) throw new Error('no detail header or sticky tab strip');
      // Tall boxes, so both stick: the header within its box, the strip within its tab set.
      host.style.minHeight = '4000px';
      bar.parentElement.style.minHeight = '3600px';
      if (grow) {
        const m = header.querySelector<HTMLElement>('[class*="detailMeta"]');
        if (!m) throw new Error('no meta line');
        m.textContent = meta;
      }
      // The box the header sticks in: its nearest scrolling ancestor (the pane's scroll box). Held to 600 px, so it
      // scrolls whatever the page around it does (a page that grows with its content scrolls the main area instead).
      let box: HTMLElement | null = header.parentElement;
      while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
      const scroller = box;
      if (!scroller) throw new Error('no scroll box');
      scroller.style.height = '600px';
      scroller.style.flex = 'none';
      await frames();
      scroller.scrollTop = 1200;
      await frames();
      const h = header.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      return {
        headerSticks: getComputedStyle(header).position === 'sticky',
        headerTop: Math.round(h.top),
        headerBottom: Math.round(h.bottom),
        headH: Math.round(h.height),
        barTop: Math.round(b.top),
        boxTop: Math.round(Math.max(s.top, 0)),
        scrolled: scroller.scrollTop,
        box: `${scroller.tagName}.${String(scroller.className).slice(0, 60)} ${scroller.clientHeight}/${scroller.scrollHeight}`,
      };
    },
    { grow: growHeader, meta: META },
  );
}

for (const width of [1440, 1100]) {
  for (const grow of [false, true]) {
    test(`the tab strip sticks right under the detail header at ${width}${grow ? ', header taller than 64 px' : ''}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await gotoHub(page, DETAIL);
      await page.locator('h2[data-hub-title]').waitFor();
      const m = await scrolled(page, grow);
      expect(m.scrolled).toBeGreaterThan(600);
      expect(m.headerSticks).toBe(true);
      expect(m.headerTop, JSON.stringify(m)).toBe(m.boxTop);
      if (grow) expect(m.headH).toBeGreaterThan(64);
      expect(Math.abs(m.barTop - m.headerBottom), JSON.stringify(m)).toBeLessThanOrEqual(1);
    });
  }
}

test('on a phone the header scrolls away and the tab strip sticks at the top', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoHub(page, DETAIL);
  await page.locator('h2[data-hub-title]').waitFor();
  const m = await scrolled(page, true);
  expect(m.headerSticks).toBe(false);
  expect(Math.abs(m.barTop - m.boxTop), JSON.stringify(m)).toBeLessThanOrEqual(1);
});
