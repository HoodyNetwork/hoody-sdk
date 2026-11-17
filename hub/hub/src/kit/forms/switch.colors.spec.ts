// Playwright ("Square grey, yellow on"): a kit Switch is a square 34 x 20 track with a square
// 14 px thumb. OFF is the grey track (--hx-switch-off) framed in --hx-switch-line with a white thumb (--hx-switch-thumb)
// framed in the same line; ON is the yellow (--hx-switch-on) framed in --hx-switch-on-line, the thumb framed in it too.
// The gallery forms tab's switch, read on and then turned off. The colours come from the tokens (none pinned here).
// Each state's track stands out (3:1, WCAG 1.4.11, by its painted frame or its fill) from the surface it is on and from
// every surface a switch sits on in the Hub, hover, selected and warning tints included (SURFACES). A frame counts only
// when it is painted (a width and a style), the switch is drawn at full opacity, and a translucent colour is laid over
// what is under it. The knob stands out from its track (by its painted frame or its fill, 3:1), is drawn inside it, and
// sits at the start when off and at the end when on, so colour is never the only sign. Light and dark. Soft checks: a run names every failing reading.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/strings.en.json';

/** Surfaces a switch sits on, as layers from the bottom (tokens): cards and panels, table rows hovered or selected,
 *  a warning or danger tint on a card, the secondary and fill greys. */
const SURFACES: string[][] = [
  ['--hx-raised'],
  ['--hx-raised', '--hx-hover'],
  ['--hx-raised', '--hx-selected'],
  ['--hx-card'],
  ['--hx-card', '--hx-hover'],
  ['--hx-card', '--hx-selected'],
  ['--hx-card', '--hx-warn-t'],
  ['--hx-card', '--hx-danger-t'],
  ['--hx-bg'],
  ['--hx-fill'],
  ['--hx-sidebar'],
  ['--hx-sec-bg'],
];

interface Read {
  on: boolean;
  fill: string;
  frame: string;
  knob: string;
  /** The knob's frame colour, painted over its fill. */
  knobFrame: string;
  /** Track and knob corners (the larger computed radius of each) and sizes, px. */
  trackRadius: number;
  knobRadius: number;
  trackW: number;
  trackH: number;
  knobW: number;
  knobH: number;
  /** The frame is painted: a width of at least 1 px and a visible style. */
  framed: boolean;
  /** The opacity the switch is drawn at (its own and its ancestors', multiplied). */
  opacity: number;
  /** Contrast of the track's edge (the better of painted frame and fill) against the surface under the switch. */
  edge: number;
  /** The same against each of SURFACES, by name. */
  edges: Record<string, number>;
  /** Contrast of the knob's edge (the better of its painted frame and its fill) against the track's fill. */
  knobOnFill: number;
  /** The track and the knob are drawn: not display none, visibility hidden or opacity 0 (checkVisibility with the
   *  visibility and opacity checks on; the plain call skips CSS visibility). */
  drawn: boolean;
  /** The knob has a size and lies inside the track's box. */
  knobInside: boolean;
  /** The knob's centre from the track's start edge, as a share of the track's width (0 start, 1 end). */
  at: number;
}

async function readSwitches(page: Page): Promise<{ tokens: Record<string, string>; rows: Read[] }> {
  return page.evaluate((surfaces) => {
    type C = [number, number, number, number];
    const probe = document.createElement('span');
    document.body.append(probe);
    // Any CSS colour (a token, color-mix, rgba) to rgba numbers, through the browser.
    const rgba = (css: string): C => {
      probe.style.color = '';
      probe.style.color = css;
      const m = getComputedStyle(probe).color.match(/(rgba?|color)\(([^)]+)\)/);
      if (!m) throw new Error(`unread colour: ${css}`);
      const [r = 0, g = 0, b = 0, a = 1] = (m[2] ?? '').replace('srgb', '').split(/[ ,/]+/).filter(Boolean).map(Number);
      const k = m[1] === 'color' ? 255 : 1;
      return [r * k, g * k, b * k, a];
    };
    const over = ([r, g, b, a]: C, [R, G, B]: C): C => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
    // What is painted under an element: its own background and its ancestors', down to the first opaque one.
    const surface = (el: Element | null): C => {
      const layers: C[] = [];
      for (let e = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
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
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
      return (x + 0.05) / (y + 0.05);
    };
    const hex = (c: C) => `rgb(${c.slice(0, 3).map((v) => Math.round(v)).join(',')})`;
    const root = getComputedStyle(document.documentElement);
    const token = (t: string) => rgba(root.getPropertyValue(t).trim());
    const tokens = Object.fromEntries(['--hx-switch-off', '--hx-switch-line', '--hx-switch-thumb', '--hx-switch-on', '--hx-switch-on-line'].map((t) => [t, hex(token(t))]));
    const named = surfaces.map((layers) => {
      let c: C = [255, 255, 255, 1];
      for (const t of layers) c = over(token(t), c);
      return [layers.join(' + '), c] as const;
    });
    const rows = [...document.querySelectorAll('input[role=switch]')].flatMap((input) => {
      const label = input.closest('label');
      const track = label?.querySelector('[class*="fields-module__track"]');
      const knob = track?.firstElementChild;
      if (!label || !track || !knob || !(label as HTMLElement).checkVisibility()) return [];
      let opacity = 1;
      for (let e: Element | null = knob; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
      const ts = getComputedStyle(track);
      const framed = parseFloat(ts.borderInlineStartWidth) >= 1 && !['none', 'hidden'].includes(ts.borderInlineStartStyle);
      // The fill over what is under the switch; the frame is painted over the fill (the background runs under the border).
      const paint = (under: C) => {
        const fill = over(rgba(ts.backgroundColor), under);
        const frame = over(rgba(ts.borderInlineStartColor), fill);
        return { fill, frame, edge: Math.max(ratio(fill, under), framed ? ratio(frame, under) : 0) };
      };
      const here = paint(surface(label));
      const ks = getComputedStyle(knob);
      const knobC = over(rgba(ks.backgroundColor), here.fill);
      const knobFramed = parseFloat(ks.borderInlineStartWidth) >= 1 && !['none', 'hidden'].includes(ks.borderInlineStartStyle);
      const knobFrameC = over(rgba(ks.borderInlineStartColor), knobC);
      const radius = (cs: CSSStyleDeclaration) => Math.max(...[cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map((v) => parseFloat(v) || 0));
      const tr = track.getBoundingClientRect();
      const kr = knob.getBoundingClientRect();
      const seen = { visibilityProperty: true, opacityProperty: true };
      const drawn = (track as HTMLElement).checkVisibility(seen) && (knob as HTMLElement).checkVisibility(seen);
      const knobInside =
        kr.width > 0 && kr.height > 0 &&
        kr.left >= tr.left - 0.5 && kr.right <= tr.right + 0.5 && kr.top >= tr.top - 0.5 && kr.bottom <= tr.bottom + 0.5;
      const rtl = ts.direction === 'rtl';
      const centre = kr.left + kr.width / 2 - tr.left;
      return [
        {
          on: (input as HTMLInputElement).checked,
          fill: hex(here.fill),
          frame: hex(here.frame),
          knob: hex(knobC),
          knobFrame: hex(knobFrameC),
          trackRadius: radius(ts),
          knobRadius: radius(ks),
          trackW: tr.width,
          trackH: tr.height,
          knobW: kr.width,
          knobH: kr.height,
          framed,
          opacity,
          edge: here.edge,
          edges: Object.fromEntries(named.map(([n, c]) => [n, paint(c).edge])),
          knobOnFill: Math.max(ratio(knobC, here.fill), knobFramed ? ratio(knobFrameC, here.fill) : 0),
          drawn,
          knobInside,
          at: (rtl ? tr.width - centre : centre) / tr.width,
        },
      ];
    });
    probe.remove();
    return { tokens, rows };
  }, SURFACES);
}

/** Reads the switches once the knobs' slides have finished (only the switches' own transitions are waited for). */
async function settledRead(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => {
          const el = (a.effect as KeyframeEffect | null)?.target;
          return el instanceof Element && el.closest('[class*="fields-module__track"]') !== null;
        })
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  return readSwitches(page);
}

for (const theme of ['light', 'dark'] as const) {
  test(`a gallery switch is square, grey when off and yellow when on, stands out, and its knob says the state too (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, '/_kit?tab=forms', { theme });
    // The forms tab's switch (Nightly snapshots) opens on: read it, turn it off as a person would, and read it again.
    const snapshots = page.getByRole('switch', { name: gallery['f.backups'], exact: true });
    await expect(snapshots).toBeChecked();
    const before = await settledRead(page);
    await snapshots.click({ force: true });
    await expect(snapshots).not.toBeChecked();
    const after = await settledRead(page);
    const tokens = after.tokens;
    const rows = [...before.rows, ...after.rows];
    expect(rows.some((r) => r.on), 'the switch was read on').toBe(true);
    expect(rows.some((r) => !r.on), 'the switch was read off').toBe(true);
    for (const [i, r] of rows.entries()) {
      const at = `switch ${i} (${r.on ? 'on' : 'off'})`;
      expect.soft(r.fill, `${at}: fill`).toBe(r.on ? tokens['--hx-switch-on'] : tokens['--hx-switch-off']);
      expect.soft(r.frame, `${at}: frame`).toBe(r.on ? tokens['--hx-switch-on-line'] : tokens['--hx-switch-line']);
      expect.soft(r.framed, `${at}: the frame is painted`).toBe(true);
      expect.soft(r.knob, `${at}: knob`).toBe(tokens['--hx-switch-thumb']);
      expect.soft(r.knobFrame, `${at}: knob frame`).toBe(r.on ? tokens['--hx-switch-on-line'] : tokens['--hx-switch-line']);
      expect.soft([r.trackW, r.trackH], `${at}: the track is 34 x 20`).toEqual([34, 20]);
      expect.soft([r.knobW, r.knobH], `${at}: the knob is 14 x 14`).toEqual([14, 14]);
      expect.soft(r.trackRadius, `${at}: the track is square`).toBe(0);
      expect.soft(r.knobRadius, `${at}: the knob is square`).toBe(0);
      expect.soft(r.opacity, `${at}: drawn at full opacity`).toBe(1);
      expect.soft(r.edge, `${at}: the track's edge against the surface under it`).toBeGreaterThanOrEqual(3);
      for (const [name, edge] of Object.entries(r.edges)) expect.soft(edge, `${at}: the track's edge on ${name}`).toBeGreaterThanOrEqual(3);
      expect.soft(r.knobOnFill, `${at}: the knob against its track`).toBeGreaterThanOrEqual(3);
      expect.soft(r.drawn, `${at}: the track and the knob are drawn (visible)`).toBe(true);
      expect.soft(r.knobInside, `${at}: the knob lies inside the track`).toBe(true);
      if (r.on) expect.soft(r.at, `${at}: the knob at the end`).toBeGreaterThan(0.6);
      else expect.soft(r.at, `${at}: the knob at the start`).toBeLessThan(0.4);
    }
  });
}
