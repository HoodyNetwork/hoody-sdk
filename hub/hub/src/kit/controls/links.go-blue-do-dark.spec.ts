// Playwright ("blue go, dark do"): a link that goes somewhere is blue at rest and on
// hover, underlined on hover 3 px below the text; a text button that acts is dark, 600, over a 1 px underline in the soft
// line 3 px below, and on hover and keyboard focus its underline takes the text colour; the top bar's AI and Skills /
// SDK take the dark action ink at rest, hovered, pressed, under keyboard focus and open, and the bar gives it to nothing
// else (the Free badge keeps the kit ghost's own ink); a pressed text button takes a colour of its own, never an
// opacity. Read through the real components,
// light and dark: the kit gallery's text tab (Link inline and nav, plain, PageLinkTo, a Facts link, TextButton default,
// danger and disabled) and its Widgets (View all), a VM page's breadcrumbs (desktop and the phone's back link), and the top
// bar. Colours come from the tokens (--hx-link, --hx-do-text, --hx-do-line, --hx-ink), and in light the source's own
// values are pinned too. Contrast: every reading composites the translucent background colours under the text and the
// opacity over it, and is compared unrounded against 4.5:1. That model holds for plain paint only, so each reading also
// checks it is plain: no background image under the text, and no opacity under 1 on any element whose group holds a
// painted background (an opacity on a node fades its whole subtree as one group, so it is a text fade only when nothing
// from that node down to the text paints a background; on the opaque owner, a translucent layer or anything above, it
// composites text and background together, which this model does not do, so the reading is refused). A pressed text
// button is read under the mouse, the keyboard (Space held, the pointer elsewhere) and touch, so its colour cannot hang on
// hover. Soft checks: a run names every failing reading.
import { writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from '../gallery/kit2.strings.en.json';
import guide from '../../pages/guide/strings.en.json';

/** The design's light values. A text button's resting underline is a soft line: 20% of the ink in light, 16% of white
 *  in dark. The other dark values are derived. */
const LIGHT = { go: 'rgb(7, 65, 255)', doText: 'rgb(28, 28, 28)', doLine: 'rgba(16, 16, 16, 0.2)' };
const DARK = { doLine: 'rgba(255, 255, 255, 0.16)' };

interface Look {
  color: string;
  weight: string;
  line: string;
  decoColor: string;
  thick: string;
  offset: string;
  ring: boolean;
  /** The element's own computed opacity. */
  opacity: string;
  /** True when the colour model below holds: no background image from the element out to its opaque background (a kit
   *  Button's plate aside: one flat colour, read as its background), and no opacity under 1 on any element (itself
   *  included) at or above a node that paints a background (such a group composites the background with the text). */
  plainPaint: boolean;
  /** The text as seen (its colour composited over the background, with every opacity applied) and what it sits on. */
  fg: number[];
  bg: number[];
}

/** A token's colour as the browser resolves it on the page (a probe element, so var() chains and the theme apply). */
async function token(page: Page, name: string): Promise<string> {
  return page.evaluate((n) => {
    const p = document.createElement('span');
    p.style.color = `var(${n})`;
    document.body.append(p);
    const c = getComputedStyle(p).color;
    p.remove();
    return c;
  }, name);
}

async function look(l: Locator): Promise<Look> {
  await l.scrollIntoViewIfNeeded();
  return l.evaluate((el) => {
    // rgb()/rgba() or color(srgb …) to [r, g, b, a] in 0-255.
    const parse = (c: string): number[] => {
      const n = (c.match(/-?[\d.]+/g) ?? []).map(Number);
      const srgb = c.startsWith('color(');
      const [r = 0, g = 0, b = 0] = srgb ? n.slice(0, 3).map((v) => v * 255) : n;
      const a = c.includes('/') || c.startsWith('rgba') ? (n[3] ?? 1) : 1;
      return [r, g, b, a];
    };
    const over = (top: number[], under: number[]) => {
      const a = top[3] ?? 1;
      return [0, 1, 2].map((i) => top[i]! * a + under[i]! * (1 - a)).concat(1);
    };
    // Every background from the element out to the first opaque one, then composited from the outside in; the
    // opacities on the way multiply into the text's own alpha.
    // An opacity is a plain text fade only while nothing from the text up to that node paints: `painted` turns on at the
    // first node with a background (translucent or opaque) and stays on, and an opacity under 1 there or above makes a
    // group the model does not composite (`grouped`).
    const layers: number[][] = [];
    let opacity = 1;
    let base: number[] | undefined;
    let images = 0;
    let painted = false;
    let grouped = false;
    // A kit Button paints its plate as a background image in one flat colour, its --plate (plates.spec.ts reads that
    // paint off the screen): the plate is the button's background here. No other background image is read.
    const plateOf = (n: Element): number[] | undefined => {
      if (!n.matches('[class*="Button-module__button"]')) return undefined;
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--plate)';
      n.append(probe);
      const c = parse(getComputedStyle(probe).backgroundColor);
      probe.remove();
      return c;
    };
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const o = Number(cs.opacity);
      const plate = cs.backgroundImage !== 'none' ? plateOf(n) : undefined;
      const b = plate ?? parse(cs.backgroundColor);
      if (b[3]! > 0 || cs.backgroundImage !== 'none') painted = true;
      if (o < 1 && painted) grouped = true;
      if (base) continue;
      if (cs.backgroundImage !== 'none' && !plate) images++;
      opacity *= o;
      if (b[3]! >= 1) base = b;
      else if (b[3]! > 0) layers.push(b);
    }
    let bg = base ?? [255, 255, 255, 1];
    for (const l of layers.reverse()) bg = over(l, bg);
    const cs = getComputedStyle(el);
    const t = parse(cs.color);
    const fg = over([t[0]!, t[1]!, t[2]!, (t[3] ?? 1) * opacity], bg);
    const ring = cs.boxShadow !== 'none' || (cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px');
    return { color: cs.color, weight: cs.fontWeight, line: cs.textDecorationLine, decoColor: cs.textDecorationColor, thick: cs.textDecorationThickness, offset: cs.textUnderlineOffset, ring, opacity: cs.opacity, plainPaint: images === 0 && !grouped, fg, bg };
  });
}

/** Hovered. `native`: a plain HTML control (the secret ExtLink's button), which has no React Aria data-hovered. */
async function hovered(page: Page, l: Locator, native = false): Promise<Look> {
  await l.scrollIntoViewIfNeeded();
  await l.hover();
  if (native) expect(await l.evaluate((e) => e.matches(':hover')), 'the pointer is over it').toBe(true);
  else await expect(l).toHaveAttribute('data-hovered', /.*/);
  const out = await look(l);
  await page.mouse.move(0, 0);
  return out;
}

/** Keyboard focus, reached by Tab (React Aria shows its ring only for keyboard modality): out backwards, then back in. */
async function focused(page: Page, l: Locator, native = false): Promise<Look> {
  await l.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await l.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(l).toBeFocused();
  if (native) expect(await l.evaluate((e) => e.matches(':focus-visible')), 'keyboard focus shows as :focus-visible').toBe(true);
  else await expect(l).toHaveAttribute('data-focus-visible', /.*/);
  const out = await look(l);
  await l.evaluate((e) => (e as HTMLElement).blur());
  return out;
}

/** Pressed: the pointer held down on it, then moved off before it is let go (so the press is cancelled, not run). */
async function pressed(page: Page, l: Locator): Promise<Look> {
  await l.scrollIntoViewIfNeeded();
  await l.hover();
  await page.mouse.down();
  await expect(l).toHaveAttribute('data-pressed', /.*/);
  const out = await look(l);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.keyboard.press('Escape');
  return out;
}

/** Pressed from the keyboard: keyboard focus by Tab, Space held, the pointer away and never over
 *  it (no data-hovered). Focus leaves before Space is let go, so the key-up lands outside and the press is cancelled. */
async function keyPressed(page: Page, l: Locator): Promise<Look> {
  await l.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await l.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(l).toBeFocused();
  await page.keyboard.down('Space');
  await expect(l).toHaveAttribute('data-pressed', /.*/);
  expect(await l.getAttribute('data-hovered'), 'a key press: the pointer is not over it').toBeNull();
  const out = await look(l);
  await l.evaluate((e) => (e as HTMLElement).blur());
  await page.keyboard.up('Space');
  await expect(l).not.toHaveAttribute('data-pressed', /.*/);
  return out;
}

/** Pressed by touch: a real touch point down on it through the browser's own input (touch has no
 *  hover), read, then cancelled so nothing runs. */
async function touchPressed(page: Page, l: Locator): Promise<Look> {
  await l.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const box = await l.boundingBox();
  if (!box) throw new Error('touch press: no box');
  const at = [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }];
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at });
    await expect(l).toHaveAttribute('data-pressed', /.*/);
    expect(await l.getAttribute('data-hovered'), 'a touch press: no hover').toBeNull();
    return await look(l);
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await cdp.detach();
  }
}

/** The bar as laid out and as walked: its size, each focusable control's box (DOM order), and the browser's own Tab
 *  order, forwards from the first control and back with Shift+Tab from the last, until focus leaves the bar. */
async function readBar(page: Page, top: Locator): Promise<{ row: number[]; boxes: (string | number)[][]; tabs: string[]; back: string[] }> {
  const geo = await top.evaluate((h) => {
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const els = [...h.querySelectorAll<HTMLElement>('a[href], button, input, [tabindex]')].filter((e) => e.tabIndex >= 0 && e.getClientRects().length > 0);
    const row = h.getBoundingClientRect();
    return {
      row: [r1(row.width), r1(row.height)],
      boxes: els.map((e) => {
        const r = e.getBoundingClientRect();
        return [e.getAttribute('aria-label') ?? (e.textContent ?? '').trim(), r1(r.x), r1(r.y), r1(r.width), r1(r.height)];
      }),
    };
  });
  const walk = async (key: 'Tab' | 'Shift+Tab', from: 'first' | 'last') => {
    await page.mouse.move(0, 0);
    await top.evaluate((h, f) => {
      const els = [...h.querySelectorAll<HTMLElement>('a[href], button, input, [tabindex]')].filter((e) => e.tabIndex >= 0 && e.getClientRects().length > 0);
      (f === 'first' ? els[0] : els[els.length - 1])?.focus();
    }, from);
    const out: string[] = [];
    for (let i = 0; i < 40; i++) {
      const name = await top.evaluate((h) => {
        const a = document.activeElement as HTMLElement | null;
        return a && a !== h && h.contains(a) ? (a.getAttribute('aria-label') ?? (a.textContent ?? '').trim()) : null;
      });
      if (name === null) break;
      out.push(name);
      await page.keyboard.press(key);
    }
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    return out;
  };
  return { ...geo, tabs: await walk('Tab', 'first'), back: await walk('Shift+Tab', 'last') };
}

function ratio(a: number[], b: number[]): number {
  const lum = (c: number[]) => {
    const [r, g, bl] = c.slice(0, 3).map((x) => {
      const v = x / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** 4.5:1, unrounded (only the message rounds). */
function contrast(name: string, l: Look) {
  expect.soft(l.plainPaint, `${name}: read on plain paint (no background image but a button's plate, no faded ancestor)`).toBe(true);
  const r = ratio(l.fg, l.bg);
  expect.soft(r, `${name}: 4.5:1 on what it sits on (${r.toFixed(2)})`).toBeGreaterThanOrEqual(4.5);
}

function go(name: string, at: Look, hover: Look, blue: string) {
  expect.soft(at.color, `${name}: blue at rest (--hx-link)`).toBe(blue);
  expect.soft(at.line, `${name}: no underline at rest`).toBe('none');
  expect.soft(hover.color, `${name}: the same blue on hover`).toBe(blue);
  expect.soft(hover.line, `${name}: underlined on hover`).toBe('underline');
  expect.soft(hover.offset, `${name}: the underline 3 px below the text`).toBe('3px');
  contrast(`${name} at rest`, at);
  contrast(`${name} hovered`, hover);
}

// The plain-paint reading itself, on built cases. A fade is a text fade only while nothing
// from the faded node down to the text paints; the opaque owner faded, a painted layer faded, a fade over a painted layer,
// a fade above the owner and the text's own painted box faded are each a group the model does not composite.
test('plain paint refuses every opacity whose group holds a background', async ({ page }) => {
  test.slow(); // the run's first page
  await gotoHub(page, '/_kit?tab=text', { theme: 'light' });
  await page.getByRole('link', { name: strings['link.nav'], exact: true }).waitFor({ timeout: 15_000 });
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.innerHTML = [
      '<div style="background:#fff"><span data-pp="text-fade" style="opacity:.5">a</span></div>',
      '<div style="background:#fff"><div style="opacity:.5"><span data-pp="clear-fade">a</span></div></div>',
      '<div style="background:#fff;opacity:.5"><span data-pp="owner">a</span></div>',
      '<div style="background:#fff"><div style="opacity:.5;background:rgba(0,0,0,.1)"><span data-pp="painted-layer">a</span></div></div>',
      '<div style="background:#fff"><div style="opacity:.5"><div style="background:rgba(0,0,0,.1)"><span data-pp="over-layer">a</span></div></div></div>',
      '<div style="opacity:.5"><div style="background:#fff"><span data-pp="above-owner">a</span></div></div>',
      '<div style="background:#fff"><span data-pp="own-box" style="opacity:.5;background:rgba(0,0,0,.1)">a</span></div>',
    ].join('');
    document.body.append(host);
  });
  const plain = async (k: string) => (await look(page.locator(`[data-pp="${k}"]`))).plainPaint;
  expect.soft(await plain('text-fade'), 'the text alone faded is plain').toBe(true);
  expect.soft(await plain('clear-fade'), 'a fade on a node that paints nothing, over the text alone, is plain').toBe(true);
  for (const k of ['owner', 'painted-layer', 'over-layer', 'above-owner', 'own-box']) {
    expect.soft(await plain(k), `${k}: a faded group holding a background is not plain`).toBe(false);
  }
  expect(test.info().errors).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  test.describe(`links, ${theme}`, () => {
    test.use({ viewport: { width: 1350, height: 900 } });

    test(`go links are blue, do text buttons dark and underlined (${theme})`, async ({ page }) => {
      // The first test of each theme may meet a cold dev server (a first scroll past 30 s under load).
      test.slow();
      await gotoHub(page, '/_kit?tab=text', { theme });
      const nav = page.getByRole('link', { name: strings['link.nav'], exact: true });
      await nav.waitFor({ timeout: 15_000 });
      const row = nav.locator('xpath=..');
      const blue = await token(page, '--hx-link');
      const doText = await token(page, '--hx-do-text');
      const doLine = await token(page, '--hx-do-line');
      const danger = await token(page, '--hx-danger');
      const doPressed = await token(page, '--hx-do-pressed');
      const dangerPressed = await token(page, '--hx-do-danger-pressed');
      if (theme === 'light') {
        expect.soft(blue, 'light go blue is the source #0741ff').toBe(LIGHT.go);
        expect.soft(doText, 'light do text is the source #1c1c1c').toBe(LIGHT.doText);
        expect.soft(doLine, 'light do underline is 20% of the ink').toBe(LIGHT.doLine);
      } else expect.soft(doLine, 'dark do underline is 16% of white').toBe(DARK.doLine);
      expect.soft(doText, 'do text is not the grey it replaced').not.toBe(await token(page, '--hx-muted'));

      for (const key of ['link.docs', 'link.nav'] as const) {
        const l = row.getByRole('link', { name: strings[key], exact: true });
        go(`Link ${key}`, await look(l), await hovered(page, l), blue);
      }
      const kf = await focused(page, nav);
      expect.soft(kf.color, 'Link nav: blue under keyboard focus').toBe(blue);
      expect.soft(kf.line, 'Link nav: underlined under keyboard focus').toBe('underline');
      expect.soft(kf.ring, 'Link nav: the focus ring shows').toBe(true);
      const plain = await look(row.getByRole('link', { name: strings['link.plain'], exact: true }));
      expect.soft(plain.color, 'a plain link keeps its own colour (not blue)').not.toBe(blue);

      // PageLinkTo's default (nav) and a Facts value link: the same go look through their own components.
      const pl = page.getByRole('link', { name: strings['parts.link'], exact: true });
      go('PageLinkTo (default)', await look(pl), await hovered(page, pl), blue);
      const fact = page.getByRole('link', { name: strings['facts.serverValue'] });
      go('a Facts link', await look(fact), await hovered(page, fact), blue);

      // ExtLink, both render paths, in the gallery's Facts (the Data tab): the Docs address is an <a>, the secret program
      // address a native <button> (its whole address is never in an href). Each is a go link at rest, hovered and under
      // keyboard focus (blue, underlined, the ring). Found by the kit's own ExtLink classes (the dev server's CSS-module
      // names, `Link-module__ext_…`), so a plain Link to the same address is never taken for one.
      await gotoHub(page, '/_kit?tab=data', { theme });
      await page.locator('#hub-main button[class*="__extButton_"]').waitFor({ timeout: 15_000 });
      const extA = page.locator('#hub-main a[class*="__ext_"]:not([data-in-text])', { hasText: 'hoody.com/docs' });
      expect.soft(await extA.count(), 'the gallery shows one standalone Docs ExtLink').toBe(1);
      const extB = page.locator('#hub-main button[class*="__extButton_"]:not([data-in-text])');
      expect.soft(await extB.count(), 'the gallery shows one secret ExtLink button').toBe(1);
      for (const [name, l, native] of [['ExtLink', extA, false], ['secret ExtLink', extB, true]] as const) {
        if ((await l.count()) !== 1) continue;
        const at = await look(l);
        const hv = await hovered(page, l, native);
        expect.soft(at.color, `${name}: blue at rest`).toBe(blue);
        expect.soft(at.line, `${name}: no underline at rest`).toBe('none');
        expect.soft(hv.color, `${name}: the same blue on hover`).toBe(blue);
        expect.soft(hv.line, `${name}: underlined on hover`).toBe('underline');
        contrast(`${name} at rest`, at);
        contrast(`${name} hovered`, hv);
        const kf = await focused(page, l, native);
        expect.soft(kf.color, `${name}: blue under keyboard focus`).toBe(blue);
        expect.soft(kf.line, `${name}: underlined under keyboard focus`).toBe('underline');
        expect.soft(kf.ring, `${name}: the focus ring shows`).toBe(true);
      }
      await gotoHub(page, '/_kit?tab=text', { theme });
      await nav.waitFor({ timeout: 15_000 });

      // The Links row's text buttons, found inside that row (Mark all read is unique; "Not now" is also a Button's label).
      const tbRow = page.locator('[data-text-button]', { hasText: strings['text.markRead'] }).locator('xpath=..');
      const tb = (key: keyof typeof strings) => tbRow.locator('[data-text-button]', { hasText: strings[key] });
      const mark = tb('text.markRead');
      const at = await look(mark);
      expect.soft(at.color, 'Mark all read: dark (--hx-do-text)').toBe(doText);
      expect.soft(at.weight, 'Mark all read: weight 600').toBe('600');
      expect.soft(at.line, 'Mark all read: underlined at rest').toBe('underline');
      expect.soft(at.decoColor, 'Mark all read: the underline is the grey line (--hx-do-line)').toBe(doLine);
      expect.soft(at.thick, 'Mark all read: a 1 px underline').toBe('1px');
      expect.soft(at.offset, 'Mark all read: 3 px below the text').toBe('3px');
      contrast('Mark all read at rest', at);
      const hv = await hovered(page, mark);
      expect.soft(hv.color, 'Mark all read: still dark on hover').toBe(doText);
      expect.soft(hv.line, 'Mark all read: still underlined on hover').toBe('underline');
      expect.soft(hv.decoColor, 'Mark all read: on hover the underline takes the text colour').toBe(doText);
      expect.soft(hv.thick, 'Mark all read: still 1 px on hover').toBe('1px');
      contrast('Mark all read hovered', hv);
      const kb = await focused(page, mark);
      expect.soft(kb.line, 'Mark all read: underlined under keyboard focus').toBe('underline');
      expect.soft(kb.decoColor, 'Mark all read: under keyboard focus the underline takes the text colour').toBe(doText);
      expect.soft(kb.ring, 'Mark all read: the focus ring shows').toBe(true);
      // Pressed: a colour of its own, never an opacity; the do shape stays (weight, underline in the text colour).
      expect.soft(doPressed, 'the pressed do colour is not the rest colour').not.toBe(doText);
      const pr = await pressed(page, mark);
      expect.soft(pr.color, 'Mark all read pressed: its pressed colour (--hx-do-pressed)').toBe(doPressed);
      expect.soft(pr.opacity, 'Mark all read pressed: no opacity').toBe('1');
      expect.soft([pr.weight, pr.line, pr.decoColor], 'Mark all read pressed: 600, underlined in the text colour').toEqual(['600', 'underline', doPressed]);
      contrast('Mark all read pressed', pr);
      for (const [how, read] of [['by key', keyPressed], ['by touch', touchPressed]] as const) {
        const k = await read(page, mark);
        expect.soft(k.color, `Mark all read pressed ${how}: its pressed colour, without hover`).toBe(doPressed);
        expect.soft(k.opacity, `Mark all read pressed ${how}: no opacity`).toBe('1');
        expect.soft([k.weight, k.line, k.decoColor], `Mark all read pressed ${how}: 600, underlined in the text colour`).toEqual(['600', 'underline', doPressed]);
        contrast(`Mark all read pressed ${how}`, k);
      }

      const forgetL = tb('text.forget');
      const forget = await look(forgetL);
      expect.soft(forget.color, 'a danger text button keeps its red').toBe(danger);
      expect.soft([forget.weight, forget.line, forget.decoColor], 'a danger text button takes the do shape').toEqual(['600', 'underline', doLine]);
      contrast('Forget at rest', forget);
      const fh = await hovered(page, forgetL);
      expect.soft(fh.color, 'a danger text button stays red on hover').toBe(danger);
      expect.soft([fh.line, fh.decoColor], 'a danger text button: on hover the underline takes its red').toEqual(['underline', danger]);
      contrast('Forget hovered', fh);
      expect.soft(dangerPressed, 'the pressed danger colour is not the rest red').not.toBe(danger);
      const fp = await pressed(page, forgetL);
      expect.soft(fp.color, 'Forget pressed: its pressed red (--hx-do-danger-pressed)').toBe(dangerPressed);
      expect.soft(fp.opacity, 'Forget pressed: no opacity').toBe('1');
      expect.soft([fp.weight, fp.line, fp.decoColor], 'Forget pressed: 600, underlined in the text colour').toEqual(['600', 'underline', dangerPressed]);
      contrast('Forget pressed', fp);
      for (const [how, read] of [['by key', keyPressed], ['by touch', touchPressed]] as const) {
        const k = await read(page, forgetL);
        expect.soft(k.color, `Forget pressed ${how}: its pressed red, without hover`).toBe(dangerPressed);
        expect.soft(k.opacity, `Forget pressed ${how}: no opacity`).toBe('1');
        expect.soft([k.weight, k.line, k.decoColor], `Forget pressed ${how}: 600, underlined in the text colour`).toEqual(['600', 'underline', dangerPressed]);
        contrast(`Forget pressed ${how}`, k);
      }
      const off = await look(tb('text.disabled'));
      expect.soft(off.line, 'a disabled text button has no underline').toBe('none');
      expect(test.info().errors).toEqual([]);
    });

    test(`View all, breadcrumbs and the top bar (${theme})`, async ({ page }) => {
      await gotoHub(page, '/_kit?tab=widgets', { theme });
      const blue = await token(page, '--hx-link');
      const doText = await token(page, '--hx-do-text');
      const ink = await token(page, '--hx-ink');
      // The Bots card's View all: every card has one, its href names the card (the Widget's own View all class).
      const all = page.locator('#hub-main section a[href$="/bots"][class*="viewAll"]');
      await all.waitFor({ timeout: 15_000 });
      go('Widget View all', await look(all), await hovered(page, all), blue);

      // The top bar: the guide's Skills / SDK trigger, and the AI button where this build has it: dark at rest, hovered,
      // pressed and (AI) open; the background answers, the text colour does not.
      const top = page.locator('header').first();
      const skills = top.getByRole('button', { name: guide['top.trigger'] });
      expect.soft(await skills.count(), 'the top bar shows Skills / SDK at 1350').toBe(1);
      const controls: [string, Locator][] = [['Skills / SDK', skills]];
      const ai = top.getByRole('button', { name: /^AI\b/ });
      if (await ai.count()) controls.push(['AI', ai]);
      for (const [name, c] of controls) {
        if (!(await c.count())) continue;
        const r = await look(c);
        expect.soft(r.color, `${name}: dark at rest (--hx-do-text)`).toBe(doText);
        contrast(`${name} at rest`, r);
        const h = await hovered(page, c);
        expect.soft(h.color, `${name}: dark on hover`).toBe(doText);
        contrast(`${name} hovered`, h);
        const p = await pressed(page, c);
        expect.soft(p.color, `${name}: dark while pressed`).toBe(doText);
        contrast(`${name} pressed`, p);
        const f = await focused(page, c);
        expect.soft(f.color, `${name}: dark under keyboard focus`).toBe(doText);
        expect.soft(f.ring, `${name}: the focus ring shows`).toBe(true);
        contrast(`${name} focused`, f);
      }
      if (await skills.count()) {
        await skills.click();
        await expect(skills).toHaveAttribute('aria-expanded', 'true');
        await page.mouse.move(0, 0);
        const o = await look(skills);
        expect.soft(o.color, 'Skills / SDK: dark while its menu is open').toBe(doText);
        contrast('Skills / SDK open', o);
        await page.keyboard.press('Escape');
        await expect(skills).toHaveAttribute('aria-expanded', 'false');
      }
      if (await ai.count()) {
        await ai.click();
        await expect(ai).toHaveAttribute('aria-pressed', 'true');
        await page.mouse.move(0, 0);
        const o = await look(ai);
        expect.soft(o.color, 'AI: dark while its dock is open').toBe(doText);
        contrast('AI open', o);
        await ai.click();
      }
      // A VM's own page has a trail back to Virtual machines (a page with its own sidebar entry, such as Plans & Billing,
      // has none, and a computer opened beside the Computers list shows its name as a heading, no trail).
      await gotoHub(page, '/vms/web-1', { theme });
      const crumbs = page.locator('#hub-main').getByRole('list', { name: 'Breadcrumbs' });
      await crumbs.waitFor({ timeout: 15_000 });
      const links = crumbs.getByRole('link');
      const n = await links.count();
      let checked = 0;
      let current = 0;
      for (let i = 0; i < n; i++) {
        const l = links.nth(i); // each crumb in turn; the index is the reading
        if ((await l.getAttribute('data-current')) !== null || (await l.getAttribute('aria-disabled')) === 'true') {
          const c = await look(l);
          expect.soft(c.color, 'the current page stays ink (--hx-ink)').toBe(ink);
          contrast('the current page', c);
          current++;
          continue;
        }
        if (!(await l.isVisible())) continue;
        go(`breadcrumb ${i}`, await look(l), await hovered(page, l), blue);
        checked++;
      }
      expect.soft(checked, 'the VM page shows at least one breadcrumb link').toBeGreaterThan(0);
      expect.soft(current, 'the VM page shows its current page in the breadcrumbs').toBe(1);

      // The phone: the breadcrumbs fold to one back link to the parent, also a go link.
      await page.setViewportSize({ width: 390, height: 844 });
      const back = page.locator('#hub-main a[class*="crumbBack"]');
      await expect(back).toBeVisible();
      go('the phone back link', await look(back), await hovered(page, back), blue);
      expect(test.info().errors).toEqual([]);
    });

    // Each top-bar part sits in a box-less holder (display: contents) that is a styling hook only. The
    // bar's focusable boxes, their gaps and its Tab order (the browser's own, Tab forwards and Shift+Tab back) are the
    // same with the holders as with the parts drawn straight into the parts span (the shape without holders). An empty part
    // (the Free badge of this paid account) leaves no box, no flex gap and no Tab stop. The holders are taken out last.
    test(`the top bar's part holders change no box, gap or Tab order (${theme})`, async ({ page }) => {
      await gotoHub(page, '/_kit?tab=text', { theme });
      const top = page.locator('header').first();
      await top.getByRole('button', { name: guide['top.trigger'] }).waitFor({ timeout: 15_000 });
      const read = () => readBar(page, top);
      const named = await top.locator('[data-hub-topbar-part]').evaluateAll((xs) => xs.map((x) => [x.getAttribute('data-hub-topbar-part'), x.childNodes.length]));
      expect.soft(named.map(([n]) => n), 'the bar holds the Guide part and the (empty) Free badge part').toEqual(expect.arrayContaining(['guide:links', 'billing:free']));
      // A holder is never a stop or a role of its own: Chromium skips a focusable display: contents box, other
      // browsers may not, so the walk below alone cannot see one.
      const stops = await top.locator('[data-hub-topbar-part]').evaluateAll((xs) => xs.filter((x) => x.hasAttribute('tabindex') || x.hasAttribute('role') || (x as HTMLElement).tabIndex >= 0).length);
      expect.soft(stops, 'no part holder carries a tabindex or a role').toBe(0);
      const withHolders = await read();
      expect.soft(withHolders.tabs.length, 'Tab reaches every focusable control of the bar').toBe(withHolders.boxes.length);
      expect.soft([...withHolders.back].reverse(), 'Shift+Tab walks the bar in the reverse order').toEqual(withHolders.tabs);
      const empty = await top.evaluate((h) => {
        const e = [...h.querySelectorAll('[data-hub-topbar-part]')].filter((x) => x.childNodes.length === 0);
        for (const x of e) x.remove();
        return e.length;
      });
      expect.soft(empty, 'at least one part renders nothing here (the Free badge of a paid account)').toBeGreaterThan(0);
      expect.soft(await read(), 'an empty part leaves no box, no flex gap and no Tab stop').toEqual(withHolders);
      await top.evaluate((h) => {
        for (const x of [...h.querySelectorAll('[data-hub-topbar-part]')]) x.replaceWith(...x.childNodes);
      });
      expect.soft(await read(), 'the holders change no box, gap or Tab order (the parts drawn straight in)').toEqual(withHolders);
      expect(test.info().errors).toEqual([]);
    });

    // The Free badge's own holder: the fixture world has no free-only account, so the badge's own button is built in
    // its real holder from the classes the real badge
    // has: the kit ghost Button's alone (read off Skills / SDK, minus its own trigger class; the badge has
    // no class of its own, FreeBadge.tsx passes only a caller's className). It keeps the kit ghost's own rest ink (no
    // hook reaches it: the bar's ink hook is unset on it, set on Skills / SDK), and the bar with it measures the same with the holders as without them (boxes, gaps, Tab order,
    // both ways).
    test(`the Free badge keeps the kit ghost's own ink, and its holder changes nothing (${theme})`, async ({ page }) => {
      await gotoHub(page, '/_kit?tab=text', { theme });
      const top = page.locator('header').first();
      const skills = top.getByRole('button', { name: guide['top.trigger'] });
      await skills.waitFor({ timeout: 15_000 });
      const own = await token(page, '--hx-btn-text');
      const probe = await skills.evaluate((b) => {
        const holder = document.querySelector('[data-hub-topbar-part="billing:free"]');
        if (!holder) return { holder: false, ghost: false, color: '', hook: 'none', hookOnSkills: '' };
        const c = document.createElement('button');
        c.type = 'button';
        c.className = [...b.classList].filter((k) => !/trigger/i.test(k)).join(' ');
        c.textContent = 'Free';
        holder.append(c);
        const hook = (el: Element) => getComputedStyle(el).getPropertyValue('--ghost-text').trim();
        return { holder: true, ghost: b.getAttribute('data-variant') === 'ghost', color: getComputedStyle(c).color, hook: hook(c), hookOnSkills: hook(b) };
      });
      expect.soft([probe.holder, probe.ghost], 'the billing:free holder is found, and the classes are a kit ghost Button\'s').toEqual([true, true]);
      expect.soft(probe.color, 'the Free badge keeps the kit ghost\'s own rest ink (--hx-btn-text)').toBe(own);
      // The two inks can be one colour, so the hook itself is read: the bar's ink reaches Skills / SDK and not the badge.
      expect.soft(probe.hook, 'no ink hook reaches the Free badge').toBe('');
      expect.soft(probe.hookOnSkills, 'the bar\'s ink hook is set on Skills / SDK').not.toBe('');
      const withHolders = await readBar(page, top);
      expect.soft(withHolders.boxes.map(([n]) => n), 'the badge is a box of the bar').toContain('Free');
      expect.soft(withHolders.tabs, 'Tab reaches the badge').toContain('Free');
      await top.evaluate((h) => {
        for (const x of [...h.querySelectorAll('[data-hub-topbar-part]')]) x.replaceWith(...x.childNodes);
      });
      expect.soft(await readBar(page, top), 'with the badge, the holders change no box, gap or Tab order').toEqual(withHolders);
      expect(test.info().errors).toEqual([]);
    });

    // The go blue, the do ink and the danger red, at rest and pressed (the pressed colours are tokens of their own, read
    // from the browser), each reach
    // 4.5:1 on every surface a link or text button lands on: the page, a card (its head and its body; the top bar is a
    // card surface), a raised surface (dialog, popover), the field fill, the secondary fill, and the translucent layers
    // over the surfaces a link can sit on (a selected or hovered row, a warning or danger band), composited. Unrounded; the
    // numbers are printed (rounded) beside the run.
    test(`go blue and do ink reach 4.5:1 on every surface (${theme})`, async ({ page }) => {
      await gotoHub(page, '/_kit?tab=text', { theme });
      const got = await page.evaluate(() => {
        const rgb = (prop: 'color' | 'backgroundColor', v: string) => {
          const p = document.createElement('span');
          p.style[prop] = v;
          document.body.append(p);
          const c = getComputedStyle(p)[prop];
          p.remove();
          const n = (c.match(/-?[\d.]+/g) ?? []).map(Number);
          const srgb = c.startsWith('color(');
          const [r = 0, g = 0, b = 0] = srgb ? n.slice(0, 3).map((x) => x * 255) : n;
          return [r, g, b, c.includes('/') || c.startsWith('rgba') ? (n[3] ?? 1) : 1];
        };
        const over = (top: number[], under: number[]) => {
          const a = top[3] ?? 1;
          return [0, 1, 2].map((i) => top[i]! * a + under[i]! * (1 - a)).concat(1);
        };
        const lum = (c: number[]) => {
          const [r, g, b] = c.slice(0, 3).map((x) => {
            const v = x / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          }) as [number, number, number];
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (a: number[], b: number[]) => {
          const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
          return (x + 0.05) / (y + 0.05);
        };
        const bg = (v: string) => rgb('backgroundColor', `var(${v})`);
        const opaque: Record<string, number[]> = {
          page: bg('--hx-bg'),
          card: bg('--hx-card'),
          'card head': bg('--card-head'),
          'card body': bg('--card-body'),
          raised: bg('--hx-raised'),
          fill: bg('--hx-fill'),
          secondary: bg('--hx-sec-bg'),
        };
        const layers: Record<string, number[]> = {
          selected: bg('--hx-selected'),
          hovered: bg('--hx-hover'),
          'warning band': bg('--hx-warn-t'),
          'danger band': bg('--hx-danger-t'),
        };
        // A layer composes over every surface a link can sit on: the page, a card (head or body), a raised surface and
        // the fill (code blocks, chat bubbles, bands). Not the secondary fill: only Button variants paint it, and no
        // control holds a link or text button. No pressed layer: only a pressed control paints it, under its own label;
        // a text button's own press is its own colour (--hx-do-pressed, --hx-do-danger-pressed). The exclusion rests on
        // links.surfaces.contrast-surfaces-link-text.test.ts (the declaration-level inventory) and the HTML content model.
        const under = ['page', 'card', 'card head', 'card body', 'raised', 'fill'];
        const surfaces: Record<string, number[]> = { ...opaque };
        for (const [ln, l] of Object.entries(layers)) for (const on of under) surfaces[`${ln} on ${on}`] = over(l, opaque[on]!);
        const inks: Record<string, number[]> = {
          go: rgb('color', 'var(--hx-link)'),
          do: rgb('color', 'var(--hx-do-text)'),
          danger: rgb('color', 'var(--hx-danger)'),
          'do pressed': rgb('color', 'var(--hx-do-pressed)'),
          'danger pressed': rgb('color', 'var(--hx-do-danger-pressed)'),
        };
        const out: Record<string, number> = {};
        for (const [sf, b] of Object.entries(surfaces)) for (const [ink, c] of Object.entries(inks)) out[`${ink} on ${sf}`] = ratio(over(c, b), b);
        return out;
      });
      const shown = Object.fromEntries(Object.entries(got).map(([k, v]) => [k, Math.round(v * 100) / 100]));
      writeFileSync(test.info().outputPath('contrast.json'), `LINK-CONTRAST ${theme} ${JSON.stringify(shown)}\n`);
      for (const [k, v] of Object.entries(got)) expect.soft(v, `${k} (${theme}) reaches 4.5:1 (${v.toFixed(3)})`).toBeGreaterThanOrEqual(4.5);
      expect(test.info().errors).toEqual([]);
    });
  });
}
