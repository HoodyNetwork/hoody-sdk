// Playwright: on a coarse pointer every Home control takes touches over 44px of height, including lg buttons, text
// links and the cards other pages contribute. It measures the real hit area (what a touch lands on, 21px above and
// below the centre), so an invisible hit layer counts and a clipped or covered one does not.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

// The pages the dev server serves (scripts/check.ts passes the same HUB_PAGE to Vite and to Playwright): a home-only
// server has no other page, so no contributed cards (Bots, Notifications) to wait for; Home's own controls are still
// all measured. Unset means the whole Hub.
const HOME_ONLY = process.env.HUB_PAGE === 'home';

for (const [state, path] of [
  ['newAccount', '/home?intro=1'],
  [undefined, '/home'],
  ['attention', '/home'],
  ['pickOne', '/home'],
] as const) {
  test(`Home controls are 44px touch targets (${state ?? 'default'})`, async ({ page }) => {
    await gotoHub(page, path, state ? { state } : {});
    await page.locator('#hub-main [data-flow]').waitFor();
    // The grid is there while Home still loads: wait for one of Home's own controls in this state (the welcome's Hide
    // for a new account, the Ask box's submit otherwise), so a half-loaded page cannot pass with nothing to measure.
    const ownControl = state === 'newAccount' ? strings['intro.hideLabel'] : strings['ask.submit'];
    await expect(page.locator('[data-flow]').getByRole('button', { name: ownControl, exact: true })).toBeVisible();
    // The other pages' cards load lazily: measure only once they are in, or a fast run checks Home's own cards only.
    await page.waitForLoadState('networkidle');
    for (const card of HOME_ONLY ? [] : ['Bots', 'Notifications']) {
      await expect(page.locator('[data-flow]').getByRole('heading', { name: card, exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const { measured, small } = await page.evaluate(() => {
      // Every control in Home's cards (its own and the ones other pages contribute) and its header buttons. The kit's
      // ContextLine links are the kit's.
      const shown = [...document.querySelectorAll<HTMLElement>('[data-flow] a[href], [data-flow] button, [data-flow] input, [data-home-header] button')]
        .filter((el) => el.getClientRects().length > 0);
      for (const el of shown) el.setAttribute('data-touch-measured', ''); // reason: the named-controls check below reads it
      const checked = shown
        .map((el) => {
          el.scrollIntoView({ block: 'center', behavior: 'instant' });
          const r = el.getBoundingClientRect();
          const y = r.top + r.height / 2;
          // Near both ends and in the middle, so a neighbour's target overlapping one end shows too.
          const xs = [r.left + 2, r.left + r.width / 2, r.right - 2];
          const takes = (dy: number) =>
            xs.every((x) => {
              const t = document.elementFromPoint(x, y + dy);
              return !!t && (t === el || el.contains(t));
            });
          return { name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40), h: Math.round(r.height), above: takes(-21), below: takes(21) };
        })
        .filter((c) => !c.above || !c.below);
      return { measured: shown.length, small: checked };
    });
    // Home alone shows 10 controls for a new account and 16 otherwise; the whole Hub adds the other pages' cards.
    expect(measured, 'controls measured').toBeGreaterThanOrEqual(HOME_ONLY ? 8 : 25);
    // A floor still lets some controls slip past the selector. Home's own named controls, found by role here and not
    // by that selector, must each have been measured: the state's own control and every Ask chip (the welcome a new
    // account sees has no Ask chips).
    const flow = page.locator('[data-flow]');
    const chips = await flow.getByRole('list', { name: strings['ask.chips'] }).getByRole('button').all();
    expect(chips.length, 'Ask chips shown').toBeGreaterThanOrEqual(state === 'newAccount' ? 0 : 4);
    for (const control of [flow.getByRole('button', { name: ownControl, exact: true }), ...chips]) {
      await expect(control).toHaveAttribute('data-touch-measured', '');
    }
    expect(small).toEqual([]);
  });
}
