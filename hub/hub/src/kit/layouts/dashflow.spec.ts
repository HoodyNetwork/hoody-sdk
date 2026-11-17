// Playwright: DashboardPage flow="ordered" draws widgets in DOM (= Tab) order. With the default dense packing a later
// small widget moves up into an earlier hole; ordered never does. Home uses ordered (its card order is the person's).
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

/** Puts small, wide, small into the page's dashboard grid and reports each one's row top in DOM order. Measured in
 *  the same task, before the row fill (a MutationObserver) runs. */
async function tops(page: Page, flow?: string): Promise<{ flow: string; tops: number[] }> {
  return page.evaluate((f) => {
    const grid = document.querySelector<HTMLElement>('[data-flow]');
    if (!grid) throw new Error('no dashboard grid');
    if (f) grid.style.gridAutoFlow = f;
    const box = (span: string) => {
      const el = document.createElement('div');
      el.style.gridColumn = span;
      el.style.minHeight = '40px';
      return el;
    };
    grid.replaceChildren(box('span 1'), box('1 / -1'), box('span 1'));
    return { flow: getComputedStyle(grid).gridAutoFlow, tops: [...grid.children].map((c) => (c as HTMLElement).offsetTop) };
  }, flow);
}

test('Home dashboard draws widgets in DOM order (flow ordered), where dense packing would not', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await gotoHub(page, '/home');
  await page.locator('[data-flow="ordered"]').waitFor();
  const ordered = await tops(page);
  expect(ordered.flow).toBe('row');
  // Each later widget starts below the one before it.
  expect(ordered.tops[1]).toBeGreaterThan(ordered.tops[0]!);
  expect(ordered.tops[2]).toBeGreaterThan(ordered.tops[1]!);

  // The control: the same children under dense packing put the third widget up beside the first.
  await gotoHub(page, '/home');
  await page.locator('[data-flow="ordered"]').waitFor();
  const dense = await tops(page, 'row dense');
  expect(dense.tops[2]).toBe(dense.tops[0]);
});
