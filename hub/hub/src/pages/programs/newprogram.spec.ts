// Playwright: New program sits in the Programs header beside Launch an app (the primary) at desktop and phone width,
// and its drawer fits both with no sideways scroll; Run once hides the ports and the boot switch. Shots go to
// HUB_SHOTS_DIR when it is set.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import programs from './strings.en.json';
import strings from './sandbox/strings.en.json';

const shot = async (page: Page, name: string) => {
  const dir = process.env.HUB_SHOTS_DIR;
  if (dir) await page.screenshot({ path: `${dir}/newprogram-${name}.png` });
};

for (const [label, viewport] of [
  ['1440', { width: 1440, height: 900 }],
  ['390', { width: 390, height: 844 }],
] as const) {
  test.describe(`@newprogram at ${label}`, () => {
    test.use({ viewport });

    test('the header offers New program; its drawer keeps or runs once and fits', async ({ page }) => {
      await gotoHub(page, '/programs');
      await expect(page.getByRole('tab', { name: programs['tab.running'], selected: true })).toBeVisible();
      const add = page.getByRole('button', { name: strings['np.new'], exact: true });
      await expect(add).toBeVisible();
      await expect(add).not.toHaveAttribute('data-variant', 'primary');
      await expect(page.getByRole('button', { name: programs['runApp'], exact: true })).toHaveCount(1);
      await noSideScroll(page);
      await shot(page, `${label}-header`);

      await add.click();
      const dlg = page.getByRole('dialog', { name: strings['np.title'] });
      await expect(dlg).toBeVisible();
      await expect(dlg.getByRole('textbox', { name: new RegExp(`^${strings['np.name']}`) })).toBeVisible();
      await expect(dlg.getByRole('radiogroup', { name: strings['np.ports'] })).toBeVisible();
      await expect(dlg.getByRole('switch', { name: new RegExp(strings['np.boot']) })).toBeVisible();
      await noSideScroll(page);
      await shot(page, `${label}-keep`);

      // react-aria draws the radio's input under its label: a person taps the label.
      await dlg.locator('label').filter({ has: page.getByRole('radio', { name: new RegExp(`^${strings['np.mode.once']}`) }) }).click();
      await expect(dlg.getByRole('radiogroup', { name: strings['np.ports'] })).toHaveCount(0);
      await expect(dlg.getByRole('switch', { name: new RegExp(strings['np.boot']) })).toHaveCount(0);
      await expect(dlg.getByRole('button', { name: strings['np.run'], exact: true })).toBeVisible();
      await noSideScroll(page);
      await shot(page, `${label}-once`);

      // Fields left empty: nothing is sent, the footer says what to fix.
      await dlg.getByRole('button', { name: strings['np.run'], exact: true }).click();
      await expect(dlg.getByText(strings['np.fixFirst'])).toBeVisible();
      await shot(page, `${label}-fix`);
    });
  });
}
