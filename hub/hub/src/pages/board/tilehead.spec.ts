// Playwright: a Board tile's head holds its own controls. Density never changes a control height
// (a kit control rule), and an IconButton sm is drawn at max(--ctl-h-sm, --icon-hit): 32 with a mouse, 44 on a coarse
// pointer. The head is as tall as its controls plus its line, so every control in it (the realm chip, session, options,
// maximise, reload, the menu) lies inside the head, and nothing that follows the head paints over a control's edge.
// The strip's fit counts each of its icon buttons as --board-btn wide, so --board-btn is that button's drawn width.
// Both themes, fine and coarse pointer. Boxes need a real browser, not jsdom.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

/** All realms, terminal-1 on atlas added to the Main Board from its open view, then the Board itself: the tile in the
 *  Board's grid (inside the page that sets --board-head-h and --board-btn), its head showing the realm chip. */
async function boardAllRealms(page: Page, theme: 'light' | 'dark') {
  await gotoHub(page, '/', { state: 'colours', theme });
  await page.locator('#hub-main button[data-realm]').first().click();
  await page.evaluate(() => { location.hash = '#/board/open/atlas.00a1/terminal-1'; });
  await page.getByRole('button', { name: /^Add to Main/i }).click({ timeout: 60_000 });
  await page.evaluate(() => { location.hash = '#/board'; });
  await expect(page.locator('[data-strip-end]')).toBeVisible({ timeout: 60_000 });
  const g = page.getByRole('group', { name: /^terminal-1 · atlas, realm / });
  await expect(g).toBeVisible({ timeout: 60_000 });
  // The grid's tile, not the open view's: the Board page's head height reaches it.
  expect(await g.evaluate((el) => getComputedStyle(el).getPropertyValue('--board-head-h').trim()), 'the tile is in the Board grid').not.toBe('');
  return g;
}

/** Each control in the grid tile's head: its box against the head's, and what the page draws at its top and bottom edges. */
async function headControls(page: Page, tol: number) {
  return page.evaluate(async (tol) => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // The tile is the group; its head is the group's first child (Tile.tsx), the drag handle that holds the controls.
    const tile = [...document.querySelectorAll<HTMLElement>('[role="group"][aria-label^="terminal-1 · atlas, realm "]')].find((t) => getComputedStyle(t).getPropertyValue('--board-head-h').trim() !== '');
    const head = tile?.firstElementChild as HTMLElement | null;
    if (!head) return null;
    const h = head.getBoundingClientRect();
    const line = parseFloat(getComputedStyle(head).borderBottomWidth) || 0;
    return [...head.querySelectorAll<HTMLElement>('button, a[href]')].filter((b) => b.getBoundingClientRect().height > 0).map((b) => {
      const r = b.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const hit = (y: number) => { const e = document.elementFromPoint(x, y); return !!e && (e === b || b.contains(e)); };
      return {
        name: b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '',
        inside: r.top >= h.top - tol && r.bottom <= h.bottom - line + tol,
        edges: hit(r.top + 1) && hit(r.bottom - 1),
      };
    });
  }, tol);
}

for (const theme of ['light', 'dark'] as const)
  for (const pointer of ['fine', 'coarse'] as const)
    test.describe(`Board tile head, ${theme}, ${pointer} pointer`, () => {
      test.use({ viewport: { width: 1440, height: 900 }, ...(pointer === 'coarse' ? { hasTouch: true, isMobile: true } : {}) });

      test('every control in the head lies inside it, and its top and bottom edges are its own', async ({ page }) => {
        await boardAllRealms(page, theme);
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(pointer === 'coarse');
        await page.mouse.move(1, 899); // reason: off the head, so no control wears the hover lift (translateY(-1px))
        // 0.1 px on both pointers: a head one line short (no + var(--bw)) centres its control half a pixel over its line
        // The head is its controls (32 with a mouse, 44 on a coarse pointer) plus its line.
        const got = await headControls(page, 0.1);
        expect(got, 'the open tile has a head').not.toBeNull();
        expect(got!.length, 'the head holds its controls').toBeGreaterThanOrEqual(5);
        expect(got!.filter((c) => !c.inside).map((c) => c.name), 'controls outside the head').toEqual([]);
        expect(got!.filter((c) => !c.edges).map((c) => c.name), 'controls whose edge another box covers').toEqual([]);
      });

      test("the strip's fit counts an icon button at its drawn width", async ({ page }) => {
        await boardAllRealms(page, theme);
        const got = await page.evaluate(() => {
          const end = document.querySelector<HTMLElement>('[data-strip-end]');
          const row = end?.parentElement;
          const btn = end?.querySelector<HTMLElement>('button[class*="iconOnly"]');
          if (!row || !btn) return null;
          return { btn: parseFloat(getComputedStyle(row).getPropertyValue('--board-btn')), drawn: Math.round(btn.getBoundingClientRect().width) };
        });
        expect(got, 'the strip has an icon button').not.toBeNull();
        expect(got!.btn).toBe(got!.drawn);
      });
    });
