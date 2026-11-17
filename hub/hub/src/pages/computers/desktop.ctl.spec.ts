// Playwright: the Desktop tab's controls in a real browser. The desktop's own address is
// answered by a stand-in page (the fixture world has no proxy). Stop desktop (in the toolbar's ⋯ menu) asks, takes the frame away and shows the
// stopped state with Start; switching the environment of a running desktop asks, then opens it with ?desktop_env=.
// The shots (1350 and 390, light and dark) cover the toolbar, both questions, the stopped and the unknown states; at
// 390 nothing makes the page scroll sideways.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

declare const process: { env: Record<string, string | undefined> };

const DESKTOP = '<!doctype html><title>stand-in desktop</title><body style="margin:0;background:#2b3a4a"></body>';
const SHOTS = process.env.DESKTOP_SHOTS_DIR;

const standIn = (page: Page) => page.route(/-desktop-\d+\./, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: DESKTOP }));
const panel = (page: Page) => page.getByRole('tabpanel');
// Stop desktop is in the toolbar's ⋯ menu: the menu button, then its Stop item.
const more = (page: Page) => panel(page).getByRole('button', { name: strings['desktop.more'].replace('{{n}}', '1') });
const pressStop = async (page: Page) => {
  await more(page).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${strings['desktop.stop']}`) }).click();
};

test('@desktop Stop desktop asks, takes the frame away, and Start opens it again', async ({ page }) => {
  // A page load and two desktop loads (each waited for up to 30 s): past the 30 s default under load.
  test.slow();
  await standIn(page);
  await gotoHub(page, '/computers?sel=atlas.00a1&tab=desktop');
  await expect(page.locator('[data-desktop]')).toHaveAttribute('data-desktop', 'loaded', { timeout: 30_000 });
  await pressStop(page);
  const ask = page.getByRole('alertdialog', { name: 'Stop desktop 1?' });
  await expect(ask).toContainText(strings['desktop.stop.body']);
  await ask.getByRole('button', { name: strings['desktop.stop'] }).click();
  await expect(panel(page).getByText('Desktop 1 is stopped')).toBeVisible();
  await expect(panel(page).locator('iframe')).toHaveCount(0);
  await panel(page).getByRole('button', { name: strings['desktop.start'] }).click();
  await expect(page.locator('[data-desktop]')).toHaveAttribute('data-desktop', 'loaded', { timeout: 30_000 });
});

test('@desktop switching the environment asks, then opens the desktop with it', async ({ page }) => {
  // A page load and two desktop loads (one waited for up to 30 s): past the 30 s default under load.
  test.slow();
  await standIn(page);
  await gotoHub(page, '/computers?sel=atlas.00a1&tab=desktop');
  await expect(page.locator('[data-desktop]')).toHaveAttribute('data-desktop', 'loaded', { timeout: 30_000 });
  await panel(page).getByRole('button', { name: new RegExp(strings['desktop.env']) }).click();
  await page.getByRole('option', { name: 'MATE' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Switch desktop 1 to MATE?' });
  await ask.getByRole('button', { name: strings['desktop.switch.go'] }).click();
  await expect(page.getByTitle('atlas, desktop 1')).toHaveAttribute('src', /-desktop-1\.[^/?#]+\/\?desktop_env=mate$/);
  await expect(panel(page).getByRole('button', { name: new RegExp(strings['desktop.env']) })).toContainText('MATE');
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1350, 390]) {
    test(`@desktop shots ${width} ${theme}`, async ({ page }) => {
      // Two page loads and two desktop loads (each waited for up to 30 s): past the 30 s default under load.
      test.slow();
      await page.setViewportSize({ width, height: width > 600 ? 900 : 844 });
      await standIn(page);
      const shot = async (name: string) => {
        await noSideScroll(page);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${width}-${theme}.png` });
      };
      await gotoHub(page, '/computers?sel=atlas.00a1&tab=desktop', { theme });
      // TRAP 4: the Hub's own theme, read back, not the browser's colour scheme.
      await expect(page.locator('html')).toHaveAttribute('data-hx-theme', theme);
      await expect(page.locator('[data-desktop]')).toHaveAttribute('data-desktop', 'loaded', { timeout: 30_000 });
      await more(page).scrollIntoViewIfNeeded();
      await shot('running');
      await pressStop(page);
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await shot('stop-ask');
      await page.getByRole('alertdialog').getByRole('button', { name: strings['desktop.stop'] }).click();
      await expect(panel(page).getByText('Desktop 1 is stopped')).toBeVisible();
      await shot('stopped');
      await panel(page).getByRole('button', { name: strings['desktop.start'] }).click();
      await expect(page.locator('[data-desktop]')).toHaveAttribute('data-desktop', 'loaded', { timeout: 30_000 });
      await panel(page).getByRole('button', { name: new RegExp(strings['desktop.env']) }).click();
      await page.getByRole('option', { name: 'MATE' }).click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await shot('switch-ask');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();

      await gotoHub(page, '/computers?sel=atlas.00a1&tab=desktop', { theme, state: 'desktopStopLost' });
      await expect(page.locator('html')).toHaveAttribute('data-hx-theme', theme);
      await pressStop(page);
      await page.getByRole('alertdialog').getByRole('button', { name: strings['desktop.stop'] }).click();
      await expect(panel(page).getByText("Desktop 1 may not have stopped yet")).toBeVisible({ timeout: 15_000 });
      await shot('unknown');
    });
  }
}
