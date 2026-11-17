// Playwright: the flat ModelPicker (a chat's Session tab) from the kit gallery (/_kit?tab=modelpick&mp=flat|flatmany)
// on the real chat catalogue. At 1440 and at 390 on a touch screen: a model that needs setup is not a row and one line
// leads to setup; a search finds a handful of them with their setup words; with forty ready models the list scrolls
// inside itself (the wheel moves it) and the search box, the line and the control below it fit one screen together; nothing leaves the
// screen sideways and axe finds nothing (WCAG 2 A/AA).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import gallery from '../gallery/modelPick.strings.en.json';
import mp from './ModelPicker.strings.en.json';

const FRAME = '[data-gallery="model-pick"]';
const frame = (page: Page) => page.locator(FRAME);
const SETUP = new RegExp(mp['mp.setup'].replace('{{provider}}', '.+'));

async function open(page: Page, state: 'flat' | 'flatmany') {
  await gotoHub(page, `/_kit?tab=modelpick&mp=${state}`);
  await frame(page).getByRole('radiogroup').waitFor({ timeout: 60_000 });
}

/** Pixels from the top of the search box to the bottom of the control below the picker. */
const span = (page: Page) =>
  page.evaluate(
    ([sel, name]) => {
      const f = document.querySelector(sel as string)!;
      const below = Array.from(f.querySelectorAll('button')).find((b) => b.textContent === name)!;
      return below.getBoundingClientRect().bottom - f.querySelector('input')!.getBoundingClientRect().top;
    },
    [FRAME, gallery['flat.below']],
  );

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).include(FRAME).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

for (const vp of [
  { name: '1440', viewport: { width: 1440, height: 900 }, touch: false },
  { name: '390 touch', viewport: { width: 390, height: 844 }, touch: true },
]) {
  test.describe(`the flat model picker at ${vp.name}`, () => {
    test.use({ viewport: vp.viewport, hasTouch: vp.touch, isMobile: vp.touch });

    test('only ready models are rows; one line leads to setup; a search finds a few that need setup', async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, 'flat');
      const list = frame(page).getByRole('radiogroup');
      await expect(list.getByRole('radio')).toHaveCount(1);
      await expect(list.getByRole('radio', { name: /Hoody Free/ })).toHaveAttribute('aria-checked', 'true');
      await expect(frame(page).getByText(SETUP)).toHaveCount(0);
      await expect(frame(page).getByText(mp['mp.more'])).toBeVisible();
      expect(await span(page)).toBeLessThan(320);
      await noSideScroll(page);
      expect(await axe(page)).toEqual([]);

      await frame(page).getByRole('searchbox', { name: mp['mp.search'] }).fill('opus');
      await expect(list.getByText(SETUP)).toHaveCount(5);
      await expect(frame(page).getByText(/more matches need setup first\./)).toBeVisible();
      await expect(frame(page).getByRole('button', { name: mp['mp.moreAction'] })).toBeVisible();
      await noSideScroll(page);
      expect(await axe(page)).toEqual([]);
    });

    test('many ready models: the list scrolls inside itself and what follows stays on screen', async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, 'flatmany');
      const list = frame(page).getByRole('radiogroup');
      await expect(list.getByRole('radio')).toHaveCount(41);
      const box = await list.evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
      expect(box.scroll).toBeGreaterThan(box.client * 3);
      expect(box.client).toBeLessThan(vp.viewport.height / 2);
      // From the search box to the control below the list: well under one screen, whatever the list holds.
      expect(await span(page)).toBeLessThan(vp.viewport.height * 0.7);
      await frame(page).getByRole('button', { name: gallery['flat.below'] }).scrollIntoViewIfNeeded();
      await expect(frame(page).getByRole('searchbox', { name: mp['mp.search'] })).toBeInViewport({ ratio: 1 });
      await expect(frame(page).getByRole('button', { name: mp['mp.moreAction'] })).toBeInViewport({ ratio: 1 });
      // A wheel tick over the list moves the list (kit innerWheel), not the page.
      const pageTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
      await list.dispatchEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
      await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(pageTop);
      await noSideScroll(page);
      expect(await axe(page)).toEqual([]);
    });
  });
}
