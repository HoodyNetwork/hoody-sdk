// Playwright: on a wrapped header Tab follows what is seen. At 390 the end group (⋯, and the
// pane control where one shows) keeps the name row and the page's buttons go to the line below; the header's buttons
// take focus top row first, then left to right. Both header variants: a list-detail pane's DetailHeader (computers) and
// a full-page DetailPage's PageHeader with its `menu` (a VM's own page). Real layout, so a real browser.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

/** The header's visible buttons in Tab order (from the title), and the same buttons in reading order (row, then x). */
async function orders(page: Page, title: string, name: string) {
  const heading = page.locator(`#hub-main ${title}[data-hub-title]`).filter({ hasText: name }).first();
  await heading.waitFor();
  await heading.focus();
  const tabbed: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const at = await page.evaluate(([sel, nm]) => {
      const el = document.activeElement as HTMLElement | null;
      const head = [...document.querySelectorAll(`#hub-main ${sel}[data-hub-title]`)].find((h) => h.textContent?.includes(nm))?.closest('header');
      if (!el || !head || !head.contains(el)) return null;
      return (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s*\(.*$/, '').trim();
    }, [title, name] as const);
    if (at === null) break;
    tabbed.push(at);
  }
  const seen = await page.evaluate(([sel, nm]) => {
    const head = [...document.querySelectorAll(`#hub-main ${sel}[data-hub-title]`)].find((h) => h.textContent?.includes(nm))!.closest('header')!;
    return [...head.querySelectorAll<HTMLElement>('button, a[href]')]
      .filter((b) => b.offsetParent !== null && b.tabIndex >= 0)
      .map((b) => ({ n: (b.getAttribute('aria-label') ?? b.textContent ?? '').replace(/\s*\(.*$/, '').trim(), r: b.getBoundingClientRect() }))
      .sort((a, b) => (Math.abs(a.r.top - b.r.top) > 8 ? a.r.top - b.r.top : a.r.left - b.r.left))
      .map((x) => x.n);
  }, [title, name] as const);
  return { tabbed, seen };
}

test.describe('wrapped header: Tab follows the visual order at 390', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('list-detail pane (computers detail): ⋯ on the name row, then the buttons below', async ({ page }) => {
    await gotoHub(page, '/computers?sel=cedar.00c3');
    const r = await orders(page, 'h2', 'cedar');
    expect(r.tabbed.length, JSON.stringify(r)).toBeGreaterThan(1);
    expect(r.tabbed, JSON.stringify(r)).toEqual(r.seen.filter((n) => r.tabbed.includes(n)));
    expect(r.tabbed[0], JSON.stringify(r)).toMatch(/^Actions for cedar/);
  });

  test('full-page DetailPage (a VM\'s own page): the PageHeader ⋯ before the actions', async ({ page }) => {
    await gotoHub(page, '/vms/web-1');
    const r = await orders(page, 'h1', 'web-1');
    expect(r.tabbed.length, JSON.stringify(r)).toBeGreaterThan(1);
    expect(r.tabbed, JSON.stringify(r)).toEqual(r.seen.filter((n) => r.tabbed.includes(n)));
  });
});
