// Playwright: every page header ends in exactly one #c4c4c4 line. Without a tab
// strip under it, that is the header's own bottom border, with 16 px above it and 20 px below. When a tab strip follows
// directly (the page or its layout says so: PageHeader `tabsFollow`), the strip's line is the one line: the header
// draws none and ends 12 px under its last line. The header's actions sit level with its title.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

/** The page header as drawn, and the first horizontal tab strip under it (its distance below the header's box). */
async function head(page: Page) {
  const header = page.locator('main header:has(h1)').first();
  await expect(header).toBeVisible({ timeout: 20_000 });
  return header.evaluate((el) => {
    // A header the page replaced between the locator's resolve and this read (the router's placeholder, a page's own
    // loading frame) is no longer in the document: it has no computed style, so it reads as unsettled.
    if (!el.isConnected) return null;
    const c = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const strips = Array.from(document.querySelectorAll('main [role="tablist"]')).map((t) => t.getBoundingClientRect().top - box.bottom);
    const below = strips.filter((d) => d >= -1).sort((a, b) => a - b)[0];
    return {
      line: `${c.borderBottomWidth} ${c.borderBottomStyle} ${c.borderBottomColor}`,
      pad: c.paddingBottom,
      margin: c.marginBottom,
      strip: below === undefined ? null : Math.round(below),
    };
  });
}

/**
 * The header the page settles on. Until a page's code has loaded, the router draws a placeholder header (PageLoading,
 * `data-page-loading`, title only, its own line), and a page may draw a loading header of its own before the loaded one
 * (Logs: TablePage, then ListDetailPage). Reading the first header seen measured whichever frame was up (a red on
 * /logs and /files under load), so the read is retried until the page's own header holds what is expected.
 */
async function settledHead(page: Page, want: Record<string, unknown>, message?: string) {
  await expect(page.locator('main [data-page-loading]')).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => head(page), { timeout: 20_000, ...(message ? { message } : {}) }).toMatchObject(want);
  return (await head(page))!;
}

const RULE = '1px solid rgb(196, 196, 196)';
const RULE_DARK = '1px solid rgba(255, 255, 255, 0.24)';

for (const route of ['/home', '/vault', '/logs']) {
  test(`${route}: no strip under the header, so the header's own line closes it`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, route);
    await settledHead(page, { line: RULE, pad: '16px', margin: '12px' });
  });
}

test('dark: the header line is the --hx-rule dark pair', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/home', { theme: 'dark' });
  await settledHead(page, { line: RULE_DARK, pad: '16px', margin: '12px' });
});

// The pages that draw a tab strip directly under their header (Computers: its views Computers | Servers | Projects), the
// AI folder page among them
// (a folder on atlas; no write band shows; the case with one is below).
const FOLDER = '/ai/f/L2hvbWUvdXNlcg?computer=atlas.00a1&realm=global';
for (const route of ['/computers', '/keys', '/files', '/programs', '/notifications', '/notifications/learn', '/billing', FOLDER]) {
  test(`${route}: a tab strip follows, so its line is the header's one line`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, route);
    const h = await settledHead(page, { line: expect.stringMatching(/^0px none/), pad: '12px', margin: '0px' }, 'no line of its own, 12 px under its last line, nothing below');
    expect(h.strip, 'the strip starts right under the header').not.toBeNull();
    // Adjacent: no page spacing between the header's box and the strip (its own 12 px is the only room).
    expect(h.strip!).toBeLessThanOrEqual(1);
  });
}

// With a write result on the AI folder page (its band of the last write under the head), the header no longer meets the
// strip: its own line closes it, 20 px down to the band; the band's blocks and the tabs keep the 16 px page gap, and the
// strip-to-panel spacing is the same as without a band. The shop folder is a repository on atlas; the fixture never
// answers a Sync, so the band shows the outcome-unknown result and its step facts.
const SHOP = '/ai/f/L2hvbWUvYWRhL3Nob3A?computer=atlas.00a1&realm=global';
test('/ai/f with a write band: the header line, 20 px to the band, 16 px between its blocks and to the tabs', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, SHOP);
  /** The header's line, the drawn blocks after it (top/bottom), and the strip-to-panel distance. */
  const geo = () => page.evaluate(() => {
    const header = document.querySelector('main header:has(h1)')!;
    const c = getComputedStyle(header);
    const blocks = Array.from(header.nextElementSibling?.children ?? [])
      .map((k) => k.getBoundingClientRect())
      .filter((r) => r.height > 0)
      .map((r) => ({ top: r.top, bottom: r.bottom }));
    const strip = document.querySelector('main [role="tablist"]')!.getBoundingClientRect();
    const panel = document.querySelector('main [role="tabpanel"]')!.getBoundingClientRect();
    return {
      line: `${c.borderBottomWidth} ${c.borderBottomStyle} ${c.borderBottomColor}`, pad: c.paddingBottom, margin: c.marginBottom,
      header: header.getBoundingClientRect().bottom, blocks, stripToPanel: Math.round(panel.top - strip.bottom),
      strip: { top: strip.top, width: strip.width, height: strip.height }, panel: { width: panel.width, height: panel.height },
    };
  });
  const sync = page.getByRole('button', { name: 'Sync', exact: true });
  await expect(sync).toBeVisible({ timeout: 20_000 });
  const before = await geo();
  // A drawn strip and panel, so the strip-to-panel distance measures the tabs and not two empty boxes.
  await expect(page.locator('main [role="tablist"]')).toBeVisible();
  await expect(page.locator('main [role="tabpanel"]')).toBeVisible();
  for (const box of [before.strip, before.panel]) expect(Math.min(box.width, box.height), 'the strip and the panel are drawn').toBeGreaterThan(0);
  await sync.click();
  await expect(page.locator('main header:has(h1) + * [role="alert"]')).toBeVisible({ timeout: 20_000 });
  // The band's facts render with the alert; wait until the tabs have moved down under every block.
  await expect.poll(async () => (await geo()).blocks.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  const after = await geo();
  await expect(page.locator('main [role="tablist"]')).toBeVisible();
  await expect(page.locator('main [role="tabpanel"]')).toBeVisible();
  for (const box of [after.strip, after.panel]) expect(Math.min(box.width, box.height), 'the strip and the panel are still drawn').toBeGreaterThan(0);
  // The last measured block is the tabs (it starts where the strip starts); the ones above it are the band's.
  expect(Math.round(after.blocks.at(-1)!.top), 'the tabs are the last block').toBe(Math.round(after.strip.top));
  expect(after, 'the header draws its own line again').toMatchObject({ line: RULE, pad: '16px', margin: '12px' });
  expect(Math.round(after.blocks[0]!.top - after.header), 'header to band').toBe(12);
  const gaps = after.blocks.slice(1).map((b, i) => Math.round(b.top - after.blocks[i]!.bottom));
  expect(gaps, 'every block after the band\'s first, the tabs last, 16 px below the one above').toEqual(gaps.map(() => 16));
  expect(after.stripToPanel, 'strip to panel as without a band').toBe(before.stripToPanel);
});

test('the actions sit level with the title, not centred on the title and subtitle', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/notifications');
  const header = page.locator('main header:has(h1)').first();
  await expect(header.locator('p')).toBeVisible({ timeout: 20_000 });
  const geo = await header.evaluate((el) => {
    const title = el.querySelector('h1')!;
    const h1 = title.getBoundingClientRect();
    // The title row is the header's child holding the h1; its last child, when it holds no h1, is the actions.
    const row = Array.from(el.children).find((c) => c.contains(title));
    const end = row?.lastElementChild;
    const actions = end && !end.contains(title) ? end.getBoundingClientRect() : null;
    return { title: { top: h1.top, mid: h1.top + h1.height / 2 }, actions: actions && { top: actions.top, mid: actions.top + actions.height / 2 } };
  });
  expect(geo.actions, 'the header has actions').not.toBeNull();
  // Level with the title line: the actions' centre is within 6 px of the title's centre (a subtitle below no longer
  // pulls them down).
  expect(Math.abs(geo.actions!.mid - geo.title.mid)).toBeLessThanOrEqual(6);
});

test('on a phone the wrapped header row keeps its actions where they were: no pull-up, the row gap whole', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, '/notifications');
  const header = page.locator('main header:has(h1)').first();
  await expect(header.locator('p')).toBeVisible({ timeout: 20_000 });
  const geo = await header.evaluate((el) => {
    const title = el.querySelector('h1')!;
    const row = Array.from(el.children).find((c) => c.contains(title))!;
    const end = row.lastElementChild!;
    const titles = Array.from(row.children).find((c) => c.contains(title))!;
    return { margin: getComputedStyle(end).marginTop, gap: Math.round(end.getBoundingClientRect().top - titles.getBoundingClientRect().bottom) };
  });
  // The actions take their own line under the title block, 8 px (the row gap) below it.
  expect(geo).toEqual({ margin: '0px', gap: 8 });
});
