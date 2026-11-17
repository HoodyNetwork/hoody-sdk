// Playwright: on a coarse pointer
// - a DataTable header holding a tip grows to its 44 press plus the ring's reach (52), and the
//   sticky group rows stick under that header, never sliding under it (the gallery's sticky-groups specimen, whose Path
//   header carries a tip), at 1440 and at 390 (the specimen stays a table there); on a fine pointer the header stays 32.
// - a selecting rail list (/_kit?layout=rail&select=1) gives each row check a 44 x 44 box in
//   the lead column, clear of the row's text, and a tap on a check selects its own row only.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from '../gallery/table.strings.en.json';

/** The sticky specimen's header height, and how its stuck group head sits against it after scrolling into a group. */
async function stickyUnderHeader(page: Page, theme: 'light' | 'dark') {
  await gotoHub(page, '/_kit?tab=table', { theme });
  const table = page.locator('[data-specimen="sticky-groups"]').getByRole('table', { name: strings['sec.sticky'] });
  await table.scrollIntoViewIfNeeded();
  await expect(table.locator('tbody tr').nth(1)).toBeVisible(); // reason: a body row is drawn
  const scroller = table.locator('xpath=..');
  const rowH = await table.locator('tbody tr[data-row-id]').first().evaluate((el) => el.getBoundingClientRect().height); // reason: one row's height
  await scroller.evaluate((el, to) => { el.scrollTop = to; }, Math.round(rowH * 40));
  const read = () =>
    table.evaluate((t: HTMLTableElement) => {
      const head = t.tHead!.rows[0]!.cells[0]!.getBoundingClientRect();
      const heads = [...t.tBodies[0]!.rows].filter((tr) => tr.getAttribute('aria-hidden') !== 'true' && tr.querySelector('[aria-expanded]'));
      const near = heads.map((tr) => tr.cells[0]!.getBoundingClientRect().top).reduce((a, b) => (Math.abs(b - head.bottom) < Math.abs(a - head.bottom) ? b : a));
      return { headerH: Math.round(head.height), gap: Math.round(near - head.bottom) };
    });
  await expect.poll(async () => (await read()).gap).toBe(0);
  return read();
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`coarse header with a tip, sticky groups, 1440 touch, ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: true });
    test('the header with a tip is 52 and the stuck group head sits right under it, not under the header', async ({ page }) => {
      const r = await stickyUnderHeader(page, theme);
      expect(r.headerH).toBeGreaterThanOrEqual(52);
      expect(r.gap).toBe(0);
    });
  });

  test.describe(`a nested table's tip never moves its parent's offset, 1440 touch, ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: true });
    test("only the table's own header with a tip sets the 52 offset; a tip in a nested table's header does not", async ({ page }) => {
      await gotoHub(page, '/_kit?tab=table', { theme });
      const table = page.locator('[data-specimen="sticky-groups"]').getByRole('table', { name: strings['sec.sticky'] });
      await table.scrollIntoViewIfNeeded();
      await expect(table.locator('tbody tr').nth(1)).toBeVisible(); // reason: a body row is drawn
      const r = await table.evaluate((t: HTMLTableElement) => {
        const top = () => getComputedStyle(t.querySelector('tbody td')!).getPropertyValue('--group-sticky-top').trim();
        const own = t.querySelector(':scope > thead [class*="thTip"]')!;
        const tipClass = [...own.classList].find((c) => /thTip/.test(c))!;
        const theadClass = [...t.tHead!.classList].find((c) => /thead/.test(c))!;
        const withOwn = top();
        own.classList.remove(tipClass); // the table's own header loses its tip
        const without = top();
        // A nested table in a body cell (an expanded row's detail) whose header holds a tip.
        const cell = t.tBodies[0]!.rows[0]!.cells[0]!;
        const nested = document.createElement('table');
        nested.innerHTML = `<thead class="${theadClass}"><tr><th><span class="${tipClass}">x</span></th></tr></thead>`;
        cell.append(nested);
        const nestedTip = top();
        nested.remove();
        own.classList.add(tipClass);
        return { withOwn, without, nestedTip };
      });
      expect(r.withOwn).not.toBe(r.without);
      expect(r.nestedTip).toBe(r.without);
    });
  });

  test.describe(`fine header with a tip, sticky groups, 1440, ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test('on a fine pointer the header stays 32 and the head still sits right under it', async ({ page }) => {
      const r = await stickyUnderHeader(page, theme);
      expect(r.headerH).toBe(32);
      expect(r.gap).toBe(0);
    });
  });

  test.describe(`coarse header with a tip, sticky groups, 390 touch, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('on a phone the specimen is still a table: the header with a tip is 52 and the stuck group head sits right under it', async ({ page }) => {
      const r = await stickyUnderHeader(page, theme);
      expect(r.headerH).toBeGreaterThanOrEqual(52);
      expect(r.gap).toBe(0);
    });
  });

  for (const width of [390, 1440] as const)
    test.describe(`a selecting rail list on a coarse pointer at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
      test('each row check is 44 x 44 in the lead column, clear of its text; a tap selects its own row only', async ({ page }) => {
        await gotoHub(page, '/_kit?layout=rail&select=1', { theme });
        const rail = page.locator('[data-gallery-rail]');
        const checks = rail.locator('label:has(input[type="checkbox"])');
        await expect(checks.nth(2)).toBeVisible(); // reason: at least three rows drawn
        const boxes = await checks.evaluateAll((ls) =>
          ls.slice(0, 3).map((l) => {
            const r = l.getBoundingClientRect();
            const row = l.closest('[data-row-id]')!;
            // The row's own words: every text node in the row outside the check.
            const words = [...row.querySelectorAll('*')].filter((e) => !e.closest('label') && e.childElementCount === 0 && (e.textContent ?? '').trim() !== '');
            const textLeft = Math.min(...words.map((e) => e.getBoundingClientRect().left));
            return { w: r.width, h: r.height, right: r.right, textLeft };
          }),
        );
        for (const [i, b] of boxes.entries()) {
          expect(b.w, `check ${i} wide`).toBeGreaterThanOrEqual(44);
          expect(b.h, `check ${i} tall`).toBeGreaterThanOrEqual(44);
          expect(b.right, `check ${i} clear of its text`).toBeLessThanOrEqual(b.textLeft + 0.5);
        }
        const states = () => Promise.all([0, 1, 2].map((k) => checks.nth(k).locator('input').isChecked()));
        expect(await states()).toEqual([false, false, false]);
        const b1 = (await checks.nth(1).boundingBox())!;
        await page.touchscreen.tap(b1.x + b1.width / 2, b1.y + b1.height / 2);
        await expect.poll(states).toEqual([false, true, false]);
      });
    });
}
