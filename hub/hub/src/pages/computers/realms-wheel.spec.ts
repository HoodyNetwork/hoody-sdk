// Playwright: Get a computer > More options > Other realms is a capped list (PickerPanel maxRows) inside the drawer's
// scrolling body. Firefox keeps a run of wheel ticks scrolling the drawer once the run started there, even after the list
// slid under the resting pointer, while it still dispatches each tick at the list. Playwright's own wheel does not latch,
// so the spec sends the tick as the page sees it (a DOM wheel event on a row of the list, which no browser scrolls by
// itself): the list must take it and move, the drawer must not. A tick on the drawer body beside the list stays the
// browser's (not cancelled).
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

test('a wheel tick on the capped realm list scrolls the list, not the drawer; beside it the drawer keeps its own scroll', async ({ page }) => {
  // links.create (`?new=1`) opens Get a computer (links.spec.ts @create), with no locator to pick among the page's buttons.
  await gotoHub(page, '/computers?new=1', { state: 'createManyRealms' });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /^More options/ }).click();
  const list = page.locator('[role=dialog] [data-capped]').first();
  await list.scrollIntoViewIfNeeded();
  const r = await page.evaluate(() => {
    const l = document.querySelector<HTMLElement>('[role=dialog] [data-capped]')!;
    const body = document.querySelector<HTMLElement>('[data-drawer-body]')!;
    const row = l.querySelector<HTMLElement>('[role="checkbox"]')!;
    const before = { list: l.scrollTop, body: body.scrollTop };
    const onRow = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    row.dispatchEvent(onRow);
    const after = { list: l.scrollTop, body: body.scrollTop };
    const beside = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    body.dispatchEvent(beside);
    return { before, after, rowCancelled: onRow.defaultPrevented, besideCancelled: beside.defaultPrevented };
  });
  expect(r.after.list).toBeGreaterThan(r.before.list);
  expect(r.after.body).toBe(r.before.body);
  expect(r.rowCancelled).toBe(true);
  expect(r.besideCancelled).toBe(false);
});
