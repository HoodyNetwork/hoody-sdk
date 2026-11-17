// Playwright: the computer colour mark as drawn, in the kit gallery (Pieces tab).
// The ring is present on every mark in both themes (white, near-black and surface-grey colours stay visible); under
// forced colours the mark keeps the computer's own colour (only the leaf is exempt) while the name beside it takes
// the system colours.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

async function drawn(page: Page, color: string) {
  const row = page.locator(`[data-gallery-mark="${color}"]`);
  await expect(row).toBeVisible();
  return row.evaluate((el) => {
    const marks = [...el.querySelectorAll<HTMLElement>('[data-computer-color]')].map((m) => {
      const cs = getComputedStyle(m);
      const r = m.getBoundingClientRect();
      return { bg: cs.backgroundColor, shadow: cs.boxShadow, radius: cs.borderTopLeftRadius, w: r.width, h: r.height, fca: cs.getPropertyValue('forced-color-adjust') };
    });
    const name = el.querySelector('span:not([data-computer-color])');
    const ncs = name ? getComputedStyle(name) : null;
    return { marks, nameColor: ncs?.color ?? '', nameFca: ncs?.getPropertyValue('forced-color-adjust') ?? '' };
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`marks are 3 px-rounded squares with a ring, in the computer's colour (${theme}, ${width} px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, '/_kit?tab=pieces', { theme });
      await expect(page.locator('html')).toHaveAttribute('data-hx-theme', theme);
      for (const color of ['#3B82F6', '#FFFFFF', '#111111', '#EDEAEA']) {
        const d = await drawn(page, color);
        expect(d.marks).toHaveLength(2);
        expect(d.marks.map((m) => [m.w, m.h])).toEqual([[10, 10], [12, 12]]);
        for (const m of d.marks) {
          expect(m.bg).toBe(rgb(color));
          expect(m.radius).toBe('3px');
          expect(m.shadow).toMatch(/inset/);
          expect(m.shadow).not.toBe('none');
        }
      }
      // A value that is not a hex colour draws no mark; its name still shows.
      const bad = await drawn(page, 'red;x:url()');
      expect(bad.marks).toHaveLength(0);
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`forced colours (${theme} OS palette)`, () => {
    test.use({ forcedColors: 'active', colorScheme: theme });
    test(`the mark keeps the computer colour and a system-colour ring; the name uses system colours`, async ({ page }) => {
      await gotoHub(page, '/_kit?tab=pieces', { theme });
      const d = await drawn(page, '#3B82F6');
      expect(d.marks).toHaveLength(2);
      for (const m of d.marks) {
        expect(m.fca).toBe('none');
        expect(m.bg).toBe(rgb('#3B82F6'));
        expect(m.shadow).toMatch(/inset/);
      }
      // The text beside it is not exempt: forced colours repaint it with the system text colour.
      expect(d.nameFca).toBe('auto');
      const canvasText = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'CanvasText';
        document.body.append(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      });
      expect(d.nameColor).toBe(canvasText);
    });
  });
}
