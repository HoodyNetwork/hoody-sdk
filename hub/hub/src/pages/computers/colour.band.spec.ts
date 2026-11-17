// Playwright: a computer's page carries exactly ONE band in its colour, on the
// element that stays on screen. In a pane at >= 600 px of content that is the sticky header (the tab strip sticks right
// under it); below 600 px, where the header scrolls away, it is the sticky tab bar. Under forced colours the band keeps
// the computer's colour while the name uses system colours. Container queries and sticky need a real browser.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const PATH = '/computers?sel=atlas.00a1';

/** The visible bands (not display:none) with where each sits. */
async function visibleBands(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-detail-accent], [data-tab-accent]')]
      .filter((b) => b.getClientRects().length > 0 && getComputedStyle(b).display !== 'none')
      .map((b) => ({ on: b.hasAttribute('data-detail-accent') ? 'header' : 'tabs', color: b.getAttribute('data-detail-accent') ?? b.getAttribute('data-tab-accent'), h: Math.round(b.getBoundingClientRect().height), top: Math.round(b.getBoundingClientRect().top) })),
  );
}

async function open(page: Page, width: number, height = 800) {
  await page.setViewportSize({ width, height });
  await gotoHub(page, PATH);
  await page.locator('[data-detail-accent], [data-tab-accent]').first().waitFor({ state: 'attached' });
}

/** Scrolls whatever scrolls (the detail pane's box, else the page) by `by` px; returns how far it really moved. */
async function scrollDetail(page: Page, by: number): Promise<number> {
  return page.evaluate((dy) => {
    let el: HTMLElement | null = document.querySelector('[data-tab-accent], [data-detail-accent]');
    while (el && el !== document.body) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        const before = el.scrollTop;
        el.scrollTop += dy;
        return el.scrollTop - before;
      }
      el = el.parentElement;
    }
    const before = window.scrollY;
    window.scrollBy(0, dy);
    return window.scrollY - before;
  }, by);
}

test('1440: one band, on the header; with a header wrapped to two lines the tab strip still sticks directly under it after a real scroll', async ({ page }) => {
  await open(page, 1440, 520);
  const bands = await visibleBands(page);
  expect(bands).toHaveLength(1);
  expect(bands[0]?.on).toBe('header');
  expect(bands[0]?.h).toBe(4);
  const one = await page.evaluate(() => document.querySelector<HTMLElement>('header:has([data-detail-accent])')!.offsetHeight);
  // Grow the header by one more line (a wrapped name or a second meta row does exactly this): the strip must follow.
  await page.evaluate(() => {
    const titles = document.querySelector<HTMLElement>('header:has([data-detail-accent]) [data-hub-title]')!.closest('div')!.parentElement!;
    const extra = document.createElement('div');
    extra.textContent = 'a second line in the header';
    extra.style.minHeight = '28px';
    titles.append(extra);
  });
  await page.waitForFunction((h) => document.querySelector<HTMLElement>('header:has([data-detail-accent])')!.offsetHeight > h, one, { timeout: 15000 });
  const moved = await scrollDetail(page, 300);
  expect(moved, 'the page really scrolled').toBeGreaterThan(0);
  const g = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('header:has([data-detail-accent])')!;
    const bar = document.querySelector<HTMLElement>('[data-tab-accent]')!.parentElement!;
    const live = header.parentElement!.style.getPropertyValue('--detail-head-live');
    return { headBottom: header.getBoundingClientRect().bottom, barTop: bar.getBoundingClientRect().top, headH: header.offsetHeight, live };
  });
  expect(g.headH).toBeGreaterThan(one);
  expect(Math.abs(g.barTop - g.headBottom)).toBeLessThanOrEqual(1);
  expect(g.live).toBe(`${g.headH}px`);
  const after = await visibleBands(page);
  expect(after).toHaveLength(1);
  expect(after[0]?.top).toBeGreaterThanOrEqual(0);
});

test('390: one band, on the sticky tab bar, still on screen after scrolling', async ({ page }) => {
  await open(page, 390);
  const bands = await visibleBands(page);
  expect(bands).toHaveLength(1);
  expect(bands[0]?.on).toBe('tabs');
  expect(await scrollDetail(page, 500), 'the page really scrolled').toBeGreaterThan(0);
  const after = await visibleBands(page);
  expect(after).toHaveLength(1);
  expect(after[0]?.top).toBeGreaterThanOrEqual(0);
  expect(after[0]?.top).toBeLessThan(120);
});

// A full page (the kit gallery's DetailPage, no pane): the header never sticks, so the tab bar carries the one band at
// every width and keeps it on screen while the page scrolls.
for (const width of [1440, 390]) {
  test(`full page ${width}: one band, on the sticky tab bar, on screen after scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await gotoHub(page, '/_kit');
    await page.locator('[data-tab-accent]').first().waitFor({ state: 'attached' });
    const bands = await visibleBands(page);
    expect(bands).toHaveLength(1);
    expect(bands[0]?.on).toBe('tabs');
    expect(await scrollDetail(page, 500), 'the page really scrolled').toBeGreaterThan(0);
    const after = await visibleBands(page);
    expect(after).toHaveLength(1);
    expect(after[0]?.top).toBeGreaterThanOrEqual(0);
    // stuck under the shell's own top bar, not scrolled away
    expect(after[0]?.top).toBeLessThan(200);
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`forced colours (${scheme}): the band keeps the computer colour; the name uses system colours`, async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active', colorScheme: scheme });
    await open(page, 1440);
    const r = await page.evaluate(() => {
      const band = document.querySelector<HTMLElement>('[data-detail-accent]')!;
      const hex = band.getAttribute('data-detail-accent')!;
      const probe = document.createElement('span');
      probe.style.color = 'CanvasText';
      document.body.append(probe);
      const canvasText = getComputedStyle(probe).color;
      probe.remove();
      const rgb = (h: string) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
      const title = document.querySelector<HTMLElement>('header [data-hub-title]')!;
      return { bg: getComputedStyle(band).backgroundColor, want: rgb(hex), adjust: getComputedStyle(band).forcedColorAdjust, title: getComputedStyle(title).color, canvasText, titleAdjust: getComputedStyle(title).forcedColorAdjust };
    });
    expect(r.bg).toBe(r.want);
    expect(r.adjust).toBe('none');
    expect(r.titleAdjust).not.toBe('none');
    expect(r.title).toBe(r.canvasText);
  });
}

test('390: Run confirm keeps the mark attached before a long name (the name wraps inside its unit)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoHub(page, '/computers?sel=atlas.00a1&tab=run');
  await page.getByRole('textbox', { name: 'Command' }).fill('rm -rf /tmp/x');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.waitFor();
  const g = await dialog.evaluate((d) => {
    const strong = d.querySelector<HTMLElement>('[data-computer-color]')!.nextElementSibling as HTMLElement;
    strong.textContent = 'a-very-long-computer-name-'.repeat(6);
    const mark = d.querySelector<HTMLElement>('[data-computer-color]')!.getBoundingClientRect();
    const name = strong.getBoundingClientRect();
    const box = d.getBoundingClientRect();
    return { markRight: mark.right, nameLeft: name.left, markTop: mark.top, markBottom: mark.bottom, nameTop: name.top, nameBottom: name.bottom, nameH: name.height, nameRight: name.right, boxRight: box.right };
  });
  expect(g.nameH, 'the long name wrapped to more than one line').toBeGreaterThan(30);
  expect(g.markRight).toBeLessThanOrEqual(g.nameLeft + 1);
  expect(g.markTop).toBeGreaterThanOrEqual(g.nameTop - 1);
  expect(g.markBottom).toBeLessThanOrEqual(g.nameBottom + 1);
  expect(g.nameRight).toBeLessThanOrEqual(g.boxRight);
});
