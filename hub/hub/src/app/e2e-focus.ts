// Playwright helper for focus rings (kit/tokens.css Focus): the colour of a control's ring gap as a keyboard user sees it.
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Tabs to the control as a keyboard user would (an open overlay keeps focus inside and wraps, so Tab gets there; one
 * opened by a click may have focused it already without focus-visible) and returns the colour of its focus ring's
 * inner ring (the gap), once the shadow's transition has run.
 */
export async function focusRingGap(page: Page, control: Locator): Promise<string> {
  const there = () => control.evaluate((el) => el === document.activeElement && el.hasAttribute('data-focus-visible'));
  for (let i = 0; i < 60 && !(await there()); i++) await page.keyboard.press('Tab');
  await expect(control).toHaveAttribute('data-focus-visible');
  return control.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined)));
    const first = getComputedStyle(el).boxShadow.split(/,(?![^(]*\))/)[0] ?? '';
    return first.match(/rgba?\([^)]*\)/)?.[0] ?? `no ring: ${getComputedStyle(el).boxShadow}`;
  });
}
