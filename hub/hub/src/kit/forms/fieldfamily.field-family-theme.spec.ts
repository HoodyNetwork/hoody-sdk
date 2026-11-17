// Playwright: the field family in the browser, what the control matrix (controls/controls.matrix.spec.ts) does
// not read. At rest the four fields draw one box (fill, radius, text size, border width and colour); the outline clears
// 3:1 on the field fill in both themes; a Select shows no ring while its menu is open and has it again, closed, with keyboard
// focus; the sizes a composer sets over the box (a multiline field, an OTP cell) hold, in both pointers.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const FIELDS: [string, string][] = [
  ['textField', 'input'],
  ['searchField', 'input'],
  ['select', 'button'],
  ['numberField', '[role="group"]'],
];
const cellSel = (density: string, control: string, sel: string) => `[data-spec-density="${density}"] [data-cell="${control}.md.rest.height"] ${sel}`;

/** What the box sets, as computed. */
const boxLook = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => {
    const c = getComputedStyle(el);
    return {
      fill: c.backgroundColor,
      radius: c.borderTopLeftRadius,
      size: c.fontSize,
      lineWidth: c.borderTopWidth,
      lineStyle: c.borderTopStyle,
      line: c.borderTopColor,
      height: c.height,
    };
  });

/** A colour read through a canvas: [r, g, b, a], whatever form the browser computed it in. */
const rgba = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('div');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = getComputedStyle(probe).color;
    ctx.fillRect(0, 0, 1, 1);
    probe.remove();
    return [...ctx.getImageData(0, 0, 1, 1).data];
  }, token);
const lum = (c: number[]) => {
  const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
};
/** A translucent line over the field's own fill, against what lies beside it, as a contrast ratio. */
const ratio = (line: number[], fill: number[], beside: number[]) => {
  const a = line[3]! / 255;
  const over = [0, 1, 2].map((i) => line[i]! * a + fill[i]! * (1 - a));
  const [hi, lo] = [lum(over), lum(beside)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

for (const theme of ['light', 'dark'] as const) {
  test.describe(`field family: ${theme}`, () => {
    test('the four fields draw one box at rest, at both densities', async ({ page }) => {
      await gotoHub(page, '/_kit?tab=controls', { theme });
      for (const density of ['default', 'compact']) {
        const reference = await boxLook(page, cellSel(density, 'textField', 'input'));
        for (const [control, sel] of FIELDS) {
          expect(await boxLook(page, cellSel(density, control, sel)), `${density} ${control}`).toEqual(reference);
        }
      }
    });

    // A border is drawn over its element's own fill, so the line's colour is fixed by --field-bg; what changes is what lies beside it.
    for (const surface of ['--field-bg', '--hx-bg', '--hx-card', '--hx-raised', '--hx-fill', '--hx-sidebar', '--pop-bg', '--bar-bg', '--card-head', '--card-body'])
      test(`the outline is at least 3:1 beside ${surface}`, async ({ page }) => {
        await gotoHub(page, '/_kit?tab=controls', { theme });
        const got = ratio(await rgba(page, '--ctl-line-field'), await rgba(page, '--field-bg'), await rgba(page, surface));
        expect(got).toBeGreaterThanOrEqual(3);
      });

    test('a Select has no ring with its menu open, and has it again closed with keyboard focus', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await gotoHub(page, '/_kit?tab=controls', { theme });
      const trigger = page.locator('[data-spec-density="default"] [data-cell="select.md.rest.height"] button');
      const shadow = () => trigger.evaluate((el) => getComputedStyle(el).boxShadow);
      await page.keyboard.press('Tab');
      await trigger.focus();
      await expect.poll(shadow, 'closed with keyboard focus').not.toBe('none');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('listbox')).toBeVisible();
      await expect.poll(shadow, 'open').toBe('none');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox')).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect.poll(shadow, 'closed again').not.toBe('none');
    });

    test('a mouse press on a Select draws no ring', async ({ page }) => {
      await gotoHub(page, '/_kit?tab=controls', { theme });
      const trigger = page.locator('[data-spec-density="default"] [data-cell="select.md.rest.height"] button');
      // page.mouse does not scroll: bring the cell into view first, or the press lands outside the trigger.
      await trigger.scrollIntoViewIfNeeded();
      const at = (await trigger.boundingBox())!;
      await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      await page.mouse.down();
      // While the button is still down: no ring during the press itself.
      expect(await trigger.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none');
      await page.mouse.up();
      await expect(page.getByRole('listbox')).toBeVisible();
      expect(await trigger.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none');
    });
  });
}

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`what a composer sets over the box: ${pointer}`, () => {
    if (pointer === 'coarse') test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('an OTP cell keeps its own size and text, and takes the outline', async ({ page }) => {
      await gotoHub(page, '/_kit?tab=secure');
      // The first cell of the empty OTP (not the error or the disabled one).
      const cell = page.locator('input[autocomplete="one-time-code"]').first().locator('xpath=preceding-sibling::span[1]');
      const got = await cell.evaluate((el) => {
        const c = getComputedStyle(el);
        const probe = document.createElement('div');
        probe.style.cssText = 'height: var(--field-otp-h); width: var(--field-otp-w); font-size: var(--fs-xl); border-top: 1px solid var(--ctl-line-field)';
        document.body.append(probe);
        const p = getComputedStyle(probe);
        const want = { h: p.height, w: p.width, size: p.fontSize, line: p.borderTopColor };
        const read = { h: c.height, w: c.width, size: c.fontSize, line: c.borderTopColor };
        probe.remove();
        return { read, want };
      });
      expect(got.read).toEqual(got.want);
      expect(got.read.h).toBe('44px');
    });

    test('a multiline field grows past the box height', async ({ page }) => {
      await gotoHub(page, '/_kit?tab=forms');
      const area = page.locator('textarea').first();
      const box = await area.evaluate((el) => el.getBoundingClientRect().height);
      expect(box).toBeGreaterThan(44);
      const min = await area.evaluate((el) => getComputedStyle(el).minHeight);
      expect(min).toBe('80px');
    });
  });
}
