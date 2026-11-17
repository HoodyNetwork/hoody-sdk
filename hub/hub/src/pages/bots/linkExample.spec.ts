// Playwright: the Link and keys tab in the Backups/Storage pattern. At 1440 with a mouse and at
// 390 and 320 on a coarse pointer: no sideways scroll, no red button on the page (Revoke all keys and Panic sit in
// menus), one Addresses row per address with its Copy whole, and an address's "How to use it" drawer shows its examples
// whole (the code wraps, the drawer does not scroll sideways). Light and dark.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

const LINK = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief&tab=link';
const KINDS = ['chat', 'openai', 'anthropic', 'mcp', 'skill'] as const;

async function open(page: Page, scheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: scheme });
  await gotoHub(page, LINK, { state: 'idle' });
  await expect(page.getByRole('heading', { name: strings['addr.title'], exact: true })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Elements whose own words are cut (an ellipsis or a clip), among `sel` inside `root`. */
const cut = (page: Page, root: string, sel: string) =>
  page.locator(root).evaluate(
    (r, s) =>
      [...r.querySelectorAll<HTMLElement>(s)]
        .filter((b) => b.getClientRects().length > 0)
        .filter((b) => [b, ...b.querySelectorAll<HTMLElement>('*')].some((x) => x.clientWidth > 1 && x.scrollWidth > x.clientWidth + 1 && getComputedStyle(x).overflowX !== 'visible'))
        .map((b) => b.textContent?.trim() ?? '?'),
    sel,
  );

async function checkTab(page: Page) {
  await noSideScroll(page);
  // Red only inside menus and dialogs: none of the tab's own buttons is a danger button.
  expect(await page.locator('main [data-variant="danger"], main [data-variant="dangerSolid"]').filter({ visible: true }).count(), 'no red button on the tab').toBe(0);
  const table = page.getByRole('table', { name: strings['addr.title'] });
  for (const k of KINDS) {
    const row = table.getByRole('row', { name: new RegExp(strings[`addr.kind.${k}`]) });
    await expect(row.getByRole('button', { name: `Copy the ${strings[`addr.kind.${k}`]} address` })).toBeVisible();
  }
  expect(await cut(page, '#bot-link-addresses', '[data-row-actions] button'), 'no Copy is cut').toEqual([]);
}

async function checkDoor(page: Page) {
  const row = page.getByRole('table', { name: strings['addr.title'] }).getByRole('row', { name: new RegExp(strings['addr.kind.openai']) });
  await row.getByRole('button', { name: 'Row actions' }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^How to use the ${strings['addr.kind.openai']} address`) }).click();
  const d = page.getByRole('dialog', { name: `${strings['addr.kind.openai']} address` });
  await expect(d).toBeVisible();
  for (const k of ['curl', 'openai'] as const) await expect(d.getByRole('heading', { name: strings[`connect.kind.${k}`] })).toBeVisible();
  const over = await d.evaluate((el) => [...el.querySelectorAll<HTMLElement>('*')].filter((x) => x.getClientRects().length > 0 && getComputedStyle(x).overflowX === 'auto' && x.scrollWidth > x.clientWidth + 1 && !x.closest('pre')).length);
  expect(over, 'the drawer does not scroll sideways').toBe(0);
}

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [390, 320]) {
    test.describe(`coarse pointer at ${width}, ${scheme}`, () => {
      test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
      test('the tab and an address drawer fit, with no red button on the page', async ({ page }) => {
        await open(page, scheme);
        await checkTab(page);
        await checkDoor(page);
      });
    });
  }

  test(`at 1440 with a mouse, ${scheme}: the tab and an address drawer fit, with no red button on the page`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, scheme);
    await checkTab(page);
    await checkDoor(page);
  });
}
