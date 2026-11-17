// Playwright ("Edge bars"): one notice family, two levels. Each has a 3 px bar at the start
// and a 1 px frame, the fill, frame and bar taken from the theme's notice tokens as the element resolves them; in light
// the warning's fill and frame are also checked against the design's literal values. A kit warning's bar is the hazard
// stripe ("Hazard stripe edge"): a transparent 3 px border with the stripe painted under it. Checked in both themes on every
// Guide warning (the kit Notice), Home's "Needs you", every Bots flush note (the bar is a ::before start border there,
// above the row's hairline, on the right in RTL) and Notes' inline "did not answer" chip. No fixture shows Notes'
// "Showing N of M" (calm); the unit test covers the calm notice. In forced colours a block notice and a flush note still
// show their bar, and the flush note's text does not move.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';

type Level = 'calm' | 'warn';

/** The notice's own colours, and the tokens' values resolved inside it (so the theme's values are compared). */
const read = (l: Locator, level: Level, stripe: boolean) =>
  l.evaluate((el, [lv, st]) => {
    const c = getComputedStyle(el);
    const probe = document.createElement('span');
    probe.style.color = lv === 'warn' ? (st ? 'transparent' : 'var(--hx-warn-fill)') : 'var(--hx-notice-calm-bar)';
    probe.style.backgroundColor = lv === 'warn' ? 'var(--hx-notice-warn)' : 'var(--hx-notice-calm)';
    probe.style.borderTopColor = lv === 'warn' ? 'var(--hx-notice-warn-line)' : 'var(--hx-notice-line)';
    el.appendChild(probe);
    const p = getComputedStyle(probe);
    const want = { bar: p.color, fill: p.backgroundColor, line: p.borderTopColor };
    probe.remove();
    return {
      want,
      fill: c.backgroundColor,
      barW: parseFloat(c.borderInlineStartWidth),
      bar: c.borderInlineStartColor,
      lineW: parseFloat(c.borderTopWidth),
      line: c.borderTopColor,
      radius: parseFloat(c.borderTopLeftRadius) + parseFloat(c.borderBottomRightRadius),
      shadow: c.boxShadow,
      image: c.backgroundImage,
    };
  }, [level, stripe] as const);

/** `stripe`: a kit warning, whose bar is the hazard stripe; a page that draws its own warning passes false. */
async function expectEdgeBar(l: Locator, level: Level, what: string, stripe = level === 'warn') {
  await expect(l, what).toBeVisible();
  const g = await read(l, level, stripe);
  if (stripe) expect(g.image, `${what}: the hazard stripe`).toContain('repeating-linear-gradient');
  else expect(g.image, `${what}: no stripe`).toBe('none');
  expect(g.barW, `${what}: the 3 px bar`).toBe(3);
  expect(g.bar, `${what}: the bar colour`).toBe(g.want.bar);
  expect(g.lineW, `${what}: the 1 px frame`).toBe(1);
  expect(g.line, `${what}: the frame colour`).toBe(g.want.line);
  expect(g.fill, `${what}: the fill`).toBe(g.want.fill);
  expect(g.radius, `${what}: square corners`).toBe(0);
}

async function open(page: Page, path: string, theme: 'light' | 'dark', state?: string) {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, path, { theme, ...(state ? { state } : {}) });
}

for (const theme of ['light', 'dark'] as const) {
  test(`@notice ${theme}: Guide's warnings are warning notices`, async ({ page }) => {
    await open(page, '/guide', theme);
    const n = page.locator('#hub-main [data-notice="warn"]');
    await expect(n.first()).toBeAttached({ timeout: 20_000 });
    const count = await n.count();
    expect(count, 'the Guide has its warnings').toBeGreaterThanOrEqual(2);
    for (let i = 0; i < count; i++) {
      await n.nth(i).scrollIntoViewIfNeeded();
      await expectEdgeBar(n.nth(i), 'warn', `guide warning ${i}`);
    }
    if (theme === 'light') {
      const lit = await n.first().evaluate((el) => {
        const c = getComputedStyle(el);
        return { fill: c.backgroundColor, line: c.borderTopColor };
      });
      expect(lit.fill, 'light warning fill: black at 4%').toBe('rgba(0, 0, 0, 0.04)');
      expect(lit.line, 'light warning frame: black at 9%').toBe('rgba(0, 0, 0, 0.09)');
    }
    await noSideScroll(page);
  });

  test(`@notice ${theme}: Home's Needs you is the warning notice`, async ({ page }) => {
    await open(page, '/home', theme, 'attention');
    const strip = page.locator('section[aria-labelledby="home-needs-title"]');
    await expect(strip.locator('li[data-need]').first()).toBeVisible({ timeout: 20_000 });
    // Home draws this strip itself (pages/home), with the solid warn bar until it takes the kit's stripe.
    await expectEdgeBar(strip, 'warn', 'needs you', false);
  });

  test(`@notice ${theme}: the Bots list's flush notes carry the bar inside`, async ({ page }) => {
    await open(page, '/bots', theme, 'suspendedCombined');
    const bands = page.locator('#hub-main [data-band-flush]');
    await expect(bands.first()).toBeVisible({ timeout: 20_000 });
    const count = await bands.count();
    for (let i = 0; i < count; i++) {
      const g = await flushBar(bands.nth(i));
      expect(g.barW, `flush ${i}: the 3 px bar`).toBe(3);
      expect(g.barStyle, `flush ${i}: a solid bar`).toBe('solid');
      expect(g.bar, `flush ${i}: the bar in the tone`).toBe(g.want.bar);
      if (g.warn) expect(g.image, `flush ${i}: the hazard stripe`).toContain('repeating-linear-gradient');
      expect(g.left, `flush ${i}: the bar on the start (left) edge`).toBe('0px');
      expect(g.fill, `flush ${i}: the fill`).toBe(g.want.fill);
      expect(g.hairW, `flush ${i}: the frame's hairline below`).toBe(1);
      if (g.boxed) {
        // A computer's group note (TableGroup.note): a flush Band in it is a boxed callout, the --bw frame in
        // its tone's line on every side (kit/data/DataTable.module.css .groupNote > [data-band-flush]).
        for (const side of ['top', 'right', 'bottom', 'left'] as const) {
          expect(g.sides[side].w, `flush ${i}: a group note's band has the --bw frame (${side})`).toBe(1);
          expect(g.sides[side].style, `flush ${i}: a solid frame (${side})`).toBe('solid');
          expect(g.sides[side].color, `flush ${i}: the frame in the tone's line (${side})`).toBe(g.want.line);
        }
      } else {
        expect(g.ownLine, `flush ${i}: no frame of its own`).toBe(0);
      }
    }
    // RTL: the start edge is the right one.
    await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
    const r = await flushBar(bands.first());
    expect(r.right, 'RTL: the bar on the right edge').toBe('0px');
    expect(r.barW, 'RTL: still the 3 px bar').toBe(3);
  });
}

/** A flush Band's ::before bar, its own fill and borders, whether it sits in a table group's note (boxed there), and the
 *  tone's tokens resolved inside it. */
const flushBar = (l: Locator) =>
  l.evaluate((el) => {
    const c = getComputedStyle(el);
    const b = getComputedStyle(el, '::before');
    const warn = el.getAttribute('role') === 'alert';
    const probe = document.createElement('span');
    probe.style.color = warn ? 'transparent' : 'var(--hx-notice-calm-bar)';
    probe.style.backgroundColor = warn ? 'var(--hx-notice-warn)' : 'var(--hx-notice-calm)';
    probe.style.borderTop = `1px solid ${warn ? 'var(--hx-notice-warn-line)' : 'var(--hx-notice-line)'}`;
    el.appendChild(probe);
    const want = { bar: getComputedStyle(probe).color, fill: getComputedStyle(probe).backgroundColor, line: getComputedStyle(probe).borderTopColor };
    probe.remove();
    return {
      want,
      fill: c.backgroundColor,
      barW: parseFloat(b.borderInlineStartWidth),
      barStyle: b.borderInlineStartStyle,
      bar: b.borderInlineStartColor,
      warn,
      image: b.backgroundImage,
      left: b.left,
      right: b.right,
      hairW: parseFloat(c.borderBottomWidth),
      ownLine: parseFloat(c.borderTopWidth) + parseFloat(c.borderLeftWidth),
      sides: Object.fromEntries(
        (['top', 'right', 'bottom', 'left'] as const).map((k) => [k, { w: parseFloat(c.getPropertyValue(`border-${k}-width`)), style: c.getPropertyValue(`border-${k}-style`), color: c.getPropertyValue(`border-${k}-color`) }]),
      ) as Record<'top' | 'right' | 'bottom' | 'left', { w: number; style: string; color: string }>,
      // the kit boxes only a group note's direct child (TableGroup.note: flush Bands are its direct children or none)
      boxed: el.parentElement?.matches('[data-group-note]') ?? false,
    };
  });

test("@notice Notes: a computer whose Notes did not answer shows the inline warning chip", async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await open(page, '/notes', theme, 'mixed');
    const chip = page.locator('#hub-main span[data-notice="warn"]').first();
    await expect(chip).toBeVisible({ timeout: 20_000 });
    await expectEdgeBar(chip, 'warn', `notes chip ${theme}`);
    // The chip's own padding (1 px block): a flex row blockifies its display, so the padding is what shows it is the chip.
    expect(await chip.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))).toBe(1);
  }
});

test('@notice forced colours: a block notice still shows its bar', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await open(page, '/guide', 'light');
  const n = page.locator('#hub-main [data-notice="warn"]').first();
  await expect(n).toBeAttached({ timeout: 20_000 });
  await n.scrollIntoViewIfNeeded();
  const g = await n.evaluate((el) => {
    const c = getComputedStyle(el);
    return { w: parseFloat(c.borderInlineStartWidth), style: c.borderInlineStartStyle, colour: c.borderInlineStartColor, bg: c.backgroundColor };
  });
  expect(g.w).toBe(3);
  expect(g.style).toBe('solid');
  expect(g.colour).not.toBe(g.bg);
  await page.screenshot({ path: test.info().outputPath('notice-forced.png') });
});

test('@notice forced colours: a flush note keeps its bar and its text does not move', async ({ page }) => {
  const textLeft = async () => {
    const band = page.locator('#hub-main [data-band-flush]').first();
    await expect(band).toBeVisible({ timeout: 20_000 });
    return band.evaluate((el) => {
      const t = el.querySelector(':scope > span');
      const b = getComputedStyle(el, '::before');
      return {
        text: (t ?? el).getBoundingClientRect().left - el.getBoundingClientRect().left,
        w: parseFloat(b.borderInlineStartWidth),
        style: b.borderInlineStartStyle,
      };
    });
  };
  await open(page, '/bots', 'light', 'suspendedCombined');
  const plain = await textLeft();
  await page.emulateMedia({ forcedColors: 'active' });
  const forced = await textLeft();
  expect(forced.w, 'forced colours: the 3 px bar').toBe(3);
  expect(forced.style, 'forced colours: a solid bar').toBe('solid');
  expect(forced.text, 'forced colours: the text keeps its column').toBe(plain.text);
  await page.screenshot({ path: test.info().outputPath('notice-flush-forced.png') });
});
