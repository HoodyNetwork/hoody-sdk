// Playwright ("Folder tabs"): a kit Tabs strip and a SegmentedControl variant="folder" draw
// grey tabs on one line; the chosen tab is white, the strip's full height, framed and open at the bottom. Read through
// the real components on Notifications (Tabs), Computers (its views Computers | Servers | Projects are Tabs; Cards | List) and Bare metal
// (Listings | Reservations), light and
// dark, on a fine pointer (34 px strip; the Cards | List switch in a table toolbar 40) and on touch (44).
// Colours come from the tokens (none pinned here): the strip's
// line is --hx-folder-line, a grey tab --hx-folder-tab in --hx-folder-text, the chosen one --hx-folder-on in
// --hx-folder-on-text. Every tab's box is the strip's height, so a tab is a full-height target; a grey tab paints its
// fill from --tabs-lift down and leaves its last pixel clear, so the strip's one line shows under it; the chosen tab's
// fill covers the line. Text reaches 4.5:1 on its fill. The design's own numbers are pinned too, not only the tokens:
// 4 px lift, 3 px gap, 14 px sides, a 1 px frame and line, and in light the given colours; and the
// line is read from the screen: as bright under a grey tab as in a gap (dark's line is translucent, so a second paint
// shows). In light a grey tab is the darker #e0e0e0 and framed from the lift
// down in the line's colour (--hx-folder-tab-line; open at the bottom, where the strip's line is), read from the screen
// as a top edge and a side that stand 1.4:1 off the surface around them; dark's frame token is its fill, so dark draws no frame.
// Soft checks: a run names every failing reading.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import marketStrings from '../../pages/billing/servers/strings.en.json';

interface Tab {
  label: string;
  chosen: boolean;
  top: number;
  bottom: number;
  left: number;
  right: number;
  h: number;
  bg: string;
  img: string;
  color: string;
  frameTop: string;
  frameStart: string;
  frameEnd: string;
  frameBottom: string;
  frameTopW: number;
  frameSideW: number;
  frameEndW: number;
  frameBottomW: number;
  padTop: number;
  padStart: number;
  padEnd: number;
  clip: string;
  origin: string;
  radius: number;
}
interface Strip {
  name: string;
  top: number;
  bottom: number;
  h: number;
  /** The line: the strip's (Tabs: the bar's) inset bottom shadow. */
  line: string;
  /** No ink underline is painted on any tab (::after). */
  underlines: number;
  tabs: Tab[];
  tokens: Record<string, string>;
  /** The line's row on the screen: the last pixel row of the element that paints it. */
  lineRow: number;
  /** Pixels on that row: in a gap between two tabs, under a grey tab, under the chosen tab; and one row above and one
   * below the lift line (--tabs-lift under the strip's top), in the gap and in a grey tab (read in strips()). */
  px?: { gap: string; grey: string; chosen: string; gapAbove: string; greyAbove: string; greyBelow: string; edge: string; side: string };
}

/** The design's light values, pinned apart from the tokens. Dark is derived. */
const LIGHT = { tab: 'rgb(224, 224, 224)', line: 'rgb(196, 196, 196)', on: 'rgb(255, 255, 255)', onText: 'rgb(28, 28, 28)' };

const TOKENS = ['--hx-folder-tab', '--hx-folder-tab-line', '--hx-folder-line', '--hx-folder-on', '--hx-folder-text', '--hx-folder-on-text', '--tabs-lift'] as const;

async function read(page: Page, selector: string, name: string): Promise<Strip> {
  await page.locator(`${selector}[aria-label="${name}"]`).first().waitFor({ timeout: 15_000 });
  return page.locator(`${selector}[aria-label="${name}"]`).first().evaluate((el, tokens) => {
    // Tabs draws its line on the bar around the tab list; a folder SegmentedControl on its own track.
    const lineEl = (el.closest('[class*="Tabs-module__bar"]') as HTMLElement | null) ?? (el as HTMLElement);
    const root = getComputedStyle(document.documentElement);
    const tok: Record<string, string> = {};
    for (const t of tokens) {
      const probe = document.createElement('i');
      probe.style.color = `var(${t})`;
      document.body.append(probe);
      tok[t] = t === '--tabs-lift' ? root.getPropertyValue(t).trim() : getComputedStyle(probe).color;
      probe.remove();
    }
    const r = el.getBoundingClientRect();
    const lr = lineEl.getBoundingClientRect();
    const items = [...el.querySelectorAll<HTMLElement>('[role=tab],[role=radio]')];
    return {
      name: el.getAttribute('aria-label') ?? '',
      top: r.top,
      bottom: r.bottom,
      h: r.height,
      line: getComputedStyle(lineEl).boxShadow,
      lineRow: Math.round(lr.bottom) - 1,
      underlines: items.filter((t) => {
        const a = getComputedStyle(t, '::after');
        return a.content !== 'none' && a.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(a.height) > 0;
      }).length,
      tabs: items.map((t) => {
        const b = t.getBoundingClientRect();
        const cs = getComputedStyle(t);
        return {
          label: (t.textContent ?? '').trim(),
          chosen: t.getAttribute('aria-selected') === 'true' || t.getAttribute('aria-checked') === 'true' || t.hasAttribute('data-selected'),
          top: b.top,
          bottom: b.bottom,
          left: b.left,
          right: b.right,
          h: b.height,
          bg: cs.backgroundColor,
          img: cs.backgroundImage,
          color: cs.color,
          frameTop: cs.borderTopColor,
          frameStart: cs.borderLeftColor,
          frameEnd: cs.borderRightColor,
          frameBottom: cs.borderBottomColor,
          frameTopW: parseFloat(cs.borderTopWidth),
          frameSideW: parseFloat(cs.borderLeftWidth),
          frameEndW: parseFloat(cs.borderRightWidth),
          frameBottomW: parseFloat(cs.borderBottomWidth),
          padTop: parseFloat(cs.paddingTop),
          padStart: parseFloat(cs.paddingLeft),
          padEnd: parseFloat(cs.paddingRight),
          clip: cs.backgroundClip,
          origin: cs.backgroundOrigin,
          radius: Math.max(parseFloat(cs.borderTopLeftRadius), parseFloat(cs.borderTopRightRadius)),
        };
      }),
      tokens: tok,
    };
  }, TOKENS as unknown as string[]);
}

const rgb = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).map(Number);
function lum(c: string): number {
  const [r = 0, g = 0, b = 0] = rgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string): number => {
  const [x = 0, y = 0] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
function check(s: Strip, stripH: number, light: boolean) {
  const T = s.tokens;
  const lift = parseFloat(T['--tabs-lift'] ?? '');
  expect.soft(lift, `${s.name}: the grey tab is drawn 4 px under the strip's top (30 of 34, 40 of 44)`).toBe(4);
  expect.soft(s.h, `${s.name}: strip height`).toBe(stripH);
  expect.soft(s.line, `${s.name}: the line is one 1 px inset row at the bottom`).toBe(`${T['--hx-folder-line']} 0px -1px 0px 0px inset`);
  if (light) {
    expect.soft(T['--hx-folder-tab'], `${s.name}: grey tab #e0e0e0`).toBe(LIGHT.tab);
    expect.soft(T['--hx-folder-line'], `${s.name}: line #c4c4c4`).toBe(LIGHT.line);
    expect.soft(T['--hx-folder-on'], `${s.name}: chosen tab white`).toBe(LIGHT.on);
    expect.soft(T['--hx-folder-on-text'], `${s.name}: chosen text #1c1c1c`).toBe(LIGHT.onText);
  }
  expect.soft(T['--hx-folder-tab'], `${s.name}: the grey tab and the chosen tab differ`).not.toBe(T['--hx-folder-on']);
  for (let i = 1; i < s.tabs.length; i++) {
    const [a, b] = [s.tabs[i - 1], s.tabs[i]];
    if (a && b) expect.soft(Math.round((b.left - a.right) * 2) / 2, `${s.name}: 3 px between ${a.label} and ${b.label}`).toBe(3);
  }
  if (s.px) {
    expect.soft(s.px.grey, `${s.name}: the line under a grey tab is the line in a gap (painted once)`).toBe(s.px.gap);
    expect.soft(s.px.chosen, `${s.name}: the chosen tab's fill covers the line`).not.toBe(s.px.gap);
    expect.soft(s.px.greyAbove, `${s.name}: above the lift a grey tab shows what the gap shows (it is drawn lower)`).toBe(s.px.gapAbove);
    expect.soft(s.px.greyBelow, `${s.name}: below the lift a grey tab is filled`).not.toBe(s.px.gapAbove);
    if (light) {
      // The frame is drawn in the line's colour, at the lift and down each side, and stands off the page.
      expect.soft([s.px.edge, s.px.side], `${s.name}: a grey tab's top edge and side are the line's colour`).toEqual([s.px.gap, s.px.gap]);
      // On whatever surface the strip sits on: 1.57:1 on the #f0f0f0 page, 1.46:1 on the Computers toolbar's darker ground.
      expect.soft(ratio(s.px.side, s.px.greyAbove), `${s.name}: the frame stands 1.4:1 off the surface around it`).toBeGreaterThanOrEqual(1.4);
    } else {
      expect.soft([s.px.edge, s.px.side], `${s.name}: dark draws no frame (the frame is the fill)`).toEqual([s.px.greyBelow, s.px.greyBelow]);
    }
  }
  expect.soft(s.line, `${s.name}: the line is an inset bottom shadow in --hx-folder-line`).toContain(T['--hx-folder-line']);
  expect.soft(s.line, `${s.name}: inset`).toContain('inset');
  expect.soft(s.underlines, `${s.name}: no ink underline`).toBe(0);
  expect.soft(s.tabs.filter((t) => t.chosen).length, `${s.name}: one chosen tab`).toBe(1);
  for (const t of s.tabs) {
    const id = `${s.name}/${t.label}`;
    expect.soft(Math.round(t.h), `${id}: box is the strip's height (a full-height target)`).toBe(stripH);
    expect.soft(Math.round(t.bottom - s.bottom), `${id}: sits on the strip's bottom`).toBe(0);
    expect.soft(t.radius, `${id}: square`).toBe(0);
    expect.soft([t.padStart, t.padEnd], `${id}: 14 px each side`).toEqual([14, 14]);
    expect.soft([t.frameSideW, t.frameEndW, t.frameBottomW], `${id}: a 1 px frame at both sides and the bottom`).toEqual([1, 1, 1]);
    if (t.chosen) {
      expect.soft(t.bg, `${id}: chosen fill`).toBe(T['--hx-folder-on']);
      expect.soft(t.img, `${id}: chosen has no painted lift`).toBe('none');
      for (const [side, c] of [['top', t.frameTop], ['start', t.frameStart], ['end', t.frameEnd]] as const) expect.soft(c, `${id}: framed (${side})`).toBe(T['--hx-folder-line']);
      expect.soft(t.frameTopW, `${id}: frame width`).toBe(1);
      expect.soft(t.frameBottom, `${id}: open at the bottom (its fill covers the line)`).toBe(T['--hx-folder-on']);
      expect.soft(t.color, `${id}: chosen text`).toBe(T['--hx-folder-on-text']);
      expect.soft(ratio(t.color, t.bg), `${id}: chosen text 4.5:1`).toBeGreaterThanOrEqual(4.5);
    } else {
      expect.soft(t.bg, `${id}: no flat fill (the grey is painted from the lift down)`).toBe('rgba(0, 0, 0, 0)');
      // Two layers: the fill on the padding box from one line under the lift; under it the frame on the whole box, clear down
      // to the 4 px lift, to the last pixel, the last pixel clear (the strip's line shows there once).
      expect.soft(t.img, `${id}: the fill from under the lift, over the frame from the lift to the last pixel`).toBe(
        `linear-gradient(rgba(0, 0, 0, 0) ${lift + 1}px, ${T['--hx-folder-tab']} ${lift + 1}px), ` +
          `linear-gradient(rgba(0, 0, 0, 0) ${lift}px, ${T['--hx-folder-tab-line']} ${lift}px, ${T['--hx-folder-tab-line']} calc(100% - 1px), rgba(0, 0, 0, 0) calc(100% - 1px))`,
      );
      expect.soft(T['--hx-folder-tab-line'], `${id}: the frame is the line's colour in light, the fill in dark`).toBe(light ? T['--hx-folder-line'] : T['--hx-folder-tab']);
      expect.soft([t.clip, t.origin], `${id}: the fill on the padding box, the frame on the whole box`).toEqual(['padding-box, border-box', 'padding-box, border-box']);
      expect.soft(t.padTop, `${id}: its label sits in the drawn tab`).toBe(lift);
      expect.soft(t.frameTopW, `${id}: no top frame`).toBe(0);
      expect.soft(t.color, `${id}: grey tab text`).toBe(T['--hx-folder-text']);
      expect.soft(ratio(t.color, T['--hx-folder-tab'] ?? ''), `${id}: grey tab text 4.5:1 on the grey`).toBeGreaterThanOrEqual(4.5);
    }
  }
}

/** The colours drawn at some page pixels, from ONE screenshot of the box around them (as d18strip.spec reads one pixel,
 * decoded in the page, so each colour reads as getComputedStyle writes one). */
async function pixels(page: Page, points: { x: number; y: number }[]): Promise<string[]> {
  const x0 = Math.min(...points.map((p) => p.x));
  const y0 = Math.min(...points.map((p) => p.y));
  const width = Math.max(...points.map((p) => p.x)) - x0 + 1;
  const height = Math.max(...points.map((p) => p.y)) - y0 + 1;
  const b64 = (await page.screenshot({ clip: { x: x0, y: y0, width, height }, animations: 'disabled' })).toString('base64');
  return page.evaluate(
    async ({ src, w, h, at }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      // The image may be at the device's pixel ratio: scale each page pixel into it.
      const sx = img.naturalWidth / w;
      const sy = img.naturalHeight / h;
      return at.map(({ x, y }) => {
        const [r, g, b] = ctx.getImageData(Math.floor(x * sx), Math.floor(y * sy), 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
      });
    },
    { src: b64, w: width, h: height, at: points.map((p) => ({ x: p.x - x0, y: p.y - y0 })) },
  );
}

/** The line's row read from the screen: in the first gap, under the first grey tab, under the chosen tab; and one row
 * above and below the lift line, in that gap and that grey tab. One screenshot per strip. */
async function linePixels(page: Page, s: Strip): Promise<Strip> {
  const [a, b] = s.tabs;
  const grey = s.tabs.find((t) => !t.chosen);
  const chosen = s.tabs.find((t) => t.chosen);
  if (!a || !b || !grey || !chosen) return s;
  const mid = (t: Tab) => Math.round((t.left + t.right) / 2);
  const gapX = Math.floor(a.right) + 1;
  const liftRow = Math.round(grey.top + parseFloat(s.tokens['--tabs-lift'] ?? '0'));
  await page.mouse.move(0, 0);
  const [gap = '', greyPx = '', chosenPx = '', gapAbove = '', greyAbove = '', greyBelow = '', edge = '', side = ''] = await pixels(page, [
    { x: gapX, y: s.lineRow },
    { x: mid(grey), y: s.lineRow },
    { x: mid(chosen), y: s.lineRow },
    { x: gapX, y: liftRow - 1 },
    { x: mid(grey), y: liftRow - 1 },
    { x: mid(grey), y: liftRow + 1 },
    { x: mid(grey), y: liftRow },
    // The tab's first column: its side border (Chrome snaps borders to whole pixels; a fractional left rounds onto it).
    { x: Math.round(grey.left), y: liftRow + 6 },
  ]);
  return { ...s, px: { gap, grey: greyPx, chosen: chosenPx, gapAbove, greyAbove, greyBelow, edge, side } };
}

/** The strips the source names: Notifications' tabs, the two Computers switches, and Bare metal's Listings | Reservations. */
async function strips(page: Page, theme: 'light' | 'dark') {
  await gotoHub(page, '/notifications', { theme });
  const tabs = await linePixels(page, await read(page, '[role=tablist]', 'Notifications'));
  await gotoHub(page, '/computers', { theme });
  const view = await linePixels(page, await read(page, '[role=tablist]', 'View'));
  const as = await linePixels(page, await read(page, '[role=radiogroup]', 'View as'));
  await gotoHub(page, '/billing?view=servers', { theme });
  const market = await linePixels(page, await read(page, '[role=radiogroup]', marketStrings.tabs));
  return [tabs, view, as, market];
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`folder tabs, ${theme}`, () => {
    test.use({ viewport: { width: 1350, height: 900 } });
    test(`fine pointer: grey 30 px tabs on the line, the chosen tab white, 34 px, framed, open at the bottom (${theme})`, async ({ page }) => {
      // Cards | List sits in the table's toolbar, where a folder strip is one of the row's controls: as tall as the
      // search field beside it (40), never shorter than a tab strip (SegmentedControl.module.css, [data-tb-size]).
      for (const s of await strips(page, theme)) check(s, s.name === 'View as' ? 40 : 34, theme === 'light');
      expect(test.info().errors).toEqual([]);
    });
  });
  test.describe(`folder tabs on touch, ${theme}`, () => {
    test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
    test(`touch: the strip and every tab box are 44 px (${theme})`, async ({ page }) => {
      for (const s of await strips(page, theme)) check(s, 44, theme === 'light');
      expect(test.info().errors).toEqual([]);
    });
  });
}

// Forced colours: shadows and gradients are gone, so the strip keeps its own line, a grey tab shows a
// frame, the chosen tab is still open at the bottom, and keyboard focus on a tab is an outline (not a shadow).
test.describe('folder tabs, forced colours', () => {
  test.use({ viewport: { width: 1350, height: 900 } });
  test('forced colours: one line under every tab, grey tabs framed, the chosen tab open, focus outlined', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoHub(page, '/notifications', { theme: 'light' });
    const tabs = await linePixels(page, await read(page, '[role=tablist]', 'Notifications'));
    await gotoHub(page, '/computers', { theme: 'light' });
    const view = await linePixels(page, await read(page, '[role=tablist]', 'View'));
    for (const s of [tabs, view]) {
      expect.soft(s.px, `${s.name}: the line read from the screen`).toBeDefined();
      if (s.px) {
        expect.soft(s.px.grey, `${s.name}: the line shows under a grey tab as in a gap`).toBe(s.px.gap);
        expect.soft(s.px.chosen, `${s.name}: the chosen tab is open at the bottom`).not.toBe(s.px.gap);
      }
      for (const t of s.tabs) {
        const id = `${s.name}/${t.label}`;
        if (t.chosen) expect.soft(t.frameBottom, `${id}: chosen bottom edge is its own fill`).toBe(t.bg);
        else expect.soft(t.frameTop, `${id}: a grey tab shows a frame`).not.toBe('rgba(0, 0, 0, 0)');
      }
    }
    await gotoHub(page, '/notifications', { theme: 'light' });
    // Focus the chosen tab where it is (an arrow key would change the page: these tabs are addresses), then a key press
    // on it switches focus to keyboard mode and shows the ring. Pressing before focus raced the focus listeners (4 runs in 12).
    const chosen = page.locator('[role=tablist][aria-label="Notifications"] [role=tab][aria-selected="true"]').first();
    await chosen.focus();
    await page.keyboard.press('Shift');
    await expect.soft(chosen, 'keyboard focus shows on the tab').toHaveAttribute('data-focus-visible', /.*/);
    const ring = await chosen.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { focused: document.activeElement === el, style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
    });
    expect.soft(ring.focused, 'keyboard focus is on the tab').toBe(true);
    expect.soft([ring.style, ring.width], 'a focused tab is outlined in forced colours').toEqual(['solid', 2]);
    expect(test.info().errors).toEqual([]);
  });
});
