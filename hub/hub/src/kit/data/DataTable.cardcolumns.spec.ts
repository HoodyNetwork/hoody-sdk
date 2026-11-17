// Playwright: in a card, the values of labelled fields start on one edge, within 1 px, whatever their labels' lengths
// (Compare plans at 390: "Free", "Bare metal"), and their labels start on one edge too. On Bots (one labelled field
// per card) the value keeps the same distance from its card's edge in every card, at 1440 and 390.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

declare const process: { env: Record<string, string | undefined> };
const shots = process.env.SHOT_DIR;
const tag = process.env.SHOT_TAG ?? 'shot';

interface Card {
  labels: number[];
  values: number[];
  start: number;
  end: number;
  valueEnds: number[];
}

/** Every drawn card with a labelled field: where its labels and their values start. */
async function cards(page: Page): Promise<Card[]> {
  return page.evaluate(() => {
    const out: { labels: number[]; values: number[]; start: number; end: number; valueEnds: number[] }[] = [];
    for (const body of Array.from(document.querySelectorAll('[class*="cardBody"]'))) {
      const box = body.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const rows = Array.from(body.querySelectorAll(':scope > [class*="cardItem"]')).filter((r) => r.querySelector(':scope > [class*="listLabel"]') && r.getBoundingClientRect().height > 0);
      if (rows.length === 0) continue;
      out.push({
        labels: rows.map((r) => r.querySelector(':scope > [class*="listLabel"]')!.getBoundingClientRect().left),
        values: rows.map((r) => r.querySelector(':scope > [class*="cardValue"]')!.getBoundingClientRect().left),
        valueEnds: rows.map((r) => r.querySelector(':scope > [class*="cardValue"]')!.getBoundingClientRect().right),
        start: box.left,
        end: box.right,
      });
    }
    return out;
  });
}
const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

test('compare plans at 390: every value in a card starts on one edge', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await gotoHub(page, '/billing?view=plans');
  await expect.poll(async () => (await cards(page)).filter((c) => c.values.length > 1).length, { message: 'cards with several labelled fields are drawn' }).toBeGreaterThan(2);
  const found = (await cards(page)).filter((c) => c.values.length > 1);
  for (const c of found) {
    expect(spread(c.values), 'values share a start edge').toBeLessThanOrEqual(1);
    expect(spread(c.labels), 'labels share a start edge').toBeLessThanOrEqual(1);
    expect(Math.min(...c.values), 'values stand after the labels').toBeGreaterThan(Math.min(...c.labels) + 8);
    expect(Math.max(...c.valueEnds), 'no value runs past its card').toBeLessThanOrEqual(c.end + 1);
  }
  if (shots) {
    await page.locator('[class*="cardBody"]').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/${tag}-cardcols-billing-390.png` });
  }
});

for (const width of [1440, 390]) {
  test(`bots at ${width}: the labelled value keeps one distance from its card's edge`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/bots');
    await expect.poll(async () => (await cards(page)).length).toBeGreaterThan(1);
    const found = await cards(page);
    for (const c of found) {
      expect(spread(c.values), 'values share a start edge').toBeLessThanOrEqual(1);
      expect(Math.max(...c.valueEnds), 'no value runs past its card').toBeLessThanOrEqual(c.end + 1);
    }
    expect(spread(found.map((c) => c.values[0]! - c.start)), 'the same label gives the same value edge in every card').toBeLessThanOrEqual(1);
    if (shots) await page.screenshot({ path: `${shots}/${tag}-cardcols-bots-${width}.png` });
  });
}
