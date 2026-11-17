// The kit Ledger and ShortcutTable on the gallery (/_kit?tab=pieces #ledgers): every amount, the total's
// included, ends on one edge (one end-aligned column) and keeps one line, a long label wraps beside its amount, the
// note sits under its row, the total comes after its rule; the shortcut labels all start on one edge. At 1440 and 390,
// both themes, left to right and right to left, nothing wider than the page.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

for (const theme of ['light', 'dark'] as const)
  for (const width of [1440, 390] as const)
    for (const dir of ['ltr', 'rtl'] as const)
      test.describe(`ledger at ${width}, ${theme}, ${dir}`, () => {
        test.use({ viewport: { width, height: 900 } });
        test('amounts in one end column on one line; note under its row; total after its rule; shortcut labels aligned', async ({ page }) => {
          await gotoHub(page, '/_kit?tab=pieces', { theme });
          if (dir === 'rtl') await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
          const sec = page.locator('#ledgers');
          await sec.scrollIntoViewIfNeeded();
          const m = await sec.getByLabel('Credit', { exact: true }).evaluate((dl) => {
            const rtl = getComputedStyle(dl).direction === 'rtl';
            const amounts = [...dl.querySelectorAll('dt + dd')].map((d) => {
              const r = d.getBoundingClientRect();
              const lh = Number.parseFloat(getComputedStyle(d).lineHeight) || 20;
              return { end: rtl ? r.left : r.right, lines: Math.round(r.height / lh) };
            });
            const owed = [...dl.querySelectorAll('dt')].find((d) => d.textContent?.startsWith('A very long label'))!;
            const owedLh = Number.parseFloat(getComputedStyle(owed).lineHeight) || 20;
            const note = [...dl.querySelectorAll('dd')].find((d) => d.textContent?.startsWith('Released on'))!.getBoundingClientRect();
            const pending = [...dl.querySelectorAll('dt')].find((d) => d.textContent === 'Pending')!.getBoundingClientRect();
            const total = dl.querySelector<HTMLElement>('[data-ledger-total]')!;
            return {
              ends: amounts.map((a) => Math.round(a.end)),
              lines: amounts.map((a) => a.lines),
              owedLines: Math.round(owed.getBoundingClientRect().height / owedLh),
              noteBelow: note.top >= pending.bottom - 0.5,
              rule: Number.parseFloat(getComputedStyle(total).borderBlockStartWidth) > 0,
              totalLast: dl.lastElementChild === total,
            };
          });
          expect(new Set(m.ends).size, `one end edge: ${JSON.stringify(m.ends)}`).toBe(1);
          expect(m.lines.every((n) => n === 1), `each amount on one line: ${JSON.stringify(m.lines)}`).toBe(true);
          if (width === 390) expect(m.owedLines, 'the long label wraps beside its amount').toBeGreaterThan(1);
          expect(m.noteBelow, 'the note is under its row').toBe(true);
          expect(m.rule && m.totalLast, 'the total comes last, after its rule').toBe(true);
          const starts = await sec.locator('[data-shortcut-row] > dd').evaluateAll((dds) => {
            const rtl = dds.length > 0 && getComputedStyle(dds[0]!).direction === 'rtl';
            // Per list: the labels of one group share a start edge.
            const byList = new Map<Element, number[]>();
            for (const d of dds) {
              const r = d.getBoundingClientRect();
              const list = d.closest('dl')!;
              byList.set(list, [...(byList.get(list) ?? []), Math.round(rtl ? r.right : r.left)]);
            }
            return [...byList.values()].map((v) => new Set(v).size);
          });
          expect(starts.every((n) => n === 1), `labels aligned per group: ${JSON.stringify(starts)}`).toBe(true);
          await expect(sec.getByRole('heading', { name: 'Moving around' })).toBeVisible();
          const over = await page.locator('#hub-main').evaluate((x) => x.scrollWidth - x.clientWidth);
          expect(over).toBeLessThanOrEqual(0);
        });
      });
