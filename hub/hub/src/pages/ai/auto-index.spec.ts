// Playwright: Automations has an index as Knowledge does, Workflows · Loops · TODOs. Beside the
// screen at 1440 px it sits in the pane under the switcher; on a phone (390 px) it is above the screen. In both themes,
// each entry opens its screen and the shown one is marked, with no page scroll sideways.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import { links } from './links';
import paneStrings from './parts/Pane.strings.en.json';
import loopStrings from './auto/loops/List.strings.en.json';
import todoStrings from './auto/todos/List.strings.en.json';

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true });

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`${width} px, ${scheme}: from Workflows the index opens TODOs, then Loops, marking each`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, links.workflows);
      const nav = page.getByRole('navigation', { name: paneStrings['pane.label'], exact: true });
      // Beside the screen the index is the pane's; on a phone the pane is not shown and the index is above the screen.
      const scope = width === 390 ? page : nav;
      if (width === 390) await expect(nav).toHaveCount(0);
      const index = scope.getByRole('list', { name: paneStrings['auto.label'], exact: true });
      const entry = (name: string) => index.getByRole('link', { name, exact: true });
      await expect(entry(paneStrings['auto.workflows'])).toHaveAttribute('aria-current', 'page', { timeout: 20_000 });
      await noSideScroll(page);
      await entry(paneStrings['auto.todos']).click();
      await expect(page).toHaveURL(/#\/ai\/auto\/todos$/);
      await expect(heading(page, todoStrings.title)).toBeVisible({ timeout: 20_000 });
      await expect(entry(paneStrings['auto.todos'])).toHaveAttribute('aria-current', 'page');
      await entry(paneStrings['auto.loops']).focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#\/ai\/auto\/loops$/);
      await expect(heading(page, loopStrings.title)).toBeVisible({ timeout: 20_000 });
      await expect(entry(paneStrings['auto.loops'])).toHaveAttribute('aria-current', 'page');
      await expect(entry(paneStrings['auto.workflows'])).not.toHaveAttribute('aria-current', 'page');
      // Focus stays on the entry the keyboard opened.
      await expect(entry(paneStrings['auto.loops'])).toBeFocused();
      // On a phone the index is above the screen.
      if (width === 390) {
        const [i, h] = [await index.boundingBox(), await heading(page, loopStrings.title).boundingBox()];
        expect(i && h && i.y + i.height <= h.y).toBe(true);
      }
      await noSideScroll(page);
    });
  }
}
