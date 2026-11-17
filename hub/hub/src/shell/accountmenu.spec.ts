// The account menu (the avatar in the desktop top bar) holds Support: the support
// page's own nav entry, its label the same words as the sidebar's Help entry, after Ways to connect. It is reached with
// the menu's own keyboard (arrow keys, Enter) and opens /support. Whether it shows at all follows the page being served
// (a load can leave it out); this dev server serves every page (HUB_PAGE='*'), so the hidden case is
// proven in Switchers.menus.test.tsx, not here.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

// The page's nav label, as the sidebar shows it (the shell's code never imports a page).
const SUPPORT = 'Support';

test.use({ viewport: { width: 1440, height: 900 } });

test('the account menu holds Support, named as the sidebar Help entry, after Ways to connect; Enter opens /support', async ({ page }) => {
  await gotoHub(page, '/home');
  const nav = page.getByRole('navigation', { name: strings['nav.label'] });
  await expect(nav.getByRole('link', { name: new RegExp(`^${SUPPORT}\\b`) }), 'the sidebar Help entry').toBeVisible();
  const avatar = page.getByRole('banner').getByRole('button', { name: strings['top.account'] });
  await avatar.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: strings['top.account'] });
  await expect(menu).toBeVisible();
  const item = menu.getByRole('menuitem', { name: SUPPORT, exact: true });
  await expect(item).toHaveAttribute('href', /\/support$/);
  const names = await menu.getByRole('menuitem').allTextContents();
  expect(names.indexOf(SUPPORT), 'right after Ways to connect').toBe(names.indexOf(strings['account.connect']) + 1);
  // The menu's own keyboard: arrow down until Support has focus, then Enter follows its link.
  for (let i = 0; i < names.length && !(await item.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press('ArrowDown');
  await expect(item, 'Support takes focus by arrow keys').toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await expect.poll(() => new URL(page.url()).hash, { message: 'Enter opens Support inside the Hub' }).toBe('#/support');
});
