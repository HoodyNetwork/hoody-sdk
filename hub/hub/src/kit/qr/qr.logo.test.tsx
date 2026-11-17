// Vitest: every QR code shows its mark in the middle and still
// scans, with margin. Each code is drawn by
// the real QrCode, its SVG painted to pixels here (rects, the module path and the logo's evenodd path, at the module
// scales the pages show), and read back by an independent decoder (jsQR). The mark sits on a cleared square that the
// qrcode library's own map of reserved modules (finders, timing, alignment, format, version) never reaches; text that
// needs a code past version 12 at level H (too dense) gets level M and no mark. From version 7 the mark covers the centre
// alignment pattern, which a reader does not need (it finds the code by its finders and the bottom right pattern).
import { render } from '@testing-library/react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { Icon } from '../icons';
import { BOT_LOGO_PATH, LOGO_PATH, QrCode, type QrLogoKind } from './Qr';
import { LOGO_SIDE, qrMatrix, qrTextMatrix, standInMatrix, type QrMatrix } from './qr';

// ── a tiny SVG painter for what QrCode draws ───────────────────────────────────────

type Shape = { kind: 'rect'; x: number; y: number; w: number; h: number } | { kind: 'path'; rects: Rect[]; polys: Poly[]; evenodd: boolean; cells?: Set<number> };
type Poly = [number, number][];
type Rect = [number, number, number, number];
/** One nested svg: a point of its outer box goes to v + ((p - o) * vs) / s in its own units, per axis. */
interface Step { vx: number; ox: number; vw: number; w: number; vy: number; oy: number; vh: number; h: number }
/** The same chain folded to x' = ax * x + bx, y' = ay * y + by: used only to find which pixels a layer can reach. */
interface Affine { ax: number; bx: number; ay: number; by: number }
interface Layer { fill: string; shape: Shape; steps: Step[]; map: Affine }

/** The closed outlines of the path commands QrCode uses (M, h, v, H, V, z/Z; absolute M, H, V, relative h/v), and the
 *  bounding rect of each (the module path is all unit squares; the B's outlines are not rectangles). */
function pathShapes(d: string): { rects: Rect[]; polys: Poly[] } {
  const out: Rect[] = [];
  const polys: Poly[] = [];
  const re = /([MhvHVzZ])\s*([-\d.]*)\s*([-\d.]*)/g;
  let x = 0, y = 0, pts: [number, number][] = [];
  const close = () => {
    if (pts.length >= 4) {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      out.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
      polys.push(pts);
    }
    pts = [];
  };
  for (const m of d.matchAll(re)) {
    const [, c, a, b] = m;
    if (c === 'M') { close(); x = Number(a); y = Number(b); pts.push([x, y]); }
    else if (c === 'h') { x += Number(a); pts.push([x, y]); }
    else if (c === 'v') { y += Number(a); pts.push([x, y]); }
    else if (c === 'H') { x = Number(a); pts.push([x, y]); }
    else if (c === 'V') { y = Number(a); pts.push([x, y]); }
    else if (c === 'z' || c === 'Z') close();
  }
  close();
  return { rects: out, polys };
}

/** Crossings of a ray from (x, y) to the right with an outline (its edges are axis-aligned). */
function crossings(poly: Poly, x: number, y: number): number {
  let n = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i]!;
    const [bx, by] = poly[(i + 1) % poly.length]!;
    if (ay > y !== by > y && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) n++;
  }
  return n;
}

function layersOf(svg: SVGSVGElement): { side: number; layers: Layer[] } {
  const side = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
  const layers: Layer[] = [];
  const walk = (el: Element, steps: Step[], map: Affine) => {
    for (const k of Array.from(el.children)) {
      if (k.tagName === 'rect') {
        layers.push({ fill: k.getAttribute('fill')!, steps, map, shape: { kind: 'rect', x: Number(k.getAttribute('x') ?? 0), y: Number(k.getAttribute('y') ?? 0), w: Number(k.getAttribute('width')), h: Number(k.getAttribute('height')) } });
      } else if (k.tagName === 'path') {
        const { rects, polys } = pathShapes(k.getAttribute('d')!);
        // The module path is all whole 1 × 1 squares: looked up by cell, not scanned per pixel.
        const unit = rects.every(([a, b, c, d]) => c - a === 1 && d - b === 1 && Number.isInteger(a) && Number.isInteger(b));
        const cells = unit ? new Set(rects.map(([a, b]) => b * 4096 + a)) : undefined;
        layers.push({ fill: k.getAttribute('fill')!, steps, map, shape: { kind: 'path', rects, polys, evenodd: k.getAttribute('fill-rule') === 'evenodd', cells } });
      } else if (k.tagName === 'svg') {
        const [vx, vy, vw, vh] = k.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];
        const ox = Number(k.getAttribute('x')), oy = Number(k.getAttribute('y')), w = Number(k.getAttribute('width')), h = Number(k.getAttribute('height'));
        const sx = vw / w, sy = vh / h;
        walk(k, [...steps, { vx, ox, vw, w, vy, oy, vh, h }], { ax: map.ax * sx, bx: vx + (map.bx - ox) * sx, ay: map.ay * sy, by: vy + (map.by - oy) * sy });
      } else walk(k, steps, map);
    }
  };
  walk(svg, [], { ax: 1, bx: 0, ay: 1, by: 0 });
  return { side, layers };
}

const inside = (s: Shape, x: number, y: number) => {
  if (s.kind === 'rect') return x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h;
  if (s.cells) return s.cells.has(Math.floor(y) * 4096 + Math.floor(x));
  // Even-odd over all outlines; for the nonzero rule each outline counts on its own (none of them overlap).
  if (s.evenodd) return s.polys.reduce((n, p) => n + crossings(p, x, y), 0) % 2 === 1;
  return s.polys.some((p) => crossings(p, x, y) % 2 === 1);
};

/** The layer's bounds in its own units: a point outside them is never inside the shape. */
function bounds(s: Shape): Rect {
  if (s.kind === 'rect') return [s.x, s.y, s.x + s.w, s.y + s.h];
  if (!s.rects.length) return [0, 0, -1, -1];
  return [Math.min(...s.rects.map((r) => r[0])), Math.min(...s.rects.map((r) => r[1])), Math.max(...s.rects.map((r) => r[2])), Math.max(...s.rects.map((r) => r[3]))];
}

/** The pixel indexes in [0, n) whose centre (k + 0.5) / px the map a * c + b can bring into [lo, hi]: the inverse,
 *  widened by one pixel each side against rounding (inside() still decides). QrCode only nests svgs with positive
 *  finite scales; anything else is a painter error, not a code to read. */
function reach(a: number, b: number, lo: number, hi: number, px: number, n: number): [number, number] {
  if (!(a > 0) || !Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`painter: nested svg scale ${a}, offset ${b}`);
  const k0 = Math.ceil(((lo - b) / a) * px - 0.5) - 1, k1 = Math.floor(((hi - b) / a) * px - 0.5) + 1;
  return [Math.max(0, k0), Math.min(n - 1, k1)];
}

/** RGBA pixels of the drawn code at `px` pixels per module. Layers are painted in document order, each over the pixels
 *  its bounds reach only, and a later layer wins where it covers a pixel, as in the SVG. A pixel centre is taken into
 *  the layer's units step by step, nested svg by nested svg, so every inside() test sees the same number as before. */
function paint(svg: SVGSVGElement, px: number): { data: Uint8ClampedArray; w: number } {
  const { side, layers } = layersOf(svg);
  const w = Math.round(side * px);
  const dark = new Uint8Array(w * w);
  for (const l of layers) {
    const { ax, bx, ay, by } = l.map;
    const [x0, y0, x1, y1] = bounds(l.shape);
    const [i0, i1] = reach(ax, bx, x0, x1, px, w), [j0, j1] = reach(ay, by, y0, y1, px, w);
    const lx = (i: number) => l.steps.reduce((x, t) => t.vx + ((x - t.ox) * t.vw) / t.w, (i + 0.5) / px);
    const ly = (j: number) => l.steps.reduce((y, t) => t.vy + ((y - t.oy) * t.vh) / t.h, (j + 0.5) / px);
    const xs = new Float64Array(Math.max(0, i1 - i0 + 1));
    for (let i = i0; i <= i1; i++) xs[i - i0] = lx(i);
    const ink = luminance(l.fill) < 0.5 ? 1 : 0;
    for (let j = j0; j <= j1; j++) {
      const y = ly(j);
      for (let i = i0; i <= i1; i++) if (inside(l.shape, xs[i - i0]!, y)) dark[j * w + i] = ink;
    }
  }
  const data = new Uint8ClampedArray(w * w * 4);
  for (let p = 0; p < w * w; p++) {
    const v = dark[p] ? 0 : 255, o = p * 4;
    data[o] = data[o + 1] = data[o + 2] = v;
    data[o + 3] = 255;
  }
  return { data, w };
}
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const n = (k: number) => parseInt(h.slice(k, k + 2), 16) / 255;
  return 0.2126 * n(0) + 0.7152 * n(2) + 0.0722 * n(4);
}

function drawn(m: QrMatrix, theme?: 'light' | 'dark', logo: QrLogoKind = 'hoody'): SVGSVGElement {
  if (theme) document.documentElement.dataset.theme = theme;
  const { container } = render(<QrCode matrix={m} label="code" logo={logo} />);
  return container.querySelector('svg')!;
}

// The px per module the pages show: popover 240, sheet 280, large 440, Share 200 (CSS px; boxes include the quiet zone).
const BOXES = [200, 240, 280, 440];

const URLS = {
  short: 'https://hoody.com/x',
  program: 'https://5d1c0a9e3b7f2468ace13579-b2d4f6a8c0e1357924680ace-terminal-1.node7.computers.hoody.com/?t=4f2a9c',
  bot: 'https://quiet-amber-heron-bot.hoody.bot',
  long: `https://5d1c0a9e3b7f2468ace13579-b2d4f6a8c0e1357924680ace-files-1.node12.computers.hoody.com/folder/sub/${'x'.repeat(60)}?token=abcdef0123456789`,
};

/** The longest https address that still gets a mark (version 12 at level H): found, not assumed. */
const LONGEST_MARKED = (() => {
  let best = '';
  for (let n = 1; n < 400; n++) {
    const u = `https://${'a'.repeat(n)}`;
    if (qrMatrix(u)?.logo) best = u;
  }
  return best;
})();
/** Short, medium and the longest marked text, plus the real address shapes. */
/** A computer program's address as the Hub builds it (two 24-hex ids, the program, the server, the proxy domain), at
 *  the longest shapes a real one takes: the longest program name, a long server name, a desktop's environment query. */
const KEY_ADDRESSES = {
  terminal: 'https://5d1c0a9e3b7f2468ace13579-b2d4f6a8c0e1357924680ace-terminal-1.quiet-amber-heron-1234-fra.computers.hoody.com',
  notifications: 'https://5d1c0a9e3b7f2468ace13579-b2d4f6a8c0e1357924680ace-notifications-1.quiet-amber-heron-1234-fra.computers.hoody.com',
  longServer: 'https://5d1c0a9e3b7f2468ace13579-b2d4f6a8c0e1357924680ace-notifications-1.quiet-amber-heron-1234-fra.computers.hoody.com',
  desktop: 'https://5d1c0a9e3b7f2468ace13579-b2d4f6a8c0e1357924680ace-desktop-9.quiet-amber-heron-1234-fra.computers.hoody.com/?desktop_env=xfce',
};
const MARKED = { short: URLS.short, medium: 'https://hub.hoody.com/k/7f3a9c41', program: URLS.program, bot: URLS.bot, ...KEY_ADDRESSES, longest: LONGEST_MARKED };
const LOGOS: QrLogoKind[] = ['hoody', 'bot'];

/** A seeded generator, so a run with flipped modules is the same every time. */
function rng(seed: number) {
  let v = seed >>> 0;
  return () => {
    v = (v * 1664525 + 1013904223) >>> 0;
    return v / 2 ** 32;
  };
}
/** `m` with `share` of its data modules (not reserved, not in the mark's square) flipped, chosen by `seed`. */
function flipped(text: string, m: QrMatrix, share: number, seed: number): QrMatrix {
  const ref = QRCode.create(text, { errorCorrectionLevel: 'H' }).modules;
  const n = m.size;
  const rand = rng(seed);
  const flip = new Set<number>();
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const sq = m.logo!;
      const inLogo = r >= sq.at && r < sq.at + sq.side && c >= sq.at && c < sq.at + sq.side;
      if (!inLogo && !ref.reservedBit[r * n + c] && rand() < share) flip.add(r * n + c);
    }
  return { ...m, dark: (r, c) => (flip.has(r * n + c) ? !m.dark(r, c) : m.dark(r, c)) };
}

describe('the Hoody mark in every code, and every code still scans', () => {
  it('a code that fits version 12 at level H carries the mark; up to version 6 no reserved module lies under it, from 7 only the centre alignment pattern', () => {
    // The logo sides, written out here (not read from LOGO_SIDE), so a revert of the table fails.
    const SIDES: Record<number, number> = { 2: 7, 3: 7, 4: 9, 5: 13, 6: 15, 7: 11, 8: 13, 9: 13, 10: 15, 11: 15, 12: 17 };
    // One https address per version 2..12 at level H, found by length, plus the page's own short and Bot addresses.
    const byVersion = new Map<number, string>();
    for (let k = 1; byVersion.size < 11 && k < 300; k++) {
      const url = `https://h.co/${'a'.repeat(k)}`;
      const v = QRCode.create(url, { errorCorrectionLevel: 'H' }).version;
      if (v >= 2 && v <= 12 && !byVersion.has(v)) byVersion.set(v, url);
    }
    expect([...byVersion.keys()].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const url of [...byVersion.values(), URLS.short, URLS.bot, ...Object.values(KEY_ADDRESSES)]) {
      const m = qrMatrix(url)!;
      expect(m.logo, url).toBeTruthy();
      const ref = QRCode.create(url, { errorCorrectionLevel: 'H' });
      expect(m.size).toBe(ref.modules.size);
      expect(ref.version).toBeLessThanOrEqual(12);
      const { at, side } = m.logo!;
      // Centred, odd, the version's side from the table (never over 14% of the modules).
      expect(at * 2 + side).toBe(m.size);
      expect(side % 2).toBe(1);
      expect(side, `v${ref.version}`).toBe(SIDES[ref.version]);
      expect(LOGO_SIDE[ref.version]).toBe(SIDES[ref.version]);
      expect((side * side) / (m.size * m.size)).toBeLessThanOrEqual(0.14);
      const n = m.size;
      for (let r = at; r < at + side; r++)
        for (let c = at; c < at + side; c++) {
          // A reserved module under the mark: none up to version 6; from 7 only alignment modules, 11 or more from every
          // edge (finders, separators, format and version blocks and the timing rows all lie nearer).
          if (ref.version <= 6) expect(ref.modules.reservedBit[r * n + c]).toBeFalsy();
          else if (ref.modules.reservedBit[r * n + c]) expect(Math.min(r, c, n - 1 - r, n - 1 - c)).toBeGreaterThanOrEqual(11);
          expect(m.dark(r, c)).toBe(false);
        }
    }
  });

  it('every computer program address a person can be shown (the longest shapes too) carries the mark', () => {
    for (const url of Object.values(KEY_ADDRESSES)) {
      expect(url.length).toBeGreaterThan(90);
      const m = qrMatrix(url)!;
      expect(m.logo, url).toBeTruthy();
      expect(drawn(m).querySelector('svg svg'), url).not.toBeNull();
    }
  });

  it('a version 1 code gets level M and no mark (its centred square reaches the reserved module at row 8, column 8)', () => {
    const text = 'abc';
    expect(QRCode.create(text, { errorCorrectionLevel: 'H' }).version).toBe(1);
    const ref = QRCode.create(text, { errorCorrectionLevel: 'M' });
    expect(ref.modules.reservedBit[8 * ref.modules.size + 8]).toBeTruthy();
    const m = qrTextMatrix(text)!;
    expect(m.logo).toBeNull();
    expect(m.size).toBe(ref.modules.size);
    for (let r = 0; r < m.size; r++)
      for (let c = 0; c < m.size; c++) expect(m.dark(r, c)).toBe(ref.modules.data[r * m.size + c] === 1);
  });

  it('every code decodes to its exact text (short, medium, longest marked, real shapes), with the mark and with the B, at every size the pages show, in both themes', { timeout: 480_000 }, () => {
    expect(LONGEST_MARKED.length).toBeGreaterThan(140);
    expect(qrMatrix(`${LONGEST_MARKED}a`)?.logo ?? null).toBeNull();
    for (const theme of ['light', 'dark'] as const)
      for (const logo of LOGOS)
        for (const url of [...Object.values(MARKED), URLS.long]) {
          const m = qrMatrix(url)!;
          const svg = drawn(m, theme, logo);
          for (const box of BOXES) {
            const px = box / (m.size + 8);
            const { data, w } = paint(svg, px);
            const got = jsQR(data, w, w);
            expect(got?.data, `${url} at ${box}px, ${theme}, ${logo}`).toBe(url);
          }
        }
  });

  it('text past version 12 at level H gets level M and no mark, and still decodes', () => {
    expect(QRCode.create(URLS.long, { errorCorrectionLevel: 'H' }).version).toBeGreaterThan(12);
    const m = qrMatrix(URLS.long)!;
    expect(m.logo).toBeNull();
    expect(m.size).toBe(QRCode.create(URLS.long, { errorCorrectionLevel: 'M' }).modules.size);
    const svg = drawn(m);
    expect(svg.querySelector('svg svg')).toBeNull();
    const { data, w } = paint(svg, 6);
    expect(jsQR(data, w, w)?.data).toBe(URLS.long);
  });

  it('a text code (a hand-over message) follows the same rule', () => {
    const short = 'Hoody: open https://hoody.com';
    const m = qrTextMatrix(short)!;
    expect(m.logo).toBeTruthy();
    const { data, w } = paint(drawn(m), 6);
    expect(jsQR(data, w, w)?.data).toBe(short);
    const long = 'Hoody shared access: Studio\nOpen https://hub.hoody.com and paste this whole message.\nToken: hdy_' + 'a1'.repeat(60);
    const l = qrTextMatrix(long)!;
    expect(l.logo).toBeNull();
    const p = paint(drawn(l), 6);
    expect(jsQR(p.data, p.w, p.w)?.data).toBe(long);
  });

  it('the mark is the kit logo, drawn in the code ink with a light ring, inside the quiet zone', () => {
    const { container } = render(<Icon name="logo" />);
    expect(container.querySelector('path')!.getAttribute('d')).toBe(LOGO_PATH);
    const m = qrMatrix(URLS.short)!;
    const svg = drawn(m);
    const nested = svg.querySelector('svg svg')!;
    const quiet = 4;
    expect(Number(nested.getAttribute('x'))).toBeGreaterThan(m.logo!.at + quiet);
    expect(Number(nested.getAttribute('x')) + Number(nested.getAttribute('width'))).toBeLessThan(m.logo!.at + m.logo!.side + quiet);
    expect(nested.querySelector('path')!.getAttribute('fill')).toBe(svg.querySelector('path')!.getAttribute('fill'));
  });

  it('the hidden stand-in code wears the same mark', () => {
    const m = standInMatrix();
    expect(m.logo).toBeTruthy();
    expect(drawn(m).querySelector('svg svg')).not.toBeNull();
  });

  it('margin: every marked version still decodes in at least 30 of 40 runs with 1% of its data modules flipped (the weakest size), mark and B', { timeout: 1_200_000 }, () => {
    // One text per version that gets a mark (2 to 12; https never fits version 1 at level H).
    const byVersion = new Map<number, string>();
    for (let n = 1; n < 400; n++) {
      const u = `https://${'a'.repeat(n)}`;
      const m = qrMatrix(u);
      if (!m?.logo) continue;
      byVersion.set((m.size - 17) / 4, u);
    }
    expect([...byVersion.keys()].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const [version, text] of byVersion)
      for (const logo of LOGOS) {
        const m = qrMatrix(text)!;
        let ok = 0;
        for (let seed = 1; seed <= 20; seed++) {
          const svg = drawn(flipped(text, m, 0.01, seed * 7919 + version), undefined, logo);
          for (const box of [240, 440]) {
            const { data, w } = paint(svg, box / (m.size + 8));
            if (jsQR(data, w, w)?.data === text) ok++;
          }
        }
        // 30 of 40: what an 8% share leaves its weakest code (version 4, side 9) on the same runs.
        expect(ok, `version ${version} (side ${m.logo!.side}), ${logo}: runs that decode`).toBeGreaterThanOrEqual(30);
      }
  });

  it('the B is the Bot logo file\'s own path, a square in the code ink with the B in its ground, inside the ring', () => {
    expect(BOT_LOGO_PATH).toBe('M17 20H7V17H17V20ZM7 10H17V13H7V17H4V4H7V10ZM20 17H17V13H20V17Z');
    const m = qrMatrix(URLS.bot)!;
    const svg = drawn(m, undefined, 'bot');
    const nested = svg.querySelector('svg svg')!;
    expect(nested.getAttribute('viewBox')).toBe('0 0 24 24');
    const ink = svg.querySelector('path')!.getAttribute('fill');
    const ground = svg.querySelector('rect')!.getAttribute('fill');
    expect(nested.querySelector('rect')!.getAttribute('fill')).toBe(ink);
    expect(nested.querySelector('path')!.getAttribute('d')).toBe(BOT_LOGO_PATH);
    expect(nested.querySelector('path')!.getAttribute('fill')).toBe(ground);
    const quiet = 4;
    expect(Number(nested.getAttribute('x'))).toBeGreaterThan(m.logo!.at + quiet);
    expect(Number(nested.getAttribute('x')) + Number(nested.getAttribute('width'))).toBeLessThan(m.logo!.at + m.logo!.side + quiet);
    // The default stays the Hoody mark.
    expect(drawn(m).querySelector('svg svg')!.getAttribute('viewBox')).toBe('1 1 22 22');
  });

  it('control: the painter feeds the decoder what is drawn (a square far over the budget does not read back)', () => {
    const url = URLS.short;
    const m = qrMatrix(url)!;
    const side = m.size - 14 - ((m.size - 14) % 2 === 0 ? 1 : 0);
    const at = (m.size - side) / 2;
    const over: QrMatrix = { ...m, logo: { at, side }, dark: (r, c) => !(r >= at && r < at + side && c >= at && c < at + side) && m.dark(r, c) };
    const { data, w } = paint(drawn(over), 6);
    expect(jsQR(data, w, w)?.data).not.toBe(url);
  });
});

