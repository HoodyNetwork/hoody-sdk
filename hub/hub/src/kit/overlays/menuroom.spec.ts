// Playwright: a menu uses all the room on its side of the trigger. React Aria gives the popover a max-height that
// fits the room above or below the trigger; the menu has no smaller cap of its own, so a long menu with room for it
// shows every item without scrolling, and scrolls only when the room really is short (staying inside its popover and
// the screen). A fixed 480px cap cut the Files row menu in half with the screen empty below it.
// The fixture's first row menu is 555px tall; at 1400x1000 the room below its trigger holds it all.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import kit from '@kit/strings.en.json';

const APP = '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp';
const rowActions = (page: Page) => page.locator('tbody tr').first().getByRole('button', { name: kit['table.rowActions'] });

async function openMenu(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await gotoHub(page, APP);
  const btn = rowActions(page);
  await expect(btn).toBeVisible();
  await btn.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  // Let the entering animation and React Aria's placement settle.
  await page.waitForTimeout(300);
  return menu;
}

const measure = (menu: ReturnType<Page['getByRole']>) =>
  menu.evaluate((m) => {
    const pop = m.closest('[data-placement]')!.getBoundingClientRect();
    const r = m.getBoundingClientRect();
    return { scroll: m.scrollHeight, client: m.clientHeight, top: r.top, bottom: r.bottom, popTop: pop.top, popBottom: pop.bottom, vh: window.innerHeight };
  });

test('@menuroom a long menu with room for it shows every item, no scroll (1400x1000)', async ({ page }) => {
  const menu = await openMenu(page, 1400, 1000);
  const m = await measure(menu);
  expect(m.scroll, 'the fixture menu is longer than the old 480px cap').toBeGreaterThan(480);
  expect(m.scroll, 'the whole menu shows: nothing to scroll').toBeLessThanOrEqual(m.client + 1);
  expect(m.bottom, 'the menu ends on the screen').toBeLessThanOrEqual(m.vh);
  expect(m.bottom).toBeLessThanOrEqual(m.popBottom + 1);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('@menuroom a menu with too little room scrolls inside its popover and the screen (1400x520)', async ({ page }) => {
  const menu = await openMenu(page, 1400, 520);
  const m = await measure(menu);
  expect(m.scroll, 'too little room: the menu scrolls').toBeGreaterThan(m.client + 1);
  expect(m.top).toBeGreaterThanOrEqual(m.popTop - 1);
  expect(m.bottom).toBeLessThanOrEqual(m.popBottom + 1);
  expect(m.top, 'the menu starts on the screen').toBeGreaterThanOrEqual(0);
  expect(m.bottom, 'the menu ends on the screen').toBeLessThanOrEqual(m.vh);
  // Every item is still reachable: the last one scrolls into view, inside the popover.
  const last = menu.getByRole('menuitem').last();
  await last.scrollIntoViewIfNeeded();
  const lb = (await last.boundingBox())!;
  expect(lb.y + lb.height).toBeLessThanOrEqual(m.popBottom + 1);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});
