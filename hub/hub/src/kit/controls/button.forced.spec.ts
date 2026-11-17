// Playwright: forced colours drop every painted plate and every box-shadow, and a kit Button draws its focus as one (the
// kit ring) with the outline off. So each variant draws a Highlight outline there instead, focused by a key or by code
// (a page that moves focus to a button before any key), and the outline stays off with colours on.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

/** Every Button variant's focus cell in the gallery's control matrix (kit/controlSpec.ts), at default density. */
const CELLS = ['button', 'buttonGhost', 'buttonPrimary', 'buttonDanger', 'buttonDangerSolid', 'buttonRow', 'buttonBubble', 'iconButton'];
const cell = (page: Page, control: string) => page.locator(`[data-spec-density="default"] [data-cell="${control}.md.focus.focusShadow"] button`).first(); // reason: the cell's own specimen

const frames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const outline = (l: Locator) => l.evaluate((n) => { const c = getComputedStyle(n); return `${c.outlineStyle} ${c.outlineWidth}`; });

test.use({ viewport: { width: 1440, height: 900 } });

for (const theme of ['light', 'dark'] as const)
  test(`every Button variant draws a focus outline in forced colours, ${theme}`, async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await gotoHub(page, '/_kit?tab=controls', { theme });
    await cell(page, 'button').waitFor();
    await page.keyboard.press('Tab'); // React Aria's keyboard modality
    const got: Record<string, string> = {};
    const boxed: Record<string, boolean> = {};
    for (const c of CELLS) {
      const b = cell(page, c);
      await b.evaluate((n) => (n as HTMLElement).focus());
      await frames(page);
      await expect(b, `${c}: focused`).toBeFocused();
      await expect(b, `${c}: focus visible`).toHaveAttribute('data-focus-visible');
      got[c] = await outline(b);
      // The painted plate is gone here, so the button's own border must draw its box: a line, in a system colour.
      boxed[c] = await b.evaluate((n) => { const s = getComputedStyle(n); return s.borderTopStyle === 'solid' && parseFloat(s.borderTopWidth) >= 1 && !/^rgba\(.*, 0\)$/.test(s.borderTopColor); });
    }
    // All variants read at once, so a red names every one that draws no outline.
    expect(got, 'an outline on every variant in forced colours').toEqual(Object.fromEntries(CELLS.map((c) => [c, 'solid 2px'])));
    expect(boxed, 'every variant is still a box in forced colours').toEqual(Object.fromEntries(CELLS.map((c) => [c, true])));
  });

test('a Button focused by code before any key draws the outline in forced colours', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await gotoHub(page, '/_kit?tab=controls');
  const b = cell(page, 'button'); // the secondary Button: no variant rule of its own outlines it
  await b.waitFor();
  await b.evaluate((n) => (n as HTMLElement).focus());
  await frames(page);
  await expect(b).toBeFocused();
  await expect(b).toHaveAttribute('data-focus-visible');
  expect(await outline(b)).toBe('solid 2px');
});

test('with colours on a focused Button keeps the kit ring and no outline', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoHub(page, '/_kit?tab=controls');
  await cell(page, 'button').waitFor();
  await page.keyboard.press('Tab');
  for (const c of CELLS) {
    const b = cell(page, c);
    await b.evaluate((n) => (n as HTMLElement).focus());
    await frames(page);
    await expect(b, `${c}: focus visible`).toHaveAttribute('data-focus-visible');
    expect(await outline(b), `${c}: no outline beside the ring`).toMatch(/^none |^\S+ 0px$/);
    expect(await b.evaluate((n) => getComputedStyle(n).boxShadow), `${c}: the ring`).not.toBe('none');
  }
});

test('forced colours turned on after the page loaded outline the focused Button at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoHub(page, '/_kit?tab=controls');
  const b = cell(page, 'button');
  await b.waitFor();
  await page.keyboard.press('Tab');
  await b.evaluate((n) => (n as HTMLElement).focus());
  await frames(page);
  expect(await outline(b), 'colours on: no outline').toMatch(/^none |^\S+ 0px$/);
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await frames(page);
  await expect(b).toBeFocused();
  expect(await outline(b), 'forced colours on: the outline').toBe('solid 2px');
});

test('a focused IconButton that is a drop target keeps its inset outline in forced colours', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await gotoHub(page, '/_kit?tab=controls');
  const b = cell(page, 'iconButton');
  await b.waitFor();
  await page.keyboard.press('Tab');
  await b.evaluate((n) => (n as HTMLElement).focus());
  await frames(page);
  const outside = await b.evaluate((n) => getComputedStyle(n).outlineOffset);
  expect(parseFloat(outside), 'not a drop target: the outline sits outside').toBeGreaterThan(0);
  await b.evaluate((n) => n.setAttribute('data-drop-target', 'true')); // the attribute IconButton sets while a drag is over it
  await frames(page);
  expect(await outline(b)).toBe('solid 2px');
  const inset = await b.evaluate((n) => getComputedStyle(n).outlineOffset);
  expect(parseFloat(inset), 'a drop target: the inset outline wins').toBeLessThan(0);
});
