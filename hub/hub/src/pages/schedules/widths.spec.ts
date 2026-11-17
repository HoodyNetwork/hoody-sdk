// Playwright: a schedule's detail body starts where its title starts, at phone and wide widths
// (the kit DetailBody's inset, never the page's own).
import { type Page, expect } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';

// The title's left edge vs the body's first block, in the detail pane.
async function insetGap(page: Page): Promise<{ title: number; body: number }> {
  const head = page.locator('#hub-main header[class*="detailHeader"]');
  await expect(head.locator('[data-hub-title]')).toBeVisible();
  return head.evaluate((h) => {
    const title = h.querySelector('[data-hub-title]')!.getBoundingClientRect().left;
    const body = h.nextElementSibling as HTMLElement;
    const first = [...body.querySelectorAll('p, dl, h3, section, [role="radiogroup"], [role="status"]')].find((e) => (e as HTMLElement).offsetParent !== null && e.getBoundingClientRect().width > 0);
    return { title, body: first ? first.getBoundingClientRect().left : -1 };
  });
}

for (const width of [360, 390, 1100]) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(async ({ hubPage }) => {
      await hubPage.setViewportSize({ width, height: 900 });
    });

    test('the detail body starts where the detail title starts', async ({ hubPage: page }) => {
      await gotoHub(page, '/schedules?sel=cron%3Auser%2Fa1');
      const g = await insetGap(page);
      expect(g.body, 'a body block is drawn').toBeGreaterThan(0);
      expect(Math.abs(g.body - g.title), `title ${g.title} vs body ${g.body}`).toBeLessThanOrEqual(1);
    });
  });
}
