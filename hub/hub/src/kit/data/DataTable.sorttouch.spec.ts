// Playwright (UI-H): a sortable header's icon on a device without hover. Touch shows an
// unsorted column's icon faintly (0.4) so the header reads as sortable, and the sorted column's icon (.sortActive, the same
// element) at full strength. A hover device keeps the unsorted icon hidden at rest. Computed opacity needs a real browser.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const ICON = '[class*="DataTable-module__sortIcon"]';

/** The computed opacity of every visible sort icon on the page, split by sorted (sortActive) and unsorted. */
async function icons(page: Page): Promise<{ sorted: string[]; unsorted: string[] }> {
  return page.evaluate((sel) => {
    const out = { sorted: [] as string[], unsorted: [] as string[] };
    for (const el of document.querySelectorAll(sel)) {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      (/DataTable-module__sortActive/.test(el.getAttribute('class') ?? '') ? out.sorted : out.unsorted).push(getComputedStyle(el).opacity);
    }
    return out;
  }, ICON);
}

/** Sorts one visible column (a tap on touch, a click elsewhere), then moves the pointer off and drops focus. */
async function sortOne(page: Page, touch: boolean): Promise<void> {
  const btn = page.locator(`button:has(${ICON}):visible`).first();
  await (touch ? btn.tap() : btn.click());
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect.poll(async () => (await icons(page)).sorted.length).toBeGreaterThan(0);
}

test.describe('sort icon on touch (390, no hover)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('an unsorted icon shows at 0.4 and the sorted one at 1', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=table');
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
    // Before any sort every visible icon is unsorted; at 390 a table may show a single sortable column, so the sorted
    // state is read after the tap and only the icons still unsorted then (if any) are checked again.
    await expect.poll(async () => [...new Set((await icons(page)).unsorted)]).toEqual(['0.4']);
    await sortOne(page, true);
    // Opacity eases (--dur-hover): poll until the transition from the tap settles.
    await expect.poll(async () => [...new Set((await icons(page)).sorted)]).toEqual(['1']);
    expect((await icons(page)).unsorted.filter((o) => o !== '0.4')).toEqual([]);
  });
});

test.describe('sort icon on a hover device (1440)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('an unsorted icon is hidden at rest and the sorted one shows at 1', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=table');
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(false);
    await expect.poll(async () => (await icons(page)).unsorted.length).toBeGreaterThan(0);
    await sortOne(page, false);
    // Opacity eases (--dur-hover): poll until the transition from the tap or click settles.
    await expect.poll(async () => [...new Set((await icons(page)).unsorted)]).toEqual(['0']);
    await expect.poll(async () => [...new Set((await icons(page)).sorted)]).toEqual(['1']);
  });
});
