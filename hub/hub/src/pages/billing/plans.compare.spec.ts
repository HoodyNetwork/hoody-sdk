// Plans in the browser: one row of plan columns, Free first, each plan once with its one
// action, the actions lined up along the bottom, no table. A phone stacks the columns, every action in reach, and
// "Plans for" stays a radio group, its label shown, long server names wrapped. No width scrolls the page sideways, left to right or right to left, light or dark.
import { type Page, expect } from '@playwright/test';
import { gotoHub, noSideScroll, test } from '@app/e2e';
import strings from './strings.en.json';

const section = (page: Page) => page.locator('[data-section="plans"]');
// The plan columns; the Bare metal band, the grid's wide last card, is not one of them.
const columns = (page: Page) => section(page).locator('[data-kit="plan-card"]:not([data-wide])');
const boxes = (page: Page) => columns(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
const actionBottoms = (page: Page) =>
  columns(page).locator('[data-plan-part="action"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().bottom)));

// 1100 is narrower than four 260 px columns beside the page's rail, so the grid wraps (auto-fit,
// minmax(260px, 1fr)): every column still has the same width and the actions in each row line up.
for (const [width, theme, rows] of [[1440, 'light', 1], [1440, 'dark', 1], [1100, 'light', 2], [2400, 'light', 1]] as const) {
  test(`at ${width} ${theme}: Free and the three plans in ${rows === 1 ? 'one row' : 'two rows'}, equal widths, actions lined up, no table`, async ({ hubPage: page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await gotoHub(page, '/billing?view=plans', { theme });
    await expect(columns(page)).toHaveCount(4);
    await expect(section(page).getByRole('table')).toHaveCount(0);
    const b = await boxes(page);
    expect(new Set(b.map((x) => Math.round(x.top))).size, 'rows').toBe(rows);
    expect(Math.max(...b.map((x) => x.width)) - Math.min(...b.map((x) => x.width)), 'equal widths').toBeLessThanOrEqual(1);
    const bottoms = await actionBottoms(page);
    expect(bottoms).toHaveLength(3); // Free has nothing to buy
    // per row of columns: the actions of the columns that share a top line up
    const tops = b.slice(1).map((x) => Math.round(x.top)); // Free (first) has no action
    for (const top of new Set(tops)) {
      const row = bottoms.filter((_, i) => tops[i] === top);
      expect(Math.max(...row) - Math.min(...row), 'actions on one line').toBeLessThanOrEqual(1);
    }
    for (const name of ['Small', 'Medium', 'Large']) await expect(section(page).getByRole('button', { name: `Choose ${name}`, exact: true })).toHaveCount(1);
    await noSideScroll(page);
  });
}

test('live-shaped data at 1440: Free, Plus ×2 and Pro ×5 over bars, no catalogue description, whole-dollar prices', async ({ hubPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoHub(page, '/billing?view=plans', { state: 'plans-live' });
  await expect(columns(page)).toHaveCount(3);
  await expect(columns(page).nth(1).getByRole('img', { name: 'Free AI: 2 times the Free plan' })).toBeVisible();
  await expect(columns(page).nth(2).getByRole('img', { name: 'Free AI: 5 times the Free plan' })).toBeVisible();
  await expect(section(page)).not.toContainText('vCPU, 6 GB');
  await expect(columns(page).nth(1).locator('[data-plan-part="price"]')).toHaveText('$10');
  await expect(columns(page).nth(2).locator('[data-plan-part="price"]')).toHaveText('$25');
  await noSideScroll(page);
});

test('a picked server at 1440: Upgrade on the bigger plans, nothing on its own, one row still', async ({ hubPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoHub(page, '/billing?view=plans&sub=a1b2c3d4e5f60718293a4b01');
  await expect(section(page).getByRole('button', { name: 'Upgrade to Medium: n12' })).toBeVisible();
  await expect(section(page).getByRole('button', { name: 'Upgrade to Large: n12' })).toBeVisible();
  await expect(section(page).getByRole('button', { name: /^Choose / })).toHaveCount(0);
  await expect(section(page).getByRole('radio', { name: 'n12 · Small' })).toBeChecked();
  const b = await boxes(page);
  expect(new Set(b.map((x) => Math.round(x.top))).size).toBe(1);
  await noSideScroll(page);
});

for (const dir of ['ltr', 'rtl'] as const)
  for (const theme of ['light', 'dark'] as const)
    test(`at 390 coarse ${dir} ${theme}: the columns stacked, every action in reach and 44 px tall, Plans for a radio group, no sideways scroll`, async ({ hubPageCoarse: page }) => {
      await page.setViewportSize({ width: 390, height: 1000 });
      await gotoHub(page, '/billing?view=plans', { theme });
      if (dir === 'rtl') await page.evaluate(() => void (document.documentElement.dir = 'rtl'));
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'a coarse pointer').toBe(true);
      await expect(columns(page)).toHaveCount(4);
      const b = await boxes(page);
      for (let i = 1; i < b.length; i++) expect(b[i]!.top, 'stacked').toBeGreaterThanOrEqual(b[i - 1]!.bottom);
      const main = await page.locator('#hub-main').boundingBox();
      for (const x of b) {
        expect(x.left).toBeGreaterThanOrEqual(main!.x - 1);
        expect(x.right).toBeLessThanOrEqual(main!.x + main!.width + 1);
      }
      for (const name of ['Small', 'Medium', 'Large']) {
        const btn = section(page).getByRole('button', { name: `Choose ${name}`, exact: true });
        const bb = await btn.boundingBox();
        expect(bb!.height, `Choose ${name} touch height`).toBeGreaterThanOrEqual(44);
      }
      // "Plans for" stays a radio group with its label shown, one choice per line.
      const group = section(page).getByRole('radiogroup', { name: strings['plans.for'] });
      await expect(group).toBeVisible();
      await expect(section(page).getByText(strings['plans.for'], { exact: true })).toBeVisible();
      await expect(group.getByRole('radio')).toHaveCount(3);
      await noSideScroll(page);
    });

for (const dir of ['ltr', 'rtl'] as const)
  test(`at 390 coarse ${dir}: long server names keep Plans for a radio group, wrapped inside the page, each choice in reach`, async ({ hubPageCoarse: page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await gotoHub(page, '/billing?view=plans', { state: 'plans-long-names' });
    if (dir === 'rtl') await page.evaluate(() => void (document.documentElement.dir = 'rtl'));
    const group = section(page).getByRole('radiogroup', { name: strings['plans.for'] });
    await expect(group).toBeVisible();
    await expect(section(page).getByRole('combobox')).toHaveCount(0);
    const main = await page.locator('#hub-main').boundingBox();
    const radios = group.locator('label');
    await expect(radios).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const r = await radios.nth(i).boundingBox();
      expect(r!.x, 'choice inside the page').toBeGreaterThanOrEqual(main!.x - 1);
      expect(r!.x + r!.width, 'choice inside the page').toBeLessThanOrEqual(main!.x + main!.width + 1);
      expect(r!.height, 'choice touch height').toBeGreaterThanOrEqual(44);
    }
    await radios.filter({ hasText: 'Singapore Medium build' }).click();
    await expect(section(page).getByRole('button', { name: /^Upgrade to Large: Singapore Medium build/ })).toBeVisible();
    await noSideScroll(page);
  });
