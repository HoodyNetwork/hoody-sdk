// Playwright: an empty Board's welcome is the kit's empty card, centred in the Board:
// at most 560 px, 48 px top and bottom, 32 px sides, the slanted corner drawn by the card edge, both themes at phone and
// desktop width, no sideways scroll. Add a program still opens the picker from the card; Open a terminal sits under it
// and puts a terminal of the current computer on the Board.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

const card = (page: Page) => page.locator('#hub-main [data-empty-place]');

for (const theme of ['light', 'dark'] as const)
  for (const width of [390, 1350])
    test(`@boardwelcome ${theme} at ${width}: one centred card of at most 560 px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, '/board', { state: 'empty', theme });
      await expect(card(page)).toBeVisible();
      await expect(card(page).getByText(strings['empty.first'])).toBeVisible();
      const g = await card(page).evaluate((el) => {
        const b = el.getBoundingClientRect();
        const p = el.parentElement!.getBoundingClientRect();
        const c = getComputedStyle(el);
        return {
          place: el.getAttribute('data-empty-place'),
          cut: el.hasAttribute('data-card-cut'),
          edge: el.querySelector(':scope > svg[data-card-edge] path') !== null,
          width: b.width,
          centre: b.left + b.width / 2,
          parentCentre: p.left + p.width / 2,
          padTop: parseFloat(c.paddingTop),
          padBottom: parseFloat(c.paddingBottom),
          padLeft: parseFloat(c.paddingLeft),
        };
      });
      expect(g.place).toBe('center');
      expect(g.cut && g.edge, 'the slanted corner, drawn by the card edge').toBe(true);
      expect(g.width).toBeLessThanOrEqual(560);
      expect(Math.abs(g.centre - g.parentCentre), 'centred in the Board').toBeLessThanOrEqual(1);
      expect(g.padTop).toBe(48);
      expect(g.padBottom).toBe(48);
      expect(g.padLeft).toBe(32);
      await noSideScroll(page);
      await page.screenshot({ path: test.info().outputPath(`boardwelcome-${theme}-${width}.png`) });
    });

test('@boardwelcome Add a program in the card opens the picker', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/board', { state: 'empty' });
  await card(page).getByRole('button', { name: new RegExp(strings['empty.add'], 'i') }).click();
  await expect(page.getByRole('dialog', { name: strings['picker.title'] })).toBeVisible();
});

// The default world: atlas is the current computer, running; a first visit has an empty Board.
for (const theme of ['light', 'dark'] as const)
  for (const width of [390, 1440])
    test(`@boardwelcome ${theme} at ${width}: Open a terminal sits under Add a program, centred with it`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, '/board', { theme });
      const add = card(page).getByRole('button', { name: new RegExp(strings['empty.add'], 'i') });
      const open = card(page).getByRole('button', { name: new RegExp(strings['empty.terminal'], 'i') });
      await expect(open).toBeVisible();
      const a = (await add.boundingBox())!;
      const b = (await open.boundingBox())!;
      expect(b.y, 'under Add a program').toBeGreaterThanOrEqual(a.y + a.height);
      expect(Math.abs(b.x + b.width / 2 - (a.x + a.width / 2)), 'centred with Add a program').toBeLessThanOrEqual(1);
      await noSideScroll(page);
      await page.screenshot({ path: test.info().outputPath(`boardwelcome-terminal-${theme}-${width}.png`) });
    });

test('@boardwelcome Open a terminal puts a terminal of the current computer on the Board', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/board');
  const open = card(page).getByRole('button', { name: new RegExp(strings['empty.terminal'], 'i') });
  await open.click();
  await expect(page.locator('iframe[title^="terminal-"][title$=" on atlas"]')).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test('@boardwelcome no computer: Add a program alone, no Open a terminal', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/board', { state: 'empty' });
  await expect(card(page).getByRole('button', { name: new RegExp(strings['empty.add'], 'i') })).toBeVisible();
  await expect(card(page).getByRole('button', { name: new RegExp(strings['empty.terminal'], 'i') })).toHaveCount(0);
});
