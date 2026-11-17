// Playwright: on All realms a Board tile names its realm in a small ghost chip (a kit Button around the kit RealmChip,
// which caps the name's width) that takes at most half of the tile head. A short realm name keeps a 44 px target on a
// coarse pointer; with a mouse the chip is the kit sm button around its name (no minimum), and a long name ends in "…"
// inside the half-head cap on both.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

async function openAllRealms(page: Page) {
  await gotoHub(page, '/', { state: 'colours' });
  await page.locator('#hub-main button[data-realm]').first().click();
  await page.evaluate(() => { location.hash = '#/board/open/atlas.00a1/terminal-1'; });
  const g = page.getByRole('group', { name: /^terminal-1 · atlas, realm / });
  await expect(g).toBeVisible({ timeout: 60_000 });
  return g;
}

/** The chip's box with the realm name set to `name` (the fixtures' realm names are long; the chip's CSS is what is
 *  tested, so the label text is swapped in place and the box read after a frame). */
async function chipWith(page: Page, name: string) {
  return page.evaluate(async (n) => {
    // The chip is a kit Button holding the kit RealmChip (square and name); it is found by its name span in the tile.
    const label = document.querySelector<HTMLElement>('[role="group"][aria-label^="terminal-1 · atlas, realm "] [class*="realmName"]');
    const chip = label?.closest<HTMLElement>('button');
    if (!chip || !label) return null;
    label.textContent = n;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = chip.getBoundingClientRect();
    // The tile head is the element holding the computer stripe.
    let headEl: HTMLElement | null = chip.parentElement;
    while (headEl && !headEl.querySelector(':scope > [class*="stripe"]')) headEl = headEl.parentElement;
    const head = headEl!.getBoundingClientRect();
    // The kit Button's label box is the one that ellipsizes (the realm name is an inline span in it).
    const labelCut = [...chip.querySelectorAll<HTMLElement>('span')].some((x) => x.clientWidth > 1 && x.scrollWidth > x.clientWidth + 1);
    // The chip's own content (square, gap, name) and the kit's sm sizes, so the mouse case is measured against the kit.
    const content = label.parentElement!.getBoundingClientRect().width;
    const css = getComputedStyle(chip);
    const sides = parseFloat(css.paddingLeft) + parseFloat(css.paddingRight) + parseFloat(css.borderLeftWidth) + parseFloat(css.borderRightWidth);
    const smH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--btn-h-sm'));
    return { w: r.width, h: r.height, content, sides, smH, headW: head.width, labelCut, inHead: r.right <= head.right + 1 && r.left >= head.left - 1 };
  }, name);
}

for (const width of [390, 320]) {
  test.describe(`coarse pointer at ${width}`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
    test('a one-letter realm name keeps the chip a 44 px target; a long one ends in … inside its cap', async ({ page }) => {
      await openAllRealms(page);
      const short = await chipWith(page, 'A');
      expect(short, 'the realm chip is drawn').not.toBeNull();
      expect(short!.w, 'one letter: 44 wide').toBeGreaterThanOrEqual(43.5);
      expect(short!.h, 'one letter: 44 tall').toBeGreaterThanOrEqual(43.5);
      const long = await chipWith(page, 'a-realm-name-long-enough-to-cut');
      expect(long!.labelCut, 'a long name is cut with an ellipsis').toBe(true);
      expect(long!.inHead, 'and stays inside the tile head').toBe(true);
      expect(long!.w, 'at most half the tile head').toBeLessThanOrEqual(long!.headW / 2 + 1);
    });
  });
}

test('with a mouse at 1350 the chip is the kit sm button around a one-letter name (no touch minimum)', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await openAllRealms(page);
  const short = await chipWith(page, 'A');
  expect(short, 'the realm chip is drawn').not.toBeNull();
  expect(short!.h, 'the kit sm height').toBeCloseTo(short!.smH, 0);
  expect(short!.w, 'its padding and frame around the name, nothing more').toBeLessThanOrEqual(short!.sides + short!.content + 1);
  const long = await chipWith(page, 'realm-'.repeat(60));
  expect(long!.labelCut, 'a long name is cut with an ellipsis').toBe(true);
  expect(long!.inHead, 'and stays inside the tile head').toBe(true);
  expect(long!.w, 'at most half the tile head').toBeLessThanOrEqual(long!.headW / 2 + 1);
});
