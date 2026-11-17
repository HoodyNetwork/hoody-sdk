// Playwright: the Keys inspector scrolls its "may not have saved" banner into view clear of the
// sticky header at the header's MEASURED height. A stacked (taller) header must not cover it: the banner's scroll
// margin is the published header height plus the spacing token, never the fixed 64 px.
// The banner only shows after a lost save, so the check reads the margin of an element with the banner's class,
// placed where the banner sits, while the header is made as tall as a stacked one.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

for (const width of [1100, 1440]) {
  test(`the banner's scroll margin follows a stacked header, at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await gotoHub(page, '/keys?sel=hdy_9e37.3779b1');
    await page.locator('h2[data-hub-title]').waitFor();
    const m = await page.evaluate(async () => {
      const title = document.querySelector<HTMLElement>('h2[data-hub-title]');
      const header = title?.closest('header');
      const host = header?.parentElement;
      if (!title || !header || !host) throw new Error('no detail header');
      let cls = '';
      for (const sheet of [...document.styleSheets]) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const r of [...rules]) {
          const sel = (r as CSSStyleRule).selectorText ?? '';
          const hit = /\.([\w-]*unknownAnchor[\w-]*)/.exec(sel);
          cls = hit?.[1] ?? cls;
        }
      }
      if (!cls) throw new Error('no unknownAnchor rule');
      const anchor = document.createElement('div');
      anchor.className = cls;
      host.appendChild(anchor);
      // Taller, as a stacked header with a long name is.
      header.style.minHeight = '132px';
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 100));
      const sticky = getComputedStyle(header).position === 'sticky';
      return { sticky, head: header.offsetHeight, margin: parseFloat(getComputedStyle(anchor).scrollMarginTop), live: host.style.getPropertyValue('--detail-head-live') };
    });
    expect(m.head, JSON.stringify(m)).toBeGreaterThan(64);
    // 8 = --sp-2.
    expect(m.margin, JSON.stringify(m)).toBe((m.sticky ? m.head : 0) + 8);
  });
}
