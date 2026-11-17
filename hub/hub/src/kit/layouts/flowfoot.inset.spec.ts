// Playwright, on the two flow wizards (New script, New realm) at 1440 and 390: the footer band is as wide as the
// step's card, and what it holds starts and ends where the card's content does, within 1 px. A button on the band's
// own edge reads as attached to the frame.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

declare const process: { env: Record<string, string | undefined> };
const shots = process.env.SHOT_DIR;
const tag = process.env.SHOT_TAG ?? 'shot';

for (const width of [1440, 390]) {
  for (const [name, path] of [['new script', '/scripts/new'], ['new realm', '/realms/new']] as const) {
    test(`${name} at ${width}: the footer's content lines up with the card's content`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, path);
      await page.locator('[class*="flowFooter"]').waitFor();
      await page.locator('[class*="wizardBody"] [class*="panelTitles"]').first().waitFor();
      const m = await page.evaluate(() => {
        const box = (e: Element) => {
          const r = e.getBoundingClientRect();
          return { left: r.left, right: r.right };
        };
        const foot = document.querySelector('[class*="flowFooter"]')!;
        const cs = getComputedStyle(foot);
        const buttons = Array.from(foot.querySelectorAll('button')).map(box);
        return {
          band: box(foot),
          padStart: parseFloat(cs.paddingLeft),
          padEnd: parseFloat(cs.paddingRight),
          first: box(foot.firstElementChild!),
          buttons,
          card: box(document.querySelector('[class*="wizardBody"] [class*="panel_"]')!),
          content: box(document.querySelector('[class*="wizardBody"] [class*="panelTitles"]')!),
        };
      });
      expect(Math.abs(m.band.left - m.card.left), 'band and card share a start edge').toBeLessThanOrEqual(1);
      expect(Math.abs(m.band.right - m.card.right), 'band and card share an end edge').toBeLessThanOrEqual(1);
      expect(m.content.left - m.card.left, 'the card pads its content').toBeGreaterThanOrEqual(12);
      expect(Math.abs(m.first.left - m.content.left), 'the footer starts where the card content starts').toBeLessThanOrEqual(1);
      expect(m.buttons.length, 'the footer holds its buttons').toBeGreaterThan(0);
      const last = m.buttons[m.buttons.length - 1]!;
      expect(Math.abs(last.right - m.content.right), 'the last button ends where the card content ends').toBeLessThanOrEqual(1);
      for (const b of m.buttons) expect(b.left, 'no button before the card content').toBeGreaterThanOrEqual(m.content.left - 1);
      expect(Math.abs(m.padStart - m.padEnd), 'equal padding on both sides').toBeLessThanOrEqual(0.5);
      if (shots) await page.screenshot({ path: `${shots}/${tag}-flowfoot-${name.replace(' ', '-')}-${width}.png` });
    });
  }
}
