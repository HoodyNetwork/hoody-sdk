// Playwright on the gallery's panel-steps specimen (/_kit?tab=pieces #panel-steps),
// light and dark:
// - StepList: at 1440 a row's control sits beside its text; at 390 it drops under it (rule 37); nothing scrolls sideways.
// - CodeLine: the copy cell is the icon hit (28) on a fine pointer and 44 x 44 on a coarse one; the code ends in an
//   ellipsis inside the line, never past it.
// - Facts spec: two columns at 1440, one at 390 (the one phone breakpoint, as the default grid); a label never wraps;
//   each value ends at its row's end.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from '../gallery/drafty.strings.en.json';

async function open(page: Page, theme: 'light' | 'dark') {
  await gotoHub(page, '/_kit?tab=pieces', { theme });
  const steps = page.locator('[data-specimen="step-list"]');
  await steps.scrollIntoViewIfNeeded();
  await expect(steps.getByRole('group', { name: strings['steps.label'] })).toBeVisible(); // reason: the specimen is drawn
  return steps;
}

/** The "Check again" row: its text box and its control box. */
async function actRow(page: Page) {
  const btn = page.locator('[data-specimen="step-list"]').getByRole('button', { name: strings['s.check.act'] });
  return btn.evaluate((b) => {
    const li = b.closest('li')!;
    const t = li.children[1]!.firstElementChild!.getBoundingClientRect(); // reason: the row's body, then its text
    const a = b.getBoundingClientRect();
    return { textBottom: t.bottom, textRight: t.right, actTop: a.top, actLeft: a.left };
  });
}

async function facts(page: Page) {
  const dl = page.locator('[data-specimen="facts-spec"] dl').first(); // reason: the spec sheet's grid
  return dl.evaluate((el) =>
    [...el.querySelectorAll(':scope > div')].map((row) => {
      const dt = row.querySelector('dt')!;
      const dd = row.querySelector('dd')!;
      const r = row.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(dt).lineHeight);
      const range = document.createRange();
      range.selectNodeContents(dd);
      const v = range.getBoundingClientRect();
      return { left: Math.round(r.left), labelLines: Math.round(dt.getBoundingClientRect().height / lh), rowRight: r.right, valueRight: v.right };
    }),
  );
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`panel steps at 1440, fine pointer, ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test('a row control sits beside its text, the copy cell is 28, the spec sheet has two columns and unwrapped labels', async ({ page }) => {
      await open(page, theme);
      const r = await actRow(page);
      expect(r.actLeft).toBeGreaterThanOrEqual(r.textRight);
      expect(r.actTop).toBeLessThan(r.textBottom);
      const copy = page.locator('[data-specimen="step-list"]').getByRole('button', { name: strings['codeline.label'] });
      const cb = (await copy.boundingBox())!;
      expect(Math.round(cb.width)).toBe(28);
      const f = await facts(page);
      expect(new Set(f.map((x) => x.left)).size).toBe(2);
      for (const x of f) {
        expect(x.labelLines, 'label on one line').toBe(1);
        expect(Math.abs(x.rowRight - x.valueRight), 'value ends at the row end').toBeLessThanOrEqual(1);
      }
    });
  });

  test.describe(`panel steps at 390, coarse pointer, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('a row control drops under its text, the copy cell is 44 x 44, the spec sheet is one column, nothing scrolls sideways', async ({ page }) => {
      const steps = await open(page, theme);
      const r = await actRow(page);
      expect(r.actTop).toBeGreaterThanOrEqual(r.textBottom);
      const copy = steps.getByRole('button', { name: strings['codeline.label'] });
      const cb = (await copy.boundingBox())!;
      expect(cb.width).toBeGreaterThanOrEqual(44);
      expect(cb.height).toBeGreaterThanOrEqual(44);
      const f = await facts(page);
      expect(new Set(f.map((x) => x.left)).size).toBe(1);
      for (const x of f) expect(Math.abs(x.rowRight - x.valueRight), 'value ends at the row end').toBeLessThanOrEqual(1);
      await noSideScroll(page);
      // The long CNAME is cut with an ellipsis inside its line, whole in its title, and the line stays inside its row.
      const long = await steps.locator('code', { hasText: 'shop-atlas-7f3c9a' }).evaluate((c) => {
        const line = c.parentElement!.getBoundingClientRect();
        const row = c.closest('li')!.getBoundingClientRect();
        return { cut: c.scrollWidth > c.clientWidth, ellipsis: getComputedStyle(c).textOverflow, title: c.getAttribute('title'), text: c.textContent, lineRight: line.right, rowRight: row.right, codeRight: c.getBoundingClientRect().right };
      });
      expect(long.cut, 'the long value is cut').toBe(true);
      expect(long.ellipsis).toBe('ellipsis');
      expect(long.title).toBe(long.text);
      expect(long.codeRight).toBeLessThanOrEqual(long.lineRight + 0.5);
      expect(long.lineRight).toBeLessThanOrEqual(long.rowRight + 0.5);
    });
  });
}
