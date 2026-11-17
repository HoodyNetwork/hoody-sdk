// Playwright: each overlay surface spaces its content the
// same on all four sides. At 1024 and 390, for every surface below: (1) the inner padding, measured from the
// surface's inner edge (below a head bar and above a foot bar, if it has them) to what is drawn inside it (text blocks, controls, boxes with
// a border or a background), is equal on all four sides within 1 px (a surface as tall as the screen only needs at
// least that much below its last row); (2) every text field spans its column (the content box in a one-column form), within 1 px, and a bordered field
// or one in a real column never runs past it;
// (3) when the content scrolls, every scrolled area stops short of the bottom edge, so a row never runs flush into the
// border while scrolled.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

interface Surface {
  name: string;
  path: string;
  /** Opens the surface after the load. */
  open?: (page: Page) => Promise<void>;
  /** The surface element: a dialog, sheet, popover or menu. */
  box: (page: Page) => Locator;
  /** Widths the surface exists at (default: both). */
  widths?: number[];
}

const SURFACES: Surface[] = [
  {
    name: 'Board "Add a program" picker',
    path: '/board',
    open: (page) => page.getByRole('button', { name: 'Add a program' }).first().click(), // the empty board's own; the toolbar's icon button shares the name
    box: (page) => page.getByRole('dialog', { name: 'Add a program' }),
  },
  {
    name: 'command palette',
    path: '/computers',
    open: (page) => page.keyboard.press('ControlOrMeta+k'),
    box: (page) => page.getByRole('dialog', { name: 'Command palette' }),
  },
  {
    name: 'account menu',
    path: '/computers',
    widths: [1024], // on a phone the account menu lives in the bottom bar's More sheet
    open: (page) => page.getByRole('button', { name: 'Account menu' }).click(),
    box: (page) => page.getByRole('menu'),
  },
  {
    name: 'scripts More actions menu',
    path: '/scripts?sel=atlas.00a1~weather.ts',
    open: (page) => page.getByRole('region', { name: 'Details' }).getByRole('button', { name: 'More actions' }).first().click(), // the detail head's menu; the Schedule group has its own
    box: (page) => page.getByRole('menu'),
  },
  {
    name: 'keys New key drawer',
    path: '/keys',
    open: (page) => page.getByRole('button', { name: 'New key', exact: true }).click(),
    box: (page) => page.getByRole('dialog'),
  },
  { name: 'account password sheet', path: '/account?sheet=password', box: (page) => page.getByRole('dialog') },
];

interface Geometry {
  pad: { top: number; right: number; bottom: number; left: number };
  /** The element that sets each side, for the failure message. */
  by: { top: string; right: string; bottom: string; left: string };
  fills: boolean;
  fields: string[];
  scrollGap: number | null;
}

// Runs in the page. Measures the surface: its padded box (the first box down a single-child chain that has padding
// or more than one child), the drawn content inside it, the text fields, and a scroll area if the content scrolls.
async function measure(box: Locator): Promise<Geometry> {
  return box.evaluate(async (surface) => {
    const cs = (e: Element) => getComputedStyle(e);
    const shown = (e: Element) => {
      const r = e.getBoundingClientRect();
      const s = cs(e);
      if (!(r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none')) return false;
      // Not drawn: inside a visually hidden box (a radio's or checkbox's native input, clipped to 1 px).
      for (let a = e.parentElement; a && a !== surface; a = a.parentElement) {
        const ar = a.getBoundingClientRect();
        if (cs(a).overflow === 'hidden' && (ar.width <= 1 || ar.height <= 1)) return false;
      }
      return true;
    };
    const kids = (e: Element): Element[] =>
      [...e.children].flatMap((c) => (cs(c).display === 'contents' ? kids(c) : [c])).filter(shown);
    const px = (v: string) => parseFloat(v) || 0;
    const padded = (e: Element) => ['Top', 'Right', 'Bottom', 'Left'].some((k) => px(cs(e)[`padding${k}` as 'paddingTop']) > 0);
    let p: Element = surface;
    while (!padded(p) && kids(p).length === 1) p = kids(p)[0] ?? p;

    // The scroll area, if the content scrolls: measure the bottom at its end.
    const scrollers = [surface, ...surface.querySelectorAll('*')].filter((e) => {
      const o = cs(e).overflowY;
      return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 1;
    });

    const inner = (e: Element) => {
      const r = e.getBoundingClientRect();
      const s = cs(e);
      return { top: r.top + px(s.borderTopWidth), left: r.left + px(s.borderLeftWidth), right: r.right - px(s.borderRightWidth), bottom: r.bottom - px(s.borderBottomWidth) };
    };
    const surfaceBg = cs(surface).backgroundColor;
    const box4 = (e: Element, content: boolean) => {
      const r = e.getBoundingClientRect();
      if (!content) return { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
      const s = cs(e);
      const k = (side: string) => px(s[`padding${side}` as 'paddingTop']) + px(s[`border${side}Width` as 'borderTopWidth']);
      return { top: r.top + k('Top'), left: r.left + k('Left'), right: r.right - k('Right'), bottom: r.bottom - k('Bottom') };
    };
    // A row of a list (full bleed by design): its text is inset by the row's own padding, its box marks the rows' extent.
    const ROW = '[role="menuitem"], [role="option"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="row"], [role="treeitem"], li:not([role="presentation"]):not([role="none"]), [aria-selected], [aria-checked], [aria-current]';
    // A box drawn as a box: a control, or a background or a border on three or more sides. Rows and bands that span
    // the whole inner width (headers, footers, full-bleed lists) are not boxes here: their content is measured instead.
    const drawn = (e: Element, i: { left: number; right: number }) => {
      if (e.matches('hr, [role="separator"]') || e.closest('[aria-hidden="true"]') || e.closest(ROW)) return false;
      const r = e.getBoundingClientRect();
      if (r.left - i.left < 1 && i.right - r.right < 1) return false;
      if (e.matches('input, textarea, select, svg, img, canvas, video, iframe, [role="searchbox"]')) return true;
      const s = cs(e);
      const seen = (c: string) => c !== surfaceBg && !/^transparent$|rgba\([^)]*,\s*0\)$/.test(c);
      const hasBg = seen(s.backgroundColor);
      const sides = ['Top', 'Right', 'Bottom', 'Left'].filter(
        (k) => px(s[`border${k}Width` as 'borderTopWidth']) > 0 && s[`border${k}Style` as 'borderTopStyle'] !== 'none' && seen(s[`border${k}Color` as 'borderTopColor']),
      ).length;
      // A ghost button (no fill, no border at rest) is seen by its icon and label, not its box.
      return hasBg || sides >= 3;
    };
    const blockOf = (t: Node): Element | null => {
      let e = t.parentElement;
      while (e && e !== p && cs(e).display.startsWith('inline')) e = e.parentElement;
      return e && e !== p ? e : null;
    };
    // Content capped for line length (a max-width on it or an ancestor, a form's --form-max) does not mark the inline
    // edges: the box it is capped inside does, so a capped form in a wide drawer is not read as a wide right padding.
    const capped = (e: Element) => {
      let cap: Element | null = null;
      for (let a: Element | null = e; a && a !== p; a = a.parentElement) if (cs(a).maxWidth !== 'none') cap = a;
      if (!cap) return null;
      let host: Element = cap.parentElement ?? p;
      while (host !== p && cs(host).display === 'contents' && host.parentElement) host = host.parentElement; // no box of its own
      return box4(host, true);
    };
    type Box = { top: number; left: number; right: number; bottom: number };
    const name = (e: Element) => `${e.tagName.toLowerCase()}${e.getAttribute('role') ? `[${e.getAttribute('role')}]` : ''}.${String(e.className).split(' ')[0] ?? ''}`;
    const collect = (i: Box) => {
      const out: (Box & { who: string })[] = [];
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (head?.contains(n) || foot?.contains(n)) continue;
        if (n.nodeType === Node.TEXT_NODE) {
          if (!n.textContent?.trim()) continue;
          const b = blockOf(n);
          if (!b || !shown(b) || b.closest('[aria-hidden="true"]')) continue;
          const row = b.closest(ROW);
          if (row && p.contains(row)) {
            // A row is drawn as a box (its hover/selected fill): its box marks the extent, unless it bleeds to the
            // inner edge by design, where its text, inset by the row padding, does.
            const rb = box4(row, false);
            const bleeds = rb.left - i.left < 1 || i.right - rb.right < 1;
            const h = bleeds ? box4(row, true) : rb;
            const c = capped(row);
            out.push({ left: c?.left ?? h.left, right: c?.right ?? h.right, top: rb.top, bottom: rb.bottom, who: name(row) });
          } else {
            const bb = box4(b, true);
            const c = capped(b);
            out.push({ ...bb, left: c?.left ?? bb.left, right: c?.right ?? bb.right, who: name(b) });
          }
        } else if (shown(n as Element) && drawn(n as Element, i)) {
          const bb = box4(n as Element, false);
          const c = capped(n as Element);
          out.push({ ...bb, left: c?.left ?? bb.left, right: c?.right ?? bb.right, who: name(n as Element) });
        }
      }
      return out;
    };
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    // A bar's rule: a border, or an inset shadow drawn as a line (visible colour, no blur, no x offset, spread zero or
    // more; a negative y draws it along the bottom, a positive one along the top), which takes no layout height (the
    // palette's 40-px search row). A soft, outer, zero-y (a focus ring) or invisible shadow is not a rule.
    const clear = /rgba\([^)]*,\s*0\)$|^transparent$/;
    // Visible = the browser paints it with alpha > 0, in any colour syntax; a colour it cannot read paints nothing.
    const ink = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const visible = (c: string) => {
      if (!ink) return false;
      ink.clearRect(0, 0, 1, 1);
      ink.fillStyle = 'transparent';
      ink.fillStyle = c;
      ink.fillRect(0, 0, 1, 1);
      return (ink.getImageData(0, 0, 1, 1).data[3] ?? 0) > 0;
    };
    const LEN = /^-?\d*\.?\d+px$/;
    const rule = (st: CSSStyleDeclaration, side: 'Top' | 'Bottom') =>
      (px(st[`border${side}Width`]) > 0 && st[`border${side}Style`] !== 'none' && !clear.test(st[`border${side}Color`])) ||
      st.boxShadow.split(/,(?![^(]*\))/).some((sh) => {
        const parts = sh.trim().split(/\s+(?![^(]*\))/); // one shadow's tokens; a colour function stays whole
        const [x = 0, y = 0, blur = 0, spread = 0] = parts.filter((t) => LEN.test(t)).map(px);
        const color = parts.filter((t) => t !== 'inset' && !LEN.test(t)).join(' ');
        return parts.includes('inset') && visible(color) && x === 0 && blur === 0 && spread >= 0 && (side === 'Bottom' ? y < 0 : y > 0);
      });
    // A head bar (the Drawer head, the Sheet head, the flush Popover title bar, the palette's search row) centres its
    // line in a fixed-height bar with its own bottom rule, so its block padding is not a content inset: the surface is
    // measured from below it.
    const si = inner(surface);
    const head = [...surface.querySelectorAll('*')].find((e) => {
      const r = e.getBoundingClientRect();
      const st = cs(e);
      return shown(e) && r.top - si.top < 1 && r.left - si.left < 1 && si.right - r.right < 1 && r.height <= 80 && rule(st, 'Bottom');
    });
    // Its mirror, a foot bar (Drawer foot, Sheet foot, the Dialog save bar): full width at the bottom, its own top rule,
    // its buttons centred in it. The content is measured down to its top.
    const foot = [...surface.querySelectorAll('*')].find((e) => {
      const r = e.getBoundingClientRect();
      const st = cs(e);
      return shown(e) && si.bottom - r.bottom < 1 && r.left - si.left < 1 && si.right - r.right < 1 && r.height <= 96 && rule(st, 'Top');
    });

    for (const s of scrollers) s.scrollTop = 0;
    await frame();
    const i = inner(p);
    const atTop = collect(i);
    const edge = (xs: typeof atTop, k: 'top' | 'left' | 'right' | 'bottom', min: boolean) => xs.reduce((a, b) => ((min ? b[k] < a[k] : b[k] > a[k]) ? b : a));
    const tE = edge(atTop, 'top', true), lE = edge(atTop, 'left', true), rE = edge(atTop, 'right', false);
    const top = tE.top - (head ? head.getBoundingClientRect().bottom : i.top);
    const left = lE.left - i.left;
    const right = i.right - rE.right;

    // The content box as drawn (inner edge less the measured inset) for the field check.
    const content = { left: i.left + left, right: i.right - right };
    // A field spans its column: the content box, or the cell it sits in when the form lays out in columns (a grid with
    // more than one track, or a row of more than one item; a field beside its own button counts as its own column).
    const FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea, [role="searchbox"]';
    const columnOf = (f: Element) => {
      // Start from the field's own widget: the largest box around it that holds no other field (label, icon, clear).
      let w = f;
      while (w.parentElement && w.parentElement !== p && w.parentElement.querySelectorAll(FIELD).length === 1) w = w.parentElement;
      for (let a: Element | null = w; a && a !== p; a = a.parentElement) {
        const pa = a.parentElement;
        if (!pa || pa === p) break;
        if (cs(pa).display === 'contents') continue; // a focus holder with no box of its own
        const st = cs(pa);
        const grid = st.display.endsWith('grid') && st.gridTemplateColumns.trim().split(/\s+/).length > 1;
        const row = st.display.endsWith('flex') && !st.flexDirection.startsWith('column') && kids(pa).length > 1;
        if (grid || row) return cs(a).display === 'contents' ? null : a.getBoundingClientRect();
      }
      return null;
    };
    const fields = [...p.querySelectorAll(FIELD)]
      .filter(shown)
      .flatMap((f) => {
        // The visible field is the closest box with a border (the input itself or its wrapper).
        let e: Element | null = f;
        while (e && e !== p && !['Top', 'Left'].some((k) => px(cs(e as Element)[`border${k}Width` as 'borderTopWidth']) > 0)) e = e.parentElement;
        // No bordered box (a borderless field in a band, its icon inside): the field's own widget, the largest box that
        // holds this field and no other, is what reads as the field.
        let w: Element = f;
        while (w.parentElement && w.parentElement !== p && w.parentElement.querySelectorAll(FIELD).length === 1) w = w.parentElement;
        const bordered = !!e && e !== p;
        const fb = bordered && e ? e : w;
        const r = fb.getBoundingClientRect();
        const cell = columnOf(fb);
        const col = cell ?? content;
        const name = f.getAttribute('aria-label') ?? f.getAttribute('placeholder') ?? f.tagName.toLowerCase();
        // Short of its column fails. Past it fails too in a real column (into the gap beside it) and for a bordered field
        // (a drawn box poking into the padding); a borderless band (the palette's search row) may run to the inner edge.
        const off = (d: number) => (cell || bordered ? Math.abs(d) : d) > 1;
        return off(r.left - col.left) || off(col.right - r.right)
          ? [`"${name}" stops ${Math.round(r.left - col.left)} px from its column start and ${Math.round(col.right - r.right)} px from its end`]
          : [];
      });

    // Mid-scroll: how far each scroll area's visible bottom sits above the surface's inner bottom; the closest one
    // counts (a surface that scrolls itself runs its rows into its own border: 0).
    const scrollGap = scrollers.length
      ? Math.min(...scrollers.map((sc) => (sc === surface ? 0 : inner(surface).bottom - inner(sc).bottom)))
      : null;
    for (const sc of scrollers) sc.scrollTop = sc.scrollHeight;
    await frame();
    const atEnd = collect(inner(p));
    const bE = edge(atEnd, 'bottom', false);
    const bottom = (foot ? foot.getBoundingClientRect().top : inner(p).bottom) - bE.bottom;
    // A surface that fills the screen's height (a phone sheet, a drawer) may end in free space below its content.
    const fills = surface.getBoundingClientRect().height >= 0.9 * window.innerHeight;
    for (const sc of scrollers) sc.scrollTop = 0;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    return {
      pad: { top: r1(top), right: r1(right), bottom: r1(bottom), left: r1(left) },
      by: { top: tE.who, right: rE.who, bottom: bE.who, left: lE.who },
      fills,
      fields,
      scrollGap: scrollGap === null ? null : r1(scrollGap),
    };
  });
}

for (const width of [1024, 390]) {
  test.describe(`@spacing at ${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 768 } });
    for (const surface of SURFACES.filter((x) => (x.widths ?? [1024, 390]).includes(width))) {
      test(`@spacing ${surface.name} at ${width}: equal inner padding, full-width fields, no row flush with the bottom while scrolled`, async ({ page }) => {
        await gotoHub(page, surface.path);
        await surface.open?.(page);
        const box = surface.box(page);
        await expect(box, `${surface.name} is open`).toBeVisible();
        const g = await measure(box);
        test.info().annotations.push({ type: 'geometry', description: JSON.stringify(g) });
        await test.info().attach('surface', { body: await box.screenshot(), contentType: 'image/png' });
        const { top, right, bottom, left } = g.pad;
        const sides = g.fills ? [top, right, left] : [top, right, bottom, left];
        const said = `inner padding top/right/bottom/left ${top} / ${right} / ${bottom} / ${left} px, set by ${JSON.stringify(g.by)}`;
        expect(Math.max(...sides) - Math.min(...sides), said).toBeLessThanOrEqual(1);
        if (g.fills) expect(bottom, `${said}: the last row keeps at least the side padding below it`).toBeGreaterThanOrEqual(Math.min(top, right, left) - 1);
        expect(g.fields, 'every text field spans its column').toEqual([]);
        if (g.scrollGap !== null) expect(g.scrollGap, 'the scroll area stops short of the bottom edge').toBeGreaterThanOrEqual(Math.max(4, g.pad.left - 1));
      });
    }
  });
}

// The head-bar rule on fixtures (no Hub page): a bar ruled by a crisp inset shadow is a head, as a border is, and the
// top inset is measured from below it (8); any other shadow is not a rule, so the bar's own label marks the top edge.
test.describe('@spacing head rule', () => {
  const surfaceWith = (bar: string) => `<div id="s" style="width:320px;padding-bottom:8px;background:#fff;font:16px sans-serif">
    <div style="height:40px;padding:0 16px;display:flex;align-items:center;${bar}"><span>Search</span></div>
    <div style="padding:8px 8px 0"><div>Item</div></div></div>`;
  for (const [what, bar, top] of [
    ['a bottom border', 'border-bottom:1px solid #888', 8],
    ['an inset shadow line', 'box-shadow:inset 0 -1px 0 #888', 8],
    ['an inset line and a wider spread', 'box-shadow:inset 0 -1px 0 1px #888', 8],
    ['a soft inset shadow', 'box-shadow:inset 0 -1px 4px #888', 0],
    ['an outer shadow', 'box-shadow:0 -1px 0 #888', 0],
    ['a transparent inset line', 'box-shadow:inset 0 -1px 0 transparent', 0],
    ['an inset line at zero alpha', 'box-shadow:inset 0 -1px 0 rgba(136, 136, 136, 0)', 0],
    ['an inset line on the top edge', 'box-shadow:inset 0 1px 0 #888', 0],
    ['a sideways inset line', 'box-shadow:inset 2px -1px 0 #888', 0],
    ['an inset line with a negative spread', 'box-shadow:inset 0 -1px 0 -1px #888', 0],
    ['an inset line at half alpha', 'box-shadow:inset 0 -1px 0 rgba(136, 136, 136, 0.5)', 8],
    ['an inset line in a modern colour at zero alpha', 'box-shadow:inset 0 -1px 0 color(srgb 0 0 0 / 0)', 0],
    ['an inset line in oklch at zero alpha', 'box-shadow:inset 0 -1px 0 oklch(0.5 0 0 / 0)', 0],
    ['an inset focus ring (no y offset)', 'box-shadow:inset 0 0 0 2px #888', 0],
    ['a ring then an inset line', 'box-shadow:inset 0 0 0 2px rgba(136, 136, 136, 0.5), inset 0 -1px 0 rgba(136, 136, 136, 0.5)', 8],
    ['an inset line then a ring', 'box-shadow:inset 0 -1px 0 rgba(136, 136, 136, 0.5), inset 0 0 0 2px rgba(136, 136, 136, 0.5)', 8],
    ['a soft shadow and a ring', 'box-shadow:0 4px 8px rgba(0, 0, 0, 0.2), inset 0 0 0 2px rgba(136, 136, 136, 0.5)', 0],
  ] as const) {
    test(`@spacing a bar with ${what} ${top ? 'is' : 'is not'} a head`, async ({ page }) => {
      await page.setContent(surfaceWith(bar));
      const g = await measure(page.locator('#s'));
      if (top) expect(g.pad.top, JSON.stringify(g)).toBe(top);
      else expect(g.by.top, `${JSON.stringify(g)}: the bar is content, its label sets the top`).toBe('span.');
    });
  }
});

// Its mirror: a foot bar ruled along its top edge.
test.describe('@spacing foot rule', () => {
  const surfaceWith = (bar: string) => `<div id="s" style="width:320px;padding-top:8px;background:#fff;font:16px sans-serif">
    <div style="padding:0 8px 8px"><div>Item</div></div>
    <div style="height:48px;padding:0 16px;display:flex;align-items:center;${bar}"><span>Save</span></div></div>`;
  for (const [what, bar, bottom] of [
    ['a top border', 'border-top:1px solid #888', 8],
    ['an inset line on the top edge', 'box-shadow:inset 0 1px 0 #888', 8],
    ['an inset line on the bottom edge', 'box-shadow:inset 0 -1px 0 #888', 0],
    ['a soft inset shadow', 'box-shadow:inset 0 1px 4px #888', 0],
    ['an inset line in a modern colour at zero alpha', 'box-shadow:inset 0 1px 0 color(srgb 0 0 0 / 0)', 0],
  ] as const) {
    test(`@spacing a bar with ${what} ${bottom ? 'is' : 'is not'} a foot`, async ({ page }) => {
      await page.setContent(surfaceWith(bar));
      const g = await measure(page.locator('#s'));
      if (bottom) expect(g.pad.bottom, JSON.stringify(g)).toBe(bottom);
      else expect(g.by.bottom, `${JSON.stringify(g)}: the bar is content, its label sets the bottom`).toBe('span.');
    });
  }
});
