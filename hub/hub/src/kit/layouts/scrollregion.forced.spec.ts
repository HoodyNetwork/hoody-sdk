// Playwright: ScrollRegion's keyboard focus stays visible in forced-colors mode (Windows high contrast), on the kit's own
// CSS with its source class names. The ring is a box-shadow, which forced colors drops; the transparent outline under it
// is then drawn in the system colour.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Run from the API tree or from hub (Playwright's cwd), as the other kit specs that read sources.
const KIT = [resolve('hub/src/kit'), resolve('src/kit')].find((d) => existsSync(join(d, 'tokens.css'))) ?? resolve('hub/src/kit');
const CSS = ['tokens.css', 'layouts/ScrollRegion.module.css'].map((f) => readFileSync(join(KIT, f), 'utf8')).join('\n');

async function focusRegion(page: Page, classes: string) {
  await page.setContent(
    `<!doctype html><html><head><style>${CSS}</style></head><body><button>Before</button><div id="r" class="${classes}" role="region" tabindex="0" aria-label="Plans"><p>row</p></div></body></html>`,
  );
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('#r')).toBeFocused();
  return page.locator('#r').evaluate((el) => {
    const c = getComputedStyle(el);
    return { style: c.outlineStyle, width: c.outlineWidth, color: c.outlineColor, shadow: c.boxShadow };
  });
}

for (const classes of ['region block', 'region inline framed']) {
  test(`forced colors: the focused region (${classes}) keeps a visible outline`, async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    const f = await focusRegion(page, classes);
    expect(f.style).toBe('solid');
    expect(f.width).toBe('2px');
    expect(f.color).not.toMatch(/rgba\(\d+, \d+, \d+, 0\)|transparent/);
  });

  test(`normal colours: the focused region (${classes}) shows the ring and an invisible outline`, async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'none' });
    const f = await focusRegion(page, classes);
    expect(f.shadow).not.toBe('none');
    expect(f.color).toMatch(/rgba\(\d+, \d+, \d+, 0\)|transparent/);
  });
}
