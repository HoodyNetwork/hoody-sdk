// Browser: a Bot's card at phone and desktop width. The name and the status sit on the mark's centre line; the facts'
// values start on one edge and their labels on the card's text edge; the ways to reach the Bot keep one gap on a line
// and one centre line.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

declare const process: { env: Record<string, string | undefined> };

for (const width of [390, 1440]) {
  test(`bots at ${width}: the card's head, facts and foot are aligned`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/bots');
    await page.locator('[class*="DataTable-module__cardBody"]').first().waitFor();
    await page.waitForTimeout(800);
    const cards = await page.evaluate(() => {
      const box = (e: Element) => {
        const r = e.getBoundingClientRect();
        return { l: r.left, r: r.right, t: r.top, b: r.bottom, c: (r.top + r.bottom) / 2, h: r.height };
      };
      const q = (root: Element, part: string) => [...root.querySelectorAll(`[class*="DataTable-module__${part}_"]`)];
      return q(document.body, 'cardCell').map((card) => {
        const mark = q(card, 'listLead')[0]!;
        const name = q(card, 'cardTitle')[0]!.firstElementChild!;
        const status = q(card, 'listStatus')[0]!.firstElementChild!;
        const facts = q(card, 'cardItem').filter((i) => i.querySelector('[class*="listLabel"]') && (i as HTMLElement).offsetParent);
        const ways = [...(card.querySelector('[class*="reachWays"]')?.children ?? [])].filter((e) => (e as HTMLElement).offsetWidth > 0);
        return {
          name: name.textContent,
          edge: box(card).l + parseFloat(getComputedStyle(card).paddingInlineStart),
          mark: box(mark),
          title: box(name),
          status: box(status),
          labels: facts.map((i) => box(i.firstElementChild!)),
          values: facts.map((i) => box(i.lastElementChild!)),
          ways: ways.map(box),
        };
      });
    });
    expect(cards.length).toBeGreaterThan(2);
    for (const c of cards) {
      const who = `${c.name} at ${width}`;
      expect(Math.abs(c.title.c - c.mark.c), `${who}: name on the mark's centre`).toBeLessThanOrEqual(1);
      expect(Math.abs(c.status.c - c.mark.c), `${who}: status on the mark's centre`).toBeLessThanOrEqual(1);
      expect(Math.abs(c.mark.l - c.edge), `${who}: mark on the card's text edge`).toBeLessThanOrEqual(1);
      expect(c.values.length, `${who}: facts`).toBeGreaterThanOrEqual(2);
      for (const v of c.values) expect(Math.abs(v.l - c.values[0]!.l), `${who}: values on one edge`).toBeLessThanOrEqual(1);
      for (const l of c.labels) expect(Math.abs(l.l - c.edge), `${who}: labels on the card's text edge`).toBeLessThanOrEqual(1);
      // The ways: on each line one centre and one gap.
      const lines = new Map<number, typeof c.ways>();
      for (const w of c.ways) {
        const key = [...lines.keys()].find((k) => Math.abs(k - w.c) <= 4) ?? w.c;
        lines.set(key, [...(lines.get(key) ?? []), w]);
      }
      for (const line of lines.values()) {
        for (const w of line) expect(Math.abs(w.c - line[0]!.c), `${who}: ways on one centre line`).toBeLessThanOrEqual(1);
        const gaps = line.slice(1).map((w, i) => w.l - line[i]!.r);
        for (const g of gaps) expect(Math.abs(g - gaps[0]!), `${who}: one gap between the ways`).toBeLessThanOrEqual(1);
        expect(Math.abs(line[0]!.l - c.edge), `${who}: each line of ways starts on the card's text edge`).toBeLessThanOrEqual(1);
      }
    }
    await page.locator('[class*="DataTable-module__cardCell"]').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.SHOT_DIR}/${process.env.SHOT_TAG}-botcards-${width}.png` });
    await page.locator('[class*="DataTable-module__cardCell"]').first().screenshot({ path: `${process.env.SHOT_DIR}/${process.env.SHOT_TAG}-botcard-${width}.png` });
  });
}
