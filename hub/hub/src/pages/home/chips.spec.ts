// Playwright: Home's Ask ideas are square grey
// plates, #d6d6d6 (dark: the fill step), no line, padded 10 / 20 / 10 / 14, with a 9 px cut at the bottom end painted by
// the background (bottom right; bottom left in a right-to-left page). On hover the plate is the accent with its own ink.
// They stay kit buttons (role, keyboard, focus ring, never clipped): the keyboard and wrapping checks are here and in
// look.spec.ts. The row wraps, so nothing scrolls sideways and nothing clips. The cut and the ring are read back from the
// painted page, not only from the computed style; forced colours keep a line and a focus outline.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

/** A colour token as the page computes it. */
const colour = (page: Page, value: string) =>
  page.evaluate((v) => {
    const el = document.createElement('div');
    el.style.color = v;
    document.body.append(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  }, value);

const look = (chip: Locator) =>
  chip.evaluate((el) => {
    const c = getComputedStyle(el);
    return {
      image: c.backgroundImage,
      ink: c.color,
      lineW: [c.borderTopWidth, c.borderRightWidth, c.borderBottomWidth, c.borderLeftWidth],
      corners: [c.borderStartStartRadius, c.borderStartEndRadius, c.borderEndEndRadius, c.borderEndStartRadius],
      pad: [c.paddingTop, c.paddingInlineEnd, c.paddingBottom, c.paddingInlineStart],
      clip: c.clipPath,
      shadow: c.boxShadow,
      transform: c.transform,
      lineH: parseFloat(c.lineHeight),
    };
  });

/** The cut: a 45° stop 9 px * cos 45° from the corner the gradient starts at, transparent there, the plate after it. */
const plate = (angle: '315deg' | '45deg', fill: string) => `linear-gradient(${angle}, rgba(0, 0, 0, 0) 6.3639px, ${fill} 6.3639px)`;

const ideas = (page: Page) => page.getByRole('list', { name: strings['ask.chips'] }).getByRole('button');

type RGB = readonly [number, number, number];
const rgb = (css: string): RGB => {
  const [r = NaN, g = NaN, b = NaN] = (css.match(/[\d.]+/g) ?? []).map(Number);
  return [r, g, b];
};
const near = (a: RGB, b: RGB, tol = 6) => a.every((v, i) => Math.abs(v - b[i]!) <= tol);

/** The page as painted around a box (`pad` CSS px on each side): a reader of the colour at a page point, in CSS px. */
async function painted(page: Page, box: { x: number; y: number; width: number; height: number }, pad: number) {
  const clip = { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad };
  const b64 = (await page.screenshot({ clip, animations: 'disabled', caret: 'hide' })).toString('base64');
  const img = await page.evaluate(async (png) => {
    const im = new Image();
    im.src = `data:image/png;base64,${png}`;
    await im.decode();
    const g = new OffscreenCanvas(im.naturalWidth, im.naturalHeight).getContext('2d')!;
    g.drawImage(im, 0, 0);
    return { w: im.naturalWidth, data: Array.from(g.getImageData(0, 0, im.naturalWidth, im.naturalHeight).data) };
  }, b64);
  const scale = img.w / clip.width;
  return (x: number, y: number): RGB => {
    const i = (Math.floor((y - clip.y) * scale) * img.w + Math.floor((x - clip.x) * scale)) * 4;
    return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
  };
}

/**
 * The painted cut of one idea, at its bottom `end` corner: the pixel 1.5 px in from that corner shows what is behind the
 * idea (the same as 2 px outside it), while 12 px up the end edge, 12 px along the bottom, the top end corner and the
 * bottom start corner show the plate. So an opaque fill under the cut, a clip or a round corner each fail.
 */
async function expectCut(page: Page, chip: Locator, end: 'right' | 'left', fill: string) {
  const box = (await chip.boundingBox())!;
  const at = await painted(page, box, 6);
  const plateRGB = rgb(fill);
  const right = end === 'right';
  const edgeX = right ? box.x + box.width - 1.5 : box.x + 1.5;
  const startX = right ? box.x + 1.5 : box.x + box.width - 1.5;
  const inX = right ? box.x + box.width - 12 : box.x + 12;
  const outX = right ? box.x + box.width + 2 : box.x - 2;
  const bottom = box.y + box.height - 1.5;
  const corner = at(edgeX, bottom);
  expect(near(corner, at(outX, bottom)), `the cut corner shows what is behind the idea (${corner})`).toBe(true);
  expect(near(corner, plateRGB), 'the cut corner is not the plate').toBe(false);
  for (const [x, y, what] of [
    [edgeX, box.y + box.height - 12, '12 px up the end edge'],
    [inX, bottom, '12 px along the bottom'],
    [edgeX, box.y + 1.5, 'the top end corner'],
    [startX, bottom, 'the bottom start corner'],
  ] as const)
    expect(near(at(x, y), plateRGB), `${what} is the plate`).toBe(true);
}

/**
 * Arms a watcher in the page, and waits until it is armed, that reads the idea's ink in the same task its hover
 * attribute turns to `hovered` (a MutationObserver, so no frame can pass first). It refuses an idea already in that
 * state and gives up after 5 s. The returned function gives the ink it read.
 */
async function armSwap(chip: Locator, hovered: boolean) {
  await chip.evaluate((el, want) => {
    if (el.hasAttribute('data-hovered') === want) throw new Error(`the idea is already ${want ? '' : 'not '}hovered`);
    (window as unknown as { __swap?: Promise<string> }).__swap = new Promise<string>((done, fail) => {
      const mo = new MutationObserver(() => {
        if (el.hasAttribute('data-hovered') !== want) return;
        clearTimeout(timer);
        mo.disconnect();
        done(getComputedStyle(el).color);
      });
      const timer = setTimeout(() => {
        mo.disconnect();
        fail(new Error('the hover attribute did not flip within 5 s'));
      }, 5_000);
      mo.observe(el, { attributes: true, attributeFilter: ['data-hovered'] });
    });
  }, hovered);
  return () => chip.evaluate(() => (window as unknown as { __swap: Promise<string> }).__swap);
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: an Ask idea is a square grey plate cut at its bottom end, and on hover the plate is the accent with its ink`, async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoHub(page, '/home', { theme });
    const chip = ideas(page).first(); // reason: every idea shares one style; the first proves it
    await expect(chip).toBeVisible();
    const fill = await colour(page, 'var(--hx-bubble-plate)');
    if (theme === 'light') expect(fill, 'the light plate is #d6d6d6').toBe('rgb(214, 214, 214)');
    else expect(fill, 'the dark plate is the fill step').toBe(await colour(page, 'var(--hx-fill)'));
    const rest = await look(chip);
    expect(rest.image, 'the plate is cut 9 px at the bottom right').toBe(plate('315deg', fill));
    expect(rest.lineW, 'a plate has no line').toEqual(['0px', '0px', '0px', '0px']);
    expect(rest.corners, 'a plate is square').toEqual(['0px', '0px', '0px', '0px']);
    expect(rest.pad, 'a plate is padded 10 / 20 / 10 / 14').toEqual(['10px', '20px', '10px', '14px']);
    expect(rest.clip, 'the cut is painted, never clipped (the focus ring stays whole)').toBe('none');
    expect(rest.ink, 'the words are ink').toBe(await colour(page, 'var(--hx-ink)'));
    await expectCut(page, chip, 'right', fill);
    // The ink swaps in the frame the plate does, both ways (motion on): a colour fade would show the old ink on the new
    // plate for a moment, light ink on the yellow in dark. Each watcher is armed in the page before the pointer moves.
    const accInk = await colour(page, 'var(--hx-acc-ink)');
    const entering = await armSwap(chip, true);
    await chip.hover();
    expect(await entering(), 'the accent ink comes with the accent plate, in the same frame').toBe(accInk);
    await expect.poll(async () => (await look(chip)).image).toBe(plate('315deg', await colour(page, 'var(--hx-acc)')));
    const hovered = await look(chip);
    expect(hovered.ink, 'on the accent the words take the accent ink').toBe(accInk);
    // A plate is flat: no lift and no shadow on hover either.
    expect([hovered.transform, hovered.shadow]).toEqual(['none', 'none']);
    const leaving = await armSwap(chip, false);
    await page.mouse.move(2, 2);
    expect(await leaving(), 'the ink goes back with the plate, in the same frame').toBe(rest.ink);
    // A long idea wraps onto more lines; the cut stays 9 px at its bottom end (the gradient is drawn at a fixed angle).
    await chip.evaluate((el) => (el.style.maxWidth = '7em'));
    await expect.poll(async () => (await chip.boundingBox())!.height).toBeGreaterThan(rest.lineH * 2);
    await expectCut(page, chip, 'right', fill);
    await page.screenshot({ path: test.info().outputPath(`plates-${theme}.png`) });
  });
}

test.describe('on a screen of twice the pixel density', () => {
  test.use({ deviceScaleFactor: 2 });
  test('the cut is still 9 CSS px at the bottom end', async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, '/home', { theme: 'light' });
    const chip = ideas(page).first(); // reason: the denser screen proves the shared style on its first idea
    await expect(chip).toBeVisible();
    await expectCut(page, chip, 'right', 'rgb(214, 214, 214)');
  });
});

test('in a right-to-left page the cut sits at the bottom left', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/home', { theme: 'light' });
  const chip = ideas(page).first();
  await expect(chip).toBeVisible();
  await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
  expect((await look(chip)).image, 'the rtl plate is cut at the bottom left').toBe(plate('45deg', 'rgb(214, 214, 214)'));
  await expectCut(page, chip, 'left', 'rgb(214, 214, 214)');
});

/** Tab from the Ask submit button to the last idea, the one nearest the card's end edge. */
async function focusLastIdea(page: Page) {
  const list = page.getByRole('list', { name: strings['ask.chips'] });
  const chips = list.getByRole('button');
  await expect(chips.first()).toBeVisible();
  await page.locator('form').filter({ has: list }).getByRole('button', { name: strings['ask.submit'], exact: true }).focus();
  const n = await chips.count();
  for (let i = 0; i < n; i++) await page.keyboard.press('Tab');
  const last = chips.last(); // reason: the last idea is the one nearest the card's end edge
  await expect(last).toBeFocused();
  await expect(last).toHaveAttribute('data-focus-visible', 'true');
  return last;
}

test('keyboard focus draws the kit focus ring around an Ask idea, whole', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 845 });
  await gotoHub(page, '/home');
  const last = await focusLastIdea(page);
  await expect.poll(() => last.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/0px 0px 0px 4px/);
  // Nothing between the idea and the page clips the ring: every ancestor that clips has room for its 4 px.
  const room = await last.evaluate((el) => {
    const b = el.getBoundingClientRect();
    let least = Infinity;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (c.overflowX === 'visible' && c.overflowY === 'visible') continue;
      const r = p.getBoundingClientRect();
      least = Math.min(least, b.left - r.left, r.right - b.right, b.top - r.top, r.bottom - b.bottom);
    }
    return least;
  });
  expect(room).toBeGreaterThanOrEqual(4);
  // And the ring is painted: 3 px outside each side (past the 2 px gap) is the focus colour, so a clip cannot hide it.
  const ring = rgb(await colour(page, 'var(--hx-focus)'));
  const box = (await last.boundingBox())!;
  const at = await painted(page, box, 6);
  const midX = box.x + box.width / 2;
  const midY = box.y + box.height / 2;
  for (const [x, y, side] of [
    [box.x - 3, midY, 'start'],
    [box.x + box.width + 3, midY, 'end'],
    [midX, box.y - 3, 'top'],
    [midX, box.y + box.height + 3, 'bottom'],
  ] as const)
    expect(near(at(x, y), ring, 24), `the ring is painted on the ${side} side`).toBe(true);
});

test('in forced colours an idea keeps a line, and keyboard focus a Highlight outline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 845 });
  await page.emulateMedia({ forcedColors: 'active' });
  await gotoHub(page, '/home');
  const first = ideas(page).first(); // reason: every idea shares one style; the first proves it
  await expect(first).toBeVisible();
  const line = await first.evaluate((el) => {
    const c = getComputedStyle(el);
    return [c.borderTopStyle, c.borderTopWidth, c.borderBottomWidth];
  });
  expect(line, 'a forced-colour idea keeps a 1 px line').toEqual(['solid', '1px', '1px']);
  const last = await focusLastIdea(page);
  const outline = await last.evaluate((el) => {
    const c = getComputedStyle(el);
    return [c.outlineStyle, c.outlineWidth, c.outlineOffset];
  });
  expect(outline, 'forced-colour focus is a 2 px outline outside the line').toEqual(['solid', '2px', '2px']);
});
