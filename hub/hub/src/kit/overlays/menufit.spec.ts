// Playwright: an ActionMenu stays inside its popover, and below 600 px a press
// that opens the tray chooses nothing. React Aria gives the popover a max-height that fits the room above or below the
// trigger; the menu inside must shrink to it and scroll. When the menu kept its own taller max-height, it overflowed the
// popover and covered its own trigger, so a mouse press on a phone-width "Row actions" (React Aria opens a menu on press
// start) ended on the unpainted last item: one press opened the Preview and a "Delete …?" confirm, and no menu ever
// showed. The popover geometry is kept verbatim on the gallery's `phone="popover"` menu; the Files fixture row server.js
// at 390 px now opens the tray, whose rows ignore pointers until that press ends.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import kit from '@kit/strings.en.json';
import gallery from '../gallery/overlays.strings.en.json';

const APP = '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp';
const GALLERY = '/_kit?tab=overlays';
const rowActions = (page: Page) => page.locator('tbody tr').filter({ hasText: 'server.js' }).first().getByRole('button', { name: kit['table.rowActions'] });
const popoverMenu = (page: Page) => page.getByRole('button', { name: gallery['btn.popoverMenu'], exact: true });
const longMenu = (page: Page) => page.getByRole('button', { name: gallery['btn.longMenu'], exact: true });
const tray = (page: Page) => page.locator('[data-hub-tray]');
/** Nothing but the open menu: no Preview, no confirm, no dialog besides the tray's own. */
const onlyTheMenu = (page: Page) => expect(page.locator('[role="dialog"]:not(:has([role="menu"])), [role="alertdialog"]')).toHaveCount(0);

/** A real mouse press at the middle of `l`: down, a human's hold, then (unless `hold`) up. */
async function press(page: Page, l: Locator, hold = false) {
  const b = (await l.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (hold) return { x, y };
  await page.waitForTimeout(120);
  await page.mouse.up();
  return { x, y };
}

const SIZES = [[390, 844], [390, 700], [360, 640]] as const;

for (const [width, height] of SIZES) {
  test(`@menufit one mouse press on a phone="popover" menu opens only the menu, inside its popover (${width}x${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await gotoHub(page, GALLERY);
    const btn = popoverMenu(page);
    await btn.scrollIntoViewIfNeeded();
    await expect(btn).toBeVisible();
    const b = (await btn.boundingBox())!;
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    // A real press: down, a human's hold, up, at the trigger's middle.
    await page.mouse.move(x, y);
    await page.mouse.down();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(300);
    // Only the menu: no dialog or confirm besides the menu's own popover.
    await expect(page.locator('[role="dialog"]:not(:has([role="menu"])), [role="alertdialog"]')).toHaveCount(0);
    await expect(menu).toBeVisible();
    await expect(tray(page), 'phone="popover" keeps the popover below 600 px').toHaveCount(0);
    const fit = await menu.evaluate((m, [px, py]) => {
      const pop = m.closest('[data-placement]')!.getBoundingClientRect();
      const r = m.getBoundingClientRect();
      const under = document.elementFromPoint(px, py);
      return { menuTop: r.top, menuBottom: r.bottom, popTop: pop.top, popBottom: pop.bottom, coversTrigger: !!under && m.contains(under) };
    }, [x, y] as const);
    expect(fit.menuTop, 'the menu starts inside its popover').toBeGreaterThanOrEqual(fit.popTop - 1);
    expect(fit.menuBottom, 'the menu ends inside its popover').toBeLessThanOrEqual(fit.popBottom + 1);
    expect(fit.coversTrigger, 'no menu item lies over the trigger').toBe(false);
    // Every item is still reachable: the last one scrolls into view, inside the popover.
    const last = menu.getByRole('menuitem').last();
    await last.scrollIntoViewIfNeeded();
    const lb = (await last.boundingBox())!;
    expect(lb.y + lb.height).toBeLessThanOrEqual(fit.popBottom + 1);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test(`@menufit one mouse press on Row actions opens only the tray and chooses nothing (${width}x${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await gotoHub(page, APP);
    const btn = rowActions(page);
    await expect(btn).toBeVisible();
    await press(page, btn, true);
    await expect(tray(page)).toBeVisible();
    await expect(tray(page), 'the press that opened the tray arms it').toHaveAttribute('data-arming');
    await page.waitForTimeout(120);
    await page.mouse.up();
    await expect(tray(page), 'the release ends the arming').not.toHaveAttribute('data-arming');
    await page.waitForTimeout(300);
    await onlyTheMenu(page);
    const menu = tray(page).getByRole('menu');
    await expect(menu).toBeVisible();
    // The tray sits at the bottom of the viewport.
    const tb = (await tray(page).boundingBox())!;
    expect(Math.abs(tb.y + tb.height - height), 'the tray ends at the bottom edge').toBeLessThanOrEqual(1);
    // Every item is reachable: the last one scrolls into view inside the tray.
    const last = menu.getByRole('menuitem').last();
    await last.scrollIntoViewIfNeeded();
    const lb = (await last.boundingBox())!;
    expect(lb.y + lb.height).toBeLessThanOrEqual(tb.y + tb.height + 1);
    await page.keyboard.press('Escape');
    await expect(tray(page)).toHaveCount(0);
    await expect(btn).toBeFocused();
  });

  test(`@menufit a press released over a row while arming chooses nothing; the next press acts (${width}x${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await gotoHub(page, GALLERY);
    const btn = longMenu(page);
    await btn.scrollIntoViewIfNeeded();
    await press(page, btn, true);
    await expect(tray(page)).toHaveAttribute('data-arming');
    // Drag onto a plain row and release there: still arming, so the row ignores it.
    const logs = tray(page).getByRole('menuitem', { name: gallery['menu.long.logs'] });
    const r = (await logs.boundingBox())!;
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(tray(page), 'the release chose nothing').toBeVisible();
    await onlyTheMenu(page);
    // The next independent press acts.
    await press(page, logs);
    await expect(tray(page)).toHaveCount(0);
  });
}

test('@menufit a pointercancel ends the arming', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, GALLERY);
  const btn = longMenu(page);
  await btn.scrollIntoViewIfNeeded();
  await press(page, btn, true);
  await expect(tray(page)).toHaveAttribute('data-arming');
  await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
  await expect(tray(page)).not.toHaveAttribute('data-arming');
  await page.mouse.up();
});

test('@menufit a keyboard-opened tray acts on the first click', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, GALLERY);
  const btn = longMenu(page);
  await btn.scrollIntoViewIfNeeded();
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(tray(page)).toBeVisible();
  await expect(tray(page), 'a key opens with no press held').not.toHaveAttribute('data-arming');
  await press(page, tray(page).getByRole('menuitem', { name: gallery['menu.long.logs'] }));
  await expect(tray(page)).toHaveCount(0);
});

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('@menufit a touch-opened tray acts on the first tap', async ({ page }) => {
    await gotoHub(page, GALLERY);
    const btn = longMenu(page);
    await btn.scrollIntoViewIfNeeded();
    await btn.tap();
    await expect(tray(page)).toBeVisible();
    await expect(tray(page)).not.toHaveAttribute('data-arming');
    await tray(page).getByRole('menuitem', { name: gallery['menu.long.logs'] }).tap();
    await expect(tray(page)).toHaveCount(0);
  });
});

test('@menufit at 700x640 the default menu is a popover', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 640 });
  await gotoHub(page, APP);
  const btn = rowActions(page);
  await expect(btn).toBeVisible();
  await press(page, btn);
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(tray(page)).toHaveCount(0);
  expect(await menu.evaluate((m) => m.closest('[data-placement]') !== null), 'anchored to its trigger').toBe(true);
  await page.keyboard.press('Escape');
});
