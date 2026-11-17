// Playwright: the computed side of menuSearchClass on the gallery's search-row demo (20 realms in a
// popover that scrolls, the topbar realm menu's shape). The search row stays at the top of the scroller while the rows
// scroll under it, spans it edge to edge and is drawn on top; it takes focus on open and filters the realms while the
// footer stays; axe finds nothing. At 1440 and at 390.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/overlays.strings.en.json';

/** The search row's nearest scrolling ancestor and the row itself, read in one pass after scrolling to `where`: the
 *  scroller's client box (inside its border), the row's box, whether the row is what is drawn at its own centre, and the
 *  scroller's room. */
const measure = (row: Locator, where: 'top' | 'end') =>
  row.evaluate(async (el, w) => {
    let s: HTMLElement | null = el.parentElement;
    while (s && !(s.scrollHeight > s.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
    if (!s) return null;
    s.scrollTop = w === 'top' ? 0 : s.scrollHeight;
    await new Promise((r) => requestAnimationFrame(r));
    const sr = s.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      room: s.scrollHeight - s.clientHeight,
      top: sr.top + s.clientTop,
      left: sr.left + s.clientLeft,
      right: sr.left + s.clientLeft + s.clientWidth,
      row: { top: r.top, left: r.left, right: r.right },
      onTop: !!hit && (hit === el || el.contains(hit)),
      hit: `${hit ? `${hit.tagName.toLowerCase()}.${String(hit.className)}` : 'none'} at ${Math.round(r.top)}/${Math.round(r.left)} ${Math.round(r.width)}x${Math.round(r.height)} in ${innerWidth}x${innerHeight}; scroller ${s.tagName}.${String(s.className)} ${Math.round(sr.top)}; stack ${document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).map((e) => e.tagName + '.' + String(e.className).slice(0, 30)).join(' > ')}`,
      position: getComputedStyle(el).position,
    };
  }, where);

/** At the top and the end of the scroll, the row sits at the scroller's top edge, from inline edge to inline edge, on top. */
async function pinned(row: Locator) {
  for (const where of ['top', 'end'] as const) {
    const m = await measure(row, where);
    expect(m, 'the rows overflow, so the search row has something to stay over').not.toBeNull();
    expect(m!.position).toBe('sticky');
    expect(m!.room).toBeGreaterThan(40);
    expect(Math.round(Math.abs(m!.row.top - m!.top)), `search row at the scroller's top (${where})`).toBeLessThanOrEqual(1);
    expect([Math.round(Math.abs(m!.row.left - m!.left)), Math.round(Math.abs(m!.row.right - m!.right))], `inline edges (${where})`).toEqual([0, 0]);
    expect(m!.onTop, `nothing covers the search row (${where}): ${m!.hit}`).toBe(true);
  }
}

async function check(page: Page) {
  const box = page.getByRole('searchbox', { name: gallery['menu.search'] });
  await expect(box).toBeFocused();
  const row = page.locator('[data-search-row]');
  await pinned(row);
  const menu = page.getByRole('menu', { name: gallery['btn.searchMenu'] });
  await page.keyboard.type('realm 2');
  await expect(menu.getByRole('menuitem')).toHaveText(['Realm 2', 'Realm 20', gallery['menu.footer.share'], gallery['menu.footer.new']]);
  await page.keyboard.press('Escape');
  await expect(box).toHaveValue('');
  await expect.poll(() => box.evaluate((el) => { const id = el.getAttribute('aria-activedescendant'); return !id || !!document.getElementById(id); }), 'aria-activedescendant names a row that exists').toBe(true);
  await expect(menu.getByRole('menuitem')).toHaveCount(22);
  const axe = await new AxeBuilder({ page }).include('[data-search-menu]').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.failureSummary).join(' | ')}`)).toEqual([]);
}

test.describe('search row at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the search row stays at the top while 20 realms scroll, takes focus, filters, and the footer stays', async ({ page }) => {
    test.setTimeout(120_000);
    await gotoHub(page, '/_kit?tab=overlays');
    const trigger = page.getByRole('button', { name: gallery['btn.searchMenu'], exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await check(page);
  });
});

test.describe('search row at 390', () => {
  test.use({ viewport: { width: 390, height: 700 } });

  test('at a phone width the search row stays at the top of the scrolling menu, edge to edge and uncovered', async ({ page }) => {
    test.setTimeout(120_000);
    await gotoHub(page, '/_kit?tab=overlays');
    const trigger = page.getByRole('button', { name: gallery['btn.searchMenu'], exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await check(page);
  });
});
