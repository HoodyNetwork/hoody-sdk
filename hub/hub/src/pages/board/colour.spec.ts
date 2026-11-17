// Playwright: the tile stripe and mark as drawn, on the program view's standalone
// tile (fixture state colours: atlas is #3B82F6, granite white). The stripe is 4 px of the computer's colour plus a
// 1 px ring line; under forced colours the stripe and mark keep the colour and the name beside them does not.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

async function head(page: Page, name: string) {
  const g = page.getByRole('group', { name: `terminal-1 · ${name}` });
  await expect(g).toBeVisible({ timeout: 60_000 });
  return g.evaluate((el) => {
    const stripe = el.querySelector<HTMLElement>('[class*="stripe"]');
    const mark = el.querySelector<HTMLElement>('[data-computer-color]');
    const label = mark?.nextElementSibling as HTMLElement | null;
    const s = stripe ? getComputedStyle(stripe) : null, m = mark ? getComputedStyle(mark) : null, l = label ? getComputedStyle(label) : null;
    return {
      stripeBg: s?.backgroundColor, stripeW: stripe?.getBoundingClientRect().width, stripeLine: s?.borderInlineEndWidth, stripeFca: s?.getPropertyValue('forced-color-adjust'),
      markBg: m?.backgroundColor, markShadow: m?.boxShadow, labelText: label?.textContent, labelColor: l?.color, labelFca: l?.getPropertyValue('forced-color-adjust'),
    };
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`the tile stripe and mark are the computer's colour with a ring (${theme}, ${width} px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, color] of [['atlas', '#3B82F6'], ['granite', '#FFFFFF']] as const) {
        const handle = name === 'atlas' ? 'atlas.00a1' : 'granite.0107';
        await gotoHub(page, `/board/open/${handle}/terminal-1`, { theme, state: 'colours' });
        const h = await head(page, name);
        expect(h.stripeBg).toBe(rgb(color));
        expect(h.stripeW).toBe(5);
        expect(h.stripeLine).toBe('1px');
        expect(h.markBg).toBe(rgb(color));
        expect(h.markShadow).toMatch(/inset/);
        expect(h.labelText).toBe(name);
      }
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`forced colours (${theme} OS palette)`, () => {
    test.use({ forcedColors: 'active', colorScheme: theme });
    test('stripe and mark keep the computer colour; the computer name takes the system text colour', async ({ page }) => {
      await gotoHub(page, '/board/open/atlas.00a1/terminal-1', { theme, state: 'colours' });
      const h = await head(page, 'atlas');
      expect(h.stripeFca).toBe('none');
      expect(h.stripeBg).toBe(rgb('#3B82F6'));
      expect(h.markBg).toBe(rgb('#3B82F6'));
      expect(h.labelFca).toBe('auto');
      const canvasText = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'CanvasText';
        document.body.append(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      });
      expect(h.labelColor).toBe(canvasText);
    });
  });
}

// All realms: the realm chip's square is drawn at its size inside the kit Button's label.
test('All realms: the realm chip draws its 10 px square before the realm name (1100 px)', async ({ page }, info) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await gotoHub(page, '/', { state: 'colours' });
  await page.locator('#hub-main button[data-realm]').first().click();
  await page.evaluate(() => { location.hash = '#/board/open/atlas.00a1/terminal-1'; });
  const g = page.getByRole('group', { name: /^terminal-1 · atlas, realm / });
  await expect(g).toBeVisible({ timeout: 60_000 });
  const sq = await g.evaluate((el) => {
    const s = el.querySelector<HTMLElement>('[class*="realmSquare"]');
    const r = s?.getBoundingClientRect();
    return r ? { w: r.width, h: r.height, bg: getComputedStyle(s!).backgroundColor } : null;
  });
  await page.screenshot({ path: info.outputPath('realm-chip-1100.png') });
  expect(sq).toMatchObject({ w: 10, h: 10 });
  expect(sq?.bg).not.toBe('rgba(0, 0, 0, 0)');
});
