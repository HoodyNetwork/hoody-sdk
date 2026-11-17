// Playwright: the computed side of menufooter.test.tsx and PickerPanel.footer.test.tsx on the gallery's
// footer demos (20 realms). The footer stays at the bottom of the scrolling menu, phone tray and picker while the rows
// scroll under it, with nothing of a row showing below it; the arrows reach it in the menu and Tab reaches it in the
// picker; axe finds nothing, light and dark.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/overlays.strings.en.json';

const box = async (l: Locator) => {
  const b = await l.boundingBox();
  if (!b) throw new Error('not laid out');
  return b;
};
/** The nearest scrolling ancestor of `l` (the element the footer sticks in), its client box (inside its border, padding
 *  included) and scroll room. */
const scroller = (l: Locator) =>
  l.evaluate((el) => {
    let s: HTMLElement | null = el.parentElement;
    while (s && !(s.scrollHeight > s.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
    if (!s) return null;
    const r = s.getBoundingClientRect();
    const left = r.left + s.clientLeft;
    return { bottom: r.top + s.clientTop + s.clientHeight, left, right: left + s.clientWidth, room: s.scrollHeight - s.clientHeight };
  });
const scrollTo = (l: Locator, where: 'top' | 'end') =>
  l.evaluate((el, w) => {
    let s: HTMLElement | null = el.parentElement;
    while (s && !(s.scrollHeight > s.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
    if (s) s.scrollTop = w === 'top' ? 0 : s.scrollHeight;
  }, where);

/** The footer sits at its scroller's bottom edge (both read afresh, so an opening animation has settled), at the top
 *  and the end of the scroll alike, and spans the scroller from inline edge to inline edge across its padding. */
async function pinned(footer: Locator) {
  expect(await footer.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
  const sc = await scroller(footer);
  expect(sc, 'the rows overflow, so the footer has something to stay over').not.toBeNull();
  expect(sc?.room ?? 0).toBeGreaterThan(40);
  for (const where of ['top', 'end'] as const) {
    await scrollTo(footer, where);
    await expect
      .poll(async () => {
        const s = await scroller(footer);
        const b = await box(footer);
        return Math.round(Math.abs(b.y + b.height - (s?.bottom ?? 0)));
      }, { message: `footer bottom at the scroller's bottom (${where})` })
      .toBeLessThanOrEqual(1);
  }
  await expect
    .poll(async () => {
      const s = await scroller(footer);
      const b = await box(footer);
      return [Math.round(Math.abs(b.x - (s?.left ?? 0))), Math.round(Math.abs(b.x + b.width - (s?.right ?? 0)))];
    }, { message: "footer's inline edges at the scroller's inline edges" })
    .toEqual([0, 0]);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`footer at 1350 (${scheme})`, () => {
    test.use({ viewport: { width: 1350, height: 560 }, colorScheme: scheme });

    test('the realm menu footer stays at the bottom while 20 realms scroll; End reaches New realm; axe is clean', async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, '/_kit?tab=overlays');
      const trigger = page.getByRole('button', { name: gallery['btn.footerMenu'], exact: true });
      await trigger.scrollIntoViewIfNeeded();
      await trigger.focus();
      await page.keyboard.press('Enter');
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      const footer = menu.getByRole('group', { name: 'Menu actions' });
      await pinned(footer);
      await expect(footer.getByRole('menuitem')).toHaveText([gallery['menu.footer.share'], gallery['menu.footer.new']]);
      await page.getByRole('menuitemradio', { name: 'Realm 1', exact: true }).focus();
      await page.keyboard.press('End');
      await expect(page.getByRole('menuitem', { name: gallery['menu.footer.new'] })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.focus();
      await page.keyboard.press('Enter');
      const axe = await new AxeBuilder({ page }).include('[role="menu"]').analyze();
      expect(axe.violations.map((v) => v.id)).toEqual([]);
    });

    test('the picker footer stays at the bottom while 20 realms scroll; Tab from the options reaches Use this realm', async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, '/_kit?tab=overlays');
      const picker = page.locator('[data-footer-picker]');
      await picker.scrollIntoViewIfNeeded();
      const footer = picker.getByRole('group', { name: 'Picker actions' });
      await expect(footer).toBeVisible();
      await pinned(footer);
      await picker.getByRole('radio', { name: 'Realm 1', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(picker.getByRole('button', { name: gallery['picker.footer.use'] })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(picker.getByRole('radio', { name: 'Realm 1', exact: true })).toBeFocused();
      const axe = await new AxeBuilder({ page }).include('[data-footer-picker]').analyze();
      expect(axe.violations.map((v) => v.id)).toEqual([]);
    });
  });
}

test.describe('footer in the phone tray (390, coarse)', () => {
  test.use({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });

  test('the tray keeps the footer as the menu\'s last section, at the bottom of the tray while the realms scroll', async ({ page }) => {
    test.setTimeout(120_000);
    await gotoHub(page, '/_kit?tab=overlays&menu=footer');
    const tray = page.locator('[data-hub-tray]');
    await expect(tray).toBeVisible();
    const footer = tray.getByRole('menu').getByRole('group', { name: 'Menu actions' });
    await pinned(footer);
    const b = await box(footer);
    expect(b.y + b.height).toBeLessThanOrEqual(700);
    for (const item of await footer.getByRole('menuitem').all()) expect((await box(item)).height).toBeGreaterThanOrEqual(44);
  });
});

