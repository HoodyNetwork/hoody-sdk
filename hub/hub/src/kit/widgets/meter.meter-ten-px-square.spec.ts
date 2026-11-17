// Playwright: every kit Meter is a ten-block track, 8 px tall, square, with
// 2 px gaps; empty blocks are the light grey, lit blocks the ink, and a toned meter (warn, danger) lights its blocks in
// the switch yellow with a 1 px dark edge (the switch recipe: yellow alone is 1.1:1 on the grey, the edge 3:1+).
// Lit blocks are whole blocks: ceil(value / 10), so 10% lights exactly one. Counted from the drawn pixels, both
// themes, fine and coarse pointers; forced colours draws the track and the lit blocks in system colours.
import { devices, expect, type Locator, type Page } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import cs from '../../pages/computers/strings.en.json';
import k3 from '../gallery/kit3.strings.en.json';

const LIGHT = { track: 'rgb(222, 222, 222)', ink: 'rgb(39, 39, 39)', tone: 'rgb(238, 255, 34)', edge: 'rgb(28, 28, 28)' };

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

async function look(m: Locator) {
  return m.evaluate((el) => {
    const c = getComputedStyle(el);
    const bar = el.firstElementChild as HTMLElement;
    const b = getComputedStyle(bar);
    // A toned bar is the edge colour with the tone laid over it in its ::before.
    const t = getComputedStyle(bar, '::before');
    const toned = t.content !== 'none' && t.content !== 'normal' && t.display !== 'none';
    const r = el.getBoundingClientRect();
    return {
      w: r.width,
      h: Math.round(r.height * 10) / 10,
      radius: c.borderTopLeftRadius,
      mask: c.maskImage || c.webkitMaskImage,
      track: c.backgroundColor,
      fill: toned ? t.backgroundColor : b.backgroundColor,
      edge: toned ? b.backgroundColor : 'none',
      toneMask: toned ? `${t.maskImage} | ${t.maskComposite} | ${t.maskPosition}` : 'none',
      barW: bar.getBoundingClientRect().width,
      lit: bar.style.getPropertyValue('--meter-lit'),
      clip: getComputedStyle(bar).clipPath,
    };
  });
}

type Drawn = { kinds: string; gapsClear: number; edgeSides: number; edgeTop: number; edgeBottom: number; dpr: number };

/** The meter as drawn, read from its screenshot at the places the ten-block geometry puts things: the track's tenth is
 *  one period, a block its first (period - 2 px), the gap the rest. Each block's inside (1 px in from each side, so an
 *  edge stroke is left out) is read on every pixel row between the top and bottom strokes and classed L when 90% of it
 *  is the lit colour, E when 90% is the empty colour, else M (a partly painted or missing block). gapsClear counts gaps
 *  whose every device column (mid row) shows the surface under the meter while the columns just outside them do not.
 *  For lit blocks, edgeSides counts those whose first and last pixel columns are nearer the edge colour than the fill,
 *  edgeTop those whose top pixel row is and edgeBottom those whose bottom pixel row is. */
async function drawn(page: Page, m: Locator, c: { empty: string; fill: string; edge?: string }): Promise<Drawn> {
  const under = await m.evaluate((el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const bg = getComputedStyle(p).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    }
    return getComputedStyle(document.body).backgroundColor;
  });
  const cssW = (await m.boundingBox())?.width ?? 1;
  const png = (await m.screenshot({ animations: 'disabled' })).toString('base64');
  return page.evaluate(
    async ({ b64, c, under, cssW }) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const cv = new OffscreenCanvas(img.width, img.height);
      const g = cv.getContext('2d');
      if (!g) throw new Error('no 2d');
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, img.width, img.height).data;
      const dpr = img.width / cssW;
      const rgb = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
      const [E, F, U] = [rgb(c.empty), rgb(c.fill), rgb(under)];
      const EDGE = c.edge ? rgb(c.edge) : null;
      const d = (x: number, y: number, k: number[]) => {
        const i = (y * img.width + x) * 4;
        return Math.abs((data[i] ?? 0) - (k[0] ?? 0)) + Math.abs((data[i + 1] ?? 0) - (k[1] ?? 0)) + Math.abs((data[i + 2] ?? 0) - (k[2] ?? 0));
      };
      const P = cssW / 10;
      const inner = (a: number, b: number) => {
        const out: number[] = [];
        for (let x = Math.ceil(a * dpr); x < Math.floor(b * dpr); x++) out.push(x);
        return out;
      };
      const rows = inner(1, img.height / dpr - 1);
      let kinds = '';
      let gapsClear = 0;
      let edgeSides = 0;
      let edgeTop = 0;
      let edgeBottom = 0;
      const gaps: [number, number, number[]][] = [];
      for (let k = 0; k < 10; k++) {
        const x0 = k * P;
        const x1 = x0 + P - 2;
        let lit = 0;
        let empty = 0;
        let n = 0;
        for (const y of rows)
          for (const x of inner(x0 + 1, x1 - 1)) {
            n++;
            if (d(x, y, F) < 40) lit++;
            else if (d(x, y, E) < 40) empty++;
          }
        const kind = n && lit / n >= 0.9 ? 'L' : n && empty / n >= 0.9 ? 'E' : 'M';
        kinds += kind;
        gaps.push([x1 * dpr, (x1 + 2) * dpr, inner(x1, x1 + 2)]);
        if (EDGE && kind === 'L') {
          const nearer = (x: number, y: number) => d(x, y, EDGE) < d(x, y, F);
          const mid = rows.filter((_, i) => i % 2 === 0);
          const left = Math.floor(x0 * dpr);
          const right = Math.ceil(x1 * dpr) - 1;
          if (mid.every((y) => nearer(left, y)) && mid.every((y) => nearer(right, y))) edgeSides++;
          const top = Math.floor(dpr / 2);
          if (inner(x0, x1).every((x) => nearer(x, top))) edgeTop++;
          const bottom = img.height - 1 - Math.floor(dpr / 2);
          if (inner(x0, x1).every((x) => nearer(x, bottom))) edgeBottom++;
        }
      }
      // The gap is [x1, x1 + 2) css px: every device column in it is clear, and the column just outside it on each
      // side is not (a block), so a gap of any other width or place fails. A lit toned block's outer column is its
      // edge stroke, which in the dark theme is the surface's own near-black: that side alone is not readable.
      const gy = Math.floor(img.height / 2);
      const clear = (x: number) => d(x, gy, U) < 24;
      const blends = !!EDGE && Math.abs((EDGE[0] ?? 0) - (U[0] ?? 0)) + Math.abs((EDGE[1] ?? 0) - (U[1] ?? 0)) + Math.abs((EDGE[2] ?? 0) - (U[2] ?? 0)) < 24;
      const sideOk = (x: number, k: number) => (blends && kinds[k] === 'L') || !clear(x);
      gaps.slice(0, 9).forEach(([ga, gb, span], k) => {
        if (span.length && span.every(clear) && sideOk(Math.floor(ga) - 1, k) && sideOk(Math.ceil(gb), k + 1)) gapsClear++;
      });
      return { kinds, gapsClear, edgeSides, edgeTop, edgeBottom, dpr };
    },
    { b64: png, c, under, cssW },
  );
}

/** Ten whole blocks, `lit` of them lit from inline-start, nine clear gaps each exactly 2 px wide; toned: every lit
 *  block edged on both sides, along the top and along the bottom. */
async function expectBlocks(page: Page, m: Locator, c: { empty: string; fill: string; edge?: string }, lit: number, what: string, rtl = false) {
  const r = await drawn(page, m, c);
  const want = 'L'.repeat(lit) + 'E'.repeat(10 - lit);
  expect(r.kinds, `${what}: ten whole blocks, ${lit} lit from inline-start`).toBe(rtl ? [...want].reverse().join('') : want);
  expect(r.gapsClear, `${what}: nine clear 2 px gaps`).toBe(9);
  if (c.edge) expect([r.edgeSides, r.edgeTop, r.edgeBottom], `${what}: each lit block edged on both sides, top and bottom`).toEqual([lit, lit, lit]);
  return r;
}

/** WCAG contrast of two computed rgb() colours. */
function contrast(a: string, b: string) {
  const lum = (c: string) => {
    const [r = 0, g = 0, bl = 0] = (c.match(/\d+/g) ?? []).map(Number).map((x) => {
      const v = x / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const meter = (page: Page, i: number) => page.getByRole('meter', { name: k3['meter.diskName'] }).nth(i); // gallery order

for (const theme of ['light', 'dark'] as const) {
  test(`a meter is ten 8 px square blocks, lit as whole blocks, ink or toned yellow (${theme})`, async ({ hubPage: page }) => {
    await gotoHub(page, '/_kit?tab=pieces', { theme });
    await expect(page.locator('html')).toHaveAttribute('data-hx-theme', theme);
    await meter(page, 0).waitFor({ timeout: 15_000 });
    const track = await token(page, '--hx-meter-track');
    const ink = await token(page, '--hx-meter-fill');
    const tone = await token(page, '--hx-meter-tone');
    const edge = await token(page, '--hx-meter-edge');
    expect(tone, 'the toned meter is the switch yellow').toBe(await token(page, '--hx-switch-on'));
    // 3:1 for graphics (WCAG 1.4.11): lit ink on the empty grey. A toned block tells itself from an empty one by its
    // yellow or by its edge, whichever reaches 3:1 on the grey (light: the edge, the yellow is 1.2:1; dark: the yellow).
    expect(contrast(ink, track), 'ink on the empty grey: 3:1').toBeGreaterThanOrEqual(3);
    expect(Math.max(contrast(edge, track), contrast(tone, track)), 'a toned block on the empty grey: 3:1').toBeGreaterThanOrEqual(3);
    expect(contrast(edge, tone), 'the toned edge on its yellow: 3:1').toBeGreaterThanOrEqual(3);
    if (theme === 'light') expect(contrast(edge, track), 'light: the edge carries it').toBeGreaterThanOrEqual(3);
    if (theme === 'light') expect([track, ink, tone, edge], 'light literals').toEqual([LIGHT.track, LIGHT.ink, LIGHT.tone, LIGHT.edge]);
    // Gallery: 10, 30, 80 (warn), 95 (danger), 95 neutral, 62 filling its row.
    const want = [
      { v: 10, lit: 1, toned: false },
      { v: 30, lit: 3, toned: false },
      { v: 80, lit: 8, toned: true },
      { v: 95, lit: 10, toned: true },
      { v: 95, lit: 10, toned: false },
      { v: 62, lit: 7, toned: false },
    ];
    for (const [i, w] of want.entries()) {
      const m = meter(page, i);
      await expect(m, `meter ${i}: exact value kept`).toHaveAttribute('aria-valuenow', String(w.v));
      const l = await look(m);
      expect([l.h, l.radius], `meter ${i}: 8 px, square`).toEqual([8, '0px']);
      expect(l.mask, `meter ${i}: the ten-block mask`).toContain('repeating-linear-gradient');
      expect(l.track, `meter ${i}: the empty grey`).toBe(track);
      expect(l.fill, `meter ${i}: lit colour`).toBe(w.toned ? tone : ink);
      if (w.toned) expect(l.edge, `meter ${i}: the 1 px dark edge`).toContain(edge);
      // the tone is cut by the track's own mask twice, 1 px each way, kept where both hold: the strokes are the mask's
      if (w.toned) expect(l.toneMask, `meter ${i}: the tone cut by the track mask moved 1 px each way`).toMatch(/^repeating-linear-gradient.*, repeating-linear-gradient.* \| intersect(, intersect)? \| 1px 0px, -1px 0px$/);
      // both tone layers are the track's own mask, not gradients of their own
      if (w.toned) expect(l.toneMask.split(' | ')[0], `meter ${i}: both tone layers are the track's mask`).toBe(`${l.mask}, ${l.mask}`);
      else expect(l.edge, `meter ${i}: no edge on an ink meter`).toBe('none');
      // The bar is the track's own box, clipped to whole blocks: its strokes share the mask's period.
      expect(Math.abs(l.barW - l.w), `meter ${i}: the bar spans the whole track`).toBeLessThan(0.01);
      expect(l.lit, `meter ${i}: clipped to whole blocks (${w.lit})`).toBe(`${w.lit * 10}%`);
      expect(l.clip, `meter ${i}: a clip, not a width`).toContain('inset');
      await expectBlocks(page, m, { empty: track, fill: w.toned ? tone : ink, ...(w.toned ? { edge } : {}) }, w.lit, `meter ${i}`);
    }
    // Ten whole 6 px periods: the small meter is 60 px, each block 4 px.
    expect((await look(meter(page, 0))).w, 'small meter: 60 px').toBe(60);
  });
}

test('the busy meter is the same 8 px square track and still moves', async ({ hubPage: page }) => {
  await gotoHub(page, '/_kit?tab=pieces', { theme: 'light' });
  const busy = page.getByRole('progressbar', { name: k3['meter.busyName'] });
  await busy.waitFor({ timeout: 15_000 });
  const l = await busy.evaluate((el) => {
    const c = getComputedStyle(el);
    return { h: el.getBoundingClientRect().height, radius: c.borderTopLeftRadius, anim: getComputedStyle(el, '::after').animationName };
  });
  expect([l.h, l.radius], 'busy: 8 px, square').toEqual([8, '0px']);
  expect(l.anim, 'busy: still slides').not.toBe('none');
});

test('on a coarse pointer a meter keeps its ten 8 px blocks', async ({ hubPageCoarse: page }) => {
  await gotoHub(page, '/_kit?tab=pieces', { theme: 'light' });
  const m = meter(page, 1);
  await m.waitFor({ timeout: 15_000 });
  const l = await look(m);
  expect(l.h, 'coarse: 8 px').toBe(8);
  await expectBlocks(page, m, { empty: LIGHT.track, fill: LIGHT.ink }, 3, 'coarse');
});

test('in forced colours the track and the lit blocks are system colours', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await gotoHub(page, '/_kit?tab=pieces', { theme: 'light' });
  const m = meter(page, 2);
  await m.waitFor({ timeout: 15_000 });
  const l = await look(m);
  const sys = await page.evaluate(() => {
    const d = document.createElement('div');
    document.body.append(d);
    d.style.color = 'GrayText';
    const gray = getComputedStyle(d).color;
    d.style.color = 'CanvasText';
    const text = getComputedStyle(d).color;
    d.remove();
    return { gray, text };
  });
  expect(l.track, 'forced: empty blocks GrayText').toBe(sys.gray);
  expect(l.fill, 'forced: lit blocks CanvasText').toBe(sys.text);
  // The bar is clipped here too: the clip must leave all eight lit blocks drawn.
  expect(l.clip, 'forced: the bar is still clipped to its lit blocks').toContain('inset');
  await expectBlocks(page, m, { empty: sys.gray, fill: sys.text }, 8, 'forced');
});

test('a server lane at its limit: the toned look, with the level in its name and its value in words', async ({ hubPage: page }) => {
  await gotoHub(page, '/computers/servers', { theme: 'light' });
  const full = page.getByRole('meter', { name: /: Limit reached/ }).first(); // any lane at its limit draws alike
  await full.waitFor({ timeout: 15_000 });
  await expect(full, 'value kept').toHaveAttribute('aria-valuenow', '100');
  await expect(full, 'the level in words').toHaveAttribute('aria-valuetext', '100%, very high');
  const l = await look(full);
  expect(l.fill, 'toned yellow').toBe(await token(page, '--hx-meter-tone'));
  expect(l.edge, 'with its dark edge').toContain(await token(page, '--hx-meter-edge'));
  await expectBlocks(page, full, { empty: await token(page, '--hx-meter-track'), fill: l.fill, edge: await token(page, '--hx-meter-edge') }, 10, 'server lane at its limit');
});

test('right to left: the blocks light from the right, each toned block still edged', async ({ hubPage: page }) => {
  await gotoHub(page, '/_kit?tab=pieces', { theme: 'light' });
  await meter(page, 0).waitFor({ timeout: 15_000 });
  await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
  try {
    await expectBlocks(page, meter(page, 1), { empty: LIGHT.track, fill: LIGHT.ink }, 3, 'rtl ink', true);
    await expectBlocks(page, meter(page, 2), { empty: LIGHT.track, fill: LIGHT.tone, edge: LIGHT.edge }, 8, 'rtl toned', true);
  } finally {
    await page.evaluate(() => document.documentElement.removeAttribute('dir'));
  }
});

test('the chalk highlight: a white toned block on the grey is told apart by its edge on every side', async ({ hubPage: page }) => {
  await gotoHub(page, '/_kit?tab=pieces', { theme: 'light' });
  await meter(page, 0).waitFor({ timeout: 15_000 });
  await page.evaluate(() => document.documentElement.setAttribute('data-hx-hl', 'chalk'));
  try {
    const tone = await token(page, '--hx-meter-tone');
    expect(tone, 'chalk: the tone is white').toBe('rgb(255, 255, 255)');
    await expectBlocks(page, meter(page, 2), { empty: LIGHT.track, fill: tone, edge: LIGHT.edge }, 8, 'chalk toned');
  } finally {
    await page.evaluate(() => document.documentElement.removeAttribute('data-hx-hl'));
  }
});

// The Computers list's Usage cell. Its read has no route: with usage on the read fails and the
// column is never added, so no page draws this cell. This mounts its real parts on the real list instead: inside a list
// cell, a 140 px box (the Usage column's `meta.width`) with that cell's own padding and a clip, holding the page's own
// `usageStack` rule (its CSS module class, read from the page's styles) and three real kit meters taken from the gallery.
// Every meter must sit inside the box, one under another.
async function stackedCell(page: Page, theme: 'light' | 'dark') {
  await gotoHub(page, '/_kit?tab=pieces', { theme });
  await meter(page, 0).waitFor({ timeout: 15_000 });
  const html = await Promise.all([1, 2, 3].map((i) => meter(page, i).evaluate((el) => el.outerHTML)));
  await gotoHub(page, '/computers', { theme });
  await page.getByRole('searchbox').first().waitFor({ timeout: 15_000 }); // the list's one search box
  await page.getByRole('row').nth(1).waitFor({ timeout: 15_000 }); // the first body row
  return page.evaluate(
    ({ html, header }) => {
      let stack = '';
      for (const sheet of [...document.styleSheets]) {
        let rules: CSSRuleList | null = null;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const r of [...rules]) {
          const m = r instanceof CSSStyleRule ? /^\.([\w-]*usageStack[\w-]*)$/.exec(r.selectorText) : null;
          if (m?.[1]) stack = m[1];
        }
      }
      if (!stack) throw new Error('no usageStack rule on the page');
      const ths = [...document.querySelectorAll('thead th')];
      const col = ths.length - 1;
      if (col < 0 || !header) throw new Error('no header');
      const cells = [...document.querySelectorAll('tbody tr')].map((tr) => tr.children[col]).filter((c): c is HTMLElement => c instanceof HTMLElement);
      if (!cells.length) throw new Error('no cells');
      const out = cells.map((td) => {
        const pad = getComputedStyle(td);
        const box = document.createElement('div');
        box.style.cssText = `box-sizing:border-box;inline-size:140px;overflow:hidden;padding-inline:${pad.paddingLeft} ${pad.paddingRight}`;
        box.innerHTML = `<span class="${stack}">${html.join('')}</span>`;
        td.replaceChildren(box);
        const c = box.getBoundingClientRect();
        const ms = [...box.querySelectorAll('[role="meter"]')].map((m) => m.getBoundingClientRect());
        return {
          cellW: Math.round(c.width),
          n: ms.length,
          inside: ms.every((r) => r.left >= c.left + parseFloat(pad.paddingLeft) - 0.5 && r.right <= c.right - parseFloat(pad.paddingRight) + 0.5 && r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5),
          stacked: ms.every((r, i) => i === 0 || r.top >= (ms[i - 1]?.bottom ?? 0) - 0.5),
          widths: ms.map((r) => Math.round(r.width)),
        };
      });
      return { stack, out };
    },
    { html, header: cs['col.usage'] },
  );
}

for (const theme of ['light', 'dark'] as const) {
  test(`the Computers list's Usage cell holds its three meters stacked inside the 140 px cell (fine, ${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 1000 });
    const r = await stackedCell(page, theme);
    for (const [i, c] of r.out.entries()) {
      expect(c.n, `cell ${i}: three meters`).toBe(3);
      expect(c.cellW, `cell ${i}: the 140 px column`).toBeLessThanOrEqual(140);
      expect(c.widths, `cell ${i}: small meters`).toEqual([60, 60, 60]);
      expect([c.inside, c.stacked], `cell ${i} (${c.cellW} px): inside the cell, one under another`).toEqual([true, true]);
    }
  });

  test(`the Computers list's Usage cell holds its three meters stacked inside the 140 px cell (coarse, ${theme})`, async ({ browser }) => {
    // A touch screen at a desktop width, so the list is still a table (the shared coarse page is phone-sized: cards).
    const ctx = await browser.newContext({ ...devices['Desktop Chrome'], viewport: { width: 1350, height: 1000 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    try {
      const r = await stackedCell(page, theme);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'a coarse pointer').toBe(true);
      for (const [i, c] of r.out.entries()) {
        expect(c.n, `coarse cell ${i}: three meters`).toBe(3);
        expect(c.cellW, `coarse cell ${i}: the 140 px column`).toBeLessThanOrEqual(140);
        expect([c.inside, c.stacked], `coarse cell ${i} (${c.cellW} px): inside the cell, one under another`).toEqual([true, true]);
      }
    } finally {
      await ctx.close();
    }
  });
}

// Raster limits: every device pixel of a toned meter, at
// fractional widths, at DPR 1 and 2. raster() reads the mid row's device columns as runs of E(edge)/F(fill)/T(track)/
// U(surface), and checks that down every fill column the top and bottom DPR rows are the edge. In dark the edge is the
// card's near-black, so on the card edge and surface read as one class (D, `blends`); the test then reads only the
// block order there, and checkRuns() judges the same meter on a diagnostic surface. At fractional widths the browser
// snaps the mask's stops to device pixels, so a block may be a pixel wider than its neighbour; the strokes must follow
// the drawn blocks, not an ideal float.
type Run = [string, number, number];

// The mid row's runs, judged: read in order as exactly ten blocks, each followed by
// its gap, and nothing else. A lit block is edge, fill, edge; an unlit block is track; every gap is exactly 2 x DPR
// surface columns, except the last, the mask's tail, which the shot's whole-column read may cut by one column (never
// missing) where the meter ends inside a device pixel; at a whole device width it is exact. Each block starts within
// one device pixel of k x width / 10. Every stroke is exactly DPR columns (the strokes are the mask's own block edges,
// d20-meter-stroke-snap). A stroke off by any amount, an edge anywhere but beside a fill, or any run left over fails. Needs a surface that is told apart from the edge
// (blends false); the dark card is checked separately.
export function checkRuns(runs: Run[], o: { lit: number; dpr: number; W: number }): string[] {
  const { lit, dpr, W } = o;
  const bad: string[] = [];
  // the shot's whole-column read cuts the tail only where the meter ends inside a device pixel
  const tailCut = Number.isInteger(Math.round(W * dpr * 1000) / 1000) ? 0 : 1;
  let i = 0;
  const take = (k: string) => (runs[i]?.[0] === k ? runs[i++] : undefined);
  const stroke = (r: Run | undefined, at: string) => {
    const n = r ? r[1] : 0;
    if (n !== dpr) bad.push(`${at}: stroke ${n} device px, not ${dpr}`);
  };
  for (let k = 0; k < 10 && !bad.length; k++) {
    const start = runs[i]?.[2] ?? -1;
    const want = (k * W * dpr) / 10;
    if (Math.abs(start - want) > 1) bad.push(`block ${k} starts at col ${start}, the period puts it at ${want.toFixed(2)}`);
    if (k < lit) {
      stroke(take('E'), `lit block ${k} left edge`);
      if (!take('F')) bad.push(`block ${k}: want a lit fill at col ${start}, got ${runs[i]?.[0] ?? 'the end'}`);
      stroke(take('E'), `lit block ${k} right edge`);
    } else if (!take('T')) bad.push(`block ${k}: want an unlit track at col ${start}, got ${runs[i]?.[0] ?? 'the end'}`);
    const gap = take('U');
    const last = k === 9;
    if (!gap) bad.push(`block ${k}: no gap after it`);
    else if (!last && gap[1] !== 2 * dpr) bad.push(`gap at col ${gap[2]}: ${gap[1]} device px, not ${2 * dpr}`);
    else if (last && (gap[1] > 2 * dpr || gap[1] < 2 * dpr - tailCut)) bad.push(`tail gap at col ${gap[2]}: ${gap[1]} device px`);
  }
  if (!bad.length && i !== runs.length) bad.push(`runs left over from col ${runs[i]?.[2]}: ${runs.slice(i).map((r) => r[0] + r[1]).join(' ')}`);
  return bad;
}

// The checker itself, on runs written out by hand: the drawn meter passes; the two strokes
// the old stroke gradient drew a column off, a stroke three columns off, a 3 px gap (between lit blocks, at the lit/unlit
// change and between unlit blocks), a wide closing edge, a missing gap (the last one too), an edge outside a lit
// block and a run after the tail all fail.
test('the raster checker: every stroke exactly DPR columns; one a column off fails', () => {
  const parse = (t: string): Run[] => {
    let x = 0;
    return t.split(' ').map((p) => {
      const r: Run = [p[0] ?? '?', Number(p.slice(1)), x];
      x += r[1];
      return r;
    });
  };
  // The 101.7 px meter at DPR 1 as the browser draws it: fills of 6 or 7 columns.
  const fills = [6, 6, 7, 6, 6, 6, 6, 7, 6, 6];
  const W = 101.7;
  const meter = (lit: number, alt: Record<number, string> = {}, tail = 'T8 U2 T8 U1') =>
    fills
      .slice(0, lit)
      .map((f, k) => alt[k] ?? `E1 F${f} E1 U2`)
      .join(' ')
      .concat(lit < 10 ? ` ${tail}` : '');
  const ok = (t: string, lit = 8) => checkRuns(parse(t), { lit, dpr: 1, W });
  expect(ok(meter(8)), 'the drawn meter').toEqual([]);
  expect(ok(meter(8, { 5: 'E2 F5 E1 U2' })), 'a 2 px left band (the old 73.3 px drift) fails').not.toEqual([]);
  expect(ok(meter(8, { 4: 'E1 F7 U2' })), 'a missing right edge (the old 157.45 px drift) fails').not.toEqual([]);
  expect(ok(meter(8, { 7: 'E1 F4 E4 U2' })), 'a 4 px stroke is three off').not.toEqual([]);
  expect(ok(meter(8, { 2: 'E2 F6 E1 U2', 5: 'E2 F5 E1 U2' })), 'two strokes a pixel off').not.toEqual([]);
  expect(ok(meter(8, { 3: 'E1 F5 E1 U3' })), 'a 3 px gap between lit blocks').not.toEqual([]);
  expect(ok(meter(8, { 7: 'E1 F6 E1 U3' })), 'a 3 px gap at the lit/unlit change').not.toEqual([]);
  expect(ok(meter(8, {}, 'T7 U3 T8 U1')), 'a 3 px gap between unlit blocks').not.toEqual([]);
  expect(ok(meter(8, { 7: 'E1 F9 E1' })), 'no gap after the last lit block').not.toEqual([]);
  expect(ok(meter(10).replace(/U2$/, 'U1'), 10), 'ten lit').toEqual([]);
  expect(ok(meter(10, { 9: 'E1 F4 E3 U1' }), 10), 'a closing edge 3 px wide').not.toEqual([]);
  expect(checkRuns(parse(meter(8)), { lit: 8, dpr: 2, W }).length, 'the same runs at DPR 2: every stroke off').toBeGreaterThan(0);
  // An edge painted into an unlit block, and a missing last gap inside the meter.
  expect(ok(meter(8, {}, 'E4 T4 U2 T8 U1')), 'an edge in the first unlit block').not.toEqual([]);
  expect(ok(meter(8, {}, 'T8 U2 T8 E1')), 'an edge in the tail').not.toEqual([]);
  const sixty = (last: string) => Array.from({ length: 9 }, () => 'E1 F2 E1 U2').concat([last]).join(' ');
  const ok60 = (t: string) => checkRuns(parse(t), { lit: 10, dpr: 1, W: 60 });
  expect(ok60(sixty('E1 F2 E1 U2')), 'the 60 px meter, ten lit').toEqual([]);
  expect(ok60(sixty('E1 F4 E1')), 'the 60 px meter without its last gap').not.toEqual([]);
  expect(ok60(sixty('E1 F2 E1 U2 T1')), 'a run after the tail').not.toEqual([]);
});

// The last gap reads one column short only where the
// meter ends inside a device pixel; at a whole width a last block grown one column into its gap fails.
test('the raster checker: a last gap one column short at a whole width fails', () => {
  let x = 0;
  const parse = (t: string): Run[] =>
    t.split(' ').map((p) => {
      const r: Run = [p[0] ?? '?', Number(p.slice(1)), x];
      x += r[1];
      return r;
    });
  const runs = parse(Array.from({ length: 9 }, () => 'E1 F2 E1 U2').concat(['E1 F3 E1 U1']).join(' '));
  expect(checkRuns(runs, { lit: 10, dpr: 1, W: 60 }), 'the last block grown into its gap').not.toEqual([]);
});

async function raster(page: Page, m: Locator, c: { track: string; tone: string; edge: string }, dpr: number) {
  const box = await m.boundingBox();
  if (!box) throw new Error('no meter box');
  const png = (await m.screenshot({ animations: 'disabled' })).toString('base64');
  const under = await m.evaluate((el) => getComputedStyle(el.parentElement as Element).backgroundColor);
  return page.evaluate(
    async ({ b64, c, under, W, H, dpr }) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const cv = new OffscreenCanvas(img.width, img.height);
      const g = cv.getContext('2d');
      if (!g) throw new Error('no 2d');
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, img.width, img.height).data;
      const rgb = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
      const ref: [string, number[]][] = [['E', rgb(c.edge)], ['F', rgb(c.tone)], ['T', rgb(c.track)], ['U', rgb(under)]];
      const dist = (a: number[], b: number[]) => Math.abs((a[0] ?? 0) - (b[0] ?? 0)) + Math.abs((a[1] ?? 0) - (b[1] ?? 0)) + Math.abs((a[2] ?? 0) - (b[2] ?? 0));
      const blends = dist(rgb(c.edge), rgb(under)) < 24;
      const one = (k: string) => (blends && (k === 'E' || k === 'U') ? 'D' : k);
      const read = (x: number, y: number) => {
        const i = (y * img.width + x) * 4;
        const px = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
        let best = 'U';
        let bd = Infinity;
        for (const [k, v] of ref) {
          const d = dist(px, v);
          if (d < bd) [best, bd] = [k, d];
        }
        return one(best);
      };
      // The element shot rounds its clip out to whole pixels: read only the meter's own device columns.
      const cols = Math.floor(W * dpr + 1e-6);
      const midY = Math.floor(img.height / 2);
      const runs: [string, number, number][] = [];
      for (let x = 0; x < cols; x++) {
        const k = read(x, midY);
        const last = runs[runs.length - 1];
        if (last && last[0] === k) last[1]++;
        else runs.push([k, 1, x]);
      }
      // The fill columns, for the row check below.
      const fillRuns = runs.filter((r) => r[0] === 'F');
      const bad: string[] = [];
      // Down every fill column: the top and bottom DPR rows are the edge, the rest the fill.
      for (const r of fillRuns)
          for (let x = r[2]; x < r[2] + r[1]; x++)
            for (let y = 0; y < Math.round(H * dpr); y++) {
              const rw = y < dpr || y >= Math.round(H * dpr) - dpr ? one('E') : 'F';
              const rg = read(x, y);
              if (rw !== rg && bad.length < 12) bad.push(`col ${x} row ${y}: want ${rw} got ${rg}`);
            }
      return { cssW: img.width / dpr, cols, rowBad: bad.slice(0, 12), blends, runs };
    },
    { b64: png, c, under, W: box.width, H: box.height, dpr },
  );
}

for (const dpr of [1, 2] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`a toned meter at fractional widths: every edge band exactly ${dpr} device px, on the block's period (DPR ${dpr}, ${theme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 1350, height: 900 }, deviceScaleFactor: dpr });
      const page = await ctx.newPage();
      try {
        await gotoHub(page, '/_kit?tab=pieces', { theme });
        await meter(page, 3).waitFor();
        const c = { track: await token(page, '--hx-meter-track'), tone: await token(page, '--hx-meter-tone'), edge: await token(page, '--hx-meter-edge') };
        // The gallery's 80 (warn, 8 lit) and 95 (danger, 10 lit) meters, laid out at fractional widths from an integer
        // start (what `size="fill"` gives a meter in a fractional column).
        const widths = [60, 73.3, 101.7, 157.45, 333.33];
        // Two hosts: the card (the real surface) and a diagnostic magenta one, which no meter colour is near, so in dark
        // the edge and the gap are told apart there too.
        await page.evaluate(
          ({ widths, name }) => {
            const src = [...document.querySelectorAll(`[role="meter"][aria-label="${name}"]`)];
            for (const [id, bg, top] of [['rl', 'var(--hx-card)', 16], ['rd', 'rgb(255, 0, 255)', 460]] as const) {
              const host = document.createElement('div');
              host.id = id;
              host.style.cssText = `position:fixed;left:16px;top:${top}px;z-index:99999;padding:8px;background:${bg};display:grid;gap:8px;justify-items:start`;
              for (const i of [2, 3])
                for (const w of widths) {
                  const m = src[i]?.cloneNode(true) as HTMLElement;
                  m.style.inlineSize = `${w}px`;
                  m.dataset.rl = `${i}-${w}`;
                  host.append(m);
                }
              document.body.append(host);
            }
          },
          { widths, name: k3['meter.diskName'] },
        );
        for (const [i, lit] of [[2, 8], [3, 10]] as const)
          for (const w of widths)
            for (const host of ['rl', 'rd'] as const) {
              const m = page.locator(`#${host} [data-rl="${i}-${w}"]`);
              const box = await m.boundingBox();
              expect(Math.abs((box?.width ?? 0) - w), `${w} px meter laid out at its width`).toBeLessThan(0.02);
              const r = await raster(page, m, c, dpr);
              const what = `${lit} lit at ${w} px, DPR ${dpr}, on the ${host === 'rl' ? 'card' : 'diagnostic surface'} (runs ${r.runs.map((x) => x[0] + x[1]).join(' ')})`;
              expect(r.cssW - w, 'the shot covers the meter, rounded out by under one device pixel').toBeGreaterThanOrEqual(-0.01);
              expect(r.cssW - w, 'the shot covers the meter, rounded out by under one device pixel').toBeLessThan(1.01);
              expect(r.rowBad, `${what}: down every fill column, edge rows top and bottom`).toEqual([]);
              if (r.blends) {
                // The dark card: edge and gap are one colour here, so only the blocks' order is read (the diagnostic
                // host checks every stroke and gap of the same meter).
                expect(host, 'only the dark card blends the edge into the surface').toBe('rl');
                const order = r.runs.map((x) => x[0]).filter((k) => k === 'F' || k === 'T').join('');
                expect(order, `${what}: ${lit} lit blocks then unlit`).toBe('F'.repeat(lit) + 'T'.repeat(10 - lit));
              } else {
                // Every width and DPR exact: the strokes are the mask's own block edges.
                expect(checkRuns(r.runs, { lit, dpr, W: w }), `${what}: whole blocks, exact strokes and 2 px gaps on the period`).toEqual([]);
              }
            }
      } finally {
        await ctx.close();
      }
    });
  }
}

// A server lane's meter fills its lane, rounded down to a whole 10 px period, from
// a lane on a whole pixel; there every toned lane meter is exact by the same raster check as the gallery's: strokes,
// blocks and 2 px gaps. The rail at 1440 and 1366, the stacked cards at 1024 and at 390 on touch; DPR 1 and 2; read
// over a diagnostic magenta, as the gallery's second host. Each meter is scrolled to the middle of the window first, so
// nothing fixed on the page (the 390 page's floating button) covers it.
for (const [vw, coarse] of [[1440, false], [1366, false], [1024, false], [390, true]] as const)
  for (const dpr of [1, 2] as const)
    for (const theme of ['light', 'dark'] as const)
      test(`toned server lane meters are exact at ${vw}${coarse ? ' on touch' : ''}, DPR ${dpr} (${theme})`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: vw, height: 900 }, deviceScaleFactor: dpr, hasTouch: coarse, isMobile: coarse });
        const page = await ctx.newPage();
        try {
          await gotoHub(page, '/computers/servers', { theme });
          await page.getByRole('meter', { name: /: Limit reached/ }).first().waitFor({ timeout: 20_000 }); // any toned lane: the servers have drawn their meters
          const c = { track: await token(page, '--hx-meter-track'), tone: await token(page, '--hx-meter-tone'), edge: await token(page, '--hx-meter-edge') };
          let read = 0;
          for (const m of await page.getByRole('meter').all()) {
            const now = Number(await m.getAttribute('aria-valuenow'));
            if (!(now >= 80)) continue;
            await m.evaluate((e) => e.scrollIntoView({ block: 'center' }));
            const b = await m.evaluate((e) => {
              // raster() reads the parent's background as the surface under the gaps: a diagnostic magenta, which no
              // meter colour is near, in both themes (the bar itself is transparent).
              (e.parentElement as HTMLElement).style.background = 'rgb(255, 0, 255)';
              const r = e.getBoundingClientRect();
              return { x: r.x, w: r.width };
            });
            const what = `${await m.getAttribute('aria-label')} at x ${b.x}, ${b.w} px`;
            expect(b.x, `${what}: on a whole pixel`).toBe(Math.round(b.x));
            expect(b.w % 10, `${what}: a whole 10 px period`).toBe(0);
            const r = await raster(page, m, c, dpr);
            expect(r.blends, `${what}: read over a surface its edge does not blend into`).toBe(false);
            expect(r.rowBad, `${what}: edge rows top and bottom`).toEqual([]);
            expect(checkRuns(r.runs, { lit: Math.min(10, Math.ceil(now / 10)), dpr, W: b.w }), `${what}: whole blocks, exact strokes and 2 px gaps`).toEqual([]);
            read++;
          }
          expect(read, 'some toned lane meters read').toBeGreaterThanOrEqual(3);
        } finally {
          await ctx.close();
        }
      });
