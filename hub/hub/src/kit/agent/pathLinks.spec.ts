// Playwright: a reply's Linux paths in the conversation frame on fixtures
// (`/_kit?layout=ai-conversation&links=1`). At 390 and 1440: each path is a button named by its path, inside the viewport and the
// topmost element at its centre; a click, Enter, Shift+F10 and a right-click each open the menu at it with Copy path, inside the
// viewport; Escape closes it and focus is back on the path; axe finds nothing with the menu open; nothing scrolls sideways.
import AxeBuilder from '@axe-core/playwright';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';

const PROSE = '/etc/nginx/sites-enabled/shop.conf';
const CODE = '/srv/shop/src/checkout/payment.ts:42:7';

async function inView(page: Page, l: Locator, what: string): Promise<void> {
  await l.scrollIntoViewIfNeeded();
  await expect(l, what).toBeVisible();
  const vp = page.viewportSize()!;
  // A phone tray slides in: measured once it has settled.
  await expect(async () => {
    const box = (await l.boundingBox())!;
    expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5, `${what} inside the viewport (${JSON.stringify(box)} in ${vp.width}x${vp.height})`).toBe(true);
  }).toPass({ timeout: 5000 });
}

async function topmost(page: Page, l: Locator, what: string): Promise<void> {
  await inView(page, l, what);
  const hit = await l.evaluate((el) => {
    const r = el.getClientRects()[0] ?? el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + Math.min(r.width / 2, 8), r.top + r.height / 2);
    return at && (at === el || el.contains(at)) ? 'ok' : at ? `${at.tagName.toLowerCase()}.${String((at as HTMLElement).className)}` : 'nothing';
  });
  expect(hit, `${what} is the topmost element where it starts`).toBe('ok');
}

async function menuOpen(page: Page, target: string, how: string): Promise<void> {
  // The menu is named by the path: its trigger on a popover, its title ("Path …") on the phone tray.
  const m = page.getByRole('menu', { name: new RegExp(`^(Path )?${target.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`) });
  await expect(m, `${how}: the menu opens`).toBeVisible();
  await inView(page, m.getByRole('menuitem', { name: 'Copy path', exact: true }), `${how}: Copy path`);
}

async function close(page: Page, b: Locator): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(b).toBeFocused();
}

for (const width of [390, 1440] as const) {
  test(`reply paths at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    await gotoHub(page, '/_kit?layout=ai-conversation&links=1&details=0&gates=0&turns=2');
    await expect(page.locator('[data-details]')).toBeVisible();
    const prose = page.getByRole('button', { name: PROSE, exact: true });
    const code = page.getByRole('button', { name: CODE, exact: true });
    await topmost(page, prose, 'the prose path');
    await topmost(page, code, 'the code path');
    await noSideScroll(page);
    await page.screenshot({ path: test.info().outputPath(`paths-${width}.png`) });

    await prose.click();
    await menuOpen(page, PROSE, 'click');
    // label-content-name-mismatch (experimental) is off: the line under Copy path (why there is nothing more to do here)
    // is visible text outside the item's name by design, its description, as on every kit ActionMenu.
    const axe = await new AxeBuilder({ page }).include('#hub-main').include('[role="menu"]').disableRules(['label-content-name-mismatch']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`paths-${width}-menu.png`) });
    await close(page, prose);

    await code.focus();
    await page.keyboard.press('Enter');
    await menuOpen(page, CODE, 'Enter');
    await close(page, code);

    await page.keyboard.press('Shift+F10');
    await menuOpen(page, CODE, 'Shift+F10');
    await close(page, code);

    await prose.click({ button: 'right' });
    await menuOpen(page, PROSE, 'right-click');
    await close(page, prose);
    await noSideScroll(page);
  });
}
