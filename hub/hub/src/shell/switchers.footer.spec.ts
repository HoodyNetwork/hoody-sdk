// Playwright: the realm and computer menus keep their footer ("Menu actions") in view while the
// list scrolls, and the phone sheet keeps it below the scrolling lists. Sticky position and hit-testing need a real
// browser, not jsdom. The fixture world has few realms, so the desktop tests cap the open menu's scroller (a local
// fixture: the list then scrolls as a long one would).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

/** True when the element drawn at the centre of `target` is `target` or inside it: nothing covers it. */
const onTop = (target: Locator) =>
  target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });

/** At the top or the bottom of the menu's scrolling list: the scroller's box, whether its list overflows, each footer
 *  item's box and whether it is drawn on top (nothing covers it), and whether the footer's own surface is what is drawn
 *  just inside the scroller's left, right and bottom edges (the footer reaches across the menu's padding, MenuFooter's
 *  --footer-reach, so no list row shows around it). The edge points sit at the footer's middle row and the scroller's
 *  middle column, clear of the rounded corners. The scroller is the menu's nearest scrolling
 *  ancestor (the popover); its height is capped by an !important rule, since the popover writes its own inline
 *  max-height as it places itself. One pass, after a frame, so every number comes from the same layout. */
const measure = (menu: Locator, to: 'top' | 'bottom') =>
  menu.evaluate(async (el, end) => {
    let n = el.parentElement;
    while (n && !/auto|scroll/.test(getComputedStyle(n).overflowY)) n = n.parentElement;
    if (!n) throw new Error('no scroller above the menu');
    if (!document.getElementById('footer-cap')) {
      const style = document.createElement('style');
      style.id = 'footer-cap';
      style.textContent = '[data-footer-cap] { max-height: 150px !important; }';
      document.head.append(style);
    }
    n.setAttribute('data-footer-cap', '');
    await new Promise((r) => requestAnimationFrame(r));
    n.scrollTop = end === 'top' ? 0 : n.scrollHeight;
    await new Promise((r) => requestAnimationFrame(r));
    const foot = el.querySelector(':scope > [aria-label="Menu actions"]') as HTMLElement;
    const s = n.getBoundingClientRect();
    const f = foot.getBoundingClientRect();
    const inner = {
      left: s.left + n.clientLeft,
      right: s.left + n.clientLeft + n.clientWidth,
      bottom: s.top + n.clientTop + n.clientHeight,
    };
    const footAt = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === foot || foot.contains(hit));
    };
    const midY = f.top + f.height / 2;
    const edges = {
      left: footAt(inner.left + 1, midY),
      right: footAt(inner.right - 1, midY),
      bottom: footAt((inner.left + inner.right) / 2, inner.bottom - 1),
    };
    const items = [...foot.querySelectorAll('[role="menuitem"]')].map((item) => {
      const r = item.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { top: r.top, bottom: r.bottom, covered: !hit || !(hit === item || item.contains(hit)) };
    });
    return { top: s.top, bottom: s.bottom, overflows: n.scrollHeight > n.clientHeight + 1, items, edges };
  }, to);

async function open(page: Page, trigger: string): Promise<{ menu: Locator; foot: Locator }> {
  await page.locator(`[data-hub-switch="${trigger}"]`).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const foot = menu.locator(':scope > [aria-label="Menu actions"]');
  await expect(foot).toHaveCount(1);
  return { menu, foot };
}

/** At either end of the scrolling list, every footer item lies inside the scroller's box and is drawn on top, and the
 *  footer's surface meets the scroller's left, right and bottom edges. */
async function footInView(menu: Locator, to: 'top' | 'bottom') {
  const m = await measure(menu, to);
  expect(m.overflows).toBe(true);
  expect(m.items.length).toBeGreaterThan(0);
  for (const item of m.items) {
    expect(item.top).toBeGreaterThanOrEqual(m.top - 0.5);
    expect(item.bottom).toBeLessThanOrEqual(m.bottom + 0.5);
    expect(item.covered).toBe(false);
  }
  expect(m.edges).toEqual({ left: true, right: true, bottom: true });
}

test.describe('a wide screen', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the realm menu: the footer stays in view at the top and the bottom of a scrolling list', async ({ page }) => {
    await gotoHub(page, '/home');
    const { menu, foot } = await open(page, 'realm');
    await expect(foot.getByRole('menuitem', { name: /^New realm/ })).toBeVisible();
    // Rename realms is a row of the list, not the footer.
    await expect(foot.getByRole('menuitem', { name: /^Rename realms/ })).toHaveCount(0);
    await footInView(menu, 'top');
    await footInView(menu, 'bottom');
  });

  test('the computer menu: Get a computer stays in view while the list scrolls', async ({ page }) => {
    await gotoHub(page, '/home');
    const { menu, foot } = await open(page, 'computer');
    await expect(foot.getByRole('menuitem')).toHaveText(['Get a computer']);
    await footInView(menu, 'top');
  });
});

test.describe('a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the sheet: the "Menu actions" links sit below the scrolling lists, on screen and uncovered', async ({ page }) => {
    await gotoHub(page, '/home');
    await page.locator('[data-hub-switch="context"]').click();
    const sheet = page.getByRole('dialog', { name: 'Realm and computer' });
    await expect(sheet).toBeVisible();
    const foot = sheet.getByRole('group', { name: 'Menu actions' });
    await expect(foot.getByRole('link')).toHaveText([/^Share/, /^New realm/]);
    const body = await foot.evaluate((el) => (el.previousElementSibling as HTMLElement).getBoundingClientRect().bottom);
    const f = await foot.boundingBox();
    expect(f).not.toBeNull();
    expect(f!.y).toBeGreaterThanOrEqual(body - 0.5);
    expect(f!.y + f!.height).toBeLessThanOrEqual(844 + 0.5);
    for (const link of await foot.getByRole('link').all()) expect(await onTop(link)).toBe(true);
  });
});
