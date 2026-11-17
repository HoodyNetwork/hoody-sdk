// Guide Connect's ways to connect and their panel are one framed block,
// and every kit step code line is a 34 px box with its copy button attached as a 36 px cell. Measured through the real
// page and the kit gallery in both themes; text and code colours keep 4.5:1 on their new fills.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';
import kit2 from '@kit/gallery/kit2.strings.en.json';

type Rgb = [number, number, number, number];
function rgb(c: string): Rgb {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`not a colour: ${c}`);
  const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
  return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
}
function lum([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}
const style = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

async function connect(page: Page, theme: 'light' | 'dark') {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/guide#connect', { theme });
  const rail = page.getByRole('group', { name: strings['connect.pickDoor'] });
  await expect(rail).toBeVisible();
  return { rail, plate: rail.locator('xpath=..'), panel: rail.locator('xpath=..').getByRole('region').first() }; // reason: the plate's own panel region comes before any region inside it
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`ways to connect (${theme})`, () => {
    test('the rail and its panel are one framed plate, the current way opens into the panel', async ({ page }) => {
      const { rail, plate, panel } = await connect(page, theme);
      const doors = rail.getByRole('button');
      const current = rail.locator('[aria-pressed="true"]');
      const other = rail.locator('[aria-pressed="false"]').first();
      expect(await style(plate, 'border-top-width')).toBe('1px');
      expect(await style(plate, 'border-top-style')).toBe('solid');
      expect(await style(rail, 'border-right-width')).toBe('1px');
      // the rail is 176 px from the frame's inner edge, with no gap before the panel
      const pb = (await plate.boundingBox())!;
      const rb = (await rail.boundingBox())!;
      const qb = (await panel.boundingBox())!;
      expect(Math.round(rb.x - pb.x)).toBe(1);
      expect(Math.round(rb.width)).toBe(176);
      expect(Math.round(qb.x - (rb.x + rb.width))).toBe(0);
      // 42 px rows split by a 1 px line, square
      expect(Math.round((await doors.first().boundingBox())!.height)).toBe(42);
      expect(await style(other, 'border-bottom-width')).toBe('1px');
      expect(await style(other, 'border-top-left-radius')).toBe('0px');
      // the current way takes the panel colour and covers the rail's line
      // the panel shows the plate's fill (it paints none of its own)
      const panelBg = await style(plate, 'background-color');
      expect(['rgba(0, 0, 0, 0)', panelBg]).toContain(await style(panel, 'background-color'));
      expect(await style(current, 'background-color')).toBe(panelBg);
      expect(await style(rail, 'background-color')).not.toBe(panelBg);
      const cb = (await current.boundingBox())!;
      expect(Math.round(cb.x + cb.width)).toBe(Math.round(rb.x + rb.width));
      expect(await style(current, 'box-shadow')).toMatch(/inset 4px 0px 0px 0px|4px 0px 0px 0px inset/);
      // text keeps 4.5:1 on its fill
      const railBg = rgb(await style(rail, 'background-color'));
      expect(contrast(rgb(await style(other, 'color')), railBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(rgb(await style(current, 'color')), rgb(panelBg))).toBeGreaterThanOrEqual(4.5);
      if (theme === 'light') {
        expect(await style(plate, 'border-top-color')).toBe('rgb(156, 156, 156)');
        expect(railBg.slice(0, 3)).toEqual([228, 228, 228]);
        expect(panelBg).toBe('rgb(248, 248, 248)');
        expect(await style(other, 'border-bottom-color')).toBe('rgb(207, 207, 207)');
        expect(await style(other, 'color')).toBe('rgb(92, 92, 92)');
        expect(await style(current, 'color')).toBe('rgb(16, 16, 16)');
        expect(await style(current, 'box-shadow')).toContain('rgb(238, 255, 34)');
        expect(await style(panel, 'padding')).toBe('14px 16px 18px');
      }
    });

    test('the current way keeps its panel fill under hover and press, and its 4 px bar beside the focus ring', async ({ page }) => {
      const { rail, plate } = await connect(page, theme);
      const current = rail.locator('[aria-pressed="true"]');
      const panelBg = await style(plate, 'background-color');
      await current.hover();
      await expect(current).toHaveAttribute('data-hovered');
      expect(await style(current, 'background-color'), 'hovered: the panel fill stays under the tint').toBe(panelBg);
      expect(await style(current, 'background-image'), 'hovered: the hover tint is laid over it').toContain('linear-gradient');
      await page.mouse.down();
      await expect(current).toHaveAttribute('data-pressed');
      expect(await style(current, 'background-color'), 'pressed: the panel fill stays under the tint').toBe(panelBg);
      expect(await style(current, 'background-image'), 'pressed: the press tint is laid over it').toContain('linear-gradient');
      await page.mouse.up();
      await page.mouse.move(0, 0);
      // reach the current way by Tab (keyboard focus shows the ring; a scripted focus() does not)
      await current.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(current).toBeFocused();
      await expect(current).toHaveAttribute('data-focus-visible');
      const shadow = await style(current, 'box-shadow');
      expect(shadow, 'focused: the 4 px bar stays').toMatch(/inset 4px 0px 0px 0px|4px 0px 0px 0px inset/);
      expect(shadow, 'focused: the focus ring shows beside it').toMatch(/0px 0px 0px 4px(?! inset)/);
    });

    test('a refused copy cell keeps its fill on hover', async ({ page }) => {
      await page.setViewportSize({ width: 1350, height: 900 });
      await gotoHub(page, '/_kit?tab=text', { theme });
      const fig = page.getByRole('figure', { name: kit2['code.title'] }).nth(1); // reason: the second specimen is the one with a placeholder step
      await fig.scrollIntoViewIfNeeded();
      const copy = fig.locator('ol > li').nth(1).locator('div:has(> code) > button').first(); // reason: the one copy cell of the placeholder line
      const rest = await style(copy, 'background-color');
      await copy.hover();
      await expect(copy).toHaveAttribute('data-hovered');
      expect(await style(copy, 'background-color'), 'hovered: the refused cell keeps its fill').toBe(rest);
      expect(rest).not.toBe('rgba(0, 0, 0, 0)');
    });

    test('a Guide code line is a 34 px box with its copy cell attached', async ({ page }) => {
      const { panel } = await connect(page, theme);
      await codeLineLook(panel, theme);
    });

    test('a step code line outside the Guide (kit gallery) has the same box', async ({ page }) => {
      await page.setViewportSize({ width: 1350, height: 900 });
      await gotoHub(page, '/_kit?tab=text', { theme });
      const fig = page.getByRole('figure', { name: kit2['code.title'] }).first(); // reason: the gallery shows the code block specimen more than once
      await fig.scrollIntoViewIfNeeded();
      await codeLineLook(fig, theme);
    });
  });
}

async function codeLineLook(scope: Locator, theme: 'light' | 'dark') {
  const line = scope.locator('ol > li').first().locator('div:has(> code)').first();
  const code = line.locator('> code');
  const copy = line.locator('> button').first();
  await expect(line).toBeVisible();
  expect(Math.round((await line.boundingBox())!.height)).toBe(34);
  expect(await style(line, 'border-top-width')).toBe('1px');
  expect(await style(code, 'padding-left')).toBe('12px');
  expect(await style(code, 'padding-right')).toBe('12px');
  // the copy cell: 36 px wide, full inner height, a line on its left, at the right end, always shown
  const lb = (await line.boundingBox())!;
  const cb = (await copy.boundingBox())!;
  expect(Math.round(cb.width)).toBe(36);
  expect(Math.round(cb.height)).toBe(32);
  expect(Math.round(cb.x + cb.width)).toBe(Math.round(lb.x + lb.width - 1));
  expect(await style(copy, 'border-left-width')).toBe('1px');
  expect(await style(copy, 'border-top-left-radius')).toBe('0px');
  expect(await style(copy, 'opacity')).toBe('1');
  // code text keeps 4.5:1 on the line's fill, every coloured run included
  const bg = rgb(await style(line, 'background-color'));
  const colours = await code.evaluate((el) => [el, ...el.querySelectorAll('*')].map((n) => getComputedStyle(n).color));
  for (const c of colours) expect(contrast(rgb(c), bg), c).toBeGreaterThanOrEqual(4.5);
  if (theme === 'light') {
    expect(await style(line, 'background-color')).toBe('rgb(255, 255, 255)');
    expect(await style(line, 'border-top-color')).toBe('rgb(156, 156, 156)');
    expect(await style(copy, 'border-left-color')).toBe('rgb(156, 156, 156)');
    expect(await style(copy, 'background-color')).toBe('rgb(232, 232, 232)');
  }
}

test.describe('ways to connect, coarse pointer', () => {
  test.use({ viewport: { width: 1024, height: 900 }, hasTouch: true, isMobile: true });
  test('a coarse pointer keeps the copy cell at --touch-min', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=text');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const fig = page.getByRole('figure', { name: kit2['code.title'] }).first(); // reason: the first of the gallery's code block specimens
    await fig.scrollIntoViewIfNeeded();
    const copy = fig.locator('ol > li').first().locator('div:has(> code) > button').first();
    const b = (await copy.boundingBox())!;
    expect(Math.round(b.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(b.height)).toBeGreaterThanOrEqual(44);
  });
});
