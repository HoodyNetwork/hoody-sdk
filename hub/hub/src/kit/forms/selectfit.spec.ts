// Playwright: a Select's listbox stays inside its popover. React Aria gives the popover a
// max-height that fits the room above or below the trigger; the listbox (and the search line of a searchable Select)
// must shrink to it and scroll. With its own taller max-height the listbox overflowed the popover over its own trigger,
// so a mouse press (a Select opens on press start) ended on an unpainted option and changed the value. The fixture is
// the Logs "What" picker (9 sources, the longest phone Select in the Hub), moved to mid-screen the way a Select lower
// down a form sits: then neither side has room for its list. No page puts a long Select there yet, so the move is
// the test's own (padding above the page's content).
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

for (const [width, height] of [[390, 844], [390, 700], [360, 640]] as const) {
  test(`@selectfit one mouse press on a Select opens only its list, inside its popover (${width}x${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await gotoHub(page, '/logs');
    const trigger = page.locator('#hub-main button[aria-haspopup="listbox"]').first();
    await expect(trigger).toBeVisible();
    await trigger.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const main = document.querySelector<HTMLElement>('#hub-main')!;
      main.style.paddingTop = `${Math.max(0, innerHeight / 2 - (r.top + r.height / 2))}px`;
    });
    const before = await trigger.innerText();
    const b = (await trigger.boundingBox())!;
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    // A real press: down, a human's hold, up, at the trigger's middle.
    await page.mouse.move(x, y);
    await page.mouse.down();
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(300);
    // The press only opened the list: it is still open and the value did not change.
    await expect(list).toBeVisible();
    expect(await trigger.innerText(), 'the press chose nothing').toBe(before);
    const fit = await list.evaluate((l, [px, py]) => {
      const pop = l.closest('[data-placement]')!.getBoundingClientRect();
      const r = l.getBoundingClientRect();
      const under = document.elementFromPoint(px, py);
      return { top: r.top, bottom: r.bottom, popTop: pop.top, popBottom: pop.bottom, coversTrigger: !!under && !!under.closest('[data-placement]') };
    }, [x, y] as const);
    expect(fit.top, 'the list starts inside its popover').toBeGreaterThanOrEqual(fit.popTop - 1);
    expect(fit.bottom, 'the list ends inside its popover').toBeLessThanOrEqual(fit.popBottom + 1);
    expect(fit.coversTrigger, 'the popover does not lie over the trigger').toBe(false);
    // Every option is still reachable: the last one scrolls into view, inside the popover.
    const last = list.getByRole('option').last();
    await last.scrollIntoViewIfNeeded();
    const lb = (await last.boundingBox())!;
    expect(lb.y + lb.height).toBeLessThanOrEqual(fit.popBottom + 1);
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
  });
}
