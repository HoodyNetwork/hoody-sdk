// Playwright: an end-aligned column's header ends where its figures end, within 1 px, on real pages at 1440
// (Scripts, Vault, VMs, Memory, the kit gallery) and at 390 wherever a table still draws its header (Memory; the others are lists
// there and draw no column header). Measured on the drawn text, not the cell boxes.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

declare const process: { env: Record<string, string | undefined> };
const shots = process.env.SHOT_DIR;
const tag = process.env.SHOT_TAG ?? 'shot';

interface Head {
  label: string;
  labelStart: number;
  labelEnd: number;
  cellStart: number;
  cellEnd: number;
  figuresEnd: number | null;
}

/** Every drawn end-aligned column header on the page, with the end of its first non-empty cell's text. */
async function heads(page: Page): Promise<Head[]> {
  return page.evaluate(() => {
    const textBox = (e: Element) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      return r.getBoundingClientRect();
    };
    const out: { label: string; labelStart: number; labelEnd: number; cellStart: number; cellEnd: number; figuresEnd: number | null }[] = [];
    for (const th of Array.from(document.querySelectorAll('thead th[class*="_end_"]'))) {
      const box = th.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const label = th.querySelector('[class*="thLabel"]');
      if (!label) continue;
      const l = textBox(label);
      const at = Array.from(th.parentElement!.children).indexOf(th);
      const cell = Array.from(th.closest('table')!.querySelectorAll('tbody tr'))
        .map((row) => row.children[at])
        .find((td) => td && /_end_/.test(td.className) && (td.textContent ?? '').trim() !== '');
      out.push({ label: label.textContent ?? '', labelStart: l.left, labelEnd: l.right, cellStart: box.left, cellEnd: box.right, figuresEnd: cell ? textBox(cell).right : null });
    }
    return out;
  });
}

const PAGES = [
  ['scripts', '/scripts'],
  ['vault', '/vault'],
  ['vms', '/vms'],
  ['memory', '/ai/knowledge/memory'],
  ['gallery', '/_kit?tab=table'],
] as const;

for (const [name, path] of PAGES) {
  test(`${name} at 1440: each end-aligned header ends on its figures`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHub(page, path);
    await expect.poll(async () => (await heads(page)).filter((h) => h.figuresEnd !== null).length, { message: 'an end-aligned column with figures is drawn' }).toBeGreaterThan(0);
    const found = (await heads(page)).filter((h) => h.figuresEnd !== null);
    for (const h of found) {
      expect(Math.abs(h.labelEnd - h.figuresEnd!), `"${h.label}" ends where its figures end`).toBeLessThanOrEqual(1);
      expect(h.labelStart, `"${h.label}" stays inside its cell`).toBeGreaterThanOrEqual(h.cellStart);
      expect(h.labelEnd, `"${h.label}" stays inside its cell`).toBeLessThanOrEqual(h.cellEnd);
    }
    if (shots) await page.screenshot({ path: `${shots}/${tag}-headalign-${name}-1440.png` });
  });
}

test('memory at 390: the table keeps its header, and it ends on its figures', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await gotoHub(page, '/ai/knowledge/memory');
  await expect.poll(async () => (await heads(page)).filter((h) => h.figuresEnd !== null).length).toBeGreaterThan(0);
  for (const h of (await heads(page)).filter((x) => x.figuresEnd !== null)) {
    expect(Math.abs(h.labelEnd - h.figuresEnd!), `"${h.label}" ends where its figures end`).toBeLessThanOrEqual(1);
    expect(h.labelStart, `"${h.label}" stays inside its cell`).toBeGreaterThanOrEqual(h.cellStart);
  }
  if (shots) await page.screenshot({ path: `${shots}/${tag}-headalign-memory-390.png` });
});

test('scripts at 390: a list draws no column header to misalign', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await gotoHub(page, '/scripts');
  await page.locator('table').first().waitFor();
  expect(await heads(page)).toHaveLength(0);
  if (shots) await page.screenshot({ path: `${shots}/${tag}-headalign-scripts-390.png` });
});
