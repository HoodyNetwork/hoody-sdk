// Mixed rows: density never changes a control height. The controls gallery's mixed-row specimen puts md, sm and toolbar
// controls side by side, once at the default density and once inside a compact area. Every control keeps its size's
// height in both: an md button (Button, IconButton, ghost) 32 beside the 40 px fields (Select, SearchField), sm 28
// (Button, IconButton, ghost), toolbar --tb-ctl-h 40 (Button, IconButton, SearchField). A coarse pointer raises every
// one of them to 44: a field and a toolbar control by their own height, a button with words by its touch minimum, an
// IconButton by its --icon-hit. Both themes.
import { expect, type Page } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';

type Pointer = 'fine' | 'coarse';
const FIELDS = ['select', 'search'];
const want = (size: string, item: string, pointer: Pointer): number => {
  if (pointer === 'coarse') return 44;
  if (size === 'toolbar' || FIELDS.includes(item)) return 40;
  return size === 'sm' ? 28 : 32;
};

const heights = (page: Page) =>
  page.locator('[data-mix-row]').evaluateAll((rows) =>
    rows.flatMap((row) =>
      [...row.querySelectorAll<HTMLElement>('[data-mix-item]')].map((item) => {
        // A Select's first child is its hidden native select; its trigger button is the control.
        const el = (item.getAttribute('data-mix-item') === 'select' ? item.querySelector('button') : item.firstElementChild) as HTMLElement;
        return { row: row.getAttribute('data-mix-row')!, item: item.getAttribute('data-mix-item')!, h: Math.round(el.getBoundingClientRect().height) };
      }),
    ),
  );

const check = async (page: Page, theme: 'light' | 'dark', pointer: Pointer) => {
  await gotoHub(page, '/_kit?tab=controls', { theme });
  await page.locator('[data-mix-row="compact.toolbar"]').waitFor();
  const got = await heights(page);
  expect(got.map((g) => g.row).filter((r, i, a) => a.indexOf(r) === i)).toEqual(['default.md', 'default.sm', 'default.toolbar', 'compact.md', 'compact.sm', 'compact.toolbar']);
  expect(got.length).toBe(2 * (5 + 3 + 4));
  const wrong = got.filter((g) => g.h !== want(g.row.split('.')[1]!, g.item, pointer)).map((g) => `${g.row} ${g.item}: ${g.h}, want ${want(g.row.split('.')[1]!, g.item, pointer)}`);
  expect(wrong, `${theme} ${pointer}: controls off their size's height`).toEqual([]);
};

for (const theme of ['light', 'dark'] as const) {
  test(`fine ${theme}: md, sm and toolbar controls keep their heights side by side, compact included`, async ({ hubPage: page }) => {
    await page.setViewportSize({ width: 1350, height: 1000 });
    await check(page, theme, 'fine');
  });
  test(`coarse ${theme}: every control is 44, IconButton sm included, compact included`, async ({ hubPageCoarse: page }) => {
    await check(page, theme, 'coarse');
  });
}
