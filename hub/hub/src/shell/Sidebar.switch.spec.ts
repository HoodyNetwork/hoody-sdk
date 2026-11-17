// Playwright: the sidebar's "On <computer>" label opens the top bar's computer
// switcher. Its chevron shows on hover and on keyboard focus, and always on a touch screen (no hover there). On a phone,
// from the keyboard, focus enters the sheet and comes back to a visible control when it closes.
// Opacity and pointer media need a real browser, not jsdom.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const label = (page: Page) => page.getByRole('navigation').getByRole('button', { name: /^On / });
const chevron = (button: Locator) => button.locator('svg');
const opacity = (l: Locator) => l.evaluate((el) => Number(getComputedStyle(el).opacity));

test.describe('a wide screen with a mouse', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the chevron is hidden at rest and shows on hover and on keyboard focus', async ({ page }) => {
    await gotoHub(page, '/home');
    const button = label(page);
    await button.waitFor({ timeout: 15_000 });
    await page.mouse.move(1400, 880);
    await expect.poll(() => opacity(chevron(button))).toBe(0);
    await button.hover();
    await expect.poll(() => opacity(chevron(button))).toBe(1);
    await page.mouse.move(1400, 880);
    await expect.poll(() => opacity(chevron(button))).toBe(0);
    await button.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    await expect.poll(() => opacity(chevron(button))).toBe(1);
  });

  test('pressing it opens the computer switcher', async ({ page }) => {
    await gotoHub(page, '/home');
    const button = label(page);
    await button.waitFor({ timeout: 15_000 });
    await button.click();
    await expect(page.locator('[data-hub-switch="computer"][aria-expanded="true"]')).toBeVisible();
  });
});

test.describe('a touch screen', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: true });

  test('the chevron always shows', async ({ page }) => {
    await gotoHub(page, '/home');
    const button = label(page);
    await button.waitFor({ timeout: 15_000 });
    await expect.poll(() => opacity(chevron(button))).toBe(1);
  });
});

test.describe('a phone, in the More drawer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('pressing it closes the drawer and opens the realm and computer sheet', async ({ page }) => {
    await gotoHub(page, '/home');
    const more = page.getByRole('navigation', { name: 'Quick navigation' }).getByRole('button', { name: 'More', exact: true });
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    const button = label(page);
    await expect.poll(() => opacity(chevron(button))).toBe(1);
    await button.click();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('a phone, from the keyboard', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const key of ['Enter', 'Space'] as const)
    test(`${key} opens the sheet with focus inside, and closing it puts focus back on a visible control`, async ({ page }) => {
      await gotoHub(page, '/home');
      const more = page.getByRole('navigation', { name: 'Quick navigation' }).getByRole('button', { name: 'More', exact: true });
      await more.click();
      await expect(more).toHaveAttribute('aria-expanded', 'true');
      const button = label(page);
      await button.focus();
      await page.keyboard.press(key);
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      const focusOnVisible = () => page.evaluate(() => { const el = document.activeElement as HTMLElement | null; return !!el && el !== document.body && el.checkVisibility(); });
      await expect.poll(focusOnVisible).toBe(true);
    });
});
