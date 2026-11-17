// Playwright (:429): the kit's two busy spinners (Spinner and a busy Button) hold still when the person asks for
// reduced motion. Their dots stop pulsing and sit at stepped shades, so busy still reads as busy; with motion
// welcome they pulse as before. The CSS-wide guard is kit/motion.test.ts.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

// reason: dev CSS-module names are <file>-module__<class>_<hash5>; the trailing '_' keeps spinnerDot out
const SPINNERS = { Spinner: '[class*="States-module__spinner_"]', 'busy Button': '[class*="Button-module__spinner_"]' };

/** For one spinner: its looping animations still running (pseudo-elements included) and its three dots' opacity and
 * whether each is painted (generated, shown, visible, with a size), in DOM order (Button: ::before, the dot, ::after;
 * Spinner: its three dots). */
async function spinnerState(page: Page, sel: string) {
  return page.locator(sel).first().evaluate((el) => {
    const running = el
      .getAnimations({ subtree: true })
      .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length;
    const parts: { opacity: number; painted: boolean }[] = [];
    const read = (cs: CSSStyleDeclaration, pseudo = false) => ({
      opacity: Number(cs.opacity),
      painted:
        (!pseudo || (cs.content !== 'none' && cs.content !== 'normal')) &&
        cs.display !== 'none' &&
        cs.visibility === 'visible' &&
        parseFloat(cs.width) > 0 &&
        parseFloat(cs.height) > 0,
    });
    const dots = [...el.children];
    if (dots.length === 3) for (const d of dots) parts.push(read(getComputedStyle(d)));
    else if (dots[0]) parts.push(read(getComputedStyle(el, '::before'), true), read(getComputedStyle(dots[0])), read(getComputedStyle(el, '::after'), true));
    return { running, parts };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`with reduced motion (${theme}) both kit spinners stop and keep three stepped dots (429)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoHub(page, '/_kit?tab=states', { theme });
    await expect(page.locator('html')).toHaveAttribute('data-hx-theme', theme);
    for (const [name, sel] of Object.entries(SPINNERS)) {
      await expect(page.locator(sel).first(), `${name} is shown`).toBeVisible();
      const st = await spinnerState(page, sel);
      expect(st.running, `${name}: no looping animation runs`).toBe(0);
      expect(st.parts.map((p) => p.opacity), `${name}: dots at stepped shades`).toEqual([1, 0.6, 0.3]);
      expect(st.parts.map((p) => p.painted), `${name}: every dot is painted`).toEqual([true, true, true]);
    }
  });
}

test('with motion welcome both kit spinners still pulse (429)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoHub(page, '/_kit?tab=states');
  for (const [name, sel] of Object.entries(SPINNERS)) {
    await expect(page.locator(sel).first(), `${name} is shown`).toBeVisible();
    expect((await spinnerState(page, sel)).running, `${name}: all three dots pulse`).toBe(3);
  }
});
