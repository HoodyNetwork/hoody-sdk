// Playwright: the Guide ends where its last section ends. Scrolled to the end,
// no empty run-off lies below the last section beyond the page's own end spacing (the 40vh scroll room is gone),
// what is below it is the page's own background, and the index still marks the section a jump went to: the last
// one at the end of the scroll, and a section too near the end to reach the top stays marked once the jump settles,
// until the reader takes the scroll over or the jump's scroll never came to rest at the end.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

/** At the end of the page's scroller: the empty run-off below the last section, and what the page allows for it. */
async function endGap(page: Page) {
  return page.evaluate(() => {
    const main = document.getElementById('hub-main') as HTMLElement;
    main.scrollTop = main.scrollHeight;
    const last = document.getElementById('guide-look') as HTMLElement;
    const px = (v: string) => parseFloat(v) || 0;
    const cs = (e: Element) => getComputedStyle(e);
    // The scroller's visible end: its box less its own end padding (the shell's room for a phone's bottom bar).
    const visibleEnd = main.getBoundingClientRect().bottom - px(cs(main).paddingBlockEnd);
    const runOff = visibleEnd - last.getBoundingClientRect().bottom;
    // The page's ordinary end spacing, from the spacing scale (not from the Guide's own boxes, which a regression could
    // grow): the grid's and the page frame's end padding, one --sp-9 each. A flex gap sits only between sections.
    const allowed = 2 * px(cs(document.documentElement).getPropertyValue('--sp-9')) + 2;
    // Every layer from the last section's parent up to the root paints nothing, or the shell's own background.
    const shellBg = cs(document.body).backgroundColor;
    const below: string[] = [];
    for (let e = last.parentElement; e; e = e.parentElement) below.push(`${e.tagName}.${e.className} ${cs(e).backgroundColor}`);
    return { runOff: Math.round(runOff), allowed: Math.round(allowed), atEnd: main.scrollTop + main.clientHeight >= main.scrollHeight - 2, shellBg, below };
  });
}

/** Waits until the page's scroller has stopped moving (12 frames alike) and the jump's scroll lock and re-read are past. */
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const main = document.getElementById('hub-main') as HTMLElement;
        const start = performance.now();
        let last = -1;
        let same = 0;
        const tick = () => {
          same = main.scrollTop === last ? same + 1 : 0;
          last = main.scrollTop;
          if (same >= 12 && performance.now() - start > 1000) done();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** Puts the page's scroller at the very end in one step (one scroll event, no input event). */
const toEnd = (page: Page) => page.evaluate(() => { const m = document.getElementById('hub-main') as HTMLElement; m.scrollTop = m.scrollHeight; });

/**
 * A section other than the last whose heading cannot reach the top of the page's scroller, even at the end of the
 * scroll: the case the jump hold exists for. Picked from the live layout, so the test follows the Guide's content.
 */
async function tooNearTheEnd(page: Page): Promise<string | undefined> {
  await expect(page.getByRole('heading', { level: 2, name: strings['look.title'] })).toBeAttached();
  await settle(page);
  return page.evaluate(() => {
    const main = document.getElementById('hub-main') as HTMLElement;
    const max = main.scrollHeight - main.clientHeight;
    const top = main.getBoundingClientRect().top;
    const sections = [...document.querySelectorAll<HTMLElement>('section[id^="guide-"]')];
    const near = sections.slice(0, -1).find((el) => el.getBoundingClientRect().top - (max - main.scrollTop) > top + 32 + 24);
    return near?.id.replace(/^guide-/, '');
  });
}

/** Tall enough that, with no room under the last section, more than the last section cannot reach the top. */
const TALL = 1600;

const indexLink = (page: Page, name: string) => page.getByRole('navigation', { name: strings['sections.label'] }).getByRole('link', { name });
const ixOf = (id: string): string => {
  const label = (strings as Record<string, string | undefined>)[`ix.${id}`];
  if (!label) throw new Error(`no index entry for the section ${id}`);
  return label;
};

for (const size of SIZES) {
  test(`the Guide ends at its last section, no empty run-off below it: ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await gotoHub(page, '/guide');
    await expect(page.getByRole('heading', { level: 2, name: strings['look.title'] })).toBeAttached();
    const g = await endGap(page);
    expect(g.atEnd).toBe(true);
    expect(g.runOff, `run-off ${g.runOff}px, allowed ${g.allowed}px`).toBeLessThanOrEqual(g.allowed);
    // Nothing below the content paints a grey of its own: the page's background shows through.
    for (const layer of g.below) expect(layer.endsWith(' rgba(0, 0, 0, 0)') || layer.endsWith(` ${g.shellBg}`), layer).toBe(true);
  });

  test(`a jump to the last section marks it, and it stays marked: ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await gotoHub(page, '/guide#connect');
    await indexLink(page, strings['ix.look']).click();
    await expect(page.getByRole('heading', { level: 2, name: strings['look.title'] })).toBeInViewport();
    await settle(page);
    await expect(indexLink(page, strings['ix.look'])).toHaveAttribute('aria-current', 'location');
  });

  test(`a jump to a section too near the end to reach the top stays marked once it settles: ${size.width}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: TALL });
    await gotoHub(page, '/guide#connect');
    const near = await tooNearTheEnd(page);
    expect(near, 'a section that cannot reach the top at this size').toBeTruthy();
    await indexLink(page, ixOf(near!)).click();
    await settle(page);
    await expect(indexLink(page, ixOf(near!))).toHaveAttribute('aria-current', 'location');
    // Scrolling away from the end and back reads the scroll again: the last section is current at the end.
    await page.evaluate(() => { const m = document.getElementById('hub-main') as HTMLElement; m.scrollTop = m.scrollTop - 400; });
    await settle(page);
    await toEnd(page);
    await expect(indexLink(page, strings['ix.look'])).toHaveAttribute('aria-current', 'location');
  });

  test(`a reader who scrolls during a jump takes the scroll over: the end then marks the last section: ${size.width}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: TALL });
    await gotoHub(page, '/guide#connect');
    const near = await tooNearTheEnd(page);
    expect(near, 'a section that cannot reach the top at this size').toBeTruthy();
    await indexLink(page, ixOf(near!)).click();
    // The wheel turns inside the jump's scroll lock, before any read could see where the jump went.
    await page.mouse.move(size.width / 2, TALL / 2);
    await page.mouse.wheel(0, -600);
    await settle(page);
    await toEnd(page);
    await expect(indexLink(page, strings['ix.look'])).toHaveAttribute('aria-current', 'location');
  });

  test(`a jump whose scroll comes to the end before its time limit still holds its section there: ${size.width}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: TALL });
    await gotoHub(page, '/guide#connect');
    const near = await tooNearTheEnd(page);
    expect(near, 'a section that cannot reach the top at this size').toBeTruthy();
    const t0 = Date.now();
    await indexLink(page, ixOf(near!)).click();
    // The same scroll off the jump's way as the time-limit case below, but the end comes well inside HOLD_MS.
    await page.evaluate(() => { const m = document.getElementById('hub-main') as HTMLElement; m.scrollTop = Math.max(0, m.scrollHeight - m.clientHeight - 1500); });
    await settle(page);
    await toEnd(page);
    expect(Date.now() - t0, 'the end came inside the hold time').toBeLessThan(3500);
    await expect(indexLink(page, ixOf(near!))).toHaveAttribute('aria-current', 'location');
  });

  test(`a scroll key during a jump takes the scroll over: the end then marks the last section: ${size.width}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: TALL });
    await gotoHub(page, '/guide#connect');
    const near = await tooNearTheEnd(page);
    expect(near, 'a section that cannot reach the top at this size').toBeTruthy();
    await indexLink(page, ixOf(near!)).click();
    // A scroll key inside the jump's scroll lock, before any read could see where the jump went.
    await page.keyboard.press('PageUp');
    await settle(page);
    await toEnd(page);
    await expect(indexLink(page, strings['ix.look'])).toHaveAttribute('aria-current', 'location');
  });

  test(`a jump whose scroll never rests at the end stops holding its section: ${size.width}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: TALL });
    await gotoHub(page, '/guide#connect');
    const near = await tooNearTheEnd(page);
    expect(near, 'a section that cannot reach the top at this size').toBeTruthy();
    await indexLink(page, ixOf(near!)).click();
    // A script moves the scroll off the jump's way (no input event), so the hold is never anchored at the end.
    await page.evaluate(() => { const m = document.getElementById('hub-main') as HTMLElement; m.scrollTop = Math.max(0, m.scrollHeight - m.clientHeight - 1500); });
    await settle(page);
    await page.waitForTimeout(4200); // reason: the hold's own time limit (HOLD_MS, 4 s after the jump) is what is under test
    await toEnd(page);
    await expect(indexLink(page, strings['ix.look'])).toHaveAttribute('aria-current', 'location');
  });
}
