// Playwright: in Chromium, a header button that
// folds into the Bot's ⋯ as a running Bot starts to need a fix leaves the keyboard on the ⋯ only when the keyboard was on
// it. Keyboard moved to another element, or to no element (a click on plain text), stays where it is. The vitest twins
// (header.rows.test.tsx) run in happy-dom, which fires no focusout when a focused element is removed; Chromium's own
// event order is measured here. The live read turns through the app's own query client (the dev server's module, the
// same instance the page holds), as the vitest twins do: a fixture state switch would remount the pane.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const URL = `/bots?sel=${CHIEF}`;

const open = async (page: Page) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, URL, { state: 'working' });
  await expect(page.getByRole('heading', { level: 2, name: 'Chief' })).toBeVisible();
};
const header = (page: Page) => page.getByRole('heading', { level: 2, name: 'Chief' }).locator('xpath=ancestor::header[1]');
/** The running Bot's chat app now waits for an owner: Bot settings and Details fold into the ⋯. */
const needFix = async (page: Page) => {
  await page.evaluate(async (chief) => {
    type Client = { getQueryCache(): { findAll(): Array<{ queryKey: unknown[]; state: { data: unknown } }> }; setQueryData(k: unknown[], f: (d: Record<string, Record<string, unknown>>) => unknown): void };
    // @ts-expect-error vite URL resolved in the browser
    const core: unknown = await import(/* @vite-ignore */ '/src/core/index.ts'); // eslint-disable-line hub/page-boundaries -- a vite URL, resolved in the browser
    const queryClient = (core as { queryClient: Client }).queryClient;
    const q = queryClient.getQueryCache().findAll().find((x) => x.queryKey[2] === 'view' && chief in ((x.state.data as Record<string, unknown> | undefined) ?? {}));
    if (!q) throw new Error('no view read holding Chief');
    queryClient.setQueryData(q.queryKey, (d) => ({ ...d, [chief]: { ...d[chief], gate: null, attention: [{ row: 'channels', key: 'chatapp', why: 'awaiting_owner' }] } }));
  }, CHIEF);
  await expect(header(page).getByRole('button', { name: /^Fix in / })).toBeVisible();
  await expect(header(page).getByRole('button', { name: /^(Bot settings|Details)$/ })).toHaveCount(0);
};
const active = (page: Page) => page.evaluate(() => {
  const a = document.activeElement;
  return a === document.body ? 'body' : (a?.getAttribute('aria-label') ?? a?.textContent?.trim() ?? a?.tagName ?? '');
});

for (const which of ['Bot settings', 'Details'] as const) {
  test(`${which} with the keyboard on it folds into the ⋯: the keyboard goes to the ⋯`, async ({ page }) => {
    await open(page);
    const button = header(page).getByRole('button', { name: which === 'Details' ? /^Details$/ : /^Bot settings/ });
    await button.focus();
    await expect(button).toBeFocused();
    await needFix(page);
    await expect(header(page).getByRole('button', { name: 'More actions' })).toBeFocused();
  });

  test(`${which} left for no element before the fold: the keyboard stays off the ⋯`, async ({ page }) => {
    await open(page);
    const button = header(page).getByRole('button', { name: which === 'Details' ? /^Details$/ : /^Bot settings/ });
    await button.focus();
    await expect(button).toBeFocused();
    // As a click on plain text does: the keyboard leaves the button for no element (focusout, no focusin).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await active(page)).toBe('body');
    await needFix(page);
    await page.waitForTimeout(200);
    await expect(header(page).getByRole('button', { name: 'More actions' })).not.toBeFocused();
    expect(await active(page)).toBe('body');
  });

  test(`${which} left for another element before the fold: the keyboard stays there`, async ({ page }) => {
    await open(page);
    const button = header(page).getByRole('button', { name: which === 'Details' ? /^Details$/ : /^Bot settings/ });
    await button.focus();
    await expect(button).toBeFocused();
    const say = page.getByRole('textbox', { name: 'Message the Bot' });
    await say.focus();
    await expect(say).toBeFocused();
    await needFix(page);
    await page.waitForTimeout(200);
    await expect(say).toBeFocused();
  });
}
