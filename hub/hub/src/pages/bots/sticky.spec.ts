// Playwright: the Bot pane's tab strip sticks exactly under what stays above it. On a wide pane the
// header stays stuck at the top and the strip sits right under it: no part of the strip under the header, no band of
// scrolling content between them. On a narrow pane (the header stacks and scrolls away) the strip sticks at the top
// of the scroll box, with no band of content above it.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const URL = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

interface Stuck {
  found: boolean;
  scrolled: boolean;
  headSticky: boolean;
  /** The stuck strip's top minus the edge it must meet: the header's bottom (wide) or the scroll box's top (narrow). */
  gap: number;
}

/** Scrolls the strip's scroll box well past the strip's place, then measures where the stuck strip sits. */
const stuck = (page: Page): Promise<Stuck> =>
  page.evaluate(async () => {
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    const main = document.getElementById('hub-main');
    const list = main?.querySelector('[role=tablist]');
    let bar: HTMLElement | null = null;
    for (let el = list as HTMLElement | null; el && el !== main && !bar; el = el.parentElement) if (getComputedStyle(el).position === 'sticky') bar = el;
    const head = main?.querySelector('h2')?.closest('header') ?? null;
    if (!main || !list || !bar || !head) return { found: false, scrolled: false, headSticky: false, gap: NaN };
    let scroller: Element = document.scrollingElement ?? document.documentElement;
    for (let el = bar.parentElement; el; el = el.parentElement) {
      if (/auto|scroll|overlay/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1) {
        scroller = el;
        break;
      }
    }
    // The Activity log opens at its end, so the strip may already be stuck: start from the scroll's top.
    scroller.scrollTop = 0;
    await frame();
    const isDoc = scroller === document.scrollingElement || scroller === document.documentElement;
    const top = () => (isDoc ? 0 : Math.max(0, scroller.getBoundingClientRect().top));
    const stuckAt = Number.parseFloat(getComputedStyle(bar).top) || 0;
    const natural = scroller.scrollTop + bar.getBoundingClientRect().top - top() - stuckAt;
    scroller.scrollTop = Math.min(natural + 80, scroller.scrollHeight - scroller.clientHeight);
    await frame();
    await frame();
    // Scrolled at least 24px past the strip's own place, so a strip that does not stick has moved away by then.
    const scrolled = scroller.scrollTop >= natural + 24;
    const headSticky = getComputedStyle(head).position === 'sticky';
    const edge = headSticky ? head.getBoundingClientRect().bottom : top();
    return { found: true, scrolled, headSticky, gap: bar.getBoundingClientRect().top - edge };
  });

for (const width of [1440, 1100, 390]) {
  test(`the Bot tab strip sticks right under what stays above it at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await gotoHub(page, URL);
    await expect(page.locator('#hub-main').getByRole('tablist').first()).toBeVisible(); // reason: stuck() measures the first tab strip in #hub-main, so wait for that same one
    const m = await stuck(page);
    expect(m.found, 'a sticky tab strip under the Bot header').toBe(true);
    expect(m.scrolled, 'the content is tall enough to scroll the strip to its stuck place').toBe(true);
    expect(m.gap, m.headSticky ? 'strip top minus header bottom' : 'strip top minus scroll box top').toBeGreaterThanOrEqual(-0.5);
    expect(m.gap).toBeLessThanOrEqual(0.5);
  });
}
