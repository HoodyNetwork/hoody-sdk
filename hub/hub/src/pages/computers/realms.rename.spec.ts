// Playwright, the whole Hub (shell included): Rename realms in a computer's Realms drawer opens the shell's Rename
// realms dialog over the drawer; closing it returns to the drawer with the ticks kept.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const drawerName = strings['realmsd.title'].replaceAll('{{name}}', 'atlas');

test('@realms Rename realms in the Realms drawer opens the shell dialog, and closing it returns to the drawer', async ({ page }) => {
  await gotoHub(page, '/computers?sel=atlas.00a1&tab=ports');
  await page.getByRole('button', { name: strings['menu.actions'].replace('{{name}}', 'atlas') }).click();
  await page.getByRole('menuitem', { name: strings['menu.realms'] }).click();
  const drawer = page.getByRole('dialog', { name: drawerName });
  await expect(drawer).toBeVisible();
  const lab = drawer.getByRole('checkbox', { name: /^Lab/ });
  await lab.click();
  await expect(lab).toHaveAttribute('aria-checked', 'true');

  await drawer.getByRole('button', { name: strings['realmsd.rename'] }).click();
  // The shell's dialog title (shell/strings.en.json rename.title); pages don't import shell strings.
  const dialog = page.getByRole('dialog', { name: 'Rename realms' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Rename Personal/ })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('checkbox', { name: /^Lab/ })).toHaveAttribute('aria-checked', 'true');
});
