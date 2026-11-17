// Playwright: every toolbar control's words in one type, the segments' style: Geist Mono, 12 px,
// 500, uppercase, 0.06em (0.72 px at 12 px). Measured as drawn on the demo page's DataTable toolbar: the filter chip's
// name, the Filters button's words once the chip folds, and a View segment for reference. A chip's chosen value is data
// and keeps its own case with no tracking (the `literal` rule), as does a `literal` toolbar Button (the controls tab's
// toolbar scope rows). Both themes, fine and coarse pointer, at 1350 and at the fold. Type needs a real browser.
import { expect, type Locator, type Page } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import kit from '../strings.en.json';

interface Type {
  family: string;
  size: string;
  weight: string;
  transform: string;
  tracking: string;
}

const typeOf = (l: Locator): Promise<Type> =>
  l.evaluate((el) => {
    const c = getComputedStyle(el);
    return { family: c.fontFamily.split(',')[0]!.replace(/"/g, '').trim(), size: c.fontSize, weight: c.fontWeight, transform: c.textTransform, tracking: c.letterSpacing };
  });

const TOOLBAR: Type = { family: 'Geist Mono', size: '12px', weight: '500', transform: 'uppercase', tracking: '0.72px' };

const frame = (page: Page) => page.locator('#hub-main [data-table-frame]').first();
const toolbar = (page: Page) => frame(page).locator(':scope > div:has([data-hub-search])').first();
const chips = (page: Page) => toolbar(page).locator(`[role="group"][aria-label="${kit['table.filters']}"]`);
const filtersWords = (page: Page) => toolbar(page).getByRole('button', { name: new RegExp(`^${kit['table.filtersButton']}`) });

for (const theme of ['light', 'dark'] as const) {
  test.describe(`toolbar type, ${theme}`, () => {
    for (const pointer of ['fine', 'coarse'] as const)
    test(`${pointer} pointer: a chip name and the Filters words read mono 12 500 caps 0.06em; a chosen value keeps its case`, async ({ hubPage, hubPageCoarse }) => {
      const page = pointer === 'coarse' ? hubPageCoarse : hubPage;
      await page.setViewportSize({ width: 1350, height: 900 });
      await gotoHub(page, '/demo', { theme });
      await expect(chips(page)).toBeVisible();
      const name = toolbar(page).locator('[data-chip] button').first(); // the chip's own name button (name, then clear)
      expect(await typeOf(name), 'the chip name').toEqual(TOOLBAR);
      await name.click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(menu).toBeHidden();
      await expect(page).toHaveURL(/[?&]status=[^&]+/);
      const value = toolbar(page).locator('[data-chip] button').first().locator('span').nth(1); // name, then the value
      await expect(value).toBeVisible();
      expect(await typeOf(value), 'a chosen value is data: its own case, no tracking').toMatchObject({ family: 'Geist Mono', size: '12px', transform: 'none', tracking: 'normal' });
      // Narrow until the chip folds into the Filters button with its words (the first fold step; 10 px at a time, so the
      // later steps, which follow within a few px on a short toolbar, cannot be jumped over).
      let folded = false;
      for (let w = 1300; w >= 320 && !folded; w -= 10) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
        folded = (await chips(page).count()) === 0 && (await filtersWords(page).count()) > 0 && ((await filtersWords(page).first().textContent()) ?? '').trim() !== '';
      }
      expect(folded, 'the chip folds into the Filters button with words somewhere between 1300 and 320').toBe(true);
      expect(await typeOf(filtersWords(page).first()), 'the Filters words').toEqual(TOOLBAR);
    });

    test('a literal toolbar Button keeps its own case and no tracking, at the toolbar size', async ({ hubPage: page }) => {
      await page.setViewportSize({ width: 1350, height: 900 });
      await gotoHub(page, '/_kit?tab=controls', { theme });
      const literal = page.locator('[data-scope-probe="outside"] button[data-literal]').first();
      await literal.waitFor();
      expect(await typeOf(literal)).toEqual({ family: 'Geist Mono', size: '12px', weight: '500', transform: 'none', tracking: 'normal' });
    });
  });
}
