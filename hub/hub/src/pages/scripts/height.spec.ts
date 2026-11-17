// Playwright: the Scripts list/detail page is held to the main area's height, so the detail pane scrolls and its
// header stays in view, as on the other list/detail pages. Run by hub:check --page scripts.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

// "Order status" has the tallest detail in the fixtures (failures and a public link): taller than a 900 px window.
async function openTallScript(page: Page): Promise<void> {
  await gotoHub(page, '/scripts');
  const rows = page.getByRole('table', { name: strings.title }).locator('tbody tr[data-row-id]');
  await rows.filter({ hasText: 'Order status' }).first().locator('td').first().click(); // reason: atlas and borealis both list an Order status; atlas's row comes first
  await expect(page.getByRole('tab', { name: strings['tab.code'] })).toBeVisible();
}

// The main area keeps its own end padding (the shell's bottom strip and action-button room) below any page, so it may
// scroll by that much on every list/detail page; the page box itself must fit inside it.
const mainBox = (page: Page) => page.locator('#hub-main').evaluate((m) => ({ client: m.clientHeight, top: m.getBoundingClientRect().top }));
const pageBox = (page: Page) => page.locator('[class*="ListDetailPage-module__page"]').first().evaluate((p) => p.getBoundingClientRect().height);

for (const [width, height] of [[1440, 900], [1100, 700], [390, 844]] as const) {
  test(`at ${width} by ${height} the Code tab's save bar stays in the window while the detail scrolls`, async ({ page }) => {
    // Open at a full height (a short window can leave the row under the list's own scroller), then shrink to the size under test.
    await page.setViewportSize({ width, height: 900 });
    await openTallScript(page);
    await page.setViewportSize({ width, height });
    await page.getByRole('tab', { name: strings['tab.code'] }).click();
    const discard = page.getByRole('button', { name: strings['code.discard'] });
    await expect(discard).toBeVisible();
    // The whole save bar (DetailPage's footer: its outcome and every button), Save and Discard each, lie inside the window on both axes,
    // and no other element covers Save's centre (the shell's own chrome included).
    const footer = page.locator('[class*="detailFooter"]').filter({ has: discard });
    const save = footer.getByRole('button', { name: strings['code.save'], exact: true });
    const inWindow = async () => {
      for (const l of [footer, save, discard]) {
        const b = await l.boundingBox();
        if (!b || b.x < -0.5 || b.y < -0.5 || b.x + b.width > width + 0.5 || b.y + b.height > height + 0.5) return false;
      }
      return save.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!top && el.contains(top);
      });
    };
    await expect.poll(inWindow, 'on arrival').toBe(true);
    // The scroller the wheel reaches: the nearest box above the tab panel that can scroll. When there is one, it must have moved.
    const scroller = () =>
      page.getByRole('tabpanel').evaluate((el) => {
        for (let e: Element | null = el; e; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== 'visible') return { can: true, top: e.scrollTop };
        return { can: false, top: 0 };
      });
    const before = await scroller();
    const panel = (await page.getByRole('tabpanel').boundingBox())!;
    await page.mouse.move(panel.x + panel.width / 2, Math.min(panel.y + 40, height - 120));
    await page.mouse.wheel(0, 3000);
    if (before.can) await expect.poll(async () => (await scroller()).top, 'the detail scrolled').toBeGreaterThan(before.top);
    await expect.poll(inWindow, 'after scrolling').toBe(true);
  });
}

for (const width of [1100, 1440]) {
  test(`at ${width} px a tall script's detail scrolls in its own pane, not the main area`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openTallScript(page);
    const main = await mainBox(page);
    expect(await pageBox(page), 'the list/detail page is held to the main area').toBeLessThanOrEqual(main.client + 1);

    const tabs = page.getByRole('tab', { name: strings['tab.code'] });
    const box = (await tabs.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.wheel(0, 3000);
    // The nearest box that scrolled is the detail's own, not the main area.
    await expect
      .poll(() => page.getByRole('tabpanel').evaluate((el) => {
        for (let e: Element | null = el; e; e = e.parentElement) if (e.scrollTop > 0) return e.id || 'pane';
        return '';
      }))
      .toBe('pane');
    const after = (await tabs.boundingBox())!;
    expect(after.y, 'the Code tab is still below the top of the main area').toBeGreaterThanOrEqual(main.top);
  });
}

test('on a phone the detail of a tall script is still reached by scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTallScript(page);
  const link = page.getByText(strings['share.title'], { exact: true });
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeInViewport();
});
