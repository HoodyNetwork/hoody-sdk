// Playwright: a StatusPill column sized 'fit' with the pill's metrics holds its widest pill
// whole: no pill runs past its cell's padding box, and the column is no wider than that pill plus the cell's padding and a
// few px. The kit Data view's State column (/_kit?tab=dataview), light and dark, 1440 and 900 (table presentation).
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

for (const theme of ['light', 'dark'] as const)
  for (const width of [1440, 900] as const)
    test.describe(`pill fit at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: 900 } });
      test(`the State column holds its widest pill whole, with no spare width, at ${width} ${theme}`, async ({ page }) => {
        await gotoHub(page, '/_kit?tab=dataview', { theme });
        const table = page.getByRole('table');
        await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });
        await page.evaluate(() => document.fonts.ready);
        // The widths settle after the kit's own face loads and a render, which fonts.ready alone does not promise: poll.
        const read = () => table.evaluate((t) => {
          const heads = [...t.querySelectorAll('thead th')];
          const at = heads.findIndex((h) => /state/i.test(h.textContent ?? ''));
          const cells = [...t.querySelectorAll('tbody tr')].map((tr) => tr.children[at] as HTMLElement).filter(Boolean);
          return cells.map((td) => {
            const cs = getComputedStyle(td);
            const box = td.getBoundingClientRect();
            const inner = { left: box.left + parseFloat(cs.paddingLeft), right: box.right - parseFloat(cs.paddingRight) };
            const pill = (td.querySelector('[class*="pill"]') ?? td.firstElementChild) as HTMLElement;
            const r = pill.getBoundingClientRect();
            return { inside: r.left >= inner.left - 0.5 && r.right <= inner.right + 0.5, pill: r.width, room: inner.right - inner.left, cut: pill.scrollWidth > pill.clientWidth + 1 };
          });
        });
        /** What is wrong with the column now: '' once every pill sits whole and the column is no wider than its widest. */
        const wrong = async () => {
          const m = await read();
          if (!m.length) return 'the State column has no rows';
          if (m.some((c) => !c.inside)) return 'a pill runs past its cell';
          if (m.some((c) => c.cut)) return 'a pill has its words cut';
          const spare = Math.max(...m.map((c) => c.room)) - Math.max(...m.map((c) => c.pill));
          return spare > 8 ? `the column has ${Math.round(spare)} px past its widest pill` : '';
        };
        await expect.poll(wrong, { message: 'the State column holds its widest pill whole, with a few px of rounding at most', timeout: 5_000 }).toBe('');
      });
    });
