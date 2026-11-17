// Playwright (gallery /_kit?tab=table): a header tip keeps its whole hit area and focus
// ring inside its clipping header cell (24 px on a fine pointer, 44 px on a coarse one, the ring 4 px around it). The
// phone list's tip term in a long field (?tipwrap=1) is listmeta-wrap.spec.ts's: line 2 wraps, so it is in sight and
// nothing scrolls to it.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/table.strings.en.json';

const ABOUT = `About ${gallery['col.size']}`;

async function headerTip(page: Page) {
  const tip = page.getByRole('button', { name: ABOUT }).first(); // reason: every header tip of the gallery is the same Size column geometry; the full table's comes first
  await tip.waitFor();
  return tip.evaluate((el) => {
    const th = el.closest('th') as HTMLElement;
    const b = el.getBoundingClientRect();
    const h = th.getBoundingClientRect();
    return { height: b.height, above: b.top - h.top, below: h.bottom - b.bottom, th: h.height };
  });
}

test.describe('fine pointer at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('the header tip and its ring room fit the 32 px header', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=table');
    const g = await headerTip(page);
    expect(g.height).toBeGreaterThanOrEqual(24);
    expect(g.th).toBeLessThanOrEqual(33);
    expect(g.above).toBeGreaterThanOrEqual(3.5);
    expect(g.below).toBeGreaterThanOrEqual(3.5);
  });
});

test.describe('coarse pointer', () => {
  test.use({ viewport: { width: 1280, height: 900 }, hasTouch: true, isMobile: true });
  test('the 44 px header tip and its ring room fit its header, which grows to hold them', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=table');
    const g = await headerTip(page);
    expect(g.height).toBeGreaterThanOrEqual(44);
    expect(g.above).toBeGreaterThanOrEqual(3.5);
    expect(g.below).toBeGreaterThanOrEqual(3.5);
  });
});
