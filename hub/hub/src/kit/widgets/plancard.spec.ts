// Playwright: PlanCards in their grid (the kit gallery's Pieces tab). The cards of a row
// share one height and pin their actions at the bottom (four ready actions, two side by side at 1350), the price is the 300-weight, 40 px display price type with
// tabular figures, and a long name or price wraps inside the card instead of overflowing it, every price and label
// whole (no part clipped or ellipsized inside the card). Light and dark.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const cards = (page: Page) => page.locator('[data-gallery="plan-cards"] > [data-kit="plan-card"]');

async function rows(page: Page) {
  const boxes = await cards(page).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const action = el.querySelector('[data-plan-part="action"]')?.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), gap: action ? Math.round(r.bottom - action.bottom) : null, state: el.getAttribute('data-state') };
    }),
  );
  const byTop = new Map<number, typeof boxes>();
  for (const b of boxes) byTop.set(b.top, [...(byTop.get(b.top) ?? []), b]);
  return [...byTop.values()];
}

for (const theme of ['light', 'dark'] as const)
  for (const width of [390, 760, 1350])
    test(`@plancard ${theme} at ${width}: one height per row, actions lined up, the price type, nothing overflows`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await gotoHub(page, '/_kit?tab=pieces', { theme });
      const grid = page.locator('[data-gallery="plan-cards"]');
      await grid.scrollIntoViewIfNeeded();
      await expect(cards(page)).toHaveCount(6);
      const all = await rows(page);
      // The gallery's four ready cards each have an action (free, accent, current, long); loading and error have none.
      expect(all.flat().filter((b) => b.state === 'ready' && b.gap !== null).length, 'every ready card shows its action').toBe(4);
      for (const row of all) {
        expect(new Set(row.map((b) => b.bottom)).size, 'one height in the row').toBe(1);
        const gaps = row.filter((b) => b.gap !== null && b.state === 'ready').map((b) => b.gap!);
        expect(new Set(gaps).size, 'actions at the same distance from the bottom').toBeLessThanOrEqual(1);
        // Pinned, not just aligned: the action sits at the card's bottom padding (--pad-card plus the frame), not after
        // its content.
        for (const g of gaps) expect(g, 'the action sits at the bottom of the card').toBeLessThanOrEqual(40);
      }
      if (width === 1350) {
        // Side by side, the free card (2 specs) and the accent card (fold, footnote) differ in content height: equal
        // gaps in one row then prove the actions are pinned to the bottom, not following the content.
        const shared = all.filter((r) => r.filter((b) => b.state === 'ready' && b.gap !== null).length > 1);
        expect(shared.length, 'a row holds two ready cards with actions').toBeGreaterThan(0);
      }
      // The prices of a row share one top whatever marks each card carries (each card's marks have a line of their own):
      // compared across the cards whose names take one line (the long-name specimen wraps on purpose).
      const priceTops = await cards(page).evaluateAll((els) =>
        els.map((el) => {
          const h = el.querySelector(':is(h2, h3, h4, h5, h6)');
          const lines = h ? Math.round(h.getBoundingClientRect().height / (parseFloat(getComputedStyle(h).lineHeight) || 1)) : 0;
          return { top: Math.round(el.getBoundingClientRect().top), lines, price: el.querySelector('[data-plan-part="price"]')?.getBoundingClientRect().top };
        }),
      );
      const byRow = new Map<number, number[]>();
      for (const c of priceTops) if (c.price !== undefined && c.lines === 1) byRow.set(c.top, [...(byRow.get(c.top) ?? []), Math.round(c.price)]);
      for (const tops of byRow.values()) expect(new Set(tops).size, 'the prices of a row line up').toBe(1);
      // PlanGrid hands each card four rows (head, marks, price, body): the bodies of a row share a top too, whatever
      // marks each card carries (the first specimen has two).
      const bodyTops = await cards(page).evaluateAll((els) =>
        els.map((el) => ({ top: Math.round(el.getBoundingClientRect().top), body: el.querySelector('[data-plan-part="body"]')?.getBoundingClientRect().top })),
      );
      const bodies = new Map<number, number[]>();
      for (const c of bodyTops) if (c.body !== undefined) bodies.set(c.top, [...(bodies.get(c.top) ?? []), Math.round(c.body)]);
      for (const tops of bodies.values()) expect(new Set(tops).size, 'the bodies of a row line up').toBe(1);
      const price = cards(page).nth(1).locator('[data-plan-part="price"]');
      const font = await price.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { weight: cs.fontWeight, size: cs.fontSize, line: cs.lineHeight, numeric: cs.fontVariantNumeric, family: cs.fontFamily };
      });
      expect(font).toMatchObject({ weight: '300', size: '40px', line: '44px', numeric: 'tabular-nums' });
      expect(font.family).toContain('Oxanium');
      const overflow = await cards(page).evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
      expect(overflow, 'a long name or price wraps inside its card').toBe(0);
      // The card's own width proves nothing about a part clipped inside it. Every visible text box in a
      // card (name, chip, price, per, lead, specs, the action's label) holds its whole text: no box narrower or, when it
      // clips, shorter than its content, so no ellipsis or line clamp cuts it (an ellipsis shows only on overflow). A box
      // that clips (overflow not visible) is checked too, text or not, so a clipped wrapper cannot hide a whole child.
      const clipped = await cards(page).evaluateAll((els) =>
        els.flatMap((card) =>
          [card, ...card.querySelectorAll('*')]
            .filter((el) => {
              const cs = getComputedStyle(el);
              if (cs.display === 'inline' || cs.display === 'contents' || cs.visibility === 'hidden') return false;
              if (!(el as HTMLElement).offsetParent && cs.position !== 'fixed') return false;
              // Screen-reader-only text is clipped by design: only a kit srOnly element (the kit's one class, `hxSrOnly` in
              // base.css via SR_ONLY, or a module's own srOnly, and the 1 px clipped box the class draws). The same
              // declarations on any other part (a plan name) hide visible text and are checked.
              if (el.matches('.hxSrOnly, [class*="__srOnly_"]') && cs.position === 'absolute' && cs.clipPath === 'inset(50%)') return false;
              if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return true;
              return [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '') || el.querySelector(':scope > span, :scope > bdi') !== null;
            })
            .filter((el) => {
              const cs = getComputedStyle(el);
              const wide = el.scrollWidth > el.clientWidth + 1;
              // Vertically, a clipped line is lost text, whole or in part; glyph ink past a tight line box (the kit Button
              // label at line-height 1: 2 px at 13 px) is not, so a box counts as cut past a quarter line and 2 px. A line
              // clamp always counts.
              const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
              const lost = el.scrollHeight - el.clientHeight;
              const clamp = cs.getPropertyValue('-webkit-line-clamp');
              const tall = (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') && ((lost > 2 && lost > line / 4) || (clamp !== '' && clamp !== 'none' && lost > 0));
              return wide || tall;
            })
            .map((el) => `${card.getAttribute('aria-label')}: ${el.tagName.toLowerCase()} "${el.textContent!.trim().slice(0, 40)}"`),
        ),
      );
      expect(clipped, 'every price and label shows its whole text').toEqual([]);
      await expect(cards(page).nth(3)).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`plancard-${theme}-${width}.png`), clip: (await grid.boundingBox())! });
    });
