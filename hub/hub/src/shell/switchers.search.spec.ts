// Playwright (the realm menu's search row): the keys here are the browser's own, so React's
// capture and bubble listeners run as separate native listeners with a microtask checkpoint between them, as a person's
// keys do; a script-dispatched event (happy-dom, Switchers.menus.test.tsx) runs its whole propagation in one call. The
// fixture world has three realms and the search row needs more than SEARCH_ABOVE, so this spec serves core/world.ts with
// nine more (a local fixture: the realm list, the alias map and the usage read all come from it).
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const LAB = 'f3f3f3f3f3f3f3f3f3f3f3f3';
const extra = Array.from({ length: 9 }, (_, i) => `{ id: "f9f9f9f9f9f9f9f9f9f9f9${String(i).padStart(2, '0')}", name: "Realm 0${i}", tint: "teal" }`);

/** Serves core/world.ts with the extra realms after Lab; resolves true once a served copy carried them. */
function moreRealms(page: Page): Promise<boolean> {
  return new Promise((done) => {
    void page.route(/\/src\/core\/world\.ts(\?.*)?$/, async (route) => {
      const res = await route.fetch();
      const body = await res.text();
      const next = body.replace(new RegExp(`(\\{\\s*id:\\s*["']${LAB}["'][^}]*\\})`), `$1, ${extra.join(', ')}`);
      done(next !== body);
      await route.fulfill({ response: res, body: next });
    });
  });
}

test('Shift+End right after typing moves to the last row, and Enter runs that row, not the first match', async ({ page }) => {
  const served = moreRealms(page);
  await gotoHub(page, '/home');
  expect(await served).toBe(true);
  const trigger = page.locator('[data-hub-switch="realm"]');
  const before = await trigger.textContent();
  await trigger.click();
  const box = page.getByRole('searchbox', { name: 'Search realms' });
  await expect(box).toBeFocused();
  await page.keyboard.type('realm 0');
  // React Aria has queued focus on the first match, so Shift+End moves through the menu instead of selecting text.
  await expect(box).toHaveAttribute('aria-activedescendant', /.+/);
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/realms\/new/);
  await expect(trigger).toHaveText(before ?? '');
});
