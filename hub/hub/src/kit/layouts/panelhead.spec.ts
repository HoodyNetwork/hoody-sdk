// Playwright: a kit card's head band (a Panel's head, a Widget's head) is slim: half
// --pad-card-y (8 px) above and below its titles and actions, as the card's bottom band, so the band is its tallest
// part plus 16 and its 1 px rule. Its title and description keep their gap, and a head action keeps its own size (44 on
// a touch screen). Read on the computer's Backups, Network and Storage tabs (each opens with an "At a glance" panel),
// the kit gallery's panels with head actions, and the home dashboard's widgets; both themes, both pointers.
// The same heads right to left and with a long title (words and one long
// token), an anatomy Section with actions among them, keep their text and actions inside the band and apart; every head
// action reached by Tab, links too, draws its whole focus ring inside the band and inside every box that clips it;
// widget heads at 390 too.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const PAGES = ['/computers?sel=atlas.00a1&tab=backups', '/computers?sel=atlas.00a1&tab=network', '/computers?sel=atlas.00a1&tab=storage', '/_kit?tab=table'];

interface Head {
  page: string;
  kind: string;
  top: number;
  bottom: number;
  /** The band's height less its padding and rule, against its tallest child. */
  inner: number;
  tallest: number;
  /** Title to description gap, when the head has both. */
  gap: number | null;
  /** Heights of the head's buttons and radios. */
  controls: number[];
}

async function heads(page: Page, path: string, sel: string, theme: 'light' | 'dark'): Promise<Head[]> {
  await page.goto('about:blank'); // gotoHub is same-document between Hub pages: start each read from a fresh load
  await gotoHub(page, path, { theme });
  await page.locator(sel).first().waitFor({ timeout: 20_000 }); // reason: any head proves the page drew; all are read below
  return page.locator(sel).evaluateAll((els, p) =>
    els
      .filter((h) => h.getBoundingClientRect().height > 0)
      .map((h) => {
        const cs = getComputedStyle(h);
        const r = h.getBoundingClientRect();
        const kids = [...h.children].filter((c) => c.getBoundingClientRect().height > 0);
        const rows = new Map<number, number>();
        for (const c of kids) { const b = c.getBoundingClientRect(); rows.set(Math.round(b.top), Math.max(rows.get(Math.round(b.top)) ?? 0, b.height)); }
        const title = h.querySelector('[class*="panelTitle"]:not([class*="panelTitles"])');
        const desc = h.querySelector('[class*="panelDesc"]');
        return {
          page: p,
          kind: /widgetHead/.test(h.className) ? 'widget' : 'panel',
          top: parseFloat(cs.paddingTop),
          bottom: parseFloat(cs.paddingBottom),
          inner: r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth),
          tallest: [...rows.values()].reduce((a, b) => a + b, 0) + Math.max(0, rows.size - 1) * parseFloat(cs.rowGap || '0'),
          gap: title && desc ? Math.round(desc.getBoundingClientRect().top - title.getBoundingClientRect().bottom) : null,
          controls: [...h.querySelectorAll('button, [role="radio"]')].filter((b) => b.getBoundingClientRect().height > 0 && (b as HTMLElement).checkVisibility()).map((b) => Math.round(b.getBoundingClientRect().height)),
        };
      }),
    path,
  );
}

const PANEL = '#hub-main header[class*="panelHead"]';
const WIDGET = '#hub-main [class*="widgetHead"]';

function expectSlim(all: Head[]) {
  expect(all.filter((h) => h.top !== 8 || h.bottom !== 8).map((h) => `${h.page} ${h.kind}: ${h.top}/${h.bottom}`), 'a head band not padded 8 above and 8 below').toEqual([]);
  // The band holds its content and nothing more: the min-height of a Widget head (40) may hold a short title.
  expect(all.filter((h) => h.kind === 'panel' && Math.abs(h.inner - h.tallest) > 1).map((h) => `${h.page}: inner ${h.inner} tallest ${h.tallest}`), 'a panel head taller than its content').toEqual([]);
  expect(all.filter((h) => h.gap !== null && h.gap !== 2).map((h) => `${h.page}: gap ${h.gap}`), "a title and description that lost their 2 px gap").toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`a fine pointer at 1440 (${theme})`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test(`panel and widget heads are slim bands (${theme})`, async ({ page }) => {
      const all: Head[] = [];
      for (const p of PAGES) all.push(...(await heads(page, p, PANEL, theme)));
      all.push(...(await heads(page, '/', WIDGET, theme)));
      expect(all.filter((h) => h.kind === 'panel').length, 'panel heads read').toBeGreaterThan(3);
      expect(all.filter((h) => h.kind === 'widget').length, 'widget heads read').toBeGreaterThan(0);
      expect(all.some((h) => h.gap !== null), 'a head with a title and a description').toBe(true);
      expectSlim(all);
      expect(all.flatMap((h) => h.controls).filter((c) => c < 24), 'a head control under its kit size').toEqual([]);
    });
  });

  test.describe(`a touch phone at 390 (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test(`panel heads are slim bands and their actions stay 44 (${theme})`, async ({ page }) => {
      const all: Head[] = [];
      for (const p of PAGES) all.push(...(await heads(page, p, PANEL, theme)));
      expect(all.filter((h) => h.kind === 'panel').length, 'panel heads read').toBeGreaterThan(3);
      expectSlim(all);
      expect(all.some((h) => h.controls.length > 0), 'a head with actions').toBe(true);
      expect(all.flatMap((h) => h.controls.map((c) => [h.page, c] as const)).filter(([, c]) => c < 44), 'a head action under 44 on a touch screen').toEqual([]);
    });
  });
}

// ── more panel head cases ─────────────────────────────────────────────────────────────────────────────────────────

/** Words that wrap, then one token with no break (a computer id or a path is one). */
const LONG = `${'Snapshots kept for this computer across every realm it has served, newest first '.repeat(2)}atlas-00a1/backups/2026-11-09/full-snapshot-archive`;
const HEADS = `${PANEL}, ${WIDGET}`;

interface Box { l: number; r: number; t: number; b: number }
interface Clip { name: string; box: Box; poly: [number, number][] | null; shape: string | null; scrolls: { x: boolean; y: boolean } }
interface Phc {
  /** The boxes that clip an element: each ancestor whose overflow is not visible, that contains its paint or that has a clip
   *  path, as its padding box (where overflow clips), narrowed by an inset() clip path; a polygon() clip path (the kit card's
   *  cut corner) is kept as its points. An axis a box scrolls in (overflow auto or scroll) hides nothing for good: what is past
   *  it scrolls into view, so that axis is not a cut. Another clip-path shape is not read: `shape` names it, so a check fails rather than
   *  guess. */
  clips: (el: Element) => Clip[];
  /** The edges of `inner` outside `outer`, by more than half a pixel. */
  outside: (inner: Box, outer: Box) => string[];
  /** What of `inner` a clip cuts: edges outside its box, corners outside its polygon, or the shape it could not read. */
  cutBy: (inner: Box, c: Clip) => string[];
  /** Elements the Tab walk has focused, by identity. */
  seen: WeakSet<Element>;
}
declare global { interface Window { phc: Phc } }

/** Puts the helpers both reads use on the page (after each load). */
async function helpers(page: Page) {
  await page.evaluate(() => {
    // A length as a clip path writes it: px, a percentage of the box, or calc(P% +/- Npx).
    const px = (v: string, size: number): number => {
      const c = /^calc\(\s*([\d.]+)%\s*([+-])\s*([\d.]+)px\s*\)$/.exec(v);
      if (c) return (parseFloat(c[1] ?? '0') / 100) * size + (c[2] === '-' ? -1 : 1) * parseFloat(c[3] ?? '0');
      return v.endsWith('%') ? (parseFloat(v) / 100) * size : parseFloat(v) || 0;
    };
    const inPoly = (x: number, y: number, poly: [number, number][]): boolean => {
      // Half a pixel of slack, as for the boxes: a point on an edge is inside.
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i] as [number, number], [xj, yj] = poly[j] as [number, number];
        const cross = (xj - xi) * (y - yi) - (yj - yi) * (x - xi);
        const len = Math.hypot(xj - xi, yj - yi) || 1;
        if (Math.abs(cross) / len <= 0.5 && x >= Math.min(xi, xj) - 0.5 && x <= Math.max(xi, xj) + 0.5 && y >= Math.min(yi, yj) - 0.5 && y <= Math.max(yi, yj) + 0.5) return true;
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    const outside = (i: Box, o: Box) => (['left', 'right', 'top', 'bottom'] as const).filter((e) =>
      e === 'left' ? i.l < o.l - 0.5 : e === 'right' ? i.r > o.r + 0.5 : e === 'top' ? i.t < o.t - 0.5 : i.b > o.b + 0.5);
    window.phc = {
      seen: new WeakSet(),
      outside,
      cutBy: (i, c) => {
        if (c.shape) return [`clip-path ${c.shape} of ${c.name} not read`];
        const cut = outside(i, c.box).filter((e) => !((e === 'left' || e === 'right') ? c.scrolls.x : c.scrolls.y)).map((e) => `${e} of ${c.name}`);
        const poly = c.poly;
        if (poly) for (const [n, x, y] of [['top-left', i.l, i.t], ['top-right', i.r, i.t], ['bottom-right', i.r, i.b], ['bottom-left', i.l, i.b]] as const) if (!inPoly(x, y, poly)) cut.push(`${n} corner cut by the clip path of ${c.name}`);
        return cut;
      },
      clips: (el) => {
        const out: Clip[] = [];
        for (let a = el.parentElement; a; a = a.parentElement) {
          const s = getComputedStyle(a);
          const overflow = s.overflowX !== 'visible' || s.overflowY !== 'visible';
          if (!overflow && s.clipPath === 'none' && !s.contain.includes('paint')) continue;
          const r = a.getBoundingClientRect();
          const box = { l: r.left + a.clientLeft, t: r.top + a.clientTop, r: r.left + a.clientLeft + a.clientWidth, b: r.top + a.clientTop + a.clientHeight };
          if (!overflow && !s.contain.includes('paint')) Object.assign(box, { l: r.left, t: r.top, r: r.right, b: r.bottom });
          let shape: string | null = null, poly: [number, number][] | null = null;
          if (s.clipPath !== 'none') {
            const m = /^inset\(([^)]*)\)$/.exec(s.clipPath);
            const g = /^polygon\((.*)\)$/.exec(s.clipPath);
            const n = m ? (m[1] ?? '').split(/\s+round\s+/)[0]?.trim().split(/\s+/) ?? [] : [];
            if (m && n.length >= 1 && n.length <= 4) {
              const [t = '0', rr = t, b = t, l = rr] = n;
              box.t = Math.max(box.t, r.top + px(t, r.height)); box.r = Math.min(box.r, r.right - px(rr, r.width));
              box.b = Math.min(box.b, r.bottom - px(b, r.height)); box.l = Math.max(box.l, r.left + px(l, r.width));
            } else if (g && !/^\s*(nonzero|evenodd)/.test(g[1] ?? '')) {
              const pts = (g[1] ?? '').split(/,(?![^(]*\))/).map((q) => q.trim().match(/calc\([^)]*\)|\S+/g) ?? []);
              if (pts.length >= 3 && pts.every((q) => q.length === 2)) poly = pts.map(([x = '0', y = '0']) => [r.left + px(x, r.width), r.top + px(y, r.height)]);
              else shape = s.clipPath;
            } else shape = s.clipPath;
          }
          const scrolls = { x: /auto|scroll/.test(s.overflowX), y: /auto|scroll/.test(s.overflowY) };
          out.push({ name: `${a.tagName.toLowerCase()}.${String(a.className).split(' ')[0] ?? ''}`, box, poly, shape, scrolls });
        }
        return out;
      },
    };
  });
}

interface Fit {
  where: string;
  /** Text or an action outside the band's padding box (either axis), outside a box that clips it, or a title or description
   *  whose text runs past its own box. */
  out: string[];
  /** The titles block and the actions overlap. */
  overlap: boolean;
  /** Right to left: the gap between the titles block and the band's inline start, less the band's own padding. */
  startGap: number | null;
  section: boolean;
  actions: boolean;
}

/** Puts each head right to left and/or gives it LONG as its title, then reads where its parts landed. */
async function stressed(page: Page, path: string, theme: 'light' | 'dark', rtl: boolean, long: boolean): Promise<Fit[]> {
  await page.goto('about:blank'); // gotoHub is same-document between Hub pages: start each read from a fresh load
  await gotoHub(page, path, { theme });
  await page.locator(HEADS).first().waitFor({ timeout: 20_000 }); // reason: any head proves the page drew; all are read below
  await helpers(page);
  return page.evaluate(
    async ({ sel, rtl, long, text, path }) => {
      if (rtl) document.documentElement.dir = 'rtl';
      const heads = [...document.querySelectorAll<HTMLElement>(sel)].filter((h) => h.getBoundingClientRect().height > 0);
      if (long) for (const h of heads) { const t = h.querySelector('h1, h2, h3, h4, h5, h6'); if (t) t.textContent = text; }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const fits: Fit[] = [];
      for (const [i, h] of heads.entries()) {
        // Read where it is seen: a scroll container hides what is scrolled away, which is not a cut.
        // The page may still be drawing (a widget's read lands late): read once the head has stood still for two frames.
        for (let k = 0, last = ''; k < 20; k++) {
          h.scrollIntoView({ block: 'center', inline: 'nearest' });
          await new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
          const at = JSON.stringify(h.getBoundingClientRect());
          if (at === last) break;
          last = at;
        }
        const cs = getComputedStyle(h);
        const r = h.getBoundingClientRect();
        const band = { l: r.left + parseFloat(cs.paddingLeft), r: r.right - parseFloat(cs.paddingRight), t: r.top + parseFloat(cs.paddingTop), b: r.bottom - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth) };
        const titles = h.querySelector<HTMLElement>('[class*="panelTitles"]');
        const acts = [...h.children].filter((c) => c !== titles && c.getBoundingClientRect().height > 0) as HTMLElement[];
        const parts = [...h.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, button, a[href], [role="radio"]')].filter((e) => e.getBoundingClientRect().height > 0 && e.checkVisibility());
        const out: string[] = [];
        const tag = (e: HTMLElement) => `${e.tagName.toLowerCase()} "${(e.textContent ?? '').trim().slice(0, 24)}"`;
        for (const e of parts) {
          const es = getComputedStyle(e);
          const o = e.getBoundingClientRect();
          // The whole box, but a link's own inline padding (the room its focus ring keeps off the text) may sit in the band's
          // (Widget viewAll.end): its text may not.
          const link = e.matches('a[href]');
          const b = { l: o.left + (link ? parseFloat(es.paddingLeft) : 0), r: o.right - (link ? parseFloat(es.paddingRight) : 0), t: o.top, b: o.bottom };
          const edges = window.phc.outside(b, band);
          if (edges.length) out.push(`${tag(e)} ${edges.join('/')} outside the band`);
          for (const c of window.phc.clips(e)) { const cut = window.phc.cutBy(b, c); if (cut.length) out.push(`${tag(e)}: ${cut.join(', ')}`); }
          // A widget title ends in an ellipsis by design (.widgetTitle): its box stays inside, its text may not.
          if (/^(H\d|P)$/.test(e.tagName) && es.textOverflow !== 'ellipsis' && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)) out.push(`${tag(e)} text ${e.scrollWidth}x${e.scrollHeight} past its box ${e.clientWidth}x${e.clientHeight}`);
        }
        const tb = titles?.getBoundingClientRect();
        const overlap = !!tb && acts.some((a) => {
          const b = a.getBoundingClientRect();
          return Math.min(tb.right, b.right) - Math.max(tb.left, b.left) > 0.5 && Math.min(tb.bottom, b.bottom) - Math.max(tb.top, b.top) > 0.5;
        });
        fits.push({
          where: `${path} #${i} ${/widgetHead/.test(h.className) ? 'widget' : 'panel'}`,
          out,
          overlap,
          startGap: rtl && tb ? Math.round(band.r - tb.right) : null,
          section: !!h.closest('[data-hub-section]'),
          actions: acts.some((a) => !!a.querySelector('button, a[href], [role="radio"]') || a.matches('a[href], button')),
        });
      }
      return fits;
    },
    { sel: HEADS, rtl, long, text: LONG, path },
  );
}

function expectFits(all: Fit[], why: string) {
  expect(all.filter((f) => f.out.length).map((f) => `${f.where}: ${f.out.join('; ')}`), `${why}: text or an action outside its head band or clipped`).toEqual([]);
  expect(all.filter((f) => f.overlap).map((f) => f.where), `${why}: a head whose title and actions overlap`).toEqual([]);
}

interface Ring {
  where: string;
  kind: string;
  /** How far the focus ring reaches past the control, in px (0: none drawn). */
  reach: number;
  /** The ring is drawn only while focused (the unfocused control draws no such shadow or outline) and its colour shows. */
  focusOnly: boolean;
  /** Edges of the ring outside the band, or outside a box that clips it. */
  cut: string[];
}
interface Walk { rings: Ring[]; cycled: boolean; steps: number }

const TAB_MAX = 800;

/** Tabs through the whole page until focus comes back to an element it already reached (by identity), and reads the focus
 *  ring of every head action on the way. `cycled` false: the walk ran out of steps first. */
async function rings(page: Page, path: string, theme: 'light' | 'dark'): Promise<Walk> {
  await page.goto('about:blank'); // gotoHub is same-document between Hub pages: start each read from a fresh load
  await gotoHub(page, path, { theme });
  await page.locator(HEADS).first().waitFor({ timeout: 20_000 }); // reason: any head proves the page drew; all are read below
  await helpers(page);
  const out: Ring[] = [];
  for (let i = 0; i < TAB_MAX; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(async ({ sel, path }) => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el === document.documentElement) return 'none' as const;
      if (window.phc.seen.has(el)) return 'cycle' as const;
      window.phc.seen.add(el);
      const head = el.closest<HTMLElement>(sel);
      if (!head) return 'none' as const;
      const settle = async () => {
        await new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
        await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined)));
      };
      const shows = (c: string) => { const a = /rgba?\(([^)]*)\)/.exec(c); const n = a ? (a[1] ?? '').split(/[\s,/]+/).filter(Boolean) : []; return !(n.length === 4 && parseFloat(n[3] ?? '1') === 0) && c !== 'transparent'; };
      const read = () => {
        const cs = getComputedStyle(el);
        let reach = 0, visible = false;
        for (const part of cs.boxShadow === 'none' ? [] : cs.boxShadow.split(/,(?![^(]*\))/)) {
          if (/inset/.test(part)) continue;
          const n = part.replace(/[a-z-]+\([^)]*\)/g, '').trim().split(/\s+/).map(parseFloat);
          const own = n.length >= 4 ? Math.max(Math.abs(n[0] ?? 0), Math.abs(n[1] ?? 0)) + (n[2] ?? 0) + (n[3] ?? 0) : 0;
          if (own > 0 && shows(part)) visible = true;
          reach = Math.max(reach, own);
        }
        if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) {
          reach = Math.max(reach, parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset));
          if (shows(cs.outlineColor)) visible = true;
        }
        return { reach, visible, look: `${cs.boxShadow}|${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} ${cs.outlineOffset}` };
      };
      el.scrollIntoView({ block: 'center', inline: 'nearest' }); // the ring is read where it is seen, focus unchanged
      await settle();
      const on = read();
      const b = el.getBoundingClientRect();
      // The same control unfocused, then focused again where the walk left it (keyboard focus stays visible).
      el.blur();
      await settle();
      const off = read();
      el.focus({ preventScroll: true });
      await settle();
      const ring = { l: b.left - on.reach, r: b.right + on.reach, t: b.top - on.reach, b: b.bottom + on.reach };
      const hb = head.getBoundingClientRect();
      const cut = window.phc.outside(ring, { l: hb.left, r: hb.right, t: hb.top, b: hb.bottom }).map((e) => `${e} of the band`);
      for (const c of window.phc.clips(el)) cut.push(...window.phc.cutBy(ring, c));
      const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40);
      return { where: `${path} ${name}`, kind: el.matches('a[href]') ? 'link' : el.getAttribute('role') ?? el.tagName.toLowerCase(), reach: on.reach, focusOnly: on.visible && on.look !== off.look, cut };
    }, { sel: HEADS, path });
    if (r === 'cycle') return { rings: out, cycled: true, steps: i + 1 };
    if (r !== 'none') out.push(r);
  }
  return { rings: out, cycled: false, steps: TAB_MAX };
}

function expectRings(all: Ring[]) {
  expect(all.filter((r) => r.reach <= 0 || !r.focusOnly).map((r) => `${r.where} (${r.kind}) reach ${r.reach}`), 'a head action focused by Tab with no visible ring of its own').toEqual([]);
  expect(all.filter((r) => r.cut.length).map((r) => `${r.where} (${r.kind}): ${r.cut.join(', ')}`), "a head action's focus ring cut by its band or a clipping box").toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  for (const [vp, w, touch] of [['1440', 1440, false], ['390', 390, true]] as const) {
    test.describe(`heads under stress at ${vp} (${theme})`, () => {
      test.use({ viewport: { width: w, height: w > 400 ? 900 : 844 }, hasTouch: touch, isMobile: touch });

      test(`right to left, and a long title, a head keeps its text and actions inside and apart (${vp}, ${theme})`, async ({ page }) => {
        test.setTimeout(240_000); // four reads of five pages, slow under host load
        for (const [rtl, long] of [[true, false], [false, true], [true, true]] as const) {
          const all: Fit[] = [];
          for (const p of [...PAGES, '/']) all.push(...(await stressed(page, p, theme, rtl, long)));
          const why = `${rtl ? 'right to left' : 'left to right'}${long ? ', long title' : ''}`;
          expect(all.some((f) => f.section && f.actions), `${why}: an anatomy Section with actions read`).toBe(true);
          expect(all.some((f) => f.where.endsWith('widget')), `${why}: a widget head read`).toBe(true);
          expectFits(all, why);
          if (rtl) expect(all.filter((f) => f.startGap !== null && Math.abs(f.startGap) > 1).map((f) => `${f.where}: ${f.startGap}`), `${why}: a title block not at the band's inline start`).toEqual([]);
        }
      });

      test(`every head action reached by Tab, links too, draws its whole ring inside the band (${vp}, ${theme})`, async ({ page }) => {
        test.setTimeout(600_000); // a whole-page Tab walk with two reads per head action, slow under host load
        const all: Ring[] = [];
        for (const p of [...PAGES, '/']) {
          const w = await rings(page, p, theme);
          expect(w.cycled, `${p}: the Tab walk came round within ${TAB_MAX} steps`).toBe(true);
          all.push(...w.rings);
        }
        expect(all.filter((r) => r.where.startsWith('/ ') && r.kind === 'link').length, 'more than one widget head link reached by Tab on Home').toBeGreaterThan(1);
        expect(all.some((r) => r.kind !== 'link'), 'a button or radio in a head reached by Tab').toBe(true);
        expectRings(all);
      });
    });
  }

  test.describe(`widget heads on a touch phone at 390 (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test(`widget heads are slim bands and their actions stay 44 (${theme})`, async ({ page }) => {
      const all = await heads(page, '/', WIDGET, theme);
      expect(all.length, 'widget heads read').toBeGreaterThan(0);
      expectSlim(all);
      expect(all.flatMap((h) => h.controls.map((c) => [h.page, c] as const)).filter(([, c]) => c < 44), 'a widget head action under 44 on a touch screen').toEqual([]);
      // A head link's touch target is a box behind it (.viewAll::before) 44 tall while the link keeps its text height: a tap 1 px
      // inside either end of those 44 px, and at its middle, lands on the link (nothing clips or covers the target), and a tap on
      // each head button beside it lands on that button.
      const links = page.locator(`${WIDGET} a[href]`);
      const n = await links.count();
      const taps: { link: string; own: number; miss: string[] }[] = [];
      for (let i = 0; i < n; i++) {
        const a = links.nth(i);
        if (!(await a.isVisible())) continue;
        await a.scrollIntoViewIfNeeded();
        taps.push(await a.evaluate((el) => {
          el.scrollIntoView({ block: 'center' });
          const b = el.getBoundingClientRect();
          const x = b.left + b.width / 2, y = b.top + b.height / 2;
          const miss: string[] = [];
          for (const [what, yy] of [['top', y - 21], ['middle', y], ['bottom', y + 21]] as const) {
            const hit = document.elementFromPoint(x, yy);
            if (!hit || !(hit === el || el.contains(hit))) miss.push(`${what} hits ${hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0] ?? ''}` : 'nothing'}`);
          }
          for (const btn of el.closest('[class*="widgetHead"]')?.querySelectorAll<HTMLElement>('button') ?? []) {
            const r = btn.getBoundingClientRect();
            if (!r.height) continue;
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (!hit || !(hit === btn || btn.contains(hit))) miss.push(`button "${btn.getAttribute('aria-label') ?? ''}" covered by ${hit ? hit.tagName.toLowerCase() : 'nothing'}`);
          }
          return { link: (el.textContent ?? '').trim(), own: b.height, miss };
        }));
      }
      expect(taps.length, 'a widget head link read').toBeGreaterThan(0);
      expect(taps.filter((t) => t.miss.length).map((t) => `${t.link}: ${t.miss.join(', ')}`), 'a widget head link whose 44 px touch target a tap misses').toEqual([]);
      expect(taps.filter((t) => t.own >= 43.5).map((t) => t.link), 'a widget head link drawn 44 tall (its ring would leave the band)').toEqual([]);
    });
  });
}
