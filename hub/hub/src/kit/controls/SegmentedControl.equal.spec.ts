// Playwright: a full-width SegmentedControl draws equal cells (within 1 px) or a Select, never
// unequal cells and never nothing. The gallery's "Start" switch has labels of different lengths ("Describe it" with an
// icon, "Start from an idea", "Blank script"). A coarse sweep down from 1440 px finds where it turns into the Select;
// then 1 px steps cross that point going down and coming back up. At each width the control has handled the new size
// before anything is read, and the read retries until it shows one of the two valid drawings: all three segments,
// equal, or the Select named Start with the current choice. The endpoints retry until they show the drawing they must.
// Widths need a real browser.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from '../gallery/kit2.strings.en.json';

const LABELS = [strings['seg.describe'], strings['seg.idea'], strings['seg.blank']];
type Kind = 'segments' | 'select';

/** The Start switch as drawn now, read in one pass: 'segments' or 'select' when valid, else what is wrong. */
async function drawn(page: Page): Promise<string> {
  return page.evaluate(
    ({ name, current }) => {
      const group = [...document.querySelectorAll('[role=radiogroup]')].find((g) => g.getAttribute('aria-label') === name);
      if (group) {
        const ws = [...group.querySelectorAll('button')].map((b) => b.getBoundingClientRect().width);
        if (ws.length !== 3 || ws.some((w) => !Number.isFinite(w) || w <= 0)) return `segments with cells ${ws.join(' / ') || 'none'}`;
        const spread = Math.max(...ws) - Math.min(...ws);
        return spread <= 1 ? 'segments' : `unequal cells ${ws.map((w) => w.toFixed(1)).join(' / ')}`;
      }
      // The Select stands in the same box (the fit wrapper) as the segments did: the only button there is its trigger.
      const boxes = [...document.querySelectorAll('[class*="SegmentedControl-module__fit"]')];
      const triggers = boxes.flatMap((b) => [...b.querySelectorAll('button')]);
      if (triggers.length !== 1) return `neither segments nor a Select (${triggers.length} buttons in the box)`;
      const t = triggers[0] as HTMLElement;
      if (!t.checkVisibility()) return 'a hidden Select';
      if (!(t.textContent ?? '').includes(current)) return `a Select showing "${t.textContent}"`;
      return 'select';
    },
    { name: strings['seg.start'], current: strings['seg.describe'] },
  );
}

/**
 * Sizes the page and waits until the control has handled the new size: an observer of the control's own box, added
 * after the control's, runs after it in the same delivery, and two frames later React has drawn what the control
 * chose. Then waits for a valid drawing (or the one given) and returns it.
 */
async function at(page: Page, w: number, must?: Kind): Promise<Kind> {
  await page.setViewportSize({ width: w, height: 900 });
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(w);
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const box = document.querySelector('[class*="SegmentedControl-module__fit"]');
        if (!box) return done();
        const ro = new ResizeObserver(() => {
          ro.disconnect();
          requestAnimationFrame(() => requestAnimationFrame(() => done()));
        });
        ro.observe(box);
      }),
  );
  let kind: Kind = 'segments';
  await expect
    .poll(async () => {
      const d = await drawn(page);
      if (d !== 'segments' && d !== 'select') return `${w}px: ${d}`;
      kind = d;
      return must && d !== must ? `${w}px: ${d}, waiting for ${must}` : 'ok';
    })
    .toBe('ok');
  return kind;
}

for (const theme of ['light', 'dark'] as const) {
  test(`the full-width Start switch keeps equal cells at every width, or shows the Select (${theme})`, async ({ page }) => {
    // About 110 widths, each a resize and a retried read.
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHub(page, '/_kit?tab=nav', { theme });
    await page.getByRole('heading', { name: strings['sec.segmented'] }).waitFor();
    await at(page, 1440, 'segments');
    let edge = 0;
    for (let w = 1420; w >= 360; w -= 20) {
      if ((await at(page, w)) === 'select' && !edge) edge = w;
    }
    await at(page, 360, 'select');
    expect(edge, 'the sweep found where the Select takes over').toBeGreaterThan(0);
    // The Select is the same choice: named Start, offering the three options.
    const trigger = page.locator('[class*="SegmentedControl-module__fit"]').getByRole('button');
    await expect(trigger).toHaveAccessibleName(new RegExp(strings['seg.start']));
    await trigger.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option')).toHaveText(LABELS.map((l) => new RegExp(l)));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    // Every pixel across the switch point, down and back up; segments come back above it.
    for (let w = edge + 24; w >= edge - 4; w--) await at(page, w);
    for (let w = edge - 4; w <= edge + 24; w++) await at(page, w);
    await at(page, edge + 24, 'segments');
  });
}
