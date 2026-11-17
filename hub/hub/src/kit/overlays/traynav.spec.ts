// Playwright: leaving closes an open menu without choosing. Back to an earlier search on the
// same page closes the tray, unlocks the page scroll and runs no item; Back to another page closes it too, and a kept
// page (the Board, hidden while another shows) comes back with its controlled menu closed.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/overlays.strings.en.json';
import shell from '../../shell/strings.en.json';
import board from '../../pages/board/strings.en.json';

const tray = (page: Page) => page.locator('[data-hub-tray]');
const back = (page: Page) => page.goBack().catch((e: Error) => {
  if (!/ERR_ABORTED|frame was detached/.test(e.message)) throw e;
});

test.use({ viewport: { width: 390, height: 844 } });

test('@traynav Back to an earlier search on the same page closes the tray, unlocks scrolling and chooses nothing', async ({ page }) => {
  await gotoHub(page, '/_kit?tab=overlays');
  const open = page.getByRole('button', { name: gallery['open.drawerSm'], exact: true });
  await open.scrollIntoViewIfNeeded();
  await open.click();
  await expect(page).toHaveURL(/open=drawer-sm/);
  const drawer = page.getByRole('dialog', { name: gallery['drawer.sm.title'] });
  await expect(drawer).toBeVisible();
  const btn = drawer.getByRole('button', { name: gallery['btn.drawerMenu'], exact: true });
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(tray(page)).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard?.readText?.().catch(() => '') ?? '');
  await back(page);
  await expect(page).not.toHaveURL(/open=drawer-sm/);
  await expect(tray(page)).toHaveCount(0);
  await expect(drawer).toHaveCount(0);
  // React Aria's scroll lock is gone with the tray.
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
  expect(await page.evaluate(() => navigator.clipboard?.readText?.().catch(() => '') ?? ''), 'no item ran').toBe(copied);
});

test('@traynav leaving the kept Board through history closes its tray; returning finds its menu closed', async ({ page }) => {
  await gotoHub(page, '/board');
  // An in-app entry after the Board, so Back and Forward move between two kept pages.
  await page.getByRole('navigation', { name: shell['bottom.label'] }).getByRole('link', { name: shell['bottom.computers'] }).click();
  await expect(page).toHaveURL(/\/computers/);
  await back(page);
  await expect(page).toHaveURL(/\/board/);
  const trigger = page.locator('#hub-main [aria-haspopup]').filter({ has: page.locator('svg') }).first();
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: board['boards'] }), 'the Boards menu tray').toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/computers/);
  await expect(tray(page), 'leaving closes the tray').toHaveCount(0);
  await back(page);
  await expect(page).toHaveURL(/\/board/);
  await expect(trigger).toBeVisible();
  await expect(tray(page), 'the kept Board comes back with its menu closed').toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('@traynav Back with the menu still on the page: the history entry alone closes the tray', async ({ page }) => {
  await gotoHub(page, '/_kit?tab=overlays');
  // An in-app entry: the drawer pushes ?open=, its Escape replaces it without; Back then returns to the first entry and
  // the gallery's (uncontrolled) long menu stays mounted throughout.
  const open = page.getByRole('button', { name: gallery['open.drawerSm'], exact: true });
  await open.scrollIntoViewIfNeeded();
  await open.click();
  await expect(page).toHaveURL(/open=drawer-sm/);
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/open=/);
  const btn = page.getByRole('button', { name: gallery['btn.longMenu'], exact: true });
  await btn.scrollIntoViewIfNeeded();
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(tray(page)).toBeVisible();
  // Both entries read the same URL (the drawer's Escape replaced its own): only the history entry changes.
  const entries = await page.evaluate(() => history.length);
  await back(page);
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await expect(tray(page)).toHaveCount(0);
  await expect(btn).toBeAttached();
  await expect(page.getByRole('dialog'), 'no item ran: the rename dialog stays shut').toHaveCount(0);
});

