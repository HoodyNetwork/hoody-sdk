// Playwright, on the gallery wizard: container queries need a
// real browser. On a phone the WizardFooter is one row above the shell's bottom bar with Back showing only its arrow
// (its name stays "Back"); a footNote never sits inside the row; the compact step line shows (and is read) only below
// 840, so wide it is never read twice beside the step list.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const row = (page: Page) => page.locator('[class*="wizardFooter"]');
const box = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!;

async function open(page: Page, width: number, step = 'region'): Promise<void> {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await gotoHub(page, `/_kit?layout=wizard&step=${step}`);
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
}

test('on a phone the footer is one row above the bottom bar; Back shows its arrow only', async ({ page }) => {
  await open(page, 390);
  const f = await box(row(page));
  const back = page.getByRole('button', { name: 'Back' });
  const next = page.getByRole('button', { name: 'Next' });
  const cancel = page.getByRole('button', { name: 'Cancel' });
  const [b, n, c] = [await box(back), await box(next), await box(cancel)];
  for (const x of [b, n, c]) {
    expect(x.y, 'every action inside the row').toBeGreaterThanOrEqual(f.y - 1);
    expect(x.y + x.height, 'every action inside the row').toBeLessThanOrEqual(f.y + f.height + 1);
  }
  expect(Math.abs(b.y + b.height / 2 - (n.y + n.height / 2)), 'one row: Back and Next share a line').toBeLessThanOrEqual(2);
  expect(b.x + b.width, 'Back at the start, before the actions').toBeLessThanOrEqual(c.x);
  expect(b.width, 'Back is icon-only').toBeLessThanOrEqual(48);
  const bar = page.getByRole('navigation', { name: 'Quick navigation' });
  if (await bar.isVisible()) expect(f.y + f.height, 'the row stays above the bottom bar').toBeLessThanOrEqual((await box(bar)).y + 1);
});

test('Back is one height with the footer actions (32 on a fine pointer), phone, wide and compact', async ({ page }) => {
  for (const [width, compact] of [[390, false], [1350, false], [390, true], [1350, true]] as const) {
    await open(page, width);
    if (compact) await page.evaluate(() => document.documentElement.setAttribute('data-density', 'compact'));
    const at = `${width}${compact ? ' compact' : ''}`;
    const b = await box(page.getByRole('button', { name: 'Back' }));
    const n = await box(page.getByRole('button', { name: 'Next' }));
    expect(b.height, `Back height at ${at}: the md plate`).toBe(32);
    expect(b.height, `Back as tall as Next at ${at}`).toBe(n.height);
    expect(b.width, `Back at least as wide as tall at ${at}`).toBeGreaterThanOrEqual(b.height);
  }
});

test.describe('on a coarse pointer', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('Back and Next reach the 44 px touch floor together (the Button floor, no footer size of its own)', async ({ page }) => {
    for (const width of [390, 1350]) {
      await open(page, width);
      const b = await box(page.getByRole('button', { name: 'Back' }));
      const n = await box(page.getByRole('button', { name: 'Next' }));
      expect(b.height, `Back height at ${width}`).toBeGreaterThanOrEqual(44);
      expect(b.width, `Back width at ${width}`).toBeGreaterThanOrEqual(44);
      expect(b.height, `Back as tall as Next at ${width}`).toBe(n.height);
    }
  });
});

test('wide, Back keeps its word', async ({ page }) => {
  await open(page, 1350);
  const back = page.getByRole('button', { name: 'Back' });
  await expect(back).toContainText('Back');
  expect((await box(back)).width).toBeGreaterThan(48);
});

test('a footNote sits under the body, never inside the footer row', async ({ page }) => {
  for (const width of [390, 1350]) {
    await open(page, width, 'review');
    const note = page.getByText('A note under the step, above the footer row');
    await expect(note).toBeVisible();
    expect(await row(page).evaluate((r, text) => r.textContent?.includes(text) ?? false, 'A note under the step')).toBe(false);
  }
});

test('the compact step line shows only below 840; the step list only above', async ({ page }) => {
  await open(page, 390);
  await expect(page.getByText(/^Step 2 of 4 · /)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Steps' })).toBeHidden();
  await open(page, 1350);
  await expect(page.getByText(/^Step 2 of 4 · /)).toBeHidden();
  await expect(page.getByRole('list', { name: 'Steps' })).toBeVisible();
});
