// Playwright: a disabled control that says why, in a real browser, in each theme with each pointer. Enter in a
// form's input is the browser's own implicit submission, which no jsdom test has; a soft-disabled submit button must block it
// the way a disabled one does. The reason shows beside the control and goes away again; a link goes nowhere; a trigger opens nothing.
import { expect, test, type Locator } from '@playwright/test';
import { gotoHub } from '@app/e2e';

// Playwright counts aria-disabled as disabled and will not click or tap it; `force` sends the same pointer events a person's
// press does, which is the point: the control must take them and do nothing. `force` also skips the check that nothing covers
// the control, so `landsOn` makes it first: the press point must hit the control itself.
const landsOn = async (control: Locator) => {
  // Where the press goes: Playwright scrolls a control into view before it presses, and elementFromPoint sees only the viewport.
  // The mouse leaves the last control first, as a hand would (a reason shown by hover sits below its control, over the next
  // row). A neighbour's reason may still be playing its exit over it; one that stays over it fails.
  await control.page().mouse.move(0, 0);
  await control.scrollIntoViewIfNeeded();
  const hit = () =>
    control.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return at && el.contains(at) ? 'the control' : (at?.outerHTML.slice(0, 120) ?? 'nothing');
    });
  await expect.poll(hit, { message: 'the press lands on the control itself' }).toBe('the control');
};

for (const theme of ['light', 'dark'] as const)
  for (const pointer of ['fine', 'coarse'] as const)
    test.describe(`soft-disabled: ${theme}, ${pointer} pointer`, () => {
      if (pointer === 'coarse') test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

      test.beforeEach(async ({ page }) => {
        await gotoHub(page, '/_kit?tab=controls', { theme });
        await page.locator('[data-soft-trigger]').waitFor();
      });

      test('Enter in the input sends a form with an enabled submit button, and no other', async ({ page }) => {
        const sent = (name: string) => page.locator(`[data-soft-form="${name}"]`).getAttribute('data-sent');
        await page.locator('[data-soft-form="enabled"] input').focus();
        await page.keyboard.press('Enter');
        await expect.poll(() => sent('enabled'), 'the enabled form proves the path works here').toBe('1');
        let enabled = 1;
        for (const name of ['button', 'icon', 'text']) {
          const form = page.locator(`[data-soft-form="${name}"]`);
          const none = async (path: string) => expect(await sent(name), `${name}, ${path}: nothing sent`).toBe('0');
          await form.locator('input').focus();
          await page.keyboard.press('Enter');
          await none('Enter in the input');
          const btn = form.locator('button');
          await btn.focus();
          await page.keyboard.press('Enter');
          await none('Enter on the button');
          await page.keyboard.press('Space');
          await none('Space on the button');
          await landsOn(btn);
          await btn.click({ force: true });
          await none('a click');
          // The enabled form sends once more after every press above was handled, so nothing is still on its way.
          await page.locator('[data-soft-form="enabled"] input').focus();
          await page.keyboard.press('Enter');
          await expect.poll(() => sent('enabled')).toBe(String(++enabled));
          expect(await sent(name), `${name}: nothing sent, by any path`).toBe('0');
        }
      });

      test('the reason shows under the control and goes away', async ({ page }) => {
        const btn = page.locator('[data-soft-tip]');
        // The one showing now: a neighbour's may still be playing its exit. Gone means no tooltip at all, exits included.
        const tip = page.locator('[role="tooltip"]:not([data-exiting])');
        const gone = () => expect(page.getByRole('tooltip')).toHaveCount(0);
        if (pointer === 'fine') await btn.hover();
        else {
          await landsOn(btn);
          await btn.tap({ force: true });
        }
        await expect(tip).toBeVisible();
        const b = (await btn.boundingBox())!;
        const t = (await tip.boundingBox())!;
        expect(Math.abs(t.y - (b.y + b.height)), 'the reason sits just under the control').toBeLessThan(16);
        expect(await btn.getAttribute('aria-disabled')).toBe('true');
        if (pointer === 'fine') {
          await page.mouse.move(0, 0);
          await gone();
          await btn.focus();
          await page.keyboard.press('Shift+Tab');
          await page.keyboard.press('Tab');
          await expect(tip).toBeVisible();
          await page.keyboard.press('Escape');
          await gone();
          expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-soft-tip'))).toBe(true);
          // IconButton's own tooltip, which carries the reason, goes the same way.
          const icon = page.locator('[data-soft-form="icon"] button');
          await page.locator('[data-soft-form="icon"] input').focus();
          await page.keyboard.press('Tab');
          await expect(icon).toBeFocused();
          const reason = await page.locator(`[id="${await icon.getAttribute('aria-describedby')}"]`).textContent();
          await expect(tip).toContainText(reason!);
          await page.keyboard.press('Escape');
          await gone();
        } else {
          await page.locator('[data-soft-form="enabled"] input').tap();
          await gone();
        }
      });

      test('a soft-disabled link is the same <a>, with no href, and goes nowhere', async ({ page }) => {
        const link = page.locator('[data-soft-link]');
        expect(await link.evaluate((el) => el.tagName)).toBe('A');
        expect(await link.getAttribute('href')).toBeNull();
        const before = page.url();
        await landsOn(link);
        await link.click({ force: true });
        await link.focus();
        await page.keyboard.press('Enter');
        expect(page.url()).toBe(before);
        // The enabled one goes, so the soft one had the same chance to.
        await page.locator('[data-soft-link-on]').click();
        await expect.poll(() => page.url()).toContain('#/account');
      });

      test('a soft-disabled trigger opens nothing', async ({ page }) => {
        const trigger = page.locator('[data-soft-trigger]');
        const soft = page.locator('[data-soft-popover]');
        await landsOn(trigger);
        await trigger.click({ force: true });
        await expect(soft, 'a click opens nothing').toHaveCount(0);
        await trigger.focus();
        await page.keyboard.press('Enter');
        await expect(soft, 'Enter opens nothing').toHaveCount(0);
        await page.keyboard.press('Space');
        await expect(soft, 'Space opens nothing').toHaveCount(0);
        // The enabled trigger opens its popover after every press above was handled, so nothing is still on its way.
        await page.locator('[data-soft-trigger-on]').click();
        await expect(page.locator('[data-soft-popover-on]')).toBeVisible();
        await expect(page.locator('[data-soft-popover]')).toHaveCount(0);
      });
    });
