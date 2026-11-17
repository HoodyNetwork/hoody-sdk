// ListDetailPage's footer as drawn, not as its CSS source reads. In a narrow content pane (under 600 px, the gallery's
// side mode at 390) the footer sticks to the bottom of the pane and its buttons take the kit's own heights, all of one
// height: 32 with a mouse, 44 on a coarse pointer (the Button's touch floor). A wide pane keeps 32 too. Boxes need
// a real browser, not jsdom.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/table.strings.en.json';

async function openRow(page: Page) {
  await page.locator('tbody tr[data-row-opens]').first().click({ position: { x: 8, y: 8 } });
  await expect.poll(() => page.url()).toContain('sel=');
}

async function footer(page: Page) {
  const save = page.getByRole('button', { name: gallery['detail.save'], exact: true });
  await save.waitFor();
  const cancel = page.getByRole('button', { name: gallery['detail.cancel'], exact: true });
  return save.evaluate((s, c) => {
    const f = s.closest('footer')!;
    const h = (el: Element) => Math.round(el.getBoundingClientRect().height * 10) / 10;
    return { inOne: f.contains(c as Node), position: getComputedStyle(f).position, save: h(s), cancel: h(c as Element) };
  }, await cancel.elementHandle());
}

for (const theme of ['light', 'dark'] as const)
  for (const pointer of ['fine', 'coarse'] as const)
    test.describe(`detail footer, ${theme}, ${pointer} pointer`, () => {
      test.use({ viewport: { width: 390, height: 844 }, ...(pointer === 'coarse' ? { hasTouch: true, isMobile: true } : {}) });

      const tall = pointer === 'coarse' ? 44 : 32;
      test(`in a narrow pane every footer button is ${tall} tall, Cancel and Save alike, and the footer sticks`, async ({ page }) => {
        await gotoHub(page, '/_kit?layout=list-side', { theme });
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(pointer === 'coarse');
        await openRow(page);
        expect(await footer(page)).toEqual({ inOne: true, position: 'sticky', save: tall, cancel: tall });
      });
    });

test.describe('detail footer in a wide pane', () => {
  test.use({ viewport: { width: 1350, height: 900 } });

  test('a wide pane keeps the buttons at their own height (the narrow size is the narrow pane only)', async ({ page }) => {
    await gotoHub(page, '/_kit?layout=list-side');
    await openRow(page);
    const f = await footer(page);
    expect([f.inOne, f.save, f.cancel]).toEqual([true, 32, 32]);
  });
});
