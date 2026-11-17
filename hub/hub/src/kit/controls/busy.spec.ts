// Playwright: a busy button keeps its resting width, so a button turning busy never shifts its row, and its dots never
// sit before the label. Measured on the gallery's Buttons matrix (the busy row against the medium row, every kind) at
// 1350 and 390, light and dark. Where the dots sit per kind is Button.busyplace.test.tsx.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/strings.en.json';

const ROWS = ['md', 'sm', 'xs', 'toolbar', 'disabled', 'soft', 'busy'] as const;
const KINDS = ['primary', 'secondary', 'ghost', 'danger', 'primaryDanger', 'row'] as const;
const specimen = (page: Page, kind: (typeof KINDS)[number], row: (typeof ROWS)[number]) =>
  page.locator('[data-gallery="buttons"]').getByRole('button', { name: gallery[`kind.${kind}`], exact: true }).nth(ROWS.indexOf(row)); // reason: every row repeats the kind's name; the rows come in ROWS order

const measure = (b: Locator) =>
  b.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const label = el.querySelector('[data-btn-label]')!.getBoundingClientRect();
    const dots = [...el.querySelectorAll('[data-spinner-slot] span')].map((d) => d.getBoundingClientRect()).filter((d) => d.width > 0);
    const ink = getComputedStyle(el.querySelector('[data-btn-label]')!).opacity;
    return { w: Math.round(r.width * 10) / 10, labelStart: label.left, dotsStart: dots.length ? Math.min(...dots.map((d) => d.left)) : null, ink };
  });

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1350, 390]) {
    test.describe(`busy buttons at ${width} (${theme})`, () => {
      test.use({ viewport: { width, height: 900 } });
      test('every kind: as wide busy as at rest, the dots never before the label', async ({ page }) => {
        await gotoHub(page, '/_kit?tab=actions', { theme });
        await page.locator('[data-gallery="buttons"]').waitFor({ timeout: 15_000 });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        for (const kind of KINDS) {
          const rest = await measure(specimen(page, kind, 'md'));
          const busy = await measure(specimen(page, kind, 'busy'));
          expect(busy.w, `${kind}: busy width = resting width`).toBe(rest.w);
          expect(busy.dotsStart, `${kind}: the dots are drawn`).not.toBeNull();
          expect(busy.dotsStart!, `${kind}: the dots start no earlier than the label`).toBeGreaterThanOrEqual(busy.labelStart - 0.5);
        }
      });
    });
  }
}
