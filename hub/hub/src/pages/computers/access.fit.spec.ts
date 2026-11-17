// Playwright: where the list shows its Access column, the longest word it can hold ("Couldn't check", when the API
// could not check a computer's proxy rules) fits beside the padlock: neither the word nor its cell is cut.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

test.use({ viewport: { width: 1920, height: 1080 } });

// scopeUnknown makes one computer (atlas) unchecked, so its word is the only one.
test("@access the list's Access cell shows Couldn't check whole", async ({ page }) => {
  await gotoHub(page, '/computers', { state: 'scopeUnknown' });
  const word = page.locator('[data-row-id]').getByText(strings['access.short.unchecked'], { exact: true });
  await expect(word).toBeVisible();
  const fit = await word.evaluate((el) => {
    const cell = el.closest('td, [role="cell"], [role="gridcell"]') as HTMLElement | null;
    const w = el.getBoundingClientRect();
    const c = cell?.getBoundingClientRect();
    const pad = cell ? parseFloat(getComputedStyle(cell).paddingRight) : 0;
    return {
      wordCut: el.scrollWidth > el.clientWidth + 0.5,
      cellCut: cell === null || cell.scrollWidth > cell.clientWidth + 0.5,
      inside: c !== undefined && w.right <= c.right - pad + 0.5,
    };
  });
  expect(fit).toEqual({ wordCut: false, cellCut: false, inside: true });
});
