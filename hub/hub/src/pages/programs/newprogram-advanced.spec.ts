// Playwright: New program's Advanced and sandbox sections at desktop and phone width. Both are closed at first,
// open to their fields (Advanced: folder, description, startsecs, logs; sandbox: the Sandbox panel's presets and
// fields), fit with no sideways scroll, and a mistyped folder opens its section with the field marked, sending
// nothing. Shots go to HUB_SHOTS_DIR when it is set.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './sandbox/strings.en.json';

const shot = async (page: Page, name: string) => {
  const dir = process.env.HUB_SHOTS_DIR;
  if (dir) await page.screenshot({ path: `${dir}/newprogram-advanced-${name}.png`, fullPage: true });
};
const re = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

for (const [label, viewport] of [
  ['1440', { width: 1440, height: 900 }],
  ['390', { width: 390, height: 844 }],
] as const) {
  test.describe(`@newprogram-advanced at ${label}`, () => {
    test.use({ viewport });

    test('Advanced and the sandbox open, fit, and mark a mistyped folder', async ({ page }) => {
      await gotoHub(page, '/programs');
      await page.getByRole('button', { name: strings['np.new'], exact: true }).click();
      const dlg = page.getByRole('dialog', { name: strings['np.title'] });
      await expect(dlg).toBeVisible();

      const adv = dlg.getByRole('button', { name: strings['np.adv'], exact: true });
      const sb = dlg.getByRole('button', { name: re(strings['np.sb']) });
      await expect(adv).toHaveAttribute('aria-expanded', 'false');
      await expect(sb).toHaveAttribute('aria-expanded', 'false');

      await adv.click();
      await expect(dlg.getByRole('textbox', { name: re(strings['np.directory']) })).toBeVisible();
      await expect(dlg.getByRole('textbox', { name: re(strings['np.startSecs']) })).toBeVisible();
      await expect(dlg.getByRole('switch', { name: re(strings['np.logs']) })).toBeVisible();
      await noSideScroll(page);
      await shot(page, `${label}-advanced`);

      await sb.click();
      await expect(dlg.getByText(strings['sb.ed.presets'])).toBeVisible();
      await noSideScroll(page);
      await shot(page, `${label}-sandbox`);

      await dlg.getByRole('textbox', { name: re(strings['np.name']) }).fill('my-app');
      await dlg.getByRole('textbox', { name: re(strings['np.command']) }).fill('node server.js');
      await dlg.getByRole('textbox', { name: re(strings['np.directory']) }).fill('srv/app');
      await adv.click();
      await expect(adv).toHaveAttribute('aria-expanded', 'false');
      await dlg.getByRole('button', { name: strings['np.add'], exact: true }).click();
      await expect(adv).toHaveAttribute('aria-expanded', 'true');
      await expect(dlg.getByText(strings['np.err.pathAbsolute'])).toBeVisible();
      await expect(dlg.getByText(strings['np.fixFirst'])).toBeVisible();
      await shot(page, `${label}-fix`);
    });
  });
}
