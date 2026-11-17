// Playwright: NodeLink in the kit gallery's Pieces tab, drawn for real, in both themes, at
// phone and desktop width. Every label stays whole inside the box by its real rendered box, the labels stay a readable
// size at 390 px, the page does not scroll sideways, the over-limit line shows, a press target is at least 44 px and the
// keyboard route draws a focus mark.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';

const part = (page: Page) => page.locator('[data-gallery="node-link"] [data-kit="node-link"]');

for (const theme of ['light', 'dark'] as const)
  for (const width of [390, 1350])
    test(`@nodelink ${theme} at ${width}: labels inside the box, the over-limit line, the keyboard route`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await gotoHub(page, '/_kit?tab=pieces', { theme });
      const draw = part(page).first();
      await draw.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const texts = await draw.evaluate((el) => {
        const svg = el.querySelector('svg')!.getBoundingClientRect();
        return [...el.querySelectorAll('svg text')].map((t) => {
          const r = t.getBoundingClientRect();
          return { text: t.textContent, left: r.left - svg.left, right: r.right - svg.left, top: r.top - svg.top, bottom: r.bottom - svg.top, size: parseFloat(getComputedStyle(t).fontSize), W: svg.width, H: svg.height };
        });
      });
      expect(texts.length).toBeGreaterThan(3);
      for (const t of texts) {
        expect(t.left, `${t.text} left`).toBeGreaterThanOrEqual(0);
        expect(t.right, `${t.text} right`).toBeLessThanOrEqual(t.W);
        expect(t.top, `${t.text} top`).toBeGreaterThanOrEqual(0);
        expect(t.bottom, `${t.text} bottom`).toBeLessThanOrEqual(t.H);
        expect(t.size, `${t.text} size`).toBeGreaterThanOrEqual(11);
      }
      // The Hub scrolls in #hub-main: the page does not scroll sideways there.
      await noSideScroll(page);
      const overlaps = await draw.evaluate((el) => {
        const r = [...el.querySelectorAll('svg text')].map((t) => t.getBoundingClientRect());
        let n = 0;
        for (let i = 0; i < r.length; i++)
          for (let j = i + 1; j < r.length; j++) {
            const a = r[i]!;
            const b = r[j]!;
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) n++;
          }
        return n;
      });
      expect(overlaps, 'no two labels touch').toBe(0);
      await expect(draw.locator('[data-part="more"]')).toBeVisible();
      await expect(draw.locator('[data-part="more"]')).toContainText('more links in the table');
      const hit = await draw.locator('[data-part="neighbour"]').first().locator('circle').first().boundingBox();
      expect(Math.min(hit!.width, hit!.height), 'press target').toBeGreaterThanOrEqual(44);
      const center = draw.locator('[data-part="center"]');
      await center.focus();
      await page.keyboard.press('ArrowRight');
      const on = draw.locator('[data-part="neighbour"]').first();
      await expect(on).toBeFocused();
      const name = await on.getAttribute('aria-label');
      await expect(draw.locator('[data-part="about"]')).toContainText(name!.split(', ').slice(1).join(', '));
      await expect(on.locator('circle').nth(1)).toHaveCSS('stroke', /rgb\(/);
      const stroke = (c: Element) => getComputedStyle(c).stroke;
      const ring = await on.locator('circle').nth(1).evaluate(stroke);
      const rest = await draw.locator('[data-part="neighbour"]').nth(1).locator('circle').nth(1).evaluate(stroke);
      expect(ring, 'the focus mark differs from an unfocused target').not.toBe(rest);
      // The mark stays clear of the node's own label, the top neighbour's and the centre's alike.
      for (const node of [on, draw.locator('[data-part="center"]')]) {
        const clear = await node.evaluate((g) => {
          const c = g.querySelectorAll('circle')[1]!.getBoundingClientRect();
          const t = g.querySelector('text')!.getBoundingClientRect();
          const box = { left: c.left - 1, right: c.right + 1, top: c.top - 1, bottom: c.bottom + 1 };
          return t.right <= box.left || t.left >= box.right || t.bottom <= box.top || t.top >= box.bottom;
        });
        expect(clear, 'the focus mark is clear of the label').toBe(true);
      }
      await draw.screenshot({ path: test.info().outputPath(`nodelink-${theme}-${width}.png`) });
      await page.keyboard.press('Enter');
      await expect(draw.locator('[data-part="center"]')).toBeFocused();
      await expect(draw.locator('[data-part="center"]')).toHaveAttribute('aria-label', new RegExp(`^${name!.split(',')[0]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    });

test('@nodelink forced colours: the lines, the labels and the focus mark use system colours', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.setViewportSize({ width: 1350, height: 1000 });
  await gotoHub(page, '/_kit?tab=pieces');
  const draw = part(page).first();
  await draw.scrollIntoViewIfNeeded();
  const got = await draw.evaluate((el) => {
    const probe = document.body.appendChild(document.createElement('i'));
    probe.style.color = 'CanvasText';
    const ink = getComputedStyle(probe).color;
    probe.remove();
    return { ink, label: getComputedStyle(el.querySelector('svg text')!).fill, line: getComputedStyle(el.querySelector('svg line')!).stroke };
  });
  expect(got.label).toBe(got.ink);
  expect(got.line).toBe(got.ink);
  await draw.locator('[data-part="center"]').focus();
  await page.keyboard.press('ArrowRight');
  const on = draw.locator('[data-part="neighbour"]').first();
  await expect(on).toBeFocused();
  const ring = await on.locator('circle').nth(1).evaluate((c) => getComputedStyle(c).stroke);
  const rest = await draw.locator('[data-part="neighbour"]').nth(1).locator('circle').nth(1).evaluate((c) => getComputedStyle(c).stroke);
  expect(ring, 'the focus mark in forced colours').not.toBe(rest);
});
