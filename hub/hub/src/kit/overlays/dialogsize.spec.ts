// Playwright: the xl dialog size: 800 wide with its top at 7.5vh and up to 85vh tall from 600 px
// wide, and the same 100vw - 32 on a phone, where it keeps the 20vh top and 70vh limit of every dialog. The gallery's
// `open=code` is the xl sample and `open=rename` the lg one (unchanged). The box measured is the dialog's frame, the
// parent of role=dialog.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

async function frame(page: Page, open: 'code' | 'rename', name: RegExp) {
  await gotoHub(page, `/_kit?tab=overlays&open=${open}`);
  const dlg = page.getByRole('dialog', { name });
  await dlg.waitFor();
  // The pop-in animation ends first, so the box is at rest.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
  return dlg.evaluate((d) => {
    const m = d.parentElement as HTMLElement;
    const r = m.getBoundingClientRect();
    return { width: r.width, top: r.top, maxHeight: getComputedStyle(m).maxHeight, vh: window.innerHeight };
  });
}

const XL = /^Mount atlas on your device$/;
const LG = /^Rename /;

for (const c of [
  { vw: 1440, vh: 900, xl: { width: 800, top: 67.5, max: 765 }, lg: { width: 560, top: 180, max: 630 } },
  { vw: 700, vh: 900, xl: { width: 668, top: 67.5, max: 765 }, lg: null },
  { vw: 390, vh: 844, xl: { width: 358, top: 168.8, max: 590.8 }, lg: null },
]) {
  test.describe(`dialog size at ${c.vw}`, () => {
    test.use({ viewport: { width: c.vw, height: c.vh }, ...(c.vw < 600 ? { hasTouch: true, isMobile: true } : {}) });

    test('xl: 800 wide (100vw - 32 when narrower), top and height as the viewport allows', async ({ page }) => {
      const f = await frame(page, 'code', XL);
      expect(Math.abs(f.width - c.xl.width), 'xl width').toBeLessThanOrEqual(1);
      expect(Math.abs(f.top - c.xl.top), 'xl top').toBeLessThanOrEqual(2);
      expect(Math.abs(parseFloat(f.maxHeight) - c.xl.max), 'xl max-height').toBeLessThanOrEqual(1);
    });

    if (c.lg) {
      test('lg stays 560 at 20vh and 70vh', async ({ page }) => {
        const f = await frame(page, 'rename', LG);
        expect(Math.abs(f.width - c.lg!.width), 'lg width').toBeLessThanOrEqual(1);
        expect(Math.abs(f.top - c.lg!.top), 'lg top').toBeLessThanOrEqual(2);
        expect(Math.abs(parseFloat(f.maxHeight) - c.lg!.max), 'lg max-height').toBeLessThanOrEqual(1);
      });
    }
  });
}
