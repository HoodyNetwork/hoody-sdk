// Playwright: a Panel head's actions stay inside the panel and a choice there keeps
// whole labels (segments when they fit, a Select when they do not); a SecretInput's field and its Show button stay
// inside their cell, clear of the field's text (on a coarse pointer too). Checked on the kit gallery at a phone and a
// desktop width.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';

for (const width of [390, 1440]) {
  test(`Panel head actions stay inside the panel and keep whole labels at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/_kit?tab=table');
    await page.locator('#hub-main section header [class*="panelActions"]').first().waitFor(); // CSS: the first panel head with actions
    const m = await page.evaluate(() =>
      [...document.querySelectorAll('#hub-main section > header [class*="panelActions"]')].map((a) => {
        const panel = a.closest('section')!.getBoundingClientRect();
        const r = a.getBoundingClientRect();
        // A label is cut when a part of the control is narrower than its own content.
        const cut = [...a.querySelectorAll('[role="radio"], [role="radio"] *, button, button *')].filter((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1).map((e) => e.textContent);
        return { left: Math.round(r.left), right: Math.round(r.right), panelLeft: Math.round(panel.left), panelRight: Math.round(panel.right), cut };
      }),
    );
    expect(m.length, JSON.stringify(m)).toBeGreaterThanOrEqual(2);
    for (const x of m) {
      expect(x.right, JSON.stringify(x)).toBeLessThanOrEqual(x.panelRight + 1);
      expect(x.left, JSON.stringify(x)).toBeGreaterThanOrEqual(x.panelLeft - 1);
      expect(x.cut, JSON.stringify(x)).toEqual([]);
    }
    await noSideScroll(page);
  });

  test(`a SecretInput field and its Show button stay inside their cell at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await expectSecretFits(page);
  });
}

// A coarse pointer makes the Show button 44 px (--icon-hit): the field's end padding must still hold all of it.
test.describe('coarse pointer', () => {
  test.use({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
  test('a SecretInput Show button stays out of the text area at 390 on a coarse pointer', async ({ page }) => {
    await expectSecretFits(page);
  });
});

/** Every gallery SecretInput: the field inside its cell; the Show button inside the field, clear of its text area. */
async function expectSecretFits(page: Page) {
  await gotoHub(page, '/_kit?tab=secure');
  await page.locator('#hub-main [data-secret-input]').first().waitFor(); // CSS: the gallery's first secret input
  const m = await page.evaluate(() =>
    [...document.querySelectorAll('#hub-main [data-secret-input]')].map((i) => {
      const cell = i.parentElement!.getBoundingClientRect();
      const r = i.getBoundingClientRect();
      const c = getComputedStyle(i);
      // Where typed text can reach: the field's end minus its end padding and border.
      const textEnd = r.right - parseFloat(c.paddingRight) - parseFloat(c.borderRightWidth);
      const b = i.parentElement!.querySelector('button')?.getBoundingClientRect();
      return {
        left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), cellRight: Math.round(cell.right), textEnd: Math.round(textEnd),
        btn: b ? { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom) } : null,
      };
    }),
  );
  expect(m.length, JSON.stringify(m)).toBeGreaterThanOrEqual(1);
  for (const x of m) {
    const at = JSON.stringify(x);
    expect(x.right, at).toBeLessThanOrEqual(x.cellRight + 1);
    if (!x.btn) continue;
    // The Show button sits inside the field's own box and never over its text.
    expect(x.btn.right, at).toBeLessThanOrEqual(x.right);
    expect(x.btn.left, at).toBeGreaterThanOrEqual(x.textEnd);
    expect(x.btn.top, at).toBeGreaterThanOrEqual(x.top);
    expect(x.btn.bottom, at).toBeLessThanOrEqual(x.bottom);
  }
}
