// The Plans columns sit in the kit PlanGrid: each column's name, marks line, price and body take one row of the grid,
// so the prices and bodies of a row line up even when one column carries two marks ("2 of your servers" and
// "Suggested for you", the plans-suggested link). Checked at 1350, 760 and 390, light and dark, never scrolling sideways.
import { type Page, expect } from '@playwright/test';
import { gotoHub, noSideScroll, test } from '@app/e2e';

const section = (page: Page) => page.locator('[data-section="plans"]');

async function partTops(page: Page, part: string) {
  const all = await section(page)
    .locator('[data-kit="plan-card"]')
    .evaluateAll(
      (els, p) => els.map((el) => ({ row: Math.round(el.getBoundingClientRect().top), part: el.querySelector(`[data-plan-part="${p}"]`)?.getBoundingClientRect().top })),
      part,
    );
  const rows = new Map<number, number[]>();
  for (const c of all) if (c.part !== undefined) rows.set(c.row, [...(rows.get(c.row) ?? []), Math.round(c.part)]);
  return [...rows.values()];
}

for (const width of [1350, 760, 390])
  for (const theme of ['light', 'dark'] as const)
    test(`at ${width} ${theme}: the prices and bodies of each row of plan columns line up`, async ({ hubPage: page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await gotoHub(page, '/billing?plan=fam-pro', { theme });
      await expect(section(page).locator('[data-kit="plan-grid"]')).toHaveCount(1);
      await expect(section(page).locator('[data-kit="plan-card"]').first()).toBeVisible();
      const cards = await section(page).locator('[data-kit="plan-card"]:not([data-wide])').count();
      expect(cards, 'plan columns').toBeGreaterThan(1);
      for (const part of ['price', 'body']) {
        const rows = await partTops(page, part);
        // Every plan column is measured: a part that no card draws (a renamed marker) fails here instead of passing unseen.
        expect(rows.flat().length, `${part}: a top for every plan column`).toBeGreaterThanOrEqual(cards);
        // With room for columns the cards share rows: a grid that put every card on its own row would line up with nothing.
        if (width >= 760) expect(Math.max(...rows.map((r) => r.length)), `${part}: plan columns side by side`).toBeGreaterThanOrEqual(2);
        for (const tops of rows) expect(Math.max(...tops) - Math.min(...tops), `${part} tops in one row`).toBeLessThanOrEqual(1);
      }
      // Stacked in one column, a card with no marks draws no empty marks line: its price follows its name at the card's
      // step (--sp-3, 12 px). Side by side, the line keeps its pill height so the prices of a row line up (above).
      if (width === 390) {
        const gaps = await section(page)
          .locator('[data-kit="plan-card"]')
          .evaluateAll((els) =>
            els
              .filter((el) => el.querySelector('[data-plan-part="marks"]')?.childNodes.length === 0)
              .map((el) => {
                const head = el.querySelector('[data-plan-part="head"]')!.getBoundingClientRect();
                const price = el.querySelector('[data-plan-part="price-line"]')?.getBoundingClientRect();
                return price ? Math.round(price.top - head.bottom) : null;
              })
              .filter((g) => g !== null),
          );
        expect(gaps.length, 'a plan column with no marks').toBeGreaterThan(0);
        for (const g of gaps) expect(g, 'name to price with no marks line').toBeLessThanOrEqual(13);
      }
      await noSideScroll(page);
    });
