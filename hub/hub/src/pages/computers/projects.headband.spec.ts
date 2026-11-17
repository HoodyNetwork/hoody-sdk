// Playwright: a Projects card's name and row menu share one 48 px band at its top,
// on the card head's grey over a 1 px rule, the facts under it 12 px below the band and 16 px above the card's end, and no
// bottom band. Checked in both themes at 1350 and 2400 px, and at 390 (one card per line, no sideways scroll). The shots
// go to the folder named by D38_SHOTS, else the test's output folder. Computed styles need a real browser.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';

/** A token's colour as the browser resolves it in the current theme. */
async function token(page: Page, name: string) {
  return page.evaluate((n) => {
    const d = document.createElement('div');
    d.style.setProperty('background', `var(${n})`);
    document.body.append(d);
    const v = getComputedStyle(d).backgroundColor;
    d.remove();
    return v;
  }, name);
}

const shot = (name: string) => test.info().outputPath(name);

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1350, 2400, 390]) {
    test.describe(`projects header band, ${theme}, ${width} px`, () => {
      test.use({ viewport: { width, height: 1000 } });

      test('the name and the row menu share the top band; the facts sit under it; no bottom band', async ({ page }) => {
        await gotoHub(page, '/computers/projects', { theme });
        const table = page.getByRole('table', { name: 'Projects' });
        const card = table.locator('[data-card-cut]').first();
        await expect(card).toBeVisible();
        const head = card.locator('[class*="cardHeadBand"]');
        await expect(head).toHaveCount(1);
        await expect(head.locator('strong').first()).toBeVisible();
        await expect(head.getByRole('button', { name: /actions/i })).toBeVisible();
        await expect(card.locator('[class*="cardBottom"]')).toHaveCount(0);

        const m = await head.evaluate((h) => {
          const cs = getComputedStyle(h);
          const cell = h.parentElement!;
          const body = cell.querySelector('[class*="cardBody"]') as HTMLElement | null;
          const hb = h.getBoundingClientRect(), cb = cell.getBoundingClientRect();
          return {
            height: hb.height, bg: cs.backgroundColor, line: cs.borderBottomWidth, lineColor: cs.borderBottomColor,
            left: hb.left - cb.left, right: cb.right - hb.right, top: hb.top - cb.top,
            bodyTop: body ? parseFloat(getComputedStyle(body).paddingTop) : null, cellBottom: parseFloat(getComputedStyle(cell).paddingBottom),
          };
        });
        // 48 px band (a coarse pointer may grow it with its 44 px menu target, never shrink it).
        expect(m.height).toBeGreaterThanOrEqual(48);
        expect(m.height).toBeLessThan(50);
        expect(m.bg).toBe(await token(page, '--card-head'));
        expect(m.line).toBe('1px');
        expect(m.lineColor).toBe(await token(page, '--card-head-line'));
        // The band spans the card's whole width from its top edge.
        expect(Math.abs(m.left)).toBeLessThan(1);
        expect(Math.abs(m.right)).toBeLessThan(1);
        expect(Math.abs(m.top)).toBeLessThan(1);
        expect(m.bodyTop).toBe(12);
        expect(m.cellBottom).toBe(16);
        if (theme === 'light') expect(m.bg).toBe('rgb(237, 234, 234)');
        if (width === 390) await noSideScroll(page);
        await page.screenshot({ path: process.env.D38_SHOTS ? `${process.env.D38_SHOTS}/projects-${theme}-${width}.png` : shot(`projects-${theme}-${width}.png`) });
      });
    });
  }
}
