// Playwright: a ListDetailPage's banner sits between the page header and both panes, and
// in one-pane mode (a selection under 846 px of page width) it stays, above the detail's "‹ <page>" back row, while the
// header and the list give way. The gallery's full-size list-detail draws a banner only with ?banner=1.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import kit from '../strings.en.json';
import gallery from '../gallery/table.strings.en.json';

const banner = (page: Page) => page.getByText(gallery['detail.banner']);
const title = (page: Page) => page.getByRole('heading', { name: gallery['detail.title'], exact: true });
const list = (page: Page) => page.getByRole('region', { name: gallery['detail.title'], exact: true });
const detail = (page: Page) => page.getByRole('region', { name: kit['listDetail.detail'], exact: true });

async function openRow(page: Page) {
  await page.locator('tbody tr[data-row-opens]').first().click({ position: { x: 8, y: 8 } });
  await expect.poll(() => page.url()).toContain('sel=');
  await expect(detail(page)).toBeVisible();
}

async function box(page: Page, get: (p: Page) => ReturnType<Page['locator']>) {
  const b = await get(page).boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

for (const mode of ['side', 'fill'] as const) {
  test(`@banner ${mode} at 1350: header, then the banner, then both panes`, async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, `/_kit?layout=list-${mode}&banner=1`);
    await expect(banner(page)).toBeVisible();
    const [head, band, pane] = [await box(page, title), await box(page, banner), await box(page, list)];
    expect(band.y, 'under the header').toBeGreaterThanOrEqual(head.y + head.height);
    expect(pane.y, 'above the list pane').toBeGreaterThanOrEqual(band.y + band.height);
    await openRow(page);
    const open = await box(page, detail);
    expect(open.y, 'above the detail pane too').toBeGreaterThanOrEqual(band.y + band.height);
  });

  test(`@banner ${mode} at 390 with a selection: the banner stays above "‹ ${gallery['detail.title']}", the header and list give way`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHub(page, `/_kit?layout=list-${mode}&banner=1`);
    await openRow(page);
    await expect(banner(page)).toBeVisible();
    await expect(title(page)).toBeHidden();
    await expect(list(page)).toBeHidden();
    const back = detail(page).getByRole('button', { name: gallery['detail.title'], exact: true });
    await expect(back).toBeVisible();
    const [band, row] = [await box(page, banner), await box(page, () => back)];
    expect(row.y, 'the back row under the banner').toBeGreaterThanOrEqual(band.y + band.height);
  });
}

test('@banner without ?banner=1 the gallery page draws none', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, '/_kit?layout=list-side');
  await openRow(page);
  await expect(banner(page)).toHaveCount(0);
});
