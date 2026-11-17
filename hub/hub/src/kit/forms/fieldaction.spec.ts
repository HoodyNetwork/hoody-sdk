// Playwright: a TextField's action in a real layout engine, on the kit
// gallery (`/_kit?tab=secure&part=fields`). At 1440 and 390 the action sits beside the box: its top is the box's top
// (±1 px) and its height is --ctl-h. In a 300 px space (below the 20rem wrap rule) it wraps under the box at the box's
// full width, and the rule switches at 20rem itself (319.9 px wraps; 320 and 321 do not). A boxed
// (prefix) field keeps the action at the box's top; a width variant keeps its width; a field with an action keeps its
// own width as an auto flex item and in an auto grid track; Enter in the field submits its form and never clicks the
// action.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

type Box = { x: number; y: number; w: number; h: number };

async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error('not drawn');
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

/** The sample's input and its action button, inside `scope`. */
const parts = (scope: Locator, button: string, label = 'Referral code') => {
  const input = scope.getByRole('textbox', { name: label });
  return { input, button: scope.getByRole('button', { name: button }) };
};

const ctlH = (page: Page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ctl-h')));

for (const width of [1440, 390]) {
  test(`at ${width} the action sits beside the box, top to top, --ctl-h tall`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/_kit?tab=secure&part=fields');
    // The field root is the input's nearest ancestor that holds the label.
    const field = page.getByTestId('field-action-wide').getByRole('textbox', { name: 'Referral code' }).locator('xpath=ancestor::*[./label][1]');
    const { input, button } = parts(field, 'Create');
    const i = await box(input);
    const b = await box(button);
    expect(Math.abs(b.y - i.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.h - (await ctlH(page)))).toBeLessThanOrEqual(0.5);
    // Both edges line up with the box's: the button is never shorter than the field beside it (seen on New note).
    expect(Math.abs(b.y + b.h - (i.y + i.h))).toBeLessThanOrEqual(1);
    expect(b.x).toBeGreaterThanOrEqual(i.x + i.w);
    // Label above both, description below both.
    const label = await box(field.locator('label'));
    const help = await box(field.getByText('Letters, digits and dashes.'));
    expect(label.y + label.h).toBeLessThanOrEqual(Math.min(i.y, b.y) + 0.5);
    expect(help.y).toBeGreaterThanOrEqual(Math.max(i.y + i.h, b.y + b.h) - 0.5);
  });
}

for (const id of ['field-action-narrow', 'field-action-narrow-reason']) {
  test(`in a 300 px space the action wraps under the box at full width (${id})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHub(page, '/_kit?tab=secure&part=fields');
    const narrow = page.getByTestId(id);
    expect(Math.round((await box(narrow)).w)).toBe(300);
    const { input, button } = parts(narrow, 'Create');
    const i = await box(input);
    const b = await box(button);
    expect(b.y).toBeGreaterThanOrEqual(i.y + i.h);
    expect(Math.abs(b.x - i.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.w - i.w)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.h - (await ctlH(page)))).toBeLessThanOrEqual(0.5);
  });
}

// The rule switches at 20rem itself (320 px at the 16 px root), fractional widths included, not some
// way under it.
for (const [px, wraps] of [[319.9, true], [320, false], [321, false]] as const) {
  test(`at ${px} px the action ${wraps ? 'wraps under the box' : 'stays beside the box'}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHub(page, '/_kit?tab=secure&part=fields');
    const narrow = page.getByTestId('field-action-narrow');
    await narrow.evaluate((el, w) => { (el as HTMLElement).style.inlineSize = `${w}px`; }, px);
    expect(Math.abs((await box(narrow)).w - px)).toBeLessThanOrEqual(0.05);
    const { input, button } = parts(narrow, 'Create');
    const i = await box(input);
    const b = await box(button);
    if (wraps) {
      expect(b.y).toBeGreaterThanOrEqual(i.y + i.h);
      expect(Math.abs(b.w - i.w)).toBeLessThanOrEqual(1);
    } else {
      expect(Math.abs(b.y - i.y)).toBeLessThanOrEqual(1);
      expect(b.x).toBeGreaterThanOrEqual(i.x + i.w);
    }
  });
}

test('a boxed field (prefix) keeps the action at the top of its box, --ctl-h tall', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/_kit?tab=secure&part=fields');
  const { input, button } = parts(page.getByTestId('field-action-boxed'), 'Check', 'Address');
  const frame = await box(input.locator('xpath=..'));
  const b = await box(button);
  expect(Math.abs(b.y - frame.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(b.h - frame.h)).toBeLessThanOrEqual(1);
  expect(Math.abs(b.h - (await ctlH(page)))).toBeLessThanOrEqual(0.5);
  expect(b.x).toBeGreaterThanOrEqual(frame.x + frame.w);
});

test('a width variant keeps its width with an action', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/_kit?tab=secure&part=fields');
  const lg = page.getByTestId('field-action-lg');
  const field = lg.getByRole('textbox', { name: 'Referral code' }).locator('xpath=ancestor::*[./label][1]');
  const want = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.inlineSize = 'var(--field-w-lg)';
    document.body.append(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return w;
  });
  expect(Math.abs((await box(field)).w - want)).toBeLessThanOrEqual(1);
});

for (const id of ['field-action-flex-auto', 'field-action-grid-auto']) {
  test(`with no width set, the field keeps the box and the action on one line (${id})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHub(page, '/_kit?tab=secure&part=fields');
    const { input, button } = parts(page.getByTestId(id), 'Create');
    const i = await box(input);
    const b = await box(button);
    // Not collapsed: the box keeps a usable width and the action sits beside it.
    expect(i.w).toBeGreaterThanOrEqual(120);
    expect(Math.abs(b.y - i.y)).toBeLessThanOrEqual(1);
    expect(b.x).toBeGreaterThanOrEqual(i.x + i.w);
  });
}

test('Enter in the field submits its form and never clicks the action', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/_kit?tab=secure&part=fields');
  const { input, button } = parts(page.getByTestId('field-action-wide'), 'Create');
  // A plain form around the sample's field: implicit submission is the browser's own.
  await input.evaluate((el) => {
    const field = el.parentElement!.parentElement!; // input → .control → the field root
    const form = document.createElement('form');
    const w = window as unknown as { submits: number; clicks: number };
    w.submits = 0;
    w.clicks = 0;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      w.submits += 1;
    });
    field.parentElement!.insertBefore(form, field);
    form.append(field);
  });
  await button.evaluate((el) => el.addEventListener('click', () => ((window as unknown as { clicks: number }).clicks += 1)));
  await input.focus();
  await page.keyboard.press('Enter');
  const counts = await page.evaluate(() => {
    const w = window as unknown as { submits: number; clicks: number };
    return [w.submits, w.clicks];
  });
  expect(counts).toEqual([1, 0]);
});
