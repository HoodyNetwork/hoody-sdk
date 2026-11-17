// Playwright: the kit gallery's nested-groups specimen (/_kit?tab=table). 240 virtual
// rows: Agent > Sessions, Tools; Files > Read, Write; sticky. Scrolled into a child, its parent's header sits right
// under the column header and the child's right under the parent's; scrolled into the next parent, the earlier child
// lets go (it never stays stuck under a later parent), and a jump back finds Sessions again. The parents carry a sentence
// that wraps at 390, so the child sticks under the parent's drawn height. At 1350 and 390.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from '../gallery/table.strings.en.json';

/** In the page (self-contained: Playwright sends only its source): the parent stuck right under the column header,
 *  the child stuck right under that parent, and any other child stuck within reach below. */
const stuckPair = (table: HTMLTableElement) => {
  const below = table.tHead!.rows[0]!.cells[0]!.getBoundingClientRect().bottom;
  const hs = [...table.tBodies[0]!.rows]
    .filter((tr) => tr.querySelector('[aria-expanded]'))
    .map((tr) => {
      const r = tr.cells[0]!.getBoundingClientRect();
      return { label: tr.querySelector('[aria-expanded]')!.textContent ?? '', top: r.top, bottom: r.bottom, child: tr.dataset.groupDepth === '1' };
    });
  const parent = hs.filter((h) => !h.child && Math.abs(h.top - below) <= 2).at(-1);
  const child = parent ? hs.filter((h) => h.child && Math.abs(h.top - parent.bottom) <= 2).at(-1) : undefined;
  // Any other child header reaching into the band from the column header to the stuck child's bottom: one left stuck
  // from an earlier parent, or one drawn under a parent whose header wrapped taller than the slot.
  const end = child?.bottom ?? parent?.bottom ?? below;
  const others = hs.filter((h) => h.child && h !== child && h.bottom > below + 1 && h.top < end - 1).map((h) => h.label);
  return { parent: parent?.label ?? '', child: child?.label ?? '', others };
};

for (const width of [1350, 390]) {
  test(`the parent in sight and its child in sight stick, one under the other; the next parent's take over (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/_kit?tab=table');
    const table = page.locator('[data-specimen="nested-groups"]').getByRole('table', { name: strings['sec.nested'] });
    await table.scrollIntoViewIfNeeded();
    await expect(table.locator('tr[data-row-id="n0"]')).toBeVisible();
    const scroller = table.locator('xpath=..');
    const rowH = await table.locator('tr[data-row-id="n0"]').evaluate((el) => el.getBoundingClientRect().height);
    const scrollTo = async (y: number) => {
      await scroller.evaluate((el, to) => { el.scrollTop = to; }, y);
      await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(y - 50);
    };
    // 40 rows into Sessions: Agent, then Sessions.
    await scrollTo(Math.round(rowH * 40));
    await expect.poll(() => table.evaluate(stuckPair)).toEqual({ parent: expect.stringContaining(strings['group.agent']), child: expect.stringContaining(strings['group.sessions']), others: [] });
    // Into Tools (rows 60-119): Agent, then Tools.
    await scrollTo(Math.round(rowH * 100));
    await expect.poll(() => table.evaluate(stuckPair)).toEqual({ parent: expect.stringContaining(strings['group.agent']), child: expect.stringContaining(strings['group.tools']), others: [] });
    // Into Write (rows 180-239): Files, then Write; no Agent child is left stuck under Files.
    await scrollTo(Math.round(rowH * 215));
    await expect.poll(() => table.evaluate(stuckPair)).toEqual({ parent: expect.stringContaining(strings['group.files']), child: expect.stringContaining(strings['group.write']), others: [] });
    // A jump back to Sessions, far above (the virtual window moves): Agent, then Sessions again.
    await scroller.evaluate((el, to) => { el.scrollTop = to; }, Math.round(rowH * 30));
    await expect.poll(() => table.evaluate(stuckPair)).toEqual({ parent: expect.stringContaining(strings['group.agent']), child: expect.stringContaining(strings['group.sessions']), others: [] });
    await page.screenshot({ path: test.info().outputPath(`nested-${width}.png`) });
  });
}
