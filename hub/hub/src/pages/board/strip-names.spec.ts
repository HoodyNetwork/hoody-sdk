// The Board strip's controls at every width: each shows its icon, its
// words or both, never a key cap (keys are in tooltips and aria-keyshortcuts) and never an empty box. Add a program keeps
// a word at every step (its words, then "Add"). The accessible names stay. On a phone the strip row is not drawn (the
// Board menu starts the chips).
// The strip steps down by the room its row has (Strip.tsx), so the widths here are found by the
// step the row reports (data-strip-step), never assumed.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

interface Face { icon: boolean; words: boolean; key: boolean }

/** What a control shows, whichever kit part draws it: an icon (not the chip's glyph), words, a key cap. Each counts only
 *  with a real box that its button does not clip (a shrunk button clips what its label holds). */
const face = (control: Locator) => control.evaluate((el): Face => {
  const box = el.getBoundingClientRect();
  const shown = (n: Element) => {
    const r = n.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2 || r.right > box.right + 1) return false;
    for (let a: Element | null = n.parentElement; a && a !== el; a = a.parentElement) {
      if (getComputedStyle(a).overflow !== 'visible' && r.right > a.getBoundingClientRect().right + 1) return false;
    }
    return true;
  };
  const chip = (n: Element) => !!n.closest('[data-chip-cell], [data-chip-sep]');
  const icon = [...el.querySelectorAll('svg')].some((n) => !chip(n) && shown(n));
  const key = [...el.querySelectorAll('kbd')].some(shown);
  const words = [...el.querySelectorAll('span')].some((n) => !chip(n) && !n.closest('kbd') && !n.querySelector('svg, kbd, span') && (n.textContent ?? '').trim() !== '' && shown(n) && n.scrollWidth <= n.clientWidth + 1);
  return { icon, words, key };
});

/** Main with a terminal: an empty Board's Add is its welcome's, and the strip has none. */
async function oneTile(page: Page, theme: 'light' | 'dark') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/board');
  await page.getByRole('button', { name: strings['board.addProgram'] }).first().click(); // reason: the chips row's + (a phone, or a paged Board) has the same name, after the strip's or the empty slot's own
  await page.getByRole('row', { name: /^atlas/ }).click();
  await page.getByRole('row', { name: /^Terminal/ }).click();
  await page.getByRole('row', { name: /^terminal-1/ }).click();
  await expect(page.locator('iframe[title="terminal-1 on atlas"]')).toBeAttached();
  await page.evaluate((t) => { document.documentElement.setAttribute('data-hx-theme', t); }, theme);
  await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
}

const controls = (page: Page) => [
  page.getByRole('button', { name: strings['board.addProgram'], exact: true }).first(), // reason: the chips row's + (a phone, or a paged Board) has the same name, after the strip's or the empty slot's own
  page.getByRole('button', { name: strings.layout, exact: true }),
  page.getByRole('button', { name: strings.focus, exact: true }),
];


/** An icon, words or both, never nothing, and no key cap. */
const faceOk = (f: Face) => (f.icon || f.words) && !f.key;

/** The step the strip row draws now (Strip.tsx): 0 every word, 1 the note short and Even out gone, 2 Layout and Focus
 *  icons, 3 Add a program as "Add". */
const stepOf = async (page: Page) => Number(await page.locator('[data-strip-step]').getAttribute('data-strip-step'));

/** Narrows the window by 40 px at a time, from where it is, until the strip draws at least `step` (or 620 px is reached). */
async function narrowTo(page: Page, step: number): Promise<number> {
  let w = page.viewportSize()!.width;
  while ((await stepOf(page)) < step && w > 620) {
    w -= 40;
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(50);
  }
  expect(await stepOf(page), `the strip reached step ${step}`).toBeGreaterThanOrEqual(step);
  return w;
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    test(`narrowing from 1440: Add, Layout and Focus show an icon or words at every step, never a key cap (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await oneTile(page, theme);
      for (const w of [1440, 1000, 760, 640]) {
        await page.setViewportSize({ width: w, height: 900 });
        for (const c of controls(page)) {
          await expect(c).toBeVisible({ timeout: 20_000 });
          await expect.poll(async () => faceOk(await face(c)), `${w}`).toBe(true);
        }
      }
      // From step 2 Layout and Focus are their icons; Add a program keeps its plus and a word.
      await narrowTo(page, 2);
      const [add, ...icons] = controls(page) as [Locator, Locator, Locator];
      for (const c of icons) await expect.poll(() => face(c)).toEqual({ icon: true, words: false, key: false });
      await expect.poll(() => face(add)).toEqual({ icon: true, words: true, key: false });
      await page.mouse.move(2, 2);
      await page.screenshot({ path: test.info().outputPath(`strip-narrow-${theme}.png`), clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: 160 } });
    });
    test(`at 1440: Add, Layout and Focus show their icon and words and no key cap; the keys stay for assistive tech (${theme})`, async ({ page }) => {
      test.setTimeout(90_000);
      await oneTile(page, theme);
      const [add, layout, focus] = controls(page) as [Locator, Locator, Locator];
      await expect(add).toBeVisible({ timeout: 20_000 });
      for (const c of [add, layout, focus]) await expect.poll(() => face(c)).toEqual({ icon: true, words: true, key: false });
      await expect(add).toHaveAttribute('aria-keyshortcuts', 'N');
      await expect(focus).toHaveAttribute('aria-keyshortcuts', 'F');
      await page.mouse.move(2, 2);
      await page.screenshot({ path: test.info().outputPath(`strip-1440-${theme}.png`), clip: { x: 0, y: 0, width: 1440, height: 160 } });
    });
    test(`at 390: the phone has no strip row, and every control it draws shows an icon or words (${theme})`, async ({ page }) => {
      test.setTimeout(90_000);
      await oneTile(page, theme);
      await page.setViewportSize({ width: 390, height: 800 });
      await expect(page.getByRole('heading', { name: 'Board', exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('button', { name: strings.layout, exact: true })).toHaveCount(0);
      await expect(page.getByRole('toolbar', { name: strings.chips })).toBeVisible();
      // Outside the frame: an icon with a real box or words, for every button the phone's Board draws.
      await expect.poll(() => page.getByRole('main').getByRole('button').evaluateAll((els) => els
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter((el) => {
          const big = (n: Element) => { const r = n.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
          return ![...el.querySelectorAll('svg')].some(big) && (el.textContent ?? '').trim() === '';
        })
        .map((el) => el.getAttribute('aria-label') ?? el.outerHTML.slice(0, 80)))).toEqual([]);
      await page.mouse.move(2, 2);
      await page.screenshot({ path: test.info().outputPath(`phone-390-${theme}.png`) });
    });
  });
}

// The note is read whole at every width: a title is out of reach by touch. In words, or its short form, named by the
// whole sentence and opening it on a press.
const whole = (note: Locator) => note.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1, inside: r.left >= 0 && r.right <= document.documentElement.clientWidth };
});

async function readsWhole(page: Page, sentence: string | RegExp) {
  const words = page.getByText(sentence, { exact: true });
  const short = page.getByRole('button', { name: sentence, exact: true });
  await expect(words.or(short).first()).toBeVisible({ timeout: 20_000 });
  // The short form carries the sentence for its name (a screen reader's copy, 1 px): look for the button first.
  if (!(await short.isVisible())) {
    await expect.poll(() => whole(words)).toEqual({ clipped: false, inside: true });
    return;
  }
  await expect.poll(() => whole(short)).toEqual({ clipped: false, inside: true });
  await short.click();
  await expect(page.getByRole('dialog').getByText(sentence, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
}

async function tiles(page: Page, count: number) {
  await oneTile(page, 'light');
  for (let n = 2; n <= count; n++) {
    await page.getByRole('group', { name: strings.tiles }).focus();
    await page.keyboard.press('.');
    await page.getByRole('menuitem', { name: strings['tile.duplicate'] }).click();
    await expect(page.locator(`iframe[title="terminal-${n} on atlas"]`)).toBeAttached();
  }
}

test('at 760 beside Even out tiles: one row, the note reads whole, evening out is reachable, and the controls stay in the window', async ({ page }) => {
  test.setTimeout(120_000);
  await tiles(page, 4);
  await page.getByRole('button', { name: strings.layout, exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: /^Scroll$/ }).click();
  await page.setViewportSize({ width: 760, height: 900 });
  await readsWhole(page, strings['overflow.fitted']);
  for (const c of controls(page)) expect(faceOk(await face(c))).toBe(true);
  // Even out tiles is in the row at step 0; from step 1 it leaves, and Layout's Equalise does the same.
  if ((await stepOf(page)) === 0) await expect(page.getByRole('button', { name: strings['overflow.even'], exact: true })).toBeVisible();
  else {
    await expect(page.getByRole('button', { name: strings['overflow.even'], exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: strings.layout, exact: true }).click();
    await expect(page.getByRole('menuitem', { name: new RegExp('^' + strings['layout.equalise']) })).toBeVisible();
    await page.keyboard.press('Escape');
  }
  const r = (await page.locator('[data-strip-step]').boundingBox())!;
  const m = (await page.getByRole('button', { name: strings.boards, exact: true }).boundingBox())!;
  expect(m.y).toBeGreaterThanOrEqual(r.y - 0.5);
  expect(m.y + m.height).toBeLessThanOrEqual(r.y + r.height + 0.5);
  await expect(page.getByRole('button', { name: strings.boards, exact: true })).toBeInViewport({ ratio: 1 });
  await page.mouse.move(2, 2);
  await page.screenshot({ path: test.info().outputPath('note-760.png'), clip: { x: 0, y: 0, width: 760, height: 200 } });
});

test('at 1100 and 1350 with the pager: the note on the strip, one sentence for the page and the Board, reads whole', async ({ page }) => {
  test.setTimeout(120_000);
  await tiles(page, 6);
  for (const w of [1100, 1350]) {
    await page.setViewportSize({ width: w, height: 900 });
    await readsWhole(page, /^Showing \d of 6 tiles on this page \(a Board holds up to 8\)\.$/);
    // Said once: no separate "6 of 8 tiles" beside it.
    await expect(page.getByText('6 of 8 tiles', { exact: true })).toHaveCount(0);
    for (const c of controls(page)) expect(faceOk(await face(c))).toBe(true);
    await page.mouse.move(2, 2);
    await page.screenshot({ path: test.info().outputPath(`note-${w}.png`), clip: { x: 0, y: 0, width: w, height: 200 } });
  }
});

test('in a short window: the one-tile note, the longest there is, reads whole', async ({ page }) => {
  test.setTimeout(120_000);
  await tiles(page, 3);
  await page.setViewportSize({ width: 1000, height: 230 });
  await readsWhole(page, strings['board.oneAtATime']);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: test.info().outputPath('note-short.png'), clip: { x: 0, y: 0, width: 1000, height: 230 } });
});

// Crossing a step swaps a control's element: the keyboard stays on that control, both ways, and leaving focus mode at a
// narrow width puts it back on Focus.
test('a focused strip control keeps the keyboard as it changes form, both ways', async ({ page }) => {
  test.setTimeout(150_000);
  await oneTile(page, 'light');
  // Add a program changes form at step 3 only, which one Board seldom reaches above 620 px: Strip.fit.test.tsx holds it.
  const [, layout, focus] = controls(page) as [Locator, Locator, Locator];
  for (const [c, name, step] of [[layout, strings.layout, 2], [focus, strings.focus, 2]] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => stepOf(page)).toBe(0);
    await c.focus();
    await expect(c, `${name} wide`).toBeFocused();
    const w = await narrowTo(page, step);
    await expect(c, `${name} at ${w}`).toBeFocused();
    expect((await face(c)).icon, `${name} at ${w}`).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => stepOf(page)).toBe(0);
    await expect(c, `${name} back at 1440`).toBeFocused();
  }
});

// A press on the strip end's own text (the note) after a control had the keyboard: that control is no longer the one the
// keyboard is on, so crossing a step must not hand it the keyboard back.
test('after a press on the strip note, crossing a step does not put the keyboard back on the control it left', async ({ page }) => {
  test.setTimeout(150_000);
  await tiles(page, 6);
  await page.setViewportSize({ width: 2000, height: 900 });
  const note = page.getByText(/^Showing \d of 6 tiles on this page \(a Board holds up to 8\)\.$/);
  await expect(note).toBeVisible({ timeout: 20_000 });
  const layout = page.getByRole('button', { name: strings.layout, exact: true });
  await layout.focus();
  await expect(layout).toBeFocused();
  await note.click();
  await expect(layout).not.toBeFocused();
  // Any step will do: each one runs the strip's keyboard restore (step 1 swaps Add and the note's form). With one Board
  // the row fits at step 1 down to the phone width, so step 1 is the one this test can always reach.
  await narrowTo(page, 1);
  await expect(layout).toBeVisible();
  await expect(layout).not.toBeFocused();
});

// The shell's own way out (its restore button, which goes as it is pressed): the keyboard goes back to Focus, also when
// Focus is drawn as its icon and the strip measures itself again after it comes back.
for (const narrow of [false, true]) {
  test(`leaving focus mode ${narrow ? 'with Focus as its icon' : 'at 1440'} by the shell's button puts the keyboard on Focus`, async ({ page }) => {
    test.setTimeout(120_000);
    await oneTile(page, 'light');
    if (narrow) await narrowTo(page, 2);
    const w = page.viewportSize()!.width;
    const focus = page.getByRole('button', { name: strings.focus, exact: true });
    await focus.click();
    await expect(focus).toHaveCount(0);
    const restore = page.getByRole('button', { name: 'Leave focus mode', exact: true });
    await restore.focus();
    await page.keyboard.press('Enter');
    await expect(focus).toBeVisible({ timeout: 20_000 });
    await expect(focus).toBeFocused();
    // Its icon at every width, its words only when wide.
    expect(await face(focus), `at ${w}`).toEqual({ icon: true, words: !narrow, key: false });
  });
}
