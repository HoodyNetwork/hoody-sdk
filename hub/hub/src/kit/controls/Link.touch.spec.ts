// Playwright: on a coarse pointer a `nav` Link is a real 44 x 44 box (a touch 21px off its centre lands on it,
// and no neighbour's target overlaps it); `plain` and `inline` links are not boxed; on a fine pointer nothing changes.
// Boxes need a real browser, not jsdom.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from '../gallery/kit2.strings.en.json';

async function open(page: Page) {
  await gotoHub(page, '/_kit?tab=text');
  await page.getByRole('link', { name: strings['link.nav'], exact: true }).waitFor({ timeout: 15_000 });
}
// The gallery's Links row (the nav link's own row): 'atlas' is also a computer name elsewhere on the page.
const row = (page: Page) => page.getByRole('link', { name: strings['link.nav'], exact: true }).locator('xpath=..');
const link = (page: Page, key: 'link.nav' | 'link.plain' | 'link.docs') => row(page).getByRole('link', { name: strings[key], exact: true });

async function geometry(l: Locator) {
  await l.scrollIntoViewIfNeeded();
  return l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const y = r.top + r.height / 2;
    const xs = [r.left + 2, r.left + r.width / 2, r.right - 2];
    const takes = (dy: number) =>
      xs.every((x) => {
        const t = document.elementFromPoint(x, y + dy);
        return !!t && (t === el || el.contains(t));
      });
    // Any other link or button whose box meets this one.
    const others = [...document.querySelectorAll<HTMLElement>('a[href], button')].filter((o) => o !== el && !el.contains(o) && !o.contains(el) && o.getClientRects().length > 0);
    const overlaps = others.filter((o) => {
      const b = o.getBoundingClientRect();
      return b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top;
    }).length;
    return { w: r.width, h: r.height, display: cs.display, above: takes(-21), below: takes(21), overlaps };
  });
}

test.describe('on a coarse pointer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a nav link is a 44 x 44 box that owns its touch area and overlaps nothing', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const g = await geometry(link(page, 'link.nav'));
    expect(g.h).toBeGreaterThanOrEqual(44);
    expect(g.w).toBeGreaterThanOrEqual(44);
    expect(g.display, 'inline-flex, or flex when its parent blockifies it').toMatch(/flex/);
    expect(g.above && g.below, 'a touch 21px above and below the centre lands on the link').toBe(true);
    expect(g.overlaps).toBe(0);
  });

  test('a plain link is not boxed to 44 px (it wraps tiles that are their own targets)', async ({ page }) => {
    await open(page);
    const g = await geometry(link(page, 'link.plain'));
    expect(g.display).not.toMatch(/flex/);
    expect(g.h).toBeLessThan(44);
  });

  test('an inline link in running text keeps its text line', async ({ page }) => {
    await open(page);
    const g = await geometry(link(page, 'link.docs'));
    expect(g.display).not.toMatch(/flex/);
    expect(g.h).toBeLessThan(44);
  });
});

test.describe('on a fine pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a nav link keeps its text line: no minimum box', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(false);
    const g = await geometry(link(page, 'link.nav'));
    expect(g.display).not.toMatch(/flex/);
    expect(g.h).toBeLessThan(44);
  });
});
