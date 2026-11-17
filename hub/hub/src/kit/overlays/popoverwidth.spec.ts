// Playwright: the Popover width classes are the tokens' values, so a token edit moves them: .lg is --popover-w-lg
// (360), .wide is --picker-w-wide (640), both capped at 100vw - 2 * --sp-4 on a phone. The probe puts a div with each
// module class on the page and reads its computed width, so it does not need a trigger that opens that size.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

async function widths(page: Page) {
  await gotoHub(page, '/_kit?tab=overlays');
  return page.evaluate(() => {
    const out = { lg: -1, wide: -1 };
    for (const want of ['lg', 'wide'] as const) {
      let cls = '';
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try { rules = sheet.cssRules; } catch { continue; }
        for (const rule of Array.from(rules)) {
          const sel = (rule as CSSStyleRule).selectorText;
          const m = sel && new RegExp(`^\\.(Popover-module__${want}_[\\w-]+)$`).exec(sel);
          if (m) cls = m[1]!.replace(/\\/g, '');
        }
      }
      if (!cls) continue;
      const d = document.createElement('div');
      d.className = cls;
      document.body.appendChild(d);
      out[want] = d.getBoundingClientRect().width;
      d.remove();
    }
    return {
      ...out,
      tokenLg: getComputedStyle(document.documentElement).getPropertyValue('--popover-w-lg').trim(),
      tokenWide: getComputedStyle(document.documentElement).getPropertyValue('--picker-w-wide').trim(),
    };
  });
}

test.describe('popover widths at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('lg is 360 and wide is 640, from the tokens', async ({ page }) => {
    const w = await widths(page);
    expect(w.tokenLg).toBe('360px');
    expect(w.tokenWide).toBe('640px');
    expect(w.lg).toBe(360);
    expect(w.wide).toBe(640);
  });
});

test.describe('popover widths at 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('both are capped at the viewport minus two --sp-4', async ({ page }) => {
    const w = await widths(page);
    expect(w.lg).toBe(390 - 32);
    expect(w.wide).toBe(390 - 32);
  });
});
