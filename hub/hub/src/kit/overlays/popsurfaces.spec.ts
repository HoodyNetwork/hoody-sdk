// Playwright: the computed side of popsurfaces.test.ts on the gallery's overlays tab, light and
// dark. Bars are opaque and painted --bar-bg (dialog footer, phone sheet head), a control on a bar takes the bar as its
// ring gap, the dialog draws the one --pop-line frame, and an unavailable menu row dims by colour (--pop-off, full
// opacity) while its reason stays --hx-muted; an available danger row keeps --hx-danger.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { focusRingGap } from '@app/e2e-focus';
import gallery from '../gallery/overlays.strings.en.json';
import kit from './strings.en.json';

/** A token's colour as the page computes it. */
const colour = (page: Page, token: string) =>
  page.evaluate((t) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${t})`;
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, token);
const style = (l: Locator, prop: 'backgroundColor' | 'borderTopColor' | 'color' | 'opacity') => l.evaluate((el, p) => getComputedStyle(el)[p], prop);

for (const theme of ['light', 'dark'] as const) {
  test.describe(`wide (${theme})`, () => {
    test.use({ viewport: { width: 1350, height: 900 } });

    test(`the dialog footer is an opaque bar inside the one frame (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, '/_kit?tab=overlays', { theme });
      await page.getByRole('button', { name: gallery['open.confirm'], exact: true }).click();
      const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
      await expect(dialog).toBeVisible();
      const foot = dialog.getByRole('button').last().locator('xpath=..');
      const bar = await colour(page, '--bar-bg');
      expect(bar, 'the bar token is opaque').not.toMatch(/rgba\(.*,\s*0\)|transparent/);
      expect(await style(foot, 'backgroundColor'), 'footer fill').toBe(bar);
      // Every footer button is visible on the bar: its fill differs from the bar, or its edge reaches 3:1.
      const seen = await foot.evaluate((el) => {
        const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number);
        const lum = (c: string) => { const [r, g, b] = rgb(c).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0); };
        const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]; return (x + 0.05) / (y + 0.05); };
        const bar = getComputedStyle(el).backgroundColor;
        return [...el.querySelectorAll('button')].map((b) => {
          const cs = getComputedStyle(b);
          const fill = cs.backgroundColor;
          const opaque = (rgb(fill)[3] ?? 1) > 0;
          const edge = parseFloat(cs.borderTopWidth) > 0 ? ratio(cs.borderTopColor, bar) : 0;
          return { name: b.textContent ?? '', ok: (opaque && fill !== bar) || edge >= 3 };
        });
      });
      expect(seen.length, 'footer buttons found').toBeGreaterThan(0);
      for (const b of seen) expect(b.ok, `footer button "${b.name}" visible on the bar`).toBe(true);
      const frame = dialog.locator('xpath=ancestor-or-self::*[contains(@class, "modal")][1]');
      expect(await style(frame, 'borderTopColor'), 'dialog frame').toBe(await colour(page, '--pop-line'));
    });

    test(`an unavailable menu row dims by colour, its reason stays readable; danger stays red (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, '/_kit?tab=overlays', { theme });
      await page.getByRole('button', { name: gallery['btn.menu'], exact: true }).click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      const start = menu.getByRole('menuitem', { name: new RegExp(`^${gallery['menu.start']}`) });
      expect(await style(start, 'opacity'), 'no opacity on an off row').toBe('1');
      expect(await style(start, 'color'), 'off label').toBe(await colour(page, '--pop-off'));
      expect(await style(start.getByText(gallery['menu.startWhy']), 'color'), 'reason line').toBe(await colour(page, '--hx-muted'));
      const del = menu.getByRole('menuitem', { name: new RegExp(`^${gallery['menu.delete']}`) });
      expect(await style(del, 'color'), 'available danger').toBe(await colour(page, '--hx-danger'));
    });
  });

  test.describe(`phone (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test(`the phone sheet's head is a bar and its Close takes the bar's ring gap (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, '/_kit?tab=overlays', { theme });
      await page.getByRole('button', { name: gallery['btn.picker'], exact: true }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();
      const bar = await colour(page, '--bar-bg');
      const close = sheet.getByRole('button', { name: kit.close, exact: true });
      expect(await style(close.locator('xpath=..'), 'backgroundColor'), 'sheet head fill').toBe(bar);
      expect(await focusRingGap(page, close), 'Close ring gap').toBe(bar);
    });
  });
}
