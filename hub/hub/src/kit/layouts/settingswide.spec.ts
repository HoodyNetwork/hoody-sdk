// Playwright (:891): SettingsPage's summary card sticks beside the form part only. On a page with a wide part
// (Account: sign-in sessions, history, SSH keys under the form and summary columns at >= 1180), scrolling down to
// the wide part takes the card away with the form part; it is never drawn over or between the wide tables.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

/** The summary's drawn content (a Range over it, so it reads the same whichever box inside the aside carries the
 * card) and the wide part, in viewport coordinates, after scrolling the page by `by` px or to a section. */
async function boxes(page: Page, to: { by: number } | { section: string }) {
  return page.evaluate((t) => {
    const aside = document.querySelector<HTMLElement>('#hub-main aside');
    const wide = document.querySelector<HTMLElement>('[data-hub-wide-part]');
    if (!aside || !wide) return null;
    let scroller: Element | null = aside.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    const sc = scroller ?? document.scrollingElement ?? document.documentElement;
    if ('by' in t) sc.scrollTop += t.by;
    else {
      const target = document.querySelector(`[data-section="${t.section}"]`);
      if (!target) return null; // reason: a renamed section must fail, not measure the top of the page
      sc.scrollTop += target.getBoundingClientRect().top - sc.getBoundingClientRect().top - 24;
    }
    const range = document.createRange();
    range.selectNodeContents(aside);
    const card = range.getBoundingClientRect();
    return { cardTop: card.top, cardBottom: card.bottom, wideTop: wide.getBoundingClientRect().top, scrolled: sc.scrollTop, scrollerTop: Math.max(0, sc.getBoundingClientRect().top) };
  }, to);
}

for (const width of [1440, 1920]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`at ${width} px (${theme}) the Account summary never sits over the wide sections, and still sticks beside the form (891)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, '/account', { theme });
      await expect(page.locator('html')).toHaveAttribute('data-hx-theme', theme);
      await expect(page.locator('[data-hub-wide-part]')).toBeVisible();
      await expect(page.locator('#hub-main aside')).toContainText(/\S/);
      // The summary's own content, not its loading skeleton (whose 'Loading' is sr-only text).
      await expect(page.locator('#hub-main aside [role="status"]')).toHaveCount(0);
      // Beside the form part: scrolled past where the card starts, it is held at the top of the scroll area (sticky)
      // instead of scrolling away with the page.
      const start = await boxes(page, { by: 0 });
      const moved = await boxes(page, { by: 300 });
      expect(start && moved).toBeTruthy();
      // Precondition: the card starts lower than where it is held, so 'held near the top' below cannot be met by
      // a card that scrolled away (300 px up from here lands far above the scroll area).
      expect(start!.cardTop - start!.scrollerTop, 'the card starts below its held place').toBeGreaterThan(48);
      expect(start!.cardTop - start!.scrollerTop, 'the card starts below its held place').toBeLessThan(252);
      expect(moved!.scrolled - start!.scrolled, 'the page scrolled').toBeGreaterThan(250);
      expect(moved!.cardTop - moved!.scrollerTop, 'the card is held near the top').toBeGreaterThanOrEqual(0);
      expect(moved!.cardTop - moved!.scrollerTop, 'the card is held near the top').toBeLessThanOrEqual(48);
      // Down at each wide section: the card has gone with the form part, never below the wide part's top.
      for (const section of ['sessions', 'history', 'ssh']) {
        const at = await boxes(page, { section });
        expect(at, `${section}: the section exists`).not.toBeNull();
        // At the first wide section the wide part's top is where the scroll put it (24 px below the scroll area's
        // top): the check runs exactly where a card drawn over the wide part would show.
        if (section === 'sessions') expect(Math.abs(at!.wideTop - at!.scrollerTop - 24), 'scrolled to the wide part').toBeLessThanOrEqual(24);
        expect(at!.cardBottom, `${section}: the card ends above the wide part`).toBeLessThanOrEqual(at!.wideTop + 1);
      }
    });
  }
}
