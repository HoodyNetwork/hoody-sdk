// Playwright: the real kit components, reached by keyboard on the gallery,
// show focus in forced-colors mode (Windows high contrast). Each Tab stop must draw a visible outline on the focused
// element or on the part around it that draws its ring (a field's box, a switch's label, an open card); box-shadow
// does not count, forced colours drop it.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

/** The Tab stops under the gallery's own content with no visible outline on the stop or its 3 nearest ancestors. */
async function unmarked(page: Page, stops: number): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press('Tab');
    const miss = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a === document.body || !a.closest('#hub-main')) return null;
      const shows = (el: Element) => {
        const c = getComputedStyle(el);
        return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 1 && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(c.outlineColor);
      };
      let el: Element | null = a;
      for (let k = 0; k < 4 && el; k++, el = el.parentElement) if (shows(el)) return null;
      const name = (a.getAttribute('aria-label') ?? a.textContent ?? '').trim().slice(0, 30);
      return `${a.tagName.toLowerCase()}.${String(a.className).split(' ')[0]} "${name}"`;
    });
    if (miss && !out.includes(miss)) out.push(miss);
  }
  return out;
}

for (const tab of ['forms', 'nav', 'table', 'groups', 'pieces', 'controls', 'data', 'text', 'widgets']) {
  test(`forced colors: every keyboard stop on the ${tab} gallery shows a focus outline`, async ({ page }) => {
    test.setTimeout(300_000); // 40 Tab stops, each read back
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoHub(page, `/_kit?tab=${tab}`);
    await page.locator('#hub-main').waitFor();
    expect(await unmarked(page, 40)).toEqual([]);
  });
}
