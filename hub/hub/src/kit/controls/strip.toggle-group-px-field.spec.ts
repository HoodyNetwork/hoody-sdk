// Playwright ("40 field family"): every SegmentedControl that is not a folder strip is
// the field strip: a 40 px track (32 px options, 3 px padding, 1 px frame) drawn in the field look, the input fill
// with the field line, as the 40 px search and chips beside it; the thumb, its ink frame and its shadow unchanged.
// Light also checks the literal values (#f8f8f8, #7a7a7a: the field line). A medium and a large control are the same 40 px track;
// on a coarse pointer the track is 44 px and each 32 px option's target still reaches the track's full height.
// Folder strips keep the folder look: kit/controls/folder.tabs.spec.ts.
import { expect, type Locator, type Page } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import aiStrings from '../../pages/ai/strings.en.json';
import kit2 from '../gallery/kit2.strings.en.json';

const LIGHT = { track: 'rgb(248, 248, 248)', line: 'rgb(122, 122, 122)' }; // #7a7a7a (--hx-field-line)

async function token(page: Page, name: string) {
  return page.evaluate((n) => {
    const d = document.createElement('div');
    d.style.color = `var(${n})`;
    document.body.append(d);
    const v = getComputedStyle(d).color;
    d.remove();
    return v;
  }, name);
}

async function box(l: Locator) {
  return l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return { x: r.x, y: r.y, w: r.width, h: Math.round(r.height * 10) / 10, bg: c.backgroundColor, line: c.borderTopColor, pad: c.paddingTop };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`a toggle group is the 40 px field strip with 32 px options (${theme})`, async ({ hubPage: page }) => {
    await gotoHub(page, '/ai/models', { theme });
    await expect(page.locator('html')).toHaveAttribute('data-hx-theme', theme);
    const group = page.getByRole('radiogroup', { name: aiStrings['spend.period'] });
    await group.waitFor({ timeout: 15_000 });
    const t = await box(group);
    expect([t.h, t.pad], 'track: 40 px, 3 px padding').toEqual([40, '3px']);
    for (const o of await group.getByRole('radio').all()) expect((await box(o)).h, 'every option 32 px').toBe(32);
    expect(t.bg, 'track fill: the field fill').toBe(await token(page, '--hx-field-bg'));
    expect(t.line, 'track line: the field line').toBe(await token(page, '--hx-field-line'));
    if (theme === 'light') expect([t.bg, t.line], 'light literals').toEqual([LIGHT.track, LIGHT.line]);
    const cur = await box(group.getByRole('radio', { checked: true }));
    expect(cur.bg, 'the chosen option keeps the thumb').toBe(await token(page, '--hx-tog-thumb'));
    expect(cur.bg, 'the thumb stands apart from the track').not.toBe(t.bg);
  });
}

test('a medium and a large toggle group are the same 40 px field strip with 32 px options', async ({ hubPage: page }) => {
  await gotoHub(page, '/_kit?tab=nav', { theme: 'light' });
  for (const name of [kit2['seg.pay'], kit2['seg.start']]) {
    const g = page.getByRole('radiogroup', { name, exact: true });
    await g.waitFor({ timeout: 15_000 });
    expect((await box(g)).h, `${name}: track 40`).toBe(40);
    for (const o of await g.getByRole('radio').all()) expect((await box(o)).h, `${name}: option 32`).toBe(32);
  }
});

test('on a coarse pointer the field strip is 44 px and each option is a full-height target', async ({ hubPageCoarse: page }) => {
  await gotoHub(page, '/_kit?tab=nav', { theme: 'light' });
  const g = page.getByRole('radiogroup', { name: kit2['seg.pay'], exact: true });
  await g.waitFor({ timeout: 15_000 });
  const t = await box(g);
  expect(t.h, 'coarse track: 44').toBe(44);
  const radios = await g.getByRole('radio').all();
  for (const r of radios) {
    const o = await box(r);
    expect(o.h, 'coarse option: 32 drawn').toBe(32);
    // The track's top and bottom rows hit this option (its target reaches over the padding and frame).
    for (const y of [t.y + 1, t.y + t.h - 1]) {
      const hit = await page.evaluate(([x, yy]) => document.elementFromPoint(x, yy)?.closest('[role="radio"]')?.textContent ?? null, [o.x + o.w / 2, y] as const);
      expect(hit, 'coarse: the track edge row reaches the option under it').toBe(await r.textContent());
    }
  }
});

// Forced colours: the shadow, the thumb fill and the transparent frames are gone, so the field strip
// draws the chosen option in the system's selected colours with an underlined label: told apart by shape as well as
// colour once focus has moved on, with no backplate under the label. A disabled option is GrayText, never the chosen
// look; keyboard focus is an outline. Its own page: forced colours on a borrowed shared page would outlive the test.
test('forced colours: the chosen option of a field strip stays told apart once focus moves on', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  const look = (l: Locator) =>
    l.evaluate((el) => {
      const c = getComputedStyle(el);
      const lab = el.querySelector('span') ?? el;
      return { bg: c.backgroundColor, ink: c.color, line: getComputedStyle(lab).textDecorationLine, adjust: c.forcedColorAdjust, focused: el.contains(document.activeElement) };
    });
  await gotoHub(page, '/ai/models', { theme: 'light' });
  const g = page.getByRole('radiogroup', { name: aiStrings['spend.period'] });
  await g.waitFor({ timeout: 15_000 });
  const others = g.getByRole('radio', { checked: false });
  const pick = others.first();
  const name = await pick.textContent();
  await pick.click();
  await expect(g.getByRole('radio', { checked: true })).toHaveText(name ?? '');
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  const chosen = await look(g.getByRole('radio', { checked: true }));
  const other = await look(g.getByRole('radio', { checked: false }).first()); // any option not chosen: each is drawn alike
  expect.soft(chosen.focused, 'focus has moved off the strip').toBe(false);
  expect.soft(chosen.bg, 'the chosen option has its own fill').not.toBe(other.bg);
  expect.soft(chosen.line, 'the chosen label is underlined').toContain('underline');
  // Chromium draws a Canvas backplate under text in forced colours: SelectedItemText on it would vanish (seen in the
  // browser), so the chosen option draws its own system colours.
  expect.soft(chosen.adjust, 'the chosen option draws its own system colours, no Canvas backplate').toBe('none');
  expect.soft(other.line, 'another option is not underlined').not.toContain('underline');
  // The underline is drawn, not only declared: the chosen option's
  // picture changes when its label's decoration is taken away.
  const chosenBox = g.getByRole('radio', { checked: true });
  const withLine = await chosenBox.screenshot();
  await chosenBox.evaluate((el) => (el.querySelector('span') as HTMLElement).style.setProperty('text-decoration', 'none'));
  const withoutLine = await chosenBox.screenshot();
  await chosenBox.evaluate((el) => (el.querySelector('span') as HTMLElement).style.removeProperty('text-decoration'));
  expect.soft(withLine.equals(withoutLine), 'the underline shows in the drawn option').toBe(false);
  await gotoHub(page, '/_kit?tab=nav', { theme: 'light' });
  const pay = page.getByRole('radiogroup', { name: kit2['seg.pay'], exact: true });
  const off = await look(pay.getByRole('radio', { name: kit2['seg.crypto'] }));
  expect.soft(off.ink, 'a disabled option is told apart from an enabled one').not.toBe(other.ink);
  expect.soft(off.line, 'a disabled option is not underlined').not.toContain('underline');
  const card = pay.getByRole('radio', { name: kit2['seg.card'] });
  await card.focus();
  await page.keyboard.press('Shift');
  const ring = await card.evaluate((el) => ({ style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth), color: getComputedStyle(el).outlineColor }));
  expect.soft([ring.style, ring.width], 'keyboard focus is an outline in forced colours').toEqual(['solid', 2]);
  // The chosen option draws its own colours, so its ring must be a system colour too: CanvasText, as other text.
  expect.soft(ring.color, 'the focus ring on the chosen option is CanvasText').toBe(other.ink);
  expect(test.info().errors).toEqual([]);
});
