// Card tones in a real browser. A Widget with tone="warn" (the gallery dashboard's Alerts card): --card-edge resolves to the
// warn fill, the corner edge draws its frame line in it, and the card is tinted with the warn tint, in both themes at 1440 and
// 390. Home's setup card (the stalled one takes this tone) is shot at the same sizes, to compare the shots across it.
import { type Page, expect, test } from '@playwright/test';
import { hubUrl } from '@app/e2e';

async function open(page: Page, path: string, theme: 'light' | 'dark', width: number, extra = '') {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.goto(hubUrl(path, { theme }).replace('/?', `/?${extra}`));
  await page.locator('#hub-main').waitFor();
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`${theme} ${width}: a warn Widget is framed and tinted in warn`, async ({ page }, info) => {
      await open(page, '/_kit?layout=dashboard', theme, width);
      const card = page.locator('section', { has: page.getByRole('heading', { name: 'Alerts' }) }).last();
      await expect(card).toBeVisible();
      const v = await card.evaluate((el) => {
        const probe = document.createElement('div');
        probe.style.cssText = 'color: var(--hx-warn-fill); background: var(--hx-warn-t); position: absolute;';
        el.parentElement!.append(probe);
        const p = getComputedStyle(probe);
        const want = { fill: p.color, tint: p.backgroundColor };
        probe.remove();
        // --card-edge read through a colour inside the card: the raw custom property is the unresolved token text.
        const inner = document.createElement('div');
        inner.style.cssText = 'color: var(--card-edge); position: absolute;';
        el.append(inner);
        const cardEdge = getComputedStyle(inner).color;
        inner.remove();
        const cs = getComputedStyle(el);
        const edge = el.querySelector(':scope > svg[data-card-edge]');
        // The frame line itself (the classed path is a focusable row's ring): drawn, and stroked in the edge colour.
        const line = edge?.querySelector<SVGPathElement>(':scope > path:not([class])');
        const ls = line ? getComputedStyle(line) : null;
        const box = line?.getBBox();
        return {
          want,
          cardEdge,
          background: cs.backgroundColor,
          edge: edge ? getComputedStyle(edge).color : null,
          line: ls && box ? { stroke: ls.stroke, display: ls.display, visibility: ls.visibility, w: box.width, h: box.height } : null,
        };
      });
      await info.attach('values', { body: JSON.stringify(v, null, 1), contentType: 'application/json' });
      expect(v.cardEdge, '--card-edge resolves to the warn fill').toBe(v.want.fill);
      expect(v.edge, 'the corner edge draws the warn fill').toBe(v.want.fill);
      expect(v.line, 'the corner edge draws its frame line').not.toBeNull();
      expect(v.line!.stroke, 'the frame line is stroked in the warn fill').toBe(v.want.fill);
      expect(v.line!.display, 'the frame line is displayed').not.toBe('none');
      expect(v.line!.visibility, 'the frame line is visible').toBe('visible');
      expect(v.line!.w > 0 && v.line!.h > 0, 'the frame line has a size').toBe(true);
      expect(v.background, 'the card is tinted with the warn tint').toBe(v.want.tint);
      await card.screenshot({ animations: 'disabled', path: info.outputPath('card.png') });
    });

    test(`${theme} ${width}: home's setup card`, async ({ page }, info) => {
      await open(page, '/home', theme, width, 'fx=invite&fxrealm=all&');
      const card = page.locator('section', { has: page.locator('[data-setup]') }).last();
      await expect(card).toBeVisible();
      await card.screenshot({ animations: 'disabled', path: info.outputPath('card.png') });
      await page.screenshot({ animations: 'disabled', path: info.outputPath('page.png') });
    });
  }
}
