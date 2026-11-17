// Playwright: each kit overlay that returns focus (Dialog, Drawer) never gives it back to an
// invoker that went hidden or aria-hidden while it was open: focus goes to the page title instead (the gallery passes
// no returnFocus). A hidden invoker refuses focus in a browser, which would leave focus on <body>; an aria-hidden one
// would take it back from the overlay's own restore and keep it. An invoker left alone still gets focus back.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/overlays.strings.en.json';

/** Where focus is: 'title' (the shown page title), 'invoker', 'body', or the element's tag. */
const focusIs = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return 'body';
    if (a.hasAttribute('data-hub-title')) return 'title';
    return a.hasAttribute('data-test-invoker') ? 'invoker' : a.tagName.toLowerCase();
  });

const OVERLAYS = [
  { name: 'Dialog', open: gallery['open.confirm'] },
  { name: 'Drawer', open: gallery['open.drawerSm'] },
] as const;

test.use({ viewport: { width: 1350, height: 900 } });

for (const o of OVERLAYS) {
  test.describe(`${o.name} focus return`, () => {
    for (const shut of ['hidden', 'aria-hidden'] as const) {
      test(`an invoker made ${shut} while the ${o.name} is open does not get focus back: the page title does`, async ({ page }) => {
        test.setTimeout(90_000); // slow under host load
        await gotoHub(page, '/_kit?tab=overlays');
        const invoker = page.getByRole('button', { name: o.open, exact: true });
        await invoker.click();
        await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toBeVisible();
        await invoker.evaluate((el, attr) => {
          el.setAttribute('data-test-invoker', '');
          el.setAttribute(attr, attr === 'hidden' ? '' : 'true');
        }, shut);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toBeHidden();
        await expect.poll(() => focusIs(page), { timeout: 5_000 }).toBe('title');
        await page.waitForTimeout(1000); // past the last check (800 ms): it stays there
        expect(await focusIs(page)).toBe('title');
      });
    }

    // An aria-hidden button is still keyboard focusable; a person who goes back to it keeps it.
    test(`a person who goes back to an aria-hidden invoker after the ${o.name} closes keeps focus there`, async ({ page }) => {
      test.setTimeout(90_000); // slow under host load
      await gotoHub(page, '/_kit?tab=overlays');
      const invoker = page.getByRole('button', { name: o.open, exact: true });
      await invoker.click();
      await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toBeVisible();
      await invoker.evaluate((el) => {
        el.setAttribute('data-test-invoker', '');
        el.setAttribute('aria-hidden', 'true');
      });
      // Escape, then at once a key press and focus back on the invoker, inside one task: before the last check. (A role
      // locator no longer finds an aria-hidden button, so it is reached by its test mark.)
      await page.keyboard.press('Escape');
      await page.evaluate(() => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        document.querySelector<HTMLElement>('[data-test-invoker]')?.focus();
      });
      await page.waitForTimeout(1500); // past the last check (800 ms)
      expect(await focusIs(page)).toBe('invoker');
    });

    test(`an invoker left alone gets focus back after the ${o.name} closes, as before`, async ({ page }) => {
      test.setTimeout(90_000); // slow under host load
      await gotoHub(page, '/_kit?tab=overlays');
      const invoker = page.getByRole('button', { name: o.open, exact: true });
      await invoker.evaluate((el) => el.setAttribute('data-test-invoker', ''));
      await invoker.click();
      await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toBeHidden();
      await page.waitForTimeout(1000); // past the last check
      expect(await focusIs(page)).toBe('invoker');
    });
  });
}
