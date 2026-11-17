// Playwright: control sizes, the segmented control and Home's suggestions in sentence case, measured as drawn. Sizes: a
// button is 32 px and a small (sm) button 28 px, both with 13 px text; a text field is 40 px; a segmented control is the
// 40 px field strip with the thumb under the current option (its text at 4.5:1 or more, in both themes). Compact
// density changes no control height, and a coarse pointer raises every button with words to 44. Boxes and computed
// styles need a real browser, not jsdom.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/strings.en.json';
import homeStrings from '../../pages/home/strings.en.json';
import aiStrings from '../../pages/ai/strings.en.json';

async function box(page: Page, sel: ReturnType<Page['locator']>) {
  await sel.waitFor({ timeout: 15_000 });
  return sel.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return { h: Math.round(r.height * 10) / 10, fs: parseFloat(c.fontSize), tt: c.textTransform };
  });
}

test.describe('sizes on a fine pointer at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a button is 32 px, a small button 28 px, all with 13 px text', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=actions');
    const primary = await box(page, page.getByRole('button', { name: gallery['btn.primary'], exact: true }));
    const secondary = await box(page, page.getByRole('button', { name: gallery['btn.secondary'], exact: true }));
    const small = await box(page, page.getByRole('button', { name: gallery['btn.small'], exact: true }));
    expect([primary.h, secondary.h, small.h]).toEqual([32, 32, 28]);
    expect([primary.fs, secondary.fs, small.fs]).toEqual([13, 13, 13]);
  });

  test('a text field is 40 px tall', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=forms');
    const field = await box(page, page.getByRole('textbox', { name: gallery['f.name'] }));
    expect(field.h).toBe(40);
  });

  // The segmented control is the 40 px field strip (32 px thumb, 3 px padding, 1 px frame), a field's height.
  test('the small segmented control (AI > Spending period) is a 40 px track', async ({ page }) => {
    await gotoHub(page, '/ai/models');
    const group = await box(page, page.getByRole('radiogroup', { name: aiStrings['spend.period'] }));
    expect(group.h).toBe(40);
  });
});

test.describe('compact density never changes a control height', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // A button's height is its own token (--btn-h), never the field height a density could move.
  test('a default button under data-density="compact" stays 32 px', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=actions');
    const btn = page.getByRole('button', { name: gallery['btn.secondary'], exact: true });
    await btn.waitFor();
    const h = await btn.evaluate((el) => {
      el.parentElement?.setAttribute('data-density', 'compact');
      return el.getBoundingClientRect().height;
    });
    expect(h).toBe(32);
  });

  // A small button keeps its 28 px in compact, primary or secondary: density never changes a control height. A dense
  // row that needs a smaller control asks for xs.
  test('a small button under data-density="compact" keeps its 28 px, primary or secondary', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=actions');
    const heights: number[] = [];
    for (const name of [gallery['btn.smallPrimary'], gallery['btn.small']]) {
      const btn = page.getByRole('button', { name, exact: true }).first(); // reason: the actions tab may repeat a name; the Buttons panel's comes first
      await btn.waitFor();
      heights.push(
        await btn.evaluate((el) => {
          el.parentElement?.setAttribute('data-density', 'compact');
          return el.getBoundingClientRect().height;
        }),
      );
    }
    expect(heights).toEqual([28, 28]);
  });
});

test.describe('touch keeps 44 px', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: true });

  // Every button with words reaches --touch-min (44 px) on a coarse pointer, small (sm) included; a fine pointer keeps
  // the sizes above (sm 28 px).
  test('a default button and a small one both reach 44 px on a coarse pointer', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=actions');
    const secondary = await box(page, page.getByRole('button', { name: gallery['btn.secondary'], exact: true }));
    const small = await box(page, page.getByRole('button', { name: gallery['btn.small'], exact: true }));
    expect(secondary.h).toBeGreaterThanOrEqual(44);
    expect(small.h).toBeGreaterThanOrEqual(44);
  });
});

/** The current segment's fill and its text's contrast on that fill. */
async function current(page: Page, name: string) {
  const radio = page.getByRole('radiogroup', { name }).getByRole('radio', { checked: true });
  await radio.waitFor({ timeout: 15_000 });
  return radio.evaluate((el) => {
    const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r = 0, g = 0, b = 0]: number[]) => {
      const f = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const c = getComputedStyle(el);
    const bg = rgb(c.backgroundColor);
    const fg = rgb(c.color);
    const [hi, lo] = [lum(bg), lum(fg)].sort((a, b) => b - a);
    return { bg: bg.join(','), ratio: Math.round(((hi! + 0.05) / (lo! + 0.05)) * 100) / 100, greenest: fg[1]! > fg[0]! && fg[1]! > fg[2]! };
  });
}

for (const theme of ['light', 'dark'] as const) {
  // The current period is the white thumb (light), never the lime, its text at 4.5:1.
  test(`AI > Spending: the current period is the thumb with its text at 4.5:1 (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHub(page, '/ai/models', { theme });
    const cur = await current(page, aiStrings['spend.period']);
    if (theme === 'light') expect(cur.bg).toBe('255,255,255');
    expect(cur.bg).not.toBe('23,246,176');
    expect(cur.ratio).toBeGreaterThanOrEqual(4.5);
  });
}

test('Home: the suggestions under the Ask field are in sentence case, not capitals', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/');
  const chips = page.getByRole('list', { name: homeStrings['ask.chips'] }).getByRole('button');
  await expect(chips).not.toHaveCount(0, { timeout: 15_000 });
  const transforms = await chips.evaluateAll((els) => els.map((e) => getComputedStyle(e).textTransform));
  expect(transforms.length).toBeGreaterThan(0);
  for (const t of transforms) expect(t).toBe('none');
});
