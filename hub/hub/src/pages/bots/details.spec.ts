// Playwright: the Bot's Details panel opens from the header's Details button. On a wide pane it is a
// column beside the log (after it in the reading direction); on a phone-wide pane it sits above the log, never over it (the
// waiting card ends the thread). Opening it puts the keyboard in it and brings it on screen (a wide pane holds it there, beside
// the reader's place), and Message on a running task
// is then on screen and opens its form. Measured left-to-right and right-to-left.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const URL = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

/** Presses `el` once the page has heard the scroll that bringing it into view causes. The log tells a reader who scrolled up from
 *  content that grew by the frame their scroll event arrives in; a press that scrolls and clicks at once can have its scroll
 *  heard in the frame of the layout the click starts (a cold page), and the log then reads it as a resize and follows the end,
 *  taking the opened panel out of view. Two frames after the scroll, the event has been delivered. */
async function pressHeard(page: Page, el: Locator) {
  await el.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  await el.click();
}

const geom = (page: Page) =>
  page.evaluate(() => {
    const tab = document.querySelector('#hub-main [data-activity]')!;
    const aside = tab.querySelector(':scope > [data-details-panel]');
    const col = Array.from(tab.children).find((c) => c.querySelector('ol'))!;
    const a = aside?.getBoundingClientRect();
    const l = col.getBoundingClientRect();
    const pane = tab.getBoundingClientRect();
    const strip = document.querySelector('#hub-main [role="tablist"]')!.getBoundingClientRect();
    let sc: Element | null = col.parentElement;
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    const s = (sc ?? document.scrollingElement)!;
    const fromEnd = s.scrollHeight - s.clientHeight - s.scrollTop;
    const jump = !!document.querySelector('#hub-main [data-activity] [data-say-dock]')?.textContent?.includes('Jump to newest');
    return { fromEnd, jump, stripBottom: strip.bottom, open: !!aside, a: a ? { left: a.left, right: a.right, top: a.top, bottom: a.bottom } : null, l: { left: l.left, right: l.right, top: l.top, bottom: l.bottom }, paneW: pane.width, vh: window.innerHeight };
  });

for (const [width, height, dir] of [[2400, 1200, 'ltr'], [2400, 1200, 'rtl'], [1350, 900, 'ltr'], [390, 844, 'ltr']] as const) {
  test(`Details opens from the header, beside the log on a wide pane and above it on a narrow one, at ${width} px ${dir}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await gotoHub(page, URL);
    if (dir === 'rtl') await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
    await expect(page.getByRole('textbox', { name: 'Message the Bot' })).toBeVisible();
    const toggle = page.locator('#hub-main [data-details-toggle]');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect((await geom(page)).open, 'closed by default').toBe(false);
    await pressHeard(page, toggle);
    const panel = page.getByRole('complementary', { name: 'Details' });
    await expect(panel).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    // Settled: the log's own answers to the new layout (a resize at the end) come a few frames later and must not move it.
    await page.waitForTimeout(600);
    const g = await geom(page);
    expect(g.a).not.toBeNull();
    // On screen once opened, under the stuck tab strip (focus brought it in; a wide pane's panel is held there).
    expect(g.a!.top, 'the panel\'s top is on screen, under the tab strip').toBeGreaterThanOrEqual(g.stripBottom - 1);
    expect(g.a!.top, 'the panel\'s top is on screen').toBeLessThan(g.vh);
    if (g.paneW >= 1000) {
      // Its own column, after the log in the reading direction, side by side.
      if (dir === 'ltr') expect(g.a!.left, 'beside the log, after it').toBeGreaterThanOrEqual(g.l.right - 1);
      else expect(g.a!.right, 'beside the log, after it (right to left)').toBeLessThanOrEqual(g.l.left + 1);
      // The reader keeps their place in the thread: the log is not moved to show the panel, and a reader at the end stays
      // there and keeps following it (the narrower log rewraps taller: it holds the end, no Jump to newest).
      expect(g.l.top, 'the log keeps the reader\'s place (scrolled, not jumped to its top)').toBeLessThan(g.a!.top);
      expect(g.fromEnd, 'still at the end of the thread after opening').toBeLessThanOrEqual(24);
      expect(g.jump, 'no Jump to newest after opening at the end').toBe(false);
    } else {
      expect(g.a!.bottom, 'above the log, never over it').toBeLessThanOrEqual(g.l.top + 1);
    }
    const msg = panel.getByRole('button', { name: 'Message the task “Read deploy log”', exact: true });
    await msg.scrollIntoViewIfNeeded();
    await expect(msg).toBeInViewport();
    await msg.click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}

test('closing the panel at 390 px gives the log its place back and the keyboard to the Details button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, `${URL}&details=1`);
  const panel = page.getByRole('complementary', { name: 'Details' });
  await expect(panel).toBeVisible();
  // On a phone-wide pane the kit folds the panel's Close into its More actions menu (ActionBar, under 600 px).
  const direct = panel.getByRole('button', { name: 'Close details' });
  if (await direct.count()) await direct.click();
  else {
    await panel.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Close details' }).click();
  }
  await expect(panel).toHaveCount(0);
  await expect(page.locator('#hub-main [data-details-toggle]')).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Message the Bot' })).toBeVisible();
});
