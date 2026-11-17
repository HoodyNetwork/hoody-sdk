// Playwright: a Tabs `end` slot never squeezes the tab list. When the tabs and the
// end do not fit on one row, the end goes to its own row under the strip and every tab stays whole; when they fit, the
// end stays on the strip's row. No page puts an `end` in its tabs now (Scripts dropped its save bar; the Board draws its
// controls beside a bar-only Tabs), so the end's own tests measure the kit gallery's Tabs with an
// action at its end (/_kit?tab=nav, "Computer, with an action"); the tests that need a wide end or label widen it with a spacer.
// The Board is still checked here: its controls stay on the tabs' row with every Board tab whole (its own spec,
// pages/board/oneline.spec.ts, covers the rest). Boxes need a real browser, not jsdom.
// Each check first proves the expected tabs are there (an empty list would cut none) and the fonts are in, then
// retries the geometry until it holds, since the strip measures itself after layout and again on every resize.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import board from '../../pages/board/strings.en.json';
import gallery from '../gallery/kit2.strings.en.json';

type Measured = Awaited<ReturnType<typeof measure>>;

/** The strip's boxes: every tab whole inside the scrolling list, the list not scrolling, the end's box, the page width. */
async function measure(page: Page, list: Locator, end: Locator) {
  // Two frames: the strip measures itself after layout.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const strip = await list.evaluate((el) => {
    const sc = el.parentElement!;
    const box = sc.getBoundingClientRect();
    const cut = [...el.querySelectorAll('[role="tab"]')].filter((t) => {
      const r = t.getBoundingClientRect();
      return r.left < box.left - 0.5 || r.right > box.right + 0.5;
    }).length;
    // The bar: list → scroller → strip → bar (Tabs.tsx); it carries data-stacked while the end has its own row.
    const stacked = sc.parentElement!.parentElement!.hasAttribute('data-stacked');
    return { w: Math.round(box.width), need: el.scrollWidth, scrolls: sc.scrollWidth > sc.clientWidth + 1, cut, bottom: box.bottom, right: box.right, stacked };
  });
  const e = await end.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right };
  });
  // Every control on the row under the strip lies whole inside the window (an end wider than the bar is never pushed off an edge).
  const rowCut = await page.evaluate(
    (top) =>
      [...document.querySelectorAll('#hub-main button')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.top >= top - 1 && r.top < top + 56 && (r.left < -0.5 || r.right > window.innerWidth + 0.5);
      }).length,
    strip.bottom,
  );
  return { strip, end: e, rowCut, winW: page.viewportSize()!.width };
}

/**
 * The strip shows exactly `labels`, the fonts have loaded, then `check` passes on a fresh measurement (retried until
 * the layout settles; a strip that never settles fails with the last measurement in the message).
 */
async function settled(page: Page, list: Locator, end: Locator, labels: readonly string[], check: (m: Measured) => void) {
  await list.waitFor({ timeout: 20_000 });
  await end.waitFor({ timeout: 20_000 });
  await expect(list.getByRole('tab')).toHaveText([...labels]);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(async () => {
    check(await measure(page, list, end));
    await noSideScroll(page);
  }).toPass({ timeout: 10_000 });
}

/** The end has its own row under the strip, and nothing is cut or pushed off the window (every button of that row, not only the end's first). */
function expectStacked(m: Measured) {
  const at = JSON.stringify(m);
  expect(m.strip.scrolls, at).toBe(false);
  expect(m.strip.cut, at).toBe(0);
  expect(m.end.top, at).toBeGreaterThanOrEqual(m.strip.bottom - 1);
  expect(m.end.right, at).toBeLessThanOrEqual(m.winW);
  expect(m.rowCut, at).toBe(0);
}

/** The end shares the strip's row, after the tabs, and every tab is whole. */
function expectBeside(m: Measured) {
  const at = JSON.stringify(m);
  expect(m.strip.cut, at).toBe(0);
  expect(m.end.top, at).toBeLessThan(m.strip.bottom - 1);
  expect(m.end.left, at).toBeGreaterThanOrEqual(m.strip.right - 1);
}

const galleryPage = (page: Page) => gotoHub(page, '/_kit?tab=nav'); // the Tabs specimens are in the gallery's Navigation tab
const galleryTabs = [gallery['tabs.overview'], gallery['tabs.connect'], gallery['tabs.run']];
const galleryStrip = (page: Page) => page.getByRole('tablist', { name: gallery['tabs.endLabel'] });
const galleryEnd = (page: Page) => page.getByRole('button', { name: gallery['tabs.endAction'] });

test.describe('Tabs with an end at 1440 (kit gallery)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // The answer follows the content and the width both ways, repeatedly, matches the widths it is made of, and
  // holds still once given.
  const bar = (page: Page) => {
    const list = galleryStrip(page);
    const end = galleryEnd(page);
    /**
     * The bar over 12 frames: how often data-stacked changed and its last value; then the widths the answer is made of
     * (the bar's inner width; the tab list's and the end's natural widths plus the bar's gap) and the end's content height.
     */
    const sample = () =>
      list.evaluate(
        (el) =>
          new Promise<{ flips: number; stacked: boolean; inner: number; need: number; endH: number }>((done) => {
            // list → scroller → strip → bar (Tabs.tsx); the end slot is the bar's last child.
            const bar = el.parentElement!.parentElement!.parentElement!;
            let last = bar.hasAttribute('data-stacked');
            let flips = 0;
            let frames = 0;
            const tick = () => {
              const now = bar.hasAttribute('data-stacked');
              if (now !== last) flips++;
              last = now;
              if (++frames < 12) return void requestAnimationFrame(tick);
              const cs = getComputedStyle(bar);
              const endEl = bar.lastElementChild as HTMLElement;
              const endBox = endEl.getBoundingClientRect();
              const endCs = getComputedStyle(endEl);
              done({
                flips,
                stacked: last,
                inner: bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
                // As Tabs counts it: the list, its overflow menu button when it has one, the gap and the end.
                need:
                  el.getBoundingClientRect().width +
                  (bar.querySelector('[class*="tabMenu"]')?.getBoundingClientRect().width ?? 0) +
                  (parseFloat(cs.columnGap) || 0) +
                  endBox.width,
                // The end's content height: one line or more (a stacked end adds block padding around it).
                endH: endEl.clientHeight - parseFloat(endCs.paddingTop) - parseFloat(endCs.paddingBottom),
              });
            };
            requestAnimationFrame(tick);
          }),
      );
    /**
     * Once the bar stops changing: its answer is the one its widths give (stacked exactly when the tabs, the gap and the
     * end overrun the inner width; within 2 px of the line either answer is allowed), `want` when given, the geometry
     * agrees, and 12 more frames pass with no flip. Returns the last sample.
     */
    const holds = async (want?: boolean) => {
      let answer = false;
      let last = '';
      await expect(async () => {
        const s = await sample().catch((e: Error) => {
          last = `no sample: ${e.message.split('\n')[0]}`;
          throw e;
        });
        const at = JSON.stringify(s);
        last = at;
        expect(s.flips, at).toBe(0);
        if (Math.abs(s.need - s.inner) >= 2) expect(s.stacked, at).toBe(s.need > s.inner);
        if (want !== undefined) expect(s.stacked, at).toBe(want);
        answer = s.stacked;
      }).toPass({ timeout: 10_000 }).catch((e: Error) => {
        // toPass reports only its timeout: name the last sample, so a red says which widths disagreed.
        throw new Error(`the bar never settled; last sample ${last}`, { cause: e });
      });
      await settled(page, list, end, galleryTabs, (m) => {
        const at = JSON.stringify(m);
        expect(m.strip.stacked, at).toBe(answer);
        expect(m.strip.cut, at).toBe(0);
        if (answer) expectStacked(m);
        else {
          expectBeside(m);
          // beside, the list does not scroll either (tabs whole only at the current scroll position would not do) and no button is cut
          expect(m.strip.scrolls, at).toBe(false);
          expect(m.rowCut, at).toBe(0);
        }
      });
      const after = await sample();
      expect(after.flips, `data-stacked changed ${after.flips} times after settling on ${answer}`).toBe(0);
      expect(after.stacked, JSON.stringify(after)).toBe(answer);
      return after;
    };
    return { list, holds };
  };

  test('the end moves under the strip and back as the end or a label grows and shrinks, and then holds still', async ({ page }) => {
    test.setTimeout(90_000);
    await galleryPage(page);
    await galleryStrip(page).scrollIntoViewIfNeeded();
    const { list, holds } = bar(page);
    /**
     * Widen the end slot or the first tab's label by a spacer sized from the bar, or take it out again (`none`). The end
     * grows to 24 px under the bar's inner width, net of its own gap, so alone it still fits its row on one line; the label
     * grows until the tabs alone fill all but half the end's width (alone they still fit, so no tab is cut). Either way
     * the tabs and the end no longer share a row. Taking the end's spacer out changes only the end's width: the bar keeps
     * its height and the tab list its width, so only Tabs' watch on the end can bring the end back beside the tabs.
     */
    const grow = (slot: 'end' | 'label' | 'none') =>
      list.evaluate((el, which) => {
        const bar = el.parentElement!.parentElement!.parentElement!;
        const endEl = bar.lastElementChild as HTMLElement;
        // The first tab and its label span; the spacer goes inside the label, so the tab itself widens.
        const label = el.querySelector('[role="tab"]')!.querySelector('span')!;
        for (const old of bar.querySelectorAll('[data-test-spacer]')) old.remove();
        if (which === 'none') return;
        const cs = getComputedStyle(bar);
        const inner = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const listW = el.getBoundingClientRect().width + (bar.querySelector('[class*="tabMenu"]')?.getBoundingClientRect().width ?? 0);
        const endW = endEl.getBoundingClientRect().width;
        const endGap = parseFloat(getComputedStyle(endEl).columnGap) || 0;
        const spacer = document.createElement('span');
        spacer.dataset.testSpacer = '';
        spacer.style.display = 'inline-block';
        spacer.style.flex = 'none';
        spacer.style.width = `${Math.floor(which === 'end' ? inner - endW - endGap - 24 : inner - listW - endW / 2)}px`;
        (which === 'end' ? endEl : label).append(spacer);
      }, slot);

    const start = await holds(false);
    for (let round = 0; round < 2; round++) {
      await grow('end');
      const grown = await holds(true);
      // Still one line: the end grew sideways only, so the step back is a width change alone.
      expect(grown.endH, JSON.stringify({ start, grown })).toBeLessThanOrEqual(start.endH + 1);
      await grow('none');
      await holds(false);
      await grow('label');
      await holds(true);
      await grow('none');
      await holds(false);
    }
  });

  test('the end moves under the strip and back as the window crosses the fit both ways, and then holds still', async ({ page }) => {
    test.setTimeout(90_000);
    await galleryPage(page);
    await galleryStrip(page).scrollIntoViewIfNeeded();
    const { list, holds } = bar(page);
    // The specimen's tabs and action fit at every width, so a spacer in the first tab's label, sized at 1440 to leave
    // 150 px, makes the two overrun inside the range. The range stops at 1000 px: by 900 the gallery's column is so
    // narrow that the widened tab alone no longer fits its list (it scrolls).
    // The gallery's columns change with the width, so each step is judged by its own widths (holds), not by the window.
    // Beyond that: each window width answers the same going down and coming back up, and both answers occur each way.
    await list.evaluate((el) => {
      const bar = el.parentElement!.parentElement!.parentElement!;
      const endEl = bar.lastElementChild as HTMLElement;
      const cs = getComputedStyle(bar);
      const inner = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const menu = bar.querySelector('[class*="tabMenu"]')?.getBoundingClientRect().width ?? 0;
      const free = inner - el.getBoundingClientRect().width - menu - (parseFloat(cs.columnGap) || 0) - endEl.getBoundingClientRect().width;
      const spacer = document.createElement('span');
      spacer.dataset.testSpacer = '';
      spacer.style.display = 'inline-block';
      spacer.style.flex = 'none';
      spacer.style.width = `${Math.max(0, Math.floor(free - 150))}px`;
      el.querySelector('[role="tab"]')!.querySelector('span')!.append(spacer);
    });
    const widths = [1440, 1360, 1280, 1200, 1100, 1000];
    const firstWay = new Map<number, boolean>();
    for (const dir of [widths, [...widths].reverse()]) {
      const seen = new Set<boolean>();
      for (const w of dir) {
        await page.setViewportSize({ width: w, height: 900 });
        const { stacked } = await holds();
        seen.add(stacked);
        if (firstWay.has(w)) expect(stacked, `at ${w} coming back`).toBe(firstWay.get(w));
        else firstWay.set(w, stacked);
      }
      expect([...seen].sort(), `going ${dir[0]} → ${dir[dir.length - 1]}`).toEqual([false, true]);
    }
  });
});

for (const w of [600, 680]) {
  test.describe(`Board at ${w}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test(`the Board's controls stay beside the tab, with its note, and every Board tab stays whole at ${w}`, async ({ page }) => {
      test.setTimeout(90_000);
      await gotoHub(page, '/board');
      // Three columns fit at 1440; narrowed, they no longer do: the Board fits them on one page and the strip carries its note.
      await page.getByRole('button', { name: board.layout, exact: true }).click();
      await page.getByRole('menuitemradio', { name: board['layout.three-cols'] }).click(); // a preset is a one-of choice
      await page.setViewportSize({ width: w, height: 900 });
      // The note is in the controls (its words, or its short form named by them).
      await expect(page.getByText(board['overflow.fitted'], { exact: true }).or(page.getByRole('button', { name: board['overflow.fitted'], exact: true })).first()).toBeAttached(); // reason: the short form's button holds the sentence as screen-reader text too, so both match
      await settled(page, page.getByRole('tablist', { name: board['board.tabs'] }), page.locator('[data-strip-end]'), [board['board.main']], (m) => {
        expect(m.strip.stacked, JSON.stringify(m)).toBe(false);
        expectBeside(m);
      });
    });
  });
}
