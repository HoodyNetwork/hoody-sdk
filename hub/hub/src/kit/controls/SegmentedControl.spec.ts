// Playwright: a SegmentedControl reads as one control of separate options,
// never as a label in front of a word. The design draws it as one framed grey track with a white thumb under the current
// option: the track has a 1 px frame (the design's #9c9c9c card-frame grey, a look the spec sets, so no contrast floor
// on it), the thumb's edge stands out from the track (3:1), the thumb's fill differs from every other option's, and
// every option's text reads on what is under it (4.5:1). Colours composited as drawn, no token value pinned. On touch every
// switch is a 44 px control, every option at least 44 px wide, the whole height of the tray presses the option there
// and nothing outside the tray does. Computed styles and hit tests need a real browser, not jsdom.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from '../gallery/kit2.strings.en.json';
import logsStrings from '../../pages/logs/strings.en.json';

/** Every switch in the page as drawn: contrast of the frame and of each unselected cell's edge, and the cells' fills
 *  and weights. Translucent colours are composited over what is under them, down to the first opaque background. */
async function readSwitches(page: Page) {
  return page.locator('[role=radiogroup]').evaluateAll((groups) => {
    type C = [number, number, number, number];
    // Computed colours come as rgb()/rgba() in 0-255, or, for a color-mix(), as color(srgb …) in 0-1.
    const parse = (s: string): C => {
      const m = s.match(/(rgba?|color)\(([^)]+)\)/);
      if (!m) throw new Error(`unread colour: ${s}`);
      const [r = 0, g = 0, b = 0, a = 1] = (m[2] ?? '').replace('srgb', '').split(/[ ,/]+/).filter(Boolean).map(Number);
      const k = m[1] === 'color' ? 255 : 1;
      return [r * k, g * k, b * k, a];
    };
    const over = ([r, g, b, a]: C, [R, G, B]: C): C => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
    /** The colour an element's background shows as: its translucent layers composited down to an opaque one. */
    const shown = (el: Element | null): C => {
      const layers: C[] = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 1) break;
      }
      let out: C = [255, 255, 255, 1];
      for (const c of layers.reverse()) out = over(c, out);
      return out;
    };
    const lum = (c: C) => {
      const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: C, b: C) => {
      const x = Math.max(lum(a), lum(b));
      const y = Math.min(lum(a), lum(b));
      return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
    };
    return groups.map((g) => {
      const t = getComputedStyle(g);
      const tray = shown(g);
      const outside = shown(g.parentElement);
      const frame = over(parse(t.borderTopColor), tray);
      return {
        name: g.getAttribute('aria-label') ?? '',
        frameWidth: parseFloat(t.borderTopWidth),
        frameVsTray: ratio(frame, tray),
        frameVsOutside: ratio(frame, outside),
        options: [...g.querySelectorAll<HTMLElement>('[role=radio]')].map((o) => {
          const c = getComputedStyle(o);
          const cell = shown(o);
          const edge = over(parse(c.borderTopColor), cell);
          return {
            label: o.textContent?.trim() ?? '',
            selected: o.getAttribute('aria-checked') === 'true',
            disabled: o.hasAttribute('data-disabled'),
            cell: cell.join(','),
            edgeWidth: parseFloat(c.borderTopWidth),
            edgeVsCell: ratio(edge, cell),
            edgeVsTray: ratio(edge, tray),
            textVsCell: ratio(over(parse(c.color), cell), cell),
            weight: Number(c.fontWeight),
          };
        }),
      };
    });
  });
}

type Switch = Awaited<ReturnType<typeof readSwitches>>[number];

function expectReadsAsChoice(sw: Switch) {
  const at = sw.name;
  expect(sw.frameWidth, `${at}: the tray has a frame`).toBeGreaterThanOrEqual(1);
  expect(sw.frameVsTray, `${at}: the frame is drawn in a colour of its own`).toBeGreaterThan(1.5);
  const current = sw.options.filter((o) => o.selected);
  expect(current, `${at}: one current option`).toHaveLength(1);
  const cur = current[0];
  if (!cur) return;
  // The current option is the thumb: its edge stands out from the track, so it is told apart by more than colour.
  expect(cur.edgeWidth, `${at}: the thumb has an edge`).toBeGreaterThanOrEqual(1);
  expect(cur.edgeVsTray, `${at}: the thumb's edge stands out from the track`).toBeGreaterThanOrEqual(3);
  expect(cur.textVsCell, `${at}: the current option's text reads on the thumb`).toBeGreaterThanOrEqual(4.5);
  for (const o of sw.options.filter((x) => !x.selected && !x.disabled)) {
    expect(cur.cell, `${at}: the current option's fill differs from ${o.label}'s`).not.toBe(o.cell);
    expect(o.textVsCell, `${at}/${o.label}: its text reads on the track`).toBeGreaterThanOrEqual(4.5);
  }
}

const LOGS = '/logs?src=programs&program=3';

for (const theme of ['light', 'dark'] as const) {
  test(`every gallery switch reads as separate options, the current one by fill and weight (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHub(page, '/_kit?tab=nav', { theme });
    await page.getByRole('heading', { name: strings['sec.segmented'] }).waitFor();
    const all = await readSwitches(page);
    expect(all.length).toBeGreaterThanOrEqual(5);
    for (const sw of all) expectReadsAsChoice(sw);
  });

  test(`the logs page's Normal output | Errors switch reads as two options (${theme})`, async ({ page }) => {
    test.setTimeout(90_000); // the logs list loads slowly under a full hub:check run
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHub(page, LOGS, { theme });
    // The switch is drawn with the program bar, once the program list has loaded (a skeleton until then): waiting for it
    // is waiting for that load, which under a full run can outlast a short wait.
    await page.getByRole('radiogroup', { name: logsStrings['prog.channel'] }).waitFor({ timeout: 60_000 });
    const sw = (await readSwitches(page)).find((x) => x.name === logsStrings['prog.channel']);
    expect(sw?.options).toHaveLength(2);
    if (sw) expectReadsAsChoice(sw);
  });
}

/** Each option of every switch: its width, whether the tray's top and bottom rows press it (at its start, middle and
 *  end), and whether the rows just outside the tray press the switch at all (they must not). */
async function touchMisses(page: Page) {
  return page.locator('[role=radiogroup]').evaluateAll((groups) => {
    const out: string[] = [];
    for (const g of groups) {
      g.scrollIntoView({ block: 'center' });
      const t = g.getBoundingClientRect();
      const name = g.getAttribute('aria-label');
      if (t.height < 44) out.push(`${name}: ${Math.round(t.height)} px tall`);
      for (const o of g.querySelectorAll<HTMLElement>('[role=radio]')) {
        const r = o.getBoundingClientRect();
        const label = o.textContent?.trim();
        if (r.width < 44) out.push(`${name}/${label}: ${Math.round(r.width)} px wide`);
        for (const x of [r.left + 1, r.left + r.width / 2, r.right - 1]) {
          for (const y of [t.top + 1, t.bottom - 1]) {
            if (document.elementFromPoint(x, y)?.closest('[role=radio]') !== o) out.push(`${name}/${label}: (${Math.round(x - r.left)}, ${Math.round(y - t.top)}) misses`);
          }
          for (const y of [t.top - 2, t.bottom + 2]) {
            if (document.elementFromPoint(x, y)?.closest('[role=radiogroup]') === g) out.push(`${name}/${label}: ${Math.round(y - t.top)} px outside the tray still presses it`);
          }
        }
      }
    }
    return out;
  });
}

test.describe('on touch at 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('every gallery switch is a 44 px control of 44 px options, pressed across the whole tray and nowhere outside it', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=nav');
    await page.getByRole('heading', { name: strings['sec.segmented'] }).waitFor();
    expect(await touchMisses(page)).toEqual([]);
  });

  test('an option with a one-letter label is still 44 px wide', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=nav');
    await page.getByRole('heading', { name: strings['sec.segmented'] }).waitFor();
    // As short as a real label gets (Board options' On | Off): the labels shrink in place, the switch is as rendered.
    const labels = page.locator('[role=radio] [class*=label]');
    // One label per option, or the test would check the ordinary wide labels and prove nothing.
    expect(await labels.count()).toBe(await page.locator('[role=radio]').count());
    await labels.evaluateAll((ls) => ls.forEach((l) => (l.textContent = 'X')));
    expect(new Set(await labels.allTextContents())).toEqual(new Set(['X']));
    expect(await touchMisses(page)).toEqual([]);
  });

  test("the logs switch is the same, and a tap on the tray's top row picks the option there", async ({ page }) => {
    await gotoHub(page, LOGS);
    const grp = page.getByRole('radiogroup', { name: logsStrings['prog.channel'] });
    await grp.waitFor({ timeout: 15_000 });
    expect(await touchMisses(page)).toEqual([]);
    const errors = grp.getByRole('radio', { name: logsStrings['prog.err'] });
    await expect(errors).toHaveAttribute('aria-checked', 'false');
    const t = await grp.boundingBox();
    const r = await errors.boundingBox();
    if (!t || !r) throw new Error('no boxes');
    await page.touchscreen.tap(r.x + r.width / 2, t.y + 1);
    await expect(errors).toHaveAttribute('aria-checked', 'true');
  });
});
