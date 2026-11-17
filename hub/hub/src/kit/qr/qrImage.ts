// The modules of a QR code that reached the Hub only as an image (the API's 2FA setup answer carries a PNG data URL of
// the otpauth address, never the address itself). Read back from the pixels, not decoded as a QR: the image is a clean
// rendering (square modules of one size, whole pixels or not, on a light quiet zone), so sampling each module's centre
// gives the exact matrix the server drew. Anything that does not read as such a rendering (no three finder patterns or
// timing lines where they must be, a size that is not 17 + 4v, a module too small to sample safely, a format this
// reader does not handle) gives null, and the caller shows the manual key.
// Pure (no DOM, no node imports): PNG data is inflated with the runtime's DecompressionStream, so the reader is async.
import type { QrMatrix } from './qr';

const B64 = /^data:image\/(png|svg\+xml);base64,([A-Za-z0-9+/=]+)$/;

/** The matrix of a `data:image/png|svg+xml;base64,…` QR image, or null when it does not read as a clean code. */
export async function qrImageMatrix(src: string | null | undefined): Promise<QrMatrix | null> {
  const m = B64.exec(src ?? '');
  if (!m) return null;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(m[2]!), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  try {
    const grid = m[1] === 'png' ? await pngGrid(bytes) : svgGrid(new TextDecoder().decode(bytes));
    return grid ? sample(grid) : null;
  } catch {
    return null;
  }
}

/** A dark/light pixel grid. */
interface Grid {
  w: number;
  h: number;
  dark: (x: number, y: number) => boolean;
}

/** The largest code (version 40). */
const MAX_SIZE = 177;
/** A module that is not a whole number of pixels is read only from this many pixels up: its centre is then at least
 *  two pixels from every edge, and the image's rounding moves an edge by less than one. */
const MIN_FRACTIONAL_PX = 4;

/**
 * The modules from a pixel grid. The dark bounding box is the code (its three finders reach the left, top, right and
 * bottom edges), so a code of `size` modules has `width / size` pixels per module, whole or not: the API draws its
 * 2FA code at a fixed image width, which gives a fractional module (300 px over 45 modules and margins). The size is
 * not guessed from one measurement: every QR size whose module fits the finder's top edge (7 modules) is sampled at
 * its module centres and must show the three finders, their light separators and both timing lines (dark and light
 * by turns between the finders). Exactly one size may pass; none or two is not a clean code.
 */
export function sample(g: Grid): QrMatrix | null {
  let x0 = g.w, y0 = g.h, x1 = -1, y1 = -1;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.dark(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return null;
  let run = 0;
  while (x0 + run <= x1 && g.dark(x0 + run, y0)) run++;
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  if (Math.abs(width - height) > 2) return null;
  let found: QrMatrix | null = null;
  for (let size = 21; size <= MAX_SIZE; size += 4) {
    const px = width / size;
    const py = height / size;
    if (px < 1 || py < 1) break;
    if (Math.abs(run - 7 * px) > 1.5) continue;
    if (!(Number.isInteger(px) && py === px) && (px < MIN_FRACTIONAL_PX || py < MIN_FRACTIONAL_PX)) continue;
    const m = modulesAt(g, x0, y0, px, py, size);
    if (!m) continue;
    if (found) return null;
    found = m;
  }
  return found;
}

/** The grid read as a code of `size` modules of `px` × `py` pixels from (`x0`, `y0`), or null when the fixed parts of
 *  a QR code are not where that size has them. */
function modulesAt(g: Grid, x0: number, y0: number, px: number, py: number, size: number): QrMatrix | null {
  const bits: boolean[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) bits.push(g.dark(Math.floor(x0 + (c + 0.5) * px), Math.floor(y0 + (r + 0.5) * py)));
  const at = (r: number, c: number) => bits[r * size + c] === true;
  // The three finder patterns, ring and core, and the light line that separates each from the rest.
  const finderOk = (fr: number, fc: number) => {
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
      const r = fr + y, c = fc + x;
      if (r < 0 || c < 0 || r >= size || c >= size) continue;
      const inside = y >= 0 && y <= 6 && x >= 0 && x <= 6;
      const want = inside && (y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4));
      if (at(r, c) !== want) return false;
    }
    return true;
  };
  if (!finderOk(0, 0) || !finderOk(0, size - 7) || !finderOk(size - 7, 0)) return null;
  // The timing lines: row 6 and column 6 between the finders, dark on even modules.
  for (let i = 8; i < size - 8; i++) if (at(6, i) !== (i % 2 === 0) || at(i, 6) !== (i % 2 === 0)) return null;
  return { size, dark: at, logo: null };
}

/** The SVG forms a code is drawn in here: unit-square or `h`-run subpaths (`M x y h w v 1 h -w z`) of one path, on a
 *  light ground. Each closed subpath must be an axis-aligned rectangle; anything else is not read. */
function svgGrid(svg: string): Grid | null {
  const vb = /viewBox="\s*(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
  const d = /<path[^>]*\sd="([^"]+)"/.exec(svg);
  if (!vb || !d) return null;
  const [ox, oy, w, h] = [Number(vb[1]), Number(vb[2]), Number(vb[3]), Number(vb[4])];
  if (!Number.isInteger(w) || !Number.isInteger(h) || w > 400 || h > 400) return null;
  const fill = new Uint8Array(w * h);
  const tokens = d[1]!.match(/[MmHhVvZz]|-?[\d.]+/g) ?? [];
  let i = 0, x = 0, y = 0;
  let pts: [number, number][] = [];
  const num = () => Number(tokens[i++]);
  const close = () => {
    if (pts.length < 4) { pts = []; return true; }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const [ax, bx, ay, by] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if (pts.some((p) => (p[0] !== ax && p[0] !== bx) || (p[1] !== ay && p[1] !== by))) return false;
    for (let yy = ay; yy < by; yy++) for (let xx = ax; xx < bx; xx++) {
      const gx = xx - ox, gy = yy - oy;
      if (gx >= 0 && gy >= 0 && gx < w && gy < h) fill[gy * w + gx] = 1;
    }
    pts = [];
    return true;
  };
  while (i < tokens.length) {
    const t = tokens[i++]!;
    if (t === 'M' || t === 'm') { if (!close()) return null; x = t === 'M' ? num() : x + num(); y = t === 'M' ? num() : y + num(); pts = [[x, y]]; }
    else if (t === 'H' || t === 'h') { x = t === 'H' ? num() : x + num(); pts.push([x, y]); }
    else if (t === 'V' || t === 'v') { y = t === 'V' ? num() : y + num(); pts.push([x, y]); }
    else if (t === 'Z' || t === 'z') { if (!close()) return null; }
    else return null;
  }
  if (!close()) return null;
  return { w, h, dark: (px, py) => fill[py * w + px] === 1 };
}

/** An 8-bit PNG (grey, RGB, palette, grey + alpha, RGBA; not interlaced) as a dark/light grid (luminance < 50%,
 *  transparent = light). */
async function pngGrid(b: Uint8Array): Promise<Grid | null> {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (sig.some((v, i) => b[i] !== v)) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (p + 8 <= b.length) {
    const len = dv.getUint32(p);
    const kind = String.fromCharCode(b[p + 4]!, b[p + 5]!, b[p + 6]!, b[p + 7]!);
    const data = b.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); depth = b[p + 16]!; type = b[p + 17]!; interlace = b[p + 20]!; }
    else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!w || !h || w > 4096 || h > 4096 || depth !== 8 || interlace !== 0 || !channels || (type === 3 && !palette)) return null;
  const zipped = new Uint8Array(idat.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of idat) { zipped.set(c, o); o += c.length; }
  const raw = new Uint8Array(await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const stride = w * channels;
  if (raw.length < h * (stride + 1)) return null;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = px.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels]! : 0;
      const u = up ? up[i]! : 0;
      const c = up && i >= channels ? up[i - channels]! : 0;
      let v = src[i]!;
      if (f === 1) v += a;
      else if (f === 2) v += u;
      else if (f === 3) v += (a + u) >> 1;
      else if (f === 4) { const pa = Math.abs(u - c), pb = Math.abs(a - c), pc = Math.abs(a + u - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      else if (f !== 0) return null;
      row[i] = v & 255;
    }
  }
  const lum = (x: number, y: number): [number, number] => {
    const i = y * stride + x * channels;
    if (type === 0) return [px[i]!, 255];
    if (type === 4) return [px[i]!, px[i + 1]!];
    if (type === 3) { const k = px[i]!; const l = (palette![k * 3]! * 299 + palette![k * 3 + 1]! * 587 + palette![k * 3 + 2]! * 114) / 1000; return [l, trns && k < trns.length ? trns[k]! : 255]; }
    const l = (px[i]! * 299 + px[i + 1]! * 587 + px[i + 2]! * 114) / 1000;
    return [l, type === 6 ? px[i + 3]! : 255];
  };
  return { w, h, dark: (x, y) => { const [l, a] = lum(x, y); return a >= 128 && l < 128; } };
}
