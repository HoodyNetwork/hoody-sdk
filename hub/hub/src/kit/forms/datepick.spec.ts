// Playwright: the calendar beside a DateTimeField's date, in a real browser at desktop and phone
// width. It opens inside the screen, takes focus on the chosen day, works by keyboard (arrows, PageDown/PageUp,
// Enter picks and moves focus to the time, Escape returns to the button), has no cell smaller than the touch target
// on a phone, and shows today. Fixture: the kit gallery's "Date and time" panel (first field 2026-10-23 09:30).
import { devices, expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import keys from '../../pages/keys/strings.en.json';

declare const process: { env: Record<string, string | undefined> };

const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const;
// The phone runs as a touch device (coarse pointer, touch events), so the 44 px touch tokens are in force.
const TOUCH = { hasTouch: true, isMobile: true, deviceScaleFactor: devices['Pixel 5'].deviceScaleFactor } as const;

const field = (page: Page) => page.getByRole('group', { name: 'Around a time' });
const calendar = (page: Page) => page.getByRole('dialog', { name: 'Calendar' });

for (const { name, width, height } of SIZES) {
  test.describe(`@datepick ${name} ${width}x${height}`, () => {
    if (name === 'phone') test.use(TOUCH);
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoHub(page, '/_kit?tab=pieces');
      await field(page).scrollIntoViewIfNeeded();
    });

    test('opens inside the screen on the chosen day, with today marked', async ({ page }) => {
      await field(page).getByRole('button', { name: 'Pick a date' }).click();
      await expect(calendar(page)).toBeVisible();
      const box = (await calendar(page).boundingBox())!;
      expect(box.x, 'left edge on screen').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'right edge on screen').toBeLessThanOrEqual(width);
      expect(box.y + box.height, 'bottom edge on screen').toBeLessThanOrEqual(height);
      await expect(page.locator(':focus')).toHaveAccessibleName(/Friday, October 23, 2026/);
      // Every day cell is a full touch target on the phone (44 x 44) and no cell is clipped by the popover or the screen.
      const cells = await calendar(page).getByRole('button', { name: /, 2026/ }).evaluateAll((els) =>
        els.filter((e) => !e.hasAttribute('data-outside-month')).map((e) => e.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number }),
      );
      expect(cells.length).toBeGreaterThanOrEqual(28);
      for (const c of cells) {
        expect(c.height).toBeGreaterThanOrEqual(name === 'phone' ? 43.5 : 28);
        if (name === 'phone') expect(c.width).toBeGreaterThanOrEqual(43.5);
        expect(c.x).toBeGreaterThanOrEqual(box.x);
        expect(c.x + c.width).toBeLessThanOrEqual(Math.min(box.x + box.width, width) + 0.5);
      }
      if (process.env.HUB_DTPICK_SHOTS) await page.screenshot({ path: `${process.env.HUB_DTPICK_SHOTS}/open-${name}.png` });
    });

    test('keyboard: arrows move, PageDown/PageUp change the month, Enter picks and focus lands on the time', async ({ page }) => {
      const open = field(page).getByRole('button', { name: 'Pick a date' });
      await open.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator(':focus')).toHaveAccessibleName(/October 23, 2026/);
      await page.keyboard.press('ArrowRight');
      await expect(page.locator(':focus')).toHaveAccessibleName(/October 24, 2026/);
      await page.keyboard.press('PageDown');
      await expect(page.locator(':focus')).toHaveAccessibleName(/November 24, 2026/);
      await page.keyboard.press('PageUp');
      await expect(page.locator(':focus')).toHaveAccessibleName(/October 24, 2026/);
      await page.keyboard.press('Enter');
      await expect(calendar(page)).toBeHidden();
      await expect(field(page).getByRole('textbox', { name: 'Date' })).toHaveValue('2026-10-24');
      await expect(field(page).getByRole('textbox', { name: 'Time' })).toHaveValue('09:30');
      await expect(field(page).getByRole('textbox', { name: 'Time' })).toBeFocused();
    });

    test('a click picks, Escape returns focus to the button and changes nothing', async ({ page }) => {
      const open = field(page).getByRole('button', { name: 'Pick a date' });
      await open.click();
      await page.keyboard.press('Escape');
      await expect(calendar(page)).toBeHidden();
      await expect(open).toBeFocused();
      await expect(field(page).getByRole('textbox', { name: 'Date' })).toHaveValue('2026-10-23');
      await open.click();
      await calendar(page).getByRole('button', { name: /October 27, 2026/ }).click();
      await expect(calendar(page)).toBeHidden();
      await expect(field(page).getByRole('textbox', { name: 'Date' })).toHaveValue('2026-10-27');
      await expect(field(page).getByRole('textbox', { name: 'Time' })).toBeFocused();
    });

    test('today is marked in the current month', async ({ page }) => {
      // The field shows a fixed October 2026; step the date to today, then open: today's cell reads "Today".
      const d = new Date();
      const text = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      await field(page).getByRole('textbox', { name: 'Date' }).fill(text);
      await field(page).getByRole('button', { name: 'Pick a date' }).click();
      await expect(calendar(page).getByRole('button', { name: /^Today, / })).toBeVisible();
    });
  });
}

// The real consumer: the Share drawer's own end date. The popover opens above the drawer, a press in it is not an
// outside press for the drawer (it stays open), and the pick lands in the drawer's field.
for (const { name, width, height } of SIZES) {
  test.describe(`@datepick Share drawer ${name}`, () => {
    if (name === 'phone') test.use(TOUCH);
    test(`@datepick ${name}: inside the Share drawer the calendar opens over it, a pick leaves the drawer open`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      // The drawer's end date starts empty, so its calendar opens on the current month. Pin the clock to the October the pick below names.
      await page.clock.setFixedTime(Date.parse('2026-10-27T12:00:00Z'));
      await gotoHub(page, '/keys/shared', { state: 'shareTextLost' });
      // The phone case is a touch device (coarse pointer), as in the gallery cases.
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(name === 'phone');
      await page.getByRole('button', { name: keys['action.share'], exact: true }).click();
      const drawer = page.getByRole('dialog', { name: /Share/ });
      await drawer.getByText(keys['share.endsPick'], { exact: true }).click();
      const at = drawer.getByRole('group', { name: keys['share.endsAt'] });
      await at.getByRole('button', { name: 'Pick a date' }).click();
      const cal = page.getByRole('dialog', { name: 'Calendar' });
      await expect(cal).toBeVisible();
      // It is the topmost thing at its own centre (not under the drawer), and inside the screen.
      const box = (await cal.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      const top = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('[role=dialog]')?.getAttribute('aria-label'), [box.x + box.width / 2, box.y + box.height / 2]);
      expect(top).toBe('Calendar');
      await cal.getByRole('button', { name: /, October 15, 2026/ }).click();
      await expect(cal).toBeHidden();
      await expect(drawer).toBeVisible();
      await expect(at.getByRole('textbox', { name: 'Date' })).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
      await expect(at.getByRole('textbox', { name: 'Time' })).toBeFocused();
      if (process.env.HUB_DTPICK_SHOTS) {
        await at.getByRole('button', { name: 'Pick a date' }).click();
        await page.screenshot({ path: `${process.env.HUB_DTPICK_SHOTS}/drawer-${name}.png` });
      }
    });
  });
}

// The date-only DateField in a real consumer, the New key drawer's "On a date" end. Typed text is
// the value, the calendar fills it, and the calendar stays inside the screen over the drawer.
for (const { name, width, height } of SIZES) {
  test.describe(`@datepick DateField ${name}`, () => {
    if (name === 'phone') test.use(TOUCH);
    test('New key: Ends on is typed or picked, the calendar opens over the drawer on the chosen day', async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoHub(page, '/keys');
      await page.getByRole('button', { name: keys['action.new'], exact: true }).click();
      const drawer = page.getByRole('dialog');
      await drawer.getByText(keys['nk.endsDate'], { exact: true }).click();
      const input = drawer.getByRole('textbox', { name: keys['nk.endsOn'] });
      await input.fill('2027-03-09');
      await expect(input).toHaveValue('2027-03-09');
      await drawer.getByRole('button', { name: 'Pick a date' }).click();
      const cal = page.getByRole('dialog', { name: 'Calendar' });
      await expect(cal).toBeVisible();
      await expect(page.locator(':focus')).toHaveAccessibleName(/Tuesday, March 9, 2027/);
      const box = (await cal.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      const top = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('[role=dialog]')?.getAttribute('aria-label'), [box.x + box.width / 2, box.y + box.height / 2]);
      expect(top).toBe('Calendar');
      await cal.getByRole('button', { name: /, March 12, 2027/ }).click();
      await expect(cal).toBeHidden();
      await expect(drawer).toBeVisible();
      await expect(input).toHaveValue('2027-03-12');
    });
  });
}
