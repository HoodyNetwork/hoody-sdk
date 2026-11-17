// Home's "Your computer" programs are one launch strip. Wide: five joined cells in one row, a grey head
// (no white) over a darker actions band, a new-tab mark, the accent edge on hover and on keyboard focus. Narrow: one
// row per program with its actions on the right. The actions keep their names; their icons keep 3:1 on the band.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';

const PROGRAMS = ['Agent', 'Terminal', 'Desktop', 'Files', 'Browser'];

// The pages the dev server serves (scripts/check.ts passes the same HUB_PAGE to Vite and to Playwright): a home-only
// server has no Computers page, so Home has no "Your computer" card. Unset means the whole Hub.
const HOME_ONLY = process.env.HUB_PAGE === 'home';
test.skip(HOME_ONLY, 'a home-only server draws no Your computer card');

async function strip(page: Page): Promise<Locator> {
  const card = page.locator('section, article').filter({ has: page.getByRole('heading', { name: 'Your computer', exact: true }) }).last();
  await expect(card.getByRole('button', { name: 'Terminal', exact: true })).toBeVisible({ timeout: 20_000 });
  return card;
}

// Relative luminance contrast of two computed rgb() colours (alpha ignored: both are opaque here).
function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const [r = 0, g = 0, bl = 0] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
      const s = Number(v) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x = 0, y = 0] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const bg = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
const shadow = (l: Locator) => l.evaluate((el) => getComputedStyle(el).boxShadow);
const tint = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundImage);
const ACTIONS = (n: string) => [`Copy ${n}`, 'QR code', `Put ${n} on Board`];

// A kit colour token as the browser computes it (rgb()), read on the themed page.
const token = (page: Page, name: string) =>
  page.evaluate((v) => {
    const el = document.createElement('i');
    el.style.color = `var(${v})`;
    document.body.append(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  }, name);

for (const theme of ['light', 'dark'] as const) {
  test(`launch strip at 1350, ${theme}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, '/home', { theme });
    const card = await strip(page);
    const tiles = PROGRAMS.map((n) => card.getByRole('button', { name: n, exact: true }));
    const [agent, terminal] = [card.getByRole('button', { name: 'Agent', exact: true }), card.getByRole('button', { name: 'Terminal', exact: true })];
    // One row: every tile starts at the same y, and none is white.
    const ys = await Promise.all(tiles.map(async (t) => Math.round((await t.boundingBox())!.y)));
    expect(new Set(ys).size).toBe(1);
    const cell = terminal.locator('xpath=..');
    const band = card.getByRole('group', { name: /Terminal/ });
    const [cellBg, bandBg] = [await bg(cell), await bg(band)];
    expect(cellBg).not.toBe('rgb(255, 255, 255)');
    expect(bandBg).not.toBe(cellBg);
    expect(contrast(cellBg, bandBg)).toBeGreaterThan(1.05);
    // The new-tab mark: a second, decorative icon in every tile.
    for (const t of tiles) await expect(t.locator('svg[aria-hidden="true"]')).toHaveCount(2);
    // The three actions keep their names and tooltips, and their icons keep 3:1 on the band.
    const icon = band.getByRole('button', { name: 'Copy Terminal', exact: true });
    expect(contrast(await icon.evaluate((el) => getComputedStyle(el).color), bandBg)).toBeGreaterThanOrEqual(3);
    // At rest neither surface is tinted; hovering any action tints the head and the band together.
    expect([await tint(terminal), await tint(band)]).toEqual(['none', 'none']);
    for (const name of ACTIONS('Terminal')) {
      const b = band.getByRole('button', { name, exact: true });
      await expect(b).toBeVisible();
      // A pointer that moves onto the action (React Aria opens a tooltip on a real move, not on a jump).
      const at = (await b.boundingBox())!;
      await page.mouse.move(5, 5);
      await b.hover();
      await page.mouse.move(at.x + at.width / 2 + 2, at.y + at.height / 2 + 2, { steps: 3 });
      await expect(page.getByRole('tooltip')).toHaveText(name);
      await expect.poll(() => tint(terminal), `${name}: the head tints`).toContain('linear-gradient');
      await expect.poll(() => tint(band), `${name}: the band tints`).toContain('linear-gradient');
      await page.mouse.move(0, 0);
      await expect(page.getByRole('tooltip')).toHaveCount(0);
    }
    const acc = await token(page, '--hx-acc'), ink = await token(page, '--hx-ink');
    // Accent edge: none at rest, the accent colour 3 px deep along the top on hover.
    expect(await shadow(terminal)).toBe('none');
    await terminal.hover();
    await expect.poll(() => shadow(terminal)).toBe(`${acc} 0px 3px 0px 0px inset`);
    await page.mouse.move(0, 0);
    await expect.poll(() => shadow(terminal)).toBe('none');
    // Keyboard: Tab from the Agent tile through its actions to the Terminal tile, which shows the edge and its own
    // ink focus outline (the edge alone is not the focus indicator).
    await agent.focus();
    for (let i = 0; i < 6 && !(await terminal.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(terminal).toBeFocused();
    await expect.poll(() => shadow(terminal)).toBe(`${acc} 0px 3px 0px 0px inset`);
    const ring = await terminal.evaluate((el) => { const c = getComputedStyle(el); return [c.outlineStyle, c.outlineColor, parseFloat(c.outlineWidth)] as const; });
    expect(ring[0]).toBe('solid');
    expect(ring[1]).toBe(ink);
    expect(ring[2]).toBeGreaterThanOrEqual(1);
    // Tab on to each action: the tile keeps the edge, both surfaces keep the tint, and the action has its own ring.
    for (const name of ACTIONS('Terminal')) {
      await page.keyboard.press('Tab');
      const b = band.getByRole('button', { name, exact: true });
      await expect(b).toBeFocused();
      await expect.poll(() => shadow(b), `${name}: its own focus ring`).toMatch(/0px 0px 0px 4px/);
      expect(await shadow(terminal)).toBe(`${acc} 0px 3px 0px 0px inset`);
      expect([await tint(terminal), await tint(band)].every((v) => v.includes('linear-gradient'))).toBe(true);
    }
  });
}

async function rowsAt(page: Page, width: number, touch: boolean) {
    await page.setViewportSize({ width, height: 844 });
    await gotoHub(page, '/home');
    const card = await strip(page);
    const boxes = await Promise.all(PROGRAMS.map(async (n) => (await card.getByRole('button', { name: n, exact: true }).boundingBox())!));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.y).toBeGreaterThan(boxes[i - 1]!.y + boxes[i - 1]!.height - 1);
    const tile = boxes[1]!;
    const band = (await card.getByRole('group', { name: /Terminal/ }).boundingBox())!;
    expect(band.x).toBeGreaterThanOrEqual(tile.x + tile.width - 1);
    expect(Math.abs(band.y + band.height / 2 - (tile.y + tile.height / 2))).toBeLessThanOrEqual(1);
    // One column of bands: every row's actions start at the same x, and every new-tab mark ends its name column.
    const bandXs = await Promise.all(PROGRAMS.map(async (n) => Math.round((await card.getByRole('group', { name: new RegExp(`^${n}`) }).boundingBox())!.x)));
    expect(new Set(bandXs).size).toBe(1);
    // The band is its buttons and an even padding (not the old card's head inset), so every name keeps clear of its mark.
    const buttons = await card.getByRole('group', { name: /Terminal/ }).getByRole('button').all();
    const first = (await buttons[0]!.boundingBox())!, last = (await buttons[buttons.length - 1]!.boundingBox())!;
    expect(Math.abs(first.x - band.x - (band.x + band.width - last.x - last.width))).toBeLessThanOrEqual(1);
    for (const n of PROGRAMS) {
      const t = card.getByRole('button', { name: n, exact: true });
      // The name's own glyphs (a range), not its box, which could be narrower than text that overflows it.
      const nameEnd = await t.locator('strong').evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().right; });
      const tileBox = (await t.boundingBox())!;
      expect(nameEnd, `${n}: the name fits its tile`).toBeLessThanOrEqual(tileBox.x + tileBox.width);
      // The mark shows at 390 and clears the name; a 320 px screen has no room for it.
      const mark = t.locator('svg').nth(1);
      if (width === 390) await expect(mark).toBeVisible();
      if (await mark.isVisible()) expect((await mark.boundingBox())!.x, `${n}: the mark clears its name`).toBeGreaterThanOrEqual(nameEnd + 4);
    }
    await noSideScroll(page);
    // Every action keeps its full target (44 px on touch) inside its band.
    for (const b of buttons) {
      const box = (await b.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(touch ? 44 : 32);
      expect(box.x).toBeGreaterThanOrEqual(band.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(band.x + band.width + 0.5);
    }
}

for (const width of [390, 320]) {
  test(`launch strip at ${width}: one row per program, actions on the right`, async ({ page }) => {
    await rowsAt(page, width, false);
  });
}

// Between phone and wide the strip is either one row of five or five rows, never a row of four with one left over
// (the old auto-fit grid wrapped Browser alone once the card was under five 168 px tiles).
test('launch strip never leaves a tile alone on a row', async ({ page }) => {
  const widths: number[] = [];
  for (const width of [1200, 1100, 1000, 900, 800, 700]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/home');
    const card = await strip(page);
    const ys = await Promise.all(PROGRAMS.map(async (n) => Math.round((await card.getByRole('button', { name: n, exact: true }).boundingBox())!.y)));
    expect([1, 5], `rows at ${width}`).toContain(new Set(ys).size);
    widths.push(Math.round((await card.locator('[class*="tiles"]').boundingBox())!.width));
  }
  // The run covers a strip between five 128 px cells and five 168 px tiles, where the old grid wrapped.
  expect(widths.some((w) => w >= 640 && w < 840), `strip widths ${widths.join(', ')}`).toBe(true);
});

// From wide to narrow, with a mouse or on touch: every name inside its tile, every band clear of its tile and inside
// its cell, every action whole (32 px with a mouse, 44 px on touch) inside its band.
async function sweep(page: Page, touch: boolean) {
  const widths: number[] = [];
  for (const width of [1350, 1200, 1100, 1000, 950, 900, 850, 820, 800, 780, 700]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/home');
    const card = await strip(page);
    widths.push(Math.round((await card.locator('[class*="tiles"]').boundingBox())!.width));
    for (const n of PROGRAMS) {
      const t = card.getByRole('button', { name: n, exact: true });
      const tile = (await t.boundingBox())!;
      const cell = (await t.locator('xpath=..').boundingBox())!;
      const nameEnd = await t.locator('strong').evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().right; });
      expect(nameEnd, `${n} at ${width}: the name fits its tile`).toBeLessThanOrEqual(tile.x + tile.width);
      const band = card.getByRole('group', { name: new RegExp(`^${n}`) });
      const bandBox = (await band.boundingBox())!;
      // The band sits beside (rows) or under (columns) its tile, never over it, and inside its own cell.
      expect(bandBox.x >= tile.x + tile.width - 1 || bandBox.y >= tile.y + tile.height - 1, `${n} at ${width}: band clear of the tile`).toBe(true);
      expect(bandBox.x + bandBox.width, `${n} at ${width}: band inside its cell`).toBeLessThanOrEqual(cell.x + cell.width + 0.5);
      for (const b of await band.getByRole('button').all()) {
        const box = (await b.boundingBox())!;
        expect(box.width, `${n} at ${width}: a whole action`).toBeGreaterThanOrEqual(touch ? 44 : 32);
        expect(box.x, `${n} at ${width}: the action inside its band`).toBeGreaterThanOrEqual(bandBox.x - 0.5);
        expect(box.x + box.width, `${n} at ${width}: the action inside its band`).toBeLessThanOrEqual(bandBox.x + bandBox.width + 0.5);
      }
    }
  }
  // Both sides of each breakpoint: rows under 768 px, mouse columns from 768 to 840 px, columns from 840 px.
  for (const [lo, hi] of [[640, 768], [768, 840], [840, Infinity]] as const) {
    expect(widths.some((w) => w >= lo && w < hi), `a strip from ${lo} px in ${widths.join(', ')}`).toBe(true);
  }
}

test('launch strip with a mouse from 1350 to 700: names and actions fit', async ({ page }) => {
  test.setTimeout(180_000);
  await sweep(page, false);
});

// Touch: the actions grow to 44 px, so the band is wider. Every layout keeps each name inside its tile, clear of the
// band, and every action whole: phone rows (390, 320), rows under 840 px, and five columns above.
test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  for (const width of [390, 320]) {
    test(`launch strip at ${width} on touch: names and 44 px actions fit`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      await rowsAt(page, width, true);
    });
  }

  test('launch strip on touch from 1350 to 700: names and 44 px actions fit', async ({ page }) => {
    test.setTimeout(180_000);
    await sweep(page, true);
  });
});
