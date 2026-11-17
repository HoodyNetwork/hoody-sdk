// Playwright: the gallery's checkout ledger (/_kit?tab=pieces #ledgers, "Payment"): the
// warn row "Short by" is in the warning colour with its mark, its amount on the ledger's one end edge; the strip sits
// right under the list with the sentence and Add funds, which keeps one line (under the sentence when they don't fit
// side by side). At 1440 and 390, light and dark; nothing wider than the page.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

for (const theme of ['light', 'dark'] as const)
  for (const width of [1440, 390] as const)
    test.describe(`checkout ledger at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: 900 } });
      test('the warn row is tinted and marked, the strip is joined under the list with its one button', async ({ page }) => {
        await gotoHub(page, '/_kit?tab=pieces', { theme });
        const dl = page.locator('#ledgers').getByLabel('Payment', { exact: true });
        await dl.scrollIntoViewIfNeeded();
        const m = await dl.evaluate((list) => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--hx-warn)';
          list.append(probe);
          const warn = getComputedStyle(probe).color;
          probe.remove();
          const row = list.querySelector<HTMLElement>('[data-ledger-tone="warn"]')!;
          const amounts = [...list.querySelectorAll('dt + dd')].map((d) => Math.round(d.getBoundingClientRect().right));
          const strip = list.parentElement!.querySelector<HTMLElement>('[data-ledger-strip]')!;
          const button = strip.querySelector('button')!;
          const bb = button.getBoundingClientRect();
          const lh = Number.parseFloat(getComputedStyle(button).lineHeight) || 20;
          return {
            tinted: getComputedStyle(row.querySelector('dt')!).color === warn && getComputedStyle(row.querySelector('dd')!).color === warn,
            mark: row.querySelector('dt svg') !== null,
            ends: new Set(amounts).size,
            under: strip.getBoundingClientRect().top >= list.getBoundingClientRect().bottom - 0.5 && strip.getBoundingClientRect().top - list.getBoundingClientRect().bottom <= 24,
            inside: bb.right <= strip.getBoundingClientRect().right + 0.5 && bb.left >= strip.getBoundingClientRect().left - 0.5,
            oneLine: bb.height < lh * 2 + 16,
            bar: Number.parseFloat(getComputedStyle(strip).borderInlineStartWidth) >= 3,
          };
        });
        expect(m.tinted, 'the warn row\'s words are in the warning colour').toBe(true);
        expect(m.mark, 'the warn row has its mark').toBe(true);
        expect(m.ends, 'amounts on one end edge').toBe(1);
        expect(m.under, 'the strip is joined under the list').toBe(true);
        expect(m.inside && m.oneLine, 'Add funds is whole inside the strip').toBe(true);
        expect(m.bar, 'the strip has the warning edge bar').toBe(true);
        const over = await page.locator('#hub-main').evaluate((x) => x.scrollWidth - x.clientWidth);
        expect(over).toBeLessThanOrEqual(0);
      });
    });
