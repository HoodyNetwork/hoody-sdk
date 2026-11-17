// Playwright: the hold control under real input, where happy-dom cannot reach (the browser's own key
// activation, pointer capture, a release away from the control, a chorded mouse, a held touch). The gallery's recorder
// (kit/gallery/voice.tsx HoldRecorder) writes every down and up to data-hold-log; each press must read one "du" pair,
// the down at the press and the up only at the release.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './Voice.strings.en.json';

const HOLD_NAME = new RegExp(`^(${strings['hold.idle']}|${strings['hold.held']})$`);

async function open(page: Page): Promise<{ rec: Locator; hold: Locator }> {
  await gotoHub(page, '/_kit?tab=voice');
  const rec = page.locator('[data-hold-recorder]');
  const hold = rec.getByRole('button', { name: HOLD_NAME });
  await hold.waitFor({ timeout: 15_000 });
  await hold.scrollIntoViewIfNeeded();
  return { rec, hold };
}
const log = (rec: Locator) => rec.getAttribute('data-hold-log');
// The look a kit button shows: compared between the hold and a kit primary Button in the same state.
const LOOK = ['background-color', 'color', 'border-top-color', 'border-top-width', 'border-top-style', 'border-radius', 'outline-style', 'outline-width', 'outline-color', 'box-shadow', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-transform', 'cursor', 'opacity'];
const look = (l: Locator) => l.evaluate((el, props) => {
  const cs = getComputedStyle(el);
  return Object.fromEntries(props.map((k) => [k, cs.getPropertyValue(k)]));
}, LOOK);
const held = (page: Page) => page.waitForTimeout(600);

test.describe('hold to talk in a real browser', () => {
  for (const key of ['Space', 'Enter', 'NumpadEnter'] as const)
    test(`${key} held: down at the press, up only at the release, and no click of its own`, async ({ page }) => {
      const { rec, hold } = await open(page);
      await hold.focus();
      await page.keyboard.down(key);
      await expect.poll(() => log(rec)).toBe('d');
      await held(page);
      expect(await log(rec)).toBe('d');
      await page.keyboard.up(key);
      await expect.poll(() => log(rec)).toBe('du');
      await held(page);
      expect(await log(rec)).toBe('du');
    });

  test('Enter and NumpadEnter are two keys, in either order', async ({ page }) => {
    const { rec, hold } = await open(page);
    const codes = await hold.evaluateHandle((el) => {
      const seen: string[] = [];
      el.addEventListener('keydown', (e) => seen.push((e as KeyboardEvent).code), true);
      return seen;
    });
    await hold.focus();
    await page.keyboard.down('Enter');
    await page.keyboard.down('NumpadEnter');
    await page.keyboard.up('NumpadEnter');
    await held(page);
    expect(await log(rec)).toBe('d');
    await page.keyboard.up('Enter');
    await expect.poll(() => log(rec)).toBe('du');
    await page.keyboard.down('NumpadEnter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await held(page);
    expect(await log(rec)).toBe('dud');
    await page.keyboard.up('NumpadEnter');
    await expect.poll(() => log(rec)).toBe('dudu');
    expect(await codes.evaluate((c) => c)).toEqual(['Enter', 'NumpadEnter', 'NumpadEnter', 'Enter']);
  });

  test('a mouse press keeps its capture, survives leaving the control and ends where it is released', async ({ page }) => {
    const { rec, hold } = await open(page);
    const ids = await hold.evaluateHandle((el) => {
      const seen: number[] = [];
      el.addEventListener('pointerdown', (e) => seen.push((e as PointerEvent).pointerId), true);
      return seen;
    });
    const box = (await hold.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => log(rec)).toBe('d');
    const id = (await ids.evaluate((s) => s))[0];
    expect(await hold.evaluate((el, pid) => el.hasPointerCapture(pid), id)).toBe(true);
    await page.mouse.move(5, 5, { steps: 5 });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
    await page.mouse.move(5, 5, { steps: 5 });
    await held(page);
    expect(await log(rec)).toBe('d');
    await page.mouse.up();
    await expect.poll(() => log(rec)).toBe('du');
  });

  test('a chord: left down, right down, left up ends it at the left up; the right up adds nothing', async ({ page }) => {
    const { rec, hold } = await open(page);
    const box = (await hold.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: 'left' });
    await page.mouse.down({ button: 'right' });
    await held(page);
    expect(await log(rec)).toBe('d');
    await page.mouse.up({ button: 'left' });
    await expect.poll(() => log(rec)).toBe('du');
    await page.mouse.up({ button: 'right' });
    await held(page);
    expect(await log(rec)).toBe('du');
  });

  test('a held touch is one press with its timing (Chromium touch input)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch input is Chromium only');
    const { rec, hold } = await open(page);
    const box = (await hold.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const at = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at });
    await expect.poll(() => log(rec)).toBe('d');
    await held(page);
    expect(await log(rec)).toBe('d');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => log(rec)).toBe('du');
    // The touch's own click comes after a timer queued at its pointerup (ev/probe-click); it must still add nothing.
    await held(page);
    expect(await log(rec)).toBe('du');
  });

  test('the premise of the click match: a press\'s own click carries its pointerId, a program click -1 (keys: ev/probe-click)', async ({ page }) => {
    const { hold } = await open(page);
    await hold.evaluate((el: HTMLElement) => {
      const w = window as unknown as { seen: string[] };
      w.seen = [];
      for (const t of ['pointerdown', 'click']) {
        el.addEventListener(t, (e) => {
          const pe = e as PointerEvent;
          w.seen.push(`${t}:${e instanceof PointerEvent ? pe.pointerId : 'none'}`);
        });
      }
    });
    const seen = () => page.evaluate(() => (window as unknown as { seen: string[] }).seen.splice(0));
    await hold.click();
    const press = await seen();
    expect(press).toHaveLength(2);
    expect(press[1]).toBe(press[0]?.replace('pointerdown', 'click'));
    await hold.evaluate((el: HTMLElement) => el.click());
    expect(await seen()).toEqual(['click:-1']);
  });

  test('a click with no physical down (a program, as switch access sends) is one tap', async ({ page }) => {
    const { rec, hold } = await open(page);
    await hold.evaluate((el: HTMLElement) => el.click());
    await expect.poll(() => log(rec)).toBe('du');
  });

  test('holds and taps never submit the form around the bar; Escape on the bar stops speaking, the page keys work', async ({ page }) => {
    const { rec, hold } = await open(page);
    await hold.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await page.keyboard.press('NumpadEnter');
    await hold.evaluate((el: HTMLElement) => el.click());
    await expect.poll(() => log(rec)).toBe('dudududu');
    // Escape on the bar is the bar's Stop speaking (one "s"); m is the page's mute key, reaching it from the hold.
    await page.keyboard.press('Escape');
    await page.keyboard.press('m');
    await expect.poll(() => log(rec)).toBe('dudududusm');
    // Off the bar, Escape is the page binding's stop, and t focuses Talk.
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('Escape');
    await expect.poll(() => log(rec)).toBe('dudududusmS');
    await page.keyboard.press('t');
    await expect(hold).toBeFocused();
    expect(await log(rec)).not.toContain('x');
  });

  test('looks like a kit primary Button: idle, hover, focus-visible, pressed and disabled', async ({ page }) => {
    // Reduced motion: the kit's transitions take 0 s, so each read is the state's settled look.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { rec, hold } = await open(page);
    const kit = page.locator('[data-hold-recorder]').getByRole('button', { name: 'Kit button', disabled: false });
    const kitOff = page.locator('[data-hold-recorder]').getByRole('button', { name: 'Kit button', disabled: true });
    // The muted bar's hold (the live section's next specimen), disabled.
    const muted = page.locator('[data-hold-recorder] ~ * button[data-variant="primary"][disabled]').first();
    expect(await look(hold)).toEqual(await look(kit));
    for (const el of [hold, kit]) {
      await el.hover();
      await expect(el).toHaveAttribute('data-hovered');
    }
    await hold.hover();
    const holdHover = await look(hold);
    await kit.hover();
    expect(holdHover).toEqual(await look(kit));
    await page.mouse.move(2, 2);
    // Focus by keyboard modality: focus, then a key that does nothing on a button (React Aria's focus-visible rule).
    await hold.focus();
    await page.keyboard.press('ArrowRight');
    await expect(hold).toHaveAttribute('data-focus-visible');
    const holdFocus = await look(hold);
    await kit.focus();
    await page.keyboard.press('ArrowRight');
    await expect(kit).toHaveAttribute('data-focus-visible');
    expect(holdFocus).toEqual(await look(kit));
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    const pressedLook = async (el: Locator) => {
      await el.hover();
      await page.mouse.down();
      await expect(el).toHaveAttribute('data-pressed');
      const l = await look(el);
      await page.mouse.up();
      return l;
    };
    const holdPressed = await pressedLook(hold);
    const kitPressed = await pressedLook(kit);
    expect(holdPressed).toEqual(kitPressed);
    await page.mouse.move(2, 2);
    expect(await look(muted)).toEqual(await look(kitOff));
    expect(await log(rec)).toBe('du');
  });

  test('on a touch screen the hold is at least the touch target (44 px) each way', async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'a coarse pointer is emulated on Chromium');
    const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    try {
      const { hold } = await open(page);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      const box = (await hold.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    } finally {
      await ctx.close();
    }
  });
});
